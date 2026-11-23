#!/usr/bin/env node
// soedit/ops/ply: command line for SOEdit's mesh operations without a window (logic in plyops.js, spec NOTES.md 13-16).
//   node tools/soedit/soedit.js ops ply <operation> ... (or node tools/soedit/ops/ply.js <operation> ...)
//   info <file.ply>                                     parts, flags, material, layout, counts, bounds, skin bones
//   merge <a.ply> <b.ply> --out <file> [--matrix "12 numbers"] b moved by the matrix (matrix 43 x.xyz y.xyz z.xyz t.xyz)
//   merge-child <model.mdl> --bone <child> [--out f] [--apply]   child mesh into its parent's mesh with the child's local
//       matrix; writes the parent ply (default in place); prints the mdl change (child's mesh view removed, parent view
//       pointed at --out when it differs) and applies it through mdl.edit only with --apply. The child bone is kept
//       (mdl.edit has no bone delete; SOEdit deletes it): its volumes and animation tracks stay valid.
//   demerge <file.ply> (--parts 0,2 | --by material|parts) [--out f | --out-dir d] [--rest f] [--recentre]
//   tweak <file.ply> [--set-flag X --clear-flag Y --vset X --vclear Y --material from=to --parts 0,1|all --force] [--out f]
// Common: --out, --json ({ ok, operation, file, out, parts, vertices, triangles, changed, error }), --dry, --game <dir>.
// Writing: refused through lib/writeguard (never into a game install outside mods/<name>); one .bak kept the first time
//   an existing file is changed (an existing .bak is never overwritten); temp file then rename. Exit 0 done, 1 refused or
//   bad input, 2 usage.
// Author: Imperator_Aug (ARSENAL, ia-73b4e560)
'use strict';
const fs = require('fs'), path = require('path');
const P = require('../../lib/model/ply');
const M = require('../../lib/model/mdl');
const wg = require('../../lib/writeguard');
const O = require('./plyops');

const VALUED = new Set(['out', 'matrix', 'bone', 'parts', 'set-flag', 'clear-flag', 'vset', 'vclear', 'material', 'rest', 'by', 'out-dir',
  'volume', 'step', 'kind', 'axis', 'game']);
const MULTI = new Set(['set-flag', 'clear-flag', 'vset', 'vclear']);
class Usage extends Error {}

function parseArgs(argv) {
  const o = { pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '-q') { o.q = true; continue; }
    if (!x.startsWith('--')) { o.pos.push(x); continue; }
    let k = x.slice(2), val;
    const eq = k.indexOf('=');
    if (eq > 0 && VALUED.has(k.slice(0, eq))) { val = k.slice(eq + 1); k = k.slice(0, eq); }
    if (VALUED.has(k)) {
      if (val === undefined) { if (i + 1 >= argv.length) throw new Usage(`--${k} needs a value`); val = argv[++i]; }
      if (MULTI.has(k)) (o[k] = o[k] || []).push(val); else o[k] = val;
    } else if (['json', 'dry', 'apply', 'force', 'recentre', 'recenter', 'help'].includes(k)) o[k] = true;
    else throw new Usage(`unknown option --${k}`);
  }
  return o;
}

