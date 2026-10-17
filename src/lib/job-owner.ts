const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class JobOwnerError extends Error {
  readonly code = "INVALID_JOB_OWNER";

  constructor() {
    super("Job has no valid, consistent tenant owner.");
    this.name = "JobOwnerError";
  }
}

function ownerFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new JobOwnerError();
  return value as Record<string, unknown>;
}

/**
 * Drizzle claims are camelCase; legacy raw rows are snake_case. The immutable
 * queue row is the authority. Never recover a missing row owner from payload.
 * The all-zero system owner remains a valid UUID, not an absent tenant.
 */
export function jobOwnerId(job: unknown): string {
  const row = ownerFields(job);
  let owner: string | undefined;
  for (const key of ["userId", "user_id"] as const) {
    if (!Object.hasOwn(row, key) || row[key] === undefined) continue;
    const value = row[key];
    if (typeof value !== "string" || !UUID.test(value)) throw new JobOwnerError();
    const normalized = value.toLowerCase();
    if (owner !== undefined && owner !== normalized) throw new JobOwnerError();
    owner = normalized;
  }
  if (!owner) throw new JobOwnerError();
  return owner;
}

/** Missing legacy payload identity is allowed; any supplied identity must agree. */
export function assertJobPayloadOwner(job: unknown, payload: unknown): string {
  const owner = jobOwnerId(job);
  const fields = ownerFields(payload);
  if (
    ["userId", "user_id"].some((key) => Object.hasOwn(fields, key) && fields[key] !== undefined) &&
    jobOwnerId(fields) !== owner
  )
    throw new JobOwnerError();
  return owner;
}
