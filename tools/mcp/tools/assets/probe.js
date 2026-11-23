#!/usr/bin/env node
// mcp assets probe: the child process of tools/mcp/tools/assets.js for the answers that come from a library, not from a command
// line. It mounts a game view, so it runs apart from the server (ctx.run('mcp', [cmd, json], { script: 'tools/assets/probe.js' })).
//   node tools/mcp/tools/assets/probe.js <cmd> '<json options>'      prints one JSON object, exit 0 (an { error } is an answer)
//   model    { target, game, exe, mods, modDir }   tools/lib/model/sceneload load + tools/soedit/stage collect:
//            -> { key, entity, bones, meshes, volumes, sequences, files, unresolved, bounds, problems, missing }
//   anims    { target, game, exe, mods, modDir }   the model's sequences (lib/model/mdl) + each .anm header (lib/anm parseHeader)
//   texture  { file | key, game, exe, mods, modDir }   lib/model/dds parse (dds) or artport dims (png, tga, gif) + the '#' variants beside it
//   refs     { name, game, exe, mods, folder, budgetMs }   tools/ide/intel refsAsync: where a name is used (entity index + text search)
// Reads only. Nothing is written by this file; the libraries keep their own caches (entity index, game view) where they always do.
// Author: Imperator_Aug (ARSENAL, ia-e0f1c00c)
'use strict';
const fs = require('fs'), path = require('path');
const T = path.resolve(__dirname, '..', '..', '..');
const fwd = p => String(p).replace(/\\/g, '/');
const lc = s => String(s == null ? '' : s).toLowerCase();
const round = v => Math.round(v * 100) / 100;

function open(o) {
  const stage = require(path.join(T, 'soedit', 'stage'));
  return stage.openSource({ game: o.game, mods: o.mods || [], modDir: o.modDir || undefined, exe: o.exe });
}
const layerOf = (src, key) => { const r = src.v && src.v.files.get(key); return r ? r.layer : 'file'; };

function loadModel(o) {
  const sceneload = require(path.join(T, 'lib', 'model', 'sceneload'));
  const r = sceneload.load(o.target, { game: o.game, mods: o.mods || [], modDir: o.modDir || undefined, exe: o.exe });
  if (!r || r.error) return { error: (r && r.error) || 'the model could not be read' };
  return r;
}

function model(o) {
  const r = loadModel(o); if (r.error) return r;
  const stage = require(path.join(T, 'soedit', 'stage'));
  const s = r.scene || {}, src = open(o);
  let c;
  try { c = stage.collect(src, r.key); } finally { /* closed below */ }
  const files = [], unresolved = (c && c.unresolved) || [];
  if (c && c.files) for (const [key, f] of c.files) files.push({ key, kind: f.kind, layer: layerOf(src, key) });
  try { src.close(); } catch (e) { /* closed */ }
  try { if (r.files && r.files.close) r.files.close(); } catch (e) { /* closed */ }
  const faces = m => (m.ply && Array.isArray(m.ply.parts) ? m.ply.parts.reduce((n, p) => n + (p.faceCount || 0), 0) : 0);
  const mats = m => (m.ply && Array.isArray(m.ply.parts) ? [...new Set(m.ply.parts.map(p => p.material).filter(Boolean))] : []);
  const seq = ((r.model && r.model.sequences) || []).map(q => ({ name: q.name, file: q.file || null }));
  return {
    key: r.key, entity: r.entity || null, error: c && c.error ? c.error : undefined,
    bones: (s.bones || []).map(b => ({ path: b.path, visible: b.visible !== false })),
    meshes: (s.meshes || []).map(m => ({ bone: m.bone, file: m.file, kind: m.kind, faces: faces(m), vertices: m.ply && m.ply.vertices ? m.ply.vertices.count : 0, skinned: !!(m.ply && m.ply.skin), materials: mats(m) })),
    volumes: (s.volumes || []).map(v => ({ id: v.id, kind: v.kind, file: v.file || null })),
    obstacles: (s.obstacles || []).length, areas: (s.areas || []).length,
    sequences: seq, files, unresolved,
    bounds: s.bounds && s.bounds.min ? { min: s.bounds.min.map(round), max: s.bounds.max.map(round) } : null,
    missing: s.missing || [], problems: s.problems || [],
  };
}

