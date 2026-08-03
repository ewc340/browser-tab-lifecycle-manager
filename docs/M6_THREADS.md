# Milestone 6 — Topic threads and visit hygiene

## Shipped in M6

- **Opener-chain topic threads** — a visit opened from another tab joins the opener's thread when within the session gap (e.g. Google search → Reddit result → one `topic` thread).
- **`openerVisitId`** on visit records — resolved from the opener tab's active visit at capture time.
- **Stale open visit repair** — visits without `endedAt` whose tab no longer exists are closed on reconcile/refresh; bootstrap reuses existing open visit per tab instead of duplicating after SW restart.
- **Threads UI** — OPEN/CLOSED status badges; auto-refresh on tab close via `APP_STATE_CHANGED`.

## Not in M6

- Focus-alternation weighting and hub/ambient host IDF
- Salience filter / 90% drop
- User merge/split threads (M10)
- Automatic resurfacing nudges (M8)

## Verification

```bash
npm run lint
npm run test
```

1. Search Google for a topic, open a result in a new tab, close both — one topic thread with both hosts.
2. Close a tab from the panel — it disappears from Open visits and appears under ended threads only.
