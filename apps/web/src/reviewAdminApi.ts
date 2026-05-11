import type {
  Assignment,
  AssignmentsExportResponse,
  AssignmentsImportRequest,
  AssignmentsImportResponse,
  AssignmentTransferItem,
  Employee,
  LocalUsersExportMode,
  LocalUsersExportResponse,
  LocalUsersImportRequest,
  LocalUsersImportResponse,
  LocalUserTransferItem,
  QuestionSet,
  QuestionSetsImportRequest,
  QuestionSetsImportResponse,
  QuestionSetTransferItem,
  QuestionSetsExportResponse,
  ReviewPeriod,
} from '@revu/contracts';
import {
  assignmentTransferItemSchema,
  assignmentsImportRequestSchema,
  localUsersImportRequestSchema,
  localUserTransferItemSchema,
  questionSetTransferItemSchema,
  questionSetsImportRequestSchema,
} from '@revu/contracts';

import {
  activateQuestionSet,
  archiveReviewPeriod,
  clearReadyToStartAssessments,
  createAssignment,
  createQuestionSet,
  createReviewPeriod,
  deleteAssignment,
  deleteReviewPeriod,
  exportLocalUsers,
  exportAssignments,
  exportQuestionSets,
  importLocalUsers,
  importAssignments,
  importQuestionSets,
  syncAssessmentsToAssignments,
  unarchiveReviewPeriod,
  updateAssignment,
  updateEmployee,
  updateQuestionSet,
  updateReviewPeriod,
} from './api';
import { questionSetStatusEnabled } from './runtimeConfig';
import type { QuestionSetDraft, ReviewAdminSnapshot, ReviewPeriodDraft, ReviewPeriodSummary } from './reviewAdmin';

export type TransferFormat = 'json' | 'csv';

type LocalUserTransferDraft = Omit<LocalUserTransferItem, 'passwordResetRequired' | 'reviewer1Username' | 'reviewer2Username'> & {
  passwordResetRequired?: boolean;
  reviewer1Username?: string | null;
  reviewer2Username?: string | null;
};

const localUserTransferRequiredHeaders = [
  'username',
  'fullName',
  'email',
  'role',
  'status',
  'managerUsername',
  'assessor1Username',
  'assessor2Username',
  'password',
] as const;
const localUserTransferHeaders = [
  'username',
  'fullName',
  'email',
  'role',
  'status',
  'managerUsername',
  'assessor1Username',
  'assessor2Username',
  'reviewer1Username',
  'reviewer2Username',
  'password',
  'credentialKind',
  'passwordResetRequired',
] as const;
const questionSetExportHeaders = [
  'reviewPeriodId',
  'questionSetId',
  'target',
  'status',
  'title',
  'headerMarkdown',
  'footerMarkdown',
  'questionId',
  'questionOrder',
  'questionType',
  'questionCategory',
  'questionPrompt',
] as const;
const assignmentExportHeaders = [
  'reviewPeriodId',
  'assignmentId',
  'employeeUsername',
  'employeeFullName',
  'managerUsername',
  'managerFullName',
  'assessorUsername',
  'assessorFullName',
] as const;

function escapeCsvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function normalizeLocalUserTransferItems(items: LocalUserTransferDraft[]): LocalUserTransferItem[] {
  return items.map((item) => ({
    ...item,
    reviewer1Username: item.reviewer1Username ?? null,
    reviewer2Username: item.reviewer2Username ?? null,
    credentialKind: item.credentialKind ?? 'password',
    passwordResetRequired: item.passwordResetRequired ?? false,
  }));
}

function serializeLocalUsersAsCsv(items: LocalUserTransferDraft[]) {
  return [
    localUserTransferHeaders.join(','),
    ...normalizeLocalUserTransferItems(items).map((item) =>
      [
        item.username,
        item.fullName,
        item.email,
        item.role,
        item.status,
        item.managerUsername ?? '',
        item.assessor1Username ?? '',
        item.assessor2Username ?? '',
        item.reviewer1Username ?? '',
        item.reviewer2Username ?? '',
        item.password,
        item.credentialKind ?? 'password',
        String(item.passwordResetRequired),
      ]
        .map(escapeCsvCell)
        .join(','),
    ),
  ].join('\n');
}

