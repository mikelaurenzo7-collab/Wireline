/**
 * Letterpress render for a single call recap.
 *
 * The composition is decided by the call: an eyebrow section label with
 * a colored dot glyph identifying the outcome, a single-line verdict
 * hero, a mono metadata row (direction · duration · started · campaign
 * · sentiment · intent), a short "What happened" paragraph if a summary
 * was captured, a timeline of moments with mm:ss and a violet dot per
 * row, an action checklist with owners, and the transcript folded away
 * behind a mono disclosure. The agent signs off in the footer.
 *
 * Nothing here talks to any vendor by name; the customer surface only
 * speaks the product.
 */
import type { CallRecapContent, CallRecapTranscriptLine } from "../types";
import type { WorkspaceBrand } from "../brand";
import { escapeHtml } from "./escape";
import { renderShell } from "./shell";

const OUTCOME_DOT_CLASS: Record<CallRecapContent["outcome"], string> = {
  booked: "wl-outcome-success",
  qualified: "wl-outcome-success",
  followup: "wl-outcome-info",
  info: "wl-outcome-info",
  unreachable: "wl-outcome-warning",
  dnc: "wl-outcome-error",
  other: "",
};

function formatDurationMinutes(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return "under 1 min";
  }
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

function formatMomentTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatStartedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return (
    date.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: true,
      timeZone: "UTC",
    }) + " UTC"
  );
}

function directionLabel(direction: string | null | undefined): string {
  if (direction === "inbound") return "Inbound";
  if (direction === "outbound") return "Outbound";
  return "Call";
}

function renderMetadata(content: CallRecapContent): string {
  const entries: [string, string][] = [];
  entries.push(["Direction", directionLabel(content.metadata.direction)]);
  entries.push(["Duration", formatDurationMinutes(content.metadata.durationSeconds)]);
  const startedAt = formatStartedAt(content.metadata.startedAtIso);
  if (startedAt) entries.push(["Started", startedAt]);
  if (content.metadata.campaignSource) entries.push(["Campaign", content.metadata.campaignSource]);
  const callerLine = [content.caller?.name, content.caller?.phone].filter(Boolean).join(" · ");
  if (callerLine) entries.push(["Caller", callerLine]);
  if (content.sentiment) entries.push(["Sentiment", content.sentiment]);
  if (content.intentLabel) entries.push(["Intent", content.intentLabel]);
  return `
    <dl class="wl-metadata">
      ${entries
        .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
        .join("\n      ")}
    </dl>`;
}

function renderMoments(content: CallRecapContent): string {
  if (content.moments.length === 0) return "";
  const items = content.moments
    .slice(0, 12)
    .map(
      (moment) => `
        <li class="wl-moment">
          <span class="wl-moment-time">${escapeHtml(formatMomentTime(moment.atSeconds))}</span>
          <span class="wl-moment-dot" aria-hidden="true"></span>
          <span class="wl-moment-note">${escapeHtml(moment.note)}</span>
        </li>`,
    )
    .join("");
  return `
    <section class="wl-section" aria-labelledby="wl-moments-label">
      <h2 class="wl-section-label" id="wl-moments-label">Moments</h2>
      <ul class="wl-moment-list">${items}
      </ul>
    </section>`;
}

function renderActions(content: CallRecapContent): string {
  if (content.actions.length === 0) return "";
  const items = content.actions
    .slice(0, 8)
    .map((action) => {
      const meta = [action.owner, action.dueAtLabel].filter(Boolean).join(" · ");
      return `
        <li class="wl-action">
          <span aria-hidden="true"></span>
          <div class="wl-action-body">
            <div>${escapeHtml(action.description)}</div>
            ${meta ? `<div class="wl-action-owner">${escapeHtml(meta)}</div>` : ""}
          </div>
        </li>`;
    })
    .join("");
  return `
    <section class="wl-section" aria-labelledby="wl-actions-label">
      <h2 class="wl-section-label" id="wl-actions-label">Next actions</h2>
      <ul class="wl-action-list">${items}
      </ul>
    </section>`;
}

function renderTranscriptLine(line: CallRecapTranscriptLine): string {
  const role = line.role === "agent" ? "Agent" : "Caller";
  return `
      <div class="wl-transcript-line">
        <span class="wl-transcript-role">${escapeHtml(role)}</span>
        <span class="wl-transcript-text">${escapeHtml(line.text)}</span>
      </div>`;
}

function renderTranscript(content: CallRecapContent): string {
  if (content.transcript.length === 0) return "";
  const inner = content.transcript.slice(0, 200).map(renderTranscriptLine).join("");
  return `
    <section class="wl-section" aria-label="Transcript">
      <details class="wl-transcript-fold">
        <summary><span>Transcript</span></summary>
        <div class="wl-transcript">${inner}
        </div>
      </details>
    </section>`;
}

function renderSummary(content: CallRecapContent): string {
  if (!content.summary || !content.summary.trim()) return "";
  return `
    <section class="wl-section" aria-labelledby="wl-summary-label">
      <h2 class="wl-section-label" id="wl-summary-label">What happened</h2>
      <p style="color: var(--wl-textSecondary); line-height: 1.65; max-width: 60ch;">${escapeHtml(content.summary)}</p>
    </section>`;
}

export function renderCallRecap(content: CallRecapContent, brand: WorkspaceBrand): string {
  const outcomeClass = OUTCOME_DOT_CLASS[content.outcome] ?? "";
  const eyebrow = "Call recap";
  const title = `Call recap · ${content.outcomeLabel} — ${brand.displayName}`;
  const agentLabel = content.agent.role
    ? `${content.agent.name}, ${content.agent.role}`
    : content.agent.name;

  const body = `
    <section class="wl-section" aria-labelledby="wl-hero-label">
      <h2 class="wl-visually-hidden" id="wl-hero-label">Call outcome</h2>
      <div>
        <span class="wl-outcome-pill ${outcomeClass}">
          <span>${escapeHtml(content.outcomeLabel)}</span>
        </span>
      </div>
      <h1 class="wl-hero">${escapeHtml(content.hero)}</h1>
      ${renderMetadata(content)}
      <div class="wl-wire-rule" role="separator" aria-hidden="true"><span></span></div>
    </section>
    ${renderSummary(content)}
    ${renderMoments(content)}
    ${renderActions(content)}
    ${renderTranscript(content)}`;

  return renderShell({
    title,
    eyebrow,
    body,
    brand,
    agentSignature: agentLabel,
  });
}
