// mcp tools, group `robz`: the RobZ Realism mod (a large realism overhaul of Men of War: Assault Squad 2) for people who play it,
// mod on top of it or maintain it. Contract: tools/mcp/README.md. Every tool is read-only and takes game = as64 | mowas2 | goh;
// goh answers { na } (RobZ is an Assault Squad 2 mod). The tools read the RobZ folder itself at call time (paks or loose files,
// robz/lib.js), so numbers follow the installed version; the short digest in robz/data.js and the notes in refmods/robz say what
// the numbers mean. Clashes of a sub-mod reuse mow_mods_clash of the mod group (required, not copied).
// Author: Imperator_Aug (ARSENAL, ia-68c56141)
'use strict';
const path = require('path');
const U = require('./mod/util');
const L = require('./robz/lib');
const D = require('./robz/data');

const GAMES = ['as64', 'mowas2', 'goh'];
const P = {
  game: { type: 'string', enum: GAMES, description: 'as64 (default) or mowas2; goh answers that RobZ is not a Gates of Hell mod' },
  mod: { type: 'string', description: 'Full path of the RobZ folder; left out = the newest RobZ found in <game>/mods or the Workshop folder' },
  version: { type: 'string', description: 'RobZ version to read when several are installed, e.g. 1.30 or 1.31.0' },
  q: { type: 'string', description: 'Words to look for' },
  limit: { type: 'integer', description: 'Most rows to answer' },
};
const schema = (properties, required) => ({ type: 'object', properties: Object.assign({ game: P.game }, properties), required: required || [] });
const lines = a => a.filter(x => x != null && x !== '').join('\n');
const lc = L.lc, fwd = L.fwd;
const gameWord = g => (g.id === 'as64' ? 'AS64' : g.id === 'mowas2' ? 'MoW:AS2' : 'Gates of Hell');
const words = q => lc(q).split(/[\s,]+/).filter(Boolean);
const hasAll = (hay, ws) => ws.every(w => hay.includes(w));
const where = x => (x.where === 'mods' ? '<game>/mods/' + x.folder : x.where === 'workshop' ? 'Workshop item ' + x.folder : fwd(x.dir));
const modeNote = (x, g) => (x.mode === 'classic'
  ? (g.id === 'as64' ? 'legacy mod.info (' + (x.min || '?') + ' .. ' + (x.max || '?') + '): AS64 loads it in Classic mode only' : 'mod.info ' + (x.min || '?') + ' .. ' + (x.max || '?') + ': native on MoW:AS2')
  : (g.id === 'as64' ? 'MinGameVersion ' + x.min + ': an upgraded copy for AS64 Enhanced mode' : 'MinGameVersion ' + x.min + ': made for AS64, the 32-bit game does not load it'));
// the install to read and its view, or null when none is there and the tool can answer without one
function open(ctx, g, args, must) {
  let x;
  try { x = L.pick(ctx, g, args); } catch (e) { if (must || (args && args.mod) || !e.refused) throw e; return null; }
  return { x, S: L.source(x.dir), G: g.dir ? L.source(g.dir) : null };
}

// ---------- find ----------
async function find(args, ctx) {
  const g = ctx.game(args); if (g.kind === 'goh') return { na: D.NA };
  let rows, chosen = null;
  if (args.mod) { chosen = L.pick(ctx, g, args); rows = [chosen]; }
  else { rows = L.scan(U.need(ctx, g)); try { chosen = L.pick(ctx, g, args); } catch (e) { if (!e.refused) throw e; } }
  const robz = rows.filter(x => x.robz || x === chosen), comp = rows.filter(x => x.companion);
  const dup = robz.filter(x => x.where === 'workshop' && robz.some(y => y.where === 'mods' && y.version === x.version));
  const t = [robz.length + ' RobZ Realism install(s) for ' + gameWord(g) + (args.mod ? '' : ' (<game>/mods and the Workshop folder)') + '.',
    ...robz.map(x => '- ' + (x.version || 'version not in the name') + '  ' + where(x) + '  [' + x.layout + '; ' + modeNote(x, g) + ']' + (x === chosen ? '  <- read by the other mow_robz_* tools' : '')),
    dup.length ? 'The same version is there as a Workshop item and as a folder in <game>/mods: the game loads the Workshop copy and logs the folder as an old copy [V, refmods/robz/potential.md].' : null,
    !robz.length ? 'None found. Subscribe to it on the Workshop or put its folder into <game>/mods, or pass mod with the full path.' : null,
    comp.length ? 'Mods that name RobZ (companions, patches): ' + comp.slice(0, 12).map(x => (x.name || x.folder) + ' (' + where(x) + ')').join('; ') + (comp.length > 12 ? ' ... ' + (comp.length - 12) + ' more' : '') : null,
    robz.length ? 'Next: mow_robz_changes (what it changes), mow_robz_issues (known issues of this version), mow_robz_submod (check a patch for it).' : null];
  const slim = x => ({ version: x.version, name: x.name, folder: x.folder, where: x.where, dir: fwd(x.dir), layout: x.layout, min: x.min, max: x.max, mode: x.mode, paks: x.paks });
  return { text: lines(t), data: { game: g.id, installs: robz.map(slim), chosen: chosen ? slim(chosen) : null, companions: comp.slice(0, 30).map(slim) } };
}

