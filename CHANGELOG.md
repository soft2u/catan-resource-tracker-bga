# Changes

## 1.0.2 — 2026-11-12

- Establish a separate GitHub project from the supplied 1.0.1 Tampermonkey script.
- Keep resource panels for all players, unknown/stale indicators, and local JSON export.
- Mark contradictory resource snapshots stale, including nonzero resources with a zero total.
- Recalculate or invalidate an old total when a resource-only update arrives.
- Fall back to the legacy client if an incomplete GameModule is present.
- Remove old panels and observers if the game client disappears or changes tables.
- Restrict the waiting notice to recognizable CATAN game markup.
- Add tests, a simulated local demonstration, privacy documentation, and CI.

## 1.0.1 — supplied starting version

Initial received-counter userscript with legacy/GameModule client support,
freshness indicators, undo invalidation, and local export.
