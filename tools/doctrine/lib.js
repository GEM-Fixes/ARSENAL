// doctrine lib: the Men of War doctrine pack (vendored in data/) for ARSENAL. Used by doctrine.js (CLI) and the GUI ext "doctrine".
// data() -> pack; find(id) -> {kind, item}; voice(persona, event, seed, g, obj) -> line
// readBase(opts) -> {text, from, file, rel} : the bot file to start from (a file, a mod folder loose or in its paks, or the game through the vfs)
//   opts {base, mod, gameDir, exe}: exe = the vfs exe ('as64' | 'mowas_2' | 'mowas2' | 'goh', lib/games) handed to vfs.build; no exe = as before
//   (as64 first on the shared AS2 install). AS2 games read script/multiplayer/bot.data.lua; exe 'goh' reads the GoH Conquest settings
//   script/multiplayer/modes/conquest/runtime_config.lua (CONQUEST): GoH has no bot.data.lua (GHMIS-66) [V listing of the GoH install].
// kindOf(text) -> 'robz' (has a BotConfig table: the larger replacement bot script) | 'conquest' (has a ConquestConfig table: the GoH
//   Conquest bot settings) | 'vanilla'. 'robz' is the pack's internal id; users see and type 'botconfig' (PUB / normProfile), the old id is
//   still accepted. Profile conquest: keys are paths under ConquestConfig (MAP.conquest); the file form is read and round-tripped on the
//   vanilla GoH file [I]; what the bot does with the numbers in a match is [T]. GoH's other modes (frontlines, battlezones, laststand) keep
//   their settings in code: no profile for them.
// writeMod(mod, text, gameDir, {profile, rel}?) writes rel (default: by the profile, else CONQUEST for a ConquestConfig file, else BOTDATA)
// under <mod>/resource; a GoH write that is not a Conquest config is refused; GoH takes a restore point first.
// plan(text, persona, profile, scale) -> {profile, changes:[{key, was, now, driver, line, why}], skipped:[{key, why}], traits, text}  (text = patched file)
// check(text, profile) -> {kind, profile, stamp, problems:[{level, code, msg}], keys}
// Mapping numbers are design guesses, not doctrine and not played: every change is tagged [T].
// Author: Imperator_Aug (ARSENAL, ia-e8a1cddd)
'use strict';
const fs = require('fs'), path = require('path');
const luatable = require('../botrecipe/luatable');

const DATA = require('./data/doctrine.json');
const TEXT = require('./data/text.json');
const ROBZ = require('./data/robz-botconfig.json');
const BOTDATA = 'script/multiplayer/bot.data.lua';
const CONQUEST = 'script/multiplayer/modes/conquest/runtime_config.lua';
const isConquestText = t => /(^|\n)[ \t]*ConquestConfig[ \t]*=/.test(t);

// code = stable id a page translates; arg = the one value the sentence names (a path, a persona), shown as is
const bad = (msg, code, arg) => Object.assign(new Error(msg), { status: 400, code: code || 'DOC_BAD', arg: arg == null ? '' : String(arg) });
// profile names: internal id -> the name users see; normProfile accepts both
// everything the lib returns (plan, check, profileInfo) uses the public name
const PUB = { robz: 'botconfig', botconfig: 'botconfig', vanilla: 'vanilla', conquest: 'conquest' };
const PROFILES = ['robz', 'vanilla', 'conquest'];
const normProfile = p => (p === 'botconfig' ? 'robz' : p);
const BIG = 'the larger replacement bot script (the one that keeps its settings in a BotConfig table)';
const data = () => DATA;
const KINDS = ['rules', 'personas', 'missions', 'voices', 'profiles'];

function find(id) {
  for (const k of KINDS.concat(['modern'])) { const it = (DATA[k] || []).find(x => x.id === id); if (it) return { kind: k, item: it }; }
  return null;
}

function voice(pid, key, seed, g, obj) {
  const p = DATA.personas.find(x => x.id === pid);
  if (!p) throw bad('Unknown persona: ' + pid + '. See "list personas".', 'DOC_NO_PERSONA', pid);
  const neutral = DATA.voices.find(x => x.id === 'neutral');
  const v = DATA.voices.find(x => x.id === p.voice) || neutral;
  const lines = [].concat(v.lines[key] || neutral.lines[key] || []);
  if (!lines.length) throw bad('No chat line for "' + key + '". Events: ' + Object.keys(neutral.lines).join(', ') + '.', 'DOC_NO_LINE', key);
  return lines[(Number(seed) || 0) % lines.length].split('{g}').join(g || 'First platoon').split('{obj}').join(obj || 'the objective');
}

