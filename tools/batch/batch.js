#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-4bb40772)
'use strict';
// batch: open limits rows -> scenarios -> game queue -> logs -> row verdict proposals, one report. Orchestrates other tools by child process only.
//   node tools/batch/batch.js plan [--area X] [--tag T|I] [--drafts dir] [--work dir] [--limits dir]
//   node tools/batch/batch.js run --work dir --workers N [--inst-from K] [--game G] [--exe E] [--stage e2e_test,e2e_test2,..e2e_test8] [--max-same-fail N] [--rerun report.json]
//   node tools/batch/batch.js ceiling --game G [--max 9] [--work dir]     (T24: how many instances run side by side)
//   --exe E: an exe file, or a game word as64|mowas_2|mowas2|goh (lib/games; with --game: that game's exe file there). run and ceiling are
//   AS64 only: on MoW:AS2 (mowas_2.exe has no -control, no -instance: limits TST-19, TST-130) and on GoH (no control pipe:
//   they refuse at the start with one line, exit 2. The game: --exe word or file name, else the exe under
//   --game (as64.exe, then mowas_2.exe, then binaries/x64/call_to_arms.exe). plan reads limits rows only and works for every game.
// test hooks: --testrun-bin/--logtriage-bin/--rows-bin/--rows2scn-bin <script>, --testrun-arg <x> (repeatable, e.g. --mock), --since <ms>
// never passes --apply; the report prints the apply command. Stages only via testrun --stage-as/--backup (approved folders only).
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn, spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const overlap = require('../testrun/overlap');
const TF = require('../lib/testfolders');
const tool = (n, f) => path.join(ROOT, 'tools', n, f || n + '.js');
const games = require('../lib/games'), WORDS = ['as64', 'mowas_2', 'mowas2', 'goh'];

// the game a run or ceiling would start: --exe word, else the --exe file's name, else the exe found under --game (as64.exe, then
// mowas_2.exe, then binaries/x64/call_to_arms.exe; not looked for under --mock, as before). null = not known: as before.
function autoExe(o) {
  if (!o.game || o.targs.includes('--mock')) return null;
  if (o.exeGame) { const p = path.join(o.game, ...games.get(o.exeGame).file.split('/')); return fs.existsSync(p) ? p : null; }
  return ['as64.exe', 'mowas_2.exe'].map(n => path.join(o.game, n)).find(p => fs.existsSync(p)) || null;
}
function runGame(o) {
  if (o.exeGame) return o.exeGame;
  if (o.exe) return games.idOf(path.basename(o.exe));
  const e = autoExe(o);
  if (e) return games.idOf(path.basename(e));
  if (o.game && !o.targs.includes('--mock') && fs.existsSync(path.join(o.game, 'binaries', 'x64', 'call_to_arms.exe'))) return 'goh';
  return null;
}
// batch only drives testrun pipe runs over numbered instances: none of that exists on MoW:AS2 or GoH
function refusal(o) {
  const g = runGame(o);
  if (g === 'mowas2') return games.notFor('batch', g, 'mowas_2.exe has no -control and no -instance, and batch only drives testrun pipe runs over numbered instances', 'limits TST-19, TST-130');
  if (g === 'goh') return games.notFor('batch', g, 'GoH has no control pipe, and batch only drives testrun pipe runs', 'modweb/testing/goh-drive.md');
  return null;
}

