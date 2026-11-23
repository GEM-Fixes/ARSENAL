// Author: Imperator_Aug (ARSENAL, ia-e7ea7075)
'use strict';
// testplan results: read the reports of game runs into row statuses, and merge row results into a plan.
// Contract: tools/testplan/README.md "verdict".
//   read(stack, plan, {out, dirs:[..], tools, classOf, depth}) -> {rows:[{id, status, result:{tool, findings, note, pair?, verdict?}}], tools:[{tool, ms, ok, error}]}
//     out      the emit dir: `<out>/map.json` names the edrun pair of each row; also searched for reports
//     dirs     run dirs, searched 5 levels deep for report.json / result.json (edrun, prove), a preloadsweep `read` JSON,
//              a bootcheck spawn JSON and game.log
//     tools    {logtriage: (logFile, stack) => findings, bootcheck: (logFile, names, stack) => {units:[{name, spawned, reason}]}}
//              replace the two tools that read a game.log (tests need no game)
//     classOf  (entity name) => class word, for the TST-47 rule when map.json does not carry it
//     depth    'spawn' | 'move' of prove reports that do not say it
//   apply(plan, rowResults, {ticks}) -> a new plan with statuses merged and `summary` recounted
// Rules (README): never a pass by silence. A row with no report, no pair in map.json or a pair missing from the report stays `todo`.
//   held (preflight word) > NOSPAWN fail > void game > ERROR fail > the check's own rule. A control pair never sets a row.
//   Several reports of one row: pass > fail > unproven > void > held > todo.
// map.json forms read: {pairs:{name:[row ids]}} | {pairs:[{name, rows, under?, shooterCls?, foeCls?}]} | {name:[row ids]} | [{name, rows}].
const fs = require('fs');
const path = require('path');

const HOLD = ['OUTOFRANGE', 'TOOCLOSE', 'BLOCKED', 'CROWDED', 'NOUNIT', 'SHARED', 'FAULT'];
const ORDER = ['pass', 'fail', 'unproven', 'void', 'held', 'todo'];
const lc = s => String(s == null ? '' : s).toLowerCase();
const num = v => (Array.isArray(v) ? v.length : v === true ? 1 : +v || 0);
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };
const baseName = s => lc(s).replace(/\([^)]*\)\s*$/, '').split('/').pop();

// ---- class rank (TST-47): is the shooter under the foe's class. null = not known --------------------------------------
const RANKS = [[/human|infantry|soldier|squad/, 0], [/^(car|cars|truck|trucks|moto|bike)|[_\-]car$/, 1], [/btr|armou?red|apc|halftrack|spg_light/, 2], [/light/, 3], [/medium/, 4], [/heavy|super/, 5]];
function rankOf(word) { const w = lc(word); if (!w) return null; for (const [re, n] of RANKS) if (re.test(w)) return n; return null; }
function classWord(plan, name, opt) {
  if (!name) return null;
  if (opt.classOf) { const w = opt.classOf(name); if (w) return w; }
  const n = baseName(name);
  for (const it of (plan && plan.items) || []) {
    if (it.kind !== 'entity' || (lc(it.name) !== n && lc(it.key) !== n)) continue;
    if (it.cls === 'human') return 'human';
    const m = /\/-vehicle\/([^/]+)\//.exec(lc(it.file).replace(/\\/g, '/'));
    if (m) return m[1];
  }
  return /^mp\//.test(lc(name)) ? 'human' : null;
}
function underOf(plan, p, entry, opt) {
  for (const o of [entry, p]) if (o && typeof o.under === 'boolean') return o.under;
  const a = rankOf((entry && entry.shooterCls) || p.shooterCls || classWord(plan, p.shooter, opt));
  const b = rankOf((entry && entry.foeCls) || p.foeCls || classWord(plan, p.foe, opt));
  return a == null || b == null ? null : a < b;
}

