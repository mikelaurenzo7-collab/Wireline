import { ArrowUpRight, Chrome, MessageSquareText, MonitorDown, Smartphone } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";

const clientSurfaces = [
  {
    icon: MonitorDown,
    title: "Browser Companion",
    status: "Private preview",
    description:
      "Bring the current page, selected text, or a linked phone number into Studio without background browsing or copied credentials.",
    detail: "Chrome, Microsoft Edge, Opera, and Firefox",
    action: "Request browser preview",
    href: "mailto:support@trywireline.com?subject=Wireline%20Browser%20Companion%20Preview",
  },
  {
    icon: Smartphone,
    title: "Wireline for iPhone",
    status: "Release preparation",
    description:
      "A native call assistant with Siri, widgets, CallKit, and secure control of your Wireline assistants.",
    detail: "iPhone and supported CarPlay communication flows",
    action: "Ask about iPhone access",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20iPhone",
  },
  {
    icon: Smartphone,
    title: "Wireline for Android",
    status: "Release preparation",
    description:
      "A native personal control surface with Android Telecom, notifications, widgets, and assistant recaps.",
    detail: "Android phones and supported Android Auto communication flows",
    action: "Ask about Android access",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20Android",
  },
  {
    icon: MessageSquareText,
    title: "Wireline in ChatGPT",
    status: "Developer mode",
    description:
      "Create and refine a private, unlaunched Wireline assistant draft in ChatGPT, then continue its full setup in Wireline.",
    detail: "Requires a connected Wireline account and a ChatGPT Developer Mode connection",
    action: "Ask about ChatGPT access",
    href: "mailto:support@trywireline.com?subject=Wireline%20in%20ChatGPT",
  },
] as const;

export default function ClientAppsPage() {
  return (
    <WorkspaceShell eyebrow="Workspace" title="Wireline everywhere" contentClassName="py-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8">
        <section className="studio-card overflow-hidden p-6 sm:p-7">
          <p className="studio-kicker">Your control surfaces</p>
          <h2 className="wl-section-title mt-2 max-w-3xl">One assistant system, available where the conversation starts.</h2>
          <p className="wl-page-copy mt-3 max-w-3xl">
            Wireline keeps assistants, permissions, billing, and actions in one protected workspace. The apps below are focused control surfaces—not disconnected products with separate rules.
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          {clientSurfaces.map(({ icon: Icon, title, status, description, detail, action, href }) => (
            <article key={title} className="studio-card flex min-h-[270px] flex-col p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                  <Icon size={19} />
                </span>
                <span className="wl-stitch-status-pill">{status}</span>
              </div>
              <h2 className="wl-card-title mt-6 text-[18px]">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              <p className="mt-3 text-xs font-semibold leading-5 text-muted-foreground">{detail}</p>
              <a
                className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-semibold text-primary hover:text-[color:var(--wl-accent-hover)]"
                href={href}
              >
                {action} <ArrowUpRight size={15} />
              </a>
            </article>
          ))}
        </section>

        <section className="studio-card border-primary/20 bg-secondary p-5 sm:p-6">
          <div className="flex gap-3">
            <Chrome className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="studio-kicker">Browser companion privacy</p>
              <h2 className="wl-card-title mt-2 text-[17px]">Nothing is collected in the background.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                The companion only reads the active page when you invoke it. It sends the title, URL, description, and any text you explicitly selected into Studio when you choose to bring that context over. It does not retain a session token or request access to every site.
              </p>
            </div>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
