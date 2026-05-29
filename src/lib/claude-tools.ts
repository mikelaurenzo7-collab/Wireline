/**
 * Claude Tool Schemas
 * ---------------------------------------------------------------------------
 * Pre-built Anthropic tool schemas — one per recipe. These define the
 * structured output shapes that Claude must produce when called via
 * `runStructured` with `tool_choice: { type: 'tool', name: ... }`.
 *
 * Extracted from claude-brain.ts for maintainability. Each schema maps
 * to a convenience wrapper in claude-recipes.ts.
 */

import type { ToolSchema } from "./claude-structured";

export const TOOLS = {
  /** Pre-call briefing — what to lead with, what to anticipate, how to close. */
  brief: {
    name: "deliver_brief",
    description: "Deliver a tactical pre-call briefing for an outbound carrier signal.",
    input_schema: {
      type: "object",
      properties: {
        opening_line: {
          type: "string",
          description: "First sentence the agent should say (≤25 words).",
        },
        intent_hypothesis: {
          type: "string",
          description: "Best guess at why this lead matters / what they need.",
        },
        key_questions: {
          type: "array",
          items: { type: "string" },
          description: "3–5 questions to qualify the lead, in order of priority.",
        },
        objections_to_anticipate: {
          type: "array",
          items: {
            type: "object",
            properties: {
              objection: { type: "string" },
              response: { type: "string" },
            },
            required: ["objection", "response"],
            additionalProperties: false,
          },
          description: "2–4 likely objections + concise rebuttals.",
        },
        value_props: {
          type: "array",
          items: { type: "string" },
          description: "Top 2–3 value propositions to emphasize.",
        },
        closing_strategy: {
          type: "string",
          description: "How to land the meeting / next step.",
        },
        risk_flags: {
          type: "array",
          items: { type: "string" },
          description: "Anything to watch out for (compliance, escalation, etc.).",
        },
      },
      required: [
        "opening_line",
        "intent_hypothesis",
        "key_questions",
        "objections_to_anticipate",
        "value_props",
        "closing_strategy",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** BANT lead qualification — Budget, Authority, Need, Timeline. */
  qualify: {
    name: "score_qualification",
    description:
      "Score a lead against BANT (Budget / Authority / Need / Timeline) plus an aggregate score.",
    input_schema: {
      type: "object",
      properties: {
        budget: {
          type: "object",
          properties: {
            score: { type: "integer", minimum: 0, maximum: 100 },
            evidence: { type: "string" },
          },
          required: ["score", "evidence"],
          additionalProperties: false,
        },
        authority: {
          type: "object",
          properties: {
            score: { type: "integer", minimum: 0, maximum: 100 },
            evidence: { type: "string" },
          },
          required: ["score", "evidence"],
          additionalProperties: false,
        },
        need: {
          type: "object",
          properties: {
            score: { type: "integer", minimum: 0, maximum: 100 },
            evidence: { type: "string" },
          },
          required: ["score", "evidence"],
          additionalProperties: false,
        },
        timeline: {
          type: "object",
          properties: {
            score: { type: "integer", minimum: 0, maximum: 100 },
            evidence: { type: "string" },
          },
          required: ["score", "evidence"],
          additionalProperties: false,
        },
        total_score: { type: "integer", minimum: 0, maximum: 100 },
        qualification_label: {
          type: "string",
          enum: ["hot", "warm", "cool", "cold", "disqualified"],
        },
        recommended_next_step: { type: "string" },
        reasoning: { type: "string" },
      },
      required: [
        "budget",
        "authority",
        "need",
        "timeline",
        "total_score",
        "qualification_label",
        "recommended_next_step",
        "reasoning",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Objection-drill — practice scenarios for an agent. */
  objectionDrill: {
    name: "compose_drill",
    description:
      "Compose realistic objection-handling drills — scenario, prospect line, recommended agent response, and a coaching note.",
    input_schema: {
      type: "object",
      properties: {
        scenarios: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              prospect_says: { type: "string" },
              recommended_response: { type: "string" },
              coaching_note: { type: "string" },
              difficulty: {
                type: "string",
                enum: ["easy", "medium", "hard"],
              },
            },
            required: [
              "title",
              "prospect_says",
              "recommended_response",
              "coaching_note",
              "difficulty",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["scenarios"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Cold-email composer. */
  coldEmail: {
    name: "compose_cold_email",
    description: "Compose a cold-outreach email tailored to a lead.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Subject line (≤60 chars)." },
        body: { type: "string", description: "Email body (plain text, no signature)." },
        personalization_notes: {
          type: "array",
          items: { type: "string" },
          description: "Bullet list of which lead facts shaped the message.",
        },
        suggested_followup_date: {
          type: "string",
          description: "ISO date for follow-up if no reply (e.g. 2026-05-09).",
        },
      },
      required: ["subject", "body", "personalization_notes"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Persona cloning — convert sample messages into a personality block. */
  personaClone: {
    name: "compile_persona",
    description:
      "Distill a personality block from sample messages, capturing tone, do/don't rules, and a usable persona prompt.",
    input_schema: {
      type: "object",
      properties: {
        persona_block: {
          type: "string",
          description: "A self-contained personality block to drop into the agent's system prompt.",
        },
        tone_summary: { type: "string" },
        signature_phrases: { type: "array", items: { type: "string" } },
        do_rules: { type: "array", items: { type: "string" } },
        dont_rules: { type: "array", items: { type: "string" } },
      },
      required: ["persona_block", "tone_summary", "signature_phrases", "do_rules", "dont_rules"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Email-thread summarizer with action items + sentiment. */
  threadSummary: {
    name: "summarize_thread",
    description:
      "Summarize an email thread, extracting key points, action items, sentiment, and recommended next step.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "1–2 sentence overall summary." },
        key_points: { type: "array", items: { type: "string" } },
        action_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              owner: { type: "string", enum: ["us", "customer"] },
              description: { type: "string" },
              due_hint: { type: "string" },
            },
            required: ["owner", "description"],
            additionalProperties: false,
          },
        },
        sentiment: {
          type: "string",
          enum: ["positive", "neutral", "frustrated", "angry", "delighted"],
        },
        urgency: { type: "string", enum: ["low", "medium", "high", "critical"] },
        recommended_next_step: { type: "string" },
      },
      required: [
        "summary",
        "key_points",
        "action_items",
        "sentiment",
        "urgency",
        "recommended_next_step",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Intent router — fast classification. */
  intent: {
    name: "route_intent",
    description: "Classify the message intent for routing.",
    input_schema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: [
            "sales_inquiry",
            "support_request",
            "billing_question",
            "appointment_booking",
            "complaint",
            "spam",
            "escalation",
            "general_info",
          ],
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        rationale: { type: "string" },
      },
      required: ["intent", "confidence", "rationale"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Single-pass post-call analysis — replaces 3 separate Gemini calls. */
  postCallAnalysis: {
    name: "record_post_call_analysis",
    description:
      "Record the complete post-call analysis: lead score, intent, sentiment, lessons, action items, compliance flags, and knowledge gaps — all in one structured payload.",
    input_schema: {
      type: "object",
      properties: {
        lead_score: { type: "integer", minimum: 0, maximum: 100 },
        intent_label: { type: "string", enum: ["high", "medium", "low", "none"] },
        sentiment: {
          type: "string",
          enum: ["delighted", "positive", "neutral", "frustrated", "angry"],
        },
        lesson: {
          type: "string",
          description:
            "ONE specific tactical improvement for the agent based on this call. Empty string if no lesson worth promoting.",
        },
        action_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              priority: { type: "string", enum: ["high", "medium", "low"] },
              target_channel: { type: "string", enum: ["email", "phone", "manual", "sms"] },
            },
            required: ["description", "priority", "target_channel"],
            additionalProperties: false,
          },
          description:
            "Follow-up tasks promised on the call or implied by the customer's request. Empty if nothing to do.",
        },
        compliance_flags: {
          type: "array",
          items: { type: "string" },
          description:
            "Potential regulatory or compliance issues (TCPA disclosure missed, GDPR data request, recording consent, refund-policy mismatch, etc).",
        },
        knowledge_gaps: {
          type: "array",
          items: { type: "string" },
          description:
            "Topics the agent could not answer authoritatively — should be added to the knowledge base.",
        },
        coaching_note: {
          type: "string",
          description: "One-sentence note for a human reviewer summarising performance.",
        },
      },
      required: [
        "lead_score",
        "intent_label",
        "sentiment",
        "lesson",
        "action_items",
        "compliance_flags",
        "knowledge_gaps",
        "coaching_note",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** V2A Extraction — extracts deep business actions for autonomous execution. */
  businessActions: {
    name: "extract_business_actions",
    description:
      "Extract deep, structured business actions from a call transcript for autonomous execution (email, SMS, calendar, CRM, and internal follow-up).",
    input_schema: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "send_email",
                  "send_text_message",
                  "schedule_calendar",
                  "update_crm_lead",
                  "create_internal_task",
                ],
              },
              priority: { type: "string", enum: ["high", "medium", "low"] },
              reasoning: {
                type: "string",
                description: "Why this action is necessary based on the transcript.",
              },
              payload: {
                type: "object",
                description:
                  "Structured data for the action. For send_email: {to, subject, body}. For send_text_message: {to, body, channel}. For schedule_calendar: {event_name, date, time, attendees}. For update_crm_lead: {customer_number, status, notes}.",
              },
            },
            required: ["type", "priority", "payload", "reasoning"],
            additionalProperties: false,
          },
        },
      },
      required: ["actions"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Live in-call coach. */
  coach: {
    name: "deliver_live_coaching",
    description:
      "Deliver real-time coaching for an in-progress or completed call. Identify what is working, what is at risk, and what the agent should say next.",
    input_schema: {
      type: "object",
      properties: {
        sentiment: {
          type: "string",
          enum: ["delighted", "positive", "neutral", "frustrated", "angry"],
        },
        engagement: { type: "string", enum: ["high", "medium", "low", "disengaged"] },
        escalation_risk: {
          type: "string",
          enum: ["none", "low", "medium", "high", "imminent"],
        },
        whats_working: { type: "array", items: { type: "string" } },
        whats_at_risk: { type: "array", items: { type: "string" } },
        missed_opportunities: { type: "array", items: { type: "string" } },
        suggested_next_words: {
          type: "string",
          description: "What the agent should say next, written verbatim. ≤30 words.",
        },
        compliance_alerts: { type: "array", items: { type: "string" } },
      },
      required: [
        "sentiment",
        "engagement",
        "escalation_risk",
        "whats_working",
        "whats_at_risk",
        "missed_opportunities",
        "suggested_next_words",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Agent Forge — synthesize a full agent design from a goal. */
  agentForge: {
    name: "design_complete_agent",
    description:
      "Design a complete autonomous voice/email agent given a goal: name, archetype, first message, personality block, directives, and seed knowledge.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        archetype: {
          type: "string",
          enum: ["Receptionist", "The Closer", "Support Tech", "The Empath"],
        },
        first_message: {
          type: "string",
          description: "What the agent says when answering or starting a call. ≤25 words.",
        },
        personality_block: {
          type: "string",
          description: "A self-contained personality block to drop into the agent's system prompt.",
        },
        suggested_voice_tone: { type: "string" },
        directives: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string" },
              priority: { type: "integer", minimum: 1, maximum: 10 },
            },
            required: ["content", "priority"],
            additionalProperties: false,
          },
          description: "5–8 absolute rules / tactical directives.",
        },
        seed_knowledge: {
          type: "array",
          items: { type: "string" },
          description:
            "5–10 atomic knowledge entries the agent needs to do its job. If specific facts aren't known, write them as TODO placeholders the operator can fill in.",
        },
        success_metrics: {
          type: "array",
          items: { type: "string" },
          description: "How the operator will know this agent is working.",
        },
        reasoning: { type: "string" },
      },
      required: [
        "name",
        "archetype",
        "first_message",
        "personality_block",
        "directives",
        "seed_knowledge",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Daily executive brief — Claude's morning take. */
  dailyBrief: {
    name: "deliver_daily_brief",
    description:
      "Deliver a concise executive brief summarizing the previous day's agent activity for an SMB owner.",
    input_schema: {
      type: "object",
      properties: {
        headline: { type: "string", description: "≤14 words. The day's story in one line." },
        mood: { type: "string", enum: ["green", "yellow", "red"] },
        key_metrics_takeaway: {
          type: "string",
          description: "1–2 sentences interpreting the headline numbers.",
        },
        highlights: {
          type: "array",
          items: { type: "string" },
          description: "Wins, breakthroughs, surprises (2–4 items).",
        },
        concerns: {
          type: "array",
          items: { type: "string" },
          description: "Risks, regressions, things to watch (0–4 items).",
        },
        action_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              urgency: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["description", "urgency"],
            additionalProperties: false,
          },
          description: "Concrete things the operator should do today (1–4 items).",
        },
      },
      required: [
        "headline",
        "mood",
        "key_metrics_takeaway",
        "highlights",
        "concerns",
        "action_items",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Topic clustering across recent transcripts/summaries. */
  topicClusters: {
    name: "cluster_topics",
    description:
      "Cluster the recent calls/emails into a small set of meaningful topics with counts and example quotes.",
    input_schema: {
      type: "object",
      properties: {
        topics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Short topic name (≤4 words)." },
              count: { type: "integer", minimum: 1 },
              category: {
                type: "string",
                enum: ["sales", "support", "complaint", "info", "billing", "appointment", "other"],
              },
              example_quote: { type: "string" },
              trend: { type: "string", enum: ["new", "growing", "steady", "declining"] },
            },
            required: ["name", "count", "category", "example_quote"],
            additionalProperties: false,
          },
        },
        total_analyzed: { type: "integer", minimum: 0 },
      },
      required: ["topics", "total_analyzed"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Failure-mode clustering across low-score / escalated calls. */
  failureModes: {
    name: "cluster_failure_modes",
    description:
      "Cluster reasons calls fail (low intent, escalations, knowledge gaps, transfer requests) and recommend a fix per cluster.",
    input_schema: {
      type: "object",
      properties: {
        modes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              failure_type: { type: "string", description: "Short name (≤6 words)." },
              count: { type: "integer", minimum: 1 },
              severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
              description: { type: "string" },
              recommended_fix: { type: "string" },
              fix_target: {
                type: "string",
                enum: ["directive", "knowledge", "personality", "process", "other"],
              },
            },
            required: [
              "failure_type",
              "count",
              "severity",
              "description",
              "recommended_fix",
              "fix_target",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["modes"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Knowledge dedupe — clusters near-duplicate facts. */
  knowledgeDedupe: {
    name: "cluster_knowledge_duplicates",
    description:
      "Find clusters of near-duplicate or contradictory knowledge facts. Use the input ids verbatim. Skip facts that have no plausible duplicates.",
    input_schema: {
      type: "object",
      properties: {
        clusters: {
          type: "array",
          description:
            "Groups of 2+ facts that say the same thing or contradict each other. Don't include singletons. Don't repeat ids across clusters.",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["duplicate", "near_duplicate", "contradiction"],
                description:
                  "duplicate = essentially identical wording. near_duplicate = same fact, different phrasing. contradiction = facts disagree.",
              },
              reason: {
                type: "string",
                description: "1-sentence explanation of why these belong together.",
              },
              recommended_keep_id: {
                type: "integer",
                description:
                  "Which fact id to keep (most accurate / clearest). MUST be one of the ids in this cluster.",
              },
              suggested_canonical_content: {
                type: "string",
                description:
                  "Optional improved version that consolidates the cluster. Operator can choose to apply this as an edit to the kept fact.",
              },
              members: {
                type: "array",
                minItems: 2,
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    note: {
                      type: "string",
                      description:
                        "Brief note about this specific member — e.g. 'redundant', 'older phrasing', 'contradicts the others on price'.",
                    },
                  },
                  required: ["id"],
                  additionalProperties: false,
                },
              },
            },
            required: ["kind", "reason", "recommended_keep_id", "members"],
            additionalProperties: false,
          },
        },
        total_analyzed: { type: "integer", minimum: 0 },
      },
      required: ["clusters", "total_analyzed"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Pre-call lead enrichment. */
  enrichLead: {
    name: "deliver_lead_enrichment",
    description:
      "Deliver the structured pre-call enrichment after web-searching. Be honest about confidence — low is fine when the data is thin.",
    input_schema: {
      type: "object",
      properties: {
        research_confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
          description:
            "high = found specific person + employer on a reputable source. medium = likely match. low = couldn't pin down.",
        },
        identity_summary: {
          type: "string",
          description:
            "1-2 sentence working hypothesis for who this is. If confidence is low, say so.",
        },
        company_name: { type: "string" },
        role: { type: "string", description: "Job title or function." },
        industry: { type: "string" },
        company_size: {
          type: "string",
          description: "e.g. '11-50 employees', 'Fortune 500', 'mom-and-pop', 'unknown'.",
        },
        recent_signals: {
          type: "array",
          items: { type: "string" },
          description:
            "Notable recent activity — funding, press, hiring, product launches, layoffs. Empty array if none found.",
        },
        conversation_hooks: {
          type: "array",
          minItems: 1,
          items: { type: "string" },
          description:
            "3-5 specific things to mention to build rapport or relevance. Always at least one.",
        },
        likely_objections: {
          type: "array",
          items: { type: "string" },
          description:
            "2-3 objections this person might raise based on role/industry. Empty array if confidence is too low to guess.",
        },
        sources: {
          type: "array",
          items: { type: "string" },
          description:
            "Up to 6 source URLs that informed this enrichment. Empty if no sources used.",
        },
      },
      required: [
        "research_confidence",
        "identity_summary",
        "conversation_hooks",
        "likely_objections",
        "recent_signals",
        "sources",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Used by the URL-based knowledge ingestion path. */
  knowledgeFromUrl: {
    name: "deliver_knowledge_entries",
    description: "After fetching the page, deliver atomic knowledge entries the agent can use.",
    input_schema: {
      type: "object",
      properties: {
        page_summary: { type: "string" },
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fact: { type: "string" },
              category: {
                type: "string",
                enum: ["service", "pricing", "hours", "contact", "policy", "faq", "general"],
              },
            },
            required: ["fact", "category"],
            additionalProperties: false,
          },
        },
      },
      required: ["page_summary", "entries"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Deep agent performance review. */
  agentReview: {
    name: "deliver_review",
    description:
      "Deliver a deep performance review of an autonomous voice agent, with concrete tactical recommendations.",
    input_schema: {
      type: "object",
      properties: {
        overall_grade: { type: "string", enum: ["A+", "A", "B", "C", "D", "F"] },
        executive_summary: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        weaknesses: { type: "array", items: { type: "string" } },
        suggested_directives: {
          type: "array",
          items: {
            type: "object",
            properties: {
              priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
              directive: { type: "string" },
              rationale: { type: "string" },
            },
            required: ["priority", "directive", "rationale"],
            additionalProperties: false,
          },
        },
        suggested_knowledge_entries: { type: "array", items: { type: "string" } },
        suggested_archetype: {
          type: "string",
          enum: ["Receptionist", "The Closer", "Support Tech", "The Empath"],
        },
        risk_alerts: { type: "array", items: { type: "string" } },
      },
      required: [
        "overall_grade",
        "executive_summary",
        "strengths",
        "weaknesses",
        "suggested_directives",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Quick email reply suggestions — 3 short, ready-to-send reply options. */
  quickReplies: {
    name: "deliver_quick_replies",
    description:
      "Deliver 3 short, distinct, ready-to-send email reply options for the latest customer message.",
    input_schema: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          description: "Exactly 3 reply options.",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description:
                  "Short 2-4 word action label shown as a chip (e.g. 'Confirm & proceed').",
              },
              body: {
                type: "string",
                description: "Complete email body, ≤60 words, plain text, no placeholders.",
              },
            },
            required: ["label", "body"],
            additionalProperties: false,
          },
          minItems: 3,
          maxItems: 3,
        },
      },
      required: ["suggestions"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Call quality scoring — 5 dimensions × 20 pts = 100 total. */
  qaScore: {
    name: "score_call_quality",
    description:
      "Score a call recording/transcript against a 5-dimension QA rubric. Each dimension is 0–20 points (total 0–100). Be precise and evidence-based — cite specific moments in the transcript where the score was earned or lost.",
    input_schema: {
      type: "object",
      properties: {
        greeting: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          description:
            "Opening & Greeting — professional, warm, identified company and purpose clearly.",
        },
        discovery: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          description:
            "Problem Discovery — asked thoughtful open-ended questions, understood the customer's actual situation.",
        },
        solution: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          description:
            "Solution Presentation — clear, relevant, directly addressed the customer's stated needs.",
        },
        objection: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          description:
            "Objection Handling — handled pushback calmly, didn't oversell, addressed concerns with evidence.",
        },
        closing: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          description:
            "Closing & Next Steps — strong close, set clear next steps or outcome, no ambiguity.",
        },
        coaching_note: {
          type: "string",
          description:
            "One sentence the operator should act on — the single highest-leverage improvement for this agent.",
        },
        strengths: {
          type: "array",
          items: { type: "string" },
          description: "1–3 specific things the agent did well on this call.",
        },
        improvements: {
          type: "array",
          items: { type: "string" },
          description: "1–3 specific, actionable improvements for next time.",
        },
      },
      required: ["greeting", "discovery", "solution", "objection", "closing", "coaching_note"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Call playbook — branching script for a role + scenario. */
  callPlaybook: {
    name: "build_call_playbook",
    description:
      "Build a complete call playbook for an agent role and scenario: opening hook, discovery questions, value prop delivery, objection handlers, closing variants, and a voicemail script. Make every line ready to say verbatim.",
    input_schema: {
      type: "object",
      properties: {
        opening_hook: {
          type: "string",
          description:
            "The exact words the agent should say when the call connects (≤25 words). Warm, specific, and professional.",
        },
        purpose_statement: {
          type: "string",
          description: "One sentence explaining the call's purpose after the greeting (≤20 words).",
        },
        discovery_questions: {
          type: "array",
          description: "4–6 open-ended questions to uncover needs, in order of priority.",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The exact question to ask." },
              intent: {
                type: "string",
                description: "What this question is designed to uncover (≤10 words).",
              },
              follow_up: {
                type: "string",
                description: "A natural follow-up if the answer is vague (≤15 words).",
              },
            },
            required: ["question", "intent"],
            additionalProperties: false,
          },
        },
        value_prop_script: {
          type: "string",
          description:
            "The core value proposition delivered in 2–3 sentences. Outcome-first, proof point included.",
        },
        objection_handlers: {
          type: "array",
          description: "Top 4 objections with a scripted response for each.",
          items: {
            type: "object",
            properties: {
              objection: {
                type: "string",
                description: "Exact words or paraphrase of the objection.",
              },
              response: {
                type: "string",
                description: "Complete scripted response (2–4 sentences).",
              },
              technique: {
                type: "string",
                enum: [
                  "acknowledge_redirect",
                  "reframe_roi",
                  "social_proof",
                  "feel_felt_found",
                  "clarifying_question",
                ],
              },
            },
            required: ["objection", "response", "technique"],
            additionalProperties: false,
          },
        },
        closing_variants: {
          type: "array",
          description: "3 closing scripts — assumptive, alternative-choice, and soft ask.",
          items: {
            type: "object",
            properties: {
              style: { type: "string", enum: ["assumptive", "alternative_choice", "soft_ask"] },
              script: { type: "string", description: "Complete closing line (≤30 words)." },
            },
            required: ["style", "script"],
            additionalProperties: false,
          },
          minItems: 3,
          maxItems: 3,
        },
        voicemail_script: {
          type: "string",
          description:
            "A 15–20 second voicemail script (spoken aloud) for when nobody answers. Includes name, company, reason, callback number placeholder.",
        },
        success_criteria: {
          type: "string",
          description: "What a 'win' looks like on this type of call in one sentence.",
        },
      },
      required: [
        "opening_hook",
        "purpose_statement",
        "discovery_questions",
        "value_prop_script",
        "objection_handlers",
        "closing_variants",
        "voicemail_script",
        "success_criteria",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** CRM: search contacts in the operator's connected CRM (Salesforce or HubSpot). */
  crmSearchContacts: {
    name: "crm_search_contacts",
    description:
      "Search the operator's connected CRM for contacts matching a name, phone number, or email. Returns up to 10 results with CRM IDs for follow-up actions. No-ops gracefully when no CRM is configured.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, phone, or email fragment to search." },
        crm: {
          type: "string",
          enum: ["salesforce", "hubspot", "auto"],
          description: "Which CRM to search. 'auto' tries whichever is configured.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** CRM: log a completed call to the operator's CRM. */
  crmLogCall: {
    name: "crm_log_call",
    description:
      "Log a completed voice call to the operator's CRM (Salesforce Task or HubSpot Call object). Attaches summary, duration, outcome, and optionally links to an existing contact. No-ops when no CRM is configured.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Call subject / title (≤80 chars)." },
        description: { type: "string", description: "Call summary or notes." },
        contact_id: { type: "string", description: "CRM contact ID to associate (optional)." },
        to_number: { type: "string", description: "Customer phone number." },
        duration_minutes: { type: "number", description: "Call duration in minutes." },
        outcome: {
          type: "string",
          enum: ["connected", "voicemail", "no_answer", "busy", "wrong_number"],
          description: "Call disposition.",
        },
        crm: { type: "string", enum: ["salesforce", "hubspot", "auto"] },
      },
      required: ["subject", "description", "to_number"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** CRM: create an opportunity or deal from a qualified call. */
  crmCreateOpportunity: {
    name: "crm_create_opportunity",
    description:
      "Create a new Salesforce Opportunity or HubSpot Deal from a qualified lead. Use after a high-intent call to push the outcome into the operator's pipeline. No-ops when no CRM is configured.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Opportunity / deal name." },
        contact_id: { type: "string", description: "CRM contact ID to associate (optional)." },
        stage: {
          type: "string",
          description: "Pipeline stage (e.g. 'Prospecting', 'appointmentscheduled').",
        },
        amount: { type: "number", description: "Estimated deal value in USD (optional)." },
        close_date: {
          type: "string",
          description: "Expected close date (YYYY-MM-DD). Defaults to 30 days out.",
        },
        crm: { type: "string", enum: ["salesforce", "hubspot", "auto"] },
      },
      required: ["name"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Slack: post a notification to the operator's team channel. */
  notifySlack: {
    name: "notify_slack",
    description:
      "Post a notification to the operator's connected Slack workspace. Use to alert the team about important outcomes: hot leads, booked meetings, escalations, or key deal milestones. No-ops when Slack is not connected.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The notification message to post to Slack." },
        channel: {
          type: "string",
          description:
            "Optional Slack channel ID to post to. Defaults to the operator's configured default channel.",
        },
      },
      required: ["message"],
      additionalProperties: false,
    },
  } as ToolSchema,
} as const;

// Standalone supervisor schemas (not part of the TOOLS registry) live in a
// sibling module. Re-exported here so existing import paths keep working.
export { CLIENT_COMMUNICATION_SUPERVISOR_TOOL, SCORE_INTENT_TOOL } from "./claude-supervisor-tools";
