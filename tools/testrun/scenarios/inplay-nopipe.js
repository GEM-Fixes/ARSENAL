// in-play proof on exes with no control pipe: a mission override fires `con` markers into game.log
//   node tools/testrun/scenarios/inplay-nopipe.js --target goh|mowas2 --game <install> --case route|clone|fake [--secs 240] [--hold 45]
// goh    = release exe, tools/uidrive skirmish route (takes the screen + input), default map multi/2v2_gelid:battle_zones
// mowas2 = mowas_2_ed.exe -game: editor build, label its pass. clone needs mkclone-play.js run first
// pass: route = E2EMARK route. clone = E2EMARK seen (packed clone placed + tagged). fake = can't spawn + no seen (control)
// writes only to the approved test folder and restores it + options.set. game must be closed. exit 0 pass, 1 fail, 2 usage
// Author: Imperator_Aug (ARSENAL, ia-5d94a8c0)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const HERE = __dirname, R = path.join(HERE, '..', '..', '..');
const pak = require(path.join(R, 'tools/lib/pak.js')), userdir = require(path.join(R, 'tools/lib/userdir.js'));
const opt = k => { const i = process.argv.indexOf('--' + k); return i < 0 ? null : process.argv[i + 1]; };
const target = opt('target'), G = opt('game'), kase = opt('case'), SECS = +(opt('secs') || 240), HOLD = +(opt('hold') || 45);
if (!['goh', 'mowas2'].includes(target) || !G || !['route', 'clone', 'fake'].includes(kase)) { console.error('usage: inplay-nopipe.js --target goh|mowas2 --game <install> --case route|clone|fake'); process.exit(2); }
const platform = require(path.join(R, 'tools/lib/platform.js'));
platform.requireWin('the in-play test on the game (inplay-nopipe)');   // starts the game exe and drives its window
const GOH = target === 'goh';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const crlf = s => s.replace(/\r?\n/g, '\r\n');
const n = x => String(x.name || x.path || x.file || x).split('\\').join('/');

