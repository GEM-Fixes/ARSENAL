// recipe "army", Gates of Hell: make a NEW army as a copy of the forms of a stock one (the base) with the cards the user picked,
// and copy cards of other armies into an army (new or existing: adopt).
// What a GoH army is, read on the vanilla install (vfs exe goh, 2026-11-23, Finland as the smallest set) [V, T in game]:
//   resource/set/multiplayer/armies/<a>.set              {army {id N} {title "mp/army/<a>"} {icon "/interface/pages/multi/flag_<a>"}}
//                                                          (GoH reads icon and id only, the name is always mp/army/<a>: GHMIS-93)
//   resource/set/multiplayer/games/presets/alliances_generic.inc  {"Axis" .. {armies "fin"} ..}: the side in the modes that
//                                                          include it (ammunition, battle_zones, campaign_capture_the_flag, evacuation, frontlines)
//   resource/set/multiplayer/units/roster_<p>.set        (include "settings.set") (include "settings_inf.set") (include "<p>/inf_<a>.set")
//                                                          .. (include "<p>/units_<a>.set") per period p; the macros a card calls are the
//                                                          defines of the files the roster includes before it (vanilla: all 3724 cards
//                                                          call macros of settings.set; a mod may define its own in any of them)
//   resource/set/multiplayer/units/<p>/inf_<a>.set       one soldier card per line {"mp/<a>/<p>/<crew>" ("inf_.." side(<a>) period(<p>) cost(..))}
//                                                          (vanilla: 3029 lines, all one line each; a block over several lines is copied whole)
//   resource/set/breed/mp/<a>/<p>/<crew>.set              the soldier itself (+ ability.inc of that folder). Includes: 8706 relative inside
//                                                          the army's folder, 40 root-relative "/set/breed/presets/.." (= resource/set/breed/..):
//                                                          a relative include that leads out of the copied folder is written root-relative
//   resource/set/multiplayer/units/<p>/units_<a>.set     the buy cards: macros with side(<a>); the side gives the card's army tag and its
//                                                          crew path mp/<side>/<period>/<crew>; card ids unique over all armies of a period
//                                                          (vanilla: 2 clashes in 3724: 210mm_nebelwerfer42 mid fin+ger, conquest_blank)
//   own-unit cards: macros vehicle, vehicle2, vehicle3, emplacement(_generic) have {content "* ( crew )"}: '*' is the card's own name,
//                                                          so the card buys the entity of its id (1748 of 3724 cards; 200 of fin's 474). Its
//                                                          copy gets a new id, so the entity is cloned under that id (gen clone op, as the Units
//                                                          page's Add does; the gen wreck step clones <id>_x and <id>_xx too), the card text
//                                                          kept: price, command points and score stay those of the copied card (GHGPL-10)
//   doctrines: {doctrine <d>} / d(<d>) on cards; the lobby offers the army in a unit mode only with a doctrine there (GHGPL-09, GHMIS-88)
//   resource/set/registry/dlc.reg {dlc {army {fin 1911520} ..}}: ger and rus are in no list, so an army in no list needs no DLC [I]
//                                                          (GHNET-26 checks content army/<a>; GHNET-61: AI takes armies in no DLC list)
//   resource/script/multiplayer/units/<a>/<p>.<a>.lua    the bots' purchase list (modes/utility.lua: a missing one prints
//                                                          "Module does not exist" and the bot buys nothing [V])
//   mp/army/<a> in a .pot; desc/squad/<card id>, desc/entity/<entity> the card names (resource/interface/text/desc/*.pot)
//   pictures (plain ones made by code, at the size of the base army's own file): result_player_flag_<a>.tga (the result screen reads
//   it by army word) and skin/game/button/faction/<a>.png (the single player army pick reads it by army word); load_flag_<a>.tga and
//   result_flag_<a>.tga (every vanilla army has them, no reader found [I]); game_end_logo_*_<a>.tga not made (usa and eng have none)
//   modes/frontlines.lua: local nationMap = { rus = 1, ger = 2, fin = 3, usa = 4, eng = 5 } -> "<a> = <base's number>" (an unknown army
//   gives 0 to the map script) [I]: the new army counts as its base there
//   left out (notes, [T]): Conquest (roster_conquest.set, conquest/*_<a>.set, dynamic_campaign/unit_research_<a>.set, values.set
//   matchups, dynamic_campaign pictures, conquest/runtime_context.lua nationMap), card portraits (portrait_squad/<card>: the game
//   shows its placeholder when missing), voices (breeds keep {nationality <base>}: there are no voices for a new nationality).
// Writes only into the mod through lib/modwrite (guardFile, restorePoints, writeFiles), bytes and line ends kept.
// Author: Imperator_Aug (ARSENAL, ia-fd039494)
'use strict';
const path = require('path');

const ARMIES = 'resource/set/multiplayer/armies/', UNITS = 'resource/set/multiplayer/units/', BREED = 'resource/set/breed/mp/';
const ALLY = 'resource/set/multiplayer/games/presets/alliances_generic.inc', DLC = 'resource/set/registry/dlc.reg';
const FLAGS = 'resource/interface/pages/multi/', FACTION = 'resource/interface/skin/game/button/faction/';
const FRONT = 'resource/script/multiplayer/modes/frontlines.lua';
const TEXT_DIR = 'localizations/default/interface/text/';
const PERIODS = ['early', 'mid', 'late'];
const TAG = /^[a-z][a-z0-9_]{0,15}$/;
const PICK = /^(?:([a-z][a-z0-9_]{0,15}):)?([A-Za-z0-9_.()]+)@(early|mid|late)$/;
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const badK = (k, m, p) => Object.assign(bad(m), { key: k }, p ? { params: p } : {});
const lc = s => String(s == null ? '' : s).toLowerCase();
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bare = l => l.replace(/"[^"]*"/g, '""').replace(/;.*$/, '');
const depth = l => { let d = 0; for (const ch of bare(l)) { if (ch === '{' || ch === '(') d++; else if (ch === '}' || ch === ')') d--; } return d; };
const K = () => require('./army.gohcards');
const str = (g, k) => { const b = g.read(k); return b ? b.toString('latin1') : null; };
const eolOf = t => (t.includes('\r\n') ? '\r\n' : '\n');
// one macro call ("name" args) with args k(v) (one level of brackets inside)
const CALL = /\(\s*"([^"]+)"((?:[^()]|\([^()]*\))*)\)/g;
const argsOf = s => { const o = {}; let m; const re = /([A-Za-z_]\w*)\(([^()]*)\)/g; while ((m = re.exec(s))) o[lc(m[1])] = m[2].trim(); return o; };

