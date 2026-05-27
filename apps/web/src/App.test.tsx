/** @vitest-environment jsdom */

import type { AuthSession, BackupStatusResponse, FoundationSnapshot } from '@revu/contracts';
import { adminEmployeeExample, adminLoginExample, employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => {
  class ApiClientError extends Error {
    constructor(
      message: string,
      readonly statusCode: number,
    ) {
      super(message);
      this.name = 'ApiClientError';
    }
  }

  return {
    ApiClientError,
    acceptAssessment: vi.fn(),
    activateQuestionSet: vi.fn(),
    archiveReviewPeriod: vi.fn(),
    apiUnavailableEventName: 'revu:api-unavailable',
    checkApiHealth: vi.fn(),
    changePassword: vi.fn(),
    clearReadyToStartAssessments: vi.fn(),
    concludeAssessmentSet: vi.fn(),
    createAssignment: vi.fn(),
    createAssessment: vi.fn(),
    createEmployee: vi.fn(),
    createStoredBackup: vi.fn(),
    createQuestionSet: vi.fn(),
    createReviewPeriod: vi.fn(),
    deleteAssessmentByAdmin: vi.fn(),
    deleteAssignment: vi.fn(),
    deleteEmployee: vi.fn(),
    deleteReviewPeriod: vi.fn(),
    deleteStoredBackup: vi.fn(),
    downloadStoredBackup: vi.fn(),
    exportBackup: vi.fn(),
    exportAssignments: vi.fn(),
    exportLocalUsers: vi.fn(),
    exportQuestionSets: vi.fn(),
    getApiIndex: vi.fn(),
    getEmployee: vi.fn(),
    getBackupStatus: vi.fn(),
    getFoundation: vi.fn(),
    importAssignments: vi.fn(),
    importLocalUsers: vi.fn(),
    importQuestionSets: vi.fn(),
    listAssessments: vi.fn(),
    listEmployees: vi.fn(),
    listQuestionCategories: vi.fn(),
    listStoredBackups: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    markAssessmentSetReadyForMeeting: vi.fn(),
    me: vi.fn(),
    reassignAssessment: vi.fn(),
    rejectAssessmentToDraft: vi.fn(),
    resetEmployeePassword: vi.fn(),
    restoreBackup: vi.fn(),
    restoreStoredBackup: vi.fn(),
    reviewAssessment: vi.fn(),
    saveAssessmentDraft: vi.fn(),
    scheduleAssessmentSet: vi.fn(),
    setEmployeePassword: vi.fn(),
    syncAssessmentsToAssignments: vi.fn(),
    submitAssessment: vi.fn(),
    unarchiveReviewPeriod: vi.fn(),
    updateAssessmentByAdmin: vi.fn(),
    updateAssignment: vi.fn(),
    updateBackupStatus: vi.fn(),
    updateEmployee: vi.fn(),
    updateOwnProfile: vi.fn(),
    updateQuestionCategories: vi.fn(),
    updateQuestionSet: vi.fn(),
    updateReviewPeriod: vi.fn(),
    uploadStoredBackup: vi.fn(),
    updateWorkflowSettings: vi.fn(),
  };
});

import App from './App';
import {
  activateQuestionSet,
  acceptAssessment,
  archiveReviewPeriod,
  changePassword,
  checkApiHealth,
  clearReadyToStartAssessments,
  concludeAssessmentSet,
  createStoredBackup,
  createQuestionSet,
  deleteAssessmentByAdmin,
  deleteEmployee,
  deleteReviewPeriod,
  deleteStoredBackup,
  downloadStoredBackup,
  exportAssignments,
  exportLocalUsers,
  exportQuestionSets,
  getApiIndex,
  getBackupStatus,
  getEmployee,
  getFoundation,
  importAssignments,
  importLocalUsers,
  importQuestionSets,
  listEmployees,
  listQuestionCategories,
  listStoredBackups,
  login,
  markAssessmentSetReadyForMeeting,
  me,
  rejectAssessmentToDraft,
  resetEmployeePassword,
  restoreStoredBackup,
  saveAssessmentDraft,
  submitAssessment,
  updateBackupStatus,
  updateEmployee,
  updateOwnProfile,
  updateQuestionCategories,
  updateReviewPeriod,
  uploadStoredBackup,
  updateWorkflowSettings,
} from './api';

function cloneQuestionSlice() {
  const snapshot = structuredClone(foundationSnapshotExample);
  snapshot.questionSets[0] = {
    ...snapshot.questionSets[0]!,
    title: 'Self questions',
    headerMarkdown: '**Lead with clarity**\nBring examples.',
    questions: [
      {
        ...snapshot.questionSets[0]!.questions[0]!,
        category: 'Impact',
        prompt: 'How did you **lead**?\nShare examples.',
      },
      ...snapshot.questionSets[0]!.questions.slice(1),
    ],
  };

  return snapshot;
}

function createBackupExample() {
  const { employees: _employees, ...reviewData } = structuredClone(foundationSnapshotExample);
  return {
    version: 1 as const,
    exportedAt: '2026-06-02T15:30:00.000Z',
    users: {
      mode: 'preserve-passwords' as const,
      itemCount: 1,
      items: [
        {
          id: adminEmployeeExample.item.id,
          username: adminEmployeeExample.item.username,
          fullName: adminEmployeeExample.item.fullName,
          email: adminEmployeeExample.item.email,
          role: adminEmployeeExample.item.role,
          status: adminEmployeeExample.item.status,
          managerUsername: null,
          assessor1Username: null,
          assessor2Username: null,
          reviewer1Username: null,
          reviewer2Username: null,
          password: '0123456789abcdef0123456789abcdef:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          credentialKind: 'password-hash' as const,
          passwordResetRequired: false,
        },
      ],
    },
    reviewData,
  };
}

function createBackupStatusExample(overrides: Partial<BackupStatusResponse> = {}): BackupStatusResponse {
  return {
    automaticBackupsEnabled: true,
    schedule: 'daily' as const,
    retentionCount: 14,
    lastBackupAt: '2026-06-01T12:00:00.000Z',
    lastRestoreAt: null,
    defaultUserExportMode: 'preserve-passwords' as const,
    replaceStrategy: 'replace' as const,
    supportedFormats: ['json'] as const,
    supportedSchedules: ['1hr', '3hr', '6hr', '12hr', 'daily', 'weekly'] as const,
    supportedRestoreModes: ['replace'] as const,
    supportedRestoreScopes: ['all', 'users', 'questions', 'reviews'] as const,
    supportedUserExportModes: ['rotate-passcodes', 'preserve-passwords'] as const,
    ...overrides,
  };
}

function createStoredBackupFileExample(overrides: Partial<{ name: string; storedAt: string; sizeBytes: number }> = {}) {
  return {
    name: 'revu-backup-20260602T153000Z.json',
    storedAt: '2026-06-02T15:30:00.000Z',
    sizeBytes: 4096,
    ...overrides,
  };
}

const mannyManager = employeesListExample.items.find((employee) => employee.username === 'manny.manager')!;

function createManagerSession(): AuthSession {
  return {
    ...adminLoginExample.session,
    permissions: ['employees:read', 'assessments:read', 'assessments:accept', 'assessments:review', 'assessments:reassign'],
    user: mannyManager,
  };
}

function createEmployeeSession(): AuthSession {
  return {
    ...adminLoginExample.session,
    permissions: ['assessments:read'],
    user: employeesListExample.items.find((employee) => employee.username === 'elliot.employee')!,
  };
}

function createAssessmentLifecycleSnapshot(
  reviewState: FoundationSnapshot['assessments'][number]['reviewState'],
): FoundationSnapshot {
  const snapshot = cloneQuestionSlice();

  snapshot.assessments = snapshot.assessments.map((assessment) => {
    if (assessment.reviewPeriodId !== 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') {
      return assessment;
    }

    const baseAssessment = {
      ...assessment,
      reviewState,
      submittedAt: null,
      acceptedAt: null,
      acceptedByEmployeeId: null,
      readyForMeetingAt: null,
      scheduledAt: null,
      scheduledByEmployeeId: null,
      reviewer1Notes: null,
      reviewer1CompletedAt: null,
      reviewer1CompletedByEmployeeId: null,
      reviewer2Notes: null,
      reviewer2CompletedAt: null,
      reviewer2CompletedByEmployeeId: null,
      concludedAt: null,
      concludedByEmployeeId: null,
      reviewedAt: null,
      reviewedByEmployeeId: null,
      managerNotes: null,
      isReadOnly: reviewState !== 'new' && reviewState !== 'draft',
    };

    switch (reviewState) {
      case 'new':
        return {
          ...baseAssessment,
          responses: [],
        };
      case 'draft':
        return {
          ...baseAssessment,
          responses:
            assessment.target === 'self'
              ? [
                  {
                    questionId: 'aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa',
                    order: 1,
                    response: 'somewhat agree',
                  },
                  {
                    questionId: 'aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa',
                    order: 2,
                    response: '',
                  },
                ]
              : assessment.responses,
        };
      case 'submitted':
        return {
          ...baseAssessment,
          submittedAt: '2026-02-15T09:30:00.000Z',
        };
      case 'accepted':
        return {
          ...baseAssessment,
          submittedAt: '2026-02-15T09:30:00.000Z',
          acceptedAt: '2026-02-16T08:00:00.000Z',
          acceptedByEmployeeId: mannyManager.id,
          managerNotes: 'Ready for meeting.',
        };
      case 'ready_for_meeting':
        return {
          ...baseAssessment,
          submittedAt: '2026-02-15T09:30:00.000Z',
          acceptedAt: '2026-02-16T08:00:00.000Z',
          acceptedByEmployeeId: mannyManager.id,
          readyForMeetingAt: '2026-02-17T08:00:00.000Z',
          managerNotes: 'Ready for meeting.',
        };
      case 'scheduled':
        return {
          ...baseAssessment,
          submittedAt: '2026-02-15T09:30:00.000Z',
          acceptedAt: '2026-02-16T08:00:00.000Z',
          acceptedByEmployeeId: mannyManager.id,
          readyForMeetingAt: '2026-02-17T08:00:00.000Z',
          scheduledAt: '2026-02-18T09:00:00.000Z',
          scheduledByEmployeeId: mannyManager.id,
          managerNotes: 'Ready for meeting.',
        };
      case 'concluded':
      case 'reviewed':
        return {
          ...baseAssessment,
          reviewState: 'concluded',
          submittedAt: '2026-02-15T09:30:00.000Z',
          acceptedAt: '2026-02-16T08:00:00.000Z',
          acceptedByEmployeeId: mannyManager.id,
          readyForMeetingAt: '2026-02-17T08:00:00.000Z',
          scheduledAt: '2026-02-18T09:00:00.000Z',
          scheduledByEmployeeId: mannyManager.id,
          reviewer1Notes: 'Reviewer 1 completed the follow-up.',
          reviewer1CompletedAt: '2026-02-19T11:00:00.000Z',
          reviewer1CompletedByEmployeeId: adminLoginExample.session.user.id,
          reviewer2Notes: 'Reviewer 2 confirmed the outcome.',
          reviewer2CompletedAt: '2026-02-19T12:00:00.000Z',
          reviewer2CompletedByEmployeeId: mannyManager.id,
          concludedAt: '2026-02-19T12:00:00.000Z',
          concludedByEmployeeId: mannyManager.id,
          managerNotes: 'Ready for meeting.',
        };
    }
  });

  return snapshot;
}

function createEmployeeDetail(employeeId: string) {
  const employee = employeesListExample.items.find((candidate) => candidate.id === employeeId)!;
  return {
    item: {
      ...employee,
      auth: {
        passwordConfigured: true,
        passwordResetRequired: false,
        lastPasswordChangeAt: '2026-01-15T12:00:00.000Z',
      },
    },
  };
}

async function flushRender() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function setFieldValue(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const prototype =
    field instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : field instanceof window.HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

async function waitFor(check: () => boolean, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (check()) {
      return;
    }

    await flushRender();
  }

  throw new Error('Timed out waiting for App to finish rendering.');
}

