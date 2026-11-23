// GUI-EXT missions, the Gates of Hell side of the card "Make a single-player mission": the GoH writer, its read-back and its Remove.
// spmis.plan places every group and goal on the GoH view (the same plan as AS2); spmis.missionText renders the .mi, and this file turns
// it into the GoH stock form below, counting every change (a count that differs stops the write: no half-changed mission). Every form
// was read from the stock GoH missions through lib/vfs (63 missions, resource/map/single/**, 2026-11-23) [V stock], and every .mi is
// checked against spgohmodel.js (key sets of the 63) before a byte is written. Nothing of it was tried in the game yet [T].
//   sides     Players {user 0}{alias 0 "player"}{alias 1 "playerAlly"}{alias 2 "enemyAI"}{alias 3 "neutral"} + the diplomacy rows
//             1 2 1 0 1 1 1 1 / 2 1 1 0 1 1 1 1 / 1 1 1 0 1 1 1 1 / 0 0 0 1 1 1 1 1 / 4x 1 1 1 1 1 1 1 1 (the most common full set: 16 missions,
//             e.g. 01-rus_skirmish/*, 04-usa/*; that matrix in 33 of 63). The player's units stand on Player 1 (playerAlly; 4826 stock units
//             tagged player, 18 on Player 0) and autoassign hands them to user 0 (stock autoassign targets: P1 2031, P0 1218); the enemy is
//             Player 2 (enemyAI; 8709 stock enemy units). So {Player 2}<->{Player 1} against the AS2 form, and the capture term counts
//             {player "2"}.
//   rest      {Fog 0} (63 of 63), {EntityManager {Enabled}\n\t} as stock lays it out, Brain {Properties {control user}{move_mode hold}
//             {advance_ratio 0.5}{retreat_ratio 4}} (player, 7883) and without control user (enemy, 8123), actor_state {control user}
//             {fire_mode open}{move_mode hold}{weapon_prepare on}{ai_move {mode enable}}{movement {speed normal}} (the stock user form, 1019;
//             speed normal the most common inner value, 436), goal markers Entity "pointer" (resource/entity/service/pointer/pointer.def;
//             GoH has no skirmish_pointer) with only a Position, tagged "pointer" + a name, {point <name>} in the task (372 of 431).
//   files     resource/map/single/<c>/<m>/: the base map's files (map map.net map.ply map.grs map.omask .materials minimap.dds preview.dds
//             header.dds header_interface.png, the ones the base has), 0.mi (CRLF), interface.set `{location\r\n\t{level 0}\r\n\t{level_set
//             1}\r\n}` (no CRLF at the end, as stock). Campaign resource/map/single/<c>/interface.set `{location\r\n\t{side <army>}\r\n\t
//             {enableProgression 0}\r\n\t{background\r\n\t\t{media ""\r\n\t\t\t{file "/music/<m>" loop}\r\n\t\t}\r\n\t}\r\n}` (8 of 10 stock
//             campaigns byte for byte; the other 2 add {menu ..}): <m> = spec.music, else the stock theme of that side (rus russian_theme,
//             ger panzerlied, fin fin_orchestra, usa usa_orchestra; 01-rus 02-ger 03-fin 04-usa), else main_theme (00-bootcamp); a name
//             with no resource/music/<m>.wav|mp3|ogg is refused (SPGOH_MUSIC), a default the view lacks leaves the block out. Texts: .pot files under
//             the mod's localizations/default/ (the GoH vfs mounts them at resource/, lib/vfs), interface/text/mission/single/<c>/<m>.pot
//             and <c>/campaign.pot, LF line ends (120 of 121 stock mission .pot), the stock header, entries msgctxt "mission/single/<c>/
//             <m>/<key>" msgid "<text>" msgstr "" (keys name name_big date place story outro_completed outro_failed as stock, start, the
//             goal ids, lose_timer). No voice files: no stock GoH mission ships story / outro wavs. spmis.json (the manifest) as AS2.
//   side      any army word. The game reads a campaign's {side} (or {menu}) only as the army the single-player menu lists it under (a
//             button per word: picture /interface/skin/game/button/faction/<army>, text mp/army/<army>) and as the army the `side`
//             mission term compares (this card writes no side term) [I]. Stock has faction/eng.png and mp/army/eng (dlg_mp.pot), so eng
//             lists like the others; a word with no picture or no text is written and said (SPGOH_SIDE_ART, SPGOH_SIDE_TEXT) [I how the
//             menu draws a missing picture].
//   light     {Environment} = spec.environment when resource/set/environment/<it>.set is in the view; else the base map's own (stock
//             missions name 65 sets, every one present); else an AS2 name is mapped (winter/snow/blizzard -> goh/multi/west/winter/day_1,
//             autumn/fall -> .../autumn/day_1, night -> .../summer/night_1, else .../summer/day_1, the set stock missions use most after
//             goh/black, 49), else the first set of the view; said as SPGOH_ENV_MAPPED. Refused (SPGOH_ENV) only when the view has none.
//   banner    header_interface.png (the mission list banner, GHUI-113; 63 of 63 stock: 1024x600 PNG RGBA 8 bit): spec.banner (a .png file
//             the user picked, read as is; another size is said, SPGOH_BANNER_SIZE), else a plain one made here (1024x600 RGBA, one
//             colour; SPGOH_BANNER_PLAIN). The base map's own banner is never copied (game art).
//   not written, by evidence: achievements (63 of 63 stock name the game's own Steam achievements per level; the game reads them only
//             to draw the list's stars and to unlock with progression [I]: a
//             mod can not add a Steam achievement, and stock names would hand out the game's). mission_options (31 of 63: the doctrine
//             select): the game hands the picked tag only to the mission's own `mission_option` term (2 stock uses),
//             and the missions this card writes have no such term and no buy menu, so the choice would change nothing. map.info (26 of
//             63, {game {maxPlayers 4}}): read only when the mission is played through the multiplayer lobby [I]; the
//             missions this card writes hold units for one player.
//   refused   a form spgohmodel.js does not hold (SPMIS_UNCONFIRMED).
//   vehicle group as the escort or as lose.unit: written (plan vehOut). GoH stock tests a vehicle that is out with
//             {state "not operatable"} on an entities selector (81 uses, 16 missions, e.g. 02-ger-west/1944_06_saint_lo_hills) and a
//             working one with {state "operatable"} (1428 uses) [I GoH reads a killed crewed vehicle so; T in game].
// Writes go through lib/modwrite only: every target guarded inside the mod, a restore point per file first, then the files.
// Author: Imperator_Aug (ARSENAL, ia-f88c8f4a)
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const SP = require('../../../spmis/spmis');
const MW = require('../../../lib/modwrite');
const MODEL = require('./spgohmodel');

