import express from "express";
import googleRouter from "./google";
import googleSheetsRouter from "./google-sheets";
import microsoftRouter from "./microsoft";
import microsoftGraphRouter from "./microsoft-graph";
import statusRouter from "./status";
import slackRouter from "./slack";

const router = express.Router();

router.use(googleRouter);
router.use(googleSheetsRouter);
router.use(microsoftRouter);
router.use(microsoftGraphRouter);
router.use(statusRouter);
router.use(slackRouter);

export default router;
