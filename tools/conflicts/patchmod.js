#!/usr/bin/env node
// patchmod: plan or write a small PATCH MOD that keeps both sides of the clashes two (or more) mods have, loaded last. The mods are never
// touched: the patch mod is a NEW folder (it must not exist, or be empty), undo = delete it. VFS-01 [V]: the engine merges no file type
// across mods, so the merged file has to exist as one file in a later mod; VFS-15 [V] : {Require} puts it after both.
// usage: node tools/conflicts/patchmod.js plan|write --game G --mods a,b[,c] --out <new folder> [--exe as64|mowas_2|mowas2|goh]
//          [--name "Shown name"] [--spec f.json] [--json] [--listings | --scan-kept] [--trust-mtime] [--cache | --cache-dir <store>]
//          [--progress <file>] [--no-version-check]   (the speed flags of conflicts.js; --progress steps: scan mount merge check done)
//   a mod the game's version gate refuses is not merged (as conflicts.js); fewer than two loaded mods = exit 2
//   plan = what would be written (nothing is written); write = write it, then mount it by path and check that its files win.
//   --spec: { files: [{ key, mode: 'merge'|'take', take: mod, prefer: mod, picks: { '<entry path>': mod } }], texts: [{ key, text }] }
//     prefer = the mod whose value is taken wherever both changed one (picks, per entry, come first)
//     no spec = every file two of the mods ship with different content that can be merged (mode merge); files that are no text data are
//     only taken on request ({key, mode:'take', take: mod} = that mod's copy goes into the patch).
// merge of one text data file (.def .set .ext .inc .mdl ... and .lng), by entry, the game's file as the common start (3-way):
//   start = the winner's file (the last mod), bytes kept; lib/sdlwrite gives the entries of each copy (no macro or include expansion);
//   - an entry an earlier mod added or changed that the winner's file lacks is put in (the whole entry, at the end of its parent block)
//   - an entry both hold with different values: if only one mod changed it from the game's value, that mod's value is taken;
//     if both changed it, the winner's value stays unless picks names the other mod (a "choice" in the plan)
//   a block with a quoted name and blocks inside ({card "x" {..}}) is one entry by that name (as conflicts.js)
//   gate: the result is read again: every entry of the winner and every entry put in is there, and the strict reader (lib/sdlx) finds no
//   new error; a .lng must be valid UTF-8 in both mods and is read again with fix/lib/lng (LOC-05). A file that fails is left out (cant).
//   GoH .pot: fix/lib/lng mergePot (entries by msgctxt, the winner's stay, the other mod's missing ones are added); no picks.
// texts: [{key, text}] = one text key two mods define in two differently named .lng files (CONFLICT_LNG_KEY_CROSS, LOC-04): the text goes
//   to localization/#<patch>_texts.lng of the patch mod [T]. Not on GoH (first copy wins there).
// --json rows carry, beside `what` (English, for the command line), `parts` = [{ k, n, m, w, a, b }] the same facts as words a page
//   translates (k: added auto both bothPicked decided nothing apart take takeSame pot texts), `added` [{ path, from, val, line }],
//   `auto` [{ path, from, val, values }], `choices` [{ path, values: [{ src, val }], pick }]; a `cant` row carries k (fewer notext pick gohTexts)
// codes: PATCHMOD_FILE (info) PATCHMOD_CANT (warn) PATCHMOD_NOT_WINNING (warn: after the write the patch file is not the one the view reads)
// exit: 0 ok, 1 something could not be merged or does not win, 2 bad arguments or a refused folder
// Author: Imperator_Aug (ARSENAL, ia-46de0781)
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path');
const vfs = require('../lib/vfs'), sdlx = require('../lib/sdlx'), sdlwrite = require('../lib/sdlwrite'), games = require('../lib/games');
const WG = require('../lib/writeguard'), names = require('../lib/names'), fixlng = require('../fix/lib/lng');
const { check, sourceOf, isSdlKey, isGame, listingsOf, cacheOn, progressTo } = require('./conflicts');
const cipath = require('../lib/cipath');

