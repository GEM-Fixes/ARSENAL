// GEN-FIX2: seeded-defect tests of the ten gen fixes on an own fixture (no game): roster of a new army from another army's card (#1),
// weapon outside gun/ + kit refusal (#2), set add/append + macro key refusal (#3), clone in --plan keeps its files for later rows (#4),
// shell/item tag remove + damage_edit + KEY-17 refusal (#5), mission-clone no_bots (#6), voice 48 kHz resample (#7), burst seconds
// from the like (#8), the wreck step on the task path (gen finishText, #9). #10 (army price on stock armies) is armyprice.js.
// node fix2.js <work dir>   prints "OK name" / "FAIL name: why", exit 1 on a FAIL.
// Author: Imperator_Aug (ARSENAL, ia-26a6db0e)
const fs = require('fs'), path = require('path');
const W = path.resolve(process.argv[2] || path.join(__dirname, 'work'), 'fix2'); fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });
const { Ctx } = require('../lib/ctx'), O = require('../lib/ops'), genMain = require('../gen'), wav = require('../../lib/wav');
let bad = 0;
const ok = (name, c, why) => { console.log(c ? 'OK ' + name : 'FAIL ' + name + ': ' + (why || '')); if (!c) bad++; };
const put = (root, key, data) => { const f = path.join(root, key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.isBuffer(data) ? data : Buffer.from(data.replace(/\r?\n/g, '\r\n'), 'latin1')); };
function mkwav(rate, frames) {
  const data = Buffer.alloc(frames * 2); for (let i = 0; i < frames; i++) data.writeInt16LE(Math.round(Math.sin(i / 9) * 16000), i * 2);
  const f = Buffer.alloc(16); f.writeUInt16LE(1, 0); f.writeUInt16LE(1, 2); f.writeUInt32LE(rate, 4); f.writeUInt32LE(rate * 2, 8); f.writeUInt16LE(2, 12); f.writeUInt16LE(16, 14);
  const ck = (id, b) => { const h = Buffer.alloc(8); h.write(id, 0, 'latin1'); h.writeUInt32LE(b.length, 4); return Buffer.concat([h, b]); };
  const body = Buffer.concat([Buffer.from('WAVE', 'latin1'), ck('fmt ', f), ck('data', data)]), h = Buffer.alloc(8); h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(body.length, 4);
  return Buffer.concat([h, body]);
}

// ---- fixture game
const G = path.join(W, 'as2'), ST = path.join(W, 'stage'), g = (k, d) => put(G, k, d), STUFF = 'resource/set/stuff/';
const TANK = '{game_entity\n\t("speed" s(800))\n\t{mass 30000}\n\t{hp 1}\n\t{Weaponry\n\t\t{place "mgun1"\n\t\t\t{weapon "dt"}\n\t\t}\n\t}\n}\n';
for (const n of ['tank_d', 'tank_d_x', 'tank_d_xx']) g(`resource/entity/-vehicle/${n}/${n}.def`, TANK);
g('resource/entity/humanskin/rus_x/rus_x.def', '{game_entity\n\t{skin "rus_x"}\n}\n');
g('resource/set/breed/mp/rus/rifle.set', '{breed\n\t{inventory\n\t\t{item "mosin"}\n\t}\n}\n');
g('resource/set/multiplayer/main.set', '(include "units/vehicles.set")\n');
g('resource/set/multiplayer/units/vehicles.set', '(define "v" {x 1})\n(include "vehicles_rus.set")\n');
g('resource/set/multiplayer/units/vehicles_rus.set', '; rus\n{"tank_d"\t("v" c(0) s(rus) b(v4)) {level 4} {cost 120}}\n');
g('resource/set/multiplayer/armies/rus.set', '{army\n\t{id 0}\n\t{title "mp/army/rus"}\n}\n');
g('resource/set/multiplayer/games/preset_alliances.inc', '{"allies"\n\t{armies "rus"}\n}\n');
g('resource/script/multiplayer/bot.data.lua', 'Purchases = {\n\t{\n\t\tUnits = {\n\t\t\t["rus"] = {\n\t\t\t\t{priority = 1.0, class = UnitClass.Vehicle, unit = "tank_d"},\n\t\t\t},\n\t\t}\n\t},\n}\n');
g(STUFF + 'mgun/.presets', '(define "burst_medium"\n\t{burst\n\t\t{short 5 0.25}\n\t\t{long 8 0.6}\n\t}\n)\n');
g(STUFF + 'mgun/mgun.pattern', '{weapon\n\t{filling "ammo mgun" 60}\n\t("burst_medium")\n}\n');
g(STUFF + 'mgun/dt', '{from "pattern mgun"\n}\n');
g(STUFF + 'mgun/browning', '{from "pattern mgun"\n}\n');
g(STUFF + 'smg/smg.pattern', '{weapon\n\t{filling "ammo pistol" 30}\n\t{burst\n\t\t{short 6 0.5}\n\t\t{long 20 0.5}\n\t}\n}\n');
g(STUFF + 'smg/ppsh', '{from "pattern smg"\n}\n');
g(STUFF + 'rifle/rifle.pattern', '{weapon\n\t{filling "ammo rifle" 5}\n}\n');
g(STUFF + 'rifle/mosin', '{from "pattern rifle"\n}\n');
g(STUFF + 'reactive/arl.ammo', '{bullet\n\t{tag "big shell fg bomb"}\n\t{mass 42}\n\t{damage blastwave\n\t\t{energy 25}\n\t\t{area 0.5 3.5}\n\t}\n\t{damage add blastwave\n\t\t{energy 5}\n\t\t{area 10 20}\n\t}\n\t{damage fire\n\t\t{radius 5}\n\t\t{time 3}\n\t}\n}\n');
g(STUFF + 'reactive/arlk.ammo', '{from "arl ammo"\n\t{tag "light"}\n\t{mass 30}\n}\n');
g('resource/set/talk.set', '{talks\n(define "phrase_voice" {phrase {language "%1"}{voice %2}{sound "%0/talk/%1/%3/v%2"}})\n(define "phrases"\n\t("phrase_voice" args %0 eng 1 %1)\n)\n}\n');
g('resource/sound/human/talk/eng/attack/v1/a.wav', mkwav(22050, 100));
put(ST, 'v48.wav', mkwav(48000, 4800));

