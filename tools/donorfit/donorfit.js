#!/usr/bin/env node
// donorfit: does a donor def's bone/volume vocabulary fit its mdl? (lim PORT-122: a miss = no log line, unit never operatable)
//   node tools/donorfit/donorfit.js <def> [--mdl file] --game G [--mods a,b] [--exe as64|mowas_2] [--json]
//   --exe as64|mowas_2|mowas2: the AS2 game whose vfs view resolves the includes (none = vfs default, as before); --exe goh is refused (exit 2, one line); with --exe, --json carries "exe": the vfs exe it resolved to
// expands macros/includes (lib/sdlx via lib/vfs), then checks every resulting name against the mdl's bones and volumes.
// exit 0 clean (notes and warnings allowed), 1 a blocking miss, 2 usage/unreadable. [I] mdl bone/volume rule
//   [--moddir dir]  mod folder holding resource/ (default: the part of the def's path before /resource/); with it the folder check runs
//   [--rep name]    the rep unit's name, for the calibre warning
// DFIT-4 (PORT-137): a missing door (crew macro's driver door, e.g. emit0) is a blocking miss (FAIL, exit 1; gun = lead); a missing visor bone is warning DF_VISOR;
//   --fit also names a crew macro of the game whose doors the mdl has, or says none fits
// blocking codes (miss key):  volume bone-block foresight LinkBone door crew-place (name not in mdl; PORT-122),
//   DF_PLAIN_BONE (FMT-05 [V]: def {bone "x"} with {limits}/{speed} where the mdl's x is a plain bone),
//   DF_FOLDER (PORT-131: the Extension's folder lacks mdl / a ply's .mtl / an mdl sequence's .anm / a .vol the mdl names; the vfs counts as present)
// warnings (exit stays 0):  DF_CREW_SEATS DF_SHOOTER DF_PIVOT DF_WEAPON
//   DFIT-3: DF_AIM (PORT-134/84: the weapon's pattern default aim bone absent, no {foresight} on the place; pattern read from the vfs/mod stuff, else a note)
//   DF_BARRELS (PORT-135: {Barrels n>1}, mdl has shot1/shot2 not shooter00/01), DF_GUN_BASIS (PORT-133: towed gun, plain mdl basis),
//   DF_ARMOUR (PORT-136: def armor_* class vs rep class; --rep-class, or the rep's def in vfs/mod, else a note), DF_FG (fg in the box, rep a tank),
//   DF_MACRO (PORT-136: enumerator extender / shield volume from a macro, no mdl bone)
//   CHK-DONOR: WARN_FILLING_GUN (PORT-156: {weapon "X" filling ".."} lacks words of X's own {filling}), WARN_FILLING_FORM (PORT-162: no stuff file name carries all filling words)
//   [--rep-class light|medium|heavy] [--rep-kind tank|car|gun]   [--fit] print the smallest edits for the misses and warnings (text only, writes nothing)
// FXC-2: --fit --write [--out f]  applies the drops and renames the misses call for to a COPY (default <def stem>.fit.def beside the def; the input is
//   overwritten only when --out names it), up to 5 rounds (a dropped place can leave a crew-place miss), rechecks the result and lists what it could not apply.
//   A local {extension "x.ext"} that needs edits is written next to the output (x.fit.ext when that would overwrite the input ext) and the output def points at it.
//   Rules: a weapon place with a missing LinkBone (or a crew place that does not exist) goes whole: the place, its {item .. {user "<place>"}}, and the
//   secondary crew line ("..." place(<crew>)) no live place uses; a volume/bone-block with a free lookalike in the mdl is renamed, else dropped; foresight, direct
//   door and DF_PLAIN_BONE fields are dropped; a macro-born door is renamed on its call line, or the call line is dropped (secondary crew only).
// T-DONORREADY: DF_CREW_EXT (blocking): crew_N_human_extended called on a GoH-made mdl (door bones carry {parameters "group=..."}) never links a crew; --fit --write renames it to crew_N_human [V 2 games].
// --variants [ctl,crew,vis,seat,gunner,board,shield] --moddir <mod>: writes one-change bisect copies <stem>_<tag>.def beside the def (each its own entity), prints VARIANT <entity> <change>;
//   --control-mdl entity/x/y.mdl (no leading /: Git Bash rewrites it) is the ctl variant's {Extension}.
// FXC-5: --in-place (with --fit --write, needs --moddir; exit 2 if the def is outside it, hardlinked, or --out is also given): the fit replaces <rep>.def, the old text stays as <rep>.def.unfit
//   (not <rep>.unfit.def: the engine names an entity by the title before the first dot, so that was a second def of the same name, `Entity redefinition`, ).
//   Misses born in a vanilla include (crew/seat macros of tank_crew/car_crew/cannon_crew, car_trace/tank_trace): the vfs file is copied beside the def as fit_<name> (defines only),
//   the def includes it after its own includes, and the copy is edited: a door/seat bone renamed to the one free bone of its stem; else a secondary seat's call line (and the weapon
//   places it crews) or a trace call line dropped. A driver or gunner seat with no bone stays a MISS (PORT-137). Vanilla files and paks are never written.
//   Item defs ({actor ...}, no game_entity): read as items; their (include "/properties/goh/..") files must exist (miss DF_INCLUDE); no bone/volume checks.
//   Not applied (listed as UNAPPLIED): macro-born misses with no call line to edit, vfs/vanilla files, DF_FOLDER, warnings, mdl edits (DF_BARRELS rename).
// Author: Imperator_Aug (ARSENAL, ia-f5bc7986)
const fs = require('fs'), path = require('path');
const sdlx = require('../lib/sdlx'), vfsLib = require('../lib/vfs'), gamedir = require('../lib/gamedir'), names = require('../lib/names');
const { meshRefs } = require('../binhdr/ply');

