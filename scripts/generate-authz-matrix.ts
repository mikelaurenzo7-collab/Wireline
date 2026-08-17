#!/usr/bin/env tsx
/**
 * Default-deny authorization contract for Wireline's primary HTTP surface.
 *
 * The script reads the canonical route registry, resolves each mounted router's
 * full paths, and rejects any mounted route that is neither protected nor on a
 * deliberate public allowlist. Standalone serverless transports (for example
 * the ChatGPT MCP entrypoint) own dedicated protocol contract tests instead.
 *
 * Route extraction is a small balanced-call scanner rather than a single regex:
 * factory/named handlers (`createAuditEventsHandler(deps)`, `sweepHandler`),
 * comments between the method call and the path string, array path arguments,
 * and sub-routers composed via `router.use(subRouter)` (the oauth/ provider
 * pattern, twilio-webhook-base, video-presenter-routes-base,
 * grok-live-profile-routes) are all resolved instead of silently skipped.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ROUTES_DIR = path.resolve(REPO_ROOT, "src/routes");
const ROUTE_REGISTRY_FILE = path.resolve(REPO_ROOT, "src/server/register-api-routes.ts");
const OUTPUT_FILE = path.resolve(REPO_ROOT, "docs/AUTHZ_MATRIX.md");

const AUTH_MIDDLEWARE = [
  "authenticateUser",
  "authenticateEventStream",
  "requirePermission",
  "requireRole",
  "requirePlatformAdmin",
  "requireMonitorToken",
  "requireInternalJwtSecret",
  // Route-local composite gate on /api/jobs/sweep (src/routes/job-routes.ts):
  // timing-safe CRON_SECRET bearer OR authenticated owner/admin.
  "cronOrAdminAuth",
  // Studio Vapi web proxy: HMAC live-test ticket, not a session cookie.
  "requireStudioVapiWebTicket",
];

const PUBLIC_ALLOWLIST: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /^\/(?:api\/)?stripe-webhook$/,
    reason: "Stripe signature verification + idempotency",
  },
  {
    pattern: /^\/api\/twilio-webhook\//,
    reason: "Twilio signature validation; valid provider retries are never IP-throttled",
  },
  { pattern: /^\/api\/webhooks\/meta\//, reason: "Meta HMAC-SHA256 signature + rate limit" },
  {
    pattern: /^\/api\/webhooks\/resend$/,
    reason: "Resend/Svix timestamped HMAC-SHA256 signature + replay window",
  },
  {
    pattern: /^\/api\/webhooks\/agentmail\/:accountId$/,
    reason: "AgentMail/Svix timestamped HMAC-SHA256 signature + replay window",
  },
  { pattern: /^\/api\/vapi\//, reason: "Vapi tool/webhook signature verification" },
  { pattern: /^\/api\/vapi-webhook$/, reason: "Vapi signature validation + agent-scoped routing" },
  { pattern: /^\/api\/escalate$/, reason: "Vapi X-Vapi-Secret (timing-safe) + rate limit" },
  {
    pattern: /^\/api\/integrations\/certified$/,
    reason: "Public certified-integration status; rate-limited, no tenant data",
  },
  {
    pattern: /^\/api\/daily-brief\/schedule$/,
    reason: "Vercel cron; Bearer CRON_SECRET (timing-safe)",
  },
  {
    pattern: /^\/(?:api\/intake\/)?leads?$/,
    reason: "API-key auth via X-Wireline-Key + rate limit",
  },
  { pattern: /^\/api\/oauth\//, reason: "OAuth initiation/callback (state-validated)" },
  {
    pattern: /^\/api\/ecommerce\/oauth\/callback$/,
    reason:
      "Square OAuth callback (redirect URL registered with Square); state verified in-handler via verifyOAuthState",
  },
  { pattern: /^\/api\/auth\//, reason: "Signup/login/refresh (public by definition)" },
  {
    pattern: /^\/api\/email\/unsubscribe$/,
    reason: "CAN-SPAM one-click unsubscribe; token-scoped + rate-limited",
  },
  {
    pattern: /^\/api\/health\/?$/,
    reason: "Public liveness probe; DB ping only, rate-limited",
  },
  {
    pattern: /^\/api\/health\/public$/,
    reason: "Public component status; rate-limited, no tenant data",
  },
  {
    pattern: /^\/api\/health\/report$/,
    reason:
      "Browser client-error reports (pre-auth by design); rate-limited, size-bounded input, no data returned",
  },
  {
    pattern: /^\/api\/health\/slos$/,
    reason: "Monitor token OR authenticated platform admin; enforced in handler",
  },
  {
    pattern: /^\/(?:api\/)?health\/voice-status$/,
    reason: "Public demo-line voice probe; aggregated metrics only, rate-limited",
  },
  { pattern: /^\/api\/public\//, reason: "Aggregated, no-PII marketing counters; rate-limited" },
  {
    pattern: /^\/api\/support\/ticket$/,
    reason: "Public support/contact form; strict validation + 5/15min IP rate limit",
  },
  { pattern: /^\/(?:api\/)?billing\/plans$/, reason: "Public plan/price comparison table" },
  { pattern: /^\/(?:api\/quotas\/)?plans$/, reason: "Public plan limits comparison table" },
  {
    pattern: /^\/(?:api\/)?openapi\.json$/,
    reason: "Public OpenAPI spec; rate-limited + CDN cached",
  },
  { pattern: /^\/api\/support\/ticket$/, reason: "Public support form; rate-limited + validated" },
  { pattern: /^\/api\/contact$/, reason: "Public marketing contact form; rate-limited" },
  {
    pattern: /^\/(?:api\/)?voice\/metrics$/,
    reason: "Vapi X-Vapi-Secret (timing-safe) verified in handler; telemetry write",
  },
  {
    pattern: /^\/recap\/:slug$/,
    reason:
      "Signed shareable call/weekly recap; opaque slug + bearer token verified against stored SHA-256 hash, timing-safe; per-IP + per-slug rate limits",
  },
];

interface RouteEntry {
  file: string;
  method: string;
  rawPath: string;
  fullPath: string;
  mountBase: string;
  hasInlineAuth: boolean;
  hasRouterAuth: boolean;
  hasRequirePermission: boolean;
  hasRequirePlatformAdmin: boolean;
  allowReason: string | null;
  line: number;
}

function lineOf(content: string, charIndex: number): number {
  return content.slice(0, charIndex).split("\n").length;
}

function allowlistReason(fullPath: string): string | null {
  return PUBLIC_ALLOWLIST.find((entry) => entry.pattern.test(fullPath))?.reason || null;
}

/** Resolve the import alias and mount base for each router actually mounted in production. */
function parseMountTable(): Map<string, string> {
  const registry = fs.readFileSync(ROUTE_REGISTRY_FILE, "utf8");
  const variableToFile = new Map<string, string>();
  const importRe = /import\s+(\w+)\s+from\s+["']\.\.\/routes\/([\w/-]+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = importRe.exec(registry)) !== null) {
    variableToFile.set(match[1], match[2]);
  }

  const fileToBase = new Map<string, string>();
  const useWithBaseRe = /app\.use\(\s*["']([^"']+)["']\s*,\s*(\w+)\s*\)/g;
  while ((match = useWithBaseRe.exec(registry)) !== null) {
    const file = variableToFile.get(match[2]);
    if (file) fileToBase.set(file, match[1]);
  }

  const useBareRe = /app\.use\(\s*(\w+)\s*\)/g;
  while ((match = useBareRe.exec(registry)) !== null) {
    const file = variableToFile.get(match[1]);
    if (file && !fileToBase.has(file)) fileToBase.set(file, "");
  }

  return fileToBase;
}

