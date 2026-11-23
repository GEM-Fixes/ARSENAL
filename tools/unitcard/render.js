#!/usr/bin/env node
// unitcard/render: the unit's card pictures rendered headless, the same way the Units page tool "Unit card" renders them: the GUI's own
// 3D viewer (tools/gui/ext/models/sub/viewer.client.js, snapshot with a view camera) in a headless browser (tools/gui/browser.js finds
// Edge or Chrome) against a GUI server this command starts on a free port and stops after. Read only: writes PNGs into --out only.
//   node tools/unitcard/render.js --game as64|mowas2|goh [--dir install] [--mod M] --unit U [--kinds card,small,...] --out dir
//     [--breed mp/<army>/<name>] [--weapon <entity>] [--scale 8] [--az A --el E --fov F] [--json]
//   writes <unit>_<kind>.png (RGBA, see-through background, --scale x the kind's size, default 8, the longer side at most 2400).
//   A vehicle or gun renders alone (no crew); a portrait the soldier of the breed (no breed: the buy's first soldier); an infantry card
//   the squad's main weapon (GoH: up to 3 weapon types, most carried first: <unit>_card.png, _card_2.png, _card_3.png); a squad
//   picture nothing (the game shows an emblem: an image or a game badge, said in its line, not a fault).
//   Camera, fit and light per game + kind + class: lib/camera.js (presets fitted on the game's own cards, see there).
// API (fitting and tests): session({ gid, dir, mod, tmp }) -> { unit(spec), render(spec, shots), close() }
//   unit(spec) -> the card route's answer for spec { id, kind, army, breed }: { unit, kinds: [{ kind, w, h, ... }] }
//   render(spec, shots) -> [{ id, url (PNG data URL) | null, info }] for shots [{ id, w, h, view, light, scene: 'vehicle'|'soldier'|'weapon'|'buy' }]
//   weapons(spec) -> [{ model, item, name, n, hands }] the weapons of an infantry buy, most carried first (the weapon scene draws the
//     first, or spec.weapon = one of their models)
//   one scene per scene kind is loaded and every shot of it is taken from that one scene.
// Env: ARSENAL_BROWSER (a browser exe), ARSENAL_TMP or UC_TMP (scratch; else the OS temp).
// Exit: 0 every asked kind has a picture, 1 a kind has none (said why), 2 bad use or no browser.
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-35ac5978)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const CAM = require('./lib/camera');
const GUI = path.join(__dirname, '..', 'gui');

const wait = ms => new Promise(r => setTimeout(r, ms));
function scratch() {
  const env = process.env.ARSENAL_TMP || process.env.UC_TMP;
  const base = env || os.tmpdir();
  const d = path.join(base, 'unitcard-render'); fs.mkdirSync(d, { recursive: true }); return d;
}
const safeName = s => String(s).replace(/[^A-Za-z0-9_.()-]+/g, '_').slice(0, 120);

