#!/usr/bin/env node
// patch-entity: safe single-file SDL editor for a mod folder. rows VFS-01 VFS-41 KEY-01 SDL-01
//   node tools/patch-entity/patch-entity.js <mod folder> --game <G> [--mods deps] [--exe as64|mowas_2|mowas2|goh] (--entity <name> | --file <vfs path>)
//        (--set <path>=<value> | --add <path>=<value> | --append <path>=<value> | --del <path>)... [--dry-run] [--tmp dir] [-q]
// flow: effective file = mod's own copy, else vfs (vanilla + --mods deps) -> copy-as-override (bytes as-is) -> edits via
//   lib/sdlwrite splices (reparsed after each edit) -> sdllint + keylint on old/new text; REFUSE save if a new non-WARN_
//   finding appears -> write -> overdiff of the file. --dry-run: print changed lines only, write nothing.
// path syntax (own, small; clone-entity --set is a different thing: it appends a top-level override block):
//   a/b/c        block/list name path, case-insens., [n] = nth same-name sibling counted from 0 (layer[1] = the 2nd); sdlwrite.find semantics
//                the path starts at the file's root block name (material/layer[1]/color, not layer[1]/color) unless --add with no parent
//   a/b#N        N = item index inside the target block (default 1 = first value after the name; 0 = the name)
//   a/b#*        the whole value list of the line: --set 'from/tag#*="a" "b"' turns {tag "a" "b" "c"} into {tag "a" "b"} (child blocks stay).
//                Without #* one value replaces only item 1 (info PATCH_VALUE_FIRST_ONLY when the line has more)
//   --add under blocks the file lacks creates them ({from "x" {mass 2}} + from/special/PrepareTime=3 -> {special {PrepareTime 3}},
//                info PATCH_ADD_BLOCK); later adds in the run go into that block. Inherited lines are not copied in [T: merge vs replace]
//   --set  replaces item N text with <value> (raw SDL text, e.g. 55 or "x y"). missing path -> PATCH_KEY_MISSING
//   --add  like --set but a missing last segment is created as {name value} under its parent. Existing name: lines the format
//          holds several of (siblings keyed by a quoted first value, {item "x" 1}, or the name already repeats) get a new line
//          after the last one (same key -> that line is set; info PATCH_ADD_APPENDED); one unkeyed line is set in place (PATCH_ADD_SET)
//   --append  strict add: always a new line; refuses PATCH_APPEND_SINGLE where the file holds the name once without a key
//   --del  removes the node
//   --set-file p=<file> / --add-file p=<file>  same, value = the file's text (one trailing newline dropped). Use it for a value starting with "/"
//     ("/entity/x.mdl"): Git Bash (MSYS) rewrites an argument like k=/x/y into a Windows path before node sees it. Other fix: MSYS_NO_PATHCONV=1 [I].
// --exe as64|mowas_2|mowas2|goh: the game whose vfs view gives the effective file (lib/games); handed to the sdllint gate and the overdiff
//   run. MoW:AS2: no as64/core layer. none = the vfs default (as64 when as64.exe is in the folder, as before). --exe goh with no --game =
//   the GoH install (games.install). GoH: the mod folder must be outside the GoH install (lib/writeguard refusal: one plain line, exit 2; run() keeps PATCH_OUT_UNSAFE; a plain
//   line, unless --dry-run); GoH reads the override under the mod's resource/ (GHVFS-04 [V]); the sdllint/keylint gate on GoH data [I].
// --file: vfs key like resource/set/stuff/rifle/mp40 (case-insens., .def etc. as in the vfs). --entity: resource/entity/**/<name>.def
// codes: PATCH_BAD_ARGS PATCH_NO_FILE PATCH_AMBIGUOUS PATCH_KEY_MISSING PATCH_NOT_SDL PATCH_REFUSED(new lint error)
//   PATCH_KEY_MACRO (set/add on a key the file sets through a macro call ("speed" s(800)) -> gen macro op) PATCH_APPEND_SINGLE
//   PATCH_ADD_KEYLESS (add to keyed lines without a key) | info PATCH_ADD_APPENDED PATCH_ADD_SET PATCH_ADD_BLOCK PATCH_VALUE_FIRST_ONLY
//   WARN_PATCH_LINT_NEW (new WARN_ lint finding) | info PATCH_FULL_COPY (VFS-41) PATCH_COPIED PATCH_NO_CHANGE PATCH_OVERDIFF_SKIPPED
// --mode patch (partial .patch inside N.pat) is not implemented: KEY-01 says loose .patch is never read; authoring N.pat = packer.
// Author: Imperator_Aug (ARSENAL, ia-a397591c)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const vfs = require('../lib/vfs'), sdlwrite = require('../lib/sdlwrite');
const { encodeText } = require('../lib/enc');
const { createReport } = require('../lib/report');
const games = require('../lib/games');

