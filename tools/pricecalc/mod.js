// pricecalc/mod: reads a mod's FINAL (macro-expanded) breed stats, price rows, squad cards, veterancy rank effects and the
// stuff index used to classify items. All reads go through lib/sdlset (mod folder over the game vfs) + lib/sdlx (expansion).
//   createModSource({modDir, gameDir}) -> src (sdlset source)
//   readBreed(src, side, breed) -> null (no file) | { key, errs[], perks{}, flags[], level skills, vet{scores[5], rank, undefinedPair},
//                                   items[{name, count, weapon}], armor{head, body} }
//   readVetEffects(src) -> [null, {health,..,weapon_skill}, ...] index = rank 1..5 (from set/ability/veterancy.set)
//   readPriceRows(src) -> { file, abs, rows[{line, side, breed, level, cp, score, cw}], levels Map name->{cp,score,cw,line,endLine}, lastDefineEnd }
//   readCards(src) -> [{file, abs, line, name, side, macro, members[{side,breed,count}], phantom[], vehicles[], cost, sequence, icon, group,
//                       button (lower case | null), tags[] (lower case words of {tags}), fore (number | null)}]
//   readEconomy(src) -> {budgets[{name, res, buttons[], start, tag}], ...} what each buy-panel button is paid with: the {budgets} of the
//                       game mode files set/multiplayer/games/*.set|*.inc (mod over game), read by tools/balance/lib economy (budget
//                       "vehicle" = mp, "hero" = sp, any other budget keeps its own name). resOf(card, eco) -> 'mp' | 'sp' | name
//   stuffIndex(src) -> Map basename -> [stuff key...]   resolveItem(idx, name) -> {key, cat, path} | null
// Author: Imperator_Aug (ARSENAL, ia-8b2e19a2)
const fs = require('fs'), path = require('path');
const sdlset = require('../lib/sdlset'), sdlx = require('../lib/sdlx');

const UNITS = 'resource/set/multiplayer/units/';
const PHANTOM = /^\d+$|%/;

function createModSource(o) {
  return sdlset.createSource({ gameDir: o.gameDir || undefined, folder: o.modDir });
}

const val = t => !t ? null : t.k === 'STRING' ? t.value : t.k === 'INTEGER' || t.k === 'FLOAT' ? t.value : t.text;
const nameOf = n => n && n.items && n.items.length ? val(n.items[0]) : null;
// inline (mod "mp" ...) content (multiplayer loads with SDL mod "mp" on); other mods dropped
function flat(items) {
  const out = [];
  for (const it of items) {
    if (it.k === 'MOD') { const on = String(it.name).toLowerCase() === 'mp'; if (on !== !!it.not) out.push(...flat(it.items)); }
    else out.push(it);
  }
  return out;
}
const blocks = items => flat(items).filter(i => i.k === 'BLOCK');
const kid = (n, nm) => blocks(n.items).find(b => String(nameOf(b)).toLowerCase() === nm);

function readKey(src, key, errs, defines) {
  const b = src.get(key);
  if (!b) return null;
  return sdlx.read(b, { file: key, key, open: src.open, defines, onError: (f, l, c, m) => errs.push({ file: f, line: l, code: c, msg: m }) });
}

const pct = v => typeof v === 'string' && /%$/.test(v) ? parseFloat(v) / 100 : v;
function perkValue(b) {
  const it = flat(b.items).slice(1);
  if (!it.length) return true;
  const v = val(it[0]);
  if (typeof v === 'string' && /^lvl_\d+$/i.test(v)) return parseInt(v.slice(4), 10);
  return pct(v);
}

// expected count of {item "x" centre spread}: engine draws round(centre + uniform(-spread, spread)) (= floor(x + 0.5)), never below 0
function expectedCount(c, s) {
  const f = x => Math.max(0, Math.floor(x + 0.5));
  if (!s) return f(c);
  const lo = c - Math.abs(s), hi = c + Math.abs(s);
  let acc = 0, x = lo;
  while (x < hi) {
    const k = Math.floor(x + 0.5), next = Math.min(hi, k + 0.5);
    acc += Math.max(0, k) * (next - x); x = next;
  }
  return acc / (hi - lo);
}

