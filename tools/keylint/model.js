// keylint model: shared by learn.js and keylint.js. block shape of an sdlx tree.
//   kindOf(vkey)  -> 'def' | 'mi' | 'set/breed.set' | 'map.set' ...   (vocabulary scope)
//   parts(b, isRoot) -> { keyTok, key, toks[], kids[], groups }   MOD forms are transparent (both branches); disabled blocks skipped
//   keyName(tok) -> folded path element: ident lower | '*s' (string key) | '#n' (number key) | '*a' (anonymous)
//   sigOf(tok)   -> I int, F float literal, X arithmetic float, S string, T ident, P unreplaced %param
// Author: Imperator_Aug (ARSENAL, ia-d22f742f)
const MAX_DEPTH = 14;

function kindOf(vkey) {
  const p = vkey.split('/'), b = p[p.length - 1], i = b.lastIndexOf('.'), ext = i < 0 ? '' : b.slice(i + 1).toLowerCase();
  if (p[1] === 'set') return 'set' + (p.length > 3 ? '/' + p[2] : '') + '.' + ext;
  if (GENERIC.has(ext)) return ext;                       // same vocabulary wherever the file lives (mtl differs per dir only in usage)
  return (p.length > 2 ? p[1] : '') + '.' + ext;
}
const GENERIC = new Set(['def', 'ext', 'inc', 'def1', 'mdl', 'mtl', 'mi']);

const sigOf = t => t.k === 'INTEGER' ? 'I' : t.k === 'FLOAT' ? (t.expr ? 'X' : 'F') : t.k === 'STRING' ? 'S' : t.k === 'IDENT' ? (t.text[0] === '%' ? 'P' : 'T') : '?';
function keyName(t) {
  if (!t) return '*a';
  if (t.k === 'IDENT') return t.text.toLowerCase();
  if (t.k === 'STRING') return '*s';
  return '#n';
}

function parts(b, isRoot) {
  const items = [], grp = [];
  let gid = 0;
  (function fl(list, g) {
    for (const it of list) {
      if (it.k === 'MOD') { fl(it.items, ++gid); continue; }
      items.push(it); grp.push(g);
    }
  })(b.items, 0);
  let i = 0, keyTok = null;
  if (!isRoot && items.length && items[0].k !== 'BLOCK') { keyTok = items[0]; i = 1; }
  const toks = [], kids = [], groups = [];
  for (; i < items.length; i++) {
    if (items[i].k === 'BLOCK') { if (!items[i].disabled) { kids.push(items[i]); groups.push(grp[i]); } } else toks.push(items[i]);
  }
  let key = keyName(keyTok);
  if (key === 'extender' && toks[0] && toks[0].k === 'STRING') key = 'extender:' + toks[0].value.toLowerCase();   // keys depend on the extender type
  return { keyTok, key, toks, kids, groups };
}

// partsM(b) = parts(b, false), kept on the block (a symbol key: not in JSON or Object.keys) while memo(true); keylint only, whose
// trees are never changed after the parse. memo(on) -> the old setting. Off (KEYLINT_FAST=0): parts every call, as before
const PK = Symbol('keylint.parts');
let MEMO = process.env.KEYLINT_FAST !== '0';
function memo(on) { const was = MEMO; MEMO = !!on; return was; }
const fast = () => MEMO;   // keylint's speed-ups on (KEYLINT_FAST, default on)
function partsM(b) {
  if (!MEMO) return parts(b, false);
  return b[PK] || (b[PK] = parts(b, false));
}

// recursive nesting (bone/bone/bone, if/if) collapses: a child with the same key as its parent shares the parent's path
const childPath = (p, key) => !p ? key : (p === key || p.length > key.length && p.endsWith(key) && p.charCodeAt(p.length - key.length - 1) === 47) ? p : p + '/' + key;

const hexColor = s => /^(0x)?[0-9a-f]{6}$|^(0x)?[0-9a-f]{8}$/i.test(s);
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9;
  const d = []; for (let j = 0; j <= b.length; j++) d[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}
function nearest(name, cands) {
  let best = null, bd = 9;
  const lim = name.length <= 4 ? 1 : 2;
  const bare = name.replace(/[0-9]+/g, '');
  for (const c of cands) { if (c[0] === '*' || c[0] === '#' || c.replace(/[0-9]+/g, '') === bare) continue;   // numbered families (window1/window22) are data, not typos
 const d = lev(name, c); if (d < bd) { bd = d; best = c; } }
  return bd <= lim ? best : null;
}

module.exports = { MAX_DEPTH, kindOf, sigOf, keyName, parts, partsM, memo, fast, childPath, hexColor, lev, nearest };
