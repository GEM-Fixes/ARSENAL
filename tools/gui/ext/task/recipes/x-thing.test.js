// recipe "look at a thing" test: node x-thing.test.js <scratch>. The page kinds run in a small fake page with fixture replies (find by
// words and by browsing, the viewers in the look pane and their closing, the numbers, side by side, what a gun pierces, the objects on
// a map, the files, where it is used with a name list still building, which copy wins, what a mod changed, the make/change tasks with
// the base found by that task's lookup, price and balance, leave, no mod picked). The census of the four explore recipes as one (every
// explore.json key covered or a named gap, with a seeded defect). The real page (fake DOM): x-log's Done step next buttons, x-thing's
// leave closing its viewer. Then the own lookups and the entities route on the game of this PC (read only; else a SKIP
// note), then the test kit (validation, census coverage with its seeded defect, 4 languages, explore steps). PASS is the last line.
// Author: Imperator_Aug (ARSENAL, ia-05aa571a)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-x-thing-')));
fs.mkdirSync(scratch, { recursive: true });
process.env.AS2_TASK_DIR = path.join(scratch, 'tasks');   // the page test's drafts stay in the scratch folder
const kit = require('../lib/testkit'), RC = require('../lib/recipe');
const R = require('./x-thing.recipe'), C = require('./x-thing.client'), LANG = require('./x-thing.lang');
const EXPLORE = { 'x-thing': R, 'x-mod': require('./x-mod.recipe'), 'x-log': require('./x-log.recipe'), 'x-limits': require('./x-limits.recipe') };
const GUI = path.resolve(__dirname, '..', '..', '..');
let p = 0, f = 0;
const ok = (c, m, x) => { if (c) p++; else { f++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 800) : '')); } };
const tick = async (n) => { for (let i = 0; i < (n || 6); i++) await new Promise(r => setImmediate(r)); };

function el(tag, attrs, kids) {
  const e = { tag: String(tag).toUpperCase(), tagName: String(tag).toUpperCase(), attrs: {}, kids: [], ev: {}, _t: '', checked: false, value: '', disabled: false };
  e.appendChild = k => { e.kids.push(k); return k; };
  e.addEventListener = (n, fn) => { e.ev[n] = fn; };
  Object.defineProperty(e, 'textContent', { get: () => e._t + e.kids.map(k => k.textContent).join(' '), set: v => { e._t = String(v); e.kids = []; } });
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'text') e._t = String(v); else if (k === 'onclick') e.ev.click = v; else if (v != null) e.attrs[k] = String(v); }
  for (const k of [].concat(kids || [])) if (k) e.kids.push(k);
  return e;
}
const all = (e, fn, out = []) => { if (fn(e)) out.push(e); for (const k of e.kids || []) all(k, fn, out); return out; };
const by = (host, a, v) => all(host, e => e.attrs[a] != null && (v === undefined || e.attrs[a] === String(v)));
// viewNoMod: the page's VIEW takes a key with no mod picked (false: as view/client.js norm does today, it takes none)
function pageWith(replies, mod, viewNoMod) {
  const kinds = {}, look = el('div'), links = [], calls = [], opened = [], mounted = [], closed = [], models = [], toasts = [];
  const VIEW = {
    kindOf: n => (/\.(wav|dds|tga|ply)$/.test(String(n)) ? 'pic' : /\.mdl$/.test(String(n)) ? 'model' : null),
    spec: k => (k === 'pic' ? { where: 'tab' } : k === 'model' ? { where: 'page' } : null),
    mount: (l, ref) => { mounted.push(ref.key); const e = el('div', { 'data-vw': ref.key }); l.appendChild(e); return { el: e, close: () => closed.push(ref.key) }; },
    modelGo: ref => { models.push(ref.key); return true; }, open: () => true,
    item: ref => (box.S.mod || viewNoMod ? { key: ref.key } : null),
  };
  const box = {
    document: { querySelector: s => (s === '[data-task-look]' ? look : null) },
    TASK: { kind: (n, s) => { kinds[n] = s; return s; }, close: () => Promise.resolve(null), open: (r, v, o) => { opened.push([r, v, o]); return Promise.resolve(null); } },
    h: el, tx: (k, o) => k + (o ? JSON.stringify(o) : ''), toast: m => toasts.push(String(m)), S: { mod: mod == null ? 'G:/game/mods/mine' : mod }, RMT: false, VIEW,
    as2Link: l => { links.push(l); return true; }, setTimeout: fn => setImmediate(fn),
    api: (u, b) => {
      calls.push([u, b]); const k = Object.keys(replies).sort((a, c) => c.length - a.length).find(x => u.indexOf(x) === 0);
      if (!k) return Promise.reject(new Error('no reply ' + u));
      const v = typeof replies[k] === 'function' ? replies[k](u, b) : replies[k];
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(JSON.parse(JSON.stringify(v)));
    },
    Promise, JSON, Date, String, Number, Object, Math, encodeURIComponent,
  };
  // a stand-in searchKit (page.js): its Browse sends the spec to searchKit.picker as the kit does (start called, view, mode, exts) and
  // a picked path goes through toValue to onPick(v, entry, 'browse'); the fake picker records the spec and answers with pickWith's file
  const picks = []; let answer = null;
  box.searchKit = (inp, o) => {
    const bB = el('button', { 'data-sk-browse': '1' }); bB.setAttribute = (k, v) => { bB.attrs[k] = String(v); };
    bB.ev.click = () => { const b = o.browse && typeof o.browse === 'object' ? o.browse : null; let s = b ? b.start : ''; if (typeof s === 'function') s = s();
      box.searchKit.picker({ mode: b && b.mode === 'dir' ? 'dir' : 'file', start: s == null ? '' : String(s), view: b && b.view === 'data' ? 'data' : 'disk', exts: b && Array.isArray(b.exts) ? b.exts : null, def: !b }, (p, e) => {
        const v = b && typeof b.toValue === 'function' ? b.toValue(p, e || null) : p; if (v != null && v !== '') o.onPick(v, e || null, 'browse'); }); };
    return { el: el('span', { class: 'sk' }, [inp, bB]), browseButton: bB };
  };
  box.searchKit.picker = (spec, done) => { picks.push(spec); if (answer) done(answer[0], answer[1]); };
  const pickWith = key => { const p = String(key).replace(/^resource\//, ''); answer = key ? [p, { view: 'data', path: p, key, name: p.split('/').pop() }] : null; };
  box.window = box; vm.createContext(box);
  vm.runInContext(C.script, box, { filename: 'x-thing.client' });
  return { kinds, look, links, calls, opened, mounted, closed, models, toasts, box, picks, pickWith };
}
// the real page (fake DOM, as ../test.js does): the core task window with these recipes. x-log reaches its Done step, which offers
// the recipes its next names (fixmod greyed with no mod picked, x-limits ready); x-thing's leave closes the viewer it mounted when
// the window closes or a step with no own kind is drawn.
async function realPage() {
  const fakedom = require(path.join(GUI, 'test', 'fakedom')), contract = require(path.join(GUI, 'contract')), html = require(path.join(GUI, 'page.js'));
  const EXT = require('../index'), D = require('../lib/draft'), ctx = kit.ctxFor(path.join(scratch, 'page'), {});
  const doc = fakedom.make(), store = new Map(), posts = [];
  const row = doc.createElement('div'); row.setAttribute('id', 'taskrow'); doc.body.insertBefore(row, doc.getElementById('nav'));   // the row loads the catalogue
  const resp = (o, status) => Promise.resolve({ ok: !status, status: status || 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(o))), body: null });
  const w = {
    document: doc, console, TextDecoder, setTimeout: fn => { setImmediate(fn); return 0; }, clearTimeout: () => {}, setInterval: () => 0, confirm: () => true,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    fetch: (u, o) => {
      const m = (o && o.method) || 'GET', url = new URL(String(u), 'http://127.0.0.1'), pn = url.pathname;
      if (pn === '/api/health') return resp({ ok: true, allowLaunch: false, version: 'test' });
      if (pn === '/api/commands') return resp({ commands: contract.describe() });
      if (pn === '/api/settings') return resp(m === 'GET' ? { settings: {}, empty: true, file: '' } : { ok: true });
      if (pn === '/api/game') return resp({ dir: '', tried: [], ok: false, codes: ['none'] });
      if (pn === '/api/mods') return resp({ mods: [], roots: [] });
      const fn = EXT.routes[m + ' ' + pn];
      if (fn) { if (m === 'POST') posts.push(pn); return Promise.resolve().then(() => fn(url, o && o.body ? JSON.parse(o.body) : null, ctx)).then(r => resp(r), e => resp({ error: e.message }, e.status || 500)); }
      return new Promise(() => {});
    },
  };
  w.window = w; vm.createContext(w);
  vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], w, { filename: 'page.js:script' });
  for (let i = 0; i < 400 && !w.__as2gui; i++) await tick(1);
  ok(!!w.__as2gui && !!w.TASK, 'the real page is built with the task window');
  if (!w.TASK) return;
  for (let i = 0; i < 200 && !row.querySelector('button[data-task-start]'); i++) await tick(1);
  const settle = async () => { for (let i = 0; i < 40; i++) await tick(1); };

  // x-log: three questions, then Done with the next buttons
  await w.TASK.open('x-log', 'explore'); await settle();
  const win = doc.getElementById('taskwin');
  ok(win && !win.hidden && w.TASK.state().draft && w.TASK.state().draft.recipe === 'x-log', 'x-log opens in the task window');
  for (let i = 0; i < 3; i++) { w.TASK.next(); await settle(); }
  const nb = win.querySelectorAll('button[data-task-nextrecipe]');
  ok(nb.map(b => b.dataset.taskNextrecipe || b.attrs['data-task-nextrecipe']).join() === 'fixmod,x-limits', 'the Done step offers fix my mod and what is possible (recipe.next)', nb.map(b => b.textContent).join(' | '));
  const fx = nb.find(b => b.attrs['data-task-nextrecipe'] === 'fixmod'), xl = nb.find(b => b.attrs['data-task-nextrecipe'] === 'x-limits');
  ok(fx && fx.disabled && xl && !xl.disabled, 'fixmod is greyed with no mod and no game folder; x-limits can start', (fx && fx.disabled) + ' ' + (xl && xl.disabled));
  if (xl) { xl.click(); await settle(); }
  ok(w.TASK.state().draft && w.TASK.state().draft.recipe === 'x-limits', 'the x-limits button opens that task', JSON.stringify(w.TASK.state().draft && w.TASK.state().draft.recipe));
  await w.TASK.close(); await settle();

  // x-thing: resume at the look screen with a mod set, a viewer mounted; leave closes it
  const V = w.VIEW, made = [], shut = [];
  if (!V) { ok(false, 'window.VIEW is there'); return; }
  const keep = { kindOf: V.kindOf, spec: V.spec, mount: V.mount };
  V.kindOf = () => 'xtest'; V.spec = () => ({ where: 'tab' });
  V.mount = (l, ref) => { made.push(ref.key); return { close: () => shut.push(ref.key) }; };
  try {
    w.__as2gui.mod = path.join(scratch, 'page', 'nomod');
    const ans = { kind: { src: 'value', value: 'picture' }, thing: { src: 'exist', value: 'resource/interface/a.dds', name: 'a.dds', ref: { key: 'resource/interface/a.dds' }, sub: 'interface', of: 'picture' } };
    const d = D.save(ctx, { id: D.newId('x-thing'), recipe: 'x-thing', verb: 'explore', game: 'as64', mod: '', answers: ans, kept: [], state: 'open', step: 'q:look' });
    await w.TASK.resume(d.id); await settle();
    ok(w.TASK.state().draft && w.TASK.state().draft.step === 'q:look' && made.length === 1, 'x-thing resumes at its look screen and mounts the viewer', JSON.stringify({ step: w.TASK.state().draft && w.TASK.state().draft.step, made }));
    await w.TASK.close(); await settle();
    ok(shut.length === 1 && shut[0] === 'resource/interface/a.dds', 'closing the window closes the viewer (leave)', shut.join());
    await w.TASK.resume(d.id); await settle();
    const done = win.querySelectorAll('button.tk-step').find(b => b.dataset.step === 'done');
    if (done) { done.click(); await settle(); }
    ok(made.length === 2 && shut.length === 2, 'going to the Done step (no own kind there) closes the viewer too (leave)', JSON.stringify({ made, shut }));
    ok(!win.querySelectorAll('button[data-task-nextrecipe]').length, 'x-thing names no next: its own last screen has the buttons, the Done step adds none');
    await w.TASK.close(); await settle();
  } finally { Object.assign(V, keep); }
  ok(posts.every(pn => /^\/api\/x\/task\/(draft|lookup|values|catalogue|recipe)/.test(pn)), 'the page wrote nothing but drafts', posts.join());
}

