import type {
  Assessment,
  AssessmentReviewerRole,
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
  dueDate: string;
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
  detail: string;
  subjectName: string;
  reviewPeriodLabel: string;
  targetLabel: string;
  assessorLabel: string;
  dueDate: string;
  nextStepLabel: string;
  statusLabel: string;
  actionLabel: string;
};

export type AdminAssessmentRow = {
  assessmentId: string;
  reviewPeriodId: string;
  employeeId: string;
  title: string;
  subjectName: string;
  target: Assessment['target'];
  targetLabel: string;
  assessorLabel: string;
  detail: string;
  assessmentStatusLabel: string;
  lifecycleLabel: string;
  nextStepLabel: string;
  openAssessmentLabel: string;
  reviewActionLabel: string | null;
  workflowActionLabel: string | null;
  summaryBucket: 'drafting' | 'submitted' | 'accepted' | 'ready-for-meeting' | 'scheduled' | 'concluded';
};

export type AdminAssessmentSummary = {
  target: Assessment['target'];
  total: number;
  drafting: number;
  submitted: number;
  accepted: number;
  readyForMeeting: number;
  scheduled: number;
  concluded: number;
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
  canReassignAssessor: boolean;
  isArchived: boolean;
  questions: AssessmentEditorQuestion[];
};

export type AssessmentSetQueueAction = 'mark-ready' | 'schedule' | 'complete-reviewer-step' | 'none';

export type AssessmentSetQueueItem = {
  id: string;
  reviewPeriodId: string;
  employeeId: string;
  assessmentIds: string[];
  title: string;
  detail: string;
  subjectName: string;
  reviewPeriodLabel: string;
  dueDate: string;
  statusLabel: string;
  actionLabel: string;
  actionKind: AssessmentSetQueueAction;
  responsibilityLabel: string;
  reviewerRole: AssessmentReviewerRole | null;
};

export type AssessmentSetWorkflowAssessment = {
  assessmentId: string;
  title: string;
  targetLabel: string;
  assessorLabel: string;
  statusLabel: string;
  managerNotes: string | null;
};

export type AssessmentSetReviewerWorkflow = {
  role: AssessmentReviewerRole;
  label: string;
  assignedReviewerName: string;
  assignedReviewerId: string | null;
  responsibilityLabel: string;
  statusLabel: string;
  notes: string;
  completedAt: string | null;
  canConclude: boolean;
  canReopen: boolean;
  isCurrentUserResponsible: boolean;
};

