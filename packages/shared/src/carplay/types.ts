/**
 * Shared TypeScript types for the CarPlay Agents Widget feature.
 * 
 * These types ensure consistency between web backend, iOS app, and future clients.
 * Aligned with existing Wireline patterns (e.g., agent models from #389/#390).
 */

export interface CarPlaySession {
  userId: string;
  sessionId: string;
  activeAgents: Array<{
    id: string;
    name: string;
    role: string; // e.g., 'SDR', 'CS'
    modelOverride?: string; // From per-agent overrides
  }>;
  lastContext?: {
    pipelineSummary?: string;
    hotLeadsCount?: number;
  };
}

export interface HandoffRequest {
  callId?: string;           // Native or Vapi call identifier
  callerInfo?: {
    name?: string;
    phone?: string;
  };
  targetAgentId: string;     // Which specialized agent to hand off to
  context?: string;          // Additional drive-time context
  conferenceMode: 'join' | 'takeover'; // join = conference in; takeover = agent answers
}

export interface HandoffResponse {
  success: boolean;
  conferenceId?: string;
  agentGreeting?: string;    // Initial prompt for the agent
  error?: string;
  errorCode?: 'auth_failed' | 'agent_busy' | 'no_conference' | 'invalid_call';
}

// Lightweight context for widget / Live Activity
export interface CarPlayWidgetContext {
  connectedAgents: number;
  quickActions: Array<{
    id: string;
    label: string;
    icon?: string;
    voiceCommand?: string;
  }>;
}
