#!/usr/bin/env node
// Build ARSENAL Setup: one installer file per system, no dependencies on the user's computer (tools/installer/README.md).
// Each carries the small ARSENAL package (tools, launchers, guide, indexes; NO Node.js, NO historical document database) and
// sets Node.js up on the user's computer from nodejs.org with a pinned sha256.
// usage: node tools/installer/build.js [--payload ARSENAL-<ver>-small.zip] [--out dir] [--work dir] [--only t,t]
//          [--historical-url U] [--historical-sha256 S] [--historical-bytes N] [-- <zip.js options>] | --describe <file> | --help
//   --payload: the small package to carry. Without it: node tools/dist/zip.js --small --out-dir <work>/zip <zip.js options>.
//   --out:     where the installers go (default <checkout>/../run/installer). --work: build folder (default <out>/work).
//   --with-node dir: also build ARSENAL-Setup-<ver>-<target>-node, with the pinned Node.js program inside (no download at install).
//              dir = cache of the pinned archives; a missing one is downloaded from nodejs.org and checked against the pin's sha256.
//   --only:    targets, of windows-x64 windows-arm64 linux-x64 linux-arm64 macos-x64 macos-arm64 (default all six).
//   --historical-*: the download link of the historical index, over tools/installer/config.json.
//   --describe: print the sha256 and size of a file (the historical index to upload), for tools/installer/config.json.
// Needs the Go toolchain (the build machine only): ARSENAL_GO=<path to go>, else `go` on PATH. Nothing is downloaded.
// Output: ARSENAL-Setup-<ver>-<target>[.exe] and a .sha256 beside each.
// Author: Imperator_Aug (ARSENAL, ia-e2ff1872)
'use strict';
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawnSync } = require('child_process');
const HERE = __dirname, SRC = path.join(HERE, 'src'), ROOT = path.resolve(HERE, '..', '..');
const TARGETS = { 'windows-x64': ['windows', 'amd64', '.exe'], 'windows-arm64': ['windows', 'arm64', '.exe'], 'linux-x64': ['linux', 'amd64', ''], 'linux-arm64': ['linux', 'arm64', ''], 'macos-x64': ['darwin', 'amd64', ''], 'macos-arm64': ['darwin', 'arm64', ''] };
const die = (m, c = 2) => { console.error('error: ' + m); process.exit(c); };

function args(a) {
  const o = { out: path.resolve(ROOT, '..', 'run', 'installer'), only: Object.keys(TARGETS), rest: [], hist: {} };
  for (let i = 0; i < a.length; i++) {
    const v = () => { if (a[i + 1] === undefined) die(a[i] + ' needs a value'); return a[++i]; };
    if (a[i] === '--') { o.rest = a.slice(i + 1); break; }
    else if (a[i] === '--payload') o.payload = path.resolve(v());
    else if (a[i] === '--out') o.out = path.resolve(v());
    else if (a[i] === '--work') o.work = path.resolve(v());
    else if (a[i] === '--with-node') o.withNode = path.resolve(v());
    else if (a[i] === '--only') o.only = v().split(',').filter(Boolean);
    else if (a[i] === '--historical-url') o.hist.url = v();
    else if (a[i] === '--historical-sha256') o.hist.sha256 = v().toLowerCase();
    else if (a[i] === '--historical-bytes') o.hist.bytes = Number(v());
    else die('unknown option ' + a[i] + ' (--help lists them)');
  }
  for (const t of o.only) if (!TARGETS[t]) die('unknown target ' + t + ' (one of ' + Object.keys(TARGETS).join(' ') + ')');
  o.work = o.work || path.join(o.out, 'work');
  return o;
}

// the top folder of a zip: the name in its first local file header
function zipTop(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) die('the payload is not a zip');
  const name = buf.toString('utf8', 30, 30 + buf.readUInt16LE(26)), i = name.indexOf('/');
  if (i < 1) die('the payload zip has no top folder (first entry ' + name + ')');
  return name.slice(0, i + 1);
}

