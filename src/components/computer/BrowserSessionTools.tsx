import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Camera,
  Download,
  History,
  KeyRound,
  Monitor,
  Puzzle,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { authFetch } from "../../lib/api";
import { Button, Input } from "../atoms";
import { StatusNotice } from "../molecules";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/shadcn/Sheet";
import type {
  OwnerBrowserCapabilities,
  OwnerBrowserCookie,
  OwnerBrowserDownload,
  OwnerBrowserHistory,
  OwnerSavedLogin,
} from "../../lib/cloud-computer/browser-capabilities";

export type OwnerBrowserInput =
  | { kind: "click"; x: number; y: number }
  | { kind: "drag"; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: "scroll"; x: number; y: number; deltaX: number; deltaY: number }
  | { kind: "navigate"; url: string }
  | { kind: "history"; action: "back" | "forward" | "reload" }
  | { kind: "switch_tab"; tabId: string }
  | { kind: "new_tab"; url?: string }
  | { kind: "close_tab"; tabId: string }
  | { kind: "import_cookies"; cookies: OwnerBrowserCookie[] }
  | { kind: "clear_cookies" }
  | { kind: "save_login"; origin: string; username: string; password: string }
  | { kind: "fill_login"; origin: string }
  | { kind: "clear_saved_login"; origin: string }
  | { kind: "type"; text: string }
  | { kind: "key"; key: string };

