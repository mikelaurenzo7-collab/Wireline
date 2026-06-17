import React from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowRight,
  Check,
  Phone,
  MessageSquare,
  Mail,
  Smartphone,
  Sparkles,
  ArrowUpRight,
  Shield,
  Activity,
  Zap,
} from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

const FEATURES_SECTION_LINKS = [
  { id: "features-hero", label: "Overview" },
  { id: "features-multichannel", label: "Multi-Channel" },
  { id: "features-siri", label: "Siri & iOS" },
  { id: "features-capabilities", label: "Capabilities" },
] as const;

export default function Features() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Wireline Voice & Messaging Platform",
    description: "Multi-channel AI agent network with unified communication timelines and deep iOS/Siri integrations.",
    offers: {
      "@type": "Offer",
      price: "9.00",
      priceCurrency: "USD",
    },
  };

  return (
    <MarketingPageFrame
      mainClassName="!px-0 pt-20 sm:pt-24 pb-0"
      sectionLinks={[...FEATURES_SECTION_LINKS]}
    >
      <PageMeta
        title="Platform Features & Tour"
        description="Explore the Wireline multi-channel orchestration engine. See how our shared interaction timeline and Siri hands-free driving integration transform business communication."
        path="/features"
        structuredData={structuredData}
      />

      {/* Hero Section */}
      <section
        id="features-hero"
        className="relative z-10 px-6 lg:px-12 pt-8 pb-16 max-w-5xl mx-auto text-center"
      >
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 border border-brand/20 bg-brand/5 px-4 py-1.5 mb-6 rounded-md"
        >
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand font-semibold">
            The Multi-Channel Voice Network
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="font-display italic text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] tracking-tight mb-6 text-ink"
        >
          <span className="wl-brand-display">One Unified Brain.</span>
          <br />
          <span>Every channel you operate.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="text-ink/75 text-lg leading-relaxed max-w-2xl mx-auto mb-10"
        >
          Wireline breaks down the barriers between phone, text, and email. Instead of separate, disjointed bots,
          your customers speak to a single, persistent fleet that carries shared context across every interaction.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            to="/signup"
            className="marketing-btn-primary min-h-[52px] px-8 text-[12px] tracking-[0.25em]"
          >
            Start Your Fleet <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/showcase"
            className="inline-flex items-center justify-center min-h-[52px] px-8 text-[12px] font-mono uppercase tracking-[0.25em] border border-ink/15 text-ink hover:bg-ink/[0.03] transition-all rounded-sm"
          >
            Audition Voices
          </Link>
        </motion.div>
      </section>

      {/* Multi-Channel Timeline Section */}
      <section
        id="features-multichannel"
        className="relative z-10 px-6 lg:px-12 py-16 scroll-mt-24 max-w-6xl mx-auto border-t border-ink/[0.08]"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 space-y-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand font-semibold">
              Platform Architecture
            </p>
            <h2 className="font-display italic text-3xl sm:text-4xl text-ink leading-tight">
              The Shared Interaction Timeline
            </h2>
            <p className="text-ink/70 text-sm sm:text-base leading-relaxed">
              In a traditional setup, if a customer calls a business and then sends an SMS, those are treated as separate tickets
              by separate software packages. Conversations get dropped, and customers have to repeat themselves.
            </p>
            <p className="text-ink/70 text-sm sm:text-base leading-relaxed">
              With Wireline, a customer profile maintains a single unified timeline. The agent that handles their email knows what
              they said on their phone call five minutes ago.
            </p>

            <div className="space-y-3.5 pt-2">
              {[
                "Persistent customer state across Phone, SMS, and Email",
                "Automatic context-handover without system gaps",
                "Instant database syncing for zero repetition",
              ].map((point) => (
                <div key={point} className="flex items-start gap-2.5 text-xs sm:text-sm text-ink/80">
                  <div className="w-5 h-5 rounded-sm bg-brand/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 text-brand" />
                  </div>
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="wl-panel border border-ink/[0.1] bg-paper-warm/40 p-6 sm:p-8 space-y-6 rounded-md shadow-sm relative overflow-hidden paper-texture">
              <div className="absolute top-0 right-0 p-3 bg-brand/10 border-bl border-ink/[0.08] rounded-bl-md">
                <span className="font-mono text-[10px] uppercase tracking-wider text-brand font-semibold">
                  Live Flow Simulation
                </span>
              </div>

              <h4 className="font-display italic text-xl text-ink">Single Customer Thread</h4>

              <div className="relative border-l-2 border-brand/25 ml-4 pl-6 space-y-8 py-2">
                {/* Step 1: Phone */}
                <div className="relative">
                  <div className="absolute -left-[35px] top-0.5 w-6 h-6 rounded-full bg-brand flex items-center justify-center text-white ring-4 ring-paper shadow-sm">
                    <Phone className="w-3 h-3" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-xs sm:text-sm text-ink">10:04 AM · Inbound Call</span>
                      <span className="font-mono text-[10px] text-brand bg-brand/10 px-1.5 py-0.5 rounded-sm">
                        Voice Agent
                      </span>
                    </div>
                    <p className="text-[13px] text-ink/70 mt-1">
                      Customer called Jordan (sales rep). Confirmed interest in Premium Fleet and requested a quote.
                    </p>
                    <div className="bg-black/5 p-2.5 mt-2 rounded-sm text-xs italic text-ink/65 border border-ink/[0.05]">
                      "Sure, I'll send that quote over right now via SMS and email. What's your best address?"
                    </div>
                  </div>
                </div>

                {/* Step 2: SMS */}
                <div className="relative">
                  <div className="absolute -left-[35px] top-0.5 w-6 h-6 rounded-full bg-brand flex items-center justify-center text-white ring-4 ring-paper shadow-sm">
                    <MessageSquare className="w-3 h-3" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-xs sm:text-sm text-ink">10:05 AM · Auto-SMS Delivery</span>
                      <span className="font-mono text-[10px] text-brand bg-brand/10 px-1.5 py-0.5 rounded-sm">
                        SMS Agent
                      </span>
                    </div>
                    <p className="text-[13px] text-ink/70 mt-1">
                      Platform dispatched a secure link containing the quote payload, matching the voice request.
                    </p>
                    <div className="bg-brand/5 p-2.5 mt-2 rounded-sm text-xs text-brand/90 border border-brand/10">
                      <strong>Outgoing SMS:</strong> "Hi Michael, here's your personalized quote: wl.net/q/8b3f. Tap to approve."
                    </div>
                  </div>
                </div>

                {/* Step 3: Email */}
                <div className="relative">
                  <div className="absolute -left-[35px] top-0.5 w-6 h-6 rounded-full bg-brand flex items-center justify-center text-white ring-4 ring-paper shadow-sm">
                    <Mail className="w-3 h-3" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-xs sm:text-sm text-ink">10:06 AM · Contract Delivered</span>
                      <span className="font-mono text-[10px] text-brand bg-brand/10 px-1.5 py-0.5 rounded-sm">
                        Email Agent
                      </span>
                    </div>
                    <p className="text-[13px] text-ink/70 mt-1">
                      Comprehensive proposal delivered with Stripe checkout link. Context inherited from voice conversation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Siri Hands-Free Driving Integration Section */}
      <section
        id="features-siri"
        className="relative z-10 px-6 lg:px-12 py-16 scroll-mt-24 max-w-6xl mx-auto border-t border-ink/[0.08]"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 order-last lg:order-first">
            <div className="wl-panel border border-ink/[0.1] bg-paper-warm/40 p-6 sm:p-8 rounded-md shadow-sm relative overflow-hidden paper-texture">
              <div className="flex items-center justify-between border-b border-ink/[0.08] pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <span className="font-mono text-[11px] text-ink/50 uppercase tracking-widest">
                  iOS / CarPlay Architecture
                </span>
              </div>

              <div className="space-y-6">
                {/* Car Screen Representation */}
                <div className="bg-black p-5 text-white font-sans rounded-md border border-white/10 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-brand flex items-center justify-center rounded-sm">
                        <Smartphone className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-white/90">
                        CarPlay Interactive Hud
                      </span>
                    </div>
                    <span className="text-[11px] text-white/50">WiFi Connecting</span>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3.5 bg-zinc-900 border border-white/10 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-brand">Siri Trigger Event</p>
                        <p className="text-sm font-semibold mt-0.5">"Siri, ask Wireline to dial pharmacy..."</p>
                      </div>
                      <div className="w-3 h-3 rounded-full bg-brand animate-ping" />
                    </div>

                    <div className="p-3.5 bg-brand/10 border border-brand/30 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-brand">Active Outbound Dispatch</p>
                        <p className="text-sm font-semibold mt-0.5">Calling Walgreens #4032</p>
                        <p className="text-xs text-white/70 mt-1">Instruction: "Confirm prescription refilled"</p>
                      </div>
                      <span className="font-mono text-xs text-brand">Pending...</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-black/5 border border-ink/[0.08] rounded-sm">
                    <h5 className="font-display italic text-base text-ink mb-1">Interactive Widgets</h5>
                    <p className="text-[12px] text-ink/70 leading-relaxed">
                      Check your lock screen or home screen widget to see active call states and live transcripts while driving.
                    </p>
                  </div>
                  <div className="p-4 bg-black/5 border border-ink/[0.08] rounded-sm">
                    <h5 className="font-display italic text-base text-ink mb-1">Direct Carrier Routing</h5>
                    <p className="text-[12px] text-ink/70 leading-relaxed">
                      Zero middleware jank. Direct-to-carrier routing ensures crisp, HD audio with sub-second model response times.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand font-semibold">
              Hands-Free Coverage
            </p>
            <h2 className="font-display italic text-3xl sm:text-4xl text-ink leading-tight">
              Siri Driving Integration
            </h2>
            <p className="text-ink/70 text-sm sm:text-base leading-relaxed">
              When you're behind the wheel, checking your phone isn't just difficult — it's dangerous. Wireline offers native Siri
              Shortcuts and CarPlay support, enabling truly hands-free operations.
            </p>
            <p className="text-ink/70 text-sm sm:text-base leading-relaxed">
              Ask Siri to trigger a custom Wireline workflow. Your fleet automatically places the call, coordinates with the client,
              updates your CRM, and displays the outcome on your iOS Widget immediately when you park.
            </p>

            <div className="p-4 border-l-2 border-brand bg-brand/5 space-y-1.5 rounded-sm">
              <span className="font-mono text-[10px] uppercase tracking-wider text-brand font-semibold">
                Core Driving Scenario
              </span>
              <p className="text-xs sm:text-sm text-ink/80 italic leading-relaxed">
                "Siri, tell Wireline to ask the doctor's office if they received my lab results."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Grid of Capabilities */}
      <section
        id="features-capabilities"
        className="relative z-10 px-6 lg:px-12 py-16 scroll-mt-24 max-w-6xl mx-auto border-t border-ink/[0.08] pb-24"
      >
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand font-semibold mb-2">
            The Complete Infrastructure
          </p>
          <h2 className="font-display italic text-3xl sm:text-4xl text-ink">
            A Core Voice Carrier & Software Layer
          </h2>
          <p className="text-ink/65 text-sm sm:text-base mt-3 leading-relaxed">
            Wireline is built on top of our own direct voice network. We cut out Twilio middleware to deliver premium call-center
            infrastructure directly to small shops and large fleets.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              title: "Direct Voice Carrier",
              body: "We peer directly with voice networks to maintain sub-second response speeds. No Middlemen or Twilio API layer.",
              icon: Zap,
            },
            {
              title: "Triage & Handoff Inbox",
              body: "Three-column triage desk with dialogue balloons, sentiment indicators, and human take-over alerts.",
              icon: MessageSquare,
            },
            {
              title: "Active CRM Syncing",
              body: "Seamless bi-directional syncing with HubSpot, Salesforce, Slack, and custom webhook payloads.",
              icon: Activity,
            },
            {
              title: "Interactive iOS Widgets",
              body: "Track active call timelines, read live transcripts, and approve draft messages from your iOS Home Screen.",
              icon: Smartphone,
            },
            {
              title: "Compliance Ledger",
              body: "Full TCPA compliance audit trails. Opt-outs and disclosures recorded with timestamp, rule version, and state.",
              icon: Shield,
            },
            {
              title: "Personal Assistants",
              body: "A lower-cost personal assistant lane that routes calls, schedules calendars, and answers simple queries.",
              icon: Phone,
            },
          ].map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="wl-panel border border-ink/[0.08] bg-paper hover:border-brand/30 transition-all p-6 rounded-md group relative overflow-hidden"
              >
                <div className="w-10 h-10 rounded-sm bg-brand/10 flex items-center justify-center shrink-0 mb-4 text-brand">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-display italic text-lg text-ink leading-tight mb-2">
                  {item.title}
                </h3>
                <p className="text-[13px] text-ink/70 leading-relaxed">{item.body}</p>
              </div>
            );
          })}
        </div>

        {/* Footer Call to Action */}
        <div className="mt-16 text-center">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2.5 px-6 py-4 border-2 border-brand text-brand hover:bg-brand hover:text-white transition-all text-xs font-mono uppercase tracking-[0.25em] font-semibold rounded-sm"
          >
            Deploy Your First Agent <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
