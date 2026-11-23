// Author: Imperator_Aug (ARSENAL, ia-f6cd0d5e)
'use strict';
// determ shim: preloaded (-r / NODE_OPTIONS) into run B and the ablation runs of tools/determ/determ.js.
// DETERM_CLOCK=1: Date (new Date(), Date(), Date.now()) and fs stat times read 400 days later.
// DETERM_ORDER=1: fs.readdir / readdirSync / promises.readdir return their entries reversed.
// Idempotent: a second preload (argv -r plus NODE_OPTIONS) does nothing.
if (!global.__determShim) {
  global.__determShim = true;
  const fs = require('fs');
  const SHIFT = 400 * 864e5;
  if (process.env.DETERM_CLOCK === '1') {
    const RealDate = Date;
    function D(...a) {
      if (!new.target) return new RealDate(RealDate.now() + SHIFT).toString();
      return Reflect.construct(RealDate, a.length ? a : [RealDate.now() + SHIFT], new.target);
    }
    D.prototype = RealDate.prototype;
    Object.setPrototypeOf(D, RealDate);
    D.now = () => RealDate.now() + SHIFT;
    D.parse = RealDate.parse; D.UTC = RealDate.UTC;
    Object.defineProperty(RealDate.prototype, 'constructor', { value: D, writable: true, configurable: true });
    global.Date = D;
    const shiftStat = s => {
      if (!s || typeof s !== 'object' || s.__determ) return s;
      for (const k of ['atime', 'mtime', 'ctime', 'birthtime']) {
        if (typeof s[k + 'Ms'] === 'number') { const ms = s[k + 'Ms'] + SHIFT; try { s[k + 'Ms'] = ms; s[k] = new RealDate(ms); } catch { /* frozen */ } }
      }
      try { Object.defineProperty(s, '__determ', { value: true }); } catch { /* frozen */ }
      return s;
    };
    for (const f of ['statSync', 'lstatSync', 'fstatSync']) {
      const o = fs[f]; fs[f] = function (...a) { return shiftStat(o.apply(this, a)); };
    }
    for (const f of ['stat', 'lstat', 'fstat']) {
      const o = fs[f];
      fs[f] = function (...a) { const cb = a[a.length - 1]; if (typeof cb === 'function') a[a.length - 1] = (e, s) => cb(e, shiftStat(s)); return o.apply(this, a); };
      const p = fs.promises[f]; if (p) fs.promises[f] = async (...a) => shiftStat(await p(...a));
    }
  }
  if (process.env.DETERM_ORDER === '1') {
    const rev = r => (Array.isArray(r) ? r.slice().reverse() : r);
    const o = fs.readdirSync; fs.readdirSync = function (...a) { return rev(o.apply(this, a)); };
    const c = fs.readdir;
    fs.readdir = function (...a) { const cb = a[a.length - 1]; if (typeof cb === 'function') a[a.length - 1] = (e, r) => cb(e, rev(r)); return c.apply(this, a); };
    const p = fs.promises.readdir; fs.promises.readdir = async (...a) => rev(await p(...a));
  }
}
