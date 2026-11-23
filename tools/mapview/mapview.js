#!/usr/bin/env node
// mapview: map.net ASCII (or SVG) preview.  direction #8.
//   node tools/mapview/mapview.js <map.net | map folder | --game G [--exe as64|mowas_2|mowas2|goh] [--mods a,b] --map multi/<group>/<map>>
//        [--width N=100] [--layer type|material|height] [--entities] [--ents-from mi|map|all] [--legend] [--flip] [--svg out.svg] [-q]
//   --exe (with --map): the game whose file set is read (lib/vfs exe). none = as before (as64.exe in the folder -> as64). mowas_2 on the
//     shared AS2 install leaves as64/core out; goh with no --game reads the GoH install (lib/cli). Map files themselves are read the same.
//     --exe and no --game (none in AS2_GAME / as2.json either): the install of that game from lib/games install.
// Downsample: N columns, block = w/N cells wide, 2x that tall (terminal cell ~1:2). Per block the char of the winning
//   type (layer type|material); non-default ids weigh x3 against the most common id so thin roads survive. height layer = digits 0-9
//   over min..max ground height, ' ' = no ground (<= -1000).
// chars by name: ground . road = country_road - water ~ shallow_water , building # forest/tree ^ rock o sand : grass " puddle ;
//   other names/ids -> a-z by id. --entities: Entity "<def>" 0xUID {Position x y} from the folder's .mi (or map file) as the def's
//   first letter, upper case. World pos -> cell: cx = (x + offX) / cell, cy = (y + offY) / cell  (world rect of vanilla maps
//   = [-offX, w*cell-offX], matches Clip world) in MAP UNITS (MAP-16: units/metre unresolved); y up/down unverified [T] -> --flip.
// codes (counted): MAPVIEW_BAD_ARGS MAPVIEW_NO_MAP MAPVIEW_NET_<mapnet problem code> ; WARN_MAPVIEW_ENT_OUTSIDE (entities off the grid [I])
// Author: Imperator_Aug (ARSENAL, ia-d3f44eb6)
const fs = require('fs'), path = require('path');
const cli = require('../lib/cli'), mapnet = require('../lib/mapnet'), { createReport } = require('../lib/report');

const NAMECH = { ground: '.', road: '=', country_road: '-', water: '~', shallow_water: ',', building: '#', forest: '^', tree: '^',
  rock: 'o', sand: ':', grass: '"', puddle: ';' };
const COLOR = { '.': '#8a7', '=': '#555', '-': '#996', '~': '#25c', ',': '#6ad', '#': '#a33', '^': '#262', o: '#999', ':': '#ec8', '"': '#4a4', ';': '#48a' };

function charFor(m, layer, id) {
  const nm = layer === 'material' ? mapnet.materialName(m, id) : mapnet.typeName(m, id);
  if (nm && NAMECH[nm.toLowerCase()]) return NAMECH[nm.toLowerCase()];
  if (nm) for (const k of ['water', 'road', 'forest', 'tree', 'build', 'rock', 'sand']) if (nm.toLowerCase().includes(k))
    return NAMECH[k] || (k === 'build' ? '#' : '?');
  return String.fromCharCode(97 + id % 26);
}

