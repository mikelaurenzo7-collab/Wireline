import { Router, type Request, type Response } from "express";

/**
 * The account-level Director workspace was retired when Agent Studio became
 * Wireline's single authenticated product surface. Studio instruction updates
 * now use the owned-agent training endpoint instead.
 *
 * Keep this narrow terminal router temporarily so stale browser bookmarks and
 * old clients receive an explicit lifecycle response rather than a misleading
 * generic API error. It imports none of the former LLM, design, artifact, or
 * command-center runtime.
 */
const router = Router();

router.use((_req: Request, res: Response) => {
  res.status(410).json({
    code: "GONE",
    error: "The Director workspace has been retired. Use Agent Studio instead.",
  });
});

export default router;
