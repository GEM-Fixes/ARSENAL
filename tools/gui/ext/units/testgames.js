// units + balance ext, game parity part (run from test.js): the page's game (ctx.gameId) reaches the catalogue, the edits and the
// Balance stamp. MoW:AS2: the shared AS2 install with as64.exe and an as64/core card that AS64 sees and MoW:AS2 must not.
// GoH: a made-up GoH install (binaries/x64/call_to_arms.exe, units/<period>/units_ger.set blocks, inf_ger.set soldiers) and a mod
// folder outside it: find, stats, price, unlock (ci), name (.pot), army price, bigger squad, rifle range, add (card copy, period
// pick), the plain lines (rank, head start, armour, describe, bots) and the write guard for a folder inside the GoH install.
// run({scratch, ok, TOOLS, fx}) -> promise. No game, no network.
// Author: Imperator_Aug (ARSENAL, ia-72fdcdfe)
const fs = require('fs'), path = require('path'), cp = require('child_process'), assert = require('assert');

function put(root, key, text, enc) {
  const f = path.join(root, key); fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.from(text.replace(/\r?\n/g, '\r\n'), enc || 'latin1'));
}
const U = 'resource/set/multiplayer/units/';
// a tiny GoH install shaped like the real lists (macro defines in settings.set, cards as {"id" ("macro" args) ..} blocks)
function gohGame(dir) {
  const G = path.join(dir, 'gohgame');
  fs.rmSync(G, { recursive: true, force: true });
  put(G, 'binaries/x64/call_to_arms.exe', '');
  put(G, U + 'common.set', ';SDL\n{units\n\t(include "settings.set")\n\t(include "late/inf_ger.set")\n\t(include "late/units_ger.set")\n\t(include "mid/inf_ger.set")\n\t(include "mid/units_ger.set")\n}\n');
  put(G, U + 'settings.set', ';SDL\n' +
    '(define "soldier"\n\t{breed}\n\t{cost %cost}\n\t{tags "%side man"}\n)\n' +
    '(define "vehicle"\n\t{charge {delay %cd} {interval %ci}}\n\t{tags "%t %side %period"}\n\t{group "%g"}\n\t{button "%b"}\n\t{cw %cw}\n\t{cp %cp}\n\t{content "* (mp/%side/%period/%crew)"}\n\t{cost %cost}\n)\n' +
    '(define "squad_vehicle2_doctrine"\n\t{content "%vehicle (mp/%side/%period/%crew1 mp/%side/%period/%crew2)"}\n\t{tags "%side %period"}\n\t{button "doctrine"}\n)\n' +
    '(define "doctrine_t1"\n\t{charge {interval %cool}}\n\t{group "doctrine_t1"}\n\t{doctrine "%d"}\n\t{cost %cost}\n)\n' +
    '(define "single_with1type"\n\t{"%name(%side)"\n\t\t{charge\n\t\t\t{delay %cd}\n\t\t\t{interval %ci}\n\t\t}\n\t\t{content "mp/%side/%period/%c1"}\n\t\t{tags "all infantry %side %t %period"}\n\t\t{group "%g"}\n\t\t{button "%b"}\n\t\t{squad_cost_factor %scf}\n\t}\n)\n' +
    '(define "squad_with2types"\n\t{content "mp/%side/%period/%c1 mp/%side/%period/%c2"}\n\t{tags "infantry %side %period"}\n\t{group "%g"}\n\t{button "%b"}\n\t{squad_cost_factor 1}\n)\n');
  const inf = p => ';SDL\n' + ['squadleader:10', 'rifleman:8', 'tankman:6'].map(x => x.split(':')).map(([n, c]) => `{"mp/ger/${p}/${n}" ("soldier" side(ger) cost(${c}))}`).join('\n') + '\n';
  put(G, U + 'late/inf_ger.set', inf('late'));
  put(G, U + 'mid/inf_ger.set', ';SDL\n{"mp/ger/mid/squadleader" ("soldier" side(ger) cost(10))}\n');
  put(G, U + 'late/units_ger.set', ';SDL\n' +
    '{"pz4h"\n\t("vehicle"  period(late) cd(60) ci(180) t(tank) side(ger) crew(tankman:4) g(tank2) b(tank) cw(2) cp(10)\n\tcost(300))\n}\n\n' +
    '{"doctrine_kubel"\n\t("squad_vehicle2_doctrine" side(ger) period(late) vehicle(kubel) crew1(tankman:1) crew2(rifleman:2))\n\t("doctrine_t1" cool(240) d(late_ger_allround) cost(15))\n}\n\n' +
    '{"grenadiers(ger)"\n\t("squad_with2types" side(ger) period(late) c1(squadleader:1) c2(rifleman:5) g(inf) b(inf1))\n\t{cost 20}\n}\n' +
    // a squad a macro builds (call line, no block: the catalogue's card file is the define) and one id in two period lists
    '("single_with1type" side(ger) name(single_rifle)\t\tperiod(late) cd(0)   ci(3)   g(single_1)\t\tc1(rifleman:1)\t\tb(inf2) t() scf(1.25))\n' +
    '{"pz3j"\n\t("vehicle"  period(late) cd(60) ci(150) t(tank) side(ger) crew(tankman:3) g(tank1) b(tank) cw(2) cp(8)\n\tcost(250))\n}\n');
  put(G, U + 'mid/units_ger.set', ';SDL\n{"pz3j"\n\t("vehicle"  period(mid) cd(60) ci(120) t(tank) side(ger) crew(tankman:3) g(tank1) b(tank) cw(2) cp(8)\n\tcost(200))\n}\n' +
    '("single_with1type" side(ger) name(single_rifle)\t\tperiod(mid) cd(0)   ci(3)   g(single_1)\t\tc1(squadleader:1)\t\tb(inf2) t() scf(1.25))\n');
  const tank = gun => '{game_entity\n\t{Weaponry\n\t\t{place "gun"\n\t\t\t{weapon "' + gun + '"}\n\t\t}\n\t}\n}\n';
  put(G, 'resource/entity/-vehicle/tank_medium/pz4h/pz4h.def', tank('75mm_kwk40'));
  put(G, 'resource/entity/-vehicle/tank_medium/pz4h_x/pz4h_x.def', '{game_entity\n\t{hp 1}\n}\n');
  put(G, 'resource/entity/-vehicle/tank_medium/pz3j/pz3j.def', tank('50mm_kwk39'));
  put(G, 'resource/entity/-vehicle/car/kubel/kubel.def', '{game_entity\n}\n');
  put(G, 'resource/set/stuff/rifle/mosin', '{rifle\n\t{range 60 60}\n\t{damage 30}\n}\n');
  // the bots' purchase list of ger in mid (GHMIS-66: no bot.data.lua), shaped like the real script/multiplayer/units/<army>/<list>.<army>.lua
  put(G, 'resource/script/multiplayer/units/ger/mid.ger.lua', 'Purchases["mid.ger"] = {\n\t{Repeat = 0,\n\t\tUnits = {\n' +
    '\t\t\t{priority = 1.0, type = {"Class2", "Infantry", "Squad",}, unit = "grenadiers(ger)"},\n' +
    '\t\t\t{priority = 2.0, type = {"Class1", "Tank", "Medium",}, unit = "pz3j"},\n\t\t},\n\t},\n}\n');
  const M = path.join(G, 'mods', 'inside'); fs.mkdirSync(M, { recursive: true }); put(M, 'mod.info', '{name "inside"}\n');
  return G;
}

