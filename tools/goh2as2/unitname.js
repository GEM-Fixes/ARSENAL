#!/usr/bin/env node
// unitname: goh2as2 output stage. Names ported units in an AS2 mod (as64 or MoW:AS2: both read the same localization) from GoH's own English text. rows LOC-01 LOC-02 LOC-05 LOC-10 LOC-19 LOC-20 PORT-175
//   node tools/goh2as2/unitname.js <mod dir> [--goh H] [--goh-mod dir]... [--game G] [--file '#goh2as2_names.lng'] [--dry-run] [-q] [--list]
// engine keys:
//   desc/entity/<def title>   name: hover, kill feed, vehicle panel, results screen, MP card
//   info/entity/<def title>   long text in the unit info dialog;  info/special/<def title>  class label in the info card
// units: every <title>.def under <mod>/resource/entity (skips '-' include dirs and titles with a dot, e.g. x.unfit.def side copies).
// GoH text: msgid of every .pot in <H>/localizations/*.pak and in each --goh-mod (loose or in paks; later source wins). .po = translation, not read.
//   GoH keys read: desc/entity/X -> name, info/special/X -> special, info/entity/X or info/X -> long text. Tags <..> dropped, typographic marks -> ASCII.
// no GoH name -> GoH name of a near key (heavy_mg_x -> x, x_fr -> x, us-x <-> x: UNIT_NAME_NEAR) -> readable name from the key (UNIT_NAME_FALLBACK). Never written: a key vanilla AS2 has (localization.pak, LOC-19: vanilla wins,
//   and no vanilla key is ever shadowed: UNIT_KEY_VANILLA) or a key the mod already has in another .lng (UNIT_KEY_MOD).
// output: <mod>/localization/<file> ('#' file: no title prefix, adds keys, replaces no vanilla file, LOC-01 LOC-10), UTF-8 no BOM, CRLF (LOC-05).
//   the file is regenerated whole each run (tool-owned). codes: UNIT_NAME_FALLBACK UNIT_KEY_VANILLA UNIT_KEY_MOD UNIT_SKIP_SIDEFILE UNIT_DUP_DEF
//   UNIT_NO_UNITS UNIT_FILE_NOT_HASH info: UNIT_NO_INFO (count) GOH_TEXT_CONFLICT (count) NO_VANILLA
// Author: Imperator_Aug (ARSENAL, ia-283771d1)
const fs = require('fs'), path = require('path');
const pak = require('../lib/pak'), sdl = require('../lib/sdl');
const { createReport } = require('../lib/report');

const H_DEFAULT = () => require('../lib/gamedir').goh();   // no --goh: the GoH install (lib/gamedir: env GOH_GAME, as2.json "goh", Steam)
const lc = s => String(s).toLowerCase();

// ---- units of a mod: [{ name, file }] ----
function units(mod, rep) {
  const root = path.join(mod, 'resource', 'entity'), out = [], seen = new Map();
  const walk = (d, rel) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (!e.name.startsWith('-')) walk(path.join(d, e.name), r); continue; }
      if (!/\.def$/i.test(e.name)) continue;
      const t = e.name.slice(0, -4);
      if (t.includes('.')) { rep.info('resource/entity/' + r, 0, 'UNIT_SKIP_SIDEFILE', `"${t}" has a dot: side copy, not named`); continue; }
      if (seen.has(lc(t))) { rep.add('resource/entity/' + r, 0, 'UNIT_DUP_DEF', `def title "${t}" also at ${seen.get(lc(t))}; engine keeps one (Entity redefinition)`); continue; }
      seen.set(lc(t), 'resource/entity/' + r);
      out.push({ name: t, file: 'resource/entity/' + r });
    }
  };
  walk(root, '');
  return out;
}

