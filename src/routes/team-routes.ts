import { AppError } from "../lib/api-error";
import { Router, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { log, drizzle, requirePermission, tenantStore } from "../lib/server-context";
import { secureTeamMembers } from "../db/security-schema";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { emailRateLimiter } from "../middleware/rate-limit-middleware";
import { validateBody, inviteTeamMemberSchema } from "../lib/api-validation";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";
import { generateToken } from "../lib/auth-service";
import { setSessionCookie } from "../lib/session-cookie";
import { invalidateRoleCache } from "../middleware/require-role";
import { getPostgresErrorCode } from "../lib/pg-errors";

const router = Router();
const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function inviteHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function requireUuid(value: string, label: string): string {
  if (!UUID_RE.test(value)) throw AppError.fromHttpStatus(400, `Invalid ${label}.`);
  return value.toLowerCase();
}

function requireSessionVersion(req: AuthenticatedRequest): number {
  const version = Number(req.user.sessionVersion);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw AppError.fromHttpStatus(401, "Session state is invalid.");
  }
  return version;
}

router.get(
  "/api/team",
  authenticateUser,
  requirePermission("team.manage"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const members = await drizzle
        .select({
          id: secureTeamMembers.id,
          userId: secureTeamMembers.userId,
          tenantId: secureTeamMembers.tenantId,
          email: secureTeamMembers.email,
          role: secureTeamMembers.role,
          acceptedAt: secureTeamMembers.acceptedAt,
          invitationExpiresAt: secureTeamMembers.invitationExpiresAt,
          createdAt: secureTeamMembers.createdAt,
          revokedAt: secureTeamMembers.revokedAt,
        })
        .from(secureTeamMembers)
        .where(eq(secureTeamMembers.tenantId, req.tenantId))
        .orderBy(desc(secureTeamMembers.createdAt));
      return res.json({ members: members || [] });
    } catch (error) {
      log.error("Failed to fetch team members", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to fetch team members");
    }
  },
);

