// DMGFIX: per-gun damage scale from the vanilla AS2 twin (stuffport --scale-damage auto). The class median (dmgscale.json) is a
// fallback: kwk43 ap pen is AS2/GoH 0.986 (233/236.25) but the gun class median is 0.851, so the class scale left the ported
// gun under-penetrating the is3, TTK 68 s vs vanilla 27 s). When the AS2 file the port replaces (or a
// same-name / same-calibre AS2 gun) exists in vanilla, the keys listed in table.twin.keys get ratio = vanilla value / ported GoH value.
// Values are read like run/dmgscale/pairs.js: vanilla through its {from "pattern ..."} chain (macros expanded), GoH from the
// ported text only (a key the port text lacks is not scaled anyway). codes SP_SCALE_TWIN WARN_SP_SCALE_TWIN_RANGE SP_SCALE_TWIN_NONE
// Author: Imperator_Aug (ARSENAL, ia-c40ac6b2)
'use strict';
function tree(s) {   // SDL text -> {name, args, kids}
  s = s.replace(/;[^\n]*/g, ''); let i = 0;
  function blk() {
    i++; const n = { args: [], kids: [] }; let first = true;
    while (i < s.length) {
      const c = s[i];
      if (c === '}') { i++; return n; }
      if (c === '{') { n.kids.push(blk()); continue; }
      if (/\s/.test(c)) { i++; continue; }
      let tok; if (c === '"') { let j = s.indexOf('"', i + 1); if (j < 0) j = s.length; tok = s.slice(i + 1, j); i = j + 1; } else { const m = /^[^\s{}"]+/.exec(s.slice(i)); tok = m ? m[0] : c; i += tok.length || 1; }
      if (first) { n.name = tok.toLowerCase(); first = false; } else n.args.push(tok);
    }
    return n;
  }
  const top = { kids: [] }; while (i < s.length) { if (s[i] === '{') top.kids.push(blk()); else i++; } return top;
}
function layer(text) {
  const t = tree(text), root = t.kids.find(k => k.name === 'from') || t.kids[0]; if (!root) return null;
  const own = {}, par = {}; let from = null;
  if (root.name === 'from') from = (root.args[0] || '').replace(/^pattern\s+/, '');
  for (const k of root.kids) {
    if (k.name === 'parameters') { for (const tg of (k.args[0] || '').split(/\s+/)) { par[tg] = par[tg] || {}; for (const kk of k.kids) par[tg][kk.name] = kk; } }
    else own[k.name] = k;
  }
  return { own, par, from };
}
// read(key) -> flattened text or null. returns [layer, ...] file first, then its patterns
function chain(read, key) {
  const out = []; let k = key, n = 0;
  while (k && n++ < 6) {
    const t = read(k); if (t == null) break; const L = layer(t); if (!L) break; out.push(L); if (!L.from) break;
    let dir = k.slice(0, k.lastIndexOf('/')), found = null;
    while (dir) { for (const c of [dir + '/' + L.from + '.pattern', dir + '/' + L.from]) if (c !== k && read(c) != null) { found = c; break; } if (found) break; dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : ''; }
    k = found;
  }
  return out;
}
const AP = ['ap', 'apc', 'apche', 'aphe', 'apbc', 'apbche', 'apcbc', 'apcbche', 'aphebc'];
function get(ch, name, ap) { for (const L of ch) { if (ap) for (const tg of AP) if (L.par[tg] && L.par[tg][name]) return L.par[tg][name]; if (L.own[name]) return L.own[name]; } return null; }
const num = n => n && n.args.length && isFinite(+n.args[0]) ? +n.args[0] : null;
const tab = n => { const p = n && n.kids[0]; const v = p ? +[p.name, ...p.args][1] : NaN; return isFinite(v) ? v : null; };
// key values the fit used (fit.js K): gun pen = ap table first y (else projectileDamage), small arms = base; healthDamage plain
function values(ch, cls) {
  const ap = cls === 'gun' || cls === 'autocannon';
  const t = get(ch, 'projectiledamagetable', ap);
  return { penetration: t ? tab(t) : num(get(ch, 'projectiledamage', ap)), healthDamage: num(get(ch, 'healthdamage', false)),
    rechargeTime: num(get(ch, 'rechargetime', false)), speed: num(get(ch, 'speed', ap)), range: num(get(ch, 'range', false)) };
}
// pick the vanilla twin key. asKey: AS2 key the port writes; gohKey: GoH key; list(dir) -> AS2 file keys in dir; calOf(key) -> calibre
function findTwin(asKey, gohKey, has, list, gohCal) {
  if (has(asKey)) return { key: asKey, how: 'same key' };
  const dir = asKey.slice(0, asKey.lastIndexOf('/')), gb = gohKey.slice(gohKey.lastIndexOf('/') + 1);
  if (has(dir + '/' + gb)) return { key: dir + '/' + gb, how: 'same name' };
  if (gohCal == null || !list) return null;
  // calibre: AS2 files in the dir whose name starts with the calibre ("88mm_", "7.62"), then one sharing a name token
  const c = String(Math.round(gohCal)), toks = new Set(gb.toLowerCase().split(/[_.\-]/).filter(x => x && !/^\d+mm$/.test(x)));
  const cands = list(dir).filter(k => { const b = k.slice(k.lastIndexOf('/') + 1); return !/\.(pattern|presets)$|^\./.test(b) && new RegExp('^' + c + '(mm)?[_.]').test(b); });
  const tok = cands.filter(k => k.slice(k.lastIndexOf('/') + 1).toLowerCase().split(/[_.\-]/).some(x => toks.has(x)));
  if (tok.length === 1) return { key: tok[0], how: 'calibre ' + c + ' + name token' };
  if (cands.length === 1) return { key: cands[0], how: 'calibre ' + c + ' (only one)' };
  return null;
}
// returns {over: {key: ratio}, twin} ; portedText: the GoH port text before scaling; readAs(key) -> flattened AS2 text
function twinScale(o) {
  const { table, cls, portedText, asKey, gohKey, readAs, list, log } = o;
  const tw = table.twin || {}, keys = tw.keys || [];
  if (!keys.length || !cls) return { over: {} };
  const g = values([layer(portedText) || { own: {}, par: {} }], cls);
  const t = findTwin(asKey, gohKey, k => readAs(k) != null, list, num(get([layer(portedText) || { own: {}, par: {} }], 'calibre', false)));
  if (!t) { log.push({ code: 'SP_SCALE_TWIN_NONE', msg: `no vanilla twin for ${asKey}; class scale for ${keys.join(' ')}` }); return { over: {} }; }
  const a = values(chain(readAs, t.key), cls), over = {}, lo = tw.min || 0.2, hi = tw.max || 5, msg = [];
  for (const k of keys) {
    if (!(a[k] > 0) || !(g[k] > 0)) continue;
    const r = Math.round(a[k] / g[k] * 1e6) / 1e6;   // 6 places: 70 x 2.857143 rounds back to 200
    if (r < lo || r > hi) { log.push({ code: 'WARN_SP_SCALE_TWIN_RANGE', msg: `${k} twin ratio ${r} (${a[k]}/${g[k]}) outside ${lo}..${hi}; class scale kept` }); continue; }
    over[k] = r; msg.push(`${k} ${a[k]}/${g[k]} = ${r}`);
  }
  log.push({ code: 'SP_SCALE_TWIN', msg: `twin ${t.key} (${t.how}): ${msg.join(', ') || 'no key with values on both sides; class scale'}` });
  return { over, twin: t.key };
}
module.exports = { tree, layer, chain, values, findTwin, twinScale };
