export type CallHappened = "email_sent" | "message_taken" | "booked" | "missed" | "no_request";

export function classifyCallHappened(input: {
  outcomeTag?: string | null;
  endedReason?: string | null;
  emailAccepted?: boolean;
  messageTaken?: boolean;
}): CallHappened {
  if (input.emailAccepted) return "email_sent";
  if (input.outcomeTag === "booked") return "booked";
  if (input.messageTaken) return "message_taken";
  const ended = (input.endedReason || "").toLowerCase();
  if (
    input.outcomeTag === "unreachable" ||
    /silence-timed-out|voicemail|machine-detected|customer-busy|no-answer|did-not-answer/.test(
      ended,
    )
  ) {
    return "missed";
  }
  return "no_request";
}

export function callHappenedLabel(happened: CallHappened): string {
  switch (happened) {
    case "email_sent":
      return "Email sent";
    case "message_taken":
      return "Message taken";
    case "booked":
      return "Booked";
    case "missed":
      return "Missed";
    case "no_request":
      return "No request";
  }
}

export function callHappenedDetail(happened: CallHappened): string {
  switch (happened) {
    case "email_sent":
      return "The Bot sent the email during the call.";
    case "message_taken":
      return "A message was saved for you to review.";
    case "booked":
      return "An appointment was booked.";
    case "missed":
      return "The call was missed.";
    case "no_request":
      return "The caller did not ask for a follow-up.";
  }
}
