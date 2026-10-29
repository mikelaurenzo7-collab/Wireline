/**
 * src/lib/cloud-computer/voice-bridge.ts
 *
 * Real-time Voice-to-Browserbase Bridge.
 * Orchestrates non-blocking cloud computer tasks, conversational filler injection,
 * portal data ingestion, and 2FA/CAPTCHA owner takeover alerts during active voice calls.
 */

import { log } from "../server-context";
import {
  startComputerTask,
  getComputerTask,
  stopComputerTask,
  type ComputerTaskView,
} from "./task-runner";
import { classifyBarrierFromQuestion } from "./takeover-detector";
import { dispatchHumanTakeoverAlerts } from "./takeover-alerts";

export interface AsyncBrowserTaskRequest {
  userId: string;
  callSid: string;
  agentId?: string;
  customerPhone?: string;
  action: "lookup_customer" | "check_parts_portal" | "mirror_dispatch_job";
  portalUrl: string;
  parameters: Record<string, unknown>;
  fillerCallback: (phrase: string) => Promise<void>;
  statusCallback: (
    status: "running" | "waiting_2fa" | "completed" | "failed",
    data?: unknown,
  ) => Promise<void>;
}

export interface AsyncBrowserTaskResult {
  taskId: string;
  success: boolean;
  extractedData?: Record<string, unknown>;
  requiresTakeover?: boolean;
  takeoverReason?: "captcha" | "two_factor" | "credential_required";
  error?: string;
}

/** Action-specific filler phrases organized by time stage (2.5s cadence) */
export const ACTION_FILLER_SEQUENCES: Record<AsyncBrowserTaskRequest["action"], string[]> = {
  lookup_customer: [
    "I'm opening the customer records in our portal right now, one moment...",
    "Still pulling up the account history and service notes...",
    "Almost there, just opening the latest equipment records...",
    "Thanks for your patience, finalizing the customer details now...",
  ],
  check_parts_portal: [
    "I'm checking our supplier catalog for that part now, one second...",
    "Searching inventory availability and contractor pricing in the database...",
    "Still scanning the distributor warehouse ledger, almost got it...",
    "Verifying stock levels and delivery ETA for you now...",
  ],
  mirror_dispatch_job: [
    "I'm syncing this appointment directly onto the dispatch board now...",
    "Updating the technician schedule and job details in the portal...",
    "Confirming the dispatch slot and booking confirmation code...",
    "Just finalizing the job dispatch record, one moment...",
  ],
};

export const DEFAULT_TAKEOVER_FILLER =
  "I've encountered a secure verification gate on the portal. I'm pinging our dispatch manager right now to approve access so we can continue.";

export const HOLD_TAKEOVER_FILLERS = [
  "Still waiting on that quick approval from our office team, won't be much longer...",
  "Thanks for your patience, our manager is reviewing the portal verification now.",
  "Almost there, just waiting for the screen to refresh...",
];

export class VoiceBrowserBridge {
  private static activeTasks = new Map<
    string,
    {
      timer: NodeJS.Timeout;
      aborted: boolean;
      waiting2faSince: number | null;
      lastHoldFillerAt: number;
      resolve: (res: AsyncBrowserTaskResult) => void;
    }
  >();

