// plain: the check report in plain words for a page (GT-18). One overall line, then one line per finding row, then one line per other
// game build. No rule codes, no limit ids, no engine file names, no tags. Used by check.js --plain and written to --json as `plain` + `overall`.
//   overall(R, target, n) -> {target, verdict: 'ok'|'crash'|'refused'|'unfinished', crash, silent, text}
//   lines(R, target, opt) -> [overall text, finding lines..., other build lines..., quick-check line?]
//   opt.targetOnly: only the target build was checked (check's default): one line says the others were not, no verdict claimed for them.
//   opt.restoreLeftOut: the mod holds restore points (.arsenal-undo) that were not read: one line says so
// Author: Imperator_Aug (ARSENAL, ia-34bf5eb6)
'use strict';
const { explain } = require('../lib/explain');

const GAME = { as64: 'the 64-bit game (AS64)', mowas2: 'the original 32-bit game', goh: 'Gates of Hell' };
const LABEL = { crash: 'Can crash the game', silent: 'Silently ignored by the game', desync: 'Can split a multiplayer match', review: 'Worth a look', cosmetic: 'Looks or reads wrong', info: 'Note' };
const ORDER = ['crash', 'silent', 'desync', 'review', 'cosmetic', 'info'];

// strip everything a new modder cannot read: CODE_NAMES, limit ids (UI-16, PORT-48), [V]/[I]/[T] tags, engine cites
function clean(s) {
  return String(s || '')
    .replace(/\s*\[[VIT](?:\s[^\]]*)?\]/g, '')
    .replace(/\s*\((?:lim\s+)?(?!UTF-)[A-Z]{2,8}-\d+[a-z]?(?:[,;\s]+[A-Z]{2,8}-\d+[a-z]?)*\)/g, '')
    .replace(/,?\s*\b(?!UTF-)[A-Z]{2,8}-\d+[a-z]?\b/g, '')
    .replace(/\s*\(?\b[\w-]+\.(?:cpp|h|js):\d+(?:-\d+)?\)?/g, '')
    .replace(/\s*\(?\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b\)?/g, '')
    .replace(/\s+([.,;:])(?=\s|$)/g, '$1').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const name = k => GAME[k] || k;

function why(v) {
  if (!v) return '';
  if (v.verdict === 'REFUSED') return /legacy|Min|Max|version/i.test(v.text || '') ? 'the version range in mod.info does not fit this game' : 'the game does not accept it';
  if (v.verdict === 'LIKELY_CRASH') return 'a known crash pattern was found';
  if (v.verdict === 'UNKNOWN') return /exe not found/i.test(v.text || '') ? 'this game is not installed here, so it was not judged' : 'it could not be judged';
  return '';
}

function counts(R) {
  const n = { crash: 0, silent: 0 };
  for (const f of R.findings || []) if (n[f.sev] !== undefined) n[f.sev] += f.n || 0;
  return n;
}

function overall(R, target) {
  const v = (R.verdicts || {})[target], n = counts(R), g = name(target);
  const base = { target, crash: n.crash, silent: n.silent };
  // --no-load-check: no verdict of wouldload by the user's choice; the linters' findings alone decide, and the text says what was left out
  if (R.loadSkipped && !(R.errors || []).length) {
    const left = ' The load check was skipped, so whether the game accepts the mod at all (its version lines, files it cannot read) was not judged.';
    return n.crash ? { ...base, verdict: 'crash', text: `Not ready for ${g}: ${plural(n.crash, 'problem', 'problems')} that can crash the game. Fix ${n.crash === 1 ? 'it' : 'them'} before you play.` + left }
      : { ...base, verdict: 'ok', text: `No known crash problem found by the linters for ${g}.` + left + ' Play the mod to be sure.' };
  }
  if ((R.errors || []).length || !v || v.verdict === 'UNKNOWN')
    return { ...base, verdict: 'unfinished', text: `The check did not finish for ${g}${v && v.verdict === 'UNKNOWN' ? ': ' + why(v) : ''}. Fix the problem named below and run it again.` };
  if (v.verdict === 'REFUSED')
    return { ...base, verdict: 'refused', text: `${g[0].toUpperCase() + g.slice(1)} will not load this mod: ${why(v)}.` + (n.crash ? ` Also ${plural(n.crash, 'problem', 'problems')} that can crash the game.` : '') };
  if (n.crash || v.verdict === 'LIKELY_CRASH')
    return { ...base, verdict: 'crash', text: `Not ready for ${g}: ${n.crash ? plural(n.crash, 'problem', 'problems') + ' that can crash the game' : 'a known crash pattern'}. Fix ${n.crash === 1 ? 'it' : 'them'} before you play.` };
  return { ...base, verdict: 'ok', text: `Looks good for ${g}: no known crash problem in the files. This checks the files only; play the mod to be sure.` };
}

function where(f) {
  const s = (f.samples || [])[0];
  if (!s) return '';
  const file = typeof s === 'string' ? s.split(/\s/)[0] : s.file ? s.file + (s.line ? ':' + s.line : '') : '';
  return file && !/^[A-Z_]+$/.test(file) ? file : '';
}

function lines(R, target, opt = {}) {
  const out = [overall(R, target).text];
  const rows = (R.findings || []).slice().sort((a, b) => ORDER.indexOf(a.sev) - ORDER.indexOf(b.sev) || b.n - a.n);
  for (const f of rows) {
    const e = explain(f.code, null, { sea: true });
    const what = clean(e.known ? e.what : 'A problem the check found');
    const at = where(f), n = f.n || 1;
    const gated = f.gated ? ' It is in a file the game never loads, so it cannot crash the game as it is now.' : '';
    out.push(`${LABEL[f.sev] || LABEL.review}: ${what.replace(/\.$/, '')} (${plural(n, 'place', 'places')}${at ? ', first: ' + at : ''}).${gated}`);
  }
  for (const e of R.errors || []) out.push('Not finished: one part of the check failed (' + clean(String(e).split(':')[0]) + '). Run the check again.');
  for (const x of R.toolIssues || []) if (x.kind !== 'reran') out.push('Not finished: one part of the check ran out of memory (' + clean(x.tool) + '). Close other programs and run it again.');
  for (const [k, v] of Object.entries(R.verdicts || {})) {
    if (k === target) continue;
    const w = v.verdict === 'LOADS_STATIC' ? 'no known crash problem' : 'would not work: ' + why(v);
    out.push(`Other game, ${name(k)}: ${w}.`);
  }
  if (opt.targetOnly) out.push(`Only ${name(target)} was checked; the other game builds were not.`);
  if (opt.restoreLeftOut) out.push('Restore points kept inside the mod were not checked.');
  if (opt.fast) out.push('Quick check: some slow checks were skipped. Run the full check before you share the mod.');
  return out.map(l => l.replace(/\s{2,}/g, ' '));
}

module.exports = { overall, lines, clean };
