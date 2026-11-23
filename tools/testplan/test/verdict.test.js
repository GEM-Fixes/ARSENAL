// Author: Imperator_Aug (ARSENAL, ia-c71f951f)
'use strict';
// testplan verdict part: lib/static.js and lib/results.js. No game: fake tool results, hand-written report.json / map.json in scratch.
// usage: node tools/testplan/test/verdict.test.js [scratch dir]
const fs = require('fs');
const os = require('os');
const path = require('path');
const stat = require('../lib/static');
const results = require('../lib/results');

const scratch = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'testplan-verdict'));
require('../../lib/testscratch').guard(scratch);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(scratch, { recursive: true, force: true });
fs.mkdirSync(scratch, { recursive: true });
let passed = 0, failed = 0;
const ok = (name, cond, extra) => { if (cond) passed++; else { failed++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });
const wj = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1)); };

const row = (check, item, how, target, extra) => Object.assign({ id: `${check}|${item}${extra && extra.w ? '|' + extra.w : ''}`, code: 'T-XXXXX', item, check, how, runner: how === 'run' ? (extra && extra.runner) || 'edrun' : null, title: '', target: Object.assign({ entity: null, weapon: null, ammo: null, card: null, army: null, file: null }, target), expect: '', status: 'todo', result: null, why: '', limits: [] });
const stack = { gameDir: 'X:/nogame', exe: 'as64', gid: 'as64', kind: 'as2', mods: ['m'], folder: path.join(scratch, 'mod'), name: 'm', state: path.join(scratch, 'state') };
const T34 = 'resource/entity/-vehicle/tank_medium/t34/t34.def', KV = 'resource/entity/-vehicle/tank_heavy/kv1/kv1.def';

