import { Request } from "express";
import { User } from "@supabase/supabase-js";
import { AccessRole } from "../lib/soc2-controls";

declare global {
  namespace Express {
    interface Request {
      user: User;
      role?: AccessRole;
    }
  }
}

/**
 * An Express Request object that has been through the authenticateUser
 * middleware and thus has a valid Supabase User attached.
 * 
 * Note: We augment the global Express.Request interface so that TypeScript's
 * strict RequestHandler generic type parameters match perfectly without throwing
 * "No overload matches this call" 300+ times.
 */
export interface AuthenticatedRequest extends Request {}
