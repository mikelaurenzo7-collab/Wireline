import React from "react";
import { useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { getRouteAccentFromLocation } from "../../constants/navigation";

/**
 * Route-aware hairline at the top of the main content column. The base
 * gradient establishes the route's color identity (purple → emerald for
 * /live, purple → amber for /outbound, etc.); a second narrower band
 * sweeps across once on mount as a subtle wayfinding cue — same visual
 * vocabulary as the landing-page hero accent so authenticated routes
 * feel like a continuation, not a different product.
 */
export default function RouteAccentStrip() {
  const location = useLocation();
  const accentKey = `${location.pathname}${location.search}`;
  const [from, to] = getRouteAccentFromLocation(location.pathname, location.search);
  return (
    <div className="relative h-px max-md:h-[2px] shrink-0 overflow-hidden">
      <motion.div
        key={`base-${accentKey}`}
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0 origin-left"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${from} 18%, ${to} 78%, transparent 100%)`,
        }}
        aria-hidden="true"
      />
      <motion.div
        key={`sheen-${accentKey}`}
        initial={{ x: "-40%", opacity: 0 }}
        animate={{ x: "120%", opacity: [0, 0.7, 0] }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        className="absolute inset-y-0 w-[40%] pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)",
          mixBlendMode: "overlay",
        }}
        aria-hidden="true"
      />
    </div>
  );
}
