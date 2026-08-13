import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// The acquisition funnel is the revenue path. Each invariant here replaced a
// verified dead end where a user's intent — to pay, to verify, to get started
// — was silently dropped. These are structural, so a source-reading contract
// is the honest way to pin them.
describe("a signed-in customer can reach Stripe", () => {
  const billing = read("src/pages/BillingSettings.tsx");

  it("mounts the real checkout card on the billing settings page", () => {
    // StripeBillingCard owns POST /api/billing/checkout. Its only other mount
    // is admin/SubscriptionPanel under /admin, which nothing links to.
    expect(billing).toContain("StripeBillingCard");
    expect(read("src/components/StripeBillingCard.tsx")).toContain('"/api/billing/checkout"');
  });

  it("never sends an authenticated user to the public pricing page to buy", () => {
    // /pricing plan cards all point at /signup?plan=..., and AuthPortal
    // redirects an already-authenticated visitor straight to /overview — so
    // any in-product link to /pricing is a loop back to the dashboard.
    expect(billing).not.toContain('to="/pricing"');
    expect(billing).not.toContain('href = "/pricing"');
  });

  it("keeps every public pricing CTA pointed at signup", () => {
    // Guards the assumption above: if these ever became direct-checkout links
    // the loop would be gone and the rule could relax.
    const pricing = read("src/pages/Pricing.tsx");
    const ctaPaths = Array.from(pricing.matchAll(/ctaPath:\s*"([^"]+)"/g), (m) => m[1]);
    expect(ctaPaths.length).toBeGreaterThanOrEqual(3);
    for (const path of ctaPaths) expect(path).toMatch(/^\/signup\?plan=/);
  });
});

describe("the paywall is visible when it fires", () => {
  it("stacks the trial gate above the first-run activation wizard", () => {
    // Both are fixed siblings with no intervening stacking context. At the old
    // z-[100] the gate painted under the wizard's opaque backdrop (z-1050)
    // while the focus trap moved keyboard focus into it — an invisible dialog
    // at the highest-intent moment in the funnel.
    const gate = read("src/components/TrialGateModal.tsx");
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");

    const gateZ = gate.match(/fixed inset-0 z-\[(\d+)\]/);
    expect(gateZ).not.toBeNull();
    const gateZIndex = Number(gateZ![1]);

    // The wizard uses the modal token, which resolves to 1050.
    expect(wizard).toContain("z-[var(--wireline-zIndex-modal,1050)]");
    const modalToken = Number(
      read("src/styles/tokens.generated.css").match(/--wireline-zIndex-modal:\s*(\d+)/)![1],
    );
    expect(gateZIndex).toBeGreaterThan(modalToken);

    // Still below popover/tooltip so overlays raised from inside the dialog
    // render on top of it rather than behind.
    const popoverToken = Number(
      read("src/styles/tokens.generated.css").match(/--wireline-zIndex-popover:\s*(\d+)/)![1],
    );
    expect(gateZIndex).toBeLessThan(popoverToken);
  });
});

describe("email verification confirms itself", () => {
  it("lands in the workspace, where the verify banner is actually mounted", () => {
    // EmailVerifyBanner is the only reader of ?verified and is mounted inside
    // WorkspaceShell, which never renders on the public marketing homepage.
    // Redirecting to "/" dropped the confirmation and, on the expired path,
    // the resend affordance too.
    const routes = read("src/routes/auth-routes.ts");
    expect(routes).toContain('const VERIFY_EMAIL_LANDING_PATH = "/overview"');
    expect(routes).not.toMatch(/\$\{baseUrl\}\/\?verified=/);

    const banner = read("src/components/layout/EmailVerifyBanner.tsx");
    expect(banner).toContain('params.get("verified")');
    expect(read("src/components/WorkspaceShell.tsx")).toContain("<EmailVerifyBanner />");
  });
});

describe("OAuth signups get the same onboarding as email signups", () => {
  it("carries signup intent across the provider round-trip", () => {
    // OAuthComplete resolves the post-auth destination with no knowledge of
    // how the session started, so without this the three OAuth buttons at the
    // top of the signup card skipped Fast Start and the activation wizard.
    const portal = read("src/components/AuthPortal.tsx");
    const oauthBlock = portal.slice(
      portal.indexOf("function OAuthSignInButtons("),
      portal.indexOf("export default function"),
    );
    expect(oauthBlock).toContain("markFreshSignupSession()");
    expect(oauthBlock).toMatch(/if \(isSignUp\)[\s\S]{0,600}markFreshSignupSession\(\)/);
    // And the marker must be set BEFORE navigating away to the provider.
    const markIdx = oauthBlock.indexOf("markFreshSignupSession()");
    const assignIdx = oauthBlock.indexOf("window.location.assign(url)");
    expect(markIdx).toBeGreaterThan(-1);
    expect(assignIdx).toBeGreaterThan(markIdx);
  });
});

