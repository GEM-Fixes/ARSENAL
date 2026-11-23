// check: runs gen against the fake games from mkfixture.js, asserts outputs. prints "OK name" / "FAIL name: why"; exit 1 on any FAIL.
// Author: Imperator_Aug (ARSENAL, ia-d8d9bb93)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = path.resolve(process.argv[2] || path.join(__dirname, 'work'));
const GEN = path.join(__dirname, '..', 'gen.js');
const A = path.join(W, 'as2'), H = path.join(W, 'goh');
let bad = 0;
const ok = (name, c, why) => { console.log(c ? 'OK ' + name : 'FAIL ' + name + ': ' + (why || '')); if (!c) bad++; };
let n = 0;
function run(spec, target, extra) {
  const sf = path.join(W, 'spec' + (++n) + '.json'); if (target === 'goh' && spec.ops[0].op !== 'mod') spec.ops.unshift({ op: 'mod', game_version: '1.067' });
  fs.writeFileSync(sf, JSON.stringify(spec));
  const out = path.join(W, 'out' + n);
  const a = [GEN, sf, '--target', target, '--no-gate', '--no-stat', '--out', out, ...(target === 'goh' ? ['--goh', H] : ['--game', A]), ...(extra || [])];
  const t0 = Date.now(), r = cp.spawnSync(process.execPath, a, { encoding: 'utf8', maxBuffer: 1 << 26 });
  // GEN-SPEC: a spec gen ran with 0 findings must also pass --check-spec (the test specs that are meant to be refused are exempt: they exit 1)
  if (r.status === 0) { const c = cp.spawnSync(process.execPath, [GEN, '--check-spec', sf, '--target', target], { encoding: 'utf8' }); ok('check-spec agrees with a clean run: ' + path.basename(sf), c.status === 0, (c.stdout + c.stderr).slice(0, 300)); }
  return { out, text: (r.stdout || '') + (r.stderr || ''), status: r.status, ms: Date.now() - t0, f: k => { try { return fs.readFileSync(path.join(out, k)); } catch (e) { return null; } } };
}
const has = (r, s) => r.text.includes(s);
const eolOk = b => b && !/[^\r]\n/.test(b.toString('latin1')) && !/\n\n\n/.test(b.toString('latin1').replace(/\r/g, '')) ;

