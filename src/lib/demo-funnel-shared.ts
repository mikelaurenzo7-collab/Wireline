/**
 * Browser-safe demo attribution helpers — no server imports.
 * Server funnel logic lives in demo-funnel.ts.
 */
export const DEMO_SOURCE_COOKIE = "wireline_demo_source";

export function parseDemoSourceFromQuery(search: string): string | null {
  const params = new URLSearchParams(search);
  const demo = params.get("demo") || params.get("agent");
  const utm = params.get("utm_source");
  if (demo) return `landing:${demo}`;
  if (utm) return `utm:${utm}`;
  return null;
}
