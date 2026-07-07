import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const resolvePath = (file) => resolve(process.cwd(), file);
const read = (file) => readFileSync(resolvePath(file), "utf8");
const assert = (condition, message) => {
  if (!condition) {
    console.error(`server bootstrap check failed: ${message}`);
    process.exitCode = 1;
  }
};

const server = read("server.ts");
const routes = read("src/server/register-api-routes.ts");

const webhookInstaller = server.indexOf("installWebhookBodyParsers(app);");
const globalJson = server.indexOf('app.use(express.json({ limit: "6mb" }));');
const routeRegistration = server.indexOf("registerApiRoutes(app);");
const apiFallback = server.indexOf('app.use("/api", (req, res) => {');

assert(
  server.includes('import { registerApiRoutes } from "./src/server/register-api-routes";'),
  "canonical server must import the route registry",
);
assert(webhookInstaller >= 0, "canonical server must install vendor webhook parsers");
assert(globalJson >= 0, "canonical server must install global JSON parsing");
assert(
  webhookInstaller >= 0 && globalJson >= 0 && webhookInstaller < globalJson,
  "webhook parsers must mount before global JSON parsing",
);
assert(
  routeRegistration >= 0 && apiFallback >= 0 && routeRegistration < apiFallback,
  "feature routes must mount before the /api fallback",
);
assert(!existsSync(resolvePath("server-v2.ts")), "obsolete server-v2 wrapper must not be reintroduced");

const position = (snippet) => routes.indexOf(snippet);
assert(position("app.use(authOAuthRouter);") < position("app.use(agentRouter);"), "OAuth routes must precede agent routes");
assert(position("app.use(emailOutcomeRouter);") < position("app.use(emailRouter);"), "email outcome routes must precede the aggregate email router");
assert(position("app.use(emailSyncRouter);") < position("app.use(emailRouter);"), "email sync routes must precede the aggregate email router");
assert(position('app.use("/api", billingRouter);') < position("app.use(emailRouter);"), "billing routes must retain their historical precedence");
assert(position("app.use(metaWebhookRouter);") < position("app.use(marketingRuntimeRouter);"), "Meta webhook routes must precede marketing runtime routes");
assert(routes.includes("app.use(insightsRouter);"), "insights routes must be registered");
assert(routes.includes("app.use(pipelineRouter);"), "pipeline routes must be registered");
assert(
  read("src/routes/voice-observability-routes.ts").includes('"/api/insights/voice-reliability"'),
  "voice observability must expose /api/insights paths",
);

assert(
  server.includes("initSupervisorWebSocketServer(server)"),
  "canonical server must start the supervisor WebSocket upgrade handler after listen",
);

if (!process.exitCode) {
  console.log("server bootstrap and route precedence invariants passed");
}
