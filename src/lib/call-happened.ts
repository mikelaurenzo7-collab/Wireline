/**
 * @deprecated The shared taxonomy lives in ./call-outcome. This module keeps
 * the old import surface working by delegating to it; new code should import
 * classifyCallOutcome / callOutcomeLabel / callOutcomeDetail from
 * ./call-outcome directly.
 */
import { classifyCallOutcome, type CallOutcome, type CallOutcomeInput } from "./call-outcome";

export type CallHappened = CallOutcome;

export type CallHappenedInput = CallOutcomeInput & {
  /**
   * Legacy signal: an internal task exists for the call. The old classifier
   * read this as "Message taken"; the shared classifier requires actual
   * message content for that outcome, so the shim only forwards it as
   * content when the caller asserts a message was recorded.
   */
  messageTaken?: boolean;
};

export function classifyCallHappened(input: CallHappenedInput): CallOutcome {
  return classifyCallOutcome({
    ...input,
    messageContent:
      input.messageContent ?? (input.messageTaken ? "Message recorded for this call." : null),
  });
}

export { callOutcomeDetail as callHappenedDetail } from "./call-outcome";
export { callOutcomeLabel as callHappenedLabel } from "./call-outcome";