// every screen on the real routes (the GUI's own route table, this PC's game folder) with no mod picked: the game as it ships.
// Each screen that reads must show what it read and no "needs a mod"; only "what the mods changed" stays mod-only.
async function realRoutes(game) {
  const ROUTES = Object.assign({}, ...require('../../index').map(e => e.routes || {})), FL = require('../../files/lib'), ctx = kit.ctxFor(path.join(scratch, 'nomod'), { gameDir: game });
  const files = [...(FL.vfsFor(ctx, '').v || { files: new Map() }).files.keys()];
  const P = pageWith({}, '', true);
  P.box.setTimeout = fn => setTimeout(fn, 300);   // the name list builds for real: ask again as the page does, not at once
  P.box.api = (u, b) => {
    const url = new URL(u, 'http://127.0.0.1'), fn = ROUTES[(b ? 'POST ' : 'GET ') + url.pathname];
    P.calls.push([u, b]);
    return fn ? Promise.resolve().then(() => fn(url, b ? JSON.parse(JSON.stringify(b)) : null, ctx)) : Promise.reject(new Error('no route ' + url.pathname));
  };
  const wait = async (host, test, n) => { for (let i = 0; i < (n || 400) && !test(); i++) await new Promise(r => setTimeout(r, 5)); return host; };
  const draw = async (kind, d, test, n) => { const hh = el('div'); P.kinds[kind].draw({ id: kind === 'xt-find' ? 'thing' : kind }, { draft: d }, hh); await wait(hh, () => test(hh), n); return hh; };
  const nomod = hh => by(hh, 'data-xt-nomod').length;
  const failed = hh => /k\.(fail|nolink)/.test(hh.textContent);
  // a unit, found with the real lookup the find screen asks
  const ud = { mod: '', answers: { kind: { src: 'value', value: 'unit' } } };
  let host = await draw('xt-find', ud, hh => by(hh, 'data-xt-hit').length);
  const hits = by(host, 'data-xt-hit');
  ok(hits.length > 0 && !nomod(host), 'real: the find screen lists the first units at once with no mod (' + hits.length + ')', host.textContent.slice(0, 300));
  if (!hits.length) return;
  const tk = hits.find(e => /t34|tiger|pz/i.test(e.attrs['data-xt-hit'])) || hits[0];
  tk.ev.click(); const st = { draft: ud }; P.kinds['xt-find'].draw({ id: 'thing' }, st, el('div'));
  ud.answers.thing = { src: 'exist', value: tk.attrs['data-xt-hit'], name: tk.attrs['data-xt-hit'], of: 'unit', ref: null };
  for (const [k, test, what] of [
    ['xt-look', () => P.mounted.length, 'the look pane mounts a viewer for one of its files'],
    ['xt-numbers', hh => /k\.n\./.test(hh.textContent), 'its numbers show'],
    ['xt-files', hh => by(hh, 'data-xt-file').length, 'its files show by role'],
    ['xt-wins', hh => by(hh, 'data-xt-copy').length || nomod(hh), 'which copy wins shows the game\'s copies (files/which, ide/copies)'],
    // a loaded PC may run out the route's time budget: the screen then says the search stopped early (data-xt-cut), an honest answer
    ['xt-used', hh => by(hh, 'data-xt-link').length || by(hh, 'data-xt-cut').length || nomod(hh) || failed(hh), 'where it is used lists the places (ide/refs)'],
    ['xt-price', hh => by(hh, 'data-xt-prow').length || /k\.pr\.none/.test(hh.textContent), 'its price reads the balance sheet of the game']]) {
    host = await draw(k, ud, test, k === 'xt-used' ? 3000 : 400);
    ok(test(host) && !nomod(host) && !failed(host), 'real, no mod, ' + ud.answers.thing.value + ': ' + what, host.textContent.slice(0, 300));
  }
  host = await draw('xt-modchg', ud, hh => nomod(hh));
  ok(nomod(host) === 1, 'real, no mod: what the mods changed stays mod-only');
  // a file of each kind the viewers read: a sound, a picture, a font, a model part; and browse
  const pick = re => files.find(x => re.test(x));
  for (const [kind, re, test] of [['sound', /^resource\/sound\/.*\.wav$/, hh => /k\.n\./.test(hh.textContent)], ['picture', /^resource\/interface\/.*\.dds$/, hh => /k\.n\./.test(hh.textContent)],
    ['picture', /\.fnt$/, hh => /k\.n\.fsize/.test(hh.textContent) && /k\.n\.chars/.test(hh.textContent) && !/\bsig\b/.test(hh.textContent)], ['model', /^resource\/entity\/-vehicle\/.*\.ply$/, hh => by(hh, 'data-xt-owner').length || /k\.n\./.test(hh.textContent)]]) {
    const key = pick(re);
    if (!key) { console.log('note: SKIP no ' + re + ' file in the game'); continue; }
    const d = { mod: '', answers: { kind: { src: 'value', value: kind }, thing: { src: 'exist', value: key, name: key.split('/').pop(), ref: { key }, of: kind } } };
    host = await draw('xt-numbers', d, hh => test(hh) || failed(hh));
    ok(test(host) && !nomod(host) && !failed(host), 'real, no mod: the numbers of ' + key + ' (view routes)', host.textContent.slice(0, 300));
    host = await draw('xt-files', d, hh => by(hh, 'data-xt-file').length || nomod(hh) || failed(hh));
    ok(by(host, 'data-xt-file', key).length === 1 && !nomod(host), 'real, no mod: the folder of ' + key + ' lists it (ide/vdir)', host.textContent.slice(0, 300));
    if (kind === 'sound') {
      const fst = { draft: { mod: '', answers: { kind: d.answers.kind } } }, n0 = P.picks.length;
      host = el('div'); P.kinds['xt-find'].draw({ id: 'thing' }, fst, host); await tick(); P.pickWith(key); by(host, 'data-xt-browse')[0].ev.click(); P.pickWith(null);
      const sp = P.picks[n0] || {}, fv = P.kinds['xt-find'].value({}, fst);
      ok(sp.start === 'sound' && sp.view === 'data' && sp.mode === 'file' && fv.ok && fv.answer.ref.key === key, 'real, no mod: Browse opens the file picker at the game\'s sound folder; the picked file is the thing', JSON.stringify([sp, fv]));
    }
    if (kind === 'model') {
      host = await draw('xt-look', d, () => true); const b3 = by(host, 'data-xt-3d')[0];
      if (b3) { const n = P.models.length; b3.ev.click(); await tick(); ok(P.models.length === n + 1, 'real, no mod: the 3D button opens the Models page'); }
    }
  }
  ok(P.calls.every(c => !/\/(save|write|copy|clone|place|camo-write|draft\/save)\b/.test(c[0])), 'real, no mod: no screen asks to write');
}

