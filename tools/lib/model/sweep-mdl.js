// sweep-mdl: read every vanilla .mdl in place (loose + paks, shadowed copies too) through tools/lib/model/mdl.js.
//   node tools/lib/model/sweep-mdl.js <gameDir> [--sample N] [--tally <file>] [--json] [--exe as64|mowas_2|mowas2|goh]
//   --exe: the game's file view (sweepargs.js): mowas_2 = no as64/core files; goh with no <gameDir> = the GoH install
// per file: parse has no error; edit(model, []) is byte-identical; every bone + volume matrix written back with its own
// value is byte-identical (default mode), and with force (every number rewritten) differs at most in number formatting.
// Tallies keywords by context (TOP SKELETON BONE BONE-HEADER VOLUME ANIMATION SEQUENCE LODVIEW MATRIX34{} OBSTACLE AREA ..);
// prints the top 60, `*` = keyword SOEdit's readers (upstream source) do not know; --tally writes the full table.
// Prints `<total> files, <ok> parsed, <err> failed` and the first 10 failures. Exit 1 when any file fails.
// Author: Imperator_Aug (ARSENAL, ia-20678d0b)
'use strict';
const fs = require('fs');
const vfs = require('../vfs'), mdl = require('./mdl');

// keyword strings found in SOEdit's (lower case)
const SOEDIT = new Set(('area circle2 color decaltarget lodview nocastshadows nogetshadows nogroupmesh obb2 obstacle polygon2 speed speed2 sphere waterscissor ' +
  'animation autostart axis bone bones bottom box center component cylinder density event events extent file front ground layer left limits lod matrix34 ' +
  'name off orientation parameters polyhedron position prizmatic radius rear resume revolute right rotate skeleton smooth socket store tags terminator ' +
  'thickness top unknown vertex visibility volume volumeview sequence').split(' '));

