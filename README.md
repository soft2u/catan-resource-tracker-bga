# CATAN Resource Tracker for Board Game Arena

A separate Soft2U Tampermonkey userscript that shows the latest resource
counters received by the CATAN client beneath **every player's panel**.
Based on the existing CATAN received resource counters script, version 1.0.1.

It displays Wood, Brick, Sheep, Wheat, Ore, and the total resource count. It
does **not** calculate hands from public game logs or promise exact opponents'
hands. If the client has not received a count, it stays unknown.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Open **[Install the userscript](https://raw.githubusercontent.com/soft2u/catan-resource-tracker-bga/main/catan-resource-tracker.user.js)**
   and confirm installation in Tampermonkey.
3. Refresh your BGA CATAN page. Counters appear below each player's panel
   once a supported client is detected, including a game inside an iframe.

If the link opens as plain text, create a new script in Tampermonkey, replace
its content with `catan-resource-tracker.user.js`, save, and refresh the game.
Tampermonkey must be allowed to run userscripts on BGA. Page-context/CSP and
browser settings can affect compatibility.

The script includes update/download links to this repository. Updates are
managed by your userscript manager. This project is separate from
[Catan BGA Analyzer](https://github.com/soft2u/catan-board-analyzer-bga) and is
not a Chrome Web Store extension or part of that extension's store submission.

## Read the counters

| Display | Meaning |
| --- | --- |
| `4` | Latest received count, with no detected invalidating update. |
| `?` | This resource count has not been received. |
| `~4` | Last received value; the current amount is uncertain. |
| `Total: ?` | No reliable current total is available. |
| Conflicting update | Received fields disagree; resource values are marked stale. |

These are **current counter snapshots**, not cumulative resources earned.
An unknown-resource theft can change a total without identifying the resource.
Undo marks previous resource values stale until subsequent counters or a full
setup refresh replace them. Stale numbers are not presented as exact estimates.
On your own player panel, **Export counters** downloads a local JSON snapshot.

## What it reads and changes

The script reads `gameui.GameModule` (when available) or the legacy `gameui`,
initial player counter fields, and arguments passed to `updatePlayerResources`.
It observes `setup` and the supported `undoRestorePoint` event. It does not
read the game log or infer unreceived resource types. Client-received values
are not necessarily the same as information shown by BGA's standard UI.

It adds resource panels and wraps the client methods to observe them **after
the original methods run**, preserving their arguments, receiver, return
values, and synchronous errors. It does not submit moves, change game resource
values, play cards, automate actions, or send game data to another server.
The original BGA page is therefore augmented; it is not literally unmodified.

Use only where BGA and your table or event rules allow such assistance.
This unofficial project is not affiliated with or endorsed by Board Game
Arena, Catan GmbH, or CATAN Studio.

## Development and checks

No dependencies or build step are required. Use Node.js 22 or newer:

```sh
node --test tests/*.test.cjs
node --check catan-resource-tracker.user.js
```

Open `demo/index.html` to exercise four fictional players and simulated
counter changes. The demonstration uses no real BGA account or data. The
automated tests cover counter freshness and observation behavior; the demo
exercises the UI and lifecycle. A new live BGA integration test is still
required for each relevant client change. Undo support on other event buses
and browser/Tampermonkey compatibility are not universally verified.

If reporting an issue, describe the browser, userscript version, and steps.
Do not attach login cookies, tokens, private hands, or an unsanitized game dump.

See [privacy](PRIVACY.md), [changes](CHANGELOG.md), and [MIT license](LICENSE).
