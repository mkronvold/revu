/** @vitest-environment jsdom */

import type { AuthSession, BackupStatusResponse } from '@revu/contracts';
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
    createAssignment: vi.fn(),
    createAssessment: vi.fn(),
    createEmployee: vi.fn(),
    createQuestionSet: vi.fn(),
    createReviewPeriod: vi.fn(),
    deleteAssignment: vi.fn(),
    deleteEmployee: vi.fn(),
    exportBackup: vi.fn(),
    exportAssignments: vi.fn(),
    exportLocalUsers: vi.fn(),
    exportQuestionSets: vi.fn(),
    getEmployee: vi.fn(),
    getBackupStatus: vi.fn(),
    getFoundation: vi.fn(),
    importAssignments: vi.fn(),
    importLocalUsers: vi.fn(),
    importQuestionSets: vi.fn(),
    listAssessments: vi.fn(),
    listEmployees: vi.fn(),
    listQuestionCategories: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    reassignAssessment: vi.fn(),
    rejectAssessmentToDraft: vi.fn(),
    resetEmployeePassword: vi.fn(),
    restoreBackup: vi.fn(),
    reviewAssessment: vi.fn(),
    saveAssessmentDraft: vi.fn(),
    setEmployeePassword: vi.fn(),
    submitAssessment: vi.fn(),
    unarchiveReviewPeriod: vi.fn(),
    updateAssignment: vi.fn(),
    updateBackupStatus: vi.fn(),
    updateEmployee: vi.fn(),
    updateQuestionCategories: vi.fn(),
    updateQuestionSet: vi.fn(),
    updateReviewPeriod: vi.fn(),
  };
});

