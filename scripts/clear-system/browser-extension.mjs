/** BotBound Command browser extension. Technical wireline message/route keys remain stable. */
export function checkBrowserExtension({ read, mustInclude, mustExclude }) {
  const manifest = read("apps/browser-extension/manifest.base.json");
  const worker = read("apps/browser-extension/background/service-worker.js");
  const panel = read("apps/browser-extension/panel/index.html");
  const panelJs = read("apps/browser-extension/panel/panel.js");
  const commandCss = read("apps/browser-extension/panel/command.css");
  const build = read("apps/browser-extension/scripts/build.mjs");
  mustInclude("apps/browser-extension/manifest.base.json", manifest, /"name": "BotBound Command"/, "extension must use BotBound display identity");
  mustInclude("apps/browser-extension/manifest.base.json", manifest, /"default_title": "Open BotBound Command"/, "toolbar title must use BotBound");
  mustInclude("apps/browser-extension/background/service-worker.js", worker, /action === "call"/, "extension must support call commands");
  mustInclude("apps/browser-extension/background/service-worker.js", worker, /action === "text"/, "extension must support text commands");
  mustInclude("apps/browser-extension/scripts/build.mjs", build, /hostPermissions\.length/, "extension must keep persistent host permissions out");
  mustInclude("apps/browser-extension/panel/index.html", panel, /Personal call[\s\S]*data-action="text"[^>]*disabled[\s\S]*Text · Coming soon[\s\S]*Email[\s\S]*Bot task/, "panel must expose launch commands and keep SMS coming soon");
  mustInclude("apps/browser-extension/panel/index.html", panel, /Bots[\s\S]*Connections[\s\S]*Phone[\s\S]*Inbox[\s\S]*Knowledge[\s\S]*Workspace/, "panel must mirror product IA");
  mustInclude("apps/browser-extension/panel/index.html", panel, /What should BotBound do\?/, "prompt must use BotBound");
  mustExclude("apps/browser-extension/panel/index.html", panel, />Agent task<|>Agents<|>Wire<|>Training/, "visible extension navigation must not revive legacy labels");
  mustInclude("apps/browser-extension/panel/panel.js", panelJs, /actionPrompts[\s\S]*call[\s\S]*text[\s\S]*followup/, "panel must wire quick commands");
  mustInclude("apps/browser-extension/panel/panel.js", panelJs, /BotBound Bot/, "generated prompts must use BotBound Bot language");
  mustInclude("apps/browser-extension/panel/panel.js", panelJs, /open-studio/, "panel must wire Studio jump");
  for (const route of ["agents", "wire", "phone", "inbox", "training", "studio"]) mustInclude("apps/browser-extension/panel/panel.js", panelJs, new RegExp(`route: "${route}"`), `extension must retain compatible ${route} route key`);
  mustInclude("apps/browser-extension/panel/command.css", commandCss, /\.quick-actions/, "quick actions must have dedicated styling");
}