function firstProfile(dir) {
  const id = fs.readdirSync(dir).find(x => fs.existsSync(path.join(dir, x, 'options.set')));
  if (!id) throw new Error('no profile with options.set in ' + dir);
  return path.join(dir, id, 'options.set');
}
const USER = (GOH ? userdir.gohUserDir() : userdir.userDir(0)) || (() => { throw new Error('no ' + (GOH ? 'Gates of Hell' : 'game') + ' user folder found: ' + (GOH ? userdir.gohFind() : userdir.find(0)).why); })();
const PROF = firstProfile(path.join(USER, 'profiles')), LOG = path.join(USER, 'log/game.log');
const T = GOH
  ? { stage: 'e2e_test', map: 'multi/2v2_gelid', mission: 'battle_zones', pak: 'resource/map/multi.pak', prefix: '', clone: 'e2e_v_goh', at: '{Entity "', pos: /\{Position (-?[\d.]+) (-?[\d.]+)\}/,
      modinfo: '; test folder for tools/modmove, safe to delete\n{mod\n\t{name "e2e_test"}\n\t{desc "Test folder for the modding pipeline."}\n\t{minGameVersion "1.067"}\n}\n' }
  : { stage: 'e2e_test7', map: 'multi/1v1_road', mission: 'combat', pak: 'resource/map.pak', prefix: 'map/', clone: 'e2e_v_rus', at: '{Entity "map_point"', pos: /\{Entity "map_point" 0x\w+\s*\{Position (-?[\d.]+) (-?[\d.]+)\}/,
      modinfo: '{Mod\n\t{Name "trs ed"}\n\t{MinGameVersion "3.262"}\n\t{MaxGameVersion "3.262"}\n}\n' };
const SD = path.join(G, 'mods', T.stage);

function stockMission() {
  const e = pak.list(path.join(G, T.pak)), want = `${T.prefix}${T.map}/${T.mission}.mi`.toLowerCase();
  const f = e.find(x => n(x).toLowerCase() === want);
  if (!f) throw new Error('not in pak: ' + want);
  return Buffer.from(pak.read(e, f)).toString('latin1');
}
function mission(entity) {
  let t = stockMission();
  if (!t.includes('{triggers')) throw new Error('mission has no triggers block');
  t = t.replace('{triggers', `{triggers
	{"e2e_route" {condition} {actions {"con" {text "E2EMARK route"}}}}
	{"e2e_seen" {condition {terms {"1.entities" {selector {tag e2e_v}} {count {op "=="} {value 1}}}}} {actions {"con" {text "E2EMARK seen"}}}}
`);
  if (entity) {
    const p = t.match(T.pos);
    if (!p) throw new Error('no position to borrow');
    t = t.replace(T.at, `{Entity "${entity}" 0xe2e0\n\t\t{Position ${p[1]} ${p[2]}}\n\t\t{Player 1}\n\t}\n\t{Tags "e2e_v" 0xe2e0}\n\t${T.at}`);
  }
  return t;
}
function clonePaks(tmp) {
  if (!GOH) {
    const d = path.join(HERE, 'mods/clone-play/resource');
    if (!fs.existsSync(d)) throw new Error('run mkclone-play.js --game <install> first');
    return d;
  }
  const src = path.join(tmp, 'src'), out = path.join(tmp, 'pak');
  fs.mkdirSync(src); fs.mkdirSync(out);
  let r = cp.spawnSync(process.execPath, [path.join(R, 'tools/clone-entity/clone-entity.js'), '--game', G, '--out', src, '--entity', 'gaz67b', '--as', T.clone, '--name', 'E2E'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('clone-entity: ' + r.stderr);
  r = cp.spawnSync(process.execPath, [path.join(R, 'tools/packer/packer.js'), src, '--out', out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('packer: ' + r.stderr);
  return out;
}
function stage(tmp) {
  fs.rmSync(SD, { recursive: true, force: true });
  fs.mkdirSync(path.join(SD, 'resource/map', T.map), { recursive: true });
  fs.writeFileSync(path.join(SD, 'mod.info'), crlf(T.modinfo));
  if (kase === 'clone') { const d = clonePaks(tmp); for (const f of fs.readdirSync(d)) if (/\.pak$/i.test(f)) fs.copyFileSync(path.join(d, f), path.join(SD, 'resource', f)); }
  const ent = kase === 'clone' ? T.clone : kase === 'fake' ? 'e2e_no_such_entity' : null;
  fs.writeFileSync(path.join(SD, 'resource/map', T.map, T.mission + '.mi'), crlf(mission(ent)), 'latin1');
}
function drive(routes) {
  const x = cp.spawnSync(process.execPath, [path.join(R, 'tools/uidrive/uidrive.js'), 'play', 'goh', routes], { encoding: 'utf8', cwd: R, timeout: 900000, env: { ...process.env, GOH_GAME: G } });
  console.log(routes, 'status', x.status, (x.stdout + x.stderr).trim().split('\n').slice(-1)[0].slice(0, 200));
  return x.status;
}
async function runGoh() {
  if (drive('boot,skirmish') === 0) { await sleep(HOLD * 1000); drive('leave_match,close_session,exit_sub'); }
  const still = (platform.processList() || []).find(x => x.name.toLowerCase() === 'call_to_arms.exe');
  if (still) { platform.killPid(still.pid); console.log('killed leftover'); await sleep(5000); }
}
async function runEd() {
  const before = fs.existsSync(LOG) ? fs.statSync(LOG).mtimeMs : 0;
  const p = cp.spawn(path.join(G, 'mowas_2_ed.exe'), ['-game', `${T.map}:${T.mission}`], { cwd: G, detached: true, stdio: 'ignore' });
  let died = null; p.on('exit', c => { died = c; }); p.on('error', () => { died = -1; });
  const t0 = Date.now(), want = kase === 'clone' ? /E2EMARK seen/ : /E2EMARK route/;
  while (Date.now() - t0 < SECS * 1000 && died === null) {
    await sleep(5000);
    if (fs.existsSync(LOG) && fs.statSync(LOG).mtimeMs !== before && want.test(fs.readFileSync(LOG, 'latin1'))) { await sleep(kase === 'clone' ? 0 : 20000); break; }
  }
  await sleep(4000);
  if (died === null) platform.killPid(p.pid); // _ed has no scripted exit: log is read after a kill
  await sleep(4000);
}
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inplay-')), orig = path.join(tmp, 'stage-orig');
  const hadStage = fs.existsSync(SD);
  if (hadStage) fs.cpSync(SD, orig, { recursive: true });
  const options = fs.readFileSync(PROF);
  let code = 1;
  try {
    stage(tmp);
    const sw = cp.spawnSync(process.execPath, [path.join(R, 'tools/modswitch/modswitch.js'), '--game', G, '--profile', PROF, '--set', T.stage, '--write', '--force'], { encoding: 'utf8' });
    if (sw.status !== 0) throw new Error('modswitch: ' + sw.stdout + sw.stderr);
    await (GOH ? runGoh() : runEd());
    const log = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'latin1') : '';
    const r = { target, case: kase, route: /E2EMARK route/.test(log), seen: /E2EMARK seen/.test(log), cantSpawn: /can't spawn entity[^\r\n]*/.exec(log)?.[0] || '', exception: /\*{5,} Exception/.test(log) };
    const pass = kase === 'route' ? r.route : kase === 'clone' ? r.route && r.seen && !r.cantSpawn : r.route && !r.seen && !!r.cantSpawn;
    console.log(JSON.stringify({ ...r, verdict: pass ? 'PASS' : 'FAIL' }));
    code = pass ? 0 : 1;
  } finally {
    fs.writeFileSync(PROF, options);
    fs.rmSync(SD, { recursive: true, force: true });
    if (hadStage) fs.cpSync(orig, SD, { recursive: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(code);
})().catch(e => { console.error(e.message); process.exit(1); });
