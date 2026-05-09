import { z } from "zod";

import {
  assessmentReviewStateSchema,
  assessmentArchiveStateSchema,
  assessmentResponseSchema,
  assessmentSchema,
  assignmentSchema,
  employeeAdminSchema,
  employeeSchema,
  employeeStatusSchema,
  appRoleSchema,
  idSchema,
  isoTimestampSchema,
  localUserTransferItemSchema,
  questionSchema,
  questionSetSchema,
  reviewPeriodSchema,
  usernameSchema,
} from "./domain.js";

export const apiResourceSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  description: z.string().min(1),
});

export const apiIndexResponseSchema = z.object({
  name: z.literal("revu-api"),
  version: z.literal("0.1.0"),
  resources: z.array(apiResourceSchema),
});

export const domainRulesResponseSchema = z.object({
  postgresIsSourceOfTruth: z.literal(true),
  employeeAssessorMatchesPeerAssignment: z.literal(true),
  acceptedAssessmentsAreImmutable: z.literal(true),
  singleActiveQuestionSetPerTarget: z.literal(true),
  archiveIsDrivenByReviewPeriod: z.literal(true),
  assessmentReviewTransitions: z.object({
    new: z.array(assessmentReviewStateSchema),
    draft: z.array(assessmentReviewStateSchema),
    submitted: z.array(assessmentReviewStateSchema),
    accepted: z.array(assessmentReviewStateSchema),
    reviewed: z.array(assessmentReviewStateSchema),
  }),
});

export const employeesListResponseSchema = z.object({
  items: z.array(employeeSchema),
});

export const employeeResponseSchema = z.object({
  item: employeeAdminSchema,
});

export const reviewPeriodsListResponseSchema = z.object({
  items: z.array(reviewPeriodSchema),
});

export const reviewPeriodResponseSchema = z.object({
  item: reviewPeriodSchema,
});

export const questionSetsListResponseSchema = z.object({
  items: z.array(questionSetSchema),
});

export const questionSetResponseSchema = z.object({
  item: questionSetSchema,
});

export const assignmentsListResponseSchema = z.object({
  items: z.array(assignmentSchema),
});

export const assignmentResponseSchema = z.object({
  item: assignmentSchema,
});

export const deleteAssignmentResponseSchema = z.object({
  assignmentId: idSchema,
  deleted: z.literal(true),
});

export const assessmentsListResponseSchema = z.object({
  items: z.array(assessmentSchema),
});

export const assessmentItemResponseSchema = z.object({
  item: assessmentSchema,
});

export const foundationSnapshotSchema = z.object({
  employees: z.array(employeeSchema),
  reviewPeriods: z.array(reviewPeriodSchema),
  questionSets: z.array(questionSetSchema),
  assignments: z.array(assignmentSchema),
  assessments: z.array(assessmentSchema),
});

export const authPermissionSchema = z.enum([
  "employees:read",
  "employees:create",
  "employees:update",
  "employees:delete",
  "employees:import",
  "employees:export",
  "employees:password:set",
  "employees:password:reset",
  "reviewPeriods:create",
  "reviewPeriods:update",
  "reviewPeriods:archive",
  "questionSets:create",
  "questionSets:update",
  "questionSets:activate",
  "questionSets:import",
  "questionSets:export",
  "assignments:create",
  "assignments:update",
  "assignments:delete",
  "assignments:import",
  "assignments:export",
  "assessments:read",
  "assessments:accept",
  "assessments:review",
  "assessments:reassign",
]);

export const authSessionUserSchema = employeeSchema;

export const authSessionSchema = z.object({
  token: z.string().min(1),
  issuedAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
  passwordResetRequired: z.boolean(),
  permissions: z.array(authPermissionSchema),
  user: authSessionUserSchema,
});

export const authLoginRequestSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8),
});

export const authLoginResponseSchema = z.object({
  session: authSessionSchema,
});

export const authMeResponseSchema = authLoginResponseSchema;

export const authLogoutResponseSchema = z.object({
  success: z.literal(true),
});

export const authChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

export const authChangePasswordResponseSchema = z.object({
  session: authSessionSchema,
  lastPasswordChangeAt: isoTimestampSchema,
});

export const createEmployeeRequestSchema = z.object({
  username: usernameSchema,
  fullName: z.string().min(1),
  email: z.string().email(),
  role: appRoleSchema,
  status: employeeStatusSchema.default("active"),
  managerId: idSchema.nullable().optional(),
  assessorId: idSchema.nullable().optional(),
  password: z.string().min(8).optional(),
});

