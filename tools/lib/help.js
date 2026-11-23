// help: `require('../lib/help')(__filename)` as a tool's first statement. --help or -h anywhere in argv prints the
// tool's usage and exits 0 before the tool parses args, reads a game or writes anything (HELPFIX2).
// fires only when the file is the started script (process.argv[1]), never when another tool requires it as a module.
// usage text = the second argument when given, else the file's header comment (the // lines above the first code line).
// the usage ends with one credit footer line (lib/credit: version, author, build tag). --version prints that line alone.
// header(file) -> that comment text, '' when the file has none; the Author stamp line is left out. Works in the SEA exe.
// Author: Imperator_Aug (ARSENAL, ia-60cc5a4a)
const fs = require('fs'), path = require('path');
const credit = require('./credit');

function header(file) {
  let src = '';
  try { src = fs.readFileSync(file, 'latin1'); } catch (e) { return ''; }
  const out = [];
  for (const l of src.split(/\r?\n/)) {
    if (/^#!/.test(l) || /^\s*$/.test(l) || /^\s*['"]use strict['"];?\s*$/.test(l)) { if (out.length && /^\s*$/.test(l)) break; continue; }
    if (!/^\s*\/\//.test(l)) break;
    if (credit.STAMP_RE.test(l)) continue;
    out.push(l.replace(/^\s*\/\/ ?/, ''));
  }
  return out.join('\n');
}

function help(file, usage) {
  const a = process.argv.slice(2);
  const ver = a.includes('--version');
  if (!ver && !a.includes('--help') && !a.includes('-h')) return;
  // only the tool that was started: a tool required as a module by another tool must not answer for it
  const norm = p => path.resolve(String(p || '')).replace(/\.js$/i, '').toLowerCase();
  if (norm(process.argv[1]) !== norm(file)) return;
  const foot = credit.line(credit.relOf(file));
  if (ver) { fs.writeSync(1, foot + '\n'); process.exit(0); }
  const t = usage || header(file) || 'no usage text in ' + file;
  fs.writeSync(1, t.replace(/\s+$/, '') + '\n' + foot + '\n');
  process.exit(0);
}

module.exports = help;
module.exports.header = header;
