// replay the recorded live trace (live-trace.jsonl, 2026-11-03, build 3.301.1x64) into the pipe Client:
// the stage "starting" event + ok reply must NOT satisfy waitStage; only the later state "active" event does.
// Author: Imperator_Aug (ARSENAL, ia-f9cc1ca7)
const fs = require('fs'), path = require('path'), net = require('net');
const { Client, pipePath } = require('../testrun.js');
const rows = fs.readFileSync(path.join(__dirname, 'live-trace.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const ins = rows.filter(r => r.dir === 'in');
// the recorded starting->active gap is 28 ms; a busy machine can miss it, so the rows after the starting event come GAP ms later (order kept)
const name = pipePath(4799), SCALE = 0.1, GAP = 600;
const startAt = (ins.find(r => /"state":"starting"/.test(r.raw)) || { t: Infinity }).t;
if (process.platform !== 'win32') { try { fs.unlinkSync(name); } catch (e) { /* none */ } }
const srv = net.createServer(sock => {
  sock.on('error', () => {});
  const t0 = Date.now();
  // the mp_lan..active window: send everything up to the mp_lan reply, then the rest on the recorded clock
  for (const r of ins) setTimeout(() => { try { sock.write(r.raw + '\n'); } catch (e) { /* closed */ } }, r.t * SCALE + (r.t > startAt ? GAP : 0));
  setTimeout(() => sock.end(), 1500 + GAP);
});
srv.listen(name, async () => {
  const s = net.connect(name);
  await new Promise(r => s.once('connect', r));
  const c = new Client(s);
  const fail = m => { console.log('FAIL: ' + m); process.exit(1); };
  const hello = await c.waitEvent('hello', 3000);
  if (!hello || hello.version !== '3.301.1x64' || hello.protocol !== 2) fail('hello');
  const mark = c.events.length;
  // wait for the starting event itself (not a set time), then the same-tick replies: before active (GAP ms away)
  const starting = await c.waitEvent('stage', 5000);
  if (!starting || starting.state !== 'starting') fail('starting stage event not seen first');
  await new Promise(r => setTimeout(r, 50));
  const early = await c.waitStage(mark, null, 1);
  const startedAt = Date.now();
  const st = await c.waitStage(mark, 'mp_lobbylan', 3000);
  if (!st || st.state !== 'active') fail('active stage not seen');
  console.log('replay ok: starting seen=' + c.events.some(e => e.state === 'starting') + ' early=' + (early ? early.state : 'none') + ' waited ' + (Date.now() - startedAt) + ' ms');
  if (early) fail('waitStage resolved before active');
  c.close(); srv.close(); process.exit(0);
});
