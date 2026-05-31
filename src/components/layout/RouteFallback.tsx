import React from "react";
import { Compass } from "lucide-react";
import { BRAND } from "../../constants/brand-colors";
import { Medallion } from "../ui/Medallion";

export default function RouteFallback() {
  return (
    <div className="h-full w-full flex flex-col" aria-live="polite" aria-busy="true">
      <div className="shrink-0 h-px relative overflow-hidden mb-5" aria-hidden="true">
        <div
          className="absolute inset-y-0 -left-1/3 w-1/3 rounded-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${BRAND.purple}f2 40%, ${BRAND.purpleDeep}bf 60%, transparent)`,
            animation: "route-progress-sweep 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite",
          }}
        />
      </div>

      <div className="shrink-0 flex items-center gap-3 mb-6" aria-hidden="true">
        <Medallion size="sm" withHalo={false} shimmer className="w-10 h-10">
          <Compass className="w-5 h-5 animate-pulse" />
        </Medallion>
        <div className="space-y-2">
          <div className="h-2 w-28 rounded-full bg-black/8 overflow-hidden relative">
            <div className="absolute inset-0 skeleton-shimmer" />
          </div>
          <div className="h-2 w-20 rounded-full bg-black/5" />
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 content-start">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-2xl glass border border-black/8 h-32 overflow-hidden relative client-shimmer-card"
            aria-hidden="true"
          >
            <div className="absolute inset-0 skeleton-shimmer opacity-60" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading page…</span>
    </div>
  );
}
