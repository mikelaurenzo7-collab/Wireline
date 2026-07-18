import express from "express";
import chatgptMcpAccountRouter from "../routes/chatgpt-mcp-account-routes";
import chatgptMcpRouter from "../routes/chatgpt-mcp-routes";
import { AppError, formatErrorResponse } from "../lib/api-error";
import { reportError } from "../lib/error-reporter";
import { mcpIssuer } from "../lib/mcp-oauth-security";
import { mcpOAuthChallenge, mcpToolErrorResult } from "../lib/mcp-transport";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

// Normalize submission-critical metadata and OAuth challenges at the public MCP
// boundary. A private voice simulation creates a short-lived credential, so it
// is not read-only even though it never changes the saved agent draft. ChatGPT
// also expects tool-level auth failures as `isError` results carrying
// `_meta["mcp/www_authenticate"]`, with both `error` and `error_description`.
app.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (req.method === "POST" && req.path === "/mcp" && body && typeof body === "object") {
      const envelope = body as {
        id?: unknown;
        result?: unknown;
        error?: { code?: unknown; message?: unknown; data?: unknown };
      };
      const result = envelope.result;
      if (result && typeof result === "object") {
        const tools = (result as { tools?: unknown }).tools;
        if (Array.isArray(tools)) {
          const simulation = tools.find(
            (tool): tool is { name: string; annotations?: Record<string, unknown> } =>
              Boolean(tool) &&
              typeof tool === "object" &&
              (tool as { name?: unknown }).name === "start_private_voice_simulation",
          );
          if (simulation) {
            simulation.annotations = {
              ...(simulation.annotations || {}),
              readOnlyHint: false,
              openWorldHint: false,
              destructiveHint: false,
            };
          }
        }
      }

      if (envelope.error?.code === -32001) {
        const data =
          envelope.error.data && typeof envelope.error.data === "object"
            ? (envelope.error.data as Record<string, unknown>)
            : {};
        const requiredScope =
          typeof data.required_scope === "string" && data.required_scope.trim()
            ? data.required_scope.trim()
            : "agents.read";
        const message =
          typeof envelope.error.message === "string" && envelope.error.message.trim()
            ? envelope.error.message.trim()
            : "Connect a Wireline account to continue.";
        const challenge = mcpOAuthChallenge(
          `${mcpIssuer(req)}/.well-known/oauth-protected-resource`,
          requiredScope,
          message,
        );
        res.setHeader("WWW-Authenticate", challenge);
        return sendJson({
          jsonrpc: "2.0",
          id: envelope.id ?? null,
          result: mcpToolErrorResult(message, { "mcp/www_authenticate": [challenge] }),
        });
      }
    }
    return sendJson(body);
  }) as typeof res.json;
  next();
});

// Account-bound tools own the production /mcp transport. The legacy router
// remains mounted for OAuth discovery, consent, token exchange, and a safe
// compatibility fallback while connected clients refresh tool descriptors.
app.use(chatgptMcpAccountRouter);
app.use(chatgptMcpRouter);

app.use((req, res) => {
  const { status, body } = formatErrorResponse(
    AppError.notFound(`No Wireline MCP route matches ${req.method} ${req.path}`),
  );
  res.status(status).json(body);
});
app.use(
  (error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const { status, body } = formatErrorResponse(error);
    if (status >= 500) {
      reportError(error, {
        tags: { surface: "mcp", method: req.method, path: req.path, status },
      });
    }
    res.status(status).json(body);
  },
);

export default app;
