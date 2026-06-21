/**
 * Auto-persist large Director replies (plans, code, website prototypes) as
 * downloadable markdown artifacts — complements in-chat fenced blocks.
 */
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { storeDirectorArtifact } from "./director-artifacts";
import {
  wantsCodeDeliverable,
  wantsLongDeliverable,
  wantsWebsiteDeliverable,
} from "./director-deliverables";

export const DELIVERABLE_ARTIFACT_MIN_CHARS = 2_400;
/** Cap stored markdown artifacts — replies can be large; base64 lives in Postgres. */
export const DELIVERABLE_ARTIFACT_MAX_BYTES = 512_000;
export const DELIVERABLE_ARTIFACT_TYPE = "markdown-deliverable";

export interface DirectorDeliverableArtifactMeta {
  id: string;
  name: string;
  artifactType: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl?: string;
}

function hasSubstantialCodeFence(reply: string): boolean {
  const match = reply.match(/```[\w-]*\n([\s\S]+?)```/);
  return Boolean(match && match[1].trim().length >= 400);
}

function slugifyDeliverableName(userMessage: string): string {
  const base = userMessage
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const stamp = new Date().toISOString().slice(0, 10);
  if (wantsWebsiteDeliverable(userMessage)) {
    return `website-${base || "design"}-${stamp}.md`;
  }
  if (wantsCodeDeliverable(userMessage)) {
    return `code-${base || "snippet"}-${stamp}.md`;
  }
  if (wantsLongDeliverable(userMessage)) {
    return `deliverable-${base || "doc"}-${stamp}.md`;
  }
  return `director-${base || "export"}-${stamp}.md`;
}

/** Whether this reply should be saved as a downloadable markdown file. */
export function shouldPersistDeliverableArtifact(userMessage: string, reply: string): boolean {
  const trimmed = reply.trim();
  if (trimmed.length < DELIVERABLE_ARTIFACT_MIN_CHARS) return false;
  if (/trouble responding|can't respond right now|LLM isn't configured/i.test(trimmed)) {
    return false;
  }
  if (
    wantsLongDeliverable(userMessage) ||
    wantsWebsiteDeliverable(userMessage) ||
    wantsCodeDeliverable(userMessage)
  ) {
    return true;
  }
  if (hasSubstantialCodeFence(trimmed) && trimmed.length >= 1_800) return true;
  if ((trimmed.match(/^##\s/gm) || []).length >= 3 && trimmed.length >= 2_000) return true;
  return trimmed.length >= 5_000;
}

function sanitizeMarkdownInline(text: string): string {
  return text.trim().slice(0, 500).replace(/\r?\n/g, " ").replace(/#/g, "\\#");
}

function buildMarkdownFile(userMessage: string, reply: string): string {
  const header = `# Director deliverable

**Request:** ${sanitizeMarkdownInline(userMessage)}

**Exported:** ${new Date().toISOString()}

---

`;
  return `${header}${reply.trim()}\n`;
}

/**
 * Store reply as markdown artifact. Returns null on skip or failure (non-fatal).
 */
export async function persistDirectorDeliverableArtifact(input: {
  userId: string;
  userMessage: string;
  reply: string;
}): Promise<DirectorDeliverableArtifactMeta | null> {
  if (!shouldPersistDeliverableArtifact(input.userMessage, input.reply)) return null;
  try {
    const body = buildMarkdownFile(input.userMessage, input.reply);
    const data = Buffer.from(body, "utf8");
    if (data.byteLength > DELIVERABLE_ARTIFACT_MAX_BYTES) {
      log.warn("director deliverable artifact skipped — exceeds size cap", {
        userId: input.userId,
        bytes: data.byteLength,
        cap: DELIVERABLE_ARTIFACT_MAX_BYTES,
      });
      return null;
    }
    const saved = await storeDirectorArtifact({
      userId: input.userId,
      toolName: "director_deliverable",
      artifactType: DELIVERABLE_ARTIFACT_TYPE,
      name: slugifyDeliverableName(input.userMessage),
      mimeType: "text/markdown; charset=utf-8",
      data,
      metadata: {
        accountHolderPreview: input.userMessage.trim().slice(0, 120),
        charCount: input.reply.length,
      },
    });
    return {
      id: saved.id,
      name: saved.name,
      artifactType: saved.artifactType,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
    };
  } catch (e) {
    log.warn("director deliverable artifact persist failed", {
      userId: input.userId,
      error: getErrorMessage(e),
    });
    return null;
  }
}
