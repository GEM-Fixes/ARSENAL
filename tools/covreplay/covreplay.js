#!/usr/bin/env node
// covreplay: replay real-mod diffs through patch-entity's edit engine (COV-REPLAY, inference 3). no game.
//   node tools/covreplay/covreplay.js [--out dir] [--per 50] [--types .def,.set] [--game G] [--mods val,jab] [--gate N]
// flow per mod file that also exists in vanilla and differs: vanilla bytes -> planEdits(vanilla, mod) = list of
//   { op:'set'|'add'|'del', path, value } in patch-entity path syntax (a/b[0]/c#N) -> patch-entity.applyEdit one by one (the same
//   function the CLI runs, reparse after each edit) -> replay bytes -> compare with the mod's bytes:
//     BYTE    identical bytes
//     ORDERED same block tree incl. order (whitespace/comments/number spelling ignored)
//     FLAT    tools/lib/sdldiff.flatten equal (order-insensitive per path); this is the "parsed match"
//   Anything planEdits cannot say with set/add/del is a GAP code (what patch-entity lacks). Output ONLY under --out (scratch);
//   refuses an --out inside a game, Workshop or mods folder. --gate N: also run patch-entity.run(dry-run, tmp in --out) on N files per type
//   (lint/keylint refusal gate: needs the vfs of --game; writes nothing).
//   --exe as64|mowas_2|mowas2|goh  the game (lib/games). With no --game the install is games.install(exe) (goh: the GoH install); the
//     --gate run gets the same exe (patch-entity run opts.exe: its vfs view, MoW:AS2 without as64/core). No --exe: as before.
//   --mods a,b  names or folders. Names: AS2 val (AS2 Valour, workshop 244450) and jab (jaben in <G>/mods); under --exe goh val (GoH Valour)
//     and mace (MACE), workshop app 400750. A folder (any entry with / or \) is a mod root: its paks and its loose files under resource/.
//     Under --exe goh the default is val,mace, and loose files of the GoH install's resource/ count as vanilla too (GoH mods ship loose).
// Author: Imperator_Aug (ARSENAL, ia-6b3a5546)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const sdlwrite = require('../lib/sdlwrite'), sdldiff = require('../lib/sdldiff'), ps = require('../lib/pakset');
const pe = require('../patch-entity/patch-entity');

const DEF_G = require('../lib/gamedir').resolve().dir;
const MODS = {
  val: require('../lib/gamedir').workshop(244450, 455424236),
  jab: DEF_G + '/mods/jaben mod v6.25',
};
// mod name or folder -> mod root. kind 'goh': GoH names (workshop app 400750); else the AS2 names (jab under the --game folder)
function modRoot(m, kind, game, gd = require('../lib/gamedir')) {
  if (/[\\/]/.test(m)) return path.resolve(m);
  if (kind === 'goh') return { val: gd.workshop(400750, 2537987794), mace: gd.workshop(400750, 2905667604) }[m] || null;
  if (m === 'jab') return game + '/mods/jaben mod v6.25';
  return MODS[m] || null;
}
// loose files under <root>/resource -> entries {key 'resource/..', size, file, loose}
function looseEntries(root) {
  const out = [], res = ['resource', 'Resource'].map(d => path.join(root, d)).find(d => fs.existsSync(d));
  if (!res) return out;
  (function w(d, rel) {
    let ds; try { ds = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const x of ds) {
      const p = path.join(d, x.name), k = rel + x.name.toLowerCase();
      if (x.isDirectory()) w(p, k + '/');
      else if (!/\.pak$/i.test(x.name)) out.push({ key: k, name: k, size: fs.statSync(p).size, file: p, loose: true });
    }
  })(res, 'resource/');
  return out;
}
const rd = e => (e.loose ? fs.readFileSync(e.file) : ps.read(e));
const DEF_OUT = path.resolve(__dirname, '../../../run/sessions/w66/COV-REPLAY/out');
const NOT_SDL_EXT = new Set(['.lua', '.mp3', '.wav', '.tga', '.dds', '.ply', '.anm', '.bmp', '.jpg', '.png', '.ebm']);

