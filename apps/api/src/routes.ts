import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import {
  acceptAssessmentRequestSchema,
  apiIndexResponseSchema,
  apiIndexExample,
  assessmentItemResponseSchema,
  assessmentReassignmentResponseSchema,
  assessmentsListResponseSchema,
  assessmentsListQuerySchema,
  assignmentResponseSchema,
  assignmentsListResponseSchema,
  authChangePasswordRequestSchema,
  authChangePasswordResponseSchema,
  authLoginRequestSchema,
  authLoginResponseSchema,
  authLogoutResponseSchema,
  authMeResponseSchema,
  backupExportQuerySchema,
  backupExportResponseSchema,
  backupRestoreRequestSchema,
  backupRestoreResponseSchema,
  backupStatusResponseSchema,
  createAssessmentRequestSchema,
  createAssignmentRequestSchema,
  createEmployeeRequestSchema,
  createQuestionSetRequestSchema,
  createReviewPeriodRequestSchema,
  deleteAssignmentResponseSchema,
  deleteEmployeeResponseSchema,
  domainRulesExample,
  employeeResponseSchema,
  employeesListResponseSchema,
  exportFormatSchema,
  exportStubResponseSchema,
  foundationSnapshotSchema,
  idSchema,
  importStubRequestSchema,
  importStubResponseSchema,
  localUsersExportResponseSchema,
  localUsersExportModeSchema,
  localUsersImportRequestSchema,
  localUsersImportResponseSchema,
  questionCategoriesListResponseSchema,
  questionSetResponseSchema,
  questionSetsListResponseSchema,
  reassignAssessmentRequestSchema,
  rejectAssessmentToDraftRequestSchema,
  resetEmployeePasswordRequestSchema,
  resetEmployeePasswordResponseSchema,
  reviewPeriodResponseSchema,
  reviewPeriodsListResponseSchema,
  reviewPeriodScopedQuerySchema,
  reviewAssessmentRequestSchema,
  saveAssessmentDraftRequestSchema,
  setEmployeePasswordRequestSchema,
  setEmployeePasswordResponseSchema,
  submitAssessmentRequestSchema,
  updateBackupStatusRequestSchema,
  updateAssignmentRequestSchema,
  updateEmployeeRequestSchema,
  updateQuestionCategoriesRequestSchema,
  updateQuestionSetRequestSchema,
  updateReviewPeriodRequestSchema,
  type AuthPermission,
  type AuthSession,
  type BackupRestoreRequest,
} from "@revu/contracts";
import { ZodError, z, type ZodType } from "zod";

import { ApiError, type ApiStore } from "./store.js";

type RegisterRoutesOptions = {
  store: ApiStore;
};

const exportFormatQuerySchema = z.object({
  format: exportFormatSchema.default("json"),
});

const localUsersExportQuerySchema = exportFormatQuerySchema.extend({
  mode: localUsersExportModeSchema.default("rotate-passcodes"),
});

const adminBackupRestoreBodyLimit = 50 * 1024 * 1024;

function parseWithSchema<T>(schema: ZodType<T>, value: unknown) {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError(400, error.issues[0]?.message ?? "Invalid request");
    }

    throw error;
  }
}

function normalizeLocalUserTransferItem(item: {
  password: string;
  username: string;
  fullName: string;
  email: string;
  role: "employee" | "manager" | "admin";
  status: "active" | "inactive";
  managerUsername: string | null;
  assessorUsername: string | null;
  id?: string;
  credentialKind?: "password" | "password-hash" | "unset";
  passwordResetRequired?: boolean;
}) {
  return {
    ...item,
    credentialKind: item.credentialKind ?? "password",
    passwordResetRequired: item.passwordResetRequired ?? false,
  };
}

function buildBackupFilename(exportedAt: string) {
  return `revu-backup-${exportedAt.replace(/[:.]/g, "-")}.json`;
}

