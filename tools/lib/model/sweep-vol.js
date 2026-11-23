// sweep-vol: read every vanilla .vol in place (loose + inside paks, shadowed copies included) and check
// write(parse(buf)) is byte-identical. usage: node tools/lib/model/sweep-vol.js [gameDir] [--sample N] [--json] [--exe as64|mowas_2|mowas2|goh]
// (--exe: the game's file view, sweepargs.js; goh with no gameDir = the GoH install)
// prints `<total> files, <same> identical, <diff> differ, <err> unreadable`, chunk layouts (.vol has no version
// field: the "version" count is per chunk layout), SIDE presence, side value histogram, winding, first 10 failing paths.
// Author: Imperator_Aug (ARSENAL, ia-9ab065dd)
'use strict';
const path = require('path');
const vfs = require('../vfs'), gamedir = require('../gamedir'), vol = require('./vol');

function main(argv) {
  const X = require('./sweepargs').cli(argv.slice(2)), args = X.args;
  let sample = 0, json = false, dir = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sample') sample = Number(args[++i]) || 0;
    else if (args[i] === '--json') json = true;
    else dir = args[i];
  }
  const gameDir = require('./sweepargs').gameFor(dir, X.exe, () => gamedir.require());
  const t0 = Date.now();
  const v = vfs.build(require('./sweepargs').vfsOpts({ gameDir, mods: [] }, X.exe));
  const recs = new Map();
  const add = (key, rec) => { if (rec && !rec.deleted && key.endsWith('.vol')) recs.set(rec.container + '|' + rec.entry, { key, rec }); };
  for (const [k, r] of v.files) add(k, r);
  for (const s of v.shadows) if (s.over) add(s.key, s.over);
  let list = [...recs.values()];
  if (sample > 0 && list.length > sample) { const step = list.length / sample; list = Array.from({ length: sample }, (_, i) => list[Math.floor(i * step)]); }
  const st = { total: 0, same: 0, diff: 0, err: 0, layouts: {}, withSide: 0, sideValues: {}, sideShort: 0, warnings: 0, outward: 0, inward: 0, sideAgree: 0, sideDisagree: 0, fails: [] };
  for (const { key, rec } of list) {
    st.total++;
    let buf;
    try { buf = vfs.readRec(rec); } catch (e) { st.err++; st.fails.push(`${key}: read ${e.message}`); continue; }
    const o = vol.parse(buf);
    if (o.error) { st.err++; st.fails.push(`${key}: ${o.error}`); continue; }
    const lay = o.chunks.map(c => c.tag).join(' ');
    st.layouts[lay] = (st.layouts[lay] || 0) + 1;
    if (o.sides) {
      st.withSide++;
      for (const s of o.sides) st.sideValues[s] = (st.sideValues[s] || 0) + 1;
      if (o.sides.length < o.faces.length / 3) st.sideShort++;
    }
    if (o.warnings.length) st.warnings++;
    // winding: sum over triangles of cross(b-a,c-a) . (centroid - mean vertex) > 0 -> cross points outward
    const tris = vol.triangles(o), b = vol.bounds(o);
    if (b && tris.length) {
      const c = [0, 1, 2].map(j => (b.min[j] + b.max[j]) / 2);
      let sum = 0;
      for (const t of tris) {
        const n = vol.normal(t.p);
        for (let j = 0; j < 3; j++) sum += n[j] * ((t.p[j] + t.p[3 + j] + t.p[6 + j]) / 3 - c[j]);
      }
      if (sum > 0) st.outward++; else st.inward++;
      for (const t of tris) if (t.side != null) {   // stored side vs faceSideFromNormal(outward normal)
        const n = vol.normal(t.p), g = vol.faceSideFromNormal(sum > 0 ? n : n.map(x => -x));
        if (g === (t.side > 6 ? 1 : t.side)) st.sideAgree++; else st.sideDisagree++;
      }
    }
    const w = vol.write(o);
    if (Buffer.compare(w, buf) === 0) st.same++;
    else { st.diff++; st.fails.push(`${key}: write differs (${w.length} vs ${buf.length} bytes)`); }
  }
  vfs.closeRecs();
  st.ms = Date.now() - t0;
  if (json) { console.log(JSON.stringify(st, null, 1)); return st; }
  console.log(`${st.total} files, ${st.same} identical, ${st.diff} differ, ${st.err} unreadable`);
  console.log('version: none in the format (EVLM + chunks); chunk layouts: ' + Object.entries(st.layouts).map(([k, n]) => `${k} x${n}`).join(', '));
  console.log(`SIDE: ${st.withSide}/${st.total - st.err} files, ${st.sideShort} with fewer entries than triangles; values ${JSON.stringify(st.sideValues)}`);
  console.log(`winding (cross(b-a,c-a)): ${st.outward} outward, ${st.inward} inward; ${st.warnings} files with parse warnings; ${st.ms} ms`);
  console.log(`stored side = faceSideFromNormal(outward normal): ${st.sideAgree} triangles agree, ${st.sideDisagree} differ`);
  for (const f of st.fails.slice(0, 10)) console.log('  ' + f);
  return st;
}

if (require.main === module) main(process.argv);
module.exports = { main };
