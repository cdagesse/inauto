# InAuto working notes

- Toolchain: Node 22 via fnm, pnpm via corepack. Prefix one-off shells with `eval "$(/opt/homebrew/bin/brew shellenv)" && eval "$(fnm env --shell zsh)" && fnm use 22`.
- Before any commit: `pnpm typecheck && pnpm lint && pnpm test`. CI enforces zero lint warnings.
- Schema changes: edit `src/db/schema.ts`, run `pnpm db:generate`, commit the migration. Never hand-edit `drizzle/`.
- Every server action: `"use server"`, Zod-validate input, `requireUser()`, scope by user id in the WHERE clause, return `{ ok } | { ok: false, error }`.
- Third-party API calls (Visor, Old Cars Data) happen only in `src/jobs`, never in a request path. Store raw responses first. Respect the monthly budgets.
- The valuation engine (`src/lib/valuation/engine.ts`) is pure. The worked example in the spec is a unit test; do not change tunables in code, change `valuation_config`.
- Design tokens live in `src/app/globals.css`. Dark is the default; `data-theme="light"` opts in. Fonts: Archivo (display), Instrument Sans (body), IBM Plex Mono (numbers/labels).
- Reference material: `docs/reference/paddock-index-spec.md` and `docs/reference/gt3rs-prototype.html`.
