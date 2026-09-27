import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/api-error";
import { syncGoogleDriveToKnowledge } from "../src/services/google-drive-sync-v2";

const h = vi.hoisted(() => ({
  files: [] as Array<{ id?: string; name?: string; mimeType?: string }>,
  content: new Map<string, string>(),
  receipts: new Set<string>(),
  receiptParams: [] as unknown[][],
  saved: [] as Array<{ userId: string; agentId: string; content: string }>,
  extract: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  download: vi.fn(),
  account: true,
  rejectPersistence: false,
  conflictAtCommit: false,
}));

vi.mock("../src/lib/training-ai-spend", () => ({ runTrainingStructured: h.extract }));
vi.mock("../src/lib/secret-vault", () => ({
  decryptSecret: (value: string) => value,
  encryptSecret: (value: string) => value,
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (h.account ? [{ id: 1, accessToken: "sandbox-token" }] : []),
        }),
      }),
    }),
    execute: h.execute,
    transaction: h.transaction,
  },
}));
vi.mock("../src/lib/google-apis", () => ({
  googleApis: async () => ({
    auth: {
      OAuth2: class {
        setCredentials() {}
        on() {}
      },
    },
    drive: () => ({
      files: {
        list: async () => ({ data: { files: h.files } }),
        get: h.download,
        export: h.download,
      },
    }),
  }),
}));

const dialect = new PgDialect();
const documentText = "Office hours are Monday through Friday, 9 AM to 5 PM. Call before visiting.";
const userId = "00000000-0000-4000-8000-000000000001";