// ---- one edrun pair -> the status of a row of `check` (pure; exported for the test) ------------------------------------
function pairStatus(check, p, game, under) {
  const v = String(p.verdict || '').toUpperCase(), st = (status, note) => ({ status, note });
  if (HOLD.includes(v)) return st('held', `preflight held the pair: ${v}${p.why ? ' (' + p.why + ')' : ''}`);
  if (v === 'NOSPAWN') return st('fail', 'NOSPAWN: the game could not spawn the unit' + (p.countReason ? ' (' + p.countReason + ')' : ''));
  if (game && game.void === true) return st('void', 'the game of this pair is void (its control failed): run it again');
  if (v === 'ERROR') return st('fail', 'ERROR' + (p.error ? ': ' + p.error : ''));
  if (!v) return st('todo', 'the pair has no verdict');
  if (check === 'fire') {
    if (p.fireProof === 'muzzle' || p.fireProof === 'hit') return st('pass', 'fired: fireProof ' + p.fireProof);
    if (num(p.shots) > 0 && p.shotsRead) return st('pass', `fired: ${p.shots} shots read`);
    if (p.noBlast) return st('unproven', 'a gun with no muzzle blast line: shots cannot be read from the log (TST-112, TST-114)');
    if (p.fireUnmeasured || !p.shotsRead || p.shots == null) return st('unproven', 'shots not read from the log (TST-59)');
    if (v === 'NOORDER' || v === 'SHOOTERLOST' || v === 'MARKED') return st('unproven', v + ': the run could not tell whether the gun fires');
    return st('fail', `0 shots read, no fire proof (${v}${p.fireProof ? ', fireProof ' + p.fireProof : ''})`);
  }
  if (check === 'dmgout' || check === 'dmgin') {
    if (p.kill && p.counted !== false && v !== 'FALSEKILL') return st('pass', 'kill counted' + (p.killGameS != null ? ` at ${p.killGameS} s` : ''));
    if (['muzzle', 'damage', 'hp'].includes(p.proof)) return st('pass', 'damage proof: ' + p.proof);
    const ev = ['parts', 'damaged', 'hits'].filter(k => num(p[k]) > 0);
    if (ev.length) return st('pass', 'damage seen: ' + ev.map(k => `${k} ${num(p[k])}`).join(', '));
    if (v === 'PASS') return st('pass', 'edrun verdict PASS');
    if (v === 'NOKILL') {
      if (under === true) return st('unproven', 'NOKILL from a shooter under the foe\'s class proves nothing (TST-47)');
      if (under === false) return st('fail', 'NOKILL: no kill, no part broken, no health lost, shooter of the foe\'s class or above');
      return st('unproven', 'NOKILL, and the class of shooter and foe is not known (TST-47): judged unproven, not failed');
    }
    return st('unproven', v + ': the run could not tell whether damage was done');
  }
  if (check === 'crew') {
    if (v === 'PASS') return st('pass', 'edrun verdict PASS');
    if (v === 'NOORDER' || v === 'SHOOTERLOST' || v === 'MARKED') return st('unproven', v + ': the run could not tell');
    return st('fail', v);
  }
  return st('todo', 'no rule for check ' + check);
}

// ---- files ---------------------------------------------------------------------------------------------------------
function findFiles(dirs) {
  const out = [], seen = new Set();
  const walk = (d, depth) => {
    let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 5 && e.name !== '.git' && e.name !== 'node_modules') walk(p, depth + 1); continue; }
      const k = lc(path.resolve(p));
      if (seen.has(k) || !/\.json$|^game\.log$/i.test(e.name) || /^(map|plan)\.json$/i.test(e.name)) continue;
      seen.add(k); out.push(p);
    }
  };
  for (const d of dirs) if (d) walk(d, 0);
  return out.sort();
}
function kindOfReport(j) {
  if (!j || typeof j !== 'object') return null;
  if (Array.isArray(j.pairs) && Array.isArray(j.games) && j.pairs.some(p => p && p.verdict !== undefined)) return 'edrun';
  if (Array.isArray(j.rows) && (j.rows.some(r => r && r.card !== undefined) || j.verdict !== undefined && !j.rows.length)) return 'prove';
  if (Array.isArray(j.entities) && j.entities.some(e => e && /^(FAILED|NOT_REACHED|NO_ERROR)$/.test(e.status))) return 'sweep';
  if (Array.isArray(j.units) && j.units.some(u => u && typeof u.spawned === 'boolean')) return 'bootcheck';
  return null;
}
// map.json -> Map(pair name lower -> {rows:[ids], ...entry})
function readMap(file) {
  const j = readJson(file), m = new Map();
  if (!j) return null;
  const put = (name, e) => { if (!name) return; const o = Array.isArray(e) ? { rows: e } : typeof e === 'string' ? { rows: [e] } : Object.assign({}, e, { rows: (e && (e.rows || e.ids)) || [] }); const k = lc(name), c = m.get(k); if (c) c.rows = [...new Set(c.rows.concat(o.rows))]; else m.set(k, o); };
  const src = Array.isArray(j) ? j : j.pairs !== undefined ? j.pairs : j;
  if (Array.isArray(src)) for (const e of src) put(e && (e.name || e.pair), e);
  else if (src && typeof src === 'object') for (const [k, e] of Object.entries(src)) put(k, e);
  return m;
}

