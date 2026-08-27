import { useLocation } from "react-router";

import AuthAccessPanel from "./auth/AuthAccessPanel";
import { PageMeta } from "../lib/page-meta";

export default function AuthPortal() {
  const location = useLocation();
  const isSignupRoute =
    location.pathname === "/signup" ||
    location.pathname.startsWith("/signup/") ||
    location.pathname === "/get-started";
  const title = isSignupRoute ? "Create your account" : "Sign in";
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
      <div className="wl-stitch-auth-shell">
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
