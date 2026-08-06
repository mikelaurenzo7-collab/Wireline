import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { recordUsage } from "./ai-audit";
import { OPENAI_STRUCTURED_PRIMARY_MODEL } from "./ai-models";
import {
  uploadArtifactToConnectedStorage,
  type ConnectedArtifactDestination,
  type ConnectedArtifactUpload,
} from "./connected-artifact-storage";
import { drizzle, fetchWithTimeout } from "./server-context";

export type PostCallArtifactFormat = "pdf" | "docx" | "pptx" | "xlsx";
export type BusinessArtifactPurpose = "call_report" | "operating_report";

const MIME_BY_FORMAT: Record<PostCallArtifactFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

type ContainerFileCitation = {
  container_id: string;
  file_id: string;
  filename?: string;
};

export interface PostCallArtifactInput {
  userId: string;
  callLogId: string;
  agentName?: string | null;
  customerName?: string | null;
  customerNumber?: string | null;
  direction?: string | null;
  durationSeconds?: number | null;
  outcomeTag: string;
  summary?: string | null;
  transcript?: string | null;
  sentiment?: string | null;
  intentLabel?: string | null;
  campaignSource?: string | null;
  format: PostCallArtifactFormat;
  destination: ConnectedArtifactDestination;
  purpose?: BusinessArtifactPurpose;
  reportTitle?: string | null;
  periodLabel?: string | null;
}

export interface GeneratedPostCallArtifact extends ConnectedArtifactUpload {
  openaiResponseId: string | null;
}

// eslint-disable-next-line no-control-regex -- strips null bytes before persisting generated text.
const NULL_BYTE_PATTERN = /\u0000/g;

function bounded(value: string | null | undefined, max: number): string {
  const text = String(value || "")
    .replace(NULL_BYTE_PATTERN, "")
    .trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function slug(value: string | null | undefined, fallback: string): string {
  return (
    bounded(value, 64)
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "") || fallback
  );
}

function recordKey(input: PostCallArtifactInput): string {
  const safe = slug(input.callLogId, "record");
  return safe.length > 18 ? safe.slice(-18) : safe;
}

function fileName(input: PostCallArtifactInput): string {
  const date = new Date().toISOString().slice(0, 10);
  const key = recordKey(input);
  if (input.purpose === "operating_report") {
    return `Wireline-${date}-${slug(input.reportTitle, "Operating-Report")}-${key}.${input.format}`;
  }
  return `Wireline-${date}-${slug(input.customerName || input.customerNumber, "customer")}-${input.outcomeTag}-${key}.${input.format}`;
}

function formatDirection(input: PostCallArtifactInput): string {
  if (input.purpose === "operating_report") {
    const byFormat: Record<PostCallArtifactFormat, string> = {
      pdf: "Create a polished executive PDF operating report with KPI cards, outcome analysis, risks, wins, and a prioritized action plan.",
      docx: "Create an editable executive Word operating report with KPI tables, findings, risks, wins, and a prioritized action plan.",
      pptx: "Create a polished 6-9 slide executive PowerPoint covering performance, outcomes, trends, risks, opportunities, and next actions.",
      xlsx: "Create a polished Excel workbook with Executive Summary, Calls, Outcomes, and Action Plan sheets, formatted headers, filters, and useful charts.",
    };
    return byFormat[input.format];
  }
  const byFormat: Record<PostCallArtifactFormat, string> = {
    pdf: "Create a polished client-ready PDF report with strong hierarchy and an action checklist.",
    docx: "Create an editable polished Word report with headings, callouts, tables, and an action checklist.",
    pptx: "Create a polished 5-7 slide PowerPoint covering the call, opportunity, commitments, risks, and next actions.",
    xlsx: "Create a polished Excel workbook with Summary and Action Plan sheets, formatted headers, filters, and practical column widths.",
  };
  return byFormat[input.format];
}

