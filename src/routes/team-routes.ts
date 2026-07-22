import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import { Router, Response } from "express";
import { log, drizzle, requirePermission } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { validateBody, inviteTeamMemberSchema } from "../lib/api-validation";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

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

// GET /api/team — list all members in the user's organization
router.get(
  "/api/team",
  authenticateUser,
  requirePermission("team.manage"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const members = await drizzle
        .select()
        .from(schema.teamMembers)
        .where(eq(schema.teamMembers.tenantId, req.tenantId))
        .orderBy(desc(schema.teamMembers.createdAt));

      res.json({ members: members || [] });
    } catch (error: any) {
      log.error("Failed to fetch team members", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to fetch team members");
    }
  },
);

// POST /api/team/invite — invite a new member
router.post(
  "/api/team/invite",
  authenticateUser,
  requirePermission("team.manage"),
  validateBody(inviteTeamMemberSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email, role } = req.body;
      if (!email) throw AppError.fromHttpStatus(400, "Email is required");

      const [data] = (await drizzle
        .insert(schema.teamMembers)
        .values({
          tenantId: req.tenantId,
          userId: null,
          email,
          role: role || "member",
          invitedBy: req.user.id,
        })
        .returning()) as any[];

      // Prefer platform Resend so invites don't depend on a connected mailbox
      // (and so HTML CTAs aren't double-escaped by IntegrationService paths).
      const appUrl = process.env.APP_URL || "https://trywireline.com";
      const invitedBy = req.user.email || "A colleague";
      const safeInvitedBy = escapeHtml(invitedBy);
      const inviteUrl = `${appUrl}/signup?invite=${data.id}`;
      const safeInviteUrl = escapeAttribute(inviteUrl);
      const subject = `Invitation to join ${invitedBy} on Wireline`;
      const html = `
          <h1>You've been invited!</h1>
          <p>${safeInvitedBy} has invited you to join their team on Wireline.</p>
          <p>Wireline helps people and teams hand off calls, messages, and follow-ups while keeping human review close.</p>
          <p><a href="${safeInviteUrl}" style="padding: 10px 20px; background: #5B4CFF; color: #fff; text-decoration: none; border-radius: 5px;">Accept Invitation</a></p>
          <p>If you don't have an account, you'll be prompted to create one.</p>
        `;
      const text = [
        "You've been invited!",
        "",
        `${invitedBy} has invited you to join their team on Wireline.`,
        "",
        `Accept invitation: ${inviteUrl}`,
        "",
        "If you don't have an account, you'll be prompted to create one.",
      ].join("\n");

      let emailSent = false;
      try {
        const { sendEmail } = await import("../lib/email-service");
        const result = await sendEmail({ to: email, subject, text, html });
        emailSent = Boolean(result.ok);
        if (result.ok) {
          log.info("Team invitation email sent via Resend", { email, invitedBy: req.user.id });
        } else {
          // Fallback: try the inviter's connected mailbox (Google/Microsoft).
          const { IntegrationService } = await import("../lib/integrations");
          const service = new IntegrationService(req.tenantId);
          const sent = await service.sendEmail({ to: email, subject, body: html });
          emailSent = Boolean(sent);
          if (sent) {
            log.info("Team invitation email sent via connected mailbox", {
              email,
              invitedBy: req.user.id,
            });
          } else {
            log.warn("Team invitation created but email not delivered", {
              email,
              userId: req.user.id,
              resendError: result.error,
            });
          }
        }
      } catch (mailErr) {
        if (mailErr instanceof AppError) throw mailErr;
        log.error("Failed to send invitation email", { error: getErrorMessage(mailErr) });
      }

      res.json({ success: true, invitation: data, email_sent: emailSent });
    } catch (error: any) {
      log.error("Failed to invite team member", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to invite team member");
    }
  },
);

// DELETE /api/team/:id — remove a member or revoke invitation
router.delete(
  "/api/team/:id",
  authenticateUser,
  requirePermission("team.manage"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await drizzle
        .delete(schema.teamMembers)
        .where(
          and(
            eq(schema.teamMembers.id, req.params.id),
            eq(schema.teamMembers.tenantId, req.tenantId),
          ),
        );

      res.json({ success: true });
    } catch (error: any) {
      log.error("Failed to remove team member", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to remove team member");
    }
  },
);

export default router;
