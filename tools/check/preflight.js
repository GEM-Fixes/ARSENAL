// preflight: extra warnings for `check`, our own code, ideas only T33. EVERY code here is a warning at review severity
// (lib/registry.severity() returns 'review' for codes it does not list, and these are deliberately not listed): they are counted in check's
// REVIEW list and can never change a verdict. promote a code to registry only after it is shown on as64.
//   PREFLIGHT_SPAWN_NO_ENTITY  mission command {"spawn" ...} (quoted name = command, not the map_point `allow {spawn tags}`) in a loose or pak/pat-packed .mi
//                              [V 0 hits in 2186 spawn blocks of 1042 packed .mi in AS2 Valour, 0 in loose RobZ/GoH Valour: no false positive seen, no true one either]
//                              with no non-empty {entity "x"}. reads `entity` + `waypoint`; Execute passes the empty name
//                              SetModel and spawns nothing useful [I: the empty-name outcome is not run; GoH note says a missing entity crashes]
//   PREFLIGHT_PATCH_UNMOUNTED  --with only: a file in the patch folder outside resource/, localization*, mod.info. stagePatch copies it to the mod
//                              root, and a mod root mounts only resource.pak, resource/, N.pat, localization*, lim VFS-26 [V]).
//                              vfs reports root leftovers as info only, which check never lists
// dropped (already covered, or valid on as64): see the session report; glued `}{"` lexes fine (sdlx), action/term names = milint/fxlint/uilint.
//   run({ mod, patch }) -> [{ code, n, samples:[..] }]
// Author: Imperator_Aug (ARSENAL, ia-01e9855b)
const fs = require('fs'), path = require('path');
const sdlx = require('../lib/sdlx'), pak = require('../lib/pak'), vfs = require('../lib/vfs');

const lc = s => String(s).toLowerCase();
function walkFiles(dir, rel, out) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walkFiles(path.join(dir, e.name), r, out); else out.push(r);
  }
  return out;
}
const nameOf = b => { const f = b.items && b.items[0]; return f && (f.k === 'STRING' || f.k === 'IDENT') ? f : null; };

// every .mi of a mod folder as [label, bytes-getter]: loose resource/ plus resource.pak and N.pat zips (read in place through lib/vfs.readRec)
function* miSources(mod) {
  const res = path.join(mod, 'resource');
  if (fs.existsSync(res)) for (const rel of walkFiles(res, '', [])) if (/\.mi$/i.test(rel)) yield [rel, () => fs.readFileSync(path.join(res, rel))];
  let top = []; try { top = fs.readdirSync(mod); } catch { return; }
  for (const f of top) {
    if (!/^(resource\.pak|\d+\.pat)$/i.test(f)) continue;
    const file = path.join(mod, f).replace(/\\/g, '/');
    let ents; try { ents = pak.list(file); } catch { continue; }
    for (const ent of ents) if (/\.mi$/i.test(ent.name)) yield [`${f}:${ent.name}`, () => vfs.readRec({ source: 'pak', container: file, entry: ent.name, ent })];
  }
}

function spawnNoEntity(mod) {
  const hits = [];
  try { for (const [rel, get] of miSources(mod)) {
    let buf; try { buf = get(); } catch { continue; }
    const r = sdlx.read(buf, { file: rel, key: rel.toLowerCase(), open: () => null, onError: () => {} });
    const visit = b => {
      for (const it of b.items) {
        if (it.k !== 'BLOCK') continue;
        const nm = nameOf(it);
        if (nm && nm.k === 'STRING' && lc(nm.value) === 'spawn' && !it.via) {
          const ent = it.items.find(x => x.k === 'BLOCK' && nameOf(x) && lc(nameOf(x).value || nameOf(x).text) === 'entity');
          const v = ent && ent.items.slice(1).find(x => x.k === 'STRING' || x.k === 'IDENT');
          if (!v || !String(v.value !== undefined ? v.value : v.text).trim()) hits.push(`${rel}:${it.line}`);
        }
        visit(it);
      }
    };
    visit(r.root);
  } } finally { vfs.closeRecs(); }
  return hits;
}

function patchUnmounted(patch) {
  const hits = [];
  for (const rel of walkFiles(patch, '', [])) {
    const top = rel.split('/')[0].toLowerCase();
    if (rel.includes('/') ? /^(resource|localization[^/]*)$/.test(top) : (top === 'mod.info' || top === 'resource.pak' || /^(\d+\.pat|localization.*\.pak)$/.test(top))) continue;
    if (!rel.includes('/') && /\.(txt|md|rtf|pdf|jpe?g|png|url)$/i.test(rel)) continue;   // readme/changelog/preview at the root: harmless, every mod has them
    hits.push(rel);
  }
  return hits;
}

// exe (optional, the vfs exe of the target game: 'mowas_2' | 'goh'; none = the folder's own pick, as before) goes to the stack's vfs
function run({ mod, patch, game, modId, exe }) {
  const out = [], add = (code, list) => { if (list.length) out.push({ code, n: list.length, samples: list.slice(0, 3) }); };
  add('PREFLIGHT_SPAWN_NO_ENTITY', spawnNoEntity(mod));
  if (patch) add('PREFLIGHT_PATCH_UNMOUNTED', patchUnmounted(patch));
  // stack checks (PREFLIGHT_WEAPON_FILLED_NO_FILLING, PREFLIGHT_STEM_TWO_CLASSES): need the game dir and the mod's id under mods/
  if (game && modId) out.push(...require('./stackchecks').run({ game, modId, exe }));
  return out;
}
module.exports = { run };
if (require.main === module) {
  const a = process.argv.slice(2);
  if (!a[0]) { console.error('usage: node tools/check/preflight.js <mod folder> [patch folder]'); process.exit(2); }
  for (const r of run({ mod: a[0], patch: a[1] })) console.log(`${r.code} x${r.n}  ${r.samples.join(' ')}`);
}
