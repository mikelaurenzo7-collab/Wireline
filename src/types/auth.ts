import { AccessRole } from "../lib/soc2-controls";

export interface User {
  id: string;
  email: string;
  fullName?: string;
  role?: string;
  [key: string]: any;
}

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
 * middleware and thus has a valid User attached.
 */
export interface AuthenticatedRequest extends Express.Request {
  user: User;
}
