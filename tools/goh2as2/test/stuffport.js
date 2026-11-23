// COV-L8K: stuffport (GoH macro map, shell-type map, item-tag map, tidy) and avicheck (AVI header). Invented fixtures; each check has a seeded-defect twin. run via run.sh.
// Author: Imperator_Aug (ARSENAL, ia-f6a0ba58)
const S = require('../stuffport.js'), A = require('../avicheck.js');
const fs = require('fs');
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'stuffport: ' + name + (good || extra === undefined ? '' : '  ' + String(extra).slice(0, 400))); if (!good) fail++; };

// ---- defines + includes
const inc = { 'set/x.inc': '(define "fromInc" {incKey %0})' };
const goh = S.parseDefines('(define "vel" {speed (* %v 0.75)})\n(define "same" {k 1})\n(define "diff" {k 2})\n(define "pair" args {a %0} {b %1})\n(include "\\set\\x.inc")\n(define "vel" {speed 1})', k => inc[k]);
const as2 = S.parseDefines('(define "same" {k 1})\n(define "diff" {k 9})');
t('first define wins', /0\.75/.test(goh.get('vel')));
t('include read through the reader', goh.has('fromInc'));
t('seeded defect: include without a reader adds nothing', !S.parseDefines('(include "\\set\\x.inc")').has('fromInc'));

// ---- expand: EXPAND / KEEP / CONFLICT / MISSING
const run = src => S.port(src, goh, as2, {});
let r = run('{x ("vel" v(1000))}');
t('GoH-only macro expanded, named arg, arith folded', /\{speed 750\}/.test(r.text) && r.log.some(l => l.how === 'EXPAND'), r.text);
r = run('{x ("same")}');
t('same body both sides kept as a call', r.text.includes('("same")') && r.log.some(l => l.how === 'KEEP'), r.text);
r = run('{x ("diff")}');
t('differing body expands with GoH text (CONFLICT)', /\{k 2\}/.test(r.text) && r.log.some(l => l.how === 'CONFLICT'), r.text);
r = run('{x ("pair" args 3 4)} ("nowhere")');
t('ordinal args', /\{a 3\}\s*\{b 4\}/.test(r.text), r.text);
t('unknown macro left, MISSING', r.text.includes('("nowhere")') && r.log.some(l => l.how === 'MISSING'));
r = run('("fromInc" args 7)');
t('macro from an include expands', /\{incKey 7\}/.test(r.text), r.text);
r = run('("vel")');
t('seeded defect: missing arg is warned', r.log.some(l => l.code === 'WARN_SP_UNRESOLVED_ARG'), JSON.stringify(r.log));

// ---- shell-type map
r = S.port('{parameters "apcbche"} {parameters "hvap"} {parameters "he"} {parameters "heat"}', new Map(), new Map(), {});
t('apcbche->ap hvap->apcr he->fg', /"ap"\}.*"apcr"\}.*"fg"\}/.test(r.text), r.text);
t('heat has no AS2 shell: warned, kept', r.text.includes('"heat"') && r.log.some(l => l.code === 'WARN_SP_TYPE_UNMAPPED'));
r = S.port('{from "pattern apcbche"}', new Map(), new Map(), { isAmmo: true });
t('ammo pattern mapped', r.text === '{from "pattern ap"}', r.text);
r = S.port('{parameters "apcbche"}', new Map(), new Map(), { typeMap: false });
t('seeded defect: --no-type-map leaves it', r.text.includes('apcbche'));

// ---- item-tag map (cov-l8j: rifle_slap_melee -> rifle)
r = S.port('{enable_items "rifle_slap_melee" "smg"}', new Map(), new Map(), {});
t('rifle_slap_melee -> rifle', r.text === '{enable_items "rifle" "smg"}', r.text);
r = S.port('{disable_items "rifle_stab_melee" "smg"}', new Map(), new Map(), {});
t('rifle_stab_melee dropped with a warning', !r.text.includes('stab') && r.log.some(l => l.code === 'WARN_SP_TAG_DROPPED'), r.text);
r = S.port('{tag "rifle_slap_melee"}', new Map(), new Map(), {});
t('seeded defect: a tag outside enable/disable_items is untouched', r.text.includes('rifle_slap_melee'));
t('table has the cov-l8j row', S.ITEM_TAGS.rifle_slap_melee === 'rifle');

