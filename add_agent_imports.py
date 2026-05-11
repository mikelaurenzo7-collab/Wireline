imports = """import { db, log, auditLogger } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage, sanitizeForAudit } from "../lib/server-utils";
import { parseFormData, AgentFormSchema, AgentBusinessProfileSchema } from "../lib/form-validators";
import { ROLE_PERSONALITY_TEMPLATES } from "../lib/agent-constants";
import * as claudeBrain from "../lib/claude-brain";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { computeAgentPerformance, emptyAgentPerformance } from "../lib/agent-performance";
import { computeScorecard } from "../lib/agent-scorecard";
import { SentryEvents } from "../lib/sentry-events";

const DEFAULT_AGENT_ROLE = "customer_service";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
"""

with open('src/routes/agent-routes.ts', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\\n')
# insert at line 1 (after import { Router } from "express";)
lines.insert(1, imports)

with open('src/routes/agent-routes.ts', 'w', encoding='utf-8') as f:
    f.write('\\n'.join(lines))
