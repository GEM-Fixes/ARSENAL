// edshot: the editor shot of the Map Viewer, dry part (MV-EDC, wave A; tools/mapviz/README.md 1.6, design 8).
// Its own entry: tools/mapviz/mapviz.js never loads it. This wave starts nothing: no game, no editor, no input. It reads
// the process list (tasklist, through tools/lib/platform), stats files and folders, and moves the editor's own run files
// out of the working folder. import's --out check and --target go through shared libs (gamedir) that may run reg export.
// usage: node tools/mapviz/edshot/edshot.js <command> [flags]
//   preflight  --exe as64_ed|mowas_2_ed|goh_ed --root <folder> [--instance N] [--profile <folder>] [--run <id>] [--json]
//              refuses (exit 6) while a game or editor that blocks this editor runs, when a run file is already there,
//              when the folder is not writable, or as64_ed without --instance N (N from 1 up); --run keeps the record
//   walk       --root <folder> [--skip <glob>].. [--no-links] [--run <id> --label <name>] [--json]
//              name, size, time of every file and folder; follows folder links once
//   diff       --run <id> [--scope install|profile] [--route editor|console] [--bak <name>] [--expect <glob>].. [before after]
//              or diff <before.json> <after.json>; exit 1 when a change is not on the expected list
//   moveout    --run <id> [--root <folder>] [--json]   moves minimap_render.png, minimap_render.png.temp, dialogs.txt
//              into <cache>/runs/<id>/, only those the run's preflight saw absent; exit 6 when refused
//   import     --file <png> (--in <folder with mapdoc.json> | --target T --map K) (--out <folder> | --run <id>) [--json]
//              a picture over the map's world box: pic.edshot.mvg + pic.edshot.json
//   shot, calibrate   wave E: not built (exit 4)
// exit codes: 0 ok, 1 differences found, 2 usage or fault, 3 not found, 4 not built, 6 refused.
// Run files live in <cache>/runs/<run id>/ (cache = the mapviz tool cache; ARSENAL_CACHE replaces its root).
// Author: Imperator_Aug (ARSENAL, ia-aa800c16)
'use strict';
const fs = require('fs'), path = require('path');
const mv = require('../mapviz');
const ed = require('./index');
const { MvError, EXIT } = mv;

const COMMANDS = {
  preflight: { args: '--exe as64_ed|mowas_2_ed|goh_ed --root <folder> [--instance N] [--profile <folder>] [--run <id>] [--json]', summary: 'may an editor run here now' },
  walk: { args: '--root <folder> [--skip <glob>].. [--no-links] [--run <id> --label <name>] [--json]', summary: 'stat list of a folder tree' },
  diff: { args: '--run <id> [--scope install|profile] [--route editor|console] [--bak <name>] [--expect <glob>].. [before after] | <before.json> <after.json>', summary: 'changes against the expected list' },
  moveout: { args: '--run <id> [--root <folder>] [--json]', summary: 'move the run files out of the working folder' },
  import: { args: '--file <png> (--in <folder> | --target T --map K) (--out <folder> | --run <id>) [--json]', summary: 'a picture over the world box' },
  shot: { args: '', summary: 'wave E (MV-EDR): not built', built: false },
  calibrate: { args: '', summary: 'wave E (MV-EDR): not built', built: false },
};
const SPEC = { exe: 'str', root: 'str', run: 'str', file: 'str', instance: 'num', profile: 'str', label: 'str', scope: 'str',
  route: 'str', bak: 'str', skip: 'multi', expect: 'multi', 'no-links': 'bool' };

