# Known limitations

Headline limitations for v0.1.0. See `docs/QUESTIONS_AND_GAPS.md` for the full list.

1. **No native tab-strip indicators** — Lifecycle state (locked, pending close, snoozed) appears only in the side panel, not on Chrome’s tab bar. Sleeping tabs show Chrome’s native dimmed style only.

2. **Side panel on Chrome; popup sidebar on Arc** — Chrome uses the native side panel. Arc does not support embedded side panels; the manager opens in a docked popup window instead.

3. **Desktop Chrome only** — Manifest V3 desktop extension. No mobile, Firefox, or Safari support.

4. **Arc browser sidebar tabs** — Arc keeps many tabs in its sidebar without loading them into Chromium. Extensions only see tabs that Chromium has loaded. Unloaded Arc sidebar tabs do not appear until you switch to that Space and activate the tab. Other Chromium browsers are unaffected.

5. **No cloud sync** — All data stays in the local browser profile. No account, backup service, or cross-device sync.

6. **Heuristic lifecycle rules** — Automatic actions use inactivity timers and host rules, not page content. Related research tabs are not grouped or resurfaced automatically (see `docs/BACKLOG.md`).
