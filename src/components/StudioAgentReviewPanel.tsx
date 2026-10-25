import BotLivePanel from "./studio/BotLivePanel";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Mic, PhoneCall, Settings2 } from "lucide-react";
import { Link } from "react-router";

import { Button, Skeleton } from "./atoms";
import { StatusNotice } from "./molecules";
import { authFetch } from "../lib/api";
import { formatAgentRoleLabel, SMS_LAUNCH_UI_ENABLED } from "../lib/product-copy";
import { resolveVoiceLabel } from "../lib/voice-catalog";
import { resolveAgentGreeting } from "../lib/agent-greeting";
import { readSetupDeliveryTone } from "../lib/compose-setup-personality";
import { AGENTS_CHANGED_EVENT } from "../contexts/AgentsContext";
import { useChannelEntitlements } from "../hooks/useChannelEntitlements";
import ChannelAccessNotice from "./ChannelAccessNotice";
import { activationBillingHref, getStoredSignupIntent } from "../lib/signup-intent";
import { formatPhone } from "../lib/safe-number";

type AgentConfigResponse = {
  role?: string | null;
  personality?: string | null;
  openingGreeting?: string | null;
  firstMessage?: string | null;
  directives?: Array<{ content?: string | null }>;
  voice?: {
    voiceId?: string | null;
    provider?: string | null;
    phoneVoiceId?: string | null;
    phoneVoiceProvider?: string | null;
    phoneCall?: { provider: string; voice: string } | null;
    phoneCallReady?: boolean | null;
  };
};

type StudioAgentReviewPanelProps = {
  agentId: string;
  agentName: string;
  agentRole?: string | null;
  phoneNumber?: string | null;
  onEdit: () => void;
  onRehearse: () => void;
  className?: string;
  compact?: boolean;
};

type MailboxScope = { agentId: string; emailIncluded: boolean };
type MailboxState = {
  scope: MailboxScope;
  status: "loading" | "ready" | "error" | "setting_up" | "setup_error";
  email: string | null;
  error?: string;
};

function toneLabel(personality?: string | null) {
  const value = readSetupDeliveryTone(personality);
  if (!value) return "Clear and professional";

  const sentence = value.split(/[.\n]/)[0]?.trim() || "Clear and professional";
  const normalized = sentence.toLowerCase().replace(/[\s_-]+/g, " ");
  const knownTone: Record<string, string> = {
    business: "Clear and professional",
    clear: "Clear and professional",
    professional: "Clear and professional",
    personal: "Warm and natural",
    warm: "Warm and natural",
    friendly: "Friendly and conversational",
    concise: "Concise and direct",
    playful: "Playful",
    authoritative: "Authoritative",
    polished: "Polished",
    energetic: "Energetic",
  };
  if (knownTone[normalized]) return knownTone[normalized];

  return sentence.length > 80 ? `${sentence.slice(0, 77).trimEnd()}…` : sentence;
}

