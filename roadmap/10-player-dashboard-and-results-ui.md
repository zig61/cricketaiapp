# Milestone 10 — Player Dashboard & Results UI

**Depends on:** [08-ai-coaching-explanation.md](./08-ai-coaching-explanation.md), [09-drill-library-and-prescription.md](./09-drill-library-and-prescription.md)
**Roadmap position:** [00-mvp.md](./00-mvp.md) #10

## Objective
Build the player-facing UI for the full first-pass loop — Home, Record Shot, Video Preview & Submit, Analysis In Progress, Video Rejected, Analysis Results, and Drill Detail — using the design system.

## Why It Matters
This is where the backend work from milestones 02–09 becomes an actual product experience. It has to meet the "premium, fast, simple, intelligent, trustworthy" bar from [/docs/00-product-vision.md](../docs/00-product-vision.md) §9, not just be functionally correct.

## Dependencies
Milestones 08 and 09 (the Home/Results screens need real explanation and drill data to render against).

## Files Affected
- `apps/mobile/app/(home)/*`, `(record)/*`, `(results)/*` — screens per [/docs/09-ux-specification.md](../docs/09-ux-specification.md) §4–10
- `apps/mobile/components/*` — shared component library (buttons, cards, inputs per [/docs/10-design-system.md](../docs/10-design-system.md) §4)
- `apps/mobile/theme/*` — design tokens as a theme (light/dark)

## Implementation Requirements
- Implement the design system's tokens (§1–3 of [/docs/10-design-system.md](../docs/10-design-system.md)) as a theme supporting both light and dark mode from the start.
- Build the reusable component library once (buttons, cards, inputs, badges, reference-range bar), used consistently across all screens rather than one-off per-screen styling.
- Implement Home, Record Shot, Video Preview & Submit, Analysis In Progress, Video Rejected, Analysis Results, and Drill Detail exactly per their state/error/loading/empty-state specifications in [/docs/09-ux-specification.md](../docs/09-ux-specification.md) §4–10.
- Wire every screen to its corresponding Coordinator API endpoint per [/docs/05-api.md](../docs/05-api.md).

## Acceptance Criteria
Matches acceptance criteria items 1–4 in [/docs/01-product-requirements.md](../docs/01-product-requirements.md) §7; every state/error/loading/empty state specified in [/docs/09-ux-specification.md](../docs/09-ux-specification.md) §4–10 is implemented, not just the happy path.

## Tests
- Component unit/snapshot tests for the shared library.
- E2E: Journey A ([/docs/01-product-requirements.md](../docs/01-product-requirements.md) §5) from sign-up through drill completion, per [/docs/12-testing.md](../docs/12-testing.md) §3.
- Accessibility checks against NFR-06 (contrast, text scaling, screen-reader labelling on primary actions).

## Definition of Done
A real player can complete the loop from recording through seeing their drill and marking it complete, end-to-end in staging, matching the design system in both light and dark mode.
