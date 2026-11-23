// gohsample compare: predictions.json vs what the game did (preloadsweep read output and/or bisect run dir) -> calibration.md/json.
// Input formats read from tools/preloadsweep/preloadsweep.js source [V]:
//   read --json : {verdict, why, crash, entities:[{name, status: FAILED|NOT_REACHED|NO_ERROR, how?: crash|cant_preload, why, line?, logged?:[{line,text}]}]}
//   read (text) : `VERDICT: <v>: <why>` then one `<STATUS> <name>: <why> [..]` line per entity
//   bisect dir  : run.json with bisect:{crashers:[{name,inferred}], clean:[names]}; *.log files there are scanned for Exception blocks
// Author: Imperator_Aug (ARSENAL, ia-ae388fd3)
const fs = require('fs'), path = require('path');
const C = require('./common');

const MARK = /^(?:\[[^\]]*\]\s*)?\*{5,} Exception \*{5,}\s*$/;

// -> Map name -> {actual: CRASH|LOAD|MISSING|NOT_REACHED, line, src}
function readResults(file) {
  const m = new Map(), txt = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  let j = null;
  try { j = JSON.parse(txt); } catch { /* text */ }
  const put = (name, actual, line, src) => { name = String(name).toLowerCase(); if (!m.has(name) || actual === 'CRASH') m.set(name, { actual, line: line || '', src }); };
  const fromRow = (name, r) => {
    if (r.actual) return put(name, String(r.actual).toUpperCase(), r.line || r.why, 'results');
    const why = r.why || '';
    if (r.status === 'FAILED') {
      const crash = r.how === 'crash' || /crash in its window/.test(why);
      const logged = r.logged && r.logged[0] ? r.logged[0].text : '';
      put(name, crash ? 'CRASH' : 'MISSING', crash ? why.replace(/^crash in its window[^;]*;?\s*/, '').slice(0, 300) || why : why, 'read');
      if (!crash && logged) m.get(String(name).toLowerCase()).line += ' ' + logged;
    } else if (r.status === 'NO_ERROR') put(name, 'LOAD', r.logged && r.logged[0] ? r.logged[0].text : '', 'read');
    else if (r.status === 'NOT_REACHED') put(name, 'NOT_REACHED', why, 'read');
  };
  if (j && Array.isArray(j.entities)) for (const r of j.entities) fromRow(r.name || r.entity, r);
  else if (j && typeof j === 'object') for (const [k, v] of Object.entries(j.results || j)) fromRow(k, typeof v === 'string' ? { actual: v } : v);
  else for (const l of txt.split(/\r?\n/)) {
    const t = /^(FAILED|NOT_REACHED|NO_ERROR) (\S+): (.*)$/.exec(l);
    if (!t) continue;
    const extra = / \[\d+ log line\(s\) in window, first \d+: (.*)\]$/.exec(t[3]);
    fromRow(t[2], { status: t[1], why: t[3], how: /crash in its window/.test(t[3]) ? 'crash' : 'cant_preload', logged: extra ? [{ text: extra[1] }] : null });
  }
  return m;
}

function scanLogs(dir) {
  const ex = [];
  if (!dir || !fs.existsSync(dir)) return ex;
  const logs = [];
  (function w(d, depth) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 3) w(p, depth + 1); else if (e.isFile() && /\.log$/i.test(e.name)) logs.push(p);
    }
  })(dir, 0);
  for (const f of logs) {
    const lines = fs.readFileSync(f).toString('utf8').split(/\r?\n/);
    lines.forEach((ln, i) => {
      if (!MARK.test(ln)) return;
      let msg = '', file = null;
      for (let k = i + 1; k < Math.min(lines.length, i + 40); k++) {
        if (MARK.test(lines[k])) break;
        if (!msg && lines[k].trim()) msg = lines[k].trim();
        const fm = /^>\s*file\s+"([^"]+)"/.exec(lines[k]);
        if (fm) file = fm[1];
      }
      ex.push({ log: C.fwd(f), line: i + 1, msg: msg.slice(0, 300), file });
    });
  }
  return ex;
}

function readBisect(dir, res) {
  const notes = [];
  const rj = dir && path.join(dir, 'run.json');
  if (!rj || !fs.existsSync(rj)) return notes;
  const b = C.readJson(rj).bisect;
  if (!b) { notes.push('run.json has no bisect state'); return notes; }
  for (const c of b.crashers || []) res.set(c.name.toLowerCase(), { actual: 'CRASH', line: c.inferred ? 'bisect crasher (inferred: its sibling list ran clean)' : 'bisect crasher (its own run crashed)', src: 'bisect' });
  for (const n of b.clean || []) if (!res.has(n.toLowerCase()) || res.get(n.toLowerCase()).actual !== 'CRASH') res.set(n.toLowerCase(), { actual: 'LOAD', line: '', src: 'bisect' });
  notes.push(`bisect: ${(b.crashers || []).length} crashers, ${(b.clean || []).length} cleared, ${b.pending ? 'NOT finished (' + b.pending.names.length + ' pending)' : 'finished'}`);
  return notes;
}

