import { createServer } from "node:http";
import { productProofApiResponse } from "./lib/product-proof-api.mjs";

const host = "127.0.0.1";
const port = Number(process.env.BOTBOUND_PROOF_API_PORT ?? 3001);
const server = createServer((request, response) => {
  const result = productProofApiResponse(request.method, request.url);
  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(result.body));
});
server.listen(port, host, () => {
  console.log("BotBound simulated proof API listening on http://" + host + ":" + port);
});
