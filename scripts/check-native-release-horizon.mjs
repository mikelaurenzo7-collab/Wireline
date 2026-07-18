import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const workflow = read(".github/workflows/ios-simulator.yml");
const androidBuild = read("android/app/build.gradle.kts");
const androidReadme = read("android/README.md");
const iosReadme = read("ios/README.md");

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(workflow.includes("runs-on: macos-15"), "iOS CI must use the macOS 15 runner.");
assert(
  workflow.includes('xcode-version: "26.3"'),
  "iOS CI must pin Xcode 26.3 instead of floating latest-stable.",
);
assert(!workflow.includes("runs-on: macos-14"), "iOS CI must not use the retired release runner.");
assert(
  !workflow.includes("xcode-version: latest-stable"),
  "iOS release CI must remain reproducible.",
);
assert(androidBuild.includes("compileSdk = 36"), "Android must compile against API 36.");
assert(androidBuild.includes("targetSdk = 36"), "Android must target API 36.");
assert(
  androidReadme.includes("August 31, 2026") && androidReadme.includes("API 36"),
  "Android release documentation must name the 2026 Play deadline and target.",
);
assert(
  iosReadme.includes("Xcode 26 or newer") && iosReadme.includes("iOS 26 SDK"),
  "iOS release documentation must name the current App Store toolchain.",
);

if (failures.length > 0) {
  console.error("Native release-horizon contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Native release-horizon contract passed.");