const ctxOf = (plan, out) => { const c = new Ctx({ target: 'as64', game: G, out: out || path.join(W, 'out'), plan: !!plan }); c.base = ST; return c; };
const codes = c => { const j = c.rep.toJSON({ tool: 'gen' }); return j.findings.map(f => f.code).concat(j.info.map(x => x.code)); };
const has = (c, code) => codes(c).includes(code);
const errs = c => Object.entries(c.rep.counts).filter(([k]) => !/^WARN_/.test(k)).reduce((a, [, n]) => a + n, 0);
const str = (c, k) => { const b = c.dirty.get(k); return b ? b.toString('latin1') : ''; };
const R = 'resource/set/multiplayer/units/';

// #1 roster for a new army from another army's card
{ const c = ctxOf(true); O.opArmy(c, { tag: 'fin', like: 'rus', alliance: 'allies' }); O.opRoster(c, { unit: 'tank_f', like: 'tank_d', army: 'fin' });
  const t = str(c, R + 'vehicles_fin.set');
  ok('#1 roster: tank_d of rus copied into vehicles_fin.set as tank_f, s(fin)', errs(c) === 0 && /\{"tank_f"\t\("v" c\(0\) s\(fin\) b\(v4\)\) \{level 4\} \{cost 120\}\}/.test(t) && has(c, 'GEN_ROSTER_OTHER_ARMY'), JSON.stringify(c.rep.counts) + ' ' + t);
  ok('#1 roster: the list keeps CRLF, rus list untouched', !/[^\r]\n/.test(t) && !c.dirty.has(R + 'vehicles_rus.set'));
  O.armyBots(c); // GEN-FIX3 #10: the same spec gave fin a card, so the end step writes its bots block
  ok('#1 army + roster: ["fin"] bots block from the card (GEN_ARMY_BOTS)', has(c, 'GEN_ARMY_BOTS') && /\["fin"\] = \{[^\r\n]*\r\n\t+\{priority = 1\.0, class = UnitClass\.Vehicle, unit = "tank_f"\}\r\n\t+\},/.test(str(c, 'resource/script/multiplayer/bot.data.lua')), codes(c).join(' ') + ' ' + str(c, 'resource/script/multiplayer/bot.data.lua')); }
{ const c = ctxOf(true); O.opArmy(c, { tag: 'fin', like: 'rus', alliance: 'allies' }); O.armyBots(c);
  ok('#1 army alone: no bots block, GEN_ARMY_NO_BOTS says why', has(c, 'GEN_ARMY_NO_BOTS') && !c.dirty.has('resource/script/multiplayer/bot.data.lua')); }
{ const c = ctxOf(true); O.opRoster(c, { unit: 'tank_f', like: 'tank_d', army: 'ger' });
  ok('#1 roster: other army card but no list of the army -> GEN_ROSTER_NO_FILE', has(c, 'GEN_ROSTER_NO_FILE') && c.dirty.size === 0, codes(c).join(' ')); }

