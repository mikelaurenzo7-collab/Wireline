import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const roots = ["src"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const failures = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", "build", ".git"].includes(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    if (!stat.isFile()) continue;
    if (![...extensions].some((extension) => path.endsWith(extension))) continue;
    inspectFile(path);
  }
}

function addFailure(file, line, message) {
  failures.push(`${relative(process.cwd(), file)}:${line} ${message}`);
}

function inspectFile(file) {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const compact = line.replace(/\s+/g, " ");

    if (/<img\b/i.test(line) && !/\balt=/.test(line)) {
      addFailure(file, lineNumber, "Image elements need alt text or an explicit empty alt for decoration.");
    }

    if (/tabIndex=\{?[1-9]/.test(line) || /tabindex=["'][1-9]/i.test(line)) {
      addFailure(file, lineNumber, "Positive tabindex creates fragile keyboard order. Use DOM order or tabindex={0}/-1.");
    }

    if (/outline:\s*none/i.test(line) || /outline-none/.test(line)) {
      addFailure(file, lineNumber, "Do not remove focus outlines without a visible focus-visible replacement.");
    }

    if (/role=["']button["']/.test(line) && !/onKeyDown|onKeyUp|tabIndex/.test(compact)) {
      addFailure(file, lineNumber, "Custom role=button needs keyboard handling and focusability. Prefer <button>.");
    }

    if (/aria-hidden=["']true["']/.test(line) && /button|href=|tabIndex=\{?0/.test(compact)) {
      addFailure(file, lineNumber, "Focusable controls must not be hidden from assistive technology.");
    }
  });
}

for (const root of roots) walk(root);

if (failures.length > 0) {
  console.error("Accessibility contract failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Accessibility static contract passed.");
