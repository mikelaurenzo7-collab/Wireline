import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openAIResponsesCreate: vi.fn(),
  openAIResponsesInputTokensCount: vi.fn(),
  runWithManagedAiSpend: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock("../src/lib/openai-responses-api", () => ({
  openAIResponsesCreate: mocks.openAIResponsesCreate,
  openAIResponsesInputTokensCount: mocks.openAIResponsesInputTokensCount,
}));
vi.mock("../src/lib/managed-ai-operation-spend", () => ({
  runWithManagedAiSpend: mocks.runWithManagedAiSpend,
}));
vi.mock("../src/lib/ai-audit", () => ({ recordUsage: mocks.recordUsage }));

import { extractKnowledgeDocumentWithOpenAI } from "../src/lib/knowledge-document-openai";
import { OPENAI_MODELS, pricingForModel } from "../src/lib/ai-models";
import { storedZip } from "./helpers/stored-zip";

const extraction = {
  directives: [{ content: "Offer appointments.", priority: 7 }],
  knowledge: [{ content: "Open Monday through Friday." }],
  personality: "Clear and welcoming.",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  mocks.openAIResponsesInputTokensCount.mockResolvedValue(1_234);
  mocks.openAIResponsesCreate.mockResolvedValue({
    id: "resp_test",
    model: "gpt-5.6-luna",
    status: "completed",
    output_text: JSON.stringify(extraction),
    usage: { input_tokens: 20, output_tokens: 30 },
  });
  mocks.runWithManagedAiSpend.mockImplementation(
    async (input: { operation: () => Promise<unknown> }) => input.operation(),
  );
});

afterEach(() => vi.unstubAllEnvs());

describe("OpenAI knowledge document extraction", () => {
  it.each([
    ["guide.pdf", "application/pdf", Buffer.from("%PDF-1.7\n"), null],
    [
      "guide.docx",
      "",
      storedZip([
        {
          name: "word/document.xml",
          contents:
            "<w:document><w:body><w:p><w:r><w:t>Business hours are nine to five.</w:t></w:r></w:p></w:body></w:document>",
        },
      ]),
      "Document contents:\nBusiness hours are nine to five.",
    ],
    [
      "guide.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      storedZip([
        { name: "xl/workbook.xml", contents: "<workbook/>" },
        {
          name: "xl/worksheets/sheet1.xml",
          contents:
            '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Opens at 9 AM</t></is></c></row></sheetData></worksheet>',
        },
      ]),
      "Document contents:\nSheet 1\nRow 1: A1: Opens at 9 AM",
    ],
  ] as const)(
    "sends %s through OpenAI with input appropriate to its format and returns the extraction",
    async (fileName, mimeType, bytes, expectedOfficeText) => {
      const fileBase64 = bytes.toString("base64");
      const result = await extractKnowledgeDocumentWithOpenAI({
        userId: "user-1",
        fileName,
        mimeType,
        fileBase64,
      });

      expect(result).toEqual(extraction);
      const request = mocks.openAIResponsesCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(request).toMatchObject({ model: "gpt-5.6-luna", store: false });
      const input = request.input as Array<{ content: Array<Record<string, unknown>> }>;
      const file = input[0]?.content.find((part) => part.type === "input_file");
      if (fileName.endsWith(".pdf")) {
        expect(file).toMatchObject({
          filename: fileName,
          file_data: `data:application/pdf;base64,${fileBase64}`,
          detail: "low",
        });
      } else {
        expect(file).toBeUndefined();
        expect(input[0]?.content).toContainEqual({ type: "input_text", text: expectedOfficeText });
      }
      expect(mocks.openAIResponsesInputTokensCount).toHaveBeenCalledWith({
        model: "gpt-5.6-luna",
        instructions: request.instructions,
        input: request.input,
        text: request.text,
      });
      const pricing = pricingForModel(OPENAI_MODELS.GPT_5_6_LUNA, 1_234);
      const expectedReserveUsd =
        Math.ceil(
          ((1_234 * Math.max(pricing.input, pricing.cacheWrite) + 3_600 * pricing.output) /
            1_000_000) *
            1.15 *
            1_000_000,
        ) / 1_000_000;
      expect(mocks.runWithManagedAiSpend).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          action: "training.asset_document",
          reserveUsd: expectedReserveUsd,
        }),
      );
      expect(mocks.recordUsage).toHaveBeenCalledOnce();
    },
  );

  it("rejects mismatched content and MIME types before contacting OpenAI", async () => {
    await expect(
      extractKnowledgeDocumentWithOpenAI({
        userId: "user-1",
        fileName: "guide.pdf",
        mimeType: "application/msword",
        fileBase64: Buffer.from("not a PDF").toString("base64"),
      }),
    ).rejects.toThrow();

    expect(mocks.openAIResponsesCreate).not.toHaveBeenCalled();
    expect(mocks.runWithManagedAiSpend).not.toHaveBeenCalled();
  });

  it.each([
    ["guide.doc", "application/msword"],
    ["guide.xls", "application/vnd.ms-excel"],
  ])(
    "asks for a modern Office format when the legacy %s type is uploaded",
    async (fileName, mimeType) => {
      await expect(
        extractKnowledgeDocumentWithOpenAI({
          userId: "user-1",
          fileName,
          mimeType,
          fileBase64: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).toString(
            "base64",
          ),
        }),
      ).rejects.toThrow("Upload a PDF, Word document, or Excel workbook.");
      expect(mocks.openAIResponsesCreate).not.toHaveBeenCalled();
      expect(mocks.runWithManagedAiSpend).not.toHaveBeenCalled();
    },
  );

  it("rejects a missing OpenAI key before reserving spend", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(
      extractKnowledgeDocumentWithOpenAI({
        userId: "user-1",
        fileName: "guide.pdf",
        mimeType: "application/pdf",
        fileBase64: Buffer.from("%PDF-1.7\n").toString("base64"),
      }),
    ).rejects.toThrow();

    expect(mocks.openAIResponsesCreate).not.toHaveBeenCalled();
    expect(mocks.openAIResponsesInputTokensCount).not.toHaveBeenCalled();
    expect(mocks.runWithManagedAiSpend).not.toHaveBeenCalled();
  });

  it("fails closed when OpenAI cannot count the document input", async () => {
    mocks.openAIResponsesInputTokensCount.mockRejectedValueOnce(
      new Error("token count unavailable"),
    );

    await expect(
      extractKnowledgeDocumentWithOpenAI({
        userId: "user-1",
        fileName: "guide.pdf",
        mimeType: "application/pdf",
        fileBase64: Buffer.from("%PDF-1.7\n").toString("base64"),
      }),
    ).rejects.toThrow();

    expect(mocks.openAIResponsesCreate).not.toHaveBeenCalled();
    expect(mocks.runWithManagedAiSpend).not.toHaveBeenCalled();
  });
});
