/**
 * Letterpress render for the weekly review.
 *
 * Composition: an eyebrow with the period label, a headline verdict on
 * the week, a tabular totals grid (mono label + Instrument Serif
 * numeral), an inline SVG volume sparkline with baseline + peak marker,
 * an outcome-mix strip with restrained accent, top moments (three to
 * five day + hero + caller lockups), and an open-follow-ups checklist.
 * Everything self-contained; no external assets; both themes handled by
 * the shared shell; print rules inherit from the shell.
 */
import type { WorkspaceBrand } from "../brand";
import type { WeeklyRecapContent } from "../types";
import { escapeHtml } from "./escape";
import { renderShell } from "./shell";

const SPARKLINE_WIDTH = 640;
const SPARKLINE_HEIGHT = 88;
const SPARKLINE_PADDING_X = 8;
const SPARKLINE_PADDING_TOP = 8;
const SPARKLINE_PADDING_BOTTOM = 22;

function renderSparkline(content: WeeklyRecapContent): string {
  const points = content.volumeByDay;
  if (points.length < 2) return "";
  const max = Math.max(1, ...points.map((point) => point.count));
  const peakIndex = points.reduce(
    (best, point, index) => (point.count > points[best].count ? index : best),
    0,
  );
  const usableHeight = SPARKLINE_HEIGHT - SPARKLINE_PADDING_TOP - SPARKLINE_PADDING_BOTTOM;
  const usableWidth = SPARKLINE_WIDTH - SPARKLINE_PADDING_X * 2;
  const stepX = usableWidth / Math.max(1, points.length - 1);
  const coordinates = points.map((point, index) => {
    const x = SPARKLINE_PADDING_X + stepX * index;
    const y = SPARKLINE_PADDING_TOP + usableHeight - (point.count / max) * usableHeight;
    return { x, y };
  });
  const path = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const baselineY = SPARKLINE_PADDING_TOP + usableHeight;
  const areaPath =
    `M ${SPARKLINE_PADDING_X.toFixed(1)} ${baselineY.toFixed(1)} ` +
    coordinates.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ") +
    ` L ${(SPARKLINE_WIDTH - SPARKLINE_PADDING_X).toFixed(1)} ${baselineY.toFixed(1)} Z`;

  const peak = coordinates[peakIndex];
  const labels = points
    .map((point, index) => {
      const x = SPARKLINE_PADDING_X + stepX * index;
      return `<text x="${x.toFixed(1)}" y="${(SPARKLINE_HEIGHT - 4).toFixed(1)}" text-anchor="middle" fill="var(--wl-textTertiary)" font-family="var(--wl-font-mono)" font-size="9" letter-spacing="0.14em">${escapeHtml(point.label.toUpperCase())}</text>`;
    })
    .join("");

  return `
      <svg viewBox="0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}" role="img" aria-label="Daily call volume — peak on ${escapeHtml(points[peakIndex].label)}" width="100%" height="${SPARKLINE_HEIGHT}" preserveAspectRatio="none" style="display:block;overflow:visible;">
        <line x1="${SPARKLINE_PADDING_X.toFixed(1)}" x2="${(SPARKLINE_WIDTH - SPARKLINE_PADDING_X).toFixed(1)}" y1="${baselineY.toFixed(1)}" y2="${baselineY.toFixed(1)}" stroke="var(--wl-borderSoft)" stroke-width="1" />
        <path d="${areaPath}" fill="var(--wl-accent)" fill-opacity="0.08" />
        <path d="${path}" fill="none" stroke="var(--wl-accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${peak.x.toFixed(1)}" cy="${peak.y.toFixed(1)}" r="4" fill="var(--wl-canvas)" stroke="var(--wl-accent)" stroke-width="1.4" />
        <circle cx="${peak.x.toFixed(1)}" cy="${peak.y.toFixed(1)}" r="1.6" fill="var(--wl-accent)" />
        ${labels}
      </svg>`;
}

function renderTotals(content: WeeklyRecapContent): string {
  const items: [string, string][] = [
    ["Calls", String(content.totals.calls)],
    ["Voice minutes", String(content.totals.voiceMinutes)],
    ["Booked", String(content.totals.booked)],
    ["Qualified", String(content.totals.qualified)],
    ["Follow-up", String(content.totals.followup)],
  ];
  if (typeof content.averageQaScore === "number" && Number.isFinite(content.averageQaScore)) {
    items.push(["Avg. QA", `${Math.round(content.averageQaScore)}`]);
  }
  const cells = items
    .map(
      ([label, value]) => `
        <div style="display:grid;gap:6px;align-content:end;">
          <span style="font-family:var(--wl-font-mono);font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--wl-textTertiary);">${escapeHtml(label)}</span>
          <span style="font-family:var(--wl-font-display);font-size:36px;line-height:1;color:var(--wl-textPrimary);font-variant-numeric:tabular-nums;letter-spacing:-0.01em;">${escapeHtml(value)}</span>
        </div>`,
    )
    .join("");
  return `
    <section class="wl-section" aria-labelledby="wl-totals-label">
      <h2 class="wl-section-label" id="wl-totals-label">The week</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:var(--wl-space-5) var(--wl-space-6);align-items:end;">
        ${cells}
      </div>
      <div style="margin-top:var(--wl-space-5);">
        ${renderSparkline(content)}
      </div>
    </section>`;
}

