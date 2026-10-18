import { describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/api", () => ({ authFetch: vi.fn() }));
import { authFetch } from "../src/lib/api";
import {
  checkedVoicePermissionLink,
  isVoicePermissionSummary,
  listVoicePermissions,
} from "../src/lib/voice-permission-client";

const row = {
  id: "9aa36be7-1bf0-4f22-b6e2-f3606b486d37",
  agent_id: "bot-front-desk",
  bot_name: "Front Desk",
  recipient_phone_masked: "•••0123",
  purpose: "callback",
  status: "pending",
  request_expires_at: "2026-10-20T00:00:00Z",
  expires_at: "2026-10-20T00:00:00Z",
  created_at: "2026-10-17T00:00:00Z",
  identity_assurance: "bearer_link_and_typed_signature",
};

describe("recipient permission client boundary", () => {
  it("requires a complete summary without calling it verified possession", () => {
    expect(isVoicePermissionSummary(row)).toBe(true);
    for (const patch of [
      { status: "verified" },
      { purpose: "arbitrary" },
      { id: "" },
      { expires_at: "not-a-date" },
      { identity_assurance: "verified_phone" },
    ]) {
      expect(isVoicePermissionSummary({ ...row, ...patch })).toBe(false);
    }
  });
  it("accepts only same-origin fragment capability links", () => {
    const value = `https://botbound.app/voice-permission#token=${"a".repeat(64)}`;
    expect(checkedVoicePermissionLink(value, "https://botbound.app")).toBe(value);
    for (const bad of [
      value.replace("botbound.app", "elsewhere.test"),
      value.replace("#token=", "?token="),
      value + "&other=1",
      value.replace("/voice-permission", "/studio"),
      "javascript:alert(1)",
      undefined,
    ]) {
      expect(() => checkedVoicePermissionLink(bad, "https://botbound.app")).toThrow();
    }
  });
  it("checks HTTP status as well as response shape", async () => {
    vi.mocked(authFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ permissions: [row] }), { status: 200 }),
    );
    expect(await listVoicePermissions()).toEqual([row]);
    vi.mocked(authFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ permissions: [row] }), { status: 403 }),
    );
    await expect(listVoicePermissions()).rejects.toThrow("Could not load");
    vi.mocked(authFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ permissions: [{ ...row, status: "verified" }] }), {
        status: 200,
      }),
    );
    await expect(listVoicePermissions()).rejects.toThrow("Could not confirm");
  });
});
