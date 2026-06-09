import React from "react";
import { motion, useReducedMotion } from "motion/react";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  // flex flex-col so route content that fills via `flex-1` (ClientRouteViewport,
  // DirectorWorkspace, etc.) resolves to the full stage height instead of
  // collapsing to content height — otherwise short pages leave dead space.
  if (reduceMotion) {
    return <div className="flex flex-col h-full min-h-0 motion-route-enter">{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.997, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -4, scale: 0.998, filter: "blur(2px)" }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col h-full min-h-0 motion-route-enter"
    >
      {children}
    </motion.div>
  );
}