function helpText() {
  let src = '';
  try { src = fs.readFileSync(__filename, 'latin1'); } catch (e) { src = ''; }
  const head = [];
  for (const l of src.split(/\r?\n/)) { if (!/^\/\//.test(l)) break; head.push(l.replace(/^\/\/ ?/, '')); }
  const rows = Object.keys(COMMANDS).map(k => '  ' + k + ' ' + COMMANDS[k].args + '   ' + COMMANDS[k].summary);
  return (head.length ? head.join('\n') : 'edshot: editor shot, dry part') + '\ncommands:\n' + rows.join('\n');
}

function runsRoot() { return path.join(require('../../lib/toolcache').dir('mapviz'), 'runs'); }
function runDirOf(id) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(String(id || '')) || /\.\./.test(id)) throw new MvError('MV_USAGE', 'run id must be letters, digits, _ . - (up to 64), got ' + id);
  return path.join(runsRoot(), id);
}
function readJson(file, what) {
  let t;
  try { t = fs.readFileSync(file, 'utf8'); } catch (e) { throw new MvError('MV_NOT_FOUND', 'no ' + what + ' (' + path.basename(file) + ')'); }
  try { return JSON.parse(t); } catch (e) { throw new MvError('MV_USAGE', what + ' is not JSON'); }
}
function label(s) {
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(String(s || ''))) throw new MvError('MV_USAGE', 'label must be lower case letters, digits, _ or - (up to 32), got ' + s);
  return s;
}
// ---- commands ----
// preflight needs --root: the folder is named, never looked up (a lookup through gamedir may run reg export)
function cmdPreflight(o, io) {
  const exe = o.extra.exe;
  if (!exe) throw new MvError('MV_USAGE', 'give --exe as64_ed, mowas_2_ed or goh_ed');
  if (!ed.EXES[exe]) throw new MvError('MV_USAGE', '--exe must be as64_ed, mowas_2_ed or goh_ed, got ' + exe);
  const root = o.extra.root;
  if (!root) throw new MvError('MV_USAGE', 'give --root <folder>, the folder ' + exe + ' runs in');
  let dir = null;
  if (o.extra.run !== undefined) {
    dir = runDirOf(o.extra.run);
    if (fs.existsSync(path.join(dir, 'preflight.json'))) throw new MvError('MV_USAGE', 'run ' + o.extra.run + ' already has a preflight; use a new run id');
  }
  const rec = ed.preflight({ exe, root, instance: o.extra.instance, profile: o.extra.profile }, io);
  if (dir) mv.writeAtomic(path.join(dir, 'preflight.json'), JSON.stringify(rec, null, 1) + '\n');
  if (o.json) io.out(JSON.stringify(rec) + '\n');
  else {
    io.out((rec.ok ? 'ok' : 'refused\t' + rec.refuse.join(',')) + '\n');
    for (const n of ed.RUN_FILES) io.out('absent\t' + n + '\t' + (rec.absent[n] ? 'yes' : 'no') + '\n');
    for (const r of rec.running) io.out('running\t' + r + '\n');
  }
  if (!o.q) for (const n of rec.notes) io.err('mapviz edshot: ' + n.code + ': ' + n.text + '\n');
  return rec.ok ? EXIT.OK : EXIT.REFUSED;
}

function cmdWalk(o, io) {
  if (!o.extra.root) throw new MvError('MV_USAGE', 'give --root <folder>');
  const root = path.resolve(o.extra.root);
  const t0 = Date.now();
  const entries = ed.walk(root, { links: !o.extra.noLinks, skip: o.extra.skip || [] });
  const ms = Date.now() - t0;
  const sum = { files: 0, dirs: 0, links: 0, bytes: 0 };
  for (const e of entries) { if (e.dir) sum.dirs++; else { sum.files++; sum.bytes += e.size || 0; } if (e.link) sum.links++; }
  if (o.extra.run !== undefined) {
    const file = path.join(runDirOf(o.extra.run), 'walk-' + label(o.extra.label || 'before') + '.json');
    mv.writeAtomic(file, JSON.stringify({ v: 1, root, links: !o.extra.noLinks, skip: o.extra.skip || [], at: t0, ms, entries }) + '\n');
    if (o.json) io.out(JSON.stringify(Object.assign({ v: 1, root, count: entries.length, ms, file }, sum)) + '\n');
    else io.out('entries\t' + entries.length + '\tfiles\t' + sum.files + '\tdirs\t' + sum.dirs + '\tlinks\t' + sum.links + '\tbytes\t' + sum.bytes + '\tms\t' + ms + '\n');
    return EXIT.OK;
  }
  if (o.json) io.out(JSON.stringify({ v: 1, root, ms, entries }) + '\n');
  else for (const e of entries) io.out(e.rel + '\t' + e.size + '\t' + e.mtimeMs + '\t' + (e.link ? 'link' : e.dir ? 'dir' : 'file') + '\n');
  if (!o.q) io.err('mapviz edshot: ' + entries.length + ' entries in ' + ms + ' ms\n');
  return EXIT.OK;
}

