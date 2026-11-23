// entcat cli (MV-ENT): `node tools/mapviz/mapviz.js entcat <command> [flags]` (tools/mapviz/README.md 1.7).
//   def   --def <name | vfs key> common [--json]          one catalog entry
//   map   --map K common [--mode M] [--in D] --out D [--json]   entcat.json + objects.json + reads.json
//   stack common --out D [--json]                         entcat.json (every def of the stack) + reads.json
// common = --target T [--game G] [--mods a,b] [--mod-dir D]. Exit 0; 1 when some defs failed (listed); 3 not found.
// map: mapdoc.json from the first --in folder that holds one, else computed (mapkit doc). Objects = the map's own records
// (src 'map') plus, with --mode, that mode's .mi records; without --mode the .mi records are left out (every mode would
// stack its flags and spawns on one picture) [I]. Structure parts: the {Link} records and the roots' Placer seats come from
// the doc's entities[].link and entities[].seats; an old mapdoc.json with neither has them read from the map file (and the
// mode's .mi) by links.js; link and place notes go to --json `notes` and stderr.
// Light at load: nothing is read and nothing heavy is required until run.
// Author: Imperator_Aug (ARSENAL, ia-11deebcd)
'use strict';
const path = require('path');

const VERSION = 2;   // = index.js VERSION
const SPEC = { def: 'str' };
const STACK_RELEASE = 400;   // stack: drop the loader's scenes after every 400 defs built (memory stays bounded on GoH)
const COMMON = '--target T [--game G] [--mods a,b] [--mod-dir D]';

function mv() { return require('../mapviz'); }
const json = x => JSON.stringify(x) + '\n';
const out = s => process.stdout.write(s);
const err = s => process.stderr.write(s);

function srcOf(o) {
  const M = mv();
  if (!o.target) throw new M.MvError('MV_USAGE', '--target as64|mowas2|goh is needed');
  return require('../lib/mapkit').source({ target: o.target, game: o.game, mods: o.mods, modDirs: o.modDirs });
}
function writeJson(dir, name, x) { return mv().writeAtomic(path.join(dir, name), json(x)); }
function writeReads(dir, src, L, extra) {
  src.addInputs(require('./index').readsOf(L));
  if (extra) src.addInputs(extra);
  return writeJson(dir, 'reads.json', { v: 1, inputs: src.reads() });
}
function counts(cat) {
  const c = {};
  for (const k of require('./index').CATEGORIES) c[k] = 0;
  for (const e of Object.values(cat.entries)) c[e.category]++;
  return c;
}
function failLines(failed) { return failed.map(f => 'failed ' + f.def + ' ' + f.code + ': ' + f.msg + '\n').join(''); }

function cmdDef(o) {
  const M = mv(), E = require('./index');
  const def = o.extra.def;
  if (!def) throw new M.MvError('MV_USAGE', '--def <entity name or vfs key> is needed');
  const src = srcOf(o);
  const L = E.loaderFor(src);
  let en;
  try { en = E.entry(src, def, L); } catch (e) {
    if (e.code === 'ENTCAT_DEF_MISSING') throw new M.MvError('MV_NOT_FOUND', e.message, { def, code: e.code });
    const f = { def: String(def).toLowerCase(), code: /^ENTCAT_/.test(e.code || '') ? e.code : 'ENTCAT_FAULT', msg: e.message };
    if (o.json) out(json({ v: 1, def: f.def, entry: null, failed: [f] }));
    else err(failLines([f]));
    return 1;
  }
  if (o.json) { out(json({ v: 1, def: en.def, entry: en, failed: [] })); return 0; }
  const fp = en.footprint;
  out([
    en.def + '  ' + en.category + ' (' + en.categoryRule + ')  ' + en.path,
    'footprint ' + (fp ? fp.kind + ' from ' + fp.source + ', ' + fp.zones.length + ' zone(s)' : 'none') + '  height ' + (en.height === null ? '-' : en.height / 20 + ' m'),
    'volumes ' + en.volumes.length + '  cover ' + en.cover.band + (en.cover.hard ? ' hard' : '') + (en.cover.conceal ? ' conceal' : '') +
      '  sight ' + (en.sight.hard ? 'hard' : en.sight.enters ? 'soft' : 'none') + '  obstacleID ' + (en.obstacleId || '-'),
    'crushBy tank ' + en.crushBy.tank + ' tank.light ' + en.crushBy.tankLight + ' armored ' + en.crushBy.armored + ' car ' + en.crushBy.car,
  ].concat(en.notes.map(n => 'note ' + n.code + ': ' + n.msg)).join('\n') + '\n');
  return 0;
}

