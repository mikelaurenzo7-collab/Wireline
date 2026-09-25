import { describe, expect, it } from "vitest";
import {
  existingManagedEmailDomain,
  isBotBoundManagedEmailDomain,
} from "../src/lib/managed-agentmail-domain";

describe("managed email domain transition", () => {
  it.each(["botbound.app", "bots.botbound.app"])("admits new provisioning on %s", (domain) => {
    expect(isBotBoundManagedEmailDomain(domain)).toBe(true);
  });
  it.each(["botbound.me", "bots.botbound.me"])("limits %s to existing identities", (domain) => {
    expect(isBotBoundManagedEmailDomain(domain)).toBe(false);
    expect(existingManagedEmailDomain(`legacy@${domain}`)).toBe(domain);
  });
  it.each([
    "botbound.me.attacker.example",
    "notbotbound.me",
    "bad..botbound.app",
    "botbound.app:443",
  ])("rejects unsafe domain %s", (domain) => {
    expect(existingManagedEmailDomain(`bot@${domain}`)).toBeNull();
  });
  it.each(["a@b@botbound.me", "@botbound.me", "invalid local@botbound.app"])(
    "rejects malformed identity %s",
    (email) => {
      expect(existingManagedEmailDomain(email)).toBeNull();
    },
  );
});
