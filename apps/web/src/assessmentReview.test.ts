import type { Employee } from '@revu/contracts';
import { employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { describe, expect, it } from 'vitest';

import {
  acceptAssessmentReview,
  buildAdminOversightQueues,
  buildAdminAssessmentSummary,
  buildAdminAssessmentRows,
  buildAssessmentQueues,
  buildReadyForMeetingQueues,
  buildReviewQueues,
  buildReviewerScheduledQueues,
  completeAssessmentReview,
  createAssessmentWorkflowSnapshot,
  formatSubjectiveResponse,
  getAssessmentSetWorkflowPanel,
  reassignAssessmentRelationships,
  rejectAssessmentToDraft,
  saveAssessmentDraft,
  submitAssessment,
} from './assessmentReview';

const elliot = employeesListExample.items.find((employee) => employee.username === 'elliot.employee')!;
const manny = employeesListExample.items.find((employee) => employee.username === 'manny.manager')!;
const ada = employeesListExample.items.find((employee) => employee.username === 'ada.admin')!;
const selfAssessmentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const peerAssessmentId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

describe('assessment and review helpers', () => {
  it('groups drafts by completeness and supports save-for-later plus submit transitions', () => {
    const snapshot = createAssessmentWorkflowSnapshot(foundationSnapshotExample);
    const readyToSubmitSnapshot = rejectAssessmentToDraft(snapshot, selfAssessmentId, 'Add one more example.');

    const readyToSubmitQueues = buildAssessmentQueues(elliot, readyToSubmitSnapshot, employeesListExample.items);
    expect(readyToSubmitQueues[2]?.items.map((item) => item.assessmentId)).toContain(selfAssessmentId);

    const incompleteDraftSnapshot = saveAssessmentDraft(
      readyToSubmitSnapshot,
      selfAssessmentId,
      {
        'aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa': 'somewhat agree',
        'aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa': '',
      },
      { now: '2026-02-14T12:00:00.000Z' },
    );
    const incompleteQueues = buildAssessmentQueues(elliot, incompleteDraftSnapshot, employeesListExample.items);
    expect(incompleteQueues[1]?.items.map((item) => item.assessmentId)).toContain(selfAssessmentId);

    const submittedSnapshot = submitAssessment(
      incompleteDraftSnapshot,
      selfAssessmentId,
      {
        'aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa': 'agree',
        'aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa': 'Finished after saving for later.',
      },
      { now: '2026-02-15T09:30:00.000Z' },
    );
    const submittedQueues = buildAssessmentQueues(elliot, submittedSnapshot, employeesListExample.items);
    expect(submittedQueues.every((queue) => queue.items.every((item) => item.assessmentId !== selfAssessmentId))).toBe(true);
  });

  it('tracks manager acceptance queues plus ready-for-meeting set transitions', () => {
    const submittedSnapshot = createAssessmentWorkflowSnapshot({
      ...foundationSnapshotExample,
      assessments: foundationSnapshotExample.assessments.map((assessment) =>
        assessment.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          ? {
              ...assessment,
              archiveState: 'active',
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
              isReadOnly: true,
            }
          : assessment,
      ),
    });
    const initialQueue = buildReviewQueues(manny, submittedSnapshot, employeesListExample.items);

    expect(initialQueue.map((item) => item.assessmentId)).toEqual([selfAssessmentId, peerAssessmentId]);
    expect(initialQueue[0]).toMatchObject({
      title: '2026 Self Assessment - Elliot Employee',
      subjectName: 'Elliot Employee',
      targetLabel: 'Self assessment',
      assessorLabel: 'self',
      dueDate: '2/28/2026',
      nextStepLabel: 'waiting for acceptance',
      statusLabel: 'Submitted',
    });
    expect(initialQueue[1]).toMatchObject({
      title: '2026 Peer Assessment - Elliot Employee',
      targetLabel: 'Peer assessment',
      assessorLabel: 'Pat Peer',
      dueDate: '2/28/2026',
      nextStepLabel: 'waiting for acceptance',
      statusLabel: 'Submitted',
    });

    const acceptedSelfSnapshot = acceptAssessmentReview(submittedSnapshot, selfAssessmentId, 'Ready for meeting.', {
      actorId: manny.id,
      now: '2026-02-16T08:00:00.000Z',
    });
    const acceptedSnapshot = acceptAssessmentReview(acceptedSelfSnapshot, peerAssessmentId, 'Ready for meeting.', {
      actorId: manny.id,
      now: '2026-02-16T08:05:00.000Z',
    });
    const acceptedQueue = buildReviewQueues(manny, acceptedSnapshot, employeesListExample.items);
    expect(acceptedQueue).toHaveLength(0);

    const readyQueues = buildReadyForMeetingQueues(manny, acceptedSnapshot, employeesListExample.items);
    expect(readyQueues).toHaveLength(1);
    expect(readyQueues[0]).toMatchObject({
      employeeId: elliot.id,
      actionLabel: 'Ready for meeting',
      responsibilityLabel: 'Manager readiness',
      statusLabel: 'Accepted',
    });

    const rejectedSnapshot = rejectAssessmentToDraft(submittedSnapshot, selfAssessmentId, 'Please expand the self-review examples.');
    const rejectedQueue = buildReviewQueues(manny, rejectedSnapshot, employeesListExample.items);
    expect(rejectedQueue.map((item) => item.assessmentId)).not.toContain(selfAssessmentId);
  });

  it('builds an admin assessment list for the active review period', () => {
    const snapshot = createAssessmentWorkflowSnapshot(foundationSnapshotExample);
    const rows = buildAdminAssessmentRows(snapshot, employeesListExample.items, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      assessmentId: selfAssessmentId,
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeId: elliot.id,
      subjectName: 'Elliot Employee',
      targetLabel: 'Self assessment',
      assessorLabel: 'self',
      detail: 'Scheduled and waiting for reviewer follow-up.',
      assessmentStatusLabel: 'Scheduled',
      lifecycleLabel: 'Scheduled',
      nextStepLabel: 'Assigned reviewers or an admin can record reviewer conclusions.',
      summaryBucket: 'scheduled',
    });
    expect(rows[1]).toMatchObject({
      assessmentId: peerAssessmentId,
      employeeId: elliot.id,
      targetLabel: 'Peer assessment',
      assessorLabel: 'Pat Peer',
      assessmentStatusLabel: 'Scheduled',
      lifecycleLabel: 'Scheduled',
    });
  });

  it('renders tombstone-linked assessment names as deleted user when the employee record is missing', () => {
    const snapshot = createAssessmentWorkflowSnapshot(foundationSnapshotExample);
    const employees = employeesListExample.items.filter((employee) => employee.username !== 'pat.peer');
    const rows = buildAdminAssessmentRows(snapshot, employees, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    expect(rows[1]).toMatchObject({
      assessorLabel: 'deleted user',
    });
  });

  it('builds admin assessment summary buckets for draft and concluded rows', () => {
    const readyToSubmitSnapshot = rejectAssessmentToDraft(
      createAssessmentWorkflowSnapshot(foundationSnapshotExample),
      selfAssessmentId,
      'Please add one more example.',
    );
    const reviewedSnapshot = completeAssessmentReview(readyToSubmitSnapshot, peerAssessmentId, 'Closed out.', {
      actorId: manny.id,
      now: '2026-02-18T15:30:00.000Z',
    });

    const summary = buildAdminAssessmentSummary(
      buildAdminAssessmentRows(reviewedSnapshot, employeesListExample.items, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(summary).toEqual([
      {
        target: 'self',
        total: 1,
        drafting: 1,
        submitted: 0,
        accepted: 0,
        readyForMeeting: 0,
        scheduled: 0,
        concluded: 0,
      },
      {
        target: 'peer',
        total: 1,
        drafting: 0,
        submitted: 0,
        accepted: 0,
        readyForMeeting: 0,
        scheduled: 0,
        concluded: 1,
      },
    ]);
  });

  it('shows submitted assessments to every manager who can accept them', () => {
    const snapshot = createAssessmentWorkflowSnapshot(foundationSnapshotExample);
    const riley: Employee = {
      id: '55555555-5555-4555-8555-555555555555',
      username: 'riley.manager',
      fullName: 'Riley Manager',
      email: 'riley.manager@example.com',
      role: 'manager',
      status: 'active',
      managerId: ada.id,
      assessor1Id: null,
      assessor2Id: null,
      reviewer1Id: null,
      reviewer2Id: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T12:00:00.000Z',
    };
    const employees = [...employeesListExample.items, riley];

    snapshot.assignments[0] = {
      ...snapshot.assignments[0]!,
      managerId: riley.id,
    };
    snapshot.assessments[1] = {
      ...snapshot.assessments[1]!,
      reviewState: 'submitted',
      acceptedAt: null,
      acceptedByEmployeeId: null,
      reviewedAt: null,
      reviewedByEmployeeId: null,
    };

    const employeeManagerQueue = buildReviewQueues(manny, snapshot, employees);
    const assignmentManagerQueue = buildReviewQueues(riley, snapshot, employees);

    expect(employeeManagerQueue.find((item) => item.assessmentId === peerAssessmentId)).toMatchObject({
      nextStepLabel: 'waiting for acceptance',
    });
    expect(assignmentManagerQueue.find((item) => item.assessmentId === peerAssessmentId)).toMatchObject({
      nextStepLabel: 'waiting for acceptance',
    });
  });

  it('sorts review rows by next step and employee name', () => {
    const snapshot = createAssessmentWorkflowSnapshot({
      ...foundationSnapshotExample,
      assessments: foundationSnapshotExample.assessments.map((assessment) =>
        assessment.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
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
    const bea: Employee = {
      id: '66666666-6666-4666-8666-666666666666',
      username: 'bea.employee',
      fullName: 'Bea Beta',
      email: 'bea.beta@example.com',
      role: 'employee',
      status: 'active',
      managerId: manny.id,
      assessor1Id: null,
      assessor2Id: null,
      reviewer1Id: null,
      reviewer2Id: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T12:00:00.000Z',
    };
    const zara: Employee = {
      id: '77777777-7777-4777-8777-777777777777',
      username: 'zara.employee',
      fullName: 'Zara Zee',
      email: 'zara.zee@example.com',
      role: 'employee',
      status: 'active',
      managerId: manny.id,
      assessor1Id: null,
      assessor2Id: null,
      reviewer1Id: null,
      reviewer2Id: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T12:00:00.000Z',
    };
    const zaraAssessmentId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const beaAssignmentId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    const beaAssessmentId = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
    const employees = [...employeesListExample.items, bea, zara];

    snapshot.assignments.push({
      ...snapshot.assignments[0]!,
      id: beaAssignmentId,
      employeeId: bea.id,
      managerId: manny.id,
    });
    snapshot.assessments.push(
      {
        ...snapshot.assessments[0]!,
        id: zaraAssessmentId,
        employeeId: zara.id,
        assessorId: zara.id,
      },
      {
        ...snapshot.assessments[1]!,
        id: beaAssessmentId,
        assignmentId: beaAssignmentId,
        employeeId: bea.id,
      },
    );

    const queue = buildReviewQueues(manny, snapshot, employees);

    expect(queue.map((item) => item.assessmentId)).toEqual([
      beaAssessmentId,
      selfAssessmentId,
      peerAssessmentId,
      zaraAssessmentId,
    ]);
  });

  it('builds reviewer and admin set queues from the scheduled lifecycle state', () => {
    const snapshot = createAssessmentWorkflowSnapshot(foundationSnapshotExample);

    const reviewerQueue = buildReviewerScheduledQueues(manny, snapshot, employeesListExample.items);
    const adminQueues = buildAdminOversightQueues(snapshot, employeesListExample.items);

    expect(reviewerQueue).toHaveLength(1);
    expect(reviewerQueue[0]).toMatchObject({
      employeeId: elliot.id,
      actionLabel: 'Conclude review',
      responsibilityLabel: 'Reviewer 2',
      statusLabel: 'Scheduled',
    });
    expect(adminQueues.readyForMeeting).toHaveLength(0);
    expect(adminQueues.scheduled).toHaveLength(1);
    expect(adminQueues.concluded).toHaveLength(0);
  });

  it('builds workflow panels that explain reviewer responsibilities and admin reopen controls', () => {
    const readyForMeetingSnapshot = createAssessmentWorkflowSnapshot({
      ...foundationSnapshotExample,
      assessments: foundationSnapshotExample.assessments.map((assessment) =>
        assessment.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          ? {
              ...assessment,
              reviewState: 'ready_for_meeting' as const,
              readyForMeetingAt: '2026-02-17T08:00:00.000Z',
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
            }
          : assessment,
      ),
    });
    const readyForMeetingPanel = getAssessmentSetWorkflowPanel(
      ada,
      readyForMeetingSnapshot,
      employeesListExample.items,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      elliot.id,
    );
    const scheduledPanel = getAssessmentSetWorkflowPanel(
      manny,
      createAssessmentWorkflowSnapshot(foundationSnapshotExample),
      employeesListExample.items,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      elliot.id,
    );
    const concludedSnapshot = createAssessmentWorkflowSnapshot({
      ...foundationSnapshotExample,
      assessments: foundationSnapshotExample.assessments.map((assessment) =>
        assessment.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          ? {
              ...assessment,
              reviewState: 'concluded' as const,
              reviewer1Notes: 'Reviewer 1 wrapped up the first pass.',
              reviewer1CompletedAt: '2026-02-19T08:00:00.000Z',
              reviewer1CompletedByEmployeeId: ada.id,
              reviewer2Notes: 'Reviewer 2 wrapped up final follow-up.',
              reviewer2CompletedAt: '2026-02-20T08:00:00.000Z',
              reviewer2CompletedByEmployeeId: manny.id,
              concludedAt: '2026-02-20T09:00:00.000Z',
              concludedByEmployeeId: ada.id,
            }
          : assessment,
      ),
    });
    const concludedPanel = getAssessmentSetWorkflowPanel(
      ada,
      concludedSnapshot,
      employeesListExample.items,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      elliot.id,
    );

    expect(scheduledPanel).toMatchObject({
      dialogKind: 'conclude-review',
      currentUserReviewerRole: 'reviewer2',
    });
    expect(readyForMeetingPanel).toMatchObject({
      dialogKind: 'schedule-meeting',
      canSchedule: true,
      statusLabel: 'Ready for meeting',
    });
    expect(scheduledPanel?.reviewerActions.find((action) => action.role === 'reviewer1')).toMatchObject({
      canConclude: false,
      canReopen: false,
      isCurrentUserResponsible: false,
      statusLabel: 'Pending',
    });
    expect(scheduledPanel?.reviewerActions.find((action) => action.role === 'reviewer2')).toMatchObject({
      canConclude: true,
      canReopen: false,
      isCurrentUserResponsible: true,
      statusLabel: 'Pending',
    });
    expect(concludedPanel?.reviewerActions.find((action) => action.role === 'reviewer1')).toMatchObject({
      canConclude: false,
      canReopen: true,
      statusLabel: 'Concluded',
    });
    expect(concludedPanel?.reviewerActions.find((action) => action.role === 'reviewer2')).toMatchObject({
      canConclude: false,
      canReopen: true,
      statusLabel: 'Concluded',
    });
  });

  it('updates assignment routing without rewriting the authored assessment record', () => {
    const snapshot = createAssessmentWorkflowSnapshot(foundationSnapshotExample);
    const result = reassignAssessmentRelationships(snapshot, peerAssessmentId, ada.id, elliot.id);

    expect(result.relationships).toMatchObject({
      employeeId: elliot.id,
      managerId: ada.id,
      assessorId: elliot.id,
    });
    expect(result.snapshot.assignments.find((assignment) => assignment.id === 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')).toMatchObject({
      managerId: ada.id,
      assessorId: elliot.id,
    });
    expect(result.snapshot.assessments.find((assessment) => assessment.id === peerAssessmentId)?.assessorId).toBe(
      foundationSnapshotExample.assessments.find((assessment) => assessment.id === peerAssessmentId)?.assessorId,
    );
  });

  it('formats subjective assessment responses with numeric labels', () => {
    expect(formatSubjectiveResponse('strongly agree')).toBe('4 - strongly agree');
    expect(formatSubjectiveResponse('4')).toBe('4 - strongly agree');
    expect(formatSubjectiveResponse('agree')).toBe('3 - somewhat agree');
    expect(formatSubjectiveResponse('somewhat disagree')).toBe('2 - somewhat disagree');
    expect(formatSubjectiveResponse("don't know")).toBe('0 - neutral');
    expect(formatSubjectiveResponse('neutral')).toBe('0 - neutral');
    expect(formatSubjectiveResponse('0')).toBe('0 - neutral');
  });
});
