/* eslint-disable @typescript-eslint/no-explicit-any -- external integration data shape varies by provider. */
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { dncPhoneCandidates, isDncBlocked, normalizeDncPhone } from "../lib/compliance";
import { fetchWithTimeout } from "../lib/server-context";

export interface SentinelResult {
  allowed: boolean;
  reason?: string;
  state?: string;
}

export class SentinelService {
  /**
   * Main gatekeeper for outbound calls.
   * Checks DNC, Time Windows, State Restrictions, and Holidays.
   */
  async isCallAllowed(
    userId: string,
    phoneNumber: string,
    now: Date = new Date(),
  ): Promise<SentinelResult> {
    const normalized = normalizeDncPhone(phoneNumber);
    if (!normalized) return { allowed: false, reason: "Invalid phone number" };

    // 1. Check DNC
    if (await isDncBlocked(userId, normalized)) {
      return { allowed: false, reason: "DNC_BLOCKED" };
    }

    // 2. Identify State and Timezone
    const areaCode = normalized.slice(0, 3);
    const info = this.getStateInfo(areaCode);
    if (!info) {
      // Fallback to TCPA baseline if area code unknown
      return this.checkBaselineTCPA();
    }

    // 3. Check Local Time and Day
    const localTime = this.getLocalTime(now, info.timezone);
    const dayOfWeek = localTime.getDay(); // 0 = Sunday
    const hour = localTime.getHours();

    // 4. State-Specific Restrictions
    if (info.noSunday && dayOfWeek === 0) {
      return { allowed: false, reason: `SUNDAY_PROHIBITED_IN_${info.state}`, state: info.state };
    }

    if (info.noHoliday && this.isHoliday(localTime, info.state)) {
      return { allowed: false, reason: `HOLIDAY_PROHIBITED_IN_${info.state}`, state: info.state };
    }

    const start = info.startHour || 8;
    const end = info.endHour || 21; // 9 PM

    if (hour < start || hour >= end) {
      return { allowed: false, reason: `OUTSIDE_HOURS_IN_${info.state}`, state: info.state };
    }

    return { allowed: true, state: info.state };
  }

  /**
   * Terminate active calls if a number is added to DNC mid-call.
   */
  async terminateActiveCallsForNumber(phoneNumber: string) {
    // Presence rows store the number exactly as Vapi sent it (E.164 "+1...")
    // while DNC paths normalize to digits-only — match every stored variant
    // (same posture as isDncBlocked) or a live call is never found and the
    // mid-call termination silently does nothing. Presence rows are deleted
    // at call end, so every match is a live call.
    const candidates = dncPhoneCandidates(phoneNumber);
    if (!candidates.length) return;
    const activeCalls = await drizzle
      .select({ id: schema.signalPresence.id })
      .from(schema.signalPresence)
      .where(inArray(schema.signalPresence.customerNumber, candidates));

    for (const call of activeCalls) {
      await this.killCall(call.id, "DNC_UPDATE_DURING_CALL");
    }
  }

  private async killCall(callId: string, reason: string) {
    log.info(`Terminating call ${callId} due to ${reason}`);
    try {
      await fetchWithTimeout(
        `https://api.vapi.ai/call/${callId}/terminate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
          },
        },
        5000,
      );

      // Update presence
      await drizzle
        .update(schema.signalPresence)
        .set({ status: "terminated" })
        .where(eq(schema.signalPresence.id, callId));
    } catch (err: any) {
      log.error(`Failed to terminate call ${callId}`, { error: err.message });
    }
  }

  private getStateInfo(areaCode: string) {
    // Simplified mapping for the Sentinel prototype
    const map: Record<
      string,
      {
        state: string;
        timezone: string;
        noSunday?: boolean;
        noHoliday?: boolean;
        startHour?: number;
        endHour?: number;
      }
    > = {
      "205": {
        state: "AL",
        timezone: "America/Chicago",
        noSunday: true,
        noHoliday: true,
        endHour: 20,
      },
      "251": {
        state: "AL",
        timezone: "America/Chicago",
        noSunday: true,
        noHoliday: true,
        endHour: 20,
      },
      "225": {
        state: "LA",
        timezone: "America/Chicago",
        noSunday: true,
        noHoliday: true,
        endHour: 20,
      },
      "504": {
        state: "LA",
        timezone: "America/Chicago",
        noSunday: true,
        noHoliday: true,
        endHour: 20,
      },
      "601": {
        state: "MS",
        timezone: "America/Chicago",
        noSunday: true,
        noHoliday: true,
        endHour: 20,
      },
      "401": {
        state: "RI",
        timezone: "America/New_York",
        noSunday: true,
        noHoliday: true,
        startHour: 9,
        endHour: 18,
      },
      "305": { state: "FL", timezone: "America/New_York", endHour: 20 },
      "407": { state: "FL", timezone: "America/New_York", endHour: 20 },
      "212": { state: "NY", timezone: "America/New_York" },
      "310": { state: "CA", timezone: "America/Los_Angeles" },
    };
    return map[areaCode];
  }

  private getLocalTime(date: Date, tz: string): Date {
    return new Date(date.toLocaleString("en-US", { timeZone: tz }));
  }

  private isHoliday(date: Date, state: string): boolean {
    const d = `${date.getMonth() + 1}/${date.getDate()}`;
    const federalHolidays = [
      "1/1", // New Year
      "1/19", // MLK
      "2/16", // Presidents
      "5/25", // Memorial
      "6/19", // Juneteenth
      "7/4", // Independence
      "9/7", // Labor
      "10/12", // Columbus
      "11/11", // Veterans
      "11/26", // Thanksgiving
      "12/25", // Christmas
    ];

    if (federalHolidays.includes(d)) return true;

    // State-specific
    if (state === "LA" && d === "2/17") return true; // Mardi Gras 2026 (approx)

    return false;
  }

  private checkBaselineTCPA(): SentinelResult {
    const now = new Date();
    const hour = now.getUTCHours() - 5; // Rough Est Central fallback
    if (hour < 8 || hour >= 21) {
      return { allowed: false, reason: "OUTSIDE_TCPA_HOURS_EST_FALLBACK" };
    }
    return { allowed: true };
  }
}
