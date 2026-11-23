// gui contract: the JSON description of every front-door command and the input -> argv builder.
// One table (COMMANDS) drives the server, the /api/commands listing and the tests. No IO here except path.resolve.
//   field: {name, flag?, pos?, type: path|str|enum|bool|int|list|repeat, req?, reqUnless?, reqWhen?: {field: value} (required only when every named input has that value), values?, desc}
//   pos: n = positional slot n (before flags). list = comma-joined value, repeat = flag given once per item.
//   result: how the parsed result is found after the run: 'jsonfile' (server passes <jsonFlag> a temp file), 'stdout-json' (field `json` true
//   makes the tool print one JSON object on stdout), 'outdir' (<out>/report.json + file list), 'none'.
//   launch: the command starts the game unless the named bool field is true (--dry / --plan); the server refuses it unless started with allowLaunch.
// Author: Imperator_Aug (ARSENAL, ia-574ffd09)
const path = require('path');

const GAME = { name: 'game', flag: '--game', type: 'path', desc: 'game install dir; omitted = tools/lib/gamedir (AS2_GAME, as2.json, Steam)' };
const f = (name, flag, type, desc, x) => Object.assign({ name, flag, type, desc }, x || {});
// game parity: the front-door run and install words take --target (tools/as2/flow.js gameOf/wordOf); omitted = as before (exe, then the
// mod.info range, then as64). MoW:AS2 runs dry only (TST-19); GoH is refused by the tool with one plain line (no write into the GoH install, no pipe).
const TARGET = f('target', '--target', 'enum', 'the game: as64, mowas2 (dry only: no control pipe, TST-19) or goh (refused: no write into the GoH install, no control pipe)', { values: ['as64', 'mowas2', 'goh'] });

