import { describe, expect, it, vi } from "vitest";
import {
  checkPhoneTest,
  endPhoneTest,
  normalizePhoneTestNumber,
  requestPhoneTest,
} from "../src/lib/phone-test-client";
import { phoneTestIsTerminal, readPhoneTestReceipt } from "../src/lib/phone-test-contract";

const id = "11111111-1111-4111-8111-111111111111";
const agent = "bot-qa";
const request = Object.freeze({ request_key: id, phone: "+13125550123", consent: true as const });
const receipt = (changes: Record<string, unknown> = {}) => ({
  test: {
    id,
    agent_id: agent,
    status: "ringing",
    expires_at: "2030-01-01T12:02:00Z",
    verification_code: "123456",
    phone_last4: "0123",
    ...changes,
  },
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("owned phone test receipts", () => {
  it("normalizes US-style input without accepting malformed or foreign dial strings", () => {
    expect(normalizePhoneTestNumber("(312) 555-0123")).toBe("+13125550123");
    expect(normalizePhoneTestNumber("+1 312.555.0123")).toBe("+13125550123");
    for (const value of ["", "+44 20 7946 0958", "312-555-0123x12", "1125550123", "3131550123"])
      expect(normalizePhoneTestNumber(value)).toBeNull();
  });
  it("requires the exact operation and Bot and a bounded status/expiry/code", () => {
    expect(readPhoneTestReceipt(receipt(), id, agent)?.status).toBe("ringing");
    expect(readPhoneTestReceipt(receipt(), id, "different-bot")).toBeNull();
    for (const changes of [
      { id: "other" },
      { status: "success" },
      { expires_at: "later" },
      { verification_code: 123456 },
      { verification_code: "1234567" },
      { phone_last4: "all-the-phone" },
      { error: "x".repeat(501) },
    ])
      expect(readPhoneTestReceipt(receipt(changes), id, agent)).toBeNull();
  });
  it("requires the code while ringing and strips it after verification", () => {
    expect(readPhoneTestReceipt(receipt({ verification_code: undefined }), id, agent)).toBeNull();
    expect(
      readPhoneTestReceipt(receipt({ status: "connected" }), id, agent)?.verification_code,
    ).toBeUndefined();
    expect(
      readPhoneTestReceipt(receipt({ status: "completed" }), id, agent)?.verification_code,
    ).toBeUndefined();
  });
  it("keeps uncertain/ending calls active rather than offering another call", () => {
    expect(phoneTestIsTerminal("uncertain")).toBe(false);
    expect(phoneTestIsTerminal("ending")).toBe(false);
    expect(phoneTestIsTerminal("completed")).toBe(true);
    expect(phoneTestIsTerminal("cancelled")).toBe(true);
    expect(phoneTestIsTerminal("failed")).toBe(true);
  });
  it("starts one exact intent with no credentials or extra phone calls", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(receipt()));
    await expect(requestPhoneTest(agent, request, fetcher)).resolves.toMatchObject({
      id,
      status: "ringing",
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(`/api/agents/${agent}/phone-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  });
  it("treats lost responses and malformed success as uncertain", async () => {
    for (const fetcher of [
      vi.fn().mockRejectedValue(new Error("lost")),
      vi.fn().mockResolvedValue(response({ ok: true })),
      vi.fn().mockResolvedValue(response({ error: "gateway" }, 503)),
    ])
      await expect(requestPhoneTest(agent, request, fetcher)).rejects.toMatchObject({
        uncertain: true,
      });
  });
  it("keeps only a definite first-attempt refusal editable", async () => {
    await expect(
      requestPhoneTest(
        agent,
        request,
        vi.fn().mockResolvedValue(response({ error: "Choose a supported number." }, 400)),
      ),
    ).rejects.toMatchObject({ uncertain: false, message: "Choose a supported number." });
    await expect(
      checkPhoneTest(agent, id, vi.fn().mockResolvedValue(response({ error: "not found" }, 404))),
    ).rejects.toMatchObject({ uncertain: true });
  });
  it("checks/ends the same owned operation without resending the dial payload", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(receipt({ status: "connected" })))
      .mockResolvedValueOnce(response(receipt({ status: "ending" })));
    await checkPhoneTest(agent, id, fetcher);
    await endPhoneTest(agent, id, fetcher);
    expect(
      fetcher.mock.calls.map(([path, options]) => [path, options.method, options.body]),
    ).toEqual([
      [`/api/agents/${agent}/phone-test/${id}`, "GET", undefined],
      [`/api/agents/${agent}/phone-test/${id}`, "DELETE", undefined],
    ]);
  });
  it("does not claim an unsuccessful hangup ended the call", async () => {
    await expect(
      endPhoneTest(agent, id, vi.fn().mockResolvedValue(response({ error: "unconfirmed" }, 503))),
    ).rejects.toMatchObject({ uncertain: true });
  });
});