const LOC = 'localizations/default/interface/text/mission/single';
const SIDES = ['ger', 'rus', 'usa', 'fin'];   // {side ..} of the stock GoH campaign interface.set files (eng: picture and text are there too)
const ARMY_RE = /^[a-z][a-z0-9_]{0,31}$/;
const POINTER = 'resource/entity/service/pointer/pointer.def';
const ENV_DIR = 'resource/set/environment/';
const ENV_DEFAULT = 'goh/multi/west/summer/day_1';
const ENV_WORDS = [[/winter|snow|blizzard/i, 'goh/multi/west/winter/day_1'], [/autumn|fall/i, 'goh/multi/west/autumn/day_1'], [/night/i, 'goh/multi/west/summer/night_1']];
const MUSIC = { rus: 'russian_theme', ger: 'panzerlied', fin: 'fin_orchestra', usa: 'usa_orchestra' }, MUSIC_ANY = 'main_theme';
const MUSIC_RE = /^[A-Za-z0-9_][A-Za-z0-9_/-]{0,79}$/;
const BANNER_W = 1024, BANNER_H = 600, BANNER_MAX = 15 * 1024 * 1024;
const COPY = /^(map|map\.net|map\.ply|map\.grs|map\.omask|\.materials|mtl\d+\.mtl|minimap\.dds|preview\.dds|header\.dds)$/;   // header_interface.png: never copied (no game art; header: banner)
const DIPL = ['1 2 1 0 1 1 1 1', '2 1 1 0 1 1 1 1', '1 1 1 0 1 1 1 1', '0 0 0 1 1 1 1 1', ...Array(4).fill('1 1 1 1 1 1 1 1')];
const crlf = s => Buffer.from(String(s).replace(/\r?\n/g, '\r\n'), 'utf8');
const no = (code, msg) => { throw new SP.Refuse(code, msg, 2); };

