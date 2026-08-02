import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function source(relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) {
    failures.push(`${relativePath}: required file is missing`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function requirePattern(relativePath, contents, pattern, message) {
  if (!pattern.test(contents)) failures.push(`${relativePath}: ${message}`);
}

function forbidPattern(relativePath, contents, pattern, message) {
  if (pattern.test(contents)) failures.push(`${relativePath}: ${message}`);
}

const commandBar = source("src/components/CommandBar.tsx");
const focusTrap = source("src/lib/use-modal-focus-trap.ts");
const appShell = source("src/components/layout/AppShell.tsx");
const workspaceShell = source("src/components/WorkspaceShell.tsx");

requirePattern(
  "src/components/CommandBar.tsx",
  commandBar,
  /data-slot="command-palette"/,
  "must expose a stable command-palette slot",
);
requirePattern(
  "src/components/CommandBar.tsx",
  commandBar,
  /function onSearchKeyDown/,
  "must scope command selection to the search field",
);
requirePattern(
  "src/components/CommandBar.tsx",
  commandBar,
  /onKeyDown=\{onSearchKeyDown\}/,
  "must bind search keyboard navigation to the search field",
);
requirePattern(
  "src/components/CommandBar.tsx",
  commandBar,
  /useModalFocusTrap\(dialogRef,\s*\{\s*active:\s*isOpen,\s*onEscape:\s*close\s*\}\)/s,
  "must use the shared modal focus lifecycle",
);
requirePattern(
  "src/components/CommandBar.tsx",
  commandBar,
  /ref=\{dialogRef\}/,
  "must bind the shared focus trap to the dialog",
);
requirePattern(
  "src/lib/use-modal-focus-trap.ts",
  focusTrap,
  /event\.key !== "Tab"/,
  "must contain Tab within the active dialog",
);
requirePattern(
  "src/lib/use-modal-focus-trap.ts",
  focusTrap,
  /isTopmostTrap/,
  "must isolate keyboard handling to the topmost dialog",
);
requirePattern(
  "src/components/CommandBar.tsx",
  commandBar,
  /href: "\/overview"/,
  "must include the active Overview route",
);
requirePattern(
  "src/components/CommandBar.tsx",
  commandBar,
  /href: "\/inbox"/,
  "must include the active Inbox route",
);
requirePattern(
  "src/components/CommandBar.tsx",
  commandBar,
  /href: "\/settings\/apps"/,
  "must include client-app settings",
);
forbidPattern(
  "src/components/CommandBar.tsx",
  commandBar,
  /href: "\/(ops|chat|sms|pipeline|founder|dnc|audit)"/,
  "must not expose obsolete or unsupported destinations",
);
requirePattern(
  "src/components/CommandBar.tsx",
  commandBar,
  /href: "\/phone"/,
  "must include the active Phone route",
);
requirePattern(
  "src/components/layout/AppShell.tsx",
  appShell,
  /<CommandBar\s*\/>/,
  "must mount the command palette for authenticated workspace routes",
);
requirePattern(
  "src/components/WorkspaceShell.tsx",
  workspaceShell,
  /wireline:open-command-bar/,
  "must expose a visible workspace trigger",
);

if (failures.length) {
  console.error("Command-palette contract check failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Command-palette contract check passed");
}
