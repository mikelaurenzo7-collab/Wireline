import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize AI and DB
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Google Workspace OAuth Setup
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

function getGoogleOAuthClient(req: express.Request) {
   // According to oauth-integration skill, we determine the exact redirect URI based on the request origin or APP_URL.
   // But because we might be behind a proxy, trusting process.env.APP_URL is safest, but AI Studio passes it as a header or similar, or we can just infer from req.headers.referer if needed, but for OAuth callback absolute URL is needed.
   // Wait, oauth-integration says: use `process.env.APP_URL` or dynamically construct from req.headers.host but in container getting the external host is tricky.
   // Wait! `req.protocol + '://' + req.get('host')` might work if proxied correctly. Let's do that for now but fallback if missing.
   // "always use the APP_URL environment variable to get the URL of the container."
   const baseUrl = process.env.APP_URL || `https://${req.get('host')}`;
   return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${baseUrl}/api/oauth/google/callback`
   );
}

// Note: Backend uses Service Role for secure modifications across the DB if needed
const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://placeholder-url.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder-key";
const db = createClient(supabaseUrl, supabaseKey);

// ==========================================
// AUTH MIDDLEWARE
// ==========================================
async function authenticateUser(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
     return res.status(401).json({ error: "No authorization header provided" });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await db.auth.getUser(token);

  if (error || !user) {
     return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.user = user;
  next();
}

// ==========================================
// 1. API WEBHOOK (CARRIER CONNECTION) - NO AUTH (SYSTEM TO SYSTEM)
// ==========================================
app.post("/api/vapi-webhook", async (req, res) => {
  const payload = req.body;
  const { message } = payload;
  
  console.log("--- INCOMING VAPI WEBHOOK ---");
  
  // For webhooks, we need to know WHICH user this is for.
  // We'll extract agentId from query and fetch the agent and its user_id.
  const webhookAgentId = req.query.agentId as string || "default-agent";
  
  // 0. Fetch the agent's owner and their settings
  const { data: agent } = await db.from('wireline_agents').select('user_id').eq('id', webhookAgentId).single();
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const { data: userSettings } = await db.from('wireline_settings').select('subscription_status').eq('user_id', agent.user_id).single();
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
      const [agentConfig, directivesData, knowledgeData, personalityData, lessonsData] = await Promise.all([
        db.from('wireline_agents').select('*').eq('id', webhookAgentId).single(),
        db.from('wireline_directives').select('content, priority').eq('agent_id', webhookAgentId).order('priority', { ascending: false }),
        db.from('wireline_knowledge').select('content').eq('agent_id', webhookAgentId),
        db.from('wireline_personality').select('content').eq('agent_id', webhookAgentId).single(),
        db.from('wireline_agent_lessons').select('lesson').eq('agent_id', webhookAgentId).order('created_at', { ascending: false }).limit(3)
      ]);

      const lessons = (lessonsData?.data || []).map((l: any) => l.lesson).join('\n');


      // TEMPORAL AWARENESS: Inject exact current time so the agent knows what "Today" and "Tomorrow" mean
      const currentDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      // Determine Call Direction and Archetype Behavior
      const isOutbound = message.type === 'outboundPhoneCall' || message.call?.type === 'outboundPhoneCall';
      const customerNumber = message.call?.customer?.number;

      // 1.5. GET LEAD CONTEXT (OUTBOUND ONLY)
      let leadContext = "";
      if (isOutbound && customerNumber) {
         const { data: lead } = await db.from('wireline_outbound_leads')
            .select('context, customer_name')
            .eq('customer_number', customerNumber)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
         
         if (lead) {
            leadContext = `MISSION OBJECTIVE: You are calling ${lead.customer_name}. REASON FOR CALL: ${lead.context}`;
         }
      }

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
      
      ${leadContext ? `## CRITICAL: CURRENT MISSION CONTEXT\n${leadContext}` : ""}

      ${agentConfig?.data?.website_url ? `## KNOWLEDGE GROUNDING\nYour company's official website is: ${agentConfig.data.website_url}. If asked for more details or deep info not in your knowledge base, refer them back to the site.` : ""}
      
      ${lessons ? `## RECENT LESSONS LEARNED (IMPROVEMENTS)\nApply these tactical adjustments derived from your previous calls:\n${lessons}` : ""}

      ## HALLUCINATION GUARD & FALLBACK
      If a customer asks a question you do not have the answer to in the Knowledge Base below:
      1. ACKNOWLEDGE: "That's a great question, but I want to make sure I give you 100% accurate info."
      2. RESOLVE: "Let me have one of our senior specialists review that and get back to you. What's the best email to reach you at?"
      3. LOG: After getting the info, move on to the next part of the conversation. NEVER guess or make up prices, dates, or company policies.

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
          serverUrlSecret: "wireline-secret-key",
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
    
    // Fetch agent config once for all tools in this call
    const { data: agent } = await db.from('wireline_agents').select('*').eq('id', webhookAgentId).single();

    const results = [];
    
    for (const toolCall of message.toolCalls) {
      
      // TOOL 1: CHECK AVAILABILITY
      if (toolCall.function.name === "check_calendar_availability") {
         try {
            const { date } = toolCall.function.arguments;
            const { data, error } = await db.from('wireline_appointments').select('time, service_type').ilike('date', `%${date}%`);
            
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
           
           // Fetch the first connected valid email account
           const { data: accounts } = await db.from('wireline_email_accounts').select('*').limit(1);
           
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
           await db.from('wireline_fleet_tasks').update({ status: 'completed' }).eq('id', task.id);

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
  
  // REAL-TIME SIGNAL TRACKING
  if (message && message.type === "status-update") {
     const callId = payload.call?.id;
     // Note: Vapi status can be 'queued', 'ringing', 'in-progress', 'ended'
     const status = message.status || payload.call?.status;
     
     if (callId) {
        if (status === 'in-progress' || status === 'ringing' || status === 'queued') {
           await db.from('wireline_signal_presence').upsert({
              id: callId,
              user_id: agent?.user_id,
              agent_id: webhookAgentId,
              customer_number: payload.call?.customer?.number || "Unknown",
              status: status,
              started_at: new Date().toISOString()
           });
        } else if (status === 'ended' || status === 'completed') {
           await db.from('wireline_signal_presence').delete().eq('id', callId);
        }
     }
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
           const scoreRes = await genAI.models.generateContent({
             model: "gemini-3-flash-preview",
             contents: scoringPrompt,
             config: { responseMimeType: "application/json" }
           });
           const scoreObj = JSON.parse(scoreRes.text || "{}");
           await db.from('wireline_call_logs').update({
             lead_score: scoreObj.score || 0,
             intent_label: scoreObj.label || 'none'
           }).eq('vapi_call_id', call?.id);

           // SELF-OPTIMIZING LOOP: Generate Lessons Learned
           try {
              const lessonPrompt = `Identify exactly ONE tactical improvement for this agent. JSON ONLY: { "lesson": "string" }. Transcript: ${message.transcript}`;
              const lessonRes = await genAI.models.generateContent({
                 model: "gemini-2.0-flash",
                 contents: lessonPrompt,
                 config: { responseMimeType: "application/json" }
              });
              const lessonObj = JSON.parse(lessonRes.text || "{}");
              if (lessonObj.lesson) {
                 await db.from('wireline_agent_lessons').insert({
                    agent_id: webhookAgentId,
                    user_id: agent?.user_id,
                    lesson: lessonObj.lesson
                 });
              }
           } catch(e) {}
        } catch(scoringErr) {
           console.error("Call scoring failed:", scoringErr);
        }
        
        // If it was outbound, let's update the lead status
        if (call?.type === "outboundPhoneCall") {
           await db.from('wireline_outbound_leads')
             .update({ status: 'Completed' })
             .eq('call_id', call?.id);
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
    await db.from('wireline_agents').insert({
      id: id || `agent-${Date.now()}`,
      user_id: req.user.id,
      name: name || "New Agent",
      voice_id: voice_id || 'bIHbv24MWmeRgasZH58o',
      channel: channel || 'voice'
    });
    
    // Seed default personality
    await db.from('wireline_personality').insert({
       agent_id: id,
       user_id: req.user.id,
       content: channel === 'email' 
         ? "You are a professional email agent specialized in clear, efficient communication." 
         : "You are a helpful assistant serving as a phone agent."
    });
    
    res.json({ success: true, id });
  } catch (error) {
    console.error("Agent creation failed:", error);
    res.status(500).json({ error: "Failed to create agent" });
  }
});

app.post("/api/fleet/seed", authenticateUser, async (req: any, res: any) => {
  const userId = req.user.id;
  const specializedAgents = [
    {
      id: `billing-spec-${Date.now()}`,
      name: "Billing Specialist",
      channel: "voice",
      archetype: "The Collector",
      first_message: "Hello, this is the billing department. I'm calling regarding your recent account inquiry. How can I assist you with your statement today?",
      personality: "Highly professional, secure, and methodical. You handle financial discussions with extreme care and follow all security protocols."
    },
    {
      id: `prospector-${Date.now()}`,
      name: "Outbound Prospector",
      channel: "voice",
      archetype: "The Closer",
      first_message: "Hi there! I'm calling from the growth team. We saw you were interested in our services and I wanted to see if we could set up a quick strategy session?",
      personality: "Energetic, persuasive, and persistent. You are an expert at handling objections and turning a 'maybe' into a 'yes'."
    },
    {
      id: `growth-email-${Date.now()}`,
      name: "Growth Coordinator",
      channel: "email",
      archetype: "Receptionist",
      email_agent_tone: "Friendly",
      email_signature: "The Growth Team",
      personality: "You focus on marketing and expansion. Your emails are engaging, clear, and always include a strong call to action."
    },
    {
      id: `tech-support-${Date.now()}`,
      name: "Tier 2 Technical Lead",
      channel: "voice",
      archetype: "Support Tech",
      first_message: "Wireline Technical Support, this is the Tier 2 lead speaking. I understand you're having a complex issue. Let's get this resolved. What symptoms are you seeing?",
      personality: "Deeply technical, calm, and highly analytical. You solve problems by breaking them down into logical steps."
    }
  ];

  try {
    for (const agent of specializedAgents) {
      await db.from('wireline_agents').insert({
        id: agent.id,
        user_id: userId,
        name: agent.name,
        channel: agent.channel,
        archetype: agent.archetype,
        first_message: agent.first_message,
        email_agent_tone: agent.email_agent_tone,
        email_signature: agent.email_signature
      });

      await db.from('wireline_personality').insert({
        agent_id: agent.id,
        user_id: userId,
        content: agent.personality
      });
      
      // Add a default directive for each
      await db.from('wireline_directives').insert({
        agent_id: agent.id,
        user_id: userId,
        content: "Always verify the customer's identity before discussing account details.",
        priority: 10
      });
    }
    res.json({ success: true, count: specializedAgents.length });
  } catch (error) {
    console.error("Fleet seeding failed:", error);
    res.status(500).json({ error: "Failed to seed fleet" });
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

app.get("/api/fleet/presence", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from('wireline_signal_presence')
      .select('*')
      .eq('user_id', req.user.id);
    
    if (error) throw error;
    res.json({ signals: data || [] });
  } catch (error) {
    res.json({ signals: [] });
  }
});
app.get("/api/fleet/tasks", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from('wireline_fleet_tasks')
                                     .select('*, wireline_agents(name)')
                                     .eq('user_id', req.user.id);
    
    if (error) throw error;

    // Sort in memory for accurate business logic priority order: High > Medium > Low
    const sortedTasks = (data || []).sort((a: any, b: any) => {
      // 1. Completion status (unprocessed first)
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;

      // 2. Priority weight
      const priorityWeight: Record<string, number> = { 'high': 3, 'medium': 2, 'low': 1 };
      const weightA = priorityWeight[a.priority?.toLowerCase()] || 0;
      const weightB = priorityWeight[b.priority?.toLowerCase()] || 0;
      
      if (weightA !== weightB) return weightB - weightA;

      // 3. Due Date (earlier first)
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      if (a.due_date) return -1;
      if (b.due_date) return 1;

      // 4. Default: Newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    res.json({ tasks: sortedTasks });
  } catch (error) {
    console.error("Fetch tasks failed:", error);
    res.status(500).json({ error: "Failed to fetch fleet tasks" });
  }
});

app.post("/api/fleet/tasks", authenticateUser, async (req: any, res: any) => {
  try {
    const { source_type, source_id, target_channel, customer_info, task_type, description, agent_id, priority, due_date } = req.body;
    await db.from('wireline_fleet_tasks').insert({
       source_type, source_id, target_channel, customer_info, task_type, description, agent_id, status: 'pending', user_id: req.user.id, priority: priority || 'medium', due_date
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to create fleet task" });
  }
});

app.patch("/api/fleet/tasks/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { status, priority, due_date, agent_id } = req.body;
    const updateData: any = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (agent_id !== undefined) updateData.agent_id = agent_id;
    
    await db.from('wireline_fleet_tasks').update(updateData).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update fleet task" });
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
app.get("/api/settings", async (req, res) => {
  try {
    const { data } = await db.from('wireline_settings').select('*').eq('id', 'global').single();
    if (data) {
       delete data.vapi_private_key; // Never send secret to client
    }
    res.json(data || {});
  } catch (error) {
    res.json({});
  }
});

app.post("/api/settings", async (req, res) => {
  try {
    const { vapi_phone_number_id, subscription_status, max_agents } = req.body;
    await db.from('wireline_settings').upsert({
      id: 'global',
      vapi_phone_number_id,
      subscription_status,
      max_agents,
      updated_at: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save settings" });
  }
});

app.get("/api/outbound", async (req, res) => {
  try {
    const { data } = await db.from('wireline_outbound_leads').select('*').order('created_at', { ascending: false });
    res.json({ leads: data || [] });
  } catch (error) {
    res.json({ leads: [] });
  }
});

app.post("/api/outbound/dial", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, customerName, customerNumber, context } = req.body;
    
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
      db.from('wireline_agents').select('*').eq('id', agentId).single().then(r => r),
      db.from('wireline_directives').select('content, priority').eq('agent_id', agentId).order('priority', { ascending: false }).then(r => r),
      db.from('wireline_knowledge').select('content').eq('agent_id', agentId).then(r => r),
      db.from('wireline_personality').select('content').eq('agent_id', agentId).single().then(r => r)
    ]);

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
        number: customerNumber
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
       agent_id: agentId,
       customer_name: customerName,
       customer_number: customerNumber,
       context: context,
       call_id: vapiData.id,
       status: "Dialing"
    });

    res.json({ success: true, callId: vapiData.id });
  } catch (error: any) {
    console.error("Outbound call failed:", error);
    res.status(500).json({ error: error.message || "Failed to dispatch call." });
  }
});

app.post("/api/outbound/bulk", async (req, res) => {
  try {
     const { leads } = req.body;
     if (!leads || !leads.length) return res.status(400).json({ error: "No leads provided" });

     // SECURITY ENFORCEMENT
     const { data: globalSettings } = await db.from('wireline_settings').select('subscription_status').eq('id', 'global').single();
     if (globalSettings?.subscription_status !== 'active') {
        return res.status(403).json({ error: "Access Denied: Inactive billing plan." });
     }

     const { data, error } = await db.from('wireline_outbound_leads').insert(leads).select('id');
     if (error) throw error;
     
     res.json({ success: true, inserted: data.length });
  } catch (error: any) {
     res.status(500).json({ error: "Failed to queue leads" });
  }
});

// ==========================================
// 2. AGENT TRAINING ENDPOINT (SAVE EXTRACTED DATA)
// ==========================================
app.post("/api/train/save", authenticateUser, async (req: any, res: any) => {
  const { extracted, agentId = "default-agent" } = req.body;
  const userId = req.user.id;
  
  try {
    const parsed = extracted || {};

    // Atomic update to Supabase with user_id enforcement
    if (parsed.directives && parsed.directives.length) {
      await db.from('wireline_directives').insert(
        parsed.directives.map((d: any) => ({ ...d, agent_id: agentId, user_id: userId }))
      );
    }
    if (parsed.knowledge && parsed.knowledge.length) {
      await db.from('wireline_knowledge').insert(
        parsed.knowledge.map((k: any) => ({ ...k, agent_id: agentId, user_id: userId }))
      );
    }
    if (parsed.personality) {
      // Upsert personality with user_id enforcement
      await db.from('wireline_personality').upsert({ 
        agent_id: agentId, 
        user_id: userId,
        content: parsed.personality,
        updated_at: new Date().toISOString()
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Training save error:", error);
    res.status(500).json({ error: "Failed to save intelligence patterns" });
  }
});


// ==========================================
// Google Workspace OAuth Endpoints
// ==========================================

app.get('/api/oauth/google/url', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
     return res.status(500).json({ error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables." });
  }

  const oauth2Client = getGoogleOAuthClient(req);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Forces consent screen to always get a refresh token
  });
  
  res.json({ url: authUrl });
});

app.get(['/api/oauth/google/callback', '/api/oauth/google/callback/'], async (req, res) => {
  const { code } = req.query;
  
  if (!code || typeof code !== 'string') {
    return res.status(400).send("No code provided by Google.");
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
    await db.from('wireline_email_accounts').insert({
      email_address: emailAddress,
      provider: 'google',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiry_date
    });

    // Send success to popup
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', email: '${emailAddress}' }, '*');
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
    res.status(500).send("Authentication failed. " + String(error));
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
           let { data: existingThread } = await db.from('wireline_email_threads').select('*').eq('thread_id', threadId).single();
           
           if (!existingThread) {
              const { data: newThread } = await db.from('wireline_email_threads').insert({
                 account_id: account.id,
                 thread_id: threadId,
                 customer_email: from,
                 subject: subject,
                 status: 'pending_ai'
              }).select('*').single();
              existingThread = newThread;
           }

           // Check if message exists in DB
           const { data: existingMsg } = await db.from('wireline_email_messages').select('*').eq('google_message_id', msg.id!).single();
           if (existingMsg) continue;

           totalNew++;

           // Save the customer message
           await db.from('wireline_email_messages').insert({
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

           const aiRes = await genAI.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: prompt
           });
           const aiText = aiRes.text || "I've received your email and will follow up shortly.";
           const finalReply = activeAgent?.email_signature ? `${aiText}\n\n${activeAgent.email_signature}` : aiText;

           // Save the AI message (as a draft in our DB)
           await db.from('wireline_email_messages').insert({
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
              const sRes = await genAI.models.generateContent({
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
