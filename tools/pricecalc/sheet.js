// pricecalc/sheet: reads the owner's price sheet, dumped as cell TSVs (`<cell>\t<value>[\t<formula>]`, one cell per line).
//   readSheets(mpFile, cpFile) -> { classes[{id,label,tiers[{id,label,mp[10],cp[10],items[],mpLine,cpLine}]}], shovel, addons{}, singles{},
//     sequence, panels[{nation,name,vehicle,modifier,calc,old,line}], breeds Map 'side/breed' -> {mp,cp,line}, fixedCp[], defects[{file,line,msg}] }
//   Never throws on sheet defects: they become defects[] (SHEET_DEFECT).
// Author: Imperator_Aug (ARSENAL, ia-2330418f)
const fs = require('fs'), path = require('path');

const colNum = s => { let n = 0; for (const c of s) n = n * 26 + (c.charCodeAt(0) - 64); return n; };
function readCells(file) {
  const cells = new Map();
  const txt = fs.readFileSync(file).toString('utf8');
  txt.split(/\r?\n/).forEach((ln, i) => {
    const m = /^([A-Z]{1,3})(\d+)\t([^\t]*)/.exec(ln);
    if (m) cells.set(m[1] + m[2], { v: m[3].replace(/\s+$/, ''), line: i + 1 });
  });
  return cells;
}
const colName = n => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const numOf = v => { if (v === undefined || v === null) return null; const s = String(v).trim(); return /^-?\d+(\.\d*)?$/.test(s) || /^-?\.\d+$/.test(s) ? parseFloat(s) : null; };

// sheet class label -> id (pricing/model weapon classes); shovel is an equipment price, not a class
const CLASS_IDS = [[/^smg$/, 'smg'], [/^at$/, 'at'], [/^rifles?$/, 'rifles'], [/^machine ?guns?$/, 'mg'], [/^at ?rifles?$/, 'at_rifles'],
  [/^rifle ?grenades?$/, 'rifle_grenades'], [/^flame/, 'flame'], [/^light ?mortar/, 'light_mortar'], [/^snipers?$/, 'snipers'],
  [/^carbines?$/, 'carbines'], [/^auto ?rifles?$/, 'auto_rifle'], [/^radio$/, 'radio'], [/^pzf$/, 'pzf'], [/^shovel$/, 'shovel']];
const classId = label => { const l = String(label).toLowerCase().trim(); for (const [re, id] of CLASS_IDS) if (re.test(l)) return id; return null; };
function tierId(label) {
  const l = String(label).toLowerCase().trim();
  if (/^vet/.test(l)) return 'vet';
  if (/smoke/.test(l)) return 'smoke_only';
  const m = /^(low|medium|high)\b\s*(?:\(([^)]*)\))?/.exec(l);
  if (m) return m[2] && /jap/.test(m[2]) ? m[1] + '_jap' : m[1];
  return l.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || null;
}

// one table region: rows from..to, value columns c0..c0+9; returns classes with tiers
function readTables(cells, rowFrom, rowTo, c0, withItems, file, defects, kind) {
  const classes = [];
  let cur = null;
  for (let r = rowFrom; r <= rowTo; r++) {
    const a = cells.get('A' + r), label = a ? a.v : '';
    const vals = [];
    for (let i = 0; i < 10; i++) { const c = cells.get(colName(c0 + i) + r); vals.push(c ? c.v : ''); }
    const isHeader = vals.some(v => /^level\s*\d+$/i.test(v));
    const nums = vals.map(numOf), hasNum = nums.some(x => x !== null);
    const cid = label ? classId(label) : null;
    if (cid) { cur = { id: cid, label: label.trim(), tiers: [], line: a.line }; classes.push(cur); if (!hasNum || isHeader) continue; }
    if (!cur || isHeader || !hasNum) continue;
    let tid = cid ? (cid === 'radio' ? 'radio' : 'medium') : label ? tierId(label) : null;
    if (!tid) tid = cur.id === 'radio' ? (cur.tiers.length ? 'callin' : 'radio') : cur.tiers.length ? 'tier' + (cur.tiers.length + 1) : 'medium';
    for (let i = 0; i < 10; i++) {
      const raw = vals[i];
      if (raw && nums[i] === null) defects.push({ file, line: (cells.get(colName(c0 + i) + r) || {}).line || 0, msg: `${kind} table ${cur.label} ${label || tid} level ${i + 1}: not a number "${raw}"` });
    }
    const t = { id: tid, label: (label || tid).trim(), vals: nums, line: (a && a.line) || (cells.get(colName(c0) + r) || {}).line || 0 };
    if (withItems) { const b = cells.get('B' + r); t.items = !b ? [] : numOf(b.v) !== null ? [String(numOf(b.v))] : b.v.split(',').map(s => s.trim()).filter(Boolean); t.itemsLine = b ? b.line : 0; }
    if (cur.id === 'snipers' && kind === 'cp') { const e = cells.get(colName(c0 + 10) + r); if (e && numOf(e.v) !== null) t.elite = numOf(e.v); }
    cur.tiers.push(t);
  }
  return classes;
}

