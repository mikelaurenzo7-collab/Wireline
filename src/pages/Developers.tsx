import { useState } from "react";
import {
  BookOpen,
  Copy,
  ExternalLink,
  KeyRound,
  ShieldCheck,
  Terminal,
  TerminalSquare,
} from "lucide-react";

import { Button } from "../components/atoms";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import MarketingHero from "../components/marketing/MarketingHero";
import { PageMeta } from "../lib/page-meta";

const GETTING_STARTED = [
  {
    title: "Generate an API key",
    description:
      "Sign in, open Settings -> API Access, and create a key for your integration environment.",
    icon: KeyRound,
  },
  {
    title: "Make your first request",
    description:
      "Send the key in the Authorization header and call an endpoint like /api/agents or /api/calls.",
    icon: TerminalSquare,
  },
  {
    title: "Explore the schema",
    description:
      "Use the OpenAPI spec or Swagger UI to inspect request and response shapes before you automate.",
    icon: BookOpen,
  },
] as const;

const ENDPOINTS = [
  {
    path: "/api/agents",
    description: "List agents or create a new agent configuration.",
  },
  { path: "/api/calls", description: "Queue outbound calls and retrieve call activity." },
  { path: "/api/campaigns", description: "Manage campaign definitions for outreach programs." },
  { path: "/api/billing/plans", description: "Retrieve capacity tiers and billing configuration." },
  { path: "/api/openapi.json", description: "Download the machine-readable API contract." },
] as const;

export default function Developers() {
  const [logs, setLogs] = useState<string[]>([
    "[INFO] Initializing agent connection...",
    "[INFO] Voice session established with high-fidelity provider...",
    "[DATA] Syncing Training context: 42 approved facts and policies...",
    "[INFO] Route verification complete: agent ready to handle calls.",
  ]);
  const [copied, setCopied] = useState(false);

  const appOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://trywireline.com";
  const openApiUrl = `${appOrigin}/api/openapi.json`;
  const swaggerUrl = `https://petstore.swagger.io/?url=${encodeURIComponent(openApiUrl)}`;
  const curlCommand = `curl -X GET '${appOrigin}/api/agents' \\\n  -H 'Authorization: Bearer wl_YOUR_API_KEY'`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(curlCommand);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleRunRequest = () => {
    const newLogs = [
      ...logs,
      `[DATA] Inbound request received at ${new Date().toLocaleTimeString()} - Status 200 OK`,
      "[INFO] Agent state synchronized successfully.",
    ];
    if (newLogs.length > 8) newLogs.shift();
    setLogs(newLogs);
  };

  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-16">
      <PageMeta
        title="Developer Portal - Wireline"
        description="Wireline API documentation - OpenAPI spec, authentication guide, endpoint reference, and Swagger UI integration."
        path="/developers"
      />

      <MarketingHero
        eyebrow="Developer API"
        title="Build on Wireline without building around it."
        description="Provision agents, shape approved Training context, trigger live work, and retrieve call outcomes through the same API surface that powers Wireline."
        primaryAction={{ label: "OpenAPI spec", to: openApiUrl }}
        secondaryAction={{ label: "Try in Swagger UI", to: swaggerUrl, tone: "secondary" }}
        proof={["Bearer authentication", "OpenAPI contract", "Live request feedback"]}
      />

      <section className="border-b border-border px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="wl-stitch-eyebrow">Getting started</p>
            <h2 className="wl-stitch-display mt-3 text-balance">One contract. Three clear steps.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Create a scoped key, make one request, then expand only after the response shape is
              proven.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {GETTING_STARTED.map((step, index) => {
              const Icon = step.icon;
              return (
                <article
                  key={step.title}
                  className="wl-stitch-card flex min-h-[13rem] flex-col items-center p-6 text-center"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-border bg-muted text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="wl-overline mt-5 text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold tracking-[-.025em]">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-card px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
        <div className="mx-auto max-w-4xl text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-border bg-background text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <p className="wl-stitch-eyebrow mt-5">Authentication</p>
          <h2 className="wl-stitch-display mx-auto mt-3 max-w-[18ch] text-balance">
            A scoped bearer token on every request.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            Create tokens in Settings -&gt; API Access and keep each environment isolated. Never
            place a Wireline API key in a client bundle.
          </p>
          <div className="mx-auto mt-7 max-w-2xl overflow-x-auto rounded-xl border border-white/10 bg-ink p-4 text-left font-mono text-sm text-white/90">
            <code>Authorization: Bearer wl_YOUR_API_KEY</code>
          </div>
        </div>
      </section>

      <section className="border-b border-border px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="wl-stitch-eyebrow">Key endpoints</p>
            <h2 className="wl-stitch-display mt-3 text-balance">A small surface for real work.</h2>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ENDPOINTS.map((endpoint) => (
              <article key={endpoint.path} className="wl-stitch-card p-5 text-center">
                <code className="inline-flex rounded border border-brand/20 bg-brand/10 px-2 py-1 font-mono text-xs font-semibold text-primary">
                  {endpoint.path}
                </code>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {endpoint.description}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-8 flex justify-center">
            <Button variant="outline" size="sm" asChild>
              <a
                href={openApiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-foreground"
              >
                Full endpoint list <ExternalLink className="h-3.5 w-3.5 opacity-60" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="wl-stitch-eyebrow">Live request preview</p>
            <h2 className="wl-stitch-display mt-3 text-balance">Run the request. Read the result.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
              The preview is local to this page and demonstrates the request-and-response rhythm
              without exposing a credential.
            </p>
          </div>

          <div className="marketing-ink-panel mx-auto mt-10 max-w-5xl overflow-hidden rounded-[22px]">
            <div className="flex flex-wrap items-center justify-center gap-3 border-b border-white/10 bg-black/30 px-5 py-4 text-center">
              <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[.12em] text-white/70">
                <Terminal className="h-4 w-4 text-primary" />
                Wireline shell
              </span>
              <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[.12em] text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                Live connected
              </span>
            </div>

            <div className="space-y-7 p-5 sm:p-7">
              <div>
                <p className="text-center font-mono text-xs font-semibold uppercase tracking-[.12em] text-primary">
                  Request input
                </p>
                <div className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/35 p-4 text-left">
                  <pre className="font-mono text-xs leading-6 text-white/80">{curlCommand}</pre>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="editorial" size="sm" onClick={handleRunRequest}>
                  Run request
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="border-white/20 bg-transparent text-white hover:bg-white/5"
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  {copied ? "Copied" : "Copy cURL"}
                </Button>
              </div>

              <div>
                <p className="text-center font-mono text-xs font-semibold uppercase tracking-[.12em] text-white/60">
                  Activity log
                </p>
                <div className="mt-3 min-h-[10rem] space-y-2 rounded-xl border border-white/10 bg-black/40 p-4 text-left">
                  {logs.map((log, index) => (
                    <p
                      key={`${log}-${index}`}
                      className="font-mono text-xs leading-6 text-white/70"
                    >
                      <span className="text-primary">{log.substring(0, 7)}</span>
                      {log.substring(7)}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
