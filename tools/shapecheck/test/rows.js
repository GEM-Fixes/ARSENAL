// rows: one regression case row settled [I] by proof shortcut 3 (shape match) or 4 (copy-only), 2026-11-08.
//   node rows.js [--only C07,C16] [--json]      case names = "<row> <what>"; tools/score/itests.json maps row -> this file + case name
// shape rows: run the writing tool (patch-entity / clone-entity / gen) on a real vanilla file into a temp mod, then
//   (1) output passes shapecheck against every vanilla file of its type in the game paks, (2) the tool kept vanilla bytes outside the edit
//   (copy-as-override: diff vs the base is the edited line only), (3) a seeded defect in the same output FAILS (the check can fail).
//   needs the game (lib/gamedir); without it these cases print "skip" and do not count as passed.
// copy-only rows: a mod file at a vanilla key wins over the base pak in lib/vfs (C37 order), loose and in resource.pak, and the
//   type's extension is not in the VFS-06 skip list; seeded: mod not in the list and a .txt copy must NOT win. Runs on a fake game in
//   the OS temp dir (always); keys are read from the real paks when the game is found (else the fixed keys below).
// game install read-only: tools write only into os.tmpdir()/b4rows-*; removed at the end.
// Author: Imperator_Aug (ARSENAL, ia-32c37157)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const sc = require('../shapecheck'), { zip } = require('../../lib/zipwrite'), vfs = require('../../lib/vfs'), pakset = require('../../lib/pakset');
const TOOLS = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null, asJson = argv.includes('--json');
const results = [];
let bad = 0;
const ok = (row, name, c, m) => { results.push({ row, case: name, pass: !!c, msg: m }); if (!asJson) console.log((c ? 'ok   ' : 'FAIL ') + name + (m ? ': ' + m : '')); if (!c) bad++; };
const skip = (row, name, why) => { results.push({ row, case: name, pass: null, msg: why }); if (!asJson) console.log('skip ' + name + ': ' + why); };
const want = row => !only || only.includes(row);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b4rows-'));

let G = null;
try { const r = require('../../lib/gamedir').resolve({}); if (r.dir && fs.existsSync(path.join(r.dir, 'resource'))) G = r.dir; } catch (e) {}

