import { createHash } from "node:crypto";

export const MIN_TRAVEL_BUFFER_MINUTES = 15;
export const MAX_TRAVEL_BUFFER_MINUTES = 60;
export const DEFAULT_SOFT_HOLD_TTL_SECONDS = 300; // 5 minutes

export interface EphemeralCalendarHold {
  holdId: string;
  userId: string;
  callSid: string;
  slotStart: Date;
  slotEnd: Date;
  expiresAt: Date; // TTL 5 minutes (300s)
  status: "active" | "confirmed" | "expired" | "released";
}

export interface TravelBufferCalculation {
  originAddress?: string;
  destinationAddress: string;
  bufferMinutes: number; // min 15 mins, max 60 mins based on distance/traffic (0 if remote/same)
}

export function calculateTravelBuffer(
  originAddress: string | undefined,
  destinationAddress: string,
  options?: { estimatedMiles?: number; isRemote?: boolean }
): TravelBufferCalculation {
  if (options?.isRemote || !destinationAddress.trim()) {
    return { originAddress, destinationAddress, bufferMinutes: 0 };
  }
  if (!originAddress || originAddress.trim() === destinationAddress.trim()) {
    return { originAddress, destinationAddress, bufferMinutes: 0 };
  }

  // Linear estimation: 2 mins per mile + 10 min parking/setup, clamped to [15, 60] mins
  const miles = options?.estimatedMiles ?? 10;
  const estimatedMins = Math.round(miles * 2 + 10);
  const bufferMinutes = Math.min(MAX_TRAVEL_BUFFER_MINUTES, Math.max(MIN_TRAVEL_BUFFER_MINUTES, estimatedMins));

  return { originAddress, destinationAddress, bufferMinutes };
}

export function createEphemeralHold(
  userId: string,
  callSid: string,
  slotStart: Date,
  slotEnd: Date,
  ttlSeconds = DEFAULT_SOFT_HOLD_TTL_SECONDS
): EphemeralCalendarHold {
  const holdId = `hold_${createHash("sha256").update(`${userId}:${callSid}:${slotStart.toISOString()}`).digest("hex").slice(0, 16)}`;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  return {
    holdId,
    userId,
    callSid,
    slotStart,
    slotEnd,
    expiresAt,
    status: "active",
  };
}

export function isHoldActive(hold: EphemeralCalendarHold, now = new Date()): boolean {
  if (hold.status !== "active") return false;
  return now.getTime() < hold.expiresAt.getTime();
}

export function checkSlotWithBufferAndHolds(params: {
  targetStart: Date;
  targetEnd: Date;
  targetBufferMinutes: number;
  existingBookings: Array<{ startAt: Date; endAt: Date; bufferMinutes?: number }>;
  activeHolds: EphemeralCalendarHold[];
  now?: Date;
}): { available: boolean; conflictReason?: string } {
  const now = params.now ?? new Date();
  const targetStart = params.targetStart.getTime();
  const targetEnd = params.targetEnd.getTime();
  const targetBufferMs = params.targetBufferMinutes * 60_000;

  // 1. Check against existing confirmed bookings with travel buffers
  for (const booking of params.existingBookings) {
    const bookingStart = booking.startAt.getTime();
    const bookingEnd = booking.endAt.getTime();
    const bookingBufferMs = (booking.bufferMinutes ?? 0) * 60_000;

    const overlap =
      targetStart < bookingEnd + bookingBufferMs &&
      bookingStart < targetEnd + targetBufferMs;

    if (overlap) {
      return {
        available: false,
        conflictReason: `Overlaps with confirmed booking (${booking.startAt.toISOString()} - ${booking.endAt.toISOString()}) including ${booking.bufferMinutes ?? 0}m buffer`,
      };
    }
  }

  // 2. Check against unexpired ephemeral holds
  for (const hold of params.activeHolds) {
    if (isHoldActive(hold, now)) {
      const holdStart = hold.slotStart.getTime();
      const holdEnd = hold.slotEnd.getTime();

      const overlap = targetStart < holdEnd && holdStart < targetEnd;
      if (overlap) {
        return {
          available: false,
          conflictReason: `Slot is temporarily reserved by another active call (hold: ${hold.holdId}, expires: ${hold.expiresAt.toISOString()})`,
        };
      }
    }
  }

  return { available: true };
}
