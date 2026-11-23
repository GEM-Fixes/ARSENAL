// entcat links: which map record sits in which seat of a structure root, read from the map file (and the mode's .mi)
// through mapkit (tools/lib/sdlx.js strict reader, vfs only). A mapdoc from mapkit now carries the same facts itself
// (entities[].link and entities[].seats, lib/mapkit/links.js): entcat reads the map file here only for an old doc that has
// neither (cli.js, index.js linksFor).
//   linksOf(src, key, {mode?}) -> {parts:{uid: {root, place}}, seats:{rootUid: {place: {unlinked, entity, disable, broken}}},
//     notes:[{code, msg}]}   (entity = the seat's swapped def name or null)
//   The rules are lib/mapkit/links.js (engine citations there). A Link whose host path has more than one seat (a part of a
//   part) or whose part is itself a path is kept out, with note ENTCAT_LINK_NESTED [I]. Map file first, then the .mi: the
//   first Link of a part wins; a .mi seat state replaces the map file's state of the same root and place.
// Author: Imperator_Aug (ARSENAL, ia-7957628c)
'use strict';

const isInt = v => typeof v === 'number' && Number.isInteger(v);

function K() { return require('../lib/mapkit/links'); }
function M() { return require('../lib/mapkit/mapdoc'); }

// one container block (the map's {map} or the .mi's {mission}) and its entity records
function collect(container, records, out) {
  const l = K().linksIn(container);
  for (const n of l.nested) {
    out.notes.push({ code: 'ENTCAT_LINK_NESTED', msg: n.seats === null ? 'link ' + n.text + ': not a plain part uid and one host; not placed'
      : 'link of ' + n.part + ' goes through ' + n.seats + ' seats; not placed' });
  }
  for (const [part, v] of l.parts) if (!out.parts[part]) out.parts[part] = { root: v.root, place: v.place };
  for (const r of records) {
    if (!isInt(r.uid) || !r.block) continue;
    const st = K().seatsOf(r.block);
    if (!st) continue;
    const seats = out.seats[r.uid] || (out.seats[r.uid] = {});
    for (const [p, v] of Object.entries(st)) seats[p] = { unlinked: v.unlinked, entity: v.def, disable: v.disable, broken: v.broken };
  }
}

function linksOf(src, key, o) {
  o = o || {};
  const out = { parts: {}, seats: {}, notes: [] };
  const m = M().readMap(src, key);
  if (m && m.map) collect(m.map, m.records, out);
  if (o.mode) {
    const mi = M().readMode(src, key, o.mode);
    if (mi && mi.mission) collect(mi.mission, mi.records, out);
  }
  return out;
}

module.exports = { linksOf };
