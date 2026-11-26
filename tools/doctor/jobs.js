// doctor job plan (MEM-PLAN): memory per linter from its lib/registry `mem` row (measured peak: base MB + KB per text file of the mod)
// times MARGIN, and a pool that keeps the sum of the running tools' estimates under a RAM budget: the biggest tools start first, small
// ones fill the room that is left, never more than -j at once and always at least one running. Binary files (models, textures, sounds)
// hardly move any tool's peak (binhdr streams their headers: 344 MB on RobZ's 60k binaries, 406 MB on jaben's 2k), so they are counted, not priced.
//   countMod(folder, {restorePoints}) -> {all, text, bin}: files of the mod (loose + pak/pat entries); .arsenal-undo / .arsenal / .git
//     left out (the linters never read them unless --restore-points)
//   estimate(tool, counts) -> bytes; a tool with no mem row gets the old guess (150 MB + 12 KB per file)
//   schedule(jobs, {cap, budget, est, run, onDone, weight}) -> Promise: runs every job; release(job) puts one more in (a reuse miss);
//     weight(job) = how many tools the job runs (doctor's read-once pass: its linters, each a worker thread), counted against cap
//     and in the most-at-once peak; default 1. A job heavier than cap still runs when nothing else does. first = tool names that
//     start before the biggest (long jobs that wait on the disk, not the CPU: doctor's binhdr), still within cap and budget
// Author: Imperator_Aug (ARSENAL, ia-92f00a43)
const fs = require('fs'), path = require('path');
const MARGIN = 1.5;
// binary formats: binhdr reads their headers; the text linters skip them (they only list them)
const BIN = /\.(ply|anm|vol|dds|tga|bmp|jpg|jpeg|png|wav|mp3|ogg|ebm|net|tex|grs|pdn|psd|avi|bik|db|fnt|ttf|dll|exe|zip|pak|pat)$/i;
const SKIP = /^(\.arsenal-undo|\.arsenal|\.git|\.svn)$/i;

function countMod(folder, o = {}) {
  const c = { all: 0, text: 0, bin: 0 };
  const add = name => { c.all++; if (BIN.test(name)) c.bin++; else if (path.extname(name)) c.text++; };
  const walk = (d, depth) => {
    let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 12 && (o.restorePoints || !SKIP.test(e.name))) walk(p, depth + 1); }
      else if (/\.(pak|pat)$/i.test(e.name)) { try { for (const x of require('../lib/pak').list(p)) add(String(x.name || x.path || x)); } catch { add(e.name); } }
      else add(e.name);
    }
  };
  walk(folder, 0);
  return c;
}

function estimate(tool, c) {
  const r = require('../lib/registry').byName(tool), m = r && r.mem;
  if (!m) return 150e6 + 12288 * c.all;
  return Math.round(MARGIN * (m.base * 1048576 + (m.text || 0) * 1024 * c.text));
}

// the plan in words for the JOBS note: how many fit at once at most, and the estimates biggest first
function describe(names, est, cap, budget) {
  const e = names.map(n => [n, est(n)]).sort((a, b) => b[1] - a[1]);
  let k = 0, s = 0;
  for (const [, v] of [...e].sort((a, b) => a[1] - b[1])) { if (k >= cap || s + v > budget) break; s += v; k++; }
  let top = 0; for (const [, v] of e.slice(0, cap)) top += v;
  return { limited: top > budget, most: Math.max(1, k), list: e.map(([n, v]) => `${n} ${(v / 1e6).toFixed(0)}`).join(', ') };
}

function schedule(jobs, o) {
  const queue = [], order = new Map();
  let running = 0, used = 0, peak = 0, waiting = 0, finish;
  const done = new Promise(r => { finish = r; });
  const fst = j => (o.first && o.first.includes(j[0]) ? 0 : 1);
  const put = job => { if (!order.has(job[0])) order.set(job[0], order.size); queue.push(job); queue.sort((a, b) => fst(a) - fst(b) || o.est(b[0]) - o.est(a[0]) || order.get(a[0]) - order.get(b[0])); };
  const check = () => { if (!queue.length && !running && !waiting) finish(peak); };
  const wt = job => (o.weight ? o.weight(job) : 1);
  const pump = () => {
    for (let i = 0; i < queue.length && running < o.cap;) {
      const e = o.est(queue[i][0]), w = wt(queue[i]);
      if (running && (used + e > o.budget || running + w > o.cap)) { i++; continue; }   // does not fit beside the running ones: a smaller one may
      const job = queue.splice(i, 1)[0];
      running += w; used += e; peak = Math.max(peak, running);
      Promise.resolve(o.run(job)).then(r => { running -= w; used -= e; o.onDone(r, job); pump(); check(); });
    }
  };
  for (const j of jobs) put(j);
  return {
    done, // resolves with the most tools that ran at once
    hold() { waiting++; },   // a job may still come (a reuse wait): the pool stays open until release()
    release(job) { waiting--; if (job) put(job); pump(); check(); },
    start() { pump(); check(); return done; },
  };
}

module.exports = { MARGIN, countMod, estimate, describe, schedule };
