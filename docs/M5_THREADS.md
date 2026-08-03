# Milestone 5 — Visit capture and thread store

## Shipped in M5

- **Visit capture** on tab create, update (URL change), activate, remove — one record per URL visit (SPA navigations create new visits).
- **Bootstrap** — on reconciliation, open tabs without an active visit record are registered (uses `lastAccessed` when available).
- **Entity key extraction** from titles and URLs (Jira keys, `github:org/repo`, Google Doc ids, allowlisted query params).
- **Entity-key threads** — one thread per primary entity key when a visit ends.
- **Session threads** — keyless visits in the same window within a 90-minute burst cluster together (labeled by hosts).
- **Durable storage** in `chrome.storage.local` (`visits:v1`, `threads:v1`) with caps and LRU eviction.
- **Alarm-driven cluster pass** every 15 minutes for ended visits not yet threaded; also runs on each reconciliation (bootstrap + backlog).
- **Threads debug view** in the side panel (last 7 days).

## Not in M5

- Salience filter / 90% drop
- Opener chain and focus-alternation weighting (M6)
- “What did I know about this?” button
- Automatic resurfacing nudges

## Verification

```bash
npm run lint
npm run test
```

Browse with the extension loaded, close tabs with Jira/GitHub URLs, open **Threads** tab.
