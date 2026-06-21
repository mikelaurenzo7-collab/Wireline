import { Link } from "react-router-dom";
import { ArrowUpRight, FolderCog, Mic, ShieldCheck, Sparkles } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";

const sections = [
  { icon: FolderCog, title: "Profile", detail: "Your name, hours, and how Wireline reaches you.", href: "/agents" },
  { icon: Mic, title: "Voice", detail: "How your assistant sounds on live calls.", href: "/studio" },
  { icon: ShieldCheck, title: "Permissions", detail: "What each assistant is allowed to do.", href: "/actions" },
] as const;

export default function SettingsPage() {
  return (
    <WorkspaceShell
      eyebrow="Account"
      title="Settings"
      contentClassName="pt-2"
      action={
        <Link to="/actions" className="workspace-btn-secondary px-3 py-2 text-sm">
          Connections <ArrowUpRight size={13} />
        </Link>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        <section className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-3">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Link
                key={section.title}
                to={section.href}
                className="wl-stitch-card wl-stitch-card-hover flex min-h-[180px] flex-col justify-between p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded bg-muted text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon size={18} />
                  </span>
                  <ArrowUpRight size={16} className="text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-base font-semibold tracking-[-.02em]">{section.title}</h2>
                  <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{section.detail}</p>
                </div>
              </Link>
            );
          })}
        </section>
        <section className="wl-stitch-card shrink-0 border-primary bg-primary p-6 text-primary-foreground sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="wl-stitch-label text-primary-foreground/60">Powered by</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-.04em] sm:text-2xl">
                Natural calls, handled for you.
              </h2>
              <p className="mt-3 max-w-2xl text-[13px] leading-6 text-primary-foreground/75 sm:text-sm">
                We run the voice stack and model updates so your assistant stays reliable — whether it is calling a pharmacy or answering your business line.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold">
                <Sparkles size={12} />
                Updates included
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[280px]">
              {[['Brain', 'Latest AI'], ['Voice', 'Natural speech'], ['Calls', 'HD quality']].map(([title, value], index) => (
                <div key={title} className="rounded-lg border border-white/10 bg-white/10 p-3">
                  <p className="wl-stitch-label text-primary-foreground/50">0{index + 1}</p>
                  <p className="mt-2 text-[11px] font-semibold">{title}</p>
                  <p className="mt-0.5 text-[10px] text-primary-foreground/70">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
