import { defaultWorkflowMarkdown, type WorkflowVisibility as SharedWorkflowVisibility } from '@revu/contracts';

export type Audience = 'Employee' | 'Manager' | 'Admin';
export type NavGroup = 'Workspace' | 'Administration';
export type AppRole = 'employee' | 'manager' | 'admin';
export type WorkflowVisibility = SharedWorkflowVisibility;

export type AppSection = {
  id: 'dashboard' | 'employees' | 'questions' | 'assessments' | 'reviewPeriod' | 'fileManagement' | 'workflow';
  path: `/${string}`;
  group: NavGroup;
  title: string;
  summary: string;
  audience: Audience[];
  highlights: string[];
  placeholderTitle: string;
  placeholderDescription: string;
  nextSlice: string;
  showInNavigation?: boolean;
};

export const routeLegend = {
  dashboard: 'Dashboard is the single workflow action surface for authored assessments, manager follow-up, reviewer work, and admin oversight.',
  assessments: 'Assessments are employee-authored forms that staff complete before any review work begins.',
} as const;

export const workflowMarkdown = defaultWorkflowMarkdown;

export const appSections: AppSection[] = [
  {
    id: 'dashboard',
    path: '/dashboard',
    group: 'Workspace',
    title: 'Dashboard',
    summary: 'The shared operational surface for employee assessment work, due dates, submissions, and role-based workflow actions.',
    audience: ['Employee', 'Manager', 'Admin'],
    highlights: [
      'Keep authored assessment work, manager actions, reviewer follow-up, and admin oversight on one operational surface.',
      'Expose role-aware workflow sections without sending non-admin users to a separate review route.',
      'Keep the dashboard language centered on assignments, submissions, readiness, scheduling, and conclusion work.',
    ],
    placeholderTitle: 'Workflow dashboard and profile summary',
    placeholderDescription: 'Dashboard sections keep authored assessment queues, manager actions, reviewer follow-up, and admin oversight together.',
    nextSlice: 'Continue wiring the dashboard sections to the remaining scheduling and reviewer conclusion workflows.',
  },
  {
    id: 'employees',
    path: '/employees',
    group: 'Administration',
    title: 'Employees',
    summary: 'Manage employee records, reporting lines, assessor coverage, and local user transfer actions.',
    audience: ['Manager', 'Admin'],
    highlights: [
      'Separate active and inactive employee views.',
      'Keep local user import and export controls close to the employee roster.',
      'Keep employee records distinct from assessment and review workflow screens.',
    ],
    placeholderTitle: 'Employee roster and detail panel',
    placeholderDescription: 'The shell provides a roster placeholder, filters, and a detail surface for future employee profile actions.',
    nextSlice: 'Introduce list/detail state and connect employee records once the domain slice is implemented.',
  },
  {
    id: 'questions',
    path: '/questions',
    group: 'Administration',
    title: 'Questions',
    summary: 'Admin-only configuration space for self and peer question sets by review period.',
    audience: ['Admin'],
    highlights: [
      'Distinguish self question sets from peer question sets.',
      'Reserve metadata space for review period, status, instructions, and footer content.',
      'Keep question management isolated from runtime assessment and review work.',
    ],
    placeholderTitle: 'Question set management',
    placeholderDescription: 'Future work will add editors for active and archived question sets, plus import and export utilities.',
    nextSlice: 'Wire in review-period aware question set forms and import/export actions.',
  },
  {
    id: 'assessments',
    path: '/assessments',
    group: 'Administration',
    title: 'Assessments',
    summary: 'Admin-only visibility into every assessment in the active review period, separate from the dashboard workflow sections.',
    audience: ['Admin'],
    highlights: [
      'Show self and peer assessments together for the current active cycle.',
      'Keep the admin assessment listing separate from the role-based action queues on the dashboard.',
      'Give admins one place to confirm assignment sync results and current progress.',
    ],
    placeholderTitle: 'Active review period assessments',
    placeholderDescription: 'This route will show all active-period assessments with subject, assessor, and status details.',
    nextSlice: 'Add active review period assessment listing and drill-in actions for admins.',
  },
  {
    id: 'reviewPeriod',
    path: '/review-period',
    group: 'Administration',
    title: 'Review Period',
    summary: 'Admin-only controls for review-period activation, editing, archive state, and lifecycle management.',
    audience: ['Admin'],
    highlights: [
      'Keep add, edit, activate, archive, and restore controls together on one admin route.',
      'Let review-period lifecycle actions stay separate from question-set editing and backup tools.',
      'Preserve a dedicated selector here so review-period admin actions do not drive Questions page visibility.',
    ],
    placeholderTitle: 'Review period management',
    placeholderDescription: 'This route hosts review-period summaries, editing, activation, and lifecycle operations for admins.',
    nextSlice: 'Keep review-period lifecycle controls here as the broader admin workflow continues to expand.',
  },
  {
    id: 'fileManagement',
    path: '/file-management',
    group: 'Administration',
    title: 'File Management',
    summary: 'Admin import, export, and backup operations live here without mixing in review-period lifecycle management.',
    audience: ['Admin'],
    highlights: [
      'Employee and question-set transfer tools stay available beside backup operations.',
      'Backup downloads and replace-mode restores remain available while the broader file transfer migration lands.',
      'Keep operational file workflows together without coupling them to review-period activation or archive state.',
    ],
    placeholderTitle: 'Import, export, and backup operations',
    placeholderDescription: 'This route hosts the transfer and backup tools while review-period lifecycle actions stay on their own admin page.',
    nextSlice: 'Finish consolidating the remaining import and export workflows into the shared file management route.',
  },
  {
    id: 'workflow',
    path: '/workflow',
    group: 'Workspace',
    title: 'Workflow',
    summary: 'Reference the current lifecycle from review-period setup through submission, acceptance, meeting readiness, scheduling, conclusion, and archive.',
    audience: ['Employee', 'Manager', 'Admin'],
    highlights: [
      'Show the shared assessment lifecycle in one place for employees, managers, reviewers, and admins.',
      'Keep workflow guidance available from the primary sidebar navigation.',
      'Render the approved workflow copy as markdown so future edits can stay content-driven.',
    ],
    placeholderTitle: 'Assessment lifecycle reference',
    placeholderDescription: 'This route renders the complete workflow markdown and keeps it accessible from the main sidebar navigation.',
    nextSlice: 'Add deeper links from each workflow step once the destination views are fully implemented.',
  },
];

