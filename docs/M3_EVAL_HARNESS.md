# Milestone 3 — Evaluation Harness

Test-first harness for trust, recovery, and explanation features.

## Layers

| Layer | Location | Validates |
| --- | --- | --- |
| **Unit — activity filters** | `src/tests/activity/filters.test.ts` | PRD §11.3 filter buckets |
| **Unit — activity index** | `src/tests/activity/index.test.ts` | Bucket keys, cursor encode/decode |
| **Unit — activity service** | `src/tests/activity/activity-service.test.ts` | Chunking (≤100/bucket), paging, retention caps |
| **Unit — recovery** | `src/tests/recovery/restore.test.ts` | Window selection, restore payload (pure) |
| **Unit — diagnostics** | `src/tests/diagnostics.test.ts` | Ring buffer, redaction, no full URLs |
| **Orchestration** | `src/tests/recovery-orchestration.test.ts` | Recovery-before-remove ordering contract |
| **Browser smoke** | `scripts/recovery-smoke-test.mjs` | Close → recovery list → restore tab in Chrome |

```bash
npm test
npm run build && npm run smoke && npm run smoke:recovery
```

## Exit criteria mapped to tests

1. Automatic closure always creates a recovery record before `tabs.remove`.
2. `activityEventId` back-reference can be repaired after SW crash.
3. Activity feed: newest first, filters, aggregate rows capped at 20 snapshots.
4. Restore targets original window when it exists, else current normal window.
5. Diagnostics payloads contain hostnames only (no full URLs) unless user opts in.
6. Retention trims oldest activity buckets and expired recovery records under quota pressure.
