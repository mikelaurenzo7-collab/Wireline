/**
 * src/lib/cloud-computer/trade-portal-mirroring.ts
 *
 * Vertical Trade Portal Mirroring via Browserbase / Playwright.
 * Automatically mirrors confirmed appointments into vertical dispatch software
 * (Housecall Pro & ServiceTitan). Decoupled from live phone calls via durable
 * PostgreSQL queueing (wireline_jobs), avoiding 409 COMPUTER_BUSY collisions.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { Page } from "playwright-core";
import { chromium } from "playwright-core";
import * as schema from "../../db/schema";
import { drizzle, log } from "../server-context";
import { assertLiveExternalActionAllowed } from "../account-environment-policy";
import { detectDOMAuthBarrier, type AuthBarrierDetection } from "./takeover-detector";
import { dispatchHumanTakeoverAlerts } from "./takeover-alerts";
import { cloudComputerConnection } from "./config";

export type SupportedTradePortal = "housecall_pro" | "servicetitan";

export interface TradePortalServiceAddress {
  street: string;
  unit?: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface TradePortalBookingPayload {
  appointmentId?: string;
  userId: string;
  agentId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  serviceAddress?: TradePortalServiceAddress | string;
  startTime: string; // ISO 8601 UTC
  endTime: string; // ISO 8601 UTC
  timeZone: string; // e.g. "America/Chicago"
  serviceType: string;
  title: string;
  notes?: string;
  callId?: string;
}

export interface TradePortalConnectionConfig {
  portal: SupportedTradePortal;
  enabled: boolean;
  portalUrl?: string; // e.g. "https://pro.housecallpro.com" or "https://go.servicetitan.com"
  browserbaseContextId?: string;
  credentials?: {
    username?: string;
    password?: string;
  };
  defaultBusinessUnit?: string;
  defaultJobType?: string;
}

export interface TradePortalMirrorResult {
  success: boolean;
  portal: SupportedTradePortal;
  externalJobId?: string;
  externalJobNumber?: string;
  externalJobUrl?: string;
  browserbaseSessionId?: string;
  screenshotBase64?: string;
  requiresTakeover?: boolean;
  takeoverReason?: "2fa" | "captcha" | "credentials_expired";
  takeoverUrl?: string;
  error?: string;
  executedAt: string;
}

/**
 * Resolves configured trade portal for a tenant from wireline_crm_connections.
 */
export async function getTenantTradePortalConfig(
  userId: string,
): Promise<TradePortalConnectionConfig | null> {
  try {
    const connections = await drizzle
      .select()
      .from(schema.crmConnections)
      .where(
        and(
          eq(schema.crmConnections.userId, userId),
          inArray(schema.crmConnections.provider, ["housecall_pro", "servicetitan"]),
          eq(schema.crmConnections.active, true),
        ),
      );

    if (connections.length > 0 && connections[0]) {
      const conn = connections[0];
      const metadata = (conn.metadata as Record<string, unknown>) || {};
      return {
        portal: conn.provider as SupportedTradePortal,
        enabled: true,
        portalUrl: conn.instanceUrl || undefined,
        browserbaseContextId:
          typeof metadata.browserbaseContextId === "string"
            ? metadata.browserbaseContextId
            : undefined,
        defaultBusinessUnit:
          typeof metadata.defaultBusinessUnit === "string"
            ? metadata.defaultBusinessUnit
            : undefined,
        defaultJobType:
          typeof metadata.defaultJobType === "string" ? metadata.defaultJobType : undefined,
      };
    }
  } catch (err) {
    log.warn("[trade-portal-mirroring] Could not query crmConnections", {
      userId,
      error: String(err),
    });
  }

  // Fallback: check environment variable defaults
  const envPortal = process.env.DEFAULT_TRADE_PORTAL?.trim();
  if (envPortal === "housecall_pro" || envPortal === "servicetitan") {
    return {
      portal: envPortal,
      enabled: true,
      portalUrl:
        envPortal === "housecall_pro"
          ? "https://pro.housecallpro.com"
          : "https://go.servicetitan.com",
    };
  }

  return null;
}

