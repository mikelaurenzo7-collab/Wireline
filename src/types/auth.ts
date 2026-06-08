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
 *
 * NOTE: We explicitly define body, params, and query here to resolve
 * errors when @types/express is missing or incomplete in the environment.
 */
export interface AuthenticatedRequest<
  P = Record<string, string>,
  _ResBody = any,
  ReqBody = any,
  ReqQuery = Record<string, string | string[] | undefined>,
> extends Request {
  user: User;
  role: AccessRole;
  tenantId: string;
  body: ReqBody;
  params: P;
  query: ReqQuery;
  ip?: string;
  headers: import("http").IncomingHttpHeaders;
  get(name: string): string | undefined;
  header(name: string): string | undefined;
}
