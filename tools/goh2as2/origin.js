// Author: Imperator_Aug (ARSENAL, ia-1b1a96d4)
'use strict';
// PORTREV (rev-port #3): GoH-origin ledger. Every tool that writes GoH bytes (or text made from GoH files) into a mod folder appends one row per file
// to <mod>/GOH-ORIGIN.tsv: path (relative to the mod, forward slashes) \t sha1 \t tool \t key. A later row for the same path replaces the
// earlier one. A pack or publish step can refuse a mod that has this file (not wired yet: tools/packer is owned elsewhere, port-build).
//   record(modDir, rows[{file (absolute or mod-relative), buf?, tool, src}]) -> ledger path | null (no rows)
//   read(modDir) -> Map(path -> {sha1, tool, src})
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const NAME = 'GOH-ORIGIN.tsv', HEAD = '# GoH-origin files in this mod: do not publish without a yes (rev-port #3). path\tsha1\ttool\tgoh_source';

function read(modDir) {
  const m = new Map();
  let t = ''; try { t = fs.readFileSync(path.join(modDir, NAME), 'utf8'); } catch { return m; }
  for (const l of t.split(/\r?\n/)) { if (!l || l[0] === '#') continue; const [p, sha1, tool, src] = l.split('\t'); if (p) m.set(p, { sha1, tool, src }); }
  return m;
}
function record(modDir, rows) {
  if (!rows || !rows.length) return null;
  const m = read(modDir), root = path.resolve(modDir);
  for (const r of rows) {
    const abs = path.isAbsolute(r.file) ? r.file : path.join(root, r.file);
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..')) continue;
    let buf = r.buf; if (!buf) { try { buf = fs.readFileSync(abs); } catch { continue; } }
    m.set(rel, { sha1: crypto.createHash('sha1').update(buf).digest('hex'), tool: r.tool || '?', src: (r.src || '').replace(/[\t\r\n]/g, ' ') });
  }
  const lines = [HEAD, ...[...m.keys()].sort().map(k => [k, m.get(k).sha1, m.get(k).tool, m.get(k).src].join('\t'))];
  fs.mkdirSync(root, { recursive: true });
  const f = path.join(root, NAME); fs.writeFileSync(f, lines.join('\r\n') + '\r\n');
  return f;
}
module.exports = { NAME, read, record };
