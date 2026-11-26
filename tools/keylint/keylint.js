#!/usr/bin/env node
// keylint: data-key / typed-value linter for SDL data (def ext set mdl mi ...). assumes the file parses (sdllint does syntax).
//   node keylint.js <mod folder> [--game <gameDir>] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--vocab file] [--time] [-q] [--summary] [--restore-points]
//   --restore-points: also read <mod folder>/.arsenal-undo (restore points; the game never mounts them, so off by default)
//   CLI reads the folder through the thread pool (checkAsync: listing + read-ahead); check() = same findings, one file at a time
//   main(argv, {ra, listing}) = the CLI; ctx.js = the read-once module form for doctor (lib/modset, tools/lib/MODSET.md)
//   node keylint.js --vfs --game <gameDir> [--exe ...]   check every vanilla file against the vocab learned from it (consistency)
//   --exe: the game (lib/cli common). mowas_2 mounts the shared install without as64/core and picks vocab.mowas2.json; goh picks
//   vocab.goh.json and fieldtypes/fields.goh.json (no --game: the GoH install). None: as before (GoH by the exe in --game, else AS2)
// vocab.json (learn.js) = per (file kind, block path) the keys, value signatures, enum words seen in vanilla.
// rows: SDL-56 (caller-side), SDL-26,29,30,31,32,33,34,35,36,37,38,39,41,42,44,46 and KEY-01..04,06..18,20..22,25 (rules.js = explicit KEY rules)
// codes: learned-type findings are WARN_ (vocab is evidence, not the engine); explicit [V] rules are plain.
//   KEY_CASE (SDL-33) WARN_UNKNOWN_KEY (SDL-34,38) WARN_INT_GOT_FLOAT WARN_INT_GOT_EXPR (SDL-26,29) INT_FIELD_FLOAT (SDL-30)
//   WARN_FLOAT_GOT_NONNUM (SDL-31) WARN_BOOL_NO_IS_TRUE WARN_BOOL_BAD_TOKEN (SDL-32) WARN_VALUE_SURPLUS (SDL-35)
//   WARN_VALUE_MISSING (SDL-36) WARN_ENUM_UNKNOWN (SDL-37) COLOR_HEX_LEN / WARN_COLOR_HEX_LEN (SDL-39)
//   WARN_TIMESPAN_TRUNC (SDL-41) WARN_QUANT_FLOAT (SDL-42) WARN_STRING_EXPECTED (SDL-44) WARN_KEY_REPEAT (SDL-46)
//   LOOSE_PATCH (KEY-01) DAMAGE_BLASTWAVE_KEY (02) DAMAGE_UNSUPPORTED DAMAGE_UNKNOWN (13) WARN_RICOCHET_CLAMP (04) IK_ZERO_SPEED (06)
//   (07 moved to refcheck EXTENDER_UNKNOWN) COLLIDER_IDS_MAX (08) GEARS_BAD (15) ACCURACY_BY_MOTION (18) DEAD_KEY (11,14,25) WARN_DEAD_KEY (12)
//   WARN_PARAM_PREFIX (SDL-56) WARN_PERK_LEVEL (21) COLLIDER_UNKNOWN WARN_PATHER_UNKNOWN (22); info: VOLUME_NO_BLAST (03) PARAM_WHOLE_WEAPON (09) NO_CALIBRE (10) DAMAGE_REPLACES (17)
//   CHK-KEY (chkkey.js): MTL_DIFFUSE_BARE (SDL-61) SELECT_NO_CATCHALL (AI-01) AMMO_RULE_GAP (AI-05) WARN_BOT_API_UNKNOWN (AI-12) BOT_DATA_UNUSED_KEY (AI-15)
//   GOH_DEF_KEY_IGNORED (PORT-88) WARN_GOH_MP_KEY_IGNORED (PORT-92) TAGS_MULTI_STRING (SDL-43) ARMOR_MACRO_ARGS (TST-80, raw text); GPL-01, AI-18 not checkable
// Author: Imperator_Aug (ARSENAL, ia-b52668a6)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const sdlset = require('../lib/sdlset'), sdlx = require('../lib/sdlx');
const { createReport, relPath } = require('../lib/report'), cli = require('../lib/cli');
const { bomKind } = require('../lib/enc');
const M = require('./model'), R = require('./rules');

const MIN_N = 12;                              // key evidence needed for learned value checks
const STRICT_KINDS = new Set(['set/multiplayer.set', 'set/breed.set']);   // DDA files: key names strcmp case-sensitive (SDL-33)
const COLOR_NAMES = new Set('black dblue dgred dgreen dcyan dmagenta dyellow dgray gray blue red green cyan magenta yellow white'.split(' '));
const RES_KEY = /(texture|material|mtl|mesh|model|file|sound|sample|extension|resource|folder|path)$/;   // resource name-like field names (SDL-44)
const LIST_KEYS = new Set(['zeroingaccuracy']);   // engine reads while-numbers; vanilla's fixed arity is style
const NUMS =new Set(['I', 'F', 'X']);

