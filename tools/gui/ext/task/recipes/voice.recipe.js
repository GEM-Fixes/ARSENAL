// recipe "make or change a voice set": the lines soldiers, tank crews and gun crews say per order and event (set/talk.set phrases and
// the sound trees sound/<human|vehicle|cannon>/talk/<language>/<folder>/v<N>/). Contract: ../README.md. Census: census/voice.json.
// make: one gen `voice` op (tools/gen/lib/ops-asset.js opVoice): the like language's trees copied under the new id, the folders you
// answered replaced (brought files given to the op; picked game lines copied over the like's names), N phrase lines added to talk.set.
// change: copies over the language's own files (the new lines take the game file names in turn, so the old ones leave the shuffle).
// make: the gen voice op resamples a wrong rate and re-encodes a codec the game does not play itself (GEN_VOICE_RESAMPLED); only a
// codec the user forces on a playable file goes through the Art page's POST /api/x/art/wav-convert after gen. change: every file
// that needs it goes through that route (no gen op), with its own ok() test (sound.recipe.js _lib).
// Gates of Hell (2026-11-23): the same task on the GoH tree, read on the GoH install [V]: sound/talk/<actor>/<language>/<folder>/v<N>
// (sound/talk.pak), actors human, tank, cannon, each listed in its own talk.set define (phrases, phrases_tank, phrases_cannon); the
// gen voice op has a GoH form (opVoiceGoh). The moment questions map to the GoH folder names (GOH below: in_action is in_battle, a
// sniper shot is aimed_shot ..; [I] the event behind a GoH folder is read from its name); two moments GoH has no folder for are
// asked on AS2 only. Not on GoH, one plain line each when answered anyway: loudness (a GoH talk folder.set calls a sound define,
// no {loudness} row) and how many lines play at once (the AS2 talk mixer row).
// Author: Imperator_Aug (ARSENAL, ia-7a77c34b)
'use strict';
const fs = require('fs'), path = require('path');

const S = () => require('./sound.recipe');
const L = () => S()._lib;
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const badK = (k, m) => Object.assign(bad(m), { key: k });
const TALK = 'resource/set/talk.set';
const ID_RE = /^[a-z][a-z0-9_]{1,15}$/;

