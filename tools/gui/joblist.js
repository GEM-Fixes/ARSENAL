// gui job registry (README.md "JOBS", contract 1): every piece of work the server was told to do, for GET /api/jobs and POST /api/cancel.
//   create({keepMs = 10000}) -> {add, cancel, list, cancelAll, get}     one per server instance (gui.js start())
//   add({id?, kind, what, whatP?, page?, game?, canCancel?, writes?, cancel?, cmd?, interactive?, startedMs?, keepMs?}) -> handle
//     handle {id, set({stage?,done?,total?,what?,whatP?}), end(state), cancelled, canCancel, writes, state, onCancel(fn)}
//     id: the given one when it is free, else 'b' + counter + time. canCancel: as given, else true when there is a cancel function.
//     end(state): no state = 'cancelled' after a cancel, else 'done'. Twice is harmless. The job stays listed keepMs more, then goes.
//     onCancel(fn): one more stop function, called with the job's own (gui.js: the child processes attached to the job).
//   cancel(id) -> false when there is no such running job, else sets handle.cancelled, calls the stop functions, true
//   list() -> plain records, newest last: {id, kind, what, whatP, page, game, state, stage, done, total, startedMs, endedMs, canCancel, writes, cmd, interactive}
//   cancelAll() cancels every running job (server close). get(id) -> the handle while the job is listed, else null.
// Author: Imperator_Aug (ARSENAL, ia-de6aae92)
'use strict';
const STATES = new Set(['running', 'done', 'failed', 'cancelled', 'timeout']);
const numOrNull = v => (typeof v === 'number' && isFinite(v) ? v : null);

function create(o = {}) {
  const keepDef = typeof o.keepMs === 'number' && o.keepMs >= 0 ? o.keepMs : 10000;
  const jobs = new Map();
  let n = 0;
  function add(d = {}) {
    const id = typeof d.id === 'string' && d.id && !jobs.has(d.id) ? d.id : 'b' + (++n).toString(36) + Date.now().toString(36);
    const stops = typeof d.cancel === 'function' ? [d.cancel] : [];
    const keep = typeof d.keepMs === 'number' && d.keepMs >= 0 ? d.keepMs : keepDef;
    const h = {
      id, kind: String(d.kind || 'bg'), what: String(d.what || ''), whatP: d.whatP && typeof d.whatP === 'object' ? d.whatP : null,
      page: String(d.page || ''), game: String(d.game || 'as64'), state: 'running', stage: '', done: null, total: null,
      startedMs: typeof d.startedMs === 'number' ? d.startedMs : Date.now(), endedMs: null,
      canCancel: d.canCancel === undefined ? stops.length > 0 : !!d.canCancel, writes: !!d.writes,
      cmd: String(d.cmd || ''), interactive: !!d.interactive, cancelled: false, hidden: !!d.hidden,
      set(p) {
        if (!p || typeof p !== 'object') return h;
        if (p.stage !== undefined) h.stage = String(p.stage == null ? '' : p.stage);
        if (p.done !== undefined) h.done = numOrNull(p.done);
        if (p.total !== undefined) h.total = numOrNull(p.total);
        if (p.page !== undefined) h.page = String(p.page || '');
        if (p.what !== undefined) h.what = String(p.what || '');
        if (p.whatP !== undefined) h.whatP = p.whatP && typeof p.whatP === 'object' ? p.whatP : null;
        return h;
      },
      end(state) {
        if (h.state !== 'running') return h;
        h.state = STATES.has(state) && state !== 'running' ? state : h.cancelled ? 'cancelled' : 'done';
        h.endedMs = Date.now();
        const drop = () => { if (jobs.get(id) === h) jobs.delete(id); };
        if (keep > 0) { const t = setTimeout(drop, keep); if (t.unref) t.unref(); } else drop();
        return h;
      },
      onCancel(fn) { if (typeof fn === 'function') stops.push(fn); return h; },
    };
    Object.defineProperty(h, '_stops', { value: stops });   // not listed, not enumerable
    jobs.set(id, h);
    return h;
  }
  function cancel(id) {
    const h = jobs.get(id);
    if (!h || h.state !== 'running') return false;
    h.cancelled = true;
    for (const fn of h._stops.slice()) {
      try { const r = fn(); if (r && typeof r.then === 'function') r.then(null, () => { /* the job's own clean-up */ }); } catch (e) { /* the job's own clean-up */ }
    }
    return true;
  }
  const rec = h => ({ id: h.id, kind: h.kind, what: h.what, whatP: h.whatP, page: h.page, game: h.game, state: h.state, stage: h.stage, done: h.done, total: h.total,
    startedMs: h.startedMs, endedMs: h.endedMs, canCancel: h.state === 'running' && !!(h.canCancel || h.childLive), writes: !!h.writes, cmd: h.cmd, interactive: h.interactive });
  return {
    add, cancel,
    list: () => [...jobs.values()].filter(h => !h.hidden).map(rec),   // hidden: a status poll or a held long poll, never shown
    cancelAll() { for (const h of [...jobs.values()]) cancel(h.id); },
    get: id => jobs.get(id) || null,
  };
}
module.exports = { create };
