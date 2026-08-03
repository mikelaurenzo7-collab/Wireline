import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import { Router, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { log, drizzle, requirePermission, tenantStore } from "../lib/server-context";
import * as schema from "../db/schema";
import { secureTeamMembers } from "../db/security-schema";
import { eq, and, desc, isNull, inArray, sql } from "drizzle-orm";
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
        const [existingUser] = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.email, email))
          .limit(1);
        if (existingUser) {
          const [active] = await tx
            .select({ id: secureTeamMembers.id })
            .from(secureTeamMembers)
            .where(
              and(
                eq(secureTeamMembers.tenantId, req.tenantId),
                eq(secureTeamMembers.userId, existingUser.id),
                isNull(secureTeamMembers.revokedAt),
              ),
            )
            .limit(1);
          if (active) throw AppError.fromHttpStatus(409, "This person already belongs to the workspace.");
        }

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
      // Fragments never reach access logs or referrer headers. AcceptInvite stores
      // the token in sessionStorage before sending an unauthenticated recipient
      // through signup, then removes it immediately after acceptance.
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
      const accepted = await tenantStore.run("", async () =>
        drizzle.transaction(async (tx) => {
          const result = (await tx.execute(sql`
            UPDATE wireline_team_members
            SET user_id = ${req.user.id},
                accepted_at = clock_timestamp(),
                invitation_token_hash = NULL,
                invitation_expires_at = NULL
            WHERE invitation_token_hash = ${tokenHash}
              AND invitation_expires_at >= clock_timestamp()
              AND revoked_at IS NULL
              AND user_id IS NULL
              AND lower(email) = lower(${req.user.email})
            RETURNING id, tenant_id, role
          `)) as unknown as {
            rows?: Array<{ id: string; tenant_id: string; role: string | null }>;
          };
          return result.rows?.[0] ?? null;
        }),
      );

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
    const memberships = await tenantStore.run("", () =>
      drizzle
        .select({
          tenantId: secureTeamMembers.tenantId,
          role: secureTeamMembers.role,
          acceptedAt: secureTeamMembers.acceptedAt,
        })
        .from(secureTeamMembers)
        .where(
          and(
            eq(secureTeamMembers.userId, req.user.id),
            isNull(secureTeamMembers.revokedAt),
          ),
        ),
    );
    const tenantIds = memberships
      .map((membership) => membership.tenantId)
      .filter((tenantId): tenantId is string => Boolean(tenantId));
    const owners = tenantIds.length
      ? await tenantStore.run("", () =>
          drizzle
            .select({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName })
            .from(schema.users)
            .where(inArray(schema.users.id, tenantIds)),
        )
      : [];
    const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
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
        ...memberships
          .filter((membership) => membership.tenantId)
          .map((membership) => {
            const owner = ownerById.get(membership.tenantId!);
            return {
              tenant_id: membership.tenantId,
              label: owner?.fullName || owner?.email || "Shared workspace",
              owner_email: owner?.email || null,
              role: membership.role || "member",
              active: req.tenantId === membership.tenantId,
            };
          }),
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
      const [membership] = await tenantStore.run("", () =>
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
    const token = generateToken({ id: req.user.id, email: req.user.email, tenantId });
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
