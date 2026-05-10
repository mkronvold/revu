type RuntimeRevuConfig = {
  companyName?: string;
  revision?: string;
  questionSetStatusEnabled?: boolean | string;
};

declare global {
  interface Window {
    __REVU_CONFIG__?: RuntimeRevuConfig;
  }
}

export function getRuntimeCompanyName() {
  return window.__REVU_CONFIG__?.companyName?.trim() || null;
}

export function getRuntimeRevision() {
  return window.__REVU_CONFIG__?.revision?.trim() || null;
}

function parseBooleanFlag(value: boolean | string | null | undefined) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return null;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }

  return null;
}

export function getRuntimeQuestionSetStatusEnabled() {
  return typeof window === 'undefined' ? null : parseBooleanFlag(window.__REVU_CONFIG__?.questionSetStatusEnabled);
}

export const questionSetStatusEnabled =
  getRuntimeQuestionSetStatusEnabled() ?? parseBooleanFlag(import.meta.env.VITE_ENABLE_QUESTION_SET_STATUS) ?? false;
