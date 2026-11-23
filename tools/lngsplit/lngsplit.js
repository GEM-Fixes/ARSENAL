#!/usr/bin/env node
// lngsplit: split a mod's big .lng files into a thin parent .lng + small .inc parts pulled in with (include "rel/path.inc"), vanilla keys
//   first, mod keys second; find mod-only text keys nothing uses. rows LOC-01 LOC-03 LOC-04 LOC-10 LOC-17 LOC-21 LOC-22
// usage: node tools/lngsplit/lngsplit.js plan  <modDir> --game <gameDir> [--exe mowas_2|as64] [--only f,..] [--json f] [-q]
//        node tools/lngsplit/lngsplit.js dead  <modDir> --game <gameDir> --out report.tsv [--exe ..] [--only ..] [--json f] [-q]
//        node tools/lngsplit/lngsplit.js split <modDir> --game <gameDir> --out <folder> [--only "#tips.lng"] [--no-park] [--dead-tsv f] [--force]
//        node tools/lngsplit/lngsplit.js join  <folder> [--json f]          key -> text of a localization folder (split or not)
//        node tools/lngsplit/lngsplit.js join  --compare <a> <b> [--minus report.tsv]   exit 1 on any text difference / one-sided key
//   --loc <folder>  text folder to split instead of <modDir>/localization (unit data still from <modDir>/resource)
//   --no-buylist    info.lng and desc.lng mod parts in the old layout (squad/<side>.inc, entity/<class>.inc) instead of the buy-list layout
//   buy-list layout (buylist.js), info.lng and desc.lng: <t>/mod/squad/<side>/<button>.inc, hero/<side>[_entity].inc (hero button wins), vehicle_group/<side>.inc
//     (cards of several entities / copies), entity/<side>/<button>.inc (first appearance), squad|entity/unlisted.inc; keys in units read
//     order with a '; [new|changed] card ..' context line each; desc/entity without a card -> entity/unlisted/<class>.inc; desc/human
//     keeps its side files with a 'first in card ..' line per breed; key paths never change (except --fix-miskeyed renames)
//   --no-fix-miskeyed  keep name(side) keys of bare-named cards (dead.js MISKEYED) as they are; default renames them to the card name
//   --renames-out f    rename report TSV (file, old key, new key, action, note); join --compare --renames f accounts for it
//   --stuff-min N      desc ammo/weapon/stuff groups under N keys (default 3) merge into <group>/other.inc
//   re-split: --loc may be an already split folder (its own parts folder is read through the includes and rewritten, not copied);
//     _dropped/ is carried over, this run's dead keys are appended to _dropped/<title>.inc and dead-keys.tsv, renames to
//     renamed-keys.tsv; a comment line lngsplit did not write (e.g. '; ToE: ..') directly above a key stays directly above it
//   API: expectedParts(modDir, { game, exe, loc, cache, noStuff, stuffMin }) -> Map lowerKey -> { part, kind, group? } (see below)
//   --min-keys N  a top-level .lng under N keys (default 20) is copied unchanged
//   --cache <dir> entityindex cache for dead/split (default: per-user cache folder, lib/toolcache 'lngsplit'); --no-stuff skips stuff
// Reads <modDir>/localization/*.lng (top level). Vanilla = every .lng under resource/interface/text/ of the game vfs (no mods).
// Key = file prefix + group names joined by '/', lower-case (LOC-03, LOC-10 '#' files no title); includes expanded first (LOC-21,
// lib/lnginc); a duplicate key: the later copy wins and is the only one kept (LOC-04, LOC-22). Every .lng under the text root loads
// (LOC-17), so parts are .inc. Never writes into the mod or the game: --out only (refused inside either).
// Layout split writes (inside --out; <F> = title without '#', mission.lng -> mission_multi, any title whose folder exists -> <F>_parts):
//   <title>.lng                      {tags + group skeleton + includes, no text keys; in each group the vanilla parts come first
//   <F>/vanilla/<group path>.inc     keys identical to vanilla (same key AND text), one file per group, path = the key path of the
//                                    group (root group: _root.inc); a group over 400 keys is cut in source order: <path>-1.inc, -2 ..
//   <F>/mod/<group path>.inc         changed keys (block '; changed from vanilla'), then new keys ('; new'), source order in each
//     desc: human/mp/<side>   -> <F>/mod/human/<side>.inc
//           squad <name>(side) -> <F>/mod/squad/<side>.inc, no (side) -> squad/vehicles.inc
//           entity <x>         -> <F>/mod/entity/<class>.inc, class = folder of x's .def under entity/ (the 2nd folder under
//                                 -vehicle/-building/-object/-static, else the 1st), no .def -> misc.inc
//     info: squad by side as desc, entity by class as desc; others generic
//   fold: a group below the top level with no sub-groups, at most 4 keys, all of one kind (vanilla / changed / new) is written whole inside its parent's
//     part ({name / leaves / }) instead of its own file (mission/multi/<map> holds 1 key per map: 293 maps -> 2 files)
//   _dropped/<title>.inc             parked dead keys as nested groups (path below the file prefix), included by nothing
//   copied unchanged: every other file of localization/ (mission/ subfolder, .lng under 20 keys such as #dlg_ingame_ws1.lng,
//     files not named by --only)
// Part text: UTF-8 no BOM, CRLF, no trailing spaces, 2-line ';' header, one {"key" "text"} per line, no indent, leaf text cut from
//   the source line as written (a leaf over several lines is rebuilt from its tokens, a string left open is closed: info LEAF_REBUILT).
// codes: problems INCLUDE_MISSING INCLUDE_CYCLE INCLUDE_DEPTH INCLUDE_FATAL WARN_DEFINE_SKIPPED LNG_SDL (parse error in a
//   source file) LNG_FATAL; info LEAF_REBUILT GROUP_TEXT_DROPPED; split self-check SPLIT_VERIFY (written file not CRLF/UTF-8/parses);
//   join JOIN_TEXT_DIFF JOIN_ONLY_A JOIN_ONLY_B; info JOIN_PARKED, include problems of a joined folder (INCLUDE_*)
// Author: Imperator_Aug (ARSENAL, ia-c77e8c66)
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path');
const lnginc = require('../lib/lnginc'), sdl = require('../lib/sdl'), vfs = require('../lib/vfs'), games = require('../lib/games');
const { createReport, walkFiles, relPath } = require('../lib/report');
const dead = require('./dead'), buylist = require('./buylist'), stuffinfo = require('./stuffinfo');

const FOLD = 4, VMAX = 400, MIN_KEYS = 20, STUFF_MIN = 3;
const lc = s => String(s).toLowerCase();
const TEXT = 'resource/interface/text/';

// ---------- vanilla keys ----------
function vanillaKeys(gameDir, exe) {
  const v = vfs.build({ gameDir, exe });
  const g = new Map();
  for (const [k, rec] of v.files) {
    if (!k.startsWith(TEXT) || !k.endsWith('.lng')) continue;
    let keys; try { keys = lnginc.readLngKeys(vfs.readRec(rec), k.slice(TEXT.length)); } catch { continue; }
    for (const [lk, e] of keys) g.set(lk, e.txt);
  }
  vfs.closeRecs();
  return g;
}

