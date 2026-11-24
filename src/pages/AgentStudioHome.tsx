import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import CreateAgentDialog from "../components/CreateAgentDialog";
import StudioContextChrome from "../components/studio/StudioContextChrome";
import StudioPageShell from "../components/studio/StudioPageShell";
import StudioWorkspaceV2 from "../components/StudioWorkspaceV2";
import { AGENTS_CHANGED_EVENT, useAgents } from "../contexts/AgentsContext";
import { useToast } from "../contexts/ToastContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
import {
  browserCommandBrief,
  clearBrowserCommandHash,
  readBrowserCommandContext,
  type BrowserCommandContext,
} from "../lib/browser-command-context";
import { bootstrapManagedBotIdentity } from "../lib/bot-identity-bootstrap";
import { readPostCreateWizard, updatePostCreateWizard } from "../lib/wireline-create-flow";
import type { PostCreateWizardPayload } from "../lib/wireline-create-flow";
import PostCreateActivationWizard from "../components/onboarding/PostCreateActivationWizard";
import { authFetch } from "../lib/api";
import { shouldOpenExistingBot } from "../lib/bot-roster-policy";

export default function AgentStudioHome() {
  const [params, setParams] = useSearchParams();
  const { loading, degraded, refresh } = useAgents();
  const { agents, requestedId, resolvedId } = useStudioActiveAgentId();
  const { toast } = useToast();
  const [browserContext, setBrowserContext] = useState<BrowserCommandContext | null>(() =>
    readBrowserCommandContext(),
  );
  const browserBrief = browserCommandBrief(browserContext);
  const [showCreate, setShowCreate] = useState(false);
  const handledCreateRequest = useRef(false);
  const [postCreateWizard, setPostCreateWizard] = useState<PostCreateWizardPayload | null>(null);
  const wizardBotPresent =
    !degraded && agents.some((agent) => agent.id === postCreateWizard?.agentId);
  const activeWizard =
    wizardBotPresent && postCreateWizard?.agentId === (requestedId?.trim() || resolvedId)
      ? postCreateWizard
      : null;
  const [signedBrief, setSignedBrief] = useState("");
  const identityBootstrapAgentIds = useRef(new Set<string>());

  useEffect(() => {
    if (params.get("create") !== "1") {
      handledCreateRequest.current = false;
      return;
    }
    // An open dialog owns its own handoff: the roster gains the new Bot before
    // creation navigates, and that must not look like an existing Bot.
    if (loading || showCreate || handledCreateRequest.current) return;
    handledCreateRequest.current = true;
    // One Bot per business: a create link opens the existing Bot's setup. An
    // unreadable roster keeps the old behavior rather than guessing a count.
    const existing = agents.find((agent) => agent.id === resolvedId) ?? agents[0];
    if (
      !degraded &&
      existing &&
      shouldOpenExistingBot({
        createRequested: true,
        anotherRequested: params.get("another") === "1",
        botCount: agents.length,
      })
    ) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("create");
          next.delete("template");
          next.delete("brief");
          next.set("agent", existing.id);
          next.set("section", "setup");
          return next;
        },
        { replace: true },
      );
      return;
    }
    setShowCreate(true);
  }, [loading, showCreate, degraded, params, agents, resolvedId, setParams]);

  useEffect(() => {
    if (!browserContext) return;
    clearBrowserCommandHash();
  }, [browserContext]);

  const handoffId = params.get("handoff_id");

  useEffect(() => {
    if (!handoffId || loading) return;

    let cancelled = false;
    const clearHandoffParam = () =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("handoff_id");
          return next;
        },
        { replace: true },
      );
    void (async () => {
      const response = await authFetch(
        `/api/browser/handoff/redeem?handoff_id=${encodeURIComponent(handoffId)}`,
      );
      const body = (await response.json().catch(() => null)) as {
        context?: BrowserCommandContext;
        error?: string;
      } | null;
      if (cancelled) return;

      if (!response.ok || !body?.context) {
        toast({
          type: "warning",
          title: "Handoff Expired",
          message: body?.error || "Open BotBound Command and capture the page again.",
          duration: 10_000,
        });
        clearHandoffParam();
        return;
      }

      setBrowserContext(body.context);
      setSignedBrief(browserCommandBrief(body.context));
      setShowCreate(true);
      clearHandoffParam();
    })().catch(() => {
      if (cancelled) return;
      toast({
        type: "warning",
        title: "Handoff Unavailable",
        message:
          "The captured page could not be retrieved. Capture it again from BotBound Command.",
        duration: 10_000,
      });
      clearHandoffParam();
    });

    return () => {
      cancelled = true;
    };
  }, [loading, handoffId, setParams, toast]);

  useEffect(() => {
    const wizard = readPostCreateWizard();
    if (wizard) setPostCreateWizard(wizard);
  }, [toast]);

  useEffect(() => {
    const payload = postCreateWizard;
    if (!payload || !wizardBotPresent || payload.identityBootstrapComplete) return;
    if (identityBootstrapAgentIds.current.has(payload.agentId)) return;
    identityBootstrapAgentIds.current.add(payload.agentId);

    const pending: PostCreateWizardPayload = {
      ...payload,
      phoneProvisionRequested: true,
      emailProvisionRequested: true,
    };
    // Customers choose their number in Phone setup. This shared reconciler
    // repairs an already-owned line and provisions its managed mailbox while
    // preserving the paid-plan/live-work activation gate.
    updatePostCreateWizard(pending);

    let active = true;
    void bootstrapManagedBotIdentity(payload.agentId).then((result) => {
      const updated: PostCreateWizardPayload = {
        ...pending,
        phoneProvisionRequested: result.phone.requested,
        phoneProvisioned: result.phone.provisioned,
        phoneActivationRequired: result.phone.activationRequired,
        phoneNumber: result.phone.phoneNumber,
        emailProvisionRequested: result.mailbox.requested,
        emailProvisioned: result.mailbox.provisioned,
        emailAddress: result.mailbox.emailAddress,
        emailCustomDomain: result.mailbox.customDomain,
        // The browser makes one responsive attempt; the durable server job owns
        // paid activation and retries. Free Builder therefore does not loop on
        // endpoints that intentionally return ACTIVATION_REQUIRED.
        identityBootstrapComplete: true,
      };
      const persisted = updatePostCreateWizard(updated);
      // An open guide still works when sessionStorage is unavailable. A stale
      // request may only persist into its existing guide, never reopen one.
      if (!active && !persisted) return;
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      void refresh();
      if (active) {
        setPostCreateWizard((current) =>
          current?.agentId === payload.agentId ? updated : current,
        );
      }
    });

    return () => {
      active = false;
    };
  }, [postCreateWizard, refresh, wizardBotPresent]);

  const initialBrief = signedBrief || browserBrief || params.get("brief") || "";
  const initialTemplateKey = params.get("template");

  return (
    <>
      <StudioPageShell>
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <StudioContextChrome />
          <div className="min-h-0 flex-1 overflow-hidden">
            <StudioWorkspaceV2 />
          </div>
        </div>
      </StudioPageShell>
      <CreateAgentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={setPostCreateWizard}
        initialBrief={initialBrief}
        initialTemplateKey={initialTemplateKey}
      />
      {activeWizard ? (
        <PostCreateActivationWizard
          key={activeWizard.agentId}
          payload={activeWizard}
          onClose={() => {
            setPostCreateWizard(null);
          }}
        />
      ) : null}
    </>
  );
}
