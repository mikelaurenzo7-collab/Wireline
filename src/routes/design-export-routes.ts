/**
 * Wireline Design export, import, and integration status routes.
 */
import express, { type Response } from "express";
import { z } from "zod";
import { AppError } from "../lib/api-error";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser } from "../middleware/auth";
import { claudeRateLimiter, createRateLimiter } from "../middleware/api-rate-limits";
import {
  validateBody,
  designExportPreviewSchema,
  designImportFigmaSchema,
  designImportWebsiteSchema,
  designGithubPrSchema,
  designShopifyStorefrontExportSchema,
} from "../lib/api-validation";
import { log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import {
  disconnectDesignIntegration,
  listDesignIntegrationStatus,
  type DesignIntegrationProvider,
} from "../lib/design-integrations";
import {
  packageFigmaExportForUser,
  packageReactExportForUser,
  packageShopifyStorefrontExportForUser,
  buildDesignNotesMarkdown,
  loadPreviewExportArtifacts,
  htmlToReactTailwindComponent,
} from "../lib/design-export-service";
import { importBrandFromFigmaFile, importBrandFromWebsite } from "../lib/design-brand-import";
import { importAssetToCanva } from "../lib/canva-connect-service";
import { createDesignGithubPr, listGithubRepos } from "../lib/design-github-pr";
import {
  addShopifyStorefrontCartLines,
  createShopifyStorefrontCart,
  loadShopifyStorefrontCatalog,
  loadShopifyStorefrontStatus,
} from "../lib/shopify-storefront-service";
import type { DirectorPreviewMeta } from "../lib/director-message-metadata";

const router = express.Router();

const designExportLimiter = createRateLimiter({
  bucket: "api:design-export",
  windowMs: 60_000,
  max: 20,
});

const PROVIDERS = new Set<DesignIntegrationProvider>(["figma", "canva", "github"]);

const designGithubPrWithContextSchema = designGithubPrSchema.extend({
  handoffContext: z.string().max(8000).optional(),
});

function boundedInt(raw: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function normalizeCartLines(raw: unknown): Array<{ merchandiseId: string; quantity: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((line) => {
      const value = line as { merchandiseId?: unknown; quantity?: unknown };
      return {
        merchandiseId: typeof value.merchandiseId === "string" ? value.merchandiseId.trim() : "",
        quantity: boundedInt(value.quantity, 1, 1, 99),
      };
    })
    .filter((line) => line.merchandiseId.length > 0)
    .slice(0, 20);
}

function isMissingShopifyConnection(message: string): boolean {
  return /connect shopify/i.test(message);
}

function isMissingStorefrontAccess(message: string): boolean {
  return /storefront api access is not configured/i.test(message);
}

router.get(
  "/api/design/integrations",
  authenticateUser,
  claudeRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const integrations = await listDesignIntegrationStatus(req.user.id);
    res.json({ integrations });
  },
);

router.delete(
  "/api/design/integrations/:provider",
  authenticateUser,
  claudeRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const provider = req.params.provider as DesignIntegrationProvider;
    if (!PROVIDERS.has(provider)) {
      throw AppError.fromHttpStatus(400, "Unknown integration provider");
    }
    await disconnectDesignIntegration(req.user.id, provider);
    res.json({ ok: true });
  },
);

router.get(
  "/api/design/github/repos",
  authenticateUser,
  designExportLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const repos = await listGithubRepos(req.user.id);
      res.json({ repos });
    } catch (e) {
      log.error("github repos list failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(400, getErrorMessage(e));
    }
  },
);

router.get(
  "/api/design/shopify/storefront/status",
  authenticateUser,
  designExportLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const status = await loadShopifyStorefrontStatus(req.user.id);
    res.json({
      ...status,
      requiresConnection: !status.connected,
      message: !status.connected
        ? "Connect Shopify to use live catalog and cart generation."
        : status.requiresStorefrontAccess
          ? "Shopify is connected. Add Storefront API access to unlock live catalog and cart generation."
          : status.ready
            ? "Shopify storefront catalog is ready."
            : "Shopify is connected, but the storefront catalog is not available yet.",
    });
  },
);