// ---- map file
r = S.port('{filling "bulletger_88_l71"} {view "v" {x 1}} {a 1}', new Map(), new Map(), { map: '# c\n"bulletger_88_l71" => "bullet88"\n-view\n' });
t('map rename + block drop', r.text.includes('"bullet88"') && !r.text.includes('view'), r.text);

// ---- tidy
let log = [];
let x = S.tidy('{gun\r\n\t{parameters "ap"}\r\n\t{parameters "fg" {k 1}}\r\n\t{parameters "fg"  {k 1}}\r\n\t{parameters "fg" {k 2}}\r\n}\r\n', log);
t('empty block and same-text repeat removed', (x.match(/parameters/g) || []).length === 2 && /\{k 2\}/.test(x), x);
log = []; x = S.tidy('{parameters "fg" {k 1}} {parameters "ap" {k 1}}', log);
t('seeded defect: same body under another tag kept', (x.match(/parameters/g) || []).length === 2, x);

// ---- breed kit (COV-L8L)
const AS2_STUFF = new Set(['ptrd', 'ammo ptr', 'nagan', 'ammo pistol', 'smoke grenade', 'rpg40 grenade', 'bandage', 'mosin', 'ammo rifle']);
const hasSet = s => [...AS2_STUFF].some(x => x.split(' ').sort().join(' ') === s.split(' ').sort().join(' '));
const gohB = '{breed\n\t{skin "goh_skin"}\n\t{perks (include "ability.inc") ("at_rank_3")}\n\t{inventory\n\t\t{item "ptrd" filled}\n\t\t{item "atrifle_rus ammo" 35 5}\n\t\t{item "shovel_rus"}\n\t\t{item "nagant_revolver" filled}\n\t\t{item "rpg40 grenade" 1.15 0.5}\n\t\t{item "bandage_rus" 3.5 0.5}\n\t\t{in_hands 3}\n\t}\n}\n';
const as2B = '{breed\n\t{skin "rus_t2"}\n\t{veterancy (include "veterancy_generic.inc") ("veterancy_1")}\n\t{inventory\n\t\t{item "mosin" filled}\n\t\t{item "ammo rifle" 100}\n\t\t{in_hands 0}\n\t}\n}\n';
r = S.portKit(gohB, as2B, hasSet);
t('kit: AS2 look/veterancy kept, GoH skin/perks not taken', r.text.includes('rus_t2') && r.text.includes('veterancy_generic') && !r.text.includes('goh_skin') && !r.text.includes('ability.inc'), r.text);
t('kit: tag set kept (rpg40 grenade), ITEM_NAMES map, nation cut', /item "ptrd" filled/.test(r.text) && /item "ammo ptr" 35 5/.test(r.text) && /item "nagan" filled/.test(r.text) && /item "rpg40 grenade" 1\.15 0\.5/.test(r.text) && /item "bandage" 3\.5 0\.5/.test(r.text), r.text);
t('kit: vanilla mosin gone', !r.text.includes('mosin'), r.text);
t('seeded defect: unknown item dropped with a warning', !r.text.includes('shovel') && r.log.some(l => l.code === 'WARN_SP_ITEM_DROPPED' && /shovel_rus/.test(l.msg)), JSON.stringify(r.log));
t('kit: in_hands re-indexed after a drop (3 -> 2)', /\{in_hands 2\}/.test(r.text), r.text);
r = S.portKit(gohB.replace('{item "nagant_revolver" filled}', '{item "luger_x" filled}'), as2B, hasSet);
t('seeded defect: in_hands item dropped -> 0 + warn', /\{in_hands 0\}/.test(r.text) && r.log.some(l => l.code === 'WARN_SP_KIT_HANDS'), r.text);
r = S.portKit('{breed {skin "x"}}', as2B, hasSet);
t('seeded defect: GoH breed with no inventory leaves AS2 as is', r.text === as2B && r.log.some(l => l.code === 'WARN_SP_KIT_NONE'));

