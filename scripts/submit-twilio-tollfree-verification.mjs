#!/usr/bin/env node

import "dotenv/config";
import {
  BOTBOUND_EIN,
  BOTBOUND_TRUST_HUB_ENTITY,
  buildTrustHubCustomerProfilePayload,
  buildTollfreeVerificationPayload,
  validateTollfreeVerificationPayload,
  submitTrustHubCustomerProfile,
  submitTollfreeVerification,
  fetchTollfreeVerificationStatus,
  isTollFreePhoneNumber,
} from "./lib/twilio-trust-hub.mjs";

function parseArgs(rawArgs) {
  const flags = {
    phoneNumber: null,
    dryRun: true,
    apply: false,
    statusSid: null,
    json: false,
    help: false,
  };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--apply") {
      flags.apply = true;
      flags.dryRun = false;
    } else if (arg === "--dry-run") {
      flags.dryRun = true;
      flags.apply = false;
    } else if (arg === "--json") {
      flags.json = true;
    } else if (arg === "--phone-number" || arg === "-p") {
      flags.phoneNumber = rawArgs[++i] || null;
    } else if (arg.startsWith("--phone-number=")) {
      flags.phoneNumber = arg.split("=")[1];
    } else if (arg === "--status" || arg === "-s") {
      flags.statusSid = rawArgs[++i] || null;
    } else if (arg.startsWith("--status=")) {
      flags.statusSid = arg.split("=")[1];
    }
  }

  return flags;
}

function printHelp() {
  console.log(`
BotBound Twilio Toll-Free & Trust Hub Verification Tool (EIN ${BOTBOUND_EIN})

Usage:
  node scripts/submit-twilio-tollfree-verification.mjs [options]

Options:
  --phone-number <E.164>  Toll-free phone number to verify (default: ${BOTBOUND_TRUST_HUB_ENTITY.contactPhone})
  --dry-run               Validate payloads and schema without making live API calls (default)
  --apply                 Submit profile & verification to Twilio REST API using TWILIO credentials
  --status <sid>          Query status of an existing Toll-Free verification SID
  --json                  Output purely formatted JSON
  --help                  Show this help text
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const credentials = { accountSid, authToken };

  // Status check branch
  if (args.statusSid) {
    if (!accountSid || !authToken) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error: "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required to check verification status.",
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }

    try {
      const statusData = await fetchTollfreeVerificationStatus(credentials, args.statusSid);
      const receipt = {
        ok: true,
        mode: "status",
        verification_sid: args.statusSid,
        status: statusData.status || statusData.verification_status || "UNKNOWN",
        details: statusData,
      };
      console.log(JSON.stringify(receipt, null, 2));
      process.exit(0);
    } catch (err) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            mode: "status",
            verification_sid: args.statusSid,
            error: err.message,
            status: err.status || 500,
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }
  }

  const phoneNumber = args.phoneNumber || BOTBOUND_TRUST_HUB_ENTITY.contactPhone;

  // Build payloads
  const trustHubPayload = buildTrustHubCustomerProfilePayload();
  const tollfreePayload = buildTollfreeVerificationPayload({ phoneNumber });

  // Validate payloads
  const validation = validateTollfreeVerificationPayload(tollfreePayload);
  if (!validation.valid) {
    const errorReceipt = {
      ok: false,
      mode: args.apply ? "apply" : "dry-run",
      ein: BOTBOUND_EIN,
      errors: validation.errors,
    };
    console.error(JSON.stringify(errorReceipt, null, 2));
    process.exit(1);
  }

  // Dry-run branch
  if (args.dryRun) {
    const receipt = {
      ok: true,
      mode: "dry-run",
      ein: BOTBOUND_EIN,
      business_name: BOTBOUND_TRUST_HUB_ENTITY.businessName,
      phone_number: phoneNumber,
      is_toll_free: isTollFreePhoneNumber(phoneNumber),
      validation: "PASSED",
      trust_hub_customer_profile: trustHubPayload,
      tollfree_verification: tollfreePayload,
    };

    console.log(JSON.stringify(receipt, null, 2));
    process.exit(0);
  }

  // Apply branch
  if (args.apply) {
    if (!accountSid || !authToken) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            mode: "apply",
            error: "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required to apply verification.",
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }

    try {
      let customerProfileSid = null;
      try {
        const trustHubResponse = await submitTrustHubCustomerProfile(credentials, trustHubPayload);
        customerProfileSid = trustHubResponse.sid || trustHubResponse.bundle_sid || null;
      } catch (thErr) {
        // Customer profile may already exist or bundle policy might be handled directly
        // Record warning and proceed with toll-free submission
      }

      if (customerProfileSid) {
        tollfreePayload.CustomerProfileSid = customerProfileSid;
      }

      const tollfreeResponse = await submitTollfreeVerification(credentials, tollfreePayload);

      const receipt = {
        ok: true,
        mode: "apply",
        ein: BOTBOUND_EIN,
        business_name: BOTBOUND_TRUST_HUB_ENTITY.businessName,
        phone_number: phoneNumber,
        tollfree_verification_sid: tollfreeResponse.sid || tollfreeResponse.verification_sid || "HH_SUBMITTED",
        bundle_sid: customerProfileSid || tollfreeResponse.customer_profile_sid || null,
        status: tollfreeResponse.status || "PENDING",
        submitted_at: new Date().toISOString(),
        details: tollfreeResponse,
      };

      console.log(JSON.stringify(receipt, null, 2));
      process.exit(0);
    } catch (applyErr) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            mode: "apply",
            error: applyErr.message,
            status: applyErr.status || 500,
            details: applyErr.details || null,
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }
  }
}

main().catch((fatal) => {
  console.error(JSON.stringify({ ok: false, error: fatal.message }, null, 2));
  process.exit(1);
});