// config(): what the installer carries as config.json, from the Node.js pin, tools/installer/config.json and the options
function config(top, hist) {
  const pin = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'dist', 'launch', 'node-pin.json'), 'utf8'));
  const own = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
  const { MIN_MAJOR } = require('../dist/launch.js');
  const files = {}, bad = [];
  for (const [k, f] of Object.entries(own.nodeInstallers)) files[k] = f;
  for (const k of ['linux-x64', 'linux-arm64']) if (pin.files[k]) files[k] = pin.files[k];
  for (const [k, f] of Object.entries(files)) {
    if (!f.file.includes('v' + pin.version)) bad.push(`${k}: ${f.file} is not Node.js ${pin.version} (the pin in tools/dist/launch/node-pin.json)`);
    if (!/^[0-9a-f]{64}$/.test(f.sha256)) bad.push(`${k}: sha256 is not 64 hex digits`);
  }
  if (!/^https:\/\/nodejs\.org\/dist\/v[\d.]+\/$/.test(pin.base)) bad.push('pin base ' + pin.base + ' is not https://nodejs.org/dist/v<version>/');
  const h = Object.assign({ url: '', sha256: '', bytes: 0 }, own.historical, hist);
  if (h.url && !/^https:\/\//.test(h.url)) bad.push('historical url must start with https://');
  if (h.sha256 && !/^[0-9a-f]{64}$/.test(h.sha256)) bad.push('historical sha256 is not 64 hex digits');
  if (!(Number.isInteger(h.bytes) && h.bytes >= 0)) bad.push('historical bytes must be a whole number');
  if (bad.length) die(bad.join('\n       '));
  return { version: top.replace(/^ARSENAL-|\/$/g, ''), top, node: { version: pin.version, minMajor: MIN_MAJOR, base: pin.base, files }, historical: h };
}

// refuse a payload that carries what the installer must not: Node.js, the single exe, the historical document database
function checkPayload(buf) {
  const bad = [], eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) die('the payload zip has no end record');
  let p = buf.readUInt32LE(eocd + 16), n = buf.readUInt16LE(eocd + 10), launch = 0;
  if (p === 0xffffffff || n === 0xffff) die('the payload is a zip64 file: too large for an installer payload (is the historical database inside?)');
  for (let i = 0; i < n; i++) {
    const name = buf.toString('utf8', p + 46, p + 46 + buf.readUInt16LE(p + 28));
    if (/(^|\/)(node(\.exe)?|ARSENAL\.exe)$/i.test(name) || /\/node\/[^/]+\/node(\.exe)?$/.test(name)) bad.push(name + ' (a program: the installer sets Node.js up on the computer, it carries none)');
    if (/\/ww2sources\/index\.sqlite$/.test(name)) bad.push(name + ' (the historical index is downloaded, not carried)');
    if (/^[^/]+\/(ARSENAL\.cmd|ARSENAL-gui\.cmd|arsenal|arsenal-gui)$/.test(name)) launch++;
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  if (launch !== 4) bad.push('the four launchers (ARSENAL.cmd, ARSENAL-gui.cmd, arsenal, arsenal-gui) are not all at the top: this is not the small package');
  if (bad.length) die('the payload cannot go into the installer:\n       ' + bad.join('\n       '));
  return n;
}

