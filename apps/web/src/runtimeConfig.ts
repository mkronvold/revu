type RuntimeRevuConfig = {
  companyName?: string;
  revision?: string;
  questionSetStatusEnabled?: boolean | string;
  autoRefreshIntervalMs?: number | string;
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

function parsePositiveIntegerFlag(value: number | string | null | undefined) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  const parsed = Number(normalizedValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getRuntimeQuestionSetStatusEnabled() {
  return typeof window === 'undefined' ? null : parseBooleanFlag(window.__REVU_CONFIG__?.questionSetStatusEnabled);
}

export const questionSetStatusEnabled =
  getRuntimeQuestionSetStatusEnabled() ?? parseBooleanFlag(import.meta.env.VITE_ENABLE_QUESTION_SET_STATUS) ?? false;

export function getRuntimeAutoRefreshIntervalMs() {
  return typeof window === 'undefined' ? null : parsePositiveIntegerFlag(window.__REVU_CONFIG__?.autoRefreshIntervalMs);
}

export const autoRefreshIntervalMs =
  getRuntimeAutoRefreshIntervalMs() ?? parsePositiveIntegerFlag(import.meta.env.VITE_AUTO_REFRESH_INTERVAL_MS) ?? 60000;