export type AssessmentSetWorkflowPanel = {
  reviewPeriodId: string;
  employeeId: string;
  title: string;
  detail: string;
  dialogKind: 'ready-for-meeting' | 'schedule-meeting' | 'conclude-review';
  subjectName: string;
  reviewPeriodLabel: string;
  dueDate: string;
  statusLabel: string;
  assessments: AssessmentSetWorkflowAssessment[];
  reviewerActions: AssessmentSetReviewerWorkflow[];
  canMarkReady: boolean;
  canSchedule: boolean;
  currentUserReviewerRole: AssessmentReviewerRole | null;
  isAdmin: boolean;
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

function isConcludedState(reviewState: Assessment['reviewState']) {
  return reviewState === 'concluded' || reviewState === 'reviewed';
}

type AssessmentSetSnapshot = {
  reviewPeriodId: string;
  employeeId: string;
  assessments: Assessment[];
};

function getAssessmentSetState(assessments: Assessment[]): Assessment['reviewState'] | null {
  if (!assessments.length) {
    return null;
  }

  const [firstAssessment] = assessments;
  if (!firstAssessment) {
    return null;
  }

  if (assessments.every((assessment) => assessment.reviewState === firstAssessment.reviewState)) {
    return firstAssessment.reviewState;
  }

  if (assessments.every((assessment) => isConcludedState(assessment.reviewState))) {
    return 'concluded';
  }

  return null;
}

function collectActiveAssessmentSets(snapshot: AssessmentWorkflowSnapshot): AssessmentSetSnapshot[] {
  const activeReviewPeriodId = getActiveReviewPeriod(snapshot)?.id ?? null;
  if (!activeReviewPeriodId) {
    return [];
  }

  const sets = new Map<string, AssessmentSetSnapshot>();

  for (const assessment of snapshot.assessments) {
    if (assessment.archiveState !== 'active' || assessment.reviewPeriodId !== activeReviewPeriodId) {
      continue;
    }

    const key = `${assessment.reviewPeriodId}:${assessment.employeeId}`;
    const existingSet = sets.get(key);
    if (existingSet) {
      existingSet.assessments.push(assessment);
      continue;
    }

    sets.set(key, {
      reviewPeriodId: assessment.reviewPeriodId,
      employeeId: assessment.employeeId,
      assessments: [assessment],
    });
  }

  return Array.from(sets.values());
}

function getReviewerRoleForSet(
  user: Employee,
  employeesById: Map<string, Employee>,
  set: AssessmentSetSnapshot,
): AssessmentReviewerRole | null {
  const employee = employeesById.get(set.employeeId);
  if (!employee) {
    return null;
  }

  if (employee.reviewer1Id === user.id) {
    return 'reviewer1';
  }

  if (employee.reviewer2Id === user.id) {
    return 'reviewer2';
  }

  return null;
}

function buildReviewerRoleLabel(role: AssessmentReviewerRole) {
  return role === 'reviewer1' ? 'Reviewer 1' : 'Reviewer 2';
}

function hasReviewerCompleted(assessment: Assessment, role: AssessmentReviewerRole) {
  return role === 'reviewer1' ? assessment.reviewer1CompletedAt !== null : assessment.reviewer2CompletedAt !== null;
}

function getReviewerNotes(assessment: Assessment, role: AssessmentReviewerRole) {
  return role === 'reviewer1' ? assessment.reviewer1Notes : assessment.reviewer2Notes;
}

function getReviewerCompletedAt(assessment: Assessment, role: AssessmentReviewerRole) {
  return role === 'reviewer1' ? assessment.reviewer1CompletedAt : assessment.reviewer2CompletedAt;
}

function collectUniqueNonEmptyValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim() ?? '').filter((value) => value.length > 0))];
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
      return `Accepted and ready for the assessment set to move into meeting preparation.`;
    case 'ready_for_meeting':
      return `Ready for meeting scheduling.`;
    case 'scheduled':
      return `Scheduled and waiting for reviewer follow-up.`;
    case 'concluded':
    case 'reviewed':
      return `Concluded and kept for historical reference.`;
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
    case 'ready_for_meeting':
      return 'Ready for Meeting';
    case 'scheduled':
      return 'Scheduled';
    case 'concluded':
    case 'reviewed':
      return 'Concluded';
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
      return 'Accepted';
    case 'ready_for_meeting':
      return 'Ready for meeting';
    case 'scheduled':
      return 'Scheduled';
    case 'concluded':
    case 'reviewed':
      return 'Concluded';
    case 'new':
    case 'draft':
      return 'Not started';
  }
}

function buildAdminAssessmentSummaryBucket(
  snapshot: AssessmentWorkflowSnapshot,
  assessment: Assessment,
): AdminAssessmentRow['summaryBucket'] {
  if (getDashboardAssessmentQueueStatus(snapshot, assessment) !== null) {
    return 'drafting';
  }

  switch (assessment.reviewState) {
    case 'submitted':
      return 'submitted';
    case 'accepted':
      return 'accepted';
    case 'ready_for_meeting':
      return 'ready-for-meeting';
    case 'scheduled':
      return 'scheduled';
    case 'concluded':
    case 'reviewed':
      return 'concluded';
    case 'new':
    case 'draft':
      return 'drafting';
  }
}

