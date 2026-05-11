import {
  acceptAssessmentRequestSchema,
  adminUpdateAssessmentRequestSchema,
  apiIndexResponseSchema,
  assessmentItemResponseSchema,
  assessmentSetRequestSchema,
  assessmentSetResponseSchema,
  assessmentReassignmentResponseSchema,
  assessmentsListQuerySchema,
  assessmentsListResponseSchema,
  assignmentResponseSchema,
  assignmentsExportResponseSchema,
  assignmentsImportRequestSchema,
  assignmentsImportResponseSchema,
  backupExportResponseSchema,
  backupStoredFileDeleteResponseSchema,
  backupStoredFileResponseSchema,
  backupStoredFilesResponseSchema,
  backupStoredFileRestoreRequestSchema,
  backupRestoreResponseSchema,
  backupStatusResponseSchema,
  clearReadyAssessmentsResponseSchema,
  concludeAssessmentRequestSchema,
  updateBackupStatusRequestSchema,
  updateQuestionCategoriesRequestSchema,
  authChangePasswordRequestSchema,
  authChangePasswordResponseSchema,
  authLoginResponseSchema,
  authLogoutResponseSchema,
  authMeResponseSchema,
  authUpdateProfileRequestSchema,
  authUpdateProfileResponseSchema,
  createAssessmentRequestSchema,
  createAssignmentRequestSchema,
  createEmployeeRequestSchema,
  createQuestionSetRequestSchema,
  createReviewPeriodRequestSchema,
  deleteAssignmentResponseSchema,
  deleteAssessmentResponseSchema,
  deleteEmployeeResponseSchema,
  deleteReviewPeriodResponseSchema,
  employeeResponseSchema,
  employeesListResponseSchema,
  foundationSnapshotSchema,
  localUsersExportResponseSchema,
  localUsersImportRequestSchema,
  localUsersImportResponseSchema,
  questionCategoriesListResponseSchema,
  questionSetsExportResponseSchema,
  questionSetsImportRequestSchema,
  questionSetsImportResponseSchema,
  questionSetResponseSchema,
  rejectAssessmentToDraftRequestSchema,
  resetEmployeePasswordRequestSchema,
  resetEmployeePasswordResponseSchema,
  reassignAssessmentRequestSchema,
  setEmployeePasswordRequestSchema,
  setEmployeePasswordResponseSchema,
  reviewPeriodResponseSchema,
  saveAssessmentDraftRequestSchema,
  submitAssessmentRequestSchema,
  syncAssessmentsResponseSchema,
  updateAssignmentRequestSchema,
  updateEmployeeRequestSchema,
  updateQuestionSetRequestSchema,
  updateReviewPeriodRequestSchema,
  updateWorkflowSettingsRequestSchema,
  workflowSettingsResponseSchema,
  type AcceptAssessmentRequest,
  type AdminUpdateAssessmentRequest,
  type AssessmentSetRequest,
  type AssessmentsListQuery,
  type AuthLoginRequest,
  type AuthChangePasswordRequest,
  type AuthUpdateProfileRequest,
  type BackupRestoreMode,
  type BackupRestoreScope,
  type BackupStoredFileRestoreRequest,
  type ConcludeAssessmentRequest,
  type CreateAssessmentRequest,
  type CreateAssignmentRequest,
  type CreateEmployeeRequest,
  type CreateQuestionSetRequest,
  type CreateReviewPeriodRequest,
  type AssignmentsImportRequest,
  type LocalUsersExportMode,
  type LocalUsersImportRequest,
  type QuestionSetsImportRequest,
  type RejectAssessmentToDraftRequest,
  type ReassignAssessmentRequest,
  type ResetEmployeePasswordRequest,
  type SaveAssessmentDraftRequest,
  type SetEmployeePasswordRequest,
  type SubmitAssessmentRequest,
  type UpdateBackupStatusRequest,
  type UpdateAssignmentRequest,
  type UpdateEmployeeRequest,
  type UpdateQuestionCategoriesRequest,
  type UpdateQuestionSetRequest,
  type UpdateReviewPeriodRequest,
  type UpdateWorkflowSettingsRequest,
} from '@revu/contracts';
import { z } from 'zod';

const errorResponseSchema = z.object({
  message: z.string().min(1),
});

const defaultApiBaseUrl = '/api/v1';
const configuredApiBaseUrl =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : defaultApiBaseUrl;

export const apiBaseUrl = configuredApiBaseUrl.replace(/\/$/, '');
export const apiUnavailableEventName = 'revu:api-unavailable';

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

