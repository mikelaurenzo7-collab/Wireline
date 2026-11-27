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

/** Shown on a live call until its real summary is written. */
export const CALL_IN_PROGRESS_SUMMARY = "Call in progress.";

/** The call ended while the service handling it was restarting, so no outcome was saved. */
export const CALL_OUTCOME_NOT_RECORDED_SUMMARY = "The call ended before its outcome was recorded.";

/** Voicemail answered. The Bot leaves no message it has no approved recording for. */
export const ANSWERING_MACHINE_NO_VOICEMAIL_SUMMARY =
  "Answering machine detected; the call was ended and no voicemail was left.";

/** A fax or another machine answered. */
export const MACHINE_ANSWERED_SUMMARY = "Fax or machine detected; the call was ended.";
