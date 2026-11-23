#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-ccf1cf02)
'use strict';
// score.js: the scoreboard. Makes rows T A N B C D E of "Scoreboard" from files, never typed.
//   node tools/score/score.js [--json] [--rules] [--all-rules] [--caps caps.json] [--tests-last last.json] [--detail] [--runs-detail] [--root DIR] [--run-root DIR] [--runs runs.json] [--state FILE] [--coverage FILE] [--reports DIR] [--cells cells.csv] [--crashed crashed.json] [--missing-diffuse list.txt] [--itests itests.json] [--native-dir DIR] [--verdict-dir DIR] [--census FILE] [--limmap-dir DIR] [--limclass-dir DIR] [--determ FILE] [--results DIR] [--count-short [--set-date YYYY-MM-DD]]
//   node tools/score/score.js --classify [classify.js args] <runs dir>...   fail classes per group + triage-first stop (exit 3), see classify.js
// --count-short (SPEED-B2, forward-only,: a unit with 3 valid runs that all kill passes as [I] count-short, only for sets dated
// 2026-11-09 or later and not named C39/C39R/C39T/C39C/reproof; every older set keeps the old rule (runs >= 4). Default: old rule everywhere.
// E prints settled = G + L + I-with-test (I rows listed in tools/score/itests.json whose test file exists) and a Complete: line (PLAN.md ## Complete).
// A (SCOREA): the pass line of the newest exam draw from the newest valid run of each unit (runs.js, config runs.json): a void game never counts,
// a kill counts only when attributed to the shooter (rule attributed); the older draws print below under attributed; the proven rule, the exam-only line
// and the legacy line print only with --all-rules (T-SCORE).
// T (T-SCORE): n of m capabilities pass, from tools/score/caps.json and ../run/tests/last.json (written by ttest.js); reads files, never runs a test.
// stale = the tool's main source sha differs from the one recorded with the result; stale and missing do not count as pass.
// --runs-detail lists the run each cell came from. A (legacy, TEST-2): the pass line over one VOL cells.csv. Default file: newest run/vol*/result/cells.csv,
// with crashed.json (names of units that crashed) and missing-diffuse.txt (one unit per line) from the same folder if present. --cells alone shows the legacy line as A.
// C, D and Complete's port exam (T-BOARD) come from tools/score/results/*.json (--results DIR): hand-written score-result/1 files, each naming its
// source report; a result replaces the state.json entry of its item. Port exam is met when run once, gap lists N of N, spawn N of N and SANITY
// cells shown; the cell % is listed, not a bar. C counts steps built by the one chain script; D lists open user checks.
// Reads (read-only): ../run/sessions/w*/<session>/<run>/report.json and w*/<session>/report.json,
//*.md only for rows report.json lacks (tagged src:md), tools/score/state.json
// A score with no data prints "not measured", never zero.
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const SRC = path.resolve(HERE, '..', '..');
const DEF_ROOT = path.resolve(SRC, '..', 'run', 'sessions');

// ---------- rule sets: one count per rule set, each named ----------
// scope: which builds count; cells: which cells must pass; pick: any | latest; gun/clean: extra conditions.
const RULES = [
  { id: 'fire-out-any/all-builds', cells: ['fo'], pick: 'any', builds: 'all', gun: false, clean: false,
    text: 'fire-out only; one valid pass in any build, hand fit or tool-built (the old "25 of 27, 17 tool-built, 8 hand only" family)' },
  { id: 'both-any/tool', cells: ['fo', 'di'], pick: 'any', builds: 'tool', gun: false, clean: false,
    text: 'fire-out and damage-in; one valid pass each in tool-built builds only, any run' },
  { id: 'both-latest/tool', cells: ['fo', 'di'], pick: 'latest', builds: 'tool', gun: false, clean: false,
    text: 'fire-out and damage-in; the latest valid tool-built run of each cell must pass' },
  { id: 'both-latest+gun+clean/tool', cells: ['fo', 'di'], pick: 'latest', builds: 'tool', gun: true, clean: true,
    text: 'as both-latest/tool, and the weapon is the right gun (state.json B.wrongGun), and the latest runs are load-clean (the old "19 of 22" family, gate M3-T; its w65 figure was typed, so this count can differ from it by the reps the typed list judged by eye)' },
];

// ---------- helpers ----------
const norm = s => String(s || '').toLowerCase().replace(/^mp\/(ger|goh|rus|uk|us|jap)\//, '').replace(/[-_\s]/g, '');
const readJson = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } };
const natCmp = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
const waveNum = w => parseInt(String(w).replace(/\D/g, ''), 10) || 0;
const VARIANT_SUFFIX = /_(c\d+|gaz|t34|inf|cmp\d*)$/;
// A pair is a foe/distance variant when its name is the rep's name plus a tail, or ends in a known tail.
function isVariant(name, rep) {
  const n = norm(name.replace(/^(fo|di)_/, '')), r = norm(rep);
  return (n.startsWith(r) && n.length > r.length) || VARIANT_SUFFIX.test(name);
}
// ZSHOT-1: a kill with 0 shots from the shooter never counts. Shots = muzzle blast lines (dbg_blast) that edrun reads into report.json row.shots.
// null = unknown, never a zero: edrun writes it for a gun with no muzzle blast (row.noBlast says why, SILENT-1F), so only a number 0 drops a kill.
// shots === 0 is a measured zero. null/undefined = not read (no log, or a muzzle with no blast and hits, edrun.js:463): not a zero, the kill keeps its edrun verdict [I].
// A foe that died of fuel or crew loss with the shooter silent is a kill by someone else, so it is not the unit's kill.
// VOL-FX: edrun now writes shots 0 with shotsRead false where it wrote null: that 0 is not measured, so it is not a zero either
const zeroShot = p => !!p && typeof p.shots === 'number' && p.shots === 0 && p.shotsRead !== false;
// a row is a counted kill when edrun counted it (counted === true) and it is not a zero-shot kill. result.js uses this for the kills column of cells.csv.
const killCounts = p => !!p && p.counted === true && !zeroShot(p);
const countKills = rows => (rows || []).filter(killCounts).length;
// load-clean: no crash and no ERROR/FATAL line (warnings such as missing bones do not break it) [I]
const loadClean = g => !g.crash && !(g.errors || []).some(e => /\b(ERROR|FATAL)\b/i.test(String(e)));
// count-short, forward only): a set dated 2026-11-09 or later, not one of the named old sets, may pass a cell
// runs >= 3 where every valid run killed, marked [I] count-short. Only behind --count-short; the default stays runs >= 4.
const COUNT_SHORT_SINCE = Date.parse('2026-11-09T00:00:00');
const OLD_SETS_RE = /(^|[\\/|])(c39|c39r|c39t|c39c|reproof\d*)([\\/|]|$)/i;
const countShortApplies = (setName, setDate) => !OLD_SETS_RE.test(String(setName || '')) && Number.isFinite(setDate) && setDate >= COUNT_SHORT_SINCE;

