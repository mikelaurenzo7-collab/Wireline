/**
 * Load process.env before any other app modules read secrets.
 * `.env` first, then `.env.local` (e.g. from `vercel env pull`) with override.
 *
 * Vitest runs with `NODE_ENV=test` by default — we skip `.env.local` there so
 * pulled production DSNs/keys do not break unit tests. Use
 * `WIRELINE_USE_VERCEL_ENV_IN_TEST=true` (set by `npm run test:run:vercel`) to
 * load `.env.local` during tests when you intentionally want Vercel env.
 */
import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config();

const useLocalInTest = process.env.WIRELINE_USE_VERCEL_ENV_IN_TEST === "true";
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
if (!isTest || useLocalInTest) {
  dotenv.config({ path: resolve(process.cwd(), ".env.local"), override: true });
}
