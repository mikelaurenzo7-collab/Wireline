import React from "react";

export default function AuroraBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-paper transition-colors duration-500">
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background:
            "linear-gradient(115deg, rgba(139,63,214,0.075) 0%, rgba(139,63,214,0) 31%, rgba(37,84,74,0.06) 52%, rgba(37,84,74,0) 74%), linear-gradient(180deg, #F3EEE5 0%, #E8DECF 100%)",
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background:
            "linear-gradient(120deg, rgba(139,63,214,0.12) 0%, rgba(139,63,214,0) 35%, rgba(37,84,74,0.08) 58%, rgba(37,84,74,0) 84%), linear-gradient(180deg, #09090b 0%, #120f16 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.14] dark:opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(26,22,20,0.08) 1px, transparent 1px), linear-gradient(180deg, rgba(26,22,20,0.06) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.72), rgba(0,0,0,0.12))",
        }}
      />

      {/* Subtle brand grid lines for visual structure and alignment */}
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--color-brand) 1px, transparent 1px),
            linear-gradient(to bottom, var(--color-brand) 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
          maskImage: "linear-gradient(to right, transparent, black 18%, black 82%, transparent)",
        }}
      />
    </div>
  );
}
