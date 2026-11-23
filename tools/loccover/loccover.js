#!/usr/bin/env node
// loccover: do the localization keys the engine will look up exist in the effective .lng set? rows LOC-01 LOC-02 LOC-11 LOC-12
//   LOC-13 LOC-15 VFS-27.   usage: node tools/loccover/loccover.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--lang eng] [-q] [--summary]
//        node tools/loccover/loccover.js --vfs --game <dir> [--mods a,b]   (whole mounted vfs; vanilla = no --mods)
// game dir is derived when the folder sits in <game>/mods/. --lang: AS2 accepts it for compat (one language set);
//   GoH reads the mod's localizations/<--lang>/interface/text over localizations/default/ (below). --rc F --no-rc --format F -o FILE.
// --exe: the game whose vfs and text set are read (lib/games); none = as before (vfs picks: as64.exe first). mowas_2: no as64/core keys.
//   goh (--exe goh, no --game = the GoH install; also picked from call_to_arms.exe): text = .pot / .po (and .lng) under
//   resource/interface/text/ (vfs mounts localizations/default/interface/text there), key = msgctxt in lower case; an entry
//   with no msgctxt or flagged fuzzy gives no text (GHLOC-01, GHLOC-06 [V]). A GoH mod folder's own text: localizations/default/ and
//   localizations/<--lang>/interface/text/ (loose; localizations/<code>.pak inside an unmounted folder is not read: info LOC_GOH_PAK).
//   .mo (binary) files are not read (info LOC_GOH_MO). Under GoH the MP card checks (LOC_NAME_MISSING, LOC_INFO_MISSING,
//   LOC_HOW_SIDEKEY) run on set/multiplayer/units/common.set as for AS2, LOC_FILE_REPLACED and LOC_DAMAGE_KEY too; a dropped key names
//   the mod text file (.pot/.po, localizations/<code>/interface/text/...) that dropped it. The stuff key rule (LOC-15) is the AS2
//   desc/<kind>/<tags> form, not known for GoH: skipped with info LOC_GOH_STUFF. Messages say "text file" / .pot under GoH.
// checks (mod-owned data only; in --vfs mode everything):
//   LOC_FILE_REPLACED    mod .lng replaces a vanilla file wholesale and drops vanilla keys (LOC-01, VFS-27)
//   LOC_NAME_MISSING     MP card name / soldier breed / damage_report key has no key -> raw key text (LOC-02)
//   LOC_INFO_MISSING     squad card without info/squad/<name>: no "i" button (LOC-11)
//   LOC_DAMAGE_KEY       damage_report text that looks like a key but is not defined (LOC-12)
//   LOC_HOW_SIDEKEY      bare-name (how-type) card only has the name(side) key (LOC-13)
//   LOC_STUFF_KEY_ORDER  desc/<kind>/<tags> key exists with the same tags in another order (LOC-15)
//   WARN_STUFF_KEY_MISMATCH mod changed a vanilla stuff's tags; its old desc key is orphaned (LOC-15; unverified)
//   STUFF_KEY_MISSING (info) mod-ADDED stuff has no desc key (most stuff never shows a name) (LOC-15)
//   LOC_INCLUDE_MISSING  a mod .lng's (include "p") names no file (folder, its paks, vfs): those keys are not loaded (LOC-21)
//   LOC_INCLUDE_CYCLE    a mod .lng include loops back (or nests deeper than lib/lnginc allows) (LOC-21)
// .lng with (include "p") lines are read with the parts expanded (LOC-21 [V], lib/lnginc), a split mod's keys count where they sit
// Author: Imperator_Aug (ARSENAL, ia-2eaefe82)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const sdlset = require('../lib/sdlset'), sdl = require('../lib/sdl'), lnginc = require('../lib/lnginc');
const { createReport, relPath } = require('../lib/report');

const LOC_ROOT = 'resource/interface/text/';
const games = require('../lib/games');
const TEXT_RE = /\.(lng|pot|po)$/i;   // GoH text files (.pot fallback, .po primary, .lng both; GHLOC-01)
const UNITS = 'resource/set/multiplayer/units/common.set';
const SKIP_TAGS = new Set(['grenade', 'pattern', 'ammo', 'weapon']);

