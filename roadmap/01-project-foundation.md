# Milestone 01 — Project Foundation & Infrastructure

**Depends on:** none
**Roadmap position:** [00-mvp.md](./00-mvp.md) #1

## Objective
Stand up the repository structure, tooling, Supabase project(s), CI/CD, and environment separation so every later feature milestone has a stable, consistent base to build on.

## Why It Matters
Every downstream milestone assumes a working monorepo, a real Supabase project with RLS enabled, and CI that catches regressions. Skipping this or doing it inconsistently compounds into rework across every later milestone. This also establishes the local/staging/production environment separation required by [/docs/11-security.md](../docs/11-security.md) §3 (no player data in non-production environments).

## Dependencies
None — this is the first milestone.

## Files Affected
- Repo root: package manager workspace config, `tsconfig.base.json`, ESLint/Prettier config
- `apps/mobile/` — Expo/React Native app scaffold
- `services/coordinator-api/` — Node.js/TypeScript service scaffold
- `services/cv-service/` — Python (FastAPI) service scaffold
- `supabase/` — migrations directory, local Supabase config
- `.github/workflows/ci.yml`
- `.env.example` (per service)

## Implementation Requirements
- Initialise a monorepo layout separating `apps/mobile`, `services/coordinator-api`, `services/cv-service`, `supabase/` (per [/docs/03-system-architecture.md](../docs/03-system-architecture.md)).
- TypeScript project config, ESLint + Prettier, Vitest wired for the TS packages; `pytest` + linting (e.g. ruff) wired for the Python service.
- Create Supabase projects for local, staging, and production (§14 of [/docs/03-system-architecture.md](../docs/03-system-architecture.md)); Supabase CLI wired for local development and migrations.
- GitHub Actions CI: lint, typecheck, unit tests on every PR across all three packages.
- Secrets handling per [/docs/11-security.md](../docs/11-security.md) §8 — `.env.example` with placeholder keys only, real secrets injected via CI/deployment platform secret storage.
- Decide and record the final deployment target for the Coordinator API and CV microservice (Fly.io vs Render — open per [/docs/03-system-architecture.md](../docs/03-system-architecture.md) §14).

## Acceptance Criteria
- Fresh clone + install succeeds with no manual steps beyond documented setup.
- CI pipeline runs and passes on a scaffold-only PR.
- Local Supabase instance starts and applies migrations (even if the only migration so far is an empty baseline).
- Mobile app scaffold boots in a simulator/Expo Go showing a placeholder screen.
- Coordinator API and CV microservice scaffolds each expose a working health-check endpoint.

## Tests
- CI smoke test: build + lint + typecheck pass for all three packages.
- Health-check endpoint tests for the Coordinator API and CV microservice.

## Definition of Done
Repo scaffolding is merged, CI is green, all three app/service shells run locally and are deployed to a working staging environment, environment variables are documented in `.env.example` files, and no real secret is present anywhere in the repository history.
