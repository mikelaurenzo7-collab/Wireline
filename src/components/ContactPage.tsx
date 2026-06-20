import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail, Phone, Send, Sparkles } from "lucide-react";
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
] as const;

export function ContactPage() {
  const [searchParams] = useSearchParams();
  const salesAgent = WIRELINE_FEATURED_TEAM_AGENT;
  const initialIntent = searchParams.get("intent");
  const [inquiryType, setInquiryType] = useState<(typeof INQUIRY_TYPES)[number]["value"]>(initialIntent === "sales" ? "sales" : "sales");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const composedBody = company ? `Company: ${company}\n\n${body}` : body;
    try {
      const response = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueType: inquiryType, email, subject, body: composedBody }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSubmitted(true);
      if (typeof window !== "undefined" && (window as { plausible?: (name: string, options?: unknown) => void }).plausible) {
        (window as { plausible: (name: string, options?: unknown) => void }).plausible("ContactMessageSubmitted", { props: { inquiryType } });
      }
    } catch {
      window.location.href = `mailto:sales@trywireline.com?subject=${encodeURIComponent(`[Contact / ${inquiryType}] ${subject || "(no subject)"}`)}&body=${encodeURIComponent(`From: ${email}\n\n${composedBody}`)}`;
      setError("The message service did not respond, so your email client has opened with the note prepared.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingChrome stickyCta={false}>
      <PageMeta title="Contact Wireline" description="Talk to Wireline about business coverage, partnerships, press, or a custom rollout." path="/contact" />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#54545b] hover:text-[#1d1d1f]"><ArrowLeft className="h-4 w-4" />Back home</Link>
        <div className="mt-9">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6e6e73]">Talk to Wireline</p>
          <h1 className="mt-4 text-balance text-[clamp(2.6rem,7vw,4.5rem)] font-semibold leading-[0.96] tracking-[-0.06em] text-[#1d1d1f]">Build the right call coverage.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#54545b]">Tell us what conversations need coverage, how a handoff should work, and what a useful outcome looks like. We will point you to the right starting plan or rollout.</p>
        </div>

        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          <a href={`tel:${salesAgent.tel}`} className="rounded-2xl border border-[#1d1d1f]/12 bg-white p-5 transition hover:border-[#1d1d1f]/30"><Phone className="h-5 w-5" /><h2 className="mt-5 font-semibold">Call our team</h2><p className="mt-2 text-sm leading-6 text-[#5e5e64]">{salesAgent.display} for fit, demos, and rollout questions.</p></a>
          <a href="mailto:sales@trywireline.com" className="rounded-2xl border border-[#1d1d1f]/12 bg-white p-5 transition hover:border-[#1d1d1f]/30"><Mail className="h-5 w-5" /><h2 className="mt-5 font-semibold">Email us</h2><p className="mt-2 text-sm leading-6 text-[#5e5e64]">Sales, partnerships, press, and implementation questions.</p></a>
          <Link to="/pricing" className="rounded-2xl border border-[#1d1d1f]/12 bg-[#1d1d1f] p-5 text-white transition hover:bg-black"><Sparkles className="h-5 w-5" /><h2 className="mt-5 font-semibold">See coverage plans</h2><p className="mt-2 text-sm leading-6 text-white/75">Personal starts at $9. Business Studio starts at $99.</p></Link>
        </section>

        <section className="mt-8 rounded-2xl border border-[#1d1d1f]/12 bg-white p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-[-0.035em]">Send a note</h2>
          <p className="mt-2 text-sm leading-6 text-[#5e5e64]">Choose the topic and include the workflow, team size, or timeline that matters.</p>
          {submitted ? <div className="py-10 text-center"><CheckCircle2 className="mx-auto h-10 w-10" /><h3 className="mt-4 text-xl font-semibold">Message received</h3><p className="mt-2 text-sm text-[#5e5e64]">We will reply within one business day at {email}.</p></div> : (
            <form onSubmit={onSubmit} className="mt-7 space-y-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{INQUIRY_TYPES.map((item) => <button type="button" key={item.value} onClick={() => setInquiryType(item.value)} className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${inquiryType === item.value ? "border-[#1d1d1f] bg-[#1d1d1f] text-white" : "border-[#1d1d1f]/14 bg-white text-[#4f4f55] hover:text-[#1d1d1f]"}`}>{item.label}</button>)}</div>
              <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold">Email<Input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></label><label className="grid gap-2 text-sm font-semibold">Company <span className="font-normal text-[#6e6e73]">(optional)</span><Input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Acme Co." /></label></div>
              <label className="grid gap-2 text-sm font-semibold">Subject<Input required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What would you like to cover?" /></label>
              <label className="grid gap-2 text-sm font-semibold">Message<textarea required value={body} onChange={(event) => setBody(event.target.value)} rows={6} className="w-full rounded-xl border border-[#1d1d1f]/20 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-[#1d1d1f]" placeholder={inquiryType === "sales" ? "Team size, the calls you need covered, systems you use today, and any launch timeline." : "Tell us what you need."} /></label>
              {error && <p role="alert" className="text-sm text-[#9b1c1c]">{error}</p>}
              <ShadButton type="submit" disableAnimations variant="editorial" disabled={submitting} className="w-full rounded-full px-5 py-3 text-sm font-semibold">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{submitting ? "Sending…" : "Send message"}</ShadButton>
            </form>
          )}
        </section>
        <p className="mt-7 text-center text-sm text-[#6e6e73]">Need product help instead? <Link to="/support" className="font-semibold text-[#1d1d1f] underline underline-offset-4">Visit support <ArrowRight className="inline h-4 w-4" /></Link></p>
      </main>
    </MarketingChrome>
  );
}
