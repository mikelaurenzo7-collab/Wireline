import type { NextFunction, Request, Response } from "express";
import type { Express } from "express";

import { mcpIssuer } from "../lib/mcp-oauth-security";
import { mcpOAuthChallenge } from "../lib/mcp-transport";
import { mcpOAuthIssuerBinding } from "../middleware/mcp-oauth-issuer-binding";
import chatgptMcpAccountRouter from "../routes/chatgpt-mcp-account-routes";
import chatgptMcpRouter from "../routes/chatgpt-mcp-routes";

/**
 * Claude requires a transport-level 401/403 plus WWW-Authenticate. ChatGPT
 * Apps SDK also honors that challenge. Do not rewrite the JSON-RPC error into
 * a 200 `isError` tool result. Claude treats that as a model-visible failure
 * and never shows the Connect card.
 */
function mcpAuthChallengeNormalizer(req: Request, res: Response, next: NextFunction): void {
  const sendJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (req.method === "POST" && req.path === "/mcp" && body && typeof body === "object") {
      const envelope = body as {
        error?: { code?: unknown; message?: unknown; data?: unknown };
      };

      if (envelope.error?.code === -32001) {
        const data =
          envelope.error.data && typeof envelope.error.data === "object"
            ? (envelope.error.data as Record<string, unknown>)
            : {};
        const requiredScope =
          typeof data.required_scope === "string" && data.required_scope.trim()
            ? data.required_scope.trim()
            : "agents.read";
        const oauthError =
          data.oauth_error === "invalid_token" || data.oauth_error === "insufficient_scope"
            ? data.oauth_error
            : "invalid_token";
        const message =
          typeof envelope.error.message === "string" && envelope.error.message.trim()
            ? envelope.error.message.trim()
            : "Connect a Wireline account to continue.";
        const challenge = mcpOAuthChallenge(
          `${mcpIssuer(req)}/.well-known/oauth-protected-resource`,
          requiredScope,
          message,
          oauthError,
        );
        res.setHeader("WWW-Authenticate", challenge);
        if (res.statusCode !== 401 && res.statusCode !== 403) {
          res.status(oauthError === "insufficient_scope" ? 403 : 401);
        }
      }
    }
    return sendJson(body);
  }) as typeof res.json;
  next();
}

/**
 * Account-bound MCP tools, OAuth discovery, and CIMD/DCR live on this stack.
 * Mounted by the dedicated Vercel MCP function and by the canonical local server
 * so `npm run dev` can serve `/mcp`.
 */
export function registerMcpRoutes(app: Express): void {
  app.use(mcpOAuthIssuerBinding);
  app.use(mcpAuthChallengeNormalizer);
  app.use(chatgptMcpAccountRouter);
  app.use(chatgptMcpRouter);
}
