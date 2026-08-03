const INSTALL_SYMBOL = Symbol.for("wireline.fatal-process-guard.installed");
const globalState = globalThis as typeof globalThis & { [INSTALL_SYMBOL]?: boolean };

if (!globalState[INSTALL_SYMBOL]) {
  globalState[INSTALL_SYMBOL] = true;
  process.prependListener("uncaughtException", () => {
    // Other process listeners own structured logging and telemetry reporting.
    // Keep the process alive only long enough for those synchronous handlers
    // and short buffered transports, then terminate the corrupted runtime.
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 500);
  });
}
