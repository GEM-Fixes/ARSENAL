#!/usr/bin/env node
// mcp scripts probe: the child process of tools/mcp/tools/scripts.js for the answers that come from a library, not from a command
// line (ctx.run('mcp', [cmd, json], { script: 'tools/scripts/probe.js' })).
//   node tools/mcp/tools/scripts/probe.js <cmd> '<json options>'     prints one JSON object, exit 0 (an { error } is an answer)
//   refs      { name, game, exe, mods, folder, budgetMs }   tools/ide/intel refsAsync: where a word or name is used
//   triggers  { file | key, game, exe, mods, modDir, goh }  a .mi read with tools/misdiff parseMi (lib/sdlx), its Helpers triggers laid
//             out; every command and term is looked up in the milint vocabulary (tools/milint/mi.js vocab: micommands.json, GoH delta)
//   lua       { file | dir, max }                           tools/ide/intel/lua luaCheck on one .lua or every .lua under a folder
// Reads only. Nothing is written by this file.
// Author: Imperator_Aug (ARSENAL, ia-a25084c9)
'use strict';
const fs = require('fs'), path = require('path');
const T = path.resolve(__dirname, '..', '..', '..');
const fwd = p => String(p).replace(/\\/g, '/');
const lc = s => String(s == null ? '' : s).toLowerCase();
const cut = (s, n) => (s.length > n ? s.slice(0, n) + '...' : s);

async function refs(o) {
  const I = require(path.join(T, 'ide', 'intel'));
  const ictx = { gameDir: o.game, exe: o.exe, mods: o.mods || [] };
  if (o.folder) ictx.folder = o.folder;
  const r = await I.refsAsync({ key: 'resource/x.def', text: '' }, { name: o.name }, ictx, { budgetMs: o.budgetMs || 20000 });
  return { name: r.name, kind: r.kind, hits: (r.hits || []).map(h => ({ at: String(h.link || '').replace(/^key:/, ''), where: h.where, text: String(h.text || '').slice(0, 200) })), truncated: !!r.truncated, why: r.why || null, building: !!r.building };
}

