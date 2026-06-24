import * as React from "react";

import { parseCallTranscript } from "@/lib/call-transcript";
import { ConversationMessage } from "./ConversationMessage";

export function VoiceTurns({ value }: { value: string }) {
  const lines = parseCallTranscript(value);

  return (
    <div data-slot="voice-turns" className="space-y-2" aria-label="Voice transcript">
      {lines.map((line) => (
        <ConversationMessage key={line.id} author={line.speaker} channel="voice" label={line.label}>
          {line.body}
        </ConversationMessage>
      ))}
    </div>
  );
}
