import express, { type NextFunction, type Request, type Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(express.json({ limit: "1mb" }));

// Google Workspace OAuth Setup
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const supabaseUrl = getRequiredEnv("VITE_SUPABASE_URL");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim();
if (!supabaseKey) {
  throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY");
}

const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
const genAI = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
const db = createClient(supabaseUrl, supabaseKey);

function getGeminiClient() {
  if (!genAI) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return genAI;
}

function getConfiguredBaseUrl(req: Request) {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const host = req.get("host");
  if (!host) {
    throw new Error("Unable to determine application base URL.");
  }

  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  return `${protocol}://${host}`;
}

function getGoogleOAuthClient(req: Request) {
  const baseUrl = getConfiguredBaseUrl(req);
  return new google.auth.OAuth2(
    getRequiredEnv("GOOGLE_CLIENT_ID"),
    getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    `${baseUrl}/api/oauth/google/callback`
  );
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

async function getAuthenticatedUser(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) {
    return null;
  }

  return user;
}

function normalizePhoneNumber(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[^\d+]/g, "");
  return /^\+?[1-9]\d{9,14}$/.test(normalized) ? normalized : null;
}

function isValidEmailAddress(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320) {
    return false;
  }

  for (const character of trimmed) {
    if (character <= " ") {
      return false;
    }
  }

  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0 || atIndex !== trimmed.lastIndexOf("@") || atIndex === trimmed.length - 1) {
    return false;
  }

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (!local || !domain || domain.startsWith(".") || domain.endsWith(".") || !domain.includes(".")) {
    return false;
  }

  return true;
}

function sanitizeLikeInput(value: string) {
  return value.replace(/[%_]/g, "").trim();
}

function getOAuthStateSecret() {
  return process.env.OAUTH_STATE_SECRET?.trim() || getRequiredEnv("GOOGLE_CLIENT_SECRET");
}

function createOAuthState(userId: string, origin: string) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    origin,
    issuedAt: Date.now(),
  })).toString("base64url");
  const signature = createHmac("sha256", getOAuthStateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyOAuthState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = createHmac("sha256", getOAuthStateSecret()).update(payload).digest();
  const provided = Buffer.from(signature, "base64url");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    userId?: string;
    origin?: string;
    issuedAt?: number;
  };

  if (!decoded.userId || !decoded.origin || !decoded.issuedAt) {
    return null;
  }

  if (Date.now() - decoded.issuedAt > 15 * 60 * 1000) {
    return null;
  }

  return decoded;
}

function hasValidWebhookSecret(req: Request) {
  const configuredSecret = process.env.WIRELINE_WEBHOOK_SECRET?.trim();
  if (!configuredSecret) {
    return false;
  }

  const providedSecret = req.get("x-vapi-secret")?.trim();
  if (!providedSecret) {
    return false;
  }

  const expected = Buffer.from(configuredSecret);
  const provided = Buffer.from(providedSecret);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

const rateLimitBuckets = new Map<string, { count: number; resetsAt: number }>();

function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetsAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetsAt: now + windowMs });
      return next();
    }

    if (bucket.count >= maxRequests) {
      res.setHeader("Retry-After", Math.ceil((bucket.resetsAt - now) / 1000));
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    bucket.count += 1;
    next();
  };
}

if (!geminiApiKey) {
  console.warn("GEMINI_API_KEY is not configured; AI-powered endpoints will return configuration errors.");
}
if (!process.env.WIRELINE_WEBHOOK_SECRET?.trim()) {
  console.warn("WIRELINE_WEBHOOK_SECRET is not configured; Vapi server-to-server webhook verification is disabled.");
}

// ==========================================
// AUTH MIDDLEWARE
// ==========================================
async function authenticateUser(req: any, res: Response, next: NextFunction) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.user = user;
  next();
}

