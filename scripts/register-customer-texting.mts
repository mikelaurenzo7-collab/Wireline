/**
 * Register one customer business for US texting through Twilio's ISV flow,
 * then add its one line to that business's own Messaging Service. A business
 * with an EIN registers a Low-Volume Standard brand; a sole proprietor without
 * one registers a Sole Proprietor brand, confirmed by the owner replying YES
 * to a carrier text, with texting privacy and terms pages BotBound hosts.
 *
 * Dry run by default: validates the details, runs read-only preflight checks
 * and prints every request it would send. `--apply` creates resources and
 * writes each SID to the state file before the next step, so a rerun resumes.
 * Billable steps (brand $4.50, campaign $15 vetting + monthly fee) also need
 * `--confirm-billing`. The campaign waits for brand approval (and, for a sole
 * proprietor, the owner's YES); rerun later. `--resend-confirmation --apply`
 * texts a sole proprietor a fresh confirmation when the first one expired.
 *
 * Usage:
 *   npm run carrier:register -- --workspace <user id> \
 *     --state ~/botbound-registrations/ridge.json [--apply] [--confirm-billing]
 *   npm run carrier:register -- --details partner.json --line +13125550100 \
 *     --state ~/botbound-registrations/ridge.json
 *
 * `--workspace` reads the details the owner saved in Lines (sealed in their
 * preferences) and the workspace's one line. It needs DATABASE_URL with a role
 * that can read wireline_user_preferences, and the same WIRELINE_DATA_KEY the
 * API uses. `--details` reads a JSON file instead: business details, or
 * `{"flow": "sole_proprietor", "details": {...}}`. A sole proprietor's policy
 * links are signed with WIRELINE_DATA_KEY, so it must match production's.
 *
 * Environment: TWILIO_ACCOUNT_SID plus TWILIO_API_KEY/TWILIO_API_SECRET (or
 * TWILIO_AUTH_TOKEN), TWILIO_PRIMARY_CUSTOMER_PROFILE_SID (BotBound's approved
 * primary profile) and TWILIO_ISV_NOTIFICATION_EMAIL (a BotBound address).
 * Keep the details and state files outside the repository: they hold an EIN
 * and a representative's contact details.
 */
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { getPostgresConnectionConfig } from "../src/lib/postgres-tls.mjs";
import {
  normalizeTextingRegistrationInput,
  openTextingRegistration,
  readStoredTextingRegistration,
  type TextingRegistrationInput,
} from "../src/lib/texting-registration-details.ts";
import { textingPolicyUrls } from "../src/lib/texting-policy-link.ts";
import {
  composeCampaign,
  composeSoleProprietorCampaign,
  executeRegistration,
  executeSoleProprietorRegistration,
  planRegistration,
  planSoleProprietorRegistration,
  validateBusinessDetails,
  validateSoleProprietorDetails,
  type CustomerBusinessDetails,
  type ExecutionResult,
  type RegistrationHttp,
  type RegistrationSids,
  type RegistrationStep,
} from "../src/lib/carrier-registration.ts";

type Flags = {
  details?: string;
  workspace?: string;
  line?: string;
  state?: string;
  apply: boolean;
  confirmBilling: boolean;
  resendConfirmation: boolean;
  primaryProfile?: string;
  isvEmail?: string;
};

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { apply: false, confirmBilling: false, resendConfirmation: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--details") flags.details = next();
    else if (arg === "--workspace") flags.workspace = next();
    else if (arg === "--line") flags.line = next();
    else if (arg === "--state") flags.state = next();
    else if (arg === "--apply") flags.apply = true;
    else if (arg === "--confirm-billing") flags.confirmBilling = true;
    else if (arg === "--resend-confirmation") flags.resendConfirmation = true;
    else if (arg === "--primary-profile") flags.primaryProfile = next();
    else if (arg === "--isv-email") flags.isvEmail = next();
    else if (arg === "--help" || arg === "-h") {
      console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return flags;
}

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function twilioAuthorization(): string | null {
  const account = env("TWILIO_ACCOUNT_SID");
  const apiKey = env("TWILIO_API_KEY");
  const apiSecret = env("TWILIO_API_SECRET");
  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!account) return null;
  // A complete API key pair wins; otherwise the account SID and Auth Token.
  // Never pair an API key with the Auth Token.
  const [user, secret] =
    apiKey && apiSecret ? [apiKey, apiSecret] : authToken ? [account, authToken] : [null, null];
  if (!user || !secret) return null;
  return `Basic ${Buffer.from(`${user}:${secret}`).toString("base64")}`;
}