export const updateEmployeeRequestSchema = z
  .object({
    username: usernameSchema,
    fullName: z.string().min(1),
    email: z.string().email(),
    role: appRoleSchema,
    status: employeeStatusSchema,
    managerId: idSchema.nullable(),
    assessorId: idSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const deleteEmployeeResponseSchema = z.object({
  employeeId: idSchema,
  deleted: z.literal(true),
});

export const setEmployeePasswordRequestSchema = z.object({
  password: z.string().min(8),
});

export const setEmployeePasswordResponseSchema = z.object({
  employeeId: idSchema,
  passwordResetRequired: z.literal(false),
  lastPasswordChangeAt: isoTimestampSchema,
});

export const resetEmployeePasswordRequestSchema = z.object({
  password: z.string().min(8).optional(),
});

export const resetEmployeePasswordResponseSchema = z.object({
  employeeId: idSchema,
  temporaryPassword: z.string().min(8),
  passwordResetRequired: z.literal(true),
  lastPasswordChangeAt: isoTimestampSchema,
});

export const createReviewPeriodRequestSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  startDate: z.string().date(),
  dueDate: z.string().date(),
});

export const updateReviewPeriodRequestSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    startDate: z.string().date(),
    dueDate: z.string().date(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const createQuestionInputSchema = questionSchema.omit({ id: true }).extend({
  id: idSchema.optional(),
});

export const createQuestionSetRequestSchema = z.object({
  target: questionSetSchema.shape.target,
  title: z.string().min(1),
  headerMarkdown: z.string().default(""),
  footerMarkdown: z.string().default(""),
  questions: z.array(createQuestionInputSchema).min(1),
});

export const updateQuestionSetRequestSchema = z
  .object({
    title: z.string().min(1),
    headerMarkdown: z.string(),
    footerMarkdown: z.string(),
    questions: z.array(createQuestionInputSchema).min(1),
    status: questionSetSchema.shape.status,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const createAssignmentRequestSchema = z.object({
  employeeId: idSchema,
  managerId: idSchema.nullable(),
  assessorId: idSchema,
});

export const updateAssignmentRequestSchema = z
  .object({
    managerId: idSchema.nullable(),
    assessorId: idSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const reviewPeriodScopedQuerySchema = z.object({
  reviewPeriodId: idSchema.optional(),
});

export const assessmentsListQuerySchema = z.object({
  reviewPeriodId: idSchema.optional(),
  employeeId: idSchema.optional(),
  assessorId: idSchema.optional(),
  assignmentId: idSchema.optional(),
  target: questionSetSchema.shape.target.optional(),
  reviewState: assessmentReviewStateSchema.optional(),
  archiveState: assessmentArchiveStateSchema.optional(),
});

export const createAssessmentRequestSchema = z.object({
  employeeId: idSchema,
  target: questionSetSchema.shape.target,
  assignmentId: idSchema.nullable().optional(),
});

export const saveAssessmentDraftRequestSchema = z.object({
  responses: z.array(assessmentResponseSchema).default([]),
});

export const submitAssessmentRequestSchema = z.object({
  responses: z.array(assessmentResponseSchema).default([]),
});

export const acceptAssessmentRequestSchema = z.object({
  managerNotes: z.string().trim().min(1).nullable().optional(),
});

export const rejectAssessmentToDraftRequestSchema = z.object({
  managerNotes: z.string().trim().min(1).nullable().optional(),
});

export const reviewAssessmentRequestSchema = z.object({
  managerNotes: z.string().trim().min(1),
  reviewed: z.boolean().default(false),
});

export const reassignAssessmentRequestSchema = z
  .object({
    managerId: idSchema.nullable(),
    assessorId: idSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const assessmentReassignmentResponseSchema = z.object({
  assessment: assessmentSchema,
  employee: employeeSchema,
  assignment: assignmentSchema.nullable(),
});

export const exportFormatSchema = z.enum(["json", "csv"]);

export const localUsersExportResponseSchema = z.object({
  format: exportFormatSchema,
  exportedAt: isoTimestampSchema,
  itemCount: z.number().int().nonnegative(),
  items: z.array(localUserTransferItemSchema),
});

export const localUsersImportRequestSchema = z.object({
  format: exportFormatSchema,
  items: z.array(localUserTransferItemSchema).min(1),
});

export const localUsersImportResponseSchema = z.object({
  format: exportFormatSchema,
  importedAt: isoTimestampSchema,
  itemCount: z.number().int().positive(),
  createdCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  items: z.array(employeeAdminSchema),
});

export const exportStubResponseSchema = z.object({
  reviewPeriodId: idSchema,
  resource: z.enum(["questionSets", "assignments"]),
  format: exportFormatSchema,
  exportedAt: isoTimestampSchema,
  stub: z.literal(true),
  itemCount: z.number().int().nonnegative(),
});

export const importStubRequestSchema = z.object({
  format: exportFormatSchema,
});

export const importStubResponseSchema = z.object({
  reviewPeriodId: idSchema,
  resource: z.enum(["questionSets", "assignments"]),
  accepted: z.literal(false),
  status: z.literal("not_implemented"),
  supportedFormats: z.array(exportFormatSchema).min(1),
});

export type ApiIndexResponse = z.infer<typeof apiIndexResponseSchema>;
export type DomainRulesResponse = z.infer<typeof domainRulesResponseSchema>;
export type EmployeesListResponse = z.infer<typeof employeesListResponseSchema>;
export type EmployeeResponse = z.infer<typeof employeeResponseSchema>;
export type ReviewPeriodsListResponse = z.infer<typeof reviewPeriodsListResponseSchema>;
export type ReviewPeriodResponse = z.infer<typeof reviewPeriodResponseSchema>;
export type QuestionSetsListResponse = z.infer<typeof questionSetsListResponseSchema>;
export type QuestionSetResponse = z.infer<typeof questionSetResponseSchema>;
export type AssignmentsListResponse = z.infer<typeof assignmentsListResponseSchema>;
export type AssignmentResponse = z.infer<typeof assignmentResponseSchema>;
export type DeleteAssignmentResponse = z.infer<typeof deleteAssignmentResponseSchema>;
export type AssessmentsListResponse = z.infer<typeof assessmentsListResponseSchema>;
export type AssessmentItemResponse = z.infer<typeof assessmentItemResponseSchema>;
export type FoundationSnapshot = z.infer<typeof foundationSnapshotSchema>;
export type AuthPermission = z.infer<typeof authPermissionSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type AuthLoginRequest = z.infer<typeof authLoginRequestSchema>;
export type AuthLoginResponse = z.infer<typeof authLoginResponseSchema>;
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;
export type AuthLogoutResponse = z.infer<typeof authLogoutResponseSchema>;
export type AuthChangePasswordRequest = z.infer<typeof authChangePasswordRequestSchema>;
export type AuthChangePasswordResponse = z.infer<typeof authChangePasswordResponseSchema>;
export type CreateEmployeeRequest = z.infer<typeof createEmployeeRequestSchema>;
export type UpdateEmployeeRequest = z.infer<typeof updateEmployeeRequestSchema>;
export type DeleteEmployeeResponse = z.infer<typeof deleteEmployeeResponseSchema>;
export type SetEmployeePasswordRequest = z.infer<typeof setEmployeePasswordRequestSchema>;
export type SetEmployeePasswordResponse = z.infer<typeof setEmployeePasswordResponseSchema>;
export type ResetEmployeePasswordRequest = z.infer<typeof resetEmployeePasswordRequestSchema>;
export type ResetEmployeePasswordResponse = z.infer<typeof resetEmployeePasswordResponseSchema>;
export type CreateReviewPeriodRequest = z.infer<typeof createReviewPeriodRequestSchema>;
export type UpdateReviewPeriodRequest = z.infer<typeof updateReviewPeriodRequestSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionInputSchema>;
export type CreateQuestionSetRequest = z.infer<typeof createQuestionSetRequestSchema>;
export type UpdateQuestionSetRequest = z.infer<typeof updateQuestionSetRequestSchema>;
export type CreateAssignmentRequest = z.infer<typeof createAssignmentRequestSchema>;
export type UpdateAssignmentRequest = z.infer<typeof updateAssignmentRequestSchema>;
export type ReviewPeriodScopedQuery = z.infer<typeof reviewPeriodScopedQuerySchema>;
export type AssessmentsListQuery = z.infer<typeof assessmentsListQuerySchema>;
export type CreateAssessmentRequest = z.infer<typeof createAssessmentRequestSchema>;
export type SaveAssessmentDraftRequest = z.infer<typeof saveAssessmentDraftRequestSchema>;
export type SubmitAssessmentRequest = z.infer<typeof submitAssessmentRequestSchema>;
export type AcceptAssessmentRequest = z.infer<typeof acceptAssessmentRequestSchema>;
export type RejectAssessmentToDraftRequest = z.infer<typeof rejectAssessmentToDraftRequestSchema>;
export type ReviewAssessmentRequest = z.infer<typeof reviewAssessmentRequestSchema>;
export type ReassignAssessmentRequest = z.infer<typeof reassignAssessmentRequestSchema>;
export type AssessmentReassignmentResponse = z.infer<typeof assessmentReassignmentResponseSchema>;
export type LocalUsersExportResponse = z.infer<typeof localUsersExportResponseSchema>;
export type LocalUsersImportRequest = z.infer<typeof localUsersImportRequestSchema>;
export type LocalUsersImportResponse = z.infer<typeof localUsersImportResponseSchema>;
export type ExportStubResponse = z.infer<typeof exportStubResponseSchema>;
export type ImportStubRequest = z.infer<typeof importStubRequestSchema>;
export type ImportStubResponse = z.infer<typeof importStubResponseSchema>;
