// mcp play group helpers (tools/mcp/tools/play.js): output scrub, scratch folder, the unit catalogue (balance.load, kept on disk
// and in the process), the unit finder, penetration at a range, the armour simulator opener, profile files. Read only on game data.
//   wrap(handler) -> handler   refusals and thrown errors become plain answers; the home folder and profile ids are taken out of
//                              text and data (README: nothing about the user in any output)
//   catalogue(ctx, g, mod) -> { entries: [{ id, name, army, unit, row|null, armour: [front, side, rear, top]|null }], eco }
//       unit = a balance `cur.units` item, row = its buy panel row (null for a vehicle no army can buy). armour = the hull ("body")
//       area when the unit has one, else the thickest plate per side of the row.
//   find(C, text, { vehicle, armed, army }) -> { best, also: [entries] }
//   penAt('10m:159 50m:143 ...', range) -> mm, straight line between table points, clamped at both ends (DMG-02)
//   simOpen(g, entry, mod) -> the armorsim model (sim.open) or { error }   AS2 and AS64 only
// Author: Imperator_Aug (ARSENAL, ia-aef98202)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const TOOLS = path.resolve(__dirname, '..', '..', '..');

// ---- small ----
const firstLine = s => (String(s || '').split(/\r?\n/).map(l => l.trim()).find(Boolean) || '').slice(0, 300);
const int = (v, d, lo, hi) => { const n = Math.round(+v); return Number.isFinite(n) && v != null && v !== '' ? Math.min(hi, Math.max(lo, n)) : d; };
const num = (v, d, lo, hi) => { const n = +v; return Number.isFinite(n) && v != null && v !== '' ? Math.min(hi, Math.max(lo, n)) : d; };
const count = (n, word) => n + ' ' + word + (n === 1 ? '' : word.endsWith('y') ? '' : 's');
const tally = list => { const o = {}; for (const k of list) if (k != null && k !== '') o[k] = (o[k] || 0) + 1; return o; };
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const dash = v => (v == null || v === '' ? '-' : String(v));
const span = a => { const s = a.slice().sort((x, y) => x - y); return s.length > 1 ? s[0] + ' to ' + s[s.length - 1] : String(s[0]); };
const mtime = f => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } };
function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  return s < 90 ? Math.round(s) + ' s ago' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 172800 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago';
}
const peText = pe => (pe == null ? '' : Array.isArray(pe) ? pe.join('.') : typeof pe === 'object' ? (pe.file || pe.product || pe.version || JSON.stringify(pe)) : String(pe));

// ---- scrub ----
function scrubber() {
  const pairs = [];
  const add = (dir, word) => { if (!dir || dir.length < 4) return; for (const d of [dir, dir.replace(/\\/g, '/'), dir.replace(/\\/g, '\\\\')]) pairs.push([new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), word]); };
  add(os.homedir(), '%USERPROFILE%');
  let user = ''; try { user = os.userInfo().username; } catch (e) { /* none */ }
  const userRe = user && user.length >= 3 ? new RegExp('([\\\\/]Users[\\\\/])' + user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\\\/]|$)', 'gi') : null;
  return s => {
    for (const [re, w] of pairs) s = s.replace(re, w);
    if (userRe) s = s.replace(userRe, '$1<user>');
    return s.replace(/(profiles[\\/]+)\d{3,}/gi, '$1<id>');
  };
}
let _scrub = null;
function scrub(v) {
  if (!_scrub) _scrub = scrubber();
  if (typeof v === 'string') return _scrub(v);
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = scrub(v[k]); return o; }
  return v;
}
function wrap(handler) {
  return async (args, ctx) => {
    let r;
    try { r = await handler(args || {}, ctx); }
    catch (e) { r = e && e.refused ? ctx.bad(e.message) : { text: 'failed: ' + ((e && e.message) || e), isError: true }; }
    const out = { text: scrub(String(r.text == null ? '' : r.text)), isError: !!r.isError };
    if (r.data !== undefined) out.data = scrub(r.data);
    return out;
  };
}