// ---------- vanilla access (one pak index for the run)
let ps = null;
const vanilla = () => ps || (ps = pakset.open(path.join(G, 'resource'), null));
const vread = key => { const e = vanilla().entries.find(e => e.key === key); return e ? pakset.read(e) : null; };
const vkeys = re => vanilla().entries.filter(e => re.test(e.key)).map(e => e.key);
const dbs = new Map();
const dbOf = (type, under) => { const k = type + '|' + under; if (!dbs.has(k)) dbs.set(k, sc.vanillaDb({ game: G }, type, under)); return dbs.get(k); };
const errsOf = (buf, name, type, under) => sc.check(sc.shapeOf(buf, name), dbOf(type, under)).filter(f => f.level === 'error');
const warnsOf = (buf, name, type, under) => sc.check(sc.shapeOf(buf, name), dbOf(type, under)).filter(f => f.level === 'warn');
const lines = b => b.toString('latin1').split(/\r?\n/).map(s => s.replace(/\s+$/, '')).filter(Boolean);
const diffCount = (a, b) => { const x = lines(a), y = lines(b); let n = Math.abs(x.length - y.length); for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) n++; return n; };
const tool = (rel, args) => cp.execFileSync(process.execPath, [path.join(TOOLS, rel), ...args], { cwd: path.join(TOOLS, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// shape case: patch one vanilla file with patch-entity, check shape + bytes kept + seeded defect fails
// c = { row, name, key (pak key), edit: ['--set', 'p=v'], type, under, seed: [regex, replacement], seedCode }
function patchCase(c) {
  if (!want(c.row)) return;
  if (!G) return skip(c.row, c.name, 'game not found');
  const base = vread(c.key);
  if (!base) return ok(c.row, c.name, false, `vanilla ${c.key} missing from the paks (shape reference moved)`);
  const mod = path.join(tmp, c.row + '-' + path.basename(c.key).replace(/\W/g, '_'));
  try { tool('patch-entity/patch-entity.js', [mod, '--game', G, '--file', 'resource/' + c.key, ...c.edit, '-q']); }
  catch (e) { return ok(c.row, c.name, false, 'patch-entity failed: ' + String(e.stderr || e.stdout || e.message).trim().split('\n').pop()); }
  const out = path.join(mod, 'resource', c.key);
  if (!fs.existsSync(out)) return ok(c.row, c.name, false, 'patch-entity wrote no file at ' + c.key);
  const buf = fs.readFileSync(out), e = errsOf(buf, c.key, c.type, c.under), w = warnsOf(buf, c.key, c.type, c.under), d = diffCount(base, buf);
  const bad1 = Buffer.from(buf.toString('latin1').replace(c.seed[0], c.seed[1]), 'latin1');
  const se = errsOf(bad1, c.key, c.type, c.under);
  const seedOk = bad1.compare(buf) !== 0 && se.some(f => f.code === c.seedCode);
  ok(c.row, c.name, e.length === 0 && w.length === 0 && d === 1 && seedOk,
    `${c.key}: shape ${e.length ? 'FAIL ' + e.map(f => f.code + ' ' + f.path).join(', ') : 'PASS'} vs ${dbOf(c.type, c.under).files} vanilla${w.length ? ', ' + w.map(f => f.code).join(',') : ''}; lines changed ${d} (want 1); seeded ${c.seedCode} ${seedOk ? 'fails' : 'NOT caught: ' + se.map(f => f.code).join(',')}`);
}

// ---------- shape rows (shortcut 3)
// C07 fauna + service (jump: 0 vanilla AS2 files, no shape reference; see report)
patchCase({ row: 'C07', name: 'C07 fauna def patch-entity shape', key: 'entity/-fauna/chicken/chicken.def', edit: ['--set', 'game_entity/mass=4'], type: '.def', under: '',
  seed: [/\{mass 4\}/, '{mass "heavy"}'], seedCode: 'SHAPE_KIND' });
patchCase({ row: 'C07', name: 'C07 service def patch-entity shape', key: 'entity/service/flagstaff/flagstaff.def', edit: ['--set', 'game_entity/Volume[0]/Thickness=60'], type: '.def', under: '',
  seed: [/\{Thickness 60\}/, '{Thicknes 60}'], seedCode: 'SHAPE_PATH' });
// C16 set/blow (arity: the multi-value fix keeps 2 values, so no SHAPE_ARITY warn) + set/target selector
patchCase({ row: 'C16', name: 'C16 set/blow patch-entity shape', key: 'set/blow/butt.set', edit: ['--set', 'blow/opponent[0]/damage=70 0.75'], type: '.set', under: 'set/blow/',
  seed: [/\{damage 70 0\.75\}/, '{damage "x" 0.75}'], seedCode: 'SHAPE_KIND' });
patchCase({ row: 'C16', name: 'C16 set/target patch-entity shape', key: 'set/target/tank.inc', edit: ['--set', 'selector/group[1]/sort[0]/class=airborne'], type: '.inc', under: 'set/target/',
  seed: [/\{sort \{class airborne\}\}/, '{sort {klass airborne}}'], seedCode: 'SHAPE_PATH' });
// C28 fireSound route (the wav itself is copy-only below)
patchCase({ row: 'C28', name: 'C28 fireSound patch-entity shape', key: 'set/stuff/gun/88mm_kwk43', edit: ['--set', 'from/fireSound="b4/kwk43"'], type: '', under: 'set/stuff/',
  seed: [/\{fireSound "b4\/kwk43"\}/, '{fireSound 7}'], seedCode: 'SHAPE_KIND' });
// C32 action cursor + menu page (pages: 1 vanilla .set, so the reference is that file itself: weak, see report)
patchCase({ row: 'C32', name: 'C32 action cursor patch-entity shape', key: 'interface/action/advance.set', edit: ['--set', 'action/cursor="move"'], type: '.set', under: 'interface/action/',
  seed: [/\{cursor "move"\}/, '{cursor 7}'], seedCode: 'SHAPE_KIND' });
patchCase({ row: 'C32', name: 'C32 menu page patch-entity shape', key: 'interface/pages/interface.set', edit: ['--set', 'location[0]/background/video="/video/b4"'], type: '.set', under: 'interface/pages/',
  seed: [/\{video "\/video\/b4"\}/, '{vidoe "/video/b4"}'], seedCode: 'SHAPE_PATH' });
// C20 difficulty .dl (one reader for every level file)
patchCase({ row: 'C20', name: 'C20 difficulty .dl patch-entity shape', key: 'set/difficulty/easy.dl', edit: ['--set', 'difficulty/enemy/health=0.40'], type: '.dl', under: '',
  seed: [/\{health 0\.40\}/, '{health "low"}'], seedCode: 'SHAPE_KIND' });

// C08 construction clone: clone-entity def = base def, Extension line only; shape PASS; seeded wrong parent fails
(function c08() {
  const row = 'C08', name = 'C08 construction clone-entity shape';
  if (!want(row)) return;
  if (!G) return skip(row, name, 'game not found');
  const key = 'entity/construction/africa/decor/alg_tent_1m/alg_tent_1m.def', base = vread(key);
  if (!base) return ok(row, name, false, 'vanilla ' + key + ' missing');
  const mod = path.join(tmp, 'C08');
  try { tool('clone-entity/clone-entity.js', ['--game', G, '--out', mod, '--entity', 'alg_tent_1m', '--as', 'b4_tent', '-q']); }
  catch (e) { return ok(row, name, false, 'clone-entity failed: ' + String(e.stderr || e.stdout || e.message).trim().split('\n').pop()); }
  const out = path.join(mod, 'resource/entity/construction/africa/decor/b4_tent/b4_tent.def');
  if (!fs.existsSync(out)) return ok(row, name, false, 'no clone def written');
  const buf = fs.readFileSync(out), e = errsOf(buf, out, '.def', ''), x = lines(base), y = lines(buf);
  const changed = y.filter((l, i) => l !== x[i]), extOnly = x.length === y.length && changed.length === 1 && /^\s*\{Extension "\/entity\/construction\/.*alg_tent_1m\.mdl"\}$/.test(changed[0]);
  const bad1 = Buffer.from(buf.toString('latin1').replace(/\{Extension /, '{volume "b4" {Extension "x.mdl"}}\r\n\t{Extension '), 'latin1');
  const se = errsOf(bad1, out, '.def', ''), seedOk = se.some(f => f.code === 'SHAPE_PARENT');
  ok(row, name, !e.length && extOnly && seedOk, `shape ${e.length ? 'FAIL ' + e.map(f => f.code).join(',') : 'PASS'} vs ${dbOf('.def', '').files} vanilla .def; base kept except Extension: ${extOnly} (${changed.length} changed); seeded SHAPE_PARENT ${seedOk ? 'fails' : 'NOT caught'}`);
})();

// C05 squad card by gen: squads.set + soldiers.set (set/multiplayer/units), breed .set; bot.data.lua not shape-checked (Lua, as C13)
(function c05() {
  const row = 'C05', name = 'C05 gen squad card shape';
  if (!want(row)) return;
  if (!G) return skip(row, name, 'game not found');
  const spec = path.join(tmp, 'c05.json'), mod = path.join(tmp, 'b4sq');
  fs.writeFileSync(spec, JSON.stringify({ name: 'b4sq', title: 'B4 squad card', deps: ['as64+'], target: 'as64', ops: [
    { op: 'breed', name: 'b4rifle', army: 'usa', like: 'rifle2' },
    { op: 'squad', name: 'b4sq', army: 'usa', like: 'smgs', members: ['squadleader2:1', 'b4rifle:7'], fields: { cost: '113' }, display: 'B4 Squad', info: 'B4 squad info', bots: true }] }));
  try { tool('gen/gen.js', [spec, '--game', G, '--out', mod]); }
  catch (e) { return ok(row, name, false, 'gen failed: ' + String(e.stderr || e.stdout || e.message).trim().split('\n').pop()); }
  const files = [['resource/set/multiplayer/units/squads.set', 'set/multiplayer/units/'], ['resource/set/multiplayer/units/soldiers.set', 'set/multiplayer/units/'], ['resource/set/breed/mp/usa/b4rifle.set', 'set/breed/']];
  const msg = [];
  let all = true;
  for (const [rel, under] of files) {
    const f = path.join(mod, rel);
    if (!fs.existsSync(f)) { all = false; msg.push(rel + ' missing'); continue; }
    const e = errsOf(fs.readFileSync(f), f, '.set', under);
    if (e.length) { all = false; msg.push(path.basename(rel) + ' ' + e.map(x => x.code + ' ' + x.path).join(',')); } else msg.push(path.basename(rel) + ' PASS');
  }
  // gen's card lines are macro calls ("squad_with2types" ... / ("rifle" side(usa))): shapecheck does not expand macros, so check each
  // macro the new lines call is defined in that file (a renamed or missing vanilla macro = card silently not built)
  const undefCalls = t => { const defs = new Set([...t.matchAll(/\(define\s+"([^"]+)"/g)].map(m => m[1])), out = [];
    for (const l of t.split(/\r?\n/)) if (/b4sq|b4rifle/.test(l)) for (const m of l.matchAll(/\(\s*"([^"]+)"/g)) if (!defs.has(m[1])) out.push(m[1]);
    return out; };
  let macroOk = true, seedOk = false, seedMacro = false;
  for (const [rel] of files.slice(0, 2)) {
    const f = path.join(mod, rel);
    if (!fs.existsSync(f)) { macroOk = false; continue; }
    const t = fs.readFileSync(f, 'latin1'), u = undefCalls(t), calls = t.split(/\r?\n/).filter(l => /b4sq|b4rifle/.test(l) && /\(\s*"/.test(l)).length;
    if (u.length || !calls) { macroOk = false; msg.push(path.basename(rel) + (calls ? ' undefined macro ' + u.join(',') : ' no card line')); }
  }
  const sq = path.join(mod, files[0][0]);
  if (fs.existsSync(sq)) {
    const t = fs.readFileSync(sq, 'latin1');
    const bad1 = Buffer.from(t.replace(/\r?\n(\("squad_with\w+" side\(usa\) name\(b4sq\))/, '\r\n{nosuchkey 1}\r\n$1'), 'latin1');
    seedOk = bad1.toString('latin1') !== t && errsOf(bad1, sq, '.set', files[0][1]).some(f => f.code === 'SHAPE_PATH');
    const bad2 = t.replace(/\("squad_with(\w+)" side\(usa\) name\(b4sq\)/, '("squad_nosuch$1" side(usa) name(b4sq)');
    seedMacro = bad2 !== t && undefCalls(bad2).length > 0;
  }
  ok(row, name, all && macroOk && seedOk && seedMacro, msg.join('; ') + `; card macros defined ${macroOk}; seeded unknown key ${seedOk ? 'fails' : 'NOT caught'}, seeded undefined macro ${seedMacro ? 'fails' : 'NOT caught'}`);
})();

// ---------- copy-only rows (shortcut 4): vfs wins on a fake game
const COPY = [
  { row: 'C26', name: 'C26 shader copy wins in vfs', re: /^shader\/.*\.(hlsl|pso|vso)$/, keys: ['shader/dx10/occlusion.hlsl'] },
  { row: 'C27', name: 'C27 video copy wins in vfs', re: /^video\/.*\.avi$/, keys: ['video/menu.avi'] },
  { row: 'C28', name: 'C28 sound wav copy wins in vfs', re: /^sound\/weapon\/.*\.wav$/, keys: ['sound/weapon/shot/gun/85to100_cal/88mm_kwk43.wav'], extra: ['sound/weapon/shot/b4/kwk43.wav'] },
  { row: 'C29', name: 'C29 voice copy wins in vfs', re: /^(set\/talk\/.*\.set|sound\/(human|mission)\/.*\.wav)$/, keys: ['set/talk/human/idle.set', 'sound/human/blow/00.wav'] },
  { row: 'C30', name: 'C30 music copy wins in vfs', re: /^music\/.*\.mp3$/, keys: ['music/loading_theme.mp3'] },
  { row: 'C32', name: 'C32 font+cursor copy wins in vfs', re: /^interface\/(font|cursor|skin)\/.*\.(font|fnt|ebm|tga)$/, keys: ['interface/font/arial_hq_10.font', 'interface/font/arial_hq_10.fnt', 'interface/cursor/add.ebm', 'interface/cursor/add.tga'] },
];
(function copyOnly() {
  const todo = COPY.filter(c => want(c.row));
  if (!todo.length) return;
  // live: real keys of each type present + their extensions not skipped; pick up to 3 real keys per row (one per extension)
  for (const c of todo) {
    if (!G) { c.live = 'game not found, fixed keys'; continue; }
    const ks = vkeys(c.re);
    const exts = [...new Set(ks.map(k => path.extname(k)))], skipped = exts.filter(x => vfs.SKIP_EXT.has(x));
    const byExt = new Map(); for (const k of ks) if (!byExt.has(path.extname(k))) byExt.set(path.extname(k), k);
    const fixedThere = c.keys.filter(k => ks.includes(k));
    c.keys = [...new Set([...fixedThere, ...byExt.values()])].slice(0, 4);
    c.live = `${ks.length} vanilla keys, exts ${exts.join(' ') || '-'}${skipped.length ? ', SKIPPED ' + skipped.join(' ') : ''}`;
    c.liveBad = !ks.length || skipped.length > 0;
  }
  const game = path.join(tmp, 'fakegame'), w = (rel, data) => { const p = path.join(game, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
  const info = '{Mod\r\n {Name "x"}\r\n {MinGameVersion "3.262"}\r\n {MaxGameVersion "3.262"}\r\n}\r\n', B = s => Buffer.from(s, 'latin1');
  const all = [...new Set(todo.flatMap(c => c.keys))];
  w('resource/base.pak', zip(all.map(k => [k, B('base ' + k)])));
  w('mods/b4loose/mod.info', info); w('mods/b4pak/mod.info', info); w('mods/b4txt/mod.info', info);
  for (const k of all) w('mods/b4loose/resource/' + k, B('mod ' + k));
  for (const c of todo) for (const k of c.extra || []) w('mods/b4loose/resource/' + k, B('mod ' + k));
  w('mods/b4pak/resource.pak', zip(all.map(k => [k, B('pakmod ' + k)])));
  for (const k of all) w('mods/b4txt/resource/' + k.replace(/\.[^./]+$/, '.txt'), B('txt'));
  const build = mods => vfs.build({ gameDir: game, mods, exe: 'mowas_2' });
  const vL = build(['b4loose']), vP = build(['b4pak']), v0 = build([]), vT = build(['b4txt']);
  const wins = (v, k, layer) => { const r = v.files.get('resource/' + k); return !!r && r.layer === layer && v.chain('resource/' + k).some(x => x.layer === 'base'); };
  for (const c of todo) {
    const loose = c.keys.every(k => wins(vL, k, 'b4loose')), pk = c.keys.every(k => wins(vP, k, 'b4pak'));
    const extra = (c.extra || []).every(k => vL.files.has('resource/' + k) && vL.files.get('resource/' + k).layer === 'b4loose');
    const seedOff = c.keys.every(k => !wins(v0, k, 'b4loose')), seedTxt = c.keys.every(k => !wins(vT, k, 'b4txt') && vT.files.get('resource/' + k).layer === 'base');
    ok(c.row, c.name, loose && pk && extra && seedOff && seedTxt && !c.liveBad,
      `${c.keys.join(' ')}: loose ${loose}, resource.pak ${pk}${c.extra ? ', mod-only key indexed ' + extra : ''}; seeded mod-off loses ${seedOff}, .txt copy loses ${seedTxt}; live: ${c.live}`);
  }
})();

if (ps) ps.close();
fs.rmSync(tmp, { recursive: true, force: true });
const pass = results.filter(r => r.pass === true).length, skipped = results.filter(r => r.pass === null).length;
if (asJson) console.log(JSON.stringify({ results, pass, fail: bad, skip: skipped }, null, 1));
else console.log(bad ? `FAIL ${bad}` : `PASS ${pass} cases${skipped ? `, ${skipped} skipped (no game)` : ''}`);
process.exitCode = bad ? 1 : 0;
