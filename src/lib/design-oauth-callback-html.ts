import { buildCSP, generateCspNonce } from "./csp";

export function renderDesignOAuthCallbackPage(
  provider: string,
  targetOrigin: string,
  isProd: boolean,
): { html: string; csp: string } {
  const cspNonce = generateCspNonce();
  const csp = buildCSP(!isProd, cspNonce);
  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>Wireline Design — connected</title></head>
<body>
<script nonce="${cspNonce}">
  if (window.opener) {
    window.opener.postMessage({ type: 'DESIGN_OAUTH_SUCCESS', provider: ${JSON.stringify(provider)} }, ${JSON.stringify(targetOrigin)});
    window.close();
  } else {
    window.location.href = '/design?connected=${encodeURIComponent(provider)}';
  }
</script>
<p>${provider} connected for Wireline Design. You can close this window.</p>
</body></html>`;
  return { html, csp };
}
