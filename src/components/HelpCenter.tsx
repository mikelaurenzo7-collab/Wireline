import React from "react";
import { Phone, ArrowRight, MessageCircle, BookOpen, ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import PageShell, { Panel } from "./PageShell";
import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../data/contact-agents";
import {
  WIRELINE_URL,
  WIRELINE_SUPPORT_EMAIL,
  WIRELINE_FEATURES,
  WIRELINE_INTEGRATIONS,
} from "../data/wireline-knowledge";

function AgentCard({
  agent,
  large,
  isDemo,
}: {
  agent: ContactAgent;
  large?: boolean;
  isDemo?: boolean;
}) {
  return (
    <a
      href={`tel:${agent.tel}`}
      className={
        "group relative block rounded-2xl p-4 overflow-hidden hover:scale-[1.015] transition-all duration-200 " +
        (isDemo
          ? "border-2 border-dashed border-amber-500/40 hover:border-amber-500/70"
          : "border border-white/12 hover:border-white/28")
      }
      style={{
        background: `linear-gradient(135deg, ${agent.tint}2c, ${agent.tint}10)`,
        boxShadow: `0 10px 28px -14px ${agent.tint}88`,
      }}
    >
      {isDemo && (
        <span
          className="absolute top-2 right-2 z-10 text-[8px] uppercase tracking-[0.32em] px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-700 leading-none"
          title="Role-play demo line — not a real customer service number"
        >
          Demo
        </span>
      )}
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${agent.tint}, ${agent.tint}cc)`,
            boxShadow: `0 6px 14px -4px ${agent.tint}aa`,
          }}
        >
          <Phone className="w-4 h-4 text-paper" strokeWidth={2.4} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.32em] text-muted/80 leading-none mb-1.5 truncate">
            {agent.name} · {agent.role}
          </p>
          <p
            className={
              large
                ? "font-display italic text-xl leading-none text-ink truncate"
                : "font-display italic text-lg leading-none text-ink truncate"
            }
          >
            {agent.display}
          </p>
          {agent.scope && (
            <p className="text-[10px] text-muted/70 mt-2 leading-snug line-clamp-2">
              {agent.scope}
            </p>
          )}
        </div>
        <ArrowRight className="w-4 h-4 text-ink/40 group-hover:text-ink group-hover:translate-x-1 transition-all shrink-0 mt-1" />
      </div>
    </a>
  );
}

export default function HelpCenter() {
  return (
    <PageShell
      eyebrow="Help · Support"
      title="Reach the Wireline team"
      subtitle={`${WIRELINE_CONTACT_AGENTS.length} Wireline team lines plus ${WIRELINE_DEMO_AGENTS.length} demo roles. Team lines handle real support; demos show what agents can do for specific businesses.`}
      actions={
        <>
          <a
            href={WIRELINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg glass border border-white/10 text-[11px] uppercase tracking-[0.28em] text-ink/80 hover:text-ink hover:border-white/25 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            trywireline.com
          </a>
          <a
            href={`mailto:${WIRELINE_SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg glass border border-white/10 text-[11px] uppercase tracking-[0.28em] text-ink/80 hover:text-ink hover:border-white/25 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Email Mike
          </a>
        </>
      }
    >
      <div className="h-full overflow-y-auto pr-1">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 pb-4">
          <div className="xl:col-span-2 space-y-4">
            <Panel
              title={`Wireline team · ${WIRELINE_CONTACT_AGENTS.length} live lines`}
              hint="Tap to dial"
              icon={Phone}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3 gap-3">
                {WIRELINE_CONTACT_AGENTS.map((a, i) => (
                  <motion.div
                    key={a.tel}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.32 }}
                  >
                    <AgentCard agent={a} large />
                  </motion.div>
                ))}
              </div>
            </Panel>

            <Panel
              title={`Demo catalog · ${WIRELINE_DEMO_AGENTS.length} role-play agents`}
              hint="See what the platform can do"
              icon={Phone}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {WIRELINE_DEMO_AGENTS.map((a) => (
                  <AgentCard key={a.tel} agent={a} isDemo />
                ))}
              </div>
              <p className="text-[10px] text-muted/70 mt-3 leading-relaxed">
                Ria is the concierge line: ask for a use case and she will role-play it. The other
                demo lines are direct industry examples and will also answer Wireline product
                questions when asked.
              </p>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="What Wireline does" hint="Quick reference" icon={BookOpen}>
              <div className="space-y-3">
                {WIRELINE_FEATURES.map((f) => (
                  <div key={f.title}>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-brand/90 mb-1">
                      {f.title}
                    </p>
                    <p className="text-[12px] text-muted/80 leading-snug">{f.blurb}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="Integrations"
              hint={`${WIRELINE_INTEGRATIONS.length} wired`}
              icon={ExternalLink}
            >
              <div className="flex flex-wrap gap-1.5">
                {WIRELINE_INTEGRATIONS.map((i) => (
                  <span
                    key={i}
                    className="text-[10px] uppercase tracking-[0.22em] px-2 py-1 rounded-md bg-white/5 border border-white/10 text-ink/80"
                  >
                    {i}
                  </span>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