// ---------- what it changes ----------
async function changes(args, ctx) {
  const g = ctx.game(args); if (g.kind === 'goh') return { na: D.NA };
  const want = lc(args.area || ''), areas = want ? D.AREAS.filter(a => a.id === want) : D.AREAS;
  if (!areas.length) return ctx.bad('unknown area "' + args.area + '": use one of ' + D.AREAS.map(a => a.id).join(', '));
  const o = open(ctx, g, args, false), live = {}, t = [];
  if (o) {
    const C = L.cards(o.S, o.G), Pz = L.presets(o.S, o.G), T = L.tiers(o.S);
    live.version = o.x.version; live.layout = o.x.layout;
    live.cards = C.rows.length; live.unitSets = C.sets.filter(s => s.cards).map(s => s.set + ' ' + s.cards);
    live.sides = [...new Set(C.rows.map(r => r.side).filter(Boolean))].sort();
    live.presets = Pz.length; live.modes = [...new Set(Pz.map(p => p.mode))];
    live.tiers = T.rows.length; live.tankClasses = T.classes;
    live.armiesAdded = o.S.keys('resource/set/multiplayer/armies/').map(k => path.basename(k, '.set'));
    live.breeds = o.S.keys('resource/set/breed/mp/').filter(k => /\/mp\/[^/]+\/[^/]+$/.test(k)).length;
    t.push('RobZ Realism ' + (o.x.version || '') + ' (' + where(o.x) + ', ' + o.x.layout + ') against ' + gameWord(g) + ', read from the folder now: ' + live.cards + ' buy cards in ' + live.unitSets.length + ' unit set(s) (' + live.unitSets.join(', ') + '), sides ' + live.sides.join(' ') +
      '; ' + live.presets + ' presets in the modes ' + live.modes.join(', ') + '; ' + live.tiers + ' shell tiers on ' + live.tankClasses.length + ' tank class scripts; ' + live.breeds + ' multiplayer breeds' + (live.armiesAdded.length ? '; armies added: ' + live.armiesAdded.join(', ') : '') + '.');
  } else t.push('No RobZ install was found, so this is the digest only (measured on 1.30.10 and 1.31.0); pass mod for live numbers.');
  for (const a of areas) { t.push(a.title + ' (area ' + a.id + ')'); for (const r of (want ? a.rows : a.rows.slice(0, 2))) t.push('- ' + r); if (!want && a.rows.length > 2) t.push('  (' + (a.rows.length - 2) + ' more: area "' + a.id + '"; long form ' + a.ref + ')'); else t.push('  long form: ' + a.ref); }
  t.push('Tags: [V] read or measured, [I] inferred, [T] needs a game test, [author] the mod\'s own description. A file-level list of every difference: mow_mod_diff with the RobZ folder.');
  return { text: lines(t), data: { game: g.id, live: o ? live : null, areas: areas.map(a => ({ id: a.id, title: a.title, ref: a.ref, rows: a.rows })) } };
}

