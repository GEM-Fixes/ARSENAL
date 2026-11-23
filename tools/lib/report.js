// report: shared output contract + file walking for tools/.
// finding: `<rel>[:<line>]: <CODE> <msg>`; info (not counted): `info: <rel>[:<line>]: <CODE> <msg>`; then `N findings`
// API: rep = createReport(); rep.add(rel,line,code,msg); rep.info(...) (not counted); rep.count; rep.counts{code:n}
//   rep.toJSON({tool}) -> {tool,version:1,findings:[{file,line,code,msg,severity}],info:[..],counts,total}
//     severity: WARN_ prefix 'warning', info 'note', else 'error'
//   rep.toSarif({tool}) -> SARIF 2.1.0 (runs[0].tool.driver.rules from codes; results ruleId/level/message/locations)
//   --limits / ARSENAL_LIMITS=1 / meta.limits: json records get limit:[ids] (+ kind:'tool'), sarif results properties {limit, kind} (lib/limmap)
//   rep.toCsv() -> RFC4180 `file,line,code,severity,msg` (findings + info as 'note'); rep.toHtml({tool}) -> self-contained page
//   rep.print({format:'text'|'json'|'sarif'|'csv'|'html', output:file|null, meta:{tool}, byCode, showInfo, summary, rc}) text = legacy bytes
// .lintrc (lib/lintrc.js): rep.setRc(rc) or print({rc}) applies suppressions before counting. Suppressed findings are not counted
//   (rep.count/counts/total exclude them); text adds `N suppressed` after `N findings` (only when >0); json adds `suppressed:[..]`
//   + `suppressedCount`, sarif results carry `suppressions`; unused ignore entry -> info RC_UNUSED_SUPPRESSION. No rc = legacy output
// walkFiles(root,re) relPath(root,f) each(files,root,rep,fn) countOutput(text)
// Author: Imperator_Aug (ARSENAL, ia-cc09c35d)
const fs = require('fs'), path = require('path');
const lintrc = require('./lintrc');

const defSev = c => c.startsWith('WARN_') ? 'warning' : 'error';
// --limits (argv) or env ARSENAL_LIMITS=1, or meta.limits true/false: json findings get "limit":[ids] (+ "kind":"tool"), sarif results
// get properties {limit, kind}. Off by default: output byte-equal. ids from lib/limmap (meta.limmap = a limmap.load() instance for tests)
const limitsOn = meta => meta.limits !== undefined ? !!meta.limits : (process.env.ARSENAL_LIMITS === '1' || process.argv.slice(2).includes('--limits'));
const limTag = meta => {
  if (!limitsOn(meta)) return null;
  let lm = meta.limmap; if (!lm) { try { lm = require('./limmap'); } catch { lm = null; } }
  return code => { const e = lm && lm.limitOf(code), o = { limit: e ? e.lim : [] }; if (e && e.kind === 'tool') o.kind = 'tool'; return o; };
};

