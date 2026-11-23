// BALANCE on Gates of Hell, columns speed and armour: the numbers live in the vehicle's def and the files it includes, read and
// changed by tools/lib/goharmour.js (per-part armour, top speed; number bytes spliced, CRLF kept). One edit per unit file: the
// period copies of a card and a doctrine card that buys the same vehicle read one def, so the first row edits it and the others
// are named on that row. armour = every part scaled by the plan's factor (goharmour plan {scale}); speed = goharmour plan {speed}.
// A file the def includes that other units read too is copied next to the def and its include repointed (goharmour, said in
// a note); where goharmour refuses (no speed of its own, a shared file reached through another shared file ..) the row is
// skipped with its reason. [I] read from the data; [T] in game.
// Author: Imperator_Aug (ARSENAL, ia-231c28f0)
'use strict';
const GA = require('../lib/goharmour');
const lc = s => String(s == null ? '' : s).toLowerCase();
const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// the unit's def key (resource/entity/...): its catalogue def, else a def named after the vehicle anywhere under entity/
function defKey(ctx, u) {
  if (u.def) { const k = lc(u.def).replace(/\\/g, '/').replace(/^\/+/, ''), key = k.startsWith('resource/') ? k : 'resource/' + k; if (ctx.read(key)) return key; }
  let ks = []; try { ks = ctx.keys(new RegExp('^resource/entity/.*/' + reEsc(lc(u.vehicle || u.id)) + '\\.def$')); } catch (e) { ks = []; }
  return ks.find(k => ctx.inMod(k)) || ks[0] || null;
}
const short = k => String(k).replace(/^resource\//, '');
// the def a catalogue unit names, without reading it (the lookup only for a unit that names none)
const defOf = (ctx, u) => { if (u.def) return short(lc(u.def).replace(/\\/g, '/').replace(/^\/+/, '')); const d = defKey(ctx, u); return d ? short(d) : null; };

// p: plan row {field 'speed'|'armor', old, new, factor}; done: Map field|def -> out row (shared across rows of one apply)
function row(ctx, u, p, done, out) {
  if (u.kind !== 'vehicle') { out.skipped.push({ id: u.id, why: p.field === 'speed' ? 'is not a vehicle: no top speed to change' : 'is not a vehicle: only vehicles and guns have armour' }); return; }
  const def = defKey(ctx, u);
  if (!def) { out.skipped.push({ id: u.id, why: 'its unit file (' + (u.vehicle || u.id) + '.def) was not found' }); return; }
  const k = p.field + '|' + def;
  if (done.has(k)) { const r = done.get(k); if (r && !r.users.includes(u.id)) r.users.push(u.id); return; }
  const R = GA.read(ctx, def);
  let ch;
  if (p.field === 'speed') ch = { speed: p.new };
  else {
    if (!R.parts.length) { done.set(k, null); out.skipped.push({ id: u.id, why: 'no armour numbers were found in its unit files (' + short(def) + ')' }); return; }
    ch = { scale: p.factor };
  }
  const P = GA.plan(ctx, R, ch, {});
  if (!P.ok) { done.set(k, null); out.skipped.push({ id: u.id, why: P.reason }); return; }
  if (P.nothing) { done.set(k, null); return; }
  for (const [key, b] of P.files) ctx.write(key, b);
  const r = { id: u.id, name: u.name, field: p.field, old: p.old, new: p.field === 'speed' ? Math.round(p.new) : p.new, def: short(def), users: [u.id], notes: (P.notes || []).slice() };
  if (p.field === 'armor') {
    const parts = new Set(P.rows.map(x => x.part));
    r.notes.unshift(P.rows.length + ' number(s) in ' + parts.size + ' part(s) x' + p.factor);
  }
  done.set(k, r); out.rows.push(r);
}
// the other buy-panel units that read the same def: named on the row (they change too); the notes of goharmour go along
function notes(ctx, cat, done) {
  const byDef = new Map();
  for (const r of done.values()) if (r) byDef.set(r.def, r);
  if (!byDef.size) return;
  for (const r of byDef.values()) {
    const others = [...new Set((cat.units || []).filter(x => x.buyable && x.kind === 'vehicle' && !r.users.includes(x.id) && defOf(ctx, x) === r.def).map(x => x.id))];
    const same = r.users.filter(id => id !== r.id), say = r.notes.slice();
    if (same.length) say.push('one edit for ' + same.join(', ') + ' too (same unit file)');
    if (others.length) say.push('also changes for ' + others.slice(0, 6).join(', ') + (others.length > 6 ? ' and ' + (others.length - 6) + ' more' : '') + ' (same unit file)');
    if (say.length) r.note = say.join('; ');
    delete r.notes;
  }
}
module.exports = { row, notes, defKey };