// engine field types (tools/fieldtypes/fields.json, generated from src): a learned hint becomes an error only when the
// engine type of every same-named key agrees with it. typeAt -> { t, src } for value position i, or null
// GoH: fields.goh.json + fields.goh.scope.json (gen.js run on GoH, [I]: static parse of an unfinished
// GoH) when present, else the AS2 table as before. useFields(goh) switches the tables for the walk that follows.
let FIELDS = null, SCOPE = null, TMEMO = null;
const FT = new Map();
function useFields(goh) {
  const k = goh && fs.existsSync(path.join(__dirname, '..', 'fieldtypes', 'fields.goh.json')) ? 'goh' : 'as2';
  if (!FT.has(k)) {
    const ld = (f, p) => { try { return require('../fieldtypes/' + f)[p]; } catch (e) { return {}; } };
    FT.set(k, k === 'goh' ? { f: ld('fields.goh.json', 'keys'), s: ld('fields.goh.scope.json', 'kinds') } : { f: ld('fields.json', 'keys'), s: ld('scope.json', 'kinds') });
  }
  const t = FT.get(k); FIELDS = t.f; SCOPE = t.s; TMEMO = t.m || (t.m = [new Map(), new Map()]); return k;
}
// typeAt is pure in (field table, FILE_FX, kind, key, i): kept per table while M.fast() (KEYLINT_FAST, default on)
function typeAt(key, i, kind) {
  if (FIELDS === null) useFields(false);
  if (!M.fast()) return typeAt0(key, i, kind);
  const fx = FILE_FX ? 1 : 0;   // nested maps (fx, kind, key) -> [by i]: no key string built per call
  let m = TMEMO[fx].get(kind); if (!m) TMEMO[fx].set(kind, m = new Map());
  let a = m.get(key); if (!a) m.set(key, a = []);
  let r = a[i];
  if (r === undefined) { r = typeAt0(key, i, kind); a[i] = r; }
  return r;
}
function typeAt0(key, i, kind) {
  const r = FIELDS[key]; if (!r) return null;
  // position-wise: every concrete engine reader of this key that has a value at position i must agree on its type
  // (readers of other arity, e.g. float vs float(float float), do not veto each other). entries narrowed to the file's engine scope
  const es = scoped(key, r, kind);
  let t = null, src = '';
  for (const x of es) {
    if (x.t === '?' || x.t === 'sub') continue;
    const ty = x.seq ? x.seq.split(' ')[i] : i === 0 ? x.t : undefined;
    if (ty === undefined || ty === 'sub' || ty === 'block') continue;
    if (t === null) { t = ty; src = x.src; } else if (t !== ty) return null;
  }
  return t ? { t, src } : null;
}
// engine readers that can see this file kind: SCOPE maps a keylint kind (ext / set dir) to the game path regexes;
// narrowing is used only when it leaves at least one entry, else every reader of the key counts (conservative)
// data: tools/fieldtypes/scope.json kinds[K] = {tag, prefixes, own}; an entry is in scope when e.own in own or e.src starts with a prefix.
// only tag V scopes narrow (I = static guess); empty narrowing -> every reader (conservative)
// effect files (resource/**/fx/) are .def by extension but read by the efx loader, not the entity classes: scope kind 'fx' (tag I, no narrowing)
let FILE_FX = false;
const scopeKey = key => /\/fx\//.test(key) && /\.def1?$/.test(key);
function scoped(key, r, kind) {
  if (FILE_FX && /^def1?$/.test(kind)) kind = 'fx';
  if (SCOPE === null) useFields(false);
  const sc = kind && SCOPE[kind]; if (!sc || sc.tag !== 'V') return r.src;
  if (!sc._own) { sc._own = new Set(sc.own || []); sc._pre = sc.prefixes || []; }
  const n = r.src.filter(x => x.own && sc._own.has(x.own) || sc._pre.some(p => x.src.startsWith(p)));
  return n.length ? n : r.src;
}

function analyze(ks) {
  if (ks._a) return ks._a;
  const a = { lens: new Set(), pos: [], trunc: false, empty: false };
  for (const [sg, c] of Object.entries(ks.s)) {
    let t = sg;
    if (t.endsWith('+')) { a.trunc = true; t = t.slice(0, -1); }
    a.lens.add(t.length); if (!t.length) a.empty = true;
    for (let i = 0; i < t.length; i++) { const p = a.pos[i] || (a.pos[i] = { set: new Set(), n: 0 }); p.set.add(t[i]); p.n += c; }
  }
  a.max = Math.max(0, ...a.lens);
  a.nsig = Object.keys(ks.s).length;
  a.letters = new Set(Object.keys(ks.s).join('').replace('+', '').split(''));
  a.cov = Object.values(ks.s).reduce((x, y) => x + y, 0) / ks.n;   // share of uses covered by the kept signatures
  a.mono = a.cov >= 0.95 && a.nsig <= 4;                            // polymorphic keys (if, select...) get no positional type checks
  const v = ks.v || {};
  a.vsum = Object.values(v).reduce((x, y) => x + y, 0);
  a.bool = (v.true || 0) + (v.false || 0) >= Math.max(3, 0.5 * ks.n);
  a.enum = !ks.vo && ks.v && (ks.s.T || 0) >= 0.8 * ks.n && a.vsum >= 0.8 * ks.n && Object.keys(v).length <= 25;
  return ks._a = a;
}

// GoH game dir (same exe test as sdllint.js) -> vocab.goh.json when present; an explicit --vocab always wins
// opts.exe (vfs exe 'as64'|'mowas_2'|'goh', lib/cli --exe) names the game; none: the exe test on the game dir as before.
// mowas_2 -> vocab.mowas2.json (learn.js --exe mowas_2: the MoW:AS2 mount, no as64/core) when present, else vocab.json
const isGoh = d => !!d && ['binaries/x64/call_to_arms.exe', 'call_to_arms.exe'].some(x => fs.existsSync(path.join(d, x)));
const gameOf = opts => opts.exe ? require('../lib/games').exeOf(opts.exe) : isGoh(opts.gameDir) ? 'goh' : null;   // null = AS2, the vfs pick
const VOCAB = { goh: 'vocab.goh.json', mowas_2: 'vocab.mowas2.json' };
const vocabPath = opts => { const f = VOCAB[gameOf(opts)]; return opts.vocab || path.join(__dirname, f && fs.existsSync(path.join(__dirname, f)) ? f : 'vocab.json'); };

// GoH folder not under <game>/mods (Workshop mod, all paks; GOHMOD-3): SDL entries of <mod>/resource.pak and <mod>/resource/*.pak,
// keyed at resource/ by lib/sdlset packed() (same filter as sdllint gohPakItems). AS2 runs never call it
function gohPakItems(src) {
  const out = [];
  if (![...src.local.keys()].some(k => k.endsWith('.pak'))) return out;
  for (const [k, r] of src.packed()) {
    const pf = r.file.slice(0, r.file.indexOf('!')).replace(/\\/g, '/').toLowerCase();
    if (pf !== 'resource.pak' && !/^resource\/[^/]+\.pak$/.test(pf)) continue;
    if (src.local.has(k) || !sdlset.isSdl(k) || !sdlset.extOf(k) && !k.startsWith('resource/set/stuff/')) continue;
    out.push({ key: k, file: r.file, get: () => src.readPacked(k) });
  }
  return out;
}

