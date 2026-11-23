// Bots part brain, server side: the AI settings of properties/human.ext (brain Properties, brain consts, Sensor) that the engine reads
// (catalog.json: key, place, range, reader, tag). Reads the mod's copy, else the game's through the vfs (bots lib.effective,
// read only); edits are surgical splices with the shared byte-exact SDL editor (tools/lib/sdlwrite): untouched bytes stay as they are,
// line ends (CRLF in AS2, LF in GoH) and cp1251 bytes kept. Write = the changed copy into the mod (the game file copied in first when the
// mod has none). Reset = the catalog keys back to the game's values; a copy that then matches the game byte for byte is removed.
// Guns: the weapon aiming keys are listed read only, where they sit in set/stuff (game through the vfs, then the mod's loose files).
// GoH: same file and forms (gohweb GHAI-02, GHAI-73..78, GHHUM-70); only the keys with a GoH reader row in the catalog are offered.
// Author: Imperator_Aug (ARSENAL, ia-7633194c)
'use strict';
const fs = require('fs'), path = require('path');
const lib = require('../../lib');
const SW = require('../../../../../lib/sdlwrite');
const CAT = require('./catalog.json');
const SI = require('./sight');

const REL = CAT.file, VKEY = 'resource/' + REL;
// errors carry a lang key and its slots (gui.js sends them; the page words them in its language, S6); msg = the English text
const bad = (msg, status, key, params) => Object.assign(new Error(msg), { status: status || 400, key: key ? 'bots.brain.e.' + key : undefined, params: params || {} });
const modPath = (mod, rel) => path.join(mod, 'resource', ...rel.split('/'));
const side = ctx => (lib.gameOf(ctx).kind === 'goh' ? 'goh' : 'as2');
// the catalog rows of the request's game, each with its reader info for that game
const itemsFor = ctx => { const s = side(ctx); return CAT.items.filter(it => it[s]).map(it => Object.assign({}, it, { info: it[s] })); };

// ---- locate a setting in a parsed file (sdlwrite tree). The last block of a name wins (the engine reads in order)
const last = a => (a && a.length ? a[a.length - 1] : null);
const unq = s => String(s || '').replace(/^"|"$/g, '');
function brainOf(t) { return last(SW.findAll(t, 'brain')); }
function containerOf(t, it) {
  if (it.where === 'sensor') return last(SW.findAll(t, 'sensor'));
  const b = brainOf(t);
  if (!b) return null;
  return it.where === 'prop' ? last(SW.findAll(b, 'properties')) : b;
}
function nodeOf(t, it) {
  const c = containerOf(t, it);
  if (!c) return null;
  if (it.where === 'const') return last(c.items.filter(k => k.type === 'block' && k.name === 'const' && k.items[1] && unq(k.items[1].text).toLowerCase() === it.key.toLowerCase()));
  return last(c.items.filter(k => k.type === 'block' && k.name === it.key.toLowerCase()));
}
const vIdx = it => (it.where === 'const' ? 2 : 1);
// the value as text: num -> '2', pair -> '40 40', switch -> 'on'|'off'; null = not in the file
function valueOf(node, it) {
  if (it.kind === 'switch') {
    if (!node) return 'off';
    const v = node.items[1];
    return !v || v.type === 'block' || !/^(0|off|false|no)$/i.test(unq(v.text)) ? 'on' : 'off';
  }
  if (!node) return null;
  const i = vIdx(it), a = node.items[i], b = node.items[i + 1];
  if (!a || a.type === 'block') return null;
  return it.kind === 'pair' ? unq(a.text) + (b && b.type !== 'block' ? ' ' + unq(b.text) : '') : unq(a.text);
}
const lineAt = (t, pos) => t.src.slice(0, pos).split('\n').length;

// ---- the effective file: the mod's copy, else the game's (latin1 text, bytes kept)
function readFile(ctx, mod) {
  const e = lib.effective(ctx, mod, REL);
  if (e.text == null) throw bad('Cannot read ' + REL + ': set the game folder in Settings, or put ' + REL + ' in your mod.', 404, 'noFile', { f: REL, noGame: !lib.gameOf(ctx).dir });
  return { from: e.from, cur: SW.parse(Buffer.from(e.text, 'latin1')), van: e.vanilla == null ? null : SW.parse(Buffer.from(e.vanilla, 'latin1')), vanBuf: e.vanilla == null ? null : Buffer.from(e.vanilla, 'latin1') };
}

