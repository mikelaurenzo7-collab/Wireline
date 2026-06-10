/**
 * HeroWirelines — the animated switchboard behind the landing hero.
 *
 * Wireline, literally: four wires draw themselves in from the gutter robots
 * to a central exchange beacon, then call signals (comet dashes) stream
 * left → exchange → right forever. Pure SVG + CSS keyframes in index.css —
 * zero style props (CSP ratchet), pointer-events-none, reduced-motion safe
 * (wires render fully drawn and static).
 *
 * The full-bleed SVG (`preserveAspectRatio="none"`) carries only wire paths
 * with non-scaling strokes; terminal nodes and the exchange hub are
 * fixed-size overlays positioned at the same fractional coordinates via
 * `applyEdgeInset`, so circles stay circular at any hero aspect ratio.
 * A radial CSS mask on the layer dims wires directly behind the headline.
 */
import { applyEdgeInset } from "../../lib/apply-dom-layout";
import { WIRELINE_AMBIENT, WIRELINE_HUB, WIRELINE_VIEWBOX, WIRELINE_WIRES } from "./hero-wirelines";

const VIEW_W = 1440;
const VIEW_H = 720;

const pctLeft = (x: number) => `${((x / VIEW_W) * 100).toFixed(3)}%`;
const pctTop = (y: number) => `${((y / VIEW_H) * 100).toFixed(3)}%`;

export default function HeroWirelines() {
  return (
    <div
      className="wl-wireline-layer pointer-events-none absolute inset-0 z-0 hidden lg:block"
      aria-hidden="true"
      data-testid="hero-wirelines"
    >
      <svg
        className="h-full w-full"
        viewBox={WIRELINE_VIEWBOX}
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Ambient pole-to-pole lines, far background */}
        {WIRELINE_AMBIENT.map((d, i) => (
          <path
            key={`ambient-${i}`}
            d={d}
            className="wl-wire-ambient"
            data-index={i}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Routed wirelines: base wire (draw-in) + traveling signal comet */}
        {WIRELINE_WIRES.map((wire, i) => (
          <g key={`wire-${i}`}>
            <path
              d={wire.d}
              pathLength={1}
              className="wl-wire"
              data-index={i}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={wire.d}
              pathLength={1}
              className="wl-wire-signal"
              data-index={i}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={wire.d}
              pathLength={1}
              className="wl-wire-pulse"
              data-index={i}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </svg>

      {/* Terminal nodes under each robot — fixed-size, aspect-true */}
      {WIRELINE_WIRES.map((wire, i) => (
        <span
          key={`node-${i}`}
          className="wl-wire-node"
          data-index={i}
          data-circular
          ref={(el) =>
            applyEdgeInset(el, { left: pctLeft(wire.anchor.x), top: pctTop(wire.anchor.y) })
          }
        />
      ))}

      {/* Central exchange beacon — echoes the robots' antenna */}
      <div
        className="wl-exchange"
        ref={(el) =>
          applyEdgeInset(el, { left: pctLeft(WIRELINE_HUB.x), top: pctTop(WIRELINE_HUB.y) })
        }
      >
        <svg
          width={64}
          height={64}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="overflow-visible"
        >
          <circle cx="32" cy="38" r="32" className="wl-exchange-ring wl-exchange-ring--pulsar" />
          <circle cx="32" cy="38" r="22" className="wl-exchange-ring wl-exchange-ring--outer" />
          <circle cx="32" cy="38" r="12" className="wl-exchange-ring" />
          <line x1="32" y1="32" x2="32" y2="20" className="wl-exchange-mast" />
          <circle cx="32" cy="17" r="3.5" className="wl-exchange-beacon" />
          <circle cx="32" cy="38" r="5" className="wl-exchange-core" />
        </svg>
      </div>
    </div>
  );
}
