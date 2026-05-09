import { adminEmployeeExample, adminLoginExample, employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApiClientError,
  acceptAssessment,
  apiBaseUrl,
  getEmployee,
  getFoundation,
  listAssessments,
  listEmployees,
  login,
  reassignAssessment,
  reviewAssessment,
  submitAssessment,
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
