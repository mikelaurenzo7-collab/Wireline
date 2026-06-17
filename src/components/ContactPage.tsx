/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
/**
 * /contact — public contact surface for sales, partnership, press, and general
 * inquiries. Distinct from /support (which handles bug/support tickets). Renders
 * pre-auth so prospects who type /contact or follow a marketing/sales link get a
 * real page instead of being bounced to the sign-in form.
 *
 * Form posts to the proven /api/support/ticket endpoint (with a mailto: fallback)
 * — no new backend route — tagging the message with the chosen inquiry type.
 */
import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Mail,
  Phone,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import { WIRELINE_FEATURED_TEAM_AGENT } from "../data/contact-agents";
import MarketingChrome from "./marketing/MarketingChrome";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";

const INQUIRY_TYPES = [
  { value: "sales", label: "Sales" },
  { value: "partnership", label: "Partnership" },
  { value: "press", label: "Press / media" },
  { value: "general", label: "General" },
];

export function ContactPage() {
  const salesAgent = WIRELINE_FEATURED_TEAM_AGENT;
  const [inquiryType, setInquiryType] = useState<string>("sales");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const composedBody = company ? `Company: ${company}\n\n${body}` : body;
    try {
      const res = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueType: inquiryType, email, subject, body: composedBody }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSubmitted(true);
      if (typeof window !== "undefined" && (window as any).plausible) {
        (window as any).plausible("ContactMessageSubmitted", { props: { inquiryType } });
      }
    } catch {
      const fallback = `mailto:sales@trywireline.com?subject=${encodeURIComponent(
        `[Contact / ${inquiryType}] ${subject || "(no subject)"}`,
      )}&body=${encodeURIComponent(`From: ${email}\n\n${composedBody}`)}`;
      window.location.href = fallback;
      setError(
        "Couldn't reach the message service — opening your email client with everything filled in instead.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingChrome stickyCta={false}>
      <PageMeta
        title="Contact — Wireline"
        description="Talk to Wireline about sales, partnerships, press, or anything else. Call our team line, email us, or send a note — we reply within 1 business day."
        path="/contact"
      />
      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-caption font-medium text-muted hover:text-ink transition-colors mb-8 -mx-2 px-2 py-2 rounded-md hover:bg-black/[0.03] min-h-[44px]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back home
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 bg-brand">
            <Mail className="w-5 h-5 text-on-brand" />
          </div>
          <h1 className="marketing-hero-title text-3xl sm:text-4xl">Contact us</h1>
        </div>
        <p className="marketing-hero-lead mb-10 max-w-2xl">
          Questions about plans, a partnership, or press? Talk to a human. For product issues or
          bugs, the{" "}
          <Link to="/support" className="text-brand hover:text-brand/80 underline">
            support page
          </Link>{" "}
          routes you faster. Otherwise, we reply to every note within 1 business day.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          <a
            href={`tel:${salesAgent.tel}`}
            className="marketing-panel p-4 min-h-[88px] hover:border-brand/30 hover:shadow-[0_8px_24px_-16px_rgba(107,43,153,0.25)] transition-all group"
          >
            <div className="w-9 h-9 rounded-md bg-brand/10 flex items-center justify-center mb-3">
              <Phone className="w-4 h-4 text-brand" />
            </div>
            <p className="text-sm font-semibold text-ink mb-1">Call our team</p>
            <p className="text-caption leading-relaxed">
              {salesAgent.display} — {salesAgent.name} picks up 24/7 and can talk plans, demos, and
              fit on the spot.
            </p>
          </a>
          <a
            href="mailto:sales@trywireline.com"
            className="marketing-panel p-4 min-h-[88px] hover:border-brand/30 hover:shadow-[0_8px_24px_-16px_rgba(107,43,153,0.25)] transition-all group"
          >
            <div className="w-9 h-9 rounded-md bg-brand/10 flex items-center justify-center mb-3">
              <Mail className="w-4 h-4 text-brand" />
            </div>
            <p className="text-sm font-semibold text-ink mb-1">Email us</p>
            <p className="text-caption leading-relaxed">
              sales@trywireline.com — sales, partnerships, and press. 1 business day response.
            </p>
          </a>
          <Link
            to="/pricing"
            className="marketing-panel p-4 min-h-[88px] hover:border-brand/30 hover:shadow-[0_8px_24px_-16px_rgba(107,43,153,0.25)] transition-all group"
          >
            <div className="w-9 h-9 rounded-md bg-brand/10 flex items-center justify-center mb-3">
              <Sparkles className="w-4 h-4 text-brand" />
            </div>
            <p className="text-sm font-semibold text-ink mb-1">Start free</p>
            <p className="text-caption leading-relaxed">
              Skip the back-and-forth — deploy a real agent on a 14-day trial, no card required.
            </p>
          </Link>
        </div>

        <div className="marketing-panel p-6">
          <h2 className="font-display italic text-xl text-ink mb-1">Send us a note</h2>
          <p className="text-[12px] text-muted mb-6 leading-relaxed">
            Pick the closest topic — it routes to the right person faster.
          </p>

          {submitted ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-full wl-status-success flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 wl-text-success" />
              </div>
              <p className="font-display italic text-xl text-ink mb-2">Message received</p>
              <p className="text-[12px] text-muted leading-relaxed max-w-md mx-auto">
                Thanks — we'll reply within 1 business day at{" "}
                <strong className="text-ink">{email}</strong>. If it's time-sensitive, call{" "}
                {salesAgent.display} and {salesAgent.name} will point you to the right person.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block wl-label text-muted mb-1.5">What's this about?</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {INQUIRY_TYPES.map((t) => (
                    <ShadButton
                      key={t.value}
                      type="button"
                      disableAnimations
                      variant={inquiryType === t.value ? "secondary" : "outline"}
                      onClick={() => setInquiryType(t.value)}
                      className={
                        "h-auto px-3 py-2 rounded-md text-[11px] text-left justify-start " +
                        (inquiryType === t.value
                          ? "border-brand bg-brand/10 text-ink"
                          : "text-ink/70 hover:border-brand/40 hover:bg-black/[0.02]")
                      }
                    >
                      {t.label}
                    </ShadButton>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-email" className="block wl-label text-muted mb-1.5">
                    Your email
                  </label>
                  <Input
                    id="contact-email"
                    type="email"
                    required
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourcompany.com"
                    className="w-full rounded-md border border-border bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-muted/70 outline-none focus:border-brand/40 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="contact-company" className="block wl-label text-muted mb-1.5">
                    Company <span className="text-muted/60 normal-case">(optional)</span>
                  </label>
                  <Input
                    id="contact-company"
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Co."
                    className="w-full rounded-md border border-border bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-muted/70 outline-none focus:border-brand/40 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="contact-subject" className="block wl-label text-muted mb-1.5">
                  Subject
                </label>
                <Input
                  id="contact-subject"
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Short summary — what you'd like to talk about"
                  className="w-full rounded-md border border-border bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-muted/70 outline-none focus:border-brand/40 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="contact-body" className="block wl-label text-muted mb-1.5">
                  Message
                </label>
                <textarea
                  id="contact-body"
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  placeholder={
                    inquiryType === "sales"
                      ? "Team size, what you'd want agents doing (inbound, outbound, email), and any timeline."
                      : inquiryType === "partnership"
                        ? "What you're building and how you'd like to work together."
                        : inquiryType === "press"
                          ? "Outlet, your angle, and any deadline we should know about."
                          : "Tell us what you need — the more specific, the faster we can help."
                  }
                  className="w-full rounded-md border border-border bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-muted/70 outline-none focus:border-brand/40 transition-colors resize-none leading-relaxed"
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
                {submitting ? "Sending…" : "Send message"}
              </ShadButton>
            </form>
          )}
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-caption text-muted">
          <span>Looking for product help instead?</span>
          <Link
            to="/support"
            className="inline-flex items-center gap-1 text-brand hover:text-brand/80 transition-colors min-h-[44px]"
          >
            Visit support <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </MarketingChrome>
  );
}