function formBody(form: Record<string, string | string[]> = {}): URLSearchParams {
  const body = new URLSearchParams();
  for (const [field, value] of Object.entries(form)) {
    for (const item of Array.isArray(value) ? value : [value]) body.append(field, item);
  }
  return body;
}

function twilioHttp(authorization: string): RegistrationHttp {
  return async (method, url, form) => {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: authorization,
        ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: method === "POST" ? formBody(form) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, body };
  };
}

function list(body: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = body[key];
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

/** Read-only checks that stop a run before it can create anything wrong. */
async function preflight(input: {
  http: RegistrationHttp;
  accountSid: string;
  line: string;
  primaryProfileSid: string;
  ownServiceSid?: string;
  /** Sole Proprietor only: the owner's own mobile and the policy page production must recognize. */
  soleProprietor?: { mobilePhone: string; privacyUrl: string | null };
}): Promise<{ phoneNumberSid: string | null; problems: string[] }> {
  const problems: string[] = [];
  if (input.soleProprietor) {
    const owned = await input.http(
      "GET",
      `https://api.twilio.com/2010-04-01/Accounts/${input.accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(input.soleProprietor.mobilePhone)}`,
    );
    if (list(owned.body, "incoming_phone_numbers").length) {
      problems.push(
        "The verification mobile is a Twilio number on this account. Carriers text the owner's own cell phone; ask for that number.",
      );
    }
    // Production must verify the signed link, or carriers would review a page that says the link isn't valid.
    if (input.soleProprietor.privacyUrl) {
      const url = new URL(input.soleProprietor.privacyUrl);
      const token = url.pathname.split("/")[2] ?? "";
      const page = await fetch(`${url.origin}/api/texting-policy/${token}`, {
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
      if (!page?.ok) {
        problems.push(
          `Production did not recognize the texting policy link (${page ? `HTTP ${page.status}` : "no response"}). Run with the same WIRELINE_DATA_KEY as production.`,
        );
      }
    }
  }
  const numbers = await input.http(
    "GET",
    `https://api.twilio.com/2010-04-01/Accounts/${input.accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(input.line)}`,
  );
  const number = list(numbers.body, "incoming_phone_numbers")[0];
  const phoneNumberSid = typeof number?.sid === "string" ? number.sid : null;
  if (!phoneNumberSid) problems.push(`The line ${input.line} is not on this Twilio account.`);

  const services = await input.http("GET", "https://messaging.twilio.com/v1/Services?PageSize=100");
  for (const service of list(services.body, "services")) {
    const sid = String(service.sid || "");
    if (!sid || sid === input.ownServiceSid) continue;
    const senders = await input.http(
      "GET",
      `https://messaging.twilio.com/v1/Services/${sid}/PhoneNumbers?PageSize=400`,
    );
    if (list(senders.body, "phone_numbers").some((sender) => sender.phone_number === input.line)) {
      problems.push(
        `The line is already in Messaging Service ${sid} ("${String(service.friendly_name || "")}"). A number can belong to one Service; remove it there first.`,
      );
    }
  }

  const profile = await input.http(
    "GET",
    `https://trusthub.twilio.com/v1/CustomerProfiles/${input.primaryProfileSid}`,
  );
  if (profile.body.status !== "twilio-approved") {
    problems.push(
      `BotBound's primary profile ${input.primaryProfileSid} is "${String(profile.body.status || `HTTP ${profile.status}`)}", not twilio-approved.`,
    );
  }
  const assignments = await input.http(
    "GET",
    `https://trusthub.twilio.com/v1/CustomerProfiles/${input.primaryProfileSid}/EntityAssignments?PageSize=50`,
  );
  let identity: string | null = null;
  for (const assignment of list(assignments.body, "results")) {
    const objectSid = String(assignment.object_sid || "");
    if (!objectSid.startsWith("IT")) continue;
    const endUser = await input.http("GET", `https://trusthub.twilio.com/v1/EndUsers/${objectSid}`);
    if (endUser.body.type !== "customer_profile_business_information") continue;
    const attributes = (endUser.body.attributes ?? {}) as Record<string, unknown>;
    identity =
      typeof attributes.business_identity === "string" ? attributes.business_identity : null;
  }
  if (identity && identity !== "isv_reseller_or_partner") {
    problems.push(
      `BotBound's primary profile is registered as "${identity}". Twilio requires an "ISV Reseller or Partner" primary profile before it accepts customer brands.`,
    );
  }
  return { phoneNumberSid, problems };
}

/** The owner's saved details and the workspace's lines, read straight from the database. */
async function loadWorkspace(
  userId: string,
): Promise<{ input: TextingRegistrationInput; lines: string[] }> {
  const connectionString = env("DATABASE_POOL_URL") || env("POSTGRES_URL") || env("DATABASE_URL");
  if (!connectionString) throw new Error("--workspace needs DATABASE_URL.");
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ ...getPostgresConnectionConfig(connectionString), max: 1 });
  try {
    const preferences = await pool.query(
      "SELECT preferences FROM wireline_user_preferences WHERE user_id = $1",
      [userId],
    );
    const stored = readStoredTextingRegistration(preferences.rows[0]?.preferences);
    if (!stored) {
      throw new Error(
        "This workspace hasn't saved texting registration details. The owner adds them in Lines.",
      );
    }
    const lines = await pool.query(
      "SELECT phone_number FROM wireline_phone_numbers WHERE user_id = $1 ORDER BY created_at",
      [userId],
    );
    return {
      input: openTextingRegistration(stored),
      lines: lines.rows.map((row: { phone_number: string }) => row.phone_number),
    };
  } finally {
    await pool.end();
  }
}

type Flow =
  | { kind: "business"; input: Extract<TextingRegistrationInput, { flow: "business" }> }
  | {
      kind: "sole_proprietor";
      input: Extract<TextingRegistrationInput, { flow: "sole_proprietor" }>;
    };

/** `--details` holds plain business details, or `{ flow, details }` like a saved workspace. */
function readDetailsFile(path: string): TextingRegistrationInput {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as Record<string, unknown>;
  if (raw && typeof raw === "object" && "flow" in raw)
    return normalizeTextingRegistrationInput(raw);
  return { flow: "business", details: raw as unknown as CustomerBusinessDetails };
}

/** Ask carriers to text a sole proprietor a fresh YES confirmation (the first expires after 24 hours). */
async function resendConfirmation(http: RegistrationHttp, brandSid: string, apply: boolean) {
  const brand = await http(
    "GET",
    `https://messaging.twilio.com/v1/a2p/BrandRegistrations/${brandSid}`,
  );
  const status = String(brand.body.status || "").toUpperCase();
  const identity = String(brand.body.identity_status || "").toUpperCase();
  console.log(
    `Brand ${brandSid}: status ${status || `HTTP ${brand.status}`}, identity ${identity || "unknown"}.`,
  );
  if (identity === "VERIFIED" || identity === "VETTED_VERIFIED") {
    console.log("The owner already confirmed. Rerun without --resend-confirmation to continue.");
    return;
  }
  if (status !== "APPROVED") {
    console.log(
      "Carriers send the confirmation text once the brand is APPROVED; there is nothing to resend yet.",
    );
    return;
  }
  if (!apply) {
    console.log("Dry run: add --apply to text the owner a fresh confirmation from 915-278-2000.");
    return;
  }
  const sent = await http(
    "POST",
    `https://messaging.twilio.com/v1/a2p/BrandRegistrations/${brandSid}/SmsOtp`,
    {},
  );
  if (sent.status < 200 || sent.status >= 300) {
    const message = typeof sent.body.message === "string" ? `: ${sent.body.message}` : "";
    throw new Error(`Twilio refused to resend the confirmation (HTTP ${sent.status})${message}`);
  }
  console.log("Sent. Ask the owner to reply YES within 24 hours, then rerun this command.");
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if ((!flags.details && !flags.workspace) || !flags.state) {
    throw new Error(
      "--workspace (or --details) and --state are required. Run with --help for usage.",
    );
  }
  let input: TextingRegistrationInput;
  let workspaceLines: string[] = [];
  if (flags.workspace) {
    const workspace = await loadWorkspace(flags.workspace);
    input = workspace.input;
    workspaceLines = workspace.lines;
    if (!flags.line) {
      if (workspace.lines.length !== 1) {
        throw new Error(
          `This workspace has ${workspace.lines.length} lines; pass --line with the one to register.`,
        );
      }
      flags.line = workspace.lines[0];
    } else if (!workspace.lines.includes(flags.line)) {
      throw new Error(`${flags.line} is not one of this workspace's lines.`);
    }
  } else {
    input = readDetailsFile(flags.details!);
  }
  if (!flags.line) throw new Error("--line is required with --details.");
  const flow: Flow =
    input.flow === "sole_proprietor"
      ? { kind: "sole_proprietor", input }
      : { kind: "business", input };

  const errors =
    flow.kind === "sole_proprietor"
      ? validateSoleProprietorDetails(flow.input.details, {
          blockedNumbers: [...workspaceLines, flags.line],
        })
      : validateBusinessDetails(flow.input.details);
  if (errors.length) {
    console.error("Details need correction before anything is sent:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  const statePath = resolve(flags.state);
  const done: RegistrationSids = existsSync(statePath)
    ? (JSON.parse(readFileSync(statePath, "utf8")) as RegistrationSids)
    : {};

  const accountSid = env("TWILIO_ACCOUNT_SID");
  const primaryProfileSid = flags.primaryProfile || env("TWILIO_PRIMARY_CUSTOMER_PROFILE_SID");
  const isvNotificationEmail = flags.isvEmail || env("TWILIO_ISV_NOTIFICATION_EMAIL");
  const authorization = twilioAuthorization();

  if (flags.resendConfirmation) {
    if (flow.kind !== "sole_proprietor") {
      throw new Error("--resend-confirmation applies to Sole Proprietor brands only.");
    }
    if (!done.brand)
      throw new Error("No brand in this state file yet; run the registration first.");
    if (!authorization || !accountSid)
      throw new Error("--resend-confirmation needs Twilio credentials.");
    await resendConfirmation(twilioHttp(authorization), done.brand, flags.apply);
    return;
  }

  // A sole proprietor's campaign points at the policy pages BotBound hosts for the brand.
  let policy = {
    privacyUrl: "https://botbound.app/texting/<signed-link>/privacy",
    termsUrl: "https://botbound.app/texting/<signed-link>/terms",
  };
  let signedPolicy = false;
  if (flow.kind === "sole_proprietor") {
    try {
      policy = textingPolicyUrls(flow.input.details.brandName);
      signedPolicy = true;
    } catch (error) {
      if (flags.apply) throw error;
      console.log("No WIRELINE_DATA_KEY: showing placeholder policy links.");
    }
  }

  const campaign =
    flow.kind === "sole_proprietor"
      ? composeSoleProprietorCampaign(flow.input.details, policy)
      : composeCampaign(flow.input.details);
  console.log(
    `${flow.kind === "sole_proprietor" ? "Sole Proprietor campaign" : "Campaign"} for ${flow.input.details.brandName}:`,
  );
  console.log(`  Description: ${campaign.description}`);
  console.log(`  Message flow: ${campaign.messageFlow}`);
  for (const sample of campaign.messageSamples) console.log(`  Sample: ${sample}`);
  if (flow.kind === "sole_proprietor") {
    console.log(`  Privacy policy: ${policy.privacyUrl}`);
    console.log(`  Terms: ${policy.termsUrl}`);
  }

  let phoneNumberSid = "PN_LINE_SID";
  if (authorization && accountSid && primaryProfileSid) {
    const http = twilioHttp(authorization);
    const check = await preflight({
      http,
      accountSid,
      line: flags.line,
      primaryProfileSid,
      ownServiceSid: done.messagingService,
      ...(flow.kind === "sole_proprietor"
        ? {
            soleProprietor: {
              mobilePhone: flow.input.details.mobilePhone,
              privacyUrl: signedPolicy ? policy.privacyUrl : null,
            },
          }
        : {}),
    });
    if (check.phoneNumberSid) phoneNumberSid = check.phoneNumberSid;
    if (check.problems.length) {
      console.error("\nPreflight stopped the run:");
      for (const problem of check.problems) console.error(`  - ${problem}`);
      process.exit(1);
    }
    console.log("\nPreflight passed.");
  } else if (flags.apply) {
    throw new Error(
      "--apply needs Twilio credentials and TWILIO_PRIMARY_CUSTOMER_PROFILE_SID (and TWILIO_ISV_NOTIFICATION_EMAIL for a business).",
    );
  } else {
    console.log("\nNo Twilio credentials: preflight skipped; showing the plan only.");
  }

  const base = {
    accountSid: accountSid || "AC_ACCOUNT_SID",
    primaryProfileSid: primaryProfileSid || "BU_PRIMARY_PROFILE",
    phoneNumberSid,
  };
  const businessContext = {
    ...base,
    isvNotificationEmail: isvNotificationEmail || "compliance@your-domain.example",
  };
  const soleContext = { ...base, ...policy };
  const remaining: RegistrationStep[] =
    flow.kind === "sole_proprietor"
      ? planSoleProprietorRegistration(flow.input.details, soleContext, done)
      : planRegistration(flow.input.details, businessContext, done);
  console.log(`\n${remaining.length} step(s) remaining:`);
  for (const step of remaining) {
    console.log(`  ${step.billable ? "[billable] " : ""}${step.label}`);
  }
  if (!flags.apply) {
    console.log("\nDry run: nothing was sent. Add --apply to create resources.");
    return;
  }
  if (flow.kind === "business" && !isvNotificationEmail) {
    throw new Error("TWILIO_ISV_NOTIFICATION_EMAIL is required.");
  }

  const io = {
    done,
    http: twilioHttp(authorization!),
    save: async (next: RegistrationSids) =>
      writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`),
    allowBillable: flags.confirmBilling,
    // Twilio asks for at most one brand or campaign request per second.
    pace: () => new Promise<void>((resolveTimer) => setTimeout(resolveTimer, 1100)),
  };
  const result: ExecutionResult =
    flow.kind === "sole_proprietor"
      ? await executeSoleProprietorRegistration({
          ...io,
          details: flow.input.details,
          context: soleContext,
        })
      : await executeRegistration({ ...io, details: flow.input.details, context: businessContext });
  if (result.ok) {
    console.log(
      "\nRegistration submitted and the line is in its Messaging Service. Texts send once the campaign is VERIFIED; BotBound reads that from Twilio automatically.",
    );
    return;
  }
  console.log(`\n${result.reason}`);
  console.log(`State saved to ${statePath}. Rerun the same command to continue.`);
  if ("failedStep" in result) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
