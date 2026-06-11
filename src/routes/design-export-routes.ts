/**
 * Wireline Design export, import, and integration status routes.
 */
import express, { type Response } from "express";
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
import type { DirectorPreviewMeta } from "../lib/director-message-metadata";

const router = express.Router();

const designExportLimiter = createRateLimiter({
  bucket: "api:design-export",
  windowMs: 60_000,
  max: 20,
});

const PROVIDERS = new Set<DesignIntegrationProvider>(["figma", "canva", "github"]);

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
}): DirectorPreviewMeta & { promptSummary?: string } {
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
  validateBody(designGithubPrSchema),
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