const COMMANDS = {
  game: {
    summary: 'Find the game install through tools/lib/gamedir.', inproc: 'game', result: 'none',
    fields: [f('game', null, 'path', 'explicit dir; returned as given (source "arg")'),
      f('kind', null, 'enum', 'which install: as2 (default, gamedir.resolve: the AS2 install of AS64 and MoW:AS2) or goh (gamedir.goh: the GoH install)', { values: ['as2', 'goh'] })],
  },
  new: {
    summary: 'ARSENAL new: make an empty mod folder (folder name made lowercase); target picks the game (default as64).', tool: 'as2', entry: 'as2/as2.js', lead: ['new'], flow: true, result: 'none',
    fields: [f('dir', null, 'path', 'new mod folder', { pos: 0, req: true }), f('name', '--name', 'str', 'mod title'), f('desc', '--desc', 'str', 'description'), f('deps', '--deps', 'str', 'dependency mods a,b'),
      GAME, f('dryRun', '--dry-run', 'bool', 'print only, write nothing'),
      f('target', '--target', 'enum', 'game the mod is for (default as64); goh: --game is the GoH install, the folder name has no "-" and is ASCII', { values: ['as64', 'mowas2', 'goh'] })],
  },
  play: {
    summary: 'ARSENAL play: check, install, start a test match, read the boot verdict. Starts the game unless dry.', tool: 'as2', entry: 'as2/as2.js', lead: ['play'], flow: true, result: 'none', launch: 'dry',
    fields: [f('mod', null, 'path', 'mod folder', { pos: 0, req: true }), f('map', '--map', 'str', 'test map'), f('inst', '--inst', 'int', 'game instance (never 0)', { min: 1 }), GAME,
      f('exe', '--exe', 'path', 'game exe (default as64.exe, else mowas_2.exe; the MoW:AS2 game in the header sends mowas_2.exe)'), f('dry', '--dry', 'bool', 'print every step, change nothing'), TARGET],
  },
  install: {
    summary: 'Copy (or junction) a mod folder into <game>/mods.', tool: 'as2', entry: 'as2/as2.js', lead: ['install'], flow: true, result: 'none',
    fields: [f('mod', null, 'path', 'mod folder', { pos: 0, req: true }), f('name', '--name', 'str', 'folder name in mods/'), f('link', '--link', 'bool', 'junction instead of copy'),
      f('force', '--force', 'bool', 'overwrite a folder as2 did not create'), GAME, f('dry', '--dry', 'bool', 'print only'), TARGET],
  },
  uninstall: {
    summary: 'Remove a mod that as2 install put into <game>/mods (needs yes).', tool: 'as2', entry: 'as2/as2.js', lead: ['uninstall'], flow: true, result: 'none',
    fields: [f('name', null, 'str', 'mod folder name in mods/', { pos: 0, req: true }), f('yes', '--yes', 'bool', 'actually remove'), GAME, TARGET],
  },
  probe: {
    summary: 'as2 probe: testrun --probe against the game.', tool: 'as2', entry: 'as2/as2.js', lead: ['probe'], flow: true, result: 'none', launch: 'dry',
    fields: [GAME, f('exe', '--exe', 'path', 'game exe'), f('logdir', '--logdir', 'path', 'log dir'), f('inst', '--inst', 'int', 'instance number'), f('dry', '--dry', 'bool', 'print the chain only'), TARGET],
  },
  e2e: {
    summary: 'as2 e2e: modinfo, build, install, game run, log triage on one mod.', tool: 'as2', entry: 'as2/as2.js', lead: ['e2e'], flow: true, result: 'none', launch: 'dry',
    fields: [f('mod', null, 'path', 'mod folder', { pos: 0, req: true }), f('map', '--map', 'str', 'map', { req: true }), f('name', '--name', 'str', 'mods/ folder name'), GAME,
      f('logdir', '--logdir', 'path', 'log dir'), f('exe', '--exe', 'path', 'game exe'), f('profile', '--profile', 'str', 'profile'), f('players', '--players', 'str', 'players'),
      f('inst', '--inst', 'int', 'instance'), f('link', '--link', 'bool', 'junction install'), f('force', '--force', 'bool', 'overwrite'), f('dry', '--dry', 'bool', 'print the chain only'), TARGET],
  },
  'dev-loop': {
    summary: 'as2 dev-loop: modinfo, build, install, then e2e.', tool: 'as2', entry: 'as2/as2.js', lead: ['dev-loop'], flow: true, result: 'none', launch: 'dry',
    fields: [f('mod', null, 'path', 'mod folder', { pos: 0, req: true }), f('map', '--map', 'str', 'map', { req: true }), f('name', '--name', 'str', 'mods/ folder name'), GAME,
      f('logdir', '--logdir', 'path', 'log dir'), f('exe', '--exe', 'path', 'game exe'), f('inst', '--inst', 'int', 'instance'), f('link', '--link', 'bool', 'junction'), f('force', '--force', 'bool', 'overwrite'), f('dry', '--dry', 'bool', 'print the chain only'), TARGET],
  },
  upgrade: {
    summary: 'Port a mod between AS64, MoW:AS2 and GoH: a plan, or a written copy.', tool: 'upgrade', entry: 'upgrade/upgrade.js', result: 'jsonfile', jsonFlag: '--json',
    fields: [f('mod', null, 'path', 'mod folder', { pos: 0, req: true }), f('to', '--to', 'enum', 'target', { req: true, values: ['as64', 'mowas2', 'goh'] }),
      f('from', '--from', 'str', 'source, g or g@sha'), f('toBuild', '--to-build', 'str', 'target build sha'), f('plan', '--plan', 'bool', 'report only, write nothing'),
      f('out', '--out', 'path', 'output folder (empty or new)'), f('thenFix', '--then-fix', 'bool', 'run fix apply and check after the write'), f('noLink', '--no-link', 'bool', 'copy, no hardlinks'), f('export', '--export', 'bool', 'for sharing: no UPGRADE.md, credit line in Desc', { notWith: 'plan' }),
      f('carry', '--carry', 'bool', 'copy the mod files'), f('carryMax', '--carry-max', 'int', 'MB cap for --carry'), f('dropDangling', '--drop-dangling', 'bool', 'with carry'),
      f('mode', '--mode', 'enum', 'AS64 mode', { values: ['classic', 'enhanced'] }), f('only', '--only', 'list', 'only these passes'), f('drop', '--drop', 'list', 'skip these passes'),
      f('patch', '--patch', 'path', 'patch folder'), f('donor', '--donor', 'str', 'auto or donor name (goh)'), f('gohVersion', '--goh-version', 'str', 'GoH exe version'),
      f('as2', '--as2', 'path', 'AS2 install'), f('goh', '--goh', 'path', 'GoH install'), f('top', '--top', 'int', 'rows to show')],
  },
  check: {
    summary: 'Run every static check on a mod folder.', tool: 'check', entry: 'check/check.js', result: 'jsonfile', jsonFlag: '--json', noTimeout: true,
    fields: [f('mod', null, 'path', 'mod folder, anywhere', { pos: 0, req: true }), f('with', '--with', 'path', 'fix/upgrade patch folder'), f('exe', '--exe', 'list', 'as64,mowas2,goh'),
      GAME, f('goh', '--goh', 'path', 'GoH install'), f('only', '--only', 'list', 'tools to run'), f('fast', '--fast', 'bool', 'skip the slow tools'), f('jobs', '-j', 'int', 'parallel jobs'),
      f('locs', '--locs', 'int', 'file:line samples kept per code (default 50)'), f('timing', '--timing', 'bool', 'print timing'), f('quiet', '-q', 'bool', 'less output')],
  },
  fix: {
    summary: 'Plan or apply the safe fixers on a mod; apply writes a patch mod folder.', tool: 'fix', entry: 'fix/fix.js', result: 'jsonfile', jsonFlag: '--json',
    fields: [f('mod', null, 'path', 'mod folder', { pos: 0, req: true }), f('mode', null, 'enum', 'plan writes nothing, apply writes --out', { pos: 1, req: true, values: ['plan', 'apply'] }),
      f('out', '--out', 'path', 'patch mod folder (apply only; plan writes nothing)', { reqWhen: { mode: 'apply' } }), Object.assign({}, GAME, { req: true }), f('mods', '--mods', 'str', 'dependency mods'),
      f('only', '--only', 'list', 'fixers: lng,repoint,set,include,macro,enc,spell,syntax,asread,stubmtl,quarantine,modinfo,botkeys,lngdup'), f('set', '--set', 'repeat', 'file:path=value, repeatable'),
      f('target', '--target', 'enum', 'game the patch is for (default "as64")', { values: ['as64', 'classic', 'mowas2', 'goh'] }),
      f('exe', '--exe', 'enum', 'game view (default: from --target, else as64.exe in the folder)', { values: ['as64', 'mowas_2', 'goh'] }),
      f('gameVersion', '--game-version', 'str', 'GoH version when the exe has no PE version')],
  },
  gen: {
    summary: 'Generate a mod from a YAML/JSON spec.', tool: 'gen', entry: 'gen/gen.js', result: 'stdout-json',
    fields: [f('spec', null, 'path', 'spec file', { pos: 0, reqUnless: 'sample' }), f('target', '--target', 'enum', 'target', { reqUnless: 'sample', values: ['as64', 'mowas2', 'goh'] }),
      f('plan', '--plan', 'bool', 'plan only'), f('out', '--out', 'path', 'output folder'), f('game', '--game', 'path', 'AS2 install'), f('goh', '--goh', 'path', 'GoH install'),
      f('force', '--force', 'bool', 'overwrite'), f('noGate', '--no-gate', 'bool', 'skip the gate'), f('noStat', '--no-stat', 'bool', 'skip stats'), f('pack', '--pack', 'path', 'pack dir'),
      f('quiet', '-q', 'bool', 'less output'), f('json', '--json', 'bool', 'tool prints one JSON object (the result field)'), f('sample', '--sample', 'bool', 'print the sample spec text'),
      f('sampleName', null, 'enum', 'which sample (needs sample)', { after: 'sample', values: ['rename-unit', 'change-price', 'clone-unit', 'armor', 'squad', 'all', 'list'] })],
  },
  prove: {
    summary: 'Functional check of one unit in a running match. Starts the game unless plan.', tool: 'prove', entry: 'prove/prove.js', result: 'none', launch: 'plan',
    fields: [Object.assign({}, GAME, { req: true }), f('unit', '--unit', 'str', 'card', { reqUnless: 'units' }), f('units', '--units', 'str', 'batch a,b:human'), f('army', '--army', 'str', 'army', { req: true }),
      f('kind', '--kind', 'enum', 'kind', { values: ['vehicle', 'human'] }), f('mods', '--mods', 'str', 'a,b'), f('side', '--side', 'int', 'bot side'), f('target', '--target', 'str', 'target card'),
      f('map', '--map', 'str', 'map:mode'), f('hold', '--hold', 'int', 'hold'), f('inst', '--inst', 'int', 'instance (never 0)', { min: 1 }), f('stageAs', '--stage-as', 'str', 'stage name'), f('exe', '--exe', 'str', 'exe'),
      f('control', '--control', 'str', 'fake'), f('controlRep', '--control-rep', 'str', 'card[:kind]'), f('depth', '--depth', 'enum', 'depth', { values: ['spawn', 'move', 'fire'] }),
      f('games', '--games', 'int', 'games'), f('enemy', '--enemy', 'str', 'enemy card'), f('tiny', '--tiny', 'bool', 'generated flat map'), f('addCards', '--add-cards', 'bool', 'test cards'),
      f('plan', '--plan', 'bool', 'fixture and scenario only')],
  },
  // XLATE-2 protocol: with --ask-json the tool prints, on stdout, one JSON object per question
  //   {"xlate":"question","v":1,id,unit,key,class,stage:"engine"|"scale",goh,translated,range:{p5,p95},scaled,donor,default,choices:["scale","translated","donor"],rest_of_class:true}
  // and reads one JSON line from stdin {id,choice,rest:bool}. rest:true = the same choice for the rest of that class and stage. --no-ask = never ask, every default.
  translate: {
    summary: 'Translate GoH units to AS2/AS64 (goh2as2). With askJson the tool may ask JSON questions that the page answers.', tool: 'goh2as2', entry: 'goh2as2/goh2as2.js', result: 'none', interactive: true,
    fields: [f('goh', '--goh', 'path', 'GoH install (or mod data root)', { req: true }), f('entity', '--entity', 'repeat', 'entity name or path, repeatable', { reqUnless: 'keys' }), f('keys', '--keys', 'path', 'file of virtual keys', { reqUnless: 'entity' }),
      f('out', '--out', 'path', 'output mod folder', { req: true }), GAME, f('exe', '--exe', 'enum', 'AS2 game the lookup reads (vfs flavour; default as64 when as64.exe is in --game, else mowas_2)', { values: ['as64', 'mowas_2'] }),
      f('donor', '--donor', 'str', 'vanilla def stem (donor unit)'), f('nation', '--nation', 'str', 'nation'),
      f('dryRun', '--dry-run', 'bool', 'write nothing'), f('noDeps', '--no-deps', 'bool', 'no dependency closure'), f('noKeylint', '--no-keylint', 'bool', 'skip keylint after the write'), f('quiet', '-q', 'bool', 'less output'),
      f('askJson', '--ask-json', 'bool', 'ask a JSON question per unusable or out-of-range value on stdout; answers on stdin'), f('noAsk', '--no-ask', 'bool', 'never ask: every value takes its default (AS2 scale)'),
      f('dropLimits', '--drop-limits', 'bool', 'remove gun and turret limits instead of translating them'), f('noTranslate', '--no-translate', 'bool', 'keep the donor numbers (no translation)')],
  },
  edrun: {
    summary: 'Run unit pairs in the editor build. Starts the game unless dry.', tool: 'edrun', entry: 'edrun/edrun.js', result: 'outdir', launch: 'dry',
    fields: [GAME, f('root', '--root', 'path', 'dir holding the exe'), f('exe', '--exe', 'str', 'exe name'), f('pairs', '--pairs', 'path', 'pairs.json', { req: true }), f('mods', '--mods', 'list', 'mods'),
      f('secs', '--secs', 'int', 'secs per game'), f('out', '--out', 'path', 'output folder', { req: true }), f('speed', '--speed', 'enum', 'speed', { values: ['very_fast', 'fast', 'normal'] }),
      f('ratio', '--ratio', 'int', '1..20'), f('fog', '--fog', 'enum', 'fog', { values: ['0', '1'] }), f('pipe', '--pipe', 'str', 'a;b'), f('noPipe', '--no-pipe', 'bool', 'no pipe'),
      f('dry', '--dry', 'bool', 'no game, mission to out'), f('inst', '--inst', 'int', 'instance (never 0)', { min: 1 }), f('runId', '--run-id', 'str', 'run id'), f('map', '--map', 'str', 'vanilla map'),
      f('noCheck', '--no-check', 'bool', 'skip preflight'), f('check', '--check', 'bool', 'preflight in a dry run')],
  },
  // Map Viewer editor shot (tools/mapviz README 1.6, design 8): one installed editor draws the map picture with Render Minimap.
  // Its own entry edshot/edshot.js (mapviz.js never loads it). Starts an editor unless dry; in waves C and D `shot` answers
  // "not built" (exit 4) and the page shows the dry plan only. confirm: the text the page shows before a real run; it names
  // the install folder, the editor exe, the files the run puts there and the profile whose mod list is set. The strings live
  // in the export page part's lang file (key and its {args}); contract.js reads no file.
  mapshot: {
    summary: 'Map Viewer editor shot: an installed editor draws the map picture (Render Minimap). Starts the editor unless dry.', tool: 'mapviz', entry: 'mapviz/edshot/edshot.js', lead: ['shot'], result: 'stdout-json', launch: 'dry',
    confirm: {
      lang: 'ext/mapviz/sub/export.lang.json', key: 'mapviz.export.edConfirm',
      args: ['editor', 'folder', 'map', 'size', 'files', 'profile', 'lo', 'hi'],
      names: { folder: 'root', exe: 'exe', files: 'files', profile: 'profile' },
      files: ['minimap_render.png', 'minimap_render.png.temp'],
      exes: { as64_ed: 'as64_ed.exe', mowas_2_ed: 'mowas_2_ed.exe', goh_ed: 'binaries/x64/call_to_arms_ed.exe' },
    },
    fields: [f('target', '--target', 'enum', 'game of the map', { req: true, values: ['as64', 'mowas2', 'goh'] }), f('map', '--map', 'str', 'map key, as multi/1v1_road', { req: true }),
      f('exe', '--exe', 'enum', 'editor: as64_ed (AS64 build folder), mowas_2_ed (MoW:AS2 install), goh_ed (GoH install)', { req: true, values: ['as64_ed', 'mowas_2_ed', 'goh_ed'] }),
      f('root', '--root', 'path', 'the folder the editor runs in (its install or the AS64 build folder); the run files appear there', { req: true }),
      f('instance', '--instance', 'int', 'as64_ed instance (never 0)', { min: 1, reqWhen: { exe: 'as64_ed' } }),
      f('profile', '--profile', 'path', 'profile folder whose mod list is set for the run and put back after'),
      f('route', '--route', 'enum', 'editor (Render Minimap) or console (GoH editor console)', { values: ['editor', 'console'] }),
      f('size', '--size', 'int', 'picture side in px (Render Minimap draws 4096)', { min: 1 }), f('run', '--run', 'str', 'run id (files under <cache>/runs/<id>/)'),
      f('json', '--json', 'bool', 'tool prints one JSON object (the result field)'), f('dry', '--dry', 'bool', 'the plan only: no editor starts')],
  },
  // N2-4: the test game copy (instance N user dir). testprofile only reads (modswitch dry run); testprofile-seed copies the main profile's options.set
  // into instance N (modswitch refuses 0; the real profile is never written).
  testprofile: {
    summary: 'Show the mod list of a test game copy (instance N, never 0). Reads only.', tool: 'modswitch', entry: 'modswitch/modswitch.js', result: 'none',
    fields: [GAME, f('inst', '--inst', 'int', 'instance (never 0)', { min: 1, req: true })],
  },
  'testprofile-seed': {
    summary: 'Make the test game copy: copy the main profile settings into instance N (never 0).', tool: 'modswitch', entry: 'modswitch/modswitch.js', result: 'none',
    fields: [f('seed', '--seed', 'int', 'instance to make (never 0)', { min: 1, req: true }), f('mods', '--mods', 'str', 'mod list a:0,b:0')],
  },
};

