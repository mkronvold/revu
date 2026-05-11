import type {
  AssessmentReviewState,
  AuthSession,
  BackupSchedule,
  BackupRestoreScope,
  BackupStoredFile,
  BackupStatusResponse,
  Employee,
  EmployeeAdmin,
  FoundationSnapshot,
  LocalUsersExportMode,
  QuestionSet,
  QuestionTarget,
  ReviewPeriod,
} from '@revu/contracts';
import { backupSnapshotSchema, defaultWorkflowVisibility } from '@revu/contracts';
import { ChangeEvent, FormEvent, KeyboardEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ApiClientError,
  apiUnavailableEventName,
  checkApiHealth,
  changePassword,
  createEmployee,
  createStoredBackup,
  deleteEmployee,
  deleteStoredBackup,
  downloadStoredBackup,
  getApiIndex,
  getEmployee,
  getBackupStatus,
  getFoundation,
  listQuestionCategories,
  listStoredBackups,
  listEmployees,
  login,
  logout,
  me,
  resetEmployeePassword,
  restoreStoredBackup,
  setEmployeePassword,
  uploadStoredBackup,
  updateOwnProfile,
  updateBackupStatus,
  updateEmployee,
  updateQuestionCategories,
  updateWorkflowSettings,
} from './api';
import { buildDashboardSnapshot, type DashboardActionItem } from './dashboard';
import {
  appSections,
  defaultPath,
  getNavigationSectionsForRole,
  getSection,
  getSectionsForRole,
  navGroups,
  normalizePath,
  workflowMarkdown,
  type AppRole,
  type WorkflowVisibility,
} from './navigation';
import {
  buildAdminAssessmentSummary,
  type AdminAssessmentRow,
  type AssessmentEditorQuestion,
  buildAdminAssessmentRows,
  buildReviewQueues,
  createAssessmentWorkflowSnapshot,
  formatSubjectiveResponse,
  getAssessmentEditor,
  getAssessmentSetWorkflowPanel,
  groupAssessmentEditorQuestions,
  getReviewPanel,
} from './assessmentReview';
import {
  acceptReviewToApi,
  concludeAssessmentSetInApi,
  deleteAssessmentByAdminInApi,
  markAssessmentSetReadyForMeetingInApi,
  rejectReviewToApi,
  saveAssessmentDraftToApi,
  scheduleAssessmentSetInApi,
  submitAssessmentToApi,
  updateAssessmentByAdminInApi,
} from './assessmentReviewApi';
import {
  buildAssignmentRows,
  createReviewAdminSnapshot,
  getPreferredReviewPeriodId,
  getReviewPeriodQuestionSet,
  getReviewPeriodSummary,
  toQuestionSetDraft,
  toReviewPeriodDraft,
  type QuestionSetDraft,
  type ReviewAdminSnapshot,
  type ReviewPeriodDraft,
} from './reviewAdmin';
import {
  buildQuestionCategorySuggestions,
  MarkdownContent,
} from './questionPresentation';
import {
  buildAssignmentsExportFilename,
  buildAssignmentsExportNotice,
  buildAssignmentsImportNotice,
  buildAssignmentsImportPayload,
  buildDeleteReviewPeriodConfirmation,
  buildLocalUsersExportNotice,
  buildLocalUsersImportNotice,
  buildQuestionSetExportFilename,
  buildQuestionSetExportNotice,
  buildQuestionSetImportNotice,
  buildQuestionSetsImportPayload,
  clearReadyAssessmentsForReviewPeriod,
  copyQuestionSetToReviewPeriodInApi,
  deleteReviewPeriodFromApi,
  buildLocalUsersImportPayloadFromFile,
  exportAssignmentsFromApi,
  exportLocalUsersFromApi,
  exportQuestionSetsFromApi,
  importAssignmentsFromApi,
  importLocalUsersFromApi,
  importQuestionSetsFromApi,
  saveAssignmentToApi,
  saveQuestionSetToApi,
  serializeAssignmentsTransfer,
  serializeLocalUsersTransfer,
  serializeQuestionSetsTransfer,
  syncAssessmentsForReviewPeriod,
  triggerDownload,
  saveReviewPeriodToApi,
  toggleReviewPeriodArchiveInApi,
  type TransferFormat,
} from './reviewAdminApi';
import { getRuntimeCompanyName, getRuntimeRevision, questionSetStatusEnabled } from './runtimeConfig';
import {
  getNextThemePreference,
  getThemeColorScheme,
  getThemeLabel,
  normalizeThemePreference,
  themeStyleOverrides,
  type ThemePreference,
} from './theme';

const configuredCompanyName = getRuntimeCompanyName() ?? import.meta.env.VITE_COMPANY_NAME?.trim() ?? null;
const companyName = configuredCompanyName ? configuredCompanyName : null;
const revuRepositoryUrl = 'https://github.com/mkronvold/revu';
const buildRevision = getRuntimeRevision();
const sessionStorageKey = 'revu-session-token';
const loginUsernameStorageKey = 'revu-login-username';
const themeStorageKey = 'revu-theme-preference';
const sidebarCollapsedStorageKey = 'revu-sidebar-collapsed';
const lastResponseTimeoutMs = 120000;
const newQuestionCategoryOptionValue = '__new-question-category__';
const backupScheduleOptions: BackupSchedule[] = ['1hr', '3hr', '6hr', '12hr', 'daily', 'weekly'];
const deletedUserLabel = 'deleted user';

type QuestionSetQuestionDraft = QuestionSetDraft['questions'][number];
type BackupSettingsDraft = {
  automaticBackupsEnabled: boolean;
  schedule: BackupSchedule;
  retentionCount: string;
};

type BackupDownloadDialogState = {
  fileName: string;
};

type BackupRestoreDialogState = {
  file: BackupStoredFile;
};

type AssessmentSetDialogState = {
  reviewPeriodId: string;
  employeeId: string;
};

type ReviewerNotesDraft = Record<'reviewer1' | 'reviewer2', string>;

function createEmptyReviewerNotesDraft(): ReviewerNotesDraft {
  return {
    reviewer1: '',
    reviewer2: '',
  };
}

const questionTypeHelperOptions = {
  subjective: ['Strongly agree', 'Somewhat agree', 'Neutral', 'Somewhat disagree', 'Strongly disagree'],
  ranking: ['Strongly agree', 'Somewhat agree', "Don't know", 'Somewhat disagree', 'Strongly disagree'],
} as const satisfies Record<Exclude<QuestionSetQuestionDraft['type'], 'narrative'>, readonly string[]>;

const assessmentResponseOptions = {
  subjective: [
    { value: 'strongly agree', label: 'Strongly agree' },
    { value: 'somewhat agree', label: 'Somewhat agree' },
    { value: 'not sure', label: 'Neutral' },
    { value: 'somewhat disagree', label: 'Somewhat disagree' },
    { value: 'strongly disagree', label: 'Strongly disagree' },
  ],
  ranking: [
    { value: '4', label: 'Strongly agree' },
    { value: '3', label: 'Somewhat agree' },
    { value: '0', label: "Don't know" },
    { value: '2', label: 'Somewhat disagree' },
    { value: '1', label: 'Strongly disagree' },
  ],
} as const satisfies Record<
  Exclude<QuestionSetQuestionDraft['type'], 'narrative'>,
  readonly { value: string; label: string }[]
>;

const adminAssessmentStateOptions = [
  { value: 'new', label: 'Not started' },
  { value: 'draft', label: 'Incomplete' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'ready_for_meeting', label: 'Ready for meeting' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'concluded', label: 'Concluded' },
] as const satisfies readonly { value: Exclude<AssessmentReviewState, 'reviewed'>; label: string }[];

function normalizeAdminAssessmentState(
  reviewState: AssessmentReviewState,
): Exclude<AssessmentReviewState, 'reviewed'> {
  return reviewState === 'reviewed' ? 'accepted' : reviewState;
}

