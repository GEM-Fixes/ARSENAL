// lintrc: suppression file for tools/ reports. JSON file named `.lintrc`:
//   {"ignore":[{"code":"WARN_X","path":"glob?","line":N?,"reason":"..."}], "severity":{"CODE":"info|warning|error|off"}}
// find(startDir) -> path of nearest .lintrc walking up, or null
// load(file) -> rc {file, ignore:[..], severity:{}}; throws Error on bad file
// apply(rc, kept, infos) -> {kept, infos, suppressed:[{f, reason}], unused:[entry]} ; lists hold {rel,line,code,msg}
//   ignore entry matches when code equal (or "*") AND path glob matches rel (or basename when glob has no '/') AND line equal if given
//   severity off -> suppressed; info -> moved to infos (not counted); warning/error -> only changes json/sarif severity (sev map)
// glob: * = any but '/', ** = any, ? = one char
// Author: Imperator_Aug (ARSENAL, ia-829265b5)
const fs = require('fs'), path = require('path');

const SEVS = ['info', 'warning', 'error', 'off'];

function find(start) {
  let d = path.resolve(start);
  try { if (fs.statSync(d).isFile()) d = path.dirname(d); } catch (e) { /* nonexistent: use as-is */ }
  for (;;) {
    const f = path.join(d, '.lintrc');
    try { if (fs.statSync(f).isFile()) return f; } catch (e) { /* none here */ }
    const p = path.dirname(d);
    if (p === d) return null;
    d = p;
  }
}

function load(file) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (e) { throw new Error(`bad .lintrc ${file}: ${e.message}`); }
  const bad = m => { throw new Error(`bad .lintrc ${file}: ${m}`); };
  if (!j || typeof j !== 'object' || Array.isArray(j)) bad('top level must be an object');
  const ignore = j.ignore === undefined ? [] : j.ignore, severity = j.severity === undefined ? {} : j.severity;
  if (!Array.isArray(ignore)) bad('"ignore" must be an array');
  if (!severity || typeof severity !== 'object' || Array.isArray(severity)) bad('"severity" must be an object');
  ignore.forEach((e, i) => {
    if (!e || typeof e !== 'object') bad(`ignore[${i}] must be an object`);
    if (typeof e.code !== 'string' || !e.code) bad(`ignore[${i}].code must be a non-empty string`);
    if (e.path !== undefined && typeof e.path !== 'string') bad(`ignore[${i}].path must be a string`);
    if (e.line !== undefined && !Number.isInteger(e.line)) bad(`ignore[${i}].line must be an integer`);
    if (e.reason !== undefined && typeof e.reason !== 'string') bad(`ignore[${i}].reason must be a string`);
  });
  for (const [c, s] of Object.entries(severity)) if (!SEVS.includes(s)) bad(`severity.${c} must be one of ${SEVS.join('|')}`);
  return { file, ignore, severity };
}

function globRe(g) {
  let s = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') { if (g[i + 1] === '*') { s += '.*'; i++; } else s += '[^/]*'; }
    else if (c === '?') s += '.';
    else s += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + s + '$', 'i');
}

function apply(rc, kept, infos) {
  const res = rc.ignore.map(e => ({ e, re: e.path ? globRe(e.path.split('\\').join('/')) : null, used: false }));
  const match = f => {
    const rel = String(f.rel).split('\\').join('/');
    for (const r of res) {
      const e = r.e;
      if (e.code !== '*' && e.code !== f.code) continue;
      if (e.line !== undefined && e.line !== f.line) continue;
      if (r.re && !(r.re.test(rel) || (!e.path.includes('/') && r.re.test(rel.split('/').pop())))) continue;
      r.used = true;
      return e.reason || '';
    }
    return null;
  };
  const suppressed = [], k = [], inf = [];
  for (const f of kept) {
    const why = match(f);
    if (why !== null) { suppressed.push({ f, reason: why }); continue; }
    const sv = rc.severity[f.code];
    if (sv === 'off') suppressed.push({ f, reason: 'severity off' });
    else if (sv === 'info') inf.push(f);
    else k.push(f);
  }
  for (const f of infos) {
    const why = match(f);
    if (why !== null) suppressed.push({ f, reason: why, info: true });
    else if (rc.severity[f.code] === 'off') suppressed.push({ f, reason: 'severity off', info: true });
    else inf.push(f);
  }
  const unused = res.filter(r => !r.used).map(r => r.e);
  return { kept: k, infos: inf, suppressed, unused };
}

module.exports = { find, load, apply, SEVS };
