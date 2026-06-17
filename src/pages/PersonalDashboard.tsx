import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  PhoneCall, Smartphone, Settings, User, Mic, Globe, Activity,
  ArrowRight, Ban, Calendar, Package, Copy, Check,
} from "lucide-react";
import { motion } from "motion/react";
import { PageMeta } from "../lib/page-meta";
import { ShadButton } from "../components/ui/shadcn/ShadButton";

const SCENARIOS = [
  { icon: Mic, label: "Hey Siri, have Wireline call the pharmacy", outcome: "Done in 40s", color: "text-brand" },
  { icon: Calendar, label: "Dr. Allen's office calling", outcome: "Rescheduled Thu 2pm", color: "text-brand" },
  { icon: Ban, label: "Unknown caller — spam likely", outcome: "Blocked politely", color: "text-brand" },
  { icon: Package, label: "DoorDash driver calling", outcome: "Gave gate code #4821", color: "text-brand" },
] as const;

function SiriUrlChip() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 block bg-ink/5 px-3 py-2 rounded-sm text-xs font-mono text-ink/80 break-all select-all">
        wireline://ask
      </code>
      <ShadButton
        variant="ghost"
        size="sm"
        onClick={() => {
          navigator.clipboard?.writeText("wireline://ask");
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0"
        aria-label="Copy URL scheme"
      >
        {copied ? <Check className="w-4 h-4 text-brand" /> : <Copy className="w-4 h-4" />}
      </ShadButton>
    </div>
  );
}

