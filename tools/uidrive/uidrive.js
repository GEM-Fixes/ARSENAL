#!/usr/bin/env node
// uidrive: drive a game that has no control pipe (GoH) from recorded inputs. each step waits on new game.log lines: no screen reads needed.
// usage: uidrive routes <map> | uidrive where <map> [--game dir] | uidrive play <map> <route>[,<route>...] [--dry] [--game dir] | uidrive shot <map> <out.png>
//        | uidrive click <map> X Y | uidrive rclick <map> X Y | uidrive key <map> NAME
// map = routes/<name>.json or a path. input only reaches the map's own window (lib/win.ps1 refuses otherwise). enabling mods needs no input: modswitch writes {mods}.
// map "game": the lib/games id the map drives ('goh' | 'mowas2'; a map without it is goh, as before). It picks the install and the user dir:
//   %GAME% = --game dir, else goh: GOH_GAME or the GoH install (lib/games install 'goh'); mowas2: AS2_GAME or the AS2 install (gamedir.resolve)
//   %USER% = the game's user dir (lib/userdir): goh gohUserDir (Documents/My Games/Gates of Hell, or LocalAppData when Documents is on
//     OneDrive, GHVFS-13 / LOG-22); mowas2 userDir(0) (<Documents>/my games/men of war - assault squad 2, OneDrive Documents too)
//   %HOME% = the home folder. A map whose %GAME% or %USER% cannot be found stops with a plain line naming what is missing.
// where: prints the map's game, exe path and log path as they expand here (reads nothing else, starts nothing).
// Author: Imperator_Aug (ARSENAL, ia-9714db4a)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadMap(name) {
  const f = fs.existsSync(name) ? name : path.join(__dirname, 'routes', name + '.json');
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const k of ['proc', 'exe', 'log', 'base', 'routes']) if (m[k] === undefined) throw new Error(`${f}: no "${k}"`);
  const games = require('../lib/games'), g = games.get(m.game || 'goh');
  // an AS64 map is kind (c) here: one plain line, exit 2 (main); a bad game word stays a malformed map (exit 1)
  if (g && g.id === 'as64') throw Object.assign(new Error(games.notFor('uidrive', 'as64', 'AS64 is driven through its control pipe (testrun), not by window input', 'TST-17')), { exitCode: 2, plain: true });
  if (!g) throw new Error(`${f}: "game" must be goh or mowas2`);
  m.game = g.id;
  return m;
}
// the install and the user dir of a map's game; opt.gameDir (--game), opt.env, opt.install(id), opt.userDir(id) are seams for tests
function gameDirOf(game, opt = {}) {
  const env = opt.env || process.env;
  if (opt.gameDir) return opt.gameDir;
  if (game === 'goh') return env.GOH_GAME || (opt.install || (id => require('../lib/games').install(id).dir))('goh');
  return env.AS2_GAME || (opt.install || (id => require('../lib/games').install(id).dir))(game);
}
function userDirOf(game, opt = {}) {
  if (opt.userDir) return opt.userDir(game);
  const ud = require('../lib/userdir'), r = game === 'goh' ? ud.gohFind() : ud.find(0);
  if (!r.dir) throw new Error(`no ${game === 'goh' ? 'Gates of Hell' : 'MoW:AS2'} user folder: ${r.why}`);
  return r.dir;
}
// %GAME% %USER% %HOME% %VAR%; game = the map's game (default goh: the old rule, GOH_GAME or the GoH install)
function expand(s, env = process.env, game = 'goh', opt = {}) {
  return s.replace(/%(\w+)%/g, (_, v) => {
    if (v === 'GAME') { const d = gameDirOf(game, { ...opt, env }); if (!d) throw new Error(`no ${game === 'goh' ? 'Gates of Hell' : 'MoW:AS2'} install found: name it with --game`); return d; }
    if (v === 'USER') return userDirOf(game, opt);
    return v === 'HOME' ? os.homedir() : env[v] || '';
  });
}
// recorded at map.base; menus assumed to scale with the client rect [I]: only 1920x1080 replayed
const scale = (xy, base, size) => [Math.round(xy[0] * size.w / base[0]), Math.round(xy[1] * size.h / base[1])];

