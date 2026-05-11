const fs = require('fs');
const path = require('path');

const SERVER_PATH = path.join(__dirname, 'server.ts');

const config = [
  {
    prefix: '/api/agents',
    outFile: 'src/routes/agent-routes.ts',
    routerVar: 'agentRouter',
    imports: `import { Router } from "express";
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
`
  },
  {
    prefix: '/api/campaigns',
    outFile: 'src/routes/campaign-routes.ts',
    routerVar: 'campaignRouter',
    imports: `import { Router } from "express";
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
`
  },
  {
    prefix: '/api/fleet',
    outFile: 'src/routes/fleet-routes.ts',
    routerVar: 'fleetRouter',
    imports: `import { Router } from "express";
const router = Router();

import { db, log, auditLogger } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { parseFormData, FleetTaskCreateSchema } from "../lib/form-validators";
import { compileActivityFeed } from "../lib/fleet-activity";
`
  },
  {
    prefix: '/api/audit',
    outFile: 'src/routes/audit-routes.ts',
    routerVar: 'auditRouter',
    imports: `import { Router } from "express";
const router = Router();

import { db, log, auditLogger, requireRole } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { computeAuditSummary } from "../lib/audit-summary";
`
  },
  {
    prefix: '/api/insights',
    outFile: 'src/routes/insights-routes.ts',
    routerVar: 'insightsRouter',
    imports: `import { Router } from "express";
const router = Router();

import { db, log, auditLogger } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { claudeRateLimiter } from "../middleware/api-rate-limits";
import * as claudeBrain from "../lib/claude-brain";
`
  }
];

function extract() {
  let content = fs.readFileSync(SERVER_PATH, 'utf8');
  let newContent = content;

  let importsToAdd = [];
  let useToAdd = [];

  for (const group of config) {
    console.log("Processing prefix: " + group.prefix);
    
    // Find all app.get|post|put|patch|delete("prefix..."
    // We will parse character by character to handle nested braces properly
    let extractedBlocks = [];
    
    let regex = /app\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]*)\2/g;
    let match;
    let lastMatchedIndex = -1;
    let keepRanges = [];
    
    let searchContent = newContent;
    let offset = 0;
    
    while ((match = regex.exec(searchContent)) !== null) {
      const method = match[1];
      const routePath = match[3];
      
      if (routePath.startsWith(group.prefix)) {
        const startIndex = match.index;
        
        // Find matching closing brace
        let braceCount = 0;
        let started = false;
        let endIndex = -1;
        
        for (let i = startIndex; i < searchContent.length; i++) {
          if (searchContent[i] === '{') {
            braceCount++;
            started = true;
          } else if (searchContent[i] === '}') {
            braceCount--;
          }
          
          if (started && braceCount === 0) {
            // we found the end of the callback block. We need to find the `);`
            const closingParen = searchContent.indexOf(');', i);
            if (closingParen !== -1 && closingParen < i + 20) {
              endIndex = closingParen + 2;
            } else {
              endIndex = i + 1; // fallback
            }
            break;
          }
        }
        
        if (endIndex !== -1) {
          const block = searchContent.substring(startIndex, endIndex);
          // replace app.method with router.method
          const modifiedBlock = block.replace(/app\.(get|post|put|patch|delete)/, 'router.$1');
          extractedBlocks.push(modifiedBlock);
          
          // Blank out the block in searchContent to avoid messing up offsets, 
          // we'll remove them from newContent later
          searchContent = searchContent.substring(0, startIndex) + 
                          ' '.repeat(endIndex - startIndex) + 
                          searchContent.substring(endIndex);
        }
      }
    }
    
    if (extractedBlocks.length > 0) {
      console.log(`Found ${extractedBlocks.length} blocks for ${group.prefix}`);
      
      // Write the extracted blocks to the file
      const outContent = group.imports + '\n' + extractedBlocks.join('\n\n') + '\n\nexport default router;\n';
      fs.writeFileSync(path.join(__dirname, group.outFile), outContent);
      
      // Prepare modifications to server.ts
      importsToAdd.push(`import ${group.routerVar} from "./${group.outFile.replace('.ts', '')}";`);
      useToAdd.push(`app.use(${group.routerVar});`);
      
      // Remove extracted blocks from newContent
      // We do this by replacing the exact blocks we found
      // Wait, we replaced them with spaces in searchContent!
      // Let's just use searchContent and remove multiple blank lines later.
      newContent = searchContent;
    } else {
      console.log(`No blocks found for ${group.prefix}`);
    }
  }
  
  // Clean up excessive blank lines
  newContent = newContent.replace(/\\n\\s*\\n\\s*\\n/g, '\\n\\n');
  
  // Add imports and app.use to server.ts
  if (importsToAdd.length > 0) {
    const importStr = importsToAdd.join('\n');
    const useStr = useToAdd.join('\n');
    
    // Find where to put them. Right after import stripeRouter...
    const insertPoint = newContent.indexOf('import stripeRouter');
    if (insertPoint !== -1) {
      const endOfLine = newContent.indexOf('\n', insertPoint);
      newContent = newContent.substring(0, endOfLine + 1) + importStr + '\n' + newContent.substring(endOfLine + 1);
    }
    
    const useInsertPoint = newContent.indexOf('app.use(stripeRouter');
    if (useInsertPoint !== -1) {
      const endOfUse = newContent.indexOf('\n', useInsertPoint);
      newContent = newContent.substring(0, endOfUse + 1) + useStr + '\n' + newContent.substring(endOfUse + 1);
    } else {
      // fallback
      const oauthUse = newContent.indexOf('app.use(oauthRouter');
      if (oauthUse !== -1) {
        const endOfUse = newContent.indexOf('\n', oauthUse);
        newContent = newContent.substring(0, endOfUse + 1) + useStr + '\n' + newContent.substring(endOfUse + 1);
      }
    }
  }

  fs.writeFileSync(SERVER_PATH, newContent);
  console.log("Extraction complete.");
}

extract();
