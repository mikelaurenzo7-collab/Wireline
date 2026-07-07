import { Router, type Response } from "express";
import { z } from "zod";
import { AppError } from "../lib/api-error";
import { authenticateUser } from "../middleware/auth";
import { validate } from "../middleware/input-validation";
import { claudeRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import {
  parseExtensionBrowserContext,
  type BrowserCommandContext,
} from "../lib/browser-command-context";
import {
  signBrowserHandoffToken,
  studioHandoffUrl,
  verifyBrowserHandoffToken,
} from "../lib/browser-handoff-token";

const router = Router();

const exchangeSchema = z.object({
  version: z.literal(1),
  source: z.literal("browser-extension"),
  capturedAt: z.string().min(1),
  title: z.string().max(180).optional().default(""),
  url: z.string().max(2048).optional().default(""),
  description: z.string().max(320).optional().default(""),
  selection: z.string().max(1600).optional().default(""),
  link: z.string().max(512).optional().default(""),
  request: z.string().max(800).optional().default(""),
});

const redeemQuerySchema = z.object({
  token: z.string().min(1),
});

function normalizeExchangeBody(body: z.infer<typeof exchangeSchema>): BrowserCommandContext | null {
  return parseExtensionBrowserContext({
    version: body.version,
    source: body.source,
    capturedAt: body.capturedAt,
    title: body.title,
    url: body.url,
    description: body.description,
    selection: body.selection,
    link: body.link,
    request: body.request,
  });
}

router.post(
  "/api/browser/handoff/exchange",
  claudeRateLimiter,
  authenticateUser,
  validate({ body: exchangeSchema }),
  (req: AuthenticatedRequest, res: Response) => {
    const context = normalizeExchangeBody(req.body);
    if (!context) {
      throw AppError.fromHttpStatus(400, "Invalid or expired browser handoff context.");
    }
    const token = signBrowserHandoffToken(req.user.id, context);
    res.json({
      token,
      studio_url: studioHandoffUrl(token),
    });
  },
);

router.get(
  "/api/browser/handoff/redeem",
  claudeRateLimiter,
  authenticateUser,
  validate({ query: redeemQuerySchema }),
  (req: AuthenticatedRequest, res: Response) => {
    const token = String(req.query.token || "");
    const context = verifyBrowserHandoffToken(token, req.user.id);
    if (!context) {
      throw AppError.fromHttpStatus(400, "Invalid or expired handoff token.");
    }
    res.json({ context });
  },
);

export default router;
