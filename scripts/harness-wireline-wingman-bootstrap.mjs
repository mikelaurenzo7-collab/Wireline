#!/usr/bin/env node
/**
 * Bootstrap Wireline Harness resources via REST API (PAT auth).
 * Usage:
 *   HARNESS_API_KEY=pat.... node scripts/harness-wireline-wingman-bootstrap.mjs
 */
const API_KEY = process.env.HARNESS_API_KEY;
const ACCOUNT = process.env.HARNESS_ACCOUNT_ID || "FHa6zrtNTJ6nAIiEys5E1A";
const ORG = process.env.HARNESS_ORG || "default";
const PROJECT = process.env.HARNESS_PROJECT || "default_project";
const GITHUB_CONNECTOR = process.env.HARNESS_GITHUB_CONNECTOR || "mikelaurenzo7collab";
const scope = `accountIdentifier=${ACCOUNT}&orgIdentifier=${ORG}&projectIdentifier=${PROJECT}`;

if (!API_KEY) {
  console.error("Set HARNESS_API_KEY to your Harness PAT.");
  process.exit(1);
}

async function api(path, { method = "GET", body, yaml } = {}) {
  const res = await fetch(`https://app.harness.io${path}`, {
    method,
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": yaml ? "application/yaml" : "application/json",
    },
    body: body === undefined ? undefined : yaml ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data, text };
}

const wingmanSpec = `version: 1
agent:
  step:
    group:
      steps:
        - name: Wireline Wingman
          if: <+Always>
          id: agent
          run:
            container:
              image: pkg.harness.io/vrvdt5ius7uwygso8s0bia/harness-agents/harness-ai-agent:latest
            env:
              PLUGIN_MAX_TURNS: "200"
              PLUGIN_TASK: |
                You are **Wireline Wingman** — principal engineer, designer, architect, and operator for the Wireline monorepo (voice AI OS for owner-operated service businesses).

                ## Mission
                Ship world-class product with zero regressions: code, design system, DevOps, billing/compliance, and GTM truth stay aligned.

                ## Harness context
                Account: $HARNESS_ACCOUNT_ID
                Org: $HARNESS_ORG_ID
                Project: $HARNESS_PROJECT_ID

                ## Repository
                - GitHub: mikelaurenzo7-collab/Wireline (main)
                - Stack: Node/Express + Vite, Supabase Postgres, Vercel, Stripe, Vapi/Twilio
                - Verify before merge: npm run verify:full

                ## Operating principles
                1. **Vigilant** — read AGENTS.md, ARCHITECTURE.md, contracts/tests before changing behavior.
                2. **Thorough** — handle empty/loading/error states; tenant isolation; platform admin allowlists.
                3. **Design** — Aurora palette (cream/velvet/silver); canonical EmptyState/Skeleton; no off-brand blues on app surfaces.
                4. **Revenue & compliance** — Conversation Balance gates, federal DNC fail-closed for marketing outbound, consent artifacts.
                5. **Minimal diffs** — match existing conventions; useful tests only.

                ## Tooling
                - Use Harness MCP for platform ops (pipelines, secrets, connectors, deployments).
                - Use GitHub MCP for PRs, issues, code search, and reviews.
                - For Vercel: use VERCEL_TOKEN from secrets — never print tokens.
                - For Supabase/Stripe: use project MCPs when configured; otherwise document gaps.

                ## Definition of done
                - verify:full green (or explicit documented gap)
                - No secrets in git
                - Clear summary: what changed, why, how to validate

                ## RULES
                - Never force-push main or skip hooks unless explicitly instructed.
                - Never run destructive DB migrations against shared Supabase without read-only verification first.
                - Prefer one strong solution over option sprawl.
                - When blocked on credentials, state exactly which Harness secret/connector to add.
              PLUGIN_HARNESS_CONNECTOR: \${{inputs.llmConnector.id}}
              PLUGIN_MCP_FORMAT: harness
              PLUGIN_MCP_SERVERS: <+connectorInputs.resolveList(<+inputs.mcpConnectors>)>
              VERCEL_TOKEN: <+secrets.getValue("VERCEL_TOKEN")>
  inputs:
    llmConnector:
      type: connector
      required: true
      ui:
        connectorCategories:
          - AI
    mcpConnectors:
      type: array
      default:
        - harness_hosted_mcp
      ui:
        component: array
        input:
          inputType: connector
          inputConfig:
            connectorCategories:
              - MCP
    repo:
      type: string
      default: mikelaurenzo7-collab/Wireline
    branch:
      type: string
      default: main
  clone:
    depth: 1000
    ref:
      type: branch
      name: <+inputs.branch>
    repo: <+inputs.repo>
    connector: ${GITHUB_CONNECTOR}
`;

const results = [];

async function ensureEnvironment(identifier, name, type) {
  const existing = await api(`/ng/api/environmentsV2/${identifier}?${scope}`);
  if (existing.status === 200) {
    results.push({ resource: "environment", identifier, status: "exists" });
    return;
  }
  const created = await api(`/ng/api/environmentsV2?${scope}`, {
    method: "POST",
    body: {
      identifier,
      name,
      type,
      orgIdentifier: ORG,
      projectIdentifier: PROJECT,
      tags: { product: "wireline" },
    },
  });
  results.push({
    resource: "environment",
    identifier,
    status: created.ok ? "created" : "failed",
    code: created.status,
    detail: created.data?.message || created.data?.status,
  });
}

async function ensureAgent() {
  const list = await api(`/gateway/agents/api/v1/agents?${scope}`);
  const agents = Array.isArray(list.data) ? list.data : [];
  const existing = agents.find((a) => a.uid === "wireline_wingman" || a.identifier === "wireline_wingman");
  if (existing) {
    results.push({ resource: "agent", identifier: "wireline_wingman", status: "exists" });
    return;
  }

  const created = await api(`/gateway/agents/api/v1/agents?${scope}`, {
    method: "POST",
    body: {
      uid: "wireline_wingman",
      name: "Wireline Wingman",
      description:
        "Principal cheat-code operator for Wireline — engineering, design, DevOps, architecture, and business execution.",
      wiki: "https://github.com/mikelaurenzo7-collab/Wireline/blob/main/docs/HARNESS_WINGMAN.md",
      spec: wingmanSpec,
    },
  });
  results.push({
    resource: "agent",
    identifier: "wireline_wingman",
    status: created.ok ? "created" : "failed",
    code: created.status,
    detail: typeof created.data === "string" ? created.data.slice(0, 300) : created.data,
  });
}

await ensureEnvironment("wireline_dev", "Wireline Development", "PreProduction");
await ensureEnvironment("wireline_preview", "Wireline Preview", "PreProduction");
await ensureEnvironment("wireline_prod", "Wireline Production", "Production");
await ensureAgent();

console.log(JSON.stringify({ account: ACCOUNT, org: ORG, project: PROJECT, results }, null, 2));

const failed = results.filter((r) => r.status === "failed");
process.exitCode = failed.length ? 1 : 0;
