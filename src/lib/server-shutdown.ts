import type { Server } from "node:http";
import { drainBackgroundWork } from "./background-work";
import { getDeploymentIdentity, type DeploymentEnvironment } from "./deployment-environment";

export function serverShutdownGraceMs(env: DeploymentEnvironment = process.env): number {
  const provider = getDeploymentIdentity(env).provider;
  // Leave the host time to terminate sockets before Render's 300-second limit.
  return provider === "render" || provider === "conflict" ? 250_000 : 30_000;
}

/** Stop HTTP admission, finish accepted requests, then finish their post-response work. */
export async function closeServerAndDrain(
  server: Server | null,
  graceMs = serverShutdownGraceMs(),
): Promise<"drained" | "timed_out"> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  // Node 22 closes currently idle connections in close(), but a response that
  // finishes afterwards can leave its socket idle until the keep-alive timeout.
  // Reap only idle sockets while draining; never interrupt an active response.
  const idleSweep = server ? setInterval(() => server.closeIdleConnections(), 50) : undefined;
  const closed = server
    ? new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
    : Promise.resolve();
  try {
    return await Promise.race([
      closed.then(async () => {
        // Accepted requests can enqueue work until the server has closed.
        await drainBackgroundWork();
        return "drained" as const;
      }),
      new Promise<"timed_out">((resolve) => {
        deadline = setTimeout(() => resolve("timed_out"), graceMs);
      }),
    ]);
  } finally {
    if (deadline) clearTimeout(deadline);
    if (idleSweep) clearInterval(idleSweep);
  }
}