// T-GUI: the 5 pages (Make split 2026-11-13: new on Mods, gen on the Generator, upgrade on Upgrade or Port). Each action is one contract call (cmd + fixed extra input); page.js buttons run exactly these, the GOLD test (test/test-pages.js)
// runs each action through the server and compares it with `ARSENAL <door word> ...`. door = the front-door word (tools/as2/menu.js DOOR) on the button.
// gold: the action is byte-compared with the CLI; the CLI argv is built by the test from the same input.
const PAGES = [
  { id: 'mods', title: 'Mods', actions: [
    { id: 'new', door: 'new', cmd: 'new' }] },
  { id: 'make', title: 'Generator', actions: [
    { id: 'gen-plan', door: 'gen', cmd: 'gen', extra: { plan: true } },
    { id: 'gen', door: 'gen', cmd: 'gen' }] },
  { id: 'upgrade', title: 'Upgrade or Port', actions: [
    { id: 'upgrade-plan', door: 'upgrade', cmd: 'upgrade', extra: { plan: true } },
    { id: 'upgrade', door: 'upgrade', cmd: 'upgrade' }] },
  { id: 'check', title: 'Check', actions: [
    { id: 'check', door: 'check', cmd: 'check' },
    { id: 'fix-plan', door: 'fix', cmd: 'fix', extra: { mode: 'plan' } },
    { id: 'fix', door: 'fix', cmd: 'fix', extra: { mode: 'apply' } }] },
  { id: 'play', title: 'Play', actions: [
    { id: 'install-dry', door: 'install', cmd: 'install', extra: { dry: true } },
    { id: 'install', door: 'install', cmd: 'install' },
    { id: 'uninstall', door: 'uninstall', cmd: 'uninstall' },
    { id: 'play-dry', door: 'play', cmd: 'play', extra: { dry: true } },
    { id: 'play', door: 'play', cmd: 'play' }] },
];
// behind the Advanced switch (hidden by default)
const ADVANCED_PAGES = [];   // Test Run left Advanced (it is the first sub-tab of Test, Share & Play); Translate is a fold of the GoH unit page now (ext/goh)

