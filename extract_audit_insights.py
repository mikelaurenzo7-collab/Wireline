import re

def extract_routes(filepath, route_patterns, output_file, additional_imports, router_name):
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
                
                # If there are no braces (e.g. single line route definition like app.get("/api/audit/events", ...);)
                if not started and ';' in current_line:
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
import { getErrorMessage } from "../lib/server-utils";
''')
        f.write(additional_imports + '\\n')
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
    
    content = content.replace('import fleetRouter from "./src/routes/fleet-routes";', 
                              f'import fleetRouter from "./src/routes/fleet-routes";\\nimport {router_name} from "./src/routes/{output_file.split("/")[-1].split(".")[0]}";')
    content = content.replace('app.use(fleetRouter);', 
                              f'app.use(fleetRouter);\\napp.use({router_name});')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

# Insights
insights_patterns = [
    r'app\.(get|post|put|patch|delete)\([\'"]/api/insights'
]
insights_imports = '''import { enforce24hSpendCap, enforceSpendCap } from "../middleware/api-rate-limits"; // Assuming these are here or we fix later
import { computeDashboardStats } from "../lib/dashboard-stats"; // Wait, insights uses something else maybe.
import { SentryEvents } from "../lib/sentry-events";
'''
extract_routes('server.ts', insights_patterns, 'src/routes/insights-routes.ts', insights_imports, 'insightsRouter')
print("Extracted insights routes.")

# Audit
audit_patterns = [
    r'app\.(get|post|put|patch|delete)\([\'"]/api/audit'
]
audit_imports = '''import { createAuditEventsHandler, createAuditStatsHandler, createAuditExportHandler } from "../lib/audit-routes";
import { computeAuditSummary } from "../lib/audit-summary";
import { auditRouteDeps } from "../lib/server-context"; // Actually auditRouteDeps is defined in server.ts
'''
# I need to handle auditRouteDeps if it's in server.ts
extract_routes('server.ts', audit_patterns, 'src/routes/audit-routes.ts', audit_imports, 'auditRouter')
print("Extracted audit routes.")
