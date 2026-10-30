import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import tollfreeWebhookRouter from "../src/routes/twilio-tollfree-webhook";
import * as twilioWebhookAuth from "../src/lib/twilio-webhook-auth";

const ROOT = path.resolve(__dirname, "..");

describe("Challenger 3 — Empirical Pipeline Invariant Tests", () => {
  describe("Invariant 1: Documentation Index & Organization Integrity", () => {
    const canonicalIndexPath = path.join(ROOT, "docs", "README.md");
    const auditIndexPath = path.join(ROOT, "docs", "AUDIT_INDEX.md");

    it("verifies both index files exist and are readable", () => {
      expect(fs.existsSync(canonicalIndexPath)).toBe(true);
      expect(fs.existsSync(auditIndexPath)).toBe(true);
    });

    it("verifies launch documents are correctly indexed in either canonical or audit index", () => {
      const canonicalContent = fs.readFileSync(canonicalIndexPath, "utf8");
      const auditContent = fs.readFileSync(auditIndexPath, "utf8");

      // BOTBOUND_FULL_AUDIT_REPORT.md must be indexed in AUDIT_INDEX.md
      expect(auditContent).toContain("BOTBOUND_FULL_AUDIT_REPORT.md");

      // ENVIRONMENT_VARIABLES_MATRIX.md and FLAWLESS_LAUNCH_ROADMAP.md must be in README.md
      expect(canonicalContent).toContain("ENVIRONMENT_VARIABLES_MATRIX.md");
      expect(canonicalContent).toContain("FLAWLESS_LAUNCH_ROADMAP.md");
    });

    it("verifies no launch document is dual-indexed across both indexes", () => {
      const canonicalContent = fs.readFileSync(canonicalIndexPath, "utf8");
      const auditContent = fs.readFileSync(auditIndexPath, "utf8");

      const launchDocs = [
        "BOTBOUND_FULL_AUDIT_REPORT.md",
        "ENVIRONMENT_VARIABLES_MATRIX.md",
        "FLAWLESS_LAUNCH_ROADMAP.md",
      ];

      for (const doc of launchDocs) {
        const inCanonical = canonicalContent.includes(doc);
        const inAudit = auditContent.includes(doc);
        expect(inCanonical && inAudit).toBe(false);
        expect(inCanonical || inAudit).toBe(true);
      }
    });

    it("verifies all three launch document files physically exist on disk", () => {
      const docsLaunchDir = path.join(ROOT, "docs", "launch");
      expect(fs.existsSync(path.join(docsLaunchDir, "BOTBOUND_FULL_AUDIT_REPORT.md"))).toBe(true);
      expect(fs.existsSync(path.join(docsLaunchDir, "ENVIRONMENT_VARIABLES_MATRIX.md"))).toBe(true);
      expect(fs.existsSync(path.join(docsLaunchDir, "FLAWLESS_LAUNCH_ROADMAP.md"))).toBe(true);
    });

    it("verifies all internal markdown links in docs/launch/ resolve to existing files", () => {
      const docsLaunchDir = path.join(ROOT, "docs", "launch");
      const files = fs.readdirSync(docsLaunchDir).filter((f) => f.endsWith(".md"));

      const markdownLinkRe = /\[[^\]]*\]\(([^)]+)\)/g;

      for (const file of files) {
        const filePath = path.join(docsLaunchDir, file);
        const content = fs.readFileSync(filePath, "utf8");
        let match;
        while ((match = markdownLinkRe.exec(content)) !== null) {
          const rawTarget = match[1].trim();
          if (
            !rawTarget ||
            rawTarget.startsWith("#") ||
            /^(?:https?:|mailto:|tel:|data:)/i.test(rawTarget)
          ) {
            continue;
          }
          const cleanTarget = rawTarget.split("#", 1)[0].split("?", 1)[0];
          if (!cleanTarget.endsWith(".md")) continue;

          const resolved = path.resolve(docsLaunchDir, cleanTarget);
          expect(
            fs.existsSync(resolved),
            `Link target ${cleanTarget} in ${file} should exist`,
          ).toBe(true);
        }
      }
    });
  });

  describe("Invariant 2: AuthZ Default-Deny & Allowlist Verification", () => {
    it("keeps retired Gemini HTTP routes as nonbillable 410 tombstones", () => {
      const routes = fs.readFileSync(path.join(ROOT, "src/routes/live-voice-routes.ts"), "utf8");
      const section = routes.slice(routes.indexOf("// Retired legacy provider entry points"));
      expect(section).toContain('"/api/voice/live/gemini/status"');
      expect(section).toContain('"/api/voice/live/gemini/session"');
      expect(section).toContain('"/api/voice/live/gemini/tool"');
      expect(section).toContain('res.status(410).json({');
      expect(section).toContain('code: "VOICE_PROVIDER_RETIRED"');
      expect(routes).not.toContain("prepareGeminiLiveSessionConfig");
      expect(routes).not.toContain("runGeminiLiveTool");
      expect(routes).not.toContain("getGeminiLiveVoiceStatus");
    });

    it("keeps authentication on retired Gemini POST entry points", () => {
      const routes = fs.readFileSync(path.join(ROOT, "src/routes/live-voice-routes.ts"), "utf8");
      for (const pathSuffix of ["session", "tool"]) {
        const block = routes.slice(routes.indexOf(`"/api/voice/live/gemini/${pathSuffix}"`));
        expect(block.slice(0, 110)).toContain("authenticateUser");
      }
    });

    it("does not mount the legacy Gemini WebSocket on the persistent voice worker", () => {
      const worker = fs.readFileSync(path.join(ROOT, "src/entrypoints/voice-worker.ts"), "utf8");
      expect(worker).not.toContain('from "../lib/voice/gemini-media-bridge"');
      expect(worker).not.toContain("installGeminiMediaBridge(");
      expect(worker).toContain("installClonedMediaServer(server, { port, maxCalls, canAdmit });");
    });

    it("keeps the retired public status in the exact authorization allowlist", () => {
      const generator = fs.readFileSync(path.join(ROOT, "scripts/generate-authz-matrix.ts"), "utf8");
      expect(generator).toContain("status$/");
      expect(generator).toContain("Retired Gemini voice status tombstone (410)");
    });
  });

  describe("Invariant 3: API Error Shape Ratchet Compliance", () => {
    it("verifies twilio-tollfree-webhook error response includes machine-readable code", () => {
      const webhookSource = fs.readFileSync(
        path.join(ROOT, "src", "routes", "twilio-tollfree-webhook.ts"),
        "utf8",
      );

      expect(webhookSource).toContain('code: "TOLLFREE_CALLBACK_INVALID_PAYLOAD"');
      expect(webhookSource).toContain(
        'error: "Missing VerificationSid or Status in callback payload."',
      );
    });

    it("empirically verifies tollfree webhook handler returns HTTP 400 with machine-readable code on empty payload", async () => {
      vi.spyOn(twilioWebhookAuth, "evaluateTwilioWebhookAuth").mockReturnValue({ ok: true } as any);

      let resolveDone!: () => void;
      const done = new Promise<void>((resolve) => {
        resolveDone = resolve;
      });
      const res: any = {
        statusCode: 200,
        headers: {},
        body: null,
        done,
        status(code: number) {
          res.statusCode = code;
          return res;
        },
        type(t: string) {
          res.headers["content-type"] = t;
          return res;
        },
        send(b: unknown) {
          res.body = b;
          resolveDone();
          return res;
        },
        json(b: unknown) {
          res.body = b;
          resolveDone();
          return res;
        },
      };
      const req: any = {
        method: "POST",
        url: "/api/twilio-webhook/tollfree-verification-status",
        headers: { host: "botbound.app" },
        body: {},
      };

      tollfreeWebhookRouter(req, res as any, () => {
        resolveDone();
      });
      await res.done;

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        ok: false,
        code: "TOLLFREE_CALLBACK_INVALID_PAYLOAD",
        error: "Missing VerificationSid or Status in callback payload.",
      });
    });

    it("verifies api-error ratchet json is configured to 0 legacy responses", () => {
      const ratchetConfig = JSON.parse(
        fs.readFileSync(path.join(ROOT, "scripts", "api-error-ratchet.json"), "utf8"),
      );

      expect(ratchetConfig.maxLegacyErrorResponses).toBe(0);
    });

    it("verifies no routes in src/routes return uncoded error json", () => {
      function walkRoutes(dir: string, out: string[] = []): string[] {
        for (const name of fs.readdirSync(dir)) {
          const p = path.join(dir, name);
          const st = fs.statSync(p);
          if (st.isDirectory()) walkRoutes(p, out);
          else if (
            name.endsWith(".ts") &&
            !name.endsWith(".test.ts") &&
            p.includes(`${path.sep}routes${path.sep}`)
          ) {
            out.push(p);
          }
        }
        return out;
      }

      let unCodedErrors = 0;
      const offendingLocations: string[] = [];
      const routeFiles = walkRoutes(path.join(ROOT, "src", "routes"));

      for (const file of routeFiles) {
        const text = fs.readFileSync(file, "utf8");
        const re = /res\.status\((\d+)\)\.json\(\s*(\{[\s\S]*?\})\s*\)/g;
        let match;
        while ((match = re.exec(text))) {
          const body = match[2];
          if (!/error\s*:/.test(body)) continue;
          if (/\bcode\b\s*[:,}]/.test(body)) continue;
          unCodedErrors++;
          offendingLocations.push(path.relative(ROOT, file));
        }
      }

      expect(
        unCodedErrors,
        `Found uncoded error responses in: ${offendingLocations.join(", ")}`,
      ).toBe(0);
    });
  });

  describe("Invariant 4: ESLint Hygiene in Tollfree Scripts", () => {
    it("verifies submit-twilio-tollfree-verification.mjs prefixes unused caught errors with underscore", () => {
      const scriptSource = fs.readFileSync(
        path.join(ROOT, "scripts", "submit-twilio-tollfree-verification.mjs"),
        "utf8",
      );

      expect(scriptSource).toContain("catch (_thErr)");
      expect(scriptSource).not.toMatch(/catch\s*\(\s*thErr\s*\)/);
    });
  });

  describe("Invariant 5: Vitest Concurrency & Contract Test Suite Resilience", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

    it("verifies verify:contracts sets --fileParallelism=false and adequate testTimeout", () => {
      const verifyContractsCmd = pkg.scripts["verify:contracts"];
      expect(verifyContractsCmd).toBeDefined();
      expect(verifyContractsCmd).toContain("--fileParallelism=false");
      expect(verifyContractsCmd).toMatch(/--testTimeout=(?:[123]\d{4}|30000)/);
    });

    it("verifies all 49 contract test files specified in verify:contracts exist on disk", () => {
      const cmd = pkg.scripts["verify:contracts"] as string;
      const tokens = cmd.split(/\s+/);
      const testFiles = tokens.filter((t) => t.startsWith("tests/") && t.endsWith(".test.ts"));

      expect(testFiles.length).toBe(49);
      for (const tf of testFiles) {
        const fullPath = path.join(ROOT, tf);
        expect(fs.existsSync(fullPath), `Contract test file ${tf} must exist`).toBe(true);
      }
    });

    it("verifies the master verify pipeline chain contains all critical quality gates", () => {
      const verifyCmd = pkg.scripts.verify as string;
      expect(verifyCmd).toContain("docs:check");
      expect(verifyCmd).toContain("verify:contracts");
      expect(verifyCmd).toContain("build");
      expect(verifyCmd).toContain("smoke:server");
      expect(verifyCmd).toContain("design:check");
      expect(verifyCmd).toContain("security:routes:check");
    });
  });
});