// mod string bytes -> text: UTF-8 when valid (as64 form), else legacy cp1251 (patch-entity writes it back UTF-8 = repair;
const { isUtf8, decodeCp1251 } = require('../lib/enc');
const toUni = latin1 => { const b = Buffer.from(latin1, 'latin1'); return isUtf8(b) ? b.toString('utf8') : decodeCp1251(b); };
const isCont = n => n.type === 'block' || n.type === 'list';
const isScal = n => n.type === 'atom' || n.type === 'string';

// drop ';' comments outside strings (an added block's value is spliced inside {name value}: a trailing comment would eat the '}')
function stripComments(s) {
  let out = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { out += c; if (c === '\\') { out += s[++i] || ''; } else if (c === '"' || c === '\n' || c === '\r') q = false; continue; }
    if (c === '"') { q = true; out += c; continue; }
    if (c === ';') { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; i--; continue; }
    out += c;
  }
  return out;
}

// ---- plan: vanilla Buffer + mod Buffer -> { edits, gaps:Set } ----
function planEdits(vbuf, mbuf) {
  const vt = sdlwrite.parse(vbuf), mt = sdlwrite.parse(mbuf);
  const edits = [], gaps = new Map();
  const gap = (code, why) => { if (!gaps.has(code)) gaps.set(code, why); };
  const BADNAME = /[\/#\[\]]/;
  function diffNode(vn, mn, prefix) {
    // scalars (position among scalars; idx = item index in the vanilla node for patch-entity's #N)
    const vS = vn.items.map((x, i) => ({ x, i })).filter(o => isScal(o.x)), mS = mn.items.filter(isScal);
    const strayV = vn.items.filter(x => x.type === 'stray').map(x => x.text).join(''), strayM = mn.items.filter(x => x.type === 'stray').map(x => x.text).join('');
    if (strayV !== strayM) gap('STRAY_TOKEN', 'stray ) } or unmatched closer differs; no edit syntax for it');
    if (vn.tag !== mn.tag) gap('BLOCK_TAG', 'block tag {#x differs; patch-entity cannot set a tag');
    if (vn.root && vS.length + mS.length) { if (vS.map(o => o.x.text).join(' ') !== mS.map(x => x.text).join(' ')) gap('ROOT_SCALAR', 'top-level scalar differs; path syntax has no root item'); }
    else {
      for (let k = 0; k < Math.min(vS.length, mS.length); k++) {
        if (vS[k].x.text !== mS[k].text) {
          if (!prefix) continue;
          edits.push({ op: 'set', path: prefix + '#' + vS[k].i, value: toUni(mS[k].text) });
        }
      }
      if (mS.length > vS.length) {
        let len = vn.items.length;
        for (let k = vS.length; k < mS.length; k++) edits.push({ op: 'set', path: prefix + '#' + (len++), value: toUni(mS[k].text) });
      }
      if (vS.length > mS.length) gap('SCALAR_DELETE', 'mod has fewer value items in a block; --del removes a whole node only, --set cannot drop an item');
    }
    // containers grouped by name
    const group = n => { const g = new Map(); for (const c of n.items.filter(isCont)) { const k = c.name || ''; (g.get(k) || g.set(k, []).get(k)).push(c); } return g; };
    const vg = group(vn), mg = group(mn), names = [...new Set([...vg.keys(), ...mg.keys()])];
    const dels = [], adds = [];
    for (const nm of names) {
      const a = vg.get(nm) || [], b = mg.get(nm) || [];
      if (nm === '') {   // nameless block/list: not addressable by name path
        const sa = a.map(c => stripComments(vt.src.slice(c.start, c.end)).replace(/\s+/g, ' ')).join('|'), sb = b.map(c => stripComments(mt.src.slice(c.start, c.end)).replace(/\s+/g, ' ')).join('|');
        if (sa !== sb) gap('ANON_CONTAINER', 'nameless {..} or (..) differs; name-path syntax cannot address it');
        continue;
      }
      if (BADNAME.test(nm)) { if (a.length !== b.length || a.some((c, i) => vt.src.slice(c.start, c.end) !== mt.src.slice(b[i].start, b[i].end))) gap('NAME_UNADDRESSABLE', 'block name has / # [ ] : path syntax cannot name it'); continue; }
      const seg = i => (prefix ? prefix + '/' : '') + nm + '[' + i + ']';
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i].type !== b[i].type) gap('CONTAINER_KIND', '{block} changed to (list) or back; patch-entity has no edit that changes the bracket kind');
        diffNode(a[i], b[i], seg(i));
      }
      for (let i = a.length - 1; i >= b.length; i--) dels.push({ op: 'del', path: seg(i) });
      for (let i = a.length; i < b.length; i++) {
        const c = b[i];
        if (c.type === 'list') { gap('ADD_LIST', 'new (list) block; --add creates {name value} only'); continue; }
        if (c.tag) { gap('BLOCK_TAG', 'new block with {#tag; --add cannot write a tag'); continue; }
        if (i > 0 || a.length > 0) { gap('ADD_SAME_NAME', 'new block whose name already exists under the parent; --add on an existing name is a --set, no [n] on create'); continue; }
        const first = c.items[0];
        const val = first ? stripComments(mt.src.slice(first.end, c.closeStart)).trim() : '';
        // last segment keeps the mod's own spelling (sdlwrite lowercases names for lookup; --add writes the segment as given)
        adds.push({ op: 'add', path: (prefix ? prefix + '/' : '') + toUni(first ? first.text : nm), value: toUni(val) });
      }
    }
    edits.push(...dels, ...adds);
  }
  if (vt.bom !== mt.bom) gap('BOM_CHANGE', 'UTF-8 BOM added or removed; patch-entity keeps the BOM of the source and has no edit for it');
  diffNode(vt.root, mt.root, '');
  return { edits, gaps };
}

