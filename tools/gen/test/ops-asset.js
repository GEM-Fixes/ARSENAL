// ops-asset: seeded-defect tests of lib/ops-asset.js (gun of any class, shell, item, sound, soundclass, voice, skin, stuffmodel, mapinfo).
// Each op: a wrong input is refused with its code and stages nothing; a good input's output re-parses (sdlwrite: closed, no strays;
// sdl.parseLines: no BRACES) with the changed value present and the file's line ends kept; a converted wav parses with lib/wav.js as a
// game-safe format; copied binaries are byte for byte. Plus --plan / a real run through the CLI. Own fixture, no game.
// node ops-asset.js <work dir>   prints "OK name" / "FAIL name: why", exit 1 on a FAIL.
// Author: Imperator_Aug (ARSENAL, ia-8fd549f4)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = path.resolve(process.argv[2] || path.join(__dirname, 'work'), 'ops-asset'); fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });
const { Ctx } = require('../lib/ctx'), O = require('../lib/ops'), sdlwrite = require('../../lib/sdlwrite'), sdl = require('../../lib/sdl'), wav = require('../../lib/wav');
const model = require('../../sound/model');
let bad = 0;
const ok = (name, c, why) => { console.log(c ? 'OK ' + name : 'FAIL ' + name + ': ' + (why || '')); if (!c) bad++; };

