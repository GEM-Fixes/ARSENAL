#!/usr/bin/env node
// gui: local HTTP back end for the standalone GUI (GUI-1). No dependencies, binds 127.0.0.1 only, no fixed paths.
//   node tools/gui/gui.js [--port N] [--allow-launch] [--open]     (port 0 or none = a free port; prints "gui: http://127.0.0.1:PORT/")
// API (JSON; details:
//   GET  /api/health              {ok, sea, allowLaunch, version}   allowLaunch = --allow-launch or the page switch (POST /api/launch {on}, this session only)
// The page's game (game parity): header x-arsenal-game as64|mowas2|goh (or ?gid=, body.gid; else as64) and under GoH header
//   x-arsenal-goh = encodeURIComponent(GoH folder) (or ?goh=, body.goh). ext routes read it through ctx.gameId/exe/kind/gohDir/curDir;
//   /api/mods, /api/mod, /api/installed, /api/ls and the in-process game command use it (goh: GoH install, mods, Workshop 400750, version rule);
//   /api/run adds --exe <game> to testprofile and testprofile-seed (modswitch) when the game is not as64.
//   A remote device's GoH folder obeys the ?game= rule (under a root the PC page shows).
//   GET  /api/installed           mods in <game>/mods; marked = put there by ARSENAL install
//   GET  /api/commands            the contract: every command with its input fields
//   GET  /api/game[?game=DIR]     tools/lib/gamedir.resolve -> {dir, source, tried?, exes, codes}   ?kind=goh: gamedir.goh -> {dir, source, ok, exe, codes}
//   POST /api/run[?stream=0|1]    {cmd, input, timeoutSec?, prio?} -> NDJSON events (default) or one buffered JSON object. prio 'low' =
//                                 the child below normal priority; cmd check of the watched mod: + --listing <its current scan> (modwatch.js)
//   POST /api/modwatch {dir}      the picked mod ('' = none): the one watch of it follows (off: setting as2gui.modwatch false, ARSENAL_MODWATCH=0)
//   GET  /api/modwatch/status?dir=  {enabled, dir, watching, ready, sid, gen, err}   gen: changes seen since watch sid began
//   POST /api/cancel              {id}   any job of GET /api/jobs (README.md JOBS: run, extension request, background); 404 none, 409 key job.e.nostop
//   GET  /api/jobs                {jobs:[{id, kind, what, whatP, page, game, state, stage, done, total, startedMs, endedMs, canCancel, writes, cmd, interactive}]}
//   GET  /api/limit?codes=A,B     {codes:{CODE:{lim:[ids],kind,class}|null}}   GET /api/limit?id=AREA-NN  {id,class,row:{subject,limit,effect,tag}|null} (row null when limits/ is absent)
//   GET  /api/explain?codes=A,B   {cards:{code:{what,why,fix,auto,...}}, fixers}   GET /api/peek?path=ABS&line=N  {path,line,lines:[{n,text}]}
//   GET  /api/live                server sent events (live.js): with --dev, for remote pages, and for the PC page while LAN Remote is on.
//                                 hello {boot}, reload {files}, follow {screen, ev?} (to remote pages), follow {screen, from:"remote"} (to PC pages)
//   GET  /api/remote              (PC only) LAN Remote: {on, port, addrs, link, links, qr:{size,path}, errors}
//   POST /api/remote {on}         (PC only, loopback) LAN Remote on/off; POST /api/remote/newkey = new link, the old one dies at once
//   POST /api/follow {screen}     (PC only) the PC page's screen, sent on to the remote pages that follow it
//   POST /api/follow/remote {screen}  (remote devices only) the remote page's screen, sent on to the PC pages; dropped unless the PC
//                                 switch "Follow the remote device" is on (settings key as2gui.share.rmtFollowPc). In memory only.
// --dev (live.js): a parent process keeps the port, the session token and the switches and restarts this server when its code changes;
//   a change to the page or its client scripts and strings rebuilds the page in place; open pages reload, keeping screen and scroll.
// --remote (remote.js): LAN Remote, also listen on this PC's LAN addresses for another device, view only, behind a key link. Off by default.
// Events: {t:"start",id,cmd,argv} {t:"out"|"err",line} {t:"end",code,signal,ms,result,resultError?}
// Tools run as child processes (node tools/<t>/<t>.js, or `<exe> <t>` when this runs inside the as2 single exe), shell:false.
// Author: Imperator_Aug (ARSENAL, ia-24e9dc76)
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const contract = require('./contract');
const settings = require('./settings');
const checketa = require('./checketa');
const gamedir = require('../lib/gamedir');
const TOOLS = path.join(__dirname, '..');
const VERSION = 1;
const EXT_ROUTES = {};
for (const x of require('./ext')) for (const [k, f] of Object.entries(x.routes || {})) { if (EXT_ROUTES[k]) throw new Error('ext ' + x.id + ': route ' + k + ' exists'); EXT_ROUTES[k] = f; }
// the page's screen ids (core NAMES in page.js + every ext screen with a tab): the only values POST /api/follow/remote takes
const SCREEN_IDS = new Set(['mods', 'make', 'check', 'play', 'test', 'settings', 'upgrade'].concat(require('./ext').filter(x => x.script && x.nav).map(x => x.id)));

let SEA = false;
try { SEA = require('node:sea').isSea(); } catch (e) { /* older node */ }

function cleanEnv() { const e = Object.assign({}, process.env); delete e.NODE_OPTIONS; return e; }

// child command line for a contract entry. Inside the exe the exe itself is the node: `ARSENAL.exe check ...`
function childCmd(c, args) {
  if (SEA) return { file: process.execPath, args: [c.tool, ...args.slice(c.lead ? c.lead.length : 0)] };
  return { file: process.execPath, args: [path.join(TOOLS, c.entry), ...args] };
}

// GUI-EXT: ext routes run tools through this (same exe/node dispatch as /api/run). tool = as2 front-door name, entry = path under tools/.
// -> Promise<{code, stdout, stderr, timedOut, cancelled}>. Never starts the game: ext routes must not call launch commands.
// JOBS: tr (the dispatcher's, never a route's) = {job, add(child), del(child)}: the child belongs to that job. A cancelled job's child
// is killed with its process tree and the call resolves {code:null, timedOut:false, cancelled:true}; a call after the cancel resolves so at once.
function runTool(tool, entry, args, o = {}, tr) {
  if (tr && tr.job.cancelled) return Promise.resolve({ code: null, stdout: '', stderr: '', timedOut: false, cancelled: true });
  const cc = childCmd({ tool, entry }, args || []);
  return new Promise(resolve => {
    let out = '', err = '', done = false, timedOut = false;
    let child;
    try { child = cp.spawn(cc.file, cc.args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: cleanEnv(), cwd: o.cwd || process.cwd() }); }
    catch (e) { return resolve({ code: 2, stdout: '', stderr: e.message, timedOut: false, cancelled: false }); }
    if (tr) tr.add(child);
    const t = setTimeout(() => { timedOut = true; killTree(child); }, o.timeoutMs || 120000);
    child.stdout.on('data', d => { if (out.length < (o.max || 32 << 20)) out += d; });
    child.stderr.on('data', d => { if (err.length < (1 << 20)) err += d; });
    const fin = code => {
      if (done) return; done = true; clearTimeout(t); if (tr) tr.del(child);
      if (tr && tr.job.cancelled && !timedOut) return resolve({ code: null, stdout: out, stderr: err, timedOut: false, cancelled: true });
      resolve({ code, stdout: out, stderr: err, timedOut, cancelled: false });
    };
    child.on('error', e => { err += e.message; fin(2); });
    child.on('close', c => fin(c == null ? 2 : c));
  });
}

function lineSplitter(emit) {
  let buf = '';
  return {
    push(chunk) { buf += chunk; let i; while ((i = buf.indexOf('\n')) >= 0) { emit(buf.slice(0, i).replace(/\r$/, '')); buf = buf.slice(i + 1); } },
    end() { if (buf) emit(buf.replace(/\r$/, '')); buf = ''; },
  };
}

function killTree(child) {
  try {
    // lib/platform: Windows taskkill /T /F (the whole tree), elsewhere kill -KILL; a failed call falls back to the child handle
    if (!require('../lib/platform').killPid(child.pid).ok && !require('../lib/platform').isWin()) child.kill('SIGKILL');
  } catch (e) { /* already gone */ }
}

