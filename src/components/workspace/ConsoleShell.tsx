import { useEffect, useRef, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { PageMeta } from "../../lib/page-meta";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

export type ConsoleNavItem = {
  id: string;
  label: string;
  path: string;
};

type ConsoleShellProps = {
  mode: "business" | "personal";
  nav: ConsoleNavItem[];
  activeId: string;
  activeLabel: string;
  metaPath: string;
  children: ReactNode;
};

export function ConsoleShell({
  mode,
  nav,
  activeId,
  activeLabel,
  metaPath,
  children,
}: ConsoleShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const workspaceLabel = mode === "business" ? "Business" : "Personal";

  useEffect(() => {
    document.documentElement.classList.add("wl-console-active");
    return () => document.documentElement.classList.remove("wl-console-active");
  }, []);

  return (
    <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden wl-console-surface app-surface">
      <PageMeta
        title={`${activeLabel} — ${workspaceLabel}`}
        description={`Wireline ${workspaceLabel.toLowerCase()} workspace — ${activeLabel}.`}
        path={metaPath}
        noIndex
      />
      <aside className="wl-glass-panel hidden w-[15.5rem] shrink-0 flex-col border-r border-white/10 p-4 lg:flex">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 px-2 pt-1 transition-opacity hover:opacity-85"
        >
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-sm font-bold text-white shadow-[0_0_12px_rgba(124,58,237,0.35)]">
            W
          </span>
          <span className="font-display text-[1.125rem] font-semibold text-white">Wireline</span>
        </Link>
        <WorkspaceSwitcher mode={mode} />
        <nav className="mt-5 flex flex-1 flex-col gap-0.5" aria-label={`${workspaceLabel} navigation`}>
          {nav.map(({ id, label, path }) => (
            <Link
              key={id}
              to={path}
              className={cx(
                "rounded-[12px] px-3 py-2 text-[13px] font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                activeId === id
                  ? "bg-brand text-white shadow-[0_0_16px_rgba(124,58,237,0.35)]"
                  : "text-white/55 hover:bg-white/[0.04] hover:text-white",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 pt-4 text-xs text-white/45">
          <div className="truncate px-1">{user?.email ?? "Signed in"}</div>
          <button
            type="button"
            onClick={() => {
              void signOut();
              navigate("/");
            }}
            className="mt-2 inline-flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#1e1b2e]/92 backdrop-blur-xl lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Link to="/" className="shrink-0">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-sm font-bold text-white">
                W
              </span>
            </Link>
            <p className="min-w-0 truncate text-sm font-semibold text-white">{activeLabel}</p>
            <button
              type="button"
              onClick={() => {
                void signOut();
                navigate("/");
              }}
              className="shrink-0 rounded-full p-2 text-white/50 hover:text-white"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
          <nav
            className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 py-2"
            aria-label={`${workspaceLabel} navigation`}
          >
            {nav.map(({ id, label, path }) => (
              <Link
                key={id}
                to={path}
                className={cx(
                  "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                  activeId === id
                    ? "bg-brand text-white"
                    : "text-white/50 hover:bg-white/5 hover:text-white",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="w-full flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          <div key={location.pathname} className="w-full max-w-[1280px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
