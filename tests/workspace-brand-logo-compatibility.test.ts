import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ logo: "" }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ workspaceLogoUrl: state.logo }] }) }),
    }),
  },
}));
import { resolveWorkspaceBrand } from "../src/lib/shareable-artifact/brand";

describe("workspace logo origin transition", () => {
  it.each(["botbound.app", "www.botbound.app", "botbound.me", "www.botbound.me"])(
    "preserves an existing HTTPS logo from %s",
    async (host) => {
      state.logo = `https://${host}/workspace-logo.png`;
      expect((await resolveWorkspaceBrand("owner", null)).logoUrl).toBe(state.logo);
    },
  );
  it.each([
    "http://botbound.me/logo.png",
    "https://botbound.me.attacker.example/logo.png",
    "https://untrusted.example/logo.png",
  ])("rejects %s", async (url) => {
    state.logo = url;
    expect((await resolveWorkspaceBrand("owner", null)).logoUrl).toBeNull();
  });
});