function loadDoc(o, src) {
  const fs = require('fs');
  const f = mv().findIn(o.in, 'mapdoc.json');
  if (f) {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (d && d.key === o.map && (!d.game || d.game === src.target)) return { doc: d, file: f };
  }
  return { doc: require('../lib/mapkit').doc(src, o.map, { mode: o.mode }), file: null };
}

function cmdMap(o) {
  const M = mv(), E = require('./index');
  if (!o.map) throw new M.MvError('MV_USAGE', '--map <map key> is needed');
  if (!o.out) throw new M.MvError('MV_USAGE', '--out <folder> is needed for entcat map');
  const src = srcOf(o);
  const dir = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  const pr = M.progress(o);
  pr.stage('doc');
  const { doc, file } = loadDoc(o, src);
  if (o.mode && doc.modes && !doc.modes.some(m => m.id === o.mode)) throw new M.MvError('MV_NOT_FOUND', 'map ' + o.map + ' has no mode ' + o.mode, { map: o.map, mode: o.mode });
  const sub = E.docForMode(doc, o.mode);
  const L = E.loaderFor(src);
  pr.stage('links');
  const links = E.linksFor(src, o.map, sub, { mode: o.mode });   // null: the doc carries its links
  const cat = E.forDoc(src, sub, { loader: L, progress: pr, links });
  pr.stage('place');
  const placed = E.place(sub, cat, links);
  const items = placed.map(x => Object.assign({ kind: 'object' }, x));
  const linkNotes = links ? links.notes.map(n => Object.assign({ uid: null, def: null }, n))
    : (doc.notes || []).filter(n => n && n.code === 'MAPKIT_LINK_NESTED').map(n => ({ code: n.code, uid: null, def: null, msg: n.text }));
  const notes = linkNotes.concat(placed.notes);
  writeJson(dir, 'entcat.json', cat);
  writeJson(dir, 'objects.json', { v: 1, kind: 'vector', name: 'objects', items });
  writeReads(dir, src, L, file ? [{ kind: 'loose', file }] : null);
  const body = { v: 1, map: o.map, mode: o.mode || null, files: ['entcat.json', 'objects.json', 'reads.json'], defs: Object.keys(cat.entries).length + cat.failed.length,
    objects: items.length, counts: counts(cat), failed: cat.failed, notes };
  if (o.json) out(json(body));
  else {
    if (!o.q) out('entcat of ' + o.map + (o.mode ? ' (' + o.mode + ')' : '') + ': ' + body.defs + ' defs, ' + items.length + ' objects, ' + cat.failed.length + ' failed' +
      (notes.length ? ', ' + notes.length + ' notes' : '') + '\n');
    err(failLines(cat.failed));
    err(notes.map(n => 'note ' + n.code + (n.uid === null ? '' : ' ' + n.uid + ' ' + n.def) + ': ' + n.msg + '\n').join(''));
  }
  return cat.failed.length ? 1 : 0;
}

function cmdStack(o) {
  const M = mv(), E = require('./index');
  if (!o.out) throw new M.MvError('MV_USAGE', '--out <folder> is needed for entcat stack');
  const src = srcOf(o);
  const dir = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  const pr = M.progress(o);
  const L = E.loaderFor(src);
  const cat = E.catalog(src, { loader: L, progress: pr, release: STACK_RELEASE });
  writeJson(dir, 'entcat.json', cat);
  writeReads(dir, src, L);
  const body = { v: 1, files: ['entcat.json', 'reads.json'], defs: Object.keys(cat.entries).length + cat.failed.length, counts: counts(cat), failed: cat.failed };
  if (o.json) out(json(body));
  else {
    if (!o.q) out('entcat of the stack: ' + body.defs + ' defs, ' + cat.failed.length + ' failed\n');
    err(failLines(cat.failed));
  }
  return cat.failed.length ? 1 : 0;
}

const RUN = { def: cmdDef, map: cmdMap, stack: cmdStack };

module.exports = {
  part: 'entcat',
  version: VERSION,
  summary: 'what an object is: category, footprint, volumes and heights per def; the objects of a map',
  commands: {
    def: { args: '--def <name | vfs key> ' + COMMON + ' [--json]', summary: 'one catalog entry' },
    map: { args: COMMON + ' --map K [--mode M] [--in D] --out D [--json]', summary: 'entcat.json, objects.json and reads.json of one map' },
    stack: { args: COMMON + ' --out D [--json]', summary: 'entcat.json of every def in the game and stack' },
  },
  run(argv) {
    const M = mv();
    const cmd = argv[0];
    if (!RUN[cmd]) throw new M.MvError('MV_USAGE', 'no entcat command ' + cmd);
    const o = M.parseArgs(argv.slice(1), SPEC);
    if (o.pos.length) throw new M.MvError('MV_USAGE', 'unexpected argument ' + o.pos[0]);
    return RUN[cmd](o);
  },
};