function parseCsvRows(raw: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    const nextCharacter = raw[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += character;
  }

  if (inQuotes) {
    throw new Error('CSV import is missing a closing quote.');
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

function parseBooleanCell(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === '' || normalized === 'false') {
    return false;
  }

  throw new Error('CSV imports must use true or false for passwordResetRequired.');
}

function parseLocalUsersCsv(raw: string): LocalUsersImportRequest {
  const rows = parseCsvRows(raw.trim());
  if (rows.length < 2) {
    throw new Error('Paste a CSV export with a header row and at least one user.');
  }

  const [headerRow, ...dataRows] = rows;
  const headers = new Map(headerRow?.map((header, index) => [header.trim(), index]));
  for (const header of localUserTransferRequiredHeaders) {
    if (!headers.has(header)) {
      throw new Error(`CSV imports must include the ${header} column.`);
    }
  }

  const items = dataRows.map((row) =>
    localUserTransferItemSchema.parse({
      username: row[headers.get('username') ?? -1]?.trim(),
      fullName: row[headers.get('fullName') ?? -1]?.trim(),
      email: row[headers.get('email') ?? -1]?.trim(),
      role: row[headers.get('role') ?? -1]?.trim(),
      status: row[headers.get('status') ?? -1]?.trim(),
      managerUsername: row[headers.get('managerUsername') ?? -1]?.trim() || null,
      assessor1Username: row[headers.get('assessor1Username') ?? -1]?.trim() || null,
      assessor2Username: row[headers.get('assessor2Username') ?? -1]?.trim() || null,
      reviewer1Username: row[headers.get('reviewer1Username') ?? -1]?.trim() || null,
      reviewer2Username: row[headers.get('reviewer2Username') ?? -1]?.trim() || null,
      password: row[headers.get('password') ?? -1] ?? '',
      credentialKind: row[headers.get('credentialKind') ?? -1]?.trim() || undefined,
      passwordResetRequired: parseBooleanCell(row[headers.get('passwordResetRequired') ?? -1] ?? ''),
    }),
  );

  return localUsersImportRequestSchema.parse({
    format: 'csv',
    items,
  });
}

function parseLocalUsersJson(raw: string, preferredFormat: TransferFormat): LocalUsersImportRequest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Paste valid JSON before importing local users.');
  }

  const candidate =
    Array.isArray(parsed) ? { format: preferredFormat, items: parsed } : parsed && typeof parsed === 'object' ? parsed : null;

  if (!candidate || !('items' in candidate)) {
    throw new Error('JSON imports must be an array of users or an object with an items array.');
  }

  return localUsersImportRequestSchema.parse({
    format: 'format' in candidate && candidate.format === 'csv' ? 'csv' : preferredFormat,
    items: candidate.items,
  });
}

function parseJsonCandidate(raw: string, invalidMessage: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(invalidMessage);
  }
}

function normalizeQuestionSetTransferItem(item: unknown): QuestionSetTransferItem {
  const draft = item as Partial<QuestionSet> & {
    questions?: Array<{
      id?: string;
      order?: number;
      type?: QuestionSet['questions'][number]['type'];
      category?: string | null;
      prompt?: string;
    }>;
  };

  return questionSetTransferItemSchema.parse({
    id: typeof draft.id === 'string' ? draft.id : undefined,
    target: draft.target,
    status: draft.status,
    title: draft.title,
    headerMarkdown: draft.headerMarkdown ?? '',
    footerMarkdown: draft.footerMarkdown ?? '',
    questions: Array.isArray(draft.questions)
      ? draft.questions.map((question) => ({
          id: typeof question.id === 'string' ? question.id : undefined,
          order: question.order,
          type: question.type,
          category: question.category ?? null,
          prompt: question.prompt,
        }))
      : [],
  });
}