// ---------- a headless browser driven over the DevTools protocol (node 22+: fetch and WebSocket built in) ----------
async function browser(url, prof) {
  if (typeof WebSocket !== 'function' || typeof fetch !== 'function') throw new Error('node 22 or newer is needed (fetch and WebSocket).');
  const exe = require(path.join(GUI, 'browser')).find();
  if (!exe) throw Object.assign(new Error('No Edge or Chrome found (set ARSENAL_BROWSER to a browser exe).'), { code: 2 });
  fs.rmSync(prof, { recursive: true, force: true }); fs.mkdirSync(prof, { recursive: true });
  const p = cp.spawn(exe, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--user-data-dir=' + prof, '--window-size=1280,900', '--remote-debugging-port=0', url],
  { shell: false, windowsHide: true, stdio: 'ignore' });
  p.on('error', () => {});
  const t0 = Date.now(), left = () => 60000 - (Date.now() - t0);
  const json = async u => { try { return await (await fetch(u)).json(); } catch (e) { return null; } };
  let base = null, pg = null;
  while (!base && left() > 0) { try { const port = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); if (port) base = 'http://127.0.0.1:' + port; } catch (e) { await wait(150); } }
  while (base && !pg && left() > 0) { const l = await json(base + '/json/list'); pg = l && l.find(x => x.type === 'page' && String(x.url).startsWith(url)); if (!pg) await wait(150); }
  if (!pg) { try { p.kill(); } catch (e) { /* gone */ } throw new Error('The headless browser did not open the page.'); }
  const ws = new WebSocket(pg.webSocketDebuggerUrl), pend = {}; let id = 0;
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('DevTools socket error')); });
  ws.onmessage = m => { const j = JSON.parse(m.data); if (j.id && pend[j.id]) { pend[j.id](j); delete pend[j.id]; } };
  const send = (method, params) => new Promise(r => { const k = ++id; pend[k] = r; ws.send(JSON.stringify({ id: k, method, params: params || {} })); });
  // run an expression in the page; a promise is awaited; -> its value (JSON) or throws the page's error
  async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    const x = r && r.result; if (!x) throw new Error('DevTools: no answer');
    if (x.exceptionDetails) throw new Error('page: ' + ((x.exceptionDetails.exception && x.exceptionDetails.exception.description) || x.exceptionDetails.text));
    return x.result ? x.result.value : undefined;
  }
  async function close() {
    const v = base ? await json(base + '/json/version') : null;
    try { ws.close(); } catch (e) { /* closed */ }
    if (v && v.webSocketDebuggerUrl) { try { const b = new WebSocket(v.webSocketDebuggerUrl); await new Promise(r => { b.onopen = r; b.onerror = r; }); b.send(JSON.stringify({ id: 1, method: 'Browser.close' })); await wait(400); b.close(); } catch (e) { /* gone */ } }
    try { p.kill(); } catch (e) { /* gone */ }
    for (let i = 0; i < 10; i++) { try { fs.rmSync(prof, { recursive: true, force: true }); break; } catch (e) { await wait(300); } }
  }
  return { ev, send, close };
}

// the page side of a render: a hidden view of the scene route, then one snapshot per shot (ES5, run in the page)
const PAGE_RENDER = function (spec) {
  return new Promise(function (res) {
    var V = window.__as2viewer; if (typeof V !== 'function') { res({ error: 'the 3D viewer is not on the page' }); return; }
    var host = document.createElement('div'); host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:absolute;left:-9999px;top:0;width:64px;height:64px;overflow:hidden';
    document.body.appendChild(host);
    var v = null; try { v = V({ set: {}, mod: spec.mod || null }, { doc: false, compact: true, height: 64, blk: 'ucrender', show: { volumes: false, grid: false, bones: false, axes: false, names: false, volNames: false, entities: false, bounds: false }, scene: { url: '/api/x/units/card/scene', body: spec.body } }); } catch (e) { v = null; }
    if (!v || typeof v.snapshot !== 'function') { host.remove(); res({ error: 'no WebGL in this browser' }); return; }
    host.appendChild(v);
    var out = [], i = 0, t0 = Date.now(), dead = null;
    (function next() {
      if (i >= spec.shots.length) { var st = v._st && v._st(), sc = st && st.SC; host.remove(); res({ shots: out, meshes: sc && sc.meshes ? sc.meshes.length : 0, texBad: st ? Object.keys(st.texBad || {}).length : 0, ms: Date.now() - t0 }); return; }
      var s = spec.shots[i++];
      // the scene itself failed (late, unreadable, empty): every other shot of it says the same, none waits again
      if (dead) { out.push({ id: s.id, url: null, info: dead }); next(); return; }
      v.snapshot({ width: s.w, height: s.h, view: s.view, light: s.light, wait: spec.wait || 60000, sceneWait: spec.sceneWait || 600000 }, function (url, info) { out.push({ id: s.id, url: url, info: info || {} }); if (!url && info && /^(timeout|failed|nomesh)$/.test(info.why)) dead = info; next(); });
    })();
  });
};

