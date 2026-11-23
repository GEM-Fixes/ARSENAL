// unitgroups: sorts unit cards into groups by the classes and parameters they share, one card per group gets the in-game test
//   node tools/unitgroups/unitgroups.js --game <install> [--mods a,b] [--out groups.json] [--units] [--top 12] [--exe as64|mowas_2|mowas2]
//   --exe: the AS2 game whose vfs view is read (entityindex build exe): as64 (as64/core mounted) or mowas_2 (MoW:AS2, no as64/core,
//     its own entity index cache). none = the vfs default (as64 when as64.exe is in --game), as before. With --exe and no --game the AS2
//     install comes from lib/games install. --exe goh is refused (exit 2, one line): the reps feed prove pipe runs and GoH has no control
//     pipe; GoH content is grouped as AS2 mods (--layer gohfull)
//   --units: print only the lists for prove, one line per army: <army> <card>,<card>:human
//   --entities [--layer gohfull]: group drivable vehicle entities, guns (class cannon: crew places, calibre band) and infantry (breed: behaviour, primary weapon class, carried weapon classes)
//     instead of cards, for content with no cards yet. run vehicles/guns with prove --add-cards. infantry reps are breed names, they need a squad card first
//     gohfull needs --mods "as64+,gohfull,gohfull_pak,gohfull_fix" (Enhanced-mode mods). all signature fields are [I]: only a game test proves a group behaves alike
// vehicle signature: class folder, root class file, extender set, turret weapon count band, ammo types, locomotion
// squad signature: its soldier classes without army or count. a soldier card is only a squad's content, it can't be bought, so it stays out
// calibre, model, cost and names stay out. a shared signature says the engine runs the same code on the same kinds of data [I]
// a per-unit data fault inside a group shows only on a per-card spawn run
// Author: Imperator_Aug (ARSENAL, ia-78808c30)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');

const ARMIES = ['rus', 'ger2', 'ger', 'usa', 'eng', 'jap', 'ost', 'ita', 'fin', 'hun', 'rom', 'pol', 'fra', 'axis', 'allies'];
const COMMON = 'resource/set/multiplayer/units/common.set';
const base = p => String(p).split('/').pop().replace(/\.\w+$/, '');
const uniq = a => [...new Set(a)].sort();
const band = n => (n > 2 ? '3+' : String(n));

