import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import StudioWorkspaceV2 from "../components/StudioWorkspaceV2";
import { useAgents } from "../contexts/AgentsContext";

export default function AgentStudioHome() {
  const [params, setParams] = useSearchParams();
  const { agents, loading } = useAgents();
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    if (!loading && agents.length > 0 && params.get("create") === "1") setShowSetup(true);
  }, [agents.length, loading, params]);

  function close() {
    const next = new URLSearchParams(params);
    next.delete("create");
    setParams(next, { replace: true });
    setShowSetup(false);
  }

  return (
    <>
      <StudioWorkspaceV2 />
      {showSetup ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <section className="wl-stitch-auth-card w-full max-w-md shadow-2xl">
            <p className="wl-stitch-label">New assistant</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-.04em]">Start with one useful call.</h2>
            <p className="mt-3 text-sm leading-5 text-muted-foreground">Use Studio to name the assistant and teach it what to handle. Your existing assistants stay unchanged.</p>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={close} className="workspace-btn-secondary flex-1 justify-center px-4 py-2.5">Not now</button>
              <Link to="/studio" onClick={close} className="workspace-btn-primary flex-1 justify-center px-4 py-2.5">Open Studio</Link>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
