import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const retiredProductLanguage = /Ametrine Precision|Browser Companion|browser companion/i;
const retiredPalette = /#5D3FD3|#451EBB|#F8F9FF|#EFF4FF|#E5EEFF|#0B1C30/i;

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

function mustExclude(file, source, pattern, message) {
  if (pattern.test(source)) failures.push(`${file}: ${message}`);
}

const rootReadme = read("README.md");
const androidReadme = read("android/README.md");
const iosReadme = read("ios/README.md");
const extensionReadme = read("apps/browser-extension/README.md");

mustInclude("README.md", rootReadme, /Wireline Command/, "must use current browser extension naming");
mustInclude("README.md", rootReadme, /Wireline Mono design system/, "must name the current design system");
mustInclude("README.md", rootReadme, /Create → Train → Run/, "must describe the current product model");
mustExclude("README.md", rootReadme, retiredProductLanguage, "must not use retired product/design language");

mustInclude("apps/browser-extension/README.md", extensionReadme, /# Wireline Command/, "extension docs must use Wireline Command naming");
mustInclude("apps/browser-extension/README.md", extensionReadme, /Call[\s\S]*Text[\s\S]*Follow-up[\s\S]*Agent task/, "extension docs must describe command actions");

mustInclude("android/README.md", androidReadme, /Agents that answer/, "Android docs must use agent-forward promise");
mustInclude("android/README.md", androidReadme, /Wireline Mono/, "Android docs must use Wireline Mono language");
mustExclude("android/README.md", androidReadme, retiredPalette, "Android docs must not document the retired palette");

mustInclude("ios/README.md", iosReadme, /Agents that answer/, "iOS docs must use agent-forward promise");
mustInclude("ios/README.md", iosReadme, /Wireline Mono/, "iOS docs must use Wireline Mono language");
mustExclude("ios/README.md", iosReadme, retiredPalette, "iOS docs must not document the retired palette");

if (failures.length) {
  console.error(`Wireline product docs check failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Wireline product docs check passed");
}
