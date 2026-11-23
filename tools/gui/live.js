// live: gui.js --dev. Every open page holds one event stream (GET /api/live, server sent events) and reloads when the code changes.
//   createLive(boot) -> {open(req, res, meta), send(event, data, filter?), drop(filter?), close(), size}
//        events: hello {boot} on connect (a page that sees a new boot reloads: the server was restarted), reload {files},
//        follow {screen, ev?} (phone pages follow the PC page: remote.js); ": ping" every 25 s keeps proxies and phones awake
//   watch(dirs, onFiles, ms) -> {close()}   fs.watch recursive, one callback per burst (debounced, default 300 ms), no polling
//   supervise(opt)   the --dev parent: holds the port, the session token and the switches (remote, launch) and respawns the server child
//        on a server code change; a child that dies on its own (a half-written file) is started again on the next change, never in a loop
// Author: Imperator_Aug (ARSENAL, ia-eb077ad1)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), net = require('net'), crypto = require('crypto');

function createLive(boot) {
  const clients = new Set();
  const write = (c, ev, data) => { try { c.res.write('event: ' + ev + '\ndata: ' + JSON.stringify(data == null ? {} : data) + '\n\n'); } catch (e) { /* gone */ } };
  const ping = setInterval(() => { for (const c of clients) try { c.res.write(': ping\n\n'); } catch (e) { /* gone */ } }, 25000);
  if (ping.unref) ping.unref();
  return {
    open(req, res, meta, first) {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      const c = { res, meta: meta || {} }; clients.add(c);
      write(c, 'hello', { boot });
      if (first) for (const [ev, data] of first) write(c, ev, data);
      const bye = () => clients.delete(c); req.on('close', bye); res.on('close', bye);
      return c;
    },
    send(ev, data, filter) { for (const c of clients) if (!filter || filter(c.meta)) write(c, ev, data); },
    drop(filter) { for (const c of [...clients]) if (!filter || filter(c.meta)) { clients.delete(c); try { c.res.end(); } catch (e) { /* gone */ } } },
    close() { clearInterval(ping); this.drop(); },
    get size() { return clients.size; },
  };
}

const SKIP = /([\\/])(\.git|node_modules)([\\/]|$)|~$|\.(tmp|swp)$|\.tmp-\d+$/i;
function watch(dirs, onFiles, ms = 300) {
  const pend = new Set(), ws = []; let t = null;
  for (const d of dirs) {
    try {
      const w = fs.watch(d, { recursive: true }, (ev, name) => {
        if (!name) return; const f = path.join(d, String(name)); if (SKIP.test(f)) return;
        pend.add(f); clearTimeout(t); t = setTimeout(() => { const files = [...pend]; pend.clear(); try { onFiles(files); } catch (e) { /* the next burst tries again */ } }, ms);
      });
      w.on('error', () => { /* folder gone: nothing more from it */ }); ws.push(w);
    } catch (e) { /* no such folder or no recursive watch here */ }
  }
  return { close() { clearTimeout(t); for (const w of ws) try { w.close(); } catch (e) { /* closed */ } } };
}

// ---- supervisor (parent of the --dev server)
function freePort() {
  return new Promise((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}
// opt: {script, args (child arguments without --port), port, state: {remote, allowLaunch}, watchDirs, onUrl(url) once}
async function supervise(opt) {
  const port = opt.port || await freePort(), token = crypto.randomBytes(16).toString('hex'), state = Object.assign({}, opt.state);
  let child = null, up = false, restarting = false, stopping = false, known = new Set(), told = false;
  const low = f => (process.platform === 'win32' ? f.toLowerCase() : f);
  const say = m => console.log('gui --dev: ' + m);
  function spawn() {
    restarting = false; up = false;
    child = cp.fork(opt.script, [...opt.args, '--port', String(port)], {
      stdio: 'inherit', env: Object.assign({}, process.env, { AS2GUI_CHILD: '1', AS2GUI_TOKEN: token, AS2GUI_STATE: JSON.stringify(state) }),
    });
    const me = child;
    me.on('message', m => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'up') { up = true; if (Array.isArray(m.files)) known = new Set(m.files.map(low)); if (!told) { told = true; if (opt.onUrl) opt.onUrl(m.url); } }
      else if (m.t === 'state' && m.state && typeof m.state === 'object') { for (const k of ['remote', 'allowLaunch']) if (typeof m.state[k] === 'boolean') state[k] = m.state[k]; }
      else if (m.t === 'restart') restart('server code changed: ' + (m.files || []).map(f => path.basename(f)).join(', '));
    });
    me.on('exit', code => {
      if (me !== child) return;
      child = null; up = false;
      if (stopping) return process.exit(0);
      if (restarting) return spawn();
      say('the server stopped (exit ' + code + '); it starts again on the next file change');
    });
  }
  function restart(why) {
    if (!child) return spawn();
    if (restarting) return; restarting = true; say('restart: ' + why);
    const c = child; try { c.send({ t: 'stop' }); } catch (e) { /* no channel */ }
    setTimeout(() => { if (child === c) try { c.kill(); } catch (e) { /* gone */ } }, 3000).unref();
  }
  const GUI = low(path.dirname(opt.script) + path.sep);
  const w = watch(opt.watchDirs, files => {
    const rel = files.filter(f => /\.(js|json)$/i.test(f));
    if (!rel.length) return;
    if (child && up && !restarting) { try { child.send({ t: 'files', files: rel }); } catch (e) { /* restarting */ } return; }
    // no child (it died): start again when a file of the server or the page changed
    if (!child && rel.some(f => known.has(low(f)) || low(f).startsWith(GUI))) { say('file change: starting the server again'); spawn(); }
  });
  const stop = () => { stopping = true; if (child) { try { child.send({ t: 'stop' }); } catch (e) { /* none */ } setTimeout(() => process.exit(0), 3000).unref(); } else process.exit(0); };
  if (!opt.noSignals) for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, stop);
  spawn();
  // close(): tests only (the CLI parent ends by a signal): no watcher, no child, no exit of this process
  return { port, token, pid: () => (child ? child.pid : null), close() { w.close(); const c = child; child = null; if (c) try { c.kill(); } catch (e) { /* gone */ } } };
}

module.exports = { createLive, watch, supervise, freePort };
