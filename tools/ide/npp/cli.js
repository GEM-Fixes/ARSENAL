// npp/cli: `ide npp status|plan|install|uninstall [--theme f] [--settings d] [--exe f] [--json]`,
// `ide send <file> [line] [col]`, `ide vanilla <file>` (Notepad++ Run menu -> the running ARSENAL GUI).
// Exit: 0 ok, 1 refused, 2 usage, 3 no GUI answers.
// Author: Imperator_Aug (ARSENAL, ia-fbb2d8cf)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const npp = require('./index');

const USAGE = 'usage: ide npp status|plan|install|uninstall [--theme GEM2.xml] [--settings DIR] [--exe notepad++.exe] [--function-list] [--ext-skip a,b] [--json]\n' +
  '       ide send <file> [line] [col] | ide vanilla <file>';

function opts(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--function-list') o.functionList = true;
    else if (a === '--theme' || a === '--settings' || a === '--exe' || a === '--port-file' || a === '--ext-skip') o[a.slice(2)] = argv[++i];
    else o._.push(a);
  }
  return o;
}

function guiFile() { return path.join(require('../../lib/platform').dataDir(), 'gui.json'); }   // same rule as tools/gui/gui.js (never a shared temp folder): lib/platform dataDir, Windows %LOCALAPPDATA%\ARSENAL as before
const NO_GUI = 'No ARSENAL GUI is answering. Start it (ARSENAL.exe gui, or node tools/gui/gui.js), then run this again.';
const ODD = 'The GUI did not answer as expected';

// a pid is required: without one we cannot tell the GUI from whatever else listens on that port now
function alive(pid) { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

function request(port, method, p, body, timeout) {
  return new Promise(resolve => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const headers = { host: '127.0.0.1:' + port };
    if (data) { headers['content-type'] = 'application/json'; headers['content-length'] = data.length; }
    const req = http.request({ host: '127.0.0.1', port, method, path: p, timeout: timeout || 5000, headers }, res => {
      const ch = []; res.on('data', c => ch.push(c));
      res.on('end', () => { let j; try { j = JSON.parse(Buffer.concat(ch).toString('utf8')); } catch (e) { j = undefined; } resolve({ status: res.statusCode, body: j }); });
    });
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.on('error', e => resolve({ error: e.code || e.message }));
    req.end(data || undefined);
  });
}

async function send(file, line, col, extra, o) {
  if (!file) { console.error(USAGE); return 2; }
  const gf = (o && o['port-file']) || guiFile();
  let g = null; try { g = JSON.parse(fs.readFileSync(gf, 'utf8')); } catch (e) { g = null; }
  if (!g || !g.port || !g.token) { console.error(NO_GUI + '\n(' + gf + ' is missing.)'); return 3; }
  if (!g.pid) { console.error(NO_GUI + '\n(' + gf + ' has no pid, so the GUI cannot be checked.)'); return 3; }
  if (!alive(Number(g.pid))) { console.error(NO_GUI + '\n(the GUI that wrote ' + gf + ' has stopped.)'); return 3; }
  // the token only goes to a process that answers like the ARSENAL GUI
  const h = await request(g.port, 'GET', '/api/health');
  if (h.error) { console.error(NO_GUI + '\n(' + h.error + ' on 127.0.0.1:' + g.port + ')'); return 3; }
  if (h.status !== 200 || !h.body || typeof h.body !== 'object' || h.body.ok !== true) { console.error(ODD + ' on 127.0.0.1:' + g.port + ' (health check). Nothing was sent. Restart the GUI.'); return 3; }
  const body = Object.assign({ token: g.token, file: path.resolve(file), line: Math.max(1, parseInt(line, 10) || 1), col: Math.max(1, parseInt(col, 10) || 1) }, extra || {});
  const r = await request(g.port, 'POST', '/api/x/ide/inbox', body);
  if (r.error) { console.error(NO_GUI + '\n(' + r.error + ' on 127.0.0.1:' + g.port + ')'); return 3; }
  if (r.body === undefined || r.body === null || typeof r.body !== 'object') { console.error(ODD + ' (HTTP ' + r.status + ', not JSON).'); return 3; }
  if (r.status !== 200 || r.body.ok === false) { console.error('The GUI did not take the file: HTTP ' + r.status + (r.body.error ? ' ' + r.body.error : '')); return 1; }
  console.log('sent to the GUI: ' + body.file + ':' + body.line + ':' + body.col);
  return 0;
}

// one more sentence under a refusal: what the user does next
const HINT = {
  RUN_UNKNOWN: 'Windows did not give a usable process list (tasklist failed, timed out or printed nothing we could read). Close every Notepad++ window, then run this again.',
  BAD_MANIFEST: 'ARSENAL will not guess which files are its own. Look at arsenal\\manifest.json in the Notepad++ settings folder; if you do not need it, move it away and delete the GEM2-AS2 files by hand.',
  RUNNING: 'Close Notepad++ (all windows, also the tray icon), then run this again.',
};

