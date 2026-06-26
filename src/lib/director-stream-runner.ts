import {
  runStructuredStream,
  runStructuredWithThinking,
  type StreamCallbacks,
  type StructuredResult,
  type StructuredToolSchema as ToolSchema,
} from "./ai-structured";
import { runOpenRouterStructured, runOpenRouterStructuredStream } from "./openrouter-structured";
import type { DirectorStreamContext } from "./director-turn";

export async function runDirectorStreamLlm<T = Record<string, unknown>>(
  ctx: DirectorStreamContext,
  callbacks: StreamCallbacks,
  options?: { signal?: AbortSignal },
): Promise<StructuredResult<T>> {
  if (ctx.llmProvider === "openrouter") {
    return runOpenRouterStructuredStream<T>(
      {
        model: ctx.model,
        system: ctx.system,
        user: ctx.user,
        tool: ctx.tool,
        maxTokens: ctx.maxTokens,
        signal: options?.signal,
      },
      callbacks,
    );
  }
  return runStructuredStream<T>(
    {
      system: ctx.system,
      user: ctx.user,
      tool: ctx.tool,
      model: ctx.model,
      deepThink: ctx.deepThink,
      maxTokens: ctx.maxTokens,
      signal: options?.signal,
    },
    callbacks,
  );
}

export async function runDirectorTurnLlm<T = Record<string, unknown>>(
  ctx: Pick<
    DirectorStreamContext,
    "llmProvider" | "model" | "system" | "user" | "tool" | "maxTokens" | "deepThink"
  >,
): Promise<StructuredResult<T>> {
  if (ctx.llmProvider === "openrouter") {
    return runOpenRouterStructured<T>({
      model: ctx.model,
      system: ctx.system,
      user: ctx.user,
      tool: ctx.tool,
      maxTokens: ctx.maxTokens,
    });
  }
  return runStructuredWithThinking<T>({
    system: ctx.system,
    user: ctx.user,
    tool: ctx.tool as ToolSchema,
    model: ctx.model,
    deepThink: ctx.deepThink,
    maxTokens: ctx.maxTokens,
  });
}
