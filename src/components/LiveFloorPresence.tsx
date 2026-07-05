import { WL_APP_CLASSES } from "../lib/wireline-design-system";
import AgentPresencePstnBridge from "./AgentPresencePstnBridge";

export type LiveSignalPresence = {
  id: string;
  agentId?: string | null;
  customerNumber?: string | null;
  status?: string | null;
  label?: string | null;
};

function isActiveSignal(signal: LiveSignalPresence): boolean {
  const status = (signal.status || "").toLowerCase();
  return Boolean(status) && !["ended", "completed"].includes(status);
}

export default function LiveFloorPresence({
  signals,
  agentNameForId,
}: {
  signals: LiveSignalPresence[];
  agentNameForId: (agentId: string) => string;
}) {
  const active = signals.filter(isActiveSignal).filter((signal) => signal.agentId);
  if (!active.length) return null;

  const primary = active[0];
  const agentId = primary.agentId!;
  const agentName = agentNameForId(agentId);

  return (
    <section className="mb-5 rounded-[12px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={WL_APP_CLASSES.wiredEyebrow}>Live presenter</p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {primary.customerNumber || "Active caller"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {primary.label || "In progress"} · {agentName}
          </p>
        </div>
        <AgentPresencePstnBridge
          vapiCallId={primary.id}
          agentId={agentId}
          agentName={agentName}
          compact
        />
      </div>
    </section>
  );
}