// ---------- mapping: persona temperament -> bot settings ----------
// Baseline = the "universal" persona: it changes nothing. d = (persona value - universal value) / 0.5, factor = 1 + dir * strength * d * scale.
// mode 'ratio' (reserve_share): factor = (persona / universal) ^ (0.5 * scale).
const BASE = (DATA.personas.find(p => p.id === 'universal') || {}).temperament || { aggression: 0.5, reserve_share: 0.2, initiative: 0.6, caution: 0.5 };
const MAP = {
  robz: [
    ['DirAttackRatio', 'aggression', -1, 0.3, 'r2', 0.8, 3, 'A more aggressive bot attacks at lower local odds.'],
    ['AssaultRatio', 'aggression', -1, 0.3, 'r2', 0.8, 3, 'A more aggressive bot assaults the line at lower local odds.'],
    ['EarlyAssaultRatio', 'aggression', -1, 0.3, 'r2', 0.4, 3, 'Opening assaults go in at lower odds when aggressive.'],
    ['EarlyPush', 'aggression', 1, 0.5, 'int', 0, 1200, 'An aggressive bot keeps its early rush going longer (seconds).'],
    ['WaveTimeout', 'aggression', 1, 0.3, 'int', 60, 900, 'An aggressive bot keeps an attack going longer before calling it off.'],
    ['HoldMaxShare', 'reserve_share', 1, 0, 'ratio', 0.05, 0.8, 'More reserve: a bigger share of groups stays back on held flags.'],
    ['BackShare', 'reserve_share', 1, 0, 'ratio', 0.05, 0.8, 'More reserve: a bigger share of groups is kept behind the front.'],
    ['LaunchShare', 'caution', 1, 0.15, 'r2', 0.3, 1, 'A cautious bot waits until more of the attack force is present.'],
    ['EngageDist', 'caution', 1, 0.3, 'int', 400, 6000, 'A cautious bot stops to fight from further away (map units, 20 = 1 m).'],
    ['BoundStep', 'caution', -1, 0.3, 'int', 80, 1200, 'A cautious bot moves in shorter bounds (map units).'],
    ['DangerDist', 'caution', 1, 0.3, 'int', 400, 8000, 'A cautious bot stops sprinting further from known MGs and vehicles (map units).'],
    ['SmokeEvery', 'caution', -1, 0.3, 'int', 5, 300, 'A cautious bot uses smoke more often (seconds between smoke).'],
    ['SmokeAttackEvery', 'caution', -1, 0.3, 'int', 5, 300, 'A cautious bot smokes its attacks more often (seconds).'],
    ['UnderFireMaxMove', 'caution', -1, 0.3, 'int', 100, 3000, 'A cautious bot under fire only makes short moves (map units).'],
    ['AttackSpread', 'initiative', 1, 0.3, 'r2', 0.1, 2, 'More initiative: attacks come from wider apart directions (radians).'],
    ['GatherMax', 'initiative', -1, 0.3, 'int', 20, 400, 'More initiative: an attack waits less time to gather (seconds).'],
    ['SwitchMargin', 'initiative', -1, 0.3, 'r2', 1.1, 5, 'More initiative: the bot changes its main target more readily.'],
    ['ReorderPeriod', 'initiative', -1, 0.3, 'int', 30, 600, 'More initiative: attackers get fresh orders more often (seconds).'],
  ],
  vanilla: [
    ['MaxSquadSize', 'initiative', -1, 0.3, 'int', 2, 12, 'More initiative: the bot splits its squads into smaller groups.'],
    ['OrderRotationPeriod', 'initiative', -1, 0.4, 'int', 30000, 600000, 'More initiative: the bot re-issues its flag orders more often (milliseconds).'],
    ['FlagPriority.Captured', 'caution', 1, 0.6, 'r1', 0.1, 20, 'A cautious bot is more likely to pick a flag its side already holds.'],
    ['FlagPriority.Enemy', 'aggression', 1, 0.6, 'r1', 0.1, 20, 'An aggressive bot is more likely to pick an enemy flag.'],
    ['FlagPriority.Neutral', 'initiative', 1, 0.4, 'r1', 0.1, 20, 'More initiative: the bot is more likely to grab neutral flags.'],
  ],
  // GoH Conquest (modes/conquest/runtime_config.lua, keys under ConquestConfig; meanings from the file's own comments) [T]
  conquest: [
    ['AttackerWaves.MinUnits', 'aggression', 1, 0.3, 'int', 1, 20, 'An aggressive attacker sends bigger waves (fewest units in a wave).'],
    ['AttackerWaves.MaxUnits', 'aggression', 1, 0.3, 'int', 1, 30, 'An aggressive attacker sends bigger waves (most units in a wave).'],
    ['AttackerDynamicWaveOff.ForceReleaseSeconds', 'aggression', -1, 0.3, 'int', 60, 900, 'An aggressive attacker sends its next wave sooner at the latest (seconds).'],
    ['AttackerDynamicWaveOff.FirstCheckSeconds', 'initiative', -1, 0.3, 'int', 20, 600, 'More initiative: the attacker starts weighing the next wave sooner after one ends (seconds).'],
    ['AttackerDynamicWaveOff.RepeatPollIntervalSeconds', 'initiative', -1, 0.3, 'int', 5, 120, 'More initiative: the attacker re-checks for the next wave more often (seconds).'],
    ['DefenderCounterattack.ResponseChance', 'initiative', 1, 0.3, 'r2', 0.05, 1, 'More initiative: a defender answers a lost flag with a counterattack more often.'],
    ['DefenderCounterattack.ConfirmDelay', 'caution', 1, 0.3, 'int', 5000, 300000, 'A cautious defender waits longer before it answers a lost flag (milliseconds).'],
    ['DefenderCounterattack.MaxTotal', 'aggression', 1, 0.3, 'int', 0, 10, 'An aggressive defender counterattacks more times in one battle.'],
    ['AttackerFailure.NoProgress.PlayerDefenseRatio', 'caution', 1, 0.3, 'r2', 0.05, 1, 'A cautious attacker that takes no flag gives up sooner (a higher bar).'],
    ['OrderRotationPeriod', 'initiative', -1, 0.4, 'int', 30000, 600000, 'More initiative: squads get fresh orders more often (milliseconds).'],
  ],
};
// a value written as a number expression (2.5 * 60000) is read as one; the generator writes a plain number, [doctrine was] keeps the expression
const EXPR = new Set(['OrderRotationPeriod', 'DefenderCounterattack.ConfirmDelay']);
// the table a key path walks: robz BotConfig, conquest ConquestConfig, vanilla the globals (FlagPriority.Captured)
function keyAt(t, profile, key) {
  if (profile === 'robz') { const B = t.globals.BotConfig; return B && B.keyLine && B.keyLine[key] ? { line: B.keyLine[key], value: B.hash[key] } : null; }
  if (profile === 'conquest') {
    let tb = t.globals.ConquestConfig; const ks = key.split('.');
    for (const k of ks.slice(0, -1)) { tb = tb && tb.$t === 'table' ? tb.hash[k] : undefined; }
    const k = ks[ks.length - 1];
    return tb && tb.$t === 'table' && tb.keyLine[k] ? { line: tb.keyLine[k], value: tb.hash[k] } : null;
  }
  const top = key.split('.')[0]; return t.lines[top] ? { line: t.lines[top] } : null;
}
const ROUND = { int: v => String(Math.round(v)), r2: v => String(Math.round(v * 100) / 100), r1: v => String(Math.round(v * 10) / 10), ratio: v => String(Math.round(v * 100) / 100) };

