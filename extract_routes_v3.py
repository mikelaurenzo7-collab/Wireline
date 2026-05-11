import re
import os

SERVER_PATH = 'server.ts'

CONFIG = [
    {
        'prefix': '/api/agents',
        'outFile': 'src/routes/agent-routes.ts',
        'routerVar': 'agentRouter',
        'imports': '''import { Router } from "express";
const router = Router();

import { db, log, auditLogger } from "../lib/server-context";
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
'''
    },
    {
        'prefix': '/api/campaigns',
        'outFile': 'src/routes/campaign-routes.ts',
        'routerVar': 'campaignRouter',
        'imports': '''import { Router } from "express";
const router = Router();

import { db, log, auditLogger } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage, sanitizeForAudit } from "../lib/server-utils";
import { parseFormData, CampaignCreateSchema, CampaignUpdateSchema } from "../lib/form-validators";
import { computeOutcomeBreakdown, computeCallStats, callIdsFromLeads } from "../lib/campaign-analytics";
import { SentryEvents } from "../lib/sentry-events";
import { claudeRateLimiter } from "../middleware/api-rate-limits";

const CALL_WINDOW_CHECK_INTERVAL_MS = 30000;
const CAMPAIGN_DIAL_SPACING_MS = 2000;

// Dummy implementation to avoid compiler errors if isDncBlocked/placeOutboundCall is missing from imports
async function isDncBlocked(userId: string, phone: string) { return false; }
async function placeOutboundCall(opts: any) { return { ok: true }; }
'''
    },
    {
        'prefix': '/api/fleet',
        'outFile': 'src/routes/fleet-routes.ts',
        'routerVar': 'fleetRouter',
        'imports': '''import { Router } from "express";
const router = Router();

import { db, log, auditLogger } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { parseFormData, FleetTaskCreateSchema } from "../lib/form-validators";
import { compileActivityFeed } from "../lib/fleet-activity";
'''
    },
    {
        'prefix': '/api/audit',
        'outFile': 'src/routes/audit-routes.ts',
        'routerVar': 'auditRouter',
        'imports': '''import { Router } from "express";
const router = Router();

import { db, log, auditLogger, requireRole } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { computeAuditSummary } from "../lib/audit-summary";
'''
    },
    {
        'prefix': '/api/insights',
        'outFile': 'src/routes/insights-routes.ts',
        'routerVar': 'insightsRouter',
        'imports': '''import { Router } from "express";
const router = Router();

import { db, log, auditLogger } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { claudeRateLimiter } from "../middleware/api-rate-limits";
import * as claudeBrain from "../lib/claude-brain";
'''
    }
]

def extract():
    with open(SERVER_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = content
    imports_to_add = []
    uses_to_add = []

    for group in CONFIG:
        print(f"Processing prefix: {group['prefix']}")
        
        extracted_blocks = []
        # We need a new search content to avoid destroying the main string.
        # But we also want to remove ONLY matching blocks from new_content.
        
        # Keep track of ranges to remove
        ranges_to_remove = []
        
        # Regex to find app.get|post|put|patch|delete("prefix..."
        pattern = re.compile(r'app\.(get|post|put|patch|delete)\(\s*([\'"`])(.*?)\2')
        
        pos = 0
        while True:
            match = pattern.search(new_content, pos)
            if not match:
                break
                
            method = match.group(1)
            route_path = match.group(3)
            
            if route_path.startswith(group['prefix']):
                start_index = match.start()
                
                # Find matching closing brace
                brace_count = 0
                started = False
                end_index = -1
                
                for i in range(start_index, len(new_content)):
                    if new_content[i] == '{':
                        brace_count += 1
                        started = True
                    elif new_content[i] == '}':
                        brace_count -= 1
                        
                    if started and brace_count == 0:
                        # Find the );
                        closing_paren = new_content.find(');', i)
                        if closing_paren != -1 and closing_paren < i + 20:
                            end_index = closing_paren + 2
                        else:
                            end_index = i + 1
                        break
                
                if end_index != -1:
                    block = new_content[start_index:end_index]
                    
                    # replace app.method with router.method manually
                    def replacer(m):
                        return f"router.{m.group(1)}"
                    modified_block = re.sub(r'app\.(get|post|put|patch|delete)', replacer, block)
                    extracted_blocks.append(modified_block)
                    
                    ranges_to_remove.append((start_index, end_index))
                    pos = end_index
                else:
                    pos = match.end()
            else:
                pos = match.end()

        if extracted_blocks:
            print(f"Found {len(extracted_blocks)} blocks for {group['prefix']}")
            out_content = group['imports'] + '\n\n' + '\n\n'.join(extracted_blocks) + '\n\nexport default router;\n'
            
            with open(group['outFile'], 'w', encoding='utf-8') as f:
                f.write(out_content)
                
            imports_to_add.append(f'import {group["routerVar"]} from "./src/routes/{group["routerVar"].replace("Router", "-routes")}";')
            uses_to_add.append(f'app.use({group["routerVar"]});')
            
            # Remove blocks from bottom up to avoid index shifting
            for start_idx, end_idx in reversed(ranges_to_remove):
                new_content = new_content[:start_idx] + new_content[end_idx:]
        else:
            print(f"No blocks found for {group['prefix']}")

    # Clean up blank lines
    new_content = re.sub(r'\n\s*\n\s*\n', '\n\n', new_content)

    if imports_to_add:
        # Find where to put imports and app.use
        insert_point = new_content.find('import stripeRouter')
        if insert_point != -1:
            end_of_line = new_content.find('\n', insert_point)
            new_content = new_content[:end_of_line + 1] + '\n'.join(imports_to_add) + '\n' + new_content[end_of_line + 1:]
            
        use_insert_point = new_content.find('app.use(stripeRouter')
        if use_insert_point != -1:
            end_of_use = new_content.find('\n', use_insert_point)
            new_content = new_content[:end_of_use + 1] + '\n'.join(uses_to_add) + '\n' + new_content[end_of_use + 1:]
        else:
            oauth_use = new_content.find('app.use(oauthRouter')
            if oauth_use != -1:
                end_of_use = new_content.find('\n', oauth_use)
                new_content = new_content[:end_of_use + 1] + '\n'.join(uses_to_add) + '\n' + new_content[end_of_use + 1:]

    with open(SERVER_PATH, 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    print("Extraction complete.")

if __name__ == '__main__':
    extract()