function values(ctx, mod) {
  const f = readFile(ctx, mod), G = lib.gameOf(ctx);
  const rows = itemsFor(ctx).map(it => {
    const n = nodeOf(f.cur, it), sv = f.van ? valueOf(nodeOf(f.van, it), it) : null;
    return { id: it.id, card: it.card, key: it.key, where: it.where, kind: it.kind, min: it.min, max: it.max, step: it.step, unit: it.unit || '', def: it.def,
      stock: f.van ? sv : null, stockKnown: !!f.van, mod: valueOf(n, it), line: n ? lineAt(f.cur, n.start) : null, tag: it.info.tag, reader: it.info.reader, src: it.info.src };
  });
  const s = side(ctx);
  let sight; try { sight = SI.values(ctx, mod); } catch (e) { sight = { na: 'noFile' }; }
  return { file: REL, key: VKEY, from: f.from, game: G.id, kind: G.kind, rows, sight, leftOut: CAT.leftOut,
    notOffered: CAT.items.filter(it => !it[s]).map(it => it.id) };
}

// ---- checks: a number in the catalog range ('2', '0.25'), a pair of them, or a switch
function checkValue(it, v) {
  const s = String(v == null ? '' : v).trim(), rng = ' (allowed ' + it.min + ' to ' + it.max + (it.unit ? ' ' + it.unit : '') + ')';
  if (it.kind === 'switch') {
    if (/^(on|1|true|yes)$/i.test(s)) return 'on';
    if (/^(off|0|false|no)$/i.test(s)) return 'off';
    throw bad(it.key + ': use on or off.', 400, 'switch', { id: it.id });
  }
  const nums = s.split(/\s+/);
  if (nums.length !== (it.kind === 'pair' ? 2 : 1)) throw bad(it.key + ': ' + (it.kind === 'pair' ? 'two numbers separated by a space' : 'one number') + rng + '.', 400, it.kind === 'pair' ? 'pair' : 'num', { id: it.id, a: it.min, b: it.max, u: it.unit || '' });
  for (const x of nums) {
    if (!/^\d+(\.\d+)?$/.test(x) && !/^\.\d+$/.test(x)) throw bad(it.key + ': "' + x + '" is not a number' + rng + '.', 400, 'num', { id: it.id, a: it.min, b: it.max, u: it.unit || '' });
    if (Number(x) < it.min || Number(x) > it.max) throw bad(it.key + ': ' + x + ' is out of range' + rng + '.', 400, 'range', { id: it.id, v: x, a: it.min, b: it.max, u: it.unit || '' });
  }
  return nums.map(x => (x[0] === '.' ? '0' + x : x)).join(' ');
}
const same = (it, a, b) => {
  if (a == null || b == null) return a === b;
  if (it.kind === 'switch') return a === b;
  const x = String(a).split(/\s+/), y = String(b).split(/\s+/);
  return x.length === y.length && x.every((v, i) => Number(v) === Number(y[i]));
};
const lineText = (it, v) => (it.where === 'const' ? '{const "' + it.key + '" ' + v + '}' : '{' + it.key + ' ' + (it.kind === 'switch' ? '1' : v) + '}');
const indentOf = (t, node) => { let p = node.start; while (p > 0 && t.src[p - 1] !== '\n' && t.src[p - 1] !== '\r') p--; const m = /^[ \t]*/.exec(t.src.slice(p, node.start)); return m ? m[0] : ''; };

