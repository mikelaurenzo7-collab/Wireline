import { Router, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { authenticateUser } from "../middleware/auth";
import { log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);
const router = Router();

router.post("/audit", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    log.info("Starting Kimi Quality Audit via UI", { userId: req.user.id });
    
    // Execute the existing audit script
    const scriptPath = path.join(process.cwd(), "scripts", "kimi-qa.mjs");
    await execAsync(`node ${scriptPath}`);

    // Read the generated reports
    const reportPath = path.join(process.cwd(), "MATURITY_REPORT.md");
    const statePath = path.join(process.cwd(), "STATE-REPORT.md");

    const [report, state] = await Promise.all([
      fs.readFile(reportPath, "utf-8").catch(() => ""),
      fs.readFile(statePath, "utf-8").catch(() => "")
    ]);

    // Parse Maturity Score (simple regex for now)
    const scoreMatch = report.match(/\*\*Current Maturity:\*\* (\d+)\/10/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    res.json({
      success: true,
      score,
      report,
      state,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    log.error("Kimi Audit failed", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Quality audit failed to execute." });
  }
});

router.get("/status", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const reportPath = path.join(process.cwd(), "MATURITY_REPORT.md");
        const report = await fs.readFile(reportPath, "utf-8").catch(() => null);

        if (!report) {
            return res.json({ score: 0, status: "Awaiting first audit" });
        }

        const scoreMatch = report.match(/\*\*Current Maturity:\*\* (\d+)\/10/);
        const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

        res.json({
            score,
            status: score >= 9 ? "Hardened" : score >= 7 ? "Beta" : "Draft",
            lastAudit: (await fs.stat(reportPath)).mtime
        });
    } catch (e: any) {
        res.status(500).json({ error: "Failed to fetch quality status" });
    }
});

export default router;
