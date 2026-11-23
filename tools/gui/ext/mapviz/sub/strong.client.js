// Map Viewer strong points (MV-PG3, builder PG3a): the layers, panel and hover row of the strong points estimator
// 6, 11; contract draft page-pg3.md section 4; products rules.md 6.3 and 6.4). One code path for
// AS64, MoW:AS2 and Gates of Hell: grids are drawn from the envelope's own frame, so the GoH 5 u map cell needs no branch;
// the only game branch is target goh for the words design 6 and rules.md 9.4 give it (flat Overwatch zones, grenade and
// mortar reach read from data). GoH fortification slots come from the map document (flags[].fort), no job.
// Reads: GET strong (strong.<kind>.json) and GET layer for the strong grids (strong.<side>.<kind>.<x>,
// strong.contact.<kind>). A GET never starts a job: a product that is not made shows "Make it" (one V.job('strong')).
// Weights: version 1 sliders are the factor weights; balanced (equal weights) shows the product as written; other
// weights re-score the candidates and the score grid in the page with the formula of strong/index.js score():
// score = gate x sum(w F) / sum(w) over APPLIES[kind], F = raw x 0.004, raw 255 = nodata.
// Pure helpers for tests: EXT_SCREENS.mapviz.strongKit.
// Author: Imperator_Aug (ARSENAL, ia-f8645140)
// The factor layer marks come from tools/mapviz/strong/meta.js FACTOR_META (the tool's own flag, one source of truth):
// the build puts {factor: 1} for every 'rule' or 'port' factor in place of the ENG token below.
const META = require('../../../../mapviz/strong/meta');
const ENG = {};
Object.keys(META.FACTOR_META).forEach(f => { if (META.engineTrue(f)) ENG[f] = 1; });
module.exports = String.raw`
(function(){
var MV=EXT_SCREENS.mapviz;if(!MV||!MV.parts)return;
var SIDES=['a','b'],FACT=['ow','kz','sp','df','cv','rt','fr','px','hu','amb','enf'];
var APPLIES={inf:['ow','kz','sp','df','cv','rt','fr','px'],mg:['ow','kz','sp','df','cv','rt','fr','px','enf'],at:['ow','kz','sp','df','rt','fr','px','amb'],tank:['ow','kz','sp','df','rt','fr','px','hu']};
// engine true per factor layer: the tool's FACTOR_META (strong/meta.js), put in when the page is built. sp, df, hu (engine
// rules counted) and cv (the ported cover detector) are true; ow, kz, rt, amb, fr, px, enf are our estimates (route
// search and assumed engagement ranges, never computed by the engine); ow, kz, rt and amb were marked true here by mistake until 2026-11-19
var ENG=/*ENG*/{};
// the right-column group of each factor layer: fire and sight, or place and timing (shell GROUPS)
var FGRP={ow:'factfire',kz:'factfire',sp:'factfire',df:'factfire',amb:'factfire',enf:'factfire',cv:'factplace',rt:'factplace',fr:'factplace',px:'factplace',hu:'factplace'};
var CLS=['reverse','dead','high','uncont','first','garrison','hull'],HONEST={reverse:1,dead:1,high:1,hull:1,uncont:1,first:1};
// gate reasons: the GATE codes of rules.md 6.2 (late R4, page-pg3 late T3); words mapviz.strong.gate.<CODE>; a code not
// in this list shows the code itself
var GATES=['GATE_FOOTPRINT','GATE_UNREACHED','GATE_OUTSIDE_BOX','GATE_SWIM','GATE_DROWN','GATE_NO_PRONE','GATE_SLOPE','GATE_UNLINKED','GATE_ENEMY_SPAWN'];
var SRCS=['lattice','garrison','fort'],SYMS=['rot180','mirrorX','mirrorY'];
var NOTES=['STRONG_FLAT','STRONG_CAP_HIT','STRONG_INPUT_COMPUTED','STRONG_ENEMY_GROUND_D','STRONG_DEGRADED','STRONG_PREVIEWS_ABSENT'];
var PRESETS={balanced:{ow:1,kz:1,sp:1,df:1,cv:1,rt:1,fr:1,px:1,hu:1,amb:1,enf:1},
 hold:{ow:2,kz:2,cv:2,df:1.5,sp:1,rt:0.5,fr:0.5,px:1.5,hu:1.5,amb:2,enf:2},
 attack:{rt:2,fr:2,sp:1.5,px:1.5,ow:1,kz:1,df:1,cv:1,hu:1,amb:1,enf:1}};
var UPM=20,HIT=8,SPREAD=0.1,TOPN=10,P98=0.98,MINS=0.5,SCALE=0.004;
// a score or factor of exactly 0 is a value: unit grids draw t as ZERO + (1 - ZERO) t, so 0 has the faint low colour
// of the stops and only no data (raw 255, NaN) stays without colour; the legend says both (zeroRows)
var ZERO=0.25;
// grid layers: suffix -> how a value is shown (unit 0..1, cap metres or seconds up to 250, band 0..3, fail gate 0, set > 0)
var GL={score:'unit',threat:'unit',uncont:'cap',first:'cap',gate:'fail',danger:'band',howitzer:'band',nocrest:'set'};
// ---- pure helpers ----
// scoreOf(f, w, kind) -> sum(w F) / sum(w) over APPLIES[kind], as strong/factors.js score(): a factor with no value is left
// out, a weight not given is 1, no weight at all gives 0
function scoreOf(f,w,kind){var ids=APPLIES[kind]||[],s=0,sw=0;for(var i=0;i<ids.length;i++){var id=ids[i],F=f?f[id]:undefined;if(typeof F!=='number'||!isFinite(F))continue;
  var wi=w&&typeof w[id]==='number'?w[id]:1;s+=wi*F;sw+=wi}return sw?s/sw:0}
// scoreRaw(raw {factor: 0..255}, gate raw, w, kind) -> the score of one grid cell; a weighted factor raw 255 = nodata,
// gate 0 or 255 = nodata (page-pg3 4.4)
function scoreRaw(raw,gate,w,kind){if(typeof gate!=='number'||gate===255||!(gate>0))return null;var f={},ids=APPLIES[kind]||[],sw=0;
 for(var i=0;i<ids.length;i++){var id=ids[i];if(!(w&&w[id]>0))continue;var r=raw?raw[id]:undefined;if(typeof r!=='number'||r===255)return null;f[id]=r*SCALE;sw+=w[id]}
 return sw>0?(gate*SCALE)*scoreOf(f,w,kind):null}
// weighVals(gate vals, {factor: vals}, w, kind) -> Float64Array (NaN nodata): the same formula on decoded grids
function weighVals(g,fv,w,kind){var n=g.length,out=new Float64Array(n),ids=(APPLIES[kind]||[]).filter(function(id){return w&&w[id]>0}),sw=0,i,k;
 for(k=0;k<ids.length;k++){if(!fv[ids[k]]||fv[ids[k]].length!==n)return null;sw+=w[ids[k]]}
 for(i=0;i<n;i++){var G=g[i];if(!(G>0)||sw<=0){out[i]=NaN;continue}var s=0,bad=false;for(k=0;k<ids.length;k++){var F=fv[ids[k]][i];if(F!==F){bad=true;break}s+=w[ids[k]]*F}out[i]=bad?NaN:G*s/sw}
 return out}
// chooseLabels(cands, scoreFn, kind) -> [{id, side, rank, score}]: per side, gated, score >= max(p98 of the side, 0.5),
// greedy by score with suppression 15 m (25 m tank), at most 10 (design 6); p98 and the order as strong/classify.js labels()
function chooseLabels(cands,fn,kind){var R=(kind==='tank'?25:15)*UPM,out=[];
 SIDES.forEach(function(s){var xs=[];(cands||[]).forEach(function(c){if(!c||c.side!==s||c.gate!==1||typeof c.x!=='number'||typeof c.y!=='number')return;var v=fn(c);if(typeof v!=='number'||!isFinite(v))return;xs.push({c:c,v:v})});
  if(!xs.length)return;var sc=xs.map(function(o){return o.v}).sort(function(a,b){return a-b}),thr=Math.max(sc[Math.min(sc.length-1,Math.floor(P98*(sc.length-1)))],MINS),got=[];
  xs.sort(function(a,b){return b.v-a.v||a.c.x-b.c.x||a.c.y-b.c.y});
  for(var i=0;i<xs.length&&got.length<TOPN;i++){var o=xs[i];if(o.v<thr)break;var near=false;
   for(var k=0;k<got.length;k++){var dx=got[k].c.x-o.c.x,dy=got[k].c.y-o.c.y;if(dx*dx+dy*dy<R*R){near=true;break}}if(!near)got.push(o)}
  got.forEach(function(o,i){out.push({id:o.c.id,side:s,rank:i+1,score:o.v})})});
 return out}
function gateId(c){return String(c==null?'':c).trim()}
// fits(job args, need args) as the shell's: every key the need names is the job's (map matched leniently)
function fits(ja,na){ja=ja||{};for(var k in na||{}){if(!Object.prototype.hasOwnProperty.call(na,k)||na[k]==null)continue;var v=ja[k];
  if(k==='map'){if(v!=null&&String(v)!==String(na[k]))return false;continue}if(v==null||String(v)!==String(na[k]))return false}return true}
function n2(v){return typeof v==='number'&&isFinite(v)?(Math.round(v*100)/100).toFixed(2):'?'}
function n1(v){return typeof v==='number'&&isFinite(v)?String(Math.round(v*10)/10):'?'}
function word(k,fb){var s=tx(k);return s===k?fb:s}
function errText(e){if(e&&e.key&&/^mapviz\./.test(e.key))return tx(e.key,{msg:(e.params&&e.params.msg)||e.message||''});return String(e&&(e.text||e.message)||e)}
function needOf(e){var p=e&&(e.params||(e.reply&&e.reply.params));return e&&e.status===404&&p&&p.need&&p.need.what?p.need:null}
MV.strongKit={scoreOf:scoreOf,scoreRaw:scoreRaw,weighVals:weighVals,chooseLabels:chooseLabels,gateId:gateId,fits:fits,APPLIES:APPLIES,PRESETS:PRESETS,FACT:FACT,CLS:CLS,GATES:GATES,NOTES:NOTES,SRCS:SRCS,SYMS:SYMS};
// ---- the part ----
MV.parts.push({id:'strong',init:function(V){
 if(!V||V.q('rmt'))return;
 var K=MV.kit||null,el={},J={},G={},IMG={},WC={},OBJ={},gv=0;
 var ST={preset:'balanced',w:copyW(PRESETS.balanced),wk:null,pick:null,mk:{}};
 var WHAT='strong';
 // copyW(p, base) -> every factor's weight: p's when it is a number from 0, else base's (the preset of rules.md 6.1)
 function copyW(p,base){var o={};base=base||PRESETS.balanced;FACT.forEach(function(f){o[f]=typeof (p&&p[f])==='number'&&isFinite(p[f])&&p[f]>=0?p[f]:(typeof base[f]==='number'?base[f]:1)});return o}
 function kind(){var k=V.q('kind');return APPLIES[k]?k:'inf'}
 function ph(){var p=V.q('phase');return typeof p==='number'&&isFinite(p)?p:null}
 function goh(){return V.q('target')==='goh'}
 function base(){return [V.q('target')||'',V.q('game')||'',V.q('mod')||'',V.q('map')||'',V.q('mode')||'',ph()==null?'':ph()].join('|')}
 function jkey(k){return base()+'|'+(k||kind())}
 // qa(o) -> o with the page phase when one is picked (null = the mode's lowest phase: sent as nothing)
 function qa(o){var p=ph();if(p!=null)o.phase=p;return o}
 function canAsk(){return !!V.q('target')&&!!V.q('map')&&!V.q('docBusy')}
 function pal(p){var v=V.pal;String(p).split('.').forEach(function(k){v=v&&typeof v==='object'?v[k]:undefined});return v==null?null:v}
 function c4(hx){return K&&K.colour?K.colour(hx):null}
 function css(hx){return K&&K.colourCss?K.colourCss(hx):''}
 function sideWord(s){return tx('mapviz.shell.side.'+s)}
 function kindWord(k){return tx('mapviz.shell.kind.'+k)}
 function fWord(f){return FACT.indexOf(f)>=0?tx('mapviz.strong.f.'+f):String(f)}
 function clsWord(c){return tx('mapviz.strong.cls.'+c)}
 // 'ground' (off the ground mesh) is nodata, not a gate reason (README R24); strong/cand.js counts it as meta.offGround (older products: reasons.ground)
 function gateWord(c){var g=gateId(c);if(g==='ground')return tx('mapviz.strong.gate.ground');return GATES.indexOf(g)>=0?tx('mapviz.strong.gate.'+g):tx('mapviz.strong.gate.other',{code:String(c)})}
 function srcWord(s){return SRCS.indexOf(s)>=0?tx('mapviz.strong.src.'+s):String(s||'')}
 function sidesNow(){var s=V.q('side');return s==='a'||s==='b'?[s]:SIDES.slice()}
 function relist(){if(typeof V.relist==='function')V.relist()}
 function redraw(){if(typeof V.redraw==='function')V.redraw()}
 // ---- weights ----
 function presetW(name){var c=cur(),p=c&&c.data.presets&&c.data.presets[name];var b=PRESETS[name]||PRESETS.balanced;if(p&&typeof p==='object')return copyW(p.weights&&typeof p.weights==='object'?p.weights:p,b);return copyW(b,b)}
 function wsig(){return APPLIES[kind()].map(function(f){return ST.w[f]}).join(',')}
 // equal weights give the product's own balanced scores and labels
 function uniform(){var ids=APPLIES[kind()],w0=ST.w[ids[0]];if(!(w0>0))return false;for(var i=1;i<ids.length;i++)if(ST.w[ids[i]]!==w0)return false;return true}
 // ---- strong.<kind>.json ----
 function cur(){var c=J[jkey()];return c&&c.state==='ready'?c:null}
 function ask(force){if(V.q('rmt'))return;if(!canAsk()){render();return}var k=jkey(),old=J[k];if(old&&!force)return;
  var c=J[k]={state:'loading',stale:force==='stale'?1:0},kd=kind();render();
  // the shell adds target, game, mods, modDir, map, mode and side to GET strong (QCOM); the part passes the kind and the
  // page phase itself (page-pg3 4.3, late T1), so the read is right whether or not the shell adds the phase too
  var p;try{p=V.api('GET','strong',qa({kind:kd}))}catch(x){p=Promise.reject(x)}
  p.then(function(j){if(J[k]!==c)return;if(!j||j.kind!=='strong'||!Array.isArray(j.candidates)){c.state='error';c.err=tx('mapviz.err.MV_FAULT',{msg:tx('mapviz.strong.title')});render();return}
    c.state='ready';c.data=j;if(ST.wk!==k){ST.wk=k;ST.w=presetW(ST.preset);drawWeights()}render();relist();redraw();objects(c);scoreGrids()},
   function(e){if(J[k]!==c)return;if(e&&e.stale){if(!c.stale){delete J[k];ask('stale')}else{c.state='quiet';render()}return}
    var n=needOf(e);if(n){c.state='need';c.need=n}else{c.state='error';c.err=errText(e)}render()})}
 // the running page job that makes the strong points of this map, mode, kind and phase -> its words, else null
 function runText(){var js=V.q('jobs');if(!Array.isArray(js))return null;var t=V.q('target'),m=V.q('map'),na={mode:V.q('mode')||null,kind:kind(),phase:ph()};
  // page phase null: only a job with no phase makes this product (a phase 2 job makes another one)
  for(var i=0;i<js.length;i++){var j=js[i];if(j&&!j.end&&j.what===WHAT&&j.target===t&&(!j.map||j.map===m)&&fits(j.args,na)&&(na.phase!=null||!j.args||j.args.phase==null))return j.text||word('mapviz.shell.what.'+WHAT,tx('mapviz.strong.title'))}return null}
 // the shell's job body carries map, mode, side and kind; the part passes the page phase (page-pg3 4.5: V.job('strong',
 // {phase})); phase null drops the field, so the job takes the mode's lowest phase
 function make(){var k=jkey();if(ST.mk[k])return;ST.mk[k]=true;render();
  var p;try{p=V.job(WHAT,{phase:ph()})}catch(x){p=Promise.reject(x)}
  p.then(function(){ST.mk[k]=false;if(k===jkey())ask(true)},function(e){ST.mk[k]=false;var c=J[k];if(c){c.state='error';c.err=errText(e)}render()})}
 // ---- grids ----
 function nm(s,x){return 'strong.'+s+'.'+kind()+'.'+x}
 // grid(name, peek) -> the cache row of one strong grid; asks for it once unless peek (the hover row only reads)
 function grid(name,peek){var k=jkey()+'|'+name,g=G[k];if(g||peek)return g||null;if(!canAsk()||V.q('rmt'))return null;g=G[k]={state:'loading'};
  var p;try{p=V.api('GET','layer',qa({name:name,kind:kind()}))}catch(x){p=Promise.reject(x)}
  p.then(function(env){if(G[k]!==g)return;var d=null;try{d=env&&env.kind==='grid'&&K&&K.decode?K.decode(env):null}catch(x){d=null}
    if(d&&d.vals){g.state='ready';g.env=env;g.dec=d}else g.state='na';gv++;redraw();drawLegendBox()},
   function(e){if(G[k]!==g)return;if(e&&e.stale){delete G[k];return}g.state=needOf(e)?'need':'na';drawLegendBox()});
  return g}
 function frameOf(e){return {w:e.w,h:e.h,ox:e.ox,oy:e.oy,cell:e.cell}}
 function sameFr(a,b){return a.w===b.w&&a.h===b.h&&a.ox===b.ox&&a.oy===b.oy&&a.cell===b.cell}
 // the field of one side: {fr, vals, meta} or null (not fetched, not made); score with other weights is computed here
 function field(s,suf,peek){if(suf==='score'&&!uniform())return weighed(s,peek);var g=grid(suf==='contact'?'strong.contact.'+kind():nm(s,suf),peek);
  return g&&g.state==='ready'?{fr:frameOf(g.env),vals:g.dec.vals,meta:g.env.meta||{}}:null}
 function weighed(s,peek){var kd=kind(),ids=APPLIES[kd].filter(function(f){return ST.w[f]>0}),g=grid(nm(s,'gate'),peek),fv={},ok=!!g&&g.state==='ready';
  ids.forEach(function(f){var x=grid(nm(s,f),peek);if(x&&x.state==='ready'&&g&&g.state==='ready'&&sameFr(frameOf(x.env),frameOf(g.env)))fv[f]=x.dec.vals;else ok=false});
  if(!ok)return null;var ck=jkey()+'|'+s+'|'+wsig()+'|'+gv;if(WC[ck])return WC[ck];var vals=weighVals(g.dec.vals,fv,ST.w,kd);if(!vals)return null;
  return (WC[ck]={fr:frameOf(g.env),vals:vals,meta:{}})}
 // the balanced score grid of both sides, asked once when the product is ready, so the hover row has a value while the
 // layer strong.score is off; factor grids are still asked only while a layer needs them
 function scoreGrids(){if(!cur())return;SIDES.forEach(function(s){grid(nm(s,'score'))})}
 function layerState(suf){var st=null;sidesNow().forEach(function(s){var g=G[jkey()+'|'+(suf==='contact'?'strong.contact.'+kind():nm(s,suf))];if(g&&(g.state==='need'||g.state==='na'))st=st==='need'?st:g.state});return st}
 // ---- pictures ----
 function stopsFn(st){var s=(Array.isArray(st)?st:[]).map(function(x){return {at:Number(x&&x.at),c:c4(x&&x.color)}}).filter(function(x){return x.c&&isFinite(x.at)});if(!s.length)return null;
  return function(t){if(t<=s[0].at)return s[0].c;for(var k=1;k<s.length;k++)if(t<=s[k].at){var a=s[k-1],b=s[k],u=b.at>a.at?(t-a.at)/(b.at-a.at):0;
   return [0,1,2,3].map(function(i){return Math.round(a.c[i]+(b.c[i]-a.c[i])*u)})}return s[s.length-1].c}}
 function norm(mode,v){if(v!==v)return null;if(mode==='unit')return v>=0?Math.min(1,v):null;if(mode==='cap')return v>0?Math.min(1,v/250):null;if(mode==='band')return v>0?Math.min(1,v/3):null;
  if(mode==='fail')return v<=0?1:null;return v>0?1:null}
 function hatch(m,i,j){var f=c4(m&&m.fill),hc=c4(m&&m.hatch&&m.hatch.color),g=Math.max(2,Math.round(((m&&m.hatch&&m.hatch.gap)||6)/2));return (i+j)%g===0&&hc?hc:f}
 function picture(w,h,fn){if(typeof document==='undefined'||!document||!document.createElement)return null;var cv=document.createElement('canvas'),c2=cv&&cv.getContext?cv.getContext('2d'):null;
  if(!c2||!c2.createImageData||!c2.putImageData)return null;cv.width=w;cv.height=h;var img=c2.createImageData(w,h),d=img.data;
  for(var j=0;j<h;j++)for(var i=0;i<w;i++){var c=fn(j*w+i,i,j);if(!c)continue;var o=((h-1-j)*w+i)*4;d[o]=c[0];d[o+1]=c[1];d[o+2]=c[2];d[o+3]=c[3]}c2.putImageData(img,0,0);return cv}
 function blit(ctx,view,fr,cv){if(!cv||!ctx.drawImage)return;var p=view.toScreen(fr.ox,fr.oy+fr.h*fr.cell),q=view.toScreen(fr.ox+fr.w*fr.cell,fr.oy);
  if('imageSmoothingEnabled' in ctx)ctx.imageSmoothingEnabled=false;ctx.drawImage(cv,p[0],p[1],q[0]-p[0],q[1]-p[1])}
 // one picture of a grid layer: one side by its stops; both sides per cell the higher value in that side's wash
 function colourer(mode,fs){var one=fs.length===1,stp=stopsFn(pal(mode==='band'?'danger.stops':'strong.stops')),blk=pal('masks.blocked'),dz=pal('danger.stops'),top=Array.isArray(dz)&&dz.length?c4(dz[dz.length-1].color):null;
  var wash={};SIDES.forEach(function(s){wash[s]=c4(pal('sides.'+s+'.wash'))});
  if(mode==='fail')return function(i,ii,jj){for(var k=0;k<fs.length;k++)if(norm(mode,fs[k].f.vals[i])!=null)return hatch(blk,ii,jj);return null};
  if(mode==='set')return function(i,ii,jj){for(var k=0;k<fs.length;k++)if(norm(mode,fs[k].f.vals[i])!=null)return (ii+jj)%4===0?top:null;return null};
  var lift=function(t){return mode==='unit'?ZERO+(1-ZERO)*t:t};
  if(one)return function(i){var t=norm(mode,fs[0].f.vals[i]);return t==null||!stp?null:stp(lift(t))};
  return function(i){var bt=null,bs=null;for(var k=0;k<fs.length;k++){var t=norm(mode,fs[k].f.vals[i]);if(t!=null&&(bt==null||t>bt)){bt=t;bs=fs[k].s}}
   if(bt==null||!wash[bs])return null;var c=wash[bs];return [c[0],c[1],c[2],Math.round(255*lift(bt)*0.8)]}}
 function drawField(ctx,view,suf){var mode=GL[suf]||'unit',fs=[];sidesNow().forEach(function(s){var f=field(s,suf);if(f)fs.push({s:s,f:f})});if(!fs.length)return;
  var groups=[[fs[0]]];if(fs[1]){if(sameFr(fs[0].f.fr,fs[1].f.fr))groups[0].push(fs[1]);else groups.push([fs[1]])}
  groups.forEach(function(gs){var key=[jkey(),suf,gs.map(function(x){return x.s}).join(''),suf==='score'?wsig():'',gv].join('|'),cv=IMG[key];
   if(cv===undefined){var fn=colourer(mode,gs),fr=gs[0].f.fr;cv=IMG[key]=picture(fr.w,fr.h,fn)}blit(ctx,view,gs[0].f.fr,cv)})}
 function drawContact(ctx,view){var f=field('a','contact'),sym=c4(pal('strong.symbol'));if(f){var key=jkey()+'|contact|'+gv,cv=IMG[key];
   if(cv===undefined)cv=IMG[key]=picture(f.fr.w,f.fr.h,function(i){return f.vals[i]>0?sym:null});blit(ctx,view,f.fr,cv)}
  var c=cur(),ml=c&&c.data.frame&&c.data.frame.midline;if(!Array.isArray(ml)||ml.length<2||!ctx.beginPath)return;var a=view.toScreen(ml[0][0],ml[0][1]),b=view.toScreen(ml[1][0],ml[1][1]);
  ctx.beginPath();if(ctx.setLineDash)ctx.setLineDash([8,6]);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.strokeStyle=css(pal('strong.symbol'))||view.token('fg');ctx.lineWidth=1.5;ctx.stroke();if(ctx.setLineDash)ctx.setLineDash([])}
 // ---- candidates and labels with the current weights ----
 function res(){var c=cur();if(!c)return null;var ws=wsig()+'|'+(V.q('side')||''),kd=kind();if(c.res&&c.res.ws===ws)return c.res;var j=c.data,by={},cands=[],uni=uniform(),labs=[],sc={};
  j.candidates.forEach(function(x){if(x&&x.id!=null&&typeof x.x==='number'&&typeof x.y==='number'&&isFinite(x.x)&&isFinite(x.y)){by[x.id]=x;cands.push(x)}});
  cands.forEach(function(x){sc[x.id]=uni?(typeof x.score==='number'?x.score:null):(x.gate===1?scoreOf(x.f,ST.w,kd):0)});
  if(uni&&Array.isArray(j.labels)){SIDES.forEach(function(s){j.labels.map(function(id){return by[id]}).filter(function(x){return x&&x.side===s}).sort(function(a,b){return (sc[b.id]||0)-(sc[a.id]||0)})
    .forEach(function(x,i){labs.push({id:x.id,side:s,rank:i+1,score:sc[x.id]})})})}
  else labs=chooseLabels(cands,function(x){return sc[x.id]},kd);
  c.res={ws:ws,by:by,cands:cands,labels:labs,score:sc};return c.res}
 function shown(){var r=res(),ss=sidesNow();return r?r.labels.filter(function(l){return ss.indexOf(l.side)>=0}):[]}
 // the label word: the classifier that fires, else the factor with the largest w x F (design 6)
 function labelOf(c){var cl=Array.isArray(c.cls)?c.cls:[];for(var i=0;i<cl.length;i++)if(CLS.indexOf(cl[i])>=0)return clsWord(cl[i]);var best=null,bv=-1;
  Object.keys(c.f||{}).sort().forEach(function(f){var F=c.f[f],v=typeof F==='number'&&FACT.indexOf(f)>=0?F*(typeof ST.w[f]==='number'?ST.w[f]:1):-1;if(v>bv){bv=v;best=f}});return best?fWord(best):clsWord('garrison')}
 function rowText(l){var r=res(),c=r&&r.by[l.id];return tx('mapviz.strong.row',{rank:l.rank,side:sideWord(l.side),label:c?labelOf(c):'',score:n2(l.score)})}
 function drawLabels(ctx,view){var r=res();if(!r||!ctx.beginPath)return;var sym=pal('strong.symbol'),lab=pal('strong.labels')||{},ss=sidesNow();
  ctx.fillStyle=css(sym)||view.token('fg');r.cands.forEach(function(c){if(c.gate!==1||ss.indexOf(c.side)<0||!ctx.fillRect)return;var p=view.toScreen(c.x,c.y);ctx.fillRect(p[0]-1,p[1]-1,2,2)});
  shown().forEach(function(l){var c=r.by[l.id];if(!c)return;var p=view.toScreen(c.x,c.y),sd=pal('sides.'+l.side)||{},cl=null;(c.cls||[]).some(function(x){if(CLS.indexOf(x)>=0){cl=x;return true}return false});
   ctx.beginPath();ctx.arc(p[0],p[1],7,0,Math.PI*2);if(sd.shape==='outlined'){ctx.strokeStyle=css(sd.fill)||view.token('fg');ctx.lineWidth=2.5;ctx.stroke()}else{ctx.fillStyle=css(sd.fill)||view.token('acc');ctx.fill();ctx.strokeStyle=css(sd.line)||view.token('fg');ctx.lineWidth=1;ctx.stroke()}
   ctx.beginPath();ctx.arc(p[0],p[1],3,0,Math.PI*2);ctx.fillStyle=css(cl&&lab[cl]||sym)||view.token('fg');ctx.fill();
   if(typeof c.spread==='number'&&c.spread>SPREAD){ctx.beginPath();if(ctx.setLineDash)ctx.setLineDash([3,3]);ctx.arc(p[0],p[1],11,0,Math.PI*2);ctx.strokeStyle=css(sym)||view.token('fg');ctx.lineWidth=1;ctx.stroke();if(ctx.setLineDash)ctx.setLineDash([])}
   if(ctx.fillText){ctx.font='11px sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';var t=String(l.rank);if(ctx.strokeText){ctx.strokeStyle=css(pal('marks.halo'))||view.token('bg');ctx.lineWidth=3;ctx.strokeText(t,p[0]+10,p[1])}ctx.fillStyle=css(sym)||view.token('fg');ctx.fillText(t,p[0]+10,p[1])}})}
 function zoom(){var v=V.view;return v&&v.zoom>0?v.zoom:1}
 function hitLabels(x,y){var r=res();if(!r)return null;var R=HIT/zoom(),bd=R*R,best=null;shown().forEach(function(l){var c=r.by[l.id];if(!c)return;var dx=c.x-x,dy=c.y-y,d=dx*dx+dy*dy;if(d<=bd){bd=d;best=l}});
  return best?{part:'strong',id:best.id,label:'mapviz.strong.hit',value:rowText(best)}:null}
 function listLabels(){var r=res();if(!r)return [];return shown().map(function(l){var c=r.by[l.id];return {label:rowText(l),x:c.x,y:c.y}})}
 // ---- fairness ----
 function fair(){var c=cur();return c&&c.data.fair&&typeof c.data.fair==='object'?c.data.fair:null}
 function flagsOfMode(){var d=V.doc,m=V.q('mode'),out=[];if(!d||!Array.isArray(d.modes))return out;d.modes.forEach(function(md){if(md&&(!m||md.id===m))(md.flags||[]).forEach(function(f){if(f)out.push(f)})});return out}
 function fairFlags(){var f=fair(),rows=f&&Array.isArray(f.flags)?f.flags:[],by={},out=[],pos={};flagsOfMode().forEach(function(fl){if(typeof fl.x==='number'&&typeof fl.y==='number')pos[fl.name]=fl});
  rows.forEach(function(r){if(!r||r.flag==null)return;if(!by[r.flag]){by[r.flag]={flag:r.flag,a:null,b:null};out.push(by[r.flag])}if(r.side==='a'||r.side==='b')by[r.flag][r.side]=r});
  return out.filter(function(o){return !!pos[o.flag]}).map(function(o){o.x=pos[o.flag].x;o.y=pos[o.flag].y;return o})}
 function fairRow(o){return tx('mapviz.strong.fairRow',{flag:o.flag,a:sideWord('a'),va:n2(o.a&&o.a.best5),b:sideWord('b'),vb:n2(o.b&&o.b.best5)})}
 function drawFairFlags(ctx,view){if(!ctx.fillRect)return;fairFlags().forEach(function(o){var p=view.toScreen(o.x,o.y);SIDES.forEach(function(s,i){var v=o[s]&&o[s].best5;if(typeof v!=='number')return;var hh=Math.max(1,Math.min(1,v)*30);
   ctx.fillStyle=css(pal('sides.'+s+'.fill'))||view.token('acc');ctx.fillRect(p[0]-8+i*9,p[1]-12-hh,7,hh)});if(ctx.strokeRect){ctx.strokeStyle=view.token('line');ctx.lineWidth=1;ctx.strokeRect(p[0]-9,p[1]-43,18,31)}})}
 function patches(){var f=fair(),s=f&&f.symmetry;return s&&Array.isArray(s.patches)?s.patches.filter(function(p){return p&&typeof p.x==='number'&&typeof p.y==='number'}):[]}
 function patchText(p){var ob=Array.isArray(p.objects)?p.objects:[],c=cur(),names=c&&OBJ[jkey()]||null;
  return tx('mapviz.strong.patch',{area:Math.round(p.areaM2||0),n:ob.length,names:ob.slice(0,8).map(function(u){return names&&names[u]?names[u]:String(u)}).join(', ')})}
 function drawSym(ctx,view){if(!ctx.strokeRect)return;patches().forEach(function(p){var r=Math.sqrt(Math.max(0,p.areaM2||0))*UPM/2,a=view.toScreen(p.x-r,p.y+r),b=view.toScreen(p.x+r,p.y-r);
  ctx.strokeStyle=css(pal('strong.symbol'))||view.token('fg');ctx.lineWidth=1.5;ctx.strokeRect(a[0],a[1],Math.max(2,b[0]-a[0]),Math.max(2,b[1]-a[1]))})}
 // object names for the patches: the objects layer when it is made, else the uids
 function objects(c){var k=jkey();if(OBJ[k]!==undefined||!patches().some(function(p){return Array.isArray(p.objects)&&p.objects.length}))return;OBJ[k]=null;
  var p;try{p=V.api('GET','layer',{name:'objects'})}catch(x){return}p.then(function(e){if(!e||!Array.isArray(e.items))return;var m={};e.items.forEach(function(it){if(it&&it.uid!=null&&(it.name||it.def))m[it.uid]=String(it.name||it.def)});OBJ[k]=m;drawFair()},function(){})}
 // ---- GoH fortification slots: from the map document (flags[].fort), none on AS64 and MoW:AS2 maps ----
 function forts(){var p=ph(),out=[];flagsOfMode().forEach(function(f){if(p!=null&&f.phase!=null&&f.phase!==p)return;(Array.isArray(f.fort)?f.fort:[]).forEach(function(s,i){
   if(!s||typeof s.x!=='number'||typeof s.y!=='number'||!isFinite(s.x)||!isFinite(s.y))return;out.push({flag:String(f.name||''),team:f.team,n:i+1,x:s.x,y:s.y,yaw:s.yaw,kind:s.kind})})});return out}
 function fortText(s){return tx('mapviz.strong.fortRow',{flag:s.flag,n:s.n})+(s.kind?' ('+String(s.kind)+')':'')}
 function drawForts(ctx,view){if(!ctx.beginPath||!ctx.strokeRect)return;forts().forEach(function(s){var p=view.toScreen(s.x,s.y),sd=pal('sides.'+(s.team==='a'||s.team==='b'?s.team:'neutral'))||{};
  ctx.strokeStyle=css(sd.line||sd.fill)||view.token('fg');ctx.lineWidth=2;ctx.strokeRect(p[0]-4,p[1]-4,8,8);
  if(typeof s.yaw==='number'){var a=s.yaw*Math.PI/180;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[0]+Math.cos(a)*9,p[1]-Math.sin(a)*9);ctx.stroke()}})}
 function hitForts(x,y){var R=HIT/zoom(),bd=R*R,best=null,bi=-1;forts().forEach(function(s,i){var dx=s.x-x,dy=s.y-y,d=dx*dx+dy*dy;if(d<=bd){bd=d;best=s;bi=i}});
  return best?{part:'strong',fort:bi,label:'mapviz.strong.lay.fort',value:fortText(best)}:null}
 // ---- legends ----
 // the unit legend: 1, 0.5 and 0 in the colours the drawing gives them (0 is a value), then no colour = no data
 function hex4(c){return c?'#'+c.slice(0,4).map(function(v){return (v<16?'0':'')+v.toString(16)}).join(''):null}
 function grad(key){var st=stopsFn(pal(key));if(!st)return [];var at=function(t){return hex4(st(ZERO+(1-ZERO)*t))};
  return [{color:at(1),label:tx('mapviz.strong.legHigh')},{color:at(0.5),label:n2(0.5)},{color:at(0),label:n2(0)},{color:null,label:tx('mapviz.strong.legNoData')}]}
 function stateRow(suf){var st=layerState(suf);return st==='need'?[{color:null,label:tx('mapviz.shell.notMade')}]:st==='na'?[{color:null,label:tx('mapviz.strong.legNoData')}]:[]}
 // weapon(w) -> frame.weapons[w] {name, reachM, source 'stack'|'fallback'} of the product (strong/index.js), else null
 function weapon(w){var c=cur(),wp=c&&c.data.frame&&c.data.frame.weapons,o=wp&&wp[w];return o&&typeof o==='object'?o:null}
 // reachMark(w) -> ' inferred inputs' or '': one rule on every game and weapon. A fallback number (source 'fallback') is
 // inferred on AS64, MoW:AS2 and GoH alike. A number read from the stack is inferred on GoH only (rules.md 9.4, page-pg3
 // 4.6: how GoH uses the mortar and howitzer reach is not traced in its code [I]); on AS64 and MoW:AS2 the value read
 // (werfer42 aimRange, the range_medium_howitzer preset, strong/danger.js) is the reach the engine uses. The howitzer has
 // a stack value since 2026-11-19 (it was a fixed 1000 m)
 function reachMark(w){var o=weapon(w),inf=goh()||!!(o&&o.source==='fallback');return inf?' '+tx('mapviz.strong.srcInferred'):''}
 function metaOf(suf){var m=null;sidesNow().forEach(function(s){var g=G[jkey()+'|'+nm(s,suf)];if(!m&&g&&g.state==='ready')m=g.env.meta||null});return m}
 function legField(suf){return function(){var rows=stateRow(suf);if(suf==='uncont')rows.push({color:null,label:tx('mapviz.strong.legMetres')});if(suf==='first')rows.push({color:null,label:tx('mapviz.strong.legSeconds')});
  if(suf==='gate'){var b=pal('masks.blocked'),m=metaOf('gate');rows.push({color:b&&b.fill,label:tx('mapviz.strong.lay.gate')});if(m&&m.reasons&&typeof m.reasons==='object')Object.keys(m.reasons).forEach(function(c){rows.push({color:null,label:tx('mapviz.strong.legReason',{why:gateWord(c),n:m.reasons[c]})})});
   // off the ground mesh: meta.offGround (strong/cand.js, README R24 form), nodata; an older product wrote it as reasons.ground
   if(m&&typeof m.offGround==='number'&&m.offGround>0&&!(m.reasons&&m.reasons.ground))rows.push({color:null,label:tx('mapviz.strong.legReason',{why:gateWord('ground'),n:m.offGround})});return rows}
  if(suf==='nocrest'){var d=pal('danger.stops');rows.push({color:Array.isArray(d)&&d.length?d[d.length-1].color:null,label:tx('mapviz.strong.lay.nocrest')});return rows}
  // the weapon reach: the grid meta {weapon, reachM}, else the product's frame.weapons; marked inferred by reachMark()
  if(suf==='danger'||suf==='howitzer'){var st=stopsFn(pal('danger.stops')),hx=function(t){var c=st?st(t):null;return c?'\x23'+c.slice(0,4).map(function(v){return (v<16?'0':'')+v.toString(16)}).join(''):null};
   // the bands of strong/danger.js band(): 0 out of reach, 1 in reach only, 2 in reach and observed (binocular reach of
   // enemy ground or an enemy flag's sight radius), 3 in reach and seen directly (threat heat > 0)
   [1,2,3].forEach(function(b){rows.push({color:hx(b/3),label:tx('mapviz.strong.band.'+b)})});var wk=suf==='danger'?'mortar':'howitzer',mm=metaOf(suf),wo=weapon(wk);
   var wn=mm&&mm.weapon!=null?mm.weapon:wo&&wo.name,wm=mm&&typeof mm.reachM==='number'?mm.reachM:wo&&wo.reachM;
   if(wn!=null)rows.push({color:null,label:tx('mapviz.strong.legWeapon',{weapon:String(wn),m:n1(wm)})+reachMark(wk)});return rows}
  return rows.concat(grad('strong.stops'))}}
 function legFactor(f){return function(){if(APPLIES[kind()].indexOf(f)<0)return [{color:null,label:tx('mapviz.strong.legNA')}];var rows=stateRow(f);
  if(f==='ow')rows.push({color:null,label:tx(goh()?'mapviz.strong.legOwGoh':'mapviz.strong.legOw')});return rows.concat(grad('strong.stops'))}}
 function legLabels(){var sym=pal('strong.symbol'),rows=[];SIDES.forEach(function(s){var sd=pal('sides.'+s);if(sd)rows.push({color:sd.fill,label:sideWord(s)})});rows.push({color:sym,label:tx('mapviz.strong.legSpread')});return rows}
 function legContact(){var sym=pal('strong.symbol');return stateRow('contact').concat([{color:sym,label:tx('mapviz.strong.lay.contact')},{color:null,label:tx('mapviz.strong.legMidline')}])}
 function legFort(){var n=forts().length;return n?[{color:null,label:tx('mapviz.strong.lay.fort')+': '+n}]:[{color:null,label:tx('mapviz.strong.legNoFort')}]}
 // ---- layers (page-pg3.md 4.1) ----
 var LAY=[];
 function add(o){LAY.push(o);V.addLayer(o)}
 add({id:'strong.labels',group:'strong',label:'mapviz.strong.lay.labels',engineTrue:false,defaultOn:true,draw:drawLabels,hit:hitLabels,list:listLabels,legend:legLabels});
 add({id:'strong.score',group:'strong',label:'mapviz.strong.lay.score',engineTrue:false,defaultOn:false,draw:function(c,v){drawField(c,v,'score')},legend:legField('score')});
 FACT.forEach(function(f){add({id:'strong.f.'+f,group:FGRP[f],label:tx('mapviz.strong.layF',{f:fWord(f)}),engineTrue:!!ENG[f],defaultOn:false,
  draw:function(c,v){if(APPLIES[kind()].indexOf(f)>=0)drawFieldF(c,v,f)},legend:legFactor(f)})});
 function drawFieldF(c,v,f){GL[f]='unit';drawField(c,v,f)}
 add({id:'strong.threat',group:'strong',label:'mapviz.strong.lay.threat',engineTrue:false,defaultOn:false,draw:function(c,v){drawField(c,v,'threat')},legend:legField('threat')});
 add({id:'strong.uncont',group:'strong',label:'mapviz.strong.cls.uncont',engineTrue:false,defaultOn:true,draw:function(c,v){drawField(c,v,'uncont')},legend:legField('uncont')});
 add({id:'strong.first',group:'strong',label:'mapviz.strong.cls.first',engineTrue:false,defaultOn:true,draw:function(c,v){drawField(c,v,'first')},legend:legField('first')});
 add({id:'strong.gate',group:'strong',label:'mapviz.strong.lay.gate',engineTrue:false,defaultOn:false,draw:function(c,v){drawField(c,v,'gate')},legend:legField('gate')});
 add({id:'strong.contact',group:'strong',label:'mapviz.strong.lay.contact',engineTrue:false,defaultOn:false,draw:drawContact,legend:legContact});
 add({id:'strong.danger',group:'danger',label:'mapviz.strong.lay.danger',engineTrue:false,defaultOn:false,draw:function(c,v){drawField(c,v,'danger')},legend:legField('danger')});
 add({id:'strong.howitzer',group:'danger',label:'mapviz.strong.lay.howitzer',engineTrue:false,defaultOn:false,draw:function(c,v){drawField(c,v,'howitzer')},legend:legField('howitzer')});
 add({id:'strong.nocrest',group:'danger',label:'mapviz.strong.lay.nocrest',engineTrue:false,defaultOn:false,draw:function(c,v){drawField(c,v,'nocrest')},legend:legField('nocrest')});
 add({id:'fair.flags',group:'fairness',label:'mapviz.strong.lay.fairFlags',engineTrue:false,defaultOn:false,draw:drawFairFlags,list:function(){return fairFlags().map(function(o){return {label:fairRow(o),x:o.x,y:o.y}})},
  legend:function(){return SIDES.map(function(s){var sd=pal('sides.'+s);return {color:sd&&sd.fill,label:tx('mapviz.strong.col.best5')+', '+sideWord(s)}})}});
 add({id:'fair.symmetry',group:'fairness',label:'mapviz.strong.lay.fairSym',engineTrue:false,defaultOn:false,draw:drawSym,list:function(){return patches().map(function(p){return {label:patchText(p),x:p.x,y:p.y}})},
  legend:function(){return [{color:pal('strong.symbol'),label:tx('mapviz.strong.lay.fairSym')}]}});
 // fortification slots: an estimate. The slots are read from the flag's fortification extender, but where the game puts
 // them (offsets local to the flag, turned by its yaw) is inferred (tools/mapviz/lib/mapkit/mapdoc.js fortOf [I])
 add({id:'game.fort',group:'game',label:'mapviz.strong.lay.fort',engineTrue:false,defaultOn:true,draw:drawForts,hit:hitForts,list:function(){return forts().map(function(s){return {label:fortText(s),x:s.x,y:s.y}})},legend:legFort});
 // grids of the visible layers are asked for when the layer turns on (one GET per key)
 var SUFS={'strong.score':'score','strong.threat':'threat','strong.uncont':'uncont','strong.first':'first','strong.gate':'gate','strong.contact':'contact','strong.danger':'danger','strong.howitzer':'howitzer','strong.nocrest':'nocrest'};
 FACT.forEach(function(f){SUFS['strong.f.'+f]=f});
 function visible(){var v=V.q('allLayers');if(Array.isArray(v))return v;return LAY.filter(function(l){return l.defaultOn}).map(function(l){return l.id})}
 function prefetch(vis){if(!cur())return;(vis||[]).forEach(function(id){var suf=SUFS[id];if(!suf)return;if(id.indexOf('strong.f.')===0&&APPLIES[kind()].indexOf(suf)<0)return;sidesNow().forEach(function(s){field(s,suf)})})}
 // ---- hover: the score cell of the page side ----
 function cellOf(f,x,y){var i=Math.floor((x-f.fr.ox)/f.fr.cell),j=Math.floor((y-f.fr.oy)/f.fr.cell);if(i<0||j<0||i>=f.fr.w||j>=f.fr.h)return null;var v=f.vals[j*f.fr.w+i];return v===v?v:null}
 // the row only reads grids already asked for (peek): hovering never fetches. "not made yet" only for a product or grid
 // that answered a need; a grid that answered no data, is on its way, or was never asked for says so
 function hoverSide(s,x,y){var f=field(s,'score',true);if(f){var v=cellOf(f,x,y);return v==null?tx('mapviz.strong.legNoData'):n2(v)}
  var ns=uniform()?[nm(s,'score')]:[nm(s,'gate')].concat(APPLIES[kind()].filter(function(id){return ST.w[id]>0}).map(function(id){return nm(s,id)})),st={};
  ns.forEach(function(n){var g=G[jkey()+'|'+n];st[g?g.state:'none']=1});
  if(st.need)return tx('mapviz.shell.notMade');if(st.na)return tx('mapviz.strong.legNoData');if(st.loading)return tx('mapviz.shell.loading');
  return tx('mapviz.strong.hoverOff',{layer:tx('mapviz.strong.lay.score')})}
 V.addHover(function(x,y){if(!V.q('map'))return [];if(!cur()){var c0=J[jkey()];return [{label:'mapviz.strong.lay.score',value:tx(c0&&c0.state==='loading'?'mapviz.shell.loading':'mapviz.shell.notMade')}]}var ss=sidesNow();
  var val=ss.length===1?hoverSide(ss[0],x,y):ss.map(function(s){return sideWord(s)+' '+hoverSide(s,x,y)}).join(', ');
  return [{label:'mapviz.strong.lay.score',value:val}]});
 // ---- the panel (page-pg3.md 4.2) ----
 function leaf(id,nk,kids,a){var o={blk:id,'data-blkname':tx(nk)};for(var k in a||{})o[k]=a[k];return h('div',o,kids||[])}
 function para(t,cls){return h('p',{class:cls||null,text:t})}
 function status(){var b=el.status;if(!b)return;b.textContent='';var k=jkey(),c=J[k];
  if(!V.q('map')){b.appendChild(para(tx('mapviz.shell.noMap'),'hint'));return}
  if(!c){return}
  if(c.state==='quiet')return;
  if(c.state==='loading'){b.appendChild(para(tx('mapviz.shell.loading'),'hint'));return}
  var rt=runText();
  if(c.state==='need'||(ST.mk[k]&&c.state!=='ready')){if(rt||ST.mk[k]){b.appendChild(para(tx('mapviz.strong.making',{job:rt||word('mapviz.shell.what.'+WHAT,tx('mapviz.strong.title'))}),'hint'));return}
   b.appendChild(h('p',{class:'hint'},[h('span',{text:tx('mapviz.strong.need',{kind:kindWord(kind())})+' '}),h('button',{type:'button',text:tx('mapviz.shell.make'),title:tx('mapviz.strong.makeT'),onclick:function(){make()}})]));return}
  if(c.state==='error'){b.appendChild(h('p',{class:'err'},[h('span',{text:String(c.err||'')+' '}),h('button',{type:'button',text:tx('mapviz.strong.retry'),onclick:function(){ask(true)}})]));return}
  var j=c.data;b.appendChild(para(tx('mapviz.strong.ready',{n:shown().length,kind:kindWord(kind())}),'hint'));
  // the resolved phase the product writes (page-pg3 late T2), shown while the mode holds two or more phases
  var phs=V.q('phases');if(Array.isArray(phs)&&phs.length>=2)b.appendChild(para(typeof j.phase==='number'&&isFinite(j.phase)?tx('mapviz.shell.phaseN',{n:j.phase}):tx('mapviz.shell.phaseFirst'),'hint'));
  if(rt)b.appendChild(para(tx('mapviz.strong.making',{job:rt}),'hint'));
  var seen={},ns=(Array.isArray(j.notes)?j.notes:[]).slice();if(j.flat===true)ns.push({code:'STRONG_FLAT'});if(j.caps&&j.caps.hit===true)ns.push({code:'STRONG_CAP_HIT'});
  ns.forEach(function(n){if(!n||!n.code||seen[n.code])return;seen[n.code]=1;var t=NOTES.indexOf(n.code)>=0?tx('mapviz.strong.note.'+n.code,{d:n1(j.frame&&j.frame.d)}):tx('mapviz.strong.note.other',{code:String(n.code),msg:String(n.msg||'')});b.appendChild(para(t,'hint'))})}
 function drawWeights(){var b=el.weights;if(!b)return;b.textContent='';APPLIES[kind()].forEach(function(f){var t=tx('mapviz.strong.weightOf',{f:fWord(f)}),out=h('span',{text:' '+String(ST.w[f])});
   var r=h('input',{type:'range',min:'0',max:'3',step:'0.25','aria-label':t,oninput:function(){setW(f,r,out)},onchange:function(){setW(f,r,out)}});r.value=String(ST.w[f]);
   b.appendChild(h('label',{class:'f'},[h('span',{class:'n',text:fWord(f)+' '}),r,out]))});
  b.appendChild(h('button',{type:'button',text:tx('mapviz.strong.reset'),onclick:function(){ST.w=presetW(ST.preset);drawWeights();changed()}}))}
 function setW(f,r,out){var v=Number(r.value);if(!isFinite(v)||v<0)v=0;if(v>3)v=3;ST.w[f]=v;out.textContent=' '+String(v);changed()}
 function changed(){render();relist();redraw()}
 function drawTop(){var b=el.top;if(!b)return;b.textContent='';var r=res();if(!r)return;var ls=shown();if(!ls.length){b.appendChild(para(tx('mapviz.strong.topNone'),'hint'));return}
  var ul=h('ul',{'aria-label':tx('mapviz.strong.blk.top')});ls.forEach(function(l){var c=r.by[l.id];ul.appendChild(h('li',{},[h('button',{type:'button',class:'link',text:rowText(l),onclick:function(){pick(l.id);if(c&&typeof V.go==='function'){try{V.go({x:c.x,y:c.y})}catch(x){}}}})]))});b.appendChild(ul)}
 // a pick holds the product key it was made on: candidate ids (side + rank) repeat in every kind, mode and phase
 function pick(id){ST.pick=id;ST.pickK=jkey();drawWhy();redraw()}
 function picked(){return ST.pick!=null&&ST.pickK===jkey()?ST.pick:null}
 function srcMark(c,f){var j=cur(),m=null;((j&&j.data.factors)||[]).forEach(function(x){if(x&&x.id===f)m=x});
  if(m&&m.engineTrue==='estimate')return tx('mapviz.strong.srcEstimate');if(m&&m.inputs==='inferred')return tx('mapviz.strong.srcInferred');if(m)return tx('mapviz.strong.srcRule');return tx(ENG[f]?'mapviz.strong.srcRule':'mapviz.strong.srcEstimate')}
 // the grenade reach: the product's frame.weapons.grenade {name, reachM, source}, marked by reachMark(); a product
 // without it (written before the field) gives the vanilla 17 m on AS64 and MoW:AS2, the data line on GoH
 function grenadeLine(){var g=weapon('grenade');
  if(g&&typeof g.reachM==='number'&&isFinite(g.reachM)&&g.reachM>0)return tx('mapviz.strong.grenadeN',{m:n1(g.reachM)})+reachMark('grenade');
  return tx(goh()?'mapviz.strong.grenadeData':'mapviz.strong.grenade17')}
 function drawWhy(){var b=el.why;if(!b)return;b.textContent='';var r=res(),pk=picked(),c=r&&pk!=null?r.by[pk]:null;if(!c){b.appendChild(para(tx('mapviz.strong.whyNone'),'hint'));return}
  var add=function(t){b.appendChild(para(t))},w=c.why||{},cl=Array.isArray(c.cls)?c.cls:[];
  add(tx('mapviz.strong.whyHead',{label:labelOf(c),side:sideWord(c.side),src:srcWord(c.src),x:n1(c.x/UPM),y:n1(c.y/UPM)}));
  add(tx('mapviz.strong.whyScore',{score:n2(r.score[c.id]),median:n2(c.median),spread:n2(c.spread)}));
  if(typeof c.presetsTop==='number')add(tx('mapviz.strong.whyPresets',{n:c.presetsTop}));
  if(c.gate===1)add(tx('mapviz.strong.gateOk'));else add(tx('mapviz.strong.gateNo',{list:(Array.isArray(c.gateWhy)?c.gateWhy:[]).map(gateWord).join(', ')}));
  APPLIES[kind()].forEach(function(f){var F=c.f&&c.f[f];add(tx('mapviz.strong.whyF',{f:fWord(f),v:n2(F),wf:n2(typeof F==='number'?F*(ST.w[f]||0):null),src:srcMark(c,f)}))});
  cl.forEach(function(x){if(CLS.indexOf(x)>=0)add(clsWord(x))});
  var rv=w.reverse;if(rv&&(cl.indexOf('reverse')>=0||cl.indexOf('dead')>=0)){add(tx('mapviz.strong.whyReverse',{d:n1(rv.distM),r:n1(rv.riseM),w:n1(rv.widthM)}));add(grenadeLine())}
  if(w.high)add(tx('mapviz.strong.whyHigh',{a:n1(w.high.angleDeg),m:n1(w.high.aboveM)}));
  if(w.uncont)add(tx('mapviz.strong.whyUncont',{m:n1(w.uncont.openM)}));
  if(w.first)add(tx('mapviz.strong.whyFirst',{s:n1(w.first.leadS)}));
  if(w.hull)add(tx('mapviz.strong.whyHull',{deg:n1(w.hull.facingDeg)}));
  if(w.garrison){if(w.garrison.destructible)add(tx('mapviz.strong.garrisonD'));if(w.garrison.burnable)add(tx('mapviz.strong.garrisonB'))}
  if(cl.some(function(x){return HONEST[x]}))add(tx('mapviz.strong.honest'))}
 function drawFair(){var b=el.fair;if(!b)return;b.textContent='';var f=fair(),sm=h('summary',{text:tx('mapviz.strong.blk.fair')}),d=h('details',{},[sm]);b.appendChild(d);
  if(!f){d.appendChild(para(tx('mapviz.strong.fairNone'),'hint'));return}
  var cols=[tx('mapviz.shell.item.flag'),tx('mapviz.shell.sideLabel'),tx('mapviz.strong.col.best5'),clsWord('hull'),fWord('amb'),clsWord('uncont')];
  var tb=h('tbody',{},[]);(Array.isArray(f.flags)?f.flags:[]).forEach(function(r){if(!r)return;tb.appendChild(h('tr',{},[String(r.flag==null?'':r.flag),r.side==='a'||r.side==='b'?sideWord(r.side):String(r.side||''),n2(r.best5),n2(r.hull),n2(r.amb),String(r.uncont==null?'':r.uncont)].map(function(t){return h('td',{text:t})})))});
  d.appendChild(h('table',{},[h('thead',{},[h('tr',{},cols.map(function(t){return h('th',{text:t})}))]),tb]));
  if(typeof f.gap==='number')d.appendChild(para(tx('mapviz.strong.fairGap',{v:n2(f.gap)})));
  if(f.top50&&typeof f.top50==='object')d.appendChild(para(tx('mapviz.strong.fairTop',{a:sideWord('a'),pa:n1(f.top50.a),b:sideWord('b'),pb:n1(f.top50.b)})));
  var s=f.symmetry;if(s&&SYMS.indexOf(s.kind)>=0)d.appendChild(para(tx('mapviz.strong.fairSym',{kind:tx('mapviz.strong.sym.'+s.kind),m:n1(s.residualM)})));else d.appendChild(para(tx('mapviz.strong.fairSymNone')));
  patches().forEach(function(p){d.appendChild(para(patchText(p)))})}
 function drawLegendBox(){var b=el.legend;if(!b)return;b.textContent='';var vis=visible();LAY.forEach(function(l){if(vis.indexOf(l.id)<0||!l.legend)return;var rows=null;try{rows=l.legend(V)}catch(x){rows=null}if(!Array.isArray(rows)||!rows.length)return;
  var lb=/^mapviz\./.test(l.label)?tx(l.label):String(l.label);b.appendChild(para(lb+': '+rows.map(function(r){return r.label}).join('; ')))})}
 function render(){status();drawTop();drawWhy();drawFair();drawLegendBox()}
 V.addPanel({id:'strong',side:'right',build:function(box){
  el.status=leaf('mv.strong.status','mapviz.strong.blk.status',[],{role:'status','aria-live':'polite'});
  el.preset=h('select',{onchange:function(){ST.preset=el.preset.value||'balanced';ST.w=presetW(ST.preset);drawWeights();changed()}},['balanced','hold','attack'].map(function(p){return h('option',{value:p,text:tx('mapviz.strong.preset.'+p)})}));
  el.preset.value=ST.preset;
  el.weights=leaf('mv.strong.weights','mapviz.strong.blk.weights',[]);el.top=leaf('mv.strong.top','mapviz.strong.blk.top',[]);el.why=leaf('mv.strong.why','mapviz.strong.blk.why',[],{'aria-live':'polite'});
  el.fair=leaf('mv.strong.fair','mapviz.strong.blk.fair',[]);el.legend=leaf('mv.strong.legend','mapviz.shell.legend',[]);
  box.appendChild(leaf('mv.strong.title','mapviz.strong.title',[h('h3',{text:tx('mapviz.strong.title')})]));box.appendChild(el.status);
  box.appendChild(h('div',{class:'fld',blk:'mv.strong.preset','data-blkname':tx('mapviz.strong.preset')},[h('label',{class:'f'},[h('span',{class:'n',text:tx('mapviz.strong.preset')}),el.preset,h('span')])]));
  [el.weights,el.top,el.why,el.fair,el.legend].forEach(function(x){box.appendChild(x)});drawWeights();render()}});
 // ---- events ----
 function prune(){var p=base()+'|';[J,G,IMG,WC].forEach(function(o){Object.keys(o).forEach(function(k){if(k.indexOf(p)!==0)delete o[k]})})}
 V.on('map',function(m){if(!m||!m.key){J={};G={};IMG={};WC={};OBJ={};ST.pick=null;ST.wk=null;render();relist();return}prune();
  var k=jkey();if(ST.pickK!==k)ST.pick=null;if(ST.wk!==k&&cur()){ST.wk=k;ST.w=presetW(ST.preset)}drawWeights();if(V.doc&&!V.q('docBusy'))ask();render();relist();redraw()});
 V.on('doc',function(d){if(d&&d.ok&&V.doc)ask();render();relist()});
 V.on('products',function(){if(!V.q('map'))return;var k=jkey(),c=J[k];if(c&&c.state==='need'&&!ST.mk[k]&&!runText())ask(true);
  Object.keys(G).forEach(function(g){if(G[g].state==='need'||G[g].state==='na')delete G[g]});scoreGrids();redraw()});
 V.on('job',function(){status()});
 V.on('layers',function(d){prefetch(d&&d.visible||visible());drawLegendBox()});
 V.on('cursor',function(d){if(d&&d.click&&d.hit&&d.hit.part==='strong'&&d.hit.id!=null)pick(d.hit.id)});
 V.on('theme',function(){IMG={};redraw();drawLegendBox()});
}});
})();
`.replace('/*ENG*/{}', JSON.stringify(ENG));
