// Map Viewer rule layers (MV-PG2, builder PG2a): obstacles (group objects), cover, sight and the viewshed tool (groups
// cover, sight, viewshed), movement (group movement: pass, move, travel, routes, route density). Contract: freeze page-pg2.md 4 and 5,
// jobs.md 4 and 7 (layer names, pal paths), rules.md 3.1, 4.1, 5.1 (values), 9 (per game). One page for as64, mowas2 and
// goh: no branch on as64; a goh branch only for the legend lines of page-pg2.md 5.
// - Fixed names (cover.*, sight.field, sight.grid, sight.fire.top) are fetched by the shell (addLayer source) and drawn
//   here from view.env. Names that carry the unit kind, the phase or the clicked spot (obst.<kind>, pass.<kind>,
//   move.<kind>, travel.<side>.<kind>, route.<side>.<kind>, routes, the four viewshed products) are fetched by this part
//   (hover pattern): its store is keyed on target, game, mod, map, mode, kind, name and the extra fields; a 404 need shows
//   "not made" and one Make button in the part's panel; a running job of that need shows its words.
// - The viewshed click is the user's Make: it snaps to the sight cell corner and posts the view job at once when a GET says
//   it is not made. A pose or kind change asks again and shows Make, never a job.
// - Pickers: EXT_SCREENS.mapviz.picks gets entry 'cover' (cover edges and points near a point) for the card part.
// - EXT_SCREENS.mapviz.layersKit = {CELL, snap, parseAt} (pure helpers, tests).
// Author: Imperator_Aug (ARSENAL, ia-2ffca229)
module.exports = String.raw`
(function(){
var MV=EXT_SCREENS.mapviz;if(!MV||!MV.parts)return;
// sight cell in u per game (rules.md 3.3 CELL, 9.1) [V; GoH GHMAP-20, GHVIS-121]; the only game number
// the page holds: the click snap needs it before any product exists
var CELL={as2:7,goh:5};
var UPM=20,CAP=200,ISO=10;
var BANDS=['none','lie','low','kneel','squat','stand'];
var POSES=['stand','kneel','prone'];
var RINGS=['sight','aim','binocular','uncover','exact'];
var CROSS=['water','swamp','object'];
var VIEWN=['sight.view','sight.vis','sight.fire','sight.rings'];
function gameOf(t){return t==='goh'?'goh':'as2'}
function r2(v){var r=Math.round(v*100)/100;return r===0?0:r}
// snap(x, y, net, target) -> {at, x, y, i, j, c}: the south-west corner of the sight cell that holds the point (page-pg2
// 4.3; rules.md ruling 5: the CLI snaps again to the same value); null without a map grid or with a point that is no number.
// The at string has 2 decimals (the shell rounds to 2); with an offset that is not whole the rounded corner can lie just
// under the true corner, so the CLI's floor would take the cell before: then the string is the next 0.01 up, which the
// same floor (rules/sight snap: ox + floor((x - ox) / C) * C) keeps in this cell.
function s2(v,o,C,i){var a=r2(v);if(Math.floor((a-o)/C)!==i)a=r2(Math.round(v*100)/100+0.01);return a}
function snap(x,y,net,target){if(typeof x!=='number'||typeof y!=='number'||!isFinite(x)||!isFinite(y)||!net||typeof net.offX!=='number'||typeof net.offY!=='number')return null;
 var C=CELL[gameOf(target)],ox=-net.offX,oy=-net.offY,i=Math.floor((x-ox)/C),j=Math.floor((y-oy)/C),sx=i*C+ox,sy=j*C+oy;
 return {at:String(s2(sx,ox,C,i))+','+String(s2(sy,oy,C,j)),x:sx,y:sy,i:i,j:j,c:C}}
// parseAt("x,y" or [x, y]) -> [x, y] or null: two finite numbers, nothing else
function parseAt(s){var p=Array.isArray(s)?s:typeof s==='string'?s.split(','):null;if(!p||p.length!==2)return null;var a=[],k;
 for(k=0;k<2;k++){if(typeof p[k]==='number'){a.push(p[k]);continue}var t=String(p[k]).replace(/\s+/g,'');if(!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t))return null;a.push(Number(t))}
 return isFinite(a[0])&&isFinite(a[1])?a:null}
MV.layersKit={CELL:CELL,snap:snap,parseAt:parseAt,BANDS:BANDS,POSES:POSES,RINGS:RINGS};
MV.parts.push({id:'layers',init:function(V){
 if(!V||V.q('rmt'))return;
 var K=MV.kit||null,ST={},SEEN={},pend={},vis=null,pose='stand',spot=null,el={},ptag=0,last={ctx:null,kind:null};
 function W(k,a){return tx('mapviz.layers.'+k,a||{})}
 function word(k,fb){var s=tx(k);return s===k?fb:s}
 function na(){return new Error(W('na'))}
 function isGoh(){return V.q('target')==='goh'}
 function c4(hx){return K&&K.colour?K.colour(hx):null}
 function h2(n){var s=Math.max(0,Math.min(255,Math.round(n))).toString(16);return s.length<2?'0'+s:s}
 function hexOf(c){return c?'\x23'+h2(c[0])+h2(c[1])+h2(c[2])+h2(c[3]):null}
 function fade(hx,f){var c=c4(hx);return c?hexOf([c[0],c[1],c[2],c[3]*f]):null}
 function palAt(p){var v=V.pal;String(p).split('.').forEach(function(k){v=v&&typeof v==='object'?v[k]:undefined});return v===undefined?null:v}
 function P(){if(!V.pal||typeof V.pal!=='object')throw na();return V.pal}
 function palOk(env,wants){return env.pal==null||wants.indexOf(env.pal)>=0}
 function m1(u){var s=(Math.round(u/UPM*10)/10).toFixed(1);return s==='-0.0'?'0.0':s}
 function mm(u){var r=Math.round(u/UPM*100)/100;return String(r===0?0:r)}
 function errText(e){if(!e)return '';if(e.key&&/^mapviz\./.test(e.key))return tx(e.key,{msg:(e.params&&e.params.msg)||e.message||''});return String(e.text||e.message||e)}
 function needOf(e){var p=e&&(e.params||(e.reply&&e.reply.params));return e&&e.status===404&&p&&p.need&&p.need.what?p.need:null}
 // the shell refuses job and request fields it does not know yet (phase, at, pose before its update): not available yet
 function notYet(e){var m=e&&e.params&&e.params.msg;return !!e&&e.key==='mapviz.err.MV_USAGE'&&(m==='phase'||m==='at'||m==='pose')}
 function bandWord(b){var id=typeof b==='number'?BANDS[b]:b;return id?word('mapviz.layers.band.'+id,String(id)):String(b)}
 function kindWord(k){return word('mapviz.shell.kind.'+k,String(k))}
 function whatWord(w){return word('mapviz.shell.what.'+w,String(w))}
 // ---- palette colours (V.pal; jobs.md 7 and page-pg2 ruling 5; a code with no entry yet falls back as noted) ----
 function codeFill(list,code){if(!Array.isArray(list))return null;for(var i=0;i<list.length;i++){var e=list[i];if(e&&(typeof e.code==='number'?e.code:i)===code)return e.fill||null}return null}
 // pass codes 5 to 7 come with wave C (rules.md 8); until then 5 = masks.blocked, 6 = the slow colour, 7 = masks.outsidePather
 function passFill(code){var p=P(),pc=p.pass&&p.pass.codes,f=codeFill(pc,code),m=p.masks||{};if(f)return f;
  if(code===5)return m.blocked&&m.blocked.fill||null;if(code===6)return codeFill(pc,2);if(code===7)return m.outsidePather&&m.outsidePather.fill||null;return null}
 function bandFill(b){var p=P();return codeFill(p.cover&&p.cover.bands,b)}
 function sightP(){var s=P().sight;if(!s)throw na();return s}
 function fireFill(c){var p=P(),f=p.sight&&p.sight.fire,k=['','clear','terrain','object','water'][c];if(f&&f[k])return f[k];
  if(c===1)return sightP().seen;if(c===2)return passFill(4);if(c===3)return passFill(5);if(c===4)return codeFill(p.water&&p.water.bands,2);return null}
 var CODES={
  obst:{max:3,fill:function(c){return c===1?passFill(6):c===2?passFill(5):fade(passFill(5),0.5)}},
  move:{max:7,fill:passFill},pass:{max:4,fill:passFill},
  band:{max:5,fill:bandFill},
  lip:{max:1,fill:function(){var l=P().cover&&P().cover.lip;return l&&l.fill}},
  conceal:{max:3,fill:function(c){var f=P().cover&&P().cover.conceal&&P().cover.conceal.fill;return c===3?f:fade(f,c===2?0.75:0.5)}},
  field:{max:2,fill:function(c){var p=P();return c===1?(p.masks&&p.masks.blocked&&p.masks.blocked.fill):(p.cover&&p.cover.conceal&&p.cover.conceal.fill)}},
  view:{max:3,fill:function(c){var s=sightP();return c===1?s.seen:c===2?s.hidden:s.partly}},
  fire:{max:4,fill:fireFill}};
 function stopsFn(stops){var st=(Array.isArray(stops)?stops:[]).map(function(s){return {at:s.at,c:c4(s.color)}}).filter(function(s){return s.c&&typeof s.at==='number'});if(!st.length)throw na();
  return function(t){var k;if(t<=st[0].at)return st[0].c;for(k=1;k<st.length;k++)if(t<=st[k].at)break;if(k>=st.length)return st[st.length-1].c;var a=st[k-1],b=st[k],u=b.at>a.at?(t-a.at)/(b.at-a.at):0;
   return [0,1,2,3].map(function(n){return Math.round(a.c[n]+(b.c[n]-a.c[n])*u)})}}
 // ---- grids: decode once, one off-screen picture per envelope and palette ----
 function decOf(env){if(env._mvd)return env._mvd;var d;try{d=K&&K.decode?K.decode(env):null}catch(e){throw na()}if(!d||!d.vals)throw na();env._mvd=d;return d}
 function picture(env,tag,mk){var t=tag+'|'+ptag;if(env._mvl&&env._mvl.tag===t)return env._mvl;var dec=decOf(env),fn=mk(dec,env);
  var cv=typeof document!=='undefined'&&document&&document.createElement?document.createElement('canvas'):null,c2=cv&&cv.getContext?cv.getContext('2d'):null;if(!c2||!c2.createImageData)throw na();
  cv.width=dec.w;cv.height=dec.h;var img=c2.createImageData(dec.w,dec.h),d=img.data,i,j;
  for(j=0;j<dec.h;j++)for(i=0;i<dec.w;i++){var v=dec.vals[j*dec.w+i],c=v===v?fn(v,i,j):null;if(!c)continue;var o=((dec.h-1-j)*dec.w+i)*4;d[o]=c[0];d[o+1]=c[1];d[o+2]=c[2];d[o+3]=c[3]}
  c2.putImageData(img,0,0);env._mvl={tag:t,cv:cv,rect:[env.ox,env.oy,env.ox+env.w*env.cell,env.oy+env.h*env.cell]};return env._mvl}
 function blit(ctx,view,pic){if(!ctx||!ctx.drawImage)return;var p=view.toScreen(pic.rect[0],pic.rect[3]),q=view.toScreen(pic.rect[2],pic.rect[1]);
  if('imageSmoothingEnabled' in ctx)ctx.imageSmoothingEnabled=false;ctx.drawImage(pic.cv,p[0],p[1],q[0]-p[0],q[1]-p[1])}
 // a code grid: 0 = nothing; a code past the layer's codes (or not whole) makes the layer not available
 function codeMk(set){return function(){var by={},k;for(k=1;k<=set.max;k++)by[k]=c4(set.fill(k));
  return function(v){if(v!==Math.floor(v)||v<0||v>set.max)throw na();return v?by[v]||null:null}}}
 function rampMk(stopsPath,nod){return function(dec){var fn=stopsFn(palAt(stopsPath)),lo=Infinity,hi=-Infinity,i;
  for(i=0;i<dec.vals.length;i++){var x=dec.vals[i];if(x===x&&!(nod!=null&&x===nod)){if(x<lo)lo=x;if(x>hi)hi=x}}
  return function(v){if(nod!=null&&v===nod)return null;return fn(hi>lo?(v-lo)/(hi-lo):0)}}}
 // lowest visible height in cm: from the seen colour (low: easy to see) to the partly colour; 65535 = nothing
 function visMk(dec){var s=sightP(),a=c4(s.seen),b=c4(s.partly),hi=0,i;if(!a||!b)throw na();for(i=0;i<dec.vals.length;i++){var x=dec.vals[i];if(x===x&&x<65535&&x>hi)hi=x}
  return function(v){if(v>=65535||v<0)return null;var t=hi>0?v/hi:0;return [0,1,2,3].map(function(n){return Math.round(a[n]+(b[n]-a[n])*t)})}}
 // travel seconds: the travel stops over 0 .. the slowest reached cell; an iso line cell where the 10 s band changes
 function travelMk(dec){var p=P().pass&&P().pass.travel;if(!p)throw na();var fn=stopsFn(p.stops),iso=c4(p.iso),hi=0,i;
  for(i=0;i<dec.vals.length;i++){var x=dec.vals[i];if(x===x&&x>hi)hi=x}
  function at(i,j){if(i<0||j<0||i>=dec.w||j>=dec.h)return NaN;return dec.vals[j*dec.w+i]}
  return function(v,i,j){if(!(v>=0))return null;var b=Math.floor(v/ISO),l=at(i-1,j),d=at(i,j-1);
   if(iso&&((l>=0&&Math.floor(l/ISO)!==b)||(d>=0&&Math.floor(d/ISO)!==b)))return iso;return fn(hi>0?v/hi:0)}}
 // route density: the route line colour, alpha = value / 250 (page-pg2 ruling 5)
 function densMk(){var r=P().pass&&P().pass.route,c=r&&c4(r.line);if(!c)throw na();return function(v){if(v<=0)return null;if(v>250)throw na();return [c[0],c[1],c[2],Math.round(255*v/250)]}}
 // ---- the store: products this part fetches itself (kind, phase, spot) ----
 function ctxSig(){return [V.q('target')||'',V.q('game')||'',V.q('mod')||'',V.q('map')||'',V.q('mode')||''].join('|')}
 function sig(){return ctxSig()+'|'+(V.q('kind')||'')}
 function phaseQ(){var p=V.q('phase');return typeof p==='number'&&p>=0&&Math.floor(p)===p?{phase:p}:{}}
 // the layers keyed by phase too (page-pg2 S4, late G6): an entry of another phase is not of this context
 var PHL={'travel.a':1,'travel.b':1,'route.a':1,'route.b':1,routes:1};
 function phaseStale(e){return !!e&&!!PHL[e.lid]&&(e.q&&e.q.phase)!==phaseQ().phase}
 function keyOf(name,q){return sig()+'|'+name+'|'+JSON.stringify(q||{})}
 function relist(){if(typeof V.relist==='function')V.relist()}
 // an answer landed: the rows, the spot (a clicked spot whose products are not made posts its view job now), the map, the lists
 function landed(){drawRows();if(spot)settleSpot();else drawSpot();V.redraw();relist()}
 function getEnv(name,q){var b={name:name},k;for(k in q||{})b[k]=q[k];
  // the viewshed vector is sight.rings (file sight.rings.json); the grid sight.view keeps its own name
  return V.api('GET','layer',b)}
 // fetchOne(lid, name, q) -> the store entry {state:'busy'|'ready'|'need'|'error', env, need, err}; null when nothing can be
 // asked (no target, no map, or the document is being read: the mode comes with it)
 function fetchOne(lid,name,q){if(!V.q('target')||!V.q('map')||V.q('docBusy'))return null;var k=keyOf(name,q),e=ST[k];if(e)return e;
  e=ST[k]={state:'busy',lid:lid,name:name,q:q||{},key:k};var p;try{p=getEnv(name,q)}catch(x){p=Promise.reject(x)}
  p.then(function(env){if(ST[k]!==e)return;e.state='ready';e.env=env;landed()},
   function(er){if(ST[k]!==e)return;if(er&&er.stale){delete ST[k];return}var n=needOf(er);if(n){e.state='need';e.need=n}else{e.state='error';e.err=er}landed()});
  drawRows();return e}
 function readyEnv(e){return e&&e.state==='ready'?e.env:null}
 // a page job of this what (and of the need's fields, as far as the shell's job list carries them) or one this part posted
 function fits(ja,na2){ja=ja||{};for(var k in na2||{}){if(!Object.prototype.hasOwnProperty.call(na2,k)||na2[k]==null)continue;var v=ja[k];if(v==null){if(k==='map'||k==='phase'||k==='at'||k==='pose')continue;return false}if(String(v)!==String(na2[k]))return false}return true}
 function pkey(n){return n.what+'|'+JSON.stringify(n.args||{})}
 function runText(n){var js=V.q('jobs')||[],i;for(i=0;i<js.length;i++){var d=js[i];if(d&&d.what===n.what&&d.target===V.q('target')&&(!d.map||d.map===V.q('map'))&&fits(d.args,n.args))return d.text||whatWord(n.what)}
  return pend[pkey(n)]?whatWord(n.what):null}
 function make(n,then){var pk=pkey(n);if(pend[pk])return;pend[pk]=true;drawRows();drawSpot();var p;try{p=V.job(n.what,n.args||{})}catch(x){p=Promise.reject(x)}
  p.then(function(){delete pend[pk];dropNeed(n);if(then)then(null);landed()},function(e){delete pend[pk];if(then)then(e);else Object.keys(ST).forEach(function(k){var s=ST[k];if(s.state==='need'&&pkey(s.need)===pk){s.state='error';s.err=e}});landed()})}
 function dropNeed(n){var pk=pkey(n);Object.keys(ST).forEach(function(k){var s=ST[k];if(s.state==='need'&&pkey(s.need)===pk)delete ST[k]})}
 function seenSet(id,env){var s=SEEN[id],g=sig();if(s&&s.env===env&&s.sig===g)return false;SEEN[id]={sig:g,env:env};return true}
 function seenEnv(id){var s=SEEN[id];return s&&s.sig===sig()?s.env:null}
 // ---- layers ----
 function gridDraw(id,wants,tag,mk,envOf){return function(ctx,view){var env=envOf?envOf():view.env;if(!env)return;if(env.kind!=='grid'||!palOk(env,wants))throw na();
  seenSet(id,env);blit(ctx,view,picture(env,tag,mk))}}
 // own fetch of a kind (or phase) layer: an error answer shows on the layer row (thrown), a need in the part's panel
 function own(id,name,q){var e=fetchOne(id,name,q);if(e&&e.state==='error')throw new Error(notYet(e.err)?W('notYet'):errText(e.err));return readyEnv(e)}
 function sideOn(s){var p=V.q('side');return p==='both'||p===s||!p}
 var HOV={};
 function grid(o){HOV[o.id]=!!o.hover;var mk=o.mk,src=o.own?null:o.source;
  var d=gridDraw(o.id,o.wants,o.id,mk,o.own?function(){if(o.only&&!o.only())return null;return own(o.id,o.own(),o.q?o.q():{})}:null);
  V.addLayer({id:o.id,group:o.group,label:'mapviz.layers.l.'+o.id,engineTrue:o.eng,engineTrueGoh:typeof o.engGoh==='boolean'?o.engGoh:undefined,defaultOn:o.on,source:src||undefined,draw:d,legend:o.legend,hit:o.hit,list:o.list,tool:o.tool||undefined})}
 function codeWord(set,c){return word('mapviz.layers.'+set+'.'+c,String(c))}
 function cellVal(env,x,y){if(!env||env.kind!=='grid')return null;var dec;try{dec=decOf(env)}catch(e){return null}var i=Math.floor((x-env.ox)/env.cell),j=Math.floor((y-env.oy)/env.cell);
  if(i<0||j<0||i>=dec.w||j>=dec.h)return null;var v=dec.vals[j*dec.w+i];return v===v?v:null}
 // hit rows carry part 'layers' (page-pg2 late G8: the card opens only on a layers or objects hit)
 function codeHit(id,set){return function(x,y){var v=cellVal(seenEnv(id),x,y);if(v==null||v<=0)return null;return [{label:'mapviz.layers.l.'+id,value:set==='band'?bandWord(v):codeWord(set,v),part:'layers'}]}}
 function legRows(list){return function(){try{var r=list();return r&&r.length?r:null}catch(e){return null}}}
 function cv(set,c){return CODES[set].fill(c)}
 // obstacles of the unit kind (group objects): 1 crossable (crush or vault), 2 blocks, 3 margin
 grid({id:'obst',group:'objects',eng:true,on:false,wants:['pass.codes'],mk:codeMk(CODES.obst),own:function(){return 'obst.'+V.q('kind')},hover:true,hit:codeHit('obst','obst'),
  legend:legRows(function(){var r=[1,2,3].map(function(c){return {color:cv('obst',c),label:W('obst.'+c)}});if(isGoh())r.push({color:null,label:W('leg.vault')});return r})});
 // cover (group cover)
 function gohCover(r){if(isGoh())r.push({color:null,label:W('leg.coverGoh')});return r}
 // cover on Gates of Hell (engGoh false): the bands, lips, concealment and cover points are the AS64 cover detector ported
 // and run on GoH maps; that GoH uses the same rule and heights is inferred, not read from its code (shell tip g.cover.goh,
 // fix-later gui row "cover bands on GoH")
 grid({id:'cover.band',group:'cover',eng:true,engGoh:false,on:false,source:'cover.band',wants:['cover.bands','cover'],mk:codeMk(CODES.band),hover:true,hit:codeHit('cover.band','band'),
  legend:legRows(function(){return gohCover([1,2,3,4,5].map(function(c){return {color:bandFill(c),label:bandWord(c)}}))})});
 grid({id:'cover.lip',group:'cover',eng:true,engGoh:false,on:false,source:'cover.lip',wants:['cover.lip','cover'],mk:codeMk(CODES.lip),
  legend:legRows(function(){var e=seenEnv('cover.lip'),r=[{color:cv('lip',1),label:W('leg.lip')}];if((e&&e.meta&&e.meta.used===false)||(!e&&isGoh()))r.push({color:null,label:W('leg.lipUnused')});return gohCover(r)})});
 grid({id:'cover.conceal',group:'cover',eng:true,engGoh:false,on:false,source:'cover.conceal',wants:['cover.conceal','cover'],mk:codeMk(CODES.conceal),
  legend:legRows(function(){var r=[1,2,3].map(function(c){return {color:cv('conceal',c),label:W('conceal.'+c)}});r.push({color:null,label:W('leg.conceal')});return gohCover(r)})});
 // cover edges and points: vectors the shell fetches; lists, hits and the picker read the envelope the draw saw (or the
 // part's own fetch of the same name while no draw has seen one: no canvas)
 function vecOk(e,wants){return !!e&&e.kind==='vector'&&Array.isArray(e.items)&&palOk(e,wants)}
 function vecOf(id,wants){var e=seenEnv(id);if(e)return vecOk(e,wants)?e:null;var s=readyEnv(fetchOne(id,id,{}));if(s&&vecOk(s,wants)){seenSet(id,s);return s}return null}
 var CW=['cover','cover.bands','cover.point'];
 function css(hx){return K&&K.colourCss?K.colourCss(hx):''}
 function edgeMid(it){return it.kind==='coverRing'?[it.x,it.y]:[(it.a[0]+it.b[0])/2,(it.a[1]+it.b[1])/2]}
 function edgeOk(it){return it&&((it.kind==='coverEdge'&&Array.isArray(it.a)&&Array.isArray(it.b))||(it.kind==='coverRing'&&typeof it.x==='number'&&typeof it.r==='number'))}
 // an edge of an object marked vaultable (rules.md 9.2: entry.vaultable, true only where the data says so) says so
 function edgeText(it){var len=it.kind==='coverRing'?2*Math.PI*it.r/UPM:it.lenM;return (it.vaultable===true?function(o){return W('edgeVault',o)}:function(o){return W('edgeItem',o)})({def:String(it.def||''),band:bandWord(it.band),len:typeof len==='number'?(Math.round(len*10)/10).toFixed(1):'?',top:typeof it.topM==='number'?(Math.round(it.topM*10)/10).toFixed(1):'?'})}
 function drawEdges(ctx,view){var e=view.env;if(!e)return;if(!vecOk(e,CW))throw na();if(seenSet('cover.edges',e))relist();if(!ctx.beginPath)return;var tk=P().cover&&P().cover.tick||{},z=view.zoom||1;
  e.items.forEach(function(it){if(!edgeOk(it)){if(it&&it.kind==='coverSector'&&typeof it.x==='number'){var q=view.toScreen(it.x,it.y);ctx.strokeStyle=css(tk.line);ctx.lineWidth=1;if(ctx.strokeRect)ctx.strokeRect(q[0]-3,q[1]-3,6,6)}return}
   var col=css(bandFill(it.band))||css(tk.line);ctx.strokeStyle=col;ctx.lineWidth=3;ctx.beginPath();
   if(it.kind==='coverRing'){var c=view.toScreen(it.x,it.y);ctx.arc(c[0],c[1],Math.max(it.r*z,2),0,Math.PI*2);ctx.stroke();return}
   var a=view.toScreen(it.a[0],it.a[1]),b=view.toScreen(it.b[0],it.b[1]);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
   // the tick on the protected side: the left of a->b when side is 1, the right when -1 (world frame)
   var dx=it.b[0]-it.a[0],dy=it.b[1]-it.a[1],L=Math.sqrt(dx*dx+dy*dy);if(!(L>0))return;var s=it.side===-1?-1:1,len=(tk.length||4)/z,m=edgeMid(it),n=[-dy/L*s*len,dx/L*s*len],p=view.toScreen(m[0],m[1]),q2=view.toScreen(m[0]+n[0],m[1]+n[1]);
   ctx.strokeStyle=css(tk.line)||col;ctx.lineWidth=tk.width||1.5;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q2[0],q2[1]);ctx.stroke()})}
 function ptOk(it){return it&&it.kind==='coverPoint'&&typeof it.x==='number'&&typeof it.y==='number'}
 function rowFill(it){var p=P().cover&&P().cover.point;return (p&&(it.row===1?p.row1:p.row0))||bandFill(it.band)}
 function drawPoints(ctx,view){var e=view.env;if(!e)return;if(!vecOk(e,CW))throw na();if(seenSet('cover.points',e))relist();if(!ctx.beginPath)return;
  e.items.forEach(function(it){if(!ptOk(it))return;var q=view.toScreen(it.x,it.y);ctx.beginPath();ctx.arc(q[0],q[1],3,0,Math.PI*2);ctx.fillStyle=css(rowFill(it));ctx.fill()})}
 function typeWord(t){return word('mapviz.layers.ctype.'+t,String(t))}
 function d2seg(p,a,b){var dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy,t=L>0?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L:0;t=Math.max(0,Math.min(1,t));var x=a[0]+dx*t-p[0],y=a[1]+dy*t-p[1];return Math.sqrt(x*x+y*y)}
 function on(id){return !vis||vis.indexOf(id)>=0}
 // picks near (x, y) within tolU: cover edges (segment or ring) and cover points, nearest first
 function coverAt(x,y,tolU){var out=[],p=[x,y],e,i;tolU=tolU>0?tolU:0;
  if(on('cover.edges')&&(e=vecOf('cover.edges',CW)))for(i=0;i<e.items.length;i++){var it=e.items[i];if(!edgeOk(it))continue;
   var d=it.kind==='coverRing'?Math.abs(Math.sqrt((x-it.x)*(x-it.x)+(y-it.y)*(y-it.y))-it.r):d2seg(p,it.a,it.b);if(d<=tolU)out.push({type:'coverEdge',item:it,d:d})}
  if(on('cover.points')&&(e=vecOf('cover.points',CW)))for(i=0;i<e.items.length;i++){var pt=e.items[i];if(!ptOk(pt))continue;var dd=Math.sqrt((x-pt.x)*(x-pt.x)+(y-pt.y)*(y-pt.y));if(dd<=tolU)out.push({type:'coverPoint',item:pt,d:dd})}
  out.sort(function(a,b){return a.d-b.d});return out.map(function(o){return {type:o.type,item:o.item}})}
 function tolU(){var z=V.view&&V.view.zoom;return z>0?6/z:6}
 V.addLayer({id:'cover.edges',group:'cover',label:'mapviz.layers.l.cover.edges',engineTrue:false,defaultOn:true,source:'cover.edges',draw:drawEdges,
  hit:function(x,y){var c=coverAt(x,y,tolU()).filter(function(o){return o.type==='coverEdge'})[0];return c?[{label:'mapviz.layers.l.cover.edges',value:edgeText(c.item),part:'layers'}]:null},
  list:function(){var e=vecOf('cover.edges',CW);if(!e)return [];return e.items.filter(edgeOk).slice(0,CAP).map(function(it){var m=edgeMid(it);return {label:edgeText(it),x:m[0],y:m[1]}})},
  legend:legRows(function(){var r=[1,2,3,4,5].map(function(c){return {color:bandFill(c),label:bandWord(c)}});r.push({color:null,label:W('leg.edges')});r.push({color:null,label:W('leg.sectors')});return gohCover(r)})});
 function ptText(it){return W('pointItem',{type:typeWord(it.type),band:bandWord(it.band)})}
 V.addLayer({id:'cover.points',group:'cover',label:'mapviz.layers.l.cover.points',engineTrue:true,engineTrueGoh:false,defaultOn:false,source:'cover.points',draw:drawPoints,
  hit:function(x,y){var c=coverAt(x,y,tolU()).filter(function(o){return o.type==='coverPoint'})[0];return c?[{label:'mapviz.layers.l.cover.points',value:ptText(c.item),part:'layers'}]:null},
  // at most 200 in the list, the highest band first
  list:function(){var e=vecOf('cover.points',CW);if(!e)return [];return e.items.filter(ptOk).slice().sort(function(a,b){return (b.band||0)-(a.band||0)}).slice(0,CAP).map(function(it){return {label:ptText(it),x:it.x,y:it.y}})},
  legend:legRows(function(){var p=P().cover&&P().cover.point,r=[];r.push({color:p&&p.row0||null,label:W('leg.row0')});r.push({color:p&&p.row1||null,label:W('leg.row1')});r.push({color:null,label:W('leg.points')});return gohCover(r)})});
 // sight (group sight); fixed names the shell fetches
 grid({id:'sight.field',group:'sight',eng:true,on:false,source:'sight.field',wants:['sight','masks'],mk:codeMk(CODES.field),hover:true,hit:codeHit('sight.field','field'),
  legend:legRows(function(){return [{color:cv('field',1),label:W('field.1')},{color:cv('field',2),label:W('field.2')},{color:null,label:W(isGoh()?'leg.thinGoh':'leg.thin')}]})});
 grid({id:'sight.grid',group:'sight',eng:true,on:false,source:'sight.grid',wants:['height'],mk:rampMk('height.stops'),
  legend:legRows(function(){var s=palAt('height.stops');return [{color:s[0].color,label:W('leg.low')},{color:s[s.length-1].color,label:W('leg.high')},{color:null,label:W('leg.grid')}]})});
 grid({id:'sight.fire.top',group:'sight',eng:true,on:false,source:'sight.fire.top',wants:['height'],mk:rampMk('height.stops',-32768),
  legend:legRows(function(){var s=palAt('height.stops');return [{color:s[0].color,label:W('leg.low')},{color:s[s.length-1].color,label:W('leg.high')},{color:null,label:W('leg.fireTop')}]})});
 // the viewshed: tool layers that hang on the clicked spot (never in a permalink)
 function spotQ(){return spot?{at:spot.at,pose:spot.pose}:null}
 function spotEnv(name){if(!spot||spot.ctx!==ctxSig()||spot.kind!==V.q('kind'))return null;var e=ST[keyOf(name,spotQ())];return readyEnv(e)}
 function atOk(env){var a=env&&env.meta&&env.meta.at;return a==null||!!parseAt(a)}
 // the tool layers draw only a spot result; a meta.at that is not two numbers makes the layer not available
 function vgDraw(id,wants,mk){return function(ctx,view){var env=spotEnv(id);if(!env)return;if(env.kind!=='grid'||!palOk(env,wants)||!atOk(env))throw na();blit(ctx,view,picture(env,id,mk))}}
 V.addLayer({id:'sight.view',group:'viewshed',label:'mapviz.layers.l.sight.view',engineTrue:true,defaultOn:true,tool:true,draw:vgDraw('sight.view',['sight'],codeMk(CODES.view)),
  list:function(){var e=ringsEnv();if(!e)return [];return e.items.filter(function(it){return it&&it.kind==='eye'&&typeof it.x==='number'}).map(function(it){
   var rs=e.items.filter(function(r){return r&&r.kind==='sightRing'&&typeof r.r==='number'}).map(function(r){return ringWord(r.what)+' '+m1(r.r)});return {label:W('eyeItem',{x:mm(it.x),y:mm(it.y)})+(rs.length?': '+rs.join(', '):''),x:it.x,y:it.y}})},
  legend:legRows(function(){return [{color:cv('view',1),label:W('view.1')},{color:cv('view',2),label:W('view.2')},{color:cv('view',3),label:W('view.3')},{color:null,label:W('view.0')},{color:null,label:W(isGoh()?'leg.targetGoh':'leg.target')}]})});
 V.addLayer({id:'sight.vis',group:'viewshed',label:'mapviz.layers.l.sight.vis',engineTrue:true,defaultOn:false,tool:true,draw:vgDraw('sight.vis',['sight','height'],visMk),
  legend:legRows(function(){var s=sightP();return [{color:s.seen,label:W('leg.visLow')},{color:s.partly,label:W('leg.visHigh')}]})});
 V.addLayer({id:'sight.fire',group:'viewshed',label:'mapviz.layers.l.sight.fire',engineTrue:true,defaultOn:true,tool:true,draw:vgDraw('sight.fire',['sight.fire','sight'],codeMk(CODES.fire)),
  legend:legRows(function(){return [1,2,3,4].map(function(c){return {color:cv('fire',c),label:W('fire.'+c)}})})});
 var SEENCAP=500;
 function seenOk(it){return !!it&&it.kind==='seen'&&typeof it.def==='string'&&typeof it.x==='number'&&typeof it.y==='number'&&isFinite(it.x)&&isFinite(it.y)&&typeof it.p==='number'&&it.p>=0&&it.p<=1}
 function ringWord(w){return RINGS.indexOf(w)>=0?W('ring.'+w):String(w)}
 function ringsEnv(){var e=spotEnv('sight.rings');return e&&vecOk(e,['sight'])&&atOk(e)?e:null}
 function drawRings(ctx,view){var e=spotEnv('sight.rings');if(!e)return;if(!vecOk(e,['sight'])||!atOk(e))throw na();if(!ctx.beginPath)return;var s=sightP(),z=view.zoom||1;
  e.items.forEach(function(it){if(!it||typeof it.x!=='number'||typeof it.y!=='number')return;var q=view.toScreen(it.x,it.y);ctx.beginPath();
   if(it.kind==='eye'){ctx.arc(q[0],q[1],4,0,Math.PI*2);ctx.fillStyle=css(s.ring);ctx.fill();return}
   if(it.kind!=='sightRing'||!(it.r>0))return;if(ctx.setLineDash)ctx.setLineDash(it.what==='binocular'||it.what==='uncover'?[6,4]:[]);ctx.arc(q[0],q[1],it.r*z,0,Math.PI*2);ctx.strokeStyle=css(s.ring);ctx.lineWidth=it.what==='sight'?2:1;ctx.stroke();if(ctx.setLineDash)ctx.setLineDash([])})}
 V.addLayer({id:'sight.rings',group:'viewshed',label:'mapviz.layers.l.sight.rings',engineTrue:true,defaultOn:true,tool:true,draw:drawRings,
  // the rings, then P(seen) per object (rules.md 3.2 late R2: {kind:'seen', uid, def, x, y, p}, at most 500; goh p from
  // the volume centres, the same row)
  list:function(){var e=ringsEnv();if(!e)return [];var r=e.items.filter(function(it){return it&&it.kind==='sightRing'&&typeof it.r==='number'}).map(function(it){return {label:W('ringItem',{ring:ringWord(it.what),r:m1(it.r)}),x:it.x+it.r,y:it.y}});
   return r.concat(e.items.filter(seenOk).slice(0,SEENCAP).map(function(it){return {label:W('seenItem',{def:it.def,p:String(Math.round(it.p*100))}),x:it.x,y:it.y}}))},
  legend:legRows(function(){var s=sightP(),r=[{color:s.ring,label:W('leg.rings')}];if(isGoh())r.push({color:null,label:W('leg.ringsGoh')});return r})});
 // movement (group movement); names carry the kind, travel and routes also the phase
 grid({id:'pass',group:'movement',eng:true,on:false,wants:['pass.codes'],mk:codeMk(CODES.pass),own:function(){return 'pass.'+V.q('kind')},hover:true,hit:codeHit('pass','move'),
  legend:legRows(function(){var r=[2,3,4].map(function(c){return {color:cv('pass',c),label:W('move.'+c)}});r.push({color:null,label:W('leg.pass')});return r})});
 grid({id:'move',group:'movement',eng:true,on:false,wants:['pass.codes'],mk:codeMk(CODES.move),own:function(){return 'move.'+V.q('kind')},hover:true,hit:codeHit('move','move'),
  legend:legRows(function(){return [2,3,4,5,6,7].map(function(c){return {color:cv('move',c),label:W('move.'+c)}})})});
 function travelLeg(){var p=P().pass.travel,s=p.stops;return [{color:s[0].color,label:W('leg.fast')},{color:s[s.length-1].color,label:W('leg.slow')},{color:p.iso,label:W('leg.iso',{n:ISO})},{color:null,label:W('leg.unreached')},{color:null,label:W('leg.side')}]}
 ['a','b'].forEach(function(sd){
  grid({id:'travel.'+sd,group:'movement',eng:false,on:false,wants:['pass.travel'],mk:travelMk,own:function(){return 'travel.'+sd+'.'+V.q('kind')},q:phaseQ,only:function(){return sideOn(sd)},hover:true,
   legend:legRows(travelLeg)});
  grid({id:'route.'+sd,group:'movement',eng:false,on:false,wants:['pass.route'],mk:densMk,own:function(){return 'route.'+sd+'.'+V.q('kind')},q:phaseQ,only:function(){return sideOn(sd)},
   legend:legRows(function(){return [{color:P().pass.route.line,label:W('leg.density')}]})})});
 function routeOk(it){return it&&it.kind==='route'&&Array.isArray(it.pts)&&it.pts.length>=2}
 function routesEnv(){var e=own('routes','routes',phaseQ());if(!e)return null;if(!vecOk(e,['pass.route']))throw na();return e}
 function sec(s){return typeof s==='number'?String(Math.round(s)):'?'}
 function routeText(it){var cr=CROSS.filter(function(c){return it.cross&&it.cross[c]}).map(function(c){return W('cross.'+c)});
  return W('routeItem',{from:String(it.from&&it.from.name||'?'),to:String(it.to&&it.to.name||'?'),s:sec(it.seconds),m:typeof it.lengthM==='number'?String(Math.round(it.lengthM)):'?'})+(cr.length?' '+W('crosses',{list:cr.join(', ')}):'')}
 function drawRoutes(ctx,view){var e=routesEnv();if(!e)return;if(seenSet('routes',e))relist();if(!ctx.beginPath)return;var r=P().pass.route;
  [['casing','casingWidth'],['line','width']].forEach(function(pr){e.items.forEach(function(it){if(!routeOk(it)||!sideOn(it.side))return;ctx.beginPath();
   it.pts.forEach(function(p,i){var q=view.toScreen(p[0],p[1]);if(i)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1])});ctx.strokeStyle=css(r[pr[0]]);ctx.lineWidth=r[pr[1]]||1;ctx.stroke()})})}
 V.addLayer({id:'routes',group:'movement',label:'mapviz.layers.l.routes',engineTrue:false,defaultOn:false,draw:drawRoutes,
  list:function(){var e;try{e=routesEnv()}catch(x){e=null}if(!e)return [];return e.items.filter(function(it){return routeOk(it)&&sideOn(it.side)}).slice(0,CAP).map(function(it){var p=it.pts[0];return {label:routeText(it),x:p[0],y:p[1]}})},
  legend:legRows(function(){return [{color:P().pass.route.line,label:W('leg.routes')},{color:null,label:W('leg.side')}]})});
 // the readout under the cursor: code word or value of the visible obst, pass, move, cover.band, sight.field, travel layers
 V.addHover(function(x,y){var rows=[];['obst','pass','move','cover.band','sight.field','travel.a','travel.b'].forEach(function(id){if(!HOV[id]||!on(id))return;
  if(/^travel\./.test(id)&&!sideOn(id.slice(7)))return;var v=cellVal(seenEnv(id),x,y);if(v==null)return;
  if(/^travel\./.test(id)){rows.push({label:'mapviz.layers.l.'+id,value:v>=0?W('sec',{s:String(Math.round(v*10)/10)}):W('unreached')});return}
  if(v<=0)return;var set=id==='obst'?'obst':id==='cover.band'?'band':id==='sight.field'?'field':'move';rows.push({label:'mapviz.layers.l.'+id,value:set==='band'?bandWord(v):codeWord(set,v)})});return rows});
 // ---- pickers for the card part (page-pg2 6.1) ----
 MV.picks=MV.picks||[];MV.picks=MV.picks.filter(function(p){return !p||p.id!=='cover'});MV.picks.push({id:'cover',at:coverAt});
 // ---- the viewshed tool (page-pg2 4.3) ----
 function viewNeed(){if(!spot)return null;var n=null;VIEWN.forEach(function(nm){var e=ST[keyOf(nm,spotQ())];if(e&&e.state==='need'&&!n&&nm!=='sight.rings')n=e.need});return n}
 // the spot's state from its store entries: busy, need, making, error, ready (the rings vector does not hold the others up)
 function spotState(){if(!spot)return 'none';var q=spotQ(),st='ready',i;if(spot.err)return 'error';
  for(i=0;i<3;i++){var e=ST[keyOf(VIEWN[i],q)];if(!e)return 'busy';if(e.state==='busy')return 'busy';if(e.state==='error'){spot.err=e.err;return 'error'}if(e.state==='need')st='need'}
  if(st==='need'&&(spotMaking()||runText(viewNeed()||{what:'view',args:{}})))return 'making';return st}
 // ask the spot's four products; an entry that failed before is asked again (a new click or a pose or kind change)
 function askSpot(click){if(!spot)return;var q=spotQ(),i;spot.err=null;for(i=0;i<VIEWN.length;i++){var k=keyOf(VIEWN[i],q);if(ST[k]&&ST[k].state==='error')delete ST[k];fetchOne(VIEWN[i],VIEWN[i],q)}spot.click=!!click;settleSpot()}
 // after every answer: the user's click turns a need into the view job at once (one job per spot), a pose or kind change
 // leaves the Make button
 function settleSpot(){if(!spot)return;var s=spotState();if(s==='need'&&spot.click){spot.click=false;postView()}drawSpot()}
 // the view job of the spot: at and pose; the shell adds target, game, mod, map, mode, side and kind (README 1.10 V.job)
 // one pending view job per context (target, game, mod, map, mode), spot, pose and kind: a job still running on another map
 // never holds up a click here
 function spotKey(sp){return 'view|'+[sp.ctx,sp.at,sp.pose,sp.kind].join('|')}
 function postView(){if(!spot)return;var sp=spot,pk=spotKey(sp);if(pend[pk])return;pend[pk]=true;drawSpot();
  var p;try{p=V.job('view',{at:sp.at,pose:sp.pose})}catch(x){p=Promise.reject(x)}
  p.then(function(){delete pend[pk];if(spot!==sp)return;VIEWN.forEach(function(nm){delete ST[keyOf(nm,{at:sp.at,pose:sp.pose})]});askSpot(false);landed()},
   function(e){delete pend[pk];if(spot!==sp)return;if(!(e&&e.stale))sp.err=e;landed()})}
 function spotMaking(){if(!spot)return null;if(!pend[spotKey(spot)])return null;var js=V.q('jobs')||[],i;
  for(i=0;i<js.length;i++)if(js[i]&&js[i].what==='view')return js[i].text||whatWord('view');return whatWord('view')}
 function clickView(x,y){var d=V.doc;if(!d||V.q('docBusy')||!V.q('map')){V.say('mapviz.layers.waitDoc');drawSpot(W('waitDoc'));return}
  var s=snap(x,y,d.net,V.q('target'));if(!s){V.say('mapviz.layers.waitDoc');drawSpot(W('waitDoc'));return}
  if(spot&&spot.at===s.at&&spot.pose===pose&&spot.kind===V.q('kind')&&spot.ctx===ctxSig()){var st=spotState();if(st!=='error'&&st!=='need')return;if(st==='need'){if(!spotMaking())postView();return}}
  spot={at:s.at,x:s.x,y:s.y,i:s.i,j:s.j,pose:pose,kind:V.q('kind'),ctx:ctxSig(),err:null};askSpot(true);V.redraw();relist()}
 V.addTool({id:'sightview',label:'mapviz.layers.tool',key:'v',start:function(){drawSpot()},click:function(x,y){clickView(x,y)},end:function(){drawSpot()}});
 // ---- the panel: pose, viewshed status, rows of the layers this part fetches, per-game lines ----
 function counts(){var e=spotEnv('sight.view'),c=[0,0,0,0];if(!e)return null;var d;try{d=decOf(e)}catch(x){return null}for(var i=0;i<d.vals.length;i++){var v=d.vals[i];if(v>=0&&v<=3)c[v]++}return c}
 function drawSpot(msg){var b=el.spot;if(!b)return;b.textContent='';if(msg){b.appendChild(h('p',{text:msg}));return}
  if(!spot){b.appendChild(h('p',{class:'hint',text:W('noSpot')}));return}
  var head=W('spot',{x:mm(spot.x),y:mm(spot.y),pose:W('pose.'+spot.pose),kind:kindWord(spot.kind)}),st=spotState(),line;
  if(st==='busy')line=W('reading');
  else if(st==='ready'){var c=counts();line=c?W('counts',{seen:c[1],hidden:c[2],partly:c[3]}):W('ready')}
  else if(st==='error')line=notYet(spot.err)?W('notYet'):errText(spot.err);
  else{var mk=spotMaking()||runText(viewNeed()||{what:'view',args:{}});line=mk?W('making',{job:mk}):null;
   if(!mk){b.appendChild(h('p',{text:head+' '+W('notMade')}));b.appendChild(h('button',{type:'button',text:W('make'),onclick:function(){postView()}}));return}}
  b.appendChild(h('p',{text:head+' '+line}))}
 var ROWS={obst:1,pass:1,move:1,'travel.a':1,'travel.b':1,routes:1,'route.a':1,'route.b':1};
 function drawRows(){var b=el.rows;if(!b)return;b.textContent='';var pre=sig()+'|',any=false;
  Object.keys(ST).forEach(function(k){var e=ST[k];if(k.indexOf(pre)!==0||!ROWS[e.lid]||e.state==='ready'||phaseStale(e))return;if(vis&&vis.indexOf(e.lid)<0)return;var lab=tx('mapviz.layers.l.'+e.lid);any=true;
   if(e.state==='busy'){b.appendChild(h('p',{class:'hint',text:W('rowReading',{layer:lab})}));return}
   if(e.state==='error'){b.appendChild(h('p',{class:'err',text:W('rowErr',{layer:lab,msg:notYet(e.err)?W('notYet'):errText(e.err)})}));return}
   var rt=runText(e.need);if(rt){b.appendChild(h('p',{class:'hint',text:W('rowMaking',{layer:lab,job:rt})}));return}
   var n=e.need;b.appendChild(h('p',{},[h('span',{text:W('rowNeed',{layer:lab})+' '}),h('button',{type:'button',text:W('make'),onclick:function(){make(n)}})]))});
  if(!any)b.appendChild(h('p',{class:'hint',text:W('rowsNone')}))}
 function drawGame(){var b=el.game;if(!b)return;b.textContent='';var g=isGoh(),t=V.q('target'),add=function(k,a){b.appendChild(h('p',{text:W(k,a)}))};if(!t)return;
  add('game.snap',{n:CELL[gameOf(t)]});add(g?'game.targetGoh':'game.target');add(g?'game.thinGoh':'game.thin');add('game.travel');
  if(g){add('game.vaultGoh');add('game.lipGoh');add('game.coverGoh');add('game.ringsGoh');add('game.travelGoh')}}
 V.addPanel({id:'layers',side:'right',build:function(box){var t=W('pose');
  el.pose=h('select',{onchange:function(){var v=el.pose.value;if(POSES.indexOf(v)<0)return;pose=v;if(spot&&spot.pose!==v){spot={at:spot.at,x:spot.x,y:spot.y,i:spot.i,j:spot.j,pose:v,kind:spot.kind,ctx:spot.ctx,err:null};askSpot(false);V.redraw()}else drawSpot()}},
   POSES.map(function(p){return h('option',{value:p,text:W('pose.'+p)})}));el.pose.value=pose;
  el.spot=h('div',{blk:'mv.layers.view','aria-live':'polite','data-blkname':W('blk.view')});
  el.rows=h('div',{blk:'mv.layers.rows','aria-live':'polite','data-blkname':W('blk.rows')});
  el.game=h('div',{blk:'mv.layers.game',class:'hint','data-blkname':W('blk.game')});
  box.appendChild(h('div',{blk:'mv.layers.head','data-blkname':W('title')},[h('h3',{text:W('title')})]));
  box.appendChild(h('div',{class:'fld',blk:'mv.layers.pose','data-blkname':t},[h('label',{class:'f'},[h('span',{class:'n',text:t}),el.pose,h('span')])]));
  box.appendChild(el.spot);box.appendChild(el.rows);box.appendChild(el.game);drawSpot();drawRows();drawGame()}});
 // ---- events ----
 // a map, mode, game, folder or mod change drops every entry of another key and the spot; a kind change keeps the spot and
 // asks it again (a need shows Make, no job); a side change only draws again
 V.on('map',function(){var c=ctxSig(),k=V.q('kind'),pre=sig()+'|',ph=phaseQ().phase;Object.keys(ST).forEach(function(x){if(x.indexOf(pre)!==0||phaseStale(ST[x]))delete ST[x]});
  Object.keys(SEEN).forEach(function(id){if(SEEN[id].sig!==sig()||(PHL[id]&&ph!==last.phase))delete SEEN[id]});last.phase=ph;
  if(spot&&spot.ctx!==c)spot=null;else if(spot&&spot.kind!==k){spot={at:spot.at,x:spot.x,y:spot.y,i:spot.i,j:spot.j,pose:spot.pose,kind:k,ctx:c,err:null};askSpot(false)}
  last.ctx=c;last.kind=k;drawSpot();drawRows();drawGame()});
 V.on('refresh',function(){drawGame()});
 V.on('doc',function(){relist();drawGame()});
 V.on('job',function(){drawRows();drawSpot()});
 V.on('theme',function(){ptag++});
 V.on('layers',function(d){vis=d&&Array.isArray(d.visible)?d.visible.slice():null;
  Object.keys(ST).forEach(function(k){var e=ST[k];if(vis&&ROWS[e.lid]&&vis.indexOf(e.lid)<0&&(e.state==='error'||e.state==='need'))delete ST[k]});drawRows()});
 // a page job ended or the cache changed: every need entry whose job does not run asks once more
 V.on('products',function(){var any=false;Object.keys(ST).forEach(function(k){var e=ST[k];if((e.state==='need'&&!runText(e.need))||e.state==='error'){delete ST[k];any=true}});
  if(spot)askSpot(false);if(any){V.redraw();relist()}drawRows();drawSpot()});
}});
})();
`;
