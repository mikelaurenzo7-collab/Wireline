import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const LIVE_VIDEO_OWNERS = [
  "src/lib/video-presenter/liveavatar-service.ts",
  "src/lib/video-presenter/live-video-session-policy.ts",
  "src/routes/video-presenter-routes-base.ts",
  "src/routes/video-presenter-routes.ts",
  "src/pages/LiveVideoStudioPage.tsx",
  "src/components/LiveVideoPresenter.tsx",
  "src/components/AgentPresenceAvatarPicker.tsx",
] as const;

describe("HeyGen Video Agent is not Live Video", () => {
  it("keeps Video Agent minting out of the live session path", () => {
    for (const path of LIVE_VIDEO_OWNERS) {
      const source = read(path);
      expect(source, path).not.toContain("/v3/video-agents");
      expect(source, path).not.toContain("/v3/videos");
      expect(source, path).not.toContain("avatar-realtime");
    }
    expect(read("src/lib/video-presenter/liveavatar-service.ts")).not.toContain(
      "process.env.HEYGEN_API_KEY",
    );
    expect(read("src/lib/video-presenter/heygen-presence-clips.ts")).not.toContain(
      "process.env.LIVEAVATAR_API_KEY",
    );
    expect(read("src/lib/video-presenter/heygen-voice-service.ts")).not.toContain(
      "/v3/video-agents",
    );
  });

  it("rejects HeyGen look ids as live presenter picks", () => {
    const routes = read("src/routes/video-presenter-routes-base.ts");
    expect(routes).toContain("avatarId: z.string().uuid()");
    expect(routes).toContain("await getPublicAvatar(req.body.avatarId)");
    expect(routes).toContain("await getPublicAvatar(presenter.avatarId)");
  });

  it("does not let clients write consent on PATCH", () => {
    const routes = read("src/routes/video-presenter-routes-base.ts");
    const schema = routes.slice(
      routes.indexOf("const patchPresenterSchema"),
      routes.indexOf("async function ownedAgent"),
    );
    expect(schema).not.toContain("consentStatus");
    expect(schema).not.toContain("videoPresenterConsentStatus");
  });

  it("refuses to mint when settlement cannot refund", () => {
    const routes = read("src/routes/video-presenter-routes-base.ts");
    const mint = routes.slice(routes.indexOf('"/api/agents/:id/video-presenter/session"'));
    expect(mint.indexOf("isLiveVideoSettlementStoreReady()")).toBeGreaterThan(-1);
    expect(mint.indexOf("isLiveVideoSettlementStoreReady()")).toBeLessThan(
      mint.indexOf("await getPublicAvatar(presenter.avatarId)"),
    );
    expect(read("src/lib/video-presenter/live-video-settlement.ts")).toContain(
      "export function isLiveVideoSettlementStoreReady()",
    );
  });

  it("keeps presence-clip minting hard-closed", () => {
    const clips = read("src/lib/video-presenter/heygen-presence-clips.ts");
    expect(clips).toContain("export function presenceClipMintOffered(): boolean");
    expect(clips).toContain("return false;");
    expect(clips).not.toContain("fetchWithTimeout");
    expect(clips).not.toContain("api.heygen.com");
    expect(read("docs/PRESENTER_VENDOR_STRATEGY.md")).toContain("HeyGen Video Agent is this tier");
    expect(read(".env.example")).toContain("WIRELINE_PRESENCE_CLIPS_ENABLED=false");
  });
});
