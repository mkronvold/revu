export type Audience = 'Employee' | 'Manager' | 'Admin';
export type NavGroup = 'Workspace' | 'Administration';
export type AppRole = 'employee' | 'manager' | 'admin';

export type AppSection = {
  id: 'dashboard' | 'reviews' | 'employees' | 'questions' | 'assignments' | 'archive';
  path: `/${string}`;
  group: NavGroup;
  title: string;
  summary: string;
  audience: Audience[];
  highlights: string[];
  placeholderTitle: string;
  placeholderDescription: string;
  nextSlice: string;
};

export const routeLegend = {
  assessments: 'Assessments are employee-authored forms that staff complete before any review work begins.',
  reviews: 'Reviews are manager and admin actions taken after an assessment is accepted.',
} as const;

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
    summary: 'Employee management screens for managers and admins, including lifecycle state, reporting lines, and assessor assignments.',
    audience: ['Manager', 'Admin'],
    highlights: [
      'Separate active and inactive employee views.',
      'Reserve room for local user management and future import/export controls.',
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
    id: 'assignments',
    path: '/assignments',
    group: 'Administration',
    title: 'Assignments',
    summary: 'Admin assignment planning for employee, manager, and peer reviewer relationships across a review period.',
    audience: ['Admin'],
    highlights: [
      'Center the layout on employee, manager, and assigned peer reviewer columns.',
      'Preserve room for bulk import/export operations.',
      'Treat assignment setup as a planning surface, not as an assessment editing experience.',
    ],
    placeholderTitle: 'Assignment matrix',
    placeholderDescription: 'A structured placeholder is ready for future assignment tables, batch tools, and review-period filters.',
    nextSlice: 'Add editable assignment tables after employee and review-period contracts are available.',
  },
  {
    id: 'archive',
    path: '/archive',
    group: 'Administration',
    title: 'Archive',
    summary: 'Admin archive management for review periods and their read-only historical data.',
    audience: ['Admin'],
    highlights: [
      'Archive actions happen at the review-period level.',
      'Archived content becomes read-only and moves out of active workflow views.',
      'Keep archive controls explicit so they are not confused with review completion.',
    ],
    placeholderTitle: 'Review-period archive controls',
    placeholderDescription: 'This shell reserves space for archive and unarchive actions plus a list of review periods and historical counts.',
    nextSlice: 'Implement archive state management once review-period APIs and policies are available.',
  },
];

export const defaultPath = '/dashboard';
const fallbackSection = appSections[0]!;

const appSectionByPath = new Map<string, AppSection>(appSections.map((section) => [section.path, section]));

export function normalizePath(pathname: string): string {
  if (pathname === '/') {
    return defaultPath;
  }

  const trimmedPath = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
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
