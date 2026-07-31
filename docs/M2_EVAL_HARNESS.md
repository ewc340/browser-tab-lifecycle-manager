# Milestone 2 — Evaluation Harness

This document describes the test-first harness used to validate automated lifecycle
behavior before and during M2 implementation.

## Layers

| Layer | Location | What it validates |
| --- | --- | --- |
| **Unit — evaluator** | `src/tests/lifecycle/evaluator.test.ts` | Pure `evaluateTab()` decisions: PRD §30.1 cases plus M2 safety rails |
| **Unit — downtime** | `src/tests/lifecycle/downtime.test.ts` | Browser-closed time credited via `inactivityCreditMs` |
| **Orchestration** | `src/tests/lifecycle-sweep.test.ts` | Sweep lease, caps, re-fetch guards, report-only mode (fake chrome) |
| **Browser smoke** | `scripts/lifecycle-smoke-test.mjs` | Chrome CDP: fast lifecycle, pending-close visibility, report-only |

Run locally:

```bash
npm test                    # unit + orchestration
npm run build && npm run smoke
npm run build && node scripts/lifecycle-smoke-test.mjs
```

## Evaluator cases (PRD §30.1 + M2 additions)

1. Active tab never sleeps or closes.
2. Pinned / audible tabs never sleep or close automatically.
3. Locked background tab sleeps after threshold but never enters pending closure.
4. Unlocked tab enters `SCHEDULE_CLOSE` after close threshold.
5. Pending tab closes only after grace (`CLOSE` action).
6. Activation, lock, pause, snooze cancel pending closure.
7. Unavailable tab receives no lifecycle action.
8. Tab is not re-scheduled when already pending.
9. Sleeping tab can still enter pending closure.
10. Onboarding incomplete / automation paused → no automatic action.
11. Never-activated tab uses 14-day minimum close threshold.
12. Tab younger than 24 h is never closed.
13. 30-minute settling period suppresses closures after startup.
14. Per-sweep (10) and per-hour (25) closure caps defer with `skipReason`.
15. Per-sweep discard cap (50) defers sleep.
16. Host rules block closing and sleeping independently.
17. `keepLoaded` blocks sleeping but not closing.
18. Report-only mode records `WOULD_CLOSE` without `CLOSE`.
19. No `CLOSE` in the same evaluation as first `SCHEDULE_CLOSE`.

## Chrome smoke scenarios

The lifecycle smoke test (`scripts/lifecycle-smoke-test.mjs`) drives the built
extension with `DEV_FAST_LIFECYCLE` thresholds (1 / 2 / 1 minutes) and asserts:

- Background tab becomes discarded after sleep threshold.
- Pending-close state appears in storage with countdown fields.
- Report-only mode never removes tabs.
- Manual sweep via `RUN_LIFECYCLE_SWEEP` is idempotent under concurrent calls.

## DEV_FAST_LIFECYCLE

Development builds may apply `DEV_FAST_LIFECYCLE` from `shared/defaults.ts` when
`import.meta.env.DEV` is true. Production builds must never expose these thresholds.
