# Sift — talk to your data

Ask a question in plain English. Sift introspects your database schema, generates SQL with an LLM, runs it **safely** (read-only, sandboxed, timed out), and renders the answer as a chart alongside the exact SQL, a confidence signal, and the token cost.

> Two things make this more than a "text-to-SQL" toy: a **multi-layer SQL safety pipeline** that treats the model as untrusted, and **retrieval-augmented generation** that makes accuracy climb with use.

---

## What it does

- **Natural language → SQL → chart.** Streamed end to end (status → SQL → result) over SSE.
- **Bring your own database.** Paste a Postgres URL; Sift introspects it and you can query it immediately. Connection strings are **never persisted** — they live in memory for the session only and are wiped on logout.
- **Schema ER diagram.** An interactive (zoom/pan) diagram built straight from introspection — no LLM.
- **Gets smarter with use.** Thumbs-up an answer and its question→SQL pair is embedded into pgvector and retrieved as a few-shot example for similar future questions.
- **Transparent by default.** Every answer shows the SQL, confidence, provider, token count, latency, row count, and how many retrieved examples were used.

## Architecture

```
Next.js (Vercel)                NestJS API (Render)                 Postgres + pgvector (Neon)
  chat UI, charts,   ──HTTP/SSE──►  auth · introspection      ──►  app data (users, chats, queries,
  transparency panel               SQL safety pipeline             embeddings)
                                    sandboxed executor         ──►  demo analytics schema (read-only role)
                                    LLM loop + self-correction
                                    RAG (local embeddings)     ◄──  LLM provider (Groq / Gemini, OpenAI-compatible)
```

## The SQL safety pipeline (the headline)

The model is treated as an untrusted SQL source. Every generated query passes through, in order:

1. **AST parse** (`node-sql-parser`) — reject anything that doesn't parse.
2. **Single statement only** — no stacked queries.
3. **SELECT-only, recursively** — a walk of the AST rejects any DML/DDL, including DML hidden inside a CTE.
4. **Function denylist** — `pg_sleep`, `pg_read_file`, `lo_export`, `dblink`, …
5. **LIMIT by wrapping** — `SELECT * FROM (<query>) AS _sift_capped LIMIT 1000`.

Then execution is sandboxed: a per-request transaction with `SET TRANSACTION READ ONLY`, `SET LOCAL statement_timeout`, a locked `search_path`, and (for the demo dataset) `SET LOCAL ROLE copilot_ro` — a `NOLOGIN`, SELECT-only role. All settings are transaction-local, so they're safe over PgBouncer.

**Defense in depth:** user-supplied database URLs are checked against an SSRF guard (DNS resolve → reject loopback/private/link-local/metadata ranges) before Sift ever dials them.

## RAG + the feedback loop

Schema chunks (one per table) and up-voted question→SQL pairs are embedded **locally** with `bge-small-en-v1.5` (384-dim, in-process via `@huggingface/transformers` — no API, no quota, no per-query cost) and stored in **pgvector** with an HNSW cosine index. On each question, the top-k nearest are retrieved and injected as few-shot examples.

### Evaluation

`npm run eval` boots the real DI container and measures **execution accuracy** — it runs each generated query and compares the result set to a reference query, with and without retrieval.

| Model | Baseline | + RAG |
|---|---|---|
| `llama-3.3-70b` (default) | 100% | 100% |
| `llama-3.1-8b-instant` | 80% | **90%** |

On a clean schema a large model is already saturated; retrieval's value shows where there's headroom — it lets a **cheaper, smaller model** close the gap. Reproduce with `EVAL_MODEL=llama-3.1-8b-instant npm run eval`.

## Abuse & cost controls

- Per-IP rate limiting (`@nestjs/throttler`), with a tighter limit on the ask endpoints.
- A global **daily LLM ceiling** that fails gracefully ("demo has reached its daily limit") instead of burning the whole provider quota.
- Bounded question length; guests are scoped to the demo dataset only.

## Tech stack

Next.js 16 (App Router, Tailwind v4) · NestJS 11 · Prisma 6 · PostgreSQL + pgvector (Neon) · `@huggingface/transformers` (local embeddings) · Groq / Gemini (OpenAI-compatible LLMs) · Recharts · Mermaid · npm workspaces + Turborepo.

## Monorepo layout

```
apps/
  web   Next.js — chat UI, charts, ER diagram, transparency panel
  api   NestJS — introspection, SQL safety, sandboxed executor, LLM loop, RAG
```

## Local development

```bash
npm install
cp .env.example apps/web/.env.local          # NEXT_PUBLIC_API_URL
cp apps/api/.env.example apps/api/.env        # fill DATABASE_URL / DIRECT_URL + an LLM key
npm run db:seed:demo -w api                   # seed the demo e-commerce dataset
npm run dev
```

- web: http://localhost:3000 · api: http://localhost:3001 (health at `/health`)

Requires Node 24 (`.nvmrc`) and a Neon Postgres database with the `vector` extension available.

## Scripts (repo root unless noted)

| Command | What it does |
|---|---|
| `npm run dev` | web + api in watch mode |
| `npm run build` / `lint` / `typecheck` | all apps |
| `npm run db:seed:demo -w api` | seed the demo analytics dataset |
| `npm run eval -w api` | run the offline execution-accuracy eval |

## Deployment

- **Database** → Neon (Postgres + pgvector). Run `prisma migrate deploy` once to create tables, the `vector` extension, and the HNSW index.
- **API** → Render, from `render.yaml` (Blueprint). Set `DATABASE_URL`, `DIRECT_URL`, and at least one LLM key in the dashboard. Free instances have limited RAM — if the local embedding model is tight, use a paid instance or a hosted embedding provider.
- **Web** → Vercel, root directory `apps/web`, with `NEXT_PUBLIC_API_URL` pointing at the Render URL.

## Build phases

Built in phases, each ending at something testable: rails → data model + auth → schema introspection → **SQL safety pipeline (before any LLM)** → sandboxed executor + auto-viz → LLM loop → self-correction → streaming chat UI (shippable MVP) → **RAG** → eval, abuse controls, and deploy.
