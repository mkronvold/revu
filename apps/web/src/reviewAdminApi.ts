import type {
  Assignment,
  Employee,
  ExportStubResponse,
  ImportStubResponse,
  QuestionSet,
  ReviewPeriod,
} from '@revu/contracts';

import {
  activateQuestionSet,
  archiveReviewPeriod,
  createAssignment,
  createQuestionSet,
  createReviewPeriod,
  deleteAssignment,
  exportAssignments,
  exportQuestionSets,
  importAssignments,
  importQuestionSets,
  unarchiveReviewPeriod,
  updateAssignment,
  updateEmployee,
  updateQuestionSet,
  updateReviewPeriod,
} from './api';
import type { QuestionSetDraft, ReviewAdminSnapshot, ReviewPeriodDraft } from './reviewAdmin';

export type TransferFormat = 'json' | 'csv';

function toQuestionInput(questionSetDraft: QuestionSetDraft) {
  return questionSetDraft.questions.map((question, index) => ({
    order: index + 1,
    type: question.type,
    category: question.category.trim() || null,
    prompt: question.prompt.trim(),
  }));
}

function findAssignment(
  reviewAdmin: ReviewAdminSnapshot,
  reviewPeriodId: string,
  employeeId: string,
): Assignment | null {
  return (
    reviewAdmin.assignments.find(
      (assignment) => assignment.reviewPeriodId === reviewPeriodId && assignment.employeeId === employeeId,
    ) ?? null
  );
}

function findEmployee(employees: Employee[], employeeId: string) {
  const employee = employees.find((candidate) => candidate.id === employeeId);
  if (!employee) {
    throw new Error('Employee could not be found in the assignment matrix.');
  }

  return employee;
}

export async function saveReviewPeriodToApi(token: string, draft: ReviewPeriodDraft): Promise<{
  notice: string;
  reviewPeriod: ReviewPeriod;
}> {
  const payload = {
    key: draft.key.trim(),
    label: draft.label.trim(),
    startDate: draft.startDate,
    dueDate: draft.dueDate,
  };

  const response = draft.id
    ? await updateReviewPeriod(token, draft.id, payload)
    : await createReviewPeriod(token, payload);

  return {
    reviewPeriod: response.item,
    notice: draft.id ? 'Saved review period changes to the API.' : 'Created the review period in the API.',
  };
}

export async function saveQuestionSetToApi(token: string, draft: QuestionSetDraft): Promise<{
  notice: string;
  questionSet: QuestionSet;
}> {
  const payload = {
    title: draft.title.trim(),
    headerMarkdown: draft.headerMarkdown,
    footerMarkdown: draft.footerMarkdown,
    questions: toQuestionInput(draft),
  };

  if (draft.id) {
    const response = await updateQuestionSet(token, draft.id, {
      ...payload,
      status: draft.status,
    });

    return {
      questionSet: response.item,
      notice: `Saved ${draft.target} question-set changes to the API.`,
    };
  }

  const created = await createQuestionSet(token, draft.reviewPeriodId, {
    target: draft.target,
    ...payload,
  });
  const questionSet = draft.status === 'active' ? (await activateQuestionSet(token, created.item.id)).item : created.item;

  return {
    questionSet,
    notice:
      draft.status === 'active'
        ? `Created and activated the ${draft.target} question set in the API.`
        : `Created the ${draft.target} question set in the API.`,
  };
}

export async function saveAssignmentToApi(options: {
  token: string;
  reviewAdmin: ReviewAdminSnapshot;
  employees: Employee[];
  reviewPeriodId: string;
  employeeId: string;
  managerId: string | null;
  assessorId: string | null;
}): Promise<{
  notice: string;
  relationships: { managerId: string | null; assessorId: string | null };
}> {
  const { token, reviewAdmin, employees, reviewPeriodId, employeeId, managerId, assessorId } = options;
  const existingAssignment = findAssignment(reviewAdmin, reviewPeriodId, employeeId);
  const employee = findEmployee(employees, employeeId);

  if (assessorId) {
    if (existingAssignment) {
      await updateAssignment(token, existingAssignment.id, { managerId, assessorId });
      return {
        notice: 'Saved assignment changes and kept the employee assessor aligned with the peer reviewer.',
        relationships: { managerId, assessorId },
      };
    }

    await createAssignment(token, reviewPeriodId, {
      employeeId,
      managerId,
      assessorId,
    });

    return {
      notice: 'Created the assignment and synced the employee assessor to the peer reviewer.',
      relationships: { managerId, assessorId },
    };
  }

  if (existingAssignment) {
    await deleteAssignment(token, existingAssignment.id);
  }

  if (employee.managerId !== managerId || employee.assessorId !== null) {
    await updateEmployee(token, employeeId, {
      managerId,
      assessorId: null,
    });
  }

  return {
    notice: existingAssignment
      ? 'Removed the assignment and cleared the employee assessor in the API.'
      : 'Saved the employee relationship updates in the API.',
    relationships: { managerId, assessorId: null },
  };
}

export async function toggleReviewPeriodArchiveInApi(
  token: string,
  reviewPeriodId: string,
  archived: boolean,
): Promise<{
  notice: string;
  reviewPeriod: ReviewPeriod;
}> {
  const response = archived
    ? await archiveReviewPeriod(token, reviewPeriodId)
    : await unarchiveReviewPeriod(token, reviewPeriodId);

  return {
    reviewPeriod: response.item,
    notice: archived
      ? 'Archived the review period in the API. Related question sets and assessments are now read-only.'
      : 'Unarchived the review period in the API and returned it to the active workspace.',
  };
}

export async function exportQuestionSetsFromApi(token: string, reviewPeriodId: string, format: TransferFormat) {
  return exportQuestionSets(token, reviewPeriodId, format);
}

export async function importQuestionSetsFromApi(token: string, reviewPeriodId: string, format: TransferFormat) {
  return importQuestionSets(token, reviewPeriodId, { format });
}

export async function exportAssignmentsFromApi(token: string, reviewPeriodId: string, format: TransferFormat) {
  return exportAssignments(token, reviewPeriodId, format);
}

export async function importAssignmentsFromApi(token: string, reviewPeriodId: string, format: TransferFormat) {
  return importAssignments(token, reviewPeriodId, { format });
}

export function buildExportNotice(response: ExportStubResponse) {
  return `Prepared ${response.resource} ${response.format.toUpperCase()} export stub for ${response.itemCount} items.`;
}

export function buildImportNotice(response: ImportStubResponse) {
  return `${response.resource} import is still a stub. Supported formats: ${response.supportedFormats.join(', ')}.`;
}
