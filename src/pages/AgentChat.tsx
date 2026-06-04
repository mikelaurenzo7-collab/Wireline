import React, { useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import DirectorWorkspace from "../components/DirectorWorkspace";
import { useVisualViewportVar } from "../lib/use-visual-viewport";
import ClientRouteViewport from "../components/layout/ClientRouteViewport";

/**
 * Chat — single Director surface. Per-agent coaching happens via the Coach
 * dropdown inside DirectorWorkspace (?agent=id), not separate agent threads.
 */
export default function AgentChat() {
  const { id: legacyAgentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  useVisualViewportVar();

  const focusAgentId = searchParams.get("agent");

  useEffect(() => {
    if (!legacyAgentId || legacyAgentId === "director") return;
    const next = new URLSearchParams(searchParams);
    next.set("agent", legacyAgentId);
    navigate(`/chat?${next.toString()}`, { replace: true });
  }, [legacyAgentId, navigate, searchParams]);

  const setFocusAgentId = (agentId: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (agentId) next.set("agent", agentId);
      else next.delete("agent");
      return next;
    });
  };

  return (
    <ClientRouteViewport>
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <DirectorWorkspace focusAgentId={focusAgentId} onFocusAgentChange={setFocusAgentId} />
      </div>
    </ClientRouteViewport>
  );
}
