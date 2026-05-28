import React from "react";

export default function RouteFallback() {
  return (
    <div className="h-full w-full flex flex-col" aria-live="polite" aria-busy="true">
      <div className="shrink-0 h-px relative overflow-hidden mb-5" aria-hidden="true">
        <div
          className="absolute inset-y-0 -left-1/3 w-1/3 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(0, 0, 0 ,0.95) 40%, rgba(0, 0, 0 ,0.85) 60%, transparent)",
            animation: "route-progress-sweep 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite",
          }}
        />
      </div>

      <div
        className="shrink-0 mb-2.5 h-2 w-32 rounded-full bg-black/8 overflow-hidden relative"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 skeleton-shimmer"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
          }}
        />
      </div>

      <div
        className="shrink-0 h-12 md:h-14 w-2/3 max-w-md rounded-xl bg-black/6 overflow-hidden relative mb-3"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 skeleton-shimmer"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
          }}
        />
      </div>

      <div
        className="shrink-0 h-3 w-1/2 max-w-sm rounded-full bg-black/5 mb-4"
        aria-hidden="true"
      />

      <div
        className="shrink-0 h-px mb-6"
        style={{
          background:
            "linear-gradient(90deg, rgba(0, 0, 0 ,0.20) 0%, rgba(0, 0, 0 ,0.15) 40%, rgba(0, 0, 0 ,0.10) 70%, transparent 100%)",
        }}
        aria-hidden="true"
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-2xl glass border border-black/8 h-32 overflow-hidden relative"
            aria-hidden="true"
          >
            <div
              className="absolute inset-0 skeleton-shimmer"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
              }}
            />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading page…</span>
    </div>
  );
}
