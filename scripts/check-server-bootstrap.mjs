import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");
const assert = (condition, message) => {
  if (!condition) {
    console.error(`server bootstrap check failed: ${message}`);
    process.exitCode = 1;
  }
};

const server = read("server.ts");
const compatibility = read("server-v2.ts");
const routes = read("src/server/register-api-routes.ts");

const webhookInstaller = server.indexOf("installWebhookBodyParsers(app);");
const globalJson = server.indexOf('app.use(express.json({ limit: "6mb" }));');
const routeRegistration = server.indexOf("registerApiRoutes(app);");
const apiFallback = server.indexOf('app.use("/api", (req, res) => {');

assert(server.includes('import { registerApiRoutes } from "./src/server/register-api-routes";'), "canonical server must import the route registry");
assert(webhookInstaller >= 0, "canonical server must install vendor webhook parsers");
assert(globalJson >= 0, "canonical server must install global JSON parsing");
assert(webhookInstaller >= 0 && globalJson >= 0 && webhookInstaller < globalJson, "webhook parsers must mount before global JSON parsing");
assert(routeRegistration >= 0 && apiFallback >= 0 && routeRegistration < apiFallback, "feature routes must mount before the /api fallback");
assert(compatibility.includes('export { app } from "./server";'), "server-v2 must remain an explicit compatibility export only");

const position = (snippet) => routes.indexOf(snippet);
assert(position("app.use(authOAuthRouter);") < position("app.use(agentRouter);"), "OAuth routes must precede agent routes");
assert(position("app.use(emailOutcomeRouter);") < position("app.use(emailRouter);"), "email outcome routes must precede the aggregate email router");
assert(position("app.use(emailSyncRouter);") < position("app.use(emailRouter);"), "email sync routes must precede the aggregate email router");
assert(position('app.use("/api", billingRouter);') < position("app.use(emailRouter);"), "billing routes must retain their historical precedence");
assert(position("app.use(metaWebhookRouter);") < position("app.use(marketingRuntimeRouter);"), "Meta webhook routes must precede marketing runtime routes");

if (!process.exitCode) {
  console.log("server bootstrap and route precedence invariants passed");
}
