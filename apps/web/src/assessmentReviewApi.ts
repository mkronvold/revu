import type {
  AcceptAssessmentRequest,
  AssessmentResponse,
  RejectAssessmentToDraftRequest,
  ReassignAssessmentRequest,
  ReviewAssessmentRequest,
} from '@revu/contracts';

import {
  acceptAssessment,
  reassignAssessment,
  rejectAssessmentToDraft,
  reviewAssessment,
  saveAssessmentDraft,
  submitAssessment,
} from './api';
import type { AssessmentEditor, ReviewPanel } from './assessmentReview';

function normalizeOptionalNotes(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

export async function acceptReviewToApi(token: string, panel: ReviewPanel, notes: string) {
  const payload: AcceptAssessmentRequest = {
    managerNotes: normalizeOptionalNotes(notes),
  };
  const response = await acceptAssessment(token, panel.assessmentId, payload);

  return {
    assessment: response.item,
    notice: 'Assessment accepted and moved into the review stage.',
  };
}

export async function rejectReviewToApi(token: string, panel: ReviewPanel, notes: string) {
  const payload: RejectAssessmentToDraftRequest = {
    managerNotes: normalizeOptionalNotes(notes),
  };
  const response = await rejectAssessmentToDraft(token, panel.assessmentId, payload);

  return {
    assessment: response.item,
    notice: 'Assessment returned to draft so the employee can edit it again.',
  };
}

export async function saveReviewNotesToApi(token: string, panel: ReviewPanel, notes: string) {
  const payload: ReviewAssessmentRequest = {
    managerNotes: notes.trim(),
    reviewed: false,
  };
  const response = await reviewAssessment(token, panel.assessmentId, payload);

  return {
    assessment: response.item,
    notice: 'Review notes saved.',
  };
}

export async function markReviewReviewedInApi(token: string, panel: ReviewPanel, notes: string) {
  const payload: ReviewAssessmentRequest = {
    managerNotes: notes.trim(),
    reviewed: true,
  };
  const response = await reviewAssessment(token, panel.assessmentId, payload);

  return {
    assessment: response.item,
    notice: 'Review marked complete.',
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