// DET-FIX: the same command twice gives the same stdout bytes, with and without --json, and no clock without --time
{
  const sf = path.join(W, 'det.json'); fs.writeFileSync(sf, JSON.stringify({ name: 'det', ops: [{ op: 'mod' }] }));
  const go = extra => cp.spawnSync(process.execPath, [GEN, sf, '--target', 'mowas2', '--no-gate', '--plan', '--out', path.join(W, 'detout'), '--game', A, ...extra], { encoding: 'utf8', maxBuffer: 1 << 26 });
  for (const extra of [[], ['--json']]) { const a = go(extra), b = go(extra);
    ok('same bytes twice ' + (extra[0] || 'text'), a.stdout.length > 0 && a.stdout === b.stdout && !/ ms|\"ms\"/.test(a.stdout), a.stdout.slice(0, 300)); }
  ok('--time prints the clock', /time: [0-9]+ ms/.test(go(['--time']).stdout));
}
// 1. 50-row CSV, one file edited once
{
  const csv = path.join(W, 'rows.csv'); const L = ['entity,path,value'];
  for (let i = 1; i <= 50; i++) L.push(`rifle_a,actor/k${i},${i + 100}`);
  fs.writeFileSync(csv, L.join('\n'));
  const r = run({ name: 'csv50', ops: [{ op: 'set', csv }] }, 'mowas2');
  const b = r.f('resource/entity/-weapon/rifle_a/rifle_a.def'), t = b ? b.toString('latin1') : '';
  ok('csv50 exit 0', r.status === 0, r.text.slice(0, 300));
  ok('csv50 all 50 rows applied', /\{k1 101\}/.test(t) && /\{k50 150\}/.test(t) && !/\{k25 25\}/.test(t), t.slice(0, 200));
  ok('csv50 CRLF kept', eolOk(b));
  ok('csv50 fast', r.ms < 20000, r.ms + ' ms');
  ok('csv50 testnotes', fs.existsSync(r.out + '.gen/TESTNOTES.md') && /untested/.test(fs.readFileSync(r.out + '.gen/TESTNOTES.md', 'utf8')));
  ok('csv50 reports outside mod', !fs.existsSync(path.join(r.out, 'TESTNOTES.md')));
}
// 2. ENCFIX: non-ASCII set value is UTF-8 on both targets (as64 reads strings as UTF-8,; seeded defect = cp1251 0xC1
{
  const r = run({ name: 'enc', ops: [{ op: 'set', rows: [{ entity: 'rifle_a', path: 'actor/k1', value: 'Б' }] }] }, 'mowas2');
  const b = r.f('resource/entity/-weapon/rifle_a/rifle_a.def');
  ok('enc AS2 value is UTF-8 (D0 91), not cp1251 (0xC1)', b && !b.includes(Buffer.from([0xc1])) && b.includes(Buffer.from([0xd0, 0x91])), r.text.slice(0, 200));
  const g = run({ name: 'encg', ops: [{ op: 'set', rows: [{ entity: 'rifle_a', path: 'actor/k1', value: 'Б' }] }] }, 'goh');
  const gb = g.f('resource/entity/-weapon/rifle_a/rifle_a.def');
  ok('enc GoH non-ASCII set written UTF-8', !has(g, 'GEN_SET_NONASCII_GOH') && g.status === 0 && gb && gb.includes(Buffer.from([0xd0, 0x91])), g.text.slice(0, 300));
}
// 3. bad entity / path / ambiguous / binary refused and named; nothing written for the bad row's file
{
  let r = run({ name: 'bad1', ops: [{ op: 'set', rows: [{ entity: 'nosuch_ent', path: 'actor/k1', value: '1' }] }] }, 'mowas2');
  ok('bad entity named', has(r, 'GEN_SET_ENTITY_UNKNOWN') && has(r, 'nosuch_ent') && r.status !== 0, r.text.slice(0, 300));
  r = run({ name: 'bad2', ops: [{ op: 'set', rows: [{ entity: 'rifle_a', path: 'actor/zzz_missing', value: '1' }] }] }, 'mowas2');
  ok('bad path named', has(r, 'GEN_SET_PATH_MISSING') && has(r, 'zzz_missing') && r.status !== 0, r.text.slice(0, 300));
  ok('bad path leaves def unwritten', !r.f('resource/entity/-weapon/rifle_a/rifle_a.def'));
  // row 100: a refused row holds back the valid rows of the same op (valid row first, bad row second)
  r = run({ name: 'bad2b', ops: [{ op: 'set', rows: [{ entity: 'rifle_a', path: 'actor/k1', value: '7' }, { entity: 'rifle_a', path: 'actor/zzz_missing', value: '1' }] }] }, 'mowas2');
  ok('refused row holds back valid rows', has(r, 'GEN_SET_NOT_WRITTEN') && !r.f('resource/entity/-weapon/rifle_a/rifle_a.def'), r.text.slice(0, 300));
  // row 96: source column and multi-volume rows do not make noise; a changed volume row does
  const sd = require('../gen').sheetDiff('# armor\nentity,source,area\na,vanilla,x,1\na,vanilla,y,2\n', '# armor\nentity,source,area\na,mod,x,1\na,mod,y,3\n');
  ok('sheetDiff ignores source col, lists only the changed volume row', sd.length === 1 && sd[0].mod === 'a,mod,y,3' && sd[0].base === 'a,vanilla,y,2', JSON.stringify(sd));
  r = run({ name: 'bad3', ops: [{ op: 'set', rows: [{ entity: 'dup_a', path: 'actor/x', value: '1' }] }] }, 'mowas2');
  ok('ambiguous entity named', has(r, 'GEN_SET_ENTITY_AMBIGUOUS') && has(r, 'dup_a'), r.text.slice(0, 300));
  r = run({ name: 'bad4', ops: [{ op: 'set', rows: [{ entity: 'file:resource/entity/-weapon/bin_a/bin_a.mdl', path: 'actor/x', value: '1' }] }] }, 'mowas2');
  ok('binary def refused', has(r, 'GEN_SET_BINARY'), r.text.slice(0, 300));
  r = run({ name: 'bad5', ops: [{ op: 'set', rows: [{ entity: 'rifle_a', path: 'actor/k1', value: '1', op: 'frob' }] }] }, 'mowas2');
  ok('bad op refused', has(r, 'GEN_SET_BAD_OP'), r.text.slice(0, 300));
  r = run({ name: 'bad6', ops: [{ op: 'set', csv: path.join(W, 'nofile.csv') }] }, 'mowas2');
  ok('missing csv refused', has(r, 'GEN_SET_CSV_MISSING'), r.text.slice(0, 300));
  r = run({ name: 'bad7', ops: [{ op: 'frobnicate' }] }, 'mowas2');
  ok('unknown op refused', r.status !== 0 && /GEN_BAD_SPEC|GEN_BAD_OP/.test(r.text), r.text.slice(0, 300));
}
// 4. armor macro arg edit
{
  const r = run({ name: 'arm', ops: [{ op: 'armor', entity: 'tank_arm', value: '50 _ 70 80' }] }, 'mowas2');
  const t = (r.f('resource/entity/-vehicle/tank_arm/tank_arm.def') || '').toString('latin1');
  ok('armor arg edited in place', /"armor_light" args 50 20 70 80/.test(t), r.text.slice(0, 300) + '|' + t);
  const r2 = run({ name: 'arm2', ops: [{ op: 'armor', entity: 'tank_arm', value: '1 2' }] }, 'mowas2');
  ok('armor wrong arg count refused', has(r2, 'GEN_ARMOR_ARGC'), r2.text.slice(0, 300));
  const r3 = run({ name: 'arm3', ops: [{ op: 'armor', entity: 'tank_a', value: '1 2 3 4' }] }, 'mowas2');
  ok('armor without macro refused', has(r3, 'GEN_ARMOR_NO_MACRO'), r3.text.slice(0, 300));
}
// 5. roster AS2 + GoH
{
  const r = run({ name: 'ros', ops: [{ op: 'roster', unit: 'tank_a', like: 'tank_b', army: 'rus', fields: { cost: 150 } }] }, 'mowas2');
  const t = (r.f('resource/set/multiplayer/units/vehicles_rus.set') || '').toString('latin1');
  ok('roster AS2 card added', /\{"tank_a" \("tank" side\(rus\) cost\(150\)/.test(t) && /\{"tank_b"/.test(t), r.text.slice(0, 300) + t);
  ok('roster AS2 CRLF kept', eolOk(r.f('resource/set/multiplayer/units/vehicles_rus.set')));
  const g = run({ name: 'rosg', ops: [{ op: 'roster', unit: 'tank_a', like: 'tank_b', army: 'ger', period: 'late', fields: { cost: 150 } }] }, 'goh');
  const tg = (g.f('resource/set/multiplayer/units/late/units_ger.set') || '').toString('latin1');
  ok('roster GoH card added in units/<period>/units_<fac>.set', /\{"tank_a" \("tank" side\(ger\) period\(late\) cost\(150\)/.test(tg), g.text.slice(0, 300) + tg);
  const e = run({ name: 'rose', ops: [{ op: 'roster', unit: 'tank_c', like: 'tank_b', army: 'rus' }] }, 'mowas2');
  ok('roster duplicate refused', has(e, 'GEN_ROSTER_EXISTS'), e.text.slice(0, 300));
  const l = run({ name: 'rosl', ops: [{ op: 'roster', unit: 'tank_a', like: 'nope', army: 'rus' }] }, 'mowas2');
  ok('roster unknown like refused and named', has(l, 'GEN_ROSTER_LIKE_MISSING') && has(l, 'nope'), l.text.slice(0, 300));
  const u = run({ name: 'rosu', ops: [{ op: 'roster', unit: 'no_such_unit', like: 'tank_b', army: 'rus' }] }, 'mowas2');
  ok('roster unknown entity refused', has(u, 'GEN_SET_ENTITY_UNKNOWN') && has(u, 'no_such_unit'), u.text.slice(0, 300));
  const fr = run({ name: 'rosf', ops: [{ op: 'roster', unit: 'tank_a', like: 'tank_b', army: 'rus', fields: { bogus: 1 } }] }, 'mowas2');
  ok('roster unknown field refused', has(fr, 'GEN_FIELD_UNKNOWN') || has(fr, 'bogus'), fr.text.slice(0, 300));
}
// 6. breed + squad AS2 (with display text, non-ASCII) and GoH
{
  const spec = { name: 'sq', ops: [
    { op: 'breed', name: 'gen_rifle', army: 'rus', like: 'rifle', set: { 'inventory/item[0]#1': '"mosin gen"' } },
    { op: 'squad', name: 'gen_riflemen', army: 'rus', like: 'riflemans', display: 'Отряд', members: ['squadleader:1', 'gen_rifle:5'], fields: { cost: 100 } }] };
  const r = run(spec, 'mowas2');
  const sq = (r.f('resource/set/multiplayer/units/squads.set') || '').toString('latin1');
  ok('squad AS2 line', /side\(rus\) name\(gen_riflemen\)[^\n]*c1\(squadleader:1\) c2\(gen_rifle:5\)[^\n]*cost\(100\)/.test(sq), r.text.slice(0, 400) + sq);
  ok('squad AS2 other side untouched', /side\(ger\) name\(riflemans\)[^\n]*cost\(55\)/.test(sq) && (sq.match(/name\(riflemans\)/g) || []).length === 2);
  ok('squad AS2 CRLF kept', eolOk(r.f('resource/set/multiplayer/units/squads.set')));
  const br = (r.f('resource/set/breed/mp/rus/gen_rifle.set') || '').toString('latin1');
  ok('breed AS2 file with edited item', /\{item "mosin gen"\}/.test(br) && /\{item "grenade"\}/.test(br), br);
  const sol = (r.f('resource/set/multiplayer/units/soldiers.set') || '').toString('latin1');
  ok('breed AS2 declaration', /\{"mp\/rus\/gen_rifle" \("rifle" side\(rus\)\)\}/.test(sol), sol);
  const lng = r.f('localization/#sq.lng');
  ok('lng UTF-8 (not cp1251) with squad key', lng && lng.includes(Buffer.from('Отряд', 'utf8')) && /desc\/squad\/gen_riflemen\(rus\)|gen_riflemen/.test(lng.toString('utf8')), lng && lng.toString('latin1'));
  ok('no lng at a vanilla path', !r.f('localization/desc.lng') && !r.f('resource/interface/text/desc.lng'));
  const d = run({ name: 'sqb', ops: [{ op: 'squad', name: 'x_sq', army: 'rus', like: 'riflemans', members: ['nope_breed:2'] }] }, 'mowas2');
  ok('squad unknown breed refused and named', has(d, 'GEN_SQUAD_BREED_UNKNOWN') && has(d, 'nope_breed'), d.text.slice(0, 300));
  const m = run({ name: 'sqm', ops: [{ op: 'squad', name: 'x_sq', army: 'rus', like: 'riflemans', members: ['rifle:1', 'rifle:1', 'rifle:1', 'rifle:1'] }] }, 'mowas2');
  ok('squad undefined macro refused', has(m, 'GEN_SQUAD_MACRO_UNDEFINED') && has(m, 'squad_with4types'), m.text.slice(0, 300));
  const x = run({ name: 'sqx', ops: [{ op: 'squad', name: 'riflemans', army: 'rus', like: 'riflemans', members: ['squadleader:1', 'rifle:3'] }] }, 'mowas2');
  ok('squad exists refused', has(x, 'GEN_SQUAD_EXISTS'), x.text.slice(0, 300));
  const lk = run({ name: 'sql', ops: [{ op: 'squad', name: 'y_sq', army: 'rus', like: 'ghost', members: ['squadleader:1', 'rifle:3'] }] }, 'mowas2');
  ok('squad unknown like refused', has(lk, 'GEN_SQUAD_LIKE_MISSING') && has(lk, 'ghost'), lk.text.slice(0, 300));

  const g = run({ name: 'sqg', ops: [
    { op: 'breed', name: 'gen_rifle', army: 'ger', period: 'late', like: 'rifleman_1', set: { 'inventory/item[0]#1': '"k98 gen"' } },
    { op: 'squad', name: 'gen_riflemen', army: 'ger', period: 'late', like: 'single_mg', display: 'Отряд', members: ['gen_rifle:3'], fields: { ci: 40 } }] }, 'goh');
  const u = (g.f('resource/set/multiplayer/units/late/units_ger.set') || '').toString('latin1');
  ok('squad GoH line in units/<period>/units_<fac>.set', /\("squad_with1types" side\(ger\) name\(gen_riflemen\)[^\n]*ci\(40\)[^\n]*c1\(gen_rifle:3\)/.test(u), g.text.slice(0, 400) + u);
  const inf = (g.f('resource/set/multiplayer/units/late/inf_ger.set') || '').toString('latin1');
  ok('breed GoH declaration in inf_<fac>.set', /\{"mp\/ger\/late\/gen_rifle" \("inf_tier1" side\(ger\) period\(late\) cost\(7\.0\)\)\}/.test(inf), inf);
  ok('breed GoH card copied into the other lists that declare the copied breed (conquest)', /\{"mp\/ger\/late\/gen_rifle" \("inf_tier1" side\(ger\) cost\(7\.0\)\)\}/.test((g.f('resource/set/multiplayer/units/conquest/inf_ger.set') || '').toString('latin1')), g.text.slice(0, 400));
  ok('breed GoH file under breed/mp/<fac>/<period>/', /\{item "k98 gen" filled\}/.test((g.f('resource/set/breed/mp/ger/late/gen_rifle.set') || '').toString('latin1')));
  ok('GoH has no AS2 soldiers.set', !g.f('resource/set/multiplayer/units/soldiers.set'));
  const pot = g.f('localizations/default/interface/text/sqg.pot');
  ok('GoH name goes to a UTF-8 .pot, no .lng left', pot && pot.includes(Buffer.from('Отряд', 'utf8')) && !(fs.existsSync(path.join(g.out, 'localization')) && fs.readdirSync(path.join(g.out, 'localization')).some(x => /\.lng$/i.test(x))), pot ? pot.toString('latin1').slice(0, 200) : g.text.slice(0, 400));
  // the mod's own .pot of that name is merged, not rebuilt: header, comments, other keys, msgstr and CRLF stay byte for byte; a key
  // written again gets its msgid replaced (a translated msgstr kept, marked fuzzy); new keys at the end; a restore point first
  // driven in process through gen finishText (a gen run itself refuses an out folder that is not empty: GEN_OUT_EXISTS)
  const pp = 'localizations/default/interface/text/sqm2.pot', o2 = path.join(W, 'potmod');
  const old = Buffer.from(['# my own header note', 'msgid ""', 'msgstr ""', '"Project-Id-Version: mine\\n"', '"Language: ru\\n"', '', '# translator: keep this',
    'msgctxt "other/key"', 'msgid "Other"', 'msgstr "Другой"', '', 'msgctxt "desc/squad/gen_riflemen(ger)"', 'msgid "Old name"', 'msgstr "Старое"', ''].join('\r\n'), 'utf8');
  fs.mkdirSync(path.dirname(path.join(o2, pp)), { recursive: true }); fs.writeFileSync(path.join(o2, pp), old);
  const { Ctx: PCtx } = require('../lib/ctx'), genMain = require('../gen'), g2 = new PCtx({ target: 'goh', goh: H, out: o2 });
  g2.texts.push({ key: 'desc/squad/gen_riflemen(ger)', text: 'Отряд', file: '' }, { key: 'info/squad/gen_riflemen(ger)', text: 'Отряд', file: '' });
  genMain.finishText(g2, 'sqm2');
  const np = fs.existsSync(path.join(o2, pp)) ? fs.readFileSync(path.join(o2, pp)) : null, ns = np ? np.toString('utf8') : '';
  ok('GoH .pot merge: the old header, comments, other keys and msgstr kept byte for byte, CRLF only', np && ns.startsWith(['# my own header note', 'msgid ""', 'msgstr ""', '"Project-Id-Version: mine\\n"', '"Language: ru\\n"', '', '# translator: keep this', 'msgctxt "other/key"', 'msgid "Other"', 'msgstr "Другой"', ''].join('\r\n')) && !/[^\r]\n/.test(ns), ns);
  ok('GoH .pot merge: a key written again: msgid replaced, the translated msgstr kept and marked fuzzy; new keys added at the end',
    /#, fuzzy\r\nmsgctxt "desc\/squad\/gen_riflemen\(ger\)"\r\nmsgid "Отряд"\r\nmsgstr "Старое"\r\n/.test(ns) && /\r\nmsgctxt "info\/squad\/gen_riflemen\(ger\)"\r\nmsgid "Отряд"\r\nmsgstr ""\r\n$/.test(ns) && (ns.match(/gen_riflemen\(ger\)/g) || []).length === 2, ns);
  const ur = path.join(path.dirname(o2), path.basename(o2) + '.arsenal-undo'), ids = fs.existsSync(ur) ? fs.readdirSync(ur) : [];
  const rp = ids.map(i => JSON.parse(fs.readFileSync(path.join(ur, i, 'restore-point.json'), 'utf8'))).find(x => x.rel === pp);
  ok('GoH .pot merge: a restore point of the old .pot first', rp && rp.existed && fs.readFileSync(path.join(ur, rp.id, 'files', ...pp.split('/'))).equals(old), JSON.stringify(ids));
}
// Ctx.flush: every file checked first; a link inside the mod that leads out of it is refused and nothing is written through it
{
  const { Ctx } = require('../lib/ctx');
  const mod = path.join(W, 'flushmod'), away = path.join(W, 'flushaway'); fs.mkdirSync(path.join(mod, 'resource'), { recursive: true }); fs.mkdirSync(away, { recursive: true });
  let linked = true; try { fs.symlinkSync(away, path.join(mod, 'resource', 'lnk'), 'junction'); } catch (e) { linked = false; }
  const c = new Ctx({ target: 'goh', goh: H, out: mod });
  c.write('resource/ok.txt', 'a\r\n'); if (linked) c.write('resource/lnk/x.txt', 'b\r\n');
  let e = null; try { c.flush(); } catch (x) { e = x; }
  if (linked) ok('Ctx.flush: a junction in the mod that leads out refused before any write', e && e.code === 'MOD_WRITE_OUTSIDE' && !fs.existsSync(path.join(mod, 'resource', 'ok.txt')) && fs.readdirSync(away).length === 0, e && e.message);
  if (linked) fs.unlinkSync(path.join(mod, 'resource', 'lnk'));
  const c2 = new Ctx({ target: 'goh', goh: H, out: mod }); c2.restoreAction = 'test';
  fs.writeFileSync(path.join(mod, 'resource', 'ok.txt'), 'old\r\n'); c2.write('resource/ok.txt', 'new\r\n'); c2.write('resource/n.txt', 'n\r\n'); c2.flush();
  ok('Ctx.flush with restoreAction: a restore point per file first (old bytes kept, a new file noted), then written', c2.restored.length === 2 && fs.readFileSync(path.join(mod, 'resource', 'ok.txt'), 'latin1') === 'new\r\n'
    && fs.readFileSync(path.join(W, 'flushmod.arsenal-undo', c2.restored[0], 'files', 'resource', 'ok.txt'), 'latin1') === 'old\r\n', JSON.stringify(c2.restored));
}
// 7. roster/squad into a file nothing includes is refused
{
  // orphan.set is not an army list; use a spec pointing the loader check at it through a card in it
  const f = path.join(A, 'resource/set/multiplayer/units/squads2.set');
  const keep = fs.existsSync(f);
  fs.writeFileSync(f, '("squad_with2types" side(usa) name(orph) c1(rifle:1) c2(rifle:1) b(squad1) t(all))\r\n');
  const r = run({ name: 'orph', ops: [{ op: 'squad', name: 'orph2', army: 'usa', like: 'orph', members: ['rifle:1', 'rifle:1'] }] }, 'mowas2');
  ok('unreachable list file refused', has(r, 'GEN_ROSTER_NOT_LOADED') || has(r, 'GEN_ROSTER_NO_FILE') || has(r, 'GEN_SQUAD_LIKE_MISSING'), r.text.slice(0, 300));
  if (!keep) fs.unlinkSync(f);
}
// 8. --plan writes nothing (mod folder and report dir)
{
  const spec = { name: 'plan1', ops: [
    { op: 'set', rows: [{ entity: 'rifle_a', path: 'actor/k1', value: '9' }] },
    { op: 'breed', name: 'gen_rifle', army: 'rus', like: 'rifle', set: { 'inventory/item[0]#1': '"mosin gen"' } },
    { op: 'squad', name: 'gen_riflemen', army: 'rus', like: 'riflemans', display: 'Gen', members: ['squadleader:1', 'gen_rifle:5'], bots: false },
    { op: 'text', key: 'desc/x', text: 'y' }] };
  const r = run(spec, 'mowas2', ['--plan']);
  ok('plan exit 0', r.status === 0, r.text.slice(0, 400));
  ok('plan writes no mod folder', !fs.existsSync(r.out), r.out);
  ok('plan writes no report folder', !fs.existsSync(r.out + '.gen'));
  ok('plan prints the squad op', has(r, 'gen_riflemen'), r.text.slice(0, 300));
  const b = run({ name: 'plan2', ops: [{ op: 'set', rows: [{ entity: 'nosuch_ent', path: 'a', value: '1' }] }] }, 'mowas2', ['--plan']);
  ok('plan still names a bad entity', has(b, 'GEN_SET_ENTITY_UNKNOWN') && !fs.existsSync(b.out));
}
// 9. output safety: refuse into the game dir, refuse existing without --force
{
  const sf = path.join(W, 'specs.json'); fs.writeFileSync(sf, JSON.stringify({ name: 's', ops: [] }));
  let r = cp.spawnSync(process.execPath, [GEN, sf, '--target', 'mowas2', '--game', A, '--out', path.join(A, 'resource', 'x'), '--no-gate', '--no-stat'], { encoding: 'utf8' });
  ok('out inside the game dir refused', /GEN_OUT_UNSAFE/.test(r.stdout + r.stderr) && !fs.existsSync(path.join(A, 'resource', 'x')), (r.stdout + r.stderr).slice(0, 200));
  const o = path.join(W, 'exist'); fs.mkdirSync(o, { recursive: true }); fs.writeFileSync(path.join(o, 'keep.txt'), 'x');
  r = cp.spawnSync(process.execPath, [GEN, sf, '--target', 'mowas2', '--game', A, '--out', o, '--no-gate', '--no-stat'], { encoding: 'utf8' });
  ok('existing out dir refused, content kept', /GEN_OUT_EXISTS/.test(r.stdout + r.stderr) && fs.existsSync(path.join(o, 'keep.txt')), (r.stdout + r.stderr).slice(0, 200));
  // writeguard (I-1, I-2, I-11): GoH by content with the AS2 game given, game resource with another game, force only over a gen-made folder, out = file
  const g = path.join(W, 'gohx'); fs.mkdirSync(path.join(g, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(g, 'binaries', 'x64', 'call_to_arms.exe'), '');
  const gen = (out, more = []) => cp.spawnSync(process.execPath, [GEN, sf, '--target', 'mowas2', '--game', A, '--out', out, '--no-gate', '--no-stat', ...more], { encoding: 'utf8' });
  r = gen(path.join(g, 'resource', 'x'));
  ok('out inside a GoH dir (by content) refused', /GEN_OUT_UNSAFE/.test(r.stdout + r.stderr) && /Gates of Hell/.test(r.stdout + r.stderr) && !fs.existsSync(path.join(g, 'resource')), (r.stdout + r.stderr).slice(0, 300));
  const B = path.join(W, 'gameB'); fs.mkdirSync(path.join(B, 'resource'), { recursive: true }); fs.writeFileSync(path.join(B, 'as64.exe'), '');
  r = gen(path.join(B, 'resource', 'y'));
  ok('out inside another game dir refused whatever --game says', /GEN_OUT_UNSAFE/.test(r.stdout + r.stderr) && !fs.existsSync(path.join(B, 'resource', 'y')), (r.stdout + r.stderr).slice(0, 300));
  const f = path.join(W, 'afile.txt'); fs.writeFileSync(f, 'x');
  r = gen(f);
  ok('out = a file: plain line, no stack', /is a file, not a folder/.test(r.stdout + r.stderr) && !/at .*\.js:\d+/.test(r.stderr), (r.stdout + r.stderr).slice(0, 300));
  const u = path.join(W, 'usermod'); fs.mkdirSync(u, { recursive: true }); fs.writeFileSync(path.join(u, 'mod.info'), '{name "u"}'); fs.writeFileSync(path.join(u, 'precious.txt'), 'x');
  r = gen(u, ['--force']);
  ok('--force over a hand-made mod refused, files kept', /GEN_OUT_EXISTS/.test(r.stdout + r.stderr) && fs.existsSync(path.join(u, 'precious.txt')), (r.stdout + r.stderr).slice(0, 300));
  const m = path.join(W, 'genmade'); fs.rmSync(m, { recursive: true, force: true });
  r = gen(m);
  const r2 = gen(m, ['--force']);
  ok('gen marks its folder; --force replaces it', fs.existsSync(path.join(m, '.arsenal-made')) && !/GEN_OUT_EXISTS/.test(r2.stdout + r2.stderr) && fs.existsSync(path.join(m, 'mod.info')), (r.stdout + r.stderr + r2.stdout + r2.stderr).slice(0, 400));
}
// 10. yaml spec parses to the same result as JSON
{
  const y = require('../lib/yaml');
  const v = y.parse('name: t\nops:\n  - op: squad\n    members: [a:1, b:5]\n    fields: {cost: 100, level: 1}\n  - op: set\n    rows:\n      - "e,p/q,3"\n      - {entity: e, path: p, value: "x y"}\n# c\n');
  ok('yaml subset', v.name === 't' && v.ops[0].members[1] === 'b:5' && v.ops[0].fields.cost === '100' && v.ops[1].rows[0] === 'e,p/q,3' && v.ops[1].rows[1].value === 'x y', JSON.stringify(v));
}
// 11. sample spec: --sample prints the spec text; every op runs on the fixture; --json gives a machine result
{
  const st = cp.spawnSync(process.execPath, [GEN, '--sample', 'all'], { encoding: 'utf8' });
  ok('--sample prints the spec text, exit 0', st.status === 0 && /^name: gen_sample$/m.test(st.stdout), st.stdout.slice(0, 200));
  // the shipped sample uses real vanilla names (checked against a real game); the stand-in game has fixture names, so translate them
  const NL = String.fromCharCode(10), IND = NL + '    ';
  const fx = [['entity: bt7a' + NL, 'entity: tank_c' + NL], ['"bt7a,game_entity/targetClass#1,\\"heavy_tank\\""', '"rifle_a,actor/k1,777"'], ['entity: t34_0' + IND + 'value: "turret 60 _ _ _"', 'entity: tank_arm' + IND + 'value: "50 _ 70 80"'],
    ['desc/entity/zis2', 'desc/entity/tank_a'], ['unit: gen_bt7a' + IND + 'like: bt7a', 'unit: tank_a' + IND + 'like: tank_b' + IND + 'bots: false'], ['unit: t34_0', 'unit: tank_c'],
    ['"icon_priority#1": "2"', '"inventory/item[0]#1": "\\"mosin gen\\""'], ['map/multi/1v1_road', 'map/multi/m1'], ['map/multi/8v8_market', 'map/multi/m2'], ['multi/1v1_spring', 'multi/m1'], ['house_n1_af', 'hut1']];
  let tx = st.stdout.split(String.fromCharCode(13)).join(''); for (const [f, t] of fx) { ok('sample name ' + f.slice(0, 24).split(NL).join(' '), tx.includes(f), 'missing in sample.yaml'); tx = tx.split(f).join(t); }
  const sp = path.join(W, 'sample.yaml'); fs.writeFileSync(sp, tx);
  const sy = require('../lib/yaml').parse(fs.readFileSync(sp, 'utf8')), kinds = new Set(sy.ops.map(o => o.op));
  ok('sample has every op', ['mod', 'clone', 'set', 'armor', 'text', 'roster', 'card', 'squad', 'breed', 'map-clone', 'mission-clone', 'place'].every(k => kinds.has(k)), [...kinds].join(' '));
  const out = path.join(W, 'sample_out');
  const r = cp.spawnSync(process.execPath, [GEN, sp, '--target', 'mowas2', '--game', A, '--out', out, '--no-gate', '--no-stat', '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  let j = null; try { j = JSON.parse(r.stdout); } catch (e) { /* reported below */ }
  ok('sample --json parses, exit 0', j && r.status === 0, (r.stdout + r.stderr).slice(0, 400));
  ok('sample --json all ops applied', j && j.ops.applied === sy.ops.length && j.errors.length === 0 && Array.isArray(j.skipped) && j.skipped.length === 0, j && JSON.stringify(j.ops));
  ok('sample --json lists files', j && j.files.includes('resource/map/multi/gen_road/map.net') && j.files.includes('resource/map/multi/m2/combat.mi') && j.files.includes('resource/map/multi/m1/map'), j && j.files.join(' '));
  ok('sample files cp1251+CRLF', ['resource/map/multi/m1/map', 'resource/map/multi/m2/combat.mi', 'resource/set/multiplayer/units/squads.set'].every(k => { const b = fs.readFileSync(path.join(out, k)); return !/[^\r]\n/.test(b.toString('latin1')); }));
  ok('sample map-clone terrain bytes identical', Buffer.compare(fs.readFileSync(path.join(out, 'resource/map/multi/gen_road/map.net')), fs.readFileSync(path.join(A, 'resource/map/multi/m1/map.net'))) === 0);
  ok('sample place wrote the entity', /\{Entity "hut1" 0x3/.test(fs.readFileSync(path.join(out, 'resource/map/multi/m1/map'), 'latin1')));
  ok('sample mission-clone stripped flags', !/flag_point/.test(fs.readFileSync(path.join(out, 'resource/map/multi/m2/combat.mi'), 'latin1')));
  const pl = cp.spawnSync(process.execPath, [GEN, sp, '--target', 'mowas2', '--game', A, '--out', path.join(W, 'sample_plan'), '--plan', '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  let pj = null; try { pj = JSON.parse(pl.stdout); } catch (e) { /* below */ }
  ok('sample --plan --json writes nothing', pj && pj.plan && pj.ops.applied === sy.ops.length && !fs.existsSync(path.join(W, 'sample_plan')), (pl.stdout + pl.stderr).slice(0, 300));
  const bj = run({ name: 'jbad', ops: [{ op: 'set', rows: [{ entity: 'nosuch_ent', path: 'a', value: '1' }] }, { op: 'frob' }] }, 'mowas2', ['--json']);
  let b = null; try { b = JSON.parse(bj.text); } catch (e) { /* below */ }
  ok('--json error result', b && bj.status !== 0 && b.errors.some(e => e.code === 'GEN_SET_ENTITY_UNKNOWN') && b.skipped.some(s => s.op === 'frob') && b.ops.list[1].status === 'unknown', bj.text.slice(0, 300));
}
// 12. map-clone / mission-clone / place ops
{
  let r = run({ name: 'mc1', ops: [{ op: 'map-clone', map: 'map/multi/nosuch', name: 'zz' }] }, 'mowas2');
  ok('map-clone unknown map refused', has(r, 'MAPCLONE_NO_MAP') && r.status !== 0, r.text.slice(0, 300));
  r = run({ name: 'mc2', ops: [{ op: 'map-clone', map: 'map/multi/m1' }] }, 'mowas2');
  ok('map-clone args refused', has(r, 'GEN_MAPCLONE_ARGS'), r.text.slice(0, 300));
  r = run({ name: 'mc3', ops: [{ op: 'map-clone', map: 'map/multi/g1', name: 'gg' }] }, 'goh');
  ok('map-clone GoH map (net 05 02)', r.status === 0 && r.f('resource/map/multi/gg/map.net'), r.text.slice(0, 300));
  r = run({ name: 'mc4', ops: [{ op: 'map-clone', map: 'map/multi/m1', name: 'p1' }] }, 'mowas2', ['--plan']);
  ok('map-clone --plan writes nothing', r.status === 0 && !fs.existsSync(r.out), r.text.slice(0, 300));
  r = run({ name: 'ms1', ops: [{ op: 'mission-clone', map: 'map/multi/m2', from: 'battle_zones', to: 'combat' }] }, 'goh');
  // GoH: gen runs mission-clone --exe goh; combat is not a GoH mode, so the tool's own refusal comes back (MC_GOH_NO_MODE, exit 2)
  ok('mission-clone GoH: tool runs its GoH branch, combat refused there', has(r, 'GEN_TOOL_FAILED') && /MC_GOH_NO_MODE combat/.test(r.text) && r.status !== 0, r.text.slice(0, 300));
  r = run({ name: 'ms2', ops: [{ op: 'mission-clone', map: 'map/multi/m2', from: 'frontline', to: 'combat' }] }, 'mowas2');
  ok('mission-clone missing source mode refused', has(r, 'MC_NO_SOURCE') && r.status !== 0, r.text.slice(0, 300));
  r = run({ name: 'ms3', ops: [{ op: 'mission-clone', map: 'map/multi/m2', from: 'battle_zones' }] }, 'mowas2');
  ok('mission-clone args refused', has(r, 'GEN_MISSION_ARGS'), r.text.slice(0, 300));
  r = run({ name: 'ms4', ops: [{ op: 'mission-clone', map: 'map/multi/m2', from: 'battle_zones', to: 'combat' }] }, 'mowas2', ['--plan']);
  ok('mission-clone --plan writes nothing', r.status === 0 && !fs.existsSync(r.out), r.text.slice(0, 300));
  r = run({ name: 'pl1', ops: [{ op: 'place', map: 'multi/m1', entity: 'nosuch_def', pos: '1,2' }] }, 'mowas2');
  ok('place unknown entity refused', has(r, 'PLACE_ENTITY_UNKNOWN') && r.status !== 0, r.text.slice(0, 300));
  r = run({ name: 'pl2', ops: [{ op: 'place', map: 'multi/m1', entity: 'hut1' }] }, 'mowas2');
  ok('place args refused', has(r, 'GEN_PLACE_ARGS'), r.text.slice(0, 300));
  r = run({ name: 'pl3', ops: [{ op: 'place', items: [{ map: 'multi/m1', entity: 'hut1', pos: '5,6' }, { map: 'multi/m1', entity: 'tree1', pos: [7, 8, 1.5], scale: 2 }] }] }, 'mowas2');
  const mt = (r.f('resource/map/multi/m1/map') || '').toString('latin1');
  ok('place two items, unique uids', r.status === 0 && /"hut1" 0x3/.test(mt) && /"tree1" 0x4/.test(mt), r.text.slice(0, 300) + mt.slice(-300));
  r = run({ name: 'pl4', ops: [{ op: 'place', map: 'multi/g1', entity: 'hut1', pos: '5,6' }] }, 'goh');
  ok('place GoH', r.status === 0 && /"hut1"/.test((r.f('resource/map/multi/g1/map') || '').toString('latin1')), r.text.slice(0, 300));
  r = run({ name: 'pl5', ops: [{ op: 'place', map: 'multi/m1', entity: 'hut1', pos: '5,6' }] }, 'mowas2', ['--plan']);
  ok('place --plan writes nothing', r.status === 0 && !fs.existsSync(r.out), r.text.slice(0, 300));
  r = run({ name: 'pl6', ops: [{ op: 'map-clone', map: 'map/multi/m1', name: 'cc' }, { op: 'place', map: 'multi/cc', entity: 'hut1', pos: '5,6' }] }, 'mowas2', ['--plan']);
  ok('plan chain place-on-clone skipped with info', r.status === 0 && has(r, 'GEN_PLAN_SKIPPED'), r.text.slice(0, 300));
  r = run({ name: 'pl7', ops: [{ op: 'map-clone', map: 'map/multi/m1', name: 'cc' }, { op: 'place', map: 'multi/cc', entity: 'hut1', pos: '5,6' }] }, 'mowas2');
  ok('chain: place on the fresh clone', r.status === 0 && /"hut1"/.test((r.f('resource/map/multi/cc/map') || '').toString('latin1')), r.text.slice(0, 300));
  // T10 glossary hint on GoH unknown field
  r = run({ name: 'gl', ops: [{ op: 'roster', unit: 'tank_a', like: 'tank_b', army: 'ger', period: 'late', fields: { cd: 5 } }] }, 'goh');
  ok('GoH unknown field names the T10 glossary', has(r, 'GEN_FIELD_UNKNOWN') && has(r, 'known name'), r.text.slice(0, 300));
}
// 13. chain-n: clone name + text op on the same key -> one write (GEN_TEXT_DUP_SKIPPED); differing text -> WARN_GEN_TEXT_DUP
{
  const key = 'desc/entity/gen_tank2';
  let r = run({ name: 'td1', ops: [{ op: 'clone', entity: 'tank_c', as: 'gen_tank2', name: 'Gen Tank' }, { op: 'text', key, text: 'Gen Tank' }] }, 'mowas2');
  const own = (r.f('localization/#td1.lng') || Buffer.alloc(0)).toString('utf8');
  ok('text dup: same text skipped, key not in #slug.lng', has(r, 'GEN_TEXT_DUP_SKIPPED') && !own.toLowerCase().includes(key), r.text.slice(0, 400) + own);
  r = run({ name: 'td2', ops: [{ op: 'clone', entity: 'tank_c', as: 'gen_tank2', name: 'Gen Tank' }, { op: 'text', key, text: 'Other' }] }, 'mowas2');
  ok('text dup: differing text warned', has(r, 'WARN_GEN_TEXT_DUP'), r.text.slice(0, 400));
  // gate: refcheck error in a dep file naming nothing this spec made = inherited (warning); in the mod out or naming a made name = error
  const { rcInherited } = require(GEN), o = path.join(W, 'rcout'); fs.mkdirSync(path.join(o, 'resource/entity/mine'), { recursive: true }); fs.writeFileSync(path.join(o, 'resource/entity/mine/mine.def'), '');
  const nm = new Set(['gen_tank2']);
  ok('gate: dep REF_ANIM_MISSING inherited', rcInherited('resource/entity/pz38/pz38.def:72: REF_ANIM_MISSING boarder animation "x" (entity pz38)', 'resource/entity/pz38/pz38.def', 'REF_ANIM_MISSING', o, nm));
  ok('gate: error in the mod out not inherited', !rcInherited('resource/entity/mine/mine.def:1: REF_ANIM_MISSING x', 'resource/entity/mine/mine.def', 'REF_ANIM_MISSING', o, nm));
  ok('gate: error naming a made unit not inherited', !rcInherited('resource/entity/pz38/pz38.def:1: REF_X uses gen_tank2', 'resource/entity/pz38/pz38.def', 'REF_X', o, nm));
}
// 14. GENFIX (reproof1 C05): report dir never inside mods/; squad/breed get name+info lng entries; bots: copies the like's Purchases entries
{
  const sf = path.join(W, 'gf.json');
  fs.writeFileSync(sf, JSON.stringify({ name: 'gf', ops: [{ op: 'set', rows: [{ entity: 'rifle_a', path: 'actor/k1', value: '3' }] }] }));
  const mods = path.join(W, 'gm', 'mods'); fs.mkdirSync(mods, { recursive: true });
  const tmp = path.join(W, 'tmpd'); fs.mkdirSync(tmp, { recursive: true });
  let r = cp.spawnSync(process.execPath, [GEN, sf, '--target', 'mowas2', '--game', A, '--out', path.join(mods, 'gf_mod'), '--no-gate', '--no-stat'], { encoding: 'utf8', cwd: W, env: { ...process.env, TMP: tmp, TEMP: tmp, TMPDIR: tmp } });
  ok('report dir: --out <x>/mods/m puts nothing but the mod in mods/', r.status === 0 && fs.readdirSync(mods).join() === 'gf_mod' && fs.existsSync(path.join(tmp, 'as2-gen', 'gf.gen', 'TESTNOTES.md')), (r.stdout + r.stderr).slice(0, 300) + fs.readdirSync(mods).join());
  // C2c seeded: no gen-out under the cwd (the repo when run from src); fails on the old tool
  ok('report dir: nothing written under the cwd gen-out', !fs.existsSync(path.join(W, 'gen-out')));
  const rd = path.join(W, 'myrep');
  r = cp.spawnSync(process.execPath, [GEN, sf, '--target', 'mowas2', '--game', A, '--out', path.join(W, 'gf_out2'), '--report', rd, '--no-gate', '--no-stat'], { encoding: 'utf8', cwd: W });
  ok('report dir: --report honoured, no <out>.gen', r.status === 0 && fs.existsSync(path.join(rd, 'gen.json')) && !fs.existsSync(path.join(W, 'gf_out2.gen')), (r.stdout + r.stderr).slice(0, 300));

  // seeded defect (C05): squad without display + breed -> before GENFIX no desc/human, no info/squad key (raw key shown, no info button)
  r = run({ name: 'loc1', ops: [
    { op: 'breed', name: 'gen_rifle', army: 'rus', like: 'rifle' },
    { op: 'squad', name: 'gen_sq', army: 'rus', like: 'riflemans', members: ['squadleader:1', 'gen_rifle:3'] }] }, 'mowas2');
  const L = (r.f('localization/#loc1.lng') || Buffer.alloc(0)).toString('utf8');
  ok('loc: breed desc/human/mp/rus/gen_rifle = like text (UTF-8)', /\{"human"[\s\S]*\{"gen_rifle" "Стрелок"\}/.test(L), r.text.slice(0, 300) + L);
  ok('loc: squad desc/squad/gen_sq(rus) = like text', /\{"squad"[\s\S]*\{"gen_sq\(rus\)" "Rifle squad"\}/.test(L), L);
  ok('loc: squad info/squad/gen_sq(rus) = like info, escapes kept', /\{"info"[\s\S]*\{"gen_sq\(rus\)" "Riflemen with \\"bolt\\" rifles"\}/.test(L), L);
  ok('loc: lng CRLF, {tags root', /^\{tags\r\n/.test(L) && !/[^\r]\n/.test(L), JSON.stringify(L.slice(0, 40)));
  ok('loc: no bots -> info GEN_SQUAD_NO_BOTS, no bot.data.lua', has(r, 'GEN_SQUAD_NO_BOTS') && !r.f('resource/script/multiplayer/bot.data.lua'), r.text.slice(0, 300));
  // spec display/info win; a text op before the squad op on the same key is not overwritten by the auto entry
  r = run({ name: 'loc2', ops: [
    { op: 'text', key: 'info/squad/gen_sq(rus)', text: 'Mine' },
    { op: 'squad', name: 'gen_sq', army: 'rus', like: 'riflemans', display: 'Gen Squad', members: ['squadleader:1', 'rifle:3'] }] }, 'mowas2');
  const L2 = (r.f('localization/#loc2.lng') || Buffer.alloc(0)).toString('utf8');
  ok('loc: display wins, earlier text op kept over the auto info', /"gen_sq\(rus\)" "Gen Squad"/.test(L2) && /"gen_sq\(rus\)" "Mine"/.test(L2) && !/bolt/.test(L2), L2);
  // like with no text anywhere -> fallback = the name (never a raw key)
  r = run({ name: 'loc3', ops: [{ op: 'squad', name: 'gen_a', army: 'rus', like: 'riflemans', display: 'A', info: 'I', members: ['squadleader:1', 'rifle:3'] },
    { op: 'squad', name: 'gen_b', army: 'rus', like: 'gen_a', members: ['squadleader:1', 'rifle:2'] }] }, 'mowas2');
  const L3 = (r.f('localization/#loc3.lng') || Buffer.alloc(0)).toString('utf8');
  ok('loc: like with no base text -> name fallback for desc and info; info: given wins', (L3.match(/"gen_b\(rus\)" "gen_b"/g) || []).length === 2 && /"gen_a\(rus\)" "I"/.test(L3), r.text.slice(0, 300) + L3);

  // bots: seeded defect = card only, no Purchases entry (C05: 0 of ~450 bot buys)
  r = run({ name: 'bot1', ops: [
    { op: 'squad', name: 'gen_sq', army: 'rus', like: 'riflemans', members: ['squadleader:1', 'rifle:3'], bots: 5 }] }, 'mowas2');
  const B = (r.f('resource/script/multiplayer/bot.data.lua') || Buffer.alloc(0)).toString('latin1');
  ok('bots: copies every live riflemans(rus) entry (2 stages), not the commented one', (B.match(/unit = "gen_sq\(rus\)"/g) || []).length === 2 && /priority = 5, class = UnitClass\.Infantry, unit = "gen_sq\(rus\)", min_income = 10\}/.test(B) && (B.match(/--\{priority = 9\.0/g) || []).length === 1, r.text.slice(0, 300) + B);
  ok('bots: last entry of a stage gets its comma, priority override', /unit = "riflemans\(rus\)"\}, -- last\r\n\t+\{priority = 5, class = UnitClass\.Infantry, unit = "gen_sq\(rus\)"\} -- last\r\n\t+\},/.test(B), B);
  ok('bots: lua parses as a table (brace balance) and CRLF', (B.match(/\{/g) || []).length === (B.match(/\}/g) || []).length && !/[^\r]\n/.test(B), B);
  r = run({ name: 'bot2', ops: [{ op: 'squad', name: 'gen_sq', army: 'rus', like: 'riflemans', members: ['rifle:1', 'squadleader:1'] }, { op: 'squad', name: 'gen_sq2', army: 'rus', like: 'gen_sq', members: ['rifle:1', 'squadleader:1'], bots: true }] }, 'mowas2');
  ok('bots: like absent from Purchases warned, file untouched', has(r, 'WARN_GEN_BOTS_LIKE_ABSENT') && !r.f('resource/script/multiplayer/bot.data.lua'), r.text.slice(0, 400));
  const g = run({ name: 'botg', ops: [{ op: 'squad', name: 'gen_sqg', army: 'ger', period: 'late', like: 'single_mg', members: ['mgun_1:1'], bots: true }] }, 'goh');
  ok('bots: GoH warned, not mapped', has(g, 'WARN_GEN_BOTS_AS2_ONLY'), g.text.slice(0, 300));
  // FIX-PORT tools-mod:31: no bots key while bots buy the like -> a warning (loc1 above: riflemans(rus) is in 2 Purchases stages); bots: false -> info only; like bots never buy -> info only
  const nb1 = run({ name: 'nb1', ops: [{ op: 'squad', name: 'gen_sq', army: 'rus', like: 'riflemans', members: ['squadleader:1', 'rifle:3'] }] }, 'mowas2');
  ok('nobots: like bought by bots, no bots key -> WARN_GEN_SQUAD_NO_BOTS naming 2 stages, no bot.data.lua written', has(nb1, 'WARN_GEN_SQUAD_NO_BOTS') && /riflemans\(rus\) in 2 /.test(nb1.text) && !nb1.f('resource/script/multiplayer/bot.data.lua'), nb1.text.slice(0, 400));
  const nbF = run({ name: 'nb2', ops: [{ op: 'squad', name: 'gen_sq', army: 'rus', like: 'riflemans', members: ['squadleader:1', 'rifle:3'], bots: false }] }, 'mowas2');
  ok('nobots: bots: false -> info GEN_SQUAD_NO_BOTS, no warning', has(nbF, 'GEN_SQUAD_NO_BOTS') && !has(nbF, 'WARN_GEN_SQUAD_NO_BOTS'), nbF.text.slice(0, 400));
  const nbA = run({ name: 'nb3', ops: [{ op: 'squad', name: 'gen_sq', army: 'rus', like: 'riflemans', members: ['squadleader:1', 'rifle:3'] }, { op: 'squad', name: 'gen_sq2', army: 'rus', like: 'gen_sq', members: ['squadleader:1', 'rifle:3'] }] }, 'mowas2');
  ok('nobots: like bots never buy -> no warning for that squad', /gen_sq2[^\n]*bots do not buy gen_sq\(rus\)/.test(nbA.text) && (nbA.text.match(/WARN_GEN_SQUAD_NO_BOTS/g) || []).length === 1, nbA.text.slice(0, 600));
}
// FIX-PORT (port-donors:17): a "_x" clone brings its "_xx" wreck stage along; a spec that clones "_xx" itself is left alone
{
  let r = run({ name: 'xx1', ops: [{ op: 'clone', entity: 'tank_d', as: 'gen_d' }, { op: 'clone', entity: 'tank_d_x', as: 'gen_d_x' }] }, 'mowas2');
  ok('xx: _x clone also clones _xx', r.status === 0 && has(r, 'GEN_XX_AUTOCLONE') && !!r.f('resource/entity/-vehicle/gen_d_xx/gen_d_xx.def'), r.text.slice(0, 400));
  r = run({ name: 'xx2', ops: [{ op: 'clone', entity: 'tank_d_x', as: 'gen_e_x' }, { op: 'clone', entity: 'tank_d_xx', as: 'gen_e_xx' }] }, 'mowas2');
  ok('xx: spec clone of _xx not doubled', r.status === 0 && !has(r, 'GEN_XX_AUTOCLONE') && !!r.f('resource/entity/-vehicle/gen_e_xx/gen_e_xx.def'), r.text.slice(0, 400));
  r = run({ name: 'xx3', ops: [{ op: 'clone', entity: 'tank_d_x', as: 'gen_f_x' }] }, 'mowas2', ['--plan']);
  ok('xx: --plan names the _xx clone, writes nothing', r.status === 0 && has(r, 'GEN_XX_AUTOCLONE') && !fs.existsSync(r.out), r.text.slice(0, 400));
}
// GX: armor named parts (S4), title -> mod.info Name (G12), vanilla key in a desc.lng copy (G1), bots warning (N5), wreck clone (N8), text file named after the mod (N12), --sample list
{
  const S = (r, k) => (r.f(k) || '').toString('latin1');
  let r = run({ name: 'armn', ops: [{ op: 'armor', entity: 'tank_nam', value: 'turret 60 _ _ _ body 50 _ _ _' }] }, 'mowas2');
  ok('armor named parts', r.status === 0 && /turret[(]60 52 52 20[)]/.test(S(r, 'resource/entity/-vehicle/tank_nam/tank_nam.def')) && /body[(]50 45 45 22[)]/.test(S(r, 'resource/entity/-vehicle/tank_nam/tank_nam.def')), r.text.slice(0, 400));
  r = run({ name: 'armp', ops: [{ op: 'armor', entity: 'tank_nam', value: '120 _ _ _' }] }, 'mowas2');
  ok('armor plain value on named parts: every part, info', r.status === 0 && /turret[(]120 52 52 20[)]/.test(S(r, 'resource/entity/-vehicle/tank_nam/tank_nam.def')) && /body[(]120 45 45 22[)]/.test(S(r, 'resource/entity/-vehicle/tank_nam/tank_nam.def')) && has(r, 'GEN_ARMOR_ALL_PARTS'), r.text.slice(0, 400));
  r = run({ name: 'armx', ops: [{ op: 'armor', entity: 'tank_nam', value: 'hull 1 2 3 4' }] }, 'mowas2');
  ok('armor unknown part: error lists the parts', r.status === 1 && has(r, 'GEN_ARMOR_PART_UNKNOWN') && /turret/.test(r.text) && /body/.test(r.text), r.text.slice(0, 500));
  r = run({ name: 'ttl', title: 'My Fine Mod', ops: [{ op: 'set', rows: [{ entity: 'tank_b', path: 'actor/hp', value: '2' }] }] }, 'mowas2');
  ok('title becomes mod.info Name', r.status === 0 && /[{]Name "My Fine Mod"[}]/.test(S(r, 'mod.info')), S(r, 'mod.info').slice(0, 200));
  r = run({ name: 'vkey', ops: [{ op: 'text', key: 'desc/human/mp/rus/rifle', text: 'Gen Rifleman' }] }, 'mowas2');
  const dl = (r.f('localization/desc.lng') || '').toString('utf8');
  ok('vanilla desc key goes into a desc.lng copy (keeps the other keys)', r.status === 0 && has(r, 'GEN_TEXT_VANILLA_FILE') && /Gen Rifleman/.test(dl) && /riflemans[(]rus[)]/.test(dl), r.text.slice(0, 400));
  r = run({ name: 'nkey', ops: [{ op: 'text', key: 'desc/entity/gen_brand_new', text: 'Brand new' }] }, 'mowas2');
  ok('new key stays in the # file, no desc.lng copy', r.status === 0 && !r.f('localization/desc.lng') && /Brand new/.test(S(r, 'localization/#nkey.lng')), r.text.slice(0, 400));
  ok('text file named after the mod, not the folder', !!r.f('localization/#nkey.lng') && !fs.readdirSync(path.join(r.out, 'localization')).some(f => /^#out[0-9]+[.]lng$/.test(f)), fs.readdirSync(path.join(r.out, 'localization')).join(' '));
  r = run({ name: 'nobot', ops: [{ op: 'roster', unit: 'tank_a', like: 'tank_c', army: 'rus' }] }, 'mowas2');
  ok('roster of a bot-bought unit without bots: warning, exit 1', r.status === 1 && has(r, 'WARN_GEN_VEHICLE_NO_BOTS'), r.text.slice(0, 400));
  r = run({ name: 'bots0', ops: [{ op: 'roster', unit: 'tank_a', like: 'tank_c', army: 'rus', bots: false }] }, 'mowas2');
  ok('roster bots: false: no warning', r.status === 0 && !has(r, 'WARN_GEN_VEHICLE_NO_BOTS'), r.text.slice(0, 400));
  r = run({ name: 'wr1', ops: [{ op: 'clone', entity: 'tank_d', as: 'gen_w' }] }, 'mowas2');
  ok('clone brings the _x and _xx wreck along', r.status === 0 && has(r, 'GEN_WRECK_AUTOCLONE') && !!r.f('resource/entity/-vehicle/gen_w_x/gen_w_x.def') && !!r.f('resource/entity/-vehicle/gen_w_xx/gen_w_xx.def'), r.text.slice(0, 400));
  r = run({ name: 'wr2', ops: [{ op: 'clone', entity: 'tank_d', as: 'gen_w', wreck: false }] }, 'mowas2');
  ok('clone wreck: false leaves the wreck out', r.status === 0 && !has(r, 'GEN_WRECK_AUTOCLONE') && !r.f('resource/entity/-vehicle/gen_w_x/gen_w_x.def'), r.text.slice(0, 400));
  r = run({ name: 'wr3', ops: [{ op: 'clone', entity: 'tank_a', as: 'gen_nw' }] }, 'mowas2');
  ok('clone of a unit with no wreck: nothing extra', r.status === 0 && !has(r, 'GEN_WRECK_AUTOCLONE'), r.text.slice(0, 400));
  const sl = cp.spawnSync(process.execPath, [GEN, '--sample', 'list'], { encoding: 'utf8' });
  const names = ['rename-unit', 'change-price', 'clone-unit', 'armor', 'squad', 'all'];
  ok('--sample list names every sample', sl.status === 0 && names.every(k => new RegExp('^' + k + ' ', 'm').test(sl.stdout)), sl.stdout.slice(0, 300));
  const sj = cp.spawnSync(process.execPath, [GEN, '--sample', 'list', '--json'], { encoding: 'utf8' });
  let sjj = null; try { sjj = JSON.parse(sj.stdout); } catch (e) { /* below */ }
  ok('--sample list --json', sjj && names.every(k => sjj.samples.some(s => s.name === k && s.what)), sj.stdout.slice(0, 300));
  ok('--sample armour = armor', cp.spawnSync(process.execPath, [GEN, '--sample', 'armour'], { encoding: 'utf8' }).stdout === fs.readFileSync(path.join(__dirname, '..', 'samples', 'armor.yaml'), 'utf8'));
}
console.log(bad ? bad + ' FAILED' : 'all ok');
process.exit(bad ? 1 : 0);