function normalizeOptionalAssessmentNotes(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function serializeQuestionSetDraft(draft: QuestionSetDraft) {
  return JSON.stringify(draft);
}

function serializeQuestionDraft(draft: QuestionSetQuestionDraft) {
  return JSON.stringify(draft);
}

function createBlankQuestionSetDraft(draft: QuestionSetDraft): QuestionSetDraft {
  return {
    ...draft,
    title: '',
    status: questionSetStatusEnabled ? 'draft' : 'active',
    headerMarkdown: '',
    footerMarkdown: '',
    questions: [],
  };
}

function serializeWorkflowDraft(markdown: string, visibility: WorkflowVisibility) {
  return JSON.stringify({ markdown, visibility });
}

function renderQuestionTypeHelper(type: QuestionSetQuestionDraft['type']) {
  if (type === 'narrative') {
    return (
      <div className="toolbar-note question-response-helper question-response-helper-narrative">
        <p>Use a written self-rating with supporting context and examples.</p>
        <textarea
          aria-hidden="true"
          className="question-response-helper-textarea"
          disabled
          placeholder="Share context and examples..."
          rows={4}
        />
      </div>
    );
  }

  return (
    <div className="toolbar-note question-response-helper question-response-helper-options" role="presentation">
      {questionTypeHelperOptions[type].map((option) => (
        <label className="question-response-helper-option" key={option}>
          <input type="radio" disabled />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}

function renderQuestionTypePreview(question: Pick<QuestionSetQuestionDraft, 'prompt' | 'type'>) {
  return (
    <div className="subcard question-edit-response-preview">
      <MarkdownContent
        markdown={question.prompt || 'No prompt yet.'}
        className="markdown-content question-prompt-markdown question-edit-response-preview-copy"
      />
      {renderQuestionTypeHelper(question.type)}
    </div>
  );
}

function normalizeAssessmentResponseValue(type: AssessmentEditorQuestion['type'], response: string) {
  const normalized = response.trim().toLowerCase();

  if (type === 'narrative' || !normalized) {
    return response;
  }

  if (type === 'subjective') {
    switch (normalized) {
      case '4':
      case 'strongly agree':
        return 'strongly agree';
      case '3':
      case 'agree':
      case 'somewhat agree':
        return 'somewhat agree';
      case '2':
      case 'disagree':
      case 'somewhat disagree':
        return 'somewhat disagree';
      case '1':
      case 'strongly disagree':
        return 'strongly disagree';
      case '0':
      case 'dont know':
      case "don't know":
      case 'neutral':
      case 'not sure':
      case 'n/a':
      case 'na':
        return 'not sure';
      default:
        return normalized;
    }
  }

  switch (normalized) {
    case 'strongly agree':
      return '4';
    case 'agree':
    case 'somewhat agree':
      return '3';
    case 'disagree':
    case 'somewhat disagree':
      return '2';
    case 'strongly disagree':
      return '1';
    case 'dont know':
    case "don't know":
    case 'not sure':
    case 'n/a':
    case 'na':
      return '0';
    default:
      return normalized;
  }
}

function getBackupScheduleLabel(schedule: BackupSchedule) {
  return schedule;
}

function toBackupSettingsDraft(status: BackupStatusResponse): BackupSettingsDraft {
  return {
    automaticBackupsEnabled: status.automaticBackupsEnabled,
    schedule: status.schedule,
    retentionCount: String(status.retentionCount),
  };
}

type EmployeeDraft = {
  id: string | null;
  username: string;
  fullName: string;
  email: string;
  role: AppRole;
  status: 'active' | 'inactive';
  managerId: string;
  assessor1Id: string;
  assessor2Id: string;
  reviewer1Id: string;
  reviewer2Id: string;
  initialPassword: string;
};

type ProfileDraft = {
  fullName: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

type DemoAccount = {
  fullName: string;
  role: AppRole;
  username: string;
  password: string;
};

const demoAccounts: DemoAccount[] = [
  {
    fullName: 'Ada Admin',
    role: 'admin',
    username: 'ada.admin',
    password: 'AdminPass123!',
  },
  {
    fullName: 'Manny Manager',
    role: 'manager',
    username: 'manny.manager',
    password: 'ManagerPass123!',
  },
  {
    fullName: 'Elliot Employee',
    role: 'employee',
    username: 'elliot.employee',
    password: 'EmployeePass123!',
  },
  {
    fullName: 'Pat Peer',
    role: 'employee',
    username: 'pat.peer',
    password: 'PeerPass123!',
  },
];

const localUserExportModeOptions: Array<{
  value: LocalUsersExportMode;
  label: string;
  description: string;
}> = [
  {
    value: 'rotate-passcodes',
    label: 'Generate new passcodes and sign everyone out',
    description: 'Exports one-time passcodes, rotates every exported credential, and signs exported users out immediately.',
  },
  {
    value: 'preserve-passwords',
    label: 'Leave passwords and session status untouched',
    description: 'Exports credential-safe data without rotating passwords or ending active sessions.',
  },
];

function buildLocalUserExportConfirmation(format: TransferFormat, mode: LocalUsersExportMode) {
  return mode === 'rotate-passcodes'
    ? `Exporting local users will rotate every exported password into a generated one-time passcode, sign every exported user out, and include the passcodes in the export. Continue with the ${format.toUpperCase()} export?`
    : `Exporting local users in preserve-passwords mode will leave passwords and active sessions untouched. Continue with the ${format.toUpperCase()} export?`;
}

function getStoredSidebarCollapsed() {
  return window.localStorage.getItem(sidebarCollapsedStorageKey) === 'true';
}

function getStoredLoginUsername() {
  return window.localStorage.getItem(loginUsernameStorageKey) ?? '';
}

type BackupRestoreAction = {
  target: BackupRestoreScope;
  title: string;
  description: string;
  warning: string;
};

const backupRestoreActions: BackupRestoreAction[] = [
  {
    target: 'all',
    title: 'Restore all',
    description: 'Replace all users plus all review data from the uploaded backup.',
    warning:
      'Restore all uses replace semantics. It deletes current users, review periods, question sets, assignments, assessments, and every active session before loading the uploaded backup.',
  },
  {
    target: 'users',
    title: 'Restore users',
    description: 'Replace employee accounts from the uploaded backup and sign everyone out.',
    warning:
      'Restore users uses replace semantics. It deletes current employee sessions and removes any users that are not present in the uploaded backup.',
  },
  {
    target: 'questions',
    title: 'Restore questions',
    description: 'Replace workflow settings, review periods, and question sets from the uploaded backup.',
    warning:
      'Restore questions uses replace semantics. It replaces workflow settings, review periods, and question sets only, and it will fail unless assignments and assessments are already cleared.',
  },
  {
    target: 'reviews',
    title: 'Restore reviews',
    description: 'Replace workflow settings, review periods, question sets, assignments, and assessments from the uploaded backup.',
    warning:
      'Restore reviews uses replace semantics. It overwrites current workflow settings, review periods, question sets, assignments, assessments, and review events with the uploaded backup.',
  },
];

function formatBackupSize(sizeBytes: number) {
  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

function buildBackupRestoreConfirmation(action: BackupRestoreAction, fileName: string) {
  return `${action.warning} Continue with ${action.title.toLowerCase()} using ${fileName}?`;
}

function buildBackupRestoreNotice(
  target: BackupRestoreScope,
  fileName: string,
  counts: {
    users: number;
    reviewPeriods: number;
    questionSets: number;
    assignments: number;
    assessments: number;
  },
) {
  if (target === 'users') {
    return `Restored users from ${fileName} with replace semantics. Loaded ${counts.users} users.`;
  }

  if (target === 'questions') {
    return `Restored questions from ${fileName} with replace semantics. Loaded workflow settings plus ${counts.reviewPeriods} review periods and ${counts.questionSets} question sets.`;
  }

  if (target === 'reviews') {
    return `Restored reviews from ${fileName} with replace semantics. Loaded workflow settings plus ${counts.reviewPeriods} review periods, ${counts.questionSets} question sets, ${counts.assignments} assignments, and ${counts.assessments} assessments.`;
  }

  return `Restored the full backup from ${fileName} with replace semantics. Loaded ${counts.users} users, workflow settings, ${counts.reviewPeriods} review periods, ${counts.questionSets} question sets, ${counts.assignments} assignments, and ${counts.assessments} assessments.`;
}

function buildBackupSessionNotice(target: BackupRestoreScope, mode: LocalUsersExportMode) {
  if (target === 'questions' || target === 'reviews') {
    return '';
  }

  return mode === 'rotate-passcodes'
    ? 'Restore completed and signed every user out. Sign in again with an account from the uploaded backup using its one-time passcode.'
    : 'Restore completed and signed every user out. Sign in again with an account from the uploaded backup using its stored password.';
}

function toEmployeeSummary(employee: EmployeeAdmin): Employee {
  const { auth: _auth, ...summary } = employee;
  return summary;
}

function toDraft(employee: Employee | EmployeeAdmin): EmployeeDraft {
  return {
    id: employee.id,
    username: employee.username,
    fullName: employee.fullName,
    email: employee.email,
    role: employee.role,
    status: employee.status,
    managerId: employee.managerId ?? '',
    assessor1Id: employee.assessor1Id ?? '',
    assessor2Id: employee.assessor2Id ?? '',
    reviewer1Id: employee.reviewer1Id ?? '',
    reviewer2Id: employee.reviewer2Id ?? '',
    initialPassword: '',
  };
}

function upsertEmployee(currentEmployees: Employee[], nextEmployee: Employee) {
  const existingIndex = currentEmployees.findIndex((employee) => employee.id === nextEmployee.id);
  if (existingIndex < 0) {
    return [...currentEmployees, nextEmployee];
  }

  return currentEmployees.map((employee) => (employee.id === nextEmployee.id ? nextEmployee : employee));
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while talking to the API.';
}

function formatLocalizedDateTime(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

function App() {
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname));
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    return normalizeThemePreference(window.localStorage.getItem(themeStorageKey));
  });
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [foundation, setFoundation] = useState<FoundationSnapshot | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployeeDetail, setSelectedEmployeeDetail] = useState<EmployeeAdmin | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [draftEmployee, setDraftEmployee] = useState<EmployeeDraft | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordDraft, setPasswordDraft] = useState('');
  const [loginUsername, setLoginUsername] = useState(() => getStoredLoginUsername());
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState('');
  const [nextPasswordDraft, setNextPasswordDraft] = useState('');
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const [profileError, setProfileError] = useState('');
  const [formError, setFormError] = useState('');
  const [appError, setAppError] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [isLoadingBackupStatus, setIsLoadingBackupStatus] = useState(false);
  const [isSavingBackupSettings, setIsSavingBackupSettings] = useState(false);
  const [isSavingWorkflowSettings, setIsSavingWorkflowSettings] = useState(false);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [isChangingOwnPassword, setIsChangingOwnPassword] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [isDeletingEmployee, setIsDeletingEmployee] = useState(false);
  const [isSyncingLocalUsers, setIsSyncingLocalUsers] = useState(false);
  const [localUserExportMode, setLocalUserExportMode] = useState<LocalUsersExportMode>('rotate-passcodes');
  const [backupExportMode, setBackupExportMode] = useState<LocalUsersExportMode>('preserve-passwords');
  const [isSyncingBackups, setIsSyncingBackups] = useState(false);
  const [isLoadingStoredBackups, setIsLoadingStoredBackups] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSavingReviewAdmin, setIsSavingReviewAdmin] = useState(false);
  const [isSavingAssessmentWorkflow, setIsSavingAssessmentWorkflow] = useState(false);
  const [showSeededApiAccounts, setShowSeededApiAccounts] = useState(false);
  const [reviewAdmin, setReviewAdmin] = useState<ReviewAdminSnapshot | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatusResponse | null>(null);
  const [backupSettingsDraft, setBackupSettingsDraft] = useState<BackupSettingsDraft | null>(null);
  const [storedBackups, setStoredBackups] = useState<BackupStoredFile[]>([]);
  const [isStoredBackupsDialogOpen, setIsStoredBackupsDialogOpen] = useState(false);
  const [backupDownloadDialog, setBackupDownloadDialog] = useState<BackupDownloadDialogState | null>(null);
  const [backupRestoreDialog, setBackupRestoreDialog] = useState<BackupRestoreDialogState | null>(null);
  const [selectedReviewPeriodId, setSelectedReviewPeriodId] = useState<string | null>(null);
  const [selectedReviewPeriodManagementId, setSelectedReviewPeriodManagementId] = useState<string | null>(null);
  const [reviewPeriodDraft, setReviewPeriodDraft] = useState<ReviewPeriodDraft | null>(null);
  const [questionSetDraft, setQuestionSetDraft] = useState<QuestionSetDraft | null>(null);
  const [questionSetInitialDraft, setQuestionSetInitialDraft] = useState<string | null>(null);
  const [editingQuestionDraftId, setEditingQuestionDraftId] = useState<string | null>(null);
  const [questionEditorDraft, setQuestionEditorDraft] = useState<QuestionSetQuestionDraft | null>(null);
  const [questionEditorInitialDraft, setQuestionEditorInitialDraft] = useState<string | null>(null);
  const [isNewQuestionCategoryDialogOpen, setIsNewQuestionCategoryDialogOpen] = useState(false);
  const [newQuestionCategoryDraft, setNewQuestionCategoryDraft] = useState('');
  const [newQuestionCategoryError, setNewQuestionCategoryError] = useState('');
  const [questionCategories, setQuestionCategories] = useState<string[]>([]);
  const [isQuestionCategoriesDialogOpen, setIsQuestionCategoriesDialogOpen] = useState(false);
  const [questionCategoriesDraft, setQuestionCategoriesDraft] = useState<string[]>([]);
  const [questionCategoriesDialogError, setQuestionCategoriesDialogError] = useState('');
  const [workflowContent, setWorkflowContent] = useState<string>(workflowMarkdown);
  const [workflowVisibility, setWorkflowVisibility] = useState<WorkflowVisibility>(defaultWorkflowVisibility);
  const [workflowDraft, setWorkflowDraft] = useState<string | null>(null);
  const [workflowVisibilityDraft, setWorkflowVisibilityDraft] = useState<WorkflowVisibility | null>(null);
  const [workflowInitialDraft, setWorkflowInitialDraft] = useState<string | null>(null);
  const [adminNotice, setAdminNotice] = useState('');
  const [assessmentSearchQuery, setAssessmentSearchQuery] = useState('');
  const [assessmentLifecycleFilter, setAssessmentLifecycleFilter] = useState<'all' | AdminAssessmentRow['summaryBucket']>('all');
  const [assessmentTargetFilter, setAssessmentTargetFilter] = useState<'all' | AdminAssessmentRow['target']>('all');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [assessmentResponsesDraft, setAssessmentResponsesDraft] = useState<Record<string, string>>({});
  const [assessmentManagerNotesDraft, setAssessmentManagerNotesDraft] = useState('');
  const [assessmentAdminStateDraft, setAssessmentAdminStateDraft] = useState<Exclude<AssessmentReviewState, 'reviewed'>>(
    'new',
  );
  const [workflowNotice, setWorkflowNotice] = useState('');
  const [lastResponseSource, setLastResponseSource] = useState<'admin' | 'workflow' | null>(null);
  const [selectedReviewAssessmentId, setSelectedReviewAssessmentId] = useState<string | null>(null);
  const [reviewNotesDraft, setReviewNotesDraft] = useState('');
  const [selectedAssessmentSetDialog, setSelectedAssessmentSetDialog] = useState<AssessmentSetDialogState | null>(null);
  const [reviewerNotesDraft, setReviewerNotesDraft] = useState<ReviewerNotesDraft>(() => createEmptyReviewerNotesDraft());
  const [isReturnToIncompleteDialogOpen, setIsReturnToIncompleteDialogOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => getStoredSidebarCollapsed());
  const [areDashboardQueuesExpanded, setAreDashboardQueuesExpanded] = useState(true);
  const [areReviewQueuesExpanded, setAreReviewQueuesExpanded] = useState(true);
  const [passwordDialogEmployeeId, setPasswordDialogEmployeeId] = useState<string | null>(null);
  const [isRefreshAvailable, setIsRefreshAvailable] = useState(false);
  const [apiRecoveryPollCount, setApiRecoveryPollCount] = useState(0);
  const localUserImportInputRef = useRef<HTMLInputElement | null>(null);
  const questionSetImportInputRef = useRef<HTMLInputElement | null>(null);
  const questionSetImportFormatRef = useRef<TransferFormat>('json');
  const assignmentImportInputRef = useRef<HTMLInputElement | null>(null);
  const assignmentImportFormatRef = useRef<TransferFormat>('json');
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const workflowTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const workflowPreviewBodyRef = useRef<HTMLDivElement | null>(null);

  const cycleTheme = () => {
    setThemePreference((currentTheme) => getNextThemePreference(currentTheme));
  };

  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((currentValue) => !currentValue);
  };

  useEffect(() => {
    const syncLocation = () => {
      const nextPath = normalizePath(window.location.pathname);
      if (nextPath !== window.location.pathname) {
        window.history.replaceState(null, '', nextPath);
      }
      setPathname(nextPath);
    };

    syncLocation();
    window.addEventListener('popstate', syncLocation);

    return () => {
      window.removeEventListener('popstate', syncLocation);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, themePreference);
    document.documentElement.style.colorScheme = getThemeColorScheme(themePreference);
  }, [themePreference]);

  useEffect(() => {
    window.localStorage.setItem(sidebarCollapsedStorageKey, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const handleApiUnavailable = () => {
      if (!window.sessionStorage.getItem(sessionStorageKey)) {
        return;
      }

      setApiRecoveryPollCount((currentCount) => currentCount + 1);
    };

    window.addEventListener(apiUnavailableEventName, handleApiUnavailable);
    return () => {
      window.removeEventListener(apiUnavailableEventName, handleApiUnavailable);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const existingToken = window.sessionStorage.getItem(sessionStorageKey);

    if (!existingToken) {
      setAuthLoading(false);
      return;
    }

    void (async () => {
      try {
        const response = await me(existingToken);
        if (cancelled) {
          return;
        }

        setSessionToken(existingToken);
        setSession(response.session);
        setAuthNotice(
          response.session.passwordResetRequired
            ? 'Session restored with a one-time passcode. Change it now before opening the workspace.'
            : '',
        );
      } catch {
        window.sessionStorage.removeItem(sessionStorageKey);
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionToken) {
      setIsRefreshAvailable(false);
      setApiRecoveryPollCount(0);
    }
  }, [sessionToken]);

  const sessionUser = session?.user ?? null;
  const passwordResetRequired = session?.passwordResetRequired ?? false;
  useEffect(() => {
    if (sessionUser) {
      setShowSeededApiAccounts(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await getApiIndex();
        if (!cancelled) {
          setShowSeededApiAccounts(response.seededAccountsAvailable);
        }
      } catch {
        if (!cancelled) {
          setShowSeededApiAccounts(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionUser]);

  const currentSection = useMemo(() => getSection(pathname), [pathname]);
  const accessibleSections = useMemo(
    () => (sessionUser ? getSectionsForRole(sessionUser.role) : []),
    [sessionUser],
  );
  const navigationSections = useMemo(
    () => (sessionUser ? getNavigationSectionsForRole(sessionUser.role, workflowVisibility) : []),
    [sessionUser, workflowVisibility],
  );
  const hasEmployeeReadAccess = session?.permissions.includes('employees:read') ?? false;
  const canManageEmployees = sessionUser?.role === 'admin' || sessionUser?.role === 'manager';
  const isAdmin = sessionUser?.role === 'admin';
  const canEditWorkflow = session?.permissions.includes('workflow:update') ?? false;
  const availableBackupExportModes = useMemo(() => {
    const supportedModes = new Set(backupStatus?.supportedUserExportModes ?? localUserExportModeOptions.map((option) => option.value));
    return localUserExportModeOptions.filter((option) => supportedModes.has(option.value));
  }, [backupStatus]);
  const availableBackupSchedules = useMemo(() => backupStatus?.supportedSchedules ?? backupScheduleOptions, [backupStatus]);
  const availableBackupRestoreActions = useMemo(() => {
    const supportedScopes = new Set(backupStatus?.supportedRestoreScopes ?? backupRestoreActions.map((action) => action.target));
    return backupRestoreActions.filter((action) => supportedScopes.has(action.target));
  }, [backupStatus]);
  const visibleAdminNotice = isAdmin ? adminNotice : '';
  const lastResponseMessage =
    lastResponseSource === 'workflow'
      ? workflowNotice || visibleAdminNotice
      : lastResponseSource === 'admin'
        ? visibleAdminNotice || workflowNotice
        : workflowNotice || visibleAdminNotice;
  const selectedEmployee = useMemo(
    () =>
      employees.find((employee) => employee.id === selectedEmployeeId) ??
      (sessionUser?.id === selectedEmployeeId ? sessionUser : null),
    [employees, selectedEmployeeId, sessionUser],
  );
  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.status === 'active'),
    [employees],
  );
  const inactiveEmployees = useMemo(
    () => employees.filter((employee) => employee.status === 'inactive'),
    [employees],
  );
  const directoryEmployees = useMemo(
    () => {
      const normalizedQuery = employeeSearchQuery.trim().toLowerCase();
      const employeeNamesById = new Map(
        [...employees, ...(sessionUser ? [sessionUser] : [])].map((employee) => [employee.id, employee.fullName] as const),
      );

      return [...employees]
        .filter((employee) => {
          if (!normalizedQuery) {
            return true;
          }

          const searchFields = [
            employee.fullName,
            employee.username,
            employee.email,
            employee.role,
            employee.status,
            employee.managerId ? employeeNamesById.get(employee.managerId) ?? deletedUserLabel : '',
            employee.assessor1Id ? employeeNamesById.get(employee.assessor1Id) ?? deletedUserLabel : '',
            employee.assessor2Id ? employeeNamesById.get(employee.assessor2Id) ?? deletedUserLabel : '',
            employee.reviewer1Id ? employeeNamesById.get(employee.reviewer1Id) ?? deletedUserLabel : '',
            employee.reviewer2Id ? employeeNamesById.get(employee.reviewer2Id) ?? deletedUserLabel : '',
          ];

          return searchFields.some((value) => value.toLowerCase().includes(normalizedQuery));
        })
        .sort((left, right) => {
          if (left.status !== right.status) {
            return left.status === 'active' ? -1 : 1;
          }

          return left.fullName.localeCompare(right.fullName);
        });
    },
    [employeeSearchQuery, employees, sessionUser],
  );
  const managerOptions = useMemo(
    () => activeEmployees.filter((employee) => employee.role === 'admin' || employee.role === 'manager'),
    [activeEmployees],
  );
  const canEditSelectedEmployee = Boolean(selectedEmployee) && (isAdmin || selectedEmployee?.role !== 'admin');
  const workflowEmployees = useMemo(() => {
    const employeesById = new Map<string, Employee>();

    for (const employee of foundation?.employees ?? []) {
      employeesById.set(employee.id, employee);
    }

    for (const employee of employees) {
      employeesById.set(employee.id, employee);
    }

    if (sessionUser) {
      employeesById.set(sessionUser.id, sessionUser);
    }

    return Array.from(employeesById.values());
  }, [employees, foundation, sessionUser]);
  const workflowEmployeesById = useMemo(
    () => new Map(workflowEmployees.map((employee) => [employee.id, employee] as const)),
    [workflowEmployees],
  );
  const assessmentWorkflow = useMemo(
    () => (foundation ? createAssessmentWorkflowSnapshot(foundation) : null),
    [foundation],
  );
  const dashboardSnapshot = useMemo(
    () => (sessionUser && foundation ? buildDashboardSnapshot(sessionUser, foundation, workflowEmployees) : null),
    [foundation, sessionUser, workflowEmployees],
  );
  const authoredAssessmentIds = useMemo(
    () =>
      dashboardSnapshot?.queues.flatMap((queue) => queue.items.map((item) => item.assessmentId)) ?? [],
    [dashboardSnapshot],
  );
  const reviewQueues = useMemo(
    () =>
      sessionUser && assessmentWorkflow && sessionUser.role !== 'employee'
        ? buildReviewQueues(sessionUser, assessmentWorkflow, workflowEmployees)
        : [],
    [assessmentWorkflow, sessionUser, workflowEmployees],
  );
  const activeAssessmentReviewPeriod = useMemo(
    () => assessmentWorkflow?.reviewPeriods.find((reviewPeriod) => reviewPeriod.status === 'active') ?? null,
    [assessmentWorkflow],
  );
  const adminAssessmentRows = useMemo(
    () =>
      assessmentWorkflow && activeAssessmentReviewPeriod
        ? buildAdminAssessmentRows(assessmentWorkflow, workflowEmployees, activeAssessmentReviewPeriod.id)
        : [],
    [activeAssessmentReviewPeriod, assessmentWorkflow, workflowEmployees],
  );
  const adminAssessmentIds = useMemo(
    () => adminAssessmentRows.map((item) => item.assessmentId),
    [adminAssessmentRows],
  );
  const filteredAdminAssessmentRows = useMemo(() => {
    const normalizedQuery = assessmentSearchQuery.trim().toLowerCase();
    return adminAssessmentRows.filter((item) =>
      (assessmentLifecycleFilter === 'all' || item.summaryBucket === assessmentLifecycleFilter) &&
      (assessmentTargetFilter === 'all' || item.target === assessmentTargetFilter) &&
      [
        item.subjectName,
        item.title,
        item.targetLabel,
        item.assessorLabel,
        item.detail,
        item.assessmentStatusLabel,
        item.lifecycleLabel,
        item.nextStepLabel,
        item.reviewActionLabel ?? '',
        item.workflowActionLabel ?? '',
      ].some((value) => !normalizedQuery || value.toLowerCase().includes(normalizedQuery)),
    );
  }, [adminAssessmentRows, assessmentLifecycleFilter, assessmentSearchQuery, assessmentTargetFilter]);
  const adminAssessmentSummary = useMemo(
    () => buildAdminAssessmentSummary(filteredAdminAssessmentRows),
    [filteredAdminAssessmentRows],
  );
  const overallAdminAssessmentSummary = useMemo(
    () =>
      adminAssessmentSummary.reduce(
        (summary, item) => ({
          total: summary.total + item.total,
          drafting: summary.drafting + item.drafting,
          submitted: summary.submitted + item.submitted,
          accepted: summary.accepted + item.accepted,
          readyForMeeting: summary.readyForMeeting + item.readyForMeeting,
          scheduled: summary.scheduled + item.scheduled,
          concluded: summary.concluded + item.concluded,
        }),
        {
          total: 0,
          drafting: 0,
          submitted: 0,
          accepted: 0,
          readyForMeeting: 0,
          scheduled: 0,
          concluded: 0,
        },
      ),
    [adminAssessmentSummary],
  );
  const areAssessmentFiltersActive =
    assessmentSearchQuery.trim().length > 0 || assessmentLifecycleFilter !== 'all' || assessmentTargetFilter !== 'all';
  const viewableAssessmentIds = useMemo(() => {
    const assessmentIds = new Set(authoredAssessmentIds);

    if (sessionUser?.role === 'admin') {
      adminAssessmentIds.forEach((assessmentId) => assessmentIds.add(assessmentId));
    }

    return Array.from(assessmentIds);
  }, [adminAssessmentIds, authoredAssessmentIds, sessionUser]);
  const reviewAssessmentIds = useMemo(
    () => reviewQueues.map((item) => item.assessmentId),
    [reviewQueues],
  );
  const selectedAssessmentEditor = useMemo(
    () =>
      assessmentWorkflow && selectedAssessmentId
        ? getAssessmentEditor(assessmentWorkflow, workflowEmployees, selectedAssessmentId, sessionUser)
        : null,
    [assessmentWorkflow, selectedAssessmentId, sessionUser, workflowEmployees],
  );
  const selectedReviewPanel = useMemo(
    () =>
      sessionUser && assessmentWorkflow && selectedReviewAssessmentId
        ? getReviewPanel(sessionUser, assessmentWorkflow, workflowEmployees, selectedReviewAssessmentId)
        : null,
    [assessmentWorkflow, selectedReviewAssessmentId, sessionUser, workflowEmployees],
  );
  const selectedAssessmentSetWorkflowPanel = useMemo(
    () =>
      sessionUser && assessmentWorkflow && selectedAssessmentSetDialog
        ? getAssessmentSetWorkflowPanel(
            sessionUser,
            assessmentWorkflow,
            workflowEmployees,
            selectedAssessmentSetDialog.reviewPeriodId,
            selectedAssessmentSetDialog.employeeId,
          )
        : null,
    [assessmentWorkflow, selectedAssessmentSetDialog, sessionUser, workflowEmployees],
  );
  const selectedReviewPeriod = useMemo(
    () => reviewAdmin?.reviewPeriods.find((period) => period.id === selectedReviewPeriodId) ?? null,
    [reviewAdmin, selectedReviewPeriodId],
  );
  const selectedReviewPeriodManagement = useMemo(
    () => reviewAdmin?.reviewPeriods.find((period) => period.id === selectedReviewPeriodManagementId) ?? null,
    [reviewAdmin, selectedReviewPeriodManagementId],
  );
  const selectedReviewPeriodSummary = useMemo(
    () =>
      reviewAdmin && selectedReviewPeriod
        ? getReviewPeriodSummary(reviewAdmin, selectedReviewPeriod.id)
        : null,
    [reviewAdmin, selectedReviewPeriod],
  );
  const selectedReviewPeriodManagementSummary = useMemo(
    () =>
      reviewAdmin && selectedReviewPeriodManagement
        ? getReviewPeriodSummary(reviewAdmin, selectedReviewPeriodManagement.id)
        : null,
    [reviewAdmin, selectedReviewPeriodManagement],
  );
  const selectedQuestionSets = useMemo(
    () =>
      selectedReviewPeriod
        ? {
            self: reviewAdmin ? getReviewPeriodQuestionSet(reviewAdmin, selectedReviewPeriod.id, 'self') : null,
            peer: reviewAdmin ? getReviewPeriodQuestionSet(reviewAdmin, selectedReviewPeriod.id, 'peer') : null,
          }
        : { self: null, peer: null },
    [reviewAdmin, selectedReviewPeriod],
  );
  const assignmentRows = useMemo(
    () =>
      reviewAdmin && selectedReviewPeriod
        ? buildAssignmentRows(selectedReviewPeriod.id, employees, reviewAdmin.assignments)
        : [],
    [employees, reviewAdmin, selectedReviewPeriod],
  );
  const questionCategorySuggestions = useMemo(
    () => buildQuestionCategorySuggestions(questionCategories, questionSetDraft),
    [questionCategories, questionSetDraft],
  );
  const editingQuestionSource = useMemo(
    () => questionSetDraft?.questions.find((question) => question.id === editingQuestionDraftId) ?? null,
    [editingQuestionDraftId, questionSetDraft],
  );
  const editingQuestionDraft = questionEditorDraft;
  const questionCategoryOptions = useMemo(() => {
    const categories = new Set(questionCategorySuggestions);
    if (editingQuestionDraft?.category) {
      categories.add(editingQuestionDraft.category);
    }

    return Array.from(categories)
      .map((category) => category.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }, [editingQuestionDraft?.category, questionCategorySuggestions]);
  const isQuestionEditorDirty = useMemo(
    () =>
      Boolean(
        questionEditorDraft &&
          questionEditorInitialDraft &&
          serializeQuestionDraft(questionEditorDraft) !== questionEditorInitialDraft,
      ),
    [questionEditorDraft, questionEditorInitialDraft],
  );
  const activeReviewAdminPeriod = useMemo(
    () => reviewAdmin?.reviewPeriods.find((reviewPeriod) => reviewPeriod.status === 'active') ?? null,
    [reviewAdmin],
  );
  useEffect(() => {
    if (!editingQuestionSource) {
      setQuestionEditorDraft(null);
      setQuestionEditorInitialDraft(null);
      return;
    }

    const nextDraft = { ...editingQuestionSource };
    setQuestionEditorDraft(nextDraft);
    setQuestionEditorInitialDraft(serializeQuestionDraft(nextDraft));
  }, [editingQuestionSource]);
  const isAssessmentDraftDirty = useMemo(() => {
    if (!selectedAssessmentEditor) {
      return false;
    }

    return selectedAssessmentEditor.questions.some(
      (question) => (assessmentResponsesDraft[question.questionId] ?? question.response) !== question.response,
    );
  }, [assessmentResponsesDraft, selectedAssessmentEditor]);
  const hasAssessmentDraftResponses = useMemo(() => {
    if (!selectedAssessmentEditor) {
      return false;
    }

    return selectedAssessmentEditor.questions.some(
      (question) => (assessmentResponsesDraft[question.questionId] ?? question.response).trim().length > 0,
    );
  }, [assessmentResponsesDraft, selectedAssessmentEditor]);
  const isAssessmentDraftComplete = useMemo(() => {
    if (!selectedAssessmentEditor) {
      return false;
    }

    return (
      selectedAssessmentEditor.questions.length > 0 &&
      selectedAssessmentEditor.questions.every(
        (question) => (assessmentResponsesDraft[question.questionId] ?? question.response).trim().length > 0,
      )
    );
  }, [assessmentResponsesDraft, selectedAssessmentEditor]);
  const normalizedAssessmentManagerNotesDraft = useMemo(
    () => normalizeOptionalAssessmentNotes(assessmentManagerNotesDraft),
    [assessmentManagerNotesDraft],
  );
  const isAssessmentManagerNotesDirty = useMemo(() => {
    if (!selectedAssessmentEditor || !selectedAssessmentEditor.isAdminOverride) {
      return false;
    }

    return normalizedAssessmentManagerNotesDraft !== selectedAssessmentEditor.managerNotes;
  }, [normalizedAssessmentManagerNotesDraft, selectedAssessmentEditor]);
  const isAssessmentAdminStateDirty = useMemo(() => {
    if (!selectedAssessmentEditor || !selectedAssessmentEditor.isAdminOverride) {
      return false;
    }

    return assessmentAdminStateDraft !== normalizeAdminAssessmentState(selectedAssessmentEditor.reviewState);
  }, [assessmentAdminStateDraft, selectedAssessmentEditor]);
  const passwordDialogEmployee = useMemo(() => {
    if (!passwordDialogEmployeeId) {
      return null;
    }

    return employees.find((employee) => employee.id === passwordDialogEmployeeId) ??
      (passwordDialogEmployeeId === sessionUser?.id ? sessionUser : null);
  }, [employees, passwordDialogEmployeeId, sessionUser]);
  const passwordDialogDetail = useMemo(
    () => (passwordDialogEmployeeId && selectedEmployeeDetail?.id === passwordDialogEmployeeId ? selectedEmployeeDetail : null),
    [passwordDialogEmployeeId, selectedEmployeeDetail],
  );


  useEffect(() => {
    if (!sessionUser) {
      return;
    }

    if (!accessibleSections.some((section) => section.path === pathname)) {
      window.history.replaceState(null, '', '/dashboard');
      setPathname('/dashboard');
    }
  }, [accessibleSections, pathname, sessionUser]);

  useEffect(() => {
    if (!sessionToken || apiRecoveryPollCount === 0 || isRefreshAvailable) {
      return;
    }

    let cancelled = false;
    let retryTimeoutId: number | null = null;

    const pollForApiRecovery = async () => {
      const isHealthy = await checkApiHealth();
      if (cancelled) {
        return;
      }

      if (isHealthy) {
        setIsRefreshAvailable(true);
        return;
      }

      retryTimeoutId = window.setTimeout(() => {
        void pollForApiRecovery();
      }, 3000);
    };

    void pollForApiRecovery();

    return () => {
      cancelled = true;
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
      }
    };
  }, [apiRecoveryPollCount, isRefreshAvailable, sessionToken]);

  useEffect(() => {
    if (!sessionUser || !sessionToken) {
      setFoundation(null);
      setEmployees([]);
      setSelectedEmployeeDetail(null);
      return;
    }

    if (passwordResetRequired) {
      setFoundation(null);
      setEmployees([sessionUser]);
      setSelectedEmployeeDetail(null);
      setIsLoadingEmployees(false);
      return;
    }

    let cancelled = false;
    setAppError('');

    void (async () => {
      try {
        const snapshot = await getFoundation(sessionToken);
        if (!cancelled) {
          setFoundation(snapshot);
        }
      } catch (error) {
        if (!cancelled) {
          setAppError(getErrorMessage(error));
        }
      }
    })();

    if (!sessionToken || !hasEmployeeReadAccess) {
      setEmployees([sessionUser]);
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingEmployees(true);
    void (async () => {
      try {
        const response = await listEmployees(sessionToken);
        if (!cancelled) {
          setEmployees(response.items);
        }
      } catch (error) {
        if (!cancelled) {
          setAppError(getErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingEmployees(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasEmployeeReadAccess, passwordResetRequired, sessionToken, sessionUser]);

  useEffect(() => {
    if (!sessionUser || sessionUser.role !== 'admin' || !foundation) {
      setReviewAdmin(null);
      setSelectedReviewPeriodId(null);
      setSelectedReviewPeriodManagementId(null);
      setReviewPeriodDraft(null);
      closeQuestionSetDialog({ force: true });
      setQuestionCategories([]);
      setAdminNotice('');
      return;
    }

    setReviewAdmin(createReviewAdminSnapshot(foundation));
  }, [foundation, sessionUser]);

  useEffect(() => {
    if (!foundation) {
      setSelectedAssessmentId(null);
      setSelectedReviewAssessmentId(null);
      setWorkflowNotice('');
      setWorkflowContent(workflowMarkdown);
      setWorkflowVisibility(defaultWorkflowVisibility);
      setIsSavingWorkflowSettings(false);
      closeWorkflowEditor({ force: true });
      return;
    }

    setWorkflowContent(foundation.workflow.markdown);
    setWorkflowVisibility(foundation.workflow.visibility);
  }, [foundation]);

  useEffect(() => {
    if (!sessionToken || !sessionUser || sessionUser.role !== 'admin' || passwordResetRequired) {
      setQuestionCategories([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await listQuestionCategories(sessionToken);
        if (!cancelled) {
          setQuestionCategories(response.items);
        }
      } catch (error) {
        if (!cancelled) {
          setAppError(getErrorMessage(error));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [passwordResetRequired, sessionToken, sessionUser]);

  useEffect(() => {
    if (!sessionToken || !isAdmin || passwordResetRequired) {
      setBackupStatus(null);
      setBackupSettingsDraft(null);
      setStoredBackups([]);
      setIsStoredBackupsDialogOpen(false);
      setBackupDownloadDialog(null);
      setBackupRestoreDialog(null);
      setIsLoadingBackupStatus(false);
      setIsSavingBackupSettings(false);
      setIsLoadingStoredBackups(false);
      return;
    }

    let cancelled = false;
    setIsLoadingBackupStatus(true);

    void (async () => {
      try {
        const response = await getBackupStatus(sessionToken);
        if (!cancelled) {
          setBackupStatus(response);
        }
      } catch (error) {
        if (!cancelled) {
          setAppError(getErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingBackupStatus(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, passwordResetRequired, sessionToken]);

  useEffect(() => {
    if (!backupStatus) {
      setBackupSettingsDraft(null);
      return;
    }

    setBackupSettingsDraft(toBackupSettingsDraft(backupStatus));
  }, [backupStatus]);

  useEffect(() => {
    if (!backupStatus) {
      return;
    }

    if (!backupStatus.supportedUserExportModes.includes(backupExportMode)) {
      setBackupExportMode(backupStatus.defaultUserExportMode);
    }
  }, [backupExportMode, backupStatus]);

  useEffect(() => {
    if (!workflowNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setWorkflowNotice('');
    }, lastResponseTimeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [workflowNotice]);

  useEffect(() => {
    if (!adminNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAdminNotice('');
    }, lastResponseTimeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [adminNotice]);

  useEffect(() => {
    if (workflowNotice) {
      setLastResponseSource('workflow');
    }
  }, [workflowNotice]);

  useEffect(() => {
    if (adminNotice) {
      setLastResponseSource('admin');
    }
  }, [adminNotice]);

  useEffect(() => {
    if (!reviewAdmin) {
      setSelectedReviewPeriodId(null);
      setSelectedReviewPeriodManagementId(null);
      return;
    }

    setSelectedReviewPeriodId((currentId) => getPreferredReviewPeriodId(reviewAdmin.reviewPeriods, currentId));
    setSelectedReviewPeriodManagementId((currentId) => getPreferredReviewPeriodId(reviewAdmin.reviewPeriods, currentId));
  }, [reviewAdmin]);

  useEffect(() => {
    if (draftEmployee && !draftEmployee.id) {
      return;
    }

    if (!sessionUser) {
      setSelectedEmployeeId(null);
      return;
    }

    if (sessionUser.role === 'employee') {
      setSelectedEmployeeId(sessionUser.id);
      return;
    }

    if (selectedEmployeeId && employees.some((employee) => employee.id === selectedEmployeeId)) {
      return;
    }

    if (selectedEmployeeId) {
      setSelectedEmployeeId(null);
    }
  }, [draftEmployee, employees, selectedEmployeeId, sessionUser]);

  useEffect(() => {
    setPasswordDraft('');
    setPasswordStatus('');
    setTemporaryPassword(null);
  }, [selectedEmployeeId]);

  useEffect(() => {
    if (selectedAssessmentId && !viewableAssessmentIds.includes(selectedAssessmentId)) {
      setSelectedAssessmentId(null);
    }
  }, [selectedAssessmentId, viewableAssessmentIds]);

  useEffect(() => {
    if (!selectedAssessmentEditor) {
      setAssessmentResponsesDraft({});
      setAssessmentManagerNotesDraft('');
      setAssessmentAdminStateDraft('new');
      return;
    }

    setAssessmentResponsesDraft(
      Object.fromEntries(selectedAssessmentEditor.questions.map((question) => [question.questionId, question.response] as const)),
    );
    setAssessmentManagerNotesDraft(selectedAssessmentEditor.managerNotes ?? '');
    setAssessmentAdminStateDraft(normalizeAdminAssessmentState(selectedAssessmentEditor.reviewState));
  }, [selectedAssessmentEditor]);

  useEffect(() => {
    if (selectedReviewAssessmentId && !reviewAssessmentIds.includes(selectedReviewAssessmentId)) {
      setSelectedReviewAssessmentId(null);
    }
  }, [reviewAssessmentIds, selectedReviewAssessmentId]);

  useEffect(() => {
    if (!selectedReviewPanel) {
      setReviewNotesDraft('');
      return;
    }

    setReviewNotesDraft(selectedReviewPanel.managerNotes);
  }, [selectedReviewPanel]);

  useEffect(() => {
    if (selectedAssessmentSetDialog && !selectedAssessmentSetWorkflowPanel) {
      setSelectedAssessmentSetDialog(null);
    }
  }, [selectedAssessmentSetDialog, selectedAssessmentSetWorkflowPanel]);

  useEffect(() => {
    if (!selectedAssessmentSetWorkflowPanel) {
      setReviewerNotesDraft(createEmptyReviewerNotesDraft());
      return;
    }

    const reviewer1Notes =
      selectedAssessmentSetWorkflowPanel.reviewerActions.find((action) => action.role === 'reviewer1')?.notes ?? '';
    const reviewer2Notes =
      selectedAssessmentSetWorkflowPanel.reviewerActions.find((action) => action.role === 'reviewer2')?.notes ?? '';

    setReviewerNotesDraft({
      reviewer1: reviewer1Notes,
      reviewer2: reviewer2Notes,
    });
  }, [selectedAssessmentSetWorkflowPanel]);

  useEffect(() => {
    if (!selectedReviewPanel) {
      setIsReturnToIncompleteDialogOpen(false);
    }
  }, [selectedReviewPanel]);

  useEffect(() => {
    if (!selectedEmployeeId || !sessionToken || !hasEmployeeReadAccess || draftEmployee) {
      if (!selectedEmployeeId) {
        setSelectedEmployeeDetail(null);
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await getEmployee(sessionToken, selectedEmployeeId);
        if (!cancelled) {
          setSelectedEmployeeDetail(response.item);
        }
      } catch (error) {
        if (!cancelled) {
          setAppError(getErrorMessage(error));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draftEmployee, hasEmployeeReadAccess, selectedEmployeeId, sessionToken]);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, nextPath: string) => {
    event.preventDefault();
    goTo(nextPath);
  };

  const goTo = (nextPath: string) => {
    const normalizedNextPath = normalizePath(nextPath);
    if (normalizedNextPath === pathname) {
      return;
    }

    window.history.pushState(null, '', normalizedNextPath);
    setPathname(normalizedNextPath);
  };

  const getEmployeeName = (employeeId: string | null) => {
    if (!employeeId) {
      return 'Not assigned';
    }

    if (sessionUser?.id === employeeId) {
      return sessionUser.fullName;
    }

    return workflowEmployeesById.get(employeeId)?.fullName ?? deletedUserLabel;
  };

  const getAssessorNames = (employee: Pick<Employee, 'assessor1Id' | 'assessor2Id'>) =>
    [
      { label: 'Assessor 1', id: employee.assessor1Id },
      { label: 'Assessor 2', id: employee.assessor2Id },
    ].map((entry) => ({
      ...entry,
      name: getEmployeeName(entry.id),
    }));

  const getReviewerNames = (employee: Pick<Employee, 'reviewer1Id' | 'reviewer2Id'>) =>
    [
      { label: 'Reviewer 1', id: employee.reviewer1Id },
      { label: 'Reviewer 2', id: employee.reviewer2Id },
    ].map((entry) => ({
      ...entry,
      name: getEmployeeName(entry.id),
    }));

  const renderRelationshipList = (
    relationships: Array<{ label: string; name: string }>,
    options: { showLabels?: boolean } = {},
  ) => (
    <span className="stacked-relationship-list">
      {relationships.map((relationship) => (
        <span key={relationship.label}>
          {options.showLabels === false ? (
            relationship.name
          ) : (
            <>
              <strong>{relationship.label}:</strong> {relationship.name}
            </>
          )}
        </span>
      ))}
    </span>
  );

  const renderAssessorList = (
    employee: Pick<Employee, 'assessor1Id' | 'assessor2Id'>,
    options: { showLabels?: boolean } = {},
  ) => renderRelationshipList(getAssessorNames(employee), options);

  const renderReviewerList = (
    employee: Pick<Employee, 'reviewer1Id' | 'reviewer2Id'>,
    options: { showLabels?: boolean } = {},
  ) => renderRelationshipList(getReviewerNames(employee), options);

  const refreshFoundationSnapshot = useCallback(
    async (options?: { apply?: boolean }) => {
      if (!sessionToken) {
        throw new Error('Authentication required');
      }

      const snapshot = await getFoundation(sessionToken);
      if (options?.apply !== false) {
        setFoundation(snapshot);
      }
      return snapshot;
    },
    [sessionToken],
  );

  const refreshEmployeeDirectory = async () => {
    if (!sessionToken || !hasEmployeeReadAccess) {
      return;
    }

    const response = await listEmployees(sessionToken);
    setEmployees(response.items);
  };

  const syncWorkflowPreviewScroll = useCallback(() => {
    const textarea = workflowTextareaRef.current;
    const previewBody = workflowPreviewBodyRef.current;
    if (!textarea || !previewBody) {
      return;
    }

    const textareaScrollableHeight = textarea.scrollHeight - textarea.clientHeight;
    const previewScrollableHeight = previewBody.scrollHeight - previewBody.clientHeight;

    if (textareaScrollableHeight <= 0 || previewScrollableHeight <= 0) {
      previewBody.scrollTop = 0;
      return;
    }

    previewBody.scrollTop = (textarea.scrollTop / textareaScrollableHeight) * previewScrollableHeight;
  }, []);

  useEffect(() => {
    syncWorkflowPreviewScroll();
  }, [syncWorkflowPreviewScroll, workflowDraft]);

  useEffect(() => {
    if (!sessionToken || !sessionUser || passwordResetRequired || pathname !== '/workflow') {
      return;
    }

    let active = true;
    void (async () => {
      try {
        const snapshot = await refreshFoundationSnapshot({ apply: false });
        if (active) {
          setFoundation(snapshot);
        }
      } catch (error) {
        if (active) {
          setAppError(getErrorMessage(error));
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [passwordResetRequired, pathname, refreshFoundationSnapshot, sessionToken, sessionUser]);

  const removeEmployeeFromState = (employeeId: string) => {
    setEmployees((currentEmployees) => currentEmployees.filter((employee) => employee.id !== employeeId));
    setFoundation((currentFoundation) =>
      currentFoundation
        ? {
            ...currentFoundation,
            employees: currentFoundation.employees.filter((employee) => employee.id !== employeeId),
          }
        : currentFoundation,
    );
    setSelectedEmployeeId((currentEmployeeId) => (currentEmployeeId === employeeId ? null : currentEmployeeId));
    setSelectedEmployeeDetail((currentDetail) => (currentDetail?.id === employeeId ? null : currentDetail));
  };

  const refreshQuestionCategorySuggestions = async () => {
    if (!sessionToken || !isAdmin) {
      setQuestionCategories([]);
      return [];
    }

    const response = await listQuestionCategories(sessionToken);
    setQuestionCategories(response.items);
    return response.items;
  };

  const openQuestionCategoriesDialog = () => {
    setQuestionCategoriesDraft(questionCategories);
    setQuestionCategoriesDialogError('');
    setReviewPeriodDraft(null);
    setAdminNotice('');
    setIsQuestionCategoriesDialogOpen(true);
  };

  const closeQuestionCategoriesDialog = () => {
    setIsQuestionCategoriesDialogOpen(false);
    setQuestionCategoriesDraft([]);
    setQuestionCategoriesDialogError('');
  };

  const updateQuestionCategoryDraft = (index: number, value: string) => {
    setQuestionCategoriesDraft((currentDraft) =>
      currentDraft.map((category, categoryIndex) => (categoryIndex === index ? value : category)),
    );
    if (questionCategoriesDialogError) {
      setQuestionCategoriesDialogError('');
    }
  };

  const addQuestionCategoryDraft = () => {
    setQuestionCategoriesDraft((currentDraft) => [...currentDraft, '']);
    if (questionCategoriesDialogError) {
      setQuestionCategoriesDialogError('');
    }
  };

  const removeQuestionCategoryDraft = (index: number) => {
    setQuestionCategoriesDraft((currentDraft) => currentDraft.filter((_, categoryIndex) => categoryIndex !== index));
    if (questionCategoriesDialogError) {
      setQuestionCategoriesDialogError('');
    }
  };

  const saveQuestionCategoriesDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!sessionToken || !isAdmin) {
      setQuestionCategoriesDialogError('Authentication required.');
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');
    setQuestionCategoriesDialogError('');

    try {
      const response = await updateQuestionCategories(sessionToken, {
        items: questionCategoriesDraft,
      });
      setQuestionCategories(response.items);
      closeQuestionCategoriesDialog();
      setAdminNotice('Updated question categories.');
    } catch (error) {
      setQuestionCategoriesDialogError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const refreshBackupStatus = async () => {
    if (!sessionToken || !isAdmin) {
      setBackupStatus(null);
      return null;
    }

    const response = await getBackupStatus(sessionToken);
    setBackupStatus(response);
    return response;
  };

  const handleBackupStatusRefresh = async () => {
    setIsLoadingBackupStatus(true);
    setAdminNotice('');
    setAppError('');

    try {
      await refreshBackupStatus();
      setAdminNotice('Refreshed backup status from the API.');
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsLoadingBackupStatus(false);
    }
  };

  const handleBackupSettingsSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!sessionToken || !backupSettingsDraft) {
      return;
    }

    const retentionCount = Number(backupSettingsDraft.retentionCount.trim());
    if (!Number.isInteger(retentionCount) || retentionCount < 1) {
      setAppError('Automatic backup retention must be a whole number greater than 0.');
      return;
    }

    setIsSavingBackupSettings(true);
    setAdminNotice('');
    setAppError('');

    try {
      const response = await updateBackupStatus(sessionToken, {
        automaticBackupsEnabled: backupSettingsDraft.automaticBackupsEnabled,
        schedule: backupSettingsDraft.schedule,
        retentionCount,
      });
      setBackupStatus(response);
      setAdminNotice('Updated automatic backup settings.');
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingBackupSettings(false);
    }
  };

  const resetEditingState = () => {
    setEditingEmployeeId(null);
    setDraftEmployee(null);
    setFormError('');
  };

  const closeEmployeeDialog = () => {
    resetEditingState();
    setSelectedEmployeeId(null);
    setSelectedEmployeeDetail(null);
  };

  const closePasswordDialog = () => {
    setPasswordDialogEmployeeId(null);
    setSelectedEmployeeId(null);
    setPasswordDraft('');
    setPasswordStatus('');
    setTemporaryPassword(null);
  };

  const closeAssessmentDialog = () => {
    setSelectedAssessmentId(null);
  };

  const closeReviewDialog = () => {
    setSelectedReviewAssessmentId(null);
    setIsReturnToIncompleteDialogOpen(false);
  };

  const closeAssessmentSetDialog = () => {
    setSelectedAssessmentSetDialog(null);
  };

  const handleSelectAssessment = (assessmentId: string) => {
    setSelectedAssessmentId(assessmentId);
  };

  const handleAssessmentRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, assessmentId: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    handleSelectAssessment(assessmentId);
  };

  const openAssessmentSetWorkflowDialog = (reviewPeriodId: string, employeeId: string) => {
    setSelectedAssessmentSetDialog({
      reviewPeriodId,
      employeeId,
    });
  };

  const openWorkflowEditor = () => {
    setWorkflowDraft(workflowContent);
    setWorkflowVisibilityDraft(workflowVisibility);
    setWorkflowInitialDraft(serializeWorkflowDraft(workflowContent, workflowVisibility));
    setAppError('');
  };

  const closeWorkflowEditor = (options?: { force?: boolean }) => {
    const isDirty =
      workflowDraft !== null &&
      workflowVisibilityDraft !== null &&
      workflowInitialDraft !== null &&
      serializeWorkflowDraft(workflowDraft, workflowVisibilityDraft) !== workflowInitialDraft;

    if (!options?.force && isDirty) {
      const confirmed = window.confirm('Close this workflow without saving your changes?');
      if (!confirmed) {
        return false;
      }
    }

    setWorkflowDraft(null);
    setWorkflowVisibilityDraft(null);
    setWorkflowInitialDraft(null);
    return true;
  };

  const saveWorkflowContent = async () => {
    if (workflowDraft === null || workflowVisibilityDraft === null || !sessionToken) {
      return;
    }

    setIsSavingWorkflowSettings(true);
    setAppError('');

    try {
      const response = await updateWorkflowSettings(sessionToken, {
        markdown: workflowDraft,
        visibility: workflowVisibilityDraft,
      });

      setWorkflowContent(response.item.markdown);
      setWorkflowVisibility(response.item.visibility);
      setFoundation((currentFoundation) =>
        currentFoundation
          ? {
              ...currentFoundation,
              workflow: response.item,
            }
          : currentFoundation,
      );
      closeWorkflowEditor({ force: true });
      setAdminNotice('Updated the workflow settings.');
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingWorkflowSettings(false);
    }
  };

  const openEmployeeDialog = (employeeId: string) => {
    resetEditingState();
    setSelectedEmployeeDetail(null);
    setSelectedEmployeeId(employeeId);
  };

  const openPasswordDialog = (employeeId: string) => {
    resetEditingState();
    setSelectedEmployeeDetail((currentDetail) => (currentDetail?.id === employeeId ? currentDetail : null));
    setSelectedEmployeeId(employeeId);
    setPasswordDialogEmployeeId(employeeId);
  };

  const handleSelectReviewAssessment = (assessmentId: string) => {
    setSelectedReviewAssessmentId(assessmentId);
  };

  const handleDashboardWorkflowAction = async (item: DashboardActionItem) => {
    if (item.actionKind === 'open-assessment' && item.assessmentId) {
      handleSelectAssessment(item.assessmentId);
      return;
    }

    if (item.actionKind === 'open-review' && item.assessmentId) {
      handleSelectReviewAssessment(item.assessmentId);
      return;
    }

    if (item.kind !== 'assessment-set' || !item.reviewPeriodId || !item.employeeId) {
      return;
    }

    openAssessmentSetWorkflowDialog(item.reviewPeriodId, item.employeeId);
  };

  const clearSession = (options?: {
    authNotice?: string;
  }) => {
    window.sessionStorage.removeItem(sessionStorageKey);
    setSessionToken(null);
    setSession(null);
    setFoundation(null);
    setEmployees([]);
    setEmployeeSearchQuery('');
    setSelectedEmployeeId(null);
    setSelectedEmployeeDetail(null);
    setEditingEmployeeId(null);
    setDraftEmployee(null);
    setLoginError('');
    setAuthNotice(options?.authNotice ?? '');
    setCurrentPasswordDraft('');
    setNextPasswordDraft('');
    setConfirmPasswordDraft('');
    setChangePasswordError('');
    setIsProfileDialogOpen(false);
    setProfileDraft(null);
    setProfileError('');
    setIsSavingProfile(false);
    setAppError('');
    setAdminNotice('');
    setQuestionCategories([]);
    setBackupStatus(null);
    setBackupSettingsDraft(null);
    setStoredBackups([]);
    setIsStoredBackupsDialogOpen(false);
    setBackupDownloadDialog(null);
    setBackupRestoreDialog(null);
    setIsLoadingBackupStatus(false);
    setIsLoadingStoredBackups(false);
    setIsSyncingBackups(false);
    setIsSavingBackupSettings(false);
    setLoginPassword('');
    setPasswordDraft('');
    setPasswordStatus('');
    setTemporaryPassword(null);
    setAssessmentSearchQuery('');
    setAssessmentLifecycleFilter('all');
    setAssessmentTargetFilter('all');
    setIsSavingAssessmentWorkflow(false);
    setSelectedAssessmentId(null);
    setAssessmentResponsesDraft({});
    setSelectedReviewAssessmentId(null);
    setReviewNotesDraft('');
    setSelectedAssessmentSetDialog(null);
    setReviewerNotesDraft(createEmptyReviewerNotesDraft());
    setIsReturnToIncompleteDialogOpen(false);
    setWorkflowNotice('');
    setWorkflowDraft(null);
    setWorkflowVisibilityDraft(null);
    setWorkflowInitialDraft(null);
    setAreReviewQueuesExpanded(true);
    setPasswordDialogEmployeeId(null);
    setIsRefreshAvailable(false);
    setApiRecoveryPollCount(0);
  };

  const syncEmployeeRelationships = (
    employeeId: string,
    managerId: string | null,
    assessor2Id: string | null,
  ) => {
    setEmployees((currentEmployees) =>
      currentEmployees.map((employee) =>
        employee.id === employeeId
          ? {
              ...employee,
              managerId,
              assessor2Id,
            }
          : employee,
      ),
    );

    setSelectedEmployeeDetail((currentDetail) =>
      currentDetail && currentDetail.id === employeeId
        ? {
            ...currentDetail,
            managerId,
            assessor2Id,
          }
        : currentDetail,
    );

    setSession((currentSession) =>
      currentSession && currentSession.user.id === employeeId
        ? {
            ...currentSession,
            user: {
              ...currentSession.user,
              managerId,
              assessor2Id,
            },
          }
        : currentSession,
    );
  };

  const syncCurrentUserSummary = (nextUser: Employee) => {
    setEmployees((currentEmployees) => upsertEmployee(currentEmployees, nextUser));
    setFoundation((currentFoundation) =>
      currentFoundation
        ? {
            ...currentFoundation,
            employees: upsertEmployee(currentFoundation.employees, nextUser),
          }
        : currentFoundation,
    );
    setSelectedEmployeeDetail((currentDetail) =>
      currentDetail && currentDetail.id === nextUser.id
        ? {
            ...currentDetail,
            ...nextUser,
          }
        : currentDetail,
    );
  };

  const openProfileDialog = () => {
    if (!sessionUser) {
      return;
    }

    resetEditingState();
    setSelectedEmployeeId(null);
    setSelectedEmployeeDetail(null);
    setPasswordDialogEmployeeId(null);
    setProfileDraft({
      fullName: sessionUser.fullName,
      email: sessionUser.email,
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    });
    setProfileError('');
    setIsProfileDialogOpen(true);
  };

  const closeProfileDialog = () => {
    setIsProfileDialogOpen(false);
    setProfileDraft(null);
    setProfileError('');
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmittingLogin(true);
    const normalizedLoginUsername = loginUsername.trim();

    try {
      const response = await login({
        username: normalizedLoginUsername,
        password: loginPassword,
      });

      window.localStorage.setItem(loginUsernameStorageKey, normalizedLoginUsername);
      window.sessionStorage.setItem(sessionStorageKey, response.session.token);
      setLoginUsername(normalizedLoginUsername);
      setSessionToken(response.session.token);
      setSession(response.session);
      setAuthNotice(
        response.session.passwordResetRequired
          ? 'Signed in with a one-time passcode. Change it now before opening the workspace.'
          : '',
      );
      setCurrentPasswordDraft(response.session.passwordResetRequired ? loginPassword : '');
      setNextPasswordDraft('');
      setConfirmPasswordDraft('');
      setChangePasswordError('');
      setSelectedEmployeeId(response.session.user.role === 'employee' ? response.session.user.id : null);
      setLoginError('');
      window.history.replaceState(null, '', '/dashboard');
      setPathname('/dashboard');
    } catch (error) {
      setLoginError(getErrorMessage(error));
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (sessionToken) {
        await logout(sessionToken);
      }
    } catch {
      // Ignore API errors during local cleanup.
    } finally {
      clearSession();
    }
  };

  const handleRefreshNow = () => {
    window.location.reload();
  };

  const handleChangeOwnPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!sessionToken) {
      return;
    }

    if (!currentPasswordDraft.trim()) {
      setChangePasswordError('Enter the current password or one-time passcode you just used.');
      return;
    }

    if (!nextPasswordDraft.trim()) {
      setChangePasswordError('Enter a new password.');
      return;
    }

    if (nextPasswordDraft.trim().length < 8) {
      setChangePasswordError('New passwords must be at least 8 characters.');
      return;
    }

    if (nextPasswordDraft !== confirmPasswordDraft) {
      setChangePasswordError('New password and confirmation must match.');
      return;
    }

    setIsChangingOwnPassword(true);
    setChangePasswordError('');

    try {
      const response = await changePassword(sessionToken, {
        currentPassword: currentPasswordDraft,
        newPassword: nextPasswordDraft,
      });

      window.sessionStorage.setItem(sessionStorageKey, response.session.token);
      setSessionToken(response.session.token);
      setSession(response.session);
      setAuthNotice('Password updated. You can now access the full workspace.');
      setCurrentPasswordDraft('');
      setNextPasswordDraft('');
      setConfirmPasswordDraft('');
      setLoginPassword('');
    } catch (error) {
      setChangePasswordError(getErrorMessage(error));
    } finally {
      setIsChangingOwnPassword(false);
    }
  };

  const handleSaveOwnProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!sessionToken || !sessionUser || !profileDraft) {
      return;
    }

    const nextFullName = profileDraft.fullName.trim();
    const nextEmail = profileDraft.email.trim().toLowerCase();
    const profileChanged = nextFullName !== sessionUser.fullName || nextEmail !== sessionUser.email;
    const wantsPasswordChange = [
      profileDraft.currentPassword,
      profileDraft.newPassword,
      profileDraft.confirmNewPassword,
    ].some((value) => value.trim().length > 0);

    if (!nextFullName) {
      setProfileError('Enter your full name.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setProfileError('Enter a valid email address.');
      return;
    }

    if (!profileChanged && !wantsPasswordChange) {
      setProfileError('Make a change before saving.');
      return;
    }

    if (wantsPasswordChange) {
      if (!profileDraft.currentPassword.trim()) {
        setProfileError('Enter your current password.');
        return;
      }

      if (!profileDraft.newPassword.trim()) {
        setProfileError('Enter a new password.');
        return;
      }

      if (profileDraft.newPassword.trim().length < 8) {
        setProfileError('New passwords must be at least 8 characters.');
        return;
      }

      if (profileDraft.newPassword !== profileDraft.confirmNewPassword) {
        setProfileError('New password and confirmation must match.');
        return;
      }
    }

    setIsSavingProfile(true);
    setProfileError('');

    try {
      if (profileChanged) {
        const response = await updateOwnProfile(sessionToken, {
          fullName: nextFullName,
          email: nextEmail,
        });
        setSession(response.session);
        syncCurrentUserSummary(response.session.user);
      }

      if (wantsPasswordChange) {
        const response = await changePassword(sessionToken, {
          currentPassword: profileDraft.currentPassword,
          newPassword: profileDraft.newPassword,
        });
        window.sessionStorage.setItem(sessionStorageKey, response.session.token);
        setSessionToken(response.session.token);
        setSession(response.session);
        syncCurrentUserSummary(response.session.user);
        setLoginPassword('');
      }

      setAuthNotice(
        profileChanged && wantsPasswordChange
          ? 'Profile and password updated.'
          : wantsPasswordChange
            ? 'Password updated.'
            : 'Profile updated.',
      );
      closeProfileDialog();
    } catch (error) {
      setProfileError(getErrorMessage(error));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleLocalUserExport = async (format: TransferFormat) => {
    if (!sessionToken || !sessionUser) {
      return;
    }

    const confirmed = window.confirm(buildLocalUserExportConfirmation(format, localUserExportMode));
    if (!confirmed) {
      return;
    }

    setIsSyncingLocalUsers(true);
    setAdminNotice('');
    setAppError('');

    try {
      const response = await exportLocalUsersFromApi(sessionToken, format, localUserExportMode);
      const content = serializeLocalUsersTransfer(response);
      const extension = format === 'csv' ? 'csv' : 'json';
      const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
      triggerDownload(`local-users-export.${extension}`, content, mimeType);
      const notice = buildLocalUsersExportNotice(response);

      if (response.mode === 'rotate-passcodes') {
        setLoginUsername(sessionUser.username);
        clearSession({
          authNotice: `${notice} Your current session is now signed out. Sign in again with your exported one-time passcode.`,
        });
        return;
      }

      setAdminNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSyncingLocalUsers(false);
    }
  };

  const handleLocalUserImport = () => {
    localUserImportInputRef.current?.click();
  };

  const handleLocalUserImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !sessionToken || !sessionUser) {
      return;
    }

    setIsSyncingLocalUsers(true);
    setAdminNotice('');
    setAppError('');

    try {
      const raw = await file.text();
      const payload = buildLocalUsersImportPayloadFromFile(raw);
      const response = await importLocalUsersFromApi(sessionToken, payload);
      const notice = buildLocalUsersImportNotice(response);
      const currentUserWasImported = response.items.some((item) => item.id === sessionUser.id);

      if (currentUserWasImported) {
        setLoginUsername(sessionUser.username);
        clearSession({
          authNotice: `${notice} Your account was part of the import, so sign in again with the imported password or one-time passcode.`,
        });
        return;
      }

      const selectedImportedEmployee = response.items.find((item) => item.id === selectedEmployeeId) ?? null;
      if (selectedImportedEmployee) {
        setSelectedEmployeeDetail(selectedImportedEmployee);
      }

      await Promise.all([refreshFoundationSnapshot(), refreshEmployeeDirectory()]);
      setAdminNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSyncingLocalUsers(false);
    }
  };

  const refreshStoredBackups = async () => {
    if (!sessionToken || !isAdmin) {
      setStoredBackups([]);
      return [];
    }

    const response = await listStoredBackups(sessionToken);
    setStoredBackups(response.items);
    return response.items;
  };

  const openStoredBackupsDialog = async () => {
    if (!sessionToken) {
      return;
    }

    setIsStoredBackupsDialogOpen(true);
    setIsLoadingStoredBackups(true);
    setAdminNotice('');
    setAppError('');

    try {
      await refreshStoredBackups();
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsLoadingStoredBackups(false);
    }
  };

  const closeStoredBackupsDialog = () => {
    setIsStoredBackupsDialogOpen(false);
    setBackupDownloadDialog(null);
    setBackupRestoreDialog(null);
  };

  const handleStoredBackupUploadClick = () => {
    backupImportInputRef.current?.click();
  };

  const handleStoredBackupFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!sessionToken || !file) {
      return;
    }

    setIsSyncingBackups(true);
    setAdminNotice('');
    setAppError('');

    try {
      const response = await uploadStoredBackup(sessionToken, file);
      await refreshStoredBackups();
      setAdminNotice(
        response.renamedFrom && response.renamedFrom !== response.item.name
          ? `Uploaded ${response.renamedFrom} as ${response.item.name}.`
          : `Uploaded ${response.item.name} to stored backups.`,
      );
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSyncingBackups(false);
    }
  };

  const handleCreateStoredBackup = async () => {
    if (!sessionToken) {
      return;
    }

    setIsSyncingBackups(true);
    setAdminNotice('');
    setAppError('');

    try {
      const response = await createStoredBackup(sessionToken);
      await Promise.all([refreshStoredBackups(), refreshBackupStatus()]);
      setAdminNotice(`Created ${response.item.name}.`);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSyncingBackups(false);
    }
  };

  const handleStoredBackupDownload = async () => {
    if (!sessionToken || !sessionUser || !backupDownloadDialog) {
      return;
    }

    setIsSyncingBackups(true);
    setAdminNotice('');
    setAppError('');

    try {
      const response = await downloadStoredBackup(sessionToken, backupDownloadDialog.fileName, backupExportMode);
      const downloadName = response.filename ?? backupDownloadDialog.fileName;
      triggerDownload(downloadName, response.content, 'application/json');
      setBackupDownloadDialog(null);

      if (backupExportMode === 'rotate-passcodes') {
        const backup = backupSnapshotSchema.parse(JSON.parse(response.content));
        setLoginUsername(sessionUser.username);
        clearSession({
          authNotice: `Downloaded a backup with rotated one-time passcodes for ${backup.users.itemCount} users. Everyone was signed out. Sign in again with your exported one-time passcode before continuing.`,
        });
        return;
      }

      setAdminNotice(`Downloaded ${downloadName}.`);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSyncingBackups(false);
    }
  };

  const handleStoredBackupDelete = async (file: BackupStoredFile) => {
    if (!sessionToken) {
      return;
    }

    const confirmed = window.confirm(`Delete stored backup ${file.name}?`);
    if (!confirmed) {
      return;
    }

    setIsSyncingBackups(true);
    setAdminNotice('');
    setAppError('');

    try {
      await deleteStoredBackup(sessionToken, file.name);
      await refreshStoredBackups();
      if (backupDownloadDialog?.fileName === file.name) {
        setBackupDownloadDialog(null);
      }
      if (backupRestoreDialog?.file.name === file.name) {
        setBackupRestoreDialog(null);
      }
      setAdminNotice(`Deleted ${file.name}.`);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSyncingBackups(false);
    }
  };

  const handleStoredBackupRestore = async (action: BackupRestoreAction) => {
    if (!sessionToken || !backupRestoreDialog || !sessionUser) {
      return;
    }

    const confirmed = window.confirm(buildBackupRestoreConfirmation(action, backupRestoreDialog.file.name));
    if (!confirmed) {
      return;
    }

    setIsSyncingBackups(true);
    setAdminNotice('');
    setAppError('');

    try {
      const response = await restoreStoredBackup(sessionToken, backupRestoreDialog.file.name, {
        target: action.target,
        mode: 'replace',
      });

      setBackupStatus((currentStatus) =>
        currentStatus
          ? {
              ...currentStatus,
              lastRestoreAt: response.restoredAt,
            }
          : currentStatus,
      );

      const notice = buildBackupRestoreNotice(response.target, backupRestoreDialog.file.name, response.counts);
      if (response.target === 'all' || response.target === 'users') {
        setLoginUsername(sessionUser.username);
        clearSession({
          authNotice: `${notice} ${buildBackupSessionNotice(response.target, response.userMode)}`,
        });
        return;
      }

      await refreshFoundationSnapshot();
      setBackupRestoreDialog(null);
      setAdminNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSyncingBackups(false);
    }
  };

  const startEditingEmployee = (employee: Employee | EmployeeAdmin) => {
    setSelectedEmployeeDetail('auth' in employee ? employee : null);
    setSelectedEmployeeId(employee.id);
    setEditingEmployeeId(employee.id);
    setDraftEmployee(toDraft(employee));
    setFormError('');
  };

  const startAddingEmployee = () => {
    setEditingEmployeeId('new');
    setSelectedEmployeeId(null);
    setDraftEmployee({
      id: null,
      username: '',
      fullName: '',
      email: '',
      role: 'employee',
      status: 'active',
      managerId: sessionUser?.id ?? '',
      assessor1Id: sessionUser?.id ?? '',
      assessor2Id: '',
      reviewer1Id: sessionUser?.id ?? '',
      reviewer2Id: '',
      initialPassword: '',
    });
    setFormError('');
  };

  const syncUpdatedEmployee = (nextEmployee: EmployeeAdmin) => {
    const summary = toEmployeeSummary(nextEmployee);
    setEmployees((currentEmployees) => upsertEmployee(currentEmployees, summary));
    setSelectedEmployeeId(summary.id);
    setSelectedEmployeeDetail(nextEmployee);

    if (session?.user.id === summary.id) {
      setSession((currentSession) =>
        currentSession
          ? {
              ...currentSession,
              user: summary,
            }
          : currentSession,
      );
    }
  };

  const saveEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draftEmployee || !sessionToken) {
      return;
    }

    if (!draftEmployee.username.trim()) {
      setFormError('Username is required.');
      return;
    }

    if (!draftEmployee.fullName.trim()) {
      setFormError('Full name is required.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draftEmployee.email)) {
      setFormError('Enter a valid email address.');
      return;
    }

    if (draftEmployee.id && draftEmployee.reviewer1Id === draftEmployee.id) {
      setFormError('Reviewer 1 cannot be the employee.');
      return;
    }

    if (draftEmployee.id && draftEmployee.reviewer2Id === draftEmployee.id) {
      setFormError('Reviewer 2 cannot be the employee.');
      return;
    }

    if (
      draftEmployee.reviewer1Id &&
      draftEmployee.reviewer2Id &&
      draftEmployee.reviewer1Id === draftEmployee.reviewer2Id
    ) {
      setFormError('Reviewer 1 and reviewer 2 must be different users.');
      return;
    }

    setIsSavingEmployee(true);
    setFormError('');

    try {
      const commonPayload = {
        username: draftEmployee.username.trim(),
        fullName: draftEmployee.fullName.trim(),
        email: draftEmployee.email.trim().toLowerCase(),
        role: draftEmployee.role,
        status: draftEmployee.status,
        managerId: draftEmployee.managerId || null,
        assessor1Id: draftEmployee.assessor1Id || null,
        assessor2Id: draftEmployee.assessor2Id || null,
        reviewer1Id: draftEmployee.reviewer1Id || null,
        reviewer2Id: draftEmployee.reviewer2Id || null,
      } as const;

      const response = draftEmployee.id
        ? await updateEmployee(sessionToken, draftEmployee.id, commonPayload)
        : await createEmployee(sessionToken, {
            ...commonPayload,
            password: draftEmployee.initialPassword.trim() || undefined,
          });

      syncUpdatedEmployee(response.item);
      resetEditingState();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsSavingEmployee(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!draftEmployee?.id || !sessionToken) {
      return;
    }

    const confirmed = window.confirm(
      'Delete this employee? The employee will be removed from the app and kept as a hidden tombstone in the database.',
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingEmployee(true);
    setFormError('');

    try {
      await deleteEmployee(sessionToken, draftEmployee.id);

      if (sessionUser?.id === draftEmployee.id) {
        clearSession({
          authNotice: 'This account was deleted.',
        });
        return;
      }

      removeEmployeeFromState(draftEmployee.id);
      closeEmployeeDialog();
      setAdminNotice('Employee deleted.');
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsDeletingEmployee(false);
    }
  };

  const markEmployeeInactive = async () => {
    if (!selectedEmployee || !sessionToken) {
      return;
    }

    try {
      const response = await updateEmployee(sessionToken, selectedEmployee.id, {
        status: 'inactive',
      });
      syncUpdatedEmployee(response.item);
      setPasswordStatus('Employee moved to the inactive directory.');
    } catch (error) {
      setAppError(getErrorMessage(error));
    }
  };

  const saveKnownPassword = async () => {
    if (!selectedEmployeeDetail || !sessionToken || !passwordDraft.trim()) {
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const response = await setEmployeePassword(sessionToken, selectedEmployeeDetail.id, {
        password: passwordDraft.trim(),
      });

      setSelectedEmployeeDetail({
        ...selectedEmployeeDetail,
        auth: {
          ...selectedEmployeeDetail.auth,
          passwordConfigured: true,
          passwordResetRequired: false,
          lastPasswordChangeAt: response.lastPasswordChangeAt,
        },
      });
      setPasswordDraft('');
      setTemporaryPassword(null);
      setPasswordStatus('Admin set a new password for this employee.');
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedEmployeeDetail || !sessionToken) {
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const response = await resetEmployeePassword(sessionToken, selectedEmployeeDetail.id);

      setSelectedEmployeeDetail({
        ...selectedEmployeeDetail,
        auth: {
          ...selectedEmployeeDetail.auth,
          passwordConfigured: true,
          passwordResetRequired: true,
          lastPasswordChangeAt: response.lastPasswordChangeAt,
        },
      });
      setPasswordDraft('');
      setTemporaryPassword(response.temporaryPassword);
      setPasswordStatus('Admin generated a one-time passcode for the next sign-in.');
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSaveAssessmentForLater = async () => {
    if (!selectedAssessmentEditor || !sessionToken) {
      return;
    }

    setIsSavingAssessmentWorkflow(true);
    setAppError('');
    setWorkflowNotice('');

    try {
      const { notice } = selectedAssessmentEditor.isAdminOverride
        ? await updateAssessmentByAdminInApi(sessionToken, selectedAssessmentEditor, assessmentResponsesDraft, {
            reviewState:
              normalizeAdminAssessmentState(selectedAssessmentEditor.reviewState) === 'new'
              || normalizeAdminAssessmentState(selectedAssessmentEditor.reviewState) === 'draft'
                ? hasAssessmentDraftResponses
                  ? 'draft'
                  : 'new'
                : normalizeAdminAssessmentState(selectedAssessmentEditor.reviewState),
            managerNotes: assessmentManagerNotesDraft,
          })
        : await saveAssessmentDraftToApi(sessionToken, selectedAssessmentEditor, assessmentResponsesDraft);
      await refreshFoundationSnapshot();
      setWorkflowNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const handleSubmitAssessment = async () => {
    if (!selectedAssessmentEditor || !sessionToken) {
      return;
    }

    setIsSavingAssessmentWorkflow(true);
    setAppError('');
    setWorkflowNotice('');

    try {
      const { notice } = selectedAssessmentEditor.isAdminOverride
        ? isAssessmentDraftComplete
          ? await updateAssessmentByAdminInApi(sessionToken, selectedAssessmentEditor, assessmentResponsesDraft, {
              reviewState: 'submitted',
              managerNotes: assessmentManagerNotesDraft,
            })
          : await updateAssessmentByAdminInApi(sessionToken, selectedAssessmentEditor, assessmentResponsesDraft, {
              reviewState: hasAssessmentDraftResponses ? 'draft' : 'new',
              managerNotes: assessmentManagerNotesDraft,
            })
        : isAssessmentDraftComplete
          ? await submitAssessmentToApi(sessionToken, selectedAssessmentEditor, assessmentResponsesDraft)
          : await saveAssessmentDraftToApi(sessionToken, selectedAssessmentEditor, assessmentResponsesDraft);
      await refreshFoundationSnapshot();
      setWorkflowNotice(
        isAssessmentDraftComplete ? notice : 'Assessment saved for later. Complete every response before submitting.',
      );
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const handleAcceptAssessmentAsAdmin = async () => {
    if (!selectedAssessmentEditor || !selectedAssessmentEditor.isAdminOverride || !sessionToken) {
      return;
    }

    setIsSavingAssessmentWorkflow(true);
    setAppError('');
    setWorkflowNotice('');

    try {
      const { notice } = await updateAssessmentByAdminInApi(sessionToken, selectedAssessmentEditor, assessmentResponsesDraft, {
        reviewState: 'accepted',
        managerNotes: assessmentManagerNotesDraft,
      });
      await refreshFoundationSnapshot();
      setWorkflowNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const handleUpdateAssessmentStatusAsAdmin = async () => {
    if (!selectedAssessmentEditor || !selectedAssessmentEditor.isAdminOverride || !sessionToken) {
      return;
    }

    setIsSavingAssessmentWorkflow(true);
    setAppError('');
    setWorkflowNotice('');

    try {
      const { notice } = await updateAssessmentByAdminInApi(sessionToken, selectedAssessmentEditor, assessmentResponsesDraft, {
        reviewState: assessmentAdminStateDraft,
        managerNotes: assessmentManagerNotesDraft,
      });
      await refreshFoundationSnapshot();
      setWorkflowNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const handleDeleteAssessmentAsAdmin = async () => {
    if (!selectedAssessmentEditor || !selectedAssessmentEditor.canDelete || !sessionToken) {
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedAssessmentEditor.title}?`);
    if (!confirmed) {
      return;
    }

    setIsSavingAssessmentWorkflow(true);
    setAppError('');
    setWorkflowNotice('');

    try {
      const { notice } = await deleteAssessmentByAdminInApi(sessionToken, selectedAssessmentEditor);
      closeAssessmentDialog();
      await refreshFoundationSnapshot();
      setWorkflowNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const handleAcceptReview = async () => {
    if (!selectedReviewPanel || !sessionToken) {
      return;
    }

    setIsSavingAssessmentWorkflow(true);
    setAppError('');
    setWorkflowNotice('');

    try {
      const { notice } = await acceptReviewToApi(sessionToken, selectedReviewPanel, reviewNotesDraft);
      await refreshFoundationSnapshot();
      setWorkflowNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const handleRejectReview = async () => {
    if (!selectedReviewPanel || !sessionToken) {
      return;
    }

    setIsSavingAssessmentWorkflow(true);
    setAppError('');
    setWorkflowNotice('');

    try {
      const { notice } = await rejectReviewToApi(sessionToken, selectedReviewPanel, reviewNotesDraft);
      setIsReturnToIncompleteDialogOpen(false);
      await refreshFoundationSnapshot();
      setWorkflowNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const handleMarkAssessmentSetReady = async () => {
    if (!selectedAssessmentSetWorkflowPanel || !sessionToken) {
      return;
    }

    setIsSavingAssessmentWorkflow(true);
    setAppError('');
    setWorkflowNotice('');

    try {
      const { notice } = await markAssessmentSetReadyForMeetingInApi(sessionToken, {
        reviewPeriodId: selectedAssessmentSetWorkflowPanel.reviewPeriodId,
        employeeId: selectedAssessmentSetWorkflowPanel.employeeId,
      });
      setSelectedAssessmentSetDialog(null);
      await refreshFoundationSnapshot();
      setWorkflowNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const handleScheduleAssessmentSet = async () => {
    if (!selectedAssessmentSetWorkflowPanel || !sessionToken) {
      return;
    }

    setIsSavingAssessmentWorkflow(true);
    setAppError('');
    setWorkflowNotice('');

    try {
      const { notice } = await scheduleAssessmentSetInApi(sessionToken, {
        reviewPeriodId: selectedAssessmentSetWorkflowPanel.reviewPeriodId,
        employeeId: selectedAssessmentSetWorkflowPanel.employeeId,
      });
      setSelectedAssessmentSetDialog(null);
      await refreshFoundationSnapshot();
      setWorkflowNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const handleReviewerConclusion = async (reviewerRole: 'reviewer1' | 'reviewer2', completed: boolean) => {
    if (!selectedAssessmentSetWorkflowPanel || !sessionToken) {
      return;
    }

    setIsSavingAssessmentWorkflow(true);
    setAppError('');
    setWorkflowNotice('');

    try {
      const { notice } = await concludeAssessmentSetInApi(
        sessionToken,
        {
          reviewPeriodId: selectedAssessmentSetWorkflowPanel.reviewPeriodId,
          employeeId: selectedAssessmentSetWorkflowPanel.employeeId,
        },
        reviewerRole,
        {
          completed,
          reviewerNotes: reviewerNotesDraft[reviewerRole],
        },
      );
      setSelectedAssessmentSetDialog(null);
      await refreshFoundationSnapshot();
      setWorkflowNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const startAddingReviewPeriod = () => {
    const hasActiveReviewPeriod = reviewAdmin?.reviewPeriods.some((reviewPeriod) => reviewPeriod.status === 'active') ?? false;
    setReviewPeriodDraft(toReviewPeriodDraft(undefined, hasActiveReviewPeriod ? 'inactive' : 'active'));
    setQuestionSetDraft(null);
    setEditingQuestionDraftId(null);
    setAdminNotice('');
  };

  const startEditingReviewPeriod = (reviewPeriod: ReviewPeriod) => {
    setSelectedReviewPeriodManagementId(reviewPeriod.id);
    setReviewPeriodDraft(toReviewPeriodDraft(reviewPeriod));
    setQuestionSetDraft(null);
    setEditingQuestionDraftId(null);
    setAdminNotice('');
  };

  const saveReviewPeriodDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!reviewAdmin || !reviewPeriodDraft || !sessionToken) {
      return;
    }

    if (!reviewPeriodDraft.key.trim() || !reviewPeriodDraft.label.trim()) {
      setAdminNotice('Review periods need both a key and a label.');
      return;
    }

    if (
      !reviewPeriodDraft.startDate ||
      !reviewPeriodDraft.dueDate ||
      !reviewPeriodDraft.assessmentDueDate ||
      !reviewPeriodDraft.reviewDueDate
    ) {
      setAdminNotice('Choose the start date, end date, assessment due date, and review due date for the review period.');
      return;
    }

    if (reviewPeriodDraft.startDate > reviewPeriodDraft.dueDate) {
      setAdminNotice('Review period start date must be on or before the end date.');
      return;
    }

    if (reviewPeriodDraft.assessmentDueDate > reviewPeriodDraft.reviewDueDate) {
      setAdminNotice('Assessment due date must be on or before the review due date.');
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const { reviewPeriod, notice } = await saveReviewPeriodToApi(sessionToken, reviewPeriodDraft);
      await refreshFoundationSnapshot();
      setSelectedReviewPeriodManagementId(reviewPeriod.id);
      setReviewPeriodDraft(null);
      setAdminNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const handleDeleteReviewPeriod = async (reviewPeriod: ReviewPeriod) => {
    if (!sessionToken || !selectedReviewPeriodManagementSummary) {
      return;
    }

    const confirmed = window.confirm(
      buildDeleteReviewPeriodConfirmation(reviewPeriod, selectedReviewPeriodManagementSummary),
    );
    if (!confirmed) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const { notice } = await deleteReviewPeriodFromApi(sessionToken, reviewPeriod);
      await refreshFoundationSnapshot();
      setReviewPeriodDraft(null);
      setQuestionSetDraft(null);
      setEditingQuestionDraftId(null);
      setAdminNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const handleSyncAssessments = async (reviewPeriodId: string) => {
    if (!sessionToken) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const result = await syncAssessmentsForReviewPeriod(sessionToken, reviewPeriodId);
      await refreshFoundationSnapshot();
      setAdminNotice(
        `Synced assessments for the active review period. Created ${result.createdSelfAssessments} self assessments and ${result.createdPeerAssessments} peer assessments.`,
      );
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const handleClearReadyAssessments = async (reviewPeriodId: string) => {
    if (!sessionToken) {
      return;
    }

    if (!window.confirm('Clear all not started assessments from the active review period?')) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const result = await clearReadyAssessmentsForReviewPeriod(sessionToken, reviewPeriodId);
      await refreshFoundationSnapshot();
      setAdminNotice(
        `Cleared ${result.clearedAssessments} not started ${result.clearedAssessments === 1 ? 'assessment' : 'assessments'} from the active review period.`,
      );
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const openQuestionSetEditor = (target: QuestionTarget) => {
    if (!selectedReviewPeriod) {
      return;
    }

    const existingQuestionSet =
      target === 'self' ? selectedQuestionSets.self : selectedQuestionSets.peer;

    if (selectedReviewPeriod.status === 'archived' && !existingQuestionSet) {
      return;
    }

    const nextDraftBase = toQuestionSetDraft(selectedReviewPeriod.id, target, existingQuestionSet ?? undefined);
    const nextDraft = questionSetStatusEnabled ? nextDraftBase : { ...nextDraftBase, status: 'active' as const };
    setQuestionSetDraft(nextDraft);
    setQuestionSetInitialDraft(serializeQuestionSetDraft(nextDraft));
    setEditingQuestionDraftId(null);
    setIsNewQuestionCategoryDialogOpen(false);
    setNewQuestionCategoryDraft('');
    setNewQuestionCategoryError('');
    setReviewPeriodDraft(null);
    setAdminNotice('');
  };

  const closeQuestionSetDialog = (options?: { force?: boolean }) => {
    const isDirty =
      questionSetDraft &&
      questionSetInitialDraft &&
      selectedReviewPeriod?.status !== 'archived' &&
      serializeQuestionSetDraft(questionSetDraft) !== questionSetInitialDraft;

    if (!options?.force && isDirty) {
      const confirmed = window.confirm('Close this question set without saving your changes?');
      if (!confirmed) {
        return false;
      }
    }

    setQuestionSetDraft(null);
    setQuestionSetInitialDraft(null);
    setEditingQuestionDraftId(null);
    setQuestionEditorDraft(null);
    setQuestionEditorInitialDraft(null);
    setIsNewQuestionCategoryDialogOpen(false);
    setNewQuestionCategoryDraft('');
    setNewQuestionCategoryError('');
    return true;
  };

  const closeQuestionEditorDialog = (options?: { force?: boolean }) => {
    if (!options?.force && isQuestionEditorDirty) {
      const confirmed = window.confirm('Close this question without saving your changes?');
      if (!confirmed) {
        return false;
      }
    }

    setEditingQuestionDraftId(null);
    setQuestionEditorDraft(null);
    setQuestionEditorInitialDraft(null);
    setIsNewQuestionCategoryDialogOpen(false);
    setNewQuestionCategoryDraft('');
    setNewQuestionCategoryError('');
    return true;
  };

  const updateQuestionSetDraftField = <Field extends keyof QuestionSetDraft,>(
    field: Field,
    value: QuestionSetDraft[Field],
  ) => {
    setQuestionSetDraft((currentDraft) => (currentDraft ? { ...currentDraft, [field]: value } : currentDraft));
  };

  const updateQuestionDraftField = <
    Field extends keyof QuestionSetQuestionDraft,
  >(
    field: Field,
    value: QuestionSetQuestionDraft[Field],
  ) => {
    setQuestionEditorDraft((currentDraft) => (currentDraft ? { ...currentDraft, [field]: value } : currentDraft));
  };

  const removeQuestionDraft = (questionId: string) => {
    setQuestionSetDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            questions: currentDraft.questions
              .filter((question) => question.id !== questionId)
              .map((question, index) => ({
                ...question,
                order: index + 1,
              })),
          }
        : currentDraft,
    );

    if (editingQuestionDraftId === questionId) {
      closeQuestionEditorDialog({ force: true });
    }
  };

  const addQuestionDraft = () => {
    const nextQuestionId =
      typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `local-${Math.random().toString(36).slice(2, 12)}`;

    setQuestionSetDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            questions: [
              ...currentDraft.questions,
              {
                id: nextQuestionId,
                order: currentDraft.questions.length + 1,
                type: currentDraft.target === 'self' ? 'subjective' : 'ranking',
                category: '',
                prompt: '',
              },
            ],
          }
        : currentDraft,
    );
    setEditingQuestionDraftId(nextQuestionId);
  };

  const openNewQuestionCategoryDialog = () => {
    setNewQuestionCategoryDraft('');
    setNewQuestionCategoryError('');
    setIsNewQuestionCategoryDialogOpen(true);
  };

  const closeNewQuestionCategoryDialog = () => {
    setIsNewQuestionCategoryDialogOpen(false);
    setNewQuestionCategoryDraft('');
    setNewQuestionCategoryError('');
  };

  const handleQuestionCategoryChange = (value: string) => {
    if (!editingQuestionDraft) {
      return;
    }

    if (value === newQuestionCategoryOptionValue) {
      openNewQuestionCategoryDialog();
      return;
    }

    updateQuestionDraftField('category', value);
  };

  const saveNewQuestionCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingQuestionDraft || !sessionToken || !isAdmin) {
      return;
    }

    const trimmedCategory = newQuestionCategoryDraft.trim();
    if (!trimmedCategory) {
      setNewQuestionCategoryError('Enter a category name.');
      return;
    }

    const existingCategory =
      questionCategoryOptions.find((category) => category.toLowerCase() === trimmedCategory.toLowerCase()) ?? trimmedCategory;

    setIsSavingReviewAdmin(true);
    setAppError('');
    setNewQuestionCategoryError('');

    try {
      const response = await updateQuestionCategories(sessionToken, {
        items: [...questionCategories, existingCategory],
      });
      setQuestionCategories(response.items);
      updateQuestionDraftField('category', existingCategory);
      closeNewQuestionCategoryDialog();
    } catch (error) {
      setNewQuestionCategoryError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const saveEditingQuestionDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!questionEditorDraft) {
      return;
    }

    setQuestionSetDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            questions: currentDraft.questions.map((question) =>
              question.id === questionEditorDraft.id ? { ...questionEditorDraft } : question,
            ),
          }
        : currentDraft,
    );
    closeQuestionEditorDialog({ force: true });
  };

  const saveQuestionDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!reviewAdmin || !selectedReviewPeriod || !questionSetDraft || !sessionToken) {
      return;
    }

    if (!questionSetDraft.title.trim()) {
      setAdminNotice('Question sets need a title.');
      return;
    }

    if (!questionSetDraft.questions.length || questionSetDraft.questions.some((question) => !question.prompt.trim())) {
      setAdminNotice('Each question needs a prompt before it can be saved.');
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const { notice } = await saveQuestionSetToApi(sessionToken, questionSetDraft);
      await refreshFoundationSnapshot();
      void refreshQuestionCategorySuggestions().catch((error) => {
        setAppError(getErrorMessage(error));
      });
      closeQuestionSetDialog({ force: true });
      setAdminNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const handleAssignmentChange = async (employeeId: string, managerId: string | null, assessorId: string | null) => {
    if (!reviewAdmin || !selectedReviewPeriod || !sessionToken) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const { notice, relationships } = await saveAssignmentToApi({
        token: sessionToken,
        reviewAdmin,
        employees,
        reviewPeriodId: selectedReviewPeriod.id,
        employeeId,
        managerId,
        assessorId,
      });

      syncEmployeeRelationships(employeeId, relationships.managerId, relationships.assessorId);
      await Promise.all([refreshFoundationSnapshot(), refreshEmployeeDirectory()]);
      setAdminNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const handleArchiveToggle = async (reviewPeriodId: string, archived: boolean) => {
    if (!reviewAdmin || !sessionToken) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const { notice } = await toggleReviewPeriodArchiveInApi(sessionToken, reviewPeriodId, archived);
      await refreshFoundationSnapshot();

      if (questionSetDraft?.reviewPeriodId === reviewPeriodId) {
        closeQuestionSetDialog();
      }

      setAdminNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const handleActivateReviewPeriod = async (reviewPeriod: ReviewPeriod) => {
    if (!sessionToken) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      await saveReviewPeriodToApi(sessionToken, {
        id: reviewPeriod.id,
        key: reviewPeriod.key,
        label: reviewPeriod.label,
        startDate: reviewPeriod.startDate,
        dueDate: reviewPeriod.dueDate,
        assessmentDueDate: reviewPeriod.assessmentDueDate,
        reviewDueDate: reviewPeriod.reviewDueDate,
        status: 'active',
      });
      await refreshFoundationSnapshot();
      setAdminNotice(`Made ${reviewPeriod.label} the active review period.`);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const handleQuestionSetExport = async (format: TransferFormat) => {
    if (!selectedReviewPeriod || !sessionToken) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const response = await exportQuestionSetsFromApi(sessionToken, selectedReviewPeriod.id, format);
      const content = serializeQuestionSetsTransfer(response);
      const downloadName = buildQuestionSetExportFilename(selectedReviewPeriod, response);
      const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
      triggerDownload(downloadName, content, mimeType);
      setAdminNotice(buildQuestionSetExportNotice(response));
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const handleCopyQuestionSetToCurrentReviewPeriod = async (
    questionSet: Pick<QuestionSetDraft, 'target' | 'title' | 'headerMarkdown' | 'footerMarkdown' | 'questions'>,
  ) => {
    if (!selectedReviewPeriod || !activeReviewAdminPeriod || !sessionToken) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const { notice, questionSet: copiedQuestionSet } = await copyQuestionSetToReviewPeriodInApi(
        sessionToken,
        questionSet,
        selectedReviewPeriod,
        activeReviewAdminPeriod,
      );
      await refreshFoundationSnapshot();
      setSelectedReviewPeriodId(activeReviewAdminPeriod.id);
      const nextDraft = toQuestionSetDraft(activeReviewAdminPeriod.id, copiedQuestionSet.target, copiedQuestionSet);
      setQuestionSetDraft(nextDraft);
      setQuestionSetInitialDraft(serializeQuestionSetDraft(nextDraft));
      setEditingQuestionDraftId(null);
      setIsNewQuestionCategoryDialogOpen(false);
      setNewQuestionCategoryDraft('');
      setNewQuestionCategoryError('');
      setReviewPeriodDraft(null);
      setAdminNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const handleQuestionSetImport = async (format: TransferFormat) => {
    questionSetImportFormatRef.current = format;
    questionSetImportInputRef.current?.click();
  };

  const handleQuestionSetImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!selectedReviewPeriod || !sessionToken || !file) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const raw = await file.text();
      const payload = buildQuestionSetsImportPayload(questionSetImportFormatRef.current, raw);
      const response = await importQuestionSetsFromApi(sessionToken, selectedReviewPeriod.id, payload);
      closeQuestionSetDialog({ force: true });
      await refreshFoundationSnapshot();
      setAdminNotice(buildQuestionSetImportNotice(response));
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const resetQuestionSetDraft = () => {
    if (!questionSetDraft) {
      return;
    }

    if (!window.confirm('Delete this question set and reset it to a blank question set?')) {
      return;
    }

    setQuestionSetDraft(createBlankQuestionSetDraft(questionSetDraft));
    setEditingQuestionDraftId(null);
    setIsNewQuestionCategoryDialogOpen(false);
    setNewQuestionCategoryDraft('');
    setNewQuestionCategoryError('');
    setAdminNotice('Question set reset to a blank question set. Save it to keep the change.');
  };

  const handleAssignmentExport = async (format: TransferFormat) => {
    if (!selectedReviewPeriod || !sessionToken) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const response = await exportAssignmentsFromApi(sessionToken, selectedReviewPeriod.id, format);
      const content = serializeAssignmentsTransfer(response);
      const downloadName = buildAssignmentsExportFilename(selectedReviewPeriod, response);
      const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
      triggerDownload(downloadName, content, mimeType);
      setAdminNotice(buildAssignmentsExportNotice(response));
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const handleAssignmentImport = async (format: TransferFormat) => {
    assignmentImportFormatRef.current = format;
    assignmentImportInputRef.current?.click();
  };

  const handleAssignmentImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!selectedReviewPeriod || !sessionToken || !file) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const raw = await file.text();
      const payload = buildAssignmentsImportPayload(assignmentImportFormatRef.current, raw);
      const response = await importAssignmentsFromApi(sessionToken, selectedReviewPeriod.id, payload);
      await Promise.all([refreshFoundationSnapshot(), refreshEmployeeDirectory()]);
      if (selectedEmployeeId) {
        const employeeResponse = await getEmployee(sessionToken, selectedEmployeeId);
        setSelectedEmployeeDetail(employeeResponse.item);
      }
      setAdminNotice(buildAssignmentsImportNotice(response));
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const renderPlaceholderSection = () => (
    <main className="content-grid">
      <section className="card">
        <p className="section-label">Planned slice</p>
        <h3>{currentSection.placeholderTitle}</h3>
        <p>{currentSection.placeholderDescription}</p>
      </section>

      <section className="card">
        <p className="section-label">Layout expectations</p>
        <ul className="bullet-list">
          {currentSection.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <p className="section-label">Next slice</p>
        <h3>Future implementation hook</h3>
        <p>{currentSection.nextSlice}</p>
      </section>

      <section className="card card-wide">
        <p className="section-label">Shared IA</p>
        <div className="ia-grid">
          {appSections.map((section) => (
            <article className="ia-item" key={section.id}>
              <h3>{section.title}</h3>
              <p>{section.summary}</p>
              <span>{section.group}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );

  const handleDialogShortcut = (event: KeyboardEvent<HTMLElement>, action: () => void, disabled = false) => {
    if (disabled) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  const renderQuestionSetCard = (target: QuestionTarget, questionSet: QuestionSet | null) => {
    const isReadOnly = selectedReviewPeriod?.status === 'archived';
    const canOpenQuestionSet = !isSavingReviewAdmin && (!isReadOnly || Boolean(questionSet));

    return (
      <section
        className="card admin-section-card question-set-card"
        role="button"
        tabIndex={canOpenQuestionSet ? 0 : -1}
        aria-disabled={!canOpenQuestionSet}
        aria-label={`${questionSet ? 'Edit' : 'Create'} ${target === 'self' ? 'self' : 'peer'} assessment question set`}
        onClick={() => {
          if (canOpenQuestionSet) {
            openQuestionSetEditor(target);
          }
        }}
        onKeyDown={(event) => handleDialogShortcut(event, () => openQuestionSetEditor(target), !canOpenQuestionSet)}
      >
      <div className="question-set-heading">
        <p className="section-label">{target === 'self' ? 'Self assessment' : 'Peer assessment'}</p>
        <h3>{questionSet?.title ?? `Create ${target} questions`}</h3>
      </div>
      <dl className="detail-grid compact-detail-grid">
        <div>
          <dt>Questions</dt>
          <dd>{questionSet?.questions.length ?? 0}</dd>
        </div>
        {questionSetStatusEnabled ? (
          <div>
            <dt>Status</dt>
            <dd>{questionSet?.status ?? 'draft'}</dd>
          </div>
        ) : null}
      </dl>
      <MarkdownContent markdown={questionSet?.headerMarkdown || 'No header text yet.'} className="markdown-content" />
      <div className="question-set-question-list">
        {questionSet?.questions.map((question) => (
          <article className="question-set-question" key={question.id}>
            <div className="question-prompt-block">
              <span className="question-order">#{question.order}</span>
              <MarkdownContent markdown={question.prompt} className="markdown-content question-prompt-markdown" />
            </div>
            {question.category ? <small className="muted-copy">{question.category}</small> : null}
          </article>
        )) ?? <p className="muted-copy">No questions configured yet.</p>}
      </div>
      <p className="muted-copy">
        {isReadOnly
          ? questionSet
            ? 'Click anywhere to review this archived question set.'
            : 'Archived review periods cannot create new question sets.'
          : 'Click anywhere to edit this question set.'}
      </p>
    </section>
    );
  };

  const renderReviewPeriodEditorForm = () =>
    reviewPeriodDraft ? (
      <form className="stack-form" onSubmit={saveReviewPeriodDraft}>
        <label>
          Review period key
          <input
            value={reviewPeriodDraft.key}
            onChange={(event) => setReviewPeriodDraft({ ...reviewPeriodDraft, key: event.target.value })}
            placeholder="2026"
          />
        </label>
        <label>
          Label
          <input
            value={reviewPeriodDraft.label}
            onChange={(event) => setReviewPeriodDraft({ ...reviewPeriodDraft, label: event.target.value })}
            placeholder="2026 Annual Review"
          />
        </label>
        <div className="form-columns">
          <label>
            Start date
            <input
              type="date"
              value={reviewPeriodDraft.startDate}
              onChange={(event) => setReviewPeriodDraft({ ...reviewPeriodDraft, startDate: event.target.value })}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              value={reviewPeriodDraft.dueDate}
              onChange={(event) => setReviewPeriodDraft({ ...reviewPeriodDraft, dueDate: event.target.value })}
            />
          </label>
          <label>
            Assessment Due Date
            <input
              type="date"
              value={reviewPeriodDraft.assessmentDueDate}
              onChange={(event) => setReviewPeriodDraft({ ...reviewPeriodDraft, assessmentDueDate: event.target.value })}
            />
          </label>
          <label>
            Review Due Date
            <input
              type="date"
              value={reviewPeriodDraft.reviewDueDate}
              onChange={(event) => setReviewPeriodDraft({ ...reviewPeriodDraft, reviewDueDate: event.target.value })}
            />
          </label>
          <label>
            Status
            <select
              value={reviewPeriodDraft.status}
              onChange={(event) =>
                setReviewPeriodDraft({
                  ...reviewPeriodDraft,
                  status: event.target.value as ReviewPeriodDraft['status'],
                })
              }
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>
        </div>
        <div className="action-row">
          <button type="submit" disabled={isSavingReviewAdmin}>
            Save period
          </button>
          <button type="button" className="secondary-button" onClick={() => setReviewPeriodDraft(null)}>
            Cancel
          </button>
        </div>
      </form>
    ) : null;

  const getReviewPeriodStatusButtonProps = (reviewPeriod: ReviewPeriod) =>
    reviewPeriod.status === 'inactive'
      ? {
          label: 'Make active',
          disabled: isSavingReviewAdmin,
          className: '',
          onClick: () => void handleActivateReviewPeriod(reviewPeriod),
        }
      : reviewPeriod.status === 'archived'
        ? {
            label: 'Archived',
            disabled: true,
            className: 'secondary-button review-period-status-button-static',
            onClick: undefined,
          }
        : {
            label: 'Active',
            disabled: true,
            className: 'review-period-status-button-active review-period-status-button-static',
            onClick: undefined,
          };

  const renderQuestions = () => {
    if (!reviewAdmin || !selectedReviewPeriod || !selectedReviewPeriodSummary) {
      return (
        <main className="content-grid">
          <section className="card">
            <p className="muted-copy">Loading review period admin data...</p>
          </section>
        </main>
      );
    }

    const reviewPeriodButtonProps = getReviewPeriodStatusButtonProps(selectedReviewPeriod);

    return (
      <main className="admin-stack">
        <section className="card admin-section-card review-period-card">
          <div className="section-heading review-period-heading">
            <h3>{selectedReviewPeriod.label}</h3>
            <div className="review-period-picker-row">
              <button
                type="button"
                className={reviewPeriodButtonProps.className || undefined}
                disabled={reviewPeriodButtonProps.disabled}
                onClick={reviewPeriodButtonProps.onClick}
              >
                {reviewPeriodButtonProps.label}
              </button>
              <label className="inline-field review-period-picker">
                <span className="sr-only">Review period</span>
                <select
                  value={selectedReviewPeriod.id}
                  onChange={(event) => {
                    if (!closeQuestionSetDialog()) {
                      return;
                    }
                    setSelectedReviewPeriodId(event.target.value);
                  }}
                >
                  {reviewAdmin.reviewPeriods.map((reviewPeriod) => (
                    <option key={reviewPeriod.id} value={reviewPeriod.id}>
                      {reviewPeriod.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Window</dt>
              <dd>
                {selectedReviewPeriod.startDate} → {selectedReviewPeriod.dueDate}
              </dd>
            </div>
            <div>
              <dt>Assessment due</dt>
              <dd>{selectedReviewPeriod.assessmentDueDate}</dd>
            </div>
            <div>
              <dt>Review due</dt>
              <dd>{selectedReviewPeriod.reviewDueDate}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{selectedReviewPeriod.status}</dd>
            </div>
            <div>
              <dt>Question sets</dt>
              <dd>{selectedReviewPeriodSummary.questionSetCount}</dd>
            </div>
            <div>
              <dt>Assignments</dt>
              <dd>{selectedReviewPeriodSummary.assignmentCount}</dd>
            </div>
          </dl>
          {selectedReviewPeriod.status === 'archived' ? (
            <p className="toolbar-note">
              Archived review periods stay visible here but question sets become read-only until an admin unarchives the cycle.
            </p>
          ) : selectedReviewPeriod.status === 'inactive' ? (
            <p className="toolbar-note">Inactive review periods stay editable, but only the active period can sync assessments.</p>
          ) : null}
          <div className="action-row review-period-actions">
            <button type="button" className="secondary-button" disabled={isSavingReviewAdmin} onClick={openQuestionCategoriesDialog}>
              Edit question categories
            </button>
          </div>
        </section>

        {renderQuestionSetCard('self', selectedQuestionSets.self)}
        {renderQuestionSetCard('peer', selectedQuestionSets.peer)}

      </main>
    );
  };

  const renderReviewPeriod = () => {
    if (!reviewAdmin) {
      return (
        <main className="admin-stack">
          <section className="card">
            <p className="muted-copy">Loading review period management...</p>
          </section>
        </main>
      );
    }

    if (!selectedReviewPeriodManagement || !selectedReviewPeriodManagementSummary) {
      return (
        <main className="admin-stack">
          <section className="card admin-section-card review-period-card">
            <div className="section-heading review-period-heading">
              <div>
                <p className="section-label">Review period management</p>
                <h3>No review periods configured</h3>
                <p className="muted-copy">Add a review period to resume review-period scheduling and question-set management.</p>
              </div>
            </div>
            <div className="action-row review-period-actions">
              <div className="review-period-primary-actions">
                <button type="button" disabled={isSavingReviewAdmin} onClick={startAddingReviewPeriod}>
                  Add period
                </button>
              </div>
            </div>
            {renderReviewPeriodEditorForm()}
          </section>
          {renderArchiveContent()}
        </main>
      );
    }

    const reviewPeriodButtonProps = getReviewPeriodStatusButtonProps(selectedReviewPeriodManagement);

    return (
      <main className="admin-stack">
        <section className="card admin-section-card review-period-card">
          <div className="section-heading review-period-heading">
            <div>
              <p className="section-label">Review period management</p>
              <h3>{selectedReviewPeriodManagement.label}</h3>
            </div>
            <div className="review-period-picker-row">
              <button
                type="button"
                className={reviewPeriodButtonProps.className || undefined}
                disabled={reviewPeriodButtonProps.disabled}
                onClick={reviewPeriodButtonProps.onClick}
              >
                {reviewPeriodButtonProps.label}
              </button>
              <label className="inline-field review-period-picker">
                <span className="sr-only">Review period</span>
                <select
                  value={selectedReviewPeriodManagement.id}
                  onChange={(event) => setSelectedReviewPeriodManagementId(event.target.value)}
                >
                  {reviewAdmin.reviewPeriods.map((reviewPeriod) => (
                    <option key={reviewPeriod.id} value={reviewPeriod.id}>
                      {reviewPeriod.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Window</dt>
              <dd>
                {selectedReviewPeriodManagement.startDate} → {selectedReviewPeriodManagement.dueDate}
              </dd>
            </div>
            <div>
              <dt>Assessment due</dt>
              <dd>{selectedReviewPeriodManagement.assessmentDueDate}</dd>
            </div>
            <div>
              <dt>Review due</dt>
              <dd>{selectedReviewPeriodManagement.reviewDueDate}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{selectedReviewPeriodManagement.status}</dd>
            </div>
            <div>
              <dt>Question sets</dt>
              <dd>{selectedReviewPeriodManagementSummary.questionSetCount}</dd>
            </div>
            <div>
              <dt>Assignments</dt>
              <dd>{selectedReviewPeriodManagementSummary.assignmentCount}</dd>
            </div>
          </dl>
          {selectedReviewPeriodManagement.status === 'archived' ? (
            <p className="toolbar-note">
              Archived review periods stay visible here until an admin restores them.
            </p>
          ) : selectedReviewPeriodManagement.status === 'inactive' ? (
            <p className="toolbar-note">Inactive review periods stay editable until an admin makes one active.</p>
          ) : null}
          <div className="action-row review-period-actions">
            <div className="review-period-primary-actions">
              <button type="button" disabled={isSavingReviewAdmin} onClick={startAddingReviewPeriod}>
                Add period
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={selectedReviewPeriodManagement.status === 'archived'}
                onClick={() => startEditingReviewPeriod(selectedReviewPeriodManagement)}
              >
                Edit period
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={isSavingReviewAdmin}
                onClick={() => void handleDeleteReviewPeriod(selectedReviewPeriodManagement)}
              >
                Remove period
              </button>
            </div>
          </div>
          {renderReviewPeriodEditorForm()}
        </section>
        {renderArchiveContent()}
      </main>
    );
  };

  const renderQuestionSetDialog = () =>
    pathname === '/questions' && questionSetDraft && selectedReviewPeriod ? (
      <div className="modal-backdrop" role="presentation" onClick={() => void closeQuestionSetDialog()}>
        <section
          aria-modal="true"
          className="card modal-card question-set-dialog"
          role="dialog"
          aria-labelledby="question-set-dialog-title"
          onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <p className="section-label">
                  {questionSetDraft.id ? 'Edit question set' : 'Create question set'} • {questionSetDraft.target}
                </p>
                <h3 id="question-set-dialog-title">
                  {questionSetDraft.title || `New ${questionSetDraft.target} question set`}
                </h3>
                <p className="muted-copy">{selectedReviewPeriod.label}</p>
              </div>
              <div className="dialog-header-actions">
                {selectedReviewPeriod.status === 'archived' ? <span className="pill">Read only</span> : null}
                <button type="button" className="secondary-button" onClick={() => void closeQuestionSetDialog()}>
                  Close
                </button>
              </div>
            </div>

          {selectedReviewPeriod.status === 'archived' ? (
            <p className="toolbar-note">Archived review periods keep question sets visible, but editing stays disabled.</p>
          ) : null}

          <form className="stack-form" onSubmit={saveQuestionDraft}>
            <div className="question-set-dialog-fields">
              <label>
                Title
                <input
                  value={questionSetDraft.title}
                  disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
                  onChange={(event) => updateQuestionSetDraftField('title', event.target.value)}
                />
              </label>
              {questionSetStatusEnabled ? (
                <label>
                  Status
                  <select
                    value={questionSetDraft.status}
                    disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
                    onChange={(event) => updateQuestionSetDraftField('status', event.target.value as QuestionSetDraft['status'])}
                  >
                    <option value="draft">draft</option>
                    <option value="active">active</option>
                  </select>
                </label>
              ) : null}
              <label>
                Header markdown
                <textarea
                  rows={3}
                  value={questionSetDraft.headerMarkdown}
                  disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
                  onChange={(event) => updateQuestionSetDraftField('headerMarkdown', event.target.value)}
                />
              </label>
              <label>
                Footer markdown
                <textarea
                  rows={3}
                  value={questionSetDraft.footerMarkdown}
                  disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
                  onChange={(event) => updateQuestionSetDraftField('footerMarkdown', event.target.value)}
                />
              </label>
            </div>

            <section className="subcard question-set-dialog-table">
              <div className="question-set-dialog-table-header" aria-hidden="true">
                <span>Order</span>
                <span>Question</span>
                <span>Details</span>
              </div>
              <div className="question-set-dialog-table-body">
                {questionSetDraft.questions.map((question) => (
                  <div className="question-set-dialog-row" key={question.id}>
                    <div
                      className="question-set-dialog-row-button"
                      role="button"
                      tabIndex={0}
                      aria-label={`Edit question ${question.order}`}
                      onClick={() => setEditingQuestionDraftId(question.id)}
                      onKeyDown={(event) => handleDialogShortcut(event, () => setEditingQuestionDraftId(question.id))}
                    >
                      <span className="question-set-dialog-order">#{question.order}</span>
                      <MarkdownContent
                        markdown={question.prompt || 'No prompt yet.'}
                        className="markdown-content question-prompt-markdown question-set-dialog-prompt"
                      />
                      <span className="question-set-dialog-detail">
                        {question.category ? `${question.category} • ` : ''}
                        {question.type}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={
                        selectedReviewPeriod.status === 'archived' ||
                        isSavingReviewAdmin ||
                        questionSetDraft.questions.length === 1
                      }
                      onClick={() => removeQuestionDraft(question.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {(
              ((selectedReviewPeriod.status === 'inactive' || selectedReviewPeriod.status === 'archived') &&
                questionSetDraft.id &&
                activeReviewAdminPeriod &&
                activeReviewAdminPeriod.id !== selectedReviewPeriod.id) ||
              selectedReviewPeriod.status !== 'archived'
            ) ? (
              <div className="dialog-footer">
                <div className="dialog-footer-start">
                  {selectedReviewPeriod.status === 'archived' ? null : (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={isSavingReviewAdmin}
                      onClick={addQuestionDraft}
                    >
                      Add question
                    </button>
                  )}
                  {selectedReviewPeriod.status === 'archived' || !questionSetDraft.id ? null : (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={isSavingReviewAdmin}
                      onClick={resetQuestionSetDraft}
                    >
                      Delete set
                    </button>
                  )}
                  {(selectedReviewPeriod.status === 'inactive' || selectedReviewPeriod.status === 'archived') &&
                  questionSetDraft.id &&
                  activeReviewAdminPeriod &&
                  activeReviewAdminPeriod.id !== selectedReviewPeriod.id ? (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={isSavingReviewAdmin}
                      onClick={() => void handleCopyQuestionSetToCurrentReviewPeriod(questionSetDraft)}
                    >
                      {`Copy to ${activeReviewAdminPeriod.label}`}
                    </button>
                  ) : null}
                </div>
                {selectedReviewPeriod.status === 'archived' ? null : (
                  <div className="dialog-footer-end">
                    <button type="submit" disabled={isSavingReviewAdmin}>
                      Save question set
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void closeQuestionSetDialog()}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </form>
        </section>
      </div>
    ) : null;

  const renderQuestionEditorDialog = () =>
    pathname === '/questions' && questionSetDraft && editingQuestionDraft ? (
      <div className="modal-backdrop" role="presentation" onClick={() => void closeQuestionEditorDialog()}>
        <section
          aria-modal="true"
          className="card modal-card question-edit-dialog"
          role="dialog"
          aria-labelledby="question-edit-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="section-heading">
            <div>
              <p className="section-label">Question editor</p>
              <h3 id="question-edit-dialog-title">Question {editingQuestionDraft.order}</h3>
              <p className="muted-copy">
                {questionSetDraft.target === 'self' ? 'Self assessment' : 'Peer assessment'} • {questionSetDraft.title}
              </p>
            </div>
            <div className="dialog-header-actions">
              <button type="button" className="secondary-button" onClick={() => void closeQuestionEditorDialog()}>
                Close
              </button>
            </div>
          </div>

          <form className="stack-form" onSubmit={saveEditingQuestionDraft}>
            <label className="question-edit-field question-category-field">
              <span className="question-edit-field-label">Category</span>
              <select
                aria-label="Question category"
                value={editingQuestionDraft.category}
                disabled={selectedReviewPeriod?.status === 'archived' || isSavingReviewAdmin}
                onChange={(event) => handleQuestionCategoryChange(event.target.value)}
              >
                <option value="">No category</option>
                {questionCategoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
                <option value={newQuestionCategoryOptionValue}>New category…</option>
              </select>
            </label>
            <label className="question-edit-field question-prompt-field">
              <span className="question-edit-field-label">Question</span>
              <textarea
                rows={10}
                value={editingQuestionDraft.prompt}
                disabled={selectedReviewPeriod?.status === 'archived' || isSavingReviewAdmin}
                onChange={(event) => updateQuestionDraftField('prompt', event.target.value)}
              />
            </label>
            <label className="question-edit-field question-response-type-field">
              <span className="question-edit-field-label">Response type</span>
              <div className="question-edit-response-group">
                <select
                  aria-label="Response type"
                  value={editingQuestionDraft.type}
                  disabled={selectedReviewPeriod?.status === 'archived' || isSavingReviewAdmin}
                  onChange={(event) => updateQuestionDraftField('type', event.target.value as QuestionSetQuestionDraft['type'])}
                >
                  <option value="subjective">subjective</option>
                  <option value="ranking">ranking</option>
                  <option value="narrative">narrative</option>
                </select>
                {renderQuestionTypePreview(editingQuestionDraft)}
              </div>
            </label>
            <div className="dialog-footer">
              <div className="dialog-footer-end">
                {selectedReviewPeriod?.status === 'archived' ? null : (
                  <button type="submit" disabled={isSavingReviewAdmin || !isQuestionEditorDirty}>
                    Save question
                  </button>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isSavingReviewAdmin}
                  onClick={() => void closeQuestionEditorDialog()}
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    ) : null;

  const renderNewQuestionCategoryDialog = () =>
    pathname === '/questions' && questionSetDraft && editingQuestionDraft && isNewQuestionCategoryDialogOpen ? (
      <div className="modal-backdrop" role="presentation" onClick={closeNewQuestionCategoryDialog}>
        <section
          aria-modal="true"
          className="card modal-card question-category-dialog"
          role="dialog"
          aria-labelledby="question-category-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="section-heading">
            <div>
              <p className="section-label">Category</p>
              <h3 id="question-category-dialog-title">New category</h3>
            </div>
            <button type="button" className="secondary-button" onClick={closeNewQuestionCategoryDialog}>
              Close
            </button>
          </div>
          <form className="stack-form" onSubmit={saveNewQuestionCategory}>
            <label>
              Category name
              <input
                aria-label="New category name"
                value={newQuestionCategoryDraft}
                onChange={(event) => {
                  setNewQuestionCategoryDraft(event.target.value);
                  if (newQuestionCategoryError) {
                    setNewQuestionCategoryError('');
                  }
                }}
              />
            </label>
            {newQuestionCategoryError ? <p className="form-error">{newQuestionCategoryError}</p> : null}
            <div className="dialog-footer">
              <div className="dialog-footer-end">
                <button type="submit">Save category</button>
                <button type="button" className="secondary-button" onClick={closeNewQuestionCategoryDialog}>
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    ) : null;

  const renderQuestionCategoriesDialog = () =>
    pathname === '/questions' && isQuestionCategoriesDialogOpen ? (
      <div className="modal-backdrop" role="presentation" onClick={closeQuestionCategoriesDialog}>
        <section
          aria-modal="true"
          className="card modal-card question-categories-dialog"
          role="dialog"
          aria-labelledby="question-categories-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="section-heading">
            <div>
              <p className="section-label">Questions</p>
              <h3 id="question-categories-dialog-title">Edit question categories</h3>
            </div>
            <button type="button" className="secondary-button" onClick={closeQuestionCategoriesDialog}>
              Close
            </button>
          </div>
          <form className="stack-form" onSubmit={saveQuestionCategoriesDialog}>
            <div className="question-categories-editor">
              {questionCategoriesDraft.length > 0 ? (
                questionCategoriesDraft.map((category, index) => (
                  <div className="question-categories-editor-row" key={`question-category-${index}`}>
                    <label className="sr-only" htmlFor={`question-category-${index}`}>
                      Question category {index + 1}
                    </label>
                    <input
                      id={`question-category-${index}`}
                      aria-label={`Question category ${index + 1}`}
                      value={category}
                      onChange={(event) => updateQuestionCategoryDraft(index, event.target.value)}
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => removeQuestionCategoryDraft(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <p className="muted-copy">No persistent categories yet. Add one below.</p>
              )}
            </div>
            {questionCategoriesDialogError ? <p className="form-error">{questionCategoriesDialogError}</p> : null}
            <div className="dialog-footer">
              <div className="dialog-footer-start">
                <button type="button" className="secondary-button" onClick={addQuestionCategoryDraft}>
                  Add category
                </button>
              </div>
              <div className="dialog-footer-end">
                <button type="submit" disabled={isSavingReviewAdmin}>
                  Save categories
                </button>
                <button type="button" className="secondary-button" onClick={closeQuestionCategoriesDialog}>
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    ) : null;

  const renderAssignments = () => {
    if (!reviewAdmin || !selectedReviewPeriod || !selectedReviewPeriodSummary) {
      return (
        <main className="content-grid">
          <section className="card">
            <p className="muted-copy">Loading assignment matrix...</p>
          </section>
        </main>
      );
    }

    return (
      <main className="admin-stack">
        <section className="card">
          <div className="section-heading">
            <div>
              <p className="section-label">Review period</p>
              <h3>{selectedReviewPeriod.label}</h3>
            </div>
            <label className="inline-field">
              Review period
              <select
                value={selectedReviewPeriod.id}
                onChange={(event) => setSelectedReviewPeriodId(event.target.value)}
              >
                {reviewAdmin.reviewPeriods.map((reviewPeriod) => (
                  <option key={reviewPeriod.id} value={reviewPeriod.id}>
                    {reviewPeriod.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Employees in matrix</dt>
              <dd>{assignmentRows.length}</dd>
            </div>
            <div>
              <dt>Saved assignments</dt>
              <dd>{selectedReviewPeriodSummary.assignmentCount}</dd>
            </div>
          </dl>
          <div className="action-row">
            <button type="button" className="secondary-button" disabled={isSavingReviewAdmin} onClick={() => void handleAssignmentExport('json')}>
              Export JSON
            </button>
            <button type="button" className="secondary-button" disabled={isSavingReviewAdmin} onClick={() => void handleAssignmentExport('csv')}>
              Export CSV
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
              onClick={() => void handleAssignmentImport('json')}
            >
              Import JSON
            </button>
          <button
            type="button"
            className="secondary-button"
            disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
            onClick={() => void handleAssignmentImport('csv')}
          >
            Import CSV
          </button>
        </div>
        <input
          ref={assignmentImportInputRef}
          type="file"
          accept=".json,.csv,application/json,text/csv,text/plain"
          style={{ display: 'none' }}
          onChange={(event) => void handleAssignmentImportFileChange(event)}
        />
      </section>

        <section className="card">
          <p className="section-label">Assignment matrix</p>
          <div className="assignment-table">
            <div className="assignment-header">
              <span>Employee</span>
              <span>Manager</span>
              <span>Assigned peer reviewer</span>
            </div>
            {assignmentRows.map((row) => (
              <div className="assignment-row" key={row.employeeId}>
                <div>
                  <strong>{row.employeeName}</strong>
                </div>
                <label>
                  <span className="sr-only">Manager for {row.employeeName}</span>
                  <select
                    disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
                    value={row.managerId ?? ''}
                    onChange={(event) =>
                      void handleAssignmentChange(
                        row.employeeId,
                        event.target.value || null,
                        row.assessorId,
                      )
                    }
                  >
                    <option value="">Not assigned</option>
                    {managerOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sr-only">Peer reviewer for {row.employeeName}</span>
                  <select
                    disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
                    value={row.assessorId ?? ''}
                    onChange={(event) =>
                      void handleAssignmentChange(
                        row.employeeId,
                        row.managerId,
                        event.target.value || null,
                      )
                    }
                  >
                    <option value="">Not assigned</option>
                    {activeEmployees
                      .filter((employee) => employee.id !== row.employeeId)
                      .map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.fullName}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  };

  const renderArchiveContent = () => {
    if (!reviewAdmin) {
      return (
        <section className="card">
          <p className="muted-copy">Loading archive controls...</p>
        </section>
      );
    }

    const activeReviewPeriods = reviewAdmin.reviewPeriods.filter((period) => period.status === 'active');
    const inactiveReviewPeriods = reviewAdmin.reviewPeriods.filter((period) => period.status === 'inactive');
    const archivedReviewPeriods = reviewAdmin.reviewPeriods.filter((period) => period.status === 'archived');

    return (
      <section className="card admin-section-card file-management-review-period-card">
        <div className="section-heading">
          <div>
            <p className="section-label">Review periods</p>
            <h3>Review period lifecycle</h3>
          </div>
        </div>
        <div className="archive-section">
          <div className="archive-section-heading">
            <div>
              <p className="section-label">Active review periods</p>
              <h4>Archive review periods</h4>
            </div>
          </div>
          <div className="archive-list">
            {activeReviewPeriods.length ? (
              activeReviewPeriods.map((reviewPeriod) => {
                const summary = getReviewPeriodSummary(reviewAdmin, reviewPeriod.id);
                return (
                  <article className="archive-row" key={reviewPeriod.id}>
                    <div>
                      <strong>{reviewPeriod.label}</strong>
                      <p className="muted-copy">
                        {reviewPeriod.startDate} → {reviewPeriod.dueDate} • assess by {reviewPeriod.assessmentDueDate} • review by{' '}
                        {reviewPeriod.reviewDueDate} • {summary.questionSetCount} question sets • {summary.assignmentCount}{' '}
                        assignments • {summary.assessmentCount} assessments
                      </p>
                    </div>
                    <button type="button" disabled={isSavingReviewAdmin} onClick={() => void handleArchiveToggle(reviewPeriod.id, true)}>
                      Archive
                    </button>
                  </article>
                );
              })
            ) : (
              <p className="muted-copy">No active review periods right now.</p>
            )}
          </div>
        </div>
        <div className="archive-section">
          <div className="archive-section-heading">
            <div>
              <p className="section-label">Inactive review periods</p>
              <h4>Manage inactive review periods</h4>
            </div>
          </div>
          <div className="archive-list">
            {inactiveReviewPeriods.length ? (
              inactiveReviewPeriods.map((reviewPeriod) => {
                const summary = getReviewPeriodSummary(reviewAdmin, reviewPeriod.id);
                return (
                  <article className="archive-row" key={reviewPeriod.id}>
                    <div>
                      <strong>{reviewPeriod.label}</strong>
                      <p className="muted-copy">
                        {reviewPeriod.startDate} → {reviewPeriod.dueDate} • assess by {reviewPeriod.assessmentDueDate} • review by{' '}
                        {reviewPeriod.reviewDueDate} • {summary.questionSetCount} question sets • {summary.assignmentCount}{' '}
                        assignments • {summary.assessmentCount} assessments
                      </p>
                    </div>
                    <button type="button" disabled={isSavingReviewAdmin} onClick={() => startEditingReviewPeriod(reviewPeriod)}>
                      Edit
                    </button>
                  </article>
                );
              })
            ) : (
              <p className="muted-copy">No inactive review periods right now.</p>
            )}
          </div>
        </div>
        <div className="archive-section">
          <div className="archive-section-heading">
            <div>
              <p className="section-label">Archived review periods</p>
              <h4>Restore archived review periods</h4>
            </div>
          </div>
          <div className="archive-list">
            {archivedReviewPeriods.length ? (
              archivedReviewPeriods.map((reviewPeriod) => {
                const summary = getReviewPeriodSummary(reviewAdmin, reviewPeriod.id);
                return (
                  <article className="archive-row" key={reviewPeriod.id}>
                    <div>
                      <strong>{reviewPeriod.label}</strong>
                      <p className="muted-copy">
                        Archived at {reviewPeriod.archivedAt ?? 'unknown'} by {getEmployeeName(reviewPeriod.archivedByEmployeeId)} •{' '}
                        {summary.archivedAssessmentCount} archived assessments • {summary.completedAssessmentCount} completed
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={isSavingReviewAdmin}
                      onClick={() => void handleArchiveToggle(reviewPeriod.id, false)}
                    >
                      Unarchive
                    </button>
                  </article>
                );
              })
            ) : (
              <p className="muted-copy">No archived review periods yet.</p>
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderLocalUserTransferCard = () => {
    if (!isAdmin) {
      return null;
    }

    return (
      <section className="card admin-section-card file-management-transfer-card">
        <div className="section-heading">
          <div>
            <p className="section-label">Employee import/export</p>
          </div>
        </div>
        <p className="muted-copy">
          Export or import employee accounts here, including manager, assessor, and reviewer assignments. The employee
          directory stays focused on editing people, roles, and passwords.
        </p>
        <div className="local-user-export-mode-grid" role="radiogroup" aria-label="User export mode">
          {localUserExportModeOptions.map((option) => (
            <label
              key={option.value}
              className={`local-user-export-mode-option${localUserExportMode === option.value ? ' local-user-export-mode-option-selected' : ''}`}
            >
              <input
                type="radio"
                name="local-user-export-mode"
                value={option.value}
                checked={localUserExportMode === option.value}
                onChange={(event) => setLocalUserExportMode(event.target.value as LocalUsersExportMode)}
              />
              <span className="local-user-export-mode-copy">
                <strong>{option.label}</strong>
                <span className="muted-copy">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="action-row">
          <button type="button" disabled={isSyncingLocalUsers} onClick={() => void handleLocalUserExport('json')}>
            {isSyncingLocalUsers ? 'Working…' : 'Export JSON'}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={isSyncingLocalUsers}
            onClick={() => void handleLocalUserExport('csv')}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={isSyncingLocalUsers}
            onClick={() => void handleLocalUserImport()}
          >
            Import users
          </button>
        </div>
        <input
          ref={localUserImportInputRef}
          type="file"
          accept=".json,.csv,application/json,text/csv,text/plain"
          style={{ display: 'none' }}
          onChange={(event) => void handleLocalUserImportFileChange(event)}
        />
      </section>
    );
  };

  const renderQuestionTransferCard = () => {
    if (!reviewAdmin || !selectedReviewPeriod || !selectedReviewPeriodSummary) {
        return (
          <section className="card admin-section-card file-management-transfer-card">
            <p className="section-label">Question set import/export</p>
            <p className="muted-copy">Loading review period transfer tools...</p>
          </section>
        );
    }

      return (
        <section className="card admin-section-card file-management-transfer-card">
          <div className="section-heading">
            <div>
              <p className="section-label">Question set import/export</p>
            </div>
            <label className="inline-field review-period-picker">
            <span className="sr-only">Review period</span>
            <select
              value={selectedReviewPeriod.id}
              onChange={(event) => {
                setSelectedReviewPeriodId(event.target.value);
                closeQuestionSetDialog();
              }}
            >
              {reviewAdmin.reviewPeriods.map((reviewPeriod) => (
                <option key={reviewPeriod.id} value={reviewPeriod.id}>
                  {reviewPeriod.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted-copy">
          Run question-set import and export actions for the selected review period here. Question editing stays on the
          Questions page.
        </p>
        <dl className="detail-grid compact-detail-grid">
          <div>
            <dt>Window</dt>
            <dd>
              {selectedReviewPeriod.startDate} → {selectedReviewPeriod.dueDate}
            </dd>
          </div>
          <div>
            <dt>Assessment due</dt>
            <dd>{selectedReviewPeriod.assessmentDueDate}</dd>
          </div>
          <div>
            <dt>Review due</dt>
            <dd>{selectedReviewPeriod.reviewDueDate}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{selectedReviewPeriod.status}</dd>
          </div>
          <div>
            <dt>Question sets</dt>
            <dd>{selectedReviewPeriodSummary.questionSetCount}</dd>
          </div>
          <div>
            <dt>Assignments</dt>
            <dd>{selectedReviewPeriodSummary.assignmentCount}</dd>
          </div>
        </dl>
        {selectedReviewPeriod.status === 'archived' ? (
          <p className="toolbar-note">Question-set imports stay disabled while this review period is archived.</p>
        ) : null}
        <div className="action-row">
          <button
            type="button"
            className="secondary-button"
            disabled={isSavingReviewAdmin}
            onClick={() => void handleQuestionSetExport('json')}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={isSavingReviewAdmin}
            onClick={() => void handleQuestionSetExport('csv')}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
            onClick={() => void handleQuestionSetImport('json')}
          >
            Import JSON
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
            onClick={() => void handleQuestionSetImport('csv')}
          >
            Import CSV
          </button>
        </div>
        <input
          ref={questionSetImportInputRef}
          type="file"
          accept=".json,.csv,application/json,text/csv,text/plain"
          style={{ display: 'none' }}
          onChange={(event) => void handleQuestionSetImportFileChange(event)}
        />
      </section>
    );
  };

  const renderDashboard = () => (
    <main className="admin-stack">
      <section className="card dashboard-summary-card">
        <div className="dashboard-summary-header">
          <h2>{currentSection.title.toUpperCase()}</h2>
          <p className="dashboard-audience">{currentSection.audience.join(' | ')}</p>
        </div>
        {authNotice ? <p className="temporary-password">{authNotice}</p> : null}
        {appError ? <p className="form-error">{appError}</p> : null}
        {workflowNotice ? <p className="muted-copy">{workflowNotice}</p> : null}
        <div className="dashboard-identity-grid" aria-label="Signed-in user summary">
          <div className="dashboard-identity-field">
            <span className="dashboard-identity-label">Role</span>
            <span className="dashboard-identity-value">{sessionUser?.role ?? '—'}</span>
          </div>
          <div className="dashboard-identity-field">
            <span className="dashboard-identity-label">Username</span>
            <span className="dashboard-identity-value">{sessionUser?.username ?? '—'}</span>
          </div>
          <div className="dashboard-identity-field">
            <span className="dashboard-identity-label">Email</span>
            <span className="dashboard-identity-value">{sessionUser?.email ?? '—'}</span>
          </div>
          <div className="dashboard-identity-field">
            <span className="dashboard-identity-label">Manager</span>
            <span className="dashboard-identity-value">{getEmployeeName(sessionUser?.managerId ?? null)}</span>
          </div>
          <div className="dashboard-identity-field">
            <span className="dashboard-identity-label">Assessors</span>
            <span className="dashboard-identity-value">
              {sessionUser ? renderAssessorList(sessionUser, { showLabels: false }) : '—'}
            </span>
          </div>
          <div className="dashboard-identity-field">
            <span className="dashboard-identity-label">Reviewers</span>
            <span className="dashboard-identity-value">
              {sessionUser ? renderReviewerList(sessionUser, { showLabels: false }) : '—'}
            </span>
          </div>
          <div className="dashboard-identity-field">
            <span className="dashboard-identity-label">Current cycle</span>
            <span className="dashboard-identity-value">{dashboardSnapshot?.dueLabel ?? '—'}</span>
          </div>
          <div className="dashboard-identity-field">
            <span className="dashboard-identity-label">Workflow summary</span>
            <span className="dashboard-identity-value">{dashboardSnapshot?.reviewSummary ?? '—'}</span>
          </div>
          {dashboardSnapshot?.adminSummary ? (
            <div className="dashboard-identity-field">
              <span className="dashboard-identity-label">Admin note</span>
              <span className="dashboard-identity-value">{dashboardSnapshot.adminSummary}</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card">
        <button
          type="button"
          className="section-toggle"
          onClick={() => setAreDashboardQueuesExpanded((currentState) => !currentState)}
        >
          <span>Assessment Queue</span>
          <span className="muted-copy">{areDashboardQueuesExpanded ? 'Collapse' : 'Expand'}</span>
        </button>
        {areDashboardQueuesExpanded ? (
          <div className="queue-stack dashboard-queue-stack">
            {dashboardSnapshot?.queues.map((queue) => (
              <article className="dashboard-queue-group" key={queue.id}>
                <div className="dashboard-queue-group-heading">
                  <strong>{queue.title}</strong>
                  <span className="muted-copy">{queue.items.length} {queue.items.length === 1 ? 'item' : 'items'}</span>
                </div>
                {queue.items.length ? (
                  <div
                    className="employee-roster-table-scroll review-queue-table-scroll"
                    role="region"
                    aria-label={`${queue.title} assessments`}
                  >
                    <div className="review-queue-table dashboard-queue-table" aria-label={`${queue.title} assessments`}>
                      <div className="review-queue-header">
                        <span>Name</span>
                        <span>Work</span>
                        <span>Responsibility</span>
                        <span>Due</span>
                        <span>Status</span>
                        <span>Action</span>
                      </div>
                      {queue.items.map((item) => (
                        <div className="review-queue-row-card" key={item.assessmentId}>
                          <button
                            type="button"
                            className={`review-queue-item dashboard-queue-item${item.assessmentId === selectedAssessmentId ? ' admin-list-item-active' : ''}`}
                            onClick={() => void handleDashboardWorkflowAction(item)}
                          >
                            <span className="employee-row-cell review-queue-primary">
                              <strong>{item.subjectName}</strong>
                              <span className="muted-copy review-queue-subcopy">{item.title}</span>
                            </span>
                            <span className="employee-row-cell">{item.workLabel}</span>
                            <span className="employee-row-cell">{item.responsibilityLabel}</span>
                            <span className="employee-row-cell">{item.dueDate}</span>
                            <span className="employee-row-cell review-queue-step-cell">
                              <span className="pill">{item.statusLabel}</span>
                            </span>
                            <span className="employee-row-cell">{item.actionLabel}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="muted-copy">{queue.emptyMessage}</p>
                )}
              </article>
            )) ?? <p className="muted-copy">Loading assessment queue...</p>}
          </div>
        ) : null}
      </section>

      {dashboardSnapshot?.sections.map((section) => (
        <section className="card" key={section.id}>
          <div className="section-heading">
            <div>
              <p className="section-label">{section.title}</p>
              <p className="muted-copy">{section.description}</p>
            </div>
          </div>
          <div className="queue-stack dashboard-queue-stack">
            {section.queues.map((queue) => (
              <article className="dashboard-queue-group" key={queue.id}>
                <div className="dashboard-queue-group-heading">
                  <strong>{queue.title}</strong>
                  <span className="muted-copy">{queue.items.length} {queue.items.length === 1 ? 'item' : 'items'}</span>
                </div>
                {queue.items.length ? (
                  <div className="employee-roster-table-scroll review-queue-table-scroll" role="region" aria-label={queue.title}>
                    <div className="review-queue-table dashboard-queue-table" aria-label={queue.title}>
                      <div className="review-queue-header">
                        <span>Name</span>
                        <span>Work</span>
                        <span>Responsibility</span>
                        <span>Due</span>
                        <span>Status</span>
                        <span>Action</span>
                      </div>
                        {queue.items.map((item) => (
                          <div className="review-queue-row-card" key={item.id}>
                            <button
                              type="button"
                              className={`review-queue-item${
                                selectedAssessmentSetDialog?.reviewPeriodId === item.reviewPeriodId &&
                                selectedAssessmentSetDialog.employeeId === item.employeeId
                                  ? ' admin-list-item-active'
                                  : ''
                              }`}
                              disabled={isSavingAssessmentWorkflow}
                              onClick={() => void handleDashboardWorkflowAction(item)}
                            >
                            <span className="employee-row-cell review-queue-primary">
                              <strong>{item.subjectName}</strong>
                              <span className="muted-copy review-queue-subcopy">{item.title}</span>
                            </span>
                            <span className="employee-row-cell">{item.workLabel}</span>
                            <span className="employee-row-cell">{item.responsibilityLabel}</span>
                            <span className="employee-row-cell">{item.dueDate}</span>
                            <span className="employee-row-cell review-queue-step-cell">
                              <span className="pill">{item.statusLabel}</span>
                            </span>
                            <span className="employee-row-cell">{item.actionLabel}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="muted-copy">{queue.emptyMessage}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );

  const renderAssessmentDialog = () =>
    selectedAssessmentEditor ? (
      <div className="modal-backdrop" role="presentation" onClick={closeAssessmentDialog}>
        <section
          aria-modal="true"
          className="card modal-card review-dialog-card"
          role="dialog"
          aria-labelledby="assessment-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
            <div className="section-heading">
              <div>
                <p className="section-label">{selectedAssessmentEditor.targetLabel} form</p>
                <h3 id="assessment-dialog-title">{selectedAssessmentEditor.title}</h3>
                <p className="muted-copy">{selectedAssessmentEditor.reviewPeriodLabel}</p>
              </div>
              <div className="dialog-header-actions">
                <span className="pill">{selectedAssessmentEditor.statusLabel}</span>
                <button type="button" className="secondary-button" onClick={closeAssessmentDialog}>
                  Close
                </button>
              </div>
            </div>
          <section className="assessment-editor-intro">
            <p className="review-dialog-copy">{selectedAssessmentEditor.detail}</p>
            <dl className="detail-grid compact-detail-grid assessment-editor-meta">
              <div>
                <dt>Employee</dt>
                <dd>{selectedAssessmentEditor.subjectName}</dd>
              </div>
              <div>
                <dt>Assessment type</dt>
                <dd>{selectedAssessmentEditor.targetLabel}</dd>
              </div>
              <div>
                <dt>Assessor</dt>
                <dd>{selectedAssessmentEditor.assessorName}</dd>
              </div>
              <div>
                <dt>Manager</dt>
                <dd>{selectedAssessmentEditor.managerName}</dd>
              </div>
              <div>
                <dt>Review period</dt>
                <dd>{selectedAssessmentEditor.reviewPeriodLabel}</dd>
              </div>
              <div>
                <dt>Assessment due date</dt>
                <dd>{selectedAssessmentEditor.dueDate}</dd>
              </div>
            </dl>
          </section>
          {selectedAssessmentEditor.headerMarkdown ? (
            <MarkdownContent markdown={selectedAssessmentEditor.headerMarkdown} className="markdown-content assessment-editor-copy" />
          ) : null}
          <div className="assessment-editor-sections">
            {groupAssessmentEditorQuestions(selectedAssessmentEditor.questions).map((group) => (
              <section className="assessment-editor-section" key={group.id}>
                {group.category ? (
                  <div className="assessment-editor-category">
                    <p className="section-label">Category</p>
                    <h4>{group.category}</h4>
                  </div>
                ) : null}
                <div className="assessment-editor-question-list">
                  {group.questions.map((question) => {
                    const currentResponse = assessmentResponsesDraft[question.questionId] ?? '';
                    const normalizedResponse = normalizeAssessmentResponseValue(question.type, currentResponse);

                    return (
                      <article className="assessment-editor-question" key={question.questionId}>
                        <div className="question-prompt-block">
                          <span className="question-order">#{question.order}</span>
                          <MarkdownContent markdown={question.prompt} className="markdown-content question-prompt-markdown" />
                        </div>
                        <div className="assessment-question-response">
                          {question.type === 'narrative' ? (
                            <textarea
                              rows={5}
                              disabled={selectedAssessmentEditor.isReadOnly || isSavingAssessmentWorkflow}
                              value={currentResponse}
                              onChange={(event) =>
                                setAssessmentResponsesDraft((currentDraft) => ({
                                  ...currentDraft,
                                  [question.questionId]: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            <fieldset
                              className="assessment-question-scale"
                              disabled={selectedAssessmentEditor.isReadOnly || isSavingAssessmentWorkflow}
                            >
                              <legend className="sr-only">{`Response for question ${question.order}`}</legend>
                              <div className="assessment-question-options">
                                {assessmentResponseOptions[question.type].map((option) => (
                                  <label
                                    className={`assessment-question-option${normalizedResponse === option.value ? ' assessment-question-option-selected' : ''}`}
                                    key={option.value}
                                  >
                                    <input
                                      type="radio"
                                      name={question.questionId}
                                      value={option.value}
                                      checked={normalizedResponse === option.value}
                                      onChange={(event) =>
                                        setAssessmentResponsesDraft((currentDraft) => ({
                                          ...currentDraft,
                                          [question.questionId]: event.target.value,
                                        }))
                                      }
                                    />
                                    <span className="assessment-question-option-label">{option.label}</span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {selectedAssessmentEditor.isAdminOverride ? (
            <section className="assessment-admin-controls">
              <label className="assessment-admin-notes">
                <span>Manager or admin notes</span>
                <textarea
                  rows={4}
                  disabled={isSavingAssessmentWorkflow}
                  value={assessmentManagerNotesDraft}
                  onChange={(event) => setAssessmentManagerNotesDraft(event.target.value)}
                />
              </label>
              <div className="assessment-admin-state-row">
                <label className="assessment-admin-state-control">
                  <span>Assessment status</span>
                  <select
                    disabled={isSavingAssessmentWorkflow}
                    value={assessmentAdminStateDraft}
                    onChange={(event) =>
                      setAssessmentAdminStateDraft(
                        event.target.value as Exclude<AssessmentReviewState, 'reviewed'>,
                      )
                    }
                  >
                    {adminAssessmentStateOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    isSavingAssessmentWorkflow
                    || (!isAssessmentAdminStateDirty && !isAssessmentDraftDirty && !isAssessmentManagerNotesDirty)
                  }
                  onClick={() => void handleUpdateAssessmentStatusAsAdmin()}
                >
                  Update status
                </button>
              </div>
            </section>
          ) : selectedAssessmentEditor.managerNotes ? (
            <div className="toolbar-note">
              <p>
                <strong>Review notes:</strong> {selectedAssessmentEditor.managerNotes}
              </p>
            </div>
          ) : null}
          {selectedAssessmentEditor.footerMarkdown ? (
            <MarkdownContent
              markdown={selectedAssessmentEditor.footerMarkdown}
              className="markdown-content muted-copy assessment-editor-copy"
            />
          ) : null}
          <div className="dialog-footer">
            <div className="dialog-footer-start">
              {selectedAssessmentEditor.canDelete ? (
                <button
                  type="button"
                  className="danger-button"
                  disabled={isSavingAssessmentWorkflow}
                  onClick={() => void handleDeleteAssessmentAsAdmin()}
                >
                  Delete assessment
                </button>
              ) : null}
            </div>
            <div className="dialog-footer-end">
              <button
                type="button"
                disabled={!selectedAssessmentEditor.canSave || isSavingAssessmentWorkflow}
                onClick={() => void handleSaveAssessmentForLater()}
              >
                Save for later
              </button>
              <button
                type="button"
                disabled={(!selectedAssessmentEditor.canSubmit || (!isAssessmentDraftDirty && !isAssessmentDraftComplete)) || isSavingAssessmentWorkflow}
                onClick={() => void handleSubmitAssessment()}
              >
                Submit
              </button>
              {selectedAssessmentEditor.canAccept ? (
                <button
                  type="button"
                  disabled={!isAssessmentDraftComplete || isSavingAssessmentWorkflow}
                  onClick={() => void handleAcceptAssessmentAsAdmin()}
                >
                  Accept
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    ) : null;

  const renderReviews = () => (
    <main className="admin-stack">
      <section className="card review-sidebar">
        <button
          type="button"
          className="section-toggle"
          onClick={() => setAreReviewQueuesExpanded((currentState) => !currentState)}
        >
          <span>Review Queue</span>
          <span className="muted-copy">
            {reviewQueues.length} {reviewQueues.length === 1 ? 'item' : 'items'} •{' '}
            {areReviewQueuesExpanded ? 'Collapse' : 'Expand'}
          </span>
        </button>
        <p className="muted-copy">Open an assessment to review responses, notes, and workflow actions.</p>

        {areReviewQueuesExpanded ? (
          reviewQueues.length ? (
            <div className="employee-roster-table-scroll review-queue-table-scroll" role="region" aria-label="Review queue">
              <div className="review-queue-table" aria-label="Review queue">
                <div className="review-queue-header">
                  <span>Name</span>
                  <span>Review type</span>
                  <span>Assessor</span>
                  <span>Due</span>
                  <span>Next step</span>
                </div>
                {reviewQueues.map((item) => (
                  <div className="review-queue-row-card" key={item.assessmentId}>
                    <button
                      type="button"
                      className={`review-queue-item${item.assessmentId === selectedReviewAssessmentId ? ' admin-list-item-active' : ''}`}
                      onClick={() => handleSelectReviewAssessment(item.assessmentId)}
                    >
                      <span className="employee-row-cell review-queue-primary">
                        <strong>{item.subjectName}</strong>
                        <span className="muted-copy review-queue-subcopy">{item.title}</span>
                      </span>
                      <span className="employee-row-cell">{item.targetLabel}</span>
                      <span className="employee-row-cell">{item.assessorLabel}</span>
                      <span className="employee-row-cell">{item.dueDate}</span>
                      <span className="employee-row-cell review-queue-step-cell">
                        <span className="pill">{item.nextStepLabel}</span>
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted-copy">No review items right now.</p>
          )
        ) : null}
      </section>
    </main>
  );

  const renderAssessments = () => (
    <main className="admin-stack">
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="section-label">Assessment List</p>
            <p className="muted-copy">
              {activeAssessmentReviewPeriod
                ? `${activeAssessmentReviewPeriod.label} • ${filteredAdminAssessmentRows.length} ${filteredAdminAssessmentRows.length === 1 ? 'assessment' : 'assessments'}`
                : 'No active review period right now.'}
            </p>
          </div>
          {activeAssessmentReviewPeriod ? (
            <div className="review-period-primary-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={isSavingReviewAdmin}
                onClick={() => void handleClearReadyAssessments(activeAssessmentReviewPeriod.id)}
              >
                Clear not started assessments
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={isSavingReviewAdmin}
                onClick={() => void handleSyncAssessments(activeAssessmentReviewPeriod.id)}
              >
                Sync assessments to assignments
              </button>
            </div>
          ) : null}
        </div>

        {activeAssessmentReviewPeriod ? (
          <dl className="detail-grid compact-detail-grid">
            <div>
              <dt>Review period</dt>
              <dd>{activeAssessmentReviewPeriod.label}</dd>
            </div>
            <div>
              <dt>Dates</dt>
              <dd>
                {activeAssessmentReviewPeriod.startDate} → {activeAssessmentReviewPeriod.dueDate}
              </dd>
            </div>
            <div>
              <dt>Assessment due</dt>
              <dd>{activeAssessmentReviewPeriod.assessmentDueDate}</dd>
            </div>
            <div>
              <dt>Review due</dt>
              <dd>{activeAssessmentReviewPeriod.reviewDueDate}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{activeAssessmentReviewPeriod.status}</dd>
            </div>
          </dl>
        ) : null}

        {activeAssessmentReviewPeriod ? (
          <div className="action-row">
            <label className="inline-field admin-list-search">
              <span>Search</span>
              <input
                type="search"
                value={assessmentSearchQuery}
                onChange={(event) => setAssessmentSearchQuery(event.target.value)}
                placeholder="Search assessments"
              />
            </label>
            <label className="inline-field">
              <span>Workflow stage</span>
              <select
                value={assessmentLifecycleFilter}
                onChange={(event) =>
                  setAssessmentLifecycleFilter(event.target.value as 'all' | AdminAssessmentRow['summaryBucket'])
                }
              >
                <option value="all">All stages</option>
                <option value="drafting">Not started / incomplete</option>
                <option value="submitted">Submitted</option>
                <option value="accepted">Accepted</option>
                <option value="ready-for-meeting">Ready for meeting</option>
                <option value="scheduled">Scheduled</option>
                <option value="concluded">Concluded</option>
              </select>
            </label>
            <label className="inline-field">
              <span>Assessment type</span>
              <select
                value={assessmentTargetFilter}
                onChange={(event) => setAssessmentTargetFilter(event.target.value as 'all' | AdminAssessmentRow['target'])}
              >
                <option value="all">All assessments</option>
                <option value="self">Self assessments</option>
                <option value="peer">Peer assessments</option>
              </select>
            </label>
          </div>
        ) : null}

        {activeAssessmentReviewPeriod ? (
          <div className="assessment-list-summary" aria-label="Assessment summary">
            <p className="muted-copy">
              Showing {overallAdminAssessmentSummary.total}{' '}
              {overallAdminAssessmentSummary.total === 1 ? 'assessment' : 'assessments'} •{' '}
              {overallAdminAssessmentSummary.drafting} not started / incomplete • {overallAdminAssessmentSummary.submitted} submitted •{' '}
              {overallAdminAssessmentSummary.accepted} accepted • {overallAdminAssessmentSummary.readyForMeeting} ready for meeting •{' '}
              {overallAdminAssessmentSummary.scheduled} scheduled • {overallAdminAssessmentSummary.concluded} concluded
            </p>
            {adminAssessmentSummary.map((summary) => (
              <p className="muted-copy" key={summary.target}>
                {summary.total} {summary.total === 1 ? `${summary.target}-assessment` : `${summary.target}-assessments`} •{' '}
                {summary.drafting} not started / incomplete • {summary.submitted} submitted • {summary.accepted} accepted •{' '}
                {summary.readyForMeeting} ready for meeting • {summary.scheduled} scheduled • {summary.concluded} concluded
              </p>
            ))}
          </div>
        ) : null}

        {activeAssessmentReviewPeriod ? (
          filteredAdminAssessmentRows.length ? (
            <div className="employee-roster-table-scroll" role="region" aria-label="Assessment List assessments">
              <div className="assessments-table" aria-label="Assessment List assessments">
                <div className="assessments-header">
                  <span>Name</span>
                  <span>Assessment type</span>
                  <span>Assessor</span>
                  <span>Assessment status</span>
                  <span>Workflow stage</span>
                  <span>Actions</span>
                </div>
                {filteredAdminAssessmentRows.map((item) => (
                  <div
                    className="assessment-row-card assessment-row-card-clickable"
                    key={item.assessmentId}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectAssessment(item.assessmentId)}
                    onKeyDown={(event) => handleAssessmentRowKeyDown(event, item.assessmentId)}
                  >
                    <div className="assessment-row">
                      <span className="employee-row-cell assessment-row-primary">
                        <strong>{item.subjectName}</strong>
                        <span className="muted-copy employee-row-subcopy">{item.title}</span>
                        <span className="muted-copy employee-row-subcopy">{item.detail}</span>
                      </span>
                      <span className="employee-row-cell">{item.targetLabel}</span>
                      <span className="employee-row-cell">{item.assessorLabel}</span>
                      <span className="employee-row-cell">
                        <span className="pill">{item.assessmentStatusLabel}</span>
                      </span>
                      <span className="employee-row-cell assessment-row-lifecycle">
                        <span className="pill">{item.lifecycleLabel}</span>
                        <span className="muted-copy employee-row-subcopy">{item.nextStepLabel}</span>
                      </span>
                      <span className="employee-row-cell assessment-row-actions">
                        {item.reviewActionLabel ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSelectReviewAssessment(item.assessmentId);
                            }}
                          >
                            {item.reviewActionLabel}
                          </button>
                        ) : null}
                        {item.workflowActionLabel ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openAssessmentSetWorkflowDialog(item.reviewPeriodId, item.employeeId);
                            }}
                          >
                            {item.workflowActionLabel}
                          </button>
                        ) : null}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : areAssessmentFiltersActive ? (
            <p className="muted-copy">No assessments match the current filters.</p>
          ) : (
            <p className="muted-copy">No assessments exist for the active review period yet.</p>
          )
        ) : (
          <p className="muted-copy">Create or activate a review period first to see assessments here.</p>
        )}
      </section>
    </main>
  );

  const renderReviewDialog = () =>
    selectedReviewPanel ? (
      <div className="modal-backdrop assessment-review-dialog-backdrop" role="presentation" onClick={closeReviewDialog}>
        <section
          aria-modal="true"
            className="card modal-card review-dialog-card assessment-review-dialog-card"
            role="dialog"
            aria-labelledby="review-dialog-title"
            onClick={(event) => event.stopPropagation()}
        >
            <div className="section-heading">
              <div>
                <p className="section-label">Assessment submission</p>
                <h3 id="review-dialog-title">{selectedReviewPanel.title}</h3>
              </div>
              <div className="dialog-header-actions">
                <span className="pill">{selectedReviewPanel.reviewStatusLabel}</span>
                <button type="button" className="secondary-button" onClick={closeReviewDialog}>
                  Close
                </button>
              </div>
            </div>

          <section className="review-dialog-section">
            <p className="review-dialog-copy">{selectedReviewPanel.detail}</p>
            <dl className="detail-grid compact-detail-grid">
              <div>
                <dt>Subject</dt>
                <dd>{selectedReviewPanel.subjectName}</dd>
              </div>
              <div>
                <dt>Assessment type</dt>
                <dd>{selectedReviewPanel.targetLabel}</dd>
              </div>
              <div>
                <dt>Assessor</dt>
                <dd>{selectedReviewPanel.assessorName}</dd>
              </div>
              <div>
                <dt>Manager</dt>
                <dd>{selectedReviewPanel.managerName}</dd>
              </div>
              <div>
                <dt>Cycle</dt>
                <dd>{selectedReviewPanel.reviewPeriodLabel}</dd>
              </div>
              <div>
                <dt>Meeting due date</dt>
                <dd>{selectedReviewPanel.dueDate}</dd>
              </div>
              <div>
                <dt>Assessment status</dt>
                <dd>{selectedReviewPanel.assessmentStatusLabel}</dd>
              </div>
              <div>
                <dt>Workflow status</dt>
                <dd>{selectedReviewPanel.reviewStatusLabel}</dd>
              </div>
            </dl>
          </section>

          <section className="review-dialog-section">
            <p className="section-label">Responses</p>
            <div className="review-response-table">
              <div className="review-response-header">
                <span>Question</span>
                <span>Response</span>
                <span>Category</span>
              </div>
              {selectedReviewPanel.questions.map((question) => (
                <div className="review-response-row" key={question.questionId}>
                  <div className="review-response-question">
                    <span className="question-order">#{question.order}</span>
                    <MarkdownContent markdown={question.prompt} className="markdown-content question-prompt-markdown" />
                  </div>
                  <div className="review-response-answer">
                    {question.response
                      ? question.type === 'narrative'
                        ? question.response
                        : formatSubjectiveResponse(question.response)
                      : 'No response provided yet.'}
                  </div>
                  <div className="review-response-meta">
                    <span>{question.category ?? 'Uncategorized'}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="review-dialog-section">
            <p className="section-label">Manager notes</p>
            <div className="review-notes-form">
              <label className="stack-form">
                <textarea
                  aria-label="Manager notes"
                  rows={5}
                  readOnly={selectedReviewPanel.isArchived || (!selectedReviewPanel.canAccept && !selectedReviewPanel.canRejectToDraft)}
                  value={reviewNotesDraft}
                  onChange={(event) => setReviewNotesDraft(event.target.value)}
                />
              </label>
              <div className="dialog-footer">
                <div className="dialog-footer-end review-notes-actions">
                  <button
                    type="button"
                    disabled={!selectedReviewPanel.canAccept || selectedReviewPanel.isArchived || isSavingAssessmentWorkflow}
                    onClick={() => void handleAcceptReview()}
                  >
                    Accept assessment
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!selectedReviewPanel.canRejectToDraft || selectedReviewPanel.isArchived || isSavingAssessmentWorkflow}
                    onClick={() => setIsReturnToIncompleteDialogOpen(true)}
                  >
                    Return to incomplete
                  </button>
                </div>
              </div>
            </div>
          </section>
        </section>
      </div>
    ) : null;

  const renderAssessmentSetDialog = () =>
    selectedAssessmentSetWorkflowPanel ? (
      <div className="modal-backdrop assessment-review-dialog-backdrop" role="presentation" onClick={closeAssessmentSetDialog}>
        <section
          aria-modal="true"
          className="card modal-card review-dialog-card assessment-review-dialog-card"
          role="dialog"
          aria-labelledby="assessment-set-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="section-heading">
            <div>
              <p className="section-label">
                {selectedAssessmentSetWorkflowPanel.dialogKind === 'ready-for-meeting'
                  ? 'Ready for meeting'
                  : selectedAssessmentSetWorkflowPanel.dialogKind === 'schedule-meeting'
                    ? 'Schedule review meeting'
                    : 'Conclude review'}
              </p>
              <h3 id="assessment-set-dialog-title">{selectedAssessmentSetWorkflowPanel.title}</h3>
            </div>
            <div className="dialog-header-actions">
              <span className="pill">{selectedAssessmentSetWorkflowPanel.statusLabel}</span>
              <button type="button" className="secondary-button" onClick={closeAssessmentSetDialog}>
                Close
              </button>
            </div>
          </div>

          <section className="review-dialog-section">
            <p className="review-dialog-copy">{selectedAssessmentSetWorkflowPanel.detail}</p>
            <dl className="detail-grid compact-detail-grid">
              <div>
                <dt>Subject</dt>
                <dd>{selectedAssessmentSetWorkflowPanel.subjectName}</dd>
              </div>
              <div>
                <dt>Cycle</dt>
                <dd>{selectedAssessmentSetWorkflowPanel.reviewPeriodLabel}</dd>
              </div>
              <div>
                <dt>Meeting due date</dt>
                <dd>{selectedAssessmentSetWorkflowPanel.dueDate}</dd>
              </div>
              <div>
                <dt>Workflow status</dt>
                <dd>{selectedAssessmentSetWorkflowPanel.statusLabel}</dd>
              </div>
            </dl>
          </section>

          <section className="review-dialog-section">
            <p className="section-label">Assessments in this set</p>
            <div className="workflow-reviewer-grid">
              {selectedAssessmentSetWorkflowPanel.assessments.map((assessment) => (
                <article className="subcard workflow-set-assessment-card" key={assessment.assessmentId}>
                  <div className="workflow-reviewer-card-header">
                    <div>
                      <h4>{assessment.targetLabel}</h4>
                      <p className="muted-copy">{assessment.assessorLabel}</p>
                    </div>
                    <span className="pill">{assessment.statusLabel}</span>
                  </div>
                  <p className="muted-copy">{assessment.title}</p>
                  {assessment.managerNotes ? (
                    <div className="workflow-reviewer-note">
                      <strong>Manager notes</strong>
                      <p>{assessment.managerNotes}</p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className="review-dialog-section">
            <p className="section-label">
              {selectedAssessmentSetWorkflowPanel.dialogKind === 'conclude-review'
                ? 'Reviewer conclusions'
                : 'Reviewer responsibilities'}
            </p>
            <div className="workflow-reviewer-grid">
              {selectedAssessmentSetWorkflowPanel.reviewerActions.map((action) => (
                <article className="subcard workflow-reviewer-card" key={action.role}>
                  <div className="workflow-reviewer-card-header">
                    <div>
                      <p className="section-label">{action.label}</p>
                      <h4>{action.assignedReviewerName}</h4>
                    </div>
                    <span className="pill">{action.statusLabel}</span>
                  </div>
                  <p className="muted-copy">{action.responsibilityLabel}</p>
                  {action.completedAt ? (
                    <p className="muted-copy">Last updated {formatLocalizedDateTime(action.completedAt)}</p>
                  ) : null}

                  {selectedAssessmentSetWorkflowPanel.dialogKind === 'conclude-review' ? (
                    <>
                      <label className="stack-form">
                        <span>{action.label} notes</span>
                        <textarea
                          aria-label={`${action.label} notes`}
                          rows={4}
                          readOnly={!action.canConclude && !action.canReopen}
                          value={reviewerNotesDraft[action.role]}
                          onChange={(event) =>
                            setReviewerNotesDraft((currentDraft) => ({
                              ...currentDraft,
                              [action.role]: event.target.value,
                            }))
                          }
                          placeholder={
                            action.assignedReviewerId
                              ? `Capture ${action.label.toLowerCase()} follow-up after the meeting.`
                              : 'No reviewer is assigned yet.'
                          }
                        />
                      </label>
                      {action.assignedReviewerId === null ? (
                        <p className="muted-copy">No reviewer is assigned yet.</p>
                      ) : !action.isCurrentUserResponsible ? (
                        <p className="muted-copy">
                          Assigned to {action.assignedReviewerName}. Only that reviewer or an admin can update this step.
                        </p>
                      ) : action.canConclude || action.canReopen ? (
                        <div className="dialog-footer">
                          <div className="dialog-footer-end">
                            {action.canReopen ? (
                              <button
                                type="button"
                                className="secondary-button"
                                disabled={isSavingAssessmentWorkflow}
                                onClick={() => void handleReviewerConclusion(action.role, false)}
                              >
                                Reopen {action.label} conclusion
                              </button>
                            ) : null}
                            {action.canConclude ? (
                              <button
                                type="button"
                                disabled={isSavingAssessmentWorkflow}
                                onClick={() => void handleReviewerConclusion(action.role, true)}
                              >
                                Record {action.label} conclusion
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <p className="muted-copy">This reviewer step is already up to date.</p>
                      )}
                    </>
                  ) : action.notes ? (
                    <div className="workflow-reviewer-note">
                      <strong>{action.label} notes</strong>
                      <p>{action.notes}</p>
                    </div>
                  ) : (
                    <p className="muted-copy">
                      {action.assignedReviewerId ? 'No reviewer notes recorded yet.' : 'No reviewer is assigned yet.'}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>

          {selectedAssessmentSetWorkflowPanel.dialogKind !== 'conclude-review' ? (
            <div className="dialog-footer">
              <div className="dialog-footer-end">
                {selectedAssessmentSetWorkflowPanel.dialogKind === 'ready-for-meeting' ? (
                  <button
                    type="button"
                    disabled={!selectedAssessmentSetWorkflowPanel.canMarkReady || isSavingAssessmentWorkflow}
                    onClick={() => void handleMarkAssessmentSetReady()}
                  >
                    Mark ready for meeting
                  </button>
                ) : null}
                {selectedAssessmentSetWorkflowPanel.dialogKind === 'schedule-meeting' ? (
                  <button
                    type="button"
                    disabled={!selectedAssessmentSetWorkflowPanel.canSchedule || isSavingAssessmentWorkflow}
                    onClick={() => void handleScheduleAssessmentSet()}
                  >
                    Mark meeting scheduled
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    ) : null;

  const renderReturnToIncompleteDialog = () =>
    selectedReviewPanel && isReturnToIncompleteDialogOpen ? (
      <div
        className="modal-backdrop assessment-review-dialog-backdrop"
        role="presentation"
        onClick={() => setIsReturnToIncompleteDialogOpen(false)}
      >
        <section
          aria-modal="true"
          className="card modal-card review-dialog-card assessment-review-dialog-card"
          role="dialog"
          aria-labelledby="return-to-incomplete-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="section-heading">
            <div>
              <p className="section-label">Return to incomplete</p>
              <h3 id="return-to-incomplete-dialog-title">{selectedReviewPanel.title}</h3>
            </div>
            <div className="dialog-header-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setIsReturnToIncompleteDialogOpen(false)}
              >
                Close
              </button>
            </div>
          </div>

          <section className="review-dialog-section">
            <p className="review-dialog-copy">
              Send this assessment back so the employee can revise the response set and submit it again.
            </p>
            <p className="muted-copy">
              {reviewNotesDraft.trim()
                ? 'Your manager notes will be saved with the return message.'
                : 'You can add optional manager notes in the submission dialog before sending it back.'}
            </p>
          </section>

          <div className="dialog-footer">
            <div className="dialog-footer-end">
              <button
                type="button"
                className="secondary-button"
                disabled={isSavingAssessmentWorkflow}
                onClick={() => setIsReturnToIncompleteDialogOpen(false)}
              >
                Cancel
              </button>
              <button type="button" disabled={isSavingAssessmentWorkflow} onClick={() => void handleRejectReview()}>
                Return to incomplete
              </button>
            </div>
          </div>
        </section>
      </div>
    ) : null;

  const renderBackupsContent = () => (
    <>
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="section-label">Automatic backups</p>
          </div>
          <div className="dialog-header-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={isLoadingBackupStatus || isSavingBackupSettings || isSyncingBackups || isLoadingStoredBackups}
              onClick={() => void openStoredBackupsDialog()}
            >
              Show backups
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={isLoadingBackupStatus || isSavingBackupSettings || isSyncingBackups}
              onClick={() => void handleBackupStatusRefresh()}
            >
              {isLoadingBackupStatus ? 'Refreshing…' : 'Refresh status'}
            </button>
          </div>
        </div>
        {isLoadingBackupStatus && !backupStatus ? (
          <p className="muted-copy">Loading backup status...</p>
        ) : backupStatus && backupSettingsDraft ? (
          <>
            <form className="stack-form" onSubmit={(event) => void handleBackupSettingsSave(event)}>
              <div className="form-columns">
                <label className="inline-field">
                  <span>Automatic backups</span>
                  <select
                    aria-label="Automatic backups enabled"
                    disabled={isLoadingBackupStatus || isSavingBackupSettings || isSyncingBackups}
                    value={backupSettingsDraft.automaticBackupsEnabled ? 'enabled' : 'disabled'}
                    onChange={(event) =>
                      setBackupSettingsDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              automaticBackupsEnabled: event.target.value === 'enabled',
                            }
                          : currentDraft,
                      )
                    }
                  >
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
                <label className="inline-field">
                  <span>Backup period</span>
                  <select
                    aria-label="Backup period"
                    disabled={isLoadingBackupStatus || isSavingBackupSettings || isSyncingBackups}
                    value={backupSettingsDraft.schedule}
                    onChange={(event) =>
                      setBackupSettingsDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              schedule: event.target.value as BackupSchedule,
                            }
                          : currentDraft,
                      )
                    }
                  >
                    {availableBackupSchedules.map((schedule) => (
                      <option key={schedule} value={schedule}>
                        {getBackupScheduleLabel(schedule)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inline-field">
                  <span>Retention</span>
                  <input
                    aria-label="Backup retention count"
                    disabled={isLoadingBackupStatus || isSavingBackupSettings || isSyncingBackups}
                    min="1"
                    step="1"
                    type="number"
                    value={backupSettingsDraft.retentionCount}
                    onChange={(event) =>
                      setBackupSettingsDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              retentionCount: event.target.value,
                            }
                          : currentDraft,
                      )
                    }
                  />
                </label>
              </div>
              <p className="muted-copy">
                Automatic backups are written to the dedicated Docker backup volume and keep the latest configured number
                of snapshots.
              </p>
              <div className="action-row">
                <button type="submit" disabled={isLoadingBackupStatus || isSavingBackupSettings || isSyncingBackups}>
                  {isSavingBackupSettings ? 'Saving…' : 'Save automatic backups'}
                </button>
              </div>
            </form>
            <dl className="detail-grid backup-status-grid">
              <div>
                <dt>Current status</dt>
                <dd>{backupStatus.automaticBackupsEnabled ? 'Enabled' : 'Disabled'}</dd>
              </div>
              <div>
                <dt>Backup period</dt>
                <dd>{getBackupScheduleLabel(backupStatus.schedule)}</dd>
              </div>
              <div>
                <dt>Retention</dt>
                <dd>Keep latest {backupStatus.retentionCount} backups</dd>
              </div>
              <div>
                <dt>Last backup</dt>
                <dd>{formatLocalizedDateTime(backupStatus.lastBackupAt)}</dd>
              </div>
              <div>
                <dt>Last restore</dt>
                <dd>{formatLocalizedDateTime(backupStatus.lastRestoreAt)}</dd>
              </div>
              <div>
                <dt>Formats</dt>
                <dd>{backupStatus.supportedFormats.join(', ')}</dd>
              </div>
              <div>
                <dt>Default user export mode</dt>
                <dd>{backupStatus.defaultUserExportMode}</dd>
              </div>
            </dl>
            <div className="toolbar-note">
              <p>
                <strong>Restore rule:</strong> Stored backup restores always use {backupStatus.replaceStrategy} semantics.
              </p>
              <p>
                Supported restore scopes: {backupStatus.supportedRestoreScopes.join(', ')}. Supported restore modes:{' '}
                {backupStatus.supportedRestoreModes.join(', ')}.
              </p>
              <p>Open Show backups to create, upload, download, restore, or delete stored snapshot files.</p>
            </div>
          </>
        ) : (
          <p className="muted-copy">Backup status is unavailable right now.</p>
        )}
        <input
          ref={backupImportInputRef}
          type="file"
          accept=".json,application/json,text/plain"
          style={{ display: 'none' }}
          onChange={(event) => void handleStoredBackupFileChange(event)}
        />
      </section>
    </>
  );

  const renderStoredBackupsDialog = () =>
    isStoredBackupsDialogOpen ? (
      <div className="modal-backdrop" role="presentation" onClick={closeStoredBackupsDialog}>
        <section
          aria-modal="true"
          className="card modal-card backup-list-dialog"
          role="dialog"
          aria-labelledby="backup-list-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="section-heading">
            <div>
              <p className="section-label">Stored backups</p>
              <h3 id="backup-list-dialog-title">Backup list</h3>
            </div>
            <div className="dialog-header-actions">
              <button type="button" className="secondary-button" onClick={closeStoredBackupsDialog}>
                Close
              </button>
            </div>
          </div>
          {isLoadingStoredBackups ? (
            <p className="muted-copy">Loading stored backups...</p>
          ) : storedBackups.length ? (
            <div className="archive-list">
              {storedBackups.map((file) => (
                <article className="archive-row backup-list-row" key={file.name}>
                  <div>
                    <strong>{file.name}</strong>
                    <p className="muted-copy">
                      {formatLocalizedDateTime(file.storedAt)} • {formatBackupSize(file.sizeBytes)}
                    </p>
                  </div>
                  <div className="backup-list-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={isSyncingBackups}
                      onClick={() => setBackupDownloadDialog({ fileName: file.name })}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={isSyncingBackups}
                      onClick={() => setBackupRestoreDialog({ file })}
                    >
                      Restore
                    </button>
                    <button type="button" disabled={isSyncingBackups} onClick={() => void handleStoredBackupDelete(file)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted-copy">No stored backups yet.</p>
          )}
          <div className="dialog-footer">
            <div className="dialog-footer-start">
              <button type="button" className="secondary-button" disabled={isSyncingBackups} onClick={handleStoredBackupUploadClick}>
                Upload backup
              </button>
              <button type="button" disabled={isSyncingBackups} onClick={() => void handleCreateStoredBackup()}>
                {isSyncingBackups ? 'Creating…' : 'Backup now'}
              </button>
            </div>
          </div>
        </section>
      </div>
    ) : null;

  const renderBackupDownloadDialog = () =>
    backupDownloadDialog ? (
      <div className="modal-backdrop" role="presentation" onClick={() => setBackupDownloadDialog(null)}>
        <section
          aria-modal="true"
          className="card modal-card backup-download-dialog"
          role="dialog"
          aria-labelledby="backup-download-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="section-heading">
            <div>
              <p className="section-label">Download backup</p>
              <h3 id="backup-download-dialog-title">{backupDownloadDialog.fileName}</h3>
            </div>
            <div className="dialog-header-actions">
              <button type="button" className="secondary-button" onClick={() => setBackupDownloadDialog(null)}>
                Close
              </button>
            </div>
          </div>
          <p className="muted-copy">
            Choose whether to download the stored file as-is or generate a fresh backup with rotated one-time passcodes.
          </p>
          <div className="local-user-export-mode-grid" role="radiogroup" aria-label="Backup user export mode">
            {availableBackupExportModes.map((option) => (
              <label
                key={option.value}
                className={`local-user-export-mode-option${backupExportMode === option.value ? ' local-user-export-mode-option-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="stored-backup-export-mode"
                  value={option.value}
                  checked={backupExportMode === option.value}
                  onChange={(event) => setBackupExportMode(event.target.value as LocalUsersExportMode)}
                />
                <span className="local-user-export-mode-copy">
                  <strong>{option.label}</strong>
                  <span className="muted-copy">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
          {backupExportMode === 'rotate-passcodes' ? (
            <div className="warning-banner">
              <strong>Warning</strong>
              <p>Rotate-passcodes backup downloads sign every user out, including the current admin session.</p>
            </div>
          ) : null}
          <div className="dialog-footer dialog-footer-split">
            <div className="dialog-footer-start">
              <button type="button" disabled={isSyncingBackups} onClick={() => void handleStoredBackupDownload()}>
                {isSyncingBackups ? 'Downloading…' : 'Download'}
              </button>
            </div>
            <div className="dialog-footer-end">
              <button type="button" className="secondary-button" onClick={() => setBackupDownloadDialog(null)}>
                Cancel
              </button>
            </div>
          </div>
        </section>
      </div>
    ) : null;

  const renderBackupRestoreDialog = () =>
    backupRestoreDialog ? (
      <div className="modal-backdrop" role="presentation" onClick={() => setBackupRestoreDialog(null)}>
        <section
          aria-modal="true"
          className="card modal-card backup-restore-dialog"
          role="dialog"
          aria-labelledby="backup-restore-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="section-heading">
            <div>
              <p className="section-label">Restore backup</p>
              <h3 id="backup-restore-dialog-title">{backupRestoreDialog.file.name}</h3>
            </div>
            <div className="dialog-header-actions">
              <button type="button" className="secondary-button" onClick={() => setBackupRestoreDialog(null)}>
                Close
              </button>
            </div>
          </div>
          <p className="muted-copy">
            Choose exactly which replace-mode restore to run for this stored backup. Nothing restores silently.
          </p>
          <p className="muted-copy">
            Stored {formatLocalizedDateTime(backupRestoreDialog.file.storedAt)} • {formatBackupSize(backupRestoreDialog.file.sizeBytes)}
          </p>
          <div className="warning-banner">
            <strong>Restore warning</strong>
            <p>Every restore action is destructive for its target. Review the selected file and the target button before continuing.</p>
          </div>
          <div className="backup-action-grid">
            {availableBackupRestoreActions.map((action) => (
              <button
                key={action.target}
                type="button"
                className="admin-list-item backup-action-card"
                disabled={isSyncingBackups}
                onClick={() => void handleStoredBackupRestore(action)}
              >
                <strong>{action.title}</strong>
                <span className="muted-copy">{action.description}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    ) : null;

  const renderBackups = () => <main className="admin-stack">{renderBackupsContent()}</main>;

  const renderFileManagement = () => (
    <main className="admin-stack">
      <div className="file-management-card-grid">
        {renderLocalUserTransferCard()}
        {renderQuestionTransferCard()}
      </div>
      {renderBackupsContent()}
    </main>
  );

  const renderWorkflow = () => (
    <main className="content-grid">
      <section className="card card-wide workflow-page-card">
        <div className="section-heading">
          <div>
            <p className="section-label">Workflow</p>
          </div>
          {canEditWorkflow ? (
            <button type="button" onClick={openWorkflowEditor}>
              Edit workflow
            </button>
          ) : null}
        </div>
        {canEditWorkflow ? <p className="muted-copy">Sidebar visibility: {workflowVisibility}</p> : null}
        <MarkdownContent markdown={workflowContent} className="markdown-content workflow-page-markdown workflow-management-preview" />
      </section>
    </main>
  );

  const renderEmployeeDialog = () => {
    if (pathname !== '/employees' || passwordDialogEmployeeId) {
      return null;
    }

    if (!selectedEmployee && !draftEmployee) {
      return null;
    }

    if (draftEmployee && editingEmployeeId) {
      const employeeRelationshipOptions = activeEmployees.filter((employee) => employee.id !== draftEmployee.id);
      const selectedManagerId = managerOptions.some((employee) => employee.id === draftEmployee.managerId)
        ? draftEmployee.managerId
        : '';
      const selectedAssessor1Id = employeeRelationshipOptions.some((employee) => employee.id === draftEmployee.assessor1Id)
        ? draftEmployee.assessor1Id
        : '';
      const selectedAssessor2Id = employeeRelationshipOptions.some((employee) => employee.id === draftEmployee.assessor2Id)
        ? draftEmployee.assessor2Id
        : '';
      const selectedReviewer1Id = employeeRelationshipOptions.some((employee) => employee.id === draftEmployee.reviewer1Id)
        ? draftEmployee.reviewer1Id
        : '';
      const selectedReviewer2Id = employeeRelationshipOptions.some((employee) => employee.id === draftEmployee.reviewer2Id)
        ? draftEmployee.reviewer2Id
        : '';

      return (
        <div className="modal-backdrop" role="presentation" onClick={closeEmployeeDialog}>
          <section
            aria-modal="true"
            className="card modal-card employee-dialog-card"
            role="dialog"
            aria-labelledby="employee-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <p className="section-label">{draftEmployee.id ? 'Edit employee' : 'Add employee'}</p>
                <h3 id="employee-dialog-title">{draftEmployee.fullName || 'Employee record'}</h3>
              </div>
              <button type="button" className="secondary-button" onClick={closeEmployeeDialog}>
                Close
              </button>
            </div>
            <form className="stack-form" onSubmit={saveEmployee}>
              <label>
                Username
                <input
                  value={draftEmployee.username}
                  onChange={(event) => setDraftEmployee({ ...draftEmployee, username: event.target.value })}
                />
              </label>
              <label>
                Full name
                <input
                  value={draftEmployee.fullName}
                  onChange={(event) => setDraftEmployee({ ...draftEmployee, fullName: event.target.value })}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={draftEmployee.email}
                  onChange={(event) => setDraftEmployee({ ...draftEmployee, email: event.target.value })}
                />
              </label>
              <label>
                Manager
                <select
                  value={selectedManagerId}
                  onChange={(event) => setDraftEmployee({ ...draftEmployee, managerId: event.target.value })}
                >
                  <option value="">Not assigned</option>
                  {managerOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assessor 1
                <select
                  value={selectedAssessor1Id}
                  onChange={(event) => setDraftEmployee({ ...draftEmployee, assessor1Id: event.target.value })}
                >
                  <option value="">Not assigned</option>
                  {employeeRelationshipOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assessor 2
                <select
                  value={selectedAssessor2Id}
                  onChange={(event) => setDraftEmployee({ ...draftEmployee, assessor2Id: event.target.value })}
                >
                  <option value="">Not assigned</option>
                  {employeeRelationshipOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reviewer 1
                <select
                  value={selectedReviewer1Id}
                  onChange={(event) => setDraftEmployee({ ...draftEmployee, reviewer1Id: event.target.value })}
                >
                  <option value="">Not assigned</option>
                  {employeeRelationshipOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reviewer 2
                <select
                  value={selectedReviewer2Id}
                  onChange={(event) => setDraftEmployee({ ...draftEmployee, reviewer2Id: event.target.value })}
                >
                  <option value="">Not assigned</option>
                  {employeeRelationshipOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted-copy">
                Reviewer 1 and reviewer 2 must be different people and cannot be the employee. Reviewers may also be the
                manager or an assessor.
              </p>
              <label>
                App role
                <select
                  disabled={!isAdmin}
                  value={draftEmployee.role}
                  onChange={(event) => setDraftEmployee({ ...draftEmployee, role: event.target.value as AppRole })}
                >
                  <option value="employee">employee</option>
                  <option value="manager">manager</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label>
                Status
                <select
                  value={draftEmployee.status}
                  onChange={(event) =>
                    setDraftEmployee({
                      ...draftEmployee,
                      status: event.target.value as EmployeeDraft['status'],
                    })
                  }
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </label>
              {!draftEmployee.id ? (
                <label>
                  Initial password (optional)
                  <input
                    type="password"
                    value={draftEmployee.initialPassword}
                    onChange={(event) => setDraftEmployee({ ...draftEmployee, initialPassword: event.target.value })}
                    placeholder="Leave blank to set or reset later"
                  />
                </label>
              ) : null}
              {formError ? <p className="form-error">{formError}</p> : null}
              <div className="dialog-footer">
                <div className="dialog-footer-start">
                  {isAdmin && draftEmployee.id ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void handleDeleteEmployee()}
                      disabled={isSavingEmployee || isDeletingEmployee}
                    >
                      {isDeletingEmployee ? 'Deleting…' : 'Delete Employee'}
                    </button>
                  ) : null}
                </div>
                <div className="dialog-footer-end">
                  <button type="submit" disabled={isSavingEmployee || isDeletingEmployee}>
                    {isSavingEmployee ? 'Saving…' : 'Save employee'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closeEmployeeDialog}
                    disabled={isSavingEmployee || isDeletingEmployee}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      );
    }

    const detailEmployee = selectedEmployeeDetail ?? selectedEmployee;

    return (
      <div className="modal-backdrop" role="presentation" onClick={closeEmployeeDialog}>
        <section
          aria-modal="true"
          className="card modal-card employee-dialog-card"
          role="dialog"
          aria-labelledby="employee-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
            <div className="section-heading">
              <div>
                <p className="section-label">Employee detail</p>
                <h3 id="employee-dialog-title">{detailEmployee?.fullName ?? 'Employee record'}</h3>
              </div>
              <div className="dialog-header-actions">
                <span className={`pill employee-status-pill employee-status-pill-${detailEmployee?.status ?? 'active'}`}>
                  {detailEmployee?.status ?? 'active'}
                </span>
                <button type="button" className="secondary-button" onClick={closeEmployeeDialog}>
                  Close
              </button>
            </div>
          </div>

          {detailEmployee ? (
            <>
              <dl className="detail-grid">
                <div>
                  <dt>Username</dt>
                  <dd>{detailEmployee.username}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{detailEmployee.email}</dd>
                </div>
                <div>
                  <dt>Manager</dt>
                  <dd>{getEmployeeName(detailEmployee.managerId)}</dd>
                </div>
                <div>
                  <dt>Assessors</dt>
                  <dd>{renderAssessorList(detailEmployee)}</dd>
                </div>
                <div>
                  <dt>Reviewers</dt>
                  <dd>{renderReviewerList(detailEmployee)}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{detailEmployee.role}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{detailEmployee.status}</dd>
                </div>
                <div>
                  <dt>Password configured</dt>
                  <dd>{selectedEmployeeDetail ? (selectedEmployeeDetail.auth.passwordConfigured ? 'Yes' : 'No') : 'Loading…'}</dd>
                </div>
                <div>
                  <dt>Password reset required</dt>
                  <dd>{selectedEmployeeDetail ? (selectedEmployeeDetail.auth.passwordResetRequired ? 'Yes' : 'No') : 'Loading…'}</dd>
                </div>
                <div>
                  <dt>Last password change</dt>
                  <dd>
                    {selectedEmployeeDetail
                      ? formatLocalizedDateTime(selectedEmployeeDetail.auth.lastPasswordChangeAt ?? null)
                      : 'Loading…'}
                  </dd>
                </div>
              </dl>
              <div className="dialog-footer">
                <div className="dialog-footer-start">
                  {canManageEmployees && canEditSelectedEmployee ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (detailEmployee) {
                          startEditingEmployee(detailEmployee);
                        }
                      }}
                    >
                      Edit
                    </button>
                  ) : null}
                  {isAdmin ? (
                    <button type="button" className="secondary-button" onClick={() => openPasswordDialog(detailEmployee.id)}>
                      Manage password
                    </button>
                  ) : null}
                  {isAdmin && detailEmployee.status === 'active' ? (
                    <button type="button" className="secondary-button" onClick={() => void markEmployeeInactive()}>
                      Make Inactive
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <p className="muted-copy">Loading employee details…</p>
          )}
        </section>
      </div>
    );
  };

  const renderProfileDialog = () =>
    sessionUser && isProfileDialogOpen && profileDraft ? (
      <div className="modal-backdrop" role="presentation" onClick={closeProfileDialog}>
        <section
          aria-modal="true"
          className="card modal-card"
          role="dialog"
          aria-labelledby="profile-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="section-heading">
            <div>
              <p className="section-label">Profile editor</p>
              <h3 id="profile-dialog-title">{sessionUser.username}</h3>
            </div>
            <button type="button" className="secondary-button" onClick={closeProfileDialog} disabled={isSavingProfile}>
              Close
            </button>
          </div>
          <form className="stack-form" onSubmit={handleSaveOwnProfile}>
            <label>
              Full name
              <input
                value={profileDraft.fullName}
                disabled={isSavingProfile}
                onChange={(event) => setProfileDraft({ ...profileDraft, fullName: event.target.value })}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={profileDraft.email}
                disabled={isSavingProfile}
                onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })}
              />
            </label>
            <section className="subcard profile-password-section">
              <p className="section-label">Change password</p>
              <p className="muted-copy">Leave the password fields blank to keep your current password.</p>
              <div className="profile-password-fields">
                <label>
                  Current password
                  <input
                    type="password"
                    value={profileDraft.currentPassword}
                    disabled={isSavingProfile}
                    onChange={(event) => setProfileDraft({ ...profileDraft, currentPassword: event.target.value })}
                  />
                </label>
                <label>
                  New password
                  <input
                    type="password"
                    value={profileDraft.newPassword}
                    disabled={isSavingProfile}
                    onChange={(event) => setProfileDraft({ ...profileDraft, newPassword: event.target.value })}
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    type="password"
                    value={profileDraft.confirmNewPassword}
                    disabled={isSavingProfile}
                    onChange={(event) => setProfileDraft({ ...profileDraft, confirmNewPassword: event.target.value })}
                  />
                </label>
              </div>
            </section>
            {profileError ? <p className="form-error">{profileError}</p> : null}
            <div className="dialog-footer">
              <div className="dialog-footer-end">
                <button type="submit" disabled={isSavingProfile}>
                  {isSavingProfile ? 'Saving…' : 'Save profile'}
                </button>
                <button type="button" className="secondary-button" onClick={closeProfileDialog} disabled={isSavingProfile}>
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    ) : null;

  const renderEmployees = () => {
    const renderEmployeeRosterRow = (employee: Employee) => {
      return (
        <div className="employee-row-card" key={employee.id}>
          <button type="button" className="employee-row-summary" onClick={() => openEmployeeDialog(employee.id)}>
            <span className="employee-row-cell employee-row-name">
              <strong>{employee.fullName}</strong>
              <span className="muted-copy employee-row-subcopy">{employee.username}</span>
            </span>
            <span className="employee-row-cell">{employee.role}</span>
            <span className="employee-row-cell">{employee.email}</span>
            <span className="employee-row-cell">{getEmployeeName(employee.managerId)}</span>
            <span className="employee-row-cell">{renderAssessorList(employee, { showLabels: false })}</span>
            <span className="employee-row-cell">{renderReviewerList(employee, { showLabels: false })}</span>
            <span className="employee-row-cell">
              <span className={`pill employee-status-pill employee-status-pill-${employee.status}`}>{employee.status}</span>
            </span>
          </button>
        </div>
      );
    };

    return (
      <main className="admin-stack">
        <section className="card">
          <div className="section-heading">
            <div>
              <p className="section-label">Employee directory</p>
              <p className="muted-copy">
                {activeEmployees.length} active • {inactiveEmployees.length} inactive
              </p>
            </div>
            {isAdmin ? (
              <button type="button" onClick={startAddingEmployee}>
                Add employee
              </button>
            ) : null}
          </div>

          <div className="action-row">
            <label className="inline-field employee-directory-search">
              <span>Search</span>
              <input
                type="search"
                value={employeeSearchQuery}
                onChange={(event) => setEmployeeSearchQuery(event.target.value)}
                placeholder="Search employees"
              />
            </label>
          </div>

          {isLoadingEmployees ? <p className="muted-copy">Loading employee roster...</p> : null}

          {directoryEmployees.length ? (
            <div className="employee-roster-table-scroll" role="region" aria-label="Employee directory">
              <div className="employee-roster-table" aria-label="Employee directory">
                <div className="employee-roster-header">
                  <span>Name</span>
                  <span>Role</span>
                  <span>Email</span>
                  <span>Manager</span>
                  <span>Assessors</span>
                  <span>Reviewers</span>
                  <span>Status</span>
                </div>
                {directoryEmployees.map(renderEmployeeRosterRow)}
              </div>
            </div>
          ) : (
            <p className="muted-copy">
              {employeeSearchQuery.trim() ? 'No employees match this search.' : 'No employees in the directory.'}
            </p>
          )}
        </section>

      </main>
    );
  };

  if (!sessionUser) {
    return (
      <>
        <style>{themeStyleOverrides}</style>
        <div className="login-shell" data-revu-theme={themePreference}>
          <section className="login-card">
            <a className="eyebrow eyebrow-link" href={revuRepositoryUrl} target="_blank" rel="noreferrer">
              Revu
            </a>
            <h1>{companyName ? `Sign into ${companyName} Revu` : 'Sign into Revu'}</h1>
            {authNotice ? <p className="temporary-password">{authNotice}</p> : null}

            <form className="stack-form" onSubmit={handleLogin}>
              <label>
                Username
                <input value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
              </label>
              {loginError ? <p className="form-error">{loginError}</p> : null}
              <button type="submit" disabled={authLoading || isSubmittingLogin}>
                {authLoading ? 'Checking session…' : isSubmittingLogin ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            {showSeededApiAccounts ? (
              <div className="demo-accounts">
                <p className="section-label">Seeded API accounts</p>
                <div className="demo-account-grid">
                  {demoAccounts.map((account) => (
                    <button
                      className="demo-account-card"
                      key={account.username}
                      type="button"
                      onClick={() => {
                        setLoginUsername(account.username);
                        setLoginPassword(account.password);
                        setLoginError('');
                      }}
                    >
                      <strong>{account.fullName}</strong>
                      <span>{account.role}</span>
                      <small>{account.username}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </>
    );
  }

  if (passwordResetRequired) {
    return (
      <>
        <style>{themeStyleOverrides}</style>
        <div className="login-shell" data-revu-theme={themePreference}>
          <section className="login-card">
            <p className="eyebrow">Password change required</p>
            <h1>Set a new password to continue</h1>
            <p className="login-copy">
              This account signed in with a generated one-time passcode. Choose a new password before opening the rest
              of the workspace.
            </p>
            <div className="session-card">
              <p className="section-label">Signed in as</p>
              <h2>{sessionUser.fullName}</h2>
              <p>
                {sessionUser.role} • {sessionUser.username}
              </p>
            </div>
            {authNotice ? <p className="temporary-password">{authNotice}</p> : null}
            <form className="stack-form" onSubmit={handleChangeOwnPassword}>
              <label>
                Current password or one-time passcode
                <input
                  type="password"
                  value={currentPasswordDraft}
                  onChange={(event) => setCurrentPasswordDraft(event.target.value)}
                />
              </label>
              <label>
                New password
                <input type="password" value={nextPasswordDraft} onChange={(event) => setNextPasswordDraft(event.target.value)} />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  value={confirmPasswordDraft}
                  onChange={(event) => setConfirmPasswordDraft(event.target.value)}
                />
              </label>
              {changePasswordError ? <p className="form-error">{changePasswordError}</p> : null}
              <div className="action-row">
                <button type="submit" disabled={isChangingOwnPassword}>
                  {isChangingOwnPassword ? 'Updating password…' : 'Change password'}
                </button>
                <button type="button" className="secondary-button" onClick={handleLogout}>
                  Sign out
                </button>
              </div>
            </form>
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{themeStyleOverrides}</style>
      <div
        className="app-shell"
        data-revu-theme={themePreference}
        data-sidebar-collapsed={isSidebarCollapsed ? 'true' : 'false'}
      >
        <aside className="sidebar" data-collapsed={isSidebarCollapsed ? 'true' : 'false'}>
          <div className="sidebar-header">
            <div className="brand-block">
              <a className="brand-title-link brand-row-link" href={defaultPath} onClick={(event) => navigate(event, defaultPath)}>
                <div className="brand-row">
                  <h1>REVU</h1>
                  {companyName ? <span className="brand-company">{companyName}</span> : null}
                </div>
              </a>
            </div>
            <button
              type="button"
              className="sidebar-toggle"
              aria-expanded={!isSidebarCollapsed}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={toggleSidebarCollapsed}
            >
              <span aria-hidden="true">{isSidebarCollapsed ? '›' : '‹'}</span>
            </button>
          </div>

          <div className="session-card sidebar-session-card">
            <p className="section-label">Signed in as</p>
            <h2>{sessionUser.fullName}</h2>
            <p className="sidebar-session-meta">
              {sessionUser.role} •{' '}
              <button type="button" className="sidebar-profile-link" onClick={openProfileDialog}>
                {sessionUser.username}
              </button>
            </p>
            <div className="sidebar-session-actions">
              {isRefreshAvailable ? (
                <button type="button" onClick={handleRefreshNow}>
                  New version. Refresh Now
                </button>
              ) : null}
              <button type="button" className="secondary-button" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </div>

          {lastResponseMessage ? (
            <div className="session-card sidebar-status-card" role="status" aria-live="polite">
              <p className="section-label">Last Response</p>
              <p>{lastResponseMessage}</p>
            </div>
          ) : null}

          <nav className="sidebar-nav" aria-label="Primary">
            {navGroups.map((group) => (
              <section className="nav-group" key={group}>
                <p className="nav-group-label">{group}</p>
                <div className="nav-links">
                  {navigationSections
                    .filter((section) => section.group === group)
                    .map((section) => (
                      <a
                        className={`nav-link${section.path === pathname ? ' nav-link-active' : ''}`}
                        href={section.path}
                        key={section.id}
                        onClick={(event) => navigate(event, section.path)}
                      >
                        <span>{section.title}</span>
                      </a>
                    ))}
                </div>
              </section>
            ))}
          </nav>

          <div className="sidebar-utilities">
            <div
              className="session-card utility-inline-card theme-card"
              role="button"
              tabIndex={0}
              aria-label={`Current theme ${getThemeLabel(themePreference)}. Click to switch to ${getThemeLabel(getNextThemePreference(themePreference))}.`}
              onClick={cycleTheme}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  cycleTheme();
                }
              }}
            >
              <p className="section-label">Theme</p>
              <span className="theme-card-value">
                {getThemeLabel(themePreference)}
              </span>
            </div>

            {buildRevision ? (
              <div className="revision-card">
                <p className="revision-label">Build</p>
                <p className="revision-sha" title={buildRevision}>{buildRevision.slice(0, 7)}</p>
              </div>
            ) : null}

          </div>
        </aside>

        <div className="content">
        {pathname === '/dashboard' ? null : (
          <header className="hero card">
            <div className="hero-copy">
              <h2>{currentSection.title}</h2>
              <p>{currentSection.summary}</p>
              {authNotice ? <p className="temporary-password">{authNotice}</p> : null}
              {appError ? <p className="form-error">{appError}</p> : null}
            </div>

            <div className="hero-aside">
              <p className="section-label">Audience</p>
              <div className="pill-row">
                {currentSection.audience.map((audience) => (
                  <span className="pill" key={audience}>
                    {audience}
                  </span>
                ))}
              </div>
            </div>
          </header>
        )}

        {pathname === '/dashboard'
          ? renderDashboard()
          : pathname === '/assessments'
              ? renderAssessments()
          : pathname === '/employees'
            ? renderEmployees()
            : pathname === '/questions'
              ? renderQuestions()
              : pathname === '/review-period'
                ? renderReviewPeriod()
              : pathname === '/file-management'
                ? renderFileManagement()
                : pathname === '/workflow'
                  ? renderWorkflow()
                  : pathname === '/archive'
                    ? renderReviewPeriod()
                    : pathname === '/backups'
                      ? renderBackups()
                      : renderPlaceholderSection()}

        {renderReviewDialog()}

        {renderReturnToIncompleteDialog()}

        {renderAssessmentSetDialog()}

        {renderAssessmentDialog()}

        {renderQuestionSetDialog()}

        {renderQuestionEditorDialog()}

        {renderQuestionCategoriesDialog()}

        {renderNewQuestionCategoryDialog()}

        {renderStoredBackupsDialog()}

        {renderBackupDownloadDialog()}

        {renderBackupRestoreDialog()}

        {renderEmployeeDialog()}

        {renderProfileDialog()}

        {isAdmin && passwordDialogEmployeeId ? (
          <div className="modal-backdrop" role="presentation" onClick={closePasswordDialog}>
            <section
              aria-modal="true"
              className="card modal-card"
              role="dialog"
              aria-labelledby="password-dialog-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="section-heading">
                <div>
                  <p className="section-label">Password management</p>
                  <h3 id="password-dialog-title">{passwordDialogEmployee?.fullName ?? 'Employee account'}</h3>
                </div>
                <button type="button" className="secondary-button" onClick={closePasswordDialog}>
                  Close
                </button>
              </div>

              {passwordDialogDetail ? (
                <>
                  <p>
                    {passwordDialogDetail.status === 'inactive'
                      ? 'This account is inactive.'
                      : passwordDialogDetail.auth.passwordConfigured
                        ? passwordDialogDetail.auth.passwordResetRequired
                          ? 'This account must use a one-time passcode and change it immediately after sign-in.'
                          : 'This account can sign in.'
                        : 'This account needs a password before first sign-in.'}
                  </p>
                  <p className="muted-copy">
                    Last updated: {formatLocalizedDateTime(passwordDialogDetail.auth.lastPasswordChangeAt)}
                  </p>
                  {passwordStatus ? <p className="temporary-password">{passwordStatus}</p> : null}
                  {temporaryPassword ? (
                    <p className="temporary-password">One-time passcode: {temporaryPassword}</p>
                  ) : null}
                  <label className="stack-form">
                    <span>Set password</span>
                    <input
                      type="password"
                      value={passwordDraft}
                      onChange={(event) => setPasswordDraft(event.target.value)}
                      placeholder="Enter a new password"
                    />
                  </label>
                  <div className="dialog-footer">
                    <div className="dialog-footer-end">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={handleResetPassword}
                        disabled={isUpdatingPassword}
                      >
                        Generate one-time passcode
                      </button>
                      <button type="button" onClick={saveKnownPassword} disabled={!passwordDraft.trim() || isUpdatingPassword}>
                        {isUpdatingPassword ? 'Updating…' : 'Set Password'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="muted-copy">Loading employee credentials…</p>
              )}
            </section>
          </div>
        ) : null}

        {canEditWorkflow && workflowDraft !== null && workflowVisibilityDraft !== null ? (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => {
              if (!isSavingWorkflowSettings) {
                void closeWorkflowEditor();
              }
            }}
          >
            <section
              aria-modal="true"
              className="card modal-card workflow-editor-dialog"
              role="dialog"
              aria-labelledby="workflow-editor-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="section-heading">
                <div>
                  <p className="section-label">Edit workflow</p>
                  <h3 id="workflow-editor-title" className="sr-only">
                    Edit workflow
                  </h3>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void closeWorkflowEditor()}
                  disabled={isSavingWorkflowSettings}
                >
                  Close
                </button>
              </div>
              <div className="workflow-editor-grid">
                <div className="workflow-editor-fields">
                  <label className="inline-field">
                    <span>Workflow visibility</span>
                    <select
                      aria-label="Workflow visibility"
                      value={workflowVisibilityDraft}
                      disabled={isSavingWorkflowSettings}
                      onChange={(event) => setWorkflowVisibilityDraft(event.target.value as WorkflowVisibility)}
                    >
                      <option value="all">all</option>
                      <option value="managers">managers</option>
                      <option value="admin only">admin only</option>
                    </select>
                  </label>
                  <label className="stack-form workflow-editor-markdown-field">
                    <span>Workflow markdown</span>
                    <textarea
                      ref={workflowTextareaRef}
                      aria-label="Workflow markdown"
                      rows={24}
                      value={workflowDraft}
                      disabled={isSavingWorkflowSettings}
                      onChange={(event) => setWorkflowDraft(event.target.value)}
                      onScroll={syncWorkflowPreviewScroll}
                    />
                  </label>
                </div>
                <section className="subcard workflow-editor-preview">
                  <p className="section-label">Preview</p>
                  <div className="workflow-editor-preview-body" ref={workflowPreviewBodyRef}>
                    <MarkdownContent markdown={workflowDraft} className="markdown-content workflow-page-markdown" />
                  </div>
                </section>
              </div>
              <div className="dialog-footer">
                <div className="dialog-footer-end">
                  <button type="button" onClick={() => void saveWorkflowContent()} disabled={isSavingWorkflowSettings}>
                    {isSavingWorkflowSettings ? 'Saving workflow…' : 'Save workflow'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void closeWorkflowEditor()}
                    disabled={isSavingWorkflowSettings}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
      </div>
    </>
  );
}

export default App;
