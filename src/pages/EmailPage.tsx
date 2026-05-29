/**
 * EmailPage — Dedicated sidebar page for email communication.
 *
 * Wraps the existing EmailInbox component with page-level chrome:
 * header, description, and consistent page structure. The email surface
 * gets its own dedicated navigation slot so operators can jump to
 * email threads without navigating through Activity.
 *
 * Mobile-first: full-bleed inbox that maximizes vertical space.
 */
import React from "react";
import { Mail } from "lucide-react";
import EmailInbox from "../components/EmailInbox";

export default function EmailPage() {
  return (
    <div className="flex flex-col h-[calc(var(--app-vvh,100dvh)-7rem)] sm:h-[calc(var(--app-vvh,100dvh)-9rem)] lg:h-[calc(100dvh-8.5rem)] min-h-[400px]">
      {/* ─── Header ────────────────────────────────────────────────── */}
      <header className="shrink-0 mb-3 sm:mb-4 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand/8 flex items-center justify-center shrink-0">
            <Mail className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-semibold text-foreground">Email</h1>
            <p className="text-[11px] sm:text-xs text-muted">
              Manage threads, drafts & automated responses
            </p>
          </div>
        </div>
      </header>

      {/* ─── Email Inbox ───────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl">
        <EmailInbox />
      </div>
    </div>
  );
}
