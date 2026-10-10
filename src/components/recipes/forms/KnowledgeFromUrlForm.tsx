import { useEffect, useState } from "react";
import { authFetch } from "../../../lib/api";
import { FormShell, Field, TextInput, Select, RunButton, ResultCard, ErrCard } from "../shared";
import type { AgentLite } from "../types";

type ImportResult = {
  summary: string;
  pageTitle: string | null;
  sourceUrl: string;
};

export function KnowledgeFromUrlForm({
  agents,
  agentId: initAgent,
  initial,
  disabled,
}: {
  agents: AgentLite[];
  agentId?: string;
  initial?: { url?: string };
  disabled: boolean;
}) {
  const [agentId, setAgentId] = useState(initAgent ?? agents[0]?.id ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const run = async () => {
    if (!agentId || !url.trim()) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const response = await authFetch(
        "/api/agent-config/" + encodeURIComponent(agentId) + "/website",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "The page could not be imported.");
      if (typeof data?.summary !== "string" || typeof data?.sourceUrl !== "string") {
        throw new Error("The page import returned an unreadable result.");
      }
      setResult({
        summary: data.summary,
        pageTitle: typeof data.pageTitle === "string" ? data.pageTitle : null,
        sourceUrl: data.sourceUrl,
      });
    } catch (error) {
      setErr(error instanceof Error ? error.message : "The page could not be imported.");
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
        label="Website Page"
        hint="Import one public HTTPS page. BotBound adds supported facts and operating rules to this Bot's Knowledge."
      >
        <TextInput
          value={url}
          onChange={(nextUrl: string) => {
            setUrl(nextUrl);
            setResult(null);
          }}
          placeholder="https://acme.co/services"
          autoComplete="url"
          inputMode="url"
        />
      </Field>
      <RunButton
        onClick={run}
        loading={loading}
        disabled={disabled || !agentId || !url.trim()}
        label="Import Page"
      />
      {err && <ErrCard error={err} />}
      {result && (
        <ResultCard title="Page Added To Knowledge">
          {result.pageTitle && <p className="font-medium">{result.pageTitle}</p>}
          <p>{result.summary}</p>
          <a
            href={result.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all text-sm text-brand underline underline-offset-4"
          >
            {result.sourceUrl}
          </a>
        </ResultCard>
      )}
    </FormShell>
  );
}
