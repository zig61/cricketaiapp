# Milestone 02 — Authentication & Onboarding

**Depends on:** [01-project-foundation.md](./01-project-foundation.md)
**Roadmap position:** [00-mvp.md](./00-mvp.md) #2

## Objective
Implement account creation, sign-in, session management, and the onboarding flow — the gateway to every other feature.

## Why It Matters
Nothing else in the product is reachable without this, and getting it wrong (weak session handling, missing under-18 defaults) undermines the trust the whole product depends on. This is also the first milestone that exercises the Coordinator API's auth verification, which every later API-touching milestone reuses.

## Dependencies
Milestone 01 (repo/CI/Supabase foundation).

## Files Affected
- `apps/mobile/app/(onboarding)/*` — onboarding cards ([/docs/09-ux-specification.md](../docs/09-ux-specification.md) §1)
- `apps/mobile/app/(auth)/*` — Sign Up / Sign In (§2)
- `apps/mobile/lib/supabase.ts`, `apps/mobile/lib/auth/*`
- `services/coordinator-api/src/middleware/auth.ts` — JWT verification middleware (reused by every later Coordinator API milestone)

## Implementation Requirements
Covers FR-01 and SR-AUTH-001 through SR-AUTH-004 ([/docs/02-software-requirements.md](../docs/02-software-requirements.md)):
- Onboarding cards per [/docs/09-ux-specification.md](../docs/09-ux-specification.md) §1.
- Email/password sign-up with email verification gating video submission (not app access).
- Apple + Google OAuth sign-in.
- Session/token handling: ≤1hr access tokens, revocable refresh tokens.
- Age-band capture feeding `is_minor` and its default privacy posture (SR-AUTH-004).
- Coordinator API JWT verification middleware, built once here, reused by every later milestone's endpoints.

## Acceptance Criteria
All acceptance criteria for SR-AUTH-001 through SR-AUTH-004 in [/docs/02-software-requirements.md](../docs/02-software-requirements.md).

## Tests
- Unit tests: auth middleware token verification (valid, expired, malformed, revoked).
- E2E: onboarding → sign up → home, per [/docs/12-testing.md](../docs/12-testing.md) §3.
- Duplicate-email registration returns a non-enumerating error (§ SR-AUTH-001 acceptance criteria).

## Definition of Done
A real user can create an account via email or OAuth, the session persists across app restarts and is revocable, under-18 accounts get the correct default privacy posture, CI is green, and any deviation from this spec discovered during implementation is reflected back into the docs.
