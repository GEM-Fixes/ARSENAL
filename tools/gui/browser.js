// browser: find a Chromium-type browser (Edge, Chrome, Chromium) for headless checks and PDF printing.
//   find({want, env, platform, exists}) -> full path | null
//   order: env ARSENAL_BROWSER (a file) > known install folders (from env ProgramFiles, ProgramFiles(x86), LOCALAPPDATA on Windows;
//   /Applications on macOS; /usr/bin, /snap/bin on Linux) > the names on PATH. want: 'edge' | 'chrome' | 'any' (default 'any').
// Author: Imperator_Aug (ARSENAL, ia-7106be8f)
'use strict';
const fs = require('fs'), path = require('path');

function find(opt = {}) {
  const env = opt.env || process.env, platform = opt.platform || process.platform, want = opt.want || 'any';
  const exists = opt.exists || (p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
  if (env.ARSENAL_BROWSER && exists(env.ARSENAL_BROWSER)) return env.ARSENAL_BROWSER;
  const edge = [], chrome = [], names = [];
  if (platform === 'win32') {
    const bases = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean);
    for (const b of bases) { edge.push(path.join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe')); chrome.push(path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe')); }
    names.push(...(want === 'chrome' ? [] : ['msedge.exe']), ...(want === 'edge' ? [] : ['chrome.exe']));
  } else if (platform === 'darwin') {
    edge.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
    chrome.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    for (const b of ['/usr/bin', '/snap/bin']) { edge.push(path.join(b, 'microsoft-edge')); chrome.push(path.join(b, 'chromium'), path.join(b, 'chromium-browser'), path.join(b, 'google-chrome')); }
    names.push(...(want === 'chrome' ? [] : ['microsoft-edge']), ...(want === 'edge' ? [] : ['chromium', 'chromium-browser', 'google-chrome']));
  }
  const list = want === 'edge' ? edge : want === 'chrome' ? chrome : edge.concat(chrome);
  for (const p of list) if (exists(p)) return p;
  const dirs = String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  for (const n of names) for (const d of dirs) { const p = path.join(d, n); if (exists(p)) return p; }
  return null;
}

module.exports = { find };