function makeCtx(opts) {
  const rep = createReport();
  const vocab = JSON.parse(fs.readFileSync(vocabPath(opts), 'utf8'));
  // GoH game (--exe goh, or the GoH exe in --game): no AS2 engine schemas/rules, also with an explicit --vocab (before: only when
  // vocab.goh.json was picked, so a GoH run with --vocab got the AS2 schemas and the GoH-key-ignored rules)
  const gohGame = gameOf(opts) === 'goh', goh = gohGame;
  let mods = opts.mods;
  if (!mods && opts.folder && opts.gameDir && path.basename(path.dirname(path.resolve(opts.folder))).toLowerCase() === 'mods') mods = [path.basename(path.resolve(opts.folder))];   // mod dir under <game>/mods: mount it (its paks are checked too)
  const src = sdlset.createSource({ gameDir: opts.gameDir, mods, folder: opts.folder, ...(opts.exe ? { exe: opts.exe } : {}), ...(opts.restorePoints != null ? { restorePoints: !!opts.restorePoints } : {}), ...(opts.listing ? { listing: opts.listing } : {}) });
  const vfsMode = !!opts.vfs;
  const mine = new Set(); for (const f of src.local.values()) mine.add(relPath(src.folder, f));
  const pakItems = !mods && !vfsMode && opts.folder && gohGame ? gohPakItems(src) : [];   // GOHMOD-3
  for (const t of pakItems) mine.add(t.file);
  let bufKey = null;   // lintBuffer: the buffer under edit counts as the user's file
  const isMine = f => vfsMode || f === bufKey || mine.has(f) || src.isModKey(f);

  // ---- environment from data (extender names, collider profiles, perk levels, pather names)
  const env = { extenders: null, colliders: null, levels: null, pathers: null };
  const svAll = key => new Set((vocab.names || {})[key] || []);
  env.extenders = svAll('extender'); for (const n of R.BUILTIN_EXTENDERS) env.extenders.add(n);
  env.pathers = svAll('patherid'); if (env.pathers.size < 5) env.pathers = null;
  const readTree = key => { const b = src.get(key); return b ? sdlx.read(b, { file: key, key, open: src.open, onError() {} }).root : null; };
  const nameOf = b => { const p = M.parts(b, false); return p.keyTok && (p.keyTok.k === 'STRING' ? p.keyTok.value : p.keyTok.text).toLowerCase(); };
  try {
    // pather names = {Profile "name"} blocks of the winning set/pather.set (a mod may add profiles, e.g. airdrop); engine: LoadPathers
    const pt = readTree('resource/set/pather.set');
    if (pt) { const ps = new Set(); for (const top of pt.items) if (top.k === 'BLOCK') for (const k of M.parts(top, false).kids) { const p = M.parts(k, false); if (p.key === 'profile' && p.toks[0] && p.toks[0].k === 'STRING') ps.add(p.toks[0].value.toLowerCase()); } if (ps.size >= 5) env.pathers = ps; }
    const ct = readTree('resource/set/colliders.set');
    if (ct) { env.colliders = new Set(); for (const top of ct.items) if (top.k === 'BLOCK') for (const k of M.parts(top, false).kids) { const n = nameOf(k); if (n) env.colliders.add(n); } if (env.colliders.size < 3) env.colliders = null; }
    const keys = new Set([...(src.v ? src.v.files.keys() : []), ...src.local.keys()]);
    env.levels = new Map();
    for (const k of keys) if (k.startsWith('resource/set/ability/') && k.endsWith('.set')) {
      const t = readTree(k); if (!t) continue;
      for (const top of t.items) if (top.k === 'BLOCK') {
        const n = nameOf(top); if (!n) continue;
        const lv = env.levels.get(n) || new Set(); env.levels.set(n, lv);
        for (const l of M.parts(top, false).kids) { const lp = M.parts(l, false); if (lp.key === 'level' && lp.toks[0]) lv.add(String(lp.toks[0].k === 'STRING' ? lp.toks[0].value : lp.toks[0].text).toLowerCase()); }
      }
    }
    if (!env.levels.size) env.levels = null;
  } catch (e) { rep.add('keylint', 0, 'CRASH', 'env: ' + e.message); }

  // key -> paths index per kind (for "valid elsewhere" hints)
  const kindIdx = {};
  const idxOf = kind => {
    if (kindIdx[kind]) return kindIdx[kind];
    const m = new Map();
    for (const [p, ps] of Object.entries(vocab.kinds[kind] || {})) for (const k of Object.keys(ps.k)) { const a = m.get(k) || []; if (a.length < 3) a.push(p); m.set(k, a); }
    return kindIdx[kind] = m;
  };

  // keys that repeat legitimately somewhere in vanilla (interaction commands like weapon_work): never a KEY_REPEAT hint
  const dupAnywhere = new Set();
  for (const ps of Object.values(vocab.kinds)) for (const e of Object.values(ps)) for (const [k, s] of Object.entries(e.k)) if (s.dup) dupAnywhere.add(k);

  let cur = null;
  const loc = n => {
    if (isMine(n.file)) return { file: n.file, line: n.line, note: '' };
    let x = n.via; while (x && !isMine(x.file)) x = x.via;
    return x ? { file: x.file, line: x.line, note: ` [from ${n.file}:${n.line}]` } : null;
  };
  const push = (info, a, code, msg) => {
    const l = loc(a); if (!l) return;
    cur.push({ info, file: l.file, line: l.line, code, msg: msg + l.note, dk: l.file + ':' + l.line + ':' + code });
  };

  // SDL-56: call sites whose omitted `%word` param expands to <shorter passed param>rest (sdlx overlaps): warned at the call site;
  // a surplus token produced through such a site is that same defect, not a data error in the macro body
  let ovSites = new Set();
  const viaOv = n => { for (let x = n; x; x = x.via) if (ovSites.has(x.file + ":" + x.line)) return true; return false; };
  const noteOverlaps = r => {
    ovSites = new Set();
    for (const o of (r && r.overlaps) || []) {
      ovSites.add(o.file + ":" + o.line);
      push(false, o, "WARN_PARAM_PREFIX", `macro call passes ${o.param}(..) but not ${o.word}(..) (passed by other calls): body text %${o.word} expands to <${o.param}>${o.word.slice(o.param.length)} (longest-name-first textual substitution; stray token / Unread data detected) (SDL-56)`);
    }
  };

  // per-block hand-outs (the same for every block: made once, not per child)
  const emitW = (a, code, msg) => push(false, a, 'WARN_' + code, msg);
  const xEmit = (a, code, msg) => push(false, a, code, msg), xInfo = (a, code, msg) => push(true, a, code, msg);
  const xDead = (a, msg) => push(vfsMode, a, 'DEAD_KEY', msg), xWarnDead = (a, msg) => push(false, a, 'WARN_DEAD_KEY', msg);
  // M.fast() (KEYLINT_FAST, default on): pure lookups kept for the run. near(scope, name, cands)
  // = M.nearest(name, cands()) per (scope, name), scope naming the candidate list: a string (schema keys, vocab block keys of a
  // kind + path) or the key stats object whose enum words are the list
  const nears = new Map(), nearsOf = new WeakMap();
  const near = (scope, name, cands) => {
    if (!M.fast()) return M.nearest(name, cands());
    let m = nears, k = name;
    if (typeof scope === 'string') k = scope + '\0' + name; else if (!(m = nearsOf.get(scope))) nearsOf.set(scope, m = new Map());
    let r = m.get(k);
    if (r === undefined) { r = M.nearest(name, cands()); m.set(k, r); }
    return r;
  };
  const onlyNumOf = p => !M.fast() ? [...p.set].every(x => NUMS.has(x)) : p._num !== undefined ? p._num : (p._num = [...p.set].every(x => NUMS.has(x)));

  // ---- learned value checks for one child block c with parts cp against key stats ks
  function valueChecks(cp, ks, c, kind, key, emitW) {
    const a = analyze(ks), toks = cp.toks, sg = toks.map(M.sigOf);
    // learned types are evidence, not the engine: only a monomorphic, well-sampled key is counted; others are info hints
    const strong = ks.n >= 50 && a.nsig <= 2 && a.cov >= 0.98 && !ks.kids;
    const hint = (an, code, msg) => push(true, an, code, msg);
    const E = (an, code, msg) => strong ? emitW(an, code, msg) : push(true, an, code, msg);
    if (sg.includes('P') || sg.includes('?')) return;
    // SDL-36 missing value
    if (a.mono && ks.n >= MIN_N && !toks.length && !cp.kids.length && !a.empty && a.lens.size) (strong && [...(a.pos[0] ? a.pos[0].set : [])].every(x => NUMS.has(x)) ? emitW : hint)(c, 'VALUE_MISSING', `{${key}} has no value; all ${ks.n} vanilla uses give one (reader throws, SDL-36)`);
    // SDL-35 surplus
    if (a.mono && ks.n >= MIN_N && !a.trunc && a.lens.size <= 2 && toks.length > a.max && a.max > 0 && !viaOv(toks[a.max]))
      (strong && !LIST_KEYS.has(key) && !a.letters.has(sg[a.max]) ? emitW : hint)(toks[a.max], 'VALUE_SURPLUS', `{${key}} takes ${a.max} value(s) in vanilla (${ks.n} uses); extra "${toks[a.max].text}" is dropped with 'Unread data detected' (SDL-35)`);
    const t0 = toks[0];
    // SDL-32 bool
    if (t0 && ks.n >= MIN_N && a.bool && a.mono) {
      if (t0.k === 'IDENT' && /^(no|off)$/i.test(t0.text)) E(t0, 'BOOL_NO_IS_TRUE', `{${key} ${t0.text}}: bool reads "${t0.text}" as TRUE (use false/0) (SDL-32)`);
      else if (t0.k === 'STRING' || t0.k === 'FLOAT') E(t0, 'BOOL_BAD_TOKEN', `{${key} ${t0.k === 'STRING' ? '"' + t0.text + '"' : t0.text}}: bool does not consume ${t0.k} -> true + 'Unread data detected' (SDL-32)`);
    }
    // SDL-39 colour
    const colorKey = key[0] !== '*' && key[0] !== '#' && ks.col >= 3 && ks.col >= 0.8 * ks.n, nameKey = key.endsWith('color') || key.endsWith('colour');   // = /colou?r$/
    if (colorKey || nameKey) for (const t of toks) if (t.k === 'STRING') {
      const s = t.value.trim();
      if (/^(0x)?[0-9a-f]+$/i.test(s) && !COLOR_NAMES.has(s.toLowerCase()) && !M.hexColor(s))
        (colorKey ? (cc, m) => push(false, cc, 'COLOR_HEX_LEN', m) : (cc, m) => emitW(cc, 'COLOR_HEX_LEN', m))(t, `colour "${s}": hex must be exactly 6 or 8 digits (fatal "Incorrect color definition") (SDL-39)`);
    }
    // SDL-41 timespan truncation, SDL-42 quant tick float
    const e0 = typeAt(key, 0, kind), at = e => e ? ` [engine ${e.t}: ${e.src}]` : '';
    if (t0 && t0.k === 'FLOAT' && !t0.expr && t0.value !== 0 && Math.abs(t0.value) < 0.001 && (e0 ? e0.t === 'timespan' : !FIELDS[key] && /(time|duration|delay|timeout|period)$/.test(key) && ks.n >= MIN_N))   // name guess only for keys the engine map does not know (RelaxationTime is a float range)
      (e0 ? (a, c, m) => push(false, a, c, m) : emitW)(t0, 'TIMESPAN_TRUNC', `{${key} ${t0.text}}: time span truncates to ms (int)(1000*s): ${t0.text} s = 0 ms (SDL-41)${at(e0)}`);
    if (t0 && t0.k === 'FLOAT' && (e0 ? e0.t === 'quant' : /(^|_)ticks?$|quanttick/.test(key))) (e0 ? (a, c, m) => push(false, a, c, m) : emitW)(t0, 'QUANT_FLOAT', `{${key} ${t0.text}}: eQuantTick is an integer ms count; float is fatal (SDL-42)${at(e0)}`);
    // per-position type checks
    for (let i = 0; i < toks.length; i++) {
      const p = a.pos[i]; if (!a.mono || !p || p.n < MIN_N) continue;
      const t = toks[i], st = sg[i], S = p.set;
      const onlyI = S.size === 1 && S.has('I'), onlyNum = onlyNumOf(p), onlyS = S.size === 1 && S.has('S');
      const ei = typeAt(key, i, kind), engInt = ei && ei.t === 'int', engStr = ei && ei.t === 'resource';
      // learned + engine agree -> error; engine reads a float -> vanilla ints were style, no hint
      const sure = (ok, code, msg) => ok ? push(false, t, code, msg + at(ei)) : ei && ei.t === 'float' ? null : hint(t, code, msg);
      if (st === 'F' && onlyI) sure(engInt, 'INT_GOT_FLOAT', `{${key} ... ${t.text}}: all ${p.n} vanilla values at this position are INTEGER; float literal is fatal "Integer expected!" in int fields (SDL-29)`);
      else if (st === 'X' && onlyI) sure(engInt, 'INT_GOT_EXPR', `{${key} ... (arithmetic)}: arithmetic yields a FLOAT token; int fields reject it (SDL-26/29)`);
      else if ((st === 'T' || st === 'I' || st === 'F') && onlyS && engStr) push(false, t, 'STRING_EXPECTED', `{${key} ... ${t.text}}: engine reads a ${ei.t} here; identifiers/numbers rejected (SDL-44)${at(ei)}`);
      else if ((st === 'S' || st === 'T') && onlyNum && !(st === 'T' && a.bool)) E(t, 'FLOAT_GOT_NONNUM', `{${key} ... ${st === 'S' ? '"' + t.text + '"' : t.text}}: all ${p.n} vanilla values at this position are numbers; ${st === 'S' ? 'string' : 'identifier'} gives fatal "Number expected!" (SDL-31)`);
      else if ((st === 'T' || st === 'I' || st === 'F') && onlyS) (strong && RES_KEY.test(key) ? emitW : hint)(t, 'STRING_EXPECTED', `{${key} ... ${t.text}}: all ${p.n} vanilla values at this position are quoted strings; resource-name fields reject identifiers/numbers (SDL-44)`);
    }
    // SDL-37 enum
    if (t0 && t0.k === 'IDENT' && toks.length === 1 && ks.n >= 20 && a.enum && a.cov >= 0.95 && ks.v && !ks.v[t0.text.toLowerCase()] && !a.bool && !(R.ENGINE_ENUMS[key] || []).includes(t0.text.toLowerCase())) {
      const dym = near(ks, t0.text.toLowerCase(), () => Object.keys(ks.v));
      (dym && Object.keys(ks.v).length <= 12 ? emitW : (an, code, msg) => push(true, an, code, msg))(t0, 'ENUM_UNKNOWN', `{${key} ${t0.text}}: not among the ${Object.keys(ks.v).length} values seen in vanilla (${Object.keys(ks.v).slice(0, 8).join(' ')}${Object.keys(ks.v).length > 8 ? ' ...' : ''})${dym ? '; did you mean "' + dym + '"?' : ''} (unknown enum name reads as invalid, silently) (SDL-37)`);
    }
  }

  // ---- tree walk
  // M.fast(): block paths as a kept tree of nodes per kind, { p, vp, use, sch, kids: Map key -> node }: a child's path string, vocab
  // entry and schema are looked up once per (kind, path) for the run, not built and hashed again for every block
  const pathRoots = new Map();
  const pathNode = (kind, p) => {
    const vp = (vocab.kinds[kind] || {})[p];
    const use = vp && vp.n >= 10 && (vp._open === undefined ? (vp._open = Object.keys(vp.k).length > 150) : vp._open) === false;
    return { p, vp, use, sch: undefined, ks: undefined, kids: new Map() };
  };
  const rootNode = (kind, p) => {
    let m = pathRoots.get(kind); if (!m) pathRoots.set(kind, m = new Map());
    let n = m.get(p); if (!n) m.set(p, n = pathNode(kind, p));
    return n;
  };
  const kidNode = (N, kind, key) => { let n = N.kids.get(key); if (!n) N.kids.set(key, n = pathNode(kind, M.childPath(N.p, key))); return n; };
  function walk(b, p, kind, isRoot, depth, st, pcp, pkey, N) {
    if (!N && M.fast()) N = rootNode(kind, p);
    const vp = N ? N.vp : (vocab.kinds[kind] || {})[p];
    const use = N ? N.use : vp && vp.n >= 10 && (vp._open === undefined ? (vp._open = Object.keys(vp.k).length > 150) : vp._open) === false;
    const pc = isRoot ? M.parts(b, true) : M.partsM(b);
    const seen = new Map();
    // AI-19 / GPL-08: engine-derived key sets (rules.js SCHEMAS) judge these blocks; the learned vocab stays silent there
    // goh: the schemas are AS2 engine reads, the GoH vocab judges instead
    const sch = FILE_FX || goh ? null : N ? (N.sch !== undefined ? N.sch : (N.sch = R.schemaFor(kind, p))) : R.schemaFor(kind, p);
    pc.kids.forEach((c, i) => {
      const cp = M.partsM(c);
      if (cp.keyTok && cp.keyTok.k === 'IDENT' && cp.keyTok.text[0] === '%') return;
      const key = cp.key, CN = N ? kidNode(N, kind, key) : null, tail = CN ? CN.p : M.childPath(p, key);
      const ks = CN ? (CN.ks !== undefined ? CN.ks : (CN.ks = vp && vp.k[key])) : vp && vp.k[key];   // the key's stats in its parent's vocab entry
      const x = { kind, path: p, key, tail, cp, pcp: pc, pkey, c, fs: st.fs, env, goh, emit: xEmit, info: xInfo, warn: emitW, dead: xDead, warnDead: xWarnDead };
      if (sch && cp.keyTok && cp.keyTok.k === 'IDENT' && !sch.keys.has(key)) {
        const dym = near('s' + kind + '\0' + p, key, () => [...sch.keys]);
        push(false, c, sch.row === 'FATAL' ? 'KEY_FATAL' : 'UNKNOWN_KEY', `unknown key "${cp.keyTok.text}" in ${sch.label} block "${p}"` + (dym ? `; did you mean "${dym}"?` : '') +
          ` (engine reads only: ${[...sch.keys].join(' ')}; ${sch.row === 'AI-19' ? 'no effect / reader logs "unexpected token"' : sch.row === 'FATAL' ? 'reader hits ERROR_MSG: the file fails to load' : 'DDA skips unknown fields silently'}) [${sch.src}] (${sch.row})`);
      } else if (!sch && use && !ks && cp.keyTok && cp.keyTok.k === 'IDENT' && !(R.ENGINE_KEYS[p] || []).includes(key)) {
        const dym = near('v' + kind + '\0' + p, key, () => Object.keys(vp.k)), elsewhere = (idxOf(kind).get(key) || []).filter(q => q !== p);
        (dym && !elsewhere.length ? emitW : (an, code, msg) => push(true, an, code, msg))(c, 'UNKNOWN_KEY', `unknown key "${cp.keyTok.text}" in ${kind} block "${p || '(file)'}"` +
          (dym ? `; did you mean "${dym}"?` : '') + (elsewhere.length ? `; "${key}" is valid under: ${elsewhere.join(', ')}` : '') + ' (engine skips unknown keys silently) (SDL-34)');
      }
      if (ks) {
        if (use && STRICT_KINDS.has(kind) && cp.keyTok && cp.keyTok.k === 'IDENT') {
          const sp = ks.sp ? Object.keys(ks.sp) : [key];
          if (!sp.includes(cp.keyTok.text)) push(false, c, 'KEY_CASE', `key "${cp.keyTok.text}": DDA key names are case-sensitive (strcmp); vanilla spells it "${sp.join('" / "')}" -> silently ignored (SDL-33)`);
        }
        valueChecks(cp, ks, c, kind, key, emitW);
        // SDL-46 repeated scalar
        const gn = STRICT_KINDS.has(kind) && cp.keyTok && cp.keyTok.k === 'IDENT' ? cp.keyTok.text : key;   // DDA: keys differing in case are different keys
        let sm = seen, gk = gn;   // fast: Map group -> Map name (no "group|name" string per block); else the joined key as before
        if (N) { sm = seen.get(pc.groups[i]); if (!sm) seen.set(pc.groups[i], sm = new Map()); } else gk = pc.groups[i] + '|' + gn;
        sm.set(gk, (sm.get(gk) || 0) + 1);
        if (sm.get(gk) === 2 && use && ks.n >= 100 && !ks.dup && !dupAnywhere.has(key) && !ks.kids && cp.toks.length && !cp.kids.length)
          emitW(c, 'KEY_REPEAT', `{${key}} repeated in one block; vanilla never repeats it (${ks.n} uses); scalar: last wins (SDL-46)`);
      }
      R.onBlock(x);
      if (depth < M.MAX_DEPTH) walk(c, tail, kind, false, depth + 1, st, pc, key, CN);
    });
  }

  return { rep, src, mods, vfsMode, pakItems, walk, gohGame, setCur: v => { cur = v; }, getCur: () => cur, setBuf: k => { bufKey = k; }, noteOverlaps };
}

