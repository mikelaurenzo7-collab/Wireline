import express from "express";
import googleRouter from "./google";
import googleSheetsRouter from "./google-sheets";
import microsoftRouter from "./microsoft";
import yahooRouter from "./yahoo";
import salesforceRouter from "./salesforce";
import hubspotRouter from "./hubspot";
import apolloRouter from "./apollo";
import metaRouter from "./meta";
import shopifyRouter from "./shopify";
import squareRouter from "./square";
import microsoftGraphRouter from "./microsoft-graph";
import statusRouter from "./status";
import slackRouter from "./slack";
import zoomRouter from "./zoom";

const router = express.Router();

router.use(googleRouter);
router.use(googleSheetsRouter);
router.use(microsoftRouter);
router.use(yahooRouter);
router.use(salesforceRouter);
router.use(hubspotRouter);
router.use(apolloRouter);
router.use(metaRouter);
router.use(shopifyRouter);
router.use(squareRouter);
router.use(microsoftGraphRouter);
router.use(statusRouter);
router.use(slackRouter);
router.use(zoomRouter);

export default router;