// [question id, talker, sound folder, census keys]; talk blocks from set/talk.set [V]. The first question also covers the sound files.
const EV = [
  ['sel', 'human', 'selection_of_units', ['voice.event.selection', 'voice.phrase.sound', 'voice.sound.files']],
  ['order', 'human', 'executing_an_order', ['voice.event.executing_order']],
  ['pain', 'human', 'scream_of_pain', ['voice.event.injuring']],
  ['blue', 'human', 'things_look_blue', ['voice.event.things_look_blue']],
  ['sniper', 'human', 'shot_from_a_sniper_rifle', ['voice.event.aimed_shot']],
  ['bazooka', 'human', 'shot_from_a_bazooka', ['voice.event.bazooka_shot']],
  ['grenade', 'human', 'throwing_a_grenade', ['voice.event.throwing_grenade']],
  ['fight', 'human', 'in_action', ['voice.event.in_action']],
  ['death', 'human', 'death_cry', ['voice.event.death_cry']],
  ['ammo', 'human', 'ill_take_ammo', ['voice.event.ill_take_ammo']],
  ['grenades', 'human', 'ill_take_grenades', ['voice.event.ill_take_grenades']],
  ['repair', 'human', 'maintenance_is_finished', ['voice.event.repair_end']],
  ['kill', 'human', 'enemy_is_destroyed', ['voice.event.kill_enemy']],
  ['attack', 'human', 'attack', ['voice.event.attack']],
  ['amaze', 'human', 'amazement', ['voice.event.amazement', 'voice.event.idle']],
  ['alert', 'human', 'alert', ['voice.event.alert']],
  ['tank_order', 'vehicle', 'executing_an_order', ['voice.event.tank_executing_order', 'voice.event.tank_attack']],
  ['tank_fight', 'vehicle', 'in_action', ['voice.event.tank_in_action']],
  ['tank_burn', 'vehicle', 'burning', ['voice.event.tank_burning']],
  ['gun_order', 'cannon', 'executing_an_order', ['voice.event.cannon_executing_order', 'voice.event.cannon_attack']],
  ['gun_fight', 'cannon', 'in_action', ['voice.event.cannon_in_action']],
  ['gun_leave', 'cannon', 'leave', ['voice.event.cannon_leave']],
];
// GoH: question id -> [actor, folder] of sound/talk/<actor>/<language>/<folder> (folders of the GoH install [V]); null = no GoH folder
const GOH = {
  sel: ['human', 'selection_of_units'], order: ['human', 'executing_an_order'], pain: ['human', 'scream_of_pain'], blue: null,
  sniper: ['human', 'aimed_shot'], bazooka: ['human', 'bazooka_shot'], grenade: ['human', 'throwing_a_grenade'], fight: ['human', 'in_battle'],
  death: ['human', 'death_cry'], ammo: ['human', 'ill_take_item'], grenades: null, repair: ['human', 'maintenance_is_finished'],
  kill: ['human', 'enemy_is_destroyed'], attack: ['human', 'attack'], amaze: ['human', 'idle'], alert: ['human', 'alert'],
  tank_order: ['tank', 'executing_an_order'], tank_fight: ['tank', 'in_battle'], tank_burn: ['tank', 'burning'],
  gun_order: ['cannon', 'executing_an_order'], gun_fight: ['cannon', 'in_battle'], gun_leave: ['cannon', 'leave'],
};
const isGoh = g => !!(g && typeof g === 'object' && g.kind === 'goh');
// the folder of a moment under resource/sound/ for a voice tree: AS2 <talker>/talk/<tree>/<folder>, GoH talk/<actor>/<tree>/<folder>
function lineDir(goh, e, tree) {
  if (!goh) return e[1] + '/talk/' + tree + '/' + e[2];
  const m = GOH[e[0]]; return m ? 'talk/' + m[0] + '/' + tree + '/' + m[1] : null;
}
// a voice id already used by a sound tree (AS2 sound/<talker>/talk/<id>/, GoH sound/talk/<actor>/<id>/)
const treeTaken = (V, goh, id) => [...V.keys()].some(k => (goh ? /^resource\/sound\/talk\/[^/]+\//.test(k) : /^resource\/sound\/[^/]+\/talk\//.test(k)) && k.split('/')[4] === id);
const SILENT = ['ill_take_it', 'burning', 'leave', 'ally_die', 'explosion', 'board_to_vehicle', 'repair_begin', 'cannot_do_this', 'cannot_attack',
  'cannot_move', 'cover', 'too_heavy_items', 'break_enemy', 'bullet_missed', 'i_am_rambo', 'inventory_full'];

// the languages of talk.set: (define "phrases" ("<macro>" args %0 <lang> N %1) ..), the tree a macro plays from (ger2 -> ger)
function voiceSets(V) {
  const rec = V.get(TALK); if (!rec) return new Map();
  const text = V.readAny(rec).toString('latin1'), out = new Map();
  const p = text.search(/\(\s*define\s+"phrases"/i); if (p < 0) return out;
  const body = text.slice(p, text.indexOf('\n)', p) < 0 ? text.length : text.indexOf('\n)', p));
  for (const m of body.matchAll(/\(\s*"(\w+)"\s+args\s+%0\s+([A-Za-z0-9_]+)\s+(\d+)\s+%1\s*\)/g)) {
    const l = m[2].toLowerCase(), x = out.get(l) || { id: l, macro: m[1], n: 0, tree: l }; x.n = Math.max(x.n, +m[3]); out.set(l, x);
  }
  for (const x of out.values()) {
    const dm = new RegExp('\\(\\s*define\\s+"' + x.macro + '"[\\s\\S]*?\\{\\s*sound\\s+"%0/talk/([^/"]+)/', 'i').exec(text);
    if (dm && dm[1] !== '%1') x.tree = dm[1].toLowerCase();
  }
  return out;
}
// the wavs straight inside a folder key (no extension, under resource/sound/)
function wavsIn(V, folder) { return L().soundAt(V, folder).files; }
function genOps() { try { return require('../../units/server').lib.gen().genMain.OPS || {}; } catch (e) { return {}; } }

// the base step: a voice that plays another one's recordings says so there (a change of it changes the other voice too)
async function lookVoice(ctx, words, opt) {
  const g = L().gameOf(ctx, opt && opt.game); if (!g) return [];
  const V = L().viewOf(g, ctx && ctx.mod), w = String(words || '').toLowerCase().trim(), sets = voiceSets(V);
  return [...sets.values()].filter(x => !w || x.id.includes(w))
    .map(x => {
      const also = [...sets.values()].filter(y => y.id !== x.id && y.tree === x.tree).map(y => y.id);
      const where = x.tree !== x.id ? 'plays the ' + x.tree + ' recordings: a change of it changes ' + [x.tree].concat(also.filter(y => y !== x.tree)).join(', ') + ' too'
        : also.length ? 'its recordings are also played by ' + also.join(', ') + ': a change changes them too' : 'talk.set';
      return { id: x.id, name: x.id, where, ref: { key: TALK }, sub: x.n + ' speaker' + (x.n > 1 ? 's' : '') };
    });
}
// a line question's "borrow": the same line of the other voices (resource/sound/<talker>/talk/<voice>/<folder>/vN), not every sound
async function lookLine(ctx, words, opt) {
  const g = L().gameOf(ctx, opt && opt.game); if (!g) return [];
  const f = (opt && opt.filter) || {}, goh = isGoh(g);
  let talker = String(f.talker || 'human'), folder = String(f.folder || '');
  // GoH: the same moment's GoH folder (the question's filter names the AS2 one)
  if (goh) { const e = EV.find(x => x[1] === talker && x[2] === folder), m = e && GOH[e[0]]; if (!m) return []; talker = m[0]; folder = m[1]; }
  const V = L().viewOf(g, opt && opt.mod), w = String(words || '').toLowerCase().trim(), by = new Map();
  const re = goh ? new RegExp('^resource/sound/talk/' + talker + '/([^/]+)/' + folder.replace(/[^a-z0-9_]/g, '') + '/(v\\d+)/[^/]+\\.wav$')
    : new RegExp('^resource/sound/' + talker + '/talk/([^/]+)/' + folder.replace(/[^a-z0-9_]/g, '') + '/(v\\d+)/[^/]+\\.wav$');
  for (const k of V.keys()) {
    const m = re.exec(k); if (!m) continue;
    const id = goh ? 'talk/' + talker + '/' + m[1] + '/' + folder + '/' + m[2] : talker + '/talk/' + m[1] + '/' + folder + '/' + m[2];
    if (w && !id.includes(w)) continue;
    const o = by.get(id) || { n: 0, first: k, voice: m[1], v: m[2] }; o.n++; by.set(id, o);
  }
  return [...by].map(([id, o]) => ({ id, name: o.voice + ' ' + o.v, where: o.voice, ref: { key: o.first }, sub: o.n + ' wav' }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

const lineQ = ([id, talker, folder, covers]) => Object.assign(GOH[id] ? {} : { when: { $game: AS2 } }, { id, kind: 'file', multi: true, ask: 'task.voice.q.' + id, help: 'task.voice.h.line', covers, optional: true,
  limits: { limit: 'FMT-14' }, picker: { sources: ['keep', 'exist', 'file', 'ext'], lookup: 'voiceline', filter: { talker, folder }, kinds: ['.wav'], ext: ['audacity', 'ffmpeg'],
    check: f => L().wavCheck(true, 'task.voice')(f) } });
// the lines a first-time user must be offered (essential): the ones heard in every fight
const MAIN = ['sel', 'order', 'attack', 'fight', 'death'];
const MAKE = { $verb: ['make'] };
const AS2 = ['as64', 'mowas2'];

module.exports = {
  id: 'voice',
  verbs: ['make', 'change'],
  // Gates of Hell: the GoH tree (see the head of this file)
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 110,
  title: 'task.voice.t',
  census: 'voice',
  base: { lookup: 'voiceset' },
  groups: [
    // essential: the new voice's id and speaker folders (make only: a game voice keeps both) and the lines heard most
    { id: 'who', title: 'task.voice.g.who', essential: true, q: [
      { id: 'voice_id', kind: 'id', ask: 'task.voice.q.voice_id', help: 'task.voice.h.voice_id', covers: ['voice.id', 'voice.phrase.language', 'voice.phrases.list'],
        when: MAKE, unique: { lookup: 'voiceset' }, limits: { re: ID_RE.source, limit: 'SDL-17' } },
      { id: 'speakers', kind: 'number', ask: 'task.voice.q.speakers', help: 'task.voice.h.speakers', covers: ['voice.variants', 'voice.phrase.voice'],
        when: Object.assign({ $game: AS2 }, MAKE), limits: { min: 1, max: 3, step: 1 } },
      // GoH: its game voices have 1 to 8 speakers
      { id: 'gohspeakers', kind: 'number', ask: 'task.voice.q.speakers', help: 'task.voice.h.gohspeakers', covers: [],
        when: Object.assign({ $game: ['goh'] }, MAKE), limits: { min: 1, max: 8, step: 1 } },
    ] },
    { id: 'main', title: 'task.voice.g.main', essential: true, q: EV.filter(e => MAIN.includes(e[0])).map(lineQ) },
    { id: 'human', title: 'task.voice.g.human', q: EV.filter(e => e[1] === 'human' && !MAIN.includes(e[0])).map(lineQ) },
    { id: 'tank', title: 'task.voice.g.tank', q: EV.filter(e => e[1] === 'vehicle').map(lineQ) },
    { id: 'cannon', title: 'task.voice.g.cannon', q: EV.filter(e => e[1] === 'cannon').map(lineQ) },
    { id: 'format', title: 'task.voice.g.format', q: [
      { id: 'convert', kind: 'choice', ask: 'task.voice.q.convert', help: 'task.voice.h.convert', covers: ['voice.sound.wav_format'],
        limits: { values: ['auto', 'ima', 'pcm16'], limit: 'FMT-14' } },
      { id: 'mono', kind: 'yesno', ask: 'task.voice.q.mono', help: 'task.voice.h.mono' },
    ] },
    // how far the lines carry (the voice op's loudness, a new voice only) and how many play at once (sound.set, shared by every voice)
    { id: 'heard', title: 'task.voice.g.heard', q: [
      { id: 'loudness', kind: 'thing', ask: 'task.voice.q.loudness', help: 'task.voice.h.loudness', covers: ['voice.loudness_row'], when: Object.assign({ $game: AS2 }, MAKE),
        optional: true, picker: { sources: ['keep', 'exist'], lookup: 'loudness' } },
      { id: 'at_once', kind: 'number', ask: 'task.voice.q.at_once', help: 'task.voice.h.at_once', covers: ['voice.limit_percent'],
        optional: true, when: { $game: AS2 }, limits: { min: 1, max: 10, step: 1, limit: 'VIS-10' } },
    ] },
  ],
  kept: [
    ['voice.link.breed_voice', 'asked by the soldier task (gen breed set voice): which soldiers speak this voice'],
    ['voice.link.nationality', 'asked by the soldier task (gen breed set nationality): it also picks the name list'],
    ['voice.link.vehicle', 'engine rule: a vehicle speaks with the voice of its first seated crew member'],
    ['voice.talker', 'engine rule set by the unit (extender talk in properties/*.ext): human, tank or cannon; the vehicle and gun tasks keep it'],
    ['voice.phrase.text', 'not asked: the game shows no such shape (no game voice gives its lines a shown text key), so there is no form to write'],
    ['voice.phrase.text_dbg', 'written by the phrase_voice define itself (debug text); nothing to ask'],
    ['voice.talk.freq', 'no tool step yet: how often a line plays is set per talk block and shared by every voice; no op writes it'],
    // one cause for all 16 (a row per census key is the contract): the game never voices these events, so there is no line to bring
    ...SILENT.map(e => ['voice.event.' + e, 'the game never voices this event (no talk block in talk.set); one talk.set writer would open all 16 [T]']),
    ['voice.folder.impossibility_to_execute_an_order', 'no talk block plays it; make copies it with the tree, change leaves it'],
    ['voice.folder.tag', 'inherited: the new tree sits under sound/<talker>/talk/folder.set, so it gets the game\'s mixer channel (VIS-09)'],
    ['voice.folder.loudness', 'inherited from sound/<talker>/talk/folder.set (talk, talk2): the same distance as the game voices'],
    ...['voice.folder.volume', 'voice.folder.distance', 'voice.folder.signal', 'voice.folder.reset'].map(k => [k, 'no tool step yet: the gen sound op writes a folder.set only for a new sound folder and refuses the talk tree the voice op makes']),
    ...['voice.schedule.priority', 'voice.schedule.timeout', 'voice.schedule.immediate', 'voice.schedule.condition'].map(k => [k, 'no tool step yet: set/talk/<talker>/*.set rules are shared by all voices; no op writes them (gen talk-rule planned)']),
    ['voice.text_display', 'engine rule: green text above the unit for 2 + 0.02 s per letter'],
  ],
  test: 'task.voice.test',
  checklist: ['task.voice.c.breed', 'task.voice.c.hear', 'task.voice.c.log'],
  lookups: {
    voiceset: lookVoice,
    voiceline: lookLine,
    loudness: (ctx, w, o) => require('./sound.recipe').lookups.loudness(ctx, w, o),
  },
  values: async (ctx, base, o) => {
    o = o || {};
    const out = { voice_id: '', speakers: 2, gohspeakers: 2, convert: 'auto', mono: true, loudness: '', at_once: null };
    for (const e of EV) out[e[0]] = null;
    const g = L().gameOf(ctx, o.game), bid = (base && base.id) || (o.pass && o.pass.base && o.pass.base.id) || '';
    if (bid && g) {
      const x = voiceSets(L().viewOf(g, ctx && ctx.mod)).get(String(bid).toLowerCase());
      // a change keeps the id; a new voice gets a free id next to it (the id question refuses a taken one, own id allowed on change)
      if (x) { out.speakers = x.n; out.gohspeakers = x.n; out.voice_id = o.verb === 'make' ? (x.id + '_new').slice(0, 16) : x.id; }
    }
    return out;
  },
  compile: (draft, c) => {
    const g = L().gameIn(c.gameDir, c.game);
    if (!g) throw bad('Set the game folder first (the Game folder button at the top): the task reads talk.set and the game voices.');
    const V = L().viewOf(g, c.mod), sets = voiceSets(V), mode = String(c.value('convert') || 'auto'), goh = isGoh(g);
    if (!sets.size) throw bad('talk.set has no phrases list: the voices cannot be read.');
    // GoH: a moment GoH has no folder for, loudness and lines at once are AS2 rows (hidden on the GoH tab; one plain line if sent anyway)
    const ans = id => { const a = c.answer(id); return a && a.src !== 'keep' && !c.kept(id) && c.value(id) != null && c.value(id) !== '' ? a : null; };
    if (goh && ans('loudness')) throw badK('task.voice.na.gohloud', 'Not available in Gates of Hell: how far the new voice carries. A Gates of Hell talk folder takes its loudness from a sound define, it has no loudness row to set; the new voice is heard as far as the game voices.');
    if (goh && ans('at_once')) throw badK('task.voice.na.gohonce', 'Not available in Gates of Hell: how many soldier lines play at once. That is a row of the Assault Squad 2 talk mixer; Gates of Hell sets it in its own sound defines.');
    const answered = EV.filter(e => { const a = c.answer(e[0]); return a && (a.src === 'file' || a.src === 'exist') && (!goh || GOH[e[0]]); });
    const notes = [], copies = [], calls = [];
    const srcFiles = e => {   // an exist answer -> the game wavs of that folder
      const a = c.answer(e[0]), files = wavsIn(V, a.value);
      if (!files.length) throw bad('The game folder ' + a.value + ' has no wav files straight inside. Pick a folder that ends in v1, v2 ..');
      return files;
    };
    // brought files -> [{file, spec, src, name, op}]: spec = a wav-convert route call still to make at Write (the sound recipe's
    // rule). In a make the gen voice op converts itself: a rate other than 44100/22050 is resampled (GEN_VOICE_RESAMPLED) and a codec
    // the game does not play is re-encoded, both in op.format. What the op does not do: re-encode a playable file at a good rate into
    // the codec the user forced (convert ima/pcm16), or turn 8 bit PCM into IMA in auto. Only those keep a route call in a make.
    // mono (default yes): a stereo file is made mono; the voice op gets mono: true, copies and route calls read the mono file made here
    const mono = c.value('mono') !== false, stereo = new Set();
    const brought = (e, viaOp) => [].concat(c.value(e[0]) || []).filter(Boolean).map(f0 => {
      if (!fs.existsSync(f0)) throw bad('A file you brought is gone from the staging folder: ' + path.basename(f0) + '. Bring it again.');
      if (L().isStereo(f0)) stereo.add(path.basename(f0));
      const f = mono ? L().monoFile(c, f0) : f0;
      let spec = L().convertSpec(f, mode, 'keep'), op = false;
      if (spec && viaOp) {
        const fx = L().wavFacts(f), plays = (fx.tag === 1 && (fx.bits === 8 || fx.bits === 16)) || (fx.tag === 0x11 && fx.bits === 4);
        if (!plays || (fx.rate !== 44100 && fx.rate !== 22050)) { spec = null; op = true; }
      }
      return { file: viaOp ? f0 : f, spec, src: f, name: path.basename(f0).toLowerCase(), op };
    });
    const rel = f => path.relative(path.resolve(c.staging), path.resolve(f)).split(path.sep).join('/');
    let nConv = 0, nOp = 0;
    const monoNote = () => { if (stereo.size) notes.push(mono ? 'Made mono (' + [...stereo].join(', ') + '): the game places a mono line at the soldier who speaks it. Not tested in game.' : 'Stereo stays stereo (' + [...stereo].join(', ') + '), as you asked: a line placed in the world should be mono.'); };
    // how many soldier lines play at once: the percent row of the talk trees' mixer group (sound.set, shared by every voice)
    const atOnce = V => {
      const ao = c.kept('at_once') ? null : c.value('at_once');
      if (ao == null || ao === '') return null;
      let grp = 'emotions'; try { grp = String(require('../../../../sound/model').folder('resource/sound/human/talk', k => { const r = V.get(k); return r ? V.readAny(r) : null; }).group || grp).toLowerCase(); } catch (e) { /* the game's group */ }
      const pc = L().percentChange(V, grp, null, ao, 'every soldier line of every voice');
      if (!pc) return null;
      notes.push(pc.note);
      return { op: 'soundclass', percent: pc.spec };
    };

    if (c.verb === 'make') {
      const id = String(c.value('voice_id') || '').toLowerCase().trim();
      if (!ID_RE.test(id)) throw bad('Type the id of the new voice: 2 to 16 small English letters, digits or _, starting with a letter.');
      if (sets.has(id) || treeTaken(V, goh, id)) throw bad('The voice ' + id + ' already exists: pick another id, or change that voice.');
      let like = c.base && c.base.id ? String(c.base.id).toLowerCase() : '';
      if (!sets.has(like)) { if (like) notes.push('The voice ' + like + ' is not in talk.set; the new voice copies eng.'); like = sets.has('eng') ? 'eng' : [...sets.keys()][0]; }
      const L0 = sets.get(like), n = Math.round(Number(c.value(goh ? 'gohspeakers' : 'speakers')) || L0.n);
      if (goh ? n < 1 || n > 8 : n < 1 || n > 3) throw bad(goh ? 'Speakers: 1 to 8 (the Gates of Hell voices have 1 to 8).' : 'Speakers: 1, 2 or 3 (the game voices have 1 to 3).');
      const op = { op: 'voice', id, like, speakers: n, format: mode === 'ima' ? 'ima' : 'pcm' };
      for (const e of answered) {
        const a = c.answer(e[0]), at = t => lineDir(goh, e, id) + '/v' + t;
        if (a.src === 'file') {
          // the op writes the brought files into every speaker folder under their own names, resampled or re-encoded where needed;
          // only a forced codec change the op does not make is written over there by the wav-convert route after gen
          const fl = brought(e, true);
          nOp += fl.filter(x => x.op).length;
          if (!fl.length) continue;
          for (const x of fl) if (!L().WAV_NAME.test(x.name)) throw bad('The file name ' + path.basename(x.src) + ' must be plain English letters, digits, space, _ . ( ) or -, ending in .wav. Rename it and bring it again.');
          op.sounds = op.sounds || {};
          op.sounds[goh ? GOH[e[0]].join('/') : e[1] + '/' + e[2]] = fl.map(x => x.file);
          for (const x of fl) if (x.spec) { nConv++; for (let t = 1; t <= n; t++) calls.push(L().convertCall(x.src, 'resource/sound/' + at(t) + '/' + x.name, x.spec)); }
        } else {
          // game lines: the op copies the like's folder, the picked lines are copied over its names in turn
          const src = srcFiles(e);
          for (let t = 1; t <= n; t++) {
            const have = wavsIn(V, lineDir(goh, e, L0.tree) + '/v' + ((t - 1) % L0.n + 1));
            if (!have.length) { notes.push(like + ' has no ' + (goh ? GOH[e[0]].join(' ') : e[1] + ' ' + e[2]) + ' lines for speaker ' + t + ': the picked lines are not used there.'); continue; }
            const tn = L().targetNames(have, src.length, e[0]);
            tn.names.forEach((nm, i) => copies.push({ key: src[tn.map[i]], to: 'resource/sound/' + at(t) + '/' + nm }));
          }
        }
      }
      if (stereo.size && mono) op.mono = true;
      const lo = c.kept('loudness') ? '' : String(c.value('loudness') || '').trim();
      if (lo) { op.loudness = lo; notes.push('The new voice is heard as far as the loudness class ' + lo + ' says (near and far distance in sound.set). Not tested in game.'); }
      const pc = goh ? null : atOnce(V);
      const gops = [op].concat(pc ? [pc] : []);
      if (nOp) notes.push('Made game ready by the generator: ' + nOp + ' file(s) at another sample rate or in a format the game does not play are resampled to 44100 or 22050 Hz and saved as ' + (op.format === 'ima' ? 'IMA ADPCM' : '16 bit PCM') + ' (your own files are not changed).');
      if (nConv) notes.push('Converted for the game at Write: ' + nConv + ' file(s), in every speaker folder (the codec you picked).');
      if (n > 1 && answered.length) notes.push('Every speaker (v1 to v' + n + ') says the lines you brought or borrowed here; the lines you kept stay different per speaker.');
      notes.push(goh ? 'Nobody speaks the voice ' + id + ' yet: after Write, give a soldier {voice ' + id + '} in his breed file (Gates of Hell breeds pick their voice so). Not tested in game.'
        : 'Nobody speaks the voice ' + id + ' yet: after Write, open the soldier task and give a soldier this voice.');
      if (goh) notes.push('Gates of Hell: the tank and gun crew lines of ' + id + ' are made only where ' + like + ' has them in the phrases_tank and phrases_cannon lists of talk.set.');
      if (L0.tree !== like) notes.push(like + ' plays the ' + L0.tree + ' recordings; the new voice gets its own copy.');
      monoNote();
      return { gen: { ops: gops }, copies, calls, notes, result: id };
    }

    // change: the language's own tree, the files take the game names in turn
    // change: the voice is the one picked at the start (voice_id and speakers are make questions: a game voice keeps both)
    const id = String((c.base && c.base.id) || '').toLowerCase();
    const x = sets.get(id);
    if (!x) throw bad('Pick the voice to change at the start (one of ' + [...sets.keys()].join(', ') + ').');
    const also = [...sets.values()].filter(y => y.id !== id && y.tree === x.tree).map(y => y.id);
    if (also.length) notes.push(id + ' plays the ' + x.tree + ' recordings, shared with ' + also.join(', ') + ': changing them changes ' + also.join(', ') + ' too.');
    if (!answered.length) throw bad('Nothing to change: bring new lines for at least one moment.');
    for (const e of answered) {
      const a = c.answer(e[0]);
      const src = a.src === 'file' ? brought(e) : srcFiles(e).map(k => ({ key: k }));
      for (let t = 1; t <= x.n; t++) {
        const folder = lineDir(goh, e, x.tree) + '/v' + t, have = wavsIn(V, folder);
        if (!have.length) { notes.push('The game has no ' + folder + ': speaker ' + t + ' keeps no lines there.'); continue; }
        const tn = L().targetNames(have, src.length, e[0]);
        tn.names.forEach((nm, i) => {
          const s = src[tn.map[i]], to = 'resource/sound/' + folder + '/' + nm;
          if (s.key) copies.push({ key: s.key, to });
          else if (s.spec) { nConv++; calls.push(L().convertCall(s.src, to, s.spec)); }
          else copies.push({ staged: rel(s.file), to });
        });
      }
    }
    if (!copies.length && !calls.length) throw bad('Nothing to write: the voice has none of these folders.');
    if (nConv) notes.push('Converted for the game at Write: ' + nConv + ' file(s).');
    monoNote();
    const pc = goh ? null : atOnce(V);
    return { gen: pc ? { ops: [pc] } : null, copies, calls, notes, result: id };
  },
  _lib: { voiceSets, EV, genOps, GOH, lineDir },
};
