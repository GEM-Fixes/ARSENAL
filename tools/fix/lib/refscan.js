// fix/refscan: one pass over every visible text file of the vfs (loose, in paks, in N.pat), whole-word match of a set of names.
//   scan(c, names) -> Map name(lowercase) -> [{ file, line, kind }]   referrer kind: armor | map | inventory | breed | other
//   word = [A-Za-z0-9_] run, case-insensitive; "foo_bar" and "xfoo" are not references to "foo"; "/", ".", quotes and spaces are boundaries
//   decide(kind) -> 'safe' | 'fatal' | 'unknown'   (engine severity of a reference to a deleted entity)
//     map safe ReadEntity: entity name does not load -> LogWarning "can't spawn entity", SkipBlock, continue [V]
//     armor fatal : stuff->model.Load null -> ERROR_MSG (only LogError) and the next line
//                  dereferences armor->model: null deref [V]
//     inventory, breed, other: no source read that proves a skip: unknown -> refused [I]
// Author: Imperator_Aug (ARSENAL, ia-cb047be3)
const vfs = require('../../lib/vfs');

const TEXT = /\.(def|inc|set|ext|mis|mi|lua|mdl|txt|info|mtl|ply|cfg|scn)$/;
const BIN = /\.(ply|mtl)$/;   // not scanned for references (binary or material-only); .mdl is text and links meshes
function isText(k) { return (TEXT.test(k) && !BIN.test(k)) || (/\/stuff\//.test(k) && !/\.[a-z0-9]+$/.test(k)); }

function kindOf(key, line) {
  if (/\.mis$/.test(key) || /^resource\/map\//.test(key)) return 'map';
  if (/armou?r/i.test(key) || /armou?r/i.test(line)) return 'armor';
  if (/\/stuff\/|\/inventory\//.test(key) || /inventory/i.test(line)) return 'inventory';
  if (/\/breed\/|\/breeds\//.test(key) || /breed/i.test(line)) return 'breed';
  return 'other';
}
const SEV = { map: 'safe', armor: 'fatal' };
const decide = kind => SEV[kind] || 'unknown';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function scan(c, names, o = {}) {
  const out = new Map(), set = [...new Set([...names].map(n => String(n).toLowerCase()).filter(Boolean))];
  if (!set.length) return out;
  const re = new RegExp('(?<![A-Za-z0-9_])(' + set.map(esc).join('|') + ')(?![A-Za-z0-9_])', 'gi');
  const skip = o.skipKeys || new Set();
  for (const [k, rec] of c.v.files) {
    if (!isText(k) || skip.has(k)) continue;
    let b; try { b = vfs.readRec(rec); } catch { continue; }
    if (b.indexOf(0) >= 0) continue;
    const t = b.toString('latin1');
    re.lastIndex = 0; let m;
    let lineAt = 0, pos = 0, lines = null;
    while ((m = re.exec(t))) {
      if (!lines) { lines = []; for (let i = t.indexOf('\n'); i >= 0; i = t.indexOf('\n', i + 1)) lines.push(i); }
      while (lineAt < lines.length && lines[lineAt] < m.index) lineAt++;
      const ls = lineAt ? lines[lineAt - 1] + 1 : 0, le = lineAt < lines.length ? lines[lineAt] : t.length;
      const n = m[1].toLowerCase(); let a = out.get(n); if (!a) out.set(n, a = []);
      if (!a.some(x => x.file === k && x.line === lineAt + 1)) a.push({ file: k, line: lineAt + 1, kind: kindOf(k, t.slice(ls, le)) });
    }
  }
  return out;
}

module.exports = { scan, decide, kindOf, isText };
