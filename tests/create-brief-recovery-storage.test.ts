import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATE_BRIEF_MAX_CHARS,
  clearCreateBrief,
  isCreateBriefRecoveryOwner,
  readCreateBrief,
  rememberCreateBrief,
  setCreateBriefRecoveryOwner,
  suspendCreateBriefRecovery,
} from "../src/lib/create-brief-recovery";
import { extractionPersistedSomething } from "../src/lib/training-extraction-result";

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  });
  setCreateBriefRecoveryOwner(null);
  setCreateBriefRecoveryOwner("owner-a");
});
afterEach(() => {
  setCreateBriefRecoveryOwner(null);
  vi.unstubAllGlobals();
});

describe("private first-brief recovery", () => {
  it("isolates Bots, clears on account switch, and rejects a late old-account response", () => {
    storage.set("unrelated", "keep");
    rememberCreateBrief("owner-a", "bot-one", "First brief");
    rememberCreateBrief("owner-a", "bot-two", "Second brief");
    expect(readCreateBrief("owner-a", "bot-one")).toBe("First brief");
    expect(readCreateBrief("owner-a", "bot-two")).toBe("Second brief");
    expect(readCreateBrief("owner-b", "bot-one")).toBe("");
    setCreateBriefRecoveryOwner("owner-b");
    expect(rememberCreateBrief("owner-a", "bot-one", "Late private response")).toBe(false);
    expect([...storage.values()]).toEqual(["keep"]);
    setCreateBriefRecoveryOwner("owner-a");
    expect(readCreateBrief("owner-a", "bot-one")).toBe("");
  });

  it("disables access during an inconclusive session probe without deleting a draft", () => {
    rememberCreateBrief("owner-a", "bot-one", "Offline recovery");
    suspendCreateBriefRecovery();
    expect(isCreateBriefRecoveryOwner("owner-a")).toBe(false);
    expect(readCreateBrief("owner-a", "bot-one")).toBe("");
    expect(rememberCreateBrief("owner-a", "bot-one", "Late update")).toBe(false);
    setCreateBriefRecoveryOwner("owner-a");
    expect(readCreateBrief("owner-a", "bot-one")).toBe("Offline recovery");
    setCreateBriefRecoveryOwner(null);
    setCreateBriefRecoveryOwner("owner-a");
    expect(readCreateBrief("owner-a", "bot-one")).toBe("");
  });

  it("keeps an edited draft when an earlier extraction is confirmed", () => {
    rememberCreateBrief("owner-a", "bot-one", "Edited brief");
    clearCreateBrief("owner-a", "bot-one", "Original brief");
    expect(readCreateBrief("owner-a", "bot-one")).toBe("Edited brief");
    clearCreateBrief("owner-a", "bot-one", " Edited brief ");
    expect(readCreateBrief("owner-a", "bot-one")).toBe("");
    expect(storage.size).toBe(0);
  });

  it("bounds payloads without replacing the recoverable draft", () => {
    rememberCreateBrief("owner-a", "bot-one", "Keep this brief");
    expect(rememberCreateBrief("owner-a", "bot-one", "x".repeat(CREATE_BRIEF_MAX_CHARS + 1))).toBe(
      false,
    );
    expect(rememberCreateBrief("owner-a", "bot-one", "   ")).toBe(false);
    expect(readCreateBrief("owner-a", "bot-one")).toBe("Keep this brief");
  });

  it("preserves and clears in memory when browser storage is denied", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("Denied");
      },
      setItem: () => {
        throw new Error("Denied");
      },
      removeItem: () => {
        throw new Error("Denied");
      },
    });
    expect(rememberCreateBrief("owner-a", "bot-one", "Private memory brief")).toBe(true);
    expect(readCreateBrief("owner-a", "bot-one")).toBe("Private memory brief");
    clearCreateBrief("owner-a", "bot-one");
    expect(readCreateBrief("owner-a", "bot-one")).toBe("");
  });

  it("does not restore stale storage if its deletion fails after a save", () => {
    rememberCreateBrief("owner-a", "bot-one", "Already applied");
    sessionStorage.removeItem = () => {
      throw new Error("Storage became read-only");
    };
    clearCreateBrief("owner-a", "bot-one");
    expect(readCreateBrief("owner-a", "bot-one")).toBe("");
  });
});

describe("confirmed extraction result", () => {
  it.each([
    {},
    null,
    { readiness: { rules: 0, facts: 0, tone: false } },
    { readiness: { rules: "1", facts: -1, tone: "false" } },
    { directives: [], knowledge: [], personality: " " },
  ])("does not mark empty or malformed content as training success: %j", async (body) => {
    expect(await extractionPersistedSomething(new Response(JSON.stringify(body)))).toBe(false);
  });

  it.each([
    { readiness: { rules: 1, facts: 0, tone: false } },
    { readiness: { rules: 0, facts: 1, tone: false } },
    { readiness: { rules: 0, facts: 0, tone: true } },
    { directives: [{ content: "Confirm the model" }] },
  ])("recognizes persisted training: %j", async (body) => {
    expect(await extractionPersistedSomething(new Response(JSON.stringify(body)))).toBe(true);
  });

  it("retains a brief when JSON parsing fails or the request was unsuccessful", async () => {
    expect(await extractionPersistedSomething(new Response("not json"))).toBe(false);
    expect(
      await extractionPersistedSomething(
        new Response(JSON.stringify({ readiness: { rules: 1 } }), { status: 503 }),
      ),
    ).toBe(false);
  });
});