function main(argv) {
  const X = require('./sweepargs').cli(argv.slice(2)), a = X.args;
  const opt = { sample: 0, tally: null, json: false, game: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--sample') opt.sample = +a[++i];
    else if (a[i] === '--tally') opt.tally = a[++i];
    else if (a[i] === '--json') opt.json = true;
    else if (!opt.game) opt.game = a[i];
  }
  opt.game = require('./sweepargs').gameFor(opt.game, X.exe, () => require('../gamedir').resolve().dir);
  if (!opt.game) { console.error('usage: node tools/lib/model/sweep-mdl.js <gameDir> [--sample N] [--tally file]'); process.exit(2); }
  const t0 = Date.now();
  const v = vfs.build(require('./sweepargs').vfsOpts({ gameDir: opt.game, mods: [] }, X.exe));
  const recs = [], seen = new Set();
  const take = (key, r) => { if (!r || r.deleted) return; const id = (r.container || '') + '|' + (r.entry || '') + '|' + key; if (seen.has(id)) return; seen.add(id); recs.push([key, r]); };
  for (const [k, r] of v.files) if (k.endsWith('.mdl')) take(k, r);
  for (const s of v.shadows || []) if (s.key && s.key.endsWith('.mdl')) take(s.key, s.over);
  let list = recs;
  if (opt.sample > 0 && opt.sample < recs.length) { const step = recs.length / opt.sample; list = []; for (let i = 0; i < opt.sample; i++) list.push(recs[Math.floor(i * step)]); }

  const tally = new Map();
  const tal = (ctx, k) => { const key = ctx + ' ' + k; tally.set(key, (tally.get(key) || 0) + 1); };
  const st = { total: 0, ok: 0, err: 0, noopSame: 0, mats: 0, matSame: 0, forceSame: 0, forceFmt: 0, forceBad: 0, bones: 0, volumes: 0, seqs: 0, inexact: 0, orphans: 0 };
  const fails = [];
  const fr = Math.fround;
  const sameMats = (a, b) => a.length === b.length && a.every((x, i) => x.every((y, j) => fr(y) === fr(b[i][j])));
  for (const [key, rec] of list) {
    st.total++;
    const where = key + (rec.source === 'pak' ? ' [' + (rec.layer || 'pak') + ']' : ' [loose]');
    let buf;
    try { buf = vfs.readRec(rec); } catch (e) { st.err++; fails.push(where + ': unreadable ' + e.message); continue; }
    let m;
    try { m = mdl.parse(buf); } catch (e) { st.err++; fails.push(where + ': parse threw ' + e.message); continue; }
    if (m.error) { st.err++; fails.push(where + ': ' + m.error); continue; }
    // tally
    const blk = (n, ctx) => { for (const c of n.items) if (c.items) tal(ctx, c.items[0] && c.items[0].type === 'atom' ? c.items[0].text.toLowerCase() : c.items[0] ? '(' + c.items[0].type + ')' : '(empty)'); };
    blk(m.root, 'TOP');
    for (const s of [m.skeleton].concat(m.skeletons ? m.skeletons.slice(1) : [])) if (s) blk(s.node, 'SKELETON');
    for (const b of m.bones) {
      blk(b.node, 'BONE');
      tal('BONE-HEADER', b.type ? b.type.toLowerCase() : '(plain)');
      for (const u of b.unknownNodes) if (!u.items) tal('BONE-HEADER', 'word:' + u.text);
      if (b.file) tal('BONE-HEADER', '(prefab file)');
      for (const vw of b.views) if (vw.kind === 'LODView') blk(vw.node, 'LODVIEW');
      for (const x of b.animation) tal('ANIMATION', x.kind);
      for (const c of b.node.items) if (c.items && /^matrix34$/i.test(c.items[0]?.text || '') && c.items.some(y => y.items)) blk(c, 'MATRIX34{}');
      if (!b.exact) st.inexact++;
    }
    if (m.skeleton) for (const x of m.skeleton.animation) tal('ANIMATION', x.kind);
    for (const s of m.sequences) { blk(s.node, 'SEQUENCE'); tal('ANIMATION', 'sequence'); }
    for (const x of m.volumes) { blk(x.node, 'VOLUME'); if (x.orphan) st.orphans++; if (!x.exact) st.inexact++; }
    for (const o of m.obstacles) { blk(o.node, 'OBSTACLE'); for (const c of o.node.items) if (c.items && c.items.some(y => y.items)) blk(c, 'OBSTACLE.' + c.items[0].text.toLowerCase()); }
    for (const o of m.areas) { blk(o.node, 'AREA'); for (const c of o.node.items) if (c.items && c.items.some(y => y.items)) blk(c, 'AREA.' + c.items[0].text.toLowerCase()); }
    for (const b of m.blocks) blk(b.node, 'TOP.' + String(b.keyword).toLowerCase());
    st.bones += m.bones.length; st.volumes += m.volumes.length; st.seqs += m.sequences.length;
    // no-op
    const noop = mdl.edit(m, []);
    if (!noop.equals(buf)) { st.err++; fails.push(where + ': no-op edit differs'); continue; }
    st.noopSame++;
    // matrices written back with their own value
    const ch = m.bones.filter(b => b.exact).map(b => ({ op: 'setMatrix', bone: b.path, matrix: b.matrix }))
      .concat(m.volumes.filter(x => x.exact).map(x => ({ op: 'setVolume', volume: x.id, matrix: x.matrix })));
    // duplicate paths/ids resolve to the first match only: keep first of each
    const uniq = new Set(), chs = ch.filter(c => { const k = (c.bone ?? c.volume).toLowerCase(); if (uniq.has(k)) return false; uniq.add(k); return true; });
    st.mats += chs.length;
    let out;
    try { out = mdl.edit(m, chs); } catch (e) { st.err++; fails.push(where + ': matrix write-back threw ' + e.message); continue; }
    if (!out.equals(buf)) { st.err++; fails.push(where + ': matrix write-back (same value) not byte-identical'); continue; }
    st.matSame++;
    let fo;
    try { fo = mdl.edit(m, chs.map(c => Object.assign({ force: true }, c))); } catch (e) { st.err++; fails.push(where + ': forced write-back threw ' + e.message); continue; }
    if (fo.equals(buf)) st.forceSame++;
    else {
      const m2 = mdl.parse(fo);
      if (!m2.error && sameMats(m2.bones.map(b => b.matrix), m.bones.map(b => b.matrix)) && sameMats(m2.volumes.map(x => x.matrix), m.volumes.map(x => x.matrix))
        && m2.bones.length === m.bones.length && fo.length <= buf.length + 64 * chs.length) st.forceFmt++;
      else { st.forceBad++; st.err++; fails.push(where + ': forced write-back changed values'); continue; }
    }
    st.ok++;
  }
  vfs.closeRecs();
  const rows = [...tally].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
  const mark = k => { const w = k.split(' ')[1].replace(/^word:/, ''); return SOEDIT.has(w) || w.startsWith('(') ? ' ' : '*'; };
  const ms = Date.now() - t0;
  if (opt.json) { console.log(JSON.stringify({ st, fails: fails.slice(0, 10), tally: Object.fromEntries(rows), ms })); }
  else {
    console.log('keyword tally (context keyword count; * = not in SOEdit readers), top 60:');
    for (const [k, n] of rows.slice(0, 60)) console.log(`  ${mark(k)} ${String(n).padStart(7)}  ${k}`);
    const notSo = rows.filter(([k]) => mark(k) === '*');
    console.log(`keywords SOEdit does not know: ${notSo.map(([k, n]) => k + '=' + n).join(', ')}`);
    console.log(`bones ${st.bones}, volumes ${st.volumes} (${st.orphans} with an absent bone), sequences ${st.seqs}, rotation not decoded ${st.inexact}`);
    console.log(`matrices ${st.mats}: same value -> identical in ${st.matSame} files; forced rewrite -> identical ${st.forceSame}, format-only ${st.forceFmt}, changed ${st.forceBad}`);
    console.log(`no-op identical ${st.noopSame}; ${ms} ms`);
    if (fails.length) { console.log('first failures:'); for (const f of fails.slice(0, 10)) console.log('  ' + f); }
    console.log(`${st.total} files, ${st.ok} parsed, ${st.err} failed`);
  }
  if (opt.tally) fs.writeFileSync(opt.tally, rows.map(([k, n]) => `${n}\t${mark(k)}\t${k}`).join('\n') + '\n');
  return st.err ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv);
module.exports = { main };