function factor(row, temp, scale) {
  const [, drv, dir, str, kind] = row, t = Number(temp[drv]), b = Number(BASE[drv]);
  if (!isFinite(t)) return 1;
  if (kind === 'ratio') return b > 0 ? Math.pow(Math.max(t, 0.01) / b, 0.5 * scale) : 1;
  return Math.min(2.5, Math.max(0.4, 1 + dir * str * ((t - b) / 0.5) * scale));
}

// ---------- reading the base file ----------
function fromPaks(dir, want) {
  want = want || BOTDATA;
  const pak = require('../lib/pak'), R = path.join(dir, 'resource');
  if (!fs.existsSync(R)) return null;
  const paks = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.pak$/i.test(e.name)) paks.push(p); } })(R);
  paks.sort();
  let hit = null;
  for (const p of paks) {   // last pak in name order wins, like the mount
    let ents; try { ents = pak.list(p); } catch (e) { continue; }
    const rel = path.relative(R, path.dirname(p)).split(path.sep).filter(Boolean).join('/');
    for (const en of ents) { const full = (rel ? rel + '/' : '') + en.name.toLowerCase(); if (full === want) hit = { file: p, text: pak.read(ents, en).toString('latin1') }; }
  }
  return hit;
}
// opts: {base: file | mod dir, mod: mod dir, gameDir, exe}
function readBase(opts) {
  const goh = opts.exe === 'goh', rel = goh ? CONQUEST : BOTDATA, word = goh ? 'GoH Conquest settings file (' + CONQUEST + ')' : 'bot.data.lua';
  const tryDir = d => {
    const loose = path.join(d, 'resource', ...rel.split('/'));
    if (fs.existsSync(loose)) return { text: fs.readFileSync(loose, 'latin1'), from: 'loose', file: loose, rel };
    const p = fromPaks(d, rel); if (p) return { text: p.text, from: 'pak', file: p.file, rel };
    return null;
  };
  if (opts.base) {
    const b = path.resolve(opts.base);
    if (!fs.existsSync(b)) throw bad('The base you named does not exist: ' + opts.base, 'DOC_NO_BASE', opts.base);
    if (fs.statSync(b).isFile()) { const t = fs.readFileSync(b, 'latin1'); return { text: t, from: 'file', file: b, rel: isConquestText(t) ? CONQUEST : BOTDATA }; }
    const r = tryDir(b); if (r) return r;
    throw bad('No ' + word + ' in that folder (loose or in its paks): ' + opts.base, 'DOC_BASE_EMPTY', opts.base);
  }
  if (opts.mod) { const r = tryDir(path.resolve(opts.mod)); if (r) return r; }
  if (opts.gameDir) {
    try {
      const o = { gameDir: opts.gameDir, mods: [] }; if (opts.exe) o.exe = opts.exe;
      const vfs = require('../lib/vfs'), v = vfs.build(o), r = v.files.get('resource/' + rel);
      if (r) { const t = vfs.readRec(r).toString('latin1'); if (vfs.closeRecs) vfs.closeRecs(); return { text: t, from: 'game', file: 'game:resource/' + rel, rel }; }
      if (vfs.closeRecs) vfs.closeRecs();
    } catch (e) { /* unreadable game */ }
  }
  if (goh) throw bad('No ' + word + ' found. Your mod has none, and no GoH folder or base file was given.', 'DOC_NO_FILE');
  throw bad('No bot.data.lua found. Your mod has none, and no game folder or base file was given. For the BotConfig profile, name the mod that has ' + BIG + ' as the base.', 'DOC_NO_FILE');
}