// ---- the .mi: spmis.missionText, then the GoH forms, each change counted
function count(t, re) { return (t.match(re) || []).length; }
function swap(t, re, to, want, what) {
  const n = count(t, re);
  if (n !== want) throw new Error(`spgoh: ${what}: ${n} found, ${want} expected; nothing written`);
  return t.replace(re, to);
}
function missionText(P) {
  const units = side => P.groups.filter(G => G.side === side).reduce((n, G) => n + G.units.length, 0);
  const np = units('player'), ne = units('enemy'), humans = P.groups.reduce((n, G) => n + G.units.filter(u => u.kind === 'human').length, 0);
  const ptN = P.pointer === false ? 0 : P.objs.filter(o => o.z && ['capture', 'hold', 'reach', 'escort'].includes(o.type)).length;
  let t = SP.missionText(P);
  t = swap(t, /^\t\t\{Player ([12])\}$/gm, (m, d) => `\t\t{Player ${d === '2' ? 1 : 2}}`, np + ne, 'unit sides');
  t = swap(t, /\{player "1"\}/g, '{player "2"}', P.objs.filter(o => o.type === 'capture').length, 'capture side');
  t = swap(t, /^(\t\t\t\{move_mode hold\}\n)(\t\t\}\n\t\}\n)/gm, '$1\t\t\t{advance_ratio 0.5}\n\t\t\t{retreat_ratio 4}\n$2', humans, 'Brain');
  t = swap(t, /^(\t+)\{control user\}\n\1\{move_mode hold\}\n\1\{weapon_prepare on\}\n/gm,
    (m, i) => `${i}{control user}\n${i}{fire_mode open}\n${i}{move_mode hold}\n${i}{weapon_prepare on}\n${i}{ai_move\n${i}\t{mode enable}\n${i}}\n${i}{movement\n${i}\t{speed normal}\n${i}}\n`, 1 + P.reinf.length, 'actor_state');
  t = swap(t, /^\t\{Entity "skirmish_pointer" /gm, '\t{Entity "pointer" ', ptN, 'goal markers');
  const tail = ['\t{Players', '\t\t{user 0}', '\t\t{alias 0 "player"}', '\t\t{alias 1 "playerAlly"}', '\t\t{alias 2 "enemyAI"}', '\t\t{alias 3 "neutral"}', '\t\t{diplomacy',
    ...DIPL.map(r => '\t\t\t' + r), '\t\t}', '\t}', '\t{Fog 0}', '\t{EntityManager {Enabled}', '\t}', '}', ''].join('\n');
  t = swap(t, /\t\{Players\n[\s\S]*\n\}\n$/, tail, 1, 'Players');
  // the sides as planned: the player's units on 1, the enemy's on 2
  if (count(t, /^\t\t\{Player 1\}$/gm) !== np || count(t, /^\t\t\{Player 2\}$/gm) !== ne) throw new Error('spgoh: unit sides do not add up; nothing written');
  return t;
}

// ---- .pot texts (LF, the stock header; GHLOC-01)
const potEsc = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
function potText(project, ctx, texts) {
  const head = ['#, fuzzy', 'msgid ""', 'msgstr ""', `"Project-Id-Version: ARSENAL (${project})\\n"`, '"POT-Creation-Date: \\n"', '"PO-Revision-Date: \\n"', '"Last-Translator: \\n"',
    '"Language-Team: \\n"', '"Language: en\\n"', '"MIME-Version: 1.0\\n"', '"Content-Type: text/plain; charset=UTF-8\\n"', '"Content-Transfer-Encoding: 8bit\\n"',
    '"Plural-Forms: nplurals=INTEGER; plural=EXPRESSION;\\n"', ''].join('\n');
  return Buffer.from(head + '\n' + Object.entries(texts).map(([k, v]) => `msgctxt "${ctx}/${k}"\nmsgid "${potEsc(v)}"\nmsgstr ""\n`).join('\n'), 'utf8');
}