function renderOutcomeMix(content: WeeklyRecapContent): string {
  if (content.outcomeMix.length === 0) return "";
  const sorted = content.outcomeMix
    .filter((slice) => slice.count > 0)
    .sort((left, right) => right.count - left.count);
  const total = sorted.reduce((sum, slice) => sum + slice.count, 0) || 1;
  const bars = sorted
    .map((slice, index) => {
      const percent = Math.round((slice.count / total) * 100);
      const color = index === 0 ? "var(--wl-accent)" : "var(--wl-wire)";
      const opacity = index === 0 ? 1 : Math.max(0.5, 1 - index * 0.14);
      return `
        <div style="display:grid;grid-template-columns:120px 68px 1fr;gap:var(--wl-space-3);align-items:center;">
          <span style="display:inline-flex;align-items:center;gap:8px;font-family:var(--wl-font-mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--wl-textPrimary);">
            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};opacity:${opacity.toFixed(2)};"></span>
            ${escapeHtml(slice.tag)}
          </span>
          <span style="font-family:var(--wl-font-mono);font-size:11px;color:var(--wl-textSecondary);font-variant-numeric:tabular-nums;letter-spacing:0.04em;">${escapeHtml(String(slice.count))} · ${percent}%</span>
          <span style="display:block;height:4px;background:var(--wl-borderSoft);border-radius:999px;overflow:hidden;">
            <span style="display:block;height:100%;width:${percent}%;background:${color};opacity:${opacity.toFixed(2)};"></span>
          </span>
        </div>`;
    })
    .join("");
  return `
    <section class="wl-section" aria-labelledby="wl-mix-label">
      <h2 class="wl-section-label" id="wl-mix-label">Outcome mix</h2>
      <div style="display:grid;gap:var(--wl-space-3);">${bars}</div>
    </section>`;
}

function renderTopMoments(content: WeeklyRecapContent): string {
  if (content.topMoments.length === 0) return "";
  const items = content.topMoments
    .slice(0, 5)
    .map(
      (moment) => `
        <li class="wl-moment">
          <span class="wl-moment-time">${escapeHtml((moment.atLabel ?? "").toUpperCase())}</span>
          <span class="wl-moment-dot" aria-hidden="true"></span>
          <span class="wl-moment-note">
            ${escapeHtml(moment.hero)}
            ${moment.caller ? `<span class="wl-moment-note-caller">${escapeHtml(moment.caller)}</span>` : ""}
          </span>
        </li>`,
    )
    .join("");
  return `
    <section class="wl-section" aria-labelledby="wl-topmoments-label">
      <h2 class="wl-section-label" id="wl-topmoments-label">Top moments</h2>
      <ul class="wl-moment-list">${items}
      </ul>
    </section>`;
}

function renderFollowUps(content: WeeklyRecapContent): string {
  if (content.followUps.length === 0) return "";
  const items = content.followUps
    .slice(0, 10)
    .map((item) => {
      const meta = [
        item.priority ? `${item.priority.toUpperCase()} priority` : null,
        item.dueAtLabel,
      ]
        .filter(Boolean)
        .join(" · ");
      return `
        <li class="wl-action">
          <span aria-hidden="true"></span>
          <div class="wl-action-body">
            <div>${escapeHtml(item.description)}</div>
            ${meta ? `<div class="wl-action-owner">${escapeHtml(meta)}</div>` : ""}
          </div>
        </li>`;
    })
    .join("");
  return `
    <section class="wl-section" aria-labelledby="wl-followups-label">
      <h2 class="wl-section-label" id="wl-followups-label">Open follow-ups</h2>
      <ul class="wl-action-list">${items}
      </ul>
    </section>`;
}

export function renderWeeklyRecap(content: WeeklyRecapContent, brand: WorkspaceBrand): string {
  const eyebrow = `Weekly review · ${content.period.label}`;
  const title = `Weekly review · ${content.period.label} — ${brand.displayName}`;
  const hero = content.headline?.trim() ? content.headline : buildDefaultHeadline(content);

  const body = `
    <section class="wl-section" aria-labelledby="wl-week-label">
      <h2 class="wl-visually-hidden" id="wl-week-label">Weekly summary</h2>
      <h1 class="wl-hero">${escapeHtml(hero)}</h1>
      <div class="wl-metadata" aria-hidden="true">
        <dt>Period</dt>
        <dd>${escapeHtml(content.period.label)}</dd>
      </div>
      <div class="wl-wire-rule" role="separator" aria-hidden="true"><span></span></div>
    </section>
    ${renderTotals(content)}
    ${renderOutcomeMix(content)}
    ${renderTopMoments(content)}
    ${renderFollowUps(content)}`;

  return renderShell({ title, eyebrow, body, brand });
}

function buildDefaultHeadline(content: WeeklyRecapContent): string {
  const { calls, booked, qualified } = content.totals;
  if (calls === 0) return "A quiet week on the wire.";
  if (booked === 0 && qualified === 0) {
    return `${calls} conversations this week — none advanced to a booking or qualified opportunity yet.`;
  }
  return `${calls} conversations · ${booked} booked · ${qualified} qualified.`;
}
