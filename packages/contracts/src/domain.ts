import { z } from "zod";

export const idSchema = z.string().uuid();
export const isoTimestampSchema = z.string().datetime({ offset: true });
export const isoDateSchema = z.string().date();
export const usernameSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9._-]+$/, "Username must contain only lowercase letters, numbers, dots, underscores, or dashes");

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
export type ReviewPeriod = z.infer<typeof reviewPeriodSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionSet = z.infer<typeof questionSetSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type AssessmentResponse = z.infer<typeof assessmentResponseSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
