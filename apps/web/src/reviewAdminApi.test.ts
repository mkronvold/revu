import { employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  activateQuestionSet: vi.fn(),
  archiveReviewPeriod: vi.fn(),
  createAssignment: vi.fn(),
  createQuestionSet: vi.fn(),
  createReviewPeriod: vi.fn(),
  deleteAssignment: vi.fn(),
  exportAssignments: vi.fn(),
  exportQuestionSets: vi.fn(),
  importAssignments: vi.fn(),
  importQuestionSets: vi.fn(),
  unarchiveReviewPeriod: vi.fn(),
  updateAssignment: vi.fn(),
  updateEmployee: vi.fn(),
  updateQuestionSet: vi.fn(),
  updateReviewPeriod: vi.fn(),
}));

import {
  activateQuestionSet,
  archiveReviewPeriod,
  createQuestionSet,
  deleteAssignment,
  updateEmployee,
} from './api';
import {
  buildExportNotice,
  buildImportNotice,
  saveAssignmentToApi,
  saveQuestionSetToApi,
  toggleReviewPeriodArchiveInApi,
} from './reviewAdminApi';
import { createReviewAdminSnapshot, toQuestionSetDraft } from './reviewAdmin';

describe('review admin API orchestration', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('creates and activates a new question set when the draft is saved as active', async () => {
    const draft = toQuestionSetDraft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'self');
    draft.title = '2026 Self Questions v2';
    draft.status = 'active';
    draft.questions[0]!.prompt = 'What impact did you have this cycle?';

    vi.mocked(createQuestionSet).mockResolvedValue({
      item: {
        ...foundationSnapshotExample.questionSets[0]!,
        id: '99999999-9999-4999-8999-999999999999',
        title: draft.title,
        status: 'draft',
        questions: [
          {
            id: '88888888-8888-4888-8888-888888888888',
            order: 1,
            type: 'subjective',
            category: null,
            prompt: draft.questions[0]!.prompt,
          },
        ],
      },
    });
    vi.mocked(activateQuestionSet).mockResolvedValue({
      item: {
        ...foundationSnapshotExample.questionSets[0]!,
        id: '99999999-9999-4999-8999-999999999999',
        title: draft.title,
        status: 'active',
        questions: [
          {
            id: '88888888-8888-4888-8888-888888888888',
            order: 1,
            type: 'subjective',
            category: null,
            prompt: draft.questions[0]!.prompt,
          },
        ],
      },
    });

    const result = await saveQuestionSetToApi('session-token', draft);

    expect(createQuestionSet).toHaveBeenCalledWith('session-token', draft.reviewPeriodId, {
      target: 'self',
      title: '2026 Self Questions v2',
      headerMarkdown: '',
      footerMarkdown: '',
      questions: [
        {
          order: 1,
          type: 'subjective',
          category: null,
          prompt: 'What impact did you have this cycle?',
        },
      ],
    });
    expect(activateQuestionSet).toHaveBeenCalledWith('session-token', '99999999-9999-4999-8999-999999999999');
    expect(result.questionSet.status).toBe('active');
    expect(result.notice).toContain('activated');
  });

  it('removes assignments through the API and clears the synced employee assessor', async () => {
    const reviewAdmin = createReviewAdminSnapshot(foundationSnapshotExample);
    const existingAssignment = reviewAdmin.assignments.find(
      (assignment) =>
        assignment.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' &&
        assignment.employeeId === '33333333-3333-4333-8333-333333333333',
    )!;

    vi.mocked(deleteAssignment).mockResolvedValue({
      assignmentId: existingAssignment.id,
      deleted: true,
    });
    vi.mocked(updateEmployee).mockResolvedValue({
      item: {
        ...employeesListExample.items.find((employee) => employee.id === existingAssignment.employeeId)!,
        assessorId: null,
        auth: {
          passwordConfigured: true,
          passwordResetRequired: false,
          lastPasswordChangeAt: '2026-05-01T09:00:00.000Z',
        },
      },
    });

    const result = await saveAssignmentToApi({
      token: 'session-token',
      reviewAdmin,
      employees: employeesListExample.items,
      reviewPeriodId: existingAssignment.reviewPeriodId,
      employeeId: existingAssignment.employeeId,
      managerId: existingAssignment.managerId,
      assessorId: null,
    });

    expect(deleteAssignment).toHaveBeenCalledWith('session-token', existingAssignment.id);
    expect(updateEmployee).toHaveBeenCalledWith('session-token', existingAssignment.employeeId, {
      managerId: existingAssignment.managerId,
      assessorId: null,
    });
    expect(result.relationships).toEqual({
      managerId: existingAssignment.managerId,
      assessorId: null,
    });
  });

  it('routes archive toggles and transfer notices through the API helpers', async () => {
    vi.mocked(archiveReviewPeriod).mockResolvedValue({
      item: {
        ...foundationSnapshotExample.reviewPeriods[0]!,
        status: 'archived',
        archivedAt: '2026-06-01T12:00:00.000Z',
      },
    });

    const archiveResult = await toggleReviewPeriodArchiveInApi(
      'session-token',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      true,
    );

    expect(archiveReviewPeriod).toHaveBeenCalledWith('session-token', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(archiveResult.reviewPeriod.status).toBe('archived');
    expect(
      buildExportNotice({
        reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        resource: 'assignments',
        format: 'csv',
        exportedAt: '2026-06-01T12:00:00.000Z',
        stub: true,
        itemCount: 4,
      }),
    ).toContain('CSV');
    expect(
      buildImportNotice({
        reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        resource: 'questionSets',
        accepted: false,
        status: 'not_implemented',
        supportedFormats: ['json', 'csv'],
      }),
    ).toContain('json, csv');
  });
});
