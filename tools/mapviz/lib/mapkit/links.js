// mapkit links: structure links of one map or .mi container, for mapdoc entities[].link and entities[].seats (README 3.2,
// additive in mapdoc/1) and for entcat/links.js.
//   Engine [V]: {Link <part uid> {<root uid> "<place>" ..}} puts the part on the root's seat (,
//   766-776 ); a seat whose def names a part spawns it unless the seat is {Unlinked} and no record is linked
//   to it ( SpawnOccupant, 619-656 State); {State "p" {Entity "d"}} swaps the
//   part's def. {Link a b} with a plain uid host is a boarding link, not a seat: left out. A Link whose part is not a plain
//   uid or whose host path has more than one seat (a part of a part) is not placed [I]: it goes to `nested`.
//   linksIn(container) -> {parts: Map(partUid -> {root, place}) (first Link of a part wins, file order),
//     nested: [{part, seats, text}]}
//   seatsOf(record block) -> {place: {unlinked, def, disable, broken}} | null   (the record's {Placer {State ..}} blocks;
//     def = the {Entity "d"} swap as a lower-case def name, else null; null when the record has no State)
//   attach(rows, records, links) -> rows   mapdoc rows of one container: row.link = {root, place} on a linked part,
//     row.seats = {place: {unlinked, entity: uid of the record linked to that seat | null, def}} on a root with states
// Author: Imperator_Aug (ARSENAL, ia-0dc25047)
'use strict';
const S = require('./sdl');

const lc = s => String(s == null ? '' : s).toLowerCase();
const isInt = v => typeof v === 'number' && Number.isInteger(v);
const defName = s => lc(s).replace(/\\/g, '/').replace(/\.def$/, '').split('/').pop();

function linksIn(container) {
  const out = { parts: new Map(), nested: [] };
  if (!container) return out;
  for (const b of S.kids(container, 'link')) {
    const w = S.words(b), host = S.blocks(b);
    const part = w[1];
    if (!isInt(part) || host.length !== 1) { out.nested.push({ part: isInt(part) ? part : null, seats: null, text: S.text(b).slice(0, 120) }); continue; }
    const hw = S.words(host[0]);
    if (!isInt(hw[0]) || hw.length < 2) continue;   // {Link a b}: a plain uid host is a boarding link, not a seat
    if (hw.length > 2) { out.nested.push({ part, seats: hw.length - 1, text: S.text(b).slice(0, 120) }); continue; }
    if (!out.parts.has(part)) out.parts.set(part, { root: hw[0], place: lc(hw[1]) });
  }
  return out;
}

function seatsOf(block) {
  if (!block) return null;
  let seats = null;
  for (const pl of S.kids(block, 'placer')) {
    for (const st of S.kids(pl, 'state')) {
      const role = S.words(st)[1];
      if (role === undefined) continue;
      const v = { unlinked: false, def: null, disable: false, broken: false };
      for (const c of S.blocks(st)) {
        const k = S.head(c);
        if (k === 'unlinked') v.unlinked = true;
        else if (k === 'disable') v.disable = true;
        else if (k === 'broken') v.broken = true;
        else if (k === 'entity') { const e = S.words(c)[1]; if (e !== undefined) v.def = defName(e); }
      }
      (seats || (seats = {}))[lc(role)] = v;
    }
  }
  return seats;
}

function attach(rows, records, links) {
  const occupant = new Map();   // root + "\n" + place -> part uid (first Link in file order)
  for (const [part, l] of links.parts) {
    const k = l.root + '\n' + l.place;
    if (!occupant.has(k)) occupant.set(k, part);
  }
  const linked = new Set();
  for (let q = 0; q < rows.length; q++) {
    const row = rows[q], r = records[q];
    if (isInt(row.uid) && links.parts.has(row.uid) && !linked.has(row.uid)) {
      const l = links.parts.get(row.uid);
      row.link = { root: l.root, place: l.place };
      linked.add(row.uid);
    }
    const st = seatsOf(r && r.block);
    if (st) {
      const seats = {};
      for (const p of Object.keys(st)) {
        const occ = isInt(row.uid) ? occupant.get(row.uid + '\n' + p) : undefined;
        seats[p] = { unlinked: st[p].unlinked, entity: occ === undefined ? null : occ, def: st[p].def };
      }
      row.seats = seats;
    }
  }
  return rows;
}

module.exports = { linksIn, seatsOf, attach };