// KEY-01 listing: every *.patch and N.pat file below the folder, each list sorted as report.walkFiles gives it (full path text).
// One walk for both (before: two report.walkFiles of the whole folder); folders named .arsenal-undo (restore points, never
// mounted) are not entered unless rp. Sync walk, or (async) folders listed through the thread pool, WALK_WIN at a time.
const UNDO = '.arsenal-undo', WALK_WIN = 32;
const rpDefault = () => { const was = sdlset.restorePoints(false); sdlset.restorePoints(was); return was; };   // the process default of lib/sdlset
const PAT_RE = /^[0-9]+\.pat$/i, PATCH_RE = /\.patch$/i;
function patchFiles(root, rp) {
  const pats = [], patches = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (rp || e.name.toLowerCase() !== UNDO) walk(p); }
      else { if (PAT_RE.test(e.name)) pats.push(p); if (PATCH_RE.test(e.name)) patches.push(p); }
    }
  })(root);
  return { pats: pats.sort(), patches: patches.sort() };
}
// the same lists from a lib/modtree scan T of root (no readdir): its listed files, plus what the scan left out (a folder it
// does not enter is walked as above; a link or other entry is one name, as walkFiles' Dirent saw it)
function patchFilesOf(T, root, rp) {
  const pats = [], patches = [];
  const undoIn = rel => { const l = '/' + rel.toLowerCase() + '/'; return l.includes('/' + UNDO + '/'); };
  const name = (p, nm) => { if (PAT_RE.test(nm)) pats.push(p); if (PATCH_RE.test(nm)) patches.push(p); };
  for (const r of T.files) { if (!rp && undoIn(r[0])) continue; name(path.join(root, r[0]), r[0].slice(r[0].lastIndexOf('/') + 1)); }
  for (const rel of T.left) {
    if (!rp && undoIn(rel)) continue;
    const p = path.join(root, rel); let st; try { st = fs.lstatSync(p); } catch (e) { continue; }
    if (st.isDirectory()) { const sub = patchFiles(p, rp); pats.push(...sub.pats); patches.push(...sub.patches); }
    else name(p, rel.slice(rel.lastIndexOf('/') + 1));
  }
  return { pats: pats.sort(), patches: patches.sort() };
}
// listFolder(root, rp) -> Promise<T>: the folder listed through the thread pool, WALK_WIN folders at a time, names only (no stat
// per file: lib/modtree scan stats each one and took 128 s on the 112k-file mod on a USB hard disk, three sync walks ~45 s).
// T has the lib/modtree scan shape lib/sdlset createSource takes as o.listing: { dir, files: [[rel]], left: [rel] }, rel with
// forward slashes; left = links and entries that are neither file nor folder (read from the disk where needed, as with a scan).
// Folders named .arsenal-undo are not entered unless rp (nothing reads them then: sdlset keepOf, its pak walk, KEY-01).
// An unreadable folder rejects (the caller then walks as before, which fails the same way it always did).
async function listFolder(root, rp) {
  const files = [], left = [], queue = [''];
  let flying = 0, failed = false;
  await new Promise((resolve, reject) => {
    const pump = () => {
      if (failed) return;
      if (!queue.length && !flying) return resolve();
      while (queue.length && flying < WALK_WIN) {
        const rel = queue.pop(); flying++;
        fs.promises.readdir(rel ? path.join(root, rel) : root, { withFileTypes: true }).then(ents => {
          for (const e of ents) {
            const r = rel ? rel + '/' + e.name : e.name;
            if (e.isDirectory()) { if (rp || e.name.toLowerCase() !== UNDO) queue.push(r); }
            else if (e.isFile()) files.push([r]);
            else left.push(r);
          }
          flying--; pump();
        }, err => { failed = true; reject(err); });
      }
    };
    pump();
  });
  return { dir: root, files, left: left.sort() };
}

