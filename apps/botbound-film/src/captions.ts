import type { Caption } from "@remotion/captions";
import captions15 from "../public/captions/botbound-second-ring-15s.json";
import captions10 from "../public/captions/botbound-second-ring-10s.json";
import captions30 from "../public/captions/botbound-second-ring-30s.json";
import captions6 from "../public/captions/botbound-second-ring-6s.json";

export const captionAssets = {
  master30: captions30 satisfies Caption[],
  cut15: captions15 satisfies Caption[],
  square10: captions10 satisfies Caption[],
  bumper6: captions6 satisfies Caption[],
};

export type CaptionAssetKey = keyof typeof captionAssets;
