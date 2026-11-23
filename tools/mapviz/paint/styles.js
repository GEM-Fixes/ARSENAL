// paint styles (MV-PNT1): the style table (paint contract 4.2). cli.js reaches a style only through load(). Light at load.
//   TABLE                   [{id, dir:'paint/<id>', palette, load}]  literal; load() = the style's index.js, null when absent
//   load(id) -> module      MV_USAGE PAINT_STYLE_UNKNOWN (id not in TABLE); MV_NOT_BUILT PAINT_STYLE_NOT_BUILT (no index.js);
//                           MV_FAULT PAINT_STYLE_BROKEN (it throws, or lacks draw or an integer VERSION)
//   list() -> [{id, state:'built'|'not built'|'broken', version, palette:'styles.<key>', needs, wants}]
// The require spec is literal per row so the exe embeds each style (README 1.0). opt gets this file as `from`, so a
// missing module deeper inside a style counts as broken, never as not built.
// Author: Imperator_Aug (ARSENAL, ia-c6ebe1b6)
'use strict';

function mv() { return require('../mapviz'); }
function opt(load, spec) { return mv().opt(load, spec, __filename); }

const PALETTE_KEY = { staff: 'staff', painted: 'painted', recon: 'recon', sketch: 'field_sketch' };

const TABLE = [
  { id: 'staff', dir: 'paint/staff', palette: PALETTE_KEY.staff, load: () => opt(() => require('./staff/index'), './staff/index') },
  { id: 'painted', dir: 'paint/painted', palette: PALETTE_KEY.painted, load: () => opt(() => require('./painted/index'), './painted/index') },
  { id: 'recon', dir: 'paint/recon', palette: PALETTE_KEY.recon, load: () => opt(() => require('./recon/index'), './recon/index') },
  { id: 'sketch', dir: 'paint/sketch', palette: PALETTE_KEY.sketch, load: () => opt(() => require('./sketch/index'), './sketch/index') },
];

function row(id) { return TABLE.find(r => r.id === id) || null; }

function check(id, m) {
  if (!m || typeof m.draw !== 'function') return 'lacks draw(input, opts)';
  if (!Number.isInteger(m.VERSION)) return 'lacks an integer VERSION';
  if (m.ID !== undefined && m.ID !== id) return 'ID ' + m.ID + ' is not the folder name ' + id;
  if (m.NEEDS !== undefined && !Array.isArray(m.NEEDS)) return 'NEEDS is not a list';
  if (m.WANTS !== undefined && !Array.isArray(m.WANTS)) return 'WANTS is not a list';
  return null;
}

function load(id) {
  const M = mv();
  const r = row(id);
  if (!r) throw new M.MvError('MV_USAGE', 'no paint style ' + id + '; styles: ' + TABLE.map(x => x.id).join(', '), { code: 'PAINT_STYLE_UNKNOWN', style: id });
  let m;
  try { m = r.load(); } catch (e) {
    throw new M.MvError('MV_FAULT', 'paint style ' + id + ' is broken: ' + (e && e.message ? e.message : String(e)), { code: 'PAINT_STYLE_BROKEN', style: id });
  }
  if (!m) throw new M.MvError('MV_NOT_BUILT', 'paint style ' + id + ' is not built (no ' + r.dir + '/index.js)', { code: 'PAINT_STYLE_NOT_BUILT', style: id });
  const why = check(id, m);
  if (why) throw new M.MvError('MV_FAULT', 'paint style ' + id + ' is broken: ' + why, { code: 'PAINT_STYLE_BROKEN', style: id });
  return m;
}

function list() {
  return TABLE.map(r => {
    // palette = the palette.json path of the style entry ('styles.staff', 'styles.field_sketch'), as the cli body shows it
    const out = { id: r.id, state: 'not built', version: null, palette: 'styles.' + r.palette, needs: [], wants: [] };
    let m;
    try { m = r.load(); } catch (e) { out.state = 'broken'; return out; }
    if (!m) return out;
    if (check(r.id, m)) { out.state = 'broken'; return out; }
    out.state = 'built'; out.version = m.VERSION;
    out.needs = (m.NEEDS || []).slice(); out.wants = (m.WANTS || []).slice();
    return out;
  });
}

module.exports = { TABLE, PALETTE_KEY, load, list, row };
