import { motion } from "motion/react";

/** Shared ambient gradient — keeps public pages feeling like one product. */
export default function MarketingAuroraBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <motion.div
        className="absolute -top-[22%] -left-[12%] w-[min(520px,48vw)] h-[min(520px,48vw)] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,0,0,0.06), transparent 68%)",
          filter: "blur(42px)",
        }}
        animate={{ x: [0, 18, 0], y: [0, -12, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-[18%] -right-[10%] w-[min(440px,42vw)] h-[min(440px,42vw)] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,0,0,0.04), transparent 70%)",
          filter: "blur(48px)",
        }}
        animate={{ x: [0, -14, 0], y: [0, 10, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
