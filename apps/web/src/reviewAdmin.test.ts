import { employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildAssignmentRows,
  createReviewAdminSnapshot,
  getReviewPeriodSummary,
  setReviewPeriodArchived,
  toQuestionSetDraft,
  upsertQuestionSet,
} from './reviewAdmin';

describe('review admin helpers', () => {
  it('archives review-period scoped admin data together', () => {
    const snapshot = createReviewAdminSnapshot(foundationSnapshotExample);
    const nextSnapshot = setReviewPeriodArchived(snapshot, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true, {
      now: '2026-03-01T12:00:00.000Z',
      actorId: '11111111-1111-4111-8111-111111111111',
    });

    const reviewPeriod = nextSnapshot.reviewPeriods.find((period) => period.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')!;
    expect(reviewPeriod.status).toBe('archived');
    expect(reviewPeriod.archivedByEmployeeId).toBe('11111111-1111-4111-8111-111111111111');
    expect(
      nextSnapshot.questionSets
        .filter((questionSet) => questionSet.reviewPeriodId === reviewPeriod.id)
        .every((questionSet) => questionSet.isReadOnly),
    ).toBe(true);
    expect(
      nextSnapshot.assessments
        .filter((assessment) => assessment.reviewPeriodId === reviewPeriod.id)
        .every((assessment) => assessment.archiveState === 'archived'),
    ).toBe(true);
  });

  it('keeps one question set per period and target when saving drafts locally', () => {
    const snapshot = createReviewAdminSnapshot(foundationSnapshotExample);
    const existingSelfSet = snapshot.questionSets.find(
      (questionSet) => questionSet.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' && questionSet.target === 'self',
    )!;
    const draft = toQuestionSetDraft(existingSelfSet.reviewPeriodId, 'self', existingSelfSet);
    draft.title = '2026 Self Questions v2';
    draft.status = 'active';
    draft.questions.push({
      id: 'new-question',
      order: 3,
      type: 'narrative',
      category: 'Support',
      prompt: 'What support would help you do your best work next cycle?',
    });

    const result = upsertQuestionSet(snapshot, draft, {
      now: '2026-01-15T09:00:00.000Z',
    });
    const selfSets = result.snapshot.questionSets.filter(
      (questionSet) => questionSet.reviewPeriodId === draft.reviewPeriodId && questionSet.target === 'self',
    );

    expect(selfSets).toHaveLength(1);
    expect(selfSets[0]?.title).toBe('2026 Self Questions v2');
    expect(selfSets[0]?.questions).toHaveLength(3);
  });

  it('builds assignment rows from the review period matrix while preserving assessor alignment', () => {
    const snapshot = createReviewAdminSnapshot(foundationSnapshotExample);
    const rows = buildAssignmentRows(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeesListExample.items,
      snapshot.assignments,
    );

    expect(rows[0]?.employeeName).toBe('Ada Admin');
    expect(rows.find((row) => row.employeeId === '33333333-3333-4333-8333-333333333333')).toMatchObject({
      managerId: '22222222-2222-4222-8222-222222222222',
      assessorId: '44444444-4444-4444-8444-444444444444',
    });
    expect(getReviewPeriodSummary(snapshot, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toMatchObject({
      questionSetCount: 2,
      assignmentCount: 1,
      assessmentCount: 2,
    });
  });
});