function readBreed(src, side, breed) {
  const key = 'resource/set/breed/mp/' + side + '/' + breed + '.set';
  const errs = [];
  let r;
  try { r = readKey(src, key, errs); } catch (e) { errs.push({ file: key, line: 0, code: 'CRASH', msg: e.message }); r = null; }
  if (!r) return errs.length ? { key, errs, broken: true, perks: {}, items: [], vet: { scores: [], rank: 0 }, armor: {} } : null;
  const root = blocks(r.root.items).find(b => String(nameOf(b)).toLowerCase() === 'breed') || r.root;
  const out = { key, errs, perks: {}, items: [], armor: {}, vet: { scores: [null, null, null, null, null], rank: 0, undefinedPair: null }, line: root.line };
  const perks = kid(root, 'perks');
  if (perks) for (const b of blocks(perks.items)) { const n = String(nameOf(b)).toLowerCase(); out.perks[n] = perkValue(b); }
  const vet = kid(root, 'veterancy');
  if (vet) for (const b of blocks(vet.items)) {
    const m = /^lvl_(\d)$/i.exec(String(nameOf(b)));
    if (m) { const v = val(flat(b.items)[1]); out.vet.scores[+m[1] - 1] = typeof v === 'number' ? v : null; }
  }
  // start rank = highest rank whose score is already reached at 0 (-1 always, 0 at once)
  for (let i = 0; i < 5; i++) if (out.vet.scores[i] !== null && out.vet.scores[i] <= 0) out.vet.rank = i + 1;
  const und = errs.find(e => e.code === 'MACRO_UNDEFINED' && /vet_/i.test(e.msg));
  if (und) out.vet.undefinedPair = und.msg;
  if (vet && !out.vet.scores.some(x => x !== null) && !und) out.vet.empty = true;
  const arm = kid(root, 'armors');
  if (arm) for (const b of blocks(arm.items)) out.armor[String(nameOf(b)).toLowerCase()] = val(flat(b.items)[1]);
  const inv = kid(root, 'inventory');
  if (inv) for (const b of blocks(inv.items)) {
    if (String(nameOf(b)).toLowerCase() !== 'item') continue;
    const it = flat(b.items).slice(1).map(val);
    const name = String(it[0] || '').trim();
    if (!name) continue;
    let count = 1, weapon = false;
    if (it[1] === 'filled' || it[1] === 'filling') { weapon = true; count = 1; }
    else if (typeof it[1] === 'number' && typeof it[2] === 'number') count = expectedCount(it[1], it[2]);
    else if (typeof it[1] === 'number') count = Math.max(0, it[1]);
    out.items.push({ name: name.toLowerCase(), count, weapon, line: b.line });
    if (it[1] === 'filling' && typeof it[2] === 'string' && typeof it[3] === 'number') out.items.push({ name: it[2].toLowerCase(), count: it[3], weapon: false, loaded: true, line: b.line });
  }
  return out;
}

function readVetEffects(src) {
  const errs = [], r = readKey(src, 'resource/set/ability/veterancy.set', errs);
  const ranks = [null, null, null, null, null, null];
  if (!r) return { ranks, missing: true };
  for (const b of blocks(r.root.items)) {
    const m = /^lvl_(\d)$/i.exec(String(nameOf(b)));
    if (!m) continue;
    const e = {};
    for (const c of blocks(b.items)) { const v = val(flat(c.items)[1]); if (typeof v === 'number') e[String(nameOf(c)).toLowerCase()] = v; }
    ranks[+m[1]] = e;
  }
  return { ranks, missing: false };
}

