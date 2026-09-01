import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.BOTBOUND_PROOF_API_PORT ?? 3001);

const server = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");

  if (request.url?.startsWith("/api/auth/session")) {
    response.end(JSON.stringify({ user: null }));
    return;
  }

  if (request.url?.startsWith("/api/auth/providers")) {
    response.end(
      JSON.stringify({
        providers: { google: false, microsoft: false, yahoo: false },
      }),
    );
    return;
  }

  response.statusCode = 404;
  response.end(
    JSON.stringify({
      code: "SOURCE_PREVIEW_API_UNAVAILABLE",
      error: "This endpoint is unavailable in the credential-free source preview.",
    }),
  );
});

server.listen(port, host, () => {
  console.log(`BotBound proof API stub listening on http://${host}:${port}`);
});
