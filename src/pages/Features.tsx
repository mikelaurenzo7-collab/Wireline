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
import { ShadButton } from "../components/ui/shadcn/ShadButton";

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
    description:
      "Multi-channel AI agent network with unified communication timelines and deep iOS/Siri integrations.",
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
        className="relative z-10 px-6 lg:px-12 pt-4 pb-16 max-w-5xl mx-auto text-center"
      >
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 border border-brand/20 bg-brand/5 px-4 py-1.5 mb-6 rounded-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand font-semibold">
            The Platform Tour
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="font-display italic text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] tracking-tight mb-6 text-ink"
        >
          <span className="wl-brand-display">The Multi-Channel Engine.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="text-ink/75 text-lg leading-relaxed max-w-2xl mx-auto mb-10"
        >
          A sovereign stack for Phone, SMS, and Email. Experience true technical independence with a
          vertically integrated communication layer.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <ShadButton variant="editorial" size="lg" asChild>
            <Link to="/signup" className="inline-flex items-center gap-2">
              Explore the Stack <ArrowRight className="w-4 h-4" />
            </Link>
          </ShadButton>
          <ShadButton variant="outline" size="lg" asChild>
            <Link to="/showcase" className="inline-flex items-center gap-2 text-ink">
              View Technical Specs
            </Link>
          </ShadButton>
        </motion.div>
      </section>

      {/* Multi-Channel Timeline & Grid Section */}
      <section
        id="features-multichannel"
        className="relative z-10 px-6 lg:px-12 py-20 scroll-mt-28 border-t border-ink/[0.08] max-w-6xl mx-auto"
      >
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand font-semibold block mb-2">
            Unified Data Flow
          </span>
          <h2 className="font-display italic text-3xl sm:text-4xl text-ink">
            How we route across the sovereign stack
          </h2>
        </div>

        {/* 3 Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {/* Phone Step */}
          <div className="wl-panel border border-outline-variant/40 p-8 rounded-md bg-paper flex flex-col justify-between hover:border-brand/30 transition-all shadow-sm">
            <div>
              <div
                className="w-12 h-12 bg-brand/10 rounded-full flex items-center justify-center mb-6 text-brand"
                aria-hidden="true"
              >
                <Phone className="w-5 h-5" />
              </div>
              <h3 className="font-display italic text-xl text-ink mb-3">01. Phone</h3>
              <p className="text-xs sm:text-sm text-ink/70 leading-relaxed">
                Encrypted voice peering with zero-hop routing between carrier gateways. Sub-30ms
                latency for crystal-clear fidelity.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-outline-variant/20">
              <span className="font-mono text-[10px] text-brand font-semibold uppercase tracking-wider">
                LAYER: CORE CARRIER
              </span>
            </div>
          </div>

          {/* SMS Step */}
          <div className="wl-panel border border-outline-variant/40 p-8 rounded-md bg-paper flex flex-col justify-between hover:border-brand/30 transition-all shadow-sm">
            <div>
              <div
                className="w-12 h-12 bg-brand/10 rounded-full flex items-center justify-center mb-6 text-brand"
                aria-hidden="true"
              >
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="font-display italic text-xl text-ink mb-3">02. SMS</h3>
              <p className="text-xs sm:text-sm text-ink/70 leading-relaxed">
                High-throughput messaging without the middleware tax. Direct SMPP binds ensure
                delivery certainty in milliseconds.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-outline-variant/20">
              <span className="font-mono text-[10px] text-brand font-semibold uppercase tracking-wider">
                LAYER: P2P MESSAGING
              </span>
            </div>
          </div>

          {/* Email Step */}
          <div className="wl-panel border border-outline-variant/40 p-8 rounded-md bg-paper flex flex-col justify-between hover:border-brand/30 transition-all shadow-sm">
            <div>
              <div
                className="w-12 h-12 bg-brand/10 rounded-full flex items-center justify-center mb-6 text-brand"
                aria-hidden="true"
              >
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="font-display italic text-xl text-ink mb-3">03. Email</h3>
              <p className="text-xs sm:text-sm text-ink/70 leading-relaxed">
                Sovereign SMTP infrastructure with dedicated IP warming and custom DKIM/SPF
                signatures for maximum inboxing.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-outline-variant/20">
              <span className="font-mono text-[10px] text-brand font-semibold uppercase tracking-wider">
                LAYER: AUTHENTICATED SMTP
              </span>
            </div>
          </div>
        </div>

        {/* Live Simulation Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center pt-8 border-t border-ink/[0.08]">
          <div className="lg:col-span-5 space-y-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand font-semibold">
              Platform Architecture
            </p>
            <h2 className="font-display italic text-3xl text-ink leading-tight">
              The Shared Interaction Timeline
            </h2>
            <p className="text-ink/75 text-sm sm:text-base leading-relaxed">
              In a traditional setup, if a customer calls a business and then sends an SMS, those
              are treated as separate tickets by separate software packages. Conversations get
              dropped, and customers have to repeat themselves.
            </p>
            <p className="text-ink/75 text-sm sm:text-base leading-relaxed">
              With Wireline, a customer profile maintains a single unified timeline. The agent that
              handles their email knows what they said on their phone call five minutes ago.
            </p>

            <div className="space-y-3 pt-2">
              {[
                "Persistent customer state across Phone, SMS, and Email",
                "Automatic context-handover without system gaps",
                "Instant database syncing for zero repetition",
              ].map((point) => (
                <div
                  key={point}
                  className="flex items-start gap-2.5 text-xs sm:text-sm text-ink/80"
                >
                  <div
                    className="w-5 h-5 rounded-sm bg-brand/10 flex items-center justify-center shrink-0 mt-0.5"
                    aria-hidden="true"
                  >
                    <Check className="w-3.5 h-3.5 text-brand" />
                  </div>
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="wl-panel border border-brand/20 bg-paper-warm/40 p-6 sm:p-8 space-y-6 rounded-md shadow-sm relative overflow-hidden paper-texture">
              <div className="absolute top-0 right-0 p-3 bg-brand/10 border-b border-l border-brand/20 rounded-bl-md">
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
                      <span className="font-semibold text-xs sm:text-sm text-ink">
                        10:04 AM · Inbound Call
                      </span>
                      <span className="font-mono text-[10px] text-brand bg-brand/10 px-1.5 py-0.5 rounded-sm">
                        Voice Agent
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-ink/70 mt-1">
                      Customer called Jordan (sales rep). Confirmed interest in Premium Fleet and
                      requested a quote.
                    </p>
                    <div className="bg-black/5 p-2.5 mt-2 rounded-sm text-xs italic text-ink/65 border border-ink/[0.05]">
                      "Sure, I'll send that quote over right now via SMS and email. What's your best
                      address?"
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
                      <span className="font-semibold text-xs sm:text-sm text-ink">
                        10:05 AM · Auto-SMS Delivery
                      </span>
                      <span className="font-mono text-[10px] text-brand bg-brand/10 px-1.5 py-0.5 rounded-sm">
                        SMS Agent
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-ink/70 mt-1">
                      Platform dispatched a secure link containing the quote payload, matching the
                      voice request.
                    </p>
                    <div className="bg-brand/5 p-2.5 mt-2 rounded-sm text-xs text-brand/90 border border-brand/10">
                      <strong>Outgoing SMS:</strong> "Hi Michael, here's your personalized quote:
                      wl.net/q/8b3f. Tap to approve."
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
                      <span className="font-semibold text-xs sm:text-sm text-ink">
                        10:06 AM · Contract Delivered
                      </span>
                      <span className="font-mono text-[10px] text-brand bg-brand/10 px-1.5 py-0.5 rounded-sm">
                        Email Agent
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-ink/70 mt-1">
                      Comprehensive proposal delivered with Stripe checkout link. Context inherited
                      from voice conversation.
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
        className="relative z-10 px-6 lg:px-12 py-20 scroll-mt-28 max-w-6xl mx-auto border-t border-ink/[0.08]"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 order-last lg:order-first">
            <div className="wl-panel border border-brand/20 bg-paper-warm/40 p-6 sm:p-8 rounded-md shadow-sm relative overflow-hidden paper-texture">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <span className="font-mono text-[11px] text-brand uppercase tracking-widest font-semibold">
                  iOS / CarPlay Architecture
                </span>
              </div>

              {/* Animated Siri SVG embedded */}
              <div className="relative w-full aspect-[4/3] max-w-md mx-auto mb-6 rounded-md overflow-hidden border border-brand/10 shadow-md">
                <svg
                  fill="none"
                  viewBox="0 0 400 300"
                  className="w-full h-full"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect fill="#f5f1e8" height="300" rx="8" width="400"></rect>
                  <circle
                    cx="200"
                    cy="120"
                    r="40"
                    stroke="#8b3fd6"
                    strokeDasharray="4 4"
                    strokeWidth="2"
                  ></circle>
                  <path
                    d="M180 120C180 110 220 110 220 120C220 130 180 130 180 120Z"
                    stroke="#8b3fd6"
                    strokeWidth="3"
                  >
                    <animate
                      attributeName="stroke-width"
                      dur="2s"
                      repeatCount="indefinite"
                      values="3;5;3"
                    ></animate>
                  </path>
                  <rect
                    height="40"
                    rx="4"
                    stroke="#1a1614"
                    strokeWidth="1.5"
                    width="60"
                    x="80"
                    y="200"
                  ></rect>
                  <path
                    d="M260 200V240M240 220H280"
                    stroke="#8b3fd6"
                    strokeLinecap="round"
                    strokeWidth="3"
                  ></path>
                  <text
                    fill="#1a1614"
                    fontFamily="sans-serif"
                    fontSize="12"
                    textAnchor="middle"
                    x="200"
                    y="270"
                  >
                    Hands-Free Siri Voice Protocol
                  </text>
                </svg>
              </div>

              <div className="space-y-6">
                {/* CarPlay interactive HUD */}
                <div className="bg-ink p-5 text-white font-sans rounded-md border border-white/10 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-brand flex items-center justify-center rounded-sm">
                        <Smartphone className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/90">
                        CarPlay Interactive HUD
                      </span>
                    </div>
                    <span className="text-[10px] text-white/50">WiFi Connecting</span>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3 bg-zinc-900 border border-white/10 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-brand">
                          Siri Trigger Event
                        </p>
                        <p className="text-xs font-semibold mt-0.5">
                          "Siri, ask Wireline to dial pharmacy..."
                        </p>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-brand animate-ping" />
                    </div>

                    <div className="p-3 bg-brand/10 border border-brand/30 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-brand font-semibold">
                          Active Outbound Dispatch
                        </p>
                        <p className="text-xs font-semibold mt-0.5">Calling Walgreens #4032</p>
                        <p className="text-[10px] text-white/70 mt-1">
                          Instruction: "Confirm prescription refilled"
                        </p>
                      </div>
                      <span className="font-mono text-[10px] text-brand">Pending...</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-paper-warm/20 border border-brand/10 rounded-sm">
                    <h5 className="font-display italic text-base text-ink mb-1">
                      Interactive Widgets
                    </h5>
                    <p className="text-xs text-ink/70 leading-relaxed">
                      Check your lock screen or home screen widget to see active call states and
                      live transcripts while driving.
                    </p>
                  </div>
                  <div className="p-4 bg-paper-warm/20 border border-brand/10 rounded-sm">
                    <h5 className="font-display italic text-base text-ink mb-1">
                      Direct Carrier Routing
                    </h5>
                    <p className="text-xs text-ink/70 leading-relaxed">
                      Zero middleware jank. Direct-to-carrier routing ensures crisp, HD audio with
                      sub-second model response times.
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
              Siri Hands-Free Integration
            </h2>
            <p className="text-ink/75 text-sm sm:text-base leading-relaxed">
              Designed for high-stakes environments — from critical surgical theaters to the
              driver's seat. Our voice engine interfaces directly with Apple's Siri, allowing
              medical professionals and logistics teams to trigger workflows entirely by voice.
            </p>
            <p className="text-ink/75 text-sm sm:text-base leading-relaxed">
              Ask Siri to trigger a custom Wireline workflow. Your fleet automatically places the
              call, coordinates with the client, updates your CRM, and displays the outcome on your
              iOS Widget immediately when you park.
            </p>

            <ul className="space-y-3 pt-2">
              {[
                "Low-latency voice-to-action",
                "Biometric-gated voice triggers",
                "Offline-first voice processing",
              ].map((point) => (
                <li
                  key={point}
                  className="flex items-center gap-2.5 text-xs sm:text-sm text-ink/80 font-medium"
                >
                  <div
                    className="w-5 h-5 rounded-sm bg-brand/10 flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <Check className="w-3.5 h-3.5 text-brand" />
                  </div>
                  <span>{point}</span>
                </li>
              ))}
            </ul>

            <div className="p-4 border-l-2 border-brand bg-brand/5 space-y-1 rounded-sm">
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
        className="relative z-10 px-6 lg:px-12 py-20 scroll-mt-28 max-w-6xl mx-auto border-t border-ink/[0.08] pb-24"
      >
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand font-semibold mb-2">
            The Complete Infrastructure
          </p>
          <h2 className="font-display italic text-3xl sm:text-4xl text-ink">
            A Core Voice Carrier & Software Layer
          </h2>
          <p className="text-ink/65 text-sm sm:text-base mt-3 leading-relaxed">
            Wireline is built on top of our own direct voice network. We cut out Twilio middleware
            to deliver premium call-center infrastructure directly to small shops and large fleets.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              title: "Direct Voice Carrier",
              body: "We peer directly with voice networks to maintain sub-second response speeds. No middlemen or Twilio API layer.",
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
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="wl-panel border border-ink/[0.08] bg-paper hover:border-brand/30 transition-all p-6 rounded-md group relative overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div
                    className="w-10 h-10 rounded-sm bg-brand/10 flex items-center justify-center shrink-0 mb-4 text-brand"
                    aria-hidden="true"
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-display italic text-lg text-ink leading-tight mb-2">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-ink/70 leading-relaxed">{item.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Call to Action */}
        <div className="mt-16 text-center">
          <ShadButton variant="editorial" size="lg" asChild>
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.25em] font-semibold"
            >
              Deploy Your First Agent <ArrowUpRight className="w-4 h-4" />
            </Link>
          </ShadButton>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
