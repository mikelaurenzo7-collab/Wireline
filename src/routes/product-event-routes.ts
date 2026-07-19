import { Router, type Response } from "express";
import { authenticateUser } from "../middleware/auth";
import { productEventsRateLimit } from "../middleware/api-rate-limits";
import { emitServerProductEvent } from "../lib/product-event-server";
import {
  isProductEventAudience,
  isProductEventName,
  isProductEventSurface,
} from "../lib/product-events";
import { canonicalPlanId } from "../lib/plan-catalog";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const MAX_METADATA_ENTRIES = 24;
const MAX_METADATA_STRING_LENGTH = 256;

function optionalString(value: unknown, maxLength = MAX_METADATA_STRING_LENGTH): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function sanitizeMetadata(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const metadata: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, MAX_METADATA_ENTRIES)) {
    const key = rawKey.trim().slice(0, 64);
    if (!key) continue;

    if (
      typeof rawValue === "number" ||
      typeof rawValue === "boolean" ||
      rawValue === null
    ) {
      metadata[key] = rawValue;
    } else if (typeof rawValue === "string") {
      metadata[key] = rawValue.slice(0, MAX_METADATA_STRING_LENGTH);
    }
  }
  return metadata;
}

/**
 * Authenticated, tenant-bound product milestone ingestion.
 *
 * Identity always comes from the httpOnly Wireline session. Client account/user
 * ids are ignored, metadata is bounded, and the server appends the event to the
 * durable audit ledger through emitServerProductEvent.
 */
router.post(
  "/api/product-events",
  authenticateUser,
  productEventsRateLimit,
  (req: AuthenticatedRequest, res: Response) => {
    const body =
      req.body && typeof req.body === "object"
        ? (req.body as Record<string, unknown>)
        : {};
    const eventName = optionalString(body.event, 64);

    if (!isProductEventName(eventName)) {
      return res.status(400).json({
        error: "Unknown product event.",
        code: "INVALID_PRODUCT_EVENT",
        requestId: res.locals?.requestId,
      });
    }

    const rawAudience = optionalString(body.audience, 64);
    const rawSurface = optionalString(body.surface, 64);
    const planId = canonicalPlanId(optionalString(body.planId, 64));
    const correlationId = optionalString(body.correlationId, 160);
    const metadata = sanitizeMetadata(body.metadata);
    const occurredAt = optionalString(body.occurredAt, 64);
    if (occurredAt) metadata.client_occurred_at = occurredAt;

    emitServerProductEvent({
      event: eventName,
      userId: req.user.id,
      audience: isProductEventAudience(rawAudience) ? rawAudience : undefined,
      surface: isProductEventSurface(rawSurface) ? rawSurface : "web_workspace",
      planId: planId ?? undefined,
      wedge: optionalString(body.wedge, 80),
      templateId: optionalString(body.templateId, 128),
      agentId: optionalString(body.agentId, 128),
      correlationId,
      metadata,
    });

    return res.status(202).json({
      accepted: true,
      correlation_id: correlationId ?? null,
    });
  },
);

export default router;
