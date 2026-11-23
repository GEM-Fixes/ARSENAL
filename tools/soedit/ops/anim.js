#!/usr/bin/env node
// soedit/ops/anim: command line for SOEdit's animation operations (tools/soedit/ops/animops.js) without a window.
//   node tools/soedit/soedit.js ops anim <operation> <file.anm> [options]     (main(argv), argv[0] 'anim' optional)
//   node tools/soedit/ops/anim.js <operation> <file.anm> [options]
// Operations: info reverse fill insert-frame delete-frames duplicate move copy-forward drop-first-frame clone-bone
//   export-bone import-bone rename-bone reset-bone add-bone remove-bone set-visibility new
// Options: --out <file> (default in place) --bone <name|index> --from N --to N --at N --count N --name <new>
//   --track <file.json> --matrix "12 numbers" --visible 0|1 --bones a,b,c --version 0x60000 --force (new over a file)
//   --json (one JSON object: { ok, operation, file, out, frames, bones, version, changed, error, ... }) --dry (no write)
// Frames are 0-based. Writing: tools/lib/writeguard.js refuseWrite (never into a game install outside mods/<name>),
//   one <file>.bak the first time a file is changed (an existing .bak is kept), temp file then rename.
//   The version of the file is kept (lib/model/anm.js write). info and --dry write nothing.
// Exit: 0 done, 1 refused or bad input, 2 usage.
// Author: Imperator_Aug (ARSENAL, ia-06f6eb26)
'use strict';
const fs = require('fs'), path = require('path');
const anm = require('../../lib/model/anm'), ops = require('./animops'), wg = require('../../lib/writeguard');

const VALUE = new Set(['--out', '--bone', '--from', '--to', '--at', '--count', '--name', '--track', '--matrix', '--visible', '--bones', '--version']);
const FLAG = new Set(['--json', '--dry', '--force', '--help', '-h']);

const OPS = {
  'info': { run: o => ops.info(o), writes: false },
  'reverse': { run: (o, a) => ops.reverse(o, { from: a.from, to: a.to }) },
  'fill': { run: (o, a) => ops.fill(o, { bone: a.bone, from: a.from, to: a.to }) },
  'insert-frame': { run: (o, a) => ops.insertFrame(o, { at: a.at, count: a.count }) },
  'delete-frames': { run: (o, a) => ops.deleteFrames(o, { from: a.from !== undefined ? a.from : a.at, to: a.to }) },
  'duplicate': { run: (o, a) => ops.duplicateRange(o, { from: a.from, to: a.to }) },
  'move': { run: (o, a) => ops.moveRange(o, { from: a.from, to: a.to, at: a.at }) },
  'copy-forward': { run: (o, a) => ops.copyForward(o, { bone: a.bone, at: a.at, count: a.count }) },
  'drop-first-frame': { run: o => ops.dropFirstFrame(o) },
  'clone-bone': { run: (o, a) => ops.cloneBone(o, { bone: a.bone, name: a.name }) },
  'export-bone': { run: (o, a) => ops.exportBone(o, { bone: a.bone }), writes: 'track' },
  'import-bone': { run: (o, a) => ops.importBone(o, a.trackData, { name: a.name }) },
  'rename-bone': { run: (o, a) => ops.renameBone(o, { bone: a.bone, name: a.name }) },
  'reset-bone': { run: (o, a) => ops.resetBone(o, { bone: a.bone, matrix: a.matrix, from: a.from, to: a.to }) },
  'add-bone': { run: (o, a) => ops.addBone(o, { name: a.name, matrix: a.matrix }) },
  'remove-bone': { run: (o, a) => ops.removeBone(o, { bone: a.bone }) },
  'set-visibility': { run: (o, a) => ops.setVisibility(o, { bone: a.bone, from: a.from, to: a.to, visible: a.visible }) },
  'new': { run: (o, a) => ops.newAnimation(a.bones, a.count === undefined ? 1 : a.count, a.matrix ? a.bones.map(() => a.matrix) : null, a.version), create: true },
};
const ALIAS = { insert: 'insert-frame', delete: 'delete-frames', deleteframe: 'delete-frames', duplicaterange: 'duplicate', moverange: 'move',
  dropfirst: 'drop-first-frame', clone: 'clone-bone', export: 'export-bone', import: 'import-bone', rename: 'rename-bone', reset: 'reset-bone',
  newanimation: 'new', create: 'new', visibility: 'set-visibility' };
