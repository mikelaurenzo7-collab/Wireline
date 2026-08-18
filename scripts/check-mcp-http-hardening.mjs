import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/entrypoints/chatgpt-mcp-api.ts"), "utf8");

const appCreation = source.indexOf("const app = express();");
const fingerprintDisable = source.indexOf('app.disable("x-powered-by");');
const firstRouterMount = source.indexOf("app.use(chatgptMcpAccountRouter);");

const failures = [];
if (appCreation < 0) failures.push("MCP Express app creation is missing.");
if (fingerprintDisable < 0) failures.push("MCP must disable the X-Powered-By response header.");
if (firstRouterMount < 0) failures.push("MCP account router mount is missing.");
if (
  appCreation >= 0 &&
  fingerprintDisable >= 0 &&
  firstRouterMount >= 0 &&
  !(appCreation < fingerprintDisable && fingerprintDisable < firstRouterMount)
) {
  failures.push("MCP fingerprint suppression must run before any public router is mounted.");
}

if (failures.length > 0) {
  console.error("MCP HTTP hardening contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("MCP HTTP hardening contract passed.");
