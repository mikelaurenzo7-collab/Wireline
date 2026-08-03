import { describe, expect, it, vi } from "vitest";

import { resolvePinnedWebhookDestination } from "../src/lib/safe-webhook-delivery";

describe("DNS-pinned webhook delivery", () => {
  it("returns the exact public address that the socket must use", async () => {
    const lookup = vi.fn().mockResolvedValue([
      { address: "93.184.216.34", family: 4 as const },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 as const },
    ]);

    const result = await resolvePinnedWebhookDestination("https://example.com/hook", lookup);

    expect(result).toMatchObject({
      status: "public",
      address: "93.184.216.34",
      family: 4,
    });
    expect(lookup).toHaveBeenCalledOnce();
    expect(lookup).toHaveBeenCalledWith("example.com");
  });

  it("rejects a mixed public/private DNS answer set", async () => {
    const result = await resolvePinnedWebhookDestination("https://rebind.example/hook", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);

    expect(result).toEqual({ status: "blocked", reason: "private_destination" });
  });

  it("fails closed when DNS returns no usable answer", async () => {
    await expect(
      resolvePinnedWebhookDestination("https://empty.example/hook", async () => []),
    ).resolves.toEqual({ status: "blocked", reason: "dns_resolution_failed" });
  });

  it("classifies literal destinations without performing DNS", async () => {
    const lookup = vi.fn();

    await expect(
      resolvePinnedWebhookDestination("http://169.254.169.254/latest/meta-data", lookup),
    ).resolves.toEqual({ status: "blocked", reason: "private_destination" });
    expect(lookup).not.toHaveBeenCalled();
  });
});
