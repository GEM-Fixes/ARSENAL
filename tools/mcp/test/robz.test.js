// mcp robz test: every tool of tools/mcp/tools/robz.js, its handler called directly with a ctx (lib/ctx forCall).
//   1. on a made-up game + a made-up RobZ folder in a scratch folder (loose files, a macro-built unit set, presets, damage tiers):
//      find, version, changes, systems, units, a good and a bad sub-mod, issues, notes, refusals, goh = na
//   2. on the real install, read-only, when RobZ Realism is there (skipped with a printed reason when it is not)
//   node tools/mcp/test/robz.test.js            MCP_ROBZ_SHOW=1 prints every answer
// Writes go only into the scratch folder (env ARSENAL_TMP when set, else the os temp), removed at the end.
// Author: Imperator_Aug (ARSENAL, ia-dd4e84a8)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { T, scratch, tmpBase, gameDirs, rm, ROOT } = require('./rpc');
const t = T('robz');
const SHOW = process.env.MCP_ROBZ_SHOW === '1';

const { AS2 } = gameDirs();
const hasAs2 = fs.existsSync(path.join(AS2, 'resource'));
const keep = path.join(tmpBase(), 'arsenal-mcp-robz');
fs.mkdirSync(keep, { recursive: true });
const S = scratch('robztest');
Object.assign(process.env, { ARSENAL_TMP: keep, ARSENAL_NO_STEAM: '1', ARSENAL_SETTINGS: path.join(S, 'no-settings.json'), ARSENAL_GOH_DIR: path.join(S, 'no-goh') });
delete process.env.ARSENAL_WRITE_ROOTS;

const ctxLib = require('../lib/ctx');
const M = require('../tools/robz');
const tool = n => M.tools.find(x => x.name === n);
async function call(name, args) {
  const tl = tool(name);
  if (!tl) return { text: 'no tool ' + name, isError: true, missing: true };
  args = args || {};
  if (ctxLib._reset) ctxLib._reset();
  const t0 = Date.now();
  let r;
  try { r = await tl.handler(args, ctxLib.forCall(tl, args)); }
  catch (e) { if (e && e.refused) r = { text: 'refused: ' + e.message, isError: true, refused: true }; else r = { text: 'THREW ' + (e && e.stack || e), isError: true, threw: true }; }
  r = r || { text: '', isError: true };
  if (r.na) r.text = r.text || ('not available: ' + r.na);
  if (SHOW) console.log('--- ' + name + ' ' + JSON.stringify(args).slice(0, 200) + '  (' + (Date.now() - t0) + ' ms)\n' + String(r.text).slice(0, 1500));
  return r;
}
const good = (r, what) => t.ok(r && !r.isError && !r.na && typeof r.text === 'string' && r.text.length > 0, what + (r && (r.isError || r.na) ? ' | got: ' + String(r.text).slice(0, 400).replace(/\n/g, ' / ') : ''));
const refused = (r, part, what) => t.ok(r && r.isError && !r.threw && String(r.text).includes(part), what + ' | got: ' + String(r && r.text).slice(0, 300).replace(/\n/g, ' / '));
const skip = (why, n) => console.log('robz: skipped ' + n + ' case(s): ' + why);
const put = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text.replace(/\r?\n/g, '\r\n'), 'latin1'); };
const info = (name, min, max, req) => '{Mod\n\t{Name "' + name + '"}\n\t{Desc "test"}\n\t{MinGameVersion "' + min + '"}\n' + (max ? '\t{MaxGameVersion "' + max + '"}\n' : '') + (req ? '\t{Require "' + req + '"}\n' : '') + '}\n';

