import { defaultWorkflowMarkdown, type WorkflowVisibility as SharedWorkflowVisibility } from '@revu/contracts';

export type Audience = 'Employee' | 'Manager' | 'Admin';
export type NavGroup = 'Workspace' | 'Administration';
export type AppRole = 'employee' | 'manager' | 'admin';
export type WorkflowVisibility = SharedWorkflowVisibility;

export type AppSection = {
  id: 'dashboard' | 'reviews' | 'employees' | 'questions' | 'assessments' | 'reviewPeriod' | 'fileManagement' | 'workflow';
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
  assessments: 'Assessments are employee-authored forms that staff complete before any review work begins.',
  reviews: 'Reviews are manager and admin actions taken after an assessment is accepted.',
} as const;

export const workflowMarkdown = defaultWorkflowMarkdown;

export const appSections: AppSection[] = [
  {
    id: 'dashboard',
    path: '/dashboard',
    group: 'Workspace',
    title: 'Dashboard',
    summary: 'A shared landing page for employee assessment work, due dates, and role-based shortcuts into manager and admin areas.',
    audience: ['Employee', 'Manager', 'Admin'],
    highlights: [
      'Reserve space for profile details plus assessment queues grouped by status.',
      'Expose manager and admin shortcuts without mixing them into employee-authored assessment tasks.',
      'Keep the dashboard language centered on assignments, drafts, and submissions.',
    ],
    placeholderTitle: 'Assessment queues and profile summary',
    placeholderDescription: 'Placeholder cards mark where personal profile details, self assessments, and peer assessments will render once assignment data is wired in.',
    nextSlice: 'Connect the dashboard placeholders to assignment and assessment summary endpoints.',
  },
  {
    id: 'reviews',
    path: '/reviews',
    group: 'Workspace',
    title: 'Reviews',
    summary: 'Manager and admin review actions live here, separate from employee-authored assessments and drafts.',
    audience: ['Manager', 'Admin'],
    highlights: [
      'Track accepted assessments that still need review work.',
      'Preserve clear transitions from submitted to accepted to reviewed.',
      'Hold space for accept, reject, review, and archive actions without implementing them yet.',
    ],
    placeholderTitle: 'Review inbox and action rail',
    placeholderDescription: 'This slice will later host review queues, compact response views, and workflow actions for managers and admins.',
    nextSlice: 'Add data-backed review lists and review panel scaffolding after the API contracts land.',
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
    summary: 'Admin-only visibility into every assessment in the active review period, separate from the manager review queue.',
    audience: ['Admin'],
    highlights: [
      'Show self and peer assessments together for the current active cycle.',
      'Keep assessment status visibility separate from review actions on the Reviews page.',
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
    summary: 'Reference the full review lifecycle from review-period setup through assessment submission, review, finalization, and archive.',
    audience: ['Employee', 'Manager', 'Admin'],
    highlights: [
      'Show the shared review lifecycle in one place for employees, managers, and admins.',
      'Keep workflow guidance available from the primary sidebar navigation.',
      'Render the approved workflow copy as markdown so future edits can stay content-driven.',
    ],
    placeholderTitle: 'Review workflow reference',
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
  const visibleSections = getSectionsForRole(role).filter((section) => {
    if (section.showInNavigation === false) {
      return false;
    }

    if (section.id === 'workflow') {
      return canSeeWorkflowNavigation(role, workflowVisibility);
    }

    return true;
  });

  const workflowSection = visibleSections.find((section) => section.id === 'workflow');
  if (!workflowSection) {
    return visibleSections;
  }

  const sectionsWithoutWorkflow = visibleSections.filter((section) => section.id !== 'workflow');
  const reviewsIndex = sectionsWithoutWorkflow.findIndex((section) => section.id === 'reviews');
  if (reviewsIndex < 0) {
    return [...sectionsWithoutWorkflow, workflowSection];
  }

  return [
    ...sectionsWithoutWorkflow.slice(0, reviewsIndex + 1),
    workflowSection,
    ...sectionsWithoutWorkflow.slice(reviewsIndex + 1),
  ];
}
