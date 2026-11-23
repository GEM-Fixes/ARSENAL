// Author: Imperator_Aug (ARSENAL, ia-7c019363)
'use strict';
// testplan checklist: what a person has to do and look at, grouped into play sessions.
//   build(plan, {lang:'en', units:[statsheet units], perSession:12}) ->
//     {sessions:[{id:'editor'|'skirmish'|'mission', n, of, title, titleKey, titleArgs, setup:[sentence], setupKeys:[{key, args}],
//                 entries:[{row, code, item, check, do, look, expect, status, key, args, recheck}]}], counts}
//   md(list) -> markdown with `- [ ] T-xxxxx ...` lines grouped by session.
//   TEXT = key -> English sentence with {slot}s. An entry's sentences are TEXT[key + '.do'] and TEXT[key + '.look'] filled with `args`;
//   a session title is TEXT[titleKey], a setup step TEXT[setupKeys[i].key]. fill(text, args) fills the slots.
// In the list: every `player` row (which holds the run rows the game cannot run) and every `run` row that ended `fail` or `unproven`.
// Pure: no file and no game read. Only English is built here; the page translates through key and args.
const catalog = require('./catalog');

const lc = s => String(s == null ? '' : s).toLowerCase();

const TEXT = {
  'spawn.do': 'Place {unit} in the editor, or buy it in a skirmish.',
  'spawn.look': 'It appears complete and the game does not crash or freeze.',
  'move.do': 'Put a crew in {unit} and order it to drive forward, turn and reverse.',
  'move.look': 'It drives, turns and reverses, and the wheels or tracks turn.',
  'fire.do': 'Place {unit} in the editor and order it to fire {weapon} at {foe}.',
  'fire.look': 'The gun fires, you hear the shot, the shell leaves the barrel.',
  'dmgout.do': 'Let {unit} keep firing {weapon} at {foe} until something happens to the target.',
  'dmgout.look': 'The target is damaged or destroyed.',
  'dmgin.do': 'Place {unit} in the editor and shoot it with an enemy gun until it is destroyed.',
  'dmgin.look': 'Parts break off or it is destroyed. A soldier loses health and dies.',
  'crew.do': 'Place {unit} with no crew, then order soldiers to board it.',
  'crew.look': 'The soldiers get in and one of them takes the gun.',
  'log.do': 'After your test session, open the Logs page of ARSENAL and let it check game.log.',
  'log.look': 'There is no new error line from this session.',
  'look.unit.do': 'Place {unit} in the editor, look at it from all sides, then destroy it.',
  'look.unit.look': 'Model and textures are right, wheels and tracks sit in place, the size fits, the wreck looks right.',
  'look.model.do': 'Place a unit that uses the model {file} in the editor and look at it from all sides.',
  'look.model.look': 'Shape and textures are right, nothing is missing, and it sits in the right place at the right size.',
  'sound.unit.do': 'Select {unit}, move it around, then let it fire and reload.',
  'sound.unit.look': 'You hear the engine or the voice, the shot and the reload.',
  'sound.weapon.do': 'Place {carrier} in the editor and let it fire {weapon} until it reloads.',
  'sound.weapon.look': 'You hear the shot and the reload.',
  'sound.file.do': 'Do the thing in game that plays the sound {file}.',
  'sound.file.look': 'The sound plays, clear and at a fitting volume.',
  'anim.unit.do': 'Watch {unit} while it fires, reloads, moves and opens its hatch.',
  'anim.unit.look': 'Recoil, reload, walking or driving and the hatch all play smoothly.',
  'anim.model.do': 'Place a unit that uses the model {file} and watch it move, fire and reload.',
  'anim.model.look': 'Every movement plays smoothly and no part jumps or stays frozen.',
  'icon.card.do': 'Start a skirmish as {army} and find {unit} in the buy menu.',
  'icon.card.look': 'Icon, name, description and price are shown and are right.',
  'icon.file.do': 'Open the game screen that shows {file}.',
  'icon.file.look': 'The picture or panel shows and is not stretched, blank or pink.',
  'feel.weapon.do': 'Let {carrier} fire {weapon} at {foe} from near, middle and far range.',
  'feel.weapon.look': 'Range, accuracy and penetration are what you meant them to be.',
  'feel.ammo.do': 'Fire the ammo {id} at {foe} from near, middle and far range.',
  'feel.ammo.look': 'Range, accuracy and penetration are what you meant them to be.',
  'play.mission.do': 'Start the mission {file} and play up to the part you changed.',
  'play.mission.look': 'The mission starts and the changed part works.',
  'play.script.do': 'Play a match or mission that uses the script {file}.',
  'play.script.look': 'What the script changed happens in the game.',
  'generic.do': 'Check {unit} in the game ({title}).',
  'generic.look': 'It works as you meant it to.',
  'foe.any': 'an enemy unit',
  'carrier.any': 'a unit that carries it',
  'army.any': 'its army',
  'session.editor': 'Editor session {n} of {of}',
  'session.skirmish': 'Skirmish session {n} of {of}',
  'session.mission': 'Mission session {n} of {of}',
  'setup.start': 'Start the game with the mod {mod} turned on.',
  'setup.start.goh': 'Start Gates of Hell yourself with the mod {mod} turned on. ARSENAL does not start it.',
  'setup.editor': 'Open the editor on a small flat map, or start a skirmish if you would like to play it.',
  'setup.editor.goh': 'Open the GoH editor yourself on a small flat map.',
  'setup.place': 'Place the units listed below, with a crew where one is needed, and an enemy to shoot at.',
  'setup.skirmish': 'Start a skirmish against the computer with as many starting points as the game allows.',
  'setup.mission': 'Open the changed mission from the game menu or from the editor.',
  'md.title': 'Test checklist: {mod}',
  'md.empty': 'Nothing for a person to check.',
  'md.look': 'Look for:',
  'md.expect': 'Expect:',
  'md.recheck': 'The game run did not prove this, so check it again by hand.',
};