  /**
   * Executes an asynchronous browser automation task while streaming
   * natural conversational fillers to the caller every 2.5 seconds.
   */
  public static async executeAsyncTask(
    req: AsyncBrowserTaskRequest,
  ): Promise<AsyncBrowserTaskResult> {
    const {
      userId,
      callSid,
      agentId = "default-voice-agent",
      customerPhone,
      action,
      portalUrl,
      parameters,
      fillerCallback,
      statusCallback,
    } = req;

    log.info("[VoiceBrowserBridge] Initiating async browser task", {
      userId,
      callSid,
      action,
      portalUrl,
    });

    // 1. Send immediate initial filler (Stage 0) so caller hears zero silence
    const fillers = ACTION_FILLER_SEQUENCES[action] || ACTION_FILLER_SEQUENCES.lookup_customer;
    let fillerIndex = 0;
    if (fillers[0]) {
      void fillerCallback(fillers[0]).catch((e) =>
        log.warn("[VoiceBrowserBridge] Failed sending initial filler", { error: String(e) }),
      );
      fillerIndex = 1;
    }

    // 2. Compose actionable browser goal
    const goal = VoiceBrowserBridge.composeGoal(action, parameters, portalUrl);

    // 3. Start computer task in non-blocking mode
    let taskView: ComputerTaskView;
    try {
      taskView = await startComputerTask(userId, agentId, {
        goal,
        startUrl: portalUrl,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("[VoiceBrowserBridge] Failed to launch computer task", { error: errorMsg });
      await statusCallback("failed", { error: errorMsg });
      return { taskId: "", success: false, error: errorMsg };
    }

    const taskId = taskView.id;
    void statusCallback("running", { taskId }).catch((e) =>
      log.warn("[VoiceBrowserBridge] Failed sending running status", { error: String(e) }),
    );

    return new Promise<AsyncBrowserTaskResult>((resolve) => {
      let intervalTimer: NodeJS.Timeout;
      let alertedBarrier = false;

      const cleanup = () => {
        clearInterval(intervalTimer);
        VoiceBrowserBridge.activeTasks.delete(taskId);
      };

      intervalTimer = setInterval(async () => {
        const entry = VoiceBrowserBridge.activeTasks.get(taskId);
        if (!entry || entry.aborted) {
          cleanup();
          resolve({ taskId, success: false, error: "Task aborted" });
          return;
        }

        try {
          const current = await getComputerTask(userId, taskId);

          // Handle 2FA / CAPTCHA barrier
          if (current.status === "needs_input") {
            const barrier = classifyBarrierFromQuestion(current.question || "");
            const isAuthBarrier =
              barrier.barrierType === "captcha" ||
              barrier.barrierType === "two_factor" ||
              barrier.barrierType === "credential_required";

            if (isAuthBarrier) {
              if (!entry.waiting2faSince) {
                entry.waiting2faSince = Date.now();
                entry.lastHoldFillerAt = Date.now();
              }

              if (!alertedBarrier) {
                alertedBarrier = true;
                log.warn("[VoiceBrowserBridge] 2FA/CAPTCHA barrier encountered", {
                  taskId,
                  question: current.question,
                  barrierType: barrier.barrierType,
                });

                await statusCallback("waiting_2fa", {
                  question: current.question,
                  barrierType: barrier.barrierType,
                });
                await fillerCallback(DEFAULT_TAKEOVER_FILLER);

                // Dispatch concurrent alerts via Twilio SMS and AgentMail
                void dispatchHumanTakeoverAlerts({
                  userId,
                  agentId,
                  taskId,
                  callSid,
                  customerPhone,
                  barrier,
                  portalUrl,
                }).catch((e) =>
                  log.error("[VoiceBrowserBridge] Failed dispatching takeover alerts", {
                    error: String(e),
                  }),
                );
              } else {
                // Periodic hold filler every 15s during active 2FA wait
                const now = Date.now();
                if (now - entry.lastHoldFillerAt >= 15_000) {
                  entry.lastHoldFillerAt = now;
                  const holdIndex =
                    Math.floor((now - (entry.waiting2faSince || now)) / 15_000) %
                    HOLD_TAKEOVER_FILLERS.length;
                  const holdPhrase = HOLD_TAKEOVER_FILLERS[holdIndex];
                  if (holdPhrase) {
                    await fillerCallback(holdPhrase);
                  }
                }

                // Voice 2FA wait timeout (60s)
                if (now - (entry.waiting2faSince || now) > 60_000) {
                  log.warn("[VoiceBrowserBridge] 2FA wait timeout reached in voice call", {
                    taskId,
                  });
                  cleanup();
                  await statusCallback("failed", {
                    reason: "timeout_waiting_2fa",
                    takeoverReason: barrier.barrierType,
                  });
                  resolve({
                    taskId,
                    success: false,
                    requiresTakeover: true,
                    takeoverReason: barrier.barrierType as AsyncBrowserTaskResult["takeoverReason"],
                    error: "Takeover timed out after 60 seconds",
                  });
                  return;
                }
              }
              return;
            }
          }

          // Handle Task Completion
          if (current.status === "completed") {
            cleanup();
            const extractedData = VoiceBrowserBridge.parseExtractedData(
              action,
              current.summary || "",
              parameters,
            );
            await statusCallback("completed", { extractedData });
            resolve({
              taskId,
              success: true,
              extractedData,
            });
            return;
          }

          // Handle Task Failure
          if (
            current.status === "failed" ||
            current.status === "blocked" ||
            current.status === "stopped" ||
            current.status === "interrupted"
          ) {
            cleanup();
            await statusCallback("failed", {
              error: current.summary,
              errorCode: current.errorCode,
            });
            resolve({
              taskId,
              success: false,
              requiresTakeover: current.status === "blocked",
              error: current.summary || "Task terminated",
            });
            return;
          }

          // Task still running -> inject next contextual status filler
          if (current.status === "running" && fillerIndex < fillers.length) {
            const nextFiller = fillers[fillerIndex++];
            await fillerCallback(nextFiller);
          }
        } catch (err) {
          log.warn("[VoiceBrowserBridge] Error polling task status", {
            taskId,
            error: String(err),
          });
        }
      }, 2500); // 2.5s cadence

      VoiceBrowserBridge.activeTasks.set(taskId, {
        timer: intervalTimer,
        aborted: false,
        waiting2faSince: null,
        lastHoldFillerAt: Date.now(),
        resolve,
      });
    });
  }

  /** Aborts an active background task if the caller hangs up or cancels */
  public static async abortTask(userId: string, taskId: string): Promise<void> {
    const entry = VoiceBrowserBridge.activeTasks.get(taskId);
    if (entry) {
      entry.aborted = true;
      clearInterval(entry.timer);
      entry.resolve({ taskId, success: false, error: "Task aborted" });
      VoiceBrowserBridge.activeTasks.delete(taskId);
    }
    await stopComputerTask(userId, taskId).catch(() => null);
  }

  /** Composes actionable instructions for the Cloud Computer agent */
  public static composeGoal(
    action: AsyncBrowserTaskRequest["action"],
    params: Record<string, unknown>,
    portalUrl: string,
  ): string {
    switch (action) {
      case "lookup_customer":
        return `Navigate to ${portalUrl}. Search customer record by phone "${params.phone || ""}" or name "${params.name || ""}". Extract customer address, equipment details, and recent service history.`;
      case "check_parts_portal":
        return `Navigate to ${portalUrl}. Search catalog for part number "${params.partNumber || ""}" or query "${params.description || ""}". Extract warehouse availability, price, and delivery ETA.`;
      case "mirror_dispatch_job":
        return `Navigate to ${portalUrl}. Create or mirror dispatch booking for customer "${params.customerName || ""}" at "${params.address || ""}" for service "${params.serviceType || ""}" scheduled at "${params.scheduledTime || ""}". Confirm and return the job confirmation ID.`;
      default:
        return `Navigate to ${portalUrl} and perform: ${JSON.stringify(params)}`;
    }
  }

  /** Normalizes raw agent output into structured dialogue data */
  public static parseExtractedData(
    action: AsyncBrowserTaskRequest["action"],
    summary: string,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      action,
      summary,
      parameters: params,
      timestamp: new Date().toISOString(),
    };
  }
}
