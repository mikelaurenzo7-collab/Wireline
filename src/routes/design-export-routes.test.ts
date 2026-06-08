import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mountRouteTestRequestContext,
  mountTestErrorHandler,
} from "../../tests/helpers/express-test-app";

const mocks = vi.hoisted(() => ({
  listDesignIntegrationStatus: vi.fn(),
  disconnectDesignIntegration: vi.fn(),
  listGithubRepos: vi.fn(),
  importBrandFromFigmaFile: vi.fn(),
  importBrandFromWebsite: vi.fn(),
  packageFigmaExportForUser: vi.fn(),
  packageReactExportForUser: vi.fn(),
  loadPreviewExportArtifacts: vi.fn(),
  importAssetToCanva: vi.fn(),
  createDesignGithubPr: vi.fn(),
}));

vi.mock("../lib/design-integrations", () => ({
  listDesignIntegrationStatus: mocks.listDesignIntegrationStatus,
  disconnectDesignIntegration: mocks.disconnectDesignIntegration,
}));

vi.mock("../lib/design-github-pr", () => ({
  listGithubRepos: mocks.listGithubRepos,
  createDesignGithubPr: mocks.createDesignGithubPr,
}));

vi.mock("../lib/design-brand-import", () => ({
  importBrandFromFigmaFile: mocks.importBrandFromFigmaFile,
  importBrandFromWebsite: mocks.importBrandFromWebsite,
}));

vi.mock("../lib/design-export-service", () => ({
  packageFigmaExportForUser: mocks.packageFigmaExportForUser,
  packageReactExportForUser: mocks.packageReactExportForUser,
  loadPreviewExportArtifacts: mocks.loadPreviewExportArtifacts,
  htmlToReactTailwindComponent: vi.fn(() => "export function GeneratedDesign() { return null; }"),
  buildDesignNotesMarkdown: vi.fn(() => "# notes"),
}));

vi.mock("../lib/canva-connect-service", () => ({
  importAssetToCanva: mocks.importAssetToCanva,
}));

vi.mock("../middleware/auth", () => ({
  authenticateUser: vi.fn((req: express.Request, _res, next) => {
    (req as express.Request & { user?: { id: string } }).user = { id: "user-1" };
    next();
  }),
}));

vi.mock("../middleware/api-rate-limits", () => ({
  claudeRateLimiter: vi.fn((_req, _res, next) => next()),
  createRateLimiter: vi.fn(
    () => (_req: express.Request, _res: express.Response, next: () => void) => next(),
  ),
}));

import designExportRouter from "./design-export-routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  mountRouteTestRequestContext(app);
  app.use(designExportRouter);
  mountTestErrorHandler(app);
  return app;
}

const previewBody = {
  title: "Landing page",
  htmlArtifactId: "123",
};

describe("design-export-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listDesignIntegrationStatus.mockResolvedValue([
      { provider: "figma", connected: false },
      { provider: "canva", connected: false },
      { provider: "github", connected: false },
    ]);
    mocks.packageFigmaExportForUser.mockResolvedValue({
      zip: Buffer.from("zip"),
      fileName: "wireline-figma-landing-page.zip",
    });
    mocks.packageReactExportForUser.mockResolvedValue({
      zip: Buffer.from("zip"),
      fileName: "wireline-react-landing-page.zip",
    });
    mocks.loadPreviewExportArtifacts.mockResolvedValue({
      html: Buffer.from("<html></html>"),
      image: Buffer.from("png"),
      htmlArtifactId: "123",
      imageArtifactId: "456",
    });
    mocks.importAssetToCanva.mockResolvedValue({ editUrl: "https://canva.example/edit" });
    mocks.createDesignGithubPr.mockResolvedValue({
      prUrl: "https://github.com/acme/repo/pull/1",
      branch: "wireline-design/landing-page",
      prNumber: 1,
    });
  });

  it("GET /api/design/integrations returns integration status", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/design/integrations");
    expect(res.status).toBe(200);
    expect(res.body.integrations).toHaveLength(3);
    expect(mocks.listDesignIntegrationStatus).toHaveBeenCalledWith("user-1");
  });

  it("rejects export without artifact ids", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/design/export/figma").send({ title: "No artifacts" });
    expect(res.status).toBe(400);
    expect(mocks.packageFigmaExportForUser).not.toHaveBeenCalled();
  });

  it("POST /api/design/export/figma returns zip attachment", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/design/export/figma").send(previewBody);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(mocks.packageFigmaExportForUser).toHaveBeenCalled();
  });

  it("POST /api/design/export/canva returns edit URL", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/design/export/canva")
      .send({ ...previewBody, imageArtifactId: "456" });
    expect(res.status).toBe(200);
    expect(res.body.editUrl).toBe("https://canva.example/edit");
    expect(mocks.importAssetToCanva).toHaveBeenCalled();
  });

  it("POST /api/design/import/website imports brand tokens", async () => {
    mocks.importBrandFromWebsite.mockResolvedValue({
      profileUpdated: true,
      extract: { colors: ["#fff"], fontFamilies: [], title: "Acme" },
    });
    const app = buildApp();
    const res = await request(app)
      .post("/api/design/import/website")
      .send({ url: "https://acme.example" });
    expect(res.status).toBe(200);
    expect(mocks.importBrandFromWebsite).toHaveBeenCalledWith("user-1", "https://acme.example");
  });
});
