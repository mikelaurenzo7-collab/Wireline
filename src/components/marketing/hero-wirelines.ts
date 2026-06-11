/**
 * hero-wirelines — geometry for the landing hero "switchboard" layer.
 *
 * Literalizes the brand name: four wirelines run from the hero gutter robots
 * into a central exchange hub behind the headline, and call signals travel
 * along them left → exchange → right. Coordinates live in a normalized
 * 1440×720 viewBox stretched to the hero (`preserveAspectRatio="none"`), so
 * each value is a fraction of the hero box. Anchors mirror
 * HERO_STICKER_SLOTS in HeroDecorations.tsx (left 14%/28%, right 15%/30%,
 * 31rem corridor): if those slots move, retune the anchors here.
 *
 * Path direction is meaningful: left wires point INTO the hub and right
 * wires point OUT of it, so a decreasing stroke-dashoffset animates one
 * continuous left-to-right routing flow through the exchange.
 */

export const WIRELINE_VIEWBOX = "0 0 1440 720";

/** Central exchange hub — sits behind the hero headline, dimmed by the layer mask. */
export const WIRELINE_HUB = { x: 720, y: 264 } as const;

export type WirelineWire = {
  /** SVG path, normalized with pathLength=1 in the component. */
  d: string;
  /** Robot-end anchor — gets a blinking terminal node. */
  anchor: { x: number; y: number };
  /** Which hero gutter this wire serves. */
  side: "left" | "right";
};

/** Robot-end anchors, tuned to the four HERO_STICKER_SLOTS positions. */
const ANCHORS = {
  leftTop: { x: 186, y: 108 },
  leftLow: { x: 172, y: 206 },
  rightTop: { x: 1254, y: 114 },
  rightLow: { x: 1268, y: 220 },
} as const;

export const WIRELINE_WIRES: WirelineWire[] = [
  {
    // left-top robot → hub
    d: `M ${ANCHORS.leftTop.x} ${ANCHORS.leftTop.y} C 392 132, 564 202, ${WIRELINE_HUB.x} ${WIRELINE_HUB.y}`,
    anchor: ANCHORS.leftTop,
    side: "left",
  },
  {
    // left-low robot → hub
    d: `M ${ANCHORS.leftLow.x} ${ANCHORS.leftLow.y} C 384 214, 566 242, ${WIRELINE_HUB.x} ${WIRELINE_HUB.y}`,
    anchor: ANCHORS.leftLow,
    side: "left",
  },
  {
    // hub → right-top robot
    d: `M ${WIRELINE_HUB.x} ${WIRELINE_HUB.y} C 876 202, 1064 138, ${ANCHORS.rightTop.x} ${ANCHORS.rightTop.y}`,
    anchor: ANCHORS.rightTop,
    side: "right",
  },
  {
    // hub → right-low robot
    d: `M ${WIRELINE_HUB.x} ${WIRELINE_HUB.y} C 880 258, 1072 238, ${ANCHORS.rightLow.x} ${ANCHORS.rightLow.y}`,
    anchor: ANCHORS.rightLow,
    side: "right",
  },
];

/**
 * Ambient pole-to-pole telephone wires — full-bleed sagging catenaries far
 * behind the routed wires, for depth. Static besides a slow drift.
 */
export const WIRELINE_AMBIENT: string[] = [
  "M -24 58 C 480 152, 960 150, 1464 66",
  "M -24 304 C 480 384, 960 364, 1464 292",
  "M -24 182 C 480 260, 960 250, 1464 174",
];
