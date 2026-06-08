import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mountRouteTestRequestContext,
  mountTestErrorHandler,
} from "../../tests/helpers/express-test-app";

const h = vi.hoisted(() => {
  const state = {
    profile: null as null | {
      userId: string;
      companyBlurb: string;
      styleNotes: string;
      assetManifest: unknown[];
    },
    uploads: [] as Array<{ fileName: string; size: number }>,
    deletedAssetIds: [] as string[],
  };

  return { state };
});

vi.mock("../lib/design-profile", () => ({
  loadDesignProfile: vi.fn(async () => ({
    companyBlurb: h.state.profile?.companyBlurb ?? "",
    styleNotes: h.state.profile?.styleNotes ?? "",
    assets: [],
    updatedAt: null,
    configured: Boolean(h.state.profile?.companyBlurb?.trim()),
  })),
  updateDesignProfile: vi.fn(async (_userId: string, patch: { companyBlurb?: string; styleNotes?: string }) => {
    h.state.profile = {
      userId: "user-1",
      companyBlurb: patch.companyBlurb ?? h.state.profile?.companyBlurb ?? "",
      styleNotes: patch.styleNotes ?? h.state.profile?.styleNotes ?? "",
      assetManifest: h.state.profile?.assetManifest ?? [],
    };
    return {
      companyBlurb: h.state.profile.companyBlurb,
      styleNotes: h.state.profile.styleNotes,
      assets: [],
      updatedAt: new Date().toISOString(),
      configured: Boolean(h.state.profile.companyBlurb.trim()),
    };
  }),
  addDesignProfileAsset: vi.fn(async (_userId: string, input: { fileName: string; data: Buffer }) => {
    h.state.uploads.push({ fileName: input.fileName, size: input.data.byteLength });
    return {
      companyBlurb: "",
      styleNotes: "",
      assets: [{ id: "asset-1", name: input.fileName, mimeType: "image/png", role: "reference", sizeBytes: input.data.byteLength }],
      updatedAt: new Date().toISOString(),
      configured: true,
    };
  }),
  removeDesignProfileAsset: vi.fn(async (_userId: string, assetId: string) => {
    h.state.deletedAssetIds.push(assetId);
    return {
      companyBlurb: "",
      styleNotes: "",
      assets: [],
      updatedAt: new Date().toISOString(),
      configured: false,
    };
  }),
  decodeDesignProfileUploadBase64: vi.fn((base64: string) => Buffer.from(base64, "base64")),
}));

vi.mock("../middleware/auth", () => ({
  authenticateUser: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: "user-1", email: "test@example.com" };
    next();
  }),
}));

vi.mock("../middleware/api-rate-limits", () => ({
  claudeRateLimiter: vi.fn((_req: any, _res: any, next: any) => next()),
}));

import designProfileRouter from "./design-profile-routes";
import {
  addDesignProfileAsset,
  loadDesignProfile,
  removeDesignProfileAsset,
  updateDesignProfile,
} from "../lib/design-profile";

function buildApp() {
  const app = express();
  app.use(express.json());
  mountRouteTestRequestContext(app);
  app.use(designProfileRouter);
  mountTestErrorHandler(app);
  return app;
}

describe("design-profile-routes", () => {
  beforeEach(() => {
    h.state.profile = null;
    h.state.uploads = [];
    h.state.deletedAssetIds = [];
    vi.clearAllMocks();
  });

  it("GET /api/design/profile returns profile for authenticated user", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/design/profile");
    expect(res.status).toBe(200);
    expect(res.body.profile).toBeDefined();
    expect(loadDesignProfile).toHaveBeenCalledWith("user-1");
  });

  it("PATCH /api/design/profile updates blurb and notes", async () => {
    const app = buildApp();
    const res = await request(app)
      .patch("/api/design/profile")
      .send({ companyBlurb: "Acme Cleaning", styleNotes: "Warm terracotta" });
    expect(res.status).toBe(200);
    expect(updateDesignProfile).toHaveBeenCalledWith("user-1", {
      companyBlurb: "Acme Cleaning",
      styleNotes: "Warm terracotta",
    });
    expect(res.body.profile.companyBlurb).toBe("Acme Cleaning");
  });

  it("POST /api/design/profile/assets accepts base64 upload", async () => {
    const app = buildApp();
    const png = Buffer.from("fakepng").toString("base64");
    const res = await request(app).post("/api/design/profile/assets").send({
      fileBase64: png,
      fileName: "logo.png",
      mimeType: "image/png",
      role: "logo",
    });
    expect(res.status).toBe(200);
    expect(addDesignProfileAsset).toHaveBeenCalled();
    expect(h.state.uploads[0]?.fileName).toBe("logo.png");
  });

  it("DELETE /api/design/profile/assets/:id removes asset", async () => {
    const app = buildApp();
    const res = await request(app).delete("/api/design/profile/assets/asset-42");
    expect(res.status).toBe(200);
    expect(removeDesignProfileAsset).toHaveBeenCalledWith("user-1", "asset-42");
    expect(h.state.deletedAssetIds).toContain("asset-42");
  });
});
