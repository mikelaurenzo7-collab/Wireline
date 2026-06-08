/**
 * Founder operating cockpit — five executive questions in one payload.
 */
import { sql } from "drizzle-orm";
import { drizzle } from "./server-context";
import { getVoiceReliabilityPayload } from "./voice-reliability";
import { evaluateLaunchReadiness } from "./launch-readiness";
import { listAtRiskTenants, countAtRiskTenants } from "./tenant-economics";

export type OperatingCockpitPayload = {
  ok: boolean;
  generated_at: string;
  acquiring: {
    new_users_7d: number;
    demo_calls_7d: number;
    demo_recaps_7d: number;
    demo_signups_7d: number;
  };
  activating: {
    activated_total: number;
    activation_rate_pct: number;
    median_time_to_activation_seconds: number | null;
    activated_last_7d: number;
  };
  calls_working: {
    voice_healthy: boolean;
    demo_canary_healthy: boolean | null;
    reliability_summary: Awaited<ReturnType<typeof getVoiceReliabilityPayload>>["summary"] | null;
  };
  costs_controlled: {
    economics_at_risk_count: number;
    top_at_risk: Awaited<ReturnType<typeof listAtRiskTenants>>;
  };
  retained: {
    trialing_expired_7d: number;
    zero_calls_14d: number;
    activated_not_paying: number;
  };
  launch_readiness: ReturnType<typeof evaluateLaunchReadiness>;
};

async function founderStatsSlice() {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60_000);
  const num = (v: unknown) => Number(v ?? 0);
  const row = (r: { rows?: Array<Record<string, unknown>> }) => num(r?.rows?.[0]?.c);

  const [
    totalUsers,
    newUsers7d,
    activatedUsers,
    activated7d,
    medianActivation,
    trialingExpired7d,
    zeroCalls14d,
    activatedNotPaying,
    demoCalls7d,
    demoRecaps7d,
    demoSignups7d,
  ] = await Promise.all([
    drizzle.execute(sql`SELECT count(*)::int AS c FROM wireline_users`),
    drizzle.execute(
      sql`SELECT count(*)::int AS c FROM wireline_users WHERE created_at >= ${since7d.toISOString()}`,
    ),
    drizzle.execute(
      sql`SELECT count(*)::int AS c FROM wireline_settings WHERE activated_at IS NOT NULL`,
    ),
    drizzle.execute(
      sql`SELECT count(*)::int AS c FROM wireline_settings WHERE activated_at >= ${since7d.toISOString()}`,
    ),
    drizzle.execute(
      sql`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY time_to_activation_seconds)::float AS p50
          FROM wireline_settings WHERE activated_at IS NOT NULL AND time_to_activation_seconds IS NOT NULL`,
    ),
    drizzle.execute(
      sql`SELECT count(*)::int AS c FROM wireline_settings
          WHERE subscription_status = 'trial_expired' AND updated_at >= ${since7d.toISOString()}`,
    ),
    drizzle.execute(
      sql`SELECT count(DISTINCT u.id)::int AS c FROM wireline_users u
          LEFT JOIN wireline_call_logs c ON c.user_id = u.id AND c.demo = false AND c.created_at >= ${since14d.toISOString()}
          WHERE c.id IS NULL`,
    ),
    drizzle.execute(
      sql`SELECT count(*)::int AS c FROM wireline_settings s
          WHERE s.activated_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM wireline_subscriptions sub WHERE sub.user_id = s.user_id AND sub.status = 'active')`,
    ),
    drizzle
      .execute(
        sql`SELECT count(*)::int AS c FROM wireline_demo_call_events WHERE created_at >= ${since7d.toISOString()}`,
      )
      .catch(() => ({ rows: [{ c: 0 }] })),
    drizzle
      .execute(
        sql`SELECT count(*)::int AS c FROM wireline_demo_call_events
          WHERE recap_sent_at IS NOT NULL AND created_at >= ${since7d.toISOString()}`,
      )
      .catch(() => ({ rows: [{ c: 0 }] })),
    drizzle
      .execute(
        sql`SELECT count(*)::int AS c FROM wireline_demo_call_events
          WHERE signup_user_id IS NOT NULL AND created_at >= ${since7d.toISOString()}`,
      )
      .catch(() => ({ rows: [{ c: 0 }] })),
  ]);

  const total = row(totalUsers);
  const activated = row(activatedUsers);
  const medianRow = medianActivation as { rows?: Array<{ p50?: number | null }> };
  const p50 = medianRow?.rows?.[0]?.p50;

  return {
    acquiring: {
      new_users_7d: row(newUsers7d),
      demo_calls_7d: row(demoCalls7d),
      demo_recaps_7d: row(demoRecaps7d),
      demo_signups_7d: row(demoSignups7d),
    },
    activating: {
      activated_total: activated,
      activation_rate_pct: total > 0 ? Math.round((activated / total) * 100) : 0,
      median_time_to_activation_seconds: p50 == null ? null : Math.round(Number(p50)),
      activated_last_7d: row(activated7d),
    },
    retained: {
      trialing_expired_7d: row(trialingExpired7d),
      zero_calls_14d: row(zeroCalls14d),
      activated_not_paying: row(activatedNotPaying),
    },
  };
}

export async function getOperatingCockpitPayload(
  ownerUserId: string,
): Promise<OperatingCockpitPayload> {
  const [stats, atRiskCount, topAtRisk, launchReadiness] = await Promise.all([
    founderStatsSlice(),
    countAtRiskTenants(),
    listAtRiskTenants(5),
    Promise.resolve(evaluateLaunchReadiness()),
  ]);

  let reliability: Awaited<ReturnType<typeof getVoiceReliabilityPayload>> | null = null;
  let demoCanaryHealthy: boolean | null = null;

  try {
    reliability = await getVoiceReliabilityPayload({ userId: ownerUserId, days: 1 });
  } catch {
    reliability = null;
  }

  try {
    const lastCanary = await drizzle.execute(
      sql`SELECT result FROM wireline_jobs
          WHERE type = 'demo_line_canary' AND status = 'done'
          ORDER BY finished_at DESC NULLS LAST LIMIT 1`,
    );
    const result = (lastCanary as { rows?: Array<{ result?: { allHealthy?: boolean } }> })
      ?.rows?.[0]?.result;
    if (result && typeof result.allHealthy === "boolean") {
      demoCanaryHealthy = result.allHealthy;
    }
  } catch {
    demoCanaryHealthy = null;
  }

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    acquiring: stats.acquiring,
    activating: stats.activating,
    calls_working: {
      voice_healthy: reliability?.summary.healthy ?? true,
      demo_canary_healthy: demoCanaryHealthy,
      reliability_summary: reliability?.summary ?? null,
    },
    costs_controlled: {
      economics_at_risk_count: atRiskCount,
      top_at_risk: topAtRisk,
    },
    retained: stats.retained,
    launch_readiness: launchReadiness,
  };
}
