import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Save, Wrench } from "lucide-react";
import { Link } from "react-router";

import { authFetch } from "../lib/api";
import {
  AGENT_TOOL_CATALOG,
  resolveAgentTools,
  type AgentToolName,
} from "../lib/agent-capabilities";
import { getAllIntegrationPlaybooks } from "../lib/integration-playbooks";
import { resolveTenantToolIntegrationStatus } from "../lib/tenant-tool-integration-status";
import { cn } from "../lib/utils";
import { Button } from "./atoms";
import { StatusNotice } from "./molecules";
import IntegrationCapabilityPanel from "./IntegrationCapabilityPanel";
import { Checkbox } from "./ui/shadcn/Checkbox";

/**
 * Per-agent action permissions.
 *
 * Mobile has been able to edit these since `POST /api/mobile/agents/:id/tools`
 * shipped; the web app could not. Tools reach live calls through
 * `resolveAgentTools`, so an owner could see what their agent was allowed to do
 * and had no way to change it without a phone.
 *
 * Everything below the fold is fetched only once the section is opened — this
 * mounts inside the Studio setup panel, which should not pay four requests for
 * a section most visits never expand.
 */

type AgentToolPermissionsProps = {
  agentId: string;
  className?: string;
};

/** Tools with no merchant integration (platform capabilities like grounded search). */
const PLATFORM_TOOLS = AGENT_TOOL_CATALOG.filter((tool) => !tool.integration);

