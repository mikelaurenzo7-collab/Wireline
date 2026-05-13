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
    
    // In a real app, we would send an invitation email here.
    log.info("Team invitation sent", { email, invitedBy: req.user.id });
    
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
