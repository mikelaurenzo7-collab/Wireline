import { type FormEvent, useEffect, useState } from "react";
import { Loader2, WandSparkles, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import StudioWorkspaceV2 from "../components/StudioWorkspaceV2";
import { AGENTS_CHANGED_EVENT, useAgents } from "../contexts/AgentsContext";
import { authFetch, safeJson } from "../lib/api";

const roles = [
  ["scheduler", "Personal assistant"],
  ["customer_service", "Helpful caller"],
  ["receptionist", "Call concierge"],
  ["custom", "Something else"],
] as const;

type Role = (typeof roles)[number][0];

export default function AgentStudioHome() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { agents, loading, refresh } = useAgents();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("scheduler");
  const [brief, setBrief] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && agents.length > 0 && params.get("create") === "1") setShowCreate(true);
  }, [agents.length, loading, params]);

  function close() {
    const next = new URLSearchParams(params);
    next.delete("create");
    setParams(next, { replace: true });
    setShowCreate(false);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      const response = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), role, deferPhoneProvision: true }),
      });
      const body = (await safeJson(response)) as { id?: string; error?: string } | null;
      if (!response.ok || !body?.id) {
        setError(body?.error || "Your assistant could not be created yet.");
        return;
      }
      if (brief.trim()) {
        await authFetch("/api/train/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: body.id, message: brief.trim() }),
        });
      }
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      refresh();
      navigate(`/studio?agent=${encodeURIComponent(body.id)}`, { replace: true });
      setShowCreate(false);
    } catch {
      setError("Your assistant could not be created yet. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <StudioWorkspaceV2 />
      {showCreate ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="create-assistant-title">
          <form onSubmit={create} className="wl-stitch-auth-card w-full max-w-md shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="wl-stitch-label">New assistant</p>
                <h2 id="create-assistant-title" className="mt-1 text-xl font-semibold tracking-[-.04em]">Start with one useful call.</h2>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">Name the help you want and teach the details in Studio.</p>
              </div>
              <button type="button" onClick={close} className="grid h-8 w-8 place-items-center rounded-sm hover:bg-muted" aria-label="Close"><X size={16} /></button>
            </div>
            <label className="mt-5 block text-xs font-semibold">Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Casey" className="wl-stitch-input mt-1.5" /></label>
            <label className="mt-4 block text-xs font-semibold">What kind of help?<select value={role} onChange={(event) => setRole(event.target.value as Role)} className="wl-stitch-input mt-1.5">{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="mt-4 block text-xs font-semibold">First brief<textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Call my pharmacy, wait on hold, and text me when my prescription is ready." className="wl-stitch-input mt-1.5 min-h-[96px] resize-none" /></label>
            {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
            <button disabled={!name.trim() || creating} className="workspace-btn-primary mt-5 w-full justify-center px-4 py-3 disabled:opacity-40">{creating ? <Loader2 className="animate-spin" size={16} /> : <WandSparkles size={16} />}Create and open Studio</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