function buildAdminAssessmentLifecycleLabel(
  snapshot: AssessmentWorkflowSnapshot,
  assessment: Assessment,
) {
  switch (buildAdminAssessmentSummaryBucket(snapshot, assessment)) {
    case 'drafting':
      return 'Not started / incomplete';
    case 'submitted':
      return 'Submitted';
    case 'accepted':
      return 'Accepted';
    case 'ready-for-meeting':
      return 'Ready for meeting';
    case 'scheduled':
      return 'Scheduled';
    case 'concluded':
      return 'Concluded';
  }
}

function buildAdminAssessmentNextStepLabel(summaryBucket: AdminAssessmentRow['summaryBucket']) {
  switch (summaryBucket) {
    case 'drafting':
      return 'Employee or admin can finish and submit the assessment.';
    case 'submitted':
      return 'Manager or admin can accept it or return it to incomplete.';
    case 'accepted':
      return 'Manager or admin can move the full assessment set to ready for meeting.';
    case 'ready-for-meeting':
      return 'Manager or admin can mark the review meeting as scheduled.';
    case 'scheduled':
      return 'Assigned reviewers or an admin can record reviewer conclusions.';
    case 'concluded':
      return 'Admins can reopen reviewer conclusions if follow-up changes.';
  }
}

function buildAdminAssessmentSetActionLabel(setState: Assessment['reviewState'] | null) {
  switch (setState) {
    case 'accepted':
      return 'Mark ready for meeting';
    case 'ready_for_meeting':
      return 'Mark meeting scheduled';
    case 'scheduled':
      return 'Conclude review';
    case 'concluded':
    case 'reviewed':
      return 'Reopen conclusion';
    case 'new':
    case 'draft':
    case 'submitted':
    case null:
      return null;
  }
}

function buildReviewNextStepLabel(assessment: Assessment) {
  switch (assessment.reviewState) {
    case 'submitted':
      return 'waiting for acceptance';
    case 'accepted':
      return 'waiting for ready-for-meeting';
    case 'ready_for_meeting':
      return 'waiting for scheduling';
    case 'scheduled':
      return 'waiting for reviewer conclusions';
    case 'concluded':
    case 'reviewed':
      return 'concluded';
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
    case 'ready_for_meeting':
      return 2;
    case 'scheduled':
      return 3;
    case 'concluded':
    case 'reviewed':
      return 4;
    case 'new':
    case 'draft':
      return 5;
  }
}

