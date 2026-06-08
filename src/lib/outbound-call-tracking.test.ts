import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isOutboundCallPlaceholder,
  OUTBOUND_CALL_DIALING_MARKER,
  OUTBOUND_CALL_PLACEHOLDER_SUMMARY,
  updateLeadStatusOnCallEnd,
} from "./outbound-call-tracking";
import { classifyCallOutcome } from "./post-call-digest";
import { LEAD_STATUS } from "./outbound-status";

const mockLead = {
  id: BigInt(123),
  userId: "user-1",
  customerNumber: "+15551234567",
  status: "Dialing",
  attempts: 1,
  campaignId: "campaign-1",
  callId: "call-1",
  maxAttempts: 3,
};

const mocks = {
  selectedLead: mockLead as any | null,
  updatedValues: null as any,
  updateWhere: null as any,
};

vi.mock("./server-context", () => ({
  drizzle: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            return mocks.selectedLead ? [mocks.selectedLead] : [];
          }),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values) => ({
        where: vi.fn(async (cond) => {
          mocks.updatedValues = values;
          mocks.updateWhere = cond;
        }),
      })),
    })),
  },
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("isOutboundCallPlaceholder", () => {
  it("detects dialing marker", () => {
    expect(isOutboundCallPlaceholder({ pipelineError: OUTBOUND_CALL_DIALING_MARKER })).toBe(true);
  });

  it("detects placeholder summary", () => {
    expect(isOutboundCallPlaceholder({ summary: OUTBOUND_CALL_PLACEHOLDER_SUMMARY })).toBe(true);
  });
});

describe("classifyCallOutcome endedReason", () => {
  it("marks silence-timed-out as unreachable", () => {
    expect(
      classifyCallOutcome({
        durationSeconds: 30,
        endedReason: "silence-timed-out",
      }),
    ).toBe("unreachable");
  });
});

describe("updateLeadStatusOnCallEnd", () => {
  beforeEach(() => {
    mocks.selectedLead = { ...mockLead };
    mocks.updatedValues = null;
    mocks.updateWhere = null;
  });

  it("transitions booked to Completed", async () => {
    await updateLeadStatusOnCallEnd("user-1", "+15551234567", "booked", "call-1");
    expect(mocks.updatedValues).toEqual({
      status: LEAD_STATUS.COMPLETED,
      attempts: 1,
    });
  });

  it("transitions qualified to Completed", async () => {
    await updateLeadStatusOnCallEnd("user-1", "+15551234567", "qualified", "call-1");
    expect(mocks.updatedValues).toEqual({
      status: LEAD_STATUS.COMPLETED,
      attempts: 1,
    });
  });

  it("transitions dnc to Blocked-DNC", async () => {
    await updateLeadStatusOnCallEnd("user-1", "+15551234567", "dnc", "call-1");
    expect(mocks.updatedValues).toEqual({
      status: LEAD_STATUS.BLOCKED_DNC,
      attempts: 1,
    });
  });

  it("transitions unreachable to Retrying when attempts < maxAttempts", async () => {
    mocks.selectedLead.attempts = 1;
    mocks.selectedLead.maxAttempts = 3;
    await updateLeadStatusOnCallEnd("user-1", "+15551234567", "unreachable", "call-1");
    expect(mocks.updatedValues).toEqual({
      status: LEAD_STATUS.RETRYING,
      attempts: 1,
    });
  });

  it("transitions unreachable to Max-Attempts when attempts >= maxAttempts", async () => {
    mocks.selectedLead.attempts = 3;
    mocks.selectedLead.maxAttempts = 3;
    await updateLeadStatusOnCallEnd("user-1", "+15551234567", "unreachable", "call-1");
    expect(mocks.updatedValues).toEqual({
      status: LEAD_STATUS.MAX_ATTEMPTS,
      attempts: 3,
    });
  });

  it("transitions followup to Callback-Scheduled", async () => {
    await updateLeadStatusOnCallEnd("user-1", "+15551234567", "followup", "call-1");
    expect(mocks.updatedValues).toEqual({
      status: LEAD_STATUS.CALLBACK_SCHEDULED,
      attempts: 1,
    });
  });

  it("transitions other to Completed", async () => {
    await updateLeadStatusOnCallEnd("user-1", "+15551234567", "other", "call-1");
    expect(mocks.updatedValues).toEqual({
      status: LEAD_STATUS.COMPLETED,
      attempts: 1,
    });
  });
});
