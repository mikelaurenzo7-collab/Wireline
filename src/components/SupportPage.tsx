/* eslint-disable @typescript-eslint/no-explicit-any -- support telemetry is intentionally optional. */
import React, { useId, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
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
  const topicLabelId = useId();
  const [issueType, setIssueType] = useState<(typeof ISSUE_TYPES)[number]["value"]>("tech");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFallbackAvailable, setEmailFallbackAvailable] = useState(false);
  const emailFallbackHref = `mailto:support@botbound.app?subject=${encodeURIComponent(`[Support / ${issueType}] ${subject.trim() || "(no subject)"}`)}&body=${encodeURIComponent(`From: ${email.trim()}\n\n${body}`)}`;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setEmailFallbackAvailable(false);
    let responseStatus: number | null = null;
    try {
      const response = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueType, email, subject, body }),
      });
      responseStatus = response.status;
      if (!response.ok) {
        const failBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(
          failBody?.error || `Support ticket could not be sent (${response.status}).`,
        );
      }
      const payload = (await response.json().catch(() => null)) as { sent?: boolean } | null;
      if (!payload?.sent) throw new Error("Support ticket was not delivered.");
      setSubmitted(true);
      if (typeof window !== "undefined" && (window as any).plausible) {
        (window as any).plausible("SupportTicketSubmitted", { props: { issueType } });
      }
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "The ticket service did not respond.";
      const isTransport =
        responseStatus === null ||
        (responseStatus !== null && responseStatus >= 500) ||
        (responseStatus >= 200 && responseStatus < 300);
      if (isTransport) {
        setEmailFallbackAvailable(true);
        setError("Delivery wasn't confirmed. Retry or send by email.");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingPageFrame longform>
      <PageMeta
        title="Support | BotBound"
        description="Contact BotBound support."
        path="/support"
      />
      <section className="mx-auto max-w-4xl px-5 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="marketing-hero-title wl-stitch-marketing-hero mx-auto max-w-[18ch] text-balance text-[clamp(1.9rem,3.4vw,2.9rem)]">
            Support
          </h1>
        </div>

        <nav
          aria-label="Support Options"
          className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm"
        >
          <a
            href="mailto:support@botbound.app"
            className="wl-focus-ring-halo inline-flex min-h-11 items-center gap-2 rounded-md px-2 font-medium text-muted-foreground hover:text-foreground"
          >
            <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
            Email Us
          </a>
          <Link
            to="/studio"
            className="wl-focus-ring-halo inline-flex min-h-11 items-center rounded-md px-2 font-medium text-muted-foreground hover:text-foreground"
          >
            Studio
          </Link>
          <Link
            to="/features"
            className="wl-focus-ring-halo inline-flex min-h-11 items-center rounded-md px-2 font-medium text-muted-foreground hover:text-foreground"
          >
            Product Tour
          </Link>
        </nav>

        <section className="mt-5 wl-stitch-card p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-[-.035em] text-foreground">
            Send a Request
          </h2>
          {submitted ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
              <h3 className="mt-4 text-xl font-semibold text-foreground">Request Received</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                We'll follow up at <strong className="text-foreground">{email}</strong>.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-7 space-y-5">
              <fieldset>
                <legend id={topicLabelId} className="block wl-stitch-label mb-2">
                  Topic
                </legend>
                <select
                  aria-labelledby={topicLabelId}
                  value={issueType}
                  onChange={(event) =>
                    setIssueType(event.target.value as (typeof ISSUE_TYPES)[number]["value"])
                  }
                  className="wl-focus-ring-halo block min-h-11 w-full min-w-0 rounded border border-border bg-card px-3 py-2 text-base text-foreground sm:hidden"
                >
                  {ISSUE_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <div className="hidden gap-2 sm:grid sm:grid-cols-3">
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
              </fieldset>
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
                  placeholder="Short summary of what you need"
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
                        ? "Bot name, approximate call time, what happened, and what should have happened."
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
              {emailFallbackAvailable && (
                <a
                  href={emailFallbackHref}
                  className="marketing-btn-secondary inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Send by Email
                </a>
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
                {submitting ? "Sending…" : "Send"}
              </button>
            </form>
          )}
        </section>
        <p className="mt-7 text-center text-sm leading-6 text-muted-foreground">
          Handled under the{" "}
          <Link to="/privacy" className="font-semibold text-primary underline underline-offset-4">
            Privacy Policy
          </Link>
          . Delete account data in Settings.
        </p>
      </section>
    </MarketingPageFrame>
  );
}