export function formatSubjectiveResponse(response: string) {
  const normalized = response.trim().toLowerCase();

  switch (normalized) {
    case '0':
    case "don't know":
    case 'dont know':
    case 'neutral':
    case 'not sure':
    case 'n/a':
    case 'na':
      return '0 - neutral';
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
  const reviewPeriod = getReviewPeriod(snapshot, assessment.reviewPeriodId);

  return {
    assessmentId: assessment.id,
    title: buildAssessmentTitle(assessment, snapshot, employeesById),
    detail: buildAssessmentDetail(assessment, snapshot, employeesById),
    subjectName,
    targetLabel: assessment.target === 'self' ? 'Self assessment' : 'Peer assessment',
    assessorLabel: getAssessorLabel(assessment, employeesById),
    dueDate: reviewPeriod ? formatDate(reviewPeriod.assessmentDueDate) : 'Unknown due date',
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
  const reviewPeriod = getReviewPeriod(snapshot, assessment.reviewPeriodId);

  return {
    assessmentId: assessment.id,
    title: buildReviewTitle(assessment, snapshot, employeesById),
    detail: buildAssessmentDetail(assessment, snapshot, employeesById),
    subjectName,
    reviewPeriodLabel: getReviewPeriodLabel(snapshot, assessment),
    targetLabel: assessment.target === 'self' ? 'Self assessment' : 'Peer assessment',
    assessorLabel: getAssessorLabel(assessment, employeesById),
    dueDate: reviewPeriod && !isConcludedState(assessment.reviewState)
      ? formatDate(reviewPeriod.reviewDueDate)
      : '—',
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
      const leftDueDate = leftReviewPeriod?.assessmentDueDate ?? '';
      const rightDueDate = rightReviewPeriod?.assessmentDueDate ?? '';

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
    dueDate: reviewPeriod ? formatDate(reviewPeriod.assessmentDueDate) : 'Unknown due date',
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
    canSubmit: !readOnly && assessment.reviewState !== 'submitted',
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

    if (assessment.reviewState !== 'submitted') {
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

      if (left.target !== right.target) {
        return left.target === 'self' ? -1 : 1;
      }

      return buildReviewTitle(left, snapshot, employeesById).localeCompare(buildReviewTitle(right, snapshot, employeesById));
    })
    .map((assessment) => toReviewQueueItem(assessment, snapshot, employeesById));
}

function sortAssessmentSets(
  assessmentSets: AssessmentSetSnapshot[],
  employeesById: Map<string, Employee>,
) {
  return assessmentSets.slice().sort((left, right) => {
    const subjectNameDifference = getEmployeeName(employeesById, left.employeeId).localeCompare(
      getEmployeeName(employeesById, right.employeeId),
    );

    if (subjectNameDifference !== 0) {
      return subjectNameDifference;
    }

    return left.reviewPeriodId.localeCompare(right.reviewPeriodId);
  });
}

function canManageAssessmentSet(
  user: Employee,
  snapshot: AssessmentWorkflowSnapshot,
  employeesById: Map<string, Employee>,
  assessmentSet: AssessmentSetSnapshot,
) {
  if (user.role === 'admin') {
    return true;
  }

  return assessmentSet.assessments.some((assessment) => getAssessmentManagerIds(snapshot, assessment, employeesById).has(user.id));
}

function toAssessmentSetQueueItem(
  snapshot: AssessmentWorkflowSnapshot,
  employeesById: Map<string, Employee>,
  assessmentSet: AssessmentSetSnapshot,
  options: {
    actionKind: AssessmentSetQueueAction;
    actionLabel: string;
    detail: string;
    responsibilityLabel: string;
    reviewerRole?: AssessmentReviewerRole | null;
  },
): AssessmentSetQueueItem {
  const reviewPeriod = getReviewPeriod(snapshot, assessmentSet.reviewPeriodId);
  const setState = getAssessmentSetState(assessmentSet.assessments);

  return {
    id: `${assessmentSet.reviewPeriodId}:${assessmentSet.employeeId}`,
    reviewPeriodId: assessmentSet.reviewPeriodId,
    employeeId: assessmentSet.employeeId,
    assessmentIds: assessmentSet.assessments.map((assessment) => assessment.id),
    title: `${reviewPeriod?.key ?? 'Current'} assessment set - ${getEmployeeName(employeesById, assessmentSet.employeeId)}`,
    detail: options.detail,
    subjectName: getEmployeeName(employeesById, assessmentSet.employeeId),
    reviewPeriodLabel: reviewPeriod?.label ?? 'Current review period',
    dueDate: reviewPeriod ? formatDate(reviewPeriod.reviewDueDate) : 'Unknown due date',
    statusLabel: setState ? buildReviewStatusLabel({ ...assessmentSet.assessments[0]!, reviewState: setState }) : 'Mixed state',
    actionLabel: options.actionLabel,
    actionKind: options.actionKind,
    responsibilityLabel: options.responsibilityLabel,
    reviewerRole: options.reviewerRole ?? null,
  };
}

export function buildReadyForMeetingQueues(
  user: Employee,
  snapshot: AssessmentWorkflowSnapshot,
  employees: Employee[],
): AssessmentSetQueueItem[] {
  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));

  return sortAssessmentSets(collectActiveAssessmentSets(snapshot), employeesById)
    .filter((assessmentSet) => canManageAssessmentSet(user, snapshot, employeesById, assessmentSet))
    .filter((assessmentSet) => getAssessmentSetState(assessmentSet.assessments) === 'accepted')
    .map((assessmentSet) =>
      toAssessmentSetQueueItem(snapshot, employeesById, assessmentSet, {
        actionKind: 'mark-ready',
        actionLabel: 'Ready for meeting',
        detail: `Review the accepted set for ${getEmployeeName(employeesById, assessmentSet.employeeId)} and confirm it is ready for the meeting.`,
        responsibilityLabel: 'Manager readiness',
      }),
    );
}

