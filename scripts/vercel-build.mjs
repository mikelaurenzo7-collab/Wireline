import { spawnSync } from "node:child_process";

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const environment = process.env.VERCEL_ENV || process.env.NODE_ENV;
const shouldMigrate = environment === "production" || process.env.WIRELINE_RUN_MIGRATIONS === "true";

run("node", ["scripts/build-design-tokens.mjs"]);

if (shouldMigrate) {
  run("npm", ["run", "db:migrate"]);
} else {
  console.log(`Skipping database migrations for ${environment || "local"} build.`);
}

run("npm", ["run", "build"]);
run("npx", ["esbuild", "src/entrypoints/chatgpt-mcp-api.ts", "--platform=node", "--bundle", "--format=cjs", "--outfile=dist/chatgpt-mcp-api.cjs"]);