// ==========================================
// 1. API WEBHOOK (CARRIER CONNECTION) - NO AUTH (SYSTEM TO SYSTEM)
// ==========================================
app.post("/api/vapi-webhook", async (req, res) => {
  const authenticatedUser = await getAuthenticatedUser(req);
  if (!authenticatedUser && !hasValidWebhookSecret(req)) {
    return res.status(401).json({ error: "Unauthorized webhook request" });
  }

  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid webhook payload" });
  }

  const { message } = payload;
  if (!message || typeof message !== "object") {
    return res.status(400).json({ error: "Invalid webhook message" });
  }
  
  console.log("--- INCOMING VAPI WEBHOOK ---");
  
  // For webhooks, we need to know WHICH user this is for.
  // We'll extract agentId from query and fetch the agent and its user_id.
  const webhookAgentId = typeof req.query.agentId === "string" ? req.query.agentId.trim() : "";
  if (!webhookAgentId) {
    return res.status(400).json({ error: "Missing agentId query parameter" });
  }
  
  // 0. Fetch the agent's owner and their settings
  const { data: agentOwner } = await db.from('wireline_agents').select('user_id').eq('id', webhookAgentId).single();
  if (!agentOwner) return res.status(404).json({ error: "Agent not found" });
  if (authenticatedUser && agentOwner.user_id !== authenticatedUser.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { data: userSettings } = await db.from('wireline_settings').select('subscription_status').eq('user_id', agentOwner.user_id).single();
  const subscriptionStatus = userSettings?.subscription_status || 'active';
  
  if (subscriptionStatus !== 'active') {
    console.log("Connection rejected: Account subscription is not active.");
    if (message && message.type === "assistant-request") {
        return res.json({
            assistant: {
                firstMessage: "We're sorry, but the automated service for this line is currently suspended. Please contact the administrator.",
                model: {
                    provider: "google",
                    model: "gemini-2.0-flash",
                    systemPrompt: "Tell the user the service is suspended, and gracefully end the call."
                }
            }
        });
    }
    return res.status(403).json({ error: "Access Denied: Inactive Subscription" });
  }
  
  // Vapi calls this prior to connecting the agent
  if (message && message.type === "assistant-request") {
    console.log("Assistant request received for Agent ID:", webhookAgentId);

    try {
      // 1. Assemble memory from Supabase
      const [agentConfig, directivesData, knowledgeData, personalityData] = await Promise.all([
        db.from('wireline_agents').select('*').eq('id', webhookAgentId).eq('user_id', agentOwner.user_id).single(),
        db.from('wireline_directives').select('content, priority').eq('agent_id', webhookAgentId).eq('user_id', agentOwner.user_id).order('priority', { ascending: false }),
        db.from('wireline_knowledge').select('content').eq('agent_id', webhookAgentId).eq('user_id', agentOwner.user_id),
        db.from('wireline_personality').select('content').eq('agent_id', webhookAgentId).eq('user_id', agentOwner.user_id).single()
      ]);


      // TEMPORAL AWARENESS: Inject exact current time so the agent knows what "Today" and "Tomorrow" mean
      const currentDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      // Determine Call Direction and Archetype Behavior
      const isOutbound = message.type === 'outboundPhoneCall' || message.call?.type === 'outboundPhoneCall';
      // Force 'The Closer' archetype on outbound calls, use user configuration on inbound calls.
      const archetype = isOutbound ? 'The Closer' : (agentConfig?.data?.archetype || 'Receptionist');
      
      let archetypeRules = "";
      let llmTemp = 0.4;
      
      switch(archetype) {
         case 'The Closer':
            archetypeRules = "You are a high-stakes closer. Use a confident tone. If a lead hesitates, offer a limited-time incentive to book now.";
            llmTemp = 0.7;
            break;
         case 'Support Tech':
            archetypeRules = "You are highly analytical, patient, and precise. You ask clarifying troubleshooting questions one at a time. You do not rush.";
            llmTemp = 0.2;
            break;
         case 'The Empath':
            archetypeRules = "If a caller sounds frustrated, your first words must be a validating statement like 'I completely hear you, that's incredibly stressful. Let me fix this for you.'";
            llmTemp = 0.6;
            break;
         default: // Receptionist
            archetypeRules = "You are an expert at handling phone calls where people are often in a hurry. Never use platitudes like 'I hope you're having a wonderful day.' Get straight to the value. You are cheerful, polite, and highly efficient.";
            llmTemp = 0.4;
      }

      const ambientNoiseActive = agentConfig?.data?.ambient_noise && agentConfig?.data?.ambient_noise !== 'off';

      const systemPrompt = `
      ## BLOCK 1: IDENTITY & ARCHETYPE (THE "MOAT")
      Persona: You are ${agentConfig?.data?.name || 'Wireline Agent'}, a representative for our company.
      Tone: Snappy, concise, low-friction.
      The "Secret Sauce": ${archetypeRules}
      Base Personality: ${personalityData?.data?.content || "You are a professional, helpful assistant."}
      ${ambientNoiseActive ? "Ambient Realism: You are working in a busy location. Speak with a slight sense of professional urgency." : ""}

      ${agentConfig?.data?.website_url ? `## KNOWLEDGE GROUNDING\nYour company's official website is: ${agentConfig.data.website_url}. If asked for more details or deep info not in your knowledge base, refer them back to the site.` : ""}

      ## BLOCK 2: TEMPORAL & CONTEXTUAL ANCHORS
      You unmistakably know that today is ${currentDateTime} (Eastern Time). If a customer asks for "tomorrow" or "next week", calculate the date silently and confirm it back to them (e.g., "So that would be Tuesday the 24th at 2pm?").

      ## BLOCK 3: CONVERSATIONAL LOOP & GUARDRAILS
      Response Length: Keep every response under 20 words unless you are explaining a complex process. Long AI monologues feel like robots.
      The "Anti-Echo" Rule: Do not repeat back what the user just said. If they say "My heater is broken", do not say "I understand your heater is broken." Instead, say "Got it. Let's get a tech out there. Is it blowing cold air or not turning on at all?"
      Question Limit: Never ask more than one question at a time.
      Number Formatting: Spell out important numbers if they sound robotic (e.g., "Two zero two" instead of "Two hundred and two").

      ## BLOCK 4: TOOL EXECUTION LOGIC & PROTOCOLS
      Sequence Requirements:
      1. If a user wants a slot, you MUST check calendar availability first.
      2. If the slot is open, book the appointment.
      3. Confirm the Reference ID provided by the system before hanging up.
      
      Escalation Transfer Rule: If a user asks for a "real person" twice, or asks to transfer, immediately inform them you are transferring them and use the tools.

      # CROSS-CHANNEL HANDOFF (OMNICHANNEL)
      If a customer needs a detailed follow-up, a reminder, or a document sent that you cannot speak entirely over the phone, use the 'send_email' tool. 
      Tell the caller: "I'll hand this over to our email team to send you that info right now."

      ## ABSOLUTE RULES
      ${(directivesData?.data || []).map((d: any) => `[PRIORITY ${d.priority}] ${d.content}`).join('\n')}
      
      ## KNOWLEDGE BASE
      ${(knowledgeData?.data || []).map((k: any) => `- ${k.content}`).join('\n')}
      `;

      const responsePayload = {
        assistant: {
           name: agentConfig?.data?.name || "Wireline Agent",
           firstMessage: agentConfig?.data?.first_message || "Hello! Thank you for calling. How can I help you today?",
           serverUrlSecret: process.env.WIRELINE_WEBHOOK_SECRET?.trim(),
           serverMessages: ["tool-calls", "status-update", "conversation-update", "end-of-call-report"],
           backgroundSound: agentConfig?.data?.ambient_noise || 'off',
           model: {
            provider: "google",
            model: "gemini-2.0-flash", 
            systemPrompt: systemPrompt,
            temperature: llmTemp
          },
          recordingEnabled: true,
          voice: {
            provider: isOutbound ? (agentConfig?.data?.voice_provider_outbound || agentConfig?.data?.voice_provider || "11labs") : (agentConfig?.data?.voice_provider_inbound || agentConfig?.data?.voice_provider || "11labs"),
            voiceId: isOutbound ? (agentConfig?.data?.voice_id_outbound || agentConfig?.data?.voice_id || "bIHbv24MWmeRgasZH58o") : (agentConfig?.data?.voice_id_inbound || agentConfig?.data?.voice_id || "bIHbv24MWmeRgasZH58o") 
          },
          functions: [
            {
              name: "check_calendar_availability",
              description: "Checks the database calendar to see what times are already booked on a specific date. ALWAYS run this before confirming an appointment to prevent double-booking.",
              parameters: {
                type: "object",
                properties: {
                  date: { type: "string", description: "The date to check (e.g., 'October 15', 'Next Tuesday')." }
                },
                required: ["date"]
              }
            },
            {
              name: "book_appointment",
              description: "Books a home service appointment. Use this only AFTER checking the calendar to ensure the time is free.",
              parameters: {
                type: "object",
                properties: {
                  date: { type: "string", description: "The date of the appointment (e.g., 'Tuesday', 'Oct 15')" },
                  time: { type: "string", description: "The time of the appointment (e.g., '2 PM')" },
                  customer_name: { type: "string", description: "The caller's name" },
                  service_type: { type: "string", description: "The type of service requested (e.g., 'AC Repair', 'Plumbing')" }
                },
                required: ["date", "time", "customer_name", "service_type"]
              }
            },
            {
              name: "escalate_to_human",
              description: "Transfers the call to a real human manager. Use this if the customer is very angry, asks for a human repeatedly, or has an extremely complex question you cannot answer with your Knowledge Base.",
              parameters: { type: "object", properties: {}, required: [] }
            },
            {
              name: "send_email",
              description: "Sends an email to the customer. Use this to send confirmations, quotes, or follow-up information during or after the call.",
              parameters: {
                type: "object",
                properties: {
                  to_email: { type: "string", description: "The customer's email address." },
                  subject: { type: "string", description: "The subject of the email." },
                  body: { type: "string", description: "The body content of the email." }
                },
                required: ["to_email", "subject", "body"]
              }
            }
          ]
        }
      };

      console.log("Replied with assistant config successfully.");
      return res.json(responsePayload);
    } catch (e) {
      console.error("Vapi webhook config error:", e);
      // Give Vapi a graceful fallback so it doesn't freeze
      return res.json({
         assistant: {
           firstMessage: "I'm sorry, my memory banks are currently offline.",
           model: { provider: "google", model: "gemini-3-flash-preview", systemPrompt: "Apologize and hang up." }
         }
      });
    }
  }
  
  if (message && message.type === "tool-calls") {
    console.log("Received tool call:", JSON.stringify(message.toolCalls, null, 2));
    if (!Array.isArray(message.toolCalls)) {
      return res.status(400).json({ error: "Invalid tool call payload" });
    }
    
    // Fetch agent config once for all tools in this call
    const { data: agent } = await db.from('wireline_agents').select('*').eq('id', webhookAgentId).eq('user_id', agentOwner.user_id).single();

    const results = [];
    
    for (const toolCall of message.toolCalls) {
      
      // TOOL 1: CHECK AVAILABILITY
       if (toolCall.function.name === "check_calendar_availability") {
          try {
             const { date } = toolCall.function.arguments;
             if (typeof date !== "string" || !date.trim()) {
               throw new Error("Invalid date");
             }
             const sanitizedDate = sanitizeLikeInput(date);
             const { data, error } = await db.from('wireline_appointments').select('time, service_type').eq('agent_id', webhookAgentId).eq('user_id', agent.user_id).ilike('date', `%${sanitizedDate}%`);
             
             if (error) throw error;

            if (data && data.length > 0) {
               const bookedTimes = data.map(appt => appt.time).join(", ");
               results.push({
                 toolCallId: toolCall.id,
                 result: `The following times are already booked on ${date}: ${bookedTimes}. Please tell the customer these times are unavailable and offer them any other time.`
               });
            } else {
               results.push({
                 toolCallId: toolCall.id,
                 result: `The entire day on ${date} is completely open. You can offer them any time during normal business hours.`
               });
            }
         } catch (e) {
            results.push({ toolCallId: toolCall.id, result: "Cannot access calendar. Assume open for now but warn customer it is pending." });
         }
      }

      // TOOL 2: BOOK APPOINTMENT
      if (toolCall.function.name === "book_appointment") {
        try {
          const args = toolCall.function.arguments; 
          
          // Insert actual appointment into Supabase
          const { data, error } = await db.from('wireline_appointments').insert({
            user_id: agent.user_id,
            agent_id: webhookAgentId,
            call_id: message.call?.id || "in-call",
            date: args.date || "Unknown Date",
            time: args.time || "Unknown Time",
            customer_name: args.customer_name || "Guest",
            service_type: args.service_type || "General Service",
            status: "Scheduled"
          }).select('id').single();

          if (error) throw error;

          results.push({
            toolCallId: toolCall.id,
            result: `Appointment confirmed successfully! Your booking reference ID is ${data.id.split('-')[0]}.`
          });
        } catch (e) {
          console.error("Failed to book appointment:", e);
          results.push({
            toolCallId: toolCall.id,
            result: "I'm sorry, I'm having trouble accessing the calendar database right now."
          });
        }
      }

      // TOOL 3: ESCALATE TO HUMAN
      if (toolCall.function.name === "escalate_to_human") {
         const dest = agent?.transfer_phone || "the front office";
         results.push({
           toolCallId: toolCall.id,
           result: `Please say: 'I am transferring you to ${dest} now, please hold on.' Then, simulate the hold process.`
         });
      }

      // TOOL 4: ROUTING HANDOFF (PHONE -> EMAIL)
       if (toolCall.function.name === "send_email") {
          try {
            const { to_email, subject, body } = toolCall.function.arguments;
            if (!isValidEmailAddress(to_email) || typeof subject !== "string" || typeof body !== "string") {
              throw new Error("Invalid email handoff payload");
            }
            
            // Fetch the first connected valid email account
            const { data: accounts } = await db.from('wireline_email_accounts').select('*').eq('user_id', agent.user_id).limit(1);
            
            if (!accounts || accounts.length === 0) {
              results.push({
                toolCallId: toolCall.id,
                result: "Email system is not connected to any inbox. Inform the customer."
              });
              continue;
           }

           const account = accounts[0];
           const curAgentId = webhookAgentId || "default-agent";

            // Create a Fleet Handoff Task (For traceability & Founder monitoring)
            const { data: task, error: taskError } = await db.from('wireline_fleet_tasks').insert({
               user_id: agent.user_id,
               source_type: 'phone_call',
               source_id: message.call?.id || "manual-handoff",
               target_channel: 'email',
              agent_id: curAgentId,
              customer_info: { email: to_email },
              task_type: 'follow_up',
              description: `Subject: ${subject}\n\n${body}`,
              status: 'processing'
           }).select('*').single();

           if (taskError) throw taskError;

           const oauth2Client = getGoogleOAuthClient(req);
           oauth2Client.setCredentials({
             access_token: account.access_token,
             refresh_token: account.refresh_token,
             expiry_date: account.expires_at
           });

           const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
           const messageParts = [
             `To: ${to_email}`,
             `Subject: ${subject}`,
             'Content-Type: text/plain; charset=utf-8',
             '',
             body
           ];
           const encodedMessage = Buffer.from(messageParts.join('\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
           
           const gmailRes = await gmail.users.messages.send({
             userId: 'me',
             requestBody: { raw: encodedMessage }
           });

           // OMNICHANNEL SYNC: Log the phone-originated email to the hub
           try {
              const googleThreadId = gmailRes.data.threadId;
              let { data: thread } = await db.from('wireline_email_threads').select('*').eq('thread_id', googleThreadId).single();
              
               if (!thread) {
                  const { data: newThread } = await db.from('wireline_email_threads').insert({
                    user_id: agent.user_id,
                    account_id: account.id,
                    thread_id: googleThreadId,
                    customer_email: to_email,
                   subject: subject,
                   status: 'open',
                   summary: `Phone Follow-up: ${to_email}`
                 }).select('*').single();
                 thread = newThread;
              }

               await db.from('wireline_email_messages').insert({
                  user_id: agent.user_id,
                  thread_id: thread.id,
                  google_message_id: gmailRes.data.id,
                  role: 'ai',
                 content: body
              });

              await db.from('wireline_email_threads').update({
                 last_message_at: new Date()
              }).eq('id', thread.id);
           } catch(syncErr) {
              console.error("Omnichannel sync error:", syncErr);
           }

            // Mark task as completed
            await db.from('wireline_fleet_tasks').update({ status: 'completed' }).eq('id', task.id).eq('user_id', agent.user_id);

           results.push({
             toolCallId: toolCall.id,
             result: `Successfully handed off follow-up task to the AI Email Fleet. Task ID: ${task.id.split('-')[0]}. The email has been dispatched via your connected mailroom.`
           });
         } catch (e: any) {
           console.error("Fleet Handoff Failed:", e);
           results.push({
             toolCallId: toolCall.id,
             result: "Handoff to email system failed. Please take a manual note."
           });
         }
      }
    }
    
    res.json({ results });
    return;
  }
  
  if (message && message.type === "end-of-call-report") {
    console.log("Call ended, report received!");
    
    try {
        const call = message.call;
        const analysis = message.analysis;
        
        let duration = 0;
        if (call?.endedAt && call?.startedAt) {
           duration = Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000);
        }

        await db.from('wireline_call_logs').insert({
           user_id: agentOwner.user_id,
           vapi_call_id: call?.id || "unknown",
           agent_id: webhookAgentId,
           direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
           customer_number: call?.customer?.number || "",
           duration_seconds: duration,
           cost: call?.cost || 0.0,
           summary: analysis?.summary || "No summary provided.",
           transcript: message.transcript || "",
           recording_url: message.recordingUrl || message.stereoRecordingUrl || null
        });

        // AI LEAD SCORING & INTENT DETECTION
        const scoringPrompt = `
          Analyze this call TRANSCRIPT and give a BUYING INTENT score (0-100) and CATEGORY ('high', 'medium', 'low', 'none').
          Transcript: ${message.transcript || "None"}
          Summary: ${analysis?.summary || ""}
          RESPONSE FORMAT (JSON): { "score": number, "label": string }
        `;
        try {
           const scoreRes = await getGeminiClient().models.generateContent({
             model: "gemini-3-flash-preview",
             contents: scoringPrompt,
             config: { responseMimeType: "application/json" }
           });
            const scoreObj = JSON.parse(scoreRes.text || "{}");
            await db.from('wireline_call_logs').update({
              lead_score: scoreObj.score || 0,
              intent_label: scoreObj.label || 'none'
            }).eq('vapi_call_id', call?.id).eq('user_id', agentOwner.user_id);
         } catch(scoringErr) {
            console.error("Call scoring failed:", scoringErr);
         }
        
        // If it was outbound, let's update the lead status
         if (call?.type === "outboundPhoneCall") {
             await db.from('wireline_outbound_leads')
              .update({ status: 'Completed' })
              .eq('call_id', call?.id)
              .eq('user_id', agentOwner.user_id);
         }

        return res.json({ success: true });
    } catch(e) {
      console.error("Failed to save call log", e);
      return res.json({ success: false });
    }
  }

  res.json({ status: "ok" });
});

// ==========================================
// 1.5 CALL LOG RETRIEVAL ENDPOINT
// ==========================================
app.get("/api/calls", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: calls, error } = await db
      .from('wireline_call_logs')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (error) throw error;
    res.json({ calls: calls || [] });
  } catch (error) {
    console.error("Failed to fetch calls:", error);
    res.json({ calls: [] }); // Fail gracefully if table not created
  }
});

// ==========================================
// 1.8 DASHBOARD STATS ENDPOINT
// ==========================================
app.get("/api/dashboard/stats", authenticateUser, async (req: any, res: any) => {
   try {
      const [apptRes, leadsRes, logsRes] = await Promise.all([
          db.from('wireline_appointments').select('id', { count: 'exact' }).eq('user_id', req.user.id),
          db.from('wireline_outbound_leads').select('id', { count: 'exact' }).eq('user_id', req.user.id),
          db.from('wireline_call_logs').select('cost, duration_seconds, direction, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(200)
      ]);
      
      const totalAppointments = apptRes.count || 0;
      const totalLeads = leadsRes.count || 0;
      const logs = logsRes.data || [];
      
      const totalMinutes = Math.ceil(logs.reduce((acc, log) => acc + (log.duration_seconds || 0), 0) / 60);
      const totalCost = logs.reduce((acc, log) => acc + (Number(log.cost) || 0), 0);
      const inboundCount = logs.filter(l => l.direction === 'inbound').length;
      const outboundCount = logs.filter(l => l.direction === 'outbound').length;
      const conversionRate = logs.length > 0 ? ((totalAppointments / logs.length) * 100).toFixed(1) : 0;

      // FETCH "HOT LEADS" (AI-Scored High Intent)
      const { data: hotCalls } = await db.from('wireline_call_logs').select('*').eq('user_id', req.user.id).gte('lead_score', 75).order('created_at', { ascending: false }).limit(5);
      const { data: hotEmails } = await db.from('wireline_email_threads').select('*').eq('user_id', req.user.id).gte('lead_score', 75).order('created_at', { ascending: false }).limit(5);

      const hotLeads = [
        ...(hotCalls || []).map(c => ({ id: c.id, type: 'call', contact: c.customer_number, score: c.lead_score, intent: c.intent_label, summary: c.summary, date: c.created_at })),
        ...(hotEmails || []).map(e => ({ id: e.id, type: 'email', contact: e.customer_email, score: e.lead_score, intent: e.intent_label, summary: e.summary, date: e.created_at }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

      res.json({
         totalAppointments,
         totalLeads,
         totalCalls: logs.length,
         totalMinutes,
         totalCost: totalCost.toFixed(2),
         inboundCount,
         outboundCount,
         conversionRate,
         recentLogs: logs.slice(0, 100),
         hotLeads
      });
   } catch(e) {
      console.error("Dashboard error", e);
      res.status(500).json({ error: "Failed to fetch stats" });
   }
});

// ==========================================
// 1.6 APPOINTMENTS RETRIEVAL ENDPOINT
// ==========================================
app.get("/api/appointments", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: appointments, error } = await db
      .from('wireline_appointments')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    res.json({ appointments: appointments || [] });
  } catch (error) {
    console.error("Failed to fetch appointments:", error);
    res.json({ appointments: [] }); 
  }
});

// ==========================================
// 1.7 AGENTS MANAGEMENT ENDPOINTS
// ==========================================
app.get("/api/agents", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: agents, error } = await db.from('wireline_agents').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    res.json({ agents: agents || [] });
  } catch (error) {
    res.json({ agents: [] }); 
  }
});

app.post("/api/agents", authenticateUser, async (req: any, res: any) => {
  try {
    // SECURITY ENFORCEMENT: Check Subscription Status for this specific user
    const { data: userSettings } = await db.from('wireline_settings').select('subscription_status, max_agents').eq('user_id', req.user.id).single();
    
    // Gating mechanism: Prevent agent creation if the account is unpaid
    const subscriptionStatus = userSettings?.subscription_status || 'active'; 
    if (subscriptionStatus !== 'active') {
       return res.status(403).json({ error: "Access Denied: Please upgrade your billing plan." });
    }

    // Agent Limit Check
    const maxAgents = userSettings?.max_agents || 3;
    const { count: agentCount } = await db.from('wireline_agents').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id);
    
    if (agentCount !== null && agentCount >= maxAgents) {
      return res.status(403).json({ error: `Quota Exceeded: Your plan only allows ${maxAgents} agents.` });
    }

    const { id, name, voice_id, channel } = req.body;
    const agentId = id || `agent-${Date.now()}`;
    await db.from('wireline_agents').insert({
      id: agentId,
      user_id: req.user.id,
      name: name || "New Agent",
      voice_id: voice_id || 'bIHbv24MWmeRgasZH58o',
      channel: channel || 'voice'
    });
    
    // Seed default personality
    await db.from('wireline_personality').insert({
       agent_id: agentId,
       user_id: req.user.id,
       content: channel === 'email' 
         ? "You are a professional email agent specialized in clear, efficient communication." 
         : "You are a helpful assistant serving as a phone agent."
    });
    
    res.json({ success: true, id: agentId });
  } catch (error) {
    console.error("Agent creation failed:", error);
    res.status(500).json({ error: "Failed to create agent" });
  }
});

// Update agent settings
app.put("/api/agents/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { name, voice_id, voice_id_inbound, voice_id_outbound, voice_provider, first_message, archetype, ambient_noise, website_url, transfer_phone, email_auto_respond, email_agent_tone, email_signature, channel } = req.body;
    await db.from('wireline_agents').update({ 
      name, 
      voice_id, 
      voice_id_inbound,
      voice_id_outbound,
      voice_provider, 
      first_message, 
      archetype, 
      ambient_noise, 
      website_url, 
      transfer_phone, 
      email_auto_respond, 
      email_agent_tone, 
      email_signature,
      channel
    }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update agent" });
  }
});

app.get("/api/agent-config/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const [directives, knowledge, personality] = await Promise.all([
      db.from('wireline_directives').select('*').eq('agent_id', agentId).eq('user_id', req.user.id).order('priority', { ascending: false }),
      db.from('wireline_knowledge').select('*').eq('agent_id', agentId).eq('user_id', req.user.id),
      db.from('wireline_personality').select('content').eq('agent_id', agentId).eq('user_id', req.user.id).single()
    ]);
    res.json({
      directives: directives.data || [],
      knowledge: knowledge.data || [],
      personality: personality.data?.content || ""
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

// ==========================================
// 1.5.4 PHONE NUMBER MANAGEMENT
// ==========================================
app.get("/api/phone-numbers", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from('wireline_phone_numbers').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ numbers: data || [] });
  } catch (error) {
    res.json({ numbers: [] });
  }
});

app.post("/api/phone-numbers", authenticateUser, async (req: any, res: any) => {
  try {
    const { phone_number, vapi_number_id } = req.body;
    await db.from('wireline_phone_numbers').insert({ phone_number, vapi_number_id, user_id: req.user.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to add phone number" });
  }
});

app.patch("/api/phone-numbers/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { agent_id } = req.body;
    await db.from('wireline_phone_numbers').update({ agent_id }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update phone number assignment" });
  }
});

// ==========================================
// 1.5.6 CARRIER SYNC (VAPI PROXY)
// ==========================================
app.get("/api/carrier/numbers", authenticateUser, async (req: any, res: any) => {
  try {
    const vapiSecret = process.env.VAPI_PRIVATE_KEY;
    if (!vapiSecret) return res.json({ numbers: [] });

    const response = await fetch("https://api.vapi.ai/phone-number", {
      headers: { "Authorization": `Bearer ${vapiSecret}` }
    });
    const data = await response.json();
    
    // The Vapi response is usually an array of phone number objects
    const formatted = (data || []).map((num: any) => ({
      id: num.id,
      number: num.number,
      provider: num.provider
    }));

    res.json({ numbers: formatted });
  } catch (error) {
    console.error("Vapi sync error:", error);
    res.json({ numbers: [] });
  }
});
app.get("/api/fleet/tasks", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from('wireline_fleet_tasks')
                                     .select('*, wireline_agents(name)')
                                     .eq('user_id', req.user.id)
                                     .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ tasks: data || [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch fleet tasks" });
  }
});

app.post("/api/fleet/tasks", authenticateUser, async (req: any, res: any) => {
  try {
    const { source_type, source_id, target_channel, customer_info, task_type, description, agent_id } = req.body;
    await db.from('wireline_fleet_tasks').insert({
       source_type, source_id, target_channel, customer_info, task_type, description, agent_id, status: 'pending', user_id: req.user.id
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to create fleet task" });
  }
});

app.patch("/api/fleet/tasks/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { status } = req.body;
    await db.from('wireline_fleet_tasks').update({ status }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update task status" });
  }
});

app.post("/api/agent-config/:id/manual", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const { type, content, overrideId } = req.body; // type is 'personality', 'directive', or 'knowledge'
    const userId = req.user.id;
    
    if (type === 'personality') {
       await db.from('wireline_personality').upsert({ agent_id: agentId, content, user_id: userId });
    } else if (type === 'directive') {
       if (overrideId) {
          await db.from('wireline_directives').update({ content }).eq('id', overrideId).eq('user_id', userId);
       } else {
          await db.from('wireline_directives').insert({ agent_id: agentId, content, priority: 5, user_id: userId });
       }
    } else if (type === 'knowledge') {
       if (overrideId) {
          await db.from('wireline_knowledge').update({ content }).eq('id', overrideId).eq('user_id', userId);
       } else {
          await db.from('wireline_knowledge').insert({ agent_id: agentId, content, user_id: userId });
       }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Manual config error", error);
    res.status(500).json({ error: "Failed to update" });
  }
});

app.delete("/api/agent-config/:id/:type/:rowId", authenticateUser, async (req: any, res: any) => {
    try {
      const { type, rowId } = req.params;
      const userId = req.user.id;
      if (type === 'directive') await db.from('wireline_directives').delete().eq('id', rowId).eq('user_id', userId);
      if (type === 'knowledge') await db.from('wireline_knowledge').delete().eq('id', rowId).eq('user_id', userId);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: "Failed to delete" });
    }
 });

// ==========================================
// 1.8 SETTINGS & OUTBOUND DIALER ENDPOINTS
// ==========================================
app.get("/api/settings", authenticateUser, async (req: any, res: any) => {
  try {
    const { data } = await db.from('wireline_settings').select('id, user_id, subscription_status, max_agents, vapi_phone_number_id, updated_at').eq('user_id', req.user.id).maybeSingle();
    res.json(data || {});
  } catch (error) {
    res.json({});
  }
});

app.post("/api/settings", authenticateUser, async (req: any, res: any) => {
  try {
    const { vapi_phone_number_id, subscription_status, max_agents } = req.body;
    const parsedMaxAgents = Number.parseInt(String(max_agents ?? 3), 10);
    await db.from('wireline_settings').upsert({
      id: req.user.id,
      user_id: req.user.id,
      vapi_phone_number_id: typeof vapi_phone_number_id === "string" ? vapi_phone_number_id.trim() : null,
      subscription_status: typeof subscription_status === "string" && subscription_status.trim() ? subscription_status.trim() : 'active',
      max_agents: Number.isFinite(parsedMaxAgents) ? Math.min(Math.max(parsedMaxAgents, 1), 100) : 3,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save settings" });
  }
});

app.get("/api/outbound", authenticateUser, async (req: any, res: any) => {
  try {
    const { data } = await db.from('wireline_outbound_leads').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    res.json({ leads: data || [] });
  } catch (error) {
    res.json({ leads: [] });
  }
});

app.post("/api/outbound/dial", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, customerName, customerNumber, context } = req.body;
    if (typeof agentId !== "string" || !agentId.trim()) {
      return res.status(400).json({ error: "A valid agentId is required." });
    }
    const normalizedCustomerNumber = normalizePhoneNumber(customerNumber);
    if (!normalizedCustomerNumber) {
      return res.status(400).json({ error: "A valid E.164-style customerNumber is required." });
    }
    
    // 0. SECURITY ENFORCEMENT: Check Subscription Status
    const { data: userSettings } = await db.from('wireline_settings').select('*').eq('user_id', req.user.id).single();
    const subscriptionStatus = userSettings?.subscription_status || 'active';
    if (subscriptionStatus !== 'active') {
       return res.status(403).json({ error: "Access Denied: Please upgrade your billing plan to access outbound dialing." });
    }

    // 1. Fetch settings (we need Phone ID and use env for API key)
    const settings = userSettings;
    const vapiSecret = process.env.VAPI_PRIVATE_KEY;
    
    if (!vapiSecret || !settings?.vapi_phone_number_id) {
       return res.status(400).json({ error: "Platform Error: Master telecom carrier not configured. Please ensure VAPI_PRIVATE_KEY is set in environment secrets." });
    }

    // 2. Fetch agent config
    const [agentConfig, directivesData, knowledgeData, personalityData] = await Promise.all([
      db.from('wireline_agents').select('*').eq('id', agentId).eq('user_id', req.user.id).single().then(r => r),
      db.from('wireline_directives').select('content, priority').eq('agent_id', agentId).eq('user_id', req.user.id).order('priority', { ascending: false }).then(r => r),
      db.from('wireline_knowledge').select('content').eq('agent_id', agentId).eq('user_id', req.user.id).then(r => r),
      db.from('wireline_personality').select('content').eq('agent_id', agentId).eq('user_id', req.user.id).single().then(r => r)
    ]);
    if (!agentConfig?.data) {
      return res.status(404).json({ error: "Agent not found." });
    }

    const currentDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    
    // Determine Archetype Behavior
    const archetype = agentConfig?.data?.archetype || 'Receptionist';
    let archetypeRules = "";
    let llmTemp = 0.4;
    
    switch(archetype) {
       case 'The Closer':
          archetypeRules = "You are a high-stakes closer. Use a confident tone. If a lead hesitates, offer a limited-time incentive to book now.";
          llmTemp = 0.7;
          break;
       case 'Support Tech':
          archetypeRules = "You are highly analytical, patient, and precise. You ask clarifying troubleshooting questions one at a time. You do not rush.";
          llmTemp = 0.2;
          break;
       case 'The Empath':
          archetypeRules = "If a caller sounds frustrated, your first words must be a validating statement like 'I completely hear you, that's incredibly stressful. Let me fix this for you.'";
          llmTemp = 0.6;
          break;
       default: // Receptionist
          archetypeRules = "You are an expert at handling phone calls where people are often in a hurry. Never use platitudes like 'I hope you're having a wonderful day.' Get straight to the value. You are cheerful, polite, and highly efficient.";
          llmTemp = 0.4;
    }

    const ambientNoiseActive = agentConfig?.data?.ambient_noise && agentConfig?.data?.ambient_noise !== 'off';

    const systemPrompt = `
    ## BLOCK 1: IDENTITY & ARCHETYPE (THE "MOAT")
    Persona: You are ${agentConfig?.data?.name || "a scheduling agent"}, a representative for our company.
    Tone: Snappy, concise, low-friction.
    The "Secret Sauce": ${archetypeRules}
    Base Personality: ${personalityData?.data?.content || "You are a professional, helpful assistant."}
    ${ambientNoiseActive ? "Ambient Realism: You are working in a busy location. Speak with a slight sense of professional urgency." : ""}

    ## CRITICAL OUTBOUND MISSION CONTEXT
    You are making an OUTBOUND call to a customer named ${customerName || "a customer"}.
    Outbound Call Context / Objective: ${context || "Just checking in on them."}
    You must address this objective naturally during the conversation.

    ## BLOCK 2: TEMPORAL & CONTEXTUAL ANCHORS
    You unmistakably know that today is ${currentDateTime} (Eastern Time). If a customer asks for "tomorrow" or "next week", calculate the date silently and confirm it back to them.

    ## BLOCK 3: CONVERSATIONAL LOOP & GUARDRAILS
    Response Length: Keep every response under 20 words unless explaining a complex process. Long AI monologues feel like robots.
    The "Anti-Echo" Rule: Do not repeat back what the user just said.
    Question Limit: Never ask more than one question at a time.
    Number Formatting: Spell out important numbers if they sound robotic (e.g., "Two zero two" instead of "Two hundred and two").

    ## BLOCK 4: TOOL EXECUTION LOGIC & PROTOCOLS
    Escalation Transfer Rule: If a user asks for a "real person" twice, or asks to transfer, immediately inform them you are transferring them and use the tools.

    ## ABSOLUTE RULES
    ${(directivesData?.data || []).map((d: any) => `[PRIORITY ${d.priority}] ${d.content}`).join('\n')}
    
    ## KNOWLEDGE BASE
    ${(knowledgeData?.data || []).map((k: any) => `- ${k.content}`).join('\n')}
    `;

    // 3. Assemble Vapi REST Call Payload
    const vapiPayload = {
      phoneNumberId: settings.vapi_phone_number_id,
      customer: {
        number: normalizedCustomerNumber
      },
      assistant: {
        name: agentConfig?.data?.name || "Wireline Outbound Agent",
        firstMessage: `Hi ${customerName ? customerName : 'there'}, this is ${agentConfig?.data?.name || 'calling from Wireline'}. ${context}`,
        backgroundSound: agentConfig?.data?.ambient_noise || 'off',
        model: {
          provider: "google",
          model: "gemini-2.0-flash",
          systemPrompt: systemPrompt,
          temperature: llmTemp
        },
        recordingEnabled: true,
        voice: {
          provider: agentConfig?.data?.voice_provider || "11labs",
          voiceId: agentConfig?.data?.voice_id || "bIHbv24MWmeRgasZH58o"
        }
      }
    };

    // 4. Dispatch Call to Vapi
    const vapiResponse = await fetch("https://api.vapi.ai/call/phone", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${vapiSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(vapiPayload)
    });

    if (!vapiResponse.ok) {
       const errBody = await vapiResponse.text();
       throw new Error(`Vapi API Error: ${errBody}`);
    }

    const vapiData = await vapiResponse.json();

    // 5. Store Lead generated in Supabase
    await db.from('wireline_outbound_leads').insert({
       user_id: req.user.id,
       agent_id: agentId,
       customer_name: typeof customerName === "string" ? customerName.trim() : null,
       customer_number: normalizedCustomerNumber,
       context: typeof context === "string" ? context.trim().slice(0, 1000) : null,
       call_id: vapiData.id,
       status: "Dialing"
    });

    res.json({ success: true, callId: vapiData.id });
  } catch (error: any) {
    console.error("Outbound call failed:", error);
    res.status(500).json({ error: error.message || "Failed to dispatch call." });
  }
});

app.post("/api/outbound/bulk", authenticateUser, async (req: any, res: any) => {
  try {
      const { leads } = req.body;
      if (!Array.isArray(leads) || !leads.length) return res.status(400).json({ error: "No leads provided" });

      // SECURITY ENFORCEMENT
      const { data: userSettings } = await db.from('wireline_settings').select('subscription_status').eq('user_id', req.user.id).single();
      if ((userSettings?.subscription_status || 'active') !== 'active') {
         return res.status(403).json({ error: "Access Denied: Inactive billing plan." });
      }

      const sanitizedLeads = leads.map((lead: any) => {
        const normalizedNumber = normalizePhoneNumber(lead?.customer_number);
        if (!normalizedNumber) {
          return null;
        }
        return {
          user_id: req.user.id,
          agent_id: typeof lead?.agent_id === "string" ? lead.agent_id : null,
          customer_name: typeof lead?.customer_name === "string" ? lead.customer_name.trim() : null,
          customer_number: normalizedNumber,
          context: typeof lead?.context === "string" ? lead.context.trim().slice(0, 1000) : null,
          status: typeof lead?.status === "string" && lead.status.trim() ? lead.status.trim() : "Queued",
        };
      }).filter(Boolean);

      if (!sanitizedLeads.length) {
        return res.status(400).json({ error: "No valid leads provided." });
      }

      const uniqueAgentIds = [...new Set(sanitizedLeads.map((lead: any) => lead.agent_id).filter(Boolean))];
      if (uniqueAgentIds.length) {
        const { data: ownedAgents } = await db.from('wireline_agents').select('id').eq('user_id', req.user.id).in('id', uniqueAgentIds);
        const ownedAgentIds = new Set((ownedAgents || []).map((ownedAgent) => ownedAgent.id));
        if (uniqueAgentIds.some((agentId) => !ownedAgentIds.has(agentId))) {
          return res.status(403).json({ error: "One or more leads reference an agent you do not own." });
        }
      }

      const { data, error } = await db.from('wireline_outbound_leads').insert(sanitizedLeads).select('id');
      if (error) throw error;
      
      res.json({ success: true, inserted: data.length });
  } catch (error: any) {
     res.status(500).json({ error: "Failed to queue leads" });
  }
});

// ==========================================
// 2. AGENT TRAINING ENDPOINT (ADMIN AI)
// ==========================================
app.post("/api/train", authenticateUser, async (req: any, res: any) => {
  const { userMessage, agentId = "default-agent" } = req.body;
  
  try {
    const { data: agent } = await db.from('wireline_agents').select('id').eq('id', agentId).eq('user_id', req.user.id).single();
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const prompt = `
    You are the Wireline Configuration Engine. The business owner is training their AI fleet.
    Current Training Target: ${agentId}
    User Message: "${userMessage}"

    Task: Extract any new instructions, rules, or knowledge. 
    Categorize them as:
    - DIRECTIVE: A hard rule the agent must follow (e.g. "Never give out personal cell numbers").
    - KNOWLEDGE: A fact about the business (e.g. "We are closed on Sundays").
    - PERSONALITY: A request regarding tone or style (e.g. "Be more enthusiastic and upbeat").

    Respond ONLY in strict, valid JSON format, without markdown wrapping:
    {
      "directives": [{"content": "...", "priority": 5}],
      "knowledge": [{"content": "..."}],
      "personality": "..."
    }
    `;

    const response = await getGeminiClient().models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsed = JSON.parse(response.text || "{}");

    // Atomic update to Supabase
    if (parsed.directives && parsed.directives.length) {
      await db.from('wireline_directives').insert(
        parsed.directives.map((d: any) => ({ ...d, agent_id: agentId, user_id: req.user.id }))
      );
    }
    if (parsed.knowledge && parsed.knowledge.length) {
      await db.from('wireline_knowledge').insert(
        parsed.knowledge.map((k: any) => ({ ...k, agent_id: agentId, user_id: req.user.id }))
      );
    }
    if (parsed.personality) {
      // Upsert personality
      await db.from('wireline_personality').upsert({ agent_id: agentId, content: parsed.personality, user_id: req.user.id });
    }

    res.json({ success: true, extracted: parsed });
  } catch (error) {
    console.error("Training error:", error);
    res.status(500).json({ error: "Failed to process training" });
  }
});


// ==========================================
// Google Workspace OAuth Endpoints
// ==========================================

app.get('/api/oauth/google/url', rateLimit(10, 10 * 60 * 1000), authenticateUser, (req: any, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
     return res.status(500).json({ error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables." });
  }

  const oauth2Client = getGoogleOAuthClient(req);
  const state = createOAuthState(req.user.id, req.get("origin") || getConfiguredBaseUrl(req));
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Forces consent screen to always get a refresh token
    state,
  });
  
  res.json({ url: authUrl });
});

app.get(['/api/oauth/google/callback', '/api/oauth/google/callback/'], rateLimit(20, 10 * 60 * 1000), async (req, res) => {
  const { code, state } = req.query;
  
  if (!code || typeof code !== 'string') {
    return res.status(400).send("No code provided by Google.");
  }
  if (!state || typeof state !== "string") {
    return res.status(400).send("Missing OAuth state.");
  }

  const verifiedState = verifyOAuthState(state);
  if (!verifiedState) {
    return res.status(400).send("Invalid or expired OAuth state.");
  }

  try {
    const oauth2Client = getGoogleOAuthClient(req);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user info to get email address
    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const userInfo = await oauth2.userinfo.get();
    const emailAddress = userInfo.data.email;

    if (!emailAddress) throw new Error("Could not fetch user email.");

    // Store in Supabase
    await db.from('wireline_email_accounts').upsert({
      user_id: verifiedState.userId,
      email: emailAddress,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiry_date
    }, { onConflict: 'email' });

    // Send success to popup
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, window.location.origin);
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("OAuth Callback Error:", error);
    res.status(500).send("Authentication failed.");
  }
});

// Get connected accounts
app.get("/api/emails/accounts", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: accounts, error } = await db.from('wireline_email_accounts')
                                               .select('*')
                                               .eq('user_id', req.user.id)
                                               .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ accounts: accounts || [] });
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

app.patch("/api/emails/accounts/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { agent_id } = req.body;
    await db.from('wireline_email_accounts').update({ agent_id }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update account mapping" });
  }
});

app.delete("/api/emails/accounts/:id", authenticateUser, async (req: any, res: any) => {
  try {
    await db.from('wireline_email_accounts').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});


// ==========================================
// 2.3 EMAIL THREAD & SYNC ENDPOINTS
// ==========================================

app.get("/api/emails/threads", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: threads, error } = await db.from('wireline_email_threads')
                                           .select('*')
                                           .eq('user_id', req.user.id)
                                           .order('last_message_at', { ascending: false });
    if (error) throw error;
    res.json({ threads: threads || [] });
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch threads" });
  }
});

app.get("/api/emails/threads/:id/messages", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: messages, error } = await db.from('wireline_email_messages')
                                             .select('*')
                                             .eq('thread_id', req.params.id)
                                             .eq('user_id', req.user.id)
                                             .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ messages: messages || [] });
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// The "AI Intelligence" Sync
app.post("/api/emails/sync", authenticateUser, async (req: any, res: any) => {
  try {
     const userId = req.user.id;
     // 1. Fetch connected accounts
     const { data: accounts } = await db.from('wireline_email_accounts').select('*').eq('user_id', userId);
     if (!accounts || accounts.length === 0) return res.json({ success: true, count: 0 });

     // Fleet Synchronization
     const { data: agent } = await db.from('wireline_agents').select('*').eq('user_id', userId).limit(1).single();

     let totalNew = 0;

     for (const account of accounts) {
        // Fetch agent for this specific account
        let activeAgent = agent;
        if (account.agent_id) {
          const { data: specificAgent } = await db.from('wireline_agents').select('*').eq('id', account.agent_id).single();
          if (specificAgent) activeAgent = specificAgent;
        }

        const oauth2Client = getGoogleOAuthClient(req);
        oauth2Client.setCredentials({
           access_token: account.access_token,
           refresh_token: account.refresh_token,
           expiry_date: account.expires_at
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        
        // Fetch unread messages
        const gmailRes = await gmail.users.messages.list({
           userId: 'me',
           q: 'is:unread',
           maxResults: 5
        });

        const messages = gmailRes.data.messages || [];
        
        for (const msg of messages) {
           const msgData = await gmail.users.messages.get({ userId: 'me', id: msg.id! });
           const headers = msgData.data.payload?.headers || [];
           const subject = headers.find(h => h.name === 'Subject')?.value || "No Subject";
           const from = headers.find(h => h.name === 'From')?.value || "";
           const threadId = msgData.data.threadId!;
           
           // Extract snippet or body
           const snippet = msgData.data.snippet || "";
           
           // Check if thread exists in DB
            let { data: existingThread } = await db.from('wireline_email_threads').select('*').eq('thread_id', threadId).eq('user_id', userId).single();
           
            if (!existingThread) {
               const { data: newThread } = await db.from('wireline_email_threads').insert({
                  user_id: userId,
                  account_id: account.id,
                  thread_id: threadId,
                  customer_email: from,
                 subject: subject,
                 status: 'pending_ai'
              }).select('*').single();
              existingThread = newThread;
           }

            // Check if message exists in DB
            const { data: existingMsg } = await db.from('wireline_email_messages').select('*').eq('google_message_id', msg.id!).eq('user_id', userId).single();
            if (existingMsg) continue;

           totalNew++;

            // Save the customer message
            await db.from('wireline_email_messages').insert({
               user_id: userId,
               thread_id: existingThread!.id,
               google_message_id: msg.id!,
               role: 'customer',
              content: snippet
           });

           // mark as read in Gmail (optional, but good for sync)
           await gmail.users.messages.modify({
              userId: 'me',
              id: msg.id!,
              requestBody: { removeLabelIds: ['UNREAD'] }
           });

           // 3. GENERATE AI RESPONSE (Sales/CS focus)
           // Grounded in agent's context
           const prompt = `
             ## BLOCK 1: IDENTITY & ARCHETYPE
             Persona: You are the AI Email Agent for our company.
             Tone: ${activeAgent?.email_agent_tone || 'Professional'}. Concise and helpful.
             Personality: ${activeAgent?.archetype || 'Receptionist'}.
             Company Site: ${activeAgent?.website_url || 'Home Services Platform'}.
             Signature: ${activeAgent?.email_signature || 'The Wireline Team'}.

             ## BLOCK 2: CONTEXT
             INCOMING EMAIL FROM: ${from}
             SUBJECT: ${subject}
             CONTENT: ${snippet}

             ## BLOCK 3: CONVERSATIONAL LOOP & GUARDRAILS
             Response Length: Keep it professional and concise. Do not write a novel.
             Goal: Write a Sales or Customer Service response.
             - If they are asking for a callback, acknowledge and tell them a representative will call them soon.
             - If they want an appointment, provide basic info and ask them to call or utilize the website.
             - Do not repeat their entire message back to them. Get straight to the value.

             ## KNOWLEDGE BASE
             ${activeAgent?.knowledge ? activeAgent.knowledge.map((k: any) => `- ${k.content}`).join('\n') : "Rely on standard professional knowledge."}

             RESPONSE:
           `;

            const aiRes = await getGeminiClient().models.generateContent({
               model: "gemini-3-flash-preview",
               contents: prompt
            });
           const aiText = aiRes.text || "I've received your email and will follow up shortly.";
           const finalReply = activeAgent?.email_signature ? `${aiText}\n\n${activeAgent.email_signature}` : aiText;

            // Save the AI message (as a draft in our DB)
            await db.from('wireline_email_messages').insert({
               user_id: userId,
               thread_id: existingThread!.id,
               role: 'ai',
               content: finalReply
           });

           // 4. AUTONOMOUS AUTO-RESPOND (If enabled)
           if (activeAgent?.email_auto_respond) {
               try {
                  const toEmail = from.includes('<') ? from.split('<')[1].split('>')[0] : from;
                  const raw = Buffer.from(
                     `To: ${toEmail}\r\n` +
                     `Subject: Re: ${subject}\r\n` +
                     `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
                     `${finalReply}`
                  ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

                  await gmail.users.messages.send({
                     userId: 'me',
                     requestBody: { raw, threadId }
                  });
               } catch (sendErr) {
                  console.error("Auto-respond failed:", sendErr);
               }
           }

           // 5. OMNICHANNEL TASK ROUTING (EMAIL -> PHONE)
           const lowerSnippet = snippet.toLowerCase();
           if (lowerSnippet.includes('call') || lowerSnippet.includes('phone') || lowerSnippet.includes('callback') || lowerSnippet.includes('number')) {
              try {
                  await db.from('wireline_fleet_tasks').insert({
                     user_id: userId,
                     source_type: 'email_thread',
                     source_id: threadId,
                     target_channel: 'phone',
                    agent_id: activeAgent?.id || null,
                    customer_info: { email: from, subject: subject },
                    task_type: 'callback_required',
                    description: `Lead requested callback via email mailroom. Lead Contact: ${from}`,
                    status: 'pending'
                 });
              } catch(handoffErr) {
                 console.error("Email-to-Phone handoff failed:", handoffErr);
              }
           }

           // Update thread summary & status
           await db.from('wireline_email_threads').update({
              summary: snippet.substring(0, 100),
              last_message_at: new Date(),
              status: 'open'
           }).eq('id', existingThread!.id);

           // AI LEAD SCORING FOR EMAIL
           try {
              const emailScoringPrompt = `
                Analyze this email and give a BUSINESS INTENT score (0-100) and CATEGORY ('high', 'medium', 'low', 'none').
                Subject: ${subject}
                Body: ${snippet}
                RESPONSE FORMAT (JSON): { "score": number, "label": string }
              `;
              const sRes = await getGeminiClient().models.generateContent({
                model: "gemini-3-flash-preview",
                contents: emailScoringPrompt,
                config: { responseMimeType: "application/json" }
              });
              const sObj = JSON.parse(sRes.text || "{}");
              await db.from('wireline_email_threads').update({
                 lead_score: sObj.score || 0,
                 intent_label: sObj.label || 'none'
              }).eq('id', existingThread!.id);
           } catch(e) {
              console.error("Email scoring failed:", e);
           }
        }
     }

     res.json({ success: true, synced: totalNew });
  } catch(e) {
     console.error("Sync Error:", e);
     res.status(500).json({ error: String(e) });
  }
});

