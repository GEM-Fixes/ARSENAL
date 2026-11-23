// ext view, browser side: window.VIEW (contract: ./README.md "Browser"). Runs on every page inside the page IIFE (h, tx, api, S, show,
// toast, LS come from tools/gui/page.js). Page rules: ES5, no backtick, no dollar-brace, no innerHTML; DOM through h() and textContent;
// every string through tx(). The styles (this file's css + each kind's css) go into one style element the first time a viewer is
// drawn, so a page that never shows a viewer is not touched.
// Author: Imperator_Aug (ARSENAL, ia-041f2074)
'use strict';
const BODY = String.raw`
var VIEW=window.VIEW=window.VIEW||{};VIEW.specs={};VIEW.order=[];
// text the Editor edits (null kind) and bytes (hex until a kind claims them); any other extension is tried as text first
var TEXT=' def def1 set inc mi ext ebm tex mtl mdl fx info weapon ammo grenade mine pattern presets nav lay ssq accuracy reg opt hand fsm dl pot font ps mod ctm etf tpl template lng lua txt xml ini json log md csv yaml yml cfg h hlsl fxh html htm s ';
var BIN=' pak pat zip 7z rar ply anm vol dds tga png bmp jpg jpeg gif psd tif tiff wav mp3 ogg avi bik wmv mp4 pso vso grs net exe dll bin ttf otf lnk msh fnt ';
var CSSDONE=false;
function vcss(){if(CSSDONE||typeof document==='undefined')return;CSSDONE=true;try{var st=document.createElement('style');st.setAttribute('data-view','1');st.textContent=VCSS;(document.head||document.body).appendChild(st)}catch(e){}}
function low(s){return String(s==null?'':s).replace(/\\/g,'/').toLowerCase()}
function baseOf(s){return String(s==null?'':s).split('::').pop().split(/[\\\/]/).pop()}
function extOf(s){var b=low(baseOf(s)),i=b.lastIndexOf('.');return i>0?b.slice(i+1):''}
function qs(o){var a=[];Object.keys(o).forEach(function(k){if(o[k]!=null&&o[k]!=='')a.push(encodeURIComponent(k)+'='+encodeURIComponent(o[k]))});return a.join('&')}
VIEW.extOf=extOf;VIEW.qs=qs;
VIEW.textual=function(name){var e=extOf(name);return !!e&&TEXT.indexOf(' '+e+' ')>=0};
// ref -> {mod, rel} | {mod?, key[, idx]} | {mod?, path}; the current mod when the ref has none. A key with no mod picked reads the
// game as it ships (the server's files/lib readMod); a rel is a file of the mod and still needs one
function norm(ref){if(!ref)return null;if(typeof ref==='string')ref={rel:ref};var mod=ref.mod||(typeof S!=='undefined'&&S?S.mod:'')||'';
 if(ref.rel!=null&&ref.rel!=='')return mod?{mod:mod,rel:String(ref.rel).replace(/\\/g,'/')}:null;
 if(ref.key){var ko={key:low(ref.key).replace(/^\.?\/+/,''),idx:ref.idx==null||ref.idx===''?undefined:Number(ref.idx)};if(mod)ko.mod=mod;return ko}
 if(ref.path){var o={path:String(ref.path)};if(mod)o.mod=mod;return o}return null}
VIEW.norm=norm;
function nameOf(r){return baseOf(r.rel||r.key||r.path||'')}
VIEW.reg=function(kind,spec){if(!/^[a-z][a-z0-9]*$/.test(String(kind||''))||!spec)throw new Error('VIEW.reg: kind');
 var where=spec.where==='page'?'page':'tab';
 if(where==='tab'&&typeof spec.open!=='function')throw new Error('VIEW.reg '+kind+': open(host, item) is needed');
 if(where==='page'&&typeof spec.go!=='function')throw new Error('VIEW.reg '+kind+': go(item) is needed');
 var s={kind:kind,where:where,label:spec.label||('view.'+kind+'.label'),exts:(spec.exts||[]).map(function(x){return String(x).toLowerCase().replace(/^\./,'')}),
  match:typeof spec.match==='function'?spec.match:null,open:spec.open||null,go:spec.go||null};
 if(!VIEW.specs[kind])VIEW.order.push(kind);VIEW.specs[kind]=s;return s};
// name (a rel, key, path or bare name) -> kind | null (null = text the Editor edits). A kind's match() first, then its exts, then the
// text table (null), then the bytes table ('hex'); anything else is null: the Editor tries it as text and opens it as bytes on a 415.
VIEW.kindOf=function(name,key){var n=String(name||key||''),e=extOf(n),i,s;
 for(i=0;i<VIEW.order.length;i++){s=VIEW.specs[VIEW.order[i]];if(s.match){try{if(s.match(String(name||''),String(key||'')))return s.kind}catch(x){}}}
 if(e)for(i=0;i<VIEW.order.length;i++){s=VIEW.specs[VIEW.order[i]];if(s.exts.indexOf(e)>=0)return s.kind}
 if(e&&TEXT.indexOf(' '+e+' ')>=0)return null;
 if(e&&BIN.indexOf(' '+e+' ')>=0)return 'hex';
 return null};
VIEW.spec=function(kind){return VIEW.specs[kind]||null};
VIEW.label=function(kind){var s=VIEW.specs[kind];return s?tx(s.label):String(kind||'')};
// item: what a kind's open/go gets
VIEW.item=function(ref,name,kind){var r=norm(ref);if(!r)return null;var q={};['mod','rel','key','idx','path'].forEach(function(k){if(r[k]!=null)q[k]=r[k]});
 return {ref:r,name:name||nameOf(r),key:r.key||null,rel:r.rel||null,kind:kind||null,q:qs(q),api:api,size:null}};
// where a kind's Browse opens the folder picker (searchKit spec): the folder of the open file. A key: the game's data view at its folder
// (no resource/ prefix, the part inside a pak dropped); a mod file (rel): that folder on disk in the mod; a disk path: its folder
VIEW.browseAt=function(item){var r=item&&item.ref||{},up=function(p){var a=String(p||'').replace(/\\/g,'/').split('/');a.pop();return a.join('/')};
 if(r.key)return {view:'data',start:up(String(r.key).split('::')[0].replace(/^resource\//,''))};
 if(r.rel&&r.mod){var d=up(String(r.rel).split('::')[0]);return {view:'disk',start:String(r.mod).replace(/[\\\/]+$/,'')+(d?'/'+d:'')}}
 if(r.path)return {view:'disk',start:up(r.path)};return {view:'data',start:''}};
// open a file from any page: a page kind jumps to its page (go); a tab kind and text open in the Editor; no Editor here: a box.
// "Here" is the page's game: the Editor is used only when this game shows it (INGAME.ide), so opening a file never switches the
// game to one that has the Editor (show() would). Pages without the shell's INGAME table (tests, old shells) keep S.sec.ide alone.
function ideHere(){if(typeof S==='undefined'||!S||!S.sec||!S.sec.ide||typeof show!=='function')return false;
 return typeof INGAME==='undefined'||!INGAME||!!INGAME.ide}
VIEW.ideHere=ideHere;
VIEW.open=function(ref,name,opt){opt=opt||{};var r=norm(ref);if(!r){if(typeof toast==='function')toast(tx('view.noMod'));return false}
 name=name||nameOf(r);var k=opt.kind!==undefined?opt.kind:VIEW.kindOf(name,r.key),s=k?VIEW.specs[k]:null;
 if(s&&s.where==='page'&&!opt.tab){var ok=false;try{ok=!!s.go(VIEW.item(r,name,k))}catch(e){ok=false}if(ok)return true;k='hex';s=VIEW.specs.hex}
 if(ideHere()){window.IDE_PENDING=window.IDE_PENDING||[];
  var p={ref:r,line:opt.line||0,col:opt.col||0};if(k)p.view=k;window.IDE_PENDING.push(p);show('ide');return true}
 if(!k)k='hex';VIEW.popup(r,name,k);return true};
// a viewer inside any element -> handle {kind, item, el, close(), focus(), refresh(), hide(), show()}
VIEW.mount=function(host,ref,name,opt){vcss();opt=opt||{};var r=norm(ref),k=opt.kind||VIEW.kindOf(name||(r?nameOf(r):''),r&&r.key)||'hex',s=VIEW.specs[k];
 if(!s||s.where!=='tab'){k='hex';s=VIEW.specs.hex}
 var box=h('div',{class:'vw-host','data-kind':k});host.appendChild(box);
 var it=r?VIEW.item(r,name,k):null,hd=null;
 if(!it)box.appendChild(h('div',{class:'err',text:tx('view.noMod')}));
 else if(!s)box.appendChild(h('div',{class:'err',text:tx('view.noKind',{k:k})}));
 else{try{hd=s.open(box,it)||null}catch(e){box.appendChild(h('div',{class:'err',text:tx('view.fail',{m:e.message})}))}}
 hd=hd||{};var gone=false;
 function call(f){if(gone||typeof hd[f]!=='function')return;try{return hd[f]()}catch(e){if(window.console)console.error('VIEW '+k+' '+f,e)}}
 return {kind:k,item:it,el:box,close:function(){call('close');gone=true;if(box.parentNode)box.parentNode.removeChild(box)},
  focus:function(){if(typeof hd.focus==='function')call('focus');else if(box.focus){box.setAttribute('tabindex','-1');box.focus()}},
  refresh:function(){call('refresh')},hide:function(){call('hide')},show:function(){call('show')}}};
// a viewer in a box over the page (a page without the Editor); Esc or Close ends it and the viewer
VIEW.popup=function(ref,name,kind){vcss();var dl=h('dialog',{class:'vw-dlg','aria-label':name||''}),body=h('div',{class:'vw-dlg-b'}),hd=null;
 function end(){if(hd){hd.close();hd=null}if(dl.open&&dl.close)dl.close();if(dl.parentNode)dl.parentNode.removeChild(dl)}
 dl.appendChild(h('div',{class:'vw-dlg-h'},[h('b',{text:name||''}),h('button',{type:'button',text:tx('view.close'),onclick:end})]));dl.appendChild(body);
 dl.addEventListener('close',function(){if(hd)end()});
 document.body.appendChild(dl);if(dl.showModal)dl.showModal();hd=VIEW.mount(body,ref,name,{kind:kind});return {close:end}};
// bytes: the whole file (32 MB at most) as a Uint8Array
VIEW.b64=function(s){var bin=atob(String(s||'')),n=bin.length,u=new Uint8Array(n);for(var i=0;i<n;i++)u[i]=bin.charCodeAt(i);return u};
VIEW.bytes=function(item){return api('/api/x/view/bytes?'+item.q,undefined,{what:tx('view.job.read')}).then(function(j){var u=VIEW.b64(j.b64);item.size=j.size;return u})};
// facts of the file (size, where, first bytes, type): asked once per item
VIEW.info=function(item){if(!item._info)item._info=api('/api/x/view/info?'+item.q,undefined,{what:tx('view.job.read')}).then(function(o){item.size=o.size;return o},function(e){item._info=null;throw e});return item._info};
VIEW.size=function(n){n=+n||0;if(n<1024)return tx('view.u.b',{n:n});if(n<1048576)return tx('view.u.kb',{n:(n/1024).toFixed(1)});if(n<1073741824)return tx('view.u.mb',{n:(n/1048576).toFixed(1)});return tx('view.u.gb',{n:(n/1073741824).toFixed(2)})};
VIEW.where=function(o){if(!o)return '';var w=o.where==='mine'?tx('view.w.mine'):o.where==='vanilla'?tx('view.w.game'):o.where==='othermod'?tx('view.w.mod',{m:o.layer||''}):tx('view.w.outside');
 return o.inPak?w+', '+tx('view.w.inpak',{p:o.inPak}):w};
VIEW.typeText=function(o){var t=o&&o.type||'data',k='view.t.'+t,v=tx(k);return v===k?t:v};
// the header card every viewer may show: name, size, where it comes from, type, first bytes; rows = [[label text, value text]] more
VIEW.head=function(item,o,rows){vcss();var kv=h('div',{class:'vw-kv'});
 function row(k,v,cls){kv.appendChild(h('span',{class:'vw-k',text:k}));kv.appendChild(h('span',{class:cls||'vw-v',text:v==null?'':String(v)}))}
 row(tx('view.h.size'),VIEW.size(o.size)+'  ('+tx('view.u.bytes',{n:o.size})+')');row(tx('view.h.where'),VIEW.where(o));
 if(o.key)row(tx('view.h.key'),o.key);row(tx('view.h.type'),VIEW.typeText(o));row(tx('view.h.magic'),o.magic||'','vw-v vw-mono');
 (rows||[]).forEach(function(r){row(r[0],r[1])});
 return h('div',{class:'vw-head'},[h('b',{class:'vw-name',text:item&&item.name||o.name||''}),kv])};
`;
const css = [
  '.vw-host{display:flex;flex-direction:column;min-height:0;min-width:0;height:100%;box-sizing:border-box;color:var(--fg)}',
  '.vw-head{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-bottom:1px solid var(--line);background:var(--card)}',
  '.vw-name{font-size:14px;word-break:break-all}',
  '.vw-kv{display:grid;grid-template-columns:max-content 1fr;gap:2px 14px;font-size:12px}',
  '.vw-k{color:var(--hint)}.vw-v{word-break:break-all}',
  '.vw-mono{font-family:Consolas,monospace}',
  '.vw-dlg{width:min(980px,94vw);height:min(720px,88vh);padding:0;border:1px solid var(--line);background:var(--card);color:var(--fg)}',
  '.vw-dlg[open]{display:flex;flex-direction:column}',
  '.vw-dlg-h{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--line)}.vw-dlg-h b{flex:1;word-break:break-all}',
  '.vw-dlg-b{flex:1 1 auto;min-height:0;position:relative}',
].join('\n');
module.exports = {
  css,
  script: allCss => '(function(){\nvar VCSS=' + JSON.stringify(String(allCss || '')) + ';\n' + BODY + '\n})();',
};