function createReport() {
  const raw = [], rawInfo = [];
  let rc = null;
  const fmt = (f) => `${f.rel}${f.line ? ':' + f.line : ''}: ${f.code} ${f.msg}`;
  const tally = xs => { const c = {}; for (const f of xs) c[f.code] = (c[f.code] || 0) + 1; return c; };
  // view: findings after .lintrc (identity when no rc)
  const view = () => {
    if (!rc) return { kept: raw, infos: rawInfo, suppressed: [] };
    const r = lintrc.apply(rc, raw, rawInfo);
    const rcName = path.basename(rc.file);
    for (const e of r.unused) {
      r.infos = r.infos.concat([{ rel: rcName, line: 0, code: 'RC_UNUSED_SUPPRESSION',
        msg: `unused ignore entry {${e.code}${e.path ? ' ' + e.path : ''}${e.line !== undefined ? ':' + e.line : ''}}` }]);
    }
    return r;
  };
  const sevOf = f => { const s = rc && rc.severity[f.code]; return s === 'warning' || s === 'error' ? s : defSev(f.code); };
  const rep = {
    add(rel, line, code, msg) { raw.push({ rel, line: line || 0, code, msg }); rep.counts[code] = (rep.counts[code] || 0) + 1; },
    info(rel, line, code, msg) { rawInfo.push({ rel, line: line || 0, code, msg }); },
    setRc(r) { rc = r || null; },
    get count() { return view().kept.length; },
    counts: {},
    toJSON(meta = {}) {
      const v = view(), lt = limTag(meta);
      const rec = (f, severity) => { const r = { file: f.rel, line: f.line, code: f.code, msg: f.msg, severity }; return lt ? Object.assign(r, lt(f.code)) : r; };
      const o = {
        tool: meta.tool || null, version: 1,
        findings: v.kept.map(f => rec(f, sevOf(f))),
        info: v.infos.map(f => rec(f, 'note')),
        counts: rc ? tally(v.kept) : Object.assign({}, rep.counts), total: v.kept.length,
      };
      if (rc) {
        o.suppressed = v.suppressed.map(s => Object.assign(rec(s.f, s.info ? 'note' : sevOf(s.f)), { reason: s.reason }));
        o.suppressedCount = v.suppressed.length;
      }
      return o;
    },
    toSarif(meta = {}) {
      const v = view(), lt = limTag(meta);
      const all = v.kept.map(f => [f, sevOf(f)]).concat(v.infos.map(f => [f, 'note']));
      const sup = v.suppressed.map(s => [s.f, s.info ? 'note' : sevOf(s.f), s.reason]);
      const ids = [...new Set(all.concat(sup).map(([f]) => f.code))].sort();
      return {
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
        runs: [{
          tool: { driver: { name: meta.tool || 'tools', rules: ids.map(id => ({ id })) } },
          results: all.concat(sup).map(([f, level, why]) => {
            const r = {
              ruleId: f.code, level, message: { text: f.msg },
              locations: [{ physicalLocation: { artifactLocation: { uri: String(f.rel).split('\\').join('/') }, region: { startLine: f.line > 0 ? f.line : 1 } } }],
            };
            if (why !== undefined) r.suppressions = [{ kind: 'external', justification: why }];
            if (lt) r.properties = lt(f.code);
            return r;
          }),
        }],
      };
    },
    toCsv({ showInfo = true } = {}) {
      const v = view(), q = x => { x = String(x); return /[",\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
      const rows = [['file', 'line', 'code', 'severity', 'msg']];
      for (const f of v.kept) rows.push([f.rel, f.line, f.code, sevOf(f), f.msg]);
      if (showInfo) for (const f of v.infos) rows.push([f.rel, f.line, f.code, 'note', f.msg]);
      return rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
    },
    toHtml(meta = {}, { showInfo = true } = {}) {
      const v = view(), esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const title = esc(meta.tool || 'tools') + ' report';
      const groups = {};
      for (const f of v.kept) (groups[f.code] = groups[f.code] || []).push([f, sevOf(f)]);
      if (showInfo) for (const f of v.infos) (groups[f.code] = groups[f.code] || []).push([f, 'note']);
      const codes = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length || (a < b ? -1 : 1));
      const sup = v.suppressed.length ? `, ${v.suppressed.length} suppressed` : '';
      let h = `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${title}</title>\n<style>body{font:14px sans-serif;margin:1em}table{border-collapse:collapse;margin-bottom:1em}` +
        `td,th{border:1px solid #ccc;padding:2px 6px;text-align:left}th{background:#eee}.error{color:#b00}.warning{color:#a60}.note{color:#666}</style></head>\n<body>\n<h1>${title}</h1>\n` +
        `<p>${v.kept.length} findings${sup}</p>\n<ul>\n`;
      for (const c of codes) h += `<li>${esc(c)}: ${groups[c].length}</li>\n`;
      h += '</ul>\n';
      for (const c of codes) {
        h += `<h2>${esc(c)} (${groups[c].length})</h2>\n<table><tr><th>file</th><th>line</th><th>severity</th><th>msg</th></tr>\n`;
        for (const [f, s] of groups[c]) h += `<tr><td>${esc(f.rel)}</td><td>${f.line || ''}</td><td class="${s}">${s}</td><td>${esc(f.msg)}</td></tr>\n`;
        h += '</table>\n';
      }
      return h + '</body></html>\n';
    },
    print({ byCode = false, showInfo = true, summary = false, format = 'text', output = null, meta = {}, rc: rcOpt } = {}) {
      if (rcOpt !== undefined) rc = rcOpt || null;
      if (format === 'json' || format === 'sarif') {
        const o = format === 'json' ? this.toJSON(meta) : this.toSarif(meta);
        if (!showInfo) { if (format === 'json') o.info = []; else o.runs[0].results = o.runs[0].results.filter(r => r.level !== 'note'); }
        const txt = JSON.stringify(o, null, 2);
        if (output) fs.writeFileSync(output, txt + '\n'); else console.log(txt);
        return;
      }
      if (format === 'csv' || format === 'html') {
        const txt = format === 'csv' ? this.toCsv({ showInfo }) : this.toHtml(meta, { showInfo });
        if (output) fs.writeFileSync(output, txt); else process.stdout.write(txt);
        return;
      }
      if (output) { // text to file: same lines, captured
        const ls = [], orig = console.log;
        console.log = (...a) => ls.push(a.join(' '));
        try { this.print({ byCode, showInfo, summary }); } finally { console.log = orig; }
        fs.writeFileSync(output, ls.join('\n') + '\n');
        return;
      }
      const v = view(), n = v.kept.length;
      const tail = () => {
        console.log(`${n} findings`);
        if (v.suppressed.length) console.log(`${v.suppressed.length} suppressed`);
        if (byCode) console.log('by code: ' + JSON.stringify(rc ? tally(v.kept) : rep.counts));
      };
      if (summary) {
        printSummary(v.kept, '');
        if (showInfo) printSummary(v.infos, 'info: ');
        tail();
        return;
      }
      if (showInfo) for (const f of v.infos) console.log('info: ' + fmt(f));
      for (const f of v.kept) console.log(fmt(f));
      tail();
    },
  };
  return rep;
}

// --summary: one line per code (most first): count, top subjects (first `{key`/"key"/`key` in msg, else first 2 words),
// top dirs (first 3 path parts). triage view of big outputs without reading every line
function printSummary(list, prefix, top = 4) {
  const by = {};
  for (const f of list) (by[f.code] = by[f.code] || []).push(f);
  const tally = xs => {
    const t = {};
    for (const x of xs) t[x] = (t[x] || 0) + 1;
    return Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, n]) => `${k}×${n}`).join(' ');
  };
  const total = {}; // capped hints: `... N more CODE hints hidden` → add N, drop the line
  for (const [code, xs] of Object.entries(by)) {
    total[code] = xs.length;
    by[code] = xs.filter(f => { const m = f.msg.match(/^\.\.\. (\d+) more /); if (m) total[code] += +m[1] - 1; return !m; });
  }
  for (const [code, fs_] of Object.entries(by).sort((a, b) => total[b[0]] - total[a[0]])) {
    const subj = fs_.map(f => { const m = f.msg.match(/[{"`]([^\s"`{}]+)/); return m ? m[1] : f.msg.split(' ').slice(0, 2).join(' '); });
    const dirs = fs_.map(f => f.rel.split('/').slice(0, -1).slice(0, 3).join('/') || '.');
    const shown = total[code] > fs_.length ? ` (tops of ${fs_.length} shown)` : '';
    console.log(`${prefix}${code} ${total[code]}${shown} | ${tally(subj)} | ${tally(dirs)}`);
  }
}

// sorted recursive file list under root matching re
function walkFiles(root, re) {
  const acc = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (re.test(e.name)) acc.push(p);
    }
  })(root);
  return acc.sort();
}

const relPath = (root, f) => path.relative(root, f).split(path.sep).join('/');

// run fn(file) per file; an exception becomes a CRASH finding instead of killing the run
function each(files, root, rep, fn) {
  for (const f of files) {
    try { fn(f); } catch (e) { rep.add(relPath(root, f), 0, 'CRASH', e.message); }
  }
}

// parse a tool's printed output back into counts (golden, doctor): finding lines `path[:line]: CODE msg`, info lines
// skipped; total from the `N findings` line when present. first = first finding line per code
function countOutput(text) {
  const codes = {}, first = {};
  for (const l of text.split(/\r?\n/)) {
    if (l.startsWith('info:')) continue;
    const m = l.match(/^\S.*?: ([A-Z][A-Z0-9_]+) /);
    if (m) { codes[m[1]] = (codes[m[1]] || 0) + 1; if (!first[m[1]]) first[m[1]] = l; }
  }
  const t = text.match(/^(\d+) findings$/m);
  return { total: t ? +t[1] : Object.values(codes).reduce((a, b) => a + b, 0), codes, first };
}

module.exports = { createReport, walkFiles, relPath, each, countOutput };
