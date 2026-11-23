// recipe "mission", the Gates of Hell branch (game parity 2026-11-23): change the rules of one GoH game mode, in its mode card
// set/multiplayer/games/<mode>.set, the form the GoH install itself uses. Read on the GoH install [V 2026-11-23]:
// six cards (ammunition, battle_zones, campaign_capture_the_flag, cooperative, evacuation, frontlines), CRLF, {game {order N}
// {parameters ".."} {settings {options ..} {optionsAdvanced ..} {fogOfWar ..} {gameDuration "N min"} {impregnableTimeout N} ..}
// {teamSettings {teamsMode ..} {armySelectionMode ..} {teams {"a" {title ..}} {"b"}} {alliances (include "presets/alliances_generic.inc")}}
// {ranked {enabled}} (include "presets/<file>.inc")}.
// Which keys a mode reads: every card is read the same way, with one {settings} form and one {teamSettings} form, so every key in KEYS below is read for every mode, whether that
// card has it or not [I; what a mode's script does with it is T]. A key the card lacks is therefore added (under {settings},
// {teamSettings} or {game}); one it has is set in place; a switch is added as {k} or taken out. Enum values are the engine's own name
// tables: fogOfWar fog_off|fog_realistic, gameDuration "10 min".."120 min", teamsMode, armySelectionMode, veterancyMode.
// Also: the alliances (presets/alliances_generic.inc, {"Axis"|"Allies" {armies "x"}..}, included by every card that has alliances),
// the lobby money of the mode's preset rows (presets/*.inc: ("standard_all"|"custom_all" start(N) finish(N) ..), or start_a/_b and
// finish_a/_b; the files the card includes, and the files those include), a new mode of your own (newModeFiles: the .mi, .info and
// card of a mode the map has under the new name, the card with {class <base>} as the game's gamemode.template shows; its lobby name a
// .pot entry msgctxt "mp/game/<mode>", the key form of the game's dlg_mp.pot [V], the file place [I]). A mode the map lacks: copied or built from one it has (missions/gohmode.js). Everything goes
// into the mod through lib/modwrite (final file inside the mod, restore point first). Refused on GoH with a plain line: the money
// keys other than start and finish (unit set, command points, limits, charge factors, budget mode, payback: they sit in the shared
// presets/global_parameters files) and new units; .mi files go to the GoH editor, never started here. Nothing tried in game: [T].
// Author: Imperator_Aug (ARSENAL, ia-e35e34d3)
'use strict';
const path = require('path');

const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const badK = (k, m, p) => Object.assign(bad(m), { key: k }, p ? { params: p } : {});
const MG = () => require('./map.goh');
const GM = () => require('../../missions/gohmode');
const H0 = () => require('./map.recipe')._t;
const CARDS = ['battle_zones', 'ammunition', 'campaign_capture_the_flag', 'evacuation', 'frontlines', 'cooperative'];
const MODE_RE = /^[a-z0-9][a-z0-9_]{0,39}$/;
const cardKey = m => 'resource/set/multiplayer/games/' + m + '.set';
const ALLY_KEY = 'resource/set/multiplayer/games/presets/alliances_generic.inc';
const NOGOH = 'Set the Gates of Hell folder first (the Game folder button at the top): the task reads the game\'s mode cards.';
// the game's own value names [I]
const DURATIONS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 120];
const ENUMS = { fogOfWar: ['fog_off', 'fog_realistic'], teamsMode: ['normal', 'teammatch', 'deathmatch', 'default', 'none'], armySelectionMode: ['alliance', 'team', 'player', 'default'],
  veterancyMode: ['all', 'beginners', 'veterans'] };
// the words a lobby option list may hold: the ones the game's cards list, and the settings keys the lobby saves
const OPTION_WORDS = ['enableSpectators', 'preparationTime', 'enableHardcore', 'friendlyFire', 'loseOnZeroPoints', 'randomSpawnPoints', 'scoreFinal', 'fogOfWar', 'showPiercing',
  'showDamageReports', 'gameDuration', 'waveTime', 'difficulty', 'assignReinforcementsToPlayer', 'firstWaveTime', 'floraRespawn', 'resourceAmount', 'veterancyMode', 'enableBots', 'useUnitLevelRestrictions'];
const S = 'game/settings/', T = 'game/teamSettings/';
// number questions -> card path
const NUMS = { goh_score: { path: S + 'scoreFinal', min: 25, max: 100000, what: 'Score to win' },
  goh_prep: { path: S + 'preparationTime', min: 0, max: 3600, what: 'Preparation time' },
  impregnable: { path: S + 'impregnableTimeout', min: 0, max: 600, what: 'Spawn protection' },
  resource_amount: { path: S + 'resourceAmount', min: 0, max: 1000000, what: 'Custom money' },
  card_order: { path: 'game/order', min: -1000, max: 1000, what: 'Place in the mode list' },
  card_minplayers: { path: 'game/minPlayers', min: 1, max: 16, what: 'Fewest players' },
  card_maxplayers: { path: 'game/maxPlayers', min: 2, max: 16, what: 'Most players' } };