function parseOr(text) {
  try { return luatable.parse(text); } catch (e) { throw bad('The bot file is not plain Lua data, so it cannot be read: ' + e.message, 'DOC_PARSE', e.message); }
}
const kindOf = t => (t.globals.BotConfig && t.globals.BotConfig.$t === 'table') ? 'robz' : (t.globals.ConquestConfig && t.globals.ConquestConfig.$t === 'table') ? 'conquest' : 'vanilla';
const CQ = 'the GoH Conquest settings file (' + CONQUEST + ', a ConquestConfig table)';

// ---------- doctrine marks in the file ----------
const STAMP = /^-- doctrine: persona (\S+) on (\S+), scale (\S+)[^\r\n]*\r?\n/;
const WAS = / ?-- \[doctrine was ([^\]]*)\]/;
function stampOf(text) { const m = STAMP.exec(text); return m ? { persona: m[1], profile: m[2], scale: Number(m[3]) } : null; }
// the original value of a key, read from a [doctrine was K=v; ...] tag on its line
function wasOn(line, key) {
  const m = WAS.exec(line); if (!m) return null;
  for (const part of m[1].split(';')) { const kv = /^\s*([\w.]+)=(.*?)\s*$/.exec(part); if (kv && kv[1] === key) return kv[2]; }
  return null;
}

// value span on a line: plain number (or for OrderRotationPeriod a number expression) after `Name =`
function valueSpan(line, name, expr) {
  const re = new RegExp('(^|[\\s{,.;])' + name.replace(/\./g, '\\.') + '\\s*=\\s*(' + (expr ? '[-\\d.][\\d.\\s*+\\-/()]*[\\d)]|\\d' : '-?\\d+(?:\\.\\d+)?') + ')', 'd');
  const code = line.split('--')[0], m = re.exec(code);
  if (!m) return null;
  return { a: m.indices[2][0], b: m.indices[2][1], text: m[2] };
}
const evalNum = s => { if (!/^[-\d.\s*+/()]+$/.test(s)) return NaN; try { return Function('return (' + s + ')')(); } catch (e) { return NaN; } };

