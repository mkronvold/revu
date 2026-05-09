export const themePreferences = ['light', 'spring', 'summer', 'autumn', 'summer-nights', 'winter-nights'] as const;

export type ThemePreference = (typeof themePreferences)[number];

type ThemeColorScheme = 'light' | 'dark';

type ThemePalette = {
  appText: string;
  loginBackground: string;
  appBackground: string;
  surfaceText: string;
  surfaceBorder: string;
  surfaceBackground: string;
  modalSurfaceBackground: string;
  surfaceShadow: string;
  mutedText: string;
  sidebarBackground: string;
  sidebarText: string;
  navText: string;
  navBorder: string;
  navBackground: string;
  navHoverBorder: string;
  navHoverBackground: string;
  navActiveBorder: string;
  navActiveBackground: string;
  sidebarNoteBackground: string;
  badgeText: string;
  badgeBackground: string;
  pillText: string;
  pillBackground: string;
  inputText: string;
  inputBorder: string;
  inputBackground: string;
  primaryButtonText: string;
  primaryButtonBorder: string;
  primaryButtonStart: string;
  primaryButtonEnd: string;
  secondaryButtonText: string;
  secondaryButtonBorder: string;
  secondaryButtonBackground: string;
  successText: string;
  successBackground: string;
  errorText: string;
  errorBackground: string;
  modalBackdrop: string;
  activeBorder: string;
  activeBackground: string;
  warningText: string;
  warningBackground: string;
  warningBorder: string;
  noteBackground: string;
  noteText: string;
};

const themeLabels: Record<ThemePreference, string> = {
  light: 'Light',
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  'summer-nights': 'Summer Nights',
  'winter-nights': 'Winter Nights',
};

const themeColorSchemes: Record<ThemePreference, ThemeColorScheme> = {
  light: 'light',
  spring: 'light',
  summer: 'light',
  autumn: 'light',
  'summer-nights': 'light',
  'winter-nights': 'dark',
};

