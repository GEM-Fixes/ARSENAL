// recipe "text", the Gates of Hell branch (game parity 2026-11-23): lines "key = text" written as gettext entries into a .pot of the
// mod. Read on the GoH install [V 2026-11-23]: the game texts are .pot files under localizations/<code>/interface/text/
// (seen as resource/interface/text/*.pot), one entry per key: msgctxt "<key>" msgid "<text>" msgstr "" (GHLOC-06). Each line goes
// through tools/lng-add --exe goh --file <name>.pot (one call per key; the dry run passes --dry-run): the entry lands in the mod's
// localizations/default/interface/text/<file>. A key the game has in another .pot keeps the text of the file read later (.pot files in
// sorted name order, GHLOC-08 [I]), so the default file zz_arsenal_text.pot sorts after the game's. Not on GoH: "missing lines"
// (loccover reads the AS2 .lng set) and "translate" (lng extract and merge write .lng): each refuses with one plain line. Every text
// shown in game is [T].
// Author: Imperator_Aug (ARSENAL, ia-e01bb3bc)
'use strict';
const path = require('path');

const TEXT_FILE = 'zz_arsenal_text.pot', TEXT_DIR = 'localizations/default/interface/text/';
const FILE_RE = /^[A-Za-z0-9_+.-]{1,60}\.pot$/, KEY_RE = /^[^"\\\r\n\s][^"\\\r\n]{0,199}$/;
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const badK = (k, m) => Object.assign(bad(m), { key: k });
const lc = s => String(s == null ? '' : s).toLowerCase();
const AG = () => require('./army.goh');

// the shown texts of the game and the mod: Map lower key -> {key, text, file}; the .pot read later wins (sorted names, GHLOC-08 [I])
function texts(dir, mod) {
  const g = AG().reader(dir, mod); if (!g) return new Map();
  if (g._allText) return g._allText;
  const out = new Map();
  for (const k of g.keys(/^resource\/interface\/text\/.*\.pot$/).sort()) {
    const t = g.readStr(k) || '', re = /msgctxt\s+"((?:[^"\\]|\\.)*)"\s*\r?\nmsgid\s+"((?:[^"\\]|\\.)*)"/g; let m;
    while ((m = re.exec(t))) out.set(lc(m[1]), { key: m[1], text: m[2], file: k.slice('resource/interface/text/'.length) });
  }
  g._allText = out;
  return out;
}

// own route: POST /api/x/task/r/text/goh {mod, file, lines: [{key, text}], write}: lng-add --exe goh per line (--dry-run unless write)
async function gohRoute(url, b, ctx) {
  b = b || {};
  const mod = require('../../bots/lib').checkMod(ctx, b.mod), file = String(b.file || TEXT_FILE);
  if (!FILE_RE.test(file)) throw bad('A Gates of Hell text file name ends in .pot (letters, digits, _ + . -).');
  const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 300).map(l => ({ key: String(l && l.key || ''), text: String(l && l.text != null ? l.text : '') }));
  if (!lines.length) throw bad('No line to write.');
  for (const l of lines) { if (!KEY_RE.test(l.key)) throw bad('Not a text key: ' + l.key.slice(0, 60)); if (/[\r\n]/.test(l.text) || l.text.length > 4000) throw bad('The text of ' + l.key + ' is one line of at most 4000 characters (\\n for a new line).'); }
  let dir = null; try { dir = require('./skin.goh').gohDirOf(ctx); } catch (e) { dir = null; }
  if (!dir) throw badK('task.text.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top).');
  if (b.write) {
    const why = require('../../../../lib/writeguard').refuseWrite(mod, { game: dir, purpose: 'save the texts' });
    if (why) throw bad(why);
    if (ctx.job) ctx.job.writes = true;
  }
  const rows = [];
  for (const l of lines) {
    const args = [mod, '--exe', 'goh', '--game', dir, '--file', file, '--key', l.key, '--text', l.text, '--force'].concat(b.write ? [] : ['--dry-run']);
    const r = await ctx.runTool('lng-add', 'lng-add/lng-add.js', args, { timeoutMs: 60000 });
    if (r.cancelled || (ctx.job && ctx.job.cancelled)) return { ok: false, stopped: true };
    if (r.code !== 0) throw bad('The text ' + l.key + ' could not be written: ' + String(r.stderr || r.stdout || '').trim().split(/\r?\n/).slice(-2).join(' ').slice(0, 300));
    rows.push({ key: l.key });
  }
  return { ok: true, wrote: !!b.write, files: [TEXT_DIR + file], rows };
}

// the finder on the GoH tab: lines by words in key, text or file, the first 30
function find(dir, mod, ws) {
  const rows = [], cap = 30; let total = 0;
  for (const r of texts(dir, mod).values()) {
    const hay = lc(r.key + ' ' + r.text + ' ' + r.file); if (!ws.every(w => hay.includes(w))) continue;
    total++;
    if (rows.length < cap) rows.push({ key: r.key, text: r.text, file: r.file, mod: false });
  }
  return { rows, more: total > rows.length, total };
}

// compile on GoH. H: {parseLines, unesc, params}
function compile(draft, c, H) {
  if (!c.gameDir) throw badK('task.text.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top).');
  const mod = c.mod;
  if (!mod || !path.isAbsolute(mod)) throw bad('Pick your mod first: texts are written only into the mod you picked.');
  const what = String(c.value('what') || 'lines');
  if (what !== 'lines') throw badK('task.text.na.gohwhat', 'Not available in Gates of Hell: finding missing lines and translating a table. Both read and write the Assault Squad 2 .lng set; write the lines you want instead.');
  const file = String(c.value('file_goh') || TEXT_FILE);
  if (!FILE_RE.test(file)) throw bad('A Gates of Hell text file name ends in .pot: ' + file.slice(0, 80));
  const have = texts(c.gameDir, mod), lines = H.parseLines(c.value('lines'), String(c.value('family') || 'name'), new Set(have.keys()));
  if (!lines.length) return { notes: ['text: no lines to write'], result: { file, keys: {} } };
  const out = [], notes = [], keys = {};
  for (const l of lines) {
    if (!KEY_RE.test(l.key)) throw bad('Not a text key: ' + l.key.slice(0, 60));
    const cur = have.get(lc(l.key)), text = H.unesc(l.text);
    if (cur && H.unesc(cur.text) === text) continue;
    if (cur && H.params(H.unesc(cur.text)) !== H.params(text)) notes.push('text ' + l.key + ': the % numbers differ from the game text (LOC-28) [T].');
    if (cur && cur.file !== file && cur.file.localeCompare(file) > 0) notes.push('text ' + l.key + ': the game has it in ' + cur.file + ', which sorts after ' + file + '; the game text may win (GHLOC-08 [I]). Name your file so it sorts later.');
    out.push({ key: l.key, text: l.text }); keys[l.key] = text;
  }
  if (!out.length) return { notes: ['text: every line already reads like that; nothing to write'], result: { file, keys: {} } };
  notes.push(out.length + ' lines go into ' + TEXT_DIR + file + ' of your mod as .pot entries (msgctxt key, text in msgid). Check them in game [T].');
  return { calls: [{ route: 'POST /api/x/task/r/text/goh', body: { file, lines: out }, dryFlag: 'write' }], notes, result: { file, keys } };
}

module.exports = { TEXT_FILE, TEXT_DIR, texts, gohRoute, find, compile };