const fwd = p => String(p).replace(/\\/g, '/');
const lc = s => String(s).toLowerCase();
const TYPED_BONES = new Set(['revolute', 'prizmatic', 'socket', 'planarsocket']);   // FMT-05: the types that take {limits} {speed}
// box item "bullet76 ap" / "ammo bullet50 ap" / "ammo bullet76 rus apcbc": the ammo words are the ones after the bulletNN token (car-2: "ammo bullet50 ap" is AP)
const ammoWords = item => { const t = String(item).trim().toLowerCase().split(/\s+/), i = t.findIndex(x => /^bullet\d/.test(x)); return i >= 0 ? t.slice(i + 1) : t.slice(1); };
const isApItem = item => ammoWords(item).some(w => /^ap/.test(w));
// armour class of a def text: the heaviest ("armor_light|medium|heavy|spa_light|spa_heavy|mortar" macro call); armor_engine / armor_mantlet / armor_btr do not count
const RANK = { light: 0, medium: 1, heavy: 2 };
const armClass = text => {
  let best = null;
  for (const m of String(text).matchAll(/\(\s*"armor_(\w+)"/gi)) {
    const w = lc(m[1]), k = /light|mortar/.test(w) ? 'light' : /medium/.test(w) ? 'medium' : /heavy/.test(w) ? 'heavy' : null;
    if (k && (best === null || RANK[k] > RANK[best])) best = k;
  }
  return best;
};

const USAGE = 'usage: ARSENAL donorfit <def> [--mdl file] --game G [--mods a,b] [--exe as64|mowas_2] [--moddir dir] [--rep name] [--rep-class light|medium|heavy] [--rep-kind tank|car|gun] [--fit [--write [--out file | --in-place]]] [--variants [tag,..] --moddir dir [--control-mdl entity/x/y.mdl]] [--json]';
function parseArgs(argv) {
  const o = { def: null, mdl: null, game: null, mods: [], exe: null, json: false, moddir: null, rep: null, repClass: null, repKind: null, fit: false, write: false, out: null, inPlace: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fit') o.fit = true;
    else if (a === '--in-place') o.inPlace = true;
    else if (a === '--write') { o.write = true; o.fit = true; }
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--rep-class') o.repClass = lc(argv[++i] || '');
    else if (a === '--rep-kind') o.repKind = lc(argv[++i] || '');
    else if (a === '--moddir') o.moddir = argv[++i];
    else if (a === '--rep') o.rep = argv[++i];
    else if (a === '--mdl') o.mdl = argv[++i];
    else if (a === '--game') o.game = argv[++i];
    else if (a === '--mods') o.mods = String(argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--exe') o.exe = argv[++i];
    else if (a === '--json') o.json = true;
    else if (a === '--variants') o.variants = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    else if (a === '--control-mdl') o.controlMdl = '/' + String(argv[++i] || '').replace(/^\/+/, '');   // give it without the leading / (Git Bash rewrites /x to a Windows path)
    else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
    else if (a.startsWith('--')) { console.error('unknown option ' + a); process.exit(2); }
    else o.def = a;
  }
  return o;
}

// loose mod root of a file: everything before '/resource/'
function modRoot(file) { const m = /^(.*?)\/resource\//i.exec(fwd(file)); return m ? m[1] : null; }

function makeOpen(vfs, roots) {
  return (r, from) => {
    if (r.kind === 'fs') { try { return { buf: fs.readFileSync(r.key), file: r.key, key: r.key }; } catch (e) { return null; } }
    for (const root of roots) {
      const p = root + '/' + r.key;
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return { buf: fs.readFileSync(p), file: p, key: r.key };
    }
    const rec = vfs && vfs.files.get(r.key);
    if (!rec) return null;
    try { return { buf: vfsLib.readRec(rec), file: r.key, key: r.key }; } catch (e) { return null; }
  };
}

const kids = b => { const out = []; for (const it of b.items) { if (it.k === 'MOD') out.push(...kids(it)); else out.push(it); } return out; };
const isBlock = n => n.k === 'BLOCK' && !n.disabled;
const bname = b => { const f = b.items.find(x => x.k === 'IDENT' || x.k === 'STRING'); return f ? lc(f.text) : ''; };
// first argument after the block name: STRING value, skipping IDENT type words (bone revolute "x"); {unresolved:tok} for %param / numbers
function argOf(b) {
  const it = b.items; let i = 0;
  if (it[0] && (it[0].k === 'IDENT' || it[0].k === 'STRING')) i = 1;
  for (; i < it.length; i++) {
    const x = it[i];
    if (x.k === 'STRING') return { name: x.value, tok: x };
    if (x.k === 'IDENT') { if (x.text[0] === '%') return { unresolved: x.text, tok: x }; continue; }
    if (x.k === 'BLOCK') break;
    return { unresolved: x.text, tok: x };
  }
  return null;
}

// bone type word of a bone block: {bone revolute "x"} -> 'revolute'; {bone "x"} -> '' (plain)
function boneType(c) {
  const it = c.items;
  return it[1] && it[1].k === 'IDENT' && it[2] && it[2].k === 'STRING' ? lc(it[1].text) : '';
}
function parseMdl(buf, file, open) {
  const bones = new Set(), volumes = new Set(), types = new Map(), seqs = [], vols = new Set(), plys = new Set(); let errs = 0, goh = false;
  const r = sdlx.read(buf, { file, key: null, open, onError: () => { errs++; } });
  (function walk(n, inVol) {
    for (const c of kids(n)) {
      if (c.k !== 'BLOCK') continue;
      const nm = bname(c);
      if (nm === 'parameters' && !inVol) { const a = argOf(c); if (a && /\bgroup\s*=/i.test(a.name || '')) goh = true; }   // T-DONORREADY: GoH exports tag door bones {parameters "group=crew;"}
      if (nm === 'bone' || nm === 'volume') {
        const a = argOf(c);
        if (a && a.name !== undefined) {
          (nm === 'bone' ? bones : volumes).add(lc(a.name));
          // FMT-05: the type comes from the bone tree only; a {Bone "x"} inside a {Volume} has no type and must not overwrite it
          if (nm === 'bone' && !inVol && !types.has(lc(a.name))) types.set(lc(a.name), boneType(c));
        }
      }
      if (nm === 'sequence') {
        const a = argOf(c), fb = kids(c).find(x => isBlock(x) && bname(x) === 'file'), fa = fb && argOf(fb);
        if (a && a.name) seqs.push({ name: a.name, file: fa && fa.name ? fa.name : null });
      }
      for (const x of c.items) if (x.k === 'STRING') { if (/\.vol$/i.test(x.value)) vols.add(x.value); else if (/\.ply$/i.test(x.value)) plys.add(x.value); }
      walk(c, inVol || nm === 'volume');
    }
  })(r.root, false);
  return { bones, volumes, types, seqs, vols: [...vols], plys: [...plys], errs, goh };
}

function check(opt) {
  const res = { def: opt.def, mdl: null, misses: [], leads: [], warnings: [], notes: [], unresolved: [], counts: {}, ok: false };
  let defBuf;
  try { defBuf = fs.readFileSync(opt.def); } catch (e) { res.fatal = 'cannot read def: ' + e.message; return res; }
  const defFile = fwd(path.resolve(opt.def));

  let vfs = null;
  if (opt.game) {
    try { vfs = vfsLib.build({ gameDir: opt.game, mods: opt.mods, exe: opt.exe || undefined }); }
    catch (e) { res.unresolved.push({ what: 'vfs', name: opt.game, why: 'vfs build failed: ' + e.message }); }
  } else res.unresolved.push({ what: 'vfs', name: '', why: 'no --game: includes resolve only against the def\'s own mod folder' });
  const roots = [opt.moddir ? fwd(path.resolve(opt.moddir)) : modRoot(defFile)].filter(Boolean);
  const open = makeOpen(vfs, roots);
  // PORT-131 folder check context: needs a mod folder (given, or the def sits under .../resource/) and the def inside its resource/
  const defRel = roots[0] && lc(defFile).startsWith(lc(roots[0]) + '/resource/') ? defFile.slice(roots[0].length + 1) : null;   // 'resource/entity/x/x.def'
  const has = key => {   // key 'resource/...' lowercase: loose in the mod folder, or anywhere in the vfs (base data counts as present)
    if (roots[0]) { const p = roots[0] + '/' + key; try { if (fs.statSync(p).isFile()) return true; } catch (e) { /* not loose */ } }
    return !!(vfs && vfs.files.get(key));
  };
  const readKey = key => {
    if (roots[0]) { const p = roots[0] + '/' + key; try { if (fs.statSync(p).isFile()) return fs.readFileSync(p); } catch (e) { /* not loose */ } }
    const rec = vfs && vfs.files.get(key); if (!rec) return null;
    try { return vfsLib.readRec(rec); } catch (e) { return null; }
  };

  // the rep's own def, by file stem: loose in the mod folder first, then the vfs (first sorted key); null when absent
  const findDef = name => {
    const stem = lc(name).replace(/\(.*$/, ''), want = '/' + stem + '.def';
    if (roots[0]) {
      let hit = null;
      (function scan(d) { if (hit) return; let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { const p = d + '/' + e.name; if (e.isDirectory()) scan(p); else if (lc(e.name) === stem + '.def') { hit = p; return; } } })(roots[0] + '/resource/entity');
      if (hit) return { key: lc(hit.slice(roots[0].length + 1)), text: fs.readFileSync(hit).toString('latin1') };
    }
    if (vfs) {
      const k = [...vfs.files.keys()].filter(x => x.startsWith('resource/entity/') && x.endsWith(want)).sort()[0];
      if (k) { try { return { key: k, text: vfsLib.readRec(vfs.files.get(k)).toString('latin1') }; } catch (e) { return null; } }
    }
    return null;
  };

  const errsSeen = new Set();
  const r = sdlx.read(defBuf, {
    file: defFile, key: null, open,
    onError: (file, line, code, msg) => {
      if (code === 'MACRO_UNDEFINED' || code === 'INCLUDE_MISSING' || code === 'UNREPLACED_PARAM') {
        const k = code + file + line + msg; if (errsSeen.has(k)) return; errsSeen.add(k);
        res.unresolved.push({ what: code, name: msg, where: path.basename(file) + ':' + line });
      }
    }
  });
  const defines = r.defines;
  let ge = kids(r.root).find(n => isBlock(n) && bname(n) === 'game_entity');
  let item = false;   // FXC-2 gap 8: an item def is {actor ...} (small arms, grenades), not game_entity
  if (!ge) { const ac = kids(r.root).find(n => isBlock(n) && bname(n) === 'actor'); if (ac) { ge = ac; item = true; res.item = true; } }
  if (!ge) { res.fatal = 'no {game_entity} block in def'; return res; }

  // ---- mdl
  let mdlFile = opt.mdl ? path.resolve(opt.mdl) : null;
  // PORT-129: the Extension whose value ends .mdl (a def can hold {extension "crew.ext"} first); else the first one that is not an .ext
  const exts = kids(ge).filter(n => isBlock(n) && bname(n) === 'extension');
  const extVal = n => { const a = argOf(n); return a && a.name ? a.name : ''; };
  const ext = exts.find(n => /\.mdl$/i.test(extVal(n))) || exts.find(n => !/\.ext$/i.test(extVal(n))) || null;
  const ea = ext && argOf(ext), dd = path.dirname(defFile);
  // PORT-131: the virtual folder the Extension names ('entity/x'), for the folder check
  const extKey = defRel && ea && ea.name ? names.resolve(ea.name, path.posix.dirname(defRel)).key.toLowerCase() : null;
  if (!mdlFile) {
    const cands = [];
    if (ea && ea.name) {
      const n = ea.name.replace(/\\/g, '/');
      cands.push(path.join(dd, n), path.join(dd, path.basename(n)));
      if (n.startsWith('/')) for (const root of roots) cands.push(root + '/resource' + n);
      const rec = vfs && vfs.files.get('resource/' + n.replace(/^\//, '').toLowerCase());
      if (rec) res.mdlFromVfs = rec;
    } else if (ext) res.unresolved.push({ what: 'Extension', name: ea ? ea.unresolved : '(none)', where: 'def:' + ext.line });
    mdlFile = cands.find(c => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
    if (!mdlFile && ea && ea.name && roots[0]) {   // def and mdl in different folders of the same mod root: search by file name
      const want = lc(path.basename(ea.name.replace(/\\/g, '/'))), hits = [];
      (function scan(d) { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) scan(p); else if (lc(e.name) === want) hits.push(p); } })(roots[0]);
      if (hits.length) { mdlFile = hits[0]; if (hits.length > 1) res.notes.push(`${hits.length} files named ${want} under the mod root; used the first`); else res.notes.push('mdl found by name search under the mod root, not beside the def'); }
    }
    if (!mdlFile) {
      const near = fs.readdirSync(dd).filter(f => /\.mdl$/i.test(f));
      if (near.length === 1) mdlFile = path.join(dd, near[0]);
      else if (res.mdlFromVfs) { mdlFile = null; }
    }
  }
  let mdl;
  if (mdlFile) {
    res.mdl = fwd(mdlFile);
    mdl = parseMdl(fs.readFileSync(mdlFile), res.mdl, (rr, from) => rr.kind === 'virtual' ? (() => {
      const p = path.join(path.dirname(mdlFile), path.basename(rr.key)); return fs.existsSync(p) ? { buf: fs.readFileSync(p), file: p, key: rr.key } : open(rr, from);
    })() : open(rr, from));
  } else if (res.mdlFromVfs) {
    res.mdl = 'vfs:' + (res.mdlFromVfs.entry || '');
    mdl = parseMdl(vfsLib.readRec(res.mdlFromVfs), res.mdl, open);
  } else if (extKey && !has(extKey)) {
    // PORT-131: the Extension names an mdl the folder (and the vfs) lacks: a blocking miss, nothing else can be checked
    res.misses.push({ key: 'DF_FOLDER', name: extKey, kind: 'file', macro: null, defLine: ext.line, parent: '', detail: 'mdl absent from the Extension\'s folder (PORT-131)' });
    res.ok = false; res.complete = true; return res;
  } else if (item) {
    mdl = { bones: new Set(), volumes: new Set(), types: new Map(), seqs: [], vols: [], plys: [], errs: 0 };   // an item def may have no readable mdl: only its includes are checked
    res.notes.push('item def (actor): no mdl found; mdl-bound checks skipped');
  } else { res.fatal = 'no mdl found (give --mdl, or {Extension} beside the def)'; return res; }
  delete res.mdlFromVfs;
  res.mdlBones = mdl.bones.size; res.mdlVolumes = mdl.volumes.size; res.mdlParseErrors = mdl.errs;
  Object.defineProperty(res, 'moddir', { value: roots[0] || null, enumerable: false, configurable: true });
  if (!mdl.bones.size && !item) res.notes.push('mdl has 0 bones: parse problem or not an SDL skeleton mdl; every bone check will miss');

  // ---- PORT-131 folder check: the files the engine opens beside the mdl must exist in the Extension's folder (loose in the mod, or in the vfs)
  if (extKey) {
    const fdir = path.posix.dirname(extKey), fseen = new Set();
    const fmiss = (name, detail) => { const id = lc(name); if (fseen.has(id)) return; fseen.add(id); counts0.folder = (counts0.folder || 0) + 1; res.misses.push({ key: 'DF_FOLDER', name, kind: 'file', macro: null, defLine: ext.line, parent: '', detail }); };
    const counts0 = res.counts;
    const keyOf = (ref, from) => names.resolve(ref, from || fdir).key.toLowerCase();
    if (!has(extKey)) fmiss(extKey, 'mdl absent from the Extension\'s folder (PORT-131)');
    const plyKeys = new Set(mdl.plys.map(p => keyOf(p)));
    if (roots[0]) { try { for (const f of fs.readdirSync(roots[0] + '/' + fdir)) if (/\.ply$/i.test(f)) plyKeys.add(lc(fdir + '/' + f)); } catch (e) { /* no loose folder */ } }
    for (const pk of plyKeys) {
      const pb = readKey(pk); if (!pb) continue;   // an absent named ply is not one of the four checks
      let refs; try { refs = meshRefs(pb); } catch (e) { continue; }
      for (const m of refs.mtls) { const mk = keyOf(m, path.posix.dirname(pk)); if (/\.mtl$/.test(mk) && !has(mk)) fmiss(mk, `ply ${path.posix.basename(pk)} names a material absent from the folder: PORT-131 crash in  at load`); }
    }
    for (const s of mdl.seqs) { const ak = keyOf(s.file || (s.name + '.anm')); if (!has(ak)) fmiss(ak, `mdl sequence "${s.name}" names an absent anm: PORT-131 "Resource not found" at load`); }
    for (const v of mdl.vols) { const vk = keyOf(v); if (!has(vk)) fmiss(vk, `mdl names a .vol that is absent (PORT-131)`); }
  } else if (!roots[0] || !defRel) res.notes.push('folder check (PORT-131) skipped: no mod folder (give --moddir, or put the def under <mod>/resource/)');

  // ---- FXC-2 gap 8: item def. The /properties/goh/ includes it names must exist (loose in the mod or in the vfs); bone/volume checks do not apply to items
  if (item) {
    const src = defBuf.toString('latin1').replace(/;[^\r\n]*/g, ''), seenI = new Set();
    for (const m of src.matchAll(/\(\s*include\s+"([^"]+)"/gi)) {
      const p = m[1].replace(/\\/g, '/');
      if (!/^\/properties\/goh\//i.test(p) || seenI.has(lc(p))) continue;
      seenI.add(lc(p)); res.counts.include = (res.counts.include || 0) + 1;
      if (!has('resource/' + lc(p).slice(1))) res.misses.push({ key: 'DF_INCLUDE', name: p, kind: 'file', macro: null, defLine: src.slice(0, m.index).split('\n').length, parent: '', detail: 'item include absent from the mod and the vfs (the GoH properties file was not pulled)' });
    }
    res.notes.push('item def (actor): includes checked, bone/volume checks do not apply');
    res.ok = !res.misses.length; res.complete = !res.unresolved.some(u => u.what !== 'vfs' || /build failed/.test(u.why || ''));
    return res;
  }

  // ---- provenance of a node: macro chain + def line
  const defRanges = [];
  for (const [name, d] of defines) defRanges.push({ name, file: fwd(d.file), s: d.line, e: d.line + (d.text.match(/\n/g) || []).length });
  const macroAt = (file, line) => { const f = fwd(file); let best = null; for (const d of defRanges) if (d.file === f && line >= d.s && line <= d.e && (!best || d.s > best.s)) best = d; return best && best.name; };
  const prov = node => {
    const chain = []; let defLine = node.line, cur = node, inDef = fwd(node.file) === defFile && !node.via;
    if (!node.via) return { chain, defLine: node.line };
    const own = macroAt(node.file, node.line); if (own) chain.push(own);
    let v = node.via;
    while (v) {
      if (fwd(v.file) === defFile) { defLine = v.line; if (!v.via) break; }
      const m = macroAt(v.file, v.line); chain.push(m || path.basename(v.file));
      v = v.via;
    }
    return { chain, defLine };
  };

  // ---- checks
  const seen = new Set();
  const counts = res.counts;
  let curExt = null;   // basename of the {extension "x.ext"} file being walked, null for the def itself
  // gun = {PatherID "cannon..."} / "mortar..." anywhere in the expanded def, or "cannon" in {props}
  let isGun = false;
  (function g(n) {
    for (const c of kids(n)) {
      if (!isBlock(c)) continue;
      const nm = bname(c), a = argOf(c);
      if (nm === 'patherid') res.hasPather = true;   // FXE-1: a def that declares a path class is a real unit; one without is a stub
      if (nm === 'patherid' && a && a.name && /^(cannon|mortar|gun|howitzer)/i.test(a.name)) isGun = true;
      if (nm === 'props') for (const x of c.items) if (x.k === 'STRING' && /^cannon/i.test(x.value)) isGun = true;
      g(c);
    }
  })(ge);
  res.gun = isGun;
  const used = {}, hide = (m, node, par) => { Object.defineProperty(m, '_node', { value: node, enumerable: false }); Object.defineProperty(m, '_par', { value: par || null, enumerable: false }); };   // FXC-2: source nodes for --write
  let curPN = null;   // parent block node of the node walk() is handling
  const note = (key, node, what, name, parent) => {
    counts[key] = (counts[key] || 0) + 1;
    let a = what;
    const p = prov(node);
    if (a.name !== undefined && a.name.includes('%')) a = { unresolved: '"' + a.name + '"' };   // macro parameter never filled in
    if (a.unresolved) { res.unresolved.push({ what: key, name: a.unresolved, where: 'def:' + p.defLine, macro: p.chain.join(' < ') || null }); return; }
    const nm = lc(a.name), pool = key === 'volume' ? mdl.volumes : mdl.bones;
    (used[key] = used[key] || new Set()).add(nm);   // FXC-2: every name of this kind the def uses (a rename must pick a free one)
    if (pool.has(nm)) return;
    const id = key + '|' + nm + '|' + p.chain.join('<') + '|' + p.defLine;
    if (seen.has(id)) return; seen.add(id);
    const m = { key, name: a.name, kind: key === 'volume' ? 'volume' : 'bone', macro: p.chain.length ? p.chain.join(' < ') : null, defLine: p.defLine, parent, src: path.basename(node.file) + ':' + node.line };
    if (curExt) m.inExt = curExt;
    hide(m, node, curPN);
    // PORT-128 [I, n=1 kill]: a gun with a door emit missing from the mdl still spawned, got crew and fought: a lead, not a miss
    if (key === 'door' && isGun) { m.lead = true; res.leads.push(m); }
    else if (key === 'visor-bone') visorMiss.push(m);   // DFIT-4 (PORT-137 [V kv8s split]): a missing visor bone (mgun2 of gunner_visible) still orders and fires: a warning, not a miss
    else {
      if (key === 'door') m.detail = `door "${m.name}" absent from the mdl: PORT-137 [V] unit never operatable, no order lands, no log line`;
      res.misses.push(m);
    }
  };
  const visorMiss = [];
  // FMT-05 [V]: {limits}/{speed} under a def {bone "x"} where the mdl's x is plain is an "unexpected token" crash. A bare {limits} on a revolute bone is legal (unlimited).
  // Supersedes the PORT-127 empty-limits / bone-basis flags: vanilla loads both on typed bones (38 / 41 vanilla files)
  const flagBad = (c, key, name, why) => {
    counts[key] = (counts[key] || 0) + 1;
    const p = prov(c), id = key + '|' + p.chain.join('<') + '|' + c.file + '|' + c.line;
    if (seen.has(id)) return; seen.add(id);
    const m = { key, name, kind: 'syntax', macro: p.chain.length ? p.chain.join(' < ') : null, defLine: p.defLine, parent: '', src: path.basename(c.file) + ':' + c.line, detail: why };
    if (curExt) m.inExt = curExt;
    hide(m, c, curPN);
    res.misses.push(m);
  };
  const seatPlaces = [], seatLinks = [];   // FXE-1: res.seats below
  const places = new Set(), needCrew = [], visors = new Map(), wplaces = [], userItems = [];
  const weapons = [], wfills = [], boxItems = [], shooters = [], placeInfo = [], macroHits = [], placeRecs = []; let chassis = null;   // warning inputs
  const walk = function walk(n, path_) {
    for (const c of kids(n)) {
      if (!isBlock(c)) continue;
      const nm = bname(c), par = path_[path_.length - 1] || '';
      const a = argOf(c);
      curPN = n;
      if (nm === 'chassis' && a && a.name && !chassis) chassis = lc(a.name);
      if (nm === 'item') { const ub = kids(c).find(x => isBlock(x) && bname(x) === 'user'), ua = ub && argOf(ub); if (ua && ua.name) userItems.push({ node: c, user: lc(ua.name) }); }
      if (nm === 'place' && par === 'weaponry' && a && a.name) {   // FXC-2: weapon places with their crew names and LinkBones (gap 3)
        const kk = kids(c).filter(isBlock);
        wplaces.push({ node: c, name: lc(a.name), crew: kk.filter(x => bname(x) === 'gunner' || bname(x) === 'charger').map(x => { const ga = argOf(x); return ga && ga.name ? lc(ga.name) : null; }).filter(Boolean),
          links: kk.filter(x => bname(x) === 'linkbone').map(x => { const la = argOf(x); return la && la.name && !la.name.includes('%') ? { node: x, name: lc(la.name) } : null; }).filter(Boolean) });
      }
      // T-DONORFIT [I]: a weapon place with no {LinkBone} sits on the mdl bone of its own name (cannon_mgun_1.ext writes {place "mgun" {LinkBone "mgun"}} to say it); with no such bone
      // the unit loads and is never operatable (G-DONORSPAWN lead: pz4h def places mgun/mgun1/mgun2 on a GoH mdl with mgun_c/mgun_h). Collected here, judged after the walks (same-name places merge [I]).
      if (nm === 'place' && par === 'weaponry' && a && a.name && !a.name.includes('%')) {
        const kk = kids(c).filter(isBlock), ty = kk.find(x => bname(x) === 'type'), ta = ty && argOf(ty);
        placeRecs.push({ node: c, parent: n, name: a.name, role: ta && ta.name ? ta.name : null, link: kk.some(x => bname(x) === 'linkbone'), own: kk.some(x => ['weapon', 'gunner', 'charger'].includes(bname(x))), curExt, via: !!c.via });
      }
      if (nm === 'weapon' && par === 'place' && a && a.name) {
        weapons.push(a.name);
        // CHK-DONOR (PORT-156/162): {weapon "X" filling "tags" n}: the filling string after the IDENT filling
        const fi = c.items.findIndex(x => x.k === 'IDENT' && lc(x.text) === 'filling'), fs_ = fi >= 0 && c.items[fi + 1];
        if (fs_ && fs_.k === 'STRING') wfills.push({ weapon: a.name, fill: fs_.value, line: prov(c).defLine });
      }
      if (nm === 'item' && par === 'box' && a && a.name) boxItems.push(a.name);
      if (nm === 'place' && par === 'weaponry') {   // a place with {Barrels n>1} shoots from bone <shooter tag, default "shooter"><%02d>
        const kk = kids(c).filter(isBlock), bb = kk.find(x => bname(x) === 'barrels'), sb = kk.find(x => bname(x) === 'shooter');
        const ba = bb && argOf(bb), sa = sb && argOf(sb), nb = ba && ba.unresolved ? parseInt(ba.unresolved, 10) : NaN;
        const pfx = sa && sa.name ? sa.name : 'shooter', pname = a && a.name || '';
        // DFIT-3: weapons of the place, for DF_AIM and for {Barrels} that sit in the weapon stuff instead of the def
        const pw = kk.filter(x => bname(x) === 'weapon').map(x => { const wa = argOf(x); return wa && wa.name ? wa.name : null; }).filter(Boolean);
        placeInfo.push({ place: pname, prefix: pfx, nb: nb > 1 ? nb : 0, line: prov(c).defLine, hasFore: kk.some(x => bname(x) === 'foresight'), weapons: pw, node: c });
        if (nb > 1) shooters.push({ prefix: pfx, n: nb, place: pname, line: c.line });
      }
      if (nm === 'volume' && par === 'game_entity' && a && !c.items.some(x => x.k === 'IDENT' && lc(x.text) === 'default_material')) {   // {volume default_material "m"} names a material, not a volume (BG-1)
        // only stubs written in the def itself: volumes from included .ext / macros (gun, crew, engine, mantlet...) are generic and not mdl-bound [V kv8s fights without them]
        if (c.via) {
          counts.volumeFromInclude = (counts.volumeFromInclude || 0) + 1;
          // DF_MACRO (PORT-136 [V]): a shield volume born in a macro/include with no such volume or bone in the mdl
          const pc = prov(c);
          if (a.name !== undefined && !a.name.includes('%') && (/shield/i.test(a.name) || pc.chain.some(m => /shield/i.test(m))) && !mdl.volumes.has(lc(a.name)) && !mdl.bones.has(lc(a.name)))
            macroHits.push({ kind: 'shield', name: a.name, chain: pc.chain.join(' < '), line: pc.defLine });
        } else note('volume', c, a, null, par);
      }
      else if (nm === 'visor' && par === 'sensor' && a && a.name) {
        const bb = kids(c).find(x => isBlock(x) && bname(x) === 'bone'), ba = bb && argOf(bb);
        if (bb && ba) visors.set(lc(a.name), { bb, ba });   // later definition of the same visor name replaces an earlier bone (vehicle.ext "visor" vs tank_unarmed "visor1")
      }
      else if (nm === 'bone' && par === 'visor') { /* handled at the visor block */ }
      else if (nm === 'bone' && a) {
        note(par === 'game_entity' ? 'bone-block' : 'bone', c, a, null, par);
        if (par === 'game_entity' && a.name !== undefined && mdl.types.has(lc(a.name)) && !TYPED_BONES.has(mdl.types.get(lc(a.name))) && mdl.types.get(lc(a.name)) === '') {
          const fields = kids(c).filter(x => isBlock(x) && (bname(x) === 'limits' || bname(x) === 'speed'));
          if (fields.length) flagBad(c, 'DF_PLAIN_BONE', a.name, `{${[...new Set(fields.map(bname))].join('} {')}} under {bone "${a.name}"}, but the mdl's "${a.name}" is a plain bone: "unexpected token" crash at load (FMT-05); remove the block, or make the mdl bone revolute`);
        }
      }
      else if (nm === 'foresight' && a) note('foresight', c, a, null, par);
      else if (nm === 'linkbone' && a) note('LinkBone', c, a, null, par);
      else if (nm === 'door' && a && par === 'boarder') note('door', c, a, null, par);
      else if (nm === 'extender' && a && a.name && lc(a.name) === 'enumerator') {
        counts.enumerator = (counts.enumerator || 0) + 1;
        if (!mdl.bones.has('enumerator')) { const p = prov(c); macroHits.push({ kind: 'enumerator', name: 'enumerator', chain: p.chain.join(' < '), line: p.defLine }); }
      }
      else if (nm === 'link' && par === 'boarder') {   // FXE-1: {link "door" "place" ...}: the door a seat is boarded through
        const ss = c.items.slice(1).filter(x => x.k === 'STRING').map(x => String(x.value !== undefined ? x.value : x.text));
        if (ss.length >= 2) seatLinks.push({ door: lc(ss[0]), place: lc(ss[1]) });
      }
      else if (nm === 'place' && a && a.name) {
        if (par === 'placer') { places.add(lc(a.name)); const lbk = kids(c).find(x => isBlock(x) && bname(x) === 'linkbone'), lba = lbk && argOf(lbk); seatPlaces.push({ place: lc(a.name), linkbone: lba && lba.name ? lc(lba.name) : null }); }
        else if (par === 'weaponry') for (const g of kids(c)) if (isBlock(g) && (bname(g) === 'gunner' || bname(g) === 'charger')) { const ga = argOf(g); if (ga && ga.name) needCrew.push({ place: lc(ga.name), node: g, from: a.name }); }
      }
      walk(c, path_.concat(nm));
    }
  };
  walk(ge, ['game_entity']);
  // PORT-129: {extension "x.ext"} files (crew.ext) hold doors/places/bones the def's own walk never sees: read and check them like the def
  const extFiles = [], extLocal = new Map();   // extLocal: fwd path of a loose .ext beside the def -> { name as written, text }
  (function findExt(n) {
    for (const c of kids(n)) {
      if (!isBlock(c)) continue;
      if (bname(c) === 'extension') { const a = argOf(c); if (a && a.name && /\.ext$/i.test(a.name)) extFiles.push(a.name); }
      findExt(c);
    }
  })(ge);
  for (const en of [...new Set(extFiles)]) {
    const n = en.replace(/\\/g, '/'), dd = path.dirname(defFile), cands = [path.join(dd, n), path.join(dd, path.basename(n))];
    if (n.startsWith('/')) for (const root of roots) cands.push(root + '/resource' + n);
    let file = cands.find(c => fs.existsSync(c) && fs.statSync(c).isFile()) || null, buf = null;
    if (file) { buf = fs.readFileSync(file); extLocal.set(fwd(file), { name: en, text: buf.toString('latin1') }); }
    else if (vfs && vfs.files.get('resource/' + n.replace(/^\//, '').toLowerCase())) { try { buf = vfsLib.readRec(vfs.files.get('resource/' + n.replace(/^\//, '').toLowerCase())); file = n; } catch (e) { /* unreadable */ } }
    if (!buf) { res.unresolved.push({ what: 'Extension', name: en, where: 'def', why: 'extension file not found: its doors/places/bones were not checked' }); continue; }
    const er = sdlx.read(buf, { file: fwd(file), key: null, open, onError: (f, line, code, msg) => {
      if (code === 'MACRO_UNDEFINED' || code === 'INCLUDE_MISSING' || code === 'UNREPLACED_PARAM') res.unresolved.push({ what: code, name: msg, where: path.basename(f) + ':' + line });
    } });
    curExt = path.basename(n); counts.extFile = (counts.extFile || 0) + 1;
    walk(er.root, ['game_entity']);
    curExt = null;
  }
  for (const { bb, ba } of visors.values()) note('visor-bone', bb, ba, null, 'visor');
  // T-DONORFIT: DF_BONE_MISSING. Per place name over all sources (def, includes, macros): live = some source gives it a weapon, a gunner/charger or an inventory {user}; judged only when live,
  // no source gives it a {LinkBone}, and the mdl has no bone of that name (a vanilla tank.ext lists mgun on every tank; an idle one with no weapon is not a miss). Reported on the def-side node.
  {
    const by = new Map(); for (const r of placeRecs) (by.get(lc(r.name)) || by.set(lc(r.name), []).get(lc(r.name))).push(r);
    for (const [nm, rs] of by) {
      counts.DF_BONE_MISSING = (counts.DF_BONE_MISSING || 0) + 1;
      if (mdl.bones.has(nm) || rs.some(r => r.link) || !(rs.some(r => r.own) || userItems.some(u => u.user === nm))) continue;
      const r = rs.filter(x => !x.via).pop() || rs[rs.length - 1], p = prov(r.node), ty = rs.find(x => x.role);
      const m = { key: 'DF_BONE_MISSING', name: r.name, kind: 'bone', macro: p.chain.length ? p.chain.join(' < ') : null, defLine: p.defLine, parent: 'weaponry', place: r.name, role: r.role || (ty && ty.role) || null, src: path.basename(r.node.file) + ':' + r.node.line,
        detail: `weapon place "${r.name}" has no {LinkBone} and the mdl has no bone "${r.name}": the place has nothing to sit on, the unit loads and never becomes operatable (G-DONORSPAWN [I])` };
      if (r.curExt) m.inExt = r.curExt;
      hide(m, r.node, r.parent);
      res.misses.push(m);
    }
  }
  // FXE-1: the seats the def ends up with after macro expansion: { place, linkbone (null = on the owner origin), linkboneOk, doors: [{ door, ok }] }; ok = the bone is in the mdl
  res.seats = [];
  // FXE-2: the weapon places (name, crew names, LinkBone names) and every weapon name, for the main-gun LinkBone and weapon-class rules of goh2as2
  res.wplaces = wplaces.map(w => ({ name: w.name, crew: w.crew, links: w.links.map(l => l.name) }));
  res.weaponNames = [...new Set(weapons.map(lc))];
  for (const sp of seatPlaces) {
    let s = res.seats.find(x => x.place === sp.place);
    if (!s) res.seats.push(s = { place: sp.place, linkbone: null, linkboneOk: true, doors: [], crews: needCrew.some(n => n.place === sp.place) });   // crews: a weapon place names it {gunner}/{charger}
    if (sp.linkbone) { s.linkbone = sp.linkbone; s.linkboneOk = mdl.bones.has(sp.linkbone); }
  }
  for (const l of seatLinks) {
    const s = res.seats.find(x => x.place === l.place); if (!s || l.door.includes('%')) continue;
    if (!s.doors.some(d => d.door === l.door)) s.doors.push({ door: l.door, ok: mdl.bones.has(l.door) });
  }
  for (const nc of needCrew) {
    counts.crewPlace = (counts.crewPlace || 0) + 1;
    if (!places.has(nc.place)) {
      const p = prov(nc.node);
      const cm = { key: 'crew-place', name: nc.place, kind: 'place', macro: p.chain.join(' < ') || null, defLine: p.defLine, parent: 'weaponry place ' + nc.from, detail: `weapon place "${nc.from}" names crew "${nc.place}" but no {placer {place "${nc.place}"}} exists after macro expansion` };
      hide(cm, nc.node, null); res.misses.push(cm);
    }
  }
  // ---- warnings (never change the exit code)
  const warn = (code, name, detail, fix) => res.warnings.push(fix ? { code, name, detail, fix } : { code, name, detail });   // fix: the smallest edit, for --fit
  // FIX-PORT (port-donors:57, OBS-I2): a fit copy beside the def that the game does not load. mbR2A_t toldi2 shipped its nolb fit as toldi2.def.fit while toldi2.def
  // kept crew_human {linkbone "%place"}: the gunner was never seated, 0 shots in 6/6 [V]. <stem>.fit.def (plain --write's copy) is worse in a mod: the engine names an
  // entity by the title before the first dot, so it is a second "toldi2" def [I]. Read-only checks only; --write rounds would see their own output.
  if (!opt.write) {
    const stem = defFile.replace(/\.def$/i, ''), defTxt = defBuf.toString('latin1');
    for (const c of [stem + '.fit.def', defFile + '.fit', defFile + '.nolb']) {
      let t; try { t = fs.readFileSync(c, 'latin1'); } catch (e) { continue; }
      if (t === defTxt) continue;
      const nolb = /_nolb"/.test(t) && !/_nolb"/.test(defTxt), redef = /\.fit\.def$/i.test(c);
      warn('DF_FIT_NOT_LIVE', path.posix.basename(c), `${path.posix.basename(c)} holds a fit that differs from the def the game loads${nolb ? ' (it calls a *_nolb seat macro, the live def does not)' : ''}${redef ? '; as a .def in the mod it also loads as a second entity of the same name (Entity redefinition) [I]' : ''}`,
        `rerun with --fit --write --in-place --moddir <mod> (the fit replaces ${path.posix.basename(defFile)}, the old text stays as .def.unfit), then delete ${path.posix.basename(c)}`);
    }
  }
  // DF_CREW_SEATS [I]: crew_N_human (def text) wants N crew; the mdl models seats (seatNN bones) but fewer than N. Tanks use no seat bones (0 seat bones: no warning)
  {
    const text = defBuf.toString('latin1'); let nmax = 0;
    for (const m of text.matchAll(/crew_(\d+)_human/gi)) nmax = Math.max(nmax, +m[1]);
    const seatBones = [...mdl.bones].filter(b => /^seat\d+$/.test(b)).length;
    if (nmax && seatBones && seatBones < nmax) warn('DF_CREW_SEATS', 'crew_' + nmax + '_human', `crew_${nmax}_human wants ${nmax} crew, the mdl has ${seatBones} seat bone(s) (seatNN) [I]`, `def: use crew_${seatBones}_human (or add seat bones to the mdl up to seat${String(nmax).padStart(2, '0')})`);
  }
  // DF_SHOOTER: logs "Can't find bone" and the shot spawns from the aimer bone; a warning only
  // ---- DFIT-3 stuff reader: weapon name -> {from} chain through set/stuff (loose mod first, then the vfs); aim bone = first {foresight} on the chain, Barrels likewise
  let stuffMap = null;
  const stuffIdx = () => {
    if (stuffMap) return stuffMap;
    stuffMap = { w: new Map(), p: new Map() };
    const add = k => {
      if (!k.startsWith('resource/set/stuff/')) return;
      const base = k.slice(k.lastIndexOf('/') + 1);
      if (/\.pattern$/.test(base)) { const n = base.slice(0, -8); if (!stuffMap.p.has(n)) stuffMap.p.set(n, k); }
      else if (!/\.(ammo|presets|inc|ext|mine)$/.test(base) && !stuffMap.w.has(base)) stuffMap.w.set(base, k);
    };
    if (roots[0]) (function scan(d, rel) { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { if (e.isDirectory()) scan(d + '/' + e.name, rel + '/' + lc(e.name)); else add(rel + '/' + lc(e.name)); } })(roots[0] + '/resource/set/stuff', 'resource/set/stuff');
    if (vfs) for (const k of vfs.files.keys()) add(k);
    return stuffMap;
  };
  const stuffChain = name => {
    const ix = stuffIdx(), out = { fore: null, barrels: 0, ok: false, chain: [] };
    let cur = lc(name), kind = 'w';
    for (let d = 0; d < 12; d++) {
      const key = (kind === 'w' ? ix.w : ix.p).get(cur); if (!key) return out;
      const buf = readKey(key); if (!buf) return out;
      const text = buf.toString('latin1').replace(/;[^\r\n]*/g, '');
      out.chain.push((kind === 'p' ? 'pattern ' : '') + cur);
      if (out.fore === null) { const m = /\{\s*foresight\s+"([^"]+)"/i.exec(text); if (m) out.fore = lc(m[1]); }
      if (!out.barrels) { const m = /\{\s*barrels\s+(\d+)/i.exec(text); if (m) out.barrels = +m[1]; }
      if (out.fill === undefined) { const m = /\{\s*filling\s+"([^"]*)"/i.exec(text); if (m) out.fill = lc(m[1]).trim(); }   // CHK-DONOR: the gun's own ammo filling, first in the chain
      const f = /\{\s*from\s+"([^"]+)"/i.exec(text);
      if (!f) { out.ok = true; return out; }
      const t = f[1].trim(), pm = /^pattern\s+(\S+)/i.exec(t);
      if (pm) { kind = 'p'; cur = lc(pm[1]); } else { kind = 'w'; cur = lc(t); }
    }
    return out;
  };
  // BG-2 stuff tag index: every set/stuff file (loose mod first, then the vfs), own tags = file name split on '.'. Contents are read only for candidates.
  let tagIx = null;
  const stuffTagIdx = () => {
    if (tagIx) return tagIx;
    const files = new Map();   // key -> { tags:Set, text:null|string }
    const add = k => {
      if (!k.startsWith('resource/set/stuff/') || k.endsWith('/.presets') || /\/_settings\//.test(k) || /\.(fsm|hand)$/.test(k) || files.has(k)) return;
      files.set(k, { tags: new Set(k.slice(k.lastIndexOf('/') + 1).split('.').filter(Boolean)), text: null });
    };
    if (roots[0]) (function scan(d, rel) { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { if (e.isDirectory()) scan(d + '/' + e.name, rel + '/' + lc(e.name)); else add(rel + '/' + lc(e.name)); } })(roots[0] + '/resource/set/stuff', 'resource/set/stuff');
    if (vfs) for (const k of vfs.files.keys()) add(k);
    const by = new Map();
    for (const [k, f] of files) for (const t of f.tags) { let l = by.get(t); if (!l) by.set(t, l = []); l.push(k); }
    tagIx = { files, by, n: files.size, eff: new Map(), full: false };
    return tagIx;
  };
  const words = s => lc(s).split(/\s+/).filter(Boolean);
  // [V, 193-194] FindStuff matches the wanted tags against the stuff's tags = its FILE NAME tags only. A {tag "..."} string
  // and the tags a {from} base lends go to allTags / extraTags, which the lookup does not read. So "weapon 203mm_gun" needs ONE file whose name carries both words;
  // vanilla gun/203mm_gun (tags: 203mm_gun) has "weapon" only from gun.pattern's {tag}, so it is NOT found. Pattern files (name tag "pattern") are skipped (FindStuff withPatterns=false).
  const stuffResolves = (sx, w) => {
    const want = words(w); if (!want.length) return true;
    let cand = null;
    for (const t of want) { const l = sx.by.get(t); if (!l) return false; if (!cand || l.length < cand.length) cand = l; }
    const hit = cand.filter(k => { const tg = sx.files.get(k).tags; return !tg.has('pattern') && want.every(t => tg.has(t)); });
    // FXE-2 [V log 150mm_type_97]: a bare name that an ammo file also carries ("mortar150" matches mortar150.fg.ammo and mortar150.weapon) resolved to the AMMO: "Trying to create Weapon from non-weapon Stuff", SetItem crash
    if (!want.includes('weapon') && !want.includes('ammo') && hit.some(k => sx.files.get(k).tags.has('ammo'))) return false;
    return hit.length > 0;
  };
  const like = (name, pool, re) => {   // mdl names near `name`: same word with another number, or matching re; up to 5
    const stem = s => s.replace(/\d+$/, ''), out = [];
    for (const b of pool) if (b !== name && (stem(b) === stem(name) || (re && re.test(b)))) out.push(b);
    return out.sort().slice(0, 5);
  };
  // DF_VISOR (PORT-137 [V]): visor bone absent from the mdl (e.g. mgun2 for gunner_visible): the unit still orders and fires
  for (const m of visorMiss) {
    const lk = like(lc(m.name), mdl.bones);
    warn('DF_VISOR', m.name, `visor bone "${m.name}"${m.macro ? ' from macro ' + m.macro : ''} (def line ${m.defLine}) is not in the mdl: the unit still orders and fires (PORT-137 [V]); the visor/sight view is lost${lk.length ? '; mdl bones like it: ' + lk.join(', ') : ''}`, `def: drop the visor {bone "${m.name}"}${m.macro ? ' (macro ' + m.macro + ')' : ''}${lk.length ? `, or rename it to "${lk[0]}"` : ''}`);
  }
  // DF_AIM [V, PORT-134/84, I that the missing bone is why a unit is silent]: a place's weapon aims at its pattern's default bone
  const unreadable = new Set();
  for (const p of placeInfo) {
    for (const w of p.weapons) {
      const ch = stuffChain(w);
      if (!ch.ok) { if (!unreadable.has(lc(w))) { unreadable.add(lc(w)); res.notes.push(`DF_AIM: stuff/pattern chain of weapon "${w}" not readable (not in the mod or the vfs${vfs ? '' : '; no --game'}): aim bone and Barrels not checked for it`); } continue; }
      if (ch.fore && !p.hasFore && !mdl.bones.has(ch.fore)) {
        const lk = like(ch.fore, mdl.bones, /fore|sight|aim|muzzle/);
        // FXD-2: a BLOCKING miss, no longer a warning. [V]: no aim bone = aimer bone null. Units with it absent and no {foresight} (cckw_m33 plain
        // carrier, su57 coax) never fired; cckw_m33_a added {foresight "foresight14"} (the lookalike) and killed [V]; breda/aec had the bone and fire.
        const fixTxt = `def: under place "${p.place}" add {foresight "${lk.length ? lk[0] : '<an aim bone of the mdl>'}"}${lk.length ? '' : ' (no bone looks like one; or add a "' + ch.fore + '" bone to the mdl)'}`;
        const m = { key: 'DF_AIM', name: w, kind: 'bone', macro: null, defLine: p.line, parent: p.place, src: 'def:' + p.line, fix: fixTxt, lookalike: lk[0] || null, place: p.place,
          detail: `place "${p.place}": weapon "${w}" aims at its pattern's default bone "${ch.fore}" (${ch.chain.join(' > ')}), the mdl lacks it and the place names no {foresight}: the aimer has no bone, the weapon will not fire (PORT-134, PORT-84); mdl bones that look like one: ${lk.length ? lk.join(', ') : 'none'}` };
        hide(m, p.node, null);
        if (!res.misses.some(x => x.key === 'DF_AIM' && x.place === p.place && x.name === w)) res.misses.push(m);
      }
      if (!p.nb && ch.barrels > 1) shooters.push({ prefix: p.prefix, n: ch.barrels, place: p.place, line: p.line, fromStuff: true });
    }
  }
  for (const s of shooters) {
    const miss = []; for (let i = 0; i < s.n; i++) { const b = s.prefix + String(i).padStart(2, '0'); if (!mdl.bones.has(lc(b))) miss.push(b); }
    if (!miss.length) continue;
    // DF_BARRELS (PORT-135 [V log]): GoH barrels are shot1, shot2 ...; the engine reads shooter00, shooter01 ...
    const shots = []; for (let i = 1; i <= s.n; i++) shots.push('shot' + i);
    if (s.prefix === 'shooter' && mdl.bones.has('shot1') && mdl.bones.has('shot2')) {
      const ren = shots.filter(b => mdl.bones.has(b)).map(b => `${b} -> shooter${String(+b.slice(4) - 1).padStart(2, '0')}`);
      warn('DF_BARRELS', miss.join(' '), `place "${s.place}" has ${s.n} barrels${s.fromStuff ? ' (from the weapon stuff)' : ''}; the mdl has ${ren.map(x => x.split(' ')[0]).join(', ')} but no ${miss.join(', ')}: "Can't find bone" every shot (PORT-135); rename ${ren.join(', ')} in the mdl`, `mdl: rename ${ren.join(', ')}`);
    } else warn('DF_SHOOTER', miss.join(' '), `place "${s.place}" has ${s.n} barrels${s.fromStuff ? ' (from the weapon stuff)' : ''}; mdl lacks bone(s) ${miss.join(', ')} (, shots spawn from the aimer bone)`, `mdl: add bone(s) ${miss.join(', ')}, or def: {Barrels 1} under place "${s.place}"`);
  }
  // DF_GUN_BASIS (PORT-133 [V fix, I cause]): a towed gun whose mdl basis is a plain bone is silent. The 25 vanilla PatherID "cannon" defs are all under /cannon/ [V count]
  if (isGun && mdl.bones.has('basis') && mdl.types.get('basis') === '')
    warn('DF_GUN_BASIS', 'basis', 'towed gun (PatherID cannon/mortar/gun/howitzer) but the mdl\'s "basis" is a plain bone: PORT-133 silent unit, 0 shots; write {bone revolute "basis" {speed 0.01}} in the mdl', 'mdl: change {bone "basis"} to {bone revolute "basis" {speed 0.01}}');
  // CHK-DONOR fillings [I]. Vanilla as64 (mowas_2 vfs): 142 of 142 readable {weapon "X" filling ".."} carry every word of X's own {filling}, and all 161 entity fillings
  // match a non-pattern stuff FILE NAME by tags (probe,. Not judged when the chain is unreadable, the name has a %param, or the target has < 20 stuff files.
  { const seenF = new Set();
    for (const f of wfills) {
      const wn = lc(f.weapon).replace(/^weapon\s+/, ''), want = words(f.fill), id = wn + '|' + want.join(' ');
      if (!want.length || wn.includes('%') || want.some(x => x.includes('%')) || seenF.has(id)) continue;
      seenF.add(id);
      const ch = stuffChain(wn), own = ch.ok && ch.fill ? words(ch.fill) : null;      // WARN_FILLING_GUN (PORT-156 [I]): the def's filling lacks words of the mounted gun's own filling: null magazine at arm, GetMagazine crash
      const lack = own ? own.filter(x => !want.includes(x)) : [];
      if (lack.length) warn('WARN_FILLING_GUN', f.weapon, `def line ${f.line}: {weapon "${f.weapon}" filling "${f.fill}"} but the gun loads filling "${ch.fill}" (${ch.chain.join(' > ')}); the def's filling lacks ${lack.map(x => '"' + x + '"').join(', ')}: the gun gets no magazine, crash at arm in GetMagazine (PORT-156 [I])`,
        `def line ${f.line}: point the filling at the gun's own ammo, e.g. filling "${[...(want.includes('ammo') && !own.includes('ammo') ? ['ammo'] : []), ...own, ...want.filter(x => x !== 'ammo' && !/^bullet/.test(x) && !own.includes(x))].join(' ')}", and the {box} items to match`);
      // WARN_FILLING_FORM (PORT-162 [V form, I crash]): no stuff file name carries all the filling's words: the def wrote the other game's form (GoH "bulletrus_76 aphebc", AS2 "ammo bullet76 ap")
      const sx = stuffTagIdx();
      if (sx.n < 20) continue;
      let cand = null, ok = true;
      for (const t of want) { const l = sx.by.get(t); if (!l) { ok = false; break; } if (!cand || l.length < cand.length) cand = l; }
      if (ok) ok = cand.some(k => { const tg = sx.files.get(k).tags; return !tg.has('pattern') && want.every(t => tg.has(t)); });
      if (!ok) {
        const alt = want[0] === 'ammo' ? want.slice(1) : ['ammo', ...want];
        let altOk = alt.length > 0;
        if (altOk) { let c2 = null; for (const t of alt) { const l = sx.by.get(t); if (!l) { altOk = false; break; } if (!c2 || l.length < c2.length) c2 = l; } if (altOk) altOk = c2.some(k => { const tg = sx.files.get(k).tags; return !tg.has('pattern') && alt.every(t => tg.has(t)); }); }
        warn('WARN_FILLING_FORM', f.fill, `def line ${f.line}: {weapon "${f.weapon}" filling "${f.fill}"}: no ammo file name in the mod or the game carries all these words${own ? ' (the gun\'s own filling is "' + ch.fill + '")' : ''}; GoH writes "bulletrus_76 aphebc", AS2 "ammo bullet76 ap": the gun gets no ammo, crash at arm likely (PORT-162 [I])`,
          `def line ${f.line}: ${altOk ? `write filling "${alt.join(' ')}" (that form matches an ammo file)` : 'write the filling the way the gun\'s ammo files are named (the words of one file name in set/stuff)'}`);
      }
    } }
  // DF_MACRO (PORT-136 [V]): enumerator extender / shield volume from a macro, no bone in the mdl
  { const seenM = new Set();
    for (const h of macroHits) { const id = h.kind + '|' + lc(h.name); if (seenM.has(id)) continue; seenM.add(id);
      warn('DF_MACRO', h.name, `${h.kind === 'enumerator' ? 'extender "enumerator"' : 'shield volume "' + h.name + '"'}${h.chain ? ' from macro ' + h.chain : ''} (def line ${h.line}) but the mdl has no such ${h.kind === 'enumerator' ? 'bone' : 'volume or bone'}; drop it (PORT-136)${h.kind === 'enumerator' ? '. Log noise only:  warns and returns, it changes no crew or weapon state; fiat626_breda has no enumerator bone and kills (FXD-2 [V])' : ''}`, h.kind === 'enumerator' ? 'def: drop {extender "enumerator"} (the enumerator macro)' : `def: drop the shield volume "${h.name}"${h.chain ? ' (macro ' + h.chain + ')' : ''}`); } }
  // DF_PIVOT: (wheel chassis, also water which derives from it). The chassis is read from the def's {Chassis "x"}
  if (chassis === 'wheel' || chassis === 'water') {
    const mp = ['pivot_front', 'pivot_back'].filter(b => !mdl.bones.has(b));
    if (mp.length) warn('DF_PIVOT', mp.join(' '), `{Chassis "${chassis}"} but the mdl lacks ${mp.join(' & ')}: engine logs 'no "..." bones' and wheel offsets default`, `mdl: add bone(s) ${mp.join(', ')}`);
  }
  // BG-1 / BG-2 (TST-97, SWEEP-0A): two defs built and fitted PASS that the game could not load. Blocking misses; no fix is applied (UNAPPLIED), the unit is refused.
  if (!item) {
    // BG-2 [V log 210mm_morser_16]: a {weapon "tags"} no Stuff carries -> "No Stuff found for tags" then ACCESS_VIOLATION .
    // Stuff = every file in set/stuff (not .fsm/.hand/.presets/_settings); its tags for this lookup = the file name split on '.' ONLY (see stuffResolves).
    // Skipped (note) when the target holds fewer than 20 stuff files: that is a test fixture, not a game data set.
    const wset = [...new Set(weapons.map(lc))];
    if (wset.length) {
      const sx = stuffTagIdx();
      if (sx.n < 20) res.notes.push(`BG-2: target has ${sx.n} stuff file(s), fewer than 20: {weapon} tags not checked`);
      else for (const w of wset) {
        if (w.includes('%')) continue;
        if (stuffResolves(sx, w)) continue;
        const src = weapons.find(x => lc(x) === w);
        res.misses.push({ key: 'DF_STUFF', name: src, kind: 'stuff', macro: null, defLine: 0, parent: 'place', src: 'def',
          detail: `{weapon "${src}"}: no non-pattern Stuff FILE NAME in the mod or the vfs carries all these tags (the lookup reads file-name tags only, ; {tag} and {from} tags are not searched): the engine logs "No Stuff found for tags" and crashes in  (; TST-97 [V log, SWEEP-0A]); ${sx.n} stuff file names indexed` });
      }
    }
    // BG-1 [V log opel_maultier]: a def with volumes and no material source -> "Undefined material for entity", then the load aborts.
    // Material source (all read from the expanded def): a props tag of "flesh steel wood concrete sand ice straw", {volume default_material "m"}, or a {material "m"} on a volume.
    // Names: every material the def names must be a top-level block of /set/material.set (Unknown material).
    // Skipped (note) when the target has no /set/material.set (a fixture).
    const matKey = 'resource/set/material.set', matBuf = readKey(matKey);
    const propsTags = [], matNames = [], defaultMats = []; let nVol = 0;
    (function mw(n) {
      for (const c of kids(n)) {
        if (!isBlock(c)) continue;
        const nm = bname(c);
        if (nm === 'props') for (const x of c.items) if (x.k === 'STRING') propsTags.push(...lc(x.value).split(/\s+/).filter(Boolean));
        if (nm === 'volume' && c.items.some(x => x.k === 'IDENT' && lc(x.text) === 'default_material')) { const s = c.items.find(x => x.k === 'STRING'); if (s) defaultMats.push(lc(s.value)); }
        else if (nm === 'volume' && c.items.some(x => x.k === 'STRING')) nVol++;
        if (nm === 'material') { const a = argOf(c); if (a && a.name) matNames.push(lc(a.name)); }
        mw(c);
      }
    })(ge);
    if (matBuf) {
      const known = new Set([...matBuf.toString('latin1').replace(/;[^\r\n]*/g, '').matchAll(/^\t\{\s*"([^"]+)"/gm)].map(m => lc(m[1])));
      const DEF = ['flesh', 'steel', 'wood', 'concrete', 'sand', 'ice', 'straw'];
      for (const mn of new Set([...matNames, ...defaultMats])) if (known.size && !known.has(mn))
        res.misses.push({ key: 'DF_MATERIAL', name: mn, kind: 'material', macro: null, defLine: 0, parent: 'volume', src: 'def', detail: `material "${mn}" is not a block of /set/material.set (${known.size} materials): "Unknown material" at load` });
      const hasSrc = propsTags.some(t => DEF.includes(t)) || defaultMats.length || matNames.length;
      if (!hasSrc && (nVol > 0 || mdl.volumes.size > 0) && known.size)
        res.misses.push({ key: 'DF_MATERIAL', name: 'no material source', kind: 'material', macro: null, defLine: 0, parent: 'game_entity', src: 'def',
          detail: `the expanded def has ${nVol} {volume}(s) (mdl ${mdl.volumes.size}) and no material source: no props tag of ${DEF.join('/')}, no {volume default_material}, no {material} (props: ${[...new Set(propsTags)].join(' ') || 'none'}): "Undefined material for entity" at load, then the load aborts (TST-97 [V log, SWEEP-0A])` });
    } else if (nVol > 0 || propsTags.length) res.notes.push('BG-1: target has no /set/material.set: material names and sources not checked');
    // DF_PROPS (BUILD-GATE): FindEntityInfo ( [V]) logs `Unknown props : "..."` for every def tag that no block
    // /set/interaction_entity/entity.set (with its includes) both names and matches whole (all its tags in the entity's tags). Harmless [V]: a warning.
    // The entity's own name tag is known by the engine rule; props from {extension} files are not read here [I].
    if (propsTags.length) {
      const esKey = 'resource/set/interaction_entity/entity.set', esBuf = readKey(esKey);
      if (esBuf) {
        const er = sdlx.read(esBuf, { file: esKey, key: esKey, open, onError: () => {} }), sets = [];
        const top = kids(er.root).find(b => isBlock(b) && bname(b) === 'entities') || er.root;   // sdlreader(.., "entities"): the blocks sit in {entities ..}
        for (const b of kids(top)) if (isBlock(b)) { const s = b.items[0] && b.items[0].k === 'STRING' ? b.items[0] : null; if (s) sets.push(words(s.value)); }
        const tags = new Set([...propsTags, 'generic']), known = new Set(['generic']);
        for (const s of sets) if (s.length && s.every(t => tags.has(t))) for (const t of s) known.add(t);
        const unk = [...new Set(propsTags)].filter(t => !known.has(t));
        if (sets.length && unk.length) warn('DF_PROPS', unk.join(' '), `props word(s) ${unk.map(t => '"' + t + '"').join(', ')} match no block of ${sets.length} in entity.set: the engine logs Unknown props and no interaction script reacts to them; a typo, or a GoH tag AS2 has no script for`, `def: drop or fix the props word(s) ${unk.join(', ')}`);
      } else res.notes.push('DF_PROPS: target has no /set/interaction_entity/entity.set: props words not checked');
    }
  }
  // DF_LINK (port-donors row: a dropped seat may leave a dangling {link}): a boarder {link "door" "place"} whose place no {placer {place}} defines after expansion [I effect]
  { const seenL = new Set();
    for (const l of seatLinks) if (!l.place.includes('%') && !places.has(l.place) && !seenL.has(l.place)) { seenL.add(l.place);
      warn('DF_LINK', l.place, `{link "${l.door}" "${l.place}"} in the boarder names place "${l.place}", which no {placer {place}} defines after macro expansion: a dangling link (load effect unknown [T])`, `def: drop the {link .. "${l.place}" ..} line, or restore the seat`); } }
  // DF_READER (port-donors row, VOL-B ford_3ton_ammo): the as64 reader rules of goh2as2's defcheck (FXD-1) on the def text itself. A stray ")" is dropped by the reader (SDL-16 [V]): a warning, as in goh2as2 BG-3.
  try {
    const { checkDef } = require('../goh2as2/defcheck');
    for (const f of checkDef(defBuf.toString('latin1'), mdl.types)) {
      if (/the mdl's bone is plain/.test(f.msg)) continue;   // DF_PLAIN_BONE (FMT-05) says it, with the macro expansion
      if (f.warn || /^stray "\)"/.test(f.msg)) warn('DF_PAREN_STRAY', 'line ' + f.line, `def line ${f.line}: ${f.msg}; the reader drops a stray ")" silently (SDL-16 [V]), not a stop`, `def: delete the stray ")" on line ${f.line}`);
      else res.misses.push({ key: 'DF_READER', name: 'line ' + f.line, kind: 'syntax', macro: null, defLine: f.line, parent: '', src: path.basename(defFile) + ':' + f.line, detail: `the as64 reader would stop the game on this def (FXD-1 defcheck): ${f.msg}` });
    }
  } catch (e) { res.notes.push('DF_READER: reader check not run: ' + e.message); }
  // DF_MODINFO (PORT-131): the mod folder lacks mod.info, so the game does not list the mod and no def in it loads. Not for the game folder itself.
  if (roots[0] && defRel && !(opt.game && lc(fwd(path.resolve(opt.game))) === lc(roots[0])) && !fs.existsSync(roots[0] + '/mod.info'))
    warn('DF_MODINFO', 'mod.info', `mod folder ${roots[0]} has no mod.info: the game does not list the mod, the unit never loads (PORT-131)`, 'mod: add mod.info (copy one from another mod, set its name)');
  // DF_WEAPON [I]: calibre by name only (NNmm in the weapon name; data was not read); AP box = an item whose ammo word starts "ap"
  {
    const cal = s => { const m = /(\d+(?:\.\d+)?)\s*mm/i.exec(s || ''); return m ? parseFloat(m[1]) : null; };
    const rc = cal(opt.rep);
    for (const w of weapons) {
      const wc = cal(w);
      if (opt.rep && rc === null) { if (!res.notes.some(x => /rep name has no calibre/.test(x))) res.notes.push('DF_WEAPON: rep name has no NNmm calibre; calibre compare skipped'); }
      else if (opt.rep && wc !== null && wc !== rc) warn('DF_WEAPON', w, `weapon "${w}" is ${wc} mm, rep "${opt.rep}" is ${rc} mm (PORT-130: a donor fires the donor's weapon)`, `def: swap weapon "${w}" for the rep's ${rc} mm weapon`);
    }
    const shell = weapons.some(w => (cal(w) || 0) >= 20);
    if (shell && !boxItems.some(isApItem)) warn('DF_WEAPON', weapons.join(' '), `no AP item in the {box}${boxItems.length ? ' (items: ' + boxItems.join(', ') + ')' : ''}: a kill test needs an AP round (PORT-130)`, 'def: add an AP item to the {box} (e.g. {item "bulletNN ap" 20})');
  }
  // DF_FG (PORT-136 [I]): fg in the box of a unit whose rep is a tank: the AI shot fg at a tank. Rep kind: --rep-kind, or the rep's def under -vehicle/tank*
  // DF_ARMOUR (PORT-136 [I]): the donor def's armor_* class vs the rep's class (--rep-class, or the rep's def read from the mod/vfs); unreadable = a note
  if (opt.rep || opt.repClass || opt.repKind) {
    const rd = opt.rep ? findDef(opt.rep) : null;
    const repClass = opt.repClass || (rd && armClass(rd.text)) || null;
    const repTank = opt.repKind ? opt.repKind === 'tank' : rd ? /\/-vehicle\/tank/.test(rd.key) : null;
    const defClass = armClass(defBuf.toString('latin1'));
    if (defClass && repClass && defClass !== repClass)
      warn('DF_ARMOUR', 'armor_' + defClass, `def armour is class ${defClass} (armor_${defClass}), rep${opt.rep ? ' "' + opt.rep + '"' : ''} is class ${repClass}: a ${RANK[defClass] > RANK[repClass] ? 'heavier' : 'lighter'} donor skews every hit test (PORT-136)`, `def: replace ("armor_${defClass}" ...) with the rep's class ("armor_${repClass}" ...)`);
    else if (defClass && !repClass) res.notes.push(`DF_ARMOUR: rep class not readable (no def "${opt.rep || ''}" in the mod or vfs); armour check skipped, give --rep-class light|medium|heavy (def is ${defClass})`);
    const fg = boxItems.filter(b => ammoWords(b).includes('fg'));
    if (fg.length && repTank === true) warn('DF_FG', fg.join(', '), `{box} holds fg (${fg.join(', ')}) and the rep is a tank: the AI shot fg at a tank (PORT-136); list only the rep's AP rounds`, `def: drop the fg item(s) from the {box}: ${fg.join(', ')}`);
    else if (fg.length && repTank === null) res.notes.push('DF_FG: rep kind not readable; fg check skipped, give --rep-kind tank');
  }
  // DF_CREW_EXT (T-DONORREADY [V 1 game]): a vanilla extended crew macro (driver link through emit0 with the "driver" boarder anm, base "open_driver") on a GoH-made mdl:
  // every door and seat bone is there, yet no man of the crew ever links (no log line, NOORDER "shooter operatable"); crew_N_human on the same def and mdl orders and kills.
  // Which part of the driver link blocks (the emit0 door of the GoH mdl or its open_driver sequence) is [I]. Fit: rename the call to crew_N_human.
  if (mdl.goh) {
    const dt = defBuf.toString('latin1'), lines = dt.split('\n');
    lines.forEach((l, i) => { const m = /\(\s*"(crew_(\d+)_human_extended)"/i.exec(l.replace(/;.*$/, ''));
      if (m) res.misses.push({ key: 'DF_CREW_EXT', name: m[1], kind: 'macro', macro: null, defLine: i + 1, parent: 'game_entity', to: `crew_${m[2]}_human`,
        detail: `vanilla crew macro "${m[1]}" on a GoH-made mdl (door bones carry {parameters "group=..."}): the crew never links, unit never operatable, no log line; use "crew_${m[2]}_human" (T-DONORREADY [V])` }); });
  }
  // ---- --fit (DFIT-3): the smallest edit for each miss and warning, same edit counted once. Text only: nothing is written, the def is never touched.
  {
    const edits = new Map();
    const add = (text, line) => { const e = edits.get(text) || { edit: text, count: 0, lines: [] }; e.count++; if (line) e.lines.push(line); edits.set(text, e); };
    const BLK = { volume: 'volume', 'bone-block': 'bone', bone: 'bone', foresight: 'foresight', LinkBone: 'LinkBone', 'visor-bone': 'bone', door: 'door' };
    for (const m of res.misses) {
      const via = m.macro ? ` (macro ${m.macro})` : '';
      if (BLK[m.key]) {
        const lk = like(lc(m.name), m.key === 'volume' ? mdl.volumes : mdl.bones);
        add(`def: drop {${BLK[m.key]} "${m.name}"}${via}${lk.length ? `, or rename it to "${lk[0]}" (the mdl has it)` : ''}`, m.defLine);
      } else if (m.key === 'crew-place') add(`def: drop the crew line naming place "${m.name}"${via}, or add {placer {place "${m.name}"}}`, m.defLine);
      else if (m.key === 'DF_PLAIN_BONE') add(`def: remove {limits}/{speed} under {bone "${m.name}"}, or mdl: {bone revolute "${m.name}"}`, m.defLine);
      else if (m.key === 'DF_FOLDER') add(`mod: put ${m.name} into the Extension's folder`, null);
      else if (m.key === 'DF_AIM') add(m.fix, m.defLine);
      else if (m.key === 'DF_CREW_EXT') add(`def: replace the crew macro "${m.name}" with "${m.to}"`, m.defLine);
      else if (m.key === 'DF_BONE_MISSING') { const lk = like(lc(m.name), mdl.bones); add(`def: rename place "${m.name}"${m.role ? ` (type ${m.role})` : ''} to a mdl bone${lk.length ? ' (' + lk.slice(0, 3).join(', ') + ')' : ''}, or add {LinkBone "<bone>"} to it (goh2as2 maps it by role)`, m.defLine); }
    }
    for (const w of res.warnings) if (w.fix) add(w.fix, null);
    // DFIT-4: a door miss + a crew macro in the def -> name a crew macro of the game whose doors the mdl has, or say none fits
    const doorMiss = res.misses.filter(m => m.key === 'door');
    const curM = /\(\s*"(crew_\d+_human\w*)"/i.exec(defBuf.toString('latin1'));
    if (doorMiss.length && curM) {
      const bodies = new Map();   // macro name -> door-name set. Sources: the macros the def's includes defined, the mod folder, the vfs crew property files
      const doorsOf = text => { const s = new Set(); for (const x of String(text).replace(/;[^\r\n]*/g, '').matchAll(/door\d?\(\s*(\w+)\s*\)|\{\s*door\d?\s+"(\w+)"/gi)) s.add(lc(x[1] || x[2])); return s; };
      const addText = text => { for (const x of String(text).matchAll(/\(\s*define\s+"(crew_\d+_human\w*)"/gi)) { if (bodies.has(x[1])) continue; let i = x.index + x[0].length, d = 1; const st = i; for (; i < text.length && d > 0; i++) { if (text[i] === '(') d++; else if (text[i] === ')') d--; } bodies.set(x[1], doorsOf(text.slice(st, i - 1))); } };
      for (const [n, d] of defines) if (/^crew_\d+_human/i.test(n)) bodies.set(n, doorsOf(d.text));
      if (roots[0]) (function scan(d) { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { const p = d + '/' + e.name; if (e.isDirectory()) scan(p); else if (/\.ext$/i.test(e.name)) { try { addText(fs.readFileSync(p, 'latin1')); } catch (x) { /* skip */ } } } })(roots[0] + '/resource/properties');
      if (vfs) for (const k of vfs.files.keys()) if (/^resource\/properties\/.*\.ext$/.test(k) && /crew/.test(k)) { const b = readKey(k); if (b) addText(b.toString('latin1')); }
      const nOf = s => +(/^crew_(\d+)/i.exec(s) || [0, 0])[1], cn = nOf(curM[1]);
      const fits = [...bodies].filter(([n, ds]) => ds.size && [...ds].every(x => mdl.bones.has(x))).map(([n, ds]) => ({ n, ds: [...ds].sort() }))
        .sort((a, b) => Math.abs(nOf(a.n) - cn) - Math.abs(nOf(b.n) - cn) || a.ds.length - b.ds.length || (a.n < b.n ? -1 : 1));
      res.crewFit = { current: curM[1], missingDoors: [...new Set(doorMiss.map(m => m.name))], candidatesRead: bodies.size, name: fits.length ? fits[0].n : null, also: fits.slice(1, 4).map(f => f.n) };
      add(fits.length
        ? `def: replace the crew macro "${curM[1]}" with "${fits[0].n}" (doors ${fits[0].ds.join(', ')}, all in the mdl; the crew places differ, check the weapon places still find theirs)${fits.length > 1 ? '; next: ' + fits.slice(1, 4).map(f => f.n).join(', ') : ''}`
        : `NO crew macro of the game fits: none of the ${bodies.size} crew macros read has all its doors in the mdl (missing "${res.crewFit.missingDoors.join('", "')}"); add the door bone(s) to the mdl, or drop the crew macro and write the doors by hand`, null);
    }
    res.fit = [...edits.values()];
  }
  res.ok = !res.misses.length;
  res.complete = !res.unresolved.some(u => u.what !== 'vfs' || /build failed/.test(u.why || ''));   // false: names inside an unresolved include/macro were not checked
  if (opt.write) Object.defineProperty(res, 'plan', { value: planFit(), enumerable: false });

  // ---- FXC-2 --write: turn the misses into line edits of the def and of its loose .ext files. Nothing is written here; fitWrite() writes the copies.
  function planFit() {
    const PRIMARY = new Set(['driver', 'commander', 'gunner', 'charger', 'loader', 'radio', 'assistant']);   // [I] base roles stay; secondary crew (gunner2, seat3...) go with their weapon
    const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const texts = new Map([[defFile, defBuf.toString('latin1')]]);
    for (const [f, e] of extLocal) texts.set(f, e.text);
    const linesOf = new Map(); for (const [f, t] of texts) linesOf.set(f, t.match(/[^\n]*\n|[^\n]+$/g) || []);
    const drops = new Map(), ren = new Map(), applied = [], unapplied = [];
    const siteOf = node => {   // the def/ext line to edit: the node itself when it was written there, else the outermost macro call in a local file
      if (!node.via) return texts.has(fwd(node.file)) ? { file: fwd(node.file), line: node.line, direct: true } : null;
      let best = null; for (let v = node.via; v; v = v.via) if (texts.has(fwd(v.file))) best = { file: fwd(v.file), line: v.line, direct: false };
      return best;
    };
    const strip = s => s.replace(/"[^"]*"/g, '""').replace(/;.*$/, '');
    const spanOK = (file, a, b, open, close) => {   // lines a..b are exactly one block/call and nothing else
      const L = linesOf.get(file); if (!L || a < 1 || b > L.length || b < a) return false;
      const s = L.slice(a - 1, b).map(strip).join('\n'); let d = 0, started = false;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (!started) { if (/\s/.test(ch)) continue; if (ch !== open) return false; started = true; d = 1; continue; }
        if (ch === open) d++; else if (ch === close) { d--; if (d === 0) return /^\s*$/.test(s.slice(i + 1)); }
      }
      return false;
    };
    const dropRange = (file, a, b, open, close, what) => {
      const cur = drops.get(file) || new Set(); let all = true; for (let i = a; i <= b; i++) if (!cur.has(i)) all = false;
      if (all) return true;
      if (!spanOK(file, a, b, open, close)) { unapplied.push(`${what}: lines ${a}-${b} of ${path.basename(file)} hold more than that one ${open === '{' ? 'block' : 'call'}`); return false; }
      for (let i = a; i <= b; i++) cur.add(i); drops.set(file, cur); applied.push(`${what} (${path.basename(file)}:${a}${b > a ? '-' + b : ''})`); return true;
    };
    const dropNode = (node, what) => {
      const s = siteOf(node);
      if (!s || !s.direct) { unapplied.push(`${what}: it comes from a macro or a file this run cannot edit (vfs/vanilla)`); return false; }
      return dropRange(s.file, node.line, node.endLine, '{', '}', what);
    };
    const rename = (file, line, re, to, what) => {
      const L = linesOf.get(file); if (!L || !L[line - 1] || !re.test(L[line - 1])) { unapplied.push(`${what}: text not found on ${path.basename(file)}:${line}`); return false; }
      (ren.get(file) || ren.set(file, []).get(file)).push({ line, re, to }); applied.push(`${what} (${path.basename(file)}:${line})`); return true;
    };
    const inDropped = node => { const s = siteOf(node), d = s && drops.get(s.file); return !!(d && d.has(node.line)); };
    for (const m of res.misses) if (m.key === 'DF_CREW_EXT') rename(defFile, m.defLine, new RegExp('"' + m.name + '"', 'i'), `"${m.to}"`, `crew macro ${m.name} -> ${m.to} (GoH mdl, DF_CREW_EXT)`);

    // ---- FXC-5 gap 1: a miss born in a vanilla include (crew macros, car_trace). The vfs file is copied beside the def (defines only, under a local name),
    // the def includes the copy after its own includes (a later (define) of the same name replaces the earlier one), and the copy is edited like a local crew.ext.
    const isVfsKey = f => /^resource\//i.test(f);
    const loadText = (f, buf) => { const t = buf.toString('latin1'); texts.set(f, t); linesOf.set(f, t.match(/[^\n]*\n|[^\n]+$/g) || []); };
    const incLine = new Map();   // vfs key -> first def line that reaches it (the copy's include goes before that line)
    const editable = file => {   // key of a file this plan may edit: the def/ext, a vfs include (copied), or a copy made by an earlier round
      const f = fwd(file);
      if (texts.has(f)) return f;
      if (isVfsKey(f)) { const b = readKey(lc(f)); if (!b) return null; loadText(f, b); return f; }
      if (path.posix.dirname(f) === path.posix.dirname(defFile) && /^fit_.*\.(ext|inc)$/i.test(path.posix.basename(f))) { try { loadText(f, fs.readFileSync(f)); return f; } catch (e) { return null; } }
      return null;
    };
    const lineAt = (fk, n) => (linesOf.get(fk) || [])[n - 1] || '';
    const defineSpan = (fk, n) => {   // first..last line of the (define ..) holding line n
      const L = linesOf.get(fk); let a = n; while (a >= 1 && !/^\s*\(\s*define\b/i.test(L[a - 1])) a--;
      if (a < 1) return [n, n];
      let d = 0, b = a; for (; b <= L.length; b++) { for (const ch of strip(L[b - 1])) { if (ch === '(') d++; else if (ch === ')') d--; } if (d <= 0) break; }
      return n <= b ? [a, Math.min(b, L.length)] : [n, n];
    };
    const frameList = node => { const fr = [{ file: node.file, line: node.line, body: true }]; for (let v = node.via; v; v = v.via) fr.push({ file: v.file, line: v.line }); return fr; };
    // seats that operate the unit: a missing bone/door here is never guessed away or dropped (PORT-137: the unit would load and never take an order)
    const OPERATE = new Set(['driver', 'gunner']);
    const bodyRe = (key, nm) => new RegExp((key === 'door' ? '((?:door\\d?|link)\\s+")' : key === 'LinkBone' ? '(linkbone\\s+")' : '(bone\\s+")') + esc(nm) + '(")', 'ig');
    const argRe = (key, nm) => new RegExp('(\\b' + (key === 'door' ? 'door\\d?' : key === 'LinkBone' ? 'bone' : 'bone\\w*') + '\\(\\s*"?)' + esc(nm) + '("?\\s*\\))', 'ig');
    const nonG = re => new RegExp(re.source, 'i');
    // returns true (applied), null (not applicable, reason pushed to unapplied) or false (nothing in the chain is editable: the caller reports)
    const deepFix = (m, node) => {
      const key = m.key, fr = frameList(node), label = `${key} "${m.name}"`;
      const eds = fr.map(f => editable(f.file));
      if (!eds.some(Boolean)) return false;
      for (let i = 1; i < fr.length; i++) if (eds[i] && drops.get(eds[i]) && drops.get(eds[i]).has(fr[i].line)) return true;   // its call line is already gone
      const defCall = fr.filter(f => fwd(f.file) === defFile).pop();
      const reach = fk => { if (isVfsKey(fk) && defCall) incLine.set(fk, Math.min(incLine.get(fk) || 1e9, defCall.line)); };
      // 1. rename to the one free bone of the same stem (more than one = ambiguous = not guessed)
      const lk = freeLike(key, m.name, mdl.bones);
      if (lk.length === 1) {
        for (let i = 0; i < fr.length; i++) {
          const fk = eds[i], f = fr[i]; if (!fk || (key === 'bone' && isVfsKey(fk))) continue;   // trace bone names inside vanilla macros are not renamed: the call line goes instead
          const re = f.body ? bodyRe(key, m.name) : argRe(key, m.name);
          if (!nonG(re).test(lineAt(fk, f.line))) continue;
          const [a, b] = f.body ? defineSpan(fk, f.line) : [f.line, f.line];
          for (let n = a; n <= b; n++) if (nonG(re).test(lineAt(fk, n))) (ren.get(fk) || ren.set(fk, []).get(fk)).push({ line: n, re, to: '$1' + lk[0] + '$2' });
          pick(key, m.name, lk[0]); reach(fk);
          applied.push(`rename ${label} -> "${lk[0]}" in ${isVfsKey(fk) ? 'the local copy of ' : ''}${path.basename(fk)}:${f.line}${b > a ? ' (macro body)' : ''}`);
          return true;
        }
      }
      // 2. drop the trace call line / the secondary crew call line
      if (key === 'bone') {
        for (let i = 1; i < fr.length; i++) {
          const fk = eds[i]; if (!fk || isVfsKey(fk) || !/^\s*\(\s*"(?:car|tank)_trace/i.test(lineAt(fk, fr[i].line))) continue;
          return dropRange(fk, fr[i].line, fr[i].line, '(', ')', `drop trace call line (${label} absent, no single free bone)`) ? true : null;
        }
        unapplied.push(`${label}: no trace call line to drop in a file this run can edit (def line ${m.defLine})`); return null;
      }
      for (let i = 1; i < fr.length; i++) {
        const fk = eds[i]; if (!fk) continue;
        const pm = /^\s*\(\s*"[^"]+"[^\n]*\b(?:place|p)\(\s*(\w+)\s*\)/i.exec(lineAt(fk, fr[i].line)); if (!pm) continue;
        const pl = lc(pm[1]);
        if (OPERATE.has(pl)) { unapplied.push(`${label}: seat "${pl}" operates the unit and the mdl has no bone for it: stays a MISS (PORT-137), a drop or a guess would hide a unit that cannot be operated`); return null; }
        const users = wplaces.filter(o => !deadWp.has(o) && o.crew.includes(pl));
        const mainWp = users.find(u => u === wplaces[0] || u.name === 'gun');   // the unit's main weapon: its crew seat is a gunner in all but name
        if (mainWp) { unapplied.push(`${label}: seat "${pl}" crews the main weapon place "${mainWp.name}" and the mdl has no bone for it: stays a MISS (PORT-137), dropping it would drop the main gun`); return null; }
        for (const u of users) {   // a weapon place whose crew seat goes cannot be manned: it goes with the seat, with its user item
          if (!dropNode(u.node, `drop weapon place "${u.name}" (crew seat "${pl}" dropped: ${label} absent)`)) return null;
          deadWp.add(u);
          for (const ui of userItems) if (ui.user === u.name) dropNode(ui.node, `drop item {user "${u.name}"} of the dropped place`);
        }
        if (!dropRange(fk, fr[i].line, fr[i].line, '(', ')', `drop crew call line of seat "${pl}" (${label} absent, no single free bone)`)) return null;
        reach(fk); return true;
      }
      unapplied.push(`${label}: ${key === 'door' ? 'door' : 'seat bone'} born in macro ${m.macro || '?'} with no seat call line to drop; a driver door or gunner with no bone stays a MISS (PORT-137), the def has to take another crew macro or the mdl needs the bone (def line ${m.defLine})`);
      return null;
    };
    const defineLines = L => {   // which lines belong to a top-level (define ..): the copy of a vanilla file keeps only those, the rest is blanked so the include adds no second copy of the file's own blocks
      const keep = new Array(L.length).fill(false); let d = 0, inDef = false;
      for (let i = 0; i < L.length; i++) {
        const s = strip(L[i]); if (d === 0 && /^\s*\(\s*define\b/i.test(s)) inDef = true;
        if (inDef) keep[i] = true;
        for (const ch of s) { if (ch === '(') d++; else if (ch === ')') d = Math.max(0, d - 1); }
        if (inDef && d === 0) inDef = false;
      }
      return keep;
    };

    // gap 3: a weapon place whose LinkBone (or crew place) is absent goes whole: place, {item .. {user "<place>"}}, and the secondary crew line nobody else uses
    const dead = new Set();
    for (const wp of wplaces) {
      const bl = wp.links.find(l => !mdl.bones.has(l.name)), bc = wp.crew.find(n => !places.has(n));
      if (bl || bc) dead.add({ wp, why: bl ? `LinkBone "${bl.name}" absent` : `crew place "${bc}" absent` });
    }
    const deadWp = new Set([...dead].map(d => d.wp));
    for (const { wp, why } of dead) {
      if (!dropNode(wp.node, `drop weapon place "${wp.name}" (${why})`)) continue;
      for (const ui of userItems) if (ui.user === wp.name) dropNode(ui.node, `drop item {user "${wp.name}"} of the dropped place`);
      for (const n of new Set(wp.crew)) {
        if (!places.has(n) || PRIMARY.has(n) || wplaces.some(o => !deadWp.has(o) && o.crew.includes(n))) continue;
        const re = new RegExp('^\\s*\\(\\s*"[^"]+"[^\\n]*\\bplace\\(\\s*' + esc(n) + '\\s*\\)', 'i');
        for (const [f, L] of linesOf) L.forEach((t, i) => { if (re.test(t)) dropRange(f, i + 1, i + 1, '(', ')', `drop crew line of place "${n}" (only the dropped place "${wp.name}" used it)`); });
      }
    }
    const chosen = new Map();   // FXC-5: "key|name" -> the bone it was renamed to; the same absent name gets the same bone at every site (a second seat sharing emit0 must not see the first one's pick as taken)
    const freeLike = (key, name, pool) => { const c = chosen.get(key + '|' + lc(name)); return c ? [c] : like(lc(name), pool).filter(x => !(used[key] || new Set()).has(x)); };
    const pick = (key, name, to) => { (used[key] = used[key] || new Set()).add(to); chosen.set(key + '|' + lc(name), to); };
    // FXD-2: the seat role of a placer LinkBone miss (a direct {place "x"} or a macro call line's place(x)/p(x)); base roles keep their seat (below), secondary seats keep the older drop rules
    const seatRole = (m, s, dir) => {
      if (dir) { const pa = m._par && argOf(m._par); return pa && pa.name ? lc(pa.name) : ''; }
      const L = s && linesOf.get(s.file)[s.line - 1], pm = L && /\b(?:place|p)\(\s*(\w+)\s*\)/i.exec(L); return pm ? lc(pm[1]) : '';
    };
    // VOL-B fallback seat rule [I, T in game]: a base-role seat whose linkbone the mdl lacks and whose macro has no linkbone-free sibling. The macro that holds the
    // {linkbone} is copied, minus every {linkbone ..} block, as "<macro>_nolb" into a local fit_nolb.inc (the def includes it), and that seat's call line calls the copy.
    // Same result as the sibling swap above: the seat sits on the owner origin instead of being broken by BreakSeats.
    const nolbDone = new Map();   // macro name -> copy name
    function nolbFallback(m, node, label) {
      const fr = frameList(node), defCall = fr.filter(f => fwd(f.file) === defFile).pop();
      for (let i = 1; i < fr.length; i++) {
        const fk = editable(fr[i].file); if (!fk) continue;
        const L = lineAt(fk, fr[i].line), cm = /^\s*\(\s*"([^"]+)"/.exec(L); if (!cm) continue;
        const d = [...defines].find(([n]) => lc(n) === lc(cm[1])); if (!d || !/\{\s*linkbone\b/i.test(d[1].text)) continue;
        const pm = /\b(?:place|p)\(\s*(\w+)\s*\)/i.exec(L); if (!pm || !PRIMARY.has(lc(pm[1]))) continue;
        const to = d[0] + '_nolb', body = d[1].text.replace(/^[ \t]*\{\s*linkbone\s+[^{}]*\}[ \t]*\r?\n/gim, '').replace(/\{\s*linkbone\s+[^{}]*\}/gi, '');
        if (!nolbDone.has(lc(d[0]))) {
          const local = fwd(path.posix.dirname(defFile) + '/fit_nolb.inc'), has0 = fs.existsSync(local), inc0 = has0 && /\(\s*include\s+"[^"]*fit_nolb\.inc"/i.test(texts.get(defFile) || '');
          const key = inc0 ? editable(local) : 'resource/__donorfit/nolb.inc';   // the def includes it already: edit it in place; else a fresh copy (with the old one's defines) the def gets an include for
          if (!inc0 && has0 && !texts.has(key)) loadText(key, fs.readFileSync(local));
          const prev = texts.get(key) || '', e = /\r\n/.test(texts.get(defFile)) ? '\r\n' : '\n';
          if (!new RegExp('\\(\\s*define\\s+"' + esc(to) + '"', 'i').test(prev)) {
            loadText(key, Buffer.from(prev + (prev && !/\n$/.test(prev) ? e : '') + `(define "${to}"${body.replace(/\r?\n/g, e)})${e}`, 'latin1'));
            applied.push(`macro "${d[0]}" copied without its {linkbone} as "${to}" into fit_nolb.inc`);
          }
          (ren.get(key) || ren.set(key, []).get(key)).push({ line: 1, re: /^/, to: '' });   // marks the file as edited so it is written
          if (isVfsKey(key) && defCall) incLine.set(key, Math.min(incLine.get(key) || 1e9, defCall.line));
          nolbDone.set(lc(d[0]), to);
        }
        const r = ren.get(fk) || ren.set(fk, []).get(fk);
        r.push({ line: fr[i].line, re: new RegExp('^(\\s*\\(\\s*")' + esc(d[0]) + '(")', 'i'), to: '$1' + to + '$2' });
        for (const a of (L.match(/\s+\w+\(\s*[^()\s]*\s*\)/g) || [])) { const an = /(\w+)\(/.exec(a)[1];   // drop an arg (bone(x), b(x)) the copy no longer uses
          if (!new RegExp('%' + esc(an) + '\\b', 'i').test(body) && new RegExp('%' + esc(an) + '\\b', 'i').test(d[1].text)) r.push({ line: fr[i].line, re: new RegExp(esc(a)), to: '' }); }
        if (isVfsKey(fk) && defCall) incLine.set(fk, Math.min(incLine.get(fk) || 1e9, defCall.line));
        applied.push(`seat ${label}: call "${d[0]}" -> "${to}" on ${isVfsKey(fk) ? 'the local copy of ' : ''}${path.basename(fk)}:${fr[i].line} (no linkbone-free sibling; seat on the owner origin) [T]`);
        return true;
      }
      return false;
    }
    for (const m of res.misses) {
      if (m.key === 'DF_CREW_EXT') continue;   // renamed above
      const node = m._node; if (!node) { unapplied.push(`${m.key} "${m.name}": ${m.key === 'DF_READER' ? 'a reader error needs a hand edit (no rule)' : 'no source node'}`); continue; }
      if (m.key === 'crew-place') continue;   // settled by the dead-place drop above
      if (m.key === 'DF_FOLDER' || m.key === 'DF_INCLUDE') { unapplied.push(`${m.key} "${m.name}": needs a file this tool does not have`); continue; }
      if (inDropped(node)) continue;
      const s = siteOf(node), dir = !!(s && s.direct), label = `${m.key} "${m.name}"`;
      if (m.key === 'volume' || m.key === 'bone-block' || m.key === 'bone') {
        const lk = freeLike(m.key, m.name, m.key === 'volume' ? mdl.volumes : mdl.bones);
        if (dir && lk.length) { pick(m.key, m.name, lk[0]); rename(s.file, node.line, new RegExp('"' + esc(m.name) + '"', 'i'), '"' + lk[0] + '"', `rename ${label} -> "${lk[0]}"`); }
        else if (!dir && m.key === 'bone' && deepFix(m, node) !== false) { /* FXC-5: macro-born trace bone, handled (or reported) there */ }
        else dropNode(node, `drop ${label}`);
      } else if (m.key === 'foresight') dropNode(node, `drop ${label}`);
      else if (m.key === 'DF_AIM') {   // FXD-2: name the mdl's lookalike aim bone on the place's opening line (cckw_m33_a did this and killed)
        if (!m.lookalike) unapplied.push(`${label}: no aim bone in the mdl looks like the default; add the bone to the mdl or name one by hand (place "${m.place}")`);
        else if (!dir) unapplied.push(`${label}: place "${m.place}" is not written in a file this run can edit`);
        else rename(s.file, node.line, /(\{\s*place\s+"[^"]*")/i, '$1 {foresight "' + m.lookalike + '"}', `add {foresight "${m.lookalike}"} to place "${m.place}" (aim bone default absent)`);
      } else if (m.key === 'LinkBone' && !wplaces.some(w => w.node === m._par) && PRIMARY.has(seatRole(m, s, dir))) {
        // FXD-2: a SEAT's linkbone absent from the mdl. ( [V]) marks the seat broken and frees its occupant, so the crew never sits
        // and the weapon has no gunner. A null linkbone puts the seat on the owner origin. aec_mk3 hand fit (crew_human_inside, no linkbone) killed [V].
        if (dir) dropNode(node, `drop ${label} (seat stays, on the owner origin)`);
        else {
          const L = s && linesOf.get(s.file)[s.line - 1], cm = L && /^\s*\(\s*"([^"]+)"/.exec(L);
          const macroOK = c => { const d = [...defines].find(([n]) => lc(n) === lc(c)); if (d) return !/linkbone/i.test(d[1].text); for (const t of texts.values()) { const i = t.search(new RegExp('\\(\\s*define\\s+"' + esc(c) + '"', 'i')); if (i >= 0) return !/linkbone/i.test(t.slice(i, i + 600).split(/\(\s*define\b/i)[1] || ''); } return false; };
          const cands = cm ? [cm[1].replace(/_visible(_anm)?$/i, ''), cm[1] + '_inside'].filter(x => lc(x) !== lc(cm[1])) : [];
          const to = cands.find(macroOK);
          if (to) {
            rename(s.file, s.line, new RegExp('^(\\s*\\(\\s*")' + esc(cm[1]) + '(")', 'i'), '$1' + to + '$2', `seat ${label}: call "${cm[1]}" -> "${to}" (same seat without the linkbone)`);
            (ren.get(s.file) || []).push({ line: s.line, re: /\s+bone\(\s*\w+\s*\)/i, to: '' });
          } else if (!nolbFallback(m, node, label)) unapplied.push(`${label}: seat linkbone absent and no macro without linkbone found beside "${cm ? cm[1] : '?'}" (def line ${m.defLine}); the seat is broken at spawn (BreakSeats)`);
        }
      } else if (m.key === 'LinkBone') {
        if (dir) dropNode(m._par && bname(m._par) === 'place' ? m._par : node, `drop ${m._par && bname(m._par) === 'place' ? 'place of ' : ''}${label}`);
        else {
          const L = s && linesOf.get(s.file)[s.line - 1], pm = L && /\b(?:place|p)\(\s*(\w+)\s*\)/i.exec(L);
          if (pm && /^\s*\(/.test(L) && !PRIMARY.has(lc(pm[1]))) dropRange(s.file, s.line, s.line, '(', ')', `drop call line of place "${pm[1]}" (${label} absent)`);
          else if (deepFix(m, node) === false) unapplied.push(`${label}: macro-born, no secondary-crew call line to drop (def line ${m.defLine})`);
        }
      } else if (m.key === 'door') {
        const lk = freeLike('door', m.name, mdl.bones);
        if (dir) { if (lk.length) { pick('door', m.name, lk[0]); rename(s.file, node.line, new RegExp('"' + esc(m.name) + '"', 'i'), '"' + lk[0] + '"', `rename ${label} -> "${lk[0]}"`); } else dropNode(node, `drop ${label}`); }
        else if (s) {
          const L = linesOf.get(s.file)[s.line - 1], re = new RegExp('(door\\d?\\(\\s*)' + esc(m.name) + '(\\s*\\))', 'i'), pm = /\b(?:place|p)\(\s*(\w+)\s*\)/i.exec(L);
          // FXD-2: the driver door of a crew_N_human_extended call (kv8s: emit0 absent, never operable): swap the call for the crew macro of the game whose doors the mdl has (--fit's crewFit)
          const cf = res.crewFit, cmm = cf && cf.name && new RegExp('^(\\s*\\(\\s*")' + esc(cf.current) + '(")', 'i');
          if (cmm && cmm.test(L) && lc(cf.current) !== lc(cf.name)) rename(s.file, s.line, cmm, '$1' + cf.name + '$2', `crew macro "${cf.current}" -> "${cf.name}" (${label} absent; the mdl has the doors of "${cf.name}")`);
          else if (re.test(L) && lk.length) { pick('door', m.name, lk[0]); rename(s.file, s.line, re, '$1' + lk[0] + '$2', `rename ${label} -> "${lk[0]}"`); }
          else if (/^\s*\(/.test(L) && pm && !PRIMARY.has(lc(pm[1])) && !wplaces.some(o => !deadWp.has(o) && o.crew.includes(lc(pm[1])))) dropRange(s.file, s.line, s.line, '(', ')', `drop call line of place "${pm[1]}" (${label} absent, no free door in the mdl)`);
          else if (deepFix(m, node) === false) unapplied.push(`${label}: no free door in the mdl and the call line is a base role or still used (def line ${m.defLine})`);
        } else unapplied.push(`${label}: comes from a file this run cannot edit`);
      } else if (m.key === 'DF_PLAIN_BONE') {
        for (const f of kids(node).filter(x => isBlock(x) && (bname(x) === 'limits' || bname(x) === 'speed'))) dropNode(f, `drop {${bname(f)}} under ${label}`);
      } else unapplied.push(`${label}: no rule`);
    }
    const files = new Map(), vfsNames = new Map();
    const eolOf = t => (/\r?\n$/.exec(t) || ['\r\n'])[0];
    const keys = new Set([...drops.keys(), ...ren.keys()].filter(f => !isVfsKey(f) || (ren.get(f) || []).length || (drops.get(f) || new Set()).size));
    for (const f of keys) if (isVfsKey(f)) vfsNames.set(f, 'fit_' + path.posix.basename(f));
    if (vfsNames.size) keys.add(defFile);
    for (const f of keys) {
      let L = linesOf.get(f).slice();
      for (const r of ren.get(f) || []) L[r.line - 1] = L[r.line - 1].replace(r.re, r.to);
      if (isVfsKey(f)) { const keep = defineLines(linesOf.get(f)); L = L.map((t, i) => keep[i] ? t : eolOf(t)); }
      if (f === defFile && vfsNames.size) {   // the def includes each copy after its last leading include, before the first line that reaches a copy
        const first = Math.min(...[...vfsNames.keys()].map(k => incLine.get(k) || 1e9)), dl = linesOf.get(defFile);
        let at = -1; for (let i = 0; i < dl.length && i + 1 < first; i++) if (/^\s*\(\s*include\b/i.test(dl[i])) at = i;
        const e = eolOf(dl[Math.max(at, 0)]), incs = [...vfsNames.values()].map(n => `(include "@FITDIR@${n}")` + e).join('');   // fitWrite fills @FITDIR@ with the copy's folder, as /entity/x/ from the resource root (a bare name would resolve against resource/)
        if (at < 0) L[0] = incs + L[0];   // no leading include (fit_nolb.inc into a def with none): the copy goes first, never inside line 1's block
        else { if (!/\r?\n$/.test(L[at])) L[at] += e; L[at] += incs; }
        for (const [k, n] of vfsNames) applied.push(`copy ${k} -> ${n} (defines only); the def includes it ${at < 0 ? 'before line 1' : 'after line ' + (at + 1)}, its macros replace the vanilla ones for this unit`);
      }
      const dr = drops.get(f); files.set(f, L.filter((_, i) => !(dr && dr.has(i + 1))).join(''));
    }
    return { files, applied, unapplied, vfsNames, ext: new Map([...extLocal].map(([f, e]) => [f, e.name])) };
  }
  return res;
}

// FXC-2: --fit --write. Rounds of check -> apply -> write the copy, until PASS, no edit left, or 5 rounds. Returns { res, applied, unapplied, out, wrote }.
function fitWrite(o) {
  const inDef = fwd(path.resolve(o.def)), outDef = fwd(path.resolve(o.out || inDef.replace(/\.def$/i, '') + '.fit.def')), D = path.posix.dirname(outDef);
  const protect = new Set([inDef]); if (outDef === inDef) protect.delete(inDef);   // original inputs are never overwritten unless --out names the def itself
  const applied = [], unapplied = [], written = []; let cur = path.resolve(o.def), res = null, mdlArg = o.mdl, moddir = o.moddir, first = true, done = false;
  for (let round = 1; round <= 5; round++) {
    res = check({ ...o, def: cur, mdl: mdlArg, moddir, write: true });
    if (res.fatal) break;
    if (first) { for (const f of res.plan ? res.plan.ext.keys() : []) protect.add(f); first = false; }
    if (!mdlArg && res.mdl && !/^vfs:/.test(res.mdl)) mdlArg = res.mdl;
    if (!moddir && res.moddir) moddir = res.moddir;
    unapplied.length = 0; if (res.plan) unapplied.push(...res.plan.unapplied);   // only what the latest round could not do: earlier rounds' leftovers show up again there
    if (res.ok || !res.plan || !res.plan.files.size) { done = true; break; }
    const curDef = fwd(path.resolve(cur)), p = res.plan;
    const outFiles = new Map();   // target path -> text
    let defText = p.files.get(curDef);
    const extMap = new Map();   // ext name as written -> new name, when an ext cannot keep its name
    for (const [f, text] of p.files) {
      if (f === curDef) continue;
      if (p.vfsNames.has(f)) { outFiles.set(D + '/' + p.vfsNames.get(f), text); continue; }   // FXC-5: the local copy of a vanilla include
      let t = D + '/' + path.posix.basename(f);
      if (protect.has(t) || t === inDef) t = D + '/' + path.posix.basename(f).replace(/\.ext$/i, '') + '.fit.ext';
      outFiles.set(t, text);
      if (path.posix.basename(t) !== path.posix.basename(f)) extMap.set(path.posix.basename(f), path.posix.basename(t));
    }
    if (defText === undefined) defText = fs.readFileSync(curDef, 'latin1');
    if (defText.includes('@FITDIR@')) {
      const mdRoot = fwd(path.resolve(moddir || res.moddir || '')), rel = moddir || res.moddir ? path.posix.relative(mdRoot + '/resource', D) : '..';
      defText = defText.replace(/@FITDIR@/g, rel.startsWith('..') ? '' : '/' + rel + '/');
    }
    for (const [a, b] of extMap) defText = defText.replace(new RegExp('("[^"]*?)' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"', 'ig'), '$1' + b + '"');
    outFiles.set(outDef, defText);
    for (const [t, text] of outFiles) {
      if (protect.has(t)) throw new Error('refusing to overwrite input ' + t);
      fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, Buffer.from(text, 'latin1')); if (!written.includes(t)) written.push(t);
    }
    // an ext untouched this round but loaded from the input dir must stay reachable from the output dir: copy it once
    for (const [f, name] of p.ext) {
      const t = D + '/' + path.posix.basename(f);
      if (D !== path.posix.dirname(f) && !outFiles.has(t) && !fs.existsSync(t)) { fs.mkdirSync(D, { recursive: true }); fs.copyFileSync(f, t); written.push(t); }
    }
    applied.push(...p.applied);
    cur = outDef;
  }
  if (!done && res && !res.fatal) { res = check({ ...o, def: cur, mdl: mdlArg, moddir, write: false }); unapplied.length = 0; }   // 5 rounds used: recheck the last write
  return { res, applied, unapplied: res && res.ok ? [] : unapplied, out: written.length ? outDef : null, written };
}

function print(res, o) {
  const L = [];
  L.push(`donorfit ${res.def}`);
  if (res.fatal) { L.push('FATAL ' + res.fatal); return L.join('\n'); }
  if (!res.mdl && !res.item) {   // mdl absent from the Extension's folder: only the folder miss is known
    for (const m of res.misses) L.push(`MISS ${m.key} "${m.name}"  def line ${m.defLine}  — ${m.detail}`);
    L.push(`FAIL ${res.misses.length} miss(es)`); return L.join('\n');
  }
  L.push(`mdl ${res.mdl || '(none)'}  bones ${res.mdlBones} volumes ${res.mdlVolumes}${res.mdlParseErrors ? ` (mdl read errors ${res.mdlParseErrors})` : ''}`);
  L.push('checked ' + Object.entries(res.counts).map(([k, v]) => `${k}:${v}`).join(' '));
  for (const m of res.misses) L.push(m.key === 'DF_FOLDER' ? `MISS ${m.key} "${m.name}"  — ${m.detail}` : `MISS ${m.key} "${m.name}"  macro: ${m.macro || '(direct in def)'}${m.inExt ? '  in ' + m.inExt : ''}  def line ${m.defLine}${m.src && m.macro ? '  src ' + m.src : ''}${m.detail ? '  — ' + m.detail : ''}`);
  for (const w of res.warnings) L.push(`WARN ${w.code} "${w.name}"  — ${w.detail}`);
  for (const m of res.leads) L.push(`LEAD ${m.key} "${m.name}"  macro: ${m.macro || '(direct in def)'}${m.inExt ? '  in ' + m.inExt : ''}  def line ${m.defLine}  — gun: a door miss alone did not block 105mm_lefh18m (PORT-128 [I]); not counted as a miss`);
  for (const u of res.unresolved) L.push(`CANNOT RESOLVE ${u.what} ${u.name}${u.where ? '  at ' + u.where : ''}${u.macro ? '  macro: ' + u.macro : ''}${u.why ? '  (' + u.why + ')' : ''}`);
  for (const n of res.notes) L.push('NOTE ' + n);
  if (o && o.fit) {
    L.push(res.fit && res.fit.length ? `FIT ${res.fit.length} edit(s) (text only, nothing written):` : 'FIT nothing to edit');
    for (const e of res.fit || []) L.push(`  - ${e.edit}${e.count > 1 ? `  (x${e.count}${e.lines.length ? ', def lines ' + [...new Set(e.lines)].join(',') : ''})` : e.lines.length ? `  (def line ${e.lines[0]})` : ''}`);
  }
  L.push(res.misses.length ? `FAIL ${res.misses.length} miss(es)` : res.complete ? 'PASS' : 'PASS-INCOMPLETE (no miss in what was readable; unresolved includes/macros above were not checked)');
  return L.join('\n');
}

// T-DONORREADY: bisect variants of a donor def, one change each, written beside it as <stem>_<tag>.def (the entity name is the file title)
// so one edrun game can try them side by side. Text edits on the def's own lines; CRLF and cp1251 bytes kept (latin1 round trip).
function blockAt(text, i) {   // [start, end) of the {...} block that opens at i, with its line (leading indent, trailing newline)
  let d = 0, j = i;
  for (; j < text.length; j++) { if (text[j] === '{') d++; else if (text[j] === '}' && --d === 0) { j++; break; } }
  const s = text.lastIndexOf('\n', i - 1) + 1, nl = text.indexOf('\n', j);
  const restBlank = nl >= 0 && /^[ \t\r]*$/.test(text.slice(j, nl));
  return [/^[ \t]*$/.test(text.slice(s, i)) ? s : i, restBlank ? nl + 1 : j];
}
const cut = (text, ranges) => ranges.sort((a, b) => b[0] - a[0]).reduce((t, [a, b]) => t.slice(0, a) + t.slice(b), text);
const placeBlocks = text => [...text.matchAll(/\{place\s+"([^"]+)"/gi)].map(m => { const [a, b] = blockAt(text, m.index); return { name: m[1], a, b, body: text.slice(m.index, b) }; });
function variants(text, opt = {}) {
  const V = [], add = (tag, why, t) => { if (t !== null && t !== text) V.push({ tag, why, text: t }); };
  if (opt.controlMdl) add('ctl', `model control: Extension -> ${opt.controlMdl}`, text.replace(/\{\s*Extension\s+"[^"]*"\s*\}/i, `{Extension "${opt.controlMdl}"}`));
  add('crew', 'crew macro crew_N_human_extended -> crew_N_human (no emit0 driver link, no "driver" boarder anm)', text.replace(/\("crew_(\d+)_human_extended"\)/i, '("crew_$1_human")'));
  { // gunner_visible (place gunner2, visor bone mgun2) dropped with the weapon places gunner2 crews
    const r = [...text.matchAll(/^[ \t]*\("gunner_visible"[^\n]*\n/gim)].map(m => [m.index, m.index + m[0].length]);
    if (r.length) add('vis', 'gunner_visible dropped, with the weapon places gunner2 crews', cut(text, r.concat(placeBlocks(text).filter(p => /\{\s*gunner\s+"gunner2"/i.test(p.body)).map(p => [p.a, p.b]))));
  }
  { const r = [...text.matchAll(/^[ \t]*\("seat_human"[^\n]*\n/gim)].map(m => [m.index, m.index + m[0].length]); if (r.length) add('seat', 'seat_human lines dropped (passenger seats)', cut(text, r)); }
  { const g = placeBlocks(text).find(p => lc(p.name) === 'gun' && !/\{\s*gunner\s/i.test(p.body));
    if (g) { const o = text.indexOf('{', g.a), nl = text.indexOf('\n', o), ind = (/^[ \t]*/.exec(text.slice(g.a)) || [''])[0];
      add('gunner', 'place "gun" gets {gunner "gunner"}', text.slice(0, nl + 1) + ind + '\t{gunner "gunner"}' + (text.includes('\r\n') ? '\r\n' : '\n') + text.slice(nl + 1)); } }
  { const m = /\{boarder\b/i.exec(text); if (m) add('board', 'the def\'s own {boarder} block (anm driver/left/right/armor*) dropped', cut(text, [blockAt(text, m.index)])); }
  { const r = [/\("shield"[^\n]*\n/gi, /\{component\s+"shield\w*"[^\n]*\n/gi].flatMap(re => [...text.matchAll(re)].map(m => [m.index, m.index + m[0].length]));
    const e = [...text.matchAll(/\{extender\s+"(shield|enumerator)"/gi)].map(m => blockAt(text, m.index));
    if (r.length || e.length) add('shield', 'shield macro, shield components, shield and enumerator extenders dropped', cut(text, r.concat(e))); }
  return V;
}
function writeVariants(o) {
  const defAbs = fwd(path.resolve(o.def)), md = fwd(path.resolve(o.moddir || '')).replace(/\/+$/, '');
  if (!o.moddir || !lc(defAbs).startsWith(lc(md) + '/')) { console.error('--variants needs --moddir holding the def'); process.exit(2); }
  const text = fs.readFileSync(defAbs).toString('latin1'), stem = path.basename(defAbs).replace(/\.def$/i, ''), only = o.variants === true ? null : String(o.variants).split(',');
  const out = [];
  for (const v of variants(text, { controlMdl: o.controlMdl })) {
    if (only && !only.includes(v.tag)) continue;
    const f = path.join(path.dirname(defAbs), `${stem}_${v.tag}.def`);
    fs.writeFileSync(f, Buffer.from(v.text, 'latin1'));
    out.push({ entity: `${stem}_${v.tag}`, file: fwd(f), change: v.why });
  }
  if (o.json) console.log(JSON.stringify(out, null, 1)); else for (const v of out) console.log(`VARIANT ${v.entity}  ${v.change}`);
  process.exit(0);
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.def) { console.error(USAGE); process.exit(2); }
  // --exe: the AS2 target game (lib/games: as64, mowas_2, mowas2); goh is the port's source, never the fit target: one plain line, exit 2
  if (o.exe) {
    const games = require('../lib/games'), g = games.get(o.exe);
    if (!g) { console.error('--exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); }
    if (g.id === 'goh') return games.refuse('donorfit', 'goh', 'the def is fitted to an AS2 target (AS64 or MoW:AS2); GoH is the source of the port, not its target', 'plan/reports/game-parity/t-port-a.md');
    o.exe = g.exe;
  }
  if (o.variants) return writeVariants(o);
  if (o.out && !o.write) { console.error('--out needs --write'); process.exit(2); }
  if (o.inPlace && !o.write) { console.error('--in-place needs --write'); process.exit(2); }
  if (o.inPlace && o.out) { console.error('--in-place and --out exclude each other'); process.exit(2); }
  if (!o.game) { try { o.game = gamedir.resolve({}).dir; } catch (e) { /* none */ } }
  let unfit = null;
  if (o.inPlace) {   // FXC-5 gap 3: the fit replaces <rep>.def, the old text stays as <rep>.def.unfit; only inside --moddir, so a read-only original is never written
    const defAbs = fwd(path.resolve(o.def));
    if (!o.moddir) { console.error('--in-place needs --moddir (the folder the def must sit in)'); process.exit(2); }
    const md = fwd(path.resolve(o.moddir)).replace(/\/+$/, '');
    if (!lc(defAbs).startsWith(lc(md) + '/')) { console.error(`--in-place refused: ${defAbs} is outside --moddir ${md}`); process.exit(2); }
    let st; try { st = fs.statSync(defAbs); } catch (e) { console.error('cannot read def: ' + e.message); process.exit(2); }
    if (st.nlink > 1) { console.error('--in-place refused: the def is hardlinked (' + st.nlink + ' links); writing it would change every link'); process.exit(2); }
    unfit = { file: defAbs + '.unfit', text: fs.readFileSync(defAbs) };
    // a backup left by an older run as <rep>.unfit.def loads as a second entity of the same name: rename it (to .def.unfit, or .unfit.def.old when that exists)
    const legacy = defAbs.replace(/\.def$/i, '') + '.unfit.def';
    if (fs.existsSync(legacy)) { const to = fs.existsSync(unfit.file) ? legacy + '.old' : unfit.file; fs.renameSync(legacy, to); unfit.legacy = path.basename(legacy) + ' -> ' + path.basename(to); }
    o.out = defAbs;
    o.defIn = defAbs;
  }
  if (o.write) {
    let keptNow = false;
    if (unfit && !fs.existsSync(unfit.file)) { fs.writeFileSync(unfit.file, unfit.text); keptNow = true; }   // before the def is replaced; a second run keeps the first original
    const w = fitWrite(o), res = w.res;
    if (unfit && unfit.legacy) w.applied.unshift('old backup renamed ' + unfit.legacy + ' (a .unfit.def loads as Entity redefinition)');
    if (unfit && w.written.includes(o.defIn)) w.applied.unshift(keptNow ? 'old def kept as ' + path.basename(unfit.file) : path.basename(unfit.file) + ' already exists: the first original is kept');
    if (o.json) { console.log(JSON.stringify({ result: res, applied: w.applied, unapplied: w.unapplied, out: w.out, written: w.written }, null, 1)); process.exit(!res || res.fatal ? 2 : res.misses.length ? 1 : 0); }
    const L = [];
    L.push(w.out ? `WROTE ${w.written.join(', ')}` : 'WROTE nothing (no edit applies, or the def already passes)');
    // FIX-PORT (port-donors:57): a copy is not what the game loads (mbR2A_t toldi2 ran its pre-fit def); say so on the copy route
    if (!unfit && w.out && fwd(path.resolve(w.out)) !== fwd(path.resolve(o.def))) L.push(`NOT LIVE ${fwd(path.resolve(o.def))} is unchanged and is what the game loads; the fit is only in ${path.posix.basename(w.out)}: use --in-place --moddir <mod> to swap it in`);
    for (const a of w.applied) L.push('  APPLIED ' + a);
    for (const u of w.unapplied) L.push('  UNAPPLIED ' + u);
    if (res && !res.fatal) L.push('RECHECK of ' + (w.out || res.def));
    console.log(L.join('\n') + '\n' + (res ? print(res, { fit: false }) : 'FATAL'));
    process.exit(!res || res.fatal ? 2 : res.misses.length ? 1 : 0);
  }
  const res = check(o);
  console.log(o.json ? JSON.stringify(o.exe ? { ...res, exe: o.exe } : res, null, 1) : print(res, o));
  process.exit(res.fatal ? 2 : res.misses.length ? 1 : 0);
}
if (require.main === module) main();
module.exports = { check, print, parseMdl, fitWrite, variants };