export function buildReviewerScheduledQueues(
  user: Employee,
  snapshot: AssessmentWorkflowSnapshot,
  employees: Employee[],
): AssessmentSetQueueItem[] {
  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));

  return sortAssessmentSets(collectActiveAssessmentSets(snapshot), employeesById)
    .map((assessmentSet) => ({
      assessmentSet,
      reviewerRole: getReviewerRoleForSet(user, employeesById, assessmentSet),
    }))
    .filter(({ reviewerRole }) => reviewerRole !== null)
    .filter(({ assessmentSet }) => getAssessmentSetState(assessmentSet.assessments) === 'scheduled')
    .filter(({ assessmentSet, reviewerRole }) =>
      assessmentSet.assessments.some((assessment) => reviewerRole && !hasReviewerCompleted(assessment, reviewerRole)),
    )
    .map(({ assessmentSet, reviewerRole }) =>
      toAssessmentSetQueueItem(snapshot, employeesById, assessmentSet, {
        actionKind: reviewerRole ? 'complete-reviewer-step' : 'none',
        actionLabel: reviewerRole ? 'Conclude review' : 'View',
        detail: `${buildReviewerRoleLabel(reviewerRole!)} still needs to record a conclusion for ${getEmployeeName(
          employeesById,
          assessmentSet.employeeId,
        )}.`,
        responsibilityLabel: reviewerRole ? buildReviewerRoleLabel(reviewerRole) : 'Reviewer',
        reviewerRole,
      }),
    );
}

export function buildAdminOversightQueues(
  snapshot: AssessmentWorkflowSnapshot,
  employees: Employee[],
): Record<'readyForMeeting' | 'scheduled' | 'concluded', AssessmentSetQueueItem[]> {
  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));
  const assessmentSets = sortAssessmentSets(collectActiveAssessmentSets(snapshot), employeesById);

  return {
    readyForMeeting: assessmentSets
      .filter((assessmentSet) => getAssessmentSetState(assessmentSet.assessments) === 'ready_for_meeting')
      .map((assessmentSet) =>
        toAssessmentSetQueueItem(snapshot, employeesById, assessmentSet, {
          actionKind: 'schedule',
          actionLabel: 'Schedule meeting',
          detail: `Confirm the review meeting status for ${getEmployeeName(employeesById, assessmentSet.employeeId)}.`,
          responsibilityLabel: 'Admin scheduling',
        }),
      ),
    scheduled: assessmentSets
      .filter((assessmentSet) => getAssessmentSetState(assessmentSet.assessments) === 'scheduled')
      .map((assessmentSet) =>
        toAssessmentSetQueueItem(snapshot, employeesById, assessmentSet, {
          actionKind: 'complete-reviewer-step',
          actionLabel: 'Conclude review',
          detail: `Reviewer conclusions are still in progress for ${getEmployeeName(employeesById, assessmentSet.employeeId)}.`,
          responsibilityLabel: 'Admin oversight',
        }),
      ),
    concluded: assessmentSets
      .filter((assessmentSet) => getAssessmentSetState(assessmentSet.assessments) === 'concluded')
      .map((assessmentSet) =>
        toAssessmentSetQueueItem(snapshot, employeesById, assessmentSet, {
          actionKind: 'complete-reviewer-step',
          actionLabel: 'Reopen conclusion',
          detail: `Both reviewer conclusions are recorded for ${getEmployeeName(
            employeesById,
            assessmentSet.employeeId,
          )}. Reopen a reviewer step if follow-up changes.`,
          responsibilityLabel: 'Admin oversight',
        }),
      ),
  };
}