// #2 weapon outside gun/, kit refusal
{ const c = ctxOf(true); O.opWeapon(c, { entity: 'tank_d', place: 'mgun1', weapon: 'browning' });
  const t = str(c, 'resource/entity/-vehicle/tank_d/tank_d.def');
  ok('#2 weapon: mgun/browning mounted on mgun1 (GEN_WEAPON_OUTSIDE_GUN)', errs(c) === 0 && /\{weapon "browning"\}/.test(t) && has(c, 'GEN_WEAPON_OUTSIDE_GUN'), codes(c).join(' ') + ' ' + t); }
{ const c = ctxOf(true); O.opWeapon(c, { entity: 'rifle', weapon: 'ppsh' });
  ok('#2 weapon on a breed -> GEN_WEAPON_USE_KIT naming the kit op', has(c, 'GEN_WEAPON_USE_KIT') && c.dirty.size === 0 && /kit op/.test(JSON.stringify(c.rep.toJSON({ tool: 'gen' }))), codes(c).join(' ')); }
{ const c = ctxOf(true); O.opWeapon(c, { entity: 'rus_x', weapon: 'ppsh' });
  ok('#2 weapon on a soldier model -> GEN_WEAPON_USE_KIT', has(c, 'GEN_WEAPON_USE_KIT') && c.dirty.size === 0, codes(c).join(' ')); }
{ const c = ctxOf(true); O.opWeapon(c, { entity: 'tank_d', place: 'mgun1', weapon: 'nosuchgun' });
  ok('#2 weapon unknown in every folder -> GEN_WEAPON_MISSING', has(c, 'GEN_WEAPON_MISSING') && c.dirty.size === 0, codes(c).join(' ')); }

