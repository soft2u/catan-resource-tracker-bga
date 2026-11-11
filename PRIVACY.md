# Privacy — CATAN Resource Tracker

Version 1.0.2 · 12 November 2026

This Tampermonkey userscript runs on Board Game Arena pages. On a supported
CATAN game it reads player identifiers and resource counter fields already
received by the game's client, plus the current table identifier. Only five
resource counters, their freshness, and a total are kept in the tracker's
in-memory store. Player identifiers locate the corresponding player panels.

The script does not make network requests, upload telemetry, use an analytics
SDK, read login cookies, or save counters in localStorage, IndexedDB, or a
remote service. Reloading or closing the page clears its in-memory store.
The ordinary BGA page still makes its own requests independently.

Choosing **Export counters** creates a JSON download containing player IDs,
the table ID, capture time, counts, and freshness/inconsistency flags. The
download stays on your device unless you choose to share it. Those identifiers
can connect the export to a BGA table and its players; it is not anonymous.
Delete the downloaded file if you no longer want to retain it.

Tampermonkey may contact GitHub to check or download script updates according
to its own settings. Those are userscript-manager requests, separate from the
tracker's operation. GitHub, Tampermonkey, and BGA have their own privacy terms.

Disabling/removing the userscript and refreshing BGA removes its page panels
and stops observation. It does not change BGA's own account or game records.

Contact: nechifor.vasile.nicusor@gmail.com. For code issues use
https://github.com/soft2u/catan-resource-tracker-bga/issues.