function repOf(q) {
  const di = /^di_/.test(q.name);
  const unit = di ? q.foe : q.shooter;
  return String(unit || '').replace(/^mp\/(ger|goh|rus|uk|us|jap)\//, '');
}
function buildOf(j, rootName) {
  let built = null;
  for (const g of j.games || []) for (const l of g.pipe || []) {
    const m = /Built\s*:\s*([0-9.]+ [0-9:]+ - 0x[0-9A-Fa-f]+)/.exec(l);
    if (m) built = m[1];
  }
  const mods = (j.mods || []);
  const tool = mods.filter(m => /^b8r[34]_/.test(m));
  const hand = mods.filter(m => /^b8[a-qs-z]_/.test(m));
  const kind = tool.length ? 'tool' : (hand.length ? 'hand' : 'other');
  const exe = built ? 'built ' + built : 'root ' + rootName;
  return { exe, kind, tag: exe + ' | ' + (tool.length ? tool.join(',') : hand.length ? hand.join(',') : 'no b8 mod') };
}

// ---------- load report.json rows ----------
function collect(root) {
  const rows = []; const files = [];
  if (!fs.existsSync(root)) return { rows, files };
  for (const w of fs.readdirSync(root).filter(x => /^w\d+[a-z]*$/.test(x)).sort(natCmp)) {
    const wp = path.join(root, w);
    for (const s of fs.readdirSync(wp).sort(natCmp)) {
      const sp = path.join(wp, s);
      let st; try { st = fs.statSync(sp); } catch (e) { continue; }
      if (!st.isDirectory()) continue;
      const cand = [{ run: '.', f: path.join(sp, 'report.json') }];
      for (const r of fs.readdirSync(sp).sort(natCmp)) cand.push({ run: r, f: path.join(sp, r, 'report.json') });
      for (const c of cand) {
        if (!fs.existsSync(c.f)) continue;
        const j = readJson(c.f, null);
        if (!j || !Array.isArray(j.pairs)) { files.push({ f: c.f, bad: true }); continue; }
        files.push({ f: c.f, bad: false });
        addRun(rows, j, w, s, c.run, path.relative(root, c.f).replace(/\\/g, '/'));
      }
    }
  }
  return { rows, files };
}
function addRun(rows, j, w, s, run, rel) {
  const b = buildOf(j, w + '/' + s);
  const ctl = (j.pairs || []).some(q => q.control && q.verdict === 'PASS');
  const games = j.games || [];
  const allVoid = games.length > 0 && games.every(g => g.void);
  const clean = games.every(loadClean);
  for (const q of j.pairs || []) {
    if (q.control || !/^(fo|di)_/.test(q.name)) continue;
    const cell = q.name.startsWith('fo_') ? 'fo' : 'di';
    const killedInf = /^mp\//.test(String(q.foe));
    const rep = repOf(q);
    rows.push({
      wave: w, session: s, run, path: rel, src: 'json',
      exe: b.exe, build: b.tag, kind: b.kind,
      rep, cell, name: q.name, variant: isVariant(q.name, rep),
      shooter: q.shooter, foe: q.foe,
      mark: killedInf ? 'dead' : 'body',
      verdict: q.verdict, valid: ctl && !allVoid && q.verdict !== 'ERROR' && q.verdict !== 'MARKED', clean,
      shots: q.shots == null || q.shotsRead === false ? null : q.shots,   // VOL-FX: an unread 0 stays unknown here
    });
  }
}
const ordKey = r => [String(waveNum(r.wave)).padStart(4, '0'), r.session, r.run];
function ordCmp(a, b) {
  const x = ordKey(a), y = ordKey(b);
  for (let i = 0; i < 3; i++) { const c = natCmp(x[i], y[i]); if (c) return c; }
  return 0;
}

// ----------*.md rows, only for what report.json lacks ----------
function mdRows(reportsDir, jsonRows) {
  const out = [];
  if (!fs.existsSync(reportsDir)) return out;
  for (const f of fs.readdirSync(reportsDir).filter(x => /^rr3-[a-z]\.md$/i.test(x))) {
    const sess = f.replace(/\.md$/i, '').toUpperCase();
    const have = new Set(jsonRows.filter(r => r.session === sess).map(r => norm(r.rep) + '|' + r.cell));
    const lines = fs.readFileSync(path.join(reportsDir, f), 'utf8').split(/\r?\n/);
    let hdr = null;
    for (const ln of lines) {
      if (!/^\|/.test(ln)) { hdr = null; continue; }
      const cells = ln.split('|').slice(1, -1).map(x => x.trim());
      if (/^[-: ]+$/.test(cells.join(''))) continue;
      if (!hdr) { hdr = cells.map(x => x.toLowerCase()); continue; }
      const ri = hdr.indexOf('rep'), ci = hdr.indexOf('cell'), vi = hdr.indexOf('verdict');
      if (ri < 0 || ci < 0 || vi < 0) continue;
      const cell = /fire/.test(cells[ci]) ? 'fo' : /damage/.test(cells[ci]) ? 'di' : null;
      const v = (cells[vi].match(/PASS|NOKILL|NOORDER/) || [])[0];
      if (!cell || !v) continue;
      let rep = cells[ri].replace(/\s*\(.*\)\s*$/, '');
      const on = /^\S+ on (.+)$/.exec(rep);
      if (on) rep = on[1];
      if (/^ctl/i.test(rep) || /control/i.test(cells[ri])) continue;
      const nr = norm(rep);
      let known = false;
      for (const h of have) { const [hr, hc] = h.split('|'); if (hc === cell && (hr === nr || hr.includes(nr) || nr.includes(hr))) known = true; }
      if (known) continue;
      // report.json lacks this cell: take the md verdict, not clean-checked, tool-built by the session's brief
      out.push({ wave: 'w65', session: sess, run: '~md', path: 'plan/reports/' + f, src: 'md', exe: 'root md', build: 'md ' + sess, kind: 'tool',
        rep, cell, name: cell + '_' + rep, variant: false, shooter: '?', foe: '?', mark: '?', verdict: v, valid: true, clean: false, shots: null });
    }
  }
  return out;
}

// ---------- B ----------
function cellOf(rows, mode, buildKind) {
  const use = rows.filter(r => r.valid && !r.variant && (buildKind === 'all' || r.kind === 'tool'));
  if (!use.length) {
    const alt = rows.filter(r => r.valid && r.variant && (buildKind === 'all' || r.kind === 'tool'));
    if (!alt.length) return { state: 'none', runs: 0 };
    return cellOf(alt.map(r => Object.assign({}, r, { variant: false })), mode, buildKind);
  }
  use.sort(ordCmp);
  const last = use[use.length - 1];
  const sameBuild = use.filter(r => r.build === last.build);
  let pass;
  if (mode === 'any') pass = use.some(r => r.verdict === 'PASS');
  else pass = last.verdict === 'PASS';
  return { state: pass ? 'pass' : 'fail', runs: use.length, lastBuildRuns: sameBuild.length, last, build: last.build,
    clean: last.clean, kind: use.some(r => r.kind === 'tool' && r.verdict === 'PASS') ? 'tool' : 'hand' };
}
function scoreB(rows, state) {
  const B = (state && state.B) || {};
  const universe = (B.reps || []).slice();
  const wrong = new Set((B.wrongGun || []).map(norm));
  const byRep = {};
  for (const r of rows) (byRep[norm(r.rep)] = byRep[norm(r.rep)] || []).push(r);
  const results = [];
  for (const rule of RULES) {
    const per = []; let pass = 0, measured = 0, tool = 0, hand = 0;
    const single = [];
    for (const rep of universe) {
      const rr = byRep[norm(rep)] || [];
      const cells = {};
      let ok = true, unmeasured = false;
      for (const c of rule.cells) {
        const cs = cellOf(rr.filter(r => r.cell === c), rule.pick, rule.builds);
        cells[c] = cs;
        if (cs.state === 'none') unmeasured = true;
        if (cs.state !== 'pass') ok = false;
        if (cs.state !== 'none' && cs.lastBuildRuns === 1) single.push(rep + ' ' + c + ' (' + cs.build + ')');
      }
      if (unmeasured) { per.push({ rep, status: 'unmeasured', cells }); continue; }
      measured++;
      if (rule.gun && wrong.has(norm(rep))) ok = false;
      if (rule.clean && rule.cells.some(c => !cells[c].clean)) ok = false;
      if (ok) { pass++; if (rule.cells.every(c => cells[c].kind === 'tool')) tool++; else hand++; }
      per.push({ rep, status: ok ? 'pass' : 'fail', cells });
    }
    results.push({ rule, universe: universe.length, measured, pass, tool, hand, per, single });
  }
  return results;
}

// ---------- recorded results (T-BOARD): tools/score/results/*.json, written by hand from a report, one per board item ----------
// { form: 'score-result/1', item: 'C' | 'D' | 'portExam', source: <report path rel src/>, ... }. A file whose source report is not there,
// or with no source, is not used (listed as skipped). Files read in name order; a later file for the same item is skipped, never merged.
// A result replaces the state.json entry of its item; the board says which file it came from.
const RESULTS_DIR = path.join(HERE, 'results');
function readResults(dir, root) {
  const out = { items: {}, files: [], skipped: [] };
  if (!dir) return out;
  let names = []; try { names = fs.readdirSync(dir).filter(f => /\.json$/i.test(f)).sort(natCmp); } catch (e) { return out; }
  for (const f of names) {
    const j = readJson(path.join(dir, f), null);
    if (!j || j.form !== 'score-result/1' || !j.item) { out.skipped.push(f + ' (not score-result/1)'); continue; }
    if (!j.source || !fs.existsSync(path.resolve(root || SRC, j.source))) { out.skipped.push(f + ' (source ' + (j.source || 'none') + ' not found)'); continue; }
    if (out.items[j.item]) { out.skipped.push(f + ' (second result for ' + j.item + ')'); continue; }
    out.items[j.item] = Object.assign({ file: f }, j); out.files.push(f);
  }
  return out;
}
const fromRes = r => ' [results/' + r.file + ' <- ' + r.source + ']';
// PLAN ## Complete item 4: run once, every unit has a gap list, spawn N of N, SANITY (combat cells) shown. The cell % is listed, not a bar.
function portExamOf(r) {
  const u = +r.units || 0, g = r.gapLists || {}, s = r.spawn || {}, c = (r.sanity && r.sanity.cells) || {};
  const miss = [];
  if (!r.run) miss.push('no run');
  if (!u) miss.push('no unit count');
  if (!(g.n === u && g.of === u)) miss.push('gap lists ' + (g.n == null ? '?' : g.n) + ' of ' + u);
  if (!(s.n === u && s.of === u)) miss.push('spawn ' + (s.n == null ? '?' : s.n) + ' of ' + u);
  if (!(c.of > 0 && c.n != null)) miss.push('no SANITY cells');
  const p = c.of ? pct(c.n, c.of) : null, bar = (r.sanity && r.sanity.bar) || 70;
  const san = c.of ? 'SANITY cells ' + c.n + ' of ' + c.of + ' (' + Math.round(p) + '%' + (p < bar ? ', below ' + bar + '%: a listed result' : '') + ')' : 'SANITY not shown';
  const io = r.sanity && r.sanity.out && r.sanity.in ? ', out ' + r.sanity.out.n + '/' + r.sanity.out.of + ', in ' + r.sanity.in.n + '/' + r.sanity.in.of : '';
  return { status: miss.length ? 'open' : 'met', n: c.n, of: c.of, pct: p, missing: miss,
    text: 'run ' + (r.run || '?') + ': ' + san + io + ', spawn ' + (s.n == null ? '?' : s.n) + ' of ' + (s.of == null ? '?' : s.of) + ', gap lists ' + (g.n == null ? '?' : g.n) + ' of ' + (g.of == null ? '?' : g.of) + (miss.length ? '; open: ' + miss.join(', ') : '') };
}

// ---------- C, D (state.json or results/), E (coverage.md) ----------
function scoreC(state, res) {
  const R = res && res.items && res.items.C;
  if (R) {
    const names = ['unit', 'map', 'mission', 'bot', 'text', 'model'], st = R.steps || {};
    const pass = names.filter(n => st[n] && st[n].status === 'pass'), failed = names.filter(n => st[n] && st[n].status === 'fail');
    const open = names.filter(n => !pass.includes(n) && !failed.includes(n));
    return { measured: true, n: pass.length, of: 6, from: R.file, pass, open, failed,
      text: pass.length + ' of 6 built by one script (' + (pass.join(', ') || 'none') + ')' + (failed.length ? '; failed: ' + failed.join(', ') : '') + (open.length ? '; open: ' + open.join(', ') : '') + fromRes(R) };
  }
  const C = (state && state.C) || {};
  const steps = C.steps || {};
  const names = ['unit', 'map', 'mission', 'bot', 'text', 'model'];
  const pass = names.filter(n => steps[n] && steps[n].status === 'pass');
  const failed = names.filter(n => steps[n] && steps[n].status === 'fail');
  const looked = names.filter(n => steps[n] && steps[n].status === 'first-look');
  if (!pass.length && !failed.length) return { measured: false, text: 'not measured' + (looked.length ? ' (first looks only: ' + looked.join(', ') + ')' : '') };
  return { measured: true, n: pass.length, of: 6, text: pass.length + ' of 6 steps passed (' + pass.join(', ') + ')' + (failed.length ? '; failed: ' + failed.join(', ') : '') + (looked.length ? '; first look: ' + looked.join(', ') : '') };
}
function scoreD(state, res) {
  const R = res && res.items && res.items.D;
  if (R) {
    const checks = R.checks || [], pass = checks.filter(c => c.status === 'pass'), failed = checks.filter(c => c.status === 'fail');
    const open = checks.filter(c => c.status !== 'pass' && c.status !== 'fail');
    const short = c => String(c.name).split(':')[0];
    return { measured: true, n: pass.length, of: checks.length, from: R.file,
      text: pass.length + ' of ' + checks.length + ' door checks pass' + (pass.length ? ' (' + pass.map(short).join(', ') + ')' : '') + (failed.length ? '; failed: ' + failed.map(short).join(', ') : '') +
        (open.length ? '; open: ' + open.map(c => short(c) + (c.who === 'user' ? ' [user]' : '')).join(', ') : '') + fromRes(R) };
  }
  const D = (state && state.D) || {};
  const checks = D.checks || [];
  const pass = checks.filter(c => c.status === 'pass');
  const failed = checks.filter(c => c.status === 'fail');
  const listed = (D.chainsProven || []);
  if (!pass.length && !failed.length) return { measured: false, text: 'not measured (' + checks.length + ' door checks open' + (listed.length ? '; ' + listed.length + ' proven chains listed: ' + listed.join(', ') : '') + ')' };
  return { measured: true, n: pass.length, of: checks.length, text: pass.length + ' of ' + checks.length + ' door checks pass' + (failed.length ? '; failed: ' + failed.map(c => c.name).join(', ') : '') };
}
function readItests(f) {
  const j = readJson(f, null); if (!j) return { given: false, map: {} };
  const src = Array.isArray(j) ? j : (j.rows && typeof j.rows === 'object') ? j.rows : j;
  const map = {};
  if (Array.isArray(src)) { for (const x of src) if (x && (x.row || x.id)) map[x.row || x.id] = x; }
  else for (const k of Object.keys(src)) if (/^C\d+$/.test(k)) map[k] = typeof src[k] === 'string' ? { file: src[k] } : src[k];
  return { given: true, map };
}
function scoreE(covFile, itFile) {
  if (!fs.existsSync(covFile)) return { measured: false, text: 'not measured (no coverage file)' };
  const lines = fs.readFileSync(covFile, 'utf8').split(/\r?\n/);
  const rowsC = []; let inTab = false;
  for (const ln of lines) {
    if (/^\| # \| ability/.test(ln)) { inTab = true; continue; }
    if (!inTab) continue;
    if (!/^\|/.test(ln)) { if (rowsC.length) break; continue; }
    const c = ln.split('|').slice(1, -1).map(x => x.trim());
    if (/^C\d+$/.test(c[0])) rowsC.push({ id: c[0], ability: c[1], now: (c[4] || '').split(/\s/)[0], proven: c[5] });
  }
  const tot = rowsC.length;
  const by = {}; for (const r of rowsC) by[r.now] = (by[r.now] || 0) + 1;
  const proven = rowsC.filter(r => r.now === 'G');
  const limit = rowsC.filter(r => r.now === 'L');
  const realMod = rowsC.filter(r => r.now === 'P');
  const n = proven.length + limit.length;
  const it = readItests(itFile || path.join(HERE, 'itests.json'));
  const iRows = rowsC.filter(r => r.now === 'I');
  const iTest = iRows.filter(r => { const t = it.map[r.id]; return !!(t && t.file && fs.existsSync(path.resolve(SRC, t.file))); }).map(r => r.id);
  const iNoTest = iRows.map(r => r.id).filter(id => !iTest.includes(id));
  const settled = n + iTest.length;
  const setText = 'settled = G ' + proven.length + ' + L ' + limit.length + ' + I-with-test ' + iTest.length + ' = ' + settled + ' of ' + tot + (it.given ? (iNoTest.length ? ' (I without a test: ' + iNoTest.join(' ') + ')' : '') : ' (no tools/score/itests.json yet)');
  const brk = Object.keys(by).sort().map(k => k + ' ' + by[k]).join(', ');
  if (!tot) return { measured: false, text: 'not measured (no ability rows read)' };
  if (!n) return { measured: false, tot, by, text: 'not measured (0 of ' + tot + ' marked G; now column: ' + brk + ')' };
  return { measured: true, n, of: tot, by, settled, iTest, iNoTest, settledText: setText, text: n + ' of ' + tot + ' proven (' + proven.length + ' G, ' + limit.length + ' settled on a limit); now column: ' + brk + (realMod.length ? '; ' + realMod.length + ' by real mod, listed apart' : '') + ' | ' + setText };
}

// ---------- N (T-NATIVE): reads ../run/native/*.json written by tools/native/native.js; never runs it ----------
// a unit is native when it was checked (not skipped) and has 0 findings; skipped units are not in M. No file: the old text.
const N_NONE = 'not measured (no translation-table comparison output yet)';
function scoreN(dir) {
  let files = [];
  try { files = dir ? fs.readdirSync(dir).filter(f => /\.json$/i.test(f)).sort(natCmp) : []; } catch (e) { files = []; }
  // distinct units by name: the newest record (file mtime, then name) wins; older records of the same unit are not counted
  const recs = [];
  for (const f of files) {
    const p = path.join(dir, f);
    const j = readJson(p, null);
    if (!j || j.form !== 'native/1' || !Array.isArray(j.units)) continue;
    let t = 0; try { t = fs.statSync(p).mtimeMs; } catch (e) { /* 0 */ }
    recs.push({ f, t, j });
  }
  recs.sort((a, b) => a.t - b.t || natCmp(a.f, b.f));
  const byUnit = new Map(); let seen = 0;
  for (const r of recs) for (const u of r.j.units) { seen++; byUnit.set(String(u.unit || u.name || u.id || ''), u); }
  let m = 0, n = 0, skipped = 0, found = 0;
  for (const u of byUnit.values()) {
    if (u.skipped) { skipped++; continue; }
    m++; found += u.findings || 0;
    if (!u.findings) n++;
  }
  const read = recs.length;
  if (!read || !m) return { measured: false, text: N_NONE };
  return { measured: true, n, of: m, skipped, findings: found, distinct: byUnit.size, records: seen, text: n + ' of ' + m + ' distinct units native (0 findings)' + (m - n ? '; ' + found + ' findings on the other ' + (m - n) : '') + (skipped ? '; ' + skipped + ' skipped, not counted' : '') + ' [' + read + ' native/*.json, ' + seen + ' unit records, newest per unit; static key and value check, not an in-game result]' };
}

// ---------- P (static port verdict), L (mapped limits), R (deterministic): read files, never run a tool ----------
function scoreP(vdir, cfile) {
  let files = [];
  try { files = vdir ? fs.readdirSync(vdir).filter(f => /\.json$/i.test(f)).sort(natCmp) : []; } catch (e) { files = []; }
  const recs = [];
  for (const f of files) {
    const p = path.join(vdir, f), j = readJson(p, null);
    if (!j || j.form !== 'verdict/1' || !Array.isArray(j.units)) continue;
    let t = 0; try { t = fs.statSync(p).mtimeMs; } catch (e) { /* 0 */ }
    recs.push({ f, t, j });
  }
  recs.sort((a, b) => a.t - b.t || natCmp(a.f, b.f));
  const by = new Map();
  for (const r of recs) for (const u of r.j.units) by.set(r.j.mod + '|' + u.unit, u);
  const of = by.size; let n = 0; for (const u of by.values()) if (u.native === true) n++;
  const c = cfile ? readJson(cfile, null) : null;
  const cen = c && c.form === 'census/1' && c.done != null ? c : null;
  const ctext = cen ? 'census: ' + cen.native + ' native of ' + cen.done + ' done of ' + cen.asked + ' asked' : 'census: no record';
  if (!of) return { measured: false, census: cen ? { asked: cen.asked, done: cen.done, native: cen.native } : null, text: 'no record (no verdict/*.json); ' + ctext };
  return { measured: true, n, of, census: cen ? { asked: cen.asked, done: cen.done, native: cen.native } : null, text: n + ' of ' + of + ' units native by the static verdict; ' + ctext + ' [' + recs.length + ' verdict/*.json; no game]' };
}
function scoreL(mapDir, clsDir) {
  const ls = (d) => { try { return d ? fs.readdirSync(d).filter(f => /\.json$/i.test(f)).sort(natCmp) : []; } catch (e) { return []; } };
  const codes = new Map();
  for (const f of ls(mapDir)) {
    const j = readJson(path.join(mapDir, f), null);
    if (!j || !j.codes) continue;
    for (const k of Object.keys(j.codes)) {
      const e = j.codes[k] || {};
      const done = (Array.isArray(e.lim) && e.lim.length > 0) || e.kind === 'tool';
      codes.set(k, !!(codes.get(k) || done));
    }
  }
  let rows = 0, classed = 0, dead = 0, areas = 0;
  for (const f of ls(clsDir)) {
    const j = readJson(path.join(clsDir, f), null);
    if (!j || !j.rows) continue;
    areas++;
    for (const k of Object.keys(j.rows)) { rows++; const r = j.rows[k] || {}; if (r.class != null && r.chk != null) classed++; }
    for (const d of j.dead || []) if (!d.fix) dead++;
  }
  if (!codes.size && !rows) return { measured: false, text: 'no record (no limmap/*.json, no limclass/*.json)' };
  const mapped = [...codes.values()].filter(Boolean).length;
  const ct = codes.size ? mapped + ' of ' + codes.size + ' codes with a row or tool kind' : 'codes: no record';
  const rt = rows ? classed + ' of ' + rows + ' rows classed, ' + dead + ' dead citations left' : 'rows: no record';
  return { measured: true, codes: { mapped, of: codes.size }, rows: { classed, of: rows }, dead, text: ct + '; ' + rt + ' [' + codes.size + ' codes, ' + areas + ' limclass files]' };
}
function scoreR(file) {
  const j = file ? readJson(file, null) : null;
  if (!j || j.form !== 'determ/1') return { measured: false, text: 'no record (no determ/determ.json)' };
  const cmds = Array.isArray(j.commands) ? j.commands : [];
  const all = j.counts && j.counts.all != null ? j.counts.all : cmds.length;
  const same = j.counts && j.counts.same != null ? j.counts.same : cmds.filter(c => c.same === true).length;
  const diff = cmds.filter(c => c.same === false).map(c => c.id).sort(natCmp);
  return { measured: true, n: same, of: all, text: same + ' of ' + all + ' commands give the same bytes twice' + (diff.length ? '; differ: ' + diff.slice(0, 6).join(' ') + (diff.length > 6 ? ' +' + (diff.length - 6) : '') : '') };
}

// ---------- Complete ## Complete, rewritten 2026-11-09): T, D, C, port exam, MP, M5, M6; one state per item ----------
// from row T (ttest.js), state.json C/D/Complete. MP 'met' = met on the user's word 2026-11-09), counts as done.
function scoreComplete(state, E, C, D, T, res) {
  const K = (state && state.Complete) || {};
  const PR = res && res.items && res.items.portExam;
  const st = (x, dflt) => (x && x.status) || dflt;
  const items = [];
  items.push({ id: 'T', name: 'every capability has its test and all pass', status: T && T.measured ? (T.n === T.of ? 'pass' : 'open') : 'not measured', text: T && T.measured ? T.n + ' of ' + T.of + ' pass' : 'not measured' });
  items.push({ id: 'D', name: 'clean folder + GUI (door)', status: D && D.measured ? (D.n === D.of ? 'pass' : 'open') : 'not measured', text: D && D.measured ? D.n + ' of ' + D.of + ' checks' : 'not measured' });
  items.push({ id: 'C', name: 'chain mod from one script, 6 of 6', status: C && C.measured ? (C.n === 6 ? 'pass' : 'open') : 'not measured', text: C && C.measured ? C.n + ' of 6' : 'not measured' });
  const pe = K.portExam || {};
  if (PR) { const x = portExamOf(PR); items.push({ id: 'port exam', name: 'port exam once', status: x.status, text: x.text + fromRes(PR), exam: x }); }
  else items.push({ id: 'port exam', name: 'port exam once', status: st(pe, 'open'), text: pe.n != null ? pe.n + ' of ' + pe.of + (pe.run ? ' (' + pe.run + ')' : '') : 'not run' });
  const mp = K.MP || {};
  items.push({ id: 'MP', name: 'MP', status: st(mp, 'not measured'), text: mp.status === 'met' ? (mp.note || 'met') : mp.units != null ? mp.units + ' of 5 units' + (mp.run ? ' (' + mp.run + ')' : '') : st(mp, 'not measured') });
  const m5 = K.M5 || {};
  items.push({ id: 'M5', name: '80% of GoH groups (M5)', status: st(m5, 'not measured'), text: m5.n != null ? m5.n + ' of ' + m5.of + ' (bar ' + m5.bar + ')' + (m5.set ? ' ' + m5.set : '') + (m5.note ? '; ' + m5.note : '') : 'not measured' });
  const m6 = K.M6 || {}, ms = st(m6.match, 'open');
  items.push({ id: 'M6', name: 'one mod + played match (M6)', status: (C && C.measured && C.n === 6 && ms === 'pass') ? 'pass' : (ms === 'fail' ? 'fail' : 'open'), text: 'chain ' + (C && C.measured ? C.n + ' of 6' : 'not measured') + ', match ' + ms });
  return { items, done: items.filter(i => i.status === 'pass' || i.status === 'met').length, text: items.map(i => i.id + ' ' + i.status + ' (' + i.text + ')').join('; ') };
}

// ---------- A: the pass line of "Pass line (REASSESS-9)", over a VOL cells.csv ----------
// cells.csv: one row per unit, unit side (runs, kills = counted kills after screening, noorder, moved) and donor side (d_*), written by the VOL result step.
// pass = counted kills x 2 >= valid runs, at least 4 valid runs, and moved on an order if it can move ('-' = cannot move, 'a/b' = a of b runs moved).
// fail whatever the donor did: not built (MISS), crash (opts.crashed), never takes an order, diffuse resolves nowhere (opts.missingDiffuse). Short (1..3 runs) is a fail that is listed, never dropped.
// both-fail apart: unit fails, donor fails, and the unit's fail is not one of those hard faults. Unarmed units pass on the move and are listed.
function parseCells(text) {
  const lines = String(text).split(/\r?\n/).filter(l => l.trim());
  const head = lines.shift().split(',');
  return lines.map(l => { const c = l.split(','), o = {}; head.forEach((h, i) => { o[h] = c[i] === undefined ? '' : c[i]; }); return o; });
}
const movedOk = m => { m = String(m || '').trim(); if (m === '-') return true; const x = /^(\d+)\/(\d+)$/.exec(m); return !!x && +x[1] >= 1 && +x[1] * 2 >= +x[2]; };
const pct = (a, b) => (b ? Math.round(1000 * a / b) / 10 : 0);
function passLine(rows, opts) {
  opts = opts || {};
  const crashed = new Set((opts.crashed || []).map(norm)), tex = new Set((opts.missingDiffuse || []).map(norm));
  const cells = [], warnings = [];
  if (!opts.crashed) warnings.push('no crash list given: a unit that crashed cannot be told from a silent one, and may be counted apart');
  for (const r of rows) {
    const c = { unit: r.unit, class: r.class, pass: false, why: '', hard: false, donorPass: null, unarmed: r.fired === 'unarmed', short: false };
    const runs = +r.runs || 0, kills = +r.kills || 0, noord = +r.noorder || 0;
    if (/^MISS/.test(r.state) || r.fired === 'not built') { c.why = 'not built'; c.hard = true; c.miss = true; }
    else if (crashed.has(norm(r.unit))) { c.why = 'crash'; c.hard = true; }
    else if (tex.has(norm(r.unit))) { c.why = 'texture: diffuse resolves nowhere'; c.hard = true; c.tex = true; }
    else if (c.unarmed) { c.pass = movedOk(r.moved); c.why = c.pass ? 'unarmed, passes on the move' : 'unarmed, did not move'; }
    else if (!runs) c.why = 'no kill run';
    else if (runs < 4 && opts.countShort && runs >= 3 && kills === runs && noord < runs && movedOk(r.moved)) { c.pass = true; c.countShort = true; c.why = '[I] count-short: ' + kills + ' of ' + runs; }
    else if (runs < 4) { c.short = true; c.why = 'short: ' + runs + ' valid runs, needs 4'; }
    else if (noord >= runs) { c.why = 'never takes an order'; c.hard = true; }
    else if (!movedOk(r.moved)) c.why = 'did not move on an order (' + (r.moved || 'no row') + ')';
    else if (kills * 2 >= runs) { c.pass = true; c.why = kills + ' of ' + runs; }
    else c.why = kills + ' of ' + runs + ', under half';
    // the donor on the same pair, same line
    if (!c.miss) {
      const dr = +r.d_runs || 0, dk = +r.d_kills || 0;
      c.donorPass = r.d_fired === 'unarmed' ? movedOk(r.d_moved) : (dr >= 4 && movedOk(r.d_moved) && dk * 2 >= dr);
    }
    c.noProof = c.pass && !c.unarmed && !(+r.kills_with_fire_proof > 0);
    const side = /^U([+-])D([+-])$/.exec(r.outcome || '');
    if (side && !c.hard && ((side[1] === '+') !== c.pass || (side[2] === '+') !== c.donorPass)) c.mismatch = r.outcome;
    c.apart = !c.pass && !c.hard && c.donorPass === false;
    cells.push(c);
  }
  const tot = cells.length, pass = cells.filter(c => c.pass).length;
  const un = cells.filter(c => c.unarmed), apart = cells.filter(c => c.apart), unPass = un.filter(c => c.pass).length;
  const mk = (p, of) => ({ pass: p, of, pct: pct(p, of) });
  const all = mk(pass, tot), ap = mk(pass, tot - apart.length);
  const armed = mk(pass - unPass, tot - un.length), armedApart = mk(pass - unPass, tot - un.length - apart.filter(c => !c.unarmed).length);
  const p = ap.pct;
  const row = p >= 70 ? '70% or more' : p >= 40 ? '40 to 70%' : 'under 40%';
  const then = { '70% or more': 'route stands. Fix top causes, then volume', '40 to 70%': 'fix top 2 causes across classes, next exam', 'under 40%': 'class packs only; try direct conversion on the worst class' }[row];
  return {
    all, apart: ap, armed, armedApart,
    bothFail: apart.map(c => c.unit), unarmed: un.map(c => c.unit), short: cells.filter(c => c.short).map(c => c.unit), countShort: cells.filter(c => c.countShort).map(c => c.unit),
    noProof: cells.filter(c => c.noProof).map(c => c.unit), zeroShot: rows.filter(r => /zeroshot/.test(r.screened_out || '')).map(r => r.unit + ' ' + r.screened_out), texFail: cells.filter(c => c.tex).map(c => c.unit),
    mismatch: cells.filter(c => c.mismatch).map(c => c.unit + ' ' + c.mismatch),
    unfit: apart.length * 5 > tot, pick: { row, then, on: 'both-fail apart ' + ap.pass + ' of ' + ap.of + ' (' + ap.pct + '%)' },
    warnings, cells,
  };
}
function aText(a, from) {
  const f = x => x.pass + ' of ' + x.of + ' (' + Math.round(x.pct) + '%)';
  return f(a.all) + ' all drawn | ' + f(a.apart) + ' both-fail apart (' + a.bothFail.length + ' apart) | ' + f(a.armed) + ' armed only (' + f(a.armedApart).replace(/ \(.*/, '') + ' armed, apart)' +
    ' | row picked on ' + a.pick.on + ': ' + a.pick.row + ', ' + a.pick.then + (a.unfit ? ' | TEST UNFIT: over 1 in 5 of the draw is both-fail' : '') +
    (a.short.length ? ' | short ' + a.short.length + ': ' + a.short.join(' ') : '') + (a.countShort && a.countShort.length ? ' | [I] count-short ' + a.countShort.length + ': ' + a.countShort.join(' ') : '') + (a.warnings.length ? ' | ' + a.warnings.join('; ') : '') + (from ? ' [' + from + ']' : '');
}
// the newest run/vol*/result/cells.csv beside the sessions root, with crashed.json and missing-diffuse.txt from the same folder when they exist
function findCells(root) {
  const run = path.resolve(root, '..');
  let best = null;
  try { for (const d of fs.readdirSync(run).filter(x => /^vol\d+$/i.test(x)).sort(natCmp)) { const f = path.join(run, d, 'result', 'cells.csv'); if (fs.existsSync(f)) best = f; } } catch (e) { /* none */ }
  return best;
}
function scoreA(opts) {
  const f = opts.cellsFile;
  if (!f || !fs.existsSync(f)) return { measured: false, text: 'not measured (no cells.csv from an exam: pass --cells FILE or put one in run/vol*/result/)' };
  const dir = path.dirname(f), cf = opts.crashedFile || path.join(dir, 'crashed.json'), tf = opts.diffuseFile || path.join(dir, 'missing-diffuse.txt');
  const crashed = fs.existsSync(cf) ? readJson(cf, null) : null;
  const missing = fs.existsSync(tf) ? fs.readFileSync(tf, 'utf8').split(/[\r\n,]+/).map(s => s.trim()).filter(s => s && !s.startsWith('#')) : (opts.missingDiffuse || []);
  const cs = !!opts.countShort && countShortApplies(path.resolve(f), Number.isFinite(opts.setDate) ? opts.setDate : fs.statSync(f).mtimeMs);
  const a = passLine(parseCells(fs.readFileSync(f, 'utf8')), { crashed: Array.isArray(crashed) ? crashed.map(x => (x && x.shooter) || x) : null, missingDiffuse: missing, countShort: cs });
  return Object.assign({ measured: true, countShortRule: !opts.countShort ? 'old' : cs ? 'count-short' : 'old (set before 2026-11-09 or named old)', n: a.apart.pass, of: a.apart.of, text: aText(a, path.basename(path.dirname(dir)) + '/' + path.basename(dir) + '/' + path.basename(f)) }, { passLine: a });
}

// ---------- build the whole board ----------
function board(opts) {
  opts = opts || {};
  const root = opts.root || DEF_ROOT;
  const state = opts.stateObj || readJson(opts.state || path.join(HERE, 'state.json'), {});
  const { rows: jrows, files } = opts.rowsObj ? { rows: opts.rowsObj, files: [] } : collect(root);
  const md = opts.rowsObj ? [] : mdRows(opts.reports || path.join(SRC, 'plan', 'reports'), jrows);
  const rows = jrows.concat(md);
  const b = scoreB(rows, state);
  // recorded results: --results DIR, else tools/score/results on the real board; invented-row boards (tests) read none unless given
  const res = opts.resultsObj || readResults(opts.results || (opts.rowsObj ? null : RESULTS_DIR), opts.resultsRoot);
  const out = {
    files: files.length, badFiles: files.filter(f => f.bad).length, rows: rows.length, mdRows: md.length,
    AR: (opts.runsCfg || opts.runRoot || (!opts.rowsObj && !opts.cellsFile)) ? require('./runs.js').scoreRuns({ cfg: opts.runsCfg, runRoot: opts.runRoot || path.resolve(root, '..'), countShort: opts.countShort, setDate: opts.setDate }) : null,
    A: scoreA({ cellsFile: opts.cellsFile || (opts.rowsObj ? null : findCells(root)), crashedFile: opts.crashedFile, diffuseFile: opts.diffuseFile, countShort: opts.countShort, setDate: opts.setDate }),
    N: scoreN(opts.nativeDir || (opts.rowsObj ? null : path.resolve(root, '..', 'native'))),
    P: scoreP(opts.verdictDir || process.env.SCORE_VERDICT_DIR || (opts.rowsObj ? null : path.resolve(root, '..', 'verdict')), opts.census || process.env.SCORE_CENSUS || (opts.rowsObj ? null : path.resolve(root, '..', 'census', 'census.json'))),
    L: scoreL(opts.limmapDir || process.env.SCORE_LIMMAP_DIR || (opts.rowsObj ? null : path.join(HERE, '..', 'lib', 'limmap')), opts.limclassDir || process.env.SCORE_LIMCLASS_DIR || (opts.rowsObj ? null : path.join(HERE, '..', 'lib', 'limclass'))),
    R: scoreR(opts.determ || process.env.SCORE_DETERM || (opts.rowsObj ? null : path.resolve(root, '..', 'determ', 'determ.json'))),
    B: b,
    C: scoreC(state, res), D: scoreD(state, res), E: scoreE(opts.coverage || path.join(SRC, 'plan', 'coverage.md'), opts.itests),
    results: { files: res.files, skipped: res.skipped },
    rowsList: rows,
  };
  out.T = require('./ttest.js').scoreT({ caps: opts.caps, last: opts.tlast, root: opts.troot });
  out.complete = scoreComplete(state, out.E, out.C, out.D, out.T, res);
  return out;
}

function render(bd, opts) {
  opts = opts || {};
  const L = [];
  L.push('SCOREBOARD  (' + bd.files + ' report.json read, ' + bd.badFiles + ' unreadable, ' + bd.rows + ' pair rows, ' + bd.mdRows + ' rows from plan/reports md' +
    (bd.results ? ', ' + bd.results.files.length + ' recorded results' + (bd.results.skipped.length ? ', skipped: ' + bd.results.skipped.join('; ') : '') : '') + ')');
  L.push('');
  const main = bd.B.find(x => x.rule.id === 'both-latest+gun+clean/tool') || bd.B[0];
  const AR = bd.AR && bd.AR.measured ? bd.AR : null, RS = AR ? require('./runs.js') : null;
  const aHead = AR ? AR.head.rules.attributed.passLine : null;
  L.push('T Tests       ' + (bd.T ? bd.T.text : 'not measured'));
  L.push('A Port        ' + (AR ? RS.short(aHead) + ' | row ' + aHead.pick.row + (aHead.unfit ? ' | TEST UNFIT: over 1 in 5 both-fail' : '') + ' [' + AR.head.id + ', newest valid run per unit, kills attributed to the shooter]' : bd.A.text));
  L.push('N Native      ' + bd.N.text);
  L.push('P Port verdict ' + bd.P.text);
  L.push('L Limits      ' + bd.L.text);
  L.push('R Determinism ' + bd.R.text);
  L.push('B Regression  ' + (main.measured ? main.pass + ' of ' + main.measured + ' measured (' + main.rule.id + '; universe ' + main.universe + ')' : 'not measured') + '   other rule sets below, they do not compare');
  L.push('C Chain       ' + bd.C.text);
  L.push('D Door        ' + bd.D.text);
  L.push('E Coverage    ' + bd.E.text);
  if (bd.complete) L.push('Complete:     ' + bd.complete.done + ' of ' + bd.complete.items.length + ' | ' + bd.complete.text);
  L.push('');
  if (AR) {
    // PLAN.md "Scoreboard": A shows one rule set (attributed) by default; proven, exam only and legacy only with --all-rules. Numbers unchanged.
    const all = !!opts.allRules;
    L.push('A by rule set (newest valid run per unit, ' + AR.minRuns + '+ valid rows; void games never count; one count per rule set' + (all ? '' : '; attributed shown, other rule sets: --all-rules') + '):');
    for (const ex of AR.exams) {
      if (!ex.measured) { L.push('  ' + ex.id.padEnd(8) + ex.text); continue; }
      L.push('  ' + ex.id.padEnd(8) + 'attributed  ' + RS.short(ex.rules.attributed.passLine));
      if (all) L.push('  ' + ''.padEnd(8) + 'proven      ' + RS.short(ex.rules.proven.passLine));
      if (all) L.push('  ' + ''.padEnd(8) + 'exam only   ' + RS.short(ex.examOnly) + '  (attributed, exam stage only)');
      const nr = ex.rules.attributed.src.filter(x => x.noRun).map(x => x.unit);
      if (nr.length) L.push('  ' + ''.padEnd(8) + 'no valid run: ' + nr.join(' '));
      if (opts.rules) L.push('      stages: ' + ex.stages.map(s => s.id + (s.mode !== 'order' ? ' [' + s.mode + ']' : '') + ' ' + s.games + 'g/' + s.void + 'void').join('; '));
    }
    if (all) L.push('  legacy  ' + bd.A.text);
    if (opts.rules) for (const k of Object.keys(RS.RULES)) if (all || k === 'attributed') L.push('      ' + k + ': ' + RS.RULES[k].text);
    if (opts.runsDetail) for (const ex of AR.exams) if (ex.measured) { L.push(''); L.push('A sources ' + ex.id + ' (attributed):'); for (const l of RS.srcTable(ex, 'attributed')) L.push('  ' + l); }
    L.push('');
  }
  L.push('B by rule set (same reports, one count per rule set):');
  for (const r of bd.B) {
    const cnt = r.measured ? r.pass + ' of ' + r.measured + ' measured' + (r.measured < r.universe ? ' (' + (r.universe - r.measured) + ' of ' + r.universe + ' unmeasured)' : '') : 'not measured';
    L.push('  ' + r.rule.id.padEnd(30) + cnt + (r.measured ? '  [tool-built both cells ' + r.tool + ', other ' + r.hand + ']' : ''));
    if (opts.rules) L.push('      ' + r.rule.text);
  }
  const m = main;
  const fails = m.per.filter(p => p.status === 'fail').map(p => p.rep);
  const un = m.per.filter(p => p.status === 'unmeasured').map(p => p.rep);
  L.push('');
  L.push('Fails under ' + m.rule.id + ': ' + (fails.join(', ') || 'none'));
  L.push('Unmeasured under it: ' + (un.join(', ') || 'none'));
  L.push('');
  L.push('Cells that rest on one run in their latest build (' + m.rule.id + '): ' + m.single.length);
  for (const s of m.single) L.push('  ' + s);
  if (opts.detail) {
    L.push('');
    L.push('Rows behind ' + m.rule.id + ':');
    L.push('  rep | cell | state | runs | last run | mark | foe | shooter | build');
    for (const p of m.per) for (const c of Object.keys(p.cells)) {
      const x = p.cells[c];
      L.push('  ' + p.rep + ' | ' + c + ' | ' + x.state + ' | ' + x.runs + ' | ' + (x.last ? x.last.wave + '/' + x.last.session + '/' + x.last.run + ' ' + x.last.verdict : '-') +
        ' | ' + (x.last ? x.last.mark + ' | ' + x.last.foe + ' | ' + x.last.shooter : '- | - | -') + ' | ' + (x.build || '-'));
    }
  }
  return L.join('\n');
}

function main() {
  const a = process.argv.slice(2); const o = {};
  const ci = a.indexOf('--classify');
  if (ci >= 0) return require('./classify.js').main(a.filter((x, i) => i !== ci));
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--all-rules') o.allRules = true; else if (a[i] === '--caps') o.caps = a[++i]; else if (a[i] === '--tests-last') o.tlast = a[++i];
    else if (a[i] === '--json') o.json = true; else if (a[i] === '--rules') o.rules = true; else if (a[i] === '--detail') o.detail = true;
    else if (a[i] === '--root') o.root = a[++i]; else if (a[i] === '--state') o.state = a[++i];
    else if (a[i] === '--coverage') o.coverage = a[++i]; else if (a[i] === '--reports') o.reports = a[++i];
    else if (a[i] === '--runs-detail') o.runsDetail = true; else if (a[i] === '--run-root') o.runRoot = a[++i]; else if (a[i] === '--runs') o.runsCfg = a[++i];
    else if (a[i] === '--cells') o.cellsFile = a[++i]; else if (a[i] === '--crashed') o.crashedFile = a[++i]; else if (a[i] === '--missing-diffuse') o.diffuseFile = a[++i];
    else if (a[i] === '--results') o.results = a[++i];
    else if (a[i] === '--native-dir') o.nativeDir = a[++i]; else if (a[i] === '--verdict-dir') o.verdictDir = a[++i]; else if (a[i] === '--census') o.census = a[++i];
    else if (a[i] === '--limmap-dir') o.limmapDir = a[++i]; else if (a[i] === '--limclass-dir') o.limclassDir = a[++i]; else if (a[i] === '--determ') o.determ = a[++i];
    else if (a[i] === '--itests') o.itests = a[++i]; else if (a[i] === '--count-short') o.countShort = true; else if (a[i] === '--set-date') o.setDate = Date.parse(a[++i] + 'T00:00:00');
  }
  const bd = board(o);
  if (o.json) { const c = Object.assign({}, bd); delete c.rowsList; if (c.AR && c.AR.exams) c.AR = { measured: c.AR.measured, minRuns: c.AR.minRuns, head: c.AR.head.id, exams: c.AR.exams.map(e => e.measured ? { id: e.id, n: e.n, of: e.of, attributed: e.rules.attributed.passLine, proven: e.rules.proven.passLine, examOnly: e.examOnly, src: e.rules.attributed.src, stages: e.stages } : e) }; console.log(JSON.stringify(c, (k, v) => (k === 'last' ? (v ? { path: v.path, verdict: v.verdict, build: v.build } : v) : v), 1)); }
  else console.log(render(bd, o));
  return 0;
}
module.exports = { scoreP, scoreL, scoreR, readResults, portExamOf, RESULTS_DIR, scoreN, natCmp, countShortApplies, COUNT_SHORT_SINCE, zeroShot, killCounts, countKills, parseCells, passLine, scoreA, findCells, RULES, board, render, scoreB, scoreC, scoreD, scoreE, scoreComplete, readItests, collect, addRun, cellOf, norm, isVariant, loadClean };
if (require.main === module) { const rc = main(); if (rc) process.exitCode = rc; }
