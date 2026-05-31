import React from "react";
import { motion } from "motion/react";
import { useAnimationConfig } from "@/src/hooks/useAnimationConfig";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const { reduceMotion, pageTransition } = useAnimationConfig();
  
  if (reduceMotion) {
    return <div className="h-full">{children}</div>;
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, transform: "translate3d(0, 6px, 0)" }}
      animate={{ opacity: 1, transform: "translate3d(0, 0, 0)" }}
      exit={{ opacity: 0, transform: "translate3d(0, 4px, 0)" }}
      transition={{ ...pageTransition, ease: [0.16, 1, 0.3, 1] }}
      className="h-full will-change-[transform,opacity]"
    >
      {children}
    </motion.div>
  );
}