function parseArgs(a) {
  const o = { cmd: a[0], targs: [] }, bad = [];
  const val = i => { if (i + 1 >= a.length) { bad.push(a[i] + ' needs a value'); return ''; } return a[i + 1]; };
  for (let i = 1; i < a.length; i++) {
    const k = a[i];
    if (k === '--area') o.area = val(i++).toUpperCase(); else if (k === '--tag') o.tag = val(i++).toUpperCase();
    else if (k === '--drafts') o.drafts = path.resolve(val(i++)); else if (k === '--work') o.work = path.resolve(val(i++));
    else if (k === '--limits') o.limits = path.resolve(val(i++));
    else if (k === '--workers') o.workers = +val(i++); else if (k === '--inst-from') o.instFrom = +val(i++);
    else if (k === '--game') o.game = path.resolve(val(i++));
    else if (k === '--exe') { const v = val(i++); if (WORDS.includes(String(v).toLowerCase())) o.exeGame = games.idOf(v); else o.exe = path.resolve(v); }
    else if (k === '--no-overlap') o.noOverlap = true; else if (k === '--stage') o.stage = val(i++); else if (k === '--max') o.max = +val(i++);
    else if (k === '--max-same-fail') o.maxSameFail = +val(i++); else if (k === '--rerun') o.rerun = path.resolve(val(i++));
    else if (k === '--since') o.since = +val(i++); else if (k === '--inst-offset') o.instOffset = +val(i++);   // test hook: mock ids > 9 keep real instance dirs untouched
    else if (k === '--testrun-bin') o.bins = Object.assign(o.bins || {}, { testrun: path.resolve(val(i++)) });
    else if (k === '--logtriage-bin') o.bins = Object.assign(o.bins || {}, { logtriage: path.resolve(val(i++)) });
    else if (k === '--rows-bin') o.bins = Object.assign(o.bins || {}, { rows: path.resolve(val(i++)) });
    else if (k === '--rows2scn-bin') o.bins = Object.assign(o.bins || {}, { rows2scn: path.resolve(val(i++)) });
    else if (k === '--testrun-arg') o.targs.push(val(i++));
    else bad.push('unknown arg ' + k);
  }
  o.bad = bad;
  return o;
}
const bin = (o, n) => (o.bins && o.bins[n]) || tool(n);
const sh = (script, args, opt) => spawnSync(process.execPath, [script, ...args], Object.assign({ encoding: 'utf8', maxBuffer: 1 << 28 }, opt));
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
function copyTree(s, d) {
  const st = fs.statSync(s);
  if (st.isDirectory()) { fs.mkdirSync(d, { recursive: true }); for (const e of fs.readdirSync(s)) copyTree(path.join(s, e), path.join(d, e)); } else { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); }
}
const keyOf = sc => JSON.stringify([sc.mode, sc.mods, sc.fixture || [], sc.params, sc.players || null]);   // same grouping rule as testrun groupQueue

