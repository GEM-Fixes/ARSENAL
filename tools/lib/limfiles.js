// limfiles: limits/ area files. an area is AREA.md plus continuation parts AREA2.md, AREA3.md.. holding later IDs.
// list(root) -> [{area, part, name, rel}] by area then part. partsOf(root, area) -> rels in ID order.
// Author: Imperator_Aug (ARSENAL, ia-9af84af0)
const fs = require('fs'), path = require('path');

const FILE_RE = /^([A-Z]+)(\d*)\.md$/;
function list(root) {
  const out = [];
  for (const name of fs.readdirSync(path.join(root, 'limits'))) {
    const m = FILE_RE.exec(name);
    if (!m || m[1] === 'INDEX') continue;
    out.push({ area: m[1], part: +m[2] || 1, name, rel: `limits/${name}` });
  }
  return out.sort((a, b) => (a.area < b.area ? -1 : a.area > b.area ? 1 : a.part - b.part));
}
const partsOf = (root, area) => list(root).filter(f => f.area === area).map(f => f.rel);

module.exports = { list, partsOf, FILE_RE };