import App from './App';
import {
  acceptAssessment,
  checkApiHealth,
  deleteEmployee,
  exportBackup,
  exportLocalUsers,
  exportQuestionSets,
  getBackupStatus,
  getEmployee,
  getFoundation,
  importLocalUsers,
  importQuestionSets,
  listEmployees,
  listQuestionCategories,
  me,
  resetEmployeePassword,
  restoreBackup,
  updateBackupStatus,
  updateEmployee,
  updateQuestionCategories,
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
          assessorUsername: null,
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
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.restoreAllMocks();
    document.body.innerHTML = '';
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
    expect(fieldOrder).toEqual(['Title', 'Status', 'Header markdown', 'Footer markdown']);

    const questionRow = editor?.querySelector('.question-set-dialog-row-button');
    expect(questionRow).toBeTruthy();

    await act(async () => {
      questionRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const questionEditor = container.querySelector('.question-edit-dialog');
    expect(questionEditor).toBeTruthy();

    const categorySelect = questionEditor?.querySelector('select[aria-label="Question category"]') as HTMLSelectElement | null;
    expect(categorySelect).toBeTruthy();
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
    expect(initialHelperInputs.every((input) => (input as HTMLInputElement).type === 'checkbox')).toBe(true);
    expect(questionEditor?.querySelector('.question-response-helper')?.textContent).toContain('strongly agree');
    expect(questionEditor?.querySelector('.question-response-helper')?.textContent).toContain('strongly disagree');

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
    expect(responseTypeField).toBeTruthy();
    await act(async () => {
      setFieldValue(responseTypeField!, 'ranking');
      await Promise.resolve();
    });
    await flushRender();

    const rankingHelperInputs = Array.from(questionEditor?.querySelectorAll('.question-response-helper-option input') ?? []);
    expect(rankingHelperInputs).toHaveLength(5);
    expect(rankingHelperInputs.every((input) => (input as HTMLInputElement).type === 'radio')).toBe(true);
    expect(questionEditor?.querySelector('.question-response-helper')?.textContent).toContain('n/a');

    await act(async () => {
      setFieldValue(responseTypeField!, 'narrative');
      await Promise.resolve();
    });
    await flushRender();

    const narrativeHelperInputs = Array.from(questionEditor?.querySelectorAll('.question-response-helper-option input') ?? []);
    expect(narrativeHelperInputs).toHaveLength(0);
    expect(questionEditor?.querySelector('.question-response-helper')?.textContent).toContain(
      'Use a written self-rating with supporting context and examples.',
    );
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
    const statusField = Array.from(editor?.querySelectorAll('label') ?? [])
      .find((label) => label.textContent?.includes('Status'))
      ?.querySelector('select') as HTMLSelectElement | null;
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
    expect(statusField?.disabled).toBe(true);
    expect(headerField?.disabled).toBe(true);
    expect(footerField?.disabled).toBe(true);
    expect(removeButtons.length).toBeGreaterThan(0);
    expect(removeButtons.every((button) => button.disabled)).toBe(true);
    expect(addQuestionButton?.disabled).toBe(true);
    expect(Array.from(editor?.querySelectorAll('button') ?? []).some((button) => button.textContent === 'Save question set')).toBe(
      false,
    );
    expect(Array.from(editor?.querySelectorAll('button') ?? []).some((button) => button.textContent === 'Cancel')).toBe(false);
    expect(Array.from(editor?.querySelectorAll('button') ?? []).some((button) => button.textContent === 'Close')).toBe(true);

    await act(async () => {
      container.querySelector('.modal-backdrop')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(container.querySelector('.question-set-dialog')).toBeNull();
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
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('shows Workflow in the main nav under Reviews and routes to the workflow page', async () => {
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
    expect(navLinkLabels).toContain('File Management');
    expect(navLinkLabels).not.toContain('Archive');
    expect(navLinkLabels).not.toContain('Backups');
    expect(navLinkLabels).toContain('Workflow');
    expect(navLinkLabels.indexOf('Workflow')).toBe(navLinkLabels.indexOf('Reviews') + 1);

    const workflowLink = Array.from(container.querySelectorAll('.sidebar-nav .nav-link')).find(
      (link) => link.textContent === 'Workflow',
    ) as HTMLAnchorElement | undefined;
    expect(workflowLink?.getAttribute('href')).toBe('/workflow');

    await act(async () => {
      workflowLink?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => window.location.pathname === '/workflow');

    expect(container.textContent).toContain('Reference the full review lifecycle');
    expect(container.textContent).toContain('Edit workflow');
    expect(container.textContent).toContain('Managers accept and review submitted Assessments and add their comments');
  });

  it('keeps direct workflow access working while hiding the nav item from employees when visibility is managers', async () => {
    vi.mocked(me).mockResolvedValue({ session: createEmployeeSession() });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());

    window.localStorage.setItem('revu-workflow-visibility', 'managers');
    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/workflow');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Reference the full review lifecycle') ?? false);

    const navLinkLabels = Array.from(container.querySelectorAll('.sidebar-nav .nav-link span'), (link) => link.textContent);
    expect(navLinkLabels).not.toContain('Workflow');
    expect(window.location.pathname).toBe('/workflow');
    expect(container.textContent).not.toContain('Edit workflow');
    expect(container.textContent).toContain('Managers accept and review submitted Assessments and add their comments');
  });

  it('warns before closing the workflow editor when there are unsaved changes', async () => {
    vi.mocked(me).mockResolvedValue({ session: adminLoginExample.session });
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    window.sessionStorage.setItem('revu-session-token', 'session-token');
    window.history.pushState(null, '', '/workflow');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Reference the full review lifecycle') ?? false);

    const workflowEditButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Edit workflow',
    );
    expect(workflowEditButton).toBeTruthy();

    await act(async () => {
      workflowEditButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Edit workflow markdown') ?? false);

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
    expect(navLinkLabels).toContain('Reviews');
    expect(navLinkLabels).toContain('Workflow');
    expect(navLinkLabels).toContain('File Management');
    expect(Array.from(container.querySelectorAll('.sidebar button')).some((button) => button.textContent === 'Sign out')).toBe(true);
    expect(container.querySelector('.theme-card')).toBeTruthy();
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders consolidated transfer cards, archive controls, and backup restore tools', async () => {
    const backup = createBackupExample();
    const questionSnapshot = cloneQuestionSlice();
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
    vi.mocked(getFoundation).mockResolvedValue(questionSnapshot);
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockResolvedValue(adminEmployeeExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue(createBackupStatusExample());
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
          assessorUsername: null,
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
          assessorUsername: 'pat.peer',
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
      resource: 'questionSets',
      format: 'json',
      exportedAt: '2026-06-03T08:00:00.000Z',
      stub: true,
      itemCount: 2,
    });
    vi.mocked(importQuestionSets).mockResolvedValue({
      reviewPeriodId: selectedReviewPeriod.id,
      resource: 'questionSets',
      accepted: false,
      status: 'not_implemented',
      supportedFormats: ['json', 'csv'],
    });
    vi.mocked(exportBackup).mockResolvedValue(backup);
    vi.mocked(restoreBackup).mockResolvedValue({
      mode: 'replace',
      target: 'questions',
      restoredAt: '2026-06-03T08:15:00.000Z',
      counts: {
        users: backup.users.itemCount,
        reviewPeriods: backup.reviewData.reviewPeriods.length,
        questionSets: backup.reviewData.questionSets.length,
        assignments: backup.reviewData.assignments.length,
        assessments: backup.reviewData.assessments.length,
      },
    });

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Automatic backups') ?? false);

    expect(window.location.pathname).toBe('/file-management');
    expect(container.textContent).not.toContain('Admin workspace');
    expect(container.textContent).not.toContain('Review period lifecycle');
    expect(container.textContent).not.toContain('Backup and restore');
    expect(container.textContent).not.toContain('Runtime backup configuration');
    expect(container.textContent).toContain('Employee import/export');
    expect(container.textContent).toContain('Question set import/export');
    expect(container.textContent).toContain('Archive review periods');
    expect(container.textContent).toContain('Automatic backups');
    expect(container.textContent).toContain('Refresh status');
    expect(container.textContent).toContain('Restore all');
    expect(container.textContent).toContain('Restore questions');
    expect(container.textContent).not.toContain('Review workflow markdown');
    expect(container.textContent).not.toContain('Sidebar visibility:');

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

    await waitFor(() => container.textContent?.includes('Edit workflow markdown') ?? false);

    const workflowTextarea = container.querySelector('textarea[aria-label="Workflow markdown"]') as HTMLTextAreaElement | null;
    const workflowVisibilitySelect = container.querySelector(
      'select[aria-label="Workflow visibility"]',
    ) as HTMLSelectElement | null;
    expect(workflowTextarea).toBeTruthy();
    expect(workflowVisibilitySelect).toBeTruthy();
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

    const saveWorkflowButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save workflow',
    );
    expect(saveWorkflowButton).toBeTruthy();

    await act(async () => {
      saveWorkflowButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Updated the workflow settings.') ?? false);
    expect(container.querySelector('.workflow-page-card')?.textContent).toContain('Updated workflow');
    expect(container.querySelector('.workflow-page-card')?.textContent).toContain('Sidebar visibility: managers');
    expect(window.localStorage.getItem('revu-workflow-visibility')).toBe('managers');

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
              assessorUsername: 'pat.peer',
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
    expect(questionExportButton).toBeTruthy();
    expect(questionImportButton).toBeTruthy();

    await act(async () => {
      questionExportButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      questionImportButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(exportQuestionSets).toHaveBeenCalledWith('session-token', selectedReviewPeriod.id, 'json');
    expect(importQuestionSets).toHaveBeenCalledWith('session-token', selectedReviewPeriod.id, { format: 'csv' });

    const downloadButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Backup now / download',
    );
    expect(downloadButton).toBeTruthy();

    await act(async () => {
      downloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(exportBackup).toHaveBeenCalledWith('session-token', 'preserve-passwords');

    const backupInput = container.querySelector('input[type="file"][accept=".json,application/json,text/plain"]') as
      | HTMLInputElement
      | null;
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

    await waitFor(() => container.textContent?.includes('backup-file.json') ?? false);

    const restoreQuestionsButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Restore questions'),
    );
    expect(restoreQuestionsButton).toBeTruthy();

    await act(async () => {
      restoreQuestionsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.textContent?.includes('Restored questions from backup-file.json') ?? false);

    expect(restoreBackup).toHaveBeenCalledWith('session-token', {
      file: backupFile,
      target: 'questions',
      mode: 'replace',
    });

    const workflowLink = Array.from(container.querySelectorAll('.sidebar-nav .nav-link')).find(
      (link) => link.textContent === 'Workflow',
    ) as HTMLAnchorElement | undefined;
    expect(workflowLink).toBeTruthy();

    await act(async () => {
      workflowLink?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => window.location.pathname === '/workflow');
    expect(container.textContent).toContain('Updated workflow');
    expect(container.querySelector('.workflow-page-markdown')?.innerHTML).toContain('<strong>Bold</strong>');
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

describe('reviews screen', () => {
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
    window.history.pushState(null, '', '/reviews');
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders a single review table and opens the selected assessment in a dialog', async () => {
    vi.mocked(me).mockResolvedValue({ session: createManagerSession() });
    vi.mocked(getFoundation).mockResolvedValue(structuredClone(foundationSnapshotExample));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('waiting to be accepted') ?? false);

    expect(container.textContent).toContain('Review Queue');
    expect(container.textContent).toContain('Name');
    expect(container.textContent).toContain('Review type');
    expect(container.textContent).toContain('Assessor');
    expect(container.textContent).toContain('Review period');
    expect(container.textContent).toContain('Next step');
    expect(container.textContent).not.toContain('Submitted and waiting for acceptance');

    const standaloneCollapseButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Collapse');
    const standaloneExpandButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Expand');
    expect(standaloneCollapseButton).toBeUndefined();
    expect(standaloneExpandButton).toBeUndefined();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    const submittedRow = Array.from(container.querySelectorAll('.review-queue-item')).find(
      (button) =>
        button.textContent?.includes('Elliot Employee') &&
        button.textContent?.includes('Self assessment') &&
        button.textContent?.includes('waiting to be accepted'),
    );
    expect(submittedRow).toBeTruthy();

    await act(async () => {
      submittedRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') !== null);

    expect(container.textContent).toContain('Assessment review');
    expect(container.textContent).toContain('Responses');
    expect(container.textContent).toContain('Review notes');
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

  it('collapses the review queue and closes the assessment dialog from the backdrop', async () => {
    vi.mocked(me).mockResolvedValue({ session: createManagerSession() });
    vi.mocked(getFoundation).mockResolvedValue(structuredClone(foundationSnapshotExample));
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('waiting to be accepted') ?? false);

    const sectionToggle = container.querySelector('.section-toggle') as HTMLButtonElement | null;
    expect(sectionToggle?.textContent).toContain('Review Queue');
    expect(sectionToggle?.textContent).toContain('Collapse');
    expect(container.querySelector('[aria-label="Review queue"]')).toBeTruthy();

    await act(async () => {
      sectionToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(container.querySelector('[aria-label="Review queue"]')).toBeNull();
    expect(container.querySelector('.section-toggle')?.textContent).toContain('Expand');

    await act(async () => {
      container.querySelector('.section-toggle')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const submittedRow = Array.from(container.querySelectorAll('.review-queue-item')).find(
      (button) =>
        button.textContent?.includes('Elliot Employee') &&
        button.textContent?.includes('Self assessment') &&
        button.textContent?.includes('waiting to be accepted'),
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

  it('keeps accept workflow actions inside the dialog and refreshes the queue after acceptance', async () => {
    const initialSnapshot = structuredClone(foundationSnapshotExample);
    const acceptedSnapshot = structuredClone(foundationSnapshotExample);
    acceptedSnapshot.assessments = acceptedSnapshot.assessments.map((assessment) =>
      assessment.id === 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
        ? {
            ...assessment,
            reviewState: 'accepted',
            acceptedAt: '2026-02-16T08:00:00.000Z',
            acceptedByEmployeeId: mannyManager.id,
            managerNotes: 'Ready for final notes.',
          }
        : assessment,
    );

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

    await waitFor(() => container.textContent?.includes('waiting to be accepted') ?? false);

    const submittedRow = Array.from(container.querySelectorAll('.review-queue-item')).find(
      (button) =>
        button.textContent?.includes('Elliot Employee') &&
        button.textContent?.includes('Self assessment') &&
        button.textContent?.includes('waiting to be accepted'),
    );

    await act(async () => {
      submittedRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    const reviewNotes = container.querySelector('textarea[aria-label="Review notes"]') as HTMLTextAreaElement | null;
    expect(reviewNotes).toBeTruthy();

    await act(async () => {
      if (reviewNotes) {
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set?.call(
          reviewNotes,
          'Ready for final notes.',
        );
        reviewNotes.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await flushRender();
    });

    const acceptButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Accept');
    expect(acceptButton).toBeTruthy();

    await act(async () => {
      acceptButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => vi.mocked(acceptAssessment).mock.calls.length === 1);

    expect(acceptAssessment).toHaveBeenCalledWith('session-token', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', {
      managerNotes: 'Ready for final notes.',
    });

    await waitFor(() => container.textContent?.includes('In review') ?? false);
    expect(container.textContent).toContain('Assessment accepted and moved into the review stage.');
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
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('keeps the queue on the dashboard and opens assessment editing in a dialog', async () => {
    vi.mocked(me).mockResolvedValue({ session: createEmployeeSession() });
    vi.mocked(getFoundation).mockResolvedValue(structuredClone(foundationSnapshotExample));

    window.sessionStorage.setItem('revu-session-token', 'session-token');

    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => container.textContent?.includes('Assessment Queue') ?? false);

    expect(container.textContent).toContain('Assessment Queue');
    expect(container.textContent).not.toContain('Assessment editor');
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    const openButton = container.querySelector('.dashboard-queue-row button');
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    await waitFor(() => container.querySelector('[role="dialog"]') !== null);

    expect(container.textContent).toContain('Assessment editor');
    expect(container.textContent).toContain('Save for later');

    const closeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Close');
    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushRender();
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
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
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('uses a single employee table and keeps edit and password actions in employee dialogs', async () => {
    const elliot = employeesListExample.items.find((employee) => employee.username === 'elliot.employee')!;
    const pat = employeesListExample.items.find((employee) => employee.username === 'pat.peer')!;
    const updatedEmployee = {
      ...createEmployeeDetail(elliot.id).item,
      fullName: 'Elliot Updated',
      assessorId: pat.id,
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
      .find((label) => label.textContent?.includes('Assessor'))
      ?.querySelector('select') as HTMLSelectElement | null;
    const fullNameInput = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Full name'))
      ?.querySelector('input') as HTMLInputElement | null;

    expect(managerSelect).toBeTruthy();
    expect(assessorSelect).toBeTruthy();
    expect(fullNameInput).toBeTruthy();
    expect(Array.from(managerSelect?.options ?? [], (option) => option.textContent)).toEqual([
      'Not assigned',
      'Ada Admin',
      'Manny Manager',
    ]);
    expect(Array.from(assessorSelect?.options ?? [], (option) => option.textContent)).not.toContain('Elliot Employee');

    await act(async () => {
      if (fullNameInput) {
        setFieldValue(fullNameInput, 'Elliot Updated');
      }
      if (assessorSelect) {
        setFieldValue(assessorSelect, pat.id);
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
      assessorId: pat.id,
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
