/**
 * Compatibility-only type shim for retired recipe signatures.
 *
 * Wireline does not install or invoke the Anthropic SDK. The legacy recipe
 * module uses these structural shapes while it is incrementally migrated to
 * provider-neutral runtime types.
 */
declare const Anthropic: unknown;

declare namespace Anthropic {
  type Tool = Record<string, unknown>;
  type MessageParam = {
    role: string;
    content: unknown;
  };
}

declare module "@anthropic-ai/sdk" {
  export default Anthropic;
}
