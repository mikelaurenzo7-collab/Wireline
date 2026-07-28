import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWithTimeout } from "../src/lib/server-context";

const VAPI_CREATE_URL = "https://api.vapi.ai/call/phone";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Vapi call creation boundary", () => {
  it("transmits one concrete create request once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const request: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumberId: "phone-1", customer: { number: "+14155550100" } }),
    };

    await expect(fetchWithTimeout(VAPI_CREATE_URL, request, 1_000)).resolves.toBeInstanceOf(
      Response,
    );
    await expect(fetchWithTimeout(VAPI_CREATE_URL, request, 1_000)).rejects.toThrow(
      "Duplicate-safe boundary blocked an ambiguous retry",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows a separately constructed validation fallback request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const primary: RequestInit = {
      method: "POST",
      body: JSON.stringify({ assistant: { model: { provider: "google" } } }),
    };
    const fallback: RequestInit = {
      method: "POST",
      body: JSON.stringify({ assistant: { model: { provider: "openai" } } }),
    };

    await fetchWithTimeout(VAPI_CREATE_URL, primary, 1_000);
    await fetchWithTimeout(VAPI_CREATE_URL, fallback, 1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not alter retry semantics for idempotent reads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const request: RequestInit = { method: "GET" };

    await fetchWithTimeout("https://api.vapi.ai/call/call-1", request, 1_000);
    await fetchWithTimeout("https://api.vapi.ai/call/call-1", request, 1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
