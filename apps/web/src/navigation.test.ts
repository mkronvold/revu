import { describe, expect, it } from 'vitest';
import { appSections, defaultPath, getSectionsForRole, routeLegend } from './navigation';

describe('web shell foundation', () => {
  it('covers the approved information architecture in order', () => {
    expect(defaultPath).toBe('/dashboard');
    expect(appSections.map((section) => section.id)).toEqual([
      'dashboard',
      'reviews',
      'employees',
      'questions',
      'assignments',
      'archive',
    ]);
    expect(appSections.map((section) => section.path)).toEqual([
      '/dashboard',
      '/reviews',
      '/employees',
      '/questions',
      '/assignments',
      '/archive',
    ]);
  });

  it('keeps the clarified assessment and review terminology', () => {
    expect(routeLegend.assessments).toMatch(/employee-authored forms/i);
    expect(routeLegend.reviews).toMatch(/manager and admin actions/i);
  });

  it('filters navigation by role without changing the approved route set', () => {
    expect(getSectionsForRole('employee').map((section) => section.id)).toEqual(['dashboard']);
    expect(getSectionsForRole('manager').map((section) => section.id)).toEqual([
      'dashboard',
      'reviews',
      'employees',
    ]);
    expect(getSectionsForRole('admin').map((section) => section.id)).toEqual([
      'dashboard',
      'reviews',
      'employees',
      'questions',
      'assignments',
      'archive',
    ]);
  });
});
