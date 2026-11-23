// mcp tools, group `gimp`: picture work through the user's own GIMP 3 install (tools/gimp/gimp.js), run with no window in batch
// mode, one GIMP process per call. Contract: tools/mcp/README.md.
//   mow_gimp_status   where GIMP is and its version (read)
//   mow_gimp_cutout   one cutout of a picture by colour / fuzzy point / alpha / rectangle, refined, as a PNG with alpha (write)
//   mow_gimp_layers   a picture split into named rectangle layers, PNG per layer and a layered .xcf (write)
//   mow_gimp_run      one NAMED job (removebg, crop, scale, cutout, layers) with its fields; no free script text (write)
//   mow_card_cutouts  the cutout set the unit card maker uses (plates per frame state, frame, army strip, badges, subject masks,
//                     a layered .xcf per class) for a game's card kinds, into the cutout cache (write)
// Inputs may be game files (read only, TGA and DDS turned into PNG in the scratch folder first); every output path goes through
// ctx.guard.write, so it must sit inside a folder of ARSENAL_WRITE_ROOTS, and nothing is written without write: true.
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-d35c4c1b)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const G = () => require('../../gimp/gimp');

const GAMES = ['as64', 'mowas2', 'goh'];
const P = {
  game: { type: 'string', enum: GAMES, description: 'as64 (default), mowas2 or goh: only names the game for mow_card_cutouts; the picture tools work the same for all three' },
  input: { type: 'string', description: 'Full path of the picture to cut (PNG, JPG, BMP, TGA or DDS; game files are only read)' },
  output: { type: 'string', description: 'Full path of the PNG to write (inside a folder of ARSENAL_WRITE_ROOTS)' },
  write: { type: 'boolean', description: 'true = do it; left out = a preview of what would be written' },
};
const schema = (properties, required) => ({ type: 'object', properties: Object.assign({ game: P.game }, properties), required: required || [] });
const lines = a => a.filter(x => x != null && x !== '').join('\n');
const tmpDir = () => path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'gimp-in');
const fwd = p => String(p).replace(/\\/g, '/');

function need(ctx) {
  const s = G().status();
  if (!s.found) throw ctx.refusal((s.why || 'GIMP 3 was not found') + ' Install GIMP 3 (gimp.org) or set env ARSENAL_GIMP to its bin folder. The unit card maker works without it (built-in cutter).');
  return s;
}
function inputOf(ctx, v) {
  const f = path.resolve(ctx.name(v, 'input'));
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) throw ctx.refusal('no such picture: ' + v);
  if (!/\.(png|jpe?g|bmp|tga|dds)$/i.test(f)) throw ctx.refusal('not a picture GIMP is given here (png, jpg, bmp, tga, dds): ' + path.basename(f));
  return f;
}
const num = (ctx, v, what, lo, hi) => { if (v == null) return undefined; const x = Number(v); if (!Number.isFinite(x) || x < lo || x > hi) throw ctx.refusal(what + ' must be a number from ' + lo + ' to ' + hi); return x; };
const nums = (ctx, a, n, what) => { if (a == null) return null; if (!Array.isArray(a) || a.length !== n || !a.every(x => Number.isFinite(Number(x)))) throw ctx.refusal(what + ' must be ' + n + ' numbers'); return a.map(Number); };
// preview or do: every target through the guard first
async function writeOr(ctx, targets, steps, what) {
  if (!ctx.guard.writing) {
    const why = targets.map(t => ctx.guard.canWrite(t)).find(Boolean);
    return { text: lines(['Preview: ' + what, ...targets.map(t => '- would write ' + fwd(t)), why ? 'A write there would be refused: ' + why : 'Nothing was written. Pass write: true to run GIMP.']), data: { preview: true, targets: targets.map(fwd), steps: steps.length, refused: why || null } };
  }
  for (const t of targets) ctx.guard.write(t);
  const r = await G().job(steps, { timeout: 10 * 60 * 1000 });
  if (!r.ok) return { text: 'GIMP failed after ' + r.ms + ' ms: ' + r.errors.slice(0, 4).join(' | '), isError: true, data: { errors: r.errors } };
  return { text: lines([what + ': done in ' + r.ms + ' ms (GIMP batch, no window).', ...targets.map(t => '- ' + fwd(t) + (fs.existsSync(t) ? '' : ' (not made)'))]), data: { ms: r.ms, written: targets.filter(t => fs.existsSync(t)).map(fwd) } };
}
function ruleOf(ctx, a) {
  const c = { threshold: num(ctx, a.threshold, 'threshold', 0, 255), invert: !!a.invert, grow: num(ctx, a.grow, 'grow', 0, 64) || 0, shrink: num(ctx, a.shrink, 'shrink', 0, 64) || 0, feather: num(ctx, a.feather, 'feather', 0, 64) || 0, crop: !!a.crop };
  const by = a.by || 'alpha';
  if (by === 'color') c.color = nums(ctx, a.rgb, 3, 'rgb');
  else if (by === 'fuzzy') c.fuzzy = nums(ctx, a.point, 2, 'point');
  else if (by === 'rect') c.rect = nums(ctx, a.rect, 4, 'rect');
  else if (by === 'polygon') { if (!Array.isArray(a.points) || a.points.length < 6 || a.points.length % 2 || a.points.length > 400) throw ctx.refusal('points must be x,y pairs (3 to 200 points)'); c.polygon = a.points.map(Number); }
  else if (by !== 'alpha') throw ctx.refusal('by must be alpha, color, fuzzy, rect or polygon');
  return c;
}
const CUT = { by: { type: 'string', enum: ['alpha', 'color', 'fuzzy', 'rect', 'polygon'], description: 'How to select: alpha (what is not transparent), color (every pixel near rgb), fuzzy (the region around point), rect, polygon' },
  rgb: { type: 'array', items: { type: 'number' }, description: 'by color: r,g,b' }, point: { type: 'array', items: { type: 'number' }, description: 'by fuzzy: x,y' },
  rect: { type: 'array', items: { type: 'number' }, description: 'by rect: x,y,w,h' }, points: { type: 'array', items: { type: 'number' }, description: 'by polygon: x1,y1,x2,y2,...' },
  threshold: { type: 'number', description: 'colour distance for color and fuzzy (0..255, default 30)' }, invert: { type: 'boolean', description: 'keep what is NOT selected (e.g. by color on a plain backdrop)' },
  grow: { type: 'number', description: 'px' }, shrink: { type: 'number', description: 'px' }, feather: { type: 'number', description: 'px of soft edge' }, crop: { type: 'boolean', description: 'crop to what is kept' } };