// ---------- its own systems ----------
const KINDS = ['macro', 'preset', 'tier', 'army', 'doctrine'];
async function system(args, ctx) {
  const g = ctx.game(args); if (g.kind === 'goh') return { na: D.NA };
  const kind = lc(args.kind || 'macro'); if (!KINDS.includes(kind)) return ctx.bad('kind must be one of ' + KINDS.join(', '));
  const o = open(ctx, g, args, true), ws = words(args.q || ''), n = Math.min(Math.max(args.limit || 25, 1), 100);
  const head = 'RobZ Realism ' + (o.x.version || '') + ' (' + where(o.x) + '): ';
  if (kind === 'macro') {
    const all = []; for (const [name, rows] of L.defines(o.S)) for (const r of rows) all.push(Object.assign({ name }, r));
    const hit = (ws.length ? all.filter(r => hasAll(lc(r.name + ' ' + r.file + ' ' + r.note), ws)) : all).sort((a, b) => (lc(b.name) === ws[0]) - (lc(a.name) === ws[0]) || lc(b.name).includes(ws[0] || '') - lc(a.name).includes(ws[0] || '') || a.name.localeCompare(b.name));
    const by = {}; for (const r of all) { const k = r.file.split('/').slice(1, 3).join('/'); by[k] = (by[k] || 0) + 1; }
    const R = U.list(hit, ws.length ? n : 0, 'pass q with a part of the macro name, its file or its comment');
    return { text: lines([head + all.length + ' macro define(s) in ' + new Set(all.map(r => r.file)).size + ' file(s) of resource/set and resource/properties' + (ws.length ? ', ' + hit.length + ' match "' + args.q + '"' : '') + '.',
      ws.length ? null : 'By folder: ' + Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, c]) => k + ' ' + c).join(', ') + '. Pass q to list.',
      ...(ws.length ? R.rows : []).map(r => '- ' + r.name + (r.params.length ? '(' + r.params.join(' ') + ')' : '') + '  ' + r.file + ':' + r.line + (r.note ? '  ; ' + r.note : '')),
      ws.length && R.more ? '(' + R.more + ' more; ' + R.hint + ')' : null,
      o.S.has('macros.md') ? 'This tree carries MACROS.md at its root: every define with its call count.' : null,
      'A name defined in two files: the body read last wins for the callers after it. Entity defs carry their own defines too; they are not listed here.']),
      data: { game: g.id, version: o.x.version, kind, total: all.length, hits: hit.length, rows: ws.length ? R.rows : [], folders: by } };
  }
  if (kind === 'preset') {
    const all = L.presets(o.S, o.G), hit = ws.length ? all.filter(p => hasAll(lc(p.mode + ' ' + p.id + ' ' + p.unitMode + ' ' + p.apply), ws)) : all;
    const R = U.list(hit, n, 'pass q with a mode (combat, battle_zones, frontline), a year (44) or part of a preset name');
    const modes = {}; for (const p of all) { modes[p.mode] = modes[p.mode] || { n: 0, bots: p.bots }; modes[p.mode].n++; }
    return { text: lines([head + all.length + ' preset(s)' + (ws.length ? ', ' + hit.length + ' match "' + args.q + '"' : '') + '. Modes: ' + Object.entries(modes).map(([k, v]) => k + ' ' + v.n + (v.bots ? ' (bots allowed)' : ' (no bots: {enableBots} is off)')).join(', ') + '.',
      ...R.rows.map(p => '- ' + p.mode + ' ' + p.id + ': units ' + (p.apply || '?') + ', MP ' + (p.start == null ? '?' : p.start) + (p.finish != null ? ' -> ' + p.finish : '') + (p.growTime ? ' over ' + p.growTime + ' s' : p.period ? ', a wave every ' + p.period + ' s' : '') + ', CP ' + (p.cp || '?') + (p.limits ? ', limits ' + p.limits : '')),
      R.more ? '(' + R.more + ' more; ' + R.hint + ')' : null,
      'MP = the buy resource of the preset (start value and the value it grows to); CP = command points (the army size cap). How income and CP work: skill mow-play-coach, mow_mode_info.']),
      data: { game: g.id, version: o.x.version, kind, total: all.length, hits: hit.length, rows: R.rows, modes } };
  }
  if (kind === 'tier') {
    const T = L.tiers(o.S), hit = ws.length ? T.rows.filter(r => hasAll(lc(r.tier), ws)) : T.rows;
    return { text: lines([head + T.rows.length + ' shell tier(s) feed the tank damage counter (safeties/penetration_safety.inc); class scripts: ' + T.classes.join(', ') + '.',
      hit.length ? hit.map(r => r.tier + ' ' + r.points).join(', ') : 'No tier matches "' + args.q + '".',
      'Points add up per vehicle; at 11 the vehicle is knocked out: tagged "destroyed" and the crew leaves, no body part has to break [V, refmods/robz/systems-test.md].',
      'A shell gets its tier from a tag in its .ammo stuff file. The effect chances per tier and tank class are in set/interaction_entity/tank/tank_<class>.inc (refmods/robz/systems.md has the shell_medium table).']),
      data: { game: g.id, version: o.x.version, kind, rows: hit, classes: T.classes } };
  }
  const C = L.cards(o.S, o.G);
  if (kind === 'army') {
    const by = {}; for (const r of C.rows) { const s = r.side || '(no side tag)'; const b = by[s] = by[s] || { side: s, cards: 0, squads: 0, vehicles: 0, min: null, max: null }; b.cards++; if (r.kind === 'vehicle') b.vehicles++; else b.squads++; if (r.cost != null) { b.min = b.min == null ? r.cost : Math.min(b.min, r.cost); b.max = b.max == null ? r.cost : Math.max(b.max, r.cost); } }
    const rows = Object.values(by).filter(b => !ws.length || hasAll(lc(b.side), ws)).sort((a, b) => b.cards - a.cards), added = o.S.keys('resource/set/multiplayer/armies/').map(k => path.basename(k, '.set'));
    return { text: lines([head + C.rows.length + ' buy card(s) over ' + rows.length + ' side(s)' + (added.length ? '; armies RobZ adds: ' + added.join(', ') : '') + '. Unit sets (one per year range, picked by the preset): ' + C.sets.filter(s => s.cards).map(s => s.set + ' ' + s.cards).join(', ') + '.',
      ...rows.map(b => '- ' + b.side + ': ' + b.cards + ' cards (' + b.vehicles + ' vehicles and guns, ' + b.squads + ' squads and soldiers), cost ' + b.min + ' .. ' + b.max),
      'A card that differs by price or rank between two year sets counts once per value. One army\'s cards: mow_robz_unit with side.']),
      data: { game: g.id, version: o.x.version, kind, sides: rows, sets: C.sets, armiesAdded: added } };
  }
  // doctrine: the macros exist, what calls them
  const defs = [...L.defines(o.S)].filter(([name, rows]) => /doc/i.test(name) && rows.some(r => r.file.includes('/multiplayer/'))).map(([name]) => name);
  let calls = 0; const called = {};
  for (const k of o.S.keys('resource/set/multiplayer/units/')) { const tx = L.text(o.S, k); for (const d of defs) { const c = tx.split('("' + d + '"').length - 1; if (c) { calls += c; called[d] = (called[d] || 0) + c; } } }
  const tagged = C.rows.filter(r => /doctrine|\bdoc\b/.test(lc(r.tags))).length;
  return { text: lines([head + defs.length + ' doctrine card macro(s) are defined (' + defs.slice(0, 8).join(', ') + (defs.length > 8 ? ' ...' : '') + '), called ' + calls + ' time(s); ' + tagged + ' buy card(s) carry a doctrine tag.',
    calls || tagged ? 'So this version does use doctrine cards: ' + Object.entries(called).map(([k, c]) => k + ' ' + c).join(', ') + '.' : 'So RobZ has no doctrine choice in play: what an army can buy is decided by the year of the preset (unit sets) and the unit limits, not by a doctrine.',
    'Presets and their unit sets: mow_robz_system kind preset. How the game\'s own doctrines and CP work: mow_lookup, skill mow-play-coach.']),
    data: { game: g.id, version: o.x.version, kind, defines: defs, calls, called, taggedCards: tagged } };
}

