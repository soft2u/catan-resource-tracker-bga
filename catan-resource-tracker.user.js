// ==UserScript==
// @name         CATAN Resource Tracker — Soft2U
// @namespace    https://catan.soft2u.ro/
// @version      1.0.2
// @description  Show resource totals received by the CATAN client beneath each player.
// @author       Soft2U
// @license      MIT
// @homepageURL  https://github.com/soft2u/catan-resource-tracker-bga
// @supportURL   https://github.com/soft2u/catan-resource-tracker-bga/issues
// @downloadURL  https://raw.githubusercontent.com/soft2u/catan-resource-tracker-bga/main/catan-resource-tracker.user.js
// @updateURL    https://raw.githubusercontent.com/soft2u/catan-resource-tracker-bga/main/catan-resource-tracker.user.js
// @match        https://boardgamearena.com/*
// @match        https://*.boardgamearena.com/*
// @run-at       document-start
// @sandbox      raw
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const RESOURCES = ['lumber', 'brick', 'wool', 'grain', 'ore'];
    const LABELS = ['Wood', 'Brick', 'Sheep', 'Wheat', 'Ore'];
    const ICONS = ['🌲', '🧱', '🐑', '🌾', '⛰️'];
    function count(value) {
        if (typeof value !== 'number' && typeof value !== 'string') return null;
        if (typeof value === 'string' && !/^\d+$/.test(value)) return null;
        const n = Number(value);
        return Number.isSafeInteger(n) && n >= 0 ? n : null;
    }

    class CounterStore {
        constructor() { this.players = new Map(); }
        player(id) {
            id = String(id);
            if (!/^\d+$/.test(id)) return null;
            if (!this.players.has(id)) this.players.set(id, {
                total: null, inconsistent: false,
                resources: Object.fromEntries(RESOURCES.map(key => [key, { value: null, fresh: false }]))
            });
            return this.players.get(id);
        }
        update(id, counters) {
            if (!counters || typeof counters !== 'object') return;
            const p = this.player(id);
            if (!p) return;
            const provided = RESOURCES.filter(key => count(counters[key]) !== null);
            const total = count(counters.resources);
            if (provided.length === 0 && total === null) return;
            p.inconsistent = false;
            // Total-only changes (e.g. a theft between other players) do not
            // identify which resource changed. Keep old values explicitly stale.
            if (total !== null && total !== p.total && provided.length === 0) {
                for (const r of Object.values(p.resources)) r.fresh = false;
            }
            for (const key of provided) p.resources[key] = { value: count(counters[key]), fresh: true };
            const providedSum = provided.reduce((n, key) => n + p.resources[key].value, 0);
            if (total !== null) p.total = total;
            if (total !== null && (providedSum > total || (provided.length === RESOURCES.length && providedSum !== total))) {
                // Conflicting snapshots cannot justify an exact hand. Preserve
                // the received values for inspection, explicitly marked stale.
                p.inconsistent = true;
                for (const r of Object.values(p.resources)) r.fresh = false;
            } else if (total === 0) {
                for (const key of RESOURCES) p.resources[key] = { value: 0, fresh: true };
            } else if (total !== null && RESOURCES.every(key => p.resources[key].fresh)) {
                const sum = RESOURCES.reduce((n, key) => n + p.resources[key].value, 0);
                if (sum !== total) {
                    for (const key of RESOURCES) if (!provided.includes(key)) p.resources[key].fresh = false;
                }
            } else if (total === null && provided.length > 0) {
                // A resource-only update makes the previous total obsolete.
                p.total = RESOURCES.every(key => p.resources[key].fresh)
                    ? RESOURCES.reduce((n, key) => n + p.resources[key].value, 0)
                    : null;
                if (p.total !== null && !Number.isSafeInteger(p.total)) {
                    p.total = null;
                    p.inconsistent = true;
                    for (const r of Object.values(p.resources)) r.fresh = false;
                }
            }
        }
        invalidate() {
            for (const p of this.players.values()) {
                p.total = null;
                p.inconsistent = false;
                for (const r of Object.values(p.resources)) r.fresh = false;
            }
        }
        reset() { this.players.clear(); }
        seed(players) {
            this.reset();
            for (const [id, data] of Object.entries(players || {})) this.update(id, data);
        }
        snapshot() { return JSON.parse(JSON.stringify(Object.fromEntries(this.players))); }
    }

    // Observation must never change the game's arguments, return values or errors.
    function observeMethod(target, key, after) {
        const original = target[key];
        if (typeof original !== 'function') return () => {};
        function wrapped(...args) {
            const result = original.apply(this, args);
            try { after(...args); } catch (error) { console.warn('[CATAN counters]', error); }
            return result;
        }
        target[key] = wrapped;
        return () => { if (target[key] === wrapped) target[key] = original; };
    }

    function resolveClient(gui) {
        // The October 2026 ESM client keeps CATAN methods on GameModule;
        // earlier Dojo releases put them directly on gameui.
        for (const target of [gui?.GameModule, gui]) {
            const data = target?.gamedatas || gui?.gamedatas;
            if (typeof target?.updatePlayerResources === 'function' && data?.map?.tiles && data?.players) {
                return { target, data };
            }
        }
        return null;
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = { CounterStore, observeMethod, resolveClient, RESOURCES };
        return;
    }
    if (window.__soft2uResourceCounters) return;
    window.__soft2uResourceCounters = true;

    const store = new CounterStore();
    let current = null, counterTarget = null, snapshotObject = null, cleanup = [], undoSubscription = null;
    let undoBus = null, currentTable = null;
    let scheduled = false;
    const style = `
      .s2u-counters{margin:9px 0 3px;padding:9px;border:1px solid #c3cbd5;border-radius:9px;background:#f6f8fc;color:#172539;font:12px/1.35 system-ui,sans-serif;box-sizing:border-box}
      .s2u-counter-head{display:flex;justify-content:space-between;gap:6px;align-items:center;margin-bottom:7px;font-size:10px;color:#536176}
      .s2u-counter-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
      .s2u-resource{display:flex;flex-direction:column;align-items:center;border-radius:6px;border:1px solid #d4dce6;background:#fff;padding:4px 0;min-width:0}
      .s2u-resource-icon{font-size:19px;line-height:24px}
      .s2u-resource-name{font-size:9px;color:#536176}
      .s2u-resource-value{font-size:17px;font-weight:750;font-variant-numeric:tabular-nums}
      .s2u-resource[data-fresh="false"]{background:#fff7e5;border-color:#e3c999;color:#79591b}
      .s2u-counter-note{font-size:10px;color:#6d5a36;margin-top:6px}
      .s2u-counter-export{margin-top:7px;background:#fff;color:#263e60;border:1px solid #c3cbd5;border-radius:4px;padding:3px 7px;font:10px system-ui;cursor:pointer}
    `;
    function element(tag, className, text) {
        const node = document.createElement(tag);
        node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function exportCounts() {
        const table = String(currentTable || new URL(location.href).searchParams.get('table') || 'unknown');
        const data = { version: 1, table, captured_at: new Date().toISOString(),
            meaning: 'Latest counters received by the client, not cumulative gains or guaranteed opponent hands. fresh=false means the last value may be outdated; inconsistent=true means received fields conflicted.',
            players: store.snapshot() };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const link = element('a', '');
        link.href = url;
        link.download = `catan-resource-counters-${table.replace(/[^\dA-Za-z_-]/g, '')}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function render() {
        scheduled = false;
        if (!current || !document.body) return;
        if (!document.getElementById('s2u-counter-style')) {
            const css = element('style', '', style);
            css.id = 's2u-counter-style';
            document.head.appendChild(css);
        }
        for (const [id, p] of store.players) {
            const parent = document.getElementById(`player_board_${id}`);
            if (!parent) continue;
            let box = document.getElementById(`s2u-counters-${id}`);
            if (!box) {
                box = element('section', 's2u-counters');
                box.id = `s2u-counters-${id}`;
                box.setAttribute('aria-label', 'Received resource counters');
                const head = element('div', 's2u-counter-head');
                head.append(element('span', '', 'Received counts'), element('span', 's2u-total'));
                const grid = element('div', 's2u-counter-grid');
                RESOURCES.forEach((key, i) => {
                    const chip = element('div', 's2u-resource');
                    chip.dataset.resource = key;
                    const icon = element('span', 's2u-resource-icon', ICONS[i]);
                    icon.setAttribute('aria-hidden', 'true');
                    chip.append(icon, element('span', 's2u-resource-name', LABELS[i]), element('span', 's2u-resource-value', '?'));
                    grid.append(chip);
                });
                box.append(head, grid, element('div', 's2u-counter-note'));
                if (id === String(current.player_id)) {
                    const button = element('button', 's2u-counter-export', 'Export counters');
                    button.type = 'button';
                    button.addEventListener('click', event => { event.stopPropagation(); exportCounts(); });
                    box.append(button);
                }
                parent.append(box);
            }
            box.querySelector('.s2u-total').textContent = `Total: ${p.total === null ? '?' : p.total}`;
            RESOURCES.forEach((key, i) => {
                const r = p.resources[key];
                const chip = box.querySelector(`[data-resource="${key}"]`);
                chip.dataset.fresh = String(r.fresh);
                chip.querySelector('.s2u-resource-value').textContent = r.value === null ? '?' : `${r.fresh ? '' : '~'}${r.value}`;
                chip.title = `${LABELS[i]}: ${r.value === null ? 'not received' : r.fresh ? `${r.value} (received total)` : `last received ${r.value}; current count unknown`}`;
            });
            box.querySelector('.s2u-counter-note').textContent = p.inconsistent
                ? 'Conflicting update · resource counts are uncertain'
                : RESOURCES.some(key => !p.resources[key].fresh) ? '? unknown · ~ last seen, may have changed' : '';
        }
    }
    function schedule() {
        if (!scheduled) { scheduled = true; requestAnimationFrame(render); }
    }
    function seed(data) {
        snapshotObject = data;
        store.seed(data.players);
        schedule();
    }
    function detach() {
        cleanup.forEach(fn => fn());
        cleanup = [];
        if (undoSubscription !== null && undoBus?.unsubscribe) undoBus.unsubscribe(undoSubscription);
        undoSubscription = null;
        undoBus = null;
        document.querySelectorAll('.s2u-counters').forEach(node => node.remove());
        store.reset();
        current = counterTarget = snapshotObject = currentTable = null;
    }
    function attach(gui, client) {
        detach();
        current = gui;
        counterTarget = client.target;
        currentTable = String(client.target.table_id || gui.table_id || '');
        seed(client.data);
        cleanup.push(observeMethod(counterTarget, 'updatePlayerResources', (id, counters) => {
            store.update(id, counters);
            schedule();
        }));
        cleanup.push(observeMethod(counterTarget, 'setup', data => seed(data)));
    }
    function waitingNotice(show) {
        let notice = document.getElementById('s2u-counter-waiting');
        if (!show) { if (notice) notice.remove(); return; }
        // Only the actual game frame, not the outer table page or other BGA pages.
        if (notice || !document.body || !document.getElementById('game_play_area') ||
            !(document.getElementById('cat_playerboard') || document.getElementById('cat_summary'))) return;
        notice = element('div', '', 'Resource counters: waiting for CATAN client…');
        notice.id = 's2u-counter-waiting';
        notice.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:10000;padding:8px 12px;background:#fff7e5;color:#644a19;border:1px solid #c8aa69;border-radius:6px;font:12px system-ui;pointer-events:none';
        document.body.append(notice);
    }
    function tick() {
        try {
            const gui = window.gameui;
            const client = resolveClient(gui);
            if (!client) {
                if (current) detach();
                waitingNotice(true);
                return;
            }
            waitingNotice(false);
            const table = String(client.target.table_id || gui.table_id || '');
            if (gui !== current || client.target !== counterTarget || table !== currentTable) attach(gui, client);
            else if (client.data !== snapshotObject) seed(client.data);
            if (undoSubscription === null && window.dojo?.subscribe) {
                undoBus = window.dojo;
                undoSubscription = undoBus.subscribe('undoRestorePoint', () => {
                    // Never reseed from a pre-undo snapshot. A subsequent full
                    // setup refresh or explicit counters can make values current.
                    store.invalidate();
                    schedule();
                });
            }
            // Also remount after BGA replaces a player's panel.
            schedule();
        } catch (error) { console.warn('[CATAN counters]', error); }
    }
    tick();
    setInterval(tick, 1000);
})();
