// A stand-in for tools/testplan/testplan.js in the page's test (test.js): same verbs, flags and JSON shapes (tools/testplan/README.md),
// canned content. Without --in-game the plan also holds file check rows (how static), as the tool's does; the page always sends it. It reads no game and no mod file; it keeps plan.json, ticks.json, history.json and last.json like the tool does.
// FAKE_LOG = a file that gets one JSON line per call (the argv). FAKE_FAIL = a verb that fails with exit 3. FAKE_BIG = rows of
// --everything (default 260).
// Author: Imperator_Aug (ARSENAL, ia-4989ac6d)
'use strict';
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2), pos = [], F = {};
const VAL = new Set(['--game', '--exe', '--state', '--out', '--since', '--note', '--md', '--only', '--dirs', '--shooter', '--foe', '--cls', '--lang', '--mods', '--check-json']);
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (VAL.has(a)) F[a.slice(2)] = argv[++i]; else if (/^--/.test(a)) F[a.slice(2)] = true; else pos.push(a); }
if (process.env.FAKE_LOG) fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(argv) + '\n');
const out = (o, code) => { process.stdout.write(JSON.stringify(o) + '\n'); process.exit(code || 0); };
const die = (m, code) => out({ ok: false, error: m, exit: code }, code);
const verb = pos.shift();
if (process.env.FAKE_FAIL && process.env.FAKE_FAIL === verb) die('the fake tool was told to fail at ' + verb, 3);
const rj = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const wj = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o) + '\n'); return f; };
const GID = { as64: 'as64', mowas_2: 'mowas2', goh: 'goh' };
const CAN = { as64: { edrun: 'run', prove: 'run', sweep: 'plan' }, mowas2: { edrun: 'dry', prove: 'plan', sweep: 'plan' }, goh: { edrun: 'no', prove: 'score', sweep: 'plan' } };

if (verb === 'pairs') {
  const sub = pos.shift();
  if (sub === 'id') { const l = rj(pos[0]) || []; out(l.map((p, i) => ({ id: 'P-' + (i + 1), name: (p.shooter || '') + '_vs_' + (p.foe || '') }))); }
  if (sub === 'suggest') { if (!F.shooter) die('pairs suggest needs --shooter', 2); out({ id: 'P-1', shooter: F.shooter, foe: F.foe || 't34_76', dist: 1000, cls: F.cls || '' }); }
  if (sub === 'check') { const file = pos[pos.length - 1], l = rj(file); if (!Array.isArray(l)) die('no pairs file', 2); out(l.map((p, i) => ({ id: p.id || 'P-' + (i + 1), status: p.shooter === 'nosuch' ? 'fail' : 'ok', notes: p.shooter === 'nosuch' ? ['unit not found'] : [], warns: [] }))); }
  die('usage: pairs id|suggest|check', 2);
}

