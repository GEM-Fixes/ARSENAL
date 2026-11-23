// Author: Imperator_Aug (ARSENAL, ia-59cf6cd5)
'use strict';
// testplan static: the no-game checks of a plan. One run of each tool for the whole plan, findings mapped to rows.
// Contract: tools/testplan/README.md "verdict" + the Checks table of "rows".
//   run(stack, plan, {only, onProgress, tools, cap, tmp, units, checkJson}) -> Promise of
//     {rows:[{id, status, result:{tool, findings:[{file, line, code, msg, severity}], note}}], tools:[{tool, ms, ok, error}], notes:[..]}
//   only        check ids (list or comma text); none = every static row of the plan
//   onProgress  ({tool, done, total}) after each tool
//   tools       {name: async (stack, ctx) => findings | {findings, note} | {cannot: 'why'}}: replaces the built-in tool of that
//               name (tests need no game). ctx = {plan, rows (the rows this tool serves), tmp, units}.
//               `checkReport: async (stack, ctx) => R` replaces the `check` child process (R = a check --json document)
//   cap         tools side by side, default 4
//   tmp         where the check report is kept (`<tmp>/check.json`); default `<state>/run`
//   checkJson   a check --json report that already exists (the GUI's Check page result)
// Tools:
//   ONE `check` run (tools/check/check.js --json; it runs wouldload and doctor, doctor runs the linters) feeds the checks refs
//   (refcheck), parse (sdllint, binhdr), load (the verdict + crash findings), text (lnglint), mission (milint), the conflicts half
//   of over, and sync (mpsync). Its findings carry their tool (`findings[].tool`); none of those linters is started again here.
//   A tool check skipped, that failed or timed out, or whose finding list is cut (--locs) leaves its rows `todo` with that reason.
//   Reuse: opt.checkJson, else `<tmp>/check.json` of an earlier run, when it is newer than the newest changed file of the plan,
//   names the same mod and the same exe, is not a --fast report and (our own) holds the tools this plan needs. Else check runs and
//   its report is kept at `<tmp>/check.json`. The note of each row says which report was used and its time.
//   Our own, over the plan's items only: firecheck (aim), edrun preflight faultsIn (faults), the card check from the units list
//   (card), overdiff (over).
// A finding: {file, line, code, msg, severity:'error'|'warning'|'note'|'unchecked', entity?, all?, rowId?}
//   entity     the entity (or weapon, card) the finding names; without it the name is looked for as a whole word in msg
//   all:true   the finding is about the whole mod: it lands on every row of the check
//   rowId      the finding is about that row only
//   unchecked  the tool could not read this file: its rows stay `todo` (never a pass by silence)
// Status of a row: `fail` a failing finding; `todo` a tool of its check did not run or left it unchecked; else `pass`.
// What fails (FAILS below): refs = REF_* errors; over = OVR_FILE_DELETED of a file a REF_* finding still names (or `named:true`);
// every other check = any error. Warnings and notes are listed, they never fail.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const TOOLS_DIR = path.join(__dirname, '..', '..');
const HOLDS_VERDICT = ['LIKELY_CRASH', 'REFUSED'];
// check id -> the tools that prove it (README Checks table, static rows only)
const CHECK_TOOLS = {
  refs: ['refcheck'], parse: ['sdllint', 'binhdr'], load: ['check'], aim: ['firecheck'], faults: ['preflight'], card: ['statsheet'],
  text: ['lnglint'], mission: ['milint'], over: ['overdiff', 'conflicts'], sync: ['mpsync'],
};
// the tools whose findings come out of the one check report (`check` = its load verdict)
const FROM_CHECK = ['refcheck', 'sdllint', 'binhdr', 'lnglint', 'milint', 'conflicts', 'mpsync', 'check'];
// what check --fast leaves out (tools/check/check.js FAST_SKIP)
const FAST_SKIP = ['keylint', 'milint', 'binhdr', 'humlint', 'expcheck', 'sdllint', 'refcheck'];
const lc = s => String(s == null ? '' : s).toLowerCase();
// a path as rows and findings are compared: lower case, forward slashes, the pak part and everything up to resource/ cut
const np = s => { let p = lc(s).replace(/\\/g, '/'); const b = p.lastIndexOf('!'); if (b >= 0) p = p.slice(b + 1); return p.replace(/^.*?(?:^|\/)resource\//, '').replace(/^(?:\.?\/)+/, ''); };
const sameFile = (a, b) => !!a && !!b && (a === b || a.endsWith('/' + b) || b.endsWith('/' + a));
const kindOfRow = r => { const i = String(r.item || '').indexOf(':'); return i < 0 ? '' : r.item.slice(0, i); };
const keyOfRow = r => { const i = String(r.item || '').indexOf(':'); return i < 0 ? '' : r.item.slice(i + 1); };
const NAMED_KINDS = { entity: 'entity', weapon: 'weapon', ammo: 'ammo', card: 'card', squad: 'card', breed: 'card' };
const pathLike = s => /\.[a-z0-9]{2,5}$/i.test(String(s || ''));

// the names a finding may use for the row's item (a card item of a units file has none)
function namesOf(row) {
  const t = row.target || {}, k = kindOfRow(row), out = [];
  if (NAMED_KINDS[k]) { out.push(t[NAMED_KINDS[k]]); out.push(keyOfRow(row)); }
  return [...new Set(out.filter(n => n && !pathLike(n)).map(lc))];
}
// the files of a row: its target file; a row with no file and no name takes the changed files of its item (`why`)
function filesOf(row, items) {
  const t = row.target || {};
  if (t.file) return [np(t.file)];
  if (namesOf(row).length) return [];
  const it = items && items.get(row.item);
  return it && Array.isArray(it.why) ? [...new Set(it.why.map(w => np(w && w.rel)).filter(Boolean))] : [];
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameRe = n => new RegExp('(^|[^a-z0-9_])' + esc(n) + '([^a-z0-9_]|$)');
const entityHit = (names, f) => { const e = lc(f.entity), b = e.split('/').pop(); return names.some(n => n === e || n === b); };
const dirOf = (row, rf) => { if (kindOfRow(row) !== 'entity' || !/\.def$/.test(rf)) return null; const d = path.posix.dirname(rf); return d.includes('/') ? d : null; };
// does a finding belong to a row: the row's file, a file of the entity's folder, or the entity name (one pair; run() uses an index)
function matches(row, f, items) {
  if (f.rowId !== undefined) return f.rowId === row.id;
  if (f.all) return true;
  const files = filesOf(row, items), ff = np(f.file), names = namesOf(row);
  if (!files.length && !names.length) return true;             // a row about the whole mod (sync)
  for (const rf of files) {
    if (sameFile(rf, ff)) return true;
    const d = dirOf(row, rf); if (d && ff.startsWith(d + '/')) return true;
  }
  if (!names.length) return false;
  if (f.entity != null && f.entity !== '') return entityHit(names, f);
  const m = lc(f.msg);
  return names.some(n => n.length >= 3 && nameRe(n).test(m));
}
// the same rule for many rows: findings of one tool, looked up by file, folder, name and word
function indexOf(list) {
  const ix = { list, all: [], byRow: new Map(), byFile: new Map(), bySuffix: new Map(), byDir: new Map(), byEntity: new Map(), byTok: new Map() };
  const put = (m, k, f) => { const a = m.get(k); if (a) a.push(f); else m.set(k, [f]); };
  for (const f of list) {
    if (f.rowId !== undefined) { put(ix.byRow, f.rowId, f); continue; }
    if (f.all) { ix.all.push(f); continue; }
    const ff = np(f.file);
    if (ff) {
      put(ix.byFile, ff, f);
      for (let i = ff.indexOf('/'); i >= 0; i = ff.indexOf('/', i + 1)) put(ix.bySuffix, ff.slice(i + 1), f);
      for (let i = ff.lastIndexOf('/'); i > 0; i = ff.lastIndexOf('/', i - 1)) put(ix.byDir, ff.slice(0, i), f);
    }
    if (f.entity != null && f.entity !== '') { const e = lc(f.entity); put(ix.byEntity, e, f); const b = e.split('/').pop(); if (b !== e) put(ix.byEntity, b, f); }
    else for (const t of new Set(lc(f.msg).split(/[^a-z0-9_]+/).filter(Boolean))) put(ix.byTok, t, f);
  }
  return ix;
}
function findFor(row, ix, items) {
  const out = new Set(ix.byRow.get(row.id) || []);
  for (const f of ix.all) out.add(f);
  const files = filesOf(row, items), names = namesOf(row), add = a => { if (a) for (const f of a) out.add(f); };
  if (!files.length && !names.length) { for (const f of ix.list) if (f.rowId === undefined) out.add(f); return [...out]; }
  for (const rf of files) {
    add(ix.byFile.get(rf)); add(ix.bySuffix.get(rf));
    for (let i = rf.indexOf('/'); i >= 0; i = rf.indexOf('/', i + 1)) add(ix.byFile.get(rf.slice(i + 1)));
    const d = dirOf(row, rf); if (d) add(ix.byDir.get(d));
  }
  for (const n of names) {
    add(ix.byEntity.get(n));
    if (n.length < 3) continue;
    const t = n.split(/[^a-z0-9_]+/).filter(Boolean)[0], c = t && ix.byTok.get(t);
    if (c) { const re = t === n ? null : nameRe(n); for (const f of c) if (!re || re.test(lc(f.msg))) out.add(f); }
  }
  return [...out];
}
const FAILS = {
  refs: f => f.severity === 'error' && /^REF_/.test(f.code),
  over: f => f.code === 'OVR_FILE_DELETED' && f.named === true,
};
const fails = (check, f) => (FAILS[check] || (x => x.severity === 'error'))(f);
const sevOf = s => (s === 'error' || s === 'warning' || s === 'note' || s === 'unchecked' ? s : /^warn/i.test(String(s)) ? 'warning' : /^(note|info)/i.test(String(s)) ? 'note' : 'error');
const clean = f => ({ file: f.file == null ? '' : String(f.file), line: +f.line || 0, code: String(f.code || ''), msg: String(f.msg || ''), severity: sevOf(f.severity) });
const keep = f => Object.assign(clean(f), f.entity != null ? { entity: f.entity } : {}, f.all ? { all: true } : {}, f.named ? { named: true } : {}, f.rowId !== undefined ? { rowId: f.rowId } : {});

// ---- the check report ----------------------------------------------------------------------------------------------
const needGame = stack => (stack && stack.gameDir ? null : { cannot: 'no game folder: needs the game (needsGame)' });
const iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const gidOf = stack => (stack.gid || (stack.exe === 'mowas_2' ? 'mowas2' : stack.exe) || 'as64');
// node <tool> ... -> {code, out, err}; never throws on a bad exit
function child(rel, args) {
  return new Promise((resolve, reject) => {
    const c = cp.spawn(process.execPath, [path.join(TOOLS_DIR, rel), ...args], { cwd: TOOLS_DIR, windowsHide: true });
    let out = '', err = '';
    c.stdout.on('data', d => { out = (out + d).slice(-20000); }); c.stderr.on('data', d => { err = (err + d).slice(-20000); });
    c.on('error', reject);
    c.on('close', code => resolve({ code, out, err }));
  });
}
// the newest changed file of the plan (ms); 0 = the plan names none
const newestOf = plan => Math.max(0, ...(((plan && plan.changes && plan.changes.files) || []).map(f => +f.mtimeMs || 0)));
// may this report stand for a check run of the stack now -> {R, at} | {why}
function usable(file, stack, plan, need) {
  let st, R;
  try { st = fs.statSync(file); R = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { why: 'not readable' }; }
  if (!R || typeof R !== 'object' || !R.verdicts || !Array.isArray(R.findings)) return { why: 'not a check --json report' };
  const stamp = R.testplan || null, gid = gidOf(stack);
  const same = stamp && stamp.folder ? lc(path.resolve(stamp.folder)) === lc(path.resolve(stack.folder || '')) : lc(path.basename(String(R.mod || ''))) === lc(path.basename(String(stack.folder || '')));
  if (!same) return { why: `it is of another mod (${stamp && stamp.folder || R.mod})` };
  if ((R.target && R.target !== gid) || (stamp && stamp.gid && stamp.gid !== gid) || (!R.target && !R.verdicts[gid])) return { why: `it is of another game (${R.target || (stamp && stamp.gid) || Object.keys(R.verdicts).join(',') || 'none'}, the stack is ${gid})` };
  if (R.fast) return { why: 'it is a --fast report (linters skipped)' };
  if (stamp && Array.isArray(stamp.only)) { const miss = need.filter(t => t !== 'check' && !stamp.only.includes(t)); if (miss.length) return { why: 'it was made without ' + miss.join(', ') }; }
  const newest = newestOf(plan);
  if (st.mtimeMs <= newest) return { why: `stale: made ${iso(st.mtimeMs)}, a file of the plan changed ${iso(newest)}` };
  return { R, at: st.mtimeMs };
}
// the check report of the stack: reused or made now -> {R, file, at, reused, notes} | {cannot, notes}
async function checkReport(stack, plan, need, opt, tmp) {
  const notes = [], own = path.join(tmp, 'check.json');
  for (const f of [opt.checkJson, own].filter(Boolean).filter((f, i, a) => a.indexOf(f) === i)) {
    if (!fs.existsSync(f)) { if (f === opt.checkJson) notes.push(`check report ${f} not found`); continue; }
    const u = usable(f, stack, plan, need);
    if (u.R) return { R: u.R, file: f, at: u.at, reused: true, notes };
    notes.push(`check report ${f} not used: ${u.why}`);
  }
  let R;
  if (opt.tools && opt.tools.checkReport) R = await opt.tools.checkReport(stack, { plan, tmp, need });
  else {
    const n = needGame(stack); if (n) return { cannot: n.cannot, notes };
    if (!stack.folder) return { cannot: 'no mod folder', notes };
    const gid = gidOf(stack), raw = own + '.new', only = need.filter(t => t !== 'check');
    fs.mkdirSync(tmp, { recursive: true });
    fs.rmSync(raw, { force: true });
    const r = await child('check/check.js', [stack.folder, '--exe', gid, gid === 'goh' ? '--goh' : '--game', stack.gameDir, '--json', raw, '--locs', '1000000', '--only', only.join(',') || 'modinfo', '-q']);
    try { R = JSON.parse(fs.readFileSync(raw, 'utf8')); } catch (e) { return { cannot: `check: exit ${r.code}, no report: ${(r.err || r.out).trim().split(/\r?\n/).slice(-2).join(' | ').slice(0, 300)}`, notes }; }
    fs.rmSync(raw, { force: true });
    R.testplan = { folder: path.resolve(stack.folder), gid, only, at: new Date().toISOString() };
  }
  if (!R || typeof R !== 'object') return { cannot: 'check gave no report', notes };
  let at = Date.now();
  try { fs.mkdirSync(tmp, { recursive: true }); fs.writeFileSync(own, JSON.stringify(R)); at = fs.statSync(own).mtimeMs; } catch (e) { notes.push('check report not kept: ' + e.message); }
  return { R, file: own, at, reused: false, notes };
}
// why a tool's findings are not in the report (null = it ran)
function toolGap(R, tool) {
  const stamp = R.testplan;
  if (R.fast && FAST_SKIP.includes(tool)) return 'skipped by check --fast';
  if (stamp && Array.isArray(stamp.only) && !stamp.only.includes(tool)) return 'not run for this report (--only ' + stamp.only.join(',') + ')';
  for (const e of R.errors || []) {
    const s = String(e);
    if (s.toLowerCase().startsWith(tool + ':') || s.toLowerCase().startsWith(tool + ' ')) return s.slice(0, 300);
    if (/^doctor (was stopped|gave no report)/.test(s)) return s.slice(0, 300);
  }
  for (const x of R.toolIssues || []) if (x && x.tool === tool && (x.kind === 'error' || x.kind === 'oom')) return String(x.text || x.kind).slice(0, 300);
  for (const n of R.notes || []) {
    const s = String(n);
    if (tool === 'mpsync' && /^NOT_MOUNTED /.test(s)) return 'mpsync skipped: the mod is not mounted';
    if (/^GAME_SKIP /.test(s) && new RegExp('\\b' + tool + '\\b').test(s)) return s.slice(0, 300);
  }
  return null;
}
// what a finding means, by its code (lib/registry severity: crash | silent | review | cosmetic). The report's own `sev` is not
// used for a gated row: check's reach gate turns a crash code on a unit nothing uses into `review` (gated:true), but the row
// here is about that very file, so the code's own class counts.
function classOf(g) {
  let c = null;
  try { c = require('../../lib/registry').severity(g.code); } catch (e) { c = null; }
  return g.gated || !g.sev ? c || g.sev || 'review' : g.sev;
}
// the findings of one tool out of a check report (pure; exported for the test) -> {findings, note} | {cannot}
// severity: crash and silent class, and every REF_* (a named thing does not exist) = error; review = warning; cosmetic = note
function fromCheck(R, tool) {
  const gap = toolGap(R, tool);
  if (gap) return { cannot: `${tool}: ${gap}` };
  const out = [];
  let cut = 0;
  for (const g of R.findings || []) {
    if (g.tool !== tool) continue;
    const ss = g.samples || [], cls = classOf(g), sev = cls === 'crash' || cls === 'silent' || /^REF_/.test(g.code) ? 'error' : cls === 'cosmetic' ? 'note' : 'warning';
    for (const s of ss) out.push({ file: s.file || s.path || '', line: s.line || 0, code: g.code, msg: (s.msg || s.text || '') + (g.gated ? ` [${cls}; ${s.note || g.note || 'the file is never loaded'}]` : ''), severity: sev });
    const listed = ss.reduce((n, s) => n + 1 + (+s.repeat > 1 ? s.repeat - 1 : 0) + ((s.also && s.also.length) || 0), 0);
    if (sev === 'error' && +g.n > listed) cut += g.n - listed;
  }
  // a cut list (check --locs N): the rows it does not name cannot be passed
  if (cut) out.push({ file: '', line: 0, code: 'NOT_LISTED', msg: `${tool}: the check report leaves out ${cut} location${cut === 1 ? '' : 's'} (made with --locs ${R.locs || '?'}): run check again`, severity: 'unchecked', all: true });
  return { findings: out, note: '' };
}
// check --json -> findings of the load check (pure; exported for the test). REFUSED = the game drops the mod: every load row
// fails. LIKELY_CRASH = the rows of the files a crash finding names fail; a crash verdict that names no file, and UNKNOWN: todo.
function loadFindings(R, gid) {
  const vs = R.verdicts || {}, v = vs[gid] || vs[gid === 'mowas2' ? 'mowas_2' : gid] || null, out = [];
  if (!v) return { cannot: 'check: no load verdict for ' + gid + ((R.errors || []).length ? ' (' + String(R.errors[0]).slice(0, 200) + ')' : '') };
  if (v.verdict === 'UNKNOWN') return { cannot: 'check: verdict UNKNOWN: ' + (v.text || '') };
  if (v.verdict === 'REFUSED') out.push({ file: '', line: 0, code: 'LOAD_REFUSED', msg: v.text || 'the game refuses the mod', severity: 'error', all: true });
  for (const g of R.findings || []) {
    const crash = g.sev === 'crash' && !g.gated;
    for (const s of g.samples || []) out.push({ file: s.file || s.path || '', line: s.line || 0, code: g.code, msg: s.msg || s.text || '', severity: crash && HOLDS_VERDICT.includes(v.verdict) ? 'error' : crash ? 'warning' : 'note' });
  }
  if (v.verdict === 'LIKELY_CRASH' && !out.some(f => f.severity === 'error')) return { cannot: 'check: LIKELY_CRASH, but no finding names a file: ' + (v.text || '') };
  return { findings: out, note: `load verdict ${v.verdict}` };
}

// ---- our own tools (the plan's items only) ---------------------------------------------------------------------------
const fromRep = rep => { const j = rep.toJSON ? rep.toJSON() : rep; return [...(j.findings || []), ...(j.info || []).map(f => Object.assign({}, f, { severity: 'note' }))]; };
const isUnderMods = stack => !!stack.folder && !!stack.gameDir && lc(path.dirname(path.resolve(stack.folder))) === lc(path.resolve(stack.gameDir, 'mods'));
function absOf(stack, rel) {
  if (!rel || String(rel).includes('!')) return null;
  for (const p of path.isAbsolute(rel) ? [rel] : [path.join(stack.folder || '', rel), path.join(stack.folder || '', 'resource', rel)]) if (fs.existsSync(p)) return p;
  return null;
}
// the loose .def files of the rows; a row whose def cannot be read gets an `unchecked` finding
function defsOf(stack, rows, out, tool) {
  const seen = new Map();
  for (const r of rows) {
    const rel = r.target && r.target.file;
    if (!rel || seen.has(lc(rel))) continue;
    const abs = /\.def$/i.test(rel) ? absOf(stack, rel) : null;
    seen.set(lc(rel), abs);
    if (!abs) out.push({ file: rel, line: 0, code: 'NOT_CHECKED', msg: `${tool}: the def is not a loose file of the mod, not read`, severity: 'unchecked' });
  }
  return [...seen].filter(e => e[1]).map(e => ({ rel: e[0], abs: e[1] }));
}
function walk(dir, out) {
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of es) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); }
  return out;
}
const BUILTIN = {
  async statsheet(stack, ctx) {
    const n = needGame(stack); if (n) return n;
    let units = ctx.units;
    if (!units) units = await require('./stack').units(stack);
    if (!Array.isArray(units) || !units.length) return { cannot: 'statsheet: no units list' };
    return cardFindings(units, ctx.rows, ctx.plan);
  },
  // overdiff mounts the mod from <game>/mods (GoH: also by path); the vfs is built once, the report covers the mod's files
  async overdiff(stack) {
    const n = needGame(stack); if (n) return n;
    if (stack.exe !== 'goh' && !isUnderMods(stack)) return { cannot: 'overdiff: the mod folder is not under <game>/mods, it cannot be mounted for the compare' };
    return fromRep(require('../../overdiff/overdiff.js').check({ folder: stack.folder, gameDir: stack.gameDir, mods: stack.mods && stack.mods.length ? [...new Set(stack.mods.concat(path.basename(stack.folder)))] : undefined, exe: stack.exe }).rep);
  },
  // firecheck: one def at a time; a def that is not a loose file of the mod stays unchecked. Weapons: the game's and the mod's own
  async firecheck(stack, ctx) {
    const n = needGame(stack); if (n) return n;
    const fc = require('../../firecheck/firecheck.js'), out = [], defs = defsOf(stack, ctx.rows, out, 'firecheck');
    if (!defs.length) return out;
    const db = fc.loadGameWeapons(stack.gameDir, stack.exe), sd = path.join(stack.folder || '', 'resource', 'set', 'stuff');
    for (const f of walk(sd, [])) { try { fc.addStuff(db, 'set/stuff/' + path.relative(sd, f).replace(/\\/g, '/').toLowerCase(), () => fs.readFileSync(f)); } catch (e) { /* not a stuff file */ } }
    for (const f of defs) {
      let r; try { r = fc.analyzeFile(f.abs, { db, kind: stack.kind === 'goh' ? 'goh' : undefined }); } catch (e) { out.push({ file: f.rel, line: 0, code: 'NOT_CHECKED', msg: 'firecheck: ' + e.message, severity: 'unchecked' }); continue; }
      for (const x of r.flags || []) out.push({ file: f.rel, line: 0, code: x.code, msg: x.detail || '', severity: 'error' });
      for (const x of r.warnings || []) out.push({ file: f.rel, line: 0, code: x.code, msg: x.detail || '', severity: 'warning' });
    }
    return out;
  },
  async preflight(stack, ctx) {
    if (stack.kind === 'goh') return { cannot: 'edrun preflight: AS2 family only' };
    const n = needGame(stack); if (n) return n;
    const pf = require('../../edrun/preflight.js'), out = [];
    for (const f of defsOf(stack, ctx.rows, out, 'preflight')) {
      const readModel = m => { try { return fs.readFileSync(path.join(path.dirname(f.abs), m)).toString('latin1'); } catch (e) { return null; } };
      const r = pf.faultsIn(fs.readFileSync(f.abs).toString('latin1'), { readModel });
      for (const x of r.faults || []) out.push({ file: f.rel, line: 0, code: x.code, msg: x.text || '', severity: 'error' });
      for (const x of r.notes || []) out.push({ file: f.rel, line: 0, code: 'PREFLIGHT_NOTE', msg: x, severity: 'note' });
    }
    return out;
  },
};
// statsheet units -> findings of the card rows (pure; exported for the test). The cards of a row: the cards of its item
// (plan.items[].cards), a card id in target.card, and every card of the units file the row is about. Each finding names its row.
// Crew breeds are not in the units list: a vehicle card with no crew member and a card with no entity are warnings only.
function cardFindings(units, rows, plan) {
  const by = new Map(), byFile = new Map(), out = [];
  for (const u of units) {
    by.set(lc(u.id), u); const b = lc(u.id).replace(/\([^)]*\)\s*$/, ''); if (!by.has(b)) by.set(b, u);
    const f = np(u.cardFile); if (f) { if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push(u); }
  }
  const items = new Map(((plan && plan.items) || []).map(i => [i.id, i]));
  for (const r of rows) {
    const t = r.target || {}, it = items.get(r.item), ids = new Set();
    for (const c of (it && it.cards) || []) if (c && c.card) ids.add(lc(c.card));
    if (t.card && !pathLike(t.card)) ids.add(lc(t.card));
    const us = new Set(), f = (u, card, code, msg, severity) => out.push({ file: (u && u.cardFile) || t.file || '', line: (u && u.cardLine) || 0, code, msg: `${card}: ${msg}`, severity: severity || 'error', entity: card, rowId: r.id });
    for (const id of ids) { const u = by.get(id); if (u) us.add(u); else f(null, id, 'CARD_MISSING', 'no such card in the units list'); }
    const rf = np(t.file);
    if (rf && pathLike(rf)) for (const [k, list] of byFile) if (sameFile(k, rf)) for (const u of list) us.add(u);
    if (!us.size && !ids.size) { out.push({ file: t.file || '', line: 0, code: 'NOT_CHECKED', msg: 'no card of this row in the units list', severity: 'unchecked', rowId: r.id }); continue; }
    for (const u of us) {
      if (u.cost == null) f(u, u.id, 'CARD_NO_PRICE', 'no price (cost)');
      else if (!u.buyable) f(u, u.id, 'CARD_NOT_BUYABLE', 'not buyable (no army)');
      if (!u.name) f(u, u.id, 'CARD_NO_NAME', `no name text (${u.nameKey || 'desc key'})`);
      if (u.kind === 'vehicle' && u.def === undefined) f(u, u.id, 'WARN_CARD_NO_ENTITY', 'the card names no entity of the stack', 'warning');
      if (/\*/.test(String(u.content || '')) && !(u.members || []).length) f(u, u.id, 'WARN_CARD_NO_CREW', 'a vehicle card with no crew breed', 'warning');
    }
  }
  return out;
}

