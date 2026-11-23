// unitcard/unit: the game view (lib/vfs) and a light unit resolver for the CLI (the GUI passes its own catalogue record).
//   open({ game, gid, mod }) -> V   V.v = vfs view (game + the mod folder as top layer), V.has(key), V.read(key) -> Buffer|null,
//     V.keys(prefix) -> [key], V.stamp = mtime sum of the mod folder's top files (cache key part), V.gid, V.fam
//   resolve(V, id, over?) -> { id, kind, cls, group, army, def, defKey, portrait, icon, breed, breedKey, structure, hero }
//   armyOf(V) -> Map card id -> army (card files);  defs(V) -> Map def stem -> key (entity/**/<stem>.def)
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-c405e9a6)
'use strict';
const fs = require('fs'), path = require('path');
const K = require('./kinds');

function open(o) {
  const vfs = require('../../lib/vfs');
  const exe = K.exeOf(o.gid);
  const v = vfs.build({ gameDir: o.game, mods: [], exe, modDirs: o.mod ? [o.mod] : [] });
  const memo = {};
  const V = {
    v, gid: o.gid || 'as64', fam: K.family(o.gid), game: o.game, mod: o.mod || null,
    has: k => v.files.has(k),
    rec: k => v.files.get(k) || null,
    read(k) { const r = v.files.get(k); if (!r) return null; try { return vfs.readRec(r); } catch (e) { return null; } },
    keys(pre) { if (!memo.all) memo.all = [...v.files.keys()]; return memo.all.filter(k => k.startsWith(pre)); },
    fromMod(k) { const r = v.files.get(k); return !!(r && o.mod && !/^(base|patch \d+|as64\/core|core)$/i.test(String(r.layer || 'base'))); },
    close() { try { vfs.closeRecs(); } catch (e) { /* ignore */ } },
    memo,
  };
  return V;
}

