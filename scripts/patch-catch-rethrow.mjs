#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function walkRoutes(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkRoutes(p, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && p.includes(`${path.sep}routes${path.sep}`)) {
      out.push(p);
    }
  }
  return out;
}

function relImport(file) {
  const from = path.dirname(file);
  let rel = path.relative(from, path.join(ROOT, "src/lib/api-error.ts")).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel.replace(/\.ts$/, "");
}

let patched = 0;
for (const file of walkRoutes(path.join(ROOT, "src/routes"))) {
  let content = fs.readFileSync(file, "utf8");
  const orig = content;
  content = content.replace(/catch \((\w+)\) \{/g, (match, errVar) => {
    if (match.includes("instanceof AppError")) return match;
    patched++;
    return `catch (${errVar}) { if (${errVar} instanceof AppError) throw ${errVar};`;
  });
  if (content !== orig) {
    if (content.includes("instanceof AppError") && !/import[^;]*\bAppError\b/.test(content)) {
      const imp = `import { AppError } from "${relImport(file)}";\n`;
      const m = content.match(/^import .+;\n/m);
      if (m) {
        const idx = content.indexOf(m[0]) + m[0].length;
        content = content.slice(0, idx) + imp + content.slice(idx);
      } else {
        content = imp + content;
      }
    }
    fs.writeFileSync(file, content);
  }
}
console.log(`Patched ${patched} catch blocks`);
