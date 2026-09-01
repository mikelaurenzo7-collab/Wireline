import type { ServerResponse } from "node:http";

export type AccountExportWritable = Pick<
  ServerResponse,
  "destroyed" | "once" | "removeListener" | "writableEnded" | "write"
>;

export class AccountExportStreamClosedError extends Error {
  constructor() {
    super("Account export client disconnected before the archive completed.");
    this.name = "AccountExportStreamClosedError";
  }
}

/**
 * Write one archive chunk without allowing a slow client to make response
 * buffering grow without bound. Node signals backpressure by returning false
 * from write(); the next database page must not be fetched until drain fires.
 */
export async function writeAccountExportChunk(
  response: AccountExportWritable,
  chunk: string,
  signal?: AbortSignal,
): Promise<void> {
  const throwIfAborted = () => {
    if (!signal?.aborted) return;
    throw signal.reason instanceof Error ? signal.reason : new AccountExportStreamClosedError();
  };

  throwIfAborted();
  if (response.destroyed || response.writableEnded) {
    throw new AccountExportStreamClosedError();
  }
  if (response.write(chunk)) return;

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      response.removeListener("drain", onDrain);
      response.removeListener("close", onClose);
      response.removeListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new AccountExportStreamClosedError());
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      cleanup();
      reject(
        signal?.reason instanceof Error ? signal.reason : new AccountExportStreamClosedError(),
      );
    };

    response.once("drain", onDrain);
    response.once("close", onClose);
    response.once("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });

    // The socket can close between write() returning false and listener
    // registration. Re-check after subscribing so that race cannot hang the
    // export transaction forever waiting for a drain event that will not come.
    if (response.destroyed || response.writableEnded) onClose();
    else if (signal?.aborted) onAbort();
  });
}
