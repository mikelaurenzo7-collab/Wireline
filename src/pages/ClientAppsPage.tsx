import { ArrowUpRight, MessageSquareText, MonitorDown, Smartphone } from "lucide-react";

import { Badge, Button } from "../components/atoms";
import WorkspaceShell from "../components/WorkspaceShell";

const clientSurfaces = [
  {
    icon: MonitorDown,
    title: "Wireline Command",
    status: "Private preview",
    statusVariant: "warning" as const,
    description: "Browser tab control.",
    detail: "Call. Text. Context.",
    action: "Request browser preview",
    href: "mailto:support@trywireline.com?subject=Wireline%20Command%20Preview",
  },
  {
    icon: Smartphone,
    title: "Wireline for iPhone",
    status: "Release preparation",
    statusVariant: "info" as const,
    description: "Away from desk.",
    detail: "Siri. Widgets. CarPlay.",
    action: "Ask about iPhone access",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20iPhone",
  },
  {
    icon: Smartphone,
    title: "Wireline for Android",
    status: "Release preparation",
    statusVariant: "info" as const,
    description: "Android control.",
    detail: "Notifications. Widgets.",
    action: "Ask about Android access",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20Android",
  },
  {
    icon: MessageSquareText,
    title: "Wireline in ChatGPT",
    status: "Developer mode",
    statusVariant: "outline" as const,
    description: "Draft in ChatGPT.",
    detail: "Finish setup here.",
    action: "Ask about ChatGPT access",
    href: "mailto:support@trywireline.com?subject=Wireline%20in%20ChatGPT",
  },
] as const;

export default function ClientAppsPage() {
  return (
    <WorkspaceShell eyebrow="Workspace" title="Wireline everywhere" contentClassName="pt-1 pb-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-8">
        <section className="studio-card p-6 sm:p-7 text-center">
          <p className="studio-kicker">Surfaces</p>
          <h2 className="wl-section-title mt-1">Everywhere you talk.</h2>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          {clientSurfaces.map(
            ({ icon: Icon, title, status, statusVariant, description, detail, action, href }) => (
              <article key={title} className="studio-card flex min-h-[232px] flex-col p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                    <Icon size={19} />
                  </span>
                  <Badge variant={statusVariant}>{status}</Badge>
                </div>
                <h2 className="wl-card-title mt-5 text-[var(--wireline-typography-h3-size)] text-center">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground text-center">{description}</p>
                <p className="mt-2 text-xs font-semibold leading-5 text-muted-foreground text-center">{detail}</p>
                <Button asChild variant="link" className="mt-auto w-fit px-0 pt-5 text-sm">
                  <a href={href}>
                    {action} <ArrowUpRight size={15} />
                  </a>
                </Button>
              </article>
            ),
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
