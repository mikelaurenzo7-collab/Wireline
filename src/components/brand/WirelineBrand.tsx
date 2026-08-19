// Deprecated compatibility exports. Customer-facing identity is BotBound.
// Existing imports remain source-compatible while rendering the new brand.
export {
  BOTBOUND_BRAND_NAME as WIRELINE_BRAND_NAME,
  BotBoundWordmark as WirelineWordmark,
  BotBoundLockup as WirelineLockup,
} from "./BotBoundBrand";
export type {
  BotBoundLockupSize as WirelineLockupSize,
  BotBoundLockupSurface as WirelineLockupSurface,
} from "./BotBoundBrand";