// ---- gun filling (COV-L8M)
let fl = [];
let ft = S.mapFilling('{from "pattern rifle"\n\t{filling "ammo rifle_rus clip" 5}\n}', hasSet, fl);
t('filling: nation suffix + container word cut (ammo rifle_rus clip -> ammo rifle)', /filling "ammo rifle" 5/.test(ft) && fl.some(l => l.code === 'SP_FILL_MAP'), ft + JSON.stringify(fl));
fl = []; ft = S.mapFilling('{filling "ammo rifle" 5}', hasSet, fl);
t('filling: AS2 tag kept as is', ft === '{filling "ammo rifle" 5}' && fl.some(l => l.code === 'SP_FILL_KEEP'), JSON.stringify(fl));
fl = []; ft = S.mapFilling('{filling "ammo laser_x" 5}', hasSet, fl);
t('seeded defect: unknown filling kept + WARN_SP_FILL_UNKNOWN', /laser_x/.test(ft) && fl.some(l => l.code === 'WARN_SP_FILL_UNKNOWN'), JSON.stringify(fl));

// ---- weapon skill (COV-L8M)
const as2Ab = new Map([['set/ability/rifle.set', '{"rifle" from weapon\n\t{item "rifle"}\n\t(include "ability_generic.inc")\n}\n'], ['set/ability/health.set', '{health {level "100%" 1}}']]);
const brd = ['{breed {perks {"rifle" lvl_2} {"smg" lvl_1}}}', '{breed {perks {"rifle" lvl_5}}}'];
const lv = n => `\t{level "lvl_${n}"\n\t\t{stand\n\t\t\t{accuracy 0.${n}}\t;// c\n\t\t\t{recoil 1.00}\n\t\t\t{zoom_recoil 1.25}\n\t\t\t{sway 0.90}\n\t\t}\n\t}\n`;
let sk = S.portSkill('{"rifle" from weapon\n\t{item "rifle"}\n' + [1, 2, 3, 4, 5].map(lv).join('') + '}\n', as2Ab, brd);
t('skill: onto the AS2 file of the same name, posture keys dropped', sk.outs.length === 1 && sk.outs[0].key === 'set/ability/rifle.set' && /accuracy 0\.2/.test(sk.outs[0].text) && !/recoil|sway/.test(sk.outs[0].text) && sk.log.some(l => l.code === 'SP_SKILL_KEY_DROP' && /15 /.test(l.msg)), JSON.stringify(sk));
t('skill: no level warning when GoH has every level breeds ask for', !sk.log.some(l => l.code === 'WARN_SP_SKILL_LEVEL'), JSON.stringify(sk.log));
sk = S.portSkill('{"rifle" from weapon\n\t{item "rifle"}\n' + [1, 2, 3].map(lv).join('') + '}\n', as2Ab, brd);
t('seeded defect: breed level lvl_5 missing in GoH -> WARN_SP_SKILL_LEVEL', sk.log.some(l => l.code === 'WARN_SP_SKILL_LEVEL' && /lvl_5/.test(l.msg) && !/lvl_2/.test(l.msg)), JSON.stringify(sk.log));
sk = S.portSkill('{resources\n\t(include "level_generic.inc")\n\t("level_standard")\n}\n', as2Ab, brd);
t('seeded defect: unknown kind (HUM-14) not written', sk.outs.length === 0 && sk.log.some(l => l.code === 'WARN_SP_SKILL_KIND'), JSON.stringify(sk));
sk = S.portSkill('{"tank_gun" from weapon {item "tank_gun"} {level "lvl_1" {default {accuracy 1}}}}', as2Ab, brd);
t('skill: a new name goes to set/ability/<name>.set', sk.outs[0] && sk.outs[0].key === 'set/ability/tank_gun.set', JSON.stringify(sk));

// ---- GoH-only animation states (COV-L8M)
let sl = [], st = S.dropStates('{from "pattern rifle"\r\n\t{states\r\n\t\t{fire\t"fire"}\r\n\t\t{can_aim\t"can-aim-bolt"}\r\n\t}\r\n\t{mass 4}\r\n}\r\n', sl);
t('seeded defect: can-aim-bolt states block dropped + SP_STATES_DROP', !/states|can-aim-bolt/.test(st) && /\{mass 4\}/.test(st) && sl.some(l => l.code === 'SP_STATES_DROP' && /can-aim-bolt/.test(l.msg)), JSON.stringify([st, sl]));
sl = []; st = S.dropStates('{x {states {aim "aim-bazooka"} {can_aim "can-aim-bazooka"}}}', sl);
t('states: AS2 state names kept', /can-aim-bazooka/.test(st) && !sl.length, st);

