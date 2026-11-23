#!/usr/bin/env node
// lnglayout: lint a mod's split localization folder (made by tools/lngsplit) against its written layout rules
//   (localization/README.md "Where a key goes", "Context lines", "Rules for writing groups"). rows LOC-03 LOC-04 LOC-13 LOC-21
// usage: node tools/lnglayout/lnglayout.js <modDir> --game <dir> [--exe mowas_2|as64] [--loc <textFolder>] [--json f] [--only CODE,..]
//          [--cache dir] [--format text|json] [-q]          exit 1 when an error-level finding is left (after --only)
// Layout: a parent = a .lng outside the part folders that holds an (include ..) line (a .lng with none, e.g. mission/single/**,
//   #dlg_ingame_ws1.lng, is skipped). Part folders: <title>/vanilla/**, <title>/mod/**, _dropped/**. Keys/includes: lib/lnginc
//   (LOC-21: includes expanded before keys are read; key = file prefix + groups, lower case LOC-03; a later copy wins LOC-04).
// codes (level):
//   error LAY_PARENT_TEXT    a parent holds a text leaf (rule 1)
//   error LAY_GROUP_TWICE    a group path opened twice in one parent's expanded text (parent or parts) (rule 3)
//   error LAY_PART_LNG       a .lng inside a part folder: the game loads every .lng under the text folder as its own file (rule 6)
//   warn  LAY_INC_UNUSED     an .inc outside _dropped/ that no parent includes
//   error LAY_DROPPED_INCLUDED  a _dropped/ file that some parent includes
//   warn  LAY_INCLUDE_ORDER  in one group block of a parent a mod include comes before a vanilla include
//   error LAY_KEY_BOTH       a key in a vanilla part and in a mod part;  error LAY_KEY_DUP  a key twice among included parts
//   error LAY_VANILLA_EDITED a key of a vanilla/ part whose text differs from the game's, or that the game does not have
//   info  LAY_MOD_SAME       a key of a mod/ part whose text equals the game's (belongs in the vanilla part)
//   warn  LAY_KEY_CASE       a leaf name in a mod part not in lower case (rule 4); a name spelled as vanilla spells it is skipped
//   warn  LAY_FORMAT         per file and kind, with the count: BOM, LF-only line ends, trailing spaces, non-ASCII in a ';' comment,
//                            in a vanilla/mod part: an indented line or a leaf over several lines (rules 2, 5)
//   warn  LAY_WRONG_PART     keys in another part than tools/lngsplit expectedParts() says; one finding per (part, expected part) pair
//   info  LAY_WRONG_PART_SKIPPED  no expectedParts export found (or it failed)
//   warn LAY_CARD_NO_NAME a live buy-list card from the mod's units files with no name text. Engine:
//                            -> GetUnitDescription:
//                            registry units/<name>/desc (set/registry/unit.reg; a text key, returned even when it has no text) ->
//                            breed card: desc/human/<name>, else desc/entity/<name> -> desc/squad/<name> -> the raw key is shown
//   info LAY_CARD_NO_INFO same cards, no info text. : a card whose name loads an entity (a .def
//                            that name) uses info/entity/<info|name> and shows the button anyway when the engine has tech info
//                            (not reported); any other card needs info/squad/<info|name> ({info X} redirect, keys.md)
//   info  LAY_CONTEXT_STALE  a context line '; [new|changed] [first in ]card "x"' above a key names a card no units file has
//   info  LAY_CARD_SUMMARY   cards checked, actor cards, unresolved (a '%' macro argument left in the card's name or {info}; a
//                            vehicle-kind card with no .def of its name; for the info check, an {info X} naming an entity on a
//                            card that is no entity): not reported
//   error LAY_INCLUDE_MISSING  an include that does not resolve (also cycle / too deep / UTF-16 part)
// Texts for the card checks = every key of the mod's text folder (parents expanded, plus .lng files without includes) + vanilla.
// Vanilla = every .lng under resource/interface/text/ of the game vfs (no mods), as lngsplit vanillaKeys.
// Speed: buylist.read is memoised in this process (the one export object lngsplit also calls), so expectedParts and the card
//   checks read the buy list once.
// Author: Imperator_Aug (ARSENAL, ia-8aad135a)
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path');
const lnginc = require('../lib/lnginc'), sdl = require('../lib/sdl'), vfs = require('../lib/vfs');
const { readText } = require('../lib/enc'), { createReport, walkFiles, relPath } = require('../lib/report');

