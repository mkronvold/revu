import type {
  Assignment,
  Employee,
  LocalUsersExportMode,
  LocalUsersExportResponse,
  LocalUsersImportRequest,
  LocalUsersImportResponse,
  LocalUserTransferItem,
  ExportStubResponse,
  ImportStubResponse,
  QuestionSet,
  ReviewPeriod,
} from '@revu/contracts';
import { localUsersImportRequestSchema, localUserTransferItemSchema } from '@revu/contracts';

import {
  activateQuestionSet,
  archiveReviewPeriod,
  createAssignment,
  createQuestionSet,
  createReviewPeriod,
  deleteAssignment,
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
import type { QuestionSetDraft, ReviewAdminSnapshot, ReviewPeriodDraft } from './reviewAdmin';

export type TransferFormat = 'json' | 'csv';

type LocalUserTransferDraft = Omit<LocalUserTransferItem, 'passwordResetRequired'> & {
  passwordResetRequired?: boolean;
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
const localUserTransferHeaders = [...localUserTransferRequiredHeaders, 'credentialKind', 'passwordResetRequired'] as const;

function escapeCsvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function normalizeLocalUserTransferItems(items: LocalUserTransferDraft[]): LocalUserTransferItem[] {
  return items.map((item) => ({
    ...item,
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

export async function saveReviewPeriodToApi(token: string, draft: ReviewPeriodDraft): Promise<{
  notice: string;
  reviewPeriod: ReviewPeriod;
}> {
  const payload = {
    key: draft.key.trim(),
    label: draft.label.trim(),
    startDate: draft.startDate,
    dueDate: draft.dueDate,
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

export async function saveQuestionSetToApi(token: string, draft: QuestionSetDraft): Promise<{
  notice: string;
  questionSet: QuestionSet;
}> {
  const payload = {
    title: draft.title.trim(),
    headerMarkdown: draft.headerMarkdown,
    footerMarkdown: draft.footerMarkdown,
    questions: toQuestionInput(draft, { includeIds: Boolean(draft.id) }),
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

export async function copyQuestionSetToReviewPeriodInApi(
  token: string,
  sourceQuestionSet: QuestionSet,
  sourceReviewPeriod: ReviewPeriod,
  targetReviewPeriod: ReviewPeriod,
): Promise<{
  notice: string;
  questionSet: QuestionSet;
}> {
  const response = await createQuestionSet(token, targetReviewPeriod.id, {
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
        category: question.category,
        prompt: question.prompt,
      })),
  });

  return {
    questionSet: response.item,
    notice: `Copied the ${sourceQuestionSet.target} question set to ${targetReviewPeriod.label} as a draft.`,
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

export function buildLocalUsersImportPayload(format: TransferFormat, raw: string) {
  return format === 'csv' ? parseLocalUsersCsv(raw) : parseLocalUsersJson(raw, format);
}

export function buildLocalUsersImportPayloadFromFile(raw: string) {
  const trimmed = raw.trimStart();
  const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  return looksLikeJson ? parseLocalUsersJson(raw, 'json') : parseLocalUsersCsv(raw);
}

export function buildExportNotice(response: ExportStubResponse) {
  return `Prepared ${response.resource} ${response.format.toUpperCase()} export stub for ${response.itemCount} items.`;
}

export function buildImportNotice(response: ImportStubResponse) {
  return `${response.resource} import is still a stub. Supported formats: ${response.supportedFormats.join(', ')}.`;
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
