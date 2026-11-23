// gui settings: the window's own settings (game folder per game, current mod, mod folders, last tab, theme, Advanced, page choices)
// kept by the server in one JSON file, so they survive a restart on a new random port (localStorage is per origin, and the port is
// part of the origin). Only the command-line start passes the real file; tests pass a scratch file or nothing (memory only).
//   file: env ARSENAL_SETTINGS (a file) or ARSENAL_HOME (a folder: <it>\settings.json) when set; else Windows %LOCALAPPDATA%\ARSENAL\settings.json; macOS ~/Library/Application Support/ARSENAL/settings.json;
//         elsewhere $XDG_CONFIG_HOME/arsenal/settings.json or ~/.config/arsenal/settings.json
//   keys: the page's localStorage names (as2gui.<name>), only the names the page uses (KEY), never a token, key or password (DENY)
//   values: any JSON; one value up to 256 KB, the whole file up to 2 MB
//   __priv: server-only values (the phone link key, remote.js): never sent to a page (get() leaves them out), never set by a page (KEY)
// Author: Imperator_Aug (ARSENAL, ia-9ab38930)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');

// the page's names: core (lang, theme, adv, hdlock = the header lock, games, gameId, mod, game, roots, screen, health, modByPage[.game], sub.<tab> and sub.<tab>-<sub>, layout = the Arrange
// profiles, and ext pages (<ext>.<anything>; task = the Quick Guided Task row: task.verb, task.min folded)
const KEY = /^as2gui\.(lang|theme|adv|hdlock|games|gameId|mod|game|roots|screen|health|layout|modByPage(\.[a-z0-9]{1,20})?|sub\.[A-Za-z0-9_-]{1,40}|(share|pro|models|ide|files|docs|doctrine|guides|bal|balance|art|logs|units|maps|bots|goh|help|xlate|test|missions|modes|task|sk|pk|mv|mapviz|prep).[^\u0000-\u001f]{1,300})$/;
const DENY = /token|secret|passw|api[_.-]?key|credential|cookie/i;
const MAX_VALUE = 256 << 10, MAX_FILE = 2 << 20;

function okKey(k) { return typeof k === 'string' && KEY.test(k) && !DENY.test(k); }

function defaultFile(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.ARSENAL_SETTINGS && path.isAbsolute(env.ARSENAL_SETTINGS)) return env.ARSENAL_SETTINGS;   // one file (the MCP servers read the same env)
  if (env.ARSENAL_HOME && path.isAbsolute(env.ARSENAL_HOME)) return path.join(env.ARSENAL_HOME, 'settings.json');   // a whole settings folder (first-run checks, portable use)
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'ARSENAL', 'settings.json');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'ARSENAL', 'settings.json');
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'arsenal', 'settings.json');
}

// store(file|null) -> {get(), set(obj) -> {ok, error?, key?, params?}, file, problem}
// a file that is not JSON (or not an object) is renamed aside to <file>.bad-<time> and the settings start empty (problem says so once)
function store(file) {
  let data = {}, priv = {}, problem = null;
  if (file) {
    let text = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') problem = { key: 'set.cantRead', params: { file, m: e.code || e.message } }; }
    if (text != null) {
      let v; try { v = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { v = undefined; }
      if (v && typeof v === 'object' && !Array.isArray(v)) { for (const k of Object.keys(v)) if (okKey(k)) data[k] = v[k]; if (v.__priv && typeof v.__priv === 'object' && !Array.isArray(v.__priv)) priv = Object.assign({}, v.__priv); }
      else {
        const aside = file + '.bad-' + Date.now();
        try { fs.renameSync(file, aside); problem = { key: 'set.corrupt', params: { file, aside } }; }
        catch (e) { problem = { key: 'set.corrupt', params: { file, aside: '' } }; }
      }
    }
  }
  function write() {
    if (!file) return { ok: true };
    const tmp = file + '.tmp-' + process.pid;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(Object.keys(priv).length ? Object.assign({}, data, { __priv: priv }) : data, null, 1), { mode: 0o600 });
      fs.renameSync(tmp, file);   // atomic on the same volume: a reader sees the old file or the new one, never half of one
      return { ok: true };
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch (x) { /* never made */ }
      return { ok: false, error: 'cannot write the settings file ' + file + ': ' + (e.code || e.message), key: 'set.cantWrite', params: { file, m: e.code || e.message } };
    }
  }
  return {
    file: file || null,
    get problem() { return problem; },
    takeProblem() { const p = problem; problem = null; return p; },
    get() { return Object.assign({}, data); },
    // server-only values (never in get(), never from a page): getPriv(name), setPriv(name, value) -> {ok, error?}
    getPriv(k) { return Object.prototype.hasOwnProperty.call(priv, k) ? priv[k] : undefined; },
    setPriv(k, v) { priv = Object.assign({}, priv, { [k]: v }); return write(); },
    // body {set: {key: value}}: every key must be allowed, else nothing is kept (400)
    set(obj) {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, status: 400, error: 'set: an object of settings', key: 'set.bad' };
      const ks = Object.keys(obj), bad = ks.filter(k => !okKey(k));
      if (bad.length) return { ok: false, status: 400, error: 'not a window setting: ' + bad.slice(0, 5).join(', '), key: 'set.badKey', params: { k: bad.slice(0, 5).join(', ') } };
      for (const k of ks) { let s; try { s = JSON.stringify(obj[k]); } catch (e) { s = undefined; } if (s === undefined || s.length > MAX_VALUE) return { ok: false, status: 400, error: 'value too large or not JSON: ' + k, key: 'set.bad' }; }
      const next = Object.assign({}, data, obj);
      if (JSON.stringify(next).length > MAX_FILE) return { ok: false, status: 413, error: 'settings over 2 MB', key: 'set.bad' };
      data = next;
      const w = write();
      return w.ok ? { ok: true } : Object.assign({ status: 500 }, w);
    },
  };
}

module.exports = { store, defaultFile, okKey, KEY, DENY };