describe("signup consent recovers at the control that needs attention", () => {
  it("keeps the empty checkbox visible in both themes", () => {
    const checkbox = read("src/components/ui/shadcn/Checkbox.tsx");
    expect(checkbox).toContain("border-muted-foreground/70");
    expect(checkbox).not.toContain("border border-border bg-card");
  });

  it("points OAuth users to the consent control and clears the error after acceptance", () => {
    const portal = read("src/components/AuthPortal.tsx");
    expect(portal).toContain(
      'const TERMS_CONSENT_ERROR = "Accept the Terms and Privacy Policy above to continue.";',
    );
    expect(portal).not.toContain("Privacy Policy below to continue");
    expect(portal).toContain("termsRef.current?.focus()");
    expect(portal).toContain("aria-invalid={error === TERMS_CONSENT_ERROR}");
    expect(portal).toContain('error === TERMS_CONSENT_ERROR ? "auth-consent-error" : undefined');
    expect(portal).toMatch(
      /e\.target\.checked && error === TERMS_CONSENT_ERROR\) setError\(null\)/,
    );
  });
});

describe("account entry recognizes an existing session without blocking first paint", () => {
  it("hydrates auth routes in the background while keeping marketing routes probe-free", () => {
    const auth = read("src/contexts/AuthContext.tsx");
    const portal = read("src/components/AuthPortal.tsx");
    expect(auth).toContain(
      'import { isAuthPortalPath, isSessionOptionalPublicPath } from "../lib/public-routes";',
    );
    expect(auth).toMatch(
      /if \(sessionOptional\) \{[\s\S]{0,500}setLoading\(false\);[\s\S]{0,500}if \(!isAuthPortalPath\(location\.pathname\)\) return;/,
    );

    const backgroundGate = auth.indexOf("if (!isAuthPortalPath(location.pathname)) return;");
    const hydrate = auth.indexOf("await migrateLegacyLocalStorage();");
    expect(backgroundGate).toBeGreaterThan(-1);
    expect(hydrate).toBeGreaterThan(backgroundGate);
    expect(portal).toContain("if (authLoading || !user) return;");
    expect(portal).toContain("navigate(resolvePostAuthDestination(workspaceMode, location.search)");
  });
});

describe("password recovery does not leave reset credentials in browser history", () => {
  it("captures the token synchronously and strips the URL before paint", () => {
    const reset = read("src/pages/ResetPassword.tsx");
    expect(reset).toContain('useLayoutEffect, useRef, useState');
    expect(reset).toContain(
      'useRef(new URLSearchParams(window.location.search).get("token") || "")',
    );
    expect(reset).toContain('const [token] = useState<string | null>(() => resetTokenRef.current || null)');
    expect(reset).toContain(
      'window.history.replaceState(window.history.state, "", window.location.pathname)',
    );
    expect(reset).not.toContain("setToken(raw");
  });
});

describe("signup states the whole password policy up front", () => {
  it("mirrors every rule getPasswordPolicyError enforces", () => {
    // getPasswordPolicyError returns only the FIRST failure, so without a
    // checklist the only way to discover the rules was to submit repeatedly:
    // "mypassword" is rejected for the uppercase, then again for the digit.
    // A rule added to the policy but not to the checklist silently
    // reintroduces that loop, so the two are pinned together.
    const policy = read("src/lib/password-policy.ts");
    const portal = read("src/components/AuthPortal.tsx");

    const policyChecks = [
      { policy: "password.length < 8", label: "8+ characters" },
      { policy: "/[A-Z]/.test(password)", label: "uppercase" },
      { policy: "/[a-z]/.test(password)", label: "lowercase" },
      { policy: "/[0-9]/.test(password)", label: "number" },
    ];
    for (const { policy: check, label } of policyChecks) {
      expect(policy, `policy should enforce ${label}`).toContain(check);
      expect(portal, `signup should surface ${label}`).toContain(`"${label}"`);
    }

    // The placeholder must not understate the policy either.
    expect(portal).not.toContain('"At least 8 characters"');
    expect(portal).toContain("PASSWORD_RULES");
    expect(portal).toContain(
      'aria-describedby={isSignUp ? "auth-password-requirements" : undefined}',
    );
    expect(portal).toContain('<p id="auth-password-requirements" className="sr-only">');
  });

  it("offers a way out of a duplicate-email signup", () => {
    // The server copy says "Try signing in instead" — the UI has to provide it.
    expect(read("src/routes/auth-routes.ts")).toContain(
      "An account with this email already exists. Try signing in instead.",
    );
    const portal = read("src/components/AuthPortal.tsx");
    expect(portal).toContain("Sign in instead");
    expect(portal).toMatch(/already exists\/i\.test\(error\)/);
  });
});