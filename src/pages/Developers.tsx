import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, MessageSquareText, Terminal } from "lucide-react";

import { Button } from "../components/atoms";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

/**
 * Developer surface is MCP-first.
 * There is no Settings → API Access key minting surface today. Session-cookie
 * product APIs and the account-bound MCP connector are the real contracts.
 * Customer-facing product language is Bot. Technical MCP functions and records
 * retain agent where required by the existing API and data model.
 */

const MCP_BOUNDARIES = [
  {
    path: "create_agent_draft / update_agent_draft",
    description: "Create or refine a private Bot configuration draft in natural language.",
  },
  {
    path: "train_wireline_agent / get_agent_coaching_brief",
    description:
      "Coach the agent record behind a Bot: read owner-authored training, then persist a confirmed fact or rule into BotBound after the Apps toggle is on.",
  },
  {
    path: "list_wireline_agents / get_wireline_workspace_summary / get_wireline_agent_status",
    description:
      "Read account-scoped agent records, Bot readiness, next steps, and a minimized workspace summary.",
  },
  {
    path: "start_private_voice_simulation / run_private_agent_turn",
    description: "Private agent-runtime rehearsal for a Bot, not a live customer call.",
  },
  {
    path: "/api/openapi.json",
    description:
      "Machine-readable map of the session-authenticated product API used by the web app, not a public API-key product.",
  },
] as const;

const MCP_CLIENTS = [
  {
    title: "ChatGPT",
    description:
      "Create a BotBound account, then draft and privately rehearse your first Phone Bot.",
    action: "Open ChatGPT Apps",
    href: "https://chatgpt.com/",
    icon: MessageSquareText,
  },
  {
    title: "Cursor",
    description:
      "Install the Cursor Directory plugin or add the BotBound MCP endpoint. New users create a BotBound account, then build their first Phone Bot.",
    action: "Add to Cursor",
    href: "cursor://anysphere.cursor-deeplink/mcp/install?name=botbound&config=eyJ1cmwiOiJodHRwczovL2JvdGJvdW5kLmFwcC9tY3AifQ==",
    icon: Terminal,
  },
] as const;

export default function Developers() {
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const copyTimer = useRef<number | null>(null);
  const mounted = useRef(true);

  const appOrigin = typeof window !== "undefined" ? window.location.origin : "https://botbound.app";
  const openApiUrl = `${appOrigin}/api/openapi.json`;
  const mcpEndpoint = `${appOrigin}/mcp`;

  const handleCopy = useCallback(async () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(mcpEndpoint);
      if (!mounted.current) return;
      setCopyState("copied");
      copyTimer.current = window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      if (mounted.current) setCopyState("error");
    }
  }, [mcpEndpoint]);

  useEffect(() => {
    mounted.current = true;
    if (window.location.hash === "#mcp-endpoint") {
      document
        .getElementById("mcp-endpoint")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return () => {
      mounted.current = false;
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  return (
    <MarketingPageFrame>
      <PageMeta
        title="Developer Portal | BotBound"
        description="Connect BotBound to ChatGPT and Cursor. Create an account, build your first Phone Bot in the chat you already use, then continue in the same BotBound workspace. No public API keys."
        path="/developers"
      />

      <section
        className="marketing-section marketing-section--screen border-b border-border"
        aria-labelledby="mcp-apps-heading"
      >
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="marketing-hero-title mx-auto max-w-[20ch] text-[clamp(1.9rem,3.4vw,2.9rem)]">
            Bring BotBound into the Tools You Already Use
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

          <h2 id="mcp-apps-heading" className="wl-eyebrow mt-9 text-muted-foreground">
            Connect Once
          </h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {MCP_CLIENTS.map(({ title, description, action, href, icon: Icon }) => (
              <article
                key={title}
                className="wl-stitch-card flex flex-col items-center p-4 text-center"
              >
                <span className="wl-accent-icon-chip mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <h3 className="wl-card-title">{title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
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
              <code className="min-w-0 select-text overflow-x-auto font-mono text-sm text-foreground">
                {mcpEndpoint}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={copyState === "copying"}
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                {copyState === "copied"
                  ? "Copied"
                  : copyState === "copying"
                    ? "Copying…"
                    : "Copy Endpoint"}
              </Button>
            </div>
            <p role="status" aria-live="polite" className="mt-2 text-sm text-muted-foreground">
              {copyState === "error"
                ? "Couldn't copy. Select the endpoint to copy it manually."
                : copyState === "copied"
                  ? "Endpoint copied."
                  : ""}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Connected apps help new users create a BotBound account and build their first Phone
              Bot. This connector cannot place calls, send messages, provision numbers, or launch a
              live Bot. Training writes land only after you enable them in Apps and confirm each
              change. There is no public API-key product and no repo voice SDK.
            </p>
          </div>

          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {MCP_BOUNDARIES.map((endpoint) => (
              <li
                key={endpoint.path}
                className="wl-stitch-card flex min-w-0 flex-col items-start gap-3 p-4 text-left"
              >
                <code className="max-w-full whitespace-normal break-words rounded border border-brand/20 bg-brand/10 px-2 py-1 font-mono text-xs font-semibold leading-5 text-primary [overflow-wrap:anywhere]">
                  {endpoint.path}
                </code>
                <span className="text-sm leading-6 text-muted-foreground">
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
