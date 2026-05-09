import type {
  AuthSession,
  BackupRestoreScope,
  BackupSnapshot,
  BackupStatusResponse,
  Employee,
  EmployeeAdmin,
  FoundationSnapshot,
  LocalUsersExportMode,
  QuestionSet,
  QuestionTarget,
  ReviewPeriod,
} from '@revu/contracts';
import { backupSnapshotSchema } from '@revu/contracts';
import { ChangeEvent, FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from 'react';

import {
  ApiClientError,
  changePassword,
  createEmployee,
  exportBackup,
  getEmployee,
  getBackupStatus,
  getFoundation,
  listQuestionCategories,
  listEmployees,
  login,
  logout,
  me,
  resetEmployeePassword,
  restoreBackup,
  setEmployeePassword,
  updateEmployee,
} from './api';
import { buildDashboardSnapshot } from './dashboard';
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
} from './navigation';
import {
  buildReviewQueues,
  createAssessmentWorkflowSnapshot,
  formatSubjectiveResponse,
  getAssessmentEditor,
  getReviewPanel,
} from './assessmentReview';
import {
  acceptReviewToApi,
  markReviewReviewedInApi,
  reassignAssessmentInApi,
  rejectReviewToApi,
  saveAssessmentDraftToApi,
  saveReviewNotesToApi,
  submitAssessmentToApi,
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
  questionCategorySuggestionsId,
} from './questionPresentation';
import {
  buildExportNotice,
  buildImportNotice,
  buildLocalUsersExportNotice,
  buildLocalUsersImportNotice,
  buildLocalUsersImportPayloadFromFile,
  exportAssignmentsFromApi,
  exportLocalUsersFromApi,
  exportQuestionSetsFromApi,
  importAssignmentsFromApi,
  importLocalUsersFromApi,
  importQuestionSetsFromApi,
  saveAssignmentToApi,
  saveQuestionSetToApi,
  serializeLocalUsersTransfer,
  triggerDownload,
  saveReviewPeriodToApi,
  toggleReviewPeriodArchiveInApi,
  type TransferFormat,
} from './reviewAdminApi';
import { getRuntimeCompanyName, getRuntimeRevision } from './runtimeConfig';
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
const buildRevision = getRuntimeRevision();
const sessionStorageKey = 'revu-session-token';
const themeStorageKey = 'revu-theme-preference';
const workflowStorageKey = 'revu-workflow-markdown';
const lastResponseTimeoutMs = 120000;

type EmployeeDraft = {
  id: string | null;
  username: string;
  fullName: string;
  email: string;
  role: AppRole;
  status: 'active' | 'inactive';
  managerId: string;
  assessorId: string;
  initialPassword: string;
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

function getStoredWorkflowMarkdown() {
  const storedWorkflow = window.localStorage.getItem(workflowStorageKey);
  return storedWorkflow ?? workflowMarkdown;
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
    description: 'Replace review periods and question sets from the uploaded backup.',
    warning:
      'Restore questions uses replace semantics. It replaces review periods and question sets only, and it will fail unless assignments and assessments are already cleared.',
  },
  {
    target: 'reviews',
    title: 'Restore reviews',
    description: 'Replace review periods, question sets, assignments, and assessments from the uploaded backup.',
    warning:
      'Restore reviews uses replace semantics. It overwrites current review periods, question sets, assignments, assessments, and review events with the uploaded backup.',
  },
];

function buildBackupFilename(exportedAt: string) {
  return `revu-backup-${exportedAt.replace(/[:.]/g, '-')}.json`;
}

function buildBackupExportConfirmation(mode: LocalUsersExportMode) {
  return mode === 'rotate-passcodes'
    ? 'Downloading a backup in rotate-passcodes mode will rotate every local password into a generated one-time passcode, sign everyone out, and include those one-time passcodes in the downloaded backup. Continue?'
    : 'Download a full JSON backup now? This snapshot can later be uploaded for a replace-mode restore.';
}

function readBackupFileSummary(raw: string): BackupSnapshot {
  try {
    return backupSnapshotSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error('Backup file must be a valid Revu JSON backup export.');
  }
}