// raw cards from the parsed {units ...} block. helpers come from the shared SDL reader, so macros and includes are already expanded
function readCards(src, ix) {
  const lc = s => String(s).toLowerCase();
  const tok = t => (t.k === 'STRING' || t.k === 'INTEGER' || t.k === 'FLOAT' ? t.value : t.text);
  const nameOf = b => { const t = b.items && b.items.find(i => i.k !== 'BLOCK'); return t ? tok(t) : null; };
  const argStr = b => (b.items || []).filter(i => i.k !== 'BLOCK').slice(1).map(tok).join(' ');
  const r = src.read({ key: COMMON, file: COMMON, get: () => src.get(COMMON) }, () => {});
  const u = r && r.root.items.find(i => i.k === 'BLOCK');
  if (!u) return [];
  return ix.kids(u).map(b => {
    const f = n => { const k = ix.kids(b).find(c => lc(nameOf(c) || '') === n); return k ? argStr(k) : null; };
    const card = String(nameOf(b) || '');
    return { card, tags: String(f('tags') || '').split(/\s+/).filter(Boolean), content: String(f('content') || ''), breed: f('breed') !== null };
  }).filter(c => c.card);
}
// "ammo bullet76 ap" -> ap. a bare ammo name has no type word
function ammoType(v) {
  const w = String(v).trim().split(/\s+/);
  return w.length > 1 ? w[w.length - 1] : 'plain';
}
// mp/rus/flamer:1 -> flamer. the last digit run of a soldier name is a rank or uniform variant of the same class
function soldierClasses(content) {
  return uniq([...String(content).matchAll(/mp\/[^/\s]+\/([\w-]+)/g)].map(m => m[1].replace(/\d+[a-z]?$/, '')));
}
function signature(c, rec) {
  const tags = c.tags.filter(t => !ARMIES.includes(t));
  if (!rec) return { kind: 'human', sig: ['squad', soldierClasses(c.content).join('+'), uniq(tags.filter(t => !/^(all|man|infantry|frontline_cp)$/.test(t))).join('+')].join('|') };
  const refs = k => rec.refs.filter(r => r[0] === k).map(r => r[1]);
  const inh = (rec.inherits || []).filter(k => !/selection\//.test(k)).map(base);
  const dirs = rec.key.split('/'), at = dirs.findIndex(d => d.startsWith('-'));
  const folder = at >= 0 ? dirs.slice(at, at + 2).join('/') : dirs.slice(-3, -1).join('/');
  const weapons = uniq(refs('weapon')), ammo = uniq(refs('item').filter(v => /^ammo /i.test(v)).map(ammoType));
  const loco = uniq((rec.ev || []).filter(e => e[0] === 'loco').map(e => String(e[3] && e[3].type || 'loco')));
  return { kind: 'vehicle', sig: [folder, inh[0] || '', uniq(rec.extenders || []).join('+'), 'w' + band(weapons.length), ammo.join('+'), loco.join('+')].join('|') };
}
// lookup(name) -> entity rec or undefined. soldiers drop out. a card repeated counts once, the last wins as the game's merge does
function group(cards, lookup) {
  const byCard = new Map();
  for (const c of cards) if (!c.breed && !/^mp\//.test(c.card)) byCard.set(c.card, c);
  const groups = new Map();
  for (const c of byCard.values()) {
    // a hero card is named apart from the vehicle it brings: the first word of its content is that vehicle
    const first = lookup(String(c.content).split(/[\s(]/)[0]), rec = lookup(c.card) || (first && /\/-vehicle\//.test(first.key) ? first : undefined), s = signature(c, rec);
    if (!groups.has(s.sig)) groups.set(s.sig, { sig: s.sig, kind: s.kind, members: [] });
    groups.get(s.sig).members.push({ card: c.card, armies: uniq(c.tags.filter(t => ARMIES.includes(t))), sold: c.tags.includes('all') });
  }
  const out = [...groups.values()].sort((a, b) => b.members.length - a.members.length || (a.sig < b.sig ? -1 : 1));
  for (const g of out) g.members.sort((a, b) => (a.card < b.card ? -1 : 1));
  chooseReps(out);
  return { cards: byCard.size, groups: out };
}
// the host pins one army per game: take reps from the army covering the most groups still open, so as few games as can be
function chooseReps(gs) {
  const open = new Set(gs);
  while (open.size) {
    const n = {};
    for (const g of open) for (const a of uniq(g.members.flatMap(m => m.armies))) n[a] = (n[a] || 0) + 1;
    const best = Object.keys(n).sort((a, b) => n[b] - n[a] || (a < b ? -1 : 1))[0];
    if (!best) { for (const g of open) { g.rep = g.members[0].card; g.army = ''; } break; }
    for (const g of [...open]) {
      // a card with no `all` tag isn't on sale under the test preset, so it can't be a rep unless nothing else is left
      const m = g.members.find(x => x.armies.includes(best) && x.sold) || g.members.find(x => x.armies.includes(best));
      if (m) { g.rep = m.card; g.army = best; open.delete(g); }
    }
  }
}
// drivable vehicles: actor type, no wreck (x) or base folders. the faction folder of a GoH tree stays out of the signature
const CLASSES = ['tank_heavy', 'tank_medium', 'tank_light', 'btr', 'cannon', 'car', 'airborne', 'marine', 'train'];
// a GoH ammo name holds its calibre or magazine: keep what the engine treats differently, shell types and small arms
function ammoClass(v) {
  const w = ammoType(v).toLowerCase();
  if (/^(ap|apcr|apds|apbc|aphe|hvap)/.test(w)) return 'ap';
  if (/^(heat|hc)/.test(w)) return 'heat';
  if (/^(he|fg|frag|shrapnel)/.test(w)) return 'he';
  if (/smoke/.test(w)) return 'smoke';
  if (/flame|fire|fuel/.test(w)) return 'flame';
  return 'small';
}
// looks and voice, no part in what a test can catch
const COSMETIC = /^(detail|talk|enumerator)$/;
// gun calibre band from the first ammo item (bullet120 fg) or else a weapon name with NNmm (120mm_l50): the digits are mm [I]. none -> x
function calibreBand(rec) {
  const refs = k => rec.refs.filter(r => r[0] === k).map(r => String(r[1]));
  const s = [...refs('item').filter(v => /^(ammo|bullet|shell)/i.test(v)).map(v => (v.match(/(\d{2,3})/) || [])[1]), ...refs('weapon').map(v => (v.match(/(\d{2,3})mm/i) || [])[1])].find(Boolean);
  if (!s) return 'x';
  const mm = +s;
  return mm <= 45 ? 'c<=45' : mm <= 88 ? 'c46-88' : 'c89+';
}
// crew places of an entity tree: distinct `place` names under any `placer` block, includes already expanded [I]
function crewPlaces(tree, ix) {
  const out = new Set();
  const walk = b => { for (const c of ix.kidsOf(b)) { const n = String(ix.nameOf(c) || '').toLowerCase(); if (n === 'placer') for (const p of ix.kidsOf(c)) { if (String(ix.nameOf(p) || '').toLowerCase() === 'place' && ix.str0(p)) out.add(ix.str0(p).toLowerCase()); } else walk(c); } };
  const top = [...ix.kidsOf(tree)][0];
  if (top) walk(top);
  return out.size;
}
// a built unit (goh2as2/vol builds) sits at entity/<rep>/<rep>.def, no -vehicle/<class>/ folders: its class comes from the root
// properties file instead (cannon*.ext, tank.ext, tank_unarmed.ext, car.ext, armoredcar.ext) [I]
const isBuilt = key => { const p = key.split('/'), i = p.lastIndexOf('entity'); return i >= 0 && p.length === i + 3 && p[i + 2].toLowerCase() === p[i + 1].toLowerCase() + '.def'; };
const isVehicleKey = key => /\/-vehicle\//.test(key) || isBuilt(key);
function rootClass(rec) {
  const r = (rec.inherits || []).filter(k => !/selection\//.test(k)).map(base)[0] || '';
  return /^cannon/.test(r) ? 'cannon' : /^tank_unarmed/.test(r) ? 'btr' : /^tank/.test(r) ? 'tank' : /^(armoredcar|car)$/.test(r) ? 'car' : 'other';
}
function entitySig(rec) {
  const dirs = rec.key.split('/'), cls = CLASSES.find(c => dirs.includes(c)) || (isBuilt(rec.key) ? rootClass(rec) : 'other');
  const refs = k => rec.refs.filter(r => r[0] === k).map(r => r[1]);
  if (cls === 'cannon') {
    const root = (rec.inherits || []).filter(k => !/selection\//.test(k)).map(base)[0] || '';
    return ['cannon', root, uniq(rec.extenders || []).filter(x => !COSMETIC.test(x)).join('+'), 'crew' + (rec.crew === undefined ? '?' : rec.crew), calibreBand(rec), 'w' + band(uniq(refs('weapon')).length), uniq(refs('item').filter(v => /^(ammo |bullet|shell)/i.test(v)).map(ammoClass)).join('+')].join('|');
  }
  const root = (rec.inherits || []).filter(k => !/selection\//.test(k)).map(base)[0] || '';
  const ammo = uniq(refs('item').filter(v => /^ammo /i.test(v)).map(ammoClass)).sort();
  const loco = uniq((rec.ev || []).filter(e => e[0] === 'loco').map(e => String(e[3] && e[3].type || 'loco')));
  return [cls, root, uniq(rec.extenders || []).filter(x => !COSMETIC.test(x)).join('+'), 'w' + band(uniq(refs('weapon')).length), ammo.join('+'), loco.join('+')].join('|');
}
function groupEntities(recs, layer) {
  const groups = new Map();
  let n = 0;
  for (const rec of recs) {
    if (!isVehicleKey(rec.key) || !/\.def$/.test(rec.key)) continue;
    if (!rec.etype || String(rec.etype[0]).toLowerCase() !== 'actor' || /\/(x|generic|placeholder)\//.test(rec.key)) continue;
    if (layer && !String(rec.layer).startsWith(layer)) continue;
    const sig = entitySig(rec);
    if (!groups.has(sig)) groups.set(sig, { sig, kind: sig.startsWith('cannon|') ? 'gun' : 'vehicle', members: [] });
    groups.get(sig).members.push({ card: rec.name, armies: [] });
    n++;
  }
  const out = [...groups.values()].sort((a, b) => b.members.length - a.members.length || (a.sig < b.sig ? -1 : 1));
  for (const g of out) { g.members.sort((a, b) => (a.card < b.card ? -1 : 1)); g.rep = g.members[0].card; g.army = ''; }
  return { cards: n, groups: out };
}
// infantry: one human def + skeleton for every soldier here, so the class comes from the breed: behaviour, hero/kamikaze, primary weapon class, carried weapon classes
// stuff folder -> class. only weapon folders count; ammo, medkits, grenades, tools and armour are on every soldier [I]
const WEAPON_DIRS = /^(rifle|smg|mgun|pistol|bazooka|mortar|flame|explosive)$/;
function breedSig(b) {
  return ['human', b.behaviour || 'soldier', b.hero ? 'hero' : '', b.kamikaze ? 'kamikaze' : '', 'in:' + (b.prim || '-'), 'has:' + uniq(b.carry || []).join('+'), b.skinOk === false ? 'noskin' : ''].join('|');
}
function groupHumans(breeds) {
  const groups = new Map();
  for (const b of breeds) {
    const sig = breedSig(b);
    if (!groups.has(sig)) groups.set(sig, { sig, kind: 'infantry', members: [] });
    groups.get(sig).members.push({ card: b.name, armies: [] });
  }
  const out = [...groups.values()].sort((a, b) => b.members.length - a.members.length || (a.sig < b.sig ? -1 : 1));
  // rep: a multiplayer breed first, they are the ones squad cards point at; then by name
  for (const g of out) { g.members.sort((a, b) => (/^mp\//.test(a.card) === /^mp\//.test(b.card) ? (a.card < b.card ? -1 : 1) : /^mp\//.test(a.card) ? -1 : 1)); g.rep = g.members[0].card; g.army = ''; }
  return { cards: breeds.length, groups: out };
}
// breeds of the mounted source: file `set/breed/**` -> { name, behaviour, hero, kamikaze, prim, carry, skinOk }. layer filter by the winning layer
function readBreeds(src, keys, idx, ix, layer) {
  const cls = new Map();
  const classOf = tags => {
    if (cls.has(tags)) return cls.get(tags);
    const m = idx.stuffMatch(tags)[0], c = m ? m.split('/')[3] : null;
    cls.set(tags, c); return c;
  };
  const out = [];
  for (const key of [...keys].sort()) {
    if (!key.startsWith('resource/set/breed/') || /\/\.|\.inc$/.test(key)) continue;
    if (layer) { const r = src.v && src.v.files.get(key); if (!(src.local.has(key) ? 'folder' : r && r.layer || '').startsWith(layer)) continue; }
    const p = ix.parseKey(src, key);
    if (!p) continue;
    const top = [...ix.kidsOf(p.tree)][0];
    if (!top || String(ix.nameOf(top) || '').toLowerCase() !== 'breed') continue;
    const b = { name: key.slice('resource/set/breed/'.length).replace(/\.\w+$/, ''), carry: [] };
    for (const c of ix.kidsOf(top)) {
      const n = String(ix.nameOf(c) || '').toLowerCase(), a = ix.argsOf(c)[0], v = a ? (a.value !== undefined ? a.value : a.text) : null;
      if (n === 'behaviour') b.behaviour = String(v);
      else if (n === 'hero') b.hero = v === undefined || v === null || String(v) !== '0';
      else if (n === 'tags') b.kamikaze = ix.argsOf(c).some(t => String(t.value !== undefined ? t.value : t.text).toLowerCase() === 'kamikaze');
      else if (n === 'skin') b.skinOk = idx.byName(String(v)).length > 0;
      else if (n === 'inventory') {
        const items = [...ix.kidsOf(c)].filter(k => String(ix.nameOf(k) || '').toLowerCase() === 'item');
        const cl = items.map(k => classOf(ix.str0(k) || ''));
        for (const x of cl) if (x && WEAPON_DIRS.test(x)) b.carry.push(x);
        const ih = [...ix.kidsOf(c)].find(k => String(ix.nameOf(k) || '').toLowerCase() === 'in_hands'), ia = ih && ix.argsOf(ih)[0];
        const i = ia ? +(ia.value !== undefined ? ia.value : ia.text) : -1;
        b.prim = i >= 0 && cl[i] ? cl[i] : (cl.find(x => x && WEAPON_DIRS.test(x)) || '-');
      }
    }
    out.push(b);
  }
  return out;
}
function byArmy(r) {
  const a = {};
  for (const g of r.groups) (a[g.army || '?'] = a[g.army || '?'] || []).push(g.rep + (g.kind === 'human' ? ':human' : ''));
  return a;
}
module.exports = { isBuilt, rootClass, readCards, signature, soldierClasses, group, groupEntities, entitySig, byArmy, groupHumans, breedSig, readBreeds, crewPlaces, calibreBand };
if (require.main === module) {
  const a = {}, argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) { const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) a[argv[i].slice(2)] = true; else { a[argv[i].slice(2)] = n; i++; } } }
  const games = require('../lib/games');
  let exe;
  if (a.exe !== undefined) {
    const g = games.get(a.exe === true ? '' : a.exe);
    if (!g) { console.error('--exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); }
    if (g.id === 'goh') games.refuse('unitgroups', 'goh', 'the group reps feed prove pipe runs and GoH has no control pipe; group GoH content as AS2 mods (--entities --layer gohfull)', 'modweb/testing/goh-drive.md');
    exe = g.exe;
    if (!a.game) a.game = games.install(g.id).dir || undefined;
  }
  if (!a.game) { console.error('usage: unitgroups.js --game <install> [--mods a,b] [--out groups.json] [--units] [--top 12] [--exe as64|mowas_2]'); process.exit(2); }
  const ix = require('../entityindex/index.js');
  const { idx, src, keys } = ix.build({ gameDir: a.game, mods: a.mods ? String(a.mods).split(',') : [], ...(exe ? { exe } : {}) });
  const layer = a.layer === true ? '' : a.layer;
  let r;
  if (a.entities) {
    // guns need their crew places from the expanded tree, so the cannon recs get it first
    const recs = Object.values(idx.entities);
    for (const rec of recs) if (isVehicleKey(rec.key) && (/\/cannon\//.test(rec.key) || (isBuilt(rec.key) && rootClass(rec) === 'cannon')) && !/\/(x|generic|placeholder)\//.test(rec.key) && (!layer || String(rec.layer).startsWith(layer))) { const p = ix.parseKey(src, rec.key); if (p) rec.crew = crewPlaces(p.tree, ix); }
    const v = groupEntities(recs, layer), h = groupHumans(readBreeds(src, keys, idx, ix, layer));
    r = { cards: v.cards + h.cards, groups: [...v.groups, ...h.groups].sort((x, y) => y.members.length - x.members.length || (x.sig < y.sig ? -1 : 1)) };
  } else r = group(readCards(src, ix), n => idx.byName(n)[0]);
  if (a.out) { fs.mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true }); fs.writeFileSync(a.out, JSON.stringify(r, null, 1)); }
  const armies = byArmy(r);
  if (a.units) { for (const [k, v] of Object.entries(armies)) console.log(k + ' ' + v.join(',')); process.exit(0); }
  const kn = k => r.groups.filter(g => g.kind === k).length;
  console.log(`${r.cards} cards, ${r.groups.length} groups, ${kn('vehicle')} vehicle ${kn('gun')} gun ${kn('infantry')} infantry ${kn('human')} squad`);
  for (const [k, v] of Object.entries(armies)) console.log(`${k}: ${v.length}`);
  for (const g of r.groups.slice(0, +(a.top || 12))) console.log(String(g.members.length).padStart(4) + ' ' + g.rep.padEnd(26) + g.sig.slice(0, 110));
}
