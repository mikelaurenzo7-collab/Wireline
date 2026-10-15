import { Redis } from "@upstash/redis";

/** Upstash REST answers in milliseconds; a command still waiting this long is an outage. */
export const UPSTASH_COMMAND_TIMEOUT_MS = 1_500;

/**
 * The one Upstash client configuration for server code.
 *
 * The library default retries a failed command five times with exponential
 * backoff and never times out. When Upstash was unreachable, each command
 * held its caller (sign-in, the jobs sweep, inbound call admission) for about
 * 4.4 seconds, or until the OS gave up on a silently dropped connection. One
 * quick retry inside a fixed time budget lets each caller's own fail-open or
 * fail-closed path decide promptly.
 *
 * The signal must be a function. Given a plain AbortSignal, the library turns
 * an abort into a successful "Aborted" result instead of an error, which would
 * read as data.
 */
export function createUpstashRedis(url: string, token: string): Redis {
  return new Redis({
    url,
    token,
    retry: { retries: 1, backoff: () => 50 },
    signal: () => AbortSignal.timeout(UPSTASH_COMMAND_TIMEOUT_MS),
  });
}
