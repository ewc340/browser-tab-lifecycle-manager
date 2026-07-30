# Decisions log

Authoritative answers to the open questions raised in [`QUESTIONS_AND_GAPS.md`](QUESTIONS_AND_GAPS.md).
Where this file disagrees with `IMPLEMENTATION_PLAN.md`, this file wins.

## Round 1 — pre-implementation (answered before Milestone 0)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Extension name | **Browser Tab Lifecycle Manager** for now. The name must be trivially changeable later, so it lives in exactly one place (`manifest.config.ts`, surfaced to the UI via `shared/strings.ts`) and is never hardcoded in components, docs strings, or storage keys. |
| 2 | Default `sleepAfterMinutes` | **60** (the PRD's original value, not the review's proposed 120), and user-customizable as the PRD already specifies. The review's data-loss concern is instead mitigated by the seeded `neverSleepHosts` list, the `keepLoaded` control, and explicit onboarding copy. |
| 3 | Does locking prevent sleeping? | **No — a locked tab may still auto-sleep** (the PRD's original semantics), but this is **customizable**: a per-tab `keepLoaded` toggle, plus a global setting `lockImpliesKeepLoaded` (default `false`) so a user who wants "lock means leave it completely alone" can have it. |
| 4 | Report-only (dry-run) closing for the first 7 days | **Yes, adopt it.** |
| 5 | Distribution | **Private / small-group initially** — packaged for the author and a few other people, not a public Chrome Web Store listing yet. The build must still produce a clean, reproducible `dist.zip` and stay policy-compliant so a public listing remains a decision, not a rewrite. Milestone 5's store-listing/legal work is therefore **deferred** (not deleted), and Milestone 6 collapses to stages 1–2 (self dogfood → a handful of trusted testers). |
| 6 | Diagnostics from third-party users | **Adopt the proposed design:** local, opt-in, hostname-redacted ring buffer with a copy-to-clipboard report and a visible payload preview. Zero network calls in any build. |
| 7 | `minimum_chrome_version` | **121** (up from the PRD's 116), because `tabs.Tab.lastAccessed` — which activity bootstrapping depends on — requires 121. |
| 8 | Deviating from the literal PRD | **Implementer's judgment**, provided every deviation stays documented in `IMPLEMENTATION_PLAN.md` §9 (per the PRD's own rule 14) and no deviation weakens a safety exclusion (rule 15). |

### Consequences for the plan

- `DEFAULT_SETTINGS.sleepAfterMinutes` is `60`, not `120`.
- `ExtensionSettings` gains `lockImpliesKeepLoaded: boolean` (default `false`).
- Milestone 5 is reduced to the parts needed for private distribution: reproducible packaging, the bundle
  audit, `KNOWN_LIMITATIONS.md`, and a privacy statement in the repo. Store account, trader status,
  listing copy, promo tiles, and screenshots move to a deferred "public listing" milestone.
- Everything else in `IMPLEMENTATION_PLAN.md` §2 stands as written.
