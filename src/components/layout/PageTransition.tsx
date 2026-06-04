import React from "react";
import { motion, useReducedMotion } from "motion/react";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className="h-full motion-route-enter">{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="h-full min-h-0 motion-route-enter"
    >
      {children}
    </motion.div>
  );
}