router.post(
  "/api/team/invite",
  authenticateUser,
  requirePermission("team.manage"),
  emailRateLimiter,
  validateBody(inviteTeamMemberSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { email, role } = req.body;
    if (email === req.user.email.toLowerCase()) {
      throw AppError.fromHttpStatus(400, "You already own this workspace.");
    }

    const plaintextToken = randomBytes(32).toString("base64url");
    const tokenHash = inviteHash(plaintextToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    try {
      const invitation = await drizzle.transaction(async (tx) => {
        const pending = (await tx.execute(sql`
          SELECT id
          FROM wireline_team_members
          WHERE tenant_id = ${req.tenantId}
            AND lower(email) = lower(${email})
            AND user_id IS NULL
            AND revoked_at IS NULL
          LIMIT 1
          FOR UPDATE
        `)) as unknown as { rows?: Array<{ id: string }> };

        if (pending.rows?.[0]) {
          const [updated] = await tx
            .update(secureTeamMembers)
            .set({
              role: role || "member",
              invitationTokenHash: tokenHash,
              invitationExpiresAt: expiresAt,
              invitedBy: req.user.id,
              createdAt: new Date(),
            })
            .where(eq(secureTeamMembers.id, pending.rows[0].id))
            .returning({
              id: secureTeamMembers.id,
              email: secureTeamMembers.email,
              role: secureTeamMembers.role,
              invitationExpiresAt: secureTeamMembers.invitationExpiresAt,
            });
          return updated;
        }

        const [created] = await tx
          .insert(secureTeamMembers)
          .values({
            tenantId: req.tenantId,
            userId: null,
            email,
            role: role || "member",
            invitedBy: req.user.id,
            invitationTokenHash: tokenHash,
            invitationExpiresAt: expiresAt,
          })
          .returning({
            id: secureTeamMembers.id,
            email: secureTeamMembers.email,
            role: secureTeamMembers.role,
            invitationExpiresAt: secureTeamMembers.invitationExpiresAt,
          });
        return created;
      });

      const appUrl = (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
      const acceptPath = `/accept-invite#token=${encodeURIComponent(plaintextToken)}`;
      const inviteUrl = `${appUrl}${acceptPath}`;
      const invitedBy = req.user.email || "A colleague";
      const subject = `Invitation to join ${invitedBy} on Wireline`;
      const html = `
        <h1>You've been invited</h1>
        <p>${escapeHtml(invitedBy)} has invited you to a shared Wireline workspace.</p>
        <p><a href="${escapeAttribute(inviteUrl)}" style="padding: 10px 20px; background: #5B4CFF; color: #fff; text-decoration: none; border-radius: 5px;">Accept invitation</a></p>
        <p>This invitation expires in seven days and only works for ${escapeHtml(email)}.</p>
      `;
      const text = [
        "You've been invited to a shared Wireline workspace.",
        "",
        `Accept invitation: ${inviteUrl}`,
        "",
        `This invitation expires in seven days and only works for ${email}.`,
      ].join("\n");

      let emailSent = false;
      try {
        const { sendEmail } = await import("../lib/email-service");
        const result = await sendEmail({ to: email, subject, text, html });
        emailSent = Boolean(result.ok);
        if (!result.ok) {
          const { IntegrationService } = await import("../lib/integrations");
          emailSent = Boolean(
            await new IntegrationService(req.tenantId).sendEmail({ to: email, subject, body: html }),
          );
        }
      } catch (mailError) {
        log.error("Failed to send invitation email", { error: getErrorMessage(mailError) });
      }

      return res.json({ success: true, invitation, email_sent: emailSent });
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (getPostgresErrorCode(error) === "23505") {
        throw AppError.fromHttpStatus(409, "An active invitation or membership already exists.");
      }
      log.error("Failed to invite team member", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to invite team member");
    }
  },
);

router.post(
  "/api/team/invitations/accept",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!INVITE_TOKEN_RE.test(token)) {
      throw AppError.fromHttpStatus(400, "Invalid invitation token.");
    }
    const tokenHash = inviteHash(token);

    try {
      const accepted = await tenantStore.run(req.user.id, async () => {
        const result = (await drizzle.execute(sql`
          SELECT id, tenant_id, role
          FROM public.wireline_accept_team_invitation(
            ${tokenHash},
            ${req.user.id},
            ${req.user.email}
          )
        `)) as unknown as {
          rows?: Array<{ id: string; tenant_id: string; role: string | null }>;
        };
        return result.rows?.[0] ?? null;
      });

      if (!accepted) {
        throw AppError.fromHttpStatus(
          400,
          "Invitation is invalid, expired, already used, or belongs to another email address.",
        );
      }

      invalidateRoleCache(req.user.id, accepted.tenant_id);
      const sessionToken = generateToken({
        id: req.user.id,
        email: req.user.email,
        sessionVersion: requireSessionVersion(req),
        tenantId: accepted.tenant_id,
      });
      setSessionCookie(res, sessionToken);
      return res.json({
        success: true,
        tenant_id: accepted.tenant_id,
        role: accepted.role || "member",
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (getPostgresErrorCode(error) === "23505") {
        throw AppError.fromHttpStatus(409, "You already belong to this workspace.");
      }
      log.error("Failed to accept invitation", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to accept invitation");
    }
  },
);

router.get(
  "/api/team/workspaces",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const directory = await tenantStore.run(req.user.id, async () => {
      const result = (await drizzle.execute(sql`
        SELECT tenant_id, role, accepted_at, owner_email, owner_name
        FROM public.wireline_list_user_workspaces(${req.user.id})
      `)) as unknown as {
        rows?: Array<{
          tenant_id: string;
          role: string | null;
          accepted_at: Date | string | null;
          owner_email: string | null;
          owner_name: string | null;
        }>;
      };
      return result.rows || [];
    });

    return res.json({
      active_tenant_id: req.tenantId,
      workspaces: [
        {
          tenant_id: req.user.id,
          label: "My workspace",
          owner_email: req.user.email,
          role: "owner",
          active: req.tenantId === req.user.id,
        },
        ...directory.map((workspace) => ({
          tenant_id: workspace.tenant_id,
          label: workspace.owner_name || workspace.owner_email || "Shared workspace",
          owner_email: workspace.owner_email,
          role: workspace.role || "member",
          accepted_at: workspace.accepted_at,
          active: req.tenantId === workspace.tenant_id,
        })),
      ],
    });
  },
);

router.post(
  "/api/team/workspaces/:tenantId/select",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = requireUuid(req.params.tenantId, "workspace id");
    if (tenantId !== req.user.id) {
      const [membership] = await tenantStore.run(req.user.id, () =>
        drizzle
          .select({ id: secureTeamMembers.id })
          .from(secureTeamMembers)
          .where(
            and(
              eq(secureTeamMembers.tenantId, tenantId),
              eq(secureTeamMembers.userId, req.user.id),
              isNull(secureTeamMembers.revokedAt),
            ),
          )
          .limit(1),
      );
      if (!membership) throw AppError.fromHttpStatus(404, "Workspace not found.");
    }
    const token = generateToken({
      id: req.user.id,
      email: req.user.email,
      sessionVersion: requireSessionVersion(req),
      tenantId,
    });
    setSessionCookie(res, token);
    return res.json({ success: true, tenant_id: tenantId });
  },
);

router.delete(
  "/api/team/:id",
  authenticateUser,
  requirePermission("team.manage"),
  async (req: AuthenticatedRequest, res: Response) => {
    const membershipId = requireUuid(req.params.id, "team member id");
    const [removed] = await drizzle
      .update(secureTeamMembers)
      .set({
        revokedAt: new Date(),
        invitationTokenHash: null,
        invitationExpiresAt: null,
      })
      .where(
        and(
          eq(secureTeamMembers.id, membershipId),
          eq(secureTeamMembers.tenantId, req.tenantId),
          isNull(secureTeamMembers.revokedAt),
        ),
      )
      .returning({ userId: secureTeamMembers.userId });
    if (!removed) throw AppError.fromHttpStatus(404, "Team member not found.");
    if (removed.userId) invalidateRoleCache(removed.userId, req.tenantId);
    return res.json({ success: true });
  },
);

export default router;