function plan(text, personaId, profile, scale) {
  const p = DATA.personas.find(x => x.id === personaId);
  if (!p) throw bad('Unknown persona: ' + personaId + '. See "list personas".', 'DOC_NO_PERSONA', personaId);
  scale = scale == null ? 1 : Number(scale);
  if (!(scale >= 0 && scale <= 2)) throw bad('Scale must be a number from 0 to 2 (1 = as the persona says, 0 = no change).', 'DOC_BAD_SCALE');
  const t = parseOr(text), kind = kindOf(t);
  profile = normProfile(profile);
  if (!profile || profile === 'auto') profile = kind;
  if (!PROFILES.includes(profile)) throw bad('Profile must be vanilla, botconfig or conquest.', 'DOC_BAD_PROFILE', profile);
  if (profile === 'conquest' && kind !== 'conquest') throw bad('This file has no ConquestConfig table. The conquest profile needs ' + CQ + '.', 'DOC_PROFILE_MISMATCH');
  if (kind === 'conquest' && profile !== 'conquest') throw bad('This is ' + CQ + '. Only the conquest profile fits it.', 'DOC_PROFILE_MISMATCH');
  if (profile === 'robz' && kind !== 'robz') throw bad('This bot.data.lua has no BotConfig table, so it is the vanilla kind. BotConfig settings need the bot file of ' + BIG + ': name that mod as the base.', 'DOC_PROFILE_MISMATCH');
  const nl = /\r\n/.test(text) ? '\r\n' : '\n';
  let body = text.replace(STAMP, '');
  const lines = body.split('\n');
  // line number of each key in the (stamp-less) text
  const shift = text.length !== body.length ? 1 : 0;
  const tb = shift ? parseOr(body) : t;
  const lineOf = key => { const k = keyAt(tb, profile, key); return k ? k.line : null; };
  const changes = [], skipped = [], perLine = new Map();
  let kept = 0;
  for (const row of MAP[profile]) {
    const [key, drv, , , kind2, lo, hi, why] = row, ln = lineOf(key);
    if (!ln) { skipped.push({ key, w: 'missing', why: 'not in this bot file' }); continue; }
    const L = lines[ln - 1], name = key.split('.').pop();
    const sp = valueSpan(L, name, EXPR.has(key));
    if (!sp) { skipped.push({ key, w: 'notplain', why: 'not a plain number on its line, left alone' }); continue; }
    const orig = wasOn(L, key) != null ? wasOn(L, key) : sp.text.trim();
    const ov = evalNum(orig);
    if (!isFinite(ov)) { skipped.push({ key, w: 'nan', why: 'value is not a number' }); continue; }
    const f = factor(row, p.temperament, scale);
    const nv = ROUND[kind2](Math.min(hi, Math.max(lo, ov * f)));
    const cur = sp.text.trim(), cv = evalNum(cur);
    const ent = perLine.get(ln) || { edits: [], was: [] }; perLine.set(ln, ent);
    const put = Number(nv) === cv ? cur : Number(nv) === ov ? orig : nv;
    ent.edits.push({ sp, put });
    if (Number(nv) !== ov) ent.was.push(key + '=' + orig);
    if (Number(nv) !== cv) changes.push({ key, was: cur, now: put, orig, driver: drv, value: p.temperament[drv], base: BASE[drv], line: ln, why });
    else kept++;
  }
  // apply per line, right to left, then rewrite the [doctrine was] tag
  for (const [ln, ent] of perLine) {
    let L = lines[ln - 1];
    const cr = L.endsWith('\r'); if (cr) L = L.slice(0, -1);
    L = L.replace(WAS, '');
    ent.edits.sort((x, y) => y.sp.a - x.sp.a);
    for (const e of ent.edits) L = L.slice(0, e.sp.a) + e.put + L.slice(e.sp.b);
    if (ent.was.length) L = L + ' -- [doctrine was ' + ent.was.join('; ') + ']';
    lines[ln - 1] = L + (cr ? '\r' : '');
  }
  body = lines.join('\n');
  const stamp = '-- doctrine: persona ' + p.id + ' on ' + PUB[profile] + ', scale ' + scale + ' (ARSENAL tools/doctrine). Untested design guesses [T]; [doctrine was ...] keeps the old value.' + nl;
  const marked = WAS.test(body);
  const out = marked ? stamp + body : body;
  return {
    persona: p.id, profile: PUB[profile], kind: PUB[kind], scale, changes, skipped, kept, text: out, same: out === text,
    traits: (p.traits || []).map(x => ({ rule: x.rule, do: x.do, basis: x.basis, departs: !!x.departs })),
    takes: PUB[profile],
  };
}

