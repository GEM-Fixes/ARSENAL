// render env (MV-R3): the light of a mode's environment preset and the colour tune of the game (render.md freeze draft 2.2,
// 4.4; design 7 L4). Parent side of L4 only; reads the game through a mapkit src.
//   CLEAN                              the clean daylight light object (= l1.LIGHT, source 'clean', tune null)
//   envLight(src, doc, mode?) -> {light, gaps:[code], notes:[text], files:{key: sha1}}
//     The mode's {Environment "x"} (doc.modes[].env) -> resource/set/environment/x.set, block {light}: direction, ambient,
//     diffuse and color_correction. No mode given: the first mode of the doc that names an environment [I: a ruling, the
//     page asks with a mode]. Absent or unreadable -> CLEAN with gap RENDER_ENV_MISSING. Diffuse and ambient both black
//     (GoH goh/black, 87 MP .mi) -> CLEAN with gap RENDER_ENV_PLACEHOLDER [V data; what the game shows: T].
//   parsePreset(text, target, name) -> light | {error}
//   lightOf(x) -> light object or null   a given light: {dir, sun, amb} with sun and amb a number or [r,g,b] (source 'given')
//   worldSun(light) -> [x,y,z]          unit vector toward the sun in the world frame (x east, y north, z up):
//                                       normalize(-dir[0], +dir[1], -dir[2]) (dir is in the mesh frame, mesh y = -world y,
//                                       as l1 shades) [I]; a dir with |z| < 1e-5 after normalising is the sun straight
//                                       down ( SunDirection [V])
//   tune(r, g, b, t, out) -> out        colour tune on 0..1 values (t = light.tune; null = identity)
// Colour tune (shader dx10/postprocess/color_tune.hlsl, the same file in MoW:AS2 and GoH [V both stacks]):
//   c = pow(sat((c - 0.5) x contrast + 0.5) x brightness, 1 / gamma); c = sat(c + toneAdd); c = lerp(lum, c, saturation)
//   (lum = dot(c, (0.2125, 0.7154, 0.0721)), tools.inc Luminance [V]); colour shade: s = (0.21 r + 0.72 g + 0.07 b) x
//   shadeTone, c = lerp(c, s, shadeIntensity).
//   as64 and mowas2 (the engine as read, [V]): the gamma, brightness, contrast, saturation
//   register is set to 1, 1, 1, 1 and the tone register to white x tone_strength (g_colorTuneColor is white and never set;
//   the preset's tone colour does not reach the shader), so tune = {gamma 1, brightness 1, contrast 1, saturation 1,
//   tone [1,1,1], toneStrength = tone_strength}; the AS2 shader replaces the colour with the shade when color_shading has
//   {enable} (: enable is the switch; COLOR_SHADE mode 3), so shadeIntensity 1 with enable
//   else 0. A haze check saw a white haze in game with tone_strength 0.4 [V shot], which this rule gives.
//   goh: the preset's own gamma, brightness, contrast, saturation (default 1), tone x tone_strength, shade
//   lerp(c, shade, intensity) when color_shading has {enable} (GoH shader: shadeTone.w is the blend factor [V shader];
//   the GoH CPU side is not read [I]). gamma <= 0 counts as 1 (goh/black holds 0).
// Author: Imperator_Aug (ARSENAL, ia-aa4be927)
'use strict';
const crypto = require('crypto');

const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
function mv() { return require('../mapviz'); }
function L1() { return require('./l1'); }
function mats() { return require('./mats'); }

const CLEAN = Object.freeze({
  name: 'clean_daylight', source: 'clean', dir: [0.719, 0.281, -0.636], sun: [0.601, 0.601, 0.601], amb: [0.179, 0.179, 0.179], tune: null,
});
// CLEAN must equal l1.LIGHT (the l3 bake light); checked when first used
let checked = false;
function clean() {
  if (!checked) {
    const L = L1().LIGHT;
    const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
    if (!(same(L.dir, CLEAN.dir) && same(L.sun, CLEAN.sun) && same(L.amb, CLEAN.amb))) {
      throw new (mv().MvError)('MV_FAULT', 'render env: CLEAN differs from l1.LIGHT', { code: 'RENDER_ENV_CLEAN' });
    }
    checked = true;
  }
  return { name: CLEAN.name, source: 'clean', dir: CLEAN.dir.slice(), sun: CLEAN.sun.slice(), amb: CLEAN.amb.slice(), tune: null };
}

const unq = s => String(s).replace(/^"|"$/g, '');
const lc = s => unq(s).toLowerCase();
function kid(n, k) { return n && (n.kids || []).find(c => lc(c.k) === k) || null; }
function num(n, k, d) { const c = kid(n, k); const v = c && c.v.length ? Number(c.v[0]) : NaN; return Number.isFinite(v) ? v : d; }
// 0xAARRGGBB -> [r, g, b] / 255 (alpha dropped)
function rgb(n, k, d) {
  const c = kid(n, k);
  if (!c || !c.v.length) return d;
  const s = String(c.v[0]);
  const v = /^0x[0-9a-f]+$/i.test(s) ? parseInt(s.slice(2), 16) : Number(s);
  if (!Number.isFinite(v)) return d;
  return [((v >>> 16) & 255) / 255, ((v >>> 8) & 255) / 255, (v & 255) / 255];
}

