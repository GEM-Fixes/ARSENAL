// Prepare sections (gui README, CACHE contract 1, "Prepare sections"): one list from every ext's `prep` array.
//   collect(exts) -> {prep, problems}
//   prep: [{id, ext, title, titles: {en, ru, uk, zh}, needs, areas, games?, state, run, clear?, store?}] in ext order. Each item is a copy
//     of the ext's own object with ext = the ext id, needs and areas as arrays, titles = the title key read from that ext's lang
//     (a language without it takes en, en without it the key).
//   problems: one line per section left out or need dropped (never throws: a bad section of one page must not stop the window).
//     Left out: no id or a bad one (a-z0-9 words joined by dots), an id seen before, no title key, state or run not a function,
//     needs/areas/games not arrays of words, an area modtree does not know. Dropped: a need that names no section, or the section itself.
//   Optional per section (beyond the contract): clear(ctx, q) = the section's own way to forget what it made (things kept in memory);
//     store: [names] = the store sections it fills when they are not named like its id (Clear on its row removes those).
// No requires here: ext/index.js calls this while the ext list is still loading.
// Author: Imperator_Aug (ARSENAL, ia-6fc4d255)
'use strict';
const ID = /^[a-z0-9]+(\.[a-z0-9]+)*$/;
const AREAS = ['set', 'entity', 'map', 'properties', 'interface', 'script', 'text', 'pak', 'other', 'all'];
const LANGS = ['en', 'ru', 'uk', 'zh'];
const words = (a, re) => Array.isArray(a) && a.every(v => typeof v === 'string' && re.test(v));

function why(p, seen) {
  if (!p || typeof p !== 'object') return 'not an object';
  if (typeof p.id !== 'string' || !ID.test(p.id)) return 'id must be a-z0-9 words joined by dots';
  if (seen.has(p.id)) return 'id is used twice';
  if (typeof p.title !== 'string' || !p.title) return 'no title key';
  if (typeof p.state !== 'function' || typeof p.run !== 'function') return 'state and run must be functions';
  if (p.needs !== undefined && !words(p.needs, ID)) return 'needs must be a list of section ids';
  if (p.areas !== undefined && !(words(p.areas, /^[a-z]+$/) && p.areas.every(a => AREAS.includes(a)))) return 'areas must be modtree areas (' + AREAS.join(', ') + ')';
  if (p.games !== undefined && !words(p.games, /^[a-z0-9]+$/)) return 'games must be a list of game ids';
  if (p.clear !== undefined && typeof p.clear !== 'function') return 'clear must be a function';
  if (p.store !== undefined && !words(p.store, /^[a-z0-9.-]+$/)) return 'store must be a list of store section names';
  return '';
}

function collect(exts) {
  const prep = [], problems = [], seen = new Set();
  for (const x of exts || []) {
    if (!x || !Array.isArray(x.prep)) continue;
    for (const p of x.prep) {
      const w = why(p, seen);
      if (w) { problems.push('ext ' + x.id + ': prep section ' + (p && typeof p.id === 'string' ? p.id : '?') + ': ' + w); continue; }
      seen.add(p.id);
      const L = x.lang || {}, titles = {};
      for (const c of LANGS) titles[c] = (L[c] && L[c][p.title]) || (L.en && L.en[p.title]) || p.title;
      prep.push(Object.assign({}, p, { ext: x.id, needs: (p.needs || []).slice(), areas: (p.areas || []).slice(), titles }));
    }
  }
  for (const s of prep) {
    const keep = [];
    for (const n of s.needs) {
      if (n === s.id) problems.push('ext ' + s.ext + ': prep section ' + s.id + ': needs itself');
      else if (!seen.has(n)) problems.push('ext ' + s.ext + ': prep section ' + s.id + ': needs ' + n + ', which no page offers');
      else if (!keep.includes(n)) keep.push(n);
    }
    s.needs = keep;
  }
  return { prep, problems };
}

module.exports = collect;
module.exports.AREAS = AREAS;
