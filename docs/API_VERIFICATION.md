# API verification

Performance measurements for Milestone 4. Populate after running the 1500-tab profile generator.

| Metric | Target (PRD) | 500 tabs | 1500 tabs |
| --- | --- | --- | --- |
| `tabs.query` latency | — | _pending_ | _pending_ |
| First panel render | PERF-001 | _pending_ | _pending_ |
| Search latency | PERF-002 | _pending_ | _pending_ |
| Sweep duration | PERF-003 | _pending_ | _pending_ |
| `getBytesInUse` | — | _pending_ | _pending_ |

## How to measure

1. Generate a tab profile using the dev helper (TBD in M4 performance pass).
2. Load the extension unpacked and open the side panel.
3. Record timings from Chrome DevTools Performance and extension diagnostics.
