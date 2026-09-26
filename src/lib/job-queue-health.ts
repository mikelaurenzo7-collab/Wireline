/** Age is measured from run_at, so intentionally scheduled future jobs are not overdue. */
export function evaluateJobQueueHealth(
  pendingJobs: number,
  oldestPendingAgeSeconds?: number | null,
): { health: "ok" | "warn" | "critical"; notes: string[] } {
  const age =
    pendingJobs > 0 && Number.isFinite(oldestPendingAgeSeconds)
      ? Math.max(0, oldestPendingAgeSeconds ?? 0)
      : 0;
  const health =
    pendingJobs > 200 || age > 3600 ? "critical" : pendingJobs > 50 || age > 600 ? "warn" : "ok";
  const notes: string[] = [];
  if (pendingJobs > 50) {
    notes.push("Job backlog is elevated; verify the scheduler and POST /api/jobs/sweep.");
  }
  if (age > 600) {
    notes.push(
      `The oldest pending job is ${Math.floor(age / 60)} minutes overdue; verify scheduler execution and job retries.`,
    );
  }
  return { health, notes };
}