// ---- run -----------------------------------------------------------------------------------------------------------
async function pool(jobs, cap) {
  let i = 0;
  const next = async () => { while (i < jobs.length) { const j = jobs[i++]; await j(); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(cap, jobs.length)) }, next));
}

async function run(stack, plan, opt = {}) {
  stack = stack || {};
  const only = opt.only ? (Array.isArray(opt.only) ? opt.only : String(opt.only).split(',')).map(s => s.trim()).filter(Boolean) : null;
  const rows = ((plan && plan.rows) || []).filter(r => r.how === 'static' && CHECK_TOOLS[r.check] && (!only || only.includes(r.check)));
  const inject = opt.tools || {}, names = [], items = new Map(((plan && plan.items) || []).map(i => [i.id, i]));
  for (const r of rows) for (const t of CHECK_TOOLS[r.check]) if (!names.includes(t)) names.push(t);
  const tmp = opt.tmp || (stack.state ? path.join(stack.state, 'run') : os.tmpdir());
  const res = {}, tools = [], notes = [];
  let done = 0;
  const tick = tool => { done++; if (opt.onProgress) { try { opt.onProgress({ tool, done, total: names.length }); } catch (x) { /* the caller's */ } } };
  const take = (tool, e, r) => {
    if (Array.isArray(r)) r = { findings: r };
    if (!r || typeof r !== 'object') throw new Error(tool + ': no result');
    if (r.cannot) { e.ok = false; e.error = String(r.cannot); }
    else { if (!Array.isArray(r.findings)) throw new Error(tool + ': no findings list'); res[tool] = { findings: r.findings.map(keep), note: r.note || '' }; }
  };
  const rowsOf = tool => rows.filter(r => CHECK_TOOLS[r.check].includes(tool));
  const fromReport = names.filter(t => FROM_CHECK.includes(t) && !inject[t]);
  const jobs = names.filter(t => !fromReport.includes(t)).map(tool => async () => {
    const t0 = Date.now(), e = { tool, ms: 0, ok: true };
    try { take(tool, e, await (inject[tool] || BUILTIN[tool])(stack, { plan, rows: rowsOf(tool), tmp, units: opt.units })); }
    catch (x) { e.ok = false; e.error = String((x && x.message) || x); }
    e.ms = Date.now() - t0; tools.push(e); tick(tool);
  });
  // the one check run (or a report that already exists) and the tools read out of it
  if (fromReport.length) jobs.unshift(async () => {
    const t0 = Date.now();
    let c;
    try { c = await checkReport(stack, plan, fromReport, opt, tmp); } catch (x) { c = { cannot: 'check: ' + String((x && x.message) || x), notes: [] }; }
    for (const n of c.notes || []) notes.push(n);
    const ms = Date.now() - t0, src = c.R ? `check report ${c.file} of ${iso(c.at)} (${c.reused ? 'reused' : 'made now'})` : '';
    if (src) notes.push(src);
    tools.push(Object.assign({ tool: 'check run', ms, ok: !!c.R }, c.R ? { report: c.file, reused: c.reused, at: iso(c.at) } : { error: c.cannot }));
    for (const tool of fromReport) {
      const t1 = Date.now(), e = { tool, ms: 0, ok: true };
      try {
        if (!c.R) take(tool, e, { cannot: c.cannot });
        else { const r = tool === 'check' ? loadFindings(c.R, gidOf(stack)) : fromCheck(c.R, tool); if (!r.cannot) r.note = [r.note, src].filter(Boolean).join('; '); take(tool, e, r); }
      } catch (x) { e.ok = false; e.error = String((x && x.message) || x); }
      e.ms = Date.now() - t1; tools.push(e); tick(tool);
    }
  });
  await pool(jobs, opt.cap || 4);
  const order = t => (t.tool === 'check run' ? -1 : names.indexOf(t.tool));
  tools.sort((a, b) => order(a) - order(b));
  // OVR_FILE_DELETED fails only when something still names the file: a REF_* finding of this run that names it
  if (res.overdiff) {
    const refs = res.refcheck ? res.refcheck.findings.filter(f => /^REF_/.test(f.code)).map(f => lc(f.msg)) : [];
    for (const f of res.overdiff.findings) if (f.code === 'OVR_FILE_DELETED' && !f.named) { const b = np(f.file).split('/').pop(); if (b && refs.some(m => m.includes(b))) f.named = true; }
  }
  const t2 = Date.now(), ix = {};
  for (const t of Object.keys(res)) ix[t] = indexOf(res[t].findings);
  const errOf = t => (tools.find(x => x.tool === t) || {}).error || 'did not run';
  const out = rows.map(row => {
    const ts = CHECK_TOOLS[row.check], found = [], rnotes = [], ran = [];
    for (const t of ts) {
      if (!res[t]) { rnotes.push(`${t} did not run: ${errOf(t)}`); continue; }
      ran.push(t);
      if (res[t].note && !rnotes.includes(res[t].note)) rnotes.push(res[t].note);
      for (const f of findFor(row, ix[t], items)) found.push(f);
    }
    const bad = found.filter(f => fails(row.check, f)), unc = found.filter(f => f.severity === 'unchecked');
    const status = bad.length ? 'fail' : ran.length < ts.length || unc.length ? 'todo' : 'pass';
    if (status === 'todo' && unc.length) rnotes.unshift('not checked: ' + unc[0].msg);
    if (status === 'pass' && found.length) rnotes.unshift(`${found.length} finding${found.length === 1 ? '' : 's'}, none fails the check`);
    const lead = bad.concat(found.filter(f => !bad.includes(f)));
    return { id: row.id, status, result: { tool: ts.join(', '), findings: lead.slice(0, 200).map(clean), note: rnotes.join('; ') + (lead.length > 200 ? `; ${lead.length} findings, the first 200 listed` : '') } };
  });
  notes.push(`findings mapped to ${out.length} rows in ${Date.now() - t2} ms`);
  return { rows: out, tools, notes };
}

module.exports = { run, CHECK_TOOLS, FROM_CHECK, matches, fromCheck, loadFindings, cardFindings, usable };