function parseMultipartFormData(body: Buffer, contentTypeHeader?: string) {
  const boundaryMatch = contentTypeHeader?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) {
    throw new ApiError(400, "Multipart boundary is required");
  }

  const parts = new Map<string, { value: string; filename?: string; contentType?: string }>();
  const sections = body.toString("utf8").split(`--${boundary}`);

  for (const rawSection of sections) {
    if (rawSection === "" || rawSection === "--\r\n" || rawSection === "--") {
      continue;
    }

    const section = rawSection.startsWith("\r\n") ? rawSection.slice(2) : rawSection;
    const trimmedSection = section.endsWith("\r\n") ? section.slice(0, -2) : section;
    if (trimmedSection === "" || trimmedSection === "--") {
      continue;
    }

    const headerSeparator = trimmedSection.indexOf("\r\n\r\n");
    if (headerSeparator === -1) {
      throw new ApiError(400, "Invalid multipart form data");
    }

    const headerBlock = trimmedSection.slice(0, headerSeparator);
    const value = trimmedSection.slice(headerSeparator + 4);
    let fieldName: string | undefined;
    let filename: string | undefined;
    let fieldContentType: string | undefined;

    for (const headerLine of headerBlock.split("\r\n")) {
      const separatorIndex = headerLine.indexOf(":");
      if (separatorIndex === -1) {
        throw new ApiError(400, "Invalid multipart form data header");
      }

      const headerName = headerLine.slice(0, separatorIndex).trim().toLowerCase();
      const headerValue = headerLine.slice(separatorIndex + 1).trim();
      if (headerName === "content-type") {
        fieldContentType = headerValue;
        continue;
      }

      if (headerName !== "content-disposition") {
        continue;
      }

      const segments = headerValue.split(";").map((segment) => segment.trim());
      if (segments[0]?.toLowerCase() !== "form-data") {
        throw new ApiError(400, "Invalid multipart content disposition");
      }

      for (const segment of segments.slice(1)) {
        const [name, rawValue] = segment.split("=");
        if (!name || rawValue === undefined) {
          continue;
        }

        const parsedValue = rawValue.trim().replace(/^"|"$/g, "");
        if (name === "name") {
          fieldName = parsedValue;
        } else if (name === "filename") {
          filename = parsedValue;
        }
      }
    }

    if (!fieldName) {
      throw new ApiError(400, "Multipart field name is required");
    }
    if (parts.has(fieldName)) {
      throw new ApiError(400, `Multipart field ${fieldName} must be provided only once`);
    }

    parts.set(fieldName, {
      value,
      filename,
      contentType: fieldContentType,
    });
  }

  return parts;
}

function parseBackupRestoreRequestFromMultipart(request: FastifyRequest): BackupRestoreRequest {
  if (!Buffer.isBuffer(request.body)) {
    throw new ApiError(400, "Backup restore requests must use multipart form data");
  }

  const parts = parseMultipartFormData(request.body, request.headers["content-type"]);
  const filePart = parts.get("file");
  if (!filePart) {
    throw new ApiError(400, "Backup restore file is required");
  }

  let backup: unknown;
  try {
    backup = JSON.parse(filePart.value);
  } catch {
    throw new ApiError(400, "Backup restore file must contain valid JSON");
  }

  try {
    return backupRestoreRequestSchema.parse({
      mode: parts.get("mode")?.value.trim(),
      target: parts.get("target")?.value.trim(),
      backup,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError(400, error.issues[0]?.message ?? "Invalid request");
    }

    throw error;
  }
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof ApiError) {
    return reply.code(error.statusCode).send({ message: error.message });
  }

  throw error;
}

function getBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError(401, "Authentication required");
  }

  return header.slice("Bearer ".length);
}

async function requireSession(request: FastifyRequest, store: ApiStore, options?: { allowPasswordReset?: boolean }) {
  const session = await store.getSession(getBearerToken(request));
  if (!session) {
    throw new ApiError(401, "Authentication required");
  }

  if (!options?.allowPasswordReset && session.passwordResetRequired) {
    throw new ApiError(403, "Password change required before accessing this resource");
  }

  return session;
}

function requirePermissions(session: AuthSession, permissions: AuthPermission[]) {
  if (!permissions.every((permission) => session.permissions.includes(permission))) {
    throw new ApiError(403, "You do not have permission to perform this action");
  }
}

