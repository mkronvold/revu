import { employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { describe, expect, it } from 'vitest';

import { buildDashboardSnapshot } from './dashboard';

describe('integrated dashboard snapshot', () => {
  it('keeps employee dashboards centered on authored assessments', () => {
    const employee = employeesListExample.items.find((candidate) => candidate.username === 'elliot.employee')!;
    const snapshot = buildDashboardSnapshot(employee, foundationSnapshotExample, employeesListExample.items);

    expect(snapshot.dueLabel).toBe('Complete by 2/28/2026');
    expect(snapshot.reviewSummary).toMatch(/employee dashboard stays centered on assessments/i);
    expect(snapshot.queues[3]?.items[0]?.title).toContain('2026 Self Assessment - Elliot Employee');
  });

  it('shows review attention counts for managers and admin directory follow-up', () => {
    const manager = employeesListExample.items.find((candidate) => candidate.username === 'manny.manager')!;
    const admin = employeesListExample.items.find((candidate) => candidate.username === 'ada.admin')!;

    const managerSnapshot = buildDashboardSnapshot(manager, foundationSnapshotExample, employeesListExample.items);
    const adminSnapshot = buildDashboardSnapshot(admin, foundationSnapshotExample, [
      ...employeesListExample.items,
      {
        ...employeesListExample.items[3]!,
        id: '55555555-5555-4555-8555-555555555555',
        username: 'ivy.inactive',
        fullName: 'Ivy Inactive',
        email: 'ivy.inactive@example.com',
        status: 'inactive',
      },
    ]);

    expect(managerSnapshot.reviewSummary).toMatch(/manager attention/i);
    expect(adminSnapshot.adminSummary).toMatch(/inactive employee records/i);
  });

  it('keeps partially answered authored assessments visible in the in-progress queue', () => {
    const employee = employeesListExample.items.find((candidate) => candidate.username === 'elliot.employee')!;
    const snapshot = buildDashboardSnapshot(
      employee,
      {
        ...foundationSnapshotExample,
        assessments: [
          {
            ...foundationSnapshotExample.assessments[0]!,
            id: '12121212-1212-4212-8212-121212121212',
            reviewState: 'new',
            submittedAt: null,
            acceptedAt: null,
            acceptedByEmployeeId: null,
            responses: [
              {
                questionId: 'aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa',
                order: 1,
                response: 'agree',
              },
              {
                questionId: 'aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa',
                order: 2,
                response: '',
              },
            ],
          },
        ],
      },
      employeesListExample.items,
    );

    expect(snapshot.queues[0]?.items).toHaveLength(0);
    expect(snapshot.queues[1]?.items[0]?.title).toContain('2026 Self Assessment - Elliot Employee');
    expect(snapshot.queues[1]?.items[0]?.statusLabel).toBe('Draft');
  });

  it('surfaces complete authored assessments even when legacy data still marks them new', () => {
    const employee = employeesListExample.items.find((candidate) => candidate.username === 'elliot.employee')!;
    const snapshot = buildDashboardSnapshot(
      employee,
      {
        ...foundationSnapshotExample,
        assessments: [
          {
            ...foundationSnapshotExample.assessments[0]!,
            id: '34343434-3434-4434-8434-343434343434',
            reviewState: 'new',
            submittedAt: null,
            acceptedAt: null,
            acceptedByEmployeeId: null,
          },
        ],
      },
      employeesListExample.items,
    );

    expect(snapshot.queues[2]?.items[0]?.title).toContain('2026 Self Assessment - Elliot Employee');
    expect(snapshot.queues[2]?.items[0]?.statusLabel).toBe('Ready to submit');
  });
});
