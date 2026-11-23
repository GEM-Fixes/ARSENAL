// mcp mod group, shared helpers (tools/mcp/tools/mod.js and mod/units.js). No IO at require time.
//   tmpDir()                 scratch folder: env ARSENAL_TMP, else <os temp>/arsenal-mcp (made on first use)
//   tmpFile(tag, ext)        a new file name in it (not created)
//   childEnv()               { TEMP, TMP } for child tools when ARSENAL_TMP is set (their own scratch then lands there too)
//   need(ctx, g)             g.dir, or a refusal naming the env variable that sets the install
//   exe(g)                   ['--exe', g.exe]
//   dirArg(ctx, v, what, must)   an absolute folder path given by the caller (refusal: empty, starts with '-', relative, not there)
//   names(ctx, list, what)   a list of mod names for --mods: no ',', no leading '-'
//   readJson(file)           parsed JSON of a scratch file the child wrote, then the file is removed; null when unreadable
//   reportOf(stdout)         the lib/report JSON a tool prints with --format json -> { total, counts, findings, info } | null
//   sumReport(j, n)          -> { total, counts (top 15 codes), findings (first n, { code, file, line, msg }), more }
//   list(arr, n, hint)       -> { rows, total, more, hint? }: a long list cut with a count and how to narrow
//   compact(v, o)            deep copy with arrays cut to o.arr (default 12, + {more: N}) and texts cut to o.str (default 300)
//   tail(text, n)            the last n non-empty lines
//   wouldRefuse(ctx, p)      for a preview: the plain reason a write to p would be refused, or null (the 'preview only' reason is not one)
// Author: Imperator_Aug (ARSENAL, ia-d2bcb607)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');

let TMP = null;
function tmpDir() {
  const want = process.env.ARSENAL_TMP && path.isAbsolute(process.env.ARSENAL_TMP) ? process.env.ARSENAL_TMP : path.join(os.tmpdir(), 'arsenal-mcp');
  if (TMP !== want) { fs.mkdirSync(want, { recursive: true }); TMP = want; }
  return TMP;
}
let SEQ = 0;
const tmpFile = (tag, ext) => path.join(tmpDir(), tag + '-' + process.pid + '-' + Date.now().toString(36) + '-' + (SEQ++) + (ext || '.json'));
const childEnv = () => (process.env.ARSENAL_TMP && path.isAbsolute(process.env.ARSENAL_TMP) ? { TEMP: tmpDir(), TMP: tmpDir() } : undefined);

const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };

function need(ctx, g) {
  if (g.dir) return g.dir;
  throw ctx.refusal('no ' + g.name + ' install was found. Set the environment variable ' + (g.kind === 'goh' ? 'ARSENAL_GOH_DIR' : 'ARSENAL_AS2_DIR') + ' to the game folder, or set the folder in the ARSENAL GUI');
}
const exe = g => ['--exe', g.exe];
function dirArg(ctx, v, what, must) {
  ctx.name(v, what);
  const s = v.trim();
  if (!path.isAbsolute(s)) throw ctx.refusal(what + ': give the full path, not a relative one: ' + s);
  const a = path.resolve(s);
  if (must !== false && !isDir(a)) throw ctx.refusal(what + ' was not found: ' + a);
  return a;
}
function names(ctx, v, what) {
  if (v == null) return [];
  const a = Array.isArray(v) ? v : String(v).split(',');
  const out = [];
  for (const x of a) {
    if (typeof x !== 'string') throw ctx.refusal(what + ' must be a list of names');
    const s = x.trim(); if (!s) continue;
    ctx.name(s, what);
    if (s.includes(',')) throw ctx.refusal(what + ': a name may not hold a comma: ' + s);
    out.push(s);
  }
  return out;
}
function readJson(file) {
  let j = null;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { j = null; }
  try { fs.rmSync(file, { force: true }); } catch (e) { /* not written */ }
  return j;
}
function reportOf(stdout) {
  const s = String(stdout || ''), i = s.indexOf('{');
  if (i < 0) return null;
  let j = null;
  try { j = JSON.parse(s.slice(i)); } catch (e) {
    const k = s.lastIndexOf('}');
    try { j = JSON.parse(s.slice(i, k + 1)); } catch (e2) { return null; }
  }
  if (!j || typeof j !== 'object' || !Array.isArray(j.findings)) return null;
  return j;
}
const short = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '...' : s; };
function sumReport(j, n) {
  n = n > 0 ? n : 20;
  const counts = Object.entries(j.counts || {}).sort((a, b) => b[1] - a[1]);
  const f = (j.findings || []).slice(0, n).map(x => ({ code: x.code, file: short(x.file, 160), line: x.line || 0, msg: short(x.msg, 240) }));
  const total = j.total != null ? j.total : (j.findings || []).length;
  return { total, counts: Object.fromEntries(counts.slice(0, 15)), codes: counts.length, findings: f, more: Math.max(0, (j.findings || []).length - f.length) };
}
function list(arr, n, hint) {
  n = n > 0 ? n : 40;
  const out = { rows: arr.slice(0, n), total: arr.length, more: Math.max(0, arr.length - n) };
  if (out.more && hint) out.hint = hint;
  return out;
}
function compact(v, o, depth) {
  o = o || {}; depth = depth || 0;
  const A = o.arr || 12, S = o.str || 300;
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return short(v, S);
  if (v instanceof Map) v = Object.fromEntries(v);
  if (Array.isArray(v)) {
    const a = v.slice(0, A).map(x => compact(x, o, depth + 1));
    if (v.length > A) a.push({ more: v.length - A });
    return a;
  }
  if (typeof v === 'object') {
    if (depth > 6) return '[...]';
    const out = {};
    for (const k of Object.keys(v)) { if (k.startsWith('_') || typeof v[k] === 'function' || v[k] === undefined) continue; out[k] = compact(v[k], o, depth + 1); }
    return out;
  }
  return undefined;
}
const tail = (text, n) => String(text || '').split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean).slice(-(n || 15));
function wouldRefuse(ctx, p) {
  const why = ctx.guard && ctx.guard.canWrite ? ctx.guard.canWrite(p) : null;
  return why && !/^preview only/.test(why) ? why : null;
}
const sha = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);

module.exports = { tmpDir, tmpFile, childEnv, isDir, isFile, need, exe, dirArg, names, readJson, reportOf, sumReport, list, compact, tail, wouldRefuse, short, sha };
