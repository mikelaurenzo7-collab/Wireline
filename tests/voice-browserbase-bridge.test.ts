import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  VoiceBrowserBridge,
  ACTION_FILLER_SEQUENCES,
  DEFAULT_TAKEOVER_FILLER,
  type AsyncBrowserTaskRequest,
} from "../src/lib/cloud-computer/voice-bridge";
import {
  classifyBarrierFromQuestion,
  detectDOMAuthBarrier,
  BARRIER_PATTERNS,
} from "../src/lib/cloud-computer/takeover-detector";
import { resolveTakeoverUrl } from "../src/lib/cloud-computer/takeover-urls";
import * as taskRunner from "../src/lib/cloud-computer/task-runner";
import * as takeoverAlerts from "../src/lib/cloud-computer/takeover-alerts";

describe("VoiceBrowserBridge and Takeover System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Goal Composition & Filler Cadence", () => {
    it("composes actionable goals for lookup_customer", () => {
      const goal = VoiceBrowserBridge.composeGoal(
        "lookup_customer",
        { phone: "555-123-4567", name: "Alice Smith" },
        "https://pro.housecallpro.com",
      );
      expect(goal).toContain("https://pro.housecallpro.com");
      expect(goal).toContain("555-123-4567");
      expect(goal).toContain("Alice Smith");
      expect(goal).toContain("customer record");
    });

    it("composes actionable goals for check_parts_portal", () => {
      const goal = VoiceBrowserBridge.composeGoal(
        "check_parts_portal",
        { partNumber: "HVAC-COMP-900", description: "Carrier Scroll Compressor" },
        "https://parts.supplyhouse.com",
      );
      expect(goal).toContain("https://parts.supplyhouse.com");
      expect(goal).toContain("HVAC-COMP-900");
      expect(goal).toContain("Carrier Scroll Compressor");
      expect(goal).toContain("warehouse availability");
    });

    it("composes actionable goals for mirror_dispatch_job", () => {
      const goal = VoiceBrowserBridge.composeGoal(
        "mirror_dispatch_job",
        {
          customerName: "Bob Jones",
          address: "123 Main St",
          serviceType: "Furnace Tune-up",
          scheduledTime: "Tomorrow 8:00 AM",
        },
        "https://go.servicetitan.com",
      );
      expect(goal).toContain("Bob Jones");
      expect(goal).toContain("123 Main St");
      expect(goal).toContain("Furnace Tune-up");
      expect(goal).toContain("Tomorrow 8:00 AM");
    });

    it("has staged filler sequences for all three actions with at least 3 stages", () => {
      for (const action of ["lookup_customer", "check_parts_portal", "mirror_dispatch_job"] as const) {
        const sequence = ACTION_FILLER_SEQUENCES[action];
        expect(sequence).toBeDefined();
        expect(sequence.length).toBeGreaterThanOrEqual(3);
        for (const phrase of sequence) {
          expect(typeof phrase).toBe("string");
          expect(phrase.length).toBeGreaterThan(10);
        }
      }
    });

    it("normalizes extracted portal data into structured dialogue format", () => {
      const extracted = VoiceBrowserBridge.parseExtractedData(
        "lookup_customer",
        "Found customer Alice Smith at 123 Main St with open invoice #402",
        { phone: "555-123-4567" },
      );
      expect(extracted.action).toBe("lookup_customer");
      expect(extracted.summary).toContain("Alice Smith");
      expect(extracted.parameters).toEqual({ phone: "555-123-4567" });
      expect(extracted.timestamp).toBeDefined();
    });
  });

  describe("Barrier Classification & Detection", () => {
    it("classifies captcha challenges accurately", () => {
      const turnstile = classifyBarrierFromQuestion("Please complete the Cloudflare turnstile challenge.");
      expect(turnstile.detected).toBe(true);
      expect(turnstile.barrierType).toBe("captcha");
      expect(turnstile.provider).toBe("cloudflare_turnstile");

      const recaptcha = classifyBarrierFromQuestion("Solve the Google recaptcha puzzle to continue.");
      expect(recaptcha.detected).toBe(true);
      expect(recaptcha.barrierType).toBe("captcha");
      expect(recaptcha.provider).toBe("google_recaptcha");
    });

    it("classifies 2FA / OTP challenges accurately", () => {
      const otp = classifyBarrierFromQuestion("Enter the 6-digit SMS verification code sent to your phone.");
      expect(otp.detected).toBe(true);
      expect(otp.barrierType).toBe("two_factor");
      expect(otp.provider).toBe("sms_otp");

      const authenticator = classifyBarrierFromQuestion("Please check your authenticator app for the 2FA passcode.");
      expect(authenticator.detected).toBe(true);
      expect(authenticator.barrierType).toBe("two_factor");
      expect(authenticator.provider).toBe("totp_authenticator");
    });

    it("classifies credentials and login prompts accurately", () => {
      const login = classifyBarrierFromQuestion("Please provide your login password for the Housecall Pro portal.");
      expect(login.detected).toBe(true);
      expect(login.barrierType).toBe("credential_required");
      expect(login.provider).toBe("login_form");
    });

    it("defines DOM barrier patterns for Cloudflare, reCAPTCHA, hCaptcha, and OTP inputs", () => {
      expect(BARRIER_PATTERNS.cloudflare.length).toBeGreaterThan(0);
      expect(BARRIER_PATTERNS.recaptcha.length).toBeGreaterThan(0);
      expect(BARRIER_PATTERNS.hcaptcha.length).toBeGreaterThan(0);
      expect(BARRIER_PATTERNS.twoFactorInputs.length).toBeGreaterThan(0);
    });

    it("detects DOM auth barrier when page title indicates Cloudflare challenge", async () => {
      const mockPage = {
        title: vi.fn().mockResolvedValue("Just a moment..."),
        evaluate: vi.fn(),
      } as any;

      const detected = await detectDOMAuthBarrier(mockPage);
      expect(detected).not.toBeNull();
      expect(detected?.detected).toBe(true);
      expect(detected?.barrierType).toBe("captcha");
      expect(detected?.provider).toBe("cloudflare_turnstile");
    });
  });

  describe("Takeover URL Resolver", () => {
    it("returns internal studio URL as fallback when no browserbase session is present", async () => {
      const urls = await resolveTakeoverUrl({
        taskId: "task-abc-123",
        browserbaseSessionId: null,
      });
      expect(urls.provider).toBe("studio");
      expect(urls.fallbackUrl).toContain("/computer?taskId=task-abc-123&takeover=true");
      expect(urls.primaryUrl).toBe(urls.fallbackUrl);
    });

    it("safely falls back to studio url when browserbase debug call fails", async () => {
      const urls = await resolveTakeoverUrl({
        taskId: "task-xyz-789",
        browserbaseSessionId: "session-invalid",
        env: { BROWSERBASE_API_KEY: "bb_key_test" } as any,
      });
      expect(urls.fallbackUrl).toContain("/computer?taskId=task-xyz-789&takeover=true");
      expect(urls.primaryUrl).toBe(urls.fallbackUrl);
      expect(urls.provider).toBe("studio");
    });
  });

  describe("VoiceBrowserBridge Execution Lifecycle", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("initiates task, sends immediate Stage 0 filler, and streams subsequent fillers on running state", async () => {
      const startSpy = vi.spyOn(taskRunner, "startComputerTask").mockResolvedValue({
        id: "task-test-1",
        status: "running",
      } as any);

      let pollCount = 0;
      const getSpy = vi.spyOn(taskRunner, "getComputerTask").mockImplementation(async () => {
        pollCount++;
        if (pollCount >= 2) {
          return {
            id: "task-test-1",
            status: "completed",
            summary: "Extracted customer equipment: Carrier 3-ton heat pump",
          } as any;
        }
        return {
          id: "task-test-1",
          status: "running",
        } as any;
      });

      const fillerHistory: string[] = [];
      const fillerCallback = vi.fn().mockImplementation(async (phrase: string) => {
        fillerHistory.push(phrase);
      });

      const statusHistory: Array<{ status: string; data?: any }> = [];
      const statusCallback = vi.fn().mockImplementation(async (status: string, data?: any) => {
        statusHistory.push({ status, data });
      });

      const req: AsyncBrowserTaskRequest = {
        userId: "user-123",
        callSid: "call-456",
        action: "lookup_customer",
        portalUrl: "https://pro.housecallpro.com",
        parameters: { phone: "555-987-6543" },
        fillerCallback,
        statusCallback,
      };

      const taskPromise = VoiceBrowserBridge.executeAsyncTask(req);
      await Promise.resolve();

      // Verify start was called
      expect(startSpy).toHaveBeenCalledWith("user-123", "default-voice-agent", expect.objectContaining({
        startUrl: "https://pro.housecallpro.com",
      }));

      // Immediate Stage 0 filler
      expect(fillerCallback).toHaveBeenCalledWith(ACTION_FILLER_SEQUENCES.lookup_customer[0]);

      // Advance timer for poll 1 (running -> Stage 1 filler)
      await vi.advanceTimersByTimeAsync(2500);
      expect(fillerCallback).toHaveBeenCalledWith(ACTION_FILLER_SEQUENCES.lookup_customer[1]);

      // Advance timer for poll 2 (completed -> terminal result)
      await vi.advanceTimersByTimeAsync(2500);

      const result = await taskPromise;
      expect(result.success).toBe(true);
      expect(result.taskId).toBe("task-test-1");
      expect(result.extractedData?.summary).toContain("Carrier 3-ton heat pump");
      expect(statusCallback).toHaveBeenCalledWith("completed", expect.objectContaining({
        extractedData: expect.any(Object),
      }));
    });

    it("handles 2FA/CAPTCHA barrier, sends takeover filler, and triggers human alerts", async () => {
      vi.spyOn(taskRunner, "startComputerTask").mockResolvedValue({
        id: "task-2fa-1",
        status: "running",
      } as any);

      vi.spyOn(taskRunner, "getComputerTask").mockResolvedValue({
        id: "task-2fa-1",
        status: "needs_input",
        question: "Please enter the two-factor authentication code sent to your phone.",
      } as any);

      const alertsSpy = vi.spyOn(takeoverAlerts, "dispatchHumanTakeoverAlerts").mockResolvedValue({
        smsSent: true,
        emailSent: true,
        takeoverUrls: {
          primaryUrl: "https://app.botbound.com/computer?taskId=task-2fa-1&takeover=true",
          fallbackUrl: "https://app.botbound.com/computer?taskId=task-2fa-1&takeover=true",
          provider: "studio",
        },
      });

      const fillerCallback = vi.fn().mockResolvedValue(undefined);
      const statusCallback = vi.fn().mockResolvedValue(undefined);

      const req: AsyncBrowserTaskRequest = {
        userId: "user-123",
        callSid: "call-456",
        customerPhone: "555-555-5555",
        action: "check_parts_portal",
        portalUrl: "https://supplier.portal",
        parameters: { partNumber: "VALVE-01" },
        fillerCallback,
        statusCallback,
      };

      const taskPromise = VoiceBrowserBridge.executeAsyncTask(req);
      await Promise.resolve();
      await Promise.resolve();

      // Advance timer 2.5s to poll status
      await vi.advanceTimersByTimeAsync(2500);
      await Promise.resolve();
      await Promise.resolve();

      // Status callback should have received waiting_2fa
      expect(statusCallback).toHaveBeenCalledWith("waiting_2fa", expect.objectContaining({
        barrierType: "two_factor",
      }));

      // Filler callback should have received DEFAULT_TAKEOVER_FILLER
      expect(fillerCallback).toHaveBeenCalledWith(DEFAULT_TAKEOVER_FILLER);

      // Alert dispatcher should have been invoked
      expect(alertsSpy).toHaveBeenCalledWith(expect.objectContaining({
        userId: "user-123",
        taskId: "task-2fa-1",
        customerPhone: "555-555-5555",
      }));

      // Abort to clean up timer
      await VoiceBrowserBridge.abortTask("user-123", "task-2fa-1");
      const result = await taskPromise;
      expect(result.success).toBe(false);
    });

    it("terminates with failure when task transitions to failed status", async () => {
      vi.spyOn(taskRunner, "startComputerTask").mockResolvedValue({
        id: "task-failed-1",
        status: "running",
      } as any);

      vi.spyOn(taskRunner, "getComputerTask").mockResolvedValue({
        id: "task-failed-1",
        status: "failed",
        summary: "Could not find part in catalog",
        errorCode: "PART_NOT_FOUND",
      } as any);

      const fillerCallback = vi.fn().mockResolvedValue(undefined);
      const statusCallback = vi.fn().mockResolvedValue(undefined);

      const req: AsyncBrowserTaskRequest = {
        userId: "user-123",
        callSid: "call-456",
        action: "check_parts_portal",
        portalUrl: "https://parts.com",
        parameters: { partNumber: "NONEXISTENT" },
        fillerCallback,
        statusCallback,
      };

      const taskPromise = VoiceBrowserBridge.executeAsyncTask(req);
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(2500);
      await Promise.resolve();

      const result = await taskPromise;
      expect(result.success).toBe(false);
      expect(result.taskId).toBe("task-failed-1");
      expect(result.error).toContain("Could not find part in catalog");
      expect(statusCallback).toHaveBeenCalledWith("failed", expect.objectContaining({
        error: "Could not find part in catalog",
      }));
    });

    it("aborts active task cleanly and invokes stopComputerTask", async () => {
      vi.spyOn(taskRunner, "startComputerTask").mockResolvedValue({
        id: "task-abort-1",
        status: "running",
      } as any);

      const stopSpy = vi.spyOn(taskRunner, "stopComputerTask").mockResolvedValue({} as any);
      vi.spyOn(taskRunner, "getComputerTask").mockResolvedValue({
        id: "task-abort-1",
        status: "running",
      } as any);

      const req: AsyncBrowserTaskRequest = {
        userId: "user-123",
        callSid: "call-456",
        action: "mirror_dispatch_job",
        portalUrl: "https://dispatch.portal",
        parameters: {},
        fillerCallback: vi.fn().mockResolvedValue(undefined),
        statusCallback: vi.fn().mockResolvedValue(undefined),
      };

      const taskPromise = VoiceBrowserBridge.executeAsyncTask(req);
      await Promise.resolve();
      await Promise.resolve();

      await VoiceBrowserBridge.abortTask("user-123", "task-abort-1");
      expect(stopSpy).toHaveBeenCalledWith("user-123", "task-abort-1");

      const result = await taskPromise;
      expect(result.success).toBe(false);
      expect(result.error).toBe("Task aborted");
    });
  });
});
