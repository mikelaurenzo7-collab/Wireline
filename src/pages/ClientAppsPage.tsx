import {
  ArrowUpRight,
  Car,
  MessageSquareText,
  MonitorDown,
  Smartphone,
  Sparkles,
} from "lucide-react";

import { Badge, Button } from "../components/atoms";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

const clientSurfaces = [
  {
    icon: MonitorDown,
    title: "Browser Companion",
    status: "Local install",
    statusVariant: "success" as const,
    description: "Wireline Command brings page context into Studio on your terms.",
    detail: "Chrome, Edge, Opera, and Firefox. Reads the active tab only after you act.",
    action: "Request install guide",
    href: "mailto:support@trywireline.com?subject=Wireline%20Command%20install%20guide",
  },
  {
    icon: Smartphone,
    title: "Wireline for iPhone",
    status: "Early access",
    statusVariant: "info" as const,
    description: "Your line on iPhone — calls, approvals, and daily review.",
    detail: "Siri shortcuts, widgets, CallKit, and CarPlay-ready surfaces.",
    action: "Join TestFlight",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20iPhone%20early%20access",
  },
  {
    icon: Car,
    title: "Wireline for Android",
    status: "Early access",
    statusVariant: "info" as const,
    description: "Your line on Android — calls, notifications, and handoff.",
    detail: "Telecom integration, widgets, and Android Auto-ready surfaces.",
    action: "Join internal testing",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20Android%20early%20access",
  },
  {
    icon: MessageSquareText,
    title: "Wireline in ChatGPT",
    status: "Available",
    statusVariant: "success" as const,
    description: "Describe the agent you need; create a private draft in your workspace.",
    detail: "OAuth-connected MCP at trywireline.com/mcp. Simulation stays private.",
    action: "View connection guide",
    href: "https://trywireline.com/mcp",
  },
  {
    icon: Sparkles,
    title: "Wireline in Claude",
    status: "Custom connector",
    statusVariant: "outline" as const,
    description: "Draft and refine agents from Claude with your Wireline account.",
    detail: "Connector URL: trywireline.com/mcp",
    action: "Add in Claude",
    href: "https://claude.ai/settings/connectors",
  },
] as const;

const INSTALL_STEPS = [
  "Build the extension package from the repository or request a signed build from support.",
  "Load the Chromium or Firefox unpacked artifact in your browser developer settings.",
  "Sign in to Wireline, open Studio, and use Wireline Command from the toolbar or shortcut.",
] as const;

export default function ClientAppsPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame>
        <WorkspacePageIntro
          eyebrow="Surfaces"
          title="Apps"
          description="Wireline on every device you work from — browser, phone, and AI assistants. Each surface keeps billing, training, and launch controls in your Wireline workspace."
        />
        <section
          className="grid gap-4 md:grid-cols-2"
          aria-label="Wireline apps and companion surfaces"
        >
          {clientSurfaces.map(
            ({ icon: Icon, title, status, statusVariant, description, detail, action, href }) => (
              <article
                key={title}
                className="studio-card group flex min-h-[230px] flex-col p-6 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_28px_var(--wireline-color-glow-primarySoft)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <Badge variant={statusVariant}>{status}</Badge>
                </div>
                <h2 className="mt-6 font-[var(--wireline-font-family-display)] text-[26px] font-normal leading-tight tracking-[-0.02em] text-foreground">
                  {title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
                <p className="mt-3 text-xs font-medium leading-5 text-muted-foreground/80">
                  {detail}
                </p>
                <Button
                  asChild
                  variant="link"
                  className="mt-auto w-fit px-0 pt-6 text-sm text-primary"
                >
                  <a
                    href={href}
                    {...(href.startsWith("https://")
                      ? { target: "_blank", rel: "noreferrer" }
                      : {})}
                  >
                    {action} <ArrowUpRight size={14} />
                  </a>
                </Button>
              </article>
            ),
          )}
        </section>

        <section
          className="wl-paper mt-8 rounded-[var(--radius-lg)] border border-border p-6 sm:p-8"
          aria-labelledby="command-install-title"
        >
          <p className="wl-eyebrow wl-eyebrow--wire text-primary">Wireline Command</p>
          <h2
            id="command-install-title"
            className="mt-3 font-[var(--wireline-font-family-display)] text-2xl tracking-[-0.02em] text-foreground"
          >
            Install the browser companion locally
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Wireline Command never harvests pages in the background. It reads title, URL, and
            selection only after you choose Call, Text, Follow-up, or Agent task — then opens Studio
            with that context for review.
          </p>
          <ol className="mt-6 space-y-3 text-sm leading-6 text-muted-foreground">
            {INSTALL_STEPS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="font-mono text-xs font-semibold text-primary">{index + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Button asChild variant="secondary" size="sm" className="mt-6">
            <a href="mailto:support@trywireline.com?subject=Wireline%20Command%20install%20guide">
              Email support for a signed build
            </a>
          </Button>
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