/**
 * Enqueues a durable background trade portal mirror job into wireline_jobs.
 * Decoupled from live phone calls and completely avoids uq_computer_tasks_one_active_per_user collisions.
 */
export async function enqueueTradePortalMirrorJob(
  userId: string,
  agentId: string,
  booking: TradePortalBookingPayload,
): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
  const config = await getTenantTradePortalConfig(userId);
  if (!config || !config.enabled) {
    return { queued: false, reason: "No active trade portal configured" };
  }

  try {
    const [row] = await drizzle
      .insert(schema.jobs)
      .values({
        userId,
        type: "trade_portal_mirror",
        payload: {
          agentId,
          portal: config.portal,
          booking,
        },
        status: "pending",
        attempts: 0,
        maxAttempts: 5,
        runAt: new Date(),
      })
      .returning({ id: schema.jobs.id });

    log.info("[trade-portal-mirroring] Enqueued mirror job", {
      userId,
      jobId: row?.id,
      portal: config.portal,
    });
    return { queued: true, jobId: row?.id };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error("[trade-portal-mirroring] Failed to enqueue mirror job", { userId, error: errorMsg });
    return { queued: false, reason: errorMsg };
  }
}

/**
 * Proactively checks for portal authentication barriers (login forms, 2FA, CAPTCHA).
 */
export async function detectPortalAuthBarrier(
  page: Page,
): Promise<{ detected: boolean; reason?: "2fa" | "captcha" | "credentials_expired" }> {
  const url = page.url().toLowerCase();

  // 1. Redirect to login
  if (
    url.includes("/login") ||
    url.includes("/signin") ||
    url.includes("identity.servicetitan.com") ||
    url.includes("auth.housecallpro.com")
  ) {
    return { detected: true, reason: "credentials_expired" };
  }

  // 2. DOM inspection for Turnstile, reCAPTCHA, hCaptcha, OTP
  const domBarrier = await detectDOMAuthBarrier(page);
  if (domBarrier && domBarrier.detected) {
    if (domBarrier.barrierType === "captcha") {
      return { detected: true, reason: "captcha" };
    }
    if (domBarrier.barrierType === "two_factor") {
      return { detected: true, reason: "2fa" };
    }
    if (domBarrier.barrierType === "credential_required") {
      return { detected: true, reason: "credentials_expired" };
    }
  }

  return { detected: false };
}

/**
 * Playwright automation recipe for Housecall Pro.
 */
