import type {
  AuthSession,
  Employee,
  EmployeeAdmin,
  FoundationSnapshot,
  QuestionSet,
  QuestionTarget,
  ReviewPeriod,
} from '@revu/contracts';
import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from 'react';

import {
  ApiClientError,
  changePassword,
  createEmployee,
  getEmployee,
  getFoundation,
  listEmployees,
  login,
  logout,
  me,
  resetEmployeePassword,
  setEmployeePassword,
  updateEmployee,
} from './api';
import { buildDashboardSnapshot } from './dashboard';
import {
  appSections,
  defaultPath,
  getSection,
  getSectionsForRole,
  navGroups,
  normalizePath,
  routeLegend,
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
  buildExportNotice,
  buildImportNotice,
  buildLocalUsersExportNotice,
  buildLocalUsersImportNotice,
  buildLocalUsersImportPayload,
  exportAssignmentsFromApi,
  exportLocalUsersFromApi,
  exportQuestionSetsFromApi,
  importAssignmentsFromApi,
  importLocalUsersFromApi,
  importQuestionSetsFromApi,
  saveAssignmentToApi,
  saveQuestionSetToApi,
  serializeLocalUsersTransfer,
  saveReviewPeriodToApi,
  toggleReviewPeriodArchiveInApi,
  type TransferFormat,
} from './reviewAdminApi';
import { getRuntimeCompanyName } from './runtimeConfig';
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
const sessionStorageKey = 'revu-session-token';
const themeStorageKey = 'revu-theme-preference';

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

