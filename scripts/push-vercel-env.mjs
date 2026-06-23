import fs from "fs";
import { execSync } from "child_process";

const envVars = JSON.parse(fs.readFileSync("stripe-env.json", "utf8"));

console.log("Pushing Stripe ENV vars to Vercel...");

for (const [key, value] of Object.entries(envVars)) {
  if (!value) continue;
  console.log(`Setting ${key}=${value}`);
  try {
    for (const envName of ["production", "preview", "development"]) {
      // First try to remove existing to avoid conflict
      try {
        execSync(`npx.cmd vercel env rm ${key} ${envName} --yes`, { stdio: "ignore" });
      } catch (e) {
        // ignore if not exists
      }
      execSync(`echo ${value} | npx.cmd vercel env add ${key} ${envName}`, { stdio: "inherit" });
    }
  } catch (err) {
    console.error(`Failed to set ${key}`, err.message);
  }
}

console.log("Finished pushing Stripe ENV vars to Vercel.");
