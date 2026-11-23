// GUI-EXT models: the Models tab steps 1c and 6). Pick a unit or a .mdl, see its file set and edit it here: the
// editable document (tools/lib/model/edit, sub/doc.*) with the parts in sub/ (tree, volumes, meshes, animation, timeline, 3D view,
// gizmo, files, armor). The SOEdit program stays optional (copy into the mod, open in SOEdit, check what it changed).
// Commands: the five soedit verbs in the contract shape, so the Expert page and "copy as command" know them.
// Author: Imperator_Aug (ARSENAL, ia-a14335a0)
const S = require('./server');
const f = (name, flag, type, desc, x) => Object.assign({ name, flag, type, desc }, x || {});
const GAME = f('game', '--game', 'path', 'game install dir');
const T = { tool: 'soedit', entry: 'soedit/soedit.js' };
// SUB-PARTS: each file set in sub/ is one part of the page owned by one session: <name>.client.js (a String.raw script that sets
// EXT_SCREENS.models.subs.<id> or .parts.viewer, see client.js "SUB-PARTS"), <name>.lang.json ({en,ru,uk,zh} keys, merged), <name>.server.js
// ({routes}, merged). The requires are spelled out so the single-exe build finds them; a part that is not there yet is skipped.
const opt = fn => { try { return fn(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return null; } };
// `doc` comes first: it sets EXT_SCREENS.models.doc, which the other parts may use as soon as their script runs.
const SUB = [
  { c: opt(() => require('./sub/doc.client')), l: opt(() => require('./sub/doc.lang.json')), s: opt(() => require('./sub/doc.server')) },
  { c: opt(() => require('./sub/tree.client')), l: opt(() => require('./sub/tree.lang.json')), s: opt(() => require('./sub/tree.server')) },
  { c: opt(() => require('./sub/vol.client')), l: opt(() => require('./sub/vol.lang.json')), s: opt(() => require('./sub/vol.server')) },
  { c: opt(() => require('./sub/ply.client')), l: opt(() => require('./sub/ply.lang.json')), s: opt(() => require('./sub/ply.server')) },
  { c: opt(() => require('./sub/anim.client')), l: opt(() => require('./sub/anim.lang.json')), s: opt(() => require('./sub/anim.server')) },
  { c: opt(() => require('./sub/timeline.client')), l: opt(() => require('./sub/timeline.lang.json')), s: opt(() => require('./sub/timeline.server')) },
  { c: opt(() => require('./sub/viewer.client')), l: opt(() => require('./sub/viewer.lang.json')), s: opt(() => require('./sub/viewer.server')) },
  { c: opt(() => require('./sub/gizmo.client')), l: opt(() => require('./sub/gizmo.lang.json')), s: opt(() => require('./sub/gizmo.server')) },
  { c: opt(() => require('./sub/file.client')), l: opt(() => require('./sub/file.lang.json')), s: opt(() => require('./sub/file.server')) },
  { c: opt(() => require('./sub/armor.client')), l: opt(() => require('./sub/armor.lang.json')), s: opt(() => require('./sub/armor.server')) },
  { c: opt(() => require('./sub/shot.client')), l: opt(() => require('./sub/shot.lang.json')), s: opt(() => require('./sub/shot.server')) },
  { c: opt(() => require('./sub/find.client')), l: opt(() => require('./sub/find.lang.json')), s: opt(() => require('./sub/find.server')) },
  { c: opt(() => require('./sub/look.client')), l: opt(() => require('./sub/look.lang.json')), s: opt(() => require('./sub/look.server')) },
];
const LANG = JSON.parse(JSON.stringify(require('./lang.json')));
for (const p of SUB) if (p.l) for (const code of Object.keys(p.l)) Object.assign(LANG[code] = LANG[code] || {}, p.l[code]);
module.exports = {
  id: 'models', nav: 'models.nav', adv: false,
  script: [require('./client')].concat(SUB.map(p => p.c).filter(Boolean)).join('\n'),
  lang: LANG,
  commands: {
    soeditlocate: Object.assign({ summary: 'Where SOEdit.exe is (ARSENAL_SOEDIT, next to ARSENAL.exe, local build), with its hash.', lead: ['locate'], result: 'stdout-json',
      fields: [f('json', '--json', 'bool', 'print one JSON object')] }, T),
    soeditstage: Object.assign({ summary: 'Copy a model\'s file set (mdl, ply, vol, mtl, textures, anm) into the mod folder; files already there are kept.', lead: ['stage'], result: 'jsonfile', jsonFlag: '--json',
      fields: [f('target', null, 'str', 'entity name, game path or disk path of a .mdl / .def / breed .set, breed:<key> or pak:<pak>!<entry>', { pos: 0, req: true }), f('out', '--out', 'path', 'mod folder', { req: true }), GAME,
        f('mods', '--mods', 'list', 'mods to read under the target'), f('anm', '--anm', 'list', 'animations to take'), f('noAnm', '--no-anm', 'bool', 'no animations'), f('dry', '--dry', 'bool', 'list the file set, copy nothing')] }, T),
    soeditopen: Object.assign({ summary: 'Start SOEdit on a staged model (and animation) in the given language.', lead: ['open'], result: 'none',
      fields: [f('model', null, 'path', 'staged .mdl or stage record', { pos: 0, req: true }), f('anm', '--anm', 'path', 'staged .anm'), f('lang', '--lang', 'enum', 'SOEdit language', { values: ['en', 'ru', 'uk', 'zh'] }),
        f('wait', '--wait', 'bool', 'wait until SOEdit closes'), f('dry', '--dry', 'bool', 'print the command only')] }, T),
    soeditcheck: Object.assign({ summary: 'After SOEdit: what changed in the staged files and what was lost, then binhdr and expcheck.', lead: ['check'], result: 'jsonfile', jsonFlag: '--json',
      fields: [f('model', null, 'path', 'stage record or staged .mdl', { pos: 0, req: true }), GAME] }, T),
  },
  routes: Object.assign({}, S.routes, ...SUB.map(p => (p.s && p.s.routes) || {})),
  prep: [].concat(...SUB.map(p => (p.s && p.s.prep) || [])),
};