function cmdDiff(o, io) {
  let a, b;
  const pos = o.pos.slice(1);
  if (pos.length === 2 && pos.every(p => /\.json$/i.test(p))) { a = readJson(path.resolve(pos[0]), 'walk file'); b = readJson(path.resolve(pos[1]), 'walk file'); }
  else {
    if (o.extra.run === undefined) throw new MvError('MV_USAGE', 'give --run <id>, or two walk files');
    const dir = runDirOf(o.extra.run);
    const [la, lb] = pos.length === 2 ? pos.map(label) : ['before', 'after'];
    a = readJson(path.join(dir, 'walk-' + la + '.json'), 'walk ' + la);
    b = readJson(path.join(dir, 'walk-' + lb + '.json'), 'walk ' + lb);
  }
  const scope = o.extra.scope || 'install';
  const route = o.extra.route || 'editor';
  if (!['editor', 'console'].includes(route)) throw new MvError('MV_USAGE', '--route must be editor or console, got ' + route);
  const expected = ed.expectedFor({ scope, route, bak: o.extra.bak }).concat(o.extra.expect || []);
  const d = ed.diff(a.entries || a, b.entries || b, expected);
  const bad = new Set(d.unexpected.map(u => u.rel));
  if (o.json) {
    io.out(JSON.stringify({ v: 1, scope, route, expected, added: d.added.map(e => e.rel), removed: d.removed.map(e => e.rel),
      changed: d.changed.map(c => ({ rel: c.rel, what: c.what })), unexpected: d.unexpected, limits: d.limits }) + '\n');
  } else {
    for (const e of d.added) io.out('added\t' + (bad.has(e.rel) ? 'UNEXPECTED' : 'expected') + '\t' + e.rel + '\n');
    for (const e of d.removed) io.out('removed\t' + (bad.has(e.rel) ? 'UNEXPECTED' : 'expected') + '\t' + e.rel + '\n');
    for (const c of d.changed) io.out('changed\t' + (bad.has(c.rel) ? 'UNEXPECTED' : 'expected') + '\t' + c.rel + '\t' + c.what.join(',') + '\n');
  }
  if (!o.q) for (const l of d.limits) io.err('mapviz edshot: not covered: ' + l + '\n');
  return d.unexpected.length ? EXIT.FINDINGS : EXIT.OK;
}

function cmdMoveout(o, io) {
  if (o.extra.run === undefined) throw new MvError('MV_USAGE', 'give --run <id>');
  const dir = runDirOf(o.extra.run);
  const rec = readJson(path.join(dir, 'preflight.json'), 'preflight record of run ' + o.extra.run);
  const root = o.extra.root ? path.resolve(o.extra.root) : rec.root;
  let moved;
  try { moved = ed.moveout(root, dir, rec, io); } catch (e) {
    if (e instanceof MvError && e.detail) { try { mv.writeAtomic(path.join(dir, 'moveout.json'), JSON.stringify(Object.assign({ v: 1, at: Date.now() }, e.detail)) + '\n'); } catch (e2) { /* the error below names it */ } }
    throw e;
  }
  mv.writeAtomic(path.join(dir, 'moveout.json'), JSON.stringify({ v: 1, at: Date.now(), moved, refused: [] }) + '\n');
  if (o.json) io.out(JSON.stringify({ v: 1, moved }) + '\n');
  else for (const m of moved) io.out('moved\t' + m.name + '\t' + m.to + '\n');
  return EXIT.OK;
}

function docFor(o) {
  const f = mv.findIn(o.in, 'mapdoc.json');
  if (f) return { doc: readJson(f, 'mapdoc.json'), file: f, src: null };
  if (o.target && o.map) {
    const kit = mv.opt(() => require('../lib/mapkit'), '../lib/mapkit', __filename);
    if (!kit) throw new MvError('MV_NOT_FOUND', 'no mapdoc.json in --in, and mapkit is not built yet');
    const src = kit.source({ target: o.target, game: mv.gameFolder(o), mods: o.mods, modDirs: o.modDirs });
    return { doc: kit.doc(src, o.map, { mode: o.mode, entities: false }), file: null, src };
  }
  throw new MvError('MV_USAGE', 'give --in <folder with mapdoc.json>, or --target and --map');
}

