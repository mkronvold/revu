import type { AppRole } from './navigation';

export type EmployeeStatus = 'active' | 'inactive';

export type EmployeeRecord = {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
  status: EmployeeStatus;
  managerId: string | null;
  assessorId: string | null;
  title: string;
  department: string;
  location: string;
  notes: string;
};

export type PasswordAction = 'seeded' | 'set' | 'reset';

export type PasswordState = {
  current: string;
  lastAction: PasswordAction;
  helperText: string;
  updatedAt: string;
  temporaryPassword: string | null;
};

export type DashboardQueueItem = {
  title: string;
  actionLabel: string;
  detail: string;
};

export type DashboardQueue = {
  title: string;
  note?: string;
  items: DashboardQueueItem[];
};

export type DashboardSnapshot = {
  dueLabel: string;
  queues: DashboardQueue[];
  reviewSummary: string;
  adminSummary: string | null;
};

export const demoEmployees: EmployeeRecord[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    fullName: 'Ada Admin',
    email: 'ada.admin@example.com',
    role: 'admin',
    status: 'active',
    managerId: null,
    assessorId: null,
    title: 'People Operations Lead',
    department: 'Operations',
    location: 'Remote',
    notes: 'Owns review-cycle setup, archive controls, and employee password administration.',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    fullName: 'Manny Manager',
    email: 'manny.manager@example.com',
    role: 'manager',
    status: 'active',
    managerId: '11111111-1111-4111-8111-111111111111',
    assessorId: '44444444-4444-4444-8444-444444444444',
    title: 'Engineering Manager',
    department: 'Engineering',
    location: 'Chicago',
    notes: 'Can review accepted assessments and update employee reporting relationships.',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    fullName: 'Elliot Employee',
    email: 'elliot.employee@example.com',
    role: 'employee',
    status: 'active',
    managerId: '22222222-2222-4222-8222-222222222222',
    assessorId: '44444444-4444-4444-8444-444444444444',
    title: 'Product Designer',
    department: 'Product',
    location: 'Remote',
    notes: 'Has a self assessment ready to submit and a peer assessment waiting for acceptance.',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    fullName: 'Pat Peer',
    email: 'pat.peer@example.com',
    role: 'employee',
    status: 'active',
    managerId: '22222222-2222-4222-8222-222222222222',
    assessorId: '33333333-3333-4333-8333-333333333333',
    title: 'Staff Engineer',
    department: 'Engineering',
    location: 'Austin',
    notes: 'Frequently assigned as a peer reviewer during the annual cycle.',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    fullName: 'Casey Contributor',
    email: 'casey.contributor@example.com',
    role: 'employee',
    status: 'active',
    managerId: '22222222-2222-4222-8222-222222222222',
    assessorId: '44444444-4444-4444-8444-444444444444',
    title: 'QA Analyst',
    department: 'Engineering',
    location: 'Denver',
    notes: 'Started a self assessment but still has narrative responses to finish.',
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    fullName: 'Ivy Inactive',
    email: 'ivy.inactive@example.com',
    role: 'employee',
    status: 'inactive',
    managerId: '22222222-2222-4222-8222-222222222222',
    assessorId: '44444444-4444-4444-8444-444444444444',
    title: 'Former Support Lead',
    department: 'Support',
    location: 'Seattle',
    notes: 'Kept in the directory for historical review references only.',
  },
];

export const demoPasswords: Record<string, PasswordState> = {
  '11111111-1111-4111-8111-111111111111': {
    current: 'admin123',
    lastAction: 'seeded',
    helperText: 'Seeded local password for the admin demo account.',
    updatedAt: '2026-05-01 09:00',
    temporaryPassword: null,
  },
  '22222222-2222-4222-8222-222222222222': {
    current: 'manager123',
    lastAction: 'seeded',
    helperText: 'Seeded local password for the manager demo account.',
    updatedAt: '2026-05-01 09:00',
    temporaryPassword: null,
  },
  '33333333-3333-4333-8333-333333333333': {
    current: 'employee123',
    lastAction: 'seeded',
    helperText: 'Seeded local password for the employee demo account.',
    updatedAt: '2026-05-01 09:00',
    temporaryPassword: null,
  },
  '44444444-4444-4444-8444-444444444444': {
    current: 'peer123',
    lastAction: 'seeded',
    helperText: 'Seeded local password for the peer reviewer demo account.',
    updatedAt: '2026-05-01 09:00',
    temporaryPassword: null,
  },
  '55555555-5555-4555-8555-555555555555': {
    current: 'casey123',
    lastAction: 'seeded',
    helperText: 'Seeded local password for another employee account.',
    updatedAt: '2026-05-01 09:00',
    temporaryPassword: null,
  },
  '66666666-6666-4666-8666-666666666666': {
    current: 'inactive123',
    lastAction: 'seeded',
    helperText: 'Inactive accounts cannot sign in even if a password exists.',
    updatedAt: '2026-05-01 09:00',
    temporaryPassword: null,
  },
};

