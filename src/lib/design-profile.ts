/**
 * Tenant design system profile — blurb, notes, and asset manifest for Wireline Design.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  buildSignedPreviewUrl,
  loadDirectorArtifactData,
  storeDirectorArtifact,
} from "./director-artifacts";
import { isPostgresMissingRelation } from "./director-store";
import { log } from "./server-context";
import { drizzle } from "./server-context";
import { getErrorMessage } from "./server-utils";
import * as schema from "../db/schema";

export type DesignProfileAssetRole = "logo" | "font" | "css" | "reference";

export interface DesignProfileAsset {
  id: string;
  name: string;
  mimeType: string;
  role: DesignProfileAssetRole;
  sizeBytes: number;
  previewUrl?: string;
  downloadUrl?: string;
}

export interface DesignProfileTokenManifest {
  sourceUrl?: string;
  figmaFileKey?: string;
  colors?: string[];
  fontFamilies?: string[];
  typography?: string[];
  components?: string[];
  themeColor?: string;
  fileName?: string;
  importedAt?: string;
}

export interface DesignProfileRecord {
  companyBlurb: string;
  styleNotes: string;
  assets: DesignProfileAsset[];
  tokenManifest: DesignProfileTokenManifest;
  updatedAt: string | null;
  configured: boolean;
}

function parseTokenManifest(raw: unknown): DesignProfileTokenManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const row = raw as Record<string, unknown>;
  const colors = Array.isArray(row.colors)
    ? row.colors
        .map((c) => String(c).trim())
        .filter(Boolean)
        .slice(0, 32)
    : undefined;
  const fontFamilies = Array.isArray(row.fontFamilies)
    ? row.fontFamilies
        .map((f) => String(f).trim())
        .filter(Boolean)
        .slice(0, 16)
    : undefined;
  const typography = Array.isArray(row.typography)
    ? row.typography
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 16)
    : undefined;
  const components = Array.isArray(row.components)
    ? row.components
        .map((c) => String(c).trim())
        .filter(Boolean)
        .slice(0, 24)
    : undefined;

  return {
    sourceUrl: row.sourceUrl ? String(row.sourceUrl) : undefined,
    figmaFileKey: row.figmaFileKey ? String(row.figmaFileKey) : undefined,
    colors: colors && colors.length > 0 ? colors : undefined,
    fontFamilies: fontFamilies && fontFamilies.length > 0 ? fontFamilies : undefined,
    typography: typography && typography.length > 0 ? typography : undefined,
    components: components && components.length > 0 ? components : undefined,
    themeColor: row.themeColor ? String(row.themeColor) : undefined,
    fileName: row.fileName ? String(row.fileName) : undefined,
    importedAt: row.importedAt ? String(row.importedAt) : undefined,
  };
}

interface DesignProfileManifestEntry {
  id: string;
  artifactId: string;
  name: string;
  mimeType: string;
  role: DesignProfileAssetRole;
  sizeBytes: number;
}

export const DESIGN_PROFILE_CSS_INJECT_CAP = 10_000;
export const DESIGN_PROFILE_MAX_ASSETS = 24;
export const DESIGN_PROFILE_MAX_FILE_BYTES = 2 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "font/woff2",
  "application/font-woff2",
  "application/octet-stream",
  "text/css",
  "text/plain",
]);

const BLOCKED_EXTENSIONS = new Set([".fig", ".pdf", ".exe", ".zip", ".html", ".js"]);

function parseManifest(raw: unknown): DesignProfileManifestEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = String(row.id ?? row.artifactId ?? "").trim();
      const artifactId = String(row.artifactId ?? row.id ?? "").trim();
      const name = String(row.name ?? "").trim();
      const mimeType = String(row.mimeType ?? "").trim();
      const role = row.role as DesignProfileAssetRole;
      const sizeBytes = Number(row.sizeBytes ?? 0);
      if (!id || !artifactId || !name || !mimeType) return null;
      if (!["logo", "font", "css", "reference"].includes(role)) return null;
      return { id, artifactId, name, mimeType, role, sizeBytes };
    })
    .filter((entry): entry is DesignProfileManifestEntry => entry !== null);
}

function manifestToAssets(
  userId: string,
  manifest: DesignProfileManifestEntry[],
): DesignProfileAsset[] {
  return manifest.map((entry) => ({
    id: entry.id,
    name: entry.name,
    mimeType: entry.mimeType,
    role: entry.role,
    sizeBytes: entry.sizeBytes,
    previewUrl: buildSignedPreviewUrl("/api/director/artifacts", entry.artifactId, userId),
    downloadUrl: buildSignedPreviewUrl("/api/director/artifacts", entry.artifactId, userId),
  }));
}

export function isDesignProfileConfigured(input: {
  companyBlurb?: string;
  styleNotes?: string;
  assets?: unknown[];
  tokenManifest?: DesignProfileTokenManifest;
}): boolean {
  const tokens = input.tokenManifest;
  const hasTokens = Boolean(
    tokens &&
    ((tokens.colors?.length ?? 0) > 0 ||
      (tokens.fontFamilies?.length ?? 0) > 0 ||
      (tokens.typography?.length ?? 0) > 0 ||
      tokens.themeColor),
  );
  return (
    Boolean(input.companyBlurb?.trim()) ||
    Boolean(input.styleNotes?.trim()) ||
    (Array.isArray(input.assets) && input.assets.length > 0) ||
    hasTokens
  );
}

export const EMPTY_DESIGN_PROFILE: DesignProfileRecord = {
  companyBlurb: "",
  styleNotes: "",
  assets: [],
  tokenManifest: {},
  updatedAt: null,
  configured: false,
};

export async function loadDesignProfile(userId: string): Promise<DesignProfileRecord> {
  try {
    const [row] = await drizzle
      .select()
      .from(schema.designProfiles)
      .where(eq(schema.designProfiles.userId, userId))
      .limit(1);

    const manifest = parseManifest(row?.assetManifest);
    const tokenManifest = parseTokenManifest(row?.tokenManifest);
    const companyBlurb = row?.companyBlurb?.trim() ?? "";
    const styleNotes = row?.styleNotes?.trim() ?? "";

    return {
      companyBlurb,
      styleNotes,
      assets: manifestToAssets(userId, manifest),
      tokenManifest,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      configured: isDesignProfileConfigured({
        companyBlurb,
        styleNotes,
        assets: manifest,
        tokenManifest,
      }),
    };
  } catch (e) {
    if (isPostgresMissingRelation(e)) {
      log.warn("design profile table missing, returning empty profile", { userId });
      return EMPTY_DESIGN_PROFILE;
    }
    log.warn("design profile load failed", { userId, error: getErrorMessage(e) });
    throw e;
  }
}

async function upsertProfileRow(
  userId: string,
  patch: {
    companyBlurb?: string;
    styleNotes?: string;
    assetManifest?: DesignProfileManifestEntry[];
  },
): Promise<void> {
  const [existing] = await drizzle
    .select({ userId: schema.designProfiles.userId })
    .from(schema.designProfiles)
    .where(eq(schema.designProfiles.userId, userId))
    .limit(1);

  if (existing) {
    const values: Partial<typeof schema.designProfiles.$inferInsert> = {};
    if (patch.companyBlurb !== undefined) values.companyBlurb = patch.companyBlurb;
    if (patch.styleNotes !== undefined) values.styleNotes = patch.styleNotes;
    if (patch.assetManifest !== undefined) values.assetManifest = patch.assetManifest;
    await drizzle
      .update(schema.designProfiles)
      .set(values)
      .where(eq(schema.designProfiles.userId, userId));
    return;
  }

  await drizzle.insert(schema.designProfiles).values({
    userId,
    companyBlurb: patch.companyBlurb ?? "",
    styleNotes: patch.styleNotes ?? "",
    assetManifest: patch.assetManifest ?? [],
  });
}

export async function updateDesignProfile(
  userId: string,
  patch: { companyBlurb?: string; styleNotes?: string },
): Promise<DesignProfileRecord> {
  const existing = await loadDesignProfile(userId);
  await upsertProfileRow(userId, {
    companyBlurb:
      patch.companyBlurb !== undefined ? patch.companyBlurb.trim() : existing.companyBlurb,
    styleNotes: patch.styleNotes !== undefined ? patch.styleNotes.trim() : existing.styleNotes,
  });
  return loadDesignProfile(userId);
}

function inferRoleFromMime(
  mimeType: string,
  fileName: string,
  requested?: DesignProfileAssetRole,
): DesignProfileAssetRole {
  if (requested) return requested;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".css") || mimeType === "text/css") return "css";
  if (lower.endsWith(".woff2") || lower.endsWith(".woff") || mimeType.includes("font")) {
    return "font";
  }
  if (mimeType.startsWith("image/")) return "reference";
  return "reference";
}

export function validateDesignProfileUpload(input: {
  fileName: string;
  mimeType: string;
  data: Buffer;
}): { mimeType: string; role?: never } | { error: string } {
  const name = input.fileName.trim().slice(0, 255);
  if (!name) return { error: "fileName is required" };

  const ext = name.includes(".") ? `.${name.split(".").pop()?.toLowerCase()}` : "";
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { error: `File type ${ext} is not supported for design profile uploads.` };
  }

  if (input.data.byteLength > DESIGN_PROFILE_MAX_FILE_BYTES) {
    return { error: `File exceeds ${DESIGN_PROFILE_MAX_FILE_BYTES / (1024 * 1024)} MB limit.` };
  }

  let mimeType = input.mimeType.trim().toLowerCase();
  if (ext === ".css") mimeType = "text/css";
  if (ext === ".woff2") mimeType = "font/woff2";
  if (ext === ".svg") mimeType = "image/svg+xml";
  if (ext === ".png") mimeType = "image/png";
  if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
  if (ext === ".webp") mimeType = "image/webp";

  if (!ALLOWED_MIME_TYPES.has(mimeType) && !mimeType.startsWith("image/")) {
    return { error: `MIME type ${mimeType || "unknown"} is not allowed.` };
  }

  return { mimeType };
}

export async function addDesignProfileAsset(
  userId: string,
  input: {
    fileName: string;
    mimeType: string;
    data: Buffer;
    role?: DesignProfileAssetRole;
  },
): Promise<DesignProfileRecord> {
  const validation = validateDesignProfileUpload({
    fileName: input.fileName,
    mimeType: input.mimeType,
    data: input.data,
  });
  if ("error" in validation) {
    throw new Error(validation.error);
  }

  const profile = await loadDesignProfile(userId);
  if (profile.assets.length >= DESIGN_PROFILE_MAX_ASSETS) {
    throw new Error(`Design profile supports at most ${DESIGN_PROFILE_MAX_ASSETS} assets.`);
  }

  const role = inferRoleFromMime(validation.mimeType, input.fileName, input.role);
  const saved = await storeDirectorArtifact({
    userId,
    toolName: "design-profile",
    artifactType: "design_asset",
    name: input.fileName.trim().slice(0, 255),
    mimeType: validation.mimeType,
    data: input.data,
    metadata: { role },
  });

  const [row] = await drizzle
    .select({ assetManifest: schema.designProfiles.assetManifest })
    .from(schema.designProfiles)
    .where(eq(schema.designProfiles.userId, userId))
    .limit(1);

  const manifest = parseManifest(row?.assetManifest);
  const entry: DesignProfileManifestEntry = {
    id: saved.id,
    artifactId: saved.id,
    name: saved.name,
    mimeType: saved.mimeType,
    role,
    sizeBytes: saved.sizeBytes,
  };

  await upsertProfileRow(userId, { assetManifest: [...manifest, entry] });
  return loadDesignProfile(userId);
}

async function loadManifest(userId: string): Promise<DesignProfileManifestEntry[]> {
  const [row] = await drizzle
    .select({ assetManifest: schema.designProfiles.assetManifest })
    .from(schema.designProfiles)
    .where(eq(schema.designProfiles.userId, userId))
    .limit(1);
  return parseManifest(row?.assetManifest);
}

export async function removeDesignProfileAsset(
  userId: string,
  assetId: string,
): Promise<DesignProfileRecord> {
  const manifest = await loadManifest(userId);
  const target = manifest.find((entry) => entry.id === assetId);
  if (!target) {
    throw new Error("Asset not found");
  }

  const artifactRows = await drizzle
    .select({ objectKey: schema.directorArtifacts.objectKey })
    .from(schema.directorArtifacts)
    .where(
      and(
        eq(schema.directorArtifacts.id, BigInt(target.artifactId)),
        eq(schema.directorArtifacts.userId, userId),
      ),
    )
    .limit(1);

  const objectKey = artifactRows[0]?.objectKey;
  if (objectKey) {
    await drizzle
      .delete(schema.directorArtifacts)
      .where(
        and(
          eq(schema.directorArtifacts.id, BigInt(target.artifactId)),
          eq(schema.directorArtifacts.userId, userId),
        ),
      );
    await drizzle
      .delete(schema.directorArtifactObjects)
      .where(eq(schema.directorArtifactObjects.objectKey, objectKey));
  }

  await upsertProfileRow(userId, {
    assetManifest: manifest.filter((entry) => entry.id !== assetId),
  });
  return loadDesignProfile(userId);
}

export interface DesignProfileBriefExtras {
  profileSectionMarkdown: string;
  assetContext: string;
}

export async function buildDesignProfileBriefExtras(
  userId: string,
): Promise<DesignProfileBriefExtras | null> {
  const profile = await loadDesignProfile(userId);
  if (!profile.configured) return null;

  const assetLines: string[] = [];
  const cssChunks: string[] = [];
  let cssBudget = DESIGN_PROFILE_CSS_INJECT_CAP;

  for (const asset of profile.assets) {
    if (asset.role === "css") {
      const loaded = await loadDirectorArtifactData({ artifactId: asset.id, userId });
      if (loaded) {
        const text = loaded.data.toString("utf8").trim();
        const slice = text.slice(0, cssBudget);
        cssBudget -= slice.length;
        if (slice) {
          cssChunks.push(`### ${asset.name}\n\`\`\`css\n${slice}\n\`\`\``);
          assetLines.push(`- CSS (${asset.name}): excerpt inlined below`);
        }
      }
      continue;
    }

    const url = asset.previewUrl ?? asset.downloadUrl;
    if (!url) continue;
    assetLines.push(`- ${asset.role} (${asset.name}): ${url}`);
  }

  const token = profile.tokenManifest;
  const tokenLines = [
    token.themeColor ? `- Theme color: ${token.themeColor}` : "",
    token.colors?.length ? `- Imported colors: ${token.colors.join(", ")}` : "",
    token.fontFamilies?.length ? `- Imported fonts: ${token.fontFamilies.join(", ")}` : "",
    token.typography?.length ? `- Figma typography: ${token.typography.join(", ")}` : "",
    token.components?.length
      ? `- Figma components: ${token.components.slice(0, 12).join(", ")}`
      : "",
    token.figmaFileKey ? `- Figma file key: ${token.figmaFileKey}` : "",
    token.sourceUrl ? `- Brand source: ${token.sourceUrl}` : "",
  ].filter(Boolean);

  const lines = [
    "## Design system profile (operator-provided)",
    profile.companyBlurb ? `- Company: ${profile.companyBlurb}` : "",
    profile.styleNotes ? `- Style notes: ${profile.styleNotes}` : "",
    tokenLines.length > 0 ? "- Imported brand tokens:" : "",
    ...tokenLines.map((line) => `  ${line}`),
    assetLines.length > 0 ? "- Assets:" : "",
    ...assetLines.map((line) => (line.startsWith("- ") ? `  ${line}` : line)),
    cssChunks.length > 0 ? "" : "",
    ...cssChunks,
  ].filter((line) => line !== "");

  const profileSectionMarkdown = lines.join("\n");
  const assetContext = [
    profile.companyBlurb ? `Company blurb: ${profile.companyBlurb}` : "",
    profile.styleNotes ? `Style notes: ${profile.styleNotes}` : "",
    tokenLines.join("\n"),
    assetLines.join("\n"),
    cssChunks.join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  return { profileSectionMarkdown, assetContext };
}

/** Decode base64 upload payload from API body. */
export function decodeDesignProfileUploadBase64(fileBase64: string): Buffer {
  try {
    return Buffer.from(fileBase64, "base64");
  } catch {
    throw new Error("Malformed base64 payload.");
  }
}

export function newDesignProfileAssetId(): string {
  return randomUUID();
}
