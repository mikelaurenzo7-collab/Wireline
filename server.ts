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
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

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
// 1. VAPI WEBHOOK (TELEPHONY BRIDGE)
// ==========================================
app.post("/api/vapi-webhook", async (req, res) => {
  const payload = req.body;
  const { message } = payload;
  
  console.log("--- INCOMING VAPI WEBHOOK ---");
  console.log("Message Type:", message?.type);
  
  // Try to pull agent ID from query params (e.g. ?agentId=support-bot) or default 
  const webhookAgentId = req.query.agentId as string || "default-agent";
  
  // Vapi calls this prior to connecting the agent
  if (message && message.type === "assistant-request") {
    console.log("Assistant request received for Agent ID:", webhookAgentId);

    try {
      // 1. Assemble memory from Supabase
      const [agentConfig, directivesData, knowledgeData, personalityData] = await Promise.all([
        db.from('wireline_agents').select('*').eq('id', webhookAgentId).single().then(r => r),
        db.from('wireline_directives').select('content, priority').eq('agent_id', webhookAgentId).order('priority', { ascending: false }).then(r => r),
        db.from('wireline_knowledge').select('content').eq('agent_id', webhookAgentId).then(r => r),
        db.from('wireline_personality').select('content').eq('agent_id', webhookAgentId).single().then(r => r)
      ]);

      // TEMPORAL AWARENESS: Inject exact current time so the agent knows what "Today" and "Tomorrow" mean
      const currentDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      // Determine Archetype Behavior
      const archetype = agentConfig?.data?.archetype || 'Receptionist';
      let archetypeRules = "";
      let llmTemp = 0.4;
      
      switch(archetype) {
         case 'The Closer':
            archetypeRules = "You are highly persuasive, confident, and goal-oriented. You smoothly overcome objections and always try to guide the conversation toward booking an appointment or clarifying the sale.";
            llmTemp = 0.7;
            break;
         case 'Support Tech':
            archetypeRules = "You are highly analytical, patient, and precise. You ask clarifying troubleshooting questions one at a time. You do not rush.";
            llmTemp = 0.2;
            break;
         case 'The Empath':
            archetypeRules = "You are warm, highly agreeable, and sympathetic. You validate the caller's concerns frequently (e.g. 'I completely understand why that's frustrating').";
            llmTemp = 0.6;
            break;
         default: // Receptionist
            archetypeRules = "You are cheerful, polite, and highly efficient. You keep the conversation moving and focus on gathering the necessary information quickly.";
            llmTemp = 0.4;
      }

      const systemPrompt = `
      # CORE IDENTITY & ARCHETYPE: ${archetype}
      ${archetypeRules}
      ${personalityData?.data?.content || "You are a professional, helpful Wireline assistant for a Home Services company."}

      ${agentConfig?.data?.website_url ? `# KNOWLEDGE GROUNDING\nYour company's official website is: ${agentConfig.data.website_url}. If asked for more details or deep info not in your knowledge base, refer them back to the site.` : ""}

      # CROSS-CHANNEL HANDOFF (OMNICHANNEL)
      If a customer needs a detailed follow-up, a reminder, or a document sent that you cannot speak entirely over the phone, use the 'send_email' tool. 
      This 'passes the task' to our AI Email Hub where they can continue the conversation via text. 
      Tell the caller: 'I'll hand this over to our email team to send you that info right now.'

      # TEMPORAL CONTEXT (CRITICAL)
      The current live date and time is: ${currentDateTime} (Eastern Time).
      Always use this exact date as your anchor point when a customer says "tomorrow", "next week", etc.
      
      # ABSOLUTE RULES
      ${(directivesData?.data || []).map((d: any) => `[PRIORITY ${d.priority}] ${d.content}`).join('\n')}
      
      # KNOWLEDGE BASE
      ${(knowledgeData?.data || []).map((k: any) => `- ${k.content}`).join('\n')}
      
      # MISSION
      Your goal is to be incredibly efficient, polite, and helpful. You are powered by Gemini. Respond quickly and concisely to avoid dead-air pauses.
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
            provider: agentConfig?.data?.voice_provider || "11labs",
            voiceId: agentConfig?.data?.voice_id || "bIHbv24MWmeRgasZH58o" // Configurable Voice
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
             model: { provider: "google", model: "gemini-2.0-flash", systemPrompt: "Apologize and hang up." }
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

      // TOOL 4: FLEET HANDOFF (PHONE -> EMAIL)
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
             model: "gemini-2.0-flash",
             contents: [{ role: 'user', parts: [{ text: scoringPrompt }] }],
             config: { responseMimeType: "application/json" }
           });
           const scoreObj = JSON.parse(scoreRes.text || "{}");
           await db.from('wireline_call_logs').update({
             lead_score: scoreObj.score || 0,
             intent_label: scoreObj.label || 'none'
           }).eq('vapi_call_id', call?.id);
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
// 0. HEALTH CHECK
// ==========================================
app.get("/api/health", async (req, res) => {
   try {
      const { data, error } = await db.from('wireline_agents').select('count', { count: 'exact', head: true });
      if (error) throw error;
      res.json({ status: "healthy", db: "connected", agents: data || 0 });
   } catch(e: any) {
      res.status(500).json({ status: "degraded", error: e.message });
   }
});

// ==========================================
// 1.5 CALL LOG RETRIEVAL ENDPOINT
// ==========================================
app.get("/api/calls", async (req, res) => {
  try {
    const { data: calls, error } = await db
      .from('wireline_call_logs')
      .select('*')
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
app.get("/api/dashboard/stats", async (req, res) => {
   try {
      const [apptRes, leadsRes, logsRes] = await Promise.all([
          db.from('wireline_appointments').select('id', { count: 'exact' }),
          db.from('wireline_outbound_leads').select('id', { count: 'exact' }),
          db.from('wireline_call_logs').select('cost, duration_seconds, direction, created_at').order('created_at', { ascending: false }).limit(200) // limit for MVP performance
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
      const { data: hotCalls } = await db.from('wireline_call_logs').select('*').gte('lead_score', 75).order('created_at', { ascending: false }).limit(5);
      const { data: hotEmails } = await db.from('wireline_email_threads').select('*').gte('lead_score', 75).order('created_at', { ascending: false }).limit(5);

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
app.get("/api/appointments", async (req, res) => {
  try {
    const { data: appointments, error } = await db
      .from('wireline_appointments')
      .select('*')
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
app.get("/api/agents", async (req, res) => {
  try {
    const { data: agents, error } = await db.from('wireline_agents').select('*').order('created_at', { ascending: false });
    res.json({ agents: agents || [] });
  } catch (error) {
    res.json({ agents: [] }); 
  }
});

app.post("/api/agents", async (req, res) => {
  try {
    const { id, name, voice_id, channel } = req.body;
    await db.from('wireline_agents').insert({
      id: id || `agent-${Date.now()}`,
      name: name || "New Agent",
      voice_id: voice_id || 'bIHbv24MWmeRgasZH58o',
      channel: channel || 'voice'
    });
    
    // Seed default personality
    await db.from('wireline_personality').insert({
       agent_id: id,
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

// Update agent settings
app.put("/api/agents/:id", async (req, res) => {
  try {
    const { name, voice_id, voice_provider, first_message, archetype, ambient_noise, website_url, transfer_phone, email_auto_respond, email_agent_tone, email_signature, channel } = req.body;
    await db.from('wireline_agents').update({ 
      name, 
      voice_id, 
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
    }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update agent" });
  }
});

app.get("/api/agent-config/:id", async (req, res) => {
  try {
    const agentId = req.params.id;
    const [directives, knowledge, personality] = await Promise.all([
      db.from('wireline_directives').select('*').eq('agent_id', agentId).order('priority', { ascending: false }).then(r => r),
      db.from('wireline_knowledge').select('*').eq('agent_id', agentId).then(r => r),
      db.from('wireline_personality').select('content').eq('agent_id', agentId).single().then(r => r)
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

// Backward compatibility or alternate access
app.get("/api/knowledge/:id", async (req, res) => {
  try {
    const { data } = await db.from('wireline_knowledge').select('*').eq('agent_id', req.params.id);
    res.json({ knowledge: data || [] });
  } catch(e) {
    res.status(500).json({ error: "Error" });
  }
});

app.get("/api/directives/:id", async (req, res) => {
  try {
    const { data } = await db.from('wireline_directives').select('*').eq('agent_id', req.params.id).order('priority', { ascending: false });
    res.json({ directives: data || [] });
  } catch(e) {
    res.status(500).json({ error: "Error" });
  }
});

// ==========================================
// 1.5.5 FLEET TASK BRIDGE (INTER-AGENT)
// ==========================================
app.get("/api/fleet/tasks", async (req, res) => {
  try {
    const { data, error } = await db.from('wireline_fleet_tasks')
                                     .select('*, wireline_agents(name)')
                                     .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ tasks: data || [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch fleet tasks" });
  }
});

app.patch("/api/fleet/tasks/:id", async (req, res) => {
  try {
    const { status } = req.body;
    await db.from('wireline_fleet_tasks').update({ status }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update task status" });
  }
});

app.post("/api/agent-config/:id/manual", async (req, res) => {
  try {
    const agentId = req.params.id;
    const { type, content, overrideId } = req.body; // type is 'personality', 'directive', or 'knowledge'
    
    if (type === 'personality') {
       await db.from('wireline_personality').upsert({ agent_id: agentId, content });
    } else if (type === 'directive') {
       if (overrideId) {
          await db.from('wireline_directives').update({ content }).eq('id', overrideId);
       } else {
          await db.from('wireline_directives').insert({ agent_id: agentId, content, priority: 5 });
       }
    } else if (type === 'knowledge') {
       if (overrideId) {
          await db.from('wireline_knowledge').update({ content }).eq('id', overrideId);
       } else {
          await db.from('wireline_knowledge').insert({ agent_id: agentId, content });
       }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Manual config error", error);
    res.status(500).json({ error: "Failed to update" });
  }
});

app.delete("/api/agent-config/:id/:type/:rowId", async (req, res) => {
   try {
     const { type, rowId } = req.params;
     if (type === 'directive') await db.from('wireline_directives').delete().eq('id', rowId);
     if (type === 'knowledge') await db.from('wireline_knowledge').delete().eq('id', rowId);
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
    res.json(data || {});
  } catch (error) {
    res.json({});
  }
});

app.post("/api/settings", async (req, res) => {
  try {
    const { vapi_private_key, vapi_phone_number_id } = req.body;
    await db.from('wireline_settings').upsert({
      id: 'global',
      vapi_private_key,
      vapi_phone_number_id,
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

app.post("/api/outbound/dial", async (req, res) => {
  try {
    const { agentId, customerName, customerNumber, context } = req.body;
    
    // 1. Fetch settings (we need the API key and Phone ID to dispatch a call)
    const { data: settings } = await db.from('wireline_settings').select('*').eq('id', 'global').single();
    if (!settings?.vapi_private_key || !settings?.vapi_phone_number_id) {
       return res.status(400).json({ error: "Platform Error: Master telecom carrier not configured. Please contact the administrator (Founder)." });
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
          archetypeRules = "You are highly persuasive, confident, and goal-oriented. You smoothly overcome objections and always try to guide the conversation toward booking an appointment or clarifying the sale.";
          llmTemp = 0.7;
          break;
       case 'Support Tech':
          archetypeRules = "You are highly analytical, patient, and precise. You ask clarifying troubleshooting questions one at a time. You do not rush.";
          llmTemp = 0.2;
          break;
       case 'The Empath':
          archetypeRules = "You are warm, highly agreeable, and sympathetic. You validate the caller's concerns frequently (e.g. 'I completely understand why that's frustrating').";
          llmTemp = 0.6;
          break;
       default: // Receptionist
          archetypeRules = "You are cheerful, polite, and highly efficient. You keep the conversation moving and focus on gathering the necessary information quickly.";
          llmTemp = 0.4;
    }

    const systemPrompt = `
    # CORE IDENTITY & ARCHETYPE: ${archetype}
    ${archetypeRules}
    ${personalityData?.data?.content || "You are a professional, helpful Wireline assistant for a Home Services company."}

    # CRITICAL OUTBOUND MISSION CONTEXT
    You are making an OUTBOUND call to a customer named ${customerName || "a customer"}.
    Outbound Call Context / Objective: ${context || "Just checking in on them."}
    You must address this objective naturally during the conversation.

    # TEMPORAL CONTEXT
    The current live date and time is: ${currentDateTime} (Eastern Time).
    
    # ABSOLUTE RULES
    ${(directivesData?.data || []).map((d: any) => `[PRIORITY ${d.priority}] ${d.content}`).join('\n')}
    
    # KNOWLEDGE BASE
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
        "Authorization": `Bearer ${settings.vapi_private_key}`,
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

     const { data, error } = await db.from('wireline_outbound_leads').insert(leads).select('id');
     if (error) throw error;
     
     res.json({ success: true, inserted: data.length });
  } catch (error: any) {
     res.status(500).json({ error: "Failed to queue leads" });
  }
});

// ==========================================
// 2. AGENT TRAINING ENDPOINT (ADMIN AI)
// ==========================================
app.post("/api/train", async (req, res) => {
  const { userMessage, agentId = "default-agent" } = req.body;

  if (!userMessage) return res.status(400).json({ error: "userMessage required" });

  try {
    // Determine agent type for better context
    let agentContext = "phone agent";
    if (agentId !== 'default-agent') {
      const { data: agent } = await db.from('wireline_agents').select('channel').eq('id', agentId).single();
      if (agent?.channel === 'email') agentContext = "email agent";
      if (agent?.channel === 'omnichannel') agentContext = "omnichannel (phone & email) agent";
    }

    const prompt = `
    You are the Wireline Configuration Engine. The business owner is training their AI fleet.
    Current Training Target: ${agentContext}
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

    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsed = JSON.parse(response.text || "{}");

    // Atomic update to Supabase
    if (parsed.directives && parsed.directives.length) {
      await db.from('wireline_directives').insert(
        parsed.directives.map((d: any) => ({ ...d, agent_id: agentId }))
      );
    }
    if (parsed.knowledge && parsed.knowledge.length) {
      await db.from('wireline_knowledge').insert(
        parsed.knowledge.map((k: any) => ({ ...k, agent_id: agentId }))
      );
    }
    if (parsed.personality) {
      // Upsert personality
      await db.from('wireline_personality').upsert({ agent_id: agentId, content: parsed.personality });
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
app.get("/api/emails/accounts", async (req, res) => {
  try {
    const { data: accounts, error } = await db.from('wireline_email_accounts')
                                               .select('*')
                                               .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ accounts: accounts || [] });
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

app.patch("/api/emails/accounts/:id", async (req, res) => {
  try {
    const { agent_id } = req.body;
    await db.from('wireline_email_accounts').update({ agent_id }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update account mapping" });
  }
});

app.delete("/api/emails/accounts/:id", async (req, res) => {
  try {
    await db.from('wireline_email_accounts').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});


// ==========================================
// 2.3 EMAIL THREAD & SYNC ENDPOINTS
// ==========================================

app.get("/api/emails/threads", async (req, res) => {
  try {
    const { data: threads, error } = await db.from('wireline_email_threads')
                                           .select('*')
                                           .order('last_message_at', { ascending: false });
    if (error) throw error;
    res.json({ threads: threads || [] });
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch threads" });
  }
});

app.get("/api/emails/threads/:id/messages", async (req, res) => {
  try {
    const { data: messages, error } = await db.from('wireline_email_messages')
                                             .select('*')
                                             .eq('thread_id', req.params.id)
                                             .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ messages: messages || [] });
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// The "AI Intelligence" Sync
app.post("/api/emails/sync", async (req, res) => {
  try {
     // 1. Fetch connected accounts
     const { data: accounts } = await db.from('wireline_email_accounts').select('*');
     if (!accounts || accounts.length === 0) return res.json({ success: true, count: 0 });

     // 2. Fetch primary agent for grounding
     const { data: agent } = await db.from('wireline_agents').select('*').limit(1).single();

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
             You are the AI Email Agent for Wireline. 
             Tone: ${activeAgent?.email_agent_tone || 'Professional'}
             Personality: ${activeAgent?.archetype || 'Receptionist'}
             Company Site: ${activeAgent?.website_url || 'Home Services Platform'}
             Signature: ${activeAgent?.email_signature || 'The Wireline Team'}

             INCOMING EMAIL FROM: ${from}
             SUBJECT: ${subject}
             CONTENT: ${snippet}

             TASK: Write a Sales or Customer Service response. 
             If they are asking for a callback, acknowledge. 
             If they want an appointment, provide basic info.
             Keep it professional and concise.
             
             RESPONSE:
           `;

           const aiRes = await genAI.models.generateContent({
              model: "gemini-2.0-flash",
              contents: [{ role: 'user', parts: [{ text: prompt }] }]
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

           // 5. CROSS-FLEET HANDOFF DETECTION (EMAIL -> PHONE)
           const lowerSnippet = snippet.toLowerCase();
           if (lowerSnippet.includes('call') || lowerSnippet.includes('phone') || lowerSnippet.includes('callback') || lowerSnippet.includes('number')) {
              try {
                 // Generate a context for the outbound call
                 const contextPrompt = `Analyze this email snippet and provide a 1-sentence context for an outbound call follow-up.
                 Email snippet: "${snippet}"
                 Response format: Just the sentence.`;

                 const contextRes = await genAI.models.generateContent({
                    model: "gemini-2.0-flash",
                    contents: [{ role: 'user', parts: [{ text: contextPrompt }] }]
                 });
                 const callContext = contextRes.text || `Lead requested callback via email mailroom. Lead Contact: ${from}`;

                 await db.from('wireline_fleet_tasks').insert({
                    source_type: 'email_thread',
                    source_id: threadId,
                    target_channel: 'phone',
                    agent_id: activeAgent?.id || null,
                    customer_info: { email: from, subject: subject },
                    task_type: 'callback_required',
                    description: callContext,
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
                model: "gemini-2.0-flash",
                contents: [{ role: 'user', parts: [{ text: emailScoringPrompt }] }],
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

app.post("/api/emails/threads/:id/reply", async (req, res) => {
   try {
      const { body } = req.body;
      const { data: thread } = await db.from('wireline_email_threads').select('*, wireline_email_accounts(*)').eq('id', req.params.id).single();
      
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
