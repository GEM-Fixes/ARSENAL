// keysets: vanilla virtual-key set per target (lowercase, no resource/ prefix). AS2 targets via lib/vfs (as64 adds as64/core layer), GoH via lib/pakset + loose files.
//   vanillaKeys(target, root) -> Set    disk cache <per-user cache>/modmove/keys-<target>-<hash>.txt keyed on pak/loose-root sizes+mtimes
// Author: Imperator_Aug (ARSENAL, ia-e833ca3b)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const CACHE = path.resolve(__dirname, '..', 'cache');
const cipath = require('../../lib/cipath');
// root + rel ignoring letter case as the game does (Linux/macOS); exact path first, so Windows gets the plain join (same hash)
const ciJoin = (root, rel, fsx) => cipath.resolve(root, rel, { cache: new Map(), fs: fsx }) || path.join(root, rel);
const stripRes = k => k.replace(/^resource\//, '');

function sig(root) {
  const parts = [];
  const rec = (d, depth) => {
    let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 4) rec(p, depth + 1); }
      else if (/\.(pak|pat)$/i.test(e.name)) { const s = fs.statSync(p); parts.push(path.relative(root, p) + ':' + s.size + ':' + Math.floor(s.mtimeMs)); }
    }
  };
  rec(ciJoin(root, 'resource'), 0);
  for (const f of ['localization.pak', '1.pat']) { try { const s = fs.statSync(ciJoin(root, f)); parts.push(f + ':' + s.size); } catch { /* none */ } }
  const core = ciJoin(root, 'as64/core');
  if (fs.existsSync(core)) parts.push('as64core:' + fs.readdirSync(core).join(','));
  return crypto.createHash('md5').update(parts.sort().join('|')).digest('hex').slice(0, 10);
}

function vanillaKeys(target, root, opt = {}) {
  const cf = require('../../lib/toolcache').file('modmove', 'keys-' + target + '-' + sig(root) + '.txt', CACHE);   // per-user cache; old file in CACHE copied over
  const nc = opt.noCache || process.env.MODMOVE_NO_CACHE;   // tests: fake installs have loose files only, which the signature ignores
  if (!nc && fs.existsSync(cf)) return new Set(fs.readFileSync(cf, 'utf8').split('\n').filter(Boolean));
  const keys = new Set();
  if (target === 'goh') {
    const pakset = require('../../lib/pakset'), rr = ciJoin(root, 'resource');
    const ps = pakset.open(rr, null);
    for (const e of ps.entries) keys.add(e.key);
    ps.close();
    const walkLoose = (d, rel) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walkLoose(path.join(d, e.name), rel + e.name.toLowerCase() + '/');
        else if (!/\.pak$/i.test(e.name)) keys.add(rel + e.name.toLowerCase());
      }
    };
    if (fs.existsSync(rr)) walkLoose(rr, '');
  } else {
    const vfs = require('../../lib/vfs');
    const v = vfs.build({ gameDir: root, mods: [], exe: target === 'as64' ? 'as64' : 'mowas_2' });
    for (const k of v.files.keys()) keys.add(stripRes(k.toLowerCase()));
  }
  if (!nc) require('../../lib/cachewrite').write(cf, [...keys].join('\n'));   // best effort: one stderr line on failure
  return keys;
}
module.exports = { vanillaKeys, stripRes, _ci: { ciJoin, sig } };
