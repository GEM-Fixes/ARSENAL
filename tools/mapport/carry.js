// mapport --carry: what a ported map needs beside its map files when no GoH mount is present (MAPR-G5, "Rule a tool follows").
//   land textures named by .materials (GoH key lookup, .ebm {reference} followed, keys AS2 has are skipped, dds copied under the same key;
//   a {bitmap {frame "x.dds"}} .ebm is copied as it is plus every frame it names, relative to its own dir, recursing into frame .ebm),
//   mtlN.mtl per library entry in AS2 form, environment presets the .mi files name (Environment + trigger environment), filtered to AS2 keys.
// carry({ root, goh, as2, out, only, dry, log }) -> { maps, textures, bytes, mtl, env, envMissing, warnings[], dropped{}, files[{rel,size}] }
// root = ported map resource root (map/<name>/.materials, *.mi); goh, as2 = resource roots (paks or loose). Writes only under out.
// Not converted: ATI2, BC5U and raw 8-bit land textures are copied as they are and named in warnings [I that AS2 loads DXT1/DXT5 only; MAPR-G5 saw those load].
// Author: Imperator_Aug (ARSENAL, ia-92d2a5bc)
'use strict';
const fs = require('fs'), path = require('path');
const pakset = require('../lib/pakset');

// AS2 environment keys (multi_01 / multi_07 form). 1 = keep, object = filter the children
// tone/tone_strength dropped: as64 uses tone_strength as g_ambientLevel, GoH 0.4 renders white haze [V shot,]
const KEEP = {
  light: { direction: 1, ambient: 1, diffuse: 1, specular: 1, lightsIntensity: 1, draw_sun_moon: 1, sun_moon_radius: 1, night: 1, night_vision: 1,
    color_correction: { contrast: 1, gamma: 1, brightness: 1, saturation: 1, color_shading: { shade_tone: 1 } },
    camera_lens_effetcs: { light_scattering: { enable: 1, intensity: 1, ray_length: 1, color_tone: 1 }, lens_dirt: { enable: 1 }, screen_brightening: { enable: 1, intensity: 1 } } },
  wind: { speed: 1, amplitude: 1 },
  haze: { enable: 1, color: 1, start: 1, end: 1 },
  sky: { enable: 1, texture: 1, globalEnvironment: 1, intensity: 1, azimuth: 1 },
  weather: { enable: 1, density: 1, fx: 1 },
  thunder: { color: 1 }, video_overlay: { color: 1 },
  dof: { enable: 1, near_scale: 1, far_scale: 1, near_start: 1, near_end: 1, far_start: 1, far_end: 1, blur_strength: 1 },
  glow: { enable: 1, amount: 1 },
};
const SKY_FALLBACK = '/texture/common/environment/envmap_glass01';

function parse(txt) { // brace tree: node = {k, v:[atoms], kids:[]}
  let i = 0;
  function node() {
    i++;
    const toks = [], kids = [];
    while (i < txt.length) {
      const c = txt[i];
      if (c === '}') { i++; break; }
      if (c === '{') { kids.push(node()); continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"') { // a quote never closed ends the token at the end of the text (indexOf -1 used to restart at 0 and recurse forever)
        let j = txt.indexOf('"', i + 1); if (j < 0) j = txt.length - 1;
        toks.push(txt.slice(i, j + 1)); i = j + 1; continue;
      }
      let j = i; while (j < txt.length && !/[\s{}]/.test(txt[j])) j++;
      toks.push(txt.slice(i, j)); i = j;
    }
    return { k: toks[0], v: toks.slice(1), kids };
  }
  while (i < txt.length && txt[i] !== '{') i++;
  return node();
}
// environment preset names a .mi uses, by brace parse (';' comments outside strings skipped): {Environment "x"} at any depth, and a
// trigger/action block keyed "environment" (any case, quoted or not) whose {name "x"} child names the preset, at any depth below it
function miEnvNames(s) {
  let t = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') q = !q;
    if (!q && c === ';') { while (i < s.length && s[i] !== '\n') i++; t += '\n'; continue; }
    t += c;
  }
  const out = new Set(), un = v => String(v || '').replace(/^"|"$/g, '');
  const walk = n => {
    const k = un(n.k).toLowerCase();
    if (k === 'environment' && n.v[0] && /^"/.test(n.v[0])) out.add(un(n.v[0]));
    if (k === 'environment') { const nm = n.kids.find(c => un(c.k).toLowerCase() === 'name'); if (nm && nm.v[0]) out.add(un(nm.v[0])); }
    n.kids.forEach(walk);
  };
  let i = 0;
  while ((i = t.indexOf('{', i)) >= 0) { const sub = t.slice(i); const root = parse(sub); walk(root); i += Math.max(1, emitLen(sub)); }
  return [...out];
}
// length of the first top-level {...} in txt (txt starts at '{'), strings respected
function emitLen(txt) { let d = 0, q = false; for (let i = 0; i < txt.length; i++) { const c = txt[i]; if (c === '"') q = !q; else if (!q && c === '{') d++; else if (!q && c === '}' && --d === 0) return i + 1; } return txt.length; }
function filt(n, sc, p, dropped) {
  const o = { k: n.k, v: n.v, kids: [] };
  for (const c of n.kids) {
    if (sc[c.k] === undefined) { dropped[p + '/' + c.k] = (dropped[p + '/' + c.k] || 0) + 1; continue; }
    o.kids.push(typeof sc[c.k] === 'object' ? filt(c, sc[c.k], p + '/' + c.k, dropped) : c);
  }
  return o;
}
function emit(n, d) {
  const t = '\t'.repeat(d), head = n.k + (n.v.length ? ' ' + n.v.join(' ') : '');
  if (!n.kids.length) return `${t}{${head}}\r\n`;
  return `${t}{${head}\r\n` + n.kids.map(c => emit(c, d + 1)).join('') + `${t}}\r\n`;
}

