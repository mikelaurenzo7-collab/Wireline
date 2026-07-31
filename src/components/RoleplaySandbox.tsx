import { MessageSquareText, ShieldCheck } from "lucide-react";
import LiveVoiceSandbox from "./LiveVoiceSandbox";
import WirelineLiveVoiceProfile from "./WirelineLiveVoiceProfile";

export default function RoleplaySandbox({
  agentId,
  agentName = "your agent",
  onTestStarted,
  onTestCompleted,
}: {
  agentId: string;
  agentName?: string;
  onTestStarted?: () => void;
  onTestCompleted?: () => void;
}) {
  return (
    <div className="space-y-4">
      <WirelineLiveVoiceProfile agentId={agentId} />
      <LiveVoiceSandbox
        agentId={agentId}
        agentName={agentName}
        onTestStarted={onTestStarted}
        onTestCompleted={onTestCompleted}
      />
      <div className="grid gap-3 rounded-xl border border-border bg-secondary p-4 sm:grid-cols-2">
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-primary">
            <MessageSquareText size={17} />
          </span>
          <div>
            <p className="text-[length:var(--wireline-typography-caption-size)] font-semibold text-foreground">
              Test realistic interruptions
            </p>
            <p className="mt-1 text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
              Talk naturally, pause, change your mind, and interrupt the agent while it is speaking.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-primary">
            <ShieldCheck size={17} />
          </span>
          <div>
            <p className="text-[length:var(--wireline-typography-caption-size)] font-semibold text-foreground">
              Safe test channel
            </p>
            <p className="mt-1 text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
              Live testing may search approved Training context but cannot send, book, transfer, or
              change outside systems.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
