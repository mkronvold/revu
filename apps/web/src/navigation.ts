export type Audience = 'Employee' | 'Manager' | 'Admin';
export type NavGroup = 'Workspace' | 'Administration';
export type AppRole = 'employee' | 'manager' | 'admin';

export type AppSection = {
  id: 'dashboard' | 'reviews' | 'employees' | 'questions' | 'fileManagement' | 'workflow';
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

export const workflowMarkdown = `### New \`Review Period\` begins
- HR Admin generates a \`Review Period\` and \`Question Sets\` for Self-assessment and Peer-assessment
- Managers assign peers to assess employees
- All Employees complete and submit Self-Assessments and Peer-Assessments assigned to them
- Managers accept and review submitted Assessments and add their comments
- Completed Reviews are finalized by HR Admin
- When the \`Review Period\` is complete, HR Admin archives them.`;

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
    id: 'fileManagement',
    path: '/file-management',
    group: 'Administration',
    title: 'File Management',
    summary: 'Admin archive and backup operations live together here so review-period retention and restore work stays in one place.',
    audience: ['Admin'],
    highlights: [
      'Archive actions still happen at the review-period level and stay distinct from review completion.',
      'Backup downloads and replace-mode restores remain available while the broader file transfer migration lands.',
      'Keep archive and backup controls together so administrators have one operational workspace.',
    ],
    placeholderTitle: 'Archive and backup operations',
    placeholderDescription: 'This route now hosts the archive controls and backup tools while remaining import and export actions move here in a later slice.',
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
      'Keep workflow guidance available from the sidebar without adding another primary navigation item.',
      'Render the approved workflow copy as markdown so future edits can stay content-driven.',
    ],
    placeholderTitle: 'Review workflow reference',
    placeholderDescription: 'This route renders the complete workflow markdown and keeps it accessible from the sidebar card.',
    nextSlice: 'Add deeper links from each workflow step once the destination views are fully implemented.',
    showInNavigation: false,
  },
];

export const defaultPath = '/dashboard';
const fallbackSection = appSections[0]!;

const appSectionByPath = new Map<string, AppSection>(appSections.map((section) => [section.path, section]));
const legacyPathRedirects = new Map<string, AppSection['path']>([
  ['/archive', '/file-management'],
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

export function getNavigationSectionsForRole(role: AppRole): AppSection[] {
  return getSectionsForRole(role).filter((section) => section.showInNavigation !== false);
}
