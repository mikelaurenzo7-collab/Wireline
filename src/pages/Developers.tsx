import { useEffect, useState } from "react";
import {
  BookOpen,
  Copy,
  ExternalLink,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";

import { Button } from "../components/atoms";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

/**
 * Developer surface is MCP-first.
 * There is no Settings → API Access key minting surface today — session-cookie
 * product APIs and the account-bound MCP connector are the real contracts.
 */

const GETTING_STARTED = [
  {
    title: "Connect an MCP client",
    description:
      "Add https://trywireline.com/mcp in ChatGPT, Claude, or Cursor. Sign in with your Wireline account via OAuth.",
    icon: Sparkles,
  },
  {
    title: "Draft and simulate privately",
    description:
      "Use account-bound tools to create or refine a private agent draft and run a private voice simulation before continuing in Wireline.",
    icon: MessageSquareText,
  },
  {
    title: "Finish in Studio",
    description:
      "Numbers, dialing, Training, billing, and launch stay in the Wireline web app. The connector never claims those actions happened.",
    icon: BookOpen,
  },
] as const;

const MCP_BOUNDARIES = [
  {
    path: "create_agent_draft / update_agent_draft",
    description: "Create or refine a private agent configuration draft in natural language.",
  },
  {
    path: "list_wireline_agents / get_wireline_workspace_summary",
    description: "Read account-scoped agents and a minimized workspace summary.",
  },
  {
    path: "start_private_voice_simulation",
    description: "Run a private voice simulation, not a live customer call.",
  },
  {
    path: "/api/openapi.json",
    description:
      "Machine-readable map of the session-authenticated product API used by the web app (not a public API-key product).",
  },
] as const;

const MCP_CLIENTS = [
  {
    title: "ChatGPT",
    description:
      "Create and refine a private voice agent draft, then run a private voice simulation before continuing in Wireline.",
    action: "Open ChatGPT apps",
    href: "https://chatgpt.com/",
    icon: MessageSquareText,
  },
  {
    title: "Claude",
    description:
      "Add Wireline as a remote connector to review or shape the same account-bound private drafts from Claude.",
    action: "Open Claude connectors",
    href: "https://claude.ai/settings/connectors",
    icon: Sparkles,
  },
  {
    title: "Cursor",
    description:
      "Register Wireline as a remote MCP server in Cursor. Same OAuth + draft/simulate tools — no separate Cursor plugin package.",
    action: "Cursor MCP docs",
    href: "https://docs.cursor.com/context/mcp",
    icon: Terminal,
  },
] as const;

export default function Developers() {
  const [copied, setCopied] = useState(false);

  const appOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://trywireline.com";
  const openApiUrl = `${appOrigin}/api/openapi.json`;
  const mcpEndpoint = "https://trywireline.com/mcp";

  const handleCopy = () => {
    void navigator.clipboard.writeText(mcpEndpoint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#mcp-endpoint") return;
    const node = document.getElementById("mcp-endpoint");
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
    handleCopy();
  }, []);

  return (
    <MarketingPageFrame>
      <PageMeta
        title="Developer Portal | Wireline"
        description="Wireline MCP apps for ChatGPT, Claude, and Cursor. Draft and simulate with an account bound connector, then continue in Studio. No public API keys."
        path="/developers"
      />

      {/* The hero shares the opening screen with the three clients it is about.
          On its own it was a headline and two links occupying a full viewport
          above the only thing a developer came here to see. */}
      <section
        className="marketing-section marketing-section--screen border-b border-border bg-card"
        aria-labelledby="mcp-apps-heading"
      >
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="marketing-hero-title mx-auto max-w-[20ch] text-[clamp(1.9rem,3.4vw,2.9rem)]">
            Bring Wireline into the tools you already use
          </h1>
          <div className="marketing-hero__actions mt-7">
            <a
              href="#mcp-endpoint"
              className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
            >
              View MCP Endpoint
            </a>
            <a
              href={openApiUrl}
              className="marketing-btn-secondary min-h-11 px-5 text-sm font-semibold"
            >
              OpenAPI Map
            </a>
          </div>

          <h2 id="mcp-apps-heading" className="wl-stitch-display mt-12 text-balance">
            Connect once
          </h2>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {MCP_CLIENTS.map(({ title, description, action, href, icon: Icon }) => (
              <article
                key={title}
                className="wl-stitch-card flex min-h-[15rem] flex-col items-center p-6 text-center"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full border border-border bg-background text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-[-.025em]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                <Button variant="outline" size="sm" asChild className="mt-auto">
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {action} <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                  </a>
                </Button>
              </article>
            ))}
          </div>

          <div
            id="mcp-endpoint"
            className="mx-auto mt-6 max-w-3xl scroll-mt-28 rounded-xl border border-border bg-background p-5"
          >
            <code className="block overflow-x-auto font-mono text-sm text-foreground">
              {mcpEndpoint}
            </code>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Private-by-default boundary: this connector cannot place calls, send messages,
              provision numbers, or launch a live voice agent.
            </p>
            <Button variant="outline" size="sm" onClick={handleCopy} className="mt-4">
              <Copy className="mr-1 h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy endpoint"}
            </Button>
          </div>
        </div>
      </section>

      <section className="marketing-section border-b border-border">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="wl-stitch-display text-balance">Connect. Draft. Launch</h2>
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
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="marketing-section border-b border-border bg-card">
        <div className="mx-auto max-w-4xl text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-border bg-background text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h2 className="wl-stitch-display mx-auto mt-5 max-w-[22ch] text-balance">
            OAuth for MCP. Session auth for the product API
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            MCP clients use OAuth PKCE against your Wireline account. The OpenAPI map documents the
            same session-authenticated product routes the web app uses. There is no separate public
            API-key product today.
          </p>
        </div>
      </section>

      <section className="marketing-section">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="wl-stitch-display text-balance">Draft. Simulate. Continue in Studio</h2>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {MCP_BOUNDARIES.map((endpoint) => (
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
                OpenAPI map <ExternalLink className="h-3.5 w-3.5 opacity-60" />
              </a>
            </Button>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