// ---- gettext .pot: [{ key, text }] (msgctxt = key, msgid = English) ----
function potRows(buf) {
  let s = buf.toString('utf8'); if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  const un = t => t.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  const rows = []; let cur = null, st = null;
  const flush = () => { if (cur && cur.ctx) rows.push({ key: un(cur.ctx), text: un(cur.id) }); cur = null; };
  for (const raw of s.split('\n')) {
    const l = raw.replace(/\r$/, '').trim(); let m;
    if (!l || l.startsWith('#')) { st = null; continue; }
    if ((m = /^msgctxt\s+"(.*)"$/.exec(l))) { flush(); cur = { ctx: m[1], id: '' }; st = 'ctx'; }
    else if (!cur) continue;
    else if ((m = /^msgid\s+"(.*)"$/.exec(l))) { cur.id = m[1]; st = 'id'; }
    else if (/^msgstr\b/.test(l)) st = 'str';
    else if ((m = /^"(.*)"$/.exec(l))) { if (st === 'ctx') cur.ctx += m[1]; else if (st === 'id') cur.id += m[1]; }
  }
  flush();
  return rows;
}

// ---- GoH text sources in load order: [{ src, read }] ----
function gohSources(goh, mods) {
  const out = [];
  const addPak = p => { let L; try { L = pak.list(p); } catch (e) { return; } for (const e of L) if (/\.pot$/i.test(e.name)) out.push({ src: path.basename(p) + '!' + e.name, read: () => pak.read(L, e) }); };
  const walk = (d, fn) => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es.sort((a, b) => (a.name < b.name ? -1 : 1))) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f, fn); else fn(f); } };
  if (goh) walk(path.join(goh, 'localizations'), f => { if (/\.pak$/i.test(f)) addPak(f); else if (/\.pot$/i.test(f)) out.push({ src: f, read: () => fs.readFileSync(f) }); });
  for (const m of mods) for (const sub of ['resource', 'localizations']) walk(path.join(m, sub), f => { if (/\.pak$/i.test(f)) addPak(f); else if (/\.pot$/i.test(f)) out.push({ src: f, read: () => fs.readFileSync(f) }); });
  return out;
}

const clean = t => String(t).replace(/<[^<>]*>/g, '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2010-\u2015]/g, '-')
  .replace(/\u2026/g, '...').replace(/\u00A0/g, ' ').replace(/</g, '').replace(/[ \t]+/g, ' ').trim();

// GoH text -> { name: Map, info: Map, special: Map } (lower model -> text), conflicts count
function gohText(goh, mods) {
  const T = { name: new Map(), info: new Map(), special: new Map(), conflicts: 0, files: 0 };
  for (const s of gohSources(goh, mods)) {
    let rows; try { rows = potRows(s.read()); } catch (e) { continue; }
    T.files++;
    for (const r of rows) {
      const k = lc(r.key); let m, map;
      if ((m = /^desc\/entity\/([^/]+)$/.exec(k))) map = T.name;
      else if ((m = /^info\/special\/([^/]+)$/.exec(k))) map = T.special;
      else if ((m = /^info\/entity\/([^/]+)$/.exec(k)) || (m = /^info\/([^/]+)$/.exec(k))) map = T.info;
      else continue;
      const t = clean(r.text); if (!t) continue;
      if (map.has(m[1]) && map.get(m[1]) !== t) T.conflicts++;
      map.set(m[1], t);
    }
  }
  return T;
}

// readable name from an entity key: us-m26_pershing -> M26 Pershing, t-50 -> T-50
function fallbackName(n) {
  const w = n.replace(/^(us|uk)-/i, '').replace(/(^|_)0_(\d)/g, '$1.$2').split('_').filter(Boolean);
  return w.map(x => (/^mk([ivx]+|\d+)$/i.test(x) ? 'Mk ' + x.slice(2).toUpperCase()
    : /\d/.test(x) || x.length <= 2 || /^[^aeiouy]+$/i.test(x) || /^[ivx]+$/i.test(x) ? x.toUpperCase() : x[0].toUpperCase() + x.slice(1))).join(' ');
}
// near GoH key: same unit under a GoH name without the port's prefix/side suffix (heavy_mg_x -> x, x_fr -> x, us-x -> x)
function nearKeys(k) {
  const out = [], pre = k.replace(/^heavy_mg_/, ''), bases = [...new Set([k, pre])];
  for (const b of bases) { out.push(b.replace(/_(fr|fra|pol|hun|ita|jap|fin|aa)$/, '')); out.push(b.replace(/^(us|uk)-/, '')); out.push('us-' + b); out.push('uk-' + b); }
  return [...new Set(out)].filter(x => x !== k);
}

// keys of .lng files: lower key -> file
function lngKeysOf(buf, rel, into) {
  let s = buf.toString('utf8'); if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  const tree = sdl.parseLines(s.split(/\r?\n/), () => {}, { resync: 'nextQuote' });
  const base = path.posix.basename(rel).replace(/\.lng$/i, ''), dir = path.posix.dirname(rel);
  const pre = (dir === '.' ? '' : dir + '/') + (base.startsWith('#') ? '' : base + '/');
  const vis = (n, kp) => { if (n.name === null) return; const k = kp + n.name; if (n.kids.length) n.kids.forEach(c => vis(c, k + '/')); else if (!into.has(lc(k))) into.set(lc(k), rel); };
  for (const t of tree.kids) { if (t.name === null) continue; if (lc(t.name) === 'tags') t.kids.forEach(c => vis(c, pre)); else vis(t, pre); }
  return into;
}
function vanillaKeys(game) {
  const f = path.join(game, 'localization.pak');
  if (!fs.existsSync(f)) return null;
  const L = pak.list(f), keys = new Map();
  for (const e of L) if (/\.lng$/i.test(e.name)) { try { lngKeysOf(pak.read(L, e), e.name.replace(/\\/g, '/'), keys); } catch (x) { /* skip */ } }
  return keys;
}
function modKeys(mod, own) {
  const keys = new Map(), d = path.join(mod, 'localization');
  const walk = (dir, rel) => { let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(dir, e.name), r); else if (/\.lng$/i.test(e.name) && lc(r) !== lc(own)) lngKeysOf(fs.readFileSync(path.join(dir, e.name)), r, keys); } };
  walk(d, '');
  const lp = path.join(mod, 'localization.pak');
  if (fs.existsSync(lp)) { const L = pak.list(lp); for (const e of L) if (/\.lng$/i.test(e.name)) lngKeysOf(pak.read(L, e), e.name, keys); }
  return keys;
}