function promptFor(input: PostCallArtifactInput, brand: Record<string, string | null>): string {
  const evidence =
    input.purpose === "operating_report"
      ? {
          report_title: input.reportTitle || "Wireline operating report",
          period: input.periodLabel || null,
          executive_summary_and_data: bounded(input.summary, 12_000) || null,
          supporting_records: bounded(input.transcript, 28_000) || null,
        }
      : {
          agent: input.agentName || null,
          customer: input.customerName || input.customerNumber || null,
          direction: input.direction || null,
          duration_seconds: input.durationSeconds || 0,
          outcome: input.outcomeTag,
          sentiment: input.sentiment || null,
          intent: input.intentLabel || null,
          campaign: input.campaignSource || null,
          summary: bounded(input.summary, 5_000) || null,
          transcript: bounded(input.transcript, 18_000) || null,
        };

  return [
    `Use the python tool to create exactly one native .${input.format} file named ${fileName(input)}.`,
    formatDirection(input),
    "The native file is required; do not substitute Markdown or plain text.",
    "Use only the supplied evidence. Clearly distinguish measured facts from recommendations and do not invent revenue or outcomes.",
    `Brand name: ${bounded(brand.brandName || brand.businessName, 100) || "Wireline customer"}.`,
    brand.primaryColor ? `Preferred accent: ${bounded(brand.primaryColor, 30)}.` : "",
    JSON.stringify(evidence, null, 2),
    "Inspect the generated file before finishing and fix obvious overflow, clipping, missing sections, broken formulas, or unreadable formatting.",
    `Cite the generated ${fileName(input)} file in the final response.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function citations(value: unknown, output: ContainerFileCitation[] = []): ContainerFileCitation[] {
  if (Array.isArray(value)) {
    value.forEach((item) => citations(item, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  const record = value as Record<string, unknown>;
  if (
    record.type === "container_file_citation" &&
    typeof record.container_id === "string" &&
    typeof record.file_id === "string"
  ) {
    output.push({
      container_id: record.container_id,
      file_id: record.file_id,
      filename: typeof record.filename === "string" ? record.filename : undefined,
    });
  }
  Object.values(record).forEach((item) => citations(item, output));
  return output;
}

export async function generateAndStorePostCallArtifact(
  input: PostCallArtifactInput,
): Promise<GeneratedPostCallArtifact> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const [settings] = await drizzle
    .select({
      businessName: schema.settings.businessName,
      brandName: schema.settings.brandName,
      primaryColor: schema.settings.primaryColor,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, input.userId))
    .limit(1);

  const artifactModel =
    process.env.WIRELINE_OPENAI_ARTIFACT_MODEL?.trim() || OPENAI_STRUCTURED_PRIMARY_MODEL;
  const startedAt = Date.now();
  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: artifactModel,
        tools: [{ type: "code_interpreter", container: { type: "auto", memory_limit: "1g" } }],
        tool_choice: "required",
        max_output_tokens: 8_000,
        input: promptFor(input, settings || {}),
      }),
    },
    120_000,
  );
  const payload = (await response.json()) as Record<string, unknown> & {
    id?: string;
    error?: { message?: string };
  };
  // Raw fetch, so nothing here passes through ai-structured's recordUsage. The
  // artifact is sold at a FIXED reserve per format, which makes measurement more
  // important rather than less: code_interpreter plus 8k output tokens is the
  // most expensive single call in the product, and without a cost record there
  // is no way to notice the flat price has stopped covering it.
  //
  // Recorded before the ok-check so a failed-but-billed response still lands.
  recordUsage(
    artifactModel,
    payload as { model?: string; usage?: unknown },
    Date.now() - startedAt,
  );
  if (!response.ok) {
    throw new Error(
      payload.error?.message || `OpenAI artifact request failed (${response.status})`,
    );
  }

  const generatedFiles = citations(payload);
  const suffix = `.${input.format}`;
  const citation =
    generatedFiles.find((item) => item.filename?.toLowerCase().endsWith(suffix)) ||
    generatedFiles[generatedFiles.length - 1];
  if (!citation) throw new Error("OpenAI completed without returning the requested file.");

  const download = await fetchWithTimeout(
    `https://api.openai.com/v1/containers/${encodeURIComponent(citation.container_id)}/files/${encodeURIComponent(citation.file_id)}/content`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
    30_000,
  );
  if (!download.ok) throw new Error(`OpenAI file download failed (${download.status})`);
  const bytes = new Uint8Array(await download.arrayBuffer());
  if (!bytes.byteLength) throw new Error("OpenAI returned an empty artifact file.");

  const stored = await uploadArtifactToConnectedStorage({
    userId: input.userId,
    destination: input.destination,
    fileName: fileName(input),
    mimeType: MIME_BY_FORMAT[input.format],
    bytes,
  });

  return { ...stored, openaiResponseId: payload.id || null };
}
