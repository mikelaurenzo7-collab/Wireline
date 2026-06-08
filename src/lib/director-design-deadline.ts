/**
 * Time budget for Spectrum Desk — finish inside the Vercel / client timeout.
 */
import { DIRECTOR_DESIGN_STUDIO_REQUEST_TIMEOUT_MS } from "./api";

/** Buffer under the HTTP timeout so localize + packaging always run. */
export const DESIGN_STUDIO_DEADLINE_BUFFER_MS = 25_000;

/** Reserved for emergency polish + US localize + final approval + artifact packaging. */
export const DESIGN_STUDIO_RESERVE_TAIL_MS = 85_000;

/** Minimum remaining time to start another full pass (build + critic + finisher). */
export const DESIGN_STUDIO_RESERVE_PASS_MS = 70_000;

/** Skip optional Hy3 challenger when less than this remains. */
export const DESIGN_STUDIO_SKIP_CHALLENGER_REMAINING_MS = 140_000;

/** Skip pass 3 when gate already passed on pass 2 and time is tight. */
export const DESIGN_STUDIO_SKIP_EXTRA_PASS_REMAINING_MS = 95_000;

/** Skip hero image generation when less than this remains (build is higher priority). */
export const DESIGN_STUDIO_SKIP_IMAGINE_REMAINING_MS = 380_000;

/** Per-stage ceilings — prevent one OpenRouter call from burning the full budget. */
export const DESIGN_STAGE_TIMEOUT_MS = {
  research: 45_000,
  layoutScout: 30_000,
  imagineHero: 55_000,
  imagineTexture: 35_000,
  build: 130_000,
  critic: 50_000,
  finisher: 100_000,
  challenger: 100_000,
  emergencyPolish: 75_000,
  localize: 60_000,
} as const;

export type DesignStageTimeoutKey = keyof typeof DESIGN_STAGE_TIMEOUT_MS;

/** Combine parent abort with a stage timeout so hung models fail fast. */
export function designStageAbortSignal(
  stage: DesignStageTimeoutKey,
  parent?: AbortSignal,
): AbortSignal {
  const budgetMs = DESIGN_STAGE_TIMEOUT_MS[stage];
  const timeoutSignal = AbortSignal.timeout(budgetMs);
  if (!parent) return timeoutSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([parent, timeoutSignal]);
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent.aborted) {
    controller.abort();
    return controller.signal;
  }
  parent.addEventListener("abort", abort, { once: true });
  timeoutSignal.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

export interface DesignStudioDeadline {
  startedAt: number;
  deadlineAt: number;
}

export function createDesignStudioDeadline(
  startedAt = Date.now(),
): DesignStudioDeadline {
  const budget =
    DIRECTOR_DESIGN_STUDIO_REQUEST_TIMEOUT_MS - DESIGN_STUDIO_DEADLINE_BUFFER_MS;
  return {
    startedAt,
    deadlineAt: startedAt + budget,
  };
}

export function designStudioRemainingMs(
  deadline: DesignStudioDeadline,
  now = Date.now(),
): number {
  return Math.max(0, deadline.deadlineAt - now);
}

export function designStudioElapsedMs(deadline: DesignStudioDeadline, now = Date.now()): number {
  return now - deadline.startedAt;
}

export function shouldSkipOptionalChallenger(deadline: DesignStudioDeadline, now = Date.now()): boolean {
  return designStudioRemainingMs(deadline, now) < DESIGN_STUDIO_SKIP_CHALLENGER_REMAINING_MS;
}

export function shouldStartRefinementPass(
  deadline: DesignStudioDeadline,
  pass: number,
  now = Date.now(),
): boolean {
  const remaining = designStudioRemainingMs(deadline, now);
  if (remaining < DESIGN_STUDIO_RESERVE_TAIL_MS) return false;
  if (pass >= 3 && remaining < DESIGN_STUDIO_SKIP_EXTRA_PASS_REMAINING_MS) return false;
  if (remaining < DESIGN_STUDIO_RESERVE_PASS_MS + DESIGN_STUDIO_RESERVE_TAIL_MS) {
    return pass <= 1;
  }
  return true;
}

export function maxTokensForPass(pass: 1 | 2 | 3, stage: "build" | "critic" | "finisher"): number {
  if (pass === 1) {
    if (stage === "build") return 14_336;
    if (stage === "critic") return 1_536;
    return 12_288;
  }
  if (pass === 2) {
    if (stage === "build") return 10_240;
    if (stage === "critic") return 1_024;
    return 8_192;
  }
  if (stage === "build") return 8_192;
  if (stage === "critic") return 768;
  return 6_144;
}
