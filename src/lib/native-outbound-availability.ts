import { BOTBOUND_PRODUCTION_ORIGIN } from "./brand";

/** Independent of reviewed web outbound activation; native acceptance is separate. */
export const NATIVE_OUTBOUND_UNAVAILABLE = Object.freeze({
  code: "NATIVE_OUTBOUND_UNAVAILABLE",
  error:
    "Native outbound calling is unavailable. Open BotBound in your browser to manage recipient permissions and calls.",
  web_url: `${BOTBOUND_PRODUCTION_ORIGIN}/phone?tab=outbound`,
});