// ---------- raw text of tokens ----------
function rawTok(lines, t) {
  const L = lines[t.line - 1] || '', i = t.col - 1;
  if (t.t === 's') {
    let j = i + 1;
    while (j < L.length) { if (L[j] === '\\' && j + 1 < L.length) j += 2; else if (L[j] === '"') return { raw: L.slice(i, j + 1), ok: true }; else j++; }
    return { raw: '"' + t.v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"', ok: false };
  }
  let j = i; while (j < L.length && !/[ \t\r\n\v\f{}";]/.test(L[j])) j++;
  if (j === i) j++;
  return { raw: L.slice(i, j), ok: true };
}
function leafRaw(lines, n) {
  const toks = [n.nameTok, ...n.vals].filter(Boolean).map(t => rawTok(lines, t));
  const allOk = toks.every(t => t.ok);
  // one line: cut as written (a ';' between the braces can only sit inside a string, a comment would end the line first)
  if (n.close && n.open.line === n.close.line && allOk) return { raw: lines[n.open.line - 1].slice(n.open.col - 1, n.close.col), rebuilt: false };
  // over several lines: the tokens of each source line stay on one line (no indent), so "a" "b" values keep their line split
  const src = [n.nameTok, ...n.vals].filter(Boolean), rows = [];
  src.forEach((t, i) => { if (!i || t.line !== src[i - 1].line) rows.push([]); rows[rows.length - 1].push(toks[i].raw); });
  if (!rows.length) rows.push([]);
  const out = rows.map(r => r.join(' '));
  out[0] = '{' + out[0]; out[out.length - 1] += '}';
  return { raw: out.join('\n'), rebuilt: true };
}
const groupRaw = (lines, n) => n.nameTok ? rawTok(lines, n.nameTok).raw : '';

// count ';' comment lines of a file (outside strings)
function commentLines(lines) {
  let c = 0;
  for (const L of lines) {
    let i = 0;
    while (i < L.length) { const ch = L[i]; if (ch === '"') { i++; while (i < L.length && L[i] !== '"') i += L[i] === '\\' ? 2 : 1; i++; continue; } if (ch === ';') { c++; break; } i++; }
  }
  return c;
}

// ---------- read one source .lng ----------
// comment lines lngsplit writes (headers, sections, context lines); any other comment line directly above a key is foreign and kept
const OURS = /^\s*;\s*(\[(new|changed|vanilla)\]|-- .* --\s*$|changed from vanilla\s*$|new\s*$|mod part|vanilla part|\S+\.lng( mod part)?:|.* : keys (identical to vanilla|this mod changed))/;
function readSource(file, vpath, textDir, resDir, rep, rel) {
  const p = lnginc.parseLng(file, vpath, {
    textDir, resDir,
    onError: (code, msg, at) => rep.add(relOf(at.file, textDir, rel), at.line, code === 'DEFINE_SKIPPED' ? 'WARN_DEFINE_SKIPPED' : code, msg),
    onSdlError: (line, code, msg, at) => { if (code !== 'WARN_ESCAPE') rep.add(at ? relOf(at.file, textDir, rel) : rel, at ? at.line : line, 'LNG_SDL', `${code} ${msg}`); },
  });
  if (p.fatal) { rep.add(rel, 1, 'LNG_FATAL', p.fatal); return null; }
  const leaves = [], gRaw = new Map();
  let order = 0, groupText = 0, rebuilt = 0;
  const prefix = lnginc.keyPrefix(vpath);
  const visit = (n, segs, raws) => {
    const nm = n.name === null ? 'null' : n.name;   // as lnglint readKeys: an unnamed block keys as 'null'
    if (n.kids.length) {
      const s2 = [...segs, lc(nm)], r2 = [...raws, groupRaw(p.lines, n)];
      const gp = s2.join('/');
      if (!gRaw.has(gp)) gRaw.set(gp, r2[r2.length - 1]);
      if (n.vals.some(v => v.t === 's')) { groupText++; const o = p.origin[n.line - 1]; rep.info(relOf(o.file, textDir, rel), o.line, 'GROUP_TEXT_DROPPED', `group "${nm}" carries text; the engine reads it as a group, the text gives no key`); }
      return n.kids.forEach(c => visit(c, s2, r2));
    }
    const o = p.origin[n.line - 1] || { file, line: n.line };
    const lr = leafRaw(p.lines, n);
    // comment lines directly above the leaf that lngsplit did not write (e.g. '; ToE:' notes) travel with the key
    const foreign = [];
    for (let i = n.line - 2; i >= 0; i--) { const L = p.lines[i] || ''; if (!/^\s*;/.test(L)) break; if (!OURS.test(L)) foreign.unshift(L.trim()); }
    if (lr.rebuilt) { rebuilt++; rep.info(relOf(o.file, textDir, rel), o.line, 'LEAF_REBUILT', `leaf "${nm}" spans lines or holds an open string: written as ${lr.raw.slice(0, 60)}`); }
    const key = prefix + [...segs, nm].join('/');
    leaves.push({ segs, name: nm, lname: lc(nm), key, lkey: lc(key), txt: n.vals.filter(v => v.t === 's').map(v => v.v).join(''), raw: lr.raw, foreign, order: order++, line: o.line, file: o.file });
  };
  for (const t of p.root.kids) {
    if (!t.name) continue;
    if (lc(t.name) === 'tags') t.kids.forEach(c => visit(c, [], [])); else visit(t, [], []);
  }
  // later duplicate wins (LOC-04)
  const win = new Map();
  for (const l of leaves) win.set(l.lkey, l);
  const kept = [...win.values()].sort((a, b) => a.order - b.order);
  let srcLines = 0; try { srcLines = fs.readFileSync(file, 'utf8').split('\n').length; } catch {}
  return { leaves: kept, all: leaves.length, dups: leaves.length - kept.length, gRaw, comments: commentLines(p.lines), groupText, rebuilt, prefix, files: p.files, srcLines };
}
function relOf(f, textDir, fallback) {
  if (!f) return fallback;
  const r = path.relative(path.dirname(textDir), f).replace(/\\/g, '/');
  return r.startsWith('..') ? fallback : r;
}

// ---------- file names ----------
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/;
function seg(s) {
  let x = lc(s).replace(/[^a-z0-9_\-]/g, '_');   // include paths: plain ASCII word characters only ('#', '.', '%' are not risked)
  if (!x) x = '_';
  if (RESERVED.test(x.replace(/\..*$/, ''))) x = '_' + x;
  return x;
}
const titleOf = f => path.basename(f, path.extname(f));

// ---------- layout ----------
// src = readSource result; cat per leaf: V same as vanilla, C changed, N new; parked leaves (dead, park) go to _dropped
function layout(src, title, folder, gkeys, o) {
  const { leaves, gRaw } = src;
  for (const l of leaves) l.cat = !gkeys.has(l.lkey) ? 'N' : gkeys.get(l.lkey) === l.txt ? 'V' : 'C';
  const parked = [], live = [];
  for (const l of leaves) (o.park && l.dead ? parked : live).push(l);
  const root = { path: '', raw: null, kids: new Map(), leaves: [], folded: [], incs: [] };
  for (const l of live) {
    let g = root;
    for (let i = 0; i < l.segs.length; i++) {
      const gp = l.segs.slice(0, i + 1).join('/');
      if (!g.kids.has(l.segs[i])) g.kids.set(l.segs[i], { path: gp, raw: gRaw.get(gp) || l.segs[i], kids: new Map(), leaves: [], folded: [], incs: [], parent: g });
      g = g.kids.get(l.segs[i]);
    }
    g.leaves.push(l);
  }
  const special = gp => (title === 'desc' && (/^human\/mp\/[^/]+$/.test(gp) || gp === 'squad' || gp === 'entity')) || (title === 'info' && (gp === 'squad' || gp === 'entity'));
  // fold small single-kind leaf groups into the parent's part (top-level groups always get their own parts)
  const foldWalk = g => {
    for (const [k, c] of [...g.kids]) {
      foldWalk(c);
      if (g.path && !c.kids.size && !c.folded.length && c.leaves.length && c.leaves.length <= FOLD && !special(c.path) && c.leaves.every(l => l.cat === c.leaves[0].cat)) {
        g.kids.delete(k);
        g.folded.push({ group: c, cat: c.leaves[0].cat, order: c.leaves[0].order });
      }
    }
  };
  foldWalk(root);
  const parts = new Map();   // rel path -> { rel, kind:'vanilla'|'mod', label, changed:[items], fresh:[items], items:[], owner }
  const claim = (rel, owner, kind, label) => {
    let r = rel, n = 1;
    while (parts.has(r) && parts.get(r).owner !== owner) r = rel.replace(/\.inc$/, '') + '_' + (++n) + '.inc';
    if (!parts.has(r)) parts.set(r, { rel: r, kind, label, owner, items: [], changed: [], fresh: [] });
    return parts.get(r);
  };
  const gpFile = gp => gp ? gp.split('/').map(seg).join('/') : '_root';
  const BL = (title === 'info' || title === 'desc') && o.bl;
  const sIdx = x => { const i = BL ? o.bl.sides.indexOf(x) : -1; return i < 0 ? 999 : i; }, bIdx = x => { const i = BL ? o.bl.buttons.indexOf(x) : -1; return i < 0 ? 999 : i; };
  const label = b => { const t = o.labels && o.labels.get('mp/scene/hint_' + b); return t ? ` "${t}"` : ''; };
  const blRoute = (gp, it) => {
    const cl = buylist.classify(o.bl, it.leaf.lkey) || { kind: 'unlisted', group: gp, notes: [] };
    if (it.leaf.renamedFrom) cl.notes.unshift(`renamed from "${it.leaf.renamedFrom}"`);
    if (it.leaf.miskeyNote) cl.notes.unshift(it.leaf.miskeyNote);
    const kg = gp, what = `${title}/${kg}/*`;
    const sd = cl.side, bt = cl.button;
    if (cl.kind === 'unlisted' && title === 'desc' && kg === 'entity') {
      const c = dead.entityClass(o.facts, it.leaf.lname);
      return { cl, rel: `entity/unlisted/${seg(c || 'misc')}.inc`, sort: [9], label: `${what} keys no buy-list card names, ${c ? '.def under ' + c : 'no .def'} (source order)` };
    }
    if (cl.kind === 'unlisted') return { cl, rel: `${kg}/unlisted.inc`, sort: [9], label: `${what} keys no MP card names (source order)` };
    if (cl.kind === 'hero') return { cl, rel: kg === 'squad' ? `hero/${seg(sd)}.inc` : `hero/${seg(sd)}_entity.inc`, sort: [1, sIdx(sd), kg === 'squad' ? 0 : 1], sec: 'bg', label: `${what} keys of cards under the hero button${label('hero')}, side ${sd}` };
    if (cl.kind === 'vehicle_group') return { cl, rel: `vehicle_group/${seg(sd)}.inc`, sort: [2, sIdx(sd)], sec: 'bg', label: `${what} keys of cards that group several entities (vehicles with soldiers, copies of units), side ${sd}` };
    return { cl, rel: `${kg}/${seg(sd)}/${seg(bt)}.inc`, sort: [0, sIdx(sd), bIdx(bt)], sec: 'g', label: `${what} keys of ${kg === 'squad' ? 'infantry' : 'vehicle/gun'} cards, side ${sd}, button ${bt}${label(bt)}` };
  };
  const STUFFG = new Set(['ammo', 'weapon', 'stuff']), ST = title === 'desc' && o.stuff;
  const vctx = (gp, it) => {
    if (!it.leaf || !BL) return null;
    if (gp === 'squad' || gp === 'entity') return buylist.contextLine(buylist.classify(o.bl, it.leaf.lkey), 'V');
    if (title === 'desc' && /^human\/mp\/[^/]+$/.test(gp)) return buylist.humanLine(o.bl, gp.slice(6) + '/' + it.leaf.lname, 'V');
    if (ST && STUFFG.has(gp)) return o.stuff.ctx(o.stuff.fileOf(it.leaf.lkey), 'V');
    return null;
  };
  const modRoute = (g, it) => {
    const gp = g.path;
    if (ST && STUFFG.has(gp) && it.leaf) {
      const sr = o.stuff.fileOf(it.leaf.lkey), ctx = o.stuff.ctx(sr, it.cat);
      if (!sr) return { rel: `${gp}/unlisted.inc`, label: `${gp}/* no stuff file gives the key`, ctx, sg: gp };
      return { rel: gp === 'stuff' ? `stuff/${seg(sr.kind)}.inc` : `${gp}/${seg(sr.nation)}/${seg(sr.kind)}.inc`, label: `${gp}/* of stuff ${gp === 'stuff' ? '' : sr.nation + ' '}${sr.kind}`, ctx, sg: gp };
    }
    if (BL && it.leaf && (gp === 'squad' || gp === 'entity')) return blRoute(gp, it);
    if (title === 'desc' && /^human\/mp\/[^/]+$/.test(gp)) return { rel: `human/${seg(gp.split('/')[2])}.inc`, label: `${gp}/*`, ctx: BL && it.leaf ? buylist.humanLine(o.bl, gp.slice(6) + '/' + it.leaf.lname, it.cat) : null };
    if ((title === 'desc' || title === 'info') && gp === 'squad') {
      const m = /\(([^()]*)\)$/.exec(it.lname || '');
      return m ? { rel: `squad/${seg(m[1])}.inc`, label: `squad/*(${m[1]})` } : { rel: 'squad/vehicles.inc', label: 'squad/* without (side)' };
    }
    if ((title === 'desc' || title === 'info') && gp === 'entity') {
      const c = it.lname ? dead.entityClass(o.facts, it.lname) : null;
      return { rel: `entity/${seg(c || 'misc')}.inc`, label: `entity/* (${c ? '.def under ' + c : 'no .def'})` };
    }
    return { rel: gpFile(gp) + '.inc', label: (gp ? gp + '/' : '') + '*' };
  };
  const pfx = src.prefix;
  const assign = g => {
    const items = [...g.leaves.map(l => ({ leaf: l, cat: l.cat, order: l.order, lname: l.lname })), ...g.folded.map(f => ({ fold: f.group, cat: f.cat, order: f.order, lname: null }))].sort((a, b) => a.order - b.order);
    const van = items.filter(i => i.cat === 'V'), mod = items.filter(i => i.cat !== 'V');
    if (van.length) {
      const chunks = Math.ceil(van.length / VMAX);
      for (let c = 0; c < chunks; c++) {
        const base = `${folder}/vanilla/${gpFile(g.path)}`;
        const p = claim(chunks > 1 ? `${base}-${c + 1}.inc` : `${base}.inc`, g, 'vanilla', `${pfx}${g.path ? g.path + '/' : ''}*`);
        p.items.push(...van.slice(c * VMAX, (c + 1) * VMAX).map(it => { const x = vctx(g.path, it); return x ? { ...it, ctx: x } : it; }));
        if (!g.incs.includes(p)) g.incs.push(p);
      }
    }
    const modParts = [];
    const routes = mod.map(it => modRoute(g, it)), nRel = new Map();
    for (const x of routes) if (x.sg) nRel.set(x.rel, (nRel.get(x.rel) || 0) + 1);
    for (const x of routes) if (x.sg && nRel.get(x.rel) < (o.stuffMin ?? STUFF_MIN) && !/unlisted\.inc$/.test(x.rel)) { x.rel = `${x.sg}/other.inc`; x.label = `${x.sg}/* of small stuff groups (under ${o.stuffMin ?? STUFF_MIN} keys each)`; }
    for (const [i, it] of mod.entries()) {
      const r = routes[i];
      const p = claim(`${folder}/mod/${r.rel}`, g, 'mod', r.cl ? `${title}.lng mod part: ` + r.label : pfx + r.label);
      if (r.cl) { p.buylist = true; p.sort = r.sort; p.sec = r.sec; p.items.push({ ...it, cl: r.cl }); }
      else (it.cat === 'C' ? p.changed : p.fresh).push(r.ctx ? { ...it, ctx: r.ctx } : it);
      if (!modParts.includes(p)) modParts.push(p);
    }
    const sk = p => p.sort || [5];
    modParts.sort((a, b) => { const x = sk(a), y = sk(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1); return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0; });
    g.incs.push(...modParts);
    for (const c of g.kids.values()) assign(c);
  };
  assign(root);
  return { root, parts, parked, live };
}

// ---------- text writers ----------
const ascii = s => String(s).replace(/[^\x20-\x7e]/g, '?');
const CRLF = a => a.map(l => l.replace(/[ \t]+$/, '')).join('\r\n') + '\r\n';
function itemLines(it) {
  const fl = l => [...(l.foreign || []), ...l.raw.split('\n')];
  if (it.leaf) return fl(it.leaf);
  const g = it.fold;
  return ['{' + g.raw, ...g.leaves.flatMap(fl), '}'];
}
function buylistText(p) {
  const out = [`; ${ascii(p.label)}`, p.sort && p.sort[0] === 9 ? '; mod part, source order; above each key: [new|changed] and why no buy-list card names it' : '; mod part, buy-list order (units read order); above each key: [new|changed] card, cost, contents, tags, units file:line, notes'];
  const items = p.items.slice().sort((a, b) => (a.cl.order ?? 1e9) - (b.cl.order ?? 1e9) || a.order - b.order);
  let sec = null;
  for (const it of items) {
    const c = it.cl.card;
    if (c && p.sec) { const s = p.sec === 'bg' ? `button ${c.button || '?'}, group ${c.group || '?'}` : `group ${c.group || '?'}`; if (s !== sec) { out.push(`; -- ${ascii(s)} --`); sec = s; } }
    out.push(buylist.contextLine(it.cl, it.cat), ...itemLines(it));
  }
  return CRLF(out);
}
function partText(p) {
  if (p.buylist) return buylistText(p);
  const out = [];
  if (p.kind === 'vanilla') { out.push(`; ${ascii(p.label)} : keys identical to vanilla (same key and text)`, '; vanilla part: do not edit'); for (const it of p.items) out.push(...(it.ctx ? [it.ctx] : []), ...itemLines(it)); }
  else {
    out.push(`; ${ascii(p.label)} : keys this mod changed or added`, '; mod part');
    const ctx = it => it.ctx ? [it.ctx] : [];
    out.push('; changed from vanilla'); for (const it of p.changed) out.push(...ctx(it), ...itemLines(it));
    out.push('; new'); for (const it of p.fresh) out.push(...ctx(it), ...itemLines(it));
  }
  return CRLF(out);
}
function parentText(L, title) {
  const out = [`; ${ascii(title)}.lng: group skeleton and includes only (lngsplit); the texts are in the .inc parts`, '{tags'];
  const w = (g, d) => {
    const ind = '\t'.repeat(d);
    for (const p of g.incs) out.push(`${ind}(include "${p.rel}")`);
    for (const c of g.kids.values()) {
      if (!hasContent(c)) continue;
      out.push(`${ind}{${c.raw}`); w(c, d + 1); out.push(`${ind}}`);
    }
  };
  w(L.root, 1);
  out.push('}');
  return CRLF(out);
}
const hasContent = g => g.incs.length > 0 || [...g.kids.values()].some(hasContent);
function droppedText(L, title, gRaw) {
  const out = [`; ${ascii(title)}.lng: parked dead keys (lngsplit dead), full group path below the file prefix`, '; included by nothing: include this file inside {tags of the parent to bring them back'];
  const root = { kids: new Map(), leaves: [] };
  for (const l of L.parked) {
    let g = root;
    l.segs.forEach((s, i) => { if (!g.kids.has(s)) g.kids.set(s, { raw: gRaw.get(l.segs.slice(0, i + 1).join('/')) || s, kids: new Map(), leaves: [] }); g = g.kids.get(s); });
    g.leaves.push(l);
  }
  const w = g => { for (const l of g.leaves) out.push(...l.raw.split('\n')); for (const c of g.kids.values()) { out.push('{' + c.raw); w(c); out.push('}'); } };
  w(root);
  return CRLF(out);
}

// ---------- written-file check ----------
function verifyText(buf, rel, rep) {
  const bad = m => rep.add(rel, 0, 'SPLIT_VERIFY', m);
  if (buf[0] === 0xEF && buf[1] === 0xBB) bad('BOM');
  const s = buf.toString('latin1');
  if (/(^|[^\r])\n/.test(s) || /\r(?!\n)/.test(s)) bad('line end not CRLF');
  if (/[ \t]\r\n/.test(s)) bad('trailing space');
  const r = require('../lib/enc').readText(buf, 'utf8');
  if (r.badLines.length) bad('not UTF-8 at line ' + r.badLines[0]);
  sdl.parseLines(r.lines, (line, code, msg) => { if (code !== 'WARN_ESCAPE') rep.add(rel, line, 'SPLIT_VERIFY', `${code} ${msg}`); });
}

// ---------- join ----------
const ntfsSort = a => a.sort((x, y) => { const X = x.toUpperCase(), Y = y.toUpperCase(); return X < Y ? -1 : X > Y ? 1 : 0; });
function joinFolder(dir, rep) {
  const files = ntfsSort(walkFiles(dir, /\.lng$/i).map(f => relPath(dir, f)));
  const all = new Map();
  for (const rel of files) {
    const keys = lnginc.readLngKeys(path.join(dir, rel), rel, { textDir: dir, onError: (code, msg, at) => rep && rep.info(relOf(at.file, path.join(dir, 'x'), rel), at.line, code, msg) });
    for (const [lk, e] of keys) all.set(lk, { key: e.key, txt: e.txt, file: e.file ? relPath(dir, e.file) : rel, line: e.line });
  }
  return all;
}
function readMinus(f) {
  const s = new Set();
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/).slice(1)) { const c = line.split('\t'); if (c[3] === 'dead') s.add(lc(c[1])); }
  return s;
}
function compare(a, b, minus, rep) {
  let diff = 0, parked = 0;
  const show = s => JSON.stringify(s.length > 80 ? s.slice(0, 80) + '..' : s);
  for (const [lk, e] of a) {
    const f = b.get(lk);
    if (!f) { if (minus.has(lk)) { parked++; continue; } diff++; rep.add(e.file, e.line, 'JOIN_ONLY_A', `${e.key} only in the first folder`); continue; }
    if (f.txt !== e.txt) { diff++; rep.add(f.file, f.line, 'JOIN_TEXT_DIFF', `${e.key}: ${show(e.txt)} -> ${show(f.txt)}`); }
  }
  for (const [lk, f] of b) if (!a.has(lk)) { diff++; rep.add(f.file, f.line, 'JOIN_ONLY_B', `${f.key} only in the second folder`); }
  if (parked) rep.info('-', 0, 'JOIN_PARKED', `${parked} key(s) absent from the second folder are listed dead in --minus`);
  return { diff, parked };
}

// ---------- commands ----------
function sources(o) {
  const loc = o.loc ? path.resolve(o.loc) : path.join(o.modDir, 'localization');
  if (!fs.existsSync(loc)) throw new Error('no text folder ' + loc);
  const only = o.only ? new Set(o.only.map(lc)) : null;
  const all = fs.readdirSync(loc).filter(n => /\.lng$/i.test(n) && fs.statSync(path.join(loc, n)).isFile()).sort();
  return { loc, all, picked: all.filter(n => !only || only.has(lc(n))) };
}
function folderFor(title, loc, F) {
  const t = title.replace(/^#/, '');
  // a folder the .lng already includes from is its own parts folder (re-split of a split folder): reuse it, do not copy it
  const own = d => F && F.src.files.slice(1).some(x => { const q = path.relative(path.join(loc, d), x); return q && !q.startsWith('..') && !path.isAbsolute(q); });
  const pick = lc(t) === 'mission' ? ['mission_multi'] : [t, t + '_parts'];
  for (const d of pick) if (own(d)) { if (F) F.ownDir = d; return d; }
  if (lc(t) === 'mission') return 'mission_multi';
  return fs.existsSync(path.join(loc, t)) ? t + '_parts' : t;
}

function prepare(o, rep) {
  const t0 = Date.now();
  const gkeys = vanillaKeys(o.gameDir, o.exe);
  const { loc, all, picked } = sources(o);
  const files = [];
  for (const n of picked) {
    const s = readSource(path.join(loc, n), n, loc, path.join(o.modDir, 'resource'), rep, 'localization/' + n);
    if (!s) continue;
    files.push({ name: n, title: titleOf(n), src: s, small: s.leaves.length < (o.minKeys ?? MIN_KEYS) });
  }
  return { gkeys, loc, all, files, ms: Date.now() - t0 };
}

function runDead(o, P, log) {
  const facts = dead.gather({ modDir: o.modDir, gameDir: o.gameDir, exe: o.exe, cacheDir: o.cacheDir, noStuff: o.noStuff, vanillaKeys: P.gkeys, log });
  const rows = [];
  for (const F of P.files) for (const l of F.src.leaves) {
    if (P.gkeys.has(l.lkey)) continue;
    const v = dead.verdict(facts, l.key, F.title);
    l.dead = v.verdict === 'dead'; l.miskeyed = /^MISKEYED:/.test(v.reason || ''); l.deadRow = v;
    rows.push({ file: F.name, key: l.key, group: v.group, verdict: v.verdict, reason: v.reason });
  }
  P.miskeyKnown = true;
  return { facts, rows };
}
function deadFromTsv(f, P) {
  const s = readMinus(f), mis = new Map(), rows = new Map();
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/).slice(1)) { const c = line.split('\t'); if (c[4] && c[4].startsWith('MISKEYED:')) mis.set(lc(c[1]), c[4]); if (c[3] === 'dead') rows.set(lc(c[1]), { group: c[2], reason: c[4] || '' }); }
  for (const F of P.files) for (const l of F.src.leaves) { l.dead = s.has(l.lkey) && !P.gkeys.has(l.lkey); l.miskeyed = mis.has(l.lkey); l.deadRow = rows.get(l.lkey); }
  P.miskeyKnown = true;
}

