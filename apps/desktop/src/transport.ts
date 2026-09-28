import * as https from "node:https";
import { StringDecoder } from "node:string_decoder";
import { resolvePinnedWebhookDestination } from "../../../src/lib/safe-webhook-delivery";

export type HttpReply = { status: number; headers: Record<string, string>; body: string };
export type PostRequest = (
  url: string,
  body: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
) => Promise<HttpReply>;

const MAX_RESPONSE_BYTES = 1024 * 1024;

export function isEventStreamContentType(value: string | undefined): boolean {
  return value?.split(";", 1)[0].trim().toLowerCase() === "text/event-stream";
}

/** Incremental, bounded SSE parsing: incomplete lines are never rescanned or repeatedly joined. */
export function createSseParser(onEvent: (data: string) => boolean | void) {
  const decoder = new StringDecoder("utf8");
  let bytes = 0;
  let lineParts: string[] = [];
  let eventData: string[] = [];
  let afterCR = false;
  let firstText = true;
  let complete = false;
  const finishLine = () => {
    const line = lineParts.join("");
    lineParts = [];
    if (!line) {
      if (eventData.length) complete = onEvent(eventData.join("\n")) === true;
      eventData = [];
    } else if (line === "data") eventData.push("");
    else if (line.startsWith("data:")) eventData.push(line.slice(line[5] === " " ? 6 : 5));
  };
  return {
    push(chunk: Buffer): boolean {
      if (complete) return true;
      bytes += chunk.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("Tool response is too large.");
      let text = decoder.write(chunk);
      if (firstText && text) {
        firstText = false;
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      }
      let start = 0;
      for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (afterCR) {
          afterCR = false;
          if (char === "\n") {
            start = index + 1;
            continue;
          }
        }
        if (char !== "\r" && char !== "\n") continue;
        if (index > start) lineParts.push(text.slice(start, index));
        finishLine();
        if (complete) return true;
        afterCR = char === "\r";
        start = index + 1;
      }
      if (start < text.length) lineParts.push(text.slice(start));
      return false;
    },
  };
}

export function parseCompleteSseData(body: string): string[] {
  const events: string[] = [];
  createSseParser((data) => {
    events.push(data);
  }).push(Buffer.from(body, "utf8"));
  return events;
}

/** A Streamable HTTP server may keep SSE open after returning the matching RPC result. */
export function createRpcEventMatcher(expectedId: string) {
  return createSseParser((data) => {
    try {
      const item = JSON.parse(data);
      return (
        item?.jsonrpc === "2.0" && item?.id === expectedId && ("result" in item || "error" in item)
      );
    } catch {
      return false;
    }
  });
}

export function hasCompleteRpcEvent(body: string, expectedId: string): boolean {
  return createRpcEventMatcher(expectedId).push(Buffer.from(body, "utf8"));
}

export function validateEndpoint(raw: string): string {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    raw.length > 2048
  )
    throw new Error("Use a public HTTPS endpoint without credentials or query parameters.");
  return url.toString();
}

/** One bounded POST. Never follows redirects, retries, or forwards a credential to another origin. */
export const postPinned: PostRequest = async (raw, body, headers, callerSignal) => {
  validateEndpoint(raw);
  if (Buffer.byteLength(body) > 4 * 1024 * 1024) throw new Error("Request is too large.");
  const signal = AbortSignal.any([
    AbortSignal.timeout(65_000),
    ...(callerSignal ? [callerSignal] : []),
  ]);
  signal.throwIfAborted();
  let rejectResolution!: (error: Error) => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    rejectResolution = reject;
  });
  const abortResolution = () => rejectResolution(new Error("Connection stopped or timed out."));
  signal.addEventListener("abort", abortResolution, { once: true });
  const destination = await Promise.race([resolvePinnedWebhookDestination(raw), stopped]).finally(
    () => signal.removeEventListener("abort", abortResolution),
  );
  if (destination.status !== "public")
    throw new Error("This endpoint does not resolve to a public HTTPS service.");
  signal.throwIfAborted();
  let expectedId: string | null = null;
  try {
    const payload = JSON.parse(body);
    if (typeof payload.id === "string") expectedId = payload.id;
  } catch {
    /* OAuth uses form encoding. */
  }
  return new Promise<HttpReply>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let finished = false;
    const request = https.request(
      destination.url,
      {
        method: "POST",
        signal,
        agent: false,
        headers: {
          ...headers,
          "content-length": String(Buffer.byteLength(body)),
          "accept-encoding": "identity",
        },
        lookup: ((
          _hostname: string,
          options: { all?: boolean } | number,
          callback: (...args: unknown[]) => void,
        ) => {
          if (typeof options === "object" && options.all)
            callback(null, [{ address: destination.address, family: destination.family }]);
          else callback(null, destination.address, destination.family);
        }) as NonNullable<https.RequestOptions["lookup"]>,
      },
      (response) => {
        const resultHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.headers))
          if (typeof value === "string") resultHeaders[key.toLowerCase()] = value;
        const matcher =
          expectedId && isEventStreamContentType(resultHeaders["content-type"])
            ? createRpcEventMatcher(expectedId)
            : null;
        const finish = () => {
          if (finished) return;
          finished = true;
          resolve({
            status: response.statusCode || 0,
            headers: resultHeaders,
            body: Buffer.concat(chunks, size).toString("utf8"),
          });
        };
        const encoding = response.headers["content-encoding"];
        if (
          encoding !== undefined &&
          (typeof encoding !== "string" || encoding.trim().toLowerCase() !== "identity")
        ) {
          response.destroy();
          reject(new Error("Compressed tool responses are not supported."));
          return;
        }
        response.on("data", (chunk: Buffer) => {
          if (finished) return;
          size += chunk.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            response.destroy(new Error("Tool response is too large."));
            return;
          }
          chunks.push(chunk);
          try {
            if (matcher?.push(chunk)) {
              finish();
              response.destroy();
            }
          } catch {
            response.destroy(new Error("The tool stream could not be read safely."));
          }
        });
        response.on("error", reject);
        response.on("end", finish);
      },
    );
    request.on("error", reject);
    request.end(body);
  });
};