function readJson(file) { try { return { value: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (e) { return { error: e.message }; } }

// ---- one run. emit(event) per event; resolves when 'end' was emitted. handle.cancel() kills it.
function run(cmd, input, opt, emit) {
  const c = contract.COMMANDS[cmd];
  const { args, launches } = contract.buildArgv(cmd, input, { base: opt.cwd });
  const id = 'r' + (++run.n).toString(36) + Date.now().toString(36);
  const t0 = Date.now();
  const handle = { id, cancel() { handle.cancelled = true; if (handle.child) killTree(handle.child); } };
  if (launches && !opt.allowLaunch) { const e = new Error(`${cmd} starts the game: refused (start the server with --allow-launch, or use ${c.launch}:true)`); e.status = 403; throw e; }
  if (launches && run.launching) { const e = new Error('another game run is in progress (one game at a time)'); e.status = 409; throw e; }
  if (c.flow && SEA) { const e = new Error(`${cmd} is a workflow command: not available inside the exe, run node tools/as2/as2.js ${cmd}`); e.status = 501; throw e; }

  if (c.inproc === 'game') {
    // game parity: kind goh (input.kind, else the request's game, opt.gameKind) finds the GoH install as /api/game?kind=goh does
    const kind = input && typeof input.kind === 'string' ? input.kind : opt.gameKind;
    if (kind === 'goh') {
      const arg = input && input.game ? path.resolve(opt.cwd || process.cwd(), input.game) : undefined;
      let dir = null; try { dir = gamedir.goh({ arg }); } catch (e) { dir = null; }
      const r = { dir: dir || null, source: dir ? (arg ? 'arg' : 'auto') : null, kind: 'goh' };
      emit({ t: 'start', id, cmd, argv: ['(in process) gamedir.goh'] });
      if (dir) emit({ t: 'out', line: dir + '  (' + r.source + ')' }); else emit({ t: 'err', line: 'error: no Gates of Hell install found (GOH_GAME, as2.json "goh", Steam 400750)' });
      emit({ t: 'end', code: dir ? 0 : 2, signal: null, ms: Date.now() - t0, result: r });
      return { handle, done: Promise.resolve() };
    }
    const g = gamedir.resolve({ arg: input && input.game ? path.resolve(opt.cwd || process.cwd(), input.game) : undefined });
    emit({ t: 'start', id, cmd, argv: ['(in process) gamedir.resolve'] });
    let code = 0;
    if (g.dir) emit({ t: 'out', line: g.dir + '  (' + g.source + ')' });
    else { code = 2; emit({ t: 'err', line: 'error: no game dir found: ' + g.tried.join('; ') }); }
    emit({ t: 'end', code, signal: null, ms: Date.now() - t0, result: g });
    return { handle, done: Promise.resolve() };
  }

  let tmp = null, a = args;
  // game parity: a command whose contract has no exe field but whose tool takes the common --exe gets the request's game (opt.gameId,
  // not as64 only: the AS64 argument list stays as it is). modswitch refuses --inst/--seed for mowas_2 (TST-19) and goh (GHVFS-13)
  // with one plain line, exit 2, which the run shows as it is.
  if (GAME_EXE_CMDS.has(cmd) && opt.gameId && opt.gameId !== 'as64' && GAME_T[opt.gameId] && !a.includes('--exe')) a = [...a, '--exe', GAME_T[opt.gameId].exe];
  if (cmd === 'check' && opt.listingFile) a = [...a, '--listing', opt.listingFile];   // X8: the GUI's current scan of the mod (modwatch.js)
  if (c.result === 'jsonfile') { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui-')); a = [...a, c.jsonFlag, path.join(tmp, 'result.json')]; }
  let cc = childCmd(c, a);
  // spawnHook (in-process tests only, never reachable from HTTP or the CLI): sees the real child command line and may replace it
  if (opt.spawnHook) cc = opt.spawnHook(cc, { cmd, id, launches }) || cc;
  // time limit: 30 minutes, or what the request names (at most 2 hours). A command with noTimeout in its contract (check: a big mod
  // takes far longer than any fixed limit) runs until it ends or is cancelled, unless the request names a limit itself
  const asked = Number(opt.timeoutSec) || 0;
  const secs = asked ? Math.min(Math.max(asked, 1), 7200) : c.noTimeout ? 0 : 1800;
  emit({ t: 'start', id, cmd, argv: [cc.file, ...cc.args], limitSec: secs });
  if (launches) run.launching = id;
  handle.cmd = cmd; handle.interactive = !!c.interactive; handle.started = t0;
  const done = new Promise(resolve => {
    let child;
    try { child = cp.spawn(cc.file, cc.args, { shell: false, windowsHide: true, stdio: [c.interactive ? 'pipe' : 'ignore', 'pipe', 'pipe'], env: cleanEnv(), cwd: opt.cwd || process.cwd() }); }
    catch (e) { emit({ t: 'err', line: 'spawn failed: ' + e.message }); finish(2, null, '', e.message); return; }
    handle.child = child;
    if (opt.lowPrio) { try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { /* normal priority */ } }
    if (c.interactive && child.stdin) {
      child.stdin.on('error', () => { /* child gone */ });
      handle.answer = obj => { if (!child.stdin.writable) return false; child.stdin.write(JSON.stringify(obj) + '\n'); return true; };
    }
    let out = '', finished = false;
    const so = lineSplitter(l => emit({ t: 'out', line: l })), se = lineSplitter(l => emit({ t: 'err', line: l }));
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', d => { if (c.result === 'stdout-json' && out.length < (1 << 26)) out += d; so.push(d); });
    child.stderr.on('data', d => se.push(d));
    const timer = secs ? setTimeout(() => { handle.timedOut = true; se.push('timed out after ' + secs + ' s: stopped\n'); killTree(child); }, secs * 1000) : null;
    child.on('error', e => { se.push('spawn error: ' + e.message + '\n'); });
    child.on('close', (code, signal) => { clearTimeout(timer); so.end(); se.end(); finish(code == null ? 1 : code, signal, out); });
    function finish(code, signal, stdout) {
      if (finished) return; finished = true;
      let result = null, resultError;
      if (c.result === 'jsonfile') { if (fs.existsSync(path.join(tmp, 'result.json'))) { const r = readJson(path.join(tmp, 'result.json')); result = r.value === undefined ? null : r.value; resultError = r.error; } }
      else if (c.result === 'stdout-json' && input && input.json) { try { result = JSON.parse(stdout); } catch (e) { resultError = e.message; } }
      else if (c.result === 'outdir' && input && input.out) {
        const dir = path.resolve(opt.cwd || process.cwd(), input.out);
        try {
          result = { dir, files: fs.readdirSync(dir).sort(), report: null };
          if (result.files.includes('report.json')) { const r = readJson(path.join(dir, 'report.json')); result.report = r.value === undefined ? null : r.value; if (r.error) resultError = r.error; }
        } catch (e) { resultError = e.code === 'ENOENT' ? 'the output folder ' + dir + ' was not made, so there is no result to show (the run stopped before writing; the lines above say why)'
          : e.code === 'ENOTDIR' ? dir + ' is a file, not a folder, so there is no result to show. Pick a folder for out' : e.message; }
      }
      if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* temp only */ } }
      if (run.launching === id) run.launching = null;
      const ev = { t: 'end', code, signal: signal || null, ms: Date.now() - t0, result };
      if (resultError) ev.resultError = resultError;
      if (handle.cancelled) ev.cancelled = true;
      if (handle.timedOut) ev.timedOut = true;
      emit(ev); resolve();
    }
  });
  return { handle, done };
}
run.n = 0; run.launching = null;

// ---- HTTP
let PAGE = require('./page');
const remote = require('./remote'), liveLib = require('./live'), modwatch = require('./modwatch');
// --dev: which loaded files only build the page (page.js, strings, client scripts = modules that export a string) and which are server code
const lowp = f => (process.platform === 'win32' ? String(f).toLowerCase() : String(f));
const GUI_DIR = lowp(__dirname + path.sep), EXT_DIR = lowp(path.join(__dirname, 'ext') + path.sep), PAGE_FILE = lowp(require.resolve('./page'));
function isClient(key) {
  const m = require.cache[key], f = lowp(key);
  if (!m) return true;   // not loaded: a new file only counts once something loaded requires it
  if (!f.startsWith(GUI_DIR)) return false;
  if (f === PAGE_FILE) return true;
  if (/\.json$/.test(f)) return /lang/.test(path.basename(f)) || /[\\/]lang[\\/]/.test(f);
  return typeof m.exports === 'string';
}
// the page again from disk: page.js, the ext list and each ext's index (they put the client scripts together) and every client module
function rebuildPage() {
  const isExtIndex = f => f === EXT_DIR + 'index.js' || (path.basename(f) === 'index.js' && lowp(path.dirname(path.dirname(f)) + path.sep) === EXT_DIR);
  for (const k of Object.keys(require.cache)) { const f = lowp(k); if (f.startsWith(GUI_DIR) && (isClient(k) || isExtIndex(f))) delete require.cache[k]; }
  try { PAGE = require('./page'); return true; } catch (e) { console.error('gui --dev: the page did not build (' + e.message + '); the last good page stays until the next change'); return false; }
}
const pageFor = cfg => PAGE.replace('<script>', () => '<script>window.AS2CFG=' + JSON.stringify(cfg).replace(/</g, '\\u003c') + ';</script><script>');
// the page as bytes, one Buffer per variant (cfg none = the plain page), made on first use and dropped when the page is built again:
// encoding the 8 MB text on every GET / took the loop each time, and a known length lets the answer go out with Content-Length
let PAGE_BYTES = { of: null, m: new Map() };
function pageBytes(cfg) {
  if (PAGE_BYTES.of !== PAGE) PAGE_BYTES = { of: PAGE, m: new Map() };
  const k = cfg ? JSON.stringify(cfg) : '';
  let b = PAGE_BYTES.m.get(k);
  if (!b) PAGE_BYTES.m.set(k, b = Buffer.from(cfg ? pageFor(cfg) : PAGE, 'utf8'));
  return b;
}
// a phone (wantGzip) gets the gzipped page, made once per variant and kept beside its bytes (PAGE_BYTES.z, dropped with them)
const sendPage = (res, cfg) => {
  const b = pageBytes(cfg), head = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-length': b.length };
  if (wantGzip(res, head['content-type'], b.length)) {
    const zs = PAGE_BYTES.z || (PAGE_BYTES.z = new Map()), k = cfg ? JSON.stringify(cfg) : '';
    let p = zs.get(k);
    if (!p) { zs.set(k, p = new Promise(done => zlib.gzip(b, (e, z) => done(e ? null : z)))); p.then(z => { if (!z) zs.delete(k); }); }
    return void p.then(z => endGzip(res, 200, head, b, z));
  }
  res.writeHead(200, head); res.end(b);
};
const isLoop =a => /^(127\.|::1$|::ffff:127\.)/.test(String(a || ''));
// the GUI-1 console, kept at /console: raw JSON in, raw events out
const CONSOLE = `<!doctype html><meta charset=utf-8><title>as2 gui console</title>
<style>body{font:14px system-ui;margin:1.5em;max-width:60em}textarea{width:100%;height:9em;font:12px monospace}pre{background:#111;color:#ddd;padding:.7em;overflow:auto;max-height:28em}</style>
<h2>as2 gui (back end)</h2><p>Contract console: every command of the contract, raw. The screens are at <a href="/">/</a>.</p>
<select id=c></select> <button id=go>Run</button> <button id=x>Cancel</button> <span id=s></span>
<p id=d></p><textarea id=i>{}</textarea><pre id=o></pre>
<script>
let cmds=[],cur=null;const $=i=>document.getElementById(i);
fetch('/api/commands').then(r=>r.json()).then(j=>{cmds=j.commands;$('c').innerHTML=cmds.map(c=>'<option>'+c.id+'</option>').join('');pick()});
function pick(){const c=cmds.find(x=>x.id===$('c').value);$('d').textContent=c.summary+' Fields: '+c.fields.map(f=>f.name+(f.required?'*':'')).join(', ');}
$('c').onchange=pick;
$('x').onclick=()=>cur&&fetch('/api/cancel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:cur})});
$('go').onclick=async()=>{$('o').textContent='';let input;try{input=JSON.parse($('i').value)}catch(e){$('o').textContent='bad JSON: '+e.message;return}
const r=await fetch('/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cmd:$('c').value,input})});
if(!r.ok){$('o').textContent=JSON.stringify(await r.json());return}
const rd=r.body.getReader(),td=new TextDecoder();let b='';
for(;;){const{done,value}=await rd.read();if(done)break;b+=td.decode(value,{stream:true});let n;while((n=b.indexOf('\\n'))>=0){const e=JSON.parse(b.slice(0,n));b=b.slice(n+1);
if(e.t==='start')cur=e.id;else if(e.t==='end'){$('s').textContent='exit '+e.code;$('o').textContent+='\\n'+JSON.stringify(e.result,null,1);cur=null}else $('o').textContent+=e.line+'\\n'}}};
</script>`;

// gzip (PERF A5): only for a socket that is not loopback (a phone on the LAN) whose request accepts gzip, a text kind (never a picture,
// an archive or sound: those are packed already), 1 KB or more. A loopback answer is written exactly as before. Streams (/api/live,
// the /api/run stream) do not come through send. zlib.gzip is the async one: the loop stays free while a big answer is packed.
const zlib = require('zlib');
const GZ_MIN = 1024, GZ_KIND = /^(?:text\/|application\/(?:json|javascript|xml)\b|image\/svg\+xml)/i;
function wantGzip(res, type, len) {
  const req = res.req, ip = res.socket && res.socket.remoteAddress;
  if (!req || !ip || isLoop(ip) || len < GZ_MIN || !GZ_KIND.test(String(type || '')) || res.getHeader('content-encoding')) return false;
  return String(req.headers['accept-encoding'] || '').split(',').some(x => { const m = /^\s*(?:x-)?gzip\s*(?:;\s*q=([0-9.]+)\s*)?$/i.exec(x); return !!m && (m[1] === undefined || Number(m[1]) > 0); });
}
// the packed answer z (null: packing failed, the plain body goes out with the plain headers)
function endGzip(res, status, head, body, z) {
  if (res.writableEnded || res.destroyed || res.headersSent) return;
  if (z) head = Object.assign({}, head, { 'content-encoding': 'gzip', vary: 'accept-encoding', 'content-length': z.length });
  res.writeHead(status, head);
  res.end(z || body);
}
// obj: a string (sent as it is), or JSON data. A route's answer may carry its own JSON text as bytes in a property __json (a Buffer,
// not enumerable: PERF A4): those bytes must be JSON.stringify of the answer and are written instead of stringifying it again.
function send(res, status, obj, type, extra) {
  let body = null;
  if (typeof obj === 'string') body = obj;
  else { const pre = obj && typeof obj === 'object' ? obj.__json : null; body = Buffer.isBuffer(pre) ? pre : JSON.stringify(obj); }
  const head = Object.assign({ 'content-type': type || 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, extra);
  if (wantGzip(res, head['content-type'], body === undefined ? 0 : body.length)) return void zlib.gzip(body, (e, z) => endGzip(res, status, head, body, e ? null : z));
  res.writeHead(status, head);
  res.end(body);
}
// a route's text answer {__raw, type}: js, css or plain as asked, anything else plain. HTML (a whole document read from disk, with its
// own script) only with sandbox: true, and then always under this CSP: an opaque origin even when the URL is opened in a tab, nothing loaded
const SANDBOX_CSP = "sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";
const rawHead = out => (out.sandbox === true && out.type === 'text/html; charset=utf-8' ? { type: out.type, extra: { 'content-security-policy': SANDBOX_CSP } }
  : { type: /^text\/(javascript|css|plain); charset=utf-8$/.test(out.type) ? out.type : 'text/plain; charset=utf-8' });
const fail = (res, status, msg) => send(res, status, { error: msg });

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    req.on('data', d => { n += d.length; if (n > limit) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); } else parts.push(d); });
    req.on('end', () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { reject(Object.assign(new Error('bad JSON body'), { status: 400 })); } });
    req.on('error', reject);
  });
}