// ---- wav / dds builders
function mkwav(tag, bits, ch, rate, frames) {
  const B = bits / 8, data = Buffer.alloc(frames * ch * B);
  for (let i = 0; i < frames * ch; i++) {
    const x = Math.sin(i / 7) * 0.5;
    if (tag === 3) data.writeFloatLE(x, i * 4); else if (bits === 16) data.writeInt16LE(Math.round(x * 32767), i * 2); else if (bits === 24) data.writeIntLE(Math.round(x * 8388607), i * 3, 3); else data[i] = 128 + Math.round(x * 127);
  }
  const f = Buffer.alloc(16);
  f.writeUInt16LE(tag, 0); f.writeUInt16LE(ch, 2); f.writeUInt32LE(rate, 4); f.writeUInt32LE(rate * ch * B, 8); f.writeUInt16LE(ch * B, 12); f.writeUInt16LE(bits, 14);
  const ck = (id, b) => { const h = Buffer.alloc(8); h.write(id, 0, 'latin1'); h.writeUInt32LE(b.length, 4); return Buffer.concat([h, b, b.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
  const body = Buffer.concat([Buffer.from('WAVE', 'latin1'), ck('fmt ', f), ck('data', data)]), h = Buffer.alloc(8);
  h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(body.length, 4);
  return Buffer.concat([h, body]);
}
function mkdds(w, h, fill) { const b = Buffer.alloc(128 + 64, fill || 0); b.write('DDS ', 0, 'latin1'); b.writeUInt32LE(124, 4); b.writeUInt32LE(h, 12); b.writeUInt32LE(w, 16); return b; }

// ---- fixture: loose resource/ of a tiny AS2 (text CRLF unless a test needs LF)
const G = path.join(W, 'as2'), ST = path.join(W, 'stage');
const put = (root, key, data, lf) => { const f = path.join(root, key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.isBuffer(data) ? data : Buffer.from(lf ? data : data.replace(/\r?\n/g, '\r\n'), 'latin1')); };
const g = (key, data, lf) => put(G, key, data, lf);
const STUFF = 'resource/set/stuff/';
g(STUFF + 'mgun/.presets', '(define "recoveryTime" {recoveryTime (/ 60 %r)})\n(define "speed" {speed (* 0.5 %s)})\n(define "burst_short" {burst {short 5 0.3}{long 10 0.7}})\n(define "burst_long" {burst {short 20 0.3}{long 40 0.7}})\n');
g(STUFF + 'mgun/mgun.pattern', '{weapon\n\t{filling "ammo mgun" 100}\n\t{rechargeTime 5.0}\n\t{spreading 1}\n\t("recoveryTime" r(600))\n}\n');
g(STUFF + 'mgun/mg42', '{from "pattern mgun"\n\t{entity "mg42"}\n\t("recoveryTime" r(1200))\n}\n');
g(STUFF + 'rifle/rifle.pattern', '{weapon\n\t{filling "ammo rifle" 5}\n}\n');
g(STUFF + 'rifle/mosin', '{from "pattern rifle"\n}\n');
g(STUFF + 'shell/.presets', '(define "fg" {damage blastwave {energy %0}{area 0.5 3}})\n(define "ap" {trace %0})\n');
g(STUFF + 'shell/fg.pattern', '{shell\n\t{damage blastwave\n\t\t{energy 1}\n\t\t{area 1 2}\n\t}\n}\n');
g(STUFF + 'shell/bullet76.fg.ammo', '{from "pattern fg"\n\t{mass 13}\n\t("fg" args 3.8)\n\t{entity "shell_fg_76"}\n}\n');
g('resource/entity/-shell/shell_fg_76/shell_fg_76.def', '{game_entity\n}\n');
g(STUFF + 'grenade/grenade_ap.pattern', '{item\n\t{special\n\t\t{PrepareTime 4.5}\n\t\t{mode detonate}\n\t}\n\t{throw\n\t\t{range 17}\n\t\t{startAngle 40}\n\t}\n\t{damage blastwave\n\t\t{energy 2.0}\n\t\t{area 0.5 5.0}\n\t}\n}\n');
g(STUFF + 'grenade/f1.grenade', '{from "pattern grenade_ap"\n\t{inventory {size 1 1}}\n\t{entity "grenade_f1"}\n}\n');
g(STUFF + 'explosive/antitank.mine', '{item\n\t{mass 8}\n}\n');
// GEN-FIX4: percent rows in the vanilla tabular form (AS2 sound.set:11-15, sum 100)
const SS = '{sound\n\t{percent "effects" \t\t\t\t45\t\t\t\t\t}\n\t{percent "emotions" \t\t\t15 \t\t\t\t2\t}\n\t{percent "speech" \t\t\t\t10 \t\t\t\t1\t}\n\t{percent "environment" \t\t\t20\t\t\t\t\t}\n\t{percent "main_environment" \t10\t\t\t\t\t}\n\t{loudness "default" 10 100}\n\t{loudness "shoot normal" 40 600 5}\n}\n';
g('resource/sound/sound.set', SS);
const MGW = mkwav(1, 16, 1, 44100, 300);
g('resource/sound/weapon/shot/mgun/mg42_burst/mg42_01.wav', MGW);
g('resource/sound/weapon/shot/mgun/mg42_burst/folder.set', '{sound\n\t{loudness "shoot normal"}\n\t{signal shot 40}\n\t{volume 0.9}\n}\n');
g('resource/set/talk.set', '{talks\n(define "phrase_voice" {phrase {language "%1"}{voice %2}{sound "%0/talk/%1/%3/v%2"}})\n(define "phrases"\n\t("phrase_voice" args %0 eng 1 %1)\n\t("phrase_voice" args %0 eng 2 %1)\n)\n}\n', true);
const V1 = mkwav(1, 16, 1, 22050, 100), V2 = mkwav(1, 16, 1, 22050, 120);
g('resource/sound/human/talk/eng/attack/v1/a.wav', V1); g('resource/sound/human/talk/eng/attack/v2/a.wav', V2);
g('resource/sound/human/talk/eng/death_cry/folder.set', '{sound\n\t{loudness "default"}\n}\n');
g('resource/sound/vehicle/talk/eng/move/v1/m.wav', V1);
// GEN-FIX4: the talk parents as vanilla (sound/human/talk/folder.set, sound/vehicle/talk/folder.set)
g('resource/sound/human/talk/folder.set', '{sound\n\t{tag emotions}\n\t{loudness "default"}\n}\n'); g('resource/sound/vehicle/talk/folder.set', '{sound\n\t{tag emotions}\n\t{loudness "default"}\n}\n');
const HS = 'resource/entity/humanskin/ger_com/', DDS64 = mkdds(64, 64, 1), BP = mkdds(64, 64, 2);
g(HS + 'ger_com.def', '{game_entity\n\t{Extension "ger_com.mdl"}\n\t{tag "ger soldier"}\n}\n');
g(HS + 'ger_com.mdl', '{skeleton\n\t{bone "basis"\n\t\t{VolumeView "skin.ply"}\n\t}\n}\n');
g(HS + 'skin.mtl', '{material bump\n\t{diffuse "ger_com"}\n\t{bump "ger_com_bp"}\n}\n');
g(HS + 'ger_com.dds', DDS64); g(HS + 'ger_com_bp.dds', BP); g(HS + 'ger_com#d.dds', DDS64); g(HS + 'skin.ply', Buffer.from([1, 0, 2, 0]));
g('resource/entity/-vehicle/tank_v/tank_v.def', '{game_entity\n\t{Extension "tank_v.mdl"}\n}\n');
g('resource/entity/-vehicle/tank_v/tank_v.mtl', '{material simple\n\t{diffuse "tank_v"}\n}\n');
g('resource/entity/-vehicle/tank_v/tank_v.dds', DDS64);
const INV = 'resource/entity/inventory/-weapon/mg42/', PLY = Buffer.from([7, 0, 0, 9, 1]);
g(INV + 'mg42.def', '{Actor\n\t{Extension "mg42.mdl"}\n\t{extender "stuff" {item "mg42"}}\n}\n');
g(INV + 'mg42.mdl', '{skeleton\n\t{Extender "preview"\n\t\t{"Stuff"\n\t\t\t{camera\n\t\t\t\t{origin 0 1 2}\n\t\t\t\t{lookat 0 0 0}\n\t\t\t\t{fov 45}\n\t\t\t}\n\t\t}\n\t}\n}\n');
g(INV + 'mg42.ply', PLY);
g('resource/map/multi/m1/map.info', ';SDL\n{game\n  {maxPlayers 2}\n}\n');
// staged files (what a modder hands gen)
const GOOD = mkwav(1, 16, 1, 22050, 200), FLT = mkwav(3, 32, 1, 44100, 200), P24 = mkwav(1, 24, 2, 48000, 200);
put(ST, 'st16.wav', mkwav(1, 16, 2, 44100, 200)); put(ST, 'good.wav', GOOD); put(ST, 'float.wav', FLT); put(ST, 'deep24.wav', P24); put(ST, 'bad.wav', Buffer.from('RIFX not a wave at all..........'));
put(ST, 'my_shots/s1.wav', GOOD); put(ST, 'my_shots/readme.txt', 'x');
put(ST, 'good.dds', mkdds(64, 64, 5)); put(ST, 'big.dds', mkdds(128, 128, 6)); put(ST, 'notdds.dds', Buffer.from('this is a png, honest'.padEnd(200, '.')));
// a second game whose sound.set lost its default row
const G2 = path.join(W, 'as2b'); put(G2, 'resource/sound/sound.set', '{sound\n\t{loudness "rain" 20 0}\n}\n');

const ctxOf = (plan, game, target) => { const c = new Ctx({ target: target || 'as64', game: game || G, goh: target === 'goh' ? game || G : undefined, out: path.join(W, 'out'), plan: !!plan }); c.base = ST; return c; };
const run = (fn, spec, plan, game, target) => { const c = ctxOf(plan, game, target); O[fn](c, spec); return c; };
const errs = c => Object.entries(c.rep.counts).filter(([k]) => !/^WARN_/.test(k)).reduce((a, [, n]) => a + n, 0);
const infos = c => c.rep.toJSON({ tool: 'gen' }).info.map(x => x.code);
const parsesClean = (buf, lf) => {
  let t; try { t = sdlwrite.parse(buf); } catch (e) { return 'sdlwrite: ' + e.message; }
  let why = '';
  (function walk(n) { for (const k of n.items || []) { if (k.type === 'stray') why = 'stray ' + k.text + ' at ' + k.start; if (k.items && !k.closed) why = 'unclosed at ' + k.start; walk(k); } })(t.root);
  if (why) return why;
  const e = []; sdl.parseLines(buf.toString('latin1').split(/\r?\n/), (l, code, msg) => { if (code === 'BRACES') e.push(l + ' ' + msg); });
  if (e.length) return 'sdl: ' + e.join('; ');
  if (!lf && (/[^\r]\n/.test(buf.toString('latin1')) || /^\n/.test(buf.toString('latin1')))) return 'bare LF';
  if (lf && /\r/.test(buf.toString('latin1'))) return 'CR in an LF file';
  return '';
};
const refused = (name, fn, spec, code, game, target) => { const c = run(fn, spec, false, game, target); ok(name + ' -> ' + code, (c.rep.counts[code] || 0) >= 1 && c.dirty.size === 0, JSON.stringify(c.rep.counts) + ' dirty ' + [...c.dirty.keys()].join(' ')); };
// a good run: no error, each text key re-parses with its line ends, test(text) holds; returns the ctx for more checks
const good = (name, fn, spec, checks, lfKeys) => {
  const c = run(fn, spec);
  ok(name + ': no error', errs(c) === 0, JSON.stringify(c.rep.counts) + ' ' + c.rep.toJSON({ tool: 'gen' }).findings.map(f => f.msg).join(' | '));
  for (const [key, test] of Object.entries(checks)) {
    const b = c.dirty.get(key);
    if (!b) { ok(name + ': ' + key + ' written', false, 'not staged; staged: ' + [...c.dirty.keys()].join(' ')); continue; }
    const p = parsesClean(b, (lfKeys || []).includes(key)); ok(name + ': ' + key.split('/').pop() + ' re-parses', !p, p);
    const s = b.toString('latin1'); ok(name + ': ' + key.split('/').pop() + ' has the change', test(s), s.slice(0, 600));
  }
  return c;
};
const same = (a, b) => !!a && !!b && Buffer.compare(a, b) === 0;
const safeWav = b => { const p = wav.parse(b); return p.ok && wav.GAME_SAFE.has(p.tag) && (p.tag !== wav.TAG.PCM || p.fmt.bits === 16 || p.fmt.bits === 8) && (p.tag !== wav.TAG.IMA_ADPCM || p.fmt.bits === 4) ? p : null; };

// ---- gun
refused('gun unknown class', 'opGunAny', { name: 'g1', like: 'mg42', class: 'tank', rof: 900 }, 'GEN_GUN_CLASS');
refused('gun rifle like for class mg', 'opGunAny', { name: 'g1', like: 'mosin', class: 'mg', rof: 900 }, 'GEN_GUN_CLASS');
refused('gun rof 0', 'opGunAny', { name: 'g1', like: 'mg42', class: 'mg', rof: 0 }, 'GEN_GUN_VALUE');
refused('gun burst preset the folder lacks', 'opGunAny', { name: 'g1', like: 'mg42', class: 'mg', burst: 'medium' }, 'GEN_GUN_VALUE');
refused('gun params not a macro', 'opGunAny', { name: 'g1', like: 'mg42', class: 'mg', params: { frobnicate: 'r(3)' } }, 'GEN_GUN_PARAM_UNKNOWN');
refused('gun params with braces', 'opGunAny', { name: 'g1', like: 'mg42', class: 'mg', params: { recoveryTime: 'r(3)} {hp 1' } }, 'GEN_GUN_VALUE');
refused('gun fire sound missing', 'opGunAny', { name: 'g1', like: 'mg42', class: 'mg', fire_sound: 'mgun/nope/' }, 'GEN_GUN_SOUND_MISSING');
refused('gun name taken', 'opGunAny', { name: 'mg42', like: 'mg42', class: 'mg', rof: 900 }, 'GEN_GUN_EXISTS');
refused('gun reload and recharge', 'opGunAny', { name: 'g1', like: 'mg42', class: 'mg', reload: 3, recharge: 4 }, 'GEN_GUN_ARGS');
refused('gun no like', 'opGunAny', { name: 'g1', like: 'nosuchgun', class: 'mg', rof: 900 }, 'GEN_GUN_LIKE_MISSING');
{ const g = run('opGunAny', { name: 'g1', like: 'mg42', class: 'mg', rof: 900 }, true, G, 'goh');   // game parity: the gun op runs on GoH (parity.js has the GoH macros)
  ok('gun on GoH runs (no AS2-only stop)', !g.rep.counts.GEN_GUN_AS2_ONLY, JSON.stringify(g.rep.counts)); }
{ const a = run('opGunAny', { name: 'g1', like: 'nosuchgun' }), b = run('opGun', { name: 'g1', like: 'nosuchgun' });
  ok('gun without class = the cannon op (same findings)', JSON.stringify(a.rep.counts) === JSON.stringify(b.rep.counts) && Object.keys(a.rep.counts).length > 0, JSON.stringify(a.rep.counts) + ' vs ' + JSON.stringify(b.rep.counts)); }
good('gun mg class fields', 'opGunAny', { name: 'my_mg', like: 'mg42', class: 'mg', rof: 1500, burst: 'long', spread: 1.5, aim: 0.4, reload: 3, health: 120, magazine: 150, fire_sound: 'mgun/mg42_burst/', params: { speed: 's(820)', 'ap': { recoveryTime: 'r(900)', spreading: 2 } } },
  { [STUFF + 'mgun/my_mg']: s => /^\{from "mg42"/.test(s) && s.includes('("recoveryTime" r(1500))') && s.includes('("burst_long")') && s.includes('{spreading 1.5}') && s.includes('{RelaxationTime 0.4}') && s.includes('{rechargeTime 3}') && s.includes('{healthDamage 120}') && s.includes('{filling "ammo mgun" 150}') && s.includes('{fireSound "mgun/mg42_burst/"}') && s.includes('("speed" s(820))') && /\{parameters "ap"\r\n\t\t\("recoveryTime" r\(900\)\)\r\n\t\t\{spreading 2\}\r\n\t\}/.test(s) });
{ const c = good('gun rifle, no macro: rof as recoveryTime seconds, burst numbers', 'opGunAny', { name: 'my_rifle', like: 'mosin', class: 'rifle', rof: 120, burst: '3 6', range: '40 60' },
  { [STUFF + 'rifle/my_rifle']: s => s.includes('{recoveryTime 0.5}') && s.includes('{burst {short 3 0.3} {long 6 0.7}}') && s.includes('{range 40 60}') });
  ok('gun facts say old -> new', c.facts.some(f => /magazine|rate of fire \? -> 120/.test(f)), c.facts.join(' | ')); }

// ---- shell
refused('shell inner radius above outer', 'opShell', { id: 'bullet76.he2', like: 'bullet76.fg', blast: ['1 5 2'] }, 'GEN_SHELL_VALUE');
refused('shell entity missing', 'opShell', { id: 'bullet76.he2', like: 'bullet76.fg', entity: 'no_model' }, 'GEN_SHELL_ENTITY_MISSING');
refused('shell preset not in .presets', 'opShell', { id: 'bullet76.he2', like: 'bullet76.fg', preset: 'apcr', args: 1 }, 'GEN_SHELL_VALUE');
refused('shell id taken', 'opShell', { id: 'bullet76.fg', like: 'bullet76.fg', mass: 2 }, 'GEN_SHELL_EXISTS');
refused('shell like missing', 'opShell', { id: 'x.he', like: 'bullet99.fg' }, 'GEN_SHELL_LIKE_MISSING');
refused('shell bad id', 'opShell', { id: 'Bullet 76!', like: 'bullet76.fg' }, 'GEN_SHELL_ARGS');
{ const c = good('shell blast layers', 'opShell', { id: 'bullet76.he2', like: 'bullet76.fg', mass: 7, blast: ['4 0.5 6', { energy: 1, area: '6 12' }] },
  { [STUFF + 'shell/bullet76.he2.ammo']: s => /^; gen: /.test(s) && !/\("fg"/.test(s) && /\{damage blastwave\r\n\t\t\{energy 4\}\r\n\t\t\{area 0\.5 6\}\r\n\t\}/.test(s) && s.includes('{damage add blastwave') && s.includes('{area 6 12}') && s.includes('{mass 7}') && !s.includes('{mass 13}') });
  ok('shell: the dropped fg preset is an info', infos(c).includes('GEN_SHELL_PRESET_DROPPED'), infos(c).join(' ')); }
good('shell preset args', 'opShell', { id: 'bullet76.fg2', like: 'bullet76.fg', args: 5, cumulative: 0.4 }, { [STUFF + 'shell/bullet76.fg2.ammo']: s => s.includes('("fg" args 5)') && s.includes('{cumulative 0.4}') });

// ---- item
refused('item a mine has no throw', 'opItem', { id: 'my_mine', like: 'antitank', throw: { range: 20 } }, 'GEN_ITEM_NO_THROW');
refused('item fuse 99 s', 'opItem', { id: 'my_f1', like: 'f1', fuse: 99 }, 'GEN_ITEM_VALUE');
refused('item id taken', 'opItem', { id: 'f1', like: 'f1', fuse: 3 }, 'GEN_ITEM_EXISTS');
refused('item bad size', 'opItem', { id: 'my_f1', like: 'f1', size: '0 1' }, 'GEN_ITEM_VALUE');
good('item throw / fuse / size / blast', 'opItem', { id: 'my_f1', like: 'f1', fuse: 5, throw: { range: 22, speed: 15 }, size: '1 2', weight: 3, blast: ['2.5 0.5 6'] },
  { [STUFF + 'grenade/my_f1.grenade']: s => s.includes('{range 22}') && s.includes('{startAngle 40}') && s.includes('{constantSpeed 15}') && s.includes('{PrepareTime 5}') && s.includes('{mode detonate}') && /\{inventory \{size 1 2\} \{weight 3\}\}|\{size 1 2\}/.test(s) && s.includes('{weight 3}') && s.includes('{energy 2.5}') && !s.includes('damage add') });
good('item mine mass', 'opItem', { id: 'my_mine', like: 'antitank', mass: 9 }, { [STUFF + 'explosive/my_mine.mine']: s => s.includes('{mass 9}') && !s.includes('{mass 8}') });

// ---- sound
refused('sound not a wave', 'opSound', { id: 'weapon/shot/my_mg', like: 'weapon/shot/mgun/mg42_burst', files: ['bad.wav'] }, 'GEN_SOUND_BAD_WAV');
refused('sound file missing', 'opSound', { id: 'weapon/shot/my_mg', files: ['nope.wav'] }, 'GEN_SOUND_FILE_MISSING');
refused('sound loudness not in sound.set', 'opSound', { id: 'weapon/shot/my_mg', like: 'weapon/shot/mgun/mg42_burst', loudness: 'very loud' }, 'GEN_SOUND_LOUDNESS_UNKNOWN');
refused('sound volume 2', 'opSound', { id: 'weapon/shot/my_mg', like: 'weapon/shot/mgun/mg42_burst', volume: 2 }, 'GEN_SOUND_VALUE');
refused('sound folder exists', 'opSound', { id: 'weapon/shot/mgun/mg42_burst', files: ['good.wav'] }, 'GEN_SOUND_EXISTS');
refused('sound like missing', 'opSound', { id: 'weapon/shot/my_mg', like: 'weapon/shot/nope' }, 'GEN_SOUND_LIKE_MISSING');
refused('sound no like no files', 'opSound', { id: 'weapon/shot/my_mg' }, 'GEN_SOUND_ARGS');
{ const D = 'resource/sound/weapon/shot/my_mg/';
  const c = good('sound files + like settings', 'opSound', { id: 'weapon/shot/my_mg', like: 'weapon/shot/mgun/mg42_burst', files: ['good.wav', 'float.wav', 'deep24.wav', 'my_shots'], volume: 0.7 },
    { [D + 'folder.set']: s => s.includes('{loudness "shoot normal"}') && s.includes('{signal shot 40}') && s.includes('{volume 0.7}') });
  ok('sound: a playable wav is copied byte for byte', same(c.dirty.get(D + 'good.wav'), GOOD) && same(c.dirty.get(D + 's1.wav'), GOOD));
  const f = safeWav(c.dirty.get(D + 'float.wav') || Buffer.alloc(0)), d = safeWav(c.dirty.get(D + 'deep24.wav') || Buffer.alloc(0));
  ok('sound: float32 converted to game-safe 16-bit PCM', f && f.tag === wav.TAG.PCM && f.fmt.bits === 16 && f.fmt.rate === 44100, JSON.stringify(f && f.fmt));
  ok('sound: 24-bit stereo converted, rate kept', d && d.fmt.bits === 16 && d.fmt.channels === 2 && d.fmt.rate === 48000, JSON.stringify(d && d.fmt));
  ok('sound: CONVERTED info + rate / stereo warnings', infos(c).filter(x => x === 'GEN_SOUND_CONVERTED').length === 2 && c.rep.counts.WARN_GEN_SOUND_RATE === 1 && c.rep.counts.WARN_GEN_SOUND_STEREO === 1, JSON.stringify(c.rep.counts) + ' ' + infos(c).join(' '));
  ok('sound: folder.set reads back through sound/model', (() => { const r = model.folder('resource/sound/weapon/shot/my_mg', k => c.read(k)); return r.loudness === 'shoot normal' && Math.abs(r.volume - 0.7) < 1e-9 && r.signal && r.signal.radius == 40; })());
  ok('sound: the staged files are not changed', same(fs.readFileSync(path.join(ST, 'float.wav')), FLT));
  ok('sound: no txt copied', !c.dirty.has(D + 'readme.txt')); }
{ const c = run('opSound', { id: 'voice/x', files: ['float.wav'], format: 'ima' }); const p = safeWav(c.dirty.get('resource/sound/voice/x/float.wav') || Buffer.alloc(0));
  ok('sound format ima: IMA ADPCM 4-bit, game-safe', errs(c) === 0 && p && p.tag === wav.TAG.IMA_ADPCM && p.fmt.bits === 4, JSON.stringify(c.rep.counts) + JSON.stringify(p && p.fmt)); }
{ const c = run('opSound', { id: 'weapon/shot/my_mg2', like: 'weapon/shot/mgun/mg42_burst' });
  ok('sound like only: its wavs byte for byte', errs(c) === 0 && same(c.dirty.get('resource/sound/weapon/shot/my_mg2/mg42_01.wav'), MGW), JSON.stringify(c.rep.counts)); }

// ---- soundclass
refused('soundclass name taken (case)', 'opSoundClass', { name: 'Shoot Normal', min: 1, max: 2 }, 'GEN_SOUNDCLASS_EXISTS');
refused('soundclass min above max', 'opSoundClass', { name: 'far', min: 500, max: 20 }, 'GEN_SOUNDCLASS_VALUE');
refused('soundclass sound.set without default', 'opSoundClass', { name: 'far', min: 50, max: 400 }, 'GEN_SOUNDCLASS_NO_DEFAULT', G2);
{ const c = good('soundclass row', 'opSoundClass', { name: 'shoot far', min: 60, max: 400, priority: 5 }, { 'resource/sound/sound.set': s => s.includes('\t{loudness "shoot far" 60 400 5}\r\n}') });
  const set = model.soundSet(k => c.read(k));
  ok('soundclass: sound.set reads back with default and the new row', set.loudness.default && set.loudness['shoot far'] && set.loudness['shoot far'].max == 400 && set.order.length === 3, JSON.stringify(set.order));
  ok('soundclass: FULL_COPY info', infos(c).includes('GEN_SOUNDCLASS_FULL_COPY')); }

// ---- voice
refused('voice like not a language', 'opVoice', { id: 'aus', like: 'xx' }, 'GEN_VOICE_LIKE_MISSING');
refused('voice id taken', 'opVoice', { id: 'eng', like: 'eng' }, 'GEN_VOICE_EXISTS');
refused('voice sounds for an unknown folder', 'opVoice', { id: 'aus', like: 'eng', sounds: { nofolder: 'good.wav' } }, 'GEN_VOICE_FOLDER_UNKNOWN');
refused('voice sounds not a wave', 'opVoice', { id: 'aus', like: 'eng', sounds: { attack: 'bad.wav' } }, 'GEN_VOICE_BAD_WAV');
refused('voice speaker outside', 'opVoice', { id: 'aus', like: 'eng', speakers: 2, sounds: { 'attack/v5': 'good.wav' } }, 'GEN_VOICE_VALUE');
{ const T = 'resource/sound/human/talk/aus/';
  const c = good('voice 3 speakers, attack v1 replaced', 'opVoice', { id: 'aus', like: 'eng', speakers: 3, sounds: { 'attack/v1': 'float.wav' } },
    { 'resource/set/talk.set': s => /\("phrase_voice" args %0 eng 2 %1\)\n\t; gen: voice aus[^\n]*\n\t\("phrase_voice" args %0 aus 1 %1\)\n\t\("phrase_voice" args %0 aus 2 %1\)\n\t\("phrase_voice" args %0 aus 3 %1\)\n\)/.test(s) }, ['resource/set/talk.set']);
  ok('voice: v2 copied, v3 plays v1\'s files, v1 replaced', same(c.dirty.get(T + 'attack/v2/a.wav'), V2) && same(c.dirty.get(T + 'attack/v3/a.wav'), V1) && !c.dirty.has(T + 'attack/v1/a.wav') && !!safeWav(c.dirty.get(T + 'attack/v1/float.wav') || Buffer.alloc(0)), [...c.dirty.keys()].join(' '));
  ok('voice: folder.set and the vehicle tree copied', same(c.dirty.get(T + 'death_cry/folder.set'), c.read('resource/sound/human/talk/eng/death_cry/folder.set')) && c.dirty.has('resource/sound/vehicle/talk/aus/move/v3/m.wav')); }

// ---- GEN-FIX4: mono downmix, sound.set percent rows, voice loudness
{ const c = run('opSound', { id: 'voice/m1', files: ['st16.wav'], mono: true }), b = c.dirty.get('resource/sound/voice/m1/st16.wav'), p = b && safeWav(b);
  ok('mono: stereo 16-bit -> 1 channel, 200 frames, GEN_SOUND_MONO, no stereo warning', errs(c) === 0 && p && p.fmt.channels === 1 && p.fmt.rate === 44100 && wav.decode(b).frames === 200 && infos(c).includes('GEN_SOUND_MONO') && !c.rep.counts.WARN_GEN_SOUND_STEREO, JSON.stringify(c.rep.counts) + JSON.stringify(p && p.fmt)); }
{ const c = run('opSound', { id: 'voice/m1', files: ['st16.wav'] }), b = c.dirty.get('resource/sound/voice/m1/st16.wav'), p = b && safeWav(b);
  ok('mono seeded: without mono the file stays stereo, WARN_GEN_SOUND_STEREO', p && p.fmt.channels === 2 && c.rep.counts.WARN_GEN_SOUND_STEREO === 1, JSON.stringify(c.rep.counts)); }
refused('mono not a boolean', 'opSound', { id: 'voice/m2', files: ['st16.wav'], mono: 'maybe' }, 'GEN_SOUND_VALUE');
refused('mono on a like-only copy', 'opSound', { id: 'voice/m2', like: 'weapon/shot/mgun/mg42_burst', mono: true }, 'GEN_SOUND_ARGS');
{ const c = run('opVoice', { id: 'aus5', like: 'eng', sounds: { 'attack/v1': 'st16.wav' }, mono: true }), b = c.dirty.get('resource/sound/human/talk/aus5/attack/v1/st16.wav'), p = b && safeWav(b);
  ok('voice mono: the given stereo wav downmixed (GEN_VOICE_MONO)', errs(c) === 0 && p && p.fmt.channels === 1 && infos(c).includes('GEN_VOICE_MONO'), JSON.stringify(c.rep.counts) + [...c.dirty.keys()].join(' ')); }
{ const c = good('soundclass percent: speech 12 1, effects 43 (sum 100)', 'opSoundClass', { percent: { speech: '12 1', effects: 43 } },
    { 'resource/sound/sound.set': s => /\t\{percent "speech" 12 1\}\r\n/.test(s) && /\t\{percent "effects" 43\}\r\n/.test(s) && /\{percent "emotions" \t\t\t15 \t\t\t\t2\t\}/.test(s) && !/percent "speech" \t/.test(s) });
  const set = model.soundSet(k => c.read(k)), sp = set.groups && set.groups.speech;
  ok('soundclass percent: reads back (speech 12% max 1), no sum warning, GEN_SOUNDCLASS_PERCENT', sp && sp.percent === 12 && sp.max === 1 && !c.rep.counts.WARN_GEN_SOUNDCLASS_PERCENT_SUM && infos(c).includes('GEN_SOUNDCLASS_PERCENT'), JSON.stringify(set.groups)); }
{ const c = run('opSoundClass', { percent: { speech: 30 } }), b = c.dirty.get('resource/sound/sound.set');
  ok('soundclass percent seeded: sum 120 -> WARN_GEN_SOUNDCLASS_PERCENT_SUM, still written', c.rep.counts.WARN_GEN_SOUNDCLASS_PERCENT_SUM === 1 && errs(c) === 0 && b && /percent "speech" 30\}/.test(b.toString('latin1')), JSON.stringify(c.rep.counts)); }
{ const c = run('opSoundClass', { name: 'shoot far', min: 60, max: 400, percent: { speech: 10, effects: 45 } }), b = c.dirty.get('resource/sound/sound.set'), t = b ? b.toString('latin1') : '';
  ok('soundclass row + percent in one op', errs(c) === 0 && /\{loudness "shoot far" 60 400\}/.test(t) && /\{percent "speech" 10\}/.test(t), JSON.stringify(c.rep.counts)); }
refused('soundclass percent: unknown group', 'opSoundClass', { percent: { music: 10 } }, 'GEN_SOUNDCLASS_VALUE');
refused('soundclass percent: share above 100', 'opSoundClass', { percent: { speech: 120 } }, 'GEN_SOUNDCLASS_VALUE');
refused('soundclass percent: not a map', 'opSoundClass', { percent: 'speech 10' }, 'GEN_SOUNDCLASS_ARGS');
refused('soundclass: neither row nor percent', 'opSoundClass', {}, 'GEN_SOUNDCLASS_ARGS');
{ const c = good('voice loudness: talk/<id>/folder.set in the vanilla form', 'opVoice', { id: 'aus6', like: 'eng', loudness: 'shoot normal' },
    { 'resource/sound/human/talk/aus6/folder.set': s => s === '{sound\r\n\t{tag emotions}\r\n\t{loudness "shoot normal"}\r\n}\r\n', 'resource/sound/vehicle/talk/aus6/folder.set': s => s.includes('{loudness "shoot normal"}') }, ['resource/set/talk.set']);
  const f = model.folder('resource/sound/human/talk/aus6', k => c.read(k));
  ok('voice loudness: reads back as shoot normal in group emotions, GEN_VOICE_LOUDNESS', f.loudness === 'shoot normal' && f.group === 'emotions' && infos(c).includes('GEN_VOICE_LOUDNESS'), JSON.stringify(f)); }
{ const c = run('opVoice', { id: 'aus7', like: 'eng', loudness: { human: 'shoot normal' } });
  ok('voice loudness map: human only', errs(c) === 0 && c.dirty.has('resource/sound/human/talk/aus7/folder.set') && !c.dirty.has('resource/sound/vehicle/talk/aus7/folder.set'), JSON.stringify(c.rep.counts)); }
refused('voice loudness: class not in sound.set (seeded)', 'opVoice', { id: 'aus8', like: 'eng', loudness: 'very loud' }, 'GEN_VOICE_LOUDNESS_UNKNOWN');
refused('voice loudness: a tree the voice does not get', 'opVoice', { id: 'aus8', like: 'eng', loudness: { cannon: 'default' } }, 'GEN_VOICE_VALUE');

// ---- skin
refused('skin texture not DDS', 'opSkin', { id: 'ger_x', like: 'ger_com', textures: { diffuse: 'notdds.dds' } }, 'GEN_SKIN_NOT_DDS');
refused('skin texture role unknown', 'opSkin', { id: 'ger_x', like: 'ger_com', textures: { glow: 'good.dds' } }, 'GEN_SKIN_STEM_UNKNOWN');
refused('skin texture file missing', 'opSkin', { id: 'ger_x', like: 'ger_com', textures: { diffuse: 'nope.dds' } }, 'GEN_SKIN_FILE_MISSING');
refused('skin like missing', 'opSkin', { id: 'ger_x', like: 'ger_nope' }, 'GEN_SKIN_LIKE_MISSING');
refused('skin id taken', 'opSkin', { id: 'ger_com', like: 'ger_com' }, 'GEN_SKIN_EXISTS');
refused('skin like and entity', 'opSkin', { id: 'x', like: 'ger_com', entity: 'tank_v' }, 'GEN_SKIN_ARGS');
refused('skin vehicle texture name unknown', 'opSkin', { id: 'winter', entity: 'tank_v', textures: { body: 'good.dds' } }, 'GEN_SKIN_STEM_UNKNOWN');
refused('skin entity unknown', 'opSkin', { id: 'winter', entity: 'tank_q', textures: { tank_q: 'good.dds' } }, 'GEN_SKIN_ENTITY_UNKNOWN');
{ const N = 'resource/entity/humanskin/ger_x/';
  const c = good('skin humanskin copy, diffuse replaced', 'opSkin', { id: 'ger_x', like: 'ger_com', textures: { diffuse: 'big.dds' } },
    { [N + 'ger_x.def']: s => s.includes('{Extension "ger_x.mdl"}'), [N + 'skin.mtl']: s => s.includes('{diffuse "ger_x"}') && s.includes('{bump "ger_x_bp"}') });
  ok('skin: diffuse replaced, bump / variant / ply byte for byte under new names', same(c.dirty.get(N + 'ger_x.dds'), fs.readFileSync(path.join(ST, 'big.dds'))) && same(c.dirty.get(N + 'ger_x_bp.dds'), BP) && same(c.dirty.get(N + 'ger_x#d.dds'), DDS64) && c.dirty.has(N + 'ger_x.mdl') && c.dirty.has(N + 'skin.ply'), [...c.dirty.keys()].join(' '));
  ok('skin: other size is a warning', c.rep.counts.WARN_GEN_SKIN_SIZE === 1, JSON.stringify(c.rep.counts)); }
{ const c = good('skin vehicle variant + texmod', 'opSkin', { id: 'winter', entity: 'tank_v', textures: { tank_v: 'good.dds' }, texmod: true },
    { 'resource/entity/-vehicle/tank_v/tank_v.def': s => s.includes('{texmod "winter"}') && s.includes('{Extension "tank_v.mdl"}') });
  ok('skin: <texture>#<id>.dds written', same(c.dirty.get('resource/entity/-vehicle/tank_v/tank_v#winter.dds'), fs.readFileSync(path.join(ST, 'good.dds'))) && infos(c).includes('GEN_SKIN_FULL_COPY'), [...c.dirty.keys()].join(' ')); }

// ---- stuffmodel
refused('stuffmodel like missing', 'opStuffModel', { id: 'my_inv', like: 'nope' }, 'GEN_STUFFMODEL_LIKE_MISSING');
refused('stuffmodel item missing', 'opStuffModel', { id: 'my_inv', like: 'mg42', item: 'nosuchgun' }, 'GEN_STUFFMODEL_ITEM_MISSING');
refused('stuffmodel camera fov 500', 'opStuffModel', { id: 'my_inv', like: 'mg42', camera: { fov: 500 } }, 'GEN_STUFFMODEL_VALUE');
refused('stuffmodel id taken', 'opStuffModel', { id: 'mg42', like: 'mg42' }, 'GEN_STUFFMODEL_EXISTS');
{ const N = 'resource/entity/inventory/-weapon/my_inv/';
  const c = good('stuffmodel copy for mg42', 'opStuffModel', { id: 'my_inv', like: 'mg42', item: 'mg42', camera: { fov: 30, origin: '1 2 3' } },
    { [N + 'my_inv.def']: s => s.includes('{Extension "my_inv.mdl"}') && s.includes('{item "mg42"}'), [N + 'my_inv.mdl']: s => s.includes('{fov 30}') && s.includes('{origin 1 2 3}') && s.includes('{lookat 0 0 0}'),
      [STUFF + 'mgun/mg42']: s => s.includes('{entity "my_inv"}') && !s.includes('{entity "mg42"}') });
  ok('stuffmodel: mesh byte for byte, FULL_COPY info', same(c.dirty.get(N + 'mg42.ply'), PLY) && infos(c).includes('GEN_STUFFMODEL_FULL_COPY')); }

// ---- mapinfo
refused('mapinfo map missing', 'opMapInfo', { map: 'multi/nope', set: { maxPlayers: 4 } }, 'GEN_MAPINFO_MISSING');
refused('mapinfo maxPlayers 99', 'opMapInfo', { map: 'multi/m1', set: { maxPlayers: 99 } }, 'GEN_MAPINFO_VALUE');
refused('mapinfo min above max', 'opMapInfo', { map: 'multi/m1', set: { minPlayers: 4, maxPlayers: 2 } }, 'GEN_MAPINFO_VALUE');
refused('mapinfo texMod x', 'opMapInfo', { map: 'multi/m1', set: { texMod: 'x' } }, 'GEN_MAPINFO_VALUE');
refused('mapinfo empty set', 'opMapInfo', { map: 'multi/m1', set: {} }, 'GEN_MAPINFO_ARGS');
refused('mapinfo on GoH', 'opMapInfo', { map: 'multi/m1', set: { maxPlayers: 4 } }, 'GEN_MAPINFO_AS2_ONLY', G, 'goh');
{ const c = good('mapinfo values', 'opMapInfo', { map: 'multi/m1', set: { maxPlayers: 4, texMod: 1, ranked: true, minPlayers: 2 } },
    { 'resource/map/multi/m1/map.info': s => /\{maxPlayers 4\}/.test(s) && !/maxPlayers 2/.test(s) && /\{texMod 1\}/.test(s) && /\{ranked\}/.test(s) && /\{minPlayers 2\}/.test(s) });
  const n = sdlwrite.find(sdlwrite.parse(c.dirty.get('resource/map/multi/m1/map.info')), 'game/maxPlayers');
  ok('mapinfo: maxPlayers found by path', !!n); }
{ const c = run('opMapInfo', { map: 'multi/m1', set: { lobbyColor: 3 } }); ok('mapinfo unknown key: written, warned', c.rep.counts.WARN_GEN_MAPINFO_KEY_UNCHECKED === 1 && /\{lobbyColor 3\}/.test(c.dirty.get('resource/map/multi/m1/map.info').toString('latin1')), JSON.stringify(c.rep.counts)); }

// ---- the CLI: --plan writes nothing and shows the lines; a real run writes only under --out; staged files from the spec's folder
{
  const spec = path.join(ST, 'all.json'), out = path.join(W, 'cli_out');
  fs.writeFileSync(spec, JSON.stringify({ name: 'p', ops: [
    { op: 'gun', name: 'my_mg', like: 'mg42', class: 'mg', rof: 1500 }, { op: 'sound', id: 'weapon/shot/my_mg', files: ['float.wav'] },
    { op: 'gun', name: 'my_mg_s', like: 'mg42', class: 'mg', fire_sound: 'my_mg' }, { op: 'mapinfo', map: 'multi/m1', set: { maxPlayers: 6 } }] }));
  const cli = more => { const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'gen.js'), spec, '--target', 'as64', '--game', G, '--out', out, '--no-stat', '--no-gate', ...more], { encoding: 'utf8' }); return { status: r.status, t: (r.stdout || '') + (r.stderr || '') }; };
  const p = cli(['--plan']);
  ok('--plan: ops clean', /^0 findings$/m.test(p.t), p.t.slice(-1200));
  ok('--plan shows the changed lines', /GEN_PLAN_WRITE .*mgun\/my_mg \(new file\)/.test(p.t) && /GEN_PLAN_WRITE .*map\.info \+\d+:\s+\{maxPlayers 6\}/.test(p.t) && /sound: writes 1 file\(s\): resource\/sound\/weapon\/shot\/my_mg\/float\.wav/.test(p.t), p.t.slice(0, 1500));
  ok('--plan writes nothing', !fs.existsSync(path.join(out, 'resource')), out);
  const before = fs.readdirSync(G, { recursive: true }).length, r = cli([]);
  ok('run: clean, files under --out', r.status === 0 && fs.existsSync(path.join(out, 'resource/set/stuff/mgun/my_mg_s')) && !!safeWav(fs.readFileSync(path.join(out, 'resource/sound/weapon/shot/my_mg/float.wav'))), r.t.slice(-1200));
  ok('run: the game fixture is untouched', fs.readdirSync(G, { recursive: true }).length === before && fs.readFileSync(path.join(G, 'resource/map/multi/m1/map.info'), 'latin1').includes('maxPlayers 2'));
}

console.log(bad ? bad + ' FAILED' : 'all ok');
process.exit(bad ? 1 : 0);
