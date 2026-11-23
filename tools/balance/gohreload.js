// BALANCE on Gates of Hell, column reload: the reload time lives in the gun file (resource/set/stuff/<kind>/<gun>), one edit per gun,
// every unit carrying it gets it (as on AS2). Read through the gun's {from} chain (gen lib/gohgun.js chain): the gun's own
// ("reload time" seconds(n)) call -> gen macro op (bytes kept); its own {rechargeTime n} or a value it only inherits -> gen set row
// <root>/rechargeTime in the gun's own file (later wins over the inherited macro [I]). The file goes into the mod folder. [T]
// Author: Imperator_Aug (ARSENAL, ia-069222ef)
'use strict';
const lc = s => String(s == null ? '' : s).toLowerCase();
const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// p: plan row {field 'reload', old, new}; guns: Map gun -> out row (shared across rows)
function row(ctx, O, u, p, guns, out) {
  const w = lc(u.gun && u.gun.weapon); if (!w) { out.skipped.push({ id: u.id, why: 'has no gun' }); return; }
  if (guns.has(w)) { guns.get(w).users.push(u.id); return; }
  let keys = []; try { keys = ctx.keys(new RegExp('^resource/set/stuff/.*/' + reEsc(w) + '$')); } catch (e) { keys = []; }
  // a cannon is in gun/; a small arm in its own folder (mgun, rifle ..): gun/ first
  keys.sort((a, b) => (/\/stuff\/gun\//.test(a) ? 0 : 1) - (/\/stuff\/gun\//.test(b) ? 0 : 1));
  if (!keys.length) { out.skipped.push({ id: u.id, why: 'gun file "' + w + '" not found' }); return; }
  const key = keys[0], text = ctx.read(key).toString('latin1');
  const G = require('../gen/lib/gohgun'), own = G.calls(text).filter(k => !k.inParams && k.name === 'reload time');
  // two or more own calls: which one the game reads is not known, so no guess is written
  if (own.length >= 2) { out.skipped.push({ id: u.id, why: 'gun file "' + w + '" sets its reload time ' + own.length + ' times; change it by hand in ' + key.replace(/^resource\//, '') + ' (which one the game reads is not known)' }); return; }
  let tnote = '';
  if (own.length === 1) require('../gen/lib/ops-unit').opMacro(ctx, { op: 'macro', entity: 'file:' + key, macro: 'reload time', arg: 'seconds', value: p.new });
  else {
    // no own reload time: the gun only inherits it (from its {from} chain); the added rechargeTime wins over it is [I], so the row says [T]
    if (!/\{\s*rechargeTime\b/i.test(text.replace(/;[^\r\n]*/g, ''))) tnote = '[T] the gun only inherits its reload time; a rechargeTime of its own is added, check in game that it is the one used';
    const root = (/^\s*\{\s*([A-Za-z_]\w*)/m.exec(text.replace(/^\s*;.*$/gm, '')) || [])[1] || 'from';
    O.opSet(ctx, { op: 'set', rows: [{ entity: 'file:' + key, path: root + '/rechargeTime', value: String(p.new), op: 'add' }] }, ctx.out);
  }
  const r = { id: w, name: 'gun ' + w, field: 'reload', old: p.old, new: p.new, users: [u.id] };
  if (tnote) r.note = r.tnote = tnote;
  guns.set(w, r); out.rows.push(r);
}
// a gun shared with units outside the selection changes for them too: said in a note
function notes(cat, guns) {
  for (const r of guns.values()) {
    const all = [...new Set((cat.units || []).filter(x => x.buyable && lc(x.gun && x.gun.weapon) === r.id).map(x => x.id))], extra = all.filter(id => !r.users.includes(id));
    if (extra.length) r.note = (r.tnote ? r.tnote + '; ' : '') + 'also changes for ' + extra.slice(0, 6).join(', ') + (extra.length > 6 ? ' and ' + (extra.length - 6) + ' more' : '');
  }
}
module.exports = { row, notes };