// ---------- units and prices ----------
const cardLine = r => r.id + '  [' + [r.side, r.kind].filter(Boolean).join(' ') + ']  cost ' + (r.cost == null ? '-' : r.cost) + (lc(r.button) === 'hero' ? ' special points' : '') + (r.level != null ? ', rank ' + r.level : '') + (r.charge != null ? ', cooldown ' + r.charge + ' s' : '') + (r.cp != null ? ', CP ' + r.cp : '') + (r.fore != null ? ', head start ' + r.fore : '') + '  (' + r.sets.map(s => s.replace(/^units_/, '')).join(', ') + ')';
async function unit(args, ctx) {
  const g = ctx.game(args); if (g.kind === 'goh') return { na: D.NA };
  const o = open(ctx, g, args, true), C = L.cards(o.S, o.G), ws = words(args.q || ''), n = Math.min(Math.max(args.limit || 25, 1), 200);
  const side = lc(args.side || ''), year = lc(args.year || ''), kind = lc(args.kind || '');
  let hit = C.rows.filter(r => (!side || r.side === side) && (!kind || r.kind === kind) && (!year || r.sets.some(s => s.includes(year))) && (!ws.length || hasAll(lc(r.id + ' ' + r.tags + ' ' + r.content), ws)));
  if (args.max_cost != null) hit = hit.filter(r => r.cost != null && r.cost <= args.max_cost);
  const exact = hit.filter(r => lc(r.id) === lc(args.q || '').trim() || lc(r.id).replace(/\(.*$/, '') === lc(args.q || '').trim());
  hit.sort((a, b) => exact.includes(b) - exact.includes(a) || (args.sort === 'cost' ? (b.cost || 0) - (a.cost || 0) : a.id.localeCompare(b.id)) || (a.cost || 0) - (b.cost || 0));
  const R = U.list(hit, n, 'add side (ger, usa ...), kind (vehicle, squad, soldier), year (44) or more letters');
  const one = exact.length ? exact : hit.length <= 3 ? hit : [];
  const near = !hit.length && ws.length ? C.rows.filter(r => ws.some(w => w.length > 2 && lc(r.id).includes(w.slice(0, Math.max(3, w.length - 2))))).slice(0, 8).map(r => r.id) : [];
  return { text: lines([hit.length + ' buy card(s) of RobZ Realism ' + (o.x.version || '') + ' match' + (ws.length ? ' "' + args.q + '"' : '') + [side && ' side ' + side, kind && ' kind ' + kind, year && ' year ' + year].filter(Boolean).join(',') + (R.more ? ', first ' + R.rows.length + ' shown (' + R.hint + ')' : '') + '.',
    ...R.rows.map(r => '- ' + cardLine(r)),
    ...one.slice(0, 3).map(r => '  ' + r.id + ' brings: ' + (r.content || '-') + (r.tags ? '; tags ' + r.tags : '') + (r.button ? '; buy tab ' + r.button + (r.group ? ', cell ' + r.group : '') : '')),
    near.length ? 'Did you mean: ' + [...new Set(near)].join(', ') : null,
    'Values are the card numbers in set/multiplayer/units, macros expanded; the year list in brackets says which unit sets sell the card. The card id is the entity or squad name; its shown name is in the mod\'s desc text (mow_text_find). Armour, gun and shell numbers of the unit: mow_unit_stats / mow_matchup with the RobZ folder as mod.',
    C.errors.length ? '(' + C.errors.length + ' reader note(s) on the unit files, e.g. ' + C.errors[0].code + ' ' + C.errors[0].file + ':' + C.errors[0].line + ')' : null]),
    data: { game: g.id, version: o.x.version, total: hit.length, more: R.more, cards: R.rows, sets: C.sets } };
}

// ---------- a sub-mod against RobZ ----------
async function submod(args, ctx) {
  const g = ctx.game(args); if (g.kind === 'goh') return { na: D.NA };
  const sub = U.dirArg(ctx, args.submod, 'submod'), o = open(ctx, g, args, true), x = o.x;
  if (lc(path.resolve(sub)) === lc(path.resolve(x.dir))) return ctx.bad('submod is the RobZ folder itself; name the patch or sub-mod folder');
  const s = L.describe(sub, 'given'), F = [], add = (code, sev, msg) => F.push({ code, sev, msg });
  if (!s) add('NO_MODINFO', 'high', 'no mod.info in the sub-mod folder: the game does not list it as a mod');
  else {
    if (s.mode !== x.mode) add('MODE_MISMATCH', 'high', 'RobZ here is a ' + (x.mode === 'classic' ? 'legacy mod (' + x.min + ' .. ' + x.max + ')' : 'modern mod (Min ' + x.min + ')') + ', the sub-mod has MinGameVersion ' + (s.min || '(none)') + ': on AS64 Classic and Enhanced mods never mount together (VFS-48, VFS-54), and the 32-bit game refuses a range it is not in. Give the sub-mod the same range as RobZ');
    else if (x.mode === 'classic' && (s.min !== x.min || s.max !== x.max)) add('RANGE_DIFFERS', 'low', 'sub-mod range ' + (s.min || '(none)') + ' .. ' + (s.max || '(none)') + ', RobZ ' + x.min + ' .. ' + x.max + ': a legacy mod needs both keys and the game\'s data version inside them');
    const req = s.require.map(r => lc(r.split(':')[0]));
    if (!req.includes(lc(x.folder))) add('REQUIRE_MISSING', 'high', 'mod.info has no {Require "' + x.folder + '"}' + (s.require.length ? ' (it requires: ' + s.require.join(', ') + ')' : '') + ': without it the load order against RobZ is not guaranteed. Require names the FOLDER of the mod as the game loads it (a Workshop copy sits in a folder named by its item id) [V rule modweb/vfs/modinfo.md]');
    if (g.dir && lc(path.dirname(path.resolve(sub))) !== lc(path.join(g.dir, 'mods'))) add('NOT_INSTALLED', 'low', 'the sub-mod folder is not in <game>/mods, so the game does not see it yet');
  }
  const c = L.compare(o.S, sub);
  const hot = c.replaced.map(r => Object.assign({ why: D.neverWhy(r.file) }, r)).filter(r => r.why), cold = c.replaced.filter(r => !D.neverWhy(r.file));
  if (c.same.length) add('SAME_AS_ROBZ', 'low', c.same.length + ' file(s) are byte-identical copies of RobZ files (dead weight that also hides later RobZ updates of them): ' + c.same.slice(0, 5).map(r => r.file).join(', ') + (c.same.length > 5 ? ' ...' : ''));
  for (const r of hot.slice(0, 12)) add('WHOLE_FILE_COPY', 'high', r.file + ' replaces the RobZ file whole: ' + r.why);
  if (hot.length > 12) add('WHOLE_FILE_COPY', 'high', (hot.length - 12) + ' more shared RobZ file(s) replaced whole');
  if (cold.length) add('FILE_REPLACED', 'normal', cold.length + ' other RobZ file(s) are replaced whole (normal for one unit, weapon or texture; every later RobZ change to them is lost): ' + cold.slice(0, 6).map(r => r.file).join(', ') + (cold.length > 6 ? ' ...' : ''));
  for (const d of c.defines.slice(0, 8)) add('DEFINE_TWICE', 'normal', 'macro "' + d.name + '" is defined in ' + d.file + ':' + d.line + ' and by RobZ in ' + d.robz + ': which body a caller gets depends on the include order. Rename yours');
  if (c.defines.length > 8) add('DEFINE_TWICE', 'normal', (c.defines.length - 8) + ' more macro name(s) RobZ also defines');
  let clash = null;
  if (args.deep === true && s) {
    const tool = require('./mod').tools.find(t => t.name === 'mow_mods_clash');
    const inMods = d => g.dir && lc(path.dirname(path.resolve(d))) === lc(path.join(g.dir, 'mods'));
    const a = { game: g.id, limit: args.limit || 15, mods: [], mod_dirs: [] };
    if (inMods(x.dir)) a.mods.push(x.folder); else a.mod_dirs.push(x.dir);
    if (inMods(sub) && !a.mod_dirs.length) a.mods.push(path.basename(sub)); else a.mod_dirs.push(sub);
    clash = await tool.handler(a, ctx);
  }
  const order = { high: 0, normal: 1, low: 2 }; F.sort((a, b) => order[a.sev] - order[b.sev]);
  const high = F.filter(f => f.sev === 'high').length;
  return { text: lines([(s ? (s.name || path.basename(sub)) : path.basename(sub)) + ' against RobZ Realism ' + (x.version || '') + ' (' + where(x) + ') on ' + gameWord(g) + ': ' + c.files + ' file(s), ' + c.fresh + ' new, ' + c.replaced.length + ' replace a RobZ file, ' + c.same.length + ' identical to RobZ. ' + (F.length ? F.length + ' finding(s), ' + high + ' serious.' : 'No finding.'),
    ...F.map(f => '- ' + f.code + ' [' + f.sev + ']: ' + f.msg),
    clash ? 'Clashes per file and key (mow_mods_clash):' : 'Per-key clashes were not read: deep: true runs mow_mods_clash on the pair (half a minute or more on a mod this size); mow_mods_patch plans a patch that keeps both sides.',
    clash ? String(clash.text || '') : null,
    'Static read only: a sub-mod is [T] until the game ran RobZ + the sub-mod and game.log was read (mow_game_log).']),
    data: { game: g.id, robz: { version: x.version, folder: x.folder, mode: x.mode }, submod: s ? { name: s.name, min: s.min, max: s.max, mode: s.mode, require: s.require } : null,
      files: c.files, fresh: c.fresh, same: U.list(c.same.map(r => r.file), 40), replaced: U.list(c.replaced.map(r => r.file), 60), shared: hot.map(r => r.file).slice(0, 60), defines: c.defines.slice(0, 40), findings: F, clash: clash && clash.data ? clash.data : null } };
}

// ---------- known issues ----------
async function issues(args, ctx) {
  const g = ctx.game(args); if (g.kind === 'goh') return { na: D.NA };
  let ver = args.version ? String(args.version) : '', from = 'given';
  if (!ver) { const o = open(ctx, g, args, false); if (o && o.x.version) { ver = o.x.version; from = 'the install'; } }
  const ws = words(args.q || ''), area = lc(args.area || '');
  const fits = i => i.v === 'all' || !ver || ver.startsWith(i.v) || i.v.startsWith(ver);
  const hit = D.ISSUES.filter(i => fits(i) && i.games.includes(g.id) && (!area || i.area === area) && (!ws.length || hasAll(lc(i.id + ' ' + i.area + ' ' + i.text), ws)));
  const other = D.ISSUES.filter(i => !fits(i) && i.games.includes(g.id)).length;
  return { text: lines([hit.length + ' known issue(s) of RobZ Realism' + (ver ? ' ' + ver + ' (version from ' + from + ')' : ' (no version given or found: all versions)') + ' on ' + gameWord(g) + (area ? ', area ' + area : '') + (ws.length ? ', matching "' + args.q + '"' : '') + '.',
    ...hit.map(i => '- ' + i.id + ' (' + i.area + ') [' + i.tag + '] ' + i.text + '  -> ' + i.ref),
    other ? '(' + other + ' more are recorded for other versions; pass version)' : null,
    'Areas: ' + [...new Set(D.ISSUES.map(i => i.area))].join(', ') + '. Tags: [V] seen or measured, [I] inferred, [T] open, needs a game test, [author] from the mod\'s description. A crash you have now: mow_game_log first.']),
    data: { game: g.id, version: ver || null, total: hit.length, issues: hit } };
}

// ---------- the digest notes ----------
async function notes(args, ctx) {
  const g = ctx.game(args);
  const all = L.notes(ctx.ROOT), ws = words(args.topic || args.q || ''), file = lc(args.file || '');
  if (g.kind === 'goh') {
    const c = all.filter(s => /goh-candidate/.test(s.file));
    return { na: D.NA, text: lines(['not available: ' + D.NA, ...c.slice(0, 1).map(s => U.short(s.text, 1500))]), data: { game: g.id } };
  }
  if (!all.length) return { text: lines(['The notes folder refmods/robz is not beside this server (it lives in the ARSENAL repo). The short digest instead:', ...D.AREAS.map(a => '- ' + a.title + ': ' + a.rows[0])]), data: { game: g.id, notes: false, areas: D.AREAS.map(a => a.id) } };
  const files = {}; for (const s of all) (files[s.file] = files[s.file] || []).push(s.head);
  if (!ws.length && !file) return { text: lines([Object.keys(files).length + ' note file(s) on RobZ Realism in refmods/robz, ' + all.length + ' section(s). Pass topic (words) or file to read.',
    ...Object.entries(files).map(([f, hs]) => '- ' + f + ': ' + hs.slice(0, 6).map(h => U.short(h, 60)).join(' | ') + (hs.length > 6 ? ' | ... ' + (hs.length - 6) + ' more' : ''))]), data: { game: g.id, files } };
  const pool = file ? all.filter(s => lc(s.file).includes(file)) : all;
  const scored = pool.map(s => { const h = lc(s.head), b = lc(s.text); let sc = 0; for (const w of ws) { if (h.includes(w)) sc += 5; const c = b.split(w).length - 1; if (!c && !h.includes(w)) return null; sc += Math.min(c, 5); } return { s, sc }; }).filter(Boolean).sort((a, b) => b.sc - a.sc);
  const n = Math.min(Math.max(args.limit || 3, 1), 8), cut = Math.floor(6000 / n);
  return { text: lines([scored.length + ' section(s) of refmods/robz' + (file ? ' (' + args.file + ')' : '') + (ws.length ? ' match "' + ws.join(' ') + '"' : '') + (scored.length > n ? ', the ' + n + ' best shown' : '') + '. The notes say what was read or run; each fact carries its own tag.',
    ...scored.slice(0, n).map(x => '--- ' + x.s.file + ' > ' + x.s.head + '\n' + U.short(x.s.text, cut)),
    scored.length > n ? 'Others: ' + scored.slice(n, n + 8).map(x => x.s.file.replace('refmods/robz/', '') + ' > ' + U.short(x.s.head, 50)).join(' | ') : null,
    !scored.length ? 'Nothing matches. Files: ' + Object.keys(files).map(f => f.replace('refmods/robz/', '')).join(', ') : null]),
    data: { game: g.id, total: scored.length, sections: scored.slice(0, n).map(x => ({ file: x.s.file, head: x.s.head })) } };
}

const ALL = GAMES;
const pick = { mod: P.mod, version: P.version };
const GOH = ' Gates of Hell (goh): not available, RobZ is an Assault Squad 2 mod.';
const tools = [
  { name: 'mow_robz_find', title: 'Find RobZ Realism', kind: 'read', games: ALL, wraps: 'robz/lib scan (mod.info of <game>/mods and the Workshop folder)',
    description: 'Find the installed RobZ Realism mod(s): in <game>/mods, in the Steam Workshop folder, or the folder given as mod. Answers version (from mod.info), layout (paks or loose files), the game version range and what it means on this game (MoW:AS2: native; AS64: Classic mode only unless it is an upgraded copy), duplicates, and the mods that name RobZ (companions, patches). Call it first.' + GOH,
    inputSchema: schema(pick), handler: find },
  { name: 'mow_robz_changes', title: 'What RobZ changes', kind: 'read', games: ALL, wraps: 'robz/data digest of refmods/robz + live counts (robz/lib cards, presets, tiers)',
    description: 'What this RobZ Realism version changes against the game, short and by area: damage (tank damage scripts and shell tiers), guns, infantry, economy, armies, modes (and bots), content. Live counts are read from the RobZ folder; each fact carries a tag [V] measured, [I] inferred, [T] untested, [author]. Pass area for every row of one area.' + GOH,
    inputSchema: schema(Object.assign({ area: { type: 'string', enum: D.AREAS.map(a => a.id), description: 'One area in full; left out = two rows per area' } }, pick)), handler: changes },
  { name: 'mow_robz_system', title: 'RobZ systems lookup', kind: 'read', games: ALL, wraps: 'robz/lib defines, presets, tiers, cards (lib/sdlx expansion)',
    description: 'Look up RobZ Realism\'s own systems in the installed folder. kind macro: its macro defines (name, parameters, file:line, comment) by q. kind preset: income (MP start and end), command points, unit limits and unit set per mode and preset. kind tier: shell tiers and their damage-counter points. kind army: sides, card counts, price range, year unit sets. kind doctrine: whether doctrine cards are in use.' + GOH,
    inputSchema: schema(Object.assign({ kind: { type: 'string', enum: KINDS, description: 'macro (default), preset, tier, army or doctrine' }, q: P.q, limit: P.limit }, pick)), handler: system },
  { name: 'mow_robz_unit', title: 'RobZ units and prices', kind: 'read', games: ALL, wraps: 'robz/lib cards (set/multiplayer/units, macros expanded with lib/sdlx)',
    description: 'Find buy cards of RobZ Realism and their price, rank, cooldown, command points, head start, what the card brings and in which year sets it is sold. Reads RobZ\'s macro-built cards directly (the general unit tools do not list them). Filter by q (words of the card id, tags or content), side, kind, year, max_cost; sort: "cost". For armour and gun numbers use mow_unit_stats or mow_matchup with the RobZ folder.' + GOH,
    inputSchema: schema(Object.assign({ q: P.q, side: { type: 'string', description: 'Army side: ger, ger2, ger_ss, rus, rus_guard, usa, eng, jap, axis_minor' }, kind: { type: 'string', enum: ['vehicle', 'squad', 'soldier'], description: 'Card kind' },
      year: { type: 'string', description: 'Part of a unit set name, e.g. 44 or 41' }, max_cost: { type: 'number', description: 'Only cards that cost this or less' }, sort: { type: 'string', enum: ['id', 'cost'], description: 'id (default) or cost, highest first' }, limit: P.limit }, pick)), handler: unit },
  { name: 'mow_robz_submod', title: 'Check a sub-mod of RobZ', kind: 'read', games: ALL, wraps: 'robz/lib compare + mod group mow_mods_clash (conflicts) with deep',
    description: 'Check a patch or sub-mod that loads after RobZ Realism: mod.info (same mode and version range as RobZ, Require on the RobZ folder), files that are identical copies of RobZ files, shared RobZ files replaced whole (damage scripts, property macros, unit cards, presets, bot data, .lng) and macro names defined twice. deep: true adds the per-key clashes of mow_mods_clash (slow on a mod this size). Reads only; fix with mow_mods_patch.' + GOH,
    inputSchema: schema(Object.assign({ submod: { type: 'string', description: 'Full path of the patch or sub-mod folder' }, deep: { type: 'boolean', description: 'true = also run the per-key clash check (half a minute or more)' }, limit: P.limit }, pick), ['submod']), handler: submod },
  { name: 'mow_robz_issues', title: 'Known issues of RobZ', kind: 'read', games: ALL, wraps: 'robz/data ISSUES (from refmods/robz)',
    description: 'Known issues of a RobZ Realism version on this game: load and mode (AS64 Classic or Enhanced), crashes, bots, damage oddities, data defects, text, what differs in the 1.31.x tree. The version comes from version, else from the install found. Filter by area or q. Each row carries its tag ([V] seen, [I] inferred, [T] open) and where the long form is. For a crash happening now read the log first (mow_game_log).' + GOH,
    inputSchema: schema(Object.assign({ area: { type: 'string', description: 'as64, load, bots, crash, damage, layout, data, text or versions' }, q: P.q }, pick)), handler: issues },
  { name: 'mow_robz_notes', title: 'RobZ notes by topic', kind: 'read', games: ALL, wraps: 'refmods/robz/*.md of the repo, cut at headings',
    description: 'Read the digest notes on RobZ Realism kept in refmods/robz of the ARSENAL repo (findings, systems, systems-test, potential, upgrade plans, the godny combination) by topic: the best matching sections, cut short, with file and heading. No topic lists the files and headings. Use it when a tool answer points at refmods/robz. Gates of Hell (goh): answers the note on the GoH look-alike (goh-candidate.md) and says RobZ is not a GoH mod.',
    inputSchema: schema({ topic: { type: 'string', description: 'Words to look for, e.g. "damage counter", "bot names", "upgrade"' }, file: { type: 'string', description: 'Part of a note file name, e.g. systems' }, limit: P.limit }), handler: notes },
];

module.exports = { group: 'robz', tools };
