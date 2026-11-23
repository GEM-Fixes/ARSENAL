// `ARSENAL help` text (`as2` = alias), shared by node as2 (as2.js) and the single exe (dist/sea-main.js) so the two cannot drift
// stopped: kept in the repo, still run when named, listed only by `ARSENAL --all`
// Author: Imperator_Aug (ARSENAL, ia-21eb16c3)
const STOPPED = new Set(['rows2scn', 'dist', 'spotsheet', 'rows']);
// the live path, in order, one line each: what goes in -> what comes out
const MAIN = [
  ['upgrade', 'mod -> AS64, MoW:AS2 or GoH (--to): --plan = what would change; --out dir = upgraded copy (source never written)'],
  ['check', 'mod folder (anywhere; --with <patch> = source + patch) -> findings by severity + a verdict per exe (static, not run)'],
  ['fix', 'mod -> plan|apply --out dir: a patch mod with lng / reference fixes (undo = delete dir)'],
  ['gen', 'spec.yaml|json --target as64|mowas2|goh -> new mod content in --out dir (--plan = preview)'],
  ['release-check', 'a game update -> new baseline, draft upgrade rows (--promote file) and what they hit (--replan mods)'],
  ['lng', 'mod -> extract: translation table .tsv | merge: filled .tsv -> localization patch folder'],
  ['map-clone', 'vanilla multiplayer map -> new map as a mod folder for the chosen exe'],
  ['botrecipe', 'mod -> patched copy of its bot.lua with the known bot fixes in --out (--dry-run = list only)'],
];
// T-SURFACE: the front door "Front door"): exactly these commands, one line each + one example. [name, what, example]
const DOOR = [
  ['new', 'make an empty mod folder (AS64 by default, --target mowas2|goh; lowercase folder name)', 'ARSENAL new mymod --name "My Mod"'],
  ['gen', 'make mod content (units, text, settings) from a spec file', 'ARSENAL gen spec.yaml --target as64 --out mymod   (a sample spec: ARSENAL gen --sample)'],
  ['check', 'read a mod and say whether it would load, crash or be refused (does not start the game)', 'ARSENAL check mymod   (--exe as64,mowas2,goh: which games)'],
  ['fix', 'plan or write a patch mod that fixes text and reference errors check found', 'ARSENAL fix mymod plan'],
  ['upgrade', 'bring an older mod up to AS64, or port it to MoW:AS2 or GoH; the source is never written', 'ARSENAL upgrade oldmod --to as64 --plan   (--to mowas2|goh)'],
  ['install', 'copy (or link) a mod folder into the game\'s mods folder (AS64 and MoW:AS2)', 'ARSENAL install mymod'],
  ['uninstall', 'remove a mod that ARSENAL install put there', 'ARSENAL uninstall mymod --yes'],
  ['play', 'install a mod and start a test match, then say if it loaded cleanly (AS64; MoW:AS2 --dry)', 'ARSENAL play mymod --dry'],
  ['maps', 'multiplayer maps: list, view, clone, add a game mode', 'ARSENAL maps list'],
];
// the one game word of the front door (game parity): printed under HEAD
const GAMEWORD = 'games: AS64 (as64, the default), MoW:AS2 (mowas2) and Gates of Hell (goh). Name the game with --target <game> on every\n' +
  'command (check: --exe as64,mowas2,goh; upgrade: --to). AS64 and MoW:AS2 share one install; GoH has its own (ARSENAL game --kind goh).';