export function getAssessmentSetWorkflowPanel(
  user: Employee,
  snapshot: AssessmentWorkflowSnapshot,
  employees: Employee[],
  reviewPeriodId: string,
  employeeId: string,
): AssessmentSetWorkflowPanel | null {
  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));
  const assessmentSet = collectActiveAssessmentSets(snapshot).find(
    (candidate) => candidate.reviewPeriodId === reviewPeriodId && candidate.employeeId === employeeId,
  );
  if (!assessmentSet) {
    return null;
  }

  const setState = getAssessmentSetState(assessmentSet.assessments);
  if (!setState || (setState !== 'accepted' && setState !== 'ready_for_meeting' && setState !== 'scheduled' && setState !== 'concluded')) {
    return null;
  }

  const canManage = canManageAssessmentSet(user, snapshot, employeesById, assessmentSet);
  const currentUserReviewerRole = getReviewerRoleForSet(user, employeesById, assessmentSet);

  if ((setState === 'accepted' || setState === 'ready_for_meeting') && !canManage) {
    return null;
  }

  if ((setState === 'scheduled' || setState === 'concluded') && user.role !== 'admin' && currentUserReviewerRole === null) {
    return null;
  }

  const reviewPeriod = getReviewPeriod(snapshot, assessmentSet.reviewPeriodId);
  const subjectName = getEmployeeName(employeesById, assessmentSet.employeeId);
  const subject = employeesById.get(assessmentSet.employeeId) ?? null;
  const assessments = assessmentSet.assessments
    .slice()
    .sort((left, right) => {
      if (left.target !== right.target) {
        return left.target === 'self' ? -1 : 1;
      }

      return left.id.localeCompare(right.id);
    })
    .map((assessment) => ({
      assessmentId: assessment.id,
      title: buildAssessmentTitle(assessment, snapshot, employeesById),
      targetLabel: assessment.target === 'self' ? 'Self assessment' : 'Peer assessment',
      assessorLabel: getAssessorLabel(assessment, employeesById),
      statusLabel: buildAssessmentStatusLabel(snapshot, assessment),
      managerNotes: assessment.managerNotes,
    }));

  const reviewerActions: AssessmentSetReviewerWorkflow[] = (['reviewer1', 'reviewer2'] as const).map((role) => {
    const assignedReviewerId = role === 'reviewer1' ? subject?.reviewer1Id ?? null : subject?.reviewer2Id ?? null;
    const completed = assessmentSet.assessments.every((assessment) => hasReviewerCompleted(assessment, role));
    const partial = !completed && assessmentSet.assessments.some((assessment) => hasReviewerCompleted(assessment, role));
    const notes = collectUniqueNonEmptyValues(assessmentSet.assessments.map((assessment) => getReviewerNotes(assessment, role))).join(
      '\n\n',
    );
    const completedAt =
      assessmentSet.assessments.map((assessment) => getReviewerCompletedAt(assessment, role)).find((value) => value !== null) ?? null;
    const isCurrentUserResponsible = user.role === 'admin' || currentUserReviewerRole === role;

    return {
      role,
      label: buildReviewerRoleLabel(role),
      assignedReviewerName: getEmployeeName(employeesById, assignedReviewerId),
      assignedReviewerId,
      responsibilityLabel:
        role === 'reviewer1'
          ? 'Reviewer 1 records the first conclusion after the meeting and can reopen it later if follow-up changes.'
          : 'Reviewer 2 records the final conclusion after the meeting and can reopen it later if follow-up changes.',
      statusLabel: assignedReviewerId === null ? 'Not assigned' : completed ? 'Concluded' : partial ? 'Partially concluded' : 'Pending',
      notes,
      completedAt,
      canConclude: assignedReviewerId !== null && isCurrentUserResponsible && !completed && setState === 'scheduled',
      canReopen: assignedReviewerId !== null && isCurrentUserResponsible && (completed || partial),
      isCurrentUserResponsible,
    };
  });

  return {
    reviewPeriodId: assessmentSet.reviewPeriodId,
    employeeId: assessmentSet.employeeId,
    title: `${subjectName} assessment set`,
    detail:
      setState === 'accepted'
        ? `Both submitted assessments are accepted. Confirm when this set is ready for the review meeting.`
        : setState === 'ready_for_meeting'
          ? `Use this status-only step once the review meeting is arranged elsewhere. Revu does not capture meeting details yet.`
          : user.role === 'admin'
            ? 'Record or reopen reviewer conclusions for Reviewer 1 and Reviewer 2.'
            : `${buildReviewerRoleLabel(currentUserReviewerRole!)} is responsible for recording this conclusion.`,
    dialogKind:
      setState === 'accepted'
        ? 'ready-for-meeting'
        : setState === 'ready_for_meeting'
          ? 'schedule-meeting'
          : 'conclude-review',
    subjectName,
    reviewPeriodLabel: reviewPeriod?.label ?? 'Current review period',
    dueDate: reviewPeriod ? formatDate(reviewPeriod.reviewDueDate) : 'Unknown due date',
    statusLabel:
      setState === 'accepted'
        ? 'Accepted'
        : setState === 'ready_for_meeting'
          ? 'Ready for meeting'
          : setState === 'scheduled'
            ? 'Scheduled'
            : 'Concluded',
    assessments,
    reviewerActions,
    canMarkReady: canManage && setState === 'accepted',
    canSchedule: canManage && setState === 'ready_for_meeting',
    currentUserReviewerRole,
    isAdmin: user.role === 'admin',
  };
}

