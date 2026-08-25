# Roadmap — MVP

**Status:** Draft v1
**Depends on:** [/docs/01-product-requirements.md](../docs/01-product-requirements.md), [/docs/02-software-requirements.md](../docs/02-software-requirements.md)

This roadmap breaks the MVP (defined in [/docs/01-product-requirements.md](../docs/01-product-requirements.md) §1 and bounded by the exclusions in §8) into small, sequential milestones, per the master development rule: **read docs → inspect implementation → plan → implement → test → lint/typecheck → fix → verify → update docs → report**, one milestone at a time. No application code is written as part of creating this roadmap — these files are a plan, not an implementation.

## Milestone Order & Dependency Chain

Milestones are ordered so each one only depends on milestones that precede it. Do not start a milestone before the previous one is stable (tests passing, verified, documentation updated).

| # | Milestone | Depends on | Delivers |
|---|---|---|---|
| 01 | [Project Foundation & Infrastructure](./01-project-foundation.md) | — | Repo scaffolding, Supabase project, CI/CD, environments |
| 02 | [Authentication & Onboarding](./02-authentication-and-onboarding.md) | 01 | FR-01; SR-AUTH-* |
| 03 | [Player Profile](./03-player-profile.md) | 02 | FR-02; SR-PROF-001 |
| 04 | [Video Capture & Upload](./04-video-capture-and-upload.md) | 03 | FR-03/04/05; SR-VID-* |
| 05 | [Video Processing Pipeline](./05-video-processing-pipeline.md) | 04 | Pipeline orchestration, job tracking; SR-VID-005 |
| 06 | [Pose Estimation & Technique Measurement](./06-pose-estimation-and-technique-measurement.md) | 05 | FR-06; SR-CV-* |
| 07 | [Coaching Engine — Diagnosis & Prioritisation](./07-coaching-engine-diagnosis-and-prioritisation.md) | 06 | FR-07/08; SR-COACH-001/002/003/004 |
| 08 | [AI Coaching Explanation](./08-ai-coaching-explanation.md) | 07 | FR-09; SR-COACH-005 |
| 09 | [Drill Library & Prescription](./09-drill-library-and-prescription.md) | 07 | FR-10/11; SR-COACH-006, SR-DRILL-* |
| 10 | [Player Dashboard & Results UI](./10-player-dashboard-and-results-ui.md) | 08, 09 | The full player-facing loop UI, screens 4–10 of [/docs/09-ux-specification.md](../docs/09-ux-specification.md) |
| 11 | [Progress Comparison & Re-measurement](./11-progress-comparison-and-remeasurement.md) | 10 | FR-12/13; SR-PROG-* |
| 12 | [History & Account Management](./12-history-and-account-management.md) | 11 | FR-14/15; SR-HIST-001, SR-DATA-* |
| 13 | [Threshold Calibration & Launch Readiness](./13-threshold-calibration-and-launch-readiness.md) | 01–12 | Coach-validated thresholds ([/docs/08-coaching-engine.md](../docs/08-coaching-engine.md) §9), legal review sign-off ([/docs/11-security.md](../docs/11-security.md) §9–11) |

Milestones 01–12 deliver a functioning MVP loop end-to-end. **Milestone 13 gates real launch** — the loop can be feature-complete and still not be honest to ship to real players until the thresholds it relies on have been validated (see [/docs/08-coaching-engine.md](../docs/08-coaching-engine.md) §9) and legal review of privacy/child-data handling is complete (see [/docs/11-security.md](../docs/11-security.md)).

## Explicitly Out of This Roadmap

Everything listed in [/docs/01-product-requirements.md](../docs/01-product-requirements.md) §8 (bowling/fielding/wicketkeeping, other shot types, ball tracking, match intelligence, coach dashboards, payments, social features, etc.) has no milestone here. If work on any of these is requested before milestone 13 is complete and stable, that's a scope conflict — raise it explicitly rather than silently accommodating it.

## How to Use These Milestone Files

Each milestone file follows the same structure: Objective, Why it matters, Dependencies, Files affected, Implementation requirements, Acceptance criteria, Tests, Definition of done. "Files affected" is necessarily approximate until the codebase exists (milestone 01) — later milestones' file lists should be treated as a starting estimate to refine at implementation time, not a rigid spec.
