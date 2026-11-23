// gohsample predict: static prediction per built entity for as64 (or mowas_2: --exe / plan meta.exe, C.target), from wouldload (per-entity crash entries) + the per-file linters.
// TRAP handled: wouldload's verdict drops ORPHAN crash entries (tools/wouldload/reach.js), but a preload list names each entity directly,
// so every crash entry of the entity counts here whatever its reach. reach is kept as a field.
// Author: Imperator_Aug (ARSENAL, ia-c5e2b76d)
const fs = require('fs'), os = require('os'), path = require('path');
const C = require('./common');
const CLS = require('../wouldload/classes'), registry = require('../lib/registry');
const common2 = require('../modmove/lib/common');

const RES = /(resource\/[^\s:"]+)/i;
const fileKey = f => { const m = RES.exec(String(f).replace(/\\/g, '/')); return m ? m[1].toLowerCase() : null; };
const cite = code => CLS.HARD[code] || (CLS.OTHER[code] && CLS.OTHER[code][1]) || null;
const clsOf = (code, dflt) => (CLS.OTHER[code] && CLS.OTHER[code][0]) || (CLS.isHard(code) ? 'SPAWN' : dflt || 'UNKNOWN');

// pure core (tested without a game): wl = wouldload --json result, linter = [{tool, file, line, code, msg}], build = build.json
// opt.tid = the target game id (C.target: 'as64' default | 'mowas2'): which wouldload exe result is read
function judge(wl, linter, build, opt = {}) {
  const tid = opt.tid || 'as64';
  const x = (wl && wl.exes && (wl.exes[tid] || wl.exes[tid === 'mowas2' ? 'mowas_2' : tid] || Object.values(wl.exes)[0])) || null;
  const owners = new Map();
  for (const r of build.entities) for (const f of r.files || []) { const k = f.toLowerCase(); if (!owners.has(k)) owners.set(k, []); owners.get(k).push(r.entity.toLowerCase()); }
  const crashBy = new Map();
  for (const e of (x && x.crash) || []) { const n = String(e.entity).toLowerCase(); if (!crashBy.has(n)) crashBy.set(n, []); crashBy.get(n).push(e); }
  const byEnt = new Map();   // entity -> {silent:{code:n}, tools:{code:Set}, sevCrash:[{code,file,line,tool}]}
  const slot = n => { if (!byEnt.has(n)) byEnt.set(n, { codes: {}, sevCrash: [] }); return byEnt.get(n); };
  const feed = (tool, f) => {
    const k = fileKey(f.file);
    for (const n of (k && owners.get(k)) || []) {
      const s = slot(n);
      s.codes[f.code] = (s.codes[f.code] || 0) + 1;
      if (registry.severity(f.code) === 'crash' && CLS.classOf(f.code) !== 'LOGGED' && !CLS.isHard(f.code) && s.sevCrash.length < 5) s.sevCrash.push({ tool, code: f.code, file: f.file, line: f.line });
    }
  };
  for (const f of (x && x.silent) || []) feed('wouldload', f);
  for (const f of linter) feed(f.tool, f);
  const globalProblem = !x || !x.tested ? 'wouldload gave no tested result for ' + tid : [...(x.readProblems || []), ...(x.toolFailed || [])].join('; ');
  const out = [];
  for (const r of build.entities) {
    const n = r.entity.toLowerCase();
    const p = { entity: r.entity, kind: r.kind, key: r.key, build: r.status, closure: r.closure, files: r.files || [], portCodes: Object.keys(Object.assign({}, r.findings, r.info)).sort() };
    if (r.status === 'refused') { Object.assign(p, { predicted: 'NOT_BUILT', reason: r.reason, crash: [], codes: [], crashCodes: [] }); out.push(p); continue; }
    const entries = (crashBy.get(n) || []).map(e => ({ code: e.code, cls: e.cls || clsOf(e.code, 'SPAWN'), cite: cite(e.code), file: e.file, line: e.line, msg: e.msg, reach: e.reach || 'UNKNOWN', reachWhy: e.reachWhy || '', more: e.more || 0, countedByWouldload: e.reach !== 'ORPHAN' }));
    const s = byEnt.get(n) || { codes: {}, sevCrash: [] };
    p.crash = entries;
    p.crashCodes = [...new Set(entries.map(e => e.code))].sort();
    p.codes = [...new Set(Object.keys(s.codes).concat(p.crashCodes))].sort();
    p.lintCounts = s.codes;
    p.reach = entries.length ? (entries.some(e => e.reach === 'REACHABLE') ? 'REACHABLE' : entries.every(e => e.reach === 'ORPHAN') ? 'ORPHAN' : 'UNKNOWN') : null;
    if (entries.length) {
      p.predicted = 'CRASH';
      p.class = entries.some(e => e.cls === 'SPAWN') ? 'SPAWN' : entries[0].cls;
      p.reason = entries[0].code + (p.reach === 'ORPHAN' ? ' (ORPHAN in wouldload: its verdict ignores it, a preload list names it, so counted)' : '');
      p.source = entries[0].cite;
    } else if (globalProblem) {
      p.predicted = 'UNKNOWN'; p.reason = globalProblem.slice(0, 300); p.class = null;
    } else if (s.sevCrash.length) {
      p.predicted = 'UNKNOWN'; p.class = 'UNKNOWN';
      p.reason = `crash-severity finding not wired as a crash class in classes.js: ${s.sevCrash.map(c => c.code).join(', ')}`;
      p.source = cite(s.sevCrash[0].code); p.unwired = s.sevCrash;
    } else { p.predicted = 'LOAD'; p.class = null; p.reason = 'no crash class found (static only)'; }
    out.push(p);
  }
  return { entities: out, unnamed: x ? x.unnamed || 0 : 0, verdict: x ? { verdict: x.verdict, text: x.text } : null, globalProblem };
}

// part B (non-entity files, mod_b): pure judge. A file is CRASH when a crash-class finding sits on the file itself: hard codes
// (classes.js HARD) or registry severity 'crash'. Load point (boot vs on include) decides the class: BOOT_* = LOAD, ON_INCLUDE = SPAWN [I].
function judgeB(wl, linter, files, opt = {}) {
  const tid = opt.tid || 'as64';
  const x = (wl && wl.exes && (wl.exes[tid] || wl.exes[tid === 'mowas2' ? 'mowas_2' : tid] || Object.values(wl.exes)[0])) || null;
  const globalProblem = !x || !x.tested ? 'wouldload gave no tested result for ' + tid : [...(x.readProblems || []), ...(x.toolFailed || [])].join('; ');
  const by = new Map();
  const slot = k => { if (!by.has(k)) by.set(k, { codes: {}, crash: [] }); return by.get(k); };
  const feed = (tool, f, crashEntry) => {
    const k = fileKey(f.file);
    if (!k) return;
    const s = slot(k);
    s.codes[f.code] = (s.codes[f.code] || 0) + 1;
    if ((crashEntry || CLS.isHard(f.code) || (registry.severity(f.code) === 'crash' && CLS.classOf(f.code) !== 'LOGGED')) && s.crash.length < 5) s.crash.push({ tool, code: f.code, line: f.line, msg: f.msg });
  };
  for (const e of (x && x.crash) || []) feed('wouldload', e, true);
  for (const f of (x && x.silent) || []) feed('wouldload', f, false);
  for (const f of linter) feed(f.tool, f, false);
  return files.map(f => {
    const p = { file: f.key, name: f.name, group: f.group, loadKind: f.loadKind, inAs2: f.inAs2, build: f.status, portCodes: Object.keys(Object.assign({}, f.findings, f.info)).sort() };
    if (f.status === 'refused') return Object.assign(p, { predicted: 'NOT_BUILT', reason: f.reason, crashCodes: [], codes: [] });
    const s = by.get('resource/' + f.key) || { codes: {}, crash: [] };
    p.codes = Object.keys(s.codes).sort(); p.lintCounts = s.codes;
    p.crashCodes = [...new Set(s.crash.map(c => c.code))].sort();
    p.class = f.loadKind.startsWith('BOOT') ? 'LOAD' : f.loadKind === 'ON_INCLUDE' ? 'SPAWN' : 'UNKNOWN';
    p.loadCite = f.cite;
    if (s.crash.length) { p.predicted = 'CRASH'; p.reason = s.crash[0].code; p.source = cite(s.crash[0].code); p.crash = s.crash; }
    else if (globalProblem) { p.predicted = 'UNKNOWN'; p.reason = globalProblem.slice(0, 300); }
    else { p.predicted = 'LOAD'; p.reason = 'no crash-class finding on this file (static only)'; }
    return p;
  });
}

async function predictB(o, game, build, log, tg) {
  const files = (build.partB && build.partB.files) || [];
  if (!files.length) return null;
  const modDir = path.join(path.resolve(o.out), 'mod_b');
  let wl = null, linter = [];
  if (o['wl-json-b']) wl = C.readJson(o['wl-json-b']);
  else if (fs.existsSync(modDir)) {
    const ov = C.makeOverlay(game, modDir, 'gohsample_b');
    try {
      const jf = path.join(os.tmpdir(), `gohsample-wlb-${process.pid}.json`);
      const tools = (o.linters === 'none' ? '' : (o.linters || 'keylint,humlint,movlint,fxlint,strlint,ialint')).split(',').filter(Boolean), rc = registry.rcTools();
      const jobs = [C.runNode(path.join(C.TOOLS, 'wouldload', 'wouldload.js'), [ov.mod, '--exe', tg.exe, '--game', ov.ov, '--json', jf, '-q'], { timeout: 1200000 })]
        .concat(tools.map(t => C.runNode(path.join(C.TOOLS, t, t + '.js'), [ov.mod, '--game', ov.ov, ...tg.flag, '-q', ...(rc.includes(t) ? ['--no-rc'] : [])], { timeout: 900000 }).then(r => ({ t, r }))));
      const [w, ...ls] = await Promise.all(jobs);
      try { wl = C.readJson(jf); } catch { wl = null; log('part B: wouldload gave no json: ' + (w.out || w.err).trim().split(/\r?\n/).slice(-2).join(' ')); }
      fs.rmSync(jf, { force: true });
      for (const { t, r } of ls) { if (r.timedOut || r.code > 1) continue; for (const f of common2.parseFindings(r.out)) if (!f.info) linter.push({ tool: t, file: f.file, line: f.line, code: f.code, msg: f.msg }); }
    } finally { ov.cleanup(); }
  }
  return judgeB(wl, linter, files, { tid: tg.id });
}

async function predict(o) {
  const out = path.resolve(o.out), plan = C.readJson(o.plan);
  const game = o.game || plan.meta.as2, goh = o.goh || plan.meta.goh;
  C.guardOut(out, game, goh);
  const tg = C.target(o, plan);   // game parity: wouldload --exe and the linters' --exe (only when named) follow the target
  const log = o.q ? () => { } : console.log, T0 = Date.now(), times = {};
  const build = C.readJson(o.build || path.join(out, 'build.json'));
  const modDir = path.join(out, 'mod');
  let wl, linter = [], ov = null;
  try {
    if (o['wl-json']) wl = C.readJson(o['wl-json']);
    else {
      ov = C.makeOverlay(game, modDir, 'gohsample');
      log(`overlay (outside-mods, as tools/check/check.js): ${ov.ov}`);
      const jf = path.join(os.tmpdir(), `gohsample-wl-${process.pid}.json`);
      const t1 = Date.now();
      const jobs = [C.runNode(path.join(C.TOOLS, 'wouldload', 'wouldload.js'), [ov.mod, '--exe', tg.exe, '--game', ov.ov, '--json', jf, '-q'], { timeout: 1200000 })];
      const tools = (o.linters === 'none' ? '' : (o.linters || 'keylint,humlint,movlint,fxlint,strlint,ialint')).split(',').filter(Boolean);
      const rc = registry.rcTools();
      const lj = tools.map(t => C.runNode(path.join(C.TOOLS, t, t + '.js'), [ov.mod, '--game', ov.ov, ...tg.flag, '-q', ...(rc.includes(t) ? ['--no-rc'] : [])], { timeout: 900000 }).then(r => { times[t] = r.ms; return { t, r }; }));
      const [w, ...ls] = await Promise.all(jobs.concat(lj));
      times.wouldload = w.ms;
      try { wl = C.readJson(jf); } catch { wl = null; log('wouldload gave no json: ' + (w.out || w.err).trim().split(/\r?\n/).slice(-2).join(' ')); }
      fs.rmSync(jf, { force: true });
      for (const { t, r } of ls) {
        if (r.timedOut || (r.code > 1)) { log(`linter ${t}: failed (exit ${r.code})`); continue; }
        for (const f of common2.parseFindings(r.out)) if (!f.info) linter.push({ tool: t, file: f.file, line: f.line, code: f.code, msg: f.msg });
      }
      log(`wouldload ${((times.wouldload) / 1000).toFixed(0)} s; linters ${Object.entries(times).filter(([k]) => k !== 'wouldload').map(([k, v]) => `${k} ${(v / 1000).toFixed(0)} s`).join(', ')}`);
    }
  } finally { if (ov) ov.cleanup(); }
  const j = judge(wl, linter, build, { tid: tg.id });
  const counts = { LOAD: 0, CRASH: 0, UNKNOWN: 0, NOT_BUILT: 0 }, codeN = {};
  for (const e of j.entities) { counts[e.predicted]++; for (const c of e.crashCodes) codeN[c] = (codeN[c] || 0) + 1; }
  const res = { tool: 'gohsample', version: 1, notice: C.NOTICE, target: tg.id, game: C.fwd(game), wouldload: j.verdict, globalProblem: j.globalProblem || null, unnamedCrashEntries: j.unnamed, counts, crashCodes: codeN, linters: linter.length, times, entities: j.entities, ms: Date.now() - T0 };
  const pb = await predictB(o, game, build, log, tg);
  if (pb) {
    const cb = { LOAD: 0, CRASH: 0, UNKNOWN: 0, NOT_BUILT: 0 };
    for (const f of pb) cb[f.predicted]++;
    res.partB = { counts: cb, files: pb };
    log(`predict part B: LOAD ${cb.LOAD}, CRASH ${cb.CRASH}, UNKNOWN ${cb.UNKNOWN}, not built ${cb.NOT_BUILT}`);
  }
  C.writeJson(path.join(out, 'predictions.json'), res);
  log(`predict: LOAD ${counts.LOAD}, CRASH ${counts.CRASH}, UNKNOWN ${counts.UNKNOWN}, not built ${counts.NOT_BUILT}; crash codes ${JSON.stringify(codeN)} (${res.ms} ms)`);
  return res;
}

module.exports = { predict, judge, judgeB };