// ---------- a session: one GUI server and one browser for many renders ----------
async function session(o = {}) {
  const gid = require('../lib/games').idOf(o.gid || 'as64');
  if (!gid) throw Object.assign(new Error('Unknown game "' + o.gid + '" (as64, mowas2 or goh).'), { code: 2 });
  const tmp = o.tmp || scratch();
  const G = require(path.join(GUI, 'gui'));
  const srv = await G.start({ port: 0, tmpRoot: path.join(tmp, 'gui') });
  let B = null;
  try {
    B = await browser(srv.url, path.join(tmp, 'prof-' + process.pid + '-' + Date.now().toString(36)));
    const t0 = Date.now();
    while (Date.now() - t0 < 30000 && !(await B.ev('typeof window.__as2viewer==="function"&&!!window.__as2in'))) await wait(150);
    // the page's game: the texture requests of the viewer carry it (header x-arsenal-game, GoH folder)
    if (gid !== 'as64') {
      await B.ev('localStorage.setItem("as2gui.gameId",' + JSON.stringify(JSON.stringify(gid)) + ');1');
      await B.send('Page.reload', {}); await wait(500);
      // while the page reloads an evaluate can come back empty ("DevTools: no answer"): that is "not yet", tried again
      const up = async () => { try { return await B.ev('typeof window.__as2viewer==="function"&&!!window.__as2in'); } catch (e) { return false; } };
      const t1 = Date.now(); while (Date.now() - t1 < 30000 && !(await up())) await wait(150);
    }
    if (gid === 'goh' && o.dir) await B.ev('(function(){var g=window.__as2in.GS;if(g&&g.goh)g.goh.dir=' + JSON.stringify(String(o.dir)) + ';return 1})()');
    if (!(await B.ev('typeof window.__as2viewer==="function"'))) throw new Error('The GUI page did not load the 3D viewer.');
  } catch (e) { if (B) await B.close(); await srv.close(); throw e; }
  const post = async (p, b) => {
    // a kept-alive socket the server has just closed fails the first try ("fetch failed"): one more try on a new one
    const go = () => fetch(srv.url.replace(/\/$/, '') + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-arsenal-game': gid }, body: JSON.stringify(b) });
    let r; try { r = await go(); } catch (e) { await wait(200); r = await go(); }
    const j = await r.json().catch(() => ({ error: 'HTTP ' + r.status })); if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status); return j;
  };
  // no mod: an empty scratch folder stands in (the viewer's textures are read through a mod view; empty = the game alone)
  const mod = o.mod ? String(o.mod) : (() => { const d = path.join(tmp, 'no-mod'); fs.mkdirSync(d, { recursive: true }); return d; })();
  const base = () => { const b = { gid, mod }; if (o.dir) b.game = String(o.dir); return b; };
  return {
    gid, url: srv.url,
    unit: spec => post('/api/x/units/card/current', Object.assign(base(), unitBody(spec))),
    weapons: spec => post('/api/x/units/card/weapons', Object.assign(base(), unitBody(spec))).then(j => j.weapons || []),
    async render(spec, shots) {
      const by = {}, order = [];
      for (const s of shots) { const k = s.scene || 'vehicle'; if (!by[k]) { by[k] = []; order.push(k); } by[k].push(s); }
      const out = [];
      for (const k of order) {
        // an emblem kind (squad pictures): the game shows an emblem, not a figure: nothing to render
        if (k === 'emblem') { for (const s of by[k]) out.push({ id: s.id, url: null, scene: k, info: { why: 'emblem' } }); continue; }
        const body = Object.assign(base(), unitBody(spec), sceneBody(k, spec));
        const r = await B.ev('(' + PAGE_RENDER.toString() + ')(' + JSON.stringify({ mod, body, wait: o.wait, sceneWait: o.sceneWait, shots: by[k].map(s => ({ id: s.id, w: s.w, h: s.h, view: s.view, light: s.light })) }) + ')');
        if (!r || r.error) { for (const s of by[k]) out.push({ id: s.id, url: null, info: { error: (r && r.error) || 'no answer', why: 'nogl' } }); continue; }
        for (const x of r.shots) out.push(Object.assign(x, { scene: k, meshes: r.meshes, texBad: r.texBad }));
      }
      return out;
    },
    async close() { try { await B.close(); } finally { await srv.close(); } },
  };
}
function unitBody(s) { const b = { id: String(s.id || '') }; for (const k of ['kind', 'army', 'breed', 'card']) if (s[k]) b[k] = String(s[k]); if (s.hero) b.hero = true; return b; }
// the scene route's body per scene kind: the vehicle alone, the breed's soldier alone, the squad's weapon alone (an infantry buy
// card: spec.weapon = its model, else the one most carried) or the whole buy
function sceneBody(k, spec) {
  if (k === 'soldier') return { kind: 'portrait', group: spec.group || 'infantry', breed: spec.breed || '' };
  if (k === 'weapon') return Object.assign({ kind: 'card', group: spec.group === 'hero' ? 'hero' : 'infantry' }, spec.weapon ? { weapon: String(spec.weapon) } : {});
  if (k === 'buy') return { kind: 'card', group: 'infantry' };
  return { kind: 'card', group: spec.group === 'gun' ? 'gun' : 'vehicle' };
}

