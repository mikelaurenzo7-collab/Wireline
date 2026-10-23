/** Public capability metadata. No credentials or provider connection details. */
export const OWNER_BROWSER_CAPABILITIES = {
  tabs: true,
  history: true,
  screenshots: true,
  downloads: true,
  cookieImport: true,
  cookieClear: true,
  sessionLogins: true,
  persistentPasswords: false,
  extensions: false,
  maxTabs: 8,
  historyLimit: 40,
  maxCookiesPerImport: 50,
  maxCookieImportBytes: 65_536,
  maxDownloadBytes: 20 * 1_024 * 1_024,
  maxDownloads: 3,
} as const;

export type OwnerBrowserCapabilities = typeof OWNER_BROWSER_CAPABILITIES;

export type OwnerBrowserCookie = {
  name: string;
  value: string;
  url?: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure: true;
  sameSite?: "Strict" | "Lax" | "None";
};

export type OwnerBrowserHistory = {
  id: number;
  tabId: string;
  label: string;
  /** A public URL with query/fragment and credential-bearing paths withheld. */
  url: string;
  visitedAt: string;
};

export type OwnerBrowserDownload = {
  id: string;
  name: string;
  bytes: number;
  createdAt: string;
};

export type OwnerSavedLogin = { origin: string; label: string };