export default function AgentToolPermissions({
  agentId,
  className = "",
}: AgentToolPermissionsProps) {
  const [open, setOpen] = useState(false);
  // Starts true: the fetch is gated on `open`, so the render that follows the
  // expand click lands before the effect. Starting false painted the whole
  // editor with every action unchecked and every count at 0/N for that frame,
  // which reads as "this agent can do nothing" rather than "still loading".
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<AgentToolName[] | null>(null);
  const [oauthStatus, setOauthStatus] = useState<
    Record<string, { connected?: boolean; configured?: boolean } | undefined>
  >({});
  const [emailProviders, setEmailProviders] = useState<string[]>([]);
  const [calendarReconnect, setCalendarReconnect] = useState({ google: false, microsoft: false });
  const [reloadKey, setReloadKey] = useState(0);
  /** Which agent the editor currently holds a loaded selection for. */
  const loadedAgentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !agentId) return;
    /*
     * Load once per agent. Keying the fetch on `open` meant collapsing the
     * section and opening it again refetched and overwrote whatever the person
     * had toggled but not yet saved — their edits vanished with no message.
     * A different agent, or the retry button, clears the marker below.
     */
    if (loadedAgentRef.current === agentId) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setNotice(null);

    /** A posture endpoint answering 200 with non-JSON must not blank the editor. */
    const readJson = async (response: Response | null): Promise<unknown> => {
      if (!response?.ok) return null;
      return response.json().catch(() => null);
    };

    const load = async () => {
      try {
        const configResponse = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`);
        if (!configResponse.ok) throw new Error("Agent actions could not be loaded.");
        const config = (await configResponse.json()) as { enabledTools?: unknown };
        if (cancelled) return;
        /*
         * A null selection is not "nothing enabled" — the server resolves it to
         * the full catalog, so that is the set the agent is really running.
         * Seeding an empty list here would have turned the first save into a
         * silent capability wipe.
         */
        setEnabled(resolveAgentTools(undefined, config.enabledTools));
        loadedAgentRef.current = agentId;

        // Connection posture is presentation only; a failure must not block editing.
        const [crm, health, email] = await Promise.all([
          authFetch("/api/oauth/crm/status").catch(() => null),
          authFetch("/api/oauth/integration-health").catch(() => null),
          authFetch("/api/emails/accounts").catch(() => null),
        ]);
        if (cancelled) return;
        const crmBody = (await readJson(crm)) as Record<
          string,
          { connected?: boolean; configured?: boolean } | undefined
        > | null;
        if (crmBody) setOauthStatus(crmBody);
        const healthBody = (await readJson(health)) as Record<string, unknown> | null;
        if (healthBody) {
          setCalendarReconnect({
            google: Boolean(healthBody.reconnect_google_calendar),
            microsoft: Boolean(healthBody.reconnect_microsoft_calendar),
          });
        }
        const emailBody = (await readJson(email)) as {
          accounts?: Array<{ provider?: string }>;
        } | null;
        if (emailBody) {
          setEmailProviders(
            (emailBody.accounts ?? [])
              .map((account) => account.provider)
              .filter((provider): provider is string => Boolean(provider)),
          );
        }
      } catch (reason) {
        if (!cancelled) {
          setLoadError(
            reason instanceof Error ? reason.message : "Agent actions could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [agentId, open, reloadKey]);

  const enabledSet = new Set(enabled ?? []);

  const toggleTool = (tool: AgentToolName) => {
    setNotice(null);
    setEnabled((current) => {
      const list = current ?? [];
      return list.includes(tool) ? list.filter((name) => name !== tool) : [...list, tool];
    });
  };

  const toggleGroup = (integration: string, enable: boolean) => {
    setNotice(null);
    const names = AGENT_TOOL_CATALOG.filter((tool) => tool.integration === integration).map(
      (tool) => tool.name,
    );
    setEnabled((current) => {
      const list = current ?? [];
      if (!enable) return list.filter((name) => !names.includes(name));
      return [...list, ...names.filter((name) => !list.includes(name))];
    });
  };

  async function save() {
    if (saving || !enabled) return;
    setSaving(true);
    setSaveError(null);
    setNotice(null);
    try {
      const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled_tools: enabled }),
      });
      if (!response.ok) throw new Error("Actions could not be saved.");
      const body = (await response.json()) as { enabledTools?: AgentToolName[] };
      // Trust the server's normalized set so the UI cannot drift from storage.
      if (Array.isArray(body.enabledTools)) setEnabled(body.enabledTools);
      setNotice("Run a test before the next live call.");
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Actions could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const integrationContext = {
    oauthStatus,
    calendarReconnectGoogle: calendarReconnect.google,
    calendarReconnectMicrosoft: calendarReconnect.microsoft,
    emailProviders,
  };

  return (
    <section
      className={cn("rounded-2xl border border-border bg-card p-5 sm:p-6", className)}
      aria-labelledby="agent-actions-heading"
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="agent-actions-body"
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3
            id="agent-actions-heading"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            Actions
          </h3>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div id="agent-actions-body" className="mt-5">
          {loading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading actions…
            </div>
          ) : loadError ? (
            <StatusNotice
              tone="destructive"
              title="Actions unavailable"
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    loadedAgentRef.current = null;
                    setReloadKey((current) => current + 1);
                  }}
                >
                  Try again
                </Button>
              }
            >
              {loadError} Nothing was changed.
            </StatusNotice>
          ) : (
            <div className="space-y-5">
              <div className="space-y-4">
                {getAllIntegrationPlaybooks().map((playbook) => {
                  const configured =
                    resolveTenantToolIntegrationStatus(playbook.integration, integrationContext) ===
                    "configured";
                  return (
                    <div key={playbook.integration}>
                      <IntegrationCapabilityPanel
                        integration={playbook.integration}
                        accentColor="brand"
                        connected={configured}
                        enabledTools={enabled ?? []}
                        onToggleTool={toggleTool}
                        onToggleIntegrationGroup={toggleGroup}
                      />
                      {/*
                       * IntegrationCapabilityPanel only shows its own connect
                       * prompt in compact mode, which this editor never uses.
                       * Without this, an unconnected integration looked exactly
                       * like a connected one: you could switch on "log the call
                       * in Salesforce" with no Salesforce attached and get no
                       * hint until a live call quietly failed to do it.
                       */}
                      {!configured ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Not connected — these stay off in live calls until {playbook.label} is
                          connected.{" "}
                          <Link
                            to={playbook.connectPath}
                            className="font-medium text-primary hover:underline"
                          >
                            Connect
                          </Link>
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">
                  Platform actions
                </legend>
                <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                  {PLATFORM_TOOLS.map((tool) => (
                    <li key={tool.name}>
                      <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-muted/40">
                        <Checkbox
                          checked={enabledSet.has(tool.name)}
                          onChange={() => toggleTool(tool.name)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-foreground">
                            {tool.label}
                          </span>
                          <span className="block text-xs leading-snug text-muted-foreground">
                            {tool.description}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>

              {notice ? (
                <StatusNotice tone="success" title="Actions saved">
                  {notice}
                </StatusNotice>
              ) : null}
              {saveError ? (
                <StatusNotice tone="destructive" title="Actions need attention">
                  {saveError}
                </StatusNotice>
              ) : null}

              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="size-4" aria-hidden="true" />
                )}
                {saving ? "Saving…" : "Save actions"}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
