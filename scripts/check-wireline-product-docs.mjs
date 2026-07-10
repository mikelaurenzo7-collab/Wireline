import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const retiredProductTerms = [
  "Ametrine Precision",
  "Browser Companion",
  "personal AI call assistant",
];

function read(relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) {
    failures.push(`${relativePath}: missing`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function mustInclude(file, source, pattern, message) {
  if (!pattern.test(source)) failures.push(`${file}: ${message}`);
}

function mustExcludeTerms(file, source, terms, message) {
  const lower = source.toLowerCase();
  const found = terms.filter((term) => lower.includes(term.toLowerCase()));
  if (found.length) failures.push(`${file}: ${message}: ${found.join(", ")}`);
}

const rootReadme = read("README.md");
const docsReadme = read("docs/README.md");
const androidReadme = read("android/README.md");
const iosReadme = read("ios/README.md");
const extensionReadme = read("apps/browser-extension/README.md");
const staticHead = read("index.html");
const ogImage = read("public/og-image.svg");

mustInclude(
  "README.md",
  rootReadme,
  /Wireline Command/,
  "must use current browser extension naming",
);
mustInclude(
  "README.md",
  rootReadme,
  /Wireline Letterpress design system/,
  "must name the current design system",
);
mustInclude(
  "README.md",
  rootReadme,
  /Create\s*(?:->|→)\s*Train\s*(?:->|→)\s*Run/,
  "must describe the current product model",
);
mustExcludeTerms(
  "README.md",
  rootReadme,
  retiredProductTerms,
  "must not use retired product language",
);

mustInclude(
  "docs/README.md",
  docsReadme,
  /Create -> Train -> Run/,
  "docs index must describe the current product model",
);
mustInclude("docs/README.md", docsReadme, /Agents/, "docs index must use agent language");
mustInclude(
  "docs/README.md",
  docsReadme,
  /Training/,
  "docs index must use Training as the heavy-config surface",
);
mustInclude(
  "docs/README.md",
  docsReadme,
  /Wireline Command/,
  "docs index must use Wireline Command naming",
);
mustExcludeTerms(
  "docs/README.md",
  docsReadme,
  retiredProductTerms,
  "docs index must not use retired product language",
);

mustInclude(
  "apps/browser-extension/README.md",
  extensionReadme,
  /# Wireline Command/,
  "extension docs must use Wireline Command naming",
);
mustInclude(
  "apps/browser-extension/README.md",
  extensionReadme,
  /Call[\s\S]*Text[\s\S]*Follow-up[\s\S]*Agent task/,
  "extension docs must describe command actions",
);

mustInclude(
  "android/README.md",
  androidReadme,
  /Wire your agent/,
  "Android docs must use agent-forward promise",
);
mustInclude(
  "android/README.md",
  androidReadme,
  /Wireline Letterpress/,
  "Android docs must use Wireline Letterpress language",
);

mustInclude(
  "ios/README.md",
  iosReadme,
  /Wire your agent/,
  "iOS docs must use agent-forward promise",
);
mustInclude(
  "ios/README.md",
  iosReadme,
  /Wireline Letterpress/,
  "iOS docs must use Wireline Letterpress language",
);

mustInclude(
  "index.html",
  staticHead,
  /Wireline — AI phone employees that turn calls into sales\./,
  "static metadata must use current positioning",
);
mustInclude(
  "index.html",
  staticHead,
  /AI phone employees that answer calls, qualify leads, book appointments, follow up/i,
  "static metadata must describe the current landing promise",
);
mustExcludeTerms(
  "index.html",
  staticHead,
  retiredProductTerms,
  "static metadata must not use retired product language",
);

mustInclude(
  "public/og-image.svg",
  ogImage,
  /AI PHONE[\s\S]*EMPLOYEES/,
  "OG image must use the current landing promise",
);
mustInclude(
  "public/og-image.svg",
  ogImage,
  /Answer\. Qualify\. Book\. Follow up\. Log every result\./,
  "OG image must reinforce the phone-employee promise",
);
mustExcludeTerms(
  "public/og-image.svg",
  ogImage,
  retiredProductTerms,
  "OG image must not use retired product language",
);

if (failures.length) {
  console.error(`Wireline product docs check failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Wireline product docs check passed");
}