// log reader: only lines after the offset, offset falls to 0 when the game restarts the file
class LogWatch {
  constructor(file) { this.file = file; this.off = this.size(); this.partial = ''; }
  size() { try { return fs.statSync(this.file).size; } catch { return 0; } }
  mark() { this.off = this.size(); this.partial = ''; }
  read() {
    const s = this.size();
    if (s < this.off) { this.off = 0; this.partial = ''; }
    if (s === this.off) return [];
    const fd = fs.openSync(this.file, 'r'), b = Buffer.alloc(s - this.off);
    fs.readSync(fd, b, 0, b.length, this.off); fs.closeSync(fd);
    this.off = s;
    const L = (this.partial + b.toString('latin1')).split(/\r?\n/);
    this.partial = L.pop();
    return L;
  }
  async wait(re, timeoutS, alive) {
    const rx = new RegExp(re), t0 = Date.now();
    for (;;) {
      for (const l of this.read()) if (rx.test(l)) return { line: l, s: (Date.now() - t0) / 1000 };
      if (alive && !alive()) throw new Error(`process gone while waiting for /${re}/`);
      if (Date.now() - t0 > timeoutS * 1000) throw new Error(`no /${re}/ in ${timeoutS}s`);
      await sleep(250);
    }
  }
}

const running = proc => cp.execFileSync('tasklist', ['/FI', `IMAGENAME eq ${proc}.exe`, '/NH'], { encoding: 'latin1' }).toLowerCase().includes(proc.toLowerCase());
function win(proc, op, a = {}) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'lib', 'win.ps1'), '-ProcName', proc, '-Op', op];
  for (const k of ['X', 'Y', 'Key', 'Out']) if (a[k] !== undefined) args.push('-' + k, String(a[k]));
  const r = cp.spawnSync('powershell', args, { encoding: 'latin1' });
  let j; try { j = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { throw new Error(`win.ps1 ${op}: ${(r.stdout + r.stderr).trim().slice(0, 200)}`); }
  if (!j.ok) throw new Error(`win.ps1 ${op}: ${j.why}`);
  return j;
}

// one step: launch | click [x,y] | rclick [x,y] | key name | wheel [x,y,notches] | wait_log re | wait_exit, then optional expect re. fail fast on the first miss.
async function step(st, m, io) {
  const timeout = st.timeout || m.timeout || 30;
  if (st.expect || st.wait_log) io.log.mark();
  if (st.launch) {
    if (io.running()) throw new Error(`${m.proc} already running: refused`);
    io.log.mark(); io.launch();
  }
  else if (st.click) { await sleep(st.settleMs ?? m.settleMs ?? 0); const [X, Y] = scale(st.click, m.base, io.size()); io.win('click', { X, Y }); }
  else if (st.rclick) { await sleep(st.settleMs ?? m.settleMs ?? 0); const [X, Y] = scale(st.rclick, m.base, io.size()); io.win('rclick', { X, Y }); }
  else if (st.key) { await sleep(m.settleMs || 0); io.win('key', { Key: st.key }); }
  else if (st.wheel) { const [X, Y] = scale(st.wheel, m.base, io.size()); io.win('wheel', { X, Y, Key: st.wheel[2] }); }
  const re = st.expect || st.wait_log;
  let got = null;
  if (re) got = await io.log.wait(re, timeout, st.launch ? null : io.running);
  if (st.wait_exit) {
    const t0 = Date.now();
    while (io.running()) { if (Date.now() - t0 > timeout * 1000) throw new Error(`still running after ${timeout}s`); await sleep(500); }
  }
  return got;
}

