#!/usr/bin/env node
// doctrine: the Men of War doctrine pack (WW2 small-unit rules, personas, missions, mod profiles) for ARSENAL, and a generator that
// turns a persona into bot settings in YOUR mod's copy of bot.data.lua. Nothing here has been played in a match yet: changes are [T].
//   node doctrine.js list rules|personas|missions|voices|profiles [--json]
//   node doctrine.js show <id> [--json]                       a rule, persona, mission, voice, profile or modern concept
//   node doctrine.js voice <persona> <event|rule> [seed] [--group G] [--obj O]
//   node doctrine.js profile vanilla|botconfig|conquest [--keys] [--json]    what the mod profile holds and which bot settings it takes
//   node doctrine.js gen --persona P --out <mod> [--profile auto|vanilla|botconfig|conquest] [--base <file|mod>] [--game <dir>] [--exe E] [--scale 0..2] [--plan] [--json]
//        --plan = preview only. Base = --base, else the mod's own bot file (loose or in its paks), else the game's (with --game; --exe goh: the GoH install).
//   node doctrine.js check <mod|file> [--profile auto|vanilla|botconfig|conquest] [--game <dir>] [--exe E] [--json]   exit 1 on an error
// --exe as64|mowas_2|mowas2|goh: the game whose files are read (vfs exe; none = as before, as64 first on the shared AS2 install). goh: the bot
//   file is modes/conquest/runtime_config.lua (GoH has no bot.data.lua, GHMIS-66) and the profile is conquest.
// Profiles: vanilla = the stock bot (3 settings). botconfig = a larger replacement bot script from another mod that keeps about
//   200 settings in a BotConfig table; the generator sets 18 of them, and they work only when that bot script is loaded too.
//   conquest = Gates of Hell, the Conquest bot's ConquestConfig (10 settings). Errors: plain sentence on stderr, exit 2.
// Author: Imperator_Aug (ARSENAL, ia-d7447270)
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib');

function args(argv) {
  const o = { pos: [], json: false, plan: false, keys: false };
  const vals = ['--persona', '--out', '--profile', '--base', '--game', '--scale', '--group', '--obj', '--mod'];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--exe') {   // the game whose files are read (lib/games): vfs exe as64 | mowas_2 | goh
      const v = argv[++i], g = require('../lib/games').get(v);
      if (!g) throw L.bad('--exe must be as64, mowas_2, mowas2 or goh.');
      o.exe = g.exe;
    }
    else if (a === '--json') o.json = true;
    else if (a === '--plan') o.plan = true;
    else if (a === '--keys') o.keys = true;
    else if (vals.includes(a)) { if (i + 1 >= argv.length) throw L.bad(a + ' needs a value.'); o[a.slice(2)] = argv[++i]; }
    else if (a.startsWith('--')) throw L.bad('Unknown option ' + a + '. Run without arguments for help.');
    else o.pos.push(a);
  }
  return o;
}
// the game folder read: --game, else with --exe goh the GoH install (lib/games install); AS2 games keep needing --game as before
const gameOf = o => o.game || (o.exe === 'goh' ? require('../lib/games').install('goh').dir : undefined);
const out = (o, obj, text) => { if (o.json) console.log(JSON.stringify(obj, null, 1)); else console.log(text); };
const tag = r => r && r.param_source ? Object.entries(r.param_source).map(([k, v]) => k + '=' + v).join(', ') : '';

function list(o) {
  const k = o.pos[1], D = L.data();
  if (!L.KINDS.includes(k)) throw L.bad('List what? One of: ' + L.KINDS.join(', ') + '.');
  const items = D[k].map(x => {
    if (k === 'rules') return { id: x.id, family: x.family, task: x.task, fit: x.fit };
    if (k === 'personas') return { id: x.id, title: x.title, temperament: x.temperament, fidelity: x.fidelity, note: x.lobby_note };
    if (k === 'missions') return { id: x.id, title: x.title, teaches: x.teaches };
    if (k === 'voices') return { id: x.id, register: x.register, events: Object.keys(x.lines) };
    return { id: L.PUB[x.id] || x.id, armies: Object.keys(x.armies || {}) };
  });
  out(o, items, items.map(x => x.id.padEnd(24) + ' ' + (x.task || x.title || (x.events ? x.events.join(' ') : '') || x.armies.join(' '))).join('\n'));
}

