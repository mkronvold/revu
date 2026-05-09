import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  authChangePasswordResponseSchema,
  authLoginResponseSchema,
  authMeResponseSchema,
  deleteEmployeeResponseSchema,
  employeeResponseSchema,
  employeesListResponseSchema,
  localUsersExportResponseSchema,
  localUsersImportResponseSchema,
  resetEmployeePasswordResponseSchema,
  setEmployeePasswordResponseSchema,
} from "@revu/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../apps/api/src/app.js";

describe("auth and employee admin API", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function createApp() {
    const app = buildApp();
    apps.push(app);
    await app.ready();
    return app;
  }

  async function login(app: ReturnType<typeof buildApp>, username: string, password: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username, password },
    });

    return response;
  }

  it("supports local username/password auth with session inspection and logout", async () => {
    const app = await createApp();

    const loginResponse = await login(app, "ada.admin", "AdminPass123!");
    expect(loginResponse.statusCode).toBe(200);

    const loginPayload = authLoginResponseSchema.parse(loginResponse.json());
    expect(loginPayload.session.user.role).toBe("admin");
    expect(loginPayload.session.passwordResetRequired).toBe(false);
    expect(loginPayload.session.permissions).toContain("employees:create");

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${loginPayload.session.token}`,
      },
    });

    expect(meResponse.statusCode).toBe(200);
    const mePayload = authMeResponseSchema.parse(meResponse.json());
    expect(mePayload.session.user.username).toBe("ada.admin");
    expect(mePayload.session.passwordResetRequired).toBe(false);

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: {
        authorization: `Bearer ${loginPayload.session.token}`,
      },
    });

    expect(logoutResponse.statusCode).toBe(200);

    const afterLogoutResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${loginPayload.session.token}`,
      },
    });

    expect(afterLogoutResponse.statusCode).toBe(401);
  });

  it("enforces RBAC while supporting employee CRUD and admin password flows", async () => {
    const app = await createApp();

    const unauthenticatedListResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employees",
    });
    expect(unauthenticatedListResponse.statusCode).toBe(401);

    const employeeLogin = authLoginResponseSchema.parse((await login(app, "elliot.employee", "EmployeePass123!")).json());
    const employeeListResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employees",
      headers: {
        authorization: `Bearer ${employeeLogin.session.token}`,
      },
    });
    expect(employeeListResponse.statusCode).toBe(403);

    const employeeUpdateResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/employees/44444444-4444-4444-8444-444444444444",
      headers: {
        authorization: `Bearer ${employeeLogin.session.token}`,
      },
      payload: {
        fullName: "No Access",
      },
    });
    expect(employeeUpdateResponse.statusCode).toBe(403);

    const managerLogin = authLoginResponseSchema.parse((await login(app, "manny.manager", "ManagerPass123!")).json());
    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employees",
      headers: {
        authorization: `Bearer ${managerLogin.session.token}`,
      },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(employeesListResponseSchema.parse(listResponse.json()).items.length).toBeGreaterThanOrEqual(4);

    const managerUpdateResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/employees/44444444-4444-4444-8444-444444444444",
      headers: {
        authorization: `Bearer ${managerLogin.session.token}`,
      },
      payload: {
        managerId: "11111111-1111-4111-8111-111111111111",
        assessorId: "33333333-3333-4333-8333-333333333333",
      },
    });
    expect(managerUpdateResponse.statusCode).toBe(200);
    const managerUpdatedEmployee = employeeResponseSchema.parse(managerUpdateResponse.json()).item;
    expect(managerUpdatedEmployee.managerId).toBe("11111111-1111-4111-8111-111111111111");
    expect(managerUpdatedEmployee.assessorId).toBe("33333333-3333-4333-8333-333333333333");

    const forbiddenManagerRoleChange = await app.inject({
      method: "PATCH",
      url: "/api/v1/employees/33333333-3333-4333-8333-333333333333",
      headers: {
        authorization: `Bearer ${managerLogin.session.token}`,
      },
      payload: {
        role: "manager",
      },
    });
    expect(forbiddenManagerRoleChange.statusCode).toBe(403);

    const adminLogin = authLoginResponseSchema.parse((await login(app, "ada.admin", "AdminPass123!")).json());
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        username: "new.hire",
        fullName: "New Hire",
        email: "new.hire@example.com",
        role: "employee",
        status: "active",
        managerId: "22222222-2222-4222-8222-222222222222",
        assessorId: "44444444-4444-4444-8444-444444444444",
        password: "OnboardPass123!",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const createdEmployee = employeeResponseSchema.parse(createResponse.json()).item;
    expect(createdEmployee.username).toBe("new.hire");
    expect(createdEmployee.auth.passwordConfigured).toBe(true);

    const newHireLogin = await login(app, "new.hire", "OnboardPass123!");
    expect(newHireLogin.statusCode).toBe(200);

    const setPasswordResponse = await app.inject({
      method: "POST",
      url: `/api/v1/employees/${createdEmployee.id}/password/set`,
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        password: "ReplacementPass123!",
      },
    });
    expect(setPasswordResponse.statusCode).toBe(200);
    expect(setEmployeePasswordResponseSchema.parse(setPasswordResponse.json()).passwordResetRequired).toBe(false);

    expect((await login(app, "new.hire", "OnboardPass123!")).statusCode).toBe(401);
    expect((await login(app, "new.hire", "ReplacementPass123!")).statusCode).toBe(200);

    const resetPasswordResponse = await app.inject({
      method: "POST",
      url: `/api/v1/employees/${createdEmployee.id}/password/reset`,
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {},
    });
    expect(resetPasswordResponse.statusCode).toBe(200);

    const resetPayload = resetEmployeePasswordResponseSchema.parse(resetPasswordResponse.json());
    expect(resetPayload.passwordResetRequired).toBe(true);
    expect((await login(app, "new.hire", "ReplacementPass123!")).statusCode).toBe(401);
    const resetLoginPayload = authLoginResponseSchema.parse((await login(app, "new.hire", resetPayload.temporaryPassword)).json());
    expect(resetLoginPayload.session.passwordResetRequired).toBe(true);

    const blockedFoundationResponse = await app.inject({
      method: "GET",
      url: "/api/v1/foundation",
      headers: {
        authorization: `Bearer ${resetLoginPayload.session.token}`,
      },
    });
    expect(blockedFoundationResponse.statusCode).toBe(403);

    const resetMeResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${resetLoginPayload.session.token}`,
      },
    });
    expect(resetMeResponse.statusCode).toBe(200);
    expect(authMeResponseSchema.parse(resetMeResponse.json()).session.passwordResetRequired).toBe(true);

    const changePasswordResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/change",
      headers: {
        authorization: `Bearer ${resetLoginPayload.session.token}`,
      },
      payload: {
        currentPassword: resetPayload.temporaryPassword,
        newPassword: "ChangedAfterReset123!",
      },
    });
    expect(changePasswordResponse.statusCode).toBe(200);
    const changedPasswordPayload = authChangePasswordResponseSchema.parse(changePasswordResponse.json());
    expect(changedPasswordPayload.session.passwordResetRequired).toBe(false);

    const foundationAfterChangeResponse = await app.inject({
      method: "GET",
      url: "/api/v1/foundation",
      headers: {
        authorization: `Bearer ${changedPasswordPayload.session.token}`,
      },
    });
    expect(foundationAfterChangeResponse.statusCode).toBe(200);

    expect((await login(app, "new.hire", resetPayload.temporaryPassword)).statusCode).toBe(401);
    expect((await login(app, "new.hire", "ChangedAfterReset123!")).statusCode).toBe(200);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/employees/${createdEmployee.id}`,
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteEmployeeResponseSchema.parse(deleteResponse.json()).deleted).toBe(true);
  });

  it("supports local user import/export with password transfer fields", async () => {
    const exportApp = await createApp();
    const exportAdminLogin = authLoginResponseSchema.parse((await login(exportApp, "ada.admin", "AdminPass123!")).json());

    const exportResponse = await exportApp.inject({
      method: "GET",
      url: "/api/v1/employees/export?format=json",
      headers: {
        authorization: `Bearer ${exportAdminLogin.session.token}`,
      },
    });
    expect(exportResponse.statusCode).toBe(200);
    const exportPayload = localUsersExportResponseSchema.parse(exportResponse.json());
    expect(exportPayload.itemCount).toBe(4);
    expect(exportPayload.mode).toBe("rotate-passcodes");

    const exportedAdmin = exportPayload.items.find((item) => item.username === "ada.admin");
    expect(exportedAdmin).toBeDefined();
    expect(exportedAdmin?.passwordResetRequired).toBe(true);
    expect(exportedAdmin?.credentialKind).toBe("password");
    expect(exportedAdmin?.id).toBe("11111111-1111-4111-8111-111111111111");

    const exportedEmployee = exportPayload.items.find((item) => item.username === "elliot.employee");
    expect(exportedEmployee).toBeDefined();
    expect(exportedEmployee).toMatchObject({
      managerUsername: "manny.manager",
      assessorUsername: "pat.peer",
      passwordResetRequired: true,
    });
    expect((await login(exportApp, "elliot.employee", "EmployeePass123!")).statusCode).toBe(401);
    const exportedEmployeeLogin = authLoginResponseSchema.parse(
      (await login(exportApp, "elliot.employee", exportedEmployee!.password)).json(),
    );
    expect(exportedEmployeeLogin.session.passwordResetRequired).toBe(true);

    const exportAdminMeResponse = await exportApp.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${exportAdminLogin.session.token}`,
      },
    });
    expect(exportAdminMeResponse.statusCode).toBe(401);
    expect((await login(exportApp, "ada.admin", "AdminPass123!")).statusCode).toBe(401);
    const exportedAdminLogin = authLoginResponseSchema.parse((await login(exportApp, "ada.admin", exportedAdmin!.password)).json());
    expect(exportedAdminLogin.session.passwordResetRequired).toBe(true);

    const importApp = await createApp();
    const importAdminLogin = authLoginResponseSchema.parse((await login(importApp, "ada.admin", "AdminPass123!")).json());
    const importResponse = await importApp.inject({
      method: "POST",
      url: "/api/v1/employees/import",
      headers: {
        authorization: `Bearer ${importAdminLogin.session.token}`,
      },
      payload: {
        format: "json",
        items: [
          {
            username: "elliot.employee",
            fullName: "Elliot Employee Imported",
            email: "elliot.imported@example.com",
            role: "employee",
            status: "active",
            managerUsername: "manny.manager",
            assessorUsername: "pat.peer",
            password: "ImportedPass123!",
            passwordResetRequired: true,
          },
          {
            username: "new.transfer",
            fullName: "New Transfer",
            email: "new.transfer@example.com",
            role: "employee",
            status: "active",
            managerUsername: "manny.manager",
            assessorUsername: "pat.peer",
            password: "TransferPass123!",
            passwordResetRequired: false,
          },
        ],
      },
    });
    expect(importResponse.statusCode).toBe(200);

    const importPayload = localUsersImportResponseSchema.parse(importResponse.json());
    expect(importPayload.createdCount).toBe(1);
    expect(importPayload.updatedCount).toBe(1);
    expect(importPayload.items.find((item) => item.username === "elliot.employee")?.auth.passwordResetRequired).toBe(true);
    expect(importPayload.items.find((item) => item.username === "new.transfer")?.auth.passwordResetRequired).toBe(false);

    expect((await login(importApp, "elliot.employee", "EmployeePass123!")).statusCode).toBe(401);
    const importedEmployeeLogin = authLoginResponseSchema.parse((await login(importApp, "elliot.employee", "ImportedPass123!")).json());
    expect(importedEmployeeLogin.session.passwordResetRequired).toBe(true);

    const transferredUserLogin = authLoginResponseSchema.parse((await login(importApp, "new.transfer", "TransferPass123!")).json());
    expect(transferredUserLogin.session.passwordResetRequired).toBe(false);
  });

  it("supports preserve-password exports without rotating credentials or sessions", async () => {
    const app = await createApp();
    const adminLogin = authLoginResponseSchema.parse((await login(app, "ada.admin", "AdminPass123!")).json());

    const exportResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employees/export?format=json&mode=preserve-passwords",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
    });
    expect(exportResponse.statusCode).toBe(200);

    const exportPayload = localUsersExportResponseSchema.parse(exportResponse.json());
    expect(exportPayload.mode).toBe("preserve-passwords");

    const exportedAdmin = exportPayload.items.find((item) => item.username === "ada.admin");
    expect(exportedAdmin).toMatchObject({
      credentialKind: "password-hash",
      passwordResetRequired: false,
      id: "11111111-1111-4111-8111-111111111111",
    });

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
    });
    expect(meResponse.statusCode).toBe(200);

    expect((await login(app, "ada.admin", "AdminPass123!")).statusCode).toBe(200);
  });

  it("rejects imported password-hash credentials that do not use a supported stored-password format", async () => {
    const app = await createApp();
    const adminLogin = authLoginResponseSchema.parse((await login(app, "ada.admin", "AdminPass123!")).json());

    const importResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employees/import",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        format: "json",
        items: [
          {
            username: "broken.hash",
            fullName: "Broken Hash",
            email: "broken.hash@example.com",
            role: "employee",
            status: "active",
            managerUsername: "manny.manager",
            assessorUsername: "pat.peer",
            password: "",
            credentialKind: "password-hash",
            passwordResetRequired: false,
          },
        ],
      },
    });

    expect(importResponse.statusCode).toBe(400);
    expect(importResponse.body).toContain("Password hash must use a supported stored-password format");
  });

  it("captures auth schema invariants in the migration", () => {
    const sql = readFileSync(resolve(process.cwd(), "../../prisma/migrations/002_auth_employee_admin.sql"), "utf8");

    expect(sql).toContain("ADD COLUMN username TEXT");
    expect(sql).toContain("employees_username_format");
    expect(sql).toContain("password_reset_required BOOLEAN NOT NULL DEFAULT FALSE");
    expect(sql).toContain("CREATE TABLE auth_sessions");
    expect(sql).toContain("auth_sessions_token_hash_unique_idx");
  });
});