function applyAll(vbuf, edits) {
  let cur = vbuf;
  for (let i = 0; i < edits.length; i++) {
    let r;
    try { r = pe.applyEdit(cur, edits[i]); } catch (e) { return { err: ['THROW', e.message], at: i }; }
    if (r.err) return { err: r.err, at: i };
    cur = r.buf;
  }
  return { buf: cur };
}

// ---- compare ----
function canon(n) {
  if (isScal(n)) { const t = n.type === 'string' ? n.text : (/^-?\d+(\.\d+)?$/.test(n.text) ? String(Number(n.text)) : n.text); return t; }
  if (n.type === 'stray') return '!' + n.text;
  return [n.type[0] + (n.tag || ''), ...n.items.map(canon)];
}
function flatEq(a, b) {
  let fa, fb;
  try { fa = sdldiff.parse(a); fb = sdldiff.parse(b); } catch (e) { return false; }
  if (fa.size !== fb.size) return false;
  if (fa.size === 0) { try { return !sdlwrite.parse(a).root.items.some(isCont) && !sdlwrite.parse(b).root.items.some(isCont); } catch (e) { return false; } }   // sdlx read nothing: not a real match
  for (const [k, v] of fa) { const w = fb.get(k); if (!w || w.sem !== v.sem) return false; }
  return true;
}
// order-insensitive canon: children of every container sorted (scalars keep order: the value sequence of a block matters)
function canonU(n) {
  if (!Array.isArray(n)) return n;
  const head = n[0], rest = n.slice(1), sc = rest.filter(x => !Array.isArray(x)), cs = rest.filter(Array.isArray).map(canonU).map(x => JSON.stringify(x)).sort();
  return [head, sc, cs];
}
function compare(replay, mod) {
  const byte = Buffer.compare(replay, mod) === 0;
  let ordered = false, unord = false;
  try {
    const a = canon(sdlwrite.parse(replay).root), b = canon(sdlwrite.parse(mod).root);
    ordered = JSON.stringify(a) === JSON.stringify(b); unord = JSON.stringify(canonU(a)) === JSON.stringify(canonU(b));
  } catch (e) {}
  return { byte, ordered, unord, flat: flatEq(replay, mod) };
}

