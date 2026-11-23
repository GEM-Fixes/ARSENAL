// Author: Imperator_Aug (ARSENAL, ia-36c4c0e8)
'use strict';
// runs.js: Score A from the newest valid run of each unit (SCOREA). Read by score.js; config tools/score/runs.json.
// A run = one stage of runs.json (a set of game folders). For each unit, each side (U = the port's exam pair, D = its donor pair) takes the newest stage
// (by at) whose mode is order and that holds at least MIN_RUNS rows of that pair from valid games; a newer stage with fewer is skipped and listed.
// No stage with MIN_RUNS: the newest with any valid row stands (a short side, a listed fail). No valid row anywhere: "no valid run".
// Valid game: edrun's game.void === false, no crash, and a control row in that game with verdict PASS. A void game never counts, whatever its rows say.
// Kill rules (one count each, named):
//   attributed  edrun counted it (score.js killCounts) AND the shooter's own muzzle blast lies between its order and the kill (proof muzzle).
//               A row older than KILLPROOF (no proof field) is attributed when its shooter's muzzle lines were read and non-zero, or fireProof muzzle [I: whole-game count].
//               fireProof hit (a hit on the foe, shooter muzzle unread: most port rows before KILLPROOF) or held does not name the shooter: not attributed.
//   proven      edrun counted it (KILLPROOF: muzzle, damage or hp; none of the last two names the shooter)
// Static unit facts (class, MISS, unarmed, moved, diffuse gate) come from the exam's own cells.csv; its crash list holds only while no newer stage ran the unit.
const fs = require('fs');
const path = require('path');

const MIN_RUNS = 4;
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const heldOf = p => p.held === true || (!!p.preflight && p.order == null && p.kill == null && p.verdict === p.preflight.status && p.verdict !== 'PASS');
let SC = null; const sc = () => SC || (SC = require('./score.js'));
const attributed = p => sc().killCounts(p) && (p.proof === 'muzzle' || (p.proof === undefined && ((typeof p.shots === 'number' && p.shots > 0 && p.shotsRead !== false) || p.fireProof === 'muzzle')));
const RULES = {
  attributed: { kill: attributed, text: 'a kill counts only when edrun counted it and the shooter\'s own muzzle blast lies between order and kill (proof muzzle; pre-KILLPROOF rows: shooter muzzle lines read and > 0 [I])' },
  proven: { kill: p => sc().killCounts(p), text: 'a kill counts when edrun counted it (KILLPROOF muzzle | damage | hp); damage and hp do not name the shooter' },
};

// one report: its games, each with its rows (a report holds one game per control row when it holds several games)
function gamesOf(j) {
  const P = j.pairs || [], G = j.games || [];
  if (G.length <= 1) return [{ game: G[0] || {}, rows: P }];
  const starts = P.map((p, i) => (p.control ? i : -1)).filter(i => i >= 0);
  return G.map((g, i) => ({ game: g, rows: P.slice(starts[i] === undefined ? P.length : starts[i], starts[i + 1] === undefined ? P.length : starts[i + 1]) }));
}
const examStageOf = st => st.find(s => s.exam) || st.find(s => s.mode === 'order');
const gameValid =(game, rows) => game.void === false && !game.crash && rows.some(p => p.control && p.verdict === 'PASS');

// a stage -> {at, files, games, void, rows: {pair: [row]}, voidRows: {pair: n}}
function loadStage(st, runRoot) {
  const game = new RegExp(st.game || '.'), skip = st.skip ? new RegExp(st.skip) : null;
  const out = { id: st.id, exam: !!st.exam, mode: st.mode || 'order', note: st.note || '', report: st.report || '', files: 0, games: 0, void: 0, rows: {}, voidRows: {}, at: st.at ? Date.parse(st.at) : 0, missing: [] };
  for (const d of st.dirs || []) {
    const dp = path.resolve(runRoot, d);
    let ents; try { ents = fs.readdirSync(dp); } catch (e) { out.missing.push(d); continue; }
    for (const g of ents.sort()) {
      if (!game.test(g) || (skip && skip.test(g))) continue;
      const gp = path.join(dp, g), rf = path.join(gp, 'report.json'), rs = path.join(gp, 'report.rescore.json');
      if (!fs.existsSync(rf) && !fs.existsSync(rs)) continue;
      const j = readJson(fs.existsSync(rs) ? rs : rf, null);
      if (!j) continue;
      out.files++;
      if (!st.at) { try { out.at = Math.max(out.at, fs.statSync(fs.existsSync(rf) ? rf : rs).mtimeMs); } catch (e) { /* keep */ } }
      for (const { game: gm, rows } of gamesOf(j)) {
        out.games++;
        const ok = gameValid(gm, rows);
        if (!ok) out.void++;
        for (const p of rows) {
          if (p.control || p.verdict === 'ERROR' || heldOf(p)) continue;
          if (!ok) { out.voidRows[p.name] = (out.voidRows[p.name] || 0) + 1; continue; }
          (out.rows[p.name] = out.rows[p.name] || []).push(p);
        }
      }
    }
  }
  return out;
}

