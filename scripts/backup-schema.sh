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
#   - VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set
#   - psql must be installed (brew install postgresql or apt-get install postgresql-client)

set -euo pipefail

if [ -z "${VITE_SUPABASE_URL:-}" ]; then
  echo "Error: VITE_SUPABASE_URL is not set"
  exit 1
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY is not set"
  exit 1
fi

# Extract connection details from VITE_SUPABASE_URL
# Format: https://PROJECT_REF.supabase.co
PROJECT_REF=$(echo "$VITE_SUPABASE_URL" | sed -E 's|https://([^.]+)\.supabase\.co.*|\1|')

# Supabase Postgres connection (default port 6543 with pooler in transaction mode)
DB_HOST="db.${PROJECT_REF}.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"
DB_PASSWORD="$SUPABASE_SERVICE_ROLE_KEY"

echo "Backing up schema from ${DB_HOST}..."

# Use pg_dump to export schema only (no data)
PGPASSWORD="$DB_PASSWORD" pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --schema=public \
  --schema-only \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  > supabase_schema.sql

echo "✓ Schema backed up to supabase_schema.sql ($(wc -l < supabase_schema.sql) lines)"
echo ""
echo "Next steps:"
echo "  1. Review the schema file for unexpected changes"
echo "  2. Commit to version control if this is a migration checkpoint"
echo "  3. Test restore in a scratch project: ./scripts/restore-drill.md"
