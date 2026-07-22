import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

const roots = ["src"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const failures = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", "build", ".git"].includes(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    if (!stat.isFile() || !sourceExtensions.has(extname(path))) continue;
    inspectFile(path);
  }
}

function addFailure(file, sourceFile, node, message) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  failures.push(`${relative(process.cwd(), file)}:${line + 1} ${message}`);
}

function attribute(node, sourceFile, name) {
  return node.attributes.properties.find(
    (property) =>
      ts.isJsxAttribute(property) && property.name.getText(sourceFile).toLowerCase() === name,
  );
}

function attributeText(property, sourceFile) {
  if (!property || !ts.isJsxAttribute(property)) return "";
  if (!property.initializer) return "true";
  if (ts.isStringLiteral(property.initializer)) return property.initializer.text;
  return property.initializer.getText(sourceFile).replace(/^\{|\}$/g, "");
}

function collectLiteralText(node, output) {
  if (ts.isStringLiteralLike(node)) {
    output.push(node.text);
    return;
  }
  ts.forEachChild(node, (child) => collectLiteralText(child, output));
}

function hasVisibleFocusReplacement(value) {
  return /(?:focus|focus-visible):[^\s]*(?:ring|outline|border|shadow)/.test(value);
}

function inspectFile(file) {
  const text = readFileSync(file, "utf8");
  const extension = extname(file);
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    extension === ".tsx"
      ? ts.ScriptKind.TSX
      : extension === ".jsx"
        ? ts.ScriptKind.JSX
        : extension === ".js"
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS,
  );
  const inspectedFocusStrings = new Set();

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile).toLowerCase();
      const alt = attribute(node, sourceFile, "alt");
      const role = attribute(node, sourceFile, "role");
      const tabIndex = attribute(node, sourceFile, "tabindex");
      const onKeyDown = attribute(node, sourceFile, "onkeydown");
      const onKeyUp = attribute(node, sourceFile, "onkeyup");
      const ariaHidden = attribute(node, sourceFile, "aria-hidden");
      const className = attribute(node, sourceFile, "classname");

      if (tagName === "img" && !alt) {
        addFailure(
          file,
          sourceFile,
          node,
          "Image elements need alt text or an explicit empty alt for decoration.",
        );
      }

      if (tabIndex && /^[1-9]\d*$/.test(attributeText(tabIndex, sourceFile).trim())) {
        addFailure(
          file,
          sourceFile,
          node,
          "Positive tabindex creates fragile keyboard order. Use DOM order or tabindex={0}/-1.",
        );
      }

      if (
        tagName !== "button" &&
        attributeText(role, sourceFile).replace(/['"]/g, "") === "button" &&
        (!tabIndex || (!onKeyDown && !onKeyUp))
      ) {
        addFailure(
          file,
          sourceFile,
          node,
          "Custom role=button needs keyboard handling and focusability. Prefer <button>.",
        );
      }

      const hidden = attributeText(ariaHidden, sourceFile).replace(/['"]/g, "") === "true";
      const nativelyFocusable = ["a", "button", "input", "select", "textarea"].includes(tagName);
      const tabIndexText = attributeText(tabIndex, sourceFile).trim();
      const explicitlyFocusable = Boolean(tabIndex && !/^-[1-9]\d*$/.test(tabIndexText));
      if (hidden && (nativelyFocusable || explicitlyFocusable)) {
        addFailure(
          file,
          sourceFile,
          node,
          "Focusable controls must not be hidden from assistive technology.",
        );
      }

      if (className && ts.isJsxAttribute(className) && className.initializer) {
        const values = [];
        collectLiteralText(className.initializer, values);
        for (const value of values) inspectedFocusStrings.add(value);
        const combined = values.join(" ");
        if (/\boutline-none\b/.test(combined) && !hasVisibleFocusReplacement(combined)) {
          addFailure(
            file,
            sourceFile,
            className,
            "Do not remove focus outlines without a visible focus replacement.",
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  function inspectStandaloneFocusStrings(node) {
    if (ts.isStringLiteralLike(node) && !inspectedFocusStrings.has(node.text)) {
      if (/\boutline-none\b/.test(node.text) && !hasVisibleFocusReplacement(node.text)) {
        addFailure(
          file,
          sourceFile,
          node,
          "Do not remove focus outlines without a visible focus replacement.",
        );
      }
    }
    ts.forEachChild(node, inspectStandaloneFocusStrings);
  }

  inspectStandaloneFocusStrings(sourceFile);
}

for (const root of roots) walk(root);

if (failures.length > 0) {
  console.error("Accessibility contract failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Accessibility static contract passed.");