const LEVEL = {
  LAY_PARENT_TEXT: 'error', LAY_GROUP_TWICE: 'error', LAY_PART_LNG: 'error', LAY_INC_UNUSED: 'warn', LAY_DROPPED_INCLUDED: 'error',
  LAY_INCLUDE_ORDER: 'warn', LAY_KEY_BOTH: 'error', LAY_KEY_DUP: 'error', LAY_VANILLA_EDITED: 'error', LAY_MOD_SAME: 'info',
  LAY_KEY_CASE: 'warn', LAY_FORMAT: 'warn', LAY_WRONG_PART: 'warn', LAY_WRONG_PART_SKIPPED: 'info', LAY_CARD_NO_NAME: 'warn',
  LAY_CARD_NO_INFO: 'info', LAY_CONTEXT_STALE: 'info', LAY_CARD_SUMMARY: 'info', LAY_INCLUDE_MISSING: 'error',
};
const TEXT = 'resource/interface/text/';
const lc = s => String(s).toLowerCase();
const HAS_INC = /^[^;"]*(?:"[^"]*"[^;"]*)*\(\s*include\s+"/i;

// part folder of a path under the text folder: 'vanilla' | 'mod' | 'dropped' | null
function partKind(rel) {
  const r = rel.replace(/\\/g, '/');
  if (/^_dropped\//i.test(r)) return 'dropped';
  const m = /^[^/]+\/(vanilla|mod)\//i.exec(r);
  return m ? lc(m[1]) : null;
}

// ---------- game side: vanilla keys (written case + text), entity names, breeds, unit.reg desc ----------
function readGame(gameDir, exe, modDir) {
  const keys = new Map(), defs = new Set(), breeds = new Set(), reg = new Map();
  let regBuf = null;
  if (gameDir) {
    const v = vfs.build({ gameDir, exe });
    for (const [k, rec] of v.files) {
      let m;
      if (k.startsWith(TEXT) && k.endsWith('.lng')) {
        let ks; try { ks = lnginc.readLngKeys(vfs.readRec(rec), k.slice(TEXT.length)); } catch { continue; }
        for (const [lk, e] of ks) keys.set(lk, { key: e.key, txt: e.txt });
      } else if ((m = /^resource\/entity\/.+\/([^/]+)\.def$/.exec(k))) defs.add(lc(m[1]));
      else if ((m = /^resource\/set\/breed\/(.+)\.[^./]+$/.exec(k))) breeds.add(m[1]);
      else if (k === 'resource/set/registry/unit.reg') { try { regBuf = vfs.readRec(rec); } catch { /* none */ } }
    }
    vfs.closeRecs();
  }
  const res = path.join(modDir, 'resource');
  const ent = path.join(res, 'entity'), br = path.join(res, 'set', 'breed'), rf = path.join(res, 'set', 'registry', 'unit.reg');
  if (fs.existsSync(ent)) for (const f of walkFiles(ent, /\.def$/i)) defs.add(lc(path.basename(f, path.extname(f))));
  if (fs.existsSync(br)) for (const f of walkFiles(br, /./)) breeds.add(lc(relPath(br, f).replace(/\.[^./]+$/, '')));
  if (fs.existsSync(rf)) regBuf = fs.readFileSync(rf);
  if (regBuf) {
    const t = sdl.parseLines(readText(regBuf, 'cp1251').lines, () => {});
    for (const u of t.kids) if (u.name && lc(u.name) === 'units') for (const n of u.kids) {
      const d = n.name && n.kids.find(x => x.name && lc(x.name) === 'desc');
      if (d && d.vals[0]) reg.set(lc(n.name), d.vals[0].v);
    }
  }
  return { keys, defs, breeds, reg };
}

// ---------- buylist (memoised on the shared module object) / expectedParts lookup ----------
function buylistMod() {
  const bm = require('../lngsplit/buylist');
  if (!bm.read.__lnglayoutMemo) {
    const orig = bm.read, cache = new Map();
    const memo = o => {
      const k = JSON.stringify([path.resolve(o.modDir || '.'), o.gameDir ? path.resolve(o.gameDir) : '', o.exe || '']).toLowerCase();
      if (!cache.has(k)) cache.set(k, orig(o));
      return cache.get(k);
    };
    memo.__lnglayoutMemo = true;
    bm.read = memo;
  }
  return bm;
}
function findExpectedParts() {
  const dir = path.join(__dirname, '..', 'lngsplit');
  const files = ['lngsplit.js', ...(fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => /\.js$/.test(n) && n !== 'lngsplit.js').sort() : [])];
  for (const n of files) {
    try { const m = require(path.join(dir, n)); if (m && typeof m.expectedParts === 'function') return m.expectedParts; } catch { /* next */ }
  }
  return null;
}

// raw text checks of one file -> { kind: {n, line} }
function formatScan(buf, part) {
  const out = {}, hit = (k, line) => { const e = out[k] || (out[k] = { n: 0, line }); e.n++; };
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) hit('BOM', 1);
  const s = buf.toString('utf8').replace(/^﻿/, '');
  const lines = s.split('\n');
  lines.forEach((raw, i) => {
    const ln = i + 1;
    if (i < lines.length - 1 && !raw.endsWith('\r')) hit('LF-only line end', ln);
    const L = raw.replace(/\r$/, '');
    if (/[ \t]+$/.test(L)) hit('trailing spaces', ln);
    // comment start outside strings
    let j = 0, c = -1;
    while (j < L.length) { const ch = L[j]; if (ch === '"') { j++; while (j < L.length && L[j] !== '"') j += L[j] === '\\' ? 2 : 1; j++; continue; } if (ch === ';') { c = j; break; } j++; }
    if (c >= 0 && /[^\x00-\x7f]/.test(L.slice(c))) hit('non-ASCII in a ; comment', ln);
    if (part && /^[ \t]+\S/.test(L)) hit('indented line', ln);
  });
  return out;
}

// '(include "p")' lines of a parent, with the block instance they sit in
function parentIncludes(lines) {
  const out = []; let depth = 0, inst = 0; const stack = [0];
  lines.forEach((L, i) => {
    let j = 0;
    while (j < L.length) {
      const ch = L[j];
      if (ch === ';') break;
      if (ch === '"') { j++; while (j < L.length && L[j] !== '"') j += L[j] === '\\' ? 2 : 1; j++; continue; }
      if (ch === '{') { depth++; stack.push(++inst); j++; continue; }
      if (ch === '}') { if (stack.length > 1) stack.pop(); depth--; j++; continue; }
      if (ch === '(') { const m = /^\(\s*include\s+"([^"]*)"\s*\)/i.exec(L.slice(j)); if (m) { out.push({ p: m[1], line: i + 1, block: stack[stack.length - 1] }); j += m[0].length; continue; } }
      j++;
    }
  });
  return out;
}

function run(opts) {
  const t0 = Date.now();
  const rep = createReport();
  const only = opts.only && opts.only.length ? new Set(opts.only.map(s => s.toUpperCase())) : null;
  const put = (code, rel, line, msg) => { if (only && !only.has(code)) return; if (LEVEL[code] === 'info') rep.info(rel, line, code, msg); else rep.add(rel, line, code, msg); };
  const modDir = path.resolve(opts.modDir);
  const loc = opts.loc ? path.resolve(opts.loc) : path.join(modDir, 'localization');
  if (!fs.existsSync(loc)) throw new Error('no text folder ' + loc);
  const inMod = !path.relative(modDir, loc).startsWith('..');
  const L = f => relPath(loc, f);                                   // path under the text folder
  const R = f => inMod ? relPath(modDir, f) : path.basename(loc) + '/' + relPath(loc, f);   // shown path
  const stats = { cards: 0, actorCards: 0, unresolved: 0, infoUnresolved: 0, parents: 0, parts: 0 };

  // expectedParts first: it reads the buy list through the memo, the card checks reuse it
  let ep = null, epNote = null;
  const fn = opts.expectedParts !== undefined ? opts.expectedParts : findExpectedParts();
  const wantWrong = !only || only.has('LAY_WRONG_PART') || only.has('LAY_WRONG_PART_SKIPPED');
  if (typeof fn === 'function' && wantWrong) {
    buylistMod();
    try { ep = fn(modDir, { game: opts.gameDir, exe: opts.exe, loc: opts.loc, cache: opts.cache }); }
    catch (e) { epNote = 'expectedParts failed: ' + e.message; }
  } else if (!fn) epNote = 'no expectedParts export in tools/lngsplit/*.js';
  if (epNote && wantWrong) put('LAY_WRONG_PART_SKIPPED', R(loc), 0, epNote + ': part placement not checked');
  const game = opts.game || readGame(opts.gameDir, opts.exe, modDir);
  const van = game.keys;

  const all = walkFiles(loc, /\.(lng|inc)$/i).sort();
  const lngs = all.filter(f => /\.lng$/i.test(f)), incs = all.filter(f => /\.inc$/i.test(f));
  const parents = [], plain = [];
  for (const f of lngs) {
    if (partKind(L(f))) { put('LAY_PART_LNG', R(f), 1, 'a .lng inside a part folder: the game loads every .lng under the text folder as its own file (rule 6, LOC-17); rename it .inc'); continue; }
    const r = readText(f, 'utf8');
    if (!r.fatal && r.lines.some(l => HAS_INC.test(l))) parents.push({ file: f, lines: r.lines }); else plain.push(f);
  }
  stats.parents = parents.length;

  const included = new Map();       // abs lower -> parent rel
  const keys = new Map();           // lkey -> first leaf
  const leaves = [];
  const multiLine = new Map();      // part abs -> {n, line}
  for (const P of parents) {
    const vpath = L(P.file), self = path.resolve(P.file);
    const p = lnginc.parseLng(P.file, vpath, { textDir: loc, resDir: path.join(modDir, 'resource'), onError: (code, msg, at) => {
      if (code === 'DEFINE_SKIPPED') return;
      put('LAY_INCLUDE_MISSING', R(at.file), at.line, `${code}: ${msg} (LOC-21)`);
    } });
    if (p.fatal) { put('LAY_INCLUDE_MISSING', R(P.file), 1, 'parent not readable: ' + p.fatal); continue; }
    for (const f of p.files.slice(1)) { const k = lc(path.resolve(f)); if (!included.has(k)) included.set(k, R(P.file)); }
    const groups = new Map();
    const at = n => p.origin[n.line - 1] || { file: P.file, line: n.line };
    const visit = (n, kp) => {
      if (n.name === null) return;
      const key = kp + n.name, o = at(n), file = path.resolve(o.file);
      if (n.kids.length) {
        const g = lc(key), prev = groups.get(g);
        if (prev) put('LAY_GROUP_TWICE', R(file), o.line, `group "${key}" opened again (first at ${R(prev.file)}:${prev.line}); give the new part one include line inside the first block (rule 3)`);
        else groups.set(g, { file, line: o.line });
        return n.kids.forEach(c => visit(c, key + '/'));
      }
      const strs = n.vals.filter(v => v.t === 's');
      const isParent = file === self;
      if (isParent) { if (strs.length) put('LAY_PARENT_TEXT', R(file), o.line, `parent holds text key "${key}": move it to a part (rule 1)`); return; }
      const rel = L(file), kind = partKind(rel) || 'other';
      if (n.close && n.close.line !== n.line && (kind === 'vanilla' || kind === 'mod')) { const e = multiLine.get(file) || { n: 0, line: o.line }; e.n++; multiLine.set(file, e); }
      leaves.push({ lkey: lc(key), key, name: n.name, txt: strs.map(v => v.v).join(''), file, rel, line: o.line, kind });
    };
    const prefix = lnginc.keyPrefix(vpath);
    for (const t of p.root.kids) { if (!t.name) continue; if (lc(t.name) === 'tags') t.kids.forEach(c => visit(c, prefix)); else visit(t, prefix); }

    // include order inside one block of the parent
    const by = new Map();
    for (const inc of parentIncludes(P.lines)) {
      const tgt = inc.p.startsWith('/') ? inc.p.replace(/^\/interface\/text\//i, '') : path.posix.normalize(path.posix.join(path.posix.dirname(vpath), inc.p.replace(/\\/g, '/')));
      const k = partKind(tgt); if (k !== 'vanilla' && k !== 'mod') continue;
      if (!by.has(inc.block)) by.set(inc.block, []);
      by.get(inc.block).push({ ...inc, k, tgt });
    }
    for (const list of by.values()) {
      const firstMod = list.find(x => x.k === 'mod');
      const lateVan = firstMod && list.find(x => x.k === 'vanilla' && x.line > firstMod.line);
      if (lateVan) put('LAY_INCLUDE_ORDER', R(P.file), firstMod.line, `mod include "${firstMod.p}" comes before vanilla include "${lateVan.p}" (line ${lateVan.line}) in the same group: the vanilla part goes first`);
    }
  }

  // unused / dropped includes, part .lng
  for (const f of incs) {
    const k = lc(path.resolve(f)), kind = partKind(L(f));
    if (kind === 'dropped') { if (included.has(k)) put('LAY_DROPPED_INCLUDED', R(f), 1, `parked file is included by ${included.get(k)}: _dropped/ keys must stay unloaded (bring a key back by moving its line into a mod/ part)`); }
    else if (!included.has(k)) put('LAY_INC_UNUSED', R(f), 1, 'no parent includes this .inc: the engine reads none of its keys (LOC-21)');
    else stats.parts++;
  }

  // keys: duplicates, vanilla compare, case
  for (const l of leaves) {
    const prev = keys.get(l.lkey);
    if (prev) {
      const both = new Set([prev.kind, l.kind]);
      if (both.has('vanilla') && both.has('mod')) put('LAY_KEY_BOTH', R(l.file), l.line, `"${l.key}" is in a vanilla part (${R(prev.file)}:${prev.line}) and a mod part: the later copy wins and logs a redefinition (LOC-04); keep only the mod copy`);
      else put('LAY_KEY_DUP', R(l.file), l.line, `"${l.key}" again (first ${R(prev.file)}:${prev.line}${prev.key !== l.key ? `, case-only "${prev.key}"` : ''}): the later copy wins (LOC-03, LOC-04)`);
      continue;
    }
    keys.set(l.lkey, l);
    const v = van.get(l.lkey);
    if (l.kind === 'vanilla') {
      if (!v) put('LAY_VANILLA_EDITED', R(l.file), l.line, `"${l.key}" is in a vanilla part but the game has no such key: move it to the mod part`);
      else if (v.txt !== l.txt) put('LAY_VANILLA_EDITED', R(l.file), l.line, `"${l.key}" text differs from the game's: move it to the '; changed from vanilla' block of the mod part (rule 8)`);
    } else if (l.kind === 'mod') {
      if (v && v.txt === l.txt) put('LAY_MOD_SAME', R(l.file), l.line, `"${l.key}" has the game's own text: it belongs in the vanilla part`);
      if (l.name !== lc(l.name) && !(v && v.key.slice(v.key.lastIndexOf('/') + 1) === l.name)) put('LAY_KEY_CASE', R(l.file), l.line, `key "${l.name}" not in lower case (rule 4; the engine lower-cases keys, LOC-03)`);
    }
  }

  // file format
  const fmtFiles = [...parents.map(P => ({ f: P.file, part: false })), ...incs.filter(f => included.has(lc(path.resolve(f))) || partKind(L(f)) === 'dropped').map(f => ({ f, part: ['vanilla', 'mod'].includes(partKind(L(f))) }))];
  for (const { f, part } of fmtFiles) {
    const res = formatScan(fs.readFileSync(f), part);
    const ml = multiLine.get(path.resolve(f)); if (ml) res['leaf over several lines'] = ml;
    for (const [kind, e] of Object.entries(res)) put('LAY_FORMAT', R(f), e.line, `${kind}: ${e.n} line${e.n > 1 ? 's' : ''}${e.n > 1 ? ', first here' : ''} (rules 2, 5: UTF-8 no BOM, CRLF, no trailing spaces, ASCII comments, one unindented leaf per line)`);
  }

  // part placement
  if (ep) {
    const pairs = new Map();
    for (const l of keys.values()) {
      if (l.kind !== 'vanilla' && l.kind !== 'mod') continue;
      const e = ep.get(l.lkey);
      if (!e || e.renameTo || e.kind === 'copied' || !e.part) continue;
      if (lc(e.part) === lc(l.rel)) continue;
      const k = l.rel + '\u0000' + e.part;
      if (!pairs.has(k)) pairs.set(k, { l, part: e.part, n: 0 });
      pairs.get(k).n++;
    }
    for (const { l, part, n } of pairs.values()) put('LAY_WRONG_PART', R(l.file), l.line, `${n} key${n > 1 ? 's' : ''} here belong in ${part} by the layout (lngsplit expectedParts), e.g. "${l.key}"`);
  }

  // buy-list cards and context lines
  const wantCards = !only || ['LAY_CARD_NO_NAME', 'LAY_CARD_NO_INFO', 'LAY_CONTEXT_STALE', 'LAY_CARD_SUMMARY'].some(c => only.has(c));
  if (wantCards && (opts.gameDir || opts.buylist)) {
    const bl = opts.buylist || buylistMod().read({ modDir, gameDir: opts.gameDir, exe: opts.exe, breeds: game.breeds });
    // texts: expanded parents + plain .lng (top-level copies) + vanilla
    const has = new Set([...van.keys(), ...keys.keys()]);
    for (const f of plain) { try { for (const lk of lnginc.readLngKeys(f, L(f)).keys()) has.add(lk); } catch { /* skip */ } }
    for (const c of bl.cards) {
      if (!(c.button || (c.also || []).some(a => a.button))) continue;
      const wf = c.where && c.where.file;
      if (!wf || !fs.existsSync(path.join(modDir, wf))) continue;     // a vanilla card: not the mod's
      stats.cards++;
      const name = c.lname, info = c.info ? lc(c.info) : null;
      if (/%/.test(name) || (info && /%/.test(info))) { stats.unresolved++; continue; }
      const actor = game.defs.has(name);
      if (!actor && c.kind === 'vehicle' && !c.breed) { stats.unresolved++; continue; }
      const loc0 = wf.replace(/\\/g, '/');
      // name
      const rk = game.reg.get(name);
      if (rk !== undefined) {
        if (!has.has(lc(rk))) put('LAY_CARD_NO_NAME', loc0, c.where.line, `card "${c.name}" (${c.side || '?'}/${c.button || '?'}): unit.reg units/${c.name}/desc names "${rk}", which has no text: the raw key shows`);
      } else {
        const tries = [c.breed ? 'desc/human/' + name : 'desc/entity/' + name, 'desc/squad/' + name];
        if (!tries.some(k => has.has(k))) put('LAY_CARD_NO_NAME', loc0, c.where.line, `card "${c.name}" (${c.side || '?'}/${c.button || '?'}) has no name text: none of ${tries.join(', ')} exists, the button shows "desc/squad/${c.name}"`);
      }
      // info
      if (actor) { stats.actorCards++; continue; }
      // {info X} naming an entity on a card that is no entity (how-macro cards: {info %c2}): vanilla writes info/entity/X for these,
      // the button code reads info/squad/X; which one shows is not settled [T] -> unresolved, not reported
      if (info && game.defs.has(info)) { stats.infoUnresolved++; continue; }
      const ik = 'info/squad/' + (info || name);
      if (!has.has(ik)) put('LAY_CARD_NO_INFO', loc0, c.where.line, `card "${c.name}" (${c.side || '?'}/${c.button || '?'}) has no info text ${ik}: no info button`);
    }
    put('LAY_CARD_SUMMARY', R(loc), 0, `${stats.cards} live buy-list cards of the mod checked, ${stats.actorCards} entity cards (info from engine tech data, not checked), ${stats.unresolved} unresolved (macro argument or vehicle card with no .def), ${stats.infoUnresolved} more with info unresolved ({info X} names an entity, card is none): not reported`);
    // context lines
    const known = new Set([...bl.cards.map(c => c.lname), ...(bl.commented || []).map(c => c.lname)]);
    for (const f of incs) {
      if (!included.has(lc(path.resolve(f)))) continue;
      const k = partKind(L(f)); if (k !== 'mod') continue;
      const ls = readText(f, 'utf8').lines;
      ls.forEach((s, i) => {
        const m = /^;\s*\[(?:new|changed)\]\s+(?:first in )?card "([^"]+)"/.exec(s);
        if (!m || !/^\{/.test(ls[i + 1] || '')) return;
        if (!known.has(lc(m[1]))) put('LAY_CONTEXT_STALE', R(f), i + 1, `context line names card "${m[1]}", which no units file has now (rename or removed card?)`);
      });
    }
  }
  rep.stats = { ...stats, keys: keys.size, ms: Date.now() - t0, expectedParts: !!ep };
  return rep;
}

// JSON with this tool's levels (error | warning | note)
function toJSON(rep) {
  const j = rep.toJSON({ tool: 'lnglayout' });
  const sev = c => ({ error: 'error', warn: 'warning', info: 'note' })[LEVEL[c] || 'error'];
  for (const f of j.findings) f.severity = sev(f.code);
  for (const f of j.info || []) f.severity = 'note';
  j.stats = rep.stats;
  return j;
}
const errorCount = rep => rep.toJSON({ tool: 'lnglayout' }).findings.filter(f => (LEVEL[f.code] || 'error') === 'error').length;

module.exports = { run, toJSON, errorCount, partKind, formatScan, parentIncludes, LEVEL };

if (require.main === module) require('../lib/cli').run(() => {
  const cli = require('../lib/cli');
  const o = cli.parse(process.argv.slice(2), { values: ['--loc', '--json', '--only', '--cache'] });
  if (!o.pos[0]) { console.error('usage: node lnglayout.js <modDir> --game <dir> [--exe mowas_2|as64] [--loc <textFolder>] [--json f] [--only CODE,..] [-q]'); process.exit(2); }
  const rep = run({ modDir: o.pos[0], gameDir: o.gameDir, exe: o.exe, loc: o.x.loc, cache: o.x.cache, only: o.x.only ? o.x.only.split(',').filter(Boolean) : null });
  if (o.x.json) fs.writeFileSync(o.x.json, JSON.stringify(toJSON(rep), null, 1));
  if (o.format === 'json') console.log(JSON.stringify(toJSON(rep), null, 1));
  else cli.printReport(rep, o, { tool: 'lnglayout' });
  process.exitCode = errorCount(rep) ? 1 : 0;
});