function plan(o) {
  if (o.bad.length) return die(o.bad.join('; '));
  const work = o.work || path.resolve('batch-work'), scn = path.join(work, 'scn'), qdir = path.join(work, 'queue');
  fs.mkdirSync(scn, { recursive: true }); fs.mkdirSync(qdir, { recursive: true });
  const a = ['--all-open', '--out-dir', scn, '--force', '-q'];
  if (o.area) a.push('--area', o.area); if (o.tag) a.push('--tag', o.tag); if (o.limits) a.push('--limits', o.limits);
  const r = sh(bin(o, 'rows2scn'), a);
  if (r.status !== 0) return die('rows2scn failed (' + r.status + '): ' + ((r.stderr || r.stdout || '').trim().split(/\r?\n/).pop()));
  let gen = { queue: [], skipped: [], open: 0 };
  const qf = path.join(scn, 'queue', 'queue.json');
  if (fs.existsSync(qf)) gen = readJson(qf);
  // reviewed drafts
  const entries = gen.queue.map(q => Object.assign({}, q, { source: 'rows2scn', abs: path.resolve(q.file) }));
  if (o.drafts) {
    if (!fs.existsSync(o.drafts)) return die('--drafts dir not found: ' + o.drafts);
    const dm = path.join(o.drafts, 'mods');
    if (fs.existsSync(dm)) copyTree(dm, path.join(scn, 'mods'));
    for (const f of fs.readdirSync(o.drafts).filter(f => /\.json$/i.test(f)).sort()) {
      const dst = path.join(scn, f); fs.copyFileSync(path.join(o.drafts, f), dst);
      if (entries.some(e => e.abs === path.resolve(dst))) continue;
      let sc; try { sc = readJson(dst); } catch (e) { entries.push({ file: dst, name: path.basename(f, '.json'), abs: dst, source: 'draft', parseError: e.message }); continue; }
      entries.push({ file: dst, name: sc.name || path.basename(f, '.json'), rows: sc.rows || [], mods: sc.mods || [], stageFolders: (sc.fixture || []).length, sameLaunch: sc.sameLaunch === true, manual: sc.manual ? true : undefined, source: 'draft', abs: path.resolve(dst) });
    }
  }
  // lint everything
  const lr = sh(bin(o, 'testrun'), [...o.targs.filter(x => x !== '--mock'), '--lint', scn], { cwd: scn });
  const lintBad = new Map();
  for (const l of (lr.stdout || '').split(/\r?\n/)) { const m = /^(.+?\.json):\d+: (LINT_\w+) (.*)$/.exec(l); if (m && m[2] !== 'LINT_MANUAL') lintBad.set(path.basename(m[1]), m[2]); }
  const ok = [], lintFail = [];
  for (const e of entries) { const c = lintBad.get(path.basename(e.abs)) || (e.parseError ? 'PARSE' : null); if (c) lintFail.push({ name: e.name, file: e.abs, code: c }); else ok.push(e); }
  // manual = scenario carries "manual" (testrun reports MANUAL); launches via the same grouping rule as testrun
  let launches = 0, prev = null, maxStage = 0, stageUses = 0;
  const ovItems = [];
  for (const e of ok) {
    let sc = {}; try { sc = readJson(e.abs); } catch (x) { /* keep empty */ }
    if (!sc.manual) ovItems.push({ name: e.name, file: e.abs, sc });
    e.manual = !!sc.manual; e.stageFolders = (sc.fixture || []).length; e.sameLaunch = sc.sameLaunch === true;
    const k = keyOf(sc);
    if (prev && e.sameLaunch && prev.same && prev.k === k) { e.launch = launches; } else { e.launch = ++launches; stageUses += e.stageFolders; maxStage = Math.max(maxStage, e.stageFolders); }
    prev = { k, same: e.sameLaunch };
  }
  const ov = overlap.plan(ovItems);
  ov.forEach((g, i) => { for (const it of g.items) ok.find(x => x.abs === it.file).overlapLaunch = i + 1; });
  const skippedManual = (gen.skipped || []).filter(s => /^manual/i.test(s.reason)).length;
  const runnable = ok.filter(e => !e.manual).length, manual = ok.filter(e => e.manual).length;
  const queue = ok.map(e => { const c = Object.assign({}, e); delete c.abs; return c; });
  const out = Object.assign({}, gen, { tool: 'batch', generatedBy: gen.tool || 'rows2scn', work, queue, generated: queue.length, launches, queueArg: ok.map(e => e.abs).join(','), lintFail, skipped: gen.skipped || [],
    counts: { runnable, manual, lintFail: lintFail.length, skippedManual, launches, overlapLaunches: ov.length, overlapFoldersMax: Math.max(0, ...ov.map(g => g.need)), stageFoldersMax: maxStage, stageUses } });
  const qout = path.join(qdir, 'queue.json');
  fs.writeFileSync(qout, JSON.stringify(out, null, 1) + '\n');
  const c = out.counts;
  console.log(`plan: runnable ${c.runnable}, manual ${c.manual} (+${c.skippedManual} rows classed manual by rows2scn, no scenario), lint-fail ${c.lintFail}, launches needed ${c.launches} (${c.overlapLaunches} with overlap), stage folders needed ${c.stageFoldersMax} at once (${c.stageUses} stagings total)`);
  for (const l of lintFail) console.log(`LINT_FAIL ${l.name}: ${l.code}`);
  console.log('queue: ' + qout);
  return 0;
}

function die(m) { console.error('batch: ' + m); return 2; }

function parseVerdicts(txt) {
  const rows = [];
  for (const l of txt.split(/\r?\n/)) {
    const m = /^(\S+-\d+) (\S+) (\S+) -> (.*?) {2}(\S+?)(?:: (.*))?$/.exec(l);
    if (m) rows.push({ row: m[1], verb: m[2], tag: m[3], proposal: m[4], scenario: m[5], detail: m[6] || '' });
  }
  return rows;
}
function parseFindings(txt) {
  const f = []; let by = null;
  for (const l of txt.split(/\r?\n/)) {
    const m = /^(.+?):(\d+): ([A-Z][A-Z0-9_]+) (.*)$/.exec(l);
    if (m) f.push({ file: m[1], line: +m[2], code: m[3], msg: m[4] });
    const b = /^by code: (\{.*\})/.exec(l); if (b) { try { by = JSON.parse(b[1]); } catch (e) { /* ignore */ } }
  }
  return { findings: f, byCode: by };
}