type ExportFormat = 'json' | 'csv';

function notifyApiUnavailable() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(apiUnavailableEventName));
}

function shouldTreatResponseAsApiUnavailable(statusCode: number) {
  return statusCode === 502 || statusCode === 503 || statusCode === 504;
}

function getHealthCheckUrl() {
  if (typeof window === 'undefined') {
    return '/health';
  }

  const resolvedApiBaseUrl = new URL(apiBaseUrl, window.location.origin);
  return new URL('/health', resolvedApiBaseUrl).toString();
}

function isFormDataBody(body: RequestInit['body']) {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body && !isFormDataBody(init.body) ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    notifyApiUnavailable();
    throw error;
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    if (shouldTreatResponseAsApiUnavailable(response.status)) {
      notifyApiUnavailable();
    }
    const parsedError = errorResponseSchema.safeParse(payload);
    throw new ApiClientError(parsedError.success ? parsedError.data.message : 'Request failed', response.status);
  }

  return schema.parse(payload);
}

async function requestText(path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body && !isFormDataBody(init.body) ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    notifyApiUnavailable();
    throw error;
  }

  const rawText = await response.text();
  if (!response.ok) {
    if (shouldTreatResponseAsApiUnavailable(response.status)) {
      notifyApiUnavailable();
    }
    const payload = rawText
      ? (() => {
          try {
            return JSON.parse(rawText);
          } catch {
            return null;
          }
        })()
      : null;
    const parsedError = errorResponseSchema.safeParse(payload);
    throw new ApiClientError(parsedError.success ? parsedError.data.message : 'Request failed', response.status);
  }

  const filenameMatch = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/i);
  return {
    content: rawText,
    filename: filenameMatch?.[1] ?? null,
  };
}

export async function checkApiHealth() {
  try {
    const response = await fetch(getHealthCheckUrl(), {
      cache: 'no-store',
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json().catch(() => null)) as { status?: string } | null;
    return payload?.status === 'ok';
  } catch {
    return false;
  }
}

function withAuthorization(token: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  };
}

function withSearchParams(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function login(payload: AuthLoginRequest) {
  return request(
    '/auth/login',
    authLoginResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function getApiIndex() {
  return request('', apiIndexResponseSchema);
}

export function me(token: string) {
  return request('/auth/me', authMeResponseSchema, withAuthorization(token));
}

export function logout(token: string) {
  return request(
    '/auth/logout',
    authLogoutResponseSchema,
    withAuthorization(token, {
      method: 'POST',
    }),
  );
}

export function changePassword(token: string, payload: AuthChangePasswordRequest) {
  return request(
    '/auth/password/change',
    authChangePasswordResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(authChangePasswordRequestSchema.parse(payload)),
    }),
  );
}

export function updateOwnProfile(token: string, payload: AuthUpdateProfileRequest) {
  return request(
    '/auth/me',
    authUpdateProfileResponseSchema,
    withAuthorization(token, {
      method: 'PATCH',
      body: JSON.stringify(authUpdateProfileRequestSchema.parse(payload)),
    }),
  );
}

export function getFoundation(token: string) {
  return request('/foundation', foundationSnapshotSchema, withAuthorization(token, { cache: 'no-store' }));
}

export function updateWorkflowSettings(token: string, payload: UpdateWorkflowSettingsRequest) {
  return request(
    '/workflow-settings',
    workflowSettingsResponseSchema,
    withAuthorization(token, {
      method: 'PATCH',
      body: JSON.stringify(updateWorkflowSettingsRequestSchema.parse(payload)),
    }),
  );
}

export function listEmployees(token: string) {
  return request('/employees', employeesListResponseSchema, withAuthorization(token));
}

export function getEmployee(token: string, employeeId: string) {
  return request(`/employees/${employeeId}`, employeeResponseSchema, withAuthorization(token));
}

export function exportLocalUsers(token: string, format: ExportFormat, mode: LocalUsersExportMode = 'rotate-passcodes') {
  return request(
    withSearchParams('/employees/export', { format, mode }),
    localUsersExportResponseSchema,
    withAuthorization(token),
  );
}

export function getBackupStatus(token: string) {
  return request('/admin/backups/status', backupStatusResponseSchema, withAuthorization(token));
}

export function updateBackupStatus(token: string, payload: UpdateBackupStatusRequest) {
  return request(
    '/admin/backups/status',
    backupStatusResponseSchema,
    withAuthorization(token, {
      method: 'PATCH',
      body: JSON.stringify(updateBackupStatusRequestSchema.parse(payload)),
    }),
  );
}

export function exportBackup(token: string, mode: LocalUsersExportMode = 'preserve-passwords') {
  return request(
    withSearchParams('/admin/backups/export', { mode }),
    backupExportResponseSchema,
    withAuthorization(token),
  );
}

export function listStoredBackups(token: string) {
  return request('/admin/backups/files', backupStoredFilesResponseSchema, withAuthorization(token));
}

export function createStoredBackup(token: string) {
  return request(
    '/admin/backups/files/create',
    backupStoredFileResponseSchema,
    withAuthorization(token, {
      method: 'POST',
    }),
  );
}

export function uploadStoredBackup(token: string, file: File) {
  const formData = new FormData();
  formData.set('file', file, file.name);
  return request(
    '/admin/backups/files/upload',
    backupStoredFileResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: formData,
    }),
  );
}

