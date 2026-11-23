#!/usr/bin/env node
// gimp: drive the user's GIMP 3 install (no window) for picture work: cutouts, layers, exports. Lib + CLI, node only; the scripts
// run inside GIMP's own Script-Fu (TinyScheme) interpreter, made here from named steps (no free script text from a caller of the
// MCP tools; the CLI `run --file` takes a script for a person at the keyboard).
//   node tools/gimp/gimp.js status [--json]                        where GIMP is, its version, how it was found
//   node tools/gimp/gimp.js job --steps steps.json [--json]         one batch of named steps (see STEPS below), one GIMP process
//   node tools/gimp/gimp.js cutout --in pic --out cut.png [--color r,g,b | --fuzzy x,y | --alpha | --rect x,y,w,h] [--threshold 30]
//        [--invert] [--grow n] [--shrink n] [--feather r] [--crop]       one cutout: the selection kept, the rest transparent
//   node tools/gimp/gimp.js layers --in pic --out dir --rect name:x,y,w,h ... [--xcf file]   one layer per rectangle (+ the rest)
//   node tools/gimp/gimp.js open --file a.xcf                       open a file in the GIMP window (the person's own session)
//   node tools/gimp/gimp.js run --file script.scm                   a script (person at the keyboard only)
// Finding GIMP: env ARSENAL_GIMP (the bin folder or the console exe), the Windows uninstall keys (GIMP 3*), Program Files\GIMP 3\bin,
// then PATH. GIMP 3 only (the 2.10 Script-Fu names differ: see README.md).
// Speed (measured 2026-11-22, GIMP 3.2.6, this machine): a GIMP start in batch mode costs about 4.4 s, a step on a card-sized picture
// a few ms, so every caller sends ONE batch with all its steps (a class of cards = one process); no Script-Fu server is kept.
// Pictures GIMP can not read as the game has them (.tga with odd headers, .dds) are turned into PNG first by tools/unitcard/lib/img.
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-6b928796)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const EXE = ['gimp-console-3.2.exe', 'gimp-console-3.exe', 'gimp-console.exe'];
const GUI_EXE = ['gimp-3.2.exe', 'gimp-3.exe', 'gimp.exe'];
let FOUND;
const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
function inBin(dir, names) { for (const n of names) { const p = path.join(dir, n); if (isFile(p)) return p; } return null; }
// -> { exe, gui, bin, source } or null
function find(opt) {
  if (FOUND !== undefined && !(opt && opt.fresh)) return FOUND;
  const tries = [];
  const env = process.env.ARSENAL_GIMP;
  if (env === 'none') return (FOUND = null);   // tests and users who want the built-in cutter only
  if (env) tries.push([isFile(env) ? path.dirname(env) : env, 'env ARSENAL_GIMP']);
  if (process.platform === 'win32' && !process.env.ARSENAL_GIMP_NOREG) {
    for (const root of ['HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall']) {
      try {
        const t = cp.execFileSync('reg', ['query', root, '/s', '/f', 'GIMP', '/d'], { encoding: 'latin1', timeout: 8000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
        const keys = t.split(/\r?\n/).filter(l => /^HKEY/.test(l));
        for (const k of keys) {
          let v; try { v = cp.execFileSync('reg', ['query', k, '/v', 'InstallLocation'], { encoding: 'latin1', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { continue; }
          const m = /InstallLocation\s+REG_\w+\s+(.+)/.exec(v); if (m) tries.push([path.join(m[1].trim(), 'bin'), 'registry ' + k.split('\\').pop()]);
        }
      } catch (e) { /* no match */ }
    }
  }
  for (const pf of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files'].filter(Boolean)) tries.push([path.join(pf, 'GIMP 3', 'bin'), 'Program Files']);
  for (const d of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) tries.push([d, 'PATH']);
  for (const [dir, source] of tries) {
    const exe = inBin(dir, EXE); if (exe) return (FOUND = { exe, gui: inBin(dir, GUI_EXE), bin: dir, source });
  }
  return (FOUND = null);
}
// version from the exe name or `--version` (fast: GIMP does not start for it)
function status() {
  const g = find(); if (!g) return { found: false, why: 'GIMP 3 was not found (env ARSENAL_GIMP, the uninstall keys, Program Files\\GIMP 3\\bin, PATH).' };
  let version = '';
  try { version = (/(\d+\.\d+(\.\d+)?)/.exec(cp.execFileSync(g.exe, ['--version'], { encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })) || [])[1] || ''; } catch (e) { version = ''; }
  const major = Number(version.split('.')[0]) || 0;
  return { found: major >= 3, exe: g.exe, gui: g.gui, bin: g.bin, source: g.source, version, why: major && major < 3 ? 'GIMP ' + version + ' is older than 3: the scripts here use the GIMP 3 names.' : undefined };
}

// ---------- Script-Fu ----------
const q = s => '"' + String(s).replace(/\\/g, '/').replace(/"/g, '\\"') + '"';
const n = v => { const x = Number(v); if (!Number.isFinite(x)) throw new Error('not a number: ' + v); return String(Math.round(x * 1000) / 1000); };
const OPS = { replace: 'CHANNEL-OP-REPLACE', add: 'CHANNEL-OP-ADD', subtract: 'CHANNEL-OP-SUBTRACT', intersect: 'CHANNEL-OP-INTERSECT' };
const opOf = o => OPS[o || 'replace'] || (() => { throw new Error('unknown selection op ' + o); })();
// STEPS (one image at a time is "current"; layers by name):
//   open {file}                 the picture as a new image (TGA/DDS turned into PNG first when needed)
//   layer {file, name}          another picture as a layer on top (same size), named
//   use {name}                  make the layer of that name current
//   select {by: color|fuzzy|alpha|rect|polygon|layer, rgb, x, y, w, h, points, layer, threshold, mode: replace|add|subtract|intersect}
//   grow {px}  shrink {px}  feather {px}  invert  none  border {px}
//   cut {name}                  a new layer: the current layer where selected, transparent elsewhere (the selection is kept)
//   clear                       make the selected part of the current layer transparent
//   difference {a, b, threshold, mode}   select where layers a and b AGREE within threshold (invert after for where they differ)
//   removebg {threshold}        fuzzy select from the four corners and clear (a plain backdrop)
//   merge {name}                merge the visible layers into one (top wins where it is not transparent)
//   hide {name}  show {name}  remove {name} (no error when the layer is gone, e.g. merged)  rename {name}
//   crop                        crop the image to the current layer's content;  scale {w, h}
//   export {file, name?}        the layer (or the current one) as a PNG with alpha;  xcf {file}  the whole image, layered
//   atlas {file, tiles: [{name, x, y}]}   layers from one sheet (each tile at -x,-y, cut to the image)
//   pack {file, w, h, tiles: [{name, x, y}]}   named layers into one sheet PNG (the caller cuts it up again)
//   say {text}                  a line in the log ("UC|text")
//   close                       drop the current image
function compile(steps) {
  const L = ['(define img 0) (define lay 0)', '(define (lay-by nm) (let ((l (car (gimp-image-get-layer-by-name img nm)))) (if (= l -1) (begin (gimp-message (string-append "UC|ERR no layer " nm)) lay) l)))',
    '(define (lay-top) (vector-ref (car (gimp-image-get-layers img)) 0))',
    '(define (load-as-layer f nm) (let ((l (car (gimp-file-load-layer RUN-NONINTERACTIVE img f)))) (gimp-image-insert-layer img l 0 0) (gimp-item-set-name l nm) (if (= (car (gimp-drawable-has-alpha l)) 0) (gimp-layer-add-alpha l)) l))',
    '(define (export-layer l f) (let* ((ex (car (gimp-image-new (car (gimp-image-get-width img)) (car (gimp-image-get-height img)) RGB))) (k (car (gimp-layer-new-from-drawable l ex)))) (gimp-image-insert-layer ex k 0 0) (gimp-item-set-visible k TRUE) (gimp-layer-resize-to-image-size k) (gimp-file-save RUN-NONINTERACTIVE ex f) (gimp-image-delete ex)))'];
  for (const s of steps) {
    const t = s.op;
    if (t === 'open') L.push('(set! img (car (gimp-file-load RUN-NONINTERACTIVE ' + q(s.file) + '))) (set! lay (lay-top)) (if (= (car (gimp-drawable-has-alpha lay)) 0) (gimp-layer-add-alpha lay)) (gimp-item-set-name lay ' + q(s.name || 'source') + ')');
    else if (t === 'layer') L.push('(set! lay (load-as-layer ' + q(s.file) + ' ' + q(s.name) + '))');
    else if (t === 'use') L.push('(set! lay (lay-by ' + q(s.name) + '))');
    else if (t === 'select') {
      const op = opOf(s.mode); if (s.threshold != null) L.push('(gimp-context-set-sample-threshold-int ' + n(s.threshold) + ')');
      L.push('(gimp-context-set-antialias ' + (s.antialias ? 'TRUE' : 'FALSE') + ') (gimp-context-set-feather FALSE) (gimp-context-set-sample-merged FALSE)');
      if (s.by === 'color') L.push('(gimp-image-select-color img ' + op + ' lay (list ' + s.rgb.map(n).join(' ') + '))');
      else if (s.by === 'fuzzy') L.push('(gimp-image-select-contiguous-color img ' + op + ' lay ' + n(s.x) + ' ' + n(s.y) + ')');
      else if (s.by === 'alpha') L.push('(gimp-image-select-item img ' + op + ' ' + (s.layer ? '(lay-by ' + q(s.layer) + ')' : 'lay') + ')');
      else if (s.by === 'layer') L.push('(gimp-image-select-item img ' + op + ' (lay-by ' + q(s.layer) + '))');
      else if (s.by === 'rect') L.push('(gimp-image-select-rectangle img ' + op + ' ' + [s.x, s.y, s.w, s.h].map(n).join(' ') + ')');
      else if (s.by === 'polygon') L.push('(gimp-image-select-polygon img ' + op + ' (vector ' + s.points.map(n).join(' ') + '))');
      else throw new Error('unknown select by ' + s.by);
    } else if (t === 'grow') L.push('(gimp-selection-grow img ' + n(s.px) + ')');
    else if (t === 'shrink') L.push('(gimp-selection-shrink img ' + n(s.px) + ')');
    else if (t === 'feather') L.push('(gimp-selection-feather img ' + n(s.px) + ')');
    else if (t === 'border') L.push('(gimp-selection-border img ' + n(s.px) + ')');
    else if (t === 'invert') L.push('(gimp-selection-invert img)');
    else if (t === 'none') L.push('(gimp-selection-none img)');
    else if (t === 'cut') L.push('(let ((nl (car (gimp-layer-new-from-drawable lay img)))) (gimp-image-insert-layer img nl 0 0) (gimp-item-set-name nl ' + q(s.name) + ') (if (= (car (gimp-selection-is-empty img)) 1) (gimp-drawable-edit-clear nl) (let ((sel (car (gimp-selection-save img)))) (gimp-selection-invert img) (if (= (car (gimp-selection-is-empty img)) 0) (gimp-drawable-edit-clear nl)) (gimp-image-select-item img CHANNEL-OP-REPLACE sel) (gimp-image-remove-channel img sel))) (set! lay nl))');
    else if (t === 'clear') L.push('(if (= (car (gimp-selection-is-empty img)) 0) (gimp-drawable-edit-clear lay))');
    else if (t === 'difference') {
      // a copy of b in DIFFERENCE mode over a copy of a, merged: black where they agree; then every pixel above the threshold
      L.push('(let* ((a (car (gimp-layer-copy (lay-by ' + q(s.a) + ')))) (b (car (gimp-layer-copy (lay-by ' + q(s.b) + '))))) (gimp-image-insert-layer img a 0 0) (gimp-image-insert-layer img b 0 0) (gimp-item-set-visible a TRUE) (gimp-item-set-visible b TRUE) (gimp-layer-set-mode b LAYER-MODE-DIFFERENCE) (let ((m (car (gimp-image-merge-down img b CLIP-TO-IMAGE)))) (gimp-layer-set-mode m LAYER-MODE-NORMAL) (gimp-context-set-background (list 0 0 0)) (gimp-layer-flatten m) (gimp-context-set-sample-threshold-int ' + n(s.threshold == null ? 24 : s.threshold) + ') (gimp-context-set-antialias FALSE) (gimp-image-select-color img ' + opOf(s.mode) + ' m (list 0 0 0)) (gimp-image-remove-layer img m)))');
    } else if (t === 'removebg') {
      L.push('(gimp-context-set-sample-threshold-int ' + n(s.threshold == null ? 30 : s.threshold) + ') (gimp-context-set-antialias TRUE) (let ((w (- (car (gimp-image-get-width img)) 1)) (h (- (car (gimp-image-get-height img)) 1))) (gimp-image-select-contiguous-color img CHANNEL-OP-REPLACE lay 0 0) (gimp-image-select-contiguous-color img CHANNEL-OP-ADD lay w 0) (gimp-image-select-contiguous-color img CHANNEL-OP-ADD lay 0 h) (gimp-image-select-contiguous-color img CHANNEL-OP-ADD lay w h)) (gimp-drawable-edit-clear lay) (gimp-selection-none img)');
    } else if (t === 'merge') L.push('(set! lay (car (gimp-image-merge-visible-layers img CLIP-TO-IMAGE))) (gimp-item-set-name lay ' + q(s.name || 'merged') + ')');
    else if (t === 'hide' || t === 'show') L.push('(let ((l (car (gimp-image-get-layer-by-name img ' + q(s.name) + ')))) (if (not (= l -1)) (gimp-item-set-visible l ' + (t === 'show' ? 'TRUE' : 'FALSE') + ')))');
    else if (t === 'remove') L.push('(let ((l (car (gimp-image-get-layer-by-name img ' + q(s.name) + ')))) (if (not (= l -1)) (begin (gimp-image-remove-layer img l) (set! lay (lay-top)))))');
    else if (t === 'rename') L.push('(gimp-item-set-name lay ' + q(s.name) + ')');
    else if (t === 'crop') L.push('(gimp-image-select-item img CHANNEL-OP-REPLACE lay) (let ((b (gimp-selection-bounds img))) (if (= (car b) 1) (gimp-image-crop img (- (list-ref b 3) (list-ref b 1)) (- (list-ref b 4) (list-ref b 2)) (list-ref b 1) (list-ref b 2)))) (gimp-selection-none img)');
    else if (t === 'scale') L.push('(gimp-context-set-interpolation INTERPOLATION-NOHALO) (gimp-image-scale img ' + n(s.w) + ' ' + n(s.h) + ')');
    else if (t === 'export') L.push('(export-layer ' + (s.name ? '(lay-by ' + q(s.name) + ')' : 'lay') + ' ' + q(s.file) + ') (gimp-message (string-append "UC|wrote " ' + q(s.file) + '))');
    else if (t === 'xcf') L.push('(gimp-selection-none img) (gimp-file-save RUN-NONINTERACTIVE img ' + q(s.file) + ') (gimp-message (string-append "UC|wrote " ' + q(s.file) + '))');
    else if (t === 'atlas') {
      // many pictures in one file (one plug-in call instead of one per picture): each tile becomes a layer of the current image
      L.push('(let* ((ai (car (gimp-file-load RUN-NONINTERACTIVE ' + q(s.file) + '))) (al (vector-ref (car (gimp-image-get-layers ai)) 0)))' +
        s.tiles.map(t2 => ' (let ((k (car (gimp-layer-new-from-drawable al img)))) (gimp-image-insert-layer img k 0 0) (gimp-item-set-name k ' + q(t2.name) + ') (gimp-layer-set-offsets k ' + n(-t2.x) + ' ' + n(-t2.y) + ') (gimp-layer-resize-to-image-size k) (if (= (car (gimp-drawable-has-alpha k)) 0) (gimp-layer-add-alpha k)))').join('') +
        ' (gimp-image-delete ai))');
    } else if (t === 'pack') {
      // the named layers side by side in one PNG (one plug-in call); tiles [{name, x, y}] in a w x h sheet
      L.push('(let* ((pi (car (gimp-image-new ' + n(s.w) + ' ' + n(s.h) + ' RGB))) (bgl (car (gimp-layer-new pi "sheet" ' + n(s.w) + ' ' + n(s.h) + ' RGBA-IMAGE 100 LAYER-MODE-NORMAL))))' +
        ' (gimp-image-insert-layer pi bgl 0 0) (gimp-drawable-edit-clear bgl)' +
        s.tiles.map(t2 => ' (let ((l (car (gimp-image-get-layer-by-name img ' + q(t2.name) + ')))) (if (not (= l -1)) (let ((k (car (gimp-layer-new-from-drawable l pi)))) (gimp-image-insert-layer pi k 0 0) (gimp-item-set-visible k TRUE) (gimp-layer-set-mode k LAYER-MODE-NORMAL) (gimp-layer-set-offsets k ' + n(t2.x) + ' ' + n(t2.y) + '))))').join('') +
        ' (gimp-image-merge-visible-layers pi CLIP-TO-IMAGE) (gimp-file-save RUN-NONINTERACTIVE pi ' + q(s.file) + ') (gimp-image-delete pi))');
      L.push('(gimp-message (string-append "UC|wrote " ' + q(s.file) + '))');
    } else if (t === 'say') L.push('(gimp-message ' + q('UC|' + s.text) + ')');
    else if (t === 'close') L.push('(gimp-image-delete img)');
    else throw new Error('unknown step ' + t);
  }
  return L.join('\n');
}

// ---------- running ----------
const MAXOUT = 40000;
// run a Script-Fu text in one GIMP process with no window. -> { ok, code, ms, lines: [UC lines], errors: [..], out }
function run(script, opt) {
  opt = opt || {};
  const g = find(); if (!g) return Promise.resolve({ ok: false, code: null, ms: 0, lines: [], errors: ['GIMP 3 was not found'], out: '' });
  const args = ['-i', '-n', '--no-splash', '-d', '-f', '--no-shm', '--batch-interpreter', 'plug-in-script-fu-eval', '-b', '-'];
  const t0 = Date.now();
  return new Promise(res => {
    let out = '', done = false;
    const ch = cp.spawn(g.exe, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: Object.assign({}, process.env, { GEGL_SWAP: opt.swap || process.env.ARSENAL_TMP || os.tmpdir() }) });
    const add = d => { if (out.length < MAXOUT * 4) out += d.toString('utf8'); };
    ch.stdout.on('data', add); ch.stderr.on('data', add);
    const timer = setTimeout(() => { if (!done) { try { ch.kill(); } catch (e) { /* gone */ } } }, opt.timeout || 10 * 60 * 1000);
    if (opt.onChild) opt.onChild(ch);
    ch.on('error', e => { if (done) return; done = true; clearTimeout(timer); res({ ok: false, code: null, ms: Date.now() - t0, lines: [], errors: [String(e.message)], out: '' }); });
    ch.on('close', code => {
      if (done) return; done = true; clearTimeout(timer);
      const lines = [], errors = [];
      for (const l of out.split(/\r?\n/)) {
        const m = /UC\|(.*)$/.exec(l); if (m) { (m[1].startsWith('ERR') ? errors : lines).push(m[1]); continue; }
        if (/Error:|error:|execution error|unbound variable|Procedure execution of .* failed/i.test(l) && !/GEGL|GeglBuffer/.test(l)) errors.push(l.trim());
      }
      res({ ok: code === 0 && !errors.length, code, ms: Date.now() - t0, lines, errors, out: out.length > MAXOUT ? out.slice(0, MAXOUT) + '\n...cut' : out });
    });
    ch.stdin.end(script + '\n(gimp-quit 0)\n');
  });
}
// a picture GIMP will read: PNG/JPG/BMP as they are; TGA and DDS through the repo's decoder into tmp (PNG)
function readable(file, tmp) {
  if (/\.(png|jpe?g|bmp)$/i.test(file)) return file;
  const I = require('../unitcard/lib/img');
  const p = I.decode(fs.readFileSync(file), file);
  fs.mkdirSync(tmp, { recursive: true });
  const out = path.join(tmp, path.basename(file).replace(/\.[^.]+$/, '') + '_' + require('crypto').createHash('md5').update(path.resolve(file)).digest('hex').slice(0, 8) + '.png');
  fs.writeFileSync(out, I.png(p));
  return out;
}
function job(steps, opt) { for (const s of steps) if ((s.op === 'export' || s.op === 'xcf' || s.op === 'pack') && s.file) fs.mkdirSync(path.dirname(path.resolve(s.file)), { recursive: true }); return run(compile(steps), opt); }
// open a file in the GIMP window (detached: the person's own GIMP session)
function openGui(file) {
  const g = find(); if (!g || !g.gui) throw new Error('GIMP (window) was not found');
  const ch = cp.spawn(g.gui, [path.resolve(file)], { detached: true, stdio: 'ignore', windowsHide: false });
  ch.unref(); return { started: true, exe: g.gui, file: path.resolve(file) };
}

// ---------- CLI ----------
function args(argv) {
  const o = { _: [], rect: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2), v = argv[i + 1]; if (v == null || v.startsWith('--')) o[k] = true; else { if (k === 'rect') o.rect.push(v); else o[k] = v; i++; } }
    else o._.push(a);
  }
  return o;
}
const nums = s => String(s).split(',').map(Number);
async function main() {
  const o = args(process.argv.slice(2)), cmd = o._[0];
  const say = (obj, text) => process.stdout.write((o.json ? JSON.stringify(obj, null, 1) : text) + '\n');
  if (!cmd || o.help) { process.stdout.write(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).slice(0, 13).map(l => l.slice(3)).join('\n') + '\n'); return 0; }
  if (cmd === 'status') { const s = status(); say(s, s.found ? 'GIMP ' + s.version + ' at ' + s.exe + ' (found by ' + s.source + ')' : 'not found: ' + s.why); return s.found ? 0 : 1; }
  const tmp = path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'gimp-in');
  if (cmd === 'job') { const steps = JSON.parse(fs.readFileSync(o.steps, 'utf8')); for (const s of steps) if (s.op === 'open' || s.op === 'layer') s.file = readable(s.file, tmp); const r = await job(steps); say(r, (r.ok ? 'ok' : 'FAILED') + ' in ' + r.ms + ' ms\n' + r.lines.concat(r.errors).join('\n')); return r.ok ? 0 : 1; }
  if (cmd === 'run') { if (!o.file) throw new Error('give --file script.scm'); const r = await run(fs.readFileSync(o.file, 'utf8')); say(r, (r.ok ? 'ok' : 'FAILED') + ' in ' + r.ms + ' ms\n' + r.out); return r.ok ? 0 : 1; }
  if (cmd === 'open') { say(openGui(o.file), 'opened ' + o.file + ' in GIMP'); return 0; }
  if (cmd === 'cutout') {
    if (!o.in || !o.out) throw new Error('give --in and --out');
    const steps = cutoutSteps(readable(o.in, tmp), o.out, { color: o.color ? nums(o.color) : null, fuzzy: o.fuzzy ? nums(o.fuzzy) : null, alpha: !!o.alpha, rect: o.rect[0] ? nums(o.rect[0]) : null,
      threshold: o.threshold != null ? +o.threshold : undefined, invert: !!o.invert, grow: +o.grow || 0, shrink: +o.shrink || 0, feather: +o.feather || 0, crop: !!o.crop });
    const r = await job(steps); say(r, (r.ok ? 'wrote ' + o.out : 'FAILED') + ' (' + r.ms + ' ms)' + (r.errors.length ? '\n' + r.errors.join('\n') : '')); return r.ok ? 0 : 1;
  }
  if (cmd === 'layers') {
    if (!o.in || !o.out) throw new Error('give --in and --out');
    const rects = o.rect.map(s => { const [nm, v] = s.split(':'); return { name: nm, r: nums(v) }; });
    const r = await job(layersSteps(readable(o.in, tmp), o.out, rects, o.xcf)); say(r, (r.ok ? 'ok' : 'FAILED') + ' (' + r.ms + ' ms)\n' + r.lines.concat(r.errors).join('\n')); return r.ok ? 0 : 1;
  }
  throw new Error('unknown command ' + cmd);
}
// one cutout: select by a rule, refine, keep the selection, export
function cutoutSteps(file, out, c) {
  const s = [{ op: 'open', file }];
  if (c.color) s.push({ op: 'select', by: 'color', rgb: c.color, threshold: c.threshold == null ? 30 : c.threshold });
  else if (c.fuzzy) s.push({ op: 'select', by: 'fuzzy', x: c.fuzzy[0], y: c.fuzzy[1], threshold: c.threshold == null ? 30 : c.threshold });
  else if (c.rect) s.push({ op: 'select', by: 'rect', x: c.rect[0], y: c.rect[1], w: c.rect[2], h: c.rect[3] });
  else if (c.polygon) s.push({ op: 'select', by: 'polygon', points: c.polygon });
  else s.push({ op: 'select', by: 'alpha' });
  if (c.invert) s.push({ op: 'invert' });
  if (c.grow) s.push({ op: 'grow', px: c.grow }); if (c.shrink) s.push({ op: 'shrink', px: c.shrink }); if (c.feather) s.push({ op: 'feather', px: c.feather });
  s.push({ op: 'cut', name: 'cutout' }, { op: 'none' });
  if (c.crop) s.push({ op: 'crop' });
  s.push({ op: 'export', file: out, name: 'cutout' }, { op: 'close' });
  return s;
}
// a picture split by rectangles: one layer per rectangle, "rest" = what no rectangle took; PNG per layer + optional .xcf
function layersSteps(file, dir, rects, xcf) {
  const R = r => ({ x: r.r[0], y: r.r[1], w: r.r[2], h: r.r[3] });
  const s = [{ op: 'open', file }];
  for (const r of rects) s.push({ op: 'use', name: 'source' }, Object.assign({ op: 'select', by: 'rect' }, R(r)), { op: 'cut', name: r.name });
  s.push({ op: 'use', name: 'source' }, { op: 'none' });
  for (const r of rects) s.push(Object.assign({ op: 'select', by: 'rect', mode: 'add' }, R(r)));
  s.push({ op: 'clear' }, { op: 'none' }, { op: 'rename', name: 'rest' });
  for (const r of rects) s.push({ op: 'export', file: path.join(dir, r.name + '.png'), name: r.name });
  s.push({ op: 'export', file: path.join(dir, 'rest.png'), name: 'rest' });
  if (xcf) s.push({ op: 'xcf', file: xcf });
  s.push({ op: 'close' });
  return s;
}
module.exports = { find, status, compile, run, job, readable, openGui, cutoutSteps, layersSteps };
if (require.main === module) main().then(c => { process.exitCode = c; }, e => { process.stderr.write('gimp: ' + (e && e.message || e) + '\n'); process.exitCode = 2; });