function run(o) {
  if (o.bad.length) return die(o.bad.join('; '));
  { const r = refusal(o); if (r) { console.error(r); return 2; } }
  if (!o.work) return die('run needs --work dir');
  if (!(o.workers >= 1)) return die('run needs --workers N');
  const sr = o.stage && TF.refusal(o.stage);
  if (sr) return die('--stage ' + sr);
  // workers take instances inst-from .. inst-from+N-1 (1..9, instance 0 is never used in a parallel run); mock ids are exempt
  if (!o.targs.includes('--mock') && TF.instFor(o.workers, o.instFrom == null ? 1 : o.instFrom) === null) return die('--inst-from ' + (o.instFrom == null ? 1 : o.instFrom) + ' + --workers ' + o.workers + ' leaves instances 1..9');
  const qf = path.join(o.work, 'queue', 'queue.json');
  if (!fs.existsSync(qf)) return die('no queue at ' + qf + ' (run plan first)');
  const tr = bin(o, 'testrun');
  const src = fs.existsSync(tr) ? fs.readFileSync(tr, 'utf8') : '';
  { if (!/'--workers'/.test(src)) return die('testrun has no --workers yet (tools/testrun/testrun.js); refusing to fake parallel runs'); }
  const q = readJson(qf), report = path.join(o.work, 'report.json');
  const t0 = Date.now(), since = o.since || t0;
  const ta = ['--queue', q.queueArg, ...(o.rerun ? ['--rerun', o.rerun] : []), '--workers', String(o.workers), '--out', report, '--backup', path.join(o.work, 'backup'), ...(o.noOverlap ? [] : ['--overlap']), ...o.targs];
  if (o.stage) ta.push('--stage-as', o.stage);
  if (o.maxSameFail != null) ta.push('--max-same-fail', String(o.maxSameFail));
  if (o.instFrom != null) ta.push('--inst', String(o.instFrom));
  if (o.game) ta.push('--game', o.game);
  if (o.exe) ta.push('--exe', o.exe);
  else { const e = autoExe(o); if (e) ta.push('--exe', e); }
  console.log('batch: testrun ' + ta.join(' '));
  const tres = sh(tr, ta, { stdio: ['ignore', 'pipe', 'pipe'] });
  fs.writeFileSync(path.join(o.work, 'testrun.out.txt'), (tres.stdout || '') + (tres.stderr || ''));
  const notes = [];
  if (!fs.existsSync(report)) { notes.push('testrun wrote no report (exit ' + tres.status + ')'); }
  // logtriage
  const ltBin = bin(o, 'logtriage'), ltSrc = fs.existsSync(ltBin) ? fs.readFileSync(ltBin, 'utf8') : '';
  const ltArgs = ['--since', String(since)]; if (o.game) ltArgs.push('--game', o.game);
  let lt = '';
  if (/--all-instances/.test(ltSrc) || (o.bins && o.bins.logtriage)) lt = (sh(ltBin, ['--all-instances', ...ltArgs]).stdout || '');
  else for (const i of [0, ...Array.from({ length: o.workers }, (_, s) => (o.instFrom || 1) + s)]) { const r = sh(ltBin, ['--inst', String(i), ...ltArgs]); lt += `=== instance ${i} ===\n` + (r.stdout || ''); }
  fs.writeFileSync(path.join(o.work, 'logtriage.out.txt'), lt);
  const lf = parseFindings(lt);
  // verdicts (dry only)
  let verdicts = [], vtxt = '';
  if (fs.existsSync(report)) { vtxt = sh(bin(o, 'rows'), ['verdicts', report, '--dry']).stdout || ''; verdicts = parseVerdicts(vtxt); }
  fs.writeFileSync(path.join(o.work, 'verdicts.out.txt'), vtxt);
  let rep = { queue: [] }; try { rep = readJson(report); } catch (e) { /* none */ }
  const scenarios = (rep.queue || []).map(r => ({ name: r.name, status: r.status, launch: r.launch, ms: r.ms, inst: r.inst, error: r.error || (r.reasons || [])[0] || undefined, rows: (r.rows || []).map(x => ({ id: x.id, pass: x.pass })) }));
  const st = {}; for (const s of scenarios) st[s.status] = (st[s.status] || 0) + 1;
  const wall = Date.now() - t0;
  const verbs = {}; for (const v of verdicts) verbs[v.verb] = (verbs[v.verb] || 0) + 1;
  const apply = `node tools/rows/rows.js verdicts ${report} --apply`;
  const json = { tool: 'batch', work: o.work, workers: o.workers, testrunExit: tres.status, wallMs: wall, since, totals: { scenarios: scenarios.length, byStatus: st, verdictVerbs: verbs, newLogFindings: lf.findings.length, logByCode: lf.byCode }, scenarios, verdicts, logFindings: lf.findings, notes, applyCommand: apply };
  fs.writeFileSync(path.join(o.work, 'batch-report.json'), JSON.stringify(json, null, 1) + '\n');
  const md = ['# batch report', '', `workers ${o.workers}, wall ${(wall / 1000).toFixed(1)} s, testrun exit ${tres.status}`, '',
    '## scenarios', '', '| scenario | status | launch | ms | note |', '|---|---|---|---|---|', ...scenarios.map(s => `| ${s.name} | ${s.status} | ${s.launch || '-'} | ${s.ms || '-'} | ${(s.error || '').replace(/\|/g, '/').slice(0, 80)} |`), '',
    '## row verdict proposals (dry)', '', '| row | verb | tag | proposal | scenario | detail |', '|---|---|---|---|---|---|', ...verdicts.map(v => `| ${v.row} | ${v.verb} | ${v.tag} | ${v.proposal} | ${v.scenario} | ${v.detail.replace(/\|/g, '/')} |`), '',
    `## new log findings (${lf.findings.length})`, '', ...lf.findings.slice(0, 200).map(f => `- ${f.file}:${f.line}: ${f.code} ${f.msg}`), '',
    '## totals', '', `- scenarios ${scenarios.length}: ` + (Object.entries(st).map(([k, v]) => k + ' ' + v).join(', ') || '-'), `- verdict verbs: ` + (Object.entries(verbs).map(([k, v]) => k + ' ' + v).join(', ') || '-'), `- log findings ${lf.findings.length}`, ...notes.map(n => '- note: ' + n), '',
    'Apply (manual, separate step, retags [T]/[I] rows on a positive PASS): `' + apply + '`', ''];
  fs.writeFileSync(path.join(o.work, 'batch-report.md'), md.join('\n'));
  console.log(`batch: ${scenarios.length} scenario(s) ${Object.entries(st).map(([k, v]) => k + ' ' + v).join(' ')}; verbs ${JSON.stringify(verbs)}; ${lf.findings.length} log finding(s); ${(wall / 1000).toFixed(1)} s`);
  console.log('report: ' + path.join(o.work, 'batch-report.md'));
  console.log('apply (manual): ' + apply);
  return fs.existsSync(report) ? 0 : 1;
}

