import pino from "pino";

import { env, isProductionEnv } from "./env";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : isProductionEnv() ? "info" : "debug",
  // Pretty-print only in dev when the user has explicitly added pino-pretty;
  // otherwise emit JSON which is what production log shippers expect.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-vapi-secret']",
      "*.access_token",
      "*.refresh_token",
      "*.vapi_private_key",
      "password",
    ],
    censor: "[REDACTED]",
  },
});
