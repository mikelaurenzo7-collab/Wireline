import { useEffect, useState } from "react";
import { Copy, ExternalLink, MessageSquareText, Sparkles, Terminal } from "lucide-react";

import { Button } from "../components/atoms";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

/**
 * Developer surface is MCP-first.
 * There is no Settings → API Access key minting surface today — session-cookie
 * product APIs and the account-bound MCP connector are the real contracts.
 */

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
      "Register Wireline as a remote MCP server in Cursor. Same OAuth + draft/simulate tools. No separate Cursor plugin package.",
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

          {/* A label, not a second headline: one screen carries one. */}
          <p id="mcp-apps-heading" className="wl-eyebrow mt-9 text-muted-foreground">
            Connect once
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {MCP_CLIENTS.map(({ title, description, action, href, icon: Icon }) => (
              <article
                key={title}
                className="wl-stitch-card flex flex-col items-center p-4 text-center"
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h3 className="wl-card-title">{title}</h3>
                </span>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
                <Button variant="outline" size="sm" asChild className="mt-3">
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {action} <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                  </a>
                </Button>
              </article>
            ))}
          </div>

          <div
            id="mcp-endpoint"
            className="mx-auto mt-4 max-w-3xl scroll-mt-28 rounded-xl border border-border bg-background p-4 text-left"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <code className="min-w-0 overflow-x-auto font-mono text-sm text-foreground">
                {mcpEndpoint}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="mr-1 h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy endpoint"}
              </Button>
            </div>
            {/* The auth model and the private-by-default boundary were a whole
                panel each, one of them headed by its own display line and a
                48px icon. They are two facts, and they read as two lines. */}
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Private-by-default boundary: this connector cannot place calls, send messages,
              provision numbers, or launch a live voice agent. MCP clients use OAuth PKCE against
              your Wireline account; the OpenAPI map documents the same session-authenticated
              product routes the web app uses. There is no separate public API-key product today.
            </p>
          </div>

          {/* What the connector actually exposes. The four boundaries used to
              sit two screens down under "Draft. Simulate. Continue in Studio",
              below a three-card "Connect. Draft. Launch." row that repeated the
              action already on each client card above. */}
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {MCP_BOUNDARIES.map((endpoint) => (
              <li
                key={endpoint.path}
                className="wl-stitch-card flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3 text-left"
              >
                <code className="rounded border border-brand/20 bg-brand/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                  {endpoint.path}
                </code>
                <span className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">
                  {endpoint.description}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