export function downloadStoredBackup(token: string, fileName: string, mode: LocalUsersExportMode = 'preserve-passwords') {
  return requestText(
    withSearchParams(`/admin/backups/files/${encodeURIComponent(fileName)}/download`, { mode }),
    withAuthorization(token),
  );
}

export function restoreStoredBackup(token: string, fileName: string, payload: BackupStoredFileRestoreRequest) {
  return request(
    `/admin/backups/files/${encodeURIComponent(fileName)}/restore`,
    backupRestoreResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(backupStoredFileRestoreRequestSchema.parse(payload)),
    }),
  );
}

export function deleteStoredBackup(token: string, fileName: string) {
  return request(
    `/admin/backups/files/${encodeURIComponent(fileName)}`,
    backupStoredFileDeleteResponseSchema,
    withAuthorization(token, {
      method: 'DELETE',
    }),
  );
}

export function restoreBackup(
  token: string,
  payload: {
    file: File;
    target: BackupRestoreScope;
    mode: BackupRestoreMode;
  },
) {
  const formData = new FormData();
  formData.set('file', payload.file, payload.file.name);
  formData.set('target', payload.target);
  formData.set('mode', payload.mode);

  return request(
    '/admin/backups/restore',
    backupRestoreResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: formData,
    }),
  );
}

export function importLocalUsers(token: string, payload: LocalUsersImportRequest) {
  return request(
    '/employees/import',
    localUsersImportResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(localUsersImportRequestSchema.parse(payload)),
    }),
  );
}

export function createEmployee(token: string, payload: CreateEmployeeRequest) {
  return request(
    '/employees',
    employeeResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(createEmployeeRequestSchema.parse(payload)),
    }),
  );
}

export function updateEmployee(token: string, employeeId: string, payload: UpdateEmployeeRequest) {
  return request(
    `/employees/${employeeId}`,
    employeeResponseSchema,
    withAuthorization(token, {
      method: 'PATCH',
      body: JSON.stringify(updateEmployeeRequestSchema.parse(payload)),
    }),
  );
}

export function deleteEmployee(token: string, employeeId: string) {
  return request(
    `/employees/${employeeId}`,
    deleteEmployeeResponseSchema,
    withAuthorization(token, {
      method: 'DELETE',
    }),
  );
}

export function setEmployeePassword(token: string, employeeId: string, payload: SetEmployeePasswordRequest) {
  return request(
    `/employees/${employeeId}/password/set`,
    setEmployeePasswordResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(setEmployeePasswordRequestSchema.parse(payload)),
    }),
  );
}

export function resetEmployeePassword(token: string, employeeId: string, payload: ResetEmployeePasswordRequest = {}) {
  return request(
    `/employees/${employeeId}/password/reset`,
    resetEmployeePasswordResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(resetEmployeePasswordRequestSchema.parse(payload)),
      }),
  );
}

export function createReviewPeriod(token: string, payload: CreateReviewPeriodRequest) {
  return request(
    '/review-periods',
    reviewPeriodResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(createReviewPeriodRequestSchema.parse(payload)),
    }),
  );
}

export function updateReviewPeriod(token: string, reviewPeriodId: string, payload: UpdateReviewPeriodRequest) {
  return request(
    `/review-periods/${reviewPeriodId}`,
    reviewPeriodResponseSchema,
    withAuthorization(token, {
      method: 'PATCH',
      body: JSON.stringify(updateReviewPeriodRequestSchema.parse(payload)),
    }),
  );
}