// ---- .pot / .po -> Map(lowercase msgctxt -> line); an entry with no msgctxt or flagged #, fuzzy gives no text (GHLOC-06) ----
function potKeys(buf) {
  let text = buf.toString('utf8'); if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const out = new Map(); let ctx = null, line = 0, fuzzy = false, st = null;
  const flush = () => { if (ctx !== null && !fuzzy) { const l = ctx.toLowerCase(); if (!out.has(l)) out.set(l, line); } ctx = null; fuzzy = false; st = null; };
  text.split(/\r?\n/).forEach((raw, i) => {
    const l = raw.trim(); let m;
    if (l === '') { if (st) flush(); return; }
    if (l.startsWith('#')) { if (st === 'str') flush(); if (/^#,.*\bfuzzy\b/.test(l)) fuzzy = true; return; }
    if ((m = /^msgctxt\s+"(.*)"$/.exec(l))) { if (st === 'str') flush(); ctx = m[1]; line = i + 1; st = 'ctx'; }
    else if (/^msgid\s/.test(l)) { if (st === 'str') flush(); st = 'id'; }
    else if (/^msgstr/.test(l)) st = 'str';
    else if ((m = /^"(.*)"$/.exec(l)) && st === 'ctx' && ctx !== null) ctx += m[1];
  });
  if (st) flush();
  return out;
}
// inc (optional) {open(vkey) -> {buf, file} | null, onError(code, msg, at)}: a .lng with (include "p") lines is read with the parts
// expanded (LOC-21 [V], lib/lnginc); with no include line the old reader runs unchanged
const textKeys = (buf, keyOfFile, inc) => (/\.(pot|po)$/i.test(keyOfFile) ? potKeys(buf) : inc && /\(\s*include\s+"/i.test(buf.toString('latin1')) ? incKeys(buf, keyOfFile, inc) : lngKeys(buf, keyOfFile));
function incKeys(buf, keyOfFile, inc) {
  const out = new Map();
  for (const [lk, e] of lnginc.readLngKeys(buf, keyOfFile, { open: inc.open, onError: inc.onError, file: LOC_ROOT + keyOfFile })) out.set(lk, e.line);
  return out;
}

// ---- .lng -> Map(lowercase key -> line) ----
function lngKeys(buf, keyOfFile) {
  let text = buf.toString('utf8'); if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const tree = sdl.parseLines(text.split(/\r?\n/), () => {}, { resync: 'nextQuote' });
  const base = keyOfFile.slice(keyOfFile.lastIndexOf('/') + 1).replace(/\.lng$/i, '');
  const dir = keyOfFile.includes('/') ? keyOfFile.slice(0, keyOfFile.lastIndexOf('/') + 1) : '';
  const pre = dir + (base.startsWith('#') ? '' : base + '/');
  const out = new Map();
  const vis = (n, kp) => {
    const k = kp + n.name;
    if (n.kids.length) return n.kids.forEach(c => vis(c, k + '/'));
    const l = k.toLowerCase(); if (!out.has(l)) out.set(l, n.line);
  };
  for (const n of tree.kids) {
    if (n.name === null) continue;
    if (n.name.toLowerCase() === 'tags') n.kids.forEach(c => vis(c, pre)); else vis(n, pre);
  }
  return out;
}

const lc = s => String(s).toLowerCase();
const normFile = f => { f = lc(String(f || '').replace(/\\/g, '/')); return f.startsWith('resource/') ? f : 'resource/' + f; };

// effective MP cards of a source: Map(lowercase name -> { name, breed, info, removed, locs:[{b,n}] }); same name merges
function cardsOf(src) {
  const cards = new Map();
  if (!src.get(UNITS)) return cards;
  const r = src.read({ key: UNITS, file: UNITS, get: () => src.get(UNITS) }, () => {});
  const walk = b => {
    if (!b.items) return;
    const first = b.items[0];
    if (first && first.k === 'IDENT' && lc(first.text) === 'units') {
      for (const it of b.items.slice(1)) if (it.k === 'BLOCK') card(it);
      return;
    }
    for (const it of b.items) if (it.k === 'BLOCK') walk(it);
  };
  const card = b => {
    const n = b.items[0];
    if (!n || (n.k !== 'STRING' && n.k !== 'IDENT')) return;
    const name = lc(n.k === 'STRING' ? n.value : n.text);
    let c = cards.get(name);
    if (!c) cards.set(name, c = { name, breed: false, info: null, removed: false, locs: [] });
    c.locs.push({ b, n });
    for (const f of b.items.slice(1)) {
      if (f.k !== 'BLOCK' || !f.items[0] || f.items[0].k !== 'IDENT') continue;
      const fn = lc(f.items[0].text), v = f.items[1];
      if (fn === 'breed') c.breed = true;
      else if (fn === 'remove') c.removed = true;
      else if (fn === 'info' && v) c.info = lc(v.k === 'STRING' ? v.value : v.text);
    }
  }
  walk(r.root);
  return cards;
}

function check(opts) {
  const rep = createReport();
  let gameDir = opts.gameDir, mods = opts.mods;
  const folder = opts.folder && path.resolve(opts.folder);
  if (folder && path.basename(path.dirname(folder)).toLowerCase() === 'mods') {   // a mod of this game only: <gameDir>/mods/<id>
    if (!gameDir) gameDir = path.dirname(path.dirname(folder));
    if (!mods && path.dirname(folder).toLowerCase() === path.resolve(gameDir, 'mods').toLowerCase()) mods = [require('../lib/names').normalize(path.basename(folder))];   // the vfs keys mods by the lowercase folder name (VFS-12)
  }
  const exe = games.exeOf(opts.exe) || undefined;   // --exe: every vfs below is that game's (LOC-23: as64/core keys only under as64)
  const src = sdlset.createSource({ gameDir, mods, folder: opts.folder, exe });
  const base = gameDir ? sdlset.createSource({ gameDir, exe }) : null;   // vanilla only
  const goh = (src.v ? src.v.exe : exe) === 'goh';
  const isText = k => (goh ? TEXT_RE.test(k) : k.endsWith('.lng'));
  const modKeys = new Set();
  if (!opts.vfs) { for (const t of src.modItems()) modKeys.add(t.key); for (const k of src.local.keys()) modKeys.add(k); for (const k of src.packed().keys()) modKeys.add(k); }
  const owned = k => opts.vfs || modKeys.has(k);
  const disp = k => src.local.has(k) ? relPath(src.folder, src.local.get(k)) : k;

  // ---- effective .lng set: key -> { get, mod } ----
  const eff = new Map();
  if (src.v) for (const k of src.v.files.keys()) if (k.startsWith(LOC_ROOT) && isText(k)) eff.set(k, { get: () => src.readVfs(k), mod: src.isModKey(k) });
  if (goh) {   // a GoH mod folder's loose text: localizations/default/ and localizations/<--lang>/interface/text/ (GHLOC-01)
    const langs = ['default', ...(opts.lang && lc(opts.lang) !== 'default' ? [lc(opts.lang)] : [])];
    for (const [k, f] of src.local) {
      const m = k.match(/^resource\/localizations\/([^/]+)\/interface\/text\/(.+)$/);
      if (m && langs.includes(m[1]) && TEXT_RE.test(m[2])) {   // src = the mod file that won (named by LOC_FILE_REPLACED / LOC_NAME_MISSING)
        const vk = LOC_ROOT + m[2], e = eff.get(vk), s = 'localizations/' + m[1] + '/interface/text/' + m[2];
        if (e && e.src && e.src.startsWith('localizations/' + lc(opts.lang || 'default') + '/') && m[1] === 'default' && langs.length > 1) continue;   // --lang wins over default
        if (e) { e.get = () => fs.readFileSync(f); e.mod = true; e.src = s; } else eff.set(vk, { get: () => fs.readFileSync(f), mod: true, src: s });
      }
      else if (/^resource\/localizations\/[^/]+\.pak$/.test(k) && !src.v) rep.info(disp(k), 0, 'LOC_GOH_PAK', 'GoH language pak in a folder that is not mounted: its texts are not read (give --game so the mod is mounted)');
      else if (/^resource\/localizations\/.+\.mo$/.test(k)) rep.info(disp(k), 0, 'LOC_GOH_MO', '.mo (binary) is not read: keys in it are not counted');
    }
  }
  for (const [k, f] of src.local) {   // loose folder not mounted (no vfs / outside mods/): localization/ or interface/text/
    let m = k.match(/^resource\/(?:localization|interface\/text)\/(.+\.lng)$/);
    if (m && !eff.has(LOC_ROOT + m[1])) eff.set(LOC_ROOT + m[1], { get: () => fs.readFileSync(f), mod: true });
    else if (m) { const e = eff.get(LOC_ROOT + m[1]); if (src.local.has(k)) { e.get = () => fs.readFileSync(f); e.mod = true; } }
  }
  for (const k of src.packed().keys()) {   // same for .lng inside the folder's own paks, loose wins
    const m = k.match(/^resource\/(?:localization|interface\/text)\/(.+\.lng)$/);
    if (!m || src.local.has(k)) continue;
    eff.set(LOC_ROOT + m[1], { get: () => src.readPacked(k), mod: true });
  }
  // (include "p") targets (LOC-21): the folder's loose file (localization/ or interface/text/), its paks, then the vfs; vanilla: vfs only
  const srcOpen = vk => {
    const lk = lc(vk), alt = lk.startsWith(LOC_ROOT) ? 'resource/localization/' + lk.slice(LOC_ROOT.length) : null;
    for (const k of [alt, lk]) if (k && src.local.has(k)) return { buf: fs.readFileSync(src.local.get(k)), file: k };
    if (src.packed().has(lk)) return { buf: src.readPacked(lk), file: lk };
    const b = src.readVfs(lk); return b ? { buf: b, file: lk } : null;
  };
  const baseOpen = vk => { const b = base && base.readVfs(lc(vk)); return b ? { buf: b, file: lc(vk) } : null; };
  const dispText = k => { k = lc(k); const alt = k.replace(LOC_ROOT, 'resource/localization/'); return src.local.has(k) ? disp(k) : src.local.has(alt) ? disp(alt) : k; };
  const incSeen = new Set();
  const incOf = report => ({ open: srcOpen, onError: (code, msg, at) => {
    if (!report || code === 'DEFINE_SKIPPED') return;
    const c = code === 'INCLUDE_CYCLE' || code === 'INCLUDE_DEPTH' ? 'LOC_INCLUDE_CYCLE' : 'LOC_INCLUDE_MISSING', f = dispText(at.file), id = f + ':' + at.line + ':' + c + msg;
    if (!incSeen.has(id)) { incSeen.add(id); rep.add(f, at.line, c, msg + ': its keys are not loaded (LOC-21)'); }
  } });
  const keys = new Map();      // lowercase key -> { file, line }
  const fileKeys = new Map();  // lng vkey -> Map
  for (const [vk, e] of eff) {
    let km; try { km = textKeys(e.get(), vk.slice(LOC_ROOT.length), incOf(opts.vfs || e.mod)); } catch (x) { continue; }
    fileKeys.set(vk, km);
    for (const [k, line] of km) keys.set(k, { file: vk, line });
  }
  // ---- LOC-01 / VFS-27: wholesale replacement drops vanilla keys ----
  const dropped = new Set(), droppedBy = new Map(); let droppedFile = 'localization/desc.lng';   // lowercase keys vanilla had that the winning mod file lacks
  if (base && base.v) for (const [vk, e] of eff) {
    if (!e.mod || !base.v.files.has(vk)) continue;
    let bk; try { bk = textKeys(base.readVfs(vk), vk.slice(LOC_ROOT.length), { open: baseOpen }); } catch (x) { continue; }
    const mk = fileKeys.get(vk) || new Map(), lost = [...bk.keys()].filter(k => !mk.has(k));
    const gsrc = e.src || 'localizations/default/interface/text/' + vk.slice(LOC_ROOT.length);   // GoH: the mod text file that dropped it (default path for vfs-mounted keys)
    for (const k of lost) { dropped.add(k); if (goh && !droppedBy.has(k)) droppedBy.set(k, gsrc); }
    if (lost.length && vk.endsWith('/desc.lng')) droppedFile = disp(vk.replace(LOC_ROOT, 'resource/localization/'));
    if (lost.length) {
      const eg = lost.slice(0, 3).join(', ');
      rep.add(goh ? gsrc : disp(vk.replace(LOC_ROOT, 'resource/localization/')), 1, 'LOC_FILE_REPLACED', `replaces vanilla ${vk.slice(LOC_ROOT.length)} wholesale: ${lost.length} of ${bk.size} vanilla keys dropped (raw key shown where used), e.g. ${eg} (LOC-01, VFS-27)`);
    }
  }
  const has = k => keys.has(lc(k));
  const TXT = goh ? 'mod text file' : 'mod .lng';
  const why = k => dropped.has(lc(k)) ? ' (vanilla key dropped by ' + TXT + ')' : '';

  // ---- MP cards ----
  // vanilla baseline: a card that vanilla already ships without the key is a known vanilla gap -> info, not a finding
  const bkeys = new Set();
  if (base && base.v) { for (const [vk] of base.v.files) if (vk.startsWith(LOC_ROOT) && isText(vk)) { try { for (const k of textKeys(base.readVfs(vk), vk.slice(LOC_ROOT.length), { open: baseOpen }).keys()) bkeys.add(k); } catch (x) {} } }
  else for (const k of keys.keys()) bkeys.add(k);
  const baseCards = base ? cardsOf(base) : new Map();
  const gap = (name, ...ks) => baseCards.has(name) && ks.every(k => !bkeys.has(lc(k)));
  if (src.get(UNITS)) {
    const cards = cardsOf(src);
    const where = c => {   // report position: first node in the include/macro chain that lives in an owned file
      let best = null;
      for (const { n } of c.locs) {
        let o = n, f = n.file, ln = n.line;
        for (let g = 0; o && g < 20; g++, o = o.via) {
          if (o.file) f = o.file;
          if (owned(normFile(f))) { if (!best || !best.own) best = { f: normFile(f), ln: o.line || ln, own: true }; break; }
        }
        if (!best) best = { f: normFile(n.file || UNITS), ln: n.line, own: false };
      }
      return best;
    };
    for (const c of cards.values()) {
      if (c.removed) continue;
      let w = where(c);
      const name = c.name;
      if (!w || !w.own) {   // vanilla/unchanged card: only report keys a mod .lng dropped (LOC-01 impact)
        const need = c.breed ? ['desc/human/' + name] : ['desc/entity/' + name, 'desc/squad/' + name];
        if (!need.some(has) && need.some(k => dropped.has(lc(k)))) rep.add(goh ? droppedBy.get(lc(need.find(k => dropped.has(lc(k))))) : droppedFile, 1, 'LOC_NAME_MISSING', `card "${name}" (${w ? w.f : UNITS}): ${need[need.length - 1]} dropped from vanilla by a ${TXT} -> raw key shown (LOC-01, LOC-02)`);
        continue;
      }
      const wf = disp(w.f);
      if (c.breed) {
        if (!has('desc/human/' + name)) (gap(name, 'desc/human/' + name) ? rep.info : rep.add).call(rep, wf, w.ln, 'LOC_NAME_MISSING', `soldier card "${name}": no desc/human/${name} -> raw key shown${why('desc/human/' + name)} (LOC-02)`);
        continue;
      }
      const squad = /\(.+\)$/.test(name);
      if (!has('desc/entity/' + name) && !has('desc/squad/' + name)) {
        const bare = name.replace(/\(.+\)$/, '');
        if (!squad && [...keys.keys()].some(k => k.startsWith('desc/squad/' + name + '(') && k.endsWith(')') && !k.slice(('desc/squad/' + name + '(').length, -1).includes('('))) {
          rep.add(wf, w.ln, 'LOC_HOW_SIDEKEY', `card "${name}" is bare-named (how-type macro) but only desc/squad/${name}(<side>) exists; need desc/squad/${name} (LOC-13)`);
        } else {
          const hint = squad && has('desc/squad/' + bare) ? `; bare key desc/squad/${bare} exists, squad cards use the (side) form` : '';
          (gap(name, 'desc/entity/' + name, 'desc/squad/' + name) ? rep.info : rep.add).call(rep, wf, w.ln, 'LOC_NAME_MISSING', `card "${name}": no desc/entity/${name} nor desc/squad/${name} -> raw key shown${why('desc/squad/' + name) || why('desc/entity/' + name)}${hint} (LOC-02)`);
        }
      }
      if (squad) {
        const iks = c.info ? ['info/squad/' + c.info, 'info/entity/' + c.info] : ['info/squad/' + name];
        if (!iks.some(has)) (gap(name, ...iks) ? rep.info : rep.add).call(rep, wf, w.ln, 'LOC_INFO_MISSING', `squad card "${name}": none of ${iks.join(' | ')} -> no info button (LOC-11)`);
      }
    }
  }

  // ---- damage_report texts (LOC-12) ----
  const items = new Map();
  if (opts.vfs) for (const t of src.vfsItems()) items.set(t.key, t);
  else { for (const t of src.modItems()) items.set(t.key, t); for (const t of src.folderItems()) items.set(t.key, t); }
  let files = 0;
  for (const [key, t] of items) {
    if (!/^resource\/(entity|set)\//.test(key)) continue;
    let buf; try { buf = t.get(); } catch (e) { continue; }
    if (!buf || !/damage_report/i.test(buf.toString('latin1'))) continue;
    let r; try { r = src.read(t, () => {}); } catch (e) { r = null; }
    if (!r) continue;
    files++;
    const visit = b => {
      if (!b.items) return;
      const f = b.items[0];
      if (f && f.k === 'IDENT' && lc(f.text) === 'damage_report') {
        const strs = b.items.slice(1).filter(x => x.k === 'STRING');
        const txt = strs[1] && strs[1].value;
        if (txt && /^[A-Za-z0-9_.\-]+(\/[A-Za-z0-9_.\-()]+)+$/.test(txt) && !has(txt) && (!b.file || normFile(b.file) === key || owned(normFile(b.file))))
          rep.add(t.file, b.line, 'LOC_DAMAGE_KEY', `damage_report text "${txt}" looks like a key but is not defined in any ${goh ? 'text file' : '.lng'} -> raw key shown${why(txt)} (LOC-12)`);
        return;
      }
      for (const it of b.items) if (it.k === 'BLOCK') visit(it);
    };
    visit(r.root);
  }

  // ---- stuff desc keys (LOC-15) ----
  const stuffMod = [...modKeys].filter(k => /^resource\/set\/stuff\/.+\.(ammo|weapon|grenade|hand|mine|pattern)$/.test(k));
  if (stuffMod.length && goh) rep.info(disp(stuffMod[0]), 1, 'LOC_GOH_STUFF', 'stuff desc keys (LOC-15) follow the AS2 desc/<kind>/<tags> rule; the GoH rule is not in the notes: not checked');
  else if (stuffMod.length && !opts.noStuff) {
    const ix = require('../entityindex');
    let idx;
    try {
      const crypto = require('crypto');
      const tag = crypto.createHash('md5').update(path.resolve(opts.folder || '') + '|' + (mods || []).join(',') + (opts.exe ? '|' + opts.exe : '')).digest('hex').slice(0, 8);
      const cache = opts.cache || require('../lib/toolcache').file('loccover', 'stuff-' + tag + '.json', path.join(__dirname, 'cache'));   // per-user cache (lib/toolcache)
      idx = ix.build({ gameDir, mods, folder: opts.folder, cache, allowUnmounted: !!opts.folder, exe }).idx;
    } catch (e) { idx = null; rep.info(disp(stuffMod[0]), 1, 'STUFF_SKIPPED', 'entityindex failed: ' + e.message); }
    if (idx) {
      let vidx = null;
      if (base) {   // vanilla index of THIS game dir (the shared vanilla cache only when it was built for it)
        const crypto = require('crypto'), vc = ix.cacheFile(path.join(__dirname, '..', 'entityindex', 'cache', 'vanilla.json'));   // where entityindex keeps it now
        try {
          // the shared cache of this game (exe) and folder (ix.cachePath); load refuses one built for another game or exe -> own build
          let vi = null; try { vi = fs.existsSync(ix.cachePath(vc, exe, gameDir)) ? ix.load(vc, exe, gameDir) : null; } catch (e) { vi = null; }
          if (!vi || path.resolve(vi.meta.game || '') !== path.resolve(gameDir)) vi = ix.build({ gameDir, exe, cache: require('../lib/toolcache').file('loccover', 'vanilla-' + crypto.createHash('md5').update(path.resolve(gameDir) + (exe ? '|' + exe : '')).digest('hex').slice(0, 8) + '.json', path.join(__dirname, 'cache')) }).idx;   // --exe: own per-game cache, never the shared one
          vidx = vi;
        } catch (e) { vidx = null; }
      }
      const bySet = new Map();   // "kind|sorted tags" -> [key]
      for (const k of keys.keys()) {
        const m = k.match(/^desc\/(ammo|weapon|stuff)\/(.+)$/);
        if (m) { const id = m[1] + '|' + m[2].split(' ').sort().join(' '); (bySet.get(id) || bySet.set(id, []).get(id)).push(k); }
      }
      for (const sk of stuffMod) {
        const rec = idx.stuff[sk]; if (!rec) continue;
        const all = idx.tagsOf(sk);
        const kind = all.has('ammo') ? 'ammo' : all.has('weapon') ? 'weapon' : 'stuff';
        if (!all.has('ammo') && !all.has('weapon')) continue;
        const tags = [...all].filter(t => !SKIP_TAGS.has(t));
        const key = `desc/${kind}/${tags.join(' ')}`;
        if (has(key)) continue;
        const alt = bySet.get(kind + '|' + [...tags].sort().join(' '));
        const vrec = vidx && base.v.files.has(sk) ? vidx.stuff[sk] : null;   // vanilla version of this stuff
        let oldKey = null;
        if (vrec) { const vt = vidx.tagsOf(sk); oldKey = `desc/${vt.has('ammo') ? 'ammo' : vt.has('weapon') ? 'weapon' : 'stuff'}/${[...vt].filter(t => !SKIP_TAGS.has(t)).join(' ')}`; }
        if (alt && oldKey !== null && !(oldKey === key)) rep.add(disp(sk), 1, 'LOC_STUFF_KEY_ORDER', `stuff tags give ${key} but the .lng has ${alt[0]}: tag order differs -> raw key (LOC-15)`);
        else if (oldKey !== null && oldKey !== key && has(oldKey)) rep.add(disp(sk), 1, 'WARN_STUFF_KEY_MISMATCH', `mod changed stuff tags: key is now ${key}, the .lng still has ${oldKey} -> raw key (LOC-15)`);
        else if (!vrec && !(base && base.v && base.v.files.has(sk))) rep.info(disp(sk), 1, 'STUFF_KEY_MISSING', `mod-added stuff: no ${key} (tags minus grenade/pattern/ammo/weapon, stuff order); name shows raw if displayed (LOC-15)`);
      }
    }
  }
  return { rep, files: eff.size, goh, own: opts.vfs ? null : [...src.local.keys(), ...src.packed().keys()].filter(k => (goh ? TEXT_RE : /\.lng$/i).test(k)).length };   // .lng the folder itself holds (loose or in its paks); isModKey also counts the built-in as64+
}

// .lintrc + --format wiring (own arg parser): rc from --rc FILE, else nearest .lintrc walking up from `start`; --no-rc disables
const { rcPrint } = require('../lib/cli');
if (require.main === module) {
  const args = process.argv.slice(2), o = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--lang') o.lang = args[++i];
    else if (a === '--exe') { o.exe = args[++i]; if (!games.get(o.exe)) { console.error('loccover: --exe ' + o.exe + ': as64, mowas_2 (mowas2) or goh'); process.exit(2); } }
    else if (a === '--vfs') o.vfs = true; else if (a === '--rc') o.rcFile = args[++i]; else if (a === '--no-rc') o.noRc = true; else if (a === '--format') o.format = args[++i]; else if (a === '-o') o.output = args[++i]; else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true; else pos.push(a);
  }
  o.folder = pos[0];
  // --exe goh, no --game: the GoH install (a folder in <a GoH game>/mods keeps that game, as check() derives it)
  const gp = o.folder && path.basename(path.dirname(path.resolve(o.folder))).toLowerCase() === 'mods' ? path.dirname(path.dirname(path.resolve(o.folder))) : null;
  if (games.kindOf(o.exe) === 'goh' && !o.gameDir && !(gp && games.detect(gp) === 'goh')) o.gameDir = games.install('goh').dir || undefined;
  if (!o.folder && !o.vfs || o.vfs && !o.gameDir) { console.error('usage: node tools/loccover/loccover.js <mod folder> [--game dir] [--exe as64|mowas_2|goh] [--lang eng] | --vfs --game <dir> [--mods a,b] [-q] [--summary]'); process.exit(2); }
  const { rep, files, own, goh } = check(o);
  rcPrint(rep, o, o.folder || o.gameDir, 'loccover', { showInfo: !o.q, byCode: true, summary: o.summary });
  console.log(goh ? `${files} text files` : `${files} lng files`);
  if (own === 0) console.error(goh ? 'loccover: 0 files from the folder: no mod text file read (.pot/.po under localizations/<code>/interface/text; the count above is the mounted game)'
    : 'loccover: 0 files from the folder: no mod .lng read (localization/ or a localization.pak; the count above is the mounted game)');   // COV-LINT: was silent on an empty folder
}
module.exports = { check, lngKeys, potKeys };
