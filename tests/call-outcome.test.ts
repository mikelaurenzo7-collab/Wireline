import { describe, expect, it } from "vitest";

import {
  classifyCallOutcome,
  isMessageContent,
  messageContentFromTask,
} from "../src/lib/call-outcome";

describe("shared call outcome taxonomy", () => {
  it("keeps the established outcomes for clear records", () => {
    expect(classifyCallOutcome({ emailAccepted: true, outcomeTag: "other" })).toBe("email_sent");
    expect(classifyCallOutcome({ outcomeTag: "booked" })).toBe("booked");
    expect(classifyCallOutcome({ outcomeTag: "unreachable" })).toBe("missed");
    expect(classifyCallOutcome({ endedReason: "customer-no-answer" })).toBe("missed");
    expect(classifyCallOutcome({ outcomeTag: "other", durationSeconds: 95 })).toBe("no_request");
  });

  it("maps the digest tags instead of collapsing them into no_request", () => {
    // Oct 24 audit: info/follow-up requests were labelled "No request" in
    // Call History while Insights showed the raw digest tag.
    expect(classifyCallOutcome({ outcomeTag: "info", durationSeconds: 140 })).toBe("info");
    expect(classifyCallOutcome({ outcomeTag: "followup", durationSeconds: 60 })).toBe("follow_up");
    expect(classifyCallOutcome({ outcomeTag: "qualified", durationSeconds: 98 })).toBe("qualified");
    expect(classifyCallOutcome({ outcomeTag: "dnc", durationSeconds: 30 })).toBe("dnc");
  });

  it("never calls a record with follow-up work 'no request'", () => {
    expect(classifyCallOutcome({ outcomeTag: "other", hasFollowUpTask: true })).toBe("follow_up");
    expect(classifyCallOutcome({ outcomeTag: null, hasFollowUpTask: true })).toBe("follow_up");
  });

  it("requires message content for 'message taken'", () => {
    expect(
      classifyCallOutcome({
        outcomeTag: "other",
        messageContent: "Please tell Ana the delivery moved to Friday at 9.",
        hasFollowUpTask: true,
      }),
    ).toBe("message_taken");
    // Oct 24 audit #13/#15: an internal task existed but recorded that no
    // message content was provided — a follow-up, not a taken message.
    expect(
      classifyCallOutcome({
        outcomeTag: "other",
        messageContent: "Caller wanted to leave a message but no content was provided.",
        hasFollowUpTask: true,
      }),
    ).toBe("follow_up");
    expect(
      classifyCallOutcome({
        outcomeTag: "other",
        messageContent: null,
        hasFollowUpTask: true,
      }),
    ).toBe("follow_up");
  });

  it("treats a transcribed voicemail as a message and an untranscribed one as missed", () => {
    expect(classifyCallOutcome({ outcomeTag: "voicemail", hasTranscript: true })).toBe(
      "message_taken",
    );
    expect(classifyCallOutcome({ outcomeTag: "voicemail", hasTranscript: false })).toBe("missed");
  });

  it("classifies evidence-free records as unclassified, not no_request", () => {
    expect(classifyCallOutcome({})).toBe("unclassified");
    expect(
      classifyCallOutcome({ outcomeTag: null, endedReason: null, durationSeconds: null }),
    ).toBe("unclassified");
    // Any conversation evidence is enough to keep the established fallback.
    expect(classifyCallOutcome({ hasTranscript: true })).toBe("no_request");
    expect(classifyCallOutcome({ outcomeTag: "completed", durationSeconds: 45 })).toBe(
      "no_request",
    );
  });
});

describe("message content extraction", () => {
  it("reads the message from payload or description", () => {
    expect(messageContentFromTask({ payload: { message: "Running 10 minutes late." } })).toBe(
      "Running 10 minutes late.",
    );
    expect(messageContentFromTask({ description: "Gate code is 4417." })).toBe("Gate code is 4417.");
  });

  it("rejects boilerplate, no-content notes, and the booking-confirm template", () => {
    expect(isMessageContent("Internal follow-up")).toBe(false);
    expect(isMessageContent("Caller did not provide a message.")).toBe(false);
    expect(isMessageContent("No content was provided for this task.")).toBe(false);
    expect(
      messageContentFromTask({
        description:
          "Sam asked to book an appointment on Friday. Check Calendar, and book it if your Bot did not on the call.",
      }),
    ).toBeNull();
    expect(messageContentFromTask({ description: "  " })).toBeNull();
    expect(messageContentFromTask({ payload: { message: 42 } })).toBeNull();
  });
});
