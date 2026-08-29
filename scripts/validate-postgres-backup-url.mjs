#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SECURITY_OVERRIDE_QUERY_KEYS = new Set(["gssencmode", "uselibpqcompat"]);

export function isValidSupabaseBackupUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  const isSupabase = hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.com");
  const hasTlsOverride = [...url.searchParams.keys()].some((key) => {
    const normalized = key.toLowerCase();
    return normalized.startsWith("ssl") || SECURITY_OVERRIDE_QUERY_KEYS.has(normalized);
  });

  return (
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    isSupabase &&
    Number(url.port || "5432") === 5432 &&
    Boolean(url.username && url.password && url.pathname.replace(/^\/+/, "")) &&
    !hasTlsOverride
  );
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain && !isValidSupabaseBackupUrl(process.env.POSTGRES_BACKUP_URL)) {
  process.exitCode = 1;
}
