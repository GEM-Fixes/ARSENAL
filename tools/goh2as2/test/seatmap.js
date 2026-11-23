// FXE-1 tests, invented fixtures only: the seat rule of the fit pass. A driver / gunner / weapon-crew seat whose door or linkbone the rep mdl lacks is KEPT: an alias bone
// (a copy of the nearest real bone, else the root) is added to the output mdl and a SEAT_MAP line says so. A secondary seat keeps the old drop. A vehicle with no driver
// seat, or a gun with no gunner seat, fails the build by name (ERR_DONOR_SEAT). run via run.sh.
// Author: Imperator_Aug (ARSENAL, ia-da8e4ee8)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, 'fixture', 'seatmap');
fs.rmSync(root, { recursive: true, force: true });
let fail = 0;
const put = (rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data.replace(/\r?\n/g, '\r\n'), 'latin1'); };
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'seatmap: ' + name + (good || !extra ? '' : '  ' + String(extra).slice(0, 700))); if (!good) fail++; };
const rd = p => { try { return fs.readFileSync(path.join(root, p), 'latin1'); } catch { return null; } };

// rep s1: bones emit1, emit2 only (no emit0, driver, gunner, seat03)
put('goh/resource/entity/s1/s1.def', '{game_entity\n  {Extension "s1.mdl"}\n}\n');
const mdl = '{Skeleton\n  {bone "basis"\n    {bone "emit1"\n      {Matrix34\n        0 -1 0\n        1 0 0\n        0 0 1\n        3.5 37 0\n      }\n    }\n    {bone "emit2"\n      {Matrix34\n        0 1 0\n        -1 0 0\n        0 0 1\n        3.5 -37 0\n      }\n    }\n    {bone "mgun"}\n  }\n}\n';
put('goh/resource/entity/s1/s1.mdl', mdl);
put('goh/resource/entity/s2/s2.def', '{game_entity\n  {Extension "s2.mdl"}\n}\n');
put('goh/resource/entity/s2/s2.mdl', mdl);
// donor vs1: a vehicle; driver door emit0 + bone driver, gunner door emit1 + bone gunner (crews the mg), seat3 door emit1 + bone seat03 (secondary)
// a two-door macro (tank_crew.ext crew_human): a call that gives door1 only leaves "%door2" unresolved (SDL-21), vanilla never does that
const crew2d = '(define "crew_2d"\n  {placer\n    {place "%place" {group "crew"}}\n  }\n  {boarder\n    {door "%door1"}\n    {door "%door2"}\n    {link "%door1" "%place" {anm "left"}}\n    {link "%door2" "%place" {anm "right"}}\n  }\n)\n';
const crew = crew2d + '(define "crew_human"\n  {placer\n    {place "%place" {group "crew"} {LinkBone "%bone"}}\n  }\n  {boarder\n    {door "%door"}\n    {link "%door" "%place" {anm "crew"} {forward putoff} {reverse puton}}\n  }\n)\n';
put('as2/resource/entity/vs1/vs1.def', '{game_entity\n  (include "/entity/vs1/crew.ext")\n  {Extension "vs1.mdl"}\n  {PatherID "tank"}\n  ("crew_human" place(driver) door(emit0) bone(driver))\n  ("crew_human" place(gunner) door(emit1) bone(gunner))\n  ("crew_human" place(seat3) door(emit1) bone(seat03))\n  ("crew_2d" place(commander) door1(emit1))\n  {Weaponry\n    {place "mgun"\n      {gunner "gunner"}\n    }\n  }\n}\n');
put('as2/resource/entity/vs1/vs1.mdl', '{model "vs1"}\n');
put('as2/resource/entity/vs1/crew.ext', crew);
// donor vs2: a vehicle with no driver seat at all
put('as2/resource/entity/vs2/vs2.def', '{game_entity\n  (include "/entity/vs2/crew.ext")\n  {Extension "vs2.mdl"}\n  {PatherID "tank"}\n  ("crew_human" place(gunner) door(emit1) bone(gunner))\n}\n');
put('as2/resource/entity/vs2/vs2.mdl', '{model "vs2"}\n');
put('as2/resource/entity/vs2/crew.ext', crew);

