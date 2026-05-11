import type {
  Assignment,
  Assessment,
  Employee,
  FoundationSnapshot,
  Question,
  QuestionSet,
  QuestionSetStatus,
  QuestionTarget,
  ReviewPeriod,
} from '@revu/contracts';
import { foundationSnapshotExample } from '@revu/contracts';

export type ReviewAdminSnapshot = Pick<
  FoundationSnapshot,
  'reviewPeriods' | 'questionSets' | 'assignments' | 'assessments'
>;

export type ReviewPeriodDraft = {
  id: string | null;
  key: string;
  label: string;
  startDate: string;
  dueDate: string;
  assessmentDueDate: string;
  reviewDueDate: string;
  status: Exclude<ReviewPeriod["status"], "archived">;
};

export type QuestionDraft = {
  id: string;
  order: number;
  type: Question['type'];
  category: string;
  prompt: string;
};

export type QuestionSetDraft = {
  id: string | null;
  reviewPeriodId: string;
  target: QuestionTarget;
  title: string;
  status: QuestionSetStatus;
  headerMarkdown: string;
  footerMarkdown: string;
  questions: QuestionDraft[];
};

export type AssignmentRow = {
  employeeId: string;
  employeeName: string;
  managerId: string | null;
  assessorId: string | null;
};

export type ReviewPeriodSummary = {
  questionSetCount: number;
  activeQuestionSetCount: number;
  assignmentCount: number;
  assessmentCount: number;
  archivedAssessmentCount: number;
  completedAssessmentCount: number;
};

type MutationOptions = {
  now?: string;
  actorId?: string | null;
  makeId?: () => string;
};

function cloneReviewPeriod(period: ReviewPeriod): ReviewPeriod {
  return { ...period };
}

function cloneQuestionSet(questionSet: QuestionSet): QuestionSet {
  return {
    ...questionSet,
    questions: questionSet.questions.map((question) => ({ ...question })),
  };
}

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

function nextId(makeId?: () => string) {
  if (makeId) {
    return makeId();
  }

  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `local-${Math.random().toString(36).slice(2, 12)}`;
}

export function createReviewAdminSnapshot(foundation?: FoundationSnapshot | null): ReviewAdminSnapshot {
  const source = foundation ?? foundationSnapshotExample;

  return {
    reviewPeriods: source.reviewPeriods.map(cloneReviewPeriod),
    questionSets: source.questionSets.map(cloneQuestionSet),
    assignments: source.assignments.map(cloneAssignment),
    assessments: source.assessments.map(cloneAssessment),
  };
}

export function getPreferredReviewPeriodId(reviewPeriods: ReviewPeriod[], currentId: string | null) {
  if (currentId && reviewPeriods.some((period) => period.id === currentId)) {
    return currentId;
  }

  return reviewPeriods.find((period) => period.status === 'active')?.id ?? reviewPeriods[0]?.id ?? null;
}

export function toReviewPeriodDraft(reviewPeriod?: ReviewPeriod, defaultStatus: ReviewPeriodDraft['status'] = 'inactive'): ReviewPeriodDraft {
  return reviewPeriod
    ? {
        id: reviewPeriod.id,
        key: reviewPeriod.key,
        label: reviewPeriod.label,
        startDate: reviewPeriod.startDate,
        dueDate: reviewPeriod.dueDate,
        assessmentDueDate: reviewPeriod.assessmentDueDate,
        reviewDueDate: reviewPeriod.reviewDueDate,
        status: reviewPeriod.status === "archived" ? "inactive" : reviewPeriod.status,
      }
    : {
        id: null,
        key: '',
        label: '',
        startDate: '',
        dueDate: '',
        assessmentDueDate: '',
        reviewDueDate: '',
        status: defaultStatus,
      };
}

