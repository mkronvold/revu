import { employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { describe, expect, it } from 'vitest';

import {
  acceptAssessmentReview,
  buildAssessmentQueues,
  buildReviewQueues,
  completeAssessmentReview,
  createAssessmentWorkflowSnapshot,
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
    const initialQueues = buildReviewQueues(manny, snapshot, employeesListExample.items);

    expect(initialQueues[0]?.items.map((item) => item.assessmentId)).toContain(selfAssessmentId);
    expect(initialQueues[1]?.items.map((item) => item.assessmentId)).toContain(peerAssessmentId);

    const acceptedSnapshot = acceptAssessmentReview(snapshot, selfAssessmentId, 'Ready for final notes.', {
      actorId: manny.id,
      now: '2026-02-16T08:00:00.000Z',
    });
    const acceptedQueues = buildReviewQueues(manny, acceptedSnapshot, employeesListExample.items);
    expect(acceptedQueues[1]?.items.map((item) => item.assessmentId)).toContain(selfAssessmentId);

    const reviewedSnapshot = completeAssessmentReview(acceptedSnapshot, selfAssessmentId, 'Closed out.', {
      actorId: manny.id,
      now: '2026-02-18T15:30:00.000Z',
    });
    const reviewedQueues = buildReviewQueues(manny, reviewedSnapshot, employeesListExample.items);
    expect(reviewedQueues[2]?.items.map((item) => item.assessmentId)).toContain(selfAssessmentId);

    const rejectedSnapshot = rejectAssessmentToDraft(snapshot, selfAssessmentId, 'Please expand the self-review examples.');
    const rejectedQueues = buildReviewQueues(manny, rejectedSnapshot, employeesListExample.items);
    expect(rejectedQueues[0]?.items.map((item) => item.assessmentId)).not.toContain(selfAssessmentId);
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
});
