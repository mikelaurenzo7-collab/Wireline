import { User } from "@supabase/supabase-js";
import { AccessRole } from "../lib/soc2-controls";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      role?: AccessRole;
    }
  }
}

/**
 * An Express Request object that has been through the authenticateUser
 * middleware and thus has a valid Supabase User attached.
 */
export interface AuthenticatedRequest extends Express.Request {
  user: User;
}