function addDocument(id: string, content = documentText) {
  h.files.push({ id, name: `Policy ${id}`, mimeType: "text/plain" });
  h.content.set(id, content);
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "sandbox-google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "sandbox-google-secret");
  h.files = [];
  h.content = new Map();
  h.receipts = new Set();
  h.receiptParams = [];
  h.saved = [];
  h.account = true;
  h.rejectPersistence = false;
  h.conflictAtCommit = false;
  h.extract.mockReset().mockResolvedValue({
    directives: [],
    knowledge: [{ content: "Office hours are 9 AM to 5 PM." }],
    personality: "",
  });
  h.download.mockReset().mockImplementation(async ({ fileId }: { fileId: string }) => ({
    data: h.content.get(fileId),
  }));
  h.execute.mockReset().mockImplementation(async (query) => {
    const { params } = dialect.sqlToQuery(query);
    const receipt = params.filter((item) => typeof item === "string").join(":");
    return { rows: h.receipts.has(receipt) ? [{ id: 1 }] : [] };
  });
  h.transaction.mockReset().mockImplementation(async (operation) => {
    const receiptsBefore = new Set(h.receipts);
    const savedBefore = [...h.saved];
    try {
      return await operation({
        execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
          const { params } = dialect.sqlToQuery(query);
          h.receiptParams.push(params);
          const [tenant, action, , key] = params;
          const receipt = [tenant, action, key].join(":");
          if (h.conflictAtCommit || h.receipts.has(receipt)) return { rows: [] };
          h.receipts.add(receipt);
          return { rows: [{ id: 1 }] };
        },
        insert: () => ({
          values: async (rows: typeof h.saved) => {
            if (h.rejectPersistence) throw new Error("Sandbox persistence failure");
            h.saved.push(...rows);
          },
        }),
      });
    } catch (error) {
      h.receipts = receiptsBefore;
      h.saved = savedBefore;
      throw error;
    }
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("budgeted Drive training and partial progress", () => {
  it("preserves earlier documents and skips their provider spend when retrying a partial import", async () => {
    addDocument("one");
    addDocument("two");
    addDocument("three");
    const extraction = h.extract.getMockImplementation()!;
    h.extract.mockImplementationOnce(extraction).mockRejectedValueOnce(
      new AppError(402, "AI_LIMIT", "Add managed allowance.", {
        recovery_path: "/settings/billing",
      }),
    );

    const partial = await syncGoogleDriveToKnowledge(userId, "bot-one");
    expect(partial).toMatchObject({
      status: "partial",
      ingestedCount: 1,
      failedCount: 1,
      recovery_path: "/settings/billing",
    });
    expect(h.extract).toHaveBeenCalledTimes(2);
    expect(h.saved).toHaveLength(1);
    expect(h.receipts.size).toBe(1);

    const retried = await syncGoogleDriveToKnowledge(userId, "bot-one");
    expect(retried).toMatchObject({ status: "ok", ingestedCount: 2, alreadyImportedCount: 1 });
    expect(h.extract).toHaveBeenCalledTimes(4);
    expect(h.saved).toHaveLength(3);
  });

  it("does not persist facts or a completion receipt when managed spend admission rejects", async () => {
    addDocument("one");
    h.extract.mockRejectedValue(new AppError(402, "AI_LIMIT", "Add managed allowance."));
    expect(await syncGoogleDriveToKnowledge(userId, "bot-one")).toMatchObject({
      status: "blocked",
      httpStatus: 402,
      ingestedCount: 0,
      code: "AI_LIMIT",
    });
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.saved).toHaveLength(0);
    expect(h.receipts.size).toBe(0);
  });

  it("rolls back the completion receipt with failed persistence so a retry can save the document", async () => {
    addDocument("one");
    h.rejectPersistence = true;
    expect(await syncGoogleDriveToKnowledge(userId, "bot-one")).toMatchObject({
      status: "blocked",
    });
    expect(h.receipts.size).toBe(0);
    h.rejectPersistence = false;
    expect(await syncGoogleDriveToKnowledge(userId, "bot-one")).toMatchObject({
      status: "ok",
      ingestedCount: 1,
    });
    expect(h.saved).toHaveLength(1);
    expect(h.extract).toHaveBeenCalledTimes(2);
  });

  it("does not duplicate records when another budgeted attempt commits the same revision first", async () => {
    addDocument("one");
    h.conflictAtCommit = true;
    expect(await syncGoogleDriveToKnowledge(userId, "bot-one")).toMatchObject({
      status: "ok",
      ingestedCount: 0,
      alreadyImportedCount: 1,
    });
    expect(h.extract).toHaveBeenCalledTimes(1);
    expect(h.saved).toHaveLength(0);
  });

  it("scopes receipts to the Bot and content revision while bounding the full input", async () => {
    addDocument("private-id", "A".repeat(31_000));
    h.files[0].name = "N".repeat(1000);
    expect(await syncGoogleDriveToKnowledge(userId, "bot-one")).toMatchObject({
      ingestedCount: 1,
      truncatedCount: 1,
    });
    expect(h.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        source: "google_drive",
        options: expect.objectContaining({
          maxTokens: 1800,
          user: `Document: ${"N".repeat(255)}\n\n${"A".repeat(30_000)}`,
        }),
      }),
    );
    const receiptText = JSON.stringify(h.receiptParams);
    expect(receiptText).not.toContain("private-id");
    expect(receiptText).not.toContain("bot-one");
    expect(receiptText).not.toContain("A".repeat(50));
    expect(receiptText).not.toContain("N".repeat(50));
    h.content.set("private-id", "B".repeat(30_000));
    expect(await syncGoogleDriveToKnowledge(userId, "bot-one")).toMatchObject({ ingestedCount: 1 });
    expect(await syncGoogleDriveToKnowledge(userId, "bot-two")).toMatchObject({ ingestedCount: 1 });
    expect(h.extract).toHaveBeenCalledTimes(3);
  });

  it("reports download failures and short-document skips instead of claiming a full import", async () => {
    addDocument("one");
    addDocument("empty", "short");
    addDocument("unreadable");
    h.download.mockImplementation(async ({ fileId }: { fileId: string }) => {
      if (fileId === "unreadable") throw new Error("Private provider response");
      return { data: h.content.get(fileId) };
    });
    const result = await syncGoogleDriveToKnowledge(userId, "bot-one");
    expect(result).toMatchObject({
      status: "partial",
      ingestedCount: 1,
      skippedCount: 1,
      failedCount: 1,
    });
    expect(result.message).toContain("1 could not be read");
    expect(result.message).not.toContain("Private provider response");
  });

  it("does no paid work when no Google account is connected", async () => {
    h.account = false;
    expect(await syncGoogleDriveToKnowledge(userId, "bot-one")).toMatchObject({
      status: "no_accounts",
    });
    expect(h.extract).not.toHaveBeenCalled();
  });
});