// apply [{it, now}] (now null = take the key out) to the parsed file t; van = the game's tree (a switch the game has stays, set to 0).
// Returns the new bytes. Missing keys go in at the end of their block; a missing Properties block is made after the brain's last line;
// a Properties block left empty by the removals goes too when the game has none
function apply(t, van, list) {
  const adds = { prop: [], sensor: [], const: [] }, removed = new Map();
  for (const { it, now } of list) {
    const node = nodeOf(t, it);
    if (now == null || (it.kind === 'switch' && now === 'off')) {
      if (!node) continue;
      if (now === 'off' && van && nodeOf(van, it)) { SW.setValue(node, '0', 1); continue; }
      const c = containerOf(t, it); if (!removed.has(c)) removed.set(c, []); removed.get(c).push(node);
      continue;
    }
    if (node) {
      if (it.kind === 'switch') {   // on: the game's own word when the game has the line on ({no_retreat on}), so a reset gives its bytes back
        const vn = van && nodeOf(van, it), w = vn && valueOf(vn, it) === 'on' && vn.items[1] && vn.items[1].type !== 'block' ? vn.items[1].text : '1';
        SW.setValue(node, w, 1); continue;
      }
      const vs = now.split(' ');
      vs.forEach((v, k) => SW.setValue(node, v, vIdx(it) + k));
      continue;
    }
    adds[it.where].push(lineText(it, now));
  }
  for (const [c, nodes] of removed) {
    const rest = c.items.slice(1).filter(k => nodes.indexOf(k) < 0);
    if (c.name === 'properties' && !rest.length && !(van && brainOf(van) && last(SW.findAll(brainOf(van), 'properties')))) SW.removeNode(c);
    else nodes.forEach(n => SW.removeNode(n));
  }
  const brain = brainOf(t);
  if ((adds.prop.length || adds.const.length) && !brain) throw bad('No {brain ...} block in ' + REL + ': it is not in the stock form, so nothing was changed.', 400, 'form', { f: REL });
  if (adds.sensor.length) {
    const s = last(SW.findAll(t, 'sensor'));
    if (!s) throw bad('No {Sensor ...} block in ' + REL + ': it is not in the stock form, so nothing was changed.', 400, 'form', { f: REL });
    adds.sensor.forEach(x => SW.insertChild(s, s.items.length, x));
  }
  adds.const.forEach(x => SW.insertChild(brain, brain.items.length, x));
  if (adds.prop.length) {
    const p = last(SW.findAll(brain, 'properties'));
    if (p) adds.prop.forEach(x => SW.insertChild(p, p.items.length, x));
    else {
      const ref = brain.items[brain.items.length - 1], ind = ref && ref !== brain.items[0] ? indentOf(t, ref) : '\t';
      SW.insertChild(brain, brain.items.length, '{Properties\n' + adds.prop.map(x => ind + '\t' + x).join('\n') + '\n' + ind + '}');
    }
  }
  return SW.serialize(t);
}

// changed lines, old and new (an LCS over lines; the file is small), as [{op:'-'|'+', n, text}]; at most 80
function diff(a, b) {
  const A = a.toString('latin1').split(/\r?\n|\r/), B = b.toString('latin1').split(/\r?\n|\r/);
  let p = 0; while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let s = 0; while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
  const x = A.slice(p, A.length - s), y = B.slice(p, B.length - s), n = x.length, m = y.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  const dec = s0 => { try { return new TextDecoder('windows-1251').decode(Buffer.from(s0, 'latin1')); } catch (e) { return s0; } };
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) { i++; j++; continue; }
    if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) { out.push({ op: '-', n: p + i + 1, text: dec(x[i]) }); i++; }
    else { out.push({ op: '+', n: p + j + 1, text: dec(y[j]) }); j++; }
  }
  return out.slice(0, 80);
}

// after a file of the mod is removed: its folders that are now empty go too (set/vision, properties, resource), never the mod folder
function pruneDirs(mod, p) {
  const top = path.resolve(mod);
  for (let d = path.dirname(path.resolve(p)); d.length > top.length && d.toLowerCase().startsWith(top.toLowerCase() + path.sep); d = path.dirname(d)) {
    try { if (fs.readdirSync(d).length) break; fs.rmdirSync(d); } catch (e) { break; }
  }
}
// files to write: [{rel, after (Buffer | null = remove)}] -> written into the mod; the bytes before kept by lib.undo (the frame's one Undo:
// POST /api/x/bots/undo with this list puts every file back, or none when one was changed since); returns [{rel, id}]
function writeAll(ctx, mod, outs) {
  lib.checkWrite(ctx, mod, outs.map(o => o.rel));
  const tickets = outs.map(o => lib.undo.save(ctx, mod, o.rel));
  for (const o of outs) {
    const p = modPath(mod, o.rel);
    if (o.after == null) { if (fs.existsSync(p)) { fs.unlinkSync(p); pruneDirs(mod, p); } continue; }
    fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, o.after);
  }
  return tickets.map(t => t.commit());
}

