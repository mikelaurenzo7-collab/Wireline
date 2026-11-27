import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";

export interface InCallPaymentRequest {
  userId: string;
  callSid: string;
  customerPhone: string;
  amountCents: number;
  description: string;
}

export interface InCallPaymentEvent {
  callSid: string;
  paymentIntentId: string;
  amountCents: number;
  status: "succeeded" | "failed";
  receiptUrl?: string;
  timestamp: Date;
}

export class VoiceSessionRegistry extends EventEmitter {
  private activeCalls = new Map<string, { userId: string; customerPhone: string; startedAt: Date }>();
  private paymentHistory = new Map<string, InCallPaymentEvent[]>();

  registerCall(callSid: string, userId: string, customerPhone: string): void {
    this.activeCalls.set(callSid, { userId, customerPhone, startedAt: new Date() });
    this.paymentHistory.set(callSid, []);
  }

  unregisterCall(callSid: string): void {
    this.activeCalls.delete(callSid);
  }

  hasCall(callSid: string): boolean {
    return this.activeCalls.has(callSid);
  }

  recordPayment(event: InCallPaymentEvent): void {
    const events = this.paymentHistory.get(event.callSid) || [];
    events.push(event);
    this.paymentHistory.set(event.callSid, events);
    this.emit(`payment:${event.callSid}`, event);
    this.emit("payment", event);
  }

  getPaymentsForCall(callSid: string): InCallPaymentEvent[] {
    return this.paymentHistory.get(callSid) || [];
  }
}

export const globalVoiceSessionRegistry = new VoiceSessionRegistry();

export function constructStripePaymentLink(request: InCallPaymentRequest): {
  paymentUrl: string;
  paymentIntentId: string;
  appleGooglePayEnabled: boolean;
} {
  const intentId = `pi_${createHash("sha256").update(`${request.userId}:${request.callSid}:${Date.now()}`).digest("hex").slice(0, 24)}`;
  const paymentUrl = `https://checkout.stripe.com/c/pay/${intentId}?amount=${request.amountCents}&wallets=apple_pay,google_pay`;
  return {
    paymentUrl,
    paymentIntentId: intentId,
    appleGooglePayEnabled: true,
  };
}

export function verifyStripeWebhookHMAC(
  payload: string,
  sigHeader: string,
  secret: string,
  toleranceSeconds = 300
): boolean {
  if (!sigHeader || !secret) return false;
  const parts = sigHeader.split(",");
  let timestamp: string | undefined;
  const signatures: string[] = [];

  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v;
    if (k === "v1") signatures.push(v);
  }

  if (!timestamp || signatures.length === 0) return false;
  const tsNum = Number(timestamp);
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > toleranceSeconds) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = createHmac("sha256", secret).update(signedPayload).digest("hex");

  return signatures.some((sig) => {
    try {
      return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSignature, "hex"));
    } catch {
      return false;
    }
  });
}
