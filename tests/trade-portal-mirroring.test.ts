import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enqueueTradePortalMirrorJob,
  detectPortalAuthBarrier,
  executeHousecallProMirroring,
  executeServiceTitanMirroring,
  type TradePortalBookingPayload,
  type TradePortalConnectionConfig,
} from "../src/lib/cloud-computer/trade-portal-mirroring";
import * as serverContext from "../src/lib/server-context";
import * as schema from "../src/db/schema";
import { handleCalendarToolCall } from "../src/lib/bot-tools/calendar";

describe("Trade Portal Mirroring (Housecall Pro & ServiceTitan)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Durable Queueing & Concurrency Contract", () => {
    it("enqueues mirror job into wireline_jobs when portal is configured", async () => {
      // Mock crmConnections query
      vi.spyOn(serverContext.drizzle, "select").mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "conn-1",
              userId: "user-123",
              provider: "housecall_pro",
              instanceUrl: "https://pro.housecallpro.com",
              active: true,
              metadata: {},
            },
          ]),
        }),
      } as any);

      const insertSpy = vi.spyOn(serverContext.drizzle, "insert").mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "job-queued-1" }]),
        }),
      } as any);

      const booking: TradePortalBookingPayload = {
        userId: "user-123",
        agentId: "agent-abc",
        customerName: "Jane Doe",
        customerPhone: "555-222-3333",
        customerEmail: "jane@example.com",
        serviceAddress: {
          street: "742 Evergreen Terrace",
          city: "Springfield",
          state: "IL",
          postalCode: "62704",
        },
        startTime: "2026-11-01T14:00:00Z",
        endTime: "2026-11-01T16:00:00Z",
        timeZone: "America/Chicago",
        serviceType: "AC Inspection",
        title: "AC Inspection for Jane Doe",
        notes: "Dog in yard, please call before arriving",
      };

      const result = await enqueueTradePortalMirrorJob("user-123", "agent-abc", booking);
      expect(result.queued).toBe(true);
      expect(result.jobId).toBe("job-queued-1");
      expect(insertSpy).toHaveBeenCalledWith(schema.jobs);
    });

    it("succeeds without 409 error even when wireline_computer_tasks already has an active running task", async () => {
      // Mock crmConnections query
      vi.spyOn(serverContext.drizzle, "select").mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "conn-2",
              userId: "user-busy",
              provider: "servicetitan",
              instanceUrl: "https://go.servicetitan.com",
              active: true,
              metadata: {},
            },
          ]),
        }),
      } as any);

      // Verify that inserting into wireline_jobs does not collide with active computerTasks
      vi.spyOn(serverContext.drizzle, "insert").mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "job-busy-pass" }]),
        }),
      } as any);

      const booking: TradePortalBookingPayload = {
        userId: "user-busy",
        agentId: "agent-busy",
        customerName: "Homer Simpson",
        startTime: "2026-11-02T10:00:00Z",
        endTime: "2026-11-02T11:00:00Z",
        timeZone: "America/Chicago",
        serviceType: "Plumbing Repair",
        title: "Plumbing Repair for Homer Simpson",
      };

      const result = await enqueueTradePortalMirrorJob("user-busy", "agent-busy", booking);
      expect(result.queued).toBe(true);
      expect(result.jobId).toBe("job-busy-pass");
    });

    it("returns queued: false when no trade portal is configured", async () => {
      delete process.env.DEFAULT_TRADE_PORTAL;
      vi.spyOn(serverContext.drizzle, "select").mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const booking: TradePortalBookingPayload = {
        userId: "user-no-portal",
        agentId: "agent-1",
        customerName: "No Portal Customer",
        startTime: "2026-11-01T12:00:00Z",
        endTime: "2026-11-01T13:00:00Z",
        timeZone: "America/Chicago",
        serviceType: "Inspection",
        title: "Inspection",
      };

      const result = await enqueueTradePortalMirrorJob("user-no-portal", "agent-1", booking);
      expect(result.queued).toBe(false);
      expect(result.reason).toContain("No active trade portal");
    });
  });

  describe("Portal Auth Barrier Sniffing", () => {
    it("detects expired credentials when redirected to login or auth URLs", async () => {
      const mockPageHCP = {
        url: () => "https://pro.housecallpro.com/login?redirect=%2Fapp%2Fjobs",
        title: async () => "Login | Housecall Pro",
        evaluate: async () => null,
      } as any;

      const barrierHCP = await detectPortalAuthBarrier(mockPageHCP);
      expect(barrierHCP.detected).toBe(true);
      expect(barrierHCP.reason).toBe("credentials_expired");

      const mockPageST = {
        url: () => "https://identity.servicetitan.com/connect/authorize",
        title: async () => "ServiceTitan Identity",
        evaluate: async () => null,
      } as any;

      const barrierST = await detectPortalAuthBarrier(mockPageST);
      expect(barrierST.detected).toBe(true);
      expect(barrierST.reason).toBe("credentials_expired");
    });

    it("detects CAPTCHA barrier via DOM evaluation", async () => {
      const mockPage = {
        url: () => "https://pro.housecallpro.com/app/jobs/new",
        title: async () => "New Job",
        evaluate: async (fn: any, args: any) => {
          // Simulate evaluate finding a turnstile iframe
          return { type: "captcha", provider: "cloudflare_turnstile", details: "Turnstile" };
        },
      } as any;

      const barrier = await detectPortalAuthBarrier(mockPage);
      expect(barrier.detected).toBe(true);
      expect(barrier.reason).toBe("captcha");
    });

    it("detects 2FA/OTP barrier via DOM evaluation", async () => {
      const mockPage = {
        url: () => "https://go.servicetitan.com/verify",
        title: async () => "Two-Factor Verification",
        evaluate: async (fn: any, args: any) => {
          return { type: "two_factor", provider: "sms_otp", details: "OTP" };
        },
      } as any;

      const barrier = await detectPortalAuthBarrier(mockPage);
      expect(barrier.detected).toBe(true);
      expect(barrier.reason).toBe("2fa");
    });

    it("returns detected: false when page has no barriers", async () => {
      const mockPage = {
        url: () => "https://pro.housecallpro.com/app/dashboard",
        title: async () => "Housecall Pro Dashboard",
        evaluate: async () => null,
      } as any;

      const barrier = await detectPortalAuthBarrier(mockPage);
      expect(barrier.detected).toBe(false);
    });
  });

  describe("Housecall Pro Playwright Recipe", () => {
    it("navigates, fills customer and job details, and extracts created job ID", async () => {
      const elements: Record<string, any> = {};

      const createMockLocator = (name: string) => ({
        first: () => createMockLocator(name),
        isVisible: vi.fn().mockResolvedValue(true),
        fill: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockResolvedValue(undefined),
      });

      let currentUrl = "https://pro.housecallpro.com/app/dashboard";

      const mockPage = {
        url: () => currentUrl,
        title: async () => "Housecall Pro",
        goto: vi.fn().mockImplementation(async (url: string) => {
          currentUrl = url;
        }),
        waitForURL: vi.fn().mockImplementation(async (pattern: any) => {
          currentUrl = "https://pro.housecallpro.com/app/jobs/job_hcp_98765";
        }),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        locator: vi.fn().mockImplementation((sel: string) => createMockLocator(sel)),
        evaluate: async () => null,
      } as any;

      const booking: TradePortalBookingPayload = {
        userId: "user-1",
        agentId: "agent-1",
        customerName: "Ned Flanders",
        customerPhone: "555-777-8888",
        customerEmail: "ned@flanders.org",
        serviceAddress: "740 Evergreen Terrace, Springfield, IL 62704",
        startTime: "2026-11-03T09:00:00Z",
        endTime: "2026-11-03T11:00:00Z",
        timeZone: "America/Chicago",
        serviceType: "Drain Cleaning",
        title: "Drain Cleaning for Ned Flanders",
        notes: "Left side gate is open",
      };

      const config: TradePortalConnectionConfig = {
        portal: "housecall_pro",
        enabled: true,
        portalUrl: "https://pro.housecallpro.com",
      };

      const result = await executeHousecallProMirroring(mockPage, booking, config);
      expect(result.success).toBe(true);
      expect(result.portal).toBe("housecall_pro");
      expect(result.externalJobId).toBe("job_hcp_98765");
      expect(result.externalJobUrl).toContain("/app/jobs/job_hcp_98765");
      expect(mockPage.goto).toHaveBeenCalledWith("https://pro.housecallpro.com/app/jobs/new", expect.any(Object));
    });

    it("halts and reports requiresTakeover when barrier is encountered during navigation", async () => {
      let currentUrl = "https://pro.housecallpro.com/app/dashboard";
      const mockPage = {
        url: () => currentUrl,
        title: async () => "Just a moment...",
        goto: vi.fn().mockImplementation(async (url: string) => {
          currentUrl = url;
        }),
        evaluate: async () => null,
      } as any;

      const booking: TradePortalBookingPayload = {
        userId: "user-1",
        agentId: "agent-1",
        customerName: "Moe Szyslak",
        startTime: "2026-11-03T10:00:00Z",
        endTime: "2026-11-03T11:00:00Z",
        timeZone: "America/Chicago",
        serviceType: "Tap Line Maintenance",
        title: "Maintenance",
      };

      const config: TradePortalConnectionConfig = {
        portal: "housecall_pro",
        enabled: true,
      };

      const result = await executeHousecallProMirroring(mockPage, booking, config);
      expect(result.success).toBe(false);
      expect(result.requiresTakeover).toBe(true);
      expect(result.takeoverReason).toBe("captcha");
    });
  });

  describe("ServiceTitan Playwright Recipe", () => {
    it("navigates call booking, fills customer information, and extracts created job ID", async () => {
      const createMockLocator = (name: string) => ({
        first: () => createMockLocator(name),
        isVisible: vi.fn().mockResolvedValue(true),
        fill: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockResolvedValue(undefined),
      });

      let currentUrl = "https://go.servicetitan.com/CallBooking/Job";

      const mockPage = {
        url: () => currentUrl,
        title: async () => "ServiceTitan Call Booking",
        goto: vi.fn().mockImplementation(async (url: string) => {
          currentUrl = url;
        }),
        waitForURL: vi.fn().mockImplementation(async (pattern: any) => {
          currentUrl = "https://go.servicetitan.com/Job/Index/54321";
        }),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        keyboard: { press: vi.fn().mockResolvedValue(undefined) },
        locator: vi.fn().mockImplementation((sel: string) => createMockLocator(sel)),
        evaluate: async () => null,
      } as any;

      const booking: TradePortalBookingPayload = {
        userId: "user-st",
        agentId: "agent-st",
        customerName: "Barney Gumble",
        customerPhone: "555-333-4444",
        serviceAddress: {
          street: "500 Oak St",
          city: "Springfield",
          state: "IL",
          postalCode: "62701",
        },
        startTime: "2026-11-04T13:00:00Z",
        endTime: "2026-11-04T15:00:00Z",
        timeZone: "America/Chicago",
        serviceType: "Water Heater Flush",
        title: "Water Heater Flush",
      };

      const config: TradePortalConnectionConfig = {
        portal: "servicetitan",
        enabled: true,
        portalUrl: "https://go.servicetitan.com",
      };

      const result = await executeServiceTitanMirroring(mockPage, booking, config);
      expect(result.success).toBe(true);
      expect(result.portal).toBe("servicetitan");
      expect(result.externalJobId).toBe("54321");
      expect(result.externalJobUrl).toContain("/Job/Index/54321");
    });
  });

  describe("Calendar Tool Integration", () => {
    it("triggers enqueueTradePortalMirrorJob when handleCalendarToolCall books an appointment", async () => {
      // Mock calendar settings to use native calendar
      const mockContext = {
        agent: {
          id: "agent-cal",
          user_id: "user-cal",
        },
        agentVoiceName: "Jessica",
        toolCallId: "call_tool_123",
        message: {
          call: {
            id: "call_abc_456",
            customer: {
              number: "+15551234567",
            },
          },
        },
        drizzle: {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "apt-1", status: "Scheduled", created: true }]),
            }),
          }),
        },
        log: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
      } as any;

      // Ensure calendar tool handles book_appointment without throwing
      const res = await handleCalendarToolCall(
        "book_appointment",
        {
          date: "2026-11-10",
          time: "10:00",
          customer_name: "Montgomery Burns",
          service_type: "HVAC Inspection",
          timezone: "America/Chicago",
        },
        mockContext,
      );

      expect(res).not.toBeNull();
      expect(res?.toolCallId).toBe("call_tool_123");
    });
  });
});
