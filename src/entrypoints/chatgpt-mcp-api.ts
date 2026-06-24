import express from "express";
import chatgptMcpRouter from "../routes/chatgpt-mcp-routes";
import { AppError, formatErrorResponse } from "../lib/api-error";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(chatgptMcpRouter);
app.use((req, res) => {
  const { status, body } = formatErrorResponse(
    AppError.notFound(`No ChatGPT App route matches ${req.method} ${req.path}`),
  );
  res.status(status).json(body);
});
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const { status, body } = formatErrorResponse(error);
  res.status(status).json(body);
});

export default app;
