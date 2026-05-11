import React from "react";
import { motion } from "motion/react";

export default function AuroraBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        className="absolute -top-[20%] -left-[10%] w-[85vw] h-[85vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(10,200,212,0.09), transparent 58%)" }}
        animate={{ x: [0, 50, 0], y: [0, -40, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-[20%] -right-[10%] w-[75vw] h-[75vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(224,64,192,0.07), transparent 58%)" }}
        animate={{ x: [0, -40, 0], y: [0, 50, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[40%] left-[40%] w-[60vw] h-[60vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(155,89,245,0.07), transparent 58%)" }}
        animate={{ x: [0, 70, -30, 0], y: [0, -50, 40, 0] }}
        transition={{ duration: 35, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