// the check as steps: yields a Promise only when io.ra (a lib/sdlset readAhead, async run) has a file read still running;
// the sync driver (check) never gets one. Same files, same order, same findings either way.
//   - each todo file is read once: its bytes feed the SDL walk and the CHK-KEY armor text pass (before: read twice)
//   - includes are read once per run (open results kept by key; before: an include was read again by every file using it)
//   - KEY-01: one walk of the folder for N.pat and .patch (from opts.listing when given, else a sync walk), without .arsenal-undo unless rp
function* steps(opts, io) {
  const rp = opts.restorePoints != null ? !!opts.restorePoints : rpDefault();
  const { rep, src, mods, vfsMode, pakItems, walk, setCur, noteOverlaps, gohGame } = makeCtx(opts);
  const fields = useFields(gohGame);   // 'goh' | 'as2': the engine field table used (returned for tests)
  let cur = null;
  // ---- files
  let todo = opts.vfs ? src.vfsItems() : src.folderItems();
  if (!opts.vfs && mods) { const have = new Set(todo.map(t => t.key)); todo = todo.concat(src.modItems().filter(t => !have.has(t.key))); }
  if (pakItems.length) { todo = todo.concat(pakItems); rep.info(opts.folder, 0, 'KEYLINT_PAKS_READ', `GoH mod not mounted: ${pakItems.length} SDL entries of its resource paks read directly (pak order = name order [I])`); }
  const CK = require('./chkkey');
  const ARMOR_RE = /\.(def|ext|inc|def1|mdl)$/i, armor = new Map(), armorSeen = new Set();
  // include resolver over src.open, each (kind, key) opened once; a kept answer still marks the key included (src.included)
  const incs = new Map();
  const openC = (r, from) => {
    const k = r.kind + '\0' + r.key;
    if (incs.has(k)) { src.included.add(r.key); return incs.get(k); }
    const f = src.open(r, from); incs.set(k, f); return f;
  };
  const ra = io && io.ra;
  if (ra) for (const t of todo) if (t.path) ra.add(t.key, t.path);
  const reads = []; let skipped = 0;
  for (const t of todo) {
    if (ra) { const p = ra.wait(t.key); if (p) yield p; }
    try {
      cur = []; setCur(cur);
      let b = ra && t.path ? ra.take(t.key) : undefined;
      if (b === undefined) b = t.get();
      if (ARMOR_RE.test(t.key) && !armorSeen.has(t.key)) { armorSeen.add(t.key); if (b) armor.set(t.key, CK.armorText(b.toString('latin1'))); }
      // = src.read(t): null for binary
      if (b.includes(0) && !bomKind(b)) { skipped++; continue; }
      const lint = () => {
        const r = sdlx.read(b, { file: t.file, key: t.key, open: openC, onError() {}, preInclude: src.preInclude(t.key) });
        FILE_FX = scopeKey(t.key); noteOverlaps(r);
        walk(r.root, '', M.kindOf(t.key), true, 0, { fs: new Map() }, null, '');
      };
      // speed-ups (M.fast) on: a file whose walk throws is walked again the old way before it counts as a CRASH
      if (!M.fast()) lint();
      else try { lint(); } catch (e) { cur = []; setCur(cur); const was = M.memo(false); try { lint(); } finally { M.memo(was); } }
      reads.push({ key: t.key, list: cur });
    } catch (e) { rep.add(t.file, 0, 'CRASH', e.stack.split('\n').slice(0, 3).join(' | ')); }
    finally { if (ra) ra.drop(t.key); }
  }
  incs.clear();
  const seen = new Set(), infoN = {}, INFO_CAP = +process.env.KEYLINT_INFO_CAP || 40; let n = 0;
  for (const r of reads) {
    if (src.included.has(r.key)) continue;
    n++;
    const ifl = new Set(r.list.filter(f => f.code === 'INT_FIELD_FLOAT').map(f => f.file + ':' + f.line));
    for (const f of r.list) {
      if (seen.has(f.dk)) continue; seen.add(f.dk);
      if (/^INT_GOT_(FLOAT|EXPR)$/.test(f.code) && ifl.has(f.file + ':' + f.line)) continue;   // explicit SDL-30 rule already says it
      if (f.info) { infoN[f.code] = (infoN[f.code] || 0) + 1; if (infoN[f.code] <= INFO_CAP) rep.info(f.file, f.line, f.code, f.msg); } else rep.add(f.file, f.line, f.code, f.msg);
    }
  }
  for (const [c, k] of Object.entries(infoN)) if (k > INFO_CAP) rep.info('keylint', 0, c, `... ${k - INFO_CAP} more ${c} hints hidden (${k} total)`);
  // CHK-KEY: TST-80 armor macro arg counts (raw text of own entity files), AI-12 / AI-15 bot Lua (not SDL, so outside the walk)
  // (the armor findings were taken from each file's bytes in the walk above; emitted here, in the order they always were)
  const seenT = new Set();
  for (const t of todo) {
    if (!ARMOR_RE.test(t.key) || seenT.has(t.key)) continue; seenT.add(t.key);
    const fl = armor.get(t.key); if (!fl) continue;
    for (const f of fl) rep.add(t.file, f.line, 'ARMOR_MACRO_ARGS', f.msg);
  }
  armor.clear();
  const luaKeys = new Set();
  for (const k of src.local.keys()) if (CK.isBotLua(k)) luaKeys.add(k);
  if (src.v) for (const k of src.v.files.keys()) if (CK.isBotLua(k) && (vfsMode || mods && src.isModKey(k))) luaKeys.add(k);
  for (const k of [...luaKeys].sort()) {
    const b = src.get(k); if (!b) continue;
    for (const f of CK.luaPass(k, b.toString('utf8'))) rep.add(k, f.line, f.code, f.msg);
  }
  // KEY-01: loose .patch files are never read
  if (src.folder && fs.statSync(src.folder).isDirectory()) {
    let pl = null;
    if (opts.listing && path.resolve(opts.listing.dir) === src.folder) pl = patchFilesOf(opts.listing, src.folder, rp);
    else pl = patchFiles(src.folder, rp);
    const pats = pl.pats.map(f => fs.statSync(f).mtimeMs);
    for (const f of pl.patches) {
      const rel = relPath(src.folder, f), st = fs.statSync(f).mtimeMs;
      if (!pats.length) rep.add(rel, 0, 'LOOSE_PATCH', '.patch outside an N.pat archive is never read by the engine (no N.pat in the mod); pack it into N.pat');
      else if (st > Math.max(...pats) + 1000) rep.add(rel, 0, 'LOOSE_PATCH', 'loose .patch is newer than every N.pat: edits are not in the mounted archive (engine never reads the loose file); repack N.pat');
      else rep.info(rel, 0, 'LOOSE_PATCH', 'loose .patch is never read (editable source of N.pat)');
    }
  }
  return { rep, files: n, skipped, fields, exe: src.v ? src.v.exe : null };
}