router.get(
  "/api/design/shopify/storefront/catalog",
  authenticateUser,
  designExportLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const catalog = await loadShopifyStorefrontCatalog({
        userId: req.user.id,
        productsFirst: boundedInt(req.query.productsFirst, 12, 1, 24),
        collectionsFirst: boundedInt(req.query.collectionsFirst, 6, 1, 12),
      });
      res.json({ connected: true, ready: true, ...catalog });
    } catch (e) {
      const message = getErrorMessage(e);
      if (isMissingShopifyConnection(message)) {
        res.json({
          connected: false,
          ready: false,
          products: [],
          collections: [],
          requiresConnection: true,
          message: "Connect Shopify to use live catalog generation.",
        });
        return;
      }
      if (isMissingStorefrontAccess(message)) {
        res.status(409).json({
          connected: true,
          ready: false,
          products: [],
          collections: [],
          requiresStorefrontAccess: true,
          message: "Add Storefront API access to use live catalog generation.",
        });
        return;
      }
      log.error("shopify storefront catalog failed", { error: message });
      throw AppError.fromHttpStatus(400, message);
    }
  },
);

router.post(
  "/api/design/shopify/storefront/cart",
  authenticateUser,
  designExportLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const lines = normalizeCartLines(req.body?.lines);
      if (lines.length === 0) throw new Error("At least one product variant is required.");
      const cart = await createShopifyStorefrontCart({ userId: req.user.id, lines });
      res.json({ connected: true, ready: true, cart });
    } catch (e) {
      const message = getErrorMessage(e);
      if (isMissingShopifyConnection(message)) {
        res.status(409).json({
          connected: false,
          ready: false,
          requiresConnection: true,
          error: "Connect Shopify to use live cart generation.",
        });
        return;
      }
      if (isMissingStorefrontAccess(message)) {
        res.status(409).json({
          connected: true,
          ready: false,
          requiresStorefrontAccess: true,
          error: "Add Storefront API access to use live cart generation.",
        });
        return;
      }
      log.error("shopify storefront cart create failed", { error: message });
      throw AppError.fromHttpStatus(400, message);
    }
  },
);

router.post(
  "/api/design/shopify/storefront/cart/lines",
  authenticateUser,
  designExportLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const cartId = typeof req.body?.cartId === "string" ? req.body.cartId.trim() : "";
      const lines = normalizeCartLines(req.body?.lines);
      if (!cartId) throw new Error("cartId is required.");
      if (lines.length === 0) throw new Error("At least one product variant is required.");
      const cart = await addShopifyStorefrontCartLines({ userId: req.user.id, cartId, lines });
      res.json({ connected: true, ready: true, cart });
    } catch (e) {
      const message = getErrorMessage(e);
      if (isMissingShopifyConnection(message)) {
        res.status(409).json({
          connected: false,
          ready: false,
          requiresConnection: true,
          error: "Connect Shopify to use live cart generation.",
        });
        return;
      }
      if (isMissingStorefrontAccess(message)) {
        res.status(409).json({
          connected: true,
          ready: false,
          requiresStorefrontAccess: true,
          error: "Add Storefront API access to use live cart generation.",
        });
        return;
      }
      log.error("shopify storefront cart update failed", { error: message });
      throw AppError.fromHttpStatus(400, message);
    }
  },
);

router.post(
  "/api/design/import/figma",
  authenticateUser,
  designExportLimiter,
  validateBody(designImportFigmaSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await importBrandFromFigmaFile(req.user.id, req.body.fileKeyOrUrl);
      res.json(result);
    } catch (e) {
      log.error("figma brand import failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(400, getErrorMessage(e));
    }
  },
);

router.post(
  "/api/design/import/website",
  authenticateUser,
  designExportLimiter,
  validateBody(designImportWebsiteSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await importBrandFromWebsite(req.user.id, req.body.url);
      res.json(result);
    } catch (e) {
      log.error("website brand import failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(400, getErrorMessage(e));
    }
  },
);

function previewFromBody(body: {
  title: string;
  deviceType?: DirectorPreviewMeta["deviceType"];
  htmlArtifactId?: string;
  imageArtifactId?: string;
  renderId?: string;
  conceptId?: string;
  promptSummary?: string;
  handoffContext?: string;
}): DirectorPreviewMeta & { promptSummary?: string; handoffContext?: string } {
  return {
    conceptId: body.conceptId || "export",
    title: body.title,
    rationale: "",
    previewDataUrl: "",
    deviceType: body.deviceType,
    htmlArtifactId: body.htmlArtifactId,
    imageArtifactId: body.imageArtifactId,
    renderId: body.renderId,
    kind: "stitch",
    promptSummary: body.promptSummary,
    handoffContext: body.handoffContext,
  };
}

