/**
 * Tenant OAuth connections for Wireline Design export lanes.
 */
import { and, eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { decryptSecret, encryptSecret } from "./secret-vault";

export type DesignIntegrationProvider = "figma" | "canva" | "github";

export interface DesignIntegrationStatus {
  provider: DesignIntegrationProvider;
  connected: boolean;
  connectedAccount?: string;
  metadata?: Record<string, unknown>;
}

export interface UpsertDesignIntegrationInput {
  userId: string;
  provider: DesignIntegrationProvider;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  connectedAccount?: string | null;
  metadata?: Record<string, unknown>;
}

export async function upsertDesignIntegration(input: UpsertDesignIntegrationInput): Promise<void> {
  const accessToken = encryptSecret(input.accessToken);
  const refreshToken = input.refreshToken ? encryptSecret(input.refreshToken) : null;

  await drizzle
    .insert(schema.designIntegrations)
    .values({
      userId: input.userId,
      provider: input.provider,
      accessToken,
      refreshToken,
      expiresAt: input.expiresAt ?? null,
      connectedAccount: input.connectedAccount ?? null,
      metadata: input.metadata ?? {},
      active: true,
    })
    .onConflictDoUpdate({
      target: [schema.designIntegrations.userId, schema.designIntegrations.provider],
      set: {
        accessToken,
        refreshToken,
        expiresAt: input.expiresAt ?? null,
        connectedAccount: input.connectedAccount ?? null,
        metadata: input.metadata ?? {},
        active: true,
        updatedAt: new Date(),
      },
    });
}

export async function disconnectDesignIntegration(
  userId: string,
  provider: DesignIntegrationProvider,
): Promise<void> {
  await drizzle
    .delete(schema.designIntegrations)
    .where(
      and(
        eq(schema.designIntegrations.userId, userId),
        eq(schema.designIntegrations.provider, provider),
      ),
    );
}

export async function loadDesignIntegration(
  userId: string,
  provider: DesignIntegrationProvider,
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  connectedAccount: string | null;
  metadata: Record<string, unknown>;
} | null> {
  const [row] = await drizzle
    .select()
    .from(schema.designIntegrations)
    .where(
      and(
        eq(schema.designIntegrations.userId, userId),
        eq(schema.designIntegrations.provider, provider),
        eq(schema.designIntegrations.active, true),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    accessToken: decryptSecret(row.accessToken),
    refreshToken: row.refreshToken ? decryptSecret(row.refreshToken) : null,
    expiresAt: row.expiresAt ?? null,
    connectedAccount: row.connectedAccount ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

export async function listDesignIntegrationStatus(
  userId: string,
): Promise<DesignIntegrationStatus[]> {
  const providers: DesignIntegrationProvider[] = ["figma", "canva", "github"];
  const rows = await drizzle
    .select()
    .from(schema.designIntegrations)
    .where(eq(schema.designIntegrations.userId, userId));

  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return providers.map((provider) => {
    const row = byProvider.get(provider);
    return {
      provider,
      connected: Boolean(row?.active),
      connectedAccount: row?.connectedAccount ?? undefined,
      metadata: (row?.metadata as Record<string, unknown>) ?? undefined,
    };
  });
}

export async function updateDesignIntegrationTokens(
  userId: string,
  provider: DesignIntegrationProvider,
  tokens: { accessToken: string; refreshToken?: string | null; expiresAt?: Date | null },
): Promise<void> {
  await drizzle
    .update(schema.designIntegrations)
    .set({
      accessToken: encryptSecret(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : undefined,
      expiresAt: tokens.expiresAt ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.designIntegrations.userId, userId),
        eq(schema.designIntegrations.provider, provider),
      ),
    );
}
