/* Local QA fixture. These are fictional counters, never a captured BGA hand. */
(function () {
  'use strict';

  function initialData() {
    return {
      map: { tiles: [{}] },
      players: {
        '1': { resources: 6, lumber: 2, brick: 1, wool: 1, grain: 1, ore: 1 },
        '2': { resources: 5, lumber: 1, brick: 2, wool: 0, grain: 1, ore: 1 },
        '3': { resources: 4 },
        '4': { resources: 0 }
      }
    };
  }

  const subscriptions = new Map();
  let subscriptionId = 0;
  window.dojo = {
    subscribe(topic, callback) {
      const id = ++subscriptionId;
      subscriptions.set(id, { topic, callback });
      return id;
    },
    unsubscribe(id) { subscriptions.delete(id); },
    publish(topic) {
      for (const subscription of Array.from(subscriptions.values())) {
        if (subscription.topic === topic) subscription.callback();
      }
    }
  };

  const target = {
    gamedatas: initialData(),
    updatePlayerResources(id, counters) {
      this.gamedatas.players[String(id)] = {
        ...this.gamedatas.players[String(id)], ...counters
      };
      return 'simulated-update-complete';
    },
    setup(data) {
      this.gamedatas = data;
      gui.gamedatas = data;
      return 'simulated-setup-complete';
    }
  };
  const gui = {
    player_id: '1',
    table_id: 'demo',
    GameModule: target,
    gamedatas: target.gamedatas
  };
  window.gameui = gui;

  const status = document.getElementById('status');
  function announce(message) { status.textContent = message; }
  function withClient(action) {
    if (window.gameui !== gui) {
      announce('The simulated client is detached. Choose Restore client or Reset all demo data first.');
      return;
    }
    action();
  }
  function on(id, callback) {
    document.getElementById(id).addEventListener('click', callback);
  }

  on('known-update', () => withClient(() => {
    target.updatePlayerResources('1', { resources: 8, lumber: 3, brick: 2, wool: 1, grain: 1, ore: 1 });
    announce('Ada received a complete snapshot: 3 wood, 2 brick, 1 sheep, 1 wheat, 1 ore; total 8.');
  }));

  on('total-only', () => withClient(() => {
    const next = Number(target.gamedatas.players['2'].resources) + 1;
    target.updatePlayerResources('2', { resources: next });
    announce(`Ben's total is now ${next}; no resource types were supplied. Earlier resource counts must be shown as stale.`);
  }));

  on('partial-update', () => withClient(() => {
    const next = Number(target.gamedatas.players['1'].lumber || 0) + 1;
    target.updatePlayerResources('1', { lumber: next });
    announce(`Ada received wood ${next}, without a new total. The previous total must not be presented as current.`);
  }));

  on('inconsistent', () => withClient(() => {
    target.updatePlayerResources('3', { resources: 2, lumber: 1, brick: 1, wool: 1, grain: 1, ore: 1 });
    announce('Cleo received a total of 2 but five individual counts summing to 5. The contradiction must not appear as five trustworthy values.');
  }));

  on('undo', () => withClient(() => {
    window.dojo.publish('undoRestorePoint');
    announce('Undo was observed. Previously received counts should now be stale until new counters arrive.');
  }));

  on('replace-panel', () => {
    const previous = document.getElementById('player_board_2');
    const replacement = document.createElement('div');
    replacement.id = 'player_board_2';
    replacement.className = 'cat_playerboard';
    const label = document.createElement('p');
    label.className = 'player-placeholder';
    label.textContent = 'CATAN player panel — replaced';
    replacement.append(label);
    previous.replaceWith(replacement);
    announce('Ben’s panel was replaced. The userscript should remount exactly one counter panel on its next check.');
  });

  on('detach-client', () => {
    window.gameui = null;
    announce('The client was detached. Old counters should be removed or marked stale on the next check.');
  });

  on('restore-client', () => {
    target.gamedatas = initialData();
    gui.gamedatas = target.gamedatas;
    window.gameui = gui;
    announce('The client was restored with a fresh initial snapshot. Counters should remount on the next check.');
  });

  on('reset', () => {
    window.gameui = gui;
    target.setup(initialData());
    announce('Initial demo data restored. Ada and Ben have complete counts; Cleo has only a total; Dani has an empty hand.');
  });
})();