router.post(
  "/api/design/export/figma",
  authenticateUser,
  designExportLimiter,
  validateBody(designExportPreviewSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const preview = previewFromBody(req.body);
      const { zip, fileName } = await packageFigmaExportForUser(req.user.id, preview);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(zip);
    } catch (e) {
      log.error("figma export failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(400, getErrorMessage(e));
    }
  },
);

router.post(
  "/api/design/export/react",
  authenticateUser,
  designExportLimiter,
  validateBody(designExportPreviewSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const preview = previewFromBody(req.body);
      const { zip, fileName } = await packageReactExportForUser(req.user.id, preview);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(zip);
    } catch (e) {
      log.error("react export failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(400, getErrorMessage(e));
    }
  },
);

router.post(
  "/api/design/export/shopify-storefront",
  authenticateUser,
  designExportLimiter,
  validateBody(designShopifyStorefrontExportSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const preview = previewFromBody(req.body);
      const { zip, fileName } = await packageShopifyStorefrontExportForUser(req.user.id, preview);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(zip);
    } catch (e) {
      log.error("shopify storefront export failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(400, getErrorMessage(e));
    }
  },
);

router.post(
  "/api/design/export/canva",
  authenticateUser,
  designExportLimiter,
  validateBody(designExportPreviewSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const preview = previewFromBody(req.body);
      const artifacts = await loadPreviewExportArtifacts(req.user.id, preview);
      const image = artifacts.image;
      if (!image) {
        throw new Error("PNG screenshot required for Canva marketing handoff.");
      }

      const result = await importAssetToCanva(req.user.id, {
        fileName: "wireline-design.png",
        mimeType: "image/png",
        data: image,
        title: preview.title,
      });

      res.json({
        message: "Marketing creative sent to Canva for editing.",
        ...result,
      });
    } catch (e) {
      log.error("canva export failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(400, getErrorMessage(e));
    }
  },
);

router.post(
  "/api/design/export/github-pr",
  authenticateUser,
  designExportLimiter,
  validateBody(designGithubPrWithContextSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const preview = previewFromBody(req.body);
      const artifacts = await loadPreviewExportArtifacts(req.user.id, preview);
      const [owner, repo] = req.body.repoFullName.split("/");
      if (!owner || !repo) throw new Error("Invalid repository name.");

      const htmlStr = artifacts.html?.toString("utf8") ?? "";
      const componentName =
        preview.title.replace(/[^a-zA-Z0-9]/g, "").replace(/^[0-9]/, "D") || "GeneratedDesign";
      const tsx = htmlToReactTailwindComponent(htmlStr, componentName.slice(0, 48));
      const notes = buildDesignNotesMarkdown({
        title: preview.title,
        deviceType: preview.deviceType,
        promptSummary: req.body.promptSummary,
        html: htmlStr,
      });

      const files: Array<{ path: string; content: Buffer }> = [
        { path: `src/components/${componentName}.tsx`, content: Buffer.from(tsx, "utf8") },
        { path: "design.md", content: Buffer.from(notes, "utf8") },
      ];
      if (artifacts.html) {
        files.push({ path: "prototype.html", content: artifacts.html });
      }
      if (artifacts.image) {
        files.push({ path: "screenshot.png", content: artifacts.image });
      }

      const pr = await createDesignGithubPr({
        userId: req.user.id,
        owner,
        repo,
        baseBranch: req.body.baseBranch,
        title: req.body.prTitle || `Wireline Design: ${preview.title}`,
        body: [
          "## Wireline Design handoff",
          "",
          preview.promptSummary ? `**Prompt:** ${preview.promptSummary}` : "",
          preview.handoffContext ? `\n## Client context\n\n${preview.handoffContext}` : "",
          "",
          "Includes React component, HTML prototype, design notes, and screenshot.",
        ]
          .filter(Boolean)
          .join("\n"),
        files,
      });

      res.json(pr);
    } catch (e) {
      log.error("github pr export failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(400, getErrorMessage(e));
    }
  },
);

export default router;