// GoH preset text -> AS2 form text. has2(key) tells whether AS2 owns a texture key
// sky `texture` AS2 lacks (GoH environment_clouds_02/03): carrySky(key) copies it and returns true, else an AS2 sky by name [V log m5carry2: "does not exist"]
// weather fx: AS2 reads a short name (snow, rain ..; set/environment presets); GoH snow_storm is "Undefined weather fx" in AS2 [V log m5carry2] -> blizzard
const SKY_CLOUDS = '/texture/common/environment/environment_clouds_01', SKY_DAY = '/texture/common/environment/environment_day_01', SKY_NIGHT = '/texture/common/environment/environment_night_01';
const WX_AS2 = new Set(['blizzard', 'rain', 'rain_night', 'snow', 'snow_flakes']), WX_MAP = { snow_storm: 'blizzard' };
function wxName(v) {
  const n = String(v || '').replace(/"/g, '').replace(/^.*\//, '').replace(/\.fx$/i, '').toLowerCase();
  if (WX_AS2.has(n)) return n;
  if (WX_MAP[n]) return WX_MAP[n];
  if (/storm|blizz/.test(n)) return 'blizzard';
  if (/snow/.test(n)) return 'snow';
  if (/rain/.test(n)) return /night/.test(n) ? 'rain_night' : 'rain';
  return null;
}
function convertEnv(text, has2, dropped, carrySky) {
  const t = parse(text), f = filt(t, KEEP, '', dropped);
  const light = t.kids.find(c => c.k === 'light'), L = f.kids.find(c => c.k === 'light');
  if (L && !L.kids.some(c => c.k === 'specular')) { // specularIntensity -> specular grey
    const si = light && light.kids.find(c => c.k === 'specularIntensity');
    const hx = Math.round(255 * (si ? parseFloat(si.v[0]) : 0.4)).toString(16).padStart(2, '0');
    L.kids.splice(Math.min(4, L.kids.length), 0, { k: 'specular', v: ['0xff' + hx + hx + hx], kids: [] });
  }
  const W = f.kids.find(c => c.k === 'wind'), w0 = t.kids.find(c => c.k === 'wind');
  if (w0 && W) { // direction * main_strength -> speed, amplitude 2
    const d = w0.kids.find(c => c.k === 'direction'), s = w0.kids.find(c => c.k === 'main_strength');
    const st = s ? parseFloat(s.v[0]) : 0.5;
    if (d) W.kids.push({ k: 'speed', v: d.v.map(x => (parseFloat(x) * st).toFixed(3)), kids: [] });
    W.kids.push({ k: 'amplitude', v: ['2'], kids: [] });
  }
  const SK = f.kids.find(c => c.k === 'sky');
  if (SK) for (const c of SK.kids) if (c.k === 'globalEnvironment' && c.v[0] && !has2(c.v[0].replace(/"/g, '').replace(/^\//, ''))) c.v = ['"' + SKY_FALLBACK + '"'];
  if (SK) for (const c of SK.kids) if (c.k === 'texture' && c.v[0]) {
    const k = c.v[0].replace(/"/g, '').replace(/^\//, '').toLowerCase();
    if (has2(k) || (carrySky && carrySky(k))) continue;
    c.v = ['"' + (/night/.test(k) ? SKY_NIGHT : /cloud/.test(k) ? SKY_CLOUDS : SKY_DAY) + '"'];
    if (dropped) dropped['/sky/texture ' + k + ' -> AS2 sky'] = (dropped['/sky/texture ' + k + ' -> AS2 sky'] || 0) + 1;
  }
  const WX = f.kids.find(c => c.k === 'weather');
  if (WX) WX.kids = WX.kids.filter(c => {
    if (c.k !== 'fx') return true;
    const n = wxName(c.v[0]);
    if (dropped && n !== c.v[0].replace(/"/g, '')) { const t = '/weather/fx ' + c.v[0].replace(/"/g, '') + ' -> ' + (n || 'dropped'); dropped[t] = (dropped[t] || 0) + 1; }
    if (!n) return false;
    c.v = ['"' + n + '"']; return true;
  });
  const D = f.kids.find(c => c.k === 'dof'), d0 = t.kids.find(c => c.k === 'dof');
  if (D && d0 && d0.kids.find(c => c.k === '"3rd_Person"')) D.kids.push({ k: '"3rd_Person"', v: [], kids: [{ k: '"3rdP_blurscale"', v: ['1'], kids: [] }] });
  return '{environment\r\n' + f.kids.map(c => emit(c, 1)).join('') + '}\r\n';
}

// DDS pixel format: DXT1 DXT5 ... or 'raw8' when the header carries no fourcc and 8 bits per pixel
function ddsFormat(b) {
  if (b.length < 128 || b.toString('latin1', 0, 4) !== 'DDS ') return 'notdds';
  if (b.readUInt32LE(80) & 4) return b.toString('latin1', 84, 88);
  return b.readUInt32LE(88) === 8 ? 'raw8' : 'rgb' + b.readUInt32LE(88);
}

// reader over a resource root: loose file first, then paks. ext = the extensions to index from paks
function reader(root, exts) {
  const set = pakset.open(root, { ext: new Set(exts) });
  const byKey = new Map(set.entries.map(e => [e.key, e]));
  const loose = key => { const f = path.join(root, key); try { return fs.statSync(f).isFile() ? f : null; } catch (e) { return null; } };
  return {
    has: key => !!loose(key) || byKey.has(key),
    read: key => { const f = loose(key); if (f) return fs.readFileSync(f); const e = byKey.get(key); return e ? pakset.read(e) : null; },
    close: () => set.close(),
  };
}

function carry(o) {
  const log = o.log || (() => {});
  const R = p => path.resolve(p).toLowerCase().replace(/\\/g, '/');
  for (const r of [o.goh, o.as2]) if (R(o.out) === R(r) || R(o.out).startsWith(R(r) + '/')) throw new Error('--out is inside a game resource root: ' + o.out);
  const EXT = ['.dds', '.ebm', '.set', '.tga', '.bmp'];
  const goh = reader(o.goh, EXT), as2 = reader(o.as2, EXT);
  const res = { maps: 0, textures: 0, ebm: 0, frames: 0, skipped: 0, bytes: 0, mtl: 0, env: 0, envMissing: [], warnings: [], dropped: {}, files: [] };
  const put = (rel, buf) => {
    res.files.push({ rel, size: buf.length });
    if (o.dry) return;
    const f = path.join(o.out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
    origin.push({ file: f, buf, tool: 'mapport --carry', src: rel });
  };
  const origin = [];   // PORTREV rev-port #3: every carried file is GoH data (textures, ebm, mtl from .materials, env presets)
  const copied = new Set(), skipped = new Set(), formats = {};
  const asKey = n => n.replace(/^\//, '').toLowerCase();
  const has2 = k => as2.has(k + '.dds') || as2.has(k + '.ebm') || as2.has(k + '.tga');
  // key (no ext) -> {key, buf} of the dds it ends in, following .ebm references; null when GoH lacks it
  function resolve(name, depth) {
    const k = asKey(name);
    const d = goh.read(k + '.dds');
    if (d) return { key: k, buf: d };
    const r = goh.read(k + '.ebm');
    const m = r && depth < 8 && /reference\s+"([^"]+)"/.exec(r.toString('latin1'));
    if (m) { log(`ebm ${k} -> ${m[1]}`); return resolve(m[1], depth + 1); }
    if (r && frames(r).length) return { key: k, ebm: r };
    // MAPFILL: GoH keeps some land layers as .tga only (dcg_f_barrikady mtl2-4 height asphalt_a1_hm.tga, RLE type 10); the AS2 loader reads
    // tga types 1,2,3,9,10,11 (modweb formats/textures, bitmap image tga) and looks the extensionless key up as .tga too, so it is copied as is
    const t = goh.read(k + '.tga');
    if (t && [1, 2, 3, 9, 10, 11].includes(t[2])) return { key: k, buf: t, ext: '.tga' };
    if (t) res.warnings.push(`FORMAT_TGA_TYPE_${t[2]} ${k}.tga (AS2 loader cannot read it, not copied)`);
    return null;
  }
  // frame names of a {bitmap} .ebm, ';' comments skipped
  function frames(buf) {
    const t = buf.toString('latin1').split(/\r?\n/).map(l => l.replace(/;.*$/, '')).join('\n');
    return [...t.matchAll(/\{\s*frame\s+"([^"]+)"/gi)].map(x => x[1]);
  }
  // copy a {bitmap} .ebm under its key and each frame it names (relative to the .ebm dir, leading '/' = resource root);
  // frames AS2 has are skipped, a frame .ebm recurses, a missing frame is warned
  function carryEbm(k, buf, depth, where) {
    if (copied.has(k + '.ebm')) return;
    put(k + '.ebm', buf); copied.add(k + '.ebm'); res.bytes += buf.length; res.ebm++;
    const dir = k.includes('/') ? k.slice(0, k.lastIndexOf('/') + 1) : '';
    for (const fr of frames(buf)) {
      const n = fr.replace(/\\/g, '/').toLowerCase();
      const fk = n.startsWith('/') ? n.slice(1) : dir + n;
      const tries = /\.\w+$/.test(fk) ? [fk] : [fk + '.dds', fk + '.ebm'];
      const hit = tries.find(x => as2.has(x));
      if (hit) { skipped.add(hit); continue; }
      const fx = tries.find(x => goh.has(x));
      if (!fx) { res.warnings.push(`MISSING_FRAME ${where} ${k}.ebm ${fr}`); continue; }
      if (copied.has(fx)) continue;
      const b = goh.read(fx);
      log(`ebm ${k} frame ${fx}`);
      if (/\.ebm$/.test(fx)) { if (depth < 8) carryEbm(fx.slice(0, -4), b, depth + 1, where); continue; }
      if (/\.dds$/.test(fx)) { const f = ddsFormat(b); formats[f] = (formats[f] || 0) + 1; if (f !== 'DXT1' && f !== 'DXT3' && f !== 'DXT5') res.warnings.push(`FORMAT_${f.toUpperCase()} ${fx} (copied, not converted)`); }
      put(fx, b); copied.add(fx); res.bytes += b.length; res.frames++;
    }
  }
  // maps: every dir under root/map holding a `map` file (loose or in a pak of root)
  const rootSet = pakset.open(o.root, {});
  const files = new Map();
  const walk = (d, pre) => { let ds; try { ds = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const x of ds) { const key = pre + x.name.toLowerCase(); if (x.isDirectory()) walk(path.join(d, x.name), key + '/'); else if (x.isFile()) files.set(key, () => fs.readFileSync(path.join(d, x.name))); } };
  walk(path.join(o.root, 'map'), 'map/');
  for (const e of rootSet.entries) if (/^map\//.test(e.key) && !files.has(e.key)) files.set(e.key, () => pakset.read(e));
  const maps = [...files.keys()].filter(k => /^map\/.+\/map$/.test(k)).map(k => k.slice(0, -4)).filter(m => !o.only || m.includes(o.only)).sort();
  const envNames = new Set();
  for (const m of maps) {
    res.maps++;
    const nameOf = m.replace(/^map\//, '');
    const mat = files.get(m + '/.materials');
    if (!mat) res.warnings.push(`NO_MATERIALS ${nameOf}`);
    const t = mat ? mat().toString('latin1').replace(/\r\n/g, '\n') : '';
    for (const [, id, body] of t.matchAll(/\{"(mtl\d+)"([\s\S]*?)\n\t\}/g)) {
      let out = '{material\r\n';
      for (const lb of body.matchAll(/\{layer bump([\s\S]*?)\n\t\t\}/g)) {
        const kv = {};
        for (const x of lb[1].matchAll(/\{(\w+) ("?)([^"}\r\n]+)\2\}/g)) kv[x[1]] = x[3];
        out += '\t{layer bump\r\n';
        for (const k of ['diffuse', 'bump', 'specular', 'height']) {
          if (!kv[k]) continue;
          const key = asKey(kv[k]);
          if (has2(key)) { skipped.add(key); out += `\t\t{${k} "/${key}"}\r\n`; continue; }
          const r = resolve(kv[k], 0);
          if (!r) { res.warnings.push(`MISSING_TEXTURE ${nameOf} ${id} ${k} ${kv[k]}`); continue; }
          if (has2(r.key)) { skipped.add(r.key); out += `\t\t{${k} "/${r.key}"}\r\n`; continue; } // an .ebm that ends on a key AS2 has
          if (r.ebm) { carryEbm(r.key, r.ebm, 0, `${nameOf} ${id} ${k}`); out += `\t\t{${k} "/${r.key}"}\r\n`; continue; }
          if (!copied.has(r.key) && r.ext === '.tga') { formats.TGA = (formats.TGA || 0) + 1; put(r.key + '.tga', r.buf); copied.add(r.key); res.bytes += r.buf.length; }
          else if (!copied.has(r.key)) {
            const f = ddsFormat(r.buf); formats[f] = (formats[f] || 0) + 1;
            if (f !== 'DXT1' && f !== 'DXT3' && f !== 'DXT5') res.warnings.push(`FORMAT_${f.toUpperCase()} ${r.key} (copied, not converted)`);
            put(r.key + '.dds', r.buf); copied.add(r.key); res.bytes += r.buf.length;
          }
          out += `\t\t{${k} "/${r.key}"}\r\n`;
        }
        out += `\t\t{color 0xffffffff}\r\n\t\t{parallax_scale ${kv.parallax_scale || 0}}\r\n\t}\r\n`;
      }
      out += '}\r\n';
      put(`${m}/${id}.mtl`, Buffer.from(out, 'latin1')); res.mtl++;
    }
    for (const k of files.keys()) if (k.startsWith(m + '/') && /\.mi$/.test(k)) {
      for (const nm of miEnvNames(files.get(k)().toString('latin1'))) envNames.add(nm);
    }
  }
  res.textures = copied.size - res.ebm - res.frames; res.skipped = skipped.size; res.formats = formats;
  res.sky = 0;
  // a GoH sky texture AS2 lacks: copied when GoH has it as DXT1/3/5, else convertEnv falls back to an AS2 sky
  const carrySky = k => {
    if (copied.has(k)) return true;
    const b = goh.read(k + '.dds');
    if (!b) { res.warnings.push(`SKY_MISSING ${k} (AS2 sky used)`); return false; }
    const f = ddsFormat(b);
    if (!/^DXT[135]$/.test(f)) { res.warnings.push(`SKY_FORMAT_${f.toUpperCase()} ${k} (AS2 sky used)`); return false; }
    put(k + '.dds', b); copied.add(k); res.bytes += b.length; res.sky++;
    return true;
  };
  for (const nm of [...envNames].sort()) {
    const key = 'set/environment/' + nm.toLowerCase() + '.set';
    if (as2.has(key)) continue; // an AS2 preset of that id needs no carry, and a GoH one must not shadow it
    const b = goh.read(key);
    if (!b) { res.envMissing.push(nm); continue; }
    put(key, Buffer.from(convertEnv(b.toString('latin1'), has2, res.dropped, carrySky), 'latin1')); res.env++;
  }
  res.envNames = envNames.size;
  rootSet.close(); goh.close(); as2.close();
  if (origin.length) res.origin = require('../goh2as2/origin').record(path.basename(path.resolve(o.out)).toLowerCase() === 'resource' ? path.dirname(path.resolve(o.out)) : o.out, origin);   // ledger beside resource/, never inside it (packed)
  return res;
}
module.exports = { carry, convertEnv, parse, ddsFormat, miEnvNames };