// soldiers.set: rows {"mp/<side>/<breed>" ("level_N" side(x))} on one line; level defines (define "level_N" ... {cp}{score}{cw} ...)
function readPriceRows(src, name) {
  const key = UNITS + (name || 'soldiers.set');
  const abs = src.local.get(key) || null;
  const buf = src.get(key);
  if (!buf) return null;
  const text = buf.toString('latin1'), lines = text.split(/\r?\n/);
  const errs = [];
  const r = sdlx.read(buf, { file: key, key, open: src.open, onError: (f, l, c, m) => errs.push({ file: f, line: l, code: c, msg: m }) });
  const levels = new Map();
  // price levels: RobZ names them level_N; vanilla uses any define name ("tankman", "sniper"): every define a row names counts
  const used = new Set();
  for (const l of lines) { const m = /^\s*\{\s*"mp\/[^"]+"\s*\(\s*"([^"]+)"/i.exec(l); if (m) used.add(m[1]); }
  const isLevel = nm => /^level_/i.test(nm) || used.has(nm);
  for (const [nm] of r.defines) if (isLevel(nm)) levels.set(nm, { name: nm });
  // define extents + their field values from the raw text (body may be multi-line)
  let lastDefineEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*\(define\s+"([^"]+)"/.exec(lines[i]);
    if (!m || !isLevel(m[1])) continue;
    let j = i, depth = 0, body = '';
    for (; j < lines.length; j++) {
      const ln = lines[j].replace(/;.*$/, '');
      body += ln + '\n';
      for (const ch of ln) { if (ch === '(') depth++; else if (ch === ')') depth--; }
      if (depth <= 0 && j > i) break;
      if (depth <= 0 && j === i && /\)\s*$/.test(ln)) break;
    }
    const num = f => { const mm = new RegExp('\\{\\s*' + f + '\\s+(-?[0-9.]+)').exec(body); return mm ? parseFloat(mm[1]) : null; };
    const lv = levels.get(m[1]) || { name: m[1] };
    Object.assign(lv, { cp: num('cp'), score: num('score'), cw: num('cw'), line: i + 1, endLine: j + 1 });
    levels.set(m[1], lv);
    lastDefineEnd = Math.max(lastDefineEnd, j + 1);
  }
  const rows = [], unknown = [];
  for (const b of blocks(r.root.items)) {
    const nm = nameOf(b);
    const m = /^mp\/([^/]+)\/(.+)$/i.exec(String(nm || ''));
    if (!m && b.file === key) unknown.push({ line: b.line, name: String(nm) });
    if (!m || b.file !== key) continue;
    const raw = lines[b.line - 1] || '';
    const lm = /\(\s*"([^"]+)"/.exec(raw);
    const f = {};
    for (const c of blocks(b.items)) { const v = val(flat(c.items)[1]); f[String(nameOf(c)).toLowerCase()] = v; }
    rows.push({ line: b.line, side: m[1].toLowerCase(), breed: m[2].toLowerCase(), level: lm ? lm[1] : null, cp: num0(f.cp), score: num0(f.score), cw: num0(f.cw), raw });
  }
  return { key, file: key, abs, rows, unknown, levels, lastDefineEnd, errs, eol: /\r\n/.test(text) ? '\r\n' : '\n' };
}
const num0 = v => typeof v === 'number' ? v : null;

// content "veh ( mp/s/b:2 mp/s/c )" / "mp/s/b:2" / "* ( ... )" -> members + vehicles
function parseContent(s) {
  const members = [], vehicles = [];
  const toks = String(s).replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').split(/\s+/).filter(Boolean);
  for (const t of toks) {
    if (t === '(' || t === ')') continue;
    const m = /^mp\/([^/:]+)\/([^:]+)(?::(\d+))?$/i.exec(t);
    if (m) members.push({ side: m[1].toLowerCase(), breed: m[2].toLowerCase(), count: m[3] ? +m[3] : 1 });
    else vehicles.push(t.toLowerCase().split(':')[0]);
  }
  return { members, vehicles };
}