function readSheets(mpFile, cpFile) {
  const defects = [];
  const out = { classes: [], shovel: null, addons: {}, singles: {}, sequence: null, panels: [], breeds: new Map(), fixedCp: [], defects, files: { mp: mpFile, cp: cpFile } };
  const mpRel = mpFile ? path.basename(mpFile) : null, cpRel = cpFile ? path.basename(cpFile) : null;
  const mpCells = mpFile ? readCells(mpFile) : new Map(), cpCells = cpFile ? readCells(cpFile) : new Map();
  for (const [cells, rel] of [[mpCells, mpRel], [cpCells, cpRel]]) for (const [k, c] of cells) {
    if (/[^\x00-\x7f]/.test(c.v)) defects.push({ file: rel, line: c.line, msg: `cell ${k}: stray non-ASCII text "${c.v}" (mojibake)` });
    if (/^#N\/A/.test(c.v) && !/^[OPQ]\d+$/.test(k)) defects.push({ file: rel, line: c.line, msg: `cell ${k}: #N/A` });
  }
  // MP tab: tables A..L (values C..L, items B) above row 70
  let mpMax = 0; for (const k of mpCells.keys()) { const m = /^A(\d+)$/.exec(k); if (m) mpMax = Math.max(mpMax, +m[1]); }
  const mpClasses = readTables(mpCells, 3, Math.max(mpMax, 3) + 2, 3, true, mpRel, defects, 'mp');
  // CP tab: "CP (Stand In)" starts the cp tables (values B..K); the MP copy above it is ignored
  let cpStart = 0, cpEnd = 0;
  for (const [k, c] of cpCells) { const m = /^A(\d+)$/.exec(k); if (!m) continue; if (/^cp\b/i.test(c.v)) cpStart = +m[1]; if (/^singles$/i.test(c.v)) cpEnd = +m[1]; }
  const cpClasses = cpStart ? readTables(cpCells, cpStart + 1, (cpEnd || cpStart + 80) - 1, 2, false, cpRel, defects, 'cp') : [];
  for (const c of mpClasses) {
    if (c.id === 'shovel') { const t = c.tiers[0]; out.shovel = t ? t.vals.find(x => x !== null) : null; continue; }
    const cc = cpClasses.find(x => x.id === c.id);
    const cls = { id: c.id, label: c.label, tiers: [] };
    for (const t of c.tiers) {
      const ct = cc && (cc.tiers.find(x => x.id === t.id) || (cc.tiers.length === 1 ? cc.tiers[0] : null));
      cls.tiers.push({ id: t.id, label: t.label, mp: t.vals, cp: ct ? ct.vals : new Array(10).fill(null), items: t.items || [], line: t.line, itemsLine: t.itemsLine, cpElite: ct && ct.elite });
      // stray value: a cp cell at MP scale
      if (ct) { const big = ct.vals.map((v, i) => v !== null && v >= 10 ? 'level ' + (i + 1) + ' = ' + v : null).filter(Boolean); if (big.length) defects.push({ file: cpRel, line: ct.line, msg: `cp table ${c.label} ${t.label}: ${big.join(', ')}: value at MP scale (stray value or MP table pasted as CP)` }); }
    }
    out.classes.push(cls);
  }
  // modifiers: row 1 labels, row 2 values, columns P.. (add-ons, sequence, single multipliers)
  if (mpFile) for (let ci = colNum('P'); ci <= colNum('AJ'); ci++) {
    const l = mpCells.get(colName(ci) + '1'), v = mpCells.get(colName(ci) + '2');
    if (!l || !v) continue;
    const lab = l.v.toLowerCase();
    if (/^modifiers?$/.test(lab.trim())) continue;
    if (/seq/.test(lab)) { out.sequence = { label: l.v, values: v.v.split(/[ ,]+/).map(numOf).filter(x => x !== null), raw: v.v, line: v.line }; continue; }
    const n = numOf(v.v);
    if (n === null) { defects.push({ file: mpRel, line: v.line, msg: `modifier ${l.v}: not a number "${v.v}"` }); continue; }
    if (/single/.test(lab)) out.singles[l.v] = { value: n, line: v.line };
    else out.addons[l.v] = { value: n, line: v.line };
  }
  // price panels: (nation,name,vehicle,modifier,calc,old) column groups
  if (mpFile) {
    const groups = [['N', 'O', 'P', 'Q', 'R', 'S'], ['V', 'W', 'X', 'Y', 'Z', 'AA'], ['AD', 'AE', 'AF', 'AG', 'AH', 'AI']];
    let maxRow = 0; for (const k of mpCells.keys()) maxRow = Math.max(maxRow, +/\d+$/.exec(k)[0]);
    for (const g of groups) {
      let nation = null;
      for (let r = 5; r <= maxRow; r++) {
        const n = mpCells.get(g[0] + r); if (n && n.v) nation = n.v.trim();
        const nm = mpCells.get(g[1] + r); if (!nm || !nm.v) continue;
        const calc = mpCells.get(g[4] + r), mod = mpCells.get(g[3] + r), veh = mpCells.get(g[2] + r), old = mpCells.get(g[5] + r);
        const modN = mod ? numOf(String(mod.v).replace(/\*$/, '')) : null;
        out.panels.push({ nation, name: nm.v.trim(), vehicle: veh ? numOf(veh.v) : null, modifier: modN, calc: calc ? numOf(calc.v) : null, old: old ? numOf(old.v) : null, line: nm.line, single: /single/i.test(nation || '') });
        if (calc && calc.v && numOf(calc.v) === null) defects.push({ file: mpRel, line: calc.line, msg: `panel ${nation} "${nm.v.trim()}": calculated price "${calc.v}" not a number` });
      }
    }
  }
  // CP tab: breed list N..Q + singles table
  if (cpFile) {
    let maxRow = 0; for (const k of cpCells.keys()) maxRow = Math.max(maxRow, +/\d+$/.exec(k)[0]);
    for (let r = 3; r <= maxRow; r++) {
      const s = cpCells.get('N' + r), b = cpCells.get('O' + r);
      if (!s || !b || !b.v.trim()) continue;
      const p = cpCells.get('P' + r), q = cpCells.get('Q' + r);
      const mp = p ? numOf(p.v) : null, cp = q ? numOf(q.v) : null;
      const key = s.v.trim().toLowerCase() + '/' + b.v.trim().toLowerCase();
      if (mp === null || cp === null) defects.push({ file: cpRel, line: b.line, msg: `breed ${key}: score/cp not a number ("${p ? p.v : ''}" / "${q ? q.v : ''}", #N/A)` });
      else if (cp >= 10) defects.push({ file: cpRel, line: q.line, msg: `breed ${key}: cp ${cp} at MP scale (mp ${mp}): MP value pasted into the CP column` });
      out.breeds.set(key, { mp, cp: cp !== null && cp < 10 ? cp : null, rawCp: cp, line: b.line });
    }
    if (cpEnd) for (let r = cpEnd + 1; r <= cpEnd + 20; r++) {
      const a = cpCells.get('A' + r); if (!a || !a.v.trim()) continue;
      const s = cpCells.get('B' + r), ns = cpCells.get('C' + r);
      out.fixedCp.push({ label: a.v.trim(), single: s ? numOf(s.v) : null, notSingle: ns ? numOf(ns.v) : null, line: a.line });
    }
  }
  return out;
}

module.exports = { readSheets, readCells, classId, tierId, numOf };