function parseQuestionSetsJson(raw: string, preferredFormat: TransferFormat): QuestionSetsImportRequest {
  const parsed = parseJsonCandidate(raw, 'Paste valid JSON before importing question sets.');
  const candidate =
    Array.isArray(parsed) ? { format: preferredFormat, items: parsed } : parsed && typeof parsed === 'object' ? parsed : null;

  if (!candidate || !('items' in candidate) || !Array.isArray(candidate.items)) {
    throw new Error('JSON imports must be an array of question sets or an object with an items array.');
  }

  return questionSetsImportRequestSchema.parse({
    format: 'format' in candidate && candidate.format === 'csv' ? 'csv' : preferredFormat,
    items: candidate.items.map(normalizeQuestionSetTransferItem),
  });
}

function parseQuestionSetsCsv(raw: string): QuestionSetsImportRequest {
  const rows = parseCsvRows(raw.trim());
  if (rows.length < 2) {
    throw new Error('Paste a CSV export with a header row and at least one question set.');
  }

  const [headerRow, ...dataRows] = rows;
  const headers = new Map(headerRow?.map((header, index) => [header.trim(), index]));
  for (const header of ['target', 'status', 'title', 'questionOrder', 'questionType', 'questionPrompt']) {
    if (!headers.has(header)) {
      throw new Error(`CSV imports must include the ${header} column.`);
    }
  }

  type QuestionSetTransferCsvDraft = {
    id?: string;
    target: string;
    status: string;
    title: string;
    headerMarkdown: string;
    footerMarkdown: string;
    questions: Array<{
      id?: string;
      order: number;
      type: QuestionSet['questions'][number]['type'];
      category: string | null;
      prompt: string;
    }>;
  };

  const items: QuestionSetTransferCsvDraft[] = [];
  const itemsByKey = new Map<string, QuestionSetTransferCsvDraft>();

  for (const row of dataRows) {
    const questionSetId = row[headers.get('questionSetId') ?? -1]?.trim() || '';
    const target = row[headers.get('target') ?? -1]?.trim();
    const title = row[headers.get('title') ?? -1]?.trim();
    const questionSetKey = questionSetId || `${target ?? ''}\u0000${title ?? ''}`;
    const existing =
      itemsByKey.get(questionSetKey) ??
      {
        id: questionSetId || undefined,
        target: target ?? '',
        status: row[headers.get('status') ?? -1]?.trim() ?? '',
        title: title ?? '',
        headerMarkdown: row[headers.get('headerMarkdown') ?? -1] ?? '',
        footerMarkdown: row[headers.get('footerMarkdown') ?? -1] ?? '',
        questions: [],
      };

    const prompt = row[headers.get('questionPrompt') ?? -1] ?? '';
    const type = row[headers.get('questionType') ?? -1]?.trim() ?? '';
    const orderCell = row[headers.get('questionOrder') ?? -1]?.trim() ?? '';
    const questionCellHasData = prompt.trim().length > 0 || type.length > 0 || orderCell.length > 0;

    if (questionCellHasData) {
      existing.questions.push({
        id: row[headers.get('questionId') ?? -1]?.trim() || undefined,
        order: Number.parseInt(orderCell, 10),
        type: row[headers.get('questionType') ?? -1]?.trim() as QuestionSet['questions'][number]['type'],
        category: row[headers.get('questionCategory') ?? -1]?.trim() || null,
        prompt,
      });
    }

    if (!itemsByKey.has(questionSetKey)) {
      itemsByKey.set(questionSetKey, existing);
      items.push(existing);
    }
  }

  return questionSetsImportRequestSchema.parse({
    format: 'csv',
    items,
  });
}