// GUI-EXT: commands from tools/gui/ext/*
for (const x of require('./ext')) for (const [k, v] of Object.entries(x.commands || {})) { if (COMMANDS[k]) throw new Error('ext ' + x.id + ': command ' + k + ' exists'); COMMANDS[k] = v; }

class InputError extends Error {}
const bad = m => { throw new InputError(m); };

function scalar(fl, v, base) {
  if (fl.type === 'int') { if (typeof v === 'string' && /^\d+$/.test(v)) v = Number(v); if (!Number.isSafeInteger(v) || v < 0) bad(`${fl.name}: need a whole number >= 0`); if (fl.min != null && v < fl.min) bad(`${fl.name}: at least ${fl.min}`); return String(v); }
  if (typeof v !== 'string' || !v || v.includes('\0')) bad(`${fl.name}: need a non-empty string`);
  if (v[0] === '-') bad(`${fl.name}: a value may not start with "-"`);
  if (fl.type === 'enum' && !fl.values.includes(v)) bad(`${fl.name}: one of ${fl.values.join(', ')}`);
  return fl.type === 'path' ? path.resolve(base || process.cwd(), v) : v;
}

// buildArgv(cmd, input, {base}) -> {args:[...after the script], launches:bool}; throws InputError.
function buildArgv(cmd, input, opt = {}) {
  const c = COMMANDS[cmd];
  if (!c) bad('unknown command: ' + cmd);
  if (input == null) input = {};
  if (typeof input !== 'object' || Array.isArray(input)) bad('input must be an object');
  const names = new Set(c.fields.map(x => x.name));
  for (const k of Object.keys(input)) if (!names.has(k)) bad(`${cmd}: unknown input "${k}"`);
  const pos = [], flags = [];
  for (const fl of c.fields) {
    const v = input[fl.name];
    const on = v !== undefined && v !== null && v !== false;
    if (!on) {
      if (fl.req || (fl.reqUnless && !input[fl.reqUnless] && input[fl.reqUnless] !== 0)) bad(`${cmd}: ${fl.name} is required`);
      if (fl.reqWhen && Object.keys(fl.reqWhen).every(k => input[k] === fl.reqWhen[k])) bad(`${cmd}: ${fl.name} is required for ${Object.keys(fl.reqWhen).map(k => k + ' ' + fl.reqWhen[k]).join(', ')}`);   // I-18
      continue;
    }
    if (fl.notWith && input[fl.notWith] === true) bad(fl.name + ': not with ' + fl.notWith);
    if (fl.type === 'bool') { if (v !== true) bad(`${fl.name}: true or omitted`); flags.push(fl.flag); continue; }
    if (fl.type === 'list') {
      const a = Array.isArray(v) ? v : [v];
      if (!a.length) bad(`${fl.name}: empty list`);
      flags.push(fl.flag, a.map(x => scalar({ name: fl.name, type: 'str' }, x)).join(','));
    } else if (fl.type === 'repeat') {
      for (const x of Array.isArray(v) ? v : [v]) flags.push(fl.flag, scalar({ name: fl.name, type: 'str' }, x));
    } else if (fl.pos !== undefined) pos[fl.pos] = scalar(fl, v, opt.base);
    else if (fl.flag) flags.push(fl.flag, scalar(fl, v, opt.base));
    else if (fl.after) { if (input[fl.after] !== true) bad(fl.name + ': needs ' + fl.after); flags.push(scalar(fl, v, opt.base)); }   // GX stats S7: bare value right after its flag (gen --sample <name>)
    else if (fl.type === 'enum') scalar(fl, v, opt.base);   // no flag (an in-process field such as game kind): checked, not put on the argv
  }
  const launches = !!c.launch && input[c.launch] !== true;
  return { args: [...(c.lead || []), ...pos.filter(x => x !== undefined), ...flags], launches };
}

// public listing (no internals)
function describe() {
  return Object.entries(COMMANDS).map(([id, c]) => ({
    id, summary: c.summary, launchesGame: !!c.launch, safeFlag: c.launch || null, result: c.result, interactive: !!c.interactive,
    // E-30: what the page needs to show the CLI line (entry, lead, jsonFlag, flag/pos/after per field); mirrors buildArgv
    entry: c.entry || null, lead: c.lead || [], jsonFlag: c.jsonFlag || null, confirm: c.confirm || null,
    fields: c.fields.map(x => ({ name: x.name, type: x.type, required: !!x.req, requiredUnless: x.reqUnless || null, requiredWhen: x.reqWhen || null, positional: x.pos !== undefined, values: x.values || null, min: x.min == null ? null : x.min, desc: x.desc,
      flag: x.flag || null, pos: x.pos === undefined ? null : x.pos, after: x.after || null })),
  }));
}

module.exports = { COMMANDS, PAGES, ADVANCED_PAGES, buildArgv, describe, InputError };
