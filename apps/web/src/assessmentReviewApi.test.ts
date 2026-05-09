import { employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  acceptAssessment: vi.fn(),
  reassignAssessment: vi.fn(),
  rejectAssessmentToDraft: vi.fn(),
  reviewAssessment: vi.fn(),
  saveAssessmentDraft: vi.fn(),
  submitAssessment: vi.fn(),
}));

import {
  acceptAssessment,
  reassignAssessment,
  reviewAssessment,
  saveAssessmentDraft,
  submitAssessment,
} from './api';
import {
  acceptReviewToApi,
  buildAssessmentResponsePayload,
  markReviewReviewedInApi,
  reassignAssessmentInApi,
  saveAssessmentDraftToApi,
  saveReviewNotesToApi,
  submitAssessmentToApi,
} from './assessmentReviewApi';
import { createAssessmentWorkflowSnapshot, getAssessmentEditor, getReviewPanel } from './assessmentReview';

describe('assessment review API orchestration', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('maps editor drafts into ordered assessment response payloads', async () => {
    const snapshot = createAssessmentWorkflowSnapshot(foundationSnapshotExample);
    const editor = getAssessmentEditor(snapshot, employeesListExample.items, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')!;

    vi.mocked(saveAssessmentDraft).mockResolvedValue({
      item: foundationSnapshotExample.assessments[0]!,
    });

    const responses = buildAssessmentResponsePayload(editor, {
      'aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa': 'Updated answer',
    });
    const result = await saveAssessmentDraftToApi('session-token', editor, {
      'aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa': 'Updated answer',
    });

    expect(responses).toEqual([
      {
        questionId: 'aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa',
        order: 1,
        response: 'Updated answer',
      },
      {
        questionId: 'aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa',
        order: 2,
        response: 'I successfully launched our new workflow.',
      },
    ]);
    expect(saveAssessmentDraft).toHaveBeenCalledWith('session-token', editor.assessmentId, {
      responses,
    });
    expect(result.notice).toBe('Assessment saved for later.');
  });

  it('routes accepted-review note saves and completion through the review endpoint', async () => {
    const snapshot = createAssessmentWorkflowSnapshot(foundationSnapshotExample);
    const manager = employeesListExample.items.find((employee) => employee.username === 'manny.manager')!;
    const panel = getReviewPanel(manager, snapshot, employeesListExample.items, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')!;

    vi.mocked(reviewAssessment).mockResolvedValue({
      item: foundationSnapshotExample.assessments[1]!,
    });

    await saveReviewNotesToApi('session-token', panel, '  Capture this for calibration.  ');
    await markReviewReviewedInApi('session-token', panel, '  Finalized in 1:1.  ');

    expect(reviewAssessment).toHaveBeenNthCalledWith(1, 'session-token', panel.assessmentId, {
      managerNotes: 'Capture this for calibration.',
      reviewed: false,
    });
    expect(reviewAssessment).toHaveBeenNthCalledWith(2, 'session-token', panel.assessmentId, {
      managerNotes: 'Finalized in 1:1.',
      reviewed: true,
    });
  });

  it('routes submit, accept, and reassignment actions through the matching assessment endpoints', async () => {
    const snapshot = createAssessmentWorkflowSnapshot(foundationSnapshotExample);
    const employeeEditor = getAssessmentEditor(snapshot, employeesListExample.items, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')!;
    const manager = employeesListExample.items.find((employee) => employee.username === 'manny.manager')!;
    const reviewPanel = getReviewPanel(manager, snapshot, employeesListExample.items, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')!;

    vi.mocked(submitAssessment).mockResolvedValue({
      item: foundationSnapshotExample.assessments[0]!,
    });
    vi.mocked(acceptAssessment).mockResolvedValue({
      item: foundationSnapshotExample.assessments[1]!,
    });
    vi.mocked(reassignAssessment).mockResolvedValue({
      assessment: foundationSnapshotExample.assessments[1]!,
      employee: foundationSnapshotExample.employees[2]!,
      assignment: foundationSnapshotExample.assignments[0]!,
    });

    await submitAssessmentToApi('session-token', employeeEditor, {
      'aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa': 'agree',
      'aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa': 'Proud of the launch.',
    });
    await acceptReviewToApi('session-token', reviewPanel, '  Ready for final notes.  ');
    await reassignAssessmentInApi(
      'session-token',
      reviewPanel,
      foundationSnapshotExample.employees[0]!.id,
      foundationSnapshotExample.employees[2]!.id,
    );

    expect(submitAssessment).toHaveBeenCalledWith('session-token', employeeEditor.assessmentId, {
      responses: [
        {
          questionId: 'aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa',
          order: 1,
          response: 'agree',
        },
        {
          questionId: 'aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa',
          order: 2,
          response: 'Proud of the launch.',
        },
      ],
    });
    expect(acceptAssessment).toHaveBeenCalledWith('session-token', reviewPanel.assessmentId, {
      managerNotes: 'Ready for final notes.',
    });
    expect(reassignAssessment).toHaveBeenCalledWith('session-token', reviewPanel.assessmentId, {
      managerId: foundationSnapshotExample.employees[0]!.id,
      assessorId: foundationSnapshotExample.employees[2]!.id,
    });
  });
});
