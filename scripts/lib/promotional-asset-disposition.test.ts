import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain .mjs helper shared by release scripts.
import * as classification from "./promotional-asset-disposition.mjs";

const { promotionalAssetClassificationPolicy, promotionalAssetDisposition } = classification;

describe("promotional inventory classification", () => {
  it.each(["inbound", "outbound"])(
    "does not approve %s files by campaign directory",
    (campaign) => {
      const root = `brand-work/launch-2026-09${campaign === "outbound" ? "-outbound" : ""}`;
      expect(promotionalAssetDisposition(`${root}/exports/social/launch.png`, true)).toBe(
        `${campaign}-creative-candidate`,
      );
      expect(promotionalAssetDisposition(`${root}/README.md`, true)).toBe(
        `${campaign}-copy-or-control-source`,
      );
      expect(promotionalAssetDisposition(`${root}/manifest.json`)).toBe(
        `${campaign}-copy-or-control-source`,
      );
      expect(promotionalAssetDisposition(`${root}/sources/launch.svg`, true)).toBe(
        `${campaign}-creative-source`,
      );
    },
  );

  it("keeps rejected, mismatched, and internal evidence out of candidate categories", () => {
    const root = "brand-work/launch-2026-09-outbound";
    expect(promotionalAssetDisposition(`${root}/exports/social/launch.png`, false)).toBe(
      "quarantine-extension-mismatch",
    );
    expect(promotionalAssetDisposition(`${root}/exports/_rejected/launch.png`, true)).toBe(
      "quarantine-rejected-review",
    );
    expect(promotionalAssetDisposition(`${root}/exports/qa/launch.png`, true)).toBe(
      "internal-qa-only",
    );
    expect(promotionalAssetDisposition(`${root}/exports/product-proof/home.png`, true)).toBe(
      "internal-worktree-proof-not-release",
    );
    expect(promotionalAssetDisposition(`${root}/exports/contact-sheet/launch.png`, true)).toBe(
      "internal-qa-only",
    );
  });

  it("separates archived renders, source media, and local motion reviews", () => {
    expect(
      promotionalAssetDisposition("brand-work/logo-motion-2026-09/archive/first-cut/launch.mp4"),
    ).toBe("historical-creative-review");
    expect(promotionalAssetDisposition("brand-work/logo-motion-2026-09/launch.mp4")).toBe(
      "motion-creative-candidate",
    );
    expect(promotionalAssetDisposition("apps/botbound-film/public/campaign-call/voice.mp3")).toBe(
      "motion-source-media",
    );
    expect(promotionalAssetDisposition("apps/botbound-film/out/launch.mp4")).toBe(
      "motion-render-review",
    );
    expect(promotionalAssetDisposition("apps/botbound-film/src/Root.tsx")).toBe("motion-source");
  });

  it.each(["srt", "vtt"])("includes %s sidecars for review across Windows paths", (extension) => {
    expect(
      promotionalAssetDisposition(`apps\\botbound-film\\public\\captions\\launch.${extension}`),
    ).toBe("caption-sidecar-review");
    expect(
      promotionalAssetDisposition(`brand-work/launch-2026-09/exports/motion/launch.${extension}`),
    ).toBe("caption-sidecar-review");
  });

  it("does not infer deployment or current approval from repository paths", () => {
    expect(promotionalAssetDisposition("public/brand/logo.png", true)).toBe(
      "product-package-asset-review",
    );
    expect(promotionalAssetDisposition("brand-work/gtm/BOTBOUND-LAUNCH-COPY-KIT.md")).toBe(
      "gtm-copy-or-control-source",
    );
    expect(promotionalAssetDisposition("docs/LAUNCH_READINESS.md")).toBe("launch-reference-review");
    expect(promotionalAssetClassificationPolicy.release_approval).toBe("not-assessed");
    expect(promotionalAssetClassificationPolicy.source_currency).toBe("not-assessed");
  });
});
