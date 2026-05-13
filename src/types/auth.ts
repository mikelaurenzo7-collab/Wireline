import { Request } from "express";
import { User } from "@supabase/supabase-js";
import { AccessRole } from "../lib/soc2-controls";

/**
 * An Express Request object that has been through the authenticateUser
 * middleware and thus has a valid Supabase User attached.
 */
export interface AuthenticatedRequest extends Request {
  user: User;
  /** Populated by requirePermission or requireRole middleware */
  role?: AccessRole;
}