// one side over the stages: the pick, and what was skipped. stages sorted newest first.
function pickSide(pair, stages, o) {
  o = o || {};
  const tried = [];
  if (!pair) return { pick: null, tried };
  const usable = stages.filter(s => s.mode === 'order' && (!o.only || o.only(s)));
  let short = null;
  for (const s of usable) {
    const rs = s.rows[pair] || [], v = s.voidRows[pair] || 0;
    if (!rs.length && !v) continue;
    if (rs.length >= MIN_RUNS) return { pick: s, rows: rs, tried, short: false };
    tried.push(s.id + ' (' + rs.length + ' valid' + (v ? ', ' + v + ' in void games' : '') + ')');
    if (!short && rs.length) short = { s, rs };
  }
  return short ? { pick: short.s, rows: short.rs, tried, short: true } : { pick: null, tried };
}
function sideOf(rows, rule) {
  const kill = RULES[rule].kill;
  const runs = rows.length, kills = rows.filter(kill).length, noorder = rows.filter(p => p.order === null || p.order === undefined).length;
  const proof = {}; for (const p of rows) if (sc().killCounts(p)) proof[p.proof || 'pre'] = (proof[p.proof || 'pre'] || 0) + 1;
  return { runs, kills, noorder, proof };
}
const parseCsv = t => { const L = String(t).split(/\r?\n/).filter(l => l.trim()), H = L.shift().split(','); return L.map(l => { const c = l.split(','), o = {}; H.forEach((h, i) => { o[h] = c[i] === undefined ? '' : c[i]; }); return o; }); };
const readList = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/[\r\n,]+/).map(s => s.trim()).filter(s => s && !s.startsWith('#')) : []);

// one exam: per-unit cells for passLine, under one kill rule. o.only(stage) limits the stages (exam-only view)
function examCells(ex, runRoot, rule, o) {
  o = o || {};
  const base = parseCsv(fs.readFileSync(path.resolve(runRoot, ex.base), 'utf8'));
  const U = (readJson(path.resolve(runRoot, ex.units), {}).units || []);
  const by = {}; for (const u of U) by[u.rep] = u;
  const stages = (ex._stages || (ex._stages = ex.stages.map(s => loadStage(s, runRoot)))).slice().sort((a, b) => b.at - a.at);
  const examStage = examStageOf(ex._stages);
  const crashed0 = readJson(path.resolve(runRoot, ex.crashed || ''), null);
  const crashed = Array.isArray(crashed0) ? crashed0.map(x => (x && x.shooter) || x) : null;
  const cells = [], src = [];
  for (const b of base) {
    const u = by[b.unit] || {}, c = Object.assign({}, b, { outcome: '' });
    const info = { unit: b.unit, class: b.class, U: null, D: null, skipU: [], skipD: [], why: '' };
    const static_ = /^MISS/.test(b.state) || b.fired === 'not built' || b.fired === 'unarmed' || u.loadOnly;
    if (!static_) {
      const pu = pickSide(u.examPair, stages, o), pd = pickSide(u.donorPair, stages, o);
      info.skipU = pu.tried; info.skipD = pd.tried;
      if (pu.pick) { const s = sideOf(pu.rows, rule); Object.assign(c, { runs: s.runs, kills: s.kills, noorder: s.noorder, kills_with_fire_proof: sideOf(pu.rows, 'attributed').kills }); info.U = { stage: pu.pick.id, at: pu.pick.at, short: pu.short, ...s }; }
      else Object.assign(c, { runs: 0, kills: 0, noorder: 0, kills_with_fire_proof: 0 });
      if (pd.pick) { const s = sideOf(pd.rows, rule); Object.assign(c, { d_runs: s.runs, d_kills: s.kills, d_noorder: s.noorder }); info.D = { stage: pd.pick.id, at: pd.pick.at, short: pd.short, ...s }; }
      else if (u.donorPair) Object.assign(c, { d_runs: 0, d_kills: 0, d_noorder: 0 });
      if (!pu.pick) info.noRun = 'U';
      if (u.donorPair && !pd.pick) info.noRunD = true;
      if (pu.pick && examStage && pu.pick !== examStage && pu.pick.at > examStage.at) info.newerThanExam = true;
    }
    cells.push(c); src.push(info);
  }
  // a crash in the exam stands until a newer stage ran the unit
  const crash = crashed ? crashed.filter(n => { const i = src.find(x => x.unit === n); return !(i && i.newerThanExam && i.U && i.U.runs); }) : null;
  return { cells, src, crashed: crash, missingDiffuse: readList(path.resolve(runRoot, ex.diffuse || '')), stages };
}

