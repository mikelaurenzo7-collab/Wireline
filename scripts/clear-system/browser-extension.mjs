/**
 * WIRELINE Command browser extension — visible WIRELINE/Bot naming, quick
 * command actions, workspace jumps, and the no-persistent-host-permissions
 * policy. Legacy route keys stay technical compatibility details.
 */
export function checkBrowserExtension({ read, mustInclude, mustExclude }) {
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
    /"name": "WIRELINE Command"/,
    "browser extension must use canonical WIRELINE display casing",
  );
  mustInclude(
    "apps/browser-extension/manifest.base.json",
    extensionManifest,
    /"default_title": "Open WIRELINE Command"/,
    "browser extension toolbar title must use canonical WIRELINE casing",
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
    /Call[\s\S]*Text[\s\S]*Email[\s\S]*Bot task/,
    "extension panel must expose Bot-native quick command actions",
  );
  mustInclude(
    "apps/browser-extension/panel/index.html",
    extensionPanel,
    /Bots[\s\S]*Connections[\s\S]*Phone[\s\S]*Inbox[\s\S]*Knowledge[\s\S]*Studio/,
    "extension panel must mirror the launch product IA",
  );
  mustInclude(
    "apps/browser-extension/panel/index.html",
    extensionPanel,
    /What should WIRELINE do\?/,
    "extension prompt must use canonical WIRELINE casing",
  );
  mustExclude(
    "apps/browser-extension/panel/index.html",
    extensionPanel,
    />Agent task<|>Agents<|>Wire<|>Training</,
    "extension visible navigation must not revive legacy Agent/Wire/Training labels",
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
    /WIRELINE Bot/,
    "extension generated prompts must use WIRELINE Bot language",
  );
  mustInclude(
    "apps/browser-extension/panel/panel.js",
    extensionPanelJs,
    /open-studio/,
    "extension panel must wire the Studio jump",
  );
  // Technical route keys intentionally remain compatible with existing web
  // redirects even though the visible labels are Bots/Connections/Knowledge.
  for (const route of ["agents", "wire", "phone", "inbox", "training", "studio"]) {
    mustInclude(
      "apps/browser-extension/panel/panel.js",
      extensionPanelJs,
      new RegExp(`route: "${route}"`),
      `extension must retain compatible ${route} route key`,
    );
  }
  mustInclude(
    "apps/browser-extension/panel/command.css",
    extensionCommandCss,
    /\.quick-actions/,
    "extension quick actions must have dedicated styling",
  );
  mustInclude(
    "apps/browser-extension/README.md",
    extensionReadme,
    /# WIRELINE Command/,
    "extension docs must use WIRELINE Command naming",
  );
  mustInclude(
    "apps/browser-extension/README.md",
    extensionReadme,
    /Bots, Connections, Phone, Inbox, Knowledge, or Studio/,
    "extension docs must mirror the launch product IA",
  );
}