// def stem -> key, for vehicles (entity/-vehicle/**) and every other entity
function defs(V) {
  if (V.memo.defs) return V.memo.defs;
  const m = new Map();
  for (const k of V.keys('resource/entity/')) { const x = /\/([^/]+)\.def$/.exec(k); if (!x) continue; const s = x[1]; const cur = m.get(s); if (!cur || (/\/-vehicle\//.test(k) && !/\/-vehicle\//.test(cur))) m.set(s, k); }
  return (V.memo.defs = m);
}
const GOH_NATION = { germany: 'ger', ussr: 'rus', usa: 'usa', eng: 'eng', finland: 'fin', generic: '' };
function clsOf(key) {
  const k = String(key || '').toLowerCase();
  if (/\/humanskin\//.test(k)) return 'soldier';
  if (/cannon|\/gun|artillery|mortar|howitzer|\/aa\b|_aa\/|pak\d|zis3|flak/.test(k)) return 'gun';
  if (/marine|boat|ship/.test(k)) return 'boat';
  if (/airborne|plane|aircraft/.test(k)) return 'air';
  if (/\/car\/|truck|bike|moto|jeep|kubel|willys/.test(k)) return 'car';
  return 'tank';
}
// card id -> army, read from the card files: AS2 s(army)/side(army) on the card line, else the (army) suffix of the id;
// GoH units/<period>/units_<army>.set holds the army in its name [V modweb + statsheet units.js]
function armyOf(V) {
  if (V.memo.army) return V.memo.army;
  const m = new Map();
  for (const k of V.keys('resource/set/multiplayer/units/')) {
    if (!/\.set$/.test(k)) continue;
    const b = V.read(k); if (!b) continue;
    const t = b.toString('latin1'), fileArmy = (/units_([a-z0-9]+)\.set$/.exec(k) || [])[1] || '';
    const re = /\{"([^"%]+)"([^\n]*)/g; let x;
    while ((x = re.exec(t))) {
      const id = x[1].toLowerCase(), s = (/\b(?:s|side)\(([a-z0-9]+)\)/.exec(x[2]) || [])[1] || (/\(([a-z0-9]+)\)\s*$/.exec(id) || [])[1] || (/^mp\/([a-z0-9]+)\//.exec(id) || [])[1] || fileArmy;
      if (s && !m.has(id)) m.set(id, s);
    }
  }
  return (V.memo.army = m);
}
// the breed of a soldier card id mp/<army>/<name> -> set/breed/mp/<army>/<name>.set [V]
function breedOf(V, id) {
  const k = 'resource/set/breed/' + String(id).toLowerCase().replace(/^breed:/, '') + '.set';
  if (!V.has(k)) return null;
  const t = (V.read(k) || Buffer.alloc(0)).toString('latin1');
  const val = n => (new RegExp('\\{\\s*' + n + '\\s+"?([^"}\\s]+)"?\\s*\\}', 'i').exec(t) || [])[1] || '';
  return { key: k, portrait: val('portrait').toLowerCase(), icon: val('icon').toLowerCase(), hero: /\{\s*hero\s*\}/i.test(t), nationality: val('nationality').toLowerCase() };
}
// over: fields the caller knows (GUI catalogue record or CLI flags) win over what is read here
function resolve(V, id, over) {
  over = over || {};
  const lid = String(id || '').toLowerCase();
  const army = over.army || armyOf(V).get(lid) || (/\(([a-z0-9]+)\)$/.exec(lid) || [])[1] || (/^mp\/([a-z0-9]+)\//.exec(lid) || [])[1] || '';
  let kind = over.kind || (/^mp\/|^breed:/.test(lid) ? 'soldier' : /\([a-z0-9]+\)$/.test(lid) ? 'squad' : 'vehicle');
  const u = { id: lid, kind, army, def: '', defKey: '', portrait: '', icon: '', breed: '', breedKey: '', structure: '', hero: /hero/.test(lid), cls: '' };
  if (kind === 'vehicle') {
    const stem = String(over.def || lid).toLowerCase().split('/').pop().replace(/\.def$/, '');
    const dk = defs(V).get(stem) || '';
    u.def = stem; u.defKey = dk; u.structure = stem; u.cls = clsOf(dk);
    if (!u.army && V.fam === 'goh') { const n = (/-vehicle\/([a-z]+)\//.exec(dk) || [])[1]; if (n && GOH_NATION[n] != null) u.army = GOH_NATION[n]; }
  } else {
    const br = over.breed || (kind === 'soldier' ? lid : '');
    const b = br ? breedOf(V, br) : null;
    if (b) { u.breed = br.replace(/^breed:/, ''); u.breedKey = b.key; u.portrait = b.portrait; u.icon = b.icon || b.portrait; u.hero = u.hero || b.hero; }
    u.cls = kind;
  }
  for (const f of ['portrait', 'icon', 'def', 'structure', 'cls']) if (over[f]) u[f] = String(over[f]).toLowerCase();
  if (over.hero != null) u.hero = !!over.hero;
  u.group = groupOf(u);
  return u;
}
// the style group: vehicle (tank, car, boat, air), gun, infantry (soldier, squad), hero
function groupOf(u) { return u.hero ? 'hero' : u.kind === 'vehicle' ? (u.cls === 'gun' ? 'gun' : 'vehicle') : 'infantry'; }
// the mod folder's stamp: mtimes of the folders a card touches (interface/scene/<folder>), cheap
function modStamp(mod) {
  if (!mod) return 0;
  let s = 0;
  for (const d of ['', 'resource', 'resource/interface/scene', 'resource/set/multiplayer/units'].concat(['unit_icon', 'unit_icon_small', 'squad', 'portrait', 'portrait_squad', 'structure'].map(f => 'resource/interface/scene/' + f))) {
    try { s += fs.statSync(path.join(mod, d)).mtimeMs; } catch (e) { /* none */ }
  }
  return s;
}
module.exports = { open, resolve, armyOf, defs, breedOf, groupOf, clsOf, modStamp, GOH_NATION };