// the shots of a unit: per kind its size x scale and the preset view (overrides az, el, fov) -> [{ id: kind, w, h, view, light, scene }]
function shotsOf(gid, group, kinds, o = {}) {
  const scale = Number(o.scale) > 0 ? Number(o.scale) : 8;
  return kinds.map(k => {
    const p = CAM.preset(gid, k.kind, group);
    const z = Math.max(1, Math.min(scale, 2400 / Math.max(k.w, k.h)));
    const view = CAM.view(p, o), light = CAM.light(p);
    return { id: k.kind, w: Math.round(k.w * z), h: Math.round(k.h * z), view, light, scene: p.scene, stack: p.stack || 1, preset: p };
  });
}

// a plain line for a kind with no picture (the GUI says the same, units.card.ren.why.*)
const WHY = { timeout: 'the 3D scene did not arrive in time', failed: 'the 3D scene could not be made', nomesh: 'the scene has no mesh to draw', nogl: 'no WebGL picture in the browser',
  emblem: 'the game shows an emblem on a shield here, not a soldier: nothing is rendered; give an image (your own emblem) or pick a game badge' };
function whyOf(info) { const w = info && info.why; return (WHY[w] || (info && info.error) || 'no picture') + (info && info.detail ? ': ' + info.detail : ''); }

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; if (!a.startsWith('--')) { o._bad = a; continue; }
    const k = a.slice(2), n = argv[i + 1]; if (n == null || n.startsWith('--')) o[k] = true; else { o[k] = n; i++; }
  }
  return o;
}
const USAGE = 'usage: node tools/unitcard/render.js --game as64|mowas2|goh [--dir install] [--mod M] --unit U [--kinds card,small,...] --out dir [--breed mp/<army>/<name>] [--scale 8] [--az A --el E --fov F] [--json]';