// {id: value} -> preview (write false) or write into the mod. human.ext ids and sight ids (sight.js) in one list; files = every file
// that changes, each with its line diff (diff = the human.ext one, as before); write -> undo [{rel, id}]
function edit(ctx, mod, changes, write) {
  const f = readFile(ctx, mod), its = new Map(itemsFor(ctx).map(it => [it.id, it])), list = [], sight = {};
  const sids = new Set(side(ctx) === 'as2' ? SI.ITEMS.map(x => x.id) : []);
  for (const id of Object.keys(changes || {})) {
    if (sids.has(id)) { sight[id] = changes[id]; continue; }
    const it = its.get(id);
    if (!it) throw bad('Unknown setting for this game: ' + id, 400, 'unknown', { id });
    const now = checkValue(it, changes[id]), was = valueOf(nodeOf(f.cur, it), it);
    if (!same(it, was, now)) list.push({ it, was, now });
  }
  const sp = SI.plan(ctx, mod, sight);
  const before = SW.serialize(f.cur), after = list.length ? apply(f.cur, f.van, list) : before;
  const target = modPath(mod, REL), files = [];
  if (list.length) files.push({ rel: REL, target, copiesWholeFile: f.from !== 'mod', diff: diff(before, after), after });
  for (const o of sp.out) files.push({ rel: o.rel, target: modPath(mod, o.rel), copiesWholeFile: o.from !== 'mod', diff: diff(Buffer.from(o.old, 'latin1'), Buffer.from(o.text, 'latin1')), after: Buffer.from(o.text, 'latin1') });
  const all = list.map(c => ({ id: c.it.id, key: c.it.key, was: c.was, now: c.now })).concat(sp.list);
  const res = { file: REL, target, copiesWholeFile: files.length ? files.some(x => x.copiesWholeFile) : f.from !== 'mod', written: false,
    changes: all, diff: list.length ? files[0].diff : [], files: files.map(x => ({ rel: x.rel, target: x.target, copiesWholeFile: x.copiesWholeFile, diff: x.diff })) };
  if (write && files.length) {
    res.undo = writeAll(ctx, mod, files.map(x => ({ rel: x.rel, after: x.after })));
    res.written = true;
  }
  return res;
}

// the listed keys (default: every key of this game) back to the game's values in the mod's copies. A copy that then equals the game's
// file byte for byte is removed. No copy in the mod: nothing to do. write -> undo [{rel, id}]
function reset(ctx, mod, ids, write) {
  const target = modPath(mod, REL), had = fs.existsSync(target);
  const want = ids && ids.length ? new Set(ids) : null, outs = [], list = [];
  let removed = false;
  if (had && itemsFor(ctx).some(it => !want || want.has(it.id))) {
    const f = readFile(ctx, mod);
    if (!f.van) throw bad('The game\'s ' + REL + ' cannot be read, so its values are not known: set the game folder in Settings.', 404, 'noGame', { f: REL, noGame: !lib.gameOf(ctx).dir });
    for (const it of itemsFor(ctx)) {
      if (want && !want.has(it.id)) continue;
      const was = valueOf(nodeOf(f.cur, it), it), stock = valueOf(nodeOf(f.van, it), it);
      if (!same(it, was, stock)) list.push({ it, was, now: stock });
    }
    const before = SW.serialize(f.cur), after = list.length ? apply(f.cur, f.van, list) : before;
    const gone = after.equals(f.vanBuf);
    if (list.length || gone) { outs.push({ rel: REL, after: gone ? null : after }); removed = gone; }
  }
  const sp = SI.resetPlan(ctx, mod, want ? [...want] : null);
  for (const o of sp.out) { const gone = o.vanilla != null && o.text === o.vanilla; outs.push({ rel: o.rel, after: gone ? null : Buffer.from(o.text, 'latin1') }); if (gone) removed = true; }
  const sightHad = side(ctx) === 'as2' && SI.ITEMS.some(it => !want || want.has(it.id)) && [SI.VS, SI.VG].some(r => fs.existsSync(modPath(mod, r)));
  const res = { file: REL, target, had: had || sightHad, changes: list.map(c => ({ id: c.it.id, key: c.it.key, was: c.was, now: c.now })).concat(sp.list), removed: false, fileRemoved: false };
  if (write && outs.length) {
    res.undo = writeAll(ctx, mod, outs);
    res.removed = true; res.fileRemoved = removed;
  }
  return res;
}


