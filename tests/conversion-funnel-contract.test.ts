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
    expect(billing).toContain("StripeBillingCard");
    expect(read("src/components/StripeBillingCard.tsx")).toContain('"/api/billing/checkout"');
  });

  it("never sends an authenticated user to the public pricing page to buy", () => {
    expect(billing).not.toContain('to="/pricing"');
    expect(billing).not.toContain('href = "/pricing"');
  });

  it("keeps every public pricing CTA pointed at signup", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const ctaPaths = Array.from(pricing.matchAll(/ctaPath:\s*"([^"]+)"/g), (m) => m[1]);
    expect(ctaPaths.length).toBeGreaterThanOrEqual(3);
    for (const path of ctaPaths) expect(path).toMatch(/^\/signup\?plan=/);
  });
});

describe("the paywall is visible when it fires", () => {
  it("stacks the trial gate above the first-run activation wizard", () => {
    const gate = read("src/components/TrialGateModal.tsx");
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");

    const gateZ = gate.match(/fixed inset-0 z-\[(\d+)\]/);
    expect(gateZ).not.toBeNull();
    const gateZIndex = Number(gateZ![1]);

    expect(wizard).toContain("z-[var(--wireline-zIndex-modal,1050)]");
    const modalToken = Number(
      read("src/styles/tokens.generated.css").match(/--wireline-zIndex-modal:\s*(\d+)/)![1],
    );
    expect(gateZIndex).toBeGreaterThan(modalToken);

    const popoverToken = Number(
      read("src/styles/tokens.generated.css").match(/--wireline-zIndex-popover:\s*(\d+)/)![1],
    );
    expect(gateZIndex).toBeLessThan(popoverToken);
  });
});

describe("email verification confirms itself", () => {
  it("lands in the workspace, where the verify banner is actually mounted", () => {
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
    const access = read("src/components/auth/AuthAccessPanel.tsx");
    const oauthStart = access.indexOf("const startOAuth = async");
    const oauthEnd = access.indexOf("const handleAuth = async", oauthStart);
    const oauthBlock = access.slice(oauthStart, oauthEnd);

    expect(oauthBlock).toContain("clearFreshSignupSession()");
    expect(oauthBlock).not.toContain("markFreshSignupSession()");
    const clearIdx = oauthBlock.indexOf("clearFreshSignupSession()");
    const assignIdx = oauthBlock.indexOf("window.location.assign(payload.url)");
    expect(clearIdx).toBeGreaterThan(-1);
    expect(assignIdx).toBeGreaterThan(clearIdx);

    const completion = read("src/pages/OAuthComplete.tsx");
    expect(completion).toContain("await syncSignupIntent(getStoredSignupIntent())");
    expect(completion).toContain("if (data.is_new_user === true) markFreshSignupSession()");
  });
});

describe("signup consent recovers at the control that needs attention", () => {
  it("keeps the empty checkbox visible in both themes", () => {
    const checkbox = read("src/components/ui/shadcn/Checkbox.tsx");
    expect(checkbox).toContain("border-muted-foreground/70");
    expect(checkbox).not.toContain("border border-border bg-card");
  });

  it("points OAuth users to the consent control and clears the error after acceptance", () => {
    const access = read("src/components/auth/AuthAccessPanel.tsx");
    expect(access).toContain(
      'const TERMS_CONSENT_ERROR = "Accept the Terms and Privacy Policy above to continue.";',
    );
    expect(access).not.toContain("Privacy Policy below to continue");
    expect(access).toContain("termsRef.current?.focus()");
    expect(access).toContain("aria-labelledby={termsLabelId}");
    expect(access).toContain("aria-invalid={error === TERMS_CONSENT_ERROR}");
    expect(access).toContain(
      "aria-describedby={error === TERMS_CONSENT_ERROR ? termsErrorId : undefined}",
    );
    expect(access).toMatch(
      /event\.target\.checked && error === TERMS_CONSENT_ERROR\) setError\(null\)/,
    );
  });
});

describe("account entry recognizes an existing session without blocking first paint", () => {
  it("hydrates auth routes in the background while keeping marketing routes probe-free", () => {
    const auth = read("src/contexts/AuthContext.tsx");
    const access = read("src/components/auth/AuthAccessPanel.tsx");
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
    expect(access).toContain("if (authLoading || !user) return;");
    expect(access).toContain("navigate(resolvePostAuthDestination(workspaceMode, location.search)");
  });
});

describe("password recovery keeps reset credentials out of request and browser history", () => {
  it("issues new reset links with a fragment and never logs token material", () => {
    const routes = read("src/routes/auth-routes.ts");
    expect(routes).toContain('/reset-password#token=${encodeURIComponent(token.token)}');
    expect(routes).not.toContain('/reset-password?token=${encodeURIComponent(token.token)}');
    expect(routes).not.toContain("tokenPrefix:");
    expect(routes).not.toContain("token.token.slice(");
  });

  it("captures fragment tokens synchronously, supports old query links, and strips the URL", () => {
    const reset = read("src/pages/ResetPassword.tsx");
    expect(reset).toContain("function readResetTokenFromLocation(): string");
    expect(reset).toContain('window.location.hash.replace(/^#/, "")');
    expect(reset).toContain('return hash.get("token") || query.get("token") || ""');
    expect(reset).toContain("const resetTokenRef = useRef(readResetTokenFromLocation())");
    expect(reset).toContain('const [token] = useState<string | null>(() => resetTokenRef.current || null)');
    expect(reset).toContain(
      'window.history.replaceState(window.history.state, "", window.location.pathname)',
    );
    expect(reset).not.toContain("setToken(raw");
  });
});

describe("signup states the whole password policy before submission", () => {
  it("mirrors every rule getPasswordPolicyError enforces", () => {
    const policy = read("src/lib/password-policy.ts");
    const access = read("src/components/auth/AuthAccessPanel.tsx");

    const policyChecks = [
      { policy: "password.length < 8", label: "8+ characters" },
      { policy: "/[A-Z]/.test(password)", label: "uppercase" },
      { policy: "/[a-z]/.test(password)", label: "lowercase" },
      { policy: "/[0-9]/.test(password)", label: "number" },
    ];
    for (const { policy: check, label } of policyChecks) {
      expect(policy, `policy should enforce ${label}`).toContain(check);
      expect(access, `signup should surface ${label}`).toContain(`"${label}"`);
    }

    expect(access).not.toContain('"At least 8 characters"');
    expect(access).toContain("PASSWORD_RULES");
    expect(access).toContain('aria-label="Password requirements"');
    expect(access).toContain("minLength={isSignUp ? 8 : undefined}");
  });

  it("offers a way out of a duplicate-email signup", () => {
    expect(read("src/routes/auth-routes.ts")).toContain(
      "An account with this email already exists. Try signing in instead.",
    );
    const access = read("src/components/auth/AuthAccessPanel.tsx");
    expect(access).toContain("Sign in instead");
    expect(access).toMatch(/already exists\/i\.test\(error\)/);
  });
});
