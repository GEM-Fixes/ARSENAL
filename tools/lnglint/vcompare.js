// lnglint vanilla compare (opt-in, --game). rows LOC-01 (whole-file replace, no key merge [V] )
// LOC-20 ('#' files add keys without replacing vanilla desc.lng [I]).
// GoH (vfs exe 'goh'): vanilla text is gettext .pot under localizations/default (GHLOC-01 [V]); the key is msgctxt, lower case, and an
// entry with no msgctxt or flagged fuzzy gives no text (GHLOC-06 [V]). The base set then holds the .pot keys (and any .lng, which GoH
// also loads); the mod side adds its .po/.pot (loose and in localizations/<lang>.pak). A file of another language than default is a
// translation: it is compared for placeholders and new keys only (no override list, no shadow check: it sits in the primary layer,
// the default .pot stays the fallback, GHLOC-01). Placeholders on GoH also count boost %1% (GHLOC-11). Whole-file replace of a
// default .pot by a mod file of the same path is the as64 rule carried over [I] (LOC-01, GHLOC-01 base).
// A mod .lng with (include "p") lines is compared on its expanded key set (LOC-21, lib/lnginc); a key finding names the part file.
// Vanilla .lng hold no include (87 files, mowas_2 checked), so the base set keeps readKeys.
// codes: LNG_OVERRIDES_VANILLA (info) LNG_KEY_NEW (info) WARN_LNG_FILE_SHADOWS_VANILLA WARN_LNG_PARAM_MISMATCH
// Author: Imperator_Aug (ARSENAL, ia-8c449495)
const path = require('path');
const { readLngKeys } = require('../lib/lnginc');
const { readText } = require('../lib/enc'), sdl = require('../lib/sdl'), { walkFiles, relPath, each } = require('../lib/report'), vfs = require('../lib/vfs');