// ---- guns: where the weapon aiming keys sit (read only).
// CACHE (gui README, contract 1). Game part: every resource/set/stuff/* of the one shared game view (bots/lib gameView), kept in the
// shared store, section 'bots.guns.game' (parts {game, gid}, stamp game). Mod part: the files under resource/set/stuff of the shared mod
// listing (lib/modtree, no walk here), kept in section 'bots.guns.mod' (parts {mod}, stamp mod:set). Both also stay in memory while
// their stamps stand. A caller with no store or no listing (ctx.cache / ctx.modtree) gets both made now: gunsModNow walks set/stuff
// itself, as before.
const GUNRE = new RegExp('\\{\\s*(' + CAT.guns.map(g => g.key).join('|') + ')\\b', 'i');
const GUNS_GAME = 'bots.guns.game', GUNS_MOD = 'bots.guns.mod', GUNS_VER = 1;
const GCACHE = new Map(), MCACHE = new Map();   // identity -> {sig, value}
const lowp = p => { const r = path.resolve(String(p)).replace(/\\/g, '/'); return process.platform === 'win32' ? r.toLowerCase() : r; };
function scanText(vk, text, from, put) {
  const lines = text.split(/\r?\n|\r/);
  lines.forEach((l, i) => { const live = l.replace(/;.*$/, ''), m = GUNRE.exec(live); if (m) put(m[1], { key: vk, line: i + 1, text: l.trim().slice(0, 90), from }); });
}
// the game's hits made now: [[key name, hit]]; null when the game cannot be read (the reply then lists none, and nothing is kept)
function gunsGameNow(ctx) {
  const game = [];
  try {
    const vfs = require('../../../../../lib/vfs'), v = lib.gameView(ctx);
    if (!v) return null;
    try {
      for (const [k, r] of v.files) if (k.startsWith('resource/set/stuff/')) scanText(k, vfs.readRec(r).toString('latin1'), 'game', (kk, h) => game.push([kk, h]));
    } finally { if (vfs.closeRecs) vfs.closeRecs(); }
  } catch (e) { return null; }
  return game;
}
const gunsGameParts = G => ({ game: lowp(G.dir), gid: G.id });
function gunsGame(ctx) {
  const G = lib.gameOf(ctx);
  if (!G.dir) return null;
  const S = lib.storeOf(ctx), parts = gunsGameParts(G), stamps = { game: lib.gameStamp(ctx, G) }, id = JSON.stringify(parts), c = GCACHE.get(id);
  if (c && c.sig === stamps.game) return c.value;
  let hit = null; try { hit = S && S.get(GUNS_GAME, GUNS_VER, parts, stamps); } catch (e) { hit = null; }
  let value = hit && Array.isArray(hit.value) ? hit.value : null;
  if (!value) { const now = gunsGameNow(ctx); value = now || []; if (S && now) { try { S.put(GUNS_GAME, GUNS_VER, parts, stamps, value); } catch (e) { /* best effort */ } } }
  GCACHE.set(id, { sig: stamps.game, value });
  return value;
}
// the mod's hits: {keys: [file keys under set/stuff], hits: [[key name, hit]]}. files: paths under the mod of the files to read
function gunsModOf(mod, rels) {
  const keys = [], hits = [];
  for (const rel of rels) {
    const vk = rel.toLowerCase();
    keys.push(vk);
    try { scanText(vk, fs.readFileSync(path.join(mod, ...rel.split('/')), 'latin1'), 'mod', (k, h) => hits.push([k, h])); } catch (e) { keys.pop(); }
  }
  return { keys, hits };
}
// SPEED: the same answer for a caller that can wait (gunsMod): the same files in the same order, with a turn for the server every
// 25 ms of reading (a big mod has thousands of files under set/stuff: 1.3-2 s in one block before)
async function gunsModSliced(mod, rels) {
  const keys = [], hits = [];
  let t = Date.now();
  for (const rel of rels) {
    const vk = rel.toLowerCase();
    keys.push(vk);
    try { scanText(vk, fs.readFileSync(path.join(mod, ...rel.split('/')), 'latin1'), 'mod', (k, h) => hits.push([k, h])); } catch (e) { keys.pop(); }
    if (Date.now() - t > 25) { await new Promise(r => setImmediate(r)); t = Date.now(); }
  }
  return { keys, hits };
}
const MFLIGHT = new Map();   // identity + stamps -> the read that runs (callers at the same time share it)
// made now with a walk of the mod's set/stuff alone (no listing at hand); files in the order the folders give them
function gunsModNow(mod) {
  const rels = [], stuff = mod ? modPath(mod, 'set/stuff') : null;
  if (stuff && fs.existsSync(stuff)) {
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile() && fs.statSync(p).size < 2e6) rels.push('resource/' + path.relative(path.join(mod, 'resource'), p).split(path.sep).join('/'));
      }
    })(stuff);
  }
  return gunsModOf(mod, rels);
}
// the same from the shared listing: the rows under resource/set/stuff, put in the order the folder walk gives (each folder's entries by
// name, a folder entered where it stands), so the first six hits of a key are the ones the walk shows
function stuffRels(T) {
  const root = { kids: new Map() };
  for (const [rel, size] of T.files) {
    const l = rel.toLowerCase();
    if (!l.startsWith('resource/set/stuff/') || !(size < 2e6)) continue;
    let n = root;
    const segs = rel.split('/').slice(3);
    segs.forEach((s, i) => { if (i === segs.length - 1) n.kids.set(s, rel); else { if (!(n.kids.get(s) instanceof Object)) n.kids.set(s, { kids: new Map() }); n = n.kids.get(s); } });
  }
  // a Windows folder lists its names by their upper-case form
  const out = [], up = s => s.toUpperCase(), byName = (a, b) => (up(a) < up(b) ? -1 : up(a) > up(b) ? 1 : a < b ? -1 : a > b ? 1 : 0);
  (function walk(n) { for (const k of [...n.kids.keys()].sort(byName)) { const v = n.kids.get(k); if (typeof v === 'string') out.push(v); else walk(v); } })(root);
  return out;
}
async function gunsMod(ctx, mod) {
  const S = lib.storeOf(ctx), MT = ctx && ctx.modtree;
  if (!mod) return { keys: [], hits: [] };
  if (!S || !MT || typeof MT.ensure !== 'function') return gunsModNow(mod);
  const T = await MT.ensure(mod), parts = { mod: lowp(mod) }, stamps = MT.stamps(T, ['set']), id = JSON.stringify(parts), sig = JSON.stringify(stamps), c = MCACHE.get(id);
  if (c && c.sig === sig) return c.value;
  let hit = null; try { hit = S.get(GUNS_MOD, GUNS_VER, parts, stamps); } catch (e) { hit = null; }
  let value = hit && hit.value && Array.isArray(hit.value.keys) && Array.isArray(hit.value.hits) ? hit.value : null;
  if (!value) {
    const fk = id + sig;
    if (!MFLIGHT.has(fk)) MFLIGHT.set(fk, (async () => {
      const v = await gunsModSliced(mod, stuffRels(T));
      try { S.put(GUNS_MOD, GUNS_VER, parts, stamps, v); } catch (e) { /* best effort */ }
      MCACHE.set(id, { sig, value: v });
      return v;
    })().finally(() => MFLIGHT.delete(fk)));
    return MFLIGHT.get(fk);
  }
  MCACHE.set(id, { sig, value });
  return value;
}
const forget = () => { GCACHE.clear(); MCACHE.clear(); };   // drop what is held in memory (the Prepare screen's Clear)
// the store state of both parts for the Prepare screen (no walk, no read): [game part, mod part]
function gunsState(ctx, mod) {
  const S = lib.storeOf(ctx), MT = ctx && ctx.modtree, G = lib.gameOf(ctx), T = mod && MT && typeof MT.last === 'function' ? MT.last(mod) : null, out = [];
  if (!S) return [{ state: 'none', why: [] }];
  if (G.dir) out.push(S.state(GUNS_GAME, GUNS_VER, gunsGameParts(G), { game: lib.gameStamp(ctx, G) }));
  if (mod) out.push(T ? S.state(GUNS_MOD, GUNS_VER, { mod: lowp(mod) }, MT.stamps(T, ['set'])) : { state: 'none', why: ['mod'] });
  return out;
}
async function guns(ctx, mod) {
  const G = lib.gameOf(ctx), by = {};
  CAT.guns.forEach(g => { by[g.key.toLowerCase()] = { hits: [], files: new Set() }; });
  const put = (k, hit) => { const b = by[k.toLowerCase()]; if (b) { b.hits.push(hit); b.files.add(hit.key); } };
  const M = await gunsMod(ctx, mod), modHits = M.hits, modKeys = new Set(M.keys);
  const game = gunsGame(ctx);
  modHits.forEach(([k, h]) => put(k, h));
  (game || []).forEach(([k, h]) => { if (!modKeys.has(h.key)) put(k, h); });   // the mod's file of the same path replaces the game's
  return { game: G.id, kind: G.kind, gameRead: !!game, rows: CAT.guns.map(g => { const b = by[g.key.toLowerCase()];
    return { id: g.id, key: g.key, reader: g.reader, tag: g.tag, def: g.def, files: b.files.size, count: b.hits.length, hits: b.hits.slice(0, 6) }; }) };
}

module.exports = { pruneDirs, REL, VKEY, CAT, itemsFor, nodeOf, valueOf, values, checkValue, edit, reset, guns, diff, gunsState, forget, gunsModNow, gunsGameNow, GUNS_GAME, GUNS_MOD };
