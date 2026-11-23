// Author: Imperator_Aug (ARSENAL, ia-eb9754f7)
'use strict';
// gohguard (PACKGUARD, rev-port #3): GoH assets must never be published. Reads <mod>/GOH-ORIGIN.tsv (tools/goh2as2/origin.js) and
// finds GoH bytes still in the mod. Used by tools/packer (pack refusal) and tools/release-check --publish (publish gate).
//   check(modDir) -> { ledger: n rows, hits: [{rel, code, msg}], notes: [{rel, code, msg}] }
//   codes (refuse): PACK_GOH_ORIGIN  ledger row's file exists with the ledger sha1
//                   PACK_GOH_RENAMED a file (or an entry inside a pak in the mod) has a ledger sha1 under another name
//                   PACK_PRIVATE     a pak marked PRIVATE (packer --allow-private output) sits in the mod
//   notes (info): GOH_ORIGIN_CHANGED ledger file exists but bytes differ (edited after port: not refused, check by hand)
//                 GOH_ORIGIN_GONE    ledger file no longer in the mod
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const origin = require('../goh2as2/origin');

const JUNK_DIR = new Set(['.git', '.svn', '.hg']);
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const PRIVATE_RE = /(^|[-_. ])PRIVATE([-_. ]|$)/;   // packer --allow-private marker (uppercase word), not "privateer.pak"

function walk(root) {
  const out = [];
  (function w(d) {
    let ls; try { ls = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ls) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!JUNK_DIR.has(e.name.toLowerCase())) w(p); }
      else if (e.isFile()) out.push(p);
    }
  })(root);
  return out;
}

function check(modDir) {
  const root = path.resolve(modDir), led = origin.read(root), hits = [], notes = [];
  const fw = p => path.relative(root, p).replace(/\\/g, '/');
  const files = walk(root);
  for (const f of files) if (/\.pak$/i.test(f) && PRIVATE_RE.test(path.basename(f)))
    hits.push({ rel: fw(f), code: 'PACK_PRIVATE', msg: 'pak marked PRIVATE (packer --allow-private, holds GoH bytes): local only, never publish' });
  if (!led.size) return { ledger: 0, hits, notes };
  const bySha = new Map();   // sha1 -> ledger path
  for (const [p, r] of led) if (r.sha1) bySha.set(r.sha1.toLowerCase(), p);
  const key = p => p.toLowerCase();
  const ledKeys = new Map([...led.keys()].map(p => [key(p), p]));
  for (const [p, r] of led) {
    const abs = path.join(root, p);
    let buf; try { buf = fs.readFileSync(abs); } catch { notes.push({ rel: p, code: 'GOH_ORIGIN_GONE', msg: 'ledger file not in the mod any more' }); continue; }
    if (sha1(buf) === String(r.sha1).toLowerCase()) hits.push({ rel: p, code: 'PACK_GOH_ORIGIN', msg: `GoH-origin file unchanged since ${r.tool} (GoH ${r.src || '?'}); GoH assets must not be published (GOH-ORIGIN.tsv)` });
    else notes.push({ rel: p, code: 'GOH_ORIGIN_CHANGED', msg: `edited after ${r.tool}; not refused, check it holds no GoH bytes (GoH ${r.src || '?'})` });
  }
  const pak = (() => { try { return require('../lib/pak'); } catch { return null; } })();
  for (const f of files) {
    const rel = fw(f);
    if (rel === origin.NAME) continue;
    if (/\.pak$/i.test(f) && pak) {
      try {
        const ents = pak.list(f);
        for (const e of ents) {
          if (e.name.endsWith('/')) continue;
          const lp = bySha.get(sha1(pak.read(ents, e)));
          if (lp) hits.push({ rel: `${rel}:${e.name}`, code: 'PACK_GOH_RENAMED', msg: `pak entry has the sha1 of GoH-origin ${lp} (GOH-ORIGIN.tsv)` });
        }
      } catch { /* not a readable pak: hashed as a file below */ }
    }
    if (ledKeys.has(key(rel))) continue;   // checked by path above
    let buf; try { buf = fs.readFileSync(f); } catch { continue; }
    const lp = bySha.get(sha1(buf));
    if (lp) hits.push({ rel, code: 'PACK_GOH_RENAMED', msg: `same bytes (sha1) as GoH-origin ${lp} under another name (GOH-ORIGIN.tsv)` });
  }
  return { ledger: led.size, hits, notes };
}
module.exports = { check, PRIVATE_RE };
