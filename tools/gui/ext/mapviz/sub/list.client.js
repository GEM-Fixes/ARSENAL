// Map Viewer map list (MV-PG1): the map picker of the page's game and mod. One line per map (the name without its multi/ or
// single/ folder, the full key as title and for search, a quiet "mod" tag), multiplayer folded by player size read from the
// name (1v1, 2v2, 3x3 ..., then the names with no size), single player and other maps; the last 5 picked maps first; rows drawn
// in chunks (100, more as the list scrolls, or "Show the rest"); arrows move from the search box through the rows; the open
// map's modes as compact buttons. Choosing a map or a mode asks the shell with V.emit('map', {key, mode?, pick: true}); the
// shell takes that request and answers with its own map event {key, mode, side, kind, doc, user}.
// Works in the shell's map popover (the 'picker' event {open}: the open map is shown and scrolled to on open) and in the
// left column (no 'picker' event: the same list, nothing scrolls by itself).
// A refresh only reads (GET maps); the maps job runs when the user presses the refresh button or the read button. While a
// maps job runs its words show in the status; when a page job ends, a list that was not made asks again once.
// Author: Imperator_Aug (ARSENAL, ia-24eba1fb)
module.exports = String.raw`
(function(){
if(!EXT_SCREENS.mapviz||!EXT_SCREENS.mapviz.parts)return;
EXT_SCREENS.mapviz.parts.push({id:'list',init:function(V){
 var st={maps:null,sig:null,busy:false,need:false,run:false,q:'',key:null,mode:null,seq:0,fold:{},pop:false},el={},LIM=100,dwant=false,IX=null,io=null;
 // the draw cursor: plan = fold heads and rows in order, suf[i] = rows at or after i, i = next op, ul = the open fold drawn last
 var R={plan:[],suf:[0],i:0,ul:null,rows:0,n:0};
 var RK='maps.viewer.recent',RMAX=5,CMAX=20;
 var ROW='display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;text-align:left;background:none;border:0;border-radius:3px;padding:2px 6px;margin:0;font:inherit;color:inherit;cursor:pointer;min-height:24px';
 var NAME='flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
 var CHIP='font:inherit;padding:1px 8px;margin:2px 4px 2px 0;cursor:pointer';
 function cur(){var c=V.token('hit');return ';font-weight:bold'+(c?';background:'+c:'')}
 // fast typing: one draw in the next frame for many keys (window.requestAnimationFrame, else a timer)
 function frame(f){var w=typeof window==='object'&&window;if(w&&typeof w.requestAnimationFrame==='function')w.requestAnimationFrame(f);else setTimeout(f,0)}
 function drawSoon(){if(dwant)return;dwant=true;frame(function(){dwant=false;draw()})}
 function setQ(v){st.q=String(v||'').trim().toLowerCase()}
 function own(o,k){return Object.prototype.hasOwnProperty.call(o,k)}
 // the folder prefix (multi/, single/) is left out of the shown name; other keys show whole
 function shortOf(k){var m=/^(multi|single)\/(.+)$/i.exec(k);return m?{pre:m[1]+'/',name:m[2]}:{pre:'',name:k}}
 // the player size in a name: 1v1, 2vs2, 3x3_, town_4v4 -> {id:'4v4', n, a}; none -> null
 function sizeOf(s){var m=/(?:^|[^0-9])([0-9]{1,2}) ?(?:vs|v|x) ?([0-9]{1,2})(?![0-9])/i.exec(String(s||''));if(!m)return null;var a=+m[1],b=+m[2];if(!a||!b)return null;return {id:a+'v'+b,n:a+b,a:a}}
 function groupOf(m){var g=String(m.group||m.key||'');return /^multi(\/|$)/.test(g)?'multi':/^single(\/|$)/.test(g)?'single':'other'}
 // the list index (made once per list load): one item per map, with its lower-case texts made once. a = the searchKit index
 // (multiplayer first, then single player, then other), by = key -> item, lo = lower key -> item, d = display order (group, name)
 function items(){if(IX&&IX.m===st.maps)return IX.a;var a=[],by={},lo={};(st.maps||[]).forEach(function(m){if(!m||typeof m.key!=='string'||!m.key||own(by,m.key))return;var g=groupOf(m),s=shortOf(m.key),l=m.key.toLowerCase();
   var it={group:tx('mapviz.list.g.'+g),label:m.key,value:m.key,hint:m.mod?tx('mapviz.list.mod'):'',map:m,g:g,pre:s.pre,name:s.name,nlo:s.name.toLowerCase(),lo:l,lo2:l.replace(/[_\-]+/g,' '),size:g==='multi'?sizeOf(s.name):null,o:g==='multi'?0:g==='single'?1:2};
   a.push(it);by[m.key]=it;if(!own(lo,l))lo[l]=it});
  var d=a.slice();a.sort(function(x,y){return x.o-y.o||(x.label<y.label?-1:x.label>y.label?1:0)});d.sort(function(x,y){return x.o-y.o||(x.nlo<y.nlo?-1:x.nlo>y.nlo?1:x.label<y.label?-1:x.label>y.label?1:0)});
  // size folds when the whole list (not a search) has two sizes or more, so a search never changes the fold names
  var sz={},nz=0;a.forEach(function(it){if(it.g!=='multi')return;var k=it.size?it.size.id:'none';if(!own(sz,k)){sz[k]=1;nz++}});
  IX={m:st.maps,a:a,by:by,lo:lo,d:d,split:nz>1};return a}
 function match(it,q){return !q||it.lo.indexOf(q)>=0||it.lo2.indexOf(q)>=0}
 function hits(a,q,done){q=String(q||'').trim().toLowerCase();var f=[],l=[],n=0;
  for(var i=0;i<a.length;i++){var p=a[i].lo.indexOf(q);if(p<0)continue;n++;if(p===0){if(f.length<40)f.push(a[i])}else if(l.length<40)l.push(a[i])}
  var o=f.concat(l).slice(0,40);done(o,n-o.length)}
 function byKey(k){items();k=String(k||'').toLowerCase();var it=IX&&own(IX.lo,k)?IX.lo[k]:null;return it?it.map:null}
 // a game path from the picker (map/multi/m1/...) -> the key of the listed map it is in or under (multi/m1), else the path after map/
 function keyOfPath(p){p=String(p||'').split(String.fromCharCode(92)).join('/').replace(/^resource\//i,'').replace(/^map\//i,'').replace(/\/+$/,'');
  var lp=p.toLowerCase(),best='';(st.maps||[]).forEach(function(m){var k=m&&typeof m.key==='string'?m.key.toLowerCase():'';if(k&&(lp===k||lp.indexOf(k+'/')===0)&&k.length>best.length)best=m.key});
  return best||(p.toLowerCase()==='map'?'':p)}
 function sig(){return [V.q('target')||'',V.q('game')||'',V.q('mod')||''].join('|')}
 function errText(e){if(e&&e.key&&/^mapviz\./.test(e.key))return tx(e.key,{msg:(e.params&&e.params.msg)||e.message||''});return String(e&&(e.text||e.message)||e)}
 function needOf(e){var p=e&&(e.params||(e.reply&&e.reply.params));return e&&e.status===404&&p&&p.need&&p.need.what?p.need:null}
 function status(k,a,extra){if(!el.status)return;el.status.textContent=k?tx(k,a||{}):'';(extra||[]).forEach(function(x){if(!x)return;el.status.appendChild(h('span',{text:' '}));el.status.appendChild(typeof x==='string'?h('span',{text:x}):x)})}
 // a failed read or job: the words, then the next step (no game folder: where to set it; else: the refresh button)
 function fault(e){status('mapviz.list.fault',{msg:errText(e)},[tx(V.q('game')?'mapviz.list.retry':'mapviz.list.noGame')])}
 // ---- recent maps: LS as2gui.maps.viewer.recent = {'target|game|mod': [key, ...]}, the newest first, 5 per context, 20 contexts
 function lsGet(k){try{return typeof LS!=='undefined'&&LS&&LS.get?LS.get(k,null):null}catch(e){return null}}
 function lsSet(k,v){try{if(typeof LS!=='undefined'&&LS&&LS.set)LS.set(k,v)}catch(e){}}
 function recAll(){var o=lsGet(RK);return o&&typeof o==='object'&&!Array.isArray(o)?o:{}}
 function recOf(){var a=recAll()[sig()],seen={};return Array.isArray(a)?a.filter(function(k){if(typeof k!=='string'||!k||own(seen,k))return false;seen[k]=1;return true}).slice(0,RMAX):[]}
 function recPut(a){var o=recAll(),s=sig(),out={},ks=Object.keys(o).filter(function(k){return k!==s&&Array.isArray(o[k])});ks=ks.slice(Math.max(0,ks.length-(CMAX-1)));
  ks.forEach(function(k){out[k]=o[k]});if(a.length)out[s]=a.slice(0,RMAX);lsSet(RK,out)}
 function recAdd(k){var a=recOf();if(a[0]===k)return false;recPut([k].concat(a.filter(function(x){return x!==k})));return true}
 V.addPanel({id:'list',side:'left',build:function(box){
  el.search=h('input',{type:'search',autocomplete:'off',style:'width:100%','aria-label':tx('mapviz.list.search'),oninput:function(){setQ(el.search.value);drawSoon()}});
  // searchKit (page.js; owner 2026-11-19: every search box has Browse, History and an index): history 'mapviz.listSearch', index = the
  // map keys of the list, beside: the list under the box is the index view (typing filters it; arrows and Enter go to it), Browse =
  // the map folders in the game's data (map/, the mod on top), a picked folder gives the key of the listed map it is in; a pick
  // shows that map and opens it. Absent in a harness without the kit: the plain box
  var kit=typeof searchKit==='function'?searchKit(el.search,{key:'mapviz.listSearch',beside:true,index:function(q,done){hits(items(),q,done)},
   browse:{mode:'dir',view:'data',start:'map',toValue:function(p){return keyOfPath(p)}},
   onPick:function(v,it){el.search.value=v;setQ(v);draw();var m=it&&it.map||byKey(v);if(m)pick(m.key)}}):null;
  // after the kit's own key handler: a key the kit used carries e._sk. Down = the first row; Enter with text = open the best match
  el.search.addEventListener('keydown',function(e){if(e._sk)return;var k=e.key;
   if(k==='ArrowDown'){var r=rowsNow();if(r.length){if(e.preventDefault)e.preventDefault();focusRow(r[0])}}
   else if(k==='Enter'&&st.q){var b=best();if(b){if(e.preventDefault)e.preventDefault();pick(b.map.key)}}});
  var t=tx('mapviz.list.search');
  el.status=h('p',{blk:'mv.list.status',class:'hint',role:'status','aria-live':'polite','data-blkname':tx('mapviz.list.blk.status')});
  el.reload=h('button',{type:'button',text:String.fromCharCode(8635),'aria-label':tx('mapviz.list.reload'),title:tx('mapviz.list.reloadT'),style:'font:inherit;padding:1px 8px',onclick:function(){run()}});
  el.modes=h('div',{blk:'mv.list.modes',role:'group','aria-label':tx('mapviz.list.modes'),hidden:true,'data-blkname':tx('mapviz.list.modes')});
  el.recent=h('div',{blk:'mv.list.recent',hidden:true,'data-blkname':tx('mapviz.list.blk.recent')});
  el.maps=h('div',{blk:'mv.list.maps','data-blkname':tx('mapviz.list.blk.maps')});
  el.more=h('button',{type:'button',hidden:true,style:'font:inherit;width:100%',onclick:function(){more(Infinity)}});
  box.appendChild(h('div',{blk:'mv.list.title','data-blkname':tx('mapviz.list.title')},[h('h3',{text:tx('mapviz.list.title')})]));
  box.appendChild(h('div',{blk:'mv.list.head',box:'row','data-blkname':tx('mapviz.list.blk.head')},[
   h('div',{class:'fld',blk:'mv.list.search',style:'flex:1 1 12em;width:auto','data-blkname':t},[h('label',{class:'f'},[h('span',{class:'n',text:t}),kit?kit.el:el.search,h('span')])]),
   h('div',{blk:'mv.list.bar',class:'row','data-blkname':tx('mapviz.list.blk.bar')},[el.reload])]));
  box.appendChild(el.status);box.appendChild(el.modes);box.appendChild(el.recent);box.appendChild(el.maps);
  box.appendChild(h('div',{blk:'mv.list.more','data-blkname':tx('mapviz.list.blk.more')},[el.more]));
  // Up and Down move between the rows (recent maps, then the list); Up on the first row goes back to the search box
  box.addEventListener('keydown',function(e){var b=e&&e.target,k=e&&e.key;if(!b||!b.getAttribute||b.getAttribute('data-mvrow')==null)return;
   if(k!=='ArrowDown'&&k!=='ArrowUp')return;if(e.preventDefault)e.preventDefault();step(b,k==='ArrowDown'?1:-1)})}});
 // ---- keys
 function inClosed(e,top){for(var n=e.parentNode;n&&n!==top;n=n.parentNode)if(n.tagName==='DETAILS'&&!n.open)return true;return false}
 function rowsIn(c){var out=[];if(!c||c.hidden)return out;var a=c.querySelectorAll('button[data-mvrow]');for(var i=0;i<a.length;i++)if(!inClosed(a[i],c))out.push(a[i]);return out}
 function rowsNow(){return rowsIn(el.recent).concat(rowsIn(el.maps))}
 function focusRow(b){try{b.focus()}catch(e){}try{if(b.scrollIntoView)b.scrollIntoView({block:'nearest'})}catch(e){}}
 function step(b,d){var r=rowsNow(),i=r.indexOf(b);if(i<0)return;
  if(d>0&&i===r.length-1&&R.suf[R.i]>0){more(LIM);r=rowsNow()}
  var t=r[i+d];if(t){focusRow(t);return}if(d<0&&el.search)try{el.search.focus()}catch(e){}}
 // Enter in the search box: the map whose name is the text, else the first whose name starts with it, else the first match
 function best(){var f=null,s=null,q=st.q;for(var i=0;i<R.plan.length;i++){var o=R.plan[i];if(o.k!=='row')continue;
   if(o.it.nlo===q||o.it.lo===q)return o.it;if(!s&&o.it.nlo.indexOf(q)===0)s=o.it;if(!f)f=o.it}return s||f}
 // the words of a page 'maps' job queued or running for the page's game, else null (V.q('jobs') may be absent)
 function runText(){var js=V.q('jobs'),t=V.q('target');if(!Array.isArray(js))return null;
  for(var i=0;i<js.length;i++){var j=js[i];if(j&&!j.end&&j.what==='maps'&&j.target===t)return j.text||'maps'}return null}
 function needView(){var rt=runText();if(rt){status('mapviz.list.making',{job:rt});return}
  status('mapviz.list.need',null,[h('button',{type:'button',text:tx('mapviz.list.read'),onclick:function(){run()}})])}
 // load(): another game, folder or mod drops the old list at once (W2), so a map of the old game is never offered
 // A read the shell held while the page was hidden and then dropped as stale (the context changed meanwhile) is no fault:
 // the list asks once more at once (again: true), and a second stale answer leaves no status, so the next refresh asks
 function load(again){if(!V.q('target')){st.maps=null;st.sig=sig();st.key=null;st.mode=null;status('mapviz.list.noTarget');draw();return}
  var my=++st.seq,g=sig();if(g!==st.sig){st.maps=null;st.fold={};draw()}st.sig=g;st.busy=true;st.need=false;status('mapviz.list.loading');
  V.api('GET','maps').then(function(r){if(my!==st.seq)return;st.busy=false;st.maps=r&&Array.isArray(r.maps)?r.maps:[];status('');draw();if(st.pop)showCurrent()},
   function(e){if(my!==st.seq)return;st.busy=false;st.maps=null;draw();
    if(e&&e.stale){if(again!==true)load(true);else status('');return}
    if(needOf(e)){st.need=true;needView()}
    else fault(e)})}
 function run(){if(!V.q('target')){status('mapviz.list.noTarget');return}var my=++st.seq;st.run=true;status('mapviz.list.loading');
  V.job('maps',{}).then(function(){st.run=false;if(my===st.seq)load()},function(e){st.run=false;if(my===st.seq)fault(e)})}
 // a pick (map or mode button) made from a list of an old context, before the shell took the change in, is dropped by
 // the shell; its refresh then asks the list of the new context, drawn here in place of the old one
 function pick(key,mode){var d={key:key,pick:true};if(mode!==undefined)d.mode=mode;V.emit('map',d)}
 function thumb(m){var ps=Array.isArray(m.pictures)?m.pictures:[];for(var i=0;i<ps.length;i++){var p=ps[i];
   if(p&&typeof p==='object'&&typeof p.png==='string'&&typeof Image==='function'){try{return h('img',{src:'data:image/png;base64,'+p.png,alt:'',width:'20',height:'20',loading:'lazy',style:'flex:0 0 auto'})}catch(e){}}}
  return null}
 // one row: [thumbnail] (the folder prefix, not shown: the button's text stays the full key) name [mod]; title = the full key
 function rowEl(it){var m=it.map,on=m.key===st.key,th=thumb(m),ps=Array.isArray(m.pictures)?m.pictures.filter(function(p){return typeof p==='string'}):[];
  var ti=m.key+(m.mod?'. '+tx('mapviz.list.modT'):'')+(ps.length?'. '+tx('mapviz.list.pictures',{list:ps.join(', ')}):'');
  var b=h('button',{type:'button','data-mvrow':'1','data-key':m.key,'aria-current':on?'true':null,title:ti,style:ROW+(on?cur():''),onclick:function(){pick(m.key)}},
   [th,it.pre?h('span',{hidden:true,text:it.pre}):null,h('span',{style:NAME,text:it.name}),m.mod?h('span',{class:'sk-tag',text:tx('mapviz.list.mod')}):null]);
  return h('li',{style:'list-style:none;margin:0;padding:0'},[b])}
 function markCurrent(){var rs=rowsAll();for(var i=0;i<rs.length;i++){var b=rs[i],on=b.getAttribute('data-key')===st.key;
   if(on)b.setAttribute('aria-current','true');else if(b.getAttribute('aria-current')!=null)b.removeAttribute('aria-current');b.setAttribute('style',ROW+(on?cur():''))}}
 function rowsAll(){var out=[];[el.recent,el.maps].forEach(function(c){if(!c)return;var a=c.querySelectorAll('button[data-mvrow]');for(var i=0;i<a.length;i++)out.push(a[i])});return out}
 function rowIn(c,k){var a=c?c.querySelectorAll('button[data-mvrow]'):[];for(var i=0;i<a.length;i++)if(a[i].getAttribute('data-key')===k)return a[i];return null}
 // ---- folds: multiplayer by size (one fold when every map has the same size or none), single player, other. Open by
 // default: multiplayer; single player and other only when the open map is there or nothing comes before them. A user's
 // fold choice holds for this list; a search opens every fold that has a match and hides the others
 function foldOf(it){return it.g!=='multi'?it.g:R.split?'multi.'+(it.size?it.size.id:'none'):'multi'}
 function isOpen(id,has){if(st.q)return true;if(own(st.fold,id))return st.fold[id];var ci=st.key&&IX&&own(IX.by,st.key)?IX.by[st.key]:null;
  if(/^multi/.test(id))return true;if(ci&&foldOf(ci)===id)return true;return id==='single'?!has.multi:!has.multi&&!has.single}
 function plan(){var q=st.q,G={multi:[],single:[],other:[]},P=[],has={};
  IX.d.forEach(function(it){if(match(it,q))G[it.g].push(it)});['multi','single','other'].forEach(function(g){has[g]=G[g].length>0});
  function fold(id,label,its){if(!its.length)return;var o=isOpen(id,has);P.push({k:'fold',id:id,label:label,its:its,open:o});if(o)its.forEach(function(it){P.push({k:'row',it:it})})}
  var S={},sl=[];G.multi.forEach(function(it){var id=it.size?it.size.id:'none';if(!own(S,id)){S[id]={id:id,size:it.size,its:[]};sl.push(S[id])}S[id].its.push(it)});
  sl.sort(function(x,y){if(!x.size||!y.size)return x.size?-1:y.size?1:0;return x.size.n-y.size.n||x.size.a-y.size.a});
  R.split=IX.split;
  if(R.split){if(G.multi.length)P.push({k:'head',n:G.multi.length});sl.forEach(function(s){fold('multi.'+s.id,s.size?s.id:tx('mapviz.list.g.nosize'),s.its)})}
  else fold('multi',tx('mapviz.list.g.multi'),G.multi);
  fold('single',tx('mapviz.list.g.single'),G.single);fold('other',tx('mapviz.list.g.other'),G.other);
  var suf=new Array(P.length+1);suf[P.length]=0;for(var i=P.length-1;i>=0;i--)suf[i]=suf[i+1]+(P[i].k==='row'?1:0);
  R.plan=P;R.suf=suf;R.i=0;R.ul=null;R.rows=0;R.n=G.multi.length+G.single.length+G.other.length}
 function foldEl(o){var ul=h('ul',{'aria-label':o.label,style:'list-style:none;margin:0 0 4px;padding:0'}),want=o.open,filled=o.open;
  var d=h('details',{open:o.open?true:null,'data-fold':o.id},[h('summary',{},[h('b',{text:o.label}),h('span',{class:'hint',text:' '+tx('mapviz.list.count',{n:o.its.length})})]),ul]);
  // a browser sends 'toggle' for the open state it was built with too: only a change from that is the user's
  d.addEventListener('toggle',function(){var on=!!d.open;if(on===want)return;want=on;if(!st.q)st.fold[o.id]=on;
   if(on&&!filled){filled=true;o.its.forEach(function(it){ul.appendChild(rowEl(it))})}});
  return {d:d,ul:ul}}
 // draw k more rows from the cursor (fold heads on the way); the "Show the rest" row counts what is left in open folds
 function more(k){var P=R.plan,done=0;if(!el.maps)return;
  while(R.i<P.length){if(done>=k&&R.suf[R.i]>0)break;var o=P[R.i++];
   if(o.k==='row'){if(R.ul){R.ul.appendChild(rowEl(o.it));R.rows++;done++}}
   else if(o.k==='head')el.maps.appendChild(h('div',{style:'margin:6px 0 2px'},[h('b',{text:tx('mapviz.list.g.multi')}),h('span',{class:'hint',text:' '+tx('mapviz.list.count',{n:o.n})})]));
   else{var f=foldEl(o);el.maps.appendChild(f.d);R.ul=o.open?f.ul:null}}
  var left=R.suf[R.i]||0;if(el.more){el.more.hidden=!left;el.more.textContent=left?tx('mapviz.list.rest',{n:left}):''}watch()}
 // more rows as the list scrolls: the "Show the rest" row is watched; seen (300 px ahead) -> 100 more, watched again
 function watch(){if(!el.more||el.more.hidden)return;var W=typeof window==='object'&&window,IO=W&&W.IntersectionObserver||(typeof IntersectionObserver==='function'?IntersectionObserver:null);
  if(typeof IO!=='function')return;
  if(!io){try{io=new IO(function(es){for(var i=0;i<es.length;i++)if(es[i]&&es[i].isIntersecting&&!el.more.hidden){more(LIM);return}},{rootMargin:'300px 0px'})}catch(e){io=null;return}}
  try{io.unobserve(el.more);io.observe(el.more)}catch(e){}}
 function draw(keep){if(!el.maps)return;var had=R.rows;el.maps.textContent='';R={plan:[],suf:[0],i:0,ul:null,rows:0,n:0};if(el.more){el.more.hidden=true;el.more.textContent=''}
  if(st.maps)items();drawRecent();drawModes();if(!st.maps)return;
  plan();
  if(!R.n){if(st.maps.length&&st.q)el.maps.appendChild(h('p',{class:'hint'},[h('span',{text:tx('mapviz.list.none')+' '}),h('button',{type:'button',text:tx('mapviz.list.clear'),onclick:clearQ})]));
   else el.maps.appendChild(h('p',{class:'hint',text:tx('mapviz.list.empty')}));return}
  more(keep?Math.max(LIM,had):LIM)}
 function clearQ(){if(el.search){el.search.value='';try{el.search.focus()}catch(e){}}setQ('');draw()}
 // the recent maps of this game and mod that are still in the list (one gone is dropped from LS, no word); hidden while
 // a search is typed
 function drawRecent(){var c=el.recent;if(!c)return;c.textContent='';c.hidden=true;if(!st.maps||st.q||!IX)return;
  var a=recOf(),ks=a.filter(function(k){return own(IX.by,k)});if(!st.busy&&ks.length!==a.length)recPut(ks);if(!ks.length)return;
  var ul=h('ul',{'aria-label':tx('mapviz.list.recent'),style:'list-style:none;margin:0 0 4px;padding:0'});ks.forEach(function(k){ul.appendChild(rowEl(IX.by[k]))});
  c.appendChild(h('b',{text:tx('mapviz.list.recent')}));c.appendChild(ul);c.hidden=false}
 // the open map's modes: compact buttons, shown only while a map is open
 function drawModes(){var c=el.modes;if(!c)return;c.textContent='';c.hidden=!st.key;if(!st.key)return;var it=IX&&own(IX.by,st.key)?IX.by[st.key]:null,m=it&&it.map;
  var ms=(m&&Array.isArray(m.modes)?m.modes:V.q('modes')||[]).filter(function(x){return typeof x==='string'&&x});
  c.appendChild(h('span',{class:'hint',text:tx('mapviz.list.modes')+' '}));
  if(!ms.length){c.appendChild(h('span',{class:'hint',text:tx('mapviz.list.noModes')}));return}
  ms.forEach(function(id){var on=id===st.mode;c.appendChild(h('button',{type:'button','aria-pressed':on?'true':'false',style:CHIP+(on?';font-weight:bold':''),text:id,onclick:function(){pick(st.key,id)}}))})}
 // the popover opened: the open map's fold opens (a fold the user closed too), its row is drawn and scrolled to
 function showCurrent(){if(!st.key||!el.maps||!st.maps)return;var it=items()&&own(IX.by,st.key)?IX.by[st.key]:null;if(!it||!match(it,st.q))return;
  var b=rowIn(el.maps,st.key);
  if(!b||inClosed(b,el.maps)){var f=foldOf(it);if(own(st.fold,f)&&!st.fold[f])delete st.fold[f];draw(true);b=rowIn(el.maps,st.key)}
  for(var g=0;!b&&R.suf[R.i]>0&&g<10000;g++){more(LIM);b=rowIn(el.maps,st.key)}
  if(b&&b.scrollIntoView)try{b.scrollIntoView({block:'center'})}catch(e){}}
 V.on('refresh',function(){if(st.run&&sig()===st.sig)return;if(!st.busy&&(sig()!==st.sig||!st.maps))load();else if(st.busy&&sig()!==st.sig)load()});
 // a page job ended or the cache answer changed (W1): a list that was not made asks again once; a list job running
 // shows its words in place of the button (W3)
 V.on('products',function(){if(st.need&&!st.busy&&!st.run&&!runText())load()}); V.on('job',function(){if(st.busy||!(st.need||st.run))return;var rt=runText();if(rt)status('mapviz.list.making',{job:rt});else if(!st.run)needView()});
 // the shell's map form: a map the user opened goes first in the recent maps of this game and mod
 V.on('map',function(d){if(!d)return;var k=d.key||null,ch=k!==st.key;st.key=k;st.mode=d.mode||null;var add=!!(d.user&&k&&recAdd(k));
  if(ch)markCurrent();drawModes();if(add||ch)drawRecent()});
 V.on('theme',function(){markCurrent()});
 V.on('picker',function(d){st.pop=!!(d&&d.open);if(!st.pop)return;showCurrent();if(el.search&&typeof el.search.select==='function')try{el.search.select()}catch(e){}});
}});
})();
`;
