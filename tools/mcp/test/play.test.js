// mcp play group test: the handlers of tools/mcp/tools/play.js called directly, on the real game data, read only.
// Nothing is started: launch tools are checked up to the refusal and the command line of a dry run.
// A game that is not installed is skipped with a printed reason. Log triage runs on the saved fixture tools/logtriage/test/fixture/log.
// Author: Imperator_Aug (ARSENAL, ia-c0a57865)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { T } = require('./rpc');
const t = T('play');
const P = require('../tools/play.js'), C = require('../lib/ctx');
const FIX = path.resolve(__dirname, '..', '..', 'logtriage', 'test', 'fixture', 'log');

const call = async (name, args) => { const tool = P.tools.find(x => x.name === name); if (!tool) return { text: 'no tool ' + name, isError: true }; args = args || {}; return tool.handler(args, C.forCall(tool, args)); };
const dirOf = id => { try { return C.forCall(P.tools[0], { game: id }).game({ game: id }).dir; } catch (e) { return null; } };

(async () => {
  const saved = process.env.ARSENAL_ALLOW_LAUNCH; delete process.env.ARSENAL_ALLOW_LAUNCH;
  try {
    // ---- module shape ----
    t.ok(P.group === 'play' && Array.isArray(P.tools) && P.tools.length >= 13, 'module: group play with its tools');
    const names = P.tools.map(x => x.name);
    for (const n of ['mow_game_status', 'mow_game_log', 'mow_game_crash', 'mow_matchup', 'mow_army', 'mow_unit_counter', 'mow_mode_info', 'mow_bots_info', 'mow_settings_info', 'mow_mods_enable', 'mow_game_start', 'mow_game_drive', 'mow_game_shot'])
      t.ok(names.includes(n), 'tool ' + n + ' is there');
    t.ok(P.tools.every(x => /^mow_[a-z]+(_[a-z]+)*$/.test(x.name) && x.title && x.description && x.inputSchema && x.inputSchema.type === 'object' && typeof x.handler === 'function'), 'every tool: name, title, description, schema, handler');
    t.ok(P.tools.every(x => ['as64', 'mowas2', 'goh'].every(g => x.games.includes(g))), 'every tool serves the three games');
    t.ok(['mow_mods_enable', 'mow_game_start', 'mow_game_drive', 'mow_game_shot'].every(n => P.tools.find(x => x.name === n).kind === 'launch') && P.tools.filter(x => x.kind === 'launch').length === 4, 'the four launch tools are kind launch, the rest read');
    t.ok(new Set(names).size === names.length, 'no name twice');

    // ---- refusals that need no game ----
    let r = await call('mow_army', { game: 'cod' });
    t.ok(r.isError && /unknown game/.test(r.text), 'unknown game is refused in plain words');

    // ---- log triage on the saved fixture ----
    r = await call('mow_game_log', { log: FIX });
    t.ok(!r.isError && r.data.findings > 0, 'log: findings on the fixture');
    t.has(r.text, 'No Stuff found', 'log: the missing item line');
    t.has(r.text, 'LOG-07', 'log: the limits row id is cited');
    t.has(r.text, 'fix:', 'log: a fix in plain words');
    t.ok(r.data.dumps === 2 && r.data.oos === 2, 'log: 2 crash reports and 2 out-of-sync reports counted');
    r = await call('mow_game_crash', { log: FIX });
    t.ok(!r.isError && r.data.crashes >= 3, 'crash: crash and fatal errors found');
    t.has(r.text, 'EXCEPTION_ACCESS_VIOLATION', 'crash: the exception');
    t.has(r.text, 'eCannonExtender', 'crash: the failing part by name');
    t.has(r.text, 'NET-04', 'crash: out-of-sync rule cited');
    t.ok(r.data.found.some(x => x.code === 'LOG_CRASH' && x.hints.length), 'crash: a hint for the crash');
    r = await call('mow_game_log', { log: '-x' });
    t.ok(r.isError && /refused/.test(r.text), 'log: a path starting with - is refused');
    r = await call('mow_game_log', { log: path.join(FIX, 'nope') });
    t.ok(r.isError, 'log: a missing path is refused');

    // ---- AS64 / MoW:AS2 on the real install ----
    const as2 = dirOf('as64');
    if (!as2) console.log('play: SKIP the as64 and mowas2 checks: no Assault Squad 2 install found (set ARSENAL_AS2_DIR)');
    else {
      r = await call('mow_game_status', {});
      t.ok(!r.isError && r.data.exe && typeof r.data.running !== 'undefined' && r.data.launchAllowed === false, 'status: install, exe, running, launch off');
      t.ok(!r.text.includes(os.homedir()), 'status: the home folder is not in the answer');

      // known result: Panther 75 mm KwK 42 against the T-34/76 front at 100 m
      r = await call('mow_matchup', { attacker: 'Panther', target: 't34_0', range: 100 });
      t.ok(!r.isError && r.data.method === 'armorsim', 'matchup: traced by the armour simulator');
      t.ok(r.data.gun === '75mm_kwk42' && r.data.attacker.id === 'pz5g' && r.data.target.id === 't34_0', 'matchup: Panther (pz5g) 75mm_kwk42 against t34_0');
      t.ok(r.data.pen === 114, 'matchup: 114 mm at 100 m, got ' + r.data.pen);
      const f = r.data.sides.front;
      t.ok(f.through === 'yes' && f.share === 80 && f.centre.result === 'penetrate' && f.centre.mm === 45 && f.centre.effective === 87.1, 'matchup front: yes, 80%, 45 mm plate counts as 87.1 mm, penetrate; got ' + JSON.stringify(f));
      t.ok(r.data.sides.side.share === 100 && r.data.sides.rear.through === 'yes', 'matchup: side 100%, rear yes');
      t.has(r.text, 'DMG-03', 'matchup: slope rule cited');
      r = await call('mow_matchup', { game: 'mowas2', gun: '75mm_kwk42', target: 't34_0' });
      t.ok(!r.isError && r.data.pen === 114 && r.data.sides.front.through === 'yes', 'matchup: the same by gun name on mowas2');
      r = await call('mow_matchup', { attacker: 'Panther', target: 't34_0', range: 190 });
      t.ok(!r.isError && r.data.pen < 20 && r.data.sides.front.centre.result !== 'penetrate' && /only reaches 140 m/.test(r.text), 'matchup at 190 m: the centre hit fails, and the gun reach is said');
      r = await call('mow_matchup', { attacker: 'no such unit xyz', target: 't34_0' });
      t.ok(r.isError, 'matchup: unknown attacker refused');
      r = await call('mow_matchup', { gun: '-x', target: 't34_0' });
      t.ok(r.isError && /may not start with/.test(r.text), 'matchup: a gun starting with - refused');
      r = await call('mow_unit_armor', { unit: 't34_0' });
      t.ok(!r.isError && r.data.plates.some(p => p.name === 'body1' && p.front === 45), 'armour: t34_0 body1 front 45 mm');

      r = await call('mow_army', {});
      t.ok(!r.isError && ['rus', 'ger', 'usa', 'eng', 'jap'].every(a => r.data.armies[a] > 0), 'army: the armies are listed');
      r = await call('mow_army', { army: 'ger', class: 'tank' });
      const pz = r.data.units.find(u => u.id === 'pz5g');
      t.ok(pz && pz.price === 1350 && pz.rank === 5 && pz.paidWith === 'mp' && pz.class === 'tank' && pz.cooldown != null, 'army ger: Panther 1350 MP, rank 5, cooldown; got ' + JSON.stringify(pz));
      t.has(r.text, 'MIS-15', 'army: rank rule cited');
      t.ok(r.data.units.every((u, i, a) => !i || a[i - 1].paidWith !== 'mp' || u.paidWith !== 'mp' || a[i - 1].price <= u.price), 'army: cheapest first inside a class');
      r = await call('mow_army', { army: 'nope' });
      t.ok(r.isError && /Armies:/.test(r.text), 'army: unknown army refused with the list');

      r = await call('mow_unit_counter', { unit: 'pz5g', enemy: 'rus' });
      t.ok(!r.isError && r.data.method === 'armorsim' && r.data.counters.length > 0, 'counter: a list for the Panther from rus');
      t.ok(r.data.counters.every(c => c.army === 'rus'), 'counter: only the enemy army');
      const fr = r.data.counters.filter(c => c.from === 'front'), fl = r.data.counters.filter(c => c.from !== 'front');
      t.ok(fr.every(c => c.front >= 50) && fl.every(c => c.front < 50 && (c.side >= 50 || c.rear >= 50)), 'counter: front list goes through the front, flank list only side or rear');
      const mp = l => l.filter(c => c.paidWith === 'mp').map(c => c.price);
      t.ok([fr, fl].every(l => mp(l).every((p, i, a) => !i || a[i - 1] <= p)), 'counter: cheapest first');
      r = await call('mow_unit_counter', { unit: 'Rifleman', army: 'ger' });
      t.ok(!r.isError && /no armour to speak of/.test(r.text), 'counter: a soft target is said to be one');

      r = await call('mow_mode_info', {});
      t.ok(!r.isError && ['combat', 'captureflag', 'battle_zones', 'frontline'].every(m => r.data.modes.some(x => x.mode === m)), 'modes: the stock modes');
      t.ok(r.data.economy && r.data.economy.budgets.some(b => b.res === 'mp'), 'modes: economy read');
      r = await call('mow_mode_info', { mode: 'ctf' });
      t.ok(!r.isError && r.data.mode.mode === 'captureflag' && /MIS-63/.test(r.text) && /300/.test(r.text), 'mode ctf: first capture wins (MIS-63), capture time 300 s');
      r = await call('mow_mode_info', { mode: 'nope' });
      t.ok(r.isError, 'mode: unknown mode refused');

      r = await call('mow_bots_info', { army: 'ger' });
      t.ok(!r.isError && r.data.modesWithBots.includes('battle_zones') && r.data.buys.ger && Object.keys(r.data.buys.ger).length > 0, 'bots: modes with bots and the ger buy list');
      t.has(r.text, 'AI-12', 'bots: rule cited');

      // launch tools: refusal with the switch off, then the dry run
      for (const [n, a] of [['mow_mods_enable', { mods: ['as64+'] }], ['mow_game_start', { map: '1v1_gazala' }], ['mow_game_shot', {}], ['mow_game_drive', { game: 'mowas2', action: 'play', routes: ['boot'] }], ['mow_game_drive', { game: 'mowas2', action: 'key', key: 'ESCAPE' }]]) {
        r = await call(n, a);
        t.ok(r.isError && /ARSENAL_ALLOW_LAUNCH/.test(r.text), n + ' ' + (a.action || '') + ': refused while launch is off');
      }
      r = await call('mow_mods_enable', { mods: ['as64+'], dry: true });
      t.ok(!r.isError && r.data.dry && /modswitch\.js .*--set as64\+ --write/.test(r.data.command) && /dry run/i.test(r.text), 'mods dry: the command line, nothing changed');
      r = await call('mow_mods_enable', { mods: ['a,b'], dry: true });
      t.ok(r.isError, 'mods: a name with a comma refused');
      r = await call('mow_mods_enable', { mods: ['--write'], dry: true });
      t.ok(r.isError, 'mods: a name starting with - refused');
      r = await call('mow_game_start', { map: '1v1_gazala', mode: 'battle_zones', players: 2, mods: ['as64+'], dry: true });
      t.ok(!r.isError && /testrun\.js --map multi\/1v1_gazala:battle_zones --exe as64 --players 2 --mods as64\+ --hold 60 --dry/.test(r.data.command), 'start dry as64: the testrun command line; got ' + r.data.command);
      t.has(r.text, 'mp_host multi/1v1_gazala:battle_zones 2', 'start dry as64: the plan');
      t.has(r.text, 'nothing launched', 'start dry as64: testrun says nothing launched');
      r = await call('mow_game_start', { map: 'x y', dry: true });
      t.ok(r.isError, 'start: a map with a space refused');
      r = await call('mow_game_start', { game: 'mowas2', routes: ['boot', 'lobby_gazala'], dry: true });
      t.ok(!r.isError && /uidrive\.js play mowas2 boot,lobby_gazala --dry/.test(r.data.command) && /TST-19/.test(r.text), 'start dry mowas2: recorded routes, TST-19 said');
      r = await call('mow_game_drive', {});
      t.ok(!r.isError && r.data.na && /TST-17/.test(r.text), 'drive as64: not served, said plainly');
      r = await call('mow_game_routes', { game: 'mowas2' });
      t.ok(!r.isError && r.data.routes.some(x => x.route === 'boot'), 'routes mowas2: listed without launch permission');
      r = await call('mow_game_drive', { game: 'mowas2', action: 'click', x: 100, y: 200, dry: true });
      t.ok(!r.isError && /uidrive\.js click mowas2 100 200/.test(r.data.command), 'drive dry: the click command line');
      r = await call('mow_game_shot', { dry: true, frac: '0,0.8,0.3,0.2' });
      t.ok(!r.isError && /win\.ps1 -ProcName as64 -Op shot/.test(r.data.command) && /shotcrop\.js/.test(r.text) && !fs.existsSync(r.data.file), 'shot dry: the command line, no picture written');
      r = await call('mow_game_shot', { dry: true, frac: '1,2' });
      t.ok(r.isError, 'shot: a bad cut-out refused');
      t.ok(process.env.ARSENAL_ALLOW_LAUNCH === undefined, 'the launch switch was never set by a tool');
    }

    // ---- Gates of Hell on the real install ----
    const goh = dirOf('goh');
    if (!goh) console.log('play: SKIP the goh checks: no Gates of Hell install found (set ARSENAL_GOH_DIR)');
    else {
      r = await call('mow_army', { game: 'goh' });
      t.ok(!r.isError && r.data.armies.ger > 0 && r.data.armies.fin > 0, 'goh army: armies listed');
      t.ok(/GHMIS-85/.test(r.text) && r.data.economy.budgets.some(b => b.res === 'dp'), 'goh army: no rank (GHMIS-85), doctrine points');
      r = await call('mow_army', { game: 'goh', army: 'ger', period: 'mid', class: 'tank' });
      t.ok(!r.isError && r.data.count > 0 && r.data.units.every(u => u.period === 'mid' && u.rank === undefined), 'goh army ger mid tanks: period kept, no rank');
      r = await call('mow_matchup', { game: 'goh', attacker: 'panther', target: 'tiger' });
      t.ok(!r.isError && r.data.method === 'flat' && r.data.pen > 0 && /GHDMG-37/.test(r.text) && /does not serve Gates of Hell/.test(r.text), 'goh matchup: flat comparison, said plainly');
      r = await call('mow_unit_counter', { game: 'goh', unit: 'tiger', enemy: 'rus' });
      t.ok(!r.isError && r.data.method === 'flat' && r.data.counters.length > 0, 'goh counter: flat list');
      r = await call('mow_mode_info', { game: 'goh' });
      t.ok(!r.isError && r.data.modes.some(m => m.mode === 'frontlines') && !r.data.modes.some(m => m.mode === 'combat'), 'goh modes: frontlines, no combat');
      r = await call('mow_mode_info', { game: 'goh', mode: 'combat' });
      t.ok(r.isError && /no combat mode/.test(r.text), 'goh: combat refused with the reason');
      r = await call('mow_bots_info', { game: 'goh' });
      t.ok(!r.isError && /GHMIS-66/.test(r.text) && !r.data.buys, 'goh bots: rules only, said plainly');
      r = await call('mow_game_start', { game: 'goh', map: 'x', dry: true });
      t.ok(!r.isError && /uidrive\.js play goh boot --dry/.test(r.data.command) && /were not used/.test(r.text), 'goh start dry: recorded route, map not honoured and said so');
      r = await call('mow_game_start', { game: 'goh' });
      t.ok(r.isError && /ARSENAL_ALLOW_LAUNCH/.test(r.text), 'goh start: refused while launch is off');
    }
  } catch (e) { t.ok(false, 'test threw: ' + (e && e.stack || e)); }
  finally { if (saved !== undefined) process.env.ARSENAL_ALLOW_LAUNCH = saved; }
  t.done();
})();
