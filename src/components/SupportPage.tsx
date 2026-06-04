/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
/**
 * /support — real customer support surface.
 *
 * Pre-launch trust signal: a "Support" link in the footer that leads
 * to nothing erodes confidence. This page gives every visitor a clear
 * triage path:
 *   1. Wireline team line — Sarah picks up immediately
 *   2. Email — trywireline@yahoo.com with structured templates per
 *      issue type (faster resolution + better signal for us)
 *   3. In-app — if signed in, "Ask your agent" via per-agent Workspace
 *   4. Status — link to the in-app SystemStatusBadge or future
 *      Statuspage.io
 *
 * Form posts to a /api/support/ticket endpoint that emails the
 * Wireline support inbox. Falls back to mailto: if the API is down.
 */
import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Phone,
  Mail,
  MessageSquare,
  ShieldCheck,
  Send,
  Loader2,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import { WIRELINE_FEATURED_TEAM_AGENT } from "../data/contact-agents";
import MarketingChrome from "./marketing/MarketingChrome";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";

const ISSUE_TYPES = [
  { value: "billing", label: "Billing or refund" },
  { value: "tech", label: "Technical issue / bug" },
  { value: "feature", label: "Feature request" },
  { value: "agent", label: "Agent quality / call problem" },
  { value: "account", label: "Account access / sign-in" },
  { value: "other", label: "Something else" },
];