function usage(m) {
  console.error((m ? m + '\n' : '') + 'usage: node tools/patch-entity/patch-entity.js <mod folder> --game <G> [--mods a,b] [--exe as64|mowas_2|goh] (--entity <name> | --file <vfs path>) (--set p=v | --add p=v | --append p=v | --set-file p=file | --add-file p=file | --del p)... [--dry-run] [-q]');
  process.exit(2);
}

function parseArgs(args) {
  const o = { edits: [] }, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i], nx = () => { if (i + 1 >= args.length) usage(a + ' needs a value'); return args[++i]; };
    if (a === '--game') o.gameDir = nx(); else if (a === '--mods') o.mods = nx().split(',').filter(Boolean);
    else if (a === '--entity') o.entity = nx(); else if (a === '--file') o.file = nx();
    else if (a === '--exe') { const x = nx(); if (!games.get(x)) usage('--exe must be one of as64|mowas_2|mowas2|goh'); o.exe = games.exeOf(x); }
    else if (a === '--set' || a === '--add' || a === '--append') {
      const s = nx(), k = s.indexOf('=');
      if (k < 1) usage(a + ' "' + s + '": expected path=value');
      o.edits.push({ op: a.slice(2), path: s.slice(0, k), value: s.slice(k + 1) });
    } else if (a === '--set-file' || a === '--add-file' || a === '--append-file') {
      // value read from a file: no shell quoting, and Git Bash cannot rewrite a leading "/" (MSYS turns --set k="/x/y.mdl" into a Windows path)
      const s = nx(), k = s.indexOf('=');
      if (k < 1) usage(a + ' "' + s + '": expected path=<file holding the value>');
      let v; try { v = fs.readFileSync(s.slice(k + 1), 'utf8'); } catch (e) { usage(a + ': cannot read ' + s.slice(k + 1)); }
      o.edits.push({ op: a.slice(2, a.indexOf('-', 2)), path: s.slice(0, k), value: v.replace(/^﻿/, '').replace(/\r?\n$/, '') });
    } else if (a === '--del') o.edits.push({ op: 'del', path: nx() });
    else if (a === '--dry-run') o.dry = true; else if (a === '-q') o.q = true; else if (a === '--tmp') o.tmp = nx();
    else if (a === '--mode') usage('--mode patch not implemented (KEY-01: only .patch inside N.pat is read; use tools/packer)');
    else pos.push(a);
  }
  o.folder = pos[0];
  return o;
}

// #* (GEN-FIX4): the whole value list of the line -> all = true; idx 1, explicit (no add-a-sibling-line branch)
const sp = p => { const m = /^(.*?)(?:#(\d+|\*))?$/.exec(p); return { path: m[1].replace(/^\/+|\/+$/g, ''), idx: m[2] === undefined || m[2] === '*' ? 1 : +m[2], explicit: m[2] !== undefined, all: m[2] === '*' }; };
// path segments: '/' splits outside double quotes, so a quoted block name ({teams {"a" ..}}, {"s:standard_100_all" ..}, {"mp/rus/rifle" ..})
// is one segment, written "a" or "mp/rus/rifle"[1]; look() = the names sdlwrite matches (quotes off, lower case, [n] kept)
const segsOf = p => String(p).match(/(?:"[^"]*"|[^\/"])+/g) || [];
const look = p => (Array.isArray(p) ? p : segsOf(p)).map(s => s.replace(/^"([^"]*)"/, '$1'));
const val = v => encodeText(v);   // ENCFIX: string values UTF-8 (as64 unicode utils
const asBuf = x => Buffer.isBuffer(x) ? x : Buffer.from(x, 'latin1');

