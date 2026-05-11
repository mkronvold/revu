import { describe, expect, it } from 'vitest';
import {
  appSections,
  defaultPath,
  getNavigationSectionsForRole,
  getSectionsForRole,
  normalizePath,
  routeLegend,
  workflowMarkdown,
} from './navigation';

describe('web shell foundation', () => {
  it('covers the approved information architecture in order', () => {
    expect(defaultPath).toBe('/dashboard');
    expect(appSections.map((section) => section.id)).toEqual([
      'dashboard',
      'employees',
      'questions',
      'assessments',
      'reviewPeriod',
      'fileManagement',
      'workflow',
    ]);
    expect(appSections.map((section) => section.path)).toEqual([
      '/dashboard',
      '/employees',
      '/questions',
      '/assessments',
      '/review-period',
      '/file-management',
      '/workflow',
    ]);
  });

  it('keeps the clarified dashboard and assessment terminology', () => {
    expect(routeLegend.dashboard).toMatch(/single workflow action surface/i);
    expect(routeLegend.assessments).toMatch(/employee-authored forms/i);
  });

  it('keeps workflow routable for every role while limiting primary navigation to approved entries', () => {
    expect(getSectionsForRole('employee').map((section) => section.id)).toEqual(['dashboard', 'workflow']);
    expect(getSectionsForRole('manager').map((section) => section.id)).toEqual(['dashboard', 'employees', 'workflow']);
    expect(getSectionsForRole('admin').map((section) => section.id)).toEqual([
      'dashboard',
      'employees',
      'questions',
      'assessments',
      'reviewPeriod',
      'fileManagement',
      'workflow',
    ]);

    expect(getNavigationSectionsForRole('employee').map((section) => section.id)).toEqual(['dashboard']);
    expect(getNavigationSectionsForRole('manager').map((section) => section.id)).toEqual(['dashboard', 'employees']);
    expect(getNavigationSectionsForRole('admin').map((section) => section.id)).toEqual([
      'dashboard',
      'employees',
      'questions',
      'assessments',
      'reviewPeriod',
      'fileManagement',
    ]);
  });

  it('keeps employees copy current, redirects legacy routes, and preserves workflow markdown', () => {
    expect(appSections.find((section) => section.id === 'employees')?.summary).toBe(
      'Manage employee records, reporting lines, assessor coverage, and local user transfer actions.',
    );
    expect(appSections.find((section) => section.id === 'reviewPeriod')?.path).toBe('/review-period');
    expect(appSections.find((section) => section.id === 'fileManagement')?.path).toBe('/file-management');
    expect(normalizePath('/archive')).toBe('/review-period');
    expect(normalizePath('/backups/')).toBe('/file-management');
    expect(normalizePath('/reviews')).toBe('/dashboard');
    expect(workflowMarkdown).toContain('### Active assessment lifecycle');
  });
});
