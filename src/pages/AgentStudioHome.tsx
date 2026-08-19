import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import CreateAgentDialog from "../components/CreateAgentDialog";
import StudioContextChrome from "../components/studio/StudioContextChrome";
import StudioPageShell from "../components/studio/StudioPageShell";
import StudioWorkspaceV2 from "../components/StudioWorkspaceV2";
import { AGENTS_CHANGED_EVENT, useAgents } from "../contexts/AgentsContext";
import { useToast } from "../contexts/ToastContext";
import {
  browserCommandBrief,
  clearBrowserCommandHash,
  readBrowserCommandContext,
  type BrowserCommandContext,
} from "../lib/browser-command-context";
import { bootstrapManagedBotIdentity } from "../lib/bot-identity-bootstrap";
import {
  consumeCreateWarning,
  readPostCreateWizard,
  stashPostCreateWizard,
} from "../lib/wireline-create-flow";
import type { PostCreateWizardPayload } from "../lib/wireline-create-flow";
import PostCreateActivationWizard from "../components/onboarding/PostCreateActivationWizard";
import { authFetch } from "../lib/api";

export default function AgentStudioHome() {
  const [params, setParams] = useSearchParams();
  const { loading, refresh } = useAgents();
  const { toast } = useToast();
  const [browserContext, setBrowserContext] = useState<BrowserCommandContext | null>(() =>
    readBrowserCommandContext(),
  );
  const browserBrief = browserCommandBrief(browserContext);
  const [showCreate, setShowCreate] = useState(false);
  const [postCreateWizard, setPostCreateWizard] = useState<PostCreateWizardPayload | null>(null);
  const [signedBrief, setSignedBrief] = useState("");
  const identityBootstrapAgentIds = useRef(new Set<string>());

  useEffect(() => {
    if (!loading && params.get("create") === "1") setShowCreate(true);
  }, [loading, params]);

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
          title: "Handoff expired",
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
        title: "Handoff unavailable",
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
    const warning = consumeCreateWarning();
    if (warning) {
      toast({
        type: "warning",
        title: "Bot created",
        message: warning,
        duration: 12_000,
      });
    }
  }, [toast, params]);

  useEffect(() => {
    const wizard = readPostCreateWizard();
    if (wizard) setPostCreateWizard(wizard);
  }, [toast]);

  useEffect(() => {
    const payload = postCreateWizard;
    if (!payload || payload.identityBootstrapComplete) return;
    if (identityBootstrapAgentIds.current.has(payload.agentId)) return;
    identityBootstrapAgentIds.current.add(payload.agentId);

    const pending: PostCreateWizardPayload = {
      ...payload,
      phoneProvisionRequested: true,
      emailProvisionRequested: true,
    };
    // Persist the fact that the managed identity attempt has started so a hard
    // refresh can safely resume it. The provider routes themselves are idempotent.
    stashPostCreateWizard(pending);

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
        identityBootstrapComplete: true,
      };
      stashPostCreateWizard(updated);
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      refresh();
      if (active) setPostCreateWizard(updated);
    });

    return () => {
      active = false;
    };
  }, [postCreateWizard, refresh]);

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
      {postCreateWizard ? (
        <PostCreateActivationWizard
          payload={postCreateWizard}
          onClose={() => {
            setPostCreateWizard(null);
          }}
        />
      ) : null}
    </>
  );
}