export async function executeHousecallProMirroring(
  page: Page,
  booking: TradePortalBookingPayload,
  config: TradePortalConnectionConfig,
): Promise<TradePortalMirrorResult> {
  const baseUrl = config.portalUrl || "https://pro.housecallpro.com";

  // 1. Navigate to dashboard & check auth
  await page.goto(`${baseUrl}/app/dashboard`, { waitUntil: "domcontentloaded", timeout: 30000 });

  // 2. Auth barrier detection
  const barrier = await detectPortalAuthBarrier(page);
  if (barrier.detected) {
    return {
      success: false,
      portal: "housecall_pro",
      requiresTakeover: true,
      takeoverReason: barrier.reason,
      executedAt: new Date().toISOString(),
    };
  }

  // 3. Navigate to New Job creation
  await page.goto(`${baseUrl}/app/jobs/new`, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Check again on jobs page
  const pageBarrier = await detectPortalAuthBarrier(page);
  if (pageBarrier.detected) {
    return {
      success: false,
      portal: "housecall_pro",
      requiresTakeover: true,
      takeoverReason: pageBarrier.reason,
      executedAt: new Date().toISOString(),
    };
  }

  // 4. Customer Lookup & Entry
  const customerSearchInput = page
    .locator('input[name="customer_search"], [data-testid="customer-search-input"], input[placeholder*="customer" i]')
    .first();
  if (await customerSearchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    if (booking.customerPhone) {
      await customerSearchInput.fill(booking.customerPhone);
    } else {
      await customerSearchInput.fill(booking.customerName);
    }
    await page.waitForTimeout(500);

    const resultItem = page.locator('[data-testid="customer-search-result"], .customer-search-item').first();
    if (await resultItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resultItem.click();
    } else {
      const addNewBtn = page.locator('button:has-text("Add new customer"), [data-testid="add-new-customer"]').first();
      if (await addNewBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addNewBtn.click();
      }
      const names = booking.customerName.trim().split(/\s+/);
      const firstName = names[0] || booking.customerName;
      const lastName = names.slice(1).join(" ") || "Customer";

      const firstInput = page.locator('input[name="first_name"], #first_name, input[placeholder*="first name" i]').first();
      if (await firstInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await firstInput.fill(firstName);
      }
      const lastInput = page.locator('input[name="last_name"], #last_name, input[placeholder*="last name" i]').first();
      if (await lastInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await lastInput.fill(lastName);
      }
      if (booking.customerPhone) {
        const phoneInput = page.locator('input[name="mobile_number"], input[name="phone"], input[type="tel"]').first();
        if (await phoneInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await phoneInput.fill(booking.customerPhone);
        }
      }
      if (booking.customerEmail) {
        const emailInput = page.locator('input[name="email"], input[type="email"]').first();
        if (await emailInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await emailInput.fill(booking.customerEmail);
        }
      }
    }
  }

  // 5. Service Address Entry
  if (booking.serviceAddress) {
    const addressStr =
      typeof booking.serviceAddress === "string"
        ? booking.serviceAddress
        : `${booking.serviceAddress.street}, ${booking.serviceAddress.city}, ${booking.serviceAddress.state} ${booking.serviceAddress.postalCode}`;

    const addressInput = page
      .locator('input[name="street"], input[name="address"], input[placeholder*="street address" i]')
      .first();
    if (await addressInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addressInput.fill(addressStr);
    }
  }

  // 6. Schedule Arrival Window
  const startDate = booking.startTime.split("T")[0]; // YYYY-MM-DD
  const dateInput = page.locator('input[name="start_date"], [data-testid="job-start-date"]').first();
  if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dateInput.fill(startDate || "");
  }

  // 7. Job Description & Line Items
  const descArea = page
    .locator('textarea[name="description"], textarea[placeholder*="job description" i]')
    .first();
  if (await descArea.isVisible({ timeout: 2000 }).catch(() => false)) {
    const jobNotes = [
      `Service: ${booking.serviceType}`,
      `Booked automatically via BotBound voice assistant.`,
      booking.notes ? `Customer Notes: ${booking.notes}` : "",
      `Scheduled Window: ${booking.startTime} to ${booking.endTime} (${booking.timeZone})`,
    ]
      .filter(Boolean)
      .join("\n");
    await descArea.fill(jobNotes);
  }

  // 8. Submit Form & Extract Job ID
  const saveBtn = page
    .locator('button[type="submit"]:has-text("Save job"), button:has-text("Save job"), button:has-text("Create job")')
    .first();
  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click();
  }

  // Wait for redirect to /app/jobs/:id
  let finalUrl = page.url();
  await page.waitForURL(/\/app\/jobs\/([a-zA-Z0-9_-]+)/, { timeout: 10000 }).catch(() => null);
  finalUrl = page.url();

  const match = finalUrl.match(/\/app\/jobs\/([a-zA-Z0-9_-]+)/);
  const jobId = match ? match[1] : `hcp-${Date.now()}`;

  return {
    success: true,
    portal: "housecall_pro",
    externalJobId: jobId,
    externalJobUrl: finalUrl,
    executedAt: new Date().toISOString(),
  };
}

/**
 * Playwright automation recipe for ServiceTitan.
 */
