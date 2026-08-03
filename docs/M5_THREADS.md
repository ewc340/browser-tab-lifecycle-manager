# Milestone 5 — Visit capture and thread store

## Shipped in M5

- **Visit capture** on tab create, update (URL change), activate, remove — one record per URL visit (SPA navigations create new visits).
- **Bootstrap** — on reconciliation and when refreshing Threads, open tabs without an active visit record are registered (uses `lastAccessed` when available).
- **Open tab visits** — shown in Threads while still open; threads form when tabs close.
- **Entity key extraction** from titles and URLs (Jira keys, `github:org/repo`, Google Doc ids, Reddit post ids, normalized search queries, allowlisted query params).
- **Entity-key threads** — one thread per primary entity key when a visit ends.
- **Session threads** — keyless visits in the same window within a 90-minute burst cluster together (labeled by hosts).
- **Durable storage** in `chrome.storage.local` (`visits:v1`, `threads:v1`) with caps and LRU eviction.
- **Alarm-driven cluster pass** every 15 minutes for ended visits not yet threaded; also runs on each reconciliation (bootstrap + backlog).
- **Threads debug view** in the side panel (last 7 days).

## Not in M5 (later milestones)

- **Cross-site topic threads** (e.g. “tennis” on Reddit + Google) — opener chain, query/title graph (M6)
- Salience filter / 90% drop
- Opener chain and focus-alternation weighting (M6)
- “What did I know about this?” button (M7)
- Automatic resurfacing nudges (M8)
- User merge/split threads (M10)

## Milestone exit checklist

- [x] Visit capture + durable store + alarm cluster pass
- [x] Entity-key and session threads
- [x] Threads debug UI (grouped by site)
- [x] Bootstrap open tabs + refresh capture
- [x] Side panel open/toggle on Chrome (native) and popup fallback (Arc)
- [ ] Dogfood on branch; merge PR to `main`
- [ ] Optional polish: thread rename, richer cross-site preview (defer to M6)

## Verification

```bash
npm run lint
npm run test
```

Browse with the extension loaded, close tabs with Jira/GitHub URLs, open **Threads** tab.