const LOC_ROOT = 'resource/interface/text/';
const num = t => /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? '#' + Number(t) : t;
const seg = s => s.toLowerCase().replace(/\//g, '\\');
const isBlock = n => n.type === 'block' || n.type === 'list';
// entries of one file: path -> { node, sem (its own values), leaf (no blocks inside), parent path }, in file order
function index(t) {
  const out = new Map();
  (function walk(node, prefix) {
    let seen = null;
    const from0 = node.root ? 0 : node._from || 0;
    for (let i = from0; i < node.items.length; i++) {
      const n = node.items[i];
      if (!isBlock(n)) continue;
      const kids = n.items;
      let name = '#', from = 0;
      if (kids.length && !isBlock(kids[0])) { name = seg(kids[0].text); from = 1; }
      if (n.type === 'list') name = '(' + name;
      if (from === 1 && kids.length > 2 && kids[1].type === 'string' && kids.some(isBlock)) { name += ' ' + seg(kids[1].text); from = 2; }
      const base = prefix ? prefix + '/' + name : name;
      if (!seen) seen = new Map();
      const c = (seen.get(base) || 0) + 1; seen.set(base, c);
      const p = c > 1 ? base + '[' + c + ']' : base;
      n._from = from;
      out.set(p, { node: n, sem: kids.slice(from).filter(x => !isBlock(x)).map(x => num(x.text)).join(' '), leaf: !kids.some(isBlock), parent: prefix });
      walk(n, p);
    }
  })(t.root, '');
  return out;
}
const textOf = (t, n) => t.src.slice(n.start, n.end);
const fold = s => s.replace(/;[^\r\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const shown = (t, e) => e ? (e.leaf ? e.node.items.slice(e.node._from).map(x => x.text).join(' ') : '{...}') : '(absent)';
const errCount = (buf, key) => { let e = 0; try { sdlx.read(buf, { file: key, key, open: () => null, onError: (f, l, code) => { if (code !== 'INCLUDE_MISSING' && code !== 'MACRO_UNDEFINED') e++; } }); } catch (x) { e += 1000; } return e; };
const validUtf8 = buf => { try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true; } catch (e) { return false; } };

// merge one text data file. W = winner, B = the game's copy (or null), M = [{id, buf}] earlier mods, in load order
function mergeSdl(key, W, B, M, picks, prefer) {
  const lng = key.endsWith('.lng');
  if (lng) for (const s of [W].concat(M)) if (!validUtf8(s.buf)) return { cant: `${s.id}'s copy is not valid UTF-8; resave it as UTF-8 (LOC-05)` };
  let tW, tB = null;
  try { tW = sdlwrite.parse(W.buf); if (B) tB = sdlwrite.parse(B.buf); } catch (e) { return { cant: e.message }; }
  const iW = index(tW), iB = tB ? index(tB) : new Map();
  const eol = /\r\n/.test(tW.src) ? '\r\n' : '\n';
  const added = [], auto = [], choices = new Map(), splices = [], covered = new Set(), replaced = new Map();
  for (const m of M) {
    let tM; try { tM = sdlwrite.parse(m.buf); } catch (e) { return { cant: `${m.id}: ${e.message}` }; }
    const iM = index(tM);
    for (const [p, e] of iM) {
      if (e.parent && covered.has(e.parent)) { covered.add(p); continue; }
      const w = iW.get(p), b = iB.get(p);
      if (!w) {
        if (added.some(a => a.path === p)) { covered.add(p); continue; }                         // an earlier mod of the list put it in already
        if (b && fold(textOf(tB, b.node)) === fold(textOf(tM, e.node))) { covered.add(p); continue; }   // the game's entry, removed by the winner: stays removed
        const par = e.parent ? iW.get(e.parent) : { node: tW.root };
        if (!par) continue;                                                                        // parent gone too and unchanged: nothing to hang it on
        covered.add(p);
        const text = textOf(tM, e.node);
        added.push({ path: p, from: m.id, val: e.leaf ? shown(tM, e) : '{...}', line: tM.src.slice(0, e.node.start).split('\n').length });
        if (par.node.root) splices.push({ at: tW.src.length, del: 0, text: (/\n\s*$/.test(tW.src) || !tW.src.length ? '' : eol) + text + eol, ord: splices.length });
        else {
          const cs = par.node.closeStart, ls = tW.src.lastIndexOf('\n', cs - 1) + 1, ind = tW.src.slice(ls, cs);
          // indent of the new line = that of the parent's last entry when it starts a line, else the closing brace's plus one step
          const sib = par.node.items.filter(isBlock).pop(), sl = sib ? tW.src.lastIndexOf('\n', sib.start - 1) + 1 : -1;
          const sind = sib && /^[ \t]*$/.test(tW.src.slice(sl, sib.start)) && sl > tW.src.lastIndexOf('\n', par.node.start) ? tW.src.slice(sl, sib.start) : null;
          if (par.node.closed && /^[ \t]*$/.test(ind)) splices.push({ at: ls, del: 0, text: (sind !== null ? sind : ind + (ind.includes('\t') || !ind ? '\t' : ' ')) + text + eol, ord: splices.length });
          else splices.push({ at: par.node.closed ? cs : par.node.end, del: 0, text: ' ' + text, ord: splices.length });
        }
        continue;
      }
      if (!e.leaf || !w.leaf || e.sem === w.sem) continue;
      const mCh = !b || b.sem !== e.sem, wCh = !b || b.sem !== w.sem;
      if (!mCh) continue;                                              // this mod left the game's value: the winner's change stays
      const values = [{ src: 'vanilla', val: shown(tB, b) }, { src: m.id, val: shown(tM, e) }, { src: W.id, val: shown(tW, w) }];
      let c = choices.get(p);
      if (!c) choices.set(p, c = { path: p, values: [values[0], values[2]], pick: W.id, both: false });
      c.values.splice(c.values.length - 1, 0, values[1]);
      const want = (picks && picks[p]) || (wCh && prefer === m.id ? m.id : '');   // prefer = that mod's value wherever both changed one
      if (!wCh && !want) { c.pick = m.id; c.auto = true; }           // only this mod changed it: its value is taken
      else { c.both = c.both || wCh; if (want === m.id) c.pick = m.id; }
      if (c.pick === m.id) replaced.set(p, { at: w.node.start, del: w.node.end - w.node.start, text: textOf(tM, e.node) });
      else if (want === W.id) replaced.delete(p);
    }
  }
  for (const c of choices.values()) { if (c.pick === W.id) replaced.delete(c.path); if (c.auto && c.pick !== W.id) auto.push({ path: c.path, from: c.pick, val: c.values.find(x => x.src === c.pick).val, values: c.values }); }
  let n = 0; for (const r of replaced.values()) splices.push(Object.assign({ ord: 1e9 + n++ }, r));
  if (!splices.length) return { same: true, choices: [...choices.values()].filter(c => c.both) };
  splices.sort((a, b) => b.at - a.at || b.ord - a.ord);
  let src = tW.src;
  for (const s of splices) src = src.slice(0, s.at) + s.text + src.slice(s.at + s.del);
  const buf = Buffer.from(src, 'latin1');
  // gate: read it again
  let iR; try { iR = index(sdlwrite.parse(buf)); } catch (e) { return { cant: 'the merged file does not read: ' + e.message }; }
  for (const p of iW.keys()) if (!iR.has(p)) return { cant: 'merged file lost the winner\'s entry ' + p };
  for (const a of added) if (!iR.has(a.path)) return { cant: 'merged file does not hold the added entry ' + a.path };
  if (errCount(buf, key) > errCount(W.buf, key)) return { cant: 'the strict reader finds a new error in the merged file' };
  if (lng) { const a = fixlng.parse(buf.toString('utf8').replace(/^﻿/, '')), w = fixlng.parse(W.buf.toString('utf8').replace(/^﻿/, '')); for (const k of w.leaves.keys()) if (!a.leaves.has(k)) return { cant: 'merged text file lost the key ' + k }; }
  return { buf, added, auto, choices: [...choices.values()].filter(c => c.both) };
}

function modInfoText(name, reqs, last, goh) {
  const L = ['{mod', `\t{name "${String(name).replace(/["\r\n]/g, ' ')}"}`, `\t{desc "Patch made by ARSENAL: keeps both sides where ${reqs.join(' and ')} change the same file. Load it last. To undo, delete this folder."}`];
  if (goh && last && (last.tags || []).includes('develop')) L.push('\t{tags "develop"}');
  if (last && last.min) L.push(`\t{minGameVersion "${last.min}"}`);
  if (last && last.max) L.push(`\t{maxGameVersion "${last.max}"}`);
  for (const r of reqs) L.push(`\t{require "${r}"}`);
  L.push('}');
  return L.join('\r\n') + '\r\n';
}

// the folder may be written: new (or empty), not inside a mod of the list, and lib/writeguard has no objection
function refuseOut(out, o, modDirs) {
  if (!o.out) return 'name the new patch mod folder (--out)';
  const why = WG.refuseWrite(out, { game: path.resolve(o.gameDir), purpose: 'conflicts patch mod' });
  if (why) return why;
  if (fs.existsSync(out)) { if (!fs.statSync(out).isDirectory()) return 'the patch mod folder is a file: ' + out; if (fs.readdirSync(out).length) return 'the patch mod folder must be new or empty, and this one holds files: ' + out; }
  const low = out.toLowerCase() + path.sep;
  for (const d of modDirs) { const m = path.resolve(d).toLowerCase() + path.sep; if (low.startsWith(m) || m.startsWith(low)) return 'the patch mod folder must not be one of the mods or inside one: ' + d; }
  return null;
}

function run(o) {
  const exe = o.exe ? games.exeOf(o.exe) : undefined;
  if (o.exe && !exe) throw new Error('--exe must be one of as64|mowas_2|mowas2|goh');
  if (!o.gameDir && exe === 'goh') o.gameDir = games.install('goh').dir;
  if (!o.gameDir) throw new Error('need --game dir');
  if (!o.mods || o.mods.length < 2) throw new Error('need --mods a,b (two or more)');
  const out = o.out ? path.resolve(o.out) : '';
  // the game's own mod version gate, as conflicts.js keeps it: a mod the game refuses is not merged as if it were loaded
  const gate = !o.noGate && (exe ? true : !!cipath.resolve(o.gameDir, 'as64.exe', { cache: new Map() }));
  const prog = typeof o.progress === 'function' ? o.progress : () => {};
  prog('mount', 0, 0);
  const vopt = Object.assign({ gameDir: o.gameDir, mods: o.mods, disableVersionControl: !gate }, exe ? { exe } : {}, o.listings && o.listings.length ? { listings: o.listings } : {});
  const found = vfs.discover(o.gameDir, [], { plus: !exe || exe === 'as64', items: exe === 'goh' });
  const res = { out, name: o.name || (out ? path.basename(out) : ''), files: [], texts: [], cant: [], wrote: false };
  const v = vfs.build(vopt);
  const goh = v.exe === 'goh';
  const modIds = v.mods.filter(m => !isGame(m));
  if (modIds.length < 2) { vfs.closeRecs(); throw new Error('the game loads fewer than two of these mods (' + (modIds.join(', ') || 'none') + '): ' + v.problems.filter(p => p.level === 'error').map(p => p.msg).join('; ')); }
  res.requires = modIds.slice();
  res.refused = refuseOut(out, o, modIds.map(m => (found.get(m) || {}).dir).filter(Boolean));
  const spec = o.spec || {};
  let want = spec.files;
  try {
    if (!want) {       // every file two mods ship with different content that is text data
      want = [];
      const keys = new Set(); for (const s of v.shadows) keys.add(s.key);
      for (const key of [...keys].sort()) {
        if (!(isSdlKey(key) || key.endsWith('.lng') || key.endsWith('.pot'))) continue;
        const ids = new Map(); for (const r of v.chain(key)) ids.set(sourceOf(r.layer), r);
        const ms = [...ids].filter(([id, r]) => !isGame(id) && !r.deleted);
        if (ms.length >= 2 && !ms.every(x => vfs.sameRec(ms[0][1], x[1]))) want.push({ key, mode: 'merge' });
      }
    }
    let wn = 0;
    for (const f of want) {
      prog('merge', ++wn, want.length);
      const key = names.normalize(String(f.key || ''));
      const src = []; for (const r of v.chain(key)) { const id = sourceOf(r.layer), e = src.find(s => s.id === id); if (e) e.rec = r; else src.push({ id, rec: r }); }
      const live = src.filter(s => !s.rec.deleted), ms = live.filter(s => !isGame(s.id));
      const lng = key.endsWith('.lng'), pot = key.endsWith('.pot');
      const dest = lng || pot ? (goh ? 'localizations/default/' + key.slice('resource/'.length) : key.startsWith(LOC_ROOT) ? 'localization/' + key.slice(LOC_ROOT.length) : key) : key;
      const row = { key, dest, mode: f.mode === 'take' ? 'take' : 'merge', type: lng ? 'lng' : pot ? 'pot' : isSdlKey(key) ? 'sdl' : 'copy' };
      if (ms.length < 2) { res.cant.push({ key, k: 'fewer', why: 'fewer than two of the mods ship this file' }); continue; }
      for (const s of live) s.buf = vfs.readRec(s.rec);
      const W = ms[ms.length - 1], B = live.filter(s => isGame(s.id)).pop() || null, M = ms.slice(0, -1);
      row.winner = W.id; row.from = M.map(m => m.id);
      if (row.type === 'copy' && row.mode !== 'take') { res.cant.push({ key, k: 'notext', why: 'not a text data file: it cannot be merged. Pick the mod whose copy you want' }); continue; }
      if (row.mode === 'take') {
        const t = ms.find(s => s.id === names.normalize(String(f.take || '')) || s.id === f.take);
        if (!t) { res.cant.push({ key, k: 'pick', p: { l: ms.map(s => s.id).join(', ') }, why: 'pick one of: ' + ms.map(s => s.id).join(', ') }); continue; }
        row.take = t.id; row.buf = t.buf; row.what = [`the copy of ${t.id}, whole` + (t.id === W.id ? ' (the one the game uses already)' : '')];
        row.parts = [{ k: t.id === W.id ? 'takeSame' : 'take', m: t.id }];
        row.sizes = ms.map(s => ({ src: s.id, bytes: s.buf.length }));
      } else if (pot) {
        let buf = W.buf, n = 0, bad = null;
        for (const m of M) { const r = fixlng.mergePot(buf, m.buf); if (r.cant) { bad = r.cant[1]; break; } if (!r.same) { buf = r.buf; n += r.added; } }
        if (bad) { res.cant.push({ key, why: bad }); continue; }
        if (!n) { row.same = true; row.what = ['nothing to add: ' + W.id + '\'s file holds every text of the other mod']; row.parts = [{ k: 'nothing', w: W.id }]; }
        else { row.buf = buf; row.what = [`${n} texts of ${row.from.join(', ')} added to ${W.id}'s file`]; row.added = [{ path: n + ' texts', from: row.from.join(', ') }]; row.parts = [{ k: 'pot', n, m: row.from.join(', '), w: W.id }]; }
      } else {
        const r = mergeSdl(key, W, B, M, f.picks || null, f.prefer ? names.normalize(String(f.prefer)) : '');
        if (r.cant) { res.cant.push({ key, why: r.cant }); continue; }
        row.choices = r.choices || [];
        if (r.same && spec.files && row.choices.length) {      // asked for by name: the winner's copy goes in, so the values are decided by the patch mod
          row.buf = W.buf; row.decided = true; row.what = [`${row.choices.length} values both changed: all kept as ${W.id} has them (your decision, held by the patch mod)`];
          row.parts = [{ k: 'decided', n: row.choices.length, w: W.id }];
        } else if (r.same) { row.same = true; row.what = ['nothing to add: ' + W.id + '\'s file holds everything the other mod changed' + (row.choices.length ? `, apart from ${row.choices.length} values both changed (pick per value)` : '')]; row.parts = [{ k: 'nothing', w: W.id }].concat(row.choices.length ? [{ k: 'apart', n: row.choices.length }] : []); }
        else {
          row.buf = r.buf; row.added = r.added; row.auto = r.auto;
          row.what = [];
          if (r.added.length) row.what.push(`${r.added.length} entries of ${[...new Set(r.added.map(a => a.from))].join(', ')} put back`);
          if (r.auto.length) row.what.push(`${r.auto.length} values only ${[...new Set(r.auto.map(a => a.from))].join(', ')} changed are kept`);
          const pk = row.choices.filter(c => c.pick !== W.id).length;
          if (row.choices.length) row.what.push(`${row.choices.length} values both changed: ${row.choices.length - pk} from ${W.id}` + (pk ? `, ${pk} picked from the other mod` : ''));
          row.parts = [];
          if (r.added.length) row.parts.push({ k: 'added', n: r.added.length, m: [...new Set(r.added.map(a => a.from))].join(', ') });
          if (r.auto.length) row.parts.push({ k: 'auto', n: r.auto.length, m: [...new Set(r.auto.map(a => a.from))].join(', ') });
          if (row.choices.length) row.parts.push({ k: pk ? 'bothPicked' : 'both', n: row.choices.length, a: row.choices.length - pk, b: pk, w: W.id });
        }
      }
      row.bytes = row.buf ? row.buf.length : 0;
      res.files.push(row);
    }
    // texts of one key in two files (AS2 games): a '#' file of the patch mod. Keys under a file prefix cannot be said from a '#' file
    const texts = (spec.texts || []).filter(t => t && t.key);
    if (texts.length) {
      if (goh) res.cant.push({ key: '(texts)', k: 'gohTexts', why: 'Gates of Hell keeps the first copy of a text key, so a later patch file cannot change it. Rename the key in one mod by hand' });
      else {
        const esc = t => String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
        const L = ['{tags'];
        for (const t of texts) { const parts = String(t.key).split('/'); L.push('\t' + parts.map((p, i) => `{"${esc(p)}"` + (i === parts.length - 1 ? ` "${esc(t.text)}"` : '')).join(' ') + '}'.repeat(parts.length)); res.texts.push({ key: t.key, text: t.text }); }
        L.push('}');
        const id = names.normalize(res.name || 'patch').replace(/[^a-z0-9_]+/g, '_');
        res.files.push({ key: LOC_ROOT + '#' + id + '_texts.lng', dest: 'localization/#' + id + '_texts.lng', mode: 'texts', type: 'lng', buf: Buffer.from('﻿' + L.join('\r\n') + '\r\n', 'utf8'), what: [texts.length + ' texts you picked'], parts: [{ k: 'texts', n: texts.length }], bytes: 0 });
      }
    }
  } finally { vfs.closeRecs(); }
  const writeable = res.files.filter(f => f.buf);
  const lastMod = found.get(modIds[modIds.length - 1]);
  res.modInfo = modInfoText(res.name, modIds, lastMod, goh);
  if (o.write) {
    if (res.refused) throw Object.assign(new Error(res.refused), { refused: true });
    if (!writeable.length) throw new Error('nothing to write: no file of the plan changes anything');
    fs.mkdirSync(out, { recursive: true });
    try { WG.mark(out, 'conflicts patch mod'); } catch (e) { /* the marker is a courtesy */ }
    fs.writeFileSync(path.join(out, 'mod.info'), res.modInfo, 'latin1');
    for (const f of writeable) { const d = path.join(out, ...f.dest.split('/')); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, f.buf); }
    res.wrote = true;
    // the patch mod mounted by path on top of the list: each of its files must be the one the view reads
    prog('check', 0, 0);
    // ONE more mount (it was two): the view with the patch folder on top serves the win check and the clash check of its files
    const v2 = vfs.build(Object.assign({}, vopt, { modDirs: [out] }));
    let c;
    try {
      for (const f of writeable) { const r = v2.files.get(f.key); f.wins = !!r && !r.deleted && vfs.readRec(r).equals(f.buf); }
      c = check({ gameDir: o.gameDir, exe: o.exe, mods: o.mods, modDirs: [out], view: v2, modsOnly: true, noGate: o.noGate, listings: o.listings, trustMtime: o.trustMtime, cache: o.cache, keepOpen: true });
    } finally { vfs.closeRecs(); }
    const mine = new Set(writeable.map(f => f.key));
    res.left = c.items.filter(x => x.level === 'warn' && mine.has(x.file) && x.code !== 'MOD_ORDER_UNDECLARED').map(x => ({ file: x.file, code: x.code, msg: x.msg }));
  }
  for (const f of res.files) delete f.buf;
  prog('done', 1, 1);
  return res;
}

if (require.main === module) {
  const args = process.argv.slice(2), o = {};
  const cmd = args.shift();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--out') o.out = args[++i]; else if (a === '--name') o.name = args[++i]; else if (a === '--json') o.json = true;
    else if (a === '--exe') { const x = args[++i]; if (!games.get(x)) { console.error('--exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); } o.exe = games.exeOf(x); }
    else if (a === '--listings') o.useListings = true; else if (a === '--scan-kept') { o.useListings = true; o.scanKept = true; } else if (a === '--trust-mtime') o.trustMtime = true;
    else if (a === '--cache') o.cacheDir = ''; else if (a === '--cache-dir') o.cacheDir = args[++i]; else if (a === '--progress') o.progressFile = args[++i]; else if (a === '--no-version-check') o.noGate = true;
    else if (a === '--spec') { try { o.spec = JSON.parse(fs.readFileSync(args[++i], 'utf8')); } catch (e) { console.error('--spec: ' + e.message); process.exit(2); } }
    else { console.error('unknown arg ' + a); process.exit(2); }
  }
  if ((cmd !== 'plan' && cmd !== 'write') || !o.mods || (!o.gameDir && o.exe !== 'goh')) { console.error('usage: node tools/conflicts/patchmod.js plan|write --game G --mods a,b --out <new folder> [--exe as64|mowas_2|mowas2|goh] [--name N] [--spec f.json] [--json]'); process.exit(2); }
  o.write = cmd === 'write';
  (async () => {
  let r;
  try {
    if (!o.gameDir && o.exe === 'goh') o.gameDir = games.install('goh').dir;
    if (o.cacheDir !== undefined) o.cache = cacheOn(o.cacheDir, o.gameDir, o.exe);
    if (o.progressFile) o.progress = progressTo(o.progressFile);
    if (o.useListings) { if (o.progress) o.progress('scan', 0, 0); o.listings = await listingsOf(o); }
    r = run(o);
  } catch (e) { if (o.json) console.log(JSON.stringify({ error: e.message, refused: !!e.refused })); console.error(e.message); process.exit(2); }
  if (o.json) console.log(JSON.stringify(r));
  else {
    console.log((r.wrote ? 'wrote ' : 'plan for ') + (r.out || '(no folder named)') + (r.refused && !r.wrote ? '\nREFUSED: ' + r.refused : ''));
    for (const f of r.files) console.log(`info: ${f.key}: PATCHMOD_FILE -> ${f.dest}: ${(f.what || []).join('; ')}` + (f.wins === false ? '' : ''));
    for (const f of r.files) if (f.wins === false) console.log(`${f.key}: PATCHMOD_NOT_WINNING the patch file is not the one read after the write`);
    for (const c of r.cant) console.log(`${c.key}: PATCHMOD_CANT ${c.why}`);
    if (r.left) console.log(`${r.left.length} clashes left in the patched files`);
    console.log(`${r.files.filter(f => !f.same).length} files in the patch, ${r.cant.length} left out`);
  }
  process.exitCode = r.cant.length || r.files.some(f => f.wins === false) ? 1 : 0;
  })();
}
module.exports = { run, mergeSdl, index };