// ---------- check ----------
const SHARE = ['HoldMaxShare', 'BackShare', 'LaunchShare', 'SmokeMaxFrac', 'FrontRange', 'MidRange'];
function check(text, profile) {
  // t = the text key a page translates (code, or code.variant), a = the values that text names
  const problems = [], P = (level, code, msg, t, a) => problems.push({ level, code, msg, t: t || code, a: a || {} });
  let t;
  try { t = luatable.parse(text); } catch (e) { P('error', 'DOC_PARSE', 'The bot file is not plain Lua data, so the game may fail to read it: ' + e.message, 'DOC_PARSE', { x: e.message }); return { kind: null, profile: profile || null, stamp: stampOf(text), problems, keys: [] }; }
  const kind = kindOf(t);
  profile = normProfile(profile);
  profile = !profile || profile === 'auto' ? kind : profile;
  const keys = [];
  if (profile === 'robz' && kind !== 'robz') P('error', 'DOC_PROFILE_MISMATCH', 'You asked for BotConfig, but this file has no BotConfig table. It is a vanilla bot file: the BotConfig settings cannot go in here.', 'DOC_PROFILE_MISMATCH.big');
  if (profile === 'vanilla' && kind === 'robz') P('info', 'DOC_PROFILE_MISMATCH', 'This file has a BotConfig table, so it belongs to ' + BIG + '. The stock bot ignores BotConfig.', 'DOC_PROFILE_MISMATCH.van');
  if (profile === 'conquest' && kind !== 'conquest') P('error', 'DOC_PROFILE_MISMATCH', 'You asked for conquest, but this file has no ConquestConfig table. The conquest settings live in ' + CQ + '.', 'DOC_PROFILE_MISMATCH.cq');
  if (kind === 'conquest' && profile !== 'conquest') P('error', 'DOC_PROFILE_MISMATCH', 'This is ' + CQ + ', not a bot.data.lua: only the conquest profile fits it.', 'DOC_PROFILE_MISMATCH.notcq');
  if (kind === 'conquest') {
    for (const row of MAP.conquest) {
      const k = keyAt(t, 'conquest', row[0]), v = k ? k.value : undefined;
      keys.push({ key: row[0], present: v !== undefined, value: v === undefined ? null : v });
      if (v === undefined) P('warn', 'DOC_KEY_MISSING', row[0] + ' is not in ConquestConfig, so the generator cannot set it (an older or newer GoH version?).', 'DOC_KEY_MISSING.cq', { k: row[0] });
      else if (typeof v !== 'number') P('warn', 'DOC_NOT_NUMBER', row[0] + ' is not a plain number, so the generator leaves it alone.', 'DOC_NOT_NUMBER', { k: row[0] });
      else if (v < 0) P('error', 'DOC_RANGE', row[0] + ' = ' + v + ': cannot be negative.', 'DOC_RANGE.neg', { k: row[0], v });
    }
    const num = p => { const k = keyAt(t, 'conquest', p); return k && typeof k.value === 'number' ? k.value : null; };
    for (const p of ['DefenderCounterattack.ResponseChance', 'AttackerFailure.NoProgress.PlayerDefenseRatio']) { const v = num(p); if (v != null && v > 1) P('error', 'DOC_RANGE', p + ' = ' + v + ': a share must be between 0 and 1.', 'DOC_RANGE.share', { k: p, v }); }
    const lo = num('AttackerWaves.MinUnits'), hi = num('AttackerWaves.MaxUnits');
    if (lo != null && hi != null && lo > hi) P('error', 'DOC_RANGE', 'AttackerWaves.MinUnits = ' + lo + ' is above MaxUnits = ' + hi + '.', 'DOC_RANGE.minmax', { k: 'AttackerWaves.MinUnits', v: lo });
    P('info', 'DOC_CONQUEST_ONLY', 'These settings drive the GoH bot in Conquest only. Frontlines, Battle Zones and Last Stand keep their bot settings in code (modes/*.lua), so a persona does not reach them.');
  } else if (kind === 'robz') {
    const B = t.globals.BotConfig.hash;
    for (const row of MAP.robz) {
      const v = B[row[0]];
      keys.push({ key: row[0], present: v !== undefined, value: v === undefined ? null : v });
      if (v === undefined) P('warn', 'DOC_KEY_MISSING', row[0] + ' is not in BotConfig, so the generator cannot set it (an older or newer version of the bot script?).', 'DOC_KEY_MISSING', { k: row[0] });
      else if (typeof v !== 'number') P('warn', 'DOC_NOT_NUMBER', row[0] + ' is not a plain number, so the generator leaves it alone.', 'DOC_NOT_NUMBER', { k: row[0] });
    }
    const unk = Object.keys(B).filter(k => !ROBZ.keys[k]);
    if (unk.length) P('info', 'DOC_KEY_UNKNOWN', unk.length + ' BotConfig key(s) are not in the reference list (set later in the file, a newer version of the bot script, or a typo the bot ignores): ' + unk.join(', ') + '.', 'DOC_KEY_UNKNOWN', { n: unk.length, k: unk.join(', ') });
    for (const k of SHARE) if (typeof B[k] === 'number' && (B[k] < 0 || B[k] > 1)) P('error', 'DOC_RANGE', k + ' = ' + B[k] + ': a share must be between 0 and 1.', 'DOC_RANGE.share', { k, v: B[k] });
    for (const k of ['DirAttackRatio', 'AssaultRatio', 'EarlyAssaultRatio', 'SwitchMargin']) if (typeof B[k] === 'number' && B[k] <= 0) P('error', 'DOC_RANGE', k + ' = ' + B[k] + ': a ratio must be above 0.', 'DOC_RANGE.ratio', { k, v: B[k] });
    for (const k of ['EngageDist', 'BoundStep', 'DangerDist', 'SmokeEvery', 'SmokeAttackEvery', 'UnderFireMaxMove', 'GatherMax', 'ReorderPeriod', 'WaveTimeout', 'EarlyPush']) if (typeof B[k] === 'number' && B[k] < 0) P('error', 'DOC_RANGE', k + ' = ' + B[k] + ': cannot be negative.', 'DOC_RANGE.neg', { k, v: B[k] });
    P('info', 'DOC_BOTCONFIG_ONLY', 'BotConfig works only with ' + BIG + ' (its own bot.lua). Load your mod on top of the mod that has it.');
  } else {
    const G = t.globals;
    for (const k of ['MaxSquadSize', 'OrderRotationPeriod']) {
      keys.push({ key: k, present: G[k] !== undefined, value: G[k] === undefined ? null : G[k] });
      if (typeof G[k] !== 'number') P('error', 'DOC_VANILLA_KEY', k + ' is missing or not a number. The stock bot reads it.', 'DOC_VANILLA_KEY', { k });
      else if (G[k] <= 0) P('error', 'DOC_RANGE', k + ' = ' + G[k] + ': must be above 0.', 'DOC_RANGE.pos', { k, v: G[k] });
    }
    const F = G.FlagPriority && G.FlagPriority.hash;
    for (const s of ['Captured', 'Enemy', 'Neutral']) {
      const v = F ? F[s] : undefined;
      keys.push({ key: 'FlagPriority.' + s, present: v !== undefined, value: v === undefined ? null : v });
      if (typeof v !== 'number') P('error', 'DOC_VANILLA_KEY', 'FlagPriority.' + s + ' is missing or not a number. The stock bot picks flags with these weights.', 'DOC_VANILLA_FLAG', { k: 'FlagPriority.' + s });
      else if (v < 0) P('error', 'DOC_RANGE', 'FlagPriority.' + s + ' cannot be negative.', 'DOC_RANGE.neg', { k: 'FlagPriority.' + s, v: v });
    }
    if (F && ['Captured', 'Enemy', 'Neutral'].every(s => F[s] === 0)) P('error', 'DOC_RANGE', 'All FlagPriority weights are 0: the bot cannot pick a flag.', 'DOC_RANGE.flags0');
    P('info', 'DOC_VANILLA_FEW', 'The stock bot reads only MaxSquadSize, OrderRotationPeriod and FlagPriority (plus its shopping list). Most of a persona has no setting here.');
  }
  if (kind === 'vanilla' && !t.globals.Purchases) P('warn', 'DOC_NO_PURCHASES', 'The file has no Purchases list, so a bot using it may buy nothing.');
  const stamp = stampOf(text);
  if (stamp && !DATA.personas.some(p => p.id === stamp.persona)) P('warn', 'DOC_STAMP', 'The file says persona ' + stamp.persona + ', which this pack does not know.', 'DOC_STAMP', { p: stamp.persona });
  return { kind: PUB[kind], profile: PUB[profile] || profile, stamp, problems, keys };
}