export function SupportPage() {
  const supportAgent = WIRELINE_FEATURED_TEAM_AGENT;
  const [issueType, setIssueType] = useState<string>("tech");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // Best-effort POST. If the route isn't deployed yet, fall back
      // to opening a pre-composed mailto: so no operator gets stuck.
      const res = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueType, email, subject, body }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSubmitted(true);
      if (typeof window !== "undefined" && (window as any).plausible) {
        (window as any).plausible("SupportTicketSubmitted", { props: { issueType } });
      }
    } catch {
      // Graceful fallback: pre-fill mailto with the operator's content
      // so they don't lose what they typed.
      const fallback = `mailto:trywireline@yahoo.com?subject=${encodeURIComponent(
        `[Support / ${issueType}] ${subject || "(no subject)"}`,
      )}&body=${encodeURIComponent(`From: ${email}\n\n${body}`)}`;
      window.location.href = fallback;
      setError(
        "Couldn't reach the ticket service — opening your email client with everything filled in instead.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingChrome stickyCta={false}>
      <PageMeta
        title="Support — Wireline"
        description={`Get help with Wireline. Call ${supportAgent.display} for instant agent triage, or open a ticket. Billing, technical, feature, agent-quality requests all in one place.`}
        path="/support"
      />
      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-caption font-medium text-muted hover:text-ink transition-colors mb-8 -mx-2 px-2 py-2 rounded-md hover:bg-black/[0.03] min-h-[44px]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back home
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-md flex items-center justify-center shrink-0"
            style={{ background: "#8B3FD6" }}
          >
            <ShieldCheck className="w-5 h-5 text-on-brand" />
          </div>
          <h1 className="marketing-hero-title text-3xl sm:text-4xl">Support</h1>
        </div>
        <p className="marketing-hero-lead mb-10 max-w-2xl">
          We aim for a first reply within 1 business day on every ticket. Urgent production issues
          (your line is down, an agent is misbehaving on a live call) — call us directly so we can
          fix it in real time.
        </p>

        {/* Fast triage */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          <a
            href={`tel:${supportAgent.tel}`}
            className="marketing-panel p-4 min-h-[88px] hover:border-brand/30 hover:shadow-[0_8px_24px_-16px_rgba(107,43,153,0.25)] transition-all group"
          >
            <div className="w-9 h-9 rounded-md bg-brand/10 flex items-center justify-center mb-3">
              <Phone className="w-4 h-4 text-brand" />
            </div>
            <p className="text-sm font-semibold text-ink mb-1">Call us now</p>
            <p className="text-caption leading-relaxed">
              {supportAgent.display} — {supportAgent.name} picks up 24/7. Urgent issues get
              escalated to a human within minutes.
            </p>
          </a>
          <a
            href="mailto:trywireline@yahoo.com"
            className="marketing-panel p-4 min-h-[88px] hover:border-brand/30 hover:shadow-[0_8px_24px_-16px_rgba(107,43,153,0.25)] transition-all group"
          >
            <div className="w-9 h-9 rounded-md bg-brand/10 flex items-center justify-center mb-3">
              <Mail className="w-4 h-4 text-brand" />
            </div>
            <p className="text-sm font-semibold text-ink mb-1">Email us</p>
            <p className="text-caption leading-relaxed">
              trywireline@yahoo.com — 1 business day response, faster on billing + access issues.
            </p>
          </a>
          <Link
            to="/chat"
            className="marketing-panel p-4 min-h-[88px] hover:border-brand/30 hover:shadow-[0_8px_24px_-16px_rgba(107,43,153,0.25)] transition-all group"
          >
            <div className="w-9 h-9 rounded-md bg-brand/10 flex items-center justify-center mb-3">
              <MessageSquare className="w-4 h-4 text-brand" />
            </div>
            <p className="text-sm font-semibold text-ink mb-1">Ask your agent</p>
            <p className="text-caption leading-relaxed">
              Already a customer? Open the Workspace tab on any of your agents and ask them directly
              — they know your account.
            </p>
          </Link>
        </div>

        {/* Ticket form */}
        <div className="marketing-panel p-6">
          <h2 className="font-display italic text-xl text-ink mb-1">Open a ticket</h2>
          <p className="text-[12px] text-muted mb-6 leading-relaxed">
            Pick the closest category — it routes to the right person faster.
          </p>

          {submitted ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-full wl-status-success flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 wl-text-success" />
              </div>
              <p className="font-display italic text-xl text-ink mb-2">Ticket received</p>
              <p className="text-[12px] text-muted leading-relaxed max-w-md mx-auto">
                You'll hear from us within 1 business day at{" "}
                <strong className="text-ink">{email}</strong>. If it's urgent, call{" "}
                {supportAgent.display}. {supportAgent.name} will route it to a human immediately.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.28em] text-muted mb-1.5">
                  What's this about?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ISSUE_TYPES.map((t) => (
                    <ShadButton
                      key={t.value}
                      type="button"
                      disableAnimations
                      variant={issueType === t.value ? "secondary" : "outline"}
                      onClick={() => setIssueType(t.value)}
                      className={
                        "h-auto px-3 py-2 rounded-md text-[11px] text-left justify-start " +
                        (issueType === t.value
                          ? "border-brand bg-brand/10 text-ink"
                          : "text-ink/70 hover:border-brand/40 hover:bg-black/[0.02]")
                      }
                    >
                      {t.label}
                    </ShadButton>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="support-email"
                  className="block text-[10px] uppercase tracking-[0.28em] text-muted mb-1.5"
                >
                  Your email
                </label>
                <Input
                  id="support-email"
                  type="email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourcompany.com"
                  className="w-full rounded-md border border-black/10 bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-muted/70 outline-none focus:border-brand/40 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="support-subject"
                  className="block text-[10px] uppercase tracking-[0.28em] text-muted mb-1.5"
                >
                  Subject
                </label>
                <Input
                  id="support-subject"
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Short summary — what's broken or what you need"
                  className="w-full rounded-md border border-black/10 bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-muted/70 outline-none focus:border-brand/40 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="support-body"
                  className="block text-[10px] uppercase tracking-[0.28em] text-muted mb-1.5"
                >
                  Details
                </label>
                <textarea
                  id="support-body"
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  placeholder={
                    issueType === "billing"
                      ? "Invoice / charge in question, what you expected, what happened."
                      : issueType === "tech"
                        ? "What you did, what happened, what you expected. Browser + screenshot link if you have one."
                        : issueType === "agent"
                          ? "Agent name, call ID or approx time, what the agent did / didn't do, what should have happened."
                          : "Be as specific as possible. We respond to specifics faster than generalities."
                  }
                  className="w-full rounded-md border border-black/10 bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-muted/70 outline-none focus:border-brand/40 transition-colors resize-none leading-relaxed"
                />
              </div>

              {error && (
                <p role="alert" className="text-[11px] text-rose-600 leading-relaxed">
                  {error}
                </p>
              )}

              <ShadButton
                type="submit"
                disableAnimations
                variant="editorial"
                disabled={submitting}
                className="w-full rounded-full px-5 py-3 text-[11px] uppercase tracking-[0.3em] font-medium"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submitting ? "Sending…" : "Send ticket"}
              </ShadButton>
            </form>
          )}
        </div>

        <p className="text-[10px] text-muted/70 text-center mt-8 leading-relaxed">
          Tickets are stored alongside your account data per the{" "}
          <Link to="/privacy" className="text-muted hover:text-ink underline">
            Privacy Policy
          </Link>
          . You can request deletion at any time via account settings.
        </p>
      </div>
    </MarketingChrome>
  );
}