// #3 set add / append / macro key
const SETK = 'resource/entity/-vehicle/tank_d/tank_d.def';
{ const c = ctxOf(true); O.opSet(c, { rows: [{ entity: 'tank_d', path: 'game_entity/speed', value: '900', op: 'set' }] }, G);
  ok('#3 set a key made by a macro call -> GEN_SET_KEY_MACRO', has(c, 'GEN_SET_KEY_MACRO') && !/\{speed 900\}/.test(str(c, SETK)), codes(c).join(' ')); }
{ const c = ctxOf(true); O.opSet(c, { rows: [{ entity: 'tank_d', path: 'game_entity/mass', value: '31000', op: 'add' }] }, G);
  const t = str(c, SETK);
  ok('#3 add on an existing single key sets it (GEN_SET_ADD_SET)', errs(c) === 0 && /\{mass 31000\}/.test(t) && (t.match(/\{mass /g) || []).length === 1 && has(c, 'GEN_SET_ADD_SET'), codes(c).join(' ') + ' ' + t); }
{ const c = ctxOf(true); O.opSet(c, { rows: [{ entity: 'tank_d', path: 'game_entity/mass', value: '31000', op: 'append' }] }, G);
  ok('#3 append on a single unkeyed line -> GEN_SET_APPEND_SINGLE', has(c, 'GEN_SET_APPEND_SINGLE'), codes(c).join(' ')); }

// #4 clone in --plan: the planned files stay in memory for later rows; the plan shows their content
{ const c = ctxOf(true); O.opClone(c, { entity: 'tank_d', as: 'my_d', wreck: false });
  O.opSet(c, { rows: [{ entity: 'my_d', path: 'game_entity/mass', value: '31000', op: 'set' }, { entity: 'file:resource/entity/-vehicle/my_d/my_d.def', path: 'game_entity/hp', value: '7', op: 'set' }] }, G);
  O.opMacro(c, { entity: 'my_d', macro: 'speed', arg: 's', value: 950 });
  const t = str(c, 'resource/entity/-vehicle/my_d/my_d.def'), j = c.rep.toJSON({ tool: 'gen' });
  ok('#4 plan clone: set rows (name and file: path) edit the planned def', /\{mass 31000\}/.test(t) && /\{hp 7\}/.test(t) && !has(c, 'GEN_SET_ENTITY_UNKNOWN') && !has(c, 'GEN_SET_PLAN_VIRTUAL'), codes(c).join(' ') + ' ' + t);
  ok('#4 plan clone: the macro row edits it too', /\("speed" s\(950\)\)/.test(t), t);
  ok('#4 plan: GEN_PLAN_WRITE lines show the final content', j.info.some(x => x.code === 'GEN_PLAN_WRITE' && /my_d\.def/.test(x.msg + x.file) && /31000/.test(x.msg)), j.info.filter(x => x.code === 'GEN_PLAN_WRITE').map(x => x.msg).join(' | '));
  ok('#4 plan: nothing on disk', !fs.existsSync(path.join(W, 'out', 'resource'))); }

// #5 shell / item: tag remove, damage_edit in place, inherited -> refused (KEY-17)
{ const c = ctxOf(); O.opShell(c, { id: 'arlx', like: 'arl ammo', tags: ['-bomb', 'heavy'], damage_edit: [{ type: 'fire', set: { radius: 10 } }, { type: 'blastwave', layer: 2, set: { energy: 3 } }] });
  const t = str(c, STUFF + 'reactive/arlx.ammo');
  ok('#5 shell: "-bomb" drops the word from the own {tag}', errs(c) === 0 && /\{tag "big shell fg"\}/.test(t) && /\{tag "heavy"\}/.test(t) && !/bomb/.test(t.replace(/^;.*$/m, '')), codes(c).join(' ') + ' ' + t);
  ok('#5 shell: damage_edit sets values inside the own layer, no new layer', /\{damage fire\r\n\t\t\{radius 10\}\r\n\t\t\{time 3\}/.test(t) && /\{damage add blastwave\r\n\t\t\{energy 3\}/.test(t) && (t.match(/\{damage /g) || []).length === 3, t); }
{ const c = ctxOf(); O.opShell(c, { id: 'arly', like: 'arlk', tags: ['-nope'] });
  ok('#5 shell: a word in no {tag} -> GEN_SHELL_TAG_ABSENT', has(c, 'GEN_SHELL_TAG_ABSENT') && c.dirty.size === 0, codes(c).join(' ')); }
{ const c = ctxOf(); O.opShell(c, { id: 'arly', like: 'arlk', tags: ['-bomb'] });
  ok('#5 shell: a word only the parent carries -> GEN_SHELL_TAG_INHERITED', has(c, 'GEN_SHELL_TAG_INHERITED') && c.dirty.size === 0, codes(c).join(' ')); }
{ const c = ctxOf(); O.opShell(c, { id: 'arly', like: 'arlk', damage_edit: [{ type: 'fire', set: { radius: 9 } }] });
  ok('#5 shell: damage_edit of an inherited layer -> GEN_SHELL_DAMAGE_INHERITED (KEY-17)', has(c, 'GEN_SHELL_DAMAGE_INHERITED') && c.dirty.size === 0 && /KEY-17/.test(JSON.stringify(c.rep.toJSON({ tool: 'gen' }))), codes(c).join(' ')); }

// #6 mission-clone no_bots: passed on as --no-bots; refused without with_mode
{ const c = ctxOf(true); let args = null; c.tool = (t, a) => { args = a; return { code: 0, out: '' }; };
  O.opMissionClone(c, { map: 'map/multi/m1', from: 'combat', with_mode: 'duel', no_bots: true });
  ok('#6 mission-clone no_bots -> --no-bots after --with-mode', args && args.includes('--no-bots') && args.indexOf('--no-bots') > args.indexOf('--with-mode'), JSON.stringify(args));
  const c2 = ctxOf(true); let a2 = null; c2.tool = (t, a) => { a2 = a; return { code: 0, out: '' }; };
  O.opMissionClone(c2, { map: 'map/multi/m1', from: 'combat', to: 'combat', no_bots: true });
  ok('#6 mission-clone no_bots without with_mode -> GEN_MISSION_ARGS, tool not run', has(c2, 'GEN_MISSION_ARGS') && a2 === null, codes(c2).join(' ')); }

// #7 voice: a 48 kHz PCM file is resampled to 44100
{ const c = ctxOf(); O.opVoice(c, { id: 'aus', like: 'eng', sounds: { attack: 'v48.wav' } });
  const b = c.dirty.get('resource/sound/human/talk/aus/attack/v1/v48.wav'), p = b && wav.parse(b);
  ok('#7 voice: 48000 Hz -> 44100 Hz 16-bit PCM mono (GEN_VOICE_RESAMPLED)', errs(c) === 0 && p && p.ok && p.fmt.rate === 44100 && p.fmt.bits === 16 && p.fmt.channels === 1 && Math.abs(p.frames - 4410) <= 1 && has(c, 'GEN_VOICE_RESAMPLED') && !c.rep.counts.WARN_GEN_VOICE_RATE, JSON.stringify(c.rep.counts) + ' ' + JSON.stringify(p && p.fmt) + ' ' + (p && p.frames)); }

// #8 gun burst seconds from the like (a macro of the folder's .presets, or the pattern's own {burst}), spec seconds win
const gunK = (c, d, n) => str(c, STUFF + d + '/' + n);
{ const c = ctxOf(); O.opGunAny(c, { name: 'my_dt', like: 'dt', class: 'mg', burst: '4 9' });
  ok('#8 gun: like ("burst_medium") -> its seconds 0.25 / 0.6', /\{burst \{short 4 0\.25\} \{long 9 0\.6\}\}/.test(gunK(c, 'mgun', 'my_dt')) && has(c, 'GEN_GUN_BURST_TIME_LIKE'), gunK(c, 'mgun', 'my_dt')); }
{ const c = ctxOf(); O.opGunAny(c, { name: 'my_pp', like: 'ppsh', class: 'smg', burst: [6, 25] });
  ok('#8 gun: like with {burst} in its pattern -> 0.5 / 0.5', /\{burst \{short 6 0\.5\} \{long 25 0\.5\}\}/.test(gunK(c, 'smg', 'my_pp')), gunK(c, 'smg', 'my_pp')); }
{ const c = ctxOf(); O.opGunAny(c, { name: 'my_dt2', like: 'dt', class: 'mg', burst: { short: 4, long: 9, short_s: 0.2, long_s: 1.5 } });
  ok('#8 gun: spec seconds win', /\{burst \{short 4 0\.2\} \{long 9 1\.5\}\}/.test(gunK(c, 'mgun', 'my_dt2')) && !has(c, 'GEN_GUN_BURST_TIME_LIKE'), gunK(c, 'mgun', 'my_dt2')); }
{ const c = ctxOf(); O.opGunAny(c, { name: 'my_ri', like: 'mosin', class: 'rifle', burst: '3 6' });
  ok('#8 gun: like without a burst -> 0.3 / 0.7 + GEN_GUN_BURST_TIME_DEFAULT', /\{burst \{short 3 0\.3\} \{long 6 0\.7\}\}/.test(gunK(c, 'rifle', 'my_ri')) && has(c, 'GEN_GUN_BURST_TIME_DEFAULT'), gunK(c, 'rifle', 'my_ri')); }
{ const c = ctxOf(); O.opGunAny(c, { name: 'my_bad', like: 'dt', class: 'mg', burst: '4 9 -1 0.5' });
  ok('#8 gun: negative seconds -> GEN_GUN_VALUE', has(c, 'GEN_GUN_VALUE') && c.dirty.size === 0, codes(c).join(' ')); }

// #9 the wreck step on the task path: ops in process, then gen finishText (as gui/ext/task compile.js finishGen) clones _x and _xx
{ const mod = path.join(W, 'mod9'); fs.mkdirSync(mod, { recursive: true });
  const c = ctxOf(false, mod);
  O[genMain.OPS.clone](c, { entity: 'tank_d', as: 'my_w' }, { name: 'mod9' });
  for (const f of c.pendingX || []) c.rep.info(f.file, f.line, f.code, f.msg);
  c.pendingX = []; c.flush(); genMain.finishText(c, O.slug('mod9')); c.flush();
  const e = n => fs.existsSync(path.join(mod, 'resource/entity/-vehicle', n, n + '.def'));
  ok('#9 task path: my_w, my_w_x and my_w_xx written by finishText', e('my_w') && e('my_w_x') && e('my_w_xx'), codes(c).join(' '));
  ok('#9 task path: GEN_WRECK_AUTOCLONE reported, no error', has(c, 'GEN_WRECK_AUTOCLONE') && errs(c) === 0, JSON.stringify(c.rep.counts));
  const n = codes(c).length; genMain.finishText(c, O.slug('mod9'));
  ok('#9 task path: the wreck step runs once', codes(c).filter(x => x === 'GEN_WRECK_AUTOCLONE').length === codes(c).slice(0, n).filter(x => x === 'GEN_WRECK_AUTOCLONE').length); }

console.log(bad ? `FAIL fix2: ${bad} failed` : 'OK fix2: all passed');
process.exit(bad ? 1 : 0);
