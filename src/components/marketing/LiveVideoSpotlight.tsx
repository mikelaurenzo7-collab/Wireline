import LiveVideoStage from "./LiveVideoStage";

type LiveVideoSpotlightProps = {
  eyebrow: string;
};

/**
 * Retired compatibility stub.
 *
 * The import is retained while historical design contracts still identify the
 * paired stage module. Neither component renders, advertises, prices, or links
 * to Live Video.
 */
export default function LiveVideoSpotlight({ eyebrow }: LiveVideoSpotlightProps) {
  void eyebrow;
  void LiveVideoStage;
  return null;
}
