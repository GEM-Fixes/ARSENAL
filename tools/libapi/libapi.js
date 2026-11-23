#!/usr/bin/env node
// libapi: tools/lib API digest (opt #35). per module: header comment + each export's signature + comment above it.
// replaces reading lib sources when building a tool. used by tools/brief.
// usage: node tools/libapi/libapi.js [libDir] [--head N] [-o out.md]
// Author: Imperator_Aug (ARSENAL, ia-a8b1d816)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');

const LIB = path.join(__dirname, '..', 'lib');
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// leading `//` lines of a file (after shebang), comment marker stripped
function header(lines) {
  const out = [];
  for (const l of lines) {
    if (/^#!/.test(l)) continue;
    const m = /^\/\/ ?(.*)$/.exec(l);
    if (!m) break;
    if (m[1].trim()) out.push(m[1].trim());
  }
  return out;
}

// names in `module.exports = { a, b: c, ... }` (key names; may span lines)
function exportNames(src) {
  const m = /module\.exports\s*=\s*\{([\s\S]*?)\}/.exec(src);
  if (!m) return [];
  return m[1].split(',').map(s => s.split(':')[0].trim()).filter(s => /^[\w$]+$/.test(s));   // inline arrow bodies split into junk: keep identifiers
}

// text up to the paren closing an already-open '(' (defaults may hold parens)
function params(s) {
  let d = 1, i = 0;
  for (; i < s.length && d; i++) d += s[i] === '(' ? 1 : s[i] === ')' ? -1 : 0;
  return (d ? s : s.slice(0, i - 1)).trim();
}

// declaration of name → { sig, doc } (doc = nearest `//` comment above, or trailing comment on the line)
function decl(lines, name) {
  const pats = [
    [new RegExp(`^\\s*(?:async\\s+)?function\\*?\\s+${name}\\s*\\((.*)`), m => `${name}(${params(m[1])})`],
    [new RegExp(`^\\s*class\\s+${name}\\b(?:\\s+extends\\s+(\\w+))?`), m => `class ${name}${m[1] ? ' extends ' + m[1] : ''}`],
    [new RegExp(`\\b${name}\\s*=\\s*(?:async\\s*)?\\((.*)\\)\\s*=>`), m => `${name}(${params(m[1] + ')')})`],
    [new RegExp(`\\b${name}\\s*=\\s*(?:async\\s+)?(\\w+)\\s*=>`), m => `${name}(${m[1]})`],
    [new RegExp(`^\\s*(?:const|let|var)\\s+(?:[\\w$]+\\s*=.*,\\s*)?${name}\\s*=\\s*([^;]*)`), m => `${name} = ${clip(m[1].replace(/\s*\/\/.*$/, '').trim(), 50)}`],
  ];
  for (const [re, fmt] of pats) {
    const i = lines.findIndex(l => re.test(l));
    if (i < 0) continue;
    const sig = fmt(re.exec(lines[i]));
    let doc = (/\/\/\s*(.+)$/.exec(lines[i]) || [])[1] || '';
    if (!doc) {
      const above = [];
      let j = i - 1;
      for (; j >= 0 && /^\s*\/\//.test(lines[j]); j--) above.unshift(lines[j].replace(/^\s*\/\/\s?/, '').trim());
      if (j >= 0) doc = above.join(' ');   // run reaching line 0 = file header, not this export's doc
    }
    return { sig, doc: doc.trim() };
  }
  return { sig: name, doc: '' };
}

// md digest of every lib module. head = header lines kept per module
function api(libDir = LIB, { head = 2 } = {}) {
  const out = [`# tools/lib API (generated: node tools/libapi/libapi.js) — require('../lib/<mod>')`];
  for (const f of fs.readdirSync(libDir).filter(f => f.endsWith('.js')).sort()) {
    const src = fs.readFileSync(path.join(libDir, f), 'utf8');
    const lines = src.split(/\r?\n/);
    const h = header(lines).slice(0, head);
    const mod = f.replace(/\.js$/, '');
    out.push(`## ${mod}: ${clip(h[0] ? h[0].replace(new RegExp(`^${mod}:\\s*`), '') : '', 140)}`);
    for (const l of h.slice(1)) out.push(`  ${clip(l, 140)}`);
    for (const n of exportNames(src)) {
      const { sig, doc } = decl(lines, n);
      out.push(`- ${sig}${doc ? ' — ' + clip(doc, 80) : ''}`);
    }
  }
  return out.join('\n') + '\n';
}

module.exports = { api, exportNames };

if (require.main === module) {
  const a = process.argv.slice(2);
  const opt = { head: 2 }; let dir = LIB, outFile = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '-o') outFile = a[++i];
    else if (a[i] === '--head') opt.head = +a[++i];
    else dir = a[i];
  }
  const text = api(dir, opt);
  if (outFile) fs.writeFileSync(outFile, text); else process.stdout.write(text);
}
