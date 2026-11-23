'use strict';
// pub: the public-edition rules for markdown, shared by docgen (the docs editions), guide/build-pdf.js (the books) and the release zip.
// No side effects at require time, no the game load: the denylist scan stays in docgen.js (buildDeny + scan).
//   strip(text[, {file, keepInternal}]) -> {text, errors, map}
//     A line that is exactly `<!-- internal -->` opens a block and `<!-- /internal -->` closes it (spaces around allowed). The public
//     text drops the block and both marker lines. Every whole-line HTML comment (one line, or a span that starts a line with `<!--` and
//     ends a line with `-->`) becomes one empty line, as the book builder always did. keepInternal: the block's content stays, only
//     the marker lines and the comments go (the internal book). errors: 'file:line: why' for a block opened inside a block, a close
//     with no open block, a block never closed, a marker inside a code fence, a comment never closed. map[i] = source line (1-based)
//     of output line i, so a hit in the public text is reported at its source line. Line endings are kept (CRLF stays CRLF).
//   STRICT: [{kind, re, scope, why}] the stricter wording rules: what tells an outsider that the engine's internals were read from
//     or rebuilt from its code. scope 'book' = the book pages only (guide, engine public set); 'all' = every public file (the webs
//     and the tool index get them through docgen's scrub, so a flagged clause or line is reworded or dropped there).
//   scanStrict(line[, {scope: 'book'|'all', allow: Set}]) -> [{kind, match}]  (default scope 'book' = every rule)
//   loadAllow([file]) -> Set of names from tools/docgen/public-allow.txt: names a modder can see that a scan flags by mistake;
//     they are never hits (maskAllowed blanks them out of a line before the rules run).
// Author: Imperator_Aug (ARSENAL, ia-98084ef7)
const fs = require('fs'), path = require('path');

