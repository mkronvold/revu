import { employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  activateQuestionSet: vi.fn(),
  archiveReviewPeriod: vi.fn(),
  createAssignment: vi.fn(),
  createQuestionSet: vi.fn(),
  createReviewPeriod: vi.fn(),
  deleteAssignment: vi.fn(),
  deleteReviewPeriod: vi.fn(),
  exportLocalUsers: vi.fn(),
  exportAssignments: vi.fn(),
  exportQuestionSets: vi.fn(),
  importLocalUsers: vi.fn(),
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
  deleteReviewPeriod,
  updateEmployee,
} from './api';
import {
  buildAssignmentsExportNotice,
  buildAssignmentsImportNotice,
  buildDeleteReviewPeriodConfirmation,
  buildLocalUsersExportNotice,
  buildLocalUsersImportNotice,
  buildAssignmentsImportPayload,
  buildLocalUsersImportPayload,
  buildLocalUsersImportPayloadFromFile,
  buildQuestionSetExportFilename,
  buildQuestionSetExportNotice,
  buildQuestionSetImportNotice,
  buildQuestionSetsImportPayload,
  copyQuestionSetToReviewPeriodInApi,
  deleteReviewPeriodFromApi,
  saveAssignmentToApi,
  saveQuestionSetToApi,
  serializeAssignmentsTransfer,
  serializeLocalUsersTransfer,
  serializeQuestionSetsTransfer,
  toggleReviewPeriodArchiveInApi,
} from './reviewAdminApi';
import { createReviewAdminSnapshot, toQuestionSetDraft } from './reviewAdmin';

