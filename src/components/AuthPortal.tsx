import { useLocation } from "react-router";
import { Moon, Sun } from "lucide-react";

import AuthAccessPanel from "./auth/AuthAccessPanel";
import { PageMeta } from "../lib/page-meta";
import { useTheme } from "../contexts/ThemeContext";

export default function AuthPortal() {
  const location = useLocation();
  const { resolvedTheme, toggleTheme } = useTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  const isSignupRoute =
    location.pathname === "/signup" ||
    location.pathname.startsWith("/signup/") ||
    location.pathname === "/get-started";
  const title = isSignupRoute ? "Create Your Account" : "Sign In";
  const description = isSignupRoute
    ? "Create your BotBound account and build your first Bot."
    : "Sign in to BotBound.";

  return (
    <>
      <PageMeta
        title={title}
        description={description}
        path={isSignupRoute ? "/signup" : "/signin"}
        noIndex
      />
      <div className="wl-stitch-auth-shell relative">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${nextTheme} appearance`}
          title={`Switch to ${nextTheme} appearance`}
          className="wl-focus-ring-halo absolute right-4 top-4 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground sm:right-6 sm:top-6"
        >
          {resolvedTheme === "dark" ? (
            <Sun className="size-5" aria-hidden="true" />
          ) : (
            <Moon className="size-5" aria-hidden="true" />
          )}
        </button>
        <main
          id="main-content"
          className="wl-auth-form-panel flex min-h-full items-center justify-center overflow-y-auto px-4 py-6 sm:px-6 sm:py-10"
          tabIndex={-1}
        >
          <div className="w-full max-w-[520px]">
            <AuthAccessPanel initialMode={isSignupRoute ? "signup" : "signin"} />
          </div>
        </main>
      </div>
    </>
  );
}
