const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CounterStore, observeMethod, resolveClient, RESOURCES,
} = require('../catan-resource-tracker.user.js');

function exact(total = 5) {
  return { lumber: 1, brick: 1, wool: 1, grain: 1, ore: 1, resources: total };
}

function player(store, id = '7') {
  return store.snapshot()[id];
}

function allFresh(p) {
  return RESOURCES.every(key => p.resources[key].fresh);
}

function assertNoFreshContradiction(p) {
  if (p.total !== null && allFresh(p)) {
    assert.equal(
      RESOURCES.reduce((sum, key) => sum + p.resources[key].value, 0),
      p.total,
      'a known total must agree with resources presented as fully current',
    );
  }
}

test('a public total alone does not invent a resource breakdown', () => {
  const store = new CounterStore();
  store.update('7', { resources: 8 });
  const p = player(store);
  assert.equal(p.total, 8);
  for (const key of RESOURCES) {
    assert.deepEqual(p.resources[key], { value: null, fresh: false });
  }
});

test('valid integer strings are accepted without modifying the source packet', () => {
  const store = new CounterStore();
  const packet = Object.freeze({ lumber: '2', brick: '0', resources: '2' });
  store.update('7', packet);
  assert.deepEqual(player(store).resources.lumber, { value: 2, fresh: true });
  assert.deepEqual(player(store).resources.brick, { value: 0, fresh: true });
  assert.equal(player(store).total, 2);
  assert.equal(packet.lumber, '2');
});

test('invalid counts cannot become current counters', () => {
  for (const invalid of [-1, 0.5, Infinity, NaN, true, {}, [], '', ' 2', '2 ', '2.5', '-1', '1e2', Number.MAX_SAFE_INTEGER + 1]) {
    const store = new CounterStore();
    store.update('7', { lumber: invalid, resources: invalid });
    assert.deepEqual(player(store).resources.lumber, { value: null, fresh: false });
    assert.equal(player(store).total, null);
  }
});

test('invalid player identifiers and non-object packets do not add players', () => {
  const store = new CounterStore();
  for (const id of ['other-player', '-2', '1.2', '__proto__']) store.update(id, exact());
  for (const packet of [null, undefined, 3, 'text']) store.update('7', packet);
  assert.deepEqual(store.snapshot(), {});
});

test('a complete consistent snapshot records all five current resources', () => {
  const store = new CounterStore();
  store.update(7, exact());
  assert.equal(player(store).total, 5);
  assert.equal(allFresh(player(store)), true);
  assertNoFreshContradiction(player(store));
});

test('a changed total without a breakdown makes every last seen resource stale', () => {
  const store = new CounterStore();
  store.update('7', exact());
  store.update('7', { resources: 6 });
  const p = player(store);
  assert.equal(p.total, 6);
  for (const key of RESOURCES) assert.deepEqual(p.resources[key], { value: 1, fresh: false });
});

test('repeating an unchanged total does not discard a consistent snapshot', () => {
  const store = new CounterStore();
  store.update('7', exact());
  store.update('7', { resources: 5 });
  assert.equal(allFresh(player(store)), true);
});

test('partial packets identify only the resource values actually supplied', () => {
  const store = new CounterStore();
  store.update('7', { grain: 2, resources: 4 });
  const p = player(store);
  assert.deepEqual(p.resources.grain, { value: 2, fresh: true });
  for (const key of RESOURCES.filter(key => key !== 'grain')) {
    assert.deepEqual(p.resources[key], { value: null, fresh: false });
  }
});

test('a partial update inconsistent with old details invalidates omitted details', () => {
  const store = new CounterStore();
  store.update('7', exact());
  store.update('7', { grain: 2, resources: 5 });
  const p = player(store);
  assert.deepEqual(p.resources.grain, { value: 2, fresh: true });
  for (const key of RESOURCES.filter(key => key !== 'grain')) assert.equal(p.resources[key].fresh, false);
});

test('a contradictory complete payload is never displayed as fully current', () => {
  const store = new CounterStore();
  store.update('7', { lumber: 2, brick: 2, wool: 2, grain: 2, ore: 2, resources: 3 });
  assertNoFreshContradiction(player(store));
  assert.equal(allFresh(player(store)), false);
  assert.equal(player(store).inconsistent, true);
});

