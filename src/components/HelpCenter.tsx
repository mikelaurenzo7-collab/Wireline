import { Phone, ArrowRight, MessageCircle, BookOpen, ExternalLink, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { cn } from "../lib/utils";
import ClientRouteViewport from "./layout/ClientRouteViewport";
import ClientToolbar from "./layout/ClientToolbar";
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
import { OPS_HELP, WL_ADMIN_CLASSES } from "../lib/wireline-ops-design";

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
      data-demo={isDemo ? "true" : undefined}
      className={cn(
        "group relative block rounded-md p-4 transition-colors touch-press",
        WL_ADMIN_CLASSES.helpCard,
        isDemo && "border-dashed",
      )}
    >
      {isDemo && (
        <span
          className="absolute top-2 right-2 z-10 wl-label px-2 py-0.5 rounded-md bg-brand/10 border border-brand/30 text-brand-deep leading-none"
          title="Role-play demo line — not a real customer service number"
        >
          Demo
        </span>
      )}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-md bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
          <Phone className="w-4 h-4 text-brand" strokeWidth={2.4} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("wl-label-muted mb-1.5 truncate", isDemo && "pr-12")}>
            {agent.name} · {agent.role}
          </p>
          <p
            className={
              large
                ? "font-display italic text-xl leading-none text-foreground truncate"
                : "font-display italic text-lg leading-none text-foreground truncate"
            }
          >
            {agent.display}
          </p>
          {agent.scope && (
            <p className="chrome-subtle mt-2 leading-snug line-clamp-2 text-pretty">
              {agent.scope}
            </p>
          )}
        </div>
        <ArrowRight
          className={cn(
            "w-4 h-4 text-muted group-hover:text-brand group-hover:translate-x-1 transition-all shrink-0",
            isDemo ? "self-center" : "mt-1",
          )}
        />
      </div>
    </a>
  );
}

const helpActions = (
  <>
    <a
      href={WIRELINE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md wl-panel border border-border text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em] text-foreground/80 hover:text-foreground hover:border-brand/25 transition-colors touch-press"
    >
      <ExternalLink className="w-3.5 h-3.5" />
      trywireline.com
    </a>
    <a
      href={`mailto:${WIRELINE_SUPPORT_EMAIL}`}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md wl-panel border border-border text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em] text-foreground/80 hover:text-foreground hover:border-brand/25 transition-colors touch-press"
    >
      <MessageCircle className="w-3.5 h-3.5" />
      Email Mike
    </a>
  </>
);

export default function HelpCenter() {
  return (
    <ClientRouteViewport scroll>
      <ClientToolbar
        left={
          <span className="app-toolbar-stat">
            {OPS_HELP.stat(WIRELINE_CONTACT_AGENTS.length, WIRELINE_DEMO_AGENTS.length)}
          </span>
        }
        actions={helpActions}
      />
      <PageShell scrollable title="" eyebrow="" subtitle="">
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
              <p className="chrome-subtle mt-3 leading-relaxed text-pretty">
                Ria is the concierge line: ask for a use case and she will role-play it. The other
                demo lines are direct industry examples and will also answer Wireline product
                questions when asked.
              </p>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Quick paths" hint="Back into the product" icon={Compass}>
              <div className="space-y-2">
                {OPS_HELP.quickLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="group flex items-center justify-between gap-3 rounded-md border border-border bg-brand/[0.03] px-3 py-2.5 hover:border-brand/25 hover:bg-brand/[0.06] transition-colors"
                  >
                    <div className="min-w-0 text-left">
                      <p className="text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em] text-foreground/90">
                        {link.label}
                      </p>
                      <p className="text-[var(--wireline-typography-overline-size)] text-muted/75 mt-0.5 leading-snug">
                        {link.hint}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted group-hover:text-brand group-hover:translate-x-0.5 transition-all shrink-0" />
                  </Link>
                ))}
              </div>
            </Panel>

            <Panel title="What Wireline does" hint="Quick reference" icon={BookOpen}>
              <div className="space-y-3">
                {WIRELINE_FEATURES.map((f) => (
                  <div key={f.title}>
                    <p className="wl-label text-brand/90 mb-1">{f.title}</p>
                    <p className="text-[var(--wireline-typography-caption-size)] text-muted/80 leading-snug">
                      {f.blurb}
                    </p>
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
                    className="wl-label px-2 py-1 rounded-md bg-brand/[0.06] border border-border text-foreground/80 normal-case tracking-[0.18em]"
                  >
                    {i}
                  </span>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </PageShell>
    </ClientRouteViewport>
  );
}
