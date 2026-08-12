/* eslint-disable @typescript-eslint/no-explicit-any -- support telemetry is intentionally optional. */
import React, { useState } from "react";
import { Link } from "react-router";
import {
  Phone,
  Mail,
  MessageSquare,
  Send,
  Loader2,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import { WIRELINE_FEATURED_TEAM_AGENT } from "../data/contact-agents";
import MarketingPageFrame from "./layout/MarketingPageFrame";
import { Input } from "./ui/shadcn/Input";

const ISSUE_TYPES = [
  { value: "billing", label: "Billing or refund" },
  { value: "tech", label: "Technical issue" },
  { value: "feature", label: "Feature request" },
  { value: "agent", label: "Call quality" },
  { value: "account", label: "Account access" },
  { value: "other", label: "Something else" },
] as const;

export function SupportPage() {
  const supportAgent = WIRELINE_FEATURED_TEAM_AGENT;
  const [issueType, setIssueType] =
    useState<(typeof ISSUE_TYPES)[number]["value"]>("tech");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    let responseStatus: number | null = null;
    try {
      const response = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueType, email, subject, body }),
      });
      responseStatus = response.status;
      if (!response.ok) {
        const failBody = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          failBody?.error ||
            `Support ticket could not be sent (${response.status}).`,
        );
      }
      const payload = (await response.json().catch(() => null)) as {
        sent?: boolean;
      } | null;
      if (!payload?.sent) {
        throw new Error("Support ticket was not delivered.");
      }
      setSubmitted(true);
      if (typeof window !== "undefined" && (window as any).plausible) {
        (window as any).plausible("SupportTicketSubmitted", {
          props: { issueType },
        });
      }
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "The ticket service did not respond.";
      const isTransport =
        (responseStatus !== null && responseStatus >= 500) ||
        /did not respond|failed to fetch|network|503|502|504|was not delivered/i.test(
          message,
        ) ||
        message.includes("(5");
      if (isTransport) {
        const fallback = `mailto:support@trywireline.com?subject=${encodeURIComponent(`[Support / ${issueType}] ${subject || "(no subject)"}`)}&body=${encodeURIComponent(`From: ${email}\n\n${body}`)}`;
        window.location.href = fallback;
        setError(
          "The ticket service did not respond, so your email client has opened with everything filled in.",
        );
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingPageFrame
      stickyCta={false}
      mainClassName="!px-0 pb-0 pt-20 sm:pt-24"
    >
      <PageMeta
        title="Support | Wireline"
        description="Get help with Wireline for personal call support or business call coverage."
        path="/support"
      />
      <section className="mx-auto max-w-4xl px-5 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back home
        </Link>
        <div className="mx-auto mt-8 max-w-3xl text-center">
          <h1 className="wl-stitch-marketing-hero text-balance">
            Help with your agent, without the runaround.
          </h1>
        </div>

        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          <a
            href={`tel:${supportAgent.tel}`}
            className="wl-stitch-card wl-stitch-card-hover p-5 text-center"
          >
            <Phone className="mx-auto h-5 w-5 text-primary" />
            <h2 className="mt-5 text-sm font-semibold text-foreground">
              Call Wireline
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {supportAgent.display}
            </p>
          </a>
          <a
            href="mailto:support@trywireline.com"
            className="wl-stitch-card wl-stitch-card-hover p-5 text-center"
          >
            <Mail className="mx-auto h-5 w-5 text-primary" />
            <h2 className="mt-5 text-sm font-semibold text-foreground">
              Email support
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              support@trywireline.com
            </p>
          </a>
          <Link
            to="/studio"
            className="wl-stitch-card wl-stitch-card-hover p-5 text-center"
          >
            <MessageSquare className="mx-auto h-5 w-5 text-primary" />
            <h2 className="mt-5 text-sm font-semibold text-foreground">
              Open Studio
            </h2>
          </Link>
        </section>

        <section className="mt-8 wl-stitch-card p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-[-.035em] text-foreground">
            Open a ticket
          </h2>
          {submitted ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
              <h3 className="mt-4 text-xl font-semibold text-foreground">
                Ticket received
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                You will hear from us within one business day at{" "}
                <strong className="text-foreground">{email}</strong>.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-7 space-y-5">
              <div>
                <label className="block wl-stitch-label mb-2">
                  What is this about?
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ISSUE_TYPES.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      aria-pressed={issueType === item.value}
                      onClick={() => setIssueType(item.value)}
                      className={`min-h-11 rounded border px-3 py-2 text-left text-[length:var(--wireline-typography-caption-size)] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 focus-visible:outline-offset-2 ${issueType === item.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Your email
                <Input
                  required
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Subject
                <Input
                  required
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="A short summary of what you need"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Details
                <textarea
                  required
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={6}
                  placeholder={
                    issueType === "billing"
                      ? "Invoice or charge in question, what you expected, and what happened."
                      : issueType === "agent"
                        ? "Agent name, approximate call time, what happened, and what should have happened."
                        : "What you did, what happened, and what you expected."
                  }
                  className="w-full resize-none rounded border border-border bg-card px-3 py-3 text-sm leading-6 text-foreground outline-none focus:border-primary"
                />
              </label>
              {error && (
                <p role="alert" className="text-sm leading-6 text-destructive">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="marketing-btn-primary w-full min-h-12 px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {submitting ? "Sending…" : "Send ticket"}
              </button>
            </form>
          )}
        </section>
        <p className="mt-7 text-center text-sm leading-6 text-muted-foreground">
          Tickets are handled according to the{" "}
          <Link
            to="/privacy"
            className="font-semibold text-primary underline underline-offset-4"
          >
            Privacy Policy
          </Link>
          . You can request deletion at any time through account settings.
        </p>
      </section>
    </MarketingPageFrame>
  );
}