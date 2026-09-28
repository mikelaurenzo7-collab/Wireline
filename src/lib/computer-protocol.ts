import { assertBoundedToolJson } from "./computer-tool-json";
import { z } from "zod";
import { validateComputerNativeAction } from "./computer-native-action";

/** Proposal-only protocol. Approval, credential storage and execution remain local. */
export const COMPUTER_LIMITS = {
  steps: 20,
  grantMs: 30 * 60_000,
  imageBytes: 2 * 1024 * 1024,
  imageDimension: 1536,
  textCharacters: 24_000,
  tools: 32,
  history: 8,
} as const;

const identifier = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_.:-]+$/);
const boundedObject = z.record(z.string(), z.unknown());
const screenshotSchema = z.strictObject({
  mimeType: z.literal("image/png"),
  data: z
    .string()
    .min(1)
    .max(Math.ceil(COMPUTER_LIMITS.imageBytes / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  width: z.number().int().min(1).max(COMPUTER_LIMITS.imageDimension),
  height: z.number().int().min(1).max(COMPUTER_LIMITS.imageDimension),
});
export const computerStepInputSchema = z.strictObject({
  agent_id: identifier,
  task_id: identifier,
  goal: z.string().trim().min(1).max(4000),
  step: z
    .number()
    .int()
    .min(0)
    .max(COMPUTER_LIMITS.steps - 1),
  observation: z.strictObject({
    id: identifier,
    source: z.strictObject({
      kind: z.enum(["window", "mcp"]),
      label: z.string().min(1).max(200),
      platform: z.enum(["windows", "macos"]).optional(),
    }),
    screenshot: screenshotSchema.optional(),
    text: z.string().max(COMPUTER_LIMITS.textCharacters).optional(),
  }),
  history: z
    .array(
      z.strictObject({
        summary: z.string().max(2000),
        status: z.enum(["completed", "failed", "unconfirmed", "cancelled"]),
      }),
    )
    .max(COMPUTER_LIMITS.history),
  tools: z
    .array(
      z.strictObject({
        serverId: identifier,
        name: z
          .string()
          .min(1)
          .max(128)
          .regex(/^[A-Za-z0-9_.:/-]+$/),
        description: z.string().max(2000),
        inputSchema: boundedObject,
      }),
    )
    .max(COMPUTER_LIMITS.tools),
});
const coordinate = z
  .number()
  .int()
  .min(0)
  .max(COMPUTER_LIMITS.imageDimension - 1);
export const computerActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("click"),
    x: coordinate,
    y: coordinate,
    button: z.enum(["left", "right"]),
    clickCount: z.union([z.literal(1), z.literal(2)]),
  }),
  z.strictObject({
    type: z.literal("scroll"),
    x: coordinate,
    y: coordinate,
    deltaX: z.number().int().min(-1200).max(1200),
    deltaY: z.number().int().min(-1200).max(1200),
  }),
  z.strictObject({ type: z.literal("type_text"), text: z.string().min(1).max(2000) }),
  z.strictObject({
    type: z.literal("keypress"),
    keys: z
      .array(
        z
          .string()
          .min(1)
          .max(32)
          .regex(/^[A-Za-z0-9]+$/),
      )
      .min(1)
      .max(4),
  }),
  z.strictObject({
    type: z.literal("mcp_call"),
    serverId: identifier,
    name: z.string().min(1).max(128),
    arguments: boundedObject,
  }),
]);
export const computerStepProposalSchema = z.strictObject({
  decision: z.enum(["action", "complete", "needs_input"]),
  summary: z.string().trim().min(1).max(2000),
  action: computerActionSchema.nullable(),
});
export type ComputerStepInput = z.infer<typeof computerStepInputSchema>;
export type ComputerAction = z.infer<typeof computerActionSchema>;
export type ComputerStepProposal = z.infer<typeof computerStepProposalSchema>;

export function parseComputerStepInput(value: unknown): ComputerStepInput {
  const input = computerStepInputSchema.parse(value);
  if (!input.observation.text?.trim() && !input.observation.screenshot)
    throw new Error("Provide a current observation before planning.");
  if (input.observation.source.kind !== "window" && input.observation.screenshot)
    throw new Error("Screenshots must describe the selected window.");
  const names = new Set<string>();
  for (const tool of input.tools) {
    const name = JSON.stringify([tool.serverId, tool.name]);
    if (names.has(name)) throw new Error("Duplicate computer tool.");
    names.add(name);
    assertBoundedToolJson(tool.inputSchema, true);
    if (tool.inputSchema.type !== "object")
      throw new Error("Tool input schemas must describe objects.");
  }
  if (JSON.stringify(input.tools).length > 64_000)
    throw new Error("Computer tool catalog is too large.");
  return input;
}

export function parseComputerStepProposal(
  value: unknown,
  input: ComputerStepInput,
): ComputerStepProposal {
  const proposal = computerStepProposalSchema.parse(value);
  if ((proposal.decision === "action") !== (proposal.action !== null))
    throw new Error("An action decision requires exactly one proposal.");
  const action = proposal.action;
  if (!action) return proposal;
  if (action.type === "mcp_call") {
    if (!input.tools.some((tool) => tool.serverId === action.serverId && tool.name === action.name))
      throw new Error("The proposed tool was not shared by this owner session.");
    assertBoundedToolJson(action.arguments);
  } else {
    const image = input.observation.screenshot;
    if (input.observation.source.kind !== "window" || !image)
      throw new Error("Native actions require a current selected-window screenshot.");
    proposal.action = validateComputerNativeAction(
      action,
      image,
      input.observation.source.platform,
    );
  }
  return proposal;
}