function show(o) {
  const id = o.pos[1]; if (!id) throw L.bad('Show what? Give an id from "list".');
  const f = L.find(L.normProfile(id)); if (!f) throw L.bad('No rule, persona, mission, voice or profile is called ' + id + '. See "list".');
  const x = f.item, T = L.TEXT;
  if (o.json) { const r = { kind: f.kind, item: x }; if (f.kind === 'missions') r.briefing = T.missions[id] || ''; return out(o, r); }
  const t = [];
  if (f.kind === 'rules') {
    t.push(x.id + ' (' + x.family + '): ' + x.task, 'When: ' + x.when, 'Do:'); x.do.forEach(d => t.push('  - ' + d));
    t.push('Roles: ' + Object.entries(x.roles || {}).map(([k, v]) => k + ' ' + v.join('/')).join('; '));
    t.push('Fit in the game: ' + Object.entries(x.fit || {}).map(([k, v]) => k + '=' + v).join(', '));
    if (tag(x)) t.push('Numbers come from: ' + tag(x) + ' (design = a starting guess)');
    (x.pitfalls || []).forEach(p => t.push('Pitfall: ' + p));
  } else if (f.kind === 'personas') {
    t.push(x.title + ' (' + x.id + '), armies ' + x.armies.join(' ') + ', fidelity ' + x.fidelity, x.lobby_note || '');
    t.push('Temperament: ' + Object.entries(x.temperament).map(([k, v]) => k + ' ' + v).join(', '));
    (x.traits || []).forEach(r => t.push('  - ' + r.rule + ': ' + r.do + ' [' + r.basis + (r.departs ? ', deliberate period flaw' : '') + ']'));
  } else if (f.kind === 'missions') t.push(T.missions[id] || x.title);
  else if (f.kind === 'voices') Object.entries(x.lines).forEach(([k, v]) => t.push(k + ': ' + v.join(' | ')));
  else if (f.kind === 'profiles') t.push(L.profileMd(x.id) || JSON.stringify(x, null, 1));
  else t.push(x.title + ': ' + x.idea, 'In the game: ' + x.game_use, 'Caution: ' + x.caution);
  out(o, null, t.join('\n'));
}

function profile(o) {
  const r = L.profileInfo(o.pos[1]);
  if (o.keys && r.id === 'botconfig') r.keys = L.ROBZ.keys;
  const t = [r.md.trim(), '', 'Bot settings the generator sets for ' + L.PUB[r.id] + ':'];
  r.takes.forEach(k => t.push('  ' + k.key.padEnd(22) + ' from ' + k.driver.padEnd(13) + ' ' + k.why));
  t.push('', r.id === 'conquest' ? 'GoH Conquest bot: these settings sit in ConquestConfig of ' + L.CONQUEST + '; your mod gets its own copy of that file.' : r.id === 'botconfig' ?'The BotConfig table of the larger replacement bot script has ' + r.reference.count + ' keys (see --keys); they work only with that bot script.' : 'The stock bot reads only these 3 settings. Rules, smoke, bounds and siting have no setting in vanilla.');
  if (o.keys && r.keys) Object.entries(r.keys).forEach(([k, v]) => t.push('  ' + k.padEnd(20) + ' ' + String(v.v).padEnd(10) + ' ' + (v.note || '')));
  out(o, r, t.join('\n'));
}

