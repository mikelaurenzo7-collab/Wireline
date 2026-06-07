import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(__dirname, "director-routes.ts"), "utf8");

describe("Director stream activity milestones", () => {
  it("emits route, model, compose, and terminal save completion on the LLM success path", () => {
    const routeDone = src.indexOf('emitDirectorActivityDone(sse, "route");');
    const modelDone = src.indexOf(
      'emitDirectorActivityDone(sse, "model");',
      src.indexOf("runDirectorStreamLlm("),
    );
    const composeDone = src.indexOf('emitDirectorActivityDone(sse, "compose");', modelDone);
    const finalizeCall = src.indexOf(
      "streamFinalized = await finalizeDirectorStreamTurn",
      composeDone,
    );
    const saveDone = src.indexOf('emitDirectorActivityDone(sse, "save");');
    const finalDone = src.indexOf('sse.write("done", quickPayload);', saveDone);

    expect(routeDone).toBeGreaterThan(src.indexOf("resolveStitchDirectorPath({"));
    expect(modelDone).toBeGreaterThan(src.indexOf("runDirectorStreamLlm("));
    expect(composeDone).toBeGreaterThan(modelDone);
    expect(finalizeCall).toBeGreaterThan(composeDone);
    expect(finalDone).toBeGreaterThan(saveDone);
  });

  it("emits model, compose, and terminal save completion on the resilient fallback path", () => {
    const fallbackStart = src.indexOf(
      "const turn = await planDirectorTurnResilient({",
      src.indexOf("director stream failed"),
    );
    const modelDone = src.indexOf('emitDirectorActivityDone(sse, "model");', fallbackStart);
    const composeDone = src.indexOf('emitDirectorActivityDone(sse, "compose");', modelDone);
    const finalizeCall = src.indexOf("await finalizeDirectorStreamTurn(", composeDone);
    const finalizeFunction = src.indexOf("async function finalizeDirectorStreamTurn");
    const saveDone = src.indexOf('emitDirectorActivityDone(sse, "save");', finalizeFunction);
    const finalDone = src.indexOf('sse.write("done", quickPayload);', saveDone);

    expect(fallbackStart).toBeGreaterThan(-1);
    expect(modelDone).toBeGreaterThan(fallbackStart);
    expect(composeDone).toBeGreaterThan(modelDone);
    expect(finalizeCall).toBeGreaterThan(composeDone);
    expect(finalDone).toBeGreaterThan(saveDone);
  });
});
