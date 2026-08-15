import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

/** Source with comments removed — these modules explain the rule in prose that
 *  would otherwise match the very pattern the rule forbids. */
const readCode = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/**
 * Two invariants that are easy to break by accident and expensive to notice:
 * a server cold path that quietly picks up client-only weight, and a
 * north-star metric that quietly starts measuring nothing.
 */

describe("server-reachable data modules stay free of client-only weight", () => {
  // These modules are imported, directly or transitively, by server.ts.
  // `--packages=external` means the cost is not bundle size — it is a real
  // require() of the lucide barrel on every serverless cold start, measured at
  // 62 ms and 7.2 MB of heap for API traffic that never renders an icon.
  const SERVER_REACHABLE_DATA = [
    "src/constants/navigation.ts",
    "src/data/vertical-wedges.ts",
    "src/lib/marketing-route-meta.ts",
    "src/lib/account-type.ts",
  ];

  for (const path of SERVER_REACHABLE_DATA) {
    it(`${path} does not import lucide-react`, () => {
      const code = readCode(path);
      expect(code).not.toMatch(/from\s+["']lucide-react["']/);
      expect(code).not.toMatch(/require\(["']lucide-react["']\)/);
    });
  }

  it("names nav icons instead of holding component references", () => {
    const nav = read("src/constants/navigation.ts");
    expect(nav).toContain("export type NavIconName");
    expect(nav).toContain("icon: NavIconName;");
    // Every icon field is a string literal.
    const iconFields = nav.match(/icon: [^,\n}]+/g) ?? [];
    const componentRefs = iconFields.filter(
      (field) =>
        !field.includes('"') && !field.includes("NavIconName") && !field.includes("item.icon"),
    );
    expect(componentRefs).toEqual([]);
  });

  it("names wedge pain icons instead of holding component references", () => {
    const wedges = read("src/data/vertical-wedges.ts");
    expect(wedges).toContain("export type PainIconName");
    expect(wedges).toContain("icon: PainIconName;");
    const iconFields = wedges.match(/icon: [^,\n}]+/g) ?? [];
    const componentRefs = iconFields.filter(
      (field) => !field.includes('"') && !field.includes("PainIconName"),
    );
    expect(componentRefs).toEqual([]);
  });

  it("binds names to components only in the client layer", () => {
    const resolver = read("src/components/nav-icons.ts");
    expect(resolver).toContain('from "lucide-react"');
    expect(resolver).toContain("export function navIcon");
    // Shell surfaces go through the resolver rather than reading a component
    // straight off the data.
    for (const path of [
      "src/components/WorkspaceShell.tsx",
      "src/components/layout/MobileNavMoreSheet.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain("navIcon(item.icon)");
      expect(source).not.toContain("const Icon = item.icon;");
    }
    expect(read("src/pages/VerticalLanding.tsx")).toContain("PAIN_ICONS[pain.icon]");
  });
});

describe("the Phase B activation metric requires a human, not the machine", () => {
  const source = read("src/lib/tenant-activation.ts");
  const gate = source.slice(
    source.indexOf("export async function hasApprovedActivationAction"),
    source.indexOf("export async function getTenantActivationStatus"),
  );

  it("excludes the digest row post-call-digest writes on every call", () => {
    // post-call-digest inserts sourceType "call_log", status "completed",
    // sourceId = the call log id, on EVERY call. While those were OR'd into the
    // approval predicate the gate was satisfied unconditionally, so
    // activationWithApprovedAction equalled activated for every tenant.
    expect(source).toContain('MACHINE_POST_CALL_TASK_TYPE = "post_call_note"');
    expect(gate).toContain("MACHINE_POST_CALL_TASK_TYPE");
    expect(gate).toContain("<>");
  });

  it("treats source_type and source_id as no evidence of approval at all", () => {
    expect(gate).not.toContain('sourceType, "call_log"');
    expect(gate).not.toContain("firstActivationCallId");
  });

  it("requires the approval stamp, ANDed rather than ORed", () => {
    expect(gate).toContain("ILIKE '%Approved%'");
    // No `or(` inside the predicate — every clause must hold.
    expect(gate).not.toMatch(/\bor\(/);
  });

  it("still matches the one writer that records a real approval", () => {
    // fleet-routes stamps this exact string on approve-and-execute.
    expect(read("src/routes/fleet-routes.ts")).toContain(
      'resolutionNotes: "Approved and executed by Account Holder"',
    );
  });
});

describe("agent-draft capacity does not check out a second pooled connection", () => {
  const source = read("src/lib/agent-draft-service.ts");

  it("reads through the transaction handle", () => {
    const fn = source.slice(
      source.indexOf("async function assertAgentCapacity"),
      source.indexOf("export async function createAgentDraft"),
    );
    expect(fn).toContain("db: Pick<typeof drizzle");
    expect(fn).toContain("await db\n    .select(");
    // The pooled handle must not appear inside the helper.
    expect(fn).not.toContain("await drizzle");
  });

  it("is called with tx from inside the transaction", () => {
    expect(source).toContain("assertAgentCapacity(tx, principal, existingCount)");
  });
});
