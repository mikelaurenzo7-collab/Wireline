import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const h = vi.hoisted(() => ({
  create: vi.fn(),
  read: vi.fn(),
  end: vi.fn(),
  answer: vi.fn(),
  status: vi.fn(),
  signature: vi.fn(),
}));
vi.mock("../src/lib/voice/phone-test", () => ({
  createPhoneTest: h.create,
  getPhoneTest: h.read,
  endPhoneTest: h.end,
  handlePhoneTestAnswer: h.answer,
  handlePhoneTestStatus: h.status,
  phoneTestHangupTwiml: () => "<Response><Hangup/></Response>",
}));
vi.mock("../src/lib/twilio-webhook-auth", () => ({ evaluateTwilioWebhookAuth: h.signature }));
vi.mock("../src/middleware/auth", () => ({
  authenticateUser: (req: any, res: any, next: any) =>
    req.user ? next() : res.status(401).json({ error: "Authentication required" }),
}));
vi.mock("../src/middleware/api-rate-limits", () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
import router from "../src/routes/phone-test-routes";
const requestKey = "12345678-1234-4234-8234-123456789012";
const path = "/api/agents/:agentId/phone-test";
function invoke(method: string, routePath: string, input: any = {}): Promise<any> {
  const layer = (router as any).stack.find(
    (item: any) => item.route?.path === routePath && item.route.methods[method],
  );
  if (!layer) throw new Error(`Route not found: ${routePath}`);
  const req = {
    method: method.toUpperCase(),
    params: { agentId: "agent-owned", requestKey },
    body: {},
    query: {},
    ...input,
  };
  return new Promise((resolve, reject) => {
    const res: any = {
      statusCode: 200,
      headers: {},
      setHeader: (key: string, value: string) => {
        res.headers[key] = value;
      },
      status: (code: number) => {
        res.statusCode = code;
        return res;
      },
      type: () => res,
      json: (body: unknown) => resolve({ code: res.statusCode, headers: res.headers, body }),
      send: (body: unknown) => resolve({ code: res.statusCode, body }),
      end: () => resolve({ code: res.statusCode }),
    };
    let index = 0;
    const next = (error?: any) => {
      if (error) {
        resolve({ code: error.status, error });
        return;
      }
      const handler = layer.route.stack[index++]?.handle;
      if (!handler) return reject(new Error("Route did not complete"));
      try {
        const pending = handler(req, res, next);
        if (pending?.catch) pending.catch(reject);
      } catch (err) {
        reject(err);
      }
    };
    next();
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  h.create.mockResolvedValue({ id: requestKey });
  h.read.mockResolvedValue({ id: requestKey });
  h.end.mockResolvedValue({ id: requestKey, status: "ending" });
  h.answer.mockResolvedValue("<Response><Gather/></Response>");
  h.signature.mockReturnValue({ ok: true });
  h.status.mockResolvedValue(undefined);
});
describe("phone-test routes", () => {
  it("requires the authenticated owner and explicit scoped consent before creating", async () => {
    expect((await invoke("post", path)).code).toBe(401);
    expect(h.create).not.toHaveBeenCalled();
    expect(
      (
        await invoke("post", path, {
          user: { id: "owner" },
          body: { phone: "3125550123", request_key: requestKey, consent: false },
        })
      ).code,
    ).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
    const result = await invoke("post", path, {
      user: { id: "owner" },
      body: { phone: "3125550123", request_key: requestKey, consent: true },
    });
    expect(result.code).toBe(200);
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(h.create).toHaveBeenCalledWith({
      userId: "owner",
      agentId: "agent-owned",
      phone: "3125550123",
      requestKey,
    });
  });
  it("keeps read and stop owner/Bot-bound and never creates from GET", async () => {
    await invoke("get", `${path}/:requestKey`, { user: { id: "owner" } });
    await invoke("delete", `${path}/:requestKey`, { user: { id: "owner" } });
    expect(h.read).toHaveBeenCalledWith("owner", "agent-owned", requestKey);
    expect(h.end).toHaveBeenCalledWith("owner", "agent-owned", requestKey);
    expect(h.create).not.toHaveBeenCalled();
  });
  it.each(["answer", "gather", "fallback", "status"])(
    "rejects an unsigned %s callback before any service work",
    async (kind) => {
      h.signature.mockReturnValue({ ok: false });
      expect((await invoke("post", `/api/twilio-webhook/phone-test/${kind}`)).code).toBe(401);
      expect(h.answer).not.toHaveBeenCalled();
      expect(h.status).not.toHaveBeenCalled();
    },
  );
  it("passes only signed, exact carrier fields and challenge step into Gather", async () => {
    await invoke("post", "/api/twilio-webhook/phone-test/gather", {
      query: { token: "signed", attempt: "2" },
      body: {
        CallSid: "CAowned",
        To: "+13125550123",
        From: "+13125550124",
        Digits: "123456",
        IgnoreMe: "untrusted",
      },
    });
    expect(h.answer).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "signed",
        callSid: "CAowned",
        to: "+13125550123",
        from: "+13125550124",
        digits: "123456",
        attempt: 2,
      }),
      true,
    );
    expect(h.answer.mock.calls[0][0]).not.toHaveProperty("IgnoreMe");
  });
  it("preserves phone-test authority from generic lead deletion, cadence and reset", () => {
    const read = (file: string) => readFileSync(file, "utf8");
    expect(
      read("src/routes/outbound-routes.ts")
        .split('"/api/outbound/:id"')[1]
        .split("const dialSchema")[0],
    ).toContain("IS DISTINCT FROM 'phone_test'");
    expect(
      read("src/routes/cadence-routes.ts")
        .split('"/api/cadences/:id/enroll"')[1]
        .split('"/api/cadences/runs/:id/pause"')[0],
    ).toContain("IS DISTINCT FROM 'phone_test'");
    expect(read("src/lib/voice/openai-outbound-placement.ts")).toContain(
      'lead.source === "phone_test"',
    );
    expect(read("src/server/register-api-routes.ts")).toContain("app.use(phoneTestRouter)");
  });
});
