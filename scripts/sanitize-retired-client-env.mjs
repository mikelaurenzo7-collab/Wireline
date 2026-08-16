#!/usr/bin/env node
/**
 * Canonical production build compatibility bridge.
 *
 * Vercel may retain a retired VITE-prefixed variable after the browser runtime
 * has moved to server-minted, one-use demo tickets. Remove that value from the
 * current Node process before any boundary checks, tests, or Vite bundling.
 *
 * The standalone deployment-boundary audit remains strict so project settings
 * still report the stale entry until an operator deletes it in Vercel.
 */
import { PROJECT_ID as CANONICAL_VERCEL_PROJECT_ID } from "./lib/vercel-project.mjs";

const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
const isCanonicalProduction =
  environment === "production" &&
  String(process.env.VERCEL_PROJECT_ID || "").trim() === CANONICAL_VERCEL_PROJECT_ID;

if (isCanonicalProduction && process.env.VITE_VAPI_PUBLIC_KEY) {
  delete process.env.VITE_VAPI_PUBLIC_KEY;
  console.warn(
    "Production build removed retired VITE_VAPI_PUBLIC_KEY before validation and bundling. Delete the stale Vercel project setting after release.",
  );
}