const tool = path.join(__dirname, '..', 'goh2as2.js'), dfit = path.join(__dirname, '..', '..', 'donorfit', 'donorfit.js');
const run = args => cp.spawnSync(process.execPath, [tool, '--goh', path.join(root, 'goh'), '--game', path.join(root, 'as2'), '--exe', 'mowas_2', '--no-keylint', '--no-rc', ...args], { encoding: 'utf8' });

const o1 = path.join(root, 'o1'), r1 = run(['--entity', 's1', '--donor', 'vs1', '--rep-key', '--out', o1]);
const d1 = rd('o1/resource/entity/s1/s1.def') || '', m1 = rd('o1/resource/entity/s1/s1.mdl') || '';
t('build exits 0', r1.status === 0, r1.stdout + r1.stderr);
t('driver seat kept (call still in the def)', /place\(driver\)/.test(d1), d1);
t('gunner seat kept (crews the mg)', /place\(gunner\)/.test(d1), d1);
t('secondary seat3 (no weapon crew, bone absent) is not aliased: old route (no alias bone in the mdl)', !/\{bone "seat03"/.test(m1), m1);
t('door emit0 added to the mdl as a copy of the nearest emit (emit1: same Matrix34)', /\{bone "emit0"[\s\S]*?3\.5 37 0/.test(m1), m1);
t('seat bones driver and gunner added to the mdl', /\{bone "driver"/.test(m1) && /\{bone "gunner"/.test(m1), m1);
t('the mdl keeps its own bones once', (m1.match(/\{bone "emit1"/g) || []).length === 1 && (m1.match(/\{bone "emit2"/g) || []).length === 1, m1);
t('a SEAT_MAP report line names what was mapped', /SEAT_MAP[^\n]*door emit0 -> emit1/.test(r1.stdout) && /SEAT_MAP[^\n]*gunner/.test(r1.stdout), r1.stdout);
const f1 = cp.spawnSync(process.execPath, [dfit, path.join(o1, 'resource/entity/s1/s1.def'), '--game', path.join(root, 'as2'), '--exe', 'mowas_2', '--moddir', o1, '--json'], { encoding: 'utf8' });
let j1 = null; try { j1 = JSON.parse(f1.stdout); } catch { /* none */ }
t('donorfit on the output: no LinkBone / door miss', j1 && !j1.misses.some(m => /^(LinkBone|door)$/.test(m.key)), f1.stdout.slice(0, 600));
t('donorfit lists the seats of the output with an ok door', j1 && Array.isArray(j1.seats) && j1.seats.some(s => s.place === 'driver' && s.doors.length && s.doors.every(d => d.ok)), f1.stdout.slice(0, 400));

t('a call with door1 only gets door2 (another emit of the mdl): no unresolved "%door2"', /\("crew_2d" place\(commander\) door1\(emit1\) door2\(emit2\)\)/.test(d1) && !/%door2/.test(f1.stdout), d1 + f1.stdout.slice(0, 300));

const o2 = path.join(root, 'o2'), r2 = run(['--entity', 's2', '--donor', 'vs2', '--rep-key', '--out', o2]);
t('vehicle with no driver seat fails the build', r2.status === 1, r2.stdout + r2.stderr);
t('the failure names the seat', /ERR_DONOR_SEAT[^\n]*driver/.test(r2.stdout + r2.stderr), r2.stdout + r2.stderr);
const o2a = path.join(root, 'o2a'), r2a = run(['--entity', 's2', '--donor', 'vs2', '--rep-key', '--allow-missing', '--out', o2a]);
t('--allow-missing keeps exit 0 and warns', r2a.status === 0 && /WARN_DONOR_SEAT/.test(r2a.stdout), r2a.stdout + r2a.stderr);
if (fail) process.exit(1);
