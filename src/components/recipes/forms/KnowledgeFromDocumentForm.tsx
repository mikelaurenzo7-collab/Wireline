import React, { useEffect, useState } from "react";
import { FileText, FileUp, Trash2 } from "lucide-react";
import { authFetch } from "../../../lib/api";
import {
  KNOWLEDGE_ASSET_MAX_BYTES,
  KNOWLEDGE_ASSET_MAX_LABEL,
  knowledgeAssetTooLargeMessage,
  knowledgeDocumentMimeType,
} from "../../../lib/knowledge-asset-limits";
import { FormShell, Field, Select, RunButton, ResultCard, ErrCard } from "../shared";
import type { AgentLite } from "../types";
import { Input } from "../../ui/shadcn/Input";
import { ShadButton } from "../../ui/shadcn/ShadButton";

type ImportResult = {
  summary: string;
  factsAdded: number;
  rulesAdded: number;
  toneUpdated: boolean;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The selected document could not be read."));
        return;
      }
      const comma = reader.result.indexOf(",");
      if (comma < 0) {
        reject(new Error("The selected document could not be read."));
        return;
      }
      resolve(reader.result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("The selected document could not be read."));
    reader.readAsDataURL(file);
  });
}

export function KnowledgeFromDocumentForm({
  agents,
  agentId: initAgent,
  disabled,
}: {
  agents: AgentLite[];
  agentId?: string;
  disabled: boolean;
}) {
  const [agentId, setAgentId] = useState(initAgent ?? agents[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const acceptFile = (nextFile: File | undefined) => {
    if (!nextFile) return;
    if (!knowledgeDocumentMimeType(nextFile.name, nextFile.type)) {
      setFile(null);
      setResult(null);
      setErr("Choose a PDF, Word DOCX, or Excel XLSX document.");
      return;
    }
    if (nextFile.size > KNOWLEDGE_ASSET_MAX_BYTES) {
      setFile(null);
      setResult(null);
      setErr(knowledgeAssetTooLargeMessage(nextFile.name, nextFile.size));
      return;
    }
    setErr(null);
    setFile(nextFile);
    setResult(null);
  };

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(event.currentTarget.files?.[0]);
    event.currentTarget.value = "";
  };

  const run = async () => {
    if (!file || !agentId) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const mimeType = knowledgeDocumentMimeType(file.name, file.type);
      if (!mimeType) throw new Error("Choose a PDF, Word DOCX, or Excel XLSX document.");
      const response = await authFetch(
        "/api/agent-config/" + encodeURIComponent(agentId) + "/assets",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            mimeType,
            fileBase64: await fileToBase64(file),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "The document could not be imported.");
      if (typeof data?.summary !== "string") {
        throw new Error("The document import returned an unreadable result.");
      }
      setResult({
        summary: data.summary,
        factsAdded: Number(data.factsAdded) || 0,
        rulesAdded: Number(data.rulesAdded) || 0,
        toneUpdated: data.toneUpdated === true,
      });
    } catch (error) {
      setErr(error instanceof Error ? error.message : "The document could not be imported.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormShell>
      <Field label="Add To Bot">
        <Select
          value={agentId}
          onChange={(nextAgentId) => {
            if (loading) return;
            setAgentId(nextAgentId);
            setErr(null);
            setResult(null);
          }}
          options={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
        />
      </Field>
      <Field
        label="Document"
        hint={
          "PDF, Word DOCX, or Excel XLSX up to " +
          KNOWLEDGE_ASSET_MAX_LABEL +
          ". Excel: 1,000 rows per sheet and 200 visible sheets maximum."
        }
      >
        <div className="space-y-3">
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              acceptFile(event.dataTransfer.files[0]);
            }}
            className="relative flex min-h-36 flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-white/15 px-6 py-8 text-center transition-all hover:border-brand/40"
          >
            <Input
              type="file"
              accept=".pdf,.docx,.xlsx"
              onChange={onFile}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            {file ? (
              <>
                <FileText className="h-6 w-6 text-brand" aria-hidden="true" />
                <span className="text-sm text-foreground">{file.name}</span>
                <span className="wl-label-muted">
                  {(file.size / 1_000_000).toFixed(2)} MB · ready
                </span>
              </>
            ) : (
              <>
                <FileUp className="h-6 w-6 text-brand" aria-hidden="true" />
                <span className="text-sm text-foreground/85">
                  Drop a document here, or click to choose
                </span>
              </>
            )}
          </label>
          {file && (
            <ShadButton
              type="button"
              variant="ghost"
              size="sm"
              disableAnimations
              onClick={() => {
                setFile(null);
                setErr(null);
                setResult(null);
              }}
              className="h-auto px-0 wl-label text-rose-500 hover:text-rose-400"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" /> Remove
            </ShadButton>
          )}
        </div>
      </Field>
      <RunButton
        onClick={run}
        loading={loading}
        disabled={disabled || !agentId || !file}
        label="Read & Add To Knowledge"
      />
      {err && <ErrCard error={err} />}
      {result && (
        <ResultCard title="Knowledge Added">
          <p>{result.summary}</p>
        </ResultCard>
      )}
    </FormShell>
  );
}
