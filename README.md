# Sift

Talk to your data. Ask a question in plain English — Sift introspects the schema, generates SQL, runs it safely (read-only, sandboxed), and renders the chart plus the exact SQL it used.

## Monorepo layout

```
apps/
  web   Next.js (App Router, Tailwind v4) — chat UI, charts, transparency panel
  api   NestJS — schema introspection, SQL safety pipeline, sandboxed executor, LLM loop
packages/   shared code (added as needed)
```

Tooling: npm workspaces + Turborepo.

## Prerequisites

- Node 24 (`.nvmrc`)
- npm 11 (bundled with Node)

## Getting started

```bash
npm install
cp .env.example apps/web/.env.local
cp .env.example apps/api/.env        # then fill DATABASE_URL with your Neon URL
npm run dev
```

- web: http://localhost:3000
- api: http://localhost:3001 (health at `/health`)

## Scripts (run from the repo root)

| Command | What it does |
|---|---|
| `npm run dev` | Run web + api in watch mode (Turborepo) |
| `npm run build` | Build all apps |
| `npm run lint` | Lint all apps |
| `npm run typecheck` | Type-check all apps |

## Deployment

- **web** → Vercel (root directory `apps/web`)
- **api** → Render (root directory `apps/api`)
- **database** → Neon (Postgres + pgvector)

See the build spec for the full architecture and phased roadmap.
