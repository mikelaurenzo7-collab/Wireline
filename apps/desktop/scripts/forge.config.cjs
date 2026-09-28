const { resolve } = require("node:path");

// Signing is deliberately unconfigured. A release owner must configure and
// validate platform signing before distributing anything from out/ publicly.
// macOS: packagerConfig.osxSign + osxNotarize (keychain/env credentials only).
// Windows: packagerConfig.windowsSign + the maker's windowsSign configuration.
module.exports = {
  packagerConfig: {
    name: "BotBound Desktop",
    executableName: "BotBoundDesktop",
    appBundleId: "app.botbound.desktop",
    asar: true,
    extraResource: [resolve(__dirname, "../dist/native")],
    ignore: [
      /^\/(?:src|scripts|native|tests|out)(?:\/|$)/,
      /^\/dist\/native(?:\/|$)/,
      /^\/(?:README\.md|package-lock\.json|tsconfig\.json|\.gitignore)$/,
    ],
  },
  makers: [
    { name: "@electron-forge/maker-squirrel", platforms: ["win32"], config: { name: "BotBoundDesktop" } },
    { name: "@electron-forge/maker-zip", platforms: ["win32", "darwin"], config: {} },
  ],
};
