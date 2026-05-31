import React from "react";
import { motion } from "motion/react";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, transform: "translate3d(0, 12px, 0)", filter: "blur(4px)" }}
      animate={{ opacity: 1, transform: "translate3d(0, 0, 0)", filter: "blur(0px)" }}
      exit={{ opacity: 0, transform: "translate3d(0, 8px, 0)", filter: "blur(2px)" }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="h-full will-change-[transform,opacity,filter]"
    >
      {children}
    </motion.div>
  );
}