// one block back as text, short: {name v v {kid ..}}
function ser(n, depth) {
  const head = (n.name == null ? '' : String(n.name)) + (n.vals.length ? ' ' + n.vals.map(v => v.text).join(' ') : '');
  if (!n.kids.length) return '{' + head + '}';
  if (depth <= 0) return '{' + head + ' ..}';
  return '{' + head + ' ' + n.kids.map(k => ser(k, depth - 1)).join(' ') + '}';
}
function triggers(o) {
  let buf = null, name = null;
  if (o.file) { try { buf = fs.readFileSync(o.file); } catch (e) { return { error: 'the file could not be read: ' + fwd(o.file) }; } name = fwd(o.file); }
  else {
    const stage = require(path.join(T, 'soedit', 'stage'));
    const src = stage.openSource({ game: o.game, mods: o.mods || [], modDir: o.modDir || undefined, exe: o.exe });
    let k = lc(fwd(o.key)).replace(/^\/+/, ''); if (!k.startsWith('resource/')) k = 'resource/' + k;
    const g = src.has(k) ? src.get(k) : null;
    let near = [];
    if (!g) { const d = k.slice(0, k.lastIndexOf('/') + 1); near = src.keysIn(d).filter(x => /\.mi$/.test(x)).slice(0, 20); }
    try { src.close(); } catch (e) { /* closed */ }
    if (!g) return { error: 'no such mission file in the game or the named mods: ' + k, near };
    buf = g.buf; name = k;
  }
  const { parseMi } = require(path.join(T, 'misdiff', 'misdiff')), { vocab } = require(path.join(T, 'milint', 'mi'));
  const V = vocab(o.goh ? 'goh' : 'as2');
  const top = parseMi(buf, name), kid = (n, x) => n.kids.find(c => lc(c.name) === x);
  const helpers = kid(top, 'helpers');
  const defs = { events: 0, zones: 0, waypoints: 0, tasks: 0, vars: 0, functions: 0 };
  const out = [];
  if (helpers) for (const h of helpers.kids) {
    const n = lc(h.name);
    if (n === 'event') defs.events++; else if (n === 'zone') defs.zones++; else if (n === 'zones') defs.zones += h.kids.length;
    else if (n === 'waypoints' || n === 'tasks' || n === 'vars' || n === 'functions') defs[n] += h.kids.length;
    if (n !== 'triggers') continue;
    for (const t of h.kids) {
      const row = { name: t.name, line: t.line, disabled: !!kid(t, 'disabled'), autoreset: !!kid(t, 'autoreset'), expression: null, terms: [], actions: [], unknown: [] };
      for (const c of t.kids) if (!V.triggerKeys.has(c.name)) row.unknown.push('trigger key ' + c.name);
      const cond = kid(t, 'condition');
      if (cond) {
        const ex = kid(cond, 'expression'); if (ex && ex.vals.length) row.expression = String(ex.vals[0].value);
        const terms = kid(cond, 'terms');
        if (terms) for (const x of terms.kids) {
          const m = /^(\d+)\.(.+)$/.exec(String(x.name)), kind = m ? m[2] : String(x.name);
          const known = V.terms.has(lc(kind));
          if (!known) row.unknown.push('term ' + kind);
          row.terms.push({ n: m ? Number(m[1]) : null, kind, known, line: x.line, text: cut(x.kids.map(k => ser(k, 1)).join(' '), 160) });
        }
      }
      const acts = kid(t, 'actions');
      // the walk of tools/milint/mi.js statements(): a condition or selector is no action; a statement's own fields (time, count ..) are not actions
      const BLOCKS = new Set(['if', 'while', 'loop', 'switch', 'case', 'default', 'select', 'thread']);
      const walk = (block, depth, nested) => {
        for (const s of block.kids) {
          if (s.name === null) continue;
          const name = String(s.name), w = lc(name);
          if (w === 'condition' || w === 'selector') continue;
          const isBlock = BLOCKS.has(w) || (w === 'delay' && s.kids.some(c => V.commands.has(lc(c.name))));
          if (!isBlock && nested && V.fields.has(name)) continue;
          const what = V.commands.has(w) && !isBlock ? 'command' : (isBlock || V.statements.has(w)) ? 'statement' : 'unknown';
          if (what === 'unknown') row.unknown.push('action ' + name);
          const fields = s.kids.filter(k => !(what === 'statement' && (V.commands.has(lc(k.name)) || BLOCKS.has(lc(k.name)) || V.statements.has(lc(k.name)))));
          row.actions.push({ cmd: name, what, depth, line: s.line, text: cut(fields.map(k => ser(k, 1)).join(' '), 160) });
          if (what === 'statement') walk(s, depth + 1, true);
        }
      };
      if (acts) walk(acts, 0, false);
      out.push(row);
    }
  }
  return { file: name, helpers: !!helpers, defs, triggers: out };
}

function lua(o) {
  const { luaCheck } = require(path.join(T, 'ide', 'intel', 'lua'));
  const files = [], max = o.max > 0 ? o.max : 400;
  let cutAt = false;
  if (o.file) files.push(o.file);
  else (function walk(d, depth) {
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of es) {
      if (files.length >= max) { cutAt = true; return; }
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 12 && e.name !== '.git' && e.name !== '.arsenal') walk(p, depth + 1); }
      else if (/\.lua$/i.test(e.name)) files.push(p);
    }
  })(o.dir, 0);
  const rows = [];
  for (const f of files) {
    let text; try { text = fs.readFileSync(f, 'latin1'); } catch (e) { rows.push({ file: fwd(f), error: 'could not be read' }); continue; }
    rows.push({ file: fwd(f), lines: text.split('\n').length, findings: luaCheck(text) });
  }
  return { files: rows, cut: cutAt };
}

async function main(argv) {
  let o; try { o = JSON.parse(argv[1] || '{}'); } catch (e) { o = null; }
  const cmds = { refs, triggers, lua };
  let out;
  if (!o || !cmds[argv[0]]) out = { error: 'usage: probe.js refs|triggers|lua <json>' };
  else { try { out = await cmds[argv[0]](o); } catch (e) { out = { error: String(e && e.message || e).slice(0, 400) }; } }
  fs.writeSync(1, JSON.stringify(out));
  process.exit(0);
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { refs, triggers, lua };