export const dashboardSnapshotsByEmployeeId: Record<string, DashboardSnapshot> = {
  '11111111-1111-4111-8111-111111111111': {
    dueLabel: 'Complete by 5/27/2026',
    queues: [
      {
        title: 'Complete by 5/27/2026',
        items: [{ title: '2026 Self-Assessment', actionLabel: 'View', detail: 'Admin completion is optional for the demo account.' }],
      },
      {
        title: 'Started but not completed',
        items: [],
      },
      {
        title: 'Complete but not submitted yet',
        items: [],
      },
      {
        title: 'Complete but not accepted yet',
        items: [],
      },
      {
        title: 'Complete',
        items: [{ title: '2025 Peer-Assessment for Elliot Employee', actionLabel: 'View', detail: 'Read-only historical example.' }],
      },
    ],
    reviewSummary: '4 submitted assessments or accepted sets need dashboard follow-up.',
    adminSummary: '3 employee records have pending directory or password follow-up tasks.',
  },
  '22222222-2222-4222-8222-222222222222': {
    dueLabel: 'Complete by 5/27/2026',
    queues: [
      {
        title: 'Complete by 5/27/2026',
        items: [{ title: '2026 Self-Assessment', actionLabel: 'Edit', detail: 'Managers can still complete their own self assessments.' }],
      },
      {
        title: 'Started but not completed',
        items: [],
      },
      {
        title: 'Complete but not submitted yet',
        items: [],
      },
      {
        title: 'Complete but not accepted yet',
        items: [],
      },
      {
        title: 'Complete',
        items: [{ title: '2025 Peer-Assessment for Casey Contributor', actionLabel: 'View', detail: 'Finished example kept on the dashboard.' }],
      },
    ],
    reviewSummary: '2 accepted assessment sets are ready for meeting follow-up.',
    adminSummary: null,
  },
  '33333333-3333-4333-8333-333333333333': {
    dueLabel: 'Complete by 5/27/2026',
    queues: [
      {
        title: 'Complete by 5/27/2026',
        items: [{ title: '2026 Peer-Assessment for Pat Peer', actionLabel: 'Edit', detail: 'Assigned peer feedback that still needs a final pass.' }],
      },
      {
        title: 'Started but not completed',
        items: [],
      },
      {
        title: 'Complete but not submitted yet',
        items: [{ title: '2026 Self-Assessment', actionLabel: 'Edit', detail: 'Draft saved with narrative notes still in progress.' }],
      },
      {
        title: 'Complete but not accepted yet',
        items: [{ title: '2026 Peer-Assessment for Casey Contributor', actionLabel: 'View', detail: 'Submitted and waiting on manager acceptance.' }],
      },
      {
        title: 'Complete',
        items: [],
      },
    ],
    reviewSummary: 'No workflow follow-up is assigned right now. Dashboard stays centered on authored assessments.',
    adminSummary: null,
  },
  '44444444-4444-4444-8444-444444444444': {
    dueLabel: 'Complete by 5/27/2026',
    queues: [
      {
        title: 'Complete by 5/27/2026',
        items: [{ title: '2026 Peer-Assessment for Elliot Employee', actionLabel: 'Edit', detail: 'Peer feedback assignment due this cycle.' }],
      },
      {
        title: 'Started but not completed',
        items: [],
      },
      {
        title: 'Complete but not submitted yet',
        items: [],
      },
      {
        title: 'Complete but not accepted yet',
        items: [],
      },
      {
        title: 'Complete',
        items: [{ title: '2025 Peer-Assessment for Manny Manager', actionLabel: 'View', detail: 'Finished example kept in the demo data.' }],
      },
    ],
    reviewSummary: 'No dashboard workflow actions are assigned right now. Peer reviewer dashboard remains employee-focused.',
    adminSummary: null,
  },
  '55555555-5555-4555-8555-555555555555': {
    dueLabel: 'Complete by 5/27/2026',
    queues: [
      {
        title: 'Complete by 5/27/2026',
        items: [{ title: '2026 Self-Assessment', actionLabel: 'Edit', detail: 'Due soon with one ranking question still unanswered.' }],
      },
      {
        title: 'Started but not completed',
        items: [{ title: '2026 Peer-Assessment for Elliot Employee', actionLabel: 'Edit', detail: 'Saved after the first narrative response.' }],
      },
      {
        title: 'Complete but not submitted yet',
        items: [],
      },
      {
        title: 'Complete but not accepted yet',
        items: [],
      },
      {
        title: 'Complete',
        items: [],
      },
    ],
    reviewSummary: 'No workflow follow-up is assigned right now.',
    adminSummary: null,
  },
};

export function authenticateDemoUser(
  email: string,
  password: string,
  employees: EmployeeRecord[],
  passwords: Record<string, PasswordState>,
): { ok: true; employee: EmployeeRecord } | { ok: false; error: string } {
  const normalizedEmail = email.trim().toLowerCase();
  const employee = employees.find((candidate) => candidate.email.toLowerCase() === normalizedEmail);

  if (!employee) {
    return { ok: false, error: 'We could not find that local demo account.' };
  }

  if (employee.status !== 'active') {
    return { ok: false, error: 'Inactive employees cannot sign in to the workspace.' };
  }

  const passwordState = passwords[employee.id];
  if (!passwordState || passwordState.current !== password) {
    return { ok: false, error: 'That password does not match the selected demo account.' };
  }

  return { ok: true, employee };
}

export function buildTemporaryPassword(employeeId: string): string {
  return `Temp-${employeeId.slice(0, 4)}-Revu!`;
}

export function getRoleLabel(role: AppRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function getStatusLabel(status: EmployeeStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
