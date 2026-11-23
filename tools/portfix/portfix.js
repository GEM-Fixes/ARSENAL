#!/usr/bin/env node
// portfix: whole-tree repairs for a mod that replaces vanilla files with another game's copies (GoH on as64). finds a family before the game does
//   keys      <mod> --game G [--src dir]  entity+properties keys vanilla's entity+properties never use (PORT-53). position-blind global key lists miss these
//   mergedefs <mod> --game G [--also dir] [--dry]  vanilla-only entities include vanilla .ext/.inc files the mod replaced, so their macros vanish:
//             fatal "define not found" (PORT-55). appends vanilla's defines the mod's copy lacks. writes only under <mod>/resource (and --also)
//   mergetables <mod> --game G [--also dir] [--dry]  same for named tables in set/ files: vanilla entries ({Profile "tank"}, {"moto_around"}) the mod's copy lacks,
//             following includes, with vanilla's macros, added at the end of the matching table: fatal "Vision not found" (PORT-57). only missing names, so nothing is overridden
//   carrystuff <mod> --game G [--also dir] [--dry]  vanilla set/stuff files the mod lacks stay live and read the mod's .presets: writes each as a real record the tree can read (PORT-59)
//   anmdirs <mod> --game G [--src dir holding the animation paks] [--also dir] [--dry] [--prefer word] [--single]  {file "folder"} of variant .anm files -> one file for the plain name (default 2hand, or the first variant with --prefer word) + one extra {sequence "name__variant"} per other variant (--single: none) (PORT-60)
//   macroclash <mod> --game G [--also dir] [--dry]  macro with another body in the mod's copy: vanilla-only callers copied in, calling vanilla's body as as2_<name> (PORT-61)
//   macrocheck <mod> --game G [--json f] [--fix [--also dir]]  walks each .def's include chain like the reader: calls with no define, includes with no file. --fix puts a define the tree holds elsewhere on top of the .def
//   vanprops <mod> --game G [--also dir] [--dry]  vanilla-only entities read private copies of the vanilla .ext/.inc the mod replaced, under /properties/as2van (PORT-63)
//   extenders <mod> --game G [--also dir] [--dry]  drops {Extender "x" ...} blocks the engine and vanilla never use (PORT-64)
//   ebmframes <mod> --game G [--src dir holding the mod's paks] [--also dir] [--dry]  .ebm naming an image no layer holds: vanilla's .ebm if whole, else a warning (PORT-65)
//   minworkers <mod> --game G [--also dir] [--dry]  drops GoH's minWorkers N from gunner, charger and workers blocks (PORT-66)
//   shapes <mod> --game G [--json f]  report: block kinds whose inline tokens vanilla never has, entity/fx skipped (PORT-66)
//   fxdup <mod> --game G [--also dir] [--dry]  view with a second generator, mover, visualizer or sprite: later one dropped (PORT-67)
//   locospeed <mod> --game G [--also dir] [--dry]  Slow, Normal, Fast moved out of Locomotion into a Speed block (PORT-68)
//   panelterms <mod> --game G [--also dir] [--dry]  panel condition terms the engine lacks: engine, hatch to vehicle, medic to human, others dropped (PORT-69)
//   mtlkeys <out mod> --game G --src <root holding the .mtl paks> [--also dir] [--dry]  writes each .mtl without the keys as64 has no reader for (PORT-24). --src is read only
//   mdlkeys <out mod> --game G --src <root holding the .mdl paks> [--also dir] [--dry]  writes each .mdl without sequence/events and obstacle/obstacleID (PORT-74). --src is read only
//   volmats <out mod> --game G --src <root holding GoH set/material.set> [--also dir] [--dry]  AS2 set/material.set plus the materials only GoH has (PORT-75)
//   viewkeys <out mod> --game G --src <root holding the text> [--also dir] [--dry]  drops lightview timetolive and entitygenerator entity spinx, spiny, spinz, align (PORT-71)
// <mod> = mod folder holding resource/, or a resource folder. never point it at the install's own resource
// --exe as64|mowas_2|mowas2 (every command): the AS2 target of the port. as64: the vanilla view also holds <game>/as64/core/resource
//   on top of <game>/resource (as the vfs mounts it), so macrocheck and the rest see the defines only as64/core holds; mowas_2: <game>/resource
//   only. no --exe: <game>/resource only, as before. goh: refused (GoH is the source of a port, never its target). --game may be left out
//   when --exe is given: the AS2 install comes from lib/games install()
// Author: Imperator_Aug (ARSENAL, ia-724cef5e)
'use strict';
//   resupply <out mod> --game G --src <root> [--also dir] [--dry]  adds {max N} to supply zone items (PORT-77)
//   bones <out mod> --game G --src <root> [--also dir] [--dry] [--json file]  drops bone modifiers on bones the entity's model lacks (PORT-78)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const sdlw = require('../lib/sdlwrite'), pakset = require('../lib/pakset');
const low = s => String(s || '').toLowerCase();
const BIN = /\.(dds|tga|png|jpg|ogg|wav|ply|anm|mp3|bmp|skel|pak|bin|mtl|ebm|tex|ctm|etf|font|tpl|exe|dll)$/i;

// --exe word -> the vfs exe of the AS2 target (lib/games); goh: one plain line, exit 2; another word: exit 2
function exeArg(v) {
  const games = require('../lib/games'), g = games.get(v);
  if (!g) { console.error('portfix: --exe must be one of as64|mowas_2|mowas2 (got ' + v + ')'); process.exit(2); }
  if (g.kind === 'goh') games.refuse('portfix', g, 'the mod is repaired for an AS2 target (AS64 or MoW:AS2); GoH is the source of the port, read through --src', 'plan/reports/game-parity/t-port-a.md: n/a (source game)');
  return g.exe;
}
function args(a) {
  const o = { _: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--game') o.game = a[++i]; else if (a[i] === '--exe') o.exe = exeArg(a[++i]); else if (a[i] === '--also') o.also = a[++i]; else if (a[i] === '--src') o.src = a[++i]; else if (a[i] === '--engine') o.engine = a[++i];
    else if (a[i] === '--json') o.json = a[++i]; else if (a[i] === '--fix') o.fix = true; else if (a[i] === '--single') o.single = true; else if (a[i] === '--prefer') o.prefer = a[++i]; else if (a[i] === '--dry') o.dry = true; else if (a[i] === '-q') o.q = true; else o._.push(a[i]);
  }
  return o;
}
const resDir = m => fs.existsSync(path.join(m, 'resource')) ? path.join(m, 'resource') : m;
const walk = (root, fn, rel = '') => { let l; try { l = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; } for (const e of l) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(root, fn, r); else fn(r.toLowerCase(), path.join(root, r)); } };

// vanilla view: paks, then loose files on top. read(key) -> Buffer. target as64 (--exe as64): as64/core/resource the same way on top
// (lib/vfs.js 3c: as64/core mounted right after the game)
let EXE;
const vanRoots = game => [path.join(game, 'resource')].concat(EXE === 'as64' ? [path.join(game, 'as64', 'core', 'resource')].filter(d => fs.existsSync(d)) : []);
function vanilla(game) {
  const m = new Map(), sets = [];
  for (const res of vanRoots(game)) {
    const ps = pakset.open(res, null); sets.push(ps);
    for (const e of ps.entries) m.set(e.key.toLowerCase(), () => pakset.read(e));
    walk(res, (k, p) => { if (!/\.pak$/i.test(k)) m.set(k, () => fs.readFileSync(p)); });
  }
  return { m, close: () => sets.forEach(ps => ps.close()) };
}
function blockKeys(b, set) {
  const go = ns => { for (const c of ns || []) { if (c.type === 'block') { set(low(c.name)); go(c.items); } else if (c.type === 'list') go(c.items); } };
  go(sdlw.parse(b).root.items);
}
function vanillaKeys(v) {
  const s = new Set();
  for (const [k, read] of v.m) { if (!/^(entity|properties)\//.test(k) || BIN.test(k)) continue; try { blockKeys(read(), n => s.add(n)); } catch { /* not SDL */ } }
  return s;
}
function engineLiterals(src) {
  const lit = new Map();
  for (const top of ['game', 'gem']) walk(path.join(src, top), (k, p) => {
    if (!/\.(cpp|h|inl)$/.test(k)) return;
    for (const m of fs.readFileSync(p, 'latin1').matchAll(/"([A-Za-z_]\w*)"/g)) { const n = low(m[1]); if (!lit.has(n)) lit.set(n, path.basename(p)); }
  });
  return lit;
}

function cmdKeys(o) {
  const res = resDir(o._[0]), v = vanilla(o.game), known = vanillaKeys(v), hits = new Map();
  v.close();
  const lit = o.src ? engineLiterals(o.src) : new Map();
  for (const d of ['entity', 'properties']) walk(path.join(res, d), (k, p) => {
    if (BIN.test(k)) return;
    const rel = d + '/' + k;
    try { blockKeys(fs.readFileSync(p), n => { if (!known.has(n)) { const h = hits.get(n) || { n: 0, file: rel }; h.n++; hits.set(n, h); } }); } catch { /* not SDL */ }
  });
  const rows = [...hits].sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1));
  for (const [k, h] of rows) console.log(`${h.file}: WARN_ENT_KEY_UNUSED ${k} x${h.n}${lit.has(k) ? ' engine string in ' + lit.get(k) + ': check its reader takes this position' : ' no engine string'}`);
  console.log(`${rows.length} findings`);
}

// top-level (define "name" ...) forms: name -> source text
function defines(b) {
  const out = new Map();
  for (const c of sdlw.parse(b).root.items || []) {
    if (c.type !== 'list') continue;
    const t = b.subarray(c.start, c.end).toString('latin1'), m = /^\(\s*define\s+"?([^"\s()]+)"?/i.exec(t);
    if (m) out.set(m[1].toLowerCase(), t);
  }
  return out;
}
function cmdMerge(o) {
  const res = resDir(o._[0]), game = path.resolve(o.game);
  if (path.resolve(res).toLowerCase() === path.join(game, 'resource').toLowerCase()) { console.error('portfix: refusing the install\'s own resource'); process.exit(2); }
  const v = vanilla(game); let files = 0, added = 0;
  for (const [k, read] of v.m) {
    if (!/^(entity|properties|set)\//.test(k) || !/\.(ext|inc)$/.test(k)) continue;
    const p = path.join(res, k); if (!fs.existsSync(p)) continue;
    const mine = fs.readFileSync(p); let a, g;
    try { a = defines(read()); g = defines(mine); } catch { console.log(`${k}: WARN_MERGE_PARSE not SDL, skipped`); continue; }
    const miss = [...a].filter(([n]) => !g.has(n)); if (!miss.length) continue;
    files++; added += miss.length;
    console.log(`${k}: MERGED_DEFINES ${miss.map(([n]) => n).join(' ')}`);
    if (o.dry) continue;
    const b = Buffer.concat([mine, Buffer.from('\r\n; vanilla defines kept for vanilla-only entities (portfix)\r\n' + miss.map(([, t]) => t).join('\r\n') + '\r\n', 'latin1')]);
    fs.writeFileSync(p, b);
    if (o.also) { const q = path.join(o.also, k); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, b); }
  }
  v.close();
  console.log(`${files} files, ${added} defines${o.dry ? ' (dry run)' : ''}`);
}

