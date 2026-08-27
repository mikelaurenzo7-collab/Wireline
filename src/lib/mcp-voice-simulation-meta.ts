type SafeRealtimeSession = {
  sdp: string;
  maxDurationSeconds: number;
  endsAt: string;
  wireline?: Record<string, unknown>;
};

export function mcpVoiceSimulationMeta(input: {
  session: SafeRealtimeSession;
  agentId: string;
  greeting: string;
}): { realtime_session: Record<string, unknown>; agent_id: string } {
  return {
    realtime_session: {
      sdp: input.session.sdp,
      maxDurationSeconds: input.session.maxDurationSeconds,
      endsAt: input.session.endsAt,
      ...(input.session.wireline ? { wireline: input.session.wireline } : {}),
      greeting: input.greeting,
    },
    agent_id: input.agentId,
  };
}