export function deleteReviewPeriod(token: string, reviewPeriodId: string) {
  return request(
    `/review-periods/${reviewPeriodId}`,
    deleteReviewPeriodResponseSchema,
    withAuthorization(token, {
      method: 'DELETE',
    }),
  );
}

export function archiveReviewPeriod(token: string, reviewPeriodId: string) {
  return request(
    `/review-periods/${reviewPeriodId}/archive`,
    reviewPeriodResponseSchema,
    withAuthorization(token, {
      method: 'POST',
    }),
  );
}

export function unarchiveReviewPeriod(token: string, reviewPeriodId: string) {
  return request(
    `/review-periods/${reviewPeriodId}/unarchive`,
    reviewPeriodResponseSchema,
    withAuthorization(token, {
      method: 'POST',
    }),
  );
}

export function syncAssessmentsToAssignments(token: string, reviewPeriodId: string) {
  return request(
    `/review-periods/${reviewPeriodId}/sync-assessments`,
    syncAssessmentsResponseSchema,
    withAuthorization(token, {
      method: 'POST',
    }),
  );
}

export function clearReadyToStartAssessments(token: string, reviewPeriodId: string) {
  return request(
    `/review-periods/${reviewPeriodId}/clear-ready-assessments`,
    clearReadyAssessmentsResponseSchema,
    withAuthorization(token, {
      method: 'POST',
    }),
  );
}

export function createQuestionSet(token: string, reviewPeriodId: string, payload: CreateQuestionSetRequest) {
  return request(
    `/review-periods/${reviewPeriodId}/question-sets`,
    questionSetResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(createQuestionSetRequestSchema.parse(payload)),
    }),
  );
}

export function updateQuestionSet(token: string, questionSetId: string, payload: UpdateQuestionSetRequest) {
  return request(
    `/question-sets/${questionSetId}`,
    questionSetResponseSchema,
    withAuthorization(token, {
      method: 'PATCH',
      body: JSON.stringify(updateQuestionSetRequestSchema.parse(payload)),
    }),
  );
}

export function activateQuestionSet(token: string, questionSetId: string) {
  return request(
    `/question-sets/${questionSetId}/activate`,
    questionSetResponseSchema,
    withAuthorization(token, {
      method: 'POST',
    }),
  );
}

export function exportQuestionSets(token: string, reviewPeriodId: string, format: ExportFormat) {
  return request(
    withSearchParams(`/review-periods/${reviewPeriodId}/question-sets/export`, { format }),
    questionSetsExportResponseSchema,
    withAuthorization(token),
  );
}

export function importQuestionSets(token: string, reviewPeriodId: string, payload: QuestionSetsImportRequest) {
  return request(
    `/review-periods/${reviewPeriodId}/question-sets/import`,
    questionSetsImportResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(questionSetsImportRequestSchema.parse(payload)),
    }),
  );
}

export function listQuestionCategories(token: string) {
  return request('/question-categories', questionCategoriesListResponseSchema, withAuthorization(token));
}

export function updateQuestionCategories(token: string, payload: UpdateQuestionCategoriesRequest) {
  return request(
    '/question-categories',
    questionCategoriesListResponseSchema,
    withAuthorization(token, {
      method: 'PUT',
      body: JSON.stringify(updateQuestionCategoriesRequestSchema.parse(payload)),
    }),
  );
}

export function createAssignment(token: string, reviewPeriodId: string, payload: CreateAssignmentRequest) {
  return request(
    `/review-periods/${reviewPeriodId}/assignments`,
    assignmentResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(createAssignmentRequestSchema.parse(payload)),
    }),
  );
}

export function updateAssignment(token: string, assignmentId: string, payload: UpdateAssignmentRequest) {
  return request(
    `/assignments/${assignmentId}`,
    assignmentResponseSchema,
    withAuthorization(token, {
      method: 'PATCH',
      body: JSON.stringify(updateAssignmentRequestSchema.parse(payload)),
    }),
  );
}

export function deleteAssignment(token: string, assignmentId: string) {
  return request(
    `/assignments/${assignmentId}`,
    deleteAssignmentResponseSchema,
    withAuthorization(token, {
      method: 'DELETE',
    }),
  );
}

export function exportAssignments(token: string, reviewPeriodId: string, format: ExportFormat) {
  return request(
    withSearchParams(`/review-periods/${reviewPeriodId}/assignments/export`, { format }),
    assignmentsExportResponseSchema,
    withAuthorization(token),
  );
}

export function importAssignments(token: string, reviewPeriodId: string, payload: AssignmentsImportRequest) {
  return request(
    `/review-periods/${reviewPeriodId}/assignments/import`,
    assignmentsImportResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(assignmentsImportRequestSchema.parse(payload)),
    }),
  );
}