async function status(args, ctx) {
  const s = G().status();
  if (!s.found) return { text: lines([s.why || 'GIMP 3 was not found.', 'The unit card maker then uses its built-in cutter (pure node). Install GIMP 3 or set env ARSENAL_GIMP to its bin folder.']), data: s };
  return { text: lines(['GIMP ' + s.version + ' at ' + fwd(s.exe) + ' (found by ' + s.source + ').', s.gui ? 'Window exe: ' + fwd(s.gui) + ' (used to open a .xcf for hand edits).' : 'No window exe next to it: .xcf files can not be opened from here.', 'Batch mode: one GIMP start per call costs about 4 s; a whole class of cards is one call.']), data: s };
}
async function cutout(args, ctx) {
  need(ctx);
  const inp = inputOf(ctx, args.input), out = path.resolve(ctx.name(args.output, 'output'));
  if (!/\.png$/i.test(out)) return ctx.bad('output must be a .png');
  const steps = G().cutoutSteps(ctx.guard.writing ? G().readable(inp, tmpDir()) : inp, out, ruleOf(ctx, args));
  return writeOr(ctx, [out], steps, 'cutout of ' + path.basename(inp) + ' by ' + (args.by || 'alpha'));
}
async function layers(args, ctx) {
  need(ctx);
  const inp = inputOf(ctx, args.input), dir = path.resolve(ctx.name(args.folder, 'folder'));
  if (!Array.isArray(args.rects) || !args.rects.length || args.rects.length > 64) return ctx.bad('rects: 1 to 64 of { name, x, y, w, h }');
  const rects = args.rects.map(r => { if (!r || !/^[a-z0-9_]{1,40}$/i.test(String(r.name || '')) || r.name === 'rest' || r.name === 'source') throw ctx.refusal('a rect name is letters, digits and _ (not rest or source): ' + JSON.stringify(r && r.name)); return { name: r.name, r: nums(ctx, [r.x, r.y, r.w, r.h], 4, 'rect ' + r.name) }; });
  const xcf = args.xcf ? path.join(dir, 'layers.xcf') : null;
  const steps = G().layersSteps(ctx.guard.writing ? G().readable(inp, tmpDir()) : inp, dir, rects, xcf);
  return writeOr(ctx, rects.map(r => path.join(dir, r.name + '.png')).concat([path.join(dir, 'rest.png')], xcf ? [xcf] : []), steps, path.basename(inp) + ' in ' + rects.length + ' layer(s) + rest');
}
// named jobs: each one a fixed list of steps with checked fields
const JOBS = {
  removebg: { what: 'the plain backdrop removed (fuzzy select from the corners)', steps: (i, o, a, ctx) => [{ op: 'open', file: i }, { op: 'removebg', threshold: num(ctx, a.threshold, 'threshold', 0, 255) || 24 }, { op: 'export', file: o }, { op: 'close' }] },
  crop: { what: 'cropped to its content', steps: (i, o) => [{ op: 'open', file: i }, { op: 'crop' }, { op: 'export', file: o }, { op: 'close' }] },
  scale: { what: 'scaled (NoHalo)', steps: (i, o, a, ctx) => [{ op: 'open', file: i }, { op: 'scale', w: num(ctx, a.w, 'w', 1, 4096), h: num(ctx, a.h, 'h', 1, 4096) }, { op: 'export', file: o }, { op: 'close' }] },
};
async function runJob(args, ctx) {
  need(ctx);
  const nm = String(args.job || '');
  if (nm === 'cutout') return cutout(args, ctx);
  if (nm === 'layers') return layers(args, ctx);
  const J = JOBS[nm]; if (!J) return ctx.bad('job must be one of cutout, layers, ' + Object.keys(JOBS).join(', ') + ' (no free script text)');
  if (nm === 'scale' && (args.w == null || args.h == null)) return ctx.bad('scale needs w and h');
  const inp = inputOf(ctx, args.input), out = path.resolve(ctx.name(args.output, 'output'));
  if (!/\.png$/i.test(out)) return ctx.bad('output must be a .png');
  return writeOr(ctx, [out], J.steps(ctx.guard.writing ? G().readable(inp, tmpDir()) : inp, out, args, ctx), path.basename(inp) + ' ' + J.what);
}
async function cardCutouts(args, ctx) {
  const g = ctx.game(args);
  if (!g.dir) return ctx.bad('no ' + g.name + ' install was found (env ARSENAL_AS2_DIR / ARSENAL_GOH_DIR or the GUI settings)');
  const root = path.resolve(args.root ? ctx.name(args.root, 'root') : require('../../unitcard/lib/cutouts').rootOf({}));
  const argv = ['cutouts', '--game', g.id === 'goh' ? 'goh' : 'as64', '--dir', g.dir, '--root', root, '--json'];
  for (const k of ['kind', 'group', 'army']) if (args[k]) { if (!/^[a-z0-9_]{1,24}$/i.test(String(args[k]))) return ctx.bad(k + ' is a plain word'); argv.push('--' + k, String(args[k])); }
  if (args.force) argv.push('--force');
  const s = G().status();
  if (!ctx.guard.writing) {
    const why = ctx.guard.canWrite(root);
    return { text: lines(['Preview: the card cutout set of ' + g.name + (args.kind ? ' kind ' + args.kind : ' (every card kind, class and army)') + ' into ' + fwd(root) + '.',
      s.found ? 'GIMP ' + s.version + ' does the cutting (about 10 to 25 s per class; a class already cut is kept unless force).' : 'GIMP was not found: nothing would be built, the card maker uses its built-in cutter.',
      why ? 'A write there would be refused: ' + why : 'Nothing was written. Pass write: true to build.']), data: { preview: true, root: fwd(root), gimp: s.found ? s.version : null, refused: why || null } };
  }
  ctx.guard.write(root);
  if (!s.found) return { text: 'GIMP was not found (' + (s.why || '') + '): nothing to build; the unit card maker uses its built-in cutter.', data: { gimp: null } };
  const r = await ctx.run('unitcard', argv, { timeout: 60 * 60 * 1000, max: 400000 });
  let d = null; try { d = JSON.parse(r.stdout); } catch (e) { d = null; }
  if (!d) return { text: 'unitcard cutouts gave no answer: ' + ctx.cut(r.text, 2000), isError: true };
  const rows = d.rows.filter(x => x.kind);
  return { text: lines([rows.length + ' class(es) in ' + Math.round(d.ms / 1000) + ' s, cache ' + fwd(d.root) + ' ' + (d.bytes / 1048576).toFixed(1) + ' MB, GIMP ' + d.gimp.version + '.',
    ...rows.slice(0, 60).map(x => '- ' + x.kind + '/' + x.group + '(' + (x.army || 'all') + '): ' + (x.cutter === 'gimp' ? (x.reused ? 'kept from the cache' : 'cut by GIMP') : 'built-in cutter: ' + x.why) + (x.kept && x.kept.length ? '; your edits kept: ' + x.kept.join(', ') : '')),
    'The Units page (Card) shows the cutouts with their source, opens a class .xcf in GIMP and redoes a class.']), data: d };
}

