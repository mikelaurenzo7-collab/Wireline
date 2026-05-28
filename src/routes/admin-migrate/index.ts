import { Router } from "express";
import schemaMigrationsRouter from "./schema-migrations";
import voiceQualityMigrationsRouter from "./voice-quality-migrations";
import mediaGenerationRouter from "./media-generation";
import provisioningRouter from "./provisioning";

const router = Router();

router.use(schemaMigrationsRouter);
router.use(voiceQualityMigrationsRouter);
router.use(mediaGenerationRouter);
router.use(provisioningRouter);

export default router;
