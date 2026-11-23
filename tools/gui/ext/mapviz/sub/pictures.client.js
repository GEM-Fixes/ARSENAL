// Map Viewer pictures panel (MV-PG4, builder PG4a): the page-pg4 draft section 5; tools/mapviz/README.md 1.10 (page API V),
// 5.2 (tiles), 6.1 (routes). One row per picture of the open map (GET pictures): topographic, schematic, ground, the three
// realistic rungs, the four artistic styles and the editor shot, each with its state (made w x h, not made, not built,
// or the words of the job that makes it), Make, Show and Save. A size picker (default, 1024, 2048, 4096) applies to every
// row whose job keys the size. A light picker (clean daylight, the mode's light; late F7) applies to the l4 row only
// (job field light): its GET pictures, Make, tiles and Save. Made l1..l4 rows whose sidecar says brightness 'unverified'
// (GoH) say so in the row. Show sets the picture the layer 'picture' (group base) draws and tells the other parts
// ('picture' event); a 'picture' event of the style part sets it too. Save asks GET export and hands the PNG to the
// browser through a Blob link. The status line names the shown picture with its notes (approximate, brightness not
// checked, gaps) and the last save. The same rows and rules on AS64, MoW:AS2 and Gates of Hell: the page has no game
// branch, the server's rows and the sidecars carry the differences.
// Author: Imperator_Aug (ARSENAL, ia-c2bbc3cc)
// Size choice (late F11): the presets, "Match a game use" (one entry per file this game reads for the map, from GET
// previews/targets, labelled with its use and pixel size) and "Custom" (width and height, whole pixels 64 to 8192, a "keep
// the map's shape" tick that fills the other side). An exact size W x H comes with a layout for a shape that is not the
// map's (stretch, the default; fit with blurred bars; crop) and the words of what happens. The picture job is made at the
// long side previews sizes.longSide gives (job field size: a whole number, as every job); Save asks GET export with
// out=WxH and fit, so the PNG is exactly W x H. The control is EXT_SCREENS.mapviz.sizeKit.build(V, o), shared with the
// style part (part order pictures before style); its maths equals tools/mapviz/previews/sizes.js (the part test checks).
module.exports = String.raw`
(function(){
if(!EXT_SCREENS.mapviz||!EXT_SCREENS.mapviz.parts)return;
// ---- the size kit: presets, game uses, custom W x H; shared with the style part ----
if(!EXT_SCREENS.mapviz.sizeKit)EXT_SCREENS.mapviz.sizeKit=(function(){
 var MIN=64,MAX=8192,FITS=['stretch','backdrop','crop'],USES=['preview','small','minimap','header','header_interface'],MEMO={};
 function boxOf(V){var d=V&&V.doc,b=d&&d.boxes&&d.boxes.world;return b&&b.length===4&&b[2]>b[0]&&b[3]>b[1]?b:null}
 function whole(v){var s=String(v==null?'':v).replace(/^\s+|\s+$/g,'');return /^[0-9]+$/.test(s)?Number(s):null}
 // check(w, h) -> null | {k, a}: the first fault in plain words (the server says the same again, previews sizes.checkWH)
 function check(w,h){var two=[['w',w],['h',h]];for(var i=0;i<2;i++){var raw=two[i][1],n=whole(raw),side=tx('mapviz.pictures.side.'+two[i][0]);
   if(raw==null||String(raw).replace(/\s+/g,'')==='')return {k:'mapviz.pictures.badEmpty',a:{side:side}};
   if(n==null)return {k:'mapviz.pictures.badWhole',a:{side:side,v:String(raw)}};
   if(n<MIN)return {k:'mapviz.pictures.badSmall',a:{side:side,n:MIN}};if(n>MAX)return {k:'mapviz.pictures.badBig',a:{side:side,n:MAX}}}return null}
 function clamp(n){return Math.min(MAX,Math.max(MIN,n))}
 function shapeH(b,w){return clamp(Math.round(w*(b[3]-b[1])/(b[2]-b[0])))}
 function shapeW(b,h){return clamp(Math.round(h*(b[2]-b[0])/(b[3]-b[1])))}
 // the long side of the picture job that covers w x h at the layout with no upsampling (= previews sizes.longSide)
 function longSide(b,w,h,fit){var bw=b[2]-b[0],bh=b[3]-b[1],L=Math.max(bw,bh),fw=bw,fh=bh,pw=w,ph=h;
  if(fit==='crop'){var cw=bw,ch=bw*h/w;if(ch>bh){ch=bh;cw=bh*w/h}fw=cw;fh=ch}
  else if(fit==='backdrop'){var iw=w,ih=Math.round(w*bh/bw);if(ih>h){ih=h;iw=Math.round(h*bw/bh)}pw=Math.max(1,iw);ph=Math.max(1,ih)}
  return clamp(Math.ceil(Math.max(pw/fw,ph/fh)*L-1e-6))}
 function ctxOf(V){return [V.q('target')||'',V.q('game')||'',V.q('mod')||'',V.q('map')||'',V.q('mode')||''].join('|')}
 // the game uses of the open map (GET previews/targets, one ask per context for every panel): [{id, w, h}]
 function uses(V,done){var k=ctxOf(V),m=MEMO[k];if(!V.q('map')){done([]);return}
  if(m){if(m.rows)done(m.rows);else m.wait.push(done);return}
  m=MEMO[k]={rows:null,wait:[done]};var p;try{p=V.api('GET','previews/targets',{})}catch(x){p=null}
  function end(rows){m.rows=rows;var w=m.wait;m.wait=[];w.forEach(function(f){f(rows)})}
  if(!p||typeof p.then!=='function'){end([]);return}
  p.then(function(a){var out=[];((a&&a.rows)||[]).forEach(function(r){if(r&&USES.indexOf(r.id)>=0&&r.state!=='none'&&r.size&&r.size.length===2&&r.size[0]>0&&r.size[1]>0)out.push({id:r.id,w:r.size[0],h:r.size[1]})});end(out)},
   function(e){delete MEMO[k];end([])})}
 // build(V, o): o = {presets:[null | n], dflt:'' | 'n', label(n), name: label key, onchange(v)}; v = {size, out:{w, h, fit} | null,
 // use}. A fault keeps the last good size (its words say so). Returns {el, sel, value(), refresh(), sync(size), state}
 function build(V,o){var s={mode:o.dflt||'',uses:[],ukey:null,w:'',h:'',keep:true,fit:'stretch',msg:null,lastKey:null,last:null},el={};
  function opt(v,t){return h('option',{value:v,text:t})}
  function drawSel(){var x=el.sel;x.textContent='';(o.presets||[]).forEach(function(n){x.appendChild(opt(n==null?'':String(n),o.label(n)))});
   s.uses.forEach(function(u){x.appendChild(opt('use:'+u.id,tx('mapviz.pictures.useOpt',{use:tx('mapviz.pictures.use.'+u.id),w:u.w,h:u.h})))});
   x.appendChild(opt('custom',tx('mapviz.pictures.custom')));x.value=s.mode}
  function useRow(id){for(var i=0;i<s.uses.length;i++)if(s.uses[i].id===id)return s.uses[i];return null}
  function made(b,w,h,use){return {size:longSide(b,w,h,s.fit),out:{w:w,h:h,fit:s.fit},use:use}}
  function cur(){var m=s.mode;if(m==='')return {size:null,out:null,use:null};if(/^[0-9]+$/.test(m))return {size:+m,out:null,use:null};var b=boxOf(V);
   if(m.indexOf('use:')===0){var r=useRow(m.slice(4));if(!r)return {err:{k:'mapviz.pictures.noUse'}};if(!b)return {err:{k:'mapviz.pictures.noBox'}};return made(b,r.w,r.h,r.id)}
   if(m==='custom'){var f=check(s.w,s.h);if(f)return {err:f};if(!b)return {err:{k:'mapviz.pictures.noBox'}};return made(b,whole(s.w),whole(s.h),null)}
   return {size:null,out:null,use:null}}
  function note(){var p=el.note,v=s.last,b=boxOf(V);p.textContent='';var exact=s.mode==='custom'||s.mode.indexOf('use:')===0;
   el.fitBox.hidden=!exact;el.custom.hidden=s.mode!=='custom';
   if(s.msg){p.textContent=tx(s.msg.k,s.msg.a||{})+' '+tx('mapviz.pictures.keepLast');return}
   if(!exact||!v||!v.out||!b)return;var a=(b[2]-b[0])/(b[3]-b[1]),r=v.out.w/v.out.h,same=Math.abs(a/r-1)<=0.01;
   p.textContent=tx(same?'mapviz.pictures.shapeSame':'mapviz.pictures.shape.'+v.out.fit,{w:v.out.w,h:v.out.h,L:v.size,map:a.toFixed(2),size:r.toFixed(2)})}
  function fire(){var v=cur();if(v.err){s.msg=v.err;note();return}s.msg=null;var k=JSON.stringify(v);if(k!==s.lastKey){s.lastKey=k;s.last=v;if(o.onchange)o.onchange(v)}note()}
  function fill(which){if(!s.keep)return;var b=boxOf(V);if(!b)return;
   if(which==='w'){var w=whole(s.w);if(w!=null&&w>=MIN&&w<=MAX){s.h=String(shapeH(b,w));el.h.value=s.h}}
   else{var hh=whole(s.h);if(hh!=null&&hh>=MIN&&hh<=MAX){s.w=String(shapeW(b,hh));el.w.value=s.w}}}
  el.sel=h('select',{'aria-label':tx(o.name),onchange:function(){s.mode=String(el.sel.value||'');if(s.mode==='custom'&&s.w===''&&s.h===''){var b=boxOf(V);s.w='2048';if(b)s.h=String(shapeH(b,2048));el.w.value=s.w;el.h.value=s.h}fire()}});
  el.fit=h('select',{'aria-label':tx('mapviz.pictures.fit'),onchange:function(){s.fit=FITS.indexOf(el.fit.value)>=0?el.fit.value:'stretch';fire()}});
  FITS.forEach(function(f){el.fit.appendChild(opt(f,tx('mapviz.pictures.fit.'+f)))});el.fit.value=s.fit;
  el.w=h('input',{type:'number',min:String(MIN),max:String(MAX),step:'1','aria-label':tx('mapviz.pictures.wLabel'),onchange:function(){s.w=String(el.w.value==null?'':el.w.value);fill('w');fire()}});
  el.h=h('input',{type:'number',min:String(MIN),max:String(MAX),step:'1','aria-label':tx('mapviz.pictures.hLabel'),onchange:function(){s.h=String(el.h.value==null?'':el.h.value);fill('h');fire()}});
  el.keep=h('input',{type:'checkbox',title:tx('mapviz.pictures.keepT'),onchange:function(){s.keep=!!el.keep.checked;fill('w');fire()}});el.keep.checked=true;
  el.fitBox=h('label',{class:'f'},[h('span',{class:'n',text:tx('mapviz.pictures.fit')}),el.fit,h('span')]);
  el.custom=h('div',{},[h('label',{class:'f'},[h('span',{class:'n',text:tx('mapviz.pictures.wLabel')}),el.w,h('span')]),
   h('label',{class:'f'},[h('span',{class:'n',text:tx('mapviz.pictures.hLabel')}),el.h,h('span')]),
   h('label',{class:'f'},[el.keep,h('span',{text:' '+tx('mapviz.pictures.keep')})])]);
  el.note=h('p',{class:'hint',role:'status','aria-live':'polite'});
  el.root=h('div',{},[h('label',{class:'f'},[h('span',{class:'n',text:tx(o.name)}),el.sel,h('span')]),el.fitBox,el.custom,el.note]);
  drawSel();s.lastKey=JSON.stringify(cur());note();
  // a map (or mode, game, mod) change: the uses of the new map (asked once the document is read) and the long side for its
  // shape; until they come a chosen use keeps its last good size
  function refresh(){var k=ctxOf(V);if(V.q('map')&&!V.q('docBusy')&&s.ukey!==k){s.ukey=k;s.uses=[];uses(V,function(rows){if(s.ukey!==k)return;s.uses=rows;drawSel();fire()})}fire()}
  // sync(size): the part's own size moved (a preset said by another part); an exact choice or a size that is no preset stays
  function sync(size){if(s.mode.indexOf('use:')===0||s.mode==='custom')return;if((o.presets||[]).indexOf(size==null?null:+size)<0)return;var v=size==null?'':String(size);if(v===s.mode)return;s.mode=v;el.sel.value=v;s.lastKey=JSON.stringify({size:size==null?null:+size,out:null,use:null});s.last=null;note()}
  return {el:el.root,sel:el.sel,parts:el,value:function(){return s.last||cur()},refresh:refresh,sync:sync,state:s}}
 return {MIN:MIN,MAX:MAX,FITS:FITS,USES:USES,check:check,longSide:longSide,shapeH:shapeH,shapeW:shapeW,build:build,boxOf:boxOf,memo:MEMO}})();
EXT_SCREENS.mapviz.parts.push({id:'pictures',init:function(V){
 if(!V||V.q('rmt'))return;
 var K=EXT_SCREENS.mapviz.kit||null;
 var BASES=['topo','l0','l1','l2','l3','l4','staff','painted','recon','sketch','edshot'];
 var SIZES=[1024,2048,4096],RUNGS={l1:1,l2:1,l3:1,l4:1};
 // st.list: the last GET pictures answer of key st.lkey ({items, by, notRead}); st.shown: {base, size, key} or null
 // st.light: null = clean daylight (the job default), 'mode' = the mode's light; it applies to the l4 row only (late F7)
 // st.failed: the list key whose last read failed with no list to keep (asked again on 'products' and 'refresh')
 // st.out: the exact size of a saved picture {w, h, fit} (a game use or custom) or null (the picture as made)
 var st={size:null,out:null,light:null,list:null,lkey:null,asking:null,stale:0,failed:null,shown:null,vis:false,msg:null,live:false},TL={},el={},SZ=null;
 var LIT={l4:1};
 // ---- keys: every own cache key holds target, game, mod, map and mode ----
 function ctx(){return [V.q('target')||'',V.q('game')||'',V.q('mod')||'',V.q('map')||'',V.q('mode')||''].join('|')}
 function lkeyNow(){return ctx()+'|'+(st.size==null?'':st.size)+'|'+(st.light||'')}
 function litOf(b){return LIT[b]?st.light:null}
 function docBusy(){return !!V.q('docBusy')}
 function has(o,k){return !!o&&Object.prototype.hasOwnProperty.call(o,k)}
 function name(b){return tx('mapviz.pictures.base.'+b)}
 // ---- jobs (the base part's rule): the words of a page job of this what, target and map whose key fields fit the need ----
 // dflt: the need's size and light are the job defaults (the row at the default size and clean light), so a job that
 // left them out is this row's job; a job that names another size or light is not
 var DFL={light:'clean'};
 function fits(ja,na,dflt){ja=ja||{};for(var k in na||{}){if(!has(na,k)||na[k]==null)continue;var v=ja[k];
   if(k==='map'){if(v!=null&&String(v)!==String(na[k]))return false;continue}
   if(v==null&&((k==='size'&&dflt)||(k==='light'&&String(na[k])===DFL.light)))continue;
   if(v==null||String(v)!==String(na[k]))return false}return true}
 function runText(what,args,dflt){var js=V.q('jobs'),t=V.q('target'),m=V.q('map');if(!what||!Array.isArray(js))return null;
  for(var i=0;i<js.length;i++){var j=js[i];if(j&&!j.end&&j.what===what&&j.target===t&&(!j.map||j.map===m)&&(!j.args||fits(j.args,args,dflt)))return j.text||String(what)}return null}
 function runOf(x){return x&&x.need?runText(x.need.what,x.need.args,st.size==null):null}
 function errText(e){if(e&&e.key&&/^mapviz\./.test(e.key))return tx(e.key,{msg:(e.params&&e.params.msg)||e.message||''});return String(e&&(e.text||e.message)||e)}
 function needOf(e){var p=e&&(e.params||(e.reply&&e.reply.params));return e&&e.status===404&&p&&p.need&&p.need.what?p.need:null}
 function notBuiltErr(e){return !!e&&(e.status===501||/MV_NOT_BUILT/.test(String(e.key||'')+' '+String(e.message||'')))}
 // ---- an item of the server is taken only with a known base and state; its side only when sound ----
 function fin(v){return typeof v==='number'&&isFinite(v)}
 function sideOk(s){return !!s&&fin(s.w)&&fin(s.h)&&s.w>0&&s.h>0&&Array.isArray(s.box)&&s.box.length===4&&fin(s.box[0])&&fin(s.box[1])&&fin(s.box[2])&&fin(s.box[3])}
 function itemOk(x){return !!x&&BASES.indexOf(x.base)>=0&&(x.state==='made'||x.state==='need'||x.state==='notBuilt')}
 // args(b): the size, and the light when the row b keys it (b null = the list: the server applies light to the l4 row
 // only); the shell adds target, game, modDir, map and mode (QCOM pictures:1, 'export':1)
 function args(b){var o={};if(st.size!=null)o.size=st.size;
  var l=b==null?st.light:litOf(b);if(l)o.light=l;return o}
 // ---- the list (GET pictures) ----
 function ask(force){var key=lkeyNow();if(!V.q('target')||!V.q('map')||docBusy())return;if(st.asking===key)return;if(!force&&st.list&&st.lkey===key&&!st.list.notRead)return;
  st.asking=key;V.api('GET','pictures',args(null)).then(function(a){if(st.asking===key)st.asking=null;if(key!==lkeyNow())return;st.stale=0;st.failed=null;
    var by={},items=[];((a&&a.items)||[]).forEach(function(x){if(itemOk(x)&&!by[x.base]){by[x.base]=x;items.push(x)}});
    // a row of the last list whose Make still runs keeps its flag
    var old=st.list&&st.lkey===key?st.list.by:{};items.forEach(function(x){if(old[x.base]&&old[x.base].mk)x.mk=true});
    st.list={items:items,by:by,notRead:false};st.lkey=key;draw();status()},
   function(e){if(st.asking===key)st.asking=null;if(key!==lkeyNow())return;
    // a held read dropped (stale) is no fault: ask once more at once; a second stale answer leaves no status
    if(e&&e.stale){st.stale++;if(st.stale<2)ask();return}
    if(st.list&&st.lkey===key)st.list.notRead=true;else st.failed=key;st.msg={k:'fail',a:{msg:errText(e)}};draw();status()})}
 function drop(){st.list=null;st.lkey=null;st.asking=null;st.stale=0;st.failed=null}
 // ---- rows ----
 function rowState(x){if(x.state==='notBuilt')return {t:tx('mapviz.pictures.notBuilt'),cls:'hint'};
  var rt=runOf(x);
  if(x.mk||rt)return {t:rt||tx('mapviz.pictures.making'),job:true};
  if(x.state==='need')return {t:tx('mapviz.pictures.notMade'),make:true};
  if(!sideOk(x.side))return {t:tx('mapviz.pictures.na')};
  // GoH (and any sidecar that says so): the realistic rungs say the brightness is not checked against the game yet
  return {t:tx('mapviz.pictures.made',{w:x.side.w,h:x.side.h})+(x.side.brightness==='unverified'&&RUNGS[x.base]?' '+tx('mapviz.pictures.bright'):''),ok:true}}
 function btn(key,tkey,fn){return h('button',{type:'button',text:tx(key),title:tkey?tx(tkey):null,onclick:fn})}
 function draw(){var box=el.list;if(!box)return;box.textContent='';
  if(!V.q('map')){box.appendChild(h('p',{class:'hint',text:tx('mapviz.pictures.noMap')}));return}
  if(!st.list){box.appendChild(h('p',{class:'hint',text:tx(st.failed&&st.failed===lkeyNow()?'mapviz.pictures.notRead':'mapviz.pictures.reading')}));return}
  st.list.items.forEach(function(x){var s=rowState(x),kids=[h('b',{text:name(x.base)}),h('span',{text:' '+s.t+(st.list.notRead?' '+tx('mapviz.pictures.notRead'):'')})];
   if(x.pack&&(x.base==='l3'||x.base==='l4')&&fin(x.pack.defs))kids.push(h('span',{class:'hint',text:' '+tx('mapviz.pictures.packCounts',{defs:x.pack.defs,placed:fin(x.pack.instances)?x.pack.instances:0,failed:fin(x.pack.failed)?x.pack.failed:0})}));
   var bar=[];
   if(s.make)bar.push(btn('mapviz.pictures.make','mapviz.pictures.makeT',function(){make(x)}));
   if(s.ok){var on=!!st.shown&&st.shown.base===x.base&&st.shown.size===st.size&&st.shown.light===litOf(x.base)&&st.shown.key===ctx();
    bar.push(h('button',{type:'button',text:tx('mapviz.pictures.show'),'aria-pressed':on?'true':'false',onclick:function(){show(x.base)}}));
    bar.push(btn('mapviz.pictures.save',null,function(){save(x.base)}))}
   if(bar.length){kids.push(h('span',{text:' '}));bar.forEach(function(b,i){if(i)kids.push(h('span',{text:' '}));kids.push(b)})}
   box.appendChild(h('div',{class:'row'+(s.cls?' '+s.cls:''),'data-base':x.base},kids))})}
 // make(x): the user's press posts the job the need names; a second press while it runs posts nothing
 function make(x){if(!x||x.mk||!x.need||runOf(x))return;var key=lkeyNow();x.mk=true;draw();
  V.job(x.need.what,x.need.args||{}).then(function(){x.mk=false;if(key===lkeyNow()){drop();ask()}draw();status()},
   function(e){x.mk=false;if(notBuiltErr(e)){x.state='notBuilt';x.why='part';x.need=null}else st.msg={k:'fail',a:{msg:errText(e)}};draw();status()})}
 // show(base): the picture the layer draws (the user ticks the layer on); the other parts follow ('picture')
 function show(base){st.shown={base:base,size:st.size,light:litOf(base),key:ctx()};st.msg=null;draw();status();V.emit('picture',{base:base,size:st.size,from:'pictures'});V.redraw()}
 // save(base): GET export -> Blob -> a[download]; no URL or Blob in this browser: say so, ask nothing
 function save(base){var W=typeof window!=='undefined'?window:null,U=W&&W.URL,B=W&&W.Blob;
  if(!U||typeof U.createObjectURL!=='function'||typeof B!=='function'||!K||!K.b64){st.msg={k:'noSave'};status();return}
  // an exact size (a game use or custom): the PNG is made W x H at the chosen layout (GET export out, fit)
  var o=args(base);o.base=base;if(st.out){o.out=st.out.w+'x'+st.out.h;o.fit=st.out.fit}var key=ctx();
  V.api('GET','export',o).then(function(a){if(key!==ctx())return;if(!a||typeof a.png!=='string'||!a.name){st.msg={k:'fail',a:{msg:tx('mapviz.pictures.na')}};status();return}
    try{var url=U.createObjectURL(new B([K.b64(a.png)],{type:'image/png'})),link=h('a',{href:url,download:a.name});
     if(document.body&&document.body.appendChild)document.body.appendChild(link);if(typeof link.click==='function')link.click();
     if(link.parentNode&&link.parentNode.removeChild)link.parentNode.removeChild(link);
     setTimeout(function(){try{if(typeof U.revokeObjectURL==='function')U.revokeObjectURL(url)}catch(e){}},1000);
     st.msg={k:'saved',a:{name:a.name,w:a.w,h:a.h}}}catch(e){st.msg={k:'noSave'}}status()},
   function(e){if(key!==ctx())return;var n=needOf(e);st.msg=n?{k:'notMadeSave'}:{k:'fail',a:{msg:errText(e)}};status()})}
 // ---- status: the shown picture, its notes, the last message ----
 function shownItem(){var s=st.shown;if(!s||!st.list||s.key!==ctx()||s.size!==st.size||s.light!==litOf(s.base)||st.lkey!==lkeyNow())return null;return st.list.by[s.base]||null}
 function noteSpan(code){var k='mapviz.pictures.gap.'+code,t=tx(k);if(t===k)return h('span',{title:code,text:' '+tx('mapviz.pictures.gapOther')});return h('span',{text:' '+t})}
 function status(){var p=el.status;if(!p)return;p.textContent='';var s=st.shown&&st.shown.key===ctx()?st.shown:null;
  if(s){var x=shownItem();p.appendChild(h('span',{text:tx('mapviz.pictures.shown',{name:name(s.base)})}));
   if(!st.vis)p.appendChild(h('span',{text:' '+tx('mapviz.pictures.tickLayer')}));
   var sd=x&&x.state==='made'&&sideOk(x.side)?x.side:null;
   if(x&&x.state==='need')p.appendChild(h('span',{text:' '+tx('mapviz.pictures.notMade')}));
   if(sd){if(sd.approx)p.appendChild(h('span',{text:' '+tx('mapviz.pictures.approx')}));
    if(sd.brightness==='unverified'&&RUNGS[s.base])p.appendChild(h('span',{text:' '+tx('mapviz.pictures.bright')}));
    var seen={};(sd.gaps||[]).concat((sd.notes||[]).map(function(n){return n&&n.code})).forEach(function(c){if(typeof c!=='string'||seen[c])return;seen[c]=1;p.appendChild(noteSpan(c))});
    // notes with no code (the render's own words, English): one count, the texts in the title
    var free=(sd.notes||[]).filter(function(n){return n&&n.code==null&&typeof n.text==='string'&&n.text}).map(function(n){return n.text});
    if(free.length)p.appendChild(h('span',{title:free.join('\n'),text:' '+tx('mapviz.pictures.notesMore',{n:free.length})}))}}
  if(st.msg){var m=st.msg,t=m.k==='fail'?(m.a&&m.a.msg)||'':tx('mapviz.pictures.'+m.k,m.a||{});if(t){if(p.firstChild)p.appendChild(h('span',{text:' '}));p.appendChild(h('span',{text:t}))}}}
 // ---- the picture layer: tiles of the shown picture (README 5.2, through the shell's tile maths as the base part) ----
 function tkey(b,z,l){return ctx()+'|'+b+'|'+(z==null?'':z)+'|'+(l||'')}
 // a header or batch that failed is asked again on 'products' and 'refresh' (dropFailed); a stale rejection (the context
 // moved while it was held) is no fault: the entry goes, so the next draw asks again
 function tiles(b,size,l){var k=tkey(b,size,l),t=TL[k];if(t)return t;t=TL[k]={base:b,light:l||null,hd:null,need:null,err:null,busy:true,img:{}};
  var o={base:b,z:0,t:'0.0'};if(size!=null)o.size=size;if(l)o.light=l;
  V.api('GET','tiles',o).then(function(a){t.busy=false;
    // an answer for another base or with no frame is not drawn
    if(!a||a.base!==b||!(a.w>0)||!(a.h>0)||!(a.cell>0)){t.err=true;V.redraw();return}
    t.hd={zmax:a.zmax>0?a.zmax|0:0,w:a.w,h:a.h,ox:a.ox,oy:a.oy,cell:a.cell};take(t,a);V.redraw()},
   function(e){t.busy=false;if(e&&e.stale){if(TL[k]===t)delete TL[k];return}var n=needOf(e);if(n)t.need=n;else t.err=true;status()});
  return t}
 function dropFailed(){Object.keys(TL).forEach(function(k){var t=TL[k];if(t.need||t.err){delete TL[k];return}
  Object.keys(t.img).forEach(function(i){if(t.img[i]&&t.img[i].failed)delete t.img[i]})})}
 function take(t,a){(a&&a.tiles||[]).forEach(function(x){if(!x)return;var k=a.z+'|'+x.t;if(x.missing||!x.png){t.img[k]={missing:true};return}
  var r={img:null,ok:false};t.img[k]=r;if(typeof Image!=='function')return;
  try{var im=new Image();im.onload=function(){r.ok=true;V.redraw()};im.src='data:image/png;base64,'+x.png;r.img=im;if(im.complete&&im.width)r.ok=true}catch(e){}})}
 function fetchTiles(t,z,list,size){list.forEach(function(n){t.img[z+'|'+n]={busy:true}});var o={base:t.base,z:z,t:list.join(',')};if(size!=null)o.size=size;if(t.light)o.light=t.light;
  V.api('GET','tiles',o).then(function(a){if(!a||a.base!==t.base){list.forEach(function(n){t.img[z+'|'+n]={failed:true}});return}take(t,a);V.redraw()},
   function(e){list.forEach(function(n){if(e&&e.stale)delete t.img[z+'|'+n];else t.img[z+'|'+n]={failed:true}})})}
 function drawLayer(ctx2,view){var s=st.shown;if(!s||s.key!==ctx()||!V.q('map')||docBusy())return;var t=tiles(s.base,s.size,s.light),hd=t.hd,T=EXT_SCREENS.mapviz._t;
  if(!hd||t.err||!ctx2||!ctx2.drawImage||!T||!T.pickZ||!T.tileList)return;
  var z=T.pickZ(hd,view.zoom),list=T.tileList(hd,z,view,view.w,view.h),ask2=[];
  list.forEach(function(n){var r=t.img[z+'|'+n];if(!r){ask2.push(n);return}
   if(r.ok&&r.img){var xy=n.split('.'),b=null;if(K&&K.tileBox)b=K.tileBox(hd,z,+xy[0],+xy[1],view,view.w,view.h);else if(T.tileBox)b=T.tileBox(hd,z,+xy[0],+xy[1],view,view.w,view.h);
    if(b)try{ctx2.drawImage(r.img,b[0],b[1],b[2],b[3])}catch(e){}}});
  for(var i=0;i<ask2.length;i+=16)fetchTiles(t,z,ask2.slice(i,i+16),s.size)}
 V.addLayer({id:'picture',group:'base',label:'mapviz.pictures.layer',engineTrue:false,defaultOn:false,draw:drawLayer});
 // ---- the panel ----
 V.addPanel({id:'pictures',side:'right',build:function(box){
  // the size choice (sizeKit): a preset, a game use or custom; st.size = the job's long side, st.out = the saved W x H
  SZ=EXT_SCREENS.mapviz.sizeKit.build(V,{presets:[null].concat(SIZES),dflt:'',name:'mapviz.pictures.size',
   label:function(n){return n==null?tx('mapviz.pictures.sizeDefault'):tx('mapviz.pictures.px',{n:n})},
   onchange:function(v){st.size=v.size==null?null:v.size;st.out=v.out||null;st.msg=null;onCtx();draw();ask();status()}});
  el.size=SZ.sel;
  // the light picker (late F7): clean daylight (the job default) or the mode's light; the l4 row only
  el.light=h('select',{onchange:function(){var v=el.light.value;st.light=v==='mode'?'mode':null;st.msg=null;
   // a change of light drops the list and the l4 tiles; a shown l4 follows the picker
   if(st.shown&&LIT[st.shown.base])st.shown.light=st.light;Object.keys(TL).forEach(function(k){if(LIT[TL[k].base])delete TL[k]});
   onCtx();draw();ask();status();V.redraw()}});
  el.light.appendChild(h('option',{value:'',text:tx('mapviz.pictures.lightClean')}));
  el.light.appendChild(h('option',{value:'mode',text:tx('mapviz.pictures.lightMode')}));
  el.list=h('div',{blk:'mv.pictures.list','data-blkname':tx('mapviz.pictures.blk.list')});
  el.status=h('p',{blk:'mv.pictures.status',class:'hint',role:'status','aria-live':'polite','data-blkname':tx('mapviz.pictures.blk.status')});
  box.appendChild(h('div',{blk:'mv.pictures.title','data-blkname':tx('mapviz.pictures.title')},[h('h3',{text:tx('mapviz.pictures.title')})]));
  box.appendChild(h('div',{class:'fld',blk:'mv.pictures.size','data-blkname':tx('mapviz.pictures.blk.size')},[SZ.el]));
  box.appendChild(h('div',{class:'fld',blk:'mv.pictures.light','data-blkname':tx('mapviz.pictures.blk.light')},[h('label',{class:'f'},[h('span',{class:'n',text:tx('mapviz.pictures.light')}),el.light,h('span')])]));
  box.appendChild(el.list);box.appendChild(el.status);draw();status()}});
 // ---- events ----
 // a context change (another map, mode, game, folder or mod; key null) drops the list, the tiles and the shown picture
 function onCtx(){var c=ctx();if(st.shown&&st.shown.key!==c)st.shown=null;if(st.lkey&&st.lkey!==lkeyNow())drop();
  Object.keys(TL).forEach(function(k){if(k.indexOf(c+'|')!==0)delete TL[k]})}
 V.on('map',function(d){st.live=true;onCtx();if(!d||!d.key){st.msg=null;draw();status();return}if(d.doc){if(SZ)SZ.refresh();ask()}draw();status()});
 V.on('doc',function(){st.live=true;onCtx();if(SZ)SZ.refresh();ask();draw();status()});
 V.on('refresh',function(){st.live=true;onCtx();dropFailed();ask();draw();status();V.redraw()});
 // a page job ended done or the cache changed: a "not made" row asks once more (not one whose own job still runs); a
 // first read that failed asks again; tiles that failed or were not made are asked again
 V.on('products',function(){dropFailed();
  if(!st.list){if(st.failed&&st.failed===lkeyNow())ask(true);V.redraw();return}
  if(st.lkey!==lkeyNow())return;var any=st.list.notRead||st.list.items.some(function(x){return x.state==='need'&&!x.mk&&!runOf(x)});
  if(any)ask(true);V.redraw()});
 V.on('job',function(){draw()});
 V.on('layers',function(d){var v=!!(d&&Array.isArray(d.visible)&&d.visible.indexOf('picture')>=0);if(v!==st.vis){st.vis=v;status()}});
 V.on('theme',function(){V.redraw()});
 // the style part (or another part) shows a picture: the layer draws it; base null = none
 V.on('picture',function(d){if(!d||d.from==='pictures')return;if(d.base==null){st.shown=null}else{if(BASES.indexOf(d.base)<0)return;
   st.shown={base:d.base,size:d.size==null?null:+d.size,light:litOf(d.base),key:ctx()}}draw();status();V.redraw()});
}});
})();
`;
