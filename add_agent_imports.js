import fs from 'fs';

const imports = `import { db, log, auditLogger } from "../lib/server-context";
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
`;

const content = fs.readFileSync('src/routes/agent-routes.ts', 'utf-8');
const lines = content.split('\\n');
lines.splice(1, 0, imports);
fs.writeFileSync('src/routes/agent-routes.ts', lines.join('\\n'));

console.log("Imports added.");
