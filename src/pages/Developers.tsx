import React from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import {
  ArrowRight,
  BookOpen,
  Code2,
  ExternalLink,
  KeyRound,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { SectionHeader } from "../components/ui/SectionHeader";

const GETTING_STARTED = [
  {
    title: "1. Generate an API key",
    description:
      "Sign in, open Settings → API Access, and create a key for your integration environment.",
    icon: KeyRound,
  },
  {
    title: "2. Make your first request",
    description:
      "Send the key in the Authorization header and call an endpoint like /api/agents or /api/calls.",
    icon: TerminalSquare,
  },
  {
    title: "3. Explore the schema",
    description:
      "Use the OpenAPI spec or Swagger UI to inspect request and response shapes before you automate.",
    icon: BookOpen,
  },
];

const ENDPOINTS = [
  { path: "/api/agents", description: "List voice agents or create a new agent configuration." },
  { path: "/api/calls", description: "Queue outbound calls and retrieve call activity." },
  { path: "/api/campaigns", description: "Manage campaign definitions for outreach programs." },
  { path: "/api/billing/plans", description: "Retrieve available pricing plans." },
  { path: "/api/openapi.json", description: "Download the machine-readable API contract." },
];

export default function Developers() {
  const appOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://trywireline.com";
  const openApiUrl = `${appOrigin}/api/openapi.json`;
  const swaggerUrl = `https://petstore.swagger.io/?url=${encodeURIComponent(openApiUrl)}`;

  return (
    <MarketingPageFrame mainClassName="!px-0 pt-20 sm:pt-24 pb-0">
      <PageMeta
        title="Developer Portal"
        description="Wireline API documentation — OpenAPI spec, authentication guide, endpoint reference, and Swagger UI integration."
        path="/developers"
      />

      {/* Hero */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-10 xl:px-14 pt-4 sm:pt-6 pb-10 max-w-5xl mx-auto text-center">
        <SectionHeader
          eyebrow="Developer Portal"
          title="Build on Wireline"
          description="Pull the live OpenAPI contract, authenticate with dashboard-issued API keys, and automate voice agents, calls, and campaigns from your own systems."
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.6 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <a
            href={openApiUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 text-[11px] uppercase tracking-[0.30em] font-medium border border-white/15 text-ink hover:border-white/30 hover:bg-white/5 transition-all"
          >
            <BookOpen className="w-4 h-4" /> OpenAPI Spec
            <ExternalLink className="w-3 h-3 opacity-50" />
          </a>
          <a
            href={swaggerUrl}
            target="_blank"
            rel="noreferrer"
            className="marketing-btn-primary"
          >
            Try in Swagger UI
            <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>
      </section>

      {/* Authentication */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto pb-12">
        <div className="border border-white/8 p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-brand" />
            <h2 className="font-display italic text-2xl text-ink">Authentication</h2>
          </div>
          <p className="text-muted/85 text-sm leading-relaxed mb-4">
            Every API request must include a ****** in the{" "}
            <code className="text-ink/90 bg-white/5 px-1.5 py-0.5 text-xs">Authorization</code>{" "}
            header. Tokens are created in your dashboard under Settings → API Access.
          </p>
          <div className="bg-black/30 border border-white/8 p-4 font-mono text-xs text-emerald-400 overflow-x-auto">
            <code>
              curl -X GET &apos;{appOrigin}/api/agents&apos; \<br />
              {"  "}-H &apos;Authorization: ******;
            </code>
          </div>
        </div>
      </section>

      {/* Getting Started */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto pb-12">
        <SectionHeader
          title="Getting Started"
          className="mb-6 text-center"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {GETTING_STARTED.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="border border-white/8 p-5">
                <Icon className="w-6 h-6 text-brand mb-3" />
                <h3 className="font-display italic text-lg text-ink mb-2">{step.title}</h3>
                <p className="text-[12px] text-muted/85 leading-relaxed">{step.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Endpoint Reference */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto pb-16">
        <SectionHeader
          title="Key Endpoints"
          className="mb-6 text-center"
        />
        <div className="border border-white/8 divide-y divide-white/5">
          {ENDPOINTS.map((ep) => (
            <div
              key={ep.path}
              className="flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-4"
            >
              <code className="text-xs font-mono text-brand shrink-0 bg-brand/10 px-2 py-1">
                {ep.path}
              </code>
              <span className="text-[12px] text-muted/85">{ep.description}</span>
            </div>
          ))}
        </div>
        <p className="text-center text-[11px] text-muted mt-4">
          Full endpoint list available in the{" "}
          <a
            href={openApiUrl}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            OpenAPI spec
          </a>
          .
        </p>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto pb-20 text-center">
        <div className="border border-white/8 p-8">
          <h2 className="font-display italic text-2xl text-ink mb-3">Ready to integrate?</h2>
          <p className="text-muted/80 text-sm mb-6 max-w-md mx-auto">
            Sign in to generate your API key, or explore the spec in Swagger UI to plan your
            integration.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/login"
              className="marketing-btn-primary"
            >
              Sign in <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href={swaggerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 text-[11px] uppercase tracking-[0.30em] font-medium border border-white/15 text-ink hover:border-white/30"
            >
              Swagger UI <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
