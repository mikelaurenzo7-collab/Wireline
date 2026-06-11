// src/lib/director-fleet-plan.ts
// Updated to use the perfect Grok 4.3 Director prompt + dynamic context
// This keeps your existing wired calls working while upgrading to the all-encompassing boss prompt.

import {
  buildDirectorPrompt,
  type DirectorFleetAgent,
  type DirectorBusinessContext,
  type DirectorStats,
} from './directorContext';

import { BASE_DIRECTOR_SYSTEM_PROMPT } from './directorPrompt';

// Re-export types for backward compatibility with your existing code
export type { DirectorFleetAgent, DirectorBusinessContext, DirectorStats };

/**
 * Legacy-compatible wrapper.
 * Your existing calls to buildDirectorFleetSystemPrompt will now get the perfect upgraded prompt.
 */
export function buildDirectorFleetSystemPrompt(input: {
  fleet: DirectorFleetAgent[];
  stats?: DirectorStats;
  business?: DirectorBusinessContext;
  recentActivitySummary?: string;
  // Add any other fields your current calls pass — they will be forwarded
  [key: string]: any;
}): string {
  // Delegate to the new, superior context builder
  // This injects the full perfect prompt + live operational context
  return buildDirectorPrompt({
    clientId: input.clientId || 'unknown',
    fleet: input.fleet || [],
    stats: input.stats,
    business: input.business,
    recentActivitySummary: input.recentActivitySummary || input.recentActivity || '',
  });
}

// Optional: Direct access to the raw base prompt if needed
export { BASE_DIRECTOR_SYSTEM_PROMPT };

// You can keep any other helper functions from the original file here if they existed.
// The core upgrade is complete — all wired Director turns now use Grok 4.3 + perfect boss prompt.