import type { Employee } from '@revu/contracts';
import { employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { describe, expect, it } from 'vitest';

import {
  acceptAssessmentReview,
  buildAssessmentQueues,
  buildReviewQueues,
  completeAssessmentReview,
  createAssessmentWorkflowSnapshot,
  formatSubjectiveResponse,
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
        'aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa': 'agree',
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
    expect(submittedQueues[3]?.items.map((item) => item.assessmentId)).toContain(selfAssessmentId);
  });

  it('tracks manager review queues across accept, reject-to-draft, and reviewed transitions', () => {
    const snapshot = createAssessmentWorkflowSnapshot(foundationSnapshotExample);
    const initialQueue = buildReviewQueues(manny, snapshot, employeesListExample.items);

    expect(initialQueue.map((item) => item.assessmentId)).toEqual([selfAssessmentId, peerAssessmentId]);
    expect(initialQueue[0]).toMatchObject({
      title: '2026 Self Assessment - Elliot Employee',
      subjectName: 'Elliot Employee',
      targetLabel: 'Self assessment',
      assessorLabel: 'self',
      nextStepLabel: 'waiting to be accepted',
      statusLabel: 'Submitted',
    });
    expect(initialQueue[1]).toMatchObject({
      title: '2026 Peer Assessment - Elliot Employee',
      targetLabel: 'Peer assessment',
      assessorLabel: 'Pat Peer',
      nextStepLabel: 'waiting to be reviewed',
      statusLabel: 'Accepted',
    });

    const acceptedSnapshot = acceptAssessmentReview(snapshot, selfAssessmentId, 'Ready for final notes.', {
      actorId: manny.id,
      now: '2026-02-16T08:00:00.000Z',
    });
    const acceptedQueue = buildReviewQueues(manny, acceptedSnapshot, employeesListExample.items);
    expect(acceptedQueue.find((item) => item.assessmentId === selfAssessmentId)).toMatchObject({
      nextStepLabel: 'waiting to be reviewed',
      statusLabel: 'Accepted',
    });

    const reviewedSnapshot = completeAssessmentReview(acceptedSnapshot, selfAssessmentId, 'Closed out.', {
      actorId: manny.id,
      now: '2026-02-18T15:30:00.000Z',
    });
    const reviewedQueue = buildReviewQueues(manny, reviewedSnapshot, employeesListExample.items);
    expect(reviewedQueue.find((item) => item.assessmentId === selfAssessmentId)).toMatchObject({
      nextStepLabel: 'review complete',
      statusLabel: 'Reviewed',
    });

    const rejectedSnapshot = rejectAssessmentToDraft(snapshot, selfAssessmentId, 'Please expand the self-review examples.');
    const rejectedQueue = buildReviewQueues(manny, rejectedSnapshot, employeesListExample.items);
    expect(rejectedQueue.map((item) => item.assessmentId)).not.toContain(selfAssessmentId);
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
      assessorId: null,
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
      nextStepLabel: 'waiting to be accepted',
    });
    expect(assignmentManagerQueue.find((item) => item.assessmentId === peerAssessmentId)).toMatchObject({
      nextStepLabel: 'waiting to be accepted',
    });
  });

  it('sorts review rows by next step and employee name', () => {
    const snapshot = createAssessmentWorkflowSnapshot(foundationSnapshotExample);
    const bea: Employee = {
      id: '66666666-6666-4666-8666-666666666666',
      username: 'bea.employee',
      fullName: 'Bea Beta',
      email: 'bea.beta@example.com',
      role: 'employee',
      status: 'active',
      managerId: manny.id,
      assessorId: null,
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
      assessorId: null,
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
      selfAssessmentId,
      zaraAssessmentId,
      beaAssessmentId,
      peerAssessmentId,
    ]);
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
    expect(formatSubjectiveResponse("don't know")).toBe("0 - don't know");
    expect(formatSubjectiveResponse('0')).toBe("0 - don't know");
  });
});
