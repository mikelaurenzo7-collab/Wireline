import type { AgentVideoPresenterConfig } from "./types";

/** Customer-facing copy never exposes the underlying video provider. */
export function videoPresenterStatusMessage(
  presenter: AgentVideoPresenterConfig,
  _platformConfigured: boolean,
  isBusinessAgent: boolean,
): string {
  if (!isBusinessAgent) {
    return "Everyday-use Bots use a private in-app identity badge.";
  }
  if (presenter.chosenAvatarId) {
    return "This agent keeps its identity badge. Live talking-head video is retired.";
  }
  return "Identity badges stay on every agent. Live talking-head video is retired.";
}
