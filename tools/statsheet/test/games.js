// game parity tests for statsheet (--exe): the shared AS2 install read as AS64 and as MoW:AS2, and a made-up Gates of Hell install
// (units-json known answers, names, no bot rows, the price and research sheets, research refused outside GoH). Usage: node games.js <work dir>
// Author: Imperator_Aug (ARSENAL, ia-c5a7e0d2)
const fs = require('fs'), path = require('path'), cp = require('child_process'), FX = require('./gamefx');
const W = path.resolve(process.argv[2] || 'work-games'); fs.mkdirSync(W, { recursive: true });
const S = path.join(__dirname, '..', 'statsheet.js');
let bad = 0;
const ok = (c, m) => { if (c) console.log('OK ' + m); else { bad++; console.log('FAIL ' + m); } };
const run = a => cp.spawnSync(process.execPath, [S, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });

// shared install: AS64 sees the as64/core layer, MoW:AS2 does not
const sh = FX.shared(path.join(W, 'sh'));
const price = (exe) => { const r = run([sh.game, '--folder', sh.mod, '--cache', path.join(W, 'c.json'), '--sheet', 'price', '--filter', 't34_3'].concat(exe ? ['--exe', exe] : [])); return r.stdout; };
ok(/\b999\b/.test(price()), 'as64 default: t34_3 cost 999 from as64/core');
ok(/\b999\b/.test(price('as64')), '--exe as64: same as default');
const p2 = price('mowas_2');
ok(/\b450\b/.test(p2) && !/\b999\b/.test(p2), '--exe mowas_2: t34_3 cost 450 (no as64/core)');
ok(fs.existsSync(path.join(W, 'c.mowas_2.json')), 'mowas_2 has its own cache file');
const w2 = run([sh.game, '--folder', sh.mod, '--cache', path.join(W, 'c.json'), '--sheet', 'weapons', '--filter', '76mm_f34', '--exe', 'mowas_2']).stdout;
const w1 = run([sh.game, '--folder', sh.mod, '--cache', path.join(W, 'c.json'), '--sheet', 'weapons', '--filter', '76mm_f34']).stdout;
ok(/76mm_f34/.test(w1) && /\| 77 /.test(w1), 'as64: gun 76mm_f34 with the core damage 77');
ok(/^## weapons \(0\)/m.test(w2), '--exe mowas_2: no 76mm_f34 gun file (it exists only in as64/core here)');
const rr = run([sh.game, '--folder', sh.mod, '--cache', path.join(W, 'c.json'), '--sheet', 'research', '--exe', 'mowas_2']);
ok(rr.status === 2 && /not available for .*GHCQ-16/.test(rr.stdout + rr.stderr), 'research sheet refused outside GoH (exit 2, GHCQ-16)');
const rc = path.join(W, 'cr.json'); fs.rmSync(rc, { force: true });
const r0 = run([sh.game, '--folder', sh.mod, '--cache', rc, '--sheet', 'price,research']);
ok(r0.status === 2 && /not available for AS64|not available for .*GHCQ-16/.test(r0.stderr) && !fs.existsSync(rc), 'research refused at the start (no --exe: game from the exe files; no cache built)');

// Gates of Hell
const g = FX.goh(path.join(W, 'g')), gc = path.join(W, 'g.json');
const j = run([g.game, '--folder', g.mod, '--cache', gc, '--units-json', '--exe', 'goh']);
let J = null; try { J = JSON.parse(j.stdout); } catch (e) { console.log(j.stdout.slice(0, 400), j.stderr.slice(0, 400)); }
ok(J && J.exe === 'goh', 'goh units-json parses, exe goh');
const by = id => J && J.units.find(u => u.id.toLowerCase() === id);
const pz = by('pz4'), sq = by('squad_rifle_early(ger)'), dc = by('doctrine_pz4_early');
ok(pz && pz.cost === 325, 'pz4 price 325 (300 + 15 + 7, rounded up to 5)');
ok(sq && sq.cost === 47, 'squad_rifle_early(ger) price 47');
ok(dc && dc.cost === 20, 'doctrine_pz4_early price 20 (squad_cost_factor 0)');
ok(pz && pz.name === 'Pz.Kpfw. IV Ausf. D', 'pz4 name from the .lng beats the .pot');
ok(sq && sq.name === 'Rifle squad', 'squad name from the .pot');
ok(pz && pz.level == null && pz.fore == null, 'no level / fore on GoH');
ok(pz && pz.delay === 60 && pz.charge === 120, 'pz4 charge delay 60, interval 120');
ok(J && J.units.filter(u => u.buyable).length === 3, 'three buyable cards (soldier cards have no button)');
ok(J && (J.warnings || []).some(w => /GHMIS-66/.test(w)), 'warning: no bot rows (GHMIS-66)');
// bot purchase lists (no bot.data.lua in GoH): script/multiplayer/units/<army>/<list>.<army>.lua of the mod; a period list counts for
// the card of that period only, conquest for every period copy
{
  const per = (pz && pz.period) || 'early', other = per === 'late' ? 'early' : 'late';
  const lst = (l, rows) => 'Purchases["' + l + '.ger"] = {\r\n  {Repeat = 1, Units = {\r\n' + rows.map(r => '    {priority = ' + r[1] + ', type = {"Class2", "Tank"}, unit = "' + r[0] + '"},\r\n').join('') + '  }},\r\n}\r\n';
  FX.put(g.mod, 'resource/script/multiplayer/units/ger/' + per + '.ger.lua', lst(per, [['pz4', 2]]), 'latin1');
  FX.put(g.mod, 'resource/script/multiplayer/units/ger/' + other + '.ger.lua', lst(other, [['squad_rifle_early(ger)', 1], ['pz4', 5]]), 'latin1');
  FX.put(g.mod, 'resource/script/multiplayer/units/ger/conquest.ger.lua', lst('conquest', [['squad_rifle_early(ger)', 1]]), 'latin1');
  const jb = run([g.game, '--folder', g.mod, '--cache', path.join(W, 'gb.json'), '--units-json', '--exe', 'goh']);
  let JB = null; try { JB = JSON.parse(jb.stdout); } catch (e) { console.log(jb.stdout.slice(0, 400), jb.stderr.slice(0, 400)); }
  const bb = id => JB && JB.units.find(u => u.id.toLowerCase() === id);
  const p = bb('pz4'), q = bb('squad_rifle_early(ger)'), sp = q && q.period;
  ok(JB && JB.bots === 4 && !(JB.warnings || []).some(w => /no bot rows/.test(w)), 'goh purchase lists read: 4 rows, no warning');
  ok(p && p.bots.length === 1 && p.bots[0].list === per && p.bots[0].army === 'ger' && p.bots[0].priority === 2 && p.bots[0].purchase === 1, 'pz4: the ' + per + ' list only (the ' + other + ' list is for the ' + other + ' card) ' + JSON.stringify(p && p.bots));
  const want = ['conquest'].concat(sp === other || !sp ? [other] : []).sort().join();
  ok(q && q.bots.map(b => b.list).sort().join() === want, 'squad: conquest for every period, a period list for its own period: ' + JSON.stringify(q && q.bots));
  fs.rmSync(path.join(g.mod, 'resource', 'script'), { recursive: true, force: true });
}
// mod text: only the default language is read (GHLOC-01), and a mod .lng below localizations/default/interface/text/ keeps its key
FX.put(g.mod, 'localizations/default/interface/text/desc/mod_ger.pot', 'msgctxt "desc/squad/squad_rifle_early(ger)"\nmsgid "Mod rifle squad"\nmsgstr ""\n', 'utf8');
FX.put(g.mod, 'localizations/default/interface/text/desc/#modnames.lng', '{tags\n\t{"entity"\n\t\t{"pz4" "Mod Panzer"}\n\t}\n}\n', 'utf8');
FX.put(g.mod, 'localizations/russian/interface/text/desc/ru_ger.pot', 'msgctxt "desc/squad/squad_rifle_early(ger)"\nmsgid "Russian squad"\nmsgstr ""\n', 'utf8');
FX.put(g.mod, 'localizations/russian/interface/text/desc/#ru.lng', '{tags\n\t{"entity"\n\t\t{"pz4" "Russian Panzer"}\n\t}\n}\n', 'utf8');
const jm = run([g.game, '--folder', g.mod, '--cache', path.join(W, 'gm.json'), '--units-json', '--exe', 'goh']);
let JM = null; try { JM = JSON.parse(jm.stdout); } catch (e) { console.log(jm.stdout.slice(0, 400), jm.stderr.slice(0, 400)); }
const bm = id => JM && JM.units.find(u => u.id.toLowerCase() === id);
ok(bm('pz4') && bm('pz4').name === 'Mod Panzer', 'mod .lng under localizations/default/interface/text names pz4 (russian .lng left out)');
ok(bm('squad_rifle_early(ger)') && bm('squad_rifle_early(ger)').name === 'Mod rifle squad', 'mod default .pot beats the install .pot; russian .pot left out');
fs.rmSync(path.join(g.mod, 'localizations'), { recursive: true, force: true });
const ps = run([g.game, '--folder', g.mod, '--cache', gc, '--sheet', 'price', '--exe', 'goh']).stdout;
ok(/\| pz4 .*\| 325 \| 300 \|/.test(ps), 'goh price sheet: buy price 325, own cost 300');
const rs = run([g.game, '--folder', g.mod, '--cache', gc, '--sheet', 'research', '--exe', 'goh']).stdout;
ok(/defense_level_1/.test(rs) && /squad_rifle_early\(ger\)/.test(rs) && !/commented_out/.test(rs), 'goh research sheet: 2 rows, commented row left out');
// --roster-insert under GoH: a roster inside the GoH install (its mods/ too) is refused with no --game given; a GoH mod folder outside works
const rl = ';SDL\r\n{"pz4"\r\n\t("vehicle2" side(ger) cost(300))\r\n}\r\n{"pz3" {cost 200}}\r\n';
FX.put(g.game, 'mods/x/resource/set/multiplayer/units/early/units_ger.set', rl);
FX.put(g.mod, 'resource/set/multiplayer/units/early/units_ger.set', rl);
const ri = path.join(g.game, 'mods/x/resource/set/multiplayer/units/early/units_ger.set'), ro = path.join(g.mod, 'resource/set/multiplayer/units/early/units_ger.set');
const r1 = run(['--roster-insert', ri, 'pz5']), r2 = run(['--roster-insert', ro, 'pz5']);
ok(/ROSTER_VANILLA .*Gates of Hell install/.test(r1.stdout) && r1.status === 1 && fs.readFileSync(ri, 'latin1') === rl, 'goh --roster-insert inside the install mods/: ROSTER_VANILLA, file unchanged');
ok(/ROSTER_INSERT/.test(r2.stdout) && /\{"pz5" \{cost 200\}\}\r\n/.test(fs.readFileSync(ro, 'latin1')), 'goh --roster-insert in a mod folder outside the install: card line added, CRLF kept');
// no --cache: the default name goes through entityindex cachePath per exe (one cache per game, the plain name for as64), in the shared
// cache folder (ARSENAL_CACHE here); the Units page relies on this default
const AC = path.join(W, 'ac'), runE = a => cp.spawnSync(process.execPath, [S, ...a], { encoding: 'utf8', maxBuffer: 1 << 28, env: Object.assign({}, process.env, { ARSENAL_CACHE: AC }) });
const dcache = exe => runE([sh.game, '--folder', sh.mod, '--sheet', 'price', '--filter', 't34_3'].concat(exe ? ['--exe', exe] : [])).stdout;
const d0 = dcache(), d2 = dcache('mowas_2');
const cf = (() => { try { return fs.readdirSync(path.join(AC, 'entityindex')); } catch (e) { return []; } })();
ok(/\b999\b/.test(d0) && /\b450\b/.test(d2) && !/\b999\b/.test(d2), 'no --cache: as64 and mowas_2 keep their own answers');
ok(cf.some(f => /^folder-[0-9a-f]{8}\.f[0-9a-f]{8}\.json$/.test(f)) && cf.some(f => /^folder-[0-9a-f]{8}\.mowas_2\.f[0-9a-f]{8}\.json$/.test(f)), 'no --cache: default cache per exe (folder-<hash>[.mowas_2].f<hex>.json) ' + cf.join(' '));
console.log(bad ? 'FAIL ' + bad : 'PASS');
process.exit(bad ? 1 : 0);