const OPEN = /^\s*<!--\s*internal\s*-->\s*$/, CLOSE = /^\s*<!--\s*\/internal\s*-->\s*$/;
const COMMENT1 = /^\s*<!--(?:(?!-->).)*-->\s*$/;            // one whole line, nothing after its first -->
const COMMENT_OPEN = /^\s*<!--(?:(?!-->).)*$/;              // starts a comment that goes on below
const COMMENT_END = /-->\s*$/;
const FENCE = /^\s*(?:```|~~~)/;

function strip(text, opt = {}) {
  const file = opt.file || '<text>', keep = !!opt.keepInternal;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const L = text.split(/\r?\n/), out = [], map = [], errors = [];
  let open = 0, fence = false;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (OPEN.test(l)) {
      if (fence) errors.push(`${file}:${i + 1}: internal marker inside a code fence`);
      if (open) errors.push(`${file}:${i + 1}: internal block opened inside the block opened at line ${open}`);
      else open = i + 1;
      continue;
    }
    if (CLOSE.test(l)) {
      if (fence) errors.push(`${file}:${i + 1}: internal marker inside a code fence`);
      if (!open) errors.push(`${file}:${i + 1}: /internal with no open block`);
      open = 0; continue;
    }
    if (FENCE.test(l)) fence = !fence;
    if (open && !keep) continue;
    if (!fence && COMMENT1.test(l)) { out.push(''); map.push(i + 1); continue; }
    if (!fence && COMMENT_OPEN.test(l)) {
      let j = i + 1; while (j < L.length && !COMMENT_END.test(L[j])) j++;
      if (j >= L.length) { errors.push(`${file}:${i + 1}: HTML comment never closed`); break; }
      out.push(''); map.push(i + 1); i = j; continue;
    }
    out.push(l); map.push(i + 1);
  }
  if (open) errors.push(`${file}:${open}: internal block never closed`);
  return { text: out.join(eol), errors, map };
}

// ---------- the stricter wording rules ----------
// Each rule: kind (what the reader learns), re, scope, why (one line, shown by --rules in docgen and in the report).
// cut: in docgen's scrub of the webs a match of this rule is cut out of the line and the line reflowed; without it the clause that
// holds the match goes (then the line, when no clause is left). Book pages are never reworded: any hit fails the build.
const STRICT = [
  // the guides batch check list (check.js), kept as written for the book pages (the 'all' rules below cover its code-only parts)
  { kind: 'how-known', scope: 'book', why: 'says the facts were read or copied out of code (transcribed, code read, line cites, the source)',
    re: /transcri(?:pt|b)|read (?:from|in) (?:the )?(?:engine'?s? )?code|code[- ]read|\bfn@|line cites?\b|cited to|\bsource (?:file|line|tree|path)s?\b|\bthe source\b|reverse[- ]engineer/i },
  { kind: 'code-word', scope: 'book', why: 'programming and build-tool words only someone who builds the engine uses',
    re: /C\+\+|\bcpp\b|header file|\bvtable|\bRTTI\b|\bPDB\b|\bIDA\b|x64dbg|\bAS2_[A-Z]{3,}\b|#if(?:n?def)?\b|\bMSVC\b|Visual Studio|\bCMake|\.sln\b|\.vcxproj|\blinker (?:error|flag|option|setting|map)s?\b|call graph|member function|\bcompiler\b|\bcompiled from\b|\bbuild system\b/i },
  { kind: 'goh-row', scope: 'all', cut: true, why: 'a row id of the Gates of Hell map, a private notes set', re: /\bGH[A-Z]{2,6}-\d+\b/ },
  { kind: 'web-path', scope: 'book', why: 'a path into the maintainers\' notes; a book stands alone',
    re: /\b(?:gohweb|codemap|refmods|modweb|limits)\/[\w./-]+|\bplan\/[\w./-]+/ },
  { kind: 'tag', scope: 'book', why: 'a verification tag of the notes; a book says certainty in words ("probably", "not confirmed")', re: /\[(?:V|I|T)\]/ },
  // added (T1), from the reader's side: what tells an outsider that someone holds the engine's code
  { kind: 'how-known', scope: 'all', why: 'the code-only part of the list above, for every public file',
    re: /\btranscribed from\b|\bcode[- ]reads?\b|\bfn@|\bline cites?\b|\bcited to\b|\bsource (?:line|tree)s?\b|\breverse[- ]engineer/i },
  { kind: 'how-known', scope: 'all', cut: true, why: '"src" as the place a fact was checked ([V] src, seen: src:, crash + src)',
    re: /(?<![-\w/.$])src\b(?![/=.(<-])/ },
  { kind: 'how-known', scope: 'all', why: 'code read, rebuilt, recompiled or ported: the words say the code is at hand',
    re: /\b(?:in|from|per|according to|inside) the (?:engine'?s? |exe'?s? |game'?s? |original )?(?:source )?code\b|\bthe (?:engine )?code (?:says|shows|reads|checks|does|calls|uses|has|sets|looks|tests|returns)\b|\brecomp(?:ile[ds]?|iling|ilation)?\b|\brebuil(?:t|d|ding) (?:the |from (?:the )?)?(?:engine|exe|executable|code|source)\b|\bre-?implement(?:ed|s|ing|ation)?\b|\bsource[- ]level\b|\bsource[- ]?code\b|\bport(?:ed|ing)? (?:the )?(?:engine|exe|code)\b|\b(?:engine|exe|code) port\b|\bported (?:it )?to (?:x?64|x86-64)\b/i },
  { kind: 'private-web', scope: 'all', cut: true, why: 'names a private notes set (the GoH map, the code map) no public edition has', re: /\bgoh-?web\b|\bcodemap\b/i },
  { kind: 'debug-tool', scope: 'all', why: 'names a tool or an act of taking an exe apart',
    re: /\bghidra\b|\bdecompil\w*|\bdecomp\b|\bdisassembl\w*|\bdisasm\b|\bhex-?rays\b|\bbinary ninja\b|\bradare2?\b|\bollydbg\b|\bwindbg\b|\bx64dbg\b|\bdumpbin\b|\bdebug symbols?\b|\bsymbol (?:file|table|name)s?\b|\b(?:de)?mangled names?\b|\b(?:stray|debug|software|hard-?coded|leftover|code) breakpoints?\b|\bbreakpoints? (?:that|which) (?:runs?|fires?|stops?|halts?|triggers?)\b|`\w+` breakpoint\b|\bstep(?:ped|ping)? through (?:the )?(?:code|exe|function)/i },
  { kind: 'code-word', scope: 'all', why: 'programming and build-tool words only someone who builds the engine uses (the book list, less its plain-English words)',
    re: /C\+\+|\bcpp\b|\bheader files?\b|\bvtables?\b|\bRTTI\b|\bPDB\b|\bAS2_[A-Z]{3,}\b|#if(?:n?def)?\b|#define\b|\bMSVC\b|\bMSBuild\b|Visual Studio|\bvcpkg\b|\bCMake|\.sln\b|\.vcxproj|\bcall graph\b|\bmember functions?\b|\bcompiler\b|\bcompiled from\b|\bbuild system\b/i },
  { kind: 'code-word', scope: 'all', why: 'names the shape of the engine\'s code: its functions, classes, members and types',
    re: /\b(?:engine|internal|native|exe|C) (?:function|class|method|member|struct|global|variable|enum|macro|routine)s?\b|\bmember (?:variable|field)s?\b|\bbase class(?:es)?\b|\bderived class(?:es)?\b|\bsub-?class(?:es|ed)?\b|\bvirtual (?:function|method|call|table)s?\b|\bfunction pointers?\b|\bconstructors?\b|\bdestructors?\b|\bctor\b|\bdtor\b|\bsingleton\b|\bnullptr\b|\bthis->|\bstd::|\b(?:u?int(?:8|16|32|64)_t|size_t|DWORD|QWORD)\b|\bsizeof\b|\bopcodes?\b|\bassembly (?:code|listing)\b/i },
  { kind: 'code-word', scope: 'all', why: 'a build file or a build setting of the engine itself',
    re: /\.(?:pdb|ilk|cxx|hxx|ipp|vcxproj)\b|\bdebug build\b|\bbuild (?:flag|config(?:uration)?|target)s?\b|\bcompile[- ]time\b|\bcompiled[- ](?:in|out)\b|\bcompil(?:e|es|ing) (?:the )?(?:engine|exe|game|code)\b/i },
  { kind: 'line-ref', scope: 'all', cut: true, why: 'name@line, the shape of a code citation', re: /\b[A-Za-z_]\w*@\d{2,}\b/ },
  { kind: 'heading', scope: 'all', why: 'the internal chapter shape: a "Where it lives" section or the "Internal:" stamp',
    re: /^#{1,6}\s+Where it lives\b|^\s*Internal:/ },
];

// names that look like a hit but a modder can see them: never hits
function loadAllow(file) {
  const f = file || path.join(__dirname, 'public-allow.txt'), set = new Set();
  let t = ''; try { t = fs.readFileSync(f, 'utf8'); } catch (e) { return set; }
  for (const raw of t.split(/\r?\n/)) { const l = raw.replace(/\s+#.*$/, '').trim(); if (l && !l.startsWith('#')) set.add(l); }
  return set;
}
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const allowRe = new WeakMap();
// blank every allowed name out of a line (same length, so match positions hold)
function maskAllowed(line, allow) {
  if (!allow || !allow.size) return line;
  let re = allowRe.get(allow);
  if (!re || re.n !== allow.size) { re = { n: allow.size, re: new RegExp('(?<![\\w:])(?:' + [...allow].sort((a, b) => b.length - a.length).map(reEsc).join('|') + ')(?![\\w])', 'g') }; allowRe.set(allow, re); }
  return line.replace(re.re, m => ' '.repeat(m.length));
}
function scanStrict(line, opt = {}) {
  const scope = opt.scope || 'book', l = maskAllowed(line, opt.allow), hits = [], seen = new Set();
  for (const r of STRICT) {
    if (scope === 'all' && r.scope !== 'all') continue;
    const re = new RegExp(r.re.source, r.re.flags.includes('g') ? r.re.flags : r.re.flags + 'g'); let m;
    while ((m = re.exec(l))) { const k = r.kind + '\u0000' + m[0]; if (!seen.has(k)) { seen.add(k); hits.push({ kind: r.kind, match: m[0] }); } if (m.index === re.lastIndex) re.lastIndex++; }
  }
  return hits;
}
// the top version row of a CHANGELOG (| 1.0 | 2026-11-10 | ...), as the book builder reads it; null when none
function topVersion(text) { const m = /^\|\s*(\d+\.\d+)\s*\|\s*([\d-]+)\s*\|/m.exec(text || ''); return m ? m[1] : null; }

module.exports = { strip, STRICT, scanStrict, loadAllow, maskAllowed, topVersion, OPEN, CLOSE };
