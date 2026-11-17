// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a live-token
// view and a per-protocol detail drawer with the model's own inputs and the
// protocol's farm plan. No network: every byte it shows is in data.js.
//
// Deep links, so each view is a URL the screenshots capture:
//   #/                  the board, top picks first
//   #/detail/<slug>     the detail drawer open for one protocol
//   #/filter?category=X&chain=Y&q=…   the board, filtered
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchOnly: false };
  var MODEL = DATA.model;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtMult(n) { return '×' + (n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2)); }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic. The multiplication
  // order matches lib/model.ts exactly, so the recomputed dollar is the
  // board's dollar.
  function impliedOf(row) {
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * MODEL.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var maturity = MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    var extra = Math.max(0, Math.min((row.chains ? row.chains.length : 1) - 1, MODEL.chain_max_extra));
    var chainMult = 1 + extra * MODEL.chain_bonus;
    var adjust = growthMult * maturity * chainMult;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * adjust));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json:
  // category, chains, TVL and age decide the action, the capital, the hold
  // and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return 'about $6–$12 of gas';
    if (c === 'solana') return 'about $0.10 of gas';
    if (c === 'binance' || c === 'bnb chain' || c === 'bsc') return 'about $0.20–$0.50 of gas';
    if (['arbitrum', 'optimism', 'base', 'zksync', 'blast', 'linea', 'scroll', 'mantle', 'mode', 'fraxtal'].indexOf(c) >= 0) return 'about $0.50–$1.50 of gas';
    if (['polygon', 'avalanche', 'fantom', 'gnosis', 'celo', 'kava', 'tron', 'near', 'aptos', 'sui'].indexOf(c) >= 0) return 'about $0.10–$1 of gas';
    return 'about $1–$3 of gas';
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and, if you are comfortable, borrow a small amount against it.';
    if (c.indexOf('dex') >= 0 || c.indexOf('swap') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('yield aggregator') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('staking pool') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ' on ' + chain + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0 || c.indexOf('dual-token') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " into " + name + "'s basis vault on " + chain + ' and keep the position open.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + ' through ' + name + "'s private pool on " + chain + ' and keep the receipt.';
    if (c.indexOf('launchpad') >= 0) return 'Stake $' + capital + ' in ' + name + "'s launch pool on " + chain + ' and join one sale.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'a supply, a borrow or a repayment';
    if (c.indexOf('dex') >= 0 || c.indexOf('swap') >= 0) return 'a swap or a small add and remove of liquidity';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('yield aggregator') >= 0) return 'a deposit, a claim or a vault switch';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'a bridge in either direction';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('staking pool') >= 0 || c.indexOf('restak') >= 0) return 'a stake, an unstake or a claim of rewards';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'one small trade and a close';
    if (c.indexOf('prediction') >= 0) return 'one market position';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'a deposit or a rebalance vote';
    if (c.indexOf('stable') >= 0 || c.indexOf('dual-token') >= 0) return 'a mint, a redeem or a swap';
    if (c.indexOf('rwa') >= 0) return 'a mint or a secondary-market buy';
    if (c.indexOf('insurance') >= 0) return 'a cover top-up or a claim check';
    if (c.indexOf('basis') >= 0) return 'a deposit or a withdrawal';
    if (c.indexOf('privacy') >= 0) return 'one private deposit';
    if (c.indexOf('launchpad') >= 0) return 'a stake or a vote on a sale';
    return 'a deposit, a swap or a vote';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol’s own page.';
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week on ' + p.name + ', such as ' + weeklyFor(p) + ', so the activity spans more than one snapshot.', cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol’s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
    ].map(stepText);
  }

  var bySlug = {};
  DATA.rows.forEach(function (r) { bySlug[r.slug] = r; });

  function filteredRows() {
    var rows = DATA.rows.filter(function (r) {
      if (state.tab !== 'pre-token') return false;
      if (state.watchOnly && DATA.watchlist && DATA.watchlist.indexOf(r.slug) < 0) return false;
      if (state.category !== 'all' && (r.category || '—') !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var d = 0;
      if (key === 'implied') d = a.implied_value_usd - b.implied_value_usd;
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'growth') d = (a.change_7d || 0) - (b.change_7d || 0);
      else if (key === 'age') d = (a.age_days || 0) - (b.age_days || 0);
      if (d === 0) d = a.slug < b.slug ? -1 : 1;
      return d * state.dir;
    });
    return rows;
  }

  function renderBoard() {
    app.innerHTML = '';
    app.setAttribute('aria-busy', 'false');
    if (state.tab === 'live') { renderLive(); return; }
    var rows = filteredRows();
    var watchSet = new Set(DATA.watchlist || []);
    var count = el('p', { class: 'count-line', text: rows.length + ' of ' + DATA.rows.length + ' pre-token protocols' +
      (state.watchOnly ? ' · watchlist only' : '') + (state.category !== 'all' ? ' · ' + state.category : '') +
      (state.chain !== 'all' ? ' · ' + state.chain : '') + (state.q ? ' · matching “' + state.q + '”' : '') });
    var table = el('table', { class: 'board-table' });
    var thead = el('thead', null, el('tr', null,
      el('th', { text: '#' }), el('th', { text: 'Protocol' }), el('th', { text: 'Category' }),
      el('th', { text: 'Chains' }), el('th', { class: 'num', text: 'TVL' }),
      el('th', { class: 'num', text: '7d' }), el('th', { class: 'num', text: 'Implied value' }),
      el('th', { class: 'num', text: 'Range' })));
    var tbody = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr', { onclick: function () { openDetail(r.slug); } });
      if (state.selected === r.slug) tr.className = 'selected';
      var nameCell = el('td', null,
        el('span', { text: r.name + ' ' }),
        watchSet.has(r.slug) ? el('span', { class: 'tag watch', text: 'watchlist' }) : null);
      var growth = r.change_7d === null ? el('span', { class: 'muted', text: 'n/a' })
        : el('span', { class: r.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(r.change_7d) });
      tr.appendChild(el('td', null, el('span', { class: 'rank-badge' + (r.rank <= 3 ? ' top3' : ''), text: String(r.rank) })));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', { class: 'muted', text: r.category || '—' }));
      tr.appendChild(el('td', { class: 'muted', text: (r.chains || []).slice(0, 2).join(', ') + (r.chains && r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num' }, growth));
      tr.appendChild(el('td', { class: 'num', html: '<b>' + esc(fmtUsd(r.implied_value_usd)) + '</b>' }));
      tr.appendChild(el('td', { class: 'num muted', text: fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd) }));
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    if (rows.length === 0) {
      app.appendChild(count);
      app.appendChild(el('div', { class: 'empty', text: 'No protocol matches this filter. Clear the search or pick another category.' }));
      return;
    }
    app.appendChild(count);
    app.appendChild(table);
  }

  function renderLive() {
    var table = el('table', { class: 'board-table' });
    var thead = el('thead', null, el('tr', null,
      el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { text: 'Chains' }),
      el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }),
      el('th', { class: 'num', text: '7d' }), el('th', { class: 'num', text: 'Mcap / TVL' })));
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var growth = r.change_7d === null ? el('span', { class: 'muted', text: 'n/a' })
        : el('span', { class: r.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(r.change_7d) });
      var tr = el('tr', null,
        el('td', null, el('b', { text: r.name })),
        el('td', { class: 'muted', text: r.category || '—' }),
        el('td', { class: 'muted', text: (r.chains || []).slice(0, 2).join(', ') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num' }, growth),
        el('td', { class: 'num', text: r.mcap_usd && r.tvl_usd ? fmtMult(r.mcap_usd / r.tvl_usd) : 'n/a' }));
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    app.appendChild(el('p', { class: 'count-line', text: 'Live tokens are the market’s own values, kept apart from the model’s claims — they are what the comparables are calibrated on.' }));
    app.appendChild(table);
  }

  function openDetail(slug) {
    state.selected = slug;
    var r = bySlug[slug];
    var drawer = document.getElementById('drawer');
    if (!r) { drawer.hidden = true; renderBoard(); return; }
    var watchSet = new Set(DATA.watchlist || []);
    var recomputed = impliedOf(r);
    var ok = recomputed === r.implied_value_usd;
    var span = Math.max(1, r.implied_high_usd - r.implied_low_usd);
    var pointPct = Math.min(100, Math.max(0, ((r.implied_value_usd - r.implied_low_usd) / span) * 100));
    var loPct = 0, hiPct = 100;
    drawer.innerHTML = '';
    drawer.appendChild(el('button', { class: 'close', text: 'Close ×', onclick: function () { closeDetail(); } }));
    drawer.appendChild(el('h2', { text: r.name }));
    drawer.appendChild(el('p', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains || []).join(', ') + ' · ' + (watchSet.has(r.slug) ? 'on the watchlist' : 'found below the floor') }));
    drawer.appendChild(el('h3', { text: 'Implied value' }));
    var big = el('p', { html: '<span class="num" style="font-size:26px;font-weight:700">' + esc(fmtUsd(r.implied_value_usd)) + '</span>' });
    drawer.appendChild(big);
    var bar = el('div', { class: 'rangebar' });
    bar.appendChild(el('span', { class: 'fill', style: 'left:' + loPct + '%;width:' + (hiPct - loPct) + '%' }));
    bar.appendChild(el('span', { class: 'point', style: 'left:calc(' + pointPct.toFixed(1) + '% - 2px)' }));
    drawer.appendChild(bar);
    drawer.appendChild(el('div', { class: 'range-labels' },
      el('span', { text: 'low ' + fmtUsd(r.implied_low_usd) }),
      el('span', { text: 'high ' + fmtUsd(r.implied_high_usd) })));
    drawer.appendChild(el('p', { class: 'sub', text: 'The range is the same formula at the category’s 25th and 75th percentile multiples — the market’s own spread for this kind of protocol.' }));
    drawer.appendChild(el('h3', { text: 'How the number is built' }));
    var kv = el('div', { class: 'kv' });
    var rows = [
      ['TVL', fmtUsd(r.tvl_usd)],
      ['Category multiple', fmtMult(r.category_multiple) + ' · mcap/TVL · from ' + r.category_n + ' traded token' + (r.category_n === 1 ? '' : 's')],
      ['7-day TVL change', fmtPct(r.change_7d) + ' → growth ×' + r.growth_multiplier.toFixed(2)],
      ['Age with no token', fmtAge(r.age_days) + ' → maturity ×' + r.maturity_multiplier.toFixed(2)],
      ['Chains', String((r.chains || []).length) + ' → breadth ×' + r.chain_multiplier.toFixed(2)],
      ['Implied value', fmtUsd(r.implied_value_usd)],
    ];
    rows.forEach(function (kvRow) {
      kv.appendChild(el('span', { text: kvRow[0] }));
      kv.appendChild(el('b', { text: kvRow[1] }));
    });
    drawer.appendChild(kv);
    drawer.appendChild(el('p', { class: 'check', text: ok ? '✓ This page recomputes the value from the snapshot figures and it matches board.json.' : 'Recomputed value differs — see the model panel.' }));
    drawer.appendChild(el('h3', { text: 'How to farm it' }));
    var steps = el('ol', { class: 'steps' });
    farmSteps(r).forEach(function (s) {
      var li = el('li');
      var m = s.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/);
      var body = m ? m[1] : s;
      var cost = m ? m[2] : '';
      var time = m ? m[3] : '';
      li.appendChild(document.createTextNode(body));
      var chips = el('span', { class: 'chips' });
      if (cost) chips.appendChild(el('span', { class: 'chip', text: 'Cost: ' + cost }));
      if (time) chips.appendChild(el('span', { class: 'chip', text: 'Time: ' + time }));
      li.appendChild(chips);
      steps.appendChild(li);
    });
    drawer.appendChild(steps);
    drawer.hidden = false;
    renderBoard();
  }

  function closeDetail() {
    state.selected = null;
    document.getElementById('drawer').hidden = true;
    if (location.hash.indexOf('#/detail/') === 0) history.replaceState(null, '', '#/');
    renderBoard();
  }

  function renderStatic() {
    var meta = document.getElementById('top-meta');
    meta.innerHTML = '';
    meta.appendChild(el('span', { html: 'Snapshot <b>' + esc(DATA.as_of) + '</b>' }));
    meta.appendChild(el('span', { html: '<b>' + DATA.rows.length + '</b> ranked · <b>' + DATA.watchlist_size + '</b> watchlist · <b>' + DATA.early_size + '</b> found below the floor' }));
    meta.appendChild(el('span', { html: 'Model <b>' + esc(DATA.model_version) + '</b>' }));
    document.getElementById('lede-text').textContent =
      'Every protocol below is scored from the snapshot’s own figures: its TVL, its seven-day growth, how long it has run with no token — and the market’s own pricing of the ' + DATA.calibrated_on + ' tokens that already trade in the same categories. No name is special-cased; the same formula prices every row.';
    var facts = document.getElementById('facts');
    facts.innerHTML = '';
    [
      ['Protocols in the snapshot', String(758)],
      ['Watchlist (TVL ≥ $50M, no token)', String(DATA.watchlist_size)],
      ['Board rows', String(DATA.rows.length)],
      ['Calibrated on', DATA.calibrated_on + ' traded tokens'],
      ['Global median mcap / TVL', fmtMult(DATA.global_median)],
      ['Snapshot date', DATA.as_of],
    ].forEach(function (f) {
      facts.appendChild(el('div', { class: 'fact' }, el('span', { text: f[0] }), el('b', { text: f[1] })));
    });
    var picks = document.getElementById('picks');
    picks.innerHTML = '';
    DATA.rows.slice(0, 3).forEach(function (r, i) {
      var card = el('button', { class: 'pick', type: 'button', onclick: function () { openDetail(r.slug); } });
      card.appendChild(el('span', { class: 'pick-rank', text: 'RANK ' + (i + 1) }));
      card.appendChild(el('span', { class: 'pick-name', text: r.name }));
      card.appendChild(el('span', { class: 'pick-value', text: fmtUsd(r.implied_value_usd) }));
      card.appendChild(el('span', { class: 'pick-sub', text: (r.category || '—') + ' · TVL ' + fmtUsd(r.tvl_usd) + ' · 7d ' + fmtPct(r.change_7d) }));
      picks.appendChild(card);
    });
    document.getElementById('model-text').innerHTML =
      'The model is <b>comparables, calibrated on this snapshot</b>: for each category, the median market-cap-to-TVL multiple of the tokens that already trade there, shrunk toward the global median when a category has few tokens. ' +
      'Implied value = TVL × that multiple, adjusted for 7-day growth, for how long the protocol has run with no token, and for how many chains it runs on. ' +
      'The range is the same formula at the category’s 25th and 75th percentile multiples. Exchanges are never ranked, and versioned pools are left out.';
    var tbody = document.querySelector('#comps tbody');
    tbody.innerHTML = '';
    DATA.comps.slice(0, 10).forEach(function (c) {
      var tr = el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.n) }),
        el('td', { class: 'num', text: fmtMult(c.median) }),
        el('td', { class: 'num', text: fmtMult(c.q25) + ' – ' + fmtMult(c.q75) }));
      tbody.appendChild(tr);
    });
    document.getElementById('foot-note').textContent =
      'Model ' + DATA.model_version + ' · snapshot ' + DATA.as_of + ' · ' + DATA.rows.length + ' rows, ' + DATA.watchlist_size + ' of them the watchlist, ' + DATA.early_size + ' found below the $50M floor · calibrated on ' + DATA.calibrated_on + ' traded tokens · source: ' + DATA.source + '.';
  }

  function fillFilters() {
    var cats = {};
    DATA.rows.forEach(function (r) { cats[r.category || '—'] = true; });
    var catSel = document.getElementById('category');
    Object.keys(cats).sort().forEach(function (c) {
      catSel.appendChild(el('option', { value: c, text: c }));
    });
    var chains = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chains[c] = true; }); });
    var chainSel = document.getElementById('chain');
    Object.keys(chains).sort().forEach(function (c) {
      chainSel.appendChild(el('option', { value: c, text: c }));
    });
  }

  function readHash() {
    var h = location.hash || '#/';
    if (h.indexOf('#/detail/') === 0) {
      state.selected = decodeURIComponent(h.slice(9));
      return;
    }
    if (h.indexOf('#/filter') === 0) {
      var q = h.indexOf('?') >= 0 ? h.slice(h.indexOf('?') + 1) : '';
      q.split('&').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv.length !== 2) return;
        var k = decodeURIComponent(kv[0]);
        var v = decodeURIComponent(kv[1]);
        if (k === 'category') state.category = v;
        if (k === 'chain') state.chain = v;
        if (k === 'q') state.q = v;
        if (k === 'tab') state.tab = v;
        if (k === 'sort') state.sort = v;
        if (k === 'watchlist') state.watchOnly = v === '1';
      });
      syncControls();
    }
  }

  function syncControls() {
    document.getElementById('q').value = state.q;
    document.getElementById('category').value = state.category;
    document.getElementById('chain').value = state.chain;
    document.getElementById('sort').value = state.sort;
    document.getElementById('watchlist-only').checked = state.watchOnly;
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-tab') === state.tab); });
  }

  function bind() {
    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
    document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; renderBoard(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
    document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
    document.getElementById('watchlist-only').addEventListener('change', function (e) { state.watchOnly = e.target.checked; renderBoard(); });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        state.tab = t.getAttribute('data-tab');
        state.selected = null;
        document.getElementById('drawer').hidden = true;
        syncControls();
        renderBoard();
      });
    });
    window.addEventListener('hashchange', function () {
      state.selected = null;
      document.getElementById('drawer').hidden = true;
      readHash();
      if (state.selected) openDetail(state.selected);
      else renderBoard();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });
  }

  renderStatic();
  fillFilters();
  bind();
  readHash();
  syncControls();
  if (state.selected) openDetail(state.selected);
  else renderBoard();
})();
