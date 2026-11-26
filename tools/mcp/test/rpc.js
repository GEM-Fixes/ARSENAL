// mcp test helper, shared by every tools/mcp/test/*.test.js.
//   const { rpc, call, T, scratch } = require('./rpc');
//   await rpc(messages, env?) -> Map(id -> response): starts `node tools/mcp/server.js` with env added to a clean copy of the
//       process env (every ARSENAL_* variable removed first, so a test never inherits the person's write roots or launch switch),
//       writes the messages as lines, closes stdin, waits for the server to end. res.get('raw') = lines that were not JSON.
//   await call(name, args, env?) -> { text, isError, data, error } of one tools/call (error = the JSON-RPC error, if any)
//   T(name) -> { ok(cond, what), has(text, part, what), done() }: counts checks; done() prints "<name>: N passed[, M FAILED]" and
//       sets process.exitCode = 1 on a failure.
//   scratch(tag) -> a new empty folder under tmpBase(); rm(dir) removes it.
//   tmpBase() -> env ARSENAL_TMP when it is an absolute folder, else the system temp folder.
//   gameDirs() -> {AS2, GOH}: env ARSENAL_AS2_DIR / ARSENAL_GOH_DIR, else the Steam lookup of tools/lib/gamedir.js, else '' (cases skip).
// Author: Imperator_Aug (ARSENAL, ia-db919c90)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const W = require('../../lib/test/wait');
const SERVER = path.resolve(__dirname, '..', 'server.js'), ROOT = path.resolve(__dirname, '..', '..', '..');

function cleanEnv(extra) {
  const e = {};
  for (const k of Object.keys(process.env)) if (!/^ARSENAL_/i.test(k)) e[k] = process.env[k];
  return Object.assign(e, extra || {});
}
// Backup, never a hang: a server with no end after 5 min is killed (WAIT line) and run once more with 10 min, then it fails.
function rpc(messages, env, lim) {
  lim = lim || W.CHILD_MS;
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [SERVER], { cwd: ROOT, env: cleanEnv(env), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '', killed = false;
    c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8');
    c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { err += d; });
    c.on('error', reject);
    const timer = setTimeout(() => {
      killed = true; c.kill(); W.say('mcp rpc', 'server end', lim);
      if (lim < 2 * W.CHILD_MS) rpc(messages, env, 2 * lim).then(resolve, reject);
      else reject(new Error('server gave no end after ' + Math.round(lim / 60000) + ' min\n' + err));
    }, lim);
    c.on('close', () => {
      clearTimeout(timer);
      if (killed) return;
      const m = new Map(), raw = [];
      for (const l of out.split('\n')) { if (!l.trim()) continue; let j; try { j = JSON.parse(l); } catch (e) { raw.push(l); continue; } m.set(j.id, j); }
      m.set('raw', raw); m.set('stderr', err);
      resolve(m);
    });
    for (const x of messages) c.stdin.write((typeof x === 'string' ? x : JSON.stringify(x)) + '\n');
    c.stdin.end();
  });
}
const req = (id, method, params) => ({ jsonrpc: '2.0', id, method, params });
const callMsg = (id, name, args) => req(id, 'tools/call', { name, arguments: args || {} });
const flat = r => (!r ? { text: '', isError: true, error: { message: 'no answer' } } : r.error ? { text: '', isError: true, error: r.error }
  : { text: r.result.content.map(c => c.text).join('\n'), isError: !!r.result.isError, data: r.result.structuredContent });
async function call(name, args, env) { return flat((await rpc([callMsg(1, name, args)], env)).get(1)); }

function T(name) {
  let pass = 0, fail = 0;
  const ok = (cond, what) => { if (cond) pass++; else { fail++; console.log('FAIL ' + name + ': ' + what); } return !!cond; };
  return { ok, has: (text, part, what) => ok(typeof text === 'string' && text.includes(part), (what || 'has "' + part + '"') + (typeof text === 'string' && !text.includes(part) ? ' | got: ' + text.slice(0, 300).replace(/\n/g, ' / ') : '')),
    done() { console.log(name + ': ' + pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : '')); if (fail) process.exitCode = 1; return fail; } };
}
const TMP0 = process.env.ARSENAL_TMP;   // read once: some tests set ARSENAL_TMP for the server they start
function tmpBase() {
  const t = TMP0 && path.isAbsolute(TMP0) ? TMP0 : os.tmpdir();
  fs.mkdirSync(t, { recursive: true });
  return t;
}
function scratch(tag) { return fs.mkdtempSync(path.join(tmpBase(), 'mcp-' + tag + '-')); }
function gameDirs() {
  let gd = null; try { gd = require(path.join(ROOT, 'tools', 'lib', 'gamedir.js')); } catch (e) { /* no lookup */ }
  let as2 = process.env.ARSENAL_AS2_DIR || '', goh = process.env.ARSENAL_GOH_DIR || '';
  if (!as2 && gd) { try { as2 = gd.resolve({}).dir || ''; } catch (e) { as2 = ''; } }
  if (!goh && gd) { try { goh = gd.goh({}) || ''; } catch (e) { goh = ''; } }
  return { AS2: as2, GOH: goh };
}
const rm = d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* left behind */ } };

const NOTES = fs.existsSync(path.join(ROOT, 'limits', 'INDEX.md'));   // NOTES false: a copy without the note folders
module.exports = { NOTES, rpc, req, callMsg, flat, call, T, scratch, tmpBase, gameDirs, rm, cleanEnv, SERVER, ROOT, FIXTURES: path.join(__dirname, 'fixtures', 'tools') };
