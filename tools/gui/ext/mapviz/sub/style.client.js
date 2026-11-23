// Map Viewer style part (MV-PG4, builder PG4b): the Artistic switch and the style picker 9, 11;
// contract draft page-pg4 section 6). The styles come only from GET styles at run time (paint styles.list()): a style the
// page has no name key for is ignored, a row with no state is taken as not built, a style that is not built or broken is
// a disabled option and is never chosen. The part never draws: it emits the page event 'picture' {base, size, from:
// 'style'} and the pictures part draws. Its status asks GET pictures for the chosen style and size and shows made, not
// made (Make), the words of a running job, or the failure. Painted relief may make a quick look at 1024 px first (two
// jobs in order on one press; the second only after the first ended done). Recon photo shows what it was made from.
// The switch is off at every page open and is not saved. The same on AS64, MoW:AS2 and Gates of Hell: no game branch.
// Author: Imperator_Aug (ARSENAL, ia-e7ca32fc)
module.exports = String.raw`
(function(){
if(!EXT_SCREENS.mapviz||!EXT_SCREENS.mapviz.parts)return;
EXT_SCREENS.mapviz.parts.push({id:'style',init:function(V){
 if(!V||V.q('rmt'))return;
 var SIZES=[1024,2048,4096],DEF=2048,QUICK=1024,STATES={built:1,'not built':1,broken:1};
 // SZ: {kit, ctl} when the pictures part's size kit is on the page (a game use or custom size gives st.size = the long side)
 var st={on:false,style:null,size:DEF,quick:true,list:null,listErr:null,listBusy:false,listStale:0,listQuiet:false,emKey:null,live:false,note:null},C={},el={},SZ=null;
 // ---- small helpers ----
 function has(o,k){return Object.prototype.hasOwnProperty.call(o,k)}
 function nameOf(id){return tx('mapviz.style.name.'+id)}
 // a style id is one the page knows when its name key is in the language file (the four names are the only list)
 function known(id){if(typeof id!=='string'||!/^[a-z0-9_]+$/.test(id))return false;var k='mapviz.style.name.'+id;return tx(k)!==k}
 function errText(e){if(e&&e.key&&/^mapviz\./.test(e.key))return tx(e.key,{msg:(e.params&&e.params.msg)||e.message||''});return String(e&&(e.text||e.message)||e)}
 function needOf(e){var p=e&&(e.params||(e.reply&&e.reply.params));return e&&e.status===404&&p&&p.need&&p.need.what?p.need:null}
 function notBuiltErr(e){return !!e&&(e.status===501||/MV_NOT_BUILT/.test(String(e.key||'')+' '+String(e.message||'')))}
 function isStale(e){return !!e&&(e.stale===true||(e.params&&e.params.stale===true))}
 function copy(o){var r={},k;for(k in o||{})if(has(o,k))r[k]=o[k];return r}
 // ---- jobs on the page (the base part's rule: same what, target and map, and the job's key fields fit the need) ----
 function fits(ja,na){ja=ja||{};for(var k in na||{}){if(!has(na,k)||na[k]==null)continue;var v=ja[k];
   if(k==='map'){if(v!=null&&String(v)!==String(na[k]))return false;continue}if(v==null||String(v)!==String(na[k]))return false}return true}
 function runText(what,args){var js=V.q('jobs'),t=V.q('target'),m=V.q('map');if(!what||!Array.isArray(js))return null;
  for(var i=0;i<js.length;i++){var j=js[i];if(j&&!j.end&&j.what===what&&j.target===t&&(!j.map||j.map===m)&&(!j.args||fits(j.args,args)))return j.text||String(what)}return null}
 // ---- the style list (GET styles) ----
 function clean(rows){var out=[],seen={};(Array.isArray(rows)?rows:[]).forEach(function(r){if(!r||!known(r.id)||seen[r.id])return;seen[r.id]=1;
   out.push({id:r.id,state:typeof r.state==='string'&&STATES[r.state]?r.state:'not built'})});return out}
 function rowOf(id){var l=st.list||[];for(var i=0;i<l.length;i++)if(l[i].id===id)return l[i];return null}
 function built(id){var r=rowOf(id);return !!r&&r.state==='built'}
 function anyBuilt(){return (st.list||[]).some(function(r){return r.state==='built'})}
 // the viewer's default style: Staff map on every game (design 11); else the first built one
 function defStyle(){if(built('staff'))return 'staff';var l=st.list||[];for(var i=0;i<l.length;i++)if(l[i].state==='built')return l[i].id;return null}
 // a stale answer asks once more at once; a second one leaves the list unread and quiet (no "reading" words), and the
 // next refresh or map event asks again with a fresh count
 function loadStyles(retry){if(st.listBusy||st.list)return;if(!retry)st.listStale=0;st.listBusy=true;st.listQuiet=false;draw();
  V.api('GET','styles').then(function(r){st.listBusy=false;st.listStale=0;st.list=clean(r&&r.styles);st.listErr=null;fixPick();draw();ask()},
   function(e){st.listBusy=false;if(isStale(e)){if(++st.listStale<2){loadStyles(true);return}st.listQuiet=true;draw();return}st.listErr=errText(e);draw()})}
 // the chosen style must be a built one; with none built the switch goes off (and says so to the other parts)
 function fixPick(){if(!st.style||!built(st.style))st.style=defStyle();if(st.on&&!st.style){st.on=false;emitPic()}}
 // ---- the picture of the chosen style (GET pictures bases=<style>&size=<size>), per context ----
 // ctx is the pictures part's context key: it drops its shown picture when this changes, so style says it again
 function ctx(){return [V.q('target')||'',V.q('game')||'',V.q('mod')||'',V.q('map')||'',V.q('mode')||''].join('|')}
 function key(){return ctx()+'|'+(st.style||'')+'|'+st.size}
 function cur(){return C[key()]||null}
 function ask(){if(!st.on||!st.style||!V.q('target')||!V.q('map')||V.q('docBusy'))return;var k=key();if(C[k])return;
  var c=C[k]={busy:true,item:null,need:null,nb:false,na:false,err:null,mk:false,stale:0},style=st.style;get(k,c,style)}
 // the shell adds target, game, modDir, map and mode to GET pictures (QCOM pictures:1)
 function get(k,c,style){var q={bases:style,size:st.size};
  var p;try{p=V.api('GET','pictures',q)}catch(x){p=null}
  if(!p||typeof p.then!=='function'){c.busy=false;c.na=true;draw();return}
  p.then(function(r){if(C[k]!==c)return;c.busy=false;var it=null;(r&&Array.isArray(r.items)?r.items:[]).forEach(function(x){if(x&&x.base===style&&!it)it=x});
    if(!it)c.na=true;else if(it.state==='made')c.item=it;else if(it.state==='need'&&it.need&&it.need.what)c.need={what:it.need.what,args:copy(it.need.args)};
    else if(it.state==='notBuilt')c.nb=true;else c.na=true;draw()},
   function(e){if(C[k]!==c)return;c.busy=false;
    if(isStale(e)){if(++c.stale<2){c.busy=true;get(k,c,style);return}c.quiet=true;draw();return}
    var n=needOf(e);if(n)c.need={what:n.what,args:copy(n.args)};else if(notBuiltErr(e))c.nb=true;else if(e&&e.status===404)c.na=true;else c.err=errText(e);draw()})}
 // ---- Make: one press posts the need's job (painted: 1024 first when the quick look is ticked, then the asked size) ----
 // a failed job keeps the need, so the failure words show with the Make button and a press tries again
 function make(c){if(!c||c.mk||!c.need)return;var n=c.need,args=copy(n.args);if(runText(n.what,args))return;if(args.size==null)args.size=st.size;
  var k=key(),style=st.style,size=args.size,quick=st.quick&&style==='painted'&&Number(size)>QUICK;c.mk=true;c.err=null;c.quickAt=quick?QUICK:null;draw();
  var first=quick?(function(){var a=copy(args);a.size=QUICK;
   return V.job(n.what,a).then(function(){c.quickAt=null;if(st.on&&st.style===style&&key()===k){st.emKey=ctx();V.emit('picture',{base:style,size:QUICK,from:'style'})}draw();return V.job(n.what,args)})})():V.job(n.what,args);
  first.then(function(){c.mk=false;if(C[k]===c)delete C[k];if(st.on&&st.style===style&&key()===k)emitPic();ask();draw()},
   function(e){c.mk=false;c.quickAt=null;if(notBuiltErr(e)){c.need=null;c.nb=true}else c.err=errText(e);draw()})}
 // ---- the page event: pictures draws what style asks ----
 // st.emKey: the context the last 'on' picture was said in (null when off)
 function emitPic(){var on=!!(st.on&&st.style);st.emKey=on?ctx():null;V.emit('picture',on?{base:st.style,size:st.size,from:'style'}:{base:null,size:null,from:'style'})}
 // after a context change (game, folder, mod, map, mode) the pictures part has dropped its shown picture: say it again
 function reEmit(){if(st.on&&st.style&&V.q('map')&&st.emKey!==ctx())emitPic()}
 // an entry that failed (no job of its own running) is dropped, so the next ask reads the state again
 function dropFailed(only){Object.keys(C).forEach(function(x){var c=C[x];if((!only||x===only)&&c&&c.err&&!c.mk&&!c.busy)delete C[x]})}
 function setOn(on){st.note=null;if(on&&!anyBuilt())on=false;if(on&&!st.style)st.style=defStyle();if(on&&!st.style)on=false;st.on=!!on;if(st.on)dropFailed(key());emitPic();ask();draw()}
 function pick(id){if(!built(id)){st.note=rowOf(id)?id:null;draw();return}st.note=null;st.style=id;if(st.on){emitPic();ask()}draw()}
 // n: a preset, or (the size kit: a game use or custom W x H) the long side the picture job is made at, 64..8192
 function okSize(n){return SZ?(n%1===0&&n>=SZ.kit.MIN&&n<=SZ.kit.MAX):SIZES.indexOf(n)>=0}
 function setSize(n){st.note=null;n=Number(n);if(!okSize(n))n=DEF;st.size=n;if(st.on){emitPic();ask()}draw()}
 // ---- the panel ----
 function optText(r){var nm=nameOf(r.id);return r.state==='built'?nm:tx(r.state==='broken'?'mapviz.style.broken':'mapviz.style.notBuilt',{name:nm})}
 function drawPick(){var s=el.pick;if(!s)return;s.textContent='';(st.list||[]).forEach(function(r){var o=h('option',{value:r.id,text:optText(r),disabled:r.state!=='built'});if(r.state!=='built')o.disabled=true;s.appendChild(o)});
  s.value=st.style||'';s.disabled=!anyBuilt()}
 function drawSwitch(){var sw=el.sw;if(!sw)return;sw.checked=!!st.on;sw.disabled=!anyBuilt();if(el.swHint)el.swHint.textContent=st.list&&!anyBuilt()?tx('mapviz.style.noPaint'):''}
 function drawOpts(){var box=el.opts;if(!box)return;box.textContent='';
  if(st.style)box.appendChild(h('p',{class:'hint',text:tx('mapviz.style.about.'+st.style)}));
  if(st.style==='painted'){var q=h('input',{type:'checkbox',title:tx('mapviz.style.quickT'),onchange:function(){st.quick=!!q.checked}});q.checked=!!st.quick;
   box.appendChild(h('label',{class:'f'},[q,h('span',{text:' '+tx('mapviz.style.quick')})]))}
  if(st.style==='recon'){var c=cur(),b=c&&c.item&&c.item.side&&c.item.side.base;
   if(b&&typeof b.from==='string'){var rk='mapviz.style.from.'+b.from,rw=tx(rk);box.appendChild(h('p',{class:'hint',text:tx('mapviz.style.madeFrom',{rung:rw===rk?b.from:rw})}));
    if(b.approx)box.appendChild(h('p',{class:'hint',text:tx('mapviz.style.approx')}))}}}
 function status(){var p=el.status;if(!p)return;p.textContent='';var k=null,a={},btn=null,c=cur(),nm=st.style?nameOf(st.style):'';
  if(st.note){k='mapviz.style.refused';a={name:nameOf(st.note)}}
  else if(!st.list){k=st.listErr?'mapviz.style.failed':st.listQuiet?null:'mapviz.style.readingStyles';a={msg:st.listErr||''}}
  else if(!anyBuilt())k='mapviz.style.noPaint';
  else if(!st.on)k='mapviz.style.off';
  else if(!V.q('map'))k='mapviz.style.noMap';
  else if(c&&c.mk){var rt=runText(c.need&&c.need.what,c.quickAt?{size:c.quickAt}:c.need&&c.need.args);k=c.quickAt?'mapviz.style.quickMaking':'mapviz.style.making';a={job:rt||nm}}
  else if(c&&c.need&&runText(c.need.what,c.need.args)){k='mapviz.style.making';a={job:runText(c.need.what,c.need.args)}}
  else if(!c||c.busy)k='mapviz.style.reading';
  else if(c.quiet)k=null;
  else if(c.item){var sd=c.item.side||{};k=sd.w>0&&sd.h>0?'mapviz.style.shown':'mapviz.style.shownName';a={name:nm,w:sd.w,h:sd.h}}
  else if(c.need){if(c.err){k='mapviz.style.failed';a={msg:c.err}}else{k='mapviz.style.notMade';a={name:nm}}btn=h('button',{type:'button',text:tx('mapviz.style.make'),title:tx('mapviz.style.makeT'),onclick:function(){make(cur())}})}
  else if(c.nb){k='mapviz.style.itemNotBuilt';a={name:nm}}
  else if(c.na)k='mapviz.style.notAvail';
  else if(c.err){k='mapviz.style.failed';a={msg:c.err}}
  if(k)p.textContent=tx(k,a);if(btn){p.appendChild(h('span',{text:' '}));p.appendChild(btn)}}
 function draw(){drawSwitch();drawPick();if(SZ)SZ.ctl.sync(st.size);else if(el.size)el.size.value=String(st.size);drawOpts();status()}
 V.addPanel({id:'style',side:'right',build:function(box){var tp=tx('mapviz.style.pick'),ts=tx('mapviz.style.size'),KIT=EXT_SCREENS.mapviz.sizeKit;
  el.sw=h('input',{type:'checkbox',title:tx('mapviz.style.switchT'),onchange:function(){setOn(!!el.sw.checked)}});
  el.swHint=h('span',{class:'hint'});
  el.pick=h('select',{onchange:function(){pick(el.pick.value)}});
  function lbl(n){return tx(n===DEF?'mapviz.style.sizeDefault':'mapviz.style.sizePx',{px:n})}
  // the pictures part's size kit (part order pictures before style): presets, a game use, custom; else the presets alone
  if(KIT&&typeof KIT.build==='function'){SZ={kit:KIT,ctl:KIT.build(V,{presets:SIZES,dflt:String(DEF),name:'mapviz.style.size',label:lbl,onchange:function(v){setSize(v.size==null?DEF:v.size)}})};el.size=SZ.ctl.sel}
  else{el.size=h('select',{onchange:function(){setSize(el.size.value)}});
   SIZES.forEach(function(n){el.size.appendChild(h('option',{value:String(n),text:lbl(n)}))})}
  el.opts=h('div',{blk:'mv.style.opts','data-blkname':tx('mapviz.style.blk.opts')});
  el.status=h('p',{blk:'mv.style.status',class:'hint',role:'status','aria-live':'polite','data-blkname':tx('mapviz.style.blk.status')});
  box.appendChild(h('div',{blk:'mv.style.title','data-blkname':tx('mapviz.style.title')},[h('h3',{text:tx('mapviz.style.title')})]));
  box.appendChild(h('div',{class:'fld',blk:'mv.style.switch','data-blkname':tx('mapviz.style.blk.switch')},[h('label',{class:'f'},[el.sw,h('span',{text:' '+tx('mapviz.style.switch')}),el.swHint])]));
  box.appendChild(h('div',{class:'fld',blk:'mv.style.pick','data-blkname':tx('mapviz.style.blk.pick')},[h('label',{class:'f'},[h('span',{class:'n',text:tp}),el.pick,h('span')]),
   SZ?SZ.ctl.el:h('label',{class:'f'},[h('span',{class:'n',text:ts}),el.size,h('span')])]));
  box.appendChild(el.opts);box.appendChild(el.status);draw()}});
 // ---- events ----
 // refresh, map and doc run after the pictures part's own handlers (part order pictures, export, style), so the picture
 // said again here is kept by it
 V.on('refresh',function(){st.live=true;dropFailed();loadStyles();reEmit();ask();draw()});
 // a 'map' event drops every entry whose key is not the current one (map, mode or context changed; key null: closed)
 V.on('map',function(d){var k=key();Object.keys(C).forEach(function(x){if(x!==k&&!C[x].mk)delete C[x]});if(SZ&&d&&d.doc)SZ.ctl.refresh();loadStyles();reEmit();ask();draw()});
 V.on('doc',function(){if(SZ)SZ.ctl.refresh();reEmit();ask();draw()});
 // a page job ended or the cache answer changed: a "not made" or failed entry asks once again (not one whose own job runs)
 V.on('products',function(){Object.keys(C).forEach(function(x){var c=C[x];if(c&&!c.mk&&!c.busy&&(c.need||c.na||c.quiet||c.err)&&!(c.need&&runText(c.need.what,c.need.args)))delete C[x]});ask();draw()});
 V.on('job',function(){status()});
 // the pictures part showed another base: a base that is not a built style turns the switch off; a style base turns it
 // on with that style (and its size when it is one of ours). No emit back
 V.on('picture',function(d){if(!d||d.from==='style')return;var b=d.base;
  if(b!=null&&known(b)&&built(b)){st.on=true;st.style=b;st.emKey=ctx();if(okSize(Number(d.size)))st.size=Number(d.size);ask()}else{st.on=false;st.emKey=null}draw()});
 V.on('theme',function(){draw()});
}});
})();
`;