export function buildAdminAssessmentRows(
  snapshot: AssessmentWorkflowSnapshot,
  employees: Employee[],
  reviewPeriodId: string,
): AdminAssessmentRow[] {
  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));
  const assessmentSetStateByKey = new Map(
    collectActiveAssessmentSets(snapshot).map((assessmentSet) => [
      `${assessmentSet.reviewPeriodId}:${assessmentSet.employeeId}`,
      getAssessmentSetState(assessmentSet.assessments),
    ] as const),
  );
  const assessments = snapshot.assessments
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
    });

  return assessments.map((assessment) => {
    const summaryBucket = buildAdminAssessmentSummaryBucket(snapshot, assessment);
    const assessmentSetState =
      assessmentSetStateByKey.get(`${assessment.reviewPeriodId}:${assessment.employeeId}`) ?? null;

    return {
      assessmentId: assessment.id,
      reviewPeriodId: assessment.reviewPeriodId,
      employeeId: assessment.employeeId,
      title: buildAssessmentTitle(assessment, snapshot, employeesById),
      subjectName: getEmployeeName(employeesById, assessment.employeeId),
      target: assessment.target,
      targetLabel: assessment.target === 'self' ? 'Self assessment' : 'Peer assessment',
      assessorLabel: getAssessorLabel(assessment, employeesById),
      detail: buildAssessmentDetail(assessment, snapshot, employeesById),
      assessmentStatusLabel: buildAssessmentStatusLabel(snapshot, assessment),
      lifecycleLabel: buildAdminAssessmentLifecycleLabel(snapshot, assessment),
      nextStepLabel: buildAdminAssessmentNextStepLabel(summaryBucket),
      openAssessmentLabel: summaryBucket === 'drafting' ? 'Open assessment' : 'View assessment',
      reviewActionLabel: assessment.reviewState === 'submitted' ? 'Review submission' : null,
      workflowActionLabel: buildAdminAssessmentSetActionLabel(assessmentSetState),
      summaryBucket,
    };
  });
}