// ---- folders ----
function tmpDir() {
  const d = process.env.ARSENAL_TMP ? path.join(process.env.ARSENAL_TMP, 'mcp-play') :path.join(os.tmpdir(), 'arsenal-mcp-play');
  return d;
}
const noGame = (ctx, g) => ctx.bad(g.name + ' was not found on this computer. Set the folder with env ' + (g.kind === 'goh' ? 'ARSENAL_GOH_DIR' : 'ARSENAL_AS2_DIR') + ' (the folder that holds ' + g.file + ').');
const exePath = g => path.join(g.dir, g.file);
function running(g) {
  if (process.platform !== 'win32') return null;
  const img = path.basename(g.file);
  try { const r = cp.spawnSync('tasklist', ['/FI', 'IMAGENAME eq ' + img, '/NH'], { encoding: 'latin1', windowsHide: true, timeout: 15000 }); if (r.status !== 0) return null; return r.stdout.toLowerCase().includes(img.toLowerCase().slice(0, 25)); }
  catch (e) { return null; }
}
function userDir(g) { try { const r = require(TOOLS + '/lib/userdir').forGame(g.id, 0); return { dir: r.dir || null, why: r.why || '' }; } catch (e) { return { dir: null, why: e.message }; } }
function profiles(g) { try { return require(TOOLS + '/lib/userdir').profilesFor(g.id, 0) || []; } catch (e) { return []; } }
function modDir(ctx, mod) {
  ctx.name(mod, 'mod');
  let ok = false; try { ok = path.isAbsolute(mod) && fs.statSync(mod).isDirectory(); } catch (e) { /* missing */ }
  if (!ok) throw ctx.refusal('mod: give the full path of an existing mod folder');
  return path.resolve(mod);
}
function box(ctx, v, what) {
  const a = (Array.isArray(v) ? v : String(v).split(',')).map(x => +String(x).trim());
  if (a.length !== 4 || a.some(x => !Number.isFinite(x) || x < 0)) throw ctx.refusal(what + ': four numbers "x,y,w,h", none below 0');
  return a.join(',');
}