// nodeBin(target, cache) -> the Node.js program of the pin for that system, from <cache>/<pin key>/node[.exe]. A file that is not
// there yet is taken from the pinned archive in <cache>, which is downloaded from the pin's base (nodejs.org) when absent; the
// archive's sha256 must be the pin's, else nothing is used.
const PINKEY = { 'windows-x64': 'win-x64', 'windows-arm64': 'win-arm64', 'linux-x64': 'linux-x64', 'linux-arm64': 'linux-arm64', 'macos-x64': 'darwin-x64', 'macos-arm64': 'darwin-arm64' };
function nodeBin(t, cache) {
  const pin = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'dist', 'launch', 'node-pin.json'), 'utf8')), key = PINKEY[t], f = pin.files[key];
  if (!f) die('no Node.js is pinned for ' + t + ' (tools/dist/launch/node-pin.json)');
  const win = key.startsWith('win-'), dir = path.join(cache, pin.version, key), bin = path.join(dir, win ? 'node.exe' : 'node');
  if (fs.existsSync(bin) && fs.statSync(bin).size > 1 << 20) return bin;
  if (!pin.base.startsWith('https://nodejs.org/dist/v')) die('pin base ' + pin.base + ' is not https://nodejs.org/dist/v<version>/');
  fs.mkdirSync(dir, { recursive: true });
  const arc = path.join(cache, f.file);
  if (!fs.existsSync(arc)) {
    console.log('node: downloading ' + pin.base + f.file);
    const curl = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'curl.exe') : 'curl';
    const r = spawnSync(curl, ['-fsSL', '--proto', '=https', '-o', arc + '.part', pin.base + f.file], { stdio: 'inherit' });
    if (r.status !== 0) { fs.rmSync(arc + '.part', { force: true }); die('download of ' + f.file + ' failed', 1); }
    fs.renameSync(arc + '.part', arc);
  }
  const sha = crypto.createHash('sha256').update(fs.readFileSync(arc)).digest('hex');
  if (sha !== f.sha256) die(arc + ': sha256 ' + sha + ' is not the pinned ' + f.sha256 + ' (delete the file to fetch it again)', 1);
  const stem = (f.file.endsWith('.zip') ? f.file.slice(0, -4) : f.file.slice(0, -7)), tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe') : 'tar';
  const x = spawnSync(tar, win ? ['-xf', arc, '-C', dir, '--strip-components=1', stem + '/node.exe'] : ['-xf', arc, '-C', dir, '--strip-components=2', stem + '/bin/node'], { encoding: 'utf8' });
  if (x.status !== 0 || !fs.existsSync(bin)) die('could not unpack the node program from ' + arc + ': ' + (x.stderr || ''), 1);
  return bin;
}

// --describe <file>: the three values tools/installer/config.json wants for the historical index (name, sha256, bytes)
function describe(file) {
  if (!file || !fs.existsSync(file)) die('--describe: no file ' + file);
  const h = crypto.createHash('sha256'), fd = fs.openSync(file, 'r'), b = Buffer.alloc(1 << 22);
  for (let n; (n = fs.readSync(fd, b, 0, b.length, null)) > 0;) h.update(b.subarray(0, n));
  fs.closeSync(fd);
  console.log(`  file:   ${file}\n  sha256: ${h.digest('hex')}\n  bytes:  ${fs.statSync(file).size}`);
}