export const defaultPath = '/dashboard';
const fallbackSection = appSections[0]!;

const appSectionByPath = new Map<string, AppSection>(appSections.map((section) => [section.path, section]));
const legacyPathRedirects = new Map<string, AppSection['path']>([
  ['/archive', '/review-period'],
  ['/backups', '/file-management'],
  ['/reviews', '/dashboard'],
]);

export function normalizePath(pathname: string): string {
  if (pathname === '/') {
    return defaultPath;
  }

  const trimmedPath = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const redirectedPath = legacyPathRedirects.get(trimmedPath);
  if (redirectedPath) {
    return redirectedPath;
  }

  return appSectionByPath.has(trimmedPath) ? trimmedPath : defaultPath;
}

export function getSection(pathname: string): AppSection {
  return appSectionByPath.get(normalizePath(pathname)) ?? fallbackSection;
}

export const navGroups: NavGroup[] = ['Workspace', 'Administration'];

const audienceByRole: Record<AppRole, Audience> = {
  employee: 'Employee',
  manager: 'Manager',
  admin: 'Admin',
};

export function canAccessSection(role: AppRole, section: AppSection): boolean {
  return section.audience.includes(audienceByRole[role]);
}

export function getSectionsForRole(role: AppRole): AppSection[] {
  return appSections.filter((section) => canAccessSection(role, section));
}

function canSeeWorkflowNavigation(role: AppRole, workflowVisibility?: WorkflowVisibility): boolean {
  if (!workflowVisibility) {
    return false;
  }

  if (workflowVisibility === 'all') {
    return true;
  }

  if (workflowVisibility === 'managers') {
    return role !== 'employee';
  }

  return role === 'admin';
}

export function getNavigationSectionsForRole(role: AppRole, workflowVisibility?: WorkflowVisibility): AppSection[] {
  return getSectionsForRole(role).filter((section) => {
    if (section.showInNavigation === false) {
      return false;
    }

    if (section.id === 'workflow') {
      return canSeeWorkflowNavigation(role, workflowVisibility);
    }

    return true;
  });
}