const mod = pos[0];
if (!mod) die('no mod folder', 2);
const state = F.state || path.join(mod, '.arsenal', 'testplan'), outDir = F.out || path.join(state, 'run'), planFile = path.join(outDir, 'plan.json');
const gid = GID[F.exe || 'as64'] || 'as64';
const sumOf = plan => {
  const byStatus = {}, byHow = { run: 0, player: 0 }, byCheck = {};
  for (const r of plan.rows) { byStatus[r.status] = (byStatus[r.status] || 0) + 1; byHow[r.how] = (byHow[r.how] || 0) + 1; byCheck[r.check] = (byCheck[r.check] || 0) + 1; }
  return { rows: plan.rows.length, byHow, byStatus, byCheck, items: plan.items.length };
};
function listOf(plan) {
  const es = plan.rows.filter(r => r.how === 'player').map(r => {
    const it = plan.items.find(i => i.id === r.item) || {}, args = r.check === 'feel' ? { carrier: 'a unit that carries it', weapon: it.key, foe: 'an enemy unit' } : { unit: it.key };
    const key = r.check === 'feel' ? 'feel.weapon' : r.check === 'look' ? 'look.unit' : 'nokey';
    return { row: r.id, code: r.code, item: r.item, check: r.check, do: 'DO ' + r.check + ' ' + it.key, look: 'LOOK ' + r.check, expect: r.expect, status: r.status, key, args, recheck: false };
  });
  const sessions = es.length ? [{ id: 'editor', n: 1, of: 1, title: 'Editor session 1 of 1', titleKey: 'session.editor', titleArgs: { n: 1, of: 1 },
    setup: ['Start the game with the mod my_mod turned on.', 'A step the page has no key for.'], setupKeys: [{ key: gid === 'goh' ? 'setup.start.goh' : 'setup.start', args: { mod: 'my_mod' } }, { key: 'setup.nokey', args: {} }], entries: es }] : [];
  return { sessions, counts: { entries: es.length } };
}
function build() {
  const ticks = rj(path.join(state, 'ticks.json')) || {}, last = rj(path.join(state, 'last.json'));
  const all = !!F.everything, since = all ? 'all' : F.since || 'last';
  const files = last && since === 'last' ? [{ rel: 'resource/set/stuff/gun/kwk36', state: 'changed', area: 'weapon' }] :
    [{ rel: 'resource/entity/-vehicle/tank_heavy/tiger/tiger.def', state: 'added', area: 'entity' }, { rel: 'resource/set/stuff/gun/kwk36', state: 'changed', area: 'weapon' }, { rel: 'resource/old.txt', state: 'removed', area: 'other' }];
  const items = [], rows = []; let n = 0;
  const row = (item, check, how, runner, target, title) => { n++; const id = item + ':' + check; rows.push({ id, code: 'T-' + ('0000' + n.toString(36)).slice(-5), item, check, how, runner, title, status: 'todo', target, expect: 'EXPECT ' + check, why: how === 'player' ? 'only a person can judge it' : '', limits: check === 'fire' ? ['TST-19'] : [] }); };
  if (files.some(f => f.area === 'entity')) {
    items.push({ id: 'entity:tiger', kind: 'entity', key: 'tiger', name: 'Tiger I', file: 'resource/entity/-vehicle/tank_heavy/tiger/tiger.def', why: [{ rel: 'resource/entity/-vehicle/tank_heavy/tiger/tiger.def' }] });
    row('entity:tiger', 'parse', 'static', 'validate', { entity: 'tiger', file: 'resource/entity/-vehicle/tank_heavy/tiger/tiger.def' }, 'The files read');
    row('entity:tiger', 'spawn', 'run', 'sweep', { entity: 'tiger' }, 'The model loads');
    row('entity:tiger', 'fire', 'run', 'edrun', { entity: 'tiger', weapon: 'kwk36' }, 'The gun fires');
    row('entity:tiger', 'dmgout', 'run', 'edrun', { entity: 'tiger', weapon: 'kwk36' }, 'The gun does damage');
    row('entity:tiger', 'look', 'player', '', { entity: 'tiger' }, 'It looks right');
  }
  items.push({ id: 'weapon:kwk36', kind: 'weapon', key: 'kwk36', name: 'kwk36', file: 'resource/set/stuff/gun/kwk36', why: [{ rel: 'resource/set/stuff/gun/kwk36' }] });
  row('weapon:kwk36', 'refs', 'static', 'xref', { weapon: 'kwk36', file: 'resource/set/stuff/gun/kwk36' }, 'Its names exist');
  row('weapon:kwk36', 'feel', 'player', '', { weapon: 'kwk36' }, 'It feels right');
  if (all) for (let i = 0; rows.length < (Number(process.env.FAKE_BIG) || 260); i++) {
    const id = 'entity:unit' + i; items.push({ id, kind: 'entity', key: 'unit' + i, name: 'Unit ' + i, file: 'resource/entity/unit' + i + '.def', why: [] });
    row(id, 'move', 'run', 'edrun', { entity: 'unit' + i }, 'It drives'); row(id, 'spawn', 'run', 'sweep', { entity: 'unit' + i }, 'The model loads');
  }
  if (F['in-game']) for (let i = rows.length - 1; i >= 0; i--) if (rows[i].how === 'static') rows.splice(i, 1);   // --in-game: no file checks
  for (const r of rows) { const t = ticks[r.id]; if (t && r.how === 'player') { r.status = t.v; r.result = { tool: 'player', note: t.note || '' }; } }
  const plan = { v: 1, made: new Date().toISOString(), stack: { gid, exe: F.exe || 'as64', name: path.basename(mod), folder: mod, gameDir: F.game || null, state, canRun: CAN[gid], why: {} },
    changes: { since, base: { kind: all ? 'all' : last ? 'last' : 'vanilla', at: last ? last.at : null }, files, counts: { added: files.filter(f => f.state === 'added').length, changed: files.filter(f => f.state === 'changed').length, removed: files.filter(f => f.state === 'removed').length }, notes: [] },
    items, rows, unmapped: [], notes: F.game ? [] : ['No game folder: only the file checks run.'] };
  plan.summary = sumOf(plan); plan.checklist = listOf(plan);
  return plan;
}
const save = plan => { plan.summary = sumOf(plan); plan.checklist = listOf(plan); wj(planFile, plan); return plan; };
const have = () => { const p = rj(planFile); if (!p) die('no plan yet: run plan first', 2); return p; };

