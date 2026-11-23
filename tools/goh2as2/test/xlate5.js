// XLATE-5 tests, invented fixtures only (nothing here is game data): file check, damage_components pull, multi-line seat drop, error last line,
// fit pass (seat macro expansion, default aim bone), reactive weapon import. run via run.sh.
// Author: Imperator_Aug (ARSENAL, ia-4e1469be)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, 'fixture', 'xlate5');
fs.rmSync(root, { recursive: true, force: true });
const put = (rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data.replace(/\r?\n/g, '\r\n'), 'latin1'); };
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'xlate5: ' + name + (good || !extra ? '' : '  ' + String(extra).slice(0, 600))); if (!good) fail++; };
const rd = p => { try { return fs.readFileSync(path.join(root, p), 'latin1'); } catch { return null; } };

// GoH rep r5: bones seat01 + sight1 (no seat02, no foresight), mdl names /properties/damage_components.ext (GoH only)
put('goh/resource/entity/r5/r5.def', '{game_entity\n  {Extension "r5.mdl"}\n}\n');
put('goh/resource/entity/r5/r5.mdl', '{model "r5"\n  {Extension "/properties/damage_components.ext"}\n  {bone "basis"\n    {bone revolute "turret"}\n    {bone "seat01"}\n    {bone "sight1"}\n    {bone "mgun"}\n  }\n}\n');
put('goh/resource/properties/damage_components.ext', '{damage_components "x"}\n');
// rep r6: its mdl has a {sequence "gone"} with no gone.anm anywhere
put('goh/resource/entity/r6/r6.def', '{game_entity\n  {Extension "r6.mdl"}\n}\n');
put('goh/resource/entity/r6/r6.mdl', '{model "r6"\n  {bone "basis"}\n  {sequence "gone"}\n}\n');
// "vanilla": donor v5 with a seat macro family and a weapon whose stuff entry has {foresight "foresight"}
put('as2/resource/entity/v5/v5.def', '{game_entity\n  (include "/entity/v5/seats.ext")\n  {Extension "v5.mdl"}\n  ("seat_2_human")\n  {Weaponry\n    {place "mgun"\n      {type "mgun_main"}\n      {weapon "mgfix" filled}\n    }\n  }\n}\n');
put('as2/resource/entity/v5/v5.mdl', '{model "v5"}\n');
put('as2/resource/entity/v5/seats.ext', '(define "seat_human"\n  {placer\n    {place "%place" {LinkBone "%bone"} {openForCrush}}\n  }\n)\n(define "seat_2_human"\n  ("seat_human" place(seat1) bone(seat01))\n  ("seat_human" place(seat2) bone(seat02))\n)\n');
put('as2/resource/set/stuff/mgun/mgfix', '{weapon_bullet\n  {foresight "foresight"}\n  {rechargeTime 1}\n}\n');
put('as2/resource/entity/v6/v6.def', '{game_entity\n  {Extension "v6.mdl"}\n}\n');
put('as2/resource/entity/v6/v6.mdl', '{model "v6"}\n');

const tool = path.join(__dirname, '..', 'goh2as2.js'), dfit = path.join(__dirname, '..', '..', 'donorfit', 'donorfit.js');
const run = args => cp.spawnSync(process.execPath, [tool, '--goh', path.join(root, 'goh'), '--game', path.join(root, 'as2'), '--exe', 'mowas_2', '--no-keylint', '--no-rc', ...args], { encoding: 'utf8' });
const lastLine = r => (r.stdout + '\n').split(/\r?\n/).filter(Boolean).pop() || '';