function human(cmd, r) {
  const L = [];
  if (cmd === 'status') {
    L.push('Notepad++: ' + (r.exe || 'not found') + (r.version ? ' (v' + r.version + ')' : ''));
    L.push('settings:  ' + (r.settingsDir || '?') + (r.portable ? ' (portable)' : '') + (r.cloud ? ' (cloud)' : ''));
    L.push('running:   ' + (r.running === 'unknown' ? 'cannot tell' : r.running ? 'yes' : 'no'));
    const m = r.installed && r.installed.manifest;
    L.push('ARSENAL pack: ' + (m ? 'installed ' + m.time + ', ' + m.files.length + ' files' + (m.partial ? ' (partial: the install stopped half way; run uninstall)' : '') : 'not installed'));
    if (r.problems.length) L.push('problems: ' + r.problems.join(', '));
    for (const c of r.problems) if (HINT[c]) L.push('  ' + c + ': ' + HINT[c]);
    return L.join('\n');
  }
  if (cmd === 'uninstall') {
    for (const x of r.refuse || []) { L.push('REFUSED ' + x.code + ': ' + x.msg); if (HINT[x.code]) L.push('        ' + HINT[x.code]); }
    if (r.note) L.push(r.note);
    for (const p of r.removed) L.push('removed ' + p);
    for (const k of r.kept) L.push('kept    ' + k.path + ': ' + k.why);
    if (r.elevated && r.elevated.length) { L.push('The auto-completion file in the install folder needs an elevated prompt to remove:'); for (const e of r.elevated) L.push('  ' + e.cmd); }
    return L.join('\n');
  }
  for (const x of r.refuse) { L.push((x.code === 'THEME_DIFFERENT' ? 'note    ' : 'REFUSED ') + x.code + ': ' + x.msg); if (HINT[x.code]) L.push('        ' + HINT[x.code]); }
  const by = {};
  for (const t of r.targets) (by[t.action] = by[t.action] || []).push(t);
  const stock = (by.new || []).filter(t => /stock function list/.test(t.why));
  for (const a of ['new', 'merge', 'stage', 'skip']) for (const t of by[a] || []) {
    if (stock.includes(t)) continue;
    L.push((t.replace ? 'replace' : a).padEnd(7) + ' ' + t.path + '  ' + t.why);
    if (t.diff && cmd === 'plan') L.push(t.diff.split('\n').map(s => '         ' + s).join('\n'));
  }
  if (stock.length) L.push('new    ' + stock.length + ' stock function list files into ' + path.dirname(stock[0].path));
  for (const n of r.notes || []) L.push('note    ' + n);
  if (r.elevated && r.elevated.length) {
    L.push('Auto-completion lives in the Notepad++ install folder. Run this once in a command prompt opened "as administrator":');
    for (const e of r.elevated) L.push('  ' + e.cmd + (e.overwrites ? '   (replaces a different file that is already there)' : ''));
  }
  if (cmd === 'install') {
    if (r.partial) {
      L.push('The install stopped half way: ' + r.error);
      L.push('wrote ' + r.written.length + ' files:'); for (const w of r.written) L.push('  ' + w);
      if (r.backup) L.push('backup: ' + r.backup);
      L.push(r.manifest ? 'manifest (partial): ' + r.manifest + '. Run "ide npp uninstall" to undo what was written.' : 'The manifest could not be written; restore the files above from the backup by hand.');
    } else if (!r.ok) L.push('Nothing was written.');
    else { L.push((r.written.length ? 'wrote ' + r.written.length + ' files' : 'nothing to change') + (r.backup ? '; backup: ' + r.backup : '')); if (r.manifest) L.push('manifest: ' + r.manifest); L.push('Then in Notepad++: Settings > Style Configurator > GEM2.'); }
  }
  return L.join('\n');
}

async function run(argv) {
  argv = argv || [];
  const cmd = argv[0];
  if (cmd === 'send' || cmd === 'vanilla') {
    const o = opts(argv.slice(1));
    return cmd === 'send' ? send(o._[0], o._[1], o._[2], null, o) : send(o._[0], 1, 1, { vanilla: true }, o);
  }
  if (cmd !== 'npp') { console.error(USAGE); return 2; }
  const o = opts(argv.slice(1)), sub = o._[0];
  const no = { settingsDir: o.settings, theme: o.theme };
  if (o.exe) no.exe = o.exe;
  if (o.functionList) no.functionList = true;
  if (o['ext-skip']) no.extSkip = o['ext-skip'];
  // Notepad++ is a Windows program: elsewhere only an explicit --settings/--exe (tests, a copy by hand) has anything to act on
  const P = require('../../lib/platform');
  if (['plan', 'install', 'uninstall'].includes(sub) && !P.isWin() && !o.settings && !o.exe) { console.error(P.unsupported('setting up Notepad++ (ide npp ' + sub + ')').message); return 2; }
  let r;
  if (sub === 'status') r = npp.status(no);
  else if (sub === 'plan') r = npp.plan(no);
  else if (sub === 'install') r = npp.install(no);
  else if (sub === 'uninstall') r = npp.uninstall(no);
  else { console.error(USAGE); return 2; }
  console.log(o.json ? JSON.stringify(r, null, 2) : human(sub, r));
  if (sub === 'status') return 0;
  if (sub === 'uninstall') return r.refuse && r.refuse.length ? 1 : 0;
  return r.ok ? 0 : 1;
}

module.exports = { run, send, guiFile };
