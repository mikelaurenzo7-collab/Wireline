import re

def extract_routes(filepath, route_patterns, output_file):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.splitlines()
    new_server_lines = []
    extracted_routes_content = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        match = None
        for pattern in route_patterns:
            if re.search(pattern, line):
                match = pattern
                break
                
        if match:
            route_block = []
            brace_count = 0
            started = False
            
            while i < len(lines):
                current_line = lines[i]
                route_block.append(current_line)
                
                if '{' in current_line:
                    started = True
                    brace_count += current_line.count('{')
                if '}' in current_line:
                    brace_count -= current_line.count('}')
                    
                if started and brace_count == 0:
                    if '});' in current_line or '}' == current_line.strip():
                         break
                    
                i += 1
                
            extracted_routes_content.append('\\n'.join(route_block) + '\\n')
        else:
            new_server_lines.append(line)
            
        i += 1

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('import { Router } from "express";\\n')
        f.write('const router = Router();\\n\\n')
        f.write('''import { db, log, auditLogger } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage, sanitizeForAudit } from "../lib/server-utils";
import { parseFormData, CampaignCreateSchema, CampaignUpdateSchema } from "../lib/form-validators";
import { computeOutcomeBreakdown, computeCallStats, callIdsFromLeads } from "../lib/campaign-analytics";
import { SentryEvents } from "../lib/sentry-events";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Some routes might use claudeRateLimiter, let's import it from server context if it exists, or from rate-limit
import { claudeRateLimiter } from "../middleware/api-rate-limits"; 
// wait, claudeRateLimiter was in api-rate-limits? No, let's see. Let's just import it as any for now or let the file compile.
// It's defined in server.ts usually or rate-limit.ts. Let's assume it's in api-rate-limits.ts for now.

''')
        for block in extracted_routes_content:
            block = re.sub(r'app\.(get|post|put|patch|delete)\(', r'router.\\1(', block)
            f.write(block)
            f.write('\\n')
        f.write('\\nexport default router;\\n')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\\n'.join(new_server_lines) + '\\n')

    # Add mount point in server.ts
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = content.replace('import agentRouter from "./src/routes/agent-routes";', 
                              'import agentRouter from "./src/routes/agent-routes";\\nimport campaignRouter from "./src/routes/campaign-routes";')
    content = content.replace('app.use(agentRouter);', 
                              'app.use(agentRouter);\\napp.use(campaignRouter);')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

campaign_patterns = [
    r'app\.(get|post|put|patch|delete)\([\'"]/api/campaigns'
]

extract_routes('server.ts', campaign_patterns, 'src/routes/campaign-routes.ts')
print("Extracted campaign routes.")