function describeBackupSummary(backup: {
  users: { itemCount: number };
  reviewData: {
    reviewPeriods: unknown[];
    questionSets: unknown[];
    assignments: unknown[];
    assessments: unknown[];
  };
}) {
  return `${backup.users.itemCount} users • ${backup.reviewData.reviewPeriods.length} review periods • ${backup.reviewData.questionSets.length} question sets • ${backup.reviewData.assignments.length} assignments • ${backup.reviewData.assessments.length} assessments`;
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
    return `Restored questions from ${fileName} with replace semantics. Loaded ${counts.reviewPeriods} review periods and ${counts.questionSets} question sets.`;
  }

  if (target === 'reviews') {
    return `Restored reviews from ${fileName} with replace semantics. Loaded ${counts.reviewPeriods} review periods, ${counts.questionSets} question sets, ${counts.assignments} assignments, and ${counts.assessments} assessments.`;
  }

  return `Restored the full backup from ${fileName} with replace semantics. Loaded ${counts.users} users, ${counts.reviewPeriods} review periods, ${counts.questionSets} question sets, ${counts.assignments} assignments, and ${counts.assessments} assessments.`;
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
    assessorId: employee.assessorId ?? '',
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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployeeDetail, setSelectedEmployeeDetail] = useState<EmployeeAdmin | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [draftEmployee, setDraftEmployee] = useState<EmployeeDraft | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordDraft, setPasswordDraft] = useState('');
  const [loginUsername, setLoginUsername] = useState('ada.admin');
  const [loginPassword, setLoginPassword] = useState('AdminPass123!');
  const [loginError, setLoginError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState('');
  const [nextPasswordDraft, setNextPasswordDraft] = useState('');
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');
  const [formError, setFormError] = useState('');
  const [appError, setAppError] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [isLoadingBackupStatus, setIsLoadingBackupStatus] = useState(false);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [isChangingOwnPassword, setIsChangingOwnPassword] = useState(false);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [isSyncingLocalUsers, setIsSyncingLocalUsers] = useState(false);
  const [localUserExportMode, setLocalUserExportMode] = useState<LocalUsersExportMode>('rotate-passcodes');
  const [backupExportMode, setBackupExportMode] = useState<LocalUsersExportMode>('preserve-passwords');
  const [isSyncingBackups, setIsSyncingBackups] = useState(false);
  const [isReadingBackupFile, setIsReadingBackupFile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSavingReviewAdmin, setIsSavingReviewAdmin] = useState(false);
  const [isSavingAssessmentWorkflow, setIsSavingAssessmentWorkflow] = useState(false);
  const [reviewAdmin, setReviewAdmin] = useState<ReviewAdminSnapshot | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatusResponse | null>(null);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupFileSummary, setBackupFileSummary] = useState<BackupSnapshot | null>(null);
  const [selectedReviewPeriodId, setSelectedReviewPeriodId] = useState<string | null>(null);
  const [reviewPeriodDraft, setReviewPeriodDraft] = useState<ReviewPeriodDraft | null>(null);
  const [questionSetDraft, setQuestionSetDraft] = useState<QuestionSetDraft | null>(null);
  const [questionCategories, setQuestionCategories] = useState<string[]>([]);
  const [workflowContent, setWorkflowContent] = useState<string>(() => getStoredWorkflowMarkdown());
  const [workflowDraft, setWorkflowDraft] = useState<string | null>(null);
  const [adminNotice, setAdminNotice] = useState('');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [assessmentResponsesDraft, setAssessmentResponsesDraft] = useState<Record<string, string>>({});
  const [workflowNotice, setWorkflowNotice] = useState('');
  const [lastResponseSource, setLastResponseSource] = useState<'admin' | 'workflow' | null>(null);
  const [selectedReviewAssessmentId, setSelectedReviewAssessmentId] = useState<string | null>(null);
  const [reviewNotesDraft, setReviewNotesDraft] = useState('');
  const [reviewManagerDraft, setReviewManagerDraft] = useState('');
  const [reviewAssessorDraft, setReviewAssessorDraft] = useState('');
  const [areDashboardQueuesExpanded, setAreDashboardQueuesExpanded] = useState(true);
  const [areReviewQueuesExpanded, setAreReviewQueuesExpanded] = useState(true);
  const [archivePanelsExpanded, setArchivePanelsExpanded] = useState({
    active: true,
    archived: true,
  });
  const [passwordDialogEmployeeId, setPasswordDialogEmployeeId] = useState<string | null>(null);
  const localUserImportInputRef = useRef<HTMLInputElement | null>(null);
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const questionSetEditorRef = useRef<HTMLElement | null>(null);

  const cycleTheme = () => {
    setThemePreference((currentTheme) => getNextThemePreference(currentTheme));
  };

  const scrollQuestionSetEditorView = () => {
    window.setTimeout(() => {
      questionSetEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
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
    window.localStorage.setItem(workflowStorageKey, workflowContent);
  }, [workflowContent]);

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

  const sessionUser = session?.user ?? null;
  const passwordResetRequired = session?.passwordResetRequired ?? false;
  const currentSection = useMemo(() => getSection(pathname), [pathname]);
  const accessibleSections = useMemo(
    () => (sessionUser ? getSectionsForRole(sessionUser.role) : []),
    [sessionUser],
  );
  const navigationSections = useMemo(
    () => (sessionUser ? getNavigationSectionsForRole(sessionUser.role) : []),
    [sessionUser],
  );
  const hasEmployeeReadAccess = session?.permissions.includes('employees:read') ?? false;
  const canManageEmployees = sessionUser?.role === 'admin' || sessionUser?.role === 'manager';
  const isAdmin = sessionUser?.role === 'admin';
  const availableBackupExportModes = useMemo(() => {
    const supportedModes = new Set(backupStatus?.supportedUserExportModes ?? localUserExportModeOptions.map((option) => option.value));
    return localUserExportModeOptions.filter((option) => supportedModes.has(option.value));
  }, [backupStatus]);
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
    () =>
      [...employees].sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === 'active' ? -1 : 1;
        }

        return left.fullName.localeCompare(right.fullName);
      }),
    [employees],
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
  const reviewAssessmentIds = useMemo(
    () => reviewQueues.map((item) => item.assessmentId),
    [reviewQueues],
  );
  const selectedAssessmentEditor = useMemo(
    () =>
      assessmentWorkflow && selectedAssessmentId
        ? getAssessmentEditor(assessmentWorkflow, workflowEmployees, selectedAssessmentId)
        : null,
    [assessmentWorkflow, selectedAssessmentId, workflowEmployees],
  );
  const selectedReviewPanel = useMemo(
    () =>
      sessionUser && assessmentWorkflow && selectedReviewAssessmentId
        ? getReviewPanel(sessionUser, assessmentWorkflow, workflowEmployees, selectedReviewAssessmentId)
        : null,
    [assessmentWorkflow, selectedReviewAssessmentId, sessionUser, workflowEmployees],
  );
  const selectedReviewPeriod = useMemo(
    () => reviewAdmin?.reviewPeriods.find((period) => period.id === selectedReviewPeriodId) ?? null,
    [reviewAdmin, selectedReviewPeriodId],
  );
  const selectedReviewPeriodSummary = useMemo(
    () =>
      reviewAdmin && selectedReviewPeriod
        ? getReviewPeriodSummary(reviewAdmin, selectedReviewPeriod.id)
        : null,
    [reviewAdmin, selectedReviewPeriod],
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
      setReviewPeriodDraft(null);
      setQuestionSetDraft(null);
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
    }
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
      setBackupFile(null);
      setBackupFileSummary(null);
      setIsLoadingBackupStatus(false);
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
      return;
    }

    setSelectedReviewPeriodId((currentId) => getPreferredReviewPeriodId(reviewAdmin.reviewPeriods, currentId));
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
    if (selectedAssessmentId && !authoredAssessmentIds.includes(selectedAssessmentId)) {
      setSelectedAssessmentId(null);
    }
  }, [authoredAssessmentIds, selectedAssessmentId]);

  useEffect(() => {
    if (!selectedAssessmentEditor) {
      setAssessmentResponsesDraft({});
      return;
    }

    setAssessmentResponsesDraft(
      Object.fromEntries(selectedAssessmentEditor.questions.map((question) => [question.questionId, question.response] as const)),
    );
  }, [selectedAssessmentEditor]);

  useEffect(() => {
    if (selectedReviewAssessmentId && !reviewAssessmentIds.includes(selectedReviewAssessmentId)) {
      setSelectedReviewAssessmentId(null);
    }
  }, [reviewAssessmentIds, selectedReviewAssessmentId]);

  useEffect(() => {
    if (!selectedReviewPanel) {
      setReviewNotesDraft('');
      setReviewManagerDraft('');
      setReviewAssessorDraft('');
      return;
    }

    setReviewNotesDraft(selectedReviewPanel.managerNotes);
    setReviewManagerDraft(selectedReviewPanel.currentManagerId ?? '');
    setReviewAssessorDraft(selectedReviewPanel.currentAssessorId);
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

    return workflowEmployeesById.get(employeeId)?.fullName ?? 'Unknown employee';
  };

  const refreshFoundationSnapshot = async () => {
    if (!sessionToken) {
      throw new Error('Authentication required');
    }

    const snapshot = await getFoundation(sessionToken);
    setFoundation(snapshot);
    return snapshot;
  };

  const refreshEmployeeDirectory = async () => {
    if (!sessionToken || !hasEmployeeReadAccess) {
      return;
    }

    const response = await listEmployees(sessionToken);
    setEmployees(response.items);
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
  };

  const openWorkflowEditor = () => {
    setWorkflowDraft(workflowContent);
    setAppError('');
  };

  const closeWorkflowEditor = () => {
    setWorkflowDraft(null);
  };

  const saveWorkflowContent = () => {
    if (workflowDraft === null) {
      return;
    }

    setWorkflowContent(workflowDraft);
    setWorkflowDraft(null);
    setAdminNotice('Updated the workflow markdown.');
  };

  const openEmployeeDialog = (employeeId: string) => {
    resetEditingState();
    setSelectedEmployeeDetail(null);
    setSelectedEmployeeId(employeeId);
  };

  const openPasswordDialog = (employeeId: string) => {
    resetEditingState();
    setSelectedEmployeeDetail(null);
    setSelectedEmployeeId(employeeId);
    setPasswordDialogEmployeeId(employeeId);
  };

  const handleSelectReviewAssessment = (assessmentId: string) => {
    setSelectedReviewAssessmentId(assessmentId);
  };

  const clearSession = (options?: {
    authNotice?: string;
  }) => {
    window.sessionStorage.removeItem(sessionStorageKey);
    setSessionToken(null);
    setSession(null);
    setFoundation(null);
    setEmployees([]);
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
    setAppError('');
    setAdminNotice('');
    setQuestionCategories([]);
    setBackupStatus(null);
    setBackupFile(null);
    setBackupFileSummary(null);
    setIsLoadingBackupStatus(false);
    setIsSyncingBackups(false);
    setIsReadingBackupFile(false);
    setLoginPassword('');
    setPasswordDraft('');
    setPasswordStatus('');
    setTemporaryPassword(null);
    setIsSavingAssessmentWorkflow(false);
    setSelectedAssessmentId(null);
    setAssessmentResponsesDraft({});
    setSelectedReviewAssessmentId(null);
    setReviewNotesDraft('');
    setReviewManagerDraft('');
    setReviewAssessorDraft('');
    setWorkflowNotice('');
    setAreReviewQueuesExpanded(true);
    setArchivePanelsExpanded({
      active: true,
      archived: true,
    });
    setPasswordDialogEmployeeId(null);
  };

  const syncEmployeeRelationships = (employeeId: string, managerId: string | null, assessorId: string | null) => {
    setEmployees((currentEmployees) =>
      currentEmployees.map((employee) =>
        employee.id === employeeId
          ? {
              ...employee,
              managerId,
              assessorId,
            }
          : employee,
      ),
    );

    setSelectedEmployeeDetail((currentDetail) =>
      currentDetail && currentDetail.id === employeeId
        ? {
            ...currentDetail,
            managerId,
            assessorId,
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
              assessorId,
            },
          }
        : currentSession,
    );
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmittingLogin(true);

    try {
      const response = await login({
        username: loginUsername.trim().toLowerCase(),
        password: loginPassword,
      });

      window.sessionStorage.setItem(sessionStorageKey, response.session.token);
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

  const handleBackupDownload = async () => {
    if (!sessionToken || !sessionUser) {
      return;
    }

    const confirmed = window.confirm(buildBackupExportConfirmation(backupExportMode));
    if (!confirmed) {
      return;
    }

    setIsSyncingBackups(true);
    setAdminNotice('');
    setAppError('');

    try {
      const response = await exportBackup(sessionToken, backupExportMode);
      triggerDownload(buildBackupFilename(response.exportedAt), JSON.stringify(response, null, 2), 'application/json');
      setBackupStatus((currentStatus) =>
        currentStatus
          ? {
              ...currentStatus,
              lastBackupAt: response.exportedAt,
            }
          : currentStatus,
      );

      const notice =
        response.users.mode === 'rotate-passcodes'
          ? `Downloaded a backup with rotated one-time passcodes for ${response.users.itemCount} users. Everyone was signed out.`
          : `Downloaded a JSON backup with ${describeBackupSummary(response)}.`;

      if (response.users.mode === 'rotate-passcodes') {
        setLoginUsername(sessionUser.username);
        clearSession({
          authNotice: `${notice} Sign in again with your exported one-time passcode before continuing.`,
        });
        return;
      }

      setAdminNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSyncingBackups(false);
    }
  };

  const handleBackupUpload = () => {
    backupImportInputRef.current?.click();
  };

  const handleBackupFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setIsReadingBackupFile(true);
    setAdminNotice('');
    setAppError('');

    try {
      const summary = readBackupFileSummary(await file.text());
      setBackupFile(file);
      setBackupFileSummary(summary);
      setAdminNotice(`Loaded ${file.name}. Review the restore target carefully before continuing.`);
    } catch (error) {
      setBackupFile(null);
      setBackupFileSummary(null);
      setAppError(getErrorMessage(error));
    } finally {
      setIsReadingBackupFile(false);
    }
  };

  const handleBackupRestore = async (action: BackupRestoreAction) => {
    if (!sessionToken || !backupFile || !backupFileSummary) {
      return;
    }

    const confirmed = window.confirm(buildBackupRestoreConfirmation(action, backupFile.name));
    if (!confirmed) {
      return;
    }

    setIsSyncingBackups(true);
    setAdminNotice('');
    setAppError('');

    try {
      const response = await restoreBackup(sessionToken, {
        file: backupFile,
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

      const notice = buildBackupRestoreNotice(response.target, backupFile.name, response.counts);
      if (response.target === 'all' || response.target === 'users') {
        setLoginUsername(sessionUser?.username ?? '');
        clearSession({
          authNotice: `${notice} ${buildBackupSessionNotice(response.target, backupFileSummary.users.mode)}`,
        });
        return;
      }

      await refreshFoundationSnapshot();
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
      assessorId: '',
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

    setIsSavingEmployee(true);
    setFormError('');

    try {
      const commonPayload = {
        username: draftEmployee.username.trim().toLowerCase(),
        fullName: draftEmployee.fullName.trim(),
        email: draftEmployee.email.trim().toLowerCase(),
        role: draftEmployee.role,
        status: draftEmployee.status,
        managerId: draftEmployee.managerId || null,
        assessorId: draftEmployee.assessorId || null,
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
      setPasswordStatus('Admin set a known password for this employee.');
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
      const { notice } = await saveAssessmentDraftToApi(sessionToken, selectedAssessmentEditor, assessmentResponsesDraft);
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
      const { notice } = await submitAssessmentToApi(sessionToken, selectedAssessmentEditor, assessmentResponsesDraft);
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
      await refreshFoundationSnapshot();
      setWorkflowNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const handleSaveReviewNotes = async () => {
    if (!selectedReviewPanel || !sessionToken) {
      return;
    }

    if (!reviewNotesDraft.trim()) {
      setAppError('Review notes are required before saving them.');
      return;
    }

    setIsSavingAssessmentWorkflow(true);
    setAppError('');
    setWorkflowNotice('');

    try {
      const { notice } = await saveReviewNotesToApi(sessionToken, selectedReviewPanel, reviewNotesDraft);
      await refreshFoundationSnapshot();
      setWorkflowNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const handleCompleteReview = async () => {
    if (!selectedReviewPanel || !sessionToken) {
      return;
    }

    if (!reviewNotesDraft.trim()) {
      setAppError('Review notes are required before marking an assessment reviewed.');
      return;
    }

    setIsSavingAssessmentWorkflow(true);
    setAppError('');
    setWorkflowNotice('');

    try {
      const { notice } = await markReviewReviewedInApi(sessionToken, selectedReviewPanel, reviewNotesDraft);
      await refreshFoundationSnapshot();
      setWorkflowNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const handleReassignReview = async () => {
    if (!selectedReviewPanel || !sessionToken) {
      return;
    }

    setIsSavingAssessmentWorkflow(true);
    setAppError('');
    setWorkflowNotice('');

    try {
      const { reassignment, notice } = await reassignAssessmentInApi(
        sessionToken,
        selectedReviewPanel,
        reviewManagerDraft || null,
        selectedReviewPanel.canReassignAssessor ? reviewAssessorDraft || null : null,
      );
      syncEmployeeRelationships(
        reassignment.employee.id,
        reassignment.employee.managerId,
        reassignment.employee.assessorId,
      );
      await Promise.all([refreshFoundationSnapshot(), refreshEmployeeDirectory()]);
      setWorkflowNotice(notice);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingAssessmentWorkflow(false);
    }
  };

  const startAddingReviewPeriod = () => {
    setReviewPeriodDraft(toReviewPeriodDraft());
    setQuestionSetDraft(null);
    setAdminNotice('');
  };

  const startEditingReviewPeriod = (reviewPeriod: ReviewPeriod) => {
    setReviewPeriodDraft(toReviewPeriodDraft(reviewPeriod));
    setQuestionSetDraft(null);
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

    if (!reviewPeriodDraft.startDate || !reviewPeriodDraft.dueDate) {
      setAdminNotice('Choose both the start date and due date for the review period.');
      return;
    }

    if (reviewPeriodDraft.dueDate < reviewPeriodDraft.startDate) {
      setAdminNotice('The due date must be on or after the start date.');
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const { reviewPeriod, notice } = await saveReviewPeriodToApi(sessionToken, reviewPeriodDraft);
      await refreshFoundationSnapshot();
      setSelectedReviewPeriodId(reviewPeriod.id);
      setReviewPeriodDraft(null);
      setAdminNotice(notice);
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

    setQuestionSetDraft(toQuestionSetDraft(selectedReviewPeriod.id, target, existingQuestionSet ?? undefined));
    setReviewPeriodDraft(null);
    setAdminNotice('');
    scrollQuestionSetEditorView();
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
      setQuestionSetDraft(null);
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
        setQuestionSetDraft(null);
      }

      setAdminNotice(notice);
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
      setAdminNotice(buildExportNotice(response));
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const handleQuestionSetImport = async (format: TransferFormat) => {
    if (!selectedReviewPeriod || !sessionToken) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const response = await importQuestionSetsFromApi(sessionToken, selectedReviewPeriod.id, format);
      setAdminNotice(buildImportNotice(response));
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const handleAssignmentExport = async (format: TransferFormat) => {
    if (!selectedReviewPeriod || !sessionToken) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const response = await exportAssignmentsFromApi(sessionToken, selectedReviewPeriod.id, format);
      setAdminNotice(buildExportNotice(response));
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSavingReviewAdmin(false);
    }
  };

  const handleAssignmentImport = async (format: TransferFormat) => {
    if (!selectedReviewPeriod || !sessionToken) {
      return;
    }

    setIsSavingReviewAdmin(true);
    setAppError('');

    try {
      const response = await importAssignmentsFromApi(sessionToken, selectedReviewPeriod.id, format);
      setAdminNotice(buildImportNotice(response));
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

  const renderQuestionSetCard = (target: QuestionTarget, questionSet: QuestionSet | null) => (
    <section className="card admin-section-card question-set-card">
      <div className="question-set-heading">
        <p className="section-label">{target === 'self' ? 'Self assessment' : 'Peer assessment'}</p>
        <h3>{questionSet?.title ?? `Create ${target} questions`}</h3>
      </div>
      <dl className="detail-grid compact-detail-grid">
        <div>
          <dt>Status</dt>
          <dd>{questionSet?.status ?? 'draft'}</dd>
        </div>
        <div>
          <dt>Questions</dt>
          <dd>{questionSet?.questions.length ?? 0}</dd>
        </div>
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
      <div className="action-row">
        <button
          type="button"
          className="secondary-button"
          disabled={!selectedReviewPeriod || selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
          onClick={() => openQuestionSetEditor(target)}
        >
          {questionSet ? 'Edit set' : 'Create set'}
        </button>
      </div>
    </section>
  );

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

    return (
      <main className="admin-stack">
        <section className="card admin-section-card review-period-card">
          <div className="section-heading">
            <h3>{selectedReviewPeriod.label}</h3>
            <label className="inline-field review-period-picker">
              <span className="sr-only">Review period</span>
              <select
                value={selectedReviewPeriod.id}
                onChange={(event) => {
                  setSelectedReviewPeriodId(event.target.value);
                  setQuestionSetDraft(null);
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
          <dl className="detail-grid">
            <div>
              <dt>Window</dt>
              <dd>
                {selectedReviewPeriod.startDate} → {selectedReviewPeriod.dueDate}
              </dd>
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
          ) : null}
          <div className="action-row">
            <button type="button" disabled={isSavingReviewAdmin} onClick={startAddingReviewPeriod}>
              Add period
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={selectedReviewPeriod.status === 'archived'}
              onClick={() => startEditingReviewPeriod(selectedReviewPeriod)}
            >
              Edit period
            </button>
          </div>
          {reviewPeriodDraft ? (
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
                  Due date
                  <input
                    type="date"
                    value={reviewPeriodDraft.dueDate}
                    onChange={(event) => setReviewPeriodDraft({ ...reviewPeriodDraft, dueDate: event.target.value })}
                  />
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
          ) : null}
        </section>

        {renderQuestionSetCard('self', selectedQuestionSets.self)}
        {renderQuestionSetCard('peer', selectedQuestionSets.peer)}

        {questionSetDraft ? (
          <section
            className="card admin-section-card question-set-editor-card"
            id="question-set-editor"
            ref={questionSetEditorRef}
          >
            <p className="section-label">
              {questionSetDraft.id ? 'Edit question set' : 'Create question set'} • {questionSetDraft.target}
            </p>
            <form className="stack-form" onSubmit={saveQuestionDraft}>
              <datalist id={questionCategorySuggestionsId}>
                {questionCategorySuggestions.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              <label>
                Title
                <input
                  value={questionSetDraft.title}
                  onChange={(event) => setQuestionSetDraft({ ...questionSetDraft, title: event.target.value })}
                />
              </label>
              <label>
                Status
                <select
                  value={questionSetDraft.status}
                  onChange={(event) =>
                    setQuestionSetDraft({
                      ...questionSetDraft,
                      status: event.target.value as QuestionSetDraft['status'],
                    })
                  }
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                </select>
              </label>
              <label>
                Header markdown
                <textarea
                  rows={3}
                  value={questionSetDraft.headerMarkdown}
                  onChange={(event) =>
                    setQuestionSetDraft({ ...questionSetDraft, headerMarkdown: event.target.value })
                  }
                />
              </label>
              <div className="admin-stack">
                {questionSetDraft.questions.map((question, index) => (
                  <div className="subcard question-editor-card" key={question.id}>
                    <div className="section-heading">
                      <strong>Question {index + 1}</strong>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={questionSetDraft.questions.length === 1}
                        onClick={() =>
                          setQuestionSetDraft({
                            ...questionSetDraft,
                            questions: questionSetDraft.questions
                              .filter((candidate) => candidate.id !== question.id)
                              .map((candidate, candidateIndex) => ({
                                ...candidate,
                                order: candidateIndex + 1,
                              })),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <div className="question-editor-fields">
                      <label className="question-category-field">
                        Category
                        <input
                          list={questionCategorySuggestionsId}
                          value={question.category}
                          onChange={(event) =>
                            setQuestionSetDraft({
                              ...questionSetDraft,
                              questions: questionSetDraft.questions.map((candidate) =>
                                candidate.id === question.id
                                  ? { ...candidate, category: event.target.value }
                                  : candidate,
                              ),
                            })
                          }
                          placeholder="Impact"
                        />
                      </label>
                      <label className="question-prompt-field">
                        Prompt
                        <textarea
                          rows={3}
                          value={question.prompt}
                          onChange={(event) =>
                            setQuestionSetDraft({
                              ...questionSetDraft,
                              questions: questionSetDraft.questions.map((candidate) =>
                                candidate.id === question.id
                                  ? { ...candidate, prompt: event.target.value }
                                  : candidate,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="question-response-type-field">
                        Response type
                        <select
                          value={question.type}
                          onChange={(event) =>
                            setQuestionSetDraft({
                              ...questionSetDraft,
                              questions: questionSetDraft.questions.map((candidate) =>
                                candidate.id === question.id
                                  ? { ...candidate, type: event.target.value as QuestionSetDraft['questions'][number]['type'] }
                                  : candidate,
                              ),
                            })
                          }
                        >
                          <option value="subjective">subjective</option>
                          <option value="ranking">ranking</option>
                          <option value="narrative">narrative</option>
                        </select>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <div className="action-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setQuestionSetDraft({
                      ...questionSetDraft,
                      questions: [
                        ...questionSetDraft.questions,
                        {
                          id: window.crypto.randomUUID(),
                          order: questionSetDraft.questions.length + 1,
                          type: questionSetDraft.target === 'self' ? 'subjective' : 'ranking',
                          category: '',
                          prompt: '',
                        },
                      ],
                    })
                  }
                >
                  Add question
                </button>
              </div>
              <label>
                Footer markdown
                <textarea
                  rows={3}
                  value={questionSetDraft.footerMarkdown}
                  onChange={(event) =>
                    setQuestionSetDraft({ ...questionSetDraft, footerMarkdown: event.target.value })
                  }
                />
              </label>
              <div className="action-row">
                <button type="submit" disabled={isSavingReviewAdmin}>
                  Save question set
                </button>
                <button type="button" className="secondary-button" onClick={() => setQuestionSetDraft(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </main>
    );
  };

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
              Export JSON stub
            </button>
            <button type="button" className="secondary-button" disabled={isSavingReviewAdmin} onClick={() => void handleAssignmentExport('csv')}>
              Export CSV stub
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
              onClick={() => void handleAssignmentImport('json')}
            >
              Import JSON stub
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
              onClick={() => void handleAssignmentImport('csv')}
            >
              Import CSV stub
            </button>
          </div>
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
    const archivedReviewPeriods = reviewAdmin.reviewPeriods.filter((period) => period.status === 'archived');

    return (
      <>
        <section className="card">
          <div className="section-heading">
            <div>
              <p className="section-label">Active review periods</p>
              <h3>Archive review periods</h3>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setArchivePanelsExpanded((currentState) => ({
                  ...currentState,
                  active: !currentState.active,
                }))
              }
            >
              {archivePanelsExpanded.active ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {archivePanelsExpanded.active ? (
            <div className="archive-list">
              {activeReviewPeriods.length ? (
                activeReviewPeriods.map((reviewPeriod) => {
                  const summary = getReviewPeriodSummary(reviewAdmin, reviewPeriod.id);
                  return (
                    <article className="archive-row" key={reviewPeriod.id}>
                      <div>
                        <strong>{reviewPeriod.label}</strong>
                        <p className="muted-copy">
                          {reviewPeriod.startDate} → {reviewPeriod.dueDate} • {summary.questionSetCount} question sets •{' '}
                          {summary.assignmentCount} assignments • {summary.assessmentCount} assessments
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
          ) : null}
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <p className="section-label">Archived review periods</p>
              <h3>Restore archived review periods</h3>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setArchivePanelsExpanded((currentState) => ({
                  ...currentState,
                  archived: !currentState.archived,
                }))
              }
            >
              {archivePanelsExpanded.archived ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {archivePanelsExpanded.archived ? (
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
                          {summary.archivedAssessmentCount} archived assessments • {summary.reviewedAssessmentCount} reviewed
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
          ) : null}
        </section>
      </>
    );
  };

  const renderArchive = () => <main className="admin-stack">{renderArchiveContent()}</main>;

  const renderLocalUserTransferCard = () => {
    if (!isAdmin) {
      return null;
    }

    return (
      <section className="card admin-section-card file-management-transfer-card">
        <div className="section-heading">
          <div>
            <p className="section-label">Employees</p>
            <h3>Local user transfer files</h3>
          </div>
        </div>
        <p className="muted-copy">
          Export or import employee accounts here. The employee directory stays focused on editing people, roles, and
          passwords.
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
          <p className="section-label">Questions</p>
          <h3>Question set transfer files</h3>
          <p className="muted-copy">Loading review period transfer tools...</p>
        </section>
      );
    }

    return (
      <section className="card admin-section-card file-management-transfer-card">
        <div className="section-heading">
          <div>
            <p className="section-label">Questions</p>
            <h3>Question set transfer files</h3>
          </div>
          <label className="inline-field review-period-picker">
            <span className="sr-only">Review period</span>
            <select
              value={selectedReviewPeriod.id}
              onChange={(event) => {
                setSelectedReviewPeriodId(event.target.value);
                setQuestionSetDraft(null);
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
            <span className="dashboard-identity-label">Assessor</span>
            <span className="dashboard-identity-value">{getEmployeeName(sessionUser?.assessorId ?? null)}</span>
          </div>
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
              <article className="dashboard-queue-group" key={queue.title}>
                <div className="dashboard-queue-group-heading">
                  <strong>{queue.title}</strong>
                  <span className="muted-copy">{queue.items.length} {queue.items.length === 1 ? 'item' : 'items'}</span>
                </div>
                {queue.items.length ? (
                  <ul className="queue-list dashboard-queue-list">
                    {queue.items.map((item) => (
                      <li key={`${queue.title}-${item.title}`} className="dashboard-queue-row">
                        <div className="dashboard-queue-line">
                          <strong>{item.title}</strong>
                          <span className="dashboard-queue-separator" aria-hidden="true">
                            |
                          </span>
                          <span>{item.detail}</span>
                          <span className="dashboard-queue-separator" aria-hidden="true">
                            |
                          </span>
                          <span className="status-caption">{item.statusLabel}</span>
                        </div>
                        <button type="button" onClick={() => setSelectedAssessmentId(item.assessmentId)}>
                          {item.actionLabel}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-copy">none</p>
                )}
              </article>
            )) ?? <p className="muted-copy">Loading assessment queue...</p>}
          </div>
        ) : null}
      </section>
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
              <p className="section-label">Assessment editor</p>
              <h3 id="assessment-dialog-title">{selectedAssessmentEditor.title}</h3>
              <p className="muted-copy">{selectedAssessmentEditor.detail}</p>
            </div>
            <div className="action-row">
              <span className="pill">{selectedAssessmentEditor.statusLabel}</span>
              <button type="button" className="secondary-button" onClick={closeAssessmentDialog}>
                Close
              </button>
            </div>
          </div>
          <dl className="detail-grid compact-detail-grid">
            <div>
              <dt>Review period</dt>
              <dd>{selectedAssessmentEditor.reviewPeriodLabel}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>{selectedAssessmentEditor.dueDate}</dd>
            </div>
            <div>
              <dt>Assessment type</dt>
              <dd>{selectedAssessmentEditor.targetLabel}</dd>
            </div>
            <div>
              <dt>Manager</dt>
              <dd>{selectedAssessmentEditor.managerName}</dd>
            </div>
          </dl>
          {selectedAssessmentEditor.headerMarkdown ? (
            <MarkdownContent markdown={selectedAssessmentEditor.headerMarkdown} className="markdown-content" />
          ) : null}
          <div className="question-list">
            {selectedAssessmentEditor.questions.map((question) => (
              <label className="subcard" key={question.questionId}>
                <div className="question-prompt-block">
                  <span className="question-order">#{question.order}</span>
                  <MarkdownContent markdown={question.prompt} className="markdown-content question-prompt-markdown" />
                </div>
                <small className="muted-copy">
                  {question.type}
                  {question.category ? ` • ${question.category}` : ''}
                </small>
                <textarea
                  rows={question.type === 'narrative' ? 4 : 3}
                  disabled={selectedAssessmentEditor.isReadOnly || isSavingAssessmentWorkflow}
                  value={assessmentResponsesDraft[question.questionId] ?? ''}
                  onChange={(event) =>
                    setAssessmentResponsesDraft((currentDraft) => ({
                      ...currentDraft,
                      [question.questionId]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
          {selectedAssessmentEditor.managerNotes ? (
            <div className="toolbar-note">
              <p>
                <strong>Review notes:</strong> {selectedAssessmentEditor.managerNotes}
              </p>
            </div>
          ) : null}
          {selectedAssessmentEditor.footerMarkdown ? (
            <MarkdownContent markdown={selectedAssessmentEditor.footerMarkdown} className="markdown-content muted-copy" />
          ) : null}
          <div className="action-row">
            <button
              type="button"
              disabled={!selectedAssessmentEditor.canSave || isSavingAssessmentWorkflow}
              onClick={() => void handleSaveAssessmentForLater()}
            >
              Save for later
            </button>
            <button
              type="button"
              disabled={!selectedAssessmentEditor.canSubmit || isSavingAssessmentWorkflow}
              onClick={() => void handleSubmitAssessment()}
            >
              Submit
            </button>
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
                  <span>Review period</span>
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
                      <span className="employee-row-cell">{item.reviewPeriodLabel}</span>
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

  const renderReviewDialog = () =>
    selectedReviewPanel ? (
      <div className="modal-backdrop" role="presentation" onClick={closeReviewDialog}>
        <section
          aria-modal="true"
          className="card modal-card review-dialog-card"
          role="dialog"
          aria-labelledby="review-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="section-heading">
            <div>
              <p className="section-label">Assessment review</p>
              <h3 id="review-dialog-title">{selectedReviewPanel.title}</h3>
            </div>
            <div className="action-row">
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
                <dt>Review type</dt>
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
                <dt>Review period</dt>
                <dd>{selectedReviewPanel.reviewPeriodLabel}</dd>
              </div>
              <div>
                <dt>Due date</dt>
                <dd>{selectedReviewPanel.dueDate}</dd>
              </div>
              <div>
                <dt>Assessment status</dt>
                <dd>{selectedReviewPanel.assessmentStatusLabel}</dd>
              </div>
              <div>
                <dt>Review status</dt>
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
                <span>Details</span>
              </div>
              {selectedReviewPanel.questions.map((question) => (
                <div className="review-response-row" key={question.questionId}>
                  <div className="review-response-question">
                    <span className="question-order">#{question.order}</span>
                    <MarkdownContent markdown={question.prompt} className="markdown-content question-prompt-markdown" />
                  </div>
                  <div className="review-response-answer">
                    {question.response
                      ? question.type === 'subjective'
                        ? formatSubjectiveResponse(question.response)
                        : question.response
                      : 'No response provided yet.'}
                  </div>
                  <div className="review-response-meta">
                    <span>{question.type}</span>
                    <span>{question.category ?? 'Uncategorized'}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="review-dialog-section">
            <p className="section-label">Adjust assignments</p>
            <div className="form-columns">
              <label className="inline-field">
                <span>Manager</span>
                <select
                  disabled={selectedReviewPanel.isArchived || isSavingAssessmentWorkflow}
                  value={reviewManagerDraft}
                  onChange={(event) => setReviewManagerDraft(event.target.value)}
                >
                  <option value="">Not assigned</option>
                  {managerOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </option>
                  ))}
                </select>
              </label>
              {selectedReviewPanel.targetLabel === 'Peer assessment' ? (
                <label className="inline-field">
                  <span>Peer reviewer</span>
                  <select
                    disabled={
                      !selectedReviewPanel.canReassignAssessor ||
                      selectedReviewPanel.isArchived ||
                      isSavingAssessmentWorkflow
                    }
                    value={reviewAssessorDraft}
                    onChange={(event) => setReviewAssessorDraft(event.target.value)}
                  >
                    {activeEmployees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="action-row">
              <button
                type="button"
                disabled={selectedReviewPanel.isArchived || isSavingAssessmentWorkflow}
                onClick={() => void handleReassignReview()}
              >
                Save assignment changes
              </button>
            </div>
          </section>

          <section className="review-dialog-section">
            <p className="section-label">Review notes</p>
            <div className="review-notes-form">
              <label className="stack-form">
                <textarea
                  aria-label="Review notes"
                  rows={5}
                  readOnly={
                    selectedReviewPanel.isArchived ||
                    (!selectedReviewPanel.canAccept &&
                      !selectedReviewPanel.canRejectToDraft &&
                      !selectedReviewPanel.canMarkReviewed)
                  }
                  value={reviewNotesDraft}
                  onChange={(event) => setReviewNotesDraft(event.target.value)}
                />
              </label>
              <div className="action-row review-notes-actions">
                <button
                  type="button"
                  disabled={!selectedReviewPanel.canAccept || selectedReviewPanel.isArchived || isSavingAssessmentWorkflow}
                  onClick={() => void handleAcceptReview()}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!selectedReviewPanel.canRejectToDraft || selectedReviewPanel.isArchived || isSavingAssessmentWorkflow}
                  onClick={() => void handleRejectReview()}
                >
                  Reject to draft
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    !selectedReviewPanel.canMarkReviewed ||
                    selectedReviewPanel.isArchived ||
                    isSavingAssessmentWorkflow ||
                    !reviewNotesDraft.trim()
                  }
                  onClick={() => void handleSaveReviewNotes()}
                >
                  Save notes
                </button>
                <button
                  type="button"
                  disabled={
                    !selectedReviewPanel.canMarkReviewed ||
                    selectedReviewPanel.isArchived ||
                    isSavingAssessmentWorkflow ||
                    !reviewNotesDraft.trim()
                  }
                  onClick={() => void handleCompleteReview()}
                >
                  Mark reviewed
                </button>
              </div>
            </div>
          </section>
        </section>
      </div>
    ) : null;

  const renderBackupsContent = () => (
    <>
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="section-label">Backup status</p>
            <h3>Runtime backup configuration</h3>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={isLoadingBackupStatus || isSyncingBackups}
            onClick={() => void handleBackupStatusRefresh()}
          >
            {isLoadingBackupStatus ? 'Refreshing…' : 'Refresh status'}
          </button>
        </div>
        {isLoadingBackupStatus && !backupStatus ? (
          <p className="muted-copy">Loading backup status...</p>
        ) : backupStatus ? (
          <>
            <dl className="detail-grid backup-status-grid">
              <div>
                <dt>Daily backups</dt>
                <dd>{backupStatus.dailyBackupsEnabled ? 'Enabled' : 'Disabled'}</dd>
              </div>
              <div>
                <dt>Retention</dt>
                <dd>{backupStatus.retentionDays ? `${backupStatus.retentionDays} days` : 'Not configured'}</dd>
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
                <strong>Restore rule:</strong> Uploaded restores always use {backupStatus.replaceStrategy} semantics.
              </p>
              <p>
                Supported restore scopes: {backupStatus.supportedRestoreScopes.join(', ')}. Supported restore modes:{' '}
                {backupStatus.supportedRestoreModes.join(', ')}.
              </p>
            </div>
          </>
        ) : (
          <p className="muted-copy">Backup status is unavailable right now.</p>
        )}
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <p className="section-label">Backup now</p>
            <h3>Download a full backup</h3>
          </div>
        </div>
        <p className="muted-copy">
          The export endpoint returns a full JSON backup that includes users plus review data. Choose how local user
          credentials should be represented in the download.
        </p>
        <div className="local-user-export-mode-grid" role="radiogroup" aria-label="Backup user export mode">
          {availableBackupExportModes.map((option) => (
            <label
              key={option.value}
              className={`local-user-export-mode-option${backupExportMode === option.value ? ' local-user-export-mode-option-selected' : ''}`}
            >
              <input
                type="radio"
                name="backup-export-mode"
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
        <div className="action-row">
          <button type="button" disabled={isSyncingBackups || isReadingBackupFile} onClick={() => void handleBackupDownload()}>
            {isSyncingBackups ? 'Preparing backup…' : 'Backup now / download'}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <p className="section-label">Restore backup</p>
            <h3>Upload a backup file</h3>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={isSyncingBackups || isReadingBackupFile}
            onClick={handleBackupUpload}
          >
            {backupFile ? 'Replace file' : 'Choose backup file'}
          </button>
        </div>
        <p className="muted-copy">
          Upload a JSON backup file, then choose exactly which replace-mode restore to run. Nothing restores silently.
        </p>
        <input
          ref={backupImportInputRef}
          type="file"
          accept=".json,application/json,text/plain"
          style={{ display: 'none' }}
          onChange={(event) => void handleBackupFileChange(event)}
        />
        {isReadingBackupFile ? (
          <p className="muted-copy">Reading backup file...</p>
        ) : backupFile && backupFileSummary ? (
          <div className="subcard backup-file-card">
            <div className="section-heading">
              <div>
                <p className="section-label">Selected file</p>
                <h3>{backupFile.name}</h3>
              </div>
              <span className="pill">{Math.max(1, Math.round(backupFile.size / 1024))} KB</span>
            </div>
            <dl className="detail-grid compact-detail-grid">
              <div>
                <dt>Exported at</dt>
                <dd>{formatLocalizedDateTime(backupFileSummary.exportedAt)}</dd>
              </div>
              <div>
                <dt>User mode</dt>
                <dd>{backupFileSummary.users.mode}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{backupFileSummary.version}</dd>
              </div>
            </dl>
            <p className="muted-copy">{describeBackupSummary(backupFileSummary)}</p>
          </div>
        ) : (
          <p className="muted-copy">Choose a backup JSON file before you try a restore.</p>
        )}
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
              disabled={!backupFile || !backupFileSummary || isSyncingBackups || isReadingBackupFile}
              onClick={() => void handleBackupRestore(action)}
            >
              <strong>{action.title}</strong>
              <span className="muted-copy">{action.description}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );

  const renderBackups = () => <main className="admin-stack">{renderBackupsContent()}</main>;

  const renderWorkflowManagementCard = () => (
    <section className="card workflow-management-card">
      <div className="section-heading">
        <div>
          <p className="section-label">Workflow</p>
          <h3>Review workflow markdown</h3>
        </div>
        {isAdmin ? (
          <button type="button" onClick={openWorkflowEditor}>
            Edit workflow
          </button>
        ) : null}
      </div>
      <MarkdownContent markdown={workflowContent} className="markdown-content workflow-page-markdown workflow-management-preview" />
    </section>
  );

  const renderFileManagement = () => (
    <main className="admin-stack">
      {renderWorkflowManagementCard()}

      <div className="file-management-card-grid">
        {renderLocalUserTransferCard()}
        {renderQuestionTransferCard()}
      </div>
      {renderArchiveContent()}
      {renderBackupsContent()}
    </main>
  );

  const renderWorkflow = () => (
    <main className="content-grid">
      <section className="card card-wide workflow-page-card">
        <p className="section-label">Review lifecycle</p>
        <MarkdownContent markdown={workflowContent} className="markdown-content workflow-page-markdown" />
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
      const employeeAssessorOptions = activeEmployees.filter((employee) => employee.id !== draftEmployee.id);
      const selectedManagerId = managerOptions.some((employee) => employee.id === draftEmployee.managerId)
        ? draftEmployee.managerId
        : '';
      const selectedAssessorId = employeeAssessorOptions.some((employee) => employee.id === draftEmployee.assessorId)
        ? draftEmployee.assessorId
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
                Assessor
                <select
                  value={selectedAssessorId}
                  onChange={(event) => setDraftEmployee({ ...draftEmployee, assessorId: event.target.value })}
                >
                  <option value="">Not assigned</option>
                  {employeeAssessorOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </option>
                  ))}
                </select>
              </label>
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
              <div className="action-row">
                <button type="submit" disabled={isSavingEmployee}>
                  {isSavingEmployee ? 'Saving…' : 'Save employee'}
                </button>
                <button type="button" className="secondary-button" onClick={closeEmployeeDialog}>
                  Cancel
                </button>
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
            <div className="action-row">
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
                  <dt>Assessor</dt>
                  <dd>{getEmployeeName(detailEmployee.assessorId)}</dd>
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
              <div className="action-row">
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
                    Remove
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <p className="muted-copy">Loading employee details…</p>
          )}
        </section>
      </div>
    );
  };

  const renderEmployees = () => {
    const renderEmployeeRosterRow = (employee: Employee) => {
      const canEditEmployeeRow = isAdmin || employee.role !== 'admin';

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
            <span className="employee-row-cell">{getEmployeeName(employee.assessorId)}</span>
            <span className="employee-row-cell">
              <span className={`pill employee-status-pill employee-status-pill-${employee.status}`}>{employee.status}</span>
            </span>
          </button>
          <div className="employee-row-actions">
            {canManageEmployees && canEditEmployeeRow ? (
              <button type="button" className="secondary-button" onClick={() => startEditingEmployee(employee)}>
                Edit
              </button>
            ) : null}
            {isAdmin ? (
              <button type="button" className="secondary-button" onClick={() => openPasswordDialog(employee.id)}>
                Password
              </button>
            ) : null}
          </div>
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

          {isLoadingEmployees ? <p className="muted-copy">Loading employee roster...</p> : null}

          {directoryEmployees.length ? (
            <div className="employee-roster-table-scroll" role="region" aria-label="Employee directory">
              <div className="employee-roster-table" aria-label="Employee directory">
                <div className="employee-roster-header">
                  <span>Name</span>
                  <span>Role</span>
                  <span>Email</span>
                  <span>Manager</span>
                  <span>Assessor</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {directoryEmployees.map(renderEmployeeRosterRow)}
              </div>
            </div>
          ) : (
            <p className="muted-copy">No employees in the directory.</p>
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
            <p className="eyebrow">Revu</p>
            <h1>Sign in to the assessment workspace</h1>
            <p className="login-copy">
              Use the API-backed local username and password flow to reach the integrated dashboard and employee
              administration screens.
            </p>
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
      <div className="app-shell" data-revu-theme={themePreference}>
        <aside className="sidebar">
          <div className="brand-block">
            <a className="brand-title-link brand-row-link" href={defaultPath} onClick={(event) => navigate(event, defaultPath)}>
              <div className="brand-row">
                <h1>REVU</h1>
                {companyName ? <span className="brand-company">{companyName}</span> : null}
              </div>
            </a>
          </div>

          <div className="session-card sidebar-session-card">
            <p className="section-label">Signed in as</p>
            <h2>{sessionUser.fullName}</h2>
            <p className="sidebar-session-meta">
              {sessionUser.role} • {sessionUser.username}
            </p>
            <button type="button" className="secondary-button" onClick={handleLogout}>
              Sign out
            </button>
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

            <a className="sidebar-note workflow-card" href="/workflow" onClick={(event) => navigate(event, '/workflow')}>
              <p className="sidebar-note-title">Workflow</p>
              <MarkdownContent markdown={workflowContent} className="markdown-content workflow-card-markdown" />
            </a>
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
          : pathname === '/reviews'
            ? renderReviews()
          : pathname === '/employees'
            ? renderEmployees()
            : pathname === '/questions'
              ? renderQuestions()
              : pathname === '/file-management'
                ? renderFileManagement()
                : pathname === '/workflow'
                  ? renderWorkflow()
                  : pathname === '/archive'
                    ? renderArchive()
                    : pathname === '/backups'
                      ? renderBackups()
                      : renderPlaceholderSection()}

        {renderReviewDialog()}

        {renderAssessmentDialog()}

        {renderEmployeeDialog()}

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
                    <span>Set known password</span>
                    <input
                      type="password"
                      value={passwordDraft}
                      onChange={(event) => setPasswordDraft(event.target.value)}
                      placeholder="Enter a known password"
                    />
                  </label>
                  <div className="action-row">
                    <button type="button" onClick={saveKnownPassword} disabled={!passwordDraft.trim() || isUpdatingPassword}>
                      {isUpdatingPassword ? 'Updating…' : 'Set Password'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleResetPassword}
                      disabled={isUpdatingPassword}
                    >
                      Generate one-time passcode
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted-copy">Loading employee credentials…</p>
              )}
            </section>
          </div>
        ) : null}

        {isAdmin && workflowDraft !== null ? (
          <div className="modal-backdrop" role="presentation" onClick={closeWorkflowEditor}>
            <section
              aria-modal="true"
              className="card modal-card workflow-editor-dialog"
              role="dialog"
              aria-labelledby="workflow-editor-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="section-heading">
                <div>
                  <p className="section-label">Workflow</p>
                  <h3 id="workflow-editor-title">Edit workflow markdown</h3>
                </div>
                <button type="button" className="secondary-button" onClick={closeWorkflowEditor}>
                  Close
                </button>
              </div>
              <div className="workflow-editor-grid">
                <label className="stack-form">
                  <span>Workflow markdown</span>
                  <textarea
                    aria-label="Workflow markdown"
                    rows={18}
                    value={workflowDraft}
                    onChange={(event) => setWorkflowDraft(event.target.value)}
                  />
                </label>
                <section className="subcard workflow-editor-preview">
                  <p className="section-label">Preview</p>
                  <MarkdownContent markdown={workflowDraft} className="markdown-content workflow-page-markdown" />
                </section>
              </div>
              <div className="action-row">
                <button type="button" onClick={saveWorkflowContent}>
                  Save workflow
                </button>
                <button type="button" className="secondary-button" onClick={closeWorkflowEditor}>
                  Cancel
                </button>
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