const FRONT = DOOR.map(d => d[0]);
// PLAN "Hidden behind ARSENAL advanced": still callable by name; [name, what]
const ADVANCED = [
  ['goh2as2', 'port a Gates of Hell unit to AS64 or MoW:AS2 (family: donorfit donorpick portfix artport helmetport as2togoh)'],
  ['donorfit', 'check a donor .def against a model: bones, doors, crew seats'],
  ['donorpick', 'pick the vanilla donor unit for a Gates of Hell unit'],
  ['portfix', 'whole-mod repairs after a port replaced vanilla files'],
  ['artport', 'Gates of Hell icons and portraits into a mod folder'],
  ['helmetport', 'Gates of Hell helmets and headgear to AS64'],
  ['as2togoh', 'the other way: an AS2 mod to a Gates of Hell copy'],
  ['edrun', 'run a map through the editor (starts the editor)'],
  ['prove', 'per-unit verdicts from live matches (starts the game)'],
  ['lng', 'translation table: extract a .tsv, merge it back'],
  ['botrecipe', 'patched copy of a mod\'s bot.lua with the known bot fixes'],
  ['release-check', 'after a game update: new baseline and what it breaks'],
  ['patch-entity', 'change one value in a unit or set file'],
  ['clone-entity', 'copy a unit under a new name'],
  ['place-entity', 'place an entity on a map'],
  ['vfs', 'show which file wins across game, paks and mods'],
  ['modswitch', 'set which mods the game loads'],
  ['conflicts', 'files two mods both change'],
  ['statsheet', 'unit stats as a table'],
];
// the linters check runs (tools/check/check.js FAST_RUN + FAST_SKIP); one line in `advanced`
const LINTERS = ['modinfo', 'refcheck', 'sdllint', 'keylint', 'lnglint', 'milint', 'uilint', 'ialint', 'strlint', 'movlint', 'fxlint', 'humlint'];
const HEAD = 'ARSENAL: make, check and test mods for Men of War: Assault Squad 2 (AS64, MoW:AS2) and Gates of Hell.   (`as2` is the same command)';
function printDoor() {
  console.log(HEAD + '\n' + GAMEWORD + '\nusage: ARSENAL <command> [args..]   (options of one command: ARSENAL <command> --help)\n');
  for (const [n, d, e] of DOOR) console.log(`  ${n.padEnd(9)}  ${d}\n  ${''.padEnd(9)}  e.g. ${e}`);
  console.log('\nmore tools: ARSENAL advanced   |   every tool: ARSENAL --all');
}
function printAdvanced() {
  console.log('ARSENAL advanced: tools kept off the front door. Run them by name: ARSENAL <tool> --help\n');
  for (const [n, d] of ADVANCED) console.log(`  ${n.padEnd(13)}  ${d}`);
  console.log(`  ${'linters'.padEnd(13)}  check runs these; one at a time: ${LINTERS.join(' ')}`);
  console.log(`  ${'workflow'.padEnd(13)}  game (where is the game; --kind goh) | probe | e2e <mod> --map m | dev-loop <mod> --map m   (--target as64|mowas2|goh)`);
  console.log('\nevery tool, with usage: ARSENAL --all');
}
// allNames: every tool; u: usage per tool from INDEX.md; DEV: dev tool set; all: also list stopped tools
// HELPFIX2: tools that do not answer --help yet (owned by other sessions); they print usage when run with no args
const HELP_NOT_YET = '  (--help not yet in: clone-entity goh2as2 mapport edrun: run them with no args for usage)';
function print(allNames, u, DEV, all) {
  if (!all) { printDoor(); return; }   // front door only; every other tool stays callable (sea-main.js calls print too, same text)
  const names = allNames.filter(n => all || !STOPPED.has(n)), w = Math.max(...names.map(n => n.length), 13);
  const row = n => `  ${n.padEnd(w)}  ${(u[n] || '').slice(0, 100)}`;
  console.log('usage: ARSENAL <tool> [args..]   |   ARSENAL dev <tool> [args..]   (tool args: ARSENAL <tool> --help; `as2` is the old name and still works)\n' + HELP_NOT_YET + '\n\nmain path (static only: nothing here runs the game):');
  for (const [n, d] of MAIN) console.log(`  ${n.padEnd(w)}  ${d}`);
  console.log('  walkthrough: tools/QUICKSTART.md; most tools print their usage when run without args');
  const main = new Set(MAIN.map(x => x[0]));
  console.log('\nadvanced:');
  names.filter(n => !DEV.has(n) && !main.has(n) && !STOPPED.has(n)).forEach(n => console.log(row(n)));
  console.log('\nworkflow: game [--kind as2|goh] | install <mod> [--name n] [--link] [--force] | uninstall <name> --yes | probe | e2e <mod> --map m | dev-loop <mod> --map m   (--game G, --dry, --target as64|mowas2|goh)');
  console.log('games: --target as64|mowas2|goh on the front-door commands (default as64); check --exe, upgrade --to, gen --target');
  console.log('\ndev tools (ARSENAL dev <tool>):');
  names.filter(n => DEV.has(n) && !STOPPED.has(n)).forEach(n => console.log(row(n)));
  if (all) { console.log('\nstopped (still run when named; plan/archive/direction.md):'); names.filter(n => STOPPED.has(n)).forEach(n => console.log(row(n) + (DEV.has(n) ? '   [ARSENAL dev ' + n + ']' : ''))); }
  else console.log('\nstopped tools are hidden: ARSENAL --all');
}
module.exports = { STOPPED, MAIN, FRONT, DOOR, ADVANCED, LINTERS, print, printDoor, printAdvanced };