// the pack's profile notes, headed with the name users see
const profileMd = id => (TEXT.profiles[id] || '').replace(/^profile: (\w+)/m, (m, k) => 'profile: ' + (PUB[k] || k));
// the conquest profile is ARSENAL's own (GoH), not part of the vendored pack: its data and notes are made here
const CONQUEST_MD = 'profile: conquest\r\nGates of Hell: the Conquest bot reads its tuning from ConquestConfig in ' + CONQUEST + ' (GoH has no bot.data.lua, GHMIS-66).\r\nThe generator sets ' + MAP.conquest.length + ' wave, counterattack and order settings. reserve_share has no setting here. Frontlines, Battle Zones and Last Stand keep their bot settings in code.\r\nThe numbers are design guesses [T]: nothing has been played in a GoH match yet.';
function profileInfo(id) {
  id = normProfile(id);
  const p = id === 'conquest' ? { id: 'conquest', game: 'goh', file: CONQUEST } : DATA.profiles.find(x => x.id === id);
  if (!p) throw bad('Profile must be vanilla, botconfig or conquest.', 'DOC_BAD_PROFILE', id);
  return {
    id: PUB[id], data: p, md: id === 'conquest' ? CONQUEST_MD : profileMd(id),
    takes: MAP[id].map(r => ({ key: r[0], driver: r[1], why: r[7] })),
    reference: id === 'robz' ? { count: ROBZ.count, source: 'BotConfig key list of the larger replacement bot script, with its notes, from the doctrine pack SDK. Reference only.' }
      : id === 'conquest' ? { count: MAP.conquest.length, source: 'vanilla GoH ' + CONQUEST + ' (ConquestConfig), read from the GoH install' }
      : { count: 3, source: 'stock bot.data.lua: MaxSquadSize, OrderRotationPeriod, FlagPriority' },
  };
}

