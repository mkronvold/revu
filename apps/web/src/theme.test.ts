import { describe, expect, it } from 'vitest';

import {
  getNextThemePreference,
  getThemeColorScheme,
  getThemeLabel,
  normalizeThemePreference,
  themeStyleOverrides,
} from './theme';

describe('theme helpers', () => {
  it('normalizes stored theme preferences and migrates legacy dark mode', () => {
    expect(normalizeThemePreference('light')).toBe('light');
    expect(normalizeThemePreference('spring')).toBe('spring');
    expect(normalizeThemePreference('dark')).toBe('winter-nights');
    expect(normalizeThemePreference('unknown')).toBe('light');
    expect(normalizeThemePreference(null)).toBe('light');
  });

  it('cycles through every theme and wraps to light', () => {
    expect(getNextThemePreference('light')).toBe('spring');
    expect(getNextThemePreference('spring')).toBe('summer');
    expect(getNextThemePreference('summer')).toBe('autumn');
    expect(getNextThemePreference('autumn')).toBe('summer-nights');
    expect(getNextThemePreference('summer-nights')).toBe('winter-nights');
    expect(getNextThemePreference('winter-nights')).toBe('light');
  });

  it('exposes readable labels and color scheme metadata', () => {
    expect(getThemeLabel('autumn')).toBe('Autumn');
    expect(getThemeLabel('summer-nights')).toBe('Summer Nights');
    expect(getThemeLabel('winter-nights')).toBe('Winter Nights');
    expect(getThemeColorScheme('summer')).toBe('light');
    expect(getThemeColorScheme('summer-nights')).toBe('light');
    expect(getThemeColorScheme('winter-nights')).toBe('dark');
  });

  it('keeps review queue items on the same themed surface model as employee roster rows', () => {
    expect(themeStyleOverrides).toContain(".review-queue-item");
    expect(themeStyleOverrides).toContain(".employee-row-summary:hover");
    expect(themeStyleOverrides).toContain(".review-queue-item:hover");
  });

  it('themes backup export mode tiles on the same surface model as other interactive cards', () => {
    expect(themeStyleOverrides).toContain('.local-user-export-mode-option');
    expect(themeStyleOverrides).toContain('.local-user-export-mode-option-selected');
  });

  it('uses the shared button default color with themed hover gradients', () => {
    expect(themeStyleOverrides).toContain(
      "button:not(.demo-account-card):not(.employee-row):not(.employee-row-summary):not(.review-queue-item):not(.section-toggle)",
    );
    expect(themeStyleOverrides).toContain(
      "button:not(.demo-account-card):not(.employee-row):not(.employee-row-summary):not(.review-queue-item):not(.section-toggle):hover",
    );
    expect(themeStyleOverrides).toContain('.button-link:focus-visible');
  });
});
