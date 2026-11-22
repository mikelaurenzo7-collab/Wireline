/**
 * Register one customer business for US texting (A2P 10DLC, Low-Volume
 * Standard) through Twilio's ISV flow, then add its one line to that
 * business's own Messaging Service.
 *
 * Dry run by default: validates the details, runs read-only preflight checks
 * and prints every request it would send. `--apply` creates resources and
 * writes each SID to the state file before the next step, so a rerun resumes.
 * Billable steps (brand $4.50, campaign $15 vetting + monthly fee) also need
 * `--confirm-billing`. The campaign waits for brand approval; rerun later.
 *
 * Usage:
 *   npm run carrier:register -- --details partner.json --line +13125550100 \
 *     --state ~/botbound-registrations/ridge.json [--apply] [--confirm-billing]
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

import {
  composeCampaign,
  executeRegistration,
  planRegistration,
  validateBusinessDetails,
  type CustomerBusinessDetails,
  type RegistrationContext,
  type RegistrationHttp,
  type RegistrationSids,
} from "../src/lib/carrier-registration.ts";

type Flags = {
  details?: string;
  line?: string;
  state?: string;
  apply: boolean;
  confirmBilling: boolean;
  primaryProfile?: string;
  isvEmail?: string;
};

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { apply: false, confirmBilling: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--details") flags.details = next();
    else if (arg === "--line") flags.line = next();
    else if (arg === "--state") flags.state = next();
    else if (arg === "--apply") flags.apply = true;
    else if (arg === "--confirm-billing") flags.confirmBilling = true;
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
}): Promise<{ phoneNumberSid: string | null; problems: string[] }> {
  const problems: string[] = [];
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

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (!flags.details || !flags.line || !flags.state) {
    throw new Error("--details, --line and --state are required. Run with --help for usage.");
  }
  const details = JSON.parse(
    readFileSync(resolve(flags.details), "utf8"),
  ) as CustomerBusinessDetails;
  const errors = validateBusinessDetails(details);
  if (errors.length) {
    console.error("Business details need correction before anything is sent:");
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

  const campaign = composeCampaign(details);
  console.log(`Campaign for ${details.brandName}:`);
  console.log(`  Description: ${campaign.description}`);
  console.log(`  Message flow: ${campaign.messageFlow}`);
  for (const sample of campaign.messageSamples) console.log(`  Sample: ${sample}`);

  let phoneNumberSid = "PN_LINE_SID";
  if (authorization && accountSid && primaryProfileSid) {
    const http = twilioHttp(authorization);
    const check = await preflight({
      http,
      accountSid,
      line: flags.line,
      primaryProfileSid,
      ownServiceSid: done.messagingService,
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
      "--apply needs Twilio credentials, TWILIO_PRIMARY_CUSTOMER_PROFILE_SID and TWILIO_ISV_NOTIFICATION_EMAIL.",
    );
  } else {
    console.log("\nNo Twilio credentials: preflight skipped; showing the plan only.");
  }

  const context: RegistrationContext = {
    accountSid: accountSid || "AC_ACCOUNT_SID",
    primaryProfileSid: primaryProfileSid || "BU_PRIMARY_PROFILE",
    isvNotificationEmail: isvNotificationEmail || "compliance@your-domain.example",
    phoneNumberSid,
  };
  const remaining = planRegistration(details, context, done);
  console.log(`\n${remaining.length} step(s) remaining:`);
  for (const step of remaining) {
    console.log(`  ${step.billable ? "[billable] " : ""}${step.label}`);
  }
  if (!flags.apply) {
    console.log("\nDry run: nothing was sent. Add --apply to create resources.");
    return;
  }
  if (!isvNotificationEmail) throw new Error("TWILIO_ISV_NOTIFICATION_EMAIL is required.");

  const result = await executeRegistration({
    details,
    context,
    done,
    http: twilioHttp(authorization!),
    save: async (next) => writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`),
    allowBillable: flags.confirmBilling,
    // Twilio asks for at most one brand or campaign request per second.
    pace: () => new Promise((resolveTimer) => setTimeout(resolveTimer, 1100)),
  });
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
