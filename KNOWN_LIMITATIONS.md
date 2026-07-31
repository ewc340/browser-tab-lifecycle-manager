# Known limitations

Headline limitations for v0.1.0. See `docs/QUESTIONS_AND_GAPS.md` for the full list.

1. **No native tab-strip indicators** — Lifecycle state (locked, pending close, snoozed) appears only in the side panel, not on Chrome’s tab bar. Sleeping tabs show Chrome’s native dimmed style only.

2. **Side panel only** — The control center runs in Chrome’s side panel. Toolbar click and keyboard shortcut open it; there is no independent window mode.

3. **Desktop Chrome only** — Manifest V3 desktop extension. No mobile, Firefox, or Safari support.

4. **No cloud sync** — All data stays in the local browser profile. No account, backup service, or cross-device sync.

5. **Heuristic lifecycle rules** — Automatic actions use inactivity timers and host rules, not page content. Related research tabs are not grouped or resurfaced automatically (see `docs/BACKLOG.md`).
