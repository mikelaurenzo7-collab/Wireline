#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function walkRoutes(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkRoutes(p, out);
    else if (
      name.endsWith(".ts") &&
      !name.endsWith(".test.ts") &&
      p.includes(`${path.sep}routes${path.sep}`)
    ) {
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

let added = 0;
for (const file of walkRoutes(path.join(ROOT, "src/routes"))) {
  let content = fs.readFileSync(file, "utf8");
  if (!/\bAppError\b/.test(content) || /import\s*\{[^}]*AppError/.test(content)) continue;
  const imp = `import { AppError } from "${relImport(file)}";\n`;
  const m = content.match(/^import .+;\n/m);
  if (m) {
    const idx = content.indexOf(m[0]) + m[0].length;
    content = content.slice(0, idx) + imp + content.slice(idx);
  } else {
    content = imp + content;
  }
  fs.writeFileSync(file, content);
  added++;
  console.log(path.relative(ROOT, file));
}
console.log(`Added AppError import to ${added} file(s).`);
