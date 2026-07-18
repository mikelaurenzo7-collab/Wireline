import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const implementation = read("src/lib/breached-passwords.ts");
const authService = read("src/lib/auth-service.ts");
const privacyPage = read("src/components/PrivacyPolicyPage.tsx");
const controls = read("docs/security/auth-password-controls.md");

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(
  implementation.includes('https://api.pwnedpasswords.com/range'),
  "Breached-password screening must use the Pwned Passwords range API.",
);
assert(
  implementation.includes("sha1.slice(0, 5)") && implementation.includes("sha1.slice(5)"),
  "Breached-password screening must keep the k-anonymous five-character prefix boundary.",
);
assert(
  implementation.includes('"Add-Padding": "true"'),
  "Pwned Passwords range requests must retain response padding.",
);
assert(
  implementation.includes('env.NODE_ENV === "production" || env.VERCEL === "1"') &&
    implementation.includes('return "enforce"'),
  "Production and Vercel password screening must remain fail-closed.",
);
assert(
  authService.includes('await requirePasswordSafety(password, "signup");'),
  "Custom Wireline signup must enforce breached-password screening.",
);
assert(
  authService.includes('await requirePasswordSafety(newPassword, "reset");'),
  "Custom Wireline password reset must enforce breached-password screening.",
);
assert(
  privacyPage.includes("<strong>Have I Been Pwned Pwned Passwords</strong>") &&
    privacyPage.includes("a k-anonymous partial hash prefix"),
  "The public privacy policy must disclose the active Pwned Passwords subprocess.",
);
assert(
  controls.includes("It does not use") &&
    controls.includes("Supabase Auth") &&
    controls.includes("The active Wireline control is now server-side breached-password screening"),
  "Security documentation must distinguish custom Wireline auth from the Supabase Auth advisor.",
);

if (failures.length > 0) {
  console.error("Password-screening disclosure contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Password-screening disclosure contract passed.");
