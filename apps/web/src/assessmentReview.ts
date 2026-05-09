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
  statusLabel: string;
  actionLabel: string;
};

export type AssessmentQueueGroup = {
  id: 'ready' | 'in-progress' | 'ready-to-submit' | 'awaiting-acceptance' | 'complete';
  title: string;
  items: AssessmentQueueItem[];
};

export type ReviewQueueItem = {
  assessmentId: string;
  title: string;
  detail: string;
  statusLabel: string;
  actionLabel: string;
};

export type ReviewQueueGroup = {
  id: 'submitted' | 'accepted' | 'reviewed';
  title: string;
  items: ReviewQueueItem[];
};

export type AssessmentEditorQuestion = {
  questionId: string;
  order: number;
  type: Question['type'];
  category: string | null;
  prompt: string;
  response: string;
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

function getQuestionSet(snapshot: AssessmentWorkflowSnapshot, assessment: Assessment) {
  return snapshot.questionSets.find((questionSet) => questionSet.id === assessment.questionSetId) ?? null;
}

function getEmployeeName(employeesById: Map<string, Employee>, employeeId: string | null) {
  if (!employeeId) {
    return 'Not assigned';
  }

  return employeesById.get(employeeId)?.fullName ?? 'Unknown employee';
}

function buildAssessmentTitle(
  assessment: Assessment,
  snapshot: AssessmentWorkflowSnapshot,
  employeesById: Map<string, Employee>,
) {
  const reviewPeriod = getReviewPeriod(snapshot, assessment.reviewPeriodId);
  const subjectName = getEmployeeName(employeesById, assessment.employeeId);
  const targetLabel = assessment.target === 'self' ? 'Self-Assessment' : `Peer-Assessment for ${subjectName}`;
  return `${reviewPeriod?.key ?? 'Current'} ${targetLabel}`;
}

function buildReviewTitle(
  assessment: Assessment,
  snapshot: AssessmentWorkflowSnapshot,
  employeesById: Map<string, Employee>,
) {
  const reviewPeriod = getReviewPeriod(snapshot, assessment.reviewPeriodId);
  const subjectName = getEmployeeName(employeesById, assessment.employeeId);
  const assessorName = getEmployeeName(employeesById, assessment.assessorId);
  const targetLabel = assessment.target === 'self' ? 'Self review' : 'Peer review';
  return `${reviewPeriod?.key ?? 'Current'} ${targetLabel} for ${subjectName}`;
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

function buildAssessmentDetail(
  assessment: Assessment,
  snapshot: AssessmentWorkflowSnapshot,
  employeesById: Map<string, Employee>,
) {
  const subjectName = getEmployeeName(employeesById, assessment.employeeId);
  const complete = isAssessmentComplete(snapshot, assessment);

  switch (assessment.reviewState) {
    case 'new':
      return `Assigned for ${subjectName} and ready to start.`;
    case 'draft':
      return complete ? `Completed for ${subjectName} and ready to submit.` : `Draft in progress for ${subjectName}.`;
    case 'submitted':
      return `Submitted and waiting for manager or admin acceptance.`;
    case 'accepted':
      return `Accepted and ready for manager or admin review notes.`;
    case 'reviewed':
      return `Reviewed and kept for historical reference.`;
  }
}

function buildAssessmentStatusLabel(snapshot: AssessmentWorkflowSnapshot, assessment: Assessment) {
  if (assessment.reviewState === 'draft' && isAssessmentComplete(snapshot, assessment)) {
    return 'Ready to submit';
  }

  switch (assessment.reviewState) {
    case 'new':
      return 'Ready to start';
    case 'draft':
      return 'Draft';
    case 'submitted':
      return 'Submitted';
    case 'accepted':
      return 'Accepted';
    case 'reviewed':
      return 'Reviewed';
  }
}

function toAssessmentQueueItem(
  assessment: Assessment,
  snapshot: AssessmentWorkflowSnapshot,
  employeesById: Map<string, Employee>,
): AssessmentQueueItem {
  const readOnly = assessment.isReadOnly || assessment.archiveState === 'archived';

  return {
    assessmentId: assessment.id,
    title: buildAssessmentTitle(assessment, snapshot, employeesById),
    detail: buildAssessmentDetail(assessment, snapshot, employeesById),
    statusLabel: buildAssessmentStatusLabel(snapshot, assessment),
    actionLabel: readOnly || assessment.reviewState === 'submitted' ? 'View' : 'Edit',
  };
}

function toReviewQueueItem(
  assessment: Assessment,
  snapshot: AssessmentWorkflowSnapshot,
  employeesById: Map<string, Employee>,
): ReviewQueueItem {
  const subjectName = getEmployeeName(employeesById, assessment.employeeId);
  const assessorName = getEmployeeName(employeesById, assessment.assessorId);

  return {
    assessmentId: assessment.id,
    title: buildReviewTitle(assessment, snapshot, employeesById),
    detail: `${subjectName} • authored by ${assessorName}`,
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
  const authoredAssessments = orderAssessments(
    snapshot.assessments.filter((assessment) => assessment.assessorId === user.id && assessment.archiveState === 'active'),
    snapshot,
  );

  return [
    {
      id: 'ready',
      title: snapshot.reviewPeriods.find((reviewPeriod) => reviewPeriod.status === 'active')
        ? `Complete by ${formatDate(snapshot.reviewPeriods.find((reviewPeriod) => reviewPeriod.status === 'active')!.dueDate)}`
        : 'Ready to start',
      items: authoredAssessments
        .filter((assessment) => assessment.reviewState === 'new')
        .map((assessment) => toAssessmentQueueItem(assessment, snapshot, employeesById)),
    },
    {
      id: 'in-progress',
      title: 'Started but not completed',
      items: authoredAssessments
        .filter((assessment) => assessment.reviewState === 'draft' && !isAssessmentComplete(snapshot, assessment))
        .map((assessment) => toAssessmentQueueItem(assessment, snapshot, employeesById)),
    },
    {
      id: 'ready-to-submit',
      title: 'Complete but not submitted yet',
      items: authoredAssessments
        .filter((assessment) => assessment.reviewState === 'draft' && isAssessmentComplete(snapshot, assessment))
        .map((assessment) => toAssessmentQueueItem(assessment, snapshot, employeesById)),
    },
    {
      id: 'awaiting-acceptance',
      title: 'Complete but not accepted yet',
      items: authoredAssessments
        .filter((assessment) => assessment.reviewState === 'submitted')
        .map((assessment) => toAssessmentQueueItem(assessment, snapshot, employeesById)),
    },
    {
      id: 'complete',
      title: 'Complete',
      items: authoredAssessments
        .filter((assessment) => assessment.reviewState === 'accepted' || assessment.reviewState === 'reviewed')
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
  const directReportIds = new Set(
    employees.filter((employee) => employee.managerId === user.id).map((employee) => employee.id),
  );

  return orderAssessments(
    snapshot.assessments.filter((assessment) => {
      if (assessment.archiveState !== 'active') {
        return false;
      }

      if (user.role === 'admin') {
        return assessment.reviewState === 'submitted' || assessment.reviewState === 'accepted' || assessment.reviewState === 'reviewed';
      }

      return (
        directReportIds.has(assessment.employeeId) &&
        (assessment.reviewState === 'submitted' || assessment.reviewState === 'accepted' || assessment.reviewState === 'reviewed')
      );
    }),
    snapshot,
  );
}

export function buildReviewQueues(
  user: Employee,
  snapshot: AssessmentWorkflowSnapshot,
  employees: Employee[],
): ReviewQueueGroup[] {
  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));
  const reviewableAssessments = getReviewableAssessments(user, snapshot, employees);

  return [
    {
      id: 'submitted',
      title: 'Submitted and waiting for acceptance',
      items: reviewableAssessments
        .filter((assessment) => assessment.reviewState === 'submitted')
        .map((assessment) => toReviewQueueItem(assessment, snapshot, employeesById)),
    },
    {
      id: 'accepted',
      title: 'Accepted and waiting for final review',
      items: reviewableAssessments
        .filter((assessment) => assessment.reviewState === 'accepted')
        .map((assessment) => toReviewQueueItem(assessment, snapshot, employeesById)),
    },
    {
      id: 'reviewed',
      title: 'Reviewed',
      items: reviewableAssessments
        .filter((assessment) => assessment.reviewState === 'reviewed')
        .map((assessment) => toReviewQueueItem(assessment, snapshot, employeesById)),
    },
  ];
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
  const currentManagerId = employeesById.get(assessment.employeeId)?.managerId ?? null;

  return {
    assessmentId: assessment.id,
    title: buildReviewTitle(assessment, snapshot, employeesById),
    statusLabel: buildAssessmentStatusLabel(snapshot, assessment),
    detail: buildAssessmentDetail(assessment, snapshot, employeesById),
    targetLabel: assessment.target === 'self' ? 'Self assessment review' : 'Peer assessment review',
    reviewPeriodLabel: reviewPeriod?.label ?? 'Current review period',
    dueDate: reviewPeriod ? formatDate(reviewPeriod.dueDate) : 'Unknown due date',
    subjectName: getEmployeeName(employeesById, assessment.employeeId),
    assessorName: getEmployeeName(employeesById, assessment.assessorId),
    managerName: getEmployeeName(employeesById, currentManagerId),
    currentAssessorId: assessment.assessorId,
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
