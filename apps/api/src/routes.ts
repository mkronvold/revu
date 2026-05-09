import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import {
  acceptAssessmentRequestSchema,
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
  localUsersImportRequestSchema,
  localUsersImportResponseSchema,
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
  updateAssignmentRequestSchema,
  updateEmployeeRequestSchema,
  updateQuestionSetRequestSchema,
  updateReviewPeriodRequestSchema,
  type AuthPermission,
  type AuthSession,
} from "@revu/contracts";
import { ZodError, z, type ZodType } from "zod";

import { ApiError, type ApiStore } from "./store.js";

type RegisterRoutesOptions = {
  store: ApiStore;
};

const exportFormatQuerySchema = z.object({
  format: exportFormatSchema.default("json"),
});

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
  app.get("/", async () => apiIndexExample);
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
      const query = parseWithSchema(exportFormatQuerySchema, request.query);
      return localUsersExportResponseSchema.parse(await store.exportLocalUsers(query.format ?? "json"));
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
          body.items.map((item) => ({
            ...item,
            passwordResetRequired: item.passwordResetRequired ?? false,
          })),
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
