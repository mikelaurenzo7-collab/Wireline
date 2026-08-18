/* eslint-disable @typescript-eslint/no-explicit-any -- external integration data shape varies by provider. */
import { and, eq, inArray } from "drizzle-orm";

import * as schema from "../db/schema";
import { dncPhoneCandidates, isDncBlocked, normalizeDncPhone } from "../lib/compliance";
import { drizzle, fetchWithTimeout, log } from "../lib/server-context";
import { isAllowedVapiControlUrl } from "../lib/vapi-monitor-url";
import { hangupXAISipCall } from "../lib/voice/xai-sip-session";

export interface SentinelResult {
  allowed: boolean;
  reason?: string;
  state?: string;
}

function nativeXAICallId(value: string): string | null {
  if (!value.startsWith("xai:")) return null;
  const callId = value.slice(4).trim();
  return callId && callId.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(callId) ? callId : null;
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

    if (await isDncBlocked(userId, normalized)) {
      return { allowed: false, reason: "DNC_BLOCKED" };
    }

    const areaCode = normalized.slice(0, 3);
    const info = this.getStateInfo(areaCode);
    if (!info) return this.checkBaselineTCPA();

    const localTime = this.getLocalTime(now, info.timezone);
    const dayOfWeek = localTime.getDay();
    const hour = localTime.getHours();

    if (info.noSunday && dayOfWeek === 0) {
      return { allowed: false, reason: `SUNDAY_PROHIBITED_IN_${info.state}`, state: info.state };
    }

    if (info.noHoliday && this.isHoliday(localTime, info.state)) {
      return { allowed: false, reason: `HOLIDAY_PROHIBITED_IN_${info.state}`, state: info.state };
    }

    const start = info.startHour || 8;
    const end = info.endHour || 21;
    if (hour < start || hour >= end) {
      return { allowed: false, reason: `OUTSIDE_HOURS_IN_${info.state}`, state: info.state };
    }

    return { allowed: true, state: info.state };
  }

  /**
   * Terminate active calls if a number is added to DNC mid-call. Presence ids
   * are provider-qualified, so the compliance path can use native xAI hangup
   * without attempting a Vapi lookup. Legacy Vapi control remains available
   * only for rollback calls that do not carry the `xai:` prefix.
   */
  async terminateActiveCallsForNumber(
    phoneNumber: string,
    userId: string,
  ): Promise<{ attempted: number; terminated: number; failed: number }> {
    const candidates = dncPhoneCandidates(phoneNumber);
    if (!candidates.length || !userId) return { attempted: 0, terminated: 0, failed: 0 };

    const activeCalls = await drizzle
      .select({ id: schema.signalPresence.id })
      .from(schema.signalPresence)
      .where(
        and(
          eq(schema.signalPresence.userId, userId),
          inArray(schema.signalPresence.customerNumber, candidates),
        ),
      );

    let terminated = 0;
    for (const call of activeCalls) {
      if (await this.killCall(call.id, "DNC_UPDATE_DURING_CALL")) terminated++;
    }

    return {
      attempted: activeCalls.length,
      terminated,
      failed: activeCalls.length - terminated,
    };
  }

  private async killCall(callId: string, reason: string): Promise<boolean> {
    log.info(`Terminating call ${callId} due to ${reason}`);

    const xaiCallId = nativeXAICallId(callId);
    if (xaiCallId) {
      try {
        await hangupXAISipCall(xaiCallId);
        await drizzle
          .update(schema.signalPresence)
          .set({ status: "terminated" })
          .where(eq(schema.signalPresence.id, callId));
        return true;
      } catch (error) {
        log.error("Native xAI DNC hangup could not be confirmed", {
          callId,
          reason,
          errorClass: error instanceof Error ? error.name : typeof error,
        });
        return false;
      }
    }

    const apiKey = process.env.VAPI_PRIVATE_KEY?.trim();
    if (!apiKey) {
      log.error("Cannot terminate rollback Vapi call: VAPI_PRIVATE_KEY is not configured", {
        callId,
        reason,
      });
      return false;
    }

    try {
      const callResponse = await fetchWithTimeout(
        `https://api.vapi.ai/call/${encodeURIComponent(callId)}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          redirect: "error",
        },
        5000,
      );
      if (!callResponse.ok) {
        log.error(`Vapi call lookup rejected for call ${callId}`, {
          reason,
          status: callResponse.status,
        });
        return false;
      }

      const call = (await callResponse.json()) as { monitor?: { controlUrl?: unknown } };
      const controlUrl =
        typeof call.monitor?.controlUrl === "string" ? call.monitor.controlUrl.trim() : "";
      if (!controlUrl || !isAllowedVapiControlUrl(controlUrl)) {
        log.error(`Vapi call ${callId} returned no trusted live control URL`, { reason });
        return false;
      }

      const response = await fetchWithTimeout(
        controlUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "end-call" }),
          redirect: "error",
        },
        5000,
      );

      if (!response.ok) {
        log.error(`Vapi end-call rejected for call ${callId}`, {
          reason,
          status: response.status,
        });
        return false;
      }

      await drizzle
        .update(schema.signalPresence)
        .set({ status: "terminated" })
        .where(eq(schema.signalPresence.id, callId));
      return true;
    } catch (error: any) {
      log.error(`Failed to terminate rollback call ${callId}`, { error: error.message });
      return false;
    }
  }

  private getStateInfo(areaCode: string) {
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

  private getLocalTime(date: Date, timezone: string): Date {
    return new Date(date.toLocaleString("en-US", { timeZone: timezone }));
  }

  private isHoliday(date: Date, state: string): boolean {
    const day = `${date.getMonth() + 1}/${date.getDate()}`;
    const federalHolidays = [
      "1/1",
      "1/19",
      "2/16",
      "5/25",
      "6/19",
      "7/4",
      "9/7",
      "10/12",
      "11/11",
      "11/26",
      "12/25",
    ];

    if (federalHolidays.includes(day)) return true;
    if (state === "LA" && day === "2/17") return true;
    return false;
  }

  private checkBaselineTCPA(): SentinelResult {
    const now = new Date();
    const hour = now.getUTCHours() - 5;
    if (hour < 8 || hour >= 21) {
      return { allowed: false, reason: "OUTSIDE_TCPA_HOURS_EST_FALLBACK" };
    }
    return { allowed: true };
  }
}