function resolveFullPath(base: string, rawPath: string): string {
  let full = rawPath.startsWith("/api") ? rawPath : `${base}${rawPath}`;
  full = full.replace(/\/{2,}/g, "/");
  if (full.length > 1 && full.endsWith("/")) full = full.slice(0, -1);
  return full;
}

/** Characters after which a `/` begins a regex literal rather than division. */
const REGEX_PRECEDING_CHARS = new Set("(,=:[!&|?{};+-*%<>~^".split(""));

/**
 * Index of the `)` closing the call whose `(` sits at `openParen`, skipping
 * strings, template literals (with nested interpolations), comments, and
 * regex literals. Returns -1 when the call never closes (malformed source).
 */
function findCallEnd(content: string, openParen: number): number {
  let depth = 0;
  let lastSignificant = "";
  const stack: string[] = [];

  for (let i = openParen; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];
    const mode = stack[stack.length - 1];

    if (mode === "line") {
      if (ch === "\n") stack.pop();
      continue;
    }
    if (mode === "block") {
      if (ch === "*" && next === "/") {
        stack.pop();
        i++;
      }
      continue;
    }
    if (mode === "single" || mode === "double") {
      if (ch === "\\") i++;
      else if ((mode === "single" && ch === "'") || (mode === "double" && ch === '"')) {
        stack.pop();
        lastSignificant = ch;
      }
      continue;
    }
    if (mode === "template") {
      if (ch === "\\") i++;
      else if (ch === "`") {
        stack.pop();
        lastSignificant = ch;
      } else if (ch === "$" && next === "{") {
        stack.push("interp");
        i++;
      }
      continue;
    }
    if (mode === "regex") {
      if (ch === "\\") i++;
      else if (ch === "[") stack.push("class");
      else if (ch === "/") {
        stack.pop();
        lastSignificant = ")"; // a value: a following slash is division
      }
      continue;
    }
    if (mode === "class") {
      if (ch === "\\") i++;
      else if (ch === "]") stack.pop();
      continue;
    }

    // Code context: top level, or inside a template interpolation.
    if (ch === "/" && next === "/") {
      stack.push("line");
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      stack.push("block");
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      stack.push(ch === "'" ? "single" : ch === '"' ? "double" : "template");
      continue;
    }
    if (ch === "/") {
      if (lastSignificant === "" || REGEX_PRECEDING_CHARS.has(lastSignificant)) {
        stack.push("regex");
      } else {
        lastSignificant = ch;
      }
      continue;
    }
    if (mode === "interp" || mode === "brace") {
      if (ch === "{") {
        stack.push("brace");
        lastSignificant = ch;
        continue;
      }
      if (ch === "}") {
        stack.pop();
        lastSignificant = ch;
        continue;
      }
    }
    if (stack.length === 0) {
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) return i;
      }
    }
    if (!/\s/.test(ch)) lastSignificant = ch;
  }

  return -1;
}