function normalizeAssignmentTransferItem(item: unknown): AssignmentTransferItem {
  const draft = item as Partial<AssignmentTransferItem>;
  return assignmentTransferItemSchema.parse({
    assignmentId: typeof draft.assignmentId === 'string' ? draft.assignmentId : undefined,
    employeeUsername: draft.employeeUsername,
    employeeFullName: draft.employeeFullName ?? '',
    managerUsername: draft.managerUsername ?? null,
    managerFullName: draft.managerFullName ?? null,
    assessorUsername: draft.assessorUsername,
    assessorFullName: draft.assessorFullName ?? '',
  });
}

function parseAssignmentsJson(raw: string, preferredFormat: TransferFormat): AssignmentsImportRequest {
  const parsed = parseJsonCandidate(raw, 'Paste valid JSON before importing assignments.');
  const candidate =
    Array.isArray(parsed) ? { format: preferredFormat, items: parsed } : parsed && typeof parsed === 'object' ? parsed : null;

  if (!candidate || !('items' in candidate) || !Array.isArray(candidate.items)) {
    throw new Error('JSON imports must be an array of assignments or an object with an items array.');
  }

  return assignmentsImportRequestSchema.parse({
    format: 'format' in candidate && candidate.format === 'csv' ? 'csv' : preferredFormat,
    items: candidate.items.map(normalizeAssignmentTransferItem),
  });
}

function parseAssignmentsCsv(raw: string): AssignmentsImportRequest {
  const rows = parseCsvRows(raw.trim());
  if (rows.length < 2) {
    throw new Error('Paste a CSV export with a header row and at least one assignment.');
  }

  const [headerRow, ...dataRows] = rows;
  const headers = new Map(headerRow?.map((header, index) => [header.trim(), index]));
  for (const header of ['employeeUsername', 'assessorUsername']) {
    if (!headers.has(header)) {
      throw new Error(`CSV imports must include the ${header} column.`);
    }
  }

  return assignmentsImportRequestSchema.parse({
    format: 'csv',
    items: dataRows.map((row) =>
      assignmentTransferItemSchema.parse({
        assignmentId: row[headers.get('assignmentId') ?? -1]?.trim() || undefined,
        employeeUsername: row[headers.get('employeeUsername') ?? -1]?.trim(),
        employeeFullName: row[headers.get('employeeFullName') ?? -1]?.trim() || '',
        managerUsername: row[headers.get('managerUsername') ?? -1]?.trim() || null,
        managerFullName: row[headers.get('managerFullName') ?? -1]?.trim() || null,
        assessorUsername: row[headers.get('assessorUsername') ?? -1]?.trim(),
        assessorFullName: row[headers.get('assessorFullName') ?? -1]?.trim() || '',
      }),
    ),
  });
}

function compactTimestamp(value: string) {
  return value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/u, 'Z');
}

function sanitizeFileLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'review-period';
}

function toQuestionInput(questionSetDraft: QuestionSetDraft, options?: { includeIds?: boolean }) {
  return questionSetDraft.questions.map((question, index) => ({
    ...(options?.includeIds ? { id: question.id } : {}),
    order: index + 1,
    type: question.type,
    category: question.category.trim() || null,
    prompt: question.prompt.trim(),
  }));
}

function replaceReviewPeriodText(value: string, sourceReviewPeriod: ReviewPeriod, targetReviewPeriod: ReviewPeriod) {
  let nextValue = value;

  if (sourceReviewPeriod.label && sourceReviewPeriod.label !== targetReviewPeriod.label) {
    nextValue = nextValue.replaceAll(sourceReviewPeriod.label, targetReviewPeriod.label);
  }

  if (sourceReviewPeriod.key && sourceReviewPeriod.key !== targetReviewPeriod.key) {
    nextValue = nextValue.replaceAll(sourceReviewPeriod.key, targetReviewPeriod.key);
  }

  return nextValue;
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

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
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
    assessmentDueDate: draft.assessmentDueDate,
    reviewDueDate: draft.reviewDueDate,
    status: draft.status,
  };

  const response = draft.id
    ? await updateReviewPeriod(token, draft.id, payload)
    : await createReviewPeriod(token, payload);

  return {
    reviewPeriod: response.item,
    notice: draft.id ? 'Saved review period changes to the API.' : 'Created the review period in the API.',
  };
}

