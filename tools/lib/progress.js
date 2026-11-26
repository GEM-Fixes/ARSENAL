// progress of a tool that runs as a child of another tool: with ARSENAL_PROGRESS=1 in the environment, each file handed to the
// parser is named on stderr as `PROGRESS at <n> <bytes> <name>\tthread=<id>` before it is parsed, written at once (not buffered), so
// the parent (tools/wouldload) can say which file a pass is on even when the pass never returns from that file. n counts PER THREAD
// (worker_threads: sdllint reads its roots on up to 4 threads, each with its own n from 1), so the last n is not the total: count the
// lines, or keep the last n per thread id. <id> = worker_threads.threadId (0 = main thread). The thread field comes after a TAB
// (tabs and line breaks in a name become spaces): split at the last TAB for it; a reader of the old form (split on spaces, the
// rest = name) still gets n and bytes right and the name with a `\tthread=<id>` tail. Off = no cost beyond one test.
// Author: Imperator_Aug (ARSENAL, ia-0f8fd38a)
'use strict';
const fs = require('fs');
const on = process.env.ARSENAL_PROGRESS === '1';
const tid = (() => { try { return require('worker_threads').threadId | 0; } catch { return 0; } })();
let n = 0;
function file(name, bytes) {
  if (!on) return;
  n++;
  try { fs.writeSync(2, `PROGRESS at ${n} ${bytes | 0} ${String(name || '?').replace(/[\r\n\t]/g, ' ')}\tthread=${tid}\n`); } catch { /* a closed pipe: the parent is gone */ }
}
// parse(line) -> {n, bytes, file, thread} | null: reads both forms (thread null on a line without the field)
function parse(line) {
  const s = String(line).replace(/[\r\n]+$/, '');
  if (!s.startsWith('PROGRESS at ')) return null;
  const tab = s.lastIndexOf('\t'), mt = tab >= 0 ? /^thread=(\d+)$/.exec(s.slice(tab + 1)) : null;
  const m = (mt ? s.slice(12, tab) : s.slice(12)).split(' ');
  if (m.length < 3 || !/^\d+$/.test(m[0]) || !/^\d+$/.test(m[1])) return null;
  return { n: +m[0], bytes: +m[1], file: m.slice(2).join(' '), thread: mt ? +mt[1] : null };
}
module.exports = { file, parse, on };
