// portdiff per-file porting checks (PORT-01/03/05/07/10). raw-text checks on the (hash-fixed) file text, tree checks on the sdlx root.
// each returns [{ln, code, msg}]. WARN_ = unverified heuristic (limits rows are [V] but the trigger is a proxy).
// Author: Imperator_Aug (ARSENAL, ia-d70953c3)
const M = require('../keylint/model');

const stripComment = l => { const i = l.indexOf(';'); return i < 0 ? l : l.slice(0, i); };   // good enough: ';' inside strings is rare in these keys

// GoH `{##/* ... */}`: a disabled block whose first token is punctuation; the engine skips it, our strict reader rejects '/*'. blank it (newlines kept).
function stripDisabledBlocks(s) {
  if (!s.includes('{##')) return s;
  let out = '', i = 0;
  while (i < s.length) {
    const j = s.indexOf('{##', i);
    if (j < 0) { out += s.slice(i); break; }
    out += s.slice(i, j);
    if (/[A-Za-z_]/.test(s[j + 3] || '')) { out += '{##'; i = j + 3; continue; }
    let d = 0, k = j, inStr = false;
    for (; k < s.length; k++) {
      const c = s[k];
      if (inStr) { if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } }
    }
    out += s.slice(j, k).replace(/[^\r\n]/g, ' ');
    i = k;
  }
  return out;
}

// text checks: PORT-01 hardness keys, PORT-03 armor health custom, PORT-05 macro vs per-volume thickness
function textChecks(text, isGoh) {
  const res = [], lines = text.split(/\r?\n/);
  let ovm = 0, ovmLn = 0, hard = 0, hardLn = 0, cust = 0, custLn = 0, macro = 0, macroLn = 0, thick = 0, thickLn = 0;
  lines.forEach((raw, i) => {
    const l = stripComment(raw);
    if (/\(\s*define\b/.test(l)) return;
    if (/overmatchCalibre|_slope_multipliers"/i.test(l)) { if (!ovm++) ovmLn = i + 1; }
    if (/\{\s*(CastSteel|HighHardness)\b/i.test(l)) { if (!hard++) hardLn = i + 1; }
    if (/\(\s*"armor health custom"/.test(l)) { if (!cust++) custLn = i + 1; }
    const m = l.match(/\(\s*"armor_\w+"([^;]*)/);
    if (m && /[1-9]/.test(m[1])) { if (!macro++) macroLn = i + 1; }
    if (/\{\s*thickness\s+[0-9.]*[1-9]/.test(l)) { if (!thick++) thickLn = i + 1; }
  });
  if (ovm) res.push({ ln: ovmLn, code: "WARN_PORT_OVERMATCH_CALIBRE", msg: `overmatchCalibre / *_slope_multipliers x${ovm}: per-shell slope tables the game has no such key (only calibre/projectileDamageThreshold/OvermatchDamping) (PORT-02)` });
  if (hard) res.push({ ln: hardLn, code: 'WARN_PORT_HARDNESS_NO_ENGINE', msg: `{CastSteel}/{HighHardness} x${hard}: no engine support, strength bonus lost (PORT-01)` });
  if (cust) res.push({ ln: custLn, code: 'WARN_PORT_ARMOR_HEALTH_CUSTOM', msg: `"armor health custom" x${cust}: filler formula the game has no such key (PORT-03)` });
  if (macro && thick && !isGoh)   // engine rule: GoH macros of the same name carry other args 
    res.push({ ln: macroLn, code: 'WARN_PORT_ARMOR_MACRO_OVERRIDES_THICKNESS', msg: `armor_* macro with nonzero args (line ${macroLn}) overrides per-volume {thickness} (line ${thickLn}, x${thick}): edit the macro args (PORT-05)` });
  return res;
}

const num = t => t && (t.k === 'INTEGER' || t.k === 'FLOAT') ? t.value : null;
function walk(b, isRoot, depth, fn) {
  const p = M.parts(b, isRoot);
  fn(p, b);
  if (depth < M.MAX_DEPTH) for (const c of p.kids) walk(c, false, depth + 1, fn);
}

// tree checks: PORT-10 bone speed units; PORT-07 pen-table tags (returned for the cross-game vocabulary compare)
function treeChecks(root, file) {
  const res = [], pen = [];
  walk(root, true, 0, (p, b) => {
    if (p.key === 'bone' && !/.mdl$/.test(file || '') && p.kids.some(k => M.parts(k, false).key === 'limits')) {   // ik/parametric bones only: .mdl bones spin props with their own speed
      for (const c of p.kids) {
        if (file && c.file && c.file !== file) continue;   // came from an include: reported with its own file
        const cp = M.parts(c, false);
        if (cp.key !== 'speed' && cp.key !== 'speed2') continue;
        const v = num(cp.toks[0]);
        if (v === null) continue;
        const a = Math.abs(v);
        if (cp.key === 'speed' && a > 1) res.push({ ln: c.line, code: 'WARN_PORT_BONE_SPEED_UNITS', msg: `bone {speed ${v}} is rad-scaled (x2865 = deg/s => ${Math.round(a * 2865)} deg/s); GoH-style deg/s belongs in {speed2} (PORT-10)` });
        if (cp.key === 'speed2' && a > 0 && a < 0.02) res.push({ ln: c.line, code: 'WARN_PORT_BONE_SPEED_UNITS', msg: `bone {speed2 ${v}} is deg/s (looks rad-scaled, ${(a * 2865).toFixed(1)} deg/s if it were {speed}) (PORT-10)` });
      }
    }
    if (p.key === 'parameters' && p.toks[0] && p.toks[0].k === 'STRING' && p.kids.some(c => M.parts(c, false).key === 'projectiledamagetable'))
      pen.push({ ln: b.line, tags: p.toks[0].value.toLowerCase().split(/\s+/).filter(w => w && !w.includes('%')) });
  });
  return { res, pen };
}

// AS2 ammo-tag vocabulary: words of set/stuff file names + {from}/{tag}/{parameters} strings
function vocabOf(key, root, vocab) {
  const base = key.slice(key.lastIndexOf('/') + 1).toLowerCase();
  for (const w of base.split('.')) if (w) vocab.add(w);
  walk(root, true, 0, p => {
    if (p.key === 'from' || p.key === 'tag' || p.key === 'parameters') for (const t of p.toks) if (t.k === 'STRING') for (const w of t.value.toLowerCase().split(/\s+/)) if (w && !w.includes('%')) vocab.add(w);
  });
}

// PORT-07: GoH pen-table tag words with no exact AS2 tag. -> [{tag, near, n, e}]
function penTagDiff(gohPen, vocab) {
  const V = new Set(vocab), by = new Map();
  for (const f of gohPen) for (const w of f.tags) {
    if (V.has(w) || !/^[a-z]/.test(w)) continue;
    const r = by.get(w) || by.set(w, { tag: w, n: 0, e: f.file, ln: f.ln }).get(w);
    r.n++;
  }
  const out = [...by.values()];
  for (const r of out) { const near = r.tag.length < 3 ? '' : [...V].filter(v => v.length >= 3 && v !== r.tag && (v.startsWith(r.tag) || r.tag.startsWith(v))).sort((a, b) => a.length - b.length)[0]; r.near = near || ''; }
  return out.sort((a, b) => b.n - a.n || (a.tag < b.tag ? -1 : 1));
}

module.exports = { stripDisabledBlocks, textChecks, treeChecks, vocabOf, penTagDiff };
