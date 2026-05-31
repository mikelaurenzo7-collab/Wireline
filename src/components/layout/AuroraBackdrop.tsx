import React from "react";

export default function AuroraBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-paper transition-colors duration-700">
      {/* Ambient gradient base */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background:
            "linear-gradient(115deg, rgba(124,58,237,0.075) 0%, rgba(124,58,237,0) 31%, rgba(37,84,74,0.06) 52%, rgba(37,84,74,0) 74%), linear-gradient(180deg, #F3EEE5 0%, #E8DECF 100%)",
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background:
            "linear-gradient(120deg, rgba(124,58,237,0.10) 0%, rgba(124,58,237,0) 35%, rgba(124,58,237,0.06) 58%, rgba(124,58,237,0) 84%), linear-gradient(180deg, #18141E 0%, #0C0A0F 100%)",
        }}
      />
      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 opacity-[0.14] dark:opacity-[0.10]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(28,25,23,0.08) 1px, transparent 1px), linear-gradient(180deg, rgba(28,25,23,0.06) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.08))",
        }}
      />
      {/* Brand grid accent */}
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--color-brand) 1px, transparent 1px), linear-gradient(to bottom, var(--color-brand) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage: "linear-gradient(to right, transparent, black 18%, black 82%, transparent)",
        }}
      />
      {/* Enhanced aurora orbs — fade in on mount */}
      <div
        className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] rounded-full dark:opacity-30 opacity-20 animate-aurora-blob-1"
        style={{
          background:
            "radial-gradient(circle at center, rgba(124,58,237,0.25) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full dark:opacity-25 opacity-15 animate-aurora-blob-2"
        style={{
          background:
            "radial-gradient(circle at center, rgba(124,58,237,0.20) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute top-[40%] right-[20%] w-[30%] h-[30%] rounded-full dark:opacity-20 opacity-10 animate-aurora-blob-3"
        style={{
          background:
            "radial-gradient(circle at center, rgba(167,139,250,0.15) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
