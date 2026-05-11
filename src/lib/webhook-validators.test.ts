import { describe, it, expect } from "vitest";
import { isSsrfUrl, isPrivateIp } from "./webhook-validators";

describe("webhook-validators · isSsrfUrl", () => {
  it("flags localhost-like targets", () => {
    expect(isSsrfUrl("http://localhost/hook")).toBe(true);
    expect(isSsrfUrl("https://127.0.0.1/x")).toBe(true);
    expect(isSsrfUrl("http://169.254.169.254/latest/meta-data")).toBe(true);
  });

  it("allows legitimate public HTTPS hosts without IP literals", () => {
    expect(isSsrfUrl("https://hooks.slack.com/services/abc/def/ghi")).toBe(false);
    expect(isSsrfUrl("https://10.example.com/webhook")).toBe(false);
  });
});

describe("webhook-validators · isPrivateIp", () => {
  it("treats RFC1918 literals as private", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("203.0.113.55")).toBe(true); // RFC5737 TEST-NET-3
  });
});
