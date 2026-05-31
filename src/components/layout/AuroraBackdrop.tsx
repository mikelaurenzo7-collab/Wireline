import React from "react";

export default function AuroraBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-paper transition-colors duration-500">
      {/* Light-theme ambient blobs */}
      <div className="absolute inset-0 dark:hidden opacity-45">
        <div
          className="absolute -top-[15%] -left-[10%] w-[55%] h-[55%] rounded-full filter blur-[110px] animate-aurora-blob-1"
          style={{
            background:
              "radial-gradient(circle, rgba(139,63,214,0.18) 0%, rgba(239,233,220,0) 70%)",
          }}
        />
        <div
          className="absolute -bottom-[10%] -right-[5%] w-[50%] h-[50%] rounded-full filter blur-[100px] animate-aurora-blob-2"
          style={{
            background:
              "radial-gradient(circle, rgba(107,43,153,0.14) 0%, rgba(239,233,220,0) 70%)",
          }}
        />
        <div
          className="absolute top-[35%] left-[30%] w-[40%] h-[40%] rounded-full filter blur-[120px] animate-aurora-blob-3"
          style={{
            background:
              "radial-gradient(circle, rgba(232,219,247,0.7) 0%, rgba(239,233,220,0) 75%)",
          }}
        />
      </div>

      {/* Dark-theme ambient blobs */}
      <div className="absolute inset-0 hidden dark:block opacity-25">
        <div
          className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full filter blur-[130px] animate-aurora-blob-1"
          style={{
            background: "radial-gradient(circle, rgba(139,63,214,0.12) 0%, rgba(9,9,11,0) 70%)",
          }}
        />
        <div
          className="absolute -bottom-[10%] -right-[5%] w-[50%] h-[50%] rounded-full filter blur-[110px] animate-aurora-blob-2"
          style={{
            background: "radial-gradient(circle, rgba(59,21,76,0.18) 0%, rgba(9,9,11,0) 70%)",
          }}
        />
      </div>

      {/* Subtle brand grid lines for visual structure and alignment */}
      <div
        className="absolute inset-0 opacity-[0.012] dark:opacity-[0.025]"
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--color-brand) 1px, transparent 1px),
            linear-gradient(to bottom, var(--color-brand) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />
    </div>
  );
}