async function main() {
  // ---------------------------------------------------------------- static
  const plan = { rows: [
    row('refs', 'entity:t34', 'static', { entity: 't34', file: T34 }),
    row('refs', 'entity:kv1', 'static', { entity: 'kv1', file: KV }),
    row('refs', 'entity:bt7', 'static', { entity: 'bt7', file: 'resource/entity/-vehicle/tank_light/bt7/bt7.def' }),
    row('parse', 'properties:properties/x.set', 'static', { file: 'resource/properties/x.set' }),
    row('load', 'entity:t34', 'static', { entity: 't34', file: T34 }),
    row('load', 'entity:kv1', 'static', { entity: 'kv1', file: KV }),
    row('aim', 'entity:t34', 'static', { entity: 't34', file: T34 }),
    row('aim', 'entity:kv1', 'static', { entity: 'kv1', file: KV }),
    row('faults', 'entity:t34', 'static', { entity: 't34', file: T34 }),
    row('card', 'card:t34', 'static', { card: 't34', entity: 't34' }),
    row('card', 'card:kv1', 'static', { card: 'kv1', entity: 'kv1' }),
    row('text', 'text:localization/a.lng', 'static', { file: 'resource/localization/a.lng' }),
    row('over', 'other:set/stuff/gone.inc', 'static', { file: 'resource/set/stuff/gone.inc' }),
    row('over', 'other:set/stuff/kept.inc', 'static', { file: 'resource/set/stuff/kept.inc' }),
    row('sync', 'other:mod', 'static', {}),
    row('fire', 'entity:t34', 'run', { entity: 't34' }, { w: '76mm' }),
    row('look', 'entity:t34', 'player', { entity: 't34' }),
  ] };
  const calls = {}, prog = [];
  let live = 0, peak = 0;
  const slow = (name, f) => async (s, ctx) => { calls[name] = (calls[name] || 0) + 1; live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 15)); live--; return f(s, ctx); };
  const units = [{ id: 't34', kind: 'vehicle', cost: 300, buyable: true, name: 'T-34', def: 'entity/-vehicle/tank_medium/t34/t34.def', content: '* ( mp/rus/tankman:4)', members: [{ breed: 'tankman', n: 4 }], cardFile: 'set/multiplayer/units/vehicles.set', cardLine: 12 },
    { id: 'kv1', kind: 'vehicle', cost: null, buyable: false, name: '', nameKey: 'desc/entity/kv1', def: 'x', content: '* ( mp/rus/tankman:5)', members: [{ breed: 'tankman', n: 5 }] }];
  const tools = {
    refcheck: slow('refcheck', () => [
      { file: 'mods\\m\\resource\\entity\\-vehicle\\tank_medium\\t34\\t34.def', line: 9, code: 'REF_WEAPON', msg: 'weapon "76mm_f34" not found', severity: 'error' },   // by file (case, slashes, prefix)
      { file: 'set/breed/x.set', line: 3, code: 'REF_MODEL', msg: 'entity kv1: model "kv1.mdl" missing', severity: 'error' },                                     // by entity name in msg
      { file: 'entity/-vehicle/tank_light/bt7/bt7_x.def', line: 2, code: 'WARN_SOUND_PRIORITY_HIGH', msg: 'loud', severity: 'warning' },                         // entity folder, a warning: no fail
      { file: 'set/stuff/other.inc', line: 1, code: 'REF_STUFF_ENTITY', msg: 'include "gone.inc" not found', severity: 'error' },                                 // names the deleted file
    ]),
    sdllint: slow('sdllint', () => { throw new Error('sdllint blew up'); }),
    binhdr: slow('binhdr', () => []),
    check: slow('check', () => stat.loadFindings({ verdicts: { as64: { verdict: 'LIKELY_CRASH', text: '1 fatal' } }, findings: [{ code: 'SDL_UNBALANCED', sev: 'crash', n: 1, samples: [{ file: 'entity/-vehicle/tank_heavy/kv1/kv1.def', line: 4, msg: 'missing }' }] }] }, 'as64')),
    firecheck: slow('firecheck', () => [{ file: T34, line: 0, code: 'FC_AIM_BONE', msg: 'no aim bone', severity: 'error' }, { file: KV, line: 0, code: 'NOT_CHECKED', msg: 'def in a pak', severity: 'unchecked' }]),
    preflight: slow('preflight', () => ({ cannot: 'edrun preflight: AS2 family only' })),
    statsheet: slow('statsheet', (s, ctx) => stat.cardFindings(units, ctx.rows)),
    lnglint: slow('lnglint', () => ({ findings: [{ file: 'localization/a.lng', line: 5, code: 'WARN_LNG_DUP', msg: 'dup', severity: 'warning' }], note: 'lnglint ran' })),
    overdiff: slow('overdiff', () => [{ file: 'set/stuff/gone.inc', line: 0, code: 'OVR_FILE_DELETED', msg: 'deleted by mod.info', severity: 'note' }, { file: 'set/stuff/kept.inc', line: 0, code: 'OVR_FILE_DELETED', msg: 'deleted', severity: 'note' }, { file: 'set/stuff/kept.inc', line: 0, code: 'OVR_FULL_SHADOW', msg: 'shadow', severity: 'warning' }]),
    conflicts: slow('conflicts', () => []),
    mpsync: slow('mpsync', () => [{ file: 'set/x.set', line: 0, code: 'WARN_MPSYNC_SILENT', msg: 'silent', severity: 'warning' }]),
  };
  const s = await stat.run(stack, plan, { tools, onProgress: p => prog.push(p) });
  const st = id => (s.rows.find(r => r.id === id) || {}).status;
  const res = id => (s.rows.find(r => r.id === id) || {}).result || {};
  eq('static: only static rows answered', s.rows.length, 15);
  ok('static: each tool ran once', Object.keys(calls).length === 11 && Object.values(calls).every(n => n === 1), calls);
  ok('static: side by side, cap 4', peak > 1 && peak <= 4, peak);
  ok('static: progress per tool', prog.length === 11 && prog[10].done === 11 && prog.every(p => p.total === 11 && p.tool), prog.length);
  eq('static: refs by file -> fail', st('refs|entity:t34'), 'fail');
  eq('static: refs finding shape', res('refs|entity:t34').findings[0], { file: 'mods\\m\\resource\\entity\\-vehicle\\tank_medium\\t34\\t34.def', line: 9, code: 'REF_WEAPON', msg: 'weapon "76mm_f34" not found', severity: 'error' });
  eq('static: refs by entity name -> fail', st('refs|entity:kv1'), 'fail');
  eq('static: refs kv1 got only its own finding', res('refs|entity:kv1').findings.map(f => f.code), ['REF_MODEL']);
  eq('static: a warning in the entity folder does not fail', [st('refs|entity:bt7'), res('refs|entity:bt7').findings.length], ['pass', 1]);
  eq('static: a tool that throws leaves the row todo', st('parse|properties:properties/x.set'), 'todo');
  ok('static: thrown tool reported', (() => { const t = s.tools.find(x => x.tool === 'sdllint'); return t && t.ok === false && /blew up/.test(t.error) && typeof t.ms === 'number'; })(), s.tools);
  ok('static: todo note names the tool', /sdllint did not run/.test(res('parse|properties:properties/x.set').note), res('parse|properties:properties/x.set'));
  eq('static: load LIKELY_CRASH fails the named file only', [st('load|entity:kv1'), st('load|entity:t34')], ['fail', 'pass']);
  eq('static: aim flag fails, unchecked def stays todo', [st('aim|entity:t34'), st('aim|entity:kv1')], ['fail', 'todo']);
  eq('static: a tool that cannot run -> todo, never pass', st('faults|entity:t34'), 'todo');
  ok('static: cannot is in tools', s.tools.some(t => t.tool === 'preflight' && !t.ok && /AS2 family/.test(t.error)));
  eq('static: card ok / card with no price, no name', [st('card|card:t34'), st('card|card:kv1')], ['pass', 'fail']);
  eq('static: card codes', res('card|card:kv1').findings.map(f => f.code), ['CARD_NO_PRICE', 'CARD_NO_NAME']);
  eq('static: text warning passes', st('text|text:localization/a.lng'), 'pass');
  eq('static: over fails only a deleted file something still names', [st('over|other:set/stuff/gone.inc'), st('over|other:set/stuff/kept.inc')], ['fail', 'pass']);
  eq('static: whole-mod row takes every finding, warning passes', [st('sync|other:mod'), res('sync|other:mod').findings.length], ['pass', 1]);
  // only, and the seeded defect: a refcheck that says nothing about a broken def must not hide an error of another tool's check
  const s2 = await stat.run(stack, plan, { only: 'refs', tools: { refcheck: async () => [] } });
  eq('static: only=refs runs one tool', [s2.tools.map(t => t.tool), s2.rows.length, s2.rows.every(r => r.status === 'pass')], [['refcheck'], 3, true]);
  // no injected tool and no game folder: every row todo, none passes
  const s3 = await stat.run({ gameDir: '', exe: 'goh', gid: 'goh', kind: 'goh', mods: [], folder: path.join(scratch, 'mod') }, plan, { only: ['refs', 'faults', 'sync', 'over'] });
  ok('static: no game -> all todo with a note', s3.rows.length === 7 && s3.rows.every(r => r.status === 'todo' && r.result.note) && s3.tools.every(t => !t.ok), s3.rows.map(r => r.status));
  eq('static: load verdicts', [stat.loadFindings({ verdicts: { as64: { verdict: 'UNKNOWN' } } }, 'as64').cannot !== undefined, stat.loadFindings({ verdicts: { as64: { verdict: 'REFUSED', text: 'version' } } }, 'as64').findings[0].all, stat.loadFindings({ verdicts: {} }, 'goh').cannot !== undefined, stat.loadFindings({ verdicts: { as64: { verdict: 'LIKELY_CRASH' } }, findings: [] }, 'as64').cannot !== undefined], [true, true, true, true]);
  // seeded defect: entity "t34" must not take a finding about "t34_85"
  ok('static: seeded: t34 does not match t34_85', !stat.matches(plan.rows[0], { file: 'set/x.set', msg: 'entity t34_85 lacks model', code: 'REF_MODEL', severity: 'error' }) && stat.matches(plan.rows[0], { file: 'set/x.set', msg: 'x', entity: 'entity/-vehicle/tank_medium/T34', code: 'REF_MODEL', severity: 'error' }));

  // ---------------------------------------------------------------- static: one check report feeds refs, parse, load, text, over, sync
  const tmp = path.join(scratch, 'tmp'), modDir = path.join(scratch, 'mod');
  const cplan = { changes: { files: [{ rel: T34, mtimeMs: Date.now() - 60000 }] }, items: [{ id: 'other:set', kind: 'other', why: [{ rel: 'resource/set/a.set', state: 'changed' }] }], rows: [
    row('refs', 'entity:t34', 'static', { entity: 't34', file: 'entity/-vehicle/tank_medium/t34/t34.def' }),
    row('refs', 'entity:kv1', 'static', { entity: 'kv1', file: 'entity/-vehicle/tank_heavy/kv1/kv1.def' }),
    row('refs', 'entity:bt7', 'static', { entity: 'bt7', file: 'entity/-vehicle/tank_light/bt7/bt7.def' }),
    row('parse', 'other:set', 'static', {}),                                   // no file: the item's changed files
    row('parse', 'properties:properties/x.set', 'static', { file: 'properties/x.set' }),
    row('load', 'entity:t34', 'static', { entity: 't34', file: 'entity/-vehicle/tank_medium/t34/t34.def' }),
    row('text', 'text:localization/a.lng', 'static', { file: 'localization/a.lng' }),
    row('sync', 'mod', 'static', {}),
  ] };
  const mkR = o => Object.assign({ mod: modDir, target: 'as64', verdicts: { as64: { verdict: 'LIKELY_CRASH', text: '1 fatal' } }, errors: ['lnglint: stopped after 600 s (timeout)'], notes: [], toolIssues: [], locs: 1000000, findings: [
    { tool: 'refcheck', code: 'REF_WEAPON', n: 1, sev: 'crash', samples: [{ file: 'resource/entity/-vehicle/tank_medium/t34/t34.def', line: 9, msg: 'weapon "f34" not found' }] },
    // the shape the real check writes for a def that names a gun that does not exist, on a unit nothing uses: the reach gate turns the crash code into review, gated
    { tool: 'refcheck', code: 'REF_WEAPON_UNKNOWN', n: 1, sev: 'review', gated: true, note: 'nothing in the mod uses this unit', samples: [{ file: 'resource/entity/-vehicle/tank_heavy/kv1/kv1.def', line: 7, msg: 'no set/stuff file carries the tags "no_such_gun_fx" (entity kv1)', path: 'E:/x/kv1.def', note: 'nothing in the mod uses this unit' }] },
    { tool: 'refcheck', code: 'REF_TEXTURE_MISSING', n: 1, sev: 'cosmetic', samples: [{ file: 'resource/entity/-vehicle/tank_light/bt7/bt7.def', line: 3, msg: 'texture' }] },
    { tool: 'sdllint', code: 'SOME_REVIEW_CODE', n: 1, sev: 'review', samples: [{ file: 'resource/properties/x.set', line: 2, msg: 'unranked' }] },
    { tool: 'sdllint', code: 'BLOCK_UNCLOSED', n: 1, sev: 'crash', samples: [{ file: 'resource/set/a.set', line: 4, msg: 'missing }' }] },
    { tool: 'keylint', code: 'KEY_UNKNOWN', n: 1, sev: 'review', samples: [{ file: 'resource/properties/x.set', line: 1, msg: 'x' }] },                                  // not one of ours
    { tool: 'mpsync', code: 'ENV_NOTE', n: 1, sev: 'cosmetic', samples: [{ file: 'resource/set/a.set', line: 0, msg: 'cosmetic' }] },
  ] }, o);
  let made = 0;
  const ctools = { checkReport: async () => { made++; return mkR(); } };
  const c1 = await stat.run(Object.assign({}, stack, { folder: modDir }), cplan, { tools: ctools, tmp });
  const cs = (x, k) => (x.rows.find(r => r.id === k) || {}).status, cn = (x, k) => ((x.rows.find(r => r.id === k) || {}).result || {}).note || '';
  eq('check: one report made', made, 1);
  eq('check: refs from the refcheck findings', cs(c1, 'refs|entity:t34'), 'fail');
  eq('check: seeded: a missing gun on an unused unit (gated, sev review) still fails its refs row', [cs(c1, 'refs|entity:kv1'), (c1.rows.find(r => r.id === 'refs|entity:kv1').result.findings[0] || {}).severity], ['fail', 'error']);
  eq('check: REF_* fails refs whatever its class; review does not fail parse', [cs(c1, 'refs|entity:bt7'), cs(c1, 'parse|properties:properties/x.set')], ['fail', 'pass']);
  eq('check: silent class fails, cosmetic does not', [stat.fromCheck({ findings: [{ tool: 'mpsync', code: 'WARN_MPSYNC_SILENT', n: 1, sev: 'silent', samples: [{ file: 'a', msg: 'm' }] }] }, 'mpsync').findings[0].severity, stat.fromCheck({ findings: [{ tool: 'binhdr', code: 'DDS_BIG', n: 1, sev: 'cosmetic', samples: [{ file: 'a', msg: 'm' }] }] }, 'binhdr').findings[0].severity], ['error', 'note']);
  eq('check: parse by the item files; another tool does not count', [cs(c1, 'parse|other:set'), cs(c1, 'parse|properties:properties/x.set')], ['fail', 'pass']);
  eq('check: load fails the file a crash finding names', cs(c1, 'load|entity:t34'), 'fail');
  eq('check: a tool that timed out in check -> todo with the reason', [cs(c1, 'text|text:localization/a.lng'), /lnglint: stopped after 600 s/.test(cn(c1, 'text|text:localization/a.lng'))], ['todo', true]);
  eq('check: sync cosmetic finding passes', cs(c1, 'sync|mod'), 'pass');
  ok('check: note names the report and its time', /check report .*check\.json of \d{4}-.*made now/.test(cn(c1, 'sync|mod')), cn(c1, 'sync|mod'));
  ok('check: tools list the run and each tool with ms', c1.tools[0].tool === 'check run' && c1.tools[0].ok && ['refcheck', 'sdllint', 'binhdr', 'check', 'mpsync'].every(t => c1.tools.some(x => x.tool === t && x.ok && typeof x.ms === 'number')) && c1.tools.some(x => x.tool === 'lnglint' && !x.ok), c1.tools);
  ok('check: report kept', fs.existsSync(path.join(tmp, 'check.json')));
  // second run, mod unchanged: the kept report is reused, check is not run again
  const c2 = await stat.run(Object.assign({}, stack, { folder: modDir }), cplan, { tools: ctools, tmp });
  eq('reuse: kept report reused', [made, c2.tools[0].reused, /reused/.test(cn(c2, 'sync|mod')), cs(c2, 'refs|entity:t34')], [1, true, true, 'fail']);
  // a file of the plan changed after the report: stale, refused, check runs again
  const later = { changes: { files: [{ rel: T34, mtimeMs: Date.now() + 3600000 }] }, items: cplan.items, rows: cplan.rows };
  const c3 = await stat.run(Object.assign({}, stack, { folder: modDir }), later, { tools: ctools, tmp });
  eq('reuse: seeded: a stale report is refused', [made, c3.tools[0].reused, c3.notes.some(n => /not used: stale/.test(n))], [2, false, true]);
  // checkJson of the GUI: used when newer, same mod, same exe; refused for another mod, another exe, a --fast report
  const gj = path.join(scratch, 'gui-check.json'), tmp2 = path.join(scratch, 'tmp2');
  wj(gj, mkR({ errors: [], verdicts: { as64: { verdict: 'LOADS_STATIC', text: 'ok' } } }));
  const c4 = await stat.run(Object.assign({}, stack, { folder: modDir }), cplan, { tools: ctools, tmp: tmp2, checkJson: gj });
  eq('reuse: checkJson used, no check run', [made, c4.tools[0].report, cs(c4, 'text|text:localization/a.lng'), cs(c4, 'load|entity:t34')], [2, gj, 'pass', 'pass']);
  eq('reuse: other mod / other exe / fast / stale / ok', [
    /another mod/.test(stat.usable(gj, Object.assign({}, stack, { folder: path.join(scratch, 'othermod') }), cplan, ['refcheck']).why || ''),
    /another game/.test(stat.usable(gj, Object.assign({}, stack, { folder: modDir, gid: 'goh', exe: 'goh' }), cplan, ['refcheck']).why || ''),
    (() => { const f = path.join(scratch, 'fast.json'); wj(f, mkR({ fast: true })); return /--fast/.test(stat.usable(f, Object.assign({}, stack, { folder: modDir }), cplan, ['refcheck']).why || ''); })(),
    /stale/.test(stat.usable(gj, Object.assign({}, stack, { folder: modDir }), later, ['refcheck']).why || ''),
    !!stat.usable(gj, Object.assign({}, stack, { folder: modDir }), cplan, ['refcheck']).R], [true, true, true, true, true]);
  // a cut list (--locs): rows the report does not name cannot pass; a tool left out by --only cannot either
  const cut = stat.fromCheck({ findings: [{ tool: 'refcheck', code: 'REF_MODEL', n: 80, sev: 'crash', samples: [{ file: 'a.def', line: 1, msg: 'm' }] }], locs: 50 }, 'refcheck');
  ok('check: a cut finding list leaves an unchecked finding for all rows', cut.findings.some(f => f.severity === 'unchecked' && f.all && /79 locations/.test(f.msg)), cut);
  ok('check: a tool outside --only cannot', /not run for this report/.test(stat.fromCheck({ findings: [], testplan: { only: ['refcheck'] } }, 'milint').cannot || ''));

  // ---------------------------------------------------------------- results
  const out = path.join(scratch, 'out'), run1 = path.join(scratch, 'runs', 'g1'), run2 = path.join(scratch, 'runs', 'g2');
  const rr = (check, ent, w) => row(check, 'entity:' + ent, 'run', { entity: ent }, { w });
  const rplan = { items: [
    { id: 'entity:t34', kind: 'entity', key: 't34', name: 't34', cls: 'vehicle', file: T34 }, { id: 'entity:kv1', kind: 'entity', key: 'kv1', name: 'kv1', cls: 'vehicle', file: KV },
    { id: 'entity:bt7', kind: 'entity', key: 'bt7', name: 'bt7', cls: 'vehicle', file: 'resource/entity/-vehicle/tank_light/bt7/bt7.def' }],
  rows: [
    rr('fire', 't34', '76mm'), rr('dmgout', 't34', '76mm'),           // muzzle + kill
    rr('fire', 'flak', '20mm'), rr('dmgout', 'flak', '20mm'),         // noBlast -> unproven; parts -> pass
    rr('fire', 'bt7', '45mm'), rr('dmgout', 'bt7', '45mm'),           // shots read; NOKILL under class -> unproven
    rr('fire', 'kv1', '76mm'), rr('dmgout', 'kv1', '76mm'),           // 0 shots read -> fail; NOKILL not under -> fail
    rr('fire', 'su76', '76mm'), rr('dmgin', 'su76'),                  // void game
    rr('fire', 'mortar', '82mm'),                                     // held
    rr('fire', 'ghost', 'gun'),                                       // NOSPAWN
    rr('fire', 'lost', 'gun'),                                        // pair missing from the report
    rr('fire', 'nomap', 'gun'),                                       // no pair in map.json
    rr('fire', 'ctl', 'gun'),                                         // mapped onto a control pair only
    rr('dmgin', 'kv1'), rr('crew', 'kv1'), rr('fire', 'err', 'gun'),
    rr('dmgout', 'odd', 'gun'),                                       // NOKILL, classes unknown
    Object.assign(row('spawn', 'entity:t34', 'run', { entity: 't34', card: 't34' }), { runner: 'prove' }),
    Object.assign(row('spawn', 'entity:kv1', 'run', { entity: 'kv1', card: 'kv1' }), { runner: 'prove' }),
    Object.assign(row('spawn', 'entity:bt7', 'run', { entity: 'bt7', card: 'bt7' }), { runner: 'prove' }),
    Object.assign(row('spawn', 'entity:su76', 'run', { entity: 'su76', card: 'su76' }), { runner: 'prove' }),
    Object.assign(row('spawn', 'entity:flak', 'run', { entity: 'flak', card: 'flak' }), { runner: 'sweep' }),
    Object.assign(row('spawn', 'entity:ghost', 'run', { entity: 'ghost', card: 'ghost' }), { runner: 'sweep' }),
    Object.assign(row('spawn', 'entity:never', 'run', { entity: 'never', card: 'never' }), { runner: 'prove' }),
    Object.assign(row('move', 'entity:t34', 'run', { entity: 't34', card: 't34' }), { runner: 'prove' }),
    Object.assign(row('move', 'entity:kv1', 'run', { entity: 'kv1', card: 'kv1' }), { runner: 'prove' }),
    row('log', 'other:run', 'run', {}),
    row('look', 'entity:t34', 'player', { entity: 't34' }),
    row('refs', 'entity:t34', 'static', { entity: 't34', file: T34 }),
  ] };
  const id = (c, e, w) => `${c}|entity:${e}${w ? '|' + w : ''}`;
  wj(path.join(out, 'map.json'), { pairs: {
    fo_t34__gaz67b: [id('fire', 't34', '76mm'), id('dmgout', 't34', '76mm')],
    fo_flak__gaz67b: [id('fire', 'flak', '20mm'), id('dmgout', 'flak', '20mm')],
    fo_bt7__kv1: [id('fire', 'bt7', '45mm'), id('dmgout', 'bt7', '45mm')],
    fo_kv1__t34: [id('fire', 'kv1', '76mm'), id('dmgout', 'kv1', '76mm')],
    fo_su76__gaz67b: [id('fire', 'su76', '76mm')], di_su76__t34: [id('dmgin', 'su76')],
    fo_mortar__gaz67b: [id('fire', 'mortar', '82mm')], fo_ghost__gaz67b: [id('fire', 'ghost', 'gun')], fo_lost__gaz67b: [id('fire', 'lost', 'gun')],
    control_g1: [id('fire', 'ctl', 'gun')], di_kv1__t34: [id('dmgin', 'kv1')], task_kv1: [id('crew', 'kv1')], fo_err__gaz67b: [id('fire', 'err', 'gun')],
    fo_odd__thing: [id('dmgout', 'odd', 'gun')],
  } });
  const P = (name, verdict, o) => Object.assign({ name, verdict, game: 0, counted: true, shots: 0, shotsRead: true, hits: 0, parts: [], damaged: 0, kill: false, killGameS: null, fireProof: null, proof: null, noBlast: false, fireUnmeasured: false, held: false, hpBefore: null, control: false }, o);
  wj(path.join(run1, 'report.json'), { games: [{ controls: [{ name: 'control_g1', verdict: 'NOKILL' }, { name: 'control_b', verdict: 'PASS' }], void: false, reaped: false }], pairs: [
    P('control_g1', 'NOKILL', { control: true, shooter: 'zis3', foe: 'gaz67b' }),                 // a control failure: fails no row
    P('fo_t34__gaz67b', 'PASS', { shooter: 't34', foe: 'gaz67b', shots: 3, fireProof: 'muzzle', kill: true, killGameS: 12.5, proof: 'damage' }),
    P('fo_flak__gaz67b', 'NOKILL', { shooter: 'flak', foe: 'gaz67b', shots: null, shotsRead: false, noBlast: true, parts: ['wheel'] }),
    P('fo_bt7__kv1', 'NOKILL', { shooter: 'bt7', foe: 'kv1', shots: 4 }),
    P('fo_kv1__t34', 'NOKILL', { shooter: 'kv1', foe: 't34', shots: 0 }),
    P('fo_mortar__gaz67b', 'TOOCLOSE', { shooter: 'mortar', foe: 'gaz67b', held: true }),
    P('fo_ghost__gaz67b', 'NOSPAWN', { shooter: 'ghost', foe: 'gaz67b', countReason: "can't spawn entity ghost" }),
    P('di_kv1__t34', 'NOKILL', { shooter: 't34', foe: 'kv1', shots: 5, hits: 2 }),
    P('task_kv1', 'PASS', { shooter: 'kv1' }),
    P('fo_err__gaz67b', 'ERROR', { shooter: 'err', foe: 'gaz67b', error: 'script error' }),
    P('fo_odd__thing', 'NOKILL', { shooter: 'odd', foe: 'thing', shots: 2 }),
  ] });
  fs.writeFileSync(path.join(run1, 'game.log'), 'log of game 1\n');
  wj(path.join(run2, 'report.json'), { games: [{ controls: [{ name: 'control_g2', verdict: 'NOKILL' }], void: true, reaped: false }], pairs: [
    P('control_g2', 'NOKILL', { control: true }),
    P('fo_su76__gaz67b', 'PASS', { shooter: 'su76', foe: 'gaz67b', shots: 2, fireProof: 'muzzle', kill: true }),
    P('di_su76__t34', 'NOKILL', { shooter: 't34', foe: 'su76' }),
  ] });
  wj(path.join(scratch, 'runs', 'prove-spawn', 'report.json'), { rows: [{ card: 't34', kind: 'vehicle', pass: true, why: 'seen' }, { card: 'kv1', kind: 'vehicle', pass: false, why: 'never seen' }, { card: 'bt7', kind: 'vehicle', pass: null, why: 'slot lost' }], verdict: 'FAIL', control: { pass: true } });
  wj(path.join(scratch, 'runs', 'prove-move', 'result.json'), { depth: 'move', rows: [{ card: 't34', kind: 'vehicle', pass: true, why: 'moved' }], verdict: 'PASS', control: { pass: true } });
  wj(path.join(scratch, 'runs', 'prove-void', 'report.json'), { depth: 'spawn', rows: [{ card: 'su76', kind: 'vehicle', pass: false, why: 'never seen' }], verdict: 'VOID', control: { pass: false } });
  wj(path.join(scratch, 'runs', 'sweep', 'read.json'), { verdict: 'COMPLETE', entities: [{ name: 'flak', status: 'NO_ERROR', why: 'loop finished' }, { name: 'ghost', status: 'FAILED', line: 77, why: "Can't preload line 77" }, { name: 'bt7', status: 'NOT_REACHED', why: 'x' }] });

  const logSeen = [];
  const rtools = { logtriage: f => { logSeen.push(path.basename(path.dirname(f))); return [{ file: 'game.log', line: 40, code: 'LOG_ERROR_MSG', msg: 'No Stuff', severity: 'error' }, { file: 'game.log', line: 2, code: 'LOG_NOISE', msg: 'x', severity: 'note' }]; }, bootcheck: () => ({ units: [] }) };
  const r = results.read(stack, rplan, { out, dirs: [path.join(scratch, 'runs')], tools: rtools });
  const g = k => (r.rows.find(x => x.id === k) || {}).status, gn = k => ((r.rows.find(x => x.id === k) || {}).result || {});
  eq('read: fire pass on muzzle', g(id('fire', 't34', '76mm')), 'pass');
  eq('read: dmgout pass on a counted kill', g(id('dmgout', 't34', '76mm')), 'pass');
  eq('read: result names pair and verdict', [gn(id('fire', 't34', '76mm')).pair, gn(id('fire', 't34', '76mm')).verdict, gn(id('fire', 't34', '76mm')).tool], ['fo_t34__gaz67b', 'PASS', 'edrun']);
  eq('read: noBlast gun -> fire unproven', g(id('fire', 'flak', '20mm')), 'unproven');
  eq('read: parts broken -> dmgout pass', g(id('dmgout', 'flak', '20mm')), 'pass');
  eq('read: shots read -> fire pass', g(id('fire', 'bt7', '45mm')), 'pass');
  eq('read: NOKILL under the foe class -> unproven', g(id('dmgout', 'bt7', '45mm')), 'unproven');
  eq('read: NOKILL of the class or above -> fail', g(id('dmgout', 'kv1', '76mm')), 'fail');
  eq('read: 0 shots read, no proof -> fire fail', g(id('fire', 'kv1', '76mm')), 'fail');
  eq('read: NOKILL with unknown classes -> unproven', g(id('dmgout', 'odd', 'gun')), 'unproven');
  eq('read: void game -> void (even with a PASS pair)', [g(id('fire', 'su76', '76mm')), g(id('dmgin', 'su76'))], ['void', 'void']);
  eq('read: preflight hold -> held with the word', [g(id('fire', 'mortar', '82mm')), /TOOCLOSE/.test(gn(id('fire', 'mortar', '82mm')).note)], ['held', true]);
  eq('read: NOSPAWN -> fail', [g(id('fire', 'ghost', 'gun')), gn(id('fire', 'ghost', 'gun')).findings[0].code], ['fail', 'EDRUN_NOSPAWN']);
  eq('read: ERROR -> fail', g(id('fire', 'err', 'gun')), 'fail');
  eq('read: pair missing from the report -> todo', [g(id('fire', 'lost', 'gun')), /not in any edrun report/.test(gn(id('fire', 'lost', 'gun')).note)], ['todo', true]);
  eq('read: row with no pair in map.json -> todo', [g(id('fire', 'nomap', 'gun')), /no pair/.test(gn(id('fire', 'nomap', 'gun')).note)], ['todo', true]);
  eq('read: a control failure fails no row', g(id('fire', 'ctl', 'gun')), 'todo');
  ok('read: no row failed by a control', !r.rows.some(x => x.status === 'fail' && /control/.test(JSON.stringify(x.result))), r.rows.filter(x => x.status === 'fail').map(x => x.id));
  eq('read: dmgin pass on hits', g(id('dmgin', 'kv1')), 'pass');
  eq('read: crew pass', g(id('crew', 'kv1')), 'pass');
  eq('read: prove spawn pass / fail / null', [g('spawn|entity:t34'), g('spawn|entity:kv1'), g('spawn|entity:bt7')], ['pass', 'fail', 'unproven']);
  eq('read: prove VOID -> void, not fail', g('spawn|entity:su76'), 'void');
  eq('read: prove move pass; spawn depth does not prove move', [g('move|entity:t34'), g('move|entity:kv1')], ['pass', 'todo']);
  eq('read: sweep NO_ERROR is not a pass; FAILED fails', [g('spawn|entity:flak'), g('spawn|entity:ghost')], ['unproven', 'fail']);
  eq('read: a unit no report names -> todo', g('spawn|entity:never'), 'todo');
  eq('read: log row fails on an error line', [g('log|other:run'), gn('log|other:run').findings.length, logSeen], ['fail', 1, ['g1']]);
  ok('read: player and static rows untouched', !r.rows.some(x => /^(look|refs)\|/.test(x.id)));
  ok('read: tools listed', ['edrun', 'prove', 'preloadsweep', 'logtriage'].every(t => r.tools.some(x => x.tool === t && x.ok)), r.tools);
  // no map.json, no reports: everything todo, tool not ok (seeded defect: an empty run dir must not pass anything)
  const empty = path.join(scratch, 'empty'); fs.mkdirSync(empty, { recursive: true });
  const r0 = results.read(stack, rplan, { out: empty, dirs: [empty], tools: rtools });
  ok('read: seeded: empty run -> nothing passes', r0.rows.length > 20 && r0.rows.every(x => x.status === 'todo' && x.result.note) && r0.tools.some(t => t.tool === 'edrun' && !t.ok), r0.rows.filter(x => x.status !== 'todo'));
  // other map.json form + explicit under flag
  wj(path.join(scratch, 'out2', 'map.json'), [{ name: 'fo_odd__thing', rows: [id('dmgout', 'odd', 'gun')], under: false }]);
  const r2 = results.read(stack, rplan, { out: path.join(scratch, 'out2'), dirs: [run1], tools: rtools });
  eq('read: map list form, under:false -> NOKILL fails', (r2.rows.find(x => x.id === id('dmgout', 'odd', 'gun')) || {}).status, 'fail');
  // pure rule table
  const ps = (c, p, gm, u) => results.pairStatus(c, p, gm, u).status;
  eq('rule: fire', [ps('fire', P('a', 'NOKILL', { fireProof: 'hit' })), ps('fire', P('a', 'NOKILL', { shots: 3, shotsRead: false })), ps('fire', P('a', 'PASS', { fireProof: 'held' })), ps('fire', P('a', 'PASS', { shots: null, fireUnmeasured: true }))], ['pass', 'unproven', 'fail', 'unproven']);
  eq('rule: dmgout', [ps('dmgout', P('a', 'NOKILL', { proof: 'hp' })), ps('dmgout', P('a', 'NOKILL', { damaged: 2 })), ps('dmgout', P('a', 'FALSEKILL', { kill: true })), ps('dmgout', P('a', 'PASS', { kill: true, counted: false })), ps('dmgout', P('a', 'NOKILL', {}), null, true)], ['pass', 'pass', 'unproven', 'pass', 'unproven']);
  eq('rule: order', [ps('fire', P('a', 'BLOCKED', {}), { void: true }), ps('fire', P('a', 'NOSPAWN', {}), { void: true }), ps('fire', P('a', 'ERROR', {}), { void: true }), ps('fire', P('a', 'PASS', { fireProof: 'muzzle' }), { void: null })], ['held', 'fail', 'void', 'pass']);

  // ---------------------------------------------------------------- apply
  const full = Object.assign({ v: 1, summary: { rows: 0, byHow: {}, byStatus: {}, byCheck: {}, items: 3 }, checklist: { sessions: [{ id: 'editor', entries: [{ row: id('dmgout', 'kv1', '76mm') }] }] } }, rplan);
  const a = results.apply(full, r.rows);
  const as = k => a.rows.find(x => x.id === k).status;
  eq('apply: statuses merged', [as(id('fire', 't34', '76mm')), as(id('dmgout', 'kv1', '76mm')), as(id('fire', 'su76', '76mm')), as('look|entity:t34')], ['pass', 'fail', 'void', 'todo']);
  eq('apply: summary recounted', [a.summary.rows, a.summary.byHow, Object.values(a.summary.byStatus).reduce((x, y) => x + y, 0), a.summary.byStatus.void, a.summary.items], [rplan.rows.length, { static: 1, run: rplan.rows.length - 2, player: 1 }, rplan.rows.length, 3, 3]);
  ok('apply: the input plan is not changed', rplan.rows.every(x => x.status === 'todo' && x.result === null));
  ok('apply: a todo result leaves its note', /no pair/.test(a.rows.find(x => x.id === id('fire', 'nomap', 'gun')).result.note));
  const b = results.apply(a, [{ id: id('fire', 't34', '76mm'), status: 'todo', result: { tool: 'edrun', findings: [], note: 'x' } }, { id: 'look|entity:t34', tick: { v: 'pass', note: 'looks right' } },
    { id: id('fire', 't34', '76mm'), tick: { v: 'fail' } }, { id: id('dmgout', 'kv1', '76mm'), tick: { v: 'pass', note: 'penetrates at 50 m' } }, { id: 'nope', status: 'pass' }]);
  const bs = k => b.rows.find(x => x.id === k);
  eq('apply: a todo result never takes a pass away', bs(id('fire', 't34', '76mm')).status, 'pass');
  eq('apply: tick sets a player row', [bs('look|entity:t34').status, bs('look|entity:t34').result.tool, bs('look|entity:t34').result.note], ['pass', 'player', 'looks right']);
  eq('apply: tick sets a checklist row, not another run row', [bs(id('dmgout', 'kv1', '76mm')).status, bs(id('fire', 't34', '76mm')).status], ['pass', 'pass']);
  const c = results.apply(a, s, { ticks: { 'look|entity:t34': { v: 'skip' }, [id('fire', 'kv1', '76mm')]: { v: 'pass' } } });
  eq('apply: takes a static.run result and state ticks', [c.rows.find(x => x.id === 'refs|entity:t34').status, c.rows.find(x => x.id === 'look|entity:t34').status, c.rows.find(x => x.id === id('fire', 'kv1', '76mm')).status, c.summary.byStatus.skip], ['fail', 'skip', 'fail', 1]);

  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); console.log(`${passed} passed, ${failed + 1} failed`); process.exit(1); });
