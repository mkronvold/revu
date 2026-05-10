import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assessmentItemResponseSchema,
  assignmentResponseSchema,
  authChangePasswordResponseSchema,
  authLoginResponseSchema,
  authMeResponseSchema,
  deleteEmployeeResponseSchema,
  employeeResponseSchema,
  employeesListResponseSchema,
  foundationSnapshotSchema,
  localUsersExportResponseSchema,
  localUsersImportResponseSchema,
  resetEmployeePasswordResponseSchema,
  setEmployeePasswordResponseSchema,
  workflowSettingsResponseSchema,
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

  it("lets an authenticated user update their own profile", async () => {
    const app = await createApp();
    const employeeLogin = authLoginResponseSchema.parse((await login(app, "elliot.employee", "EmployeePass123!")).json());

    const updateProfileResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${employeeLogin.session.token}`,
      },
      payload: {
        fullName: "Elliot Updated",
        email: "elliot.updated@example.com",
      },
    });
    expect(updateProfileResponse.statusCode).toBe(200);
    const updatedSession = authMeResponseSchema.parse(updateProfileResponse.json()).session;
    expect(updatedSession.user.fullName).toBe("Elliot Updated");
    expect(updatedSession.user.email).toBe("elliot.updated@example.com");
    expect(updatedSession.token).toBe(employeeLogin.session.token);

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${employeeLogin.session.token}`,
      },
    });
    expect(meResponse.statusCode).toBe(200);
    expect(authMeResponseSchema.parse(meResponse.json()).session.user.fullName).toBe("Elliot Updated");
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
        assessor1Id: "22222222-2222-4222-8222-222222222222",
        assessor2Id: "33333333-3333-4333-8333-333333333333",
      },
    });
    expect(managerUpdateResponse.statusCode).toBe(200);
    const managerUpdatedEmployee = employeeResponseSchema.parse(managerUpdateResponse.json()).item;
    expect(managerUpdatedEmployee.managerId).toBe("11111111-1111-4111-8111-111111111111");
    expect(managerUpdatedEmployee.assessor1Id).toBe("22222222-2222-4222-8222-222222222222");
    expect(managerUpdatedEmployee.assessor2Id).toBe("33333333-3333-4333-8333-333333333333");

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
        username: "New.Hire",
        fullName: "New Hire",
        email: "new.hire@example.com",
        role: "employee",
        status: "active",
        managerId: "22222222-2222-4222-8222-222222222222",
        assessor1Id: "22222222-2222-4222-8222-222222222222",
        assessor2Id: "44444444-4444-4444-8444-444444444444",
        password: "OnboardPass123!",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const createdEmployee = employeeResponseSchema.parse(createResponse.json()).item;
    expect(createdEmployee.username).toBe("New.Hire");
    expect(createdEmployee.auth.passwordConfigured).toBe(true);

    const newHireLogin = await login(app, "new.hire", "OnboardPass123!");
    expect(newHireLogin.statusCode).toBe(200);

    const duplicateCaseResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        username: "new.hire",
        fullName: "Duplicate Case",
        email: "duplicate.case@example.com",
        role: "employee",
        status: "active",
        managerId: "22222222-2222-4222-8222-222222222222",
        assessor1Id: "22222222-2222-4222-8222-222222222222",
        assessor2Id: "44444444-4444-4444-8444-444444444444",
      },
    });
    expect(duplicateCaseResponse.statusCode).toBe(409);

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

    const deletedEmployeeResponse = await app.inject({
      method: "GET",
      url: `/api/v1/employees/${createdEmployee.id}`,
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
    });
    expect(deletedEmployeeResponse.statusCode).toBe(404);

    const listedEmployeesAfterDelete = employeesListResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/employees",
          headers: {
            authorization: `Bearer ${adminLogin.session.token}`,
          },
        })
      ).json(),
    );
    expect(listedEmployeesAfterDelete.items.some((employee) => employee.id === createdEmployee.id)).toBe(false);

    const deletedEmployeeSessionResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${changedPasswordPayload.session.token}`,
      },
    });
    expect(deletedEmployeeSessionResponse.statusCode).toBe(401);

    const recreateDeletedEmployeeResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        username: "New.Hire",
        fullName: "Recreated Hire",
        email: "new.hire@example.com",
        role: "employee",
        status: "active",
        managerId: "22222222-2222-4222-8222-222222222222",
        assessor1Id: "22222222-2222-4222-8222-222222222222",
        assessor2Id: "44444444-4444-4444-8444-444444444444",
      },
    });
    expect(recreateDeletedEmployeeResponse.statusCode).toBe(201);
    expect(employeeResponseSchema.parse(recreateDeletedEmployeeResponse.json()).item.username).toBe("New.Hire");
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
      assessor1Username: "manny.manager",
      assessor2Username: "pat.peer",
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
            assessor1Username: "manny.manager",
            assessor2Username: "pat.peer",
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
            assessor1Username: "manny.manager",
            assessor2Username: "pat.peer",
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

  it("removes deleted employees' subject assessments while keeping completed peer assessments on the tombstone", async () => {
    const app = await createApp();
    const adminLogin = authLoginResponseSchema.parse((await login(app, "ada.admin", "AdminPass123!")).json());

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        username: "Former.Manager",
        fullName: "Former Manager",
        email: "former.manager@example.com",
        role: "manager",
        status: "active",
        password: "FormerManager123!",
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const deletedManager = employeeResponseSchema.parse(createResponse.json()).item;

    const reassignEmployeeResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/employees/33333333-3333-4333-8333-333333333333",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        managerId: deletedManager.id,
      },
    });
    expect(reassignEmployeeResponse.statusCode).toBe(200);

    const reassignAssignmentResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/assignments/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        managerId: deletedManager.id,
      },
    });
    expect(reassignAssignmentResponse.statusCode).toBe(200);

    const managerLogin = authLoginResponseSchema.parse((await login(app, "former.manager", "FormerManager123!")).json());
    const acceptResponse = await app.inject({
      method: "POST",
      url: "/api/v1/assessments/dddddddd-dddd-4ddd-8ddd-dddddddddddd/accept",
      headers: {
        authorization: `Bearer ${managerLogin.session.token}`,
      },
      payload: {
        managerNotes: "Accepted by the soon-to-be deleted manager.",
      },
    });
    expect(acceptResponse.statusCode).toBe(200);

    const selfAssessmentResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assessments`,
      headers: {
        authorization: `Bearer ${managerLogin.session.token}`,
      },
      payload: {
        employeeId: deletedManager.id,
        target: "self",
      },
    });
    expect(selfAssessmentResponse.statusCode).toBe(201);
    const selfAssessment = assessmentItemResponseSchema.parse(selfAssessmentResponse.json()).item;

    const completedAssignmentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assignments",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        employeeId: "44444444-4444-4444-8444-444444444444",
        managerId: "22222222-2222-4222-8222-222222222222",
        assessorId: deletedManager.id,
      },
    });
    expect(completedAssignmentResponse.statusCode).toBe(201);
    const completedAssignment = assignmentResponseSchema.parse(completedAssignmentResponse.json()).item;

    const completedPeerAssessmentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assessments",
      headers: {
        authorization: `Bearer ${managerLogin.session.token}`,
      },
      payload: {
        employeeId: "44444444-4444-4444-8444-444444444444",
        target: "peer",
        assignmentId: completedAssignment.id,
      },
    });
    expect(completedPeerAssessmentResponse.statusCode).toBe(201);
    const completedPeerAssessment = assessmentItemResponseSchema.parse(completedPeerAssessmentResponse.json()).item;

    const submitCompletedPeerResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${completedPeerAssessment.id}/submit`,
      headers: {
        authorization: `Bearer ${managerLogin.session.token}`,
      },
      payload: {
        responses: [
          {
            questionId: "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa",
            order: 1,
            response: "4",
          },
          {
            questionId: "aaaaaaaa-3222-4222-8222-aaaaaaaaaaaa",
            order: 2,
            response: "Completed peer feedback that should survive deletion.",
          },
        ],
      },
    });
    expect(submitCompletedPeerResponse.statusCode).toBe(200);

    const draftSubjectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        username: "draft.subject",
        fullName: "Draft Subject",
        email: "draft.subject@example.com",
        role: "employee",
        status: "active",
        managerId: "22222222-2222-4222-8222-222222222222",
      },
    });
    expect(draftSubjectResponse.statusCode).toBe(201);
    const draftSubject = employeeResponseSchema.parse(draftSubjectResponse.json()).item;

    const draftAssignmentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assignments",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        employeeId: draftSubject.id,
        managerId: "22222222-2222-4222-8222-222222222222",
        assessorId: deletedManager.id,
      },
    });
    expect(draftAssignmentResponse.statusCode).toBe(201);
    const draftAssignment = assignmentResponseSchema.parse(draftAssignmentResponse.json()).item;

    const draftPeerAssessmentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assessments",
      headers: {
        authorization: `Bearer ${managerLogin.session.token}`,
      },
      payload: {
        employeeId: draftSubject.id,
        target: "peer",
        assignmentId: draftAssignment.id,
      },
    });
    expect(draftPeerAssessmentResponse.statusCode).toBe(201);
    const draftPeerAssessment = assessmentItemResponseSchema.parse(draftPeerAssessmentResponse.json()).item;

    const saveDraftPeerResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/assessments/${draftPeerAssessment.id}/save`,
      headers: {
        authorization: `Bearer ${managerLogin.session.token}`,
      },
      payload: {
        responses: [
          {
            questionId: "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa",
            order: 1,
            response: "3",
          },
        ],
      },
    });
    expect(saveDraftPeerResponse.statusCode).toBe(200);

    const deactivateEmployeeResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/employees/${deletedManager.id}`,
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        status: "inactive",
      },
    });
    expect(deactivateEmployeeResponse.statusCode).toBe(200);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/employees/${deletedManager.id}`,
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteEmployeeResponseSchema.parse(deleteResponse.json()).deleted).toBe(true);

    const employeeAfterDeleteResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employees/33333333-3333-4333-8333-333333333333",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
    });
    expect(employeeAfterDeleteResponse.statusCode).toBe(200);
    expect(employeeResponseSchema.parse(employeeAfterDeleteResponse.json()).item.managerId).toBe(deletedManager.id);

    const updateAfterDeleteResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/employees/33333333-3333-4333-8333-333333333333",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        fullName: "Elliot Employee Updated",
      },
    });
    expect(updateAfterDeleteResponse.statusCode).toBe(200);
    expect(employeeResponseSchema.parse(updateAfterDeleteResponse.json()).item).toMatchObject({
      fullName: "Elliot Employee Updated",
      managerId: deletedManager.id,
    });

    const foundationResponse = await app.inject({
      method: "GET",
      url: "/api/v1/foundation",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
    });
    expect(foundationResponse.statusCode).toBe(200);
    const foundation = foundationSnapshotSchema.parse(foundationResponse.json());
    expect(foundation.employees.some((employee) => employee.id === deletedManager.id)).toBe(false);
    expect(
      foundation.assignments.find((assignment) => assignment.id === "cccccccc-cccc-4ccc-8ccc-cccccccccccc")?.managerId,
    ).toBe(deletedManager.id);
    expect(
      foundation.assessments.find((assessment) => assessment.id === "dddddddd-dddd-4ddd-8ddd-dddddddddddd")?.acceptedByEmployeeId,
    ).toBe(deletedManager.id);
    expect(foundation.assessments.some((assessment) => assessment.id === selfAssessment.id)).toBe(false);
    expect(foundation.assessments.some((assessment) => assessment.id === draftPeerAssessment.id)).toBe(false);
    expect(foundation.assessments.find((assessment) => assessment.id === completedPeerAssessment.id)).toMatchObject({
      employeeId: "44444444-4444-4444-8444-444444444444",
      assessorId: deletedManager.id,
      reviewState: "submitted",
    });
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
            assessor1Username: "manny.manager",
            assessor2Username: "pat.peer",
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

  it("persists workflow settings through the admin API and serves them from foundation", async () => {
    const app = await createApp();
    const adminLogin = authLoginResponseSchema.parse((await login(app, "ada.admin", "AdminPass123!")).json());
    const managerLogin = authLoginResponseSchema.parse((await login(app, "manny.manager", "ManagerPass123!")).json());

    const forbiddenResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/workflow-settings",
      headers: {
        authorization: `Bearer ${managerLogin.session.token}`,
      },
      payload: {
        markdown: "## Hidden workflow",
        visibility: "admin only",
      },
    });
    expect(forbiddenResponse.statusCode).toBe(403);

    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/workflow-settings",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
      payload: {
        markdown: "## Shared workflow\n- Synced across browsers",
        visibility: "managers",
      },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(workflowSettingsResponseSchema.parse(updateResponse.json()).item).toEqual({
      markdown: "## Shared workflow\n- Synced across browsers",
      visibility: "managers",
    });

    const foundationResponse = await app.inject({
      method: "GET",
      url: "/api/v1/foundation",
      headers: {
        authorization: `Bearer ${adminLogin.session.token}`,
      },
    });
    expect(foundationResponse.statusCode).toBe(200);
    expect(foundationSnapshotSchema.parse(foundationResponse.json()).workflow).toEqual({
      markdown: "## Shared workflow\n- Synced across browsers",
      visibility: "managers",
    });
  });

  it("captures auth schema invariants in the migration", () => {
    const authSql = readFileSync(resolve(process.cwd(), "../../prisma/migrations/002_auth_employee_admin.sql"), "utf8");
    const usernameUpgradeSql = readFileSync(
      resolve(process.cwd(), "../../prisma/migrations/006_employee_username_case_support.sql"),
      "utf8",
    );
    const tombstoneSql = readFileSync(resolve(process.cwd(), "../../prisma/migrations/007_employee_tombstones.sql"), "utf8");

    expect(authSql).toContain("ADD COLUMN username TEXT");
    expect(authSql).toContain("employees_username_format");
    expect(authSql).toContain("password_reset_required BOOLEAN NOT NULL DEFAULT FALSE");
    expect(authSql).toContain("CREATE TABLE auth_sessions");
    expect(authSql).toContain("auth_sessions_token_hash_unique_idx");
    expect(usernameUpgradeSql).toContain("employees_username_unique_ci_idx");
    expect(usernameUpgradeSql).toContain("lower(username)");
    expect(usernameUpgradeSql).toContain("^[A-Za-z0-9._-]+$");
    expect(tombstoneSql).toContain("ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ");
    expect(tombstoneSql).toContain("DROP CONSTRAINT IF EXISTS employees_email_key");
    expect(tombstoneSql).toContain("employees_email_active_unique_idx");
    expect(tombstoneSql).toContain("employees_username_active_unique_ci_idx");
    expect(tombstoneSql).toContain("WHERE deleted_at IS NULL");
  });
});
