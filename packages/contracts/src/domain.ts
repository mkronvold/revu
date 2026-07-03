import { z } from "zod";

export const idSchema = z.string().uuid();
export const isoTimestampSchema = z.string().datetime({ offset: true });
export const isoDateSchema = z.string().date();
export const usernameSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, "Username must contain only letters, numbers, dots, underscores, or dashes");

export const appRoleSchema = z.enum(["employee", "manager", "admin"]);
export const employeeStatusSchema = z.enum(["active", "inactive"]);
export const reviewPeriodStatusSchema = z.enum(["active", "inactive", "archived"]);
export const questionTargetSchema = z.enum(["self", "peer"]);
export const questionTypeSchema = z.enum(["subjective", "ranking", "narrative"]);
export const questionSetStatusSchema = z.enum(["draft", "active"]);
export const workflowVisibilitySchema = z.enum(["all", "managers", "admin only"]);
export const assessmentReviewStateSchema = z.enum([
  "new",
  "draft",
  "submitted",
  "accepted",
  "ready_for_meeting",
  "scheduled",
  "concluded",
  "reviewed",
]);
export const assessmentStatusSchema = assessmentReviewStateSchema;
export const assessmentArchiveStateSchema = z.enum(["active", "archived"]);
export const assessmentReviewerRoleSchema = z.enum(["reviewer1", "reviewer2"]);
export const localUsersExportModeSchema = z.enum(["rotate-passcodes", "preserve-passwords"]);
export const localUserCredentialKindSchema = z.enum(["password", "password-hash", "unset"]);
export const questionCategoryNameSchema = z.string().trim().min(1);
export const defaultWorkflowMarkdown = `### Active assessment lifecycle
- Admin creates the \`Review Period\` plus self and peer \`Question Sets\`
- Managers align peer assignments and reviewer 1 / reviewer 2 coverage for the cycle
- Employees use \`Dashboard\` to move assigned assessments through \`new\`, \`draft\`, and \`submitted\`
- Managers or admins accept submitted assessments so the employee assessment set becomes \`accepted\`
- Dashboard follow-up treats accepted sets as \`ready to be scheduled\` and then marks them \`scheduled\`
- Reviewer 1 and reviewer 2 each record their own conclusion; once both finish, the set becomes \`concluded\`
- \`Dashboard\` stays the operational workflow surface, while admin \`Assessments\` remains the override and visibility route
- When the cycle is complete, admins archive the \`Review Period\``;
export const defaultWorkflowVisibility = "all" as const;
const bcryptHashSchema = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const scryptHashSchema = /^[0-9a-f]{32}:[0-9a-f]{128}$/i;

const validateDistinctReviewers = (
  value: { id?: string; reviewer1Id?: string | null; reviewer2Id?: string | null },
  context: z.RefinementCtx,
) => {
  if (value.reviewer1Id !== undefined && value.reviewer1Id !== null && value.reviewer1Id === value.id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reviewer1Id"],
      message: "Reviewer 1 cannot be the employee",
    });
  }

  if (value.reviewer2Id !== undefined && value.reviewer2Id !== null && value.reviewer2Id === value.id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reviewer2Id"],
      message: "Reviewer 2 cannot be the employee",
    });
  }

  if (
    value.reviewer1Id !== undefined &&
    value.reviewer1Id !== null &&
    value.reviewer2Id !== undefined &&
    value.reviewer2Id !== null &&
    value.reviewer1Id === value.reviewer2Id
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reviewer2Id"],
      message: "Reviewer 1 and reviewer 2 must be different users",
    });
  }
};

const employeeBaseSchema = z.object({
  id: idSchema,
  username: usernameSchema,
  fullName: z.string().min(1),
  email: z.string().email(),
  role: appRoleSchema,
  status: employeeStatusSchema,
  managerId: idSchema.nullable(),
  assessor1Id: idSchema.nullable(),
  assessor2Id: idSchema.nullable(),
  reviewer1Id: idSchema.nullable(),
  reviewer2Id: idSchema.nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const employeeSchema = employeeBaseSchema.superRefine(validateDistinctReviewers);

export const employeeAuthMetadataSchema = z.object({
  passwordConfigured: z.boolean(),
  passwordResetRequired: z.boolean(),
  lastPasswordChangeAt: isoTimestampSchema.nullable(),
});

export const employeeAdminSchema = employeeBaseSchema.extend({
  auth: employeeAuthMetadataSchema,
}).superRefine(validateDistinctReviewers);

export const localUserTransferItemSchema = z.object({
  id: idSchema.optional(),
  username: usernameSchema,
  fullName: z.string().min(1),
  email: z.string().email(),
  role: appRoleSchema,
  status: employeeStatusSchema,
  managerUsername: usernameSchema.nullable(),
  assessor1Username: usernameSchema.nullable(),
  assessor2Username: usernameSchema.nullable(),
  reviewer1Username: usernameSchema.nullable().default(null),
  reviewer2Username: usernameSchema.nullable().default(null),
  password: z.string(),
  credentialKind: localUserCredentialKindSchema.optional(),
  passwordResetRequired: z.boolean().default(false),
}).superRefine((value, context) => {
  const credentialKind = value.credentialKind ?? "password";

  if (credentialKind === "unset") {
    if (value.password.length !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Unset credentials must use an empty password value",
      });
    }
    return;
  }

  if (credentialKind === "password" && value.password.length < 8) {
    context.addIssue({
      code: z.ZodIssueCode.too_small,
      minimum: 8,
      inclusive: true,
      origin: "string",
      type: "string",
      path: ["password"],
      message: "Password must be at least 8 characters",
    });
    return;
  }

  if (credentialKind === "password-hash" && !bcryptHashSchema.test(value.password) && !scryptHashSchema.test(value.password)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["password"],
      message: "Password hash must use a supported stored-password format",
    });
  }

  if (
    value.assessor1Username !== null &&
    value.assessor2Username !== null &&
    value.assessor1Username.toLowerCase() === value.assessor2Username.toLowerCase()
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["assessor2Username"],
      message: "Assessor 1 and assessor 2 must be different users",
    });
  }

  if (
    value.reviewer1Username !== null &&
    value.reviewer1Username.toLowerCase() === value.username.toLowerCase()
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reviewer1Username"],
      message: "Reviewer 1 cannot be the employee",
    });
  }

  if (
    value.reviewer2Username !== null &&
    value.reviewer2Username.toLowerCase() === value.username.toLowerCase()
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reviewer2Username"],
      message: "Reviewer 2 cannot be the employee",
    });
  }

  if (
    value.reviewer1Username !== null &&
    value.reviewer2Username !== null &&
    value.reviewer1Username.toLowerCase() === value.reviewer2Username.toLowerCase()
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reviewer2Username"],
      message: "Reviewer 1 and reviewer 2 must be different users",
    });
  }
});