// every exam, every rule: passLine results with per-unit sources. cfg = parsed runs.json (or file path)
function scoreRuns(o) {
  o = o || {};
  const S = sc();
  const cfg = typeof o.cfg === 'object' && o.cfg ? o.cfg : readJson(o.cfg || path.join(__dirname, 'runs.json'), null);
  const runRoot = o.runRoot || path.resolve(__dirname, '..', '..', '..', 'run');
  if (!cfg || !Array.isArray(cfg.exams) || !cfg.exams.length) return { measured: false, text: 'not measured (no runs.json exams)' };
  const exams = [];
  for (const ex of cfg.exams) {
    if (!fs.existsSync(path.resolve(runRoot, ex.base))) { exams.push({ id: ex.id, measured: false, text: 'not measured (no ' + ex.base + ')' }); continue; }
    const r = { id: ex.id, measured: true, rules: {} };
    let cs = null; // forward-only count-short (SPEED-B2): set name = id|base, set date = newest stage (or --set-date)
    for (const rule of ['attributed', 'proven']) {
      const e = examCells(ex, runRoot, rule);
      if (cs === null) cs = !!o.countShort && S.countShortApplies(ex.id + '|' + ex.base, Number.isFinite(o.setDate) ? o.setDate : Math.max(0, ...(ex._stages || []).map(s => s.at || 0)));
      const a = S.passLine(e.cells, { crashed: e.crashed || [], missingDiffuse: e.missingDiffuse, countShort: cs });
      r.rules[rule] = { passLine: a, src: e.src, stages: e.stages };
    }
    const first = examStageOf(ex._stages);
    const eo = examCells(ex, runRoot, 'attributed', { only: s => s === first });
    r.examOnly = S.passLine(eo.cells, { crashed: eo.crashed || [], missingDiffuse: eo.missingDiffuse, countShort: cs });
    r.countShort = cs;
    r.stages = ex._stages.slice().sort((a, b) => a.at - b.at).map(s => ({ id: s.id, mode: s.mode, at: s.at ? new Date(s.at).toISOString().slice(0, 16) : '?', files: s.files, games: s.games, void: s.void, missing: s.missing, report: s.report, note: s.note }));
    const a = r.rules.attributed.passLine;
    r.n = a.apart.pass; r.of = a.apart.of;
    exams.push(r);
  }
  const head = exams[exams.length - 1];
  return { measured: !!head.measured, head, exams, minRuns: MIN_RUNS };
}

const fmt = x => x.pass + ' of ' + x.of + ' (' + Math.round(x.pct) + '%)';
const short = a => fmt(a.all) + ' all | ' + fmt(a.apart) + ' apart (' + a.bothFail.length + ' both-fail) | armed ' + fmt(a.armed);
// per-unit source table of one exam under one rule
function srcTable(ex, rule) {
  const R = ex.rules[rule], L = ['unit | class | pass | why | U stage (kills/runs) | D stage (kills/runs) | newer runs skipped'];
  R.passLine.cells.forEach((c, i) => {
    const s = R.src[i], sd = x => (x ? x.stage + ' ' + x.kills + '/' + x.runs + (x.short ? ' short' : '') : '-');
    L.push([c.unit, c.class, c.pass ? 'PASS' : 'fail', c.why, sd(s.U), sd(s.D), [].concat(s.skipU.map(t => 'U ' + t), s.skipD.map(t => 'D ' + t)).join('; ') || '-'].join(' | '));
  });
  return L;
}
module.exports = { MIN_RUNS, RULES, attributed, gamesOf, gameValid, loadStage, pickSide, sideOf, examCells, scoreRuns, srcTable, short, heldOf };
