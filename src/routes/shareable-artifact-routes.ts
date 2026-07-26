/**
 * Public shareable-artifact route.
 *
 * `GET /recap/:slug?t=<token>` verifies the bearer token against the
 * stored hash, renders the Letterpress SSR page, and increments the view
 * counter fire-and-forget. Unknown slug, expired, revoked, and bad-token
 * cases all return an identical 404 render — the caller cannot
 * distinguish which reason applies. Rate-limited per IP and per slug so
 * a leaked URL cannot be used to enumerate.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { rateLimit } from "../lib/rate-limit";
import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";
import { resolveWorkspaceBrand } from "../lib/shareable-artifact/brand";
import { planById } from "../lib/plan-catalog";
import { isValidSlug } from "../lib/shareable-artifact/tokens";
import {
  noteArtifactView,
  resolveArtifact,
  revokeArtifact,
} from "../lib/shareable-artifact/service";
import { renderCallRecap } from "../lib/shareable-artifact/template/render-call-recap";
import { renderNotFound } from "../lib/shareable-artifact/template/render-not-found";
import { renderWeeklyRecap } from "../lib/shareable-artifact/template/render-weekly-recap";
import type { WorkspaceBrand } from "../lib/shareable-artifact/brand";

const router = Router();

async function ipRateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    // Key on Express's trust-proxy-resolved req.ip, NOT the raw X-Forwarded-For header:
    // XFF is client-writable, so keying on XFF[0] lets a flooder mint a fresh bucket per request.
    const ip = (req.ip || "anon").trim();
    const decision = await rateLimit(`recap:ip:${ip}`, {
      bucket: "recap:ip",
      windowMs: 60_000,
      max: 60,
    });
    if (!decision.allowed) {
      res.setHeader("Retry-After", String(Math.ceil(decision.resetMs / 1000)));
      res.status(429).send("Too many requests");
      return;
    }
  } catch (err) {
    log.warn("recap ip rate limiter failed — fail open", { error: getErrorMessage(err) });
  }
  next();
}

async function slugRateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return next();
    const decision = await rateLimit(`recap:slug:${slug}`, {
      bucket: "recap:slug",
      windowMs: 60_000,
      max: 20,
    });
    if (!decision.allowed) {
      res.setHeader("Retry-After", String(Math.ceil(decision.resetMs / 1000)));
      res.status(429).send("Too many requests");
      return;
    }
  } catch (err) {
    log.warn("recap slug rate limiter failed — fail open", { error: getErrorMessage(err) });
  }
  next();
}

function sendHtml(res: Response, html: string, status: number = 200): void {
  res.status(status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nocache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.send(html);
}

async function loadResolverPlan(userId: string) {
  try {
    const [row] = await drizzle
      .select({ plan: schema.subscriptions.plan })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1);
    return planById(row?.plan);
  } catch {
    return null;
  }
}

router.get("/recap/:slug", ipRateLimit, slugRateLimit, async (req: Request, res: Response) => {
  const slug = String(req.params.slug || "").trim();
  const token = String(req.query.t || "").trim();

  if (!isValidSlug(slug)) {
    sendHtml(res, renderNotFound(), 404);
    return;
  }

  let artifact;
  try {
    artifact = await resolveArtifact(slug, token);
  } catch (err) {
    log.warn("recap resolve failed", { error: getErrorMessage(err) });
    sendHtml(res, renderNotFound(), 404);
    return;
  }

  if (!artifact) {
    sendHtml(res, renderNotFound(), 404);
    return;
  }

  let brand: WorkspaceBrand;
  try {
    const plan = await loadResolverPlan(artifact.userId);
    brand = await resolveWorkspaceBrand(artifact.userId, plan);
  } catch (err) {
    log.warn("recap brand resolve failed", { error: getErrorMessage(err) });
    brand = await resolveWorkspaceBrand(artifact.userId, null);
  }

  let html: string;
  if (artifact.kind === "call_recap" && artifact.content.kind === "call_recap") {
    html = renderCallRecap(artifact.content, brand);
  } else if (artifact.kind === "weekly_recap" && artifact.content.kind === "weekly_recap") {
    html = renderWeeklyRecap(artifact.content, brand);
  } else {
    html = renderNotFound(brand);
    sendHtml(res, html, 404);
    return;
  }

  sendHtml(res, html, 200);

  void noteArtifactView(artifact.id).catch(() => undefined);
});

router.delete(
  "/api/recap-artifacts/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const id = String(req.params.id || "").trim();
    if (!id) throw AppError.fromHttpStatus(400, "artifact id is required");
    const ok = await revokeArtifact({ userId: req.user.id, artifactId: id });
    if (!ok) throw AppError.fromHttpStatus(404, "Recap not found in your workspace.");
    res.json({ revoked: true });
  },
);

router.get(
  "/api/recap-artifacts",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rows = await drizzle
        .select({
          id: schema.recapArtifacts.id,
          kind: schema.recapArtifacts.kind,
          slug: schema.recapArtifacts.slug,
          sourceRef: schema.recapArtifacts.sourceRef,
          publishedAt: schema.recapArtifacts.publishedAt,
          expiresAt: schema.recapArtifacts.expiresAt,
          viewCount: schema.recapArtifacts.viewCount,
          lastViewedAt: schema.recapArtifacts.lastViewedAt,
          revokedAt: schema.recapArtifacts.revokedAt,
        })
        .from(schema.recapArtifacts)
        .where(eq(schema.recapArtifacts.userId, req.user.id))
        .orderBy(schema.recapArtifacts.publishedAt);
      res.json({ artifacts: rows });
    } catch (err) {
      log.error("recap list failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to list recap artifacts");
    }
  },
);

export default router;