export const reviewPeriodSchema = z.object({
  id: idSchema,
  key: z.string().min(1),
  label: z.string().min(1),
  startDate: isoDateSchema,
  dueDate: isoDateSchema,
  assessmentDueDate: isoDateSchema,
  reviewDueDate: isoDateSchema,
  status: reviewPeriodStatusSchema,
  archivedAt: isoTimestampSchema.nullable(),
  archivedByEmployeeId: idSchema.nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const workflowSettingsSchema = z.object({
  markdown: z.string(),
  visibility: workflowVisibilitySchema,
});

export const questionSchema = z.object({
  id: idSchema,
  order: z.number().int().positive(),
  type: questionTypeSchema,
  category: z.string().min(1).nullable(),
  prompt: z.string().min(1),
});

export const questionSetSchema = z.object({
  id: idSchema,
  reviewPeriodId: idSchema,
  target: questionTargetSchema,
  status: questionSetStatusSchema,
  isReadOnly: z.boolean(),
  title: z.string().min(1),
  headerMarkdown: z.string(),
  footerMarkdown: z.string(),
  questions: z.array(questionSchema),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const assignmentSchema = z.object({
  id: idSchema,
  reviewPeriodId: idSchema,
  employeeId: idSchema,
  managerId: idSchema.nullable(),
  assessorId: idSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const assessmentResponseSchema = z.object({
  questionId: idSchema,
  order: z.number().int().positive(),
  response: z.string(),
});

export const assessmentSchema = z.object({
  id: idSchema,
  reviewPeriodId: idSchema,
  questionSetId: idSchema,
  assignmentId: idSchema.nullable(),
  target: questionTargetSchema,
  employeeId: idSchema,
  assessorId: idSchema,
  reviewState: assessmentReviewStateSchema,
  archiveState: assessmentArchiveStateSchema,
  isReadOnly: z.boolean(),
  responses: z.array(assessmentResponseSchema),
  submittedAt: isoTimestampSchema.nullable(),
  acceptedAt: isoTimestampSchema.nullable(),
  acceptedByEmployeeId: idSchema.nullable(),
  readyForMeetingAt: isoTimestampSchema.nullable(),
  managerNotes: z.string().nullable(),
  scheduledAt: isoTimestampSchema.nullable(),
  scheduledByEmployeeId: idSchema.nullable(),
  reviewer1Notes: z.string().nullable(),
  reviewer1CompletedAt: isoTimestampSchema.nullable(),
  reviewer1CompletedByEmployeeId: idSchema.nullable(),
  reviewer2Notes: z.string().nullable(),
  reviewer2CompletedAt: isoTimestampSchema.nullable(),
  reviewer2CompletedByEmployeeId: idSchema.nullable(),
  concludedAt: isoTimestampSchema.nullable(),
  concludedByEmployeeId: idSchema.nullable(),
  reviewedAt: isoTimestampSchema.nullable(),
  reviewedByEmployeeId: idSchema.nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type AppRole = z.infer<typeof appRoleSchema>;
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;
export type ReviewPeriodStatus = z.infer<typeof reviewPeriodStatusSchema>;
export type QuestionTarget = z.infer<typeof questionTargetSchema>;
export type QuestionType = z.infer<typeof questionTypeSchema>;
export type QuestionSetStatus = z.infer<typeof questionSetStatusSchema>;
export type WorkflowVisibility = z.infer<typeof workflowVisibilitySchema>;
export type AssessmentReviewState = z.infer<typeof assessmentReviewStateSchema>;
export type AssessmentStatus = z.infer<typeof assessmentStatusSchema>;
export type AssessmentArchiveState = z.infer<typeof assessmentArchiveStateSchema>;
export type AssessmentReviewerRole = z.infer<typeof assessmentReviewerRoleSchema>;
export type Employee = z.infer<typeof employeeSchema>;
export type EmployeeAuthMetadata = z.infer<typeof employeeAuthMetadataSchema>;
export type EmployeeAdmin = z.infer<typeof employeeAdminSchema>;
export type LocalUsersExportMode = z.infer<typeof localUsersExportModeSchema>;
export type LocalUserCredentialKind = z.infer<typeof localUserCredentialKindSchema>;
export type LocalUserTransferItem = z.infer<typeof localUserTransferItemSchema>;
export type QuestionCategoryName = z.infer<typeof questionCategoryNameSchema>;
export type ReviewPeriod = z.infer<typeof reviewPeriodSchema>;
export type WorkflowSettings = z.infer<typeof workflowSettingsSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionSet = z.infer<typeof questionSetSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type AssessmentResponse = z.infer<typeof assessmentResponseSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