async function run(o) {
  const { scratch, ok, TOOLS, fx } = o;
  const ext = require('./index'), R = ext.routes, BR = require('../balance/index').routes;
  const seen = [];
  const runTool = async (tool, entry, args, x) => {
    seen.push(args);
    const r = cp.spawnSync(process.execPath, [path.join(TOOLS, entry), ...args], { encoding: 'utf8', timeout: (x && x.timeoutMs) || 120000 });
    return { code: r.status, stdout: r.stdout, stderr: r.stderr, timedOut: !!(r.error && r.error.code === 'ETIMEDOUT') };
  };
  const ctxOf = (gid, game, goh, tmp) => {
    fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
    const games = require('../../../lib/games');
    return { gamedir: game, tools: TOOLS, tmpRoot: tmp, allowLaunch: false, modAgeMs: 0, runTool, game: () => game,
      gameId: () => gid, exe: () => games.exeOf(gid), kind: () => games.kindOf(gid), gohDir: () => goh || null, curDir: () => (gid === 'goh' ? goh : game) };
  };
  const callOf = c => (name, body) => R['POST /api/x/units/' + name]('/api/x/units/' + name, body, c);
  const refusal = async (p, re, what) => { try { await p; } catch (e) { assert.strictEqual(e.status, 400, what + ': ' + e.message); if (re) assert.ok(re.test(e.message), what + ': ' + e.message); return e.message; } throw new Error(what + ': expected a refusal'); };

  // ---------- MoW:AS2: the shared install, as64.exe present, an as64/core card ----------
  {
    const d = path.join(scratch, 'mow'), f = fx.make(d);
    put(f.game, 'as64.exe', ''); put(f.game, 'mowas_2.exe', '');
    put(f.game, 'as64/core/' + U + 'vehicles_rus.set',
      '{"t34_0"            ("v" c(0) t(all medium) \t\ts(rus) n1(3) n2(1) g(e2) sc(17.50) b(v4) cw(0) cp(15)) {level 1} {cost 999} {fore 1.0}}\n' +
      '{"t34_3"            ("v" c(120) t(all medium) \t\ts(rus) n1(4) n2(1) g(e2) sc(22.50) b(v4) cw(0) cp(15)) {level 2} {cost 450} {fore 0.5}}\n');
    const a = ctxOf('as64', f.game, null, path.join(d, 'tmp-as64')), m = ctxOf('mowas2', f.game, null, path.join(d, 'tmp-mow'));
    seen.length = 0;
    const sa = await callOf(a)('stats', { id: 't34_0' });
    assert.ok(seen.length && !seen[0].includes('--exe'), 'as64: statsheet args as before: ' + JSON.stringify(seen[0]));
    assert.ok(seen[0].includes('--cache') && /[\\/]units[\\/]ix-[0-9a-f]{10}\.json$/.test(seen[0][seen[0].indexOf('--cache') + 1]), 'as64: own index file as before: ' + JSON.stringify(seen[0]));
    seen.length = 0;
    const sm = await callOf(m)('stats', { id: 't34_0' });
    assert.ok(seen.length && seen[0].join(' ').includes('--exe mowas_2'), 'mowas2: statsheet --exe mowas_2: ' + JSON.stringify(seen[0]));
    // MoW:AS2 reads through the shared entity index of exe mowas_2 (no --cache of its own); AS64 keeps its own index file
    assert.ok(!seen[0].includes('--cache'), 'mowas2: no --cache: ' + JSON.stringify(seen[0]));
    assert.strictEqual(sa.cost, 999, 'AS64 sees the as64/core card'); assert.strictEqual(sm.cost, 350, 'MoW:AS2 sees the base card');
    ok('MoW:AS2: catalogue through statsheet --exe mowas_2 (AS64 args unchanged), own cache; t34_0 costs 999 in AS64 (as64/core) and 350 in MoW:AS2');
    const s2 = await callOf(m)('search', { q: 'T-34' });
    assert.deepStrictEqual(s2.results.map(r => r.id + ':' + r.cost).sort(), ['t34_0:350', 't34_3:450']); ok('MoW:AS2: search');
    const ca = await callOf(a)('change', { id: 't34_0', field: 'cost', value: '400', mod: f.mod });
    const cm = await callOf(m)('change', { id: 't34_0', field: 'cost', value: '400', mod: f.mod });
    assert.ok(!cm.errors.length, JSON.stringify(cm.errors));
    assert.strictEqual(ca.rows[0].old, '999'); assert.strictEqual(cm.rows[0].old, '350', 'MoW:AS2 edit reads the base card (gen Ctx target mowas2)');
    const w = await callOf(m)('change', { id: 't34_0', field: 'cost', value: '400', mod: f.mod, write: true });
    assert.ok(w.written, JSON.stringify(w.errors));
    const vr = fs.readFileSync(path.join(f.mod, U + 'vehicles_rus.set'), 'latin1');
    assert.ok(/"t34_0".*\{cost 400\}/.test(vr) && !/999/.test(vr), vr); ok('MoW:AS2: price change edits the MoW:AS2 card (no as64/core bytes in the mod copy)');
    const ap = await callOf(m)('armyprice', { army: 'rus', kind: 'vehicle', percent: 10, mod: f.mod });
    assert.ok(ap.rows.some(r => r.id === 't34_3' && r.old === 450 && r.new === 495), JSON.stringify(ap.rows)); ok('MoW:AS2: army price');
    const h = await callOf(m)('hints', { id: 't34_3', mod: f.mod }); assert.ok(h.similar.length >= 1, JSON.stringify(h)); ok('MoW:AS2: price hints');
    const ds = await callOf(m)('describe', { text: 'soviet rifle squad, cost 150', mod: f.mod });
    assert.ok(!ds.errors.length && ds.spec, JSON.stringify(ds.errors)); ok('MoW:AS2: describe preview (target mowas2)');
    // Balance: the game is in the stamp, so the two games never share a table
    const S = require('../balance/server');
    assert.notStrictEqual(S.stampOf(f.game, null, 'mowas2'), S.stampOf(f.game, null, 'as64'));
    assert.strictEqual(S.stampOf(f.game, null, 'as64'), S.stampOf(f.game, null));
    const ta = await BR['POST /api/x/balance/table']('/api/x/balance/table', { mod: null }, a), tm = await BR['POST /api/x/balance/table']('/api/x/balance/table', { mod: null }, m);
    const c0 = t => (t.rows.find(r => r.id === 't34_0') || {}).cost;
    assert.strictEqual(c0(ta), 999); assert.strictEqual(c0(tm), 350); ok('MoW:AS2: Balance table of its own (game in the stamp): t34_0 999 in AS64, 350 in MoW:AS2');
    const bc = await BR['POST /api/x/balance/change']('/api/x/balance/change', { mod: f.mod, ids: ['t34_3'], field: 'cost', op: 'set', value: 470 }, m);
    assert.ok(!bc.errors.length && bc.rows.length === 1 && String(bc.rows[0].old) === '450', JSON.stringify(bc)); ok('MoW:AS2: Balance bulk change preview reads the MoW:AS2 card');
    // the file the bulk change edits comes from the page's game: t34_0 costs 350 in the base list and 999 in the as64/core list.
    // A rank change leaves the cost as it is, so the mod copy shows which list was read (a cost change would hide it: 999 and 350
    // both become the new value). A fresh mod, so no earlier copy in the mod hides the view.
    const m2 = path.join(d, 'mod-bal'); fs.rmSync(m2, { recursive: true, force: true }); put(m2, 'mod.info', '{name "bal"}\n');
    const bw0 = await BR['POST /api/x/balance/change']('/api/x/balance/change', { mod: m2, ids: ['t34_0'], field: 'rank', op: 'set', value: 3, write: true }, m);
    assert.ok(bw0.written && !bw0.errors.length && bw0.rows.length === 1, JSON.stringify([bw0.errors, bw0.rows, bw0.skipped]));
    const vb = fs.readFileSync(path.join(m2, U + 'vehicles_rus.set'), 'latin1');
    assert.ok(/"t34_0".*\{level 3\} \{cost 350\}/.test(vb) && !/999/.test(vb), 'MoW:AS2 bulk change edits the base list, not as64/core: ' + vb);
    ok('MoW:AS2: Balance bulk change edits the base list (t34_0 rank 3, cost 350 kept; no as64/core card in the mod copy)');
  }

  // ---------- a vehicle card kept in a list of another name (pz3m_ger2: s(ger) in vehicles_ger2.set), both AS2 games;
  // the Balance page's body.gid reaches the load as it reaches the stamp ----------
  {
    const d = path.join(scratch, 'ger2'), f = fx.make(d);
    put(f.game, 'as64.exe', ''); put(f.game, 'mowas_2.exe', '');
    put(f.game, U + 'vehicles.set', fs.readFileSync(path.join(f.game, U + 'vehicles.set'), 'latin1') + '\t(include "vehicles_ger2.set")\n');
    put(f.game, U + 'vehicles_ger2.set', '{"pz3m_ger2"         ("v" c(60) t(all medium) \t\t\ts(ger) n1(4) n2(1) g(e3) sc(30.00) b(v4) cw(0) cp(20)) {level 1} {cost 400} {fore 1.0}}\n');
    put(f.game, 'as64/core/' + U + 'vehicles_rus.set', '{"t34_0"            ("v" c(0) t(all medium) \t\ts(rus) n1(3) n2(1) g(e2) sc(17.50) b(v4) cw(0) cp(15)) {level 1} {cost 999} {fore 1.0}}\n');
    for (const gid of ['as64', 'mowas2']) {
      const c = ctxOf(gid, f.game, null, path.join(d, 'tmp-' + gid));
      const p = await callOf(c)('change', { id: 'pz3m_ger2', field: 'cost', value: '410', mod: f.mod });
      assert.ok(!p.errors.length && p.rows.length === 1 && p.rows[0].old === '400', gid + ': ' + JSON.stringify([p.errors, p.rows]));
      const w = await callOf(c)('change', { id: 'pz3m_ger2', field: 'cost', value: '410', mod: f.mod, write: true });
      assert.ok(w.written && !w.errors.length, gid + ': ' + JSON.stringify(w.errors));
      assert.ok(/"pz3m_ger2".*\{cost 410\}/.test(fs.readFileSync(path.join(f.mod, U + 'vehicles_ger2.set'), 'latin1')), gid + ': vehicles_ger2.set in the mod');
      fs.rmSync(path.join(f.mod, 'resource'), { recursive: true, force: true });
    }
    ok('AS64 and MoW:AS2: Units price change on a card in vehicles_ger2.set (side ger): gen card op gets army ger2, no card error, 400 -> 410 written');
    // a request whose header says AS64 and whose body names MoW:AS2: stamp and build both MoW:AS2 (t34_0 350, not the as64/core 999)
    const a = ctxOf('as64', f.game, null, path.join(d, 'tmp-gid'));
    const tb = await BR['POST /api/x/balance/table']('/api/x/balance/table', { mod: null, gid: 'mowas2' }, a);
    assert.strictEqual((tb.rows.find(r => r.id === 't34_0') || {}).cost, 350, 'body.gid mowas2 builds the MoW:AS2 table');
    const bc = await BR['POST /api/x/balance/change']('/api/x/balance/change', { mod: f.mod, gid: 'mowas2', ids: ['t34_0'], field: 'cost', op: 'set', value: 360 }, a);
    assert.ok(!bc.errors.length && bc.rows.length === 1 && String(bc.rows[0].old) === '350', JSON.stringify(bc));
    ok('Balance: body.gid reaches the load (table and change read the MoW:AS2 card under an AS64 header)');
  }

  // ---------- Gates of Hell ----------
  {
    const d = path.join(scratch, 'goh'), G = gohGame(d), mod = path.join(d, 'gohmod');
    fs.rmSync(mod, { recursive: true, force: true }); fs.mkdirSync(mod, { recursive: true }); put(mod, 'mod.info', '{name "goh test"}\n');
    const c = ctxOf('goh', null, G, path.join(d, 'tmp')), call = callOf(c), rd = k => fs.readFileSync(path.join(mod, k), 'latin1');
    seen.length = 0;
    const s = await call('search', { q: '' });
    assert.ok(seen[0][0] === G && seen[0].join(' ').includes('--exe goh'), JSON.stringify(seen[0]));
    assert.ok(!seen[0].includes('--cache'), 'GoH: the shared GoH entity index (no --cache): ' + JSON.stringify(seen[0]));
    // every game gets 10 minutes (a cold GoH index takes 1-3 min); the stop line promises no cache
    {
      const ms = [], stub = gid => Object.assign(ctxOf(gid, gid === 'goh' ? null : G, gid === 'goh' ? G : null, path.join(d, 'tmp-slow-' + gid)),
        { runTool: async (tool, entry, args, x) => { ms.push(x.timeoutMs); return { code: null, stdout: '', stderr: '', timedOut: true }; } });
      // with the mod folder: the game catalogue is the one just read (kept in memory), the mod catalogue is a new read
      const m1 = await refusal(callOf(stub('goh'))('search', { q: '', mod }),/longer than 10 minutes .*nothing of that read was kept/, 'GoH timeout');
      await refusal(callOf(stub('as64'))('search', { q: '' }), /longer than 10 minutes/, 'as64 timeout');
      assert.deepStrictEqual(ms, [600000, 600000]); assert.ok(!/second run uses a cache/.test(m1), m1);
      ok('GoH: catalogue reads through the shared GoH entity index; a cold read gets 10 minutes like the AS2 games, and the stop line no longer promises a cache');
    }
    const pz = s.results.find(r => r.id === 'pz4h');
    assert.ok(pz && pz.army === 'ger' && pz.period === 'late' && pz.cost === 300, JSON.stringify(s.results));
    assert.ok(s.results.some(r => r.id === 'grenadiers(ger)' && r.period === 'late'), JSON.stringify(s.results));
    ok('GoH: catalogue of the GoH install (statsheet --exe goh), army and period from the card file');
    const st = await R['GET /api/x/units/status']('/api/x/units/status?mod=' + encodeURIComponent(mod), null, c);
    assert.ok(st.modOk && st.gid === 'goh' && st.game === G && !st.readOnly, JSON.stringify(st));
    const inside = path.join(G, 'mods', 'inside');
    const st2 = await R['GET /api/x/units/status']('/api/x/units/status?mod=' + encodeURIComponent(inside), null, c);
    assert.ok(st2.modOk && /Gates of Hell/.test(st2.readOnly || ''), JSON.stringify(st2)); ok('GoH: status (a mod inside the GoH install is read only, said in one line)');
    const t = await call('stats', { id: 'pz4h' }); assert.strictEqual(t.id, 'pz4h'); ok('GoH: stats');
    // price, unlock
    let r = await call('change', { id: 'pz4h', field: 'cost', value: '350', mod });
    assert.ok(!r.errors.length && !r.written, JSON.stringify(r.errors)); assert.deepStrictEqual([r.rows[0].old, r.rows[0].new], ['300', '350']);
    assert.ok(!fs.existsSync(path.join(mod, 'resource')));
    r = await call('change', { id: 'pz4h', field: 'cost', value: '350', mod, write: true });
    assert.ok(r.written, JSON.stringify(r.errors)); assert.ok(/\tcost\(350\)\)/.test(rd(U + 'late/units_ger.set')) && /\r\n/.test(rd(U + 'late/units_ger.set')));
    r = await call('change', { id: 'pz4h', field: 'charge', value: '200', mod, write: true });
    assert.ok(r.written, JSON.stringify(r.errors)); assert.ok(/ci\(200\)/.test(rd(U + 'late/units_ger.set')) && /cd\(60\)/.test(rd(U + 'late/units_ger.set')));
    r = await call('change', { id: 'doctrine_kubel', field: 'charge', value: '120', mod, write: true });
    assert.ok(r.written, JSON.stringify(r.errors)); assert.ok(/cool\(120\)/.test(rd(U + 'late/units_ger.set'))); ok('GoH: price (cost) and unlock (ci, cool on a doctrine card), preview then write, CRLF kept');
    await refusal(call('change', { id: 'pz4h', field: 'level', value: '2', mod }), /Not available in GoH: .*GHMIS-85/, 'level');
    await refusal(call('change', { id: 'pz4h', field: 'fore', value: '0.5', mod }), /GHMIS-85/, 'fore');
    await refusal(call('change', { id: 'pz4h', field: 'armor', part: 'x', value: '1', mod }), /"x" is not an armoured part of this unit\. Its parts: none/, 'armour');
    ok('GoH: plain lines for rank and head start (GHMIS-85); armour of a unit with no armour numbers names the parts (none)');
    {
      // GoH armour (goharmour.js): its own mod with a pz4h copy that reads a .ext; parts list, preview, write per part, every part %, speed
      const am = path.join(d, 'gohmod-arm'), A = 'resource/entity/-vehicle/tank_medium/pz4h/'; fs.rmSync(am, { recursive: true, force: true });
      put(am, 'mod.info', '{name "goh armour"}\n');
      put(am, A + 'pz4h.def', '{game_entity\n\t(include "pz4h.ext")\n\t{Chassis ("mobility_tank" speed(38) reverse(9))}\n\t{Weaponry\n\t\t{place "gun"\n\t\t\t{weapon "75mm_kwk40"}\n\t\t}\n\t}\n}\n');
      put(am, A + 'pz4h.ext', '{volume "body1"\n\t{thickness 30 {front 80}}\n}\n("shield" args "mantlet" 50)\n');
      const ra = k => fs.readFileSync(path.join(am, A + k), 'latin1');
      const pl = await R['POST /api/x/units/goharmor']('/x', { id: 'pz4h', mod: am }, c);
      const MORE = ['class', 'repair', 'keys', 'hull'];
      assert.deepStrictEqual([pl.speed.kmh, pl.parts.filter(p => !MORE.includes(p.kind)).map(p => p.name + '=' + p.value).join(' ')], [38, 'body1=30, front 80 mantlet=50'], JSON.stringify(pl));
      assert.deepStrictEqual(pl.parts.filter(p => MORE.includes(p.kind)).map(p => p.name + '=' + p.value), ['keys:body1=', 'hull='], JSON.stringify(pl));
      const e0 = ra('pz4h.ext');
      let ar = await call('change', { id: 'pz4h', field: 'armor', part: 'body1', value: '40, front 90, top 15', mod: am });
      assert.ok(!ar.written && ar.rows.length === 3 && ra('pz4h.ext') === e0, JSON.stringify(ar.rows));
      ar = await call('change', { id: 'pz4h', field: 'armor', part: 'body1', value: '40, front 90, top 15', mod: am, write: true });
      assert.ok(ar.written && ra('pz4h.ext').includes('{thickness 40 {front 90} {top 15}}') && /\r\n/.test(ra('pz4h.ext')), ra('pz4h.ext'));
      await refusal(call('change', { id: 'pz4h', field: 'armor', part: 'mantlet', value: 'front 60', mod: am }), /one number for every side/, 'GoH macro side');
      ar = await call('change', { id: 'pz4h', field: 'armor', part: '*', value: '150', mod: am, write: true });
      assert.ok(ar.written && ra('pz4h.ext').includes('{thickness 60 {front 135} {top 23}}') && ra('pz4h.ext').includes('"mantlet" 75'), ra('pz4h.ext'));
      ar = await call('change', { id: 'pz4h', field: 'armor', part: 'speed', value: '45', mod: am, write: true });
      assert.ok(ar.written && ra('pz4h.def').includes('speed(45) reverse(9)'), ra('pz4h.def'));
      ar = await call('change', { id: 'pz4h', field: 'armor', part: 'keys:body1', value: 'caststeel 0.8, highhardness yes', mod: am, write: true });
      assert.ok(ar.written && /\{CastSteel 0\.8\}/.test(ra('pz4h.ext')) && /\{HighHardness\}/.test(ra('pz4h.ext')), ra('pz4h.ext'));
      ar = await call('change', { id: 'pz4h', field: 'armor', part: 'keys:body1', value: 'caststeel 0.8', mod: am, write: true });
      assert.ok(ar.written && !/HighHardness/.test(ra('pz4h.ext')), ra('pz4h.ext'));
      ar = await call('change', { id: 'pz4h', field: 'armor', part: 'hull', value: 'wood', mod: am, write: true });
      assert.ok(ar.written && /\{props "wood"\}/.test(ra('pz4h.def')), ra('pz4h.def'));
      await refusal(call('change', { id: 'pz4h', field: 'armor', part: 'repair:tracks', value: '40', mod: am }), /.+/, 'GoH repair of a part with none');
      ok('GoH armour: parts list, a part with sides (preview then write, CRLF), one side of a macro refused, every part 150%, top speed, volume keys, hull');
      // describe: armour and speed words applied to the copy's own vehicle files (its .ext copied next to it, include repointed)
      let da = await call('describe', { text: 'german tank pz4h with 270mm armour and 50 km/h, cost 400, called Panzer Arm', mod: am });
      assert.ok(!da.errors.length && !da.described.refused.some(x => x.piece === 'armor' || x.piece === 'speed') && da.rows.some(x => x.field === 'armor') && da.rows.some(x => x.field === 'speed'), JSON.stringify([da.errors, da.described.refused, da.rows]));
      da = await call('describe', { text: 'as previewed', mod: am, write: true, spec: da.spec });
      const P = 'resource/entity/-vehicle/tank_medium/panzer_arm/', rp = k => fs.readFileSync(path.join(am, P + k), 'latin1');
      assert.ok(da.written && /speed\(50\)/.test(rp('panzer_arm.def')) && /\(include "panzer_arm\.ext"\)/.test(rp('panzer_arm.def')), JSON.stringify(da.errors) + (fs.existsSync(path.join(am, P)) ? rp('panzer_arm.def') : ''));
      assert.ok(rp('panzer_arm.ext').includes('{front 270}') && ra('pz4h.ext').includes('{front 135}'), rp('panzer_arm.ext'));
      ok('GoH describe: armour (front 270) and speed (50) written to the copy\'s own files; the base unit is untouched');
      // describe: gun words on the copy (gohgun-copy.js): a new cannon file {from "<like>"}, the copy's mount swapped to it
      put(am, 'resource/set/stuff/gun/.presets', '(define "reload time"\n\t{rechargeTime %seconds}\n)\n(define "range_200"\n\t{range 200 200}\n)\n(define "range_210"\n\t{range 210 210}\n)\n(define "penetration_medium"\n\t{x 1}\n)\n');
      put(am, 'resource/set/stuff/gun/gun.pattern', '{weapon\n}\n');
      put(am, 'resource/set/stuff/gun/75mm_kwk40', '{from "pattern gun"\n\t("reload time" seconds(6))\n\t("range_200")\n\t("penetration_medium" shell(aphe) range(200) a(120) b(110) c(100) d(90) e(80))\n}\n');
      let dgun = await call('describe', { text: 'german tank pz4h with a stronger gun, long range, reload 5 s, called Panzer Gun', mod: am });
      assert.ok(!dgun.errors.length && !dgun.described.refused.some(x => x.piece === 'gun') && dgun.spec.ops[0].gun && dgun.rows.some(x => x.field === 'gun'), JSON.stringify([dgun.errors, dgun.described.refused, dgun.spec.ops[0], dgun.rows]));
      dgun = await call('describe', { text: 'as previewed', mod: am, write: true, spec: dgun.spec });
      const gn = dgun.spec.ops[0].gun.name, gt = fs.existsSync(path.join(am, 'resource/set/stuff/gun', gn)) ? fs.readFileSync(path.join(am, 'resource/set/stuff/gun', gn), 'latin1') : '';
      const gd = fs.readFileSync(path.join(am, 'resource/entity/-vehicle/tank_medium/panzer_gun/panzer_gun.def'), 'latin1');
      assert.ok(dgun.written && /\{from "75mm_kwk40"/.test(gt) && /seconds\(5\)/.test(gt) && /"range_210"/.test(gt) && /a\(150\)/.test(gt) && gd.includes('{weapon "' + gn + '"') && ra('pz4h.def').includes('{weapon "75mm_kwk40"}'), JSON.stringify(dgun.errors) + gt + gd);
      ok('GoH describe: gun words make a cannon from the copy\'s gun (reload, penetration x1.25, range_210) and mount it on the copy only');
      // a GoH write leaves restore points (Files page form) for what it wrote: the changed files and the new ones (existed false)
      {
        const MW = require('../../../lib/modwrite'), ur = MW.restoreRoot(am);
        const pts = (dgun.restore || []).map(id => JSON.parse(fs.readFileSync(path.join(ur, id, 'restore-point.json'), 'utf8')));
        assert.ok(dgun.undo === ur && pts.length > 0 && pts.some(p => p.rel === 'resource/set/stuff/gun/' + gn && !p.existed), JSON.stringify([dgun.undo, pts.map(p => p.rel + ':' + p.existed)]));
        ok('GoH write: a restore point per written file (a new file noted as not there before), in ' + path.basename(ur));
      }
      // the gun gen refuses at write time (its source gun is gone from the mod and the game): piece gun only; the rest of the copy is written
      {
        let dx = await call('describe', { text: 'german tank pz4h with 200mm armour and a stronger gun, called Panzer Two', mod: am });
        assert.ok(!dx.errors.length && dx.spec.ops[0].gun, JSON.stringify([dx.errors, dx.described.refused]));
        const gsrc = path.join(am, 'resource/set/stuff/gun/75mm_kwk40'), keep = fs.readFileSync(gsrc);
        dx.spec.ops[0].gun.like = 'no_such_gun_xyz';
        dx = await call('describe', { text: 'as previewed', mod: am, write: true, spec: dx.spec });
        const pd = path.join(am, 'resource/entity/-vehicle/tank_medium/panzer_two/panzer_two.def');
        assert.ok(dx.written && !dx.errors.length && dx.described.refused.some(x => x.piece === 'gun') && !dx.rows.some(x => x.field === 'gun') && dx.rows.some(x => x.field === 'armor')
          && fs.existsSync(pd) && fs.readFileSync(pd, 'latin1').includes('{weapon "75mm_kwk40"}') && fs.readFileSync(gsrc).equals(keep), JSON.stringify([dx.written, dx.errors, dx.described && dx.described.refused, dx.rows]));
        ok('GoH describe: a gun gen refusal refuses piece gun only; the copy, its armour and its card are written');
      }
      // pen_scale: the copy check and gen gohPen share one range (0.2 to 4)
      assert.deepStrictEqual(require('../../../gen/lib/gohgun').PEN_SCALE, [0.2, 4]);
      {
        const refused = [], GC = require('./gohgun-copy');
        GC.onCopy({}, 'x', { gun: { name: 'gx', like: 'gy', pen_scale: 10 }, refused }, []);
        assert.ok(refused.some(r => r.piece === 'gun' && /not valid/.test(r.why)), JSON.stringify(refused));
        ok('GoH describe: pen_scale 10 is refused by the copy check, the same range gen uses');
      }
    }
    // describe on GoH: words -> one card copy over the GoH catalogue; gun / armour / speed words are refused pieces
    // its own mod folder: the tank copy buys its own entity, so its unit files are cloned (the Add checks below expect none in mod)
    const dm = path.join(d, 'gohmod-ds'), rdd = k => fs.readFileSync(path.join(dm, k), 'latin1'); fs.rmSync(dm, { recursive: true, force: true }); fs.mkdirSync(dm, { recursive: true }); put(dm, 'mod.info', '{name "goh ds"}\n');
    let dg = await call('describe', { text: 'german tank with thick armour and a bigger gun, cost 400, called Panzer Neu', mod: dm });
    assert.ok(!dg.errors.length && !dg.written && dg.spec.goh && dg.spec.ops[0].op === 'gohcard', JSON.stringify([dg.errors, dg.spec]));
    assert.deepStrictEqual(dg.described.refused.map(x => x.piece).sort(), ['armor', 'gun'], JSON.stringify(dg.described));
    assert.ok(dg.rows.some(x => x.field === 'cost') && dg.rows.some(x => x.field === 'period') && dg.unit.period, JSON.stringify(dg.rows));
    const before = fs.existsSync(path.join(dm, U + 'late/units_ger.set')) ? rdd(U + 'late/units_ger.set') : '';
    dg = await call('describe', { text: 'as previewed', mod: dm, write: true, spec: dg.spec });
    assert.ok(dg.written && fs.existsSync(path.join(dm, 'resource/entity/-vehicle/tank_medium/panzer_neu/panzer_neu.def')), JSON.stringify(dg.errors));
    const lateD = rdd(U + 'late/units_ger.set'); assert.ok(lateD.length > before.length && /\{"panzer_neu"/.test(lateD), lateD);
    let dq = await call('describe', { text: 'german grenadiers squad of 8 men, cost 80', mod: dm });
    assert.ok(!dq.errors.length && dq.spec.ops[0].members, JSON.stringify([dq.errors, dq.spec]));
    dq = await call('describe', { text: 'as previewed', mod: dm, write: true, spec: dq.spec });
    assert.ok(dq.written && /c1\(squadleader:\d\) c2\(rifleman:\d\)/.test(rdd(U + 'late/units_ger.set')), JSON.stringify(dq.errors));
    await refusal(call('describe', { text: 'as previewed', mod: dm, write: true, spec: { goh: true, ops: [{ op: 'clone', entity: 'pz4h', as: 'evil' }] } }), /Preview again/, 'describe bad spec');
    ok('GoH: describe = words to one card copy (preview, then the previewed spec written), gun and armour words refused, men count, bad spec refused');
    await refusal(call('change', { id: 'pz4h', field: 'cost', value: '350', mod: inside, write: true }), /Gates of Hell/, 'write inside GoH');
    assert.ok(!fs.existsSync(path.join(inside, 'resource'))); ok('GoH: no write into a folder inside the GoH install (writeguard line)');
    // name: .pot under localizations/default/interface/text
    r = await call('change', { id: 'pz4h', field: 'name', value: 'Panzer IV "H"', mod, write: true });
    assert.ok(r.written && !r.errors.length, JSON.stringify(r.errors));
    const pot = fs.readFileSync(path.join(mod, 'localizations/default/interface/text/gohmod.pot'), 'utf8');
    assert.ok(/msgctxt "desc\/entity\/pz4h"\nmsgid "Panzer IV \\"H\\""\nmsgstr ""/.test(pot), pot);
    r = await call('change', { id: 'pz4h', field: 'name', value: 'Panzer IV H', mod, write: true });
    const pot2 = fs.readFileSync(path.join(mod, 'localizations/default/interface/text/gohmod.pot'), 'utf8');
    assert.strictEqual((pot2.match(/msgctxt "desc\/entity\/pz4h"/g) || []).length, 1); assert.ok(/msgid "Panzer IV H"/.test(pot2)); ok('GoH: name into localizations/default/interface/text/<mod>.pot (msgctxt = key, one entry per key)');
    // army price: walks the period folders, changes the card's own cost
    let ap = await call('armyprice', { army: 'ger', kind: 'vehicle', percent: 10, mod });
    assert.ok(ap.rows.some(x => x.id === 'pz3j' && x.old === 200 && x.new === 220), JSON.stringify(ap.rows));
    ap = await call('armyprice', { army: 'ger', kind: 'vehicle', percent: 10, mod, write: true });
    assert.ok(ap.written && /cost\(220\)/.test(rd(U + 'mid/units_ger.set')), JSON.stringify(ap.errors)); ok('GoH: army price walks units/<period>/ files');
    // bigger squad
    let rc = await call('recipe', { recipe: 'squad', id: 'grenadiers(ger)', breed: 'rifleman', count: 7, mod, write: true });
    assert.ok(rc.written, JSON.stringify(rc.errors)); assert.ok(/c2\(rifleman:7\)/.test(rd(U + 'late/units_ger.set')));
    assert.ok(rc.info.some(i => i.code === 'UNITS_GOH_SQUAD_PRICE' && /GHGPL-10/.test(i.msg)), JSON.stringify(rc.info)); ok('GoH: bigger squad (c2(rifleman:7)), price rule GHGPL-10 said');
    // rifle range
    rc = await call('recipe', { recipe: 'range', weapon: 'mosin', range: '80 90', mod, write: true });
    assert.ok(rc.written && !rc.errors.length, JSON.stringify(rc.errors)); assert.ok(/\{range 80 90\}/.test(rd('resource/set/stuff/rifle/mosin'))); ok('GoH: longer rifle range');
    // add: squad card copy into another period (member check), doctrine card copy (card only), bots line
    let a = await call('add', { like: 'grenadiers(ger)', id: 'guards', price: '30', period: 'mid', bots: true, mod });
    assert.ok(!a.errors.length && !a.written, JSON.stringify(a.errors));
    assert.ok(a.warnings.some(w => w.code === 'WARN_UNITS_GOH_MEMBER' && /rifleman/.test(w.msg)), JSON.stringify(a.warnings));
    // bots: the preview runs the Bots page's GoH add-a-unit dry: the row after the copied card's own row, nothing written
    const BL = 'resource/script/multiplayer/units/ger/mid.ger.lua';
    assert.ok(a.bots.state === 'gohadd' && a.bots.likeListed && a.bots.file === BL && !a.bots.undo && a.files.some(f => f.file === BL), JSON.stringify(a.bots));
    assert.ok(!fs.existsSync(path.join(mod, BL)));
    a = await call('add', { like: 'grenadiers(ger)', id: 'guards', price: '30', period: 'mid', name: 'Guards', mod, write: true });
    assert.ok(a.written, JSON.stringify(a.errors)); assert.strictEqual(a.bots.state, 'gohoff'); assert.ok(!fs.existsSync(path.join(mod, BL)));
    const mid = rd(U + 'mid/units_ger.set');
    assert.ok(/\{"guards\(ger\)"\r\n\t\("squad_with2types" side\(ger\) period\(mid\)/.test(mid) && /\{cost 30\}/.test(mid) && /"pz3j"/.test(mid), mid);
    assert.ok(/msgctxt "desc\/squad\/guards\(ger\)"/.test(fs.readFileSync(path.join(mod, 'localizations/default/interface/text/gohmod.pot'), 'utf8')));
    a = await call('add', { like: 'doctrine_kubel', id: 'kubel_more', price: '20', mod, write: true });
    assert.ok(a.written && a.card === 'parts', JSON.stringify(a.errors));
    const late = rd(U + 'late/units_ger.set');
    assert.ok(/\{"kubel_more"\r\n\t\("squad_vehicle2_doctrine" side\(ger\) period\(late\) vehicle\(kubel\)/.test(late) && /\{"doctrine_kubel"/.test(late), late);
    assert.ok(!fs.existsSync(path.join(mod, 'resource/entity'))); ok('GoH: add = card copy (period pick, members checked), a doctrine card buys the same vehicle, bots line (GHMIS-66), name in .pot');
    // write with bots (own mod folder: the tank copy clones its entity): the card and the purchase list row, CRLF kept, the undo token
    // puts the list back (the Bots page's undo)
    {
      const bm = path.join(d, 'gohmod-bots'); fs.rmSync(bm, { recursive: true, force: true }); fs.mkdirSync(bm, { recursive: true }); put(bm, 'mod.info', '{name "goh bots"}\n');
      const card = (await call('search', { q: 'pz3j' })).results.find(x => x.period === 'mid').card;
      let ab = await call('add', { like: 'pz3j', card, id: 'pz3_bot', period: 'mid', bots: true, mod: bm });
      assert.ok(!ab.errors.length && ab.bots.state === 'gohadd' && ab.bots.likeListed, JSON.stringify([ab.errors, ab.bots]));
      ab = await call('add', { like: 'pz3j', card, id: 'pz3_bot', period: 'mid', bots: true, mod: bm, write: true });
      assert.ok(ab.written && ab.bots.state === 'gohadd' && ab.bots.wrote && ab.bots.undo && ab.bots.undo.length, JSON.stringify([ab.errors, ab.bots]));
      const bl = fs.readFileSync(path.join(bm, BL), 'latin1');
      assert.ok(/unit = "pz3j"\},\r\n\t\t\t\{priority = 2\.0, type = \{"Class1", "Tank", "Medium",\}, unit = "pz3_bot"\}/.test(bl), bl);
      await require('../bots/index').routes['POST /api/x/bots/undo']('/api/x/bots/undo', { mod: bm, undo: ab.bots.undo }, c);
      assert.ok(!fs.existsSync(path.join(bm, BL)), 'bots undo takes the list copy back out');
      ok('GoH: add with bots = a purchase list row after the copied card\'s row (preview dry, write CRLF, Bots page undo)');
      // buy (a squad of picked soldiers) with bots: the same purchase list path; preview dry, unticked = gohoff, nothing written
      put(G, 'resource/set/breed/mp/ger/mid/squadleader.set', '{breed\n\t{skin "ger_sl"}\n}\n');
      let by = await call('buy', { army: 'ger', period: 'mid', parts: [{ id: 'mp/ger/mid/squadleader', n: 2 }], id: 'duo', bots: true, mod: bm });
      assert.ok(!by.errors.length && by.bots.asked && by.bots.state === 'gohadd' && by.bots.file === BL && !by.bots.undo && by.files.some(f => f.file === BL), JSON.stringify([by.errors, by.bots]));
      assert.ok(!fs.existsSync(path.join(bm, BL)));
      by = await call('buy', { army: 'ger', period: 'mid', parts: [{ id: 'mp/ger/mid/squadleader', n: 2 }], id: 'duo', bots: false, mod: bm });
      assert.strictEqual(by.bots.state, 'gohoff');
      ok('GoH: buy with bots = a purchase list row through the same GoH path (preview dry), unticked says gohoff');
    }
    await refusal(call('add', { like: 'pz4h', id: 'pz4_new', period: 'winter', mod }), /period/, 'bad period');
    // one id in two period lists: search lists both with their card, stats and change reach the picked one (not the last copy)
    const s3 = await call('search', { q: 'pz3j' }), p3 = s3.results.filter(x => x.id === 'pz3j');
    assert.deepStrictEqual(p3.map(x => x.period).sort(), ['late', 'mid'], JSON.stringify(s3.results));
    const late3 = p3.find(x => x.period === 'late');
    const t3 = await call('stats', { id: 'pz3j', card: late3.card, mod });
    assert.ok(t3.period === 'late' && t3.cost === 275 && t3.card === late3.card && t3.vanilla && t3.vanilla.cost === 250, JSON.stringify([t3.period, t3.cost, t3.vanilla]));
    r = await call('change', { id: 'pz3j', card: late3.card, field: 'cost', value: '260', mod });
    assert.ok(!r.errors.length && r.rows[0].old === '275' && r.files.length === 1 && /late\/units_ger\.set$/.test(r.files[0].file), JSON.stringify([r.errors, r.rows, r.files.map(f => f.file)]));
    ok('GoH: one id in two period lists: search gives each card, stats and change take the picked card (late pz3j 275 after the army price, game card 250; not mid)');
    // a squad a macro builds: the call line in units/<period>/units_<army>.set is its card (members, unlock; no cost of its own)
    const sr = (await call('search', { q: 'single_rifle' })).results.filter(x => x.id === 'single_rifle(ger)');
    assert.deepStrictEqual(sr.map(x => x.period).sort(), ['late', 'mid'], JSON.stringify(sr));
    const srMid = sr.find(x => x.period === 'mid'), srLate = sr.find(x => x.period === 'late');
    rc = await call('recipe', { recipe: 'squad', id: 'single_rifle(ger)', card: srMid.card, breed: 'squadleader', count: 2, mod, write: true });
    assert.ok(rc.written && !rc.errors.length, JSON.stringify(rc.errors));
    assert.ok(/name\(single_rifle\)\t\tperiod\(mid\) .*c1\(squadleader:2\)/.test(rd(U + 'mid/units_ger.set')) && /mid\/units_ger\.set$/.test(rc.file), rc.file);
    assert.strictEqual(rc.rows[0].field, 'members squadleader', 'GoH recipe row label without the period of the breed');
    r = await call('change', { id: 'single_rifle(ger)', card: srLate.card, field: 'charge', value: '5', mod });
    assert.ok(!r.errors.length && r.rows[0].old === '3' && /late\/units_ger\.set$/.test(r.files[0].file), JSON.stringify([r.errors, r.rows]));
    r = await call('change', { id: 'single_rifle(ger)', card: srLate.card, field: 'cost', value: '50', mod });
    assert.ok(r.errors.some(e => e.code === 'UNITS_GOH_COST_FROM_MEMBERS' && /GHGPL-10/.test(e.msg)), JSON.stringify(r.errors));
    a = await call('add', { like: 'single_rifle(ger)', card: srLate.card, id: 'lone_rifle', mod, write: true });
    assert.ok(a.written && !a.errors.length && a.unit.id === 'lone_rifle(ger)', JSON.stringify(a.errors));
    assert.ok(/\("single_with1type" side\(ger\) name\(lone_rifle\)\t\tperiod\(late\)/.test(rd(U + 'late/units_ger.set')) && /name\(single_rifle\)\t\tperiod\(late\)/.test(rd(U + 'late/units_ger.set')));
    await refusal(call('add', { like: 'single_rifle(ger)', card: srLate.card, id: 'lone_rifle2', price: '40', mod }), /GHGPL-10/, 'macro squad price');
    ok('GoH: a squad a macro builds: bigger squad, unlock and add on its call line; no own price (GHGPL-10)');
    // compare and hints
    const cmp = await call('compare', { mod });
    const ids = cmp.rows.map(x => x.id + ':' + x.status);
    for (const x of ['pz4h:changed', 'guards(ger):new', 'kubel_more:new', 'lone_rifle(ger):new']) assert.ok(ids.includes(x), ids.join(' '));
    // each card against the game card of the same period: the untouched late single_rifle is not "changed"
    assert.deepStrictEqual(cmp.rows.filter(x => x.id === 'single_rifle(ger)').map(x => x.card), [srMid.card], ids.join(' '));
    const h = await call('hints', { id: 'pz3j', mod }); assert.ok(h.similar.some(x => x.id === 'pz4h'), JSON.stringify(h)); ok('GoH: compare with the game, price hints');
    // Balance: the GoH table (rows from the GoH catalogue) and a bulk change preview through the GoH card editor
    const bt = await BR['POST /api/x/balance/table']('/api/x/balance/table', { mod }, c);
    assert.ok(Array.isArray(bt.rows) && bt.rows.some(x => x.id === 'pz4h'), JSON.stringify(bt.rows && bt.rows.map(x => x.id)));
    await refusal(BR['POST /api/x/balance/change']('/api/x/balance/change', { mod: inside, ids: ['pz4h'], field: 'cost', op: 'set', value: 500, write: true }, c), /Gates of Hell/, 'balance write inside GoH');
    ok('GoH: Balance table from the GoH catalogue; a write inside the GoH install refused');
    // one id in two period lists: the bulk change edits each period card in its own file (lib.gohKey plan rows, apply game goh)
    const bp = await BR['POST /api/x/balance/change']('/api/x/balance/change', { mod, ids: ['pz3j'], field: 'cost', op: 'add', value: 10 }, c);
    assert.ok(!bp.errors.length && bp.rows.length === 2, JSON.stringify([bp.errors, bp.rows, bp.skipped]));
    assert.deepStrictEqual(bp.files.map(f => f.file.replace(/^.*\/units\//, '')).sort(), ['late/units_ger.set', 'mid/units_ger.set'], JSON.stringify(bp.files.map(f => f.file)));
    ok('GoH: Balance bulk change of an id in two period lists edits both period cards (late and mid)');
    // the "next" line after a write: AS64 names as64+, MoW:AS2 and GoH do not; four languages
    const LG = JSON.parse(fs.readFileSync(path.join(__dirname, 'lang.json'), 'utf8'));
    for (const l of ['en', 'ru', 'uk', 'zh']) {
      assert.ok(LG[l]['units.nextMow'] && LG[l]['units.nextGoh'] && /as64\+/.test(LG[l]['units.next']), l);
      assert.ok(!/as64/.test(LG[l]['units.nextMow'] + LG[l]['units.nextGoh']), l);
    }
    ok('MoW:AS2 and GoH: the line after a write does not name as64+ (en ru uk zh)');
    assert.ok(!fs.readFileSync(path.join(G, U + 'late/units_ger.set'), 'latin1').includes('350')); ok('GoH: install files untouched');
  }

  // ---------- GoH: a soldier's season look (look.js gohSeasons; skin def copy with {texmod "winter"}) ----------
  // Synthetic files shaped like the GoH install [V 2026-11-23]: a humanskin def {extension "x.mdl"}{RimLight} on one line, the mesh's
  // material naming "$/_hum/..", a <texture>#winter.dds and a <mesh>#winter.ply; mode files map/multi/<map>/<mode>.info with
  // {texMod winter} / {texMod camo} / a commented-out line; a breed {skin "x"}
  {
    const d = path.join(scratch, 'goh-season'), G = gohGame(d), mod = path.join(d, 'gohmod-look');
    fs.rmSync(mod, { recursive: true, force: true }); fs.mkdirSync(mod, { recursive: true }); put(mod, 'mod.info', '{name "goh look"}\n');
    const HS = 'resource/entity/humanskin/[germans]/ger_heer_44/', TX = 'resource/texture/common/_hum/';
    const skinDef = '{game_entity\n\t{extension "ger_rfl.mdl"}{RimLight}\n}\n';
    put(G, HS + 'ger_rfl.def', skinDef);
    put(G, HS + 'ger_rfl.mdl', '{skeleton\n\t{bone "body"\n\t\t{VolumeView "ger_rfl.ply"}\n\t}\n}\n');
    put(G, HS + 'ger_rfl.ply', 'EPLYBNDS\x01\x02\x0bger_rfl.mtl\x01\x02'); put(G, HS + 'ger_rfl#winter.ply', 'EPLYBNDS\x01\x02\x0bger_rfl.mtl\x01\x02');
    put(G, HS + 'ger_rfl.mtl', '{material simple\n\t{diffuse "$/_hum/ger_rfl"}\n}\n');
    put(G, TX + 'ger_rfl.dds', 'DDS '); put(G, TX + 'ger_rfl#winter.dds', 'DDS ');
    put(G, 'resource/set/breed/mp/ger/late/rifleman.set', '{breed\n\t{skin "ger_rfl"}\n}\n');
    put(G, 'resource/map/multi/1v1_snow/battle_zones.info', ';SDL\n{game\n\t{maxPlayers 2}\n\t{texMod winter}\t\t;// tex mod given to units\n}\n');
    put(G, 'resource/map/multi/1v1_snow/ammunition.info', ';SDL\n{game\n\t{maxPlayers 2}\n  {texMod Winter}\n}\n');
    put(G, 'resource/map/multi/1v1_field/battle_zones.info', ';SDL\n{game\n\t{maxPlayers 2}\n\t{texMod camo}\n}\n');
    put(G, 'resource/map/multi/1v1_farm/battle_zones.info', ';SDL\n{game\n\t{maxPlayers 2}\n;\t{texMod camo}\n}\n');
    const c = ctxOf('goh', null, G, path.join(d, 'tmp')), call = callOf(c), rd = k => fs.readFileSync(path.join(mod, k), 'latin1');
    let s = await call('look', { breed: 'ger/late/rifleman', mod });
    assert.deepStrictEqual([s.kind, s.goh, s.skin.name, s.skin.canChange, s.texmod.supported, s.texmod.canChange, s.texmod.current, s.texmod.textures, s.texmod.variants],
      ['soldier', true, 'ger_rfl', true, true, true, '', 1, [{ name: 'winter', textures: 1, meshes: 1 }]], JSON.stringify(s.texmod));
    assert.deepStrictEqual(s.texmod.season, { seasons: [{ name: 'winter', modes: 2, maps: 1, ex: ['1v1_snow'] }, { name: 'camo', modes: 1, maps: 1, ex: ['1v1_field'] }], none: 1 }, JSON.stringify(s.texmod.season));
    ok('GoH look: a soldier\'s season looks (winter: 1 texture, 1 mesh) and the seasons the map mode files give (texMod, any case, a commented line = none)');
    await refusal(call('look/set', { breed: 'ger/late/rifleman', texmod: 'camo', mod }), /no texture files for "camo".*It has: winter/, 'GoH look camo');
    let r = await call('look/set', { breed: 'ger/late/rifleman', texmod: 'winter', mod });
    assert.deepStrictEqual([r.written, r.errors, r.rows, r.look, r.newDef], [false, [], [{ field: 'skin', old: 'ger_rfl', new: 'ger_rfl_winter' }, { field: 'texmod', old: '-', new: 'winter' }], { skin: 'ger_rfl_winter', texmod: 'winter' }, 'ger_rfl_winter'], JSON.stringify([r.errors, r.rows]));
    assert.ok(!fs.existsSync(path.join(mod, 'resource')), 'a preview writes nothing');
    r = await call('look/set', { breed: 'ger/late/rifleman', texmod: 'winter', mod, write: true });
    assert.ok(r.written && !r.errors.length && Array.isArray(r.restore) && r.restore.length >= 2, JSON.stringify([r.errors, r.restore]));
    const nd = rd(HS + 'ger_rfl_winter.def');
    // the vanilla bytes with one {texmod "winter"} block after {extension}: the same block GoH vehicle defs carry; CRLF kept
    assert.strictEqual(nd.replace('{texmod "winter"} ', ''), skinDef.replace(/\n/g, '\r\n'), nd);
    assert.ok(/\{extension "ger_rfl\.mdl"\}\{texmod "winter"\} \{RimLight\}/.test(nd) && !/(^|[^\r])\n/.test(nd), nd);
    assert.ok(/\{skin "ger_rfl_winter"\}/.test(rd('resource/set/breed/mp/ger/late/rifleman.set')) && !/(^|[^\r])\n/.test(rd('resource/set/breed/mp/ger/late/rifleman.set')));
    assert.ok(!fs.existsSync(path.join(mod, HS + 'ger_rfl.def')) && fs.readFileSync(path.join(G, HS + 'ger_rfl.def'), 'latin1') === skinDef.replace(/\n/g, '\r\n'), 'the shared skin def and the install untouched');
    s = await call('look', { breed: 'ger/late/rifleman', mod });
    assert.deepStrictEqual([s.skin.name, s.texmod.current, s.texmod.known], ['ger_rfl_winter', 'winter', true]);
    const ls = await call('look/skins', { mod });
    assert.deepStrictEqual(ls.skins.filter(x => /^ger_rfl/.test(x.skin)).map(x => x.skin + ':' + x.texmod), ['ger_rfl:', 'ger_rfl_winter:winter']);
    ok('GoH look: winter on every map = a copy of the skin def with {texmod "winter"} in the mod (preview, write, restore points, CRLF), the breed pointed to it, the vanilla skin untouched [T in game]');
  }
}
module.exports = { run, gohGame };
