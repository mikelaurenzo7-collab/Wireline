import React, { useRef, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, LayoutTemplate, Loader2, Mail, MessageSquare, Send } from "lucide-react";
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
  const [issueType, setIssueType] = useState<(typeof ISSUE_TYPES)[number]["value"]>("tech");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const inFlight = useRef(false);
  const [fallbackHref, setFallbackHref] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    setFallbackHref(null);
    inFlight.current = true;
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
        const failBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(
          failBody?.error || `Support ticket could not be sent (${response.status}).`,
        );
      }
      const payload = (await response.json().catch(() => null)) as { sent?: boolean } | null;
      if (!payload?.sent) throw new Error("Support ticket was not delivered.");
      setSubmitted(true);
      // Optional analytics must never change a confirmed delivery result.
      try {
        (window as { plausible?: (name: string, options?: unknown) => void }).plausible?.(
          "SupportTicketSubmitted",
          { props: { issueType } },
        );
      } catch {
        // The request was delivered even if telemetry is unavailable.
      }
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "The ticket service did not respond.";
      const isTransport =
        (responseStatus !== null && responseStatus >= 500) ||
        /did not respond|failed to fetch|network|503|502|504|was not delivered/i.test(message) ||
        message.includes("(5");
      if (isTransport) {
        const fallback = `mailto:support@botbound.me?subject=${encodeURIComponent(`[Support / ${issueType}] ${subject || "(no subject)"}`)}&body=${encodeURIComponent(`From: ${email}\n\n${body}`)}`;
        setFallbackHref(fallback);
        setError(
          "The ticket service did not confirm delivery. Your draft is still here. Try again or use email below.",
        );
      } else {
        setError(message);
      }
    } finally {
      inFlight.current = false;
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

        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          <a
            href="mailto:support@botbound.me"
            className="wl-stitch-card wl-stitch-card-hover p-5 text-center"
          >
            <Mail className="mx-auto h-5 w-5 text-primary" />
            <h2 className="mt-5 text-sm font-semibold text-foreground">Email</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">support@botbound.me</p>
          </a>
          <Link to="/studio" className="wl-stitch-card wl-stitch-card-hover p-5 text-center">
            <MessageSquare className="mx-auto h-5 w-5 text-primary" />
            <h2 className="mt-5 text-sm font-semibold text-foreground">Studio</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Review your Bots and activity
            </p>
          </Link>
          <Link to="/features" className="wl-stitch-card wl-stitch-card-hover p-5 text-center">
            <LayoutTemplate className="mx-auto h-5 w-5 text-primary" />
            <h2 className="mt-5 text-sm font-semibold text-foreground">Product tour</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">See how BotBound works</p>
          </Link>
        </section>

        <section className="mt-8 wl-stitch-card p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-[-.035em] text-foreground">
            Send a request
          </h2>
          {submitted ? (
            <div role="status" className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
              <h3 className="mt-4 text-xl font-semibold text-foreground">Request received</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                We'll follow up at <strong className="text-foreground">{email}</strong>.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-7 space-y-5">
              <fieldset>
                <legend className="block wl-stitch-label mb-2">Topic</legend>
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
                  className="w-full resize-none rounded border border-border bg-card px-3 py-3 text-base leading-6 text-foreground outline-none focus:border-primary md:text-sm"
                />
              </label>
              {error && (
                <p role="alert" className="text-sm leading-6 text-destructive">
                  {error}
                </p>
              )}
              {fallbackHref ? (
                <a
                  href={fallbackHref}
                  className="marketing-btn-secondary inline-flex min-h-11 w-full items-center justify-center px-4 text-sm"
                >
                  Open draft in email app
                </a>
              ) : null}
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
