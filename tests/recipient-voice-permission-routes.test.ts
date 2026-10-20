import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isMarketingPublicPath,
  isPublicCapabilityPath,
  isSessionOptionalPublicPath,
} from "../src/lib/public-routes";
const h = vi.hoisted(() => ({
  create: vi.fn(),
  grant: vi.fn(),
  list: vi.fn(),
  preview: vi.fn(),
  link: vi.fn(),
  revoke: vi.fn(),
  publicRevoke: vi.fn(),
  limits: [] as Array<Record<string, unknown>>,
}));
vi.mock("../src/lib/recipient-voice-permission-store", () => ({
  createRecipientVoicePermission: h.create,
  grantRecipientVoicePermission: h.grant,
  listRecipientVoicePermissions: h.list,
  previewRecipientVoicePermission: h.preview,
  recipientVoicePermissionLink: h.link,
  revokeRecipientVoicePermission: h.revoke,
  revokePublicRecipientVoicePermission: h.publicRevoke,
}));
vi.mock("../src/middleware/auth", () => ({
  authenticateUser: (req: any, res: any, next: any) =>
    req.user ? next() : res.status(401).json({ error: "Authentication required" }),
}));
vi.mock("../src/middleware/api-rate-limits", () => ({
  createRateLimiter: (options: Record<string, unknown>) => {
    h.limits.push(options);
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
  createIpRateLimiter: (options: Record<string, unknown>) => {
    h.limits.push(options);
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
}));
import router from "../src/routes/recipient-voice-permission-routes";
const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const token = `${id}.${"a".repeat(43)}`;
const summary = { id, status: "pending" };
const ownerBody = {
  request_key: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  agent_id: "owned-bot",
  phone: "+13125550100",
  call_purpose: "callback",
  recipient_state: "IL",
  recipient_time_zone: "America/Chicago",
};

function invoke(method: string, routePath: string, input: any = {}): Promise<any> {
  const layer = (router as any).stack.find(
    (entry: any) => entry.route?.path === routePath && entry.route.methods[method],
  );
  if (!layer) throw new Error("Route not found");
  const req = { params: { id }, body: {}, ip: "192.0.2.1", get: () => "test-agent", ...input };
  return new Promise((resolve, reject) => {
    const res: any = {
      statusCode: 200,
      headers: {},
      set: (headers: Record<string, string>) => {
        Object.assign(res.headers, headers);
        return res;
      },
      status: (code: number) => {
        res.statusCode = code;
        return res;
      },
      json: (body: unknown) => resolve({ code: res.statusCode, body, headers: res.headers }),
    };
    let index = 0;
    const next = (error?: any) => {
      if (error) {
        resolve({ code: error.status, error });
        return;
      }
      const handler = layer.route.stack[index++]?.handle;
      if (!handler) {
        reject(new Error("Route did not complete"));
        return;
      }
      try {
        const pending = handler(req, res, next);
        if (pending?.catch) pending.catch(next);
      } catch (cause) {
        next(cause);
      }
    };
    const privacy = (router as any).stack.find((entry: any) => !entry.route)?.handle;
    if (privacy) privacy(req, res, next);
    else next();
  });
}

beforeEach(() => {
  vi.stubEnv("BOTBOUND_GENERAL_OUTBOUND_ENABLED", "false");
  vi.stubEnv("BOTBOUND_NON_MARKETING_OUTBOUND_ENABLED", "false");
  vi.stubEnv("APP_URL", "https://botbound.app");
  vi.stubEnv("NODE_ENV", "test");
  for (const name of [
    "VERCEL_ENV",
    "VERCEL",
    "RENDER",
    "RENDER_SERVICE_ID",
    "RENDER_GIT_BRANCH",
    "RENDER_GIT_COMMIT",
  ])
    vi.stubEnv(name, "");
  vi.clearAllMocks();
  h.create.mockResolvedValue({ permission: summary, token });
  h.list.mockResolvedValue([summary]);
  h.link.mockResolvedValue(token);
  h.preview.mockResolvedValue({ permission: summary });
  h.grant.mockResolvedValue({ permission: { ...summary, status: "granted" } });
  h.revoke.mockResolvedValue({ ...summary, status: "revoked" });
  h.publicRevoke.mockResolvedValue({ ...summary, status: "revoked" });
});
afterEach(() => vi.unstubAllEnvs());

describe("recipient voice permission HTTP boundaries", () => {
  it("classifies the recipient shell as an exact public capability without broadening marketing or private routes", () => {
    for (const path of ["/voice-permission", "/voice-permission/"]) {
      expect(isPublicCapabilityPath(path)).toBe(true);
      expect(isSessionOptionalPublicPath(path)).toBe(true);
      expect(isMarketingPublicPath(path)).toBe(false);
    }
    for (const path of [
      "/voice-permission/private",
      "/voice-permissions",
      "/computer",
      "/outbound",
    ]) {
      expect(isPublicCapabilityPath(path)).toBe(false);
      expect(isSessionOptionalPublicPath(path)).toBe(false);
    }
    const authz = readFileSync("scripts/generate-authz-matrix.ts", "utf8");
    expect(authz).toContain("recipient\\/(?:preview|confirm|revoke)$");
  });
  it("requires authentication for every owner operation", async () => {
    for (const [method, path] of [
      ["get", "/api/voice-permissions"],
      ["post", "/api/voice-permissions"],
      ["post", "/api/voice-permissions/:id/link"],
      ["post", "/api/voice-permissions/:id/revoke"],
    ]) {
      expect((await invoke(method, path)).code).toBe(401);
    }
    expect(h.create).not.toHaveBeenCalled();
    expect(h.list).not.toHaveBeenCalled();
    expect(h.link).not.toHaveBeenCalled();
    expect(h.revoke).not.toHaveBeenCalled();
  });
  it.each(["http://localhost:3000", "https://botbound-preview.example"])(
    "uses only configured canonical origin %s for sandbox links",
    async (origin) => {
      vi.stubEnv("BOTBOUND_GENERAL_OUTBOUND_ENABLED", "false");
      vi.stubEnv("BOTBOUND_NON_MARKETING_OUTBOUND_ENABLED", "false");
      vi.stubEnv("APP_URL", origin);
      const response = await invoke("post", "/api/voice-permissions", {
        user: { id: "owner" },
        body: ownerBody,
        headers: { origin: "https://attacker.example", host: "attacker.example" },
      });
      expect(response.code).toBe(200);
      expect(response.body.capture_url).toBe(`${origin}/voice-permission#token=${token}`);
      const retrieved = await invoke("post", "/api/voice-permissions/:id/link", {
        user: { id: "owner" },
      });
      expect(retrieved.body.capture_url).toBe(response.body.capture_url);
    },
  );
  it.each([
    "https://other.example",
    "https://botbound.app/path",
    "http://botbound.app",
    "https://user:password@botbound.app",
  ])(
    "fails closed on noncanonical production origin %s before minting or retrieving a token",
    async (origin) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("BOTBOUND_GENERAL_OUTBOUND_ENABLED", "false");
      vi.stubEnv("BOTBOUND_NON_MARKETING_OUTBOUND_ENABLED", "false");
      vi.stubEnv("APP_URL", origin);
      const created = await invoke("post", "/api/voice-permissions", {
        user: { id: "owner" },
        body: ownerBody,
      });
      expect(created.code).toBe(503);
      expect(created.body).toBeUndefined();
      expect(h.create).not.toHaveBeenCalled();
      const retrieved = await invoke("post", "/api/voice-permissions/:id/link", {
        user: { id: "owner" },
      });
      expect(retrieved.code).toBe(503);
      expect(retrieved.body).toBeUndefined();
      expect(h.link).not.toHaveBeenCalled();
    },
  );
  it("binds request creation to the authenticated owner and returns a fragment-only capability", async () => {
    const response = await invoke("post", "/api/voice-permissions", {
      user: { id: "owner" },
      body: ownerBody,
    });
    expect(response.code).toBe(200);
    expect(h.create).toHaveBeenCalledWith({
      userId: "owner",
      requestKey: ownerBody.request_key,
      agentId: "owned-bot",
      phone: ownerBody.phone,
      callPurpose: "callback",
      recipientState: "IL",
      timeZone: "America/Chicago",
    });
    const url = new URL(response.body.capture_url);
    expect(url.origin).toBe("https://botbound.app");
    expect(url.pathname).toBe("/voice-permission");
    expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("token")).toBe(token);
    expect(response.headers).toMatchObject({
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    });
  });
  it.each([
    { user_id: "other-owner" },
    { seller_name: "Other Seller" },
    { hasExpressWrittenConsent: true },
    { recipient_state: "CA" },
    { recipient_time_zone: "America/New_York" },
  ])("does not accept caller-authored authority fields %j", async (patch) => {
    expect(
      (
        await invoke("post", "/api/voice-permissions", {
          user: { id: "owner" },
          body: { ...ownerBody, ...patch },
        })
      ).code,
    ).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });
  it("returns only service-provided summaries on list and mints a link only on explicit owner action", async () => {
    expect((await invoke("get", "/api/voice-permissions", { user: { id: "owner" } })).body).toEqual(
      { permissions: [summary], calling: { general: false, nonMarketing: false } },
    );
    expect(h.link).not.toHaveBeenCalled();
    await invoke("post", "/api/voice-permissions/:id/link", { user: { id: "owner" } });
    expect(h.link).toHaveBeenCalledWith("owner", id);
  });
  it("requires exact written capture, number and signed-location fields; never grants from preview", async () => {
    await invoke("post", "/api/voice-permissions/recipient/preview", { body: { token } });
    expect(h.preview).toHaveBeenCalledWith(token);
    expect(h.grant).not.toHaveBeenCalled();
    const body = {
      token,
      signer_name: "Taylor Example",
      phone: "+13125550100",
      accepted: true,
      disclosure_hash: "a".repeat(64),
      recipient_state: "IL",
      recipient_time_zone: "America/Chicago",
    };
    for (const patch of [
      { accepted: false },
      { signer_name: "" },
      { disclosure_hash: "wrong" },
      { user_id: "other-owner" },
    ])
      expect(
        (
          await invoke("post", "/api/voice-permissions/recipient/confirm", {
            body: { ...body, ...patch },
          })
        ).code,
      ).toBe(400);
    await invoke("post", "/api/voice-permissions/recipient/confirm", { body });
    expect(h.grant).toHaveBeenCalledOnce();
    expect(h.grant).toHaveBeenCalledWith({
      token,
      signerName: body.signer_name,
      phone: body.phone,
      accepted: true,
      disclosureHash: body.disclosure_hash,
      recipientState: "IL",
      timeZone: "America/Chicago",
      ip: "192.0.2.1",
      userAgent: "test-agent",
    });
  });
  it("exposes no unauthenticated list and does not take a tenant from public revoke", async () => {
    await invoke("post", "/api/voice-permissions/recipient/revoke", { body: { token } });
    expect(h.publicRevoke).toHaveBeenCalledWith(token);
    expect(
      (
        await invoke("post", "/api/voice-permissions/recipient/revoke", {
          body: { token, user_id: "other-owner" },
        })
      ).code,
    ).toBe(400);
  });
  it("uses independent fail-closed owner and public IP buckets without automated provider work", () => {
    expect(h.limits).toContainEqual(
      expect.objectContaining({ bucket: "voice-permission-owner", failClosedOnError: true }),
    );
    expect(h.limits).toContainEqual(
      expect.objectContaining({ bucket: "voice-permission-recipient", failClosedOnError: true }),
    );
    const source = readFileSync("src/routes/recipient-voice-permission-routes.ts", "utf8");
    expect(source).not.toContain("sendEmail");
    expect(source).not.toContain("calls.create");
    expect(source).not.toContain("messages.create");
    expect(source).not.toContain("req.query.token");
    const measurement = readFileSync("public/marketing-measurement.js", "utf8");
    expect(measurement.indexOf("voice-permission")).toBeLessThan(
      measurement.indexOf("function loadPrivacyAnalytics"),
    );
    expect(measurement).toContain("window.plausible = noop;");
  });
});
