/**
 * Summaries the system writes onto a call or an outbound contact when no
 * conversation happened. Owners read these in Calls, People and Outbound, so
 * they name what happened, never the carrier, the voice engine or the protocol.
 */

/** Screening or setup refused the call before it was placed or bridged. */
export const CALL_STOPPED_BEFORE_CONNECT_SUMMARY =
  "This call was stopped before it connected, so nobody was reached.";

/** The person picked up, then the call ended before the Bot was on the line. */
export const CALL_ENDED_BEFORE_BOT_SPOKE_SUMMARY =
  "The call ended before your Bot started talking.";
