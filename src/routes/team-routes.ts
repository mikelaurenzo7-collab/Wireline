import { Router, Response } from "express";
import { db, log } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

// GET /api/team — list all members in the user's organization
router.get("/api/team", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: members, error } = await db
      .from('wireline_team_members')
      .select('*')
      .eq('tenant_id', req.user.id) // Assuming owner user id is the tenant id for now
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ members: members || [] });
  } catch (error: any) {
    log.error("Failed to fetch team members", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to fetch team members" });
  }
});

// POST /api/team/invite — invite a new member
router.post("/api/team/invite", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const { data, error } = await db.from('wireline_team_members').insert({
      tenant_id: req.user.id,
      user_id: null, // To be filled when they sign up
      email,
      role: role || 'member',
      invited_by: req.user.id
    }).select().single();

    if (error) throw error;
    
    // Attempt to send invitation email autonomously via user's connected integrations
    try {
      const { IntegrationService } = await import("../lib/integrations");
      const service = new IntegrationService(req.user.id);
      const appUrl = process.env.APP_URL || "https://wireline.ai";
      const invitedBy = req.user.email || "A colleague";
      
      const sent = await service.sendEmail({
        to: email,
        subject: `Invitation to join ${invitedBy} on Wireline`,
        body: `
          <h1>You've been invited!</h1>
          <p>${invitedBy} has invited you to join their team on Wireline Business OS.</p>
          <p>Wireline is the autonomous operating system for modern enterprises.</p>
          <p><a href="${appUrl}/signup?invite=${data.id}" style="padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 5px;">Accept Invitation</a></p>
          <p>If you don't have an account, you'll be prompted to create one.</p>
        `
      });

      if (sent) {
        log.info("Team invitation email sent via integration", { email, invitedBy: req.user.id });
      } else {
        log.warn("Team invitation logged but email not sent (no connected integration)", { email, userId: req.user.id });
      }
    } catch (mailErr) {
      log.error("Failed to send invitation email", { error: getErrorMessage(mailErr) });
    }
    
    res.json({ success: true, invitation: data });
  } catch (error: any) {
    log.error("Failed to invite team member", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to invite team member" });
  }
});

// DELETE /api/team/:id — remove a member or revoke invitation
router.delete("/api/team/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { error } = await db
      .from('wireline_team_members')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.user.id);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to remove team member", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to remove team member" });
  }
});

export default router;