// ---------- mis-keyed name(side) keys of bare-named cards (dead.js MISKEYED) ----------
// rename to the card's own spelling; actions: renamed | renamed_changes_vanilla | dropped_identical | not_renamed_other_text |
// not_renamed_side. Without a dead pass the same rule runs on the buy list (no card/{info} of name(side), a card of the bare name).
const SIDE_RE = /\(([^()]*)\)$/;
function fixMiskeyed(P, bl) {
  const rows = [];
  for (const F of P.files) {
    const t = lc(F.title); if (t !== 'desc' && t !== 'info') continue;
    const L = F.src.leaves, byKey = new Map(L.map(l => [l.lkey, l])), groups = new Map();
    for (const l of L) {
      if (l.segs.length !== 1 || l.segs[0] !== 'squad' || !SIDE_RE.test(l.lname)) continue;
      const bare = l.lname.replace(SIDE_RE, '');
      const mis = P.miskeyKnown ? l.miskeyed : !!(bl && !bl.ref.has('info/squad/' + l.lname) && (bl.byName.has(bare) || bl.ref.has('info/squad/' + bare)));
      if (!mis) continue;
      const c = bl && bl.byName.get(bare), nm = c ? c.name : l.name.replace(SIDE_RE, '');
      const nk = F.src.prefix + ['squad', nm].join('/');
      if (!groups.has(lc(nk))) groups.set(lc(nk), { nk, nm, c, ls: [] });
      groups.get(lc(nk)).ls.push(l);
    }
    const row = (l, nk, action, note) => rows.push({ file: F.name, old: l.renamedFrom || l.key, new: nk, action, note: note || '' });
    for (const { nk, nm, c, ls } of groups.values()) {
      let pick = ls;
      if (ls.length > 1) {
        pick = ls.filter(l => c && c.side && SIDE_RE.exec(l.lname)[1] === c.side);
        for (const l of ls) if (pick.length !== 1 || l !== pick[0]) { l.miskeyNote = `MISKEYED, not renamed: ${ls.length} name(side) keys map to card "${nm}"${c && c.side ? ' (side ' + c.side + ')' : ''}`; row(l, nk, 'not_renamed_side', `card side ${c && c.side || '?'}; keys ${ls.map(x => x.name).join(', ')}`); }
        if (pick.length !== 1) continue;
      }
      const l = pick[0], ex = byKey.get(lc(nk));
      const rename = () => { l.renamedFrom = l.key; l.name = nm; l.lname = lc(nm); l.key = nk; l.lkey = lc(nk); l.dead = false;
        l.raw = l.raw.replace(/^\{(\s*)("(?:[^"\\]|\\.)*"|[^\s{}";]+)/, (m0, sp) => `{${sp}"${nm}"`); };
      if (ex && ex !== l) {
        if (ex.txt === l.txt) { l.drop = true; row(l, nk, 'dropped_identical', 'bare key exists with the same text'); }
        else if (P.gkeys.get(lc(nk)) === ex.txt) { ex.drop = true; rename(); row(l, nk, 'renamed_changes_vanilla', 'bare key held the vanilla text; the renamed text replaces it'); }
        else { l.miskeyNote = 'MISKEYED, not renamed: bare key exists with other text'; row(l, nk, 'not_renamed_other_text', `bare key text ${JSON.stringify(ex.txt.slice(0, 60))}`); }
      } else if (P.gkeys.has(lc(nk))) { rename(); row(l, nk, 'renamed_changes_vanilla', 'vanilla key, not in the mod file'); }
      else { rename(); row(l, nk, 'renamed', ''); }
    }
    F.src.leaves = L.filter(l => !l.drop);
  }
  return rows;
}
function readRenames(f) {
  return fs.readFileSync(f, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(line => { const c = line.split('\t'); return { file: c[0], old: c[1], new: c[2], action: c[3] }; });
}
// first-folder keys as the renames leave them: old -> new (text kept), dropped identical copies removed
function applyRenames(A, rows) {
  for (const r of rows) {
    if (!/^renamed|^dropped/.test(r.action)) continue;
    const e = A.get(lc(r.old)); if (!e) continue;
    A.delete(lc(r.old));
    if (r.action.startsWith('renamed')) A.set(lc(r.new), { ...e, key: r.new });
  }
  return A;
}
const renamesTsv = rows => ['file\told key\tnew key\taction\tnote', ...rows.map(r => [r.file, r.old, r.new, r.action, r.note].join('\t'))].join('\r\n') + '\r\n';

function planOf(P, o, facts) {
  const out = [];
  for (const F of P.files) {
    const s = F.src;
    let same = 0, changed = 0, fresh = 0;
    for (const l of s.leaves) { const g = P.gkeys.get(l.lkey); if (g === undefined) fresh++; else if (g === l.txt) same++; else changed++; }
    const r = { file: F.name, keys: s.leaves.length, same, changed, modOnly: fresh, duplicates: s.dups, comments: s.comments, sourceLines: s.srcLines, includes: s.files.length - 1, parts: [] };
    if (F.small) r.copied = `under ${o.minKeys ?? MIN_KEYS} keys: copied unchanged`;
    else {
      const folder = folderFor(F.title, P.loc, F);
      const L = layout(s, F.title, folder, P.gkeys, { park: o.park, facts, bl: o.bl, labels: o.labels, stuff: o.stuff, stuffMin: o.stuffMin });
      const kinds = {};
      for (const p of L.parts.values()) if (p.buylist) for (const it of p.items) { kinds[it.cl.kind] = (kinds[it.cl.kind] || 0) + 1; if (it.cl.heroVg) kinds.heroOverVehicleGroup = (kinds.heroOverVehicleGroup || 0) + 1; if (it.cl.card && it.cl.card.commented) kinds.commentedCard = (kinds.commentedCard || 0) + 1; }
      if (Object.keys(kinds).length) r.buylist = kinds;
      F.layout = L; F.folder = folder;
      r.parent = { file: F.name, lines: parentText(L, F.title).split('\r\n').length - 1 };
      for (const p of [...L.parts.values()].sort((a, b) => a.rel < b.rel ? -1 : 1)) r.parts.push({ file: p.rel, kind: p.kind, keys: countKeys(p), lines: partText(p).split('\r\n').length - 1 });
      if (L.parked.length) r.parts.push({ file: `_dropped/${F.title}.inc`, kind: 'dropped', keys: L.parked.length, lines: droppedText(L, F.title, s.gRaw).split('\r\n').length - 1 });
    }
    out.push(r);
  }
  return out;
}
const countKeys = p => [...p.items, ...p.changed, ...p.fresh].reduce((n, it) => n + (it.leaf ? 1 : it.fold.leaves.length), 0);

function guardOut(out, o) {
  const r = path.resolve(out), inside = (d) => { if (!d) return false; const x = path.relative(path.resolve(d), r); return !x.startsWith('..') && !path.isAbsolute(x); };
  if (inside(o.modDir)) throw new Error('--out is inside the mod folder; write elsewhere');
  if (inside(o.gameDir)) throw new Error('--out is inside the game folder; write elsewhere');
  if (inside(o.loc)) throw new Error('--out is inside the --loc text folder; write elsewhere');
}

function split(o, P, rep) {
  const out = path.resolve(o.out);
  guardOut(out, o);
  if (fs.existsSync(out) && fs.readdirSync(out).length && !o.force) throw new Error(`--out ${out} is not empty (give --force to write over it)`);
  fs.mkdirSync(out, { recursive: true });
  const written = new Map();   // rel -> Buffer
  const splitNames = new Set(P.files.filter(F => F.layout).map(F => lc(F.name)));
  // copy the rest
  const skipFile = new Set(), ownDirs = [];
  for (const F of P.files) if (F.layout) { for (const x of F.src.files) skipFile.add(lc(path.resolve(x))); if (F.ownDir) ownDirs.push(lc(F.ownDir) + '/'); }
  for (const f of walkFiles(P.loc, /./)) {
    const rel = relPath(P.loc, f);
    if (!rel.includes('/') && splitNames.has(lc(rel))) continue;
    if (skipFile.has(lc(path.resolve(f)))) continue;
    if (ownDirs.some(d => lc(rel).startsWith(d))) { rep.info(rel, 0, 'STALE_PART', 'file in a parts folder the .lng does not include: not copied'); continue; }
    const dst = path.join(out, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(f, dst);
  }
  const seen = new Map();   // lkey -> part rel (a key in two parts = bug)
  const newlyDead = [];
  const put = (rel, text) => { const b = Buffer.from(text, 'utf8'); const dst = path.join(out, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, b); written.set(rel, b); };
  for (const F of P.files) {
    if (!F.layout) continue;
    const L = F.layout;
    put(F.name, parentText(L, F.title));
    for (const p of L.parts.values()) {
      put(p.rel, partText(p));
      for (const it of [...p.items, ...p.changed, ...p.fresh]) for (const l of it.leaf ? [it.leaf] : it.fold.leaves) {
        if (seen.has(l.lkey)) rep.add(p.rel, 0, 'SPLIT_VERIFY', `${l.key} also in ${seen.get(l.lkey)}`); else seen.set(l.lkey, p.rel);
      }
    }
    if (L.parked.length) {
      // keys parked by an earlier run stay as they are; this run's dead keys are appended
      const old = path.join(P.loc, '_dropped', F.title + '.inc'), add = droppedText(L, F.title, F.src.gRaw);
      put(`_dropped/${F.title}.inc`, fs.existsSync(old) ? fs.readFileSync(old, 'utf8').replace(/(\r?\n)*$/, '\r\n') + '; ---- added by lngsplit re-split: ' + L.parked.length + ' newly dead key(s) ----\r\n' + add : add);
      newlyDead.push(...L.parked.map(l => [F.name, l.key, l.deadRow ? l.deadRow.group : '', 'dead', l.deadRow ? l.deadRow.reason : ''].join('\t')));
    }
  }
  // the tsv lists next to _dropped/: append this run's rows (an earlier run's rows stay)
  const appendTsv = (name, head, rows) => { if (!rows.length) return; const old = path.join(P.loc, '_dropped', name); const base = fs.existsSync(old) ? fs.readFileSync(old, 'utf8').replace(/(\r?\n)*$/, '\r\n') : head + '\r\n'; const b = Buffer.from(base + rows.join('\r\n') + '\r\n', 'utf8'); const dst = path.join(out, '_dropped', name); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, b); };
  if (fs.existsSync(path.join(P.loc, '_dropped')) || newlyDead.length) {
    appendTsv('dead-keys.tsv', 'file\tkey\tgroup\tverdict\treason', newlyDead);
    appendTsv('renamed-keys.tsv', 'file\told key\tnew key\taction\tnote', (P.renames || []).map(x => [x.file, x.old, x.new, x.action, x.note].join('\t')));
  }
  for (const [rel, b] of written) verifyText(b, rel, rep);
  // round trip: the new folder must give the same key -> text as the source, minus parked keys
  const parked = new Set(); for (const F of P.files) if (F.layout) for (const l of F.layout.parked) parked.add(l.lkey);
  const crep = createReport();
  const r = compare(applyRenames(joinFolder(P.loc), P.renames || []), joinFolder(out, crep), parked, crep);
  for (const f of crep.toJSON({ tool: 'lngsplit' }).findings) rep.add(f.file, f.line, 'SPLIT_VERIFY', `${f.code} ${f.msg}`);
  return { written: written.size, roundTrip: r, parked: parked.size, newlyDead };
}

// ---------- CLI ----------
function parseArgs(argv) {
  const o = { park: true, pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--game') o.gameDir = argv[++i];
    else if (a === '--exe') { const g = games.get(argv[++i]); if (!g) { console.error('lngsplit: --exe must be mowas_2 or as64'); process.exit(2); } o.exe = g.exe; }
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--only') o.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--json') o.json = argv[++i];
    else if (a === '--minus') o.minus = argv[++i];
    else if (a === '--compare') o.compare = true;
    else if (a === '--no-park') o.park = false;
    else if (a === '--dead-tsv') o.deadTsv = argv[++i];
    else if (a === '--cache') o.cacheDir = argv[++i];
    else if (a === '--no-stuff') o.noStuff = true;
    else if (a === '--force') o.force = true;
    else if (a === '--min-keys') o.minKeys = +argv[++i];
    else if (a === '--loc') o.loc = argv[++i];
    else if (a === '--no-buylist') o.noBuylist = true;
    else if (a === '--no-fix-miskeyed') o.noFix = true;
    else if (a === '--fix-miskeyed') o.noFix = false;
    else if (a === '--renames-out') o.renamesOut = argv[++i];
    else if (a === '--renames') o.renames = argv[++i];
    else if (a === '--stuff-min') o.stuffMin = +argv[++i];
    else if (a === '--buylist') o.noBuylist = false;
    else if (a === '-q') o.q = true;
    else o.pos.push(a);
  }
  return o;
}
const USAGE = 'usage: node tools/lngsplit/lngsplit.js plan|dead|split <modDir> --game <gameDir> [--exe mowas_2|as64] [--out f] [--only f,..] [--no-park] [--json f] [-q]\n       node tools/lngsplit/lngsplit.js join <folder> [--json f] | join --compare <a> <b> [--minus report.tsv]';