const themePalettes: Record<Exclude<ThemePreference, 'light'>, ThemePalette> = {
  spring: {
    appText: '#12343b',
    loginBackground:
      'radial-gradient(circle at top, rgba(125, 211, 252, 0.24), transparent 28%), linear-gradient(180deg, #f0fdf4 0%, #dcfce7 42%, #eff6ff 100%)',
    appBackground:
      'radial-gradient(circle at top, rgba(103, 232, 249, 0.2), transparent 30%), linear-gradient(180deg, #f0fdf4 0%, #dcfce7 46%, #eff6ff 100%)',
    surfaceText: '#12343b',
    surfaceBorder: 'rgba(45, 212, 191, 0.32)',
    surfaceBackground: 'rgba(248, 255, 252, 0.93)',
    modalSurfaceBackground: '#f8fffc',
    surfaceShadow: '0 18px 46px rgba(16, 185, 129, 0.12)',
    mutedText: '#3f6b73',
    sidebarBackground: 'rgba(236, 253, 245, 0.96)',
    sidebarText: '#12343b',
    navText: '#12343b',
    navBorder: 'rgba(45, 212, 191, 0.18)',
    navBackground: 'rgba(167, 243, 208, 0.2)',
    navHoverBorder: 'rgba(14, 165, 233, 0.4)',
    navHoverBackground: 'rgba(125, 211, 252, 0.24)',
    navActiveBorder: 'rgba(20, 184, 166, 0.6)',
    navActiveBackground: 'rgba(94, 234, 212, 0.26)',
    sidebarNoteBackground: 'rgba(186, 230, 253, 0.55)',
    badgeText: '#0f4c5c',
    badgeBackground: '#bfdbfe',
    pillText: '#0f766e',
    pillBackground: '#ccfbf1',
    inputText: '#12343b',
    inputBorder: 'rgba(94, 234, 212, 0.36)',
    inputBackground: 'rgba(255, 255, 255, 0.95)',
    primaryButtonText: '#f8fffd',
    primaryButtonBorder: 'rgba(16, 185, 129, 0.35)',
    primaryButtonStart: '#14b8a6',
    primaryButtonEnd: '#0ea5e9',
    secondaryButtonText: '#134e4a',
    secondaryButtonBorder: 'rgba(45, 212, 191, 0.38)',
    secondaryButtonBackground: 'rgba(240, 253, 250, 0.95)',
    successText: '#166534',
    successBackground: '#dcfce7',
    errorText: '#991b1b',
    errorBackground: '#fee2e2',
    modalBackdrop: 'rgba(15, 23, 42, 0.32)',
    activeBorder: 'rgba(20, 184, 166, 0.55)',
    activeBackground: 'rgba(204, 251, 241, 0.78)',
    warningText: '#854d0e',
    warningBackground: 'rgba(254, 249, 195, 0.92)',
    warningBorder: 'rgba(250, 204, 21, 0.34)',
    noteBackground: '#ecfeff',
    noteText: '#155e75',
  },
  summer: {
    appText: '#17321c',
    loginBackground:
      'radial-gradient(circle at top, rgba(74, 222, 128, 0.2), transparent 28%), linear-gradient(180deg, #f7fee7 0%, #dcfce7 34%, #d1fae5 100%)',
    appBackground:
      'radial-gradient(circle at top, rgba(34, 197, 94, 0.16), transparent 30%), linear-gradient(180deg, #f7fee7 0%, #dcfce7 38%, #ecfccb 100%)',
    surfaceText: '#17321c',
    surfaceBorder: 'rgba(34, 197, 94, 0.28)',
    surfaceBackground: 'rgba(251, 255, 247, 0.93)',
    modalSurfaceBackground: '#fbfff7',
    surfaceShadow: '0 18px 46px rgba(34, 84, 61, 0.14)',
    mutedText: '#45614a',
    sidebarBackground: 'rgba(20, 83, 45, 0.96)',
    sidebarText: '#f1f5f9',
    navText: '#f8fafc',
    navBorder: 'rgba(187, 247, 208, 0.14)',
    navBackground: 'rgba(34, 197, 94, 0.16)',
    navHoverBorder: 'rgba(134, 239, 172, 0.42)',
    navHoverBackground: 'rgba(34, 197, 94, 0.26)',
    navActiveBorder: 'rgba(190, 242, 100, 0.72)',
    navActiveBackground: 'rgba(132, 204, 22, 0.24)',
    sidebarNoteBackground: 'rgba(163, 230, 53, 0.2)',
    badgeText: '#17321c',
    badgeBackground: '#bef264',
    pillText: '#14532d',
    pillBackground: '#dcfce7',
    inputText: '#17321c',
    inputBorder: 'rgba(74, 222, 128, 0.32)',
    inputBackground: 'rgba(255, 255, 252, 0.95)',
    primaryButtonText: '#f8fafc',
    primaryButtonBorder: 'rgba(34, 197, 94, 0.4)',
    primaryButtonStart: '#15803d',
    primaryButtonEnd: '#166534',
    secondaryButtonText: '#17321c',
    secondaryButtonBorder: 'rgba(34, 197, 94, 0.36)',
    secondaryButtonBackground: 'rgba(240, 253, 244, 0.96)',
    successText: '#14532d',
    successBackground: '#dcfce7',
    errorText: '#7f1d1d',
    errorBackground: '#fee2e2',
    modalBackdrop: 'rgba(15, 23, 42, 0.36)',
    activeBorder: 'rgba(34, 197, 94, 0.52)',
    activeBackground: 'rgba(220, 252, 231, 0.86)',
    warningText: '#854d0e',
    warningBackground: 'rgba(254, 249, 195, 0.92)',
    warningBorder: 'rgba(250, 204, 21, 0.34)',
    noteBackground: '#f0fdf4',
    noteText: '#166534',
  },
  autumn: {
    appText: '#3f2412',
    loginBackground:
      'radial-gradient(circle at top, rgba(251, 146, 60, 0.22), transparent 28%), linear-gradient(180deg, #fff7ed 0%, #ffedd5 34%, #fde68a 100%)',
    appBackground:
      'radial-gradient(circle at top, rgba(249, 115, 22, 0.18), transparent 30%), linear-gradient(180deg, #fff7ed 0%, #ffedd5 42%, #fde68a 100%)',
    surfaceText: '#3f2412',
    surfaceBorder: 'rgba(180, 83, 9, 0.28)',
    surfaceBackground: 'rgba(255, 248, 239, 0.94)',
    modalSurfaceBackground: '#fff8ef',
    surfaceShadow: '0 18px 46px rgba(146, 64, 14, 0.14)',
    mutedText: '#7c4d2b',
    sidebarBackground: 'rgba(68, 35, 15, 0.96)',
    sidebarText: '#fef3c7',
    navText: '#fff7ed',
    navBorder: 'rgba(251, 191, 36, 0.14)',
    navBackground: 'rgba(180, 83, 9, 0.24)',
    navHoverBorder: 'rgba(251, 146, 60, 0.42)',
    navHoverBackground: 'rgba(217, 119, 6, 0.28)',
    navActiveBorder: 'rgba(253, 186, 116, 0.72)',
    navActiveBackground: 'rgba(249, 115, 22, 0.28)',
    sidebarNoteBackground: 'rgba(146, 64, 14, 0.32)',
    badgeText: '#5b3417',
    badgeBackground: '#fdba74',
    pillText: '#9a3412',
    pillBackground: '#fed7aa',
    inputText: '#3f2412',
    inputBorder: 'rgba(249, 115, 22, 0.3)',
    inputBackground: 'rgba(255, 251, 235, 0.96)',
    primaryButtonText: '#fff7ed',
    primaryButtonBorder: 'rgba(180, 83, 9, 0.42)',
    primaryButtonStart: '#c2410c',
    primaryButtonEnd: '#9a3412',
    secondaryButtonText: '#5b3417',
    secondaryButtonBorder: 'rgba(217, 119, 6, 0.34)',
    secondaryButtonBackground: 'rgba(255, 237, 213, 0.95)',
    successText: '#7c2d12',
    successBackground: '#ffedd5',
    errorText: '#7f1d1d',
    errorBackground: '#fee2e2',
    modalBackdrop: 'rgba(41, 24, 12, 0.42)',
    activeBorder: 'rgba(194, 65, 12, 0.46)',
    activeBackground: 'rgba(255, 237, 213, 0.88)',
    warningText: '#7c2d12',
    warningBackground: 'rgba(255, 237, 213, 0.94)',
    warningBorder: 'rgba(249, 115, 22, 0.32)',
    noteBackground: '#fff7ed',
    noteText: '#9a3412',
  },
  'summer-nights': {
    appText: '#2d1810',
    loginBackground:
      'radial-gradient(circle at top, rgba(251, 146, 60, 0.32), transparent 28%), linear-gradient(180deg, #d4b896 0%, #c4a77c 42%, #a68a68 100%)',
    appBackground:
      'radial-gradient(circle at top, rgba(249, 115, 22, 0.26), transparent 30%), linear-gradient(180deg, #d4b896 0%, #c4a77c 46%, #b89578 100%)',
    surfaceText: '#2d1810',
    surfaceBorder: 'rgba(180, 83, 9, 0.28)',
    surfaceBackground: 'rgba(197, 173, 145, 0.9)',
    modalSurfaceBackground: '#c5ad91',
    surfaceShadow: '0 18px 46px rgba(146, 64, 14, 0.18)',
    mutedText: '#5c3419',
    sidebarBackground: 'rgba(198, 124, 82, 0.92)',
    sidebarText: '#2d1810',
    navText: '#2d1810',
    navBorder: 'rgba(20, 184, 166, 0.24)',
    navBackground: 'rgba(129, 212, 199, 0.28)',
    navHoverBorder: 'rgba(13, 148, 136, 0.48)',
    navHoverBackground: 'rgba(85, 199, 181, 0.36)',
    navActiveBorder: 'rgba(20, 184, 166, 0.76)',
    navActiveBackground: 'rgba(174, 223, 214, 0.48)',
    sidebarNoteBackground: 'rgba(217, 119, 6, 0.26)',
    badgeText: '#2d1810',
    badgeBackground: 'rgba(236, 182, 208, 0.76)',
    pillText: '#2d1810',
    pillBackground: 'rgba(229, 148, 192, 0.58)',
    inputText: '#2d1810',
    inputBorder: 'rgba(217, 119, 6, 0.28)',
    inputBackground: 'rgba(228, 208, 183, 0.94)',
    primaryButtonText: '#fefcfb',
    primaryButtonBorder: 'rgba(249, 115, 22, 0.32)',
    primaryButtonStart: '#14b8a6',
    primaryButtonEnd: '#f472b6',
    secondaryButtonText: '#2d1810',
    secondaryButtonBorder: 'rgba(217, 119, 6, 0.32)',
    secondaryButtonBackground: 'rgba(219, 198, 170, 0.95)',
    successText: '#14532d',
    successBackground: 'rgba(164, 218, 184, 0.68)',
    errorText: '#7f1d1d',
    errorBackground: 'rgba(242, 182, 182, 0.78)',
    modalBackdrop: 'rgba(45, 24, 16, 0.42)',
    activeBorder: 'rgba(249, 115, 22, 0.46)',
    activeBackground: 'rgba(212, 189, 159, 0.84)',
    warningText: '#5c3419',
    warningBackground: 'rgba(232, 210, 160, 0.82)',
    warningBorder: 'rgba(217, 119, 6, 0.32)',
    noteBackground: 'rgba(142, 212, 221, 0.46)',
    noteText: '#0d4743',
  },
  'winter-nights': {
    appText: '#e2e8f0',
    loginBackground:
      'radial-gradient(circle at top, rgba(125, 211, 252, 0.16), transparent 30%), linear-gradient(180deg, #020617 0%, #0f172a 55%, #111827 100%)',
    appBackground:
      'radial-gradient(circle at top, rgba(96, 165, 250, 0.15), transparent 32%), linear-gradient(180deg, #020617 0%, #0f172a 52%, #111827 100%)',
    surfaceText: '#e2e8f0',
    surfaceBorder: 'rgba(148, 163, 184, 0.25)',
    surfaceBackground: 'rgba(15, 23, 42, 0.92)',
    modalSurfaceBackground: '#0f172a',
    surfaceShadow: '0 20px 50px rgba(2, 6, 23, 0.35)',
    mutedText: '#cbd5e1',
    sidebarBackground: 'rgba(2, 6, 23, 0.94)',
    sidebarText: '#e2e8f0',
    navText: '#e2e8f0',
    navBorder: 'rgba(148, 163, 184, 0.2)',
    navBackground: 'rgba(30, 41, 59, 0.75)',
    navHoverBorder: 'rgba(125, 211, 252, 0.45)',
    navHoverBackground: 'rgba(14, 165, 233, 0.18)',
    navActiveBorder: 'rgba(56, 189, 248, 0.9)',
    navActiveBackground: 'rgba(14, 165, 233, 0.24)',
    sidebarNoteBackground: 'rgba(13, 148, 136, 0.2)',
    badgeText: '#e0f2fe',
    badgeBackground: 'rgba(14, 165, 233, 0.22)',
    pillText: '#e0f2fe',
    pillBackground: 'rgba(14, 165, 233, 0.22)',
    inputText: '#e2e8f0',
    inputBorder: 'rgba(148, 163, 184, 0.22)',
    inputBackground: 'rgba(15, 23, 42, 0.92)',
    primaryButtonText: '#e0f2fe',
    primaryButtonBorder: 'rgba(96, 165, 250, 0.3)',
    primaryButtonStart: '#2563eb',
    primaryButtonEnd: '#1d4ed8',
    secondaryButtonText: '#e2e8f0',
    secondaryButtonBorder: 'rgba(148, 163, 184, 0.24)',
    secondaryButtonBackground: 'rgba(51, 65, 85, 0.92)',
    successText: '#dcfce7',
    successBackground: 'rgba(22, 101, 52, 0.32)',
    errorText: '#fecaca',
    errorBackground: 'rgba(127, 29, 29, 0.34)',
    modalBackdrop: 'rgba(2, 6, 23, 0.78)',
    activeBorder: 'rgba(56, 189, 248, 0.48)',
    activeBackground: 'rgba(30, 64, 175, 0.35)',
    warningText: '#fde68a',
    warningBackground: 'rgba(120, 53, 15, 0.35)',
    warningBorder: 'rgba(251, 191, 36, 0.28)',
    noteBackground: 'rgba(30, 64, 175, 0.18)',
    noteText: '#bfdbfe',
  },
};

