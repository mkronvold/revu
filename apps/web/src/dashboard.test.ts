import { employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { describe, expect, it } from 'vitest';

import { buildDashboardSnapshot } from './dashboard';

describe('integrated dashboard snapshot', () => {
  it('keeps employee dashboards centered on authored assessments', () => {
    const employee = employeesListExample.items.find((candidate) => candidate.username === 'elliot.employee')!;
    const snapshot = buildDashboardSnapshot(employee, foundationSnapshotExample, employeesListExample.items);

    expect(snapshot.dueLabel).toBe('Complete by 2/28/2026');
    expect(snapshot.reviewSummary).toMatch(/employee dashboard stays centered on assessments/i);
    expect(snapshot.queues[3]?.items[0]?.title).toContain('2026 Self-Assessment');
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
});
