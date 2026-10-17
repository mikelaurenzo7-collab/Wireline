/**
 * The account a job belongs to. Claimed rows come straight from Drizzle with
 * camelCase keys (`userId`), whatever `JobRow` declares, so read both.
 */
export function jobOwnerId(job: object): string {
  const shaped = job as { userId?: string; user_id?: string };
  return String(shaped.userId || shaped.user_id || "");
}