// ---- read-only file helpers for the page (mod picker, folder browser, spec/text viewer)
function decodeText(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.slice(3).toString('utf8');
  // GUI-LOC: UTF-8 without a BOM decoded as cp1251 gave mojibake (encfix_t name). valid UTF-8 with a non-ASCII byte = UTF-8; else cp1251.
  // stream:true so a multi-byte char cut by a 64 KB read is not an error
  if (buf.some(b => b > 0x7f)) { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf, { stream: true }); } catch (e) { /* not UTF-8: cp1251 below */ } }
  try { return new TextDecoder('windows-1251').decode(buf); } catch (e) { return buf.toString('latin1'); }
}
const unq = s => s.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c));
function readModInfo(dir) {
  const p = path.join(dir, 'mod.info');
  let st; try { st = fs.statSync(p); } catch (e) { return null; }
  if (!st.isFile()) return null;
  let text = ''; try { const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(Math.min(st.size, 65536)); fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd); text = decodeText(b); } catch (e) { /* unreadable: still a mod folder */ }
  return modInfoOf(text, st);
}
// readModInfo through the thread pool (apiMods): the same file, the same first 64 KB, the same answer
async function readModInfoA(dir) {
  const fsp = fs.promises, p = path.join(dir, 'mod.info');
  let st; try { st = await fsp.stat(p); } catch (e) { return null; }
  if (!st.isFile()) return null;
  let text = '', fh = null;
  try { fh = await fsp.open(p, 'r'); const b = Buffer.alloc(Math.min(st.size, 65536)); await fh.read(b, 0, b.length, 0); text = decodeText(b); } catch (e) { /* unreadable: still a mod folder */ }
  finally { if (fh) { try { await fh.close(); } catch (e) { /* closed */ } } }
  return modInfoOf(text, st);
}
function modInfoOf(text, st) {
  const m1 = /\{\s*name\s+"((?:[^"\\]|\\.)*)"/i.exec(text), m2 = /\{\s*(?:desc|description)\s+"((?:[^"\\]|\\.)*)"/i.exec(text);
  return { name: m1 ? unq(m1[1]) : '', desc: m2 ? unq(m2[1]) : '', text, mtimeMs: st.mtimeMs };
}
function requireAbs(p, what) {
  if (typeof p !== 'string' || !p || p.includes('\0') || !path.isAbsolute(p)) throw Object.assign(new Error(what + ': need an absolute path'), { status: 400 });
  return path.resolve(p);
}
function subdirs(dir) {
  // GT-31: 404 = no such folder (the page says "folder not found"), 400 = there but not a readable folder (a file, no access)
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { throw Object.assign(new Error('cannot read ' + dir + ': ' + e.code), { status: e.code === 'ENOENT' ? 404 : 400 }); }
  return ents.filter(d => d.isDirectory()).map(d => d.name).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);
}
// forOut (GT-22, ?for=out): picking an output folder lists home and the drives first; the game's folders come last and are marked
// G (reqGame): the Workshop folder by kind. A ?game folder that is a GoH install is GoH whatever the header says (the page already
// passes the GoH folder as ?game under GoH); no ?game under goh = the GoH install of the request
function apiLs(dirArg, gameDirArg, withFiles, forOut, G) {
  if (!dirArg) {
    let gk = 'as2', gdir = null;
    // under goh a ?game that is not a GoH install is the page's AS2 folder (S.gameOv), not the open game: the GoH install instead
    if (gameDirArg && !(G && G.kind === 'goh' && !gohFolder(gameDirArg))) { gdir = gamedir.resolve({ arg: gameDirArg }).dir; try { if (require('../lib/writeguard').isGoh(gdir)) gk = 'goh'; } catch (e) { /* as2 */ } }
    else if (G && G.kind === 'goh') { gdir = G.gohDir(); gk = 'goh'; }
    else gdir = gamedir.resolve({}).dir;
    const game = [], other = [];
    if (gdir) game.push(Object.assign({ name: 'game mods', path: path.join(gdir, 'mods') }, forOut ? { game: true } : {}));
    const ws = workshopDir(gdir, gk); if (ws) game.push({ name: 'workshop (read-only)', path: ws, readOnly: true });   // GX upgrade G1
    other.push({ name: 'home', path: os.homedir() }, { name: 'working dir', path: process.cwd() });
    if (require('../lib/platform').isWin()) for (let c = 67; c <= 90; c++) { const d = String.fromCharCode(c) + ':\\'; if (fs.existsSync(d)) other.push({ name: d, path: d }); }
    else other.push({ name: '/', path: '/' });
    return { dir: null, parent: null, roots: forOut ? other.concat(game) : game.concat(other), entries: [] };
  }
  const dir = requireAbs(dirArg, 'dir'), names = subdirs(dir).slice(0, 3000);
  const parent = path.dirname(dir) === dir ? null : path.dirname(dir);
  let files = [];
  if (withFiles) { try { files = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1).slice(0, 3000); } catch (e) { /* listed above */ } }
  return { dir, parent, entries: names.map(n => ({ name: n, isMod: fs.existsSync(path.join(dir, n, 'mod.info')) })), files, isMod: fs.existsSync(path.join(dir, 'mod.info')) };
}
// GX upgrade G1: <steam library>/steamapps/workshop/content/<appid> next to the game's steamapps/common (read-only: listed, never written)
// appid by kind (tools/lib/gamedir.js): 244450 for the AS2 kinds (as64, mowas2), 400750 for GoH
function workshopDir(game, kind) {
  if (!game) return null;
  const m = /^(.*[\\/]steamapps)[\\/]common[\\/][^\\/]+[\\/]?$/i.exec(game); if (!m) return null;
  const d = path.join(m[1], 'workshop', 'content', kind === 'goh' ? '400750' : '244450');
  try { return fs.statSync(d).isDirectory() ? d : null; } catch (e) { return null; }
}
// game parity: the game a request is for. The page's api() sends header x-arsenal-game (and x-arsenal-goh = the GoH folder,
// URI-encoded, under GoH); a URL made outside api() carries ?gid= and ?goh=; a POST body may carry gid and goh. Order: query, body, header.
// Unknown or absent = as64 (AS64 behaviour unchanged). A local table (tools/lib/games.js holds the tools' copy; not required here so
// the server never depends on a module another part builds): id -> vfs exe and kind.
const GAME_T = { as64: { exe: 'as64', kind: 'as2' }, mowas2: { exe: 'mowas_2', kind: 'as2' }, goh: { exe: 'goh', kind: 'goh' } };
// contract commands without an exe field whose tool takes the common --exe (modswitch): run() adds the request's game (see run)
const GAME_EXE_CMDS = new Set(['testprofile', 'testprofile-seed']);
const strOf = v => (typeof v === 'string' && v !== '' ? v : null);
function reqGoh(u, body, req) {
  const q = strOf(u.searchParams.get('goh')); if (q) return q;
  const b = body && typeof body === 'object' ? strOf(body.goh) : null; if (b) return b;
  const h = strOf(req.headers['x-arsenal-goh']); if (!h) return null;
  try { return strOf(decodeURIComponent(h)); } catch (e) { return undefined; }   // undefined = a header that is not URI-encoded text
}
function reqGame(u, body, req) {
  const raw = strOf(u.searchParams.get('gid')) || (body && typeof body === 'object' ? strOf(body.gid) : null) || strOf(req.headers['x-arsenal-game']);
  const id = raw && Object.prototype.hasOwnProperty.call(GAME_T, raw) ? raw : 'as64', t = GAME_T[id], arg = reqGoh(u, body, req);
  let goh;   // lazy: the GoH finder walks Steam only when a route asks
  return { id, exe: t.exe, kind: t.kind, gohArg: arg,
    gohDir() { if (goh === undefined) { try { goh = arg ? path.resolve(arg) : (gamedir.goh({}) || null); } catch (e) { goh = null; } } return goh; } };
}
// GoH game version as mod.info bounds write it: exe ProductVersion 1.0.6.7 -> 1.067 (GHNET-22 [V]: game 1.067.<patches>, exe block
// 1.0.6.7; the mapping is [I]). Cached per exe file and mtime.
const gohVerCache = new Map();
function gohVersion(dir) {
  if (!dir) return null;
  const f = ['binaries/x64/call_to_arms.exe', 'call_to_arms.exe'].map(x => path.join(dir, x)).find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
  if (!f) return null;
  let mt = 0; try { mt = fs.statSync(f).mtimeMs; } catch (e) { return null; }
  const c = gohVerCache.get(f); if (c && c.mt === mt) return c.v;
  let v = null; try { const pv = require('../lib/gamever').peVersion(f); const p = verP(String(pv || '').split('-')[0]); if (p.length >= 2) v = p[0] + '.' + p.slice(1).join(''); } catch (e) { v = null; }
  gohVerCache.set(f, { mt, v }); return v;
}
// GX upgrade G2: which build a mod.info says it runs on. The game's version check: MinGameVersion >= 3.301 = Enhanced (as64) only;
// else the classic data version 3.262 must lie in [Min, Max]; empty Min = not listed in the game (tools/modinfo has the full check)
const verP = v => String(v || '').replace(/[^0-9.]/g, '').split('.').filter(x => x !== '').map(Number);
const verC = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x < y ? -1 : 1; } return 0; };
// kind 'goh' (gohweb vfs/goh-modinfo-version-rule, GHVFS-02, GHNET-22 [V]): each bound optional (missing = open); tag develop = any
// version; else the game version >= Min when set and <= Max when set -> worksOn 'goh' or 'none'. gohVer = the GoH version (1.067), null
// when the exe is not readable: then only an AS2 3.x Min is refused (PORT-43: an AS2 mod.info is refused on GoH) [I].
function worksOn(text, kind, gohVer) {
  const g = k => { const m = new RegExp('\\{\\s*' + k + '\\s+"?([0-9.]+)', 'i').exec(text || ''); return m ? m[1] : ''; };
  const min = g('MinGameVersion'), max = g('MaxGameVersion');
  if (kind === 'goh') {
    const tm = /\{\s*Tags\s+"((?:[^"\\]|\\.)*)"/i.exec(text || ''), tags = tm ? tm[1].split(/\s+/).filter(Boolean) : [], develop = tags.some(t => t.toLowerCase() === 'develop');
    const base = { min, max, tags, develop, game: gohVer || null };
    if (develop) return Object.assign(base, { worksOn: 'goh' });
    if (gohVer) { const v = verP(gohVer); return Object.assign(base, { worksOn: (!min || verC(v, verP(min)) >= 0) && (!max || verC(v, verP(max)) <= 0) ? 'goh' : 'none' }); }
    return Object.assign(base, { worksOn: min && verP(min)[0] >= 3 ? 'none' : 'goh' });
  }
  if (!min) return { min, max, worksOn: 'none' };
  if (verC(verP(min), [3, 301]) >= 0) return { min, max, worksOn: 'as64' };
  const cl = [3, 262];
  return { min, max, worksOn: verC(verP(min), cl) <= 0 && (!max || verC(cl, verP(max)) <= 0) ? 'classic' : 'none' };
}
const MARK = '.as2-installed';   // as2/flow.js MARK
// GX broke B4 / first-mod G15: mods in <game>/mods; marked = put there by ARSENAL install (only those can be uninstalled here)
const absGame = a => (a ? path.resolve(String(a)) : undefined);   // I-23: a relative game folder is resolved once, here, the way run() does
// game parity: a folder that is a GoH install (writeguard.isGoh: call_to_arms.exe, the folder name or a known install)
const gohFolder = d => { try { return !!d && require('../lib/writeguard').isGoh(path.resolve(String(d))); } catch (e) { return false; } };
// G = reqGame(..); under goh the mods of <GoH install>/mods. ?game= wins as the folder only when it is a GoH install: the page sends
// its AS2 folder (S.gameOv) as ?game= on every tab, and under GoH that is not the open game
// (gameOfA below.) PERF A11: the game folder without a blocking registry read. lib/gamedir asks the registry (reg.exe, 80-230 ms, synchronous)
// only when nothing else names the game; here that one read runs as a child process that is awaited (the bytes go through lib/winreg's
// own parser) and is kept 5 s, as lib/gamedir keeps its own. The finder runs first with a reader that says "not known yet": a
// request that never reaches the registry (?game=, AS2_GAME, as2.json) starts no reg.exe, as before.
const REG_MS = 5000, NEED_REG = new Error('registry value not read yet');
let regA = null, regRun = null;   // {at, v}; the read in flight
function steamPathA() {
  if (regRun) return regRun;
  const key = 'HKCU\\Software\\Valve\\Steam', f = path.join(os.tmpdir(), 'as2-reg-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.reg');
  const done = b => { let v = null; try { v = b ? require('../lib/winreg').readValue(key, 'SteamPath', { run: () => b }) : null; } catch (e) { v = null; } regA = { at: Date.now(), v: v ? v.trim() : null }; regRun = null; return regA.v; };
  return (regRun = new Promise(res => {
    let child; try { child = require('child_process').spawn('reg', ['export', key, f, '/y'], { windowsHide: true, stdio: 'ignore' }); } catch (e) { return res(null); }
    child.on('error', () => res(null));
    child.on('close', code => { if (code !== 0) return fs.unlink(f, () => res(null)); fs.readFile(f, (e, b) => fs.unlink(f, () => res(e ? null : b))); });
  }).then(done, () => done(null)));
}
// find(readReg) is one of lib/gamedir's finders with its registry reader replaced; run again once the value is known
async function withReg(find) {
  const now = Date.now();
  if (process.platform !== 'win32') return find(undefined);   // no registry: the finder's own reader is never called
  if (regA && now >= regA.at && now - regA.at < REG_MS) return find(() => regA.v);
  try { return find(() => { throw NEED_REG; }); } catch (e) { if (e !== NEED_REG) throw e; }
  const v = await steamPathA();
  return find(() => v);
}
async function gameOfA(gameArg, G) {
  if (G && G.kind === 'goh') {
    const a = absGame(gameArg); let d = a && gohFolder(a) ? a : null;
    if (!d) { try { d = G.gohArg ? G.gohDir() : (await withReg(readReg => gamedir.goh(readReg ? { readReg } : {})) || null); } catch (e) { d = null; } }
    return { dir: d || null, kind: 'goh' };
  }
  let d = null; try { d = await withReg(readReg => gamedir.resolve(readReg ? { arg: absGame(gameArg), readReg } : { arg: absGame(gameArg) }).dir || null); } catch (e) { /* none */ }
  return { dir: d, kind: 'as2' };
}
// existsSync through the thread pool (both follow a link; a broken link is not there)
const existsA = f => fs.promises.stat(f).then(() => true, () => false);
// PERF A11: async (the folder list and the two checks per mod go through the thread pool, 32 mods at a time, each into its own slot, so
// the list is in the listing order as before). Equal requests that arrive while one is being answered share its answer (the page asks twice at start).
const installedFlight = new Map();
function apiInstalled(gameArg, G) {
  const k = JSON.stringify([gameArg == null ? null : String(gameArg), G ? G.id : null, G ? G.gohArg || null : null]);
  let p = installedFlight.get(k);
  if (!p) { p = installedRead(gameArg, G); installedFlight.set(k, p); const drop = () => { if (installedFlight.get(k) === p) installedFlight.delete(k); }; p.then(drop, drop); }
  return p;
}
async function installedRead(gameArg, G) {
  const g = await gameOfA(gameArg, G); if (!g.dir) return { game: null, mods: [] };
  let ents = []; try { ents = await fs.promises.readdir(path.join(g.dir, 'mods'), { withFileTypes: true }); } catch (e) { /* no mods folder */ }
  // GT-35: hasInfo = the folder holds mod.info (the Mods page lists only those, so both pages count the same mods)
  const list = ents.filter(e => e.isDirectory() || e.isSymbolicLink()), mods = new Array(list.length);
  const one = async e => ({ name: e.name, link: e.isSymbolicLink(), marked: e.isSymbolicLink() || await existsA(path.join(g.dir, 'mods', e.name, MARK)), hasInfo: await existsA(path.join(g.dir, 'mods', e.name, 'mod.info')) });
  for (let i = 0; i < list.length; i += 32) await Promise.all(list.slice(i, i + 32).map((e, n) => one(e).then(m => { mods[i + n] = m; })));
  return { game: g.dir, mods };
}
function isReadOnlyRoot(dir, game, kind) {
  const ws = workshopDir(game, kind); if (!ws) return false;
  const a = path.resolve(dir).toLowerCase(), b = path.resolve(ws).toLowerCase();
  return a === b || a.startsWith(b + path.sep);
}
// G (reqGame) absent or an AS2 kind: the AS2 install as before; goh: the GoH install, its mods folder, its workshop and its version rule
// PERF A11: async. mod.info of 32 folders at a time is read through the thread pool into an indexed array; the rows are then added in
// folder order up to the 500 cap, and no further folder is read once it is reached: the list is the one the one-by-one loop made.
async function apiMods(dirArg, G) {
  const fsp = fs.promises, dir = requireAbs(dirArg, 'dir'), mods = [];
  const gg = await gameOfA(null, G && G.kind === 'goh' ? G : undefined), game = gg.dir, gv = gg.kind === 'goh' ? gohVersion(game) : null;
  const inst = new Set(), gm = game ? path.resolve(game, 'mods').toLowerCase() : null;
  if (game) { try { for (const e of await fsp.readdir(path.join(game, 'mods'), { withFileTypes: true })) inst.add(e.name.toLowerCase()); } catch (e) { /* no mods folder */ } }   // installedSet
  const row = (p, folder, mi) => Object.assign({ folder, path: p, name: mi.name || folder, desc: mi.desc.slice(0, 200), mtimeMs: mi.mtimeMs,
    installed: !!game && (inst.has(folder.toLowerCase()) || path.dirname(path.resolve(p)).toLowerCase() === gm) }, worksOn(mi.text, gg.kind, gv));
  { const mi = await readModInfoA(dir); if (mi) mods.push(row(dir, path.basename(dir), mi)); }
  // subdirs(dir), read through the thread pool: the same folders, order and errors (GT-31)
  let ents; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { throw Object.assign(new Error('cannot read ' + dir + ': ' + e.code), { status: e.code === 'ENOENT' ? 404 : 400 }); }
  const names = ents.filter(d => d.isDirectory()).map(d => d.name).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1).slice(0, 2000);
  for (let i = 0; i < names.length && mods.length < 500; i += 32) {
    const part = names.slice(i, i + 32), got = new Array(part.length);
    await Promise.all(part.map((n, k) => readModInfoA(path.join(dir, n)).then(mi => { got[k] = mi; })));
    for (let k = 0; k < part.length && mods.length < 500; k++) if (got[k]) mods.push(row(path.join(dir, part[k]), part[k], got[k]));
  }
  return Object.assign({ dir, mods, truncated: mods.length >= 500, game, readOnly: isReadOnlyRoot(dir, game, gg.kind) }, gg.kind === 'goh' ? { kind: 'goh', gameVersion: gv } : {});
}
const MOD_FILES_CAP = 5000, MOD_WALK_MS = 3000;
// The walk is async (the folder lists and the file sizes go through the thread pool, so other requests are answered meanwhile);
// the visit order, the caps, the tree and the totals are those of the sync walk it replaces: one folder at a time off the stack,
// its entries in listing order, the sizes of exactly the files counted before a cap.
async function apiMod(dirArg, G) {
  const fsp = fs.promises, dir = requireAbs(dirArg, 'dir');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw Object.assign(new Error('not a folder: ' + dir), { status: 404 });
  { const R = path.resolve(dir), same = (a, b) => !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
    if (path.parse(R).root === R || same(R, os.homedir()) || same(R, process.env.USERPROFILE)) throw Object.assign(new Error('refused: ' + dir + ' is a whole drive or your user folder, not a mod folder. Pick the mod folder itself (the one that holds mod.info).'), { status: 400 }); }
  const mi = readModInfo(dir), t0 = Date.now();
  let files = 0, bytes = 0, truncated = false, note; const stack = [dir], top = [];   // top: GX first-mod G9 file tree (three levels)
  while (stack.length && !truncated) {
    if (Date.now() - t0 > MOD_WALK_MS) { truncated = true; note = 'stopped after ' + (MOD_WALK_MS / 1000) + ' s: too many files: is this a mod folder?'; break; }
    const d = stack.pop(); let ents; try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch (e) { continue; }
    const sized = [];
    for (const e of ents) {
      const rel = path.relative(dir, path.join(d, e.name)).split(path.sep).join('/');
      if (rel.split('/').length <= 3 && top.length < 200) top.push(e.isDirectory() ? rel + '/' : rel);
      if (e.isDirectory()) stack.push(path.join(d, e.name));
      else if (e.isFile()) { files++; sized.push(path.join(d, e.name)); if (files >= MOD_FILES_CAP) { truncated = true; note = 'stopped at ' + MOD_FILES_CAP + ' files: too many files: is this a mod folder?'; break; } }
    }
    for (let i = 0; i < sized.length; i += 64) for (const n of await Promise.all(sized.slice(i, i + 64).map(f => fsp.stat(f).then(s => s.size, () => 0 /* gone */)))) bytes += n;
  }
  return { path: dir, hasInfo: !!mi, name: mi ? mi.name : '', desc: mi ? mi.desc : '', modInfo: mi ? mi.text.slice(0, 16384) : '', files, bytes, truncated,
    tree: top.sort(), works: G && G.kind === 'goh' ? worksOn(mi ? mi.text : '', 'goh', gohVersion(G.gohDir())) : worksOn(mi ? mi.text : ''), note };
}
const TEXT_EXT = new Set(['.yaml', '.yml', '.json', '.txt', '.md', '.info', '.csv', '.log']);
function apiText(p) {
  const f = requireAbs(p, 'path');
  if (!TEXT_EXT.has(path.extname(f).toLowerCase())) throw Object.assign(new Error('only ' + [...TEXT_EXT].join(' ') + ' files can be read'), { status: 400 });
  let st; try { st = fs.statSync(f); } catch (e) { throw Object.assign(new Error('no such file'), { status: 404 }); }
  if (!st.isFile()) throw Object.assign(new Error('not a file'), { status: 400 });
  if (st.size > 524288) throw Object.assign(new Error('file over 512 KB'), { status: 413 });
  return { path: f, text: fs.readFileSync(f).toString('utf8').replace(/^﻿/, '') };
}
// GUIUX: a few lines around a finding, so a card's "where" can be opened. Any text file (data files have many extensions); binary and >2 MB refused.
function apiPeek(p, lineArg) {
  const f = requireAbs(p, 'path');
  // GUI-LOC: a packed mod's file is a pak entry (<mod>/resource/entity.pak holds entity/..., N.pat holds resource/...): read it from there
  let st = null, inPak = null; try { st = fs.statSync(f); } catch (e) { /* maybe a pak entry */ }
  if (!st) { const hit = require('../lib/locate').find(f); if (hit && hit.pak) inPak = hit; else throw Object.assign(new Error('no such file'), { status: 404 }); }
  if (st && !st.isFile()) throw Object.assign(new Error('not a file'), { status: 400 });
  if ((st ? st.size : inPak.ent.size) > 2097152) throw Object.assign(new Error('file over 2 MB'), { status: 413 });
  const b = st ? fs.readFileSync(f) : require('../lib/pak').read({ file: inPak.pak }, inPak.ent);
  if (b.subarray(0, 4096).includes(0)) throw Object.assign(new Error('binary file: open it in its own tool'), { status: 415 });
  const all = decodeText(b).replace(/^\uFEFF/, '').split(/\r?\n/), line = Math.max(0, parseInt(lineArg, 10) || 0);
  const from = line ? Math.max(1, line - 8) : 1, to = line ? Math.min(all.length, line + 8) : Math.min(all.length, 40);
  const lines = []; for (let n = from; n <= to; n++) lines.push({ n, text: all[n - 1].slice(0, 400) });
  return { path: f, line, total: all.length, lines, pak: inPak ? inPak.pak : undefined, entry: inPak ? inPak.entry : undefined };
}
// GUIUX: plain-words cards for finding codes (tools/lib/explain)
function apiExplain(codesArg, langArg) {
  const ex = require('../lib/explain'), cards = {}, lang = ['en', 'ru', 'uk', 'zh'].includes(langArg) ? langArg : 'en';   // GX: cards in the page language
  for (const c of String(codesArg || '').split(',').map(x => x.trim()).filter(x => /^[A-Za-z0-9_]{1,80}$/.test(x)).slice(0, 300)) cards[c] = ex.explain(c, undefined, { lang, sea: SEA });
  return { cards, fixers: ex.FIXERS };
}
// GUI-LIM: limits row behind a finding. codes=A,B -> {codes:{CODE:{lim:[ids],kind:'tool'|null,class}|null}}; id=AREA-NN -> {id,class,row:{subject,limit,effect,tag}|null}. Row text is read from limits/<AREA>.md (absent in the exe: row null)
function apiLimit(codesArg, idArg) {
  const lm = require('../lib/limmap');
  if (idArg) {
    const id = String(idArg).trim();
    if (!/^[A-Z][A-Z0-9]*-\d+$/.test(id)) throw Object.assign(new Error('id: AREA-NN'), { status: 400 });
    let row = null;
    try {
      // rows of one area can sit in continuation files (PORT7.md holds PORT-138..): scan AREA.md, AREA2.md, ...
      const area = id.replace(/-\d+$/, ''), dir = path.join(__dirname, '..', '..', 'limits');
      const names = fs.readdirSync(dir).filter(n => new RegExp('^' + area + '\\d*\\.md$').test(n)).sort();
      for (const n of names) {
        for (const ln of fs.readFileSync(path.join(dir, n), 'utf8').split(/\r?\n/)) {
          if (!ln.startsWith(id + ' | ')) continue;
          const p = ln.split(' | ');
          row = { subject: p[1] || '', limit: p[2] || '', effect: p[3] || '', tag: p.slice(4).join(' | ') };
          break;
        }
        if (row) break;
      }
    } catch (e) { /* no limits folder: class only */ }
    return { id, class: lm.rowClass(id), row };
  }
  const codes = {};
  for (const c of String(codesArg || '').split(',').map(x => x.trim()).filter(x => /^[A-Za-z0-9_]{1,80}$/.test(x)).slice(0, 400)) codes[c] = lm.limitOf(c);
  return { codes };
}
// GUIUX: fix apply never writes into the source mod (fix outRefusal checks it too; this is the GUI's own guard)
function outGuard(cmd, input, cwd) {
  if (input && typeof input === 'object') {
    const WG = require('../lib/writeguard'), base = cwd || process.cwd(), gm = typeof input.game === 'string' && input.game ? path.resolve(base, input.game) : undefined;
    const targets = [['out', 'write the output']].concat(cmd === 'new' ? [['dir', 'make the new mod']] : []);
    for (const [k, purpose] of targets) {
      if (typeof input[k] !== 'string' || !input[k]) continue;
      const t = path.resolve(base, input[k]);
      let st = null; try { st = fs.statSync(t); } catch (e) { /* new folder */ }
      if (st && !st.isDirectory()) throw Object.assign(new Error('refused: ' + t + ' is a file, not a folder. Pick a folder for ' + k + ' (a new one is best).'), { status: 400 });
      const why = WG.refuseWrite(t, { game: gm, purpose });
      if (why) throw Object.assign(new Error(why), { status: 400 });
    }
  }
  if (cmd !== 'fix' || !input || input.mode !== 'apply' || typeof input.out !== 'string' || typeof input.mod !== 'string' || !input.out || !input.mod) return;
  const n = p => path.resolve(p).toLowerCase().replace(/[\\/]+$/, ''), o = n(input.out), m = n(input.mod), sep = s => s + path.sep;
  if (o === m || o.startsWith(sep(m)) || m.startsWith(sep(o))) throw Object.assign(new Error('out must be a new folder outside the mod: the source mod is never written'), { status: 400 });
}
// GX concepts C4: is this really the game folder? an exe and mods/ in it
// W5: codes = the same problems as words the page translates (missing, goh, noexe, nomods); problems stay for the CLI and old pages
function gameCheck(dir) {
  if (!dir) return { ok: false, exe: null, exes: [], hasMods: false, problems: ['no game folder found'], codes: ['none'] };
  const exe = ['as64.exe', 'mowas_2.exe'].filter(x => fs.existsSync(path.join(dir, x))), hasMods = fs.existsSync(path.join(dir, 'mods')), problems = [], codes = [];
  if (!fs.existsSync(dir)) { problems.push('folder does not exist'); codes.push('missing'); }
  else if (require('../lib/writeguard').isGoh(dir)) { problems.push('this is Gates of Hell (call_to_arms.exe), not Men of War: Assault Squad 2. Pick the folder that holds as64.exe or mowas_2.exe'); codes.push('goh'); }
  else { if (!exe.length) { problems.push('no as64.exe or mowas_2.exe in it'); codes.push('noexe'); } if (!hasMods) { problems.push('no mods folder in it'); codes.push('nomods'); } }
  let goh = false; try { goh = !!dir && fs.existsSync(dir) && require('../lib/writeguard').isGoh(dir); } catch (e) { /* no */ }
  return { ok: !problems.length, exe: exe[0] || null, exes: exe, hasMods, goh, problems, codes };
}
// W5: the Gates of Hell install for the GoH game in the header (tools/lib/gamedir.goh: arg, GOH_GAME, as2.json "goh", Steam 400750).
// codes: none (not found), missing (no such folder), notgoh (no call_to_arms.exe), nomods (no mods folder yet: the game makes it)
function gohCheck(arg) {
  let dir = null; try { dir = gamedir.goh({ arg }); } catch (e) { dir = null; }
  if (!dir) return { dir: null, source: null, ok: false, exe: null, hasMods: false, codes: ['none'] };
  const codes = [], has = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
  const exe = ['binaries/x64/call_to_arms.exe', 'call_to_arms.exe'].find(x => has(path.join(dir, x))) || null, hasMods = fs.existsSync(path.join(dir, 'mods'));
  if (!fs.existsSync(dir)) codes.push('missing');
  else if (!exe) codes.push('notgoh');
  else if (!hasMods) codes.push('nomods');
  return { dir, source: arg ? 'arg' : 'auto', ok: !codes.length, exe, hasMods, codes };
}
// a spec typed in the page goes to <tmp>/as2gui-specs/<name>.yaml, never to a path the page picks
function apiSpec(body, tmpRoot) {
  const name = typeof body.name === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(body.name) ? body.name : null;
  if (!name) throw Object.assign(new Error('name: 1-60 of A-Z a-z 0-9 _ -'), { status: 400 });
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name)) throw Object.assign(new Error('name: "' + name + '" is a name Windows keeps for itself (CON, AUX, NUL, PRN, COM1-9, LPT1-9). Pick another, e.g. ' + name + '_spec'), { status: 400 });
  if (typeof body.text !== 'string' || body.text.length > 262144) throw Object.assign(new Error('text: a string up to 256 KB'), { status: 400 });
  const dir = path.join(tmpRoot || os.tmpdir(), 'as2gui-specs'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name + (body.json ? '.json' : '.yaml')), replaced = fs.existsSync(file); fs.writeFileSync(file, body.text, 'utf8');
  return { path: file, replaced };
}

