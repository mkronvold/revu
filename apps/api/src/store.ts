import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type {
  Assessment,
  AssessmentArchiveState,
  AssessmentResponse,
  AssessmentReviewState,
  AssessmentsListQuery,
  Assignment,
  AuthChangePasswordResponse,
  AuthPermission,
  AuthSession,
  BackupSchedule,
  BackupRestoreResponse,
  BackupRestoreScope,
  BackupSnapshot,
  BackupStatusResponse,
  BackupReviewData,
  ClearReadyAssessmentsResponse,
  CreateAssessmentRequest,
  CreateAssignmentRequest,
  CreateEmployeeRequest,
  CreateQuestionInput,
  CreateQuestionSetRequest,
  CreateReviewPeriodRequest,
  Employee,
  EmployeeAdmin,
  EmployeeAuthMetadata,
  ExportStubResponse,
  ImportStubResponse,
  LocalUserCredentialKind,
  LocalUserTransferItem,
  LocalUsersExportMode,
  LocalUsersExportResponse,
  LocalUsersImportResponse,
  QuestionSet,
  ResetEmployeePasswordResponse,
  ReassignAssessmentRequest,
  ReviewAssessmentRequest,
  ReviewPeriod,
  SaveAssessmentDraftRequest,
  SetEmployeePasswordResponse,
  SyncAssessmentsResponse,
  SubmitAssessmentRequest,
  UpdateAssignmentRequest,
  UpdateBackupStatusRequest,
  UpdateEmployeeRequest,
  UpdateQuestionCategoriesRequest,
  UpdateQuestionSetRequest,
  UpdateReviewPeriodRequest,
  UpdateWorkflowSettingsRequest,
  WorkflowSettings,
} from "@revu/contracts";
import { defaultWorkflowMarkdown, defaultWorkflowVisibility } from "@revu/contracts";
import type { Pool, PoolClient } from "pg";

import { getPool, withTransaction } from "./db.js";

type DbClient = Pool | PoolClient;

type StoredAuthMetadata = EmployeeAuthMetadata & {
  passwordHash: string | null;
};

type SessionRecord = {
  sessionId: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
  permissions: AuthPermission[];
  employeeId: string;
};

