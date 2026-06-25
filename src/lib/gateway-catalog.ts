import { Router } from "express";
import { authenticateUser } from "../middleware/auth";
import { isAIGatewayConfigured, listAIGatewayLanguageModels } from "./ai-gateway";

const router = Router();

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
