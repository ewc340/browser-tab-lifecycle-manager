# Milestone 4 — Evaluation Harness

Stabilization milestone: comprehensive tests, migration safety, CI, and documentation.

## Layers

| Layer | Location | Validates |
| --- | --- | --- |
| **Unit — PRD §30.1** | `src/tests/lifecycle/evaluator.test.ts` | All 20 evaluator cases + M2/M3 safety rails |
| **Property — invariants** | `src/tests/lifecycle/invariants.property.test.ts` | fast-check safety invariants (review F2) |
| **Unit — defaults** | `src/tests/defaults.test.ts`, `production-defaults.test.ts` | Shipped defaults, clamping, no dev thresholds in prod |
| **Unit — migrations** | `src/tests/migration/migration.test.ts` | Ordered idempotent migrations, backup, fail-safe |
| **Orchestration** | `src/tests/lifecycle-sweep.test.ts`, `recovery-orchestration.test.ts` | Sweep lease, close ordering, reconciliation helpers |
| **Browser smoke** | `scripts/smoke-test.mjs`, `lifecycle-smoke-test.mjs`, `recovery-smoke-test.mjs` | Chrome CDP regression suite |

```bash
npm test
npm run build && npm run smoke && npm run smoke:lifecycle && npm run smoke:recovery
```

## PRD §30.1 coverage map

| # | Case | Test file |
| --- | --- | --- |
| 1–16 | Core evaluator decisions | `evaluator.test.ts` |
| 17 | Failed action does not abort sweep | `lifecycle-sweep.test.ts` (orchestration) |
| 18 | Restore creates correct request | `recovery/restore.test.ts` |
| 19 | Activity retention | `activity/retention.test.ts` |
| 20 | URL normalization deterministic | `url-normalizer.test.ts` |

## M4 additions (plan §21–33)

Cases 21–33 are covered in `evaluator.test.ts` under "M2 safety rails" unless noted otherwise.

## Exit criteria (incremental)

- [x] M4 harness documented
- [x] Property tests for safety invariants
- [x] Migration framework with idempotency test
- [x] CI workflow (lint → test → build → verify → package)
- [x] Production defaults verification
- [ ] Playwright E2E (subset)
- [ ] 1500-tab performance profile + `docs/API_VERIFICATION.md`
- [ ] Full PRD §27 accessibility pass
- [ ] Manual test plan executed and recorded