// ---- read ----------------------------------------------------------------------------------------------------------
function read(stack, plan, opt = {}) {
  const t00 = Date.now(), rows = (plan && plan.rows) || [], byId = new Map(rows.map(r => [r.id, r]));
  const got = new Map(), tools = [];                 // row id -> [{status, note, tool, findings, pair, verdict}]
  const add = (id, r) => { if (!got.has(id)) got.set(id, []); got.get(id).push(r); };
  const tool = (name, t0, error) => { const e = tools.find(x => x.tool === name); if (e) { e.ms += Date.now() - t0; if (error) { e.ok = false; e.error = e.error ? e.error + '; ' + error : error; } } else tools.push(Object.assign({ tool: name, ms: Date.now() - t0, ok: !error }, error ? { error } : {})); };
  const dirs = [opt.out, ...(opt.dirs || [])].filter(Boolean), files = findFiles(dirs);
  const reports = { edrun: [], prove: [], sweep: [], bootcheck: [] }, logs = [];
  for (const f of files) {
    if (/game\.log$/i.test(f)) { logs.push(f); continue; }
    const j = readJson(f), k = kindOfReport(j);
    if (k) reports[k].push({ file: f, j });
  }
  const want = c => rows.filter(r => r.check === c && r.how !== 'static');
  const ent = r => baseName((r.target && r.target.entity) || '');
  const cardOf = r => baseName((r.target && r.target.card) || '');

  // edrun, through map.json
  const edRows = rows.filter(r => ['fire', 'dmgout', 'dmgin', 'crew'].includes(r.check));
  if (edRows.length) {
    const t0 = Date.now(), map = opt.out ? readMap(path.join(opt.out, 'map.json')) : null, pairOf = new Map();   // row id -> [pair name]
    if (map) for (const [name, e] of map) for (const id of e.rows) { if (!pairOf.has(id)) pairOf.set(id, []); pairOf.get(id).push(name); }
    const found = new Map();                          // pair name -> [{p, game, file}]
    for (const { file, j } of reports.edrun) for (const p of j.pairs) {
      if (!p || !p.name || p.control) continue;      // a control never sets a row
      const k = lc(p.name); if (!found.has(k)) found.set(k, []);
      found.get(k).push({ p, game: j.games[p.game || 0] || null, file });
    }
    for (const r of edRows) {
      const names = pairOf.get(r.id);
      if (!map) { add(r.id, { status: 'todo', tool: 'edrun', note: opt.out ? 'no map.json in the emit dir: run emit first' : 'no emit dir given (out)' }); continue; }
      if (!names) { add(r.id, { status: 'todo', tool: 'edrun', note: 'no pair for this row in map.json' }); continue; }
      let any = false;
      for (const n of names) for (const x of found.get(n) || []) {
        any = true;
        const s = pairStatus(r.check, x.p, x.game, underOf(plan, x.p, map.get(n), opt));
        add(r.id, { status: s.status, note: s.note, tool: 'edrun', pair: x.p.name, verdict: x.p.verdict || null, findings: s.status === 'fail' ? [{ file: path.basename(x.file), line: 0, code: 'EDRUN_' + String(x.p.verdict || 'NONE').toUpperCase(), msg: `${x.p.name}: ${s.note}`, severity: 'error' }] : [] });
      }
      if (!any) add(r.id, { status: 'todo', tool: 'edrun', pair: names[0], note: reports.edrun.length ? `pair ${names.join(', ')} is not in any edrun report.json` : 'no edrun report.json found' });
    }
    tool('edrun', t0, reports.edrun.length ? null : 'no report.json');
  }

  // prove: spawn and move rows by card
  const spawnRows = want('spawn'), moveRows = want('move');
  if (spawnRows.length || moveRows.length) {
    const t0 = Date.now();
    for (const { file, j } of reports.prove) {
      const d = lc(j.depth || (j.args && j.args.depth) || opt.depth || (/move/i.test(file) ? 'move' : /spawn/i.test(file) ? 'spawn' : ''));
      const isVoid = String(j.verdict || '').toUpperCase() === 'VOID';
      for (const pr of j.rows || []) {
        const c = baseName(pr.card), depth = lc(pr.depth || d);
        const hit = [...spawnRows, ...moveRows].filter(r => cardOf(r) === c || (!cardOf(r) && ent(r) === c));
        for (const r of hit) {
          const base = { tool: 'prove', verdict: j.verdict || null, findings: [] };
          if (r.check === 'move' && depth !== 'move') { add(r.id, Object.assign(base, { status: 'todo', note: depth ? `prove ran at depth ${depth}, not move` : 'the prove report does not say its depth' })); continue; }
          if (isVoid) { add(r.id, Object.assign(base, { status: 'void', note: 'prove verdict VOID (its control failed): run it again' })); continue; }
          if (pr.pass === true) add(r.id, Object.assign(base, { status: 'pass', note: `prove ${depth || 'spawn'}: ${pr.why || 'pass'}` }));
          else if (pr.pass === false) add(r.id, Object.assign(base, { status: 'fail', note: `prove: ${pr.why || 'fail'}`, findings: [{ file: path.basename(file), line: 0, code: 'PROVE_FAIL', msg: `${pr.card}: ${pr.why || ''}`, severity: 'error' }] }));
          else add(r.id, Object.assign(base, { status: 'unproven', note: `prove could not tell: ${pr.why || 'no result'}` }));
        }
      }
    }
    if (reports.prove.length) tool('prove', t0);
  }
  // preloadsweep read, bootcheck spawn: spawn rows by entity
  if (spawnRows.length) {
    let t0 = Date.now();
    for (const { file, j } of reports.sweep) for (const e of j.entities) {
      for (const r of spawnRows.filter(x => ent(x) === baseName(e.name))) {
        if (e.status === 'FAILED') add(r.id, { status: 'fail', tool: 'preloadsweep', note: 'preload FAILED: ' + (e.why || ''), findings: [{ file: path.basename(file), line: e.line || 0, code: 'PRELOAD_FAILED', msg: `${e.name}: ${e.why || ''}`, severity: 'error' }] });
        else if (e.status === 'NO_ERROR') add(r.id, { status: 'unproven', tool: 'preloadsweep', note: 'preload NO_ERROR: no error line, which is not a pass on its own', findings: [] });
        else add(r.id, { status: 'todo', tool: 'preloadsweep', note: 'preload NOT_REACHED: ' + (e.why || ''), findings: [] });
      }
    }
    if (reports.sweep.length) tool('preloadsweep', t0);
    t0 = Date.now();
    const spawnOf = (units, src) => {
      for (const u of units || []) for (const r of spawnRows.filter(x => ent(x) === baseName(u.name))) {
        if (u.spawned === true) add(r.id, { status: 'pass', tool: 'bootcheck', note: 'spawned: ' + (u.line || src), findings: [] });
        else if (u.reason && !/^no spawn line$/i.test(u.reason)) add(r.id, { status: 'fail', tool: 'bootcheck', note: u.reason, findings: [{ file: src, line: 0, code: 'SPAWN_FAILED', msg: `${u.name}: ${u.reason}`, severity: 'error' }] });
      }
    };
    for (const { file, j } of reports.bootcheck) spawnOf(j.units, path.basename(file));
    const names = [...new Set(spawnRows.map(ent).filter(Boolean))];
    let err = null, ran = reports.bootcheck.length > 0;
    for (const lg of names.length ? logs : []) {
      try {
        const fn = (opt.tools && opt.tools.bootcheck) || ((f, list, st) => require('../../bootcheck/bootcheck.js').spawn(f, list, { goh: st && st.kind === 'goh' }));
        spawnOf((fn(lg, names, stack) || {}).units, path.basename(lg)); ran = true;
      } catch (e) { err = 'bootcheck: ' + ((e && e.message) || e); }
    }
    if (ran || err) tool('bootcheck', t0, err);
  }
  // logtriage: the log row(s) of the run
  const logRows = rows.filter(r => r.check === 'log');
  if (logRows.length) {
    const t0 = Date.now();
    let err = null;
    if (!logs.length) for (const r of logRows) add(r.id, { status: 'todo', tool: 'logtriage', note: 'no game.log of the run found', findings: [] });
    for (const lg of logs) {
      let fs0;
      try {
        const fn = (opt.tools && opt.tools.logtriage) || ((f, st) => { const j = require('../../logtriage/logtriage.js').check({ target: f, exe: st && st.exe, gameDir: st && st.gameDir, mods: st && st.mods }).rep.toJSON(); return j.findings; });
        fs0 = (fn(lg, stack) || []).filter(f => f.severity === undefined || f.severity === 'error');
      } catch (e) { err = 'logtriage: ' + ((e && e.message) || e); for (const r of logRows) add(r.id, { status: 'todo', tool: 'logtriage', note: err, findings: [] }); continue; }
      const fnd = fs0.map(f => ({ file: f.file || path.basename(lg), line: +f.line || 0, code: String(f.code || ''), msg: String(f.msg || ''), severity: 'error' }));
      for (const r of logRows) add(r.id, { status: fnd.length ? 'fail' : 'pass', tool: 'logtriage', note: fnd.length ? `${fnd.length} error line${fnd.length === 1 ? '' : 's'} in ${path.basename(lg)}` : 'no error line in ' + path.basename(lg), findings: fnd });
    }
    tool('logtriage', t0, logs.length ? err : 'no game.log');
  }
  // run rows nothing spoke of: todo with a note, never a pass
  for (const r of rows) if (r.how === 'run' && !got.has(r.id) && ['spawn', 'move'].includes(r.check)) add(r.id, { status: 'todo', tool: r.runner || 'prove', note: 'no report names this unit', findings: [] });

  const out = [];
  for (const [id, list] of got) {
    if (!byId.has(id)) continue;
    // a log row fails when any log fails; every other row takes its best report
    const all = byId.get(id).check === 'log' && list.some(x => x.status === 'fail') ? list.filter(x => x.status === 'fail') : list;
    const best = all.slice().sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))[0];
    const others = list.filter(x => x !== best && x.status !== best.status).map(x => `${x.tool} ${x.status}`);
    const result = { tool: best.tool, findings: [].concat(...all.filter(x => x.status === best.status).map(x => x.findings || [])), note: best.note + (others.length ? ` (also: ${[...new Set(others)].join(', ')})` : '') };
    if (best.pair) result.pair = best.pair;
    if (best.verdict) result.verdict = best.verdict;
    out.push({ id, status: best.status, result });
  }
  void t00;
  return { rows: out, tools };
}

