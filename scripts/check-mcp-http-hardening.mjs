import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const entry = readFileSync(resolve(process.cwd(), "src/entrypoints/chatgpt-mcp-api.ts"), "utf8");
const stack = readFileSync(resolve(process.cwd(), "src/server/register-mcp-routes.ts"), "utf8");

const appCreation = entry.indexOf("const app = express();");
const fingerprintDisable = entry.indexOf('app.disable("x-powered-by");');
const stackMount = entry.indexOf("registerMcpRoutes(app)");
const accountMount = stack.indexOf("app.use(chatgptMcpAccountRouter);");
const oauthMount = stack.indexOf("app.use(chatgptMcpRouter);");

const failures = [];
if (appCreation < 0) failures.push("MCP Express app creation is missing.");
if (fingerprintDisable < 0) failures.push("MCP must disable the X-Powered-By response header.");
if (stackMount < 0) failures.push("MCP entrypoint must mount the shared MCP stack.");
if (accountMount < 0) failures.push("MCP account router mount is missing.");
if (oauthMount < 0) failures.push("MCP OAuth router mount is missing.");
if (
  appCreation >= 0 &&
  fingerprintDisable >= 0 &&
  stackMount >= 0 &&
  !(appCreation < fingerprintDisable && fingerprintDisable < stackMount)
) {
  failures.push("MCP fingerprint suppression must run before any public router is mounted.");
}
if (accountMount >= 0 && oauthMount >= 0 && accountMount >= oauthMount) {
  failures.push("Account-bound MCP tools must mount before the OAuth-only router.");
}

if (failures.length > 0) {
  console.error("MCP HTTP hardening contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("MCP HTTP hardening contract passed.");