// -> { rows:[string], width, legend:Map ch -> {name,count}, cols, nrows, bw, bh }
function render(m, o) {
  const N = Math.max(1, Math.min(o.width, m.width)), bw = m.width / N, bh = bw * 2, R = Math.max(1, Math.round(m.height / bh));
  const bhr = m.height / R, grid = [], legend = new Map(), layer = o.layer;
  let lo = Infinity, hi = -Infinity;
  if (layer === 'height') for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const h = mapnet.cellAt(m, x, y).height; if (h > mapnet.NO_GROUND) { if (h < lo) lo = h; if (h > hi) hi = h; }
  }
  for (let r = 0; r < R; r++) {
    const y0 = Math.floor(r * bhr), y1 = Math.max(y0 + 1, Math.floor((r + 1) * bhr)), line = [];
    for (let c = 0; c < N; c++) {
      const x0 = Math.floor(c * bw), x1 = Math.max(x0 + 1, Math.floor((c + 1) * bw));
      let ch;
      if (layer === 'height') {
        let sum = 0, n = 0;
        for (let y = y0; y < y1 && y < m.height; y++) for (let x = x0; x < x1 && x < m.width; x++) {
          const h = mapnet.cellAt(m, x, y); if (h && h.height > mapnet.NO_GROUND) { sum += h.height; n++; }
        }
        ch = n ? String(Math.min(9, Math.floor((sum / n - lo) / Math.max(1, hi - lo) * 10))) : ' ';
      } else {
        const cnt = new Map(); let tot = 0;
        for (let y = y0; y < y1 && y < m.height; y++) for (let x = x0; x < x1 && x < m.width; x++) {
          const cl = mapnet.cellAt(m, x, y); if (!cl) continue;
          const id = layer === 'material' ? cl.material : cl.type; cnt.set(id, (cnt.get(id) || 0) + 1); tot++;
        }
        let top = -1, ti = -1;
        for (const [id, n] of cnt) if (n > top) { top = n; ti = id; }
        let best = -1, bid = ti;
        for (const [id, n] of cnt) { const sc = id === ti ? n : n * 3; if (sc > best || (sc === best && id < bid)) { best = sc; bid = id; } }
        ch = tot ? charFor(m, layer, bid) : ' ';
        if (tot) { const e = legend.get(ch) || { name: (layer === 'material' ? mapnet.materialName(m, bid) : mapnet.typeName(m, bid)) || 'id' + bid, count: 0 }; e.count++; legend.set(ch, e); }
      }
      line.push(ch);
    }
    grid.push(line);
  }
  return { grid, legend, N, R, bw, bhr, lo, hi };
}

function readEnts(files, from) {
  const out = [], re = /Entity\s+"([^"]*)"\s+0x[0-9a-fA-F]+\s*\{\s*Position\s+(-?[\d.]+)\s+(-?[\d.]+)/g;
  for (const [name, buf] of files) {
    const isMi = /\.mi$/i.test(name);
    if (from === 'mi' && !isMi) continue;
    if (from === 'map' && isMi) continue;
    const t = buf.toString('latin1'); let mt; re.lastIndex = 0;
    while ((mt = re.exec(t))) out.push({ def: mt[1], x: +mt[2], y: +mt[3], file: name });
  }
  return out;
}

function overlay(m, r, ents, flip, rep, relName) {
  const used = new Map(); let outside = 0;
  for (const e of ents) {
    let cx = (e.x + m.offX) / m.cell, cy = (e.y + m.offY) / m.cell;
    if (flip) cy = m.height - cy;
    if (!(cx >= 0 && cy >= 0 && cx < m.width && cy < m.height)) { outside++; continue; }
    const c = Math.min(r.N - 1, Math.floor(cx / r.bw)), rr = Math.min(r.R - 1, Math.floor(cy / r.bhr));
    const ch = (e.def.match(/[A-Za-z]/) || ['E'])[0].toUpperCase();
    r.grid[rr][c] = ch; const u = used.get(ch) || { n: 0, ex: e.def }; u.n++; used.set(ch, u);
  }
  if (outside) rep.add(relName, 0, 'WARN_MAPVIEW_ENT_OUTSIDE', `${outside} of ${ents.length} entities fall outside the grid (units/offset/flip assumption [T], MAP-16)`);
  return used;
}

function svg(r, m) {
  const S = 6, p = [`<svg xmlns="http://www.w3.org/2000/svg" width="${r.N * S}" height="${r.R * S * 2}">`];
  r.grid.forEach((line, y) => line.forEach((ch, x) => {
    if (ch === ' ') return;
    const col = COLOR[ch] || (/\d/.test(ch) ? `hsl(${120 - ch * 12},40%,${30 + ch * 5}%)` : /[A-Z]/.test(ch) ? '#f0f' : '#c80');
    p.push(`<rect x="${x * S}" y="${y * S * 2}" width="${S}" height="${S * 2}" fill="${col}"/>`);
  }));
  p.push('</svg>'); return p.join('\n') + '\n';
}

