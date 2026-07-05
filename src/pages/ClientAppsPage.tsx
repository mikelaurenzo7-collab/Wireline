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
    status: "Private preview",
    statusVariant: "warning" as const,
    description: "Bring page context into Studio.",
    detail: "Text, title, URL, numbers.",
    action: "Request preview",
    href: "mailto:support@trywireline.com?subject=Wireline%20Command%20Preview",
  },
  {
    icon: Smartphone,
    title: "Wireline for iPhone",
    status: "Release prep",
    statusVariant: "info" as const,
    description: "Your line on iPhone.",
    detail: "Siri, widgets, CallKit, CarPlay.",
    action: "Ask about access",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20iPhone",
  },
  {
    icon: Car,
    title: "Wireline for Android",
    status: "Release prep",
    statusVariant: "info" as const,
    description: "Your line on Android.",
    detail: "Telecom, widgets, Android Auto.",
    action: "Ask about access",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20Android",
  },
  {
    icon: MessageSquareText,
    title: "Wireline in ChatGPT",
    status: "Developer mode",
    statusVariant: "outline" as const,
    description: "Draft in ChatGPT.",
    detail: "Wireline account required.",
    action: "Ask about access",
    href: "mailto:support@trywireline.com?subject=Wireline%20in%20ChatGPT",
  },
  {
    icon: Sparkles,
    title: "Wireline in Claude",
    status: "Custom connector",
    statusVariant: "outline" as const,
    description: "Draft in Claude.",
    detail: "Connector URL: trywireline.com/mcp",
    action: "Add in Claude",
    href: "https://claude.ai/settings/connectors",
  },
] as const;

export default function ClientAppsPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame>
        <WorkspacePageIntro
          eyebrow="Surfaces"
          title="Apps"
          description="Wireline on every device you work from — browser, phone, and AI assistants."
        />
        <section
          className="grid gap-4 md:grid-cols-2"
          aria-label="Wireline apps and companion surfaces"
        >
          {clientSurfaces.map(
            ({ icon: Icon, title, status, statusVariant, description, detail, action, href }) => (
              <article
                key={title}
                className="studio-card group flex min-h-[230px] flex-col p-6 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--wireline-elevation-md)]"
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
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