async function play(m, names, io, say = console.log) {
  for (const name of names) {
    const route = m.routes[name];
    if (!route) throw new Error(`no route "${name}" (have ${Object.keys(m.routes).join(' ')})`);
    for (let i = 0; i < route.length; i++) {
      const st = route[i], what = `${name}[${i}] ${st.note || Object.keys(st)[0]}`;
      try {
        const got = await step(st, m, io);
        say(`ok ${what}${got ? ` (${got.s.toFixed(1)}s)` : ''}`);
      } catch (e) { throw new Error(`${what}: ${e.message}`); }
    }
  }
}

function realIo(m, opt = {}) {
  const logf = expand(m.log, process.env, m.game, opt), exe = expand(m.exe, process.env, m.game, opt);
  let size = null;
  return {
    log: new LogWatch(logf),
    running: () => running(m.proc),
    launch: () => { const ev = require('../lib/exever').check(exe); console.log(`exe ${ev.name} ${ev.short}${ev.known ? '' : ' NEW BUILD: append a row to modweb/porting/exe-versions.md'}`); cp.spawn(exe, [], { cwd: path.dirname(exe), stdio: 'ignore', detached: true }).unref(); },
    size: () => { if (!size) { const j = win(m.proc, 'info'); size = { w: j.w, h: j.h }; } return size; },
    win: (op, a) => win(m.proc, op, a),
  };
}

async function main(argv) {
  const [cmd, mapName, ...rest0] = argv;
  if (!cmd || !mapName) { console.error('usage: uidrive routes|where|play|shot|click|rclick|key <map> ...'); return 2; }
  const gi = rest0.indexOf('--game'), opt = {};
  if (gi >= 0) { opt.gameDir = rest0[gi + 1]; if (!opt.gameDir) { console.error('--game needs a folder'); return 2; } rest0.splice(gi, 2); }
  const rest = rest0;
  const m = loadMap(mapName);
  if (cmd === 'where') { console.log(`game ${m.game}\nexe ${expand(m.exe, process.env, m.game, opt)}\nlog ${expand(m.log, process.env, m.game, opt)}`); return 0; }
  if (cmd === 'routes') { for (const [k, v] of Object.entries(m.routes)) console.log(`${k}: ${v.length} steps | ${v.map(s => s.note || Object.keys(s)[0]).join(' > ')}`); return 0; }
  // window input and screenshots go through PowerShell (lib/win.ps1) and the game is started directly: Windows only
  const platform = require('../lib/platform');
  if (['play', 'shot', 'click', 'rclick', 'key'].includes(cmd) && !(cmd === 'play' && rest.includes('--dry')) && !platform.isWin()) { console.error(platform.unsupported('driving the game window (uidrive)').message); return 2; }
  if (cmd === 'play') {
    const names = String(rest[0] || '').split(',').filter(Boolean);
    if (!names.length) { console.error('name a route'); return 2; }
    if (rest.includes('--dry')) { for (const n of names) { if (!m.routes[n]) throw new Error('no route ' + n); m.routes[n].forEach((s, i) => console.log(`${n}[${i}] ${JSON.stringify(s)}`)); } return 0; }
    await play(m, names, realIo(m, opt));
    return 0;
  }
  if (cmd === 'shot') { console.log(JSON.stringify(win(m.proc, 'shot', { Out: path.resolve(rest[0]) }))); return 0; }
  if (cmd === 'click') { console.log(JSON.stringify(win(m.proc, 'click', { X: rest[0], Y: rest[1] }))); return 0; }
  if (cmd === 'rclick') { console.log(JSON.stringify(win(m.proc, 'rclick', { X: rest[0], Y: rest[1] }))); return 0; }
  if (cmd === 'key') { console.log(JSON.stringify(win(m.proc, 'key', { Key: rest[0] }))); return 0; }
  console.error('unknown command ' + cmd); return 2;
}

if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c), e => { console.error(e.plain ? e.message : 'FAIL ' + e.message); process.exit(e.exitCode || 1); });
module.exports = { loadMap, expand, gameDirOf, userDirOf, scale, LogWatch, step, play };