test('a zero total conflicting with positive supplied counts is not silently trusted', () => {
  const store = new CounterStore();
  store.update('7', { lumber: 2, resources: 0 });
  assert.equal(allFresh(player(store)), false);
  assertNoFreshContradiction(player(store));
  assert.equal(player(store).inconsistent, true);
  assert.deepEqual(player(store).resources.lumber, { value: 2, fresh: false });
});

test('a resource-only update recomputes a total when the full breakdown is current', () => {
  const store = new CounterStore();
  store.update('7', exact());
  store.update('7', { lumber: 2 });
  assertNoFreshContradiction(player(store));
  assert.equal(player(store).total, 6);
});

test('a resource-only update clears a total when the rest of the hand is unknown', () => {
  const store = new CounterStore();
  store.update('7', { resources: 5 });
  store.update('7', { lumber: 2 });
  assert.equal(player(store).total, null);
  assert.equal(player(store).resources.lumber.fresh, true);
});

test('provided partial counts exceeding the total mark the entire snapshot inconsistent', () => {
  const store = new CounterStore();
  store.update('7', { lumber: 3, grain: 2, resources: 4 });
  assert.equal(player(store).inconsistent, true);
  for (const key of RESOURCES) assert.equal(player(store).resources[key].fresh, false);
});

test('a fresh complete valid update recovers from contradictory data', () => {
  const store = new CounterStore();
  store.update('7', { lumber: 3, resources: 2 });
  assert.equal(player(store).inconsistent, true);
  store.update('7', exact());
  assert.equal(player(store).inconsistent, false);
  assert.equal(allFresh(player(store)), true);
  assertNoFreshContradiction(player(store));
});

test('a non-contradictory zero total establishes an empty hand', () => {
  const store = new CounterStore();
  store.update('7', exact());
  store.update('7', { resources: 0 });
  const p = player(store);
  assert.equal(p.total, 0);
  for (const key of RESOURCES) assert.deepEqual(p.resources[key], { value: 0, fresh: true });
});

test('undo invalidation preserves historical values but clears their freshness and total', () => {
  const store = new CounterStore();
  store.update('7', exact());
  store.invalidate();
  const p = player(store);
  assert.equal(p.total, null);
  for (const key of RESOURCES) assert.deepEqual(p.resources[key], { value: 1, fresh: false });
});

test('a post-undo total cannot revive a pre-undo resource breakdown', () => {
  const store = new CounterStore();
  store.update('7', exact());
  store.invalidate();
  store.update('7', { resources: 5 });
  for (const key of RESOURCES) assert.equal(player(store).resources[key].fresh, false);
  store.update('7', { grain: 2, resources: 6 });
  assert.deepEqual(player(store).resources.grain, { value: 2, fresh: true });
  for (const key of RESOURCES.filter(key => key !== 'grain')) assert.equal(player(store).resources[key].fresh, false);
});

test('undo invalidation clears a previous contradiction without making counts current', () => {
  const store = new CounterStore();
  store.update('7', { lumber: 3, resources: 2 });
  assert.equal(player(store).inconsistent, true);
  store.invalidate();
  assert.equal(player(store).inconsistent, false);
  assert.equal(player(store).total, null);
  assert.equal(allFresh(player(store)), false);
});

test('full setup seeding replaces players and stale state from a previous game', () => {
  const store = new CounterStore();
  store.update('7', exact());
  store.invalidate();
  store.seed({ 9: { resources: 0 }, 10: { lumber: 2, resources: 3 } });
  assert.deepEqual(Object.keys(store.snapshot()), ['9', '10']);
  assert.equal(allFresh(player(store, '9')), true);
  assert.equal(player(store, '10').resources.lumber.value, 2);
  store.reset();
  assert.deepEqual(store.snapshot(), {});
});

test('export snapshots are detached from the live store', () => {
  const store = new CounterStore();
  store.update('7', exact());
  const snapshot = store.snapshot();
  snapshot['7'].resources.ore.value = 999;
  snapshot['7'].total = 999;
  delete snapshot['7'].resources.lumber;
  assert.deepEqual(player(store).resources.ore, { value: 1, fresh: true });
  assert.equal(player(store).total, 5);
  assert.ok(player(store).resources.lumber);
});