function fill(text, args) {
  return String(text == null ? '' : text).replace(/\{(\w+)\}/g, (m, k) => (args && args[k] != null && args[k] !== '' ? String(args[k]) : m));
}

const SESSIONS = ['editor', 'skirmish', 'mission'];
const KEY = {
  look: k => (k === 'model' ? 'look.model' : 'look.unit'),
  sound: k => (k === 'weapon' ? 'sound.weapon' : k === 'sound' ? 'sound.file' : 'sound.unit'),
  anim: k => (k === 'model' ? 'anim.model' : 'anim.unit'),
  icon: k => (k === 'interface' ? 'icon.file' : 'icon.card'),
  feel: k => (k === 'ammo' ? 'feel.ammo' : 'feel.weapon'),
  play: k => (k === 'script' ? 'play.script' : 'play.mission'),
};
const PLAIN = new Set(['spawn', 'move', 'fire', 'dmgout', 'dmgin', 'crew', 'log']);

function inList(row) {
  if (!row) return false;
  if (row.how === 'player') return true;
  return row.how === 'run' && (row.status === 'fail' || row.status === 'unproven');
}

// numbers of the units list a player can compare with what the game shows
function numbers(u) {
  if (!u) return '';
  const g = (u.gun && typeof u.gun === 'object' ? u.gun : null) || {};
  const pick = (...ks) => { for (const k of ks) for (const o of [u, g]) if (o[k] != null && o[k] !== '' && typeof o[k] !== 'object') return o[k]; return null; };
  const out = [];
  const add = (label, v) => { if (v != null) out.push(label + ' ' + v); };
  add('range', pick('range', 'gunRange'));
  add('damage', pick('damage', 'gunDamage'));
  add('penetration', pick('penetration', 'pen', 'pierce'));
  add('crew', pick('crew'));
  add('price', pick('cost', 'price'));
  return out.join(', ');
}