// sibling key: first value after the name when it is a quoted string ({item "ppsh41" 1} -> ppsh41), else null
const keyOf = n => { const v = n && n.type === 'block' && n.items && n.items[1]; return v && v.type === 'string' ? v.text.slice(1, -1).toLowerCase() : null; };
const keyOfValue = v => { const m = /^\s*"([^"]*)"/.exec(String(v)); return m ? m[1].toLowerCase() : null; };
// a macro call ("speed" s(800)): a (..) list headed by a quoted name; set/add would splice the value into the call's own items
const isMacroCall = n => n && n.type === 'list' && n.items && n.items[0] && n.items[0].type === 'string';

// apply one edit to a Buffer -> { buf, note?:[code,msg] } | { err:[code,msg] }
// add on a name the file already has (no [n], no #N): the format allows several when the siblings are keyed by a quoted first
// value ({item "x" 1}) or the name already repeats under that parent -> a new sibling line after the last one (same key ->
// that sibling is set). One unkeyed sibling ({cost 400}) -> set in place as before (note PATCH_ADD_SET); --append refuses it.
function applyEdit(buf, e) {
  const t = sdlwrite.parse(buf), { path: p, idx, explicit, all } = sp(e.path);
  if (all && e.op === 'del') return { err: ['PATCH_BAD_ARGS', `--del ${e.path}: #* sets a value list; --del removes the whole line, give the path without #*`] };
  if (!p) return { err: ['PATCH_BAD_ARGS', `empty path in "${e.path}"`] };
  const hits = sdlwrite.findAll(t, look(p));
  const mac = e.op !== 'del' && hits.find(isMacroCall);
  if (mac) return { err: ['PATCH_KEY_MACRO', `--${e.op} ${e.path}: the file sets it through a macro call ${t.src.slice(mac.start, mac.end).replace(/\s+/g, ' ').slice(0, 80)}; a plain edit would break the call. Change the macro's argument with the gen macro op (op: macro), or --del the call and --add a plain {${segsOf(p).pop()} value}`] };
  const lastSeg = segsOf(p).pop();
  if ((e.op === 'add' || e.op === 'append') && hits.length && !explicit && !/\[\d+\]$/.test(lastSeg) && hits.every(h => h.parent === hits[0].parent)) {   // several parents: PATCH_AMBIGUOUS below
    const par = hits[0].parent;
    const nk = keyOfValue(e.value), keyed = hits.some(h => keyOf(h) !== null), same = nk === null ? [] : hits.filter(h => keyOf(h) === nk);
    const many = keyed || hits.length > 1;
    if (e.op === 'add' && same.length > 1) return { err: ['PATCH_AMBIGUOUS', `--add ${e.path}: ${same.length} lines already have the key "${nk}"; pick one with ${lastSeg}[n] or --append`] };
    if (keyed && nk === null) return { err: ['PATCH_ADD_KEYLESS', `--${e.op} ${e.path}: the ${lastSeg} lines are keyed by a quoted first value (${hits.map(h => '"' + keyOf(h) + '"').filter(x => x !== '"null"').slice(0, 4).join(' ')}); give one, e.g. "name" 1, or --set ${lastSeg}[n]`] };
    if (e.op === 'append' && !many) return { err: ['PATCH_APPEND_SINGLE', `--append ${e.path}: the file holds ${lastSeg} once and without a key ({${lastSeg} ..}); a second line is not a list the engine reads (the later line wins or is ignored) [I]; use --set to change it`] };
    if (e.op === 'add' && same.length === 1) return { buf: (sdlwrite.setValue(same[0], val(e.value), 1), dropRun(same[0], e.value, false), sdlwrite.serialize(t)) };
    if (many) {
      const last = hits[hits.length - 1], at = par.items.indexOf(last) + 1, nm = (last.items[0] && last.items[0].text) || lastSeg;
      sdlwrite.insertChild(par, at, Buffer.concat([Buffer.from('{' + nm + ' ', 'latin1'), val(e.value), Buffer.from('}', 'latin1')]));
      return { buf: sdlwrite.serialize(t), note: ['PATCH_ADD_APPENDED', `--${e.op} ${e.path}: new ${lastSeg} line after the ${hits.length} already there`] };
    }
    // one unkeyed sibling, op add: set in place (gen mapinfo/balance/range rows rely on add = upsert)
    sdlwrite.setValue(hits[0], val(e.value), idx); dropRun(hits[0], e.value, explicit);
    return { buf: sdlwrite.serialize(t), note: ['PATCH_ADD_SET', `--add ${e.path}: the file has it once without a key; value set in place (--append refuses this)`] };
  }
  if (hits.length > 1) {   // hint indexes the first segment that repeats (an indexed segment counts as unique)
    const sg = segsOf(p); let i = 0;
    while (i < sg.length - 1 && (/\[\d+\]$/.test(sg[i]) || sdlwrite.findAll(t, look(sg.slice(0, i + 1))).length < 2)) i++;
    const eg = sg.map((s, j) => j === i ? s + '[0]' : s).join('/');
    return { err: ['PATCH_AMBIGUOUS', `${e.op} ${e.path}: matches ${hits.length} blocks; "${sg[i]}" repeats; pick one with name[n] (0-based), e.g. ${eg}`] };
  }
  let node = hits[0] || null, note = null;
  // COV-MIX6B: a path missing the file's root block (tags/ in .lng, material/ in .mtl) gets a "did you mean"
  const dym = () => { if (node) return ''; for (const r of (t.root.items || [])) { const n = r.name && r.name.replace(/^"|"$/g, ''); if ((r.type === 'block' || r.type === 'list') && n && sdlwrite.findAll(t, [n.toLowerCase()].concat(look(p))).length) return `; did you mean ${n}/${e.path}?`; } return ''; };
  if (!node && e.op !== 'add' && e.op !== 'append') { const h = dym(); if (h) return { err: ['PATCH_KEY_MISSING', `--${e.op} ${e.path}: no such block${h}`] }; }
  if (e.op === 'del') {
    if (!node) return { err: ['PATCH_KEY_MISSING', `--del ${e.path}: no such block`] };
    sdlwrite.removeNode(node);
  } else if (node && all) {
    setAll(node, e.value);
  } else if (node) {
    const plain = runOf(node).length, many = (String(e.value).match(/"[^"]*"|\S+/g) || []).length > 1;
    sdlwrite.setValue(node, val(e.value), idx);
    dropRun(node, e.value, explicit);
    if (!explicit && !many && plain > 1) note = ['PATCH_VALUE_FIRST_ONLY', `--${e.op} ${e.path}: the line has ${plain} values; only the first was replaced. To set the whole list write ${p}#* (e.g. --${e.op} '${p}#*=${'"a" "b"'}')`];
  } else if (e.op === 'add' || e.op === 'append') {
    const segs = segsOf(p), last = segs.pop();
    let parent, make = [];
    if (segs.length) {
      // GEN-FIX4: missing blocks on the way are created ({from "x" {mass 2}} + from/special/PrepareTime 3 -> {special {PrepareTime 3}});
      // the deepest block that exists is the parent. Later adds in the same run find the new block (edits re-parse each step).
      let k = segs.length;
      while (k > 0 && !(parent = sdlwrite.findAll(t, look(segs.slice(0, k)))[0] || null)) k--;
      if (parent && k < segs.length) {
        if (sdlwrite.findAll(t, look(segs.slice(0, k))).length > 1) return { err: ['PATCH_AMBIGUOUS', `--add ${e.path}: ${segs.slice(0, k).join('/')} matches several blocks; pick one with name[n]`] };
        make = segs.slice(k);
        if (make.some(s => /\[\d+\]$/.test(s))) return { err: ['PATCH_BAD_ARGS', `--add ${e.path}: cannot create an indexed block (${make.join('/')})`] };
      }
    } else {   // no parent path: a 2nd top-level block is rejected by the game ("End of SDL file expected"); use the single root block
      const roots = t.root.items.filter(k => k.type === 'block' || k.type === 'list');
      if (roots.length > 1) return { err: ['PATCH_BAD_ARGS', `--add ${e.path}: file has ${roots.length} top-level blocks; give the parent path (e.g. ${roots[0].name}/${last})`] };
      parent = roots[0] || t.root;
    }
    if (!parent) return { err: ['PATCH_KEY_MISSING', `--add ${e.path}: parent ${segs.join('/')} not found${dym()}`] };
    if (/\[\d+\]$/.test(last)) return { err: ['PATCH_BAD_ARGS', `--add ${e.path}: cannot create an indexed name`] };
    const open = make.map(s => '{' + s + ' ').join(''), close = '}'.repeat(make.length);
    sdlwrite.insertChild(parent, parent.items.length, Buffer.concat([Buffer.from(open + '{' + last + ' ', 'latin1'), val(e.value), Buffer.from('}' + close, 'latin1')]));
    if (make.length) note = ['PATCH_ADD_BLOCK', `--add ${e.path}: the file had no ${make.join('/')} block; created it with only this line. Lines the file gets from its source ({from ..}) are not copied and not changed; whether the game merges the new block with the inherited one or replaces it is untested [T]`];
  } else return { err: ['PATCH_KEY_MISSING', `--set ${e.path}: no such block (use --add to create it)`] };
  return note ? { buf: sdlwrite.serialize(t), note } : { buf: sdlwrite.serialize(t) };
}
// the plain values after the name, up to the first child block/list
function runOf(node) {
  const out = [];
  for (let i = 1; node.items && i < node.items.length && node.items[i].type !== 'block' && node.items[i].type !== 'list'; i++) out.push(node.items[i]);
  return out;
}
// #*: the value text replaces every plain value of the line ({tag "a" "b" "c"} + #*="a" "b" -> {tag "a" "b"}); child blocks stay
function setAll(node, value) {
  const run = runOf(node);
  sdlwrite.setValue(node, val(value), 1);   // no plain value yet: inserted before the first child block (or appended)
  for (const n of run.slice(1)) sdlwrite.removeNode(n);
}
// no #N and several values: the new values replace the whole run of plain values, so {damage 70 0.75} stays 2 values (COV-SHAPE SHAPE_ARITY)
function dropRun(node, value, explicit) {
  if (!explicit && node.items && (String(value).match(/"[^"]*"|\S+/g) || []).length > 1)
    for (let i = 2; i < node.items.length && node.items[i].type !== 'block' && node.items[i].type !== 'list'; i++) sdlwrite.removeNode(node.items[i]);
}

function capture(fn) {   // run a lint whose rep.print writes to console.log; return its finding lines
  const lines = [], orig = console.log;
  console.log = s => lines.push(String(s));
  try { fn(); } finally { console.log = orig; }
  return lines.filter(l => !/^info: /.test(l) && !/ findings$/.test(l) && !/^by code:/.test(l) && !/files .*ms$/.test(l));
}

// lint the single file placed in a temp folder; returns Map "CODE msg" -> count (lines dropped: they shift)
function lintText(buf, key, o, tmp) {   // tmp null: a fresh dir per call (parallel runs raced on one shared tools/patch-entity/tmp, COV-MIX2)
  tmp = tmp || fs.mkdtempSync(path.join(require('os').tmpdir(), 'patch-entity-'));
  fs.rmSync(tmp, { recursive: true, force: true });
  const f = path.join(tmp, key);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buf);
  const out = new Map();
  const add = l => { const m = /^[^:]*?(?::\d+)?: ([A-Z_0-9]+) (.*)$/.exec(l); if (m) { const k = m[1] + ' ' + m[2]; out.set(k, (out.get(k) || 0) + 1); } };
  const opts = Object.assign({ folder: tmp, gameDir: o.gameDir, mods: o.mods }, o.exe ? { exe: o.exe } : {});
  capture(() => { const r = require('../sdllint/sdllint').lint(opts); r.rep.print({ showInfo: false }); }).forEach(add);
  capture(() => { const r = require('../keylint/keylint').check(opts); r.rep.print({ showInfo: false }); }).forEach(add);
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}

function lineDiff(a, b) {
  const A = a.split(/\r?\n/), B = b.split(/\r?\n/);
  let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length, eb = B.length; while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  const out = [];
  for (let i = s; i < ea; i++) out.push(`-${i + 1}: ${A[i]}`);
  for (let i = s; i < eb; i++) out.push(`+${i + 1}: ${B[i]}`);
  return out;
}

function run(o) {
  const rep = createReport();
  const bad = (code, msg) => { rep.add('-', 0, code, msg); return { rep, code }; };
  if (o.exe && !games.get(o.exe)) return bad('PATCH_BAD_ARGS', '--exe must be one of as64|mowas_2|mowas2|goh');
  if (o.exe) o.exe = games.exeOf(o.exe);
  if (!o.gameDir && o.exe === 'goh') o.gameDir = games.install('goh').dir;
  if (!o.folder || !o.gameDir || !o.edits.length || !!o.entity === !!o.file) return bad('PATCH_BAD_ARGS', 'need <mod folder> --game G, exactly one of --entity/--file, and at least one --set/--add/--del');
  const modDir = path.resolve(o.folder);
  const v = vfs.build(Object.assign({ gameDir: o.gameDir, mods: o.mods }, o.exe ? { exe: o.exe } : {}));
  // GoH: ARSENAL does not write into the GoH install (lib/writeguard); the mod folder goes outside it
  if (v.exe === 'goh' && !o.dry) { const why = require('../lib/writeguard').refuseWrite(modDir, { game: o.gameDir, purpose: 'patch-entity' }); if (why) { vfs.closeRecs(); return Object.assign(bad('PATCH_OUT_UNSAFE', why), { guardLine: why }); } }
  try {
    // resolve key
    let key;
    if (o.file) {
      key = o.file.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
      if (!key.startsWith('resource/')) key = 'resource/' + key;
    } else {
      const n = o.entity.toLowerCase(), c = [...v.files.keys()].filter(k => k.startsWith('resource/entity/') && k.endsWith('/' + n + '.def'));
      const ownDefs = [];
      (function walk(d, rel) { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f), r = rel + '/' + f.toLowerCase(); if (fs.statSync(p).isDirectory()) walk(p, r); else if (r.endsWith('/' + n + '.def')) ownDefs.push(r); } })(path.join(modDir, 'resource', 'entity'), 'resource/entity');
      const all = [...new Set(c.concat(ownDefs))];
      if (!all.length) return bad('PATCH_NO_FILE', `entity "${o.entity}" not found under resource/entity (vfs or mod)`);
      if (all.length > 1) return bad('PATCH_AMBIGUOUS', `entity "${o.entity}" matches ${all.length} defs: ${all.join(' | ')}; use --file`);
      key = all[0];
    }
    // effective source: mod's own copy (case-insensitive walk) else vfs
    let own = null;
    (function walk(d, rel) { if (own || !fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f), r = rel ? rel + '/' + f.toLowerCase() : f.toLowerCase(); if (fs.statSync(p).isDirectory()) walk(p, r); else if (r === key) own = p; } })(modDir, '');
    let buf, dest;
    if (own) { buf = fs.readFileSync(own); dest = own; }
    else {
      const rec = v.files.get(key);
      if (!rec) return bad('PATCH_NO_FILE', `${key} not found in mod ${modDir} or vfs (vanilla${o.mods ? ' + ' + o.mods.join(',') : ''})`);
      buf = vfs.readRec(rec); dest = path.join(modDir, key);
      rep.info(key, 0, 'PATCH_COPIED', `mod has no copy: override created from ${rec.layer} (bytes as-is)`);
      rep.info(key, 0, 'PATCH_FULL_COPY', 'whole file now shadows the source (VFS-01/41): later vanilla/dep updates to this file will not flow into the mod');
    }
    const orig = buf;
    let cur = buf;
    try {
      for (const e of o.edits) { const r = applyEdit(cur, e); if (r.err) return bad(r.err[0], r.err[1]); if (r.note) rep.info(key, 0, r.note[0], r.note[1]); cur = r.buf; }
    } catch (ex) { return bad('PATCH_NOT_SDL', `${key}: ${ex.message}`); }
    if (Buffer.compare(cur, orig) === 0) { rep.info(key, 0, 'PATCH_NO_CHANGE', 'edits produced identical bytes'); if (!o.dry && !own) { /* still no write: nothing to change */ } return { rep, changed: false, key }; }
    // validate: new non-WARN findings vs the original text
    const tmp = o.tmp ? path.resolve(o.tmp) : null;
    const before = lintText(orig, key, o, tmp), after = lintText(cur, key, o, tmp);
    const fresh = [];
    for (const [k, n] of after) if (n > (before.get(k) || 0)) fresh.push(k);
    const errs = fresh.filter(k => !/^WARN_/.test(k));
    for (const k of fresh.filter(k => /^WARN_/.test(k))) rep.add(key, 0, 'WARN_PATCH_LINT_NEW', 'edit introduces ' + k);
    if (errs.length) { for (const k of errs) rep.add(key, 0, 'PATCH_REFUSED', 'edit introduces ' + k + '; file not written'); return { rep, changed: false, refused: true, key }; }
    const diff = lineDiff(orig.toString('latin1'), cur.toString('latin1'));
    if (!o.q || o.dry) for (const d of diff) console.log(d);
    if (o.dry) { rep.info(key, 0, 'PATCH_DRY_RUN', 'nothing written'); return { rep, changed: true, diff, key }; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, cur);
    rep.info(key, 0, 'PATCH_WROTE', path.relative(process.cwd(), dest));
    // overdiff (needs the mod under <game>/mods; otherwise skipped)
    const args = [path.join(__dirname, '..', 'overdiff', 'overdiff.js'), modDir, '--game', o.gameDir].concat(o.mods ? ['--mods', o.mods.join(',')] : [], o.exe ? ['--exe', o.exe] : []);
    const r = cp.spawnSync(process.execPath, args, { encoding: 'utf8' });
    if (r.status === 0) {
      const mine = r.stdout.split(/\r?\n/).filter(l => l.toLowerCase().includes(key.toLowerCase()));
      if (!o.q) mine.forEach(l => console.log('overdiff> ' + l));
    } else rep.info(key, 0, 'PATCH_OVERDIFF_SKIPPED', ((r.stderr || r.stdout || '').trim().split(/\r?\n/)[0] || 'overdiff failed'));
    return { rep, changed: true, diff, key };
  } finally { vfs.closeRecs(); }
}

if (require.main === module) {
  const o = parseArgs(process.argv.slice(2));
  if (!o.gameDir && o.exe === 'goh') o.gameDir = games.install('goh').dir;
  if (!o.folder || !o.gameDir) usage();
  let r;
  try { r = run(o); } catch (e) { console.error(e.message); process.exit(2); }
  if (r.guardLine) { console.error(r.guardLine); process.exit(2); }   // GoH writeguard: one plain line, exit 2
  r.rep.print({ showInfo: !o.q });
  process.exit(r.rep.count ? 1 : 0);
}
module.exports = { run, applyEdit, lineDiff };
