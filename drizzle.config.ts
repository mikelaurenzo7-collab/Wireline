import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Customer-data tables remain on the canonical application schema surface.
  // Internal xAI phone bindings are tracked separately so encrypted provider
  // credentials never enter account-export enumeration, while Drizzle still
  // includes them in snapshots and future migration diffs.
  schema: ["./src/db/schema.ts", "./src/db/xai-voice-schema.ts"],
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.POSTGRES_URL || process.env.DATABASE_URL || "",
  },
  verbose: true,
  strict: true,
});
