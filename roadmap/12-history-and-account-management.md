# Milestone 12 — History & Account Management

**Depends on:** [11-progress-comparison-and-remeasurement.md](./11-progress-comparison-and-remeasurement.md)
**Roadmap position:** [00-mvp.md](./00-mvp.md) #12

## Objective
Build the History and Session Detail screens, Profile & Settings, and full account/data deletion, plus the automated retention-expiry job.

## Why It Matters
History is what makes the loop feel like ongoing development rather than a one-off gimmick (SR-HIST-001). Account deletion is a hard requirement (SR-DATA-001) — a privacy commitment that has to actually work, not just exist in a menu.

## Dependencies
Milestone 11 (a session isn't complete/meaningful in history until it includes an outcome).

## Files Affected
- `apps/mobile/app/(history)/*`, `(profile)/*` — History, Session Detail, Profile & Settings, Delete Account Confirmation ([/docs/09-ux-specification.md](../docs/09-ux-specification.md) §12–14)
- `services/coordinator-api/src/routes/players.ts` — `GET /players/me/history`, `DELETE /players/me`
- `services/coordinator-api/src/jobs/retention.ts` — automated retention-expiry job

## Implementation Requirements
Covers FR-14/15, SR-HIST-001, SR-DATA-001/002:
- Paginated (cursor-based) history endpoint and list UI.
- Session Detail screen reusing the Analysis Results / Comparison Result components in a read-only historic mode, per [/docs/09-ux-specification.md](../docs/09-ux-specification.md) §12.
- Profile & Settings screen; Delete Account Confirmation flow with explicit, deliberate confirmation.
- `DELETE /players/me`: full purge of Storage objects (not just unlinking) and Postgres rows via cascade, plus `auth.users` removal — orchestrated by the service role, not left to client-side RLS deletes.
- Automated job enforcing the 12-month landmark and 90-day job-log retention limits from [/docs/04-database.md](../docs/04-database.md) §6.

## Acceptance Criteria
All acceptance criteria for SR-HIST-001, SR-DATA-001/002; product acceptance criteria items 6–7 in [/docs/01-product-requirements.md](../docs/01-product-requirements.md) §7.

## Tests
- E2E: browse history, open a session detail.
- Deletion test: verify Storage objects and Postgres rows are actually removed (query/list check post-deletion), not soft-deleted.
- Retention job unit test: objects past their retention window are correctly identified and purged; objects within the window are untouched.

## Definition of Done
The complete MVP loop (all 7 acceptance criteria in [/docs/01-product-requirements.md](../docs/01-product-requirements.md) §7) is achievable end-to-end by a real player in staging, and account deletion is verified — not assumed — to actually remove all associated data.
