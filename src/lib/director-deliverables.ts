/**
 * Director universal deliverables — client-safe intent detection and prompt
 * guidance for code, websites, and open-ended operator requests.
 */
import { wantsStitchMediaRequest } from "./director-stitch-intent";

export { wantsStitchMediaRequest };

const WEBSITE_SIGNAL =
  /\b(website|web\s*site|landing\s*page|homepage|home\s*page|site\s*map|sitemap|wireframe|web\s*design|design\s+(?:a|my|our|the)\s+(?:website|site|landing)|redesign\s+(?:the\s+)?(?:website|site)|new\s+site|multi-?page\s+site|e-?commerce\s+site|booking\s+page|service\s+area\s+page)\b/i;

const CODE_SIGNAL =
  /\b(code|source\s*code|typescript|javascript|python|sql|regex|api\s+route|express\s+route|react\s+component|next\.?js|vite|tailwind|css|json\s+schema|curl|bash\s+script|shell\s+script|automation\s+script|webhook\s+handler|unit\s+test|vitest|playwright|drizzle|migration|zod\s+schema|function\s|class\s|interface\s|type\s+alias|npm|package\.json|dockerfile|github\s+action)\b/i;

/** Natural-language coding asks without capability chips or explicit language keywords. */
const CODE_NATURAL_SIGNAL =
  /\b(?:write|build|implement|create|draft|give\s+me|show\s+me|need|help\s+me\s+(?:write|build|code))\s+(?:a\s+|an\s+|the\s+|my\s+)?(?:short\s+|simple\s+|small\s+)?(?:\w+\s+){0,4}(?:function|validator|validation|route|handler|endpoint|middleware|component|hook|script|module|utility|helper|parser|schema|migration|test(?:\s+suite)?|api)\b/i;

const LOGO_CREATIVE_SIGNAL =
  /\b(logo|brand\s*pack|wordmark|favicon|app\s*icon|vectorize|vector\s+logo|generate\s+(?:\d+\s+)?(?:logo|brand)|create\s+(?:a\s+)?logo|design\s+(?:a\s+)?logo|brand\s+kit|icon\s+set)\b/i;

const WEBSITE_EXCLUDES_LOGO_PATH =
  /\b(website|web\s*site|landing\s*page|homepage|sitemap|wireframe|web\s*design)\b/i;

/** Operator asked for a site / landing experience (LLM deliverable, not logo tool). */
export function wantsWebsiteDeliverable(message: string): boolean {
  return WEBSITE_SIGNAL.test(message.trim());
}

/** Operator asked for code or technical artifacts in chat. */
export function wantsCodeDeliverable(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (CODE_SIGNAL.test(trimmed)) return true;
  if (CODE_NATURAL_SIGNAL.test(trimmed)) return true;
  return (
    /\b(zod|typescript|javascript|python)\b/i.test(trimmed) &&
    /\b(validat|function|route|component)\w*/i.test(trimmed)
  );
}

/** Route to logo/brand-pack creative approvals (not fleet LLM). */
export function wantsLogoCreativePath(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (WEBSITE_EXCLUDES_LOGO_PATH.test(trimmed) && !LOGO_CREATIVE_SIGNAL.test(trimmed)) {
    return false;
  }
  return LOGO_CREATIVE_SIGNAL.test(trimmed);
}

/** Long-form structured output — shared with Opus escalation. */
export function wantsLongDeliverable(message: string): boolean {
  if (wantsStitchMediaRequest(message)) return true;
  if (wantsWebsiteDeliverable(message) || wantsCodeDeliverable(message)) return true;
  return /\b(business\s+plan|go-to-market|gtm\s+plan|standard\s+operating|sop\b|operating\s+procedure|competitive\s+analysis|competitor\s+(?:research|analysis|landscape|scan)|market\s+research|pitch\s+deck|investor\s+(?:memo|deck)|executive\s+summary|strategic\s+plan|marketing\s+plan|content\s+calendar|playbook|proposal\s+for|rfp\s+response|technical\s+spec|architecture\s+doc|prd\b|product\s+requirements)\b/i.test(
    message,
  );
}

const UNIVERSAL_BLOCK = `## Universal deliverables (always in scope)
You can answer ANY reasonable operator request inside \`reply\`. Deliverables live in this thread as markdown — the operator copies from chat; large plans, code, and website prototypes may also be saved as a downloadable .md file automatically.

**Default:** Ship a complete, usable artifact in one turn. Do not refuse technical, creative, or strategic work. If scope is huge, deliver a strong v1 plus a short "phase 2" list. Long replies may also appear as a downloadable markdown file in the artifacts panel.

**Code & engineering:** Use fenced blocks with language tags (\`typescript\`, \`tsx\`, \`javascript\`, \`html\`, \`css\`, \`sql\`, \`python\`, \`bash\`, \`json\`). Prefer complete, copy-paste-ready snippets. For multi-file work, label each block with a comment like \`// src/routes/example.ts\`. Match Wireline conventions when relevant: Zod validation, Express handlers, React 19 + Tailwind 4, Drizzle, structured logging — never \`console.log\`.

**Spreadsheets & data:** Use markdown tables or CSV fenced blocks when they ask for sheets, models, or rosters.

**Refusals:** Only refuse illegal content, impersonation of real brands/trademarks in logo generation, or medical/legal advice framed as professional counsel — not "I can't write code."`;

const WEBSITE_BLOCK = `## Website / product design mode (this turn)
**Industry:** Match the business vertical in THIS message only (HVAC vs plumbing vs dental, etc.). Do not recycle copy from earlier turns unless the operator asks.

Structure \`reply\` as:
1. **Goals & audience** (2–4 bullets)
2. **Sitemap** — pages and primary CTA per page
3. **Page sections** — hero, proof, services, FAQ, footer (per key page)
4. **Visual direction** — typography, color, spacing (words only; no emoji)
5. **Starter prototype** — you MUST include exactly one \`\`\`html\`\`\` fenced block (mobile-first, semantic landmarks, accessible labels, inline CSS or a single \`<style>\` block). Keep it under ~120 lines so the operator gets a paste-ready v1 fast.
6. **Optional** — \`\`\`tsx\`\`\` component sketch if they will implement in React
7. **Handoff** — hosting, forms, analytics, SEO meta, performance checklist

Do not send them only to a logo tool unless they explicitly asked for a logo or brand pack.`;

const CODE_BLOCK = `## Code mode (this turn)
- Lead with a one-line summary, then the implementation.
- Include types, error handling, and env var names where relevant — no secrets or real API keys.
- If the ask is Wireline-specific, align with existing patterns (auth cookie, \`validateBody\`, rate limits).
- Add a short "How to use" section after the blocks.`;

/** Extra system-prompt sections for the current operator message. */
export function buildDirectorDeliverableGuidance(operatorMessage: string): string {
  const parts: string[] = [];
  const needsUniversal =
    wantsWebsiteDeliverable(operatorMessage) ||
    wantsCodeDeliverable(operatorMessage) ||
    wantsLongDeliverable(operatorMessage);
  if (needsUniversal) parts.push(UNIVERSAL_BLOCK);
  if (wantsWebsiteDeliverable(operatorMessage)) parts.push(WEBSITE_BLOCK);
  if (wantsCodeDeliverable(operatorMessage)) parts.push(CODE_BLOCK);
  return parts.join("\n\n");
}
