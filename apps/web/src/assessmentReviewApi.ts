import type {
  AcceptAssessmentRequest,
  AssessmentReviewState,
  AssessmentReviewerRole,
  AssessmentResponse,
  ConcludeAssessmentRequest,
  RejectAssessmentToDraftRequest,
  ReassignAssessmentRequest,
} from '@revu/contracts';

import {
  acceptAssessment,
  concludeAssessmentSet,
  deleteAssessmentByAdmin,
  markAssessmentSetReadyForMeeting,
  reassignAssessment,
  rejectAssessmentToDraft,
  saveAssessmentDraft,
  scheduleAssessmentSet,
  submitAssessment,
  updateAssessmentByAdmin,
} from './api';
import type { AssessmentEditor, AssessmentSetQueueItem, ReviewPanel } from './assessmentReview';

type AssessmentSetEndpointTarget = Pick<AssessmentSetQueueItem, 'reviewPeriodId' | 'employeeId'>;

function normalizeOptionalNotes(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getReviewerRoleLabel(reviewerRole: AssessmentReviewerRole) {
  return reviewerRole === 'reviewer1' ? 'Reviewer 1' : 'Reviewer 2';
}

export function buildAssessmentResponsePayload(
  editor: AssessmentEditor,
  draftResponses: Record<string, string>,
): AssessmentResponse[] {
  return editor.questions.map((question) => ({
    questionId: question.questionId,
    order: question.order,
    response: draftResponses[question.questionId] ?? question.response,
  }));
}

export async function saveAssessmentDraftToApi(
  token: string,
  editor: AssessmentEditor,
  draftResponses: Record<string, string>,
) {
  const response = await saveAssessmentDraft(token, editor.assessmentId, {
    responses: buildAssessmentResponsePayload(editor, draftResponses),
  });

  return {
    assessment: response.item,
    notice: 'Assessment saved for later.',
  };
}

export async function submitAssessmentToApi(
  token: string,
  editor: AssessmentEditor,
  draftResponses: Record<string, string>,
) {
  const response = await submitAssessment(token, editor.assessmentId, {
    responses: buildAssessmentResponsePayload(editor, draftResponses),
  });

  return {
    assessment: response.item,
    notice: 'Assessment submitted for manager or admin acceptance.',
  };
}

export async function updateAssessmentByAdminInApi(
  token: string,
  editor: AssessmentEditor,
  draftResponses: Record<string, string>,
  options: {
    reviewState: Exclude<AssessmentReviewState, 'reviewed'>;
    managerNotes: string;
  },
) {
  const response = await updateAssessmentByAdmin(token, editor.assessmentId, {
    responses: buildAssessmentResponsePayload(editor, draftResponses),
    managerNotes: normalizeOptionalNotes(options.managerNotes),
    reviewState: options.reviewState,
  });

  return {
    assessment: response.item,
    notice: 'Assessment updated.',
  };
}

export async function deleteAssessmentByAdminInApi(token: string, editor: AssessmentEditor) {
  const response = await deleteAssessmentByAdmin(token, editor.assessmentId);

  return {
    result: response,
    notice: 'Assessment deleted.',
  };
}

export async function acceptReviewToApi(token: string, panel: ReviewPanel, notes: string) {
  const payload: AcceptAssessmentRequest = {
    managerNotes: normalizeOptionalNotes(notes),
  };
  const response = await acceptAssessment(token, panel.assessmentId, payload);

  return {
    assessment: response.item,
    notice: 'Assessment accepted. The dashboard now tracks the set as ready to be scheduled.',
  };
}

export async function rejectReviewToApi(token: string, panel: ReviewPanel, notes: string) {
  const payload: RejectAssessmentToDraftRequest = {
    managerNotes: normalizeOptionalNotes(notes),
  };
  const response = await rejectAssessmentToDraft(token, panel.assessmentId, payload);

  return {
    assessment: response.item,
    notice: 'Assessment returned to incomplete so the employee can edit it again.',
  };
}

export async function markAssessmentSetReadyForMeetingInApi(token: string, item: AssessmentSetEndpointTarget) {
  const response = await markAssessmentSetReadyForMeeting(token, {
    reviewPeriodId: item.reviewPeriodId,
    employeeId: item.employeeId,
  });

  return {
    assessmentSet: response,
    notice: 'Assessment set marked ready for meeting.',
  };
}

export async function scheduleAssessmentSetInApi(token: string, item: AssessmentSetEndpointTarget) {
  const response = await scheduleAssessmentSet(token, {
    reviewPeriodId: item.reviewPeriodId,
    employeeId: item.employeeId,
  });

  return {
    assessmentSet: response,
    notice: 'Review meeting marked as scheduled.',
  };
}

export async function concludeAssessmentSetInApi(
  token: string,
  item: AssessmentSetEndpointTarget,
  reviewerRole: AssessmentReviewerRole,
  options: Partial<Pick<ConcludeAssessmentRequest, 'completed' | 'reviewerNotes'>> = {},
) {
  const response = await concludeAssessmentSet(token, {
    reviewPeriodId: item.reviewPeriodId,
    employeeId: item.employeeId,
    reviewerRole,
    completed: options.completed ?? true,
    reviewerNotes: options.reviewerNotes ?? null,
  });

  return {
    assessmentSet: response,
    notice: `${getReviewerRoleLabel(reviewerRole)} conclusion ${options.completed === false ? 'reopened' : 'recorded'}.`,
  };
}

export async function reassignAssessmentInApi(
  token: string,
  panel: ReviewPanel,
  managerId: string | null,
  assessorId: string | null,
) {
  const payload: ReassignAssessmentRequest = panel.canReassignAssessor
    ? {
        managerId,
        assessorId,
      }
    : {
        managerId,
      };
  const response = await reassignAssessment(token, panel.assessmentId, payload);

  return {
    reassignment: response,
    notice: 'Manager and peer-review assignments updated for follow-up work.',
  };
}
