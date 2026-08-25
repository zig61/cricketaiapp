# Milestone 04 — Video Capture & Upload

**Depends on:** [03-player-profile.md](./03-player-profile.md)
**Roadmap position:** [00-mvp.md](./00-mvp.md) #4

## Objective
Let a player record (or upload) a video, submit it, and see accurate processing status — including a fast, specific rejection when the footage isn't analysable.

## Why It Matters
This is the first half of the "OBSERVE" step in the core loop. Getting suitability validation right (SR-VID-004) matters more than it looks — a bad video silently entering the full CV pipeline wastes processing cost (NFR-08) and, worse, could produce a low-quality diagnosis if not caught. Note: the *full* CV suitability check depends on the pose-estimation work in milestone 06; this milestone ships a lighter heuristic (duration, resolution, basic angle/visibility check) sufficient to unblock the upload flow, refined once milestone 06 lands.

## Dependencies
Milestone 03 (a completed profile is required before submission, per FR-02).

## Files Affected
- `apps/mobile/app/(record)/record-shot.tsx`, `video-preview.tsx` ([/docs/09-ux-specification.md](../docs/09-ux-specification.md) §5–6)
- `apps/mobile/lib/camera/*`
- `services/coordinator-api/src/routes/videos.ts` — `POST /videos`, `POST /videos/:id/confirm-upload`, `GET /videos/:id`
- `supabase/migrations/*_videos.sql`, `*_processing_jobs.sql` ([/docs/04-database.md](../docs/04-database.md) §1)

## Implementation Requirements
Covers FR-03/04/05, SR-VID-001 through SR-VID-005 ([/docs/02-software-requirements.md](../docs/02-software-requirements.md)):
- `videos` and `processing_jobs` tables + RLS.
- Signed upload URL issuance; direct-to-Storage upload (video bytes never pass through the Coordinator API).
- Record Shot screen with framing overlay; upload-from-library alternative; Video Preview & Submit screen.
- Lightweight suitability heuristic (duration, resolution, coarse angle/visibility check) — full pose-based validation deferred to milestone 06.
- Processing status endpoint/subscription per SR-VID-005's finite status enum.

## Acceptance Criteria
All acceptance criteria for SR-VID-001 through SR-VID-005 in [/docs/02-software-requirements.md](../docs/02-software-requirements.md), scoped to the lightweight heuristic noted above.

## Tests
- Unit tests: signed upload URL scoping (single object, short expiry).
- Integration test: `confirm-upload` correctly transitions status to `validating`.
- E2E: record/upload → submit → status visibility, using a fixture video, per [/docs/12-testing.md](../docs/12-testing.md) §3.

## Definition of Done
A player can record or upload a video, see it move through defined statuses, and receive a specific rejection reason when unsuitable — verified end-to-end against a set of fixture videos (good and bad) in staging.