// ---- data ----
function loadVanilla(G, loose) {
  const o = ps.open(path.join(G, 'resource'));
  const m = new Map();
  for (const e of o.entries) m.set('resource/' + e.key, e);   // later paks override earlier ones (sorted pak order)
  if (loose) for (const e of looseEntries(G)) m.set(e.key, e);   // GoH: loose files of resource/ (after the paks) [I]
  return { m, close: o.close, errors: o.errors };
}
// no-extension files: the map file (binary) is its own type; the rest (set/stuff/**) are SDL
const typeOf = name => { const i = name.lastIndexOf('.'); return i > name.lastIndexOf('/') ? name.slice(i) : (/(^|\/)map$/.test(name) ? '(none):map' : '(none)'); };
const looksBinary = b => { const n = Math.min(b.length, 65536); for (let i = 0; i < n; i++) { const c = b[i]; if (c === 0) return true; } return b.indexOf(0x7b) < 0; };
let MAX_BYTES = 400 * 1024;   // per-edit replay reparses the file after every edit: bigger files are listed, not replayed (--maxkb)

function candidates(van, root, loose) {
  const mod = ps.open(root), out = [];
  const list = loose ? (() => { const m = new Map(mod.entries.map(e => [e.key, e])); for (const e of looseEntries(root)) m.set(e.key, e); return [...m.values()]; })() : mod.entries;
  for (const e of list) {
    const v = van.m.get(e.key);
    if (!v) continue;
    out.push({ e, v, type: typeOf(e.name), key: e.key });
  }
  return { out, mod };
}

function pick(list, n) { return ps.sample(list.map(c => Object.assign({ name: c.key }, c)), n); }

function safeOut(out) {
  const o = path.resolve(out).replace(/\\/g, '/').toLowerCase();
  if (/(steamapps|\/mods\/|\/workshop\/)/.test(o) || /^[a-z]:\/steamlibrary/.test(o)) throw new Error('--out inside a game/Workshop/mods folder: ' + out);
  return path.resolve(out);
}
// patch-entity.run options of the --gate dry run; a named game passes its vfs exe (no --exe: as before, the vfs default)
function gateOpts(o, out, r) {
  const g = { folder: path.join(out, '_gatemod'), gameDir: o.game, file: r.key, edits: r.edits, dry: true, q: true, tmp: path.join(out, '_gatetmp') };
  if (o.exe) g.exe = require('../lib/games').exeOf(o.exe);
  return g;
}
function writeOut(base, rel, buf) { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); }