function pct(a, b) { return b ? Math.round(1000 * a / b) / 10 : null; }

// pure core: preds = predictions.json, res = Map from readResults, exceptions = scanLogs
function calibrate(preds, res, exceptions) {
  const rows = [];
  for (const p of preds.entities) {
    if (p.predicted === 'NOT_BUILT') continue;
    const r = res.get(p.entity.toLowerCase()) || { actual: 'NOT_REACHED', line: 'no result for this name', src: 'none' };
    rows.push({ p, actual: r.actual, line: r.line, src: r.src });
  }
  const cm = { TP: 0, FP: 0, FN: 0, TN: 0, UNKNOWN_CRASH: 0, UNKNOWN_LOAD: 0, MISSING: 0, NOT_REACHED: 0 };
  const list = { TP: [], FP: [], FN: [], UNKNOWN_CRASH: [], MISSING: [] };
  for (const x of rows) {
    const pr = x.p.predicted, a = x.actual;
    if (a === 'NOT_REACHED') { cm.NOT_REACHED++; continue; }
    if (a === 'MISSING') { cm.MISSING++; list.MISSING.push(x); continue; }
    if (pr === 'CRASH') { if (a === 'CRASH') { cm.TP++; list.TP.push(x); } else { cm.FP++; list.FP.push(x); } }
    else if (pr === 'LOAD') { if (a === 'CRASH') { cm.FN++; list.FN.push(x); } else cm.TN++; }
    else if (a === 'CRASH') { cm.UNKNOWN_CRASH++; list.UNKNOWN_CRASH.push(x); } else cm.UNKNOWN_LOAD++;
  }
  const known = rows.filter(x => x.actual === 'CRASH' || x.actual === 'LOAD');
  // per predicted crash code
  const perCode = {}, perClass = {}, perReach = {};
  for (const x of known) if (x.p.predicted === 'CRASH') {
    const hit = x.actual === 'CRASH';
    for (const c of x.p.crashCodes) { const s = perCode[c] = perCode[c] || { n: 0, crashed: 0, loaded: 0 }; s.n++; hit ? s.crashed++ : s.loaded++; }
    const cl = x.p.class || 'UNKNOWN', s2 = perClass[cl] = perClass[cl] || { n: 0, crashed: 0, loaded: 0 }; s2.n++; hit ? s2.crashed++ : s2.loaded++;
    const rc = x.p.reach || 'UNKNOWN', s3 = perReach[rc] = perReach[rc] || { n: 0, crashed: 0, loaded: 0 }; s3.n++; hit ? s3.crashed++ : s3.loaded++;
  }
  for (const s of [...Object.values(perCode), ...Object.values(perClass), ...Object.values(perReach)]) s.hitRate = pct(s.crashed, s.n);
  // new rule candidates: codes on actually crashed entities that no prediction named as a crash code
  const predictedCodes = new Set(rows.flatMap(x => x.p.crashCodes));
  const seen = {};
  for (const x of known) for (const c of new Set([...(x.p.codes || []), ...(x.p.portCodes || [])])) {
    const s = seen[c] = seen[c] || { crashed: 0, loaded: 0, ents: [] };
    if (x.actual === 'CRASH') { s.crashed++; if (s.ents.length < 5) s.ents.push(x.p.entity); } else s.loaded++;
  }
  const candidates = Object.entries(seen).filter(([c, s]) => s.crashed > 0 && !predictedCodes.has(c))
    .map(([code, s]) => ({ code, crashed: s.crashed, loaded: s.loaded, crashRate: pct(s.crashed, s.crashed + s.loaded), onlyOnCrashed: s.loaded === 0, entities: s.ents }))
    .sort((a, b) => b.crashRate - a.crashRate || b.crashed - a.crashed || (a.code < b.code ? -1 : 1));
  const crashedNoCode = known.filter(x => x.actual === 'CRASH' && !x.p.codes.length && !x.p.portCodes.length).map(x => x.p.entity);
  // error lines for misses
  const errLine = x => {
    const fk = new Set((x.p.files || []).map(f => f.toLowerCase()));
    const hit = exceptions.find(e => e.file && [...fk].some(f => C.fwd(e.file).toLowerCase().endsWith(f.replace(/^resource\//, ''))));
    if (hit) return `${hit.msg} [${path.basename(hit.log)}:${hit.line}, file ${hit.file}]`;
    if (x.line) return x.line;
    return exceptions.length ? `${exceptions[0].msg} [first exception in ${path.basename(exceptions[0].log)}:${exceptions[0].line}, NOT attributed to this entity]` : 'no log line available';
  };
  const misses = list.FN.concat(list.UNKNOWN_CRASH).map(x => ({ entity: x.p.entity, kind: x.p.kind, predicted: x.p.predicted, codes: x.p.codes, portCodes: x.p.portCodes, error: errLine(x) }));
  const falseAlarms = list.FP.map(x => ({ entity: x.p.entity, kind: x.p.kind, crashCodes: x.p.crashCodes, class: x.p.class, reach: x.p.reach, source: x.p.source || null }));
  const perKind = {};
  for (const x of known) { const s = perKind[x.p.kind] = perKind[x.p.kind] || { n: 0, crashed: 0 }; s.n++; if (x.actual === 'CRASH') s.crashed++; }
  const prec = pct(cm.TP, cm.TP + cm.FP), rec = pct(cm.TP, cm.TP + cm.FN + cm.UNKNOWN_CRASH);
  return { counts: { rows: rows.length, ...cm }, precision: prec, recall: rec, perCode, perClass, perReach, perKind, misses, falseAlarms, newRuleCandidates: candidates, crashedWithNoCodes: crashedNoCode, missing: list.MISSING.map(x => x.p.entity) };
}

function markdown(cal, meta) {
  const L = [];
  const c = cal.counts;
  L.push(`# gohsample calibration (${meta.target || 'as64'} preload sweep)`, '', `**${C.NOTICE}**`, '', `predictions: ${meta.predictions}; read: ${meta.read}${meta.bisect ? '; bisect: ' + meta.bisect : ''}`, '');
  if (meta.notes.length) L.push(...meta.notes.map(n => '- ' + n), '');
  L.push('## Confusion (built entities with a known outcome)', '',
    '| predicted \\ actual | CRASH | LOADED |', '|---|---|---|',
    `| CRASH | ${c.TP} (seen) | ${c.FP} (false alarm) |`,
    `| LOAD | ${c.FN} (miss) | ${c.TN} |`,
    `| UNKNOWN | ${c.UNKNOWN_CRASH} | ${c.UNKNOWN_LOAD} |`, '',
    `Not counted: ${c.MISSING} "Can't preload" (name not registered, mod not mounted or def not found), ${c.NOT_REACHED} not reached (after a crash / no log). precision ${cal.precision === null ? 'n/a' : cal.precision + '%'}, recall ${cal.recall === null ? 'n/a' : cal.recall + '%'}.`, '');
  const tab = (title, o) => { const e = Object.entries(o).sort((a, b) => b[1].n - a[1].n); if (!e.length) return; L.push(title, '', '| key | predicted crash | crashed | loaded | hit rate |', '|---|---|---|---|---|', ...e.map(([k, s]) => `| ${k} | ${s.n} | ${s.crashed} | ${s.loaded} | ${s.hitRate}% |`), ''); };
  tab('## Hit rate per predicted crash code', cal.perCode);
  tab('## By class (SPAWN = fatal at def read, USE = dies when used)', cal.perClass);
  tab('## By reach (ORPHAN counted as a crash prediction here)', cal.perReach);
  L.push('## Misses (loaded predicted or unknown, crashed)', '');
  if (!cal.misses.length) L.push('none', '');
  for (const m of cal.misses) L.push(`- ${m.entity} [${m.kind}] predicted ${m.predicted}; codes ${[...m.codes, ...m.portCodes].join(' ') || '-'}; error: ${m.error}`);
  L.push('', '## False alarms (crash predicted, loaded fine)', '');
  if (!cal.falseAlarms.length) L.push('none', '');
  for (const f of cal.falseAlarms) L.push(`- ${f.entity} [${f.kind}] ${f.crashCodes.join(' ')} class ${f.class} reach ${f.reach}`);
  L.push('', '## New rule candidates (codes on crashed entities, no crash prediction names them)', '');
  if (!cal.newRuleCandidates.length) L.push('none', '');
  for (const n of cal.newRuleCandidates) L.push(`- ${n.code}: crashed ${n.crashed}, loaded ${n.loaded} (${n.crashRate}%)${n.onlyOnCrashed ? ' ONLY on crashed entities' : ''}; e.g. ${n.entities.join(', ')}`);
  if (cal.crashedWithNoCodes.length) L.push('', `Crashed with no code of any kind (needs a new check): ${cal.crashedWithNoCodes.join(', ')}`);
  L.push('', '## Crash rate per kind', '', '| kind | entities | crashed |', '|---|---|---|', ...Object.entries(cal.perKind).sort().map(([k, s]) => `| ${k} | ${s.n} | ${s.crashed} |`), '');
  return L.join('\r\n');
}

// part B (mod_b files). actual: boot-state.json from `gohsample boot` (crashers = CRASH, clean = LOAD, untested = NOT_REACHED). ON_INCLUDE files
// (properties) are not loaded at boot: NOT_REACHED unless a results map names them (key -> CRASH|LOAD) in bootState.results.
function calibrateB(files, bootState) {
  const st = bootState || {}, crash = new Set(st.crashers || []), clean = new Set(st.clean || []), extra = st.results || {};
  const cm = { TP: 0, FP: 0, FN: 0, TN: 0, UNKNOWN_CRASH: 0, UNKNOWN_LOAD: 0, NOT_REACHED: 0 }, rows = [], perCode = {};
  for (const f of files) {
    if (f.predicted === 'NOT_BUILT') continue;
    const a = crash.has(f.file) ? 'CRASH' : clean.has(f.file) ? 'LOAD' : extra[f.file] || 'NOT_REACHED';
    rows.push({ file: f.file, loadKind: f.loadKind, predicted: f.predicted, actual: a, crashCodes: f.crashCodes, portCodes: f.portCodes });
    if (a === 'NOT_REACHED') { cm.NOT_REACHED++; continue; }
    if (f.predicted === 'CRASH') { a === 'CRASH' ? cm.TP++ : cm.FP++; for (const c of f.crashCodes) { const p = perCode[c] = perCode[c] || { n: 0, crashed: 0 }; p.n++; if (a === 'CRASH') p.crashed++; } }
    else if (f.predicted === 'LOAD') { a === 'CRASH' ? cm.FN++ : cm.TN++; }
    else a === 'CRASH' ? cm.UNKNOWN_CRASH++ : cm.UNKNOWN_LOAD++;
  }
  const portSeen = {};
  for (const r of rows) if (r.actual !== 'NOT_REACHED') for (const c of r.portCodes) { const p = portSeen[c] = portSeen[c] || { crashed: 0, loaded: 0 }; r.actual === 'CRASH' ? p.crashed++ : p.loaded++; }
  return { counts: cm, perCode, portCodeOutcomes: portSeen, rows };
}

function compare(o) {
  const out = path.resolve(o.out);
  C.guardOut(out, o.goh, o.game);
  const preds = C.readJson(o.predictions);
  const res = o.read ? readResults(o.read) : new Map();
  const notes = [];
  if (o.read && !res.size) notes.push(`${o.read}: no entity rows found`);
  if (o['bisect-log']) notes.push(...readBisect(o['bisect-log'], res));
  const ex = scanLogs(o['bisect-log']);
  if (o.read && /\.log$/i.test(o.read)) notes.push('--read is a game log: run preloadsweep read first and pass its output');
  const cal = calibrate(preds, res, ex);
  cal.notes = notes; cal.notice = C.NOTICE;
  let bootState = null;
  if (o['boot-state']) { try { bootState = C.readJson(o['boot-state']); } catch (e) { notes.push('boot-state unreadable: ' + e.message); } }
  if (preds.partB) cal.partB = calibrateB(preds.partB.files, bootState);
  C.writeJson(path.join(out, 'calibration.json'), cal);
  let mdB = '';
  if (cal.partB) { const b = cal.partB, c = b.counts; mdB = ['', '## Part B (mod_b: set/properties files, boot-load outcome)', '', `TP ${c.TP}, FP ${c.FP}, FN ${c.FN}, TN ${c.TN}, UNKNOWN crash/load ${c.UNKNOWN_CRASH}/${c.UNKNOWN_LOAD}, not reached ${c.NOT_REACHED}`, '', ...b.rows.filter(r => r.actual !== r.predicted && r.actual !== 'NOT_REACHED').map(r => `- ${r.file} [${r.loadKind}] predicted ${r.predicted}, actual ${r.actual}; codes ${[...r.crashCodes, ...r.portCodes].join(' ') || '-'}`), ''].join('\r\n'); }
  fs.writeFileSync(path.join(out, 'calibration.md'), markdown(cal, { predictions: C.fwd(o.predictions), read: o.read ? C.fwd(o.read) : '-', bisect: o['bisect-log'] ? C.fwd(o['bisect-log']) : '', notes, target: preds.target }) + mdB);
  if (!o.q) {
    const c = cal.counts;
    if (cal.partB) console.log('compare part B: ' + JSON.stringify(cal.partB.counts));
    console.log(`compare: TP ${c.TP}, false alarms ${c.FP}, misses ${c.FN} (+${c.UNKNOWN_CRASH} from UNKNOWN), TN ${c.TN}; not counted ${c.MISSING} missing, ${c.NOT_REACHED} not reached; ${cal.newRuleCandidates.length} new rule candidates -> ${path.join(out, 'calibration.md')}`);
  }
  return cal;
}

module.exports = { compare, calibrate, readResults, scanLogs };