/** Advance past whitespace and comments, staying within [index, end). */
function skipInsignificant(content: string, index: number, end: number): number {
  let i = index;
  while (i < end) {
    const ch = content[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "/" && content[i + 1] === "/") {
      const newline = content.indexOf("\n", i);
      if (newline === -1 || newline >= end) return end;
      i = newline + 1;
    } else if (ch === "/" && content[i + 1] === "*") {
      const close = content.indexOf("*/", i + 2);
      if (close === -1 || close + 2 > end) return end;
      i = close + 2;
    } else {
      return i;
    }
  }
  return end;
}

function readStringLiteral(content: string, index: number): { value: string; end: number } | null {
  const quote = content[index];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  let value = "";
  for (let i = index + 1; i < content.length; i++) {
    const ch = content[i];
    if (ch === "\\") {
      value += content[i + 1] ?? "";
      i++;
    } else if (ch === quote) {
      return { value, end: i + 1 };
    } else {
      value += ch;
    }
  }
  return null;
}

/** Read the path argument: a string literal or an array of string literals. */
function readPathArgument(
  content: string,
  argStart: number,
  callEnd: number,
): { paths: string[]; end: number } | null {
  let i = skipInsignificant(content, argStart, callEnd);
  if (content[i] === "[") {
    const paths: string[] = [];
    i = skipInsignificant(content, i + 1, callEnd);
    while (i < callEnd && content[i] !== "]") {
      const literal = readStringLiteral(content, i);
      if (!literal) return null;
      paths.push(literal.value);
      i = skipInsignificant(content, literal.end, callEnd);
      if (content[i] === ",") i = skipInsignificant(content, i + 1, callEnd);
    }
    if (content[i] !== "]") return null;
    return { paths, end: i + 1 };
  }
  const literal = readStringLiteral(content, i);
  if (!literal) return null;
  return { paths: [literal.value], end: literal.end };
}

/**
 * Match a sub-router mount exactly: `router.use(subRouter)` or
 * `router.use("/prefix", subRouter)`. Path middleware chains such as
 * `router.use("/api/settings", authenticateUser, handler)` do not match.
 */