function build(plan, opts) {
  const o = opts || {};
  const p = plan || {};
  const gid = catalog.gid(p.stack);
  const mod = (p.stack && (p.stack.name || p.stack.folder)) || 'under test';
  const per = o.perSession > 0 ? o.perSession : 12;
  const items = new Map((p.items || []).map(it => [it.id, it]));
  const units = new Map();
  for (const u of o.units || p.units || []) if (u && u.id != null && !units.has(lc(u.id))) units.set(lc(u.id), u);

  const pool = { editor: [], skirmish: [], mission: [] };
  for (const row of p.rows || []) {
    if (!inList(row)) continue;
    const check = catalog.get(row.check);
    const it = items.get(row.item) || null;
    const kind = it ? it.kind : String(row.item || '').split(':')[0];
    const t = row.target || {};
    const u = units.get(lc(t.card)) || units.get(lc(t.entity)) || null;
    const id = t.entity || t.weapon || t.ammo || t.card || (it && it.key) || String(row.item || '').replace(/^[^:]*:/, '');
    const name = (u && u.name) || (it && it.name && lc(it.name) !== lc(id) ? it.name : '') || '';
    const key = KEY[row.check] ? KEY[row.check](kind) : PLAIN.has(row.check) ? row.check : 'generic';
    const carrier = it && it.carriers && it.carriers[0];
    const args = {
      unit: name ? name + ' (' + id + ')' : id, name, id,
      weapon: t.weapon || (it && it.weapons && it.weapons[0]) || id,
      foe: row.foe || TEXT['foe.any'],
      carrier: carrier || TEXT['carrier.any'],
      army: t.army || (u && u.army) || TEXT['army.any'],
      file: t.file || (it && it.file) || id,
      card: t.card || '', title: row.title || (check ? check.title : row.check),
    };
    const nums = numbers(u);
    const sid = SESSIONS.includes(row.session) ? row.session : (check && check.session) || 'editor';
    pool[sid].push({
      row: row.id, code: row.code, item: row.item, check: row.check,
      do: fill(TEXT[key + '.do'], args), look: fill(TEXT[key + '.look'], args),
      expect: [row.expect, nums].filter(Boolean).join('; '), status: row.status || 'todo',
      key, args, recheck: row.how === 'run',
      _army: lc(t.army || (u && u.army) || ''), _unit: lc(t.entity || row.item), _log: row.check === 'log' ? 1 : 0,
    });
  }

  const goh = gid === 'goh';
  const setupOf = sid => {
    const keys = [goh ? 'setup.start.goh' : 'setup.start'];
    if (sid === 'editor') keys.push(goh ? 'setup.editor.goh' : 'setup.editor', 'setup.place');
    else keys.push(sid === 'skirmish' ? 'setup.skirmish' : 'setup.mission');
    return keys.map(key => ({ key, args: { mod } }));
  };

  const sessions = [];
  const counts = { entries: 0, sessions: 0, bySession: { editor: 0, skirmish: 0, mission: 0 }, byStatus: {}, byCheck: {} };
  for (const sid of SESSIONS) {
    // same army together, a unit's entries together, the log check last; one session per `per` units
    const list = pool[sid].map((e, i) => [e, i]).sort((a, b) => a[0]._log - b[0]._log || (a[0]._army < b[0]._army ? -1 : a[0]._army > b[0]._army ? 1 : 0)
      || (a[0]._unit < b[0]._unit ? -1 : a[0]._unit > b[0]._unit ? 1 : 0) || a[1] - b[1]).map(x => x[0]);
    const chunks = [];
    let cur = null, seen = null;
    for (const e of list) {
      if (!cur || (!seen.has(e._unit) && seen.size >= per && !e._log)) { cur = []; seen = new Set(); chunks.push(cur); }
      seen.add(e._unit); cur.push(e);
    }
    chunks.forEach((entries, i) => {
      const titleArgs = { n: i + 1, of: chunks.length };
      const setupKeys = setupOf(sid);
      for (const e of entries) {
        delete e._army; delete e._unit; delete e._log;
        counts.entries++; counts.bySession[sid]++;
        counts.byStatus[e.status] = (counts.byStatus[e.status] || 0) + 1;
        counts.byCheck[e.check] = (counts.byCheck[e.check] || 0) + 1;
      }
      sessions.push({ id: sid, n: i + 1, of: chunks.length, title: fill(TEXT['session.' + sid], titleArgs), titleKey: 'session.' + sid, titleArgs,
        setup: setupKeys.map(s => fill(TEXT[s.key], s.args)), setupKeys, entries });
    });
  }
  counts.sessions = sessions.length;
  return { lang: 'en', mod, sessions, counts };
}

function md(list) {
  const l = list || {};
  const out = ['# ' + fill(TEXT['md.title'], { mod: l.mod || '' }).replace(/:\s*$/, ''), ''];
  if (!l.sessions || !l.sessions.length) { out.push(TEXT['md.empty'], ''); return out.join('\n'); }
  for (const s of l.sessions) {
    out.push('## ' + s.title, '');
    (s.setup || []).forEach((step, i) => out.push((i + 1) + '. ' + step));
    out.push('');
    for (const e of s.entries) {
      out.push('- [' + (e.status === 'pass' ? 'x' : ' ') + '] ' + e.code + ' ' + e.do);
      out.push('  ' + TEXT['md.look'] + ' ' + e.look);
      if (e.expect) out.push('  ' + TEXT['md.expect'] + ' ' + e.expect);
      if (e.recheck) out.push('  ' + TEXT['md.recheck']);
    }
    out.push('');
  }
  return out.join('\n');
}

module.exports = { build, md, TEXT, fill, inList };
