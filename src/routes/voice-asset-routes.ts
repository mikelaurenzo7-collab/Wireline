import { Buffer } from "node:buffer";
import { Router } from "express";

import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { requirePlatformAdmin } from "../middleware/platform-admin";
import { voiceAssetService } from "../lib/voice/voice-asset-service";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const reads = createRateLimiter({ bucket: "api:voice-assets-read", windowMs: 60_000, max: 20 });
const writes = createRateLimiter({
  bucket: "api:voice-assets-write",
  windowMs: 60_000,
  max: 8,
  failClosedOnError: true,
});
const previews = createRateLimiter({
  bucket: "api:voice-assets-preview",
  windowMs: 60_000,
  max: 3,
  failClosedOnError: true,
});

router.get(
  "/api/voice/assets/capabilities",
  authenticateUser,
  reads,
  async (req: AuthenticatedRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await voiceAssetService.capabilities(req.user));
  },
);
router.get(
  "/api/voice/assets",
  authenticateUser,
  reads,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await voiceAssetService.list(req.user));
  },
);
router.post(
  "/api/voice/assets",
  authenticateUser,
  writes,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(await voiceAssetService.create(req.user, req.body));
  },
);
router.post(
  "/api/voice/assets/:assetId/review",
  authenticateUser,
  writes,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await voiceAssetService.review(req.user, req.params.assetId, req.body));
  },
);
router.delete(
  "/api/voice/assets/:assetId",
  authenticateUser,
  writes,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await voiceAssetService.remove(req.user, req.params.assetId, req.body));
  },
);
router.post(
  "/api/voice/assets/:assetId/preview",
  authenticateUser,
  previews,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    const controller = new AbortController();
    const abort = () => controller.abort();
    const close = () => {
      if (!res.writableEnded) abort();
    };
    req.once("aborted", abort);
    res.once("close", close);
    try {
      const result = await voiceAssetService.preview(
        req.user,
        req.params.assetId,
        req.body,
        controller.signal,
      );
      try {
        res.setHeader("Content-Type", "audio/wav");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Voice-Preview-Reserve-Usd", String(result.reserveUsd));
        res.send(Buffer.from(result.bytes));
      } finally {
        result.bytes.fill(0);
      }
    } finally {
      req.off("aborted", abort);
      res.off("close", close);
    }
  },
);

export default router;