function readSubRouterMount(
  content: string,
  argStart: number,
  callEnd: number,
): { prefix: string; identifier: string } | null {
  let prefix = "";
  let i = skipInsignificant(content, argStart, callEnd);
  const literal = readStringLiteral(content, i);
  if (literal) {
    prefix = literal.value;
    i = skipInsignificant(content, literal.end, callEnd);
    if (content[i] !== ",") return null;
    i = skipInsignificant(content, i + 1, callEnd);
  }
  const identifierMatch = /^[A-Za-z_$][\w$]*/.exec(content.slice(i, callEnd));
  if (!identifierMatch) return null;
  i = skipInsignificant(content, i + identifierMatch[0].length, callEnd);
  if (content[i] === ",") i = skipInsignificant(content, i + 1, callEnd);
  if (i !== callEnd) return null;
  return { prefix, identifier: identifierMatch[0] };
}

/** Resolve a relative import specifier to a route module on disk, if any. */
function resolveLocalModule(fromDir: string, specifier: string): string | null {
  const base = path.resolve(fromDir, specifier);
  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
    if (candidate.startsWith(ROUTES_DIR + path.sep) && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Map each default-imported identifier to the local route module it names. */
function parseDefaultImports(filePath: string, content: string): Map<string, string> {
  const imports = new Map<string, string>();
  const importRe = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["'](\.[^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(content)) !== null) {
    const resolved = resolveLocalModule(path.dirname(filePath), match[2]);
    if (resolved) imports.set(match[1], resolved);
  }
  return imports;
}

const ROUTE_CALL_RE = /\brouter\.(get|post|put|patch|delete|use)\s*\(/g;
const INLINE_HANDLER_RE = /async\s*\(|\(\s*(?:_?req|_)\b|\bfunction\b/;
const MAX_SUBROUTER_DEPTH = 4;

function scanFile(
  filePath: string,
  mountBase: string,
  inheritedRouterAuth = false,
  visited: readonly string[] = [],
): RouteEntry[] {
  if (visited.includes(filePath) || visited.length >= MAX_SUBROUTER_DEPTH) return [];
  const content = fs.readFileSync(filePath, "utf8");
  const file = path.relative(ROUTES_DIR, filePath);
  const routerAuth =
    inheritedRouterAuth ||
    new RegExp(`router\\.use\\(\\s*(?:${AUTH_MIDDLEWARE.join("|")})`).test(content);
  const defaultImports = parseDefaultImports(filePath, content);
  const entries: RouteEntry[] = [];
  const callRe = new RegExp(ROUTE_CALL_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = callRe.exec(content)) !== null) {
    const openParen = match.index + match[0].length - 1;
    const argStart = openParen + 1;
    const callEnd = findCallEnd(content, openParen);
    // If the scanner cannot balance the call, bound it at the next declaration
    // so one unparseable route can never swallow the ones that follow it.
    const boundedEnd =
      callEnd !== -1
        ? callEnd
        : (() => {
            const rest = content.slice(argStart);
            const next = rest.search(new RegExp(ROUTE_CALL_RE.source));
            return next === -1 ? content.length : argStart + next;
          })();

    if (match[1] === "use") {
      const mount = readSubRouterMount(content, argStart, boundedEnd);
      const target = mount ? defaultImports.get(mount.identifier) : undefined;
      if (mount && target) {
        entries.push(
          ...scanFile(target, `${mountBase}${mount.prefix}`, routerAuth, [...visited, filePath]),
        );
      }
    } else {
      const pathArg = readPathArgument(content, argStart, boundedEnd);
      if (pathArg) {
        const chain = content.slice(pathArg.end, boundedEnd);
        const inlineHandlerAt = chain.search(INLINE_HANDLER_RE);
        const middlewareChain = inlineHandlerAt === -1 ? chain : chain.slice(0, inlineHandlerAt);
        for (const rawPath of pathArg.paths) {
          const fullPath = resolveFullPath(mountBase, rawPath);
          entries.push({
            file,
            method: match[1].toUpperCase(),
            rawPath,
            fullPath,
            mountBase,
            hasInlineAuth: AUTH_MIDDLEWARE.some((middleware) =>
              middlewareChain.includes(middleware),
            ),
            hasRouterAuth: routerAuth,
            hasRequirePermission: middlewareChain.includes("requirePermission"),
            hasRequirePlatformAdmin: middlewareChain.includes("requirePlatformAdmin"),
            allowReason: allowlistReason(fullPath),
            line: lineOf(content, match.index),
          });
        }
      }
    }

    if (callEnd !== -1) callRe.lastIndex = callEnd + 1;
  }

  return entries;
}

function resolveRouteFile(file: string): string {
  const direct = path.join(ROUTES_DIR, `${file}.ts`);
  if (fs.existsSync(direct)) return direct;
  return path.join(ROUTES_DIR, file, "index.ts");
}

function formatRbac(entry: RouteEntry): string {
  const tags: string[] = [];
  if (entry.hasRequirePlatformAdmin) tags.push("platform_admin");
  if (entry.hasRequirePermission) tags.push("permission");
  return tags.length ? tags.join("+") : "—";
}

/** Deterministic across Node/ICU builds, unlike localeCompare. */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeMarkdownForComparison(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n");
}

function main() {
  const mountTable = parseMountTable();
  const entries = [...mountTable.entries()]
    .flatMap(([file, mountBase]) => scanFile(resolveRouteFile(file), mountBase))
    .filter(
      (entry, index, all) =>
        all.findIndex(
          (candidate) =>
            `${candidate.file}:${candidate.method}:${candidate.fullPath}` ===
            `${entry.file}:${entry.method}:${entry.fullPath}`,
        ) === index,
    )
    .sort((a, b) => compareCodeUnits(a.file, b.file) || compareCodeUnits(a.fullPath, b.fullPath));

  const isProtected = (entry: RouteEntry) => entry.hasInlineAuth || entry.hasRouterAuth;
  const violations = entries.filter((entry) => !isProtected(entry) && !entry.allowReason);

  let markdown = "# Wireline Authorization Matrix (Auto-Generated)\n\n";
  markdown += "> Generated by `scripts/generate-authz-matrix.ts`. Do not edit by hand.\n\n";
  markdown +=
    "**Source:** canonical production route registry (`src/server/register-api-routes.ts`)\n\n";
  markdown += `**Routes scanned:** ${entries.length}\n`;
  markdown += `**Protected:** ${entries.filter(isProtected).length}\n`;
  markdown += `**Public (allowlisted):** ${entries.filter((entry) => !isProtected(entry) && entry.allowReason).length}\n`;
  markdown += `**Violations:** ${violations.length}\n\n`;
  markdown +=
    "## Public Allowlist (explicit security decisions)\n\n| Path | Reason |\n|------|--------|\n";
  for (const entry of entries.filter((item) => !isProtected(item) && item.allowReason)) {
    markdown += `| \`${entry.method} ${entry.fullPath}\` | ${entry.allowReason} |\n`;
  }
  markdown +=
    "\n## Full Matrix\n\n| File | Method | Path | Auth | RBAC | Public | Status |\n|------|--------|------|------|------|--------|--------|\n";
  for (const entry of entries) {
    const status = isProtected(entry)
      ? "Protected"
      : entry.allowReason
        ? "Public (allowlisted)"
        : "MISSING AUTH";
    const auth = entry.hasInlineAuth ? "inline" : entry.hasRouterAuth ? "router" : "—";
    markdown += `| ${entry.file} | ${entry.method} | \`${entry.fullPath}\` | ${auth} | ${formatRbac(entry)} | ${entry.allowReason ? "yes" : "—"} | ${status} |\n`;
  }

  const previousMarkdown = fs.existsSync(OUTPUT_FILE)
    ? normalizeMarkdownForComparison(fs.readFileSync(OUTPUT_FILE, "utf8"))
    : null;

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, markdown, "utf8");
  console.log(`AuthZ matrix written to ${path.relative(REPO_ROOT, OUTPUT_FILE)}`);
  console.log(
    `  scanned=${entries.length} protected=${entries.filter(isProtected).length} public=${entries.filter((entry) => !isProtected(entry) && entry.allowReason).length} violations=${violations.length}`,
  );

  if (violations.length) {
    console.error(
      "\nDefault-deny violation(s) — mounted route(s) with neither auth nor allowlist entry:",
    );
    for (const violation of violations) {
      console.error(
        `   ${violation.file}:${violation.line}  ${violation.method} ${violation.fullPath}`,
      );
    }
    process.exit(1);
  }

  if (previousMarkdown !== null && previousMarkdown !== markdown) {
    console.error(
      "\nAUTHZ_MATRIX.md is stale — regenerated docs/AUTHZ_MATRIX.md. Commit the updated matrix.",
    );
    process.exit(1);
  }

  console.log("Every mounted primary-API route is protected or explicitly allowlisted as public.");
}

main();
