import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  authLoginResponseSchema,
  authMeResponseSchema,
  deleteEmployeeResponseSchema,
  employeeResponseSchema,
  employeesListResponseSchema,
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
    expect(loginPayload.session.permissions).toContain("employees:create");

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${loginPayload.session.token}`,
      },
    });

    expect(meResponse.statusCode).toBe(200);
    expect(authMeResponseSchema.parse(meResponse.json()).session.user.username).toBe("ada.admin");

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
    expect((await login(app, "new.hire", resetPayload.temporaryPassword)).statusCode).toBe(200);

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

  it("captures auth schema invariants in the migration", () => {
    const sql = readFileSync(resolve(process.cwd(), "../../prisma/migrations/002_auth_employee_admin.sql"), "utf8");

    expect(sql).toContain("ADD COLUMN username TEXT");
    expect(sql).toContain("employees_username_format");
    expect(sql).toContain("password_reset_required BOOLEAN NOT NULL DEFAULT FALSE");
    expect(sql).toContain("CREATE TABLE auth_sessions");
    expect(sql).toContain("auth_sessions_token_hash_unique_idx");
  });
});
