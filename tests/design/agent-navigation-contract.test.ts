import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("agent navigation contract", () => {
  const workspaceShell = read("src/components/WorkspaceShell.tsx");
  const overviewPage = read("src/pages/OverviewPage.tsx");
  const studioChrome = read("src/components/studio/StudioContextChrome.tsx");
  const createDialog = read("src/components/CreateAgentDialog.tsx");
  const productCopy = read("src/lib/product-copy.ts");

  it("keeps Studio off the primary rail while exposing agents in Overview", () => {
    expect(workspaceShell).not.toMatch(/label:\s*"Assistants"/);
    expect(workspaceShell).not.toMatch(/label:\s*"Agent Studio"/);
    expect(workspaceShell).toMatch(/label:\s*"Overview"/);
    expect(workspaceShell).toMatch(/label:\s*"Studio"/);
    expect(workspaceShell).toMatch(/aria-label="Agents"/);
    expect(workspaceShell).toMatch(/\/studio\?create=1/);
  });

  it("uses the screenshot-inspired overview as the only agent roster page", () => {
    expect(overviewPage).toMatch(/Good morning\./);
    expect(overviewPage).toMatch(/Your agents/);
    expect(overviewPage).toMatch(/Personal and business lines/);
    expect(overviewPage).toMatch(/Recent calls/);
    expect(overviewPage).toMatch(/Quick actions/);
    expect(overviewPage).not.toMatch(/Your assistants|New assistant|Create assistant/);
  });

  it("uses agent language across studio entry points", () => {
    expect(studioChrome).toMatch(/New agent/);
    expect(studioChrome).not.toMatch(/New assistant|Assistant/);
    expect(createDialog).toMatch(/New agent\.|Create agent/);
    expect(createDialog).toMatch(/\/knowledge\?agent=/);
    expect(createDialog).not.toMatch(/\/training\?agent=/);
    expect(productCopy).toMatch(/Brief it\. Train it\. Put it on the line\./);
  });
});