export function toQuestionSetDraft(
  reviewPeriodId: string,
  target: QuestionTarget,
  questionSet?: QuestionSet,
  options: MutationOptions = {},
): QuestionSetDraft {
  return questionSet
    ? {
        id: questionSet.id,
        reviewPeriodId: questionSet.reviewPeriodId,
        target: questionSet.target,
        title: questionSet.title,
        status: questionSet.status,
        headerMarkdown: questionSet.headerMarkdown,
        footerMarkdown: questionSet.footerMarkdown,
        questions: questionSet.questions.map((question) => ({
          ...question,
          category: question.category ?? '',
        })),
      }
    : {
        id: null,
        reviewPeriodId,
        target,
        title: target === 'self' ? 'Self questions' : 'Peer questions',
        status: 'draft',
        headerMarkdown: '',
        footerMarkdown: '',
        questions: [
          {
            id: nextId(options.makeId),
            order: 1,
            type: target === 'self' ? 'subjective' : 'ranking',
            category: '',
            prompt: '',
          },
        ],
      };
}

export function upsertReviewPeriod(
  snapshot: ReviewAdminSnapshot,
  draft: ReviewPeriodDraft,
  options: MutationOptions = {},
) {
  const timestamp = nextTimestamp(options.now);
  const existing = draft.id ? snapshot.reviewPeriods.find((period) => period.id === draft.id) : null;
  const reviewPeriodId = existing?.id ?? nextId(options.makeId);
  const nextReviewPeriod: ReviewPeriod = {
    id: reviewPeriodId,
    key: draft.key.trim(),
    label: draft.label.trim(),
    startDate: draft.startDate,
    dueDate: draft.dueDate,
    assessmentDueDate: draft.assessmentDueDate,
    reviewDueDate: draft.reviewDueDate,
    status: draft.status,
    archivedAt: null,
    archivedByEmployeeId: null,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  const nextReviewPeriods = existing
    ? snapshot.reviewPeriods.map((period) => (period.id === reviewPeriodId ? nextReviewPeriod : cloneReviewPeriod(period)))
    : [...snapshot.reviewPeriods.map(cloneReviewPeriod), nextReviewPeriod];

  return {
    reviewPeriodId,
    snapshot: {
      ...snapshot,
      reviewPeriods: nextReviewPeriods
        .map((period) =>
          nextReviewPeriod.status === 'active' && period.id !== reviewPeriodId && period.status === 'active'
            ? {
                ...period,
                status: 'inactive',
                archivedAt: null,
                archivedByEmployeeId: null,
                updatedAt: timestamp,
              }
            : period,
        )
        .sort((left, right) => right.key.localeCompare(left.key)),
    },
  };
}

export function upsertQuestionSet(
  snapshot: ReviewAdminSnapshot,
  draft: QuestionSetDraft,
  options: MutationOptions = {},
) {
  const timestamp = nextTimestamp(options.now);
  const existing = draft.id ? snapshot.questionSets.find((questionSet) => questionSet.id === draft.id) : null;
  const questionSetId = existing?.id ?? nextId(options.makeId);
  const reviewPeriod = snapshot.reviewPeriods.find((period) => period.id === draft.reviewPeriodId);
  const nextQuestionSet: QuestionSet = {
    id: questionSetId,
    reviewPeriodId: draft.reviewPeriodId,
    target: draft.target,
    status: draft.status,
    isReadOnly: reviewPeriod?.status === 'archived',
    title: draft.title.trim(),
    headerMarkdown: draft.headerMarkdown,
    footerMarkdown: draft.footerMarkdown,
    questions: draft.questions.map((question, index) => ({
      id: question.id || nextId(options.makeId),
      order: index + 1,
      type: question.type,
      category: question.category.trim() || null,
      prompt: question.prompt.trim(),
    })),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  return {
    questionSetId,
    snapshot: {
      ...snapshot,
      questionSets: [
        ...snapshot.questionSets.filter(
          (questionSet) => !(questionSet.reviewPeriodId === draft.reviewPeriodId && questionSet.target === draft.target),
        ),
        nextQuestionSet,
      ].sort((left, right) => {
        if (left.reviewPeriodId === right.reviewPeriodId) {
          return left.target.localeCompare(right.target);
        }

        return left.reviewPeriodId.localeCompare(right.reviewPeriodId);
      }),
    },
  };
}

export function updateAssignment(
  snapshot: ReviewAdminSnapshot,
  reviewPeriodId: string,
  employeeId: string,
  managerId: string | null,
  assessorId: string | null,
  options: MutationOptions = {},
) {
  const timestamp = nextTimestamp(options.now);
  const existing = snapshot.assignments.find(
    (assignment) => assignment.reviewPeriodId === reviewPeriodId && assignment.employeeId === employeeId,
  );
  const nextAssignments = assessorId
    ? existing
      ? snapshot.assignments.map((assignment) =>
          assignment.id === existing.id
            ? {
                ...assignment,
                managerId,
                assessorId,
                updatedAt: timestamp,
              }
            : cloneAssignment(assignment),
        )
      : [
          ...snapshot.assignments.map(cloneAssignment),
          {
            id: nextId(options.makeId),
            reviewPeriodId,
            employeeId,
            managerId,
            assessorId,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ]
    : snapshot.assignments
        .filter((assignment) => !(assignment.reviewPeriodId === reviewPeriodId && assignment.employeeId === employeeId))
        .map(cloneAssignment);

  return {
    ...snapshot,
    assignments: nextAssignments,
  };
}

export function setReviewPeriodArchived(
  snapshot: ReviewAdminSnapshot,
  reviewPeriodId: string,
  archived: boolean,
  options: MutationOptions = {},
): ReviewAdminSnapshot {
  const timestamp = nextTimestamp(options.now);

  return {
    ...snapshot,
    reviewPeriods: snapshot.reviewPeriods.map((period) =>
      period.id === reviewPeriodId
        ? {
            ...period,
            status: archived ? 'archived' : 'inactive',
            archivedAt: archived ? timestamp : null,
            archivedByEmployeeId: archived ? options.actorId ?? null : null,
            updatedAt: timestamp,
          }
        : cloneReviewPeriod(period),
    ),
    questionSets: snapshot.questionSets.map((questionSet) =>
      questionSet.reviewPeriodId === reviewPeriodId
        ? {
            ...cloneQuestionSet(questionSet),
            isReadOnly: archived,
            updatedAt: timestamp,
          }
        : cloneQuestionSet(questionSet),
    ),
    assignments: snapshot.assignments.map(cloneAssignment),
    assessments: snapshot.assessments.map((assessment) =>
      assessment.reviewPeriodId === reviewPeriodId
        ? {
            ...cloneAssessment(assessment),
            archiveState: archived ? 'archived' : 'active',
            isReadOnly: archived || assessment.reviewState !== 'draft' ? assessment.isReadOnly || archived : archived,
            updatedAt: timestamp,
          }
        : cloneAssessment(assessment),
    ),
  };
}

export function buildAssignmentRows(
  reviewPeriodId: string,
  employees: Employee[],
  assignments: Assignment[],
): AssignmentRow[] {
  return employees
    .filter((employee) => employee.status === 'active')
    .map((employee) => {
      const assignment = assignments.find(
        (candidate) => candidate.reviewPeriodId === reviewPeriodId && candidate.employeeId === employee.id,
      );

      return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        managerId: assignment?.managerId ?? employee.managerId,
        assessorId: assignment?.assessorId ?? employee.assessor2Id,
      };
    })
    .sort((left, right) => left.employeeName.localeCompare(right.employeeName));
}

export function getReviewPeriodSummary(snapshot: ReviewAdminSnapshot, reviewPeriodId: string): ReviewPeriodSummary {
  const questionSets = snapshot.questionSets.filter((questionSet) => questionSet.reviewPeriodId === reviewPeriodId);
  const assessments = snapshot.assessments.filter((assessment) => assessment.reviewPeriodId === reviewPeriodId);

  return {
    questionSetCount: questionSets.length,
    activeQuestionSetCount: questionSets.filter((questionSet) => questionSet.status === 'active').length,
    assignmentCount: snapshot.assignments.filter((assignment) => assignment.reviewPeriodId === reviewPeriodId).length,
    assessmentCount: assessments.length,
    archivedAssessmentCount: assessments.filter((assessment) => assessment.archiveState === 'archived').length,
    completedAssessmentCount: assessments.filter(
      (assessment) => assessment.reviewState === 'concluded' || assessment.reviewState === 'reviewed',
    ).length,
  };
}

export function getReviewPeriodQuestionSet(
  snapshot: ReviewAdminSnapshot,
  reviewPeriodId: string,
  target: QuestionTarget,
) {
  return (
    [...snapshot.questionSets]
      .filter((questionSet) => questionSet.reviewPeriodId === reviewPeriodId && questionSet.target === target)
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === 'active' ? -1 : 1;
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      })[0] ?? null
  );
}
