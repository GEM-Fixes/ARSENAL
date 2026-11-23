// check/incscan: which .inc files does nothing include? The engine parses an .inc only through an (include "...") of a file it opens
// (set/interaction_entity/*.inc come in through entity.set: opens that one file), so a
// test or leftover .inc that no file names is never read and its syntax errors cannot stop the game.
//   unincluded(keys, modDirs, gameDir) -> Set of the keys (resource/...) that no text file of the mod includes and the game does not carry
//   a key the game also has (loose or in a pak) counts as included: the game's own files name it. read-only.
// Author: Imperator_Aug (ARSENAL, ia-8e6d103d)
const fs = require('fs'), path = require('path'), pak = require('../lib/pak'), locate = require('../lib/locate');

const TEXT = /\.(def|inc|set|ext|mi|mis|mdl|lua|pattern|presets)$/i, RE = /\(\s*include\s+"([^"]+)"/gi, MAX = 64 * 1024 * 1024;
const base = p => String(p).replace(/\\/g, '/').split('/').pop().toLowerCase();

function includedNames(dirs) {
  const names = new Set();
  let wild = false;
  const eat = buf => { const s = buf.toString('latin1'); let m; RE.lastIndex = 0; while ((m = RE.exec(s))) { if (m[1].includes('%')) wild = true; names.add(base(m[1])); } };
  const walk = d => {
    let list; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of list) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/\.arsenal-undo$/i.test(e.name)) walk(p); continue; }
      if (/\.(pak|pat)$/i.test(e.name)) {
        let L; try { L = pak.list(p); } catch (x) { continue; }
        for (const en of L) if (TEXT.test(en.name) && en.size <= MAX) { try { eat(pak.read({ file: p }, en)); } catch (x) { /* unreadable entry */ } }
      } else if (TEXT.test(e.name)) { try { if (fs.statSync(p).size <= MAX) eat(fs.readFileSync(p)); } catch (x) { /* unreadable file */ } }
    }
  };
  for (const d of dirs) if (d) walk(d);
  return { names, wild };
}

function unincluded(keys, modDirs, gameDir) {
  const out = new Set(), want = [...new Set(keys)].filter(k => /\.inc$/i.test(k));
  if (!want.length) return out;
  const { names, wild } = includedNames(modDirs);
  if (wild) return out;   // an include built from a macro parameter can name anything: say nothing
  for (const k of want) {
    if (names.has(base(k))) continue;
    if (gameDir && locate.find(path.join(gameDir, k))) continue;
    out.add(k);
  }
  return out;
}
module.exports = { unincluded, includedNames };