export function buildDeleteReviewPeriodConfirmation(reviewPeriod: ReviewPeriod, summary: ReviewPeriodSummary) {
  const lines = [
    `Remove ${reviewPeriod.label}?`,
    '',
    'This permanently deletes:',
    '- 1 review period',
    `- ${pluralize(summary.questionSetCount, 'question set')}`,
    `- ${pluralize(summary.assessmentCount, 'assessment')}`,
    `- ${pluralize(summary.assignmentCount, 'assignment')} tied to this period`,
  ];

  if (reviewPeriod.status === 'active') {
    lines.push('', 'This is the active review period.');
  }

  lines.push('', 'This cannot be undone.');
  return lines.join('\n');
}

export async function deleteReviewPeriodFromApi(token: string, reviewPeriod: ReviewPeriod): Promise<{
  notice: string;
  reviewPeriodId: string;
}> {
  const response = await deleteReviewPeriod(token, reviewPeriod.id);

  return {
    reviewPeriodId: response.reviewPeriodId,
    notice: `Removed ${response.label}. Deleted ${pluralize(response.questionSetCount, 'question set')}, ${pluralize(response.assessmentCount, 'assessment')}, and ${pluralize(response.assignmentCount, 'assignment')} tied to that period.`,
  };
}

export async function saveQuestionSetToApi(token: string, draft: QuestionSetDraft): Promise<{
  notice: string;
  questionSet: QuestionSet;
}> {
  const nextStatus = questionSetStatusEnabled ? draft.status : 'active';
  const payload = {
    title: draft.title.trim(),
    headerMarkdown: draft.headerMarkdown,
    footerMarkdown: draft.footerMarkdown,
    questions: toQuestionInput(draft, { includeIds: Boolean(draft.id) }),
  };

  if (draft.id) {
    const response = await updateQuestionSet(token, draft.id, {
      ...payload,
      status: nextStatus,
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
  const questionSet =
    nextStatus === 'active' && created.item.status !== 'active'
      ? (await activateQuestionSet(token, created.item.id)).item
      : created.item;

  return {
    questionSet,
    notice:
      nextStatus === 'active'
        ? `Created and activated the ${draft.target} question set in the API.`
        : `Created the ${draft.target} question set in the API.`,
  };
}

export async function copyQuestionSetToReviewPeriodInApi(
  token: string,
  sourceQuestionSet: Pick<QuestionSet, 'target' | 'title' | 'headerMarkdown' | 'footerMarkdown'> & {
    questions: Array<Pick<QuestionSet['questions'][number], 'order' | 'type' | 'category' | 'prompt'>>;
  },
  sourceReviewPeriod: ReviewPeriod,
  targetReviewPeriod: ReviewPeriod,
): Promise<{
  notice: string;
  questionSet: QuestionSet;
}> {
  const created = await createQuestionSet(token, targetReviewPeriod.id, {
    target: sourceQuestionSet.target,
    title: replaceReviewPeriodText(sourceQuestionSet.title, sourceReviewPeriod, targetReviewPeriod),
    headerMarkdown: replaceReviewPeriodText(sourceQuestionSet.headerMarkdown, sourceReviewPeriod, targetReviewPeriod),
    footerMarkdown: replaceReviewPeriodText(sourceQuestionSet.footerMarkdown, sourceReviewPeriod, targetReviewPeriod),
    questions: sourceQuestionSet.questions
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((question, index) => ({
        order: index + 1,
        type: question.type,
        category: question.category?.trim() || null,
        prompt: question.prompt,
      })),
  });
  const questionSet =
    !questionSetStatusEnabled && created.item.status !== 'active'
      ? (await activateQuestionSet(token, created.item.id)).item
      : created.item;

  return {
    questionSet,
    notice: questionSetStatusEnabled
      ? `Copied the ${sourceQuestionSet.target} question set to ${targetReviewPeriod.label} as a draft.`
      : `Copied the ${sourceQuestionSet.target} question set to ${targetReviewPeriod.label} and made it active.`,
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
        notice: 'Saved assignment changes and kept the employee assessor 2 aligned with the peer reviewer.',
        relationships: { managerId, assessorId },
      };
    }

    await createAssignment(token, reviewPeriodId, {
      employeeId,
      managerId,
      assessorId,
    });

    return {
      notice: 'Created the assignment and synced employee assessor 2 to the peer reviewer.',
      relationships: { managerId, assessorId },
    };
  }

  if (existingAssignment) {
    await deleteAssignment(token, existingAssignment.id);
  }

  if (employee.managerId !== managerId || employee.assessor2Id !== null) {
    await updateEmployee(token, employeeId, {
      managerId,
      assessor2Id: null,
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
      : 'Unarchived the review period in the API and returned it to the inactive workspace.',
  };
}

export async function syncAssessmentsForReviewPeriod(token: string, reviewPeriodId: string) {
  return syncAssessmentsToAssignments(token, reviewPeriodId);
}

export async function clearReadyAssessmentsForReviewPeriod(token: string, reviewPeriodId: string) {
  return clearReadyToStartAssessments(token, reviewPeriodId);
}

export async function exportQuestionSetsFromApi(token: string, reviewPeriodId: string, format: TransferFormat) {
  return exportQuestionSets(token, reviewPeriodId, format);
}

export async function importQuestionSetsFromApi(token: string, reviewPeriodId: string, payload: QuestionSetsImportRequest) {
  return importQuestionSets(token, reviewPeriodId, payload);
}

export async function exportAssignmentsFromApi(token: string, reviewPeriodId: string, format: TransferFormat) {
  return exportAssignments(token, reviewPeriodId, format);
}

export async function importAssignmentsFromApi(token: string, reviewPeriodId: string, payload: AssignmentsImportRequest) {
  return importAssignments(token, reviewPeriodId, payload);
}

export async function exportLocalUsersFromApi(token: string, format: TransferFormat, mode: LocalUsersExportMode) {
  return exportLocalUsers(token, format, mode);
}

export async function importLocalUsersFromApi(token: string, payload: LocalUsersImportRequest) {
  return importLocalUsers(token, payload);
}

export function serializeLocalUsersTransfer(
  response: Pick<LocalUsersExportResponse, 'format' | 'mode'> & { items: LocalUserTransferDraft[] },
) {
  if (response.format === 'csv') {
    return serializeLocalUsersAsCsv(response.items);
  }

  return JSON.stringify(
    {
      format: response.format,
      mode: response.mode,
      items: normalizeLocalUserTransferItems(response.items),
    },
    null,
    2,
  );
}

export function serializeQuestionSetsTransfer(response: QuestionSetsExportResponse) {
  if (response.format === 'csv') {
    return [
      questionSetExportHeaders.join(','),
      ...response.items.flatMap((item) => {
        const questions = item.questions.length > 0 ? item.questions : [null];
        return questions.map((question) =>
          [
            item.reviewPeriodId,
            item.id,
            item.target,
            item.status,
            item.title,
            item.headerMarkdown,
            item.footerMarkdown,
            question?.id ?? '',
            question?.order?.toString() ?? '',
            question?.type ?? '',
            question?.category ?? '',
            question?.prompt ?? '',
          ]
            .map(escapeCsvCell)
            .join(','),
        );
      }),
    ].join('\n');
  }

  return JSON.stringify(response, null, 2);
}

export function serializeAssignmentsTransfer(response: AssignmentsExportResponse) {
  if (response.format === 'csv') {
    return [
      assignmentExportHeaders.join(','),
      ...response.items.map((item) =>
        [
          response.reviewPeriodId,
          item.assignmentId ?? '',
          item.employeeUsername,
          item.employeeFullName,
          item.managerUsername ?? '',
          item.managerFullName ?? '',
          item.assessorUsername,
          item.assessorFullName,
        ]
          .map(escapeCsvCell)
          .join(','),
      ),
    ].join('\n');
  }

  return JSON.stringify(response, null, 2);
}

export function buildQuestionSetExportFilename(
  reviewPeriod: Pick<ReviewPeriod, 'key' | 'label'>,
  response: Pick<QuestionSetsExportResponse, 'format' | 'exportedAt'>,
) {
  const baseLabel = sanitizeFileLabel(reviewPeriod.key || reviewPeriod.label);
  return `${baseLabel}-question-sets-${compactTimestamp(response.exportedAt)}.${response.format}`;
}

export function buildAssignmentsExportFilename(
  reviewPeriod: Pick<ReviewPeriod, 'key' | 'label'>,
  response: Pick<AssignmentsExportResponse, 'format' | 'exportedAt'>,
) {
  const baseLabel = sanitizeFileLabel(reviewPeriod.key || reviewPeriod.label);
  return `${baseLabel}-assignments-${compactTimestamp(response.exportedAt)}.${response.format}`;
}

export function buildLocalUsersImportPayload(format: TransferFormat, raw: string) {
  return format === 'csv' ? parseLocalUsersCsv(raw) : parseLocalUsersJson(raw, format);
}

export function buildLocalUsersImportPayloadFromFile(raw: string) {
  const trimmed = raw.trimStart();
  const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  return looksLikeJson ? parseLocalUsersJson(raw, 'json') : parseLocalUsersCsv(raw);
}

export function buildQuestionSetsImportPayload(format: TransferFormat, raw: string) {
  return format === 'csv' ? parseQuestionSetsCsv(raw) : parseQuestionSetsJson(raw, format);
}

export function buildAssignmentsImportPayload(format: TransferFormat, raw: string) {
  return format === 'csv' ? parseAssignmentsCsv(raw) : parseAssignmentsJson(raw, format);
}

export function buildQuestionSetExportNotice(response: Pick<QuestionSetsExportResponse, 'format' | 'itemCount'>) {
  return `Exported ${response.itemCount} question ${response.itemCount === 1 ? 'set' : 'sets'} as ${response.format.toUpperCase()}.`;
}

export function buildQuestionSetImportNotice(response: QuestionSetsImportResponse) {
  return `Imported ${response.itemCount} question ${response.itemCount === 1 ? 'set' : 'sets'} (${response.createdCount} created, ${response.updatedCount} updated).`;
}

export function buildAssignmentsExportNotice(response: Pick<AssignmentsExportResponse, 'format' | 'itemCount'>) {
  return `Exported ${response.itemCount} assignment ${response.itemCount === 1 ? 'row' : 'rows'} as ${response.format.toUpperCase()}.`;
}

export function buildAssignmentsImportNotice(response: AssignmentsImportResponse) {
  return `Imported ${response.itemCount} assignment ${response.itemCount === 1 ? 'row' : 'rows'} (${response.createdCount} created, ${response.updatedCount} updated).`;
}

export function buildLocalUsersExportNotice(response: Pick<LocalUsersExportResponse, 'format' | 'itemCount' | 'mode'>) {
  return response.mode === 'rotate-passcodes'
    ? `Exported ${response.itemCount} local users as ${response.format.toUpperCase()}. Every exported account now uses a generated one-time passcode and must change it after sign-in.`
    : `Exported ${response.itemCount} local users as ${response.format.toUpperCase()}. Passwords and active sessions were left untouched.`;
}

export function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function buildLocalUsersImportNotice(response: LocalUsersImportResponse) {
  const resetCount = response.items.filter((item) => item.auth.passwordResetRequired).length;
  const resetSummary = resetCount
    ? `${resetCount} imported ${resetCount === 1 ? 'account' : 'accounts'} still require a one-time passcode change.`
    : 'Imported credentials are ready for immediate sign-in.';
  return `Imported ${response.itemCount} local users (${response.createdCount} created, ${response.updatedCount} updated). ${resetSummary}`;
}
