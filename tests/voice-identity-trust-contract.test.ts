import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("voice identity trust contract", () => {
  it("fails closed behind authenticated per-user distributed cost controls", () => {
    const routes = source("src/routes/voices-routes.ts");

    expect(routes).toContain('bucket: "api:voice-clone"');
    expect(routes).toContain("distributedLimiterStatus()");
    expect(routes).toContain("rateLimit(userId");
    expect(routes).toContain("failClosedOnError: true");
    expect(routes).toContain('code: "RATE_LIMITER_ERROR"');
    expect(routes).not.toMatch(/const cloneRateLimiter = createIpRateLimiter/);
  });

  it("requires a specific authorization basis and records evidence before provider upload", () => {
    const routes = source("src/routes/voices-routes.ts");
    const panel = source("src/components/admin/VoiceLibraryPanel.tsx");

    expect(routes).toContain('type VoiceConsentBasis = "self" | "authorized_third_party"');
    expect(routes).toContain('"voice_clone_consent_attested"');
    expect(routes).toContain("sample_sha256");
    expect(routes).toContain("VOICE_CONSENT_VERSION");
    expect(routes.indexOf("voice_clone_consent_attested")).toBeLessThan(
      routes.indexOf("createInstantClone({"),
    );
    expect(routes).toContain('code: "VOICE_CONSENT_AUDIT_UNAVAILABLE"');

    expect(panel).toContain('value="self"');
    expect(panel).toContain('value="authorized_third_party"');
    expect(panel).toContain("consent_basis: consentBasis");
    expect(panel).toContain("impersonate");
  });

  it("keeps custom identities off unauthenticated preview routes", () => {
    const routes = source("src/routes/voices-routes.ts");

    expect(routes).toContain('if (voice.category !== "premade")');
    expect(routes).toContain('throw AppError.fromHttpStatus(404, "Voice not found.")');
  });

  it("does not discard the local ownership record until provider deletion succeeds", () => {
    const routes = source("src/routes/voices-routes.ts");
    const providerDelete = routes.indexOf("await elDeleteVoice(voiceId)");
    const localDelete = routes.indexOf(".delete(schema.clonedVoices)", providerDelete);

    expect(providerDelete).toBeGreaterThan(-1);
    expect(localDelete).toBeGreaterThan(providerDelete);
    expect(routes).toContain("retaining local ownership record");
    expect(routes).toContain('code: "VOICE_PROVIDER_DELETE_FAILED"');
    expect(routes).not.toContain("removing local row anyway");
  });

  it("does not expose provider or internal errors in clone responses", () => {
    const routes = source("src/routes/voices-routes.ts");

    expect(routes).toContain('code: "VOICE_CLONE_FAILED"');
    expect(routes).toContain(
      'error: "Voice creation failed. Try again or contact support if the problem continues."',
    );
    expect(routes).not.toContain("error: getErrorMessage(e),\n      });");
  });
});
