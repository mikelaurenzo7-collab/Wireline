import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Loader2, WandSparkles, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import StudioWorkspaceV2 from "../components/StudioWorkspaceV2";
import { AGENTS_CHANGED_EVENT, useAgents } from "../contexts/AgentsContext";
import { authFetch, safeJson } from "../lib/api";
import { PRODUCT_POSTURE } from "../lib/product-copy";

const roles = [
  ["scheduler", "Personal assistant"],
  ["customer_service", "Helpful caller"],
  ["receptionist", "Business receptionist"],
  ["custom", "Something else"],
] as const;

type Role = (typeof roles)[number][0];

export default function AgentStudioHome() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { agents, loading, refresh } = useAgents();
  const wantsBusinessAgent = params.get("posture") === "business";
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("scheduler");
  const [brief, setBrief] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const modalRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!loading && params.get("create") === "1") setShowCreate(true);
  }, [loading, params]);

  useEffect(() => {
    if (wantsBusinessAgent) setRole("receptionist");
  }, [wantsBusinessAgent]);

  useEffect(() => {
    if (!showCreate) return;
    priorFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => nameRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      priorFocusRef.current?.focus();
    };
  }, [showCreate]);

  function close() {
    const next = new URLSearchParams(params);
    next.delete("create");
    setParams(next, { replace: true });
    setShowCreate(false);
  }

  function onModalKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      modalRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [],
    ).filter((element) => !element.hasAttribute("hidden"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
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
      if (wantsBusinessAgent) {
        await authFetch(`/api/agent-config/${body.id}/business`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_business_agent: true }),
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
      {/* Bind the studio to the dynamic viewport so the composer stays pinned
          above the mobile browser chrome instead of falling below the fold. */}
      <div className="h-[100dvh] min-h-0 overflow-hidden">
        <StudioWorkspaceV2 />
      </div>
      {showCreate ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-[color:var(--wl-focus)] p-4"
          role="presentation"
        >
          <form
            ref={modalRef}
            onSubmit={create}
            onKeyDown={onModalKeyDown}
            className="wl-stitch-auth-card w-full max-w-md shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-assistant-title"
            aria-describedby="create-assistant-description"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="wl-stitch-label">
                  {wantsBusinessAgent
                    ? PRODUCT_POSTURE.business.createCta
                    : PRODUCT_POSTURE.personal.createCta}
                </p>
                <h2
                  id="create-assistant-title"
                  className="mt-1 text-xl font-semibold tracking-[-.04em]"
                >
                  {wantsBusinessAgent
                    ? "Give your business agent one clear job."
                    : "Start with one useful call."}
                </h2>
                <p
                  id="create-assistant-description"
                  className="mt-2 text-sm leading-5 text-muted-foreground"
                >
                  {wantsBusinessAgent
                    ? "Name the agent, describe how it should represent your business, and refine policies in Studio."
                    : "Name the help you want and teach the details in Studio."}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <label className="mt-5 block text-xs font-semibold">
              Name
              <input
                ref={nameRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Casey"
                className="wl-stitch-input mt-1.5"
              />
            </label>
            <label className="mt-4 block text-xs font-semibold">
              What kind of help?
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
                className="wl-stitch-input mt-1.5"
              >
                {roles.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-xs font-semibold">
              First brief
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder={
                  wantsBusinessAgent
                    ? "Answer inbound calls, capture caller details, and book consultations during business hours."
                    : "Call my pharmacy, wait on hold, and text me when my prescription is ready."
                }
                className="wl-stitch-input mt-1.5 min-h-[96px] resize-none"
              />
            </label>
            {error ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <button
              disabled={!name.trim() || creating}
              className="studio-primary-button mt-5 w-full justify-center disabled:opacity-40"
            >
              {creating ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <WandSparkles size={16} />
              )}
              Create and open Studio
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
