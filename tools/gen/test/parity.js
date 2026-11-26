// parity: game parity of gen (AS64, MoW:AS2, GoH). Own made-up fixture, no game:
//   MoW:AS2 on a shared install (as64.exe in the folder): the Ctx vfs is the mowas_2 view (no as64/core layer), child tools get --exe mowas_2
//   (clone-entity, place-entity, mission-clone + --target mowas2); AS64 and a folder without as64.exe keep their argument lists as before.
//   GoH: gun (cannon: "reload time" seconds(), "velocity" mps(), range_<n>; pen / pen_scale / damage on the "penetration_*" shell rows
//   and "armor health" through lib/gohgun.js, a like without them stops with its code), gun of a class ("fire rate"
//   rpm() from set/small_firearms_accuracy.inc), shell, item, soundclass and weapon run on the GoH file forms, voice on the GoH talk trees; sound skin stuffmodel
//   mapinfo army card-list squad-remove kitbash bots stop with their code and the lib/games plain line; gen --describe
//   --target goh exits 2 with that line. GoH accuracy_* calls carry the define's params (copied from the like; a missing one stops the op),
//   mission-clone on GoH runs its --exe goh branch. statsheet, build, refcheck and the describe unit list get --exe mowas_2 (spawn stubbed).
// node parity.js <work dir>   prints "OK name" / "FAIL name: why", exit 1 on a FAIL.
// Author: Imperator_Aug (ARSENAL, ia-8fc9ccdc)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = path.resolve(process.argv[2] || path.join(__dirname, 'work'), 'parity'); fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });
const C = require('../../modmove/lib/common');
const { Ctx } = require('../lib/ctx'), O = require('../lib/ops');
let bad = 0;
const ok = (name, c, why) => { console.log(c ? 'OK ' + name : 'FAIL ' + name + ': ' + (why || '')); if (!c) bad++; };
const put = (root, key, data) => { const f = path.join(root, key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.isBuffer(data) ? data : Buffer.from(data.replace(/\r?\n/g, '\r\n'), 'latin1')); };

// ---- fixture 1: a shared AS2 install (as64.exe + as64/core) and a plain one (no as64.exe)
const SH = path.join(W, 'shared'), PL = path.join(W, 'plain');
for (const r of [SH, PL]) {
  put(r, 'resource/entity/-vehicle/tank_a/tank_a.def', '{game_entity\n\t{hp 1}\n}\n');
  put(r, 'resource/set/multiplayer/units/vehicles_rus.set', '{"tank_a" ("tank" side(rus) cost(100))}\n');
}
put(SH, 'as64.exe', 'MZ not a real exe');
put(SH, 'as64/core/resource/entity/-vehicle/core_t/core_t.def', '{game_entity\n\t{hp 2}\n}\n');
const CORE = 'resource/entity/-vehicle/core_t/core_t.def';
const ctxOf = (target, game, extra) => new Ctx(Object.assign({ target, game, out: path.join(W, 'out-' + target), plan: true }, extra || {}));
{
  const m = ctxOf('mowas2', SH), a = ctxOf('as64', SH), p = ctxOf('mowas2', PL);
  ok('mowas2 on the shared install reads the mowas_2 view', m.vfs().exe === 'mowas_2' && !m.vfs().files.has(CORE), m.vfs().exe);
  ok('as64 on the shared install reads the as64 view (as64/core mounted)', a.vfs().exe === 'as64' && a.vfs().files.has(CORE), a.vfs().exe);
  ok('mowas2 exeArgs on the shared install', JSON.stringify(m.exeArgs()) === '["--exe","mowas_2"]', JSON.stringify(m.exeArgs()));
  ok('as64 exeArgs empty (argument list as before)', a.exeArgs().length === 0);
  ok('mowas2 without as64.exe: exeArgs empty (the tool picks mowas_2 itself)', p.exeArgs().length === 0 && p.vfs().exe === 'mowas_2');
  ok('vanilla tank seen by both', m.exists('resource/entity/-vehicle/tank_a/tank_a.def') && a.exists('resource/entity/-vehicle/tank_a/tank_a.def'));
}
// child tool arguments (C.runTool stubbed: nothing runs)
{
  const calls = [], real = C.runTool;
  C.runTool = (tool, args) => { calls.push({ tool, args }); return { status: 0, out: '0 findings\n', err: '' }; };
  try {
    for (const target of ['mowas2', 'as64']) {
      const c = new Ctx({ target, game: SH, out: path.join(W, 'real-' + target), plan: false });
      O.opClone(c, { entity: 'tank_a', as: 'tank_z' });
      O.opPlace(c, { map: 'multi/m1', entity: 'tank_a', pos: '1,2' });
      O.opMissionClone(c, { map: 'map/multi/m1', from: 'combat', to: 'assault' });
    }
  } finally { C.runTool = real; }
  const of = (tool, i) => calls.filter(c => c.tool === tool)[i].args.join(' ');
  for (const t of ['clone-entity', 'place-entity', 'mission-clone']) {
    ok(t + ': mowas2 gets --exe mowas_2', / --exe mowas_2( |$)/.test(of(t, 0)), of(t, 0));
    ok(t + ': as64 arguments carry no --exe', !/--exe/.test(of(t, 1)), of(t, 1));
  }
  ok('mission-clone: mowas2 also gets --target mowas2', / --target mowas2( |$)/.test(of('mission-clone', 0)) && !/--target/.test(of('mission-clone', 1)), of('mission-clone', 0));
}