function parsePreset(text, target, name) {
  let t = null;
  try { t = mats().tree(mats().strip(String(text))); } catch (e) { return { error: 'unreadable: ' + (e && e.message || e) }; }
  if (!t) return { error: 'a quote is never closed' };
  const root = lc(t.k) === 'environment' ? t : kid(t, 'environment');
  const light = root ? kid(root, 'light') : (lc(t.k) === 'light' ? t : null);
  if (!light) return { error: 'no {light} block' };
  const dc = kid(light, 'direction');
  const dir = dc && dc.v.length >= 3 ? dc.v.slice(0, 3).map(Number) : null;
  if (!dir || !dir.every(Number.isFinite)) return { error: 'no light direction' };
  const sun = rgb(light, 'diffuse', null), amb = rgb(light, 'ambient', null);
  if (!sun || !amb) return { error: 'no diffuse or ambient colour' };
  const cc = kid(light, 'color_correction');
  const cs = cc ? kid(cc, 'color_shading') : null;
  const enable = !!(cs && kid(cs, 'enable'));
  let tune = null;
  if (cc) {
    if (target === 'goh') {
      const g = num(cc, 'gamma', 1);
      tune = { gamma: g > 0 ? g : 1, brightness: num(cc, 'brightness', 1), contrast: num(cc, 'contrast', 1), saturation: num(cc, 'saturation', 1),
        tone: rgb(cc, 'tone', [1, 1, 1]), toneStrength: num(cc, 'tone_strength', 0.1),
        shadeTone: rgb(cs, 'shade_tone', [75 / 255, 75 / 255, 75 / 255]), shadeIntensity: enable ? num(cs, 'intensity', 1) : 0 };
    } else {
      // engine defaults: tone_strength 0.1, shade 0xff4b4b4b ( [V])
      tune = { gamma: 1, brightness: 1, contrast: 1, saturation: 1, tone: [1, 1, 1], toneStrength: num(cc, 'tone_strength', 0.1),
        shadeTone: rgb(cs, 'shade_tone', [75 / 255, 75 / 255, 75 / 255]), shadeIntensity: enable ? 1 : 0 };
    }
  }
  return { name: name || 'preset', source: 'mode', dir, sun, amb, tune };
}

function lightOf(x) {
  if (!x || typeof x !== 'object' || !Array.isArray(x.dir) || x.dir.length !== 3 || !x.dir.every(Number.isFinite)) return null;
  const c3 = v => (typeof v === 'number' && Number.isFinite(v) ? [v, v, v] : Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v.slice() : null);
  const sun = c3(x.sun), amb = c3(x.amb);
  if (!sun || !amb) return null;
  if (Math.hypot(x.dir[0], x.dir[1], x.dir[2]) < 1e-9) return null;
  const t = x.tune || null;
  if (t && !(typeof t === 'object')) return null;
  return { name: x.name || 'given', source: x.source === 'clean' || x.source === 'mode' ? x.source : 'given', dir: x.dir.slice(), sun, amb, tune: t ? Object.assign({}, t) : null };
}

function worldSun(light) {
  const d = light.dir, n = Math.hypot(d[0], d[1], d[2]);
  const u = [d[0] / n, d[1] / n, d[2] / n];
  if (Math.abs(u[2]) < 1e-5) return [0, 0, 1];
  return [-u[0], u[1], -u[2]];
}

function envLight(src, doc, mode) {
  const gaps = [], notes = [], files = {};
  const modes = (doc && doc.modes) || [];
  let m = null;
  if (mode) m = modes.find(x => x.id === mode) || null;
  else { m = modes.find(x => x.env) || null; if (m) notes.push('no mode given: the environment of mode ' + m.id + ' is used'); }
  const target = (src && src.target) || (doc && doc.game) || null;
  const miss = why => { gaps.push('RENDER_ENV_MISSING'); notes.push(why + '; clean daylight used'); return { light: clean(), gaps, notes, files }; };
  if (!m) return miss(mode ? 'mode ' + mode + ' not found' : 'no mode names an environment');
  if (!m.env) return miss('mode ' + m.id + ' names no environment');
  const name = lc(m.env).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.set$/, '');
  const key = 'resource/set/environment/' + name + '.set';
  const buf = src && src.has && src.has(key) ? src.read(key) : null;
  if (!buf) return miss('environment preset ' + name + ' absent');
  files[key] = sha1(buf);
  const p = parsePreset(buf.toString('latin1'), target, name);
  if (p.error) return miss('environment preset ' + name + ' unreadable (' + p.error + ')');
  if (p.sun.every(v => v === 0) && p.amb.every(v => v === 0)) {
    gaps.push('RENDER_ENV_PLACEHOLDER');
    notes.push('environment preset ' + name + ' has a black diffuse and ambient (a placeholder); clean daylight used');
    return { light: clean(), gaps, notes, files };
  }
  return { light: p, gaps, notes, files };
}

// one copy of the tune maths: the kernel's (it holds no relative require, so the code lives there)
const tune = (r, g, b, t, out) => require('./l4tile').tune(r, g, b, t, out);

module.exports = { CLEAN, clean, envLight, parsePreset, lightOf, worldSun, tune };