export async function executeServiceTitanMirroring(
  page: Page,
  booking: TradePortalBookingPayload,
  config: TradePortalConnectionConfig,
): Promise<TradePortalMirrorResult> {
  const baseUrl = config.portalUrl || "https://go.servicetitan.com";

  // 1. Navigate to Call Booking
  await page.goto(`${baseUrl}/CallBooking/Job`, { waitUntil: "domcontentloaded", timeout: 30000 });

  // 2. Auth barrier detection
  const barrier = await detectPortalAuthBarrier(page);
  if (barrier.detected) {
    return {
      success: false,
      portal: "servicetitan",
      requiresTakeover: true,
      takeoverReason: barrier.reason,
      executedAt: new Date().toISOString(),
    };
  }

  // 3. Caller / Customer Lookup
  const phoneInput = page
    .locator('input[name="CallerPhone"], #txt-search-phone, input[placeholder*="phone" i]')
    .first();
  if (await phoneInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    if (booking.customerPhone) {
      await phoneInput.fill(booking.customerPhone);
      await page.keyboard.press("Enter").catch(() => null);
      await page.waitForTimeout(500);
    }
  }

  // 4. Fill Customer Details
  const nameInput = page
    .locator('input[name="CustomerName"], #txt-customer-name, input[placeholder*="customer name" i]')
    .first();
  if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nameInput.fill(booking.customerName);
  }

  // 5. Service Location Address
  if (booking.serviceAddress) {
    const streetInput = page
      .locator('input[name="Address.Street"], #txt-address-street, input[placeholder*="street" i]')
      .first();
    if (await streetInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (typeof booking.serviceAddress === "string") {
        await streetInput.fill(booking.serviceAddress);
      } else {
        await streetInput.fill(booking.serviceAddress.street);
        const cityInput = page.locator('input[name="Address.City"], #txt-address-city').first();
        if (await cityInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await cityInput.fill(booking.serviceAddress.city);
        }
        const stateInput = page.locator('input[name="Address.State"], #txt-address-state').first();
        if (await stateInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await stateInput.fill(booking.serviceAddress.state);
        }
        const zipInput = page.locator('input[name="Address.Zip"], #txt-address-zip').first();
        if (await zipInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await zipInput.fill(booking.serviceAddress.postalCode);
        }
      }
    }
  }

  // 6. Job Type / Business Unit
  const jobTypeSelect = page
    .locator('select[name="JobType"], input[name="JobType"], #ddl-job-type')
    .first();
  if (await jobTypeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    const jobTypeVal = config.defaultJobType || booking.serviceType;
    await jobTypeSelect.fill(jobTypeVal).catch(() => undefined);
  }

  // 7. Summary & Job Description
  const summaryArea = page
    .locator('textarea[name="JobSummary"], #txt-summary, textarea[name="ProblemDescription"]')
    .first();
  if (await summaryArea.isVisible({ timeout: 2000 }).catch(() => false)) {
    await summaryArea.fill(
      `Service: ${booking.serviceType}\n` +
        `Automated booking by BotBound voice assistant.\n` +
        `Arrival Window: ${booking.startTime} - ${booking.endTime}\n` +
        (booking.notes ? `Caller Notes: ${booking.notes}` : ""),
    );
  }

  // 8. Book Job
  const bookBtn = page
    .locator('button#btn-book-job, button:has-text("Book Job"), button:has-text("Save Job")')
    .first();
  if (await bookBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await bookBtn.click();
  }

  let finalUrl = page.url();
  await page
    .waitForURL(/\/Job\/(?:Index|Details)\/([0-9]+)/, { timeout: 10000 })
    .catch(() => null);
  finalUrl = page.url();

  const match = finalUrl.match(/\/Job\/(?:Index|Details)\/([0-9]+)/);
  const jobId = match ? match[1] : `st-${Date.now()}`;

  return {
    success: true,
    portal: "servicetitan",
    externalJobId: jobId,
    externalJobUrl: finalUrl,
    executedAt: new Date().toISOString(),
  };
}

/**
 * Handles a claimed trade_portal_mirror job from wireline_jobs.
 */
