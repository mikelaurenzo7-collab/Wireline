export const REVIEW_REQUIRED_TEMPLATE_IDS = [
  "scheduler-medical",
  "collections-soft",
  "collections-hard",
] as const;

export type ReviewRequiredTemplateId = (typeof REVIEW_REQUIRED_TEMPLATE_IDS)[number];

export const REVIEW_REQUIRED_AGENT_ROLE_IDS = ["collections"] as const;
export type ReviewRequiredAgentRoleId = (typeof REVIEW_REQUIRED_AGENT_ROLE_IDS)[number];

const REVIEW_REQUIRED_TEMPLATE_SET = new Set<string>(REVIEW_REQUIRED_TEMPLATE_IDS);
const REVIEW_REQUIRED_AGENT_ROLE_SET = new Set<string>(REVIEW_REQUIRED_AGENT_ROLE_IDS);

function normalizeTemplateId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * High-risk role templates remain review-required concepts. A prompt is not a
 * BAA, compliance determination, jurisdiction review, or approved regulated
 * workflow, so generic creation must fail closed until account-level approval
 * is implemented.
 */
export function isTemplateLaunchReviewRequired(value: unknown): value is ReviewRequiredTemplateId {
  return REVIEW_REQUIRED_TEMPLATE_SET.has(normalizeTemplateId(value));
}

export function isAgentRoleLaunchReviewRequired(
  value: unknown,
): value is ReviewRequiredAgentRoleId {
  return REVIEW_REQUIRED_AGENT_ROLE_SET.has(normalizeTemplateId(value));
}

export function agentRoleLaunchReviewMessage(value: unknown): string {
  if (normalizeTemplateId(value) === "collections") {
    return "Collections Bots require legal review and an approved jurisdiction-specific configuration before deployment.";
  }
  return "This Bot role requires an approved configuration before deployment.";
}

export function templateLaunchReviewMessage(value: unknown): string {
  switch (normalizeTemplateId(value)) {
    case "scheduler-medical":
      return "Medical scheduling templates require a signed BAA and an approved healthcare configuration before deployment.";
    case "collections-soft":
    case "collections-hard":
      return "Debt-recovery templates require legal review and an approved jurisdiction-specific configuration before deployment.";
    default:
      return "This template requires an approved configuration before deployment.";
  }
}