// check(opts) -> { rep, files, skipped, fields, exe }   sync, files read one at a time
// opts: { folder|vfs, gameDir, mods, vocab, exe, restorePoints (also read <folder>/.arsenal-undo, off by default) }
function check(opts) {
  const g = steps(opts, null);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}
// checkAsync(opts, { window = 128, maxBytes = 128 MB }) -> Promise<same as check>: the folder's SDL files read through the
// thread pool ahead of the walk (lib/sdlset readAhead), the KEY-01 walk lists folders in parallel. Same findings, same order.
// ao.ra: a readAhead stand-in to read through instead (lib/modset read-once pass, ctx.js), closed at the end. ao.listing: the
// pass's lib/modtree scan of the folder, taken instead of listFolder when it is that folder and restore points are left out
// (the scan leaves them out too; a folder it does not enter is in its left list, read from the disk as with listFolder)
async function checkAsync(opts, ao = {}) {
  const ra = ao.ra || sdlset.readAhead({ window: ao.window || 128, maxBytes: ao.maxBytes || 128 * 1024 * 1024 });
  const io = { ra };
  // the folder listed once, through the thread pool (listFolder): the source's loose map and pak walk and the KEY-01 lists come
  // from it (before: three sync walks of the folder). Not listed (--vfs, a given listing, a folder that cannot be read): as before
  let T = null;
  if (opts.folder && !opts.vfs && !opts.listing) {
    const rp = opts.restorePoints != null ? !!opts.restorePoints : rpDefault();
    try {
      const d = path.resolve(opts.folder), L = ao.listing;
      if (L && !rp && !L.names && path.resolve(L.dir) === d) T = L;
      else if (fs.statSync(d).isDirectory()) T = await listFolder(d, rp);
    } catch (e) { T = null; }
  }
  const g = steps(T ? { ...opts, listing: T } : opts, io);
  try {
    let r = g.next();
    while (!r.done) { await r.value; r = g.next(); }
    return r.value;
  } finally { ra.close(); }
}

