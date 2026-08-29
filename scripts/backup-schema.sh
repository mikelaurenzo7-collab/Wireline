#!/usr/bin/env bash
# Supabase Schema Backup Script
#
# Exports the complete Supabase schema (tables, indexes, RLS policies, functions)
# to supabase_schema.sql. Run this before major migrations or as part of a
# pre-release checklist.
#
# Usage:
#   ./scripts/backup-schema.sh
#
# Prerequisites:
#   - POSTGRES_BACKUP_URL must be a Supabase direct/session URL on port 5432
#   - node and pg_dump must be installed

set -euo pipefail

if [ -z "${POSTGRES_BACKUP_URL:-}" ]; then
  echo "Error: POSTGRES_BACKUP_URL is not set"
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if ! node "${SCRIPT_DIR}/validate-postgres-backup-url.mjs"; then
  echo "Error: POSTGRES_BACKUP_URL must be an authenticated Supabase direct/session URL on port 5432 without TLS overrides"
  exit 1
fi

SUPABASE_DB_CA_FILE="${SUPABASE_DB_CA_FILE:-${SCRIPT_DIR}/../certs/supabase-root-2021.crt}"
if [ ! -f "$SUPABASE_DB_CA_FILE" ]; then
  echo "Error: Supabase root CA file is missing"
  exit 1
fi

echo "Backing up the configured BotBound schema..."

BACKUP_TARGET="${PWD}/supabase_schema.sql"
BACKUP_TMP_FILE=$(mktemp "${BACKUP_TARGET}.tmp.XXXXXX")
cleanup() {
  rm -f -- "$BACKUP_TMP_FILE"
}
trap cleanup EXIT HUP INT TERM

# Keep the credential out of command arguments and require authenticated TLS.
PGDATABASE="$POSTGRES_BACKUP_URL" \
PGSSLMODE="verify-full" \
PGSSLROOTCERT="$SUPABASE_DB_CA_FILE" \
PGGSSENCMODE="disable" \
pg_dump \
  --schema=public \
  --schema-only \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --file="$BACKUP_TMP_FILE"

# Preserve the last known-good backup unless pg_dump completes successfully.
mv -- "$BACKUP_TMP_FILE" "$BACKUP_TARGET"
trap - EXIT HUP INT TERM

echo "✓ Schema backed up to supabase_schema.sql ($(wc -l < "$BACKUP_TARGET") lines)"
echo ""
echo "Next steps:"
echo "  1. Review the schema file for unexpected changes"
echo "  2. Commit to version control if this is a migration checkpoint"
echo "  3. Test restore in a scratch project: ./scripts/restore-drill.md"
