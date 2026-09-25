# InAuto

Collector and enthusiast car market data, a "what is my car worth" tool, and a safer way to buy and sell:
classifieds, auctions, invite-only private networks, a virtual garage, and buyer-protection services
(title vetting, condition reports, escrow later).

Dark-themed, built on Next.js 16 (App Router), Postgres (Neon via Vercel), Drizzle, Auth.js, Tailwind v4.

## Local development

```bash
# Node 22 via fnm, pnpm via corepack (pinned in package.json)
pnpm install
vercel link --project inauto            # once; then
vercel env pull .env.local              # pulls DATABASE_URL etc. from Vercel
# add AUTH_SECRET (openssl rand -base64 32), AUTH_DEV_LOGIN=true, JOBS_DRY_RUN=true to .env.local
pnpm db:migrate                         # apply ./drizzle migrations
pnpm db:seed                            # Porsche 911 GT3 RS catalog + fixture market data
pnpm dev
```

Sign in locally with the "Development sign-in" (any email) when `AUTH_DEV_LOGIN=true`. It is disabled in production by code, not just by config.

## Commands

| Command                                      | What it does                                                   |
| -------------------------------------------- | -------------------------------------------------------------- |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | What CI runs on every PR                                       |
| `pnpm test:integration`                      | Runs against `DATABASE_URL` (CI spins up Postgres 17)          |
| `pnpm db:generate`                           | Generate a migration from `src/db/schema.ts`                   |
| `pnpm db:migrate`                            | Apply migrations (CI applies to production on merge to `main`) |
| `pnpm jobs:nightly [--live]`                 | Run the market-data pipeline; dry run by default               |

## Architecture

- `src/app` routes. Market pages at `/{make}/{model}` are server-rendered and revalidated hourly.
- `src/lib/market` the `MarketSnapshot` shape every market page and the valuation engine consume. Currently fed by a frozen fixture; the nightly job will feed it from Postgres.
- `src/lib/valuation` pure, tested pricing engine (spec in `docs/reference/paddock-index-spec.md`). Same function powers the page tool, `POST /api/valuation`, and seller price guidance.
- `src/server` server actions and data access. Every mutation validates with Zod, requires a session, and scopes queries by user id.
- `src/jobs` + `src/lib/sources` nightly pull/normalize/clean/aggregate pipeline with raw-response storage and monthly API budgets. See `docs/pipeline.md`.
- `src/db/schema.ts` single source of truth for the database.

## Security posture

- Secrets only in Vercel env (sensitive) and `.env.local`; validated at boot by `src/env/server.ts`; `server-only` guards.
- Strict security headers and CSP in `next.config.ts`.
- Vercel WAF: managed rulesets plus per-IP rate limits on `/api/valuation`, `/api/auth`, server actions, and a hard deny on `/api/jobs/*` without a bearer.
- Cron route checks `CRON_SECRET` with a constant-time compare.
- JWT sessions (no DB hit per request); pooled Neon connections with small per-instance pools.
- Invite tokens stored hashed, single-use, expiring. Bids run in a transaction with a row lock.

## Deploy

Push to `main` deploys production; PRs get preview URLs (Vercel Git integration). GitHub Actions runs typecheck, lint, unit tests, build, then migrations + integration tests against a real Postgres, and finally applies migrations to production (`production` environment secret `DATABASE_URL_UNPOOLED`).

## Licensing gate

Before any market page is public, confirm in writing that Visor's and Old Cars Data's terms allow display on a commercial site. Until then keep pages `noindex` or behind login (see spec section 1).