export function listAssessments(token: string, query: AssessmentsListQuery = {}) {
  const params = assessmentsListQuerySchema.parse(query);
  return request(
    withSearchParams('/assessments', {
      reviewPeriodId: params.reviewPeriodId,
      employeeId: params.employeeId,
      assessorId: params.assessorId,
      assignmentId: params.assignmentId,
      target: params.target,
      reviewState: params.reviewState,
      archiveState: params.archiveState,
    }),
    assessmentsListResponseSchema,
    withAuthorization(token),
  );
}

export function createAssessment(token: string, reviewPeriodId: string, payload: CreateAssessmentRequest) {
  return request(
    `/review-periods/${reviewPeriodId}/assessments`,
    assessmentItemResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(createAssessmentRequestSchema.parse(payload)),
    }),
  );
}

export function saveAssessmentDraft(token: string, assessmentId: string, payload: SaveAssessmentDraftRequest) {
  return request(
    `/assessments/${assessmentId}/save`,
    assessmentItemResponseSchema,
    withAuthorization(token, {
      method: 'PATCH',
      body: JSON.stringify(saveAssessmentDraftRequestSchema.parse(payload)),
    }),
  );
}

export function submitAssessment(token: string, assessmentId: string, payload: SubmitAssessmentRequest) {
  return request(
    `/assessments/${assessmentId}/submit`,
    assessmentItemResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(submitAssessmentRequestSchema.parse(payload)),
    }),
  );
}

export function acceptAssessment(token: string, assessmentId: string, payload: AcceptAssessmentRequest = {}) {
  return request(
    `/assessments/${assessmentId}/accept`,
    assessmentItemResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(acceptAssessmentRequestSchema.parse(payload)),
    }),
  );
}

export function updateAssessmentByAdmin(token: string, assessmentId: string, payload: AdminUpdateAssessmentRequest) {
  return request(
    `/assessments/${assessmentId}/admin`,
    assessmentItemResponseSchema,
    withAuthorization(token, {
      method: 'PATCH',
      body: JSON.stringify(adminUpdateAssessmentRequestSchema.parse(payload)),
    }),
  );
}

export function rejectAssessmentToDraft(
  token: string,
  assessmentId: string,
  payload: RejectAssessmentToDraftRequest = {},
) {
  return request(
    `/assessments/${assessmentId}/reject-to-draft`,
    assessmentItemResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(rejectAssessmentToDraftRequestSchema.parse(payload)),
    }),
  );
}

export function deleteAssessmentByAdmin(token: string, assessmentId: string) {
  return request(
    `/assessments/${assessmentId}`,
    deleteAssessmentResponseSchema,
    withAuthorization(token, {
      method: 'DELETE',
    }),
  );
}

export function markAssessmentSetReadyForMeeting(token: string, payload: AssessmentSetRequest) {
  const requestPayload = assessmentSetRequestSchema.parse(payload);

  return request(
    `/review-periods/${requestPayload.reviewPeriodId}/employees/${requestPayload.employeeId}/assessment-set/ready-for-meeting`,
    assessmentSetResponseSchema,
    withAuthorization(token, {
      method: 'POST',
    }),
  );
}

export function scheduleAssessmentSet(token: string, payload: AssessmentSetRequest) {
  const requestPayload = assessmentSetRequestSchema.parse(payload);

  return request(
    `/review-periods/${requestPayload.reviewPeriodId}/employees/${requestPayload.employeeId}/assessment-set/schedule`,
    assessmentSetResponseSchema,
    withAuthorization(token, {
      method: 'POST',
    }),
  );
}

export function concludeAssessmentSet(
  token: string,
  payload: AssessmentSetRequest & ConcludeAssessmentRequest,
) {
  const { reviewPeriodId, employeeId } = assessmentSetRequestSchema.parse(payload);
  const body = concludeAssessmentRequestSchema.parse(payload);

  return request(
    `/review-periods/${reviewPeriodId}/employees/${employeeId}/assessment-set/conclude`,
    assessmentSetResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export function reassignAssessment(token: string, assessmentId: string, payload: ReassignAssessmentRequest) {
  return request(
    `/assessments/${assessmentId}/reassign`,
    assessmentReassignmentResponseSchema,
    withAuthorization(token, {
      method: 'POST',
      body: JSON.stringify(reassignAssessmentRequestSchema.parse(payload)),
    }),
  );
}