// options.set / any SDL block text -> [[path, value]] of the leaves ("options/video/vsync" -> "1")
function flatSet(text) {
  const tok = String(text).replace(/;[^\r\n]*/g, '').match(/"[^"]*"|[{}]|[^\s{}"]+/g) || [], out = [];
  let i = 0;
  const node = prefix => {      // at a token after '{'
    const name = tok[i] !== '{' && tok[i] !== '}' ? tok[i++].replace(/"/g, '') : '', key = prefix ? prefix + '/' + name : name, vals = [];
    let kids = 0;
    while (i < tok.length && tok[i] !== '}') { if (tok[i] === '{') { i++; kids++; node(key); } else vals.push(tok[i++].replace(/"/g, '')); }
    i++;
    if (vals.length || !kids) out.push([key, vals.join(' ')]);
  };
  while (i < tok.length) { if (tok[i] === '{') { i++; node(''); } else i++; }
  return out;
}

// ---- game view, economy ----
const viewGame = g => ({ id: g.id, kind: g.kind, exe: g.id === 'as64' ? undefined : g.exe, dir: g.dir });
function economy(g) {
  try {
    const view = require(TOOLS + '/lib/gameview').get({ gameDir: g.dir, gid: g.id }), vfs = require(TOOLS + '/lib/vfs'), goh = g.kind === 'goh';
    const re = goh ? /^resource\/set\/multiplayer\/games\/.+\.(inc|set)$/ : /^resource\/set\/multiplayer\/games\/[^/]+\.(inc|set)$/, texts = [];
    for (const [rel, rec] of view.files) { if (!re.test(rel) || /\/(bots_|presets_test)/.test(rel)) continue; try { texts.push(vfs.readRec(rec).toString('latin1')); } catch (e) { /* skip */ } }
    return require(TOOLS + '/balance/lib').economy(texts, goh ? { game: 'goh' } : undefined) || null;
  } catch (e) { return null; }
}

// ---- catalogue ----
const cats = new Map();
const hasHull = u => !!(u.armorAreas || []).find(a => a.name === 'body' && a.front > 0);
function armourOf(u, r) {
  const b = (u.armorAreas || []).find(a => a.name === 'body' && a.front > 0);
  if (b) return [b.front, b.side, b.rear, b.top];
  if (r && r.af != null) return [r.af, r.as, r.ar, r.at];
  return null;
}
async function catalogue(ctx, g, mod) {
  const folder = mod ? modDir(ctx, mod) : null, key = g.id + '|' + g.dir + '|' + (folder || '');
  if (cats.has(key)) return cats.get(key);
  const dir = path.join(tmpDir(), 'cat'); fs.mkdirSync(dir, { recursive: true });
  const L = await require(TOOLS + '/balance/balance').load(g.dir, folder, dir, null, { game: g.id });
  const goh = g.kind === 'goh', units = (L.cur && L.cur.units) || [], byKey = new Map(), used = new Set(), entries = [];
  for (const u of units) { const k = goh ? u.id + '@' + (u.cardFile || '') : u.id; if (!byKey.has(k)) byKey.set(k, u); }
  for (const r of (L.d && L.d.rows) || []) {
    const k = goh && r._card ? r._card : r.id, u = byKey.get(k) || byKey.get(r.id) || units.find(x => x.id === r.id) || { id: r.id, name: r.name, army: r.army, kind: r.kind };
    used.add(u);
    entries.push({ id: r.id, name: r.name || u.name || r.id, army: r.army || u.army || '', unit: u, row: r, armour: r.kind === 'vehicle' ? armourOf(u, r) : null, hull: hasHull(u) });
  }
  for (const u of units) if (!used.has(u) && u.kind === 'vehicle' && u.def) entries.push({ id: u.id, name: u.name || u.id, army: u.army || '', unit: u, row: null, armour: armourOf(u, null), hull: hasHull(u) });
  const C = { entries, eco: (L.d && L.d.economy) || null, goh };
  cats.set(key, C);
  return C;
}
const words = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
function find(C, text, opt) {
  opt = opt || {};
  const q = String(text).trim().toLowerCase(), qn = norm(q), qw = words(q), army = opt.army ? String(opt.army).toLowerCase() : null, hits = [];
  if (!qn) return { best: null, also: [] };
  for (const e of C.entries) {
    if (army && e.army !== army) continue;
    if (opt.vehicle && !(e.unit.kind === 'vehicle' || (e.row && e.row.kind === 'vehicle'))) continue;
    if (opt.armed && !(e.unit.gun && e.unit.gun.weapon)) continue;
    const id = String(e.id).toLowerCase(), nm = String(e.name).toLowerCase(), idn = norm(id), nn = norm(nm), nw = words(nm);
    let s = 0;
    if (id === q) s = 100; else if (nm === q) s = 95; else if (idn === qn) s = 90; else if (nn === qn) s = 88;
    else if (qw.length && qw.every(w => nw.includes(w))) s = 75;
    else if (nn.startsWith(qn) || idn.startsWith(qn)) s = 70;
    else if (qw.length && qw.every(w => nm.includes(w) || id.includes(w))) s = 55;
    else if (nn.includes(qn) || idn.includes(qn)) s = 45;
    if (s) hits.push({ e, s });
  }
  hits.sort((a, b) => b.s - a.s || (a.e.row ? 0 : 1) - (b.e.row ? 0 : 1) || a.e.name.length - b.e.name.length || ((a.e.row && a.e.row.cost) || 0) - ((b.e.row && b.e.row.cost) || 0));
  return { best: hits.length ? hits[0].e : null, also: hits.slice(1, 8).map(h => h.e) };
}
const didYouMean = f => (f.also && f.also.length ? '. Close: ' + f.also.slice(0, 6).map(e => e.name + ' (' + e.id + ')').join(', ') : '. Find names with mow_army.');
function brief(e) {
  const r = e.row || {}, u = e.unit || {}, o = { id: e.id, name: e.name, army: e.army || null };
  if (r.cls) o.class = r.cls;
  if (r.cost != null) { o.price = r.cost; o.paidWith = r.res || 'mp'; }
  if (r.rank != null) o.rank = r.rank;
  if (r.wait != null) o.waitAtStart = r.wait;
  if (r.again != null) o.cooldown = r.again;
  if (r.cp != null) o.cp = r.cp;
  if (r.gun || (u.gun && u.gun.weapon)) o.gun = r.gun || u.gun.weapon;
  if (r.pen) o.pen100 = r.pen;
  if (r.range) o.range = r.range;
  if (e.armour) o.armour = { front: e.armour[0], side: e.armour[1], rear: e.armour[2], top: e.armour[3] };
  if (u.period) o.period = u.period;
  if (u.doctrine) o.doctrine = u.doctrine;
  return o;
}
const gunOwner = (C, weapon) => { const w = String(weapon).toLowerCase(), e = C.entries.find(x => x.unit.gun && String(x.unit.gun.weapon).toLowerCase() === w && x.unit.gun.pen); return e ? e.unit : null; };

function penAt(table, range) {
  const pts = []; for (const m of String(table || '').matchAll(/([\d.]+)m:([\d.]+)/g)) pts.push([+m[1], +m[2]]);
  if (!pts.length) return null;
  pts.sort((a, b) => a[0] - b[0]);
  let v;
  if (range <= pts[0][0]) v = pts[0][1]; else if (range >= pts[pts.length - 1][0]) v = pts[pts.length - 1][1];
  else for (let i = 1; i < pts.length; i++) if (range <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; v = y0 + (y1 - y0) * (range - x0) / (x1 - x0); break; }
  return Math.round(v * 10) / 10;
}

// ---- armour simulator ----
const sim = () => require(TOOLS + '/armorsim/sim');
const sims = new Map();
function simOpen(g, e, mod) {
  if (g.kind === 'goh') return { error: 'the armour simulator does not serve Gates of Hell' };
  const def = e.unit && e.unit.def ? path.basename(String(e.unit.def)).replace(/\.def$/i, '') : null;
  if (!def) return { error: 'no vehicle model file for ' + e.name };
  const key = g.id + '|' + g.dir + '|' + (mod || '') + '|' + def;
  if (sims.has(key)) return sims.get(key);
  let c;
  try { c = sim().open(def, { game: g.dir, mods: [], folder: mod ? path.resolve(mod) : undefined, exe: g.id === 'as64' ? undefined : 'mowas_2' }); }
  catch (x) { c = { error: x.message }; }
  if (!c || c.error) return { error: (c && c.error) || 'the vehicle could not be opened' };
  if (sims.size > 12) sims.delete(sims.keys().next().value);
  sims.set(key, c);
  return c;
}

module.exports = { wrap, scrub, tmpDir, noGame, exePath, peText, running, firstLine, userDir, profiles, modDir, box, flatSet, ago, int, num, count, tally, norm, dash, span, mtime,
  viewGame, economy, catalogue, find, didYouMean, brief, gunOwner, penAt, sim, simOpen };