function cmdImport(o, io) {
  if (!o.extra.file) throw new MvError('MV_USAGE', 'give --file <png>');
  const file = path.resolve(o.extra.file);
  const d = docFor(o);
  let out;
  if (o.out) out = mv.checkOut(o.out, o);
  else if (o.extra.run !== undefined) out = runDirOf(o.extra.run);
  else throw new MvError('MV_USAGE', 'give --out <folder> or --run <id>');
  const grid = ed.importPicture(file, d.doc);
  const side = ed.sidecar(grid, d.doc);
  fs.mkdirSync(out, { recursive: true });
  require('../lib/raster/gridfile').write(path.join(out, 'pic.edshot.mvg'), grid);
  mv.writeAtomic(path.join(out, 'pic.edshot.json'), JSON.stringify(side, null, 1) + '\n');
  // every input (README 2.2, 8.3): the picture, the mapdoc.json, or the paks and loose map files mapkit read for the document
  const inputs = [file].concat(d.file ? [d.file] : []).map(f => { const s = fs.statSync(f); return { kind: 'loose', file: f, size: s.size, mtimeMs: s.mtimeMs }; });
  if (d.src && typeof d.src.reads === 'function') {
    const have = new Set(inputs.map(i => i.kind + ':' + path.resolve(i.file).toLowerCase()));
    for (const r of d.src.reads() || []) {
      const id = r.kind + ':' + path.resolve(r.file).toLowerCase();
      if (!have.has(id)) { have.add(id); inputs.push(r); }
    }
  }
  mv.writeAtomic(path.join(out, 'reads.json'), JSON.stringify({ v: 1, inputs }, null, 1) + '\n');
  const files = ['pic.edshot.mvg', 'pic.edshot.json', 'reads.json'];
  if (o.json) io.out(JSON.stringify({ v: 1, layer: grid.name, w: grid.w, h: grid.h, cell: grid.cell, box: side.box, out, files }) + '\n');
  else io.out('pic.edshot\t' + grid.w + 'x' + grid.h + '\tcell\t' + grid.cell + '\n');
  return EXIT.OK;
}

const RUN = { preflight: cmdPreflight, walk: cmdWalk, diff: cmdDiff, moveout: cmdMoveout, import: cmdImport };

// run(argv, io) -> exit code. io = {out(text), err(text), tasklist?, env?, rename?} (tests inject; default: the console)
function run(argv, io) {
  io = Object.assign({ out: s => process.stdout.write(s), err: s => process.stderr.write(s) }, io || {});
  argv = (argv || []).map(String);
  const json = argv.includes('--json');
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { io.out(helpText() + '\n'); return EXIT.OK; }
  const cmd = argv[0];
  try {
    if (!COMMANDS[cmd]) throw new MvError('MV_USAGE', 'no command ' + cmd + '; commands: ' + Object.keys(COMMANDS).join(', '));
    if (COMMANDS[cmd].built === false) throw new MvError('MV_NOT_BUILT', cmd + ': not built (MV-EDR, wave E)', { id: 'MV-EDR', wave: 'E' });
    const o = mv.parseArgs(argv, SPEC);
    return RUN[cmd](o, io);
  } catch (e) {
    const code = e instanceof MvError ? e.code : 'MV_FAULT';
    const msg = e instanceof MvError ? e.message : 'fault: ' + (e && e.message ? e.message : String(e));
    io.err('mapviz edshot: ' + msg + '\n');
    if (process.env.MAPVIZ_DEBUG && e && e.stack) io.err(e.stack + '\n');
    if (json) {
      const err = { code, msg, part: 'edshot' };
      if (e && e.detail !== undefined) err.detail = e.detail;
      io.out(JSON.stringify({ v: 1, error: err }) + '\n');
    }
    return mv.CODES[code];
  }
}

module.exports = { part: 'edshot', version: ed.VERSION, summary: 'editor shot, dry part', commands: COMMANDS, run };

if (require.main === module) process.exitCode = run(process.argv.slice(2));
