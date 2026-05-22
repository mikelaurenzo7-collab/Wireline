import React from "react";
import { motion } from "motion/react";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, transform: "translate3d(0, 6px, 0)" }}
      animate={{ opacity: 1, transform: "translate3d(0, 0, 0)" }}
      exit={{ opacity: 0, transform: "translate3d(0, 4px, 0)" }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="h-full will-change-[transform,opacity]"
    >
      {children}
    </motion.div>
  );
}
