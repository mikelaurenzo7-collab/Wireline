import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Code2,
  Copy,
  ExternalLink,
  KeyRound,
  ShieldCheck,
  Terminal,
  TerminalSquare,
} from "lucide-react";

import { Button } from "../components/atoms";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

const GETTING_STARTED = [
  {
    title: "1. Generate an API key",
    description:
      "Sign in, open Settings -> API Access, and create a key for your integration environment.",
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
    <MarketingPageFrame mainClassName="!px-0 pt-20 sm:pt-24 pb-0" scroll={false}>
      <PageMeta
        title="Developer Portal - Wireline"
        description="Wireline API documentation - OpenAPI spec, authentication guide, endpoint reference, and Swagger UI integration."
        path="/developers"
      />

      <div className="flex flex-col md:flex-row h-[calc(100vh-5rem)] overflow-hidden">
        <section className="w-full md:w-1/2 h-1/2 md:h-full overflow-y-auto border-b md:border-b-0 md:border-r border-outline-variant/30 bg-card">
          <div className="px-6 py-10 sm:px-8 max-w-2xl mx-auto space-y-12">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 border border-primary/20 bg-primary/5 rounded-sm mb-4">
                <Code2 className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.25em] text-primary font-semibold">
                  Core API v2.4
                </span>
              </div>
              <h1 className="font-display italic text-4xl sm:text-5xl text-foreground mb-4 leading-tight">
                Programmatic agents
              </h1>
              <p className="text-foreground/75 text-sm sm:text-base leading-relaxed">
                Provision agents, shape Training context, trigger live work, and retrieve call
                activity through the same API surface that powers Wireline.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" asChild>
                <a
                  href={openApiUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-foreground"
                >
                  <BookOpen className="w-4 h-4" /> OpenAPI Spec
                  <ExternalLink className="w-3 h-3 opacity-55" />
                </a>
              </Button>
              <Button variant="editorial" size="sm" asChild>
                <a
                  href={swaggerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  Try in Swagger UI
                  <ArrowRight className="w-4 h-4" />
                </a>
              </Button>
            </div>

            <div className="p-6 bg-card-warm/40 border border-brand/20 rounded-md shadow-sm paper-texture">
              <div className="flex items-center gap-2.5 mb-4">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <h2 className="font-display italic text-xl text-foreground">Authentication</h2>
              </div>
              <p className="text-foreground/75 text-xs sm:text-sm leading-relaxed mb-4">
                Every API request must include a Bearer token in the{" "}
                <code className="bg-brand/10 border border-brand/20 px-1.5 py-0.5 rounded font-mono text-[var(--wireline-typography-caption-size)] text-primary">
                  Authorization
                </code>{" "}
                header. Tokens are created in your dashboard under Settings {"->"} API Access.
              </p>
              <div className="bg-ink p-4 rounded-sm font-mono text-[var(--wireline-typography-caption-size)] text-white/90 overflow-x-auto border border-white/10">
                <code>Authorization: Bearer wl_YOUR_API_KEY</code>
              </div>
            </div>

            <div>
              <h2 className="font-display italic text-2xl text-foreground mb-6">Getting Started</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {GETTING_STARTED.map((step) => {
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.title}
                      className="border border-[var(--wireline-color-border-default)] p-4 bg-card rounded-sm"
                    >
                      <Icon className="w-5 h-5 text-primary mb-3" />
                      <h3 className="font-display italic text-base text-foreground mb-1">
                        {step.title}
                      </h3>
                      <p className="text-[var(--wireline-typography-caption-size)] text-foreground/70 leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pb-10">
              <h2 className="font-display italic text-2xl text-foreground mb-6">Key Endpoints</h2>
              <div className="border border-outline-variant/40 divide-y divide-outline-variant/30 rounded-md overflow-hidden bg-card shadow-sm">
                {ENDPOINTS.map((endpoint) => (
                  <div
                    key={endpoint.path}
                    className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4"
                  >
                    <code className="text-[var(--wireline-typography-caption-size)] font-mono text-primary font-semibold shrink-0 bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-sm">
                      {endpoint.path}
                    </code>
                    <span className="text-xs text-foreground/75">{endpoint.description}</span>
                  </div>
                ))}
              </div>
              <p className="text-center text-[var(--wireline-typography-overline-size)] text-foreground/50 mt-4 uppercase tracking-wider font-semibold">
                Full endpoint list available in the{" "}
                <a
                  href={openApiUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  OpenAPI spec
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="w-full md:w-1/2 h-1/2 md:h-full bg-ink relative overflow-hidden flex flex-col border-t md:border-t-0 border-outline-variant/30">
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />

          <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/5 z-10 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5" aria-hidden="true">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
              </div>
              <span className="font-mono text-[var(--wireline-typography-overline-size)] text-white/50 tracking-wider">
                bash - wireline-shell
              </span>
            </div>
            <span className="flex items-center gap-1.5 text-[var(--wireline-typography-overline-size)] text-primary font-mono font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
              LIVE CONNECTED
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-6 font-mono text-[var(--wireline-typography-caption-size)] space-y-6 z-10 text-white/90">
            <div>
              <div className="flex items-center gap-2 mb-2 text-primary">
                <Terminal className="w-3.5 h-3.5" />
                <span className="font-bold text-[var(--wireline-typography-overline-size)] uppercase tracking-wider">
                  Request Input
                </span>
              </div>
              <div className="bg-black/35 p-4 rounded-md border border-white/5 overflow-x-auto">
                <pre className="text-white/80 leading-relaxed">{curlCommand}</pre>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="editorial" size="sm" onClick={handleRunRequest}>
                RUN REQUEST
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="text-white bg-transparent border-white/20 hover:bg-white/5"
              >
                <Copy className="w-3.5 h-3.5 mr-1" />
                {copied ? "COPIED" : "COPY cURL"}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-white/55 text-[var(--wireline-typography-overline-size)] uppercase tracking-wider font-semibold">
                <span>Real-time Activity Logs</span>
                <span>Real-time</span>
              </div>
              <div className="bg-black/40 p-4 border border-white/5 rounded-md space-y-2 min-h-[140px]">
                {logs.map((log, index) => {
                  let badgeColor = "text-primary";
                  if (log.includes("[WARN]")) badgeColor = "text-[var(--wireline-color-status-warning)]";
                  return (
                    <p
                      key={`${log}-${index}`}
                      className="text-white/70 leading-relaxed font-mono text-xs"
                    >
                      <span className={badgeColor}>{log.substring(0, 7)}</span>
                      {log.substring(7)}
                    </p>
                  );
                })}
                <p className="animate-pulse text-primary font-bold">_</p>
              </div>
            </div>
          </div>

          <div className="px-4 py-2 bg-black/60 border-t border-white/5 text-[var(--wireline-typography-overline-size)] text-white/55 flex justify-between items-center z-10 font-mono">
            <div className="flex gap-4">
              <span>PATH: /api/agents</span>
              <span>LATENCY: 14ms</span>
            </div>
            <div>UTF-8 | JAVASCRIPT</div>
          </div>
        </section>
      </div>
    </MarketingPageFrame>
  );
}
