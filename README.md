# browser-tab-lifecycle-manager

A Chrome (Manifest V3) extension that automatically manages tab clutter and memory use via sleeping
(discarding) and grace-period closure, with per-tab protection, a recoverable closure history, and a
transparent activity feed. Local-first: no accounts, no backend, no network calls, no telemetry.

**Status:** No code has been implemented yet. This repository currently contains the product
specification and a critical pre-implementation review:

- [`docs/PRD.md`](docs/PRD.md) — the source Product Requirements Document (v0.1 scope).
- [`docs/QUESTIONS_AND_GAPS.md`](docs/QUESTIONS_AND_GAPS.md) — a critical review of the PRD: internal
  contradictions, Chrome-API technical risks, Chrome Web Store distribution gaps, missing product
  decisions, and testing/rollout gaps, each phrased as a direct question with a recommended default.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — a concrete, milestone-by-milestone
  implementation plan (extending the PRD's own Milestones 0–4 with Milestone 5: Chrome Web Store
  readiness and Milestone 6: public release) that assumes the review's recommended defaults unless
  told otherwise, meant to be handed to a coding agent to execute.

Read `docs/QUESTIONS_AND_GAPS.md` first — several of its findings (e.g. a self-contradictory default-
settings object, an inactivity clock that would reset on every browser restart, and a mass-closure
hazard after long browser downtime) change how the MVP should be built, and the implementation plan
already assumes the recommended resolutions.
