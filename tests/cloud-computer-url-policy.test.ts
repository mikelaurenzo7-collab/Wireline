import { describe, expect, it } from "vitest";

import {
  checkUrlAllowed,
  displayUrl,
  isBlockedHostname,
  isNonPublicAddress,
  parseNavigateTarget,
  publicEvidenceUrl,
} from "../src/lib/cloud-computer/url-policy";
import {
  normalizeChord,
  parseKeySequence,
  parseModifiers,
} from "../src/lib/cloud-computer/browser-input";

describe("cloud computer network policy", () => {
  it("keeps only public, non-tokenized task evidence URLs", () => {
    expect(publicEvidenceUrl("https://example.com/help/example-domains")).toEqual({
      url: "https://example.com/help/example-domains",
      exact: true,
    });
    expect(publicEvidenceUrl("https://example.com/help?token=private#section")).toEqual({
      url: "https://example.com/help",
      exact: false,
    });
    expect(publicEvidenceUrl("https://example.com/help%20center")).toEqual({
      url: "https://example.com/help%20center",
      exact: true,
    });
    for (const url of [
      "http://localhost/",
      "https://user:pass@example.com/help",
      "https://example.com/magic/secret",
      "https://example.com/%256dagic/secret",
      "https://example.com/%25256cogin/continue",
      "https://example.com/%252525256cogin/continue",
      "https://example.com/secret/3xKr5D2pYq7vM9nT4bR8aC1f",
    ]) {
      expect(publicEvidenceUrl(url), url).toBeNull();
    }
  });
  it("accepts public web addresses and adds https to bare hosts", () => {
    const target = parseNavigateTarget("example.com/pricing");
    expect(target.kind).toBe("url");
    if (target.kind === "url") expect(target.url.toString()).toBe("https://example.com/pricing");
    expect(parseNavigateTarget("http://example.org").kind).toBe("url");
    expect(parseNavigateTarget("back")).toEqual({ kind: "history", action: "back" });
    expect(parseNavigateTarget("RELOAD")).toEqual({ kind: "history", action: "reload" });
  });

  it("refuses non-web schemes, embedded credentials and unusual ports", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/html,hi",
      "chrome://settings",
      "ftp://example.com",
      "https://user:pass@example.com",
      "https://example.com:22/",
    ]) {
      expect(parseNavigateTarget(url).kind, url).toBe("refused");
    }
  });

  it("blocks private, loopback, link-local, metadata and reserved addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "64:ff9b::a00:1",
      "64:ff9b:1::c0a8:101",
      "2002:c0a8::1",
      "not-an-ip",
    ]) {
      expect(isNonPublicAddress(address), address).toBe(true);
    }
    for (const address of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) {
      expect(isNonPublicAddress(address), address).toBe(false);
    }
  });

  it("blocks internal hostnames before DNS", () => {
    for (const host of [
      "localhost",
      "api.localhost",
      "metadata.google.internal",
      "printer.local",
      "botbound-api",
      "service.internal",
    ]) {
      expect(isBlockedHostname(host), host).toBe(true);
    }
    expect(isBlockedHostname("botbound.app")).toBe(false);
    expect(checkUrlAllowed(new URL("http://169.254.169.254/latest")).allowed).toBe(false);
    expect(checkUrlAllowed(new URL("http://[::1]:8080/")).allowed).toBe(false);
  });

  it("strips credentials, query and fragment before a URL reaches the activity log", () => {
    expect(displayUrl("https://a:b@example.com/path?token=secret#x")).toBe(
      "https://example.com/path",
    );
    expect(displayUrl("not a url")).toBe("");
  });

  it("preserves an entire legal long origin instead of truncating its hostname", () => {
    const hostname = ["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(61)].join(".");
    expect(hostname).toHaveLength(253);
    const origin = `https://${hostname}:8443`;
    const displayed = displayUrl(`${origin}/reports/weekly?token=private#secret`);
    expect(displayed).toBe(`${origin}/`);
    expect(new URL(displayed).origin).toBe(origin);
    expect(displayed.length).toBeLessThanOrEqual(500);
  });

  it("bounds only the path at whole encoded segments without exposing private URL components", () => {
    const path = `/help%20center/\u20ac/reports/${"%E2%82%AC".repeat(30)}/details`;
    const displayed = displayUrl(
      `https://owner%40example.com:password@example.com${path}?token=secret#private`,
    );
    const parsed = new URL(displayed);
    expect(displayed).toBe("https://example.com/help%20center/%E2%82%AC/reports/...");
    expect(displayed.length).toBeLessThanOrEqual(160);
    expect(parsed.username).toBe("");
    expect(parsed.password).toBe("");
    expect(parsed.search).toBe("");
    expect(parsed.hash).toBe("");
    expect(decodeURIComponent(parsed.pathname)).toBe("/help center/\u20ac/reports/...");
  });

  it("keeps display limits bounded and blank-page metadata canonical", () => {
    const raw = `https://example.com/${"report/".repeat(150)}?token=secret#private`;
    for (const limit of [1, 160, 500, 100_000, Number.NaN, Number.POSITIVE_INFINITY]) {
      const displayed = displayUrl(raw, limit);
      expect(displayed.length).toBeLessThanOrEqual(500);
      expect(new URL(displayed).origin).toBe("https://example.com");
      expect(displayed).not.toContain("token");
      expect(displayed).not.toContain("private");
    }
    expect(displayUrl("about:blank")).toBe("about:blank");
    expect(displayUrl("data:text/plain,private")).toBe("");
  });
});

describe("cloud computer key translation", () => {
  it("maps toolset key names to Playwright chords", () => {
    expect(normalizeChord("Return")).toBe("Enter");
    expect(normalizeChord("ctrl+a")).toBe("Control+A");
    expect(normalizeChord("ctrl+shift+t")).toBe("Control+Shift+T");
    expect(normalizeChord("a")).toBe("a");
    expect(normalizeChord("shift")).toBe("Shift");
    expect(parseKeySequence("Backspace Backspace")).toEqual(["Backspace", "Backspace"]);
    expect(parseModifiers("ctrl+shift")).toEqual(["Control", "Shift"]);
  });

  it("rejects unknown keys instead of typing them literally", () => {
    expect(normalizeChord("hyper+a")).toBeNull();
    expect(normalizeChord("NotAKey")).toBeNull();
    expect(parseKeySequence("")).toBeNull();
    expect(parseModifiers("banana")).toBeNull();
  });
});
