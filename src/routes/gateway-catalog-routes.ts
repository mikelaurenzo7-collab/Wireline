import { Router } from "express";
import { authenticateUser } from "../middleware/auth";
import { isAIGatewayConfigured, listAIGatewayLanguageModels } from "../lib/ai-gateway";

const router = Router();

/** GET /api/model-catalog — AI Gateway language-model catalog for authenticated tenants. */
router.get("/api/model-catalog", authenticateUser, async (_req, res) => {
  const models = await listAIGatewayLanguageModels();
  res.json({
    enabled: isAIGatewayConfigured(),
    models: models.map((model) => ({
      id: model.id,
      label: model.name,
      provider: model.provider,
      description: model.description,
      category: "language",
    })),
  });
});

export default router;