// a made-up game with a made-up RobZ: <S>/lib/steamapps/common/game + <S>/lib/steamapps/workshop/content/244450
function fixture() {
  const G = path.join(S, 'lib', 'steamapps', 'common', 'game'), R = path.join(G, 'mods', 'robz realism mod 9.9.1'), W = path.join(S, 'lib', 'steamapps', 'workshop', 'content', '244450');
  fs.mkdirSync(path.join(G, 'resource'), { recursive: true });
  put(path.join(R, 'mod.info'), info('Robz Realism mod 9.9.1', '3.262', '3.262'));
  const u = 'resource/set/multiplayer/units/';
  put(path.join(R, u, 'units_44.set'), '{units\n\t(include "macros.inc")\n\t(include "/set/multiplayer/units/ger/vehicles_44.set")\n}\n');
  put(path.join(R, u, 'units_41.set'), '{units\n\t(include "macros.inc")\n\t{"t3_tank" ("veh" side(rus) crew(tankman:4) charge(90) tags(41 medium) cost(410))}\n}\n');
  put(path.join(R, u, 'macros.inc'), '; veh: one vehicle with its crew\n(define "veh"\n\t{charge %charge}\n\t{tags "%tags %side"}\n\t{content "* ( mp/%side/%crew )"}\n\t{level 1}\n\t{cp 9}\n\t{cost %cost}\n\t{fore -2.0}\n\t{button "v4"}\n)\n; squad_doc: a doctrine card\n(define "squad_doc"\n\t{content "mp/%side/%c1"}\n)\n');
  put(path.join(R, u, 'ger', 'vehicles_44.set'), '{"zz_tiger" ("veh" side(ger) crew(tankman:5) charge(600) tags(44 heavy) cost(1300))}\n{"zz_puma" ("veh" side(ger) crew(tankman:4) charge(120) tags(44 light) cost(380))}\n{"t3_tank" ("veh" side(rus) crew(tankman:4) charge(90) tags(44 medium) cost(450))}\n');
  put(path.join(R, 'resource/set/multiplayer/games/combat.set'), '{game\n\t{settings\n\t\t{friendlyFire}\n\t;{enableBots}\n\t}\n\t{presets\n\t\t{"c:custom_120_44"\n\t\t\t{unitMode "44"}\n\t\t\t{apply "units_44"}\n\t\t\t{common\n\t\t\t\t{commandPoints "*=120"}\n\t\t\t\t{unitLimits "sniper=2;only-one=1"}\n\t\t\t\t{budgets {vehicle {resource {start 200} {finish 7000} {growTime 2600}}}}\n\t\t\t}\n\t\t}\n\t}\n}\n');
  put(path.join(R, 'resource/set/multiplayer/armies/ger_ss.set'), '{army {id 5}}\n');
  put(path.join(R, 'resource/set/interaction_entity/tank/safeties/penetration_safety.inc'), '{if stuff "bullet"\n\t{call "1_dam_add"}\n\telse stuff "shell_medium"\n\t{call "5_dam_add"}\n\telse stuff "shell_maximum"\n\t{call "10_dam_add"}\n}\n');
  put(path.join(R, 'resource/set/interaction_entity/tank/tank_medium.inc'), '{"medium tank"}\n');
  put(path.join(R, 'resource/properties/tank.ext'), '(define "armor_medium"\n\t{volume "body" {thickness %front}}\n)\n');
  put(path.join(R, 'resource/set/breed/mp/ger/tankman.set'), '{breed}\n');
  put(path.join(R, 'localization/desc.lng'), '{"zz_tiger" "Tiger"}\n');
  put(path.join(W, '777', 'mod.info'), info('Robz Realism mod 9.8.0', '3.262', '3.262'));
  put(path.join(W, '777', 'resource/set/x.set'), '{x}\n');
  put(path.join(G, 'mods', 'helper', 'mod.info'), info('Bots for RobZ 9.9', '3.262', '3.262'));
  put(path.join(G, 'mods', 'other', 'mod.info'), info('Some other mod', '3.262', '3.262'));
  // a good sub-mod: Require, same range, only new files
  const ok = path.join(G, 'mods', 'sub_ok');
  put(path.join(ok, 'mod.info'), info('Sub ok', '3.262', '3.262', 'robz realism mod 9.9.1'));
  put(path.join(ok, 'resource/set/stuff/gun/zz_new_gun'), '{gun}\n');
  // a bad one: modern range, no Require, an identical copy, shared files replaced whole, a macro name of RobZ in a new file
  const bad = path.join(S, 'sub_bad');
  put(path.join(bad, 'mod.info'), info('Sub bad', '3.301', ''));
  fs.mkdirSync(path.join(bad, u), { recursive: true });
  fs.copyFileSync(path.join(R, u, 'units_44.set'), path.join(bad, u, 'units_44.set'));
  put(path.join(bad, u, 'macros.inc'), '(define "veh"\n\t{cost 1}\n)\n');
  put(path.join(bad, 'localization/desc.lng'), '{"zz_tiger" "Tiger I"}\n');
  put(path.join(bad, 'resource/set/breed/mp/ger/tankman.set'), '{breed {skill 9}}\n');
  put(path.join(bad, 'resource/set/stuff/gun/own.inc'), '(define "armor_medium"\n\t{x}\n)\n');
  return { G, R, ok, bad };
}