// ---- damage scale (DMGSCALE)
const TAB = { classes: { gun: { keys: { speed: { scale: 0.5, apply: true }, penetration: { scale: 0.8, apply: true }, range: { scale: 0.6, apply: true }, rechargeTime: { scale: 0.8, spread: 0.6, apply: false } } }, rifle: { keys: { healthDamage: { scale: 2.5, apply: true } } } } };
const GUN = ['{from "pattern gun"', '\t{rechargeTime 12.5}', '\t{speed 600}\t; c {speed 9}', '\t{range 220 200}', '\t{parameters "ap" {speed 800}}', '\t{parameters "ap"', '\t\t{projectileDamageTable {10 200} {100 150} {235 0}}', '\t}', '\t{recoil {speed 3}}', '\t{fireSound "a/speed 5"}', '}', ''].join('\r\n');
let sc = [], so = S.scaleDamage(GUN, TAB, 'gun', sc);
t('scale: top speed, parameters speed, range both numbers', so.includes('{speed 300}') && so.includes('"ap" {speed 400}') && so.includes('{range 132 120}'), so);
t('scale: damage table y by penetration, x by range', so.includes('{projectileDamageTable {6 160} {60 120} {141 0}}'), so);
t('seeded defect: nested {recoil {speed}}, strings and comments untouched', so.includes('{recoil {speed 3}}') && so.includes('"a/speed 5"') && so.includes('; c {speed 9}'), so);
t('seeded defect: apply false key left + SP_SCALE_OFF', so.includes('{rechargeTime 12.5}') && sc.some(l => l.code === 'SP_SCALE_OFF' && /rechargeTime/.test(l.msg)) && sc.some(l => l.code === 'SP_SCALE'), JSON.stringify(sc));
sc = []; so = S.scaleDamage(GUN, TAB, 'shell', sc);
t('seeded defect: class not in table -> unchanged + WARN_SP_SCALE_SKIP', so === GUN && sc.some(l => l.code === 'WARN_SP_SCALE_SKIP'));
sc = []; so = S.scaleDamage('{from "pattern rifle" {healthDamage 70}}', TAB, 'rifle', sc);
t('scale: rifle healthDamage 70 -> 175', so.includes('{healthDamage 175}'), so);
t('class: gun / autocannon by recoveryTime / rifle subdir / shell none', S.scaleClass('set/stuff/gun/88mm', '{speed 1}') === 'gun' && S.scaleClass('set/stuff/gun/20mm', '{recoveryTime 0.2}') === 'autocannon' && S.scaleClass('set/stuff/rifle/ptr/ptrd', '') === 'rifle' && S.scaleClass('set/stuff/shell/x.ap.ammo', '') === null);
const AUTO = S.loadScale('auto');
t('auto table: gun speed ~0.667, rifle healthDamage > 2, both applied', Math.abs(AUTO.classes.gun.keys.speed.scale - 0.667) < 0.01 && AUTO.classes.rifle.keys.healthDamage.scale > 2 && AUTO.classes.gun.keys.speed.apply && AUTO.classes.rifle.keys.healthDamage.apply, JSON.stringify(AUTO.classes.gun.keys.speed));
t('seeded defect: none / no flag -> no table (output unchanged)', S.loadScale('none') === null && S.loadScale(undefined) === null);
let bad = false; try { const p = require('path').join(require('os').tmpdir(), 'dmgscale-bad.json'); fs.writeFileSync(p, '{"x":1}'); S.loadScale(p); } catch (e) { bad = /classes/.test(e.message); }
t('seeded defect: a json without classes is refused', bad);

// ---- DMGFIX: per-gun scale from the vanilla twin (dmgtwin.js)
const W = require('../dmgtwin.js');
const TABT = { twin: { keys: ['penetration', 'healthDamage'], min: 0.2, max: 5 }, classes: TAB.classes };
const VAN = { 'set/stuff/gun/88mm': '{from "pattern gun" {rechargeTime 8} {projectileDamageTable {10 196} {50 150} {200 0}}}',
  'set/stuff/gun/gun.pattern': '{from "pattern base" {speed 500}}', 'set/stuff/gun/base.pattern': '{weapon_bullet {range 140 150}}',
  'set/stuff/gun/76mm_f34': '{from "pattern gun"}', 'set/stuff/rifle/rifle.pattern': '{weapon_bullet {healthDamage 200} {rechargeTime 3}}', 'set/stuff/rifle/mosin': '{from "pattern rifle" {speed 425}}' };
