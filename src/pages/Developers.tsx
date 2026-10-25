import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, MessageSquareText, Sparkles, Terminal } from "lucide-react";

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

const MCP_TOOL_GROUPS = [
  {
    title: "Draft a Bot",
    description: "Describe what you need and refine it in plain language.",
    tools: ["create_agent_draft", "update_agent_draft"],
  },
  {
    title: "Rehearse Privately",
    description: "Try a conversation or a voice run. No live calls are placed.",
    tools: ["run_private_agent_turn", "start_private_voice_simulation"],
  },
  {
    title: "Check Status",
    description: "See your bots, what they need next, and a workspace summary.",
    tools: ["list_botbound_agents", "get_botbound_agent_status", "get_botbound_workspace_summary"],
  },
  {
    title: "Teach Your Bot",
    description: "Add a fact or rule you confirm. Turn on Apps access first.",
    tools: ["get_agent_coaching_brief", "train_botbound_agent"],
  },
] as const;

const MCP_CLIENTS = [
  {
    title: "ChatGPT",
    description:
      "In ChatGPT web, add the endpoint below from Plugins using OAuth with CIMD. Full Bot actions require Business, Enterprise, or Edu access and workspace permission.",
    action: "ChatGPT Setup Guide",
    href: "https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt",
    icon: MessageSquareText,
  },
  {
    title: "Claude",
    description:
      "Add BotBound as a custom connector in Claude with the MCP endpoint below, or run claude mcp add in Claude Code. Sign in, then build and privately rehearse your Bot.",
    action: "Open Claude Connectors",
    href: "https://claude.ai/settings/connectors",
    icon: Sparkles,
  },
  {
    title: "Cursor",
    description:
      "Add the BotBound MCP endpoint with the install link below, or use Cursor Directory when listed. Sign in, then build and privately rehearse your Bot.",
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
    <MarketingPageFrame className="wl-developers-page">
      <PageMeta
        title="Developers | BotBound"
        description="Connect BotBound to ChatGPT, Claude, and Cursor. Create an account, build your first phone bot in the chat you already use, then continue in the same BotBound workspace. No public API keys."
        path="/developers"
      />

      <section
        className="marketing-section marketing-section--screen border-b border-border"
        aria-labelledby="mcp-apps-heading"
      >
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="marketing-hero-title mx-auto">Build Your Bot Where You Work</h1>
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

          <h2 id="mcp-apps-heading" className="mt-9 text-lg font-semibold text-foreground">
            Connect Once
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {MCP_CLIENTS.map(({ title, description, action, href, icon: Icon }) => (
              <article
                key={title}
                className="wl-stitch-card flex flex-col items-center p-4 text-center"
              >
                <span className="wl-accent-icon-chip mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <h3 className="wl-card-title wl-preserve-case">{title}</h3>
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
              Build, privately rehearse, and review your Bot from ChatGPT, Claude, or Cursor.
              Training writes require the Apps toggle and your confirmation. Continue in BotBound
              for live phone numbers, email, and cloud computer tasks on eligible paid plans.
            </p>
          </div>

          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {MCP_TOOL_GROUPS.map((group) => (
              <li
                key={group.title}
                className="wl-stitch-card flex min-w-0 flex-col items-start gap-1.5 p-4 text-left"
              >
                <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
                <p className="text-sm leading-6 text-muted-foreground">{group.description}</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {group.tools.map((tool) => (
                    <code
                      key={tool}
                      className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]"
                    >
                      {tool}
                    </code>
                  ))}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Building against the web app?{" "}
            <a
              href={openApiUrl}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Read the OpenAPI Map
            </a>
            .
          </p>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