type EmployeeRow = {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: Employee["role"];
  status: Employee["status"];
  manager_employee_id: string | null;
  assessor1_employee_id: string | null;
  assessor2_employee_id: string | null;
  password_hash: string | null;
  password_reset_required: boolean;
  password_changed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

type ReviewPeriodRow = {
  id: string;
  key: string;
  label: string;
  start_date: Date | string;
  due_date: Date | string;
  assessment_due_date: Date | string;
  review_due_date: Date | string;
  status: ReviewPeriod["status"];
  archived_at: Date | string | null;
  archived_by_employee_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type WorkflowSettingsRow = {
  markdown: string;
  visibility: WorkflowSettings["visibility"];
};

type QuestionSetRow = {
  id: string;
  review_period_id: string;
  target: QuestionSet["target"];
  status: QuestionSet["status"];
  is_read_only: boolean;
  title: string;
  header_markdown: string;
  footer_markdown: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type QuestionRow = {
  id: string;
  question_set_id: string;
  display_order: number;
  type: CreateQuestionInput["type"];
  category: string | null;
  prompt: string;
};

type AssignmentRow = {
  id: string;
  review_period_id: string;
  employee_id: string;
  manager_employee_id: string | null;
  assessor_employee_id: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type AssessmentRow = {
  id: string;
  review_period_id: string;
  question_set_id: string;
  assignment_id: string | null;
  target: Assessment["target"];
  employee_id: string;
  assessor_employee_id: string;
  review_state: AssessmentReviewState;
  archive_state: AssessmentArchiveState;
  submitted_at: Date | string | null;
  accepted_at: Date | string | null;
  accepted_by_employee_id: string | null;
  reviewed_at: Date | string | null;
  reviewed_by_employee_id: string | null;
  manager_notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  assignment_manager_employee_id: string | null;
  employee_manager_employee_id: string | null;
};

type AssessmentResponseRow = {
  assessment_id: string;
  question_id: string;
  display_order: number;
  response_text: string;
};

type AssessmentRecord = {
  assessment: Assessment;
  assignmentManagerId: string | null;
  employeeManagerId: string | null;
};

type NotStartedAssessmentRow = {
  id: string;
  employee_id: string;
  assessor_employee_id: string;
};

type AuthSessionRow = {
  id: string;
  employee_id: string;
  created_at: Date | string;
  expires_at: Date | string;
};

type RelationshipRow = {
  id: string;
  role: Employee["role"];
  status: Employee["status"];
  deleted_at: Date | string | null;
};

type ExistsRow = {
  exists: boolean;
};

type UniqueEmployeeFieldsRow = {
  username_exists: boolean;
  email_exists: boolean;
};

type UniqueReviewPeriodKeyRow = {
  key_exists: boolean;
};

type ExistingConstraintRow = {
  exists: boolean;
};

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const eightHoursInMs = 8 * 60 * 60 * 1000;
const supportedBackupSchedules: BackupSchedule[] = ["1hr", "3hr", "6hr", "12hr", "daily", "weekly"];

type BackupStatusConfig = Pick<
  BackupStatusResponse,
  "automaticBackupsEnabled" | "schedule" | "retentionCount" | "lastBackupAt" | "lastRestoreAt"
>;

const seedPasswordsByUsername: Record<string, string> = {
  "ada.admin": "AdminPass123!",
  "manny.manager": "ManagerPass123!",
  "elliot.employee": "EmployeePass123!",
  "pat.peer": "PeerPass123!",
};

const permissionsByRole: Record<Employee["role"], AuthPermission[]> = {
  employee: [],
  manager: ["employees:read", "employees:update", "assessments:read", "assessments:accept", "assessments:review", "assessments:reassign"],
  admin: [
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
    "workflow:update",
    "backups:read",
    "backups:create",
    "backups:restore",
  ],
};

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, value: string | null) {
  if (!value) {
    return false;
  }

  const [salt, expectedHash] = value.split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  return actualHash.length === expectedBuffer.length && timingSafeEqual(actualHash, expectedBuffer);
}

function nowIso() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function generateTemporaryPassword() {
  return `tmp-${randomBytes(9).toString("base64url")}`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toIsoTimestamp(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toIsoDate(value: Date | string) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
}

function isPgError(error: unknown): error is { code?: string; constraint?: string; message: string } {
  return typeof error === "object" && error !== null && "message" in error;
}

function mapDatabaseError(error: unknown) {
  if (!isPgError(error)) {
    return null;
  }

  if (error.code === "23505") {
    switch (error.constraint) {
      case "employees_username_unique_idx":
      case "employees_username_unique_ci_idx":
      case "employees_username_active_unique_ci_idx":
        return new ApiError(409, "Username already exists");
      case "employees_email_key":
      case "employees_email_active_unique_idx":
        return new ApiError(409, "Email already exists");
      case "review_periods_key_key":
        return new ApiError(409, "Review period key already exists");
      case "uq_assignment_employee_per_period":
        return new ApiError(409, "Assignment already exists for this employee in the review period");
      case "uq_assessment_actor_per_period":
        return new ApiError(409, "An assessment already exists for this review period, employee, and assessor");
      case "uq_question_order_per_set":
        return new ApiError(400, "Question order must be unique within a question set");
      default:
        return null;
    }
  }

  if (error.code === "23514") {
    switch (error.constraint) {
      case "employees_username_format":
        return new ApiError(400, "Username must contain only letters, numbers, dots, underscores, or dashes");
      default:
        return null;
    }
  }

  if (error.code === "P0001") {
    switch (error.message) {
      case "Question sets for archived review periods are read-only":
      case "Assignments for archived review periods are read-only":
      case "Accepted, reviewed, or archived assessments are read-only":
      case "Accepted, reviewed, or archived assessments have immutable authored fields":
      case "Assessment review state cannot change after review period archive":
        return new ApiError(409, error.message);
      case "Assessment responses must reference questions from the selected question set":
      case "Assessment question set must exist":
      case "Assessment review period must match question set review period":
      case "Assessment target must match question set target":
        return new ApiError(400, error.message);
      default:
        return null;
    }
  }

  if (error.code === "23503") {
    switch (error.constraint) {
      case "review_period_assignments_employee_id_fkey":
      case "assessments_employee_id_fkey":
        return new ApiError(400, "Employee not found");
      case "review_period_assignments_manager_employee_id_fkey":
        return new ApiError(400, "Manager not found");
      case "employees_assessor1_employee_id_fkey":
      case "employees_assessor2_employee_id_fkey":
      case "review_period_assignments_assessor_employee_id_fkey":
      case "assessments_assessor_employee_id_fkey":
        return new ApiError(400, "Assessor not found");
      default:
        return null;
    }
  }

  if (error.code === "23514") {
    switch (error.constraint) {
      case "employees_distinct_assessors":
        return new ApiError(400, "Assessor 1 and assessor 2 must be different users");
      default:
        return null;
    }
  }

  return null;
}

function rethrowDatabaseError(error: unknown): never {
  const mapped = mapDatabaseError(error);
  if (mapped) {
    throw mapped;
  }

  throw error;
}

export class ApiStore {
  private readonly pool = getPool();

  constructor() {}

  private toEmployee(row: EmployeeRow): Employee {
    return {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      status: row.status,
      managerId: row.manager_employee_id,
      assessor1Id: row.assessor1_employee_id,
      assessor2Id: row.assessor2_employee_id,
      createdAt: toIsoTimestamp(row.created_at) ?? nowIso(),
      updatedAt: toIsoTimestamp(row.updated_at) ?? nowIso(),
    };
  }

  private toStoredAuthMetadata(row: EmployeeRow): StoredAuthMetadata {
    return {
      passwordHash: row.password_hash,
      passwordConfigured: row.password_hash !== null,
      passwordResetRequired: row.password_reset_required,
      lastPasswordChangeAt: toIsoTimestamp(row.password_changed_at),
    };
  }

  private toEmployeeAdmin(row: EmployeeRow): EmployeeAdmin {
    const auth = this.toStoredAuthMetadata(row);

    return {
      ...this.toEmployee(row),
      auth: {
        passwordConfigured: auth.passwordConfigured,
        passwordResetRequired: auth.passwordResetRequired,
        lastPasswordChangeAt: auth.lastPasswordChangeAt,
      },
    };
  }

  private toSession(record: SessionRecord, employeeRow: EmployeeRow): AuthSession {
    return {
      token: record.token,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      passwordResetRequired: employeeRow.password_reset_required,
      permissions: clone(record.permissions),
      user: clone(this.toEmployee(employeeRow)),
    };
  }

  private normalizeUsername(username: string) {
    return username.trim().toLocaleLowerCase();
  }

  private async ensureEmployeeDeletedColumn(client: DbClient) {
    await client.query(
      `
        ALTER TABLE employees
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
      `,
    );
  }

  private async ensureEmployeeTombstoneStorage(client: DbClient) {
    await this.ensureEmployeeDeletedColumn(client);
    await client.query(
      `
        ALTER TABLE employees
        DROP CONSTRAINT IF EXISTS employees_email_key
      `,
    );
    await client.query(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS employees_email_active_unique_idx
        ON employees(email)
        WHERE deleted_at IS NULL
      `,
    );
  }

  private async ensureEmployeeUsernameStorage(client: DbClient) {
    await this.ensureEmployeeTombstoneStorage(client);
    await client.query(
      `
        DROP INDEX IF EXISTS employees_username_unique_idx
      `,
    );
    await client.query(
      `
        DROP INDEX IF EXISTS employees_username_unique_ci_idx
      `,
    );
    await client.query(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS employees_username_active_unique_ci_idx
        ON employees (lower(username))
        WHERE deleted_at IS NULL
      `,
    );

    const constraintResult = await client.query<ExistingConstraintRow>(
      `
        SELECT EXISTS(
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'employees_username_format'
            AND conrelid = 'employees'::regclass
            AND pg_get_constraintdef(oid) LIKE '%^[A-Za-z0-9._-]+$%'
        ) AS exists
      `,
    );

    if (constraintResult.rows[0]?.exists) {
      return;
    }

    await client.query(
      `
        ALTER TABLE employees
        DROP CONSTRAINT IF EXISTS employees_username_format
      `,
    );
    await client.query(
      `
        ALTER TABLE employees
        ADD CONSTRAINT employees_username_format
        CHECK (username ~ '^[A-Za-z0-9._-]+$')
      `,
    );
  }

  private async loadEmployeeRows(
    client: DbClient,
    filters: {
      employeeId?: string;
      usernames?: readonly string[];
      employeeIds?: readonly string[];
      includeDeleted?: boolean;
    } = {},
  ) {
    await this.ensureEmployeeDeletedColumn(client);

    const clauses: string[] = [];
    const values: Array<string | readonly string[]> = [];

    if (!filters.includeDeleted) {
      clauses.push("deleted_at IS NULL");
    }

    if (filters.employeeId) {
      values.push(filters.employeeId);
      clauses.push(`id = $${values.length}`);
    }

    if (filters.usernames && filters.usernames.length > 0) {
      values.push(filters.usernames.map((username) => this.normalizeUsername(username)));
      clauses.push(`lower(username) = ANY($${values.length}::text[])`);
    }

    if (filters.employeeIds && filters.employeeIds.length > 0) {
      values.push(filters.employeeIds);
      clauses.push(`id = ANY($${values.length}::uuid[])`);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await client.query<EmployeeRow>(
      `
        SELECT
          id,
          username,
          full_name,
          email,
          role,
          status,
          manager_employee_id,
          assessor1_employee_id,
          assessor2_employee_id,
          password_hash,
          password_reset_required,
          password_changed_at,
          created_at,
          updated_at,
          deleted_at
        FROM employees
        ${whereClause}
        ORDER BY created_at, id
      `,
      values,
    );

    return result.rows;
  }

  private async employeeOrThrow(client: DbClient, employeeId: string, options: { includeDeleted?: boolean } = {}) {
    const [employee] = await this.loadEmployeeRows(client, { employeeId, includeDeleted: options.includeDeleted });
    if (!employee) {
      throw new ApiError(404, "Employee not found");
    }

    return employee;
  }

  private async reviewPeriodOrThrow(client: DbClient, reviewPeriodId: string) {
    const result = await client.query<ReviewPeriodRow>(
      `
        SELECT
          id,
          key,
          label,
          start_date,
          due_date,
          assessment_due_date,
          review_due_date,
          status,
          archived_at,
          archived_by_employee_id,
          created_at,
          updated_at
        FROM review_periods
        WHERE id = $1
      `,
      [reviewPeriodId],
    );

    const reviewPeriod = result.rows[0];
    if (!reviewPeriod) {
      throw new ApiError(404, "Review period not found");
    }

    return reviewPeriod;
  }

  private toReviewPeriod(row: ReviewPeriodRow): ReviewPeriod {
    return {
      id: row.id,
      key: row.key,
      label: row.label,
      startDate: toIsoDate(row.start_date),
      dueDate: toIsoDate(row.due_date),
      assessmentDueDate: toIsoDate(row.assessment_due_date),
      reviewDueDate: toIsoDate(row.review_due_date),
      status: row.status,
      archivedAt: toIsoTimestamp(row.archived_at),
      archivedByEmployeeId: row.archived_by_employee_id,
      createdAt: toIsoTimestamp(row.created_at) ?? nowIso(),
      updatedAt: toIsoTimestamp(row.updated_at) ?? nowIso(),
    };
  }

  private async loadQuestionSets(
    client: DbClient,
    filters: { reviewPeriodId?: string; questionSetId?: string; reviewPeriodStatus?: ReviewPeriod["status"]; status?: QuestionSet["status"]; target?: QuestionSet["target"] } = {},
  ) {
    const clauses: string[] = [];
    const values: Array<string> = [];

    if (filters.reviewPeriodId) {
      values.push(filters.reviewPeriodId);
      clauses.push(`qs.review_period_id = $${values.length}`);
    }

    if (filters.questionSetId) {
      values.push(filters.questionSetId);
      clauses.push(`qs.id = $${values.length}`);
    }

    if (filters.reviewPeriodStatus) {
      values.push(filters.reviewPeriodStatus);
      clauses.push(`rp.status = $${values.length}`);
    }

    if (filters.status) {
      values.push(filters.status);
      clauses.push(`qs.status = $${values.length}`);
    }

    if (filters.target) {
      values.push(filters.target);
      clauses.push(`qs.target = $${values.length}`);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const questionSetsResult = await client.query<QuestionSetRow>(
      `
        SELECT
          qs.id,
          qs.review_period_id,
          qs.target,
          qs.status,
          (rp.status = 'archived') AS is_read_only,
          qs.title,
          qs.header_markdown,
          qs.footer_markdown,
          qs.created_at,
          qs.updated_at
        FROM question_sets qs
        JOIN review_periods rp ON rp.id = qs.review_period_id
        ${whereClause}
        ORDER BY rp.start_date DESC, CASE qs.target WHEN 'self' THEN 0 ELSE 1 END, qs.created_at, qs.id
      `,
      values,
    );

    const questionSetIds = questionSetsResult.rows.map((row) => row.id);
    const questionsResult = questionSetIds.length > 0
      ? await client.query<QuestionRow>(
          `
            SELECT
              id,
              question_set_id,
              display_order,
              type,
              category,
              prompt
            FROM question_set_questions
            WHERE question_set_id = ANY($1::uuid[])
            ORDER BY question_set_id, display_order
          `,
          [questionSetIds],
        )
      : { rows: [] as QuestionRow[] };

    const questionsBySetId = new Map<string, QuestionSet["questions"]>();
    for (const question of questionsResult.rows) {
      const items = questionsBySetId.get(question.question_set_id) ?? [];
      items.push({
        id: question.id,
        order: question.display_order,
        type: question.type,
        category: question.category,
        prompt: question.prompt,
      });
      questionsBySetId.set(question.question_set_id, items);
    }

    return questionSetsResult.rows.map((row) => ({
      id: row.id,
      reviewPeriodId: row.review_period_id,
      target: row.target,
      status: row.status,
      isReadOnly: row.is_read_only,
      title: row.title,
      headerMarkdown: row.header_markdown,
      footerMarkdown: row.footer_markdown,
      questions: questionsBySetId.get(row.id) ?? [],
      createdAt: toIsoTimestamp(row.created_at) ?? nowIso(),
      updatedAt: toIsoTimestamp(row.updated_at) ?? nowIso(),
    } satisfies QuestionSet));
  }

  private async questionSetOrThrow(client: DbClient, questionSetId: string) {
    const [questionSet] = await this.loadQuestionSets(client, { questionSetId });
    if (!questionSet) {
      throw new ApiError(404, "Question set not found");
    }

    return questionSet;
  }

  private async loadAssignments(
    client: DbClient,
    filters: { reviewPeriodId?: string; assignmentId?: string } = {},
  ) {
    const clauses: string[] = [];
    const values: string[] = [];

    if (filters.reviewPeriodId) {
      values.push(filters.reviewPeriodId);
      clauses.push(`a.review_period_id = $${values.length}`);
    }

    if (filters.assignmentId) {
      values.push(filters.assignmentId);
      clauses.push(`a.id = $${values.length}`);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await client.query<AssignmentRow>(
      `
        SELECT
          a.id,
          a.review_period_id,
          a.employee_id,
          a.manager_employee_id,
          a.assessor_employee_id,
          a.created_at,
          a.updated_at
        FROM review_period_assignments a
        JOIN review_periods rp ON rp.id = a.review_period_id
        ${whereClause}
        ORDER BY rp.start_date DESC, a.created_at, a.id
      `,
      values,
    );

    return result.rows.map((row) => ({
      id: row.id,
      reviewPeriodId: row.review_period_id,
      employeeId: row.employee_id,
      managerId: row.manager_employee_id,
      assessorId: row.assessor_employee_id,
      createdAt: toIsoTimestamp(row.created_at) ?? nowIso(),
      updatedAt: toIsoTimestamp(row.updated_at) ?? nowIso(),
    } satisfies Assignment));
  }

  private async assignmentOrThrow(client: DbClient, assignmentId: string) {
    const [assignment] = await this.loadAssignments(client, { assignmentId });
    if (!assignment) {
      throw new ApiError(404, "Assignment not found");
    }

    return assignment;
  }

  private async loadAssessmentRecords(
    client: DbClient,
    filters: {
      assessmentId?: string;
      reviewPeriodId?: string;
      employeeId?: string;
      assessorId?: string;
      assignmentId?: string;
      target?: Assessment["target"];
      reviewState?: AssessmentReviewState;
      archiveState?: AssessmentArchiveState;
    } = {},
  ) {
    const clauses: string[] = [];
    const values: string[] = [];

    if (filters.assessmentId) {
      values.push(filters.assessmentId);
      clauses.push(`a.id = $${values.length}`);
    }

    if (filters.reviewPeriodId) {
      values.push(filters.reviewPeriodId);
      clauses.push(`a.review_period_id = $${values.length}`);
    }

    if (filters.employeeId) {
      values.push(filters.employeeId);
      clauses.push(`a.employee_id = $${values.length}`);
    }

    if (filters.assessorId) {
      values.push(filters.assessorId);
      clauses.push(`a.assessor_employee_id = $${values.length}`);
    }

    if (filters.assignmentId) {
      values.push(filters.assignmentId);
      clauses.push(`a.assignment_id = $${values.length}`);
    }

    if (filters.target) {
      values.push(filters.target);
      clauses.push(`a.target = $${values.length}`);
    }

    if (filters.reviewState) {
      values.push(filters.reviewState);
      clauses.push(`a.review_state = $${values.length}`);
    }

    if (filters.archiveState) {
      values.push(filters.archiveState);
      clauses.push(`a.archive_state = $${values.length}`);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const assessmentsResult = await client.query<AssessmentRow>(
      `
        SELECT
          a.id,
          a.review_period_id,
          a.question_set_id,
          a.assignment_id,
          a.target,
          a.employee_id,
          a.assessor_employee_id,
          a.review_state,
          a.archive_state,
          a.submitted_at,
          a.accepted_at,
          a.accepted_by_employee_id,
          a.reviewed_at,
          a.reviewed_by_employee_id,
          a.manager_notes,
          a.created_at,
          a.updated_at,
          assignment.manager_employee_id AS assignment_manager_employee_id,
          employee.manager_employee_id AS employee_manager_employee_id
        FROM assessments a
        LEFT JOIN review_period_assignments assignment ON assignment.id = a.assignment_id
        JOIN employees employee ON employee.id = a.employee_id
        ${whereClause}
        ORDER BY a.created_at, a.id
      `,
      values,
    );

    const assessmentIds = assessmentsResult.rows.map((row) => row.id);
    const responsesResult = assessmentIds.length > 0
      ? await client.query<AssessmentResponseRow>(
          `
            SELECT
              response.assessment_id,
              response.question_id,
              question.display_order,
              response.response_text
            FROM assessment_responses response
            JOIN question_set_questions question ON question.id = response.question_id
            WHERE response.assessment_id = ANY($1::uuid[])
            ORDER BY response.assessment_id, question.display_order
          `,
          [assessmentIds],
        )
      : { rows: [] as AssessmentResponseRow[] };

    const responsesByAssessmentId = new Map<string, AssessmentResponse[]>();
    for (const response of responsesResult.rows) {
      const items = responsesByAssessmentId.get(response.assessment_id) ?? [];
      items.push({
        questionId: response.question_id,
        order: response.display_order,
        response: response.response_text,
      });
      responsesByAssessmentId.set(response.assessment_id, items);
    }

    return assessmentsResult.rows.map((row) => ({
      assessment: {
        id: row.id,
        reviewPeriodId: row.review_period_id,
        questionSetId: row.question_set_id,
        assignmentId: row.assignment_id,
        target: row.target,
        employeeId: row.employee_id,
        assessorId: row.assessor_employee_id,
        reviewState: row.review_state,
        archiveState: row.archive_state,
        isReadOnly: row.archive_state === "archived" || ["accepted", "reviewed"].includes(row.review_state),
        responses: responsesByAssessmentId.get(row.id) ?? [],
        submittedAt: toIsoTimestamp(row.submitted_at),
        acceptedAt: toIsoTimestamp(row.accepted_at),
        acceptedByEmployeeId: row.accepted_by_employee_id,
        managerNotes: row.manager_notes,
        reviewedAt: toIsoTimestamp(row.reviewed_at),
        reviewedByEmployeeId: row.reviewed_by_employee_id,
        createdAt: toIsoTimestamp(row.created_at) ?? nowIso(),
        updatedAt: toIsoTimestamp(row.updated_at) ?? nowIso(),
      },
      assignmentManagerId: row.assignment_manager_employee_id,
      employeeManagerId: row.employee_manager_employee_id,
    } satisfies AssessmentRecord));
  }

  private async loadNotStartedAssessments(client: DbClient, reviewPeriodId: string) {
    const result = await client.query<NotStartedAssessmentRow>(
      `
        SELECT
          assessment.id,
          assessment.employee_id,
          assessment.assessor_employee_id
        FROM assessments assessment
        LEFT JOIN assessment_responses response ON response.assessment_id = assessment.id
        WHERE assessment.review_period_id = $1
          AND assessment.archive_state = 'active'
          AND assessment.review_state = 'new'
        GROUP BY assessment.id, assessment.employee_id, assessment.assessor_employee_id
        HAVING COUNT(response.id) = 0
      `,
      [reviewPeriodId],
    );

    return result.rows;
  }

  private async deleteAssessmentsById(client: DbClient, assessmentIds: string[]) {
    if (assessmentIds.length === 0) {
      return 0;
    }

    const result = await client.query(
      `
        DELETE FROM assessments
        WHERE id = ANY($1::uuid[])
      `,
      [assessmentIds],
    );

    return result.rowCount ?? 0;
  }

  private async removeUnexpectedNotStartedAssessments(
    client: DbClient,
    reviewPeriodId: string,
    expectedAssessmentKeys: Set<string>,
  ) {
    const staleAssessmentIds = (await this.loadNotStartedAssessments(client, reviewPeriodId))
      .filter((assessment) => !expectedAssessmentKeys.has(`${assessment.employee_id}:${assessment.assessor_employee_id}`))
      .map((assessment) => assessment.id);

    return this.deleteAssessmentsById(client, staleAssessmentIds);
  }

  private async removeEmployeeNotStartedAssessments(client: DbClient, employeeId: string) {
    const result = await client.query<{ id: string }>(
      `
        DELETE FROM assessments
        WHERE id IN (
          SELECT assessment.id
          FROM assessments assessment
          JOIN review_periods review_period ON review_period.id = assessment.review_period_id
          LEFT JOIN assessment_responses response ON response.assessment_id = assessment.id
          WHERE assessment.archive_state = 'active'
            AND assessment.review_state = 'new'
            AND review_period.status = 'active'
            AND (
              assessment.employee_id = $1
              OR assessment.assessor_employee_id = $1
            )
          GROUP BY assessment.id
          HAVING COUNT(response.id) = 0
        )
        RETURNING id
      `,
      [employeeId],
    );

    return result.rowCount ?? result.rows.length;
  }

  private async removeDeletedEmployeeAssessments(client: DbClient, employeeId: string) {
    const result = await client.query<{ id: string }>(
      `
        DELETE FROM assessments
        WHERE employee_id = $1
           OR (
             assessor_employee_id = $1
             AND (
               target <> 'peer'
               OR employee_id = $1
               OR review_state IN ('new', 'draft')
             )
           )
        RETURNING id
      `,
      [employeeId],
    );

    return result.rowCount ?? result.rows.length;
  }

  private async assessmentOrThrow(client: DbClient, assessmentId: string) {
    const [assessment] = await this.loadAssessmentRecords(client, { assessmentId });
    if (!assessment) {
      throw new ApiError(404, "Assessment not found");
    }

    return assessment;
  }

  private async activeQuestionSetOrThrow(reviewPeriodId: string, target: Assessment["target"], client: DbClient) {
    const [questionSet] = await this.loadQuestionSets(client, {
      reviewPeriodId,
      status: "active",
      target,
    });

    if (!questionSet) {
      throw new ApiError(409, `No active ${target} question set is available for this review period`);
    }

    return questionSet;
  }

  private async findAssessmentByKey(client: DbClient, reviewPeriodId: string, employeeId: string, assessorId: string) {
    const result = await client.query<{ id: string }>(
      `
        SELECT id
        FROM assessments
        WHERE review_period_id = $1
          AND employee_id = $2
          AND assessor_employee_id = $3
      `,
      [reviewPeriodId, employeeId, assessorId],
    );

    return result.rows[0] ?? null;
  }

  private async loadSessionRecord(client: DbClient, token: string) {
    const result = await client.query<AuthSessionRow>(
      `
        SELECT id, employee_id, created_at, expires_at
        FROM auth_sessions
        WHERE token_hash = $1
          AND revoked_at IS NULL
      `,
      [hashToken(token)],
    );

    const sessionRow = result.rows[0];
    if (!sessionRow) {
      return null;
    }

    if (Date.parse(toIsoTimestamp(sessionRow.expires_at) ?? "") <= Date.now()) {
      await client.query("DELETE FROM auth_sessions WHERE id = $1", [sessionRow.id]);
      return null;
    }

    const employeeRow = await this.employeeOrThrow(client, sessionRow.employee_id);
    return {
      session: {
        sessionId: sessionRow.id,
        token,
        employeeId: employeeRow.id,
        issuedAt: toIsoTimestamp(sessionRow.created_at) ?? nowIso(),
        expiresAt: toIsoTimestamp(sessionRow.expires_at) ?? nowIso(),
        permissions: clone(permissionsByRole[employeeRow.role]),
      } satisfies SessionRecord,
      employee: employeeRow,
    };
  }

  private async sessionOrThrow(client: DbClient, token: string) {
    const session = await this.loadSessionRecord(client, token);
    if (!session) {
      throw new ApiError(401, "Authentication required");
    }

    return session;
  }

  private async assertUniqueEmployeeFields(client: DbClient, candidate: { id?: string; username: string; email: string }) {
    const result = await client.query<UniqueEmployeeFieldsRow>(
      `
        SELECT
          EXISTS(
            SELECT 1
            FROM employees
            WHERE lower(username) = lower($1)
              AND deleted_at IS NULL
              AND ($2::uuid IS NULL OR id <> $2)
          ) AS username_exists,
          EXISTS(
            SELECT 1
            FROM employees
            WHERE email = $3
              AND deleted_at IS NULL
              AND ($2::uuid IS NULL OR id <> $2)
          ) AS email_exists
      `,
      [candidate.username, candidate.id ?? null, candidate.email],
    );

    const row = result.rows[0];
    if (row?.username_exists) {
      throw new ApiError(409, "Username already exists");
    }

    if (row?.email_exists) {
      throw new ApiError(409, "Email already exists");
    }
  }

  private async assertRelationships(
    client: DbClient,
    candidate: { id: string; managerId: string | null; assessor1Id: string | null; assessor2Id: string | null },
    options: { allowDeletedIds?: readonly string[] } = {},
  ) {
    const relationshipIds = [candidate.managerId, candidate.assessor1Id, candidate.assessor2Id].filter(
      (value): value is string => value !== null,
    );
    const allowDeletedIds = new Set(options.allowDeletedIds ?? []);
    const result = relationshipIds.length > 0
      ? await client.query<RelationshipRow>(
          `
            SELECT id, role, status, deleted_at
            FROM employees
            WHERE id = ANY($1::uuid[])
          `,
          [relationshipIds],
        )
      : { rows: [] as RelationshipRow[] };

    const employeeById = new Map(result.rows.map((row) => [row.id, row]));

    if (candidate.managerId) {
      const manager = employeeById.get(candidate.managerId);
      if (!manager) {
        throw new ApiError(400, "Manager not found");
      }
      if (manager.deleted_at !== null && !allowDeletedIds.has(manager.id)) {
        throw new ApiError(400, "Manager not found");
      }
      if (manager.id === candidate.id) {
        throw new ApiError(400, "Employee cannot be their own manager");
      }
      if (manager.deleted_at === null && manager.role !== "manager" && manager.role !== "admin") {
        throw new ApiError(400, "Manager must reference a manager or admin");
      }
    }

    for (const [label, assessorId] of [
      ["Assessor 1", candidate.assessor1Id],
      ["Assessor 2", candidate.assessor2Id],
    ] as const) {
      if (!assessorId) {
        continue;
      }

      const assessor = employeeById.get(assessorId);
      if (!assessor) {
        throw new ApiError(400, `${label} not found`);
      }
      if (assessor.deleted_at !== null && !allowDeletedIds.has(assessor.id)) {
        throw new ApiError(400, `${label} not found`);
      }
      if (assessor.id === candidate.id) {
        throw new ApiError(400, "Employee cannot be their own assessor");
      }
      if (assessor.deleted_at === null && assessor.status !== "active") {
        throw new ApiError(400, `${label} must be active`);
      }
    }

    if (candidate.assessor1Id && candidate.assessor2Id && candidate.assessor1Id === candidate.assessor2Id) {
      throw new ApiError(400, "Assessor 1 and assessor 2 must be different users");
    }
  }

  private async assertReviewPeriodFields(
    client: DbClient,
    candidate: {
      id?: string;
      key: string;
      startDate: string;
      dueDate: string;
      assessmentDueDate: string;
      reviewDueDate: string;
      status: ReviewPeriod["status"];
    },
  ) {
    const result = await client.query<UniqueReviewPeriodKeyRow>(
      `
        SELECT EXISTS(
          SELECT 1
          FROM review_periods
          WHERE key = $1
            AND ($2::uuid IS NULL OR id <> $2)
        ) AS key_exists
      `,
      [candidate.key, candidate.id ?? null],
    );

    if (result.rows[0]?.key_exists) {
      throw new ApiError(409, "Review period key already exists");
    }

    if (
      candidate.startDate > candidate.assessmentDueDate ||
      candidate.assessmentDueDate > candidate.reviewDueDate ||
      candidate.reviewDueDate > candidate.dueDate
    ) {
      throw new ApiError(400, "Review period dates must be ordered as start date, assessment due date, review due date, then end date");
    }

    if (candidate.status === "archived") {
      throw new ApiError(400, "Archived status must be managed through archive controls");
    }
  }

  private async deactivateOtherReviewPeriods(client: DbClient, reviewPeriodId: string) {
    await client.query(
      `
        UPDATE review_periods
        SET status = 'inactive',
            archived_at = NULL,
            archived_by_employee_id = NULL
        WHERE id <> $1
          AND status = 'active'
      `,
      [reviewPeriodId],
    );
  }

  private assertQuestionInputs(questions: CreateQuestionInput[]) {
    const orders = new Set<number>();
    const questionIds = new Set<string>();
    for (const question of questions) {
      if (orders.has(question.order)) {
        throw new ApiError(400, "Question order must be unique within a question set");
      }

      orders.add(question.order);

      if (question.id) {
        if (questionIds.has(question.id)) {
          throw new ApiError(400, "Question ids must be unique within a question set");
        }
        questionIds.add(question.id);
      }
    }
  }

  private async assertReviewPeriodMutable(client: DbClient, reviewPeriodId: string) {
    const reviewPeriod = await this.reviewPeriodOrThrow(client, reviewPeriodId);
    if (reviewPeriod.status === "archived") {
      throw new ApiError(409, "Archived review periods are read-only");
    }

    return reviewPeriod;
  }

  private isManagerForAssessment(actorEmployeeId: string, assessment: AssessmentRecord) {
    return assessment.assignmentManagerId === actorEmployeeId || assessment.employeeManagerId === actorEmployeeId;
  }

  private canReadAssessment(session: AuthSession, assessment: AssessmentRecord) {
    if (session.user.role === "admin") {
      return true;
    }

    if (session.user.role === "manager") {
      return this.isManagerForAssessment(session.user.id, assessment) && !["new", "draft"].includes(assessment.assessment.reviewState);
    }

    return assessment.assessment.assessorId === session.user.id;
  }

  private assertCanReadAssessment(session: AuthSession, assessment: AssessmentRecord) {
    if (!this.canReadAssessment(session, assessment)) {
      throw new ApiError(403, "You do not have permission to view this assessment");
    }
  }

  private assertCanAuthorAssessment(session: AuthSession, assessment: AssessmentRecord) {
    if (assessment.assessment.assessorId !== session.user.id) {
      throw new ApiError(403, "Only the assigned assessor can edit this assessment");
    }

    if (assessment.assessment.archiveState === "archived") {
      throw new ApiError(409, "Archived assessments are read-only");
    }

    if (!["new", "draft"].includes(assessment.assessment.reviewState)) {
      throw new ApiError(409, "Submitted or accepted assessments cannot be edited by the assessor");
    }
  }

  private assertCanManageAssessment(session: AuthSession, assessment: AssessmentRecord) {
    if (session.user.role === "admin") {
      return;
    }

    if (session.user.role === "manager" && this.isManagerForAssessment(session.user.id, assessment)) {
      return;
    }

    throw new ApiError(403, "You do not have permission to manage this assessment");
  }

  private assertAssessmentResponses(questionSet: QuestionSet, responses: AssessmentResponse[], complete: boolean) {
    const questionsById = new Map(questionSet.questions.map((question) => [question.id, question]));
    const seenQuestionIds = new Set<string>();

    for (const response of responses) {
      const question = questionsById.get(response.questionId);
      if (!question) {
        throw new ApiError(400, "Responses must reference questions from the selected question set");
      }

      if (seenQuestionIds.has(response.questionId)) {
        throw new ApiError(400, "Responses must reference each question at most once");
      }

      if (question.order !== response.order) {
        throw new ApiError(400, "Response order must match the question order");
      }

      seenQuestionIds.add(response.questionId);
    }

    if (complete) {
      if (responses.length !== questionSet.questions.length) {
        throw new ApiError(400, "All questions must be answered before submission");
      }

      if (responses.some((response) => response.response.trim().length === 0)) {
        throw new ApiError(400, "Submitted responses cannot be blank");
      }
    }
  }

  private async replaceAssessmentResponses(client: DbClient, assessmentId: string, responses: AssessmentResponse[]) {
    if (responses.length === 0) {
      await client.query("DELETE FROM assessment_responses WHERE assessment_id = $1", [assessmentId]);
      return;
    }

    for (const response of responses) {
      await client.query(
        `
          INSERT INTO assessment_responses (assessment_id, question_id, response_text)
          VALUES ($1, $2, $3)
          ON CONFLICT (assessment_id, question_id)
          DO UPDATE SET response_text = EXCLUDED.response_text
        `,
        [assessmentId, response.questionId, response.response],
      );
    }

    await client.query(
      `
        DELETE FROM assessment_responses
        WHERE assessment_id = $1
          AND NOT (question_id = ANY($2::uuid[]))
      `,
      [assessmentId, responses.map((response) => response.questionId)],
    );
  }

  private async applyAssessmentResponses(
    client: DbClient,
    assessment: AssessmentRecord,
    responses: AssessmentResponse[],
    nextState: AssessmentReviewState,
  ) {
    const questionSet = await this.questionSetOrThrow(client, assessment.assessment.questionSetId);
    this.assertAssessmentResponses(questionSet, responses, nextState === "submitted");

    await this.replaceAssessmentResponses(client, assessment.assessment.id, responses);

    const timestamp = nowIso();
    if (nextState === "submitted") {
      await client.query(
        `
          UPDATE assessments
          SET review_state = 'submitted',
              submitted_at = $2::timestamptz
          WHERE id = $1
        `,
        [assessment.assessment.id, timestamp],
      );
      return;
    }

    if (nextState === "draft") {
      await client.query(
        `
          UPDATE assessments
          SET review_state = 'draft',
              submitted_at = NULL,
              accepted_at = NULL,
              accepted_by_employee_id = NULL,
              reviewed_at = NULL,
              reviewed_by_employee_id = NULL
          WHERE id = $1
        `,
        [assessment.assessment.id],
      );
      return;
    }

    await client.query(
      `
        UPDATE assessments
        SET review_state = 'new'
        WHERE id = $1
      `,
      [assessment.assessment.id],
    );
  }

  private async invalidateEmployeeSessions(client: DbClient, employeeId: string, keepSessionId?: string) {
    if (keepSessionId) {
      await client.query(
        `
          DELETE FROM auth_sessions
          WHERE employee_id = $1
            AND id <> $2
        `,
        [employeeId, keepSessionId],
      );
      return;
    }

    await client.query("DELETE FROM auth_sessions WHERE employee_id = $1", [employeeId]);
  }

  private usernameForEmployee(employeeId: string | null, employeesById: Map<string, Employee>) {
    return employeeId ? employeesById.get(employeeId)?.username ?? null : null;
  }

  private passwordForTransfer(auth: StoredAuthMetadata, credentialKind: LocalUserCredentialKind, password: string) {
    if (credentialKind === "unset") {
      return "";
    }

    if (credentialKind === "password-hash") {
      return auth.passwordHash ?? "";
    }

    return password;
  }

  private toLocalUserTransferItem(
    employee: Employee,
    auth: StoredAuthMetadata,
    password: string,
    employeesById: Map<string, Employee>,
    credentialKind: LocalUserCredentialKind = "password",
  ): LocalUserTransferItem {
    return {
      id: employee.id,
      username: employee.username,
      fullName: employee.fullName,
      email: employee.email,
      role: employee.role,
      status: employee.status,
      managerUsername: this.usernameForEmployee(employee.managerId, employeesById),
      assessor1Username: this.usernameForEmployee(employee.assessor1Id, employeesById),
      assessor2Username: this.usernameForEmployee(employee.assessor2Id, employeesById),
      password: this.passwordForTransfer(auth, credentialKind, password),
      credentialKind,
      passwordResetRequired: auth.passwordResetRequired,
    };
  }

  private passwordHashForTransferItem(item: LocalUserTransferItem) {
    if (item.credentialKind === "unset") {
      return null;
    }

    return item.credentialKind === "password-hash" ? item.password : hashPassword(item.password);
  }

  private parseBooleanEnv(value: string | undefined) {
    if (!value) {
      return false;
    }

    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }

  private parseNumberEnv(value: string | undefined) {
    if (!value) {
      return null;
    }

    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private parseTimestampEnv(value: string | undefined) {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
  }

  private parseBackupScheduleEnv(value: string | undefined): BackupSchedule {
    return supportedBackupSchedules.includes(value as BackupSchedule) ? (value as BackupSchedule) : "daily";
  }

  private readBackupStatusOverrides() {
    const path = process.env.BACKUP_STATUS_PATH;
    if (!path || !existsSync(path)) {
      return null;
    }

    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      return {
        automaticBackupsEnabled:
          typeof parsed.automaticBackupsEnabled === "boolean"
            ? parsed.automaticBackupsEnabled
            : typeof parsed.dailyBackupsEnabled === "boolean"
              ? parsed.dailyBackupsEnabled
              : undefined,
        schedule:
          typeof parsed.schedule === "string" && supportedBackupSchedules.includes(parsed.schedule as BackupSchedule)
            ? (parsed.schedule as BackupSchedule)
            : undefined,
        retentionCount:
          typeof parsed.retentionCount === "number" && Number.isInteger(parsed.retentionCount) && parsed.retentionCount > 0
            ? parsed.retentionCount
            : typeof parsed.retentionDays === "number" && Number.isInteger(parsed.retentionDays) && parsed.retentionDays > 0
              ? parsed.retentionDays
              : undefined,
        lastBackupAt:
          typeof parsed.lastBackupAt === "string" && !Number.isNaN(new Date(parsed.lastBackupAt).valueOf())
            ? new Date(parsed.lastBackupAt).toISOString()
            : parsed.lastBackupAt === null
              ? null
              : undefined,
        lastRestoreAt:
          typeof parsed.lastRestoreAt === "string" && !Number.isNaN(new Date(parsed.lastRestoreAt).valueOf())
            ? new Date(parsed.lastRestoreAt).toISOString()
            : parsed.lastRestoreAt === null
              ? null
              : undefined,
      };
    } catch {
      return null;
    }
  }

  private getBackupStatusConfig(): BackupStatusConfig {
    const overrides = this.readBackupStatusOverrides();

    return {
      automaticBackupsEnabled:
        overrides?.automaticBackupsEnabled ??
        this.parseBooleanEnv(process.env.BACKUP_AUTOMATIC_ENABLED ?? process.env.BACKUP_DAILY_ENABLED),
      schedule: overrides?.schedule ?? this.parseBackupScheduleEnv(process.env.BACKUP_SCHEDULE),
      retentionCount:
        overrides?.retentionCount ??
        this.parseNumberEnv(process.env.BACKUP_RETENTION_COUNT ?? process.env.BACKUP_RETENTION_DAYS) ??
        14,
      lastBackupAt: overrides?.lastBackupAt ?? this.parseTimestampEnv(process.env.BACKUP_LAST_BACKUP_AT),
      lastRestoreAt: overrides?.lastRestoreAt ?? this.parseTimestampEnv(process.env.BACKUP_LAST_RESTORE_AT),
    };
  }

  private writeBackupStatusConfig(patch: Partial<BackupStatusConfig>) {
    const path = process.env.BACKUP_STATUS_PATH;
    if (!path) {
      return;
    }

    const nextStatus = {
      ...this.getBackupStatusConfig(),
      ...patch,
    } satisfies BackupStatusConfig;

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(nextStatus, null, 2)}\n`, "utf8");
  }

  private canManagerEdit(target: Employee, updates: UpdateEmployeeRequest) {
    if (target.role === "admin") {
      throw new ApiError(403, "Managers cannot edit admin accounts");
    }

    if (updates.role !== undefined) {
      throw new ApiError(403, "Managers cannot change app roles");
    }
  }

  private async ensureAssignmentCandidate(
    client: DbClient,
    reviewPeriodId: string,
    candidate: { id?: string; employeeId: string; managerId: string | null; assessorId: string },
  ) {
    await this.assertReviewPeriodMutable(client, reviewPeriodId);
    await this.employeeOrThrow(client, candidate.employeeId);
    await this.assertRelationships(client, {
      id: candidate.employeeId,
      managerId: candidate.managerId,
      assessor1Id: null,
      assessor2Id: candidate.assessorId,
    });

    const result = await client.query<ExistsRow>(
      `
        SELECT EXISTS(
          SELECT 1
          FROM review_period_assignments
          WHERE review_period_id = $1
            AND employee_id = $2
            AND ($3::uuid IS NULL OR id <> $3)
        ) AS exists
      `,
      [reviewPeriodId, candidate.employeeId, candidate.id ?? null],
    );

    if (result.rows[0]?.exists) {
      throw new ApiError(409, "Assignment already exists for this employee in the review period");
    }
  }

  async listEmployees() {
    const employees = await this.loadEmployeeRows(this.pool);
    return clone(employees.map((employee) => this.toEmployee(employee)));
  }

  async getEmployee(employeeId: string) {
    const employee = await this.employeeOrThrow(this.pool, employeeId);
    return clone(this.toEmployeeAdmin(employee));
  }

  async areSeededAccountsAvailable() {
    const usernames = Object.keys(seedPasswordsByUsername);
    const employees = await this.loadEmployeeRows(this.pool, { usernames });
    return employees.length === usernames.length && employees.every((employee) => employee.status === "active");
  }

  async authenticate(username: string, password: string) {
    const [employee] = await this.loadEmployeeRows(this.pool, { usernames: [username] });
    if (!employee || employee.status !== "active") {
      throw new ApiError(401, "Invalid username or password");
    }

    const auth = this.toStoredAuthMetadata(employee);
    if (!verifyPassword(password, auth.passwordHash)) {
      throw new ApiError(401, "Invalid username or password");
    }

    const issuedAt = nowIso();
    const expiresAt = new Date(Date.now() + eightHoursInMs).toISOString();
    const token = randomUUID();

    try {
      const sessionResult = await this.pool.query<AuthSessionRow>(
        `
          INSERT INTO auth_sessions (employee_id, token_hash, created_at, expires_at)
          VALUES ($1, $2, $3::timestamptz, $4::timestamptz)
          RETURNING id, employee_id, created_at, expires_at
        `,
        [employee.id, hashToken(token), issuedAt, expiresAt],
      );

      const row = sessionResult.rows[0];
      if (!row) {
        throw new ApiError(500, "Session creation failed");
      }

      return this.toSession(
        {
          sessionId: row.id,
          token,
          employeeId: employee.id,
          issuedAt: toIsoTimestamp(row.created_at) ?? issuedAt,
          expiresAt: toIsoTimestamp(row.expires_at) ?? expiresAt,
          permissions: clone(permissionsByRole[employee.role]),
        },
        employee,
      );
    } catch (error) {
      rethrowDatabaseError(error);
    }
  }

  async getSession(token: string) {
    const session = await this.loadSessionRecord(this.pool, token);
    if (!session) {
      return null;
    }

    return this.toSession(session.session, session.employee);
  }

  async logout(token: string) {
    const result = await this.pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [hashToken(token)]);
    return (result.rowCount ?? 0) > 0;
  }

  async changeOwnPassword(token: string, currentPassword: string, newPassword: string): Promise<AuthChangePasswordResponse> {
    try {
      return await withTransaction(async (client) => {
        const session = await this.sessionOrThrow(client, token);
        const auth = this.toStoredAuthMetadata(session.employee);
        if (!verifyPassword(currentPassword, auth.passwordHash)) {
          throw new ApiError(401, "Invalid username or password");
        }

        const timestamp = nowIso();
        await client.query(
          `
            UPDATE employees
            SET password_hash = $2,
                password_reset_required = FALSE,
                password_changed_at = $3::timestamptz,
                password_changed_by_employee_id = $1
            WHERE id = $1
          `,
          [session.employee.id, hashPassword(newPassword), timestamp],
        );
        await this.invalidateEmployeeSessions(client, session.employee.id, session.session.sessionId);

        const updatedEmployee = await this.employeeOrThrow(client, session.employee.id);
        return {
          session: this.toSession(session.session, updatedEmployee),
          lastPasswordChangeAt: timestamp,
        };
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async updateOwnProfile(token: string, updates: { fullName?: string; email?: string }): Promise<AuthSession> {
    try {
      return await withTransaction(async (client) => {
        const session = await this.sessionOrThrow(client, token);
        const nextFullName = updates.fullName ?? session.employee.full_name;
        const nextEmail = updates.email ?? session.employee.email;

        await this.assertUniqueEmployeeFields(client, {
          id: session.employee.id,
          username: session.employee.username,
          email: nextEmail,
        });

        const result = await client.query<EmployeeRow>(
          `
            UPDATE employees
            SET full_name = $2,
                email = $3
            WHERE id = $1
            RETURNING
              id,
              username,
              full_name,
              email,
              role,
              status,
              manager_employee_id,
              assessor1_employee_id,
              assessor2_employee_id,
              password_hash,
              password_reset_required,
              password_changed_at,
              created_at,
              updated_at,
              deleted_at
          `,
          [session.employee.id, nextFullName, nextEmail],
        );

        const updatedEmployee = result.rows[0];
        if (!updatedEmployee) {
          throw new ApiError(404, "Employee not found");
        }

        return this.toSession(session.session, updatedEmployee);
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async createEmployee(input: CreateEmployeeRequest) {
    try {
      return await withTransaction(async (client) => {
        await this.ensureEmployeeUsernameStorage(client);
        await this.assertUniqueEmployeeFields(client, input);

        const id = randomUUID();
        await this.assertRelationships(client, {
          id,
          managerId: input.managerId ?? null,
          assessor1Id: input.assessor1Id ?? null,
          assessor2Id: input.assessor2Id ?? null,
        });

        const timestamp = nowIso();
        const employeeResult = await client.query<EmployeeRow>(
          `
            INSERT INTO employees (
              id,
              username,
              full_name,
              email,
              role,
              status,
              manager_employee_id,
              assessor1_employee_id,
              assessor2_employee_id,
              password_hash,
              password_reset_required,
              password_changed_at,
              created_at,
              updated_at
            ) VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9,
              $10,
              FALSE,
              $11,
              $12::timestamptz,
              $12::timestamptz
            )
            RETURNING
              id,
              username,
              full_name,
              email,
              role,
              status,
              manager_employee_id,
              assessor1_employee_id,
              assessor2_employee_id,
              password_hash,
              password_reset_required,
              password_changed_at,
              created_at,
              updated_at,
              deleted_at
          `,
          [
            id,
            input.username,
            input.fullName,
            input.email,
            input.role,
            input.status ?? "active",
            input.managerId ?? null,
            input.assessor1Id ?? null,
            input.assessor2Id ?? null,
            input.password ? hashPassword(input.password) : null,
            input.password ? timestamp : null,
            timestamp,
          ],
        );

        const employee = employeeResult.rows[0];
        if (!employee) {
          throw new ApiError(500, "Employee creation failed");
        }

        return this.toEmployeeAdmin(employee);
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async updateEmployee(actor: Pick<Employee, "id" | "role">, employeeId: string, updates: UpdateEmployeeRequest) {
    try {
      return await withTransaction(async (client) => {
        await this.ensureEmployeeUsernameStorage(client);
        const existingRow = await this.employeeOrThrow(client, employeeId);
        const existing = this.toEmployee(existingRow);

        if (actor.role === "manager") {
          this.canManagerEdit(existing, updates);
        }

        const nextEmployee = {
          ...existing,
          ...updates,
        };

        await this.assertUniqueEmployeeFields(client, nextEmployee);
        await this.assertRelationships(client, {
          id: nextEmployee.id,
          managerId: nextEmployee.managerId,
          assessor1Id: nextEmployee.assessor1Id,
          assessor2Id: nextEmployee.assessor2Id,
        }, {
          allowDeletedIds: [existing.managerId, existing.assessor1Id, existing.assessor2Id].filter(
            (value): value is string => value !== null,
          ),
        });

        const result = await client.query<EmployeeRow>(
          `
            UPDATE employees
            SET username = $2,
                full_name = $3,
                email = $4,
                role = $5,
                status = $6,
                manager_employee_id = $7,
                assessor1_employee_id = $8,
                assessor2_employee_id = $9
            WHERE id = $1
            RETURNING
              id,
              username,
              full_name,
              email,
              role,
              status,
              manager_employee_id,
              assessor1_employee_id,
              assessor2_employee_id,
              password_hash,
              password_reset_required,
              password_changed_at,
              created_at,
              updated_at,
              deleted_at
          `,
          [
            employeeId,
            nextEmployee.username,
            nextEmployee.fullName,
            nextEmployee.email,
            nextEmployee.role,
            nextEmployee.status,
            nextEmployee.managerId,
            nextEmployee.assessor1Id,
            nextEmployee.assessor2Id,
          ],
        );

        const updatedEmployee = result.rows[0];
        if (!updatedEmployee) {
          throw new ApiError(404, "Employee not found");
        }

        if (existing.status !== "inactive" && nextEmployee.status === "inactive") {
          await this.removeEmployeeNotStartedAssessments(client, employeeId);
        }

        return this.toEmployeeAdmin(updatedEmployee);
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async deleteEmployee(employeeId: string) {
    try {
      return await withTransaction(async (client) => {
        await this.ensureEmployeeDeletedColumn(client);
        await this.employeeOrThrow(client, employeeId);

        const tombstonedAt = nowIso();
        await client.query("DELETE FROM auth_sessions WHERE employee_id = $1", [employeeId]);
        await this.removeDeletedEmployeeAssessments(client, employeeId);
        const deleteResult = await client.query(
          `
            UPDATE employees
            SET password_hash = NULL,
                password_reset_required = FALSE,
                password_changed_at = NULL,
                password_changed_by_employee_id = NULL,
                deleted_at = $2::timestamptz,
                updated_at = $2::timestamptz
            WHERE id = $1
              AND deleted_at IS NULL
          `,
          [employeeId, tombstonedAt],
        );
        if (deleteResult.rowCount === 0) {
          throw new ApiError(404, "Employee not found");
        }

        return {
          employeeId,
          deleted: true as const,
        };
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async setPassword(employeeId: string, password: string): Promise<SetEmployeePasswordResponse> {
    try {
      return await withTransaction(async (client) => {
        await this.employeeOrThrow(client, employeeId);
        const timestamp = nowIso();
        await client.query(
          `
            UPDATE employees
            SET password_hash = $2,
                password_reset_required = FALSE,
                password_changed_at = $3::timestamptz,
                password_changed_by_employee_id = NULL
            WHERE id = $1
          `,
          [employeeId, hashPassword(password), timestamp],
        );
        await this.invalidateEmployeeSessions(client, employeeId);

        return {
          employeeId,
          passwordResetRequired: false,
          lastPasswordChangeAt: timestamp,
        };
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async resetPassword(employeeId: string, password?: string): Promise<ResetEmployeePasswordResponse> {
    try {
      return await withTransaction(async (client) => {
        await this.employeeOrThrow(client, employeeId);
        const temporaryPassword = password ?? generateTemporaryPassword();
        const timestamp = nowIso();
        await client.query(
          `
            UPDATE employees
            SET password_hash = $2,
                password_reset_required = TRUE,
                password_changed_at = $3::timestamptz,
                password_changed_by_employee_id = NULL
            WHERE id = $1
          `,
          [employeeId, hashPassword(temporaryPassword), timestamp],
        );
        await this.invalidateEmployeeSessions(client, employeeId);

        return {
          employeeId,
          temporaryPassword,
          passwordResetRequired: true,
          lastPasswordChangeAt: timestamp,
        };
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async listReviewPeriods() {
    const result = await this.pool.query<ReviewPeriodRow>(
      `
        SELECT
          id,
          key,
          label,
          start_date,
          due_date,
          assessment_due_date,
          review_due_date,
          status,
          archived_at,
          archived_by_employee_id,
          created_at,
          updated_at
        FROM review_periods
        ORDER BY start_date DESC, created_at, id
      `,
    );

    return clone(result.rows.map((reviewPeriod) => this.toReviewPeriod(reviewPeriod)));
  }

  async getReviewPeriod(reviewPeriodId: string) {
    const reviewPeriod = await this.reviewPeriodOrThrow(this.pool, reviewPeriodId);
    return clone(this.toReviewPeriod(reviewPeriod));
  }

  async createReviewPeriod(input: CreateReviewPeriodRequest) {
    try {
      return await withTransaction(async (client) => {
        await this.assertReviewPeriodFields(client, input);

        const timestamp = nowIso();
        const reviewPeriodId = randomUUID();
        if (input.status === "active") {
          await this.deactivateOtherReviewPeriods(client, reviewPeriodId);
        }
        const result = await client.query<ReviewPeriodRow>(
          `
            INSERT INTO review_periods (
              id,
              key,
              label,
              start_date,
              due_date,
              assessment_due_date,
              review_due_date,
              status,
              archived_at,
              archived_by_employee_id,
              created_at,
              updated_at
            ) VALUES (
              $1,
              $2,
              $3,
              $4::date,
              $5::date,
              $6::date,
              $7::date,
              $8,
              NULL,
              NULL,
              $9::timestamptz,
              $9::timestamptz
            )
            RETURNING
              id,
              key,
              label,
              start_date,
              due_date,
              assessment_due_date,
              review_due_date,
              status,
              archived_at,
              archived_by_employee_id,
              created_at,
              updated_at
          `,
          [
            reviewPeriodId,
            input.key,
            input.label,
            input.startDate,
            input.dueDate,
            input.assessmentDueDate,
            input.reviewDueDate,
            input.status,
            timestamp,
          ],
        );

        const reviewPeriod = result.rows[0];
        if (!reviewPeriod) {
          throw new ApiError(500, "Review period creation failed");
        }

        return this.toReviewPeriod(reviewPeriod);
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async updateReviewPeriod(reviewPeriodId: string, updates: UpdateReviewPeriodRequest) {
    try {
      return await withTransaction(async (client) => {
        const reviewPeriod = this.toReviewPeriod(await this.assertReviewPeriodMutable(client, reviewPeriodId));
        const nextReviewPeriod = {
          ...reviewPeriod,
          ...updates,
        };
        await this.assertReviewPeriodFields(client, nextReviewPeriod);

        if (nextReviewPeriod.status === "active") {
          await this.deactivateOtherReviewPeriods(client, reviewPeriodId);
        }

        const result = await client.query<ReviewPeriodRow>(
          `
            UPDATE review_periods
            SET key = $2,
                label = $3,
                start_date = $4::date,
                due_date = $5::date,
                assessment_due_date = $6::date,
                review_due_date = $7::date,
                status = $8
            WHERE id = $1
            RETURNING
              id,
              key,
              label,
              start_date,
              due_date,
              assessment_due_date,
              review_due_date,
              status,
              archived_at,
              archived_by_employee_id,
              created_at,
              updated_at
          `,
          [
            reviewPeriodId,
            nextReviewPeriod.key,
            nextReviewPeriod.label,
            nextReviewPeriod.startDate,
            nextReviewPeriod.dueDate,
            nextReviewPeriod.assessmentDueDate,
            nextReviewPeriod.reviewDueDate,
            nextReviewPeriod.status,
          ],
        );

        const updatedReviewPeriod = result.rows[0];
        if (!updatedReviewPeriod) {
          throw new ApiError(404, "Review period not found");
        }

        return this.toReviewPeriod(updatedReviewPeriod);
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async archiveReviewPeriod(reviewPeriodId: string, actorEmployeeId: string) {
    try {
      return await withTransaction(async (client) => {
        await this.employeeOrThrow(client, actorEmployeeId);
        const reviewPeriod = await this.reviewPeriodOrThrow(client, reviewPeriodId);
        if (reviewPeriod.status === "archived") {
          throw new ApiError(409, "Review period is already archived");
        }

        const timestamp = nowIso();
        const result = await client.query<ReviewPeriodRow>(
          `
            UPDATE review_periods
            SET status = 'archived',
                archived_at = $2::timestamptz,
                archived_by_employee_id = $3
            WHERE id = $1
            RETURNING
              id,
              key,
              label,
              start_date,
              due_date,
              assessment_due_date,
              review_due_date,
              status,
              archived_at,
              archived_by_employee_id,
              created_at,
              updated_at
          `,
          [reviewPeriodId, timestamp, actorEmployeeId],
        );

        const archivedReviewPeriod = result.rows[0];
        if (!archivedReviewPeriod) {
          throw new ApiError(404, "Review period not found");
        }

        return this.toReviewPeriod(archivedReviewPeriod);
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async unarchiveReviewPeriod(reviewPeriodId: string) {
    try {
      return await withTransaction(async (client) => {
        const reviewPeriod = await this.reviewPeriodOrThrow(client, reviewPeriodId);
        if (reviewPeriod.status === "inactive") {
          throw new ApiError(409, "Review period is already available in the workspace");
        }

        const result = await client.query<ReviewPeriodRow>(
          `
            UPDATE review_periods
            SET status = 'inactive',
                archived_at = NULL,
                archived_by_employee_id = NULL
            WHERE id = $1
            RETURNING
              id,
              key,
              label,
              start_date,
              due_date,
              assessment_due_date,
              review_due_date,
              status,
              archived_at,
              archived_by_employee_id,
              created_at,
              updated_at
          `,
          [reviewPeriodId],
        );

        const unarchivedReviewPeriod = result.rows[0];
        if (!unarchivedReviewPeriod) {
          throw new ApiError(404, "Review period not found");
        }

        return this.toReviewPeriod(unarchivedReviewPeriod);
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async syncAssessmentsToAssignments(reviewPeriodId: string): Promise<SyncAssessmentsResponse> {
    try {
      return await withTransaction(async (client) => {
        const reviewPeriod = this.toReviewPeriod(await this.reviewPeriodOrThrow(client, reviewPeriodId));
        if (reviewPeriod.status !== "active") {
          throw new ApiError(409, "Assessments can only be synced for the active review period");
        }

        const selfQuestionSet = await this.activeQuestionSetOrThrow(reviewPeriodId, "self", client);
        const employeeRows = await this.loadEmployeeRows(client);
        const employees = employeeRows.map((row) => this.toEmployee(row)).filter((employee) => employee.status === "active");
        const activeEmployeesById = new Map(employees.map((employee) => [employee.id, employee] as const));
        const expectedAssessmentKeys = new Set<string>();
        for (const employee of employees) {
          expectedAssessmentKeys.add(`${employee.id}:${employee.id}`);
          for (const assessorId of new Set([employee.assessor1Id, employee.assessor2Id].filter((value): value is string => value !== null))) {
            if (assessorId !== employee.id && activeEmployeesById.has(assessorId)) {
              expectedAssessmentKeys.add(`${employee.id}:${assessorId}`);
            }
          }
        }

        await this.removeUnexpectedNotStartedAssessments(client, reviewPeriodId, expectedAssessmentKeys);

        const assignments = await this.loadAssignments(client, { reviewPeriodId });
        const assignmentByKey = new Map(assignments.map((assignment) => [`${assignment.employeeId}:${assignment.assessorId}`, assignment] as const));
        const existingAssessments = await this.loadAssessmentRecords(client, { reviewPeriodId });
        const existingAssessmentKeys = new Set(
          existingAssessments.map((assessment) => `${assessment.assessment.employeeId}:${assessment.assessment.assessorId}`),
        );

        let peerQuestionSet: QuestionSet | null = null;
        let createdSelfAssessments = 0;
        let createdPeerAssessments = 0;
        const createdAt = nowIso();

        for (const employee of employees) {
          const selfKey = `${employee.id}:${employee.id}`;
          if (!existingAssessmentKeys.has(selfKey)) {
            await client.query(
              `
                INSERT INTO assessments (
                  id,
                  review_period_id,
                  question_set_id,
                  assignment_id,
                  target,
                  employee_id,
                  assessor_employee_id,
                  review_state,
                  archive_state,
                  submitted_at,
                  accepted_at,
                  accepted_by_employee_id,
                  reviewed_at,
                  reviewed_by_employee_id,
                  manager_notes,
                  created_at,
                  updated_at
                ) VALUES (
                  $1,
                  $2,
                  $3,
                  NULL,
                  'self',
                  $4,
                  $4,
                  'new',
                  'active',
                  NULL,
                  NULL,
                  NULL,
                  NULL,
                  NULL,
                  NULL,
                  $5::timestamptz,
                  $5::timestamptz
                )
              `,
              [randomUUID(), reviewPeriodId, selfQuestionSet.id, employee.id, createdAt],
            );
            existingAssessmentKeys.add(selfKey);
            createdSelfAssessments += 1;
          }

          const peerAssessors = Array.from(
            new Set([employee.assessor1Id, employee.assessor2Id].filter((value): value is string => value !== null)),
          ).filter((assessorId) => assessorId !== employee.id && activeEmployeesById.has(assessorId));

          for (const assessorId of peerAssessors) {
            const assessmentKey = `${employee.id}:${assessorId}`;
            if (existingAssessmentKeys.has(assessmentKey)) {
              continue;
            }

            peerQuestionSet ??= await this.activeQuestionSetOrThrow(reviewPeriodId, "peer", client);
            const assignment = assignmentByKey.get(`${employee.id}:${assessorId}`) ?? null;

            await client.query(
              `
                INSERT INTO assessments (
                  id,
                  review_period_id,
                  question_set_id,
                  assignment_id,
                  target,
                  employee_id,
                  assessor_employee_id,
                  review_state,
                  archive_state,
                  submitted_at,
                  accepted_at,
                  accepted_by_employee_id,
                  reviewed_at,
                  reviewed_by_employee_id,
                  manager_notes,
                  created_at,
                  updated_at
                ) VALUES (
                  $1,
                  $2,
                  $3,
                  $4,
                  'peer',
                  $5,
                  $6,
                  'new',
                  'active',
                  NULL,
                  NULL,
                  NULL,
                  NULL,
                  NULL,
                  NULL,
                  $7::timestamptz,
                  $7::timestamptz
                )
              `,
              [randomUUID(), reviewPeriodId, peerQuestionSet.id, assignment?.id ?? null, employee.id, assessorId, createdAt],
            );
            existingAssessmentKeys.add(assessmentKey);
            createdPeerAssessments += 1;
          }
        }

        return {
          reviewPeriodId,
          createdSelfAssessments,
          createdPeerAssessments,
        };
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async clearReadyToStartAssessments(reviewPeriodId: string): Promise<ClearReadyAssessmentsResponse> {
    try {
      return await withTransaction(async (client) => {
        const reviewPeriod = this.toReviewPeriod(await this.reviewPeriodOrThrow(client, reviewPeriodId));
        if (reviewPeriod.status !== "active") {
          throw new ApiError(409, "Not started assessments can only be cleared for the active review period");
        }

        return {
          reviewPeriodId,
          clearedAssessments: await this.deleteAssessmentsById(
            client,
            (await this.loadNotStartedAssessments(client, reviewPeriodId)).map((assessment) => assessment.id),
          ),
        };
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async listQuestionSets(reviewPeriodId?: string) {
    return clone(await this.loadQuestionSets(this.pool, reviewPeriodId ? { reviewPeriodId } : {}));
  }

  async getQuestionSet(questionSetId: string) {
    return clone(await this.questionSetOrThrow(this.pool, questionSetId));
  }

  async createQuestionSet(reviewPeriodId: string, input: CreateQuestionSetRequest) {
    try {
      return await withTransaction(async (client) => {
        await this.assertReviewPeriodMutable(client, reviewPeriodId);
        this.assertQuestionInputs(input.questions);

        const timestamp = nowIso();
        const questionSetId = randomUUID();
        await client.query(
          `
            INSERT INTO question_sets (
              id,
              review_period_id,
              target,
              status,
              title,
              header_markdown,
              footer_markdown,
              created_at,
              updated_at
            ) VALUES (
              $1,
              $2,
              $3,
              'draft',
              $4,
              $5,
              $6,
              $7::timestamptz,
              $7::timestamptz
            )
          `,
          [questionSetId, reviewPeriodId, input.target, input.title, input.headerMarkdown, input.footerMarkdown, timestamp],
        );

        for (const question of input.questions) {
          await client.query(
            `
              INSERT INTO question_set_questions (id, question_set_id, display_order, type, category, prompt)
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [question.id ?? randomUUID(), questionSetId, question.order, question.type, question.category, question.prompt],
          );
        }

        await this.insertQuestionCategories(client, input.questions.map((question) => question.category));

        return await this.questionSetOrThrow(client, questionSetId);
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async updateQuestionSet(questionSetId: string, updates: UpdateQuestionSetRequest) {
    try {
      return await withTransaction(async (client) => {
        const questionSet = await this.questionSetOrThrow(client, questionSetId);
        await this.assertReviewPeriodMutable(client, questionSet.reviewPeriodId);

        if (updates.questions) {
          this.assertQuestionInputs(updates.questions);
        }

        const nextQuestionSet = {
          ...questionSet,
          ...updates,
        };

        await client.query(
          `
            UPDATE question_sets
            SET title = $2,
                header_markdown = $3,
                footer_markdown = $4,
                status = $5
            WHERE id = $1
          `,
          [
            questionSetId,
            nextQuestionSet.title,
            nextQuestionSet.headerMarkdown,
            nextQuestionSet.footerMarkdown,
            updates.status ?? questionSet.status,
          ],
        );

        if (updates.questions !== undefined) {
          const existingQuestionIds = new Set(questionSet.questions.map((question) => question.id));
          const retainedQuestionIds = new Set(
            updates.questions.flatMap((question) => (question.id && existingQuestionIds.has(question.id) ? [question.id] : [])),
          );
          const removedQuestionIds = questionSet.questions
            .map((question) => question.id)
            .filter((questionId) => !retainedQuestionIds.has(questionId));

          if (removedQuestionIds.length > 0) {
            const referencedQuestionResult = await client.query<{ question_id: string }>(
              `
                SELECT DISTINCT question_id
                FROM assessment_responses
                WHERE question_id = ANY($1::uuid[])
              `,
              [removedQuestionIds],
            );

            if (referencedQuestionResult.rows.length > 0) {
              throw new ApiError(
                409,
                "Questions with recorded assessment responses cannot be removed from a question set. Create a new question set instead.",
              );
            }
          }

          for (const question of updates.questions) {
            if (question.id && existingQuestionIds.has(question.id)) {
              await client.query(
                `
                  UPDATE question_set_questions
                  SET display_order = $3,
                      type = $4,
                      category = $5,
                      prompt = $6
                  WHERE id = $1
                    AND question_set_id = $2
                `,
                [question.id, questionSetId, question.order, question.type, question.category, question.prompt],
              );
              continue;
            }

            await client.query(
              `
                INSERT INTO question_set_questions (id, question_set_id, display_order, type, category, prompt)
                VALUES ($1, $2, $3, $4, $5, $6)
              `,
              [question.id ?? randomUUID(), questionSetId, question.order, question.type, question.category, question.prompt],
            );
          }

          if (removedQuestionIds.length > 0) {
            await client.query("DELETE FROM question_set_questions WHERE question_set_id = $1 AND id = ANY($2::uuid[])", [
              questionSetId,
              removedQuestionIds,
            ]);
          }

          await this.insertQuestionCategories(client, updates.questions.map((question) => question.category));
        }

        if (updates.status === "active") {
          await client.query(
            `
              UPDATE question_sets
              SET status = 'draft'
              WHERE review_period_id = $1
                AND target = $2
                AND id <> $3
                AND status = 'active'
            `,
            [questionSet.reviewPeriodId, questionSet.target, questionSetId],
          );
          await client.query("UPDATE question_sets SET status = 'active' WHERE id = $1", [questionSetId]);
        }

        return await this.questionSetOrThrow(client, questionSetId);
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async activateQuestionSet(questionSetId: string) {
    try {
      return await withTransaction(async (client) => {
        const questionSet = await this.questionSetOrThrow(client, questionSetId);
        await this.assertReviewPeriodMutable(client, questionSet.reviewPeriodId);

        await client.query(
          `
            UPDATE question_sets
            SET status = 'draft'
            WHERE review_period_id = $1
              AND target = $2
              AND id <> $3
              AND status = 'active'
          `,
          [questionSet.reviewPeriodId, questionSet.target, questionSetId],
        );
        await client.query("UPDATE question_sets SET status = 'active' WHERE id = $1", [questionSetId]);

        return await this.questionSetOrThrow(client, questionSetId);
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async exportQuestionSets(reviewPeriodId: string, format: "json" | "csv"): Promise<ExportStubResponse> {
    await this.reviewPeriodOrThrow(this.pool, reviewPeriodId);
    const result = await this.pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM question_sets
        WHERE review_period_id = $1
      `,
      [reviewPeriodId],
    );

    return {
      reviewPeriodId,
      resource: "questionSets",
      format,
      exportedAt: nowIso(),
      stub: true,
      itemCount: Number(result.rows[0]?.count ?? "0"),
    };
  }

  async importQuestionSetsStub(reviewPeriodId: string): Promise<ImportStubResponse> {
    await this.reviewPeriodOrThrow(this.pool, reviewPeriodId);
    return {
      reviewPeriodId,
      resource: "questionSets",
      accepted: false,
      status: "not_implemented",
      supportedFormats: ["json", "csv"],
    };
  }

  async exportLocalUsers(
    format: "json" | "csv",
    mode: LocalUsersExportMode = "rotate-passcodes",
  ): Promise<LocalUsersExportResponse> {
    try {
      return await withTransaction(async (client) => {
        const employeeRows = await this.loadEmployeeRows(client);
        const employees = employeeRows.map((employee) => this.toEmployee(employee));
        const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
        const exportedAt = nowIso();
        const items: LocalUserTransferItem[] = [];

        for (const employeeRow of employeeRows) {
          const auth = this.toStoredAuthMetadata(employeeRow);
          const credentialKind: LocalUserCredentialKind =
            mode === "preserve-passwords" ? (auth.passwordHash ? "password-hash" : "unset") : "password";
          const password = mode === "preserve-passwords" ? auth.passwordHash ?? "" : generateTemporaryPassword();

          if (mode === "rotate-passcodes") {
            await client.query(
              `
                UPDATE employees
                SET password_hash = $2,
                    password_reset_required = TRUE,
                    password_changed_at = $3::timestamptz,
                    password_changed_by_employee_id = NULL
                WHERE id = $1
              `,
              [employeeRow.id, hashPassword(password), exportedAt],
            );
          }

          items.push(
            this.toLocalUserTransferItem(
              this.toEmployee(employeeRow),
              mode === "rotate-passcodes"
                ? {
                    ...auth,
                    passwordHash: password,
                    passwordConfigured: true,
                    passwordResetRequired: true,
                    lastPasswordChangeAt: exportedAt,
                  }
                : auth,
              password,
              employeesById,
              credentialKind,
            ),
          );
        }

        if (mode === "rotate-passcodes" && employeeRows.length > 0) {
          await client.query("DELETE FROM auth_sessions WHERE employee_id = ANY($1::uuid[])", [employeeRows.map((employee) => employee.id)]);
        }

        return {
          format,
          mode,
          exportedAt,
          itemCount: items.length,
          items,
        };
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async importLocalUsers(format: "json" | "csv", items: LocalUserTransferItem[]): Promise<LocalUsersImportResponse> {
    try {
      return await withTransaction(async (client) => {
        await this.ensureEmployeeUsernameStorage(client);
        const importedAt = nowIso();
        const seenUsernames = new Set<string>();
        const seenEmails = new Set<string>();

        for (const item of items) {
          const normalizedUsername = this.normalizeUsername(item.username);
          if (seenUsernames.has(normalizedUsername)) {
            throw new ApiError(400, "Imported usernames must be unique");
          }
          if (seenEmails.has(item.email)) {
            throw new ApiError(400, "Imported emails must be unique");
          }
          seenUsernames.add(normalizedUsername);
          seenEmails.add(item.email);
        }

        const existingRows = await this.loadEmployeeRows(client, {
          usernames: items.map((item) => item.username),
          includeDeleted: true,
        });
        const existingByUsername = new Map(
          existingRows.map((employee) => [this.normalizeUsername(employee.username), employee] as const),
        );

        let createdCount = 0;
        let updatedCount = 0;
        for (const item of items) {
          const existing = existingByUsername.get(this.normalizeUsername(item.username));
          if (existing) {
            updatedCount += 1;
            await this.assertUniqueEmployeeFields(client, {
              id: existing.id,
              username: item.username,
              email: item.email,
            });
            await client.query(
              `
                UPDATE employees
                SET full_name = $2,
                    email = $3,
                    role = $4,
                    status = $5,
                    deleted_at = NULL
                WHERE id = $1
              `,
              [existing.id, item.fullName, item.email, item.role, item.status],
            );
            continue;
          }

          createdCount += 1;
          await this.assertUniqueEmployeeFields(client, {
            username: item.username,
            email: item.email,
          });
          await client.query(
            `
              INSERT INTO employees (
                id,
                username,
                full_name,
                email,
                role,
                status,
                manager_employee_id,
                assessor1_employee_id,
                assessor2_employee_id,
                created_at,
                updated_at
              ) VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                NULL,
                NULL,
                NULL,
                $7::timestamptz,
                $7::timestamptz
              )
            `,
            [item.id ?? randomUUID(), item.username, item.fullName, item.email, item.role, item.status, importedAt],
          );
        }

        const referencedUsernames = Array.from(
          new Set(
            items
              .flatMap((item) => [item.username, item.managerUsername, item.assessor1Username, item.assessor2Username])
              .filter((value): value is string => value !== null),
          ),
        );
        const finalRows = await this.loadEmployeeRows(client, { usernames: referencedUsernames });
        const finalByUsername = new Map(
          finalRows.map((employee) => [this.normalizeUsername(employee.username), employee] as const),
        );

        for (const item of items) {
          const employee = finalByUsername.get(this.normalizeUsername(item.username));
          if (!employee) {
            throw new ApiError(500, "Imported employee missing after merge");
          }

          const managerId = item.managerUsername === null
            ? null
            : finalByUsername.get(this.normalizeUsername(item.managerUsername))?.id ?? (() => {
                throw new ApiError(400, `Manager username not found: ${item.managerUsername}`);
              })();
          const assessor1Id = item.assessor1Username === null
            ? null
            : finalByUsername.get(this.normalizeUsername(item.assessor1Username))?.id ?? (() => {
                throw new ApiError(400, `Assessor 1 username not found: ${item.assessor1Username}`);
              })();
          const assessor2Id = item.assessor2Username === null
            ? null
            : finalByUsername.get(this.normalizeUsername(item.assessor2Username))?.id ?? (() => {
                throw new ApiError(400, `Assessor 2 username not found: ${item.assessor2Username}`);
              })();

          await this.assertRelationships(client, {
            id: employee.id,
            managerId,
            assessor1Id,
            assessor2Id,
          });

          await client.query(
            `
              UPDATE employees
              SET manager_employee_id = $2,
                  assessor1_employee_id = $3,
                  assessor2_employee_id = $4,
                  password_hash = $5,
                  password_reset_required = $6,
                  password_changed_at = $7::timestamptz,
                  password_changed_by_employee_id = NULL
              WHERE id = $1
            `,
            [
              employee.id,
              managerId,
              assessor1Id,
              assessor2Id,
              this.passwordHashForTransferItem(item),
              item.passwordResetRequired,
              importedAt,
            ],
          );
        }

        const importedRows = await this.loadEmployeeRows(client, { usernames: items.map((item) => item.username) });
        if (importedRows.length > 0) {
          await client.query("DELETE FROM auth_sessions WHERE employee_id = ANY($1::uuid[])", [importedRows.map((employee) => employee.id)]);
        }

        const importedByUsername = new Map(
          importedRows.map((employee) => [this.normalizeUsername(employee.username), employee] as const),
        );
        const importedEmployees = items.map((item) => {
          const employee = importedByUsername.get(this.normalizeUsername(item.username));
          if (!employee) {
            throw new ApiError(500, "Imported employee missing after commit");
          }

          return this.toEmployeeAdmin(employee);
        });

        return {
          format,
          importedAt,
          itemCount: items.length,
          createdCount,
          updatedCount,
          items: importedEmployees,
        };
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async listAssignments(reviewPeriodId?: string) {
    return clone(await this.loadAssignments(this.pool, reviewPeriodId ? { reviewPeriodId } : {}));
  }

  async getAssignment(assignmentId: string) {
    return clone(await this.assignmentOrThrow(this.pool, assignmentId));
  }

  async createAssignment(reviewPeriodId: string, input: CreateAssignmentRequest) {
    try {
      return await withTransaction(async (client) => {
        await this.ensureAssignmentCandidate(client, reviewPeriodId, {
          employeeId: input.employeeId,
          managerId: input.managerId,
          assessorId: input.assessorId,
        });

        const timestamp = nowIso();
        const assignmentId = randomUUID();
        await client.query(
          `
            INSERT INTO review_period_assignments (
              id,
              review_period_id,
              employee_id,
              manager_employee_id,
              assessor_employee_id,
              created_at,
              updated_at
            ) VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6::timestamptz,
              $6::timestamptz
            )
          `,
          [assignmentId, reviewPeriodId, input.employeeId, input.managerId, input.assessorId, timestamp],
        );

        return await this.assignmentOrThrow(client, assignmentId);
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async updateAssignment(assignmentId: string, updates: UpdateAssignmentRequest) {
    try {
      return await withTransaction(async (client) => {
        const assignment = await this.assignmentOrThrow(client, assignmentId);
        await this.ensureAssignmentCandidate(client, assignment.reviewPeriodId, {
          id: assignment.id,
          employeeId: assignment.employeeId,
          managerId: updates.managerId !== undefined ? updates.managerId : assignment.managerId,
          assessorId: updates.assessorId !== undefined ? updates.assessorId : assignment.assessorId,
        });

        const result = await client.query<AssignmentRow>(
          `
            UPDATE review_period_assignments
            SET manager_employee_id = $2,
                assessor_employee_id = $3
            WHERE id = $1
            RETURNING
              id,
              review_period_id,
              employee_id,
              manager_employee_id,
              assessor_employee_id,
              created_at,
              updated_at
          `,
          [
            assignmentId,
            updates.managerId !== undefined ? updates.managerId : assignment.managerId,
            updates.assessorId !== undefined ? updates.assessorId : assignment.assessorId,
          ],
        );

        const updatedAssignment = result.rows[0];
        if (!updatedAssignment) {
          throw new ApiError(404, "Assignment not found");
        }

        return {
          id: updatedAssignment.id,
          reviewPeriodId: updatedAssignment.review_period_id,
          employeeId: updatedAssignment.employee_id,
          managerId: updatedAssignment.manager_employee_id,
          assessorId: updatedAssignment.assessor_employee_id,
          createdAt: toIsoTimestamp(updatedAssignment.created_at) ?? nowIso(),
          updatedAt: toIsoTimestamp(updatedAssignment.updated_at) ?? nowIso(),
        } satisfies Assignment;
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async deleteAssignment(assignmentId: string) {
    try {
      return await withTransaction(async (client) => {
        const assignment = await this.assignmentOrThrow(client, assignmentId);
        await this.assertReviewPeriodMutable(client, assignment.reviewPeriodId);

        const assessmentReference = await client.query<ExistsRow>(
          `
            SELECT EXISTS(
              SELECT 1
              FROM assessments
              WHERE assignment_id = $1
            ) AS exists
          `,
          [assignmentId],
        );
        if (assessmentReference.rows[0]?.exists) {
          throw new ApiError(409, "Assignment is still referenced by assessments");
        }

        await client.query("DELETE FROM review_period_assignments WHERE id = $1", [assignmentId]);

        return {
          assignmentId,
          deleted: true as const,
        };
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async exportAssignments(reviewPeriodId: string, format: "json" | "csv"): Promise<ExportStubResponse> {
    await this.reviewPeriodOrThrow(this.pool, reviewPeriodId);
    const result = await this.pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM review_period_assignments
        WHERE review_period_id = $1
      `,
      [reviewPeriodId],
    );

    return {
      reviewPeriodId,
      resource: "assignments",
      format,
      exportedAt: nowIso(),
      stub: true,
      itemCount: Number(result.rows[0]?.count ?? "0"),
    };
  }

  async importAssignmentsStub(reviewPeriodId: string): Promise<ImportStubResponse> {
    await this.reviewPeriodOrThrow(this.pool, reviewPeriodId);
    return {
      reviewPeriodId,
      resource: "assignments",
      accepted: false,
      status: "not_implemented",
      supportedFormats: ["json", "csv"],
    };
  }

  async listQuestionCategories() {
    return this.loadQuestionCategories(this.pool);
  }

  async replaceQuestionCategories(input: UpdateQuestionCategoriesRequest) {
    return withTransaction(async (client) => {
      await this.ensureQuestionCategoriesTable(client);
      await client.query("DELETE FROM question_categories");
      await this.insertQuestionCategories(client, input.items);
      return this.loadQuestionCategories(client);
    });
  }

  private async ensureWorkflowSettingsTable(client: DbClient) {
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS workflow_settings (
          id boolean PRIMARY KEY DEFAULT TRUE CHECK (id),
          markdown text NOT NULL,
          visibility text NOT NULL CHECK (visibility IN ('all', 'managers', 'admin only')),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `,
    );

    await client.query(
      `
        INSERT INTO workflow_settings (id, markdown, visibility)
        VALUES (TRUE, $1, $2)
        ON CONFLICT (id) DO NOTHING
      `,
      [defaultWorkflowMarkdown, defaultWorkflowVisibility],
    );
  }

  private toWorkflowSettings(row: WorkflowSettingsRow): WorkflowSettings {
    return {
      markdown: row.markdown,
      visibility: row.visibility,
    };
  }

  async getWorkflowSettings(client: DbClient = this.pool): Promise<WorkflowSettings> {
    await this.ensureWorkflowSettingsTable(client);
    const result = await client.query<WorkflowSettingsRow>(
      `
        SELECT markdown, visibility
        FROM workflow_settings
        WHERE id = TRUE
      `,
    );

    const row = result.rows[0];
    if (!row) {
      throw new ApiError(500, "Workflow settings are unavailable");
    }

    return this.toWorkflowSettings(row);
  }

  private async replaceWorkflowSettings(client: DbClient, input: WorkflowSettings) {
    await this.ensureWorkflowSettingsTable(client);
    await client.query(
      `
        UPDATE workflow_settings
        SET markdown = $1,
            visibility = $2,
            updated_at = NOW()
        WHERE id = TRUE
      `,
      [input.markdown, input.visibility],
    );
  }

  async updateWorkflowSettings(input: UpdateWorkflowSettingsRequest): Promise<WorkflowSettings> {
    return withTransaction(async (client) => {
      await this.replaceWorkflowSettings(client, input);
      return this.getWorkflowSettings(client);
    });
  }

  async getBackupStatus(): Promise<BackupStatusResponse> {
    const config = this.getBackupStatusConfig();

    return {
      automaticBackupsEnabled: config.automaticBackupsEnabled,
      schedule: config.schedule,
      retentionCount: config.retentionCount,
      lastBackupAt: config.lastBackupAt,
      lastRestoreAt: config.lastRestoreAt,
      defaultUserExportMode: "preserve-passwords",
      replaceStrategy: "replace",
      supportedFormats: ["json"],
      supportedSchedules: supportedBackupSchedules,
      supportedRestoreModes: ["replace"],
      supportedRestoreScopes: ["all", "users", "questions", "reviews"],
      supportedUserExportModes: ["rotate-passcodes", "preserve-passwords"],
    };
  }

  async updateBackupStatus(input: UpdateBackupStatusRequest): Promise<BackupStatusResponse> {
    this.writeBackupStatusConfig({
      automaticBackupsEnabled: input.automaticBackupsEnabled,
      schedule: input.schedule,
      retentionCount: input.retentionCount,
    });

    return this.getBackupStatus();
  }

  async createBackup(mode: LocalUsersExportMode = "preserve-passwords"): Promise<BackupSnapshot> {
    const [users, reviewPeriods, questionSets, questionCategories, assignments, assessments, workflow] = await Promise.all([
      this.exportLocalUsers("json", mode),
      this.listReviewPeriods(),
      this.listQuestionSets(),
      this.listQuestionCategories(),
      this.listAssignments(),
      this.loadAssessmentRecords(this.pool).then((items) => items.map((item) => item.assessment)),
      this.getWorkflowSettings(),
    ]);

    const backup = {
      version: 1 as const,
      exportedAt: users.exportedAt,
      users: {
        mode: users.mode,
        itemCount: users.itemCount,
        items: users.items,
      },
      reviewData: {
        reviewPeriods,
        questionSets,
        questionCategories,
        assignments,
        assessments,
        workflow,
      },
    };

    this.writeBackupStatusConfig({
      lastBackupAt: backup.exportedAt,
    });

    return backup;
  }

  private async assertReviewDataEmployeesExist(client: DbClient, reviewData: BackupReviewData) {
    const employeeIds = Array.from(
      new Set(
        [
          ...reviewData.reviewPeriods.map((item) => item.archivedByEmployeeId),
          ...reviewData.assignments.flatMap((item) => [item.employeeId, item.managerId, item.assessorId]),
          ...reviewData.assessments.flatMap((item) => [
            item.employeeId,
            item.assessorId,
            item.acceptedByEmployeeId,
            item.reviewedByEmployeeId,
          ]),
        ].filter((value): value is string => value !== null),
      ),
    );

    if (employeeIds.length === 0) {
      return;
    }

    const existingRows = await this.loadEmployeeRows(client, { employeeIds });
    const existingIds = new Set(existingRows.map((row) => row.id));
    const missingIds = employeeIds.filter((employeeId) => !existingIds.has(employeeId));
    if (missingIds.length > 0) {
      throw new ApiError(409, `Backup references missing employees: ${missingIds.join(", ")}`);
    }
  }

  private async insertReviewPeriodsSnapshot(client: DbClient, reviewPeriods: ReviewPeriod[]) {
    for (const period of reviewPeriods) {
      await client.query(
        `
          INSERT INTO review_periods (
            id,
            key,
            label,
            start_date,
            due_date,
            assessment_due_date,
            review_due_date,
            status,
            archived_at,
            archived_by_employee_id,
            created_at,
            updated_at
          ) VALUES ($1,$2,$3,$4::date,$5::date,$6::date,$7::date,$8,$9::timestamptz,$10,$11::timestamptz,$12::timestamptz)
        `,
        [
          period.id,
          period.key,
          period.label,
          period.startDate,
          period.dueDate,
          period.assessmentDueDate,
          period.reviewDueDate,
          period.status,
          period.archivedAt,
          period.archivedByEmployeeId,
          period.createdAt,
          period.updatedAt,
        ],
      );
    }
  }

  private async insertQuestionSetsSnapshot(client: DbClient, questionSets: QuestionSet[]) {
    for (const questionSet of questionSets) {
      const questionCategories: string[] = [];
      await client.query(
        `
          INSERT INTO question_sets (
            id,
            review_period_id,
            target,
            status,
            title,
            header_markdown,
            footer_markdown,
            created_at,
            updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz)
        `,
        [
          questionSet.id,
          questionSet.reviewPeriodId,
          questionSet.target,
          questionSet.status,
          questionSet.title,
          questionSet.headerMarkdown,
          questionSet.footerMarkdown,
          questionSet.createdAt,
          questionSet.updatedAt,
        ],
      );

      for (const question of questionSet.questions) {
        await client.query(
          `
            INSERT INTO question_set_questions (
              id,
              question_set_id,
              display_order,
              type,
              category,
              prompt,
              created_at,
              updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz)
          `,
          [
            question.id,
            questionSet.id,
            question.order,
            question.type,
            question.category,
            question.prompt,
            questionSet.createdAt,
            questionSet.updatedAt,
          ],
        );
        if (question.category) {
          questionCategories.push(question.category);
        }
      }

      await this.insertQuestionCategories(client, questionCategories);
    }
  }

  private normalizeQuestionCategories(categories: Array<string | null | undefined>) {
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const category of categories) {
      if (typeof category !== "string") {
        continue;
      }

      const trimmedCategory = category.trim();
      if (!trimmedCategory) {
        continue;
      }

      const key = trimmedCategory.toLocaleLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      normalized.push(trimmedCategory);
    }

    return normalized.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  }

  private async ensureQuestionCategoriesTable(client: DbClient) {
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS question_categories (
          name text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `,
    );
  }

  private async insertQuestionCategories(client: DbClient, categories: Array<string | null | undefined>) {
    const normalizedCategories = this.normalizeQuestionCategories(categories);
    await this.ensureQuestionCategoriesTable(client);

    for (const category of normalizedCategories) {
      await client.query(
        `
          INSERT INTO question_categories (name)
          VALUES ($1)
          ON CONFLICT (name) DO NOTHING
        `,
        [category],
      );
    }
  }

  private async loadQuestionCategories(client: DbClient) {
    await this.ensureQuestionCategoriesTable(client);
    const result = await client.query<{ category: string }>(
      `
        SELECT category
        FROM (
          SELECT trim(name) AS category
          FROM question_categories
          WHERE length(trim(name)) > 0
          UNION
          SELECT DISTINCT trim(category) AS category
          FROM question_set_questions
          WHERE category IS NOT NULL
            AND length(trim(category)) > 0
        ) categories
        ORDER BY lower(category), category
      `,
    );

    return result.rows.map((row) => row.category);
  }

  private async insertAssignmentsSnapshot(client: DbClient, assignments: Assignment[]) {
    for (const assignment of assignments) {
      await client.query(
        `
          INSERT INTO review_period_assignments (
            id,
            review_period_id,
            employee_id,
            manager_employee_id,
            assessor_employee_id,
            created_at,
            updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz)
        `,
        [
          assignment.id,
          assignment.reviewPeriodId,
          assignment.employeeId,
          assignment.managerId,
          assignment.assessorId,
          assignment.createdAt,
          assignment.updatedAt,
        ],
      );
    }
  }

  private async insertAssessmentsSnapshot(client: DbClient, assessments: Assessment[]) {
    for (const assessment of assessments) {
      await client.query(
        `
          INSERT INTO assessments (
            id,
            review_period_id,
            question_set_id,
            assignment_id,
            target,
            employee_id,
            assessor_employee_id,
            review_state,
            submitted_at,
            accepted_at,
            accepted_by_employee_id,
            reviewed_at,
            reviewed_by_employee_id,
            manager_notes,
            archive_state,
            created_at,
            updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12::timestamptz,$13,$14,$15,$16::timestamptz,$17::timestamptz)
        `,
        [
          assessment.id,
          assessment.reviewPeriodId,
          assessment.questionSetId,
          assessment.assignmentId,
          assessment.target,
          assessment.employeeId,
          assessment.assessorId,
          assessment.reviewState,
          assessment.submittedAt,
          assessment.acceptedAt,
          assessment.acceptedByEmployeeId,
          assessment.reviewedAt,
          assessment.reviewedByEmployeeId,
          assessment.managerNotes,
          assessment.archiveState,
          assessment.createdAt,
          assessment.updatedAt,
        ],
      );

      for (const response of assessment.responses) {
        await client.query(
          `
            INSERT INTO assessment_responses (
              assessment_id,
              question_id,
              response_text,
              created_at,
              updated_at
            ) VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz)
          `,
          [assessment.id, response.questionId, response.response, assessment.createdAt, assessment.updatedAt],
        );
      }
    }
  }

  private validateRestoreUsers(items: LocalUserTransferItem[], requireIds: boolean) {
    const seenIds = new Set<string>();
    const seenUsernames = new Set<string>();
    const seenEmails = new Set<string>();

    for (const item of items) {
      if (requireIds && !item.id) {
        throw new ApiError(400, `Backup user ${item.username} is missing an id`);
      }

      if (item.id) {
        if (seenIds.has(item.id)) {
          throw new ApiError(400, "Backup user ids must be unique");
        }
        seenIds.add(item.id);
      }

      const normalizedUsername = this.normalizeUsername(item.username);
      if (seenUsernames.has(normalizedUsername)) {
        throw new ApiError(400, "Backup usernames must be unique");
      }
      if (seenEmails.has(item.email)) {
        throw new ApiError(400, "Backup emails must be unique");
      }

      seenUsernames.add(normalizedUsername);
      seenEmails.add(item.email);
    }
  }

  private async upsertUsersSnapshot(client: DbClient, items: LocalUserTransferItem[], timestamp: string) {
    await this.ensureEmployeeUsernameStorage(client);
    this.validateRestoreUsers(items, true);

    const itemsById = new Map(items.map((item) => [item.id!, item]));
    const existingRows = await this.loadEmployeeRows(client, { includeDeleted: true });
    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    const existingByUsername = new Map(
      existingRows
        .filter((row) => row.deleted_at === null)
        .map((row) => [this.normalizeUsername(row.username), row] as const),
    );

    for (const item of items) {
      const currentById = existingById.get(item.id!);
      const currentByUsername = existingByUsername.get(this.normalizeUsername(item.username));
      if (currentByUsername && currentByUsername.id !== item.id) {
        throw new ApiError(409, `Backup user id does not match the existing username: ${item.username}`);
      }

      if (currentById) {
        await this.assertUniqueEmployeeFields(client, {
          id: currentById.id,
          username: item.username,
          email: item.email,
        });
        await client.query(
          `
            UPDATE employees
              SET username = $2,
                  full_name = $3,
                  email = $4,
                  role = $5,
                  status = $6,
                  password_hash = $7,
                  password_reset_required = $8,
                  password_changed_at = $9::timestamptz,
                  password_changed_by_employee_id = NULL,
                  deleted_at = NULL
             WHERE id = $1
           `,
          [
            item.id,
            item.username,
            item.fullName,
            item.email,
            item.role,
            item.status,
            this.passwordHashForTransferItem(item),
            item.passwordResetRequired,
            timestamp,
          ],
        );
        continue;
      }

      await this.assertUniqueEmployeeFields(client, {
        username: item.username,
        email: item.email,
      });
      await client.query(
        `
          INSERT INTO employees (
            id,
            username,
            full_name,
            email,
            role,
            status,
            manager_employee_id,
            assessor1_employee_id,
            assessor2_employee_id,
            password_hash,
            password_reset_required,
            password_changed_at,
            created_at,
            updated_at
          ) VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            NULL,
            NULL,
            NULL,
            $7,
            $8,
            $9::timestamptz,
            $9::timestamptz,
            $9::timestamptz
          )
        `,
        [
          item.id,
          item.username,
          item.fullName,
          item.email,
          item.role,
          item.status,
          this.passwordHashForTransferItem(item),
          item.passwordResetRequired,
          timestamp,
        ],
      );
    }

    const finalRows = await this.loadEmployeeRows(client, {
      employeeIds: Array.from(itemsById.keys()),
    });
    const finalByUsername = new Map(finalRows.map((row) => [this.normalizeUsername(row.username), row] as const));
    for (const item of items) {
      const employee = finalByUsername.get(this.normalizeUsername(item.username));
      if (!employee) {
        throw new ApiError(500, "Restored employee missing after upsert");
      }

      const managerId = item.managerUsername === null
        ? null
        : finalByUsername.get(this.normalizeUsername(item.managerUsername))?.id ?? (() => {
            throw new ApiError(400, `Manager username not found: ${item.managerUsername}`);
          })();
      const assessor1Id = item.assessor1Username === null
        ? null
        : finalByUsername.get(this.normalizeUsername(item.assessor1Username))?.id ?? (() => {
            throw new ApiError(400, `Assessor 1 username not found: ${item.assessor1Username}`);
          })();
      const assessor2Id = item.assessor2Username === null
        ? null
        : finalByUsername.get(this.normalizeUsername(item.assessor2Username))?.id ?? (() => {
            throw new ApiError(400, `Assessor 2 username not found: ${item.assessor2Username}`);
          })();

      await this.assertRelationships(client, {
        id: employee.id,
        managerId,
        assessor1Id,
        assessor2Id,
      });

      await client.query(
        `
          UPDATE employees
          SET manager_employee_id = $2,
              assessor1_employee_id = $3,
              assessor2_employee_id = $4
          WHERE id = $1
        `,
        [employee.id, managerId, assessor1Id, assessor2Id],
      );
    }
  }

  private async assertUsersRestoreSafe(client: DbClient, items: LocalUserTransferItem[]) {
    this.validateRestoreUsers(items, true);

    const existingRows = await this.loadEmployeeRows(client);
    const expectedIds = new Set(items.map((item) => item.id!));
    const removableIds = existingRows.filter((row) => !expectedIds.has(row.id)).map((row) => row.id);
    if (removableIds.length === 0) {
      return;
    }

    const referenceResult = await client.query<{ employee_id: string }>(
      `
        SELECT DISTINCT employee_id
        FROM (
          SELECT archived_by_employee_id AS employee_id
          FROM review_periods
          WHERE archived_by_employee_id = ANY($1::uuid[])
          UNION ALL
          SELECT manager_employee_id
          FROM employees
          WHERE manager_employee_id = ANY($1::uuid[])
          UNION ALL
          SELECT assessor1_employee_id
          FROM employees
          WHERE assessor1_employee_id = ANY($1::uuid[])
          UNION ALL
          SELECT assessor2_employee_id
          FROM employees
          WHERE assessor2_employee_id = ANY($1::uuid[])
          UNION ALL
          SELECT employee_id
          FROM review_period_assignments
          WHERE employee_id = ANY($1::uuid[])
          UNION ALL
          SELECT manager_employee_id
          FROM review_period_assignments
          WHERE manager_employee_id = ANY($1::uuid[])
          UNION ALL
          SELECT assessor_employee_id
          FROM review_period_assignments
          WHERE assessor_employee_id = ANY($1::uuid[])
          UNION ALL
          SELECT employee_id
          FROM assessments
          WHERE employee_id = ANY($1::uuid[])
          UNION ALL
          SELECT assessor_employee_id
          FROM assessments
          WHERE assessor_employee_id = ANY($1::uuid[])
          UNION ALL
          SELECT accepted_by_employee_id
          FROM assessments
          WHERE accepted_by_employee_id = ANY($1::uuid[])
          UNION ALL
          SELECT reviewed_by_employee_id
          FROM assessments
          WHERE reviewed_by_employee_id = ANY($1::uuid[])
        ) refs
        WHERE employee_id IS NOT NULL
      `,
      [removableIds],
    );

    if (referenceResult.rows.length > 0) {
      const existingById = new Map(existingRows.map((row) => [row.id, row.username]));
      const blockedUsernames = Array.from(
        new Set(referenceResult.rows.map((row) => existingById.get(row.employee_id) ?? row.employee_id)),
      ).sort();
      throw new ApiError(
        409,
        `User restore would remove employees still referenced by review data: ${blockedUsernames.join(", ")}`,
      );
    }
  }

  private async replaceUsersOnly(client: DbClient, items: LocalUserTransferItem[], restoredAt: string) {
    await this.assertUsersRestoreSafe(client, items);

    const existingRows = await this.loadEmployeeRows(client);
    const expectedIds = new Set(items.map((item) => item.id!));
    const removableIds = existingRows.filter((row) => !expectedIds.has(row.id)).map((row) => row.id);

    if (existingRows.length > 0) {
      await client.query("DELETE FROM auth_sessions WHERE employee_id = ANY($1::uuid[])", [existingRows.map((row) => row.id)]);
    }

    if (removableIds.length > 0) {
      await client.query("DELETE FROM employees WHERE id = ANY($1::uuid[])", [removableIds]);
    }

    await this.upsertUsersSnapshot(client, items, restoredAt);
  }

  private async replaceQuestionsOnly(client: DbClient, reviewData: BackupReviewData) {
    const inUseResult = await client.query<{ assignments_count: string; assessments_count: string }>(
      `
        SELECT
          (SELECT COUNT(*)::text FROM review_period_assignments) AS assignments_count,
          (SELECT COUNT(*)::text FROM assessments) AS assessments_count
      `,
    );

    if (Number(inUseResult.rows[0]?.assignments_count ?? "0") > 0 || Number(inUseResult.rows[0]?.assessments_count ?? "0") > 0) {
      throw new ApiError(409, "Question-only restores require assignments and assessments to be cleared first");
    }

    await this.ensureQuestionCategoriesTable(client);
    await client.query("DELETE FROM question_categories");
    await client.query("DELETE FROM question_set_questions");
    await client.query("DELETE FROM question_sets");
    await client.query("DELETE FROM review_periods");

    await this.insertReviewPeriodsSnapshot(client, reviewData.reviewPeriods);
    await this.insertQuestionSetsSnapshot(client, reviewData.questionSets);
    await this.insertQuestionCategories(client, reviewData.questionCategories);
    await this.replaceWorkflowSettings(client, reviewData.workflow);
  }

  private async replaceReviewData(client: DbClient, reviewData: BackupReviewData) {
    await this.assertReviewDataEmployeesExist(client, reviewData);

    await client.query("DELETE FROM assessment_review_events");
    await client.query("DELETE FROM assessment_responses");
    await client.query("DELETE FROM assessments");
    await client.query("DELETE FROM review_period_assignments");
    await this.ensureQuestionCategoriesTable(client);
    await client.query("DELETE FROM question_categories");
    await client.query("DELETE FROM question_set_questions");
    await client.query("DELETE FROM question_sets");
    await client.query("DELETE FROM review_periods");

    await this.insertReviewPeriodsSnapshot(client, reviewData.reviewPeriods);
    await this.insertQuestionSetsSnapshot(client, reviewData.questionSets);
    await this.insertQuestionCategories(client, reviewData.questionCategories);
    await this.insertAssignmentsSnapshot(client, reviewData.assignments);
    await this.insertAssessmentsSnapshot(client, reviewData.assessments);
    await this.replaceWorkflowSettings(client, reviewData.workflow);
  }

  async restoreBackup(scope: BackupRestoreScope, backup: BackupSnapshot): Promise<BackupRestoreResponse> {
    try {
      const response = await withTransaction(async (client) => {
        const restoredAt = nowIso();
        await client.query("SET LOCAL session_replication_role = replica");

        if (scope === "all") {
          await client.query("DELETE FROM assessment_review_events");
          await client.query("DELETE FROM assessment_responses");
          await client.query("DELETE FROM assessments");
          await client.query("DELETE FROM review_period_assignments");
          await client.query("DELETE FROM question_set_questions");
          await client.query("DELETE FROM question_sets");
          await client.query("DELETE FROM review_periods");
          await client.query("DELETE FROM auth_sessions");
          await client.query("DELETE FROM employees");

          await this.upsertUsersSnapshot(client, backup.users.items, restoredAt);
          await this.replaceReviewData(client, backup.reviewData);
        } else if (scope === "users") {
          await this.replaceUsersOnly(client, backup.users.items, restoredAt);
        } else if (scope === "questions") {
          await this.replaceQuestionsOnly(client, backup.reviewData);
        } else {
          await this.replaceReviewData(client, backup.reviewData);
        }

        return {
          mode: "replace" as const,
          target: scope,
          restoredAt,
          counts: {
            users: backup.users.itemCount,
            reviewPeriods: backup.reviewData.reviewPeriods.length,
            questionSets: backup.reviewData.questionSets.length,
            assignments: backup.reviewData.assignments.length,
            assessments: backup.reviewData.assessments.length,
          },
        };
      });

      this.writeBackupStatusConfig({
        lastRestoreAt: response.restoredAt,
      });

      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async listAssessments(session: AuthSession, query: AssessmentsListQuery = {}) {
    const records = await this.loadAssessmentRecords(this.pool, query);
    return clone(records.filter((assessment) => this.canReadAssessment(session, assessment)).map((assessment) => assessment.assessment));
  }

  async getAssessment(session: AuthSession, assessmentId: string) {
    const assessment = await this.assessmentOrThrow(this.pool, assessmentId);
    this.assertCanReadAssessment(session, assessment);
    return clone(assessment.assessment);
  }

  async createAssessment(session: AuthSession, reviewPeriodId: string, input: CreateAssessmentRequest) {
    try {
      return await withTransaction(async (client) => {
        await this.assertReviewPeriodMutable(client, reviewPeriodId);

        const assessorId = session.user.id;
        const target = input.target;

        if (target === "self") {
          if (input.employeeId !== assessorId) {
            throw new ApiError(403, "Self assessments can only be authored by the employee being reviewed");
          }
        } else {
          const assignment = input.assignmentId
            ? await this.assignmentOrThrow(client, input.assignmentId)
            : (await this.loadAssignments(client, { reviewPeriodId })).find(
                (item) => item.employeeId === input.employeeId && item.assessorId === assessorId,
              );

          if (!assignment || assignment.reviewPeriodId !== reviewPeriodId || assignment.employeeId !== input.employeeId) {
            throw new ApiError(403, "Peer assessments can only be authored by the assigned assessor");
          }
        }

        if (await this.findAssessmentByKey(client, reviewPeriodId, input.employeeId, assessorId)) {
          throw new ApiError(409, "An assessment already exists for this review period, employee, and assessor");
        }

        const assignment = target === "peer"
          ? (await this.loadAssignments(client, { reviewPeriodId })).find(
              (item) =>
                item.employeeId === input.employeeId &&
                item.assessorId === assessorId &&
                (input.assignmentId ? item.id === input.assignmentId : true),
            ) ?? null
          : null;

        const questionSet = await this.activeQuestionSetOrThrow(reviewPeriodId, target, client);
        const timestamp = nowIso();
        const assessmentId = randomUUID();
        await client.query(
          `
            INSERT INTO assessments (
              id,
              review_period_id,
              question_set_id,
              assignment_id,
              target,
              employee_id,
              assessor_employee_id,
              review_state,
              archive_state,
              submitted_at,
              accepted_at,
              accepted_by_employee_id,
              reviewed_at,
              reviewed_by_employee_id,
              manager_notes,
              created_at,
              updated_at
            ) VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              'new',
              'active',
              NULL,
              NULL,
              NULL,
              NULL,
              NULL,
              NULL,
              $8::timestamptz,
              $8::timestamptz
            )
          `,
          [assessmentId, reviewPeriodId, questionSet.id, assignment?.id ?? null, target, input.employeeId, assessorId, timestamp],
        );

        return (await this.assessmentOrThrow(client, assessmentId)).assessment;
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async saveAssessmentDraft(session: AuthSession, assessmentId: string, input: SaveAssessmentDraftRequest) {
    try {
      return await withTransaction(async (client) => {
        const assessment = await this.assessmentOrThrow(client, assessmentId);
        this.assertCanAuthorAssessment(session, assessment);
        await this.assertReviewPeriodMutable(client, assessment.assessment.reviewPeriodId);

        const nextState: AssessmentReviewState = input.responses.length > 0 ? "draft" : "new";
        await this.applyAssessmentResponses(client, assessment, input.responses, nextState);
        return (await this.assessmentOrThrow(client, assessmentId)).assessment;
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async submitAssessment(session: AuthSession, assessmentId: string, input: SubmitAssessmentRequest) {
    try {
      return await withTransaction(async (client) => {
        const assessment = await this.assessmentOrThrow(client, assessmentId);
        this.assertCanAuthorAssessment(session, assessment);
        await this.assertReviewPeriodMutable(client, assessment.assessment.reviewPeriodId);
        await this.applyAssessmentResponses(client, assessment, input.responses, "submitted");
        return (await this.assessmentOrThrow(client, assessmentId)).assessment;
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async acceptAssessment(session: AuthSession, assessmentId: string, managerNotes?: string | null) {
    try {
      return await withTransaction(async (client) => {
        const assessment = await this.assessmentOrThrow(client, assessmentId);
        this.assertCanManageAssessment(session, assessment);
        await this.assertReviewPeriodMutable(client, assessment.assessment.reviewPeriodId);

        if (assessment.assessment.reviewState !== "submitted") {
          throw new ApiError(409, "Only submitted assessments can be accepted");
        }

        const timestamp = nowIso();
        await client.query(
          `
            UPDATE assessments
            SET review_state = 'accepted',
                accepted_at = $2::timestamptz,
                accepted_by_employee_id = $3,
                reviewed_at = NULL,
                reviewed_by_employee_id = NULL,
                manager_notes = $4
            WHERE id = $1
          `,
          [assessmentId, timestamp, session.user.id, managerNotes ?? assessment.assessment.managerNotes],
        );

        return (await this.assessmentOrThrow(client, assessmentId)).assessment;
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async rejectAssessmentToDraft(session: AuthSession, assessmentId: string, managerNotes?: string | null) {
    try {
      return await withTransaction(async (client) => {
        const assessment = await this.assessmentOrThrow(client, assessmentId);
        this.assertCanManageAssessment(session, assessment);
        await this.assertReviewPeriodMutable(client, assessment.assessment.reviewPeriodId);

        if (assessment.assessment.reviewState !== "submitted") {
          throw new ApiError(409, "Only submitted assessments can be returned to draft");
        }

        await client.query(
          `
            UPDATE assessments
            SET review_state = 'draft',
                submitted_at = NULL,
                accepted_at = NULL,
                accepted_by_employee_id = NULL,
                reviewed_at = NULL,
                reviewed_by_employee_id = NULL,
                manager_notes = $2
            WHERE id = $1
          `,
          [assessmentId, managerNotes ?? assessment.assessment.managerNotes],
        );

        return (await this.assessmentOrThrow(client, assessmentId)).assessment;
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async reviewAssessment(session: AuthSession, assessmentId: string, input: ReviewAssessmentRequest) {
    try {
      return await withTransaction(async (client) => {
        const assessment = await this.assessmentOrThrow(client, assessmentId);
        this.assertCanManageAssessment(session, assessment);
        await this.assertReviewPeriodMutable(client, assessment.assessment.reviewPeriodId);

        if (assessment.assessment.reviewState !== "accepted") {
          throw new ApiError(409, "Only accepted assessments can be reviewed");
        }

        if (input.reviewed) {
          const timestamp = nowIso();
          await client.query(
            `
              UPDATE assessments
              SET review_state = 'reviewed',
                  manager_notes = $2,
                  reviewed_at = $3::timestamptz,
                  reviewed_by_employee_id = $4
              WHERE id = $1
            `,
            [assessmentId, input.managerNotes, timestamp, session.user.id],
          );
        } else {
          await client.query(
            `
              UPDATE assessments
              SET manager_notes = $2
              WHERE id = $1
            `,
            [assessmentId, input.managerNotes],
          );
        }

        return (await this.assessmentOrThrow(client, assessmentId)).assessment;
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async reassignAssessment(session: AuthSession, assessmentId: string, input: ReassignAssessmentRequest) {
    try {
      return await withTransaction(async (client) => {
        const assessment = await this.assessmentOrThrow(client, assessmentId);
        this.assertCanManageAssessment(session, assessment);
        await this.assertReviewPeriodMutable(client, assessment.assessment.reviewPeriodId);

        const employee = this.toEmployee(await this.employeeOrThrow(client, assessment.assessment.employeeId));
        const nextManagerId = input.managerId !== undefined ? input.managerId : employee.managerId;
        const nextAssessorId = input.assessorId !== undefined ? input.assessorId : employee.assessor2Id;

        if (assessment.assessment.assignmentId) {
          const assignment = await this.assignmentOrThrow(client, assessment.assessment.assignmentId);
          if (input.assessorId === null) {
            throw new ApiError(400, "Peer assessment reassignments require an assessor");
          }

          const nextAssignmentAssessorId = input.assessorId !== undefined ? input.assessorId : assignment.assessorId;
          await this.ensureAssignmentCandidate(client, assignment.reviewPeriodId, {
            id: assignment.id,
            employeeId: assignment.employeeId,
            managerId: input.managerId !== undefined ? input.managerId : assignment.managerId,
            assessorId: nextAssignmentAssessorId,
          });

          await client.query(
            `
              UPDATE review_period_assignments
              SET manager_employee_id = $2,
                  assessor_employee_id = $3
              WHERE id = $1
            `,
            [
              assignment.id,
              input.managerId !== undefined ? input.managerId : assignment.managerId,
              nextAssignmentAssessorId,
            ],
          );

          return {
            assessment: (await this.assessmentOrThrow(client, assessmentId)).assessment,
            employee: this.toEmployee(await this.employeeOrThrow(client, employee.id)),
            assignment: await this.assignmentOrThrow(client, assignment.id),
          };
        }

        await this.assertRelationships(client, {
          id: employee.id,
          managerId: nextManagerId,
          assessor1Id: employee.assessor1Id,
          assessor2Id: nextAssessorId,
        }, {
          allowDeletedIds: [employee.managerId, employee.assessor1Id, employee.assessor2Id].filter(
            (value): value is string => value !== null,
          ),
        });
        await client.query(
          `
            UPDATE employees
            SET manager_employee_id = $2,
                assessor2_employee_id = $3
            WHERE id = $1
          `,
          [employee.id, nextManagerId, nextAssessorId],
        );

        return {
          assessment: (await this.assessmentOrThrow(client, assessmentId)).assessment,
          employee: this.toEmployee(await this.employeeOrThrow(client, employee.id)),
          assignment: null,
        };
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowDatabaseError(error);
    }
  }

  async foundationSnapshot(session?: AuthSession) {
    const [employees, reviewPeriods, questionSets, assignments, assessments, workflow] = await Promise.all([
      this.listEmployees(),
      this.listReviewPeriods(),
      this.listQuestionSets(),
      this.listAssignments(),
      session ? this.listAssessments(session) : this.loadAssessmentRecords(this.pool).then((items) => items.map((item) => item.assessment)),
      this.getWorkflowSettings(),
    ]);

    return {
      employees,
      reviewPeriods,
      questionSets,
      assignments,
      assessments,
      workflow,
    };
  }
}

export function createApiStore() {
  return new ApiStore();
}