/** The owner deliberately saves a private frame/file to their own device. */
export function saveBrowserFile(url: string, name: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export default function BrowserSessionTools({
  open,
  onOpenChange,
  taskId,
  ownerControl,
  ownerBusy,
  ownerError,
  capabilities,
  history = [],
  downloads = [],
  savedLogins = [],
  downloadNotice,
  currentUrl,
  screenshotUrl,
  zoomed,
  onToggleZoom,
  onOwnerInput,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  ownerControl: boolean;
  ownerBusy: boolean;
  ownerError?: string | null;
  capabilities?: OwnerBrowserCapabilities | null;
  history?: OwnerBrowserHistory[];
  downloads?: OwnerBrowserDownload[];
  savedLogins?: OwnerSavedLogin[];
  downloadNotice?: string | null;
  currentUrl?: string | null;
  screenshotUrl?: string | null;
  zoomed: boolean;
  onToggleZoom: () => void;
  onOwnerInput?: (input: OwnerBrowserInput) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const cookieFile = useRef<HTMLInputElement>(null);
  const username = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const disabled = !ownerControl || ownerBusy;
  let currentOrigin: string | null = null;
  try {
    const url = new URL(currentUrl || "");
    if (url.protocol === "https:") currentOrigin = url.origin;
  } catch {
    // A fresh tab has no origin or saved login.
  }
  const hasSavedLogin = savedLogins.some((login) => login.origin === currentOrigin);
  useEffect(() => {
    // A redirect must never carry a partially entered login to another site.
    if (username.current) username.current.value = "";
    if (password.current) password.current.value = "";
  }, [currentOrigin, ownerControl, open]);

  const importCookies = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || disabled) return;
    setError(null);
    try {
      if (file.size > 65_536) throw new Error("Choose a cookie JSON file smaller than 64 KB.");
      let cookies: unknown;
      try {
        cookies = JSON.parse(await file.text());
      } catch {
        throw new Error("Choose a valid JSON file containing an array of cookies.");
      }
      if (!Array.isArray(cookies) || cookies.length === 0) {
        throw new Error("The file must contain a JSON array of cookies.");
      }
      // Cookie values stay out of React state, saved drafts and local storage.
      // The server independently validates every cookie and destination.
      onOwnerInput?.({ kind: "import_cookies", cookies: cookies as OwnerBrowserCookie[] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The cookie file could not be read.");
    }
  };

  const downloadFile = async (file: OwnerBrowserDownload) => {
    if (disabled || downloading) return;
    setDownloading(file.id);
    setError(null);
    try {
      const response = await authFetch(
        `/api/computer/tasks/${encodeURIComponent(taskId)}/downloads/${encodeURIComponent(file.id)}`,
      );
      if (!response.ok)
        throw new Error("This download is no longer available. Try it again in the browser.");
      const url = URL.createObjectURL(await response.blob());
      saveBrowserFile(url, file.name);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The file could not be downloaded.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (username.current) username.current.value = "";
          if (password.current) password.current.value = "";
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="wl-browser-tools">
        <SheetHeader>
          <SheetTitle>Browser tools</SheetTitle>
        </SheetHeader>
        <div className="wl-browser-tools__body">
          {!ownerControl ? (
            <p className="wl-browser-tools__notice">Take control to use browser tools.</p>
          ) : null}
          {error || ownerError ? (
            <StatusNotice tone="destructive" title="Browser tool unavailable">
              {error || ownerError}
            </StatusNotice>
          ) : null}

          <section aria-labelledby="browser-screen-heading">
            <h3 id="browser-screen-heading">
              <Monitor aria-hidden="true" /> Screen
            </h3>
            <div className="wl-browser-tools__actions">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!screenshotUrl}
                onClick={() => {
                  if (screenshotUrl)
                    saveBrowserFile(screenshotUrl, `botbound-screen-${Date.now()}.jpg`);
                }}
              >
                <Camera aria-hidden="true" /> Screenshot
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!screenshotUrl}
                onClick={onToggleZoom}
              >
                {zoomed ? "Fit browser" : "Actual size"}
              </Button>
            </div>
          </section>

          <section aria-labelledby="browser-history-heading">
            <h3 id="browser-history-heading">
              <History aria-hidden="true" /> Session history
            </h3>
            {history.length ? (
              <ol className="wl-browser-tools__list">
                {[...history].reverse().map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        onOwnerInput?.({ kind: "navigate", url: entry.url });
                        onOpenChange(false);
                      }}
                    >
                      <span>{entry.label || entry.url}</span>
                      <small>{entry.url}</small>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Visited sites appear here during this session.</p>
            )}
          </section>

          <section aria-labelledby="browser-downloads-heading">
            <h3 id="browser-downloads-heading">
              <Download aria-hidden="true" /> Downloads
            </h3>
            {downloads.length ? (
              <ul className="wl-browser-tools__list">
                {downloads.map((file) => (
                  <li key={file.id}>
                    <button
                      type="button"
                      disabled={disabled || downloading !== null}
                      onClick={() => void downloadFile(file)}
                    >
                      <span>{downloading === file.id ? "Downloading…" : file.name}</span>
                      <small>{Math.max(1, Math.round(file.bytes / 1024))} KB</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {capabilities?.downloads
                  ? "Files you download while in control appear here. Save them before returning control."
                  : "File capture is unavailable in this browser session."}
              </p>
            )}
            {downloadNotice ? <p role="status">{downloadNotice}</p> : null}
          </section>

          <section aria-labelledby="browser-cookies-heading">
            <h3 id="browser-cookies-heading">
              <ShieldCheck aria-hidden="true" /> Session cookies
            </h3>
            <p>
              Import a cookie JSON file to sign in to your sites. Cookies stay in this hosted
              session and clear when it ends.
            </p>
            {capabilities?.cookieImport ? (
              <div className="wl-browser-tools__actions">
                <input
                  ref={cookieFile}
                  type="file"
                  accept="application/json,.json"
                  aria-label="Import session cookies"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(event) => void importCookies(event)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => cookieFile.current?.click()}
                >
                  <Upload aria-hidden="true" /> Import JSON
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onOwnerInput?.({ kind: "clear_cookies" })}
                >
                  Clear cookies
                </Button>
              </div>
            ) : (
              <p>Cookie import is unavailable in this session.</p>
            )}
          </section>

          <section aria-labelledby="browser-logins-heading">
            <h3 id="browser-logins-heading">
              <KeyRound aria-hidden="true" /> Passwords & autofill
            </h3>
            <p>
              {capabilities?.sessionLogins
                ? "Save a login for this browser session. Fill only runs when you choose it, on the same secure site."
                : "Use the private browser input to enter credentials. A persistent password vault is not available."}
            </p>
            {capabilities?.sessionLogins ? (
              <form
                className="wl-browser-tools__login"
                autoComplete="off"
                onSubmit={(event) => {
                  event.preventDefault();
                  const loginUsername = username.current?.value || "";
                  const loginPassword = password.current?.value || "";
                  if (!loginPassword || disabled || !currentOrigin) return;
                  if (username.current) username.current.value = "";
                  if (password.current) password.current.value = "";
                  onOwnerInput?.({
                    kind: "save_login",
                    origin: currentOrigin,
                    username: loginUsername,
                    password: loginPassword,
                  });
                }}
              >
                <p className="wl-browser-tools__origin">
                  {currentOrigin || "Open a secure site to save a login."}
                </p>
                <label htmlFor="browser-session-username">Username</label>
                <Input
                  ref={username}
                  id="browser-session-username"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={500}
                  disabled={disabled || !currentOrigin}
                />
                <label htmlFor="browser-session-password">Password</label>
                <Input
                  ref={password}
                  id="browser-session-password"
                  type="password"
                  autoComplete="new-password"
                  maxLength={1000}
                  disabled={disabled || !currentOrigin}
                  required
                />
                <div className="wl-browser-tools__actions">
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={disabled || !currentOrigin}
                  >
                    Save for session
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={disabled || !hasSavedLogin}
                    onClick={() => {
                      if (currentOrigin)
                        onOwnerInput?.({ kind: "fill_login", origin: currentOrigin });
                    }}
                  >
                    Fill login
                  </Button>
                  {hasSavedLogin ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() => {
                        if (currentOrigin)
                          onOwnerInput?.({ kind: "clear_saved_login", origin: currentOrigin });
                      }}
                    >
                      Forget login
                    </Button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </section>

          <section aria-labelledby="browser-extensions-heading">
            <h3 id="browser-extensions-heading">
              <Puzzle aria-hidden="true" /> Extensions
            </h3>
            <p>This isolated browser does not support installing extensions.</p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