if (verb === 'plan') out(save(build()));
if (verb === 'static') {
  const plan = have(), res = [];
  for (const r of plan.rows) if (r.how === 'static') {
    const fail = r.check === 'refs';
    r.status = fail ? 'fail' : 'pass';
    r.result = { tool: r.runner, findings: fail ? [{ file: 'resource/set/stuff/gun/kwk36', line: 12, code: 'XREF-1', msg: 'ammo "nosuch" is not defined', severity: 'error' }] : [], note: '' };
    res.push({ id: r.id, status: r.status, result: r.result });
  }
  save(plan);
  out({ ok: false, verb: 'static', rows: res, tools: [{ tool: 'validate', ms: 1, ok: true }], notes: [], summary: plan.summary, plan: planFile }, 1);
}
if (verb === 'emit') {
  const plan = have(), game = F.game || '', pairs = wj(path.join(outDir, 'edrun', 'g1.json'), [{ name: 'fire_tiger', shooter: 'tiger', foe: 't34_76' }]);
  const ed = plan.rows.filter(r => r.runner === 'edrun').map(r => r.id), sw = plan.rows.filter(r => r.runner === 'sweep').map(r => r.id), commands = [];
  const names = wj(path.join(outDir, 'sweep', 'names.txt'), []);
  if (gid !== 'goh' && ed.length) {
    const a = ['edrun/edrun.js'].concat(game ? ['--game', game] : [], ['--pairs', pairs, '--out', path.join(outDir, 'edrun', 'g1'), '--pipe', 'dbg_blast 1;dbg_health 1'], gid === 'mowas2' ? ['--dry'] : []);
    commands.push({ id: 'edrun-g1', how: 'run', runner: 'edrun', cmd: 'node ' + a.join(' '), argv: a, dry: gid === 'mowas2', needsLaunch: gid === 'as64', rows: ed });
    const b = ['prove/prove.js', '--unit', 'tiger', '--army', 'ger', '--brand-new-flag', 'x'].concat(gid === 'mowas2' ? ['--plan'] : []);
    commands.push({ id: 'prove-tiger', how: 'run', runner: 'prove', cmd: 'node ' + b.join(' '), argv: b, dry: gid === 'mowas2', needsLaunch: gid === 'as64', rows: sw.slice(0, 1) });
  }
  if (sw.length) { const c = ['preloadsweep/preloadsweep.js', 'plan', '--names', names]; commands.push({ id: 'sweep-plan', how: 'run', runner: 'sweep', cmd: 'node ' + c.join(' '), argv: c, dry: true, needsLaunch: false, rows: sw }); }
  const em = { out: outDir, files: [{ path: pairs, kind: 'pairs', rows: ed }, { path: names, kind: 'names', rows: sw }], commands, notes: gid === 'goh' ? ['Start the load test yourself. [T]'] : [] };
  plan.emitted = em; save(plan); out(em);
}
if (verb === 'read') {
  const plan = have(), res = [];
  for (const r of plan.rows) if (r.how === 'run') { r.status = r.check === 'dmgout' ? 'unproven' : r.check === 'fire' ? 'fail' : 'pass'; r.result = { tool: r.runner, findings: r.check === 'fire' ? [{ file: 'edrun/g1/report.json', line: 0, code: 'RUN-1', msg: 'no shot was seen', severity: 'error' }] : [], note: F.dirs || '' }; res.push({ id: r.id, status: r.status, result: r.result }); }
  save(plan);
  out({ ok: true, verb: 'read', rows: res, tools: [], notes: [], summary: plan.summary, plan: planFile });
}
if (verb === 'tick') {
  const code = pos[1], v = pos[2], plan = have(), r = plan.rows.find(x => x.code === code);
  if (!r || r.how !== 'player') die('row ' + code + ' is not one for the player', 2);
  if (!['pass', 'fail', 'skip'].includes(v)) die('a tick is pass, fail or skip', 2);
  const ticks = rj(path.join(state, 'ticks.json')) || {};
  ticks[r.id] = { v, note: typeof F.note === 'string' ? F.note : '', at: new Date().toISOString() };
  wj(path.join(state, 'ticks.json'), ticks);
  r.status = v; r.result = { tool: 'player', note: ticks[r.id].note }; save(plan);
  out({ ok: true, row: { id: r.id, code: r.code, status: v }, summary: plan.summary });
}
if (verb === 'mark') {
  const plan = rj(planFile), bs = (plan && plan.summary.byStatus) || {}, hist = rj(path.join(state, 'history.json')) || [];
  const m = { at: new Date().toISOString(), files: 3, rowsPassed: bs.pass || 0, rowsFailed: bs.fail || 0, rowsOpen: (bs.todo || 0) + (bs.unproven || 0) };
  hist.push(m); wj(path.join(state, 'history.json'), hist); wj(path.join(state, 'last.json'), { v: 1, at: m.at, files: [] });
  out(m);
}
if (verb === 'checklist') {
  const plan = have(), cl = listOf(plan);
  if (F.md) { fs.mkdirSync(path.dirname(F.md), { recursive: true }); fs.writeFileSync(F.md, '# Test list\n\n' + cl.sessions.map(s => '## ' + s.title + '\n\n' + s.entries.map(e => '- [ ] ' + e.code + ' ' + e.do).join('\n')).join('\n\n') + '\n'); }
  out(cl);
}
die('usage: plan|static|emit|read|tick|mark|checklist|pairs', 2);
