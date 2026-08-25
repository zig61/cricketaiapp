# Milestone 03 — Player Profile

**Depends on:** [02-authentication-and-onboarding.md](./02-authentication-and-onboarding.md)
**Roadmap position:** [00-mvp.md](./00-mvp.md) #3

## Objective
Capture the minimal player profile (display name, DOB/age band, batting hand, playing level) required before any video can be submitted.

## Why It Matters
Batting hand drives correct CV mirroring downstream (see [/docs/07-computer-vision.md](../docs/07-computer-vision.md) §3); age band drives privacy defaults (already scaffolded in milestone 02); this data gates video submission per FR-02.

## Dependencies
Milestone 02 (needs an authenticated user to attach a profile to).

## Files Affected
- `apps/mobile/app/(onboarding)/profile-setup.tsx` ([/docs/09-ux-specification.md](../docs/09-ux-specification.md) §3)
- `apps/mobile/lib/profile/*`
- `supabase/migrations/*_profiles.sql` — `profiles` table + RLS policies ([/docs/04-database.md](../docs/04-database.md) §1/§5)

## Implementation Requirements
Covers FR-02, SR-PROF-001 ([/docs/02-software-requirements.md](../docs/02-software-requirements.md)):
- `profiles` table migration with RLS restricting read/write to `id = auth.uid()`.
- Profile Setup screen, resumable if the app is backgrounded mid-setup.
- Validation: all four fields required before first video submission is allowed (enforced both client-side and, ultimately, by the video-submission endpoint in milestone 04).

## Acceptance Criteria
All acceptance criteria for SR-PROF-001 in [/docs/02-software-requirements.md](../docs/02-software-requirements.md).

## Tests
- RLS policy test: a user cannot read/write another user's profile row.
- Form validation unit tests.
- E2E: sign up → profile setup → home.

## Definition of Done
Profile setup is required and enforced before video submission is reachable; RLS is verified by an automated test, not just code review; docs updated with any real deviation.