function main(argv) {
  const o = parseArgs(argv);
  const cmd = o.pos.shift();
  const rep = createReport();
  const log = o.q ? () => {} : m => console.error('lngsplit: ' + m);
  const writeJson = obj => { if (o.json) fs.writeFileSync(o.json, JSON.stringify(obj, null, 1)); };
  if (cmd === 'join') {
    if (o.compare) {
      const [a, b] = o.pos;
      if (!a || !b) { console.error(USAGE); return 2; }
      const minus = o.minus ? readMinus(o.minus) : new Set();
      const A = applyRenames(joinFolder(a, rep), o.renames ? readRenames(o.renames) : []), B = joinFolder(b, rep);
      const r = compare(A, B, minus, rep);
      console.log(`a ${A.size} keys, b ${B.size} keys, ${r.parked} parked, ${r.diff} differences`);
      writeJson({ a: A.size, b: B.size, parked: r.parked, diff: r.diff, findings: rep.toJSON({ tool: 'lngsplit' }).findings });
      rep.print({ showInfo: !o.q });
      return r.diff || rep.count ? 1 : 0;
    }
    const dir = o.pos[0];
    if (!dir) { console.error(USAGE); return 2; }
    const J = joinFolder(dir, rep);
    const obj = {}; for (const [, e] of J) obj[e.key] = e.txt;
    if (o.json) writeJson(obj); else for (const [, e] of J) console.log(`${e.key}\t${JSON.stringify(e.txt)}`);
    console.log(`${J.size} keys`);
    rep.print({ showInfo: !o.q });
    return rep.count ? 1 : 0;
  }
  if (!['plan', 'dead', 'split'].includes(cmd)) { console.error(USAGE); return 2; }
  o.modDir = o.pos[0];
  if (!o.modDir || !o.gameDir) { console.error(USAGE); return 2; }
  if (cmd !== 'plan' && !o.out) { console.error(`lngsplit ${cmd}: --out is required`); return 2; }
  o.cacheDir = o.cacheDir || require('../lib/toolcache').dir('lngsplit');
  const P = prepare(o, rep);
  log(`vanilla ${P.gkeys.size} keys, ${P.files.length} file(s) read (${P.ms} ms)`);
  let facts = null, rows = null;
  if (cmd === 'dead' || (cmd === 'split' && o.park)) {
    if (cmd === 'split' && o.deadTsv) { deadFromTsv(o.deadTsv, P); facts = dead.gather({ modDir: o.modDir, gameDir: o.gameDir, exe: o.exe, light: true, log }); }
    else { const d = runDead(o, P, log); facts = d.facts; rows = d.rows; }
  } else facts = dead.gather({ modDir: o.modDir, gameDir: o.gameDir, exe: o.exe, light: true, log });
  if (cmd === 'dead') {
    if (o.out) guardOut(o.out, o);
    const tsv = ['file\tkey\tgroup\tverdict\treason', ...rows.map(r => [r.file, r.key, r.group, r.verdict, r.reason].join('\t'))].join('\r\n') + '\r\n';
    fs.writeFileSync(o.out, tsv);
    const by = {};
    for (const r of rows) { const b = by[r.group] || (by[r.group] = { dead: 0, kept: 0, unsure: 0 }); b[r.verdict]++; }
    for (const [g, c] of Object.entries(by).sort()) console.log(`${g}\tdead ${c.dead}\tkept ${c.kept}\tunsure ${c.unsure}`);
    const t = rows.reduce((a, r) => (a[r.verdict]++, a), { dead: 0, kept: 0, unsure: 0 });
    console.log(`${rows.length} mod-only keys: dead ${t.dead}, kept ${t.kept}, unsure ${t.unsure} -> ${o.out}`);
    writeJson({ rows, byGroup: by, total: t });
    rep.print({ showInfo: !o.q });
    return 0;
  }
  let bl = null, labels = null;
  const needBl = (!o.noBuylist || !o.noFix) && P.files.some(F => ['info', 'desc'].includes(lc(F.title)) && !F.small);
  if (needBl) {
    bl = buylist.read({ modDir: o.modDir, gameDir: o.gameDir, exe: o.exe, breeds: facts.breeds });
    labels = new Map(P.gkeys); for (const [lk, e] of joinFolder(P.loc)) labels.set(lk, e.txt);
    log(`buy list: ${bl.cards.length} cards, ${bl.commented.length} commented-out cards, sides ${bl.sides.join(' ')}, buttons ${bl.buttons.join(' ')}`);
  }
  P.renames = [];
  if (!o.noFix) {
    P.renames = fixMiskeyed(P, bl);
    const by = {}; for (const r of P.renames) by[r.action] = (by[r.action] || 0) + 1;
    console.log(`mis-keyed name(side) keys: ${P.renames.length} ${JSON.stringify(by)}${P.miskeyKnown ? '' : ' (buy-list rule, no dead pass)'}`);
    for (const r of P.renames) if (r.action.startsWith('not_renamed')) console.log(`  ${r.action}: ${r.file} ${r.old} -> ${r.new} | ${r.note}`);
    if (o.renamesOut) { guardOut(o.renamesOut, o); fs.writeFileSync(o.renamesOut, renamesTsv(P.renames)); }
  }
  let stuff = null;
  if (!o.noBuylist && !o.noStuff && P.files.some(F => lc(F.title) === 'desc' && !F.small)) {
    try { stuff = stuffinfo.read({ modDir: o.modDir, gameDir: o.gameDir, exe: o.exe, cacheDir: o.cacheDir, log }); log(`stuff files ${stuff.count}`); }
    catch (e) { rep.info('-', 0, 'STUFF_SKIPPED', 'stuff files not read: ' + e.message); }
  }
  const plan = planOf(P, { park: cmd === 'split' && o.park, minKeys: o.minKeys, bl: o.noBuylist ? null : bl, labels, stuff, stuffMin: o.stuffMin }, facts);
  if (cmd === 'plan') {
    for (const r of plan) {
      console.log(`${r.file}: ${r.keys} keys, ${r.same} same as vanilla, ${r.changed} changed, ${r.modOnly} mod-only, ${r.duplicates} duplicates, ${r.comments} comment lines dropped, ${r.sourceLines} source lines${r.includes ? ', ' + r.includes + ' include(s)' : ''}`);
      if (r.copied) { console.log('  ' + r.copied); continue; }
      if (r.buylist) console.log('  buy-list grouping: ' + JSON.stringify(r.buylist));
      console.log(`  ${r.parent.file} ${r.parent.lines} lines (skeleton), ${r.parts.length} part file(s)`);
      if (!o.q) for (const p of r.parts) console.log(`    ${p.file}  ${p.kind}  ${p.keys} keys  ${p.lines} lines`);
    }
    writeJson({ files: plan });
    rep.print({ showInfo: !o.q });
    return 0;
  }
  const s = split(o, P, rep);
  console.log(`split: ${s.written} file(s) written to ${path.resolve(o.out)}, ${s.parked} key(s) parked in _dropped/, round trip ${s.roundTrip.diff} difference(s)`);
  if (s.newlyDead.length && !o.q) for (const x of s.newlyDead) console.log('  newly parked: ' + x.split('\t').slice(0, 2).join(' '));
  for (const r of plan) if (r.buylist) console.log(`${r.file} buy-list grouping: ${JSON.stringify(r.buylist)}`);
  writeJson({ renames: P.renames, files: plan, written: s.written, parked: s.parked, roundTrip: s.roundTrip, rows });
  rep.print({ showInfo: !o.q });
  return rep.count ? 1 : 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error('lngsplit: ' + e.message); process.exitCode = 2; }
}
// expectedParts(modDir, { game, exe, loc, cache, noStuff, stuffMin, minKeys }) -> Map lowerKey -> { part, kind, group?, renamedFrom?, renameTo? }
//   where split (buy-list layout, --fix-miskeyed, no park) puts each live key, nothing written. part = path under the localization
//   folder ('desc/mod/squad/ger/squad1.inc'; a file copied whole: its own name), kind 'vanilla'|'mod'|'copied', group = buy-list kind.
//   A mis-keyed key also maps its old lower key with renameTo.
function expectedParts(modDir, x = {}) {
  const o = { modDir, gameDir: x.game, exe: x.exe, loc: x.loc, cacheDir: x.cache || require('../lib/toolcache').dir('lngsplit'), noStuff: !!x.noStuff, minKeys: x.minKeys, stuffMin: x.stuffMin };
  const rep = createReport(), P = prepare(o, rep), log = () => {};
  const facts = dead.gather({ modDir, gameDir: o.gameDir, exe: o.exe, light: true, log });
  let bl = null, labels = null, stuff = null;
  if (P.files.some(F => ['info', 'desc'].includes(lc(F.title)) && !F.small)) {
    bl = buylist.read({ modDir, gameDir: o.gameDir, exe: o.exe, breeds: facts.breeds });
    labels = new Map(P.gkeys); for (const [lk, e] of joinFolder(P.loc)) labels.set(lk, e.txt);
  }
  P.renames = fixMiskeyed(P, bl);
  if (!o.noStuff && P.files.some(F => lc(F.title) === 'desc' && !F.small)) try { stuff = stuffinfo.read({ modDir, gameDir: o.gameDir, exe: o.exe, cacheDir: o.cacheDir, log }); } catch { stuff = null; }
  planOf(P, { park: false, minKeys: o.minKeys, bl, labels, stuff, stuffMin: o.stuffMin }, facts);
  const m = new Map();
  for (const F of P.files) {
    if (!F.layout) { for (const l of F.src.leaves) m.set(l.lkey, { part: F.name, kind: 'copied' }); continue; }
    for (const p of F.layout.parts.values()) for (const it of [...p.items, ...p.changed, ...p.fresh]) for (const l of it.leaf ? [it.leaf] : it.fold.leaves) {
      const e = { part: p.rel, kind: p.kind }; if (it.cl) e.group = it.cl.kind;
      if (l.renamedFrom) { e.renamedFrom = l.renamedFrom; m.set(lc(l.renamedFrom), { part: p.rel, kind: p.kind, renameTo: l.key }); }
      m.set(l.lkey, e);
    }
  }
  return m;
}

module.exports = { expectedParts, main, readSource, layout, joinFolder, compare, partText, parentText, vanillaKeys };
