import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { encryptSecret, decryptSecret } from "../lib/secret-vault";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const db = createClient(supabaseUrl, supabaseServiceKey);

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
  const { data: accounts, error: accountErr } = await db
    .from("wireline_email_accounts")
    .select("id, access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .limit(1);

  if (accountErr || !accounts || accounts.length === 0) {
    return { status: "no_accounts", message: "No Google account connected. Connect via Settings → Integrations." };
  }

  const account = accounts[0];
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: decryptSecret(account.access_token),
    refresh_token: account.refresh_token ? decryptSecret(account.refresh_token) : null,
    expiry_date: account.expires_at,
  });

  // Persist refreshed tokens automatically
  oauth2Client.on("tokens", async (tokens) => {
    if (!tokens.access_token) return;
    const update: Record<string, unknown> = { access_token: encryptSecret(tokens.access_token), expires_at: tokens.expiry_date };
    if (tokens.refresh_token) update.refresh_token = encryptSecret(tokens.refresh_token);
    await db.from("wireline_email_accounts").update(update).eq("id", account.id);
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const gemini = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
        const res = await drive.files.export({ fileId: file.id, mimeType: "text/plain" }, { responseType: "text" });
        textContent = res.data as unknown as string;
      } else {
        const res = await drive.files.get({ fileId: file.id, alt: "media" }, { responseType: "text" });
        textContent = res.data as unknown as string;
      }
    } catch {
      // Skip files we can't read (permissions, binary, etc.)
      continue;
    }

    if (!textContent || textContent.trim().length < 50) continue;

    const prompt = `You are a knowledge extraction system for an AI customer service agent.
Read the following business document and extract key facts, policies, pricing, procedures, or FAQs that a customer service agent should know.
Output each fact as a separate line starting with "* ".
Be concise (1-2 sentences per fact). Skip boilerplate, headings, and administrative content.

Document: ${file.name}
Content:
${textContent.substring(0, 15000)}`;

    const geminiResponse = await gemini.generateContent(prompt);
    const text = geminiResponse.response.text();
    const lines = text.split("\n").filter((line) => line.trim().startsWith("*"));

    for (const line of lines) {
      const cleanLesson = line.replace(/^\*\s*/, "").trim();
      if (cleanLesson.length < 10) continue;

      await db.from("wireline_agent_lessons").upsert(
        {
          user_id: userId,
          agent_id: agentId,
          lesson: cleanLesson,
          source: `Google Drive: ${file.name}`,
        },
        { onConflict: "agent_id, lesson" }
      );
      ingestedCount++;
    }
  }

  return { status: "success", filesProcessed: files.length, ingestedLessons: ingestedCount };
}
