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

const requestIdBinding = server.indexOf("bindRequestIdReader(() => requestIdStore.getStore());");
const requestIdMiddleware = server.indexOf('res.setHeader("X-Request-Id", requestId);');
const requestIdStoreRun = server.indexOf("requestIdStore.run(requestId, next);");
const webhookInstaller = server.indexOf("installWebhookBodyParsers(app);");
const sameOriginGate = server.indexOf("app.use(assertSameOrigin);");
const globalJson = server.indexOf('app.use(express.json({ limit: "6mb" }));');
const routeRegistration = server.indexOf("registerApiRoutes(app);");
const apiFallback = server.indexOf('app.use("/api", (req, res) => {');

assert(
  server.includes('import { registerApiRoutes } from "./src/server/register-api-routes";'),
  "canonical server must import the route registry",
);
assert(requestIdBinding >= 0, "canonical server must bind request IDs into structured logs");
assert(requestIdMiddleware >= 0, "canonical server must install request ID middleware");
assert(requestIdStoreRun >= 0, "request ID middleware must enter AsyncLocalStorage before next()");
assert(webhookInstaller >= 0, "canonical server must install vendor webhook parsers");
assert(sameOriginGate >= 0, "canonical server must install the same-origin gate");
assert(globalJson >= 0, "canonical server must install global JSON parsing");
assert(
  requestIdBinding >= 0 && requestIdMiddleware >= 0 && requestIdBinding < requestIdMiddleware,
  "structured log request ID binding must be installed before the request middleware runs",
);
assert(
  requestIdMiddleware >= 0 && requestIdStoreRun >= 0 && requestIdMiddleware < requestIdStoreRun,
  "request ID middleware must set the response header before entering request ID storage",
);
assert(
  requestIdStoreRun >= 0 && webhookInstaller >= 0 && requestIdStoreRun < webhookInstaller,
  "request IDs must mount before body parsers and origin gates",
);
assert(
  webhookInstaller >= 0 && sameOriginGate >= 0 && webhookInstaller < sameOriginGate,
  "webhook parsers must mount before the same-origin gate so signed callbacks stay raw",
);
assert(
  sameOriginGate >= 0 && globalJson >= 0 && sameOriginGate < globalJson,
  "same-origin and mobile bearer gates must run before global JSON parsing",
);
assert(
  webhookInstaller >= 0 && globalJson >= 0 && webhookInstaller < globalJson,
  "webhook parsers must mount before global JSON parsing",
);
assert(
  routeRegistration >= 0 && apiFallback >= 0 && routeRegistration < apiFallback,
  "feature routes must mount before the /api fallback",
);
assert(
  !existsSync(resolvePath("server-v2.ts")),
  "obsolete server-v2 wrapper must not be reintroduced",
);

// indexOf returns -1 on a miss and `-1 < N` is true, so a renamed router would
// silently pass every ordering assertion below. A snippet that no longer exists
// must fail loudly — the invariant is unverifiable, not satisfied.
const position = (snippet) => {
  const index = routes.indexOf(snippet);
  assert(index >= 0, `route registration snippet not found: ${snippet}`);
  return index;
};
assert(
  position("app.use(authOAuthRouter);") < position("app.use(agentRouter);"),
  "OAuth routes must precede agent routes",
);
assert(
  position("app.use(emailOutcomeRouter);") < position("app.use(emailRouter);"),
  "email outcome routes must precede the aggregate email router",
);
assert(
  position("app.use(emailSyncRouter);") < position("app.use(emailRouter);"),
  "email sync routes must precede the aggregate email router",
);
assert(
  position('app.use("/api", billingRouter);') < position("app.use(emailRouter);"),
  "billing routes must retain their historical precedence",
);
assert(
  position("app.use(metaWebhookRouter);") < position("app.use(marketingRuntimeRouter);"),
  "Meta webhook routes must precede marketing runtime routes",
);
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