// ---- lists the card offers (plain names, sorted): light sets (set/environment/<name>.set) and music (/music/<name>)
const LISTS = new WeakMap();
function lists(v) {
  let L = LISTS.get(v); if (L) return L;
  const envs = [], music = new Set(), armyText = new Set(), faction = new Set();
  for (const k of v.files.keys()) {
    let m;
    if (k.startsWith(ENV_DIR) && k.endsWith('.set')) envs.push(k.slice(ENV_DIR.length, -4));
    else if ((m = /^resource\/music\/(.+)\.(wav|mp3|ogg)$/.exec(k))) music.add(m[1]);
    else if ((m = /^resource\/interface\/skin\/game\/button\/faction\/([^/.]+)\.[a-z0-9]+$/.exec(k))) faction.add(m[1]);
  }
  L = { envs: envs.sort(), music: [...music].sort(), faction, armyText };
  // the mp/army/<word> texts of the game and mod (.pot outside interface/text/mission/), read once per view
  for (const k of v.files.keys()) {
    if (!/^resource\/interface\/text\/.+\.pot$/.test(k) || k.includes('/mission/')) continue;
    let t = ''; try { t = v.read(k).toString('utf8'); } catch (e) { continue; }
    if (!t.includes('mp/army/')) continue;
    for (const m of t.matchAll(/msgctxt "mp\/army\/([^"]+)"/g)) armyText.add(m[1].toLowerCase());
  }
  LISTS.set(v, L);
  return L;
}
// the light set: asked, else the base map's own, else an AS2 name mapped (header: light). -> {env, from} (from: the name not found)
function envOf(v, asked, baseEnv) {
  const has = e => !!e && v.has(`${ENV_DIR}${e}.set`);
  if (has(asked)) return { env: asked };
  const from = asked || '';
  if (!asked && has(baseEnv)) return { env: baseEnv };
  for (const [re, to] of ENV_WORDS) if (re.test(from) && has(to)) return { env: to, from };
  if (has(baseEnv)) return { env: baseEnv, from };
  if (has(ENV_DEFAULT)) return { env: ENV_DEFAULT, from };
  const any = lists(v).envs.find(e => e !== 'goh/black') || lists(v).envs[0];
  if (any) return { env: any, from };
  return no('SPGOH_ENV', `environment ${from || 'none'}: the game and mod have no resource/set/environment/*.set at all`);
}
// the campaign music: asked (refused when the view has no such file), else the stock theme of the side, else none
function musicOf(v, asked, army) {
  const has = m => lists(v).music.includes(m);
  if (asked) {
    const m = String(asked).replace(/^\/?music\//i, '');
    if (!MUSIC_RE.test(m) || !has(m)) no('SPGOH_MUSIC', `music "${asked}": the game and mod have no resource/music/${m}.wav, .mp3 or .ogg`);
    return { music: m };
  }
  for (const m of [MUSIC[army], MUSIC_ANY]) if (m && has(m)) return { music: m };
  return { music: '' };
}
// ---- the banner: a PNG made here (one colour, RGBA 8 bit, the stock size) or the user's own file checked as a PNG
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const l = Buffer.alloc(4), c = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type, 'latin1'), data]); l.writeUInt32BE(data.length); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function plainBanner(rgba = [38, 42, 46, 255], w = BANNER_W, h = BANNER_H) {
  const row = Buffer.alloc(1 + w * 4); for (let x = 0; x < w; x++) row.set(rgba, 1 + x * 4);
  const raw = Buffer.concat(Array(h).fill(row)), ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// a PNG's size from its IHDR, or null when it is no PNG
function pngSize(b) { return b && b.length > 33 && b.subarray(0, 8).equals(PNG_SIG) && b.toString('latin1', 12, 16) === 'IHDR' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null; }
function userBanner(p) {
  const f = String(p || '');
  if (!path.isAbsolute(f) || !/\.png$/i.test(f)) no('SPGOH_BANNER', `banner "${f}": the full path of a .png file`);
  let st; try { st = fs.statSync(f); } catch (e) { st = null; }
  if (!st || !st.isFile()) no('SPGOH_BANNER', `banner "${f}": no such file`);
  if (st.size > BANNER_MAX) no('SPGOH_BANNER', `banner "${f}": ${st.size} bytes, over ${BANNER_MAX}`);
  const buf = fs.readFileSync(f), s = pngSize(buf);
  if (!s) no('SPGOH_BANNER', `banner "${f}": not a PNG picture`);
  return { buf, size: s };
}

// ---- the plan: spmis.plan on the GoH view, the GoH .mi and every file with its bytes. Refusals are spmis Refuse (the card says them).
// P.notes: what was chosen for the user and is said (light set mapped, menu picture or text missing, plain banner, music left out)
function plan(v, spec) {
  const P = SP.plan(spec, v, { vehOut: true }), notes = [], L = lists(v);
  if (!ARMY_RE.test(P.army)) no('SPGOH_SIDE', `player.army "${P.army}": an army word (letters, digits, _)`);
  if (!L.faction.has(P.army)) notes.push({ code: 'SPGOH_SIDE_ART', rel: `resource/interface/skin/game/button/faction/${P.army}.png`, msg: `no menu picture for side ${P.army}`, p: { army: P.army } });
  if (!L.armyText.has(P.army)) notes.push({ code: 'SPGOH_SIDE_TEXT', rel: '', msg: `no text mp/army/${P.army}`, p: { army: P.army } });
  const E = envOf(v, spec.environment ? P.environment : '', P.base.env);
  if (E.from !== undefined) notes.push({ code: 'SPGOH_ENV_MAPPED', rel: `${ENV_DIR}${E.env}.set`, msg: `light set ${E.from || 'none'} is not in the game; ${E.env} used`, p: { from: E.from || '-', to: E.env } });
  P.environment = E.env;
  const M = musicOf(v, spec.music, P.army);
  if (!M.music) notes.push({ code: 'SPGOH_MUSIC_NONE', rel: '', msg: 'no campaign music: the game has none of the stock themes', p: {} });
  P.music = M.music;
  const B = spec.banner ? userBanner(spec.banner) : null;
  if (B && (B.size.w !== BANNER_W || B.size.h !== BANNER_H)) notes.push({ code: 'SPGOH_BANNER_SIZE', rel: '', msg: `banner ${B.size.w}x${B.size.h}, stock ${BANNER_W}x${BANNER_H}`, p: { w: B.size.w, h: B.size.h } });
  P.pointer = v.has(POINTER);
  const mi = missionText(P);
  const bad = SP.unconfirmed(mi, MODEL);
  if (bad.length) no('SPMIS_UNCONFIRMED', `forms stock Gates of Hell never shows: ${bad.join('; ')}`);
  const dir = `resource/map/single/${P.campaign}/${P.name}`, files = [];
  for (const k of P.base.files) {
    const n = k.slice(P.base.dir.length + 1);
    if (!COPY.test(n)) continue;
    let buf = v.read(k);
    if (n === 'map') { const re = new RegExp(P.base.rel.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'gi'); buf = Buffer.from(buf.toString('latin1').replace(re, dir.slice('resource/'.length)), 'latin1'); }
    files.push({ rel: `${dir}/${n}`, buf, copied: true });
  }
  if (B) files.push({ rel: `${dir}/header_interface.png`, buf: B.buf, banner: 'user' });
  else { files.push({ rel: `${dir}/header_interface.png`, buf: plainBanner(), banner: 'plain' }); notes.push({ code: 'SPGOH_BANNER_PLAIN', rel: `${dir}/header_interface.png`, msg: 'a plain banner made (no game art is copied)', p: {} }); }
  files.push({ rel: `${dir}/0.mi`, buf: crlf(mi), mi: true });
  files.push({ rel: `${dir}/interface.set`, buf: Buffer.from('{location\r\n\t{level 0}\r\n\t{level_set 1}\r\n}', 'utf8') });
  files.push({ rel: `resource/map/single/${P.campaign}/interface.set`, buf: Buffer.from(campaignSet(P.army, P.music), 'utf8'), shared: true });
  files.push({ rel: `${LOC}/${P.campaign}/campaign.pot`, buf: potText('campaign', `mission/single/${P.campaign}/campaign`, { title: '', name: P.campaignTitle }), shared: true });
  files.push({ rel: `${LOC}/${P.campaign}/${P.name}.pot`, buf: potText(P.name, `mission/single/${P.campaign}/${P.name}`, P.texts) });
  P.notes = notes;
  return { P, mi, files, notes };
}
// the campaign interface.set in the stock form (header: files), the background block only with music
function campaignSet(army, music) {
  const bg = music ? `\t{background\r\n\t\t{media ""\r\n\t\t\t{file "/music/${music}" loop}\r\n\t\t}\r\n\t}\r\n` : '';
  return `{location\r\n\t{side ${army}}\r\n\t{enableProgression 0}\r\n${bg}}`;
}
// what the read-back compares (plain data: it crosses to the worker)
function expect(P, mi) {
  const side = s => P.groups.filter(G => G.side === s).reduce((n, G) => n + G.units.length, 0);
  return { campaign: P.campaign, name: P.name, army: P.army, base: P.base.rel, texts: P.texts, campaignTitle: P.campaignTitle, environment: P.environment, music: P.music || '', player: side('player'), enemy: side('enemy'), tasks: P.objs.map(o => String(o.id)), mi };
}

// ---- the write: rel -> bytes for the files the plan puts down (a campaign file that is there stays unless force), then the manifest.
// Guard every target, a restore point per file (lib/modwrite), then the files. Returns what was written and made.
const MAN = (c, m) => `resource/map/single/${c}/${m}/${SP.MANIFEST}`;
function filesToWrite(mod, r, force) {
  return r.files.filter(f => !(f.shared && fs.existsSync(path.join(mod, f.rel)) && !force));
}
// r: {files, X: expect(..)} (plain data from the worker)
function write(mod, r, spec, force, opt) {
  const P = r.X, list = filesToWrite(mod, r, force), mrel = MAN(P.campaign, P.name);
  const prev = SP.readManifest(path.join(mod, 'resource', 'map', 'single', P.campaign, P.name));
  const created = new Set(prev ? prev.created : []), dirs = new Set(prev ? prev.dirs : []);
  const rels = list.map(f => f.rel).concat([mrel]);
  for (const rel of rels) {
    MW.guardFile(mod, path.join(path.resolve(mod), ...rel.split('/')), opt);
    if (!fs.existsSync(path.join(mod, rel))) created.add(rel);
    for (let d = path.posix.dirname(rel); d && d !== '.'; d = path.posix.dirname(d)) if (!fs.existsSync(path.join(mod, d))) dirs.add(d);
  }
  const points = MW.restorePoints(mod, rels, 'spmis goh write', opt);
  const man = { tool: 'spmis', v: 1, mission: P.name, campaign: P.campaign, title: P.texts.name, map: P.base, exe: 'goh',
    spec, written: list.map(f => f.rel), created: [...created].sort(), dirs: [...dirs].sort() };
  MW.writeFiles(mod, list.map(f => [f.rel, f.buf]).concat([[mrel, crlf(JSON.stringify(man, null, 1) + '\n')]]), opt);
  return { written: rels, points: points.length, created: man.created, dirs: man.dirs };
}

// ---- read-back: the written mission through the GoH view of game + mod (a view opened after the write), compared with the plan.
// R: the card's own readers (sp.js potKeys). Returns [{code, rel, msg}] (empty = the game view reads what was planned)
function readBack(v, X, R) {
  const out = [], dir = `resource/map/single/${X.campaign}/${X.name}`, add = (rel, msg) => out.push({ code: 'SPGOH_READBACK', rel, msg });
  const mrel = `${dir}/0.mi`;
  if (!v.has(`${dir}/map`)) add(`${dir}/map`, 'the game view has no map file in the mission folder');
  if (!v.has(mrel)) { add(mrel, 'the game view has no 0.mi in the mission folder'); return out; }
  const brel = `${dir}/header_interface.png`;
  if (!v.has(brel) || !pngSize(v.read(brel))) add(brel, 'the game view has no PNG banner in the mission folder');
  const mi = v.read(mrel).toString('utf8');
  if (mi !== X.mi.replace(/\r?\n/g, '\r\n')) add(mrel, 'the 0.mi the game view reads differs from the one planned');
  const bad = SP.unconfirmed(mi, MODEL); if (bad.length) add(mrel, 'forms stock never shows: ' + bad.join('; '));
  const p1 = count(mi, /^\t\t\{Player 1\}\r?$/gm), p2 = count(mi, /^\t\t\{Player 2\}\r?$/gm);
  if (p1 !== X.player || p2 !== X.enemy) add(mrel, `units read: ${p1} on the player's side, ${p2} on the enemy's; planned ${X.player} and ${X.enemy}`);
  const tasks = [...mi.matchAll(/^\t\t\t\{"([^"]+)"\r?\n\t\t\t\t\{desc "\$\/[^"]*"\}/gm)].map(m => m[1]);
  if (tasks.join(',') !== X.tasks.join(',')) add(mrel, `goals read: ${tasks.join(', ') || 'none'}; planned ${X.tasks.join(', ')}`);
  if (!new RegExp(`\\{Environment "${X.environment.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"\\}`).test(mi)) add(mrel, 'the environment read is not the planned ' + X.environment);
  const ctx = `mission/single/${X.campaign}/${X.name}/`.toLowerCase(), clean = s => String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const T = R.potKeys(v, new RegExp('^mission/single/' + X.campaign.replace(/[-]/g, '\\-') + '/'), /\/mission\//);
  // the card's .pot reader keeps the escapes as written (\" \n), so the text is compared in its written form
  for (const [k, txt] of Object.entries(X.texts)) if (clean(potEsc(txt)) && T.get(ctx + k.toLowerCase()) !== clean(potEsc(txt))) add(`${LOC}/${X.campaign}/${X.name}.pot`, `text ${k}: the game view reads ${JSON.stringify(T.get(ctx + k.toLowerCase()) || '')}`);
  const cs = `resource/map/single/${X.campaign}/interface.set`;
  if (!v.has(cs)) add(cs, 'the game view has no campaign interface.set');
  if (!v.has(`resource/interface/text/mission/single/${X.campaign}/campaign.pot`)) add(`${LOC}/${X.campaign}/campaign.pot`, 'the game view has no campaign.pot');
  return out;
}
// the side the campaign file names (a kept campaign file may name another army): '' when unreadable
function campaignSide(mod, c) { try { const m = /\{side (\w+)\}/.exec(fs.readFileSync(path.join(mod, 'resource', 'map', 'single', c, 'interface.set'), 'utf8')); return m ? m[1] : ''; } catch (e) { return ''; } }

// ---- Remove: only what the manifest says this card made, with a restore point per file first. A campaign file stays while another
// mission folder of the campaign is left, and passes to a generated one's manifest (as spmis.remove does for AS2)
function remove(mod, name, opt) {
  const hit = SP.generated(mod).find(g => g.mission === name && g.exe === 'goh');
  if (!hit) no('SPMIS_NOT_GENERATED', `${name}: no Gates of Hell mission folder with ${SP.MANIFEST} in ${mod}; only missions this card wrote are removed`);
  const campDir = path.join(mod, 'resource', 'map', 'single', hit.campaign), dir = path.join(campDir, name), man = SP.readManifest(dir);
  const others = fs.readdirSync(campDir, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== name).map(d => d.name);
  const shared = new Set([`resource/map/single/${hit.campaign}/interface.set`, `${LOC}/${hit.campaign}/campaign.pot`]);
  const heir = others.map(m => ({ m, man: SP.readManifest(path.join(campDir, m)) })).find(x => x.man);
  const pass = [], gone = [], kept = [];
  for (const rel of man.created) {
    if (!/^(resource|localizations)\//.test(rel) || rel.split('/').includes('..')) continue;
    if (shared.has(rel) && others.length) { pass.push(rel); kept.push(rel); continue; }
    if (fs.existsSync(path.join(mod, rel))) gone.push(rel);
  }
  for (const rel of gone) MW.guardFile(mod, path.join(path.resolve(mod), ...rel.split('/')), opt);
  const hf = heir && pass.length ? path.join(campDir, heir.m, SP.MANIFEST) : null;
  if (hf) MW.guardFile(mod, hf, opt);
  MW.restorePoints(mod, gone.concat(hf ? [path.relative(mod, hf).replace(/\\/g, '/')] : []), 'spmis goh remove', opt);
  for (const rel of gone) fs.rmSync(path.join(mod, rel), { force: true });
  if (hf) {
    const hm = heir.man;
    hm.created = [...new Set(hm.created.concat(pass))].sort(); hm.dirs = [...new Set((hm.dirs || []).concat(man.dirs.filter(d => !d.startsWith(`resource/map/single/${hit.campaign}/${name}`))))].sort();
    MW.writeFiles(mod, [[path.relative(mod, hf).replace(/\\/g, '/'), crlf(JSON.stringify(hm, null, 1) + '\n')]], opt);
  }
  let dirs = 0;
  for (const d of [...man.dirs].sort((a, b) => b.length - a.length)) { try { const p = path.join(mod, d); if (fs.readdirSync(p).length === 0) { fs.rmdirSync(p); dirs++; } } catch (e) { /* gone or not empty */ } }
  return { hit, files: gone.length, dirs, kept };
}

module.exports = { plan, expect, missionText, potText, filesToWrite, write, readBack, remove, campaignSide, lists, envOf, musicOf, plainBanner, pngSize, campaignSet,
  MAN, LOC, SIDES, MODEL, ENV_DEFAULT, BANNER_W, BANNER_H };
