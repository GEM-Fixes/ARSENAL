// Map Viewer map checks list (MV-PG3, builder PG3b; page-pg3 freeze draft section 5, 6 and 11):
// one GET checks per target, game folder, mod, map, mode and phase (held while the shell reads the map document) gives
// the water checks, the strong checks and the fairness checks of the four unit kinds. The panel lists one row per known
// code in a fixed order with its state (found, passed, not run, running, skipped) and, when opened, one row per item with
// a Show button. The layer 'checks.map' (group checks, off by default) rings the strong and fairness items; water items
// are listed here but drawn only by the water part's own layer. A source that is not made shows a Make button that posts
// its need as given (V.job(need.what, need.args)), once while its job runs; "Make all" posts every need. A refresh never
// starts a job. The same code runs for AS64, MoW:AS2 and GoH: the picture rows name the pictures each game expects from
// the data (GoH: header in place of the small preview), flag zone checks come from the product, never from a game branch.
// Until the shell gives V.go, a row shows the place in metres in place of the Show button; until the shell adds phase,
// V.q('phase') undefined is read as null.
// Author: Imperator_Aug (ARSENAL, ia-8f52968a)
module.exports = String.raw`
(function(){
var MV=EXT_SCREENS.mapviz;if(!MV||!MV.parts)return;
var UPM=20,HITPX=8,ROWMAX=200;
var CAT=[['fair','FAIR_FLAG'],['strong','REACH_UNEQUAL'],['strong','SPAWN_IN_DANGER'],['strong','FLAG_IN_DANGER'],['strong','SPAWN_IN_BINOC'],
 ['strong','FLAG_IN_BINOC'],['strong','SPAWN_SEEN'],['strong','FLAG_ZONE_WATER'],['strong','FLAG_ZONE_BLOCKED'],['strong','FLAG_UNREACHABLE'],
 ['strong','DROWN_NEAR_REACH'],['strong','OBJECT_OUTSIDE'],['strong','MINIMAP_SPAN'],['strong','PICTURE_MISSING'],['strong','PICTURE_REFUSED'],
 ['strong','PICTURE_SHADOWED'],['water','BLOCKED_NOT_DEADLY'],['water','WET_LOOK_DRY_PLAY'],['water','SWAMP'],['water','PAINTED_ABOVE_LEVEL']];
var PICS=['minimap','preview','preview_small','header','header_interface'];
var UNITS=['inf','mg','at','tank'],SIDES=['a','b'];
var NOTES=['STRONG_PREVIEWS_ABSENT','STRONG_INPUT_COMPUTED','STRONG_DEGRADED'];
// ---- pure helpers (EXT_SCREENS.mapviz.checksKit, for tests) ----
function known(c){for(var i=0;i<CAT.length;i++)if(CAT[i][1]===c)return CAT[i][0];return null}
function hasNote(ans,code){var n=ans&&ans.notes;if(!Array.isArray(n))return false;for(var i=0;i<n.length;i++)if(n[i]&&n[i].code===code)return true;return false}
// rows(ans, run(source) -> bool) -> [{code, src, state, items:[i]}]: one row per catalogue code in order, then 'other'
// for item codes outside the catalogue (only when there is one). state found (items), passed (every source of the code
// made, no item; PICTURE_REFUSED also needs strong notes: true or a fair source made), skipped (PICTURE_REFUSED with note STRONG_PREVIEWS_ABSENT), running (a source in need whose job runs),
// notRun (a source in need, or no source of it in the answer)
function rows(ans,run){var out=[],its=ans&&Array.isArray(ans.items)?ans.items:[],srcs=ans&&Array.isArray(ans.sources)?ans.sources:[],k,i;
 for(k=0;k<CAT.length;k++){var c=CAT[k][1],s=CAT[k][0],idx=[];for(i=0;i<its.length;i++)if(its[i]&&its[i].code===c)idx.push(i);
  var mine=srcs.filter(function(x){return x&&x.src===s}),made=mine.length>0&&mine.every(function(x){return x.state==='made'}),st,judge=true,wait=mine;
  // PICTURE_REFUSED can be judged only when its skip note can be known: strong.checks.json carries notes, or a fair source is made
  if(c==='PICTURE_REFUSED'&&made){judge=mine.some(function(x){return x.notes===true})||srcs.some(function(x){return x&&x.src==='fair'&&x.state==='made'});
   if(!judge)wait=srcs.filter(function(x){return x&&x.src==='fair'})}
  if(idx.length)st='found';else if(made&&c==='PICTURE_REFUSED'&&hasNote(ans,'STRONG_PREVIEWS_ABSENT'))st='skipped';else if(made&&judge)st='passed';
  else if(wait.some(function(x){return x.state!=='made'&&run&&run(x)}))st='running';else st='notRun';
  out.push({code:c,src:s,state:st,items:idx})}
 var other=[];for(i=0;i<its.length;i++)if(its[i]&&!known(its[i].code))other.push(i);
 if(other.length)out.push({code:'other',src:null,state:'found',items:other});
 return out}
function sum(rs){var o={found:0,passed:0,notRun:0,skipped:0};rs.forEach(function(r){if(r.state==='found')o.found++;else if(r.state==='passed')o.passed++;else if(r.state==='skipped')o.skipped++;else o.notRun++});return o}
function fx(v,d){var s=Number(v).toFixed(d);return /^-0(\.0+)?$/.test(s)?s.slice(1):s}
function n2(v){if(typeof v!=='number'||!isFinite(v))return String(v);var r=Math.round(v*100)/100;return String(r)}
function word(k,fb){var s=tx(k);return s===k?fb:s}
function codeWord(c){return known(c)?tx('mapviz.checks.code.'+c):tx('mapviz.checks.code.other')}
function picWord(f){return PICS.indexOf(String(f))>=0?tx('mapviz.checks.pic.'+f):tx('mapviz.checks.pic.other')}
function unitWord(u){return UNITS.indexOf(u)>=0?tx('mapviz.shell.kind.'+u):String(u)}
function sideWord(s){return SIDES.indexOf(s)>=0?tx('mapviz.shell.side.'+s):String(s)}
function clsWord(c){return word('mapviz.water.cls.'+c,String(c).replace(/_/g,' '))}
// itemWords(it) -> the words of one item, built from its fields (never a path: a file field shows as picture words)
function itemWords(it){var p=[];if(!it)return '';
 if(it.side!=null)p.push(sideWord(it.side));if(it.unit!=null)p.push(unitWord(it.unit));
 if(it.flag!=null)p.push(tx('mapviz.checks.f.flag',{v:String(it.flag)}));
 if(it.value!=null&&it.limit!=null)p.push(tx('mapviz.checks.f.limit',{v:n2(it.value),l:n2(it.limit)}));else if(it.value!=null)p.push(tx('mapviz.checks.f.value',{v:n2(it.value)}));
 if(it.file!=null)p.push(picWord(it.file));
 if(it.cls!=null)p.push(clsWord(it.cls));
 if(typeof it.area==='number'&&isFinite(it.area))p.push(tx('mapviz.checks.f.area',{a:Math.round(it.area)}));
 return p.length?p.join(', '):codeWord(it.code)}
function placed(it){return !!it&&typeof it.x==='number'&&typeof it.y==='number'&&isFinite(it.x)&&isFinite(it.y)}
function at(it){return tx('mapviz.checks.f.at',{x:fx(it.x/UPM,1),y:fx(it.y/UPM,1)})}
// fits(job args, need args): every key field the need names is the job's (map only when the job has one)
function fits(ja,na){ja=ja||{};for(var k in na||{}){if(!Object.prototype.hasOwnProperty.call(na,k)||na[k]==null)continue;var v=ja[k];
  if(k==='map'){if(v!=null&&String(v)!==String(na[k]))return false;continue}if(v==null||String(v)!==String(na[k]))return false}return true}
function errText(e){if(e&&e.key&&/^mapviz\./.test(e.key))return tx(e.key,{msg:(e.params&&e.params.msg)||e.message||''});return String(e&&(e.text||e.message)||e)}
MV.checksKit={rows:rows,sum:sum,itemWords:itemWords,codeWord:codeWord,picWord:picWord,fits:fits,CAT:CAT,PICS:PICS};
// ---- the part ----
MV.parts.push({id:'checks',init:function(V){
 if(!V||V.q('rmt'))return;
 var K=MV.kit||null,el={},st={key:null,ans:null,err:null,busy:false,seq:0,stale:0,quiet:false,open:{},posting:{},jobErr:null,pick:null};
 function css(hx){return K&&K.colourCss?K.colourCss(hx):''}
 function phase(){var p=V.q('phase');return typeof p==='number'&&isFinite(p)?p:null}
 function keyNow(){return [V.q('target')||'',V.q('game')||'',V.q('mod')||'',V.q('map')||'',V.q('mode')||'',phase()==null?'':phase()].join('|')}
 function relist(){if(typeof V.relist==='function')V.relist()}
 // ---- reading ----
 function args(){var a={target:V.q('target'),game:V.q('game'),modDir:V.q('mod'),map:V.q('map'),mode:V.q('mode'),side:V.q('side'),kind:V.q('kind')},p=phase();if(p!=null)a.phase=p;
  for(var k in a)if(a[k]==null)delete a[k];return a}
 function sound(a){return !!a&&a.kind==='checks'&&Array.isArray(a.sources)&&Array.isArray(a.items)}
 function settle(){for(var k in st.posting)if(st.posting[k]==='done')delete st.posting[k]}
 function clear(){settle();st.seq++;st.key=null;st.ans=null;st.err=null;st.busy=false;st.stale=0;st.quiet=false;st.open={};st.pick=null;st.jobErr=null}
 // ask(force): one GET per key; nothing while there is no map or the document is being read
 function ask(force){if(!V.q('target')||!V.q('map')){clear();draw();return}if(V.q('docBusy'))return;var k=keyNow();
  if(!force&&st.key===k&&(st.ans||st.busy||st.err||st.quiet))return;
  if(st.key!==k){st.ans=null;st.open={};st.pick=null}st.key=k;st.err=null;st.busy=true;st.quiet=false;st.jobErr=null;var my=++st.seq;draw();
  var p;try{p=V.api('GET','checks',args())}catch(e){p=Promise.reject(e)}
  p.then(function(a){if(my!==st.seq)return;st.busy=false;st.stale=0;settle();
    if(!sound(a)){st.err={key:'mapviz.err.MV_FAULT',params:{msg:tx('mapviz.checks.na')}};draw();return}
    st.ans=a;draw();relist();V.redraw()},
   function(e){if(my!==st.seq)return;st.busy=false;
    if(e&&e.stale){if(st.stale<1){st.stale++;st.key=null;ask(true);return}st.stale=0;st.quiet=true;settle();draw();return}
    settle();st.err=e||{};draw()})}
 // ---- jobs ----
 function needKey(n){return String(n.what)+'|'+JSON.stringify(n.args||{})}
 function runText(n){var js=V.q('jobs'),t=V.q('target'),m=V.q('map');if(!n||!Array.isArray(js))return null;
  for(var i=0;i<js.length;i++){var j=js[i];if(j&&!j.end&&j.what===n.what&&j.target===t&&(!j.map||j.map===m)&&fits(j.args,n.args))return j.text||String(n.what)}return null}
 function running(s){return !!(s&&s.need&&(st.posting[needKey(s.need)]||runText(s.need)))}
 function clean(a){var o={};for(var k in a||{})if(Object.prototype.hasOwnProperty.call(a,k)&&a[k]!=null)o[k]=a[k];return o}
 function make(n){if(!n||!n.what)return;var nk=needKey(n);if(st.posting[nk]||runText(n))return;st.posting[nk]=true;st.jobErr=null;draw();var my=st.key;
  var p;try{p=V.job(n.what,clean(n.args))}catch(e){p=Promise.reject(e)}
  // a job that ends asks again even while another GET runs (ask drops the older answer); its posting mark stays 'done'
  // until that answer lands, so the Make button does not come back in between
  p.then(function(){if(my!==st.key){delete st.posting[nk];return}st.posting[nk]='done';ask(true)},function(e){delete st.posting[nk];if(my!==st.key)return;st.jobErr=errText(e);draw()})}
 function needs(){var a=st.ans;if(!a)return [];return a.sources.filter(function(s){return s&&s.state!=='made'&&s.need&&s.need.what})}
 function srcWord(s){if(s.src==='fair')return tx('mapviz.checks.src.fair',{unit:unitWord(s.unit)});return tx(s.src==='water'?'mapviz.checks.src.water':'mapviz.checks.src.strong')}
 // ---- the panel ----
 function draw(){drawStatus();drawList()}
 function drawStatus(){var b=el.status;if(!b)return;b.textContent='';var line=function(t,c){b.appendChild(h('p',{class:c||'hint',text:t}))};
  if(!V.q('map')){line(tx('mapviz.checks.noMap'));return}
  if(st.err){line(errText(st.err),'err');b.appendChild(h('button',{type:'button',text:tx('mapviz.checks.retry'),onclick:function(){ask(true)}}));return}
  if(st.busy&&!st.ans){line(tx('mapviz.checks.loading'));return}
  if(!st.ans)return;
  var s=sum(rows(st.ans,running));line(tx(s.skipped?'mapviz.checks.summarySkip':'mapviz.checks.summary',s),'');
  var ph=st.ans.phase,phs=V.q('phases');if(typeof ph==='number'&&isFinite(ph))line(tx('mapviz.checks.phase',{n:ph}));else if(Array.isArray(phs)&&phs.length)line(tx('mapviz.checks.phase0'));
  (st.ans.notes||[]).forEach(function(n){if(n&&NOTES.indexOf(n.code)>=0)line(tx('mapviz.checks.note.'+n.code))});
  var ns=needs(),free=0;
  ns.forEach(function(s){var rt=runText(s.need);if(rt||st.posting[needKey(s.need)]){line(tx('mapviz.checks.running',{job:rt||srcWord(s)}));return}free++;
   b.appendChild(h('button',{type:'button',text:tx('mapviz.checks.make',{what:srcWord(s)}),title:tx('mapviz.checks.makeT'),onclick:function(){make(s.need)}}));b.appendChild(h('span',{text:' '}))});
  if(free>1)b.appendChild(h('button',{type:'button',text:tx('mapviz.checks.makeAll'),title:tx('mapviz.checks.makeT'),onclick:function(){makeAll()}}));
  if(st.jobErr)line(st.jobErr,'err')}
 function makeAll(){needs().slice(0,6).forEach(function(s){make(s.need)})}
 function bid(c){return String(c).toLowerCase().replace(/[^a-z0-9.]+/g,'-')}
 function stateWord(r){return r.state==='found'?tx('mapviz.checks.state.found',{n:r.items.length}):tx('mapviz.checks.state.'+r.state)}
 function drawList(){var b=el.list;if(!b)return;b.textContent='';if(!st.ans||!V.q('map'))return;var its=st.ans.items,n=0;
  rows(st.ans,running).forEach(function(r){var cw=codeWord(r.code),op=!!st.open[r.code]&&r.items.length>0,t=cw+': '+stateWord(r);
   var kids=r.items.length?[h('button',{type:'button',class:'link','aria-expanded':op?'true':'false',text:t,onclick:function(){st.open[r.code]=!st.open[r.code];drawList()}})]:[h('span',{text:t})];
   b.appendChild(h('div',{blk:'mv.checks.code.'+bid(r.code),'data-blkname':cw,class:r.state==='found'?'':'hint'},kids));
   if(!op)return;
   var show1=r.items.slice(0,ROWMAX);if(st.pick!=null&&r.items.indexOf(st.pick)>=ROWMAX)show1.push(st.pick);
   show1.forEach(function(i){var it=its[i],kk=[h('span',{text:itemWords(it)+' '})];n++;
    if(placed(it)){if(typeof V.go==='function')kk.push(h('button',{type:'button',text:tx('mapviz.checks.show'),title:tx('mapviz.checks.showT'),onclick:function(){show(it)}}));else kk.push(h('span',{class:'hint',text:at(it)}))}
    b.appendChild(h('div',{blk:'mv.checks.item.'+i,'data-blkname':tx('mapviz.checks.blk.item'),'aria-current':st.pick===i?'true':null},kk))});
   if(r.items.length>show1.length)b.appendChild(h('div',{blk:'mv.checks.more.'+bid(r.code),'data-blkname':tx('mapviz.checks.blk.list'),class:'hint'},[h('span',{text:tx('mapviz.checks.more',{n:r.items.length-show1.length})})]))})}
 function show(it){if(typeof V.go!=='function'||!placed(it))return;var o={x:it.x,y:it.y};if(Array.isArray(it.box)&&it.box.length===4)o.box=it.box.slice();try{V.go(o)}catch(e){}}
 V.addPanel({id:'checks',side:'right',build:function(box){
  el.status=h('div',{blk:'mv.checks.status',role:'status','aria-live':'polite','data-blkname':tx('mapviz.checks.blk.status')});
  el.list=h('div',{blk:'mv.checks.list',box:'col','data-blkname':tx('mapviz.checks.blk.list')});
  box.appendChild(h('div',{blk:'mv.checks.title','data-blkname':tx('mapviz.checks.title')},[h('h3',{text:tx('mapviz.checks.title')})]));
  box.appendChild(el.status);box.appendChild(el.list);draw()}});
 // ---- the layer: strong and fairness items with a place (water items stay with the water part's layer) ----
 function drawn(){var a=st.ans,out=[];if(!a||!V.q('map'))return out;a.items.forEach(function(it,i){if(it&&(it.src==='strong'||it.src==='fair')&&placed(it))out.push(i)});return out}
 function palAt(p){var v=V.pal;String(p).split('.').forEach(function(k){v=v&&typeof v==='object'?v[k]:undefined});return v===undefined?null:v}
 // colours: palette checks {mark, ring, halo}; until it has them, water.check (fill, hatch colour) and marks.halo
 function colours(){var c=palAt('checks'),w=palAt('water.check');var m=c&&c.mark||w&&w.fill||null,r=c&&c.ring||w&&w.hatch&&w.hatch.color||m,hl=c&&c.halo||palAt('marks.halo')||null;return m?{mark:m,ring:r,halo:hl}:null}
 function drawMarks(ctx,view){var ids=drawn();if(!ids.length)return;var c=colours();if(!c)throw new Error(tx('mapviz.checks.na'));if(!ctx||!ctx.beginPath||!ctx.arc)return;
  ids.forEach(function(i){var it=st.ans.items[i],p=view.toScreen(it.x,it.y);
   if(c.halo){ctx.beginPath();ctx.arc(p[0],p[1],9,0,Math.PI*2);ctx.strokeStyle=css(c.halo);ctx.lineWidth=4;ctx.stroke()}
   ctx.beginPath();ctx.arc(p[0],p[1],7,0,Math.PI*2);ctx.fillStyle=css(c.mark);ctx.fill();ctx.strokeStyle=css(c.ring);ctx.lineWidth=2;ctx.stroke();
   if(st.pick===i){ctx.beginPath();ctx.arc(p[0],p[1],12,0,Math.PI*2);ctx.strokeStyle=css(c.ring);ctx.lineWidth=2;ctx.stroke()}})}
 function listMarks(){return drawn().map(function(i){var it=st.ans.items[i];return {label:codeWord(it.code)+': '+itemWords(it),x:it.x,y:it.y}})}
 function hitMark(x,y){var z=V.view&&V.view.zoom>0?V.view.zoom:1,r=HITPX/z,best=null,bd=Infinity;
  drawn().forEach(function(i){var it=st.ans.items[i],dx=it.x-x,dy=it.y-y,d=Math.sqrt(dx*dx+dy*dy);if(d<=r&&d<bd){bd=d;best=i}});
  if(best==null)return null;var it=st.ans.items[best];return {part:'checks',i:best,label:codeWord(it.code),value:itemWords(it)}}
 V.addLayer({id:'checks.map',group:'checks',label:'mapviz.checks.layer',engineTrue:false,defaultOn:false,draw:drawMarks,list:listMarks,hit:hitMark,
  legend:function(){var c=colours();return c?[{color:c.mark,label:'mapviz.checks.legend'}]:null}});
 // ---- events ----
 V.on('map',function(){if(!V.q('map')){clear();draw();relist();return}if(st.key!==keyNow()){st.ans=null;st.open={};st.pick=null}ask(false);draw()});
 V.on('doc',function(){ask(false)});
 V.on('refresh',function(){ask(false)});
 // a page job ended or the cache answer changed: an answer with a source not made (and not being made) asks again once
 V.on('products',function(){if(!V.q('map')||V.q('docBusy'))return;if(st.err&&!st.busy){ask(true);return}
  if(st.ans&&!st.busy&&needs().some(function(s){return !running(s)}))ask(true)});
 V.on('job',function(){drawStatus();drawList()});
 V.on('cursor',function(d){if(!d||!d.click||!d.hit||d.hit.part!=='checks'||typeof d.hit.i!=='number'||!st.ans)return;var it=st.ans.items[d.hit.i];if(!it)return;
  st.open[known(it.code)?it.code:'other']=true;st.pick=d.hit.i;drawList();V.redraw()});
 V.on('theme',function(){V.redraw()});
}});
})();
`;
