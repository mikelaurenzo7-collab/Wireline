/**
 * Zod-based request validation middleware for Express routes.
 * ---------------------------------------------------------------------------
 * Usage:
 *   import { validate } from '../middleware/input-validation';
 *   import { z } from 'zod';
 *
 *   const createAgentSchema = z.object({
 *     name: z.string().min(1).max(100),
 *     archetype: z.enum(['Receptionist', 'The Closer', 'Support Tech', 'The Empath']),
 *   });
 *
 *   router.post('/api/agents', validate({ body: createAgentSchema }), handler);
 *
 * On validation failure, throws an AppError (400) with structured field-level
 * error details so the frontend can display inline validation messages.
 */

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../lib/api-error";

interface ValidationSchemas {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
}

/**
 * Express middleware that validates request body, params, and/or query
 * against Zod schemas. On failure, throws an AppError with 400 status
 * and structured validation errors in `details`.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const errors: Record<string, string[]> = {};

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        errors.body = result.error.issues.map(
          (i: z.ZodIssue) => `${i.path.join(".")}: ${i.message}`,
        );
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        errors.params = result.error.issues.map(
          (i: z.ZodIssue) => `${i.path.join(".")}: ${i.message}`,
        );
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        errors.query = result.error.issues.map(
          (i: z.ZodIssue) => `${i.path.join(".")}: ${i.message}`,
        );
      }
    }

    if (Object.keys(errors).length > 0) {
      throw AppError.badRequest("Validation failed", errors);
    }

    next();
  };
}
