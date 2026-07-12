/**
 * Wireline Command browser extension — naming, quick command actions,
 * workspace jumps, and the no-persistent-host-permissions policy.
 */
export function checkBrowserExtension({ read, mustInclude }) {
  const extensionManifest = read("apps/browser-extension/manifest.base.json");
  const extensionWorker = read("apps/browser-extension/background/service-worker.js");
  const extensionPanel = read("apps/browser-extension/panel/index.html");
  const extensionPanelJs = read("apps/browser-extension/panel/panel.js");
  const extensionCommandCss = read("apps/browser-extension/panel/command.css");
  const extensionBuild = read("apps/browser-extension/scripts/build.mjs");
  const extensionReadme = read("apps/browser-extension/README.md");

  mustInclude(
    "apps/browser-extension/manifest.base.json",
    extensionManifest,
    /"name": "Wireline Command"/,
    "browser extension must be positioned as Wireline Command",
  );
  mustInclude(
    "apps/browser-extension/background/service-worker.js",
    extensionWorker,
    /action === "call"/,
    "extension must support call commands from browser context",
  );
  mustInclude(
    "apps/browser-extension/background/service-worker.js",
    extensionWorker,
    /action === "text"/,
    "extension must support text commands from browser context",
  );
  mustInclude(
    "apps/browser-extension/scripts/build.mjs",
    extensionBuild,
    /hostPermissions\.length/,
    "extension policy must keep persistent host permissions out",
  );
  mustInclude(
    "apps/browser-extension/panel/index.html",
    extensionPanel,
    /Call[\s\S]*Text[\s\S]*Email[\s\S]*Agent task/,
    "extension panel must expose quick command actions",
  );
  mustInclude(
    "apps/browser-extension/panel/index.html",
    extensionPanel,
    /Agents[\s\S]*Wire[\s\S]*Phone[\s\S]*Inbox[\s\S]*Studio/,
    "extension panel must expose Agents, Wire, Phone, Inbox, and Studio jumps",
  );
  mustInclude(
    "apps/browser-extension/panel/panel.js",
    extensionPanelJs,
    /actionPrompts[\s\S]*call[\s\S]*text[\s\S]*followup/,
    "extension panel must wire quick commands",
  );
  mustInclude(
    "apps/browser-extension/panel/panel.js",
    extensionPanelJs,
    /open-studio/,
    "extension panel must wire the Studio jump",
  );
  mustInclude(
    "apps/browser-extension/panel/command.css",
    extensionCommandCss,
    /\.quick-actions/,
    "extension quick actions must have dedicated styling",
  );
  mustInclude(
    "apps/browser-extension/README.md",
    extensionReadme,
    /# Wireline Command/,
    "extension docs must use Wireline Command naming",
  );
}
