// sweep-ply: read every vanilla .ply in place (loose + inside paks, shadowed copies included) and check
// write(parse(buf)) is byte-identical. usage: node tools/lib/model/sweep-ply.js [gameDir] [--sample N] [--json] [--exe as64|mowas_2|mowas2|goh]
// (--exe: the game's file view, sweepargs.js; goh with no gameDir = the GoH install)
// prints `<total> files, <same> identical, <diff> differ, <err> unreadable`, counts per magic, per part tag, chunk tags,
// fvf / part flags / stride-vs-layout spare bytes, files whose parts disagree on the layout, first 10 failing paths.
// One file in memory at a time.
// Author: Imperator_Aug (ARSENAL, ia-35c237ab)
'use strict';
const vfs = require('../vfs'), gamedir = require('../gamedir'), ply = require('./ply');

const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

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
  const add = (key, rec) => { if (rec && !rec.deleted && key.endsWith('.ply')) recs.set(rec.container + '|' + rec.entry, { key, rec }); };
  for (const [k, r] of v.files) add(k, r);
  for (const s of v.shadows) if (s.over) add(s.key, s.over);
  let list = [...recs.values()];
  if (sample > 0 && list.length > sample) { const step = list.length / sample; list = Array.from({ length: sample }, (_, i) => list[Math.floor(i * step)]); }
  const st = { total: 0, same: 0, diff: 0, err: 0, magic: {}, partTags: {}, chunkTags: {}, fvf: {}, flags: {}, spare: {}, mixed: 0, inline: 0, bytes: 0, fails: [] };
  for (const { key, rec } of list) {
    st.total++;
    let buf;
    try { buf = vfs.readRec(rec); } catch (e) { st.err++; st.fails.push(`${key}: read ${e.message}`); continue; }
    st.bytes += buf.length;
    const o = ply.parse(buf);
    inc(st.magic, o.magic || '?');
    if (o.error) { st.err++; st.fails.push(`${key}: ${o.error}`); }
    for (const c of o.chunks) inc(st.chunkTags, c.tail ? '(tail)' : c.tag);
    for (const p of o.parts) {
      inc(st.partTags, p.tag);
      if (p.tag === 'MESH') inc(st.fvf, '0x' + p.fvf.toString(16));
      inc(st.flags, '0x' + p.flags.toString(16));
      if (p.inlineMaterial) st.inline++;
    }
    if (o.vertices) {
      const used = o.vertices.layout.reduce((m, e) => Math.max(m, e.offset + e.size), 0);
      inc(st.spare, `${o.magic}+${o.vertices.stride - used}`);
      if (o.vertices.mixed) st.mixed++;
    }
    let w;
    try { w = ply.write(o); } catch (e) { st.diff++; st.fails.push(`${key}: write threw ${e.message}`); continue; }
    if (Buffer.compare(w, buf) === 0) { if (!o.error) st.same++; }
    else { st.diff++; let d = 0; while (d < w.length && w[d] === buf[d]) d++; st.fails.push(`${key}: write differs (${w.length} vs ${buf.length} bytes, first at ${d})`); }
  }
  vfs.closeRecs();
  st.ms = Date.now() - t0;
  if (json) { console.log(JSON.stringify(st, null, 1)); return st; }
  const fmt = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`).join(', ');
  console.log(`${st.total} files, ${st.same} identical, ${st.diff} differ, ${st.err} unreadable`);
  console.log(`magic: ${fmt(st.magic)}; parts: ${fmt(st.partTags)}; chunks: ${fmt(st.chunkTags)}`);
  console.log(`MESH fvf: ${fmt(st.fvf)}`);
  console.log(`part flags: ${fmt(st.flags)}`);
  console.log(`VERT stride minus decoded layout: ${fmt(st.spare)}; ${st.mixed} files with parts on different layouts; ${st.inline} inline materials`);
  console.log(`${(st.bytes / 1048576).toFixed(0)} MB in ${st.ms} ms`);
  for (const f of st.fails.slice(0, 10)) console.log('  ' + f);
  return st;
}

if (require.main === module) main(process.argv);
module.exports = { main };