type LocalUserTransferPreview = {
  format: TransferFormat;
  itemCount: number;
  content: string;
  exportedAt: string;
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
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [isChangingOwnPassword, setIsChangingOwnPassword] = useState(false);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [isSyncingLocalUsers, setIsSyncingLocalUsers] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSavingReviewAdmin, setIsSavingReviewAdmin] = useState(false);
  const [isSavingAssessmentWorkflow, setIsSavingAssessmentWorkflow] = useState(false);
  const [reviewAdmin, setReviewAdmin] = useState<ReviewAdminSnapshot | null>(null);
  const [selectedReviewPeriodId, setSelectedReviewPeriodId] = useState<string | null>(null);
  const [reviewPeriodDraft, setReviewPeriodDraft] = useState<ReviewPeriodDraft | null>(null);
  const [questionSetDraft, setQuestionSetDraft] = useState<QuestionSetDraft | null>(null);
  const [adminNotice, setAdminNotice] = useState('');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [assessmentResponsesDraft, setAssessmentResponsesDraft] = useState<Record<string, string>>({});
  const [workflowNotice, setWorkflowNotice] = useState('');
  const [selectedReviewAssessmentId, setSelectedReviewAssessmentId] = useState<string | null>(null);
  const [reviewNotesDraft, setReviewNotesDraft] = useState('');
  const [reviewManagerDraft, setReviewManagerDraft] = useState('');
  const [reviewAssessorDraft, setReviewAssessorDraft] = useState('');
  const [areReviewQueuesExpanded, setAreReviewQueuesExpanded] = useState(true);
  const [employeeRosterExpanded, setEmployeeRosterExpanded] = useState({
    active: true,
    inactive: false,
  });
  const [archivePanelsExpanded, setArchivePanelsExpanded] = useState({
    active: true,
    archived: true,
  });
  const [passwordDialogEmployeeId, setPasswordDialogEmployeeId] = useState<string | null>(null);
  const [localUserTransferFormat, setLocalUserTransferFormat] = useState<TransferFormat>('json');
  const [localUserImportDraft, setLocalUserImportDraft] = useState('');
  const [localUserTransferPreview, setLocalUserTransferPreview] = useState<LocalUserTransferPreview | null>(null);
  const reviewPanelRef = useRef<HTMLElement | null>(null);

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
  const availableSections = useMemo(
    () => (sessionUser ? getSectionsForRole(sessionUser.role) : []),
    [sessionUser],
  );
  const hasEmployeeReadAccess = session?.permissions.includes('employees:read') ?? false;
  const canManageEmployees = sessionUser?.role === 'admin' || sessionUser?.role === 'manager';
  const isAdmin = sessionUser?.role === 'admin';
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
    () => reviewQueues.flatMap((queue) => queue.items.map((item) => item.assessmentId)),
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
  const localUserImportPlaceholder =
    localUserTransferFormat === 'json'
      ? `{\n  "format": "json",\n  "items": []\n}`
      : 'username,fullName,email,role,status,managerUsername,assessorUsername,password,passwordResetRequired';

  useEffect(() => {
    if (!sessionUser) {
      return;
    }

    if (!availableSections.some((section) => section.path === pathname)) {
      window.history.replaceState(null, '', '/dashboard');
      setPathname('/dashboard');
    }
  }, [availableSections, pathname, sessionUser]);

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

    setSelectedEmployeeId(activeEmployees[0]?.id ?? inactiveEmployees[0]?.id ?? null);
  }, [activeEmployees, draftEmployee, employees, inactiveEmployees, selectedEmployeeId, sessionUser]);

  useEffect(() => {
    setPasswordDraft('');
    setPasswordStatus('');
    setTemporaryPassword(null);
  }, [selectedEmployeeId]);

  useEffect(() => {
    if (!authoredAssessmentIds.length) {
      setSelectedAssessmentId(null);
      return;
    }

    if (selectedAssessmentId && authoredAssessmentIds.includes(selectedAssessmentId)) {
      return;
    }

    setSelectedAssessmentId(authoredAssessmentIds[0] ?? null);
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
    if (!reviewAssessmentIds.length) {
      setSelectedReviewAssessmentId(null);
      return;
    }

    if (selectedReviewAssessmentId && reviewAssessmentIds.includes(selectedReviewAssessmentId)) {
      return;
    }

    setSelectedReviewAssessmentId(reviewAssessmentIds[0] ?? null);
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
    if (!selectedReviewAssessmentId || !selectedReviewPanel) {
      return;
    }

    const timeout = window.setTimeout(() => {
      reviewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [selectedReviewAssessmentId, selectedReviewPanel]);

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
    if (nextPath === pathname) {
      return;
    }

    window.history.pushState(null, '', nextPath);
    setPathname(nextPath);
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

  const resetEditingState = () => {
    setEditingEmployeeId(null);
    setDraftEmployee(null);
    setFormError('');
  };

  const closePasswordDialog = () => {
    setPasswordDialogEmployeeId(null);
    setPasswordDraft('');
    setPasswordStatus('');
    setTemporaryPassword(null);
  };

  const openPasswordDialog = (employeeId: string) => {
    resetEditingState();
    setSelectedEmployeeId(employeeId);
    setPasswordDialogEmployeeId(employeeId);
  };

  const handleSelectReviewAssessment = (assessmentId: string) => {
    setSelectedReviewAssessmentId(assessmentId);
  };

  const clearSession = (options?: {
    authNotice?: string;
    preserveLocalUserTransferDraft?: boolean;
    preserveLocalUserTransferPreview?: boolean;
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
    setEmployeeRosterExpanded({
      active: true,
      inactive: false,
    });
    setArchivePanelsExpanded({
      active: true,
      archived: true,
    });
    setPasswordDialogEmployeeId(null);
    if (!options?.preserveLocalUserTransferDraft) {
      setLocalUserImportDraft('');
    }
    if (!options?.preserveLocalUserTransferPreview) {
      setLocalUserTransferPreview(null);
    }
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

  const handleLocalUserExport = async () => {
    if (!sessionToken || !sessionUser) {
      return;
    }

    const confirmed = window.confirm(
      `Exporting local users will rotate every exported password into a generated one-time passcode, sign every exported user out, and include the passcodes in the export. Continue with the ${localUserTransferFormat.toUpperCase()} export?`,
    );
    if (!confirmed) {
      return;
    }

    setIsSyncingLocalUsers(true);
    setAppError('');

    try {
      const response = await exportLocalUsersFromApi(sessionToken, localUserTransferFormat);
      const preview = serializeLocalUsersTransfer(response);
      const notice = `${buildLocalUsersExportNotice(response)} Your current session is now signed out. Copy the export, then sign in again with your exported one-time passcode.`;

      setLocalUserTransferPreview({
        format: response.format,
        itemCount: response.itemCount,
        content: preview,
        exportedAt: response.exportedAt,
      });
      setLocalUserImportDraft(preview);
      setLoginUsername(sessionUser.username);
      clearSession({
        authNotice: notice,
        preserveLocalUserTransferDraft: true,
        preserveLocalUserTransferPreview: true,
      });
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsSyncingLocalUsers(false);
    }
  };

  const handleLocalUserImport = async () => {
    if (!sessionToken || !sessionUser) {
      return;
    }

    if (!localUserImportDraft.trim()) {
      setAdminNotice('Paste a JSON or CSV payload before importing local users.');
      return;
    }

    setIsSyncingLocalUsers(true);
    setAdminNotice('');
    setAppError('');

    try {
      const payload = buildLocalUsersImportPayload(localUserTransferFormat, localUserImportDraft);
      const response = await importLocalUsersFromApi(sessionToken, payload);
      const notice = buildLocalUsersImportNotice(response);
      const currentUserWasImported = response.items.some((item) => item.id === sessionUser.id);

      if (currentUserWasImported) {
        setLoginUsername(sessionUser.username);
        clearSession({
          authNotice: `${notice} Your account was part of the import, so sign in again with the imported password or one-time passcode.`,
          preserveLocalUserTransferDraft: true,
          preserveLocalUserTransferPreview: true,
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

  const startEditingEmployee = (employee: Employee | EmployeeAdmin) => {
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
    <section className="card admin-section-card">
      <div className="section-heading">
        <div>
          <p className="section-label">{target === 'self' ? 'Self assessment' : 'Peer assessment'}</p>
          <h3>{questionSet?.title ?? `Create ${target} questions`}</h3>
        </div>
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
      <p>{questionSet?.headerMarkdown || 'No header text yet.'}</p>
      <ul className="bullet-list">
        {questionSet?.questions.map((question) => (
          <li key={question.id}>
            #{question.order} {question.prompt}
          </li>
        )) ?? <li>No questions configured yet.</li>}
      </ul>
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
        <section className="card admin-section-card">
          <div className="section-heading">
            <div>
              <p className="section-label">Review period</p>
              <h3>{selectedReviewPeriod.label}</h3>
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={selectedReviewPeriod.status === 'archived'}
              onClick={() => startEditingReviewPeriod(selectedReviewPeriod)}
            >
              Edit period
            </button>
          </div>
          <label className="inline-field">
            Review period
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
            <button type="button" className="secondary-button" disabled={isSavingReviewAdmin} onClick={() => void handleQuestionSetExport('json')}>
              Export JSON stub
            </button>
            <button type="button" className="secondary-button" disabled={isSavingReviewAdmin} onClick={() => void handleQuestionSetExport('csv')}>
              Export CSV stub
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
              onClick={() => void handleQuestionSetImport('json')}
            >
              Import JSON stub
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
              onClick={() => void handleQuestionSetImport('csv')}
            >
              Import CSV stub
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

          <div className="action-row">
            <button type="button" disabled={isSavingReviewAdmin} onClick={startAddingReviewPeriod}>
              Add period
            </button>
          </div>
        </section>

        {renderQuestionSetCard('self', selectedQuestionSets.self)}
        {renderQuestionSetCard('peer', selectedQuestionSets.peer)}

        {questionSetDraft ? (
          <section className="card">
            <p className="section-label">
              {questionSetDraft.id ? 'Edit question set' : 'Create question set'} • {questionSetDraft.target}
            </p>
            <form className="stack-form" onSubmit={saveQuestionDraft}>
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
                  <div className="subcard" key={question.id}>
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
                    <div className="form-columns">
                      <label>
                        Type
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
                      <label>
                        Category
                        <input
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
                        />
                      </label>
                    </div>
                    <label>
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

  const renderArchive = () => {
    if (!reviewAdmin) {
      return (
        <main className="content-grid">
          <section className="card">
            <p className="muted-copy">Loading archive controls...</p>
          </section>
        </main>
      );
    }

    const activeReviewPeriods = reviewAdmin.reviewPeriods.filter((period) => period.status === 'active');
    const archivedReviewPeriods = reviewAdmin.reviewPeriods.filter((period) => period.status === 'archived');

    return (
      <main className="admin-stack">
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
      </main>
    );
  };

  const renderDashboard = () => (
    <main className="admin-stack">
      <section className="card">
        <p className="section-label">Dashboard overview</p>
        <h3>{dashboardSnapshot?.dueLabel ?? 'Loading review cycle...'}</h3>
        <p>{dashboardSnapshot?.reviewSummary ?? 'Loading assessment summary...'}</p>
        {dashboardSnapshot?.adminSummary ? <p>{dashboardSnapshot.adminSummary}</p> : null}
        <dl className="detail-grid">
          <div>
            <dt>Role</dt>
            <dd>{sessionUser?.role}</dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>{sessionUser?.username}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{sessionUser?.email}</dd>
          </div>
          <div>
            <dt>Manager</dt>
            <dd>{getEmployeeName(sessionUser?.managerId ?? null)}</dd>
          </div>
          <div>
            <dt>Assessor</dt>
            <dd>{getEmployeeName(sessionUser?.assessorId ?? null)}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <p className="section-label">Role-based shortcuts</p>
        <div className="action-row">
          {(sessionUser?.role === 'manager' || sessionUser?.role === 'admin') && (
            <>
              <button type="button" onClick={() => goTo('/reviews')}>
                Reviews
              </button>
              <button type="button" onClick={() => goTo('/employees')}>
                Employees
              </button>
            </>
          )}
          {sessionUser?.role === 'admin' && (
            <>
              <button type="button" onClick={() => goTo('/questions')}>
                Questions
              </button>
              <button type="button" onClick={() => goTo('/assignments')}>
                Assignments
              </button>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <p className="section-label">Assessment queues</p>
        <div className="queue-stack">
          {dashboardSnapshot?.queues.map((queue) => (
            <article className="queue-card" key={queue.title}>
              <h3>{queue.title}</h3>
              {queue.items.length ? (
                <ul className="queue-list">
                  {queue.items.map((item) => (
                    <li key={`${queue.title}-${item.title}`}>
                      <div>
                        <strong>{item.title}</strong>
                        <p className="status-caption">{item.statusLabel}</p>
                        <p>{item.detail}</p>
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
          )) ?? <p className="muted-copy">Loading assessment queues...</p>}
        </div>
      </section>

      <section className="card">
        <p className="section-label">Assessment editor</p>
        {selectedAssessmentEditor ? (
          <div className="review-layout">
            <div className="subcard">
              <div className="section-heading">
                <div>
                  <h3>{selectedAssessmentEditor.title}</h3>
                  <p className="muted-copy">{selectedAssessmentEditor.detail}</p>
                </div>
                <span className="pill">{selectedAssessmentEditor.statusLabel}</span>
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
              {selectedAssessmentEditor.headerMarkdown ? <p>{selectedAssessmentEditor.headerMarkdown}</p> : null}
              <div className="question-list">
                {selectedAssessmentEditor.questions.map((question) => (
                  <label className="subcard" key={question.questionId}>
                    <span>
                      <strong>
                        #{question.order} {question.prompt}
                      </strong>
                    </span>
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
              {selectedAssessmentEditor.footerMarkdown ? <p className="muted-copy">{selectedAssessmentEditor.footerMarkdown}</p> : null}
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
            </div>
          </div>
        ) : (
          <p className="muted-copy">Select an assessment queue item to edit or review your submission.</p>
        )}
      </section>
    </main>
  );

  const renderReviews = () => (
    <main className="admin-stack">
      <section className="card review-sidebar">
        <div className="section-heading">
          <h3>Review Queue</h3>
          <div className="action-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setAreReviewQueuesExpanded(false)}
            >
              Collapse
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setAreReviewQueuesExpanded(true)}
            >
              Expand
            </button>
          </div>
        </div>

        <div className="review-queue-stack">
          {reviewQueues.map((queue) => (
            <div className="subcard review-queue-group" key={queue.title}>
              <div className="review-queue-group-heading">
                <strong>{queue.title}</strong>
                <span className="muted-copy">{queue.items.length} {queue.items.length === 1 ? 'item' : 'items'}</span>
              </div>
              {areReviewQueuesExpanded ? (
                queue.items.length ? (
                  <div className="review-queue-list">
                    {queue.items.map((item) => (
                      <button
                        type="button"
                        className={`admin-list-item review-queue-item${item.assessmentId === selectedReviewAssessmentId ? ' admin-list-item-active' : ''}`}
                        key={item.assessmentId}
                        onClick={() => handleSelectReviewAssessment(item.assessmentId)}
                      >
                        <span className="review-queue-line">
                          <strong>{item.title}</strong>
                          <span className="review-queue-separator" aria-hidden="true">
                            |
                          </span>
                          <span>{item.assessorLabel}</span>
                          <span className="review-queue-separator" aria-hidden="true">
                            |
                          </span>
                          <span>{item.statusLabel}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">No items in this queue right now.</p>
                )
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {selectedReviewPanel ? (
        <>
          <section className="card" ref={reviewPanelRef}>
              <div className="section-heading">
                <div>
                  <p className="section-label">Review panel</p>
                  <h3>{selectedReviewPanel.title}</h3>
                </div>
                <span className="pill">{selectedReviewPanel.reviewStatusLabel}</span>
              </div>
              <p>{selectedReviewPanel.detail}</p>
              <dl className="detail-grid">
                <div>
                  <dt>Review period</dt>
                  <dd>{selectedReviewPanel.reviewPeriodLabel}</dd>
                </div>
                <div>
                  <dt>Due date</dt>
                  <dd>{selectedReviewPanel.dueDate}</dd>
                </div>
                <div>
                  <dt>Subject</dt>
                  <dd>{selectedReviewPanel.subjectName}</dd>
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
                  <dt>Review type</dt>
                  <dd>{selectedReviewPanel.targetLabel}</dd>
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

            <section className="card">
              <p className="section-label">Responses</p>
              <div className="question-list review-response-list">
                {selectedReviewPanel.questions.map((question) => (
                  <article className="subcard review-response-row" key={question.questionId}>
                    <strong>
                      #{question.order} {question.prompt}
                    </strong>
                    <small className="muted-copy">
                      {question.type}
                      {question.category ? ` • ${question.category}` : ''}
                    </small>
                    <p>
                      {question.response
                        ? question.type === 'subjective'
                          ? formatSubjectiveResponse(question.response)
                          : question.response
                        : 'No response provided yet.'}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="card">
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

            <section className="card">
              <div className="section-heading">
                <h3>Adjust Assignments</h3>
              </div>
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
        </>
      ) : (
        <section className="card">
          <p className="section-label">Review panel</p>
          <p>Select a submitted or accepted assessment to review it.</p>
        </section>
      )}
    </main>
  );

  const renderEmployeeDetail = () => {
    if (!selectedEmployee && !draftEmployee) {
      return (
        <section className="card">
          <p className="section-label">Employee detail</p>
          <p>Select an employee to review or edit the record.</p>
        </section>
      );
    }

    if (draftEmployee && editingEmployeeId) {
      return (
        <section className="card">
          <p className="section-label">{draftEmployee.id ? 'Edit employee' : 'Add employee'}</p>
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
                value={draftEmployee.managerId}
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
                value={draftEmployee.assessorId}
                onChange={(event) => setDraftEmployee({ ...draftEmployee, assessorId: event.target.value })}
              >
                <option value="">Not assigned</option>
                {activeEmployees.map((employee) => (
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
              <button type="button" className="secondary-button" onClick={resetEditingState}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      );
    }

    return (
      <section className="detail-panel">
        <div className="card">
          <p className="section-label">Employee view</p>
          <h3>{selectedEmployeeDetail?.fullName ?? selectedEmployee?.fullName}</h3>
          <dl className="detail-grid">
            <div>
              <dt>Username</dt>
              <dd>{selectedEmployeeDetail?.username ?? selectedEmployee?.username}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{selectedEmployeeDetail?.email ?? selectedEmployee?.email}</dd>
            </div>
            <div>
              <dt>Manager</dt>
              <dd>{getEmployeeName((selectedEmployeeDetail ?? selectedEmployee)?.managerId ?? null)}</dd>
            </div>
            <div>
              <dt>Assessor</dt>
              <dd>{getEmployeeName((selectedEmployeeDetail ?? selectedEmployee)?.assessorId ?? null)}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{selectedEmployeeDetail?.role ?? selectedEmployee?.role}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{selectedEmployeeDetail?.status ?? selectedEmployee?.status}</dd>
            </div>
            <div>
              <dt>Password configured</dt>
              <dd>{selectedEmployeeDetail?.auth.passwordConfigured ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Password reset required</dt>
              <dd>{selectedEmployeeDetail?.auth.passwordResetRequired ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Last password change</dt>
              <dd>{formatLocalizedDateTime(selectedEmployeeDetail?.auth.lastPasswordChangeAt ?? null)}</dd>
            </div>
          </dl>
          <div className="action-row">
            {canManageEmployees && canEditSelectedEmployee ? (
              <button
                type="button"
                onClick={() => {
                  const employeeToEdit = selectedEmployeeDetail ?? selectedEmployee;
                  if (employeeToEdit) {
                    startEditingEmployee(employeeToEdit);
                  }
                }}
              >
                Edit
              </button>
            ) : null}
            {isAdmin && (selectedEmployeeDetail ?? selectedEmployee) ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => openPasswordDialog((selectedEmployeeDetail ?? selectedEmployee)!.id)}
              >
                Manage password
              </button>
            ) : null}
            {isAdmin ? (
              <button type="button" className="secondary-button" onClick={markEmployeeInactive}>
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </section>
    );
  };

  const renderEmployees = () => (
    <main className="admin-stack">
      <section className="card">
        {(() => {
          const renderEmployeeRosterRow = (employee: Employee) => {
            const canEditEmployeeRow = isAdmin || employee.role !== 'admin';

            return (
              <div
                className={`employee-row-card${employee.id === selectedEmployeeId ? ' employee-row-active' : ''}`}
                key={employee.id}
              >
                <button
                  type="button"
                  className="employee-row-summary"
                  onClick={() => {
                    setSelectedEmployeeId(employee.id);
                    resetEditingState();
                  }}
                >
                  <span className="employee-row-cell employee-row-name">
                    <strong>{employee.fullName}</strong>
                  </span>
                  <span className="employee-row-cell">{employee.role}</span>
                  <span className="employee-row-cell">{employee.email}</span>
                  <span className="employee-row-cell">{getEmployeeName(employee.managerId)}</span>
                  <span className="employee-row-cell">{getEmployeeName(employee.assessorId)}</span>
                </button>
                <div className="employee-row-actions">
                  {canManageEmployees && canEditEmployeeRow ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setSelectedEmployeeId(employee.id);
                        startEditingEmployee(employee);
                      }}
                    >
                      Edit
                    </button>
                  ) : null}
                  {isAdmin ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => openPasswordDialog(employee.id)}
                    >
                      Password
                    </button>
                  ) : null}
                </div>
              </div>
            );
          };

          const renderEmployeeRosterTable = (employees: Employee[], emptyMessage: string, label: string) =>
            employees.length ? (
              <div className="employee-roster-table-scroll" role="region" aria-label={label}>
                <div className="employee-roster-table" aria-label={label}>
                  <div className="employee-roster-header">
                    <span>Name</span>
                    <span>Role</span>
                    <span>Email</span>
                    <span>Manager</span>
                    <span>Assessor</span>
                    <span>Actions</span>
                  </div>
                  {employees.map(renderEmployeeRosterRow)}
                </div>
              </div>
            ) : (
              <p className="muted-copy">{emptyMessage}</p>
            );

          return (
            <>
        <div className="section-heading">
          <p className="section-label">Employee roster</p>
          {isAdmin ? (
            <button type="button" onClick={startAddingEmployee}>
              Add employee
            </button>
          ) : null}
        </div>

        {isLoadingEmployees ? <p className="muted-copy">Loading employee roster...</p> : null}

        <div className="employee-roster-group">
          <button
            type="button"
            className="section-toggle"
            onClick={() =>
              setEmployeeRosterExpanded((currentState) => ({
                ...currentState,
                active: !currentState.active,
              }))
            }
          >
            <span>Active employees</span>
            <span className="muted-copy">
              {activeEmployees.length} {activeEmployees.length === 1 ? 'employee' : 'employees'} •{' '}
              {employeeRosterExpanded.active ? 'Collapse' : 'Expand'}
            </span>
          </button>
          {employeeRosterExpanded.active ? (
            renderEmployeeRosterTable(activeEmployees, 'No active employees.', 'Active employees')
          ) : null}
        </div>

        <div className="employee-roster-group">
          <button
            type="button"
            className="section-toggle"
            onClick={() =>
              setEmployeeRosterExpanded((currentState) => ({
                ...currentState,
                inactive: !currentState.inactive,
              }))
            }
          >
            <span>Inactive employees</span>
            <span className="muted-copy">
              {inactiveEmployees.length} {inactiveEmployees.length === 1 ? 'employee' : 'employees'} •{' '}
              {employeeRosterExpanded.inactive ? 'Collapse' : 'Expand'}
            </span>
          </button>
          {employeeRosterExpanded.inactive ? (
            renderEmployeeRosterTable(inactiveEmployees, 'No inactive employees.', 'Inactive employees')
          ) : null}
        </div>
            </>
          );
        })()}
      </section>

      {isAdmin ? (
        <section className="card">
          <div className="section-heading">
            <div>
              <p className="section-label">Local user transfer</p>
              <h3>Import or export local credentials</h3>
            </div>
            <label className="inline-field">
              Format
              <select
                value={localUserTransferFormat}
                disabled={isSyncingLocalUsers}
                onChange={(event) => setLocalUserTransferFormat(event.target.value as TransferFormat)}
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
            </label>
          </div>
          <p className="muted-copy">
            Exporting local users generates new one-time passcodes for every exported account, signs them out immediately,
            and replaces their previous passwords.
          </p>
          <div className="action-row">
            <button type="button" disabled={isSyncingLocalUsers} onClick={() => void handleLocalUserExport()}>
              {isSyncingLocalUsers ? 'Working…' : `Export ${localUserTransferFormat.toUpperCase()}`}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={isSyncingLocalUsers || !localUserImportDraft.trim()}
              onClick={() => void handleLocalUserImport()}
            >
              Import {localUserTransferFormat.toUpperCase()}
            </button>
          </div>
          {localUserTransferPreview ? (
            <>
              <p className="temporary-password">
                Last export prepared {localUserTransferPreview.itemCount} users as {localUserTransferPreview.format.toUpperCase()} at{' '}
                {localUserTransferPreview.exportedAt}.
              </p>
              <label className="stack-form">
                <span>Latest export payload</span>
                <textarea readOnly rows={8} value={localUserTransferPreview.content} />
              </label>
            </>
          ) : null}
          <label className="stack-form">
            <span>Import payload</span>
            <textarea
              rows={8}
              value={localUserImportDraft}
              onChange={(event) => setLocalUserImportDraft(event.target.value)}
              placeholder={localUserImportPlaceholder}
            />
          </label>
          <p className="muted-copy">
            Paste either the import-ready JSON export object or the matching CSV rows. Imported users keep whatever
            password-reset requirement is present in the payload.
          </p>
        </section>
      ) : null}

      {renderEmployeeDetail()}
    </main>
  );

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
            {localUserTransferPreview ? (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <p className="section-label">Latest local-user export</p>
                <h3>
                  {localUserTransferPreview.itemCount} users • {localUserTransferPreview.format.toUpperCase()}
                </h3>
                <p className="muted-copy">
                  Generated one-time passcodes replace the previous passwords. Copy this payload before closing the tab.
                </p>
                <label className="stack-form">
                  <span>Import-ready payload</span>
                  <textarea readOnly rows={8} value={localUserTransferPreview.content} />
                </label>
                <div className="action-row">
                  <button type="button" className="secondary-button" onClick={() => setLocalUserTransferPreview(null)}>
                    Dismiss payload
                  </button>
                </div>
              </div>
            ) : null}

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
          <p>
            {sessionUser.role} • {sessionUser.username}
          </p>
          <button type="button" className="secondary-button" onClick={handleLogout}>
            Sign out
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {navGroups.map((group) => (
            <section className="nav-group" key={group}>
              <p className="nav-group-label">{group}</p>
              <div className="nav-links">
                {availableSections
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
          <div className="session-card">
            <button
              type="button"
              className="secondary-button"
              aria-label={`Current theme ${getThemeLabel(themePreference)}. Click to switch to ${getThemeLabel(getNextThemePreference(themePreference))}.`}
              onClick={() => setThemePreference((currentTheme) => getNextThemePreference(currentTheme))}
            >
              {getThemeLabel(themePreference)}
            </button>
          </div>

          <div className="sidebar-note">
            <p className="sidebar-note-title">Terminology guardrails</p>
            <p>{routeLegend.assessments}</p>
            <p>{routeLegend.reviews}</p>
          </div>
        </div>
      </aside>

      <div className="content">
        <header className="hero card">
          <div className="hero-copy">
            {pathname === '/reviews' ? null : <span className="badge">Integrated API auth mode</span>}
            <h2>{currentSection.title}</h2>
            <p>{currentSection.summary}</p>
            {authNotice ? <p className="temporary-password">{authNotice}</p> : null}
            {appError ? <p className="form-error">{appError}</p> : null}
            {adminNotice && isAdmin ? <p className="temporary-password">{adminNotice}</p> : null}
            {workflowNotice && (pathname === '/dashboard' || pathname === '/reviews') ? (
              <p className="temporary-password">{workflowNotice}</p>
            ) : null}
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

        {pathname === '/dashboard'
          ? renderDashboard()
          : pathname === '/reviews'
            ? renderReviews()
          : pathname === '/employees'
            ? renderEmployees()
            : pathname === '/questions'
              ? renderQuestions()
              : pathname === '/assignments'
                ? renderAssignments()
                : pathname === '/archive'
                  ? renderArchive()
            : renderPlaceholderSection()}

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
      </div>
      </div>
    </>
  );
}

export default App;
