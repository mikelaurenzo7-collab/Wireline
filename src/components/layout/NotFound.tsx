import React from "react";
import { Link } from "react-router-dom";
import { Activity, ChevronRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6 text-center px-6">
      <div className="font-display italic text-aurora text-[8rem] md:text-[12rem] leading-none">404</div>
      <p className="text-[10px] uppercase tracking-[0.6em] text-muted">Page not found</p>
      <p className="text-ink/55 max-w-md text-sm leading-relaxed">
        This page doesn't exist. Use ⌘K to jump anywhere, or head back to the dashboard.
      </p>
      <Link to="/" className="brutal-btn !py-3 !px-6 !text-[11px] !tracking-[0.3em]">
        <Activity className="w-3.5 h-3.5" /> Back to Dashboard <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
