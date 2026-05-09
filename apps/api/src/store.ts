import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import {
  assessmentsListExample,
  assignmentsListExample,
  employeesListExample,
  questionSetsListExample,
  reviewPeriodsListExample,
} from "@revu/contracts";
import type {
  AssessmentArchiveState,
  Assessment,
  AssessmentResponse,
  AssessmentReviewState,
  AssessmentsListQuery,
  Assignment,
  AuthPermission,
  AuthSession,
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
  QuestionSet,
  ResetEmployeePasswordResponse,
  ReassignAssessmentRequest,
  ReviewPeriod,
  ReviewAssessmentRequest,
  SaveAssessmentDraftRequest,
  SetEmployeePasswordResponse,
  SubmitAssessmentRequest,
  UpdateAssignmentRequest,
  UpdateEmployeeRequest,
  UpdateQuestionSetRequest,
  UpdateReviewPeriodRequest,
} from "@revu/contracts";

type StoredAuthMetadata = EmployeeAuthMetadata & {
  passwordHash: string | null;
};

type SessionRecord = Omit<AuthSession, "user"> & {
  employeeId: string;
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

export class ApiStore {
  private readonly employees: Employee[];

  private readonly auth = new Map<string, StoredAuthMetadata>();

  private readonly sessions = new Map<string, SessionRecord>();

  private readonly reviewPeriods: ReviewPeriod[];

  private readonly questionSets: QuestionSet[];

  private readonly assignments: Assignment[];

  private readonly assessments: Assessment[];

  constructor() {
    this.employees = clone(employeesListExample.items);
    this.reviewPeriods = clone(reviewPeriodsListExample.items);
    this.questionSets = clone(questionSetsListExample.items);
    this.assignments = clone(assignmentsListExample.items);
    this.assessments = clone(assessmentsListExample.items);

    for (const employee of this.employees) {
      const password = seedPasswordsByUsername[employee.username];
      this.auth.set(employee.id, {
        passwordHash: password ? hashPassword(password) : null,
        passwordConfigured: Boolean(password),
        passwordResetRequired: false,
        lastPasswordChangeAt: password ? employee.updatedAt : null,
      });
    }

    for (const reviewPeriod of this.reviewPeriods) {
      this.refreshDerivedState(reviewPeriod.id);
    }
  }

  private employeeOrThrow(employeeId: string) {
    const employee = this.employees.find((item) => item.id === employeeId);
    if (!employee) {
      throw new ApiError(404, "Employee not found");
    }

    return employee;
  }

  private authOrThrow(employeeId: string) {
    const metadata = this.auth.get(employeeId);
    if (!metadata) {
      throw new ApiError(500, "Employee auth metadata missing");
    }

    return metadata;
  }

  private reviewPeriodOrThrow(reviewPeriodId: string) {
    const reviewPeriod = this.reviewPeriods.find((item) => item.id === reviewPeriodId);
    if (!reviewPeriod) {
      throw new ApiError(404, "Review period not found");
    }

    return reviewPeriod;
  }

  private questionSetOrThrow(questionSetId: string) {
    const questionSet = this.questionSets.find((item) => item.id === questionSetId);
    if (!questionSet) {
      throw new ApiError(404, "Question set not found");
    }

    return questionSet;
  }

  private assignmentOrThrow(assignmentId: string) {
    const assignment = this.assignments.find((item) => item.id === assignmentId);
    if (!assignment) {
      throw new ApiError(404, "Assignment not found");
    }

    return assignment;
  }

  private assessmentOrThrow(assessmentId: string) {
    const assessment = this.assessments.find((item) => item.id === assessmentId);
    if (!assessment) {
      throw new ApiError(404, "Assessment not found");
    }

    return assessment;
  }

  private activeQuestionSetOrThrow(reviewPeriodId: string, target: Assessment["target"]) {
    const questionSet = this.questionSets.find(
      (item) => item.reviewPeriodId === reviewPeriodId && item.target === target && item.status === "active",
    );
    if (!questionSet) {
      throw new ApiError(409, `No active ${target} question set is available for this review period`);
    }

    return questionSet;
  }

  private findAssessmentByKey(reviewPeriodId: string, employeeId: string, assessorId: string) {
    return this.assessments.find(
      (item) => item.reviewPeriodId === reviewPeriodId && item.employeeId === employeeId && item.assessorId === assessorId,
    );
  }

  private toEmployeeAdmin(employee: Employee): EmployeeAdmin {
    const auth = this.authOrThrow(employee.id);

    return {
      ...clone(employee),
      auth: {
        passwordConfigured: auth.passwordConfigured,
        passwordResetRequired: auth.passwordResetRequired,
        lastPasswordChangeAt: auth.lastPasswordChangeAt,
      },
    };
  }

  private toSession(record: SessionRecord): AuthSession {
    return {
      ...record,
      user: clone(this.employeeOrThrow(record.employeeId)),
    };
  }

  private assertUniqueEmployeeFields(candidate: {
    id?: string;
    username: string;
    email: string;
  }) {
    const duplicateUsername = this.employees.find(
      (employee) => employee.username === candidate.username && employee.id !== candidate.id,
    );
    if (duplicateUsername) {
      throw new ApiError(409, "Username already exists");
    }

    const duplicateEmail = this.employees.find(
      (employee) => employee.email === candidate.email && employee.id !== candidate.id,
    );
    if (duplicateEmail) {
      throw new ApiError(409, "Email already exists");
    }
  }

  private assertRelationships(candidate: {
    id: string;
    managerId: string | null;
    assessorId: string | null;
  }) {
    if (candidate.managerId) {
      const manager = this.employeeOrThrow(candidate.managerId);
      if (manager.id === candidate.id) {
        throw new ApiError(400, "Employee cannot be their own manager");
      }

      if (!["manager", "admin"].includes(manager.role)) {
        throw new ApiError(400, "Manager must reference a manager or admin");
      }
    }

    if (candidate.assessorId) {
      const assessor = this.employeeOrThrow(candidate.assessorId);
      if (assessor.id === candidate.id) {
        throw new ApiError(400, "Employee cannot be their own assessor");
      }

      if (assessor.status !== "active") {
        throw new ApiError(400, "Assessor must be active");
      }
    }
  }

  private assertReviewPeriodFields(candidate: {
    id?: string;
    key: string;
    startDate: string;
    dueDate: string;
  }) {
    const duplicate = this.reviewPeriods.find((period) => period.key === candidate.key && period.id !== candidate.id);
    if (duplicate) {
      throw new ApiError(409, "Review period key already exists");
    }

    if (candidate.startDate > candidate.dueDate) {
      throw new ApiError(400, "Review period start date must be on or before due date");
    }
  }

  private assertQuestionInputs(questions: CreateQuestionInput[]) {
    const orders = new Set<number>();
    for (const question of questions) {
      if (orders.has(question.order)) {
        throw new ApiError(400, "Question order must be unique within a question set");
      }

      orders.add(question.order);
    }
  }

  private assertReviewPeriodMutable(reviewPeriodId: string) {
    const reviewPeriod = this.reviewPeriodOrThrow(reviewPeriodId);
    if (reviewPeriod.status === "archived") {
      throw new ApiError(409, "Archived review periods are read-only");
    }

    return reviewPeriod;
  }

  private isManagerForAssessment(actorEmployeeId: string, assessment: Assessment) {
    const assignment = assessment.assignmentId ? this.assignments.find((item) => item.id === assessment.assignmentId) : null;
    const employee = this.employeeOrThrow(assessment.employeeId);
    return assignment?.managerId === actorEmployeeId || employee.managerId === actorEmployeeId;
  }

  private canReadAssessment(session: AuthSession, assessment: Assessment) {
    if (session.user.role === "admin") {
      return true;
    }

    if (session.user.role === "manager") {
      return this.isManagerForAssessment(session.user.id, assessment) && !["new", "draft"].includes(assessment.reviewState);
    }

    return assessment.assessorId === session.user.id;
  }

  private assertCanReadAssessment(session: AuthSession, assessment: Assessment) {
    if (!this.canReadAssessment(session, assessment)) {
      throw new ApiError(403, "You do not have permission to view this assessment");
    }
  }

  private assertCanAuthorAssessment(session: AuthSession, assessment: Assessment) {
    if (assessment.assessorId !== session.user.id) {
      throw new ApiError(403, "Only the assigned assessor can edit this assessment");
    }

    if (assessment.archiveState === "archived") {
      throw new ApiError(409, "Archived assessments are read-only");
    }

    if (!["new", "draft"].includes(assessment.reviewState)) {
      throw new ApiError(409, "Submitted or accepted assessments cannot be edited by the assessor");
    }
  }

  private assertCanManageAssessment(session: AuthSession, assessment: Assessment) {
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

  private applyAssessmentResponses(assessment: Assessment, responses: AssessmentResponse[], nextState: AssessmentReviewState) {
    const questionSet = this.questionSetOrThrow(assessment.questionSetId);
    this.assertAssessmentResponses(questionSet, responses, nextState === "submitted");

    assessment.responses = clone(responses);
    assessment.reviewState = nextState;
    assessment.isReadOnly = false;
    assessment.updatedAt = nowIso();

    if (nextState === "submitted") {
      assessment.submittedAt = assessment.updatedAt;
    } else if (nextState === "draft") {
      assessment.submittedAt = null;
      assessment.acceptedAt = null;
      assessment.acceptedByEmployeeId = null;
      assessment.reviewedAt = null;
      assessment.reviewedByEmployeeId = null;
    }
  }

  private refreshDerivedState(reviewPeriodId: string) {
    const reviewPeriod = this.reviewPeriodOrThrow(reviewPeriodId);
    const archived = reviewPeriod.status === "archived";

    for (const questionSet of this.questionSets) {
      if (questionSet.reviewPeriodId === reviewPeriodId) {
        questionSet.isReadOnly = archived;
      }
    }

    for (const assessment of this.assessments) {
      if (assessment.reviewPeriodId === reviewPeriodId) {
        assessment.archiveState = archived ? "archived" : "active";
        assessment.isReadOnly = archived || ["accepted", "reviewed"].includes(assessment.reviewState);
      }
    }
  }

  private setEmployeeRelationships(employeeId: string, relationships: { managerId: string | null; assessorId: string | null }) {
    const employee = this.employeeOrThrow(employeeId);
    this.assertRelationships({
      id: employee.id,
      managerId: relationships.managerId,
      assessorId: relationships.assessorId,
    });

    employee.managerId = relationships.managerId;
    employee.assessorId = relationships.assessorId;
    employee.updatedAt = nowIso();
  }

  private activateQuestionSetRecord(questionSetId: string) {
    const questionSet = this.questionSetOrThrow(questionSetId);
    this.assertReviewPeriodMutable(questionSet.reviewPeriodId);

    const timestamp = nowIso();
    for (const sibling of this.questionSets) {
      if (
        sibling.reviewPeriodId === questionSet.reviewPeriodId &&
        sibling.target === questionSet.target &&
        sibling.id !== questionSet.id &&
        sibling.status === "active"
      ) {
        sibling.status = "draft";
        sibling.updatedAt = timestamp;
      }
    }

    questionSet.status = "active";
    questionSet.updatedAt = timestamp;
    return questionSet;
  }

  private buildQuestionInputs(questions: CreateQuestionInput[]) {
    this.assertQuestionInputs(questions);

    return questions.map((question) => ({
      id: randomUUID(),
      ...question,
    }));
  }

  private ensureAssignmentCandidate(reviewPeriodId: string, candidate: {
    id?: string;
    employeeId: string;
    managerId: string | null;
    assessorId: string;
  }) {
    this.assertReviewPeriodMutable(reviewPeriodId);
    this.employeeOrThrow(candidate.employeeId);
    this.assertRelationships({
      id: candidate.employeeId,
      managerId: candidate.managerId,
      assessorId: candidate.assessorId,
    });

    const duplicate = this.assignments.find(
      (assignment) =>
        assignment.reviewPeriodId === reviewPeriodId &&
        assignment.employeeId === candidate.employeeId &&
        assignment.id !== candidate.id,
    );
    if (duplicate) {
      throw new ApiError(409, "Assignment already exists for this employee in the review period");
    }
  }

  listEmployees() {
    return clone(this.employees);
  }

  getEmployee(employeeId: string) {
    return this.toEmployeeAdmin(this.employeeOrThrow(employeeId));
  }

  authenticate(username: string, password: string) {
    const employee = this.employees.find((item) => item.username === username);
    if (!employee || employee.status !== "active") {
      throw new ApiError(401, "Invalid username or password");
    }

    const auth = this.authOrThrow(employee.id);
    if (!verifyPassword(password, auth.passwordHash)) {
      throw new ApiError(401, "Invalid username or password");
    }

    const issuedAt = nowIso();
    const expiresAt = new Date(Date.now() + eightHoursInMs).toISOString();
    const token = randomUUID();
    const sessionRecord: SessionRecord = {
      token,
      employeeId: employee.id,
      issuedAt,
      expiresAt,
      permissions: clone(permissionsByRole[employee.role]),
    };

    this.sessions.set(token, sessionRecord);
    return this.toSession(sessionRecord);
  }

  getSession(token: string) {
    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }

    if (Date.parse(session.expiresAt) <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    return this.toSession(session);
  }

  logout(token: string) {
    return this.sessions.delete(token);
  }

  createEmployee(input: CreateEmployeeRequest) {
    this.assertUniqueEmployeeFields(input);

    const id = randomUUID();
    this.assertRelationships({
      id,
      managerId: input.managerId ?? null,
      assessorId: input.assessorId ?? null,
    });

    const timestamp = nowIso();
    const employee: Employee = {
      id,
      username: input.username,
      fullName: input.fullName,
      email: input.email,
      role: input.role,
      status: input.status ?? "active",
      managerId: input.managerId ?? null,
      assessorId: input.assessorId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.employees.push(employee);
    this.auth.set(id, {
      passwordHash: input.password ? hashPassword(input.password) : null,
      passwordConfigured: Boolean(input.password),
      passwordResetRequired: false,
      lastPasswordChangeAt: input.password ? timestamp : null,
    });

    return this.toEmployeeAdmin(employee);
  }

  updateEmployee(actor: Pick<Employee, "id" | "role">, employeeId: string, updates: UpdateEmployeeRequest) {
    const index = this.employees.findIndex((employee) => employee.id === employeeId);
    if (index < 0) {
      throw new ApiError(404, "Employee not found");
    }

    const existing = this.employees[index];
    if (!existing) {
      throw new ApiError(404, "Employee not found");
    }

    if (actor.role === "manager") {
      this.canManagerEdit(existing, updates);
    }

    const nextEmployee: Employee = {
      ...existing,
      ...updates,
      updatedAt: nowIso(),
    };

    this.assertUniqueEmployeeFields(nextEmployee);
    this.assertRelationships(nextEmployee);

    this.employees[index] = nextEmployee;
    return this.toEmployeeAdmin(nextEmployee);
  }

  private canManagerEdit(target: Employee, updates: UpdateEmployeeRequest) {
    if (target.role === "admin") {
      throw new ApiError(403, "Managers cannot edit admin accounts");
    }

    if (updates.role !== undefined) {
      throw new ApiError(403, "Managers cannot change app roles");
    }
  }

  deleteEmployee(employeeId: string) {
    const employee = this.employeeOrThrow(employeeId);
    if (this.employees.some((item) => item.managerId === employee.id || item.assessorId === employee.id)) {
      throw new ApiError(409, "Employee is still referenced by another employee relationship");
    }

    if (
      this.assignments.some(
        (assignment) =>
          assignment.employeeId === employee.id ||
          assignment.managerId === employee.id ||
          assignment.assessorId === employee.id,
      )
    ) {
      throw new ApiError(409, "Employee is still referenced by review period assignments");
    }

    if (
      this.assessments.some(
        (assessment) =>
          assessment.employeeId === employee.id ||
          assessment.assessorId === employee.id ||
          assessment.acceptedByEmployeeId === employee.id ||
          assessment.reviewedByEmployeeId === employee.id,
      )
    ) {
      throw new ApiError(409, "Employee is still referenced by assessments");
    }

    this.sessions.forEach((session, token) => {
      if (session.employeeId === employee.id) {
        this.sessions.delete(token);
      }
    });

    this.auth.delete(employee.id);
    this.employees.splice(
      this.employees.findIndex((item) => item.id === employee.id),
      1,
    );

    return {
      employeeId,
      deleted: true as const,
    };
  }

  setPassword(employeeId: string, password: string): SetEmployeePasswordResponse {
    const employee = this.employeeOrThrow(employeeId);
    const timestamp = nowIso();
    this.auth.set(employee.id, {
      passwordHash: hashPassword(password),
      passwordConfigured: true,
      passwordResetRequired: false,
      lastPasswordChangeAt: timestamp,
    });

    return {
      employeeId: employee.id,
      passwordResetRequired: false,
      lastPasswordChangeAt: timestamp,
    };
  }

  resetPassword(employeeId: string, password?: string): ResetEmployeePasswordResponse {
    const employee = this.employeeOrThrow(employeeId);
    const temporaryPassword = password ?? generateTemporaryPassword();
    const timestamp = nowIso();
    this.auth.set(employee.id, {
      passwordHash: hashPassword(temporaryPassword),
      passwordConfigured: true,
      passwordResetRequired: true,
      lastPasswordChangeAt: timestamp,
    });

    return {
      employeeId: employee.id,
      temporaryPassword,
      passwordResetRequired: true,
      lastPasswordChangeAt: timestamp,
    };
  }

  listReviewPeriods() {
    return clone(this.reviewPeriods);
  }

  getReviewPeriod(reviewPeriodId: string) {
    return clone(this.reviewPeriodOrThrow(reviewPeriodId));
  }

  createReviewPeriod(input: CreateReviewPeriodRequest) {
    this.assertReviewPeriodFields(input);

    const timestamp = nowIso();
    const reviewPeriod: ReviewPeriod = {
      id: randomUUID(),
      key: input.key,
      label: input.label,
      startDate: input.startDate,
      dueDate: input.dueDate,
      status: "active",
      archivedAt: null,
      archivedByEmployeeId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.reviewPeriods.push(reviewPeriod);
    return clone(reviewPeriod);
  }

  updateReviewPeriod(reviewPeriodId: string, updates: UpdateReviewPeriodRequest) {
    const reviewPeriod = this.assertReviewPeriodMutable(reviewPeriodId);
    const nextReviewPeriod: ReviewPeriod = {
      ...reviewPeriod,
      ...updates,
      updatedAt: nowIso(),
    };

    this.assertReviewPeriodFields(nextReviewPeriod);
    Object.assign(reviewPeriod, nextReviewPeriod);
    return clone(reviewPeriod);
  }

  archiveReviewPeriod(reviewPeriodId: string, actorEmployeeId: string) {
    this.employeeOrThrow(actorEmployeeId);
    const reviewPeriod = this.reviewPeriodOrThrow(reviewPeriodId);
    if (reviewPeriod.status === "archived") {
      throw new ApiError(409, "Review period is already archived");
    }

    const timestamp = nowIso();
    reviewPeriod.status = "archived";
    reviewPeriod.archivedAt = timestamp;
    reviewPeriod.archivedByEmployeeId = actorEmployeeId;
    reviewPeriod.updatedAt = timestamp;
    this.refreshDerivedState(reviewPeriodId);
    return clone(reviewPeriod);
  }

  unarchiveReviewPeriod(reviewPeriodId: string) {
    const reviewPeriod = this.reviewPeriodOrThrow(reviewPeriodId);
    if (reviewPeriod.status === "active") {
      throw new ApiError(409, "Review period is already active");
    }

    reviewPeriod.status = "active";
    reviewPeriod.archivedAt = null;
    reviewPeriod.archivedByEmployeeId = null;
    reviewPeriod.updatedAt = nowIso();
    this.refreshDerivedState(reviewPeriodId);
    return clone(reviewPeriod);
  }

  listQuestionSets(reviewPeriodId?: string) {
    const items = reviewPeriodId
      ? this.questionSets.filter((questionSet) => questionSet.reviewPeriodId === reviewPeriodId)
      : this.questionSets;
    return clone(items);
  }

  getQuestionSet(questionSetId: string) {
    return clone(this.questionSetOrThrow(questionSetId));
  }

  createQuestionSet(reviewPeriodId: string, input: CreateQuestionSetRequest) {
    this.assertReviewPeriodMutable(reviewPeriodId);

    const timestamp = nowIso();
    const questionSet: QuestionSet = {
      id: randomUUID(),
      reviewPeriodId,
      target: input.target,
      status: "draft",
      isReadOnly: false,
      title: input.title,
      headerMarkdown: input.headerMarkdown,
      footerMarkdown: input.footerMarkdown,
      questions: this.buildQuestionInputs(input.questions),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.questionSets.push(questionSet);
    return clone(questionSet);
  }

  updateQuestionSet(questionSetId: string, updates: UpdateQuestionSetRequest) {
    const questionSet = this.questionSetOrThrow(questionSetId);
    this.assertReviewPeriodMutable(questionSet.reviewPeriodId);

    if (updates.questions) {
      this.assertQuestionInputs(updates.questions);
    }

    if (updates.title !== undefined) {
      questionSet.title = updates.title;
    }

    if (updates.headerMarkdown !== undefined) {
      questionSet.headerMarkdown = updates.headerMarkdown;
    }

    if (updates.footerMarkdown !== undefined) {
      questionSet.footerMarkdown = updates.footerMarkdown;
    }

    if (updates.questions !== undefined) {
      questionSet.questions = this.buildQuestionInputs(updates.questions);
    }

    questionSet.updatedAt = nowIso();

    if (updates.status === "active") {
      return clone(this.activateQuestionSetRecord(questionSetId));
    }

    if (updates.status === "draft") {
      questionSet.status = "draft";
      questionSet.updatedAt = nowIso();
    }

    return clone(questionSet);
  }

  activateQuestionSet(questionSetId: string) {
    return clone(this.activateQuestionSetRecord(questionSetId));
  }

  exportQuestionSets(reviewPeriodId: string, format: "json" | "csv"): ExportStubResponse {
    this.reviewPeriodOrThrow(reviewPeriodId);
    return {
      reviewPeriodId,
      resource: "questionSets",
      format,
      exportedAt: nowIso(),
      stub: true,
      itemCount: this.questionSets.filter((questionSet) => questionSet.reviewPeriodId === reviewPeriodId).length,
    };
  }

  importQuestionSetsStub(reviewPeriodId: string): ImportStubResponse {
    this.reviewPeriodOrThrow(reviewPeriodId);
    return {
      reviewPeriodId,
      resource: "questionSets",
      accepted: false,
      status: "not_implemented",
      supportedFormats: ["json", "csv"],
    };
  }

  listAssignments(reviewPeriodId?: string) {
    const items = reviewPeriodId
      ? this.assignments.filter((assignment) => assignment.reviewPeriodId === reviewPeriodId)
      : this.assignments;
    return clone(items);
  }

  getAssignment(assignmentId: string) {
    return clone(this.assignmentOrThrow(assignmentId));
  }

  createAssignment(reviewPeriodId: string, input: CreateAssignmentRequest) {
    this.ensureAssignmentCandidate(reviewPeriodId, {
      employeeId: input.employeeId,
      managerId: input.managerId,
      assessorId: input.assessorId,
    });

    const timestamp = nowIso();
    const assignment: Assignment = {
      id: randomUUID(),
      reviewPeriodId,
      employeeId: input.employeeId,
      managerId: input.managerId,
      assessorId: input.assessorId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.assignments.push(assignment);
    this.setEmployeeRelationships(input.employeeId, {
      managerId: input.managerId,
      assessorId: input.assessorId,
    });

    return clone(assignment);
  }

  updateAssignment(assignmentId: string, updates: UpdateAssignmentRequest) {
    const assignment = this.assignmentOrThrow(assignmentId);
    this.ensureAssignmentCandidate(assignment.reviewPeriodId, {
      id: assignment.id,
      employeeId: assignment.employeeId,
      managerId: updates.managerId !== undefined ? updates.managerId : assignment.managerId,
      assessorId: updates.assessorId !== undefined ? updates.assessorId : assignment.assessorId,
    });

    if (updates.managerId !== undefined) {
      assignment.managerId = updates.managerId;
    }

    if (updates.assessorId !== undefined) {
      assignment.assessorId = updates.assessorId;
    }

    assignment.updatedAt = nowIso();
    this.setEmployeeRelationships(assignment.employeeId, {
      managerId: assignment.managerId,
      assessorId: assignment.assessorId,
    });

    return clone(assignment);
  }

  deleteAssignment(assignmentId: string) {
    const assignment = this.assignmentOrThrow(assignmentId);
    this.assertReviewPeriodMutable(assignment.reviewPeriodId);

    if (this.assessments.some((assessment) => assessment.assignmentId === assignment.id)) {
      throw new ApiError(409, "Assignment is still referenced by assessments");
    }

    this.assignments.splice(
      this.assignments.findIndex((item) => item.id === assignment.id),
      1,
    );

    return {
      assignmentId,
      deleted: true as const,
    };
  }

  exportAssignments(reviewPeriodId: string, format: "json" | "csv"): ExportStubResponse {
    this.reviewPeriodOrThrow(reviewPeriodId);
    return {
      reviewPeriodId,
      resource: "assignments",
      format,
      exportedAt: nowIso(),
      stub: true,
      itemCount: this.assignments.filter((assignment) => assignment.reviewPeriodId === reviewPeriodId).length,
    };
  }

  importAssignmentsStub(reviewPeriodId: string): ImportStubResponse {
    this.reviewPeriodOrThrow(reviewPeriodId);
    return {
      reviewPeriodId,
      resource: "assignments",
      accepted: false,
      status: "not_implemented",
      supportedFormats: ["json", "csv"],
    };
  }

  listAssessments(session: AuthSession, query: AssessmentsListQuery = {}) {
    const items = this.assessments.filter((assessment) => {
      if (!this.canReadAssessment(session, assessment)) {
        return false;
      }

      if (query.reviewPeriodId && assessment.reviewPeriodId !== query.reviewPeriodId) {
        return false;
      }

      if (query.employeeId && assessment.employeeId !== query.employeeId) {
        return false;
      }

      if (query.assessorId && assessment.assessorId !== query.assessorId) {
        return false;
      }

      if (query.assignmentId && assessment.assignmentId !== query.assignmentId) {
        return false;
      }

      if (query.target && assessment.target !== query.target) {
        return false;
      }

      if (query.reviewState && assessment.reviewState !== query.reviewState) {
        return false;
      }

      if (query.archiveState && assessment.archiveState !== query.archiveState) {
        return false;
      }

      return true;
    });

    return clone(items);
  }

  getAssessment(session: AuthSession, assessmentId: string) {
    const assessment = this.assessmentOrThrow(assessmentId);
    this.assertCanReadAssessment(session, assessment);
    return clone(assessment);
  }

  createAssessment(session: AuthSession, reviewPeriodId: string, input: CreateAssessmentRequest) {
    this.assertReviewPeriodMutable(reviewPeriodId);

    const assessorId = session.user.id;
    const target = input.target;

    if (target === "self") {
      if (input.employeeId !== assessorId) {
        throw new ApiError(403, "Self assessments can only be authored by the employee being reviewed");
      }
    } else {
      const assignment = input.assignmentId
        ? this.assignmentOrThrow(input.assignmentId)
        : this.assignments.find(
            (item) =>
              item.reviewPeriodId === reviewPeriodId &&
              item.employeeId === input.employeeId &&
              item.assessorId === assessorId,
          );

      if (!assignment || assignment.reviewPeriodId !== reviewPeriodId || assignment.employeeId !== input.employeeId) {
        throw new ApiError(403, "Peer assessments can only be authored by the assigned assessor");
      }
    }

    if (this.findAssessmentByKey(reviewPeriodId, input.employeeId, assessorId)) {
      throw new ApiError(409, "An assessment already exists for this review period, employee, and assessor");
    }

    const assignment =
      target === "peer"
        ? this.assignments.find(
            (item) =>
              item.reviewPeriodId === reviewPeriodId &&
              item.employeeId === input.employeeId &&
              item.assessorId === assessorId &&
              (input.assignmentId ? item.id === input.assignmentId : true),
          ) ?? null
        : null;

    const questionSet = this.activeQuestionSetOrThrow(reviewPeriodId, target);
    const timestamp = nowIso();
    const assessment: Assessment = {
      id: randomUUID(),
      reviewPeriodId,
      questionSetId: questionSet.id,
      assignmentId: assignment?.id ?? null,
      target,
      employeeId: input.employeeId,
      assessorId,
      reviewState: "new",
      archiveState: "active",
      isReadOnly: false,
      responses: [],
      submittedAt: null,
      acceptedAt: null,
      acceptedByEmployeeId: null,
      managerNotes: null,
      reviewedAt: null,
      reviewedByEmployeeId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.assessments.push(assessment);
    return clone(assessment);
  }

  saveAssessmentDraft(session: AuthSession, assessmentId: string, input: SaveAssessmentDraftRequest) {
    const assessment = this.assessmentOrThrow(assessmentId);
    this.assertCanAuthorAssessment(session, assessment);
    this.assertReviewPeriodMutable(assessment.reviewPeriodId);

    const nextState: AssessmentReviewState = input.responses.length > 0 ? "draft" : "new";
    this.applyAssessmentResponses(assessment, input.responses, nextState);
    return clone(assessment);
  }

  submitAssessment(session: AuthSession, assessmentId: string, input: SubmitAssessmentRequest) {
    const assessment = this.assessmentOrThrow(assessmentId);
    this.assertCanAuthorAssessment(session, assessment);
    this.assertReviewPeriodMutable(assessment.reviewPeriodId);
    this.applyAssessmentResponses(assessment, input.responses, "submitted");
    return clone(assessment);
  }

  acceptAssessment(session: AuthSession, assessmentId: string, managerNotes?: string | null) {
    const assessment = this.assessmentOrThrow(assessmentId);
    this.assertCanManageAssessment(session, assessment);
    this.assertReviewPeriodMutable(assessment.reviewPeriodId);

    if (assessment.reviewState !== "submitted") {
      throw new ApiError(409, "Only submitted assessments can be accepted");
    }

    const timestamp = nowIso();
    assessment.reviewState = "accepted";
    assessment.acceptedAt = timestamp;
    assessment.acceptedByEmployeeId = session.user.id;
    assessment.reviewedAt = null;
    assessment.reviewedByEmployeeId = null;
    assessment.managerNotes = managerNotes ?? assessment.managerNotes;
    assessment.isReadOnly = true;
    assessment.updatedAt = timestamp;
    return clone(assessment);
  }

  rejectAssessmentToDraft(session: AuthSession, assessmentId: string, managerNotes?: string | null) {
    const assessment = this.assessmentOrThrow(assessmentId);
    this.assertCanManageAssessment(session, assessment);
    this.assertReviewPeriodMutable(assessment.reviewPeriodId);

    if (assessment.reviewState !== "submitted") {
      throw new ApiError(409, "Only submitted assessments can be returned to draft");
    }

    const timestamp = nowIso();
    assessment.reviewState = "draft";
    assessment.submittedAt = null;
    assessment.acceptedAt = null;
    assessment.acceptedByEmployeeId = null;
    assessment.reviewedAt = null;
    assessment.reviewedByEmployeeId = null;
    assessment.managerNotes = managerNotes ?? assessment.managerNotes;
    assessment.isReadOnly = false;
    assessment.updatedAt = timestamp;
    return clone(assessment);
  }

  reviewAssessment(session: AuthSession, assessmentId: string, input: ReviewAssessmentRequest) {
    const assessment = this.assessmentOrThrow(assessmentId);
    this.assertCanManageAssessment(session, assessment);
    this.assertReviewPeriodMutable(assessment.reviewPeriodId);

    if (assessment.reviewState !== "accepted") {
      throw new ApiError(409, "Only accepted assessments can be reviewed");
    }

    const timestamp = nowIso();
    assessment.managerNotes = input.managerNotes;
    assessment.updatedAt = timestamp;

    if (input.reviewed) {
      assessment.reviewState = "reviewed";
      assessment.reviewedAt = timestamp;
      assessment.reviewedByEmployeeId = session.user.id;
      assessment.isReadOnly = true;
    }

    return clone(assessment);
  }

  reassignAssessment(session: AuthSession, assessmentId: string, input: ReassignAssessmentRequest) {
    const assessment = this.assessmentOrThrow(assessmentId);
    this.assertCanManageAssessment(session, assessment);
    this.assertReviewPeriodMutable(assessment.reviewPeriodId);

    const employee = this.employeeOrThrow(assessment.employeeId);
    const nextManagerId = input.managerId !== undefined ? input.managerId : employee.managerId;
    const nextAssessorId = input.assessorId !== undefined ? input.assessorId : employee.assessorId;

    if (assessment.assignmentId) {
      const assignment = this.assignmentOrThrow(assessment.assignmentId);
      if (input.assessorId === null) {
        throw new ApiError(400, "Peer assessment reassignments require an assessor");
      }
      const nextAssignmentAssessorId = input.assessorId !== undefined ? input.assessorId : assignment.assessorId;
      this.ensureAssignmentCandidate(assignment.reviewPeriodId, {
        id: assignment.id,
        employeeId: assignment.employeeId,
        managerId: input.managerId !== undefined ? input.managerId : assignment.managerId,
        assessorId: nextAssignmentAssessorId,
      });
      if (input.managerId !== undefined) {
        assignment.managerId = input.managerId;
      }
      if (input.assessorId !== undefined) {
        assignment.assessorId = input.assessorId;
      }
      assignment.updatedAt = nowIso();
      this.setEmployeeRelationships(employee.id, {
        managerId: assignment.managerId,
        assessorId: assignment.assessorId,
      });

      return {
        assessment: clone(assessment),
        employee: clone(this.employeeOrThrow(employee.id)),
        assignment: clone(assignment),
      };
    }

    this.setEmployeeRelationships(employee.id, {
      managerId: nextManagerId,
      assessorId: nextAssessorId,
    });

    return {
      assessment: clone(assessment),
      employee: clone(this.employeeOrThrow(employee.id)),
      assignment: null,
    };
  }

  foundationSnapshot(session?: AuthSession) {
    return {
      employees: this.listEmployees(),
      reviewPeriods: clone(this.reviewPeriods),
      questionSets: clone(this.questionSets),
      assignments: clone(this.assignments),
      assessments: clone(session ? this.assessments.filter((assessment) => this.canReadAssessment(session, assessment)) : this.assessments),
    };
  }
}

export function createApiStore() {
  return new ApiStore();
}
