import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { log } from "../lib/server-context";

export const validate = (schema: z.ZodTypeAny) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Replace the body with the parsed value so Zod strip/transform actually
      // takes effect. parseAsync alone previously left unknown keys on req.body,
      // which let entitlement fields slip past SettingsSchema into Drizzle.
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        log.warn("Validation failed", {
          path: req.path,
          issues: error.issues,
        });
        return res.status(400).json({
          error: "Validation failed",
          details: error.issues.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
};