// ---- the files the game reads before a period's cards: settings.set, then roster_<p>.set's includes in order (and theirs, 3 deep)
function rosterFiles(g, period) {
  const out = [], seen = new Set();
  const add = (key, d) => {
    if (seen.has(key)) return; seen.add(key); out.push(key);
    const t = d < 3 ? str(g, key) : null; if (!t) return;
    for (const m of t.matchAll(/^[ \t]*\(\s*include\s+"([^"]+)"/gm)) add(m[1].startsWith('/') ? 'resource' + lc(m[1]) : path.posix.normalize(path.posix.dirname(key) + '/' + lc(m[1])), d + 1);
  };
  add(UNITS + 'settings.set', 0);
  if (period) add(UNITS + 'roster_' + period + '.set', 0);
  return out;
}
// ---- the defines the cards of a period can call: per macro its crew params (X in "mp/%side/%period/%X", also through nested calls)
// and whether its content buys the card's own unit ("*"). period '' = settings.set only (and its includes)
function defines(g, period) {
  const ck = '_gohDefs_' + (period || '');
  if (g[ck]) return g[ck];
  const raw = new Map();
  for (const key of rosterFiles(g, period)) {
    const t = str(g, key); if (!t) continue;
    const lines = t.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*\(\s*define\s+"([^"]+)"/.exec(lines[i]); if (!m) continue;
      let d = 0, j = i;
      for (; j < lines.length; j++) { d += depth(lines[j]); if (d <= 0) break; }
      const body = lines.slice(i, j + 1).join('\n').replace(/^\s*\(\s*define\s+"[^"]+"/, '');
      const contents = [...body.matchAll(/\{\s*content\s+"([^"]*)"/g)].map(x => x[1]);
      const calls = []; let c; CALL.lastIndex = 0; while ((c = CALL.exec(body))) calls.push({ name: lc(c[1]), args: argsOf(c[2]) });
      if (!raw.has(lc(m[1]))) raw.set(lc(m[1]), { contents, calls, file: key });
      i = j;
    }
  }
  const out = new Map();
  const solve = (name, seen) => {
    if (out.has(name)) return out.get(name);
    const r = raw.get(name); if (!r || seen.has(name)) return null;
    seen.add(name);
    const crew = new Set(), res = { crew, own: false, content: r.contents.length > 0, file: r.file };
    for (const ct of r.contents) { for (const x of ct.matchAll(/mp\/%side\/%period\/%(\w+)/g)) crew.add(lc(x[1])); if (/^\s*\*/.test(ct)) res.own = true; }
    for (const cl of r.calls) {
      const sub = solve(cl.name, seen); if (!sub) continue;
      if (sub.own) res.own = true; if (sub.content) res.content = true;
      for (const k of sub.crew) { const v = cl.args[k]; if (v) for (const p of v.matchAll(/%(\w+)/g)) crew.add(lc(p[1])); }
    }
    out.set(name, res);
    return res;
  };
  for (const k of raw.keys()) solve(k, new Set());
  g[ck] = out;
  return out;
}

// the shown text of every desc/squad and desc/entity key (msgctxt -> msgid, raw bytes kept), read once per reader
function names(g) {
  if (g._gohSquadNames) return g._gohSquadNames;
  const m = new Map();
  for (const k of g.keys(/^resource\/interface\/text\/.*\.pot$/)) {
    const t = str(g, k) || '', re = /msgctxt\s+"((?:[^"\\]|\\.)*)"\s*\r?\nmsgid\s+"((?:[^"\\]|\\.)*)"/g; let x;
    while ((x = re.exec(t))) if (/^desc\/(squad|entity)\//i.test(x[1]) && x[2] && !m.has(lc(x[1]))) m.set(lc(x[1]), x[2]);
  }
  g._gohSquadNames = m;
  return m;
}
// the entity file names of the game and mod (<name> of resource/entity/**/<name>.def), read once per reader
function entityNames(g) {
  if (!g._gohDefNames) g._gohDefNames = new Set(g.keys(/^resource\/entity\/.*\.def$/).map(k => lc(k.split('/').pop().slice(0, -4))));
  return g._gohDefNames;
}

// the side every army is on in alliances_generic.inc: {tag: 'axis'|'allies'}, and the side names
function alliances(g) {
  const out = {}, t = str(g, ALLY) || ''; let cur = '';
  for (const l of t.split(/\r?\n/)) {
    const a = /^\s*\{\s*"([^"]+)"/.exec(l); if (a) cur = lc(a[1]);
    const m = /\{\s*armies\s+"([^"]+)"/i.exec(l); if (m && cur) out[lc(m[1])] = cur;
  }
  return out;
}
// armies a DLC gates (dlc.reg {dlc {army {<tag> <app>}}})
function dlcArmies(g) {
  const t = str(g, DLC) || '', m = /\{\s*army\b([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/i.exec(t), s = new Set();
  if (m) for (const x of m[1].matchAll(/\{\s*([A-Za-z0-9_]+)\s/g)) s.add(lc(x[1]));
  return s;
}

// a picked card <id>@<period> of army src, rewritten for army tag. -> {text, oldId, newId, crews, doctrine, period, src, clone}
// clone: {entity, as} when the card buys the unit of its own name (content "*"): that unit is cloned under the new id
function rewriteCard(g, x, src, tag, taken, opts) {
  const period = x.listPeriod, D = defines(g, period), why = w => bad('Card ' + x.cat + ' of ' + src + ' (' + period + ') cannot be copied into ' + tag + ': ' + w);
  const calls = []; let c; CALL.lastIndex = 0;
  while ((c = CALL.exec(x.text))) calls.push({ name: lc(c[1]), args: argsOf(c[2]) });
  if (!calls.length) throw why('it calls no macro.');
  const crews = new Set(); let own = false, content = /\{\s*content\s+"/.test(x.text);
  if (/\{\s*content\s+"\s*\*/.test(x.text)) own = true;
  for (const cl of calls) {
    const d = D.get(cl.name);
    if (!d) throw why('its macro "' + cl.name + '" is defined in none of the files the game reads before the ' + period + ' cards (settings.set and the includes of roster_' + period + '.set), so its crew and unit cannot be read.');
    if (d.own) own = true; if (d.content) content = true;
    for (const k of d.crew) for (const tok of String(cl.args[k] || '').split(/\s+/).filter(Boolean)) crews.add(lc(tok.split(':')[0]));
  }
  for (const m of x.text.matchAll(new RegExp('mp/' + esc(src) + '/' + esc(period) + '/([A-Za-z0-9_]+)', 'gi'))) crews.add(lc(m[1]));
  if (!content) throw why('no content (what it buys) was found in it or its macros.');
  if (crews.has('') || [...crews].some(n => !/^[a-z0-9_]+$/.test(n))) throw why('a crew name is not a plain word.');
  // the id: name(side) of a call line follows the side; a block id ending (<src>) gets (<tag>), any other block id _<tag>
  let newId, text = x.text;
  if (x.kind === 'call') newId = x.cat.replace(/\([^()]*\)$/, '') + '(' + tag + ')';
  else {
    newId = new RegExp('\\(' + esc(src) + '\\)$', 'i').test(x.cat) ? x.cat.replace(/\([^()]*\)$/, '(' + tag + ')') : x.cat + '_' + tag;
    text = text.replace(/^(\s*\{\s*")[^"]+(")/, (m, a, b) => a + newId + b);
  }
  if (!/^[A-Za-z0-9_()]{1,80}$/.test(newId)) throw why('its new id ' + newId + ' is not a plain word.');
  if (taken.has(lc(newId)) || taken.has(lc(newId.replace(/\([^()]*\)$/, '')) + '(' + tag + ')')) throw why('the id ' + newId + ' is already a card.');
  let clone = null;
  if (own) {
    // the unit of the card's own name is cloned under the new id: a plain word, not a wreck name (<n>_x), no unit of that name yet
    const E = entityNames(g);
    if (x.kind === 'call' || !/^[a-z0-9_]{1,60}$/i.test(newId)) throw badK('task.army.na.gohmake', 'Card ' + x.cat + ' buys the unit of its own name, and its new id ' + newId + ' cannot be a unit file name, so the unit cannot be copied under it.', { card: x.cat });
    if (/_x+$/i.test(newId)) throw why('its new id ' + newId + ' ends like a wreck name (_x), which the game takes for a destroyed vehicle. Pick another army word.');
    if (!E.has(lc(x.cat))) throw badK('task.army.na.gohmake', 'Card ' + x.cat + ' buys the unit of its own name, and no unit file ' + x.cat + '.def is in the game or the mod to copy under the new id.', { card: x.cat });
    if (E.has(lc(newId)) && !(opts && opts.cloned)) throw why('a unit file ' + newId + '.def already exists, so the copy of ' + x.cat + ' cannot take that name.');
    clone = { entity: lc(x.cat), as: lc(newId) };
  }
  taken.add(lc(newId));
  text = text.replace(new RegExp('(\\bside\\()\\s*' + esc(src) + '\\s*(\\))', 'gi'), '$1' + tag + '$2')
    .replace(new RegExp('\\bmp/' + esc(src) + '/', 'gi'), 'mp/' + tag + '/')
    .replace(/(\{\s*tags\s+")([^"]*)(")/gi, (m, a, s, b) => a + s.split(/(\s+)/).map(w => (lc(w) === src ? tag : w)).join('') + b);
  const left = text.split('\n').map(bare).find(l => new RegExp('\\b' + esc(src) + '\\b', 'i').test(l));
  if (left) throw why('it still names ' + src + ' in a form this task does not know: ' + left.trim().slice(0, 120));
  const doctrine = lc((/\{\s*doctrine\s+([A-Za-z0-9_]+)/.exec(text) || [])[1] || (calls.map(cl => cl.args.d).find(Boolean) || ''));
  return { text, oldId: x.cat, newId, crews: [...crews].sort(), doctrine, period, kind: x.kind, src, clone };
}

// a plain picture (one colour from the army word, a darker border), uncompressed 32 bit TGA in the size and origin of the stock one
// `like` (w x h fallback when it is missing or not a plain 32 bit TGA)
function plainTga(g, like, tag, w0, h0) {
  const sb = like ? g.read(like) : null;
  let w = w0 || 40, h = h0 || 20, desc = 0x28;
  if (sb && sb.length >= 18 && sb[2] === 2 && sb[16] === 32) { w = sb.readUInt16LE(12) || w; h = sb.readUInt16LE(14) || h; desc = sb[17]; }
  if (w > 1024 || h > 1024) { w = w0 || 40; h = h0 || 20; }
  const rgb = colourOf(tag), b = Buffer.alloc(18 + w * h * 4); b[2] = 2; b.writeUInt16LE(w, 12); b.writeUInt16LE(h, 14); b[16] = 32; b[17] = desc;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1, o = 18 + (y * w + x) * 4, k = edge ? 0.5 : 1;
    b[o] = Math.round(rgb[2] * k); b[o + 1] = Math.round(rgb[1] * k); b[o + 2] = Math.round(rgb[0] * k); b[o + 3] = 255;
  }
  return b;
}
function colourOf(tag) { let s = 0; for (const ch of tag) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return [60 + (s & 0x7f), 60 + ((s >> 7) & 0x7f), 60 + ((s >> 14) & 0x7f)]; }
const plainFlag = (g, base, tag) => plainTga(g, FLAGS + 'flag_' + base + '.tga', tag, 40, 20);
// a plain PNG in the size of the stock one (artport encoder), for the army pick button
function plainPng(g, like, tag) {
  const sb = like ? g.read(like) : null;
  let w = 256, h = 256;
  if (sb && sb.length > 24 && sb.readUInt32BE(12) === 0x49484452) { w = sb.readUInt32BE(16); h = sb.readUInt32BE(20); }
  if (!(w > 0 && h > 0 && w <= 2048 && h <= 2048)) { w = 256; h = 256; }
  const rgb = colourOf(tag), rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = rgb[0]; rgba[i * 4 + 1] = rgb[1]; rgba[i * 4 + 2] = rgb[2]; rgba[i * 4 + 3] = 255; }
  return require('../../../../artport/artport').encodePng({ w, h, rgba });
}
const potQ = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const potHead = '#, fuzzy\nmsgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\n';

// a picked card: '<id>@<period>' (of the default army) or '<army>:<id>@<period>' -> {src, x}
function pickOf(g, p, dflt, cache) {
  const m = PICK.exec(String(p));
  if (!m) throw bad('A card is picked as <card id>@<period> (early, mid or late), or <army>:<card id>@<period> for a card of another army: ' + p);
  const src = lc(m[1] || dflt);
  if (!TAG.test(src)) throw bad('Pick the army of card ' + m[2] + '.');
  if (!cache.has(src)) cache.set(src, K().cardsOf(g, src, ''));
  const x = cache.get(src).find(y => lc(y.cat) === lc(m[2]) && y.listPeriod === m[3]);
  if (!x) throw bad(src + ' has no card ' + m[2] + ' in its ' + m[3] + ' list. Pick it from the list.');
  return { src, x };
}

// the soldiers the cards of one period need in army tag: crews -> soldier lines of inf_<tag>.set and breed files
// need: Map crew -> {src, users}; have: the text of tag's inf file (adopt) or null (make); copyInc: relative includes of a breed of
// army copyInc are copied into tag's folder (make: the base), others are written root-relative (the file stays where it is)
function soldiers(g, p, tag, need, have, copyInc, put, files) {
  const lines = [];
  for (const [cr, { src, users }] of [...need].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (have && new RegExp('^\\s*\\{\\s*"mp/' + esc(tag) + '/' + esc(p) + '/' + esc(cr) + '"', 'im').test(have)) continue;
    const ik = UNITS + p + '/inf_' + src + '.set', it = str(g, ik);
    if (!it) throw bad('Gates of Hell has no ' + ik + ' with the soldiers of ' + src + '.');
    const il = it.split(/\r?\n/), re = new RegExp('^\\s*\\{\\s*"mp/' + esc(src) + '/' + esc(p) + '/' + esc(cr) + '"', 'i'), i = il.findIndex(x => re.test(x));
    if (i < 0) throw bad('Card ' + users.join(', ') + ' needs the soldier ' + cr + ', and ' + ik + ' has no "mp/' + src + '/' + p + '/' + cr + '" line.');
    // the soldier card: its line, or every line until its brackets close (a block over several lines)
    let d = 0, j = i; for (; j < il.length && j < i + 60; j++) { d += depth(il[j]); if (d <= 0) break; }
    if (d > 0) throw bad('The soldier card of ' + cr + ' in ' + ik + ' does not close its brackets within 60 lines.');
    const blk = il.slice(i, j + 1).map(l => l.replace(new RegExp('"mp/' + esc(src) + '/', 'i'), '"mp/' + tag + '/').replace(new RegExp('(\\bside\\()\\s*' + esc(src) + '\\s*(\\))', 'gi'), '$1' + tag + '$2'));
    const left = blk.map(bare).find(l => new RegExp('\\b' + esc(src) + '\\b', 'i').test(l));
    if (left) throw bad('The soldier card of ' + cr + ' in ' + ik + ' names ' + src + ' in a form this task does not know: ' + left.trim().slice(0, 120));
    lines.push(...blk);
    const bk = BREED + src + '/' + p + '/' + cr + '.set', to = BREED + tag + '/' + p + '/' + cr + '.set', bb = g.read(bk);
    if (!bb) throw bad('Card ' + users.join(', ') + ' needs the soldier ' + cr + ', and ' + bk + ' (its breed) is missing.');
    if (have && g.read(to) && !files.has(to)) continue;   // the army has that breed file already: its soldier line now names it
    put(to, breedCopy(g, bb, bk, src, tag, copyInc === src, put, files, 0));
  }
  return lines;
}
// a breed file for army tag: relative includes inside src's folder are copied (copy) or made root-relative, any other relative one
// root-relative ("/set/breed/.." = resource/set/breed/.., the vanilla form of 40 includes); root-relative ones are kept
function breedCopy(g, buf, key, src, tag, copy, put, files, d) {
  const home = BREED + src + '/';
  let t = buf.toString('latin1'), changed = false;
  t = t.replace(/(\(\s*include\s+")([^"]+)(")/g, (m, a, inc, b) => {
    if (inc.startsWith('/')) return m;
    const at = path.posix.normalize(path.posix.dirname(key) + '/' + inc);
    if (!at.startsWith('resource/')) throw bad(key + ' includes ' + inc + ', which leads out of the game\'s resource folder.');
    const ib = g.read(at); if (!ib) throw bad(key + ' includes ' + inc + ', which is missing (' + at + ').');
    if (copy && at.startsWith(home)) {
      const to = BREED + tag + '/' + at.slice(home.length);
      if (!files.has(to)) { files.set(to, null); put(to, d < 4 ? breedCopy(g, ib, at, src, tag, copy, put, files, d + 1) : ib); }
      return m;
    }
    changed = true;
    return a + at.slice('resource'.length) + b;
  });
  return changed ? Buffer.from(t, 'latin1') : buf;
}

// the cards picked, rewritten for tag, grouped by period. -> {byP: Map p -> [r], clones}
function rewriteAll(g, picks, dflt, tag, opts) {
  const taken = K().allIds(g), byP = new Map(), cache = new Map(), clones = [];
  for (const p of picks) {
    const { src, x } = pickOf(g, p, dflt, cache);
    if (src === tag) throw bad('Card ' + x.cat + ' is already a card of ' + tag + '.');
    const r = rewriteCard(g, x, src, tag, taken, opts);
    if (r.clone) clones.push(r.clone);
    if (!byP.has(x.listPeriod)) byP.set(x.listPeriod, []);
    byP.get(x.listPeriod).push(r);
  }
  return { byP, clones };
}
// the crews a period's cards need: Map crew -> {src, users}; a crew of two armies comes from the first (make: the base first)
function needOf(cs) {
  const need = new Map();
  for (const c of cs) for (const cr of c.crews) { if (!need.has(cr)) need.set(cr, { src: c.src, users: [] }); need.get(cr).users.push(c.oldId); }
  return need;
}
// the card names under the new ids (desc/squad/<id>; desc/entity/<unit> for a cloned unit), from the game's .pot texts
function nameRows(g, cs) {
  const nm = names(g), rows = [];
  for (const c of cs) {
    const t = nm.get(lc('desc/squad/' + c.oldId)); if (t) rows.push('msgctxt "desc/squad/' + potQ(c.newId) + '"\nmsgid "' + t + '"\nmsgstr ""\n');
    if (c.clone) { const e = nm.get(lc('desc/entity/' + c.oldId)); if (e) rows.push('msgctxt "desc/entity/' + potQ(c.newId) + '"\nmsgid "' + e + '"\nmsgstr ""\n'); }
  }
  return rows;
}
const cloneNote = (tag, clones) => (clones.length ? 'Cards that buy the unit of their own name: ' + clones.map(c => c.entity + ' -> ' + c.as).join(', ') + '. Each unit file is copied under the new card id into your mod (with its wreck files when it has them), so the copy buys the same unit at the same price [T]. Their buy panel pictures are keyed by card id, so they show the game\'s placeholder.' : '');

// the whole new army as files. spec {tag, base, id, alliance, cards: ['<id>@<period>' | '<army>:<id>@<period>'], flag: 'plain' | 'own' | 'game:<name>'}
// -> {files: Map rel -> Buffer, rows, notes, cards: [{oldId, newId, period, doctrine, src}], periods, clones: [{entity, as}]}
function plan(g, spec) {
  const tag = lc(spec.tag), base = lc(spec.base), alliance = lc(spec.alliance || '');
  if (!TAG.test(tag)) throw bad('Type the short word of the new army: small English letters, digits and _ (up to 16), for example ita.');
  if (!TAG.test(base)) throw bad('Pick the stock army whose forms the new army copies.');
  const armyKeys = g.keys(/^resource\/set\/multiplayer\/armies\/[^/]+\.set$/), tags = armyKeys.map(k => lc(k.split('/').pop().slice(0, -4)));
  if (tags.includes(tag)) throw bad('Gates of Hell (or your mod) already has an army ' + tag + ' (' + ARMIES + tag + '.set). Pick another word.');
  if (!tags.includes(base)) throw bad('Gates of Hell has no army ' + base + ' to copy. Pick one from the list.');
  if (dlcArmies(g).has(tag)) throw bad('The word ' + tag + ' is a DLC army in ' + DLC + ', so a player could pick it only with that DLC (GHNET-26). Pick another word.');
  const id = Number(spec.id);
  if (!Number.isInteger(id) || id < 0 || id > 99) throw bad('The army number is a whole number from 0 to 99.');
  const ids = new Map(); for (const k of armyKeys) { const m = /\{\s*id\s+(-?\d+)/.exec(str(g, k) || ''); if (m) ids.set(+m[1], k.split('/').pop().slice(0, -4)); }
  if (ids.has(id)) throw bad('Number ' + id + ' is already army ' + ids.get(id) + '. Pick a free one.');
  const files = new Map(), rows = [], notes = [], put = (rel, text) => files.set(rel, Buffer.isBuffer(text) ? text : Buffer.from(text, 'latin1'));

  // 1. armies/<tag>.set: the base file's form with the new id, name key and flag
  const at = str(g, ARMIES + base + '.set');
  const flag = String(spec.flag || 'plain'), gameFlag = /^game:([a-z0-9_]+)$/.exec(flag);
  const icon = '/interface/pages/multi/flag_' + (gameFlag ? gameFlag[1] : tag);
  if (gameFlag && !g.read(FLAGS + 'flag_' + gameFlag[1] + '.tga')) throw bad('Gates of Hell has no flag flag_' + gameFlag[1] + '.tga to show. Pick one from the list.');
  if (!/\{\s*id\s+-?\d+\s*\}/.test(at) || !/\{\s*title\s+"[^"]*"\s*\}/.test(at) || !/\{\s*icon\s+"[^"]*"\s*\}/.test(at)) throw bad(ARMIES + base + '.set has no {id}, {title} and {icon} line each, so its form is not the one this task copies.');
  put(ARMIES + tag + '.set', at.replace(/(\{\s*id\s+)-?\d+(\s*\})/, '$1' + id + '$2').replace(/(\{\s*title\s+")[^"]*(")/, '$1mp/army/' + tag + '$2').replace(/(\{\s*icon\s+")[^"]*(")/, '$1' + icon + '$2'));
  rows.push({ file: ARMIES + tag + '.set', what: 'army ' + tag + ', number ' + id + ', flag ' + icon });
  if (flag === 'plain') { put(FLAGS + 'flag_' + tag + '.tga', plainFlag(g, base, tag)); rows.push({ file: FLAGS + 'flag_' + tag + '.tga', what: 'a plain flag made by code' }); }

  // 2. the side: alliances_generic.inc gets {armies "<tag>"} after the last army of the picked side
  const al = str(g, ALLY);
  if (!al) throw bad('Gates of Hell has no ' + ALLY + ', the side list this task writes.');
  const sides = alliances(g), side = alliance || sides[base] || '';
  {
    const eol = eolOf(al), ls = al.split(/\r?\n/); let cur = '', last = -1;
    ls.forEach((l, i) => { const a = /^\s*\{\s*"([^"]+)"/.exec(l); if (a) cur = lc(a[1]); if (cur === side && /\{\s*armies\s+"/i.test(l)) last = i; });
    if (last < 0) throw bad('The side ' + (side || '(none)') + ' is not in ' + ALLY + '. Pick allies or axis.');
    ls.splice(last + 1, 0, (/^\s*/.exec(ls[last])[0]) + '{armies "' + tag + '"}');
    put(ALLY, ls.join(eol));
    rows.push({ file: ALLY, what: 'side ' + side });
  }

  // 3. the cards, per period: rewritten copies of the picked base cards (and of other armies' cards)
  const picks = [...new Set((spec.cards || []).map(String))];
  if (!picks.length) throw bad('A new army starts with no cards: pick at least one card of ' + base + '.');
  if (picks.length > 300) throw bad('Pick at most 300 cards.');
  const { byP, clones } = rewriteAll(g, picks, base, tag, { cloned: !!spec.cloned });
  const docs = new Map();
  for (const [p, cs] of byP) docs.set(p, [...new Set(cs.map(c => c.doctrine).filter(Boolean))]);
  if (![...docs.values()].some(d => d.length)) throw bad('None of the picked cards names a doctrine, and Gates of Hell offers an army in the lobby only with a doctrine in the mode\'s period (GHGPL-09, GHMIS-88). Pick at least one card with a doctrine (doctrine cards, or squads with d(..)).');
  const potRows = [];
  for (const p of PERIODS) {
    const cs = byP.get(p); if (!cs) continue;
    // roster_<p>.set: the two includes after the base's
    const rk = UNITS + 'roster_' + p + '.set', rt = files.has(rk) ? files.get(rk).toString('latin1') : str(g, rk);
    if (!rt) throw bad('Gates of Hell has no ' + rk + ', so the ' + p + ' cards have no list to join.');
    const eol = eolOf(rt), rl = rt.split(/\r?\n/);
    for (const f of ['units', 'inf']) {
      const re = new RegExp('^\\s*\\(\\s*include\\s+"' + esc(p) + '/' + f + '_' + esc(base) + '\\.set"\\s*\\)', 'i'), i = rl.findIndex(l => re.test(l));
      if (i < 0) throw bad(rk + ' has no (include "' + p + '/' + f + '_' + base + '.set") line to place the new army\'s list next to.');
      rl.splice(i + 1, 0, rl[i].replace(new RegExp(f + '_' + esc(base) + '\\.set', 'i'), f + '_' + tag + '.set'));
    }
    put(rk, rl.join(eol));
    // inf_<tag>.set: the soldier lines of every crew the cards use; the breeds and their includes
    const ik = UNITS + p + '/inf_' + base + '.set', it = str(g, ik);
    if (!it) throw bad('Gates of Hell has no ' + ik + ' with the soldiers of ' + base + '.');
    // a crew the base has comes from the base (its soldiers wear its uniform); one only another army has comes from that army
    const need = needOf(cs);
    for (const [cr, n] of need) if (n.src !== base && new RegExp('^\\s*\\{\\s*"mp/' + esc(base) + '/' + esc(p) + '/' + esc(cr) + '"', 'im').test(it)) n.src = base;
    const ieol = eolOf(it), out = [';SDL', '; ARSENAL: soldiers of army ' + tag + ' (' + p + '), copied from ' + ik];
    out.push(...soldiers(g, p, tag, need, null, base, put, files));
    put(UNITS + p + '/inf_' + tag + '.set', out.join(ieol) + ieol);
    // units_<tag>.set: the rewritten cards
    const uk = UNITS + p + '/units_' + base + '.set', ut = str(g, uk) || '', ueol = eolOf(ut);
    const ub = [';SDL', '; ARSENAL: buy cards of army ' + tag + ' (' + p + '), copied from ' + uk + '. Tabs: inf1 inf2 empl vehicles tanks doctrine', ''];
    for (const c of cs) { ub.push(...c.text.split('\n'), ''); rows.push({ file: UNITS + p + '/units_' + tag + '.set', what: c.src + ':' + c.oldId + ' -> ' + c.newId + (c.doctrine ? ' (doctrine ' + c.doctrine + ')' : '') + (c.clone ? ' (unit copied)' : '') }); }
    const ut2 = ub.join(ueol);
    put(UNITS + p + '/units_' + tag + '.set', ut2);
    readBack(ut2, p, tag, cs);
    potRows.push(...nameRows(g, cs));
    if (!docs.get(p).length) notes.push('The ' + p + ' cards name no doctrine, so the lobby does not offer ' + tag + ' when the mode plays ' + p + ' units (GHGPL-09) [T].');
    botList(g, p, base, tag, cs, put, rows, notes);
  }
  if (potRows.length) {
    put(TEXT_DIR + 'zz_arsenal_army_' + tag + '.pot', potHead + potRows.join('\n'));
    rows.push({ file: TEXT_DIR + 'zz_arsenal_army_' + tag + '.pot', what: potRows.length + ' card names' });
  }
  // 4. pictures by army word, plain ones made by code at the size of the base's own (result screen, army pick, loading)
  const pics = [];
  for (const pre of ['load_flag_', 'result_flag_', 'result_player_flag_']) {
    const like = FLAGS + pre + base + '.tga';
    if (!g.read(like)) continue;
    put(FLAGS + pre + tag + '.tga', plainTga(g, like, tag, 80, 40)); pics.push(FLAGS + pre + tag + '.tga');
  }
  if (g.read(FACTION + base + '.png')) { put(FACTION + tag + '.png', plainPng(g, FACTION + base + '.png', tag)); pics.push(FACTION + tag + '.png'); }
  for (const f of pics) rows.push({ file: f, what: 'a plain picture made by code' });
  // 5. frontlines.lua: the new army counts as its base in the map script's nation number
  const fl = str(g, FRONT), nl = fl ? /^([ \t]*local\s+nationMap\s*=\s*\{)([^{}\r\n]*)(\}.*)$/m.exec(fl) : null;
  if (nl) {
    const map = new Map([...nl[2].matchAll(/([A-Za-z_]\w*)\s*=\s*(\d+)/g)].map(m => [lc(m[1]), m[2]]));
    if (map.has(base) && !map.has(tag)) {
      put(FRONT, fl.replace(nl[0], nl[1] + nl[2].replace(/\s*$/, '') + ', ' + tag + ' = ' + map.get(base) + ' ' + nl[3]));
      rows.push({ file: FRONT, what: 'nationMap ' + tag + ' = ' + map.get(base) + ' (as ' + base + ')' });
      notes.push('Frontlines: the map script gets number ' + map.get(base) + ' for ' + tag + ', the number of ' + base + ', so the map treats its bots as ' + base + ' [I]. Your mod copy of ' + FRONT + ' replaces the game\'s whole file.');
    } else if (!map.has(base)) notes.push('Frontlines: ' + base + ' has no number in the nationMap of ' + FRONT + ', so ' + tag + ' gets 0 there as well [T].');
  }
  const cards = [].concat(...[...byP.values()].map(cs => cs.map(c => ({ oldId: c.oldId, newId: c.newId, period: c.period, doctrine: c.doctrine, src: c.src }))));
  notes.push('New army ' + tag + ' (copy of the forms of ' + base + ', side ' + side + '): ' + cards.length + ' cards in ' + [...byP.keys()].join(', ') + '; doctrines ' + [...new Set([].concat(...docs.values()))].join(', ') + '. Check the lobby, the doctrine pick and a buy in a test match [T].');
  const cn = cloneNote(tag, clones); if (cn) notes.push(cn);
  if (pics.length) notes.push('Plain one-colour pictures made by code for ' + tag + ': ' + pics.join(', ') + '. Draw your own over them in the mod when you like [T].');
  notes.push('Not written for ' + tag + ' [T]: Conquest (roster_conquest.set, unit_research_' + tag + '.set, dynamic_campaign/values.set matchups, its pictures and the Conquest nationMap), the game end logos game_end_logo_win_ and _lose_' + tag + '.tga (two armies of the game have none either), card portraits (the game shows its placeholder); soldiers keep {nationality ' + base + '}, so they speak with the voices of ' + base + '.');
  notes.push('No DLC row: ' + DLC + ' lists fin, usa and eng only, so an army in no list is open to every player [I] (GHNET-26, GHNET-61).');
  return { files, rows, notes, cards, periods: [...byP.keys()], side, clones };
}
// read back with the shared parser: every card is there with the new id and side
function readBack(text, p, tag, cs) {
  const back = K().parse(text, p);
  for (const c of cs) {
    const y = back.find(z => lc(z.cat) === lc(c.newId));
    if (!y || (y.side && y.side !== tag)) throw bad('Internal check: card ' + c.newId + ' does not read back from the new ' + p + ' list.', 500);
  }
}
// the bots' purchase list of a new army: the base list's rows of the picked base cards, under the new ids, stage by stage
function botList(g, p, base, tag, cs, put, rows, notes) {
  const GB = require('../../../../botrecipe/gohbuys'), brel = 'script/multiplayer/units/' + base + '/' + p + '.' + base + '.lua', bt = str(g, 'resource/' + brel);
  const mine = cs.filter(c => c.src === base), others = cs.filter(c => c.src !== base);
  if (others.length) notes.push('Bots of ' + tag + ' do not buy ' + others.map(c => c.newId).join(', ') + ' (cards of other armies): add them with the bots question after the army is written [T].');
  if (!bt) { notes.push('Bots of ' + tag + ' buy nothing in ' + p + ': ' + base + ' has no ' + p + ' purchase list to copy rows from [T].'); return; }
  const rd = GB.readList(bt, brel), bl = bt.split(/\r?\n/), beol = eolOf(bt), stages = [];
  for (const st of rd.stages) {
    const us = [];
    for (const u of st.units) {
      const c = mine.find(z => lc(z.oldId) === lc(u.unit)), line = bl[(u.line || 0) - 1] || '';
      if (!c) continue;
      const re = new RegExp('unit\\s*=\\s*"' + esc(u.unit) + '"');
      if (!re.test(line) || !/^\s*\{/.test(line) || /^\s*--/.test(line)) { notes.push('Bots: the row of ' + u.unit + ' in ' + brel + ' is not one plain line, so it is not copied; bots of ' + tag + ' do not buy ' + c.newId + ' [T].'); continue; }
      us.push(line.replace(re, 'unit = "' + c.newId + '"'));
    }
    if (us.length) stages.push({ repeat: st.repeat == null ? 0 : st.repeat, us });
  }
  if (!stages.length) { notes.push('Bots of ' + tag + ' buy nothing in ' + p + ': ' + brel + ' has no row for the picked cards, so no list is written and the bot prints "Module does not exist" (modes/utility.lua) [T].'); return; }
  const key = p + '.' + tag, lines = ['Purchases["' + key + '"] = {'];
  for (const s of stages) lines.push('\t{Repeat = ' + s.repeat + ',', '\t\tUnits = {', ...s.us, '\t\t},', '\t},');
  lines.push('}', '');
  const text = lines.join(beol), nrel = 'script/multiplayer/units/' + tag + '/' + p + '.' + tag + '.lua', chk = GB.readList(text, nrel);
  const got = [].concat(...chk.stages.map(s => s.units.map(u => u.unit)));
  if (chk.notRead.length || got.length !== stages.reduce((n, s) => n + s.us.length, 0)) throw bad('Internal check: the new bot list ' + nrel + ' does not read back (' + JSON.stringify(chk.notRead.slice(0, 2)) + ').', 500);
  put('resource/' + nrel, text);
  rows.push({ file: 'resource/' + nrel, what: 'bots buy ' + got.join(', ') });
  const miss = mine.filter(c => !got.includes(c.newId)).map(c => c.newId);
  if (miss.length) notes.push('Bots of ' + tag + ' in ' + p + ' never buy ' + miss.join(', ') + ': ' + brel + ' has no row for the cards they copy [T].');
}

// cards of other armies copied into an existing army tag. spec {tag, cards: ['<army>:<id>@<period>']}
// -> {files, rows, notes, cards, clones}: the mod copies of units_<tag>.set and inf_<tag>.set with the new cards and soldiers added
function adopt(g, spec) {
  const tag = lc(spec.tag);
  if (!TAG.test(tag) || !g.read(ARMIES + tag + '.set')) throw bad('Gates of Hell (or your mod) has no army ' + tag + '. Pick one from the list.');
  const picks = [...new Set((spec.cards || []).map(String))];
  if (!picks.length) throw bad('Pick at least one card of another army.');
  if (picks.length > 300) throw bad('Pick at most 300 cards.');
  for (const p of picks) { const m = PICK.exec(p); if (!m || !m[1]) throw bad('A card of another army is picked as <army>:<card id>@<period>: ' + p); }
  const { byP, clones } = rewriteAll(g, picks, '', tag, { cloned: !!spec.cloned });
  const files = new Map(), rows = [], notes = [], put = (rel, text) => files.set(rel, Buffer.isBuffer(text) ? text : Buffer.from(text, 'latin1')), potRows = [];
  for (const p of PERIODS) {
    const cs = byP.get(p); if (!cs) continue;
    const uk = UNITS + p + '/units_' + tag + '.set', ik = UNITS + p + '/inf_' + tag + '.set', ut = str(g, uk), it = str(g, ik);
    if (!ut || !it) throw bad('Army ' + tag + ' has no ' + p + ' lists (' + (ut ? ik : uk) + '), so its ' + p + ' cards have no place. Pick cards of another period.');
    const rk = UNITS + 'roster_' + p + '.set', rt = str(g, rk) || '';
    if (!new RegExp('\\(\\s*include\\s+"' + esc(p) + '/units_' + esc(tag) + '\\.set"', 'i').test(rt)) throw bad(rk + ' does not include ' + p + '/units_' + tag + '.set, so the game would not read cards added there.');
    const add = soldiers(g, p, tag, needOf(cs), it, null, put, files);
    if (add.length) {
      const ieol = eolOf(it), body = it.replace(/(\r?\n)*$/, '');
      put(ik, body + ieol + '; ARSENAL: soldiers for cards of other armies' + ieol + add.join(ieol) + ieol);
      rows.push({ file: ik, what: add.length + ' soldier lines' });
    }
    const ueol = eolOf(ut), ub = [ut.replace(/(\r?\n)*$/, ''), '', '; ARSENAL: cards copied from other armies'];
    for (const c of cs) { ub.push(...c.text.split('\n'), ''); rows.push({ file: uk, what: c.src + ':' + c.oldId + ' -> ' + c.newId + (c.clone ? ' (unit copied)' : '') }); }
    const ut2 = ub.join(ueol);
    put(uk, ut2);
    readBack(ut2, p, tag, cs);
    potRows.push(...nameRows(g, cs));
    notes.push('Cards ' + cs.map(c => c.src + ':' + c.oldId + ' -> ' + c.newId).join(', ') + ' are copied into ' + uk + ' with side(' + tag + '); their soldiers are ' + tag + '\'s own where it has a soldier of that name, else copied from the army the card came from. Bots of ' + tag + ' do not buy them until the bots question adds them. Buy one in a test match [T].');
  }
  if (potRows.length) {
    const pk = TEXT_DIR + 'zz_arsenal_army_' + tag + '.pot', old = str(g, pk);
    const have = new Set(old ? [...old.matchAll(/msgctxt\s+"([^"]*)"/g)].map(m => lc(m[1])) : []);
    const fresh = potRows.filter(r => !have.has(lc(/msgctxt "([^"]*)"/.exec(r)[1])));
    if (fresh.length) { put(pk, (old ? old.replace(/\n*$/, '\n\n') : potHead) + fresh.join('\n')); rows.push({ file: pk, what: fresh.length + ' card names' }); }
  }
  const cn = cloneNote(tag, clones); if (cn) notes.push(cn);
  const cards = [].concat(...[...byP.values()].map(cs => cs.map(c => ({ oldId: c.oldId, newId: c.newId, period: c.period, doctrine: c.doctrine, src: c.src }))));
  return { files, rows, notes, cards, clones };
}

// write files into the mod: write guard, every target guarded inside the mod, a restore point per file, then the files (temp + rename)
function writeAll(ctx, mod, dir, files, purpose, label) {
  const rels = [...files.keys()];
  const why = require('../../../../lib/writeguard').refuseWrite(mod, { game: dir, purpose });
  if (why) throw bad(why);
  if (ctx.job) ctx.job.writes = true;
  const MW = require('../../../../lib/modwrite');
  try { for (const rel of rels) MW.guardFile(mod, path.join(mod, ...rel.split('/')), { game: dir }); } catch (e) { throw bad(e.message); }
  const restore = MW.restorePoints(mod, rels, label, { game: dir });
  MW.writeFiles(mod, [...files], { game: dir });
  return { restore, undo: MW.restoreRoot(mod) };
}
function routeCtx(ctx, b) {
  const mod = require('../../bots/lib').checkMod(ctx, b.mod);
  let dir = null; try { dir = require('./skin.goh').gohDirOf(ctx); } catch (e) { dir = null; }
  if (!dir) throw badK('task.army.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top).');
  return { mod, dir, g: require('../../units/server').lib.newCtx(dir, mod, true, 'goh') };
}
// own route: POST /api/x/task/r/army/gohmake {mod, army, base, id, alliance, cards, flag, write}: the dry run names every file.
// The unit copies (clones) are gen clone ops of the task, written before this route runs; the answer names them
async function makeRoute(url, b, ctx) {
  b = b || {};
  const { mod, dir, g } = routeCtx(ctx, b);
  const r = plan(g, { tag: b.army, base: b.base, id: b.id, alliance: b.alliance, cards: Array.isArray(b.cards) ? b.cards : [], flag: b.flag, cloned: !!b.write });
  const rels = [...r.files.keys()], out = { ok: true, files: rels, rows: r.rows, notes: r.notes, cards: r.cards, clones: r.clones };
  if (!b.write) return out;
  return Object.assign(out, { wrote: true }, writeAll(ctx, mod, dir, r.files, 'make a new army', 'task-army-gohmake'));
}
// own route: POST /api/x/task/r/army/gohadopt {mod, army, cards, write}: cards of other armies into army
async function adoptRoute(url, b, ctx) {
  b = b || {};
  const { mod, dir, g } = routeCtx(ctx, b);
  const r = adopt(g, { tag: b.army, cards: Array.isArray(b.cards) ? b.cards : [], cloned: !!b.write });
  const rels = [...r.files.keys()], out = { ok: true, files: rels, rows: r.rows, notes: r.notes, cards: r.cards, clones: r.clones };
  if (!b.write) return out;
  return Object.assign(out, { wrote: true }, writeAll(ctx, mod, dir, r.files, 'copy cards into an army', 'task-army-gohadopt'));
}

// lookup: a card of the base army in any period (<card id>@<period>), for the first cards of a new army
function lookBase(g, base, words) {
  const w = lc(words).trim();
  return K().cardsOf(g, base, '').filter(x => !w || lc(x.cat).includes(w)).map(x => ({ id: x.cat + '@' + x.listPeriod, name: '', where: x.key, ref: { key: x.key },
    sub: x.listPeriod + (x.tab ? ', tab ' + x.tab : '') + (x.doctrine ? ', doctrine ' + x.doctrine : '') }));
}
// lookup: a card of any other army in any period (<army>:<card id>@<period>), early, mid and late lists only
function lookOther(g, me, armies, words) {
  const w = lc(words).trim(), out = [];
  for (const a of armies) {
    if (a === me) continue;
    for (const x of K().cardsOf(g, a, '')) if (!w || lc(x.cat).includes(w) || lc(a).includes(w)) out.push({ id: a + ':' + x.cat + '@' + x.listPeriod, name: '', where: x.key, ref: { key: x.key, army: a },
      sub: a + ', ' + x.listPeriod + (x.tab ? ', tab ' + x.tab : '') + (x.doctrine ? ', doctrine ' + x.doctrine : '') });
    if (out.length > 2000) break;
  }
  return out;
}

module.exports = { plan, adopt, makeRoute, adoptRoute, routeCtx, writeAll, lookBase, lookOther, alliances, dlcArmies, defines, rewriteCard, plainFlag, plainTga, plainPng, PERIODS, PICK, ALLY };
