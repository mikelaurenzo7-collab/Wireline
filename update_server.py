import re

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Add agentRouter import
content = content.replace('import stripeRouter from "./src/routes/stripe-routes";', 
                          'import stripeRouter from "./src/routes/stripe-routes";\\nimport agentRouter from "./src/routes/agent-routes";\\nimport { authenticateUser } from "./src/middleware/auth";\\nimport { ROLE_PERSONALITY_TEMPLATES } from "./src/lib/agent-constants";')

# Remove authenticateUser definition from server.ts
# It starts with 'async function authenticateUser(req: any, res: any, next: any) {'
# and ends right before '// ==========================================' (Stripe webhook)
match = re.search(r'(async function authenticateUser\(req: any, res: any, next: any\).*?^// ==========================================)', content, re.MULTILINE | re.DOTALL)

if match:
    # Just remove the definition but keep the next comment section header
    block = match.group(1)
    content = content.replace(block, '// ==========================================')

# Mount agentRouter
# I'll mount it where other routes are mounted. Let's find `app.use(vapiRouter);` or `app.use(oauthRouter);` or `app.use(stripeRouter);`. 
# Or I'll just put it right after Sentry error handler setup, or around line 1300.
# Actually, the user's `server.ts` mounts things globally. Let me mount it right before the health check or after oauthRouter.
mount_pattern = r'(app\.use\("/api/stripe-webhook", express\.raw\(\{ type: "application/json" \}\)\);)'
if re.search(mount_pattern, content):
    content = re.sub(mount_pattern, r'\\1\\napp.use(agentRouter);', content)

with open('server.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("server.ts updated.")
