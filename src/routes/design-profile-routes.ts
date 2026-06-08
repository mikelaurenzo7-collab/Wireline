/**
 * Design system profile routes — tenant blurb, notes, and asset library for Wireline Design.
 */
import express, { type Response } from "express";
import { AppError } from "../lib/api-error";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser } from "../middleware/auth";
import { claudeRateLimiter } from "../middleware/api-rate-limits";
import {
  validateBody,
  designProfilePatchSchema,
  designProfileAssetUploadSchema,
} from "../lib/api-validation";
import { log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import {
  addDesignProfileAsset,
  decodeDesignProfileUploadBase64,
  loadDesignProfile,
  removeDesignProfileAsset,
  updateDesignProfile,
} from "../lib/design-profile";

const router = express.Router();

router.get(
  "/api/design/profile",
  authenticateUser,
  claudeRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const profile = await loadDesignProfile(req.user.id);
      res.json({ profile });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("design profile read failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load design profile");
    }
  },
);

router.patch(
  "/api/design/profile",
  authenticateUser,
  claudeRateLimiter,
  validateBody(designProfilePatchSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const profile = await updateDesignProfile(req.user.id, {
        companyBlurb: req.body.companyBlurb,
        styleNotes: req.body.styleNotes,
      });
      res.json({ profile });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("design profile update failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to update design profile");
    }
  },
);

router.post(
  "/api/design/profile/assets",
  authenticateUser,
  claudeRateLimiter,
  validateBody(designProfileAssetUploadSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = decodeDesignProfileUploadBase64(req.body.fileBase64);
      const profile = await addDesignProfileAsset(req.user.id, {
        fileName: req.body.fileName,
        mimeType: req.body.mimeType ?? "application/octet-stream",
        data,
        role: req.body.role,
      });
      res.json({ profile });
    } catch (e) {
      if (e instanceof AppError) throw e;
      const message = getErrorMessage(e);
      if (message.includes("not supported") || message.includes("not allowed") || message.includes("exceeds")) {
        throw AppError.fromHttpStatus(400, message);
      }
      if (message.includes("Malformed")) {
        throw AppError.fromHttpStatus(400, message);
      }
      log.error("design profile asset upload failed", { error: message });
      throw AppError.fromHttpStatus(500, "Failed to upload design asset");
    }
  },
);

router.delete(
  "/api/design/profile/assets/:id",
  authenticateUser,
  claudeRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const assetId = String(req.params.id ?? "").trim();
      if (!assetId) throw AppError.fromHttpStatus(400, "Asset id required");
      const profile = await removeDesignProfileAsset(req.user.id, assetId);
      res.json({ profile });
    } catch (e) {
      if (e instanceof AppError) throw e;
      const message = getErrorMessage(e);
      if (message.includes("not found")) {
        throw AppError.fromHttpStatus(404, message);
      }
      log.error("design profile asset delete failed", { error: message });
      throw AppError.fromHttpStatus(500, "Failed to delete design asset");
    }
  },
);

export default router;
