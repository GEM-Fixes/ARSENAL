// test of the "mission" recipe: node mission.test.js [scratch]. Three kit runs on 1v1_argentan (a stock mode's card changed, a new mode
// of its own, the lobby economy), each written for real into its own scratch mod; extra: values() from the vanilla card and presets,
// the list merge, compile refusals, and the no_bots path (refused until gen mission-clone reads no_bots).
// Author: Imperator_Aug (ARSENAL, ia-a8b088e5)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit');
const recipe = require('./mission.recipe');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-mission-')));
const BASE = { id: 'map/multi/1v1_argentan', name: '1v1_argentan (2)', ref: { key: 'resource/map/multi/1v1_argentan/preview.dds', mods: [], modes: ['battle_zones', 'captureflag', 'combat'] } };
const read = f => (fs.existsSync(f) ? fs.readFileSync(f, 'latin1') : '');
const list = a => ({ src: 'list', items: a.map(v => ({ src: 'value', value: v })) });
// one (define "name" ..) body of a written preset file
const define = (t, name) => { const i = t.indexOf('(define "' + name + '"'); if (i < 0) return ''; const j = t.indexOf('(define "', i + 5); return t.slice(i, j < 0 ? t.length : j); };

(async () => {
  let fails = 0, passes = 0;
  const ok = (c, m, x) => { if (c) passes++; else { fails++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 800) : '')); } };
  const T = recipe._t;
  // the list merge (no game needed)
  { const m = T.listMerge(['flamer=3', 'sniper_only=2', 'officer=1', '*=%cp'], ['flamer=5', 'sniper_only=2', 'tank=2', '*=%cp'], 'x'); ok(m.join(';') === 'flamer=5;tank=2;-officer', 'list merge: changed, new and removed lines only', m.join(';')); }
  { let e = null; try { T.listMerge([], ['flamer five'], 'unit limits'); } catch (x) { e = x; } ok(e && /name=number/.test(e.message), 'list merge: a bad line is refused', e && e.message); }
  { let e = null; try { T.listMerge(['*=%cp'], ['*=%start'], 'x'); } catch (x) { e = x; } ok(e && /lobby choice/.test(e.message), 'list merge: a %name value cannot be typed', e && e.message); }
  const gameDir = kit.findGame({});
  if (!gameDir) console.log('note: SKIP values() and refusals: no game folder found (set AS2_GAME)');
  else {
    const ctx = { game: () => gameDir, mod: path.join(scratch, 'none') };
    const v = await recipe.values(ctx, BASE, { verb: 'change' });
    const vm = await recipe.values(ctx, BASE, { verb: 'make' });
    ok(v.from === 'battle_zones' && v.to === 'battle_zones' && v.newmode === false, 'values change: battle zones preselected', JSON.stringify(v));
    ok(vm.newmode === true, 'values make: the map has every stock mode, so a mode of its own is preselected', JSON.stringify([vm.newmode, vm.to]));
    ok(v.score === 100 && v.capture_time === 50 && v.release_time === 10 && v.capture_factor === 0.9, 'values: the battle zones card read', JSON.stringify(v));
    ok(v.bots === true && v.friendly === true && v.fog === 'fog_realistic' && v.armies === 'alliance' && v.teams_mode === 'normal' && v.card_ranked === true, 'values: card flags read', JSON.stringify(v));
    ok(Array.isArray(v.unit_limits) && v.unit_limits.includes('flamer=3') && v.grow_time === 1500 && v.budget_mode === 'standard' && /^0 25 50/.test(v.payback_cp), 'values: the standard_all preset read', JSON.stringify([v.unit_limits, v.grow_time, v.payback_cp]));
    ok(v.money_start === 160, 'values: start held by the lobby (%start) preselects 160', v.money_start);
    const cf = T.cardOf(gameDir, '', 'captureflag');
    ok(cf && cf.score === null && cf.params.flag_capture_time === '300', 'captureflag card: no score, capture time 300', JSON.stringify(cf && cf.params));
    ok(T.presetFile(gameDir, '', 'captureflag').file === 'captureflag.set' && T.presetFile(gameDir, '', 'combat').file === 'presets_all.inc', 'presets: captureflag holds its own, combat reads presets_all.inc');
    const mk = (ans, verb) => { const a = {}; for (const [k, x] of Object.entries(ans)) a[k] = x && x.src ? x : { src: 'value', value: x }; return { game: 'as64', gameDir, mod: path.join(scratch, 'none'), staging: path.join(scratch, 'stage'), values: v, verb: verb || 'make', base: BASE, answer: id => a[id] || null, value: id => (a[id] ? (a[id].src === 'list' ? a[id].items.map(i => i.value) : a[id].value) : v[id]), kept: id => !a[id] }; };
    const refuses = (ans, re, what) => { let e = null; try { recipe.compile({}, mk(ans)); } catch (x) { e = x; } ok(e && e.status === 400 && re.test(e.message), 'refused: ' + what, e ? e.message : 'no error'); };
    refuses({ from: 'frontline', newmode: false, to: 'combat' }, /no frontline mode/, 'a start mode the map lacks');
    refuses({ from: 'combat', newmode: true, with_mode: 'combat', from_mode: 'combat' }, /name of its own/, 'a new mode named like a game mode');
    refuses({ from: 'battle_zones', newmode: true, with_mode: 'Bad Name', from_mode: 'combat' }, /small English letters/, 'a new mode name with spaces');
    refuses({ from: 'combat', newmode: false, to: 'combat', score: 5 }, /Score to win/, 'a score below 25');
    refuses({ from: 'combat', newmode: false, to: 'combat', card_maxplayers: 5 }, /even number/, 'an odd most players on the card');
    refuses({ from: 'combat', newmode: false, to: 'combat', card_minplayers: 8, card_maxplayers: 4 }, /more than the most/, 'card fewest above most');
    refuses({ from: 'combat', newmode: false, to: 'combat', lobby_options: 'fogOfWar flyMode' }, /Not known: flyMode/, 'an unknown lobby option');
    refuses({ from: 'captureflag', newmode: false, to: 'captureflag', eco_on: true, eco_preset: 'custom', unitset: 'all' }, /no custom preset/, 'a custom preset on capture the flag');
    refuses({ from: 'combat', newmode: false, to: 'combat', eco_on: true, eco_preset: 'standard', payback_cp: '0 25 50' }, /same count/, 'payback steps of unequal count (MIS-06)');
    refuses({ from: 'combat', newmode: false, to: 'combat', eco_on: true, eco_preset: 'standard', payback_cp: '0 50 25 60 70 80 90' }, /must go up/, 'payback steps not going up (MIS-06)');
    // no_bots (gen mission-clone has it): a new mode from a mission without flags is made without bots
    { const r = recipe.compile({}, mk({ from: 'combat', newmode: true, with_mode: 'x_mode', from_mode: 'combat' })); const op = r.gen && r.gen.ops[0]; ok(op && op.no_bots === true, 'no_bots: a mode from a mission without flags is made without bots', JSON.stringify(op)); }
    refuses({ from: 'combat', newmode: true, with_mode: 'x_mode', from_mode: 'combat', bots: true }, /no flags/, 'bots asked on a new mode without flags (MIS-65)');
    { const fw = recipe.groups.find(g => g.id === 'rules').q.find(q => q.id === 'fog').when; ok(!fw || Object.keys(fw).every(k => k === '$game'), 'card questions show for a new mode too'); }
    { const r = recipe.compile({}, mk({ from: 'combat', newmode: true, with_mode: 'x_mode', from_mode: 'battle_zones' })); const set = r.gen && r.gen.ops.find(o => o.op === 'set'); ok(set && set.rows.some(x => x.entity === 'file:resource/set/multiplayer/games/x_mode.set' && /enableBots/.test(x.path) && x.op === 'del'), 'no flags, class card with bots: bots turned off on the new card', JSON.stringify(r.gen)); }
    { const r = recipe.compile({}, mk({ from: 'battle_zones', newmode: true, with_mode: 'x_mode', from_mode: 'battle_zones', fog: 'fog_off', card_order: 100 })); const set = r.gen && r.gen.ops.find(o => o.op === 'set');
      ok(set && set.rows.length === 1 && /fogOfWar/.test(set.rows[0].path), 'a new mode card: rows on the copy, order 100 counted as there', JSON.stringify(r.gen)); }
    // one unit list, each line its own kind (branch kinds)
    ok(recipe.groups.some(g => g.q.some(q => q.id === 'units' && Array.isArray(q.picker.branch) && q.picker.branch.join() === 'vehicle,soldier,squad')), 'units: one list question branching to vehicle, soldier and squad');
    { const r = recipe.compile({}, mk({ from: 'combat', newmode: false, to: 'combat', units: { src: 'list', items: [{ src: 'branch', child: 'c1', recipe: 'soldier' }, { src: 'branch', child: 'c2', recipe: 'soldier' }, { src: 'branch', child: 'c3', recipe: 'squad' }] } })); ok(r.notes.some(n => /^2 new soldiers/.test(n)) && r.notes.some(n => /^1 new squad:/.test(n)), 'units: notes count each kind', JSON.stringify(r.notes)); }
    // teams, alliances and the preset keys vanilla presets lack are questions, not kept rows
    const has = id => recipe.groups.some(g => g.q.some(q => q.id === id)), kept = k => recipe.kept.some(r => r[0] === k);
    ok(has('team_a_max_slots') && has('alliance_axis') && !kept('teams.team.slots') && !kept('teams.alliances'), 'teams and alliances: questions');
    ok(has('grow_factors') && has('money_period') && !kept('budget.growfactors') && !kept('budget.period'), 'preset keys a preset lacks: questions');
    {
      const r = recipe.compile({}, mk({ from: 'combat', newmode: false, to: 'combat', team_a_max_slots: 4, team_b_armies: 'usa eng', alliance_axis: list(['ger', 'jap', 'ger2', 'rus']) }));
      const rows = r.gen ? r.gen.ops.filter(o => o.op === 'set').flatMap(o => o.rows) : [];
      ok(rows.some(x => x.path === 'game/teamSettings/teams/"a"/maxTeamSlots' && x.value === '4') && rows.some(x => x.path === 'game/teamSettings/teams/"b"/armies' && x.value === '"usa eng"'), 'teams: rows on the quoted team blocks', JSON.stringify(rows));
      ok(rows.some(x => x.entity === 'file:resource/set/multiplayer/games/preset_alliances.inc' && x.path === '"axis"/armies' && x.value === '"rus"'), 'alliances: an added army is a new armies line', JSON.stringify(rows));
      refuses({ from: 'combat', newmode: false, to: 'combat', team_a_armies: 'usa nowhere' }, /no army nowhere/, 'a team army that does not exist');
      refuses({ from: 'combat', newmode: false, to: 'combat', team_a_min_slots: 5, team_a_max_slots: 2 }, /reserved slots/, 'team reserved slots above most slots (MIS-18)');
    }
    refuses({ from: 'combat', newmode: false, to: 'combat', eco_on: true, eco_preset: 'standard', money_period: 30 }, /period and speed 0/, 'a period on a standard budget (MIS-17)');
    // novice hazards
    const qOf = id => recipe.groups.flatMap(g => g.q).find(q => q.id === id), gOf = id => recipe.groups.find(g => g.q.some(q => q.id === id));
    ok(!gOf('flags').essential && gOf('flags').id === 'goals', 'flags: in goals, not in an essential group (a safe default)', gOf('flags').id);
    ok(recipe.groups.filter(g => g.essential).every(g => g.q.every(q => ['from', 'newmode', 'with_mode', 'from_mode', 'to', 'mode_title', 'goh_mode'].includes(q.id))), 'essential groups hold only the mode and its name', JSON.stringify(recipe.groups.filter(g => g.essential).map(g => g.q.map(q => q.id))));
    { const lang = require('./mission.lang'), tt = k => (lang.find(r => r[0] === k) || [])[1]; ok(/multiplayer game mode/.test(tt(recipe.title.make)) && /multiplayer game mode/.test(tt(recipe.title.change)) && !/mission/.test(tt(recipe.title.make) + tt(recipe.title.change)), 'title per verb: a multiplayer game mode, not a mission', JSON.stringify(recipe.title));
      ok(/flags/.test(tt(recipe.test)) && /bots/.test(tt(recipe.test)) && /money/.test(tt(recipe.test)), 'Test step words: flags, money, bots', tt(recipe.test)); }
    ok(['score', 'capture_time', 'release_time', 'capture_factor'].every(id => { const u = qOf(id).limits.usual; return Array.isArray(u) && u[0] >= qOf(id).limits.min && u[1] <= qOf(id).limits.max; }), 'soft ranges (usual) from the game cards, inside min and max');
    { const lang = require('./mission.lang'), h = lang.find(r => r[0] === 'task.mission.h.from'); ok(h && /Make a single-player mission" on Maps & Missions > Missions/.test(h[1]) && !/game editor/.test(h[1]) && [2, 3, 4].every(i => h[i].length > 40), 'base help routes single player missions to the card on Maps & Missions > Missions, in 4 languages', h && h[1]);
      const cl = require('./mission.client'), fq = recipe.groups.flatMap(g => g.q).find(q => q.id === 'from');
      ok(cl.kinds.includes('misfrom') && fq && fq.kind === 'misfrom' && /S\.missionsSp=1;show\("missions"\)/.test(cl.script) && ['task.mission.k.sp', 'task.mission.k.spgo'].every(k => lang.some(r => r[0] === k && r.slice(1).every(Boolean))), 'the from question has a button that opens the single-player card'); }
    { const s = JSON.stringify(require('./mission.lang')); ok(!/\[T\]|Limit [A-Z]+-\d|Ограничение [A-Z]|Обмеження [A-Z]/.test(s), 'help shows no [T] tags or Limit lines'); ok(!/军队/.test(s), 'zh: one word for a lobby army (阵营)'); ok(!/лишних|зайвих/.test(s), 'ru/uk: extra money, not superfluous'); }
    ok(JSON.stringify(qOf('money_period').when.budget_mode) === '["with_update","without_update"]' && qOf('money_speed').when.budget_mode === 'with_update', 'money period and speed asked only for the budgets that use them', JSON.stringify([qOf('money_period').when, qOf('money_speed').when]));
    refuses({ from: 'combat', newmode: false, to: 'combat', card_minplayers: 1 }, /Only a mode that plays like cooperative/, 'fewest players 1 on a versus mode');
    { let e = null; try { recipe.compile({}, mk({ from: 'combat', newmode: true, with_mode: 'x_coop', from_mode: 'cooperative', card_minplayers: 1 })); } catch (x) { e = x; } ok(!e, 'fewest players 1 on a mode that plays like cooperative', e && e.message); }
    ok(v.duration === 90 && v.freeze_time === 30, 'values: match length and freeze time shown from the combat card', JSON.stringify([v.duration, v.freeze_time]));
    ok(['team_a_armies', 'team_b_armies', 'alliance_axis', 'alliance_allies'].every(id => qOf(id).kind === 'list' && qOf(id).picker && qOf(id).picker.lookup === 'army') && typeof recipe.lookups.army === 'function', 'armies: list pickers with the army lookup (lobby names)');
    ok(Array.isArray(v.team_a_armies) && Array.isArray(v.alliance_axis), 'values: team armies and alliances are lists', JSON.stringify([v.team_a_armies, v.alliance_axis]));
    { const r = recipe.compile({}, mk({ from: 'combat', newmode: false, to: 'combat', team_b_armies: list(['usa', 'eng']) })); const rows = r.gen ? r.gen.ops.filter(o => o.op === 'set').flatMap(o => o.rows) : []; ok(rows.some(x => x.path === 'game/teamSettings/teams/"b"/armies' && x.value === '"usa eng"'), 'team armies: one army per line joined into the card', JSON.stringify(rows)); }
    refuses({ from: 'combat', newmode: false, to: 'combat', team_a_title: 'Red Army' }, /no spaces.*text task/, 'a team name with spaces says to add a text key first');
    { const r = recipe.compile({}, mk({ from: 'combat', newmode: false, to: 'combat', editor: { src: 'ext' } })); ok(r.notes.some(n => /^After Write: 1\. Start the game editor .*press Check/.test(n)), 'editor: numbered steps after Write', JSON.stringify(r.notes)); }
    { const lang = require('./mission.lang'), h = lang.find(r => r[0] === 'task.mission.h.editor'); ok(h && !/Write this task first/.test(h[1]) && /after Write/.test(h[1]), 'editor help: steps after Write, none mid walk', h && h[1]); }
    { const lang = require('./mission.lang'); ok(['bots', 'card_ranked', 'armies', 'teams_mode', 'score'].every(id => /every map of it while your mod is on/.test(lang.find(r => r[0] === 'task.mission.h.' + id)[1])), 'card helps say a game mode counts on every map of it'); }
    { const r = recipe.compile({}, mk({ from: 'captureflag', newmode: false, to: 'captureflag', score: 300 })); ok(!r.gen && r.notes.some(n => /no score limit/.test(n)), 'captureflag score gives a note, no op', JSON.stringify(r)); }
    { const r = recipe.compile({}, mk({ from: 'battle_zones', newmode: false, to: 'battle_zones', score: 100, bots: true, card_ranked: true, teams_mode: 'normal' })); ok(!r.gen, 'answers equal to the card give no op', JSON.stringify(r.gen)); }
    { const r = recipe.compile({}, mk({ from: 'captureflag', newmode: false, to: 'captureflag', eco_on: true, eco_preset: 'standard', balance_cp: 2 })); ok(!r.gen && r.notes.some(n => /no such key/.test(n)), 'a key the preset lacks gives a note, no op', JSON.stringify(r)); }
    { const r = recipe.compile({}, mk({ from: 'combat', newmode: false, to: 'combat', eco_on: true, eco_preset: 'both', unit_limits: list(['flamer=4', 'sniper_only=2', 'officer=1', 'heavyaa=1', 'single=20']) })); const op = r.gen && r.gen.ops.find(o => o.op === 'preset'); ok(op && op.name === 'all' && op.file === 'presets_all.inc' && op.set.unitLimits === 'flamer=4', 'both presets: one preset op on all, the changed line only', JSON.stringify(r.gen)); }
  }
  console.log('extra: ' + passes + ' passed, ' + fails + ' failed');

  // 1 change a stock mode's card (battle zones): score, capture time, no friendly fire, fog off, not ranked, list place, most players
  const r1 = await kit.run(recipe, require('./mission.lang'), {
    base: BASE, verb: 'change', mod: path.join(scratch, 'mods', 'mission_card'),
    answers: Object.assign({ from: 'battle_zones', newmode: false, to: 'battle_zones', score: 300, capture_time: 60, friendly: false, fog: 'fog_off', card_ranked: false, card_order: 50, card_maxplayers: 8 },
      { team_a_max_slots: 4, team_a_title: 'mp/alliance/axis', alliance_allies: list(['usa', 'eng', 'ger2']) }),
    planFiles: ['resource/set/multiplayer/games/battle_zones.set'].concat(['resource/set/multiplayer/games/preset_alliances.inc']),
    write: true,
    after: (mod, w, ok2) => {
      const t = read(path.join(mod, 'resource', 'set', 'multiplayer', 'games', 'battle_zones.set'));
      ok2(/scoreFinal\s+300/.test(t), 'card: scoreFinal 300', t.slice(0, 600));
      ok2(/flag_capture_time=60;/.test(t) && /flag_release_time=10/.test(t) && /points_table=/.test(t), 'card: capture time merged, other parameters kept');
      ok2(!/\{\s*friendlyFire\s*\}/.test(t), 'card: friendly fire off');
      ok2(/fogOfWar\s+fog_off/.test(t), 'card: fog off');
      ok2(!/\{\s*enabled\s*\}/.test(t), 'card: ranked off', t);
      ok2(/\{\s*order\s+50\s*\}/.test(t) && /\{\s*maxPlayers\s+8\s*\}/.test(t), 'card: order 50 and maxPlayers 8 under game', t.slice(0, 400));
      {
        const tm = recipe._t.teamsOf(t);
        ok2(tm.a.max_slots === '4' && tm.a.title === 'mp/alliance/axis' && tm.b.has, 'card: team a slots and name written in its quoted block', JSON.stringify(tm));
        const al = recipe._t.alliancesOf(null, mod, []);
        ok2(al.allies && al.allies.ids.join() === 'usa,eng,ger2' && al.axis && al.axis.ids.join() === 'ger,jap,ger2', 'alliances: rus taken out of allies, ger2 added, axis kept', JSON.stringify(al));
      }
    },
  }, path.join(scratch, 'k1'));
  // 2 a new mode of its own from combat (a mission without flags: no_bots), its card set in the same run (the clone's card in plan)
  const r2 = await kit.run(recipe, require('./mission.lang'), {
    base: BASE, verb: 'make', mod: path.join(scratch, 'mods', 'mission_new'),
    answers: Object.assign({ from: 'combat', newmode: true, with_mode: 'tasktest_mode', from_mode: 'combat', mode_title: 'Task test mode', fog: 'fog_off', card_order: 20, team_b_max_slots: 3 }),
    write: true,
    after: (mod, w, ok2) => {
      const card = read(path.join(mod, 'resource', 'set', 'multiplayer', 'games', 'tasktest_mode.set'));
      ok2(/\{\s*class\s+combat/i.test(card), 'new mode card plays like combat', card.slice(0, 300));
      ok2(!/\{\s*enableBots\s*\}/.test(card), 'new mode from a mission without flags: no bots', card.slice(0, 600));
      ok2(/fogOfWar\s+fog_off/.test(card) && /\{\s*order\s+20\s*\}/.test(card), 'new mode card: fog off and order 20 set on the copy', card.slice(0, 600));
      ok2(recipe._t.teamsOf(card).b.max_slots === '3', 'new mode card: team b slots set in its quoted block', JSON.stringify(recipe._t.teamsOf(card)));
      ok2(fs.existsSync(path.join(mod, 'resource', 'map', 'multi', '1v1_argentan', 'tasktest_mode.mi')), 'the map has the new mode mission');
    },
  }, path.join(scratch, 'k2'));
  // 3 the economy of combat (standard preset in presets_all.inc) and the match length on its card
  const r3 = await kit.run(recipe, require('./mission.lang'), {
    base: BASE, verb: 'change', mod: path.join(scratch, 'mods', 'mission_eco'),
    answers: { from: 'combat', newmode: false, to: 'combat', duration: 60, eco_on: true, eco_preset: 'standard',
      unit_limits: list(['flamer=5', 'sniper_only=2', 'officer=1', 'heavyaa=1', 'single=20', 'tank_heavy=2']), money_start: 400, grow_time: 1200,
      payback_cp: '0 30 50 60 70 80 90', grow_factors: list(['100/1.1', '300/1.3']) },
    planFiles: ['resource/set/multiplayer/games/presets_all.inc', 'resource/set/multiplayer/games/combat.set'],
    write: true,
    after: (mod, w, ok2) => {
      const t = read(path.join(mod, 'resource', 'set', 'multiplayer', 'games', 'presets_all.inc')), s = define(t, 'standard_all'), c = define(t, 'custom_all');
      ok2(/flamer=5/.test(s) && /tank_heavy=2/.test(s) && /officer=1/.test(s), 'preset: unit limits merged in standard_all', s.slice(0, 800));
      ok2(/\{\s*start\s+400\s*\}/.test(s) && /\{\s*growTime\s+1200\s*\}/.test(s), 'preset: start 400 and growTime 1200', s.slice(0, 1200));
      ok2(/"0\t30\t50\t60\t70\t80\t90"/.test(s), 'preset: payback cp written with tabs (MIS-06)');
      ok2(/flamer=3/.test(c) && /%start/.test(c), 'preset: custom_all left as it was', c.slice(0, 600));
      ok2(/\{\s*growFactors\s+"100\/1\.1;300\/1\.3"\s*\}/.test(s) && !/growFactors/.test(c), 'preset: growFactors added to standard_all only', s.slice(0, 1400));
      const card = read(path.join(mod, 'resource', 'set', 'multiplayer', 'games', 'combat.set'));
      ok2(/gameDuration\s+"60 min"/.test(card), 'card: gameDuration "60 min"', card.slice(0, 600));
    },
  }, path.join(scratch, 'k3'));
  if (fails) { process.exitCode = 1; console.log('FAIL (extra checks)'); }
  return [r1, r2, r3];
})();
