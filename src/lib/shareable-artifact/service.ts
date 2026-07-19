/**
 * Publish, resolve, and revoke shareable recap artifacts.
 *
 * Every publish returns a signed `RecapArtifactHandle` (slug + URL + raw
 * token). The raw token is returned exactly once and never persisted;
 * subsequent access is verified against the stored hash so a database
 * dump cannot forge access to any artifact. Resolvers always return the
 * same shape for unknown-slug, expired, and revoked cases so the public
 * route cannot distinguish them.
 */
import { and, eq, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import { drizzle, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { hashToken, isValidSlug, mintSlug, mintToken, verifyToken } from "./tokens";
import type { CallRecapContent, RecapContent, RecapKind, WeeklyRecapContent } from "./types";
import { isSupportedRecapContent } from "./types";

export interface RecapArtifactHandle {
  id: string;
  slug: string;
  token: string;
  url: string;
  expiresAt: Date;
}

interface PublishOptions {
  userId: string;
  agentId?: string | null;
  sourceRef?: string | null;
  ttlDays?: number;
}

export interface ResolvedRecapArtifact {
  id: string;
  userId: string;
  agentId: string | null;
  kind: RecapKind;
  slug: string;
  content: RecapContent;
  publishedAt: Date;
  expiresAt: Date;
  viewCount: number;
}

const DEFAULT_TTL_DAYS = 90;
const MAX_TTL_DAYS = 365;
const SUPPORTED_KINDS: readonly RecapKind[] = ["call_recap", "weekly_recap"];

function ttlDays(input: number | undefined): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) return DEFAULT_TTL_DAYS;
  return Math.min(Math.floor(input), MAX_TTL_DAYS);
}

function appBase(): string {
  return (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
}

function shareableUrl(kind: RecapKind, slug: string, token: string): string {
  const path = kind === "call_recap" || kind === "weekly_recap" ? "recap" : "proposal";
  const params = new URLSearchParams({ t: token });
  return `${appBase()}/${path}/${slug}?${params.toString()}`;
}

async function publish(
  content: RecapContent,
  options: PublishOptions,
): Promise<RecapArtifactHandle> {
  if (!options.userId) throw new Error("userId required");
  if (!SUPPORTED_KINDS.includes(content.kind)) {
    throw new Error(`Unsupported recap kind: ${content.kind}`);
  }
  const slug = mintSlug();
  const token = mintToken();
  const tokenHash = hashToken(slug, token);
  const expiresAt = new Date(Date.now() + ttlDays(options.ttlDays) * 24 * 60 * 60 * 1000);

  const [row] = await drizzle
    .insert(schema.recapArtifacts)
    .values({
      userId: options.userId,
      agentId: options.agentId ?? null,
      kind: content.kind,
      sourceRef: options.sourceRef ?? null,
      slug,
      tokenHash,
      content,
      expiresAt,
    })
    .returning({ id: schema.recapArtifacts.id });

  if (!row?.id) throw new Error("Failed to persist shareable artifact");

  return {
    id: String(row.id),
    slug,
    token,
    url: shareableUrl(content.kind, slug, token),
    expiresAt,
  };
}

export function publishCallRecap(args: {
  userId: string;
  agentId?: string | null;
  callLogId: string | number | bigint;
  content: CallRecapContent;
  ttlDays?: number;
}): Promise<RecapArtifactHandle> {
  return publish(args.content, {
    userId: args.userId,
    agentId: args.agentId ?? null,
    sourceRef: `call:${String(args.callLogId)}`,
    ttlDays: args.ttlDays,
  });
}

export function publishWeeklyRecap(args: {
  userId: string;
  weekLabel: string;
  content: WeeklyRecapContent;
  ttlDays?: number;
}): Promise<RecapArtifactHandle> {
  return publish(args.content, {
    userId: args.userId,
    sourceRef: `weekly:${args.weekLabel}`,
    ttlDays: args.ttlDays,
  });
}

/**
 * Resolve an artifact by slug+token for public rendering. Returns null
 * for every non-success path so the caller can respond with an identical
 * 404 to unknown-slug, bad-token, expired, and revoked artifacts.
 */
export async function resolveArtifact(
  slug: string,
  token: string,
): Promise<ResolvedRecapArtifact | null> {
  if (!isValidSlug(slug) || typeof token !== "string" || !token) return null;

  const [row] = await drizzle
    .select({
      id: schema.recapArtifacts.id,
      userId: schema.recapArtifacts.userId,
      agentId: schema.recapArtifacts.agentId,
      kind: schema.recapArtifacts.kind,
      slug: schema.recapArtifacts.slug,
      tokenHash: schema.recapArtifacts.tokenHash,
      content: schema.recapArtifacts.content,
      publishedAt: schema.recapArtifacts.publishedAt,
      expiresAt: schema.recapArtifacts.expiresAt,
      viewCount: schema.recapArtifacts.viewCount,
      revokedAt: schema.recapArtifacts.revokedAt,
    })
    .from(schema.recapArtifacts)
    .where(eq(schema.recapArtifacts.slug, slug))
    .limit(1);

  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  if (!verifyToken(slug, token, row.tokenHash)) return null;
  if (!isSupportedRecapContent(row.content)) return null;
  if (!SUPPORTED_KINDS.includes(row.content.kind)) return null;

  return {
    id: String(row.id),
    userId: row.userId,
    agentId: row.agentId,
    kind: row.content.kind,
    slug: row.slug,
    content: row.content,
    publishedAt: row.publishedAt,
    expiresAt: row.expiresAt,
    viewCount: row.viewCount,
  };
}

/** Fire-and-forget view counter. Failures are logged and swallowed. */
export async function noteArtifactView(id: string): Promise<void> {
  try {
    await drizzle
      .update(schema.recapArtifacts)
      .set({
        viewCount: sql`${schema.recapArtifacts.viewCount} + 1`,
        lastViewedAt: new Date(),
      })
      .where(eq(schema.recapArtifacts.id, id));
  } catch (error) {
    log.warn("recap artifact view counter update failed", {
      id,
      error: getErrorMessage(error),
    });
  }
}

/** Owner-initiated soft revoke. Subsequent resolves return null. */
export async function revokeArtifact(args: {
  userId: string;
  artifactId: string;
}): Promise<boolean> {
  try {
    const result = await drizzle
      .update(schema.recapArtifacts)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.recapArtifacts.id, args.artifactId),
          eq(schema.recapArtifacts.userId, args.userId),
        ),
      )
      .returning({ id: schema.recapArtifacts.id });
    return result.length === 1;
  } catch (error) {
    log.error("recap artifact revoke failed", {
      artifactId: args.artifactId,
      error: getErrorMessage(error),
    });
    return false;
  }
}