// named entries and defines of one set file, includes followed. path = unnamed table blocks above the entry
function tableScan(b, read, dir, out, tpath, seen) {
  const src = b.toString('latin1');
  const go = (items, p, depth) => {
    for (const c of items || []) {
      if (c.type === 'list') {
        const t = src.slice(c.start, c.end), d = /^\(\s*define\s+"?([^"\s()]+)"?/i.exec(t), inc = /^\(\s*include\s+"([^"]+)"/i.exec(t);
        if (d) out.defines.set(d[1].toLowerCase(), t);
        else if (inc) { const k = (inc[1][0] === '/' ? inc[1].slice(1) : path.posix.join(dir, inc[1])).toLowerCase(); if (seen.has(k)) continue; seen.add(k); const r = read(k); if (r) tableScan(r, read, path.posix.dirname(k), out, p, seen); else out.lostInc.push(k); }
      } else if (c.type === 'block') {
        const t = src.slice(c.start, c.end), m = /^\{\s*(?:([\w+-]+)\s+)?"([^"]+)"/.exec(t);
        // {terms {name property "tag"}}: named by a bare word, vision.set entries fail with "incorrect property" without them
        const term = p[p.length - 1] === 'terms' && /^\{\s*([\w+-]+)\s/.exec(t);
        if (m || term) { const id = term ? 'term ' + low(term[1]) : low(m[1]) + ' ' + low(m[2]), q = p.join('/'); if (!out.entries.has(id)) out.entries.set(id, { p: q, t }); }
        else if (depth < 2) go(c.items, p.concat(low(c.name)), depth + 1);
      }
    }
  };
  go(sdlw.parse(b).root.items, tpath, 0);
  return out;
}
// not tables entities name: blow, ability = one record per file; fxmanager = batching list, an entry needs a sprite view (PORT-57)
const SKIP_TABLE = /^set\/((stuff|registry|interface|blow|ability|panel_control)\/|fxmanager\.set$)/;
function cmdTables(o) {
  const res = resDir(o._[0]), game = path.resolve(o.game);
  if (path.resolve(res).toLowerCase() === path.join(game, 'resource').toLowerCase()) { console.error('portfix: refusing the install\'s own resource'); process.exit(2); }
  const v = vanilla(game); let files = 0, added = 0;
  const readV = k => { const f = v.m.get(k); return f ? f() : null; };
  const readM = k => { const p = path.join(res, k); return fs.existsSync(p) ? fs.readFileSync(p) : readV(k); };
  const scan = (b, read, k) => tableScan(b, read, path.posix.dirname(k), { entries: new Map(), defines: new Map(), lostInc: [] }, [], new Set([k]));
  // an included file is fixed before the file naming it, so the parent sees its new entries
  const keys = [...v.m.keys()].filter(k => /^set\//.test(k) && /\.(set|inc)$/.test(k) && !SKIP_TABLE.test(k)).sort((a, b) => (a.endsWith('.inc') ? 0 : 1) - (b.endsWith('.inc') ? 0 : 1) || (a < b ? -1 : 1));
  for (const k of keys) {
    const p = path.join(res, k); if (!fs.existsSync(p)) continue;
    let a, g, mine = fs.readFileSync(p);
    try { a = scan(readV(k), readV, k); g = scan(mine, readM, k); } catch { console.log(k + ': WARN_MERGE_PARSE not SDL, skipped'); continue; }
    const miss = [...a.entries].filter(([n]) => !g.entries.has(n)); if (!miss.length) continue;
    if (!g.entries.size) { console.log(k + ': WARN_TABLE_SHAPE ' + miss.length + ' vanilla entries, mod copy has none of this shape: not merged'); continue; }
    const tree = sdlw.parse(mine), byPath = new Map(), placed = [];
    for (const [n, e] of miss) { if (!byPath.has(e.p)) byPath.set(e.p, []); byPath.get(e.p).push([n, e.t]); }
    for (const [q, list] of byPath) {
      let node = tree.root; for (const seg of q ? q.split('/') : []) node = node && (node.items || []).find(c => c.type === 'block' && low(c.name) === seg);
      if (!node) { console.log(k + ': WARN_TABLE_NO_PARENT ' + q + ', ' + list.length + ' entries not merged'); continue; }
      placed.push({ at: node.root ? mine.length : node.end - 1, list });
    }
    if (!placed.length) continue;
    placed.sort((x, y) => y.at - x.at);
    const defs = [...a.defines].filter(([n, t]) => g.defines.get(n) !== t).map(([, t]) => t), names = [];
    placed.forEach((e, i) => {
      const d = i === placed.length - 1 ? defs : []; // defines go with the first table in the file
      const add = '\r\n; vanilla entries kept for vanilla-only entities (portfix)\r\n' + d.concat(e.list.map(x => x[1])).join('\r\n') + '\r\n';
      mine = Buffer.concat([mine.subarray(0, e.at), Buffer.from(add, 'latin1'), mine.subarray(e.at)]);
      for (const x of e.list) names.push(x[0].trim());
    });
    files++; added += names.length;
    console.log(k + ': MERGED_TABLE ' + names.join(', '));
    if (o.dry) continue;
    fs.writeFileSync(p, mine);
    if (o.also) { const q = path.join(o.also, k); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, mine); }
  }
  v.close();
  console.log(files + ' files, ' + added + ' entries' + (o.dry ? ' (dry run)' : ''));
}

// carrystuff: the engine lists set/stuff, so a vanilla file the mod lacks stays live and reads the mod's .presets. a bare {item} stub stops that but is not a weapon:
// "non-weapon Stuff" then null deref (PORT-59). so write vanilla's real record, minus keys no stuff reader takes and macros the dir's .presets lack.
// a file whose tags cover a mod file would displace it: it carries that file's content instead, with that file's .presets
const isStub = p => /^\s*\{\s*[a-z_]+\s*\}\s*$/i.test(fs.readFileSync(p, 'latin1')); // bare root, from a first pass; anything else in the mod is its own record
function cmdCarry(o) {
  const res = resDir(o._[0]), T = path.join(res, 'set/stuff'), v = vanilla(o.game), keys = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '../goh2as2/stuffkeys.json'), 'utf8')));
  const word = x => low(x && (x.value || x.text)).replace(/"/g, ''), skip = /(^|\/)\.presets$|\.fsm$/;
  const tagsOf = k => low(path.posix.basename(k)).split(/[. ]/).filter(Boolean), covers = (a, b) => a.every(x => b.includes(x));
  const mod = new Map(); walk(T, (k, p) => { if (!skip.test(k)) mod.set(k, p); });
  const own = [...mod].filter(([, p]) => !isStub(p)).sort(([a], [b]) => a < b ? -1 : 1).map(([k, p]) => ({ k, p, tags: tagsOf(k), from: (fs.readFileSync(p, 'latin1').match(/^\s*\{\s*from\s+"([^"]+)"/m) || [])[1] }));
  const known = new Set(own.map(g => g.tags.join(' ')));
  const defsMemo = new Map(), defsOf = (d, out = new Set(), seen = new Set(), file = path.join(T, d, '.presets')) => {
    if (seen.has(file)) return out; seen.add(file);
    let t; try { t = sdlw.parse(fs.readFileSync(file)).root; } catch { return out; }
    for (const c of t.items || []) if (c.type === 'list') { const h = c.items || [], w = word(h[0]); if (w === 'define') out.add(word(h[1])); else if (w === 'include') { const r = word(h[1]).replace(/\\/g, '/'); defsOf(d, out, seen, r.startsWith('/') ? path.join(res, r.slice(1)) : path.join(path.dirname(file), r)); } }
    return out;
  };
  const defs = d => { if (!defsMemo.has(d)) defsMemo.set(d, defsOf(d)); return defsMemo.get(d); };
  // vanilla's own .presets of a dir (includes followed): name -> define text, so a macro the mod's .presets lack travels with the carried file (PORT-116)
  const vdefMemo = new Map(), vdefsOf = (d, out = new Map(), seen = new Set(), file = 'set/stuff/' + d + '/.presets') => {
    file = file.replace(/\/+$/, ''); if (seen.has(file) || !v.m.has(file)) return out; seen.add(file);
    const b = v.m.get(file)(); let t; try { t = sdlw.parse(b).root; } catch { return out; }
    for (const c of t.items || []) if (c.type === 'list') {
      const h = c.items || [], w = word(h[0]);
      if (w === 'define') out.set(word(h[1]), b.subarray(c.start, c.end).toString('latin1'));
      else if (w === 'include') { const r = word(h[1]).replace(/\\/g, '/'); vdefsOf(d, out, seen, low(r.startsWith('/') ? r.slice(1) : path.posix.normalize(path.posix.dirname(file) + '/' + r))); }
    }
    return out;
  };
  const vdefs = d => { if (!vdefMemo.has(d)) vdefMemo.set(d, vdefsOf(d)); return vdefMemo.get(d); };
  const dropK = {}, dropM = {}, missing = new Set(); let files = 0, carried = 0, displaced = 0, carriedMacros = 0;
  const allTags = own.map(g => g.tags).concat([...v.m.keys()].filter(k => k.startsWith('set/stuff/') && !skip.test(k)).map(tagsOf));
  const emit = (rel, out) => { files++; if (o.dry) return; const p = path.join(T, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, out); if (o.also) { const q = path.join(o.also, 'set/stuff', rel); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, out); } };
  for (const [k, read] of [...v.m].sort(([a], [b]) => a < b ? -1 : 1)) {
    if (!k.startsWith('set/stuff/') || skip.test(k)) continue;
    const rel = k.slice(10), cur = mod.get(rel);
    if (cur && !isStub(cur)) continue;
    const T2 = tagsOf(rel), pat = own.find(g => g.from && covers(low(g.from).split(/\s+/), T2)), tgt = own.find(g => covers(g.tags, T2)) || (pat && own.find(g => covers(low(pat.from).split(/\s+/), g.tags)));
    if (tgt) {
      const raw = fs.readFileSync(tgt.p), r = sdlw.parse(raw).root.items.find(c => c.type === 'block'), head = r.items.find(x => x.type === 'string') || r.items[0], at = head ? head.end : r.start + 1;
      const dir = path.posix.dirname(tgt.k), inc = fs.existsSync(path.join(T, dir, '.presets')) ? `\r\n(include "/set/stuff/${dir}/.presets")` : '';
      emit(rel, Buffer.concat([raw.subarray(0, at), Buffer.from(inc), raw.subarray(at)])); displaced++;
      if (!o.q) console.log(rel + ': WARN_CARRY_DISPLACES ' + tgt.k);
      continue;
    }
    let t; const b = read(); try { t = sdlw.parse(b); } catch { if (!o.q) console.log(rel + ': WARN_CARRY_UNPARSED'); continue; }
    const D = defs(path.posix.dirname(rel)), VD = vdefs(path.posix.dirname(rel)), need = new Set(), mine = new Set();
    for (const c of t.root.items || []) if (c.type === 'list' && word((c.items || [])[0]) === 'define') mine.add(word(c.items[1]));
    for (const m of b.toString('latin1').matchAll(/\{\s*(?:from|filling)\s+"([^"]+)"/gi)) { const w = low(m[1]).split(/\s+/).filter(Boolean); if (!allTags.some(g => covers(w, g))) missing.add(m[1]); }
    const kill = [], go = n => { for (const c of n.items || []) {
      if (c.type === 'block') { const nm = low(c.name); if (nm && !/^[-\d.#%]/.test(nm) && !keys.has(nm)) { kill.push(c); dropK[nm] = (dropK[nm] || 0) + 1; continue; } go(c); }
      else if (c.type === 'list') { const w = word((c.items || [])[0]); if (w === 'define') continue; if (w === 'if' || w === 'else') { go(c); continue; } if (w !== 'include' && w && !/^[-\d.]/.test(w) && !D.has(w) && !mine.has(w) && VD.has(w)) { need.add(w); continue; } if (w === 'include' || (w && !/^[-\d.]/.test(w) && !D.has(w) && !mine.has(w))) { kill.push(c); dropM[w] = (dropM[w] || 0) + 1; } }
    } };
    for (const r of t.root.items || []) if (r.type === 'block') go(r);
    for (const c of kill) sdlw.removeNode(c);
    for (const n of need) for (const m of VD.get(n).matchAll(/\(\s*"?([^"\s()]+)/g)) { const x = low(m[1]); if (x !== 'define' && x !== n && VD.has(x) && !D.has(x) && !mine.has(x)) need.add(x); }
    let out = sdlw.serialize(t); if (need.size) { out = Buffer.concat([Buffer.from('; macros of the vanilla .presets, carried (portfix)\r\n' + [...need].map(n => VD.get(n)).join('\r\n') + '\r\n', 'latin1'), Buffer.from(out)]); carriedMacros += need.size; }
    sdlw.parse(out); emit(rel, out); carried++;
  }
  v.close();
  const top = x => Object.entries(x).sort((a, b) => b[1] - a[1]).slice(0, 12).map(e => e.join(' x')).join(', ');
  if (Object.keys(dropK).length) console.log('WARN_CARRY_DROP_KEY ' + top(dropK));
  if (Object.keys(dropM).length) console.log('WARN_CARRY_DROP_MACRO ' + top(dropM));
  for (const m of missing) console.log('WARN_CARRY_NO_TARGET ' + m);
  console.log(files + ' files, ' + carried + ' carried, ' + displaced + ' displacing, ' + carriedMacros + ' macro defines carried' + (o.dry ? ' (dry run)' : ''));
}

// anmdirs: GoH's {file "locomotion\jog_gun_down"} names a folder of variant .anm files, AS2's takes one resource:
// fatal Resource not found (PORT-60). point the ref at one file of the folder, with .anm: a bare name of an existing .anm is not found either. --src = dir holding the mod's animation paks/files if not <mod> itself
// --prefer 1hand: the plain-name clip is the first variant containing that word (pistol holds); default 2hand (rifles). --single: old behaviour, no extra variant sequences
const pick = (l, pref) => { const s = l.slice().sort(), w = pref ? new RegExp(pref.replace(/[^\w]/g, '')) : /2hand/; return s.find(x => w.test(x) && !/_var\d/.test(x)) || s.find(x => /2hand/.test(x) && !/_var\d/.test(x)) || s.find(x => !/_var\d/.test(x)) || s[0]; };
// {sequence ...} block that directly holds the {file} at index at: {start,end} or null. skips strings and ; comments
function seqEnd(b, at) {
  const start = b.lastIndexOf('{sequence', at); if (start < 0) return null;
  let d = 0, i = start;
  for (; i < b.length; i++) {
    const ch = b[i];
    if (ch === '"') { i = b.indexOf('"', i + 1); if (i < 0) return null; }
    else if (ch === ';') { const j = b.indexOf('\n', i); if (j < 0) return null; i = j; }
    else if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) break; }
    if (i === at && d !== 2) return null; // the {file} brace itself is depth 2 inside the sequence
  }
  return i < b.length && i > at ? { start, end: i + 1 } : null;
}
function cmdAnmDirs(o) {
  const res = resDir(o._[0]), roots = [res].concat(o.src ? [resDir(o.src)] : []), v = vanilla(o.game), known = new Set(v.m.keys()); v.close();
  const addPak = d => { const s = pakset.open(d, null); for (const e of s.entries) known.add(e.key.toLowerCase().replace(/\\/g, '/')); s.close(); };
  for (const r of roots) { addPak(r); walk(r, k => known.add(k)); }
  const stems = new Set(), dirs = new Map();
  for (const k of known) { stems.add(k.replace(/\.[a-z0-9_]+$/, '')); if (!k.endsWith('.anm')) continue; const d = path.posix.dirname(k); if (!dirs.has(d)) dirs.set(d, []); dirs.get(d).push(path.posix.basename(k, '.anm')); }
  let files = 0, refs = 0, nvar = 0; const miss = new Map();
  for (const top of ['properties', 'entity']) walk(path.join(res, top), (k, p) => {
    if (!/\.(inc|ext|def|mdl)$/.test(k)) return;
    const b = fs.readFileSync(p).toString('latin1'); if (!/\{\s*file\s+"/i.test(b)) return;
    const rel = top + '/' + k; let n = 0;
    const eol = b.includes('\r\n') ? '\r\n' : '\n', ev = []; // ev: edits in original coordinates {p,q,s}: b[p..q) becomes s
    for (const m of b.matchAll(/(\{\s*file\s+")([^"]+)(")/gi)) {
      const [all, a, r, c] = m, at = m.index;
      if (b.slice(b.lastIndexOf('\n', at) + 1, at).includes(';')) continue;
      const w = low(r).replace(/\\/g, '/'), t = w.startsWith('/') ? w.slice(1) : path.posix.dirname(rel) + '/' + w, st = t.replace(/\.[a-z0-9_]+$/, '');
      if (known.has(t)) continue;
      if (known.has(t + '.anm') && !dirs.has(t)) { n++; ev.push({ p: at, q: at + all.length, s: a + r + '.anm' + c }); continue; }
      if (stems.has(st) && st !== t) continue;
      if (dirs.has(t)) {
        n++; const sep = r.includes('/') ? '/' : '\\', main = pick(dirs.get(t), o.prefer);
        ev.push({ p: at, q: at + all.length, s: a + r + sep + main + '.anm' + c });
        if (!o.single) { // every other variant becomes its own sequence "<name>__<stem>" after the block: AS2 Find() takes the first sequence of a name, so only the first is reachable by the plain name (PORT-101)
          const e = seqEnd(b, at); if (e) {
            const blk =b.slice(e.start, e.end), rf = at - e.start;
            for (const v of dirs.get(t).slice().sort()) {
              if (v === main) continue;
              let nb = blk.slice(0, rf) + a + r + sep + v + '.anm' + c + blk.slice(rf + all.length);
              nb = nb.replace(/^(\{\s*sequence\s+")([^"]*)(")/i, (x, p1, nm, p3) => p1 + nm + '__' + v + p3);
              ev.push({ p: e.end, q: e.end, s: eol + '\t' + nb }); nvar++;
            }
          }
        }
        continue;
      }
      miss.set(t, rel);
    }
    ev.sort((x, y) => x.p - y.p || x.q - y.q); let out = '', last = 0;
    for (const x of ev) { out += b.slice(last, x.p) + x.s; last = x.q; }
    out += b.slice(last);
    if (!n) return;
    files++; refs += n; if (!o.q) console.log(rel + ': WARN_PORT_ANM_DIR x' + n);
    if (o.dry) return; const buf = Buffer.from(out, 'latin1'); fs.writeFileSync(p, buf);
    if (o.also) { const q = path.join(o.also, rel); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, buf); }
  });
  for (const [t, f] of [...miss].slice(0, 40)) console.log(f + ': WARN_ANM_MISSING ' + t);
  console.log(files + ' files, ' + refs + ' refs, ' + nvar + ' variant sequences added, ' + miss.size + ' missing' + (o.dry ? ' (dry run)' : ''));
}

// macroclash: the mod's copy of a vanilla .ext/.inc redefines a macro with other args or body, so vanilla-only entities expand the wrong one:
// vanilla ("shield" args 10) in GoH's {volume %0 {thickness %1}} = fatal String expected (PORT-61). vanilla callers are copied in and call vanilla's body as as2_<name>.
// the mod's own callers keep the mod's macro. vanilla defines mergedefs appended count as vanilla callers
const TAIL = '; vanilla defines kept for vanilla-only entities (portfix)';
function cmdClash(o) {
  const res = resDir(o._[0]), game = path.resolve(o.game);
  if (path.resolve(res).toLowerCase() === path.join(game, 'resource').toLowerCase()) { console.error('portfix: refusing the install\'s own resource'); process.exit(2); }
  const norm = s => s.replace(/;[^\r\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const v = vanilla(game), clash = new Map();
  const put = (rel, buf) => { if (o.dry) return; const p = path.join(res, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); if (o.also) { const q = path.join(o.also, rel); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, buf); } };
  for (const [k, read] of v.m) {
    if (!/^(entity|properties|set)\//.test(k) || !/\.(ext|inc)$/.test(k)) continue;
    const p = path.join(res, k); if (!fs.existsSync(p)) continue;
    let a, g; try { a = defines(read()); g = defines(fs.readFileSync(p)); } catch { continue; }
    for (const [n, s] of a) if (g.has(n) && norm(g.get(n)) !== norm(s)) { if (!clash.has(n)) clash.set(n, []); clash.get(n).push({ k, s }); }
  }
  for (const [k, read] of v.m) {
    if (!/^(entity|properties|set)\//.test(k) || !/\.(ext|inc)$/.test(k) || !fs.existsSync(path.join(res, k))) continue;
    let a; try { a = defines(read()); } catch { continue; }
    for (const [n, s] of a) if (clash.has(n) && !clash.get(n).some(x => x.k === k)) clash.get(n).push({ k, s });
  }
  const used = new Map();
  // (?<![\w%]): fx("x") is a parameter. a vanilla-only file's own define of the name moves with its calls
  const ren = s => s.replace(/(?<![\w%])\(\s*"([^"\s()]+)"/g, (all, n) => { const l = n.toLowerCase(); if (!clash.has(l)) return all; used.set(l, (used.get(l) || 0) + 1); return '("as2_' + n + '"'; })
    .replace(/\(\s*define\s+"([^"\s()]+)"/gi, (all, n) => clash.has(n.toLowerCase()) ? '(define "as2_' + n + '"' : all);
  let callers = 0;
  for (const [k, read] of v.m) {
    if (!/^(entity|properties|set)\//.test(k) || !/\.(def|ext|inc|mdl)$/.test(k)) continue;
    const p = path.join(res, k), had = fs.existsSync(p) ? fs.readFileSync(p).toString('latin1') : null;
    if (had !== null && (clash.has(k) || !had.includes('"as2_') || new RegExp(TAIL.replace(/[()]/g, '\\$&')).test(had))) continue;
    const b = read().toString('latin1'), out = ren(b); if (out === b || out === had) continue;
    callers++; put(k, Buffer.from(out, 'latin1'));
  }
  // tails mergedefs appended call vanilla's macros too
  const tails = new Set();
  for (const top of ['entity', 'properties', 'set']) walk(path.join(res, top), (k, p) => {
    if (!/\.(ext|inc)$/.test(k)) return;
    const b = fs.readFileSync(p).toString('latin1'), at = b.indexOf(TAIL); if (at < 0) return;
    const out = b.slice(0, at) + ren(b.slice(at)); if (out === b) return;
    tails.add(k); put(top + '/' + k, Buffer.from(out, 'latin1'));
  });
  // vanilla bodies call each other: closure over the macros in use. each goes in the file that held the original, so it is visible wherever that was
  const done = new Set(), add = new Map();
  for (let more = true; more;) {
    more = false;
    for (const n of [...used.keys()]) {
      if (done.has(n)) continue; done.add(n); more = true;
      for (const { k, s } of clash.get(n)) { const nm = s.replace(/^\(\s*define\s+"?([^"\s()]+)"?/i, (a, x) => '(define "as2_' + x + '"'); if (!add.has(k)) add.set(k, new Map()); add.get(k).set('as2_' + n, ren(nm)); }
    }
  }
  let added = 0;
  for (const [k, m] of add) {
    const p = path.join(res, k), mine = fs.readFileSync(p), g = defines(mine); let txt = mine.toString('latin1'); const before = txt;
    for (const [n, s] of m) if (g.has(n) && g.get(n) !== s) txt = txt.replace(g.get(n), () => s); // older run's body
    const miss = [...m].filter(([n]) => !g.has(n)); added += miss.length;
    if (miss.length) txt += '\r\n' + TAIL + '\r\n' + miss.map(([, s]) => s).join('\r\n') + '\r\n';
    if (txt !== before) put(k, Buffer.from(txt, 'latin1'));
  }
  v.close();
  if (!o.q) for (const [n, c] of [...used].sort((a, b) => b[1] - a[1])) console.log(n + ': WARN_MACRO_CLASH x' + c + ' ' + clash.get(n).map(x => x.k).join(' '));
  console.log(clash.size + ' macros differ, ' + used.size + ' in use, ' + callers + ' caller files, ' + tails.size + ' tails, ' + added + ' defines' + (o.dry ? ' (dry run)' : ''));
}

// macrocheck: what the reader does to each .def: includes in order, defines collect, a call needs a define already seen. no boot needed.
// fatal "define not found" and missing includes, the whole family at once (PORT-55, PORT-62)
function sdlScan(s) { // top-level forms of one file: {inc,args}, {def,name,body}, {call,name,args}; nested forms flatten except define bodies
  const out = []; let i = 0; const n = s.length;
  const skipStr = () => { i++; while (i < n && s[i] !== '"') { if (s[i] === '\\' && s[i + 1] === '"') i++; i++; } i++; };
  const ws = () => { for (;;) { while (i < n && /\s/.test(s[i])) i++; if (s[i] === ';') { while (i < n && s[i] !== '\n') i++; continue; } if (s[i] === '/' && s[i + 1] === '/') { while (i < n && s[i] !== '\n') i++; continue; } return; } };
  const closeOf = from => { let d = 0, j = from; while (j < n) { const c = s[j]; if (c === '"') { j++; while (j < n && s[j] !== '"') { if (s[j] === '\\' && s[j + 1] === '"') j++; j++; } } else if (c === ';') { while (j < n && s[j] !== '\n') j++; continue; } else if (c === '(') d++; else if (c === ')' && --d === 0) return j; j++; } return n - 1; };
  while (i < n) {
    const c = s[i];
    if (c === ';' || (c === '/' && s[i + 1] === '/')) { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '"') { skipStr(); continue; }
    if (c !== '(') { i++; continue; }
    if (i > 0 && /[\w%]/.test(s[i - 1])) { i++; continue; } // name("x") = parameter, not a call
    const open = i; i++; ws();
    if (s[i] === '"') { const a = i + 1; skipStr(); out.push({ call: s.slice(a, i - 1) }); continue; }
    const m = /^(include|define)\b/i.exec(s.slice(i, i + 8));
    if (!m) continue;
    i += m[1].length; ws();
    if (s[i] !== '"') continue;
    const a = i + 1; skipStr(); const name = s.slice(a, i - 1);
    if (m[1].toLowerCase() === 'include') { out.push({ inc: name }); continue; }
    const end = closeOf(open); out.push({ def: name.toLowerCase(), body: s.slice(i, end) }); i = end + 1;
  }
  return out;
}
function cmdMacroCheck(o) {
  const res = resDir(o._[0]), v = vanilla(path.resolve(o.game)), cache = new Map(), roots = new Set(), vdef = new Map();
  const load = k => { if (cache.has(k)) return cache.get(k); let b = null; const p = path.join(res, k); if (fs.existsSync(p)) b = fs.readFileSync(p); else if (v.m.has(k)) b = v.m.get(k)(); const r = b && sdlScan(b.toString('latin1')); cache.set(k, r); return r; };
  for (const k of v.m.keys()) {
    if (/^entity\/.*\.def$/.test(k)) roots.add(k);
    if (/^(entity|properties)\/.*\.(ext|inc)$/.test(k)) { const r = sdlScan(v.m.get(k)().toString('latin1')); for (const x of r) if (x.def) { if (!vdef.has(x.def)) vdef.set(x.def, []); vdef.get(x.def).push(k); } }
  }
  walk(path.join(res, 'entity'), k => { if (k.endsWith('.def')) roots.add('entity/' + k); });
  const miss = new Map(), incs = new Map(), rootMiss = new Map();
  const note = (m, n, root) => { if (!m.has(n)) m.set(n, { c: 0, f: [] }); const e = m.get(n); e.c++; if (e.f.length < 400) e.f.push(root); };
  let done = 0;
  for (const root of roots) {
    const defs = new Map(), seen = new Set(); let steps = 0;
    const run = (items, dir, depth) => {
      for (const x of items) {
        if (steps++ > 20000 || depth > 40) return;
        if (x.def) defs.set(x.def, { body: x.body, dir });
        else if (x.inc !== undefined) {
          if (x.inc.includes('%')) continue;
          const key = low(x.inc).replace(/\\/g, '/'), k = key[0] === '/' ? key.slice(1) : path.posix.normalize(path.posix.join(dir, key));
          const r = load(k); if (!r) { note(incs, k, root); continue; }
          run(r, path.posix.dirname(k), depth + 1);
        } else if (x.call !== undefined) {
          if (x.call.includes('%')) continue;
          const l = low(x.call), d = defs.get(l);
          if (!d) { note(miss, l, root); if (!rootMiss.has(root)) rootMiss.set(root, { names: new Set(), defs }); rootMiss.get(root).names.add(l); continue; }
          if (seen.has(l)) continue; seen.add(l);
          if (!d.items) d.items = sdlScan(d.body);
          run(d.items, d.dir, depth + 1);
        }
      }
    };
    const r = load(root); if (r) run(r, path.posix.dirname(root), 0);
    done++;
  }
  // PORT-62: the tree holds the define in a file this caller's chain never includes
  let fixed = 0, stuck = 0;
  if (o.fix) {
    const index = new Map();
    for (const top of ['properties', 'entity']) walk(path.join(res, top), (k, p) => { if (!/\.(ext|inc)$/.test(k)) return; for (const x of sdlScan(fs.readFileSync(p).toString('latin1'))) if (x.def && !index.has(x.def)) index.set(x.def, x); });
    for (const [root, { names, defs }] of rootMiss) {
      const add = new Map(), todo = [...names];
      while (todo.length) {
        const n = todo.pop(); if (add.has(n) || defs.has(n)) continue;
        const x = index.get(n); if (!x) { stuck++; console.log(root + ': WARN_MACRO_NO_DEFINE ' + n); continue; }
        add.set(n, '(define "' + n + '"' + x.body + ')');
        for (const y of sdlScan(x.body)) if (y.call && !y.call.includes('%')) todo.push(low(y.call));
      }
      if (!add.size) continue;
      const p = path.join(res, root), b = fs.existsSync(p) ? fs.readFileSync(p) : v.m.get(root)();
      const buf = Buffer.concat([Buffer.from('; macros this chain lacks (portfix)\r\n' + [...add.values()].reverse().join('\r\n') + '\r\n', 'latin1'), b]);
      fixed++; fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf);
      if (o.also) { const q = path.join(o.also, root); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, buf); }
    }
    console.log(fixed + ' files fixed, ' + stuck + ' macros with no define');
  }
  v.close();
  const top = m => [...m].sort((a, b) => b[1].c - a[1].c);
  for (const [n, e] of top(miss)) console.log('WARN_MACRO_UNDEFINED ' + n + ' x' + e.c + ' ' + e.f[0] + (vdef.has(n) ? ' vanilla:' + vdef.get(n).slice(0, 2).join(',') : ' vanilla:none'));
  for (const [n, e] of top(incs).slice(0, 60)) console.log('WARN_INCLUDE_MISSING ' + n + ' x' + e.c + ' ' + e.f[0]);
  console.log(done + ' roots, ' + miss.size + ' undefined macros, ' + incs.size + ' missing includes');
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ miss: [...miss], incs: [...incs], vdef: [...vdef] }));
}

// vanprops: a vanilla entity on the mod's .ext is half of each game: its {Chassis {Locomotion needs vanilla's {Chassis "wheel"} (PORT-63).
// vanilla files the mod replaced go to /properties/as2van/<path> with their includes pointed there, and vanilla-only callers point at the copies
function cmdVanProps(o) {
  const res = resDir(o._[0]), v = vanilla(path.resolve(o.game)), DIR = 'properties/as2van/', SCOPE = /^(entity|properties)\/.*\.(def|ext|inc|mdl)$/;
  const INC = /(\(\s*include\s+"|\{\s*extension\s+")([^"]+)"/gi;
  const put = (rel, buf) => { if (o.dry) return; const p = path.join(res, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); if (o.also) { const q = path.join(o.also, rel); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, buf); } };
  const target = (ref, dir) => { const key = low(ref).replace(/\\/g, '/'); return key[0] === '/' ? key.slice(1) : path.posix.normalize(path.posix.join(dir, key)); };
  const text = new Map(), refs = new Map(), users = new Map();
  for (const [k, read] of v.m) {
    if (!SCOPE.test(k) || k.startsWith(DIR)) continue;
    const s = read().toString('latin1'); text.set(k, s);
    const dir = path.posix.dirname(k), list = [];
    for (const m of s.matchAll(INC)) if (!m[2].includes('%')) { const to = target(m[2], dir); list.push(to); if (!users.has(to)) users.set(to, []); users.get(to).push(k); }
    refs.set(k, list);
  }
  // the seed: same path, other bytes. then every vanilla file that reaches one
  const tainted = new Set(); let seeds = 0;
  for (const [k, s] of text) { if (/\.def$/.test(k)) continue; const p = path.join(res, k); if (fs.existsSync(p) && fs.readFileSync(p).toString('latin1') !== s) { tainted.add(k); seeds++; } }
  const todo = [...tainted], reach = new Set();
  while (todo.length) for (const u of users.get(todo.pop()) || []) if (!reach.has(u)) { reach.add(u); todo.push(u); if (!/\.def$/.test(u)) tainted.add(u); }
  const point = (s, dir, abs) => s.replace(INC, (all, head, ref) => {
    if (ref.includes('%')) return all;
    const to = target(ref, dir);
    if (tainted.has(to) && text.has(to)) return head + '/' + DIR + to + '"';
    return abs ? head + '/' + to + '"' : all;
  });
  let copies = 0, callers = 0, own = 0, kept = 0;
  for (const k of tainted) {
    const out = Buffer.from(point(text.get(k), path.posix.dirname(k), true), 'latin1'), p = path.join(res, DIR + k);
    if (fs.existsSync(p) && fs.readFileSync(p).equals(out)) { kept++; continue; }
    copies++; put(DIR + k, out);
  }
  for (const k of reach) {
    const p = path.join(res, k), had = fs.existsSync(p) ? fs.readFileSync(p).toString('latin1') : null;
    // a copy of ours can be rebuilt from vanilla; anything else at this path is the mod's own entity and stays
    // byte-equal to vanilla = a vanilla copy nobody authored (a droppatched one carries no as2_ marker): rebuilt like ours (PORT-123)
    if (had !== null && !had.includes('"as2_') && !had.includes('/' + DIR) && had !== text.get(k)) { own++; continue; }
    if (tainted.has(k) && had !== null && !had.includes('/' + DIR) && /\.(ext|inc)$/.test(k)) { own++; continue; }
    const out = point(text.get(k), path.posix.dirname(k), false); if (out === had) continue;
    callers++; put(k, Buffer.from(out, 'latin1'));
  }
  v.close();
  console.log(seeds + ' replaced files, ' + tainted.size + ' with what reaches them, ' + copies + ' copies written, ' + kept + ' already there, ' + callers + ' caller files, ' + own + ' mod files left alone' + (o.dry ? ' (dry)' : ''));
}

// extenders: {Extender "x" ...} the engine has no class for: fatal Extender not found (PORT-64)
// the names the game knows, listed 2026-11-08.
// --engine <as64 src root> reads them again and prints WARN_EXTENDER_LIST_DRIFT for names the list lacks (test/run.sh checks this repo's src)
const ENGINE_EXTENDERS = 'shield vitality bone_rotator cannon enumerator light preview railway grass land land_patch land_patch_height map_point spawn_point mine speaker timer vision_mode smokescreen edifice inventory chassis_manager talk'.split(' ');
let srcExtenders = null; try { srcExtenders = require('./srcnames').srcExtenders; } catch (e) { srcExtenders = null; }   // optional side file
function cmdExtenders(o) {
  const res = resDir(o._[0]), v = vanilla(path.resolve(o.game)), known = new Set(ENGINE_EXTENDERS), RX = /\{\s*extender\s+"?([\w\-]+)"?/gi;
  if (o.engine && !srcExtenders) console.log('--engine: not part of this release; the built-in list is used');
  if (o.engine && srcExtenders) { const s = srcExtenders(path.resolve(o.engine)); for (const n of s) { if (!known.has(n)) console.log('WARN_EXTENDER_LIST_DRIFT ' + n + ': registered in src, not in ENGINE_EXTENDERS'); known.add(n); } for (const n of ENGINE_EXTENDERS) if (!s.has(n)) console.log('WARN_EXTENDER_LIST_DRIFT ' + n + ': in ENGINE_EXTENDERS, not found in src'); }
  for (const [k, read] of v.m) if (/^(entity|properties)\/.*\.(def|ext|inc|mdl)$/.test(k)) for (const m of read().toString('latin1').matchAll(RX)) known.add(low(m[1]));
  v.close();
  const close = (s, from) => { let d = 0; for (let j = from; j < s.length; j++) { const c = s[j]; if (c === '"') { j++; while (j < s.length && s[j] !== '"') j++; } else if (c === ';') { while (j < s.length && s[j] !== '\n') j++; } else if (c === '{') d++; else if (c === '}' && --d === 0) return j; } return -1; };
  const seen = new Map(); let files = 0;
  for (const top of ['entity', 'properties']) walk(path.join(res, top), (k, p) => {
    const rel = top + '/' + k; if (!/\.(def|ext|inc|mdl)$/.test(k) || rel.startsWith('properties/as2van/')) return;
    let s = fs.readFileSync(p).toString('latin1'), out = '', at = 0, hit = false;
    for (const m of s.matchAll(RX)) {
      if (m.index < at) continue; const n = low(m[1]); if (known.has(n)) continue;
      const end = close(s, m.index); if (end < 0) { console.log(rel + ': WARN_EXTENDER_UNCLOSED ' + n); continue; }
      out += s.slice(at, m.index); at = end + 1; hit = true; seen.set(n, (seen.get(n) || 0) + 1);
    }
    if (!hit) return; files++; if (o.dry) return;
    const buf = Buffer.from(out + s.slice(at), 'latin1'); fs.writeFileSync(p, buf);
    if (o.also) { const q = path.join(o.also, rel); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, buf); }
  });
  for (const [n, c] of [...seen].sort((a, b) => b[1] - a[1])) console.log('WARN_EXTENDER_UNKNOWN ' + n + ' x' + c);
  console.log(files + ' files, ' + seen.size + ' unknown extenders' + (o.dry ? ' (dry)' : ''));
}
// ebmframes: an .ebm naming an image that no layer holds: fatal File not found when the texture first draws (PORT-65)
function cmdEbm(o) {
  const res = resDir(o._[0]), v = vanilla(path.resolve(o.game)); const src = o.src ? pakset.open(path.resolve(o.src), null) : null;
  const sm = new Map(); if (src) for (const e of src.entries) sm.set(low(e.key).replace(/\\/g, '/'), e);
  const mine = new Map(); walk(res, (k, p) => mine.set(low(k).replace(/\\/g, '/'), p));
  const has = k => mine.has(k) || sm.has(k) || v.m.has(k);
  const framesOf = s => [...s.replace(/;[^\n]*/g, '').matchAll(/\{\s*frame\s+"([^"]+)"/gi)].map(m => m[1]);
  const lacks = (s, k) => framesOf(s).filter(r => { const x = low(r).replace(/\\/g, '/'); if (x[0] === '$') return false; const t = x[0] === '/' ? x.slice(1) : path.posix.join(path.posix.dirname(k), x); return !has(t); });
  let n = 0, fixed = 0, stuck = 0, substN = 0, substF = 0;
  for (const k of new Set([...mine.keys(), ...sm.keys()])) {
    if (!k.endsWith('.ebm')) continue; n++;
    const s = mine.has(k) ? fs.readFileSync(mine.get(k)).toString('latin1') : pakset.read(sm.get(k)).toString('latin1');
    // "$/" frames: no resource-name expander for "$/" in game/ (only the editor's substitute root and a mission's text path); AS2 vanilla has none [V scan] -> reported, not touched (PORT-125, [T] place a unit that draws it)
    const sub = framesOf(s).filter(r => r[0] === '$'); if (sub.length) { substN += sub.length; substF++; if (!o.q) console.log(k + ': WARN_EBM_FRAME_SUBST ' + sub.length + ' frames start with $/, root not resolved'); }
    const l = lacks(s, k); if (!l.length) continue;
    const vs = v.m.has(k) ? v.m.get(k)().toString('latin1') : null;
    if (vs === null || lacks(vs, k).length) { stuck++; console.log(k + ': WARN_EBM_FRAME_MISSING ' + l.join(',')); continue; }
    fixed++; console.log(k + ': vanilla copy, lacked ' + l.join(','));
    if (o.dry) continue; const b = Buffer.from(vs, 'latin1'), p = path.join(res, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b);
    if (o.also) { const q = path.join(o.also, k); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, b); }
  }
  if (src) src.close(); v.close();
  console.log(n + ' ebm, ' + fixed + ' replaced by vanilla, ' + stuck + ' with no fix, ' + substN + ' $/ frames in ' + substF + ' ebm not checked' + (o.dry ? ' (dry)' : ''));
}

// minworkers: GoH {gunner|charger|workers "x" minWorkers N}: no such keyword, fatal Block terminator expected (PORT-66)
function cmdMinWorkers(o) {
  const res = resDir(o._[0]), RX = /[ \t]*\bminworkers\b[ \t]*[-+]?\d*\.?\d*/gi; let files = 0, sites = 0;
  for (const top of ['entity', 'properties']) walk(path.join(res, top), (k, p) => {
    const rel = top + '/' + k; if (!/\.(def|ext|inc|mdl)$/.test(k) || rel.startsWith('properties/as2van/')) return;
    const s = fs.readFileSync(p).toString('latin1'); let n = 0;
    const r = s.split('\n').map(l => { const c = l.indexOf(';'), a = c < 0 ? l : l.slice(0, c), b = c < 0 ? '' : l.slice(c); return a.replace(RX, () => { n++; return ''; }) + b; }).join('\n');
    if (!n) return; files++; sites += n; if (o.dry) return;
    const buf = Buffer.from(r, 'latin1'); fs.writeFileSync(p, buf);
    if (o.also) { const q = path.join(o.also, rel); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, buf); }
  });
  console.log(files + ' files, ' + sites + ' minWorkers dropped' + (o.dry ? ' (dry)' : ''));
}
// shapes: report only. parent/key blocks whose inline tokens vanilla never has: bare words, or more tokens. crash candidates, many are harmless variadics (PORT-66)
function shapeTokens(s) {
  const o = []; let i = 0; const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === ';') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c <= ' ') { i++; continue; }
    if (c === '"') { let j = i + 1; while (j < n && s[j] !== '"') j++; o.push('S'); i = j + 1; continue; }
    if (c === '{' || c === '}') { o.push(c); i++; continue; }
    if (c === '(') { let d = 1, j = i + 1, q = false; for (; j < n && d; j++) { if (s[j] === '"') q = !q; else if (!q) { if (s[j] === '(') d++; else if (s[j] === ')') d--; } } i = j; continue; }
    if (c === ')') { i++; continue; }
    let j = i; while (j < n && s[j] > ' ' && !'{}();"'.includes(s[j])) j++;
    const w = s.slice(i, j); i = j;
    o.push(/^[-+]?(\d|\.\d)/.test(w) ? 'N' : /[%$<>#]/.test(w) ? 'A' : 'w:' + low(w));
  }
  return o;
}
function shapeScan(s, m, rel) {
  const t = shapeTokens(s), st = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '}') { st.pop(); continue; } if (t[i] !== '{') continue;
    const k = t[i + 1]; if (!k || !k.startsWith('w:')) { st.push('?'); continue; }
    const key = k.slice(2), pair = (st.length ? st[st.length - 1] : '') + '/' + key, sh = [];
    for (let j = i + 2; j < t.length && t[j] !== '{' && t[j] !== '}'; j++) sh.push(t[j]);
    let v = m.get(pair); if (!v) m.set(pair, v = { n: 0, words: new Map(), max: 0, any: false, ex: rel }); v.n++;
    if (sh.length > v.max) { v.max = sh.length; v.ex = rel; }
    for (const x of sh) if (x === 'A') v.any = true; else if (x.startsWith('w:')) { const w = v.words.get(x.slice(2)) || { n: 0, ex: rel }; w.n++; v.words.set(x.slice(2), w); }
    st.push(key); i++;
  }
}
function cmdShapes(o) {
  const res = resDir(o._[0]), v = vanilla(path.resolve(o.game)), M = new Map(), V = new Map(), RE = /\.(def|ext|inc|mdl)$/;
  for (const [k, read] of v.m) if (/^(entity|properties)\//.test(k) && RE.test(k)) shapeScan(read().toString('latin1'), V, k);
  v.close();
  for (const top of ['entity', 'properties']) walk(path.join(res, top), (k, p) => { const rel = top + '/' + k; if (RE.test(k) && !rel.startsWith('entity/fx/') && !rel.startsWith('properties/as2van/')) shapeScan(fs.readFileSync(p).toString('latin1'), M, rel); });
  const out = [];
  for (const [p, m] of M) { const x = V.get(p); if (!x && !p.startsWith('?/') && !/^#/.test(p)) { out.push({ kind: 'WARN_SHAPE_NEWPAIR', pair: p, n: m.n, ex: m.ex }); continue; } if (!x || x.any || x.words.size > 40) continue;
    for (const [w, c] of m.words) if (!x.words.has(w)) out.push({ kind: 'WARN_SHAPE_WORD', pair: p, word: w, n: c.n, ex: c.ex });
    if (m.max > x.max) out.push({ kind: 'WARN_SHAPE_LONGER', pair: p, vanilla: x.max, mod: m.max, n: m.n, ex: m.ex }); }
  out.sort((a, b) => b.n - a.n);
  for (const r of out) console.log(r.kind + ' ' + r.pair + (r.word ? ' ' + r.word : r.kind === 'WARN_SHAPE_NEWPAIR' ? '' : ' ' + r.vanilla + '>' + r.mod) + ' x' + r.n + ' ' + r.ex);
  if (o.json) fs.writeFileSync(path.resolve(o.json), JSON.stringify(out, null, 1));
  console.log(M.size + ' block kinds, ' + out.length + ' shape warnings');
}

// fxdup: a view holding twice what the engine takes once, fatal Multiply definition , Sprite was already defined (PORT-67)
const FXONE = { particleview: [['generator', 'entitygenerator'], ['mover'], ['visualizer']], spriteview: [['sprite']] };
function fxDupEdit(s) {
  // spans of later duplicates among direct children of each view; comments and strings skipped
  const cuts = [], stack = []; let q = false, c = false, seen = new Map();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (c) { if (ch === '\n') c = false; continue; }
    if (q) { if (ch === '"') q = false; continue; }
    if (ch === '"') { q = true; continue; } if (ch === ';') { c = true; continue; }
    if (ch === '{') {
      const m = s.slice(i + 1, i + 40).match(/^\s*([A-Za-z_]\w*)/), n = m ? low(m[1]) : '', top = stack[stack.length - 1];
      const fr = { at: i, name: n, groups: FXONE[n] ? new Set() : null, cut: false };
      if (top && top.groups) { const g = FXONE[top.name].find(x => x.includes(n)); if (g) { if (top.groups.has(g[0])) fr.cut = true; else top.groups.add(g[0]); } }
      stack.push(fr);
    } else if (ch === '}') { const fr = stack.pop(); if (fr && fr.cut) cuts.push([fr.at, i + 1, fr.name]); }
  }
  return cuts;
}
function cmdFxDup(o) {
  const res = resDir(o._[0]); let files = 0; const seen = new Map();
  for (const top of ['entity', 'properties']) walk(path.join(res, top), (k, p) => {
    const rel = top + '/' + k; if (!/\.(def|ext|inc)$/.test(k) || rel.startsWith('properties/as2van/')) return;
    const s = fs.readFileSync(p).toString('latin1'); if (!/view\b/i.test(s)) return;
    const cuts = fxDupEdit(s).sort((a, b) => a[0] - b[0]).filter((x, i, a) => !i || x[0] >= a[i - 1][1]); if (!cuts.length) return;
    files++; let out = '', at = 0; for (const [a, b, n] of cuts) { out += s.slice(at, a); at = b; seen.set(n, (seen.get(n) || 0) + 1); } out += s.slice(at);
    if (o.dry) return; const buf = Buffer.from(out, 'latin1'); fs.writeFileSync(p, buf);
    if (o.also) { const q = path.join(o.also, rel); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, buf); }
  });
  for (const [n, c] of seen) console.log('dropped ' + n + ' x' + c);
  console.log(files + ' files with a second generator, mover, visualizer or sprite' + (o.dry ? ' (dry)' : ''));
}

// locospeed: GoH {Locomotion {Slow|Normal|Fast x}}: those are read under {Speed}, unexpected token (PORT-68)
function locoEdit(s) {
  const RX = /\{\s*locomotion\b/gi; let out = '', at = 0, n = 0;
  for (const m of s.matchAll(RX)) {
    if (m.index < at) continue;
    let d = 0, q = false, c = false, end = -1, st = -1; const kids = [];
    for (let j = m.index; j < s.length; j++) { const ch = s[j];
      if (c) { if (ch === '\n') c = false; continue; } if (q) { if (ch === '"') q = false; continue; }
      if (ch === '"') { q = true; continue; } if (ch === ';') { c = true; continue; }
      if (ch === '{') { if (++d === 2) st = j; }
      else if (ch === '}') { if (d === 2) { const w = s.slice(st + 1, st + 12).match(/^\s*(slow|normal|fast)\b/i); if (w) kids.push([st, j + 1]); } if (--d === 0) { end = j; break; } } }
    if (end < 0 || !kids.length) continue;
    let body = '', p = m.index; const moved = [];
    for (const [a, b] of kids) { body += s.slice(p, a); moved.push(s.slice(a, b)); p = b; }
    body += s.slice(p, end + 1);
    out += s.slice(at, m.index) + body + '\r\n\t{Speed ' + moved.join(' ') + '}'; at = end + 1; n++;
  }
  return locoDefine(n ? out + s.slice(at) : s, n);
}
// the same keys in a (define "locomotion" ...) body: a macro used inside {Locomotion}. They go to the file's first {Chassis} block
function locoDefine(s, n) {
  const m = /\(define\s+"locomotion"/i.exec(s); if (!m) return n ? [s, n] : [s, 0];
  let d = 0, q = false, c = false, end = -1;
  for (let j = m.index; j < s.length; j++) { const ch = s[j];
    if (c) { if (ch === '\n') c = false; continue; } if (q) { if (ch === '"') q = false; continue; }
    if (ch === '"') { q = true; continue; } if (ch === ';') { c = true; continue; }
    if (ch === '(') d++; else if (ch === ')' && --d === 0) { end = j; break; } }
  if (end < 0) return n ? [s, n] : [s, 0];
  const moved = [], body = s.slice(m.index, end).replace(/[ \t]*\{\s*(slow|normal|fast)\b[^{}]*\}[^\n]*\r?\n?/gi, x => { moved.push(x.slice(x.indexOf('{'), x.indexOf('}') + 1).replace(/\s+/g, ' ')); return ''; });
  if (!moved.length) return n ? [s, n] : [s, 0];
  let t = s.slice(0, m.index) + body + s.slice(end);
  const ch = /\{\s*chassis\b(\s+"[^"]*")?/i.exec(t);
  if (ch) t = t.slice(0, ch.index + ch[0].length) + '\r\n\t{Speed ' + moved.join(' ') + '}' + t.slice(ch.index + ch[0].length);
  return [t, n + 1];
}
// {DecalView} with no body has no sprite: reads a null material on spawn, . Comments do not count as a body
function decalEdit(s) {
  let n = 0;
  const r = s.replace(/[ \t]*\{\s*decalview\b((?:\s|;[^\n]*|\/\/[^\n]*)*)\}[ \t]*(\r?\n)?/gi, () => { n++; return ''; });
  return [r, n];
}
function cmdDecalEmpty(o) {
  const res = resDir(o._[0]); let files = 0, sites = 0;
  for (const top of ['entity', 'properties']) walk(path.join(res, top), (k, q) => {
    const rel = top + '/' + k; if (!/\.(def|ext|inc|mdl)$/.test(k) || rel.startsWith('properties/as2van/')) return;
    const b = fs.readFileSync(q).toString('latin1'); if (!/decalview/i.test(b)) return;
    const [r, n] = decalEdit(b); if (!n) return; files++; sites += n; if (o.dry) return;
    const buf = Buffer.from(r, 'latin1'); fs.writeFileSync(q, buf);
    if (o.also) { const t = path.join(o.also, rel); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, buf); }
  });
  console.log(files + ' files, ' + sites + ' empty DecalView blocks dropped' + (o.dry ? ' (dry)' : ''));
}
// fillcycle: a stuff whose filling matches itself, endless recursion in the game, stack overflow with no dump (PORT-83).
// tags = file name split on '.', first file read wins, so a weapon in ammo/ can shadow the true bullet of the same name: then the bullet replaces it. Else the filling goes.
const fillNoComment = s => s.split(/\r?\n/).map(l => { let q = false; for (let i = 0; i < l.length; i++) { if (l[i] === '"') q = !q; else if (l[i] === ';' && !q) return l.slice(0, i); } return l; }).join('\n');
function cmdFillCycle(o) {
  const res = resDir(o._[0]), root = path.join(res, 'set/stuff'), all = [];
  walk(root, (k, q) => { if (!/\.(fsm|presets)$/i.test(k)) all.push([k.replace(/\\/g, '/'), q]); });
  all.sort((a, b) => a[0] < b[0] ? -1 : 1);
  const bySig = new Map();
  for (const [k, q] of all) {
    const tags = low(k.slice(k.lastIndexOf('/') + 1)).split('.').filter(Boolean), sig = [...tags].sort().join(' ');
    const m = /\{\s*filling\s+"([^"]*)"/i.exec(fillNoComment(fs.readFileSync(q).toString('latin1')));
    const it = { k, q, tags, fill: m ? low(m[1]).split(/\s+/).filter(Boolean) : null };
    if (bySig.has(sig)) bySig.get(sig).push(it); else bySig.set(sig, [it]);
  }
  let swapped = 0, dropped = 0;
  const put = (it, buf) => { if (o.dry) return; fs.writeFileSync(it.q, buf); if (o.also) { const t = path.join(o.also, 'set/stuff', it.k); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, buf); } };
  for (const list of bySig.values()) {
    const w = list[0]; if (!w.fill || !w.fill.every(t => w.tags.includes(t))) continue;
    const alt = list.find(x => !x.fill);
    if (alt) { swapped++; console.log('swap ' + w.k + ' <- ' + alt.k); put(w, fs.readFileSync(alt.q)); continue; }
    const s = fs.readFileSync(w.q).toString('latin1'), r = s.replace(/[ \t]*\{\s*filling\s+"[^"]*"[^{}]*\}[ \t]*(\r?\n)?/i, '');
    dropped++; console.log('drop filling ' + w.k); put(w, Buffer.from(r, 'latin1'));
  }
  console.log(swapped + ' shadowing files replaced, ' + dropped + ' self fillings dropped' + (o.dry ? ' (dry)' : '') + '. Longer loops: refcheck REF_FILLING_CYCLE');
}
function cmdLocoSpeed(o) {
  const res = resDir(o._[0]); let files = 0, sites = 0;
  for (const top of ['entity', 'properties']) walk(path.join(res, top), (k, p) => {
    const rel = top + '/' + k; if (!/\.(def|ext|inc|mdl)$/.test(k) || rel.startsWith('properties/as2van/')) return;
    const s = fs.readFileSync(p).toString('latin1'); if (!/locomotion/i.test(s)) return;
    const [r, n] = locoEdit(s); if (!n) return; files++; sites += n; if (o.dry) return;
    const buf = Buffer.from(r, 'latin1'); fs.writeFileSync(p, buf);
    if (o.also) { const q = path.join(o.also, rel); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, buf); }
  });
  console.log(files + ' files, ' + sites + ' Locomotion blocks split' + (o.dry ? ' (dry)' : ''));
}

// panelterms: condition terms the command panel does not know, fatal Unknown condition term (PORT-69)
const PANEL_TERMS = new Set(['vehicle', 'tank', 'cannon', 'tractor', 'human', 'single', 'multiple', 'commander', 'disabled']);
const PANEL_MAP = { engine: 'vehicle', hatch: 'vehicle', medic: 'human' };
function panelTermsEdit(s, seen) {
  return s.replace(/(\{\s*condition\s+)"([^"]*)"/gi, (all, head, body) => {
    const out = [];
    for (const w of body.split(/\s+/).filter(Boolean)) {
      const l = low(w), m = PANEL_TERMS.has(l) ? l : PANEL_MAP[l];
      if (m !== l) seen.set(l, (seen.get(l) || 0) + 1);
      if (m && !out.includes(m)) out.push(m);
    }
    return head + '"' + out.join(' ') + '"';
  });
}
function cmdPanelTerms(o) {
  const res = resDir(o._[0]), seen = new Map(); let files = 0; const top = 'set/panel_control';
  walk(path.join(res, top), (k, p) => {
    const s = fs.readFileSync(p).toString('latin1'), before = seen.size, n0 = [...seen.values()].reduce((a, b) => a + b, 0);
    const r = panelTermsEdit(s, seen), n1 = [...seen.values()].reduce((a, b) => a + b, 0);
    if (n1 === n0 && seen.size === before) return; files++; if (o.dry) return;
    const buf = Buffer.from(r, 'latin1'); fs.writeFileSync(p, buf);
    if (o.also) { const q = path.join(o.also, top, k); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, buf); }
  });
  for (const [w, c] of seen) console.log((PANEL_MAP[w] ? 'mapped ' + w + ' to ' + PANEL_MAP[w] : 'dropped ' + w) + ' x' + c);
  console.log(files + ' panel files changed' + (o.dry ? ' (dry)' : ''));
}

// PORT-24: material keys no as64 reader has are fatal "unexpected token". translucency, glow, emitsheat are material's own, environment is water's
const MTL_DROP = /\{\s*(lightmap|full_specular|specular_intensity|gloss_scale|mask)\b/ig;
function dropMtlKeys(s, seen) {
  const m = s.match(/\{\s*material\s+"?([^"\s{}]+)/i), type = m ? low(m[1]) : '';
  const cuts = [];
  for (const h of s.matchAll(MTL_DROP)) {
    const key = low(h[1]); if (key === 'mask' && type === 'envmap') continue;
    if (s.slice(s.lastIndexOf('\n', h.index) + 1, h.index).includes(';')) continue;
    if (cuts.length && h.index < cuts[cuts.length - 1][1]) continue;
    let d = 0, i = h.index, q = false;
    for (; i < s.length; i++) { const c = s[i]; if (c === '"') q = !q; else if (!q && c === '{') d++; else if (!q && c === '}' && --d === 0) break; }
    if (i >= s.length) continue;
    let a = h.index, b = i + 1;
    const ls = s.lastIndexOf('\n', a) + 1, re = s.slice(b).match(/^[ \t]*\r?\n/);
    if (!s.slice(ls, a).trim() && re) { a = ls; b += re[0].length; }
    cuts.push([a, b]); seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const [a, b] of cuts.reverse()) s = s.slice(0, a) + s.slice(b);
  return s;
}
// PORT-74: sequence/events has no reader (unexpected token); obstacle/obstacleID is known but unread there, so its string hits "Block terminator expected!"
const MDL_DROP = /\{\s*(events|obstacleid)\b/ig;
function dropMdlKeys(s, seen) {
  const cuts = [];
  for (const h of s.matchAll(MDL_DROP)) {
    if (s.slice(s.lastIndexOf('\n', h.index) + 1, h.index).includes(';')) continue;
    if (cuts.length && h.index < cuts[cuts.length - 1][1]) continue;
    let d = 0, i = h.index, q = false;
    for (; i < s.length; i++) { const c = s[i]; if (c === '"') q = !q; else if (!q && c === '{') d++; else if (!q && c === '}' && --d === 0) break; }
    if (i >= s.length) continue;
    let x = h.index, y = i + 1;
    const ls = s.lastIndexOf('\n', x) + 1, re = s.slice(y).match(/^[ \t]*\r?\n/);
    if (!s.slice(ls, x).trim() && re) { x = ls; y += re[0].length; }
    cuts.push([x, y]); const key = low(h[1]); seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const [x, y] of cuts.reverse()) s = s.slice(0, x) + s.slice(y);
  return s;
}
function fixKind(o, name, ext, fix) {
  if (!o.src) { console.error(name + ' needs --src <root holding the paks>'); process.exit(2); }
  const out = resDir(o._[0]), src = resDir(o.src), real = d => { try { return low(fs.realpathSync(d)); } catch { return low(path.resolve(d)); } };
  const rs = real(src) + path.sep; if ((real(out) + path.sep).startsWith(rs)) { console.error(name + ': output is inside the source'); process.exit(2); }
  const ps = pakset.open(src, { ext: new Set([ext]) }), m = new Map();
  for (const e of ps.entries) m.set(e.key.toLowerCase().replace(/\\/g, '/'), () => pakset.read(e));
  walk(src, (k, p) => { if (k.toLowerCase().endsWith(ext)) m.set(k, () => fs.readFileSync(p)); });
  const seen = new Map(); let files = 0;
  for (const [k, read] of m) {
    const b = read().toString('latin1'), r = fix(b, seen); if (r === b) continue; files++; if (o.dry) continue;
    const buf = Buffer.from(r, 'latin1');
    for (const d of [out].concat(o.also ? [o.also] : [])) { const q = path.join(d, k); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, buf); }
  }
  ps.close();
  for (const [w, c] of seen) console.log('dropped ' + w + ' x' + c);
  console.log(files + ' of ' + m.size + ' ' + ext.slice(1) + ' files changed' + (o.dry ? ' (dry)' : ''));
}
const cmdMtlKeys = o => fixKind(o, 'mtlkeys', '.mtl', dropMtlKeys);
const cmdMdlKeys = o => fixKind(o, 'mdlkeys', '.mdl', dropMdlKeys);
// walks blocks with their head key: {#+ lightview} and {#+lightview} are live with key lightview, {##x} is skipped by the reader so stays
function dropViewKeys(s, seen) {
  if (!/timetolive|spin[xyz]|align/i.test(s)) return s;
  const cuts = [], st = []; let i = 0, expect = false, at = 0; const n = s.length;
  const open = k => { st.push({ k, at }); expect = false; };
  while (i < n) {
    const c = s[i];
    if (c === ';') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '"') { const e = s.indexOf('"', i + 1), stop = e < 0 ? n : e + 1; if (expect) open(''); i = stop; continue; }
    if (c === '{') {
      if (expect) open('');
      if (s[i + 1] === '#' && s[i + 2] === '#') { // dead block, leave its bytes
        let d = 0, j = i, q = false;
        for (; j < n; j++) { const x = s[j]; if (x === '"') q = !q; else if (!q && x === '{') d++; else if (!q && x === '}' && --d === 0) break; }
        i = j + 1; continue;
      }
      at = i; expect = true; i++; continue;
    }
    if (c === '}') {
      if (expect) open('');
      const b = st.pop();
      if (b) {
        const par = st[st.length - 1], gp = st[st.length - 2];
        const hit = (b.k === 'timetolive' && par && par.k === 'lightview') ||
          (/^(spinx|spiny|spinz|align)$/.test(b.k) && par && par.k === 'entity' && gp && gp.k === 'entitygenerator');
        if (hit) {
          let x = b.at, y = i + 1; const ls = s.lastIndexOf('\n', x) + 1, re = s.slice(y, y + 200).match(/^[ \t]*\r?\n/);
          if (!s.slice(ls, x).trim() && re) { x = ls; y += re[0].length; }
          cuts.push([x, y]); seen.set(b.k, (seen.get(b.k) || 0) + 1);
        }
      }
      i++; continue;
    }
    if (' \t\r\n'.includes(c)) { i++; continue; }
    let e = i; while (e < n && !' \t\r\n{}";'.includes(s[e])) e++;
    if (expect) { const tok = s.slice(i, e).toLowerCase(); if (tok === '#+' || tok === '+' || tok === '#') { i = e; continue; } open(tok.replace(/^#\+?/, '').replace(/^\+/, '')); }
    i = e;
  }
  for (const [x, y] of cuts.sort((u, v) => v[0] - u[0])) s = s.slice(0, x) + s.slice(y);
  return s;
}
const cmdViewKeys = o => { for (const ext of ['.def', '.ext', '.inc']) fixKind(o, 'viewkeys', ext, dropViewKeys); };
// supply zone item: as64 requires {max N} after the count, value optional. GoH writes only {value N} so the
// reader opens {value as if it were {max and stops with Block terminator expected. Max = count x 4 [I]: AS2 tables run 3 to 6 times the count.
function addResupplyMax(s, seen) {
  return s.replace(/(\{\s*item\s+(?:"[^"]*"\s*)+)([%\w.]+)(\s*)(\{\s*value\b)/ig, (w, a, n, sp, v) => {
    const c = /^\d+$/.test(n) ? +n : 25; seen.set('{max} added', (seen.get('{max} added') || 0) + 1);
    return a + n + (sp || ' ') + '{max ' + Math.max(1, c * 4) + '} ' + v;
  });
}
const cmdResupply = o => { for (const ext of ['.def', '.ext', '.inc', '.set']) fixKind(o, 'resupply', ext, addResupplyMax); };
// bone modifier on a bone the model lacks: as64 warns then leaves the body unread, so any body is fatal.
// Checks each entity's model through its includes. A block in a shared include goes only when every user lacks the bone; the rest are listed.
function boneBlocks(s) { // {bone "name" ...} blocks not nested in another bone or a skeleton
  const out = [], st = []; let i = 0; const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === ';') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '"') { const e = s.indexOf('"', i + 1); i = e < 0 ? n : e + 1; continue; }
    if (c === '{') {
      if (s[i + 1] === '#' && s[i + 2] === '#') { let d = 0, j = i, q = false; for (; j < n; j++) { const x = s[j]; if (x === '"') q = !q; else if (!q && x === '{') d++; else if (!q && x === '}' && --d === 0) break; } i = j + 1; continue; }
      const m = /^\{\s*([A-Za-z_]\w*)\s*(?:"([^"]*)")?/.exec(s.slice(i, i + 200));
      st.push({ k: m ? m[1].toLowerCase() : '', name: m && m[2], at: i }); i++; continue;
    }
    if (c === '}') {
      const b = st.pop();
      if (b && b.k === 'bone' && b.name && !b.name.includes('%') && !st.some(x => x.k === 'bone' || x.k === 'skeleton')) out.push({ name: b.name, at: b.at, end: i + 1, empty: !s.slice(b.at + 1, i).includes('{') });
      i++; continue;
    }
    i++;
  }
  return out;
}
// (define "name" ...) spans of a file by paren matching: a bone block inside one only applies to entities that call the macro (PORT-138)
function defineSpans(s) {
  const out = [], st = []; let i = 0; const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === ';') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '"') { const e = s.indexOf('"', i + 1); i = e < 0 ? n : e + 1; continue; }
    if (c === '(') { const m = /^\(\s*define\s+"?([^"\s()]+)"?/i.exec(s.slice(i, i + 200)); st.push({ name: m && m[1].toLowerCase(), at: i }); }
    else if (c === ')') { const b = st.pop(); if (b && b.name && !st.some(x => x.name)) out.push({ name: b.name, at: b.at, end: i + 1 }); }
    i++;
  }
  return out;
}
const mdlBones = s => { const r = new Set(); for (const m of s.matchAll(/\{\s*bone\s+(?:[A-Za-z_]\w*\s+)*"([^"]+)"/ig)) r.add(m[1].toLowerCase()); return r; };
function cmdBones(o) {
  if (!o.src) { console.error('bones needs --src <root>'); process.exit(2); }
  const out = resDir(o._[0]), src = resDir(o.src), files = new Map();
  walk(src, (k, p) => { const e = path.extname(k).toLowerCase(); if (['.def', '.ext', '.inc', '.mdl'].includes(e)) files.set(k.toLowerCase().replace(/\\/g, '/'), p); });
  const text = new Map(), read = k => { if (text.has(k)) return text.get(k); const p = files.get(k), s = p ? fs.readFileSync(p, 'latin1') : null; text.set(k, s); return s; };
  const rel = (from, x) => { const q = x.replace(/\\/g, '/').toLowerCase(); return q[0] === '/' ? q.slice(1) : path.posix.normalize(path.posix.dirname(from) + '/' + q); };
  const closure = k0 => { const seen = new Set([k0]), todo = [k0]; while (todo.length) { const k = todo.pop(), s = read(k); if (!s) continue; for (const m of s.matchAll(/\(\s*include\s+"([^"]+)"/ig)) { const q = rel(k, m[1]); if (!seen.has(q) && files.has(q)) { seen.add(q); todo.push(q); } } } return seen; };
  const users = new Map(), defBones = new Map(); let noModel = 0, defs = 0, opaque = 0; // file -> list of bone sets, one per entity
  for (const k of files.keys()) {
    if (!k.endsWith('.def')) continue;
    const inc = closure(k); let any = false; for (const f of inc) if (/\{\s*bone\s/i.test(read(f) || '')) { any = true; break; }
    if (!any) continue;
    defs++;
    let bones = null;
    for (const f of inc) { const s = read(f); if (!s) continue; for (const m of s.matchAll(/\{\s*extension\s+"([^"]+\.mdl)"/ig)) { const q = rel(f, m[1]), t = read(q); if (t === null) continue; if (/\(\s*include|\{\s*skeleton\s+"/i.test(t)) { opaque++; continue; } bones = bones || new Set(); for (const b of mdlBones(t)) bones.add(b); } }
    if (!bones) { noModel++; continue; }
    defBones.set(k, { bones, inc });
    for (const f of inc) (users.get(f) || users.set(f, []).get(f)).push(bones);
  }
  let cut = 0, changed = 0, partial = new Map(), emptyKept = 0;
  const edited = new Map(), macroBones = new Map(); // macro name -> {f, names}: bone blocks inside a define apply only to its callers
  for (const [f, sets] of users) {
    const s = read(f), blocks = boneBlocks(s), cuts = [], spans = defineSpans(s);
    for (const b of blocks) {
      const sp = spans.find(x => b.at > x.at && b.end <= x.end);
      if (sp && !b.empty) { const m = macroBones.get(sp.name) || macroBones.set(sp.name, { f, names: [] }).get(sp.name); m.names.push(b.name.toLowerCase()); }
      const nm = b.name.toLowerCase(), miss = sets.filter(x => !x.has(nm)).length;
      if (!miss) continue;
      if (b.empty) { emptyKept++; continue; }
      if (miss < sets.length && sp) continue; // decided per call below
      if (miss < sets.length) { partial.set(f + ' ' + b.name, miss + '/' + sets.length); continue; }
      cuts.push(b); cut++;
    }
    if (!cuts.length) continue;
    changed++;
    let r = s;
    for (const b of cuts.reverse()) { let x = b.at, y = b.end; const ls = r.lastIndexOf('\n', x) + 1, re = r.slice(y, y + 200).match(/^[ \t]*\r?\n/); if (!r.slice(ls, x).trim() && re) { x = ls; y += re[0].length; } r = r.slice(0, x) + r.slice(y); }
    edited.set(f, r);
    if (o.dry) continue;
    for (const d of [out].concat(o.also ? [o.also] : [])) { const q = path.join(d, f); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, Buffer.from(r, 'latin1')); }
  }
  // call sites: ("macro") in an entity whose model lacks every bone the macro modifies is dropped; some missing is listed
  let callCut = 0, callFiles = 0;
  for (const [k, { bones, inc }] of defBones) {
    let r = edited.has(k) ? edited.get(k) : read(k), ch = false;
    for (const [name, m] of macroBones) {
      if (!inc.has(m.f)) continue;
      const miss = m.names.filter(b => !bones.has(b));
      if (!miss.length) continue;
      const rx = new RegExp('[ \\t]*\\(\\s*"?' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"?\\s*\\)[ \\t]*(\\r?\\n)?', 'ig');
      if (!rx.test(r)) continue;
      if (miss.length < m.names.length) { partial.set(k + ' call ' + name, miss.length + '/' + m.names.length + ' bones'); continue; }
      r = r.replace(rx, ''); callCut++; ch = true;
    }
    if (!ch) continue;
    callFiles++;
    if (o.dry) continue;
    for (const d of [out].concat(o.also ? [o.also] : [])) { const q = path.join(d, k); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, Buffer.from(r, 'latin1')); }
  }
  console.log('dropped ' + callCut + ' macro calls in ' + callFiles + ' entity files (model lacks every bone the macro modifies)' + (o.dry ? ' (dry)' : ''));
  console.log(defs + ' entities with bone modifiers, ' + noModel + ' with no model found, ' + opaque + ' models skipped (include or external skeleton)');
  console.log('dropped ' + cut + ' blocks in ' + changed + ' files' + (o.dry ? ' (dry)' : '') + '; empty blocks left ' + emptyKept + ' (safe); partly missing in shared includes ' + partial.size);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify([...partial.entries()], null, 1));
  for (const [w, c] of [...partial.entries()].slice(0, 25)) console.log('  partial ' + w + ' ' + c);
}
// top-level {"name" ...} blocks of {materials ...}: [name, start, end]
function matBlocks(s) {
  const out = []; let d = 0, q = false, c = false, st = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (c) { if (ch === '\n') c = false; continue; }
    if (q) { if (ch === '"') q = false; continue; }
    if (ch === ';') c = true; else if (ch === '"') q = true;
    else if (ch === '{') { if (++d === 2) st = i; }
    else if (ch === '}') { if (d-- === 2) { const n = /^\{\s*"([^"]*)"/.exec(s.slice(st, i + 1)); if (n) out.push([n[1].toLowerCase(), st, i + 1]); } }
  }
  return out;
}
function cmdVolMats(o) {
  if (!o.src) { console.error('volmats needs --src <root holding the paks>'); process.exit(2); }
  const one = root => { const lo = path.join(root, 'set/material.set'); if (fs.existsSync(lo)) return fs.readFileSync(lo, 'latin1'); const ps = pakset.open(root, { ext: new Set(['.set']) }), e = ps.entries.find(x => x.key.toLowerCase().replace(/\\/g, '/').endsWith('set/material.set')); const b = e ? pakset.read(e).toString('latin1') : null; ps.close(); return b; };
  const base = vanRoots(o.game).reverse().map(one).find(Boolean) || null, goh = one(o.src);
  if (!base || !goh) { console.error('volmats: set/material.set not found'); process.exit(2); }
  const have = new Set(matBlocks(base).map(b => b[0])), add = matBlocks(goh).filter(b => !have.has(b[0]));
  // {stage "a" {"b" 5} 1}: as64 reads a second string, not a block ( stage)
  const text = add.map(b => '\t' + goh.slice(b[1], b[2]).replace(/\{\s*("[^"]*")\s+[\d.]+\s*\}/g, '$1').replace(/\r?\n/g, '\r\n')).join('\r\n');
  const end = base.lastIndexOf('}');
  const r = base.slice(0, end) + text + '\r\n' + base.slice(end);
  console.log('added ' + add.map(b => b[0]).join(' ') + (o.dry ? ' (dry)' : ''));
  if (o.dry || !add.length) return;
  for (const d of [resDir(o._[0])].concat(o.also ? [o.also] : [])) { const q = path.join(d, 'set/material.set'); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, Buffer.from(r, 'latin1')); }
}

const [cmd, ...rest] = process.argv.slice(2), o = args(rest);
EXE = o.exe;
if (o.exe && !o.game) o.game = require('../lib/games').install(o.exe).dir || undefined;
if (!o._[0] || !o.game || !['keys', 'mergedefs', 'mergetables', 'carrystuff', 'anmdirs', 'macroclash', 'macrocheck', 'vanprops', 'extenders', 'ebmframes', 'minworkers', 'shapes', 'fxdup', 'locospeed', 'panelterms', 'mtlkeys', 'mdlkeys', 'volmats', 'viewkeys', 'resupply', 'bones', 'decalempty', 'fillcycle'].includes(cmd)) { console.error('usage: portfix keys <mod> --game G [--src dir] | portfix mergedefs|mergetables|carrystuff|anmdirs|macroclash|macrocheck|vanprops|extenders|ebmframes|minworkers|shapes|fxdup|locospeed|panelterms|volmats|viewkeys|resupply|bones|decalempty|fillcycle <mod> --game G [--exe as64|mowas_2] [--also dir] [--src dir] [--dry]'); process.exit(2); }
({ keys: cmdKeys, mergedefs: cmdMerge, mergetables: cmdTables, carrystuff: cmdCarry, anmdirs: cmdAnmDirs, macroclash: cmdClash, macrocheck: cmdMacroCheck, vanprops: cmdVanProps, extenders: cmdExtenders, ebmframes: cmdEbm, minworkers: cmdMinWorkers, shapes: cmdShapes, fxdup: cmdFxDup, locospeed: cmdLocoSpeed, panelterms: cmdPanelTerms, mtlkeys: cmdMtlKeys, mdlkeys: cmdMdlKeys, volmats: cmdVolMats, viewkeys: cmdViewKeys, resupply: cmdResupply, bones: cmdBones, decalempty: cmdDecalEmpty, fillcycle: cmdFillCycle })[cmd](o);