const W = { write: P.write };
module.exports = { group: 'gimp', tools: [
  { name: 'mow_gimp_status', title: 'GIMP install', description: 'Use first when a picture job needs GIMP: where the GIMP 3 install is (env ARSENAL_GIMP, the uninstall keys, Program Files\\GIMP 3\\bin, PATH), its version and the window exe. Without GIMP the unit card maker uses its built-in cutter. All three games.', inputSchema: schema({}), games: GAMES, kind: 'read', handler: status },
  { name: 'mow_gimp_cutout', title: 'Cut out a picture part', description: 'Cuts one part of a picture with GIMP (no window): select by alpha, colour, a fuzzy point, a rectangle or a polygon, grow, shrink, feather, invert, crop; writes a PNG with alpha. TGA and DDS are read through the repo decoder. Preview unless write: true; output inside ARSENAL_WRITE_ROOTS.', inputSchema: schema(Object.assign({ input: P.input, output: P.output }, CUT, W), ['input', 'output']), games: GAMES, kind: 'write', handler: cutout },
  { name: 'mow_gimp_layers', title: 'Split a picture into layers', description: 'Splits a picture into named rectangle layers with GIMP: one PNG per rectangle, rest.png for what no rectangle took, and a layered layers.xcf when xcf is true. Preview unless write: true; folder inside ARSENAL_WRITE_ROOTS.', inputSchema: schema({ input: P.input, folder: { type: 'string', description: 'Full path of the folder for the PNGs' }, rects: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } }, description: 'Rectangles: [{ name, x, y, w, h }]' }, xcf: { type: 'boolean', description: 'also save a layered .xcf' }, write: P.write }, ['input', 'folder', 'rects']), games: GAMES, kind: 'write', handler: layers },
  { name: 'mow_gimp_run', title: 'Run a named GIMP job', description: 'Runs one named GIMP job on a picture: removebg (plain backdrop out), crop (to content), scale (w, h, NoHalo), cutout (same fields as mow_gimp_cutout), layers (same as mow_gimp_layers). Only these names: no free script text. Preview unless write: true.', inputSchema: schema(Object.assign({ job: { type: 'string', enum: ['removebg', 'crop', 'scale', 'cutout', 'layers'] }, input: P.input, output: P.output, folder: { type: 'string' }, rects: { type: 'array', items: { type: 'object' } }, xcf: { type: 'boolean' }, w: { type: 'number' }, h: { type: 'number' } }, CUT, W), ['job', 'input']), games: GAMES, kind: 'write', handler: runJob },
  { name: 'mow_card_cutouts', title: 'Card cutout set', description: 'Builds the cutout set the unit card maker (Units page, Card) uses for a game: per card kind, class and army the plate of each frame state with the subject removed, the frame with exact alpha, the army strip, each class badge, a subject mask per reference and a layered class.xcf; GIMP does the cutting, one process per class. Kept when already cut (a hand-edited file is never overwritten; force redoes it). Into the cutout cache (env ARSENAL_CUTOUTS, else %LOCALAPPDATA%\\ARSENAL\\cutouts) or root. Preview unless write: true; the root must be inside ARSENAL_WRITE_ROOTS. as64 and mowas2 share one set; goh has its own.', inputSchema: schema({ kind: { type: 'string', description: 'card, small, squad, portrait, shop or scheme; left out = all' }, group: { type: 'string', description: 'infantry, vehicle, gun, hero' }, army: { type: 'string', description: 'army word as in the card names (rus, ger, usa ...)' }, force: { type: 'boolean', description: 'cut again even when cached (your hand edits are then replaced)' }, root: { type: 'string', description: 'Full path of the cache folder' }, write: P.write }), games: GAMES, kind: 'write', handler: cardCutouts },
] };
