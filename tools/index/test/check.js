// Author: Imperator_Aug (ARSENAL, ia-05d58ce5)
'use strict';
// tools/index/test/check.js: checks the tool router lines (tools/index/*.md and the group table of tools/INDEX.md).
// usage: node tools/index/test/check.js [root] [-q]     root = folder holding tools/ (default: the src folder of this file)
// checks, one line each, exit 1 on any:
//   IDX_CRLF       an index file has a line that does not end in CRLF
//   IDX_DUP        two lines file under the same tool name (first word before ' | '), across all group files
//   IDX_FIELDS     a line splits (on unescaped |) into fewer than 4 fields: name | run line | rows | what
//   IDX_PATH       a drive path (X:/ or X:\) or a home path (/Users/, /home/) in an index line
//   IDX_EXE_SRC    the run field names `--exe` for a `node tools/<x>.js` file whose source (or a file it requires from its
//                  own folder) has no `--exe` text: the line promises an option the tool does not take
//   IDX_GROUP      a group row of tools/INDEX.md names a tool with no line (info only, printed with -q off, not counted)
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), quiet = args.includes('-q');
const root = path.resolve(args.find(a => a !== '-q') || path.join(__dirname, '..', '..', '..'));
const T = p => path.join(root, 'tools', p);
const bad = [], info = [];
const add = (code, where, msg) => bad.push(code + ' ' + where + ': ' + msg);

const files = fs.readdirSync(T('index')).filter(f => /\.md$/.test(f)).sort();
const seen = new Map();
for (const f of files) {
  const raw = fs.readFileSync(T('index/' + f), 'utf8');
  const ls = raw.split('\n');
  ls.forEach((l, i) => {
    const at = 'index/' + f + ':' + (i + 1);
    if (i < ls.length - 1 && !l.endsWith('\r')) add('IDX_CRLF', at, 'line ends in LF only');
    l = l.replace(/\r$/, '');
    const k = l.indexOf(' | '); if (k < 1 || l.startsWith('line form')) return;
    const name = l.slice(0, k).trim().split(/\s+/)[0];
    // a sub-entry ('goh2as2 --deps scenery', 'sessions wave') files under its first word too and is allowed after the main line
    const sub = /\S\s+\S/.test(l.slice(0, k).trim());
    if (seen.has(name)) { if (!sub) add('IDX_DUP', at, name + ' also at ' + seen.get(name)); } else seen.set(name, at);
    const fld = l.split(/(?<!\\)\|/);
    if (fld.length < 4) add('IDX_FIELDS', at, name + ': ' + fld.length + ' fields');
    if (/(?:^|[\s(`'"=])[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(l)) add('IDX_PATH', at, name + ': drive or home path');
    const run = fld[1] || '';
    // each --exe belongs to the nearest tools/<x>.js before it in the run field
    for (const e of run.matchAll(/--exe\b/g)) {
      const before = run.slice(0, e.index), ms = [...before.matchAll(/tools\/([\w\-./]+\.js)\b/g)];
      const m = ms[ms.length - 1];
      if (m && !exeIn(T(m[1]))) add('IDX_EXE_SRC', at, name + ': tools/' + m[1] + ' has no --exe');
    }
  });
}
// a tool's --exe may sit in a sibling it requires (games word table in a lib file of the same folder)
function exeIn(file) {
  let t; try { t = fs.readFileSync(file, 'utf8'); } catch (e) { return true; } // a missing file is not this check's job
  if (/--exe/.test(t)) return true;
  const dir = path.dirname(file);
  for (const m of t.matchAll(/require\(['"](\.\/[\w\-./]+)['"]\)/g)) {
    let s; try { s = fs.readFileSync(path.resolve(dir, m[1].replace(/(\.js)?$/, '.js')), 'utf8'); } catch (e) { continue; }
    if (/--exe/.test(s)) return true;
  }
  return false;
}
let idx = ''; try { idx = fs.readFileSync(T('INDEX.md'), 'utf8'); } catch (e) { /* no router: groups not checked */ }
for (const l of idx.split(/\r?\n/)) {
  const m = /^(\w+) \| ([^|]+) \| (.+)$/.exec(l); if (!m || m[1] === 'group') continue;
  for (const n of m[3].trim().split(/\s+/)) if (!seen.has(n) && !new RegExp('^- ' + n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + ' ', 'm').test(idx)) info.push('IDX_GROUP ' + m[1] + ': ' + n + ' has no line');
}
if (!quiet) for (const s of info) console.log('info ' + s);
for (const s of bad) console.log(s);
console.log(bad.length ? 'FAIL ' + bad.length + ' (' + seen.size + ' tool lines)' : 'PASS ' + seen.size + ' tool lines, ' + info.length + ' info');
process.exit(bad.length ? 1 : 0);