// ---- fixture 2: a tiny GoH tree (loose resource/), shapes copied from the vanilla GoH files
const H = path.join(W, 'goh'), ST = 'resource/set/stuff/';
put(H, 'resource/set/small_firearms_accuracy.inc', '(define "fire rate"\n\t{recoveryTime (/ 60 %rpm)}\n)\n(define "velocity"\n\t{speed %mps}\n)\n(define "reload time"\n\t{rechargeTime %seconds}\n)\n');
put(H, ST + 'gun/.presets', '(define "global velocity"\n\t{speed (* 0.75 %gv)}\n)\n(define "velocity"\n\t("global velocity" gv(%mps))\n)\n(define "reload time"\n\t{rechargeTime %seconds}\n)\n(define "velocity m/s"\n\t("global velocity" gv(%he))\n)\n(define "range_160"\n\t{range 160 160}\n)\n(define "range_200"\n\t{range 200 200}\n)\n(define "accuracy_direct"\n\t{spreading %r1 (* 1 %range_ap) %range_he %range_heat}\n)\n(define "accuracy_indirect"\n\t{spreading %r1 %r2 %rmax %range_ap %range_he %range_heat}\n)\n(define "penetration_medium"\n\t{x 1}\n)\n');
put(H, ST + 'gun/100mm_d10c', '{from "pattern gun"\n\t{filling "bulletrus_100" 1}\n\t("reload time" seconds(9))\n\t("velocity" mps(880))\n\t("range_160")\n\t("accuracy_direct" r1(0.55) range_ap(220) range_he(220) range_heat(220))\n}\n');
// per-type accuracy ranges like vanilla 37mm_pak35 (range_160, heat 110); a like with no range_<n> call at all
put(H, ST + 'gun/37mm_pt', '{from "pattern gun"\n\t("range_160")\n\t("accuracy_direct" r1(0.5) range_ap(160) range_he(160) range_heat(110))\n}\n');
put(H, ST + 'gun/37mm_noran', '{from "pattern gun"\n\t("accuracy_direct" r1(0.5) range_ap(150) range_he(150) range_heat(110))\n}\n');
put(H, ST + 'gun/100mm_ammo','{from "pattern gun"\n\t{filling "bulletrus_100"}\n\t("reload time" seconds(10.5))\n\t("velocity m/s" ap(890) apcr(1) he(880) heat(1))\n\t("range_160")\n}\n');
put(H, ST + 'gun/100mm_pen', '{from "pattern gun"\n\t("range_220")\n\t("armor health" damage(280))\n\t("armor health custom" shell(aphe) damage(280) velocity(890) filler(88))\n\t("penetration_long" shell(aphe) range(220) a(209) b(187) c(162) d(141) e(122))\n\t("penetration_medium" shell(heat) range(160) a(180) b(180) c(180) d(180) e(180))\n}\n');
put(H, ST + 'rifle/.presets', '(include "\\set\\small_firearms_accuracy.inc")\n(define "semi_rifle"\n\t{spreading 1}\n)\n');
put(H, ST + 'rifle/rifle.pattern', '{weapon\n\t{filling "ammo rifle" 5}\n}\n');
put(H, ST + 'rifle/avt40', '{from "pattern rifle"\n\t{filling "ammo rifle_rus" 10}\n\t{entity "avt40"}\n\t("fire rate" rpm(460))\n\t("velocity" mps(830))\n\t("semi_rifle")\n}\n');
put(H, ST + 'shell/he.pattern', '{from "pattern generic"\n\t{tag "he"}\n}\n');
put(H, ST + 'shell/bullet_105x380.fin.he.ammo', '{from "pattern he"\n\t{tag "shell size3 arty no_throw"}\n\t{entity "105mm_fin_he"}\n\t{mass 15.3}\n}\n');
put(H, ST + 'grenade/anti-personnel.pattern', '{item\n\t{special\n\t\t{PrepareTime 4}\n\t}\n\t{throw\n\t\t{range 20}\n\t\t{startAngle 35}\n\t}\n}\n');
put(H, ST + 'grenade/anti-personnel grenade/m32.grenade', '{from "pattern anti-personnel"\n\t{tag "size1"}\n\t{entity "m32"}\n\t{special\n\t\t{PrepareTime 5.5}\n\t}\n}\n');
put(H, 'resource/sound/sound.set', '{sound\n\t{percent "effects" 70}\n\t{percent "emotions" 20}\n\t{percent "speech" 10}\n\t{loudness "default" 5 100 0}\n\t{loudness "world" 100 1000 50}\n}\n');
put(H, 'resource/entity/-vehicle/finland/tank_medium/t3485_44_fin/t3485_44_fin.def', '{game_entity\n\t{Weaponry\n\t\t{place "gun"\n\t\t\t{weapon "85mm_zis53" filling "bulletrus_85 aphebc" 1}\n\t\t\t{gunner "gunner"}\n\t\t}\n\t}\n}\n');
put(H, 'resource/set/multiplayer/units/late/units_ger.set', '(define "squad_with2types" (x))\n("squad_with2types" side(ger) name(single_mg) period(late) cd(0) g(single_mg) c1(mgun_1:1) c2(mgun_2:1) b(inf2) t())\n');
const gctx = () => new Ctx({ target: 'goh', goh: H, out: path.join(W, 'gout'), plan: false });
const gr = (fn, spec) => { const c = gctx(); O[fn](c, spec); return c; };
const errs = c => Object.entries(c.rep.counts).filter(([k]) => !/^WARN_/.test(k)).reduce((a, [, n]) => a + n, 0);
const msgs = c => c.rep.toJSON({ tool: 'gen' }).findings.map(f => f.code + ' ' + f.msg).join(' | ');
const txt = (c, k) => { const b = c.dirty.get(k); return b ? b.toString('latin1') : ''; };
{
  const c = gr('opGun', { name: 'my_100mm', like: '100mm_d10c', recharge: 6, speed: 900, range: 160, accuracy: 'direct' });
  const t = txt(c, ST + 'gun/my_100mm');
  ok('GoH cannon gun: no error', errs(c) === 0, msgs(c));
  ok('GoH cannon gun: GoH macros written', /\{from "100mm_d10c"/.test(t) && /\("reload time" seconds\(6\)\)/.test(t) && /\("velocity" mps\(900\)\)/.test(t) && /\("range_160"\)/.test(t) && /\("accuracy_direct" r1\(0\.55\) range_ap\(220\) range_he\(220\) range_heat\(220\)\)/.test(t) && !/%r1/.test(t) && !/rechargeTime|"speed"/.test(t), t);
  ok('GoH cannon gun: CRLF', !/[^\r]\n/.test(t));
  ok('GoH cannon gun: facts read the GoH like values', /reload 9 -> 6 s/.test(c.facts.join(' ')) && /shell speed 880 -> 900/.test(c.facts.join(' ')), c.facts.join(' '));
  const v = gr('opGun', { name: 'my_100a', like: '100mm_ammo', speed: 950 }), vt = txt(v, ST + 'gun/my_100a');
  ok('GoH cannon gun with a speed per ammo type: "velocity m/s", every type scaled by ap 890 -> 950 (a 1 stays 1)', errs(v) === 0 && /\("velocity m\/s" ap\(950\) apcr\(1\) he\(939\) heat\(1\)\)/.test(vt) && !/"velocity" mps/.test(vt) && /shell speed 890 -> 950/.test(v.facts.join(' ')) && v.test.some(x => /\[T\]/.test(x) && /my_100a/.test(x)), vt + ' ' + v.facts.join(' '));
  const ia = gr('opGun', { name: 'my_100i', like: '100mm_d10c', accuracy: 'indirect' });
  ok('GoH gun accuracy whose define needs params the like does not give: GEN_GUN_GOH_ARGS, nothing staged', ia.rep.counts.GEN_GUN_GOH_ARGS === 1 && /r2 rmax/.test(msgs(ia)) && ia.dirty.size === 0, msgs(ia));
  const na = gr('opGun', { name: 'my_100n', like: '100mm_ammo', accuracy: 'direct' });
  ok('GoH gun accuracy with a like that has no accuracy call: GEN_GUN_GOH_ARGS (no bare %r1 call written)', na.rep.counts.GEN_GUN_GOH_ARGS === 1 && na.dirty.size === 0, msgs(na));
  const ro = gr('opGun', { name: 'my_100r', like: '100mm_d10c', range: 160 }), rt = txt(ro, ST + 'gun/my_100r');
  ok('GoH gun range only: bare range_160, no accuracy call, [T] line about the kept curve', errs(ro) === 0 && /\("range_160"\)/.test(rt) && !/accuracy/.test(rt) && ro.test.some(x => /range_ap 220/.test(x) && /\[T\]/.test(x)), rt + ' ' + ro.test.join(' '));
  const sh = gr('opGun', { name: 'my_37', like: '37mm_pt', range: 200, accuracy: 'direct' }), st = txt(sh, ST + 'gun/my_37');
  ok('GoH gun range + accuracy: each range_ap/he/heat shifted by new n - like n (heat 110 -> 150, offsets kept)', errs(sh) === 0 && /\("range_200"\)/.test(st) && /\("accuracy_direct" r1\(0\.5\) range_ap\(200\) range_he\(200\) range_heat\(150\)\)/.test(st) && !sh.test.some(x => /set flat/.test(x)), st + ' ' + msgs(sh));
  const fl = gr('opGun', { name: 'my_37f', like: '37mm_noran', range: 200, accuracy: 'direct' }), ft = txt(fl, ST + 'gun/my_37f');
  ok('GoH gun range + accuracy, like with no range_<n>: flat new n and a [T] line naming the overwritten values', errs(fl) === 0 && /range_ap\(200\) range_he\(200\) range_heat\(200\)/.test(ft) && fl.test.some(x => /set flat to 200/.test(x) && /range_heat 110/.test(x) && /\[T\]/.test(x)), ft + ' ' + fl.test.join(' | '));
  const p = gr('opGun', { name: 'my_100mm', like: '100mm_d10c', pen:'200 180 160 140 120' });
  ok('GoH cannon gun pen, like with no penetration rows: GEN_GUN_GOH_NO_PEN, nothing staged', p.rep.counts.GEN_GUN_GOH_NO_PEN === 1 && !p.rep.counts.GEN_GUN_AS2_ONLY && p.dirty.size === 0, msgs(p));
  // shell rows (vanilla 100mm_d10c / 37mm_pak35 forms): pen_scale scales every row, pen sets the main row and the rest by its ratio,
  // a numeric range moves each row's range(r) by new n - like n and picks the .presets curve again; damage = "armor health" + customs
  const ps = gr('opGun', { name: 'my_pen', like: '100mm_pen', pen_scale: 1.2, damage: 300 }), pt = txt(ps, ST + 'gun/my_pen');
  ok('GoH gun pen_scale + damage: rows scaled, armor health set, customs by ratio', errs(ps) === 0 && /\("penetration_long" shell\(aphe\) range\(220\) a\(251\) b\(224\) c\(194\) d\(169\) e\(146\)\)/.test(pt) && /\("penetration_medium" shell\(heat\) range\(160\) a\(216\) b\(216\) c\(216\) d\(216\) e\(216\)\)/.test(pt) && /\("armor health" damage\(300\)\)/.test(pt) && /\("armor health custom" shell\(aphe\) damage\(300\) velocity\(890\) filler\(88\)\)/.test(pt) && !/[^\r]\n/.test(pt), pt + ' ' + msgs(ps));
  const pp = gr('opGun', { name: 'my_pen2', like: '100mm_pen', pen: '250 200 180 150 120', range: 200 }), pq = txt(pp, ST + 'gun/my_pen2');
  ok('GoH gun pen + range 200: main row set, heat by ratio, rows moved and curve picked again', errs(pp) === 0 && /\("range_200"\)/.test(pq) && /\("penetration_medium" shell\(aphe\) range\(200\) a\(250\) b\(200\) c\(180\) d\(150\) e\(120\)\)/.test(pq) && /\("penetration_short" shell\(heat\) range\(140\) a\(215\)/.test(pq), pq + ' ' + msgs(pp));
  const pn = gr('opGun', { name: 'my_pen3', like: '100mm_d10c', damage: 300 });
  ok('GoH gun damage, like with no armor health: GEN_GUN_GOH_NO_ARMOR, nothing staged', pn.rep.counts.GEN_GUN_GOH_NO_ARMOR === 1 && pn.dirty.size === 0, msgs(pn));
}
{
  const c = gr('opGunAny', { name: 'my_avt', like: 'avt40', class: 'rifle', rof: 600, reload: 4, magazine: 15 });
  const t = txt(c, ST + 'rifle/my_avt');
  ok('GoH rifle gun: no error', errs(c) === 0, msgs(c));
  ok('GoH rifle gun: "fire rate" and "reload time" from the included .inc', /\("fire rate" rpm\(600\)\)/.test(t) && /\("reload time" seconds\(4\)\)/.test(t) && /\{filling "ammo rifle_rus" 15\}/.test(t), t);
  ok('GoH rifle gun: rate of fire read from the like', /rate of fire 460 -> 600/.test(c.facts.join(' ')), c.facts.join(' '));
}
{
  const c = gr('opShell', { id: 'bullet_105x380.fin.he2', like: 'bullet_105x380.fin.he', mass: 16 });
  const k = ST + 'shell/bullet_105x380.fin.he2.ammo', t = txt(c, k);
  ok('GoH shell: no error, copy with mass', errs(c) === 0 && /\{mass 16\}/.test(t) && /\{entity "105mm_fin_he"\}/.test(t), msgs(c) + ' ' + [...c.dirty.keys()].join(' '));
  const pr = gr('opShell', { id: 'bullet_105x380.fin.he3', like: 'bullet_105x380.fin.he', preset: 'fg', args: 2 });
  ok('GoH shell: AS2 preset refused with the folder list', pr.rep.counts.GEN_SHELL_VALUE >= 1 && pr.dirty.size === 0, msgs(pr));
}
{
  const c = gr('opItem', { id: 'm32_long', like: 'm32', fuse: 7, throw: { range: 30 } });
  const t = txt(c, ST + 'grenade/anti-personnel grenade/m32_long.grenade');
  ok('GoH item: no error, fuse and throw range', errs(c) === 0 && /\{PrepareTime 7\}/.test(t) && /\{range 30\}/.test(t), msgs(c) + ' ' + [...c.dirty.keys()].join(' ') + ' ' + t);
}
{
  const c = gr('opSoundClass', { name: 'my_far', min: 50, max: 900 });
  ok('GoH soundclass: loudness row added', errs(c) === 0 && /\{loudness "my_far" 50 900\}/.test(txt(c, 'resource/sound/sound.set')) && /\{loudness "world" 100 1000 50\}/.test(txt(c, 'resource/sound/sound.set')), msgs(c));
}
{
  const c = gr('opWeapon', { entity: 't3485_44_fin', weapon: '100mm_d10c' });
  const t = txt(c, 'resource/entity/-vehicle/finland/tank_medium/t3485_44_fin/t3485_44_fin.def');
  ok('GoH weapon: gun swapped, ammo line kept', errs(c) === 0 && /\{weapon "100mm_d10c" filling "bulletrus_85 aphebc" 1\}/.test(t), msgs(c) + ' ' + t);
  ok('GoH weapon: ammo kept info', c.rep.toJSON({ tool: 'gen' }).info.some(i => i.code === 'GEN_WEAPON_GOH_AMMO_KEPT'));
}
// voice on GoH: the talk/<actor>/<language>/ trees and the three talk.set lists (human, tank, cannon); loudness refused
{
  const T = 'resource/sound/talk/';
  put(H, 'resource/set/talk.set', '{talks\n(define "phrase_voice"\n\t{phrase {language "%1"} {voice %2} {sound "talk/%0/%1/%3/v%2"}}\n)\n(define "phrases"\n\t("phrase_voice" args %0 rus 1 %1)\n\t("phrase_voice" args %0 rus 2 %1)\n;\t("phrase_voice" args %0 rus 3 %1)\n)\n(define "phrases_tank"\n\t("phrase_voice" args %0 rus 1 %1)\n)\n(define "phrases_cannon"\n\t("phrase_voice" args %0 ger 1 %1)\n)\n}\n');
  put(H, T + 'human/rus/attack/v1/a.wav', Buffer.from('W1')); put(H, T + 'human/rus/attack/v2/b.wav', Buffer.from('W2'));
  put(H, T + 'human/rus/attack/folder.set', '{sound\n("talk_low")\n}\n'); put(H, T + 'tank/rus/burning/v1/t.wav', Buffer.from('T1'));
  const c = gr('opVoice', { id: 'rus_x', like: 'rus', speakers: 3 }), s = txt(c, 'resource/set/talk.set');
  const human = /\(define "phrases"\r\n[\s\S]*?\t; gen: voice rus_x[^\r\n]*\r\n\t\("phrase_voice" args %0 rus_x 1 %1\)\r\n\t\("phrase_voice" args %0 rus_x 2 %1\)\r\n\t\("phrase_voice" args %0 rus_x 3 %1\)\r\n\)/;
  ok('GoH voice: no error, human and tank lists get 3 lines each, the cannon list (no rus) none, CRLF kept', errs(c) === 0 && human.test(s) && (s.match(/rus_x \d/g) || []).length === 6 && !/phrases_cannon"[^)]*\)[^)]*rus_x/.test(s.slice(s.indexOf('phrases_cannon') - 1)) && !/[^\r]\n/.test(s), msgs(c) + ' ' + s);
  ok('GoH voice: trees copied per speaker (v3 plays v1), folder.set kept, no cannon tree', String(c.dirty.get(T + 'human/rus_x/attack/v3/a.wav')) === 'W1' && String(c.dirty.get(T + 'human/rus_x/attack/v2/b.wav')) === 'W2' && c.dirty.has(T + 'human/rus_x/attack/folder.set') && String(c.dirty.get(T + 'tank/rus_x/burning/v2/t.wav')) === 'T1' && ![...c.dirty.keys()].some(k => k.startsWith(T + 'cannon/')), [...c.dirty.keys()].join(' '));
  ok('GoH voice: taken id refused', (gr('opVoice', { id: 'rus', like: 'rus' }).rep.counts.GEN_VOICE_EXISTS || 0) === 1);
  const lo = gr('opVoice', { id: 'rus_y', like: 'rus', loudness: 'world' });
  ok('GoH voice: loudness refused with its reason, nothing staged', (lo.rep.counts.GEN_VOICE_VALUE || 0) === 1 && /sound define/.test(msgs(lo)) && lo.dirty.size === 0, msgs(lo));
  const sf = gr('opVoice', { id: 'rus_z', like: 'rus', sounds: { 'tank/nofolder': 'x.wav' } });
  ok('GoH voice: an unknown tank folder refused', (sf.rep.counts.GEN_VOICE_FOLDER_UNKNOWN || 0) === 1 && /burning/.test(msgs(sf)), msgs(sf));
}
// refusals: code + the lib/games line with its row, nothing staged
for (const [name, fn, spec, code, row] of [
  ['sound', 'opSound', { id: 'weapon/x', like: 'weapon/y' }, 'GEN_SOUND_AS2_ONLY', 'resource/sound/defines.inc'],
  ['skin', 'opSkin', { id: 's1', like: 'ger_com' }, 'GEN_SKIN_AS2_ONLY', 'GHFMT-10'],
  ['stuffmodel', 'opStuffModel', { id: 'x', like: 'mg42', item: 'mg42' }, 'GEN_STUFFMODEL_AS2_ONLY', 'owner decision 2026-11-10'],
  ['mapinfo', 'opMapInfo', { map: 'multi/m1', set: { maxPlayers: 4 } }, 'GEN_MAPINFO_AS2_ONLY', 'vanilla GoH data'],
  ['army', 'opArmy', { tag: 'pol', like: 'ger' }, 'GEN_ARMY_AS2_ONLY', 'resource/set/multiplayer/armies/; GHGPL-09, GHNET-26'],
  ['card list', 'opCardList', { unit: 'tank_b', army: 'ger', list: 'cooperative', fields: { cost: 5 } }, 'GEN_CARD_LIST_AS2_ONLY', 'units/<period>/units_<army>.set and roster_<period>.set'],
  ['squad remove', 'opSquadX', { name: 'single_mg', army: 'ger', remove: true }, 'GEN_SQUAD_REMOVE_AS2_ONLY', 'units_<army>.set'],
  ['kitbash', 'opKitbash', { entity: 't3485_44_fin', turret_from: 't3485_44_fin' }, 'GEN_KITBASH_AS2_ONLY', 'owner decision 2026-11-10'],
]) {
  const c = gr(fn, spec), m = msgs(c);
  ok('GoH ' + name + ': ' + code + ' with the plain line', (c.rep.counts[code] || 0) >= 1 && m.includes('gen ' + name + ': not available for GoH: ') && m.includes(row) && c.dirty.size === 0, m);
}
{
  const c = gctx(); O.H.botsAdvice(c, 'squad', 'x', 'y', 'ger', { bots: true }, 'squad x');
  const m = msgs(c);
  ok('GoH bots: warning with the plain line (GHMIS-66)', (c.rep.counts.WARN_GEN_BOTS_AS2_ONLY || 0) === 1 && /gen bots: not available for GoH: .*\(GHMIS-66\)/.test(m) && c.dirty.size === 0, m);
}
// mission-clone on GoH: the GoH-to-GoH branch (--exe goh), the mod op's game_version along (C.runTool stubbed: nothing runs)
{
  const calls = [], real = C.runTool;
  C.runTool = (tool, args) => { calls.push({ tool, args }); return { status: 0, out: '0 findings\n', err: '' }; };
  try { const c = new Ctx({ target: 'goh', goh: H, out: path.join(W, 'gmc'), plan: false }); c.gameVersion = '1.067.0'; O.opMissionClone(c, { map: 'map/multi/m1', from: 'battle_zones', to: 'combined_arms' }); ok('GoH mission-clone: runs, no error', errs(c) === 0, msgs(c)); }
  finally { C.runTool = real; }
  const a = (calls.find(x => x.tool === 'mission-clone') || { args: [] }).args.join(' ');
  ok('GoH mission-clone: --game <GoH root> --exe goh --game-version, no --target', a.includes('--game ' + H) && / --exe goh( |$)/.test(a) && / --game-version 1\.067\.0( |$)/.test(a) && !/--target/.test(a), a);
}
// a child that refuses in one line (exit 2, no finding: GoH mission-clone MC_GOH_NO_MODE) or is killed (timeout: status null, ETIMEDOUT)
// is GEN_TOOL_FAILED and the op records nothing as done (C.runTool stubbed: nothing runs)
{
  const real = C.runTool;
  try {
    C.runTool = () => ({ status: 2, out: '', err: 'mission-clone: not available for GoH: no mode table for combat (GHMIS-01)\n' });
    const c = new Ctx({ target: 'goh', goh: H, out: path.join(W, 'gmc2'), plan: false });
    O.opMissionClone(c, { map: 'map/multi/m1', from: 'battle_zones', to: 'combat' });
    ok('one-line refusal (exit 2): GEN_TOOL_FAILED, no fact, no test line', c.rep.counts.GEN_TOOL_FAILED === 1 && !c.facts.some(x => /^mission-clone/.test(x)) && !c.test.some(x => /^mission-clone/.test(x)), msgs(c) + ' ' + c.facts.join(' | '));
    const m = new Ctx({ target: 'goh', goh: H, out: path.join(W, 'gmc3'), plan: false });
    O.opMapClone(m, { map: 'map/multi/m1', name: 'm2' });
    ok('map-clone one-line refusal: GEN_TOOL_FAILED, no fact, map not marked made', m.rep.counts.GEN_TOOL_FAILED === 1 && !m.facts.some(x => /^map-clone/.test(x)) && m.virtMaps.size === 0, msgs(m));
    C.runTool = () => ({ status: null, out: '', err: '', error: Object.assign(new Error('spawnSync node ETIMEDOUT'), { code: 'ETIMEDOUT' }) });
    const k = new Ctx({ target: 'goh', goh: H, out: path.join(W, 'gcl'), plan: false });
    O.opClone(k, { entity: 't3485_44_fin', as: 't3485_z' });
    ok('killed clone-entity (timeout): GEN_TOOL_FAILED "timed out", clone not ok, entity not marked made', k.rep.counts.GEN_TOOL_FAILED === 1 && /clone-entity timed out/.test(msgs(k)) && k.cloneOps[0].ok === false && !k.virt.has('entity:t3485_z'), msgs(k));
    C.runTool = () => ({ status: 0, out: '0 findings\n', err: '' });
    const g = new Ctx({ target: 'goh', goh: H, out: path.join(W, 'gcl2'), plan: false });
    O.opClone(g, { entity: 't3485_44_fin', as: 't3485_y' });
    ok('clone-entity exit 0: no GEN_TOOL_FAILED, clone ok', !g.rep.counts.GEN_TOOL_FAILED && g.cloneOps[0].ok === true && g.virt.has('entity:t3485_y'), msgs(g));
  } finally { C.runTool = real; }
}
// option exe names the vfs exe outright (the Task page passes its draft's exe); child tools get --exe only for mowas_2
{
  const e = new Ctx({ target: 'mowas2', game: SH, exe: 'mowas2', out: path.join(W, 'ex1'), plan: true });
  ok('option exe mowas2: vfs exe mowas_2, exeArgs --exe mowas_2', e.vfs().exe === 'mowas_2' && !e.vfs().files.has(CORE) && e.exeArgs().join(' ') === '--exe mowas_2', e.vfs().exe);
  const a = new Ctx({ target: 'as64', game: SH, exe: 'as64', out: path.join(W, 'ex2'), plan: true });
  ok('option exe as64: as64 view, exeArgs empty (argument list as before)', a.vfs().exe === 'as64' && a.vfs().files.has(CORE) && a.exeArgs().length === 0, a.vfs().exe);
  const g = new Ctx({ target: 'goh', goh: H, exe: 'goh', out: path.join(W, 'ex3'), plan: true });
  ok('option exe goh: the GoH view, exeArgs empty', g.vfs().exe === 'goh' && g.vfs().files.has(ST + 'gun/.presets') && g.exeArgs().length === 0, g.vfs().exe);
  const u = new Ctx({ target: 'mowas2', game: SH, exe: 'nonsense', out: path.join(W, 'ex4'), plan: true });
  ok('option exe unknown: ignored, the target picks (mowas_2)', u.vfs().exe === 'mowas_2', u.vfs().exe);
}
// statsheet (stat jobs), build and refcheck (gate), describe unit list: --exe forwarding (spawn stubbed: nothing runs)
{
  const G = require('../gen'), calls = [];
  G.spawnHook = (script, args) => { calls.push({ script, args }); return { status: 0, out: '0 findings (0 errors, 0 warnings)\n0 findings\n', err: '', ms: 1 }; };
  (async () => {
    try {
      for (const target of ['mowas2', 'as64']) {
        const c = new Ctx({ target, game: SH, out: path.join(W, 'sj-' + target), plan: false }); fs.mkdirSync(c.out, { recursive: true });
        await G.statJobs(c, null); await G.gate(c);
      }
    } finally { G.spawnHook = null; }
    const of = (script, target) => calls.filter(x => x.script === script && x.args.some(a => String(a).includes('sj-' + target)));
    for (const s of ['statsheet/statsheet.js', 'build/build.js', 'refcheck/refcheck.js']) {
      const m = of(s, 'mowas2'), a = of(s, 'as64');
      ok(s + ': mowas2 gets --exe mowas_2 on every call', m.length > 0 && m.every(x => / --exe mowas_2( |$)/.test(x.args.join(' '))), JSON.stringify(m.map(x => x.args.join(' '))));
      ok(s + ': as64 arguments carry no --exe', a.length > 0 && a.every(x => !x.args.includes('--exe')), JSON.stringify(a.map(x => x.args.join(' '))));
    }
    const bases = calls.filter(x => x.script === 'statsheet/statsheet.js' && !x.args.includes('--folder'));
    const bm = bases.find(x => x.args.includes('--exe')), ba = bases.find(x => !x.args.includes('--exe'));
    const csv = x => x && x.args[x.args.indexOf('-o') + 1];
    ok('statsheet base sheet: mowas2 and as64 cache files differ (when both are built)', !bm || !ba || csv(bm) !== csv(ba), csv(bm) + ' ' + csv(ba));
    const dm = G.describeCat(SH, 'mowas2', W, '1'), da = G.describeCat(SH, 'as64', W, '1');
    ok('describe unit list: mowas2 statsheet --units-json gets --exe mowas_2, own cache key', dm.args.slice(0, 4).join(' ') === SH + ' --exe mowas_2 --units-json' && dm.key !== da.key && dm.file !== da.file, dm.args.join(' '));
    ok('describe unit list: as64 arguments as before (no --exe)', da.args[0] === SH && da.args[1] === '--units-json' && !da.args.includes('--exe'), da.args.join(' '));
    describeGoh(); finish();
  })().catch(e => { ok('statJobs/gate/describe stub run', false, e.stack); finish(); });
}
// gen --describe --target goh: exit 2, the one line
function describeGoh() {
{
  const r = require('../../lib/test/wait').spawnSync(process.execPath, [path.join(__dirname, '..', 'gen.js'), '--describe', 'fast tank', '--target', 'goh'], { encoding: 'utf8' }, 'gen parity');
  ok('describe on GoH: exit 2 with the plain line', r.status === 2 && /^gen --describe: not available for GoH: .*\(vanilla GoH resource\/set\/stuff\/gun\/\.presets and .*units_<army>\.set; open item\)\s*$/.test(r.stderr), r.status + ' ' + r.stderr);
}
}
function finish() { console.log(bad ? 'parity: ' + bad + ' failed' : 'parity: all ok'); process.exit(bad ? 1 : 0); }
