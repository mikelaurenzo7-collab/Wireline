import { isFederalDncVendorConfigured } from "./federal-dnc-service";

export type OutboundComplianceBlockCode =
  | "FEDERAL_DNC_NOT_CONFIGURED"
  | "TENANT_DNC_BLOCKED"
  | "FEDERAL_DNC_BLOCKED"
  | "EXPRESS_WRITTEN_CONSENT_REQUIRED"
  | "CONSENT_ARTIFACT_REQUIRED";

export type OutboundComplianceRecoveryAction = {
  label: string;
  description: string;
  href?: string;
};

export type OutboundComplianceBlock = {
  code: OutboundComplianceBlockCode;
  reason: string;
  action: OutboundComplianceRecoveryAction;
};

export type OutboundComplianceStatus = {
  marketing_sales_outbound_enabled: boolean;
  federal_dnc_configured: boolean;
  tenant_dnc_checks_apply: boolean;
  express_written_consent_required: boolean;
  enforcement_owner: "server";
  recovery_actions: OutboundComplianceRecoveryAction[];
};

export function buildOutboundComplianceStatus(): OutboundComplianceStatus {
  const federalConfigured = isFederalDncVendorConfigured();
  return {
    marketing_sales_outbound_enabled: federalConfigured,
    federal_dnc_configured: federalConfigured,
    tenant_dnc_checks_apply: true,
    express_written_consent_required: true,
    enforcement_owner: "server",
    recovery_actions: [
      federalConfigured
        ? {
            label: "Federal DNC is connected",
            description:
              "Marketing and sales calls can be checked against the configured federal scrub vendor.",
          }
        : {
            label: "Connect federal DNC scrub",
            description:
              "Configure FEDERAL_DNC_API_URL and FEDERAL_DNC_API_KEY before marketing or sales dialing.",
            href: "/connections",
          },
      {
        label: "Review tenant DNC list",
        description:
          "Remove or correct numbers only when you have a lawful basis to call them again.",
        href: "/admin?tab=compliance",
      },
      {
        label: "Capture express written consent",
        description:
          "For marketing or sales, attest consent and retain the consent source or lead artifact before dialing.",
        href: "/trust/legal",
      },
    ],
  };
}

export function outboundComplianceBlock(
  code: OutboundComplianceBlockCode,
): OutboundComplianceBlock {
  switch (code) {
    case "FEDERAL_DNC_NOT_CONFIGURED":
      return {
        code,
        reason:
          "Marketing or sales outbound is disabled because federal DNC scrub is not configured.",
        action: {
          label: "Connect federal DNC scrub",
          description:
            "Set FEDERAL_DNC_API_URL and FEDERAL_DNC_API_KEY, then retry the marketing or sales call.",
          href: "/connections",
        },
      };
    case "TENANT_DNC_BLOCKED":
      return {
        code,
        reason: "This number is on your tenant Do Not Call list.",
        action: {
          label: "Review tenant DNC entry",
          description:
            "Keep the block in place unless the contact lawfully opts back in or the number was added in error.",
          href: "/admin?tab=compliance",
        },
      };
    case "FEDERAL_DNC_BLOCKED":
      return {
        code,
        reason:
          "This marketing or sales call is blocked by the federal Do Not Call registry check.",
        action: {
          label: "Do not dial for marketing",
          description:
            "Use a non-marketing purpose only when counsel confirms a valid exemption or consent applies.",
          href: "/trust/legal",
        },
      };
    case "EXPRESS_WRITTEN_CONSENT_REQUIRED":
      return {
        code,
        reason: "Marketing or sales outbound requires prior express written consent.",
        action: {
          label: "Capture consent first",
          description:
            "Collect and retain express written consent, then retry with the consent attestation enabled.",
          href: "/trust/legal",
        },
      };
    case "CONSENT_ARTIFACT_REQUIRED":
      return {
        code,
        reason:
          "The call has consent attested, but no consent source or lead artifact was supplied for auditability.",
        action: {
          label: "Attach consent evidence",
          description:
            "Include consentSource or consentLeadId before placing the marketing or sales call.",
        },
      };
  }
}