function readPly(file) {
  if (!file) throw new Usage('missing .ply file');
  let buf;
  try { buf = fs.readFileSync(file); } catch (e) { throw new O.OpError(`cannot read ${file}: ${e.code || e.message}`); }
  const ply = P.parse(buf);
  if (ply.error) throw new O.OpError(`${file}: ${ply.error}`);
  return { ply, buf };
}
function encode(ply) {
  try { return P.write(ply); } catch (e) { throw new O.OpError(e.message); }
}
// guarded write: refuseWrite, one .bak, temp + rename. Returns 'written' | 'unchanged' | 'dry'
function save(target, buf, o = {}) {
  const t = path.resolve(target);
  const why = wg.refuseWrite(t, { game: o.game, purpose: 'soedit ops' });
  if (why) throw new O.OpError(`refused to write ${t}: ${why}`);
  let old = null;
  try { old = fs.readFileSync(t); } catch (e) { /* new file */ }
  if (old && old.equals(buf)) return 'unchanged';
  if (o.dry) return 'dry';
  fs.mkdirSync(path.dirname(t), { recursive: true });
  const bak = t + '.bak';
  if (old && !fs.existsSync(bak)) fs.copyFileSync(t, bak);
  const tmp = `${t}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, t);
  return 'written';
}
const nums = s => String(s).trim().split(/[\s,]+/).filter(Boolean).map(Number);
function matrixArg(s) {
  const m = nums(s);
  if (m.length === 3) return [1, 0, 0, 0, 1, 0, 0, 0, 1, ...m];
  if (m.length !== 12 || m.some(x => !Number.isFinite(x))) throw new Usage('--matrix needs 12 numbers (or 3 for a translation)');
  return m;
}
function partsArg(s, n) {
  if (s == null || s === 'all') return 'all';
  const l = nums(s);
  if (!l.length || l.some(x => !Number.isInteger(x) || x < 0 || x >= n)) throw new O.OpError(`--parts ${s}: indexes 0..${n - 1}`);
  return l;
}
const summary = ply => ({ parts: ply.parts.length, vertices: ply.vertices ? ply.vertices.count : 0, triangles: ply.indices ? Math.floor(ply.indices.length / 3) : 0 });

// the mesh file a bone draws: first View/VolumeView (or its first LOD) naming a .ply, resolved next to the mdl
function boneMesh(model, bone, mdlFile) {
  for (const v of bone.views || []) {
    if (!/^(View|VolumeView)$/i.test(v.kind)) continue;
    const f = v.file || (v.lods && v.lods[0] && v.lods[0].file);
    if (!f) continue;
    const cands = [f, /\.\w+$/.test(f) ? null : f + '.ply'].filter(Boolean).map(x => path.resolve(path.dirname(mdlFile), x));
    const hit = cands.find(c => fs.existsSync(c));
    return { view: v, rel: f, file: hit || cands[cands.length - 1], exists: !!hit, lods: !!(v.lods && v.lods.length) };
  }
  return null;
}
function readMdl(file) {
  if (!file) throw new Usage('missing .mdl file');
  let buf; try { buf = fs.readFileSync(file); } catch (e) { throw new O.OpError(`cannot read ${file}: ${e.code || e.message}`); }
  const m = M.parse(buf);
  if (m.error) throw new O.OpError(`${file}: ${m.error}`);
  return m;
}

function run(op, o, res) {
  const out = o.out;
  switch (op) {
    case 'info': {
      const { ply } = readPly(o.pos[0]);
      res.file = o.pos[0]; Object.assign(res, summary(ply)); res.info = O.info(ply);
      if (!o.json) {
        const I = res.info;
        console.log(`${o.pos[0]}: ${I.magic} ${I.parts.length} part(s), ${I.vertices} vertices (stride ${I.stride}, VERT flags 0x${I.vertFlags.toString(16)}${I.mixed ? ', mixed layouts' : ''}), ${I.triangles} triangles`);
        if (I.bounds) console.log(`  bounds ${I.bounds.map(x => +x.toFixed(4)).join(' ')}`);
        if (I.skin) console.log(`  skin ${I.skin.join(', ')}`);
        for (const p of I.parts) console.log(`  [${p.index}] ${p.kind} flags 0x${p.flags.toString(16)} (${p.flagNames.join(' ')})${p.fvf != null ? ` fvf 0x${p.fvf.toString(16)}` : ''} ${p.material ? 'material ' + p.material : p.inlineMaterial ? 'inline material' : 'textures ' + (p.textures || []).join(' | ')}; ${p.triangles} tris ${p.vertices} verts; ${p.layout.join(' ')}${p.skinBones ? '; bones ' + p.skinBones.join(',') : ''}`);
      }
      return 0;
    }
    case 'merge': {
      if (o.pos.length < 2) throw new Usage('merge <a.ply> <b.ply> --out <file> [--matrix "12 numbers"]');
      if (!out) throw new Usage('merge needs --out');
      const a = readPly(o.pos[0]).ply, b = readPly(o.pos[1]).ply;
      const r = O.merge(a, b, { matrixB: o.matrix ? matrixArg(o.matrix) : null });
      res.file = o.pos[0]; res.out = out; Object.assign(res, summary(r.ply)); res.changed = r.changed;
      res.write = save(out, encode(r.ply), o);
      return 0;
    }
    case 'merge-child': {
      if (!o.pos[0] || !o.bone) throw new Usage('merge-child <model.mdl> --bone <child bone> [--out f] [--apply]');
      const mdlFile = o.pos[0], model = readMdl(mdlFile);
      const child = M.findBone(model, o.bone);
      if (!child) throw new O.OpError(`no bone ${o.bone}`);
      const parent = child.parent && model.bones.find(b => b.path === child.parent);
      if (!parent) throw new O.OpError(`bone ${child.name} has no parent`);
      if (model.bones.some(b => b.parent === child.path)) throw new O.OpError(`bone ${child.name} has children: merge them first`);
      if (!child.exact) throw new O.OpError(`bone ${child.name}: its matrix is not exactly known (block Matrix34 form)`);
      const cm = boneMesh(model, child, mdlFile);
      if (!cm || !cm.exists) throw new O.OpError(`bone ${child.name} has no mesh file${cm ? ' (' + cm.file + ' missing)' : ''}`);
      const pm = boneMesh(model, parent, mdlFile);
      if (pm && !pm.exists) throw new O.OpError(`parent mesh ${pm.file} missing`);
      if (!pm && !out) throw new Usage(`parent ${parent.name} has no mesh: give --out for the new one`);
      const r = O.mergeChildIntoParent(pm ? readPly(pm.file).ply : null, readPly(cm.file).ply, child.matrix, { rebind: { from: child.name, to: parent.name } });
      const target = path.resolve(out || pm.file);
      res.file = mdlFile; res.out = target; Object.assign(res, summary(r.ply)); res.changed = r.changed;
      if (child.sequences && child.sequences.length || (child.keys || []).includes('animation')) res.changed.push(`warning: ${child.name} has animation; the merged mesh is frozen at its rest matrix`);
      res.write = save(target, encode(r.ply), o);
      const changes = [{ op: 'setKey', bone: child.path, key: cm.view.kind, value: null }];
      if (!pm || path.resolve(pm.file).toLowerCase() !== target.toLowerCase()) {
        if (pm && pm.lods) throw new O.OpError('parent view has LODs: point it at the new mesh by hand');
        changes.push({ op: 'setKey', bone: parent.path, key: pm ? pm.view.kind : 'VolumeView', value: path.relative(path.dirname(path.resolve(mdlFile)), target).replace(/\\/g, '/') });
      }
      res.mdlChanges = changes;
      if (o.apply) {
        let buf; try { buf = M.edit(model, changes); } catch (e) { throw new O.OpError('mdl edit: ' + e.message); }
        res.mdlWrite = save(mdlFile, buf, o);
      } else if (!o.json) console.log('mdl change (apply with --apply): ' + JSON.stringify(changes));
      return 0;
    }
    case 'demerge': {
      const file = o.pos[0], { ply } = readPly(file);
      let groups;
      if (o.parts != null) { const l = partsArg(o.parts, ply.parts.length); groups = l === 'all' ? [ply.parts.map((_, i) => i)] : [l]; }
      else if (o.by === 'material' || o.by === 'parts') groups = o.by;
      else throw new Usage('demerge needs --parts 0,2 or --by material|parts');
      const r = O.demerge(ply, groups, { recentre: o.recentre || o.recenter });
      if (r.length > 1 && out) throw new Usage(`${r.length} groups: use --out-dir, not --out`);
      if (r.length === 1 && !out && !o['out-dir']) throw new Usage('demerge needs --out (or --out-dir)');
      const base = path.basename(file).replace(/\.ply$/i, ''), dir = o['out-dir'] || path.dirname(file);
      res.file = file; res.out = []; res.groups = [];
      r.forEach((g, i) => {
        const f = r.length === 1 && out ? out : path.join(dir, `${base}_demerge_${String(i + 1).padStart(3, '0')}.ply`);
        const w = save(f, encode(g.ply), o);
        res.out.push(f); res.groups.push({ parts: g.parts, key: g.key, out: f, offset: g.offset, write: w, ...summary(g.ply) });
        res.changed.push(`${g.key} -> ${f}${g.offset ? ' (bone offset ' + g.offset.slice(9).map(x => +x.toFixed(6)).join(' ') + ')' : ''}`);
      });
      if (r.length === 1) res.out = res.out[0];
      Object.assign(res, { parts: r.reduce((s, g) => s + g.ply.parts.length, 0), vertices: r.reduce((s, g) => s + summary(g.ply).vertices, 0), triangles: r.reduce((s, g) => s + summary(g.ply).triangles, 0) });
      if (o.rest) {
        const taken = new Set(r.flatMap(g => g.parts)), rest = ply.parts.map((_, i) => i).filter(i => !taken.has(i));
        if (!rest.length) throw new O.OpError('--rest: no parts left');
        const restPly = P.split(ply, rest);
        res.rest = { out: o.rest, write: save(o.rest, encode(restPly), o), ...summary(restPly) };
        res.changed.push(`remaining parts ${rest.join(',')} -> ${o.rest}`);
      }
      return 0;
    }
    case 'tweak': {
      const file = o.pos[0], { ply } = readPly(file);
      let material = null;
      if (o.material) { const i = o.material.indexOf('='); material = i < 0 ? { to: o.material } : { from: o.material.slice(0, i), to: o.material.slice(i + 1) }; }
      const r = O.tweak(ply, { meshFlagsSet: o['set-flag'], meshFlagsClear: o['clear-flag'], vertexFlagsSet: o.vset, vertexFlagsClear: o.vclear,
        material, parts: partsArg(o.parts, ply.parts.length), force: o.force });
      const target = out || file;
      res.file = file; res.out = target; Object.assign(res, summary(r.ply)); res.changed = r.changed;
      res.write = r.changed.length || out ? save(target, encode(r.ply), o) : 'unchanged';
      return 0;
    }
    default: throw new Usage(`unknown operation ${op || '(none)'}`);
  }
}

const USAGE = 'usage: soedit ops ply info|merge|merge-child|demerge|tweak <file> [options] (see tools/soedit/ops/ply.js header)';
function main(argv) {
  argv = (argv || []).slice();
  if (argv[0] === 'ply') argv.shift();
  const op = argv[0];
  let o = { pos: [] };
  const res = { ok: false, operation: op || null, file: null, out: null, parts: 0, vertices: 0, triangles: 0, changed: [], error: null };
  try {
    o = parseArgs(argv.slice(1));
    if (!op || o.help) throw new Usage('');
    run(op, o, res);
    res.ok = true;
    if (o.dry) res.changed.push('dry run: nothing written');
  } catch (e) {
    res.error = e.message || String(e);
    const code = e instanceof Usage ? 2 : 1;
    if (o.json) console.log(JSON.stringify(res, null, 1));
    else console.log(e instanceof Usage ? (e.message ? `soedit ops ply: ${e.message}\n` : '') + USAGE : `soedit ops ply ${op}: ${res.error}`);
    if (!(e instanceof Usage) && !(e instanceof O.OpError) && process.env.SOEDIT_DEBUG) console.error(e.stack);
    return code;
  }
  if (o.json) console.log(JSON.stringify(res, null, 1));
  else if (op !== 'info') {
    console.log(`${op}: ${res.parts} part(s), ${res.vertices} vertices, ${res.triangles} triangles${res.out ? ' -> ' + [].concat(res.out).join(', ') : ''}${res.write ? ' (' + res.write + ')' : ''}`);
    if (!o.q) for (const c of res.changed) console.log('  ' + c);
  }
  return 0;
}

module.exports = { main, save, parseArgs, readPly, readMdl, boneMesh, encode, Usage };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
