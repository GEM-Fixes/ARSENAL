// checketa: how long the mod check will take (the wizard's "Expected wait"), learnt from the checks this PC ran.
//   rows: [{game, kind, mode, allgames, restorepoints, files, bytes, sec, drive, at}]   game = as64 | mowas2 | goh, kind = as2 | goh,
//     mode = full | fast | noload | fast-noload; the last KEEP rows are kept.
//   estimate(rows, q) -> {sec, basis: 'guess' | 'history', n}   q = {game, kind, mode, allgames, restorepoints, files, drive}
//     history: the rows of the same game (then game kind) and mode, on the same drive first; of those the KEEP_NEAR closest in
//     file count. rate = median seconds per file of them (a row's time made comparable: base taken off, game-build and restore
//     point factors divided out); sec = (BASE + rate x files) x the factors of q. No row: the defaults below (first guess).
//   store(file | null) -> {rows(), add(row)}   file null = memory only (tests). A damaged file starts an empty list.
//   modeOf({fast, noload}), driveOf(dir)
// Defaults: measured on one PC (USB hard disk, 12 cores, 16 GB) with one mod of 112,103 files on disk / 11 GB (93,928 as the shared
// walk counts them: .arsenal, .arsenal-undo, .svn left out), target as64, one game build, no restore points: full 465 s, quick check
// 439 s, skip-load-check 431 s (2026-11-24). Quick + skip-load together, --all-games x 2.2 and restore points x 1.2 are [I].
// No time limit anywhere: an estimate only says what to expect (owner rule: never stop or warn as if failing).
// Author: Imperator_Aug (ARSENAL, ia-2225496f)
'use strict';
const fs = require('fs'), path = require('path');

const KEEP = 50, KEEP_NEAR = 5, BASE = 15, REF_FILES = 93928;
const SEC = { full: 465, fast: 439, noload: 431, 'fast-noload': 186 };   // seconds for REF_FILES files; fast-noload = full x 0.4 [I]
const RATE = {}; for (const k of Object.keys(SEC)) RATE[k] = (SEC[k] - BASE) / REF_FILES;
const F_ALL = 2.2, F_RP = 1.2;
const MODES = Object.keys(SEC);

const modeOf = o => (o && o.fast ? (o.noload ? 'fast-noload' : 'fast') : o && o.noload ? 'noload' : 'full');
function driveOf(dir) {
  if (!dir) return '';
  const r = path.parse(path.resolve(String(dir))).root.replace(/[\\/]+$/, '');
  return /^[a-z]:$/i.test(r) ? r.toUpperCase() : r.toLowerCase();
}
const fac = r => (r.allgames ? F_ALL : 1) * (r.restorepoints ? F_RP : 1);
const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const num = v => (Number.isFinite(+v) && +v >= 0 ? +v : 0);

function estimate(rows, q) {
  const files = num(q.files), mode = MODES.includes(q.mode) ? q.mode : 'full', f = fac(q);
  const ok = (Array.isArray(rows) ? rows : []).filter(r => r && r.mode === mode && r.sec > 0 && r.files > 0);
  const tiers = [r => r.game === q.game && r.drive === q.drive, r => r.kind === q.kind && r.drive === q.drive, r => r.game === q.game, r => r.kind === q.kind];
  for (const t of tiers) {
    const got = ok.filter(t);
    if (!got.length) continue;
    const near = got.map(r => ({ r, d: Math.abs(Math.log((r.files + 1) / (files + 1))) })).sort((a, b) => a.d - b.d).slice(0, KEEP_NEAR).map(x => x.r);
    const rate = median(near.map(r => Math.max(0, r.sec / fac(r) - BASE) / r.files));
    return { sec: Math.round((BASE + rate * files) * f), basis: 'history', n: near.length };
  }
  return { sec: Math.round((BASE + RATE[mode] * files) * f), basis: 'guess', n: 0 };
}

function clean(r) {
  if (!r || typeof r !== 'object') return null;
  const o = { game: String(r.game || ''), kind: String(r.kind || ''), mode: MODES.includes(r.mode) ? r.mode : 'full', allgames: !!r.allgames, restorepoints: !!r.restorepoints,
    files: Math.round(num(r.files)), bytes: Math.round(num(r.bytes)), sec: Math.round(num(r.sec) * 10) / 10, drive: String(r.drive || ''), at: Math.round(num(r.at)) || Date.now() };
  return o.files > 0 && o.sec > 0 ? o : null;
}

function store(file) {
  let rows = [];
  if (file) {
    try { const v = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); if (v && Array.isArray(v.runs)) rows = v.runs.map(clean).filter(Boolean).slice(-KEEP); }
    catch (e) { rows = []; /* none yet, or damaged: start empty */ }
  }
  return {
    file: file || null,
    rows: () => rows.slice(),
    add(r) {
      const c = clean(r); if (!c) return false;
      rows = rows.concat([c]).slice(-KEEP);
      if (file) {
        const tmp = file + '.tmp-' + process.pid;
        try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(tmp, JSON.stringify({ runs: rows }, null, 1)); fs.renameSync(tmp, file); }
        catch (e) { try { fs.unlinkSync(tmp); } catch (x) { /* never made */ } /* kept in memory for this run */ }
      }
      return true;
    },
  };
}

module.exports = { estimate, store, modeOf, driveOf, KEEP, BASE, SEC, RATE, F_ALL, F_RP, MODES };
