/** @vitest-environment jsdom */

import type { AuthSession } from '@revu/contracts';
import { adminEmployeeExample, adminLoginExample, employeesListExample, foundationSnapshotExample } from '@revu/contracts';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { questionCategorySuggestionsId } from './questionPresentation';

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
    changePassword: vi.fn(),
    createAssignment: vi.fn(),
    createAssessment: vi.fn(),
    createEmployee: vi.fn(),
    createQuestionSet: vi.fn(),
    createReviewPeriod: vi.fn(),
    deleteAssignment: vi.fn(),
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
    updateEmployee: vi.fn(),
    updateQuestionSet: vi.fn(),
    updateReviewPeriod: vi.fn(),
  };
});

import App from './App';
import { exportBackup, getBackupStatus, getEmployee, getFoundation, listEmployees, listQuestionCategories, me, restoreBackup } from './api';

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

async function flushRender() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
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

  it('renders markdown, autocompletes persisted categories, and scrolls to the question-set editor', async () => {
    const scrollIntoViewSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
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
    expect(questionSetCard?.innerHTML).toContain('<strong>Lead with clarity</strong>');
    expect(questionSetCard?.innerHTML).toContain('<br');

    const prompt = questionSetCard?.querySelector('.question-prompt-markdown');
    expect(prompt?.innerHTML).toContain('<strong>lead</strong>');
    expect(prompt?.innerHTML).toContain('<br');

    const editButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Edit set');
    expect(editButton).toBeTruthy();

    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const editor = container.querySelector('#question-set-editor');
    expect(editor).toBeTruthy();
    expect(scrollIntoViewSpy).toHaveBeenCalled();

    const categoryInput = editor?.querySelector('.question-category-field input');
    expect(categoryInput?.getAttribute('list')).toBe(questionCategorySuggestionsId);

    const suggestionValues = Array.from(
      container.querySelectorAll(`#${questionCategorySuggestionsId} option`),
      (option) => option.getAttribute('value'),
    );
    expect(suggestionValues).toEqual(['Growth', 'Impact', 'Teamwork']);

    const firstQuestionEditor = editor?.querySelector('.question-editor-card');
    const fieldOrder = Array.from(firstQuestionEditor?.querySelectorAll('.question-editor-fields > label') ?? []).map(
      (field) =>
        Array.from(field.classList).find((className) => className.startsWith('question-')) ?? field.tagName.toLowerCase(),
    );
    expect(fieldOrder).toEqual(['question-category-field', 'question-prompt-field', 'question-response-type-field']);
    expect(editor?.querySelector('.question-response-type-field')?.textContent).toContain('Response type');
  });
});

describe('backups screen', () => {
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
    window.history.pushState(null, '', '/backups');
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

  it('renders backup status, downloads backups, and restores uploaded backup targets', async () => {
    const backup = createBackupExample();
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
    vi.mocked(getFoundation).mockResolvedValue(cloneQuestionSlice());
    vi.mocked(listEmployees).mockResolvedValue(employeesListExample);
    vi.mocked(getEmployee).mockResolvedValue(adminEmployeeExample);
    vi.mocked(listQuestionCategories).mockResolvedValue({ items: ['Teamwork', 'Growth', 'Impact'] });
    vi.mocked(getBackupStatus).mockResolvedValue({
      dailyBackupsEnabled: true,
      retentionDays: 14,
      lastBackupAt: '2026-06-01T12:00:00.000Z',
      lastRestoreAt: null,
      defaultUserExportMode: 'preserve-passwords',
      replaceStrategy: 'replace',
      supportedFormats: ['json'],
      supportedRestoreModes: ['replace'],
      supportedRestoreScopes: ['all', 'users', 'questions', 'reviews'],
      supportedUserExportModes: ['rotate-passcodes', 'preserve-passwords'],
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

    await waitFor(() => container.textContent?.includes('Runtime backup configuration') ?? false);

    expect(container.textContent).toContain('Refresh status');
    expect(container.textContent).toContain('Restore all');
    expect(container.textContent).toContain('Restore questions');

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
  });
});
