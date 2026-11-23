// GUI-EXT ide: the "Editor" tab. A text editor for mod files: file explorer, open files as tabs, colours, line numbers,
// folding, error marks with one-click fixes, hover help, go to definition, find usages, compare with vanilla, the newest
// game log with links back to file and line, restore points, and the Notepad++ set-up card. Contract: tools/ide/README.md.
// It edits text. It compiles, builds and launches nothing. Reads anywhere; writes only into the picked mod folder, and only
// through ../files/lib (save, copyIn, restore). The text engine (CodeMirror 5, MIT) is served as a plain asset by ./routes.
// Author: Imperator_Aug (ARSENAL, ia-72082e3a)
const part = f => { try { return f(); } catch (e) { if (e && e.code === 'MODULE_NOT_FOUND') return null; throw e; } };
// literal requires so the single-exe bundler keeps each module
const UI = [part(() => require('./ui/core')), part(() => require('./ui/explorer')), part(() => require('./ui/panels')),
  part(() => require('./ui/kit')), part(() => require('./ui/inc')), part(() => require('./ui/jump'))];
const ROWS = [part(() => require('./lang/core')), part(() => require('./lang/explorer')), part(() => require('./lang/panels')),
  part(() => require('./lang/hover')), part(() => require('./lang/fixes')), part(() => require('./lang/kit')), part(() => require('./lang/inc')), part(() => require('./lang/jump'))];

const lang = { en: {}, ru: {}, uk: {}, zh: {} };
for (const rows of ROWS) for (const r of rows || []) { lang.en[r[0]] = r[1]; lang.ru[r[0]] = r[2]; lang.uk[r[0]] = r[3]; lang.zh[r[0]] = r[4]; }
if (!lang.en['ide.nav']) { lang.en['ide.nav'] = 'Editor'; lang.ru['ide.nav'] = 'Редактор'; lang.uk['ide.nav'] = 'Редактор'; lang.zh['ide.nav'] = '编辑器'; }

module.exports = {
  id: 'ide',
  nav: 'ide.nav',
  adv: false,
  after: 'mods',
  script: UI.filter(Boolean).map(u => u.script).join('\n'),
  lang,
  commands: {},
  routes: part(() => require('./routes')) || {},
  // Prepare sections (gui README, CACHE contract 1): ide.tree, ide.index, ide.check, made by the routes' own job code (./routes PREP).
  // Mod Files (ext/files) has none of its own: its tree is served from the store entry ide.tree makes.
  prep: (part(() => require('./routes')) || {})._prep || [],
};