// ---- ceiling (T24)
function ceilingScenario(work) {
  const f = path.join(work, 'ceiling-hello.json');
  fs.writeFileSync(f, JSON.stringify({ name: 'ceiling-hello', rows: [], mode: 'menu', mods: [], params: {}, note: 'batch ceiling: pipe-only, no mods staged, sends mp_state only', steps: [], verdict: [{ reply: 'mp_state', match: '.' }] }, null, 2) + '\n');
  return f;
}
function launch(o, f, inst, timeoutMs) {
  return new Promise(res => {
    const a = [bin(o, 'testrun'), '--scenario', f, '--inst', String(inst), '--out', path.join(o.ceilWork, `hello-${inst}.json`), '--no-mods', '--timeout', '60', '--connect-timeout', '60', '-q', ...o.targs];
    if (o.game) a.push('--game', o.game);
    if (o.exe) a.push('--exe', o.exe);
    else { const e = autoExe(o); if (e) a.push('--exe', e); }
    const t = Date.now(); let out = '';
    const c = spawn(process.execPath, a, { stdio: ['ignore', 'pipe', 'pipe'] });
    o.live.add(c);
    c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
    const kill = setTimeout(() => { try { c.kill(); } catch (e) { /* gone */ } }, timeoutMs);
    c.on('close', code => { clearTimeout(kill); o.live.delete(c); let hello = null; try { hello = JSON.parse(fs.readFileSync(path.join(o.ceilWork, `hello-${inst}.json`), 'utf8')).helloMs; } catch (e) { /* no report */ } res({ inst, code, ms: Date.now() - t, hello, out }); });
    c.on('error', e => { clearTimeout(kill); o.live.delete(c); res({ inst, code: -1, ms: Date.now() - t, out: String(e) }); });
  });
}
async function ceiling(o) {
  if (o.bad.length) return die(o.bad.join('; '));
  { const r = refusal(o); if (r) { console.error(r); return 2; } }
  if (!o.game && !o.targs.includes('--mock')) return die('ceiling needs --game G');
  const max = Math.min(9, o.max || 9), work = o.work || path.resolve('batch-work');
  fs.mkdirSync(work, { recursive: true });
  const f = ceilingScenario(work), steps = []; o.live = new Set(); o.ceilWork = work;
  const closeAll = () => { for (const c of o.live) try { c.kill(); } catch (e) { /* gone */ } };
  process.on('SIGINT', () => { closeAll(); process.exit(130); });
  let base = null, stopped = null, ok = 0;
  try {
    for (let n = 1; n <= max; n++) {
      if (!o.targs.includes('--mock') && os.freemem() < 1.5 * 2 ** 30 * n) { stopped = `free RAM ${Math.round(os.freemem() / 1048576)} MB under guard for ${n} instances (1.5 GB each)`; break; }
      const rs = await Promise.all(Array.from({ length: n }, (_, i) => launch(o, f, i + 1 + (o.instOffset || 0), 180000)));   // instances 1..n; 0 never used
      const worst = Math.max(...rs.map(r => r.hello != null ? r.hello : r.ms)), failed = rs.filter(r => r.code !== 0);
      steps.push({ instances: n, helloMs: rs.map(r => r.hello), wallMs: rs.map(r => r.ms), worstMs: worst, freeMemMB: Math.round(os.freemem() / 1048576), failed: failed.map(r => r.inst) });
      if (failed.length) { stopped = `instance ${failed[0].inst} failed to connect at ${n}`; break; }
      if (base === null) base = worst;
      if (n > 1 && worst > 3 * base) { stopped = `hello ${worst} ms > 3x single (${base} ms) at ${n}`; break; }
      ok = n;
    }
  } finally { closeAll(); }
  const result = { tool: 'batch', mode: 'ceiling', game: o.game || null, max, maxOk: ok, singleMs: base, stopped, steps, note: 'helloMs = exe spawn to pipe hello (testrun report); wallMs = whole testrun child. worst falls back to wall when no report' };
  fs.writeFileSync(path.join(work, 'ceiling.json'), JSON.stringify(result, null, 1) + '\n');
  console.log(`ceiling: ${ok} instance(s) ok of max ${max}${stopped ? '; stopped: ' + stopped : '; max reached'}; single ${base} ms; free RAM ${steps.length ? steps[steps.length - 1].freeMemMB : '-'} MB -> ${path.join(work, 'ceiling.json')}`);
  return ok >= 1 ? 0 : 1;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.cmd === 'plan') return plan(o);
  if (o.cmd === 'run') return run(o);
  if (o.cmd === 'ceiling') return ceiling(o);
  console.error('usage: node tools/batch/batch.js plan|run|ceiling ... (see header)');
  return 2;
}
if (require.main === module) main().then(c => process.exit(c), e => { console.error('batch: CRASH ' + e.stack); process.exit(2); });
module.exports = { parseVerdicts, parseFindings, plan, run, ceiling };
