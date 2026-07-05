/* eslint-disable @typescript-eslint/no-explicit-any -- external integration data shape varies by provider. */
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODELS } from "../lib/ai-models";
import { encryptSecret, decryptSecret } from "../lib/secret-vault";
import { drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";

export async function syncGoogleDriveToKnowledge(userId: string, agentId: string) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Missing Google OAuth credentials");
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing Gemini API Key");
  }

  // Use the existing Gmail OAuth account — the expanded SCOPES (drive.readonly)
  // are requested during the /api/oauth/google/url flow so existing tokens
  // may require re-authorization if they predate the scope expansion.
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

  if (!account) {
    return {
      status: "no_accounts",
      message: "No Google account connected. Connect via Settings → Integrations.",
    };
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  oauth2Client.setCredentials({
    access_token: decryptSecret(account.accessToken),
    refresh_token: account.refreshToken ? decryptSecret(account.refreshToken) : null,
    expiry_date: account.expiresAt ? Number(account.expiresAt) : null,
  });

  // Persist refreshed tokens automatically
  oauth2Client.on("tokens", async (tokens: any) => {
    if (!tokens.access_token) return;
    const update: any = {
      accessToken: encryptSecret(tokens.access_token),
      expiresAt: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
      updatedAt: new Date(),
    };
    if (tokens.refresh_token) update.refreshToken = encryptSecret(tokens.refresh_token);

    await drizzle
      .update(schema.emailAccounts)
      .set(update)
      .where(eq(schema.emailAccounts.id, account.id));
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const gemini = genAI.getGenerativeModel({ model: GEMINI_MODELS.FLASH_2_5 });

  // Fetch the 10 most recently modified Google Docs + plain text files
  const listResponse = await drive.files.list({
    pageSize: 10,
    fields: "files(id, name, mimeType)",
    q: "mimeType='application/vnd.google-apps.document' or mimeType='text/plain'",
    orderBy: "modifiedTime desc",
  });

  const files = listResponse.data.files || [];
  let ingestedCount = 0;

  for (const file of files) {
    if (!file.id) continue;

    let textContent = "";
    try {
      if (file.mimeType === "application/vnd.google-apps.document") {
        const res = await drive.files.export(
          { fileId: file.id, mimeType: "text/plain" },
          { responseType: "text" },
        );
        textContent = res.data as unknown as string;
      } else {
        const res = await drive.files.get(
          { fileId: file.id, alt: "media" },
          { responseType: "text" },
        );
        textContent = res.data as unknown as string;
      }
    } catch {
      // Skip files we can't read (permissions, binary, etc.)
      continue;
    }

    if (!textContent || textContent.trim().length < 50) continue;

    const prompt = `You are a knowledge extraction system for an AI customer service agent.
Read the following business document and extract key facts, policies, pricing, procedures, or FAQs.
For each item, determine if it is "Knowledge" (static facts/info) or a "Directive" (a rule, procedure, or guardrail).

Output format:
[TYPE] Content

Example:
[Knowledge] Our standard pricing is $50/month.
[Directive] Always ask for the account number before discussing billing.

Document: ${file.name}
Content:
${textContent.substring(0, 15000)}`;

    const geminiResponse = await gemini.generateContent(prompt);
    const text = geminiResponse.response.text();
    const lines = text.split("\n").filter((line: string) => line.trim().startsWith("["));

    for (const line of lines) {
      const isDirective = line.trim().startsWith("[Directive]");
      const cleanContent = line.replace(/^\[(Knowledge|Directive)\]\s*/i, "").trim();
      if (cleanContent.length < 10) continue;

      if (isDirective) {
        await drizzle.insert(schema.directives).values({
          userId: userId,
          agentId: agentId,
          content: cleanContent,
          priority: 5,
        });
      } else {
        await drizzle
          .insert(schema.agentLessons)
          .values({
            userId: userId,
            agentId: agentId,
            lesson: cleanContent,
            source: `Google Drive: ${file.name}`,
          })
          .onConflictDoUpdate({
            target: [schema.agentLessons.agentId, schema.agentLessons.lesson],
            set: { updatedAt: new Date() },
          });
      }
      ingestedCount++;
    }
  }

  return { status: "success", filesProcessed: files.length, ingestedLessons: ingestedCount };
}
