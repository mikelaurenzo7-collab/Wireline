/**
 * SmsPage — Dedicated sidebar page for SMS/text communication.
 *
 * Wraps the existing SmsThreads component with page-level chrome.
 * SMS gets its own navigation slot so operators can jump to text
 * conversations without navigating through Activity.
 *
 * Mobile-first: full-bleed thread list that maximizes vertical space.
 */
import React from "react";
import { MessageCircle } from "lucide-react";
import SmsThreads from "../components/SmsThreads";

export default function SmsPage() {
  return (
    <div className="flex flex-col h-[calc(var(--app-vvh,100dvh)-7rem)] sm:h-[calc(var(--app-vvh,100dvh)-9rem)] min-h-[400px]">
      {/* ─── Header ────────────────────────────────────────────────── */}
      <header className="shrink-0 mb-3 sm:mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand/8 flex items-center justify-center shrink-0">
            <MessageCircle className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-semibold text-foreground">SMS</h1>
            <p className="text-[11px] sm:text-xs text-muted">
              Two-way text conversations & automated follow-ups
            </p>
          </div>
        </div>
      </header>

      {/* ─── SMS Threads ───────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl">
        <SmsThreads />
      </div>
    </div>
  );
}
