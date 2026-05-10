import { adminEmployeeExample, adminLoginExample, employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApiClientError,
  acceptAssessment,
  apiBaseUrl,
  changePassword,
  exportBackup,
  exportLocalUsers,
  getApiIndex,
  getEmployee,
  getBackupStatus,
  getFoundation,
  importLocalUsers,
  listQuestionCategories,
  listAssessments,
  listEmployees,
  login,
  reassignAssessment,
  restoreBackup,
  reviewAssessment,
  submitAssessment,
  updateBackupStatus,
  updateOwnProfile,
  updateQuestionCategories,
} from './api';

describe('web api client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs in against the API v1 auth endpoint', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(adminLoginExample), { status: 200 }));

    const response = await login({
      username: 'ada.admin',
      password: 'AdminPass123!',
    });

    expect(response.session.user.username).toBe('ada.admin');
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/auth/login`,
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('reads the public API index without auth', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          name: 'revu-api',
          version: '0.1.0',
          seededAccountsAvailable: true,
          resources: [],
        }),
        { status: 200 },
      ),
    );

    const response = await getApiIndex();

    expect(response.seededAccountsAvailable).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${apiBaseUrl}`, expect.any(Object));
  });

  it('sends bearer auth for employee directory requests', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(employeesListExample), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(adminEmployeeExample), { status: 200 }));

    await listEmployees('session-token');
    await getEmployee('session-token', adminEmployeeExample.item.id);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${apiBaseUrl}/employees`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${apiBaseUrl}/employees/${adminEmployeeExample.item.id}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );
  });

  it('uses authenticated foundation and assessment workflow endpoints', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(foundationSnapshotExample), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [foundationSnapshotExample.assessments[1]] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ item: foundationSnapshotExample.assessments[0] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ item: foundationSnapshotExample.assessments[1] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ item: foundationSnapshotExample.assessments[1] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            assessment: foundationSnapshotExample.assessments[1],
            employee: foundationSnapshotExample.employees[2],
            assignment: foundationSnapshotExample.assignments[0],
          }),
          { status: 200 },
        ),
      );

    await getFoundation('session-token');
    await listAssessments('session-token', { reviewState: 'accepted', target: 'peer' });
    await submitAssessment('session-token', foundationSnapshotExample.assessments[0]!.id, {
      responses: foundationSnapshotExample.assessments[0]!.responses,
    });
    await acceptAssessment('session-token', foundationSnapshotExample.assessments[1]!.id, {
      managerNotes: 'Looks good.',
    });
    await reviewAssessment('session-token', foundationSnapshotExample.assessments[1]!.id, {
      managerNotes: 'Captured review notes.',
      reviewed: true,
    });
    await reassignAssessment('session-token', foundationSnapshotExample.assessments[1]!.id, {
      managerId: foundationSnapshotExample.employees[0]!.id,
      assessorId: foundationSnapshotExample.employees[2]!.id,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${apiBaseUrl}/foundation`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${apiBaseUrl}/assessments?target=peer&reviewState=accepted`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${apiBaseUrl}/assessments/${foundationSnapshotExample.assessments[0]!.id}/submit`,
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      `${apiBaseUrl}/assessments/${foundationSnapshotExample.assessments[1]!.id}/reassign`,
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('lists persisted question categories from the API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: ['Impact', 'Teamwork'] }), { status: 200 }),
    );

    const response = await listQuestionCategories('session-token');

    expect(response.items).toEqual(['Impact', 'Teamwork']);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/question-categories`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );
  });

  it('updates persisted question categories through the API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: ['Growth', 'Strategy', 'Teamwork'] }), { status: 200 }),
    );

    const response = await updateQuestionCategories('session-token', {
      items: ['Growth', 'Strategy', 'Teamwork'],
    });

    expect(response.items).toEqual(['Growth', 'Strategy', 'Teamwork']);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/question-categories`,
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
          'content-type': 'application/json',
        }),
      }),
    );
  });

  it('routes password changes and local user transfers through auth-backed endpoints', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            session: adminLoginExample.session,
            lastPasswordChangeAt: '2026-06-01T12:00:00.000Z',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
            JSON.stringify({
              format: 'json',
              mode: 'rotate-passcodes',
              exportedAt: '2026-06-01T12:00:00.000Z',
              itemCount: 1,
              items: [
              {
                username: 'elliot.employee',
                fullName: 'Elliot Employee',
                email: 'elliot.employee@example.com',
                role: 'employee',
                status: 'active',
                  managerUsername: 'manny.manager',
                  assessorUsername: 'pat.peer',
                  password: 'tmp-passcode-123',
                  credentialKind: 'password',
                  passwordResetRequired: true,
                },
              ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            format: 'json',
            importedAt: '2026-06-01T12:00:00.000Z',
            itemCount: 1,
            createdCount: 0,
            updatedCount: 1,
            items: [adminEmployeeExample.item],
          }),
          { status: 200 },
        ),
      );

    await changePassword('session-token', {
      currentPassword: 'OldPass123!',
      newPassword: 'NewPass123!',
    });
    await exportLocalUsers('session-token', 'json', 'rotate-passcodes');
    await importLocalUsers('session-token', {
      format: 'json',
      items: [
        {
          username: 'elliot.employee',
          fullName: 'Elliot Employee',
          email: 'elliot.employee@example.com',
          role: 'employee',
          status: 'active',
          managerUsername: 'manny.manager',
          assessorUsername: 'pat.peer',
          password: 'tmp-passcode-123',
          passwordResetRequired: true,
        },
      ],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${apiBaseUrl}/auth/password/change`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${apiBaseUrl}/employees/export?format=json&mode=rotate-passcodes`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${apiBaseUrl}/employees/import`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );
  });

  it('updates the signed-in user profile through the auth me endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          session: {
            ...adminLoginExample.session,
            user: {
              ...adminLoginExample.session.user,
              fullName: 'Ada Updated',
              email: 'ada.updated@example.com',
            },
          },
        }),
        { status: 200 },
      ),
    );

    const response = await updateOwnProfile('session-token', {
      fullName: 'Ada Updated',
      email: 'ada.updated@example.com',
    });

    expect(response.session.user.fullName).toBe('Ada Updated');
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/auth/me`,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
          'content-type': 'application/json',
        }),
      }),
    );
  });

  it('uses backup status, export, and multipart restore endpoints', async () => {
    const { employees: _employees, ...reviewData } = foundationSnapshotExample;
    const backupStatusResponse = {
      automaticBackupsEnabled: true,
      schedule: 'daily' as const,
      retentionCount: 14,
      lastBackupAt: '2026-06-01T12:00:00.000Z',
      lastRestoreAt: null,
      defaultUserExportMode: 'preserve-passwords' as const,
      replaceStrategy: 'replace' as const,
      supportedFormats: ['json'] as const,
      supportedSchedules: ['1hr', '3hr', '6hr', '12hr', 'daily', 'weekly'] as const,
      supportedRestoreModes: ['replace'] as const,
      supportedRestoreScopes: ['all', 'users', 'questions', 'reviews'] as const,
      supportedUserExportModes: ['rotate-passcodes', 'preserve-passwords'] as const,
    };
    const backupExportResponse = {
      version: 1 as const,
      exportedAt: '2026-06-02T15:30:00.000Z',
      users: {
        mode: 'preserve-passwords' as const,
        itemCount: 1,
        items: [
          {
            id: adminEmployeeExample.item.id,
            username: adminEmployeeExample.item.username,
            fullName: adminEmployeeExample.item.fullName,
            email: adminEmployeeExample.item.email,
            role: adminEmployeeExample.item.role,
            status: adminEmployeeExample.item.status,
            managerUsername: null,
            assessorUsername: null,
            password: '0123456789abcdef0123456789abcdef:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
            credentialKind: 'password-hash' as const,
            passwordResetRequired: false,
          },
        ],
      },
      reviewData,
    };
    const backupRestoreResponse = {
      mode: 'replace' as const,
      target: 'reviews' as const,
      restoredAt: '2026-06-03T08:15:00.000Z',
      counts: {
        users: backupExportResponse.users.itemCount,
        reviewPeriods: reviewData.reviewPeriods.length,
        questionSets: reviewData.questionSets.length,
        assignments: reviewData.assignments.length,
        assessments: reviewData.assessments.length,
      },
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(backupStatusResponse), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...backupStatusResponse,
            automaticBackupsEnabled: false,
            schedule: 'weekly',
            retentionCount: 6,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(backupExportResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(backupRestoreResponse), { status: 200 }));

    await getBackupStatus('session-token');
    await updateBackupStatus('session-token', {
      automaticBackupsEnabled: false,
      schedule: 'weekly',
      retentionCount: 6,
    });
    await exportBackup('session-token');
    await restoreBackup('session-token', {
      file: new File([JSON.stringify(backupExportResponse, null, 2)], 'backup.json', { type: 'application/json' }),
      target: 'reviews',
      mode: 'replace',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${apiBaseUrl}/admin/backups/status`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${apiBaseUrl}/admin/backups/status`,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${apiBaseUrl}/admin/backups/export?mode=preserve-passwords`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );

    const restoreCall = fetchMock.mock.calls[3];
    expect(restoreCall?.[0]).toBe(`${apiBaseUrl}/admin/backups/restore`);
    expect(restoreCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );
    expect((restoreCall?.[1]?.headers as Record<string, string>)['content-type']).toBeUndefined();

    const restoreBody = restoreCall?.[1]?.body;
    expect(restoreBody).toBeInstanceOf(FormData);
    expect((restoreBody as FormData).get('target')).toBe('reviews');
    expect((restoreBody as FormData).get('mode')).toBe('replace');
    expect(((restoreBody as FormData).get('file') as File | null)?.name).toBe('backup.json');
  });

  it('surfaces API error messages for login failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid username or password' }), { status: 401 }),
    );

    await expect(
      login({
        username: 'ada.admin',
        password: 'wrong-password',
      }),
    ).rejects.toEqual(new ApiClientError('Invalid username or password', 401));
  });
});