describe('questions screen', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    if (!HTMLElement.prototype.scrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: vi.fn(),
      });
    }
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.pushState(null, '', '/questions');
    vi.mocked(getApiIndex).mockResolvedValue({
      name: 'revu-api',
      version: '0.1.0',
      seededAccountsAvailable: true,
      resources: [],
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.resetAllMocks();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('links the Revu title to GitHub, uses the new sign-in heading, and hides seeded accounts when unavailable', async () => {
    vi.mocked(getApiIndex).mockResolvedValue({
      name: 'revu-api',
      version: '0.1.0',
      seededAccountsAvailable: false,
      resources: [],
    });

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Sign into') ?? false);

    const eyebrowLink = container.querySelector('a.eyebrow-link') as HTMLAnchorElement | null;
    const usernameInput = container.querySelector('input') as HTMLInputElement | null;
    expect(eyebrowLink).toBeTruthy();
    expect(eyebrowLink?.getAttribute('href')).toBe('https://github.com/mkronvold/revu');
    expect(usernameInput?.value).toBe('');
    expect(container.textContent).toContain('Sign into');
    expect(container.textContent).toContain('Revu');
    expect(container.textContent).not.toContain('Use the API-backed local username and password flow');
    expect(container.textContent).not.toContain('Seeded API accounts');
  });

  it('prefills the sign-in username from local storage and saves the last successful username', async () => {
    vi.mocked(getApiIndex).mockResolvedValue({
      name: 'revu-api',
      version: '0.1.0',
      seededAccountsAvailable: false,
      resources: [],
    });
    vi.mocked(login).mockResolvedValue(adminLoginExample);
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.localStorage.setItem('revu-login-username', 'Last.User');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Sign into') ?? false);

    const usernameInput = container.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null;
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement | null;
    const signInButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Sign in');

    expect(usernameInput?.value).toBe('Last.User');
    expect(passwordInput?.value).toBe('');

    await act(async () => {
      if (usernameInput) {
        setFieldValue(usernameInput, 'Pat.Peer');
      }
      if (passwordInput) {
        setFieldValue(passwordInput, 'PeerPass123!');
      }
      signInButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => window.location.pathname === '/dashboard');

    expect(login).toHaveBeenCalledWith({
      username: 'Pat.Peer',
      password: 'PeerPass123!',
    });
    expect(window.localStorage.getItem('revu-login-username')).toBe('Pat.Peer');
  });

  it('renders markdown, opens the question-set dialog from the card, and edits questions in a nested dialog', async () => {
    const questionSlice = cloneQuestionSlice();
    questionSlice.questionSets[0] = {
      ...questionSlice.questionSets[0]!,
      questions: questionSlice.questionSets[0]!.questions.map((question, index) =>
        index === 0
          ? {
              ...question,
              category: '',
            }
          : question,
      ),
    };
    const session: AuthSession = {
      ...adminLoginExample.session,
      permissions: [
        ...new Set<AuthSession['permissions'][number]>([
          ...adminLoginExample.session.permissions,
          'employees:read',
          'questionSets:update',
        ]),
      ],
    };

    vi.mocked(me).mockResolvedValue({ session });
    vi.mocked(getFoundation).mockResolvedValue(questionSlice);
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockResolvedValue(adminEmployeeExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(updateQuestionCategories).mockResolvedValue({ items: ['Growth', 'Impact', 'Strategy', 'Teamwork'] });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Self questions') ?? false);

    const reviewPeriodCard = container.querySelector('.review-period-card');
    expect(reviewPeriodCard?.textContent).not.toContain('Export JSON');
    expect(reviewPeriodCard?.textContent).not.toContain('Export CSV');
    expect(reviewPeriodCard?.textContent).not.toContain('Import JSON');
    expect(reviewPeriodCard?.textContent).not.toContain('Import CSV');
    expect(reviewPeriodCard?.textContent).not.toContain('Add period');
    expect(reviewPeriodCard?.textContent).not.toContain('Edit period');
    expect(reviewPeriodCard?.textContent).toContain('Edit question categories');

    const questionSetCard = container.querySelector('.question-set-card');
    expect(questionSetCard?.innerHTML).toContain('<strong>Lead with clarity</strong>');
    expect(questionSetCard?.innerHTML).toContain('<br');

    const prompt = questionSetCard?.querySelector('.question-prompt-markdown');
    expect(prompt?.innerHTML).toContain('<strong>lead</strong>');
    expect(prompt?.innerHTML).toContain('<br');

    const questionSetCards = Array.from(container.querySelectorAll('.question-set-card'));
    expect(questionSetCards).toHaveLength(2);
    expect(questionSetCards.every((card) => card.getAttribute('role') === 'button')).toBe(true);
    const editButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Edit set');
    expect(editButton).toBeUndefined();

    await act(async () => {
      questionSetCards[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const editor = container.querySelector('.question-set-dialog');
    expect(editor).toBeTruthy();
    expect(container.querySelector('#question-set-editor')).toBeNull();

    const fieldOrder = Array.from(editor?.querySelectorAll('.question-set-dialog-fields > label') ?? []).map(
      (field) => field.childNodes[0]?.textContent?.trim(),
    );
    expect(fieldOrder).toEqual(['Title', 'Header markdown', 'Footer markdown']);

    const questionRow = editor?.querySelector('.question-set-dialog-row-button');
    expect(questionRow).toBeTruthy();

    await act(async () => {
      questionRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const questionEditor = container.querySelector('.question-edit-dialog');
    expect(questionEditor).toBeTruthy();
    expect(Array.from(questionEditor?.querySelectorAll('button') ?? []).map((button) => button.textContent)).toEqual([
      'Close',
      'Save question',
      'Cancel',
    ]);
    expect(questionEditor?.querySelector('.question-edit-preview')).toBeNull();

    const categorySelect = questionEditor?.querySelector('select[aria-label="Question category"]') as HTMLSelectElement | null;
    const questionPromptField = questionEditor?.querySelector('.question-prompt-field textarea') as HTMLTextAreaElement | null;
    expect(categorySelect).toBeTruthy();
    expect(questionPromptField).toBeTruthy();
    expect(questionEditor?.querySelector('.question-edit-response-preview .question-prompt-markdown')?.textContent).toContain(
      'How did you lead?',
    );
    expect(categorySelect?.value).toBe('');
    expect(Array.from(categorySelect?.options ?? []).map((option) => option.textContent)).toEqual([
      'No category',
      'Growth',
      'Impact',
      'Teamwork',
      'New category…',
    ]);
    const initialHelperInputs = Array.from(questionEditor?.querySelectorAll('.question-response-helper-option input') ?? []);
    expect(initialHelperInputs).toHaveLength(5);
    expect(initialHelperInputs.every((input) => (input as HTMLInputElement).type === 'radio')).toBe(true);
    expect(questionEditor?.querySelector('.question-response-helper')?.textContent).toContain('Strongly agree');
    expect(questionEditor?.querySelector('.question-response-helper')?.textContent).toContain('Neutral');
    expect(questionEditor?.querySelector('.question-response-helper')?.textContent).toContain('Strongly disagree');

    await act(async () => {
      setFieldValue(categorySelect!, '__new-question-category__');
      await Promise.resolve();
    });
    await flushRender();

    const newCategoryDialog = container.querySelector('.question-category-dialog');
    expect(newCategoryDialog).toBeTruthy();

    const newCategoryInput = newCategoryDialog?.querySelector('input[aria-label="New category name"]') as HTMLInputElement | null;
    expect(newCategoryInput).toBeTruthy();
    await act(async () => {
      setFieldValue(newCategoryInput!, 'Strategy');
      await Promise.resolve();
    });
    await flushRender();

    const saveCategoryButton = Array.from(newCategoryDialog?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Save category',
    );
    expect(saveCategoryButton).toBeTruthy();
    await act(async () => {
      saveCategoryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const updatedCategorySelect = container.querySelector('select[aria-label="Question category"]') as HTMLSelectElement | null;
    expect(updatedCategorySelect?.value).toBe('Strategy');

    const responseTypeField = questionEditor?.querySelector('.question-response-type-field select') as HTMLSelectElement | null;
    const saveQuestionButton = Array.from(questionEditor?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Save question',
    ) as HTMLButtonElement | undefined;
    const cancelQuestionButton = Array.from(questionEditor?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Cancel',
    );
    expect(responseTypeField).toBeTruthy();

    await act(async () => {
      setFieldValue(questionPromptField!, 'Canceled question prompt');
      await Promise.resolve();
    });
    await flushRender();

    expect(saveQuestionButton?.disabled).toBe(false);

    await act(async () => {
      cancelQuestionButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(confirmSpy).toHaveBeenCalledWith('Close this question without saving your changes?');
    expect(container.querySelector('.question-edit-dialog')).toBeNull();

    const reopenedQuestionRow = container.querySelector('.question-set-dialog-row-button');
    expect(reopenedQuestionRow).toBeTruthy();

    await act(async () => {
      reopenedQuestionRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const reopenedEditor = container.querySelector('.question-edit-dialog');
    expect(reopenedEditor).toBeTruthy();
    const reopenedPromptField = reopenedEditor?.querySelector('.question-prompt-field textarea') as HTMLTextAreaElement | null;
    const reopenedResponseTypeField = reopenedEditor?.querySelector(
      '.question-response-type-field select',
    ) as HTMLSelectElement | null;
    expect(reopenedPromptField?.value).not.toBe('Canceled question prompt');

    await act(async () => {
      setFieldValue(reopenedResponseTypeField!, 'ranking');
      await Promise.resolve();
    });
    await flushRender();

    const rankingHelperInputs = Array.from(reopenedEditor?.querySelectorAll('.question-response-helper-option input') ?? []);
    expect(rankingHelperInputs).toHaveLength(5);
    expect(rankingHelperInputs.every((input) => (input as HTMLInputElement).type === 'radio')).toBe(true);
    expect(reopenedEditor?.querySelector('.question-response-helper')?.textContent).toContain("Don't know");

    await act(async () => {
      setFieldValue(reopenedResponseTypeField!, 'narrative');
      await Promise.resolve();
    });
    await flushRender();

    const narrativeHelperInputs = Array.from(reopenedEditor?.querySelectorAll('.question-response-helper-option input') ?? []);
    expect(narrativeHelperInputs).toHaveLength(0);
    expect(reopenedEditor?.querySelector('.question-response-helper')?.textContent).toContain(
      'Use a written self-rating with supporting context and examples.',
    );
    expect(reopenedEditor?.querySelector('.question-response-helper textarea')).toBeTruthy();

    await act(async () => {
      setFieldValue(reopenedPromptField!, 'Saved question prompt');
      await Promise.resolve();
    });
    await flushRender();

    const saveUpdatedQuestionButton = Array.from(reopenedEditor?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Save question',
    );
    expect(saveUpdatedQuestionButton).toBeTruthy();

    await act(async () => {
      saveUpdatedQuestionButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(container.querySelector('.question-edit-dialog')).toBeNull();
    expect(container.querySelector('.question-set-dialog-row-button')?.textContent).toContain('Saved question prompt');
  });

  it('shows end, assessment due, and review due fields when editing a review period from the review period page', async () => {
    window.history.replaceState(null, '', '/review-period');

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Growth', 'Impact', 'Teamwork'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Review period management') ?? false);

    const editPeriodButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Edit period');
    expect(editPeriodButton).toBeTruthy();

    await act(async () => {
      editPeriodButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(container.textContent).toContain('End date');
    expect(container.textContent).toContain('Assessment Due Date');
    expect(container.textContent).toContain('Review Due Date');
    expect(container.textContent).not.toContain('Due date');
  });

  it('removes a review period with a confirmation summary from the review period page', async () => {
    window.history.replaceState(null, '', '/review-period');

    const initialSnapshot = cloneQuestionSlice();
    const reviewPeriodToDelete = initialSnapshot.reviewPeriods[0]!;
    const removedQuestionSetCount = initialSnapshot.questionSets.filter(
      (questionSet) => questionSet.reviewPeriodId === reviewPeriodToDelete.id,
    ).length;
    const removedAssessmentCount = initialSnapshot.assessments.filter(
      (assessment) => assessment.reviewPeriodId === reviewPeriodToDelete.id,
    ).length;
    const removedAssignmentCount = initialSnapshot.assignments.filter(
      (assignment) => assignment.reviewPeriodId === reviewPeriodToDelete.id,
    ).length;
    const refreshedSnapshot = structuredClone(initialSnapshot);
    refreshedSnapshot.reviewPeriods = refreshedSnapshot.reviewPeriods.filter((period) => period.id !== reviewPeriodToDelete.id);
    refreshedSnapshot.questionSets = refreshedSnapshot.questionSets.filter(
      (questionSet) => questionSet.reviewPeriodId !== reviewPeriodToDelete.id,
    );
    refreshedSnapshot.assessments = refreshedSnapshot.assessments.filter(
      (assessment) => assessment.reviewPeriodId !== reviewPeriodToDelete.id,
    );
    refreshedSnapshot.assignments = refreshedSnapshot.assignments.filter(
      (assignment) => assignment.reviewPeriodId !== reviewPeriodToDelete.id,
    );

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValueOnce(initialSnapshot).mockResolvedValueOnce(refreshedSnapshot);
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockResolvedValue(adminEmployeeExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Growth', 'Impact', 'Teamwork'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());
    vi.mocked(deleteReviewPeriod).mockResolvedValue({
      reviewPeriodId: reviewPeriodToDelete.id,
      label: reviewPeriodToDelete.label,
      deleted: true,
      questionSetCount: removedQuestionSetCount,
      assessmentCount: removedAssessmentCount,
      assignmentCount: removedAssignmentCount,
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Review period management') ?? false);

    const removePeriodButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Remove period',
    );
    expect(removePeriodButton).toBeTruthy();

    await act(async () => {
      removePeriodButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const confirmationMessage = confirmSpy.mock.calls[0]?.[0] ?? '';
    expect(confirmationMessage).toContain('This permanently deletes:');
    expect(confirmationMessage).toContain(`- ${removedQuestionSetCount} question set`);
    expect(confirmationMessage).toContain(`- ${removedAssessmentCount} assessment`);
    expect(confirmationMessage).toContain(`- ${removedAssignmentCount} assignment`);
    expect(deleteReviewPeriod).toHaveBeenCalledWith('session-token', reviewPeriodToDelete.id);
    await waitFor(() => container.textContent?.includes(`Removed ${reviewPeriodToDelete.label}.`) ?? false);
  });

  it('keeps the make active button live and to the left of the picker for inactive review periods', async () => {
    const inactiveSnapshot = cloneQuestionSlice();
    inactiveSnapshot.reviewPeriods[1] = {
      ...inactiveSnapshot.reviewPeriods[1]!,
      status: 'inactive',
      archivedAt: null,
      archivedByEmployeeId: null,
    };
    const activatedSnapshot = structuredClone(inactiveSnapshot);
    activatedSnapshot.reviewPeriods[0] = {
      ...activatedSnapshot.reviewPeriods[0]!,
      status: 'inactive',
    };
    activatedSnapshot.reviewPeriods[1] = {
      ...activatedSnapshot.reviewPeriods[1]!,
      status: 'active',
    };

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation)
      .mockResolvedValueOnce(inactiveSnapshot)
      .mockResolvedValueOnce(activatedSnapshot);
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockResolvedValue(adminEmployeeExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Growth', 'Impact', 'Teamwork'] });
    vi.mocked(updateReviewPeriod).mockResolvedValue({
      item: activatedSnapshot.reviewPeriods[1]!,
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Self questions') ?? false);

    const reviewPeriodSelect = container.querySelector('.review-period-picker select') as HTMLSelectElement | null;
    expect(reviewPeriodSelect).toBeTruthy();

    await act(async () => {
      setFieldValue(reviewPeriodSelect!, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      await flushRender();
    });

    const makeActiveButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Make active',
    );
    expect(makeActiveButton).toBeTruthy();
    expect(makeActiveButton?.hasAttribute('disabled')).toBe(false);
    expect(makeActiveButton?.parentElement?.className).toContain('review-period-picker-row');
    expect(makeActiveButton?.parentElement?.parentElement?.className).toContain('review-period-heading');
    expect(makeActiveButton?.nextElementSibling?.className).toContain('review-period-picker');

    await act(async () => {
      makeActiveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(updateReviewPeriod).toHaveBeenCalledWith('session-token', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', {
      key: '2025',
      label: '2025 Annual Review',
      startDate: '2025-01-01',
      dueDate: '2025-03-07',
      assessmentDueDate: '2025-02-21',
      reviewDueDate: '2025-02-28',
      status: 'active',
    });
    await waitFor(() => container.textContent?.includes('Made 2025 Annual Review the active review period.') ?? false);
  });

  it('archives inactive review periods directly from lifecycle controls', async () => {
    let currentFoundation = cloneQuestionSlice();
    currentFoundation.reviewPeriods[1] = {
      ...currentFoundation.reviewPeriods[1]!,
      status: 'inactive',
      archivedAt: null,
      archivedByEmployeeId: null,
    };
    const reviewPeriodToArchive = currentFoundation.reviewPeriods[1]!;

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockImplementation(async () => structuredClone(currentFoundation));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockResolvedValue(adminEmployeeExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Growth', 'Impact', 'Teamwork'] });
    vi.mocked(archiveReviewPeriod).mockImplementation(async (_token, reviewPeriodId) => {
      currentFoundation = {
        ...currentFoundation,
        reviewPeriods: currentFoundation.reviewPeriods.map((reviewPeriod) =>
          reviewPeriod.id === reviewPeriodId
            ? {
                ...reviewPeriod,
                status: 'archived',
                archivedAt: '2026-06-01T12:00:00.000Z',
                archivedByEmployeeId: adminEmployeeExample.item.id,
              }
            : reviewPeriod,
        ),
      };

      return {
        item: structuredClone(currentFoundation.reviewPeriods.find((reviewPeriod) => reviewPeriod.id === reviewPeriodId)!),
      };
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/review-period');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Review period lifecycle') ?? false);

    const inactiveSection = Array.from(container.querySelectorAll('.archive-section')).find((section) =>
      section.textContent?.includes('Manage inactive review periods'),
    );
    expect(inactiveSection?.textContent).toContain(reviewPeriodToArchive.label);

    const archiveButton = Array.from(inactiveSection?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Archive',
    );
    expect(archiveButton).toBeTruthy();

    await act(async () => {
      archiveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(archiveReviewPeriod).toHaveBeenCalledWith('session-token', reviewPeriodToArchive.id);
    await waitFor(() => container.textContent?.includes('Archived the review period in the API.') ?? false);
    expect(inactiveSection?.textContent).not.toContain(reviewPeriodToArchive.label);

    const archivedSection = Array.from(container.querySelectorAll('.archive-section')).find((section) =>
      section.textContent?.includes('Restore archived review periods'),
    );
    expect(archivedSection?.textContent).toContain(reviewPeriodToArchive.label);
    expect(archivedSection?.textContent).toContain('Unarchive');
  });

  it('shows disabled Archived and Active status buttons for archived and active review periods', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockResolvedValue(adminEmployeeExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Growth', 'Impact', 'Teamwork'] });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Self questions') ?? false);

    const activeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Active');
    expect(activeButton).toBeTruthy();
    expect(activeButton?.disabled).toBe(true);
    expect(activeButton?.className).toContain('review-period-status-button-active');

    const reviewPeriodSelect = container.querySelector('.review-period-picker select') as HTMLSelectElement | null;
    expect(reviewPeriodSelect).toBeTruthy();

    await act(async () => {
      setFieldValue(reviewPeriodSelect!, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      await flushRender();
    });

    const archivedButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Archived');
    expect(archivedButton).toBeTruthy();
    expect(archivedButton?.disabled).toBe(true);
  });

  it('edits persistent question categories from the review-period card', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockResolvedValue(adminEmployeeExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Growth', 'Teamwork'] });
    vi.mocked(updateQuestionCategories).mockResolvedValue({ items: ['Growth', 'Strategy', 'Teamwork'] });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Self questions') ?? false);

    const editCategoriesButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Edit question categories',
    );
    expect(editCategoriesButton).toBeTruthy();

    await act(async () => {
      editCategoriesButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const dialog = container.querySelector('.question-categories-dialog');
    expect(dialog).toBeTruthy();

    const inputs = Array.from(dialog?.querySelectorAll('input[aria-label^="Question category "]') ?? []) as HTMLInputElement[];
    expect(inputs.map((input) => input.value)).toEqual(['Growth', 'Teamwork']);

    const addButton = Array.from(dialog?.querySelectorAll('button') ?? []).find((button) => button.textContent === 'Add category');
    expect(addButton).toBeTruthy();

    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const updatedInputs = Array.from(
      container.querySelectorAll('.question-categories-dialog input[aria-label^="Question category "]'),
    ) as HTMLInputElement[];
    expect(updatedInputs).toHaveLength(3);

    await act(async () => {
      setFieldValue(updatedInputs[2]!, 'Strategy');
      await Promise.resolve();
    });
    await flushRender();

    const saveButton = Array.from(container.querySelectorAll('.question-categories-dialog button')).find(
      (button) => button.textContent === 'Save categories',
    );
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(updateQuestionCategories).toHaveBeenCalledWith('session-token', {
      items: ['Growth', 'Teamwork', 'Strategy'],
    });
    expect(container.querySelector('.question-categories-dialog')).toBeNull();
  });

  it('keeps review period management selection separate from the questions page', async () => {
    const reviewSnapshot = cloneQuestionSlice();
    const activeReviewPeriodId = reviewSnapshot.reviewPeriods[0]!.id;
    const alternateReviewPeriodId = reviewSnapshot.reviewPeriods[1]!.id;

    window.history.replaceState(null, '', '/questions');

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(reviewSnapshot);
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Growth', 'Impact', 'Teamwork'] });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Self questions') ?? false);

    const questionReviewPeriodSelect = container.querySelector('.review-period-card .review-period-picker select') as HTMLSelectElement | null;
    expect(questionReviewPeriodSelect).toBeTruthy();

    await act(async () => {
      setFieldValue(questionReviewPeriodSelect!, alternateReviewPeriodId);
      await flushRender();
    });

    expect(questionReviewPeriodSelect?.value).toBe(alternateReviewPeriodId);

    const reviewPeriodLink = Array.from(container.querySelectorAll('.sidebar-nav .nav-link')).find(
      (link) => link.textContent === 'Review Period',
    ) as HTMLAnchorElement | undefined;
    expect(reviewPeriodLink).toBeTruthy();

    await act(async () => {
      reviewPeriodLink?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => window.location.pathname === '/review-period');
    expect(container.textContent).toContain('Review period lifecycle');

    const reviewPeriodManagementSelect = container.querySelector('.review-period-card .review-period-picker select') as HTMLSelectElement | null;
    expect(reviewPeriodManagementSelect?.value).toBe(activeReviewPeriodId);

    const questionsLink = Array.from(container.querySelectorAll('.sidebar-nav .nav-link')).find(
      (link) => link.textContent === 'Questions',
    ) as HTMLAnchorElement | undefined;
    expect(questionsLink).toBeTruthy();

    await act(async () => {
      questionsLink?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => window.location.pathname === '/questions');
    const questionReviewPeriodSelectAgain = container.querySelector('.review-period-card .review-period-picker select') as HTMLSelectElement | null;
    expect(questionReviewPeriodSelectAgain?.value).toBe(alternateReviewPeriodId);
  });

  it('warns before closing a dirty question-set dialog without saving', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockResolvedValue(adminEmployeeExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Self questions') ?? false);

    const questionSetCard = container.querySelector('.question-set-card');
    expect(questionSetCard).toBeTruthy();

    await act(async () => {
      questionSetCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const editor = container.querySelector('.question-set-dialog');
    expect(editor).toBeTruthy();

    const titleInput = Array.from(editor?.querySelectorAll('label') ?? [])
      .find((label) => label.textContent?.includes('Title'))
      ?.querySelector('input') as HTMLInputElement | null;
    expect(titleInput).toBeTruthy();

    await act(async () => {
      setFieldValue(titleInput!, 'Updated Self questions');
      await Promise.resolve();
    });
    await flushRender();

    const closeButton = Array.from(editor?.querySelectorAll('button') ?? []).find((button) => button.textContent === 'Close');
    expect(closeButton).toBeTruthy();
    expect(Array.from(editor?.querySelectorAll('button') ?? []).filter((button) => button.textContent === 'Cancel')).toHaveLength(1);

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(confirmSpy).toHaveBeenCalledWith('Close this question set without saving your changes?');
    expect(container.querySelector('.question-set-dialog')).toBeTruthy();

    confirmSpy.mockReturnValue(true);

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(container.querySelector('.question-set-dialog')).toBeNull();
  });

  it('resets a question set to a blank draft after confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockResolvedValue(adminEmployeeExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Self questions') ?? false);

    const questionSetCard = container.querySelector('.question-set-card');
    expect(questionSetCard).toBeTruthy();

    await act(async () => {
      questionSetCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const dialog = container.querySelector('.question-set-dialog');
    expect(dialog).toBeTruthy();

    const deleteSetButton = Array.from(dialog?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Delete set',
    );
    expect(deleteSetButton).toBeTruthy();

    await act(async () => {
      deleteSetButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(confirmSpy).toHaveBeenCalledWith('Delete this question set and reset it to a blank question set?');

    const titleInput = Array.from(container.querySelectorAll('.question-set-dialog label'))
      .find((label) => label.textContent?.includes('Title'))
      ?.querySelector('input') as HTMLInputElement | null;
    expect(container.querySelector('.question-set-dialog')?.textContent).toContain('New self question set');
    expect(titleInput?.value).toBe('');
    expect(Array.from(container.querySelectorAll('.question-set-dialog label')).some((label) => label.textContent?.includes('Status'))).toBe(false);
    expect(container.querySelectorAll('.question-set-dialog .question-set-dialog-row')).toHaveLength(0);
  });

  it('keeps archived question-set dialogs read-only and dismissible from the backdrop', async () => {
    const archivedSnapshot = cloneQuestionSlice();
    archivedSnapshot.reviewPeriods[0] = {
      ...archivedSnapshot.reviewPeriods[0]!,
      status: 'archived',
    };

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(archivedSnapshot);
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockResolvedValue(adminEmployeeExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Self questions') ?? false);

    const questionSetCard = container.querySelector('.question-set-card');
    expect(questionSetCard).toBeTruthy();

    await act(async () => {
      questionSetCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const editor = container.querySelector('.question-set-dialog');
    expect(editor).toBeTruthy();
    expect(editor?.textContent).toContain('Read only');
    expect(editor?.textContent).toContain('Archived review periods keep question sets visible, but editing stays disabled.');

    const titleInput = Array.from(editor?.querySelectorAll('label') ?? [])
      .find((label) => label.textContent?.includes('Title'))
      ?.querySelector('input') as HTMLInputElement | null;
    const headerField = Array.from(editor?.querySelectorAll('label') ?? [])
      .find((label) => label.textContent?.includes('Header markdown'))
      ?.querySelector('textarea') as HTMLTextAreaElement | null;
    const footerField = Array.from(editor?.querySelectorAll('label') ?? [])
      .find((label) => label.textContent?.includes('Footer markdown'))
      ?.querySelector('textarea') as HTMLTextAreaElement | null;
    const removeButtons = Array.from(editor?.querySelectorAll('button') ?? []).filter(
      (button) => button.textContent === 'Remove',
    );
    const addQuestionButton = Array.from(editor?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Add question',
    );

    expect(titleInput?.disabled).toBe(true);
    expect(headerField?.disabled).toBe(true);
    expect(footerField?.disabled).toBe(true);
    expect(Array.from(editor?.querySelectorAll('label') ?? []).some((label) => label.textContent?.includes('Status'))).toBe(false);
    expect(removeButtons.length).toBeGreaterThan(0);
    expect(removeButtons.every((button) => button.disabled)).toBe(true);
    expect(addQuestionButton).toBeUndefined();
    expect(Array.from(editor?.querySelectorAll('button') ?? []).some((button) => button.textContent === 'Save question set')).toBe(
      false,
    );
    expect(Array.from(editor?.querySelectorAll('button') ?? []).some((button) => button.textContent === 'Cancel')).toBe(false);
    expect(Array.from(editor?.querySelectorAll('button') ?? []).filter((button) => button.textContent === 'Close')).toHaveLength(1);

    await act(async () => {
      container.querySelector('.modal-backdrop')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(container.querySelector('.question-set-dialog')).toBeNull();
  });

  it('copies archived question sets into the active review period from the question-set dialog', async () => {
    const archivedSnapshot = cloneQuestionSlice();

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockImplementation(async () => structuredClone(archivedSnapshot));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockResolvedValue(adminEmployeeExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(createQuestionSet).mockResolvedValue({
      item: {
        ...archivedSnapshot.questionSets[2]!,
        id: '56565656-5656-4565-8565-565656565656',
        reviewPeriodId: archivedSnapshot.reviewPeriods[0]!.id,
        isReadOnly: false,
        title: '2026 Self Questions',
      },
    });
    vi.mocked(activateQuestionSet).mockResolvedValue({
      item: {
        ...archivedSnapshot.questionSets[2]!,
        id: '56565656-5656-4565-8565-565656565656',
        reviewPeriodId: archivedSnapshot.reviewPeriods[0]!.id,
        isReadOnly: false,
        status: 'active',
        title: '2026 Self Questions',
      },
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Self questions') ?? false);

    const reviewPeriodSelect = container.querySelector('.review-period-picker select') as HTMLSelectElement | null;
    expect(reviewPeriodSelect).toBeTruthy();

    await act(async () => {
      setFieldValue(reviewPeriodSelect!, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      await flushRender();
    });

    const archivedQuestionSetCard = container.querySelector('.question-set-card');
    expect(archivedQuestionSetCard).toBeTruthy();

    await act(async () => {
      archivedQuestionSetCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const dialog = container.querySelector('.question-set-dialog');
    expect(dialog).toBeTruthy();

    const copyButton = Array.from(dialog?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Copy to 2026 Annual Review',
    );
    expect(copyButton).toBeTruthy();

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => vi.mocked(createQuestionSet).mock.calls.length === 1);

    expect(createQuestionSet).toHaveBeenCalledWith('session-token', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
      target: 'self',
      title: '2026 Self Questions',
      headerMarkdown: 'Archived self questions.',
      footerMarkdown: 'Archive only.',
      questions: [
        {
          order: 1,
          type: 'subjective',
          category: 'Impact',
          prompt: 'Archived prompt',
        },
      ],
    });
    expect(container.querySelector('.question-set-dialog')?.textContent).toContain('2026 Self Questions');
  });
});

describe('workflow entry', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.pushState(null, '', '/dashboard');
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.resetAllMocks();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('shows Workflow in the main nav and routes to the workflow page', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('File Management') ?? false);

    const navLinkLabels = Array.from(container.querySelectorAll('.sidebar-nav .nav-link span'), (link) => link.textContent);
    expect(navLinkLabels).toContain('Review Period');
    expect(navLinkLabels).toContain('File Management');
    expect(navLinkLabels).not.toContain('Archive');
    expect(navLinkLabels).not.toContain('Backups');
    expect(navLinkLabels).toContain('Workflow');
    expect(navLinkLabels.indexOf('Dashboard')).toBe(0);
    expect(navLinkLabels.indexOf('Review Period')).toBeLessThan(navLinkLabels.indexOf('File Management'));

    const workflowLink = Array.from(container.querySelectorAll('.sidebar-nav .nav-link')).find(
      (link) => link.textContent === 'Workflow',
    ) as HTMLAnchorElement | undefined;
    expect(workflowLink?.getAttribute('href')).toBe('/workflow');

    await act(async () => {
      workflowLink?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => window.location.pathname === '/workflow');

    expect(container.textContent).toContain('Reference the current lifecycle');
    expect(container.querySelector('.workflow-page-card .section-label')?.textContent).toBe('Workflow');
    expect(container.textContent).not.toContain('Review workflow markdown');
    expect(container.textContent).toContain('Edit workflow');
    expect(container.textContent).toContain('Dashboard follow-up moves the set through ready_for_meeting and then scheduled');
  });

  it('keeps direct workflow access working while hiding the nav item from employees when visibility is managers', async () => {
    vi.mocked(me).mockResolvedValue({ session: createEmployeeSession() });
    vi.mocked(getFoundation).mockResolvedValue({
      ...cloneQuestionSlice(),
      workflow: {
        ...foundationSnapshotExample.workflow,
        visibility: 'managers',
      },
    });
    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/workflow');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Reference the current lifecycle') ?? false);

    const navLinkLabels = Array.from(container.querySelectorAll('.sidebar-nav .nav-link span'), (link) => link.textContent);
    expect(navLinkLabels).not.toContain('Workflow');
    expect(window.location.pathname).toBe('/workflow');
    expect(container.textContent).not.toContain('Edit workflow');
    expect(container.textContent).not.toContain('Sidebar visibility:');
    expect(container.textContent).toContain('Dashboard follow-up moves the set through ready_for_meeting and then scheduled');
  });

  it('warns before closing the workflow editor when there are unsaved changes', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());
    vi.mocked(updateWorkflowSettings).mockResolvedValue({
      item: {
        markdown: '## Updated workflow\n- **Bold** item\n- Second item',
        visibility: 'managers',
      },
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/workflow');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Reference the current lifecycle') ?? false);

    const workflowEditButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Edit workflow',
    );
    expect(workflowEditButton).toBeTruthy();

    await act(async () => {
      workflowEditButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('.workflow-editor-dialog') !== null);
    expect(container.querySelector('.workflow-editor-dialog .section-label')?.textContent).toBe('Edit workflow');
    expect(container.textContent).not.toContain('Edit workflow markdown');

    const workflowTextarea = container.querySelector('textarea[aria-label="Workflow markdown"]') as HTMLTextAreaElement | null;
    const cancelButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Cancel');

    expect(workflowTextarea).toBeTruthy();
    expect(cancelButton).toBeTruthy();

    await act(async () => {
      if (workflowTextarea) {
        setFieldValue(workflowTextarea, '## Unsaved workflow\n- Draft change');
      }
      await flushRender();
    });

    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(confirmSpy).toHaveBeenCalledWith('Close this workflow without saving your changes?');
    expect(container.querySelector('.workflow-editor-dialog')).toBeTruthy();

    confirmSpy.mockReturnValue(true);

    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(container.querySelector('.workflow-editor-dialog')).toBeNull();
  });

  it('loads workflow settings from the foundation snapshot instead of browser local storage', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue({
      ...cloneQuestionSlice(),
      workflow: {
        markdown: '## Shared workflow\n- Pulled from the API',
        visibility: 'admin only',
      },
    });
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.localStorage.setItem('revu-workflow-markdown', '## Stale local workflow');
    window.localStorage.setItem('revu-workflow-visibility', 'managers');
    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/workflow');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Shared workflow') ?? false);

    expect(container.querySelector('.workflow-page-card')?.textContent).toContain('Shared workflow');
    expect(container.querySelector('.workflow-page-card')?.textContent).toContain('Sidebar visibility: admin only');
    expect(container.textContent).not.toContain('Stale local workflow');
  });

  it('refreshes workflow content when returning to the workflow page after another browser saves changes', async () => {
    const initialSnapshot = cloneQuestionSlice();
    initialSnapshot.workflow = {
      markdown: '## Original workflow\n- Existing step',
      visibility: 'all',
    };

    const refreshedSnapshot = structuredClone(initialSnapshot);
    refreshedSnapshot.workflow = {
      markdown: '## Updated workflow\n- Synced from another browser',
      visibility: 'managers',
    };

    let currentFoundationSnapshot = initialSnapshot;

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockImplementation(async () => structuredClone(currentFoundationSnapshot));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/workflow');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Original workflow') ?? false);
    expect(container.querySelector('.workflow-page-card')?.textContent).toContain('Sidebar visibility: all');

    currentFoundationSnapshot = refreshedSnapshot;

    await act(async () => {
      window.history.pushState(null, '', '/file-management');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Automatic backups') ?? false);

    await act(async () => {
      window.history.pushState(null, '', '/workflow');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Synced from another browser') ?? false);
    expect(container.querySelector('.workflow-page-card')?.textContent).toContain('Sidebar visibility: managers');
  });

  it('pauses automatic refresh while the workflow editor is open', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    let activeIntervalId: number | null = null;
    let activeRefreshHandler: (() => void) | null = null;
    let nextIntervalId = 1;

    const setIntervalSpy = vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      const intervalId = nextIntervalId++;
      if (typeof handler === 'function') {
        activeIntervalId = intervalId;
        activeRefreshHandler = handler as () => void;
      }
      return intervalId;
    }) as typeof window.setInterval);
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval').mockImplementation(((intervalId?: number) => {
      if (intervalId === activeIntervalId) {
        activeIntervalId = null;
        activeRefreshHandler = null;
      }
    }) as typeof window.clearInterval);

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/workflow');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Reference the current lifecycle') ?? false);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
    expect(activeRefreshHandler).toBeTruthy();

    const workflowEditButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Edit workflow',
    );
    expect(workflowEditButton).toBeTruthy();

    await act(async () => {
      workflowEditButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('.workflow-editor-dialog') !== null);
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(activeRefreshHandler).toBeNull();
  });

  it('toggles the sidebar width without removing navigation or utility controls', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('File Management') ?? false);

    const shell = container.querySelector('.app-shell');
    const toggleButton = container.querySelector('button[aria-label="Collapse sidebar"]') as HTMLButtonElement | null;
    expect(shell?.getAttribute('data-sidebar-collapsed')).toBe('false');
    expect(toggleButton).toBeTruthy();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(shell?.getAttribute('data-sidebar-collapsed')).toBe('true');
    expect(window.localStorage.getItem('revu-sidebar-collapsed')).toBe('true');
    expect(container.querySelector('button[aria-label="Expand sidebar"]')).toBeTruthy();

    const navLinkLabels = Array.from(container.querySelectorAll('.sidebar-nav .nav-link span'), (link) => link.textContent);
    expect(navLinkLabels).toContain('Workflow');
    expect(navLinkLabels).toContain('Review Period');
    expect(navLinkLabels).toContain('File Management');
    expect(navLinkLabels.indexOf('Review Period')).toBeLessThan(navLinkLabels.indexOf('File Management'));
    expect(Array.from(container.querySelectorAll('.sidebar button')).some((button) => button.textContent === 'Sign out')).toBe(true);
    expect(container.querySelector('.theme-card')).toBeTruthy();
  });

  it('shows the assessment list controls on the admin assessments page and filters live', async () => {
    const scheduledSnapshot = createAssessmentLifecycleSnapshot('scheduled');

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation)
      .mockResolvedValueOnce(scheduledSnapshot)
      .mockResolvedValueOnce({
        ...scheduledSnapshot,
        assessments: [],
      });
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());
    vi.mocked(clearReadyToStartAssessments).mockResolvedValue({
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      clearedAssessments: 2,
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/assessments');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment List') ?? false);

    const navLinkLabels = Array.from(container.querySelectorAll('.sidebar-nav .nav-link span'), (link) => link.textContent);
    expect(navLinkLabels).toContain('Assessments');
    expect(container.textContent).toContain('Assessment List');
    expect(container.textContent).toContain('2026 Annual Review');
    expect(container.textContent).toContain('Assessment status');
    expect(container.textContent).toContain('Employee');
    expect(container.textContent).toContain('Next Steps');
    expect(container.textContent).toContain('Scheduled');
    expect(container.textContent).toContain(
      'Showing 2 assessments • 0 not started / incomplete • 0 submitted • 0 accepted • 0 ready for meeting • 2 scheduled • 0 concluded',
    );
    expect(container.textContent).toContain(
      '1 self-assessment • 0 not started / incomplete • 0 submitted • 0 accepted • 0 ready for meeting • 1 scheduled • 0 concluded',
    );
    expect(container.textContent).toContain(
      '1 peer-assessment • 0 not started / incomplete • 0 submitted • 0 accepted • 0 ready for meeting • 1 scheduled • 0 concluded',
    );
    expect(container.textContent).toContain('Clear not started assessments');
    expect(container.textContent).toContain('Sync assessments to assignments');
    expect(container.querySelectorAll('.assessment-row-card')).toHaveLength(2);

    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement | null;
    const lifecycleSelect = Array.from(container.querySelectorAll('select')).find(
      (field) => Array.from(field.querySelectorAll('option')).some((option) => option.textContent === 'All stages'),
    ) as HTMLSelectElement | undefined;
    expect(searchInput).toBeTruthy();
    expect(lifecycleSelect).toBeTruthy();

    await act(async () => {
      setFieldValue(searchInput!, 'Scheduled');
      await flushRender();
    });

    expect(container.querySelectorAll('.assessment-row-card')).toHaveLength(2);
    expect(container.querySelector('.assessment-row-card')?.textContent).toContain('Scheduled');

    await act(async () => {
      setFieldValue(searchInput!, '');
      await flushRender();
    });

    await act(async () => {
      setFieldValue(lifecycleSelect!, 'submitted');
      await flushRender();
    });

    expect(container.textContent).toContain('No assessments match the current filters.');

    await act(async () => {
      setFieldValue(lifecycleSelect!, 'scheduled');
      await flushRender();
    });

    expect(container.querySelectorAll('.assessment-row-card')).toHaveLength(2);

    await act(async () => {
      setFieldValue(lifecycleSelect!, 'all');
      await flushRender();
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const clearButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Clear not started assessments',
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(confirmSpy).toHaveBeenCalledWith('Clear all not started assessments from the active review period?');
    expect(clearReadyToStartAssessments).toHaveBeenCalledWith('session-token', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await waitFor(() => container.textContent?.includes('No assessments exist for the active review period yet.') ?? false);
  });

  it('refreshes the assessment list from the header icon', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(createAssessmentLifecycleSnapshot('scheduled'));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/assessments');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment List') ?? false);

    vi.mocked(getFoundation).mockClear();
    vi.mocked(listEmployees).mockClear();

    const refreshButton = container.querySelector('button[aria-label="Refresh assessment list"]') as HTMLButtonElement | null;
    expect(refreshButton).toBeTruthy();

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => vi.mocked(getFoundation).mock.calls.length === 1);
    expect(vi.mocked(listEmployees).mock.calls.length).toBe(1);
  });

  it('refreshes loaded data automatically on the configured interval', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(createAssessmentLifecycleSnapshot('scheduled'));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    let refreshHandler: (() => void) | null = null;
    const setIntervalSpy = vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        refreshHandler = handler as () => void;
      }
      return 1;
    }) as typeof window.setInterval);

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/assessments');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment List') ?? false);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
    expect(refreshHandler).toBeTruthy();

    vi.mocked(getFoundation).mockClear();
    vi.mocked(listEmployees).mockClear();
    vi.mocked(listQuestionCategories).mockClear();
    vi.mocked(getBackupStatus).mockClear();

    await act(async () => {
      refreshHandler?.();
      await flushRender();
    });

    await waitFor(() => vi.mocked(getFoundation).mock.calls.length === 1);
    expect(vi.mocked(listEmployees).mock.calls.length).toBe(1);
    expect(vi.mocked(listQuestionCategories).mock.calls.length).toBe(1);
    expect(vi.mocked(getBackupStatus).mock.calls.length).toBe(1);
  });

  it('restores the assessment list search state after a remount', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(createAssessmentLifecycleSnapshot('scheduled'));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/assessments');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment List') ?? false);

    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement | null;
    const lifecycleSelect = Array.from(container.querySelectorAll('select')).find(
      (field) => Array.from(field.querySelectorAll('option')).some((option) => option.textContent === 'All stages'),
    ) as HTMLSelectElement | undefined;
    const targetSelect = Array.from(container.querySelectorAll('select')).find(
      (field) => Array.from(field.querySelectorAll('option')).some((option) => option.textContent === 'All assessments'),
    ) as HTMLSelectElement | undefined;

    expect(searchInput).toBeTruthy();
    expect(lifecycleSelect).toBeTruthy();
    expect(targetSelect).toBeTruthy();

    await act(async () => {
      setFieldValue(searchInput!, 'Peer');
      setFieldValue(lifecycleSelect!, 'scheduled');
      setFieldValue(targetSelect!, 'peer');
      await flushRender();
    });

    expect(container.querySelectorAll('.assessment-row-card')).toHaveLength(1);

    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment List') ?? false);

    const restoredSearchInput = container.querySelector('input[type="search"]') as HTMLInputElement | null;
    const restoredLifecycleSelect = Array.from(container.querySelectorAll('select')).find(
      (field) => Array.from(field.querySelectorAll('option')).some((option) => option.textContent === 'All stages'),
    ) as HTMLSelectElement | undefined;
    const restoredTargetSelect = Array.from(container.querySelectorAll('select')).find(
      (field) => Array.from(field.querySelectorAll('option')).some((option) => option.textContent === 'All assessments'),
    ) as HTMLSelectElement | undefined;

    expect(restoredSearchInput?.value).toBe('Peer');
    expect(restoredLifecycleSelect?.value).toBe('scheduled');
    expect(restoredTargetSelect?.value).toBe('peer');
    expect(container.querySelectorAll('.assessment-row-card')).toHaveLength(1);
  });

  it('keeps the admin assessments route admin-only', async () => {
    vi.mocked(me).mockResolvedValue({ session: createEmployeeSession() });
    vi.mocked(getFoundation).mockResolvedValue(createAssessmentLifecycleSnapshot('draft'));

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/assessments');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => window.location.pathname === '/dashboard');

    expect(container.textContent).toContain('Assessment Queue');
    expect(container.textContent).not.toContain('Assessment List');
  });

  it('opens draft assessment editing from the admin assessments page', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(createAssessmentLifecycleSnapshot('draft'));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/assessments');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment List') ?? false);

    const row = container.querySelector('.assessment-row-card-clickable') as HTMLDivElement | null;
    expect(row).toBeTruthy();

    await act(async () => {
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') !== null);

    expect(window.location.pathname).toBe('/assessments');
    expect(container.textContent).toContain('Self assessment form');
    expect(container.textContent).toContain('Save for later');
    expect(container.textContent).toContain('Submit');
  });

  it('opens accepted assessments from the row and lets admins delete them', async () => {
    let currentFoundation = createAssessmentLifecycleSnapshot('accepted');
    const assessmentId = currentFoundation.assessments[0]!.id;
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockImplementation(async () => structuredClone(currentFoundation));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());
    vi.mocked(deleteAssessmentByAdmin).mockImplementation(async (_token, deletedAssessmentId) => {
      currentFoundation = {
        ...currentFoundation,
        assessments: currentFoundation.assessments.filter((assessment) => assessment.id !== deletedAssessmentId),
      };
      return {
        assessmentId: deletedAssessmentId,
        deleted: true,
      };
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/assessments');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment List') ?? false);

    const initialRows = container.querySelectorAll('.assessment-row-card').length;
    const row = container.querySelector('.assessment-row-card-clickable') as HTMLDivElement | null;
    expect(row).toBeTruthy();

    await act(async () => {
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') !== null);

    expect(container.textContent).toContain('Assessment status');
    expect(container.textContent).toContain('Save changes');
    expect(container.textContent).toContain('Mark ready for meeting');
    expect(container.textContent).toContain('Delete assessment');
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Submit')).toBe(false);

    const deleteButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Delete assessment',
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') === null);
    expect(deleteAssessmentByAdmin).toHaveBeenCalledWith('session-token', assessmentId);
    expect(container.querySelectorAll('.assessment-row-card')).toHaveLength(initialRows - 1);
  });

  it('shows reopen conclusion in the admin assessment dialog for concluded assessments', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(createAssessmentLifecycleSnapshot('concluded'));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/assessments');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment List') ?? false);

    const row = container.querySelector('.assessment-row-card-clickable') as HTMLDivElement | null;
    expect(row).toBeTruthy();

    await act(async () => {
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') !== null);

    expect(container.textContent).toContain('Save changes');
    expect(container.textContent).toContain('Reopen conclusion');
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Submit')).toBe(false);
  });

  it('opens submitted review actions from the admin assessments page', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(createAssessmentLifecycleSnapshot('submitted'));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/assessments');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment List') ?? false);

    const row = container.querySelector('.assessment-row-card-clickable') as HTMLDivElement | null;
    expect(row).toBeTruthy();

    await act(async () => {
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') !== null);

    expect(window.location.pathname).toBe('/assessments');
    expect(container.textContent).toContain('Self assessment form');
    expect(container.textContent).toContain('Assessment status');
    expect(container.textContent).toContain('Save changes');
    expect(container.textContent).toContain('Accept');
  });

  it('opens assessment-set workflow actions from the admin assessments page', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(createAssessmentLifecycleSnapshot('accepted'));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/assessments');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment List') ?? false);

    const row = container.querySelector('.assessment-row-card-clickable') as HTMLDivElement | null;
    expect(row).toBeTruthy();

    await act(async () => {
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') !== null);

    expect(window.location.pathname).toBe('/assessments');
    expect(container.textContent).toContain('Ready for meeting');
    expect(container.textContent).toContain('Mark ready for meeting');
  });
});

describe('file management screen', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.pushState(null, '', '/file-management');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:backup'),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders transfer cards and manages stored backups from the automatic backups dialog', async () => {
    const backup = createBackupExample();
    const questionSnapshot = cloneQuestionSlice();
    let currentFoundationSnapshot = structuredClone(questionSnapshot);
    let currentBackupStatus = createBackupStatusExample();
    let currentStoredBackups = [createStoredBackupFileExample()];
    const selectedReviewPeriod = questionSnapshot.reviewPeriods[0]!;
    const elliot = employeesListExample.items.find((employee) => employee.username === 'elliot.employee')!;
    const session: AuthSession = {
      ...adminLoginExample.session,
      permissions: [
        ...new Set<AuthSession['permissions'][number]>([
          ...adminLoginExample.session.permissions,
          'employees:read',
          'backups:read',
          'backups:create',
          'backups:restore',
        ]),
      ],
    };

    vi.mocked(me).mockResolvedValue({ session });
    vi.mocked(getFoundation).mockImplementation(async () => structuredClone(currentFoundationSnapshot));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockResolvedValue(adminEmployeeExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockImplementation(async () => structuredClone(currentBackupStatus));
    vi.mocked(listStoredBackups).mockImplementation(async () => ({ items: structuredClone(currentStoredBackups) }));
    vi.mocked(exportLocalUsers).mockResolvedValue({
      format: 'json',
      mode: 'preserve-passwords',
      exportedAt: '2026-06-03T07:45:00.000Z',
      itemCount: 2,
      items: [
        {
          id: adminEmployeeExample.item.id,
          username: adminEmployeeExample.item.username,
          fullName: adminEmployeeExample.item.fullName,
          email: adminEmployeeExample.item.email,
          role: adminEmployeeExample.item.role,
          status: adminEmployeeExample.item.status,
          managerUsername: null,
          assessor1Username: null,
          assessor2Username: null,
          reviewer1Username: null,
          reviewer2Username: null,
          password: '',
          credentialKind: 'password',
          passwordResetRequired: false,
        },
        {
          id: elliot.id,
          username: elliot.username,
          fullName: elliot.fullName,
          email: elliot.email,
          role: elliot.role,
          status: elliot.status,
          managerUsername: 'manny.manager',
          assessor1Username: 'manny.manager',
          assessor2Username: 'pat.peer',
          reviewer1Username: 'ada.admin',
          reviewer2Username: 'manny.manager',
          password: '',
          credentialKind: 'password',
          passwordResetRequired: false,
        },
      ],
    });
    vi.mocked(importLocalUsers).mockResolvedValue({
      format: 'json',
      importedAt: '2026-06-03T07:50:00.000Z',
      itemCount: 1,
      createdCount: 0,
      updatedCount: 1,
      items: [createEmployeeDetail(elliot.id).item],
    });
    vi.mocked(exportQuestionSets).mockResolvedValue({
      reviewPeriodId: selectedReviewPeriod.id,
      format: 'json',
      exportedAt: '2026-06-03T08:00:00.000Z',
      itemCount: 2,
      items: questionSnapshot.questionSets.filter((item) => item.reviewPeriodId === selectedReviewPeriod.id),
    });
    vi.mocked(importQuestionSets).mockResolvedValue({
      reviewPeriodId: selectedReviewPeriod.id,
      format: 'csv',
      importedAt: '2026-06-03T08:05:00.000Z',
      itemCount: 2,
      createdCount: 0,
      updatedCount: 2,
      items: questionSnapshot.questionSets.filter((item) => item.reviewPeriodId === selectedReviewPeriod.id),
    });
    vi.mocked(exportAssignments).mockResolvedValue({
      reviewPeriodId: selectedReviewPeriod.id,
      format: 'json',
      exportedAt: '2026-06-03T08:06:00.000Z',
      itemCount: 1,
      items: [
        {
          assignmentId: foundationSnapshotExample.assignments[0]!.id,
          employeeUsername: 'elliot.employee',
          employeeFullName: 'Elliot Employee',
          managerUsername: 'manny.manager',
          managerFullName: 'Manny Manager',
          assessorUsername: 'pat.peer',
          assessorFullName: 'Pat Peer',
        },
      ],
    });
    vi.mocked(importAssignments).mockResolvedValue({
      reviewPeriodId: selectedReviewPeriod.id,
      format: 'csv',
      importedAt: '2026-06-03T08:07:00.000Z',
      itemCount: 1,
      createdCount: 0,
      updatedCount: 1,
      items: [foundationSnapshotExample.assignments[0]!],
    });
    vi.mocked(downloadStoredBackup).mockResolvedValue({
      filename: currentStoredBackups[0]!.name,
      content: JSON.stringify(backup, null, 2),
    });
    vi.mocked(uploadStoredBackup).mockImplementation(async (_token, file) => {
      const uploaded = createStoredBackupFileExample({
        name: 'backup-file-2.json',
        storedAt: '2026-06-03T08:10:00.000Z',
        sizeBytes: file.size,
      });
      currentStoredBackups = [uploaded, ...currentStoredBackups];
      return {
        item: uploaded,
        renamedFrom: file.name,
      };
    });
    vi.mocked(createStoredBackup).mockImplementation(async () => {
      const created = createStoredBackupFileExample({
        name: 'revu-backup-20260603T081500Z.json',
        storedAt: '2026-06-03T08:15:00.000Z',
        sizeBytes: 6144,
      });
      currentStoredBackups = [created, ...currentStoredBackups];
      currentBackupStatus = createBackupStatusExample({
        lastBackupAt: created.storedAt,
      });
      return {
        item: created,
      };
    });
    vi.mocked(deleteStoredBackup).mockImplementation(async (_token, fileName) => {
      currentStoredBackups = currentStoredBackups.filter((item) => item.name !== fileName);
      return {
        name: fileName,
        deleted: true as const,
      };
    });
    vi.mocked(restoreStoredBackup).mockImplementation(async () => {
      currentFoundationSnapshot = {
        ...currentFoundationSnapshot,
        reviewPeriods: structuredClone(backup.reviewData.reviewPeriods),
        questionSets: structuredClone(backup.reviewData.questionSets),
        assignments: structuredClone(backup.reviewData.assignments),
        assessments: structuredClone(backup.reviewData.assessments),
        workflow: structuredClone(backup.reviewData.workflow),
      };
      currentBackupStatus = createBackupStatusExample({
        ...currentBackupStatus,
        lastRestoreAt: '2026-06-03T08:15:00.000Z',
      });

      return {
        mode: 'replace',
        target: 'questions',
        restoredAt: '2026-06-03T08:15:00.000Z',
        userMode: 'preserve-passwords',
        counts: {
          users: backup.users.itemCount,
          reviewPeriods: backup.reviewData.reviewPeriods.length,
          questionSets: backup.reviewData.questionSets.length,
          assignments: backup.reviewData.assignments.length,
          assessments: backup.reviewData.assessments.length,
        },
      };
    });
    vi.mocked(updateWorkflowSettings).mockImplementation(async () => {
      currentFoundationSnapshot = {
        ...currentFoundationSnapshot,
        workflow: {
          markdown: '## Updated workflow\n- **Bold** item\n- Second item',
          visibility: 'managers',
        },
      };

      return {
        item: currentFoundationSnapshot.workflow,
      };
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Automatic backups') ?? false);

    expect(window.location.pathname).toBe('/file-management');
    expect(container.textContent).not.toContain('Admin workspace');
    expect(container.textContent).not.toContain('Backup and restore');
    expect(container.textContent).not.toContain('Runtime backup configuration');
    expect(container.textContent).toContain('Employee import/export');
    expect(container.textContent).toContain('Question set import/export');
    expect(container.textContent).not.toContain('Review period lifecycle');
    expect(container.textContent).not.toContain('Archive review periods');
    expect(container.textContent).not.toContain('Manage inactive review periods');
    expect(container.textContent).not.toContain('Restore archived review periods');
    expect(container.textContent).toContain('Automatic backups');
    expect(container.textContent).toContain('Show backups');
    expect(container.textContent).toContain('Refresh status');
    expect(container.textContent).not.toContain('Backup now / download');
    expect(container.textContent).not.toContain('Restore all');
    expect(container.textContent).not.toContain('Restore questions');
    expect(container.textContent).not.toContain('Collapse');
    expect(container.textContent).not.toContain('Expand');
    expect(container.textContent).not.toContain('Review workflow markdown');
    expect(container.textContent).not.toContain('Sidebar visibility:');
    expect(container.querySelectorAll('.file-management-review-period-card')).toHaveLength(0);

    const editWorkflowButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Edit workflow',
    );
    expect(editWorkflowButton).toBeUndefined();

    const workflowLinkAgain = Array.from(container.querySelectorAll('.sidebar-nav .nav-link')).find(
      (link) => link.textContent === 'Workflow',
    ) as HTMLAnchorElement | undefined;
    expect(workflowLinkAgain).toBeTruthy();

    await act(async () => {
      workflowLinkAgain?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => window.location.pathname === '/workflow');
    const workflowEditButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Edit workflow',
    );
    expect(workflowEditButton).toBeTruthy();

    await act(async () => {
      workflowEditButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('.workflow-editor-dialog') !== null);
    expect(container.querySelector('.workflow-editor-dialog .section-label')?.textContent).toBe('Edit workflow');
    expect(container.textContent).not.toContain('Edit workflow markdown');

    const workflowEditorGrid = container.querySelector('.workflow-editor-grid');
    const workflowTextarea = container.querySelector('textarea[aria-label="Workflow markdown"]') as HTMLTextAreaElement | null;
    const workflowVisibilitySelect = container.querySelector(
      'select[aria-label="Workflow visibility"]',
    ) as HTMLSelectElement | null;
    const workflowPreviewBody = container.querySelector('.workflow-editor-preview-body') as HTMLDivElement | null;
    expect(workflowEditorGrid?.children[0]?.classList.contains('workflow-editor-fields')).toBe(true);
    expect(workflowEditorGrid?.children[1]?.classList.contains('workflow-editor-preview')).toBe(true);
    expect(workflowTextarea).toBeTruthy();
    expect(workflowVisibilitySelect).toBeTruthy();
    expect(workflowPreviewBody).toBeTruthy();
    expect(Array.from(workflowVisibilitySelect?.options ?? [], (option) => option.textContent)).toEqual([
      'all',
      'managers',
      'admin only',
    ]);

    await act(async () => {
      if (workflowVisibilitySelect) {
        setFieldValue(workflowVisibilitySelect, 'managers');
      }
      if (workflowTextarea) {
        setFieldValue(workflowTextarea, '## Updated workflow\n- **Bold** item\n- Second item');
      }
      await flushRender();
    });

    expect(container.querySelector('.workflow-editor-preview')?.innerHTML).toContain('<strong>Bold</strong>');

    Object.defineProperty(workflowTextarea!, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(workflowTextarea!, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(workflowTextarea!, 'scrollTop', { configurable: true, writable: true, value: 300 });
    Object.defineProperty(workflowPreviewBody!, 'scrollHeight', { configurable: true, value: 600 });
    Object.defineProperty(workflowPreviewBody!, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(workflowPreviewBody!, 'scrollTop', { configurable: true, writable: true, value: 0 });

    await act(async () => {
      workflowTextarea?.dispatchEvent(new Event('scroll', { bubbles: true }));
      await flushRender();
    });

    expect(workflowPreviewBody?.scrollTop).toBe(200);

    const saveWorkflowButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save workflow',
    );
    expect(saveWorkflowButton).toBeTruthy();

    await act(async () => {
      saveWorkflowButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Updated the workflow settings.') ?? false);
    expect(updateWorkflowSettings).toHaveBeenCalledWith('session-token', {
      markdown: '## Updated workflow\n- **Bold** item\n- Second item',
      visibility: 'managers',
    });

    await act(async () => {
      window.history.pushState(null, '', '/file-management');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Automatic backups') ?? false);

    const transferCards = Array.from(container.querySelectorAll('.file-management-transfer-card'));
    const localUserTransferCard = transferCards.find((card) => card.textContent?.includes('Employee import/export'));
    const questionTransferCard = transferCards.find((card) => card.textContent?.includes('Question set import/export'));
    expect(localUserTransferCard).toBeTruthy();
    expect(questionTransferCard).toBeTruthy();

    const localUserExportButton = Array.from(localUserTransferCard?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Export JSON',
    );
    expect(localUserExportButton).toBeTruthy();

    await act(async () => {
      localUserExportButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(exportLocalUsers).toHaveBeenCalledWith('session-token', 'json', 'rotate-passcodes');

    const localUserInput = localUserTransferCard?.querySelector(
      'input[type="file"][accept=".json,.csv,application/json,text/csv,text/plain"]',
    ) as HTMLInputElement | null;
    expect(localUserInput).toBeTruthy();

    const importedUsersFile = new File(
      [
        JSON.stringify({
          format: 'json',
          items: [
            {
              username: elliot.username,
              fullName: elliot.fullName,
              email: elliot.email,
              role: elliot.role,
              status: elliot.status,
              managerUsername: 'manny.manager',
              assessor1Username: 'manny.manager',
              assessor2Username: 'pat.peer',
              reviewer1Username: 'ada.admin',
              reviewer2Username: 'manny.manager',
              password: 'EmployeePass123!',
            },
          ],
        }),
      ],
      'local-users.json',
      { type: 'application/json' },
    );
    Object.defineProperty(localUserInput!, 'files', {
      configurable: true,
      value: [importedUsersFile],
    });

    await act(async () => {
      localUserInput!.dispatchEvent(new Event('change', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => vi.mocked(importLocalUsers).mock.calls.length === 1);
    expect(importLocalUsers).toHaveBeenCalledWith(
      'session-token',
      expect.objectContaining({
        format: 'json',
        items: [
          expect.objectContaining({
            username: elliot.username,
            fullName: elliot.fullName,
          }),
        ],
      }),
    );

    const questionExportButton = Array.from(questionTransferCard?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Export JSON',
    );
    const questionImportButton = Array.from(questionTransferCard?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Import CSV',
    );
    const questionImportInput = questionTransferCard?.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(questionExportButton).toBeTruthy();
    expect(questionImportButton).toBeTruthy();
    expect(questionImportInput).toBeTruthy();

    await act(async () => {
      questionExportButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(exportQuestionSets).toHaveBeenCalledWith('session-token', selectedReviewPeriod.id, 'json');
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(container.textContent).toContain('Exported 2 question sets as JSON.');

    await act(async () => {
      questionImportButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const importedQuestionSetsFile = new File(
      [
        [
          'reviewPeriodId,questionSetId,target,status,title,headerMarkdown,footerMarkdown,questionId,questionOrder,questionType,questionCategory,questionPrompt',
          `${selectedReviewPeriod.id},aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa,self,active,2026 Self Questions,Heading,Footer,bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb,1,subjective,Impact,What impact did you have?`,
        ].join('\n'),
      ],
      'question-sets.csv',
      { type: 'text/csv' },
    );
    Object.defineProperty(questionImportInput!, 'files', {
      configurable: true,
      value: [importedQuestionSetsFile],
    });

    await act(async () => {
      questionImportInput?.dispatchEvent(new Event('change', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => vi.mocked(importQuestionSets).mock.calls.length === 1);
    expect(importQuestionSets).toHaveBeenCalledWith(
      'session-token',
      selectedReviewPeriod.id,
      expect.objectContaining({
        format: 'csv',
        items: expect.arrayContaining([
          expect.objectContaining({
            title: expect.any(String),
          }),
        ]),
      }),
    );

    const showBackupsButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Show backups');
    expect(showBackupsButton).toBeTruthy();

    await act(async () => {
      showBackupsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Backup list') ?? false);
    expect(listStoredBackups).toHaveBeenCalledWith('session-token');
    expect(container.textContent).toContain('revu-backup-20260602T153000Z.json');
    expect(container.textContent).toContain('Upload backup');
    expect(container.textContent).toContain('Backup now');

    const openDownloadDialogButton = Array.from(container.querySelectorAll('.backup-list-dialog button')).find(
      (button) => button.textContent === 'Download',
    );
    expect(openDownloadDialogButton).toBeTruthy();

    await act(async () => {
      openDownloadDialogButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Download backup') ?? false);

    const confirmDownloadButton = Array.from(container.querySelectorAll('.backup-download-dialog button')).find(
      (button) => button.textContent === 'Download',
    );
    expect(confirmDownloadButton).toBeTruthy();

    await act(async () => {
      confirmDownloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(downloadStoredBackup).toHaveBeenCalledWith('session-token', 'revu-backup-20260602T153000Z.json', 'preserve-passwords');

    const backupInput = container.querySelector('input[type="file"][accept=".json,application/json,text/plain"]') as HTMLInputElement | null;
    expect(backupInput).toBeTruthy();

    const backupFile = new File([JSON.stringify(backup, null, 2)], 'backup-file.json', { type: 'application/json' });
    Object.defineProperty(backupInput, 'files', {
      configurable: true,
      value: [backupFile],
    });

    await act(async () => {
      backupInput?.dispatchEvent(new Event('change', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('backup-file-2.json') ?? false);
    expect(uploadStoredBackup).toHaveBeenCalledWith('session-token', backupFile);

    const createBackupNowButton = Array.from(container.querySelectorAll('.backup-list-dialog button')).find(
      (button) => button.textContent === 'Backup now',
    );
    expect(createBackupNowButton).toBeTruthy();

    await act(async () => {
      createBackupNowButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('revu-backup-20260603T081500Z.json') ?? false);
    expect(createStoredBackup).toHaveBeenCalledWith('session-token');

    const openRestoreDialogButton = Array.from(container.querySelectorAll('.backup-list-dialog button')).find(
      (button) => button.textContent === 'Restore',
    );
    expect(openRestoreDialogButton).toBeTruthy();

    await act(async () => {
      openRestoreDialogButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const restoreQuestionsButton = Array.from(container.querySelectorAll('.backup-restore-dialog button')).find(
      (button) => button.textContent?.includes('Restore questions'),
    );
    expect(restoreQuestionsButton).toBeTruthy();

    await act(async () => {
      restoreQuestionsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Restored questions from revu-backup-20260603T081500Z.json') ?? false);
    expect(restoreStoredBackup).toHaveBeenCalledWith('session-token', 'revu-backup-20260603T081500Z.json', {
      target: 'questions',
      mode: 'replace',
    });

    const deleteButton = Array.from(container.querySelectorAll('.backup-list-dialog button')).find(
      (button) => button.textContent === 'Delete',
    );
    expect(deleteButton).toBeTruthy();

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Deleted revu-backup-20260603T081500Z.json.') ?? false);
    expect(deleteStoredBackup).toHaveBeenCalledWith('session-token', 'revu-backup-20260603T081500Z.json');

    const workflowLink = Array.from(container.querySelectorAll('.sidebar-nav .nav-link')).find(
      (link) => link.textContent === 'Workflow',
    ) as HTMLAnchorElement | undefined;
    expect(workflowLink).toBeTruthy();

    await act(async () => {
      workflowLink?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => window.location.pathname === '/workflow');
    expect(container.textContent).toContain('Active assessment lifecycle');
    expect(container.textContent).toContain('Sidebar visibility: all');
  });

  it('saves automatic backup schedule, retention, and enablement settings', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());
    vi.mocked(updateBackupStatus).mockResolvedValue(
      createBackupStatusExample({
        automaticBackupsEnabled: false,
        schedule: 'weekly',
        retentionCount: 5,
      }),
    );

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/file-management');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Automatic backups') ?? false);

    const enableField = container.querySelector('select[aria-label="Automatic backups enabled"]') as HTMLSelectElement | null;
    const periodField = container.querySelector('select[aria-label="Backup period"]') as HTMLSelectElement | null;
    const retentionField = container.querySelector('input[aria-label="Backup retention count"]') as HTMLInputElement | null;
    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save automatic backups',
    );

    expect(enableField).toBeTruthy();
    expect(periodField).toBeTruthy();
    expect(retentionField).toBeTruthy();
    expect(saveButton).toBeTruthy();

    await act(async () => {
      if (enableField) {
        setFieldValue(enableField, 'disabled');
      }
      if (periodField) {
        setFieldValue(periodField, 'weekly');
      }
      if (retentionField) {
        setFieldValue(retentionField, '5');
      }
      await flushRender();
    });

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Updated automatic backup settings.') ?? false);

    expect(updateBackupStatus).toHaveBeenCalledWith('session-token', {
      automaticBackupsEnabled: false,
      schedule: 'weekly',
      retentionCount: 5,
    });
    expect(container.textContent).toContain('Keep latest 5 backups');
    expect(container.textContent).toContain('Disabled');
    expect(container.textContent).toContain('weekly');
  });
});

describe('sidebar refresh detection', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.pushState(null, '', '/dashboard');
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.resetAllMocks();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('shows a refresh button after the API recovers from an outage', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());
    vi.mocked(checkApiHealth).mockResolvedValue(true);

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Signed in as') === true);

    await act(async () => {
      window.dispatchEvent(new Event('revu:api-unavailable'));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('New version. Refresh Now') === true);
    expect(vi.mocked(checkApiHealth)).toHaveBeenCalled();
  });
});

describe('sidebar profile editor', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.pushState(null, '', '/dashboard');
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.resetAllMocks();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('opens from the sidebar username and updates the signed-in user profile and password', async () => {
    const session = createEmployeeSession();
    const updatedSession: AuthSession = {
      ...session,
      user: {
        ...session.user,
        fullName: 'Elliot Updated',
        email: 'elliot.updated@example.com',
      },
    };
    const changedPasswordSession: AuthSession = {
      ...updatedSession,
      token: 'updated-session-token',
    };

    vi.mocked(me).mockResolvedValue({ session });
    vi.mocked(getFoundation).mockResolvedValue(structuredClone(foundationSnapshotExample));
    vi.mocked(getApiIndex).mockResolvedValue({
      name: 'revu-api',
      version: '0.1.0',
      seededAccountsAvailable: true,
      resources: [],
    });
    vi.mocked(updateOwnProfile).mockResolvedValue({ session: updatedSession });
    vi.mocked(changePassword).mockResolvedValue({
      session: changedPasswordSession,
      lastPasswordChangeAt: '2026-06-01T12:00:00.000Z',
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Signed in as') ?? false);

    const usernameButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === session.user.username,
    );
    expect(usernameButton).toBeTruthy();

    await act(async () => {
      usernameButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Profile editor') ?? false);

    const fullNameInput = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Full name'))
      ?.querySelector('input') as HTMLInputElement | null;
    const emailInput = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Email'))
      ?.querySelector('input') as HTMLInputElement | null;
    const currentPasswordInput = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Current password'))
      ?.querySelector('input') as HTMLInputElement | null;
    const newPasswordInput = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('New password'))
      ?.querySelector('input') as HTMLInputElement | null;
    const confirmPasswordInput = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Confirm new password'))
      ?.querySelector('input') as HTMLInputElement | null;

    expect(fullNameInput).toBeTruthy();
    expect(emailInput).toBeTruthy();
    expect(currentPasswordInput).toBeTruthy();
    expect(newPasswordInput).toBeTruthy();
    expect(confirmPasswordInput).toBeTruthy();

    await act(async () => {
      if (fullNameInput) {
        setFieldValue(fullNameInput, 'Elliot Updated');
      }
      if (emailInput) {
        setFieldValue(emailInput, 'elliot.updated@example.com');
      }
      if (currentPasswordInput) {
        setFieldValue(currentPasswordInput, 'EmployeePass123!');
      }
      if (newPasswordInput) {
        setFieldValue(newPasswordInput, 'NewProfilePass123!');
      }
      if (confirmPasswordInput) {
        setFieldValue(confirmPasswordInput, 'NewProfilePass123!');
      }
      await flushRender();
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save profile');
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(updateOwnProfile).toHaveBeenCalledWith('session-token', {
      fullName: 'Elliot Updated',
      email: 'elliot.updated@example.com',
    });
    expect(changePassword).toHaveBeenCalledWith('session-token', {
      currentPassword: 'EmployeePass123!',
      newPassword: 'NewProfilePass123!',
    });
    expect(window.sessionStorage.getItem('revu-session-token')).toBe('updated-session-token');
    await waitFor(() => container.textContent?.includes('Elliot Updated') ?? false);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('dashboard workflow surface', () => {
  let container: HTMLDivElement;
  let root: Root;

  function createSubmittedWorkflowSnapshot(): FoundationSnapshot {
    return structuredClone({
      ...foundationSnapshotExample,
      assessments: foundationSnapshotExample.assessments.map((assessment) =>
        assessment.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          ? {
              ...assessment,
              reviewState: 'submitted' as const,
              acceptedAt: null,
              acceptedByEmployeeId: null,
              readyForMeetingAt: null,
              scheduledAt: null,
              scheduledByEmployeeId: null,
              reviewer1Notes: null,
              reviewer1CompletedAt: null,
              reviewer1CompletedByEmployeeId: null,
              reviewer2Notes: null,
              reviewer2CompletedAt: null,
              reviewer2CompletedByEmployeeId: null,
              concludedAt: null,
              concludedByEmployeeId: null,
              reviewedAt: null,
              reviewedByEmployeeId: null,
              isReadOnly: true,
            }
          : assessment,
      ),
    }) as FoundationSnapshot;
  }

  function createAcceptedWorkflowSnapshot(): FoundationSnapshot {
    return structuredClone({
      ...foundationSnapshotExample,
      assessments: foundationSnapshotExample.assessments.map((assessment) =>
        assessment.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          ? {
              ...assessment,
              reviewState: 'accepted' as const,
              acceptedAt: '2026-02-16T08:00:00.000Z',
              acceptedByEmployeeId: mannyManager.id,
              readyForMeetingAt: null,
              scheduledAt: null,
              scheduledByEmployeeId: null,
              reviewer1Notes: null,
              reviewer1CompletedAt: null,
              reviewer1CompletedByEmployeeId: null,
              reviewer2Notes: null,
              reviewer2CompletedAt: null,
              reviewer2CompletedByEmployeeId: null,
              concludedAt: null,
              concludedByEmployeeId: null,
              reviewedAt: null,
              reviewedByEmployeeId: null,
              managerNotes: 'Ready for meeting.',
              isReadOnly: true,
            }
          : assessment,
      ),
    }) as FoundationSnapshot;
  }

  function createReadyForMeetingWorkflowSnapshot(): FoundationSnapshot {
    return structuredClone({
      ...foundationSnapshotExample,
      assessments: foundationSnapshotExample.assessments.map((assessment) =>
        assessment.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          ? {
              ...assessment,
              reviewState: 'ready_for_meeting' as const,
              acceptedAt: '2026-02-16T08:00:00.000Z',
              acceptedByEmployeeId: mannyManager.id,
              readyForMeetingAt: '2026-02-17T08:00:00.000Z',
              scheduledAt: null,
              scheduledByEmployeeId: null,
              reviewer1Notes: null,
              reviewer1CompletedAt: null,
              reviewer1CompletedByEmployeeId: null,
              reviewer2Notes: null,
              reviewer2CompletedAt: null,
              reviewer2CompletedByEmployeeId: null,
              concludedAt: null,
              concludedByEmployeeId: null,
              reviewedAt: null,
              reviewedByEmployeeId: null,
              managerNotes: 'Ready for meeting.',
              isReadOnly: true,
            }
          : assessment,
      ),
    }) as FoundationSnapshot;
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.pushState(null, '', '/dashboard');
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.resetAllMocks();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('redirects legacy /reviews links to dashboard manager actions and opens the selected assessment in a dialog', async () => {
    vi.mocked(me).mockResolvedValue({ session: createManagerSession() });
    vi.mocked(getFoundation).mockResolvedValue(createSubmittedWorkflowSnapshot());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/reviews');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Submitted assessments') ?? false);

    expect(window.location.pathname).toBe('/dashboard');
    expect(container.textContent).toContain('Manager workflow');
    expect(container.textContent).toContain('Submitted assessments');
    expect(container.textContent).toContain('Name');
    expect(container.textContent).toContain('Work');
    expect(container.textContent).toContain('Responsibility');
    expect(container.textContent).toContain('Due');
    expect(container.textContent).toContain('2/28/2026');
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    const submittedRow = Array.from(container.querySelectorAll('.review-queue-item')).find(
      (button) =>
        button.textContent?.includes('Elliot Employee') &&
        button.textContent?.includes('Self assessment') &&
        button.textContent?.includes('Submitted'),
    );
    expect(submittedRow).toBeTruthy();

    await act(async () => {
      submittedRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') !== null);

    expect(container.textContent).toContain('Submitted assessment');
    expect(container.textContent).toContain('Responses');
    expect(container.textContent).toContain('Manager notes');
    expect(container.textContent).not.toContain('Review panel');
    expect(container.textContent).not.toContain('Adjust assignments');
    expect(container.textContent).not.toContain('Details');

    const dialog = container.querySelector('[role="dialog"]');
    const responseHeaderLabels = Array.from(dialog?.querySelectorAll('.review-response-header span') ?? []).map((cell) =>
      cell.textContent?.trim(),
    );
    expect(responseHeaderLabels).toEqual(['Question', 'Response', 'Category']);

    const responseMetaCells = Array.from(dialog?.querySelectorAll('.review-response-meta') ?? []);
    expect(responseMetaCells.length).toBeGreaterThan(0);
    expect(responseMetaCells.every((cell) => cell.querySelectorAll('span').length === 1)).toBe(true);
    const responseMetaText = responseMetaCells.map((cell) => cell.textContent?.toLowerCase() ?? '').join(' ');
    expect(responseMetaText).not.toContain('subjective');
    expect(responseMetaText).not.toContain('ranking');
    expect(responseMetaText).not.toContain('narrative');

    const closeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Close');
    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps manager actions on the dashboard and closes the acceptance dialog from the backdrop', async () => {
    vi.mocked(me).mockResolvedValue({ session: createManagerSession() });
    vi.mocked(getFoundation).mockResolvedValue(createSubmittedWorkflowSnapshot());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Submitted assessments') ?? false);

    const submittedRow = Array.from(container.querySelectorAll('.review-queue-item')).find(
      (button) =>
        button.textContent?.includes('Elliot Employee') &&
        button.textContent?.includes('Self assessment') &&
        button.textContent?.includes('Submitted'),
    );
    expect(submittedRow).toBeTruthy();

    await act(async () => {
      submittedRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') !== null);

    await act(async () => {
      container.querySelector('.modal-backdrop')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps accept workflow actions inside the dialog and refreshes the dashboard queues after acceptance', async () => {
    const initialSnapshot = createSubmittedWorkflowSnapshot();
    const acceptedSnapshot = createSubmittedWorkflowSnapshot();
    acceptedSnapshot.assessments = acceptedSnapshot.assessments.map((assessment) =>
      assessment.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        ? {
            ...assessment,
            reviewState: 'accepted' as const,
            acceptedAt: '2026-02-16T08:00:00.000Z',
            acceptedByEmployeeId: mannyManager.id,
            managerNotes: 'Ready for meeting.',
          }
        : assessment,
    ) as FoundationSnapshot['assessments'];

    vi.mocked(me).mockResolvedValue({ session: createManagerSession() });
    vi.mocked(getFoundation).mockResolvedValueOnce(initialSnapshot).mockResolvedValue(acceptedSnapshot);
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(acceptAssessment).mockResolvedValue({
      item: acceptedSnapshot.assessments.find((assessment) => assessment.id === 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')!,
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Submitted assessments') ?? false);

    const submittedRow = Array.from(container.querySelectorAll('.review-queue-item')).find(
      (button) =>
        button.textContent?.includes('Elliot Employee') &&
        button.textContent?.includes('Self assessment') &&
        button.textContent?.includes('Submitted'),
    );

    await act(async () => {
      submittedRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const reviewNotes = container.querySelector('textarea[aria-label="Manager notes"]') as HTMLTextAreaElement | null;
    expect(reviewNotes).toBeTruthy();

    await act(async () => {
      if (reviewNotes) {
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set?.call(
          reviewNotes,
          'Ready for meeting.',
        );
        reviewNotes.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await flushRender();
    });

    const acceptButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Accept assessment',
    );
    expect(acceptButton).toBeTruthy();

    await act(async () => {
      acceptButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => vi.mocked(acceptAssessment).mock.calls.length === 1);

    expect(acceptAssessment).toHaveBeenCalledWith('session-token', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', {
      managerNotes: 'Ready for meeting.',
    });

    await waitFor(() => container.textContent?.includes('Accepted sets ready for meeting') ?? false);
    expect(container.textContent).toContain('Assessment accepted. The dashboard now tracks the set in the ready-for-meeting queue.');
  });

  it('opens the ready-for-meeting summary dialog before moving an accepted set forward', async () => {
    const initialSnapshot = createAcceptedWorkflowSnapshot();
    const refreshedSnapshot = createReadyForMeetingWorkflowSnapshot();

    vi.mocked(me).mockResolvedValue({ session: createManagerSession() });
    vi.mocked(getFoundation).mockResolvedValueOnce(initialSnapshot).mockResolvedValue(refreshedSnapshot);
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(markAssessmentSetReadyForMeeting).mockResolvedValue({
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeId: '33333333-3333-4333-8333-333333333333',
      items: refreshedSnapshot.assessments.filter((assessment) => assessment.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Accepted sets ready for meeting') ?? false);

    const readyRow = Array.from(container.querySelectorAll('.review-queue-item')).find(
      (button) =>
        button.textContent?.includes('Elliot Employee') &&
        button.textContent?.includes('Accepted') &&
        button.textContent?.includes('Ready for meeting'),
    );
    expect(readyRow).toBeTruthy();

    await act(async () => {
      readyRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Assessments in this set') ?? false);

    expect(container.textContent).toContain('Ready for meeting');
    expect(container.textContent).toContain('Reviewer responsibilities');
    expect(container.textContent).toContain('Reviewer 1 records the first conclusion after the meeting');
    expect(container.textContent).toContain('Mark ready for meeting');

    const readyButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Mark ready for meeting',
    );
    expect(readyButton).toBeTruthy();

    await act(async () => {
      readyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => vi.mocked(markAssessmentSetReadyForMeeting).mock.calls.length === 1);

    expect(markAssessmentSetReadyForMeeting).toHaveBeenCalledWith('session-token', {
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeId: '33333333-3333-4333-8333-333333333333',
    });
    expect(container.textContent).toContain('Assessment set marked ready for meeting.');
  });

  it('asks for confirmation before returning a submitted assessment to incomplete', async () => {
    const initialSnapshot = createSubmittedWorkflowSnapshot();
    const refreshedSnapshot = createSubmittedWorkflowSnapshot();
    refreshedSnapshot.assessments = refreshedSnapshot.assessments.map((assessment) =>
      assessment.id === 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
        ? {
            ...assessment,
            reviewState: 'draft' as const,
            submittedAt: null,
            isReadOnly: false,
            managerNotes: 'Please add one concrete example.',
          }
        : assessment,
    );

    vi.mocked(me).mockResolvedValue({ session: createManagerSession() });
    vi.mocked(getFoundation).mockResolvedValueOnce(initialSnapshot).mockResolvedValue(refreshedSnapshot);
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(rejectAssessmentToDraft).mockResolvedValue({
      item: refreshedSnapshot.assessments.find((assessment) => assessment.id === 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')!,
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Submitted assessments') ?? false);

    const submittedRow = Array.from(container.querySelectorAll('.review-queue-item')).find(
      (button) =>
        button.textContent?.includes('Elliot Employee') &&
        button.textContent?.includes('Self assessment') &&
        button.textContent?.includes('Submitted'),
    );
    expect(submittedRow).toBeTruthy();

    await act(async () => {
      submittedRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const reviewNotes = container.querySelector('textarea[aria-label="Manager notes"]') as HTMLTextAreaElement | null;
    expect(reviewNotes).toBeTruthy();

    await act(async () => {
      setFieldValue(reviewNotes!, 'Please add one concrete example.');
      await flushRender();
    });

    const openReturnButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Return to incomplete',
    );
    expect(openReturnButton).toBeTruthy();

    await act(async () => {
      openReturnButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Your manager notes will be saved with the return message.') ?? false);

    const dialogs = Array.from(container.querySelectorAll('[role="dialog"]'));
    const confirmDialog = dialogs[dialogs.length - 1] as HTMLElement | undefined;
    const confirmButton = Array.from(confirmDialog?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Return to incomplete',
    );
    expect(confirmButton).toBeTruthy();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => vi.mocked(rejectAssessmentToDraft).mock.calls.length === 1);

    expect(rejectAssessmentToDraft).toHaveBeenCalledWith('session-token', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', {
      managerNotes: 'Please add one concrete example.',
    });
    expect(container.textContent).toContain('Assessment returned to incomplete so the employee can edit it again.');
  });

  it('shows reviewer-specific conclusion copy and records reviewer notes from the dashboard', async () => {
    const initialSnapshot = structuredClone(foundationSnapshotExample);
    const refreshedSnapshot = structuredClone(foundationSnapshotExample);
    refreshedSnapshot.assessments = refreshedSnapshot.assessments.map((assessment) =>
      assessment.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        ? {
            ...assessment,
            reviewer2Notes: 'Confirmed final follow-up.',
            reviewer2CompletedAt: '2026-02-19T12:00:00.000Z',
            reviewer2CompletedByEmployeeId: mannyManager.id,
          }
        : assessment,
    );

    vi.mocked(me).mockResolvedValue({ session: createManagerSession() });
    vi.mocked(getFoundation).mockResolvedValueOnce(initialSnapshot).mockResolvedValue(refreshedSnapshot);
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(concludeAssessmentSet).mockResolvedValue({
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeId: '33333333-3333-4333-8333-333333333333',
      items: refreshedSnapshot.assessments.filter((assessment) => assessment.reviewPeriodId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Scheduled work assigned to you') ?? false);

    const reviewerRow = Array.from(container.querySelectorAll('.review-queue-item')).find(
      (button) =>
        button.textContent?.includes('Elliot Employee') &&
        button.textContent?.includes('Reviewer 2') &&
        button.textContent?.includes('Conclude review'),
    );
    expect(reviewerRow).toBeTruthy();

    await act(async () => {
      reviewerRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Reviewer 2 records the final conclusion after the meeting') ?? false);

    const reviewerNotes = container.querySelector('textarea[aria-label="Reviewer 2 notes"]') as HTMLTextAreaElement | null;
    expect(reviewerNotes).toBeTruthy();

    await act(async () => {
      setFieldValue(reviewerNotes!, 'Confirmed final follow-up.');
      await flushRender();
    });

    const concludeButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Record Reviewer 2 conclusion',
    );
    expect(concludeButton).toBeTruthy();

    await act(async () => {
      concludeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => vi.mocked(concludeAssessmentSet).mock.calls.length === 1);

    expect(concludeAssessmentSet).toHaveBeenCalledWith('session-token', {
      reviewPeriodId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeId: '33333333-3333-4333-8333-333333333333',
      reviewerRole: 'reviewer2',
      completed: true,
      reviewerNotes: 'Confirmed final follow-up.',
    });
    expect(container.textContent).toContain('Reviewer 2 conclusion recorded.');
  });

});

describe('dashboard screen', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.pushState(null, '', '/dashboard');
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.resetAllMocks();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('keeps the queue on the dashboard and opens assessment editing in a dialog', async () => {
    const dashboardSnapshot = cloneQuestionSlice();
    dashboardSnapshot.questionSets[0] = {
      ...dashboardSnapshot.questionSets[0]!,
      questions: dashboardSnapshot.questionSets[0]!.questions.map((question, index) =>
        index === 0 ? { ...question, category: null } : question,
      ),
    };
    dashboardSnapshot.assessments = dashboardSnapshot.assessments.map((assessment) =>
      assessment.id === 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
        ? {
            ...assessment,
            reviewState: 'draft',
            isReadOnly: false,
            submittedAt: null,
            acceptedAt: null,
            acceptedByEmployeeId: null,
            reviewedAt: null,
            reviewedByEmployeeId: null,
            responses: [
              {
                questionId: 'aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa',
                order: 1,
                response: 'somewhat agree',
              },
              {
                questionId: 'aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa',
                order: 2,
                response: '',
              },
            ],
          }
        : assessment,
    );

    vi.mocked(me).mockResolvedValue({ session: createEmployeeSession() });
    vi.mocked(getFoundation).mockResolvedValue(dashboardSnapshot);

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment Queue') ?? false);

    expect(container.textContent).toContain('Assessment Queue');
    expect(container.textContent).toContain('Name');
    expect(container.textContent).toContain('Work');
    expect(container.textContent).toContain('Responsibility');
    expect(container.textContent).toContain('Due');
    expect(container.textContent).toContain('2/21/2026');
    expect(container.textContent).toContain('Status');
    const dashboardAssessorField = Array.from(container.querySelectorAll('.dashboard-identity-field')).find((field) =>
      field.textContent?.includes('Assessors'),
    );
    expect(dashboardAssessorField?.textContent).not.toContain('Assessor 1:');
    expect(dashboardAssessorField?.textContent).not.toContain('Assessor 2:');
    const dashboardReviewerField = Array.from(container.querySelectorAll('.dashboard-identity-field')).find((field) =>
      field.textContent?.includes('Reviewers'),
    );
    expect(dashboardReviewerField?.textContent).toContain('Ada Admin');
    expect(dashboardReviewerField?.textContent).toContain('Manny Manager');
    expect(dashboardReviewerField?.textContent).not.toContain('Reviewer 1:');
    expect(dashboardReviewerField?.textContent).not.toContain('Reviewer 2:');
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    const openButton = container.querySelector('.dashboard-queue-item');
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') !== null);

    expect(container.textContent).toContain('Self assessment form');
    expect(container.textContent).not.toContain('2026 Self Questions');
    expect(container.textContent).toContain('Save for later');
    expect(Array.from(container.querySelectorAll('.assessment-editor-category h4')).map((heading) => heading.textContent)).toEqual([
      'Growth',
    ]);
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(5);

    const closeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Close');
    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('refreshes the dashboard assessment queue from the header icon', async () => {
    vi.mocked(me).mockResolvedValue({ session: createEmployeeSession() });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment Queue') ?? false);

    vi.mocked(getFoundation).mockClear();

    const refreshButton = container.querySelector('button[aria-label="Refresh assessment queue"]') as HTMLButtonElement | null;
    expect(refreshButton).toBeTruthy();

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => vi.mocked(getFoundation).mock.calls.length === 1);
  });

  it('uses submit to save draft changes even before an assessment is complete', async () => {
    const dashboardSnapshot = cloneQuestionSlice();
    dashboardSnapshot.assessments = dashboardSnapshot.assessments.map((assessment) =>
      assessment.id === 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
        ? {
            ...assessment,
            reviewState: 'new',
            isReadOnly: false,
            submittedAt: null,
            acceptedAt: null,
            acceptedByEmployeeId: null,
            reviewedAt: null,
            reviewedByEmployeeId: null,
            responses: [],
          }
        : assessment,
    );

    vi.mocked(me).mockResolvedValue({ session: createEmployeeSession() });
    vi.mocked(getFoundation).mockResolvedValue(dashboardSnapshot);
    vi.mocked(saveAssessmentDraft).mockResolvedValue({
      item: {
        ...dashboardSnapshot.assessments.find((assessment) => assessment.id === 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')!,
        reviewState: 'draft',
      },
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment Queue') ?? false);

    const openButton = container.querySelector('.dashboard-queue-item');
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') !== null);

    const narrativeResponse = container.querySelector('.assessment-editor-question textarea') as HTMLTextAreaElement | null;
    expect(narrativeResponse).toBeTruthy();

    await act(async () => {
      setFieldValue(narrativeResponse!, 'Saving partial progress before completing the form.');
      await flushRender();
    });

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Submit');
    expect(submitButton).toBeTruthy();
    expect(submitButton?.getAttribute('disabled')).toBeNull();

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(saveAssessmentDraft).toHaveBeenCalledWith('session-token', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', {
      responses: [
        {
          questionId: 'aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa',
          order: 1,
          response: '',
        },
        {
          questionId: 'aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa',
          order: 2,
          response: 'Saving partial progress before completing the form.',
        },
      ],
    });
    expect(submitAssessment).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Assessment saved for later. Complete every response before submitting.');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('closes the assessment dialog after a successful submit', async () => {
    const initialSnapshot = createAssessmentLifecycleSnapshot('draft');
    const refreshedSnapshot = createAssessmentLifecycleSnapshot('submitted');

    vi.mocked(me).mockResolvedValue({ session: createEmployeeSession() });
    vi.mocked(getFoundation).mockResolvedValueOnce(initialSnapshot).mockResolvedValue(refreshedSnapshot);
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());
    vi.mocked(submitAssessment).mockResolvedValue({
      item: refreshedSnapshot.assessments.find((assessment) => assessment.id === 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')!,
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment Queue') ?? false);

    const openButton = container.querySelector('.dashboard-queue-item');
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') !== null);

    const narrativeResponse = container.querySelector('.assessment-editor-question textarea') as HTMLTextAreaElement | null;
    expect(narrativeResponse).toBeTruthy();

    await act(async () => {
      setFieldValue(narrativeResponse!, 'Completed and ready to submit.');
      await flushRender();
    });

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Submit');
    expect(submitButton).toBeTruthy();

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') === null);
    expect(submitAssessment).toHaveBeenCalledWith('session-token', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', {
      responses: [
        {
          questionId: 'aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa',
          order: 1,
          response: 'somewhat agree',
        },
        {
          questionId: 'aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa',
          order: 2,
          response: 'Completed and ready to submit.',
        },
      ],
    });
  });
});

describe('employees screen', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.pushState(null, '', '/employees');
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.resetAllMocks();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('uses a single employee table and keeps edit and password actions in employee dialogs', async () => {
    const elliot = employeesListExample.items.find((employee) => employee.username === 'elliot.employee')!;
    const ada = employeesListExample.items.find((employee) => employee.username === 'ada.admin')!;
    const pat = employeesListExample.items.find((employee) => employee.username === 'pat.peer')!;
    const updatedEmployee = {
      ...createEmployeeDetail(elliot.id).item,
      fullName: 'Elliot Updated',
      assessor2Id: pat.id,
      reviewer1Id: pat.id,
      reviewer2Id: ada.id,
    };

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(structuredClone(foundationSnapshotExample));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockImplementation(async (_sessionToken, employeeId) => createEmployeeDetail(employeeId));
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: [] });
    vi.mocked(updateEmployee).mockResolvedValue({ item: updatedEmployee });
    vi.mocked(resetEmployeePassword).mockResolvedValue({
      employeeId: elliot.id,
      passwordResetRequired: true,
      temporaryPassword: 'OneTime123!',
      lastPasswordChangeAt: '2026-02-01T08:00:00.000Z',
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Employee directory') ?? false);

    expect(container.textContent).toContain('Status');
    expect(container.textContent).not.toContain('Active employees');
    expect(container.textContent).not.toContain('Inactive employees');
    expect(container.textContent).not.toContain('Local user transfer files');
    expect(container.textContent).not.toContain('Import users');

    const elliotRow = Array.from(container.querySelectorAll('.employee-row-card')).find((row) =>
      row.textContent?.includes('Elliot Employee'),
    );
    expect(elliotRow).toBeTruthy();
    expect(elliotRow?.textContent).not.toContain('Assessor 1:');
    expect(elliotRow?.textContent).not.toContain('Assessor 2:');
    expect(elliotRow?.textContent).not.toContain('Reviewer 1:');
    expect(elliotRow?.textContent).not.toContain('Reviewer 2:');

    const summaryButton = elliotRow?.querySelector('.employee-row-summary') as HTMLButtonElement | null;
    expect(summaryButton).toBeTruthy();
    expect(Array.from(elliotRow?.querySelectorAll('button') ?? []).some((button) => button.textContent === 'Edit')).toBe(false);
    expect(Array.from(elliotRow?.querySelectorAll('button') ?? []).some((button) => button.textContent === 'Password')).toBe(false);

    await act(async () => {
      summaryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') !== null);

    expect(container.textContent).toContain('Employee detail');
    expect(container.textContent).toContain('Password configured');
    expect(container.textContent).toContain('Reviewers');
    expect(container.textContent).toContain('Reviewer 1: Ada Admin');
    expect(container.textContent).toContain('Reviewer 2: Manny Manager');
    const editButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Edit');
    expect(editButton).toBeTruthy();

    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Edit employee') ?? false);

    const managerSelect = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Manager'))
      ?.querySelector('select') as HTMLSelectElement | null;
    const assessorSelect = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Assessor 2'))
      ?.querySelector('select') as HTMLSelectElement | null;
    const reviewer1Select = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Reviewer 1'))
      ?.querySelector('select') as HTMLSelectElement | null;
    const reviewer2Select = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Reviewer 2'))
      ?.querySelector('select') as HTMLSelectElement | null;
    const fullNameInput = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Full name'))
      ?.querySelector('input') as HTMLInputElement | null;

    expect(managerSelect).toBeTruthy();
    expect(assessorSelect).toBeTruthy();
    expect(reviewer1Select).toBeTruthy();
    expect(reviewer2Select).toBeTruthy();
    expect(fullNameInput).toBeTruthy();
    expect(Array.from(managerSelect?.options ?? [], (option) => option.textContent)).toEqual([
      'Not assigned',
      'Ada Admin',
      'Manny Manager',
    ]);
    expect(Array.from(assessorSelect?.options ?? [], (option) => option.textContent)).not.toContain('Elliot Employee');
    expect(Array.from(reviewer1Select?.options ?? [], (option) => option.textContent)).not.toContain('Elliot Employee');
    expect(Array.from(reviewer2Select?.options ?? [], (option) => option.textContent)).not.toContain('Elliot Employee');
    expect(container.textContent).toContain(
      'Reviewer 1 and reviewer 2 must be different people and cannot be the employee. Reviewers may also be the manager or an assessor.',
    );

    await act(async () => {
      if (fullNameInput) {
        setFieldValue(fullNameInput, 'Elliot Updated');
      }
      if (assessorSelect) {
        setFieldValue(assessorSelect, pat.id);
      }
      if (reviewer1Select) {
        setFieldValue(reviewer1Select, pat.id);
      }
      if (reviewer2Select) {
        setFieldValue(reviewer2Select, ada.id);
      }
      await flushRender();
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save employee');
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Elliot Updated') ?? false);

    expect(updateEmployee).toHaveBeenCalledWith('session-token', elliot.id, {
      username: 'elliot.employee',
      fullName: 'Elliot Updated',
      email: 'elliot.employee@example.com',
      role: 'employee',
      status: 'active',
      managerId: mannyManager.id,
      assessor1Id: createEmployeeDetail(elliot.id).item.assessor1Id,
      assessor2Id: pat.id,
      reviewer1Id: pat.id,
      reviewer2Id: ada.id,
    });

    const updatedDetailCloseButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Close');
    await act(async () => {
      updatedDetailCloseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const updatedRow = Array.from(container.querySelectorAll('.employee-row-card')).find((row) =>
      row.textContent?.includes('Elliot Updated'),
    );
    const passwordButton = Array.from(updatedRow?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Password',
    );
    expect(passwordButton).toBeFalsy();

    const updatedSummaryButton = updatedRow?.querySelector('.employee-row-summary') as HTMLButtonElement | null;
    expect(updatedSummaryButton).toBeTruthy();

    await act(async () => {
      updatedSummaryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Employee detail') ?? false);

    const managePasswordButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Manage password',
    );
    expect(managePasswordButton).toBeTruthy();

    await act(async () => {
      managePasswordButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Password management') ?? false);
    expect(container.textContent).toContain('Set password');
    expect((container.querySelector('input[placeholder="Enter a new password"]') as HTMLInputElement | null)).toBeTruthy();

    await waitFor(() =>
      Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Generate one-time passcode'),
    );

    const resetButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Generate one-time passcode',
    );
    expect(resetButton).toBeTruthy();

    await act(async () => {
      resetButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('One-time passcode: OneTime123!') ?? false);

    expect(resetEmployeePassword).toHaveBeenCalledWith('session-token', elliot.id);
  });

  it('refreshes the employee directory from the header icon', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(structuredClone(foundationSnapshotExample));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: [] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Employee directory') ?? false);

    vi.mocked(listEmployees).mockClear();

    const refreshButton = container.querySelector('button[aria-label="Refresh employee directory"]') as HTMLButtonElement | null;
    expect(refreshButton).toBeTruthy();

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => vi.mocked(listEmployees).mock.calls.length === 1);
  });

  it('restores the employee directory search after a remount', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(structuredClone(foundationSnapshotExample));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: [] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Employee directory') ?? false);

    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement | null;
    expect(searchInput).toBeTruthy();

    await act(async () => {
      setFieldValue(searchInput!, 'Elliot');
      await flushRender();
    });

    expect(container.querySelectorAll('.employee-row-card')).toHaveLength(1);

    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Employee directory') ?? false);

    const restoredSearchInput = container.querySelector('input[type="search"]') as HTMLInputElement | null;
    expect(restoredSearchInput?.value).toBe('Elliot');
    expect(container.querySelectorAll('.employee-row-card')).toHaveLength(1);
  });

  it('validates reviewer assignments before saving employee edits', async () => {
    const elliot = employeesListExample.items.find((employee) => employee.username === 'elliot.employee')!;
    const pat = employeesListExample.items.find((employee) => employee.username === 'pat.peer')!;

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(structuredClone(foundationSnapshotExample));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockImplementation(async (_sessionToken, employeeId) => createEmployeeDetail(employeeId));
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: [] });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Employee directory') ?? false);

    const elliotRow = Array.from(container.querySelectorAll('.employee-row-card')).find((row) =>
      row.textContent?.includes('Elliot Employee'),
    );
    const summaryButton = elliotRow?.querySelector('.employee-row-summary') as HTMLButtonElement | null;

    await act(async () => {
      summaryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const editButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Edit');
    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Edit employee') ?? false);

    const reviewer1Select = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Reviewer 1'))
      ?.querySelector('select') as HTMLSelectElement | null;
    const reviewer2Select = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Reviewer 2'))
      ?.querySelector('select') as HTMLSelectElement | null;
    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save employee');

    await act(async () => {
      if (reviewer1Select) {
        setFieldValue(reviewer1Select, pat.id);
      }
      if (reviewer2Select) {
        setFieldValue(reviewer2Select, pat.id);
      }
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(container.textContent).toContain('Reviewer 1 and reviewer 2 must be different users.');
    expect(updateEmployee).not.toHaveBeenCalled();
  });

  it('filters the employee directory live from the search box', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(structuredClone(foundationSnapshotExample));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockImplementation(async (_sessionToken, employeeId) => createEmployeeDetail(employeeId));
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: [] });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Employee directory') ?? false);

    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement | null;
    expect(searchInput).toBeTruthy();

    await act(async () => {
      setFieldValue(searchInput!, 'pat.peer@example.com');
      await flushRender();
    });

    const filteredRows = Array.from(container.querySelectorAll('.employee-row-card'), (row) => row.textContent ?? '');
    expect(filteredRows.some((text) => text.includes('Pat Peer'))).toBe(true);
    expect(filteredRows.some((text) => text.includes('Elliot Employee'))).toBe(false);

    await act(async () => {
      setFieldValue(searchInput!, '');
      await flushRender();
    });

    expect(Array.from(container.querySelectorAll('.employee-row-card')).some((row) => row.textContent?.includes('Elliot Employee'))).toBe(
      true,
    );
  });

  it('marks active employees inactive from the employee detail dialog', async () => {
    const elliot = employeesListExample.items.find((employee) => employee.username === 'elliot.employee')!;

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(structuredClone(foundationSnapshotExample));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockImplementation(async (_sessionToken, employeeId) => createEmployeeDetail(employeeId));
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: [] });
    vi.mocked(updateEmployee).mockResolvedValue({
      item: {
        ...createEmployeeDetail(elliot.id).item,
        status: 'inactive',
      },
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Employee directory') ?? false);

    const elliotRow = Array.from(container.querySelectorAll('.employee-row-card')).find((row) =>
      row.textContent?.includes('Elliot Employee'),
    );
    const summaryButton = elliotRow?.querySelector('.employee-row-summary') as HTMLButtonElement | null;

    await act(async () => {
      summaryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Employee detail') ?? false);

    const makeInactiveButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Make Inactive',
    );
    expect(makeInactiveButton).toBeTruthy();

    await act(async () => {
      makeInactiveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(updateEmployee).toHaveBeenCalledWith('session-token', elliot.id, {
      status: 'inactive',
    });
    await waitFor(
      () => !Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Make Inactive'),
    );
    expect(container.querySelector('.employee-dialog-card .employee-status-pill')?.textContent).toBe('inactive');
  });

  it('lets admins tombstone-delete employees from the edit dialog', async () => {
    const elliot = employeesListExample.items.find((employee) => employee.username === 'elliot.employee')!;
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(structuredClone(foundationSnapshotExample));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockImplementation(async (_sessionToken, employeeId) => createEmployeeDetail(employeeId));
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: [] });
    vi.mocked(deleteEmployee).mockResolvedValue({
      employeeId: elliot.id,
      deleted: true,
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Employee directory') ?? false);

    const elliotRow = Array.from(container.querySelectorAll('.employee-row-card')).find((row) =>
      row.textContent?.includes('Elliot Employee'),
    );
    const summaryButton = elliotRow?.querySelector('.employee-row-summary') as HTMLButtonElement | null;

    await act(async () => {
      summaryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Employee detail') ?? false);

    const editButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Edit');
    expect(editButton).toBeTruthy();

    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Edit employee') ?? false);

    const deleteButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Delete Employee');
    expect(deleteButton).toBeTruthy();

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete this employee? The employee will be removed from the app and kept as a hidden tombstone in the database.',
    );
    expect(deleteEmployee).toHaveBeenCalledWith('session-token', elliot.id);
    expect(container.textContent).toContain('Employee deleted.');
    expect(
      Array.from(container.querySelectorAll('.employee-row-card')).some((row) => row.textContent?.includes('Elliot Employee') ?? false),
    ).toBe(false);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders tombstone-linked employee relationships as deleted user', async () => {
    const deletedManagerId = '99999999-9999-4999-8999-999999999999';
    const elliot = employeesListExample.items.find((employee) => employee.username === 'elliot.employee')!;
    const employeesWithDeletedRelationship = {
      items: employeesListExample.items.map((employee) =>
        employee.id === elliot.id
          ? {
              ...employee,
              managerId: deletedManagerId,
            }
          : employee,
      ),
    };

    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue({
      ...structuredClone(foundationSnapshotExample),
      employees: employeesWithDeletedRelationship.items,
    });
    vi.mocked(listEmployees).mockResolvedValue(employeesWithDeletedRelationship);
    vi.mocked(getEmployee).mockImplementation(async (_sessionToken, employeeId) => ({
      item: {
        ...createEmployeeDetail(employeeId).item,
        managerId: employeeId === elliot.id ? deletedManagerId : createEmployeeDetail(employeeId).item.managerId,
      },
    }));
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: [] });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Employee directory') ?? false);

    const elliotRow = Array.from(container.querySelectorAll('.employee-row-card')).find((row) =>
      row.textContent?.includes('Elliot Employee'),
    );
    expect(elliotRow?.textContent).toContain('deleted user');

    const summaryButton = elliotRow?.querySelector('.employee-row-summary') as HTMLButtonElement | null;
    await act(async () => {
      summaryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Employee detail') ?? false);
    expect(container.textContent).toContain('Managerdeleted user');
  });

  it('keeps password actions admin-only while managers can still edit non-admin employees', async () => {
    const ada = employeesListExample.items.find((employee) => employee.username === 'ada.admin')!;
    const elliot = employeesListExample.items.find((employee) => employee.username === 'elliot.employee')!;

    vi.mocked(me).mockResolvedValue({ session: createManagerSession() });
    vi.mocked(getFoundation).mockResolvedValue(structuredClone(foundationSnapshotExample));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockImplementation(async (_sessionToken, employeeId) => createEmployeeDetail(employeeId));

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Employee directory') ?? false);

    expect(container.querySelector('.employee-row-actions')).toBeNull();
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Add employee')).toBe(false);

    const adaRow = Array.from(container.querySelectorAll('.employee-row-card')).find((row) => row.textContent?.includes('Ada Admin'));
    const elliotRow = Array.from(container.querySelectorAll('.employee-row-card')).find((row) =>
      row.textContent?.includes('Elliot Employee'),
    );

    expect(Array.from(adaRow?.querySelectorAll('button') ?? []).some((button) => button.textContent === 'Edit')).toBe(false);
    expect(Array.from(elliotRow?.querySelectorAll('button') ?? []).some((button) => button.textContent === 'Edit')).toBe(false);

    await act(async () => {
      (adaRow?.querySelector('.employee-row-summary') as HTMLButtonElement | null)?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Employee detail') ?? false);
    expect(container.textContent).toContain(ada.fullName);
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Edit')).toBe(false);
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Manage password')).toBe(false);

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Close')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await act(async () => {
      (elliotRow?.querySelector('.employee-row-summary') as HTMLButtonElement | null)?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes(elliot.fullName) ?? false);
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Edit')).toBe(true);
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Manage password')).toBe(false);
  });
});