export const registerRoutes: FastifyPluginAsync<RegisterRoutesOptions> = async (app, { store }) => {
  app.addContentTypeParser(/^multipart\/form-data(?:;.*)?$/u, { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  const handleBackupStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["backups:read"]);
      return backupStatusResponseSchema.parse(await store.getBackupStatus());
    } catch (error) {
      return sendError(reply, error);
    }
  };

  const handleBackupExport = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["backups:create"]);
      const query = parseWithSchema(backupExportQuerySchema, request.query);
      const backup = backupExportResponseSchema.parse(await store.createBackup(query.mode));
      reply.header("cache-control", "no-store");
      reply.header("content-disposition", `attachment; filename="${buildBackupFilename(backup.exportedAt)}"`);
      reply.type("application/json; charset=utf-8");
      return backup;
    } catch (error) {
      return sendError(reply, error);
    }
  };

  const handleBackupRestore = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["backups:restore"]);
      const body = parseBackupRestoreRequestFromMultipart(request);
      return backupRestoreResponseSchema.parse(
        await store.restoreBackup(body.target, {
          ...body.backup,
          users: {
            ...body.backup.users,
            items: body.backup.users.items.map((item) => normalizeLocalUserTransferItem(item)),
          },
        }),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  };

  const handleBackupStatusUpdate = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["backups:create"]);
      const body = parseWithSchema(updateBackupStatusRequestSchema, request.body);
      return backupStatusResponseSchema.parse(await store.updateBackupStatus(body));
    } catch (error) {
      return sendError(reply, error);
    }
  };

  app.get("/", async () =>
    apiIndexResponseSchema.parse({
      ...apiIndexExample,
      seededAccountsAvailable: await store.areSeededAccountsAvailable(),
    }),
  );
  app.get("/domain-rules", async () => domainRulesExample);
  app.get("/review-periods", async () => reviewPeriodsListResponseSchema.parse({ items: await store.listReviewPeriods() }));
  app.get("/review-periods/:id", async (request, reply) => {
    try {
      const reviewPeriodId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      return reviewPeriodResponseSchema.parse({
        item: await store.getReviewPeriod(reviewPeriodId),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
  app.get("/question-sets", async (request, reply) => {
    try {
      const query = parseWithSchema(reviewPeriodScopedQuerySchema, request.query);
      return questionSetsListResponseSchema.parse({
        items: await store.listQuestionSets(query.reviewPeriodId),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
  app.get("/question-sets/:id", async (request, reply) => {
    try {
      const questionSetId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      return questionSetResponseSchema.parse({
        item: await store.getQuestionSet(questionSetId),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
  app.get("/assignments", async (request, reply) => {
    try {
      const query = parseWithSchema(reviewPeriodScopedQuerySchema, request.query);
      return assignmentsListResponseSchema.parse({
        items: await store.listAssignments(query.reviewPeriodId),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
  app.get("/assignments/:id", async (request, reply) => {
    try {
      const assignmentId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      return assignmentResponseSchema.parse({
        item: await store.getAssignment(assignmentId),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
  app.get("/assessments", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      const query = parseWithSchema(assessmentsListQuerySchema, request.query);
      return assessmentsListResponseSchema.parse({ items: await store.listAssessments(session, query) });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/assessments/:id", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      const assessmentId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      return assessmentItemResponseSchema.parse({
        item: await store.getAssessment(session, assessmentId),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/foundation", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      return foundationSnapshotSchema.parse(await store.foundationSnapshot(session));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/auth/login", async (request, reply) => {
    try {
      const body = parseWithSchema(authLoginRequestSchema, request.body);
      return authLoginResponseSchema.parse({
        session: await store.authenticate(body.username, body.password),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/auth/me", async (request, reply) => {
    try {
      const session = await requireSession(request, store, { allowPasswordReset: true });
      return authMeResponseSchema.parse({ session });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    try {
      const session = await requireSession(request, store, { allowPasswordReset: true });
      await store.logout(session.token);
      return authLogoutResponseSchema.parse({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/auth/password/change", async (request, reply) => {
    try {
      const session = await requireSession(request, store, { allowPasswordReset: true });
      const body = parseWithSchema(authChangePasswordRequestSchema, request.body);
      return authChangePasswordResponseSchema.parse(
        await store.changeOwnPassword(session.token, body.currentPassword, body.newPassword),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/employees", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["employees:read"]);
      return employeesListResponseSchema.parse({
        items: await store.listEmployees(),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/employees/:id", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["employees:read"]);
      const employeeId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      return employeeResponseSchema.parse({
        item: await store.getEmployee(employeeId),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/employees", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["employees:create"]);
      const body = parseWithSchema(createEmployeeRequestSchema, request.body);
      reply.code(201);
      return employeeResponseSchema.parse({
        item: await store.createEmployee({
          ...body,
          status: body.status ?? "active",
        }),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch("/employees/:id", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["employees:update"]);
      const employeeId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(updateEmployeeRequestSchema, request.body);
      return employeeResponseSchema.parse({
        item: await store.updateEmployee(session.user, employeeId, body),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete("/employees/:id", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["employees:delete"]);
      const employeeId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      return deleteEmployeeResponseSchema.parse(await store.deleteEmployee(employeeId));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/employees/export", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["employees:export"]);
      const query = parseWithSchema(localUsersExportQuerySchema, request.query);
      return localUsersExportResponseSchema.parse(await store.exportLocalUsers(query.format ?? "json", query.mode));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/employees/import", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["employees:import"]);
      const body = parseWithSchema(localUsersImportRequestSchema, request.body);
      return localUsersImportResponseSchema.parse(
        await store.importLocalUsers(
          body.format,
          body.items.map((item) => normalizeLocalUserTransferItem(item)),
        ),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/employees/:id/password/set", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["employees:password:set"]);
      const employeeId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(setEmployeePasswordRequestSchema, request.body);
      return setEmployeePasswordResponseSchema.parse(await store.setPassword(employeeId, body.password));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/employees/:id/password/reset", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["employees:password:reset"]);
      const employeeId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(resetEmployeePasswordRequestSchema, request.body ?? {});
      return resetEmployeePasswordResponseSchema.parse(await store.resetPassword(employeeId, body.password));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/review-periods", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["reviewPeriods:create"]);
      const body = parseWithSchema(createReviewPeriodRequestSchema, request.body);
      reply.code(201);
      return reviewPeriodResponseSchema.parse({
        item: await store.createReviewPeriod(body),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch("/review-periods/:id", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["reviewPeriods:update"]);
      const reviewPeriodId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(updateReviewPeriodRequestSchema, request.body);
      return reviewPeriodResponseSchema.parse({
        item: await store.updateReviewPeriod(reviewPeriodId, body),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/review-periods/:id/archive", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["reviewPeriods:archive"]);
      const reviewPeriodId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      return reviewPeriodResponseSchema.parse({
        item: await store.archiveReviewPeriod(reviewPeriodId, session.user.id),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/review-periods/:id/unarchive", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["reviewPeriods:archive"]);
      const reviewPeriodId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      return reviewPeriodResponseSchema.parse({
        item: await store.unarchiveReviewPeriod(reviewPeriodId),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/review-periods/:id/question-sets", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["questionSets:create"]);
      const reviewPeriodId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(createQuestionSetRequestSchema, request.body);
      reply.code(201);
      return questionSetResponseSchema.parse({
        item: await store.createQuestionSet(reviewPeriodId, {
          ...body,
          headerMarkdown: body.headerMarkdown ?? "",
          footerMarkdown: body.footerMarkdown ?? "",
        }),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/question-categories", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["questionSets:update"]);
      return questionCategoriesListResponseSchema.parse({
        items: await store.listQuestionCategories(),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.put("/question-categories", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["questionSets:update"]);
      const body = parseWithSchema(updateQuestionCategoriesRequestSchema, request.body);
      return questionCategoriesListResponseSchema.parse({
        items: await store.replaceQuestionCategories(body),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch("/question-sets/:id", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["questionSets:update"]);
      const questionSetId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(updateQuestionSetRequestSchema, request.body);
      return questionSetResponseSchema.parse({
        item: await store.updateQuestionSet(questionSetId, body),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/question-sets/:id/activate", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["questionSets:activate"]);
      const questionSetId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      return questionSetResponseSchema.parse({
        item: await store.activateQuestionSet(questionSetId),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/review-periods/:id/question-sets/export", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["questionSets:export"]);
      const reviewPeriodId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const query = parseWithSchema(exportFormatQuerySchema, request.query);
      return exportStubResponseSchema.parse(await store.exportQuestionSets(reviewPeriodId, query.format ?? "json"));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/review-periods/:id/question-sets/import", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["questionSets:import"]);
      const reviewPeriodId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      parseWithSchema(importStubRequestSchema, request.body ?? {});
      return importStubResponseSchema.parse(await store.importQuestionSetsStub(reviewPeriodId));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/review-periods/:id/assignments", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["assignments:create"]);
      const reviewPeriodId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(createAssignmentRequestSchema, request.body);
      reply.code(201);
      return assignmentResponseSchema.parse({
        item: await store.createAssignment(reviewPeriodId, body),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch("/assignments/:id", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["assignments:update"]);
      const assignmentId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(updateAssignmentRequestSchema, request.body);
      return assignmentResponseSchema.parse({
        item: await store.updateAssignment(assignmentId, body),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete("/assignments/:id", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["assignments:delete"]);
      const assignmentId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      return deleteAssignmentResponseSchema.parse(await store.deleteAssignment(assignmentId));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/review-periods/:id/assignments/export", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["assignments:export"]);
      const reviewPeriodId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const query = parseWithSchema(exportFormatQuerySchema, request.query);
      return exportStubResponseSchema.parse(await store.exportAssignments(reviewPeriodId, query.format ?? "json"));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/review-periods/:id/assignments/import", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["assignments:import"]);
      const reviewPeriodId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      parseWithSchema(importStubRequestSchema, request.body ?? {});
      return importStubResponseSchema.parse(await store.importAssignmentsStub(reviewPeriodId));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/backups/status", handleBackupStatus);
  app.get("/admin/backups/status", handleBackupStatus);
  app.patch("/admin/backups/status", handleBackupStatusUpdate);
  app.get("/admin/backups/export", handleBackupExport);
  app.post("/admin/backups/restore", { bodyLimit: adminBackupRestoreBodyLimit }, handleBackupRestore);

  app.post("/review-periods/:id/assessments", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      const reviewPeriodId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(createAssessmentRequestSchema, request.body);
      reply.code(201);
      return assessmentItemResponseSchema.parse({
        item: await store.createAssessment(session, reviewPeriodId, body),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch("/assessments/:id/save", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      const assessmentId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(saveAssessmentDraftRequestSchema, request.body ?? {});
      return assessmentItemResponseSchema.parse({
        item: await store.saveAssessmentDraft(session, assessmentId, {
          responses: body.responses ?? [],
        }),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/assessments/:id/submit", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      const assessmentId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(submitAssessmentRequestSchema, request.body ?? {});
      return assessmentItemResponseSchema.parse({
        item: await store.submitAssessment(session, assessmentId, {
          responses: body.responses ?? [],
        }),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/assessments/:id/accept", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["assessments:accept"]);
      const assessmentId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(acceptAssessmentRequestSchema, request.body ?? {});
      return assessmentItemResponseSchema.parse({
        item: await store.acceptAssessment(session, assessmentId, body.managerNotes),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/assessments/:id/reject-to-draft", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["assessments:accept"]);
      const assessmentId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(rejectAssessmentToDraftRequestSchema, request.body ?? {});
      return assessmentItemResponseSchema.parse({
        item: await store.rejectAssessmentToDraft(session, assessmentId, body.managerNotes),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/assessments/:id/review", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["assessments:review"]);
      const assessmentId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(reviewAssessmentRequestSchema, request.body);
      return assessmentItemResponseSchema.parse({
        item: await store.reviewAssessment(session, assessmentId, {
          managerNotes: body.managerNotes,
          reviewed: body.reviewed ?? false,
        }),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/assessments/:id/reassign", async (request, reply) => {
    try {
      const session = await requireSession(request, store);
      requirePermissions(session, ["assessments:reassign"]);
      const assessmentId = parseWithSchema(idSchema, (request.params as { id?: unknown }).id);
      const body = parseWithSchema(reassignAssessmentRequestSchema, request.body);
      return assessmentReassignmentResponseSchema.parse(await store.reassignAssessment(session, assessmentId, body));
    } catch (error) {
      return sendError(reply, error);
    }
  });
};