// opt: { profile, rel } (or a rel string, the old form). The profile names the file: conquest -> CONQUEST, any other -> BOTDATA; no
// profile = by the text, as before. A Gates of Hell write (the game folder is GoH, or the profile is conquest) must be a Conquest config:
// any other text is refused (GoH has no bot.data.lua, GHMIS-66). The final file is checked by lib/modwrite (inside the mod, also with
// links followed). GoH: a restore point first (Files page form, lib/modwrite); AS2/AS64 keep their path (no restore point there).
function writeMod(mod, text, gameDir, opt) {
  refuseGame(mod, gameDir);   // checked again here, so no caller writes unguarded
  const o = typeof opt === 'string' ? { rel: opt } : (opt || {});
  const prof = o.profile ? normProfile(String(o.profile)) : null;
  const goh = (!!gameDir && require('../lib/writeguard').isGoh(gameDir)) || prof === 'conquest';
  if (goh && !isConquestText(text)) throw bad('Gates of Hell reads its bot tuning only from ' + CONQUEST + ' (ConquestConfig). This text is not a Conquest config, so nothing was written.', 'DOC_GOH_NOT_CONQUEST');
  if (prof === 'conquest' && o.rel && o.rel !== CONQUEST) throw bad('The conquest profile writes ' + CONQUEST + ', not ' + o.rel + '. Nothing was written.', 'DOC_PROFILE_MISMATCH');
  const rel = o.rel || (prof ? (prof === 'conquest' ? CONQUEST : BOTDATA) : (isConquestText(text) ? CONQUEST : BOTDATA));
  const MW = require('../lib/modwrite'), gopt = gameDir ? { game: gameDir } : {};
  const p = path.join(path.resolve(mod), 'resource', ...rel.split('/'));
  try { MW.guardFile(mod, p, gopt); } catch (e) { throw bad(e.message, 'DOC_WRITE_OUTSIDE', p); }
  if (goh) MW.restorePoints(mod, ['resource/' + rel], 'doctrine', gopt);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'latin1');
  return p;
}
// the game install is read only; only <game>/mods/<mod> may be written. Shared write guard: any AS2 install, GoH, Workshop by content,
// with or without --game (the code stays DOC_GAME_DIR)
function refuseGame(mod, gameDir) {
  const why = require('../lib/writeguard').refuseWrite(mod, { game: gameDir || undefined, purpose: 'write the doctrine' });
  if (why) throw bad(why, 'DOC_GAME_DIR');
}

module.exports = { PUB, normProfile, profileMd, data, TEXT, ROBZ, MAP, BASE, KINDS, BOTDATA, CONQUEST, find, voice, readBase, kindOf, plan, check, stampOf, profileInfo, writeMod, refuseGame, bad };
