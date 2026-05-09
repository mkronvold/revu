import type {
  AuthSession,
  Employee,
  EmployeeAdmin,
  FoundationSnapshot,
  QuestionSet,
  QuestionTarget,
  ReviewPeriod,
} from '@revu/contracts';
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';

import {
  ApiClientError,
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
  exportAssignmentsFromApi,
  exportQuestionSetsFromApi,
  importAssignmentsFromApi,
  importQuestionSetsFromApi,
  saveAssignmentToApi,
  saveQuestionSetToApi,
  saveReviewPeriodToApi,
  toggleReviewPeriodArchiveInApi,
  type TransferFormat,
} from './reviewAdminApi';

const configuredCompanyName = import.meta.env.VITE_COMPANY_NAME?.trim();
const companyName = configuredCompanyName ? configuredCompanyName : null;
const workspaceTitle = companyName ? `Assessment workspace • ${companyName}` : 'Assessment workspace';

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

const sessionStorageKey = 'revu-session-token';
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

function App() {
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname));
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
  const [formError, setFormError] = useState('');
  const [appError, setAppError] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
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
  }, [hasEmployeeReadAccess, sessionToken, sessionUser]);

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

  const clearSession = () => {
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
      setPasswordStatus('Admin generated a temporary password for the next sign-in.');
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
              <button
                type="button"
                className="secondary-button"
                disabled={!selectedReviewPeriod || selectedReviewPeriod.status === 'archived' || isSavingReviewAdmin}
                onClick={() => openQuestionSetEditor(target)}
              >
                {questionSet ? 'Edit set' : 'Create set'}
        </button>
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
        <div>
          <dt>Read-only</dt>
          <dd>{questionSet?.isReadOnly ? 'Yes' : 'No'}</dd>
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
      <main className="admin-layout">
        <section className="card admin-sidebar-card">
          <div className="section-heading">
            <div>
              <p className="section-label">Review periods</p>
              <h3>Cycle setup</h3>
            </div>
              <button type="button" disabled={isSavingReviewAdmin} onClick={startAddingReviewPeriod}>
                Add period
              </button>
          </div>

          <div className="admin-list">
            {reviewAdmin.reviewPeriods.map((reviewPeriod) => (
              <button
                type="button"
                key={reviewPeriod.id}
                className={`admin-list-item${reviewPeriod.id === selectedReviewPeriodId ? ' admin-list-item-active' : ''}`}
                onClick={() => {
                  setSelectedReviewPeriodId(reviewPeriod.id);
                  setQuestionSetDraft(null);
                }}
              >
                <strong>{reviewPeriod.label}</strong>
                <small>
                  {reviewPeriod.key} • {reviewPeriod.status}
                </small>
              </button>
            ))}
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

          <div className="toolbar-note">
            <p>Changes on this screen save through the review-period admin API.</p>
          </div>
        </section>

        <section className="detail-panel">
          <div className="card">
            <div className="section-heading">
              <div>
                <p className="section-label">Selected review period</p>
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
          </div>

          <div className="content-grid admin-question-grid">
            {renderQuestionSetCard('self', selectedQuestionSets.self)}
            {renderQuestionSetCard('peer', selectedQuestionSets.peer)}
          </div>

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
        </section>
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
              <p className="section-label">Assignment matrix</p>
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
            <div>
              <dt>Rule</dt>
              <dd>Employee assessor matches the assigned peer reviewer.</dd>
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
          <div className="toolbar-note">
            <p>Assignment edits now save through the API and keep each employee assessor aligned with the assigned peer reviewer.</p>
          </div>
        </section>

        <section className="card">
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
                  <p className="muted-copy">Assessor stays aligned with the assigned peer reviewer.</p>
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
          <p className="section-label">Archive controls</p>
          <h3>Review period archive and restore</h3>
          <p>
            Archive actions happen at the review-period level. Archived question sets and assessments stay visible here as read-only history.
          </p>
        </section>

        <section className="card">
          <p className="section-label">Active review periods</p>
          <div className="archive-grid">
            {activeReviewPeriods.map((reviewPeriod) => {
              const summary = getReviewPeriodSummary(reviewAdmin, reviewPeriod.id);
              return (
                <article className="subcard" key={reviewPeriod.id}>
                  <div className="section-heading">
                    <div>
                      <h3>{reviewPeriod.label}</h3>
                      <p className="muted-copy">
                        {reviewPeriod.startDate} → {reviewPeriod.dueDate}
                      </p>
                    </div>
                    <button type="button" disabled={isSavingReviewAdmin} onClick={() => void handleArchiveToggle(reviewPeriod.id, true)}>
                      Archive
                    </button>
                  </div>
                  <dl className="detail-grid compact-detail-grid">
                    <div>
                      <dt>Question sets</dt>
                      <dd>{summary.questionSetCount}</dd>
                    </div>
                    <div>
                      <dt>Assignments</dt>
                      <dd>{summary.assignmentCount}</dd>
                    </div>
                    <div>
                      <dt>Assessments</dt>
                      <dd>{summary.assessmentCount}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>

        <section className="card">
          <p className="section-label">Archived review periods</p>
          <div className="archive-grid">
            {archivedReviewPeriods.map((reviewPeriod) => {
              const summary = getReviewPeriodSummary(reviewAdmin, reviewPeriod.id);
              return (
                <article className="subcard" key={reviewPeriod.id}>
                  <div className="section-heading">
                    <div>
                      <h3>{reviewPeriod.label}</h3>
                      <p className="muted-copy">
                        Archived at {reviewPeriod.archivedAt ?? 'unknown'} by{' '}
                        {getEmployeeName(reviewPeriod.archivedByEmployeeId)}
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
                  </div>
                  <dl className="detail-grid compact-detail-grid">
                    <div>
                      <dt>Question sets</dt>
                      <dd>{summary.questionSetCount}</dd>
                    </div>
                    <div>
                      <dt>Archived assessments</dt>
                      <dd>{summary.archivedAssessmentCount}</dd>
                    </div>
                    <div>
                      <dt>Reviewed</dt>
                      <dd>{summary.reviewedAssessmentCount}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    );
  };

  const renderDashboard = () => (
    <main className="dashboard-grid">
      <section className="card">
        <p className="section-label">My profile</p>
        <h3>{sessionUser?.fullName}</h3>
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
        <p className="section-label">Cycle status</p>
        <h3>{dashboardSnapshot?.dueLabel ?? 'Loading review cycle...'}</h3>
        <p>{dashboardSnapshot?.reviewSummary ?? 'Loading assessment summary...'}</p>
        {dashboardSnapshot?.adminSummary ? <p>{dashboardSnapshot.adminSummary}</p> : null}
      </section>

      <section className="card card-wide">
        <p className="section-label">Assessment queues</p>
        <div className="queue-grid">
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

      <section className="card card-wide">
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
    <main className="review-layout">
      <section className="card review-sidebar">
        <div className="section-heading">
          <div>
            <p className="section-label">Review queues</p>
            <h3>Manager and admin review work</h3>
          </div>
        </div>

        <div className="review-queue-stack">
          {reviewQueues.map((queue) => (
            <div className="subcard" key={queue.title}>
              <h3>{queue.title}</h3>
              {queue.items.length ? (
                <div className="admin-list">
                  {queue.items.map((item) => (
                    <button
                      type="button"
                      className={`admin-list-item${item.assessmentId === selectedReviewAssessmentId ? ' admin-list-item-active' : ''}`}
                      key={item.assessmentId}
                      onClick={() => setSelectedReviewAssessmentId(item.assessmentId)}
                    >
                      <strong>{item.title}</strong>
                      <small>{item.statusLabel}</small>
                      <span>{item.detail}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">No items in this queue right now.</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="detail-panel">
        {selectedReviewPanel ? (
          <>
            <section className="card">
              <div className="section-heading">
                <div>
                  <p className="section-label">Review panel</p>
                  <h3>{selectedReviewPanel.title}</h3>
                </div>
                <span className="pill">{selectedReviewPanel.statusLabel}</span>
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
              </dl>
            </section>

            <section className="card">
              <p className="section-label">Responses</p>
              <div className="question-list">
                {selectedReviewPanel.questions.map((question) => (
                  <article className="subcard" key={question.questionId}>
                    <strong>
                      #{question.order} {question.prompt}
                    </strong>
                    <small className="muted-copy">
                      {question.type}
                      {question.category ? ` • ${question.category}` : ''}
                    </small>
                    <p>{question.response || 'No response provided yet.'}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="card">
              <p className="section-label">Review notes</p>
              <label className="stack-form">
                <span>Manager or admin notes</span>
                <textarea
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
              <div className="action-row">
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
            </section>

            <section className="card">
              <div className="section-heading">
                <div>
                  <p className="section-label">Reassignment controls</p>
                  <h3>Update manager and peer reviewer routing</h3>
                </div>
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
                  <span>{selectedReviewPanel.canReassignAssessor ? 'Peer reviewer' : 'Peer reviewer'}</span>
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
              <p className="muted-copy">
                Reassignments update the employee relationship and future peer-review routing without rewriting existing authored responses.
              </p>
              <div className="action-row">
                <button
                  type="button"
                  disabled={selectedReviewPanel.isArchived || isSavingAssessmentWorkflow}
                  onClick={() => void handleReassignReview()}
                >
                  Save reassignment
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
      </section>
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
              <dd>{selectedEmployeeDetail?.auth.lastPasswordChangeAt ?? 'Not set'}</dd>
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
            {isAdmin ? (
              <button type="button" className="secondary-button" onClick={markEmployeeInactive}>
                Remove
              </button>
            ) : null}
          </div>
        </div>

        {isAdmin && selectedEmployeeDetail ? (
          <div className="card">
            <p className="section-label">Password management</p>
            <h3>Admin password controls</h3>
            <p>
              {selectedEmployeeDetail.auth.passwordConfigured
                ? 'This account can sign in with API-backed credentials.'
                : 'This account still needs a password set before first sign-in.'}
            </p>
            <p className="muted-copy">
              Last updated: {selectedEmployeeDetail.auth.lastPasswordChangeAt ?? 'Not set'}
            </p>
            {passwordStatus ? <p className="temporary-password">{passwordStatus}</p> : null}
            {temporaryPassword ? (
              <p className="temporary-password">Temporary password: {temporaryPassword}</p>
            ) : null}
            <label>
              Set password
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
              <button type="button" className="secondary-button" onClick={handleResetPassword} disabled={isUpdatingPassword}>
                Reset Password
              </button>
            </div>
          </div>
        ) : null}
      </section>
    );
  };

  const renderEmployees = () => (
    <main className="employees-layout">
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="section-label">Active employees</p>
            <h3>Employee roster</h3>
          </div>
          {isAdmin ? (
            <button type="button" onClick={startAddingEmployee}>
              Add employee
            </button>
          ) : null}
        </div>

        {isLoadingEmployees ? <p className="muted-copy">Loading employee roster...</p> : null}

        <div className="employee-roster-group">
          {activeEmployees.map((employee) => (
            <button
              type="button"
              className={`employee-row${employee.id === selectedEmployeeId ? ' employee-row-active' : ''}`}
              key={employee.id}
              onClick={() => {
                setSelectedEmployeeId(employee.id);
                resetEditingState();
              }}
            >
              <span>{employee.fullName}</span>
              <small>
                {employee.role} • {employee.username}
              </small>
            </button>
          ))}
        </div>

        <p className="section-label roster-subheading">Inactive employees</p>
        <div className="employee-roster-group">
          {inactiveEmployees.map((employee) => (
            <button
              type="button"
              className={`employee-row${employee.id === selectedEmployeeId ? ' employee-row-active' : ''}`}
              key={employee.id}
              onClick={() => {
                setSelectedEmployeeId(employee.id);
                resetEditingState();
              }}
            >
              <span>{employee.fullName}</span>
              <small>
                {employee.role} • {employee.username}
              </small>
            </button>
          ))}
        </div>

        <div className="toolbar-note">
          <p>Import and export remain out of scope while this slice focuses on the integrated auth and employee API workflow.</p>
        </div>
      </section>

      {renderEmployeeDetail()}
    </main>
  );

  if (!sessionUser) {
    return (
      <div className="login-shell">
        <section className="login-card">
          <p className="eyebrow">Revu</p>
          <h1>Sign in to the assessment workspace</h1>
          <p className="login-copy">
            Use the API-backed local username and password flow to reach the integrated dashboard and employee administration screens.
          </p>

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
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Revu</p>
          <a className="brand-title-link" href={defaultPath} onClick={(event) => navigate(event, defaultPath)}>
            <h1>{workspaceTitle}</h1>
          </a>
          <p className="brand-copy">API-backed auth, employee administration, and dashboard flows on top of the shell foundation.</p>
        </div>

        <div className="session-card">
          <p className="section-label">Signed in as</p>
          <h2>{sessionUser.fullName}</h2>
          <p>
            {sessionUser.role} • {sessionUser.username}
          </p>
          <button type="button" className="secondary-button" onClick={handleLogout}>
            Sign out
          </button>
        </div>

        <nav aria-label="Primary">
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
                      <small>{section.audience.join(' • ')}</small>
                    </a>
                  ))}
              </div>
            </section>
          ))}
        </nav>

        <div className="sidebar-note">
          <p className="sidebar-note-title">Terminology guardrails</p>
          <p>{routeLegend.assessments}</p>
          <p>{routeLegend.reviews}</p>
        </div>
      </aside>

      <div className="content">
        <header className="hero card">
          <div className="hero-copy">
            <span className="badge">Integrated API auth mode</span>
            <h2>{currentSection.title}</h2>
            <p>{currentSection.summary}</p>
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
      </div>
    </div>
  );
}

export default App;
