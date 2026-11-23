// pro ext: deny-list for the "All tools" launcher (E-13). Every run from the launcher is read-only:
//   1. BLOCK: tools that start, drive or attach to a game/editor, servers that never exit, dev-only writers, retired tools. Never run.
//   2. DRY: tools that write or launch by default. Run only with their dry/plan flag (or a read-only subcommand).
//   3. FLAGS: flags that write a file or allow a launch. Refused for every tool (--out only with a dry flag on OUT_DRY_OK tools).
// judge(tool, argv, entry) -> {ok:true} | {ok:false, why, flag?, dry?}. `why` is a lang key suffix (pro.why.<why>).
// Lists come from tools/index/*.md lines (2026-11-09) [I]: a tool not listed here that writes on its own would slip through, so
// the launcher also runs every tool with cwd = a scratch folder (relative outputs land there, not in the repo or the game).
// Author: Imperator_Aug (ARSENAL, ia-bdc2bc1d)
'use strict';

// never run from the launcher (why -> reason group)
const BLOCK = {
  // start, drive or attach to the game, the editor or GoH
  uidrive: 'launch', crashwatch: 'launch', golden: 'launch', batch: 'launch',
  // crashwatch (-Game as64|mowas2|goh, -Pid, -Plan) attaches a debugger; its -Plan attaches nothing, but it is a .ps1 (no node entry,
  // judge 'nonode'), and the launcher runs node entries only: it stays listed, not runnable, for every game
  prove: 'launch', preloadsweep: 'launch', covanm: 'launch', 'edrun-pack': 'write',
  // servers / long running
  gui: 'server', lsp: 'server', mcp: 'server',
  // write by design (their own GUI page or dev only)
  fix: 'page', build: 'write', dist: 'write', testmap: 'write', mapgen: 'write', misgen: 'write', rzsys: 'write', cards: 'write',
  helmetport: 'write', artport: 'write', donorfit: 'write', covreplay: 'write', 'mapport/rebuild': 'write',
  sessions: 'dev', 'sessions wave': 'dev', wave: 'dev', scaffold: 'dev',
  rows2scn: 'dev', probekit: 'dev', userdir: 'nocli', lib: 'nocli',
  'lib/testfolders': 'nocli', registry: 'nocli',
  xlate: 'write', 'goh2as2/texconv': 'write', 'goh2as2/fitbatch': 'write', 'goh2as2/fitbatch --no-fit': 'write', 'goh2as2-fit': 'write', unitmod: 'write',
  portfix: 'write', valourk: 'write', genstuffkeys: 'dev', fieldtypes: 'dev', blen: 'install', score: 'dev', assetsame: 'dev', gohsample: 'launch', owners: 'nocli', QUICKSTART: 'nocli', 'report-core': 'nocli', lintrc: 'nocli', 'goh2as2-translate': 'nocli',
  soedit: 'page',   // open starts SOEdit, stage writes into a mod: the Models page does both with a preview
  // plan writes DIR/table.json and table.md into its --out, compare writes DIR/compare.json and compare.md into the DIR it is given
  // (tools/armorsim/ingame/shottable.js:299-301, 313-314): every command writes to a folder the person names, so none runs from here
  'armorsim-ingame': 'write',
};
// a family blocked as a whole: every row named <family>-x or <family>/x takes the family's reason (dist-zip and dist-enginezip write
// release zips outside the scratch folder when run bare: tools/dist/zip.js outDir, tools/dist/enginezip.js .zip and .sha256).
// dist-zip and dist-enginezip are not listed in BLOCK: the family covers them.
const BLOCK_FAMILY = ['dist'];
function blockOf(tool) {
  tool = String(tool || '');
  if (BLOCK[tool]) return BLOCK[tool];
  const f = BLOCK_FAMILY.find(x => tool.startsWith(x + '-') || tool.startsWith(x + '/'));
  return f ? BLOCK[f] : null;
}

