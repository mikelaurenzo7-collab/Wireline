import CrmConnectionCard from "../components/CrmConnectionCard";
import WorkspaceShell from "../components/WorkspaceShell";

export default function ConnectionsPage() {
  return (
    <WorkspaceShell title="" eyebrow="" contentClassName="pt-8 pb-10 lg:pt-10">
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-8 pb-10">
        <section>
          <h1 className="wl-display-3">Connections</h1>
          <p className="mt-4 max-w-[52ch] text-sm leading-7 text-muted-foreground">
            Connect CRM, calendar, commerce, and team tools once — every agent in your workspace can
            use them on live calls, texts, and follow-up.
          </p>
        </section>

        <CrmConnectionCard />
      </div>
    </WorkspaceShell>
  );
}
