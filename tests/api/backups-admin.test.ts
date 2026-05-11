import {
  authLoginResponseSchema,
  backupExportResponseSchema,
  backupRestoreResponseSchema,
  backupStatusResponseSchema,
  backupStoredFileResponseSchema,
  backupStoredFilesResponseSchema,
  employeesListResponseSchema,
  questionCategoriesListResponseSchema,
  questionSetsListResponseSchema,
  reviewPeriodsListResponseSchema,
} from "@revu/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildApp } from "../../apps/api/src/app.js";
import { getPool } from "../../apps/api/src/db.js";

describe("backup and question category admin API", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    tempDirs.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
    delete process.env.BACKUP_ARCHIVE_DIR;
    delete process.env.BACKUP_STATUS_PATH;
  });

  async function createApp() {
    const app = buildApp();
    apps.push(app);
    await app.ready();
    return app;
  }

  async function loginAsAdmin(app: ReturnType<typeof buildApp>, password = "AdminPass123!") {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username: "ada.admin",
        password,
      },
    });

    expect(response.statusCode).toBe(200);
    return authLoginResponseSchema.parse(response.json()).session;
  }

  async function exportBackup(app: ReturnType<typeof buildApp>, token: string, query = "") {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/admin/backups/export${query}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    return {
      response,
      backup: backupExportResponseSchema.parse(response.json()),
    };
  }

  async function exportInternalBackup(app: ReturnType<typeof buildApp>) {
    const response = await app.inject({
      method: "GET",
      url: "/internal/backups/export",
    });

    expect(response.statusCode).toBe(200);
    return {
      response,
      backup: backupExportResponseSchema.parse(response.json()),
    };
  }

  function createMultipartPayload(backup: unknown, target: string, mode = "replace") {
    const boundary = `----revu-backup-${target}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="target"\r\n\r\n${target}\r\n`, "utf8"),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="mode"\r\n\r\n${mode}\r\n`, "utf8"),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="backup.json"\r\nContent-Type: application/json\r\n\r\n`,
        "utf8",
      ),
      Buffer.from(JSON.stringify(backup, null, 2), "utf8"),
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    return {
      body,
      boundary,
    };
  }

  async function restoreBackup(app: ReturnType<typeof buildApp>, token: string, backup: unknown, target: string) {
    const payload = createMultipartPayload(backup, target);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/backups/restore",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/form-data; boundary=${payload.boundary}`,
      },
      payload: payload.body,
    });

    expect(response.statusCode).toBe(200);
    return backupRestoreResponseSchema.parse(response.json());
  }

  async function restoreInternalBackup(app: ReturnType<typeof buildApp>, backup: unknown, target: string) {
    const payload = createMultipartPayload(backup, target);
    const response = await app.inject({
      method: "POST",
      url: "/internal/backups/restore",
      headers: {
        "content-type": `multipart/form-data; boundary=${payload.boundary}`,
      },
      payload: payload.body,
    });

    expect(response.statusCode).toBe(200);
    return backupRestoreResponseSchema.parse(response.json());
  }

  function createUploadMultipartPayload(rawBackup: string, fileName: string) {
    const boundary = `----revu-upload-${fileName}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/json\r\n\r\n`,
        "utf8",
      ),
      Buffer.from(rawBackup, "utf8"),
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    return {
      body,
      boundary,
    };
  }

  it("lists stored question categories and reports approved backup capabilities", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);

    const categoriesResponse = await app.inject({
      method: "GET",
      url: "/api/v1/question-categories",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(categoriesResponse.statusCode).toBe(200);

    const categories = questionCategoriesListResponseSchema.parse(categoriesResponse.json()).items;
    expect(categories).toEqual(expect.arrayContaining(["Collaboration", "Growth", "Impact", "Teamwork"]));
    expect(categories).toEqual([...categories].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })));

    const updateCategoriesResponse = await app.inject({
      method: "PUT",
      url: "/api/v1/question-categories",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        items: [...categories, "Unassigned focus"],
      },
    });
    expect(updateCategoriesResponse.statusCode).toBe(200);
    expect(questionCategoriesListResponseSchema.parse(updateCategoriesResponse.json()).items).toContain("Unassigned focus");

    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/v1/admin/backups/status",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(statusResponse.statusCode).toBe(200);
    expect(backupStatusResponseSchema.parse(statusResponse.json())).toMatchObject({
      defaultUserExportMode: "preserve-passwords",
      replaceStrategy: "replace",
      supportedFormats: ["json"],
      supportedRestoreModes: ["replace"],
      supportedRestoreScopes: ["all", "users", "questions", "reviews"],
      supportedUserExportModes: ["rotate-passcodes", "preserve-passwords"],
    });

    const { response: exportResponse, backup } = await exportBackup(app, session.token);
    expect(exportResponse.headers["content-type"]).toContain("application/json");
    expect(exportResponse.headers["content-disposition"]).toContain("attachment;");
    expect(exportResponse.headers["content-disposition"]).toContain(".json");
    expect(backup.reviewData.questionCategories).toContain("Unassigned focus");
    expect(backup.users.mode).toBe("preserve-passwords");
    expect(backup.users.items.find((item) => item.username === "ada.admin")).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      credentialKind: "password-hash",
    });

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(meResponse.statusCode).toBe(200);
  });

  it("creates, uploads, downloads, restores, and deletes stored backups", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "revu-backups-"));
    tempDirs.push(tempRoot);
    process.env.BACKUP_ARCHIVE_DIR = join(tempRoot, "archive");
    process.env.BACKUP_STATUS_PATH = join(tempRoot, "config", "status.json");

    const app = await createApp();
    const session = await loginAsAdmin(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/admin/backups/files/create",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(createResponse.statusCode).toBe(200);
    const created = backupStoredFileResponseSchema.parse(createResponse.json()).item;

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/admin/backups/files",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(backupStoredFilesResponseSchema.parse(listResponse.json()).items.map((item) => item.name)).toContain(created.name);

    const downloadResponse = await app.inject({
      method: "GET",
      url: `/api/v1/admin/backups/files/${created.name}/download?mode=preserve-passwords`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.headers["content-disposition"]).toContain(created.name);
    const storedBackup = backupExportResponseSchema.parse(downloadResponse.json());

    const uploadPayload = createUploadMultipartPayload(JSON.stringify(storedBackup, null, 2), created.name);
    const uploadResponse = await app.inject({
      method: "POST",
      url: "/api/v1/admin/backups/files/upload",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": `multipart/form-data; boundary=${uploadPayload.boundary}`,
      },
      payload: uploadPayload.body,
    });
    expect(uploadResponse.statusCode).toBe(200);
    const uploaded = backupStoredFileResponseSchema.parse(uploadResponse.json());
    expect(uploaded.renamedFrom).toBe(created.name);
    expect(uploaded.item.name).not.toBe(created.name);

    const restoreResponse = await app.inject({
      method: "POST",
      url: `/api/v1/admin/backups/files/${created.name}/restore`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        target: "reviews",
        mode: "replace",
      },
    });
    expect(restoreResponse.statusCode).toBe(200);
    expect(backupRestoreResponseSchema.parse(restoreResponse.json())).toMatchObject({
      target: "reviews",
      userMode: storedBackup.users.mode,
    });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/backups/files/${uploaded.item.name}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({
      name: uploaded.item.name,
      deleted: true,
    });
  });

  it("recreates the question category table on demand for older databases", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);

    await getPool().query("DROP TABLE IF EXISTS question_categories");

    const updateCategoriesResponse = await app.inject({
      method: "PUT",
      url: "/api/v1/question-categories",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        items: ["Growth", "Strategy", "Teamwork"],
      },
    });

    expect(updateCategoriesResponse.statusCode).toBe(200);
    expect(questionCategoriesListResponseSchema.parse(updateCategoriesResponse.json()).items).toEqual(
      expect.arrayContaining(["Growth", "Strategy", "Teamwork"]),
    );
  });

  it("supports rotate-passcodes backup exports when requested", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);

    const { backup } = await exportBackup(app, session.token, "?mode=rotate-passcodes");
    expect(backup.users.mode).toBe("rotate-passcodes");

    const exportedAdmin = backup.users.items.find((item) => item.username === "ada.admin");
    expect(exportedAdmin).toMatchObject({
      credentialKind: "password",
      passwordResetRequired: true,
      id: "11111111-1111-4111-8111-111111111111",
    });

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(meResponse.statusCode).toBe(401);
    expect((await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username: "ada.admin",
        password: "AdminPass123!",
      },
    })).statusCode).toBe(401);

    const rotatedSession = await loginAsAdmin(app, exportedAdmin!.password);
    expect(rotatedSession.passwordResetRequired).toBe(true);
  });

  it("restores users with replace semantics from multipart backup uploads", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);
    const { backup } = await exportBackup(app, session.token);

    const createEmployeeResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        username: "restore.user",
        fullName: "Restore User",
        email: "restore.user@example.com",
        role: "employee",
        status: "active",
        managerId: "22222222-2222-4222-8222-222222222222",
        assessor1Id: "22222222-2222-4222-8222-222222222222",
        assessor2Id: "44444444-4444-4444-8444-444444444444",
        password: "RestorePass123!",
      },
    });
    expect(createEmployeeResponse.statusCode).toBe(201);

    const restoreResponse = await restoreBackup(app, session.token, backup, "users");
    expect(restoreResponse).toMatchObject({
      mode: "replace",
      target: "users",
    });
    expect(restoreResponse.counts.users).toBe(backup.users.itemCount);

    const refreshedSession = await loginAsAdmin(app);
    const employeesResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employees",
      headers: {
        authorization: `Bearer ${refreshedSession.token}`,
      },
    });
    const employees = employeesListResponseSchema.parse(employeesResponse.json()).items;
    expect(employees.some((item) => item.username === "restore.user")).toBe(false);
  });

  it("restores review data with replace semantics from multipart backup uploads", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);
    const { backup } = await exportBackup(app, session.token);

    const createReviewPeriodResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        key: "restorable-period",
        label: "Restorable Period",
        startDate: "2027-03-01",
        dueDate: "2027-04-01",
        assessmentDueDate: "2027-03-24",
        reviewDueDate: "2027-03-29",
      },
    });
    expect(createReviewPeriodResponse.statusCode).toBe(201);

    const restoreResponse = await restoreBackup(app, session.token, backup, "reviews");
    expect(restoreResponse).toMatchObject({
      mode: "replace",
      target: "reviews",
    });
    expect(restoreResponse.counts.reviewPeriods).toBe(backup.reviewData.reviewPeriods.length);

    const reviewPeriodsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/review-periods",
    });
    const reviewPeriods = reviewPeriodsListResponseSchema.parse(reviewPeriodsResponse.json()).items;
    expect(reviewPeriods).toHaveLength(backup.reviewData.reviewPeriods.length);
    expect(reviewPeriods.some((item) => item.key === "restorable-period")).toBe(false);
  });

  it("restores question definitions with replace semantics once review data is cleared", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);
    const { backup } = await exportBackup(app, session.token);
    const pool = getPool();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = replica");
      await client.query(
        `
          DELETE FROM assessment_review_events;
          DELETE FROM assessment_responses;
          DELETE FROM assessments;
          DELETE FROM review_period_assignments;
          DELETE FROM question_set_questions;
          DELETE FROM question_sets;
          DELETE FROM review_periods;
        `,
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const restoreResponse = await restoreBackup(app, session.token, backup, "questions");
    expect(restoreResponse).toMatchObject({
      mode: "replace",
      target: "questions",
    });
    expect(restoreResponse.counts.questionSets).toBe(backup.reviewData.questionSets.length);

    const questionSetsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/question-sets",
    });
    expect(questionSetsListResponseSchema.parse(questionSetsResponse.json()).items).toHaveLength(
      backup.reviewData.questionSets.length,
    );
  });

  it("accepts the runtime full target alias for full replace restores", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);
    const { backup } = await exportBackup(app, session.token);

    const createEmployeeResponse = await app.inject({
      method: "POST",
      url: "/api/v1/employees",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        username: "full.restore",
        fullName: "Full Restore",
        email: "full.restore@example.com",
        role: "employee",
        status: "active",
        managerId: "22222222-2222-4222-8222-222222222222",
        assessor1Id: "22222222-2222-4222-8222-222222222222",
        assessor2Id: "44444444-4444-4444-8444-444444444444",
        password: "RestorePass123!",
      },
    });
    expect(createEmployeeResponse.statusCode).toBe(201);

    const restoreResponse = await restoreBackup(app, session.token, backup, "full");
    expect(restoreResponse).toMatchObject({
      mode: "replace",
      target: "all",
    });

    const refreshedSession = await loginAsAdmin(app);
    const employeesResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employees",
      headers: {
        authorization: `Bearer ${refreshedSession.token}`,
      },
    });
    const employees = employeesListResponseSchema.parse(employeesResponse.json()).items;
    expect(employees.some((item) => item.username === "full.restore")).toBe(false);

    const reviewPeriodsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/review-periods",
    });
    expect(reviewPeriodsListResponseSchema.parse(reviewPeriodsResponse.json()).items).toHaveLength(
      backup.reviewData.reviewPeriods.length,
    );
  });

  it("supports internal backup export and restore for the backup sidecar", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);
    const { response: exportResponse, backup } = await exportInternalBackup(app);

    expect(exportResponse.headers["content-type"]).toContain("application/json");
    expect(exportResponse.headers["content-disposition"]).toContain("attachment;");
    expect(backup.users.mode).toBe("preserve-passwords");

    const createReviewPeriodResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        key: "internal-restore-period",
        label: "Internal Restore Period",
        startDate: "2027-03-01",
        dueDate: "2027-04-01",
        assessmentDueDate: "2027-03-24",
        reviewDueDate: "2027-03-29",
      },
    });
    expect(createReviewPeriodResponse.statusCode).toBe(201);

    const restoreResponse = await restoreInternalBackup(app, backup, "reviews");
    expect(restoreResponse).toMatchObject({
      mode: "replace",
      target: "reviews",
    });
    expect(restoreResponse.counts.reviewPeriods).toBe(backup.reviewData.reviewPeriods.length);

    const reviewPeriodsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/review-periods",
    });
    const reviewPeriods = reviewPeriodsListResponseSchema.parse(reviewPeriodsResponse.json()).items;
    expect(reviewPeriods).toHaveLength(backup.reviewData.reviewPeriods.length);
    expect(reviewPeriods.some((item) => item.key === "internal-restore-period")).toBe(false);
  });
});