test('method observation preserves this, argument identity, return identity, and call order', () => {
  const packet = { lumber: 2 };
  const returned = {};
  const calls = [];
  const target = {
    token: 'context',
    update(id, counters) {
      assert.equal(this.token, 'context');
      assert.strictEqual(counters, packet);
      calls.push(['original', id]);
      return returned;
    },
  };
  const original = target.update;
  const cleanup = observeMethod(target, 'update', (id, counters) => {
    assert.strictEqual(counters, packet);
    calls.push(['observer', id]);
  });
  assert.strictEqual(target.update('7', packet), returned);
  assert.deepEqual(calls, [['original', '7'], ['observer', '7']]);
  cleanup();
  assert.strictEqual(target.update, original);
});

test('an original exception propagates unchanged and does not produce a counter update', () => {
  const error = new Error('game method failed');
  let observed = 0;
  const target = { update() { throw error; } };
  observeMethod(target, 'update', () => observed++);
  assert.throws(() => target.update(), thrown => thrown === error);
  assert.equal(observed, 0);
});

test('observer errors cannot replace the game method result', () => {
  const returned = {};
  const error = new Error('counter rendering failed');
  const warnings = [];
  const oldWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const target = { update: () => returned };
    observeMethod(target, 'update', () => { throw error; });
    assert.strictEqual(target.update(), returned);
    assert.equal(warnings.length, 1);
    assert.strictEqual(warnings[0][1], error);
  } finally {
    console.warn = oldWarn;
  }
});

test('observation does not replace a returned promise', async () => {
  const promise = Promise.resolve('done');
  const target = { update: () => promise };
  observeMethod(target, 'update', () => {});
  assert.strictEqual(target.update(), promise);
  assert.equal(await promise, 'done');
});

test('cleanup is idempotent and does not remove a subsequently installed game method', () => {
  const target = { update() {} };
  const cleanup = observeMethod(target, 'update', () => {});
  const replacement = () => 'new client';
  target.update = replacement;
  cleanup();
  cleanup();
  assert.strictEqual(target.update, replacement);
});

test('observing an unavailable method is a no-op', () => {
  const target = { update: 7 };
  const cleanup = observeMethod(target, 'update', () => assert.fail('must not be called'));
  cleanup();
  assert.equal(target.update, 7);
});

function gameData() {
  return { map: { tiles: [{ resource: 'lumber' }] }, players: { 7: { resources: 0 } } };
}

test('legacy Dojo clients resolve directly from gameui', () => {
  const gui = { updatePlayerResources() {}, gamedatas: gameData() };
  const client = resolveClient(gui);
  assert.strictEqual(client.target, gui);
  assert.strictEqual(client.data, gui.gamedatas);
});

test('ESM clients resolve methods and state from GameModule', () => {
  const module = { updatePlayerResources() {}, gamedatas: gameData() };
  const gui = { GameModule: module, gamedatas: gameData() };
  const client = resolveClient(gui);
  assert.strictEqual(client.target, module);
  assert.strictEqual(client.data, module.gamedatas);
});

test('ESM clients can use the outer gameui data snapshot', () => {
  const module = { updatePlayerResources() {} };
  const gui = { GameModule: module, gamedatas: gameData() };
  const client = resolveClient(gui);
  assert.strictEqual(client.target, module);
  assert.strictEqual(client.data, gui.gamedatas);
});

test('an unrelated or incomplete GameModule does not hide a working legacy client', () => {
  const gui = { GameModule: {}, updatePlayerResources() {}, gamedatas: gameData() };
  const client = resolveClient(gui);
  assert.strictEqual(client.target, gui);
  assert.strictEqual(client.data, gui.gamedatas);
});

test('non-Catan and incomplete clients are not attached', () => {
  for (const gui of [null, undefined, {}, { gamedatas: gameData() },
    { updatePlayerResources() {}, gamedatas: { players: {} } },
    { updatePlayerResources() {}, gamedatas: { map: { tiles: [] } } }]) {
    assert.equal(resolveClient(gui), null);
  }
});
