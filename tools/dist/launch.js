// Small package launchers: ARSENAL.cmd, ARSENAL-gui.cmd (Windows, plain cmd) and arsenal, arsenal-gui (POSIX sh, Linux and macOS),
// rendered from tools/dist/launch/launcher.{cmd,sh}.tpl with the Node.js pin baked in (no JSON parsing at run time).
// Used by zip.js --small (writes them at the zip top level) and by its release gate (a launcher must equal these bytes).
//   render(pin, {arsenalVersion, keys, moduleOnly}, test) -> {name: Buffer}     pin = tools/dist/launch/node-pin.json shape
//   readPin(file) -> pin;  checkPin(pin, test) -> [problems]  (release: https, host nodejs.org; test: http://127.0.0.1:<port>/ only)
//   test: {sys, mach} = the system the sh launchers believe they run on. Only tools/dist/test passes it (through zip.js main's
//   second argument, which the command line never sets); a test launcher says TEST BUILD in its head.
// MIN_MAJOR: the lowest Node.js major a node on PATH may have. The tools are tested on 26 only.
// Author: Imperator_Aug (ARSENAL, ia-e985fd71)
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'launch');
const MIN_MAJOR = 26;
const NAMES = ['ARSENAL.cmd', 'ARSENAL-gui.cmd', 'arsenal', 'arsenal-gui'];
const SYSTEMS = ['win-x64', 'win-arm64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'];