export function buildAdminAssessmentSummary(rows: AdminAssessmentRow[]): AdminAssessmentSummary[] {
  const summaryByTarget = new Map<Assessment['target'], AdminAssessmentSummary>([
    [
      'self',
        {
          target: 'self',
          total: 0,
          drafting: 0,
          submitted: 0,
          accepted: 0,
          readyForMeeting: 0,
          scheduled: 0,
          concluded: 0,
        },
      ],
    [
      'peer',
        {
          target: 'peer',
          total: 0,
          drafting: 0,
          submitted: 0,
          accepted: 0,
          readyForMeeting: 0,
          scheduled: 0,
          concluded: 0,
        },
      ],
  ]);

  for (const row of rows) {
    const summary = summaryByTarget.get(row.target);
    if (!summary) {
      continue;
    }

    summary.total += 1;

    switch (row.summaryBucket) {
      case 'drafting':
        summary.drafting += 1;
        break;
      case 'submitted':
        summary.submitted += 1;
        break;
      case 'accepted':
        summary.accepted += 1;
        break;
      case 'ready-for-meeting':
        summary.readyForMeeting += 1;
        break;
      case 'scheduled':
        summary.scheduled += 1;
        break;
      case 'concluded':
        summary.concluded += 1;
        break;
    }
  }

  return [summaryByTarget.get('self')!, summaryByTarget.get('peer')!];
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
    dueDate: reviewPeriod ? formatDate(reviewPeriod.reviewDueDate) : 'Unknown due date',
    subjectName: getEmployeeName(employeesById, assessment.employeeId),
    assessorName: getAssessorLabel(assessment, employeesById),
    managerName: getEmployeeName(employeesById, currentManagerId),
    currentAssessorId: getCurrentAssessorId(snapshot, assessment),
    currentManagerId,
    managerNotes: assessment.managerNotes ?? '',
    canAccept: assessment.reviewState === 'submitted',
    canRejectToDraft: assessment.reviewState === 'submitted',
    canReassignAssessor: assessment.target === 'peer' && !isConcludedState(assessment.reviewState),
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
    readyForMeetingAt: null,
    scheduledAt: null,
    scheduledByEmployeeId: null,
    reviewer1Notes: null,
    reviewer1CompletedAt: null,
    reviewer1CompletedByEmployeeId: null,
    reviewer2Notes: null,
    reviewer2CompletedAt: null,
    reviewer2CompletedByEmployeeId: null,
    concludedAt: null,
    concludedByEmployeeId: null,
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
    readyForMeetingAt: null,
    scheduledAt: null,
    scheduledByEmployeeId: null,
    reviewer1Notes: null,
    reviewer1CompletedAt: null,
    reviewer1CompletedByEmployeeId: null,
    reviewer2Notes: null,
    reviewer2CompletedAt: null,
    reviewer2CompletedByEmployeeId: null,
    concludedAt: null,
    concludedByEmployeeId: null,
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
    readyForMeetingAt: null,
    scheduledAt: null,
    scheduledByEmployeeId: null,
    reviewer1Notes: null,
    reviewer1CompletedAt: null,
    reviewer1CompletedByEmployeeId: null,
    reviewer2Notes: null,
    reviewer2CompletedAt: null,
    reviewer2CompletedByEmployeeId: null,
    concludedAt: null,
    concludedByEmployeeId: null,
    reviewedAt: null,
    reviewedByEmployeeId: null,
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
    readyForMeetingAt: null,
    scheduledAt: null,
    scheduledByEmployeeId: null,
    reviewer1CompletedAt: null,
    reviewer1CompletedByEmployeeId: null,
    reviewer2CompletedAt: null,
    reviewer2CompletedByEmployeeId: null,
    concludedAt: null,
    concludedByEmployeeId: null,
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
    reviewState: 'concluded',
    managerNotes: notes.trim() || null,
    concludedAt: timestamp,
    concludedByEmployeeId: options.actorId ?? null,
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