const themedSurfaceSelectors = [
  '.login-card',
  '.card',
  '.subcard',
  '.modal-card',
  '.employee-roster-table-scroll',
  '.dashboard-queue-group',
  '.queue-card',
  '.session-card',
  '.assignment-row',
  '.archive-row',
  '.ia-item',
  '.admin-list-item',
  '.review-response-table',
  '.question-set-question-list',
  '.question-set-question',
  '.question-set-dialog-table',
];

const themedMutedTextSelectors = [
  '.login-copy',
  '.muted-copy',
  '.status-caption',
  '.brand-copy',
  '.employee-roster-header',
  '.stack-form label',
  '.inline-field',
  '.detail-grid dt',
  '.ia-item span',
  '.assignment-header',
  '.review-queue-separator',
  '.dashboard-audience',
  '.dashboard-identity-label',
  '.review-dialog-copy',
  '.review-response-header',
  '.review-response-meta',
  '.question-order',
];

const themedInteractiveSurfaceSelectors = [
  '.section-toggle',
  '.demo-account-card',
  '.employee-row-summary',
  '.review-queue-item',
  '.local-user-export-mode-option',
  '.question-set-card',
  '.question-set-dialog-row-button',
];

const themedActionButtonSelectors = [
  'button:not(.demo-account-card):not(.employee-row):not(.employee-row-summary):not(.review-queue-item):not(.section-toggle)',
  '.button-link',
];

