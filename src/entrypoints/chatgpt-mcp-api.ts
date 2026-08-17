import express from "express";
import { AppError, formatErrorResponse } from "../lib/api-error";
import { reportError } from "../lib/error-reporter";
import { registerMcpRoutes } from "../server/register-mcp-routes";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

registerMcpRoutes(app);

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