const FLAGS = { bots: [S + 'enableBots'], friendly: [S + 'friendlyFire'], showhits: [S + 'showPiercing', S + 'showDamageReports'], equalize: [T + 'equalizeTeams'] };
const TEAM_KEYS = { title: 'title', armies: 'armies', min_slots: 'minTeamSlots', max_slots: 'maxTeamSlots', ai: 'aiTeamPlayers' };
// every card path a row may name, and the form of its value
const ROWS = new Map([[S + 'scoreFinal', 'num'], [S + 'preparationTime', 'num'], [S + 'impregnableTimeout', 'num'], [S + 'resourceAmount', 'num'], ['game/order', 'num'],
  ['game/minPlayers', 'num'], ['game/maxPlayers', 'num'], [S + 'floraRespawn', 'num'], [S + 'useUnitLevelRestrictions', 'num'], [S + 'enableBots', 'flag'], [S + 'friendlyFire', 'flag'],
  [S + 'showPiercing', 'flag'], [S + 'showDamageReports', 'flag'], [T + 'equalizeTeams', 'flag'], ['game/ranked/enabled', 'flag'], ['game/ranked', 'flag'],
  [S + 'fogOfWar', 'fogOfWar'], [T + 'teamsMode', 'teamsMode'], [T + 'armySelectionMode', 'armySelectionMode'], [S + 'veterancyMode', 'veterancyMode'],
  [S + 'gameDuration', 'duration'], [S + 'optionsAdvanced', 'options']]);
for (const s of ['a', 'b']) for (const k of Object.values(TEAM_KEYS)) ROWS.set(T + 'teams/"' + s + '"/' + k, k === 'title' || k === 'armies' ? 'quoted' : 'num');
function rowWhy(r) {
  const p = String(r && r.path || ''), kind = ROWS.get(p);
  if (!kind) return 'Not a card setting this task changes: ' + p.slice(0, 60);
  if (!['set', 'add', 'del'].includes(r.op)) return 'Not a card change: ' + String(r.op).slice(0, 20);
  if (r.op === 'del') return kind === 'flag' ? null : 'Only an on or off switch is taken out: ' + p;
  const v = String(r.value == null ? '' : r.value);
  const ok = kind === 'num' ? /^-?\d{1,7}$/.test(v) : kind === 'flag' ? v === '' || v === '1' : kind === 'duration' ? DURATIONS.some(n => v === '"' + n + ' min"')
    : kind === 'options' ? v.split(' ').every(w => OPTION_WORDS.includes(w)) : kind === 'quoted' ? /^"[A-Za-z0-9_#/.\- ]{0,120}"$/.test(v) : (ENUMS[kind] || []).includes(v);
  return ok ? null : 'Not a value for ' + p.split('/').pop() + ': ' + v.slice(0, 40);
}