function main(argv = process.argv.slice(2)) {
  if (argv[0] === '--describe') return describe(argv[1] && path.resolve(argv[1]));
  const o = args(argv);
  const go = process.env.ARSENAL_GO || 'go';
  const gv = spawnSync(go, ['version'], { encoding: 'utf8' });
  if (gv.status !== 0) die('the Go toolchain was not found (' + go + '). Set ARSENAL_GO to the go program, or put go on PATH. Only the build machine needs it.');
  fs.mkdirSync(o.work, { recursive: true });
  if (!o.payload) {
    const zd = path.join(o.work, 'zip');
    const r = spawnSync(process.execPath, [path.join(HERE, '..', 'dist', 'zip.js'), '--small', '--out-dir', zd, ...o.rest], { encoding: 'utf8', maxBuffer: 1 << 28 });
    const m = /^wrote (.+)$/m.exec(r.stdout || '');
    if (r.status !== 0 || !m) { process.stderr.write((r.stdout || '').split('\n').filter(l => !/^  ARSENAL-|^WARN embedded /.test(l)).join('\n') + (r.stderr || '')); die('the small package did not build (node tools/dist/zip.js --small ended with ' + r.status + ')', 1); }
    o.payload = path.resolve(m[1].trim().split(/\s+\(/)[0]);
    if (!fs.existsSync(o.payload)) { const z = fs.readdirSync(zd).filter(f => /-small\.zip$/.test(f)).sort().pop(); if (!z) die('zip.js wrote no small zip into ' + zd, 1); o.payload = path.join(zd, z); }
  }
  if (/-ww2\.zip$/.test(o.payload)) die('the payload ' + path.basename(o.payload) + ' is a build with the historical database; the installer carries the plain small package');
  const buf = fs.readFileSync(o.payload), count = checkPayload(buf), top = zipTop(buf), cfg = config(top, o.hist);
  fs.writeFileSync(path.join(SRC, 'payload.zip'), buf);
  fs.writeFileSync(path.join(SRC, 'config.json'), JSON.stringify(cfg, null, 1) + '\n');
  require('./icon.js').write(SRC);
  console.log(`payload: ${path.basename(o.payload)} (${count} entries, ${(buf.length / 1048576).toFixed(1)} MB), ARSENAL ${cfg.version}, Node.js pin ${cfg.node.version}, historical link ${cfg.historical.url || 'not set'}`);
  console.log(gv.stdout.trim());
  fs.mkdirSync(o.out, { recursive: true });
  const env = Object.assign({}, process.env, { CGO_ENABLED: '0', GOFLAGS: '-buildvcs=false', GOCACHE: path.join(o.work, 'gocache'), GOTOOLCHAIN: 'local', GOTELEMETRY: 'off', GOPROXY: 'off' });
  const priv = /-private.zip$/.test(o.payload);   // the private edition (zip.js --private-add): the installers say so in their name
  const own = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
  const vetted = new Set(), zlib = require('zlib');
  fs.writeFileSync(path.join(SRC, 'node.bin.gz'), Buffer.alloc(0));
  for (const t of o.only) {
    const [GOOS, GOARCH, ext] = TARGETS[t], e = Object.assign({}, env, { GOOS, GOARCH });
    if (!vetted.has(GOOS)) {
      vetted.add(GOOS);
      const v = spawnSync(go, ['vet', '.'], { cwd: SRC, env: e, encoding: 'utf8' });
      if (v.status !== 0) { process.stderr.write(v.stdout + v.stderr); die('go vet failed for ' + GOOS, 1); }
    }
    // each target: the small installer, and with --with-node a second one that carries Node.js inside (name ends in -node)
    for (const withNode of (o.withNode ? [false, true] : [false])) {
      fs.writeFileSync(path.join(SRC, 'node.bin.gz'), withNode ? zlib.gzipSync(fs.readFileSync(nodeBin(t, o.withNode)), { level: 9 }) : Buffer.alloc(0));
      const name = `ARSENAL-Setup-${cfg.version}-${priv ? 'private-' : ''}${t}${withNode ? '-node' : ''}${ext}`, outFile = path.join(o.out, name);
      // Windows: version, publisher, icon and manifest resources, linked from a .syso beside main.go (tools/installer/winres.js)
      for (const f of fs.readdirSync(SRC)) if (/.syso$/.test(f)) fs.rmSync(path.join(SRC, f));
      if (GOOS === 'windows') require('./winres.js').write(SRC, GOARCH, { version: cfg.version, name, description: 'ARSENAL Setup' + (priv ? ' (private edition)' : ''), product: 'ARSENAL', company: own.publisher || 'Imperator_Aug', copyright: own.copyright || 'Copyright Imperator_Aug. Apache License 2.0.', png: fs.readFileSync(path.join(SRC, 'icon.png')) });
      const b = spawnSync(go, ['build', '-trimpath', '-ldflags', '-s -w', '-o', outFile, '.'], { cwd: SRC, env: e, encoding: 'utf8' });
      if (b.status !== 0) { process.stderr.write(b.stdout + b.stderr); die('go build failed for ' + t, 1); }
      const sha = crypto.createHash('sha256').update(fs.readFileSync(outFile)).digest('hex');
      fs.writeFileSync(outFile + '.sha256', `${sha}  ${name}\n`);
      for (const f of fs.readdirSync(SRC)) if (/.syso$/.test(f)) fs.rmSync(path.join(SRC, f));
      console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB) sha256 ${sha}`);
    }
  }
  fs.writeFileSync(path.join(SRC, 'node.bin.gz'), Buffer.alloc(0));
}
module.exports = { main, nodeBin, config, checkPayload, zipTop, TARGETS };
if (require.main === module) main();
