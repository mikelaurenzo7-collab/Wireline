import React from "react";
import { Link } from "react-router-dom";
import {
  PhoneCall,
  Smartphone,
  Settings,
  User,
  Mic,
  Globe,
  Activity,
  ArrowRight,
} from "lucide-react";
import { motion } from "motion/react";
import { PageMeta } from "../lib/page-meta";

export default function PersonalDashboard() {
  return (
    <div className="flex-1 min-h-0 scroll-viewport bg-card pt-8 pb-20 px-6 sm:px-10 lg:px-12">
      <PageMeta title="Personal Assistant — Wireline" />

      <div className="max-w-5xl mx-auto">
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <h1 className="font-display text-3xl font-semibold text-foreground">My Assistant</h1>
          </div>
          <p className="text-foreground/70 text-lg ml-13 leading-relaxed">
            Hand off the calls you keep putting off. Your assistant makes the call, waits on hold, and texts you what matters.
          </p>
        </header>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Agent Identity Module */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="wl-panel bg-card border border-ink/10 rounded-xl overflow-hidden shadow-sm"
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
                  className="text-brand text-sm font-semibold hover:underline flex items-center gap-1"
                >
                  Edit in Studio <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="p-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-foreground/55 mb-2">
                      Name
                    </p>
                    <p className="text-foreground font-medium">Jordan</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-foreground/55 mb-2">
                      Voice
                    </p>
                    <div className="flex items-center gap-2">
                      <Mic className="w-4 h-4 text-foreground/50" />
                      <span className="text-foreground font-medium">ElevenLabs - Professional</span>
                    </div>
                  </div>
                </div>
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-foreground/50 mb-3">
                    Greeting
                  </p>
                  <div className="pl-4 py-1 text-foreground/90 italic border-l-[3px] border-brand/40 text-sm leading-relaxed">
                    "Hi, you've reached Michael's personal AI assistant. He's unavailable right now,
                    but how can I help you?"
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Mobile Ecosystem Module */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="wl-panel bg-card border border-ink/10 rounded-xl overflow-hidden shadow-sm"
            >
              <div className="p-6 border-b border-ink/10 flex items-center gap-3">
                <div className="p-2 rounded-md bg-brand/5 text-brand">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h2 className="font-semibold text-lg">Mobile Ecosystem</h2>
              </div>
              <div className="p-6">
                <p className="text-foreground/80 leading-relaxed mb-6">
                  Use your assistant from your phone, your watch, or just by saying "Hey Siri, ask Wireline."
                </p>

                <div className="space-y-4">
                  {/* Voice Activation */}
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-ink/10 hover:border-brand/30 hover:bg-brand/[0.02] transition-colors">
                    <div className="mt-1 w-8 h-8 rounded-full bg-ink/5 flex items-center justify-center shrink-0">
                      <Mic className="w-4 h-4 text-foreground/60" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-foreground mb-1">Voice Activation</h3>
                      <p className="text-sm text-foreground/60">
                        Say "Hey Siri, Ask Wireline" to start a call hands-free — from your phone, AirPods, or car.
                      </p>
                    </div>
                    <Link to="/settings" className="px-4 py-2 bg-ink/5 hover:bg-ink/10 rounded-md text-sm font-semibold transition-colors shrink-0">
                      Set up
                    </Link>
                  </div>

                  {/* Notifications */}
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-ink/10 hover:border-brand/30 hover:bg-brand/[0.02] transition-colors">
                    <div className="mt-1 w-8 h-8 rounded-full bg-ink/5 flex items-center justify-center shrink-0">
                      <Globe className="w-4 h-4 text-foreground/60" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-foreground mb-1">Get Updates by Text</h3>
                      <p className="text-sm text-foreground/60">
                        Your assistant will text you the important details after every call. No app needed.
                      </p>
                    </div>
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
              className="wl-panel bg-card border border-ink/10 rounded-xl overflow-hidden shadow-sm"
            >
              <div className="p-5 border-b border-ink/10 flex items-center gap-3">
                <div className="p-2 rounded-md bg-brand/5 text-brand">
                  <PhoneCall className="w-4 h-4" />
                </div>
                <h2 className="font-semibold">Call Routing</h2>
              </div>
              <div className="p-5">
                <p className="text-sm text-foreground/80 leading-relaxed mb-4">
                  Forward missed calls to your assistant. They'll handle it and text you the summary.
                </p>
                <div className="p-4 bg-brand/5 rounded-md border border-brand/10 text-center mb-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand/70 mb-1.5">
                    Your Assistant's Number
                  </p>
                  <p className="font-mono text-xl font-semibold text-brand tracking-tight">
                    +1 (555) 019-8472
                  </p>
                </div>
                <button className="w-full py-2 bg-brand text-white rounded-md text-sm font-semibold shadow-sm hover:bg-brand-deep transition-colors">
                  Set Up Call Forwarding
                </button>
              </div>
            </motion.section>

            {/* Quick Stats Module */}
            <motion.section
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="wl-panel bg-card border border-ink/10 rounded-xl overflow-hidden shadow-sm"
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
                    <span className="text-sm text-foreground/80">Calls Handled Today</span>
                    <span className="font-semibold text-foreground">3</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground/80">Average Duration</span>
                    <span className="font-semibold text-foreground">1m 12s</span>
                  </div>
                  <Link
                    to="/ops"
                    className="block text-center w-full py-2.5 mt-3 bg-card-warm text-foreground border border-ink/10 hover:border-brand/30 hover:bg-brand/5 rounded-md text-sm font-semibold transition-colors"
                  >
                    View Activity
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