async function main() {
  const o = args(process.argv.slice(2));
  if (o.help || o.h) { console.log(USAGE); return 0; }
  if (o._bad || !o.unit || !o.out || o.unit === true || o.out === true) { console.error(USAGE); return 2; }
  const gid = require('../lib/games').idOf(o.game || 'as64') || null;
  if (!gid) { console.error('render: unknown game "' + o.game + '" (as64, mowas2 or goh).'); return 2; }
  if (o.mod && !fs.existsSync(String(o.mod))) { console.error('render: the mod folder was not found: ' + o.mod); return 2; }
  const S = await session({ gid, dir: o.dir || null, mod: o.mod || null });
  try {
    const cur = await S.unit({ id: o.unit, kind: o.kind, army: o.army, breed: o.breed });
    const u = cur.unit || {}, want = typeof o.kinds === 'string' ? o.kinds.split(',').map(s => s.trim()).filter(Boolean) : null;
    const kinds = (cur.kinds || []).filter(k => !want || want.includes(k.kind));
    const unknown = want ? want.filter(w => !kinds.some(k => k.kind === w)) : [];
    const spec = { id: o.unit, kind: o.kind || u.kind, army: o.army || u.army, breed: o.breed || u.breed || '', group: u.group, weapon: typeof o.weapon === 'string' ? o.weapon : '' };
    const shots = shotsOf(gid, u.group, kinds, { scale: o.scale, az: o.az, el: o.el, fov: o.fov });
    const res = await S.render(spec, shots);
    // the weapon an infantry card shows, named in its line
    let arms = null;
    if (shots.some(s => s.scene === 'weapon')) { try { arms = await S.weapons(spec); } catch (e) { arms = []; } }
    const armOf = () => (arms && (arms.find(w => w.model === spec.weapon) || (!spec.weapon && arms[0]))) || (spec.weapon ? { model: spec.weapon, name: '' } : null);
    fs.mkdirSync(String(o.out), { recursive: true });
    const rows = [];
    for (const s of shots) {
      const r = res.find(x => x.id === s.id) || { url: null, info: { error: 'not rendered' } };
      const row = { kind: s.id, w: s.w, h: s.h, scene: s.scene, view: s.view };
      if (s.scene === 'weapon' && armOf()) row.weapon = armOf().name ? armOf().name + ' (' + armOf().model + ')' : armOf().model;
      if (r.url) { const f = path.join(String(o.out), safeName(o.unit) + '_' + s.id + '.png'); fs.writeFileSync(f, Buffer.from(r.url.split(',')[1], 'base64')); row.file = f; row.fit = r.info && r.info.fit; }
      else { row.none = whyOf(r.info); if (r.info && r.info.why === 'emblem') row.emblem = true; }
      // a card that stacks the squad's weapons (GoH): the next most carried, one render each -> <unit>_<kind>_2.png, _3.png
      if (r.url && s.scene === 'weapon' && s.stack > 1 && arms && arms.length) {
        const main = armOf() && armOf().model, more = arms.map(w => w.model).filter(m => m && m !== main).slice(0, s.stack - 1);
        row.files = [row.file]; row.weapons = [main];
        for (let n = 0; n < more.length; n++) {
          const x = (await S.render(Object.assign({}, spec, { weapon: more[n] }), [s]))[0];
          if (!x || !x.url) continue;
          const f = path.join(String(o.out), safeName(o.unit) + '_' + s.id + '_' + (n + 2) + '.png'); fs.writeFileSync(f, Buffer.from(x.url.split(',')[1], 'base64'));
          row.files.push(f); row.weapons.push(more[n]);
        }
      }
      rows.push(row);
    }
    for (const w of unknown) rows.push({ kind: w, none: 'this unit has no picture of that kind in ' + gid });
    if (o.json) console.log(JSON.stringify({ gid, unit: u, rows }, null, 1));
    else for (const r of rows) console.log(r.file ? r.kind + ': ' + (r.files || [r.file]).join(', ') + ' (' + r.w + 'x' + r.h + (r.weapon ? ', weapon ' + (r.weapons ? r.weapons.join(', ') : r.weapon) : '') + ')' : r.kind + ': no picture (' + r.none + ')');
    return rows.every(r => r.file || r.emblem) ? 0 : 1;
  } finally { await S.close(); }
}

if (require.main === module) main().then(c => process.exit(c), e => { console.error('render: ' + (e && e.message || e)); process.exit(e && e.code === 2 ? 2 : 1); });
module.exports = { session, shotsOf, sceneBody, whyOf, WHY, args, browser, PAGE_RENDER };