const gohDirOf = ctx => { try { return require('./skin.goh').gohDirOf(ctx); } catch (e) { return null; } };
const viewOf = dir => (dir ? { dir, exe: 'goh', gid: 'goh' } : null);
// a value directly at a path of the card (patch-entity's own reader, so the read and the write see the same key)
function valAt(buf, p) {
  // the key is there only when patch-entity finds it at that exact path (a nested {order} of a {ranked} block does not count)
  let e = null; try { e = require('../../../../patch-entity/patch-entity').applyEdit(buf, { op: 'set', path: p, value: '0' }); } catch (x) { e = { err: [0, 'unreadable'] }; }
  if (!e || e.err) return null;
  const t = H0().live(buf.toString('latin1')), parts = p.split('/');
  const k = parts.pop(), host = blockAt(t, parts);
  if (host == null) return null;
  const m = new RegExp('\\{\\s*' + k + '(?:\\s+("[^"]*"|[^{}]*?))?\\s*\\}', 'i').exec(host);
  return m ? (m[1] == null ? '' : m[1].trim().replace(/^"|"$/g, '')) : null;
}
// the text of the nested block game/settings (first match at each level; enough for the six cards)
function blockAt(t, parts) {
  let s = t;
  for (const p of parts) {
    const m = new RegExp('\\{\\s*' + p.replace(/"/g, '"') + (/"$/.test(p) ? '' : '\\b'), 'i').exec(s); if (!m) return null;
    let d = 0, j = m.index;
    for (; j < s.length; j++) { const ch = s[j]; if (ch === '"') { j = s.indexOf('"', j + 1); if (j < 0) return null; continue; } if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } }
    s = s.slice(m.index + m[0].length, j);
  }
  return s;
}
// what a card says now, by question
function cardVals(buf) {
  if (!buf) return null;
  const v = p => valAt(buf, p), n = p => { const x = v(p); return x != null && x !== '' && isFinite(+x) ? +x : null; };
  const on = p => { const x = v(p); return x != null && (x === '' || +x !== 0); };
  const dur = /^(\d+)\s*min$/.exec(v(S + 'gameDuration') || ''), out = {};
  for (const [q, d] of Object.entries(NUMS)) out[q] = n(d.path);
  Object.assign(out, { flora: n(S + 'floraRespawn'), unitlevel: n(S + 'useUnitLevelRestrictions'), bots: on(S + 'enableBots'), friendly: on(S + 'friendlyFire'),
    showhits: on(S + 'showPiercing') && on(S + 'showDamageReports'), equalize: on(T + 'equalizeTeams'), fog: v(S + 'fogOfWar'), duration: dur ? +dur[1] : null,
    veterancy: v(S + 'veterancyMode'), armies: v(T + 'armySelectionMode'), teams_mode: v(T + 'teamsMode'), options: v(S + 'optionsAdvanced'),
    ranked: (() => { const r = blockAt(H0().live(buf.toString('latin1')), ['game', 'ranked']); return r != null && /\{\s*enabled\s*(1\s*)?\}/i.test(r); })(), hasRanked: blockAt(H0().live(buf.toString('latin1')), ['game', 'ranked']) != null });
  const tm = require('./mission.recipe')._t.teamsOf(H0().live(buf.toString('latin1')));
  for (const s of ['a', 'b']) { out['team_' + s] = tm[s]; }
  return out;
}
const readCard = (H, g, mod, mode) => H.readKey(g, mod, cardKey(mode), []);
// the alliances file: {Axis: [armies], Allies: [armies]} (block names as the game writes them)
function alliesOf(buf) {
  const t = buf ? H0().live(buf.toString('latin1')) : '', out = {};
  for (const a of ['Axis', 'Allies']) { const b = blockAt(t, ['"' + a + '"']); out[a] = b == null ? null : [...b.matchAll(/\{\s*armies\s+"([^"]*)"/gi)].map(m => m[1].trim()).filter(Boolean); }
  return out;
}
// replace the {armies "x"} lines of one alliance block (CRLF, the game's indent): -> new text | null
function setAllies(t, name, armies) {
  const m = new RegExp('\\{"' + name + '"', 'i').exec(t); if (!m) return null;
  let d = 0, j = m.index; for (; j < t.length; j++) { if (t[j] === '{') d++; else if (t[j] === '}') { d--; if (!d) break; } }
  const NL = t.includes('\r\n') ? '\r\n' : '\n', body = t.slice(m.index, j), lines = body.split(NL);
  const at = lines.findIndex(l => /^\s*\{\s*armies\s/i.test(l)); if (at < 0) return null;
  const ind = /^\s*/.exec(lines[at])[0], keep = lines.filter(l => !/^\s*\{\s*armies\s/i.test(l));
  keep.splice(at, 0, ...armies.map(a => ind + '{armies "' + a + '"}'));
  return t.slice(0, m.index) + keep.join(NL) + t.slice(j);
}
// the preset files of a card: its (include "presets/x.inc") lines and what those include in turn -> ['resource/.../presets/x.inc']
function presetFiles(H, g, mod, cardText) {
  const dir = 'resource/set/multiplayer/games/', out = [], seen = new Set();
  const walk = (t, base, depth) => {
    for (const m of H0().live(t).matchAll(/\(\s*include\s+"([^"]+\.inc)"/gi)) {
      const rel = path.posix.normalize(base + m[1]); if (seen.has(rel) || !rel.startsWith(dir + 'presets/') || rel.includes('/global_parameters/')) continue;
      seen.add(rel); const b = H.readKey(g, mod, rel, []); if (!b) continue;
      if (/\(\s*"(standard_all|custom_all)"/.test(b.toString('latin1'))) out.push(rel);
      if (depth < 2) walk(b.toString('latin1'), rel.slice(0, rel.lastIndexOf('/') + 1), depth + 1);
    }
  };
  walk(cardText || '', dir, 0);
  return out;
}
// set start and finish money in the preset rows of a preset file: which 's' (standard), 'c' (custom) or both -> {t, n}
function setMoney(t, which, start, finish) {
  let n = 0;
  const out = t.replace(/(\{"([sc]):[^"]*"[^{}]*?(?:\{[^{}]*\}[^{}]*?)*?\(\s*"(?:standard_all|custom_all)"[^\r\n]*)/g, (blk, x, kind, at) => {
    if (which !== 'both' && which !== kind) return blk;
    if (t.slice(t.lastIndexOf('\n', at) + 1, at).includes(';') || /\r?\n\s*;[^\r\n]*\(\s*"(standard|custom)_all"[^\r\n]*$/.test(blk)) return blk; // a commented row stays as it is
    return blk.replace(/\b(start|finish)(_[ab])?\((\d+)\)/g, (m, k, s) => { const v = k === 'start' ? start : finish; if (v == null) return m; n++; return k + (s || '') + '(' + v + ')'; });
  });
  return { t: out, n };
}
// the first preset row's start and finish money of a file (for the values)
function moneyOf(t) { const m = /\(\s*"(?:standard_all|custom_all)"[^)\r\n]*?\bstart(?:_a)?\((\d+)\)[^)\r\n]*?\bfinish(?:_a)?\((\d+)\)/.exec(t || ''); return m ? { start: +m[1], finish: +m[2] } : null; }
// a new mode of your own (the game's set/multiplayer/games/gamemode.template: "{class gamemodeBaseType}", the base game mode a card
// inherits its implementation from; a card without it plays as its file name [I]): the card of the picked mode with {class <its class>} after {game, and that mode's .mi and .info of
// the map under the new name, byte for byte -> {card, cls, files: [[rel, Buffer]]} | {why}
function newModeFiles(read, key, from, name) {
  const src = read(cardKey(from)); if (!src) return { why: 'no card for ' + from + '.' };
  const s = src.toString('latin1'), live = H0().live(s), NL = s.includes('\r\n') ? '\r\n' : '\n';
  const own = /\{\s*class\s+"?([a-z0-9_]+)"?\s*\}/i.exec(live), cls = own ? own[1].toLowerCase() : from;
  const gm = /\{\s*game\b[^\r\n]*\r?\n/i.exec(live); if (!gm) return { why: 'the ' + from + ' card has no {game} block.' };
  const card = own ? src : Buffer.from(s.slice(0, gm.index + gm[0].length) + '\t{class ' + cls + '}' + NL + s.slice(gm.index + gm[0].length), 'latin1');
  const files = [];
  for (const ext of ['mi', 'info']) {
    const b = read('resource/' + key + '/' + from + '.' + ext); if (!b) return { why: 'the map has no ' + from + '.' + ext + '.' };
    files.push(['resource/' + key + '/' + name + '.' + ext, b]);
  }
  return { card, cls, files };
}
const pq = s =>'"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const potOf = (ctxKey, title) => Buffer.from(['msgid ""', 'msgstr ""', '"Content-Type: text/plain; charset=UTF-8\\n"', '"Content-Transfer-Encoding: 8bit\\n"', '',
  'msgctxt ' + pq(ctxKey), 'msgid ' + pq(title), 'msgstr ""', ''].join('\r\n'), 'utf8');
// the place: the game's own template mod keeps its strings in localizations/default/interface/text/main.pot (CRLF, no BOM, msgid "" header)
const titleRel = mode => 'localizations/default/interface/text/mode_' + mode + '.pot';

// ---- values on GoH: the first mode of the picked map that has a card, and what that card says now
async function values(ctx, base, opt, out) {
  const H = H0(), key = H.mapKeyOf(base && base.id), g = viewOf(gohDirOf(ctx)), mod = ctx.mod || '';
  out.goh_mode = 'battle_zones';
  if (!g) return out;
  const modes = key ? MG().modesOf(H, g, mod, key).filter(m => CARDS.includes(m)) : [];
  out.goh_mode = modes[0] || 'battle_zones';
  const buf = readCard(H, g, mod, out.goh_mode), cv = cardVals(buf);
  if (!cv) return out;
  for (const k of Object.keys(NUMS)) out[k] = cv[k] == null ? '' : cv[k];
  Object.assign(out, { flora: cv.flora === 1, unitlevel: cv.unitlevel === 1, bots: cv.bots, friendly: cv.friendly, showhits: cv.showhits, equalize: cv.equalize,
    fog: cv.fog || 'fog_realistic', goh_duration: cv.duration == null ? '' : cv.duration, veterancy: cv.veterancy || 'keep', armies: cv.armies || 'alliance',
    teams_mode: cv.teams_mode || 'normal', lobby_options: cv.options || '', card_ranked: cv.ranked });
  for (const s of ['a', 'b']) for (const [q, k] of Object.entries(TEAM_KEYS)) { const x = cv['team_' + s][q]; out['team_' + s + '_' + q] = k === 'armies' ? String(x || '').split(/\s+/).filter(Boolean) : x == null ? '' : /Slots|Players/.test(k) && isFinite(+x) ? +x : x; }
  const al = alliesOf(H.readKey(g, mod, ALLY_KEY, []));
  if (al.Axis) out.alliance_axis = al.Axis; if (al.Allies) out.alliance_allies = al.Allies;
  const pf = presetFiles(H, g, mod, buf.toString('latin1')), mo = pf.length ? moneyOf(H.readKey(g, mod, pf[0], []).toString('latin1')) : null;
  if (mo) { out.money_start = mo.start; out.money_finish = mo.finish; }
  return out;
}

// ---- compile on GoH -> {calls, notes, result}: rows for the recipe's own route
function compile(draft, c) {
  const H = H0(), dir = c.gameDir;
  if (!dir) throw badK('task.mission.e.nogoh', NOGOH);
  if (!c.mod || !path.isAbsolute(c.mod)) throw bad('Pick your mod first: the card is written only into the mod you picked.');
  const key = H.mapKeyOf(c.base && c.base.id);
  if (!key || !/^map\/multi\/[a-z0-9_\-./]+$/.test(key) || key.includes('..')) throw bad('Pick the Gates of Hell multiplayer map the mode is played on first.');
  const g = viewOf(dir), notes = [], rows = [];
  const asked = id => { const a = c.answer(id); return !!a && a.src !== 'keep'; };
  let mode = String(c.value('goh_mode') || '');
  if (!CARDS.includes(mode)) throw bad('Pick the Gates of Hell game mode: ' + CARDS.join(', ') + '.');
  const modes = MG().modesOf(H, g, c.mod, key), read = rel => H.readKey(g, c.mod, rel, []);
  let addMode = null, buf = null, title = null;
  if (H.yes(c.value('newmode'))) {
    // a mode of your own: the picked mode of the map under a new name (its .mi, .info and card), then the rules below on its card
    const name = String(c.value('with_mode') || '').trim().toLowerCase();
    if (!MODE_RE.test(name)) throw badK('task.mission.e.gohnew', 'A new mode of your own: its name takes small English letters, digits and _ only, up to 40 signs.', { name: name.slice(0, 40), why: 'small English letters, digits and _ only, up to 40 signs' });
    if (CARDS.includes(name) || read(cardKey(name)) || modes.includes(name)) throw badK('task.mission.e.gohnew', 'A new mode of your own: ' + name + ' is a mode the game or your mod has already.', { name, why: 'the game or your mod has a mode of that name already' });
    if (!modes.includes(mode)) throw badK('task.mission.e.gohmode', 'This map has no ' + mode + ' mode (it has: ' + (modes.join(', ') || 'none') + '). The new mode starts from a mode the map has.', { mode, modes: modes.join(', ') || 'none', why: 'the new mode starts from a mode the map has.' });
    const p = newModeFiles(read, key, mode, name);
    if (p.why) throw badK('task.mission.e.gohnew', 'A new mode of your own: ' + p.why, { name, why: p.why });
    buf = p.card;
    addMode = { to: name, from: mode, newMode: true };
    notes.push('The new mode ' + name + ' is a card of its own (' + cardKey(name) + ', {class ' + p.cls + '}: it plays as ' + p.cls + ') with ' + name + '.mi and ' + name + '.info on this map, copies of the ' + mode + ' ones: the lobby lists it for this map [T].');
    const tt = String(c.value('mode_title') || '').trim();
    if (tt) { if (/["\r\n]/.test(tt) || tt.length > 80) throw bad('The mode name in the lobby: one line, up to 80 signs, no " sign.'); title = tt; notes.push('Lobby name "' + tt + '": msgctxt mp/game/' + name + ' in ' + titleRel(name) + ' [I: the game reads the .pot files of a mod\'s localizations/default/interface/text, as its own template mod does; the key is the form of the game\'s own modes] [T].'); }
    mode = name;
  } else if (!modes.includes(mode)) {
    // a mode the map lacks: a copy or a build of a mode the map has (missions/gohmode.js plan), else refused with what is missing
    const p = GM().plan({ read, srcKey: key, key, modes, to: mode });
    if (!p.ok) { const why = MG().sayEn(p.why); throw badK('task.mission.e.gohmode', 'This map has no ' + mode + ' mode (it has: ' + (modes.join(', ') || 'none') + '). ' + why, { mode, modes: modes.join(', ') || 'none', why }); }
    addMode = { to: mode, from: p.from };
    notes.push(...p.say.map(s => MG().sayEn(s)));
  }
  buf = buf || readCard(H, g, c.mod, mode);
  if (!buf) throw bad('No card for the ' + mode + ' mode (' + cardKey(mode) + ').');
  const cv = cardVals(buf), added = [];
  const put = (p, now, value) => { rows.push({ path: p, op: now == null ? 'add' : 'set', value }); if (now == null) added.push(p.split('/').pop()); };
  for (const [q, d] of Object.entries(NUMS)) {
    if (!asked(q)) continue;
    const raw = c.value(q); if (raw == null || String(raw).trim() === '') continue;
    const x = Math.round(Number(String(raw).replace(',', '.')));
    if (!isFinite(x) || x < d.min || x > d.max) throw bad(d.what + ': ' + d.min + ' to ' + d.max + '.');
    if (x !== cv[q]) put(d.path, cv[q], String(x));
  }
  const mn = asked('card_minplayers') && String(c.value('card_minplayers') || '').trim() !== '' ? +c.value('card_minplayers') : cv.card_minplayers, mx = asked('card_maxplayers') && String(c.value('card_maxplayers') || '').trim() !== '' ? +c.value('card_maxplayers') : cv.card_maxplayers;
  if (mn != null && mx != null && mn > mx) throw bad('The fewest players (' + mn + ') are more than the most players (' + mx + ').');
  for (const [q, p] of [['flora', S + 'floraRespawn'], ['unitlevel', S + 'useUnitLevelRestrictions']]) {
    if (!asked(q)) continue;
    const on = H.yes(c.value(q)), now = cv[q];
    if ((now === 1) !== on) put(p, now, on ? '1' : '0');
  }
  for (const [q, keys] of Object.entries(FLAGS)) {
    if (!asked(q)) continue;
    const on = H.yes(c.value(q));
    for (const p of keys) {
      const now = valAt(buf, p), has = now != null, isOn = has && (now === '' || +now !== 0);
      if (on && !has) rows.push({ path: p, op: 'add', value: '' });
      else if (on && !isOn) rows.push({ path: p, op: 'set', value: '1' });
      else if (!on && has) rows.push({ path: p, op: 'del' });
    }
  }
  if (asked('card_ranked')) {
    const on = H.yes(c.value('card_ranked'));
    if (on && !cv.ranked) rows.push({ path: 'game/ranked/enabled', op: 'add', value: '' });
    else if (!on && cv.hasRanked) rows.push({ path: 'game/ranked', op: 'del' });
    if (on) notes.push('Ranked on in the ' + mode + ' card: a map counts as ranked only where its <mode>.info has {ranked {enabled}} too (the map task sets it) [T].');
  }
  // engine enums
  for (const [q, p, k] of [['fog', S + 'fogOfWar', 'fogOfWar'], ['armies', T + 'armySelectionMode', 'armySelectionMode'], ['teams_mode', T + 'teamsMode', 'teamsMode'], ['veterancy', S + 'veterancyMode', 'veterancyMode']]) {
    if (!asked(q)) continue;
    const x = String(c.value(q) || '').trim(); if (!x || x === 'keep') continue;
    if (!ENUMS[k].includes(x)) throw bad(q + ': one of ' + ENUMS[k].join(', ') + '.');
    const now = valAt(buf, p); if (now !== x) put(p, now, x);
  }
  if (asked('goh_duration') && String(c.value('goh_duration') || '').trim() !== '') {
    const x = Math.round(+c.value('goh_duration'));
    if (!DURATIONS.includes(x)) throw bad('Match length: one of ' + DURATIONS.join(', ') + ' minutes (the lobby list of the game).');
    if (x !== cv.duration) put(S + 'gameDuration', valAt(buf, S + 'gameDuration'), '"' + x + ' min"');
  }
  if (asked('lobby_options')) {
    const words = String(c.value('lobby_options') || '').trim().split(/\s+/).filter(Boolean), off = words.filter(w => !OPTION_WORDS.includes(w));
    if (off.length) throw bad('Lobby options: ' + off.join(', ') + ' is not a word the game reads. Use: ' + OPTION_WORDS.join(' ') + '.');
    if (words.join(' ') !== String(cv.options || '').trim().split(/\s+/).filter(Boolean).join(' ')) { if (!words.length) throw bad('Lobby options: name at least one.'); put(S + 'optionsAdvanced', cv.options, words.join(' ')); }
  }
  // the two teams of the card
  for (const s of ['a', 'b']) for (const [q, k] of Object.entries(TEAM_KEYS)) {
    const id = 'team_' + s + '_' + q; if (!asked(id)) continue;
    const raw = c.value(id), cur = cv['team_' + s];
    let val;
    if (k === 'armies') { const l = [].concat(raw == null ? [] : raw).join(' ').split(/\s+/).map(x => x.trim().toLowerCase()).filter(Boolean); if (l.some(x => !/^[a-z0-9_]{1,24}$/.test(x))) throw bad('Team ' + s + ' armies: army tags such as ger rus usa.'); val = l.length ? '"' + l.join(' ') + '"' : null; }
    else if (k === 'title') { const x = String(raw || '').trim(); if (x && !/^[A-Za-z0-9_#/.\-]{1,80}$/.test(x)) throw bad('Team ' + s + ' name: a text key such as mp/settings/team#defenders, no spaces.'); val = x ? '"' + x + '"' : null; }
    else { const x = String(raw == null ? '' : raw).trim(); if (x === '') continue; const nn = Math.round(+x); if (!isFinite(nn) || nn < 0 || nn > 8) throw bad('Team ' + s + ' ' + q.replace('_', ' ') + ': 0 to 8.'); val = String(nn); }
    if (val == null) continue;
    if (!cur.has) { notes.push('Team ' + s + ': the ' + mode + ' card has no team "' + s + '" (' + (mode === 'cooperative' ? 'it has one team, coop' : 'no {teams} block') + '); ' + k + ' not set.'); continue; }
    const now = cur[q]; if (now != null && ('"' + now + '"' === val || now === val)) continue;
    put(T + 'teams/"' + s + '"/' + k, now, val);
  }
  // alliances: one file every card with alliances includes
  let allies = null;
  for (const [q, a] of [['alliance_axis', 'Axis'], ['alliance_allies', 'Allies']]) {
    if (!asked(q)) continue;
    const l = [].concat(c.value(q) == null ? [] : c.value(q)).join(' ').split(/\s+/).map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!l.length || l.some(x => !/^[a-z0-9_]{1,24}$/.test(x))) throw bad('Alliance ' + a + ': one army tag or more, such as ger fin.');
    const now = alliesOf(H.readKey(g, c.mod, ALLY_KEY, []))[a];
    if (!now) throw bad('No alliance ' + a + ' in ' + ALLY_KEY + '.');
    if (now.join(' ') !== l.join(' ')) (allies = allies || {})[a] = l;
  }
  if (allies) notes.push('Alliances ' + Object.entries(allies).map(([a, l]) => a + ': ' + l.join(' ')).join('; ') + ' in ' + ALLY_KEY + ': every mode that includes it (battle zones, ammunition, evacuation, front lines, campaign) gets them while the mod is on [T].');
  // lobby money: start and finish of the mode's preset rows
  let money = null;
  if (H.yes(c.value('eco_on'))) {
    const which = { standard: 's', custom: 'c', both: 'both' }[String(c.value('eco_preset') || 'standard')] || 's';
    const num = q => { if (!asked(q)) return null; const x = String(c.value(q) == null ? '' : c.value(q)).trim(); if (x === '') return null; const nn = Math.round(+x); if (!isFinite(nn) || nn < 0 || nn > 100000) throw bad(q.replace('_', ' ') + ': 0 to 100000.'); return nn; };
    const start = num('money_start'), finish = num('money_finish');
    const files = presetFiles(H, g, c.mod, buf.toString('latin1'));
    if (!files.length) throw badK('task.mission.e.goheco', 'The ' + mode + ' card has no lobby money rows (start and finish) in its preset files.', { mode });
    for (const q of ['unitset', 'command_points', 'unit_limits', 'charge_factors', 'balance_cp', 'balance_mp', 'budget_mode', 'grow_time', 'money_min', 'money_max', 'payback_cp', 'payback_restore', 'grow_factors', 'money_period', 'money_speed'])
      if (asked(q)) notes.push('Not in Gates of Hell here: ' + q.replace(/_/g, ' ') + ' (the game keeps it in the shared presets/global_parameters files of every mode).');
    if (start != null || finish != null) {
      money = { which, start, finish, files };
      notes.push('Lobby money' + (start != null ? ' start ' + start : '') + (finish != null ? ' finish ' + finish : '') + ' in the ' + (which === 'both' ? 'standard and custom' : which === 's' ? 'standard' : 'custom') + ' rows of ' + files.map(f => f.split('/').pop()).join(', ') + ': every mode that includes these files gets it while the mod is on [T].');
    }
  }
  if (added.length) notes.push('Added to the ' + mode + ' card (every mode card is read with these keys by the game): ' + added.join(', ') + ' [T: what the mode does with it].');
  if (rows.length) notes.push('The ' + mode + ' card changes for every map played in ' + mode + ' while the mod is on (' + rows.map(r => r.path.split('/').pop() + (r.op === 'del' ? ' off' : r.value ? ' ' + r.value : ' on')).join(', ') + '). Check the lobby and a match in game [T].');
  const ed = c.answer('editor');
  if (ed && ed.src === 'ext') notes.push('After Write: start the Gates of Hell editor (binaries/x64/call_to_arms_ed.exe in the game folder) with this mod on; this task never starts it. Open the map ' + key.split('/').pop() + ', load the ' + mode + ' mission (' + mode + '.mi), set the zones and start points, save, then come back and press Check.');
  notes.push('Not in Gates of Hell here: new units, and the lobby money keys other than start and finish.');
  const body = { mode, rows }; if (addMode) { body.addMode = addMode; body.map = key; } if (allies) body.allies = allies; if (money) body.money = money; if (title) body.title = title;
  const any = rows.length || addMode || allies || money;
  const calls = any ? [{ route: 'POST /api/x/task/r/mission/goh', body, dryFlag: 'write', ok: r => !!r && r.ok === true }] : [];
  if (!any) notes.push('Nothing to change: every answer is as the ' + mode + ' card has it.');
  return { calls, notes, result: key.replace(/^map\//, '') + ':' + mode };
}

// ---- own route: POST /api/x/task/r/mission/goh {mod, mode, rows: [{path, op, value}], map, addMode: {to, from, newMode}, allies, money,
// title, write}
async function route(url, b, ctx) {
  b = b || {};
  const H = H0(), mod = require('../../bots/lib').checkMod(ctx, b.mod), dir = gohDirOf(ctx);
  if (!dir) throw badK('task.mission.e.nogoh', NOGOH);
  const mode = String(b.mode || ''), add = b.addMode && typeof b.addMode === 'object' ? b.addMode : null, isNew = !!(add && add.newMode);
  if (!(CARDS.includes(mode) || (isNew && MODE_RE.test(mode)))) throw bad('Not a Gates of Hell mode card: ' + mode.slice(0, 40));
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if ((!rows.length && !add && !b.allies && !b.money) || rows.length > 60) throw bad('No card change to make.');
  for (const r of rows) { const w = rowWhy(r); if (w) throw bad(w); }
  const why = require('../../../../lib/writeguard').refuseWrite(mod, { game: dir, purpose: 'change a mode card' });
  if (why) throw bad(why);
  const g = viewOf(dir), rel = cardKey(mode), files = [];
  let buf = null;
  // the mode the map lacks, or the new mode (compile's plan again, on what is on disk now)
  if (add) {
    const key = String(b.map || '');
    if (!/^map\/multi\/[a-z0-9_\-./]+$/.test(key) || key.includes('..')) throw bad('Pick the Gates of Hell multiplayer map the mode is played on first.');
    const from = add.from ? String(add.from) : '';
    if (String(add.to || '') !== mode) throw bad('The added mode is not the picked mode.');
    if (from && !/^[a-z0-9_]{1,40}$/.test(from)) throw bad('Not a game mode name: ' + from.slice(0, 40));
    if (isNew && (CARDS.includes(mode) || H.readKey(g, mod, rel, []))) throw badK('task.mission.e.gohnew', 'A new mode of your own: ' + mode + ' is a mode the game or your mod has already.', { name: mode, why: 'the game or your mod has a mode of that name already' });
    const read = r => H.readKey(g, mod, r, []), modes = MG().modesOf(H, g, mod, key);
    if (isNew) {
      if (!CARDS.includes(from) || !modes.includes(from)) throw badK('task.mission.e.gohmode', 'This map has no ' + from + ' mode. The new mode starts from a mode the map has.', { mode: from, modes: modes.join(', ') || 'none', why: 'the new mode starts from a mode the map has.' });
      const p = newModeFiles(read, key, from, mode);
      if (p.why) throw badK('task.mission.e.gohnew', 'A new mode of your own: ' + p.why, { name: mode, why: p.why });
      buf = p.card; files.push(...p.files);
    } else {
      const p = GM().plan({ read, srcKey: key, key, modes, from, to: mode });
      if (!p.ok) { const w = MG().sayEn(p.why); throw badK('task.mission.e.gohmode', 'This map has no ' + mode + ' mode. ' + w, { mode, modes: '?', why: w }); }
      for (const f of p.files) { if (f[0] === rel) buf = f[1]; else files.push(f); }
    }
  }
  buf = buf || H.readKey(g, mod, rel, []);
  if (!buf) throw bad('No card for the ' + mode + ' mode (' + rel + ').');
  const patch = require('../../../../patch-entity/patch-entity');
  for (const r of rows) {
    const p = String(r.path), v = String(r.value == null ? '' : r.value);
    const e = patch.applyEdit(buf, r.op === 'del' ? { op: 'del', path: p } : { op: r.op, path: p, value: v });
    if (e.err) throw bad(rel + ' could not be changed (' + p + '): ' + e.err[1]);
    buf = e.buf;
    // a switch added as {k} (the game's form), not {k }
    if (r.op === 'add' && v === '') { const k = p.split('/').pop(); buf = Buffer.from(buf.toString('latin1').replace(new RegExp('\\{' + k + ' \\}', 'g'), '{' + k + '}'), 'latin1'); }
  }
  if (rows.length || isNew) files.push([rel, buf]);
  // alliances
  if (b.allies && typeof b.allies === 'object') {
    const ab = H.readKey(g, mod, ALLY_KEY, []); if (!ab) throw bad('No ' + ALLY_KEY + ' in the game or the mod.');
    let t = ab.toString('latin1');
    for (const [a, l] of Object.entries(b.allies)) {
      if (!['Axis', 'Allies'].includes(a) || !Array.isArray(l) || !l.length || l.some(x => !/^[a-z0-9_]{1,24}$/.test(String(x)))) throw bad('Not an alliance change: ' + String(a).slice(0, 20));
      const n = setAllies(t, a, l.map(String)); if (n == null) throw bad('No alliance ' + a + ' with army lines in ' + ALLY_KEY + '.'); t = n;
    }
    files.push([ALLY_KEY, Buffer.from(t, 'latin1')]);
  }
  // lobby money
  if (b.money && typeof b.money === 'object') {
    const m = b.money, nOk = x => x == null || (Number.isInteger(x) && x >= 0 && x <= 100000);
    if (!['s', 'c', 'both'].includes(m.which) || !nOk(m.start) || !nOk(m.finish)) throw bad('Not a money change.');
    const own = presetFiles(H, g, mod, buf.toString('latin1'));
    for (const f of [].concat(m.files || [])) {
      if (!own.includes(f)) throw bad('Not a preset file of the ' + mode + ' card: ' + String(f).slice(0, 80));
      const pb = H.readKey(g, mod, f, []), r = setMoney(pb.toString('latin1'), m.which, m.start, m.finish);
      if (!r.n) throw badK('task.mission.e.goheco', 'The ' + mode + ' card has no lobby money rows (start and finish) in ' + f.split('/').pop() + '.', { mode });
      files.push([f, Buffer.from(r.t, 'latin1')]);
    }
  }
  if (b.title != null && isNew) {
    const tt = String(b.title).trim(); if (!tt || /["\r\n]/.test(tt) || tt.length > 80) throw bad('The mode name in the lobby: one line, up to 80 signs, no " sign.');
    files.push([titleRel(mode), potOf('mp/game/' + mode, tt)]);
  }
  const MW = require('../../../../lib/modwrite'), rels = files.map(f => f[0]);
  for (const r of rels) MW.guardFile(mod, path.join(mod, ...r.split('/')), { game: dir });
  if (!b.write) return { ok: true, wrote: false, files: rels };
  if (ctx && ctx.job && ctx.job.cancelled) return { ok: false, stopped: true };
  if (ctx && ctx.job) ctx.job.writes = true;
  const restore = MW.restorePoints(mod, rels, 'task-mission-goh', { game: dir });
  MW.writeFiles(mod, files, { game: dir });
  // read back: the bytes on disk are the bytes made
  const fs = require('fs');
  for (const [r, bb] of files) if (!fs.readFileSync(path.join(mod, ...r.split('/'))).equals(bb)) throw bad('Read back failed for ' + r + ': the file on disk is not what was written. Undo with the restore point.');
  try { ((ctx && ctx.modtree) || require('../../../../lib/modtree')).touch(mod); } catch (e) { /* nothing to forget */ }
  return { ok: true, wrote: true, files: rels, restore, undo: MW.restoreRoot(mod) };
}

// ---- check on GoH: the Missions page facts of the map (flags as visor MapPoint [I], players per mode) and the mode's card switches
async function check(draft, ctx) {
  const H = H0(), dir = gohDirOf(ctx), mod = draft.mod || ctx.mod || '', a = draft.answers || {}, v = x => (a[x] && a[x].src === 'value' ? a[x].value : undefined);
  const key = H.mapKeyOf(draft.base && draft.base.id); if (!key || !dir) return [];
  const mode = H.yes(v('newmode')) && MODE_RE.test(String(v('with_mode') || '')) ? String(v('with_mode')) : String(v('goh_mode') || '');
  let f = null; try { f = require('../../missions')._t.factsOf(dir, mod, key, [], null, { id: 'goh', exe: 'goh', kind: 'goh', dir }); } catch (e) { f = null; }
  const row = f && f.modes.find(m => m.mode === mode), cv = mode && cardVals(readCard(H, viewOf(dir), mod, mode));
  if (!row) return [{ title: 'Mission ' + (mode || '?') + ' (Gates of Hell)', lines: ['No ' + (mode || 'mode') + ' mission on ' + key + '.'], level: 'warn' }];
  const lines = [row.flags + ' map points (visor MapPoint), ' + (row.players || '?') + ' players', 'bots ' + (cv && cv.bots ? 'on' : 'off') + ', friendly fire ' + (cv && cv.friendly ? 'on' : 'off') + (cv && cv.goh_score != null ? ', score to win ' + cv.goh_score : '')
    + (cv && cv.fog ? ', fog ' + cv.fog : '') + (cv && cv.duration != null ? ', ' + cv.duration + ' min' : '')];
  const cards = [{ title: 'Mission ' + mode + ' on ' + key + ' (Gates of Hell)', lines, level: 'info' }];
  if (cv && cv.bots && !row.flags) cards.push({ title: 'Bots without map points', lines: ['Bots are on in ' + mode + ' but the mission has no map points read here; what GoH bots do then is not tested [T].'], level: 'warn' });
  return cards;
}

module.exports = { CARDS, NUMS, FLAGS, DURATIONS, OPTION_WORDS, cardVals, valAt, alliesOf, setAllies, setMoney, moneyOf, presetFiles, rowWhy, values, compile, route, check };
