// previews check: read the written files back (previews.md 11; design 10 "Check").
//   check(src, doc, o) -> {v:1, target, map, n, files:[{path, ok, facts:{format, size, mips}, notes:[code], why?}], ok}
//     o = {mod, targets?:[id], winners?: fn(row) -> {ours, mount, file}}. Per file of the last journal entry of this map (or
//     only --targets): exists; sha1 = the journal's (else PRV_CHECK_CHANGED); picture facts with no game error; DDS: DXT1,
//     size, mip count and length = the target row, mip 0 and the last mip decode through lib/model/dds.js; PNG: decode,
//     size = the row; the winner over the stack is ours (else PRV_STRONGER_OTHER).
// Author: Imperator_Aug (ARSENAL, ia-b4619b09)
'use strict';
const fs = require('fs'), path = require('path');
const C = require('./commit'), T = require('./targets');

function checkOne(buf, row) {
  const P = require('../../lib/model/picture');
  const notes = [], type = row.format === 'PNG' ? 'png' : 'dds';
  const f = P.facts(type, buf);
  const facts = { format: f.format || null, size: [f.width || 0, f.height || 0], mips: f.mips || 0 };
  if (f.error) return { ok: false, facts, notes, why: f.error };
  if (!f.game || !f.game.ok) return { ok: false, facts, notes, why: 'the game refuses it: ' + (f.game && f.game.why) };
  if (row.size && (f.width !== row.size[0] || f.height !== row.size[1])) return { ok: false, facts, notes, why: 'size ' + f.width + 'x' + f.height + ', the target is ' + row.size.join('x') };
  if (type === 'dds') {
    if (f.format !== 'DXT1') return { ok: false, facts, notes, why: 'format ' + f.format + ', DXT1 wanted' };
    if (row.mips && f.mips !== row.mips) return { ok: false, facts, notes, why: f.mips + ' mips, ' + row.mips + ' wanted' };
    const want = T.dxt1Bytes(f.width, f.height);
    if (buf.length !== want) return { ok: false, facts, notes, why: 'the file is ' + buf.length + ' bytes, its header says ' + want };
    const dds = require('../../lib/model/dds');
    for (const mip of [0, f.mips - 1]) {
      const d = dds.decode(buf, { mip });
      if (d.error || d.mip !== mip) return { ok: false, facts, notes, why: 'mip ' + mip + ' does not decode' + (d.error ? ': ' + d.error : '') };
    }
  } else {
    let d = null;
    try { d = require('../lib/raster/png').decode(buf); } catch (e) { return { ok: false, facts, notes, why: 'PNG does not decode: ' + e.message }; }
    if (!d || d.w !== f.width || d.h !== f.height) return { ok: false, facts, notes, why: 'PNG decode size differs from its header' };
  }
  return { ok: true, facts, notes };
}

function check(src, doc, o) {
  o = o || {};
  const mod = path.resolve(o.mod);
  const j = C.journal(mod), e = C.pick(j, { map: doc.key, target: src.target });
  if (!e) {
    const M = require('../mapviz');
    throw new M.MvError('MV_NOT_FOUND', 'nothing written for ' + doc.key + ' in this mod (no journal entry)', { code: 'PRV_NO_JOURNAL' });
  }
  const rows = T.targets(src.target, doc.key, doc, { minimapSize: o.minimapSize });
  const byFile = new Map(rows.map(r => ['resource/map/' + doc.key + '/' + r.file, r]));
  const files = [];
  for (const fl of e.files) {
    if (fl.renamed) continue;
    const row = byFile.get(fl.path);
    if (!row) continue;
    if (o.targets && o.targets.length && !o.targets.includes(row.id)) continue;
    // size and mips as written: the journal file row holds them (the minimap size moves with the stack and --minimap-size);
    // a journal from before they were kept: the target row of now
    const want = Object.assign({}, row);
    if (Array.isArray(fl.size) && fl.size.length === 2) want.size = fl.size.slice();
    if (Number.isInteger(fl.mips) && fl.mips > 0) want.mips = fl.mips;
    const f = path.join(mod, ...fl.path.split('/'));
    if (!fs.existsSync(f)) { files.push({ path: fl.path, ok: false, facts: null, notes: [], why: 'missing' }); continue; }
    const buf = fs.readFileSync(f);
    const r = checkOne(buf, want);
    if (C.sha1(buf) !== fl.sha1) { r.notes.push('PRV_CHECK_CHANGED'); r.ok = false; if (!r.why) r.why = 'changed since the write'; }
    if (o.winners) {
      const w = o.winners(row);
      if (w && !w.ours) { r.notes.push('PRV_STRONGER_OTHER'); r.ok = false; if (!r.why) r.why = 'the game loads ' + w.file + ' instead'; }
    }
    files.push(Object.assign({ path: fl.path }, r));
  }
  return { v: 1, target: src.target, map: doc.key, n: e.n, files, ok: files.length > 0 && files.every(f => f.ok) };
}

module.exports = { check, checkOne };