function main(argv) {
  const games = require('../lib/games');
  const o = { out: DEF_OUT, per: 50, game: null, mods: null, types: null, gate: 0, exe: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i]; else if (a === '--per') o.per = +argv[++i]; else if (a === '--game') o.game = argv[++i];
    else if (a === '--maxkb') MAX_BYTES = +argv[++i] * 1024;
    else if (a === '--exe') { o.exe = argv[++i]; if (!games.get(o.exe)) { console.error('covreplay: unknown --exe ' + o.exe + ' (as64, mowas_2, mowas2, goh)'); process.exit(2); } }
    else if (a === '--mods') o.mods = argv[++i].split(','); else if (a === '--types') o.types = new Set(argv[++i].split(',')); else if (a === '--gate') o.gate = +argv[++i];
    else { console.error('usage: covreplay.js [--out dir] [--per N] [--types .def,.set] [--game G] [--exe as64|mowas_2|goh] [--mods val,jab|DIR,..] [--gate N]'); process.exit(2); }
  }
  const kind = o.exe ? games.kindOf(o.exe) : 'as2', goh = kind === 'goh';
  if (!o.game) o.game = o.exe ? games.install(o.exe).dir : DEF_G;
  if (!o.mods) o.mods = goh ? ['val', 'mace'] : ['val', 'jab'];
  if (!o.game) { if (goh) games.refuse('covreplay', 'goh', 'no GoH install found (set GOH_GAME or as2.json "goh", or give --game)'); require('../lib/gamedir').missing('covreplay'); }
  const out = safeOut(o.out);
  const van = loadVanilla(o.game, goh);
  const cands = {}, opened = [];
  for (const m of o.mods) {
    const root = modRoot(m, kind, o.game), folder = /[\\/]/.test(m);
    if (!root || !fs.existsSync(root)) { console.error('covreplay: mod ' + m + ' not found' + (root ? ' (' + root + ')' : '') + ', left out'); continue; }
    const name = folder ? path.basename(root) : m;
    const c = candidates(van, root, goh || folder); cands[name] = c.out; opened.push(c.mod);
  }
  o.mods = Object.keys(cands);
  // changed (bytes differ) candidates per mod per type; binary types dropped after probing the first 3 files
  const types = new Map();
  for (const m of o.mods) {
    const byT = new Map();
    for (const c of cands[m]) { if (NOT_SDL_EXT.has(c.type)) continue; (byT.get(c.type) || byT.set(c.type, []).get(c.type)).push(c); }
    for (const [t, list] of byT) {
      if (o.types && !o.types.has(t)) continue;
      const changed = [];
      for (const c of list) { if (c.e.size !== c.v.size || Buffer.compare(rd(c.e), rd(c.v)) !== 0) changed.push(c); }
      if (!changed.length) continue;
      const rec = types.get(t) || types.set(t, { type: t, per: {}, binary: false }).get(t);
      rec.per[m] = changed;
    }
  }
  const results = [], summary = [];
  for (const [t, rec] of [...types].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    const first = Object.values(rec.per).flat().slice(0, 3);
    if (first.every(c => looksBinary(rd(c.e)) || c.e.size > MAX_BYTES * 4)) { summary.push({ type: t, binary: true, changed: Object.values(rec.per).reduce((s, l) => s + l.length, 0) }); continue; }
    const ms = Object.keys(rec.per);
    const quota = {}; let left = o.per;
    ms.forEach((m, i) => { const q = Math.min(rec.per[m].length, Math.ceil(left / (ms.length - i))); quota[m] = q; left -= q; });
    for (const m of ms) if (left > 0) { const extra = Math.min(left, rec.per[m].length - quota[m]); quota[m] += extra; left -= extra; }
    const s = { type: t, changed: {}, sampled: 0, cosmetic: 0, edited: 0, byte: 0, ordered: 0, unord: 0, flat: 0, planFail: 0, applyFail: 0, missGap: 0, missNoGap: 0, edits: 0, gaps: {}, gate: { n: 0, refused: 0, ok: 0, other: 0 }, misses: [] };
    for (const m of ms) {
      s.changed[m] = rec.per[m].length;
      for (const c of pick(rec.per[m], quota[m])) {
        const vb = rd(c.v), mb = rd(c.e);
        const r = { mod: m, type: t, key: c.key, vbytes: vb.length, mbytes: mb.length };
        s.sampled++;
        if (process.env.COVREPLAY_V) console.error(t, m, s.sampled, c.key, vb.length);
        if (vb.length > MAX_BYTES || mb.length > MAX_BYTES) { s.sampled--; s.tooBig = (s.tooBig || 0) + 1; r.status = 'TOO_BIG'; results.push(r); continue; }
        let plan;
        try { plan = planEdits(vb, mb); } catch (e) { s.planFail++; r.status = 'PLAN_FAIL'; r.msg = e.message; results.push(r); s.misses.push(r); continue; }
        r.edits = plan.edits; r.gaps = [...plan.gaps.keys()]; s.edits += plan.edits.length;
        for (const g of r.gaps) s.gaps[g] = (s.gaps[g] || 0) + 1;
        if (compare(vb, mb).ordered) { s.cosmetic++; r.status = 'COSMETIC'; results.push(r); continue; }   // bytes differ, parsed trees equal
        s.edited++;
        const ap = applyAll(vb, plan.edits);
        if (ap.err) { s.applyFail++; r.status = 'APPLY_FAIL'; r.msg = ap.err.join(' ') + ' @edit ' + ap.at + ' ' + JSON.stringify(plan.edits[ap.at]).slice(0, 160); }
        else {
          const cmp = compare(ap.buf, mb); Object.assign(r, cmp);
          if (cmp.byte) s.byte++; if (cmp.ordered) s.ordered++; if (cmp.unord) s.unord++; if (cmp.flat) s.flat++;
          r.status = cmp.ordered ? 'MATCH' : cmp.unord ? 'MATCH_REORDERED' : cmp.flat ? 'MATCH_FLAT_ONLY' : 'MISS';
          writeOut(out, `${m}/replay/${c.key}`, ap.buf);
          writeOut(out, `${m}/vanilla/${c.key}`, vb);
        }
        if (r.status === 'APPLY_FAIL' || r.status === 'MISS' || r.status === 'MATCH_FLAT_ONLY') { if (r.gaps.length) s.missGap++; else s.missNoGap++; s.misses.push(r); }
        results.push(r);
      }
    }
    summary.push(s);
  }
  // optional lint/refusal gate through patch-entity.run (dry-run: nothing is written, tmp in --out)
  if (o.gate) {
    for (const s of summary) {
      if (s.binary) continue;
      const rs = results.filter(r => r.type === s.type && r.edits && r.edits.length && (r.status === 'MATCH' || r.status === 'MATCH_REORDERED')).slice(0, o.gate);
      for (const r of rs) {
        const log = console.log; console.log = () => {};
        let res; try { res = pe.run(gateOpts(o, out, r)); } catch (e) { res = { err: e.message }; }
        console.log = log;
        s.gate.n++;
        if (res.err) { s.gate.other++; r.gate = 'ERR ' + res.err; }
        else if (res.refused) { s.gate.refused++; let why = ''; try { why = JSON.stringify(res.rep.toJSON({ tool: 'covreplay' })).slice(0, 400); } catch (e) {} r.gate = 'REFUSED ' + why; (s.gateWhy = s.gateWhy || []).push(r.key + ' ' + why); }
        else if (res.changed) { s.gate.ok++; r.gate = 'OK'; } else { s.gate.other++; r.gate = res.code || 'NOCHANGE'; }
      }
    }
  }
  writeOut(out, 'results.json', Buffer.from(JSON.stringify({ summary, results }, null, 1)));
  const rate = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';
  const lines = ['| type | changed | sampled | cosmetic | edited | edits | BYTE | ORDERED | UNORD | FLAT | unord rate | miss+gap | miss no gap | apply fail |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const s of summary) {
    if (s.binary) { lines.push(`| ${s.type} | ${s.changed} | binary: not SDL, skipped | | | | | | | | | | | |`); continue; }
    lines.push(`| ${s.type} | ${Object.entries(s.changed).map(([k, v]) => k + ' ' + v).join(', ')} | ${s.sampled} | ${s.cosmetic} | ${s.edited} | ${s.edits} | ${s.byte} | ${s.ordered} | ${s.unord} | ${s.flat} | ${rate(s.unord, s.edited)} | ${s.missGap} | ${s.missNoGap} | ${s.applyFail} |${s.tooBig ? ' (' + s.tooBig + ' files over 400 KB not replayed)' : ''}`);
  }
  const gt = {}; for (const s of summary) for (const [g, n] of Object.entries(s.gaps || {})) gt[g] = (gt[g] || 0) + n;
  lines.push('', 'gap codes (files hit): ' + JSON.stringify(gt));
  if (o.gate) lines.push('gate (dry-run run()): ' + summary.filter(s => !s.binary).map(s => s.type + ' ' + JSON.stringify(s.gate)).join(' | '));
  writeOut(out, 'summary.md', Buffer.from(lines.join('\n') + '\n'));
  console.log(lines.join('\n'));
  for (const c of opened) c.close();
  van.close();
}

module.exports = { planEdits, applyAll, compare, flatEq, stripComments, toUni, modRoot, looseEntries, loadVanilla, candidates, gateOpts };
if (require.main === module) main(process.argv.slice(2));