describe('review admin API orchestration', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('creates and activates a new question set when question-set status is disabled', async () => {
    const draft = toQuestionSetDraft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'self');
    draft.title = '2026 Self Questions v2';
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

  it('copies an inactive review-period question set into the current review period as active', async () => {
    const sourceReviewPeriod = foundationSnapshotExample.reviewPeriods[1]!;
    const targetReviewPeriod = foundationSnapshotExample.reviewPeriods[0]!;
    const sourceQuestionSet = foundationSnapshotExample.questionSets[2]!;

    vi.mocked(createQuestionSet).mockResolvedValue({
      item: {
        ...sourceQuestionSet,
        id: '56565656-5656-4565-8565-565656565656',
        reviewPeriodId: targetReviewPeriod.id,
        isReadOnly: false,
        title: '2026 Self Questions',
      },
    });
    vi.mocked(activateQuestionSet).mockResolvedValue({
      item: {
        ...sourceQuestionSet,
        id: '56565656-5656-4565-8565-565656565656',
        reviewPeriodId: targetReviewPeriod.id,
        isReadOnly: false,
        status: 'active',
        title: '2026 Self Questions',
      },
    });

    const result = await copyQuestionSetToReviewPeriodInApi(
      'session-token',
      sourceQuestionSet,
      sourceReviewPeriod,
      targetReviewPeriod,
    );

    expect(createQuestionSet).toHaveBeenCalledWith('session-token', targetReviewPeriod.id, {
      target: 'self',
      title: '2026 Self Questions',
      headerMarkdown: 'Archived self questions.',
      footerMarkdown: 'Archive only.',
      questions: [
        {
          order: 1,
          type: 'subjective',
          category: 'Impact',
          prompt: 'Archived prompt',
        },
      ],
    });
    expect(result.questionSet.reviewPeriodId).toBe(targetReviewPeriod.id);
    expect(result.questionSet.status).toBe('active');
    expect(result.notice).toContain('made it active');
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
        assessor2Id: null,
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
      assessor2Id: null,
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
      buildAssignmentsExportNotice({
        format: 'csv',
        itemCount: 4,
      }),
    ).toContain('CSV');
    expect(
      buildQuestionSetImportNotice({
        reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        format: 'json',
        importedAt: '2026-06-01T12:30:00.000Z',
        itemCount: 2,
        createdCount: 1,
        updatedCount: 1,
        items: foundationSnapshotExample.questionSets.slice(0, 2),
      }),
    ).toContain('1 created, 1 updated');
    expect(
      buildAssignmentsImportNotice({
        reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        format: 'csv',
        importedAt: '2026-06-01T12:45:00.000Z',
        itemCount: 1,
        createdCount: 0,
        updatedCount: 1,
        items: foundationSnapshotExample.assignments.slice(0, 1),
      }),
    ).toContain('1 updated');
  });

  it('serializes and parses local user transfer payloads for import-ready reuse', () => {
    const exportResponse = {
      format: 'json' as const,
      mode: 'rotate-passcodes' as const,
      exportedAt: '2026-06-01T12:00:00.000Z',
      itemCount: 1,
      items: [
        {
          username: 'elliot.employee',
          fullName: 'Elliot Employee',
          email: 'elliot.employee@example.com',
          role: 'employee' as const,
          status: 'active' as const,
          managerUsername: 'manny.manager',
          assessor1Username: 'manny.manager',
          assessor2Username: 'pat.peer',
          reviewer1Username: 'ada.admin',
          reviewer2Username: 'manny.manager',
          password: 'tmp-passcode-123',
          credentialKind: 'password' as const,
          passwordResetRequired: true,
        },
      ],
    };

    const jsonPayload = serializeLocalUsersTransfer(exportResponse);
    expect(buildLocalUsersImportPayload('json', jsonPayload)).toEqual({
      format: 'json',
      items: exportResponse.items,
    });

    const csvPayload = serializeLocalUsersTransfer({
      format: 'csv',
      mode: 'rotate-passcodes',
      items: exportResponse.items,
    });
    expect(csvPayload).toContain('reviewer1Username,reviewer2Username');
    expect(buildLocalUsersImportPayload('csv', csvPayload)).toEqual({
      format: 'csv',
      items: exportResponse.items,
    });
  });

  it('serializes and parses question-set and assignment transfers for download/upload', () => {
    const questionSet = foundationSnapshotExample.questionSets.find((item) => item.questions.length > 0)!;
    const questionSetResponse = {
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      format: 'csv' as const,
      exportedAt: '2026-06-01T12:00:00.000Z',
      itemCount: 1,
      items: [questionSet],
    };
    expect(serializeQuestionSetsTransfer(questionSetResponse)).toContain('questionSetId');
    expect(
      buildQuestionSetsImportPayload(
        'csv',
        serializeQuestionSetsTransfer(questionSetResponse),
      ).items[0],
    ).toMatchObject({
      id: questionSet.id,
      title: questionSet.title,
    });

    const assignmentResponse = {
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      format: 'csv' as const,
      exportedAt: '2026-06-01T12:00:00.000Z',
      itemCount: 1,
      items: [
        {
          assignmentId: foundationSnapshotExample.assignments[0]!.id,
          employeeUsername: 'elliot.employee',
          employeeFullName: 'Elliot Employee',
          managerUsername: 'manny.manager',
          managerFullName: 'Manny Manager',
          assessorUsername: 'pat.peer',
          assessorFullName: 'Pat Peer',
        },
      ],
    };
    expect(serializeAssignmentsTransfer(assignmentResponse)).toContain('employeeUsername');
    expect(buildAssignmentsImportPayload('csv', serializeAssignmentsTransfer(assignmentResponse)).items[0]).toMatchObject({
      assignmentId: foundationSnapshotExample.assignments[0]!.id,
      employeeUsername: 'elliot.employee',
      assessorUsername: 'pat.peer',
    });
  });

  it('serializes question-set exports for download notices and filenames', () => {
    const exportResponse = {
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      format: 'csv' as const,
      exportedAt: '2026-06-01T12:00:00.000Z',
      itemCount: 2,
      items: foundationSnapshotExample.questionSets.filter(
        (item) => item.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ),
    };

    const csvPayload = serializeQuestionSetsTransfer(exportResponse);

    expect(csvPayload).toContain('reviewPeriodId,questionSetId,target,status,title');
    expect(csvPayload).toContain('2026 Self Questions');
    expect(buildQuestionSetExportNotice(exportResponse)).toBe('Exported 2 question sets as CSV.');
    expect(buildQuestionSetExportFilename(foundationSnapshotExample.reviewPeriods[0]!, exportResponse)).toBe(
      '2026-question-sets-20260601T120000Z.csv',
    );
  });

  it('autodetects JSON vs CSV when parsing from a file', () => {
    const item = {
      username: 'elliot.employee',
      fullName: 'Elliot Employee',
      email: 'elliot.employee@example.com',
      role: 'employee' as const,
      status: 'active' as const,
      managerUsername: 'manny.manager',
      assessor1Username: 'manny.manager',
      assessor2Username: 'pat.peer',
      reviewer1Username: 'ada.admin',
      reviewer2Username: 'manny.manager',
      password: 'tmp-passcode-123',
      credentialKind: 'password' as const,
      passwordResetRequired: true,
    };

    const jsonContent = serializeLocalUsersTransfer({ format: 'json', mode: 'rotate-passcodes', items: [item] });
    expect(buildLocalUsersImportPayloadFromFile(jsonContent)).toEqual({ format: 'json', items: [item] });

    const jsonArrayContent = JSON.stringify([item]);
    expect(buildLocalUsersImportPayloadFromFile(jsonArrayContent)).toEqual({ format: 'json', items: [item] });

    const csvContent = serializeLocalUsersTransfer({ format: 'csv', mode: 'rotate-passcodes', items: [item] });
    expect(buildLocalUsersImportPayloadFromFile(csvContent)).toEqual({ format: 'csv', items: [item] });
  });

  it('describes local user export/import credential behavior', () => {
    expect(
      buildLocalUsersExportNotice({
        format: 'json',
        itemCount: 2,
        mode: 'rotate-passcodes',
      }),
    ).toContain('one-time passcode');
    expect(
      buildLocalUsersExportNotice({
        format: 'json',
        itemCount: 2,
        mode: 'preserve-passwords',
      }),
    ).toContain('left untouched');
    expect(
      buildLocalUsersImportNotice({
        format: 'json',
        importedAt: '2026-06-01T12:00:00.000Z',
        itemCount: 2,
        createdCount: 1,
        updatedCount: 1,
        items: [
          {
            ...employeesListExample.items[2]!,
            auth: {
              passwordConfigured: true,
              passwordResetRequired: true,
              lastPasswordChangeAt: '2026-06-01T12:00:00.000Z',
            },
          },
          {
            ...employeesListExample.items[3]!,
            auth: {
              passwordConfigured: true,
              passwordResetRequired: false,
              lastPasswordChangeAt: '2026-06-01T12:00:00.000Z',
            },
          },
        ],
      }),
    ).toContain('1 imported account');
  });

  it('builds delete confirmations and delete notices for review periods', async () => {
    const reviewPeriod = foundationSnapshotExample.reviewPeriods[0]!;

    vi.mocked(deleteReviewPeriod).mockResolvedValue({
      reviewPeriodId: reviewPeriod.id,
      label: reviewPeriod.label,
      deleted: true,
      questionSetCount: 2,
      assessmentCount: 5,
      assignmentCount: 3,
    });

    expect(
      buildDeleteReviewPeriodConfirmation(reviewPeriod, {
        questionSetCount: 2,
        activeQuestionSetCount: 1,
        assignmentCount: 3,
        assessmentCount: 5,
        archivedAssessmentCount: 0,
        completedAssessmentCount: 1,
      }),
    ).toContain('This is the active review period.');

    const result = await deleteReviewPeriodFromApi('session-token', reviewPeriod);

    expect(deleteReviewPeriod).toHaveBeenCalledWith('session-token', reviewPeriod.id);
    expect(result.reviewPeriodId).toBe(reviewPeriod.id);
    expect(result.notice).toContain('Deleted 2 question sets, 5 assessments, and 3 assignments');
  });
});