export default function PersonalDashboard() {
  return (
    <div className="flex-1 min-h-0 scroll-viewport bg-paper pt-8 pb-20 px-6 sm:px-10 lg:px-12">
      <PageMeta title="Personal Assistant — Wireline" />

      <div className="max-w-5xl mx-auto">
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <h1 className="font-display text-3xl font-semibold text-ink">My Assistant</h1>
          </div>
          <p className="text-ink/70 text-lg leading-relaxed mt-1">
            Manage your personal AI, phone number, and mobile integrations.
          </p>
        </header>

        {/* Scenario strip */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 wl-panel border border-ink/10 bg-paper rounded-md overflow-hidden shadow-sm"
        >
          <div className="px-6 py-4 border-b border-ink/10">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
              What Aria handled
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-ink/8">
            {SCENARIOS.map(({ icon: Icon, label, outcome }) => (
              <div key={label} className="px-5 py-4 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-brand">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink/50">{outcome}</span>
                </div>
                <p className="text-sm text-ink/80 italic leading-snug">"{label}"</p>
              </div>
            ))}
          </div>
        </motion.section>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Agent Identity Module */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="wl-panel bg-paper border border-ink/10 rounded-md overflow-hidden shadow-sm"
            >
              <div className="p-6 border-b border-ink/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-brand/5 text-brand">
                    <Settings className="w-5 h-5" />
                  </div>
                  <h2 className="font-semibold text-lg">Agent Identity</h2>
                </div>
                <Link
                  to="/agents"
                  className="text-brand text-sm font-semibold hover:underline flex items-center gap-1 transition-colors"
                >
                  Edit in Studio <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="p-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-2">
                      Name
                    </p>
                    <p className="text-ink font-medium">Jordan</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-2">
                      Voice
                    </p>
                    <div className="flex items-center gap-2">
                      <Mic className="w-4 h-4 text-ink/50" />
                      <span className="text-ink font-medium">ElevenLabs — Professional</span>
                    </div>
                  </div>
                </div>
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink/50 mb-3">
                    Greeting
                  </p>
                  <div className="pl-4 py-1 text-ink/90 italic border-l-[3px] border-brand/40 text-sm leading-relaxed">
                    "Hi, you've reached Michael's personal AI assistant. He's unavailable right
                    now — how can I help you?"
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Mobile Ecosystem Module */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="wl-panel bg-paper border border-ink/10 rounded-md overflow-hidden shadow-sm"
            >
              <div className="p-6 border-b border-ink/10 flex items-center gap-3">
                <div className="p-2 rounded-md bg-brand/5 text-brand">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h2 className="font-semibold text-lg">Mobile Ecosystem</h2>
              </div>
              <div className="p-6">
                <p className="text-ink/80 leading-relaxed mb-6">
                  Take your assistant everywhere. Set up Siri Shortcuts and download the native
                  apps for a seamless experience.
                </p>

                <div className="space-y-4">
                  {/* Siri Setup */}
                  <div className="flex items-start gap-4 p-4 rounded-md border border-ink/10 hover:border-brand/30 hover:bg-brand/[0.02] transition-colors">
                    <div className="mt-1 w-8 h-8 rounded-full bg-ink/5 flex items-center justify-center shrink-0">
                      <Mic className="w-4 h-4 text-ink/60" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-ink mb-1">Siri Shortcuts</h3>
                      <p className="text-sm text-ink/60 mb-3">
                        Say{" "}
                        <span className="italic font-medium text-ink/80">
                          "Hey Siri, Ask Wireline"
                        </span>{" "}
                        to instantly talk to your agent from your lock screen, AirPods, or CarPlay.
                      </p>
                      <SiriUrlChip />
                      <p className="text-[11px] text-ink/50 mt-2">
                        Create a new shortcut in the Apple Shortcuts app using this URL scheme.
                      </p>
                    </div>
                  </div>

                  {/* App Download */}
                  <div className="flex items-start gap-4 p-4 rounded-md border border-ink/10 hover:border-brand/30 hover:bg-brand/[0.02] transition-colors">
                    <div className="mt-1 w-8 h-8 rounded-full bg-ink/5 flex items-center justify-center shrink-0">
                      <Globe className="w-4 h-4 text-ink/60" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-ink mb-1">Native Apps & Widgets</h3>
                      <p className="text-sm text-ink/60">
                        Download the iOS or Android app to get interactive lock screen widgets,
                        push notifications for important calls, and instant access to transcripts.
                      </p>
                    </div>
                    <ShadButton variant="outline" size="sm" className="shrink-0">
                      Send Link
                    </ShadButton>
                  </div>
                </div>
              </div>
            </motion.section>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Phone Number Module */}
            <motion.section
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="wl-panel bg-paper border border-ink/10 rounded-md overflow-hidden shadow-sm"
            >
              <div className="p-5 border-b border-ink/10 flex items-center gap-3">
                <div className="p-2 rounded-md bg-brand/5 text-brand">
                  <PhoneCall className="w-4 h-4" />
                </div>
                <h2 className="font-semibold">Call Routing</h2>
              </div>
              <div className="p-5">
                <p className="text-sm text-ink/80 leading-relaxed mb-4">
                  Unanswered calls from your personal cell forward to Jordan automatically — only
                  when you don't pick up.
                </p>
                <div className="p-4 bg-brand/5 rounded-md border border-brand/10 text-center mb-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand/70 mb-1.5">
                    Your Wireline Number
                  </p>
                  <p className="font-mono text-xl font-semibold text-brand tracking-tight">
                    +1 (555) 019-8472
                  </p>
                </div>
                <ShadButton variant="editorial" className="w-full">
                  Setup Conditional Forwarding
                </ShadButton>
              </div>
            </motion.section>

            {/* Quick Stats Module */}
            <motion.section
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="wl-panel bg-paper border border-ink/10 rounded-md overflow-hidden shadow-sm"
            >
              <div className="p-5 border-b border-ink/10 flex items-center gap-3">
                <div className="p-2 rounded-md bg-brand/5 text-brand">
                  <Activity className="w-4 h-4" />
                </div>
                <h2 className="font-semibold">Recent Activity</h2>
              </div>
              <div className="p-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink/80">Calls Handled Today</span>
                    <span className="font-semibold text-ink">3</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink/80">Spam Blocked This Month</span>
                    <span className="font-semibold text-ink">41</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink/80">Average Duration</span>
                    <span className="font-semibold text-ink">1m 12s</span>
                  </div>
                  <Link
                    to="/contact"
                    className="block text-center w-full py-2.5 mt-3 bg-paper-warm text-ink border border-ink/10 hover:border-brand/30 hover:bg-brand/5 rounded-md text-sm font-semibold transition-colors"
                  >
                    View Call Logs
                  </Link>
                </div>
              </div>
            </motion.section>
          </div>
        </div>
      </div>
    </div>
  );
}
