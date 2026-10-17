import { Phone } from "lucide-react";

import type { BotMarkKey } from "../lib/bot-mark";
import { Button } from "./atoms";
import OpenAILiveVoiceSandbox from "./OpenAILiveVoiceSandbox";

export function studioVoiceStartId(agentId: string) {
  return `studio-voice-start-${agentId}`;
}

export default function StudioVoiceRehearsal({
  agentId,
  agentName,
  markKey,
  phoneNumber,
}: {
  agentId: string;
  agentName: string;
  markKey?: BotMarkKey | null;
  phoneNumber?: string | null;
}) {
  const phone = phoneNumber?.trim();
  const phoneHref =
    phone && /^\+?[\d ().-]{7,32}$/.test(phone) ? `tel:${phone.replace(/[ ().-]/g, "")}` : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-3 py-4 sm:px-5">
      <OpenAILiveVoiceSandbox
        agentId={agentId}
        agentName={agentName}
        markKey={markKey}
        compact
        startButtonId={studioVoiceStartId(agentId)}
      />
      {phoneHref ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Test your connected phone</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Real call. Enabled actions can run.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="min-h-11">
            <a href={phoneHref} aria-label={`Call connected line ${phone}`}>
              <Phone aria-hidden="true" className="size-4" />
              <span className="wl-preserve-case">{phone}</span>
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
