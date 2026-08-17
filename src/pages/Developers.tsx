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
    path: "train_wireline_agent / get_agent_coaching_brief",
    description:
      "Coach an agent: read owner-authored Training, then persist a confirmed fact or rule into Wireline after the Apps toggle is on.",
  },
  {
    path: "list_wireline_agents / get_wireline_workspace_summary / get_wireline_agent_status",
    description: "Read account-scoped agents, next steps, and a minimized workspace summary.",
  },
  {
    path: "start_private_voice_simulation / run_private_agent_turn",
    description: "Private rehearsal, not a live customer call.",
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
      "Coach a Wireline voice agent: draft, privately rehearse, and persist Training that lands in the workspace.",
    action: "Open ChatGPT apps",
    href: "https://chatgpt.com/",
    icon: MessageSquareText,
  },
  {
    title: "Claude",
    description:
      "Add Wireline as a remote connector, or find it in the Connectors Directory after publication, to coach the same account-bound agents.",
    action: "Open Claude connectors",
    href: "https://claude.ai/settings/connectors",
    icon: Sparkles,
  },
  {
    title: "Cursor",
    description:
      "Install the Cursor Directory plugin or add https://trywireline.com/mcp. Same OAuth coach/manager tools. New users create a Wireline account first.",
    action: "Cursor plugin docs",
    href: "https://trywireline.com/cursor-plugin.html",
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
        description="Wireline MCP apps for ChatGPT, Claude, and Cursor. Create an account, build your first voice agent in the chat you already use, then continue in Studio. No public API keys."
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
        </div>
      </section>

      <section className="marketing-section marketing-section--screen">
        <div className="mx-auto max-w-5xl">
          <div
            id="mcp-endpoint"
            className="mx-auto max-w-3xl scroll-mt-28 rounded-xl border border-border bg-background p-4 text-left"
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
              Connected apps help new users create a Wireline account and build their first voice
              agent. This connector cannot place calls, send messages, provision numbers, or launch
              a live voice agent. Training writes land only after you enable them in Apps and
              confirm each change. There is no public API-key product and no repo voice SDK.
            </p>
          </div>

          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
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