const rd = k => VAN[k] == null ? null : VAN[k], ls = d => Object.keys(VAN).filter(k => k.startsWith(d + '/') && !k.slice(d.length + 1).includes('/'));
let wl = [], tw = W.twinScale({ table: TABT, cls: 'gun', portedText: GUN, asKey: 'set/stuff/gun/88mm', gohKey: 'set/stuff/gun/88mm', readAs: rd, list: ls, log: wl });
t('twin: gun pen ratio = vanilla ap table y / GoH ap table y (196/200 = 0.98)', tw.over.penetration === 0.98 && wl.some(l => l.code === 'SP_SCALE_TWIN'), JSON.stringify(tw) + JSON.stringify(wl));
so = S.scaleDamage(GUN, TABT, 'gun', wl, tw.over);
t('twin: scaleDamage uses the twin pen (200 -> 196), range still by class', so.includes('{projectileDamageTable {6 196} {60 147} {141 0}}') && wl.some(l => /penetration \*0\.98 twin/.test(l.msg)), so);
t('twin: pattern chain resolves inherited keys', W.values(W.chain(rd, 'set/stuff/gun/88mm'), 'gun').range === 140 && W.values(W.chain(rd, 'set/stuff/gun/88mm'), 'gun').speed === 500);
wl = []; tw = W.twinScale({ table: TABT, cls: 'rifle', portedText: '{from "pattern rifle" {healthDamage 70}}', asKey: 'set/stuff/rifle/mosin', gohKey: 'set/stuff/rifle/mosin', readAs: rd, list: ls, log: wl });
t('twin: rifle healthDamage from the vanilla pattern (200/70 -> 2.857)', Math.abs(tw.over.healthDamage - 2.857143) < 1e-6 && S.scaleDamage('{from "pattern rifle" {healthDamage 70}}', TABT, 'rifle', [], tw.over).includes('{healthDamage 200}'), JSON.stringify(tw));
wl = []; tw = W.twinScale({ table: TABT, cls: 'gun', portedText: GUN, asKey: 'set/stuff/gun/105mm_x', gohKey: 'set/stuff/gun/105mm_x', readAs: rd, list: ls, log: wl });
t('seeded defect: no twin -> no override + SP_SCALE_TWIN_NONE (class scale used)', !Object.keys(tw.over).length && wl.some(l => l.code === 'SP_SCALE_TWIN_NONE') && S.scaleDamage(GUN, TABT, 'gun', [], tw.over).includes('{6 160}'), JSON.stringify(wl));
wl = []; tw = W.twinScale({ table: TABT, cls: 'gun', portedText: GUN.replace('{10 200}', '{10 2}'), asKey: 'set/stuff/gun/88mm', gohKey: 'set/stuff/gun/88mm', readAs: rd, list: ls, log: wl });
t('seeded defect: twin ratio 98 outside 0.2..5 -> class kept + WARN_SP_SCALE_TWIN_RANGE', tw.over.penetration === undefined && wl.some(l => l.code === 'WARN_SP_SCALE_TWIN_RANGE'), JSON.stringify(wl));
t('twin: calibre match (GoH 76mm_f34_late -> unique AS2 76mm_f34); ambiguous/none -> null', (W.findTwin('set/stuff/gun/76mm_f34_late', 'set/stuff/gun/76mm_f34_late', k => !!rd(k), ls, 76.2) || {}).key === 'set/stuff/gun/76mm_f34' && W.findTwin('set/stuff/gun/57mm_zis', 'set/stuff/gun/57mm_zis', k => !!rd(k), ls, 57) === null);
t('seeded defect: table without twin -> no override', !Object.keys(W.twinScale({ table: TAB, cls: 'gun', portedText: GUN, asKey: 'set/stuff/gun/88mm', gohKey: 'set/stuff/gun/88mm', readAs: rd, list: ls, log: [] }).over).length);
t('auto table: twin keys pen + healthDamage + rechargeTime (GOHFIX), rifle rechargeTime applied (x0.5)', JSON.stringify(AUTO.twin.keys) === '["penetration","healthDamage","rechargeTime"]' && AUTO.classes.rifle.keys.rechargeTime.apply === true && AUTO.classes.rifle.keys.rechargeTime.scale === 0.5);

