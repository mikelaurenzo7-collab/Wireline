/**
 * Director reply scene detection — drives message badges in the chat thread.
 */
export type DirectorMessageScene =
  | "creative"
  | "analysis"
  | "integration"
  | "training"
  | "comms"
  | "fleet"
  | "document"
  | "general";

export interface DirectorSceneProposalHints {
  actions?: readonly unknown[];
  integrationJobs?: readonly unknown[];
}

const SCENE_PATTERNS: Array<{ scene: Exclude<DirectorMessageScene, "general">; re: RegExp }> = [
  {
    scene: "creative",
    re: /\b(logo|brand.?pack|design|illustration|image|video|visual|color.?palette|generat.*image|creat.*visual|render|mockup|artwork|icon.?set|banner|thumbnail|svg|vectorize|brand.?kit|creative)\b/i,
  },
  {
    scene: "document",
    re: /\b(business plan|one.?pager|sop|playbook|runbook|proposal|contract|email sequence|call script|checklist|deliverable|marketing copy|landing page copy|objection)\b/i,
  },
  {
    scene: "analysis",
    re: /\b(audit|research|competitor|analyz|metrics|report|insight|benchmark|forecast|trend|breakdown|assess|evaluat|pricing|market)\b/i,
  },
  {
    scene: "integration",
    re: /\b(shopify|crm|hubspot|salesforce|slack|twilio|square|calendar|docusign|zoom|excel|sheets|api|webhook|integration)\b/i,
  },
  {
    scene: "training",
    re: /\b(train|knowledge|playbook|instruction|learn|teach|script|guide|onboard|curriculum|module|lesson|practice)\b/i,
  },
  {
    scene: "comms",
    re: /\b(call|sms|outreach|follow.?up|campaign|broadcast|sequence|dial|ring)\b/i,
  },
  {
    scene: "fleet",
    re: /\b(agent|deploy|hire|configure|fleet|workforce|capability)\b/i,
  },
];

function isMultiSectionDocument(content: string): boolean {
  return (content.match(/^##\s/gm) || []).length >= 2;
}

export function detectDirectorMessageScene(
  content: string,
  previews?: readonly unknown[],
  proposals?: DirectorSceneProposalHints,
): DirectorMessageScene {
  if (previews && previews.length > 0) return "creative";
  if (proposals?.integrationJobs && proposals.integrationJobs.length > 0) return "integration";
  if (isMultiSectionDocument(content)) return "document";
  if (proposals?.actions && proposals.actions.length > 0) return "comms";
  for (const { scene, re } of SCENE_PATTERNS) {
    if (re.test(content)) return scene;
  }
  return "general";
}
