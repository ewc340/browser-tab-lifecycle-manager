# Changelog

All notable changes to Browser Tab Lifecycle Manager are documented here.

## [0.1.0] — Unreleased

### Added

- Side panel tab manager with search, filters, bulk actions, and virtualization
- Automatic tab sleeping (discard) and grace-period closure with recovery
- Activity feed with filters, paging, and export
- Recovery list with restore and lock-on-restore
- Diagnostics ring buffer and settings export/import
- Keyboard shortcut to open/toggle side panel (Alt+Shift+T)
- Context menu and command to lock tabs from automatic closure
- **Milestone 5:** Visit capture, entity-key threads, and Threads debug view (last 7 days)
- **Milestone 6:** Opener-chain topic threads, stale visit repair, OPEN/CLOSED status in Threads

### Safety

- Automation off until onboarding completes
- Report-only mode for observing would-close tabs
- Per-tab lock, snooze, keep-loaded, and host rules
- Rate limits on sweeps and hourly closures