// run only with one of these flags, or with a listed read-only first word (sub)
const DRY = {
  as2: { sub: ['status', 'help', 'advanced'], subDry: { play: ['--dry'] } },   // play/install/uninstall: Play page. `as2 <tool>` dispatch refused
  edrun: { flags: ['--dry'] },
  'edrun-runlist': { flags: ['--dry-only'] },
  testrun: { flags: ['--dry'] },
  'release-check': { flags: ['--dry'] },
  modmove: { sub: ['static'] },                       // live = boots every exe
  bootloop: { sub: ['parse'] },                       // boot/sweep start the game; drop/pack write
  snap: { flags: ['--diff'] },                        // default writes a baseline
  drift: { sub: ['check'], subDry: { stamp: ['--dry-run'] } },
  covcheck: { flags: ['--no-write'] },
  chains: { flags: ['--dry'] },
  gen: { flags: ['--plan'] },
  upgrade: { flags: ['--plan'] },
  'clone-entity': { flags: ['--dry-run'] },
  'patch-entity': { flags: ['--dry-run'] },
  'place-entity': { flags: ['--dry-run'] },
  'mission-clone': { flags: ['--dry-run'] },
  'map-clone': { flags: ['--plan'] },
  botrecipe: { flags: ['--dry-run'] },
  mapport: { flags: ['--dry-run', '--plan'] },
  goh2as2: { flags: ['--dry-run'] },
  as2togoh: { flags: ['--dry'] },
  lng: { sub: [], subDry: { merge: ['--dry-run'] } },  // extract needs --out (refused): read with the Translate page
  'newmod/lng-add': { flags: ['--dry-run'] },
  'lng-add': { flags: ['--dry-run'] },
  newmod: { flags: ['--dry-run'] },
  shotcrop: { flags: ['--info'] },
  wpn: { sub: ['show', 'answers'] },
  doctrine: { sub: ['list', 'show', 'voice', 'profile', 'check'], subDry: { gen: ['--plan'] } },   // gen writes bot.data.lua into the mod
  gemindex: { sub: ['search', 'show', 'faq', 'tools', 'gaps', 'stats'] },   // export writes
  portdiff: { flags: ['--no-cache'] },                // default caches under tools/portdiff/cache
  ide: { sub: ['check', 'hover', 'def', 'refs', 'symbols', 'words', 'fixes'] },   // npp install/uninstall write into Notepad++; send talks to it
  workshop: { sub: ['status'] },                     // install copies the uploader into the game folder, start runs workshop_gui.exe (workshop.js:67-69, 83): Share page
  'goh2as2/unitname': { flags: ['--dry-run'] },      // writes <mod>/localization/<file> unless --dry-run (unitname.js:181-183)
};
// a row named '<tool> <words>' runs <tool>'s script with other arguments (goh2as2 --deps scenery): it takes <tool>'s dry rule, so a
// second row of one script cannot skip that script's dry flag. The explicit key keeps the dry hint in the tools list (routes.js).
DRY['goh2as2 --deps scenery'] = DRY.goh2as2;
function dryKey(tool) {
  tool = String(tool || '');
  const sp = tool.indexOf(' ');
  if (sp > 0 && DRY[tool.slice(0, sp)]) return tool.slice(0, sp);
  return DRY[tool] ? tool : null;
}
// these tools take --out as "where it would go" in their dry run [I: from the index lines]
const OUT_DRY_OK = new Set(['clone-entity', 'patch-entity', 'place-entity', 'mission-clone', 'map-clone', 'botrecipe', 'lng', 'goh2as2', 'as2togoh', 'gen', 'doctrine']);   // a '<tool> <words>' row takes <tool>'s entry (dryKey)

// flags refused for every tool (they write a file, overwrite, apply, or allow a launch)
const FLAGS = ['--allow-launch', '--write', '--apply', '--force', '--update', '--restore', '--export', '--import', '--clean', '--rules-out', '--roster-insert',
  '--cache', '-o', '--output', '--stage-as', '--add-cards', '--pack', '--fix', '--accept', '--promote', '--copy-assets', '--keep-base', '--online', '--url',   // --online/--url = network
  '--svg',    // --svg <file> writes an SVG to any path (mapview.js:155, chains WRITE_FLAGS)
  '--xlate-json'];   // (goh2as2.js:1497 writes it even with --dry-run)
const VALUE_FLAGS = ['--json', '--md', '--csv', '--html', '--report'];   // refused only when followed by a value (a file to write)
const PER_TOOL = { srcdrift: ['--snap'], exediff: ['--full'], keyprof: ['--set'], modswitch: ['--set'], fxlint: ['--regen-actions'] };   // fxlint --regen-actions rewrites tools/fxlint/actions.json (fxlint.js:171,178)   // keyprof/modswitch --set is dry without --write, but keep them out: Play page

function flagName(a) { const i = a.indexOf('='); return i > 0 && a.startsWith('-') ? a.slice(0, i) : a; }

function judge(tool, argv, entry) {
  argv = argv || [];
  if (!entry) return { ok: false, why: 'unknown' };
  if (entry.retired) return { ok: false, why: 'retired' };
  if (blockOf(tool)) return { ok: false, why: 'block.' + blockOf(tool) };
  if (!entry.entry) return { ok: false, why: 'nonode' };
  const names = argv.map(flagName);
  for (let i = 0; i < names.length; i++) {
    const a = names[i];
    if (FLAGS.includes(a)) return { ok: false, why: 'flag', flag: a };
    if ((PER_TOOL[tool] || []).includes(a)) return { ok: false, why: 'flag', flag: a };
    if (VALUE_FLAGS.includes(a) && (argv[i].includes('=') || (i + 1 < argv.length && !String(argv[i + 1]).startsWith('-')))) return { ok: false, why: 'flagfile', flag: a };
  }
  const dk = dryKey(tool), d = dk ? DRY[dk] : null;
  let dryOn = false;
  if (d) {
    const first = argv.find(x => !String(x).startsWith('-'));
    const has = fl => fl.some(f => names.includes(f));
    if (d.sub && first && d.sub.includes(first)) dryOn = true;
    else if (d.subDry && first && d.subDry[first]) { if (!has(d.subDry[first])) return { ok: false, why: 'needdry', dry: d.subDry[first].join(' / ') }; dryOn = true; }
    else if (d.flags && has(d.flags)) dryOn = true;
    else if (tool === 'as2' && !argv.length) dryOn = true;   // bare `as2` prints the menu
    else {
      const opts = [].concat(d.flags || [], (d.sub || []).map(s => s + ' (first word)'), Object.entries(d.subDry || {}).map(([s, f]) => s + ' ' + f.join('/')));
      return { ok: false, why: 'needdry', dry: opts.join(' / ') };
    }
  }
  if (names.includes('--out') && !(dryOn && (OUT_DRY_OK.has(tool) || (dk && OUT_DRY_OK.has(dk))))) return { ok: false, why: 'flag', flag: '--out' };
  return { ok: true, dry: dryOn };
}

// state for the list: 'block' (never), 'dry' (needs a dry flag), 'ok'
function state(tool, entry) {
  if (!entry || entry.retired || blockOf(tool) || !entry.entry) return 'block';
  return dryKey(tool) ? 'dry' : 'ok';
}

module.exports = { judge, state, blockOf, dryKey, BLOCK, BLOCK_FAMILY, DRY, FLAGS, VALUE_FLAGS, OUT_DRY_OK };
