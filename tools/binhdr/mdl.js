// .mdl / .def text checks: FMT-05 bone {speed}/{limits}, FMT-07 volume wiring, FMT-09 anm bones vs skeleton
// vol
// Author: Imperator_Aug (ARSENAL, ia-2a998898)
const { readText } = require('../lib/enc'), sdl = require('../lib/sdl'), names = require('../lib/names');

LIMITED = new Set(['revolute', 'prizmatic', 'socket', 'planarsocket']);
const PARAM_OK = t => LIMITED.has(t);
const lc = s => (s == null ? '' : String(s).toLowerCase());

function parseText(buf) {
  const r = readText(buf, 'cp1251');
  if (r.fatal) return null;
  return sdl.parseLines(r.lines, () => {});
}

// → { bones:Set(lc names), dotted:bool, volumes: Map(lc name -> { line, bone, shape }), seqs:[{name,file}] , tree }
function scanMdl(ctx) {
  const { buf, rep, rel } = ctx;
  const tree = parseText(buf);
  if (!tree) return null;
  const info = { bones: new Set(), dotted: false, volumes: new Map(), seqs: [] };
  (function walk(n, inBone) {
    for (const k of n.kids) {
      const nm = lc(k.name);
      if (nm === 'bone') {
        const vals = k.vals.map(v => v.v), words = k.vals.filter(v => v.t === 'w').map(v => lc(v.v));
        const strs = k.vals.filter(v => v.t === 's').map(v => v.v);
        const firstStr = k.vals.findIndex(v => v.t === 's');
        const type = k.vals[0] && k.vals[0].t === 'w' && (firstStr < 0 || firstStr > 0) ? words[0] : null, bname = strs[0];
        if (bname !== undefined) {
          if (bname.includes('.')) info.dotted = true; else info.bones.add(lc(bname));
        }
        void vals;
        const isPrefab = bname !== undefined && bname.includes('.');
        if (type && type !== 'wild' && !LIMITED.has(type)) rep.add(rel, k.line, 'MDL_BONE_TYPE', `bone type "${type}" unknown (revolute prizmatic socket planarsocket wild): "unexpected token"`);
        if (!isPrefab) for (const c of k.kids) {
          const cn = lc(c.name);
          if (cn === 'limits' && !(type && LIMITED.has(type)))
            rep.add(rel, c.line, 'MDL_BONE_PARAM', `{limits} on ${type ? 'bone type ' + type : 'plain bone'} "${bname ?? ''}": only revolute/prizmatic/socket bones accept it ("unexpected token" crash)`);
          if ((cn === 'speed' || cn === 'speed2')) {
            if (!(type && LIMITED.has(type)))
              rep.add(rel, c.line, 'MDL_BONE_PARAM', `{${c.name}} on ${type ? 'bone type ' + type : 'plain bone'} "${bname ?? ''}": only revolute/prizmatic/socket bones accept it ("unexpected token" crash)`);
            else if (PARAM_OK(type) && c.vals.length && Math.abs(parseFloat(c.vals[0].v)) < 1e-5) rep.add(rel, c.line, 'MDL_ZERO_SPEED', `{${c.name} ${c.vals[0].v}} on bone "${bname ?? ''}": "Zero speed in ik-bone"`);
          }
        }
        walk(k, true);
      } else if (nm === 'volume') {
        const name = lc(k.vals.find(v => v.t === 's')?.v);
        const bone = k.kids.find(c => lc(c.name) === 'bone');
        const shape = k.kids.some(c => ['polyhedron', 'box', 'cylinder', 'sphere'].includes(lc(c.name)));
        if (name) info.volumes.set(name, { line: k.line, bone: bone ? lc(bone.vals[0]?.v) : null, shape });
      } else if (nm === 'sequence') {
        const seq = k.vals.find(v => v.t === 's')?.v;
        const f = k.kids.find(c => lc(c.name) === 'file');
        if (seq) info.seqs.push({ name: seq, file: f ? f.vals[0]?.v : null, line: k.line });
        walk(k, inBone);
      } else walk(k, inBone);
    }
  })(tree, false);
  return info;
}

// FMT-07: mdl volume bone absent (needs whole skeleton known: no prefab dots)
function checkMdlVolumes(ctx, info) {
  if (info.dotted) return;
  for (const [name, v] of info.volumes) if (v.bone && !info.bones.has(v.bone))
    ctx.rep.add(ctx.rel, v.line, 'MDL_VOLUME_BONE', `{Volume "${name}"} {Bone "${v.bone}"}: bone not in skeleton, volume silently dropped (Relink)`);
}

// FMT-07: .def volume names vs the .mdl its own {Extension} names
function checkDef(ctx, mdlInfoFor) {
  const { buf, rep, rel, key } = ctx;
  const text = buf.toString('latin1');
  if (!/volume/i.test(text) || !/extension/i.test(text)) return;
  const tree = parseText(buf);
  if (!tree) return;
  const top = tree.kids[0];
  if (!top) return;
  const ext = top.kids.filter(k => lc(k.name) === 'extension');
  if (ext.length !== 1) return;                                      // none/several: composition unclear
  const ef = ext[0].vals[0]?.v;
  if (!ef || !/\.mdl$/i.test(ef)) return;
  const dir = key.slice(0, key.lastIndexOf('/'));
  const mkey = names.resolve(ef, dir).key;
  const info = mdlInfoFor(mkey);
  if (!info) return;
  for (const k of top.kids) if (lc(k.name) === 'volume') {
    const name = lc(k.vals.find(v => v.t === 's')?.v);
    if (!name) continue;
    const inDef = k.kids.some(c => ['polyhedron', 'box', 'cylinder', 'sphere'].includes(lc(c.name)));
    const mv = info.volumes.get(name);
    if (!mv && !inDef) rep.add(rel, k.line, 'DEF_VOLUME_NO_SHAPE', `{Volume "${name}"} has no shape in ${mkey}: silently dropped (armor/thickness lost)`);
    else if (mv && mv.bone && !info.dotted && !info.bones.has(mv.bone))
      rep.add(rel, k.line, 'DEF_VOLUME_NO_SHAPE', `{Volume "${name}"}: its bone "${mv.bone}" is not in ${mkey}: silently dropped`);
  }
}

// FMT-03/FMT-22 reachability: .ply names a .mdl loads ({VolumeView}/{View}/{LODView ..}: any string value ending .ply, anywhere in the tree)
function plyRefs(buf) {
  const tree = parseText(buf), out = [];
  if (!tree) return out;
  (function walk(n) { for (const k of n.kids) { for (const v of k.vals) if (v.t === "s" && /.ply$/i.test(v.v)) out.push(v.v); walk(k); } })(tree);
  return out;
}

// the .mdl a .def loads: every {Extension "x.mdl"} anywhere in it (names as written)
function defMdls(buf) {
  const tree = parseText(buf), out = [];
  if (!tree) return out;
  (function walk(n) { for (const k of n.kids) { if (lc(k.name) === "extension") for (const v of k.vals) if (v.t === "s" && /.mdl$/i.test(v.v)) out.push(v.v); walk(k); } })(tree);
  return out;
}

module.exports = { scanMdl, checkMdlVolumes, checkDef, plyRefs, defMdls };
