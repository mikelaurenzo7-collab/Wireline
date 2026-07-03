/* eslint-disable @typescript-eslint/no-explicit-any -- shared type shims bridge untyped third-party modules. */
import type { Request } from "express";
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
      tenantId?: string;
    }
  }
}

/**
 * An Express Request object that has been through the authenticateUser
 * middleware and thus has a valid User attached.
 */
export interface AuthenticatedRequest<
  P = Record<string, string>,
  ResBody = any,
  ReqBody = any,
  ReqQuery = Record<string, string | string[] | undefined>,
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user: User;
  role: AccessRole;
  tenantId: string;
}