// --demo-xlate: `translate` runs the mock tool (test/mock-xlate.js) instead of goh2as2, so the question screen can be clicked through without game data (it emits the real XLATE-2 question line)
function demoHook(cc, info) {
  if (info.cmd !== 'translate' || SEA) return cc;
  return { file: process.execPath, args: [path.join(__dirname, 'test', 'mock-xlate.js'), ...cc.args.filter(a => a === '--ask-json' || a === '--no-ask')] };
}

// start({port, allowLaunch, cwd, spawnHook, tmpRoot, demoXlate, dev, remote, watchDirs, jobKeepMs}) ->Promise<{server, port, url, close(), changed(files), setRemote(on)}>
// test hooks (never from HTTP or the CLI): remoteHook(req) -> true marks a loopback request as a phone request (the LAN is never
// opened when it is set), lan = the LAN addresses to accept in Host. Supervised child (--dev): token, onState(state), onRestart(files).
function start(opt = {}) {
  // JOBS (README.md, joblist.js): one registry per server. runs = the /api/run handles by id (for /api/answer); each is in the registry too.
  // opt.jobKeepMs (tests): how long a finished background job stays listed (default 10 s). A run or request job leaves the list when it ends:
  // the page has its outcome from its own response, and the list is empty when nothing runs, as before.
  const runs = new Map(), jobs = require('./joblist').create({ keepMs: opt.jobKeepMs });
  // CACHE (README contract 1): the shared store. A server on a scratch folder (start({tmpRoot}): tests, reviewers) keeps its own under that
  // folder, so nothing lands in the real per-user cache. Entries of another release are removed once after the start (cacheSwept: for the
  // Prepare page): not before the listen, because a store without an index (the first start of a release that has one, or a deleted
  // index.json) costs a pass over every entry. S.warm() builds the index in slices from a timer; the sweep runs when it is done, over
  // rows it then knows. cacheSwept is null until the sweep has run; cacheReady resolves when it has. A route that needs the whole
  // store (GET /api/cache, the Prepare state: ctx.cacheReady) waits for it instead of reading what is left in one blocking pass, so
  // its answer is the one it gave before: after the sweep, with "updated" on the first Prepare read.
  // Nothing of another release is served meanwhile: the release is part of what get compares (cachestore rule).
  const modtreeLib = require('../lib/modtree'), gameviewLib = require('../lib/gameview');
  const cache = require('../lib/cachestore').open(opt.tmpRoot ? { root: path.join(opt.tmpRoot, 'cache', 'store') } : {});
  if (opt.tmpRoot) modtreeLib._reset({ store: cache });
  let cacheSwept = null, closed = false;
  const sweepNow = () => { if (closed || cacheSwept !== null) return; try { cacheSwept = (cache.sweep() || {}).removed || 0; } catch (e) { cacheSwept = 0; /* best effort */ } };
  const cacheReady = new Promise(done => setImmediate(() => { let w; try { w = closed ? Promise.resolve() : cache.warm(); } catch (e) { w = Promise.resolve(); } w.then(sweepNow, sweepNow).then(done, done); }));
  // the child processes a job owns (ctx.runTool): cancelling the job kills their trees; a job without a stop function of its own can be
  // cancelled only while it has a live child. kids = every such child of this server, killed on close.
  const kids = new Set(), trackers = new WeakMap();
  let reqN = 0;
  const trackerOf = job => {
    let tr = trackers.get(job); if (tr) return tr;
    const own = new Set();   // job.childLive: a live child makes the job stoppable, beside the flag the route sets itself (canCancel)
    tr = { job, kill() { for (const c of [...own]) killTree(c); },
      add(c) { own.add(c); kids.add(c); job.childLive = true; },
      del(c) { own.delete(c); kids.delete(c); job.childLive = own.size > 0; } };
    job.onCancel(tr.kill); trackers.set(job, tr); return tr;
  };
  const state = { allowLaunch: !!opt.allowLaunch };   // GX first-mod G5: the page switch changes this for this server session only (never saved)
  const session = { token: typeof opt.token === 'string' && opt.token.length >= 32 ? opt.token : require('crypto').randomBytes(16).toString('hex') };   // IDE: one secret per server start (kept by the --dev parent across restarts), shared only through opt.portFile
  const SETTINGS = settings.store(opt.settingsFile || null);   // opt.settingsFile: only the command-line start passes the real file; without it settings live in memory
  // the Advanced switch (Tools & Settings) reaches lib/writeguard here and in every tool this server starts (cleanEnv copies it): with it on,
  // a Gates of Hell mod that ARSENAL did not make may be written directly (owner 2026-11-15)
  const syncAdv = () => { process.env.ARSENAL_ADVANCED = SETTINGS.get()['as2gui.adv'] === true ? '1' : '0'; };
  syncAdv();
  // X8 (modwatch.js): one watch of the picked mod keeps its listing warm; a check started here is handed it (check --listing). Off: the
  // window setting as2gui.modwatch false (Settings > Watch the picked mod), env ARSENAL_MODWATCH=0; opt.modwatchSettleMs for tests
  const MW = modwatch.create({ modtree: modtreeLib, enabled: SETTINGS.get()['as2gui.modwatch'] !== false, settleMs: opt.modwatchSettleMs });
  const mwOn = () => MW.enable(SETTINGS.get()['as2gui.modwatch'] !== false);
  // the mod check's expected wait (checketa.js): the times of the last checks of this PC, in check-times.json beside the settings file
  // (per user, never in a mod or the game); opt.etaFile for tests; no settings file = memory only. etaCounts: files and bytes per mod
  // folder as the last GET /api/check/eta counted them, so the check that follows is recorded with them without another walk
  const ETA = checketa.store(opt.etaFile !== undefined ? opt.etaFile : opt.settingsFile ? path.join(path.dirname(opt.settingsFile), 'check-times.json') : null), etaCounts = new Map();
  // the file count: the page's own (GET /api/mod, capped at 5000 files) unless capped; then the shared walk (lib/modtree, async)
  async function checkEta(u, G) {
    const sp = u.searchParams, dir = path.resolve(requireAbs(sp.get('dir'), 'dir')), key = lowp(dir), on = k => sp.get(k) === '1' || sp.get(k) === 'true';
    let files = Math.max(0, Math.round(+sp.get('files') || 0)), bytes = Math.max(0, Math.round(+sp.get('bytes') || 0)), walked = false;
    if (sp.get('trunc') === '1' || !sp.get('files')) {
      let T = modtreeLib.fresh(dir), c = T ? null : etaCounts.get(key);
      if (c && !c.walked) c = null;   // a count the page sent is below the cap: not the count of a capped folder
      if (!T && !c) { T = modtreeLib.last(dir); if (!T) { try { T = await modtreeLib.ensure(dir, { maxAgeMs: Infinity }); } catch (e) { T = null; } } }
      if (T) c = { files: T.count, bytes: T.bytes };
      if (c) { files = c.files; bytes = c.bytes; walked = true; }
    }
    etaCounts.set(key, { files, bytes, walked });
    const q = { game: G.id, kind: G.kind, mode: checketa.modeOf({ fast: on('fast'), noload: on('noload') }), allgames: on('allgames'), restorepoints: on('restorepoints'), files, drive: checketa.driveOf(dir) };
    return Object.assign({ files, bytes, mode: q.mode }, checketa.estimate(ETA.rows(), q));
  }
  // a check that ended with a result (exit 0, or 1 with findings) is one more row; a re-check with a patch or of one tool is not
  function noteCheck(inp, G, ev) {
    try {
      if (!inp || typeof inp.mod !== 'string' || !path.isAbsolute(inp.mod) || inp.with || inp.only || !ev || !(ev.code === 0 || (ev.code === 1 && ev.result != null)) || !(ev.ms > 0)) return;
      const dir = path.resolve(inp.mod), put = c => ETA.add({ game: G.id, kind: G.kind, mode: checketa.modeOf({ fast: !!inp.fast, noload: !!inp.noload }), allgames: !!inp.allgames || /,/.test(String(inp.exe || '')),
        restorepoints: !!inp.restorepoints, files: c.files, bytes: c.bytes, sec: ev.ms / 1000, drive: checketa.driveOf(dir), at: Date.now() });
      const c = etaCounts.get(lowp(dir)), T = c ? null : modtreeLib.fresh(dir);
      if (c) put(c); else if (T) put({ files: T.count, bytes: T.bytes });
      else modtreeLib.ensure(dir, { maxAgeMs: Infinity }).then(t => put({ files: t.count, bytes: t.bytes }), () => { /* folder gone: not recorded */ });
    } catch (e) { /* not recorded */ }
  }
  const live = liveLib.createLive(require('crypto').randomBytes(6).toString('hex'));
  // LAN Remote (remote.js): R.on = listening on the LAN; the key lives in the settings file (server only)
  // the key is made (and saved) the first time LAN Remote is used, so a plain start never writes the settings file
  const R = { on: false, k: SETTINGS.getPriv('remoteKey'), servers: [], errors: [], follow: null, thr: remote.throttle(), test: typeof opt.remoteHook === 'function',
    get key() { if (typeof this.k !== 'string' || this.k.length < 22) { this.k = remote.newKey(); SETTINGS.setPriv('remoteKey', this.k); } return this.k; } };
  const lan = () => (Array.isArray(opt.lan) ? opt.lan : remote.lanAddrs());
  const tell = () => { if (opt.onState) try { opt.onState({ remote: R.on, allowLaunch: state.allowLaunch }); } catch (e) { /* parent gone */ } };
  const remoteRoots0 = () => {
    const out = remote.settingsRoots(SETTINGS.get());
    try { const g = gamedir.resolve({}).dir; if (g) out.push(g, workshopDir(g)); } catch (e) { /* none */ }
    try { const g = gamedir.goh({}); if (g) out.push(g, workshopDir(g, 'goh')); } catch (e) { /* none */ }   // the GoH Workshop (400750): the PC page lists it
    out.push(opt.tmpRoot || path.join(os.tmpdir(), 'arsenal-gui'));
    return out.filter(Boolean);
  };
  function remoteInfo() {
    const port = server.address().port, addrs = lan(), links = addrs.map(a => 'http://' + a + ':' + port + '/?k=' + R.key);
    let qr = null; if (links[0]) { const q = require('./qr').encode(links[0]); qr = { size: q.size, rows: q.modules.map(r => r.map(c => (c ? '1' : '0')).join('')) }; }
    return { on: R.on, port, addrs, link: links[0] || null, links, qr, errors: R.errors };
  }
  async function setRemote(on) {
    R.errors = [];
    if (!on) {
      R.on = false;
      for (const s of R.servers) { s.close(); if (s.closeAllConnections) s.closeAllConnections(); }
      R.servers = []; live.drop(m => m.remote); tell(); return;
    }
    R.on = true; tell();
    if (R.test || R.servers.length) return;   // tests never open the LAN
    const port = server.address().port;
    await Promise.all(lan().map(a => new Promise(done => {
      const s = http.createServer((q, r) => handle(q, r, true));
      s.once('error', e => { R.errors.push(a + ': ' + (e.code || e.message)); done(); });
      s.listen(port, a, () => { R.servers.push(s); done(); });
    })));
  }
  function newLink() { R.k = remote.newKey(); const w = SETTINGS.setPriv('remoteKey', R.k); live.drop(m => m.remote); return w; }
  // --dev: files changed on disk. Server code -> the parent restarts this process (onRestart); else the page is built again and pages reload
  const watchRoots = (opt.watchDirs || []).map(d => lowp(path.resolve(d) + path.sep));
  // a watch event is not always an edit: on Windows the first read of a file (a lazy require, a test run) moves its last access time
  // and fires one. Only a file whose modified time moved since this process started (or since its last event), or that is gone, counts.
  const bootMs = Date.now(), seenMs = new Map();
  const edited = f => { const l = lowp(path.resolve(f)); let m; try { m = fs.statSync(f).mtimeMs; } catch (e) { return true; } const was = seenMs.has(l) ? seenMs.get(l) : bootMs; if (m <= was) return false; seenMs.set(l, m); return true; };
  function changed(files) {
    const idx =new Map(Object.keys(require.cache).map(k => [lowp(k), k]));
    const rel = files.filter(f => { const l = lowp(path.resolve(f)); return idx.has(l) || (l.startsWith(GUI_DIR) && !/[\\/]test[\\/]/.test(l)) || watchRoots.some(r => l.startsWith(r)); });
    if (!rel.length) return 'none';
    const srv = rel.filter(f => { const k = idx.get(lowp(path.resolve(f))); return k && !isClient(k); });
    if (srv.length && opt.onRestart) { opt.onRestart(srv); return 'restart'; }
    rebuildPage(); live.send('reload', { files: rel.map(f => path.basename(f)) }); return 'reload';
  }
  const watcher = opt.dev && opt.watchDirs ? liveLib.watch(opt.watchDirs, changed) : null;
  const server = http.createServer((req, res) => handle(req, res, R.test ? !!opt.remoteHook(req) : false));
  async function handle(req, res, rem) {
    const port = server.address().port, hosts = new Set(['127.0.0.1:' + port, 'localhost:' + port]);
    const remoteRoots = (() => { let rr = null; return () => (rr || (rr = remoteRoots0())).slice(); })();   // the folders the PC page shows: found once per request
    let u;
    if (rem) {
      // a phone (remote.js): on, not locked out, Host = one of this PC's LAN addresses, Origin (if sent) = that, then the key
      const ip = String(req.socket.remoteAddress || ''), deny = () => send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
      const host = String(req.headers.host || '').toLowerCase();
      if (!R.on || R.thr.locked(ip)) return deny();
      if (!lan().some(a => host === a + ':' + port)) return deny();
      if (req.headers.origin && req.headers.origin !== 'http://' + host) return deny();
      u = new URL(req.url, 'http://' + host);
      const k = u.searchParams.get('k');
      if (k != null) {
        if (!remote.keyEq(k, R.key)) { R.thr.bad(ip); return deny(); }
        R.thr.good(ip); u.searchParams.delete('k');
        res.writeHead(303, { location: u.pathname + u.search, 'set-cookie': remote.setCookie(R.key), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
        return res.end();
      }
      if (!remote.keyEq(remote.cookieOf(req), R.key)) { R.thr.bad(ip); return deny(); }
      if (!remote.allowed(req.method, u.pathname)) return send(res, 403, { error: 'view only on this device', key: 'rmt.viewOnly' });
      if (remote.pathRefusal([...u.searchParams.values()], remoteRoots()) || remote.gameRefusal(u.searchParams.get('game'))) return send(res, 403, { error: 'view only on this device: the PC page does not show that folder', key: 'rmt.viewOnly' });
      // game parity: the GoH folder of the request (?goh=, header x-arsenal-goh URI-decoded; body.goh below) follows the same rule as ?game=
      // (a full path under a folder the PC page shows); a header that does not decode is refused. The game id (gid) alone names no folder.
      if (remote.gameRefusal(u.searchParams.get('goh'))) return send(res, 403, { error: 'view only on this device: the PC page does not show that folder', key: 'rmt.viewOnly' });
      if (req.headers['x-arsenal-goh'] != null) {
        let hg = null; try { hg = decodeURIComponent(String(req.headers['x-arsenal-goh'])); } catch (e) { hg = null; }
        if (hg === null || remote.gameRefusal(hg) || remote.pathRefusal([hg], remoteRoots())) return send(res, 403, { error: 'view only on this device: the PC page does not show that folder', key: 'rmt.viewOnly' });
      }
    } else {
      // DNS rebinding / cross-site: Host must be ours, Origin (if sent) must be ours, writes must be JSON
      if (!hosts.has(String(req.headers.host || '').toLowerCase())) return fail(res, 403, 'bad Host header');
      if (req.headers.origin && ![...hosts].some(h => req.headers.origin === 'http://' + h)) return fail(res, 403, 'bad Origin');
      u = new URL(req.url, 'http://127.0.0.1');
    }
    try {
      const xr = EXT_ROUTES[req.method + ' ' + u.pathname];   // GUI-EXT routes
      if (xr) {
        // IDE review: ext POSTs write too (files/save), so they get the same JSON-only rule as the core POSTs below
        if (req.method === 'POST' && !/^application\/json\b/i.test(req.headers['content-type'] || '')) return fail(res, 415, 'content-type must be application/json');
        const body = req.method === 'POST' ? await readBody(req, 8 << 20) : null;
        if (rem && body && typeof body === 'object' && (remote.pathRefusal(Object.values(body), remoteRoots()) || remote.gameRefusal(body.game) || remote.gameRefusal(body.goh))) return send(res, 403, { error: 'view only on this device: the PC page does not show that folder', key: 'rmt.viewOnly' });
        const G = reqGame(u, body, req);
        // GX: the page's game override (?game= or body.game) wins over the saved/auto game folder
        // asked once per request (one route called it up to 93 times, each a walk to as2.json and the Steam files): kept for this request
        let cgDone = false, cgDir = null;
        const ctxGame = () => { if (cgDone) return cgDir; const ov = u.searchParams.get('game') || (body && typeof body.game === 'string' ? body.game : '') || undefined; try { cgDir = gamedir.resolve({ arg: ov }).dir; } catch (e) { cgDir = null; } cgDone = true; return cgDir; };
        // JOBS: this request is a 'req' job while it runs (id = header x-arsenal-job when well formed and free). Its ctx.runTool children
        // belong to it ({job: handle} in the options = to that background job instead); they die on cancel and when the client goes away
        const pollUrl = x => { const p = x.pathname, q = x.search.slice(1); return /[/](status|progress|joblist|jobs)$/.test(p) || (/[/](job|run)$/.test(p) && /(^|&)id=/.test(q)) || /(^|&)wait=1(&|$)/.test(q); };   // as JOBSKIP in page.js
        const hid = String(req.headers['x-arsenal-job'] || '');
        const job = jobs.add({ id: /^[A-Za-z0-9_-]{6,40}$/.test(hid) && !jobs.get(hid) ? hid : 'x' + (++reqN).toString(36) + Date.now().toString(36), kind: 'req', what: '', game: G.id, canCancel: false, keepMs: 0, hidden: req.method === 'GET' && pollUrl(u) });
        const tr = trackerOf(job);
        res.on('close', () => { if (!res.writableEnded && job.state === 'running') { job.cancelled = true; tr.kill(); } });
        const jobTool = (tool, entry, args, o = {}) => runTool(tool, entry, args, o, o && o.job && typeof o.job.onCancel === 'function' && jobs.get(o.job.id) === o.job ? trackerOf(o.job) : tr);
        const cancelled = () => { job.end('cancelled'); if (!res.headersSent && !res.writableEnded) send(res, 499, { error: 'cancelled', key: 'job.cancelled' }); else if (!res.writableEnded) res.end(); };
        let out;
        try { out = await xr(u, body, { gamedir, tools: TOOLS, tmpRoot: opt.tmpRoot || path.join(os.tmpdir(), "arsenal-gui"), runTool: jobTool, jobs, job, cache, get cacheSwept() { return cacheSwept; }, cacheReady, modtree: modtreeLib, gameview: gameviewLib, prepSections: require('./ext').prep, allowLaunch: state.allowLaunch,
        session: { token: rem ? '' : session.token, port, remote: !!rem },   // IDE: the inbox route checks this token (Notepad++ -> GUI jump); never handed to a phone request
        // a phone: every file a route reads is asked here again (real path under a root the PC page shows); null on the PC
        pathOk: rem ? (() => { let rr = null; return p => typeof p === 'string' && path.isAbsolute(p) && !remote.pathRefusal([p], rr || (rr = remote.rootSet(remoteRoots()))); })() : null,
        onClose: fn => { res.on('close', () => { if (!res.writableEnded) try { fn(); } catch (e) { /* the route's own clean-up */ } }); },   // IDE: a held answer (inbox long poll) learns that the page went away
        game: ctxGame,   // the AS2 install (unchanged)
        // game parity: the page's game (?gid=, body.gid, header x-arsenal-game; default as64), its vfs exe and kind, the GoH install
        // (?goh=, body.goh, header x-arsenal-goh, else gamedir.goh; null when none) and the install of the request's game
        gameId: () => G.id, exe: () => G.exe, kind: () => G.kind, gohDir: () => G.gohDir(), curDir: () => (G.kind === 'goh' ? G.gohDir() : ctxGame()) }); }
        catch (e) { if (job.cancelled) return cancelled(); job.end('failed'); throw e; }
        if (job.cancelled) return cancelled();   // whatever the handler returned
        job.end(res.writableEnded && res.statusCode >= 400 ? 'failed' : 'done');
        // IDE: a route may answer with plain text instead of JSON (the editor's script and style): {__raw: string, type}
        if (res.writableEnded) return;
        if (out && typeof out.__raw === 'string') { const rh = rawHead(out); return send(res, 200, out.__raw, rh.type, rh.extra); }
        return send(res, 200, out); }
      if (req.method === 'GET' && u.pathname === '/') {
        if (rem) return sendPage(res, { remote: true, live: true, dev: !!opt.dev });
        return sendPage(res, opt.dev || R.on ? { live: !!opt.dev, dev: !!opt.dev, rOn: R.on } : null);
      }
      if (req.method === 'GET' && u.pathname === '/api/live') {
        if (!rem && !opt.dev && !R.on) return fail(res, 404, 'not found');   // the PC page needs it while LAN Remote is on (to follow a remote device)
        return live.open(req, res, { remote: !!rem }, rem && R.follow ? [['follow', R.follow]] : null);
      }
      if (req.method === 'GET' && u.pathname === '/api/remote') return send(res, 200, remoteInfo());
      if (req.method === 'GET' && u.pathname === '/console') return send(res, 200, CONSOLE, 'text/html; charset=utf-8');
      if (req.method === 'GET' && u.pathname === '/api/cache') { await cacheReady; return send(res, 200, cache.stats()); }
      if (req.method === 'GET' && u.pathname === '/api/jobs') return send(res, 200, { jobs: jobs.list() });   // JOBS record; the old fields id, cmd, interactive, startedMs, game as before
      // game parity: ls, mods, mod and installed take the request's game (?gid=, header x-arsenal-game; ?goh=, header x-arsenal-goh)
      if (req.method === 'GET' && u.pathname === '/api/ls') return send(res, 200, apiLs(u.searchParams.get('dir'), u.searchParams.get('game'), u.searchParams.get('files') === '1', u.searchParams.get('for') === 'out', reqGame(u, null, req)));
      if (req.method === 'GET' && u.pathname === '/api/mods') return send(res, 200, await apiMods(u.searchParams.get('dir'), reqGame(u, null, req)));
      if (req.method === 'GET' && u.pathname === '/api/mod') return send(res, 200, await apiMod(u.searchParams.get('dir'), reqGame(u, null, req)));
      // the mod check's expected wait: ?dir= &files= &bytes= &trunc=1 (the page's GET /api/mod answer) &fast= &noload= &allgames= &restorepoints= (1)
      // -> {sec, basis: guess | history, n, files, bytes, mode}
      if (req.method === 'GET' && u.pathname === '/api/check/eta') return send(res, 200, await checkEta(u, reqGame(u, null, req)));
      // the watch of the picked mod (modwatch.js): ?dir= -> {enabled, dir, watching, ready, sid, gen, err} (the Check page's re-check box)
      if (req.method === 'GET' && u.pathname === '/api/modwatch/status') return send(res, 200, MW.status(u.searchParams.get('dir') || ''));
      if (req.method === 'GET' && u.pathname === '/api/peek') return send(res, 200, apiPeek(u.searchParams.get('path'), u.searchParams.get('line')));
      if (req.method === 'GET' && u.pathname === '/api/explain') return send(res, 200, apiExplain(u.searchParams.get('codes'), u.searchParams.get('lang')));
      if (req.method === 'GET' && u.pathname === '/api/limit') return send(res, 200, apiLimit(u.searchParams.get('codes'), u.searchParams.get('id')));
      if (req.method === 'GET' && u.pathname === '/api/text') return send(res, 200, apiText(u.searchParams.get('path')));
      if (req.method === 'GET' && u.pathname === '/api/health') return send(res, 200, { ok: true, sea: SEA, allowLaunch: state.allowLaunch, version: VERSION, demo: !!opt.demoXlate });
      if (req.method === 'GET' && u.pathname === '/api/installed') return send(res, 200, await apiInstalled(u.searchParams.get('game'), reqGame(u, null, req)));
      // window settings (settings.js): the page seeds its values from here before it draws; problem = a damaged or unreadable file, said once
      if (req.method === 'GET' && u.pathname === '/api/settings') { const all = SETTINGS.get(); return send(res, 200, rem ? { settings: all, empty: false, file: '', problem: null } : { settings: all, empty: !Object.keys(all).length, file: SETTINGS.file, problem: SETTINGS.takeProblem() }); }
      if (req.method === 'GET' && u.pathname === '/api/commands') return send(res, 200, { version: VERSION, commands: contract.describe() });
      if (req.method === 'GET' && u.pathname === '/api/game') {
        if (u.searchParams.get('kind') === 'goh') return send(res, 200, gohCheck(absGame(u.searchParams.get('game'))));
        const g = gamedir.resolve({ arg: absGame(u.searchParams.get('game')) });
        return send(res, 200, Object.assign({}, g, gameCheck(g.dir)));
      }
      // LAN Remote the other way: a remote device tells its screen; the PC pages that follow the remote device go there (screen only).
      // Strict: a body of {screen} only, one of the page's screen ids. Writes nothing; dropped unless the PC switch is on; local pages only
      if (req.method === 'POST' && u.pathname === '/api/follow/remote') {
        if (!rem) return fail(res, 403, 'from a remote device only');
        if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return fail(res, 415, 'content-type must be application/json');
        if (Number(req.headers['content-length'] || 0) > 1024) return fail(res, 400, 'screen: a page id');
        let body = null; try { body = await readBody(req, 1024); } catch (e) { return fail(res, 400, 'screen: a page id'); }
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.screen !== 'string'
          || !/^[a-z0-9_-]{1,40}$/.test(body.screen) || !SCREEN_IDS.has(body.screen)) return fail(res, 400, 'screen: a page id');
        if (SETTINGS.get()['as2gui.share.rmtFollowPc'] === true) live.send('follow', { screen: body.screen, from: 'remote' }, m => !m.remote);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST') {
        if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return fail(res, 415, 'content-type must be application/json');
        const body = await readBody(req);
        if (u.pathname === '/api/cancel') {
          // JOBS: any registered job (run, request, background)
          const j = typeof body.id === 'string' ? jobs.get(body.id) : null;
          if (!j || j.state !== 'running') return fail(res, 404, 'no such running job');
          if (!j.canCancel && !j.childLive) return send(res, 409, { error: 'this job cannot be stopped now', key: 'job.e.nostop' });
          jobs.cancel(j.id); return send(res, 200, { ok: true });
        }
        if (u.pathname === '/api/answer') {
          const j = runs.get(body.id);
          if (!j) return fail(res, 404, 'no such running job');
          if (!j.answer) return fail(res, 400, 'this job takes no answers');
          if (!body.answer || typeof body.answer !== 'object' || Array.isArray(body.answer) || JSON.stringify(body.answer).length > 65536) return fail(res, 400, 'answer: a JSON object up to 64 KB');
          if (!j.answer(body.answer)) return fail(res, 409, 'the job no longer reads input');
          return send(res, 200, { ok: true });
        }
        if (u.pathname === '/api/launch') {
          if (typeof body.on !== 'boolean') return fail(res, 400, 'on: true or false');
          state.allowLaunch = body.on; tell(); return send(res, 200, { ok: true, allowLaunch: state.allowLaunch });
        }
        // the LAN Remote switch and link: from this PC only (a loopback socket; a remote device never gets here: not on remote.ALLOW)
        if (u.pathname === '/api/remote' || u.pathname === '/api/remote/newkey') {
          if (rem || !isLoop(req.socket.remoteAddress)) return fail(res, 403, 'from this PC only');
          if (u.pathname === '/api/remote/newkey') { const w = newLink(); if (!w.ok) return send(res, 500, { error: w.error, key: w.key, params: w.params }); }
          else { if (typeof body.on !== 'boolean') return fail(res, 400, 'on: true or false'); await setRemote(body.on); }
          return send(res, 200, remoteInfo());
        }
        if (u.pathname === '/api/follow') {
          if (typeof body.screen !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(body.screen)) return fail(res, 400, 'screen: a page id');
          R.follow = { screen: body.screen }; if (R.on) live.send('follow', R.follow, m => m.remote);
          return send(res, 200, { ok: true });
        }
        if (u.pathname === '/api/spec') return send(res, 200, apiSpec(body, opt.tmpRoot));
        if (u.pathname === '/api/settings') {
          const r = SETTINGS.set(body.set);
          syncAdv(); mwOn();
          if (!r.ok) return send(res, r.status || 400, { error: r.error, key: r.key, params: r.params });
          return send(res, 200, { ok: true });
        }
        // the mod the page has picked: {dir} (absolute; '' = none) -> the watch follows it (modwatch.js), answers its status
        if (u.pathname === '/api/modwatch') {
          if (typeof body.dir !== 'string' || (body.dir && !path.isAbsolute(body.dir))) return fail(res, 400, 'dir: an absolute folder or empty');
          return send(res, 200, MW.set(body.dir));
        }
        if (u.pathname === '/api/run') {
          if (typeof body.cmd !== 'string' || !Object.prototype.hasOwnProperty.call(contract.COMMANDS, body.cmd)) return fail(res, 400, 'unknown cmd');
          const stream = u.searchParams.get('stream') !== '0';
          const events = []; let r;
          let endEv = null;
          const emit = e => { if (e.t === 'end') endEv = e; if (stream) { if (!res.headersSent) res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' }); res.write(JSON.stringify(e) + '\n'); } else events.push(e); };
          const RG = reqGame(u, body, req);
          // a check of the watched mod gets its current listing (check --listing; none = the check lists the mod, as before); prio 'low':
          // the Check page's re-check after a change runs below normal priority (its tools inherit it)
          const isChk = body.cmd === 'check' && body.input && typeof body.input.mod === 'string' && body.input.mod;
          const lf = isChk ? await MW.listingFile(path.resolve(opt.cwd || process.cwd(), body.input.mod), path.join(opt.tmpRoot || path.join(os.tmpdir(), 'arsenal-gui'), 'modwatch')) : null;
          try { outGuard(body.cmd, body.input, opt.cwd); r = run(body.cmd, body.input, { allowLaunch: state.allowLaunch, cwd: opt.cwd, gameKind: RG.kind, gameId: RG.id, timeoutSec: body.timeoutSec, listingFile: lf, lowPrio: body.prio === 'low', spawnHook: opt.spawnHook || (opt.demoXlate ? demoHook : undefined) }, emit); }
          catch (e) { modwatch.drop(lf); return fail(res, e instanceof contract.InputError ? 400 : e.status || 500, e.message); }
          r.done.then(() => modwatch.drop(lf));
          r.handle.gid = RG.id;   // game parity: the job list says which game a running job is for
          runs.set(r.handle.id, r.handle);
          const rj = jobs.add({ id: r.handle.id, kind: 'run', what: '', game: RG.id, canCancel: true, cancel: r.handle.cancel, cmd: r.handle.cmd || body.cmd, interactive: !!r.handle.interactive, startedMs: r.handle.started, keepMs: 0 });
          res.on('close', () => { if (!res.writableEnded) r.handle.cancel(); });
          await r.done; runs.delete(r.handle.id);
          if (body.cmd === 'check' && !r.handle.cancelled && !r.handle.timedOut) noteCheck(body.input, RG, endEv);
          rj.end(r.handle.cancelled ? 'cancelled' : r.handle.timedOut ? 'timeout' : endEv && endEv.code !== 0 ? 'failed' : 'done');
          if (R.on) live.send('follow', { screen: R.follow ? R.follow.screen : null, ev: 'run', cmd: body.cmd }, m => m.remote);   // a run ended: remote pages draw their screen again
          if (stream) return res.end();
          const st = events.find(e => e.t === 'start'), en = events.find(e => e.t === 'end');
          const lines = events.filter(e => e.t === 'out' || e.t === 'err').map(e => ({ s: e.t, line: e.line }));
          return send(res, 200, Object.assign({ id: st.id, cmd: body.cmd, argv: st.argv, lines,
            stdout: lines.filter(l => l.s === 'out').map(l => l.line).join('\n'), stderr: lines.filter(l => l.s === 'err').map(l => l.line).join('\n') }, en, { t: undefined }));
        }
      }
      return fail(res, 404, 'not found');
    } catch (e) { if (!res.headersSent) send(res, e.status || 500, { error: e.message, key: typeof e.key === 'string' ? e.key : undefined, params: e.key && e.params && typeof e.params === 'object' ? e.params : undefined }); else res.end(); }   // a route's translation key reaches the page (api: e.text)
  }
  return new Promise((resolve, reject) => {
    // a --dev child may start while the one before still lets go of the port: try again for a few seconds
    let tries = opt.token && opt.port ? 20 : 0;
    server.on('error', e => { if (e.code === 'EADDRINUSE' && tries-- > 0) setTimeout(() => server.listen(opt.port, '127.0.0.1'), 250); else reject(e); });
    server.listen(opt.port || 0, '127.0.0.1');
    server.once('listening', async () => {
      if (opt.remote) await setRemote(true);
      const port = server.address().port;
      // IDE: opt.portFile = where `ide send` (Notepad++ Run menu) finds this server. Only the command-line start passes it; tests do not.
      const dropPortFile = () => { if (!opt.portFile) return; try { if (JSON.parse(fs.readFileSync(opt.portFile, 'utf8')).pid === process.pid) fs.unlinkSync(opt.portFile); } catch (e) { /* gone or not ours */ } };
      let portTimer = null;
      if (opt.portFile) {
        const mine = JSON.stringify({ port, pid: process.pid, token: session.token });
        const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
        const writePortFile = () => { fs.mkdirSync(path.dirname(opt.portFile), { recursive: true }); fs.writeFileSync(opt.portFile, mine, { mode: 0o600 }); };
        // two GUIs share one file (the last one started wins); when that one exits and removes the file, a GUI still running takes it back
        const keepPortFile = () => { try { let o = null; try { o = JSON.parse(fs.readFileSync(opt.portFile, 'utf8')); } catch (e) { /* gone or half-written */ } if (!o || !alive(o.pid)) writePortFile(); } catch (e) { /* try again next tick */ } };
        try { writePortFile(); process.once('exit', dropPortFile); portTimer = setInterval(keepPortFile, 10000); portTimer.unref(); }
        catch (e) { /* the jump from Notepad++ is off for this run; the page still works */ }
      }
      resolve({
        server, port, url: `http://127.0.0.1:${port}/`, token: session.token, changed, edited, setRemote, remoteInfo, live,
        close: () => new Promise(r => { closed = true; if (portTimer) clearInterval(portTimer); dropPortFile(); if (watcher) watcher.close(); MW.close(); live.close(); jobs.cancelAll(); for (const c of [...kids]) killTree(c);
          for (const s of R.servers) { s.close(); if (s.closeAllConnections) s.closeAllConnections(); } R.servers = [];
          server.close(() => r()); if (server.closeAllConnections) server.closeAllConnections(); }),
      });
    });
  });
}

function openBrowser(url) {
  // lib/platform: cmd start on Windows, open on macOS, xdg-open elsewhere; a failure leaves the URL to the user (it is printed)
  try { require('../lib/platform').openUrl(url); } catch (e) { /* user opens the URL */ }
}

if (require.main === module) {
  const GUI_USAGE = 'usage: ARSENAL gui [--port N] [--allow-launch] [--open | --no-open] [--demo-xlate] [--dev] [--remote]   (ARSENAL.exe with no arguments = gui --open; ARSENAL.exe gui opens the browser too)\n'
    + '  --dev     restart on a code change, open pages reload by themselves   --remote  LAN Remote: another device on this network may view the page (key link: LAN Remote button at the top of the page)';
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--port') { o.port = Number(a[++i]); if (!(o.port >= 0 && o.port < 65536)) { console.error('gui: --port 0..65535'); process.exit(2); } }
    else if (a[i] === '--allow-launch') o.allowLaunch = true;
    else if (a[i] === '--dev') o.dev = true;
    else if (a[i] === '--remote') o.remote = true;
    else if (a[i] === '--open') o.open = true;
    else if (a[i] === '--no-open') o.open = false;
    else if (a[i] === '--demo-xlate') o.demoXlate = true;
    else if (a[i] === '--help' || a[i] === '-h') { console.log(GUI_USAGE); process.exit(0); }
    else { console.error(GUI_USAGE); process.exit(2); }
  }
  if (o.dev && !process.env.AS2GUI_CHILD) {
    // the --dev parent: keeps port, token and switches; the server itself runs in a child it restarts (live.js)
    if (SEA) { console.error('gui: --dev needs the source tree (node tools/gui/gui.js --dev)'); process.exit(2); }
    const args = a.filter((x, i) => !['--port', '--open', '--no-open', '--remote', '--allow-launch'].includes(x) && a[i - 1] !== '--port');
    liveLib.supervise({ script: __filename, args, port: o.port, state: { remote: !!o.remote, allowLaunch: !!o.allowLaunch }, watchDirs: [TOOLS],
      onUrl: url => { console.log('gui: ' + url + '   (--dev: restarts on code changes, pages reload)'); if (o.open) openBrowser(url); } })
      .catch(e => { console.error('gui: ' + e.message); process.exit(1); });
    return;
  }
  if (process.env.AS2GUI_CHILD) {
    // a --dev child: token and switches from the parent, file changes and stop by IPC
    o.token = process.env.AS2GUI_TOKEN; o.open = false;
    try { const st = JSON.parse(process.env.AS2GUI_STATE || '{}'); o.remote = !!st.remote; o.allowLaunch = !!st.allowLaunch; } catch (e) { /* defaults */ }
    if (process.send) { o.onState = s => process.send({ t: 'state', state: s }); o.onRestart = files => process.send({ t: 'restart', files }); }
  }
  o.portFile = path.join(process.env.ARSENAL_HOME && path.isAbsolute(process.env.ARSENAL_HOME) ? process.env.ARSENAL_HOME : require('../lib/platform').dataDir(), 'gui.json');   // env ARSENAL_HOME: settings and this file in that folder   // Windows %LOCALAPPDATA%\ARSENAL as before (same rule as ide/npp/cli.js); never a shared temp folder: the file holds this run's token
  o.settingsFile = settings.defaultFile();   // the window settings (settings.js); tests never pass this
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, () => process.exit(0));   // so the exit hook removes gui.json (SIGHUP = the console window was closed)
  start(o).then(s => {
    if (process.env.AS2GUI_CHILD && process.send) {
      process.on('message', m => { if (m && m.t === 'files' && Array.isArray(m.files)) s.changed(m.files.filter(s.edited)); else if (m && m.t === 'stop') s.close().then(() => process.exit(0)); });
      process.on('disconnect', () => s.close().then(() => process.exit(0)));   // the parent is gone: so is this server
      process.send({ t: 'up', url: s.url, files: Object.keys(require.cache).filter(f => lowp(f).startsWith(lowp(TOOLS))) });
      if (o.remote) console.log('gui: LAN Remote on (LAN Remote button at the top of the page: link and QR code)');
      return;
    }
    console.log('gui: ' + s.url); if (o.remote) console.log('gui: LAN Remote on (LAN Remote button at the top of the page: link and QR code)'); if (o.open) openBrowser(s.url);
  }, e => { console.error('gui: ' + e.message); process.exit(1); });
}
// every route of the server (core + ext): the remote test walks it (each one not on remote.ALLOW must answer 403 to a phone)
const CORE_ROUTES = ['GET /', 'GET /console', 'GET /api/jobs', 'GET /api/ls', 'GET /api/mods', 'GET /api/mod', 'GET /api/check/eta', 'GET /api/modwatch/status', 'GET /api/peek', 'GET /api/explain', 'GET /api/limit',
  'GET /api/text', 'GET /api/health', 'GET /api/installed', 'GET /api/settings', 'GET /api/commands', 'GET /api/game', 'GET /api/live', 'GET /api/remote',
  'POST /api/cancel', 'POST /api/answer', 'POST /api/launch', 'POST /api/remote', 'POST /api/remote/newkey', 'POST /api/follow', 'POST /api/follow/remote', 'POST /api/spec', 'POST /api/settings', 'POST /api/modwatch', 'POST /api/run'];
const routeTable = () => CORE_ROUTES.concat(Object.keys(EXT_ROUTES));
module.exports = { start, run, childCmd, demoHook, apiLimit, VERSION, routeTable, rebuildPage, SCREEN_IDS, rawHead, SANDBOX_CSP, worksOn, gohVersion, GAME_T };
module.exports._wire = { send, sendPage, wantGzip };   // tests (test/test-wire.js): the functions that write an answer
