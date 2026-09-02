import React, { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LayoutTemplate,
  Loader2,
  Mail,
  Send,
  Sparkles,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import { planById } from "../lib/plan-catalog";
import MarketingPageFrame from "./layout/MarketingPageFrame";
import { Input } from "./ui/shadcn/Input";

const INQUIRY_TYPES = [
  { value: "personal", label: "Build a Bot" },
  { value: "sales", label: "Team rollout" },
  { value: "partnership", label: "Partnership" },
  { value: "general", label: "General" },
] as const;

const STARTER_PRICE = planById("starter")?.price_usd_monthly ?? 19;
const STARTER_PLUS_PRICE = planById("team")?.price_usd_monthly ?? 39;

export function ContactPage() {
  const [searchParams] = useSearchParams();
  const initialIntent = searchParams.get("intent") ?? searchParams.get("topic");
  const startsAsSales = ["sales", "business", "enterprise"].includes(
    initialIntent?.toLowerCase() ?? "",
  );
  const [inquiryType, setInquiryType] = useState<(typeof INQUIRY_TYPES)[number]["value"]>(
    startsAsSales ? "sales" : "personal",
  );
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [subject, setSubject] = useState(
    initialIntent?.toLowerCase() === "enterprise" ? "Enterprise rollout" : "",
  );
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const normalizedEmail = email.trim();
    const normalizedSubject = subject.trim();
    const normalizedBody = body.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (normalizedSubject.length < 3) {
      setError("Add a short subject so we can route your note.");
      return;
    }
    if (normalizedBody.length < 10) {
      setError("Add a little more detail so we can help.");
      return;
    }

    setSubmitting(true);
    const contextLines = [
      company.trim() ? `Company: ${company.trim()}` : null,
      phone.trim() ? `Preferred callback: ${phone.trim()}` : null,
    ].filter(Boolean);
    const composedBody = contextLines.length
      ? `${contextLines.join("\n")}\n\n${normalizedBody}`
      : normalizedBody;
    let responseStatus: number | null = null;
    try {
      const response = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueType: inquiryType,
          email: normalizedEmail,
          subject: normalizedSubject,
          body: composedBody,
        }),
      });
      responseStatus = response.status;
      if (!response.ok) {
        const failBody = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(failBody?.error || `Message could not be sent (${response.status}).`);
      }
      const payload = (await response.json().catch(() => null)) as {
        sent?: boolean;
      } | null;
      if (!payload?.sent) {
        throw new Error("Message was not delivered.");
      }
      setSubmitted(true);
      if (
        typeof window !== "undefined" &&
        (window as { plausible?: (name: string, options?: unknown) => void }).plausible
      ) {
        (window as { plausible: (name: string, options?: unknown) => void }).plausible(
          "ContactMessageSubmitted",
          { props: { inquiryType } },
        );
      }
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "The message service did not respond.";
      const isTransport =
        (responseStatus !== null && responseStatus >= 500) ||
        /did not respond|failed to fetch|network|503|502|504|Message was not delivered/i.test(
          message,
        ) ||
        message.includes("(5");
      if (isTransport) {
        window.location.href = `mailto:support@botbound.me?subject=${encodeURIComponent(`[BotBound / ${inquiryType}] ${normalizedSubject}`)}&body=${encodeURIComponent(`From: ${normalizedEmail}\n\n${composedBody}`)}`;
        setError(
          "The message service did not respond, so your email client has opened with the note prepared.",
        );
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
        title="Contact BotBound"
        description="Talk to BotBound about building a Bot, a team rollout, partnerships, or support."
        path="/contact"
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
          <h1 className="wl-stitch-marketing-hero text-balance">Talk through the Bot you need</h1>
        </div>

        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          <a
            href="mailto:support@botbound.me"
            className="wl-stitch-card wl-stitch-card-hover p-5 text-center"
          >
            <Mail className="mx-auto h-5 w-5 text-primary" />
            <h2 className="mt-5 font-semibold text-foreground">Email us</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">support@botbound.me</p>
          </a>
          <Link to="/features" className="wl-stitch-card wl-stitch-card-hover p-5 text-center">
            <LayoutTemplate className="mx-auto h-5 w-5 text-primary" />
            <h2 className="mt-5 font-semibold text-foreground">See how it works</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Calls, follow-up, outcomes
            </p>
          </Link>
          <Link
            to="/pricing"
            className="wl-stitch-card wl-stitch-card-brand wl-stitch-card-hover p-5 text-center"
          >
            <Sparkles className="mx-auto h-5 w-5" />
            <h2 className="mt-5 font-semibold">See plans</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--wireline-color-text-secondary)]">
              Create and train free. Starter launches at ${STARTER_PRICE}/mo; Starter Plus at $
              {STARTER_PLUS_PRICE}/mo.
            </p>
          </Link>
        </section>

        <section className="mt-8 wl-stitch-card p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-[-.035em] text-foreground">Send a note</h2>
          {submitted ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
              <h3 className="mt-4 text-xl font-semibold text-foreground">Message received</h3>
              <p className="mt-2 text-sm text-muted-foreground">We'll follow up at {email}.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-7 space-y-5">
              <fieldset>
                <legend className="mb-2 block wl-stitch-label">What can we help with?</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {INQUIRY_TYPES.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      aria-pressed={inquiryType === item.value}
                      onClick={() => setInquiryType(item.value)}
                      className={`min-h-11 min-w-0 rounded border px-2 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 focus-visible:outline-offset-2 sm:px-3 sm:text-sm ${inquiryType === item.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-foreground">
                  Email
                  <Input
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-foreground">
                  Company or organization{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                  <Input
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    placeholder="Optional"
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Callback number{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
                <Input
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Best number for a fit call or rollout question"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Subject
                <Input
                  required
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="What can we help with?"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Message
                <textarea
                  required
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={6}
                  className="w-full rounded border border-border bg-card px-3 py-3 text-sm leading-6 text-foreground outline-none focus:border-primary"
                  placeholder={
                    inquiryType === "sales"
                      ? "Team size, calls you need covered, systems you use today, and your timeline."
                      : "Tell us the call or setup you need help with."
                  }
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
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
                {submitting ? "Sending…" : "Send message"}
              </button>
            </form>
          )}
        </section>
        <p className="mt-7 text-center text-sm text-muted-foreground">
          Need product help instead?{" "}
          <Link to="/support" className="font-semibold text-primary underline underline-offset-4">
            Visit support <ArrowRight className="inline h-4 w-4" />
          </Link>
        </p>
      </section>
    </MarketingPageFrame>
  );
}
