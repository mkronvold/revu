import { employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  acceptAssessment: vi.fn(),
  concludeAssessmentSet: vi.fn(),
  markAssessmentSetReadyForMeeting: vi.fn(),
  reassignAssessment: vi.fn(),
  rejectAssessmentToDraft: vi.fn(),
  saveAssessmentDraft: vi.fn(),
  scheduleAssessmentSet: vi.fn(),
  submitAssessment: vi.fn(),
}));

import {
  acceptAssessment,
  concludeAssessmentSet,
  markAssessmentSetReadyForMeeting,
  reassignAssessment,
  saveAssessmentDraft,
  scheduleAssessmentSet,
  submitAssessment,
} from './api';
import {
  acceptReviewToApi,
  buildAssessmentResponsePayload,
  concludeAssessmentSetInApi,
  markAssessmentSetReadyForMeetingInApi,
  reassignAssessmentInApi,
  saveAssessmentDraftToApi,
  scheduleAssessmentSetInApi,
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

  it('routes ready, schedule, and reviewer completion actions through the assessment-set endpoints', async () => {
    vi.mocked(markAssessmentSetReadyForMeeting).mockResolvedValue({
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeId: '33333333-3333-4333-8333-333333333333',
      items: foundationSnapshotExample.assessments.slice(0, 2),
    });
    vi.mocked(scheduleAssessmentSet).mockResolvedValue({
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeId: '33333333-3333-4333-8333-333333333333',
      items: foundationSnapshotExample.assessments.slice(0, 2),
    });
    vi.mocked(concludeAssessmentSet).mockResolvedValue({
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeId: '33333333-3333-4333-8333-333333333333',
      items: foundationSnapshotExample.assessments.slice(0, 2),
    });

    const readyResult = await markAssessmentSetReadyForMeetingInApi('session-token', {
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeId: '33333333-3333-4333-8333-333333333333',
    });
    const scheduleResult = await scheduleAssessmentSetInApi('session-token', {
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeId: '33333333-3333-4333-8333-333333333333',
    });
    const concludeResult = await concludeAssessmentSetInApi(
      'session-token',
      {
        reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        employeeId: '33333333-3333-4333-8333-333333333333',
      },
      'reviewer2',
      {
        completed: true,
        reviewerNotes: '  Wrapped up after the meeting.  ',
      },
    );
    const reopenResult = await concludeAssessmentSetInApi(
      'session-token',
      {
        reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        employeeId: '33333333-3333-4333-8333-333333333333',
      },
      'reviewer1',
      {
        completed: false,
        reviewerNotes: 'Need one more follow-up.',
      },
    );

    expect(markAssessmentSetReadyForMeeting).toHaveBeenCalledWith('session-token', {
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeId: '33333333-3333-4333-8333-333333333333',
    });
    expect(scheduleAssessmentSet).toHaveBeenCalledWith('session-token', {
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeId: '33333333-3333-4333-8333-333333333333',
    });
    expect(concludeAssessmentSet).toHaveBeenCalledWith('session-token', {
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeId: '33333333-3333-4333-8333-333333333333',
      reviewerRole: 'reviewer2',
      completed: true,
      reviewerNotes: '  Wrapped up after the meeting.  ',
    });
    expect(readyResult.notice).toBe('Assessment set marked ready for meeting.');
    expect(scheduleResult.notice).toBe('Review meeting marked as scheduled.');
    expect(concludeResult.notice).toBe('Reviewer 2 conclusion recorded.');
    expect(reopenResult.notice).toBe('Reviewer 1 conclusion reopened.');
  });

  it('routes submit, accept, and reassignment actions through the matching assessment endpoints', async () => {
    const snapshot = createAssessmentWorkflowSnapshot({
      ...foundationSnapshotExample,
      assessments: foundationSnapshotExample.assessments.map((assessment) =>
        assessment.id === 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
          ? {
              ...assessment,
              reviewState: 'submitted',
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
            }
          : assessment,
      ),
    });
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