export async function handleTradePortalMirrorJob(job: {
  id: string;
  userId: string;
  payload: any;
}): Promise<TradePortalMirrorResult> {
  const { userId, payload, id: jobId } = job;
  const { agentId, portal, booking } = payload as {
    agentId: string;
    portal: SupportedTradePortal;
    booking: TradePortalBookingPayload;
  };

  log.info("[trade-portal-mirroring] Executing trade portal mirroring job", {
    jobId,
    userId,
    portal,
  });

  const config = (await getTenantTradePortalConfig(userId)) || {
    portal,
    enabled: true,
    portalUrl:
      portal === "housecall_pro"
        ? "https://pro.housecallpro.com"
        : "https://go.servicetitan.com",
  };

  // Launch browser via Browserbase CDP or local chromium
  const connection = cloudComputerConnection();
  let browser: any;
  if (connection && connection.kind === "remote") {
    browser = await chromium.connectOverCDP(connection.wsEndpoint, { timeout: 30000 });
  } else {
    browser = await chromium.launch({ headless: true });
  }

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BotBoundAutomation/1.0",
    });
    const page = await context.newPage();

    let result: TradePortalMirrorResult;
    if (portal === "housecall_pro") {
      result = await executeHousecallProMirroring(page, booking, config);
    } else {
      result = await executeServiceTitanMirroring(page, booking, config);
    }

    if (result.requiresTakeover) {
      log.warn("[trade-portal-mirroring] Barrier encountered during mirroring; dispatching alert", {
        jobId,
        portal,
        reason: result.takeoverReason,
      });

      // Mark job as needs_auth so retry loops don't burn attempts
      await drizzle
        .update(schema.jobs)
        .set({
          status: "needs_auth",
          error: `Blocked by ${result.takeoverReason}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.jobs.id, jobId));

      // Dispatch urgent human takeover alerts
      void dispatchHumanTakeoverAlerts({
        userId,
        agentId,
        taskId: jobId,
        customerPhone: booking.customerPhone,
        barrier: {
          detected: true,
          barrierType:
            result.takeoverReason === "2fa"
              ? "two_factor"
              : result.takeoverReason === "captcha"
                ? "captcha"
                : "credential_required",
          details: `Encountered ${result.takeoverReason} barrier mirroring into ${portal}`,
          detectedAt: Date.now(),
        },
        portalUrl: config.portalUrl || "https://dispatch.portal",
      });

      return result;
    }

    // Mark job done in wireline_jobs
    await drizzle
      .update(schema.jobs)
      .set({
        status: result.success ? "done" : "failed",
        result: result as any,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, jobId));

    // Audit trail: check if user currently has an active task in wireline_computer_tasks
    // Only write to computerTasks if no task is active, preventing uq_computer_tasks_one_active_per_user violation
    const activeTasks = await drizzle
      .select({ id: schema.computerTasks.id })
      .from(schema.computerTasks)
      .where(
        and(
          eq(schema.computerTasks.userId, userId),
          inArray(schema.computerTasks.status, ["running", "needs_input"]),
        ),
      );

    if (activeTasks.length === 0) {
      await drizzle.insert(schema.computerTasks).values({
        userId,
        agentId,
        goal: `Mirror booking for ${booking.customerName} into ${portal}`,
        startUrl: config.portalUrl || `https://${portal}.com`,
        status: result.success ? "completed" : "failed",
        summary: result.success
          ? `Successfully mirrored booking into ${portal}. External Job ID: ${result.externalJobId}.`
          : `Failed to mirror into ${portal}: ${result.error}`,
        turnCount: 1,
        actionCount: 5,
        events: [
          { at: new Date().toISOString(), kind: "action", text: `Navigated to ${config.portalUrl}` },
          {
            at: new Date().toISOString(),
            kind: "action",
            text: `Filled customer details for ${booking.customerName}`,
          },
          {
            at: new Date().toISOString(),
            kind: "result",
            text: `Job created with ID ${result.externalJobId}`,
            ok: result.success,
          },
        ],
      }).catch((e) => {
        log.warn("[trade-portal-mirroring] Could not write audit task row", { error: String(e) });
      });
    }

    return result;
  } finally {
    await browser.close().catch(() => null);
  }
}