const FIRST_N = 5;
const PARAM = /%[-+ 0#]*\d*(?:\.\d+)?[sdfiuxXc]|\{\d+\}/g;
const PARAM_GOH = /%\d+%|%[-+ 0#]*\d*(?:\.\d+)?[sdfiuxXc]|\{\d+\}/g;

// file -> { vpath (lower, under interface/text/), keys: Map lowerKey -> {key, txt, line} } ; vpath relative to virtual /interface/text/
function readKeys(src, vpath) {
  const r = readText(src, 'utf8');
  const keys = new Map();
  if (r.fatal) return keys;
  const tree = sdl.parseLines(r.lines, () => {}, { resync: 'nextQuote' });
  const base = path.posix.basename(vpath, path.posix.extname(vpath)), dir = path.posix.dirname(vpath);
  const prefix = (dir === '.' ? '' : dir + '/') + (base.startsWith('#') ? '' : base + '/');
  const visit = (n, kp) => {
    const key = kp + n.name;
    if (n.kids.length) return n.kids.forEach(c => visit(c, key + '/'));
    keys.set(key.toLowerCase(), { key, txt: n.vals.filter(v => v.t === 's').map(v => v.v).join(''), line: n.line });
  };
  for (const t of tree.kids) {
    if (!t.name) continue;
    if (t.name.toLowerCase() === 'tags') t.kids.forEach(c => visit(c, prefix)); else visit(t, prefix);
  }
  return keys;
}
// .po/.pot buffer -> Map lowerKey -> {key, txt, line}; key = msgctxt (GHLOC-06), first entry of a key kept
function readPoKeys(buf) {
  const keys = new Map();
  for (const e of require('./lnglint').poEntries(buf)) { const lk = e.ctx.toLowerCase(); if (!keys.has(lk)) keys.set(lk, { key: e.ctx, txt: e.text, line: e.line }); }
  return keys;
}
// a mod .po/.pot path (rel, or 'x.pak!<entry>') -> {lang, vp}: localizations/<lang>/interface/text/<vp>, pak entry <lang>/interface/text/<vp>,
// or .../interface/text/<vp> (lang null = default)
function poPlace(rel) {
  const n = rel.replace(/\\/g, '/'), e = n.includes('!') ? n.slice(n.indexOf('!') + 1) : null;
  // pak entry first: in 'localizations/default.pak!default/...' a folder match on the whole rel would read 'default.pak!default'
  const m = (e && /^([^/]+)\/interface\/text\/(.*)$/i.exec(e)) || /(?:^|\/)localizations\/([^/!]+)\/interface\/text\/(.*)$/i.exec(n);
  if (m) return { lang: m[1].toLowerCase(), vp: m[2].toLowerCase() };
  const t = /(?:^|\/)interface\/text\/(.*)$/i.exec(e || n);
  return { lang: null, vp: (t ? t[1] : path.posix.basename(e || n)).toLowerCase() };
}

// a mod .lng's keys; with (include "p") lines the expanded set (LOC-21, lib/lnginc), each key carries rel = the part that holds it
function modKeysOf(root, f, vp) {
  const r = readText(f, 'utf8');
  const lint = require('./lnglint');
  if (r.fatal || !lint.hasInclude(r.lines)) return readKeys(f, vp);
  const io = lint.incOpts(root, f), keys = new Map();
  for (const [lk, e] of readLngKeys(f, io.vrel, { textDir: io.textDir, resDir: io.resDir })) keys.set(lk, { key: e.key, txt: e.txt, line: e.line, rel: relPath(root, e.file) });
  return keys;
}

const show = (arr, f) => arr.slice(0, FIRST_N).map(f).join(', ') + (arr.length > FIRST_N ? `, +${arr.length - FIRST_N} more` : '');

function compare(rep, opts) {
  const root = opts.folder;
  const v = vfs.build({ gameDir: opts.gameDir, mods: opts.mods || [], exe: opts.exe });
  const goh = v.exe === 'goh';
  const RE = goh ? PARAM_GOH : PARAM, params = s => (s.match(RE) || []).sort().join(' ');
  const LOC = 'resource/interface/text/';
  const TEXT = goh ? /\.(lng|pot?)$/i : /\.lng$/i;
  // base set: virtual file -> keys; global key -> {file, txt}
  const baseFiles = new Map(), gkeys = new Map();
  for (const [k, rec] of v.files) {
    if (!TEXT.test(k) || !k.startsWith(LOC)) continue;
    const vp = k.slice(LOC.length);
    let keys;
    try { keys = /\.lng$/i.test(k) ? readKeys(vfs.readRec(rec), vp) : readPoKeys(vfs.readRec(rec)); } catch { continue; }
    baseFiles.set(vp, keys);
    for (const [lk, e] of keys) gkeys.set(lk, { file: vp, txt: e.txt });
  }
  // mod side
  const mod = new Map(); // vp(lower) -> { rel, keys, tr }   tr: a translation (GoH file of another language than default)
  each(walkFiles(root, /.lng$/i), root, rep, f => {
    const rel = relPath(root, f);
    const vp = rel.replace(/^(.*\/)?(localization|interface\/text)\//i, '').toLowerCase();
    mod.set(vp, { rel, keys: modKeysOf(root, f, vp) });
  });
  if (goh) for (const p of require('./lnglint').poFiles(root)) {
    const at = poPlace(p.rel), tr = !!at.lang && at.lang !== 'default';
    let keys; try { keys = readPoKeys(p.read()); } catch { continue; }
    mod.set(tr ? at.lang + ':' + at.vp : at.vp, { rel: p.rel, keys, tr });
  }
  const modKeys = new Set();
  for (const m of mod.values()) if (!m.tr) for (const k of m.keys.keys()) modKeys.add(k);
  // keys still loaded from vanilla files the mod does not replace
  const keptKeys = new Set();
  for (const [vp, keys] of baseFiles) if (!mod.has(vp)) for (const k of keys.keys()) keptKeys.add(k);

  for (const [vp, m] of mod) {
    const over = [], fresh = [];
    for (const [lk, e] of m.keys) {
      const g = gkeys.get(lk);
      if (!g) { fresh.push(e); continue; }
      if (g.txt !== e.txt) {
        over.push({ e, g });
        if (params(g.txt) !== params(e.txt))
          rep.add(e.rel || m.rel, e.line, 'WARN_LNG_PARAM_MISMATCH', `"${e.key}" placeholders [${params(e.txt)}] differ from vanilla [${params(g.txt)}] (${g.file})`);
      }
    }
    if (over.length && !m.tr) rep.info(over[0].e.rel || m.rel, over[0].e.line, 'LNG_OVERRIDES_VANILLA', `${over.length} key(s) differ from vanilla: ${show(over, o => o.e.key)}`);
    if (fresh.length) rep.info(fresh[0].rel || m.rel, fresh[0].line, 'LNG_KEY_NEW', `${fresh.length} key(s) absent from vanilla`);
    const van = m.tr ? null : baseFiles.get(vp);
    if (van) {
      const dropped = [];
      for (const [lk, e] of van) if (!m.keys.has(lk) && !modKeys.has(lk) && !keptKeys.has(lk)) dropped.push(e.key);
      if (dropped.length)
        rep.add(m.rel, 1, 'WARN_LNG_FILE_SHADOWS_VANILLA', `replaces whole vanilla ${vp} (LOC-01${goh ? ', GoH [I]' : ''}) but drops ${dropped.length} of ${van.size} vanilla key(s): ${show(dropped, k => k)}`);
    }
  }
}

module.exports = { compare, params: s => (s.match(PARAM) || []).sort().join(' '), poPlace };
