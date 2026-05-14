import { Request, Response, NextFunction } from "express";
import { AnyZodObject, ZodError } from "zod";
import { log } from "../lib/server-context";

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        log.warn("Validation failed", { 
          path: req.path, 
          errors: error.errors 
        });
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.errors.map(e => ({
            path: e.path.join("."),
            message: e.message
          }))
        });
      }
      next(error);
    }
  };
};