// run(opts) -> report (no printing); opts as check: {folder|vfs, gameDir, mods, vocab, exe}
function run(opts) { return check(opts).rep; }

// thread pool 16 (libuv default 4) unless set: more reads queued at the disk at once; 112k-file mod on a USB hard disk,
// window 128: 101 s with 16 vs 112-118 s with 4 (busy PC) [I: one run each]
if (require.main === module && !process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '16';
// main(argv, {ra, listing}): the CLI (and ctx.js, the read-once module form: the pass's reader as ra and its listing; an error
// rejects, so the pass runs keylint as a program instead)
async function main(argv, { ra, listing } = {}) {
  const o = cli.parse(argv, { flags: ['--vfs', '--time', '--restore-points'], values: ['--vocab'] });
  const opts = { gameDir: o.gameDir, mods: o.mods.length ? o.mods : undefined, vfs: o.x.vfs, folder: o.pos[0], vocab: o.x.vocab, exe: o.exe };
  if (o.x['restore-points']) opts.restorePoints = true;
  if (!opts.folder && !opts.vfs || opts.vfs && !opts.gameDir) { console.error('usage: keylint <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--vocab file] [--time] [-q] [--summary] [--format text|json|sarif] [-o file] | --vfs --game dir'); process.exit(2); }
  const t0 = Date.now();
  const { rep, files, skipped } = await checkAsync(opts, ra ? { ra, listing } : {});
  cli.printReport(rep, o, { tool: 'keylint' });
  const line = `${files} files (${skipped} binary skipped)${o.x.time ? ` in ${Date.now() - t0} ms` : ''}`;   // DET-FIX: clock values only with --time
  if (o.format === 'text' && !o.output) console.log(line); else console.error(line);
}
if (require.main === module) cli.run(() => main(process.argv.slice(2)));
// ---- lintBuffer: live linting of one in-memory file. The context (vocab, fields.json, vfs/source, env sets) is built on the
// first call per (gameDir, mods, vocab) and reused; later calls cost the one file. Includes resolve through the vfs, not the buffer.
// lintBuffer({ key, text|buf, gameDir?, mods?, vocab?, folder?, exe?, info? }) -> [{ line, code, msg, sev: 'error'|'warn'|'info' }]
//   exe: vfs exe of the game ('as64'|'mowas_2'|'mowas2'|'goh'); none = as before (the vfs pick); part of the context cache key
const ctxCache = new Map();
function encode(text) { return Buffer.from(String(text), 'utf8'); }   // editor text -> bytes as saved: UTF-8 (as64 reads SDL strings as UTF-8, ENCFIX)
// o.folder = mod root: its loose files (colliders.set, pather.set, ability sets, includes) feed the context, cached per folder.
// invalidate(o) drops the cached context (call when one of those folder files is saved); same option fields as lintBuffer
const ctxKey = o => JSON.stringify([o.gameDir || '', o.mods || [], o.vocab || '', o.folder ? path.resolve(o.folder) : ''].concat(o.exe ? [require('../lib/games').exeOf(o.exe) || o.exe] : []));
function invalidate(o) { ctxCache.delete(ctxKey(o)); }
// memoHold(true) .. memoHold(false) (a whole-mod check, ide/intel/fixes memoBegin/memoEnd): while at least one holder is open,
// lintBuffer's include reads go through the source's memo (lib/sdlset memo: each included file read once); the last holder's
// end drops every kept byte, and so does a hold older than HOLD_MAX with no new holder (a holder that never ended). The
// buffer under check is never kept. Off: includes are read from the disk on every call, as before.
let HOLD = 0, HOLD_AT = 0;
const HOLD_MAX = 30 * 60 * 1000;
const memoDrop = () => { HOLD = 0; for (const c of ctxCache.values()) { try { c.src.memo(false); } catch (e) { /* no memo */ } } };
function memoHold(on) {
  if (on) { HOLD++; HOLD_AT = Date.now(); return HOLD; }
  if (HOLD > 0 && --HOLD === 0) memoDrop();
  return HOLD;
}
function lintBuffer(o) {
  const ck = ctxKey(o);
  let ctx = ctxCache.get(ck);
  if (!ctx) { ctx = makeCtx({ gameDir: o.gameDir, mods: o.mods, vocab: o.vocab, folder: o.folder, exe: o.exe }); ctxCache.set(ck, ctx); }
  if (HOLD) { if (Date.now() - HOLD_AT > HOLD_MAX) memoDrop(); else ctx.src.memo(true); }
  useFields(ctx.gohGame);
  const key = String(o.key).replace(/\\/g, '/').toLowerCase(), buf = o.buf || encode(o.text || '');
  if (!sdlset.isSdl(key) || buf.includes(0) && !require('../lib/enc').bomKind(buf)) return [];
  const cur = []; ctx.setCur(cur); ctx.setBuf(key);
  try {
    const r = sdlx.read(buf, { file: key, key, open: ctx.src.open, onError() {}, preInclude: ctx.src.preInclude(key) });
    FILE_FX = scopeKey(key); ctx.noteOverlaps(r);
    ctx.walk(r.root, '', M.kindOf(key), true, 0, { fs: new Map() }, null, '');
  } catch (e) { return [{ line: 1, code: 'CRASH', msg: String(e.message), sev: 'error' }]; }
  finally { ctx.setBuf(null); }
  const seen = new Set(), out = [];
  const ifl = new Set(cur.filter(f => f.code === 'INT_FIELD_FLOAT').map(f => f.file + ':' + f.line));
  for (const f of cur) {
    if (f.file !== key || seen.has(f.dk)) continue; seen.add(f.dk);
    if (/^INT_GOT_(FLOAT|EXPR)$/.test(f.code) && ifl.has(f.file + ':' + f.line)) continue;
    if (f.info && !o.info) continue;
    out.push({ line: f.line, code: f.code, msg: f.msg, sev: f.info ? 'info' : f.code.startsWith('WARN_') ? 'warn' : 'error' });
  }
  return out;
}
module.exports = { check, checkAsync, run, lintBuffer, invalidate, vocabPath, memoHold, main };
