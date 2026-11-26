import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isCreateScaffoldLine } from "../src/lib/create-scaffold-line";

describe("setup lines are not Knowledge", () => {
  it("recognizes the create flow's own lines, however the extractor rewrites them", () => {
    for (const line of [
      "Starter: Front Desk.",
      "Role starter: Front Desk.",
      "Role starter: Create Your Own.",
      "Conversation direction: inbound.",
      "Conversation direction: hybrid.",
      "Configurable channels: Call, Email.",
      "  configurable channels : Call, Text, Email.",
    ]) {
      expect(isCreateScaffoldLine(line), line).toBe(true);
    }
  });

  it("keeps real facts and rules that merely mention those words", () => {
    for (const line of [
      "Service calls are $89.",
      "We start every job with a free estimate.",
      "The starter package includes two visits.",
      "Callers asking about channels should be told we text and email.",
    ]) {
      expect(isCreateScaffoldLine(line), line).toBe(false);
    }
  });

  it("filters both rules and facts before training is saved", () => {
    const routes = readFileSync(resolve(process.cwd(), "src/routes/agent-routes-v2.ts"), "utf8");
    expect(routes.match(/!isCreateScaffoldLine\(item\.content\)/g)).toHaveLength(2);
  });
});
