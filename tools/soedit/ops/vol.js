#!/usr/bin/env node
// soedit/ops/vol: SOEdit's volume "Fit to bone" and "Round" without a window (NOTES.md 17; logic in plyops.js).
//   node tools/soedit/soedit.js ops vol fit <model.mdl> --volume <bone path>/<name> [--kind box|cylinder|sphere] [--axis z] [--apply]
//     fits the volume to the vertices of its bone's mesh, axis-aligned in bone space: size (box: full x y z; cylinder:
//     radius + length along --axis, default the local Z; sphere: radius) and the volume matrix moved to the mesh centre.
//     SOEdit only copies the PLY bbox size and keeps the old matrix (and always shows an error first).
//   node tools/soedit/soedit.js ops vol round <model.mdl> --step 0.5 [--volume id] [--apply]
//     sizes, radius, length and position snap to the step; orientation cells snap to -1/0/1 only when the rotation is
//     already near-axis (SOEdit rounds every cell to a whole number, which breaks a 45 degree rotation).
// Without --apply the change is printed only. --json, --dry, --game as ply.js. Exit 0 done, 1 refused or bad input, 2 usage.
// Polyhedron volumes are skipped (their shape is the .vol file).
// Author: Imperator_Aug (ARSENAL, ia-bdeb0762)
'use strict';
const M = require('../../lib/model/mdl');
const O = require('./plyops');
const { save, parseArgs, readPly, readMdl, boneMesh, Usage } = require('./ply');

const short = c => { const o = { ...c }; delete o.op; delete o.volume; return JSON.stringify(o); };

function run(op, o, res) {
  const mdlFile = o.pos[0];
  if (!mdlFile) throw new Usage(`${op} needs a .mdl file`);
  const model = readMdl(mdlFile);
  res.file = mdlFile;
  const changes = [];
  if (op === 'fit') {
    if (!o.volume) throw new Usage('fit needs --volume <bone path>/<name>');
    const v = M.findVolume(model, o.volume);
    if (!v) throw new O.OpError(`no volume ${o.volume} (have: ${model.volumes.map(x => x.id).join(', ')})`);
    const kind = String(o.kind || v.kind || 'box').toLowerCase();
    if (kind === 'polyhedron') throw new O.OpError(`${v.id} is a polyhedron (its .vol is the shape): use --kind box|cylinder|sphere to replace it`);
    const bone = v.bone && model.bones.find(b => b.path === v.bone);
    if (!bone) throw new O.OpError(`volume ${v.id} is not linked to a bone`);
    const mesh = boneMesh(model, bone, mdlFile);
    if (!mesh || !mesh.exists) throw new O.OpError(`bone ${bone.name} has no mesh file${mesh ? ' (' + mesh.file + ' missing)' : ''}`);
    const { ply } = readPly(mesh.file);
    const f = O.fitVolumeToMesh(ply, { kind, axis: o.axis });
    const c = { op: 'setVolume', volume: v.id, matrix: f.matrix.map(x => +x.toPrecision(7)) };
    if (kind !== v.kind) c.kind = kind;
    if (f.size) c.size = f.size.map(x => +x.toPrecision(7));
    if (f.radius != null) c.radius = +f.radius.toPrecision(7);
    if (f.length != null) c.length = +f.length.toPrecision(7);
    changes.push(c);
    res.changed.push(`${v.id} (${v.kind}${kind !== v.kind ? ' -> ' + kind : ''}) fitted to ${mesh.rel}: ${short(c)}`);
  } else if (op === 'round') {
    const step = o.step == null ? 1 : Number(o.step);
    if (!(step > 0)) throw new Usage('--step must be a positive number');
    let vols = model.volumes;
    if (o.volume) { const v = M.findVolume(model, o.volume); if (!v) throw new O.OpError(`no volume ${o.volume}`); vols = [v]; }
    for (const v of vols) {
      if (v.kind === 'polyhedron' || !v.kind) continue;
      if (!v.exact) { res.changed.push(`${v.id}: matrix not exactly known, skipped`); continue; }
      const r = O.roundVolume(v, step);
      for (const n of r.notes) res.changed.push(`${v.id}: ${n}`);
      if (!Object.keys(r.change).length) continue;
      const c = { op: 'setVolume', volume: v.id, ...r.change };
      changes.push(c);
      res.changed.push(`${v.id}: ${short(c)}`);
    }
  } else throw new Usage(`unknown operation ${op || '(none)'}`);
  res.mdlChanges = changes;
  res.volumes = changes.length;
  if (changes.length && o.apply) {
    let buf; try { buf = M.edit(model, changes); } catch (e) { throw new O.OpError('mdl edit: ' + e.message); }
    res.out = mdlFile;
    res.write = save(mdlFile, buf, o);
  } else if (changes.length) res.changed.push('not applied (use --apply)');
}

function main(argv) {
  argv = (argv || []).slice();
  if (argv[0] === 'vol') argv.shift();
  const op = argv[0];
  let o = { pos: [] };
  const res = { ok: false, operation: op || null, file: null, out: null, volumes: 0, changed: [], error: null };
  try {
    o = parseArgs(argv.slice(1));
    if (!op || o.help) throw new Usage('');
    run(op, o, res);
    res.ok = true;
    if (o.dry && o.apply) res.changed.push('dry run: nothing written');
  } catch (e) {
    res.error = e.message || String(e);
    if (o.json) console.log(JSON.stringify(res, null, 1));
    else console.log(e instanceof Usage ? (e.message ? `soedit ops vol: ${e.message}\n` : '') + 'usage: soedit ops vol fit|round <model.mdl> [--volume id] [--step n] [--apply]' : `soedit ops vol ${op}: ${res.error}`);
    return e instanceof Usage ? 2 : 1;
  }
  if (o.json) console.log(JSON.stringify(res, null, 1));
  else { console.log(`${op}: ${res.volumes} volume change(s)${res.write ? ' -> ' + res.out + ' (' + res.write + ')' : ''}`); if (!o.q) for (const c of res.changed) console.log('  ' + c); }
  return 0;
}

module.exports = { main };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