const PEN = [[10, 129], [50, 115], [75, 99], [100, 87], [125, 75], [130, 71.25], [175, 0]];

(async () => {
  // ---- static: page rules, every string the page asks for exists
  ok(!/=>|`|\$\{|innerHTML/.test(C.script), 'page script is ES5 with no backtick, dollar brace or innerHTML');
  ok(!/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(C.script + C.css), 'page code has no fixed colour');
  const keys = new Set(LANG.map(r => r[0]));
  const used = [...new Set((C.script.match(/\bT\('([a-zA-Z0-9.]+)'/g) || []).map(s => s.slice(3, -1)))]
    .concat(['def', 'model', 'mesh', 'material', 'texture', 'variant', 'vol', 'anim', 'icon'].map(x => 'f.role.' + x))
    .concat(['vanilla', 'mine', 'othermod', 'off', 'deleted'].map(x => 'w.kind.' + x), ['x.make', 'x.change', 'n.yes', 'n.no'])
    .concat(['unit', 'gun', 'map', 'sound', 'model', 'picture'].map(x => 'eg.' + x), ['why.noGame', 'do.noGame', 'why.noWords', 'do.noWords', 'why.empty'])
    .filter(k => !/\.$/.test(k)).map(k => 'task.x-thing.k.' + k);
  const recKeys = [R.title].concat(...R.groups.map(g => [g.title].concat(...g.q.map(q => [q.ask, q.help]))), R.groups[0].q[0].limits.values.map(v => 'task.x-thing.v.kind.' + v));
  ok(used.length > 60 && used.concat(recKeys).every(k => keys.has(k)), 'every string the page and the recipe use is in the lang rows', used.concat(recKeys).filter(k => !keys.has(k)).join(','));
  ok(LANG.every(r => r.length === 5 && r.every(s => typeof s === 'string' && s.trim()) && !/[‒–—―]| - /.test(r.slice(1).join('|'))), 'every row has 4 languages and no dash punctuation');
  ok(new Set(LANG.map(r => r[0])).size === LANG.length, 'no row key twice');
  ok(C.kinds.every(k => /^xt-/.test(k)) && C.kinds.length === 14, 'fourteen own kinds, all with the xt- prefix');
  ok(Array.isArray(R.needs) && !R.needs.includes('picked') && !R.needs.includes('mod'), 'exploring the game needs no mod (needs is empty)', JSON.stringify(R.needs));
  for (const lk of ['gun', 'picture']) {
    const r0 = await R.lookups[lk]({ game: () => null }, 'x', {});
    ok(r0.results && !r0.results.length && r0.why === 'task.x-thing.k.why.noGame' && r0.do === 'task.x-thing.k.do.noGame', 'with no game folder the ' + lk + ' lookup says why the list is empty and what to do', JSON.stringify(r0));
  }

  // ---- every page a string of the four explore recipes names is a real page: its tab name (tools/gui/groups.js pages, their nav
  // key in the core strings or the ext's own) in that language. en "the X page", ru "странице/страница X", uk "сторінці/сторінка X",
  // zh "“X”页面"; a Latin word just before 页面 is an untranslated name. Checked on a seeded defect too.
  const PN = { en: new Set(), ru: new Set(), uk: new Set(), zh: new Set() };
  {
    const ids = new Set(require(path.join(GUI, 'groups.js')).GAMES.flatMap(g => g.tabs.flatMap(t => t.pages)));
    const core = {}; for (const c of Object.keys(PN)) core[c] = JSON.parse(fs.readFileSync(path.join(GUI, 'lang', c + '.json'), 'utf8'));
    const exts = require(path.join(GUI, 'ext', 'index.js'));
    for (const id of ids) {
      const e = exts.find(x => x.id === id), key = e ? e.nav : 'nav.' + id;
      for (const c of Object.keys(PN)) { const v = e ? ((e.lang || {})[c] || {})[key] : core[c][key]; if (v) PN[c].add(v); }
    }
  }
  function pageNames(rows) {
    const probs = [], seen = [];
    const starts = (c, rest) => [...PN[c]].some(n => rest.startsWith(n));
    for (const r of rows) {
      for (const m of r[1].matchAll(/\b[Tt]he ([A-Z][^.,:;!?]*?) page\b/g)) { seen.push(m[1]); if (!PN.en.has(m[1])) probs.push(r[0] + ' en: ' + m[1]); }
      for (const [c, i, re] of [['ru', 2, /[Сс]траниц[еау] /g], ['uk', 3, /[Сс]торінк?[иаці]{1,2} /g]]) {
        for (const m of r[i].matchAll(re)) { const rest = r[i].slice(m.index + m[0].length); if (/^[A-ZА-ЯІЇЄҐ“«"]/.test(rest)) { seen.push(rest.slice(0, 20)); if (!starts(c, rest.replace(/^[“«"]/, ''))) probs.push(r[0] + ' ' + c + ': ' + rest.slice(0, 30)); } }
      }
      for (const m of r[4].matchAll(/“([^”]+)”页面/g)) { seen.push(m[1]); if (!PN.zh.has(m[1])) probs.push(r[0] + ' zh: ' + m[1]); }
      if (/[A-Za-z] ?页面/.test(r[4])) probs.push(r[0] + ' zh: an untranslated page name');
    }
    return { probs, seen };
  }
  const allRows = Object.keys(EXPLORE).flatMap(id => require('./' + id + '.lang'));
  ok(PN.en.has('Read Game.log') && PN.en.has('Start Here') && PN.ru.has('Документы') && PN.zh.has('模型'), 'the real page names are read from groups.js and the nav keys', [...PN.en].join(','));
  const pn = pageNames(allRows);
  ok(!pn.probs.length && pn.seen.length >= 20, 'every page the explore strings name is a real page in that language (' + pn.seen.length + ' named)', pn.probs.join(' | '));
  const pnBad = pageNames([['seed', 'The Logs page shows it, see the Help page.', 'на странице Docs', 'на сторінці Логи', '在 Docs 页面或“帮助”页面']]);
  ok(pnBad.probs.length === 6,'seeded defect: Logs, Help, Docs in ru, Логи in uk and both zh names are found', pnBad.probs.join(' | '));

  // ---- the census of the four explore recipes: every explore.json key is asked by one of them or is a named gap; a kept row that
  // says "covered by <recipe> (the <question> screen)" names a question that covers it (a framework check, run on a seeded defect too)
  function unionCheck(recs, keys) {
    const probs = [], by = {}, gaps = {};
    for (const [rid, r] of Object.entries(recs)) for (const g of r.groups || []) for (const q of g.q || []) for (const k of q.covers || []) (by[k] = by[k] || []).push(rid + ':' + q.id);
    for (const [rid, r] of Object.entries(recs)) {
      const cv = RC.coverage(r, keys);
      if (!cv.ok) probs.push(rid + ' neither asks nor keeps ' + cv.missing.join(','));
      if (cv.unknown.length) probs.push(rid + ' names keys the census does not have: ' + cv.unknown.join(','));
      for (const [k, why] of r.kept || []) {
        if (/^gap:/.test(why)) { (gaps[k] = gaps[k] || []).push(rid); continue; }
        const m = /^covered by ([a-z0-9-]+) \(the ([a-z0-9-]+) screen\)$/.exec(why);
        if (!m) { probs.push(rid + ' keeps ' + k + ' with no recipe named: ' + why); continue; }
        if (!(by[k] || []).includes(m[1] + ':' + m[2])) probs.push(rid + ' says ' + k + ' is covered by ' + m[1] + ' ' + m[2] + ', which does not cover it');
      }
    }
    const open = keys.filter(k => !by[k] && !gaps[k]);
    if (open.length) probs.push('no explore recipe covers ' + open.join(','));
    for (const k of Object.keys(gaps)) { if (by[k]) probs.push(k + ' is called a gap but ' + by[k].join(',') + ' covers it'); if (gaps[k].length !== Object.keys(recs).length) probs.push(k + ' is a gap in ' + gaps[k].join(',') + ' only'); }
    return { probs, covered: keys.filter(k => by[k]), gaps: Object.keys(gaps) };
  }
  const cen = RC.loadCensus('explore');
  ok(!cen.missing.length && cen.keys.length >= 20, 'the explore census is there', JSON.stringify(cen.missing));
  const un = unionCheck(EXPLORE, cen.keys);
  ok(!un.probs.length, 'every explore.json key is covered by one of x-thing, x-mod, x-log, x-limits or is a named gap', un.probs.join(' | '));
  ok(un.gaps.join() === 'log.exe_compare' && un.covered.length === cen.keys.length - 1, 'one named gap (log.exe_compare); ' + un.covered.length + ' of ' + cen.keys.length + ' covered', un.gaps.join());
  const seeded = JSON.parse(JSON.stringify(Object.assign({}, EXPLORE['x-mod'], { lookups: null, routes: null })));
  seeded.groups.forEach(g => g.q.forEach(q => { if (q.covers) q.covers = q.covers.filter(k => k !== 'mod.search'); }));
  seeded.kept.push(['mod.search', 'covered by x-mod (the search screen)']);
  const un2 = unionCheck(Object.assign({}, EXPLORE, { 'x-mod': seeded }), cen.keys);
  ok(un2.probs.some(x => /no explore recipe covers mod\.search/.test(x)) && un2.probs.some(x => /does not cover it/.test(x)), 'seeded defect: a key no recipe asks and a kept row naming a screen that does not cover it are both found', un2.probs.join(' | '));

  // ---- the kinds in a small page
  let refsN = 0;
  const replies = {
    '/api/x/task/lookup': u => {
      const k = new URL('http://x' + u).searchParams.get('kind');
      if (k === 'entity') return { results: [{ id: 't34_85', name: 'T-34/85', where: 'rus', ref: null, sub: 'vehicle 120' }, { id: 'pz4_h', name: 'Pz IV H', where: 'ger', ref: null, sub: 'vehicle 110' }], total: 2 };
      if (k === 'vehicle') return { results: [{ id: 'zz', name: 'zz' }, { id: 't34_85', name: 'T-34/85', ref: { key: 'resource/entity/-vehicle/t34_85/t34_85.def' } }] };
      if (k === 'entity2') return { results: [] };
      return { results: [], total: 0 };
    },
    '/api/x/ide/vdir': u => (/dir=sound(&|$)/.test(u) ? { dir: 'sound', dirs: ['weapon'], files: [{ name: 'a.wav', key: 'resource/sound/a.wav' }, { name: 'notes.txt', key: 'resource/sound/notes.txt' }] }
      : { dir: 'x', dirs: [], files: [{ name: 'f.dds', key: 'resource/x/f.dds', where: 'vanilla' }] }),
    '/api/x/art/unit': { unit: 't34_85', found: true, def: 'resource/entity/-vehicle/t34_85/t34_85.def', groups: [
      { role: 'def', files: [{ key: 'resource/entity/-vehicle/t34_85/t34_85.def' }] }, { role: 'model', files: [{ key: 'resource/entity/-vehicle/t34_85/t34.mdl' }] },
      { role: 'texture', files: [{ key: 'resource/entity/-vehicle/t34_85/t34.dds', inMod: true }] }, { role: 'icon', files: [{ key: 'resource/interface/icons/t34.tga' }] }] },
    '/api/x/art/sound': { weapon: '85mm_zis', stuffFiles: ['resource/set/stuff/gun/85mm_zis'], sounds: [{ kind: 'fireSound', name: 'gun/85', files: ['resource/sound/weapon/85.wav'] }] },
    '/api/x/maps/picture': { svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
    '/api/x/maps/list': { state: 'done', maps: [{ key: 'map/multi/1v1_argentan', name: 'Argentan', players: 2, modes: ['combat'], mods: [] }] },
    '/api/x/units/stats': (u, b) => (b.id === 't34_85' ? { id: 't34_85', name: 'T-34/85', kind: 'vehicle', cost: 120, speed: 31, mass: 32000, buyable: true, armor: { front: 90, side: 75, rear: 75, top: 20 }, gun: { weapon: '85mm_zis', pen: 87 }, def: 'resource/entity/-vehicle/t34_85/t34_85.def' }
      : { id: b.id, name: 'Pz IV H', kind: 'vehicle', cost: 110, speed: 38, mass: 25000, buyable: true, armor: { front: 80, side: 30, rear: 20, top: 10 }, gun: { weapon: '75mm_kwk40', pen: 99 }, def: 'resource/entity/-vehicle/pz4/pz4.def' }),
    '/api/x/models/armor/shells': { weapon: '85mm_zis', shells: [{ ammo: 'bullet85.fg.ammo', kind: 'he', calibre: 85, penetration: [[10, 20], [50, 10]], aimRange: 100, maxRange: 110 },
      { ammo: 'bullet85.ap.ammo', kind: 'ap', calibre: 85, penetration: PEN, aimRange: 120, maxRange: 130 }] },
    '/api/x/units/search': { results: [{ id: 'a', name: 'Light', armor: { front: 50, side: 20 } }, { id: 'b', name: 'Medium', armor: { front: 90, side: 75 } }, { id: 'c', name: 'Heavy', armor: { front: 200, side: 120 } }, { id: 'd', name: 'Truck', armor: null }] },
    '/api/x/task/r/x-thing/entities': { map: 'map/multi/1v1_argentan', total: 30, kinds: 2, files: ['map', 'combat.mi'], defs: [{ def: 'hedge2a', n: 20 }, { def: 'bush8', n: 10 }], more: false },
    '/api/x/ide/refs': () => (refsN++ === 0 ? { building: true, hits: [] } : { hits: [{ link: 'key:resource/set/multiplayer/units/vehicles_rus.set:12', where: 'vanilla', text: '{"t34_85" (...)}' }] }),
    '/api/x/view/model/owner': { found: true, target: 'resource/entity/-vehicle/t34_85/t34.mdl', candidates: [{ target: 'resource/entity/-vehicle/t34_85/t34.mdl' }] },
    '/api/x/files/which': { chain: [{ kind: 'vanilla', layer: 'base', container: 'G:/game/resource/entity/e2.pak', entry: 'x.def' }, { kind: 'mine', layer: 'mine', entry: 'x.def', winner: true }] },
    '/api/x/ide/copies': { key: 'resource/entity/-vehicle/t34_85/t34_85.def', copies: [{ label: 'vanilla', kind: 'vanilla', where: 'G:/game/resource/entity/e2.pak :: x', winner: false }, { label: 'mine', kind: 'mine', where: 'G:/game/mods/mine/resource/x', winner: true }, { label: 'other', kind: 'off', where: 'G:/game/mods/other/x', winner: false }] },
    '/api/x/units/compare': { rows: [{ id: 't34_85', status: 'changed', cost: [100, 120], level: [3, 3], armor: [{ front: 90, side: 75, rear: 75, top: 20 }, { front: 90, side: 75, rear: 75, top: 20 }] }] },
    '/api/x/task/catalogue': { recipes: [{ id: 'vehicle', verbs: ['make', 'change'], built: true, title: 'task.vehicle.t' }, { id: 'skin', verbs: ['make', 'change'], built: true, title: 'task.skin.t' }, { id: 'icon', verbs: ['make'], built: false, title: 'task.icon.t' }] },
    '/api/x/task/recipe': u => ({ id: /id=vehicle/.test(u) ? 'vehicle' : 'skin', base: { lookup: /id=vehicle/.test(u) ? 'vehicle' : 'entity2' } }),
    '/api/x/balance/table': { rows: [
      { id: 't34_76', name: 'T-34/76', kind: 'vehicle', army: 'rus', cls: 'medium', res: 'mp', cost: 90, fit: 95, off: -5, rank: 2, charge: 60, gun: '76mm_f34', cal: 76, pen: 80, dmg: 60, reload: 5 },
      { id: 't34_85', name: 'T-34/85', kind: 'vehicle', army: 'rus', cls: 'medium', res: 'mp', cost: 120, fit: 100, off: 20, rank: 3, charge: 60, gun: '85mm_zis', cal: 85, pen: 129, dmg: 90, reload: 6 },
      { id: 'su85', name: 'SU-85', kind: 'vehicle', army: 'rus', cls: 'td', res: 'mp', cost: 110, fit: 110, off: 0, rank: 3, gun: '85mm_zis', cal: 85, pen: 129, dmg: 90, reload: 6 },
      { id: 'is85', name: 'IS-85', kind: 'vehicle', army: 'rus', cls: 'heavy', res: 'mp', cost: 200, fit: 210, off: -5, rank: 4, gun: '85mm_d5', cal: 85, pen: 120, dmg: 90, reload: 7 },
      { id: 'pz4_h', name: 'Pz IV H', kind: 'vehicle', army: 'ger', cls: 'medium', res: 'mp', cost: 110, fit: 110, off: 0, rank: 3, gun: '75mm_kwk40', cal: 75, pen: 99, dmg: 80, reload: 6 }],
      odd: [{ id: 't34_85', code: 'PRICE_HIGH', sev: 2, text: 'price 120 is 20% above' }] },
  };
  const P = pageWith(replies);
  ok(C.kinds.every(k => P.kinds[k]), 'the fourteen kinds are added');
  ok(C.kinds.every(k => typeof P.kinds[k].leave === 'function'), 'every kind has a leave (README Changes 35)');
  const draft = { id: 'x-thing-1', mod: 'G:/game/mods/mine', answers: { kind: { src: 'value', value: 'unit' } } };
  const draw = async (kind, q) => { const st = { draft }, host = el('div'); P.kinds[kind].draw({ id: q || kind }, st, host); await tick(); return { st, host }; };

  // the kind: six radios, unit preselected, the pick kept (an own kind: the built-in choice would say "The copy has")
  let kst = {}, khost = el('div'); P.kinds['xt-kind'].draw({ id: 'kind' }, kst, khost);
  const radios = by(khost, 'data-xt-kind');
  ok(radios.map(r => r.attrs['data-xt-kind']).join() === 'unit,gun,map,sound,model,picture' && radios.filter(r => r.checked).map(r => r.attrs.value).join() === 'unit', 'the kind screen has six choices, unit already picked');
  ok(P.kinds['xt-kind'].value({}, kst).answer.value === 'unit', 'Next at once gives a unit');
  radios[3].ev.change(); ok(P.kinds['xt-kind'].value({}, kst).answer.value === 'sound', 'a choice is kept');
  kst = { answer: { src: 'value', value: 'gun' } }; khost = el('div'); P.kinds['xt-kind'].draw({ id: 'kind' }, kst, khost);
  ok(by(khost, 'data-xt-kind', 'gun')[0].checked && P.kinds['xt-kind'].value({}, kst).answer.value === 'gun', 'back on the screen the earlier choice is shown');
  ok(!/task.q.base/.test(khost.textContent), 'no "The copy has" hint on the kind screen');

  // find by words: the first ones of the kind show at once, with example words
  const n0 = P.calls.length;
  let { st, host } = await draw('xt-find', 'thing');
  ok(P.calls.slice(n0).some(c => /^\/api\/x\/task\/lookup\?.*kind=entity/.test(c[0]) && /q=(&|$)/.test(c[0])) && by(host, 'data-xt-hit').length === 2, 'the find screen lists the first ones at once, before any words', P.calls.slice(n0).map(c => c[0]).join(' | '));
  ok(by(host, 'data-xt-eg', 'unit').length === 1 && /k.eg.unit/.test(host.textContent), 'example words for the kind are shown');
  ok(!P.kinds['xt-find'].value({}, st).ok, 'Next is refused before one is picked');
  by(host, 'data-xt-words')[0].value = 't34';
  by(host, 'data-xt-find')[0].ev.click(); await tick();
  const lk = P.calls.filter(c => c[0].indexOf('/api/x/task/lookup') === 0).pop()[0];
  ok(/kind=entity/.test(lk) && /q=t34/.test(lk) && /recipe=x-thing/.test(lk) && /mod=G%3A/.test(lk), 'a unit is looked up with the entity lookup, the words and the mod', lk);
  const hits = by(host, 'data-xt-hit');
  ok(hits.length === 2, 'the found units are listed', hits.length);
  hits[0].ev.click(); await tick();
  let v = P.kinds['xt-find'].value({}, st);
  ok(v.ok && v.answer.src === 'exist' && v.answer.value === 't34_85' && v.answer.of === 'unit' && v.answer.unit === 'vehicle', 'the pick is kept with its kind and the unit kind', JSON.stringify(v));
  draft.answers.thing = v.answer;
  // Browse (seeded): a unit's Browse opens the file picker over the game data at entity/ (def, set, ext); the pick's base name is looked
  // up and that unit chosen
  {
    const ust = { draft: { id: 'x-thing-u', mod: 'G:/game/mods/mine', answers: { kind: { src: 'value', value: 'unit' } } } }, uh = el('div'), n0 = P.picks.length, c0 = P.calls.length;
    P.kinds['xt-find'].draw({ id: 'thing' }, ust, uh); await tick();
    ok(by(uh, 'data-xt-browse').length === 1, 'a unit has the kit\'s Browse button');
    P.pickWith('resource/entity/-vehicle/pz4_h/pz4_h.def'); by(uh, 'data-xt-browse')[0].ev.click(); P.pickWith(null); await tick();
    const sp = P.picks[n0] || {}, uv = P.kinds['xt-find'].value({}, ust);
    ok(P.picks.length === n0 + 1 && sp.mode === 'file' && sp.view === 'data' && sp.start === 'entity' && (sp.exts || []).indexOf('def') >= 0, 'browse: a unit\'s Browse reaches the picker at entity/, data view, .def files', JSON.stringify(sp));
    ok(P.calls.slice(c0).some(c => /kind=entity/.test(c[0]) && /q=pz4_h(&|$)/.test(c[0])) && uv.ok && uv.answer.value === 'pz4_h', 'browse: the picked file\'s base name is looked up and that unit chosen', JSON.stringify(uv));
  }

  // Browse (sound): the file picker at sound/ (wav, ogg); the picked file is the thing at once
  const sdraft = { id: 'x-thing-2', mod: 'G:/game/mods/mine', answers: { kind: { src: 'value', value: 'sound' } } };
  st = { draft: sdraft }; host = el('div'); P.kinds['xt-find'].draw({ id: 'thing' }, st, host); await tick();
  const sn0 = P.picks.length; P.pickWith('resource/sound/a.wav'); by(host, 'data-xt-browse')[0].ev.click(); P.pickWith(null); await tick();
  const ssp = P.picks[sn0] || {};
  ok(ssp.start === 'sound' && ssp.view === 'data' && ssp.mode === 'file' && (ssp.exts || []).join() === 'wav,ogg', 'browse: a sound\'s Browse reaches the picker at sound/ with wav and ogg', JSON.stringify(ssp));
  v = P.kinds['xt-find'].value({}, st);
  ok(v.ok && v.answer.ref.key === 'resource/sound/a.wav' && v.answer.of === 'sound' && by(host, 'data-xt-words')[0].value === 'a.wav', 'a browsed file is picked with its key, its name in the box', JSON.stringify(v));
  // Browse (map): the folder picker at map/; the folder's path is looked up
  {
    const mst = { draft: { id: 'x-thing-m', mod: 'G:/game/mods/mine', answers: { kind: { src: 'value', value: 'map' } } } }, mh = el('div'), n0 = P.picks.length, c0 = P.calls.length;
    P.kinds['xt-find'].draw({ id: 'thing' }, mst, mh); await tick();
    P.pickWith('resource/map/multi/1v1_argentan'); by(mh, 'data-xt-browse')[0].ev.click(); P.pickWith(null); await tick();
    const sp = P.picks[n0] || {};
    ok(sp.mode === 'dir' && sp.view === 'data' && sp.start === 'map' && P.calls.slice(c0).some(c => /kind=map/.test(c[0]) && /q=map%2Fmulti%2F1v1_argentan(&|$)/.test(c[0])), 'browse: a map\'s Browse is the folder picker at map/, the folder\'s path looked up', JSON.stringify(sp));
  }
  const stale = P.kinds['xt-find'].value({}, { draft, pick: null });
  ok(!stale.ok, 'no pick, no answer');
  ok(P.kinds['xt-look'].draw && (() => { const d = { answers: { kind: { src: 'value', value: 'gun' }, thing: draft.answers.thing } }; const hh = el('div'); P.kinds['xt-look'].draw({}, { draft: d }, hh); return /noThing/.test(hh.textContent); })(), 'a pick of another kind is not used (the kind was changed)');

  // a lookup with nothing to pick says why and what to do (README Changes 53); a result with the id ? is a message line
  const PW = pageWith(Object.assign({}, replies, { '/api/x/task/lookup': { results: [], total: 0, why: 'task.x-thing.k.why.noGame', do: 'task.x-thing.k.do.noGame' } }));
  host = el('div'); PW.kinds['xt-find'].draw({ id: 'thing' }, { draft: { mod: '', answers: { kind: { src: 'value', value: 'gun' } } } }, host); await tick();
  ok(by(host, 'data-xt-why').length === 1 && /k.why.noGame/.test(by(host, 'data-xt-why')[0].textContent) && /k.do.noGame/.test(by(host, 'data-xt-do')[0].textContent) && !/k.none/.test(host.textContent), 'an empty list with a why shows the why and what to do, not "nothing found"', host.textContent);
  const PM = pageWith(Object.assign({}, replies, { '/api/x/task/lookup': { results: [{ id: '?', name: 'Set the game folder first' }], total: 1 } }));
  host = el('div'); PM.kinds['xt-find'].draw({ id: 'thing' }, { draft: { mod: '', answers: { kind: { src: 'value', value: 'gun' } } } }, host); await tick();
  ok(!by(host, 'data-xt-hit').length && /Set the game folder first/.test(host.textContent), 'a message line is said, not offered as a pick', host.textContent);

  // look
  ({ st, host } = await draw('xt-look'));
  ok(P.mounted[P.mounted.length - 1] === 'resource/entity/-vehicle/t34_85/t34.dds', 'the first texture or icon is shown in the look pane', P.mounted.join());
  by(host, 'data-xt-3d')[0].ev.click(); await tick();
  ok(P.models[0] === 'resource/entity/-vehicle/t34_85/t34.mdl', 'the 3D button opens the model on the Models page', P.models.join());
  ok(/k.saved/.test(P.toasts.pop() || '') && by(host, 'data-xt-3d')[0].attrs.title === 'task.x-thing.k.closes', 'leaving for the Models page says the task is saved; the button says it closes the task', P.toasts.join());
  by(host, 'data-xt-file', 'resource/interface/icons/t34.tga')[0].ev.click(); await tick();
  ok(P.closed.includes('resource/entity/-vehicle/t34_85/t34.dds') && P.mounted[P.mounted.length - 1] === 'resource/interface/icons/t34.tga', 'a new file closes the viewer before and shows itself', P.closed.join());
  P.kinds['xt-look'].leave({}, st, host);
  ok(P.closed.includes(P.mounted.pop()), 'leave closes the viewer the screen opened (the sound stops, the 3D view ends)', P.closed.join());
  const mdraft = { mod: 'G:/game/mods/mine', answers: { kind: { src: 'value', value: 'map' }, thing: { src: 'exist', value: 'map/multi/1v1_argentan', name: 'Argentan', of: 'map' } } };
  host = el('div'); P.kinds['xt-look'].draw({}, { draft: mdraft }, host); await tick();
  const img = by(host, 'data-xt-svg')[0];
  ok(img && /^data:image\/svg\+xml;charset=utf-8,%3Csvg/.test(img.attrs.src) && P.mounted.pop() === 'resource/map/multi/1v1_argentan/preview.dds', 'a map shows its picture from above and its preview', img && img.attrs.src);

  // numbers
  ({ host } = await draw('xt-numbers'));
  ok(/T-34\/85/.test(host.textContent) && /90 \/ 75 \/ 75 \/ 20/.test(host.textContent) && /k\.n\.armor/.test(host.textContent) && /k\.n\.yes/.test(host.textContent), 'a unit shows its numbers in plain words', host.textContent);
  const gdraft = { mod: 'G:/game/mods/mine', answers: { kind: { src: 'value', value: 'gun' }, thing: { src: 'exist', value: '85mm_zis', name: '85mm_zis', ref: { key: 'resource/set/stuff/gun/85mm_zis' }, sub: 'gun', of: 'gun' } } };
  host = el('div'); P.kinds['xt-numbers'].draw({}, { draft: gdraft }, host); await tick();
  ok(all(host, e => e.attrs.class === 'xt-card').length === 2 && /\b77\b/.test(host.textContent), 'a gun shows each shell, the aim range value read between the points (120 -> 77 mm)', host.textContent);
  host = el('div'); P.kinds['xt-numbers'].draw({}, { draft: mdraft }, host); await tick();
  ok(/Argentan/.test(host.textContent) && /combat/.test(host.textContent) && /k\.n\.game/.test(host.textContent), 'a map shows its players, modes and where it comes from', host.textContent);

  // compare
  ({ st, host } = await draw('xt-compare'));
  by(host, 'data-xt-words')[0].value = 'pz'; by(host, 'data-xt-find')[0].ev.click(); await tick();
  by(host, 'data-xt-hit', 'pz4_h')[0].ev.click(); await tick();
  const side = by(host, 'data-xt-side')[0];
  ok(/Pz IV H/.test(side.textContent) && all(side, e => /xt-diff/.test(e.attrs.class || '')).length >= 3, 'side by side, the differing numbers marked', side.textContent);
  v = P.kinds['xt-compare'].value({}, st);
  ok(v.ok && v.answer.other === 'pz4_h', 'the compare answer keeps the other one', JSON.stringify(v));
  ok(P.kinds['xt-compare'].value({}, { draft }).answer.other === '', 'compare can be skipped');

  // pierce
  host = el('div'); P.kinds['xt-pierce'].draw({}, { draft: gdraft }, host); await tick();
  ok(by(host, 'data-xt-sum', '2/1/3').length === 1, 'the best shell (129 mm close, 77 mm far) against 3 vehicles with armor: 2 close, 1 far', by(host, 'data-xt-sum').map(e => e.attrs['data-xt-sum']).join());
  ok(by(host, 'data-xt-tank').map(e => e.attrs['data-xt-tank']).join() === 'c', 'the vehicles it cannot pierce up close are listed');
  const us = P.calls.filter(c => c[0] === '/api/x/units/search').pop();
  ok(us && us[1].kind === 'vehicle' && us[1].all === true, 'the vehicle list is read once for all', JSON.stringify(us));

  // on a map
  host = el('div'); P.kinds['xt-onmap'].draw({}, { draft: mdraft }, host); await tick();
  ok(by(host, 'data-xt-def').length === 2 && /combat\.mi/.test(host.textContent), 'the objects on a map, counted', host.textContent);
  ok(P.calls.some(c => c[0].indexOf('/api/x/task/r/x-thing/entities?map=map%2Fmulti%2F1v1_argentan&mod=') === 0), 'the own route is asked with the map key and the mod');

  // files
  ({ host } = await draw('xt-files'));
  ok(by(host, 'data-xt-file').length === 4 && /k\.f\.role\.texture/.test(host.textContent) && /k\.f\.inmod/.test(host.textContent), 'the unit files by role, the ones in the mod marked', host.textContent);
  by(host, 'data-xt-file', 'resource/entity/-vehicle/t34_85/t34_85.def')[0].ev.click(); await tick();
  ok(by(P.look, 'data-xt-open').length === 1, 'a file with no viewer here gets an Open button in the look pane');
  // (a sound picked: sdraft has no thing)
  const fdraft = Object.assign({}, sdraft, { answers: { kind: sdraft.answers.kind, thing: { src: 'exist', value: 'resource/sound/a.wav', name: 'a.wav', ref: { key: 'resource/sound/a.wav' }, of: 'sound' } } });
  const nf0 = P.calls.length;
  host = el('div'); P.kinds['xt-files'].draw({}, { draft: fdraft }, host); await tick();
  ok(P.calls.slice(nf0).some(c => c[0] === '/api/x/ide/vdir?mod=G%3A%2Fgame%2Fmods%2Fmine&dir=sound'), 'a file thing lists its own folder', P.calls.filter(c => /vdir/.test(c[0])).map(c => c[0]).join(' | '));

  // used
  ({ host } = await draw('xt-used'));
  await tick(10);
  const ln = by(host, 'data-xt-link');
  ok(refsN === 2 && ln.length === 1 && P.calls.filter(c => c[0] === '/api/x/ide/refs').every(c => c[1].name === 't34_85'), 'while the name list builds it asks again, then lists the places', refsN + ' ' + ln.length);
  ln[0].ev.click(); await tick();
  ok(P.links.pop() === 'key:resource/set/multiplayer/units/vehicles_rus.set:12', 'a place opens in the Editor through the link');
  ok(/k.saved/.test(P.toasts.pop() || ''), 'leaving for the Editor says the task is saved');
  const odraft = { mod: 'G:/game/mods/mine', answers: { kind: { src: 'value', value: 'model' }, thing: { src: 'exist', value: 'resource/entity/-vehicle/t34_85/body.ply', name: 'body.ply', ref: { key: 'resource/entity/-vehicle/t34_85/body.ply' }, of: 'model' } } };
  host = el('div'); P.kinds['xt-used'].draw({}, { draft: odraft }, host); await tick(10);
  ok(by(host, 'data-xt-owner', 'resource/entity/-vehicle/t34_85/t34.mdl').length === 1 && P.calls.filter(c => c[0] === '/api/x/ide/refs').pop()[1].name === 'body', 'a model part shows its model and is looked up by its name', host.textContent);

  // wins, mod changes
  ({ host } = await draw('xt-wins'));
  const cp = P.calls.find(c => c[0].indexOf('/api/x/ide/copies') === 0);
  ok(cp && /key=resource%2Fentity%2F-vehicle%2Ft34_85%2Ft34_85\.def/.test(cp[0]), 'the unit file comes from its numbers (def)', cp && cp[0]);
  ok(by(host, 'data-xt-copy').length === 3 && all(host, e => /xt-win/.test(e.attrs.class || '')).length === 1 && /k\.w\.kind\.mine/.test(host.textContent) && /k\.w\.why/.test(host.textContent), 'every copy, the winner marked, the why said', host.textContent);
  ({ host } = await draw('xt-modchg'));
  ok(by(host, 'data-xt-mine', '1').length === 1 && by(host, 'data-xt-other').length === 1, 'your copy and the other mods are said');
  ok(by(host, 'data-xt-unit', 'changed').length === 1 && all(host, e => /xt-diff/.test(e.attrs.class || '')).length === 1 && /100/.test(host.textContent), 'the card numbers the mods changed (only the cost here)', host.textContent);
  ok(P.calls.filter(c => c[0].indexOf('/api/x/ide/copies') === 0).length === 1, 'the copies are read once for both screens');

  // next
  ({ host } = await draw('xt-next'));
  await tick(10);
  const go = by(host, 'data-xt-go').map(e => e.attrs['data-xt-go']);
  ok(go.join() === 'vehicle:make,vehicle:change,skin:make,skin:change', 'make and change buttons for the matching built tasks', go.join());
  ok(by(host, 'data-xt-go', 'vehicle:make')[0].attrs['data-xt-base'] === 't34_85' && by(host, 'data-xt-go', 'skin:make')[0].attrs['data-xt-base'] === '', 'the base is the exact hit of the task\'s own lookup; none found, none given');
  ok(/k\.x\.notReady/.test(host.textContent) && /k\.x\.nobase/.test(host.textContent), 'a task not built yet and a base not found are said');
  by(host, 'data-xt-go', 'vehicle:change')[0].ev.click(); await tick();
  const op = P.opened.pop();
  ok(op && op[0] === 'vehicle' && op[1] === 'change' && op[2].base && op[2].base.id === 't34_85', 'a button closes this task and opens that one with the base', JSON.stringify(op));

  // price (a unit) and balance (a gun): the balance sheet, read once
  ({ host } = await draw('xt-price'));
  ok(by(host, 'data-xt-prow', 't34_85').length === 1 && by(host, 'data-xt-place', '2/2').length === 1, 'the price card and its place among the medium units of its army (2 of 2)', host.textContent);
  ok(by(host, 'data-xt-odd', 'PRICE_HIGH').length === 1 && /\+20 %/.test(host.textContent) && /k\.pr\.fit/.test(host.textContent), 'the model price, how far off it is and the balance warning', host.textContent);
  ok(by(host, 'data-xt-same').map(e => e.attrs['data-xt-same']).join() === 't34_76,t34_85' && all(host, e => /xt-win/.test(e.attrs.class || '')).length === 1, 'the same class in the same army, cheapest first, itself marked');
  const pdraft = { mod: 'G:/game/mods/mine', answers: { kind: { src: 'value', value: 'unit' }, thing: { src: 'exist', value: 'no_such', name: 'no_such', of: 'unit' } } };
  host = el('div'); P.kinds['xt-price'].draw({}, { draft: pdraft }, host); await tick();
  ok(/k\.pr\.none/.test(host.textContent) && !by(host, 'data-xt-prow').length, 'a unit not on the sheet says it cannot be bought');
  host = el('div'); P.kinds['xt-balance'].draw({}, { draft: gdraft }, host); await tick();
  ok(by(host, 'data-xt-users', '2').length === 1 && by(host, 'data-xt-cal', '85').length === 1, 'the units that carry the gun and its calibre', host.textContent);
  ok(by(host, 'data-xt-peer').map(e => e.attrs['data-xt-peer']).join() === '85mm_zis,85mm_d5' && all(host, e => /xt-win/.test(e.attrs.class || '')).length === 1, 'the guns of the same calibre, best penetration first, this one marked');
  const bt = P.calls.filter(c => c[0] === '/api/x/balance/table');
  ok(bt.length === 1 && bt[0][1].mod === 'G:/game/mods/mine', 'the balance sheet is read once, for the mod', bt.length);

  // leave stops the retries of a screen (a name list still building)
  let building = 0;
  const PB = pageWith(Object.assign({}, replies, { '/api/x/ide/refs': () => { building++; return { building: true, hits: [] }; } }));
  const ub = el('div'), ust = { draft }; PB.kinds['xt-used'].draw({}, ust, ub); await tick(4);
  const before = building; PB.kinds['xt-used'].leave({}, ust, ub); await tick(20);
  ok(before >= 1 && building === before, 'after leave the screen asks no more (' + before + ' asks before, ' + building + ' after)');

  // a scan cut short by the route's time budget (truncated) is not "no file names it"
  // the line names the real reason (r.why): only 'time' (and 'abort') says it took too long
  const hit1 = [{ link: 'key:resource/set/a.set:3', where: 'vanilla', text: 'x' }];
  for (const [hits, why, key, n] of [[[], 'time', 'k.u.cut', 0], [hit1, 'time', 'k.u.cutsome', 1], [hit1, 'abort', 'k.u.cutsome', 1], [hit1, 'hits', 'k.u.cap', 1],
    [hit1, 'files', 'k.u.capfiles', 1], [[], 'files', 'k.u.capfiles', 0], [[], 'error', 'k.u.fail', 0]]) {
    const PT = pageWith(Object.assign({}, replies, { '/api/x/ide/refs': () => ({ hits, truncated: true, why }) }));
    const ut = el('div'); PT.kinds['xt-used'].draw({}, { draft }, ut); await tick(10);
    const cutEl = by(ut, 'data-xt-cut');
    ok(cutEl.length === 1 && cutEl[0].textContent.indexOf(key) >= 0 && (key === 'k.u.cut' || key === 'k.u.cutsome' || !/k\.u\.cut/.test(cutEl[0].textContent)) && !/k\.u\.none/.test(ut.textContent) && by(ut, 'data-xt-link').length === n,
      'a truncated ref scan (why ' + why + ', ' + n + ' hits) says why it stopped (' + key + '), never "no file names it"', ut.textContent);
  }
  { const PN = pageWith(Object.assign({}, replies, { '/api/x/ide/refs': () => ({ hits: [] }) })); const un = el('div'); PN.kinds['xt-used'].draw({}, { draft }, un); await tick(10);
    ok(/k\.u\.none/.test(un.textContent) && !by(un, 'data-xt-cut').length, 'a full ref scan with no hits says no file names it', un.textContent); }

  // no mod picked: the game as it ships (files/lib readMod). The Editor's routes still refuse with no mod (400): those screens ask
  // anyway and show "needs a mod" on the refusal; a second page where they answer shows the same screens switch over by themselves
  const refuse = () => Object.assign(new Error('Pick your mod folder first (Mods page).'), { status: 400 });
  const noModReplies = Object.assign({}, replies, {
    '/api/x/task/catalogue': { recipes: [{ id: 'vehicle', verbs: ['make', 'change'], built: true, needs: ['mod', 'picked'], title: 'task.vehicle.t' }, { id: 'skin', verbs: ['make', 'change'], built: true, needs: [], title: 'task.skin.t' }] },
    '/api/x/files/which': { mod: null, chain: [{ kind: 'vanilla', layer: 'base', container: 'G:/game/resource/entity/e2.pak', entry: 'x.def', winner: true }], notes: ['no-mod'] },
    '/api/x/view/sound/plan': { kind: 'wav', header: { codec: 'pcm', channels: 1, rate: 22050, seconds: 1.5 }, size: 1234 },
    '/api/x/view/picture/info': { format: 'DXT5', width: 64, height: 32, mips: 1, alpha: 'yes', size: 999, notes: [] },
  });
  const P0 = pageWith(Object.assign({}, noModReplies, { '/api/x/ide/vdir': refuse, '/api/x/ide/copies': refuse, '/api/x/ide/refs': refuse }), '');
  const d0 = { mod: '', answers: draft.answers }, s0 = { mod: '', answers: { kind: sdraft.answers.kind, thing: { src: 'exist', value: 'resource/sound/a.wav', name: 'a.wav', ref: { key: 'resource/sound/a.wav' }, of: 'sound' } } }, o0 = { mod: '', answers: odraft.answers };
  const draw0 = async (kind, d) => { const hh = el('div'); P0.kinds[kind].draw({}, { draft: d }, hh); await tick(10); return hh; };
  host = await draw0('xt-numbers', d0);
  ok(/T-34\/85/.test(host.textContent) && !by(host, 'data-xt-nomod').length, 'a unit\'s numbers need no mod');
  host = await draw0('xt-look', d0);
  ok(!by(P0.look, 'data-xt-nomod').length && P0.mounted[0] === 'resource/entity/-vehicle/t34_85/t34.dds', 'with no mod the look pane mounts the viewer (the viewer itself decides what it can read)', P0.mounted.join());
  by(host, 'data-xt-3d')[0].ev.click(); await tick();
  ok(!P0.models.length && /k.needMod/.test(P0.toasts.pop() || ''), 'if the Models page cannot take the key (VIEW.item null) the 3D button stays here and says why');
  host = await draw0('xt-price', d0);
  ok(by(host, 'data-xt-prow', 't34_85').length === 1 && P0.calls.filter(c => c[0] === '/api/x/balance/table').every(c => c[1].mod === ''), 'the price reads the game as it ships');
  host = await draw0('xt-wins', d0);
  ok(by(host, 'data-xt-copy', 'vanilla').length === 1 && all(host, e => /xt-win/.test(e.attrs.class || '')).length === 1 && !by(host, 'data-xt-nomod').length, 'which copy wins: the game\'s own chain with no mod (files/which), the copies refusal not shown', host.textContent);
  for (const [k, d, what] of [['xt-numbers', s0, /pcm/], ['xt-numbers', { mod: '', answers: { kind: { src: 'value', value: 'picture' }, thing: { src: 'exist', value: 'resource/interface/a.dds', name: 'a.dds', ref: { key: 'resource/interface/a.dds' }, of: 'picture' } } }, /DXT5/], ['xt-numbers', o0, /t34\.mdl/]]) {
    host = await draw0(k, d);
    ok(what.test(host.textContent) && !by(host, 'data-xt-nomod').length, 'with no mod the numbers of a ' + d.answers.kind.value + ' read the game (view routes)', host.textContent);
  }
  // with no mod Browse still opens the file picker over the game data (no folder route of its own)
  { const n0 = P0.picks.length; host = el('div'); P0.kinds['xt-find'].draw({}, { draft: s0 }, host); await tick(); by(host, 'data-xt-browse')[0].ev.click(); await tick(10);
    ok(P0.picks.length === n0 + 1 && P0.picks[n0].view === 'data' && P0.picks[n0].start === 'sound' && !by(host, 'data-xt-nomod').length, 'with no mod Browse opens the file picker at the game\'s sound folder', JSON.stringify(P0.picks[n0])); }
  for (const [k, d] of [['xt-used', d0], ['xt-files', s0], ['xt-modchg', d0]]) {
    host = await draw0(k, d);
    ok(by(host, 'data-xt-nomod').length === 1 && !/k\.fail/.test(host.textContent), k + ' says a mod is needed (a refusal, or mod-only)', host.textContent);
  }
  ok(['/api/x/ide/vdir', '/api/x/ide/refs', '/api/x/ide/copies', '/api/x/files/which'].every(r => P0.calls.some(c => c[0].indexOf(r) === 0)), 'the Editor routes are asked anyway, so they switch over by themselves');
  // the Editor routes opened: the same screens with no mod work
  const P1 = pageWith(noModReplies, '', true);
  const draw1 = async (kind, d) => { const hh = el('div'); P1.kinds[kind].draw({}, { draft: d }, hh); await tick(10); return hh; };
  host = await draw1('xt-used', d0);
  ok(by(host, 'data-xt-link').length === 1 && !by(host, 'data-xt-nomod').length, 'once ide/refs answers with no mod, where it is used shows the places');
  host = await draw1('xt-files', s0);
  ok(by(host, 'data-xt-file', 'resource/sound/a.wav').length === 1 && !by(host, 'data-xt-nomod').length, 'once ide/vdir answers, the folder of a file shows', host.textContent);
  host = await draw1('xt-wins', d0);
  ok(by(host, 'data-xt-copy').length === 3 && !by(host, 'data-xt-nomod').length, 'once ide/copies answers, every copy shows');
  host = await draw1('xt-look', d0); by(host, 'data-xt-3d')[0].ev.click(); await tick();
  ok(P1.models.length === 1, 'once the viewers take a key with no mod, the 3D button opens the Models page');
  host = await draw1('xt-modchg', d0);
  ok(by(host, 'data-xt-nomod').length === 1, 'what a mod changed stays mod-only');
  host = await draw0('xt-next', d0);
  ok(by(host, 'data-xt-rid', 'vehicle')[0] && by(by(host, 'data-xt-rid', 'vehicle')[0], 'data-xt-nomod').length === 1 && !by(host, 'data-xt-go', 'vehicle:make').length && by(host, 'data-xt-go', 'skin:make').length === 1,
    'a task that writes into a mod is not offered with no mod; one that picks its own is', host.textContent);

  ok(P.calls.concat(P0.calls).every(c => !/\/(save|write|copy|clone|place|camo-write|draft\/save)\b/.test(c[0])), 'no screen asks to write');

  // ---- the own lookups and route on this PC (read only)
  const game = kit.findGame({});
  if (!game) console.log('note: SKIP the game reads: no game folder on this PC');
  else {
    try {
      const ctx = kit.ctxFor(path.join(scratch, 'ctx'), { gameDir: game });
      const g = await R.lookups.gun(ctx, '85mm', {});
      ok(g.length > 0 && g.every(x => x.id && /^resource\/set\/stuff\/[a-z_]+\/85mm/.test(x.ref.key)), 'the gun lookup finds guns by words with their stuff file', JSON.stringify(g[0]));
      const gz = await R.lookups.gun(ctx, 'zzqx no such gun', {});
      ok(gz.results && !gz.results.length && gz.why === 'task.x-thing.k.why.noWords' && gz.do, 'a gun lookup with no hit says why and what to do', JSON.stringify(gz));
      const pz = await R.lookups.picture(ctx, 'zzqx', {});
      ok(pz.why === 'task.x-thing.k.why.noWords', 'a picture lookup with no hit says why', JSON.stringify(pz));
      const pc = await R.lookups.picture(ctx, 'font', {});
      ok(pc.some(x => /\.fnt$/.test(x.id) && x.sub === 'font') && pc.every(x => /\.(dds|tga|png|bmp|jpg|fnt)$/.test(x.id) && x.id.includes('font')), 'the picture lookup finds pictures and fonts by words', JSON.stringify(pc.slice(0, 2)));
      const E = R.routes['GET /api/x/task/r/x-thing/entities'], U = q => new URL('http://127.0.0.1/api/x/task/r/x-thing/entities?' + new URLSearchParams(q));
      let e1 = await E(U({ map: 'map/multi/1v1_argentan' }), null, ctx);
      if (!e1.found) { const any = (require('../../files/lib').vfsFor(ctx, '').v || { files: new Map() }); const k = [...any.files.keys()].find(x => /^resource\/map\/multi\/[^/]+\/map$/.test(x)); if (k) e1 = await E(U({ map: k.slice(9, -4) }), null, ctx); }
      ok(e1.found && e1.total > 0 && e1.defs.length > 0 && e1.defs.every((d, i, a) => !i || a[i - 1].n >= d.n) && e1.files.includes('map'), 'the objects of a game map, the most first (' + e1.map + ': ' + e1.total + ')', JSON.stringify(e1).slice(0, 300));
      let bad = null; try { await E(U({ map: '../../x' }), null, ctx); } catch (x) { bad = x; }
      ok(bad && bad.status === 400, 'a key that is no map key is refused');
      const none = await E(U({ map: 'map/multi/no_such_map_here' }), null, ctx);
      ok(none.found === false && none.total === 0, 'a map that is not there gives nothing, no error');
      // no mod picked: the read path the which-copy-wins screen and the viewers use reads the game as it ships
      const FL = require('../../files/lib'), anyDef = [...(FL.vfsFor(ctx, '').v || { files: new Map() }).files.keys()].find(x => /^resource\/entity\/-vehicle\/.*\.def$/.test(x));
      const wh = anyDef ? await FL.which(ctx, { mod: FL.readMod(ctx, ''), key: anyDef }) : null;
      ok(FL.readMod(ctx, '') === null && wh && (wh.chain || []).some(c => c.winner && c.kind === 'vanilla'), 'with no mod the game\'s own copy wins (files/lib readMod, which)', JSON.stringify(wh).slice(0, 300));
    } catch (e) { ok(false, 'the game reads', e.stack); }
    try { await realRoutes(game); } catch (e) { ok(false, 'the screens on the real routes with no mod', e.stack); }
  }

  try { await realPage(); } catch (e) { ok(false, 'the real page test', e.stack); }

  console.log('own checks: ' + p + ' passed, ' + f + ' failed');
  await kit.run(R, LANG, { validate: { kinds: C.kinds }, verb: 'explore', answers: { kind: 'gun' } }, scratch);
  if (f) { console.log('FAIL'); process.exitCode = 1; }
  process.exit(process.exitCode || 0);   // the page's self re-arming timers (footer job list clock and poll) run as setImmediate here and would hold the process for ever
})().catch(e => { console.log('FAIL crash ' + (e.stack || e)); console.log('FAIL'); process.exitCode = 1; });
