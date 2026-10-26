import React, { useEffect, useId, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowRight, CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "./layout/MarketingPageFrame";
import { Input } from "./ui/shadcn/Input";

const INQUIRY_TYPES = [
  { value: "personal", label: "Build a Bot" },
  { value: "sales", label: "Team Rollout" },
  { value: "partnership", label: "Partnership" },
  { value: "general", label: "General" },
] as const;

export function ContactPage() {
  const [searchParams] = useSearchParams();
  const initialIntent = searchParams.get("intent") ?? searchParams.get("topic");
  const startsAsBilling = initialIntent?.toLowerCase() === "billing";
  const startsAsSales = ["sales", "business", "enterprise", "demo"].includes(
    initialIntent?.toLowerCase() ?? "",
  );
  const [inquiryType, setInquiryType] = useState<(typeof INQUIRY_TYPES)[number]["value"]>(
    startsAsBilling ? "general" : startsAsSales ? "sales" : "personal",
  );
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [subject, setSubject] = useState(
    startsAsBilling
      ? "Billing Help"
      : initialIntent?.toLowerCase() === "enterprise"
        ? "Enterprise rollout"
        : initialIntent?.toLowerCase() === "demo"
          ? "Request a demo"
          : initialIntent?.toLowerCase() === "email"
            ? "Email setup review"
            : initialIntent?.toLowerCase() === "sms"
              ? "SMS setup"
              : "",
  );
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState<string | null>(null);
  const submitted = receiptEmail !== null;
  const [error, setError] = useState<string | null>(null);
  const [emailFallbackAvailable, setEmailFallbackAvailable] = useState(false);
  const [invalidField, setInvalidField] = useState<"email" | "subject" | "body" | null>(null);
  const errorId = useId();
  const inquiryLabelId = useId();
  const confirmationDescriptionId = useId();
  const confirmationRef = useRef<HTMLHeadingElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (submitted) confirmationRef.current?.focus();
  }, [submitted]);

  const clearFieldError = (field: typeof invalidField) => {
    if (invalidField !== field) return;
    setInvalidField(null);
    setError(null);
  };

  const normalizedEmail = email.trim();
  const normalizedSubject = subject.trim();
  const normalizedBody = body.trim();
  const contextLines = [
    company.trim() ? `Company: ${company.trim()}` : null,
    phone.trim() ? `Preferred callback: ${phone.trim()}` : null,
  ].filter(Boolean);
  const composedBody = contextLines.length
    ? `${contextLines.join("\n")}\n\n${normalizedBody}`
    : normalizedBody;
  const emailFallbackHref = `mailto:support@botbound.app?subject=${encodeURIComponent(`[BotBound / ${inquiryType}] ${normalizedSubject}`)}&body=${encodeURIComponent(`From: ${normalizedEmail}\n\n${composedBody}`)}`;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setInvalidField(null);
    setEmailFallbackAvailable(false);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      setInvalidField("email");
      emailRef.current?.focus();
      emailRef.current?.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
      return;
    }
    if (normalizedSubject.length < 3) {
      setError("Add a short subject so we can route your note.");
      setInvalidField("subject");
      subjectRef.current?.focus();
      subjectRef.current?.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "nearest",
      });
      return;
    }
    if (normalizedBody.length < 10) {
      setError("Add a little more detail so we can help.");
      setInvalidField("body");
      bodyRef.current?.focus();
      bodyRef.current?.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
      return;
    }

    setSubmitting(true);
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
      setReceiptEmail(normalizedEmail);
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
    <MarketingPageFrame longform className="wl-contact-page">
      <PageMeta
        title="Contact BotBound"
        description="Talk to BotBound about building a Bot, a team rollout, partnerships, or support."
        path="/contact"
      />
      <section className="mx-auto max-w-4xl px-5 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
        <nav
          aria-label="Contact Options"
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
            to="/features"
            className="wl-focus-ring-halo inline-flex min-h-11 items-center rounded-md px-2 font-medium text-muted-foreground hover:text-foreground"
          >
            How It Works
          </Link>
          <Link
            to="/pricing"
            className="wl-focus-ring-halo inline-flex min-h-11 items-center rounded-md px-2 font-medium text-muted-foreground hover:text-foreground"
          >
            See Pricing
          </Link>
        </nav>

        <section className="mt-5 wl-stitch-card p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-[-.035em] text-foreground">Send a Note</h2>
          {!submitted && initialIntent?.toLowerCase() === "email" ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Include the business domain you want to use and whether you can update its DNS. Setup
              review confirms the next steps before email activation.
            </p>
          ) : null}
          {submitted ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
              <h3
                ref={confirmationRef}
                tabIndex={-1}
                aria-describedby={confirmationDescriptionId}
                className="mt-4 text-xl font-semibold text-foreground"
              >
                Message Received
              </h3>
              <p id={confirmationDescriptionId} className="mt-2 text-sm text-muted-foreground">
                We'll follow up at {receiptEmail}.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-7 space-y-5">
              <fieldset>
                <legend id={inquiryLabelId} className="mb-2 block wl-stitch-label">
                  What Can We Help With?
                </legend>
                <select
                  aria-labelledby={inquiryLabelId}
                  value={inquiryType}
                  onChange={(event) =>
                    setInquiryType(event.target.value as (typeof INQUIRY_TYPES)[number]["value"])
                  }
                  className="wl-focus-ring-halo block min-h-11 w-full min-w-0 rounded border border-border bg-card px-3 py-2 text-base text-foreground sm:hidden"
                >
                  {INQUIRY_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <div className="hidden gap-2 sm:grid sm:grid-cols-4">
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
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Email
                <Input
                  ref={emailRef}
                  required
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="email"
                  value={email}
                  aria-invalid={invalidField === "email"}
                  aria-describedby={invalidField === "email" ? errorId : undefined}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clearFieldError("email");
                  }}
                  placeholder="you@example.com"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Subject
                <Input
                  ref={subjectRef}
                  required
                  value={subject}
                  aria-invalid={invalidField === "subject"}
                  aria-describedby={invalidField === "subject" ? errorId : undefined}
                  onChange={(event) => {
                    setSubject(event.target.value);
                    clearFieldError("subject");
                  }}
                  placeholder="What Can We Help With?"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Message
                <textarea
                  ref={bodyRef}
                  required
                  value={body}
                  aria-invalid={invalidField === "body"}
                  aria-describedby={invalidField === "body" ? errorId : undefined}
                  onChange={(event) => {
                    setBody(event.target.value);
                    clearFieldError("body");
                  }}
                  rows={6}
                  className="w-full rounded border border-border bg-card px-3 py-3 text-sm leading-6 text-foreground outline-none focus:border-primary"
                  placeholder={
                    initialIntent?.toLowerCase() === "email"
                      ? "Your domain, email provider, and the address you want your Bot to use."
                      : inquiryType === "sales"
                        ? "Team size, calls you need covered, systems you use today, and your timeline."
                        : "Tell us the call or setup you need help with."
                  }
                />
              </label>
              <details className="group border-y border-border">
                <summary className="wl-focus-ring-halo flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded px-1 text-sm font-semibold text-foreground marker:hidden">
                  <span>Company &amp; Callback (Optional)</span>
                  <span
                    aria-hidden="true"
                    className="text-xl text-muted-foreground group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <div className="grid gap-4 pb-4 pt-2 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-foreground">
                    <span>
                      Company or organization{" "}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </span>
                    <Input
                      autoComplete="organization"
                      value={company}
                      onChange={(event) => setCompany(event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-foreground">
                    <span>
                      Callback number{" "}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </span>
                    <Input
                      type="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="Best number for a fit call or rollout question"
                    />
                  </label>
                </div>
              </details>
              {error && (
                <p id={errorId} role="alert" className="text-sm text-destructive">
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
                {submitting ? "Sending…" : "Send Message"}
              </button>
            </form>
          )}
        </section>
        <p className="mt-7 text-center text-sm text-muted-foreground">
          Need product help instead?{" "}
          <Link to="/support" className="font-semibold text-primary underline underline-offset-4">
            Visit Support <ArrowRight className="inline h-4 w-4" />
          </Link>
        </p>
      </section>
    </MarketingPageFrame>
  );
}
