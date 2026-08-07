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
    let parsedBody: unknown;
    let parsedParams: Record<string, unknown> | undefined;
    let parsedQuery: Record<string, unknown> | undefined;

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) {
        parsedBody = result.data;
      } else {
        errors.body = result.error.issues.map(
          (i: z.ZodIssue) => `${i.path.join(".")}: ${i.message}`,
        );
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) {
        parsedParams = result.data as Record<string, unknown>;
      } else {
        errors.params = result.error.issues.map(
          (i: z.ZodIssue) => `${i.path.join(".")}: ${i.message}`,
        );
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) {
        parsedQuery = result.data as Record<string, unknown>;
      } else {
        errors.query = result.error.issues.map(
          (i: z.ZodIssue) => `${i.path.join(".")}: ${i.message}`,
        );
      }
    }

    if (Object.keys(errors).length > 0) {
      throw AppError.badRequest("Validation failed", errors);
    }

    // Write the parsed values back — only after EVERY schema passed, so a
    // partial failure never leaves a half-rewritten request.
    //
    // This middleware previously discarded safeParse's output, which made every
    // `.default()`, `.transform()`, and key-strip inert at the handler. A schema
    // could declare `z.array(z.string()).default([])`, accept a body that omits
    // the field, and hand the handler `undefined` anyway — so
    // POST /api/mobile/agents/:id/tools answered 500 on a body its own contract
    // called valid. Both sibling validators (validateBody in
    // lib/api-validation-base.ts and middleware/validate.ts) already do this.
    if (parsedBody !== undefined) req.body = parsedBody;
    // params and query are merged in place rather than reassigned: Express
    // repopulates req.params per routing layer, and req.query is a prototype
    // getter. Mutating what is already there lands defaults and transforms
    // without depending on the property being writable — key-stripping is the
    // one thing this does not give them, and it is the body that needs it.
    if (parsedParams) Object.assign(req.params, parsedParams);
    if (parsedQuery) Object.assign(req.query, parsedQuery);

    next();
  };
}
