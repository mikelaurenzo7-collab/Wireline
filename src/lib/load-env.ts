/**
 * Must be imported first from server.ts so process.env is populated
 * before server-context / drizzle initialize.
 */
import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"], quiet: true });