// GOHFIX: rechargeTime as a twin key (kwk43 refire 10 s class-scaled vs vanilla 8 s, dmgfix.md)
const TABR = { twin: { keys: ['penetration', 'healthDamage', 'rechargeTime'], min: 0.2, max: 5 }, classes: TAB.classes };
wl = []; tw = W.twinScale({ table: TABR, cls: 'gun', portedText: GUN, asKey: 'set/stuff/gun/88mm', gohKey: 'set/stuff/gun/88mm', readAs: rd, list: ls, log: wl });
so = S.scaleDamage(GUN, TABR, 'gun', [], tw.over);
t('twin: rechargeTime 8/12.5 = 0.64 wins over apply false (12.5 -> 8)', tw.over.rechargeTime === 0.64 && so.includes('{rechargeTime 8}'), JSON.stringify(tw) + so);
wl = []; tw = W.twinScale({ table: TABR, cls: 'gun', portedText: GUN.replace(/{rechargeTime 12.5}/, ''), asKey: 'set/stuff/gun/88mm', gohKey: 'set/stuff/gun/88mm', readAs: rd, list: ls, log: wl });
t('seeded defect: ported gun without rechargeTime -> no rechargeTime override (nothing to scale)', tw.over.rechargeTime === undefined && tw.over.penetration === 0.98, JSON.stringify(tw));

// ---- avicheck
const avi = (w, h, cc) => {
  const avih = Buffer.alloc(56); avih.writeUInt32LE(40000, 0); avih.writeUInt32LE(100, 16); avih.writeUInt32LE(w, 32); avih.writeUInt32LE(h, 36);
  const strh = Buffer.alloc(56); strh.write('vids', 0, 'latin1'); strh.write(cc, 4, 'latin1');
  const strf = Buffer.alloc(40); strf.writeUInt32LE(40, 0); strf.writeInt32LE(w, 4); strf.writeInt32LE(h, 8); strf.write(cc, 16, 'latin1');
  const ck = (id, b) => Buffer.concat([Buffer.from(id, 'latin1'), Buffer.from(Uint32Array.of(b.length).buffer), b]);
  const list = (ty, b) => ck('LIST', Buffer.concat([Buffer.from(ty, 'latin1'), b]));
  const body = Buffer.concat([Buffer.from('AVI ', 'latin1'), list('hdrl', Buffer.concat([ck('avih', avih), list('strl', Buffer.concat([ck('strh', strh), ck('strf', strf)]))])), list('movi', Buffer.alloc(8))]);
  return ck('RIFF', body);
};
const codes = b => A.aviWarn(b).warn.map(w => w.code).sort().join();
let i = A.aviInfo(avi(1280, 720, 'XVID'));
t('720p XVID read and clean', i.w === 1280 && i.h === 720 && i.fourcc === 'XVID' && codes(avi(1280, 720, 'XVID')) === '', JSON.stringify(i));
t('lower-case xvid fourcc is fine', codes(avi(960, 540, 'xvid')) === '');
t('seeded defect: 1080p warned', codes(avi(1920, 1080, 'XVID')) === 'WARN_PORT_AVI_SIZE');
t('seeded defect: FMP4 warned', codes(avi(1280, 720, 'FMP4')) === 'WARN_PORT_AVI_CODEC');
t('seeded defect: not an AVI', codes(Buffer.from('RIFF\0\0\0\0WAVEfmt ', 'latin1')) === 'WARN_PORT_AVI_HEADER');

// ---- ENCFIX: GoH text is read latin1 and written back as the same bytes (UTF-8 strings stay UTF-8
const u8 = Buffer.from('{x {caption "«ёлка» №5"}} ; коммент', 'utf8').toString('latin1');
const pt = run(u8).text;
t('UTF-8 string and comment bytes survive port()', Buffer.from(pt, 'latin1').includes(Buffer.from('"«ёлка» №5"', 'utf8')) && Buffer.from(pt, 'latin1').includes(Buffer.from('коммент', 'utf8')), pt);
t('stuffport source writes no encodeCp1251', !/encodeCp1251/.test(fs.readFileSync(require('path').join(__dirname, '../stuffport.js'), 'utf8')));
t('seeded defect: the old encodeCp1251 step turns every byte >= 0x80 into ?', !require('../../lib/enc').encodeCp1251(u8).includes(0xD0));

if (fail) { console.log('FAIL stuffport ' + fail); process.exit(1); }