function readPin(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function checkPin(pin, test) {
  const f = [];
  if (!pin || typeof pin !== 'object') return ['pin: not an object'];
  const v = String(pin.version || '');
  if (!/^\d+\.\d+\.\d+$/.test(v)) f.push(`pin version "${v}": want N.N.N`);
  else if (Number(v.split('.')[0]) < MIN_MAJOR) f.push(`pin version ${v}: below MIN_MAJOR ${MIN_MAJOR}`);
  const base = String(pin.base || '');
  if (test) { if (!/^http:\/\/127\.0\.0\.1:\d{1,5}\/$/.test(base)) f.push(`test pin base "${base}": want http://127.0.0.1:<port>/`); }
  else {
    let u = null; try { u = new URL(base); } catch (e) { /* below */ }
    if (!u || u.protocol !== 'https:' || u.host !== 'nodejs.org' || u.username || u.password || u.search || u.hash || !/^\/dist\/[A-Za-z0-9._/-]*\/$/.test(u.pathname) || u.href !== base)
      f.push(`pin base "${base}": the download must come from https://nodejs.org/dist/.../ (the builder refuses any other place)`);
  }
  const files = pin.files || {};
  for (const k of Object.keys(files)) if (!SYSTEMS.includes(k)) f.push(`pin files: unknown system "${k}"`);
  for (const k of SYSTEMS) {
    const e = files[k], ext = k.startsWith('win-') ? 'zip' : 'tar.gz';
    if (!e) { f.push(`pin files: ${k} missing`); continue; }
    if (e.file !== `node-v${v}-${k}.${ext}`) f.push(`pin files ${k}: file "${e.file}", want node-v${v}-${k}.${ext}`);
    if (!/^[0-9a-f]{64}$/.test(String(e.sha256 || ''))) f.push(`pin files ${k}: sha256 must be 64 lowercase hex`);
  }
  return f;
}

// the names sea-main.js refuses (const X = new Set([...]) there), so the plain-file run refuses the same ones
function seaSet(name) {
  const src = fs.readFileSync(path.join(__dirname, 'sea-main.js'), 'utf8');
  const m = new RegExp('const ' + name + '\\s*=\\s*new Set\\(\\[([^\\]]*)\\]\\)').exec(src);
  if (!m) throw new Error(`sea-main.js: const ${name} = new Set([...]) not found`);
  return [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map(x => x[1]);
}
// gate lists, limited to tools the package actually carries (an absent name answers "unknown tool" from as2.js anyway)
function gateLists(keys, moduleOnly) {
  const K = new Set(keys), has = n => K.has(n + '/' + n + '.js');
  const dev = new Set(seaSet('DEV')), needs = seaSet('NEEDS_SRC');
  return {
    moduleOnly: String(moduleOnly || '').split(',').filter(has),
    needsTop: needs.filter(n => !dev.has(n) && has(n)),
    needsDev: needs.filter(n => dev.has(n) && has(n)),
    soedit: has('soedit'),
  };
}
const SRC_MSG = n => `error: '${n}' needs the source tree (webs): run it from an ARSENAL source checkout with node tools/as2/as2.js`;
const SOEDIT_MSG = 'soedit build: SOEdit is not part of ARSENAL. ARSENAL soedit install, or the Open SOEdit button on the Models page, downloads it.';
function cmdGate(g) {
  const L = [], loop = (list, cond, label) => { if (list.length) L.push(`${cond}for %%T in (${list.join(' ')}) do if "%~${cond ? 2 : 1}"=="%%T" (set "AR_T=%%T" & goto :${label})`); };
  loop(g.moduleOnly, '', 'ar_unknown'); loop(g.moduleOnly, 'if "%~1"=="dev" ', 'ar_unknown');
  loop(g.needsTop, '', 'ar_needsrc'); loop(g.needsDev, 'if "%~1"=="dev" ', 'ar_needsrc');
  if (g.soedit) L.push('if "%~1"=="soedit" if "%~2"=="build" goto :ar_soedit');
  const R = [
    ':ar_unknown', "echo error: unknown tool '%AR_T%' (ARSENAL help) 1>&2", 'exit /b 2',
    ':ar_needsrc', `echo ${SRC_MSG('%AR_T%')} 1>&2`, 'exit /b 2',
    ':ar_soedit', `echo ${SOEDIT_MSG} 1>&2`, 'exit /b 2',
  ];
  return { gate: L.length ? L.join('\n') : 'rem (none)', refusals: R.join('\n') };
}
function shGate(g) {
  const top = [], dev = [];
  if (g.moduleOnly.length) { top.push(`  ${g.moduleOnly.join('|')}) ar_say "error: unknown tool '$1' (ARSENAL help)"; exit 2 ;;`); dev.push(`    ${g.moduleOnly.join('|')}) ar_say "error: unknown tool '$2' (ARSENAL help)"; exit 2 ;;`); }
  if (g.needsTop.length) top.push(`  ${g.needsTop.join('|')}) ar_say "${SRC_MSG('$1')}"; exit 2 ;;`);
  if (g.needsDev.length) dev.push(`    ${g.needsDev.join('|')}) ar_say "${SRC_MSG('$2')}"; exit 2 ;;`);
  if (dev.length) top.push('  dev) case ${2-} in', ...dev, '  esac ;;');
  if (g.soedit) top.push(`  soedit) if [ "\${2-}" = build ]; then ar_say "${SOEDIT_MSG}"; exit 2; fi ;;`);
  return top.length ? ['case ${1-} in', ...top, 'esac'].join('\n') : ': none';
}

// render(pin, {arsenalVersion, keys}, test) -> {name: Buffer}; throws on a bad pin or a placeholder left over
function render(pin, o, test) {
  const bad = checkPin(pin, test);
  if (bad.length) throw new Error('launcher pin refused: ' + bad.join('; '));
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(String(o.arsenalVersion))) throw new Error('launcher: bad ARSENAL version "' + o.arsenalVersion + '"');
  if (test && !(/^\w+$/.test(test.sys || '') && /^\w+$/.test(test.mach || ''))) throw new Error('launcher test: want {sys, mach} words');
  const g = gateLists(o.keys, o.moduleOnly), cg = cmdGate(g);
  const head = (c) => [
    `${c} ARSENAL launcher. Generated by tools/dist/zip.js --small from tools/dist/launch/launcher.*.tpl; the release gate refuses any other bytes.`,
    `${c} Starts the ARSENAL tools in ./tools with Node.js: ARSENAL_NODE, else a copy fetched before (./node/${pin.version} or the per-user folder),`,
    `${c} else a node ${MIN_MAJOR}+ on PATH, else it downloads Node.js ${pin.version} from ${pin.base}, checks the sha256 below, and keeps only the node binary.`,
    `${c} Author: Imperator_Aug (ARSENAL)`,
    ...(test ? [`${c} TEST BUILD: fetches from a loopback test server; never released.`] : []),
  ].join('\n');
  const common = { NODE_VERSION: pin.version, MIN_MAJOR: String(MIN_MAJOR), BASE: pin.base, ARSENAL_VERSION: String(o.arsenalVersion), PROTO: test ? '=http,https' : '=https' };
  const fill = (tpl, vals) => {
    const out = tpl.replace(/@@([A-Z0-9_]+)@@/g, (m, k) => { if (!(k in vals)) throw new Error('launcher template: no value for ' + m); return vals[k]; });
    return out;
  };
  const cmdT = fs.readFileSync(path.join(DIR, 'launcher.cmd.tpl'), 'utf8').replace(/\r\n/g, '\n');
  const shT = fs.readFileSync(path.join(DIR, 'launcher.sh.tpl'), 'utf8').replace(/\r\n/g, '\n');
  const posixFiles = SYSTEMS.filter(k => !k.startsWith('win-')).map(k => `    ${k}) AR_FILE='${pin.files[k].file}'; AR_SHA='${pin.files[k].sha256}' ;;`).join('\n');
  const out = {};
  for (const gui of [0, 1]) {
    const cmd = fill(cmdT, { ...common, HEAD: head('rem'), GUI: String(gui), GATE: cg.gate, REFUSALS: cg.refusals,
      WIN_X64_FILE: pin.files['win-x64'].file, WIN_X64_SHA: pin.files['win-x64'].sha256, WIN_ARM64_FILE: pin.files['win-arm64'].file, WIN_ARM64_SHA: pin.files['win-arm64'].sha256 });
    const sh = fill(shT, { ...common, HEAD: head('#'), GUI: String(gui), GATE: shGate(g), POSIX_FILES: posixFiles,
      SYS: test ? `'${test.sys}'` : '$(uname -s 2>/dev/null)', MACH: test ? `'${test.mach}'` : '$(uname -m 2>/dev/null)', WGET: test ? 'wget' : 'wget --https-only' });
    out[gui ? 'ARSENAL-gui.cmd' : 'ARSENAL.cmd'] = Buffer.from(cmd.replace(/\n/g, '\r\n'), 'ascii');   // cmd: CRLF (labels and goto misbehave on LF)
    out[gui ? 'arsenal-gui' : 'arsenal'] = Buffer.from(sh, 'ascii');                                      // sh: LF only, whatever the checkout did
  }
  for (const [n, b] of Object.entries(out)) if (/[^\x09\x0a\x0d\x20-\x7e]/.test(b.toString('latin1'))) throw new Error(`launcher ${n}: non-ASCII byte`);
  return out;
}
// W6 U1: the installer (both zips, top level) and the exe zip's ARSENAL-gui.cmd. Builder bytes = what the release gate demands.
//   installer() -> Buffer: tools/dist/launch/Install-ARSENAL.cmd, CRLF, ASCII only. No pin inside: the small download's node comes
//   through its own ARSENAL.cmd (the launcher above), so the pin lives in one place.
//   exeGui() -> Buffer: a few lines that start ARSENAL.exe gui (the exe zip ships one exe; this is the second entry for shortcuts).
const INSTALLER = 'Install-ARSENAL.cmd', EXE_GUI = 'ARSENAL-gui.cmd';
function ascii(name, s) {
  const b = Buffer.from(s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'latin1');
  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(b.toString('latin1'))) throw new Error(`${name}: non-ASCII byte`);
  return b;
}
function installer() { return ascii(INSTALLER, fs.readFileSync(path.join(DIR, INSTALLER), 'latin1')); }
function exeGui() {
  return ascii(EXE_GUI, ['@echo off',
    'rem ARSENAL window: the same as a double click on ARSENAL.exe (starts ARSENAL.exe gui). Generated by tools/dist/launch.js.',
    'rem Author: Imperator_Aug (ARSENAL)',
    '"%~dp0ARSENAL.exe" gui %*',
    'if errorlevel 1 pause', ''].join('\n'));
}
module.exports = { render, readPin, checkPin, gateLists, installer, exeGui, INSTALLER, EXE_GUI, MIN_MAJOR, NAMES, SYSTEMS, DIR };