function anims(o) {
  const r = loadModel(o); if (r.error) return r;
  const stage = require(path.join(T, 'soedit', 'stage')), anm = require(path.join(T, 'lib', 'anm'));
  const src = open(o), c = stage.collect(src, r.key, { textures: 'none' });
  const rows = [];
  if (c && c.files) for (const [key, f] of c.files) {
    if (f.kind !== 'anm') continue;
    const g = src.get(key), h = g ? anm.parseHeader(g.buf) : { error: 'not read' };
    rows.push({ key, name: path.posix.basename(key).replace(/\.anm$/i, ''), layer: layerOf(src, key), size: g ? g.buf.length : 0, version: h.version, frames: h.frames, bones: h.boneCount, error: h.error || undefined });
  }
  const missing = ((c && c.unresolved) || []).filter(u => u.kind === 'anm').map(u => ({ name: u.name, tried: u.tried }));
  const seq = ((r.model && r.model.sequences) || []).map(q => ({ name: q.name, file: q.file || null }));
  try { src.close(); } catch (e) { /* closed */ }
  try { if (r.files && r.files.close) r.files.close(); } catch (e) { /* closed */ }
  return { key: r.key, entity: r.entity || null, sequences: seq, files: rows, missing };
}

function texture(o) {
  let buf = null, key = null, layer = null, sibs = [];
  if (o.file) {
    try { buf = fs.readFileSync(o.file); } catch (e) { return { error: 'the file could not be read: ' + fwd(o.file) }; }
    key = fwd(o.file);
    try { sibs = fs.readdirSync(path.dirname(o.file)).map(n => fwd(path.join(path.dirname(o.file), n))); } catch (e) { sibs = []; }
  } else {
    const src = open(o);
    let k = lc(fwd(o.key)).replace(/^\/+/, '');
    if (!k.startsWith('resource/')) k = 'resource/' + k;
    const exts = /\.[a-z0-9]+$/.test(k) ? [''] : ['.dds', '.tga', '.ebm', '.bmp', '.tex', '.jpg', '.png'];
    const hit = exts.map(e => k + e).find(x => src.has(x));
    if (!hit) { try { src.close(); } catch (e) { /* closed */ } return { error: 'no such texture in the game or the named mods: ' + k + (exts.length > 1 ? ' (tried ' + exts.join(' ') + ')' : '') }; }
    const g = src.get(hit); buf = g.buf; key = hit; layer = layerOf(src, hit);
    sibs = src.keysIn(hit.slice(0, hit.lastIndexOf('/') + 1));
    try { src.close(); } catch (e) { /* closed */ }
  }
  const ext = path.extname(key).toLowerCase(), out = { key, layer, size: buf.length, kind: ext.slice(1) };
  if (buf.length > 4 && buf.toString('latin1', 0, 4) === 'DDS ') {
    const d = require(path.join(T, 'lib', 'model', 'dds')).parse(buf);
    Object.assign(out, { kind: 'dds', width: d.width, height: d.height, mips: d.mips, format: d.format || null, note: d.error || undefined });
  } else {
    let dm = null; try { dm = require(path.join(T, 'artport', 'artport')).dims(buf); } catch (e) { dm = null; }
    if (dm) Object.assign(out, { width: dm[0], height: dm[1] }); else out.note = 'the size of this file kind is not read here';
  }
  // variants: <stem>#<x>.<ext> beside <stem>.<ext> (the texture variants a model's material can switch to)
  const base = lc(path.posix.basename(key)), stem = base.replace(/\.[a-z0-9]+$/, '').replace(/#[^#]*$/, '');
  out.stem = stem;
  out.variants = [...new Set(sibs.map(x => lc(path.posix.basename(x))).filter(n => { const s = n.replace(/\.[a-z0-9]+$/, ''); return s === stem || s.startsWith(stem + '#'); }))].sort();
  return out;
}

async function refs(o) {
  const I = require(path.join(T, 'ide', 'intel'));
  const ictx = { gameDir: o.game, exe: o.exe, mods: o.mods || [] };
  if (o.folder) ictx.folder = o.folder;
  const r = await I.refsAsync({ key: 'resource/x.def', text: '' }, { name: o.name }, ictx, { budgetMs: o.budgetMs || 20000 });
  return { name: r.name, kind: r.kind, hits: (r.hits || []).map(h => ({ at: String(h.link || '').replace(/^key:/, ''), where: h.where, text: String(h.text || '').slice(0, 200) })), truncated: !!r.truncated, why: r.why || null, building: !!r.building };
}

async function main(argv) {
  let o; try { o = JSON.parse(argv[1] || '{}'); } catch (e) { o = null; }
  const cmds = { model, anims, texture, refs };
  let out;
  if (!o || !cmds[argv[0]]) out = { error: 'usage: probe.js model|anims|texture|refs <json>' };
  else { try { out = await cmds[argv[0]](o); } catch (e) { out = { error: String(e && e.message || e).slice(0, 400) }; } }
  fs.writeSync(1, JSON.stringify(out));
  process.exit(0);
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { model, anims, texture, refs };
