import { z } from "zod";

import {
  assessmentReviewStateSchema,
  assessmentArchiveStateSchema,
  assessmentResponseSchema,
  assessmentSchema,
  assignmentSchema,
  defaultWorkflowMarkdown,
  defaultWorkflowVisibility,
  employeeAdminSchema,
  employeeSchema,
  employeeStatusSchema,
  appRoleSchema,
  idSchema,
  isoTimestampSchema,
  localUsersExportModeSchema,
  localUserTransferItemSchema,
  questionCategoryNameSchema,
  questionSchema,
  questionSetSchema,
  reviewPeriodSchema,
  usernameSchema,
  workflowSettingsSchema,
} from "./domain.js";

export const apiResourceSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  description: z.string().min(1),
});

export const apiIndexResponseSchema = z.object({
  name: z.literal("revu-api"),
  version: z.literal("0.1.0"),
  seededAccountsAvailable: z.boolean(),
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
  workflow: workflowSettingsSchema,
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
  "reviewPeriods:delete",
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
  "workflow:update",
  "backups:read",
  "backups:create",
  "backups:restore",
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

export const authUpdateProfileRequestSchema = z
  .object({
    fullName: z.string().min(1),
    email: z.string().email(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const authUpdateProfileResponseSchema = authLoginResponseSchema;

export const createEmployeeRequestSchema = z.object({
  username: usernameSchema,
  fullName: z.string().min(1),
  email: z.string().email(),
  role: appRoleSchema,
  status: employeeStatusSchema.default("active"),
  managerId: idSchema.nullable().optional(),
  assessor1Id: idSchema.nullable().optional(),
  assessor2Id: idSchema.nullable().optional(),
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
    assessor1Id: idSchema.nullable(),
    assessor2Id: idSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const editableReviewPeriodStatusSchema = z.enum(["active", "inactive"]);

export const deleteEmployeeResponseSchema = z.object({
  employeeId: idSchema,
  deleted: z.literal(true),
});

export const deleteReviewPeriodResponseSchema = z.object({
  reviewPeriodId: idSchema,
  label: z.string().min(1),
  deleted: z.literal(true),
  questionSetCount: z.number().int().nonnegative(),
  assessmentCount: z.number().int().nonnegative(),
  assignmentCount: z.number().int().nonnegative(),
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
  assessmentDueDate: z.string().date(),
  reviewDueDate: z.string().date(),
  status: editableReviewPeriodStatusSchema.default("inactive"),
});

export const updateReviewPeriodRequestSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    startDate: z.string().date(),
    dueDate: z.string().date(),
    assessmentDueDate: z.string().date(),
    reviewDueDate: z.string().date(),
    status: editableReviewPeriodStatusSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const syncAssessmentsResponseSchema = z.object({
  reviewPeriodId: idSchema,
  createdSelfAssessments: z.number().int().nonnegative(),
  createdPeerAssessments: z.number().int().nonnegative(),
});

export const clearReadyAssessmentsResponseSchema = z.object({
  reviewPeriodId: idSchema,
  clearedAssessments: z.number().int().nonnegative(),
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
  mode: localUsersExportModeSchema,
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

export const questionCategoriesListResponseSchema = z.object({
  items: z.array(questionCategoryNameSchema),
});

export const updateQuestionCategoriesRequestSchema = z.object({
  items: z.array(questionCategoryNameSchema),
});

export const updateWorkflowSettingsRequestSchema = workflowSettingsSchema;

export const workflowSettingsResponseSchema = z.object({
  item: workflowSettingsSchema,
});

export const backupReviewDataSchema = foundationSnapshotSchema
  .omit({
    employees: true,
  })
  .extend({
    questionCategories: z.array(questionCategoryNameSchema).default([]),
    workflow: workflowSettingsSchema.default({
      markdown: defaultWorkflowMarkdown,
      visibility: defaultWorkflowVisibility,
    }),
  });

export const backupSnapshotSchema = z.object({
  version: z.literal(1),
  exportedAt: isoTimestampSchema,
  users: z.object({
    mode: localUsersExportModeSchema,
    itemCount: z.number().int().nonnegative(),
    items: z.array(localUserTransferItemSchema),
  }),
  reviewData: backupReviewDataSchema,
});

export const backupRestoreScopeSchema = z.enum(["all", "users", "questions", "reviews"]);
export const backupRestoreModeSchema = z.literal("replace");
export const backupScheduleSchema = z.enum(["1hr", "3hr", "6hr", "12hr", "daily", "weekly"]);
export const backupStoredFileNameSchema = z.string().min(1).max(255).regex(/^[A-Za-z0-9._-]+$/);
export const backupRestoreTargetSchema = z
  .union([backupRestoreScopeSchema, z.literal("full")])
  .transform((value) => (value === "full" ? "all" : value));
export const backupExportQuerySchema = z.object({
  mode: localUsersExportModeSchema.default("preserve-passwords"),
});

export const backupStatusResponseSchema = z.object({
  automaticBackupsEnabled: z.boolean(),
  schedule: backupScheduleSchema,
  retentionCount: z.number().int().positive(),
  lastBackupAt: isoTimestampSchema.nullable(),
  lastRestoreAt: isoTimestampSchema.nullable(),
  defaultUserExportMode: z.literal("preserve-passwords"),
  replaceStrategy: z.literal("replace"),
  supportedFormats: z.array(z.literal("json")).length(1),
  supportedSchedules: z.array(backupScheduleSchema).min(1),
  supportedRestoreModes: z.array(backupRestoreModeSchema).length(1),
  supportedRestoreScopes: z.array(backupRestoreScopeSchema).min(1),
  supportedUserExportModes: z.array(localUsersExportModeSchema).length(2),
});

export const updateBackupStatusRequestSchema = z.object({
  automaticBackupsEnabled: z.boolean(),
  schedule: backupScheduleSchema,
  retentionCount: z.number().int().positive(),
});

export const backupStoredFileSchema = z.object({
  name: backupStoredFileNameSchema,
  storedAt: isoTimestampSchema,
  sizeBytes: z.number().int().nonnegative(),
});

export const backupStoredFilesResponseSchema = z.object({
  items: z.array(backupStoredFileSchema),
});

export const backupStoredFileResponseSchema = z.object({
  item: backupStoredFileSchema,
  renamedFrom: z.string().min(1).optional(),
});

export const backupStoredFileDeleteResponseSchema = z.object({
  name: backupStoredFileNameSchema,
  deleted: z.literal(true),
});

export const backupStoredFileDownloadQuerySchema = z.object({
  mode: localUsersExportModeSchema.default("preserve-passwords"),
});

export const backupStoredFileRestoreRequestSchema = z.object({
  mode: backupRestoreModeSchema.default("replace"),
  target: backupRestoreTargetSchema.default("all"),
});

export const backupExportResponseSchema = backupSnapshotSchema;

export const backupRestoreRequestSchema = z.object({
  mode: backupRestoreModeSchema.default("replace"),
  target: backupRestoreTargetSchema.default("all"),
  backup: backupSnapshotSchema,
});

export const backupRestoreResponseSchema = z.object({
  mode: backupRestoreModeSchema,
  target: backupRestoreScopeSchema,
  restoredAt: isoTimestampSchema,
  userMode: localUsersExportModeSchema,
  counts: z.object({
    users: z.number().int().nonnegative(),
    reviewPeriods: z.number().int().nonnegative(),
    questionSets: z.number().int().nonnegative(),
    assignments: z.number().int().nonnegative(),
    assessments: z.number().int().nonnegative(),
  }),
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
export type AuthUpdateProfileRequest = z.infer<typeof authUpdateProfileRequestSchema>;
export type AuthUpdateProfileResponse = z.infer<typeof authUpdateProfileResponseSchema>;
export type CreateEmployeeRequest = z.infer<typeof createEmployeeRequestSchema>;
export type UpdateEmployeeRequest = z.infer<typeof updateEmployeeRequestSchema>;
export type DeleteEmployeeResponse = z.infer<typeof deleteEmployeeResponseSchema>;
export type DeleteReviewPeriodResponse = z.infer<typeof deleteReviewPeriodResponseSchema>;
export type SetEmployeePasswordRequest = z.infer<typeof setEmployeePasswordRequestSchema>;
export type SetEmployeePasswordResponse = z.infer<typeof setEmployeePasswordResponseSchema>;
export type ResetEmployeePasswordRequest = z.infer<typeof resetEmployeePasswordRequestSchema>;
export type ResetEmployeePasswordResponse = z.infer<typeof resetEmployeePasswordResponseSchema>;
export type CreateReviewPeriodRequest = z.infer<typeof createReviewPeriodRequestSchema>;
export type UpdateReviewPeriodRequest = z.infer<typeof updateReviewPeriodRequestSchema>;
export type SyncAssessmentsResponse = z.infer<typeof syncAssessmentsResponseSchema>;
export type ClearReadyAssessmentsResponse = z.infer<typeof clearReadyAssessmentsResponseSchema>;
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
export type QuestionCategoriesListResponse = z.infer<typeof questionCategoriesListResponseSchema>;
export type UpdateQuestionCategoriesRequest = z.infer<typeof updateQuestionCategoriesRequestSchema>;
export type UpdateWorkflowSettingsRequest = z.infer<typeof updateWorkflowSettingsRequestSchema>;
export type WorkflowSettingsResponse = z.infer<typeof workflowSettingsResponseSchema>;
export type BackupReviewData = z.infer<typeof backupReviewDataSchema>;
export type BackupSnapshot = z.infer<typeof backupSnapshotSchema>;
export type BackupExportQuery = z.infer<typeof backupExportQuerySchema>;
export type BackupExportResponse = z.infer<typeof backupExportResponseSchema>;
export type BackupSchedule = z.infer<typeof backupScheduleSchema>;
export type BackupStoredFileName = z.infer<typeof backupStoredFileNameSchema>;
export type BackupStoredFile = z.infer<typeof backupStoredFileSchema>;
export type BackupStoredFilesResponse = z.infer<typeof backupStoredFilesResponseSchema>;
export type BackupStoredFileResponse = z.infer<typeof backupStoredFileResponseSchema>;
export type BackupStoredFileDeleteResponse = z.infer<typeof backupStoredFileDeleteResponseSchema>;
export type BackupStoredFileDownloadQuery = z.infer<typeof backupStoredFileDownloadQuerySchema>;
export type BackupStoredFileRestoreRequest = z.infer<typeof backupStoredFileRestoreRequestSchema>;
export type BackupRestoreMode = z.infer<typeof backupRestoreModeSchema>;
export type BackupRestoreScope = z.infer<typeof backupRestoreScopeSchema>;
export type BackupRestoreTarget = z.infer<typeof backupRestoreTargetSchema>;
export type BackupStatusResponse = z.infer<typeof backupStatusResponseSchema>;
export type UpdateBackupStatusRequest = z.infer<typeof updateBackupStatusRequestSchema>;
export type BackupRestoreRequest = z.infer<typeof backupRestoreRequestSchema>;
export type BackupRestoreResponse = z.infer<typeof backupRestoreResponseSchema>;
