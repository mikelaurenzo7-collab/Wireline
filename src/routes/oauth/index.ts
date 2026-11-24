import express from "express";
import googleRouter from "./google";
import googleSheetsRouter from "./google-sheets";
import microsoftRouter from "./microsoft";
import yahooRouter from "./yahoo";
import microsoftGraphRouter from "./microsoft-graph";
import statusRouter from "./status";
import slackRouter from "./slack";
import xRouter from "./x";
import zoomRouter from "./zoom";

const router = express.Router();

router.use(googleRouter);
router.use(googleSheetsRouter);
router.use(microsoftRouter);
router.use(yahooRouter);
router.use(microsoftGraphRouter);
router.use(statusRouter);
router.use(slackRouter);
router.use(xRouter);
router.use(zoomRouter);

export default router;