export default function StudioAgentReviewPanel({
  agentId,
  agentName,
  agentRole,
  phoneNumber,
  onEdit,
  onRehearse,
  className = "",
  compact = false,
}: StudioAgentReviewPanelProps) {
  const access = useChannelEntitlements();
  const [config, setConfig] = useState<AgentConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const emailIncluded = access.includes("email");
  const mailboxScope = useRef<MailboxScope>({ agentId, emailIncluded });
  if (
    mailboxScope.current.agentId !== agentId ||
    mailboxScope.current.emailIncluded !== emailIncluded
  ) {
    mailboxScope.current = { agentId, emailIncluded };
  }
  const currentMailboxScope = mailboxScope.current;
  const [mailbox, setMailbox] = useState<MailboxState>({
    scope: currentMailboxScope,
    status: "loading",
    email: null,
  });
  const [mailboxReloadKey, setMailboxReloadKey] = useState(0);
  const setupRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const isCurrent = () =>
      !controller.signal.aborted && mailboxScope.current === currentMailboxScope;
    if (!emailIncluded) return () => controller.abort();
    setMailbox({ scope: currentMailboxScope, status: "loading", email: null });
    void authFetch("/api/emails/accounts", { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        const accounts =
          body && typeof body === "object" && "accounts" in body ? body.accounts : null;
        if (!response.ok || !Array.isArray(accounts)) throw new Error("Email status unavailable.");
        if (
          !accounts.every(
            (account) =>
              account &&
              typeof account === "object" &&
              typeof account.emailAddress === "string" &&
              typeof account.provider === "string" &&
              (account.agentId == null || typeof account.agentId === "string"),
          )
        ) {
          throw new Error("Email status unavailable.");
        }
        const ownedMailbox = accounts.find(
          (account) => account.agentId === agentId && account.provider === "agentmail",
        );
        if (ownedMailbox && !ownedMailbox.emailAddress.trim()) {
          throw new Error("Email status unavailable.");
        }
        if (isCurrent()) {
          setMailbox({
            scope: currentMailboxScope,
            status: "ready",
            email: ownedMailbox?.emailAddress ?? null,
          });
        }
      })
      .catch(() => {
        if (isCurrent()) {
          setMailbox({ scope: currentMailboxScope, status: "error", email: null });
        }
      });
    return () => controller.abort();
  }, [agentId, emailIncluded, currentMailboxScope, mailboxReloadKey, reloadKey]);

  useEffect(
    () => () => {
      setupRequest.current?.abort();
    },
    [currentMailboxScope],
  );

  async function setUpEmail() {
    if (
      !emailIncluded ||
      mailbox.scope !== currentMailboxScope ||
      !["ready", "setup_error"].includes(mailbox.status) ||
      (setupRequest.current && !setupRequest.current.signal.aborted)
    ) {
      return;
    }
    const controller = new AbortController();
    setupRequest.current = controller;
    const isCurrent = () =>
      !controller.signal.aborted && mailboxScope.current === currentMailboxScope;
    setMailbox({ scope: currentMailboxScope, status: "setting_up", email: mailbox.email });
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(agentId)}/managed-mailbox`,
        {
          method: "POST",
          signal: controller.signal,
        },
      );
      const body = (await response.json()) as {
        ok?: boolean;
        email?: string;
        error?: string;
      };
      if (
        !response.ok ||
        body?.ok !== true ||
        typeof body.email !== "string" ||
        !body.email.trim()
      ) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "Email setup could not be completed.",
        );
      }
      if (isCurrent()) {
        setMailbox({ scope: currentMailboxScope, status: "ready", email: body.email });
      }
    } catch (reason) {
      if (isCurrent()) {
        setMailbox({
          scope: currentMailboxScope,
          status: "setup_error",
          email: mailbox.email,
          error: reason instanceof Error ? reason.message : "Email setup could not be completed.",
        });
      }
    } finally {
      if (setupRequest.current === controller) setupRequest.current = null;
    }
  }

  const visibleMailbox =
    mailbox.scope === currentMailboxScope ? mailbox : { status: "loading" as const, email: null };

  useEffect(() => {
    const reload = () => setReloadKey((current) => current + 1);
    window.addEventListener(AGENTS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(AGENTS_CHANGED_EVENT, reload);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setConfig(null);
    authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Setup summary could not be loaded.");
        return (await response.json()) as AgentConfigResponse;
      })
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Setup summary could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, reloadKey]);

  const savedVoiceName = resolveVoiceLabel(
    config?.voice?.provider?.trim().toLowerCase() === "presenter"
      ? config.voice.phoneVoiceId
      : config?.voice?.voiceId,
  );
  const phoneCallVoice = config?.voice?.phoneCall?.voice?.trim();
  const voiceName = phoneCallVoice
    ? config?.voice?.phoneCallReady === false
      ? "Standard voice while registration finishes"
      : phoneCallVoice.charAt(0).toUpperCase() + phoneCallVoice.slice(1)
    : savedVoiceName;
  const role = formatAgentRoleLabel(config?.role ?? agentRole ?? null);
  const hasPhone = Boolean(phoneNumber);
  const contentClass = compact
    ? "mx-auto w-full max-w-none space-y-3 px-3 py-3"
    : "mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-8";
  const sectionClass = compact
    ? "rounded-xl border border-border bg-card p-4"
    : "rounded-2xl border border-border bg-card p-5 sm:p-6";

  return (
    <div
      data-wireline-studio-review-density={compact ? "inspector" : "page"}
      className={`min-h-0 flex-1 overflow-y-auto bg-background ${className}`}
    >
      <div className={contentClass}>
        <header className={compact ? "px-1 pt-1" : ""}>
          <h2
            className={
              compact
                ? "text-lg font-semibold leading-tight tracking-tight text-foreground"
                : "text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            }
          >
            Setup Summary
          </h2>
        </header>

        {error ? (
          <StatusNotice tone="warning" title="Summary Unavailable">
            {error} Your saved setup is unchanged.
          </StatusNotice>
        ) : null}

        <BotLivePanel
          agentId={agentId}
          agentName={agentName}
          compact={compact}
          className={sectionClass}
        />

        <section hidden={Boolean(error)} className={sectionClass} aria-label="Setup summary">
          {loading ? (
            <div className="divide-y divide-border" aria-busy="true">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="py-3 first:pt-0 last:pb-0">
                  <Skeleton shape="text" className="h-3 w-20" />
                  <Skeleton shape="text" className="mt-1.5 h-5 w-40 max-w-full" />
                </div>
              ))}
            </div>
          ) : (
            <dl className="divide-y divide-border">
              {[
                { label: "Role", value: role },
                { label: "Tone", value: toneLabel(config?.personality) },
                {
                  label: "Greeting",
                  value:
                    config?.openingGreeting?.trim() ||
                    resolveAgentGreeting(
                      { name: agentName, firstMessage: config?.firstMessage },
                      config?.directives,
                    ),
                },
                ...(access.includes("voice") ? [{ label: "Phone voice", value: voiceName }] : []),
              ].map((item) => (
                <div key={item.label} className="py-3 first:pt-0 last:pb-0">
                  <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
                  <dd className="wl-preserve-case mt-1 break-words text-sm leading-6 text-foreground">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {access.includes("voice") ? (
          <StatusNotice
            tone={hasPhone ? "success" : "warning"}
            title={hasPhone ? "Phone connected" : "No phone connected"}
            action={
              <Button asChild size="sm" variant="secondary">
                <Link to={`/studio?agent=${encodeURIComponent(agentId)}&section=setup#voice-clone`}>
                  <Mic className="size-4" aria-hidden="true" />
                  Clone Voice
                </Link>
              </Button>
            }
          >
            {hasPhone
              ? `Call ${formatPhone(phoneNumber)} to hear ${agentName} before sharing the number.`
              : "Try your Bot here first, then connect a phone when you're ready."}
          </StatusNotice>
        ) : access.status !== "ready" ? (
          <ChannelAccessNotice access={access} channel="voice" />
        ) : !access.data?.channels.length ? (
          <StatusNotice
            tone="info"
            title="Choose Live Channels"
            action={
              <Button asChild size="sm" variant="secondary">
                <Link to={activationBillingHref(getStoredSignupIntent())}>Choose Channels</Link>
              </Button>
            }
          >
            Keep rehearsing privately, then connect your selected channels.
          </StatusNotice>
        ) : null}

        {emailIncluded ? (
          <StatusNotice
            stacked={compact}
            tone={
              visibleMailbox.status === "error" || visibleMailbox.status === "setup_error"
                ? "warning"
                : "info"
            }
            title={
              visibleMailbox.status === "error"
                ? "Email Status Unavailable"
                : visibleMailbox.status === "setup_error"
                  ? "Email Setup Not Finished"
                  : visibleMailbox.status === "loading"
                    ? "Loading email"
                    : visibleMailbox.status === "setting_up"
                      ? visibleMailbox.email
                        ? "Checking email setup"
                        : "Setting up email"
                      : visibleMailbox.email
                        ? "Email address"
                        : "Set up your Bot's email"
            }
            action={
              visibleMailbox.status === "error" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setMailboxReloadKey((value) => value + 1)}
                >
                  Retry
                </Button>
              ) : visibleMailbox.email ? (
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="secondary">
                    <Link to={`/inbox?tab=email&agent=${encodeURIComponent(agentId)}`}>
                      Open Inbox
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={visibleMailbox.status === "setting_up"}
                    onClick={() => void setUpEmail()}
                  >
                    Check setup
                  </Button>
                </div>
              ) : visibleMailbox.status === "ready" || visibleMailbox.status === "setup_error" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void setUpEmail()}
                >
                  Set up email
                </Button>
              ) : null
            }
          >
            {visibleMailbox.email ? (
              <>
                <span className="wl-preserve-case break-all">{visibleMailbox.email}</span>
                {visibleMailbox.status === "setup_error" ? (
                  <span className="mt-1 block">{visibleMailbox.error}</span>
                ) : null}
              </>
            ) : visibleMailbox.status === "error" ? (
              "Try again to check this Bot's email."
            ) : visibleMailbox.status === "setup_error" ? (
              visibleMailbox.error
            ) : null}
          </StatusNotice>
        ) : null}

        <section className={sectionClass} aria-label="Next actions">
          <div className="flex flex-col gap-2.5">
            {access.includes("voice") ? (
              <Button
                asChild
                size={compact ? "sm" : undefined}
                className="w-full justify-center sm:w-auto sm:self-start"
              >
                <Link
                  to={`/phone?tab=${hasPhone ? "logs" : "setup"}&agent=${encodeURIComponent(agentId)}`}
                >
                  {hasPhone ? (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  ) : (
                    <PhoneCall className="size-4" aria-hidden="true" />
                  )}
                  {hasPhone ? "Review Outcomes" : "Connect Phone"}
                </Link>
              </Button>
            ) : SMS_LAUNCH_UI_ENABLED && !emailIncluded && access.includes("sms") ? (
              <Button
                asChild
                size={compact ? "sm" : undefined}
                className="w-full justify-center sm:w-auto sm:self-start"
              >
                <Link to={`/inbox?tab=sms&agent=${encodeURIComponent(agentId)}`}>Open Inbox</Link>
              </Button>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size={compact ? "sm" : undefined}
                variant="secondary"
                onClick={onEdit}
                className="justify-center"
              >
                <Settings2 className="size-4" aria-hidden="true" />
                Edit Details
              </Button>
              <Button
                type="button"
                size={compact ? "sm" : undefined}
                variant="secondary"
                onClick={onRehearse}
                className="justify-center"
              >
                <Mic className="size-4" aria-hidden="true" />
                Try It
              </Button>
            </div>
          </div>
          <details className="group mt-4 border-t border-border pt-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-medium text-muted-foreground wl-focus-ring-halo">
              More Settings
              <ChevronDown
                className="size-4 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="grid text-sm">
              {access.includes("voice") ? (
                <Link
                  to={`/phone?tab=setup&agent=${encodeURIComponent(agentId)}#company-identity`}
                  className="flex min-h-11 items-center rounded-md font-medium text-primary hover:underline wl-focus-ring-halo"
                >
                  Caller Identity
                </Link>
              ) : null}
              <Link
                to={`/knowledge?agent=${encodeURIComponent(agentId)}`}
                className="flex min-h-11 items-center rounded-md font-medium text-primary hover:underline wl-focus-ring-halo"
              >
                Knowledge
              </Link>
              <Link
                to="/connections"
                className="flex min-h-11 items-center rounded-md font-medium text-primary hover:underline wl-focus-ring-halo"
              >
                Connections
              </Link>
              <Link
                to="/settings/customization"
                className="flex min-h-11 items-center rounded-md font-medium text-primary hover:underline wl-focus-ring-halo"
              >
                Appearance & Brand
              </Link>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