// ---- apply ---------------------------------------------------------------------------------------------------------
const TICK = { pass: 'pass', fail: 'fail', skip: 'skip' };
function summaryOf(plan, rows) {
  const old = (plan && plan.summary) || {}, byHow = { static: 0, run: 0, player: 0 }, byStatus = {}, byCheck = {};
  for (const r of rows) { byHow[r.how] = (byHow[r.how] || 0) + 1; byStatus[r.status] = (byStatus[r.status] || 0) + 1; byCheck[r.check] = (byCheck[r.check] || 0) + 1; }
  return Object.assign({}, old, { rows: rows.length, byHow, byStatus, byCheck, items: old.items !== undefined ? old.items : ((plan && plan.items) || []).length });
}
// rowResults: [{id, status, result}] from static.run / read (their `.rows`, or the whole object), and [{id, tick:{v, note}}].
// opt.ticks: the state's ticks ({rowId: {v, note}}). A tick sets only `player` rows and rows listed in the checklist; a `todo`
// result never takes a status away, it only leaves its note on a row that is still `todo`.
function apply(plan, rowResults, opt = {}) {
  const list = Array.isArray(rowResults) ? rowResults : (rowResults && rowResults.rows) || [];
  const rows = ((plan && plan.rows) || []).map(r => Object.assign({}, r)), byId = new Map(rows.map(r => [r.id, r]));
  const listed = new Set();
  for (const s of (plan && plan.checklist && plan.checklist.sessions) || []) for (const e of s.entries || []) if (e.row) listed.add(e.row);
  const ticks = [];
  for (const x of list) {
    if (!x || !byId.has(x.id)) continue;
    if (x.tick) { ticks.push([x.id, x.tick]); continue; }
    const r = byId.get(x.id);
    if (!x.status) continue;
    if (x.status === 'todo') { if (r.status === 'todo' || !r.status) r.result = x.result || r.result || null; continue; }
    r.status = x.status; r.result = x.result || null;
  }
  for (const [id, t] of Object.entries(opt.ticks || {})) if (byId.has(id)) ticks.push([id, t]);
  for (const [id, t] of ticks) {
    const r = byId.get(id), v = TICK[t && t.v];
    if (!v || !(r.how === 'player' || listed.has(id))) continue;
    r.status = v;
    r.result = Object.assign({}, r.result && r.result.tool !== 'player' ? { was: { tool: r.result.tool, note: r.result.note } } : {}, { tool: 'player', findings: [], note: (t && t.note) || '' });
  }
  return Object.assign({}, plan, { rows, summary: summaryOf(plan, rows) });
}

module.exports = { read, apply, pairStatus, readMap, HOLD };