// ---- items 2, 5: r5 on donor v5
const o5 = path.join(root, 'o5'), r5 = run(['--entity', 'r5', '--donor', 'v5', '--rep-key', '--out', o5]);
const d5 = rd('o5/resource/entity/r5/r5.def') || '';
t('build r5 exits 0', r5.status === 0, r5.stdout + r5.stderr);
t('item 2: damage_components.ext pulled without --pull-props (donor mode)', rd('o5/resource/properties/damage_components.ext') !== null);
t('item 5: seat macro expanded in the def, the seat the mdl has stays', /place\(seat1\) bone\(seat01\)/.test(d5) && !/\("seat_2_human"\)/.test(d5), d5);
t('item 5: the seat whose bone the mdl lacks is gone', !/seat02/.test(d5), d5);
t('item 5: default aim bone: place got {foresight} naming an mdl bone', /\{place "mgun" \{foresight "sight1"\}/.test(d5), d5);
const f5 = cp.spawnSync(process.execPath, [dfit, path.join(o5, 'resource/entity/r5/r5.def'), '--game', path.join(root, 'as2'), '--exe', 'mowas_2', '--moddir', o5, '--json'], { encoding: 'utf8' });
let j5 = null; try { j5 = JSON.parse(f5.stdout); } catch { /* none */ }
t('item 5: donorfit on the output: no LinkBone / DF_AIM / door miss', j5 && !j5.misses.some(m => /^(LinkBone|DF_AIM|door)$/.test(m.key)), f5.stdout.slice(0, 600));
const o5n = path.join(root, 'o5n'), r5n = run(['--entity', 'r5', '--donor', 'v5', '--rep-key', '--no-fit-pass', '--out', o5n]);
t('item 5 control (--no-fit-pass): def keeps the seat macro call', /\("seat_2_human"\)/.test(rd('o5n/resource/entity/r5/r5.def') || ''), r5n.stdout);

// ---- items 1, 4: r6 on donor v6, a sequence with no file
const o6 = path.join(root, 'o6'), r6 = run(['--entity', 'r6', '--donor', 'v6', '--rep-key', '--out', o6]);
t('item 1: a file the mdl names that nobody has -> exit non-zero', r6.status === 1, r6.stdout + r6.stderr);
t('item 4: the last output line gives the reason', /^exit 1: 1 ERR_DONOR_FILE_MISSING, first: \S+ \S*gone\.anm/.test(lastLine(r6)), lastLine(r6));
const o6a = path.join(root, 'o6a'), r6a = run(['--entity', 'r6', '--donor', 'v6', '--rep-key', '--allow-missing', '--out', o6a]);
t('item 1 control: --allow-missing keeps exit 0 and warns', r6a.status === 0 && /WARN_DONOR_FILE_MISSING/.test(r6a.stdout), r6a.stdout);
const rU = run(['--entity', 'r6', '--donor', 'nosuchdonor', '--out', path.join(root, 'oU')]);
t('item 4: unknown donor: exit non-zero, reason on the last line', rU.status !== 0 && /^error: /.test((rU.stderr + '\n').split(/\r?\n/).filter(Boolean).pop() || ''), rU.stdout + rU.stderr);

// ---- item 3: the seat drop takes a whole multi-line macro (translate.js)
const TR = require('../translate');
const src = '{game_entity\n\t("seat_human"\n\t\tplace(a)\n\t\tbone(b) ; note )\n\t)\n\t("seat_human" place(c))\n\t{props "x"}\n}\n';
const sl = TR.seatLines(src);
t('item 3: two seat calls found, the first spans its lines', sl.length === 2 && /bone\(b\)/.test(sl[0].txt) && /\)$/.test(sl[0].txt.trim()), JSON.stringify(sl));
const cut = TR.cutSeat(src, sl[0]);
t('item 3: first (multi-line) seat cut whole: no stray text, one call left', !/place\(a\)|bone\(b\)|note/.test(cut) && /place\(c\)/.test(cut) && /\{props "x"\}/.test(cut), cut);
const bal = s => { let d = 0; for (const c of s) { if (c === '(') d++; else if (c === ')') d--; if (d < 0) return false; } return d === 0; };
t('item 3: parens balanced after the cut', bal(cut.replace(/;[^\n]*/g, '')), cut);

// ---- item 6: reactive import writes aimRange + maxRange (goh2as2.reactiveWeapon)
const G = require('../goh2as2.js');
const tmpl = '{weapon_bullet\n\t{tag "mrl gun"}\n\t{aimRange 130}\n\t{maxRange 130}\n\t{rechargeTime 10}\n\t{gravity 6}\n}\n';
const rw = G.reactiveWeapon(tmpl, { imp: { range: 229.6, recharge: 120 } }, '132mm_bm13', 'mortar150');
t('item 6: weapon_bullet root kept, no {from} root', /\n\{weapon_bullet/.test(rw) && !/\{\s*from\s/.test(rw), rw);
t('item 6: aimRange + maxRange + rechargeTime from the table', /\{aimRange 230\}/.test(rw) && /\{maxRange 230\}/.test(rw) && /\{rechargeTime 120\}/.test(rw) && !/\{aimRange 130\}/.test(rw), rw);
const rw2 = G.reactiveWeapon('{weapon_bullet\n\t{tag "gun"}\n\t("heavy_artillery")\n}\n', { imp: { range: 300, recharge: 7 } }, 'x', 'panzerwerfer42');
t('item 6: template without the keys gets them added inside the root', /\{weapon_bullet\n\t\{(aimRange|maxRange|rechargeTime) /.test(rw2) && /\{aimRange 300\}/.test(rw2) && /\{maxRange 300\}/.test(rw2) && /\{rechargeTime 7\}/.test(rw2), rw2);

console.log(fail ? fail + ' FAILED (xlate5)' : 'xlate5: all ok');
process.exit(fail ? 1 : 0);
