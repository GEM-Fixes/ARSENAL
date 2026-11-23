// test helper: the whole page in the fake DOM with a fake server (no browser, no server, no game), so an ext test can drive its screen
// to a loaded state and check its blocks with the shared rules of tools/gui/test/blockcheck.js (checkScreen).
//   const B = require('./blkboot'); const P = await B.boot({ 'as2gui.mod': 'C:/m' }, (path, method, body) => reply or undefined (pending));
//   B.check(P.sec('goh')) -> list of problems ([] = fine). Containers must also carry a name (data-blkname).
// Author: Imperator_Aug (ARSENAL, ia-266f0ae1)
'use strict';
const vm = require('vm'), path = require('path');
const G = path.join(__dirname, '..', '..');
const fakedom = require(path.join(G, 'test', 'fakedom')), contract = require(path.join(G, 'contract')), html = require(path.join(G, 'page.js'));
const BC = require(path.join(G, 'test', 'blockcheck'));
const tick = () => new Promise(r => setImmediate(r));
const clone = o => JSON.parse(JSON.stringify(o));

async function boot(serverSettings, route) {
  const doc = fakedom.make(), store = new Map(), server = Object.assign({}, serverSettings || {}), calls = [];
  const resp = o => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(clone(o)), body: null });
  const ctx = {
    document: doc, console, TextDecoder, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    confirm: () => true,
    fetch: (u, o) => {
      const m = (o && o.method) || 'GET', p = String(u).split('?')[0], body = o && o.body ? JSON.parse(o.body) : null;
      if (p === '/api/health') return resp({ ok: true, allowLaunch: false, version: 'test' });
      if (p === '/api/commands') return resp({ commands: contract.describe() });
      if (p === '/api/settings' && m === 'GET') return resp({ settings: server, empty: !Object.keys(server).length, file: '' });
      if (p === '/api/settings' && m === 'POST') { Object.assign(server, JSON.parse(o.body).set); return resp({ ok: true }); }
      if (p === '/api/game') return resp({ dir: '', tried: [], ok: false, codes: ['none'] });
      calls.push([m, String(u), body]);
      const r = route ? route(p, m, body, String(u)) : undefined;
      return r === undefined ? new Promise(() => {}) : resp(r);
    },
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], ctx, { filename: 'page.js:script' });
  for (let i = 0; i < 400 && !ctx.__as2gui; i++) await tick();
  if (!ctx.__as2gui) throw new Error('page did not finish building');
  const sec = id => doc.getElementById('main').children.find(s => s.tagName === 'SECTION' && s.dataset.id === id);
  const settle = async () => { for (let i = 0; i < 20; i++) await tick(); };
  return { doc, ctx, calls, sec, settle };
}

const isB = e => !!(e && e.dataset && e.dataset.blk != null);
const isBox = e => isB(e) && e.classList.contains('blc');
const ids = sec => sec.all().filter(isB).map(b => b.dataset.blk);
// the shared rules, plus: every container carries a name
const check = sec => BC.checkScreen(sec, sec.dataset.id).concat(sec.all().filter(e => isBox(e) && !e.dataset.blkname).map(b => 'container "' + b.dataset.blk + '" has no name'));
module.exports = { boot, check, ids, isB, isBox };
