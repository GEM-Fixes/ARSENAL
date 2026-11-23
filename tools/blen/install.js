#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-0669dfd0)
'use strict';
// BLEN-1: install + enable the GEM2 Engine Tools Blender add-on on any machine. Node only, no deps.
//   node tools/blen/install.js [--blender PATH] [--from ZIP-OR-FOLDER | --url URL --sha256 HEX]
//                              [--name MODULE] [--check] [--dry-run]
// Blender is found by: --blender, $BLENDER, registry, Program Files, PATH.
// Profile follows Blender's own rules, so BLENDER_USER_SCRIPTS / BLENDER_USER_CONFIG redirect it (used by tests).
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const https = require('https');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// ---- pinned download. COORDINATOR FILLS BOTH after its own download; empty hash = refuse to use the URL.
const PINNED_URL = '';        // TODO(coordinator): release ZIP URL of GEM2 Engine Tools (not known to BLEN-1; no web access)
const PINNED_SHA256 = '';     // TODO(coordinator): sha256 of that ZIP, lowercase hex
const DEFAULT_NAME = 'gem2_engine_tools';
const OP_PREFIX = 'gem2';     // operators seen as bpy.ops.import_scene.gem2*

function die(m) { console.error('blen-install: ' + m); process.exit(1); }
function parse(argv) {
  const a = { flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--check' || k === '--dry-run') a.flags[k.slice(2)] = true;
    else if (k.startsWith('--')) { a[k.slice(2)] = argv[++i]; if (a[k.slice(2)] === undefined) die(k + ' needs a value'); }
    else die('unknown arg ' + k);
  }
  return a;
}

// ---- find Blender
function findBlender(opt) {
  const plat = require('../lib/platform');
  if (opt) return plat.findProgram({ exe: 'blender', path: opt }, { env: {} }) || die('--blender not found: ' + opt);
  return plat.findBlender() || die('Blender not found (tried BLENDER, registry, Program Files, PATH). Use --blender PATH');
}

// ---- minimal zip reader (stored + deflate)
function unzip(buf, dest) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) die('not a zip');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  const root = path.resolve(dest) + path.sep;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) die('bad zip directory');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl).replace(/\\/g, '/');
    p += 46 + nl + xl + cl;
    const out = path.resolve(dest, name);
    if (!out.startsWith(root)) die('zip entry escapes target: ' + name);  // zip-slip guard
    if (name.endsWith('/')) { fs.mkdirSync(out, { recursive: true }); continue; }
    const ds = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
    const raw = buf.subarray(ds, ds + csize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : die('zip method ' + method);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data); count++;
  }
  return count;
}

function download(url, hops = 5) {
  return new Promise((res, rej) => https.get(url, { headers: { 'User-Agent': 'as64-blen-install' } }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && hops > 0) { r.resume(); return res(download(new URL(r.headers.location, url).href, hops - 1)); }
    if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); }
    const ch = []; r.on('data', c => ch.push(c)); r.on('end', () => res(Buffer.concat(ch))); r.on('error', rej);
  }).on('error', rej));
}

// find the dir holding __init__.py with bl_info: root or one level down
function findPkg(dir) {
  const has = d => { try { return /bl_info/.test(fs.readFileSync(path.join(d, '__init__.py'), 'utf8')); } catch { return false; } };
  if (has(dir)) return dir;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) if (d.isDirectory() && has(path.join(dir, d.name))) return path.join(dir, d.name);
  return null;
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const d of fs.readdirSync(src, { withFileTypes: true })) {
    if (d.name === '__pycache__' || d.name === '.git') continue;
    const s = path.join(src, d.name), t = path.join(dst, d.name);
    if (d.isDirectory()) copyDir(s, t); else fs.copyFileSync(s, t);
  }
}

function blender(exe, pyExpr) {
  const r = spawnSync(exe, ['--background', '--python-expr', pyExpr], { encoding: 'utf8', timeout: 180000, maxBuffer: 1 << 26 });
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status };
}
const mark = (out, tag) => { const m = new RegExp('^' + tag + '=(.*)$', 'm').exec(out); return m ? m[1].trim() : null; };

(async () => {
  const a = parse(process.argv.slice(2));
  const name = a.name || DEFAULT_NAME;
  const exe = findBlender(a.blender);
  console.log('blender: ' + exe);
  const r1 = blender(exe, "import bpy;print('BLEN_VER='+bpy.app.version_string);print('BLEN_SCRIPTS='+bpy.utils.user_resource('SCRIPTS',path='',create=True))");
  const ver = mark(r1.out, 'BLEN_VER'), scripts = mark(r1.out, 'BLEN_SCRIPTS');
  if (!scripts) die('could not ask Blender for its scripts dir:\n' + r1.out.slice(-600));
  console.log('version: ' + ver + '\nuser scripts: ' + scripts);
  const target = path.join(scripts, 'addons', name);

  if (!a.flags.check) {
    let pkg, tmp;
    if (a.from) {
      if (!fs.existsSync(a.from)) die('--from not found: ' + a.from);
      if (fs.statSync(a.from).isDirectory()) pkg = findPkg(a.from);
      else { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blen-')); console.log('unzipped ' + unzip(fs.readFileSync(a.from), tmp) + ' files'); pkg = findPkg(tmp); }
    } else {
      const url = a.url || PINNED_URL, want = (a.sha256 || (a.url ? '' : PINNED_SHA256)).toLowerCase();
      if (!url) die('no source: give --from ZIP-OR-FOLDER, or fill PINNED_URL/PINNED_SHA256 in this file');
      if (!/^[0-9a-f]{64}$/.test(want)) die('refusing download without a sha256 (PINNED_SHA256 unset or --sha256 missing)');
      const buf = await download(url);
      const got = crypto.createHash('sha256').update(buf).digest('hex');
      if (got !== want) die('sha256 mismatch: got ' + got + ' want ' + want);
      console.log('download ok, ' + buf.length + ' bytes, sha256 matches');
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blen-')); unzip(buf, tmp); pkg = findPkg(tmp);
    }
    if (!pkg) die('no add-on (__init__.py with bl_info) in source');
    if (a.flags['dry-run']) { console.log('dry-run: would copy ' + pkg + ' -> ' + target); return; }
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });  // replaces only our own add-on dir
    copyDir(pkg, target);
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    console.log('installed: ' + target);
    const r2 = blender(exe, `import bpy,addon_utils
m=addon_utils.enable(${JSON.stringify(name)},default_set=True,persistent=True)
print('BLEN_ENABLED='+str(m is not None))
bpy.ops.wm.save_userpref()`);
    if (mark(r2.out, 'BLEN_ENABLED') !== 'True') die('enable failed:\n' + r2.out.slice(-1500));
    console.log('enabled and saved to user prefs');
  }
  // verify in a fresh Blender: add-on is on, import operators exist
  const r3 = blender(exe, `import bpy
print('BLEN_ON='+str(${JSON.stringify(name)} in bpy.context.preferences.addons))
print('BLEN_OPS='+','.join(sorted(o for o in dir(bpy.ops.import_scene) if o.startswith(${JSON.stringify(OP_PREFIX)}))))`);
  const on = mark(r3.out, 'BLEN_ON'), ops = (mark(r3.out, 'BLEN_OPS') || '').split(',').filter(Boolean);
  console.log('addon enabled in fresh start: ' + on + '\nimport operators: ' + (ops.join(' ') || '(none)'));
  if (on !== 'True' || !ops.length) die('verify failed');
  console.log('OK');
})().catch(e => die(e.message));
