import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { runInNewContext } from "node:vm";
import followRedirects from "follow-redirects";
import { expect, it } from "vitest";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

it("strips cross-realm custom credential headers from cross-origin redirects", async () => {
  let headers: Record<string, unknown> = {};
  const destination = createServer((request, response) => {
    headers = request.headers;
    response.end("ok");
  });
  const targetPort = await listen(destination);
  const origin = createServer((_request, response) => {
    response.writeHead(302, { Location: `http://127.0.0.1:${targetPort}/` });
    response.end();
  });
  try {
    const sourcePort = await listen(origin);
    const sensitiveHeaders = runInNewContext('["X-API-Key"]') as string[];
    expect(Array.isArray(sensitiveHeaders)).toBe(true);
    expect(sensitiveHeaders instanceof Array).toBe(false);
    await new Promise<void>((resolve, reject) => {
      const request = followRedirects.http.get(
        {
          hostname: "localhost",
          family: 4,
          port: sourcePort,
          path: "/",
          sensitiveHeaders,
          headers: { "X-API-Key": "test-only-synthetic-token", "X-Harmless": "keep" },
        },
        (response) => {
          response.resume();
          response.once("end", resolve);
          response.once("error", reject);
        },
      );
      request.once("error", reject);
      request.setTimeout(3_000, () => request.destroy(new Error("Local redirect probe timed out")));
    });
    expect(headers["x-api-key"]).toBeUndefined();
    expect(headers["x-harmless"]).toBe("keep");
  } finally {
    await Promise.all(
      [origin, destination].map(
        (server) => new Promise<void>((resolve) => server.close(() => resolve())),
      ),
    );
  }
});
