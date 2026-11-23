// T-SURFACE front-door commands that are not a tool folder: new, maps, play, advanced. Called from flow.js main (so the exe, which routes
// flow.EXE_OK to flow.main, gets them too). main(argv) -> exit code | null if not ours.
//   new <dir> [--name T] [--desc D] [--deps a,b] [--game G] [--target as64|mowas2|goh] [--dry-run] [-q]: newmod --target <it> (default as64: Min 3.301,
//     no Max; mowas2 3.262.0-3.262.1; goh = the GoH exe version, --game = the GoH install, found through games.install('goh') when not given);
//     folder name made lowercase; goh also refuses a name the GoH mod scan skips (GHVFS-27: byte >= 0x80, space, <>+()[]{}!@#$%^&*-=;:|'")
//   maps list|view|clone|mode [args] [--target T | --exe T]: mission-clone --list | mapview | map-clone (--target as64 unless given) | mission-clone;
//     --game found the normal way (goh: the GoH install). A named game other than as64 reaches the child as: list/view --exe <vfs exe>,
//     clone --target <id>, mode --target <id> --exe <vfs exe>. No game named: the child arguments are as before.
//   play: flow.play (T-PLAY): install + testrun on the test map + bootcheck verdict; instance 0 refused; the game word as in flow.js (MoW:AS2 --dry only,
//     GoH refused).   advanced: the hidden tool list (menu.js ADVANCED)
// Author: Imperator_Aug (ARSENAL, ia-06dba60a)
const path = require('path'), { spawnSync } = require('child_process');
const gamedir = require('../lib/gamedir'), menu = require('./menu'), games = require('../lib/games'), G = require('./game');
const TOOLS = path.join(__dirname, '..');
const CMDS = new Set(['new', 'maps', 'play', 'advanced']);
const MAPS = {   // sub -> [tool, fixed args, what]
  list: ['mission-clone', ['--list'], 'game modes per multiplayer map (all maps, or --map map/multi/<name>)'],
  view: ['mapview', [], 'picture of a map in the terminal: --map multi/<group>/<name>, or a map.net / map folder'],
  clone: ['map-clone', [], 'copy a map under a new name into a mod: --map map/multi/<m> --name <new> --out <mod>'],
  mode: ['mission-clone', [], 'add a game mode to a map: --map map/multi/<m> --from <mode> --to <mode> --out <mod>'],
};
const USAGE = {
  new: 'usage: ARSENAL new <mod folder> [--name "Title"] [--desc "..."] [--deps a,b] [--game G] [--target as64|mowas2|goh] [--dry-run] [-q]\n' +
    '  makes an empty mod. --target picks the game: as64 (default: mod.info MinGameVersion 3.301, no MaxGameVersion), mowas2 (3.262.0 to 3.262.1)\n' +
    '  or goh (the Gates of Hell exe version; --game is the GoH install, found the usual way when not given). The folder name is made lowercase.\n' +
    '  --name defaults to the folder name as you typed it.  e.g. ARSENAL new mymod --name "My Mod"',
  maps: 'usage: ARSENAL maps list|view|clone|mode [args..] [--target as64|mowas2|goh]   (--game G is optional: the game is found the usual way)\n' +
    Object.entries(MAPS).map(([k, [t, , w]]) => `  ${k.padEnd(5)}  ${w}   (= ARSENAL ${t}${k === 'list' ? ' --list' : ''})`).join('\n') +
    '\n  e.g. ARSENAL maps list',
  play: 'usage: ARSENAL play <mod folder> [--map m] [--inst N] [--dry] [--game G] [--exe X] [--target as64|mowas2|goh]\n' +
    '  checks the mod, installs it into the game, starts the game on a test map with it, and says from game.log whether it loaded cleanly (BOOT).\n' +
    '  It uses game instance N (default 1) and never instance 0, your own settings. --dry prints every step and command and changes nothing.\n' +
    '  The game: --target, or --exe (a game word or the exe file), else the mod.info range (3.262 = MoW:AS2), else AS64. MoW:AS2 runs --dry only\n' +
    '  (mowas_2.exe has no control pipe or instances, TST-19); Gates of Hell is refused (no control pipe, no write into its install).\n' +
    '  e.g. ARSENAL play mymod --dry',
  advanced: 'usage: ARSENAL advanced   (lists the tools kept off the front door)',
};
// AS2_DOOR_ECHO=1 (tests): print the child command line instead of running it
const run = (tool, args) => {
  if (process.env.AS2_DOOR_ECHO === '1') { console.log('$ ARSENAL ' + tool + ' ' + args.map(s => (/[\s"]/.test(s) ? '"' + s + '"' : s)).join(' ')); return 0; }
  const r = spawnSync(process.execPath, [path.join(TOOLS, tool, tool + '.js'), ...args], { stdio: 'inherit' });
  if (r.error) { console.error('error: ' + r.error.message); return 2; }
  return r.status == null ? 1 : r.status;
};
// game folder for a child that needs --game: given -> as is; else resolve(); none -> plain text, null
const NOGOH = 'no Gates of Hell folder found. Pass --game "<GoH folder>", or set GOH_GAME, or put as2.json {"goh": "<GoH folder>"} in your mod folder or above it';
function game(args, id) {
  if (args.includes('--game')) return [];
  if (id === 'goh') {
    const r = games.install('goh');
    if (r.dir) return ['--game', r.dir];
    console.error('error: ' + NOGOH);
    return null;
  }
  const g = gamedir.resolve();
  for (const l of g.warn || []) console.error(l);
  if (g.dir) return ['--game', g.dir];
  console.error('error: ' + gamedir.explain(g));
  return null;
}

function newMod(a) {
  const pos = [], rest = [];
  let name = null, target = 'as64';
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--name') { if (i + 1 >= a.length) { console.error('error: --name needs a value'); return 2; } name = a[++i]; }
    else if (a[i] === '--target') {
      if (i + 1 >= a.length) { console.error('error: --target needs a value: as64, mowas2 or goh'); return 2; }
      try { target = G.word(a[++i]); } catch (e) { console.error('error: ' + e.message); return 2; }
    }
    else if (['--desc', '--deps', '--game', '--lang', '--game-version'].includes(a[i])) { if (i + 1 >= a.length) { console.error('error: ' + a[i] + ' needs a value'); return 2; } rest.push(a[i], a[++i]); }
    else if (['--dry-run', '-q'].includes(a[i])) rest.push(a[i]);
    else if (a[i].startsWith('-')) { console.error('error: unknown option ' + a[i] + '\n' + USAGE.new); return 2; }
    else pos.push(a[i]);
  }
  if (pos.length !== 1) { console.error(USAGE.new); return 2; }
  const given = pos[0].replace(/[\\/]+$/, ''), base = path.basename(given), low = base.toLowerCase();
  if (!base || base === '.' || base === '..') { console.error('error: give the new mod folder a name, e.g. ARSENAL new mymod'); return 2; }
  // GX S11/C10: lowercase, spaces to underscores, unsafe characters refused; one plain line says the final name and why
  const cn = require('../newmod/newmod').cleanFolderName(low);
  if (cn.error) { console.error('error: ' + cn.error); return 2; }
  let dir = given;
  if (cn.name !== base) {
    dir = path.join(path.dirname(given), cn.name);
    const why = [low !== base ? 'names are kept lowercase' : '', cn.why ? 'the game cannot list a mod name with spaces, so spaces became underscores' : ''].filter(Boolean).join('; ');
    console.log(`note: the mod folder is "${cn.name}", not "${base}": ${why}`);
  }
  if (target === 'goh') {
    // GHVFS-27 [V] (GoH ): the GoH mod scan skips a folder whose name has a byte >= 0x80, a space or one of <>+[]{}!@#$%^&*-=;:|'"
    const BAD = /[^\x20-\x7e]|[ <>+()[\]{}!@#$%^&*\-=;:|'"]/g, bad = cn.name.match(BAD);
    if (bad) { console.error('error: Gates of Hell skips a mod folder named "' + cn.name + '" (characters ' + [...new Set(bad)].join(' ') + '; GHVFS-27: no space, no -, ASCII letters, digits and _ only). Use e.g. ' + cn.name.replace(BAD, '_')); return 2; }
    if (!rest.includes('--game') && !rest.includes('--game-version')) {
      const r = games.install('goh');
      if (!r.dir) { console.error('error: ' + NOGOH + ' (the GoH mod.info range is the GoH exe version), or pass --game-version V'); return 2; }
      rest.push('--game', r.dir);
    }
  }
  // I-7: never inside a game install, GoH, Workshop (by content, whatever --game says); newmod checks again with the title/desc/deps rules
  { const gi = rest.indexOf('--game'), why = require('../lib/writeguard').refuseWrite(dir, { game: gi >= 0 ? rest[gi + 1] : undefined, purpose: 'make the new mod' }); if (why) { console.error('error: ' + why); return 2; } }
  const what = { as64: 'AS64 mod: MinGameVersion 3.301, no MaxGameVersion', mowas2: 'MoW:AS2 mod: MinGameVersion 3.262.0, MaxGameVersion 3.262.1',
    goh: 'Gates of Hell mod: MinGameVersion and MaxGameVersion = the GoH exe version' }[target];
  console.log(`new: ${dir.replace(/\\/g, '/')}  (${what})`);
  return run('newmod', [dir, '--name', name || base, '--target', target, ...rest]);
}

function maps(a) {
  const sub = a[0], m = MAPS[sub];
  if (!m) { (sub ? console.error : console.log)((sub ? 'error: unknown maps command ' + sub + '\n' : '') + USAGE.maps); return sub ? 2 : 0; }
  let args = a.slice(1);
  if (args.includes('--help') || args.includes('-h')) return run(m[0], ['--help']);
  // the game word: --target or --exe (a game word); taken out of the child's arguments and handed on in the child's own words (header)
  let id = null;
  for (const f of ['--target', '--exe']) {
    const i = args.indexOf(f);
    if (i < 0) continue;
    if (i + 1 >= args.length) { console.error('error: ' + f + ' needs a value: as64, mowas2 or goh'); return 2; }
    let w; try { w = G.word(args[i + 1], f); } catch (e) { console.error('error: ' + e.message); return 2; }
    if (id && id !== w) { console.error('error: --target and --exe name different games'); return 2; }
    id = w; args = args.filter((_, k) => k !== i && k !== i + 1);
  }
  // mapview takes a map.net / folder without a game; it needs --game only with --map
  const g = sub === 'view' && !args.includes('--map') ? [] : game(args, id);
  if (!g) return 2;
  const exe = id && id !== 'as64' ? ['--exe', games.exeOf(id)] : [];
  const extra = sub === 'clone' ? ['--target', id || 'as64'] : sub === 'mode' ? (id ? ['--target', id, ...exe] : []) : exe;
  return run(m[0], [...m[1], ...g, ...extra, ...args]);
}

function main(argv) {
  const cmd = argv[0];
  if (!CMDS.has(cmd)) return null;
  const a = argv.slice(1);
  if (cmd !== 'maps' && (a.includes('--help') || a.includes('-h'))) { console.log(USAGE[cmd]); return 0; }
  if (cmd === 'maps' && (a[0] === '--help' || a[0] === '-h')) { console.log(USAGE.maps); return 0; }
  switch (cmd) {
    case 'new': return newMod(a);
    case 'maps': return maps(a);
    case 'play': {   // flow.js holds the install/modswitch/testrun/bootcheck chain; required here, not at the top (flow requires door)
      const flow = require('./flow');
      try { return flow.play(flow.parse(a)); } catch (e) { console.error('error: ' + e.message); return 2; }
    }
    case 'advanced': menu.printAdvanced(); return 0;
  }
  return null;
}
module.exports = { main, CMDS, USAGE, MAPS };