// card files: units/<dir>/*.set (RobZ: one file per side, rosters units_*.set include them) plus every top-level units/*.set a
// top-level file includes, and those including files themselves (vanilla: common.set -> squads.set, vehicles.set -> vehicles_<side>.set).
// Each card file is read on its own (includes of other card files are not followed, so no card is read twice); macros come from
// soldiers/squads/vehicles/_macros. cards.layout = { files[], blocks (named blocks seen), unknown[{key, line, name}] (no {content}) }
function readCards(src) {
  const keys = new Set([...src.local.keys()]);
  if (src.v) for (const k of src.v.files.keys()) keys.add(k);
  const units = [...keys].filter(k => k.startsWith(UNITS));
  const sub = units.filter(k => /^[^/]+\/[^/]+\.set$/.test(k.slice(UNITS.length)));
  const top = new Set(units.filter(k => /^[^/]+\.set$/.test(k.slice(UNITS.length))));
  const incOf = k => { const b = src.get(k); if (!b) return []; const out = []; for (const l of b.toString('latin1').split(/\r?\n/)) { const m = /^[^;]*\(\s*include\s+"([^"]+)"/i.exec(l); if (m) out.push(UNITS + m[1].toLowerCase().replace(/\\/g, '/').replace(/^\.\//, '')); } return out; };
  const reach = new Set();
  for (const k of top) { const inc = incOf(k).filter(x => top.has(x)); if (inc.length) { reach.add(k); inc.forEach(x => reach.add(x)); } }
  for (const k of ['soldiers.set', 'years_soldiers.set']) reach.delete(UNITS + k);   // price rows, never cards
  const cardKeys = [...new Set(sub.concat([...reach]))].sort();
  const cand = new Set(cardKeys);
  const defs = new Map(), errs = [];
  for (const k of ['soldiers.set', 'squads.set', 'vehicles.set', 'vehicles_x.set', '_macros.inc']) {
    try { readKey(src, UNITS + k, errs, defs); } catch (e) { /* defects reported by sdllint */ }
  }
  const cards = [];
  cards.layout = { files: cardKeys, blocks: 0, unknown: [] };
  const open = (r, from) => r && cand.has(r.key) ? null : src.open(r, from);
  for (const key of cardKeys) {
    const buf = src.get(key);
    if (!buf) continue;
    const lines = buf.toString('latin1').split(/\r?\n/);
    let r;
    try { r = sdlx.read(buf, { file: key, key, open, defines: new Map(defs), onError: () => {} }); } catch (e) { cards.layout.unknown.push({ key, line: 1, name: 'read failed: ' + e.message }); continue; }
    // a wrapper block ({units ...}) whose children are cards: its children
    const list = [];
    for (const b of blocks(r.root.items)) {
      const inner = kid(b, 'content') ? [] : blocks(b.items).filter(c => kid(c, 'content'));
      if (inner.length) list.push(...inner); else list.push(b);
    }
    for (const b of list) {
      const name = nameOf(b);
      if (typeof name !== 'string') continue;
      cards.layout.blocks++;
      // the call site line in this file
      let line = b.line, v = b.via, fileOk = b.file === key;
      while (v) { if (v.file === key) { line = v.line; fileOk = true; } v = v.via; }
      if (!fileOk) continue;
      const f = {};
      for (const c of blocks(b.items)) { const it = flat(c.items); f[String(nameOf(c)).toLowerCase()] = it.length > 1 ? val(it[1]) : true; }
      if (f.content === undefined) { if (cards.layout.unknown.length < 50) cards.layout.unknown.push({ key, line, name }); continue; }
      const raw = lines[line - 1] || '';
      const mm = /^\s*\(\s*"([^"]+)"/.exec(raw);
      const pc = parseContent(f.content);
      const sm = /\(([^()]*)\)\s*$/.exec(name);
      // side: "name(side)" (RobZ, vanilla squads); else the members' side when they agree (vanilla vehicle cards "storm_mech_ger")
      const ms = [...new Set(pc.members.map(m => m.side))];
      cards.push({ key, abs: src.local.get(key) || null, line, name, side: sm ? sm[1].toLowerCase() : ms.length === 1 ? ms[0] : null, macro: mm ? mm[1] : null,
        // phantom member: a breed name that is a macro-parameter leftover ("%n2", or "302" where %c of c(30) ate the %c2 of an
        // unset c2(): the engine sees "mp/jap/302") [I]; kept apart, never priced
        members: pc.members.filter(m => !PHANTOM.test(m.breed)), phantom: pc.members.filter(m => PHANTOM.test(m.breed)), vehicles: pc.vehicles, cost: typeof f.cost === 'number' ? f.cost : null, sequence: /seq/i.test((mm && mm[1]) || '') || !!f.icon && /seq/i.test(raw),
        icon: f.icon === undefined || f.icon === true ? null : f.icon, group: f.group === undefined || f.group === true ? null : f.group,
        button: typeof f.button === 'string' || typeof f.button === 'number' ? String(f.button).toLowerCase() : null,
        tags: typeof f.tags === 'string' ? f.tags.toLowerCase().split(/\s+/).filter(Boolean) : [], fore: typeof f.fore === 'number' ? f.fore : null, raw, oneLine: !!mm });
    }
  }
  return cards;
}

