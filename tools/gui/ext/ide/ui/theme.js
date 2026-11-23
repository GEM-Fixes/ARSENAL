// ARSENAL Editor, part theme: which theme the page shows, and a watcher that tells the Editor when it changes.
// The page's header switch sets data-theme="light"|"dark" on <html> or removes it (auto: the system decides through
// prefers-color-scheme). The Editor has no switch of its own: it follows this. Surfaces come from the page's colour
// tokens (they flip by CSS alone); only the syntax palette is picked here, by the effective theme.
// window.IDE_THEME = { now() -> 'light'|'dark', watch(cb) -> { theme(), stop() } }; cb(t) runs once per real change.
// Guarded for the test fake DOM: no matchMedia, no MutationObserver, no getAttribute are all fine (light, no live updates).
// ES5 only (served inside the page script). Prepended to the shell script by ./core.js.
// Author: Imperator_Aug (ARSENAL, ia-b5a993c4)
'use strict';
var script = String.raw`
(function(){
var Q='(prefers-color-scheme: dark)';
function media(w){try{return w&&typeof w.matchMedia==='function'?w.matchMedia(Q):null}catch(e){return null}}
function now(w,d){var r=d&&d.documentElement,a=null;
 try{a=r&&r.getAttribute?r.getAttribute('data-theme'):null}catch(e){a=null}
 if(a==='light'||a==='dark')return a;
 var m=media(w);return m&&m.matches?'dark':'light'}
function watch(w,d,cb){var last=now(w,d),stops=[],r=d&&d.documentElement;
 function check(){var t=now(w,d);if(t===last)return;last=t;try{cb(t)}catch(e){if(w.console&&w.console.error)w.console.error('IDE theme',e)}}
 if(r&&w&&typeof w.MutationObserver==='function'){try{var mo=new w.MutationObserver(check);mo.observe(r,{attributes:true,attributeFilter:['data-theme']});
  stops.push(function(){mo.disconnect()})}catch(e){}}
 var m=media(w);
 if(m){try{if(m.addEventListener){m.addEventListener('change',check);stops.push(function(){m.removeEventListener('change',check)})}
  else if(m.addListener){m.addListener(check);stops.push(function(){m.removeListener(check)})}}catch(e){}}
 return {theme:function(){return last},check:check,stop:function(){stops.splice(0).forEach(function(f){try{f()}catch(e){}})}}}
window.IDE_THEME={now:function(){return now(window,document)},watch:function(cb){return watch(window,document,cb)}};
})();
`;

module.exports = { script: script };
