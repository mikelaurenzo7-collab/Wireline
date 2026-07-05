import express from "express";
import chatgptMcpAccountRouter from "../routes/chatgpt-mcp-account-routes";
import chatgptMcpRouter from "../routes/chatgpt-mcp-routes";
import { AppError, formatErrorResponse } from "../lib/api-error";
import { reportError } from "../lib/error-reporter";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

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
