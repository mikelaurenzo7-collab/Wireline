import { describe, expect, it } from "vitest";

import {
  isPrivateIp,
  isPrivateIpv6,
  resolveWebhookDeliveryHostname,
  validateWebhookUrl,
} from "../src/lib/webhook-validators";

describe("webhook delivery literal SSRF boundary", () => {
  it.each([
    "http://127.0.0.1/hook",
    "http://0.1.2.3/hook",
    "http://10.0.0.1/hook",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.1/hook",
    "http://224.0.0.1/hook",
    "http://255.255.255.255/hook",
    "http://[::1]/hook",
    "http://[fc00::1]/hook",
    "http://[fe80::1]/hook",
    "http://[ff02::1]/hook",
    "http://[::ffff:127.0.0.1]/hook",
    "http://[64:ff9b::7f00:1]/hook",
    "http://[2001::1]/hook",
  ])("rejects non-public literal destination %s", async (url) => {
    await expect(resolveWebhookDeliveryHostname(url)).resolves.toEqual({ status: "private" });
  });

  it.each(["https://8.8.8.8/hook", "https://[2606:4700:4700::1111]/hook"])(
    "allows a globally routable literal destination %s",
    async (url) => {
      await expect(resolveWebhookDeliveryHostname(url)).resolves.toEqual({ status: "public" });
    },
  );

  it("fails closed for unsupported schemes and embedded credentials", async () => {
    await expect(resolveWebhookDeliveryHostname("file:///etc/passwd")).resolves.toEqual({
      status: "dns_error",
    });
    await expect(
      resolveWebhookDeliveryHostname("https://operator:secret@example.com/hook"),
    ).resolves.toEqual({ status: "dns_error" });
    await expect(
      validateWebhookUrl("https://operator:secret@example.com/hook"),
    ).resolves.toBe("Webhook URL must not include embedded credentials.");
  });

  it("classifies expanded non-public address ranges", () => {
    expect(isPrivateIp("0.1.2.3")).toBe(true);
    expect(isPrivateIp("224.0.0.1")).toBe(true);
    expect(isPrivateIp("255.255.255.255")).toBe(true);
    expect(isPrivateIpv6("ff02::1")).toBe(true);
    expect(isPrivateIpv6("2001:db8::1")).toBe(true);
    expect(isPrivateIpv6("2001::1")).toBe(true);
    expect(isPrivateIpv6("64:ff9b::7f00:1")).toBe(true);
    expect(isPrivateIpv6("2606:4700:4700::1111")).toBe(false);
  });
});
