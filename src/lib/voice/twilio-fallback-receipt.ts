export const TWILIO_FALLBACK_DURATION_TOLERANCE_SECONDS = 5;

export type FallbackAdmission = {
  userId: string;
  parentCallSid: string;
  calledNumber: string;
  callerNumber: string;
  fallbackNumber: string;
  agentId: string | null;
  maxSeconds: number;
  leaseId: string;
  leaseExpiresAt: string;
};

export type FallbackCompletion = {
  childCallSid: string | null;
  status: string;
  durationSeconds: number;
};

export type FallbackReceipt = FallbackAdmission & { completion: FallbackCompletion | null };

export type TwilioFallbackStore = {
  findLine(userId: string, calledNumber: string): Promise<{ agentId: string | null } | null>;
  claim(input: FallbackAdmission): Promise<FallbackReceipt | null>;
  find(parentCallSid: string): Promise<FallbackReceipt | null>;
  complete(receipt: FallbackReceipt, completion: FallbackCompletion): Promise<FallbackCompletion>;
};

export function fallbackReceiptId(parentCallSid: string): string {
  return `twilio-fallback:${parentCallSid}`;
}
