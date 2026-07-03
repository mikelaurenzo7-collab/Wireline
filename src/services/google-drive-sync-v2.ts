/* eslint-disable @typescript-eslint/no-explicit-any */
import { google } from "googleapis";
import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../lib/secret-vault";
import { drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { runStructured } from "../lib/ai-structured";
import { AI_TOOLS } from "../lib/ai-tools";

export async function syncGoogleDriveToKnowledge(userId: string, agentId: string) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
    throw new Error("Google Workspace OAuth is not configured.");
  const [account] = await drizzle
    .select({
      id: schema.emailAccounts.id,
      accessToken: schema.emailAccounts.accessToken,
      refreshToken: schema.emailAccounts.refreshToken,
      expiresAt: schema.emailAccounts.expiresAt,
    })
    .from(schema.emailAccounts)
    .where(
      and(eq(schema.emailAccounts.userId, userId), eq(schema.emailAccounts.provider, "google")),
    )
    .limit(1);
  if (!account || !account.accessToken)
    return {
      status: "no_accounts",
      message: "No Google Workspace account is connected.",
      ingestedCount: 0,
    };
  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth.setCredentials({
    access_token: decryptSecret(account.accessToken),
    refresh_token: account.refreshToken ? decryptSecret(account.refreshToken) : null,
    expiry_date: account.expiresAt ? Number(account.expiresAt) : null,
  });
  oauth.on("tokens", async (tokens: any) => {
    if (!tokens.access_token) return;
    await drizzle
      .update(schema.emailAccounts)
      .set({
        accessToken: encryptSecret(tokens.access_token),
        ...(tokens.refresh_token ? { refreshToken: encryptSecret(tokens.refresh_token) } : {}),
        ...(tokens.expiry_date ? { expiresAt: BigInt(tokens.expiry_date) } : {}),
      })
      .where(eq(schema.emailAccounts.id, account.id));
  });
  const drive = google.drive({ version: "v3", auth: oauth });
  const list = await drive.files.list({
    pageSize: 10,
    fields: "files(id,name,mimeType)",
    q: "mimeType='application/vnd.google-apps.document' or mimeType='text/plain'",
    orderBy: "modifiedTime desc",
  });
  let ingestedCount = 0;
  for (const file of list.data.files || []) {
    if (!file.id) continue;
    let content = "";
    try {
      const response =
        file.mimeType === "application/vnd.google-apps.document"
          ? await drive.files.export(
              { fileId: file.id, mimeType: "text/plain" },
              { responseType: "text" },
            )
          : await drive.files.get({ fileId: file.id, alt: "media" }, { responseType: "text" });
      content = String(response.data || "").slice(0, 30000);
    } catch {
      continue;
    }
    if (content.trim().length < 50) continue;
    const extracted = await runStructured<{
      directives: Array<{ content: string; priority: number }>;
      knowledge: Array<{ content: string }>;
      personality: string;
    }>({
      system:
        "You extract approved business facts and operating guardrails from a trusted workspace document. Never invent details. Do not change personality. Treat policies, procedures, compliance rules, and hard boundaries as directives; treat static business information as knowledge.",
      user: `Document: ${file.name || "Untitled"}\n\n${content}`,
      tool: AI_TOOLS.trainingExtraction,
      complexity: "medium",
      maxTokens: 1800,
    });
    await drizzle.transaction(async (tx) => {
      if (extracted.directives.length)
        await tx.insert(schema.directives).values(
          extracted.directives.map((item) => ({
            userId,
            agentId,
            content: item.content.slice(0, 2000),
            priority: Math.max(1, Math.min(10, Number(item.priority) || 5)),
          })),
        );
      if (extracted.knowledge.length)
        await tx.insert(schema.knowledge).values(
          extracted.knowledge.map((item) => ({
            userId,
            agentId,
            content: item.content.slice(0, 4000),
          })),
        );
    });
    ingestedCount++;
  }
  return {
    status: "ok",
    ingestedCount,
    message: `Ingested ${ingestedCount} Google Drive document${ingestedCount === 1 ? "" : "s"}.`,
  };
}