const esc = t => t.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t');
function render(entries) {   // entries: { name: [[k,t]], special: [[k,t]], info: [[k,t]] }
  const L = ['{tags'];   // no comment line: keep the file to plain {tags} as vanilla .lng
  const blk = (ind, rows) => rows.map(([k, t]) => `${ind}{"${k}" "${esc(t)}"}`);
  if (entries.name.length) L.push('\t{"desc"', '\t\t{"entity"', ...blk('\t\t\t', entries.name), '\t\t}', '\t}');
  if (entries.info.length || entries.special.length) {
    L.push('\t{"info"');
    if (entries.info.length) L.push('\t\t{"entity"', ...blk('\t\t\t', entries.info), '\t\t}');
    if (entries.special.length) L.push('\t\t{"special"', ...blk('\t\t\t', entries.special), '\t\t}');
    L.push('\t}');
  }
  L.push('}', '');
  return Buffer.from(L.join('\r\n'), 'utf8');
}

function run(o) {
  const rep = createReport(), mod = path.resolve(o.mod);
  const file = o.file || '#goh2as2_names.lng';
  if (!path.posix.basename(file.replace(/\\/g, '/')).startsWith('#')) { rep.add('localization/' + file, 0, 'UNIT_FILE_NOT_HASH', 'output must be a # file: a titled file at a vanilla path replaces it whole (LOC-01)'); return { rep, fail: 2 }; }
  const us = units(mod, rep);
  if (!us.length) { rep.add('resource/entity', 0, 'UNIT_NO_UNITS', 'no .def under resource/entity'); return { rep, fail: 1 }; }
  const T = gohText(o.goh, o.gohMods || []);
  const van = o.game ? vanillaKeys(o.game) : null;
  if (!van) rep.info('localization.pak', 0, 'NO_VANILLA', `no localization.pak under ${o.game || '(no --game)'}; vanilla-key guard OFF`);
  const mk = modKeys(mod, file);
  const E = { name: [], info: [], special: [] }, res = [];
  let noInfo = 0;
  const put = (kind, n, text, key) => {
    if (van && van.has(key)) { rep.add(us.find(u => u.name === n).file, 0, 'UNIT_KEY_VANILLA', `${key}: vanilla AS2 key, not written (never shadow; LOC-19 vanilla wins)`); return 'vanilla'; }
    if (mk.has(key)) { rep.info(us.find(u => u.name === n).file, 0, 'UNIT_KEY_MOD', `${key}: mod already has it in localization/${mk.get(key)}; not written`); return 'mod'; }
    E[kind].push([n, text]); return 'new';
  };
  for (const u of us) {
    const k = lc(u.name);
    let name = T.name.get(k), how = 'goh';
    let near = null;
    if (!name) { near = nearKeys(k).find(x => T.name.has(x)); if (near) { name = T.name.get(near); how = 'near'; } }
    if (!name) { name = fallbackName(u.name); how = 'fallback'; }
    const st = put('name', u.name, name, 'desc/entity/' + k);
    if (how === 'fallback' && st === 'new') rep.add(u.file, 0, 'UNIT_NAME_FALLBACK', `no GoH desc/entity/${u.name} nor a near key; named "${name}" from the key`);
    if (how === 'near' && st === 'new') rep.add(u.file, 0, 'UNIT_NAME_NEAR', `no GoH desc/entity/${u.name}; took "${name}" from GoH desc/entity/${near} [I same unit]`);
    if (T.special.has(k)) put('special', u.name, T.special.get(k), 'info/special/' + k);
    if (T.info.has(k)) put('info', u.name, T.info.get(k), 'info/entity/' + k); else noInfo++;
    res.push({ unit: u.name, name, how, status: st });
  }
  if (noInfo) rep.info('localization/' + file, 0, 'UNIT_NO_INFO', `${noInfo} of ${us.length} units have no GoH long text; info dialog shows tech panel only [I]`);
  if (T.conflicts) rep.info('localization/' + file, 0, 'GOH_TEXT_CONFLICT', `${T.conflicts} GoH keys had differing text across sources; later source kept`);
  const out = path.join(mod, 'localization', file);
  const total = E.name.length + E.info.length + E.special.length;
  if (!o.dryRun && total) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, render(E)); }
  return { rep, fail: 0, res, out, counts: { units: us.length, goh: res.filter(r => r.how === 'goh' && r.status === 'new').length, near: res.filter(r => r.how === 'near' && r.status === 'new').length, fallback: res.filter(r => r.how === 'fallback' && r.status === 'new').length, vanilla: res.filter(r => r.status === 'vanilla').length, mod: res.filter(r => r.status === 'mod').length, info: E.info.length, special: E.special.length, gohFiles: T.files } };
}

