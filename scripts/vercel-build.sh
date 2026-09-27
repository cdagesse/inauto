#!/usr/bin/env sh
# Production builds apply pending migrations before the new code is built, so a
# deploy never serves code that expects columns the database does not have yet.
# Preview builds skip this: they share the production database and must not
# apply migrations from unmerged branches. CI still runs migrations on merge to
# main as a second line of defence.
set -eu
if [ "${VERCEL_ENV:-}" = "production" ] && [ -n "${DATABASE_URL_UNPOOLED:-}${DATABASE_URL:-}" ]; then
  echo "vercel-build: applying migrations to production before build"
  pnpm db:migrate
else
  echo "vercel-build: skipping migrations (VERCEL_ENV=${VERCEL_ENV:-unset})"
fi
pnpm exec next build