// the game modes' {budgets}: the same files and skips as tools/balance/balance.js readEconomy (AS2: games/<file> only, bots and the
// test preset left out), so the Balance page and the price calculator name a button's resource the same way
function readEconomy(src) {
  const B = require('../balance/lib');
  const keys = new Set([...src.local.keys()]);
  if (src.v) for (const k of src.v.files.keys()) keys.add(k);
  const texts = [];
  for (const k of [...keys].filter(k => /^resource\/set\/multiplayer\/games\/[^/]+\.(inc|set)$/.test(k) && !/\/(bots_[^/]*|presets_test)\.inc$/.test(k)).sort()) {
    const b = src.get(k); if (!b) continue;
    const t = b.toString('latin1'); if (/budgets|chargeFactors/.test(t)) texts.push(t);
  }
  return B.economy(texts);
}
// by the button only: the tag "hero" alone also sits on manpower cards (RobZ units/axis_minor/squads.set:38, button squad1), and
// chargeFactors "hero=0.90" reads that tag for the cooldown, not for the price
const resOf = (card, eco) => require('../balance/lib').resOf({ button: card.button || '', tags: '' }, eco);

function stuffIndex(src) {
  const keys = new Set([...src.local.keys()]);
  if (src.v) for (const k of src.v.files.keys()) keys.add(k);
  const idx = new Map();
  for (const k of keys) {
    if (!k.startsWith('resource/set/stuff/') || k.includes('/_settings/')) continue;
    const base = k.slice(k.lastIndexOf('/') + 1);
    if (base.startsWith('.') || /\.pattern$/.test(base)) continue;
    const stem = base.split('.')[0];
    if (!idx.has(stem)) idx.set(stem, []);
    idx.get(stem).push(k);
  }
  return idx;
}
// item tag words -> best stuff key: a word equal to a stuff name; ties broken by other words found in the path
function resolveItem(idx, name) {
  const words = String(name).toLowerCase().split(/\s+/).filter(Boolean);
  const cands = [];
  const tryStem = (st, bonus) => { for (const k of idx.get(st) || []) cands.push({ k, score: bonus + words.filter(w => w !== st && k.includes(w)).length }); };
  tryStem(words.join('_'), 10);
  for (const w of words) tryStem(w, w === words[words.length - 1] ? 1 : 0);
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score || a.k.length - b.k.length || (a.k < b.k ? -1 : 1));
  const k = cands[0].k, rel = k.slice('resource/set/stuff/'.length);
  return { key: k, cat: rel.split('/')[0], path: rel };
}

module.exports = { createModSource, readBreed, readVetEffects, readPriceRows, readCards, readEconomy, resOf, stuffIndex, resolveItem, parseContent, expectedCount, UNITS };