const norm = s => String(s || '').toLowerCase().replace(/[-_]/g, '');
function opName(s) {
  const n = norm(s);
  for (const k of Object.keys(OPS)) if (norm(k) === n) return k;
  return ALIAS[n] || null;
}

const USAGE = `usage: node tools/soedit/soedit.js ops anim <operation> <file.anm> [options]
operations: ${Object.keys(OPS).join(' ')}
options: --out F --bone B --from N --to N --at N --count N --name S --track F.json --matrix "12 numbers" --visible 0|1
         --bones a,b,c --version 0x60000 --force --json --dry      (frames 0-based)`;

function parseArgs(argv) {
  const a = { pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (VALUE.has(x)) { if (i + 1 >= argv.length) return { usage: `${x} needs a value` }; a[x.slice(2)] = argv[++i]; }
    else if (FLAG.has(x)) a[x.replace(/^-+/, '')] = true;
    else if (/^--?\w/.test(x)) return { usage: `unknown option ${x}` };
    else a.pos.push(x);
  }
  return a;
}

const exists = p => { try { fs.statSync(p); return true; } catch (e) { return false; } };
// guarded write: refuse, keep one .bak, temp then rename. -> { error } | { written, bak }
function writeSafe(dest, buf, purpose) {
  const why = wg.refuseWrite(dest, { purpose });
  if (why) return { error: `refused: ${why}` };
  try {
    if (exists(dest) && fs.readFileSync(dest).equals(buf)) return { written: false, bak: null };
    let bak = null;
    if (exists(dest) && !exists(dest + '.bak')) { const w = wg.refuseWrite(dest + '.bak', { purpose }); if (w) return { error: `refused: ${w}` }; fs.copyFileSync(dest, dest + '.bak'); bak = dest + '.bak'; }
    fs.mkdirSync(path.dirname(path.resolve(dest)), { recursive: true });
    const tmp = `${dest}.tmp${process.pid}`;
    fs.writeFileSync(tmp, buf);
    try { fs.renameSync(tmp, dest); } catch (e) { try { fs.unlinkSync(tmp); } catch (e2) { /* gone */ } throw e; }
    return { written: true, bak };
  } catch (e) { return { error: `write failed: ${e.message}` }; }
}

