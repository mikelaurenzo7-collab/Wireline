/**
 * Compatibility-only type shim for retired recipe signatures.
 *
 * Wireline does not install or invoke the Anthropic SDK. The legacy recipe
 * module uses these structural shapes while it is incrementally migrated to
 * provider-neutral runtime types.
 */
declare module "@anthropic-ai/sdk" {
  class Anthropic {
    private constructor();
  }

  namespace Anthropic {
    type Tool = Record<string, unknown>;
    type MessageParam = {
      role: string;
      content: unknown;
    };
  }

  export default Anthropic;
}