function main(argv) {
  const o = { gohMods: [], goh: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--goh') o.goh = argv[++i]; else if (a === '--goh-mod') o.gohMods.push(argv[++i]); else if (a === '--game') o.game = argv[++i];
    else if (a === '--file') o.file = argv[++i]; else if (a === '--dry-run') o.dryRun = true; else if (a === '-q') o.q = true; else if (a === '--list') o.list = true;
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 14).join('\n')); return 0; }
    else if (!o.mod) o.mod = a; else { console.error('unknown arg ' + a); return 2; }
  }
  if (!o.mod) { console.error('usage: unitname.js <mod dir> [--goh H] [--goh-mod dir]... [--game G] [--dry-run]'); return 2; }
  if (!o.goh) o.goh = H_DEFAULT();
  if (!o.goh) { console.error('unitname: no GoH install found: give --goh H (or env GOH_GAME, as2.json "goh")'); return 2; }
  if (!o.game) { const p = path.resolve(o.mod, '..', '..'); if (path.basename(path.dirname(path.resolve(o.mod))).toLowerCase() === 'mods') o.game = p; }
  const r = run(o);
  r.rep.print({ showInfo: !o.q });
  if (r.counts) console.log(`units ${r.counts.units}: GoH name ${r.counts.goh}, near GoH key ${r.counts.near}, fallback ${r.counts.fallback}, vanilla key kept ${r.counts.vanilla}, mod key kept ${r.counts.mod}; info ${r.counts.info}, special ${r.counts.special}; GoH .pot read ${r.counts.gohFiles}; ${o.dryRun ? 'dry run, nothing written' : 'wrote ' + r.out}`);
  if (o.list && r.res) for (const x of r.res) console.log(`${x.unit}\t${x.how}\t${x.status}\t${x.name}`);
  return r.fail;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { run, units, potRows, gohText, fallbackName, clean, render, vanillaKeys };
