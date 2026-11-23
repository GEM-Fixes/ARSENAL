#!/usr/bin/env node
// KILLPROOF re-score: judge the kills of finished edrun runs again by the proof rule (edrun.js proofOf), no game.
//   node tools/edrun/rescore.js --list <run-list.txt>... [--write] [--json out.json]
//   node tools/edrun/edrun.js --rescore <out dir> --pairs f.json [--per-game N] [--free-fire] [--write]
// A run list holds edrun command lines (--pairs P ... --out D, paths relative to src/); dirs beside D whose name starts with D's name (D-crash, D-b) reuse its pairs.
// For each out dir: pairs file -> chunks of --per-game (default 8) -> report rows of that chunk (old reports: rowsOf rows then held rows; REVHARNESS: pair order with row.game = report.games index, null = all held; matched by name either way) -> the game log of that chunk -> proofOf.
// A kill stays counted only if it was counted before AND its proof is muzzle or damage. report.json is never changed; --write puts report.rescore.json beside it (same shape, rows with
// proof, killVerdict, oldCounted, proofSrc, orderLife, orderExpired). Old runs had one 120 game s order (no re-issue): orderExpired = kill game s past that.
// proofSrc 'log' = log order; 'row' = log missing or log names do not fit the ids: the row's own counts judge (shots > 0 muzzle, a non-death hit kind damage), whole game, weaker
// Author: Imperator_Aug (ARSENAL, ia-7b7b7bbb)
const fs = require('fs'), path = require('path');
const e = require('./edrun.js');
const SRC = path.resolve(__dirname, '../..');
const { killCounts } = require('../score/score.js');   // the scorers' kill: counted and not a zero-shot row
const oldKill = r => killCounts({ ...r, counted: r.oldCounted });
const heldOf = p => p.held === true || (!!p.preflight && p.order == null && p.kill == null && p.verdict === p.preflight.status && p.verdict !== 'PASS');
// the order life the run had: before KILLPROOF one order of orderTime (120) game s; reorder kept ordering; free fire / move: none
const oldLifeOf = p => (p.noorder || p.move || !p.foe) ? null : p.reorder ? Infinity : (p.orderTime || e.ORDER_TIME);
const MUZ = /^0\.2\/1-/;
function rowProof(r) {
  if (!r.kill && r.kill !== 0) return null;
  if ((+r.shots || 0) > 0) return 'muzzle';
  const ks = Object.keys(r.hitKinds || {}).filter(h => !MUZ.test(h));
  if (ks.some(h => !e.isDeathKind(h))) return 'damage';
  return ks.length ? 'deathblast' : 'none';
}
function rescoreDir(dir, pairsFile, opt = {}) {
  const repF = path.join(dir, 'report.json');
  if (!fs.existsSync(repF)) return null;
  const rep = JSON.parse(fs.readFileSync(repF, 'utf8'));
  let pairs = JSON.parse(fs.readFileSync(pairsFile, 'utf8'));
  pairs = e.freeFireAll(pairs, !!opt.freeFire);
  const PER = opt.perGame || e.MAX_PAIRS, rows = rep.pairs.map(r => ({ ...r })), notes = [];
  let at = 0, g = 0;
  for (let i = 0; i < pairs.length; i += PER) {
    const chunk = pairs.slice(i, i + PER), part = rows.slice(at, at + chunk.length);
    at += chunk.length;
    const run = part.filter(r => !heldOf(r));
    if (!run.length) continue;
    const game = (rep.games || [])[g++] || {}, byName = Object.fromEntries(chunk.map(p => [p.name, p]));
    const runPairs = run.map(r => byName[r.name]).filter(Boolean);
    if (runPairs.length !== run.length) notes.push(`game ${g - 1}: rows do not fit the pairs file`);
    const logF = game.log ? path.join(dir, game.log) : null, text = logF && fs.existsSync(logF) ? fs.readFileSync(logF, 'latin1') : null;
    const pf = text ? e.proofOf(text, runPairs, rep.runId || null) : {}, ticks = text ? e.tickOf(text, rep.runId || null) : {};
    if (!text) notes.push(`game ${g - 1}: no log ${game.log || '?'}`);
    for (const r of run) {
      const p = byName[r.name];
      if (!p) continue;
      r.oldCounted = r.counted;
      let pr = pf[p.name], src = 'log';
      if (!pr || !pr.idsOk) { pr = { proof: rowProof(r) }; src = 'row'; }
      const tO = ticks[p.name + ' order'], tK = ticks[p.name + ' kill'];
      if (typeof tO === 'number' && typeof tK === 'number') r.killGameS = tK - tO;
      else if (r.killGameS === undefined && typeof r.gameS === 'number') r.killGameS = r.gameS;
      e.applyProof(r, p, pr, oldLifeOf(p));
      if ('proof' in r) r.proofSrc = src;
    }
  }
  if (at !== rows.length) notes.push(`rows ${rows.length}, pairs file gives ${at}`);
  const fire = rows.filter(r => r.oldCounted !== undefined && !r.control);
  const totals = { oldKills: fire.filter(oldKill).length, newKills: fire.filter(killCounts).length, proof: {}, src: {}, expired: fire.filter(r => r.orderExpired && oldKill(r)).length };
  for (const r of fire) if (oldKill(r)) { totals.proof[r.proof || '-'] = (totals.proof[r.proof || '-'] || 0) + 1; totals.src[r.proofSrc || '-'] = (totals.src[r.proofSrc || '-'] || 0) + 1; }
  const ctl = rows.filter(r => r.control && oldKill(r));
  totals.controls = { old: ctl.length, new: ctl.filter(killCounts).length };
  // MB-R1 (owed:49): games whose control voids them, before (old counted) and after (new proof) by edrun's controlsOf rule; rows grouped by game index (old reports: chunk order)
  const byGame = {};
  rows.forEach((r, k) => { const gi = r.game !== undefined && r.game !== null ? r.game : Math.floor(k / PER); (byGame[gi] = byGame[gi] || []).push(r); });
  const voidOf = (rs, useOld) => { const c = e.controlsOf(rs.map(r => (useOld ? { ...r, counted: r.oldCounted !== undefined ? r.oldCounted : r.counted } : r))); return c.void === true; };
  const gs = Object.values(byGame).filter(rs => rs.some(r => r.control));
  totals.voidGames = { games: gs.length, old: gs.filter(rs => voidOf(rs, true)).length, new: gs.filter(rs => voidOf(rs, false)).length };
  const out = { ...rep, pairs: rows, rescore: { rule: 'KILLPROOF: kill counted only with muzzle or damage proof', pairsFile, perGame: PER, freeFire: !!opt.freeFire, totals, notes } };
  if (opt.write) fs.writeFileSync(path.join(dir, 'report.rescore.json'), JSON.stringify(out, null, 1) + '\n');
  return out;
}
// run list -> [{dir, pairs, perGame, freeFire}] (the run's own dir and its suffixed reruns)
function listOf(file) {
  const out = [];
  for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const pm = /--pairs (\S+)/.exec(l), om = /--out (\S+)/.exec(l);
    if (!pm || !om) continue;
    const pg = /--per-game (\d+)/.exec(l), dir = path.resolve(SRC, om[1]), pairs = path.resolve(SRC, pm[1]);
    const base = path.basename(dir), parent = path.dirname(dir);
    const dirs = fs.existsSync(parent) ? fs.readdirSync(parent).filter(d => (d === base || d.startsWith(base + '-')) && fs.existsSync(path.join(parent, d, 'report.json'))) : [];
    for (const d of dirs) out.push({ dir: path.join(parent, d), pairs, perGame: pg ? +pg[1] : undefined, freeFire: /--free-fire/.test(l) });
  }
  return out;
}
function main(argv) {
  const lists = [], o = { write: argv.includes('--write') };
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--list') lists.push(argv[++i]); else if (argv[i] === '--json') o.json = argv[++i];
  if (!lists.length) { console.error('usage: rescore.js --list run-list.txt [--list ..] [--write] [--json out.json]'); process.exit(2); }
  const all = [], seen = new Set();
  for (const f of lists) for (const r of listOf(f)) {
    if (seen.has(r.dir)) continue; seen.add(r.dir);
    const res = rescoreDir(r.dir, r.pairs, { ...r, write: o.write });
    if (!res) continue;
    const t = res.rescore.totals;
    all.push({ dir: path.relative(path.resolve(SRC, '..'), r.dir).replace(/\\/g, '/'), ...t, notes: res.rescore.notes });
    console.log(`${all[all.length - 1].dir}: kills ${t.oldKills} -> ${t.newKills} proof ${JSON.stringify(t.proof)} src ${JSON.stringify(t.src)} afterOrder ${t.expired} controls ${t.controls.old}->${t.controls.new} void games ${t.voidGames.old}->${t.voidGames.new}/${t.voidGames.games}${res.rescore.notes.length ? ' | ' + res.rescore.notes.join('; ') : ''}`);
  }
  const sum = k => all.reduce((a, x) => a + x[k], 0), pr = {};
  for (const x of all) for (const [k, v] of Object.entries(x.proof)) pr[k] = (pr[k] || 0) + v;
  const vg = k => all.reduce((a, x) => a + ((x.voidGames || {})[k] || 0), 0);
  console.log(`TOTAL dirs ${all.length}: counted kills ${sum('oldKills')} -> ${sum('newKills')} survive (${(100 * sum('newKills') / Math.max(1, sum('oldKills'))).toFixed(1)}%), proof ${JSON.stringify(pr)}, after 120 s order ${sum('expired')}, void games ${vg('old')} -> ${vg('new')} of ${vg('games')}`);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(all, null, 1) + '\n');
  return all;
}
module.exports = { rescoreDir, listOf, rowProof, oldLifeOf, main };
if (require.main === module) main(process.argv.slice(2));
