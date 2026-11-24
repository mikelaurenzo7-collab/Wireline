import express from "express";
import googleRouter from "./google";
import googleSheetsRouter from "./google-sheets";
import microsoftRouter from "./microsoft";
import microsoftGraphRouter from "./microsoft-graph";
import statusRouter from "./status";

const router = express.Router();

router.use(googleRouter);
router.use(googleSheetsRouter);
router.use(microsoftRouter);
router.use(microsoftGraphRouter);
router.use(statusRouter);

export default router;