// resolve input -> { net: Buffer, label, files: Map name->Buffer (.mi/map of the folder) } or null
function load(o, rep) {
  const files = new Map();
  const fromDir = d => { for (const f of fs.readdirSync(d)) if (/\.mi$/i.test(f) || /^map$/i.test(f)) files.set(f, fs.readFileSync(path.join(d, f))); };
  const pos = o.pos[0];
  if (o.x.map) {
    // --exe named and no install from --game / AS2_GAME / as2.json: the install of that game (lib/games install, Steam probe included)
    if (!o.gameDir && o.exe) o.gameDir = require('../lib/games').install(o.exe).dir || null;
    if (!o.gameDir) { rep.add('mapview', 0, 'MAPVIEW_BAD_ARGS', '--map needs --game'); return null; }
    const vfs = require('../lib/vfs');
    const v = vfs.build({ gameDir: o.gameDir, mods: o.mods, exe: o.exe });
    const pre = 'resource/map/' + o.x.map.replace(/\\/g, '/').replace(/^\/|\/$/g, '').toLowerCase() + '/';
    const rec = v.files.get(pre + 'map.net');
    if (!rec) { rep.add(o.x.map, 0, 'MAPVIEW_NO_MAP', 'no ' + pre + 'map.net in the game/mods'); return null; }
    for (const [k, r] of v.files) if (k.startsWith(pre) && !k.slice(pre.length).includes('/') && (/\.mi$/.test(k) || k === pre + 'map')) files.set(k.slice(pre.length), vfs.readRec(r));
    return { net: vfs.readRec(rec), label: o.x.map, files };
  }
  if (!pos) { rep.add('mapview', 0, 'MAPVIEW_BAD_ARGS', 'need <map.net|folder> or --game G --map <name>'); return null; }
  let st; try { st = fs.statSync(pos); } catch (e) { rep.add(pos, 0, 'MAPVIEW_NO_MAP', 'not found'); return null; }
  const dir = st.isDirectory() ? pos : path.dirname(pos), net = st.isDirectory() ? path.join(pos, 'map.net') : pos;
  if (!fs.existsSync(net)) { rep.add(pos, 0, 'MAPVIEW_NO_MAP', 'no map.net'); return null; }
  fromDir(dir);
  return { net: fs.readFileSync(net), label: pos, files };
}

const USAGE = 'usage: ARSENAL mapview <map.net | map folder | --game G [--exe as64|mowas_2|goh] [--mods a,b] --map multi/<group>/<map>> [--width N=100] [--layer type|material|height]\n       [--entities] [--ents-from mi|map|all] [--legend] [--flip] [--svg out.svg] [-q]';
function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); return; }
  const o = cli.parse(argv, { flags: ['--entities', '--legend', '--flip'], values: ['--map', '--width', '--layer', '--svg', '--ents-from'] });
  const rep = createReport(), out = [];
  const bad = m => { rep.add('mapview', 0, 'MAPVIEW_BAD_ARGS', m); };
  o.width = o.x.width === undefined ? 100 : Number(o.x.width);
  o.layer = o.x.layer || 'type';
  const from = o.x['ents-from'] || 'mi';
  if (!(o.width >= 1 && o.width <= 2000)) bad('--width must be 1..2000');
  else if (!['type', 'material', 'height'].includes(o.layer)) bad('--layer must be type|material|height');
  else if (!['mi', 'map', 'all'].includes(from)) bad('--ents-from must be mi|map|all');
  else {
    const L = load(o, rep);
    if (L) {
      const m = mapnet.parse(L.net);
      for (const p of m.problems) rep.add(L.label, 0, 'MAPVIEW_' + p.code, p.msg);
      if (m.width > 0 && m.height > 0 && m.cells.length >= m.width * m.height * m.bytesPer) {
        const r = render(m, { width: o.width, layer: o.layer });
        let used = null;
        if (o.x.entities) used = overlay(m, r, readEnts(L.files, from), o.x.flip, rep, L.label);
        out.push(`${L.label}: ${m.width}x${m.height} cells of ${m.cell} units, v${m.version}, layer ${o.layer} -> ${r.N}x${r.R}`);
        for (const l of r.grid) out.push(l.join('').replace(/\s+$/, ''));
        if (o.x.legend) {
          if (o.layer === 'height') out.push(`legend: 0..9 = height ${r.lo}..${r.hi}, ' ' = no ground`);
          else for (const [ch, e] of [...r.legend].sort((a, b) => b[1].count - a[1].count)) out.push(`  ${ch}  ${e.name} (${Math.round(e.count * 100 / (r.N * r.R))}%)`);
          if (used) for (const [ch, u] of [...used].sort()) out.push(`  ${ch}  entities x${u.n} e.g. ${u.ex}`);
        }
        if (o.x.svg) fs.mkdirSync(path.dirname(path.resolve(o.x.svg)), { recursive: true }); if (o.x.svg) fs.writeFileSync(o.x.svg, svg(r, m));
      }
    }
  }
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  cli.printReport(rep, o, { tool: "mapview", byCode: false });
  process.exitCode = rep.count ? 1 : 0;
}

module.exports = { render, readEnts, overlay, svg, main };
if (require.main === module) cli.run(() => main(process.argv.slice(2)));
