type RuntimeRevuConfig = {
  companyName?: string;
};

declare global {
  interface Window {
    __REVU_CONFIG__?: RuntimeRevuConfig;
  }
}

export function getRuntimeCompanyName() {
  return window.__REVU_CONFIG__?.companyName?.trim() || null;
}
