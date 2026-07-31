import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  KNOWLEDGE_ASSET_MAX_BYTES,
  KNOWLEDGE_ASSET_MAX_FILES,
  KNOWLEDGE_ASSET_MAX_LABEL,
  KNOWLEDGE_IMAGE_MAX_DATA_URL_CHARS,
  KNOWLEDGE_TEXT_EXTRACT_CHARS,
  knowledgeAssetFileCountNotice,
  knowledgeAssetTooLargeMessage,
  knowledgeTextTruncationNotice,
} from "../src/lib/knowledge-asset-limits";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** The assets handler, isolated from the rest of the (very long) route file. */
function assetsHandler(): string {
  const source = read("src/routes/agent-routes-v2.ts");
  const start = source.indexOf('"/api/agent-config/:id/assets"');
  const end = source.indexOf('router.delete(\n  "/api/agent-config/:id/:type/:rowId"', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("knowledge asset limits", () => {
  it("keeps the advertised image ceiling inside the transport that has to carry it", () => {
    // Images travel as base64 data URLs inside the JSON body, so the file cap is
    // only meaningful relative to the express body limit. Deriving the limit
    // from server.ts means raising one without the other fails here rather than
    // in production, where it surfaced as a bare "request entity too large".
    const bodyLimit = /express\.json\(\{\s*limit:\s*"(\d+)mb"\s*\}\)/.exec(read("server.ts"));
    expect(bodyLimit).not.toBeNull();
    const bodyLimitBytes = Number(bodyLimit![1]) * 1024 * 1024;

    // 4 base64 chars per 3 input bytes, plus the data: prefix and JSON envelope.
    const worstCaseBody = Math.ceil(KNOWLEDGE_ASSET_MAX_BYTES / 3) * 4 + 512;
    expect(worstCaseBody).toBeLessThan(bodyLimitBytes);
    expect(KNOWLEDGE_IMAGE_MAX_DATA_URL_CHARS).toBeGreaterThanOrEqual(
      Math.ceil(KNOWLEDGE_ASSET_MAX_BYTES / 3) * 4,
    );
    expect(KNOWLEDGE_IMAGE_MAX_DATA_URL_CHARS).toBeLessThan(bodyLimitBytes);
  });

  it("reports text truncation only when part of the document was actually dropped", () => {
    expect(knowledgeTextTruncationNotice(0)).toBeNull();
    expect(knowledgeTextTruncationNotice(KNOWLEDGE_TEXT_EXTRACT_CHARS)).toBeNull();

    const notice = knowledgeTextTruncationNotice(KNOWLEDGE_TEXT_EXTRACT_CHARS + 1);
    expect(notice).toContain(KNOWLEDGE_TEXT_EXTRACT_CHARS.toLocaleString());
    expect(notice).toContain((KNOWLEDGE_TEXT_EXTRACT_CHARS + 1).toLocaleString());
  });

  it("names the file and its size when it is too large to upload", () => {
    const message = knowledgeAssetTooLargeMessage("handbook.txt", 4_500_000);
    expect(message).toContain("handbook.txt");
    expect(message).toContain("4.5 MB");
    expect(message).toContain(KNOWLEDGE_ASSET_MAX_LABEL);
    // Size is optional — a server-side rejection knows the name but not the
    // original file length, and must not emit "is undefined MB".
    expect(knowledgeAssetTooLargeMessage("shot.png")).not.toMatch(/undefined|NaN/);
  });

  it("accounts for files dropped past the per-batch cap", () => {
    expect(knowledgeAssetFileCountNotice(KNOWLEDGE_ASSET_MAX_FILES)).toBeNull();
    expect(knowledgeAssetFileCountNotice(KNOWLEDGE_ASSET_MAX_FILES + 1)).toContain("1 more was");
    expect(knowledgeAssetFileCountNotice(KNOWLEDGE_ASSET_MAX_FILES + 3)).toContain("3 more were");
  });
});

describe("knowledge asset ingestion API", () => {
  it("refuses an oversized image instead of slicing its base64", () => {
    const handler = assetsHandler();

    // `cleanText` slices; a base64 payload cut mid-stream is not a smaller
    // image, it is a corrupt one, and it was still answered with success.
    expect(handler).not.toContain("cleanText(payload.dataUrl");
    expect(handler).toContain("KNOWLEDGE_IMAGE_MAX_DATA_URL_CHARS");
    expect(handler).toContain("knowledgeAssetTooLargeMessage(fileName)");

    // The refusal has to precede extraction, or the corrupt bytes are billed
    // to a provider before anyone notices.
    const guard = handler.indexOf("KNOWLEDGE_IMAGE_MAX_DATA_URL_CHARS");
    expect(guard).toBeLessThan(handler.indexOf("extractImageAsset(fileName, dataUrl)"));
  });

  it("discloses how much of an over-long text asset was read", () => {
    const handler = assetsHandler();

    // The original length has to survive the slice, otherwise there is nothing
    // to compare the cap against and the truncation stays invisible.
    expect(handler).toContain(`rawText.slice(0, KNOWLEDGE_TEXT_EXTRACT_CHARS)`);
    expect(handler).toContain("knowledgeTextTruncationNotice(rawText.length)");
    expect(handler).toMatch(/summary: truncation/);
  });

  it("gives an over-large payload a status a caller can act on", () => {
    expect(assetsHandler()).toContain("AppError.fromHttpStatus(413");
    // Without the mapping both the handler's 413 and express's own body-limit
    // 413 report a meaningless "ERROR" code.
    expect(read("src/lib/api-error.ts")).toContain('413: "PAYLOAD_TOO_LARGE"');
  });
});

describe("knowledge upload surface", () => {
  const component = () => read("src/components/KnowledgeBaseClaude.tsx");

  it("advertises the limit the request can actually carry", () => {
    const source = component();
    // The drop zone claimed 50 MB against a 6 MiB body limit — more than ten
    // times what the upload could survive.
    expect(source).not.toContain("50 MB");
    expect(source).toContain("KNOWLEDGE_ASSET_MAX_LABEL");
    // Rejected in the browser, so the message names the file instead of
    // surfacing express's bare "request entity too large".
    expect(source).toContain("file.size > KNOWLEDGE_ASSET_MAX_BYTES");
    expect(source).toContain("knowledgeAssetTooLargeMessage(file.name, file.size)");
  });

  it("reports what landed when a batch only partly succeeds", () => {
    const source = component();
    const ingestStart = source.indexOf("async function ingest(");
    const ingestEnd = source.indexOf("function onFilePick(", ingestStart);
    expect(ingestStart).toBeGreaterThan(-1);
    const ingest = source.slice(ingestStart, ingestEnd);

    // A throw out of the loop used to skip both the notice and the refetch, so
    // files that were already ingested stayed off screen while the server held
    // them. Success is now recorded before the failure is reported.
    expect(ingest).toContain("if (ingested > 0)");
    expect(ingest.indexOf("setVersion((value) => value + 1)")).toBeLessThan(
      ingest.indexOf("setIngestError(problems.length"),
    );
    expect(ingest).toContain("knowledgeAssetFileCountNotice(picked.length)");
  });

  it("keeps the refetch from erasing the error the upload just raised", () => {
    const source = component();
    // Anchored on the whole effect, not just its fetch call: the clearing that
    // caused this happens at the top of the effect, above the request, so a
    // window that starts at authFetch never sees it.
    const effectEnd = source.indexOf("}, [agentId, version]);");
    expect(effectEnd).toBeGreaterThan(-1);
    const effectStart = source.lastIndexOf("useEffect(() => {", effectEnd);
    expect(effectStart).toBeGreaterThan(-1);
    expect(source.slice(effectStart, effectEnd)).toContain("authFetch(`/api/agent-config/");

    // The load effect re-runs on every successful upload and clears its own
    // error on the way in. While both errors shared one state slot that wiped
    // the just-raised ingest message in the same render.
    const loadEffect = source.slice(effectStart, effectEnd);
    expect(loadEffect).not.toContain("setIngestError");
    expect(source).toContain("const error = loadError || ingestError;");
  });
});