function main(argv) {
  argv = Array.from(argv || []);
  if (argv[0] === 'anim') argv.shift();
  const a = parseArgs(argv);
  const say = (res, code) => {
    if (a.json) console.log(JSON.stringify(res, null, 1));
    else if (res.error) console.log(`soedit ops anim ${res.operation || ''}: ${res.error}`);
    return code;
  };
  if (a.usage) { if (a.json) return say({ ok: false, error: a.usage }, 2); console.log(`${a.usage}\n${USAGE}`); return 2; }
  if (a.help || a.h || !a.pos.length) { console.log(USAGE); return 2; }
  const op = opName(a.pos[0]);
  if (!op) { if (a.json) return say({ ok: false, operation: a.pos[0], error: 'unknown operation' }, 2); console.log(`unknown operation ${a.pos[0]}\n${USAGE}`); return 2; }
  const file = a.pos[1];
  const res = { ok: false, operation: op, file: file ? path.resolve(file) : null, out: null, frames: null, bones: null, version: null, changed: [], error: null };
  if (!file) { res.error = 'no .anm file given'; if (!a.json) console.log(USAGE); return say(res, 2); }
  if (a.pos.length > 2) { res.error = 'unexpected argument ' + a.pos[2]; return say(res, 2); }
  if (a.visible !== undefined) {
    const v = String(a.visible).toLowerCase();
    if (['1', 'true', 'on', 'show', 'yes'].includes(v)) a.visible = true; else if (['0', 'false', 'off', 'hide', 'no'].includes(v)) a.visible = false;
    else { res.error = '--visible takes 0 or 1'; return say(res, 2); }
  }
  if (a.version !== undefined) { const v = Number(a.version); if (!Number.isInteger(v)) { res.error = 'bad --version ' + a.version; return say(res, 2); } a.version = v; }
  if (a.bones !== undefined) a.bones = a.bones.split(',').map(s => s.trim()).filter(Boolean);
  const spec = OPS[op];
  const dest = path.resolve(a.out || file);

  let src = null, before = null;
  if (spec.create) {
    if (!a.bones || !a.bones.length) { res.error = 'new needs --bones a,b,c'; return say(res, 2); }
    if (exists(dest) && !a.force) { res.error = `${dest} exists (use --force to replace it)`; return say(res, 1); }
    if (a.version === undefined) a.version = 0x60000;
  } else {
    let buf;
    try { buf = fs.readFileSync(file); } catch (e) { res.error = `cannot read ${file}: ${e.message}`; return say(res, 1); }
    src = buf; before = anm.parse(buf);
    if (before.error && op !== 'info') { res.error = `unreadable animation: ${before.error}`; return say(res, 1); }
  }
  if (op === 'import-bone') {
    if (!a.track) { res.error = 'import-bone needs --track <file.json>'; return say(res, 2); }
    try { a.trackData = JSON.parse(fs.readFileSync(a.track, 'utf8')); } catch (e) { res.error = `cannot read track ${a.track}: ${e.message}`; return say(res, 1); }
  }

  const r = spec.run(before, a);
  if (ops.isError(r)) { res.error = r.error; return say(res, 1); }

  if (op === 'info') {
    Object.assign(res, { ok: true, frames: r.frames, bones: r.bones, version: r.version, info: r });
    if (!a.json) {
      console.log(`${file}: version ${r.versionHex}, ${r.frames} frames, ${r.bones.length} bones, ${r.keyFrames} key frames ${JSON.stringify(r.chunkKinds)}`);
      for (const k of r.keyed) console.log(`  ${k.bone}: ${k.keys} keys`);
      for (const v of r.visibility) console.log(`  visibility ${v.bone} frame ${v.frame}: ${v.visible ? 'show' : 'hide'}`);
      for (const p of r.problems) console.log(`  problem: ${p}`);
      if (r.readError) console.log(`  unreadable tail: ${r.readError}`);
    }
    return say(res, 0);
  }

  if (spec.writes === 'track') {
    const target = a.track || a.out;
    Object.assign(res, { ok: true, frames: r.frames, bones: [r.bone], version: before.version, out: target ? path.resolve(target) : null, changed: [] });
    if (!target) { if (a.json) res.track = r; else console.log(JSON.stringify(r)); return say(res, 0); }
    if (!a.dry) { const w = writeSafe(path.resolve(target), Buffer.from(JSON.stringify(r, null, 1) + '\r\n'), 'export an animation bone track'); if (w.error) { res.ok = false; res.error = w.error; return say(res, 1); } res.written = w.written; }
    if (!a.json) console.log(`exported ${r.bone} (${r.frames} frames) -> ${target}${a.dry ? ' (dry run)' : ''}`);
    return say(res, 0);
  }

  let out;
  try { out = anm.write(r); } catch (e) { res.error = `cannot write: ${e.message}`; return say(res, 1); }
  const check = anm.parse(out);
  if (check.error) { res.error = `result does not read back: ${check.error}`; return say(res, 1); }
  if (before && check.version !== before.version) { res.error = 'internal: version changed'; return say(res, 1); }
  const changed = before ? ops.changes(before, check) : ['new animation'];
  Object.assign(res, { out: dest, frames: check.frames, bones: check.bones, version: check.version, changed: ops.isError(changed) ? [] : changed });
  if (a.dry) { res.ok = true; res.dry = true; res.written = false; }
  else if (src && dest === path.resolve(file) && src.equals(out)) { res.ok = true; res.written = false; }
  else {
    const w = writeSafe(dest, out, 'write an animation');
    if (w.error) { res.error = w.error; return say(res, 1); }
    res.ok = true; res.written = w.written; res.bak = w.bak;
  }
  if (!a.json) {
    console.log(`anim ${op}: ${dest}${a.dry ? ' (dry run, nothing written)' : res.written ? '' : ' (unchanged)'}: ${check.frames} frames, ${check.bones.length} bones, version 0x${check.version.toString(16)}`);
    if (res.changed.length) console.log('  changed: ' + res.changed.join('; '));
    if (res.bak) console.log('  backup: ' + res.bak);
  }
  return say(res, 0);
}

module.exports = { main, OPS, opName, writeSafe };
if (require.main === module) {
  let code;
  try { code = main(process.argv.slice(2)); } catch (e) { console.error(`soedit ops anim: ${e.stack || e.message}`); code = 1; }
  process.exitCode = code;
}
