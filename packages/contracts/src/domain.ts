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
export const reviewPeriodStatusSchema = z.enum(["active", "archived"]);
export const questionTargetSchema = z.enum(["self", "peer"]);
export const questionTypeSchema = z.enum(["subjective", "ranking", "narrative"]);
export const questionSetStatusSchema = z.enum(["draft", "active"]);
export const assessmentReviewStateSchema = z.enum([
  "new",
  "draft",
  "submitted",
  "accepted",
  "reviewed",
]);
export const assessmentArchiveStateSchema = z.enum(["active", "archived"]);
export const localUsersExportModeSchema = z.enum(["rotate-passcodes", "preserve-passwords"]);
export const localUserCredentialKindSchema = z.enum(["password", "password-hash", "unset"]);
export const questionCategoryNameSchema = z.string().trim().min(1);
const bcryptHashSchema = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const scryptHashSchema = /^[0-9a-f]{32}:[0-9a-f]{128}$/i;

export const employeeSchema = z.object({
  id: idSchema,
  username: usernameSchema,
  fullName: z.string().min(1),
  email: z.string().email(),
  role: appRoleSchema,
  status: employeeStatusSchema,
  managerId: idSchema.nullable(),
  assessorId: idSchema.nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const employeeAuthMetadataSchema = z.object({
  passwordConfigured: z.boolean(),
  passwordResetRequired: z.boolean(),
  lastPasswordChangeAt: isoTimestampSchema.nullable(),
});

export const employeeAdminSchema = employeeSchema.extend({
  auth: employeeAuthMetadataSchema,
});

export const localUserTransferItemSchema = z.object({
  id: idSchema.optional(),
  username: usernameSchema,
  fullName: z.string().min(1),
  email: z.string().email(),
  role: appRoleSchema,
  status: employeeStatusSchema,
  managerUsername: usernameSchema.nullable(),
  assessorUsername: usernameSchema.nullable(),
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
});

export const reviewPeriodSchema = z.object({
  id: idSchema,
  key: z.string().min(1),
  label: z.string().min(1),
  startDate: isoDateSchema,
  dueDate: isoDateSchema,
  status: reviewPeriodStatusSchema,
  archivedAt: isoTimestampSchema.nullable(),
  archivedByEmployeeId: idSchema.nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
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
  managerNotes: z.string().nullable(),
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
export type AssessmentReviewState = z.infer<typeof assessmentReviewStateSchema>;
export type AssessmentArchiveState = z.infer<typeof assessmentArchiveStateSchema>;
export type Employee = z.infer<typeof employeeSchema>;
export type EmployeeAuthMetadata = z.infer<typeof employeeAuthMetadataSchema>;
export type EmployeeAdmin = z.infer<typeof employeeAdminSchema>;
export type LocalUsersExportMode = z.infer<typeof localUsersExportModeSchema>;
export type LocalUserCredentialKind = z.infer<typeof localUserCredentialKindSchema>;
export type LocalUserTransferItem = z.infer<typeof localUserTransferItemSchema>;
export type QuestionCategoryName = z.infer<typeof questionCategoryNameSchema>;
export type ReviewPeriod = z.infer<typeof reviewPeriodSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionSet = z.infer<typeof questionSetSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type AssessmentResponse = z.infer<typeof assessmentResponseSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
