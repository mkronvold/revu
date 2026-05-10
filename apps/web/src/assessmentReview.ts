import type {
  Assessment,
  Assignment,
  Employee,
  FoundationSnapshot,
  Question,
  ReviewPeriod,
} from '@revu/contracts';
import { foundationSnapshotExample } from '@revu/contracts';

export type AssessmentWorkflowSnapshot = Pick<
  FoundationSnapshot,
  'reviewPeriods' | 'questionSets' | 'assignments' | 'assessments'
>;

export type AssessmentQueueItem = {
  assessmentId: string;
  title: string;
  detail: string;
  subjectName: string;
  targetLabel: string;
  assessorLabel: string;
  statusLabel: string;
  actionLabel: string;
};

export type AssessmentQueueGroup = {
  id: 'not-started' | 'incomplete' | 'ready-to-submit';
  title: string;
  items: AssessmentQueueItem[];
};

export type ReviewQueueItem = {
  assessmentId: string;
  title: string;
  subjectName: string;
  reviewPeriodLabel: string;
  targetLabel: string;
  assessorLabel: string;
  nextStepLabel: string;
  statusLabel: string;
  actionLabel: string;
};

export type AdminAssessmentRow = {
  assessmentId: string;
  title: string;
  subjectName: string;
  targetLabel: string;
  assessorLabel: string;
  assessmentStatusLabel: string;
  reviewStatusLabel: string;
};

export type AssessmentEditorQuestion = {
  questionId: string;
  order: number;
  type: Question['type'];
  category: string | null;
  prompt: string;
  response: string;
};

export type AssessmentEditorQuestionGroup = {
  id: string;
  category: string | null;
  questions: AssessmentEditorQuestion[];
};

export type AssessmentEditor = {
  assessmentId: string;
  title: string;
  statusLabel: string;
  detail: string;
  targetLabel: string;
  reviewPeriodLabel: string;
  dueDate: string;
  subjectName: string;
  assessorName: string;
  managerName: string;
  questionSetTitle: string;
  headerMarkdown: string;
  footerMarkdown: string;
  managerNotes: string | null;
  isReadOnly: boolean;
  isComplete: boolean;
  canSave: boolean;
  canSubmit: boolean;
  questions: AssessmentEditorQuestion[];
};

export type ReviewPanel = {
  assessmentId: string;
  title: string;
  statusLabel: string;
  detail: string;
  targetLabel: string;
  assessmentStatusLabel: string;
  reviewStatusLabel: string;
  reviewPeriodLabel: string;
  dueDate: string;
  subjectName: string;
  assessorName: string;
  managerName: string;
  currentAssessorId: string;
  currentManagerId: string | null;
  managerNotes: string;
  canAccept: boolean;
  canRejectToDraft: boolean;
  canMarkReviewed: boolean;
  canReassignAssessor: boolean;
  isArchived: boolean;
  questions: AssessmentEditorQuestion[];
};

type MutationOptions = {
  now?: string;
  actorId?: string | null;
};

const deletedUserLabel = 'deleted user';

function cloneAssignment(assignment: Assignment): Assignment {
  return { ...assignment };
}

function cloneAssessment(assessment: Assessment): Assessment {
  return {
    ...assessment,
    responses: assessment.responses.map((response) => ({ ...response })),
  };
}

function nextTimestamp(now?: string) {
  return now ?? new Date().toISOString();
}

function formatDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}/${year}`;
}

function getReviewPeriod(snapshot: AssessmentWorkflowSnapshot, reviewPeriodId: string) {
  return snapshot.reviewPeriods.find((reviewPeriod) => reviewPeriod.id === reviewPeriodId) ?? null;
}

function getActiveReviewPeriod(snapshot: AssessmentWorkflowSnapshot) {
  return snapshot.reviewPeriods.find((reviewPeriod) => reviewPeriod.status === 'active') ?? null;
}

function getQuestionSet(snapshot: AssessmentWorkflowSnapshot, assessment: Assessment) {
  return snapshot.questionSets.find((questionSet) => questionSet.id === assessment.questionSetId) ?? null;
}

function getAssignment(snapshot: AssessmentWorkflowSnapshot, assessment: Assessment) {
  if (!assessment.assignmentId) {
    return null;
  }

  return snapshot.assignments.find((assignment) => assignment.id === assessment.assignmentId) ?? null;
}

function getEmployeeName(employeesById: Map<string, Employee>, employeeId: string | null) {
  if (!employeeId) {
    return 'Not assigned';
  }

  return employeesById.get(employeeId)?.fullName ?? deletedUserLabel;
}

function buildAssessmentKindLabel(assessment: Assessment) {
  return assessment.target === 'self' ? 'Self Assessment' : 'Peer Assessment';
}

function getAssessorLabel(assessment: Assessment, employeesById: Map<string, Employee>) {
  return assessment.target === 'self' ? 'self' : getEmployeeName(employeesById, assessment.assessorId);
}

function buildAssessmentTitle(
  assessment: Assessment,
  snapshot: AssessmentWorkflowSnapshot,
  employeesById: Map<string, Employee>,
) {
  const reviewPeriod = getReviewPeriod(snapshot, assessment.reviewPeriodId);
  const subjectName = getEmployeeName(employeesById, assessment.employeeId);
  return `${reviewPeriod?.key ?? 'Current'} ${buildAssessmentKindLabel(assessment)} - ${subjectName}`;
}

function buildReviewTitle(
  assessment: Assessment,
  snapshot: AssessmentWorkflowSnapshot,
  employeesById: Map<string, Employee>,
) {
  return buildAssessmentTitle(assessment, snapshot, employeesById);
}

function getReviewPeriodLabel(snapshot: AssessmentWorkflowSnapshot, assessment: Assessment) {
  return getReviewPeriod(snapshot, assessment.reviewPeriodId)?.label ?? 'Current review period';
}

function getCurrentManagerId(
  snapshot: AssessmentWorkflowSnapshot,
  assessment: Assessment,
  employeesById: Map<string, Employee>,
) {
  return getAssignment(snapshot, assessment)?.managerId ?? employeesById.get(assessment.employeeId)?.managerId ?? null;
}

function getCurrentAssessorId(snapshot: AssessmentWorkflowSnapshot, assessment: Assessment) {
  return getAssignment(snapshot, assessment)?.assessorId ?? assessment.assessorId;
}

function getAssessmentManagerIds(
  snapshot: AssessmentWorkflowSnapshot,
  assessment: Assessment,
  employeesById: Map<string, Employee>,
) {
  const managerIds = new Set<string>();
  const assignmentManagerId = getAssignment(snapshot, assessment)?.managerId;
  const employeeManagerId = employeesById.get(assessment.employeeId)?.managerId;

  if (assignmentManagerId) {
    managerIds.add(assignmentManagerId);
  }

  if (employeeManagerId) {
    managerIds.add(employeeManagerId);
  }

  return managerIds;
}

function toResponseMap(assessment: Assessment) {
  return new Map(assessment.responses.map((response) => [response.questionId, response.response] as const));
}

export function getAssessmentQuestionRows(snapshot: AssessmentWorkflowSnapshot, assessment: Assessment): AssessmentEditorQuestion[] {
  const questionSet = getQuestionSet(snapshot, assessment);
  const responsesByQuestionId = toResponseMap(assessment);

  if (!questionSet) {
    return assessment.responses.map((response) => ({
      questionId: response.questionId,
      order: response.order,
      type: 'narrative',
      category: null,
      prompt: 'Unknown question',
      response: response.response,
    }));
  }

  return questionSet.questions
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((question) => ({
      questionId: question.id,
      order: question.order,
      type: question.type,
      category: question.category,
      prompt: question.prompt,
      response: responsesByQuestionId.get(question.id) ?? '',
    }));
}

export function isAssessmentComplete(snapshot: AssessmentWorkflowSnapshot, assessment: Assessment) {
  const questions = getAssessmentQuestionRows(snapshot, assessment);
  return questions.length > 0 && questions.every((question) => question.response.trim().length > 0);
}

function hasAssessmentResponses(snapshot: AssessmentWorkflowSnapshot, assessment: Assessment) {
  return getAssessmentQuestionRows(snapshot, assessment).some((question) => question.response.trim().length > 0);
}

type DashboardAssessmentQueueStatus = 'not-started' | 'incomplete' | 'ready-to-submit';

function getDashboardAssessmentQueueStatus(
  snapshot: AssessmentWorkflowSnapshot,
  assessment: Assessment,
): DashboardAssessmentQueueStatus | null {
  if (assessment.reviewState !== 'new' && assessment.reviewState !== 'draft') {
    return null;
  }

  if (isAssessmentComplete(snapshot, assessment)) {
    return 'ready-to-submit';
  }

  return assessment.reviewState === 'draft' || hasAssessmentResponses(snapshot, assessment) ? 'incomplete' : 'not-started';
}

function buildAssessmentDetail(
  assessment: Assessment,
  snapshot: AssessmentWorkflowSnapshot,
  employeesById: Map<string, Employee>,
) {
  const subjectName = getEmployeeName(employeesById, assessment.employeeId);

  switch (getDashboardAssessmentQueueStatus(snapshot, assessment)) {
    case 'not-started':
      return `Assigned for ${subjectName} and ready to start.`;
    case 'incomplete':
      return `In progress for ${subjectName}.`;
    case 'ready-to-submit':
      return `Completed for ${subjectName} and ready to submit.`;
    case null:
      break;
  }

  switch (assessment.reviewState) {
    case 'submitted':
      return `Submitted and waiting for manager or admin acceptance.`;
    case 'accepted':
      return `Accepted and ready for manager or admin review notes.`;
    case 'reviewed':
      return `Reviewed and kept for historical reference.`;
    case 'new':
    case 'draft':
      return `Assigned for ${subjectName} and ready to start.`;
  }
}

function buildAssessmentStatusLabel(snapshot: AssessmentWorkflowSnapshot, assessment: Assessment) {
  switch (getDashboardAssessmentQueueStatus(snapshot, assessment)) {
    case 'not-started':
      return 'Not Started';
    case 'incomplete':
      return 'Incomplete';
    case 'ready-to-submit':
      return 'Complete but Not Submitted';
    case null:
      break;
  }

  switch (assessment.reviewState) {
    case 'submitted':
      return 'Submitted';
    case 'accepted':
      return 'Accepted';
    case 'reviewed':
      return 'Review Complete';
    case 'new':
    case 'draft':
      return 'Not Started';
  }
}

function buildReviewStatusLabel(assessment: Assessment) {
  switch (assessment.reviewState) {
    case 'submitted':
      return 'Waiting for acceptance';
    case 'accepted':
      return 'In review';
    case 'reviewed':
      return 'Review complete';
    case 'new':
    case 'draft':
      return 'Not started';
  }
}

function buildReviewNextStepLabel(assessment: Assessment) {
  switch (assessment.reviewState) {
    case 'submitted':
      return 'waiting to be accepted';
    case 'accepted':
      return 'waiting to be reviewed';
    case 'reviewed':
      return 'review complete';
    case 'new':
    case 'draft':
      return 'not started';
  }
}

function getReviewQueuePriority(assessment: Assessment) {
  switch (assessment.reviewState) {
    case 'submitted':
      return 0;
    case 'accepted':
      return 1;
    case 'reviewed':
      return 2;
    case 'new':
    case 'draft':
      return 3;
  }
}

export function formatSubjectiveResponse(response: string) {
  const normalized = response.trim().toLowerCase();

  switch (normalized) {
    case '0':
    case "don't know":
    case 'dont know':
    case 'not sure':
    case 'n/a':
    case 'na':
      return "0 - don't know";
    case '1':
    case 'strongly disagree':
      return '1 - strongly disagree';
    case '2':
    case 'disagree':
    case 'somewhat disagree':
      return '2 - somewhat disagree';
    case '3':
    case 'agree':
    case 'somewhat agree':
      return '3 - somewhat agree';
    case '4':
    case 'strongly agree':
      return '4 - strongly agree';
    default:
      return response;
  }
}

function toAssessmentQueueItem(
  assessment: Assessment,
  snapshot: AssessmentWorkflowSnapshot,
  employeesById: Map<string, Employee>,
): AssessmentQueueItem {
  const subjectName = getEmployeeName(employeesById, assessment.employeeId);

  return {
    assessmentId: assessment.id,
    title: buildAssessmentTitle(assessment, snapshot, employeesById),
    detail: buildAssessmentDetail(assessment, snapshot, employeesById),
    subjectName,
    targetLabel: assessment.target === 'self' ? 'Self assessment' : 'Peer assessment',
    assessorLabel: getAssessorLabel(assessment, employeesById),
    statusLabel: buildAssessmentStatusLabel(snapshot, assessment),
    actionLabel: 'Open',
  };
}

function toReviewQueueItem(
  assessment: Assessment,
  snapshot: AssessmentWorkflowSnapshot,
  employeesById: Map<string, Employee>,
): ReviewQueueItem {
  const subjectName = getEmployeeName(employeesById, assessment.employeeId);

  return {
    assessmentId: assessment.id,
    title: buildReviewTitle(assessment, snapshot, employeesById),
    subjectName,
    reviewPeriodLabel: getReviewPeriodLabel(snapshot, assessment),
    targetLabel: assessment.target === 'self' ? 'Self assessment' : 'Peer assessment',
    assessorLabel: getAssessorLabel(assessment, employeesById),
    nextStepLabel: buildReviewNextStepLabel(assessment),
    statusLabel: buildAssessmentStatusLabel(snapshot, assessment),
    actionLabel: 'Open',
  };
}

function orderAssessments(
  assessments: Assessment[],
  snapshot: AssessmentWorkflowSnapshot,
) {
  const reviewPeriodsById = new Map(snapshot.reviewPeriods.map((reviewPeriod) => [reviewPeriod.id, reviewPeriod] as const));
  return assessments
    .slice()
    .sort((left, right) => {
      const leftReviewPeriod = reviewPeriodsById.get(left.reviewPeriodId);
      const rightReviewPeriod = reviewPeriodsById.get(right.reviewPeriodId);
      const leftDueDate = leftReviewPeriod?.dueDate ?? '';
      const rightDueDate = rightReviewPeriod?.dueDate ?? '';

      if (leftDueDate !== rightDueDate) {
        return leftDueDate.localeCompare(rightDueDate);
      }

      return left.createdAt.localeCompare(right.createdAt);
    });
}

export function createAssessmentWorkflowSnapshot(foundation?: FoundationSnapshot | null): AssessmentWorkflowSnapshot {
  const source = foundation ?? foundationSnapshotExample;

  return {
    reviewPeriods: source.reviewPeriods.map((reviewPeriod) => ({ ...reviewPeriod })),
    questionSets: source.questionSets.map((questionSet) => ({
      ...questionSet,
      questions: questionSet.questions.map((question) => ({ ...question })),
    })),
    assignments: source.assignments.map(cloneAssignment),
    assessments: source.assessments.map(cloneAssessment),
  };
}

export function buildAssessmentQueues(
  user: Employee,
  snapshot: AssessmentWorkflowSnapshot,
  employees: Employee[],
): AssessmentQueueGroup[] {
  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));
  const activeReviewPeriodId = getActiveReviewPeriod(snapshot)?.id ?? null;
  const authoredAssessments = orderAssessments(
    snapshot.assessments.filter(
      (assessment) =>
        assessment.assessorId === user.id &&
        assessment.archiveState === 'active' &&
        assessment.reviewPeriodId === activeReviewPeriodId,
    ),
    snapshot,
  );

  return [
    {
      id: 'not-started',
      title: 'Not Started',
      items: authoredAssessments
        .filter((assessment) => getDashboardAssessmentQueueStatus(snapshot, assessment) === 'not-started')
        .map((assessment) => toAssessmentQueueItem(assessment, snapshot, employeesById)),
    },
    {
      id: 'incomplete',
      title: 'Incomplete',
      items: authoredAssessments
        .filter((assessment) => getDashboardAssessmentQueueStatus(snapshot, assessment) === 'incomplete')
        .map((assessment) => toAssessmentQueueItem(assessment, snapshot, employeesById)),
    },
    {
      id: 'ready-to-submit',
      title: 'Complete but Not Submitted',
      items: authoredAssessments
        .filter((assessment) => getDashboardAssessmentQueueStatus(snapshot, assessment) === 'ready-to-submit')
        .map((assessment) => toAssessmentQueueItem(assessment, snapshot, employeesById)),
    },
  ];
}

export function getAssessmentEditor(
  snapshot: AssessmentWorkflowSnapshot,
  employees: Employee[],
  assessmentId: string,
): AssessmentEditor | null {
  const assessment = snapshot.assessments.find((candidate) => candidate.id === assessmentId);
  if (!assessment) {
    return null;
  }

  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));
  const questionSet = getQuestionSet(snapshot, assessment);
  const reviewPeriod = getReviewPeriod(snapshot, assessment.reviewPeriodId);
  const readOnly = assessment.isReadOnly || assessment.archiveState === 'archived' || reviewPeriod?.status === 'archived';
  const isComplete = isAssessmentComplete(snapshot, assessment);

  return {
    assessmentId: assessment.id,
    title: buildAssessmentTitle(assessment, snapshot, employeesById),
    statusLabel: buildAssessmentStatusLabel(snapshot, assessment),
    detail: buildAssessmentDetail(assessment, snapshot, employeesById),
    targetLabel: assessment.target === 'self' ? 'Self assessment' : 'Peer assessment',
    reviewPeriodLabel: reviewPeriod?.label ?? 'Current review period',
    dueDate: reviewPeriod ? formatDate(reviewPeriod.dueDate) : 'Unknown due date',
    subjectName: getEmployeeName(employeesById, assessment.employeeId),
    assessorName: getEmployeeName(employeesById, assessment.assessorId),
    managerName: getEmployeeName(employeesById, employeesById.get(assessment.employeeId)?.managerId ?? null),
    questionSetTitle: questionSet?.title ?? 'Assessment questions',
    headerMarkdown: questionSet?.headerMarkdown ?? '',
    footerMarkdown: questionSet?.footerMarkdown ?? '',
    managerNotes: assessment.managerNotes,
    isReadOnly: Boolean(readOnly),
    isComplete,
    canSave: !readOnly && assessment.reviewState !== 'submitted',
    canSubmit: !readOnly && assessment.reviewState !== 'submitted' && isComplete,
    questions: getAssessmentQuestionRows(snapshot, assessment),
  };
}

function getReviewableAssessments(
  user: Employee,
  snapshot: AssessmentWorkflowSnapshot,
  employees: Employee[],
) {
  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));
  const activeReviewPeriodId = getActiveReviewPeriod(snapshot)?.id ?? null;

  if (!activeReviewPeriodId) {
    return [];
  }

  return snapshot.assessments.filter((assessment) => {
    if (assessment.archiveState !== 'active') {
      return false;
    }

    if (assessment.reviewPeriodId !== activeReviewPeriodId) {
      return false;
    }

    if (
      assessment.reviewState !== 'submitted' &&
      assessment.reviewState !== 'accepted' &&
      assessment.reviewState !== 'reviewed'
    ) {
      return false;
    }

    if (user.role === 'admin') {
      return true;
    }

    return getAssessmentManagerIds(snapshot, assessment, employeesById).has(user.id);
  });
}

export function buildReviewQueues(
  user: Employee,
  snapshot: AssessmentWorkflowSnapshot,
  employees: Employee[],
): ReviewQueueItem[] {
  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));
  const reviewableAssessments = getReviewableAssessments(user, snapshot, employees);

  return reviewableAssessments
    .slice()
    .sort((left, right) => {
      const queuePriorityDifference = getReviewQueuePriority(left) - getReviewQueuePriority(right);
      if (queuePriorityDifference !== 0) {
        return queuePriorityDifference;
      }

      const subjectNameDifference = getEmployeeName(employeesById, left.employeeId).localeCompare(
        getEmployeeName(employeesById, right.employeeId),
      );
      if (subjectNameDifference !== 0) {
        return subjectNameDifference;
      }

      return buildReviewTitle(left, snapshot, employeesById).localeCompare(buildReviewTitle(right, snapshot, employeesById));
    })
    .map((assessment) => toReviewQueueItem(assessment, snapshot, employeesById));
}

export function buildAdminAssessmentRows(
  snapshot: AssessmentWorkflowSnapshot,
  employees: Employee[],
  reviewPeriodId: string,
): AdminAssessmentRow[] {
  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));

  return snapshot.assessments
    .filter((assessment) => assessment.reviewPeriodId === reviewPeriodId && assessment.archiveState === 'active')
    .slice()
    .sort((left, right) => {
      const subjectNameDifference = getEmployeeName(employeesById, left.employeeId).localeCompare(
        getEmployeeName(employeesById, right.employeeId),
      );
      if (subjectNameDifference !== 0) {
        return subjectNameDifference;
      }

      if (left.target !== right.target) {
        return left.target === 'self' ? -1 : 1;
      }

      return getAssessorLabel(left, employeesById).localeCompare(getAssessorLabel(right, employeesById));
    })
    .map((assessment) => ({
      assessmentId: assessment.id,
      title: buildAssessmentTitle(assessment, snapshot, employeesById),
      subjectName: getEmployeeName(employeesById, assessment.employeeId),
      targetLabel: assessment.target === 'self' ? 'Self assessment' : 'Peer assessment',
      assessorLabel: getAssessorLabel(assessment, employeesById),
      assessmentStatusLabel: buildAssessmentStatusLabel(snapshot, assessment),
      reviewStatusLabel: buildReviewStatusLabel(assessment),
    }));
}

export function getReviewPanel(
  user: Employee,
  snapshot: AssessmentWorkflowSnapshot,
  employees: Employee[],
  assessmentId: string,
): ReviewPanel | null {
  const assessment = getReviewableAssessments(user, snapshot, employees).find((candidate) => candidate.id === assessmentId);
  if (!assessment) {
    return null;
  }

  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));
  const reviewPeriod = getReviewPeriod(snapshot, assessment.reviewPeriodId);
  const currentManagerId = getCurrentManagerId(snapshot, assessment, employeesById);

  return {
    assessmentId: assessment.id,
    title: buildReviewTitle(assessment, snapshot, employeesById),
    statusLabel: buildAssessmentStatusLabel(snapshot, assessment),
    detail: buildAssessmentDetail(assessment, snapshot, employeesById),
    targetLabel: assessment.target === 'self' ? 'Self assessment' : 'Peer assessment',
    assessmentStatusLabel: buildAssessmentStatusLabel(snapshot, assessment),
    reviewStatusLabel: buildReviewStatusLabel(assessment),
    reviewPeriodLabel: reviewPeriod?.label ?? 'Current review period',
    dueDate: reviewPeriod ? formatDate(reviewPeriod.dueDate) : 'Unknown due date',
    subjectName: getEmployeeName(employeesById, assessment.employeeId),
    assessorName: getAssessorLabel(assessment, employeesById),
    managerName: getEmployeeName(employeesById, currentManagerId),
    currentAssessorId: getCurrentAssessorId(snapshot, assessment),
    currentManagerId,
    managerNotes: assessment.managerNotes ?? '',
    canAccept: assessment.reviewState === 'submitted',
    canRejectToDraft: assessment.reviewState === 'submitted',
    canMarkReviewed: assessment.reviewState === 'accepted',
    canReassignAssessor: assessment.target === 'peer' && assessment.reviewState !== 'reviewed',
    isArchived: assessment.archiveState === 'archived' || reviewPeriod?.status === 'archived',
    questions: getAssessmentQuestionRows(snapshot, assessment),
  };
}

export function groupAssessmentEditorQuestions(questions: AssessmentEditorQuestion[]): AssessmentEditorQuestionGroup[] {
  const groups: AssessmentEditorQuestionGroup[] = [];

  for (const question of questions.slice().sort((left, right) => left.order - right.order)) {
    const category = question.category?.trim() || null;
    const previousGroup = groups[groups.length - 1];

    if (previousGroup?.category === category) {
      previousGroup.questions.push(question);
      continue;
    }

    groups.push({
      id: `${category ?? 'uncategorized'}-${question.questionId}`,
      category,
      questions: [question],
    });
  }

  return groups;
}

function replaceAssessment(
  snapshot: AssessmentWorkflowSnapshot,
  assessmentId: string,
  update: (assessment: Assessment, reviewPeriod: ReviewPeriod | null) => Assessment,
) {
  return {
    ...snapshot,
    assignments: snapshot.assignments.map(cloneAssignment),
    assessments: snapshot.assessments.map((assessment) => {
      if (assessment.id !== assessmentId) {
        return cloneAssessment(assessment);
      }

      const reviewPeriod = getReviewPeriod(snapshot, assessment.reviewPeriodId);
      return update(cloneAssessment(assessment), reviewPeriod);
    }),
  };
}

function withResponses(
  snapshot: AssessmentWorkflowSnapshot,
  assessment: Assessment,
  responses: Record<string, string>,
) {
  return {
    ...assessment,
    responses: getAssessmentQuestionRows(snapshot, assessment).map((question) => ({
      questionId: question.questionId,
      order: question.order,
      response: responses[question.questionId] ?? question.response,
    })),
  };
}

export function saveAssessmentDraft(
  snapshot: AssessmentWorkflowSnapshot,
  assessmentId: string,
  responses: Record<string, string>,
  options: MutationOptions = {},
) {
  const timestamp = nextTimestamp(options.now);

  return replaceAssessment(snapshot, assessmentId, (assessment, reviewPeriod) => ({
    ...withResponses(snapshot, assessment, responses),
    reviewState: 'draft',
    submittedAt: null,
    acceptedAt: null,
    acceptedByEmployeeId: null,
    reviewedAt: null,
    reviewedByEmployeeId: null,
    isReadOnly: reviewPeriod?.status === 'archived' || assessment.archiveState === 'archived',
    updatedAt: timestamp,
  }));
}

export function submitAssessment(
  snapshot: AssessmentWorkflowSnapshot,
  assessmentId: string,
  responses: Record<string, string>,
  options: MutationOptions = {},
) {
  const timestamp = nextTimestamp(options.now);

  return replaceAssessment(snapshot, assessmentId, (assessment) => ({
    ...withResponses(snapshot, assessment, responses),
    reviewState: 'submitted',
    submittedAt: timestamp,
    acceptedAt: null,
    acceptedByEmployeeId: null,
    reviewedAt: null,
    reviewedByEmployeeId: null,
    isReadOnly: true,
    updatedAt: timestamp,
  }));
}

export function acceptAssessmentReview(
  snapshot: AssessmentWorkflowSnapshot,
  assessmentId: string,
  notes: string,
  options: MutationOptions = {},
) {
  const timestamp = nextTimestamp(options.now);

  return replaceAssessment(snapshot, assessmentId, (assessment) => ({
    ...assessment,
    reviewState: 'accepted',
    acceptedAt: timestamp,
    acceptedByEmployeeId: options.actorId ?? null,
    managerNotes: notes.trim() || null,
    isReadOnly: true,
    updatedAt: timestamp,
  }));
}

export function rejectAssessmentToDraft(
  snapshot: AssessmentWorkflowSnapshot,
  assessmentId: string,
  notes: string,
  options: MutationOptions = {},
) {
  const timestamp = nextTimestamp(options.now);

  return replaceAssessment(snapshot, assessmentId, (assessment, reviewPeriod) => ({
    ...assessment,
    reviewState: 'draft',
    submittedAt: null,
    acceptedAt: null,
    acceptedByEmployeeId: null,
    reviewedAt: null,
    reviewedByEmployeeId: null,
    managerNotes: notes.trim() || null,
    isReadOnly: reviewPeriod?.status === 'archived' || assessment.archiveState === 'archived',
    updatedAt: timestamp,
  }));
}

export function completeAssessmentReview(
  snapshot: AssessmentWorkflowSnapshot,
  assessmentId: string,
  notes: string,
  options: MutationOptions = {},
) {
  const timestamp = nextTimestamp(options.now);

  return replaceAssessment(snapshot, assessmentId, (assessment) => ({
    ...assessment,
    reviewState: 'reviewed',
    managerNotes: notes.trim() || null,
    reviewedAt: timestamp,
    reviewedByEmployeeId: options.actorId ?? null,
    isReadOnly: true,
    updatedAt: timestamp,
  }));
}

export function reassignAssessmentRelationships(
  snapshot: AssessmentWorkflowSnapshot,
  assessmentId: string,
  managerId: string | null,
  assessorId: string | null,
) {
  const assessment = snapshot.assessments.find((candidate) => candidate.id === assessmentId);
  if (!assessment) {
    return {
      snapshot,
      relationships: null,
    };
  }

  const nextAssessorId = assessment.target === 'peer' ? assessorId ?? assessment.assessorId : assessment.assessorId;
  const nextSnapshot: AssessmentWorkflowSnapshot = {
    ...snapshot,
    reviewPeriods: snapshot.reviewPeriods.map((reviewPeriod) => ({ ...reviewPeriod })),
    questionSets: snapshot.questionSets.map((questionSet) => ({
      ...questionSet,
      questions: questionSet.questions.map((question) => ({ ...question })),
    })),
    assessments: snapshot.assessments.map(cloneAssessment),
    assignments: snapshot.assignments.map((assignment) => {
      if (assignment.id !== assessment.assignmentId) {
        return cloneAssignment(assignment);
      }

      return {
        ...assignment,
        managerId,
        assessorId: nextAssessorId ?? assignment.assessorId,
      };
    }),
  };

  return {
    snapshot: nextSnapshot,
    relationships: {
      employeeId: assessment.employeeId,
      managerId,
      assessorId: nextAssessorId,
    },
  };
}
