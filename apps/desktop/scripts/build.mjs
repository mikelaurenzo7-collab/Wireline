import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "../..");
const output = resolve(appRoot, "dist");
await mkdir(resolve(output, "renderer/fonts"), { recursive: true });
await build({
  absWorkingDir: appRoot,
  entryPoints: ["src/main.ts", "src/preload.ts"],
  outdir: output,
  outExtension: { ".js": ".cjs" },
  platform: "node",
  format: "cjs",
  target: "node24",
  bundle: true,
  packages: "external",
  sourcemap: false,
  logLevel: "info",
});
await cp(resolve(appRoot, "src/renderer"), resolve(output, "renderer"), { recursive: true });
const fontCss = await readFile(resolve(repoRoot, "public/fonts.css"), "utf8");
await writeFile(
  resolve(output, "renderer/fonts.css"),
  fontCss.replaceAll("url(/fonts/", "url(./fonts/"),
);
await cp(resolve(repoRoot, "public/fonts"), resolve(output, "renderer/fonts"), { recursive: true });
await cp(
  resolve(repoRoot, "src/styles/tokens.generated.css"),
  resolve(output, "renderer/tokens.css"),
);
await cp(
  resolve(repoRoot, "public/brand/botbound-app-icon.png"),
  resolve(output, "renderer/botbound.png"),
);
if (existsSync(resolve(appRoot, "native/bin"))) {
  await cp(resolve(appRoot, "native/bin"), resolve(output, "native"), { recursive: true });
}
console.log("BotBound Desktop built with bundled local UI, fonts, and preload.");
