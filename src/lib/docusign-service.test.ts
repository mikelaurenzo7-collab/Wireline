// @vitest-environment node
//
// DocuSign service smoke tests.
// We assert (a) the JWT-vs-access-token preference (JWT wins when both are
// set) and (b) the envelope-creation request shape DocuSign expects.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ENV_KEYS = [
  "DOCUSIGN_BASE_URI",
  "DOCUSIGN_ACCOUNT_ID",
  "DOCUSIGN_JWT_TOKEN",
  "DOCUSIGN_ACCESS_TOKEN",
];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
}
function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

describe("docusign-service.sendContract", () => {
  const originalFetch = global.fetch;
  let envSnap: Record<string, string | undefined>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    envSnap = snapshotEnv();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Module-scoped constants (DOCUSIGN_ACCOUNT_ID, DOCUSIGN_BASE_URI) are
    // captured at first import — reset so each test gets fresh ones.
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    restoreEnv(envSnap);
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("prefers DOCUSIGN_JWT_TOKEN over DOCUSIGN_ACCESS_TOKEN", async () => {
    process.env.DOCUSIGN_ACCOUNT_ID = "acct-jwt";
    process.env.DOCUSIGN_BASE_URI = "https://demo.docusign.net/restapi";
    process.env.DOCUSIGN_JWT_TOKEN = "jwt-wins";
    process.env.DOCUSIGN_ACCESS_TOKEN = "should-be-ignored";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ envelopeId: "env-123", status: "sent" }),
    });
    global.fetch = fetchMock as any;

    const { sendContract } = await import("./docusign-service");
    const result = await sendContract({
      recipientName: "Ada Lovelace",
      recipientEmail: "ada@example.com",
    });

    expect(result).toMatchObject({ envelopeId: "env-123", status: "sent" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer jwt-wins");
  });

  it("falls back to DOCUSIGN_ACCESS_TOKEN when JWT is unset", async () => {
    process.env.DOCUSIGN_ACCOUNT_ID = "acct-fallback";
    process.env.DOCUSIGN_BASE_URI = "https://demo.docusign.net/restapi";
    delete process.env.DOCUSIGN_JWT_TOKEN;
    process.env.DOCUSIGN_ACCESS_TOKEN = "access-token-xyz";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ envelopeId: "env-456", status: "sent" }),
    });
    global.fetch = fetchMock as any;

    const { sendContract } = await import("./docusign-service");
    await sendContract({
      recipientName: "Grace Hopper",
      recipientEmail: "grace@example.com",
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer access-token-xyz");
  });

  it("POSTs to the envelopes endpoint with the expected body shape", async () => {
    process.env.DOCUSIGN_ACCOUNT_ID = "acct-shape";
    process.env.DOCUSIGN_BASE_URI = "https://demo.docusign.net/restapi";
    process.env.DOCUSIGN_JWT_TOKEN = "jwt-shape";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ envelopeId: "env-shape", status: "sent" }),
    });
    global.fetch = fetchMock as any;

    const { sendContract } = await import("./docusign-service");
    await sendContract({
      recipientName: "Ada Lovelace",
      recipientEmail: "ada@example.com",
      subject: "Please sign",
      message: "Quick signature, thanks!",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://demo.docusign.net/restapi/v2.1/accounts/acct-shape/envelopes");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body);
    expect(body.status).toBe("sent");
    expect(body.emailSubject).toBe("Please sign");
    expect(body.emailBlurb).toBe("Quick signature, thanks!");
    expect(body.recipients.signers[0]).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      recipientId: "1",
      routingOrder: "1",
    });
  });

  it("uses templateRoles (not recipients.signers) when templateId is supplied", async () => {
    process.env.DOCUSIGN_ACCOUNT_ID = "acct-tpl";
    process.env.DOCUSIGN_BASE_URI = "https://demo.docusign.net/restapi";
    process.env.DOCUSIGN_JWT_TOKEN = "jwt-tpl";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ envelopeId: "env-tpl", status: "sent" }),
    });
    global.fetch = fetchMock as any;

    const { sendContract } = await import("./docusign-service");
    await sendContract({
      recipientName: "Ada Lovelace",
      recipientEmail: "ada@example.com",
      templateId: "tpl-1",
      prefillFields: { client_name: "Acme Corp" },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.templateId).toBe("tpl-1");
    expect(body.recipients).toBeUndefined();
    expect(body.templateRoles).toHaveLength(1);
    expect(body.templateRoles[0]).toMatchObject({
      roleName: "Client",
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(body.templateRoles[0].tabs.textTabs).toEqual([
      { tabLabel: "client_name", value: "Acme Corp" },
    ]);
  });

  it("returns null without calling fetch when DOCUSIGN_ACCOUNT_ID is unset", async () => {
    delete process.env.DOCUSIGN_ACCOUNT_ID;
    process.env.DOCUSIGN_JWT_TOKEN = "irrelevant";
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;

    const { sendContract } = await import("./docusign-service");
    const result = await sendContract({
      recipientName: "Ada Lovelace",
      recipientEmail: "ada@example.com",
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