function gen(o) {
  if (!o.persona) throw L.bad('Name a persona with --persona (see "list personas").');
  if (!o.out && !o.plan) throw L.bad('Name your mod folder with --out (add --plan to preview first).');
  if (o.out) {
    if (!fs.existsSync(o.out) || !fs.statSync(o.out).isDirectory()) throw L.bad('The mod folder does not exist: ' + o.out);
    L.refuseGame(o.out, o.game);
  }
  const base = L.readBase({ base: o.base, mod: o.out, gameDir: gameOf(o), exe: o.exe });
  const p = L.plan(base.text, o.persona, o.profile || 'auto', o.scale == null ? 1 : o.scale);
  let wrote = null;
  if (!o.plan && o.out && p.changes.length) wrote = L.writeMod(o.out, p.text, o.game, { profile: p.profile });
  const res = { persona: p.persona, kept: p.kept, profile: p.profile, scale: p.scale, base: { from: base.from, file: base.file }, changes: p.changes, skipped: p.skipped, traits: p.traits, wrote, plan: !!o.plan };
  const t = ['Persona ' + p.persona + ' on ' + L.PUB[p.profile] + ' (scale ' + p.scale + '), base: ' + base.file];
  if (!p.changes.length) t.push('No setting changes (this persona matches the baseline, or the scale is 0).');
  p.changes.forEach(c => t.push('  ' + c.key.padEnd(22) + ' ' + String(c.was).padStart(8) + ' -> ' + String(c.now).padEnd(8) + ' [T] ' + c.driver + ' ' + c.value + ' (baseline ' + c.base + '). ' + c.why));
  p.skipped.forEach(s => t.push('  skipped ' + s.key + ': ' + s.why));
  if (p.profile === 'conquest') t.push('GoH Conquest only: Frontlines, Battle Zones and Last Stand keep their bot settings in code. reserve_share has no setting here.');
  if (p.profile === 'vanilla') t.push('Vanilla takes only these few settings. The rules below have no setting in the stock bot.');
  if (p.traits.length) { t.push('What this persona does that no bot setting can express (advice for missions and your own bot script):'); p.traits.forEach(r => t.push('  - ' + r.do + (r.departs ? ' (deliberate period flaw)' : ''))); }
  t.push(wrote ? 'Wrote ' + wrote + '. Next: run "check" on the mod, then play a skirmish with bots and watch.' : o.plan ? 'Preview only. Nothing was written.' : 'Nothing to write.');
  t.push('Nothing here has been played in a match yet; the numbers are starting guesses.');
  out(o, res, t.join('\n'));
}

function check(o) {
  const tgt = o.pos[1]; if (!tgt) throw L.bad('Check what? Give your mod folder or a bot.data.lua file.');
  const base = L.readBase({ base: tgt, gameDir: gameOf(o), exe: o.exe });
  const r = L.check(base.text, o.profile || 'auto');
  r.file = base.file;
  const errs = r.problems.filter(x => x.level === 'error').length;
  const t = ['Checked ' + base.file + ' as ' + (L.PUB[r.profile] || r.profile || '?') + (r.stamp ? ' (doctrine persona ' + r.stamp.persona + ', scale ' + r.stamp.scale + ')' : '')];
  r.problems.forEach(x => t.push(x.level.toUpperCase() + ' ' + x.code + ': ' + x.msg));
  t.push(errs ? errs + ' error(s).' : 'No errors.');
  out(o, r, t.join('\n'));
  if (errs) process.exitCode = 1;
}

function voice(o) {
  const [, pid, ev, seed] = o.pos; if (!pid || !ev) throw L.bad('Usage: voice <persona> <event|rule> [seed].');
  const line = L.voice(pid, ev, seed, o.group, o.obj);
  out(o, { persona: pid, event: ev, line }, line);
}

const HELP = (s => s.slice(1, s.findIndex(l => /^\/\/ Author:/.test(l))))(fs.readFileSync(__filename, 'utf8').split('\n')).map(l => l.replace(/^\/\/ ?/, '')).join('\n');
function main() {
  const av = process.argv.slice(2);
  if (av.includes('--help') || av.includes('-h')) { console.log(HELP); return; }
  const o = args(av), cmd = o.pos[0];
  const C = { list, show, profile, gen, check, voice };
  if (!cmd) { console.log(HELP); return; }
  if (!C[cmd]) throw L.bad('Unknown command ' + cmd + '. Commands: ' + Object.keys(C).join(', ') + '.');
  C[cmd](o);
}
try { main(); } catch (e) {
  const o = process.argv.includes('--json');
  if (o) console.log(JSON.stringify({ error: e.message, code: e.code || 'DOC_ERROR' }));
  console.error(e.message); process.exit(2);
}