(async () => {
  try {
    // ----- the module itself -----
    t.ok(M.group === 'robz' && M.tools.length >= 5 && M.tools.length <= 9, 'module: group robz with 5-9 tools');
    t.ok(M.tools.every(x => /^mow_robz_[a-z0-9]+$/.test(x.name) && x.title && x.description.length > 80 && x.description.length < 900 && x.kind === 'read' && x.games.length === 3 && typeof x.handler === 'function' && x.inputSchema.type === 'object' && x.inputSchema.properties.game), 'module: every tool is mow_robz_*, read-only, with title, description, games, schema, handler');
    t.ok(new Set(M.tools.map(x => x.name)).size === M.tools.length, 'module: no name twice');
    t.ok(M.tools.every(x => /goh|Gates of Hell/i.test(x.description)), 'module: every description says what Gates of Hell gets');
    for (const n of ['mow_robz_find', 'mow_robz_changes', 'mow_robz_system', 'mow_robz_unit', 'mow_robz_submod', 'mow_robz_issues', 'mow_robz_notes']) t.ok(!!tool(n), 'module: has ' + n);
    { const src = ['robz.js', 'robz/lib.js', 'robz/data.js'].map(f => fs.readFileSync(path.join(ROOT, 'tools', 'mcp', 'tools', f), 'utf8')).join('\n');
      t.ok(!/[A-Z]:[\\/](?!\/)[A-Za-z]|\\Users\\|\bdear(er)?\b/i.test(src.replace(/https?:\/\/\S+/g, '')), 'module: no path of one machine and no banned word in the source'); }

    // ----- goh: every tool says it is not available -----
    for (const x of M.tools) { const r = await call(x.name, { game: 'goh', submod: S, q: 'x' }); t.ok(r.na && /Assault Squad 2/.test(String(r.na)) && !r.isError, x.name + ' goh: na in plain words'); }
    t.ok(/goh-candidate/.test((await call('mow_robz_notes', { game: 'goh' })).text), 'notes goh: points at the GoH look-alike note');

    // ----- no install -----
    process.env.ARSENAL_AS2_DIR = path.join(S, 'no-as2');
    refused(await call('mow_robz_find', {}), 'ARSENAL_AS2_DIR', 'find: no install is said with the variable to set');
    refused(await call('mow_robz_unit', { q: 'tiger' }), 'ARSENAL_AS2_DIR', 'unit: no install is refused in plain words');
    { const r = await call('mow_robz_changes', {}); good(r, 'changes without an install'); t.ok(/digest only/.test(r.text) && r.data.live === null && r.data.areas.length >= 6, 'changes without an install: the digest, said so'); }
    { const r = await call('mow_robz_issues', { version: '1.30' }); good(r, 'issues without an install'); t.ok(r.data.total >= 8 && /RZ-BOTNAMES/.test(r.text) && /RZ-MODE/.test(r.text), 'issues 1.30 as64: the bot names and the mode rows'); }
    { const r = await call('mow_robz_issues', { version: '1.31', game: 'mowas2' }); t.ok(!/RZ-BOTNAMES|RZ-MODE/.test(r.text) && /RZ-131TREE/.test(r.text), 'issues 1.31 mowas2: no 1.30-only row, no AS64-only row'); }
    { const r = await call('mow_robz_issues', { version: '1.30', area: 'crash' }); t.ok(r.data.total === 1 && /fiat35_inf/.test(r.text), 'issues: area narrows'); }

    // ----- the made-up game and RobZ -----
    const F = fixture();
    process.env.ARSENAL_AS2_DIR = F.G;
    const fd = await call('mow_robz_find', { game: 'mowas2' });
    good(fd, 'find'); t.ok(fd.data.installs.length === 2 && fd.data.chosen.version === '9.9.1' && fd.data.chosen.where === 'mods' && fd.data.chosen.layout === 'loose files', 'find: the mods folder and the Workshop copy, newest chosen');
    t.ok(fd.data.installs.some(x => x.where === 'workshop' && x.version === '9.8.0') && fd.data.companions.map(x => x.folder).sort().join() === 'helper,sub_ok', 'find: Workshop item listed, the mods that name or require RobZ listed, another mod left out');
    t.ok(/native on MoW:AS2/.test(fd.text) && /Classic mode only/.test((await call('mow_robz_find', {})).text), 'find: what the range means per game');
    t.ok((await call('mow_robz_find', { version: '9.8' })).data.chosen.where === 'workshop', 'find: version picks the other install');
    { const r = await call('mow_robz_find', { version: '7' }); t.ok(!r.isError && r.data.chosen === null && r.data.installs.length === 2, 'find: a version that is not there chooses none and still lists the installs'); }
    refused(await call('mow_robz_unit', { version: '7' }), 'no RobZ Realism install of version 7', 'unit: a version that is not there is refused with the ones found');
    refused(await call('mow_robz_find', { mod: path.join(F.G, 'mods', 'nothere') }), 'not found', 'find: a missing mod folder is refused');
    refused(await call('mow_robz_find', { mod: 'relative\\robz' }), 'full path', 'find: a relative path is refused');

    const ch = await call('mow_robz_changes', {});
    good(ch, 'changes'); t.ok(ch.data.live && ch.data.live.cards === 4 && ch.data.live.presets === 1 && ch.data.live.tiers === 3 && ch.data.live.armiesAdded[0] === 'ger_ss' && ch.data.live.breeds === 1, 'changes: live counts from the folder');
    { const r = await call('mow_robz_changes', { area: 'damage' }); t.ok(r.data.areas.length === 1 && r.data.areas[0].rows.every(x => r.text.includes(x)) && /\[V/.test(r.text), 'changes: one area in full, tags kept'); }
    refused(await call('mow_robz_changes', { area: 'nope' }), 'unknown area', 'changes: an unknown area is refused');

    const un = await call('mow_robz_unit', { q: 'zz_tiger' });
    good(un, 'unit'); t.ok(un.data.total === 1 && un.data.cards[0].cost === 1300 && un.data.cards[0].charge === 600 && un.data.cards[0].side === 'ger' && un.data.cards[0].cp === 9 && un.data.cards[0].sets[0] === 'units_44', 'unit: price, cooldown, CP, side and year set from a macro-built card');
    t.ok(/mp\/ger\/tankman:5/.test(un.text), 'unit: one hit shows what the card brings');
    { const r = await call('mow_robz_unit', { q: 't3_tank' }); t.ok(r.data.total === 2 && r.data.cards.map(c => c.cost).sort().join() === '410,450', 'unit: a card priced differently per year set is listed per price'); }
    { const r = await call('mow_robz_unit', { side: 'ger', sort: 'cost', max_cost: 1000 }); t.ok(r.data.total === 1 && r.data.cards[0].id === 'zz_puma', 'unit: side and max_cost filter'); }
    { const r = await call('mow_robz_unit', { year: '41' }); t.ok(r.data.total === 1 && r.data.cards[0].cost === 410, 'unit: year filter'); }
    { const r = await call('mow_robz_unit', { q: 'zz_tigre' }); t.ok(r.data.total === 0 && /Did you mean: zz_tiger/.test(r.text), 'unit: no hit offers a near name'); }

    { const r = await call('mow_robz_system', { kind: 'macro', q: 'veh' }); good(r, 'system macro'); t.ok(r.data.hits === 1 && r.data.rows[0].name === 'veh' && r.data.rows[0].params.includes('cost') && r.data.rows[0].line === 2 && /one vehicle with its crew/.test(r.text), 'system macro: name, parameters, file:line, comment'); }
    { const r = await call('mow_robz_system', {}); t.ok(r.data.total === 3 && r.data.rows.length === 0 && /Pass q/.test(r.text), 'system macro: no q answers counts only'); }
    { const r = await call('mow_robz_system', { kind: 'preset' }); good(r, 'system preset'); const p = r.data.rows[0]; t.ok(p && p.mode === 'combat' && p.start === 200 && p.finish === 7000 && p.cp === '*=120' && p.apply === 'units_44' && p.bots === false && /no bots/.test(r.text), 'system preset: income, CP, unit set, bots off'); }
    { const r = await call('mow_robz_system', { kind: 'tier' }); t.ok(r.data.rows.length === 3 && r.data.rows[1].tier === 'shell_medium' && r.data.rows[1].points === 5 && r.data.classes[0] === 'tank_medium', 'system tier: tier points and class scripts'); }
    { const r = await call('mow_robz_system', { kind: 'army' }); t.ok(r.data.sides.length === 2 && r.data.sides.find(x => x.side === 'ger').cards === 2 && r.data.armiesAdded[0] === 'ger_ss', 'system army: sides and the armies added'); }
    { const r = await call('mow_robz_system', { kind: 'doctrine' }); t.ok(r.data.defines.join() === 'squad_doc' && r.data.calls === 0 && /no doctrine choice/.test(r.text), 'system doctrine: defined, not called, said so'); }
    refused(await call('mow_robz_system', { kind: 'nope' }), 'kind must be', 'system: an unknown kind is refused');

    // ----- sub-mods -----
    const so = await call('mow_robz_submod', { submod: F.ok });
    good(so, 'submod ok'); t.ok(so.data.findings.length === 0 && so.data.fresh === 1 && /No finding/.test(so.text), 'submod ok: Require, same range, new files only = no finding');
    const sb = await call('mow_robz_submod', { submod: F.bad });
    good(sb, 'submod bad'); const codes = sb.data.findings.map(f => f.code);
    for (const c of ['MODE_MISMATCH', 'REQUIRE_MISSING', 'NOT_INSTALLED', 'SAME_AS_ROBZ', 'WHOLE_FILE_COPY', 'FILE_REPLACED', 'DEFINE_TWICE']) t.ok(codes.includes(c), 'submod bad: ' + c + ' | got: ' + codes.join(' '));
    t.ok(sb.data.same.rows.join() === 'resource/set/multiplayer/units/units_44.set' && sb.data.shared.includes('localization/desc.lng') && sb.data.shared.includes('resource/set/multiplayer/units/macros.inc') && !sb.data.shared.includes('resource/set/breed/mp/ger/tankman.set'), 'submod bad: identical copy, shared files and a plain replaced file told apart');
    t.ok(sb.data.defines.some(d => d.name === 'armor_medium' && /properties\/tank\.ext/.test(d.robz)) && sb.data.findings[0].sev === 'high', 'submod bad: the macro RobZ also defines, serious findings first');
    refused(await call('mow_robz_submod', { submod: F.R }), 'RobZ folder itself', 'submod: the RobZ folder itself is refused');
    refused(await call('mow_robz_submod', { submod: 'sub' }), 'full path', 'submod: a relative path is refused');
    refused(await call('mow_robz_submod', {}), 'submod', 'submod: no folder is refused');
    t.ok(fs.readFileSync(path.join(F.bad, 'mod.info'), 'latin1').includes('3.301') && !fs.existsSync(path.join(F.R, '.arsenal-undo')), 'submod: nothing was written');
    { const r = await call('mow_robz_issues', {}); t.ok(r.data.version === '9.9.1' && /from the install/.test(r.text), 'issues: version read from the install'); }

    // ----- notes of the repo -----
    const hasNotes = fs.existsSync(path.join(ROOT, 'refmods', 'robz', 'systems.md'));
    if (hasNotes) {
      const n0 = await call('mow_robz_notes', {}); good(n0, 'notes list'); t.ok(Object.keys(n0.data.files).some(f => /systems\.md$/.test(f)), 'notes: lists the files and headings');
      const n1 = await call('mow_robz_notes', { topic: 'damage counter', limit: 2 }); t.ok(n1.data.sections.length === 2 && /refmods\/robz\//.test(n1.text) && n1.text.length < 8000, 'notes: topic answers the best sections, cut');
      const n2 = await call('mow_robz_notes', { topic: 'zzqqxx' }); t.ok(n2.data.total === 0 && /Nothing matches/.test(n2.text), 'notes: no match is said');
      const n3 = await call('mow_robz_notes', { file: 'potential', topic: 'bot' }); t.ok(n3.data.sections.every(x => /potential/.test(x.file)) && n3.data.total >= 1, 'notes: file narrows');
    } else skip('refmods/robz is not in this checkout', 4);

    // ----- the real install, read-only -----
    process.env.ARSENAL_AS2_DIR = AS2;
    let real = null;
    if (hasAs2) { const r = await call('mow_robz_find', { game: 'mowas2' }); if (!r.isError && r.data.chosen) real = r.data; }
    if (real) {
      t.ok(real.installs.every(x => /^\d+\.\d+/.test(x.version || '')) && real.chosen.mode === 'classic', 'real find: version from mod.info, a legacy mod');
      const c2 = await call('mow_robz_changes', { area: 'armies' }); good(c2, 'real changes'); t.ok(c2.data.live.cards > 500 && c2.data.live.sides.includes('ger_ss') && c2.data.live.presets > 10 && c2.data.live.tiers >= 15, 'real changes: cards, sides, presets, tiers read');
      const u2 = await call('mow_robz_unit', { q: 'pz6e', side: 'ger' }); good(u2, 'real unit'); t.ok(u2.data.total >= 1 && u2.data.cards.every(c => c.cost > 500 && c.kind === 'vehicle'), 'real unit: the Tiger card has a price');
      const p2 = await call('mow_robz_system', { kind: 'preset', q: 'combat', limit: 3 }); t.ok(p2.data.hits >= 1 && p2.data.rows[0].start != null && /CP/.test(p2.text), 'real preset: income and CP');
      const t2 = await call('mow_robz_system', { kind: 'tier', q: 'shell_medium' }); t.ok(t2.data.rows.some(x => x.tier === 'shell_medium' && x.points === 5), 'real tier: shell_medium 5 points');
      const m2 = await call('mow_robz_system', { kind: 'macro', q: 'armor', limit: 5 }); t.ok(m2.data.total > 300 && m2.data.hits >= 1, 'real macro: defines indexed');
      // a scratch sub-mod made from one real RobZ file: identical, then changed
      const L = require('../tools/robz/lib'), key = 'resource/set/multiplayer/games/combat.set', buf = L.source(real.chosen.dir).get(key);
      if (buf) {
        const sm = path.join(S, 'sub_real'); put(path.join(sm, 'mod.info'), info('Sub real', real.chosen.min, real.chosen.max, real.chosen.folder));
        fs.mkdirSync(path.dirname(path.join(sm, key)), { recursive: true }); fs.writeFileSync(path.join(sm, key), buf);
        const a = await call('mow_robz_submod', { submod: sm, mod: real.chosen.dir }); t.ok(a.data.same.total === 1 && a.data.findings.some(f => f.code === 'SAME_AS_ROBZ') && !a.data.findings.some(f => f.code === 'REQUIRE_MISSING'), 'real submod: an untouched copy of a RobZ file is found');
        fs.writeFileSync(path.join(sm, key), Buffer.concat([buf, Buffer.from('\r\n; changed\r\n')]));
        const b = await call('mow_robz_submod', { submod: sm, mod: real.chosen.dir }); t.ok(b.data.shared.includes(key) && b.data.findings.some(f => f.code === 'WHOLE_FILE_COPY'), 'real submod: a changed copy of a shared file is flagged');
      } else skip('combat.set is not in this RobZ', 2);
    } else skip(hasAs2 ? 'RobZ Realism is not installed in <game>/mods or the Workshop folder' : 'no Assault Squad 2 install at ' + AS2, 9);
  } catch (e) { t.ok(false, 'test threw: ' + (e && e.stack || e)); }
  rm(S);
  t.done();
})();
