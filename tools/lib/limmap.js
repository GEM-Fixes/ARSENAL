// limmap: finding code -> limits rows, and limits row -> class. Reads tools/lib/limmap/*.json (limmap/1) and tools/lib/limclass/*.json (limclass/1).
// Author: Imperator_Aug (ARSENAL, ia-eb8b8a87)
//   limmap/1   {form, part, codes:{CODE:{tool, sev, lim:[ids]|null, kind:'tool', new:{area,row}, open:'..', at, class, why}}}
//   limclass/1 {form, area, rows:{ID:{chk:'built'|'todo'|'never'|null, class, why, tool, how, never}}, dead:[{row, tool, code, fix:null|{code, why}}]}
//   Files are filled while in use: "lim": null, "class": null, a bad or half-written file = unknown, never a throw (bad files listed in .errors).
// API: limitOf(code) -> {lim:[ids], kind:'tool'|null, class:str|null} or null (code in no part file)
//      rowClass(id) -> class or null ; stats() -> {codes, withLim, toolKind, proposed, open, notDone, rows, rowsClassed,
//      chk:{built, todo, never, notDone}, dead, deadFixed} ; codes() / rowIds() sorted ; entry(code) / row(id) raw (copies)
//      load({mapDir, classDir}) -> fresh instance with the same API (tests pass fixture folders) ; reset() drops the default cache
// Files read in name order; a code in two part files: the first entry that is done (lim, kind, new or open) wins. Lists sorted, no dates.
'use strict';
const fs = require('fs'), path = require('path');

const DIR_MAP = path.join(__dirname, 'limmap'), DIR_CLASS = path.join(__dirname, 'limclass');
const ID_RE = /^[A-Z][A-Z0-9]*-\d+$/;
// natural sort for row ids: area, then number (MIS-8 before MIS-10)
const idCmp = (a, b) => {
  const ma = /^(.*)-(\d+)$/.exec(a), mb = /^(.*)-(\d+)$/.exec(b);
  if (ma && mb && ma[1] === mb[1]) return +ma[2] - +mb[2];
  return a < b ? -1 : a > b ? 1 : 0;
};
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = x => typeof x === 'string' && x ? x : null;
const limList = x => {
  const a = Array.isArray(x) ? x : typeof x === 'string' ? [x] : [];
  return [...new Set(a.filter(s => typeof s === 'string' && ID_RE.test(s.trim())).map(s => s.trim()))].sort(idCmp);
};
const done = e => limList(e.lim).length > 0 || e.kind === 'tool' || isObj(e.new) || !!str(e.open);

function readJson(dir, form, errors) {
  let names = [];
  try { names = fs.readdirSync(dir).filter(n => /\.json$/i.test(n)).sort(); } catch { return []; }
  const out = [];
  for (const n of names) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8').replace(/^﻿/, '')); } catch (e) { errors.push(n + ': ' + e.message); continue; }
    if (!isObj(j) || j.form !== form) { errors.push(n + ': form is not ' + form); continue; }
    out.push([n, j]);
  }
  return out;
}

function load(opt = {}) {
  const errors = [];
  const codes = new Map(), rows = new Map(), dead = [];
  for (const [, j] of readJson(opt.mapDir || DIR_MAP, 'limmap/1', errors)) {
    if (!isObj(j.codes)) continue;
    for (const [code, e] of Object.entries(j.codes)) {
      if (!isObj(e)) continue;
      const had = codes.get(code);
      if (!had || (!done(had) && done(e))) codes.set(code, e);
    }
  }
  for (const [, j] of readJson(opt.classDir || DIR_CLASS, 'limclass/1', errors)) {
    if (isObj(j.rows)) for (const [id, r] of Object.entries(j.rows)) if (isObj(r) && (!rows.has(id) || (!str(rows.get(id).class) && str(r.class)))) rows.set(id, r);
    if (Array.isArray(j.dead)) for (const d of j.dead) if (isObj(d)) dead.push(d);
  }

  const limitOf = code => {
    const e = codes.get(code);
    if (!e) return null;
    return { lim: limList(e.lim), kind: e.kind === 'tool' ? 'tool' : null, class: str(e.class) };
  };
  const rowClass = id => { const r = rows.get(id); return r ? str(r.class) : null; };
  const stats = () => {
    const s = { codes: codes.size, withLim: 0, toolKind: 0, proposed: 0, open: 0, notDone: 0, rows: rows.size, rowsClassed: 0,
      chk: { built: 0, todo: 0, never: 0, notDone: 0 }, dead: dead.length, deadFixed: 0 };
    for (const e of codes.values()) {
      if (limList(e.lim).length) s.withLim++;
      else if (e.kind === 'tool') s.toolKind++;
      else if (isObj(e.new)) s.proposed++;
      else if (str(e.open)) s.open++;
      else s.notDone++;
    }
    for (const r of rows.values()) {
      if (str(r.class)) s.rowsClassed++;
      if (r.chk === 'built' || r.chk === 'todo' || r.chk === 'never') s.chk[r.chk]++; else s.chk.notDone++;
    }
    for (const d of dead) if (isObj(d.fix)) s.deadFixed++;
    return s;
  };
  const copy = x => x ? JSON.parse(JSON.stringify(x)) : null;
  return {
    limitOf, rowClass, stats, errors,
    codes: () => [...codes.keys()].sort(),
    rowIds: () => [...rows.keys()].sort(idCmp),
    entry: c => copy(codes.get(c)), row: id => copy(rows.get(id)),
  };
}

let DEF = null;
const def = () => DEF || (DEF = load());
module.exports = {
  load, idCmp,
  limitOf: c => def().limitOf(c), rowClass: id => def().rowClass(id), stats: () => def().stats(),
  codes: () => def().codes(), rowIds: () => def().rowIds(), entry: c => def().entry(c), row: id => def().row(id),
  errors: () => def().errors.slice(),
  reset: () => { DEF = null; },
};
