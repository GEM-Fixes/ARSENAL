// testplan cli test: the verbs end to end on the fixture of mkfx.js (a fake game and a mod outside its mods folder).
// node cli.test.js [scratch dir]. Needs no game install. Prints `<n> passed, <m> failed`, exit 1 on a fail.
// Author: Imperator_Aug (ARSENAL, ia-23c07978)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const W = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'testplan-cli-' + process.pid));
require('../../lib/testscratch').guard(W);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });
const TOOL = path.join(__dirname, '..', 'testplan.js'), TOOLS = path.join(__dirname, '..', '..');
const ENV = Object.assign({}, process.env, { ARSENAL_CACHE: process.env.ARSENAL_CACHE || path.join(W, 'cache'), AS2_NO_STEAM: '1' });
delete ENV.AS2_GAME; delete ENV.GOH_GAME;
process.env.ARSENAL_CACHE = ENV.ARSENAL_CACHE; process.env.AS2_NO_STEAM = '1'; delete process.env.AS2_GAME; delete process.env.GOH_GAME;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('ok ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ': ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : '')); }
}
function run(args, tool) {
  const r = cp.spawnSync(process.execPath, [tool || TOOL, ...args], { encoding: 'utf8', env: ENV, cwd: W, maxBuffer: 1 << 28 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}
// --json: the whole stdout is one JSON document
function json(args, tool) {
  const r = run([...args, '--json'], tool);
  try { r.doc = JSON.parse(r.out); r.pure = r.out.trim().split('\n').length === 1; } catch (e) { r.doc = null; r.pure = false; }
  return r;
}
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const CODE = /^T-[0-9A-Za-z]{5}$/;

const fx = require('./mkfx').make(path.join(W, 'fx'));
const G = ['--game', fx.game], M = fx.mod, STATE = path.join(M, '.arsenal', 'testplan'), PLAN = path.join(STATE, 'run', 'plan.json');

(async () => {
  // ---------- help and usage ----------
  {
    const h = run(['--help']);
    ok('help: exit 0', h.code === 0, h);
    ok('help: names every verb', ['changes', 'plan', 'static', 'emit', 'read', 'list', 'checklist', 'tick', 'mark', 'pairs'].every(v => h.out.includes(v)), h.out);
    ok('help: before anything is read (a mod folder that does not exist)', run(['plan', path.join(W, 'nope'), '--help']).code === 0);
    ok('usage: no verb = exit 2', run([]).code === 2);
    ok('usage: unknown verb = exit 2', run(['frobnicate', M]).code === 2);
    ok('usage: unknown option = exit 2', run(['changes', M, '--frob']).code === 2);
    ok('usage: no mod folder = exit 2', run(['changes']).code === 2);
    ok('usage: a mod folder that is not there = exit 2', run(['changes', path.join(W, 'nope')]).code === 2);
    ok('usage: bad --exe = exit 2', run(['changes', M, ...G, '--exe', 'quake']).code === 2);
    ok('usage: an option without its value = exit 2', run(['changes', M, '--since']).code === 2);
    const u = json(['frobnicate', M]);
    ok('usage under --json: one JSON document with the error', u.code === 2 && u.pure && u.doc && u.doc.ok === false && u.doc.exit === 2, u.out);
  }

  // ---------- lib/stack.js ----------
  const stackLib = require('../lib/stack');
  {
    const s = stackLib.resolve({ game: fx.game, folder: M });
    ok('stack: as64 shape', s.gameDir === path.resolve(fx.game) && s.exe === 'as64' && s.gid === 'as64' && s.kind === 'as2' && s.folder === path.resolve(M) && s.name === 'fxmod' && s.state === STATE, s);
    ok('stack: as64 mods default as64+', JSON.stringify(s.mods) === '["as64+"]', s.mods);
    ok('stack: as64 canRun', s.canRun.edrun === 'run' && s.canRun.prove === 'run' && s.canRun.sweep === 'plan', s.canRun);
    ok('stack: keys of the contract and no other in JSON', Object.keys(JSON.parse(JSON.stringify(s))).sort().join() === ['canRun', 'exe', 'folder', 'gameDir', 'gid', 'kind', 'mods', 'name', 'state', 'warnings', 'why'].sort().join(), Object.keys(s));
    const m = stackLib.resolve({ game: fx.game, exe: 'mowas2', folder: M });
    ok('stack: mowas2 word mapped, dry and plan, no mods', m.exe === 'mowas_2' && m.gid === 'mowas2' && m.kind === 'as2' && m.canRun.edrun === 'dry' && m.canRun.prove === 'plan' && m.mods.length === 0 && /TST-19/.test(m.why.edrun), m);
    const g = stackLib.resolve({ game: fx.goh, folder: fx.gohMod });
    ok('stack: goh found from the game folder, edrun no, prove score', g.exe === 'goh' && g.gid === 'goh' && g.kind === 'goh' && g.canRun.edrun === 'no' && g.canRun.prove === 'score' && g.canRun.sweep === 'plan' && g.mods.length === 0 && !!g.why.edrun && !!g.why.prove, g);
    const st2 = stackLib.resolve({ game: fx.game, folder: M, state: path.join(W, 'st2'), mods: 'as64+,other,FXMOD' });
    ok('stack: --state and --mods taken', st2.state === path.join(W, 'st2') && JSON.stringify(st2.mods) === '["as64+","other","FXMOD"]', st2);
    const inm = stackLib.resolve({ game: fx.game, folder: path.join(fx.game, 'mods', 'inmod'), mods: ['as64+', 'inmod'] });
    ok('stack: a mod in <game>/mods is not in its own mount list', JSON.stringify(inm.mods) === '["as64+"]' && stackLib.inMods(inm) === 'inmod', inm.mods);
    let threw = null; try { stackLib.resolve({ game: fx.game, exe: 'quake', folder: M }); } catch (e) { threw = e; }
    ok('stack: a bad exe word throws BAD_EXE (seeded defect)', threw && threw.code === 'BAD_EXE', threw && threw.message);
    const none = stackLib.resolve({ game: '-', folder: M });
    ok('stack: --game - = no game', none.gameDir === '' && none.exe === 'as64', none);
    let ng = null; try { await stackLib.index(none); } catch (e) { ng = e; }
    ok('stack: index without a game answers needsGame', ng && ng.needsGame === true, ng && ng.message);
    const nu = await stackLib.units(none);
    ok('stack: units without a game = [] with needsGame', Array.isArray(nu) && nu.length === 0 && nu.needsGame === true, nu);

    const I = await stackLib.index(s);
    const names = Object.values(I.idx.entities).map(e => e.name).sort();
    ok('stack: index holds the game entities and the mod new def (mod by path)', ['bt7_fx', 't34_0', 'zis3'].every(n => names.includes(n)) && !!I.keys && [...I.keys].some(k => /bt7_fx\.def$/.test(k)) && !!I.src, names);
    ok('stack: index is one build per process', (await stackLib.index(s)) === I);
    const us = await stackLib.units(s);
    ok('stack: units lists the cards of the game', Array.isArray(us) && us.some(u => u && u.id === 't34_0') && us.some(u => u && u.id === 'zis3'), s.warnings.concat(us.map(u => u && u.id)));
    ok('stack: units kept in <state>/units.json', fs.existsSync(path.join(STATE, 'units.json')));
    fs.rmSync(STATE, { recursive: true, force: true });   // the cli starts from an empty state dir
  }

  // ---------- changes ----------
  {
    const c = json(['changes', M, ...G, '--since', 'all']);
    ok('changes --json: exit 0, one document', c.code === 0 && c.pure && c.err === '', c);
    const rels = ((c.doc && c.doc.files) || []).map(f => f.rel).sort();
    ok('changes all: the four files of the mod, added', rels.join() === ['mod.info', fx.FILES.def, fx.FILES.texture, fx.FILES.weapon].sort().join() && c.doc.files.every(f => f.state === 'added') && c.doc.counts.added === 4, rels);
    ok('changes: writes nothing (no state dir yet)', !fs.existsSync(STATE));
    const t = run(['changes', M, ...G, '--since', 'all']);
    ok('changes text: one line a file and the count', t.code === 0 && t.out.includes(fx.FILES.def) && /4 files/.test(t.out), t.out);
    ok('changes without a game (--game -): still works', run(['changes', M, '--game', '-', '--since', 'all']).code === 0);
    const bad = run(['changes', M, ...G, '--since', 'git:HEAD']);
    ok('changes since git on a folder that is no work tree: refused, exit 3, a plain line (seeded defect)', bad.code === 3 && /git/i.test(bad.err) && !/\n\s+at /.test(bad.err), bad);
  }

  // ---------- no plan yet ----------
  ok('list before plan: exit 3', run(['list', M, ...G]).code === 3);
  ok('tick before plan: exit 3', run(['tick', M, 'T-AAAAA', 'pass', ...G]).code === 3);

  // ---------- plan since all ----------
  let plan;
  {
    const p = json(['plan', M, ...G, '--since', 'all']);
    ok('plan --json: exit 0, one document', p.code === 0 && p.pure, { code: p.code, err: p.err, out: p.out.slice(0, 300) });
    ok('plan: writes <state>/run/plan.json, the document it printed', fs.existsSync(PLAN) && JSON.stringify(readJson(PLAN)) === JSON.stringify(p.doc));
    plan = p.doc || {};
    ok('plan: head', plan.v === 1 && plan.tool === 'testplan' && !isNaN(Date.parse(plan.made)) && plan.emitted === null && Array.isArray(plan.notes), [plan.v, plan.tool, plan.made, plan.emitted]);
    ok('plan: stack keys', plan.stack && Object.keys(plan.stack).sort().join() === 'canRun,exe,folder,gameDir,gid,mods,name,why' && plan.stack.gid === 'as64' && plan.stack.name === 'fxmod', plan.stack);
    ok('plan: changes inside', plan.changes && plan.changes.since === 'all' && plan.changes.files.length === 4, plan.changes);
    const ids = (plan.items || []).map(i => i.id);
    ok('plan: items of the three changes', ids.includes('entity:bt7_fx') && ids.includes('weapon:76mm_f34') && ids.some(i => /t34_0\.dds$/.test(i)), ids);
    ok('plan: the changed weapon pulls in the tank that carries it', (plan.items || []).some(i => i.id === 'entity:t34_0' && i.source === 'depends'), ids);
    const rows = plan.rows || [];
    ok('plan: rows have unique ids and T- codes', rows.length > 0 && new Set(rows.map(r => r.id)).size === rows.length && new Set(rows.map(r => r.code)).size === rows.length && rows.every(r => CODE.test(r.code)), rows.map(r => r.code).filter(c => !CODE.test(c)));
    ok('plan: every row is of an item of the plan and starts todo', rows.every(r => (ids.includes(r.item) || r.item === 'run' || r.item === 'mod') && r.status === 'todo' && r.result === null), rows.filter(r => r.status !== 'todo').map(r => r.id));
    ok('plan: one fire and one dmgout row per weapon of the new vehicle', rows.some(r => r.id === 'fire|entity:bt7_fx|76mm_f34' && r.how === 'run' && r.runner === 'edrun') && rows.some(r => r.id === 'dmgout|entity:bt7_fx|76mm_f34'), rows.filter(r => /bt7_fx/.test(r.id)).map(r => r.id));
    const s = plan.summary || {};
    ok('plan: summary counts the rows', s.rows === rows.length && s.byHow && s.byHow.static + s.byHow.run + s.byHow.player === rows.length && s.byStatus && s.byStatus.todo === rows.length && typeof s.items === 'number' && s.byCheck && s.byCheck.fire >= 1, s);
    const cl = plan.checklist;
    const entries = cl && Array.isArray(cl.sessions) ? cl.sessions.reduce((a, x) => a.concat(x.entries || []), []) : [];
    ok('plan: checklist holds every player row', cl && rows.filter(r => r.how === 'player').every(r => entries.some(e => e.row === r.id)) && entries.length > 0, cl && cl.counts);
    const t = run(['plan', M, ...G, '--since', 'all']);
    ok('plan text: summary lines and the plan path', t.code === 0 && /rows: \d+/.test(t.out) && t.out.includes('plan.json') && /changes: 4 added/.test(t.out), t.out);
    const o2 = path.join(W, 'out2');
    const p2 = run(['plan', M, ...G, '--since', 'all', '--out', o2, '--only', 'fire,look']);
    const d2 = fs.existsSync(path.join(o2, 'plan.json')) ? readJson(path.join(o2, 'plan.json')) : null;
    ok('plan --out --only: the plan goes to --out with only those checks', p2.code === 0 && d2 && d2.rows.length > 0 && d2.rows.every(r => r.check === 'fire' || r.check === 'look'), d2 && d2.rows.map(r => r.check));
  }

  // ---------- list ----------
  {
    const all = json(['list', M, ...G]);
    ok('list --json: every row', all.code === 0 && all.pure && all.doc.count === plan.rows.length, all.doc && all.doc.count);
    const q = json(['list', M, ...G, '--q', 'fire bt7_fx']);
    ok('list --q: all words must match', q.code === 0 && q.doc.rows.length >= 1 && q.doc.rows.every(r => r.check === 'fire' && /bt7_fx/.test(r.id)), q.doc && q.doc.rows.map(r => r.id));
    const none = json(['list', M, ...G, '--q', 'fire nosuchword']);
    ok('list --q: a word nothing has = 0 rows, exit 0', none.code === 0 && none.doc.count === 0);
    const pl = json(['list', M, ...G, '--how', 'player']);
    ok('list --how player', pl.doc.rows.length > 0 && pl.doc.rows.every(r => r.how === 'player'));
    const stt = json(['list', M, ...G, '--status', 'pass']);
    ok('list --status pass: none yet', stt.doc.count === 0);
    const t = run(['list', M, ...G, '--q', 'fire bt7_fx']);
    const row = plan.rows.find(r => r.id === 'fire|entity:bt7_fx|76mm_f34');
    ok('list text: code, status, check, item', row && new RegExp('^' + row.code + '\\s+todo\\s+fire\\s+entity:bt7_fx', 'm').test(t.out) && /\d+ rows/.test(t.out), t.out);
    const code = json(['list', M, ...G, '--q', row ? row.code : 'x']);
    ok('list --q: finds a row by its code', code.doc.count === 1 && code.doc.rows[0].id === (row && row.id));
  }

  // ---------- tick ----------
  let ticked = null;
  {
    const look = plan.rows.find(r => r.how === 'player' && /bt7_fx/.test(r.id)), stat = plan.rows.find(r => r.how === 'static');
    const t = json(['tick', M, look.code, 'pass', '--note', 'looks right', ...G]);
    ok('tick --json: exit 0, the row', t.code === 0 && t.pure && t.doc.row && t.doc.row.id === look.id && t.doc.row.status === 'pass', t);
    const after = readJson(PLAN), r = after.rows.find(x => x.id === look.id);
    ok('tick: written into the plan', r.status === 'pass' && r.result && r.result.note === 'looks right' && after.summary.byStatus.pass === 1 && after.summary.byStatus.todo === plan.rows.length - 1, [r, after.summary]);
    const ticks = fs.existsSync(path.join(STATE, 'ticks.json')) ? readJson(path.join(STATE, 'ticks.json')) : {};
    ok('tick: written into the state dir', ticks[look.id] && ticks[look.id].v === 'pass' && ticks[look.id].note === 'looks right', ticks);
    const e = after.checklist.sessions.reduce((a, x) => a.concat(x.entries || []), []).find(x => x.row === look.id);
    ok('tick: the checklist entry follows', e && e.status === 'pass', e);
    ok('tick: a static row is not the player\'s to tick, exit 2 (seeded defect)', run(['tick', M, stat.code, 'pass', ...G]).code === 2 && readJson(PLAN).rows.find(x => x.id === stat.id).status === 'todo');
    ok('tick: an unknown code = exit 2', run(['tick', M, 'T-ZZZZZ', 'pass', ...G]).code === 2);
    ok('tick: a word that is no result = exit 2', run(['tick', M, look.code, 'maybe', ...G]).code === 2);
    ok('tick: no code = exit 2', run(['tick', M, ...G]).code === 2);
    const f = run(['tick', M, look.code.toLowerCase(), 'fail', ...G]);
    ok('tick fail: exit 0 (only static and read answer 1), code in any case', f.code === 0 && readJson(PLAN).rows.find(x => x.id === look.id).status === 'fail', f);
    run(['tick', M, look.code, 'pass', ...G]);
    ok('list --status pass: the ticked row', json(['list', M, ...G, '--status', 'pass']).doc.count === 1);
    const again = json(['plan', M, ...G, '--since', 'all']);
    ok('plan again: a tick set after the last change of its files is kept', again.code === 0 && again.doc.rows.find(x => x.id === look.id).status === 'pass', again.doc && again.doc.rows.find(x => x.id === look.id));
    ticked = look;
  }

  // ---------- checklist ----------
  {
    const md = path.join(W, 'md', 'list.md');
    const c = run(['checklist', M, ...G, '--md', md]);
    const text = fs.existsSync(md) ? fs.readFileSync(md, 'utf8') : '';
    ok('checklist --md: the file with T- lines', c.code === 0 && /^- \[ \] T-[0-9A-Za-z]{5} /m.test(text), text.slice(0, 400));
    const open = plan.rows.find(r => r.how === 'player' && r.id !== ticked.id);
    ok('checklist --md: an open player row is in it', text.includes(open.code), open.code);
    const t = run(['checklist', M, ...G]);
    ok('checklist text: the markdown on stdout', t.code === 0 && /^- \[ \] T-/m.test(t.out), t.out.slice(0, 300));
    const j = json(['checklist', M, ...G]);
    ok('checklist --json: sessions and counts', j.code === 0 && j.pure && Array.isArray(j.doc.sessions) && j.doc.sessions.every(s => ['editor', 'skirmish', 'mission'].includes(s.id) && Array.isArray(s.setup) && Array.isArray(s.entries)) && !!j.doc.counts, j.doc && j.doc.sessions && j.doc.sessions.map(s => s.id));
  }

  // ---------- emit (as64 form) ----------
  {
    const e = json(['emit', M, ...G]);
    ok('emit --json: exit 0, one document', e.code === 0 && e.pure, { code: e.code, err: e.err, out: e.out.slice(0, 300) });
    const d = e.doc || {}, cmds = d.commands || [], files = d.files || [], OUT = path.join(STATE, 'run');
    ok('emit as64: an edrun command that starts the game, not dry', cmds.some(c => c.runner === 'edrun' && c.needsLaunch === true && c.dry === false && Array.isArray(c.argv) && /edrun/.test(c.argv.join(' ')) && c.rows.length > 0), cmds.map(c => [c.id, c.runner, c.dry, c.needsLaunch]));
    ok('emit as64: a prove command and a sweep plan', cmds.some(c => c.runner === 'prove') && cmds.some(c => c.runner === 'sweep' && c.needsLaunch === false), cmds.map(c => c.runner));
    ok('emit as64: the pair files, the run list, the map', fs.existsSync(path.join(OUT, 'edrun', 'g1.json')) && fs.existsSync(path.join(OUT, 'edrun', 'run-list.md')) && fs.existsSync(path.join(OUT, 'map.json')) && fs.existsSync(path.join(OUT, 'sweep', 'names.txt')), files.map(f => f.path));
    ok('emit: every file it names is there and inside --out', files.length > 0 && files.every(f => fs.existsSync(path.isAbsolute(f.path) ? f.path : path.join(OUT, f.path))), files.map(f => f.path));
    const map = fs.existsSync(path.join(OUT, 'map.json')) ? readJson(path.join(OUT, 'map.json')) : {};
    ok('emit: the fire row of the tank that carries the changed gun is on a pair of the map', JSON.stringify(map).includes('fire|entity:t34_0|76mm_f34'), Object.keys(map.pairs || {}));
    // the new vehicle has no card (no crew to man it): its fire row is on a pair or is said to be left out, never dropped in silence
    ok('emit: the fire row of the new vehicle is placed or named as not placed', JSON.stringify(map).includes('fire|entity:bt7_fx|76mm_f34') || JSON.stringify([d.unplaced || [], d.notes || []]).includes('bt7_fx'), d.notes);
    const fire = cmds.find(c => c.runner === 'edrun' && c.rows.includes('fire|entity:t34_0|76mm_f34'));
    ok('emit: the fire game carries the pipe words', fire && fire.argv.includes('--pipe') && /dbg_blast 1;dbg_health 1/.test(fire.argv.join(' ')), fire && fire.argv);
    ok('emit: recorded in the plan', readJson(PLAN).emitted && readJson(PLAN).emitted.commands.length === cmds.length);
    const t = run(['emit', M, ...G]);
    ok('emit text: the commands', t.code === 0 && /edrun/.test(t.out) && /nothing started/.test(t.out), t.out.slice(0, 400));
  }

  // ---------- mowas2 form ----------
  {
    const st = path.join(W, 'st-mowas2'), a = [M, ...G, '--exe', 'mowas2', '--state', st];
    const p = json(['plan', ...a, '--since', 'all']);
    ok('plan --exe mowas2: exit 0, the stack says mowas_2', p.code === 0 && p.doc.stack.exe === 'mowas_2' && p.doc.stack.gid === 'mowas2' && p.doc.stack.canRun.edrun === 'dry', p.doc ? p.doc.stack : p.err);
    const e = json(['emit', ...a]);
    const ed = ((e.doc && e.doc.commands) || []).filter(c => c.runner === 'edrun');
    ok('emit mowas2: edrun commands are --dry and start nothing', e.code === 0 && ed.length > 0 && ed.every(c => c.dry === true && c.argv.includes('--dry')), ed.map(c => c.argv));
    ok('--state: nothing of this run in the mod', !fs.existsSync(path.join(M, '.arsenal', 'testplan', 'st-mowas2')) && fs.existsSync(path.join(st, 'run', 'plan.json')));
  }

  // ---------- goh form ----------
  {
    const st = path.join(W, 'st-goh'), a = [fx.gohMod, '--game', fx.goh, '--exe', 'goh', '--state', st];
    const p = json(['plan', ...a, '--since', 'all']);
    ok('plan --exe goh: exit 0', p.code === 0 && p.pure && p.doc.stack.gid === 'goh' && p.doc.stack.canRun.edrun === 'no', p.doc ? p.doc.stack : p.err);
    const rows = (p.doc && p.doc.rows) || [];
    const fire = rows.filter(r => r.check === 'fire');
    ok('plan goh: fire rows are the player\'s, with the reason', fire.length > 0 && fire.every(r => r.how === 'player' && !!r.why), fire);
    ok('plan goh: no row is a real game run of edrun', rows.every(r => !(r.how === 'run' && r.runner === 'edrun')));
    const entries = p.doc && p.doc.checklist ? p.doc.checklist.sessions.reduce((x, s) => x.concat(s.entries || []), []) : [];
    ok('plan goh: those rows are on the checklist', fire.every(r => entries.some(e => e.row === r.id)), entries.length);
    const e = json(['emit', ...a]);
    const cmds = (e.doc && e.doc.commands) || [];
    ok('emit goh: exit 0, no edrun and no prove command', e.code === 0 && e.pure && cmds.every(c => c.runner !== 'edrun' && c.runner !== 'prove'), cmds.map(c => c.runner));
    ok('emit goh: no edrun and no prove files', !fs.existsSync(path.join(st, 'run', 'edrun')) && !fs.existsSync(path.join(st, 'run', 'prove')));
    ok('emit goh: the sweep is the only game step and nothing needs a launch', cmds.length > 0 && cmds.every(c => c.needsLaunch === false) && cmds.some(c => c.runner === 'sweep') && fs.existsSync(path.join(st, 'run', 'sweep', 'names.txt')), cmds);
    ok('goh default: the mod is not written into (state given)', !fs.existsSync(path.join(fx.gohMod, '.arsenal')));
  }

  // ---------- mark, since last, one edited file ----------
  {
    const m = json(['mark', M, ...G]);
    ok('mark --json: exit 0, one document', m.code === 0 && m.pure, m);
    ok('mark: last.json and a history line with the row counts', fs.existsSync(path.join(STATE, 'last.json')) && (h => Array.isArray(h) && h.length === 1 && h[0].files === 4 && h[0].rowsPassed >= 1)(readJson(path.join(STATE, 'history.json'))), fs.existsSync(path.join(STATE, 'history.json')) && fs.readFileSync(path.join(STATE, 'history.json'), 'utf8'));
    const c = json(['changes', M, ...G]);
    ok('changes since last after mark: nothing', c.code === 0 && c.doc.since === 'last' && c.doc.base.kind === 'last' && c.doc.files.length === 0, c.doc);
    const p = json(['plan', M, ...G]);
    ok('plan since last after mark: no change, no item', p.code === 0 && p.doc.changes.files.length === 0 && p.doc.items.length === 0 && p.doc.rows.every(r => r.item === 'run' || r.item === 'mod'), p.doc && p.doc.rows.map(r => r.id));

    fx.touch(M, fx.FILES.def, require('./mkfx').tank('76mm_f34', 61, null));
    const q = json(['plan', M, ...G]);
    const d = q.doc || {}, files = ((d.changes && d.changes.files) || []);
    ok('one edited file: the change list is that file, changed', q.code === 0 && files.length === 1 && files[0].rel === fx.FILES.def && files[0].state === 'changed', files);
    // the items of that file: those it is the reason of, and what hangs on them
    const own = new Set((d.items || []).filter(i => i.source === 'changed' && (i.why || []).some(w => w.rel === fx.FILES.def)).map(i => i.id));
    let grew = true;
    while (grew) { grew = false; for (const i of d.items || []) if (!own.has(i.id) && (i.via || []).some(v => own.has(v))) { own.add(i.id); grew = true; } }
    ok('one edited file: its entity is the item', own.has('entity:bt7_fx') && (d.items || []).every(i => own.has(i.id)), (d.items || []).map(i => i.id));
    const rows = (d.rows || []).filter(r => r.item !== 'run' && r.item !== 'mod');
    ok('one edited file: exactly the rows of that file\'s items', rows.length > 0 && rows.every(r => own.has(r.item)) && [...own].every(id => rows.some(r => r.item === id)), rows.map(r => r.id));
    ok('one edited file: nothing of the tank, the weapon file or the texture', rows.every(r => !/t34_0|weapon:/.test(r.item)) && rows.some(r => r.id === 'fire|entity:bt7_fx|76mm_f34'), rows.map(r => r.id));
    ok('one edited file: the old tick does not pass the changed def', d.rows.find(r => r.id === ticked.id) && d.rows.find(r => r.id === ticked.id).status === 'todo', d.rows.find(r => r.id === ticked.id));
    const ev = json(['plan', M, ...G, '--everything', '--out', path.join(W, 'out-all')]);
    ok('plan --everything: since all, the tank is back', ev.code === 0 && ev.doc.changes.since === 'all' && ev.doc.rows.some(r => r.item === 'entity:t34_0'), ev.doc && ev.doc.changes.since);
  }

  // ---------- static, and a seeded defect: a def that names a gun nobody has ----------
  {
    const st = path.join(W, 'st-static'), a = [M, ...G, '--state', st];
    let p = json(['plan', ...a, '--since', 'all']);
    const s = json(['static', ...a]);
    ok('static --json: one document, exit 0 or 1', (s.code === 0 || s.code === 1) && s.pure && Array.isArray(s.doc.rows) && Array.isArray(s.doc.tools), { code: s.code, err: s.err.slice(0, 600), out: s.out.slice(0, 300) });
    const after = readJson(path.join(st, 'run', 'plan.json'));
    ok('static: exit 1 exactly when a row failed', (s.code === 1) === after.rows.some(r => r.status === 'fail'), after.rows.filter(r => r.status === 'fail').map(r => [r.id, r.result]));
    ok('static: answers go into the plan, the summary follows', after.rows.some(r => r.how === 'static' && r.status !== 'todo') && after.summary.byStatus.todo < p.doc.rows.length && after.rows.every(r => r.how === 'static' || r.status === 'todo'), after.summary);
    ok('static: the good new def has its weapon (refs passes)', after.rows.find(r => r.id === 'refs|entity:bt7_fx').status === 'pass', after.rows.find(r => r.id === 'refs|entity:bt7_fx'));

    require('./mkfx').put(M, 'resource/entity/-vehicle/tank_light/bad_fx/bad_fx.def', require('./mkfx').tank('no_such_gun_fx', 40, null));
    p = json(['plan', ...a, '--since', 'all']);
    ok('seeded defect: the bad def makes a refs row', p.code === 0 && p.doc.rows.some(r => r.id === 'refs|entity:bad_fx'), p.doc && p.doc.rows.filter(r => /bad_fx/.test(r.id)).map(r => r.id));
    const b = json(['static', ...a, '--only', 'refs']);
    const bad = readJson(path.join(st, 'run', 'plan.json')).rows.find(r => r.id === 'refs|entity:bad_fx');
    ok('seeded defect: static fails the row of the def with the missing gun, exit 1', b.code === 1 && bad && bad.status === 'fail' && JSON.stringify(bad.result).includes('no_such_gun_fx'), { code: b.code, bad, err: b.err.slice(0, 400) });
    ok('seeded defect: the failed row shows in list --status fail', json(['list', ...a, '--status', 'fail']).doc.rows.some(x => x.id === 'refs|entity:bad_fx'));
    const r = json(['read', ...a]);
    ok('read with no run report: one document, no row fails by it, exit 0 or 1 as the plan says', (r.code === 0 || r.code === 1) && r.pure && (r.code === 1) === r.doc.rows.some(x => x.status === 'fail'), { code: r.code, err: r.err.slice(0, 400) });
    fs.rmSync(path.join(M, 'resource/entity/-vehicle/tank_light/bad_fx'), { recursive: true, force: true });
  }

  // ---------- pairs ----------
  {
    const f = path.join(W, 'pairs.json');
    fs.writeFileSync(f, JSON.stringify([{ name: 'fo_t34_0__zis3', shooter: 't34_0', foe: 'zis3', dist: 15 }, { name: 'fo_zis3__t34_0', shooter: 'zis3', foe: 't34_0', dist: 15 }]));
    const i = json(['pairs', 'id', f]);
    ok('pairs id: P- ids, stable, one a pair', i.code === 0 && i.pure && i.doc.length === 2 && i.doc.every(x => /^P-[0-9A-Za-z]{5}$/.test(x.id)) && i.doc[0].id !== i.doc[1].id && JSON.stringify(json(['pairs', 'id', f]).doc) === JSON.stringify(i.doc), i.doc);
    ok('pairs id: a file that is not there = exit 2', run(['pairs', 'id', path.join(W, 'nope.json')]).code === 2);
    ok('pairs: no sub verb = exit 2', run(['pairs']).code === 2);
    ok('pairs suggest: --shooter is needed, exit 2', run(['pairs', 'suggest', M, ...G]).code === 2);
    const s = json(['pairs', 'suggest', M, ...G, '--shooter', 't34_0']);
    ok('pairs suggest: a pair for the shooter', s.code === 0 && s.pure && s.doc && JSON.stringify(s.doc).includes('t34_0'), { code: s.code, err: s.err.slice(0, 300), out: s.out.slice(0, 300) });
    const c = json(['pairs', 'check', M, f, ...G]);
    ok('pairs check: one answer a pair', c.code === 0 && c.pure && Array.isArray(c.doc) && c.doc.length === 2 && c.doc.every(x => typeof x.status === 'string'), { code: c.code, err: c.err.slice(0, 300), out: c.out.slice(0, 300) });
  }

  // ---------- a part that is missing or throws: exit 3 and a plain line that names it ----------
  {
    const T = path.join(W, 'copy', 'tools'), put = (rel, text) => { const f = path.join(T, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
    const tool = put('testplan/testplan.js', fs.readFileSync(TOOL, 'utf8'));
    put('testplan/lib/stack.js', fs.readFileSync(path.join(__dirname, '..', 'lib', 'stack.js'), 'utf8'));
    for (const l of ['help', 'games']) put('lib/' + l + '.js', 'module.exports = require(' + JSON.stringify(path.join(TOOLS, 'lib', l + '.js')) + ');\n');
    ok('a part missing: --help still works', run(['--help'], tool).code === 0);
    const c = run(['changes', M, ...G, '--since', 'all'], tool);
    ok('a part missing: exit 3, one plain line naming the part', c.code === 3 && /part changes is missing/.test(c.err) && c.err.trim().split('\n').length === 1, c);
    const cj = json(['changes', M, ...G, '--since', 'all'], tool);
    ok('a part missing under --json: one document', cj.code === 3 && cj.pure && cj.doc.ok === false && cj.doc.part === 'changes' && cj.doc.exit === 3, cj.out);
    put('testplan/lib/changes.js', '\'use strict\';\nmodule.exports = { find() { return { since: \'all\', base: { kind: \'all\' }, files: [], counts: { added: 0, changed: 0, removed: 0 }, notes: [] }; } };\n');
    ok('the changes part alone: `changes` works while the others are missing', run(['changes', M, ...G, '--since', 'all'], tool).code === 0);
    const p = run(['plan', M, ...G, '--since', 'all'], tool);
    ok('plan with the items part missing: exit 3 naming items', p.code === 3 && /part items is missing/.test(p.err), p);
    put('testplan/lib/items.js', 'throw new Error(\'boom at load\');\n');
    const p2 = run(['plan', M, ...G, '--since', 'all'], tool);
    ok('a part that throws at load: exit 3 naming it, no stack trace', p2.code === 3 && /part items failed/.test(p2.err) && /boom at load/.test(p2.err) && !/\n\s+at /.test(p2.err), p2);
    put('testplan/lib/items.js', 'module.exports = { from() { return Promise.reject(new Error(\'boom in from\')); } };\n');
    const p3 = run(['plan', M, ...G, '--since', 'all'], tool);
    ok('a part that rejects: exit 3 naming it', p3.code === 3 && /part items failed/.test(p3.err) && /boom in from/.test(p3.err), p3);
  }

  console.log(pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); console.log(pass + ' passed, ' + (fail + 1) + ' failed'); process.exitCode = 1; });