app.post("/api/emails/threads/:id/reply", authenticateUser, async (req: any, res: any) => {
   try {
      const { body } = req.body;
      const { data: thread } = await db.from('wireline_email_threads').select('*, wireline_email_accounts(*)').eq('id', req.params.id).eq('user_id', req.user.id).single();
      
      if (!thread) throw new Error("Thread not found");

      const account = thread.wireline_email_accounts;
      const oauth2Client = getGoogleOAuthClient(req);
      oauth2Client.setCredentials({
         access_token: account.access_token,
         refresh_token: account.refresh_token,
         expiry_date: account.expires_at
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Send via Gmail
      const messageParts = [
        `To: ${thread.customer_email}`,
        `Subject: Re: ${thread.subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body
      ];
      const encodedMessage = Buffer.from(messageParts.join('\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId: thread.thread_id
        }
      });

      // Save to DB
      await db.from('wireline_email_messages').insert({
         user_id: req.user.id,
         thread_id: thread.id,
         role: 'ai',
         content: body
      });

      res.json({ success: true });
   } catch(e) {
      console.error("Reply Error:", e);
      res.status(500).json({ error: String(e) });
   }
});

// ==========================================
// 3. VITE MIDDLEWARE & STATIC SERVING
// ==========================================
async function startServer() {
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/ready", (_req, res) => {
    res.json({
      status: "ready",
      services: {
        database: "configured",
        gemini: geminiApiKey ? "configured" : "missing",
        googleOAuth: process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() ? "configured" : "missing",
        webhookSecret: process.env.WIRELINE_WEBHOOK_SECRET?.trim() ? "configured" : "missing",
      },
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();
