# /tests

Cross-cutting test assets that don't belong inside a single app/service package: E2E flow definitions (Maestro), golden video/landmark fixtures for CV testing, and shared test data — per the strategy in [/docs/12-testing.md](../docs/12-testing.md).

Package-local unit/integration tests live alongside their code (`apps/mobile`, `services/coordinator-api`, `services/cv-service`) once those exist, not here. Populated starting in roadmap milestone 01 ([/roadmap/01-project-foundation.md](../roadmap/01-project-foundation.md)) for CI scaffolding, with E2E flows and golden fixtures added by the milestones that introduce what they test.
