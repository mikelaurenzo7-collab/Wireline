import { describe, expect, it } from "vitest";

import { ownerCookiesFrom, ownerInputFrom } from "../src/lib/cloud-computer/owner-input";

describe("owner browser input requests", () => {
  it("parses every control sent by the takeover pane", () => {
    expect(ownerInputFrom({ kind: "click", x: 20, y: 30 })).toEqual({
      kind: "click",
      x: 20,
      y: 30,
    });
    expect(ownerInputFrom({ kind: "drag", from: { x: 20, y: 30 }, to: { x: 40, y: 50 } })).toEqual({
      kind: "drag",
      from: { x: 20, y: 30 },
      to: { x: 40, y: 50 },
    });
    expect(ownerInputFrom({ kind: "scroll", x: 20, y: 30, deltaX: 0, deltaY: 500 })).toEqual({
      kind: "scroll",
      x: 20,
      y: 30,
      deltaX: 0,
      deltaY: 500,
    });
    expect(ownerInputFrom({ kind: "navigate", url: "https://example.com/login" })).toEqual({
      kind: "navigate",
      url: "https://example.com/login",
    });
    expect(ownerInputFrom({ kind: "history", action: "back" })).toEqual({
      kind: "history",
      action: "back",
    });
    expect(ownerInputFrom({ kind: "switch_tab", tabId: "tab-2" })).toEqual({
      kind: "switch_tab",
      tabId: "tab-2",
    });
    expect(ownerInputFrom({ kind: "type", text: "owner value" })).toEqual({
      kind: "type",
      text: "owner value",
    });
    expect(ownerInputFrom({ kind: "key", key: "Enter" })).toEqual({ kind: "key", key: "Enter" });
  });

  it("bounds owner input and rejects invalid history actions", () => {
    expect(() => ownerInputFrom({ kind: "navigate", url: "x".repeat(2_049) })).toThrow();
    expect(() => ownerInputFrom({ kind: "history", action: "delete" })).toThrow();
    expect(() => ownerInputFrom({ kind: "switch_tab", tabId: "tab-2/secret" })).toThrow();
    expect(() => ownerInputFrom({ kind: "click", x: 1_281, y: 20 })).toThrow();
    expect(() =>
      ownerInputFrom({ kind: "scroll", x: 20, y: 30, deltaX: 0, deltaY: 1_201 }),
    ).toThrow();
    expect(() => ownerInputFrom({ kind: "type", text: "x".repeat(1_001) })).toThrow();
  });

  it("parses tabs and explicit session tools without retaining extra fields", () => {
    expect(ownerInputFrom({ kind: "new_tab" })).toEqual({ kind: "new_tab" });
    expect(ownerInputFrom({ kind: "close_tab", tabId: "tab-2" })).toEqual({
      kind: "close_tab",
      tabId: "tab-2",
    });
    expect(
      ownerInputFrom({
        kind: "save_login",
        username: "owner",
        password: "private",
        origin: "https://example.com/",
      }),
    ).toEqual({
      kind: "save_login",
      origin: "https://example.com",
      username: "owner",
      password: "private",
    });
    expect(ownerInputFrom({ kind: "clear_cookies", secret: "discard" })).toEqual({
      kind: "clear_cookies",
    });
    for (const kind of ["fill_login", "clear_saved_login"]) {
      expect(ownerInputFrom({ kind, origin: "https://example.com", secret: "discard" })).toEqual({
        kind,
        origin: "https://example.com",
      });
      expect(() => ownerInputFrom({ kind })).toThrow();
      expect(() => ownerInputFrom({ kind, origin: "http://example.com" })).toThrow();
      expect(() => ownerInputFrom({ kind, origin: "https://example.com/login" })).toThrow();
    }
    expect(() => ownerInputFrom({ kind: "close_tab", tabId: "tab-1/../../" })).toThrow();
    expect(() => ownerInputFrom({ kind: "save_login", username: "a", password: "" })).toThrow();
  });

  it("canonicalizes bounded HTTPS cookies and refuses unsafe scopes", () => {
    expect(
      ownerCookiesFrom([
        {
          name: "session",
          value: "synthetic",
          url: "https://example.com/login?token=private",
          httpOnly: true,
        },
      ]),
    ).toEqual([
      {
        name: "session",
        value: "synthetic",
        url: "https://example.com/login",
        secure: true,
        httpOnly: true,
      },
    ]);
    expect(
      ownerCookiesFrom([
        {
          name: "preference",
          value: "dark",
          domain: ".example.com",
          path: "/",
          expires: -1,
          sameSite: "Lax",
        },
      ]),
    ).toEqual([
      {
        name: "preference",
        value: "dark",
        domain: ".example.com",
        path: "/",
        secure: true,
        sameSite: "Lax",
      },
    ]);
    for (const cookies of [
      [],
      Array.from({ length: 51 }, () => ({ name: "a", value: "b", url: "https://example.com" })),
      [{ name: "session", value: "x", url: "http://example.com" }],
      [{ name: "session", value: "x", url: "https://127.0.0.1" }],
      [{ name: "session", value: "x", domain: "localhost", path: "/" }],
      [{ name: "session", value: "x", url: "https://example.com", secure: false }],
      [{ name: "bad;name", value: "x", url: "https://example.com" }],
      [{ name: "session", value: "secret\nheader", url: "https://example.com" }],
      [{ name: "session", value: "x", url: "https://example.com", expires: 1 }],
      [{ name: "session", value: "x".repeat(4_097), url: "https://example.com" }],
    ])
      expect(() => ownerCookiesFrom(cookies)).toThrow();
  });

  it.each([42, null, ["Lax"], { toString: null }])(
    "returns a recoverable validation error for non-string sameSite %j",
    (sameSite) => {
      try {
        ownerCookiesFrom([{ name: "session", value: "x", url: "https://example.com", sameSite }]);
        expect.fail("A malformed sameSite value must be rejected.");
      } catch (error) {
        expect(error).toMatchObject({ status: 400, code: "BAD_REQUEST" });
      }
    },
  );
});
