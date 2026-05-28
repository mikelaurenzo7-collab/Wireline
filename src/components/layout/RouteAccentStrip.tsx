import React from "react";
import { useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { getRouteAccent } from "../../constants/navigation";

export default function RouteAccentStrip() {
  const location = useLocation();
  const [from, to] = getRouteAccent(location.pathname);
  return (
    <div className="relative h-px max-md:h-[2px] shrink-0">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0 origin-left"
        style={{
          background: `linear-gradient(90deg, transparent 0%, #000000 18%, #000000 78%, transparent 100%)`,
        }}
        aria-hidden="true"
      />
    </div>
  );
}
