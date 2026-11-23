#!/usr/bin/env node
// vendor/cm5/pack: one-time packer for the Editor's text engine (CodeMirror 5, MIT, https://codemirror.net/5/).
//   node tools/gui/vendor/cm5/pack.js <unpacked npm package dir> [--integrity sha512-...]
// Reads the listed files from the unpacked `codemirror` npm package and writes cm5.bundle.json next to this script:
//   { name, version, licence, integrity, files:[...], js, css }
// JSON because the single exe embeds only js/json assets (tools/dist/sea.js). Nothing here runs at GUI start; the
// bundle is plain text served by GET /api/x/ide/asset. To update: npm pack codemirror@5.x, unpack, run this again.
// Author: Imperator_Aug (ARSENAL, ia-42f8ea09)
const fs = require('fs'), path = require('path');
const JS = [
  'lib/codemirror.js',
  'addon/mode/simple.js',
  'addon/dialog/dialog.js',
  'addon/search/searchcursor.js',
  'addon/search/search.js',
  'addon/search/jump-to-line.js',
  'addon/search/match-highlighter.js',
  'addon/edit/matchbrackets.js',
  'addon/selection/active-line.js',
  'addon/comment/comment.js',
  'addon/fold/foldcode.js',
  'addon/fold/foldgutter.js',
  'addon/fold/brace-fold.js',
  'addon/hint/show-hint.js',
  'addon/lint/lint.js',
  'mode/lua/lua.js',
];
const CSS = ['lib/codemirror.css', 'addon/dialog/dialog.css', 'addon/fold/foldgutter.css', 'addon/hint/show-hint.css', 'addon/lint/lint.css'];

const a = process.argv.slice(2);
const dir = a[0] && !a[0].startsWith('--') ? path.resolve(a[0]) : null;
const ii = a.indexOf('--integrity'), integrity = ii >= 0 ? a[ii + 1] : null;
if (!dir || !fs.existsSync(path.join(dir, 'package.json'))) { console.error('usage: pack.js <unpacked codemirror package dir> [--integrity sha512-...]'); process.exit(2); }
const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
if (pkg.name !== 'codemirror' || !/^5\./.test(pkg.version)) { console.error('pack: need the codemirror 5.x package, got ' + pkg.name + ' ' + pkg.version); process.exit(2); }
const read = f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
const js = JS.map(f => '// ---- ' + f + '\n' + read(f)).join('\n;\n');
const css = CSS.map(f => '/* ---- ' + f + ' */\n' + read(f)).join('\n');
const out = { name: 'codemirror', version: pkg.version, licence: read('LICENSE'), integrity: integrity || null, files: JS.concat(CSS), js, css };
const to = path.join(__dirname, 'cm5.bundle.json');
fs.writeFileSync(to, JSON.stringify(out));
console.log('packed codemirror ' + pkg.version + ': ' + JS.length + ' js + ' + CSS.length + ' css, ' + Math.round(fs.statSync(to).size / 1024) + ' KB -> ' + to);
