import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SchemaType } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import dotenv from "dotenv";
import * as claudeBrain from "./src/lib/claude-brain";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Initialize AI and DB
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
                    model: "gemini-1.5-flash",
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
      1. ACKNOWLEDGE: "That's a great question, let me check with our experts."
      2. RESOLVE: "Let me have a specialist review that and get back to you. What's your email?"
      3. LOG: After getting the info, move on. NEVER guess or make up prices, dates, or company policies.

      ## BLOCK 2: TEMPORAL & CONTEXTUAL ANCHORS
      You unmistakably know that today is ${currentDateTime} (Eastern Time). If a customer asks for "tomorrow" or "next week", calculate the date silently and confirm it back to them (e.g., "So that would be Tuesday the 24th at 2pm?").

      Memory Protocol: If a customer context seems familiar or they mention a previous conversation, you MUST use the 'view_recent_interactions' tool to retrieve their history and provide a personalized experience.

      ## BLOCK 3: CONVERSATIONAL LOOP & GUARDRAILS
      Response Length: ABSOLUTE LIMIT. Keep every response under 20 words. No monologues. Be snappy and human.
      The "Anti-Echo" Rule: Do not repeat back what the user just said.
      Question Limit: Never ask more than one question at a time.
      Number Formatting: Spell out important numbers if they sound robotic (e.g., "Two zero two" instead of "Two hundred and two").

      ## BLOCK 4: TOOL EXECUTION LOGIC & PROTOCOLS
      Escalation Detection (CRITICAL):
      You must proactively escalate to a human using the 'escalate_to_human' tool if:
      1. Potential Conflict: The customer starts using profanity or sounds clearly distressed.
      2. High stakes: The customer is asking for a quote over $5,000 or wants to discuss a legal liability.
      3. Repetition: You have had to repeat the same answer three times without resolution.
      
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
            model: "gemini-1.5-flash", 
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
            },
            {
              name: "create_fleet_task",
              description: "Creates a resolution mission for a human agent. Use this if a customer needs something complex that you cannot handle on the call.",
              parameters: {
                type: "object",
                properties: {
                  description: { type: "string", description: "Detailed description of the task." },
                  priority: { type: "string", enum: ["low", "medium", "high"], description: "The urgency of the mission." }
                },
                required: ["description", "priority"]
              }
            },
            {
              name: "search_leads",
              description: "Locates customer lead data from the central fleet intelligence database. Use this to find existing lead context.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "The name or signal signature to search for." }
                },
                required: ["query"]
              }
            },
            {
              name: "view_recent_interactions",
              description: "Retrieves recent tasks and call summaries for this specific number. Use this to provide continuity if a caller asks about previous status.",
              parameters: {
                type: "object",
                properties: {},
                required: []
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
           model: { provider: "google", model: "gemini-1.5-flash", systemPrompt: "Apologize and hang up." }
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
      
      // TOOL 0: CONTEXTUAL RECALL (MEMORY)
      if (toolCall.function.name === "view_recent_interactions") {
         try {
            const customerPhone = payload.call?.customer?.number || message.call?.customer?.number || "unknown";
            
            console.log(`[MEMORY] Fetching history for ${customerPhone}`);

            // 1. Fetch last 3 call summaries
            const { data: pastCalls } = await db.from('wireline_call_logs')
               .select('summary, intent_label, created_at')
               .eq('customer_number', customerPhone)
               .order('created_at', { ascending: false })
               .limit(3);

            // 2. Fetch any open tasks for this customer
            const { data: tasks } = await db.from('wireline_fleet_tasks')
               .select('description, status, priority')
               .eq('user_id', agent?.user_id)
               .ilike('customer_info->>email', `%${customerPhone}%`)
               .eq('status', 'pending')
               .limit(2);

            let contextReport = `RECENT CONTEXT FOR ${customerPhone}:\n`;
            if (pastCalls && pastCalls.length > 0) {
               contextReport += "PAST CALL HISTORY:\n" + pastCalls.map(c => `- [${new Date(c.created_at).toLocaleDateString()}] Intent: ${c.intent_label || 'Inquiry'}. Summary: ${c.summary}`).join('\n');
            } else {
               contextReport += "No previous voice interaction history found.\n";
            }

            if (tasks && tasks.length > 0) {
               contextReport += "\nACTIVE MISSIONS/TASKS:\n" + tasks.map(t => `- [${t.priority.toUpperCase()}] ${t.description} (Status: ${t.status})`).join('\n');
            }

            results.push({
              toolCallId: toolCall.id,
              result: contextReport || "No interaction signals found in the neural cache."
            });
            continue;
         } catch (e) {
            console.error("Recall Error:", e);
            results.push({ toolCallId: toolCall.id, result: "Memory retrieval error. Process caller as a new contact for safety." });
            continue;
         }
      }
      
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

      // TOOL 5: FLEET TASK
      if (toolCall.function.name === "create_fleet_task") {
        try {
           const { description, priority } = toolCall.function.arguments;
           const { data: task, error: taskError } = await db.from('wireline_fleet_tasks').insert({
              user_id: agent?.user_id,
              agent_id: agent?.id,
              description,
              priority: priority || 'medium',
              status: 'pending',
              source: 'voice'
           }).select('id').single();
           
           if (taskError) throw taskError;
           results.push({ toolCallId: toolCall.id, result: `Task ${task.id.split('-')[0]} created in mission queue.` });
        } catch (e) {
           results.push({ toolCallId: toolCall.id, result: "Failed to create task in mission queue." });
        }
      }

      // TOOL 6: SEARCH LEADS
      if (toolCall.function.name === "search_leads") {
        try {
           const { query } = toolCall.function.arguments;
           const { data: leads } = await db.from('wireline_outbound_leads')
             .select('name, status, last_contact_summary')
             .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
             .limit(3);
           
           if (leads && leads.length > 0) {
              results.push({ toolCallId: toolCall.id, result: `Found matching intelligence: ${leads.map(l => `${l.name} (${l.status}): ${l.last_contact_summary || 'No prior notes'}`).join('; ')}` });
           } else {
              results.push({ toolCallId: toolCall.id, result: "No matching lead profiles found in current sector." });
           }
        } catch (e) {
           results.push({ toolCallId: toolCall.id, result: "Intelligence database is currently unreachable." });
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

        // ────────────────────────────────────────────────────────────
        //  POST-CALL ENRICHMENT
        //
        //  Preferred: single-pass Claude analysis (one tool-call returning
        //  score + intent + sentiment + lesson + action items + compliance
        //  flags + knowledge gaps). Falls back to the legacy 3-Gemini-call
        //  pipeline when ANTHROPIC_API_KEY is not set or the Claude call
        //  fails for any reason — the agents keep working either way.
        // ────────────────────────────────────────────────────────────
        let claudeAnalysisDone = false;
        if (claudeBrain.isClaudeAvailable() && message.transcript) {
          try {
            const { data: agentDetail } = await db
              .from('wireline_agents')
              .select('name, archetype')
              .eq('id', webhookAgentId)
              .single();

            const result = await claudeBrain.postCallAnalysis({
              agentName: agentDetail?.name || 'Wireline Agent',
              archetype: agentDetail?.archetype || 'Receptionist',
              customerNumber: call?.customer?.number,
              durationSeconds: duration,
              summary: analysis?.summary || '',
              transcript: message.transcript || '',
            });

            // 1. Persist lead score + intent + sentiment
            await db.from('wireline_call_logs').update({
              lead_score: result.lead_score,
              intent_label: result.intent_label,
            }).eq('vapi_call_id', call?.id);

            // 2. Promote a single tactical lesson (if any).
            if (result.lesson && result.lesson.trim().length > 0) {
              await db.from('wireline_agent_lessons').insert({
                agent_id: webhookAgentId,
                user_id: agent?.user_id,
                lesson: result.lesson.trim(),
              });
            }

            // 3. Insert ALL action items as fleet tasks.
            for (const item of result.action_items || []) {
              await db.from('wireline_fleet_tasks').insert({
                user_id: agent?.user_id,
                task_type: 'action_required',
                description: `Follow-up for ${call?.customer?.number || 'Caller'}: ${item.description}`,
                source_type: 'phone_call',
                source_id: call?.id,
                target_channel: item.target_channel || 'manual',
                priority: item.priority || 'medium',
                status: 'pending',
              });
            }

            // 4. Surface knowledge gaps as low-priority lessons (clearly tagged so
            //    they're easy to filter / promote into wireline_knowledge later).
            for (const gap of result.knowledge_gaps || []) {
              await db.from('wireline_agent_lessons').insert({
                agent_id: webhookAgentId,
                user_id: agent?.user_id,
                lesson: `[KNOWLEDGE GAP] ${gap}`,
              });
            }

            // 5. Surface compliance flags as critical fleet tasks.
            for (const flag of result.compliance_flags || []) {
              await db.from('wireline_fleet_tasks').insert({
                user_id: agent?.user_id,
                task_type: 'compliance_review',
                description: `[COMPLIANCE] Call ${call?.id?.slice(0, 8) || ''} — ${flag}`,
                source_type: 'phone_call',
                source_id: call?.id,
                target_channel: 'manual',
                priority: 'high',
                status: 'pending',
              });
            }

            // 6. Update outbound lead status if applicable.
            await db.from('wireline_outbound_leads').update({
              status: 'Completed',
              last_called_at: new Date(),
            }).eq('call_id', call?.id);

            claudeAnalysisDone = true;
          } catch (err) {
            console.error('Claude post-call analysis failed; falling back to Gemini:', err);
          }
        }

        // Legacy Gemini pipeline — runs only if Claude wasn't available or failed.
        if (!claudeAnalysisDone) {
          const scoringPrompt = `
            Analyze this call TRANSCRIPT and give a BUYING INTENT score (0-100) and CATEGORY ('high', 'medium', 'low', 'none').
            Transcript: ${message.transcript || "None"}
            Summary: ${analysis?.summary || ""}
            RESPONSE FORMAT (JSON): { "score": number, "label": string }
          `;
          try {
             const model = genAI.getGenerativeModel({
               model: "gemini-1.5-flash",
               generationConfig: { responseMimeType: "application/json" }
             });
             const scoreRes = await model.generateContent(scoringPrompt);
             const scoreObj = JSON.parse(scoreRes.response.text() || "{}");
             await db.from('wireline_call_logs').update({
               lead_score: scoreObj.score || 0,
               intent_label: scoreObj.label || 'none'
             }).eq('vapi_call_id', call?.id);

             await db.from('wireline_outbound_leads').update({
               status: "Completed",
               last_called_at: new Date()
             }).eq('call_id', call?.id);

             try {
                const lessonPrompt = `Identify exactly ONE tactical improvement for this agent. JSON ONLY: { "lesson": "string" }. Transcript: ${message.transcript}`;
                const lessonModel = genAI.getGenerativeModel({
                   model: "gemini-1.5-flash",
                   generationConfig: { responseMimeType: "application/json" }
                });
                const lessonRes = await lessonModel.generateContent(lessonPrompt);
                const lessonObj = JSON.parse(lessonRes.response.text() || "{}");
                if (lessonObj.lesson) {
                   await db.from('wireline_agent_lessons').insert({
                      agent_id: webhookAgentId,
                      user_id: agent?.user_id,
                      lesson: lessonObj.lesson
                   });
                }
             } catch(e) {}

             try {
                const taskPrompt = `Based on the transcript, did the agent promise any follow-up (like sending an email, checking a quote), or did the human ask for something out-of-scope?
                JSON format MUST match exactly: { "has_task": boolean, "task_description": "string", "priority": "high" | "medium" | "low", "target_channel": "email" | "manual" }
                Transcript: ${message.transcript}`;
                const taskModel = genAI.getGenerativeModel({
                   model: "gemini-1.5-flash",
                   generationConfig: { responseMimeType: "application/json" }
                });
                const taskRes = await taskModel.generateContent(taskPrompt);
                const taskObj = JSON.parse(taskRes.response.text() || "{}");
                if (taskObj.has_task && taskObj.task_description) {
                   await db.from('wireline_fleet_tasks').insert({
                      user_id: agent?.user_id,
                      task_type: 'action_required',
                      description: `FOLLOW-UP FOR ${call?.customer?.number || 'Caller'}: ${taskObj.task_description}`,
                      source_type: 'phone_call',
                      source_id: call?.id,
                      target_channel: taskObj.target_channel || 'manual',
                      priority: taskObj.priority || 'medium',
                      status: 'pending'
                   });
                }
             } catch(e) {}
          } catch(scoringErr) {
             console.error("Call scoring failed:", scoringErr);
          }
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
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { data: calls, error, count } = await db
      .from('wireline_call_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
      
    if (error) throw error;
    res.json({ 
       calls: calls || [],
       hasMore: count ? (offset + limit) < count : false,
       total: count || 0
    });
  } catch (error) {
    console.error("Failed to fetch calls:", error);
    res.json({ calls: [], hasMore: false, total: 0 }); // Fail gracefully if table not created
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

      // Compute Chart Data (Last 7 Days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
         const d = new Date();
         d.setDate(d.getDate() - (6 - i));
         return d.toISOString().split('T')[0];
      });

      const chartDataMap: Record<string, { signals: number, leads: number }> = {};
      last7Days.forEach(dateStr => {
         chartDataMap[dateStr] = { signals: 0, leads: 0 };
      });

      logs.forEach((log: any) => {
         const d = new Date(log.created_at).toISOString().split('T')[0];
         if (chartDataMap[d]) {
             chartDataMap[d].signals += 1;
         }
      });

      const { data: recentAppts } = await db.from('wireline_appointments').select('created_at').eq('user_id', req.user.id);
      (recentAppts || []).forEach((appt: any) => {
         const d = new Date(appt.created_at).toISOString().split('T')[0];
         if (chartDataMap[d]) {
             chartDataMap[d].leads += 1;
         }
      });

      const chartData = last7Days.map(dateStr => {
         const date = new Date(dateStr + "T12:00:00");
         return {
            name: date.toLocaleDateString('en-US', { weekday: 'short' }),
            signals: chartDataMap[dateStr].signals,
            leads: chartDataMap[dateStr].leads
         };
      });

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
         hotLeads,
         chartData
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
    const [directives, knowledge, personality, lessons] = await Promise.all([
      db.from('wireline_directives').select('*').eq('agent_id', agentId).eq('user_id', req.user.id).order('priority', { ascending: false }),
      db.from('wireline_knowledge').select('*').eq('agent_id', agentId).eq('user_id', req.user.id),
      db.from('wireline_personality').select('content').eq('agent_id', agentId).eq('user_id', req.user.id).single(),
      db.from('wireline_agent_lessons').select('*').eq('agent_id', agentId).eq('user_id', req.user.id).order('created_at', { ascending: false })
    ]);
    res.json({
      directives: directives.data || [],
      knowledge: knowledge.data || [],
      personality: personality.data?.content || "",
      lessons: lessons.data || []
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

// ==========================================
// FLEET MANAGEMENT ENDPOINTS
// ==========================================
app.get("/api/fleet/presence", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from('wireline_signal_presence')
      .select('*')
      .eq('user_id', req.user.id);
    
    if (error) throw error;
    res.json({ signals: data || [] });
  } catch (error) {
    console.error("Presence fetch failed:", error);
    res.json({ signals: [] });
  }
});

app.get("/api/fleet/tasks", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from('wireline_fleet_tasks')
                                     .select('*, wireline_agents(name)')
                                     .eq('user_id', req.user.id);
    
    if (error) throw error;

    const sortedTasks = (data || []).sort((a: any, b: any) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      const priorityWeight: Record<string, number> = { 'high': 3, 'medium': 2, 'low': 1 };
      const weightA = priorityWeight[a.priority?.toLowerCase()] || 0;
      const weightB = priorityWeight[b.priority?.toLowerCase()] || 0;
      if (weightA !== weightB) return weightB - weightA;
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    res.json({ tasks: sortedTasks });
  } catch (error) {
    console.error("Fetch tasks failed:", error);
    res.json({ tasks: [] });
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
    const { status, priority, due_date, agent_id, resolution_notes } = req.body;
    const updateData: any = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (agent_id !== undefined) updateData.agent_id = agent_id;
    if (resolution_notes !== undefined) updateData.resolution_notes = resolution_notes;
    
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
app.get("/api/settings", authenticateUser, async (req: any, res: any) => {
  try {
    const { data } = await db.from('wireline_settings').select('*').eq('user_id', req.user.id).single();
    if (data) {
       delete data.vapi_private_key; // Never send secret to client
    }
    res.json(data || {});
  } catch (error) {
    res.json({});
  }
});

app.post("/api/settings", authenticateUser, async (req: any, res: any) => {
  try {
    const { vapi_phone_number_id, subscription_status, max_agents } = req.body;
    
    // Check if exists
    const { data: existing } = await db.from('wireline_settings').select('id').eq('user_id', req.user.id).single();
    
    if (existing) {
       await db.from('wireline_settings').update({
         vapi_phone_number_id,
         subscription_status,
         max_agents,
         updated_at: new Date().toISOString()
       }).eq('user_id', req.user.id);
    } else {
       await db.from('wireline_settings').insert({
         user_id: req.user.id,
         vapi_phone_number_id,
         subscription_status,
         max_agents,
         updated_at: new Date().toISOString()
       });
    }
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

app.post("/api/outbound/bulk", authenticateUser, async (req: any, res: any) => {
  try {
     const { leads } = req.body;
     if (!leads || !leads.length) return res.status(400).json({ error: "No leads provided" });

     // SECURITY ENFORCEMENT
     const { data: userSettings } = await db.from('wireline_settings').select('subscription_status').eq('user_id', req.user.id).single();
     if (userSettings?.subscription_status !== 'active') {
        return res.status(403).json({ error: "Access Denied: Inactive billing plan." });
     }

     const leadsWithUser = leads.map((lead: any) => ({
        ...lead,
        user_id: req.user.id
     }));

     const { data, error } = await db.from('wireline_outbound_leads').insert(leadsWithUser).select('id');
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
        let knowledge = [];
        let directives = [];
        if (account.agent_id) {
          const { data: specificAgent } = await db.from('wireline_agents').select('*').eq('id', account.agent_id).single();
          if (specificAgent) activeAgent = specificAgent;
          
          const knowledgeRes = await db.from('wireline_knowledge').select('content').eq('agent_id', account.agent_id);
          if (knowledgeRes.data) knowledge = knowledgeRes.data.map(k => k.content);

          const directivesRes = await db.from('wireline_directives').select('content').eq('agent_id', account.agent_id);
          if (directivesRes.data) directives = directivesRes.data.map(d => d.content);
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

           // 3. GENERATE AI RESPONSE (Sales/CS focus) with TOOL SUPPORT
           const systemInstruction = `
             ## IDENTITY & ARCHETYPE
             Persona: You are the AI Email Agent for our company.
             Tone: ${activeAgent?.email_agent_tone || 'Professional'}. Concise and helpful.
             Personality: ${activeAgent?.archetype || 'Receptionist'}.
             Company Site: ${activeAgent?.website_url || 'Home Services Platform'}.
             
             ## CONTEXT
             INCOMING EMAIL FROM: ${from}
             SUBJECT: ${subject}
             
             ## GUARDRAILS
             Response Length: CRITICAL. Keep every email under 20 words where possible. Be direct and avoid flowery pleasantries.
             - If they want an appointment, use your tools to check availability and book it if confirmed.

             ## KNOWLEDGE BASE
             ${knowledge.length > 0 ? knowledge.map(k => `- ${k}`).join('\n') : "Use standard professional knowledge."}
             
             ## ABSOLUTE RULES
             ${directives.length > 0 ? directives.map(d => `- ${d}`).join('\n') : ""}
           `;

           const tools: any = [{
              functionDeclarations: [
                  {
                      name: "check_calendar_availability",
                      description: "Checks availability on a specific date.",
                      parameters: {
                          type: SchemaType.OBJECT,
                          properties: { date: { type: SchemaType.STRING, description: "The date to check (e.g., 'October 15')" } },
                          required: ["date"]
                      }
                  },
                  {
                      name: "book_appointment",
                      description: "Books an appointment.",
                      parameters: {
                          type: SchemaType.OBJECT,
                          properties: {
                              date: { type: SchemaType.STRING },
                              time: { type: SchemaType.STRING },
                              customer_name: { type: SchemaType.STRING },
                              service_type: { type: SchemaType.STRING }
                          },
                          required: ["date", "time", "customer_name", "service_type"]
                      }
                  }
              ]
           }];

           const model = genAI.getGenerativeModel({ 
              model: "gemini-1.5-pro",
              systemInstruction,
              tools,
              generationConfig: { temperature: 0.4 }
           });

           const chat = model.startChat();

           let finalReply = "I've received your email and will follow up shortly.";
           try {
              let resObj = await chat.sendMessage(snippet);
              let response = resObj.response;
              
              // Handle tool calls
              let calls = response.functionCalls();
              while (calls && calls.length > 0) {
                 const toolResponses = [];
                 for (const call of calls) {
                     let toolResult = "Tool failed";
                     const args = call.args as any;
                     try {
                         if (call.name === "check_calendar_availability") {
                             const { data } = await db.from('wireline_appointments').select('time').ilike('date', `%${args.date as string}%`);
                             if (data && data.length > 0) {
                                toolResult = `Booked times on ${args.date}: ${data.map(a => a.time).join(', ')}. Offer other times.`;
                             } else {
                                toolResult = `The entire day on ${args.date} is fully open.`;
                             }
                         } else if (call.name === "book_appointment") {
                             const { data, error } = await db.from('wireline_appointments').insert({
                                 agent_id: activeAgent?.id,
                                 date: args.date as string,
                                 time: args.time as string,
                                 customer_name: args.customer_name as string,
                                 service_type: args.service_type as string,
                                 status: "Scheduled"
                             }).select('id').single();
                             if (error) throw error;
                             toolResult = `Booked successfully! Reference ID: ${data.id.split('-')[0]}`;
                         }
                     } catch(e) {
                         toolResult = "Error executing tool. Assume failure or ask human.";
                     }
                     toolResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: { result: toolResult }
                        }
                     });
                 }
                 const nextRes = await chat.sendMessage(toolResponses);
                 response = nextRes.response;
                 calls = response.functionCalls();
              }
              finalReply = response.text() || finalReply;
           } catch(e) {
              console.error("AI Email error:", e);
           }

           if (activeAgent?.email_signature) {
               finalReply = `${finalReply}\n\n${activeAgent.email_signature}`;
           }

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
              const sModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash", generationConfig: { responseMimeType: "application/json" } });
              const sRes = await sModel.generateContent(emailScoringPrompt);
              const sObj = JSON.parse(sRes.response.text() || "{}");
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

app.post("/api/emails/draft", authenticateUser, async (req: any, res: any) => {
  try {
     const { subject, messages, context } = req.body;
     const prompt = `You are a professional AI assistant drafting an email reply.
Subject: ${subject}
Conversation history:
${(messages || []).map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

Extra instructions from user (if any):
${context || 'Write a helpful and polite reply that advances the conversation seamlessly without repeating the context.'}

Draft only the plain text email body. Do not include a subject line. Be professional but brief. Do not include placeholders like "[Your Name]", write as the AI representative if a name is not known, or just leave it off.`;

     const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
     const aiRes = await aiModel.generateContent(prompt);

     res.json({ draft: aiRes.response.text() });
  } catch (e) {
     console.error("Draft error:", e);
     res.status(500).json({ error: "Failed to draft reply" });
  }
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Global Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
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

  // OPTIMIZE AGENT PROTOCOLS
app.post("/api/agents/:id/optimize", authenticateUser, async (req, res) => {
   try {
      const { id } = req.params;
      const { data: logs } = await db.from('wireline_call_logs').select('summary, transcript').eq('agent_id', id).order('created_at', { ascending: false }).limit(10);
      
      if (!logs || logs.length === 0) {
         return res.json({ suggestions: [], reason: "Insufficient data: Need at least 1 completed mission log." });
      }

      const prompt = `
        AGENT ID: ${id}
        MISSION LOGS (LAST 10):
        ${logs.map((l, i) => `Log ${i+1}: Summary: ${l.summary}. Transcript: ${l.transcript}`).join('\n\n')}

        TASK: Analyze performance and suggest exactly 3 new tactical directives to improve the agent.
        FORMAT: JSON { "suggestions": string[], "analysis": string }
      `;

      const model = genAI.getGenerativeModel({
         model: "gemini-1.5-pro",
         generationConfig: { responseMimeType: "application/json" }
      });

      const result = await model.generateContent(prompt);
      const aiText = result.response.text();
      res.json(JSON.parse(aiText || "{}"));
   } catch (e) {
      res.status(500).json({ error: "Optimization protocol failed" });
   }
});

// ==========================================
// 1.9 CONSOLIDATED ACTIVITY FEED (TRIGGER LOG)
// ==========================================
app.get("/api/fleet/activity", authenticateUser, async (req: any, res: any) => {
   try {
      const [logs, tasks, lessons, emails] = await Promise.all([
          db.from('wireline_call_logs').select('id, customer_number, lead_score, intent_label, summary, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5),
          db.from('wireline_fleet_tasks').select('id, description, status, priority, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5),
          db.from('wireline_agent_lessons').select('id, lesson, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5),
          db.from('wireline_email_threads').select('id, customer_email, lead_score, intent_label, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5)
      ]);

      const activity = [
         ...(logs.data || []).map(l => ({ 
            id: l.id, 
            type: 'SIGNAL_ANALYZED', 
            trigger: 'Voice Ingestion', 
            action: `Intent extracted: ${l.intent_label || 'Analysis Pending'}`, 
            meta: l.customer_number,
            timestamp: l.created_at,
            importance: l.lead_score > 70 ? 'high' : 'medium'
         })),
         ...(tasks.data || []).map(t => ({ 
            id: t.id, 
            type: 'MISSION_INJECTED', 
            trigger: 'Functional Requirement Detected', 
            action: `New Task: ${t.description.substring(0, 50)}...`, 
            meta: t.status,
            timestamp: t.created_at,
            importance: t.priority === 'high' ? 'critical' : 'medium'
         })),
         ...(lessons.data || []).map(l => ({ 
            id: l.id, 
            type: 'NEURAL_OPTIMIZATION', 
            trigger: 'Behavioral Deviation', 
            action: `Lesson Learned: ${l.lesson.substring(0, 50)}...`, 
            meta: 'Agent Refinement',
            timestamp: l.created_at,
            importance: 'low'
         })),
         ...(emails.data || []).map(e => ({ 
            id: e.id, 
            type: 'DIGITAL_RELAY', 
            trigger: 'OMNI_CHANNEL_SYNC', 
            action: `Email Thread Synced: ${e.intent_label || 'Scanning'}`, 
            meta: e.customer_email,
            timestamp: e.created_at,
            importance: 'medium'
         }))
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      res.json({ activity: activity.slice(0, 15) });
   } catch(e) {
      console.error("Activity feed error", e);
      res.status(500).json({ error: "Failed to fetch activity" });
   }
});

// ==========================================
// 1.10 SUPERVISED AGENT TUNING
// ==========================================
app.get("/api/agents/:id/lessons", authenticateUser, async (req: any, res: any) => {
   try {
      const { data: lessons, error } = await db.from('wireline_agent_lessons').select('*').eq('agent_id', req.params.id).order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ lessons });
   } catch (e) {
      res.status(500).json({ error: "Failed to fetch lessons" });
   }
});

app.post("/api/agents/:id/promote", authenticateUser, async (req: any, res: any) => {
   try {
      const { lessonId, content } = req.body;
      const { error: promoError } = await db.from('wireline_agent_directives').insert({
         agent_id: req.params.id,
         content: content,
         priority: 2, // Medium priority by default
         user_id: req.user.id
      });
      if (promoError) throw promoError;

      // Delete the lesson after promotion
      await db.from('wireline_agent_lessons').delete().eq('id', lessonId);
      
      res.json({ success: true });
   } catch (e) {
      res.status(500).json({ error: "Promotion failed" });
   }
});

app.delete("/api/agents/:id/lessons/:lessonId", authenticateUser, async (req: any, res: any) => {
   try {
      await db.from('wireline_agent_lessons').delete().eq('id', req.params.lessonId);
      res.json({ success: true });
   } catch (e) {
      res.status(500).json({ error: "Delete failed" });
   }
});

// ==========================================
//  CLAUDE BRAIN — advanced agent capabilities
// ==========================================

function claudeErr(res: any, e: any) {
  if (e instanceof claudeBrain.ClaudeUnavailableError) {
    return res.status(503).json({
      error: e.message,
      code: "CLAUDE_OFFLINE",
    });
  }
  console.error("Claude endpoint error:", e);
  return res.status(500).json({ error: e?.message ?? "Claude error" });
}

// Status / health
app.get("/api/claude/status", authenticateUser, async (_req: any, res: any) => {
  res.json({
    available: claudeBrain.isClaudeAvailable(),
    model: "claude-opus-4-7",
    capabilities: [
      "brief", "qualify", "objection-drill", "cold-email",
      "persona-clone", "summarize-thread", "route-intent",
      "smart-draft", "agent-review",
    ],
  });
});

// Pre-call briefing — given a lead, deliver a tactical brief.
app.post("/api/claude/brief", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, customerName, customerNumber, reasonForCall, pastInteractionSummary } = req.body;
    let agentName = "Wireline Agent";
    let agentArchetype = "Receptionist";
    let knowledgeBase: string[] = [];

    if (agentId) {
      const [{ data: agent }, { data: knowledge }] = await Promise.all([
        db.from("wireline_agents").select("name, archetype").eq("id", agentId).eq("user_id", req.user.id).single(),
        db.from("wireline_knowledge").select("content").eq("agent_id", agentId).eq("user_id", req.user.id),
      ]);
      if (agent) {
        agentName = agent.name;
        agentArchetype = agent.archetype;
      }
      knowledgeBase = (knowledge ?? []).map((k: any) => k.content);
    }

    const result = await claudeBrain.brief({
      agentName,
      agentArchetype,
      customerName,
      customerNumber,
      reasonForCall: reasonForCall || "No specific reason provided.",
      knowledgeBase,
      pastInteractionSummary,
    });
    res.json({ brief: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Lead qualification — BANT scoring, optionally pulled from a call log.
app.post("/api/claude/qualify", authenticateUser, async (req: any, res: any) => {
  try {
    const { source, transcript, callId, threadId } = req.body;
    let actualTranscript: string = transcript;
    let metadata: Record<string, any> = {};

    if (!actualTranscript && callId) {
      const { data: call } = await db.from("wireline_call_logs").select("*").eq("id", callId).eq("user_id", req.user.id).single();
      actualTranscript = call?.transcript ?? call?.summary ?? "";
      metadata = { customer_number: call?.customer_number, duration_seconds: call?.duration_seconds };
    } else if (!actualTranscript && threadId) {
      const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).order("created_at", { ascending: true });
      actualTranscript = (msgs ?? []).map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
    }

    if (!actualTranscript) {
      return res.status(400).json({ error: "No transcript provided (and no callId/threadId to fetch from)." });
    }

    const result = await claudeBrain.qualify({
      source: source ?? "voice_call",
      transcript: actualTranscript,
      metadata,
    });
    res.json({ qualification: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Objection drills — practice scenarios for an agent.
app.post("/api/claude/objection-drill", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, topic, count } = req.body;
    let agentName = "Wireline Agent";
    let archetype = "Receptionist";
    if (agentId) {
      const { data: agent } = await db.from("wireline_agents").select("name, archetype").eq("id", agentId).eq("user_id", req.user.id).single();
      if (agent) { agentName = agent.name; archetype = agent.archetype; }
    }
    const result = await claudeBrain.objectionDrill({
      agentName, archetype,
      topic: topic || "general sales objections",
      count: count ?? 5,
    });
    res.json(result);
  } catch (e) {
    claudeErr(res, e);
  }
});

// Cold-email composer.
app.post("/api/claude/cold-email", authenticateUser, async (req: any, res: any) => {
  try {
    const result = await claudeBrain.coldEmail(req.body);
    res.json({ email: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Persona cloning.
app.post("/api/claude/persona-clone", authenticateUser, async (req: any, res: any) => {
  try {
    const { description, samples, agentId, applyToAgent } = req.body;
    if (!Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ error: "Provide at least one sample message." });
    }
    const result = await claudeBrain.personaClone({
      description: description || "Unknown persona",
      samples,
    });

    if (applyToAgent && agentId) {
      // Verify ownership before applying.
      const { data: agent } = await db.from("wireline_agents").select("id").eq("id", agentId).eq("user_id", req.user.id).single();
      if (agent) {
        await db.from("wireline_personality").upsert({
          agent_id: agentId,
          user_id: req.user.id,
          content: result.persona_block,
        });
      }
    }
    res.json({ persona: result, applied: !!(applyToAgent && agentId) });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Email-thread summarizer.
app.post("/api/claude/summarize-thread", authenticateUser, async (req: any, res: any) => {
  try {
    const { threadId } = req.body;
    const { data: thread } = await db.from("wireline_email_threads").select("subject").eq("id", threadId).eq("user_id", req.user.id).single();
    if (!thread) return res.status(404).json({ error: "Thread not found." });
    const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).order("created_at", { ascending: true });
    const result = await claudeBrain.threadSummary({
      subject: thread.subject || "(no subject)",
      messages: (msgs ?? []) as any,
    });
    res.json({ summary: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Fast intent routing.
app.post("/api/claude/route-intent", authenticateUser, async (req: any, res: any) => {
  try {
    const result = await claudeBrain.routeIntent({ text: req.body.text || "" });
    res.json(result);
  } catch (e) {
    claudeErr(res, e);
  }
});

// Smart email draft (the better drop-in for the Gemini draft endpoint).
app.post("/api/claude/email-draft", authenticateUser, async (req: any, res: any) => {
  try {
    const { threadId, agentId, userInstructions } = req.body;
    const { data: thread } = await db.from("wireline_email_threads").select("subject, agent_id").eq("id", threadId).eq("user_id", req.user.id).single();
    if (!thread) return res.status(404).json({ error: "Thread not found." });

    const targetAgentId = agentId || thread.agent_id;
    let agentName = "Wireline Agent";
    let agentTone = "Professional";
    let agentSignature = "";
    let knowledgeBase: string[] = [];
    let directives: string[] = [];

    if (targetAgentId) {
      const [{ data: agent }, { data: knowledge }, { data: directiveRows }] = await Promise.all([
        db.from("wireline_agents").select("name, email_agent_tone, email_signature").eq("id", targetAgentId).eq("user_id", req.user.id).single(),
        db.from("wireline_knowledge").select("content").eq("agent_id", targetAgentId).eq("user_id", req.user.id),
        db.from("wireline_directives").select("content").eq("agent_id", targetAgentId).eq("user_id", req.user.id).order("priority", { ascending: false }),
      ]);
      if (agent) {
        agentName = agent.name;
        agentTone = agent.email_agent_tone || "Professional";
        agentSignature = agent.email_signature || "";
      }
      knowledgeBase = (knowledge ?? []).map((k: any) => k.content);
      directives = (directiveRows ?? []).map((d: any) => d.content);
    }

    const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).order("created_at", { ascending: true });

    const result = await claudeBrain.smartDraft({
      agentName, agentTone, agentSignature,
      knowledgeBase, directives,
      threadSubject: thread.subject || "(no subject)",
      threadMessages: (msgs ?? []) as any,
      userInstructions,
    });

    res.json({
      draft: result.draft,
      diagnostics: { cacheRead: result.cacheRead, cacheCreate: result.cacheCreate },
    });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Deep agent performance review.
app.post("/api/claude/agent-review", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, lookback } = req.body;
    if (!agentId) return res.status(400).json({ error: "agentId required" });
    const { data: agent } = await db.from("wireline_agents").select("name, archetype").eq("id", agentId).eq("user_id", req.user.id).single();
    if (!agent) return res.status(404).json({ error: "Agent not found." });
    const { data: logs } = await db
      .from("wireline_call_logs")
      .select("summary, transcript, lead_score, intent_label")
      .eq("agent_id", agentId)
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(Math.min(lookback ?? 15, 30));
    if (!logs || logs.length === 0) {
      return res.status(400).json({ error: "Insufficient data — need at least 1 completed call.", code: "NO_DATA" });
    }
    const result = await claudeBrain.agentReview({
      agentName: agent.name,
      archetype: agent.archetype,
      callLogs: logs as any,
    });
    res.json({ review: result, lookback: logs.length });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Promote a Claude-suggested directive into the agent's directive table.
app.post("/api/claude/agent-review/apply-directive", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, directive, priority } = req.body;
    const { data: agent } = await db.from("wireline_agents").select("id").eq("id", agentId).eq("user_id", req.user.id).single();
    if (!agent) return res.status(404).json({ error: "Agent not found." });
    const priorityMap: Record<string, number> = { critical: 10, high: 7, medium: 5, low: 3 };
    await db.from("wireline_directives").insert({
      agent_id: agentId,
      user_id: req.user.id,
      content: directive,
      priority: priorityMap[priority] ?? 5,
    });
    res.json({ success: true });
  } catch (e) {
    claudeErr(res, e);
  }
});

// ──────────────────────────────────────────────────────────
//  CLAUDE BRAIN — additional capability-elevating endpoints
// ──────────────────────────────────────────────────────────

// Manual re-run of the post-call analysis on an existing call.
// Useful when ANTHROPIC_API_KEY was added after some calls were already logged.
app.post("/api/claude/post-call/:callId", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: call } = await db
      .from("wireline_call_logs")
      .select("*, agent_id, user_id")
      .eq("id", req.params.callId)
      .eq("user_id", req.user.id)
      .single();
    if (!call) return res.status(404).json({ error: "Call not found." });
    const { data: agent } = await db
      .from("wireline_agents")
      .select("name, archetype")
      .eq("id", call.agent_id)
      .single();

    const result = await claudeBrain.postCallAnalysis({
      agentName: agent?.name || "Wireline Agent",
      archetype: agent?.archetype || "Receptionist",
      customerNumber: call.customer_number,
      durationSeconds: call.duration_seconds,
      summary: call.summary || "",
      transcript: call.transcript || "",
    });

    await db.from("wireline_call_logs").update({
      lead_score: result.lead_score,
      intent_label: result.intent_label,
    }).eq("id", call.id);

    res.json({ analysis: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Live call coach — given a transcript or a callId, returns coaching.
app.post("/api/claude/coach", authenticateUser, async (req: any, res: any) => {
  try {
    const { transcript: rawTranscript, callId, agentId, isLive } = req.body;
    let transcript = rawTranscript as string | undefined;
    let agentName = "Wireline Agent";
    let archetype = "Receptionist";

    if (callId) {
      const { data: call } = await db.from("wireline_call_logs")
        .select("transcript, agent_id")
        .eq("id", callId).eq("user_id", req.user.id).single();
      if (call) {
        transcript = transcript || call.transcript;
        const { data: a } = await db.from("wireline_agents")
          .select("name, archetype").eq("id", call.agent_id).single();
        if (a) { agentName = a.name; archetype = a.archetype; }
      }
    } else if (agentId) {
      const { data: a } = await db.from("wireline_agents")
        .select("name, archetype").eq("id", agentId).eq("user_id", req.user.id).single();
      if (a) { agentName = a.name; archetype = a.archetype; }
    }

    if (!transcript) return res.status(400).json({ error: "Provide a transcript or callId." });

    const result = await claudeBrain.coach({ agentName, archetype, transcript, isLive: !!isLive });
    res.json({ coaching: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Knowledge ingestion from URL — Claude fetches and extracts.
app.post("/api/claude/knowledge-from-url", authenticateUser, async (req: any, res: any) => {
  try {
    const { url, agentContext, maxEntries } = req.body;
    if (!url || typeof url !== "string") return res.status(400).json({ error: "url required." });
    try { new URL(url); } catch { return res.status(400).json({ error: "url is not a valid URL." }); }
    const result = await claudeBrain.knowledgeFromUrl({ url, agentContext, maxEntries });
    res.json(result);
  } catch (e) {
    claudeErr(res, e);
  }
});

// Apply a set of extracted knowledge entries to an agent.
app.post("/api/claude/knowledge-from-url/apply", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, entries } = req.body;
    if (!agentId || !Array.isArray(entries)) {
      return res.status(400).json({ error: "agentId and entries[] required." });
    }
    const { data: agent } = await db.from("wireline_agents")
      .select("id").eq("id", agentId).eq("user_id", req.user.id).single();
    if (!agent) return res.status(404).json({ error: "Agent not found." });

    const rows = entries
      .filter((e: any) => typeof e?.fact === "string" && e.fact.trim())
      .map((e: any) => ({
        agent_id: agentId,
        user_id: req.user.id,
        content: e.fact.trim(),
      }));
    if (rows.length === 0) return res.status(400).json({ error: "No valid entries to insert." });
    await db.from("wireline_knowledge").insert(rows);
    res.json({ inserted: rows.length });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Agent Forge — synthesize a complete agent draft from a goal.
app.post("/api/claude/forge", authenticateUser, async (req: any, res: any) => {
  try {
    const { goal, industry, companyName, websiteUrl, voicePreference } = req.body;
    if (!goal) return res.status(400).json({ error: "goal required." });
    const result = await claudeBrain.forgeAgent({ goal, industry, companyName, websiteUrl, voicePreference });
    res.json({ design: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// ──────────────────────────────────────────────────────────
//  INSIGHTS — business intelligence the operator actually needs
// ──────────────────────────────────────────────────────────

// Tiny in-memory cache for the Claude-powered insights. Keyed by
// (user_id, endpoint). 1-hour TTL is plenty — the underlying data
// only changes when calls land, which is sub-daily for most SMBs.
const insightCache = new Map<string, { ts: number; data: any }>();
const INSIGHT_TTL_MS = 60 * 60 * 1000;
function cachedInsight(key: string) {
  const entry = insightCache.get(key);
  return entry && Date.now() - entry.ts < INSIGHT_TTL_MS ? entry.data : null;
}
function setCachedInsight(key: string, data: any) {
  insightCache.set(key, { ts: Date.now(), data });
}

// Conversion funnel — calls → connected → qualified → booked → completed.
app.get("/api/insights/funnel", authenticateUser, async (req: any, res: any) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: calls }, { data: appts }, { data: leads }] = await Promise.all([
      db.from("wireline_call_logs").select("lead_score, intent_label, duration_seconds").eq("user_id", req.user.id).gte("created_at", since),
      db.from("wireline_appointments").select("status").eq("user_id", req.user.id).gte("created_at", since),
      db.from("wireline_outbound_leads").select("status").eq("user_id", req.user.id).gte("created_at", since),
    ]);

    const totalCalls = calls?.length || 0;
    const connected = (calls || []).filter((c: any) => (c.duration_seconds || 0) > 10).length;
    const qualified = (calls || []).filter((c: any) => (c.lead_score || 0) >= 50).length;
    const highIntent = (calls || []).filter((c: any) => c.intent_label === "high").length;
    const bookings = (appts || []).length;
    const completed = (appts || []).filter((a: any) => a.status === "Completed").length;
    const queuedLeads = (leads || []).filter((l: any) => l.status === "Pending" || l.status === "Queued").length;

    res.json({
      window_days: days,
      stages: [
        { name: "Queued",     count: queuedLeads },
        { name: "Calls",      count: totalCalls },
        { name: "Connected",  count: connected },
        { name: "Qualified",  count: qualified },
        { name: "High intent", count: highIntent },
        { name: "Booked",     count: bookings },
        { name: "Completed",  count: completed },
      ],
    });
  } catch (e) { claudeErr(res, e); }
});

// Hour-of-day × day-of-week heatmap of call volume + lead score.
app.get("/api/insights/heatmap", authenticateUser, async (req: any, res: any) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data: calls } = await db
      .from("wireline_call_logs")
      .select("created_at, lead_score")
      .eq("user_id", req.user.id)
      .gte("created_at", since);

    // 7×24 grid: counts and avg lead score
    const grid: { hour: number; weekday: number; count: number; avg_score: number }[] = [];
    const buckets: Record<string, { c: number; s: number }> = {};
    for (const c of calls || []) {
      const d = new Date(c.created_at);
      const key = `${d.getDay()}-${d.getHours()}`;
      const b = buckets[key] || { c: 0, s: 0 };
      b.c++;
      b.s += c.lead_score || 0;
      buckets[key] = b;
    }
    for (let w = 0; w < 7; w++) {
      for (let h = 0; h < 24; h++) {
        const b = buckets[`${w}-${h}`] || { c: 0, s: 0 };
        grid.push({ weekday: w, hour: h, count: b.c, avg_score: b.c ? Math.round(b.s / b.c) : 0 });
      }
    }
    res.json({ window_days: days, grid });
  } catch (e) { claudeErr(res, e); }
});

// Per-agent leaderboard.
app.get("/api/insights/leaderboard", authenticateUser, async (req: any, res: any) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: agents }, { data: calls }, { data: appts }] = await Promise.all([
      db.from("wireline_agents").select("id, name, archetype, channel").eq("user_id", req.user.id),
      db.from("wireline_call_logs").select("agent_id, lead_score, intent_label, duration_seconds, cost").eq("user_id", req.user.id).gte("created_at", since),
      db.from("wireline_appointments").select("agent_id").eq("user_id", req.user.id).gte("created_at", since),
    ]);

    const callsByAgent: Record<string, any[]> = {};
    for (const c of calls || []) {
      const id = c.agent_id || "unknown";
      (callsByAgent[id] ||= []).push(c);
    }
    const apptsByAgent: Record<string, number> = {};
    for (const a of appts || []) apptsByAgent[a.agent_id || "unknown"] = (apptsByAgent[a.agent_id || "unknown"] || 0) + 1;

    const rows = (agents || []).map((a: any) => {
      const calls = callsByAgent[a.id] || [];
      const total = calls.length;
      const qualified = calls.filter((c) => (c.lead_score || 0) >= 50).length;
      const highIntent = calls.filter((c) => c.intent_label === "high").length;
      const minutes = Math.round(calls.reduce((s, c) => s + (c.duration_seconds || 0), 0) / 60);
      const cost = Number(calls.reduce((s, c) => s + Number(c.cost || 0), 0).toFixed(2));
      const avgScore = total ? Math.round(calls.reduce((s, c) => s + (c.lead_score || 0), 0) / total) : 0;
      const bookings = apptsByAgent[a.id] || 0;
      const costPerQualified = qualified ? Number((cost / qualified).toFixed(2)) : 0;
      return {
        agent_id: a.id,
        agent_name: a.name,
        archetype: a.archetype,
        channel: a.channel,
        total_calls: total,
        qualified,
        high_intent: highIntent,
        bookings,
        avg_lead_score: avgScore,
        minutes,
        cost,
        cost_per_qualified: costPerQualified,
        conversion_rate: total ? Math.round((qualified / total) * 100) : 0,
      };
    }).sort((a: any, b: any) => b.qualified - a.qualified);

    res.json({ window_days: days, agents: rows });
  } catch (e) { claudeErr(res, e); }
});

// Topic clusters (Claude-powered, cached 1h per user).
app.get("/api/insights/topics", authenticateUser, async (req: any, res: any) => {
  try {
    const force = req.query.refresh === "1";
    const cacheKey = `topics:${req.user.id}`;
    if (!force) {
      const cached = cachedInsight(cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }
    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude required for topic clustering.", code: "CLAUDE_OFFLINE" });
    }
    const { data: rows } = await db
      .from("wireline_call_logs")
      .select("summary, intent_label")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(120);
    if (!rows || rows.length < 3) {
      return res.json({ topics: [], total_analyzed: rows?.length || 0, message: "Not enough data yet — run more calls." });
    }
    const result = await claudeBrain.clusterTopics({
      summaries: rows.map((r: any) => ({ summary: r.summary || "", intent_label: r.intent_label })),
      windowDays: 14,
    });
    setCachedInsight(cacheKey, result);
    res.json({ ...result, cached: false });
  } catch (e) { claudeErr(res, e); }
});

// Failure modes (Claude-powered, cached 1h per user).
app.get("/api/insights/failure-modes", authenticateUser, async (req: any, res: any) => {
  try {
    const force = req.query.refresh === "1";
    const cacheKey = `failures:${req.user.id}`;
    if (!force) {
      const cached = cachedInsight(cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }
    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude required for failure analysis.", code: "CLAUDE_OFFLINE" });
    }
    const { data: rows } = await db
      .from("wireline_call_logs")
      .select("summary, transcript, lead_score, intent_label")
      .eq("user_id", req.user.id)
      .or("lead_score.lt.30,intent_label.eq.low,intent_label.eq.none")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!rows || rows.length < 2) {
      return res.json({ modes: [], message: "Not enough failed calls yet — system is performing well." });
    }
    const result = await claudeBrain.clusterFailureModes({ failedCalls: rows as any });
    setCachedInsight(cacheKey, result);
    res.json({ ...result, cached: false });
  } catch (e) { claudeErr(res, e); }
});

// Daily brief (Claude-powered, cached per-day).
app.get("/api/insights/daily-brief", authenticateUser, async (req: any, res: any) => {
  try {
    const force = req.query.refresh === "1";
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `brief:${req.user.id}:${today}`;
    if (!force) {
      const cached = cachedInsight(cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }
    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude required for the daily brief.", code: "CLAUDE_OFFLINE" });
    }

    const yStart = new Date(); yStart.setHours(0, 0, 0, 0); yStart.setDate(yStart.getDate() - 1);
    const yEnd   = new Date(yStart); yEnd.setDate(yEnd.getDate() + 1);
    const wStart = new Date(); wStart.setDate(wStart.getDate() - 7);

    const [{ data: yCalls }, { data: wCalls }, { data: appts }, { data: tasks }, { data: leads }, { data: wins }, { data: losses }] = await Promise.all([
      db.from("wireline_call_logs").select("lead_score, intent_label, duration_seconds, cost, summary, customer_number").eq("user_id", req.user.id).gte("created_at", yStart.toISOString()).lt("created_at", yEnd.toISOString()),
      db.from("wireline_call_logs").select("lead_score, duration_seconds, cost").eq("user_id", req.user.id).gte("created_at", wStart.toISOString()),
      db.from("wireline_appointments").select("id").eq("user_id", req.user.id).gte("created_at", yStart.toISOString()).lt("created_at", yEnd.toISOString()),
      db.from("wireline_fleet_tasks").select("priority, description").eq("user_id", req.user.id).eq("status", "pending").order("created_at", { ascending: false }).limit(8),
      db.from("wireline_outbound_leads").select("id").eq("user_id", req.user.id).eq("status", "Pending"),
      db.from("wireline_call_logs").select("customer_number, lead_score, summary").eq("user_id", req.user.id).gte("created_at", yStart.toISOString()).gte("lead_score", 70).order("lead_score", { ascending: false }).limit(3),
      db.from("wireline_call_logs").select("customer_number, lead_score, summary").eq("user_id", req.user.id).gte("created_at", yStart.toISOString()).lt("lead_score", 30).order("created_at", { ascending: false }).limit(3),
    ]);

    const yTotal = yCalls?.length || 0;
    const yMinutes = Math.round((yCalls || []).reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / 60);
    const yAvgScore = yTotal ? Math.round((yCalls || []).reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / yTotal) : 0;
    const yHighIntent = (yCalls || []).filter((c: any) => c.intent_label === "high").length;
    const yCost = Number((yCalls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0).toFixed(2));

    const wDays = 7;
    const wAvgPerDay = (wCalls?.length || 0) / wDays;
    const wAvgScore = wCalls?.length ? (wCalls || []).reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / wCalls.length : 0;
    const wAvgCostPerDay = (wCalls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0) / wDays;

    const callsPct = wAvgPerDay > 0 ? ((yTotal - wAvgPerDay) / wAvgPerDay) * 100 : 0;
    const scorePct = wAvgScore > 0 ? ((yAvgScore - wAvgScore) / wAvgScore) * 100 : 0;
    const costPct = wAvgCostPerDay > 0 ? ((yCost - wAvgCostPerDay) / wAvgCostPerDay) * 100 : 0;

    const result = await claudeBrain.dailyBrief({
      yesterdayStats: {
        total_calls: yTotal,
        total_minutes: yMinutes,
        avg_lead_score: yAvgScore,
        high_intent_count: yHighIntent,
        cost: yCost,
        appointments_booked: appts?.length || 0,
        pending_tasks: tasks?.length || 0,
        new_leads: leads?.length || 0,
      },
      weekDelta: { calls_pct: callsPct, score_pct: scorePct, cost_pct: costPct },
      recentWinSamples: (wins || []).map((w: any) => ({ customer: w.customer_number || "Unknown", score: w.lead_score || 0, summary: w.summary || "" })),
      recentLossSamples: (losses || []).map((w: any) => ({ customer: w.customer_number || "Unknown", score: w.lead_score || 0, summary: w.summary || "" })),
      openTasks: (tasks || []).map((t: any) => ({ priority: t.priority, description: t.description })),
    });

    const payload = {
      brief: result,
      stats_yesterday: {
        total_calls: yTotal,
        total_minutes: yMinutes,
        avg_lead_score: yAvgScore,
        high_intent_count: yHighIntent,
        cost: yCost,
        appointments_booked: appts?.length || 0,
      },
      week_delta: { calls_pct: callsPct, score_pct: scorePct, cost_pct: costPct },
    };
    setCachedInsight(cacheKey, payload);
    res.json({ ...payload, cached: false });
  } catch (e) { claudeErr(res, e); }
});

// ──────────────────────────────────────────────────────────
//  TRIAGE INBOX — "what needs my attention right now"
// ──────────────────────────────────────────────────────────

app.get("/api/triage", authenticateUser, async (req: any, res: any) => {
  try {
    const [{ data: hotLeads }, { data: complianceTasks }, { data: pendingTasks }, { data: knowledgeGaps }, { data: escalations }] = await Promise.all([
      // Calls with high lead score from the last 7 days that don't have a follow-up logged.
      db.from("wireline_call_logs")
        .select("id, agent_id, customer_number, lead_score, intent_label, summary, created_at")
        .eq("user_id", req.user.id)
        .gte("lead_score", 70)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("lead_score", { ascending: false })
        .limit(30),
      db.from("wireline_fleet_tasks")
        .select("*")
        .eq("user_id", req.user.id)
        .eq("task_type", "compliance_review")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("wireline_fleet_tasks")
        .select("*")
        .eq("user_id", req.user.id)
        .eq("status", "pending")
        .neq("task_type", "compliance_review")
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("wireline_agent_lessons")
        .select("id, agent_id, lesson, created_at")
        .eq("user_id", req.user.id)
        .like("lesson", "[KNOWLEDGE GAP]%")
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("wireline_call_logs")
        .select("id, agent_id, customer_number, lead_score, summary, created_at")
        .eq("user_id", req.user.id)
        .or("intent_label.eq.escalation")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    res.json({
      hot_leads: hotLeads || [],
      compliance: complianceTasks || [],
      pending_tasks: pendingTasks || [],
      knowledge_gaps: knowledgeGaps || [],
      escalations: escalations || [],
      counts: {
        hot_leads: hotLeads?.length || 0,
        compliance: complianceTasks?.length || 0,
        pending_tasks: pendingTasks?.length || 0,
        knowledge_gaps: knowledgeGaps?.length || 0,
        escalations: escalations?.length || 0,
      },
    });
  } catch (e) { claudeErr(res, e); }
});

// Promote a [KNOWLEDGE GAP] lesson into the agent's knowledge base.
app.post("/api/knowledge-gaps/:lessonId/promote", authenticateUser, async (req: any, res: any) => {
  try {
    const { customContent } = req.body;
    const { data: lesson } = await db
      .from("wireline_agent_lessons")
      .select("id, agent_id, lesson, user_id")
      .eq("id", req.params.lessonId)
      .eq("user_id", req.user.id)
      .single();
    if (!lesson) return res.status(404).json({ error: "Lesson not found." });

    const content =
      customContent?.trim() ||
      lesson.lesson.replace(/^\[KNOWLEDGE GAP\]\s*/, "").trim();

    if (!content) return res.status(400).json({ error: "Content is empty." });

    await db.from("wireline_knowledge").insert({
      agent_id: lesson.agent_id,
      user_id: req.user.id,
      content,
    });
    await db.from("wireline_agent_lessons").delete().eq("id", lesson.id);
    res.json({ success: true });
  } catch (e) { claudeErr(res, e); }
});

// ──────────────────────────────────────────────────────────
//  CONTACT PROFILE — unified per-customer history
// ──────────────────────────────────────────────────────────

app.get("/api/contacts/:number", authenticateUser, async (req: any, res: any) => {
  try {
    const number = decodeURIComponent(req.params.number);
    // Strip non-digits then take the last 10 — gives us a normalized form.
    const norm = number.replace(/\D/g, "").slice(-10);
    if (!norm) return res.status(400).json({ error: "Invalid phone number." });

    // Match: exact, or anything ending in the same last-10-digits.
    const [{ data: calls }, { data: leads }, { data: appts }] = await Promise.all([
      db.from("wireline_call_logs")
        .select("id, agent_id, direction, customer_number, duration_seconds, cost, summary, transcript, recording_url, lead_score, intent_label, created_at")
        .eq("user_id", req.user.id)
        .ilike("customer_number", `%${norm}`)
        .order("created_at", { ascending: false }),
      db.from("wireline_outbound_leads")
        .select("id, agent_id, customer_name, status, context, last_called_at, created_at, phone_number")
        .eq("user_id", req.user.id)
        .ilike("phone_number", `%${norm}`)
        .order("created_at", { ascending: false }),
      db.from("wireline_appointments")
        .select("id, agent_id, customer_name, service_type, date, time, status, created_at")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false }),
    ]);

    // The first lead/call gives us a candidate name.
    const customerName =
      leads?.[0]?.customer_name ||
      appts?.[0]?.customer_name ||
      null;

    // Build a unified timeline.
    const timeline: any[] = [];
    for (const c of calls || []) {
      timeline.push({
        type: c.direction === "inbound" ? "call_in" : "call_out",
        id: c.id,
        ts: c.created_at,
        duration_seconds: c.duration_seconds,
        cost: c.cost,
        summary: c.summary,
        lead_score: c.lead_score,
        intent_label: c.intent_label,
        recording_url: c.recording_url,
        agent_id: c.agent_id,
      });
    }
    for (const a of appts || []) {
      // Only include appointments where the customer name matches one of our leads/calls
      if (customerName && a.customer_name && a.customer_name.toLowerCase().trim() === customerName.toLowerCase().trim()) {
        timeline.push({
          type: "appointment",
          id: a.id,
          ts: a.created_at,
          summary: `${a.service_type} — ${a.date} ${a.time}`,
          status: a.status,
          agent_id: a.agent_id,
        });
      }
    }
    timeline.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    const totalCalls = calls?.length || 0;
    const totalMinutes = Math.round((calls || []).reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / 60);
    const totalCost = Number((calls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0).toFixed(2));
    const avgScore = totalCalls ? Math.round((calls || []).reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / totalCalls) : 0;
    const lastTouch = calls?.[0]?.created_at || leads?.[0]?.created_at || null;

    res.json({
      number: number,
      normalized: norm,
      customer_name: customerName,
      stats: {
        total_calls: totalCalls,
        total_minutes: totalMinutes,
        total_cost: totalCost,
        avg_lead_score: avgScore,
        last_touch: lastTouch,
        outbound_leads: leads?.length || 0,
        appointments: appts?.filter((a: any) => customerName && a.customer_name?.toLowerCase().trim() === customerName.toLowerCase().trim()).length || 0,
      },
      timeline,
      leads: leads || [],
      appointments: (appts || []).filter((a: any) => customerName && a.customer_name?.toLowerCase().trim() === customerName.toLowerCase().trim()),
    });
  } catch (e) { claudeErr(res, e); }
});

// Agent Forge — create the actual agent + seed personality, directives, knowledge.
app.post("/api/claude/forge/create", authenticateUser, async (req: any, res: any) => {
  try {
    const { design, websiteUrl } = req.body;
    if (!design || !design.name) return res.status(400).json({ error: "design with name required." });

    const agentId = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const { error: agentErr } = await db.from("wireline_agents").insert({
      id: agentId,
      user_id: req.user.id,
      name: design.name,
      archetype: design.archetype || "Receptionist",
      first_message: design.first_message || `Hi, this is ${design.name}. How can I help?`,
      website_url: websiteUrl || null,
      channel: "voice",
    });
    if (agentErr) throw agentErr;

    if (design.personality_block) {
      await db.from("wireline_personality").upsert({
        agent_id: agentId,
        user_id: req.user.id,
        content: design.personality_block,
      });
    }

    const directiveRows = (design.directives || []).map((d: any) => ({
      agent_id: agentId,
      user_id: req.user.id,
      content: d.content,
      priority: d.priority ?? 5,
    }));
    if (directiveRows.length) await db.from("wireline_directives").insert(directiveRows);

    const knowledgeRows = (design.seed_knowledge || []).map((k: string) => ({
      agent_id: agentId,
      user_id: req.user.id,
      content: k,
    }));
    if (knowledgeRows.length) await db.from("wireline_knowledge").insert(knowledgeRows);

    res.json({ success: true, agentId });
  } catch (e) {
    claudeErr(res, e);
  }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