const themedActionButtonHoverSelectors = themedActionButtonSelectors.flatMap((selector) => [
  `${selector}:hover`,
  `${selector}:focus-visible`,
]);

function buildThemeOverrides(theme: Exclude<ThemePreference, 'light'>, palette: ThemePalette) {
  return `
  [data-revu-theme='${theme}'] {
    color: ${palette.appText};
  }

  [data-revu-theme='${theme}'].login-shell {
    background: ${palette.loginBackground};
  }

  [data-revu-theme='${theme}'].app-shell {
    background: ${palette.appBackground};
  }

  [data-revu-theme='${theme}'] ${themedSurfaceSelectors.join(`,\n  [data-revu-theme='${theme}'] `)} {
    color: ${palette.surfaceText};
    border-color: ${palette.surfaceBorder};
    background: ${palette.surfaceBackground};
    box-shadow: ${palette.surfaceShadow};
  }

  [data-revu-theme='${theme}'] .toolbar-note {
    color: ${palette.noteText};
    background: ${palette.noteBackground};
  }

  [data-revu-theme='${theme}'] ${themedMutedTextSelectors.join(`,\n  [data-revu-theme='${theme}'] `)} {
    color: ${palette.mutedText};
  }

  [data-revu-theme='${theme}'] .detail-grid dd {
    color: ${palette.surfaceText};
  }

  [data-revu-theme='${theme}'] .sidebar {
    color: ${palette.sidebarText};
    background: ${palette.sidebarBackground};
  }

  [data-revu-theme='${theme}'] .nav-link {
    color: ${palette.navText};
    border-color: ${palette.navBorder};
    background: ${palette.navBackground};
  }

  [data-revu-theme='${theme}'] .nav-link:hover,
  [data-revu-theme='${theme}'] .nav-link:focus-visible {
    border-color: ${palette.navHoverBorder};
    background: ${palette.navHoverBackground};
  }

  [data-revu-theme='${theme}'] .nav-link-active {
    border-color: ${palette.navActiveBorder};
    background: ${palette.navActiveBackground};
  }

  [data-revu-theme='${theme}'] ${themedInteractiveSurfaceSelectors.join(`,\n  [data-revu-theme='${theme}'] `)} {
    color: ${palette.surfaceText};
    border-color: ${palette.surfaceBorder};
    background: ${palette.surfaceBackground};
  }

  [data-revu-theme='${theme}'] .demo-account-card:hover,
  [data-revu-theme='${theme}'] .demo-account-card:focus-visible,
  [data-revu-theme='${theme}'] .employee-row-summary:hover,
  [data-revu-theme='${theme}'] .employee-row-summary:focus-visible,
  [data-revu-theme='${theme}'] .review-queue-item:hover,
  [data-revu-theme='${theme}'] .review-queue-item:focus-visible,
  [data-revu-theme='${theme}'] .question-set-card:hover,
  [data-revu-theme='${theme}'] .question-set-card:focus-visible,
  [data-revu-theme='${theme}'] .question-set-dialog-row-button:hover,
  [data-revu-theme='${theme}'] .question-set-dialog-row-button:focus-visible,
  [data-revu-theme='${theme}'] .workflow-card:hover,
  [data-revu-theme='${theme}'] .workflow-card:focus-visible {
    border-color: ${palette.navHoverBorder};
    background: ${palette.navHoverBackground};
  }

  [data-revu-theme='${theme}'] .employee-row-summary,
  [data-revu-theme='${theme}'] .review-queue-item {
    background: ${palette.inputBackground};
  }

  [data-revu-theme='${theme}'] .section-toggle:hover,
  [data-revu-theme='${theme}'] .section-toggle:focus-visible {
    color: ${palette.surfaceText};
    background: ${palette.surfaceBackground};
  }

  [data-revu-theme='${theme}'] .sidebar-note {
    background: ${palette.sidebarNoteBackground};
  }

  [data-revu-theme='${theme}'] .theme-card:focus-visible {
    outline-color: ${palette.navHoverBorder};
  }

  [data-revu-theme='${theme}'] .theme-card-value {
    color: ${palette.inputText};
    border-color: ${palette.inputBorder};
    background: ${palette.inputBackground};
  }

  [data-revu-theme='${theme}'] .revision-card {
    background: ${palette.navBackground};
  }

  [data-revu-theme='${theme}'] .badge {
    color: ${palette.badgeText};
    background: ${palette.badgeBackground};
  }

  [data-revu-theme='${theme}'] .pill {
    color: ${palette.pillText};
    background: ${palette.pillBackground};
  }

  [data-revu-theme='${theme}'] .employee-status-pill-active {
    color: ${palette.successText};
    background: ${palette.successBackground};
  }

  [data-revu-theme='${theme}'] .employee-status-pill-inactive {
    color: ${palette.errorText};
    background: ${palette.errorBackground};
  }

  [data-revu-theme='${theme}'] input,
  [data-revu-theme='${theme}'] select,
  [data-revu-theme='${theme}'] textarea {
    color: ${palette.inputText};
    border-color: ${palette.inputBorder};
    background: ${palette.inputBackground};
  }

  [data-revu-theme='${theme}'] ${themedActionButtonSelectors.join(`,\n  [data-revu-theme='${theme}'] `)} {
    color: ${palette.secondaryButtonText};
    border-color: ${palette.secondaryButtonBorder};
    background: ${palette.secondaryButtonBackground};
  }

  [data-revu-theme='${theme}'] ${themedActionButtonHoverSelectors.join(`,\n  [data-revu-theme='${theme}'] `)} {
    color: ${palette.primaryButtonText};
    border-color: ${palette.primaryButtonBorder};
    background: linear-gradient(135deg, ${palette.primaryButtonStart}, ${palette.primaryButtonEnd});
  }

  [data-revu-theme='${theme}'] .temporary-password {
    color: ${palette.successText};
    background: ${palette.successBackground};
  }

  [data-revu-theme='${theme}'] .form-error {
    color: ${palette.errorText};
    background: ${palette.errorBackground};
  }

  [data-revu-theme='${theme}'] .modal-backdrop {
    background: ${palette.modalBackdrop};
  }

  [data-revu-theme='${theme}'] .modal-card {
    background: ${palette.modalSurfaceBackground};
  }

  [data-revu-theme='${theme}'] .dashboard-identity-value,
  [data-revu-theme='${theme}'] .review-response-answer {
    color: ${palette.surfaceText};
  }

  [data-revu-theme='${theme}'] .warning-banner {
    color: ${palette.warningText};
    border-color: ${palette.warningBorder};
    background: ${palette.warningBackground};
  }

  [data-revu-theme='${theme}'] .admin-list-item-active {
    border-color: ${palette.activeBorder};
    background: ${palette.activeBackground};
  }

  [data-revu-theme='${theme}'] .local-user-export-mode-option-selected {
    border-color: ${palette.activeBorder};
    background: ${palette.activeBackground};
  }
`;
}

export const themeStyleOverrides = (Object.entries(themePalettes) as Array<[Exclude<ThemePreference, 'light'>, ThemePalette]>)
  .map(([theme, palette]) => buildThemeOverrides(theme, palette))
  .join('\n');

export function normalizeThemePreference(value: string | null): ThemePreference {
  if (value === 'dark') {
    return 'winter-nights';
  }

  return (themePreferences as readonly string[]).includes(value ?? '') ? (value as ThemePreference) : 'light';
}

export function getThemeLabel(theme: ThemePreference) {
  return themeLabels[theme];
}

export function getNextThemePreference(theme: ThemePreference): ThemePreference {
  const currentIndex = themePreferences.indexOf(theme);
  return themePreferences[(currentIndex + 1) % themePreferences.length] ?? 'light';
}

export function getThemeColorScheme(theme: ThemePreference): ThemeColorScheme {
  return themeColorSchemes[theme];
}
