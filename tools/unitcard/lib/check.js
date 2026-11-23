// unitcard/check: the unit pictures of a mod against the game's rules. check(V, mod, o) -> { findings: [{ level, code, key, msg }], counts }
//   UC-SIZE   picture not at the size the game's own pictures of the kind have (the engine stretches it) [I]
//   UC-FRAMES a framed kind (_00.._03, squad _00.._02) with frames missing: the button shows nothing in that state [I]
//   UC-EBM the game has <stem>.ebm and the mod only frames: the .ebm wins and points at the game's frames [V data; I]
//   UC-PNG    a .png of the same name sits beside the .tga: the .png wins (FMT-04)
//   UC-ALPHA  a TGA of 24 bits or with alpha 0 everywhere: corners and see-through parts are lost [I]
//   UC-PORTRAIT a mod breed names a portrait with no portrait/<name> picture and no squad/<name>_00 picture [V button actor/human breed]
//   UC-READ   a picture that does not decode
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-b123f15a)
'use strict';
const fs = require('fs'), path = require('path');
const K = require('./kinds'), I = require('./img');

function walk(dir, rel, out) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(dir, e.name), r, out); else out.push(r.toLowerCase()); }
  return out;
}
function check(V, mod, o) {
  o = o || {};
  const F = [], add = (level, code, key, msg) => F.push({ level, code, key, msg });
  const kinds = K.list(V.gid), sizes = o.sizes || {};
  for (const k of kinds) {
    const base = 'resource/interface/scene/' + k.folder;
    const files = walk(path.join(mod, ...base.split('/')), '', []);
    const want = sizes[k.id] || [k.w, k.h];
    const stems = new Map();
    for (const f of files) {
      const key = base + '/' + f;
      if (k.id === 'scheme' ? !/\/scheme\.(tga|dds|png)$/.test(f) : f.includes('/')) continue;
      const m = /^(.*?)_0(\d)\.(tga|dds|png)$/.exec(f);
      if (k.frames && m) { if (!stems.has(m[1])) stems.set(m[1], new Set()); stems.get(m[1]).add(+m[2]); }
      if (/\.png$/.test(f) && files.includes(f.replace(/\.png$/, '.tga'))) add('warn', 'UC-PNG', key, 'A .png and a .tga of the same name: the game takes the .png (FMT-04).');
      if (!/\.(tga|dds|png)$/.test(f)) continue;
      let p = null, buf = null;
      try { buf = fs.readFileSync(path.join(mod, ...key.split('/'))); p = I.decode(buf, f); } catch (e) { add('error', 'UC-READ', key, 'The picture does not decode: ' + e.message); continue; }
      if (p.w !== want[0] || p.h !== want[1]) add('warn', 'UC-SIZE', key, p.w + 'x' + p.h + ', the game\'s ' + k.folder + ' pictures are ' + want[0] + 'x' + want[1] + '.');
      if (/\.tga$/.test(f) && buf && (buf[16] !== 32 || !I.hasAlpha(p) && k.id !== 'portrait')) { if (buf[16] !== 32) add('info', 'UC-ALPHA', key, 'A ' + buf[16] + '-bit TGA: no alpha (vanilla ' + k.folder + ' pictures are 32-bit with alpha).'); }
    }
    for (const [s, have] of stems) {
      const miss = []; for (let i = 0; i < k.frames; i++) if (!have.has(i)) miss.push('_0' + i);
      if (miss.length) add('warn', 'UC-FRAMES', base + '/' + s, 'Frames missing: ' + miss.join(' ') + ' (the button shows nothing in that state).');
      const ebm = base + '/' + s + '.ebm';
      if (V.has(ebm) && !files.includes(s + '.ebm')) add('error', 'UC-EBM', ebm, 'The game has ' + s + '.ebm, which wins over the mod\'s frames: the old picture stays. Add a ' + s + '.ebm to the mod that names the new frames.');
    }
  }
  // mod breeds and their portraits
  for (const f of walk(path.join(mod, 'resource', 'set', 'breed'), '', [])) {
    if (!/\.set$/.test(f)) continue;
    let t = ''; try { t = fs.readFileSync(path.join(mod, 'resource', 'set', 'breed', ...f.split('/')), 'latin1'); } catch (e) { continue; }
    const x = /\{\s*portrait\s+"?([^"}\s]+)"?\s*\}/i.exec(t); if (!x) continue;
    const n = x[1].toLowerCase(), has = b => ['.tga', '.dds', '.png'].some(e => V.has(b + e));
    if (!has('resource/interface/scene/portrait/' + n) && !has('resource/interface/scene/squad/' + n + '_00') && !V.has('resource/interface/scene/squad/' + n + '.ebm'))
      add('warn', 'UC-PORTRAIT', 'resource/set/breed/' + f, 'The breed names portrait "' + n + '" but neither portrait/' + n + ' nor squad/' + n + '_00 exists (no picture in the unit list and the soldier panel).');
  }
  const counts = { error: 0, warn: 0, info: 0 }; for (const x of F) counts[x.level]++;
  return { findings: F, counts };
}
module.exports = { check };
