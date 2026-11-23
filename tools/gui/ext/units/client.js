// Browser side of the Units page. Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h() and textContent.
// Author: Imperator_Aug (ARSENAL, ia-9a4e67ae)
module.exports = String.raw`
EXT_SCREENS.units=function(root){
 var el=h,cur=null,lastQ='',armies=[];
 function tk(a,b,p){return tx([a,b].join('.'),p)}
 function clear(n){while(n.firstChild)n.removeChild(n.firstChild)}
 function num(v){return v==null||v===''?'?':String(v)}
 // a price with what it is paid in: MP manpower, SP special points, or a mod's own points (DP ..)
 function price(v,res){return v==null||v===''?'?':String(v)+' '+String(res||'mp').toUpperCase()}
 function arm(a){return a?[a.front,a.side,a.rear,a.top].join(' / '):'?'}
 // armour as a table shows it: a soldier or a squad has none (N/A); a vehicle whose armour is not known keeps ?
 function noArm(u){return !!u&&(u.kind==='soldier'||u.kind==='squad'||!!u.many)}
 function armOf(u,a){return noArm(u)?tx('units.na'):arm(a===undefined?u&&u.armor:a)}
 // what a group buy brings (server bringsOf): "2 x T-34 (crew: 1 x commander, 1 x driver), 6 x rifleman"; short = no crews
 function bringsText(b,short){if(!b||!b.parts)return '';return b.parts.map(function(p){var t=p.n+' x '+(p.name||p.id);
  if(!short&&p.crew&&p.crew.length)t+=' ('+tx('units.brings.crew',{c:p.crew.map(function(c){return c.n+' x '+(c.name||c.id)}).join(', ')})+')';return t}).join(', ')}
 // rank: hidden unless the "Show rank" switch is on (off at first, kept in localStorage); Gates of Hell has no rank, so no switch there.
 // rk(cell) marks a table cell or a line that shows a rank; the switch hides and shows them in place
 // game names: one switch state for the whole page (the Find a unit card and the Equipment card each show the checkbox, key
 // as2gui.units.kit.names). nmText(el,fn): fn writes the element's text in the words of the switch, again on every change
 var NMS=[];
 function namesOn(){return !!ktNm.checked}
 function uNm(name,id){return namesOn()&&name?name:id}
 function uId2(name,id){return namesOn()&&name&&name!==id?id:''}
 function nmText(e,fn){fn(e);NMS.push([e,fn]);return e}
 function nmSync(){NMS=NMS.filter(function(x){return x[0].isConnected!==false});NMS.forEach(function(x){x[1](x[0])})}
 function joinD(a){return a.filter(function(x){return !!x}).join(' - ')}
 var rankF=el('input',{type:'checkbox'}),rkEls=[];try{if(localStorage.getItem('as2gui.units.rank')==='1')rankF.checked=true}catch(e){}
 function rankOn(){return !!rankF.checked&&!isGoh()}
 // a .row is display:flex, which beats the hidden attribute: a DIV is taken out by its style too
 // rk: shown while Show rank is on; nrk: its twin without the rank, shown while it is off
 function rkSet(e,on){if(e._rkInv)on=!on;e.hidden=!on;if(e.style&&e.tagName==='DIV')e.style.display=on?'':'none'}
 function rk(e){rkSet(e,rankOn());rkEls.push(e);return e}
 function nrk(e){e._rkInv=1;return rk(e)}
 function whereLines(box,w){box.appendChild(rk(el('div',{text:tx('units.where',{army:w.army,button:w.button||'?',rank:num(w.rank)})})));box.appendChild(nrk(el('div',{text:tx('units.where.norank',{army:w.army,button:w.button||'?'})})))}
 function rkSync(){var on=rankOn();rkEls=rkEls.filter(function(e){return e.isConnected!==false});rkEls.forEach(function(e){rkSet(e,on)})}
 rankF.addEventListener('change',function(){try{localStorage.setItem('as2gui.units.rank',rankF.checked?'1':'0')}catch(e){}rkSync()});
 // GT-15: the page has no mod of its own. It works on the one current mod of the program (S.mod), the one the header shows and picks
 // (owner 2026-11-19: a mod box here "is redundant when its in the header"), so Balance, Check and the other pages follow the same mod
 function curMod(){return S.mod||''}
 function modBody(o){o=o||{};o.mod=curMod();return o}
 // blocks: a labelled field is one leaf block <id>; a part the code clears or re-classes is the inner
 // element of its leaf; RES names a result leaf (empty until a request ran)
 function row(id,k,ctl,after){return fld(id,tx(k),ctl,{after:after})}
 function RES(){return {name:tx('units.blk.res')}}
 function inp(k,a){a=a||{};a.type=a.type||'text';a.autocomplete='off';a['aria-label']=tx(k);return el('input',a)}
 function sel(k,opts){return el('select',{'aria-label':tx(k)},opts.map(function(o){return el('option',{value:o[0],text:o[1]})}))}
 // JOBS: a request stopped from the footer (e.cancelled) is no error: the plain line Stopped
 function errBox(box,e){clear(box);box.appendChild(el('div',{class:e&&e.cancelled?'hint':'err',text:e.message||String(e)}))}
 // ---------- searchKit (page.js; owner 2026-11-19: every search box has a manual browse, an indexed search and a history list) ----------
 // hits: the items whose precomputed lower-case text (lo) holds q, the ones that start with it first, at most 40 (the rest counted)
 function hits(a,q,done){q=String(q||'').trim().toLowerCase();var f=[],l=[],n=0;
  for(var i=0;i<a.length;i++){var p=a[i].lo.indexOf(q);if(p<0)continue;n++;if(p===0){if(f.length<40)f.push(a[i])}else if(l.length<40)l.push(a[i])}
  var o=f.concat(l).slice(0,40);done(o,n-o.length)}
 // once(load): one list per signature (game, mod, writes ..), asked once and kept; callers that come while it loads wait for it
 function once(load){var c={sig:null,a:null,w:[]};return function(sig,cb){if(c.sig===sig&&c.a){cb(c.a);return}c.w.push(cb);if(c.sig===sig)return;c.sig=sig;c.a=null;
  load(function(a){if(c.sig!==sig)return;c.a=a||[];var w=c.w;c.w=[];w.forEach(function(f){f(c.a)})},function(){if(c.sig!==sig)return;c.sig=null;var w=c.w;c.w=[];w.forEach(function(f){f([])})})}}
 function dataSig(){return [S.gameId||'',curMod(),S.modWrites||0].join('|')}
 // the unit index: every unit of the game + mod (POST /api/x/units/index), by in-game name, id and army (kind in the hint)
 function kindWord(k){var t=tk('units.kind',k);return t==='units.kind.'+k?String(k||''):t}
 var UIX=once(function(ok,no){api('/api/x/units/index',modBody({}),{what:tx('units.job.index')}).then(function(j){var a=(j.units||[]).map(function(u){var nm=u.name||u.id;
   return {label:nm,value:u.id,card:u.card,kind:u.kind,army:u.army,period:u.period,buyable:!!u.buyable,hint:u.id+'  '+(u.army||'')+' '+kindWord(u.kind)+(u.period?' '+u.period:'')+(u.buyable?'':'  ('+tx('units.ix.notBuy')+')'),lo:(nm+' '+u.id+' '+(u.army||'')).toLowerCase()}});
   ok(a)}).catch(no)});
 // the weapon files the range recipe can change (POST /api/x/units/weapons), their stuff folder in the hint
 var WIX=once(function(ok,no){api('/api/x/units/weapons',modBody({}),{what:tx('units.job.weapons')}).then(function(j){ok((j.weapons||[]).map(function(w){return {label:w.name,value:w.name,hint:w.group,lo:String(w.name).toLowerCase()}}))}).catch(no)});

 // ---------- the mod (the header's): its state line ----------
 var modSay=el('div',{class:'hint'}),seenMod=null,seenGame=null;
 // game parity: api() sends the page's game; the page itself only redraws on a game switch (another unit list) and, under
 // Gates of Hell, turns the bot box off (no bot.data.lua, GHMIS-66) and shows the period pick of a new card
 function isGoh(){return S.gameId==='goh'}
 function syncMod(){var m=curMod(),g=S.gameId||'';
  if(m!==seenMod||g!==seenGame){var gc=seenGame!==null&&g!==seenGame;seenMod=m;seenGame=g;resetWrites();checkMod();gameUi();if(gc){byParts=[];byLikeIt=null;byLike.value='';byDraw();lkReset();ktReset()}if(gc&&loaded){cur=null;doSearch()}ucOpen()}kbStale();skStale()}
 function checkMod(){var m=curMod();if(!m){modSay.className='hint';modSay.textContent=tx('units.mod.none');return}
  api('/api/x/units/status?mod='+encodeURIComponent(m),undefined,{what:tx('units.job.status')}).then(function(j){if(m!==curMod())return;
   if(!j.modOk){modSay.className='err';modSay.textContent=j.why;return}
   modSay.className='hint';modSay.textContent=j.hasModInfo?tx('units.mod.ok'):tx('units.mod.noinfo')}).catch(function(e){modSay.className=e.cancelled?'hint':'err';modSay.textContent=e.message})}
 var modIntro=el('div',{text:tx('units.intro')});
 var modCard=el('div',{class:'card',blk:'mod',box:'col','data-blkname':tx('units.mod')},[blk('mod.intro',[modIntro]),blk('mod.say',[modSay],{name:tx('units.mod')}),blk('mod.safe',[el('div',{class:'hint',text:tx('units.safe')})])]);

 // ---------- preview, then write ----------
 var writers=[];
 // GT-33: the Write button is never left disabled. A disabled button swallows a real mouse click without a word (the page's
 // own "busy" lock and a reset from a blur both left it so); now it only looks off until a preview, and a click then says why
 function ready(w,on){w.btn.setAttribute('aria-disabled',on?'false':'true');w.btn.style.opacity=on?'':'0.55';w.btn.title=on?'':tx('units.previewFirst')}
 function resetWrites(){writers.forEach(function(w){w.last=null;ready(w,false)})}
 // one form: body() builds the request; the write button works only for the exact body last previewed without errors
 function flow(url,body,box,after,o){
  var w={btn:null,last:null,j:null};o=o||{};
  function go(write){
   var b;try{b=modBody(body())}catch(e){errBox(box,e);return}
   var key=JSON.stringify(b);if(write&&w.last!==key){toast(tx('units.previewFirst'));if(box.firstChild)box.insertBefore(el('div',{class:'wzstat',text:tx('units.previewFirst')}),box.firstChild);else box.appendChild(el('div',{class:'wzstat',text:tx('units.previewFirst')}));ready(w,false);return}
   b.write=!!write;if(write&&o.prep)o.prep(b,w.j);clear(box);box.appendChild(el('div',{class:'hint',text:tx(write?'units.writing':'units.previewing')}));
   api(url,b,{what:tx(write?'units.job.write':'units.job.preview')}).then(function(j){
    showResult(box,j,write,o);if(o.shown)o.shown(j,write,w.j);if(!write)w.j=j;w.last=(!write&&!(j.errors||[]).length)?key:null;ready(w,!!w.last);
    if(write&&j.written){refreshAfterWrite();if(after)after(j)}
   }).catch(function(e){errBox(box,e);w.last=null;ready(w,false)})}
  var pv=el('button',{type:'button',text:tx('units.preview'),onclick:function(){go(false)}});
  w.btn=el('button',{type:'button',class:'primary',text:tx('units.write'),onclick:function(){go(true)}});
  writers.push(w);ready(w,false);
  return el('div',{class:'row'},[pv,w.btn])}
 // N2-6/N2-15: info rows as plain sentences, one per code; codes without a plain text go into a closed Details box
 var INFO=['CLONE_MODEL_REF','CLONE_NO_ASSETS','ROSTER_LINE','GEN_WRECK_AUTOCLONE','GEN_XX_AUTOCLONE','GEN_ROSTER_REPLACES'];
 // GT-30: "the mod copy replaces the whole file" names the file it is about; only bot.data.lua is the bot buy list
 function infoText(f){if(f.code==='GEN_ROSTER_REPLACES'&&!/bot\.data\.lua/i.test(f.msg||'')){var fl=String(f.msg||'').split(':')[0].split('/').pop();return tx('units.info.fileCopy',{f:fl})}return tk('units.info',f.code)}
 function showInfo(box,info){var seen={},raw=[];info.forEach(function(f){var sk=f.code+(f.code==='GEN_ROSTER_REPLACES'?String(f.msg).split(':')[0]:'');if(seen[sk])return;seen[sk]=1;
  if(INFO.indexOf(f.code)>=0)box.appendChild(el('div',{class:'hint',text:infoText(f)}));else raw.push(f.code+': '+f.msg)});
  if(raw.length){var pre=el('pre');pre.textContent=raw.join('\n');box.appendChild(el('details',{},[el('summary',{text:tx('units.info.more',{n:raw.length})}),pre]))}}
 function goBtn(k,fn){return el('button',{type:'button',text:tx(k),onclick:fn})}
 function help(m){return function(){if(window.as2Help&&window.as2Help[m])window.as2Help[m]();else show('help')}}
 function what(r){return tk('units.f',String(r.field).split(/[ :]/)[0])+(r.part?' ('+r.part+')':'')}
 function botUndo(bt){var say=el('div',{class:'hint'}),b=el('button',{type:'button',text:tx('units.bots.undo'),onclick:function(){b.disabled=true;
   api('/api/x/bots/undo',modBody({undo:bt.undo}),{what:tx('units.bots.undo')}).then(function(){say.className='ok';say.textContent=tx('units.bots.undone',{f:bt.file||''})}).catch(function(e){b.disabled=false;say.className=e.cancelled?'hint':'err';say.textContent=e.message})}});
  return el('div',{},[el('div',{class:'row'},[b]),say])}
 function showResult(box,j,write,o){
  clear(box);o=o||{};
  // GT-30: a plain change says in one line what changes, before and after the write
  if(o.kind==='change'&&!(j.errors||[]).length)(j.rows||[]).forEach(function(r){box.appendChild(el('div',{class:write&&j.written?'ok':'',text:tx(write&&j.written?'units.chg.did':'units.chg.will',{what:what(r),old:num(r.old),now:num(r.new)})}))});
  (j.errors||[]).forEach(function(e){box.appendChild(el('div',{class:'err',text:e.msg}))});
  var seenW={};(j.warnings||[]).forEach(function(e){if(seenW[e.code])return;seenW[e.code]=1;if(/VEHICLE_NO_BOTS/.test(e.code)&&j.bots&&j.bots.state==='added')return;box.appendChild(el('div',{class:'wzstat',text:e.msg}))});
  if(j.bots)box.appendChild(el('div',{class:j.bots.state==='added'||(j.bots.state==='gohadd'&&write&&j.bots.wrote)?'ok':j.bots.state==='gohadd'||j.bots.state==='gohhas'?'hint':'wzstat',text:tk('units.bots',j.bots.state,{army:j.bots.army,list:j.bots.list||'',f:j.bots.file||'',why:j.bots.why==='stopped'?tx('units.bots.stopped'):j.bots.why||''})}));
  // GoH: the purchase list row the add wrote can be taken back by itself (the Bots page's undo, exact bytes)
  if(write&&j.bots&&j.bots.undo&&j.bots.undo.length)box.appendChild(botUndo(j.bots));
  showInfo(box,j.info||[]);if(j.inheritedFrom)box.appendChild(el('div',{class:'hint',text:tx('units.inherited',{f:j.inheritedFrom})}));
  var rows=o.kind==='change'?[]:j.rows||[];
  if(rows.length){
   var tb=el('tbody');
   rows.forEach(function(r){tb.appendChild(el('tr',{},[el('td',{text:(r.id?r.id+' ':'')+what(r)}),el('td',{text:num(r.old)}),el('td',{},[el('b',{text:num(r.new)})])]))});
   box.appendChild(el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:tx('units.col.what')}),el('th',{text:tx('units.col.old')}),el('th',{text:tx('units.col.new')})])]),tb]))}
  (j.files||[]).forEach(function(f){
   var tag=f.isNew?tx('units.file.new'):f.copiedFromGame?tx('units.file.copied'):tx('units.file.changed');
   var pre=el('pre',{class:'diff'});pre.textContent=f.lines.join('\n')+(f.more?'\n'+tx('units.more',{n:f.more}):'');
   box.appendChild(el('details',{},[el('summary',{text:f.file+' - '+tag}),pre]))});
  (j.names||[]).forEach(function(n){box.appendChild(el('div',{class:'hint',text:tx('units.nameIn',{k:n.key,f:'localization/'+n.file})+(n.copyVanilla?' '+tx('units.nameCopy'):'')}));if(n.copyVanilla)box.appendChild(el('div',{class:'wzstat',text:tx('units.nameXlate')}))});
  if(write&&j.written){
   if(o.kind!=='change')box.appendChild(el('div',{class:'ok',text:tx('units.done')}));
   if(j.where&&j.where.panel)whereLines(box,j.where);
   box.appendChild(el('div',{class:'hint',text:j.hasModInfo?tx(isGoh()?'units.nextGoh':S.gameId==='mowas2'?'units.nextMow':'units.next'):tx('units.nextInfo')}));
   box.appendChild(el('div',{class:'row'},[goBtn('units.go.on',help('playYourself')),goBtn('units.go.ns',help('notShowing'))]));
   if(o.newUnit&&j.unit){box.appendChild(el('div',{class:'hint',text:tx('units.same3d')}));box.appendChild(el('div',{class:'row'},[goBtn('units.go.art',function(){show('art')}),goBtn('units.go.guides',function(){show('guides','tools')})]))}
  }else if(!write&&!(j.errors||[]).length)box.appendChild(el('div',{class:'hint',text:tx('units.looksOk')}))}

 // ---------- search ----------
 var qIn=inp('units.search',{placeholder:tx('units.search.ph')});
 var kindF=sel('units.kind',[['',tx('units.kind.any')],['vehicle',tx('units.kind.vehicle')],['squad',tx('units.kind.squad')],['soldier',tx('units.kind.soldier')]]);
 var armyF=sel('units.army',[['',tx('units.army.any')]]);
 var allF=el('input',{type:'checkbox','aria-label':tx('units.all')});
 var sState=el('div',{class:'hint'}),dym=el('div',{class:'row'}),stb=el('tbody');
 var stbl=el('table',{},[el('thead',{},[el('tr',{},['units.col.name','units.col.army','units.col.price','units.col.rank','units.col.armor'].map(function(k){var h=el('th',{text:tx(k)});return k==='units.col.rank'?rk(h):h}))]),stb]);
 function fillArmies(list){if(list.join()===armies.join())return;armies=list;var v=armyF.value;while(armyF.options.length>1)armyF.remove(1);
  list.forEach(function(a){armyF.appendChild(el('option',{value:a,text:a}))});armyF.value=v;
  [apArmy,byArmy].forEach(function(s){var v2=s.value;clear(s);list.forEach(function(a){s.appendChild(el('option',{value:a,text:a}))});if(v2)s.value=v2})}
 // fast typing: the server search is debounced (350 ms), a reply to an older request is dropped (sSeq), the rows are drawn in the next
 // frame and at most LIM of them (Show more asks for more); the mod signature on the server is cached (server.js modSig), which was
 // the 11 s per keystroke on a big mod
 var sT=null,sSeq=0,LIM0=60,lim=LIM0,moreBtn=el('button',{type:'button',hidden:true,onclick:function(){lim+=200;doSearch(true)}});
 function frame(f){if(typeof requestAnimationFrame==='function')requestAnimationFrame(f);else setTimeout(f,0)}
 function doSearch(keep){
  clearTimeout(sT);sState.className='hint';sState.textContent=tx('units.searching');
  var q=qIn.value.trim(),my=++sSeq;if(keep!==true)lim=LIM0;lastQ=q;
  api('/api/x/units/search',modBody({q:q,kind:kindF.value,army:armyF.value,all:allF.checked,limit:lim}),{what:tx('units.job.search')}).then(function(j){
   if(my!==sSeq)return;frame(function(){if(my!==sSeq)return;drawFound(j)})
  }).catch(function(e){if(my!==sSeq)return;sState.className=e.cancelled?'hint':'err';sState.textContent=e.message})}
 function drawFound(j){fillArmies(j.armies||[]);clear(stb);clear(dym);
   sState.textContent=tx('units.found',{n:j.total});
   var left=j.total-j.results.length;moreBtn.hidden=!(left>0);moreBtn.textContent=tx('units.showMore',{n:Math.min(200,left),left:left});
   j.results.forEach(function(u){
    var tr=el('tr',{tabindex:'0',onclick:function(){open(u.id,u.card)},onkeydown:function(e){if(e.key==='Enter'){e.preventDefault();open(u.id,u.card)}}},[
     el('td',{},[nmText(el('b'),function(e){e.textContent=uNm(u.name,u.id)}),nmText(el('div',{class:'hint'}),function(e){e.textContent=joinD([uId2(u.name,u.id),u.mod?tx('units.inMod'):'',u.brings?bringsText(u.brings,true):''])})]),
     el('td',{text:u.army}),el('td',{text:u.buyable?price(u.cost,u.res):num(u.cost)}),rk(el('td',{text:num(u.level)})),el('td',{text:armOf(u)})]);
    stb.appendChild(tr)});
   if(j.didYouMean&&j.didYouMean.length){dym.appendChild(el('span',{class:'hint',text:tx('units.dym')}));
    j.didYouMean.forEach(function(d){dym.appendChild(nmText(el('button',{type:'button',onclick:function(){qIn.value=d.name||d.id;doSearch()}}),function(e){e.textContent=namesOn()&&d.name?d.name+' ('+d.id+')':d.id}))})}
   if(!j.total&&!(j.didYouMean||[]).length)sState.textContent=tx('units.none')}
 qIn.addEventListener('input',function(){clearTimeout(sT);sT=setTimeout(doSearch,350)});
 // searchKit: history 'units.search', index = every unit by in-game name, id and army (asked once per game + mod + write); a pick from the
 // index opens that unit at once (a unit not for sale turns on "all units"). Browse = the file picker on the game data at entity/ (.def):
 // the unit's file name searches for it
 function stem(p){var b=String(p||'').replace(/\\/g,'/').split('/').pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}
 var qKit=searchKit(qIn,{key:'units.search',index:function(q,done){UIX(dataSig(),function(a){hits(a,q,done)})},
  browse:{mode:'file',view:'data',start:'entity',exts:['def'],toValue:stem},
  onPick:function(v,it,from){qIn.value=v;if(from!=='browse'&&it&&it.value){if(!it.buyable&&!allF.checked)allF.checked=true;open(it.value,it.card)}doSearch()}});
 [kindF,armyF,allF].forEach(function(i){i.addEventListener('change',doSearch)});
 var rankLab=el('label',{},[rankF,el('span',{text:' '+tx('units.rank.show')})]);
 var sNm=el('input',{type:'checkbox'}),sNmLab=el('label',{},[sNm,el('span',{text:' '+tx('units.kit.names')})]);
 sNm.addEventListener('change',function(){ktNm.checked=sNm.checked;ktNmChanged()});
 var searchCard=el('div',{class:'card',blk:'search',box:'col'},[blk('search.title',[el('h3',{text:tx('units.search.h')})]),
  el('div',{class:'row',blk:'search.bar','data-blkname':tx('units.search.h')},[qKit.el,kindF,armyF,el('label',{},[allF,el('span',{text:' '+tx('units.all')})]),rankLab,sNmLab]),
  blk('search.state',[sState],{name:tx('units.blk.state')}),blk('search.dym',[dym],{name:tx('units.blk.dym')}),blk('search.list',[el('div',{class:'scroll',style:'max-height:300px'},[stbl])],{name:tx('units.blk.list')}),blk('search.more',[moreBtn],{name:tx('units.showMoreB')})]);

 // ---------- stats ----------
 var statBox=el('div',{class:'card'},[el('div',{class:'hint',text:tx('units.pickone')})]),statBlk=blk('stats',[statBox],{name:tx('units.blk.stats')});
 function line(k,v,old){var kids=[el('span',{class:'n',text:tx(k)}),el('b',{text:v})];if(old!=null&&String(old)!==String(v))kids.push(el('span',{class:'hint',text:' '+tx('units.wasVanilla',{v:old})}));return el('div',{class:'row'},kids)}
 // GT-13: only the numbers that are known, in the same terms as the Balance page (penetration at 100 m, damage, reload)
 function gunWords(g){var p=[];if(g.pen!=null)p.push(tx('units.gun.pen',{v:g.pen}));if(g.damage!=null)p.push(tx('units.gun.dmg',{v:g.damage}));
  if(g.reload!=null)p.push(tx('units.gun.reload',{v:g.reload}));if(g.range)p.push(tx('units.gun.range',{v:g.range}));return p.length?p.join(', '):tx('units.gun.none')}
 // card: under GoH the period copy the row stands for (one id has a card in each period list); the server keys by it
 function open(id,card){
  clear(statBox);statBox.appendChild(el('div',{class:'hint',text:tx('units.loading')}));
  api('/api/x/units/stats',modBody(card?{id:id,card:card}:{id:id}),{what:tx('units.job.stats')}).then(function(u){cur=u;drawStats();fillForms();autoLook();ucOpen()}).catch(function(e){errBox(statBox,e)})}
 function drawStats(){
  var u=cur,v=u.vanilla||{},k=u.unlock||{};clear(statBox);
  statBox.appendChild(nmText(el('h3'),function(e){e.textContent=namesOn()&&u.name?u.name+' ('+u.id+')':u.id}));
  if(S.screens.models&&S.screens.models.pick)statBox.appendChild(el('div',{class:'row'},[el('button',{type:'button',text:tx('units.openModel'),onclick:function(){show('models');S.screens.models.pick(u.id)}})]));
  if(u.isNew)statBox.appendChild(el('div',{class:'badge',text:tx('units.newInMod')}));
  statBox.appendChild(line('units.s.army',u.army+' - '+tk('units.kind',u.kind)));
  if(u.buyable){
   statBox.appendChild(line('units.s.price',price(u.cost,k.res),v.cost!=null?price(v.cost,v.res):null));
   statBox.appendChild(rk(line('units.s.rank',num(u.level),v.level)));
   statBox.appendChild(line('units.s.charge',num(k.charge)+' s',v.charge!=null?v.charge+' s':null));
   statBox.appendChild(el('div',{class:'hint',text:tx('units.unlockF',{c:num(k.charge),k:num(k.factor==null?1:k.factor),f:num(k.fore==null?0:k.fore),w:num(k.startWait),a:num(k.afterBuy)})}))
  }else statBox.appendChild(el('div',{class:'hint',text:tx('units.notBuyable')}));
  if(noArm(u))statBox.appendChild(line('units.s.armor',tx('units.na')));
  else if(u.armor)statBox.appendChild(line('units.s.armor',arm(u.armor)+' mm',v.armor?arm(v.armor)+' mm':null));
  (u.armorMacro||[]).forEach(function(m){m.parts.forEach(function(p){statBox.appendChild(el('div',{class:'hint',text:m.macro+' / '+p.name+': '+p.values.join(' ')}))})});
  if(u.gun)statBox.appendChild(line('units.s.gun',u.gun.weapon+' - '+gunWords(u.gun)));
  if(u.brings){statBox.appendChild(line('units.s.brings',bringsText(u.brings)));statBox.appendChild(el('div',{class:'hint',text:tx('units.brings.total',{v:u.brings.vehicles,m:u.brings.men})}))}
  if(u.crew)statBox.appendChild(line('units.s.crew',String(u.crew)+' ('+u.members.filter(function(m){return m.n!==0}).map(function(m){return m.breed+' x'+m.n}).join(', ')+')'));
  if(u.speed!=null)statBox.appendChild(line('units.s.speed',String(u.speed)));
  statBox.appendChild(line('units.s.bots',u.bots&&u.bots.length?u.bots.map(function(b){return b.army+(b.list?' '+b.list:'')+(b.cls?' '+b.cls:'')+(b.priority!=null?' p'+b.priority:'')}).join(', '):tx('units.bots.no')));
  if(u.where&&u.where.panel)whereLines(statBox,u.where);
  statBox.appendChild(el('div',{class:'hint',text:tx('units.file',{f:u.cardFile||'?'})+(u.def?' - '+u.def:'')}));
  statBox.appendChild(el('details',{},[el('summary',{text:tx('units.legend.h')})].concat(['price','rank','charge','fore','armor','gun','crew','speed','bots'].map(function(x){return el('div',{class:'hint',text:tk('units.legend',x)})}))))}

 // ---------- change wizard ----------
 var chField=sel('units.ch.field',[['cost',tx('units.f.cost')],['armor',tx('units.f.armor')],['charge',tx('units.f.charge')],['level',tx('units.f.level')],['fore',tx('units.f.fore')]]);
 var chPart=sel('units.ch.part',[]),chVal=inp('units.ch.value'),chHint=el('div',{class:'hint'}),chBox=el('div'),chUnit=el('div',{class:'hint',text:tx('units.pickone')});
 function chParts(){clear(chPart);if(!cur)return;
  // GoH: the parts come from the vehicle's own files (goharmour.js): every part by percent, the top speed, then each part with its mm
  if(isGoh()){var gu=cur;chPart.appendChild(el('option',{value:'*',text:tx('units.ch.goh.all')+' (100)'}));
   api('/api/x/units/goharmor',modBody({id:cur.id,card:cur.card})).then(function(j){if(cur!==gu)return;
    if(j.speed)chPart.appendChild(el('option',{value:'speed',text:tx('units.ch.goh.speed')+' ('+j.speed.kmh+')'}));
    (j.parts||[]).forEach(function(p){chPart.appendChild(el('option',{value:p.name,text:p.name+' ('+p.value+')'}))});chSay()}).catch(function(e){if(cur===gu)chHint.textContent=e.message});return}
  (cur.armorMacro||[]).forEach(function(m){m.parts.forEach(function(p){chPart.appendChild(el('option',{value:m.macro+'/'+p.name,text:p.name+' ('+p.values.join(' ')+')'}))})});
  if(!(cur.armorMacro||[]).length)(cur.armorVolumes||[]).forEach(function(v){chPart.appendChild(el('option',{value:v.name,text:v.name+' ('+v.front+')'}))})}
 function chSay(){var f=chField.value;chPart.style.display=f==='armor'?'':'none';chHint.textContent=f==='armor'&&isGoh()?tx('units.ch.goh.h'):tk('units.ch.h',f);
  if(!cur)return;var v={cost:cur.cost,charge:cur.charge,level:cur.level,fore:cur.fore}[f];
  if(f==='armor'){var o=chPart.options[chPart.selectedIndex];v=o?o.text.replace(/^.*\(|\)$/g,''):''}
  chVal.value=v==null?'':String(v)}
 chField.addEventListener('change',chSay);chPart.addEventListener('change',chSay);
 var chBtns=flow('/api/x/units/change',function(){if(!cur)throw new Error(tx('units.pickone'));return {id:cur.id,card:cur.card,field:chField.value,part:chField.value==='armor'?chPart.value:undefined,value:chVal.value}},chBox,function(){open(cur.id,cur.card)},{kind:'change'});
 // Balance quick changes (tune view): the numbers that balance the game. The name and what a unit is made of: changeCard (make view)
 var numCard=el('div',{class:'card',blk:'num',box:'col'},[blk('num.title',[el('h3',{text:tx('units.num.h')})]),blk('num.unit',[chUnit]),row('num.field','units.ch.field',chField),
  row('num.part','units.ch.part',chPart),row('num.value','units.ch.value',chVal),blk('num.hint',[chHint],{name:tx('units.ch.value')}),blk('num.btns',[chBtns]),blk('num.res',[chBox],RES())]);
 var rnVal=inp('units.ch.name',{maxlength:'80'}),rnBox=el('div'),rnUnit=el('div',{class:'hint',text:tx('units.pickone')});
 var rnBtns=flow('/api/x/units/change',function(){if(!cur)throw new Error(tx('units.pickone'));return {id:cur.id,card:cur.card,field:'name',value:rnVal.value}},rnBox,function(){open(cur.id,cur.card)},{kind:'change'});

 // ---------- add a unit ----------
 var adId=inp('units.ad.id',{maxlength:'40',placeholder:'t34_custom'}),adName=inp('units.ad.name',{maxlength:'80'}),adPrice=inp('units.ad.price',{maxlength:'8'});
 var adWreck=el('input',{type:'checkbox',checked:true,'aria-label':tx('units.ad.wreck')}),adBots=el('input',{type:'checkbox',checked:true,'aria-label':tx('units.ad.bots')});
 var adLike=el('div',{class:'hint',text:tx('units.pickone')}),adBotSay=el('div',{class:'hint'}),adBox=el('div');
 var adPer=sel('units.ad.period',[['','-'],['early','early'],['mid','mid'],['late','late'],['conquest','conquest']]),adPerRow=row('add.period','units.ad.period',adPer);
 // ---------- build a buy (owner 2026-11-22: Units is about making multiplayer buys: squads and groups of vehicles) ----------
 // rows of soldiers and vehicles with counts -> POST /api/x/units/buy: a new buy card placed like a squad of the army (a group with
 // vehicles sits with its dearest vehicle). Vehicles come with their usual crew. Preview, then Write, like every form here
 var byParts=[],byList=el('div'),byBox=el('div'),bySay=el('div',{class:'hint'});
 var byArmy=sel('units.by.army',[]),byPer=sel('units.ad.period',[['early','early'],['mid','mid'],['late','late'],['conquest','conquest']]);
 var byId=inp('units.ad.id',{maxlength:'40',placeholder:'assault_group'}),byName=inp('units.ad.name',{maxlength:'80'}),byPrice=inp('units.ad.price',{maxlength:'8'}),byLevel=inp('units.by.level',{maxlength:'3'});
 var byBots=el('input',{type:'checkbox','aria-label':tx('units.ad.bots')});
 var byAdd=inp('units.by.add',{placeholder:tx('units.by.add.ph')}),byLike=inp('units.by.like',{placeholder:tx('units.by.like.ph')}),byLikeIt=null;
 function byOk(u,kinds){if(kinds.indexOf(u.kind)<0)return false;if(isGoh()&&u.period&&u.period!==byPer.value)return false;return !byArmy.value||u.army===byArmy.value}
 function byPut(it){if(!it||!it.value)return;var same=null;byParts.forEach(function(p){if(p.id===it.value&&(p.card||'')===(it.card||''))same=p});
  if(same)same.n=Math.min(30,same.n+1);else byParts.push({id:it.value,card:it.card,name:it.label||it.value,kind:it.kind,n:it.n||1});byDraw()}
 function byDraw(){clear(byList);resetWrites();
  if(!byParts.length){byList.appendChild(el('div',{class:'hint',text:tx('units.by.empty')}));return}
  var tb=el('tbody');
  byParts.forEach(function(p,i){var n=el('input',{type:'number',min:'1',max:p.kind==='vehicle'?'8':'30',value:String(p.n),style:'width:5em','aria-label':tx('units.by.count')});
   n.addEventListener('input',function(){var v=parseInt(n.value,10);if(v>=1){p.n=v;resetWrites()}});
   tb.appendChild(el('tr',{},[el('td',{},[nmText(el('b'),function(e){e.textContent=uNm(p.name,p.id)}),nmText(el('div',{class:'hint'}),function(e){var i2=uId2(p.name,p.id);e.textContent=(i2?i2+'  ':'')+kindWord(p.kind)+(p.kind==='vehicle'?'  '+tx('units.by.crew'):'')})]),el('td',{},[n]),
    el('td',{},[el('button',{type:'button',text:tx('units.by.remove'),'aria-label':tx('units.by.remove')+' '+p.name,onclick:function(){byParts.splice(i,1);byDraw()}})])]))});
  byList.appendChild(el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:tx('units.col.name')}),el('th',{text:tx('units.by.count')}),el('th',{text:''})])]),tb]))}
 // searchKit: history 'units.by.add', index = the soldiers and vehicles of the picked army (the unit index); Browse = the unit files
 // (entity/ .def) on the game data: the file name is looked up in the index
 var byKit=searchKit(byAdd,{key:'units.by.add',index:function(q,done){UIX(dataSig(),function(a){hits(a.filter(function(u){return byOk(u,['soldier','vehicle'])}),q,done)})},
  browse:{mode:'file',view:'data',start:'entity',exts:['def'],toValue:stem},
  onPick:function(v,it,from){byAdd.value='';if(it&&it.value&&it.kind){byPut(it);return}
   UIX(dataSig(),function(a){var f=null,lv=String(v||'').toLowerCase();a.forEach(function(u){if(!f&&(u.value.toLowerCase()===lv||u.label.toLowerCase()===lv)&&(u.kind==='soldier'||u.kind==='vehicle'))f=u});
    if(f)byPut(f);else{bySay.className='wzstat';bySay.textContent=tx('units.by.notFound',{v:v})}})}});
 // searchKit: history 'units.by.like', index = the squads of the picked army; Browse = the squad list file of the game data
 var byLikeKit=searchKit(byLike,{key:'units.by.like',index:function(q,done){UIX(dataSig(),function(a){hits(a.filter(function(u){return u.buyable&&byOk(u,['squad'])}),q,done)})},
  browse:{mode:'file',view:'data',start:'set/multiplayer/units',exts:['set'],toValue:stem},
  onPick:function(v,it){byLikeIt=it&&it.kind==='squad'?it:null;byLike.value=byLikeIt?byLikeIt.value:v;resetWrites()}});
 byLike.addEventListener('input',function(){byLikeIt=null});
 // start from the unit open in the stats panel: a squad gives its soldiers, a soldier or vehicle goes in as one row
 function byFrom(){if(!cur){bySay.className='wzstat';bySay.textContent=tx('units.pickone');return}bySay.textContent='';
  if(cur.army&&armies.indexOf(cur.army)>=0&&!byParts.length){byArmy.value=cur.army;if(isGoh()&&cur.period)byPer.value=cur.period}
  if(cur.kind==='squad'){(cur.members||[]).forEach(function(m){var t=String(m.breed).split('/').pop(),id='mp/'+cur.army+'/'+(isGoh()&&cur.period?cur.period+'/':'')+t;byPut({value:id,label:t,kind:'soldier',n:m.n})});return}
  byPut({value:cur.id,card:cur.card,label:cur.name||cur.id,kind:cur.kind})}
 var byBtns=flow('/api/x/units/buy',function(){if(!byParts.length)throw new Error(tx('units.by.empty'));
  var b={id:byId.value.trim(),name:byName.value.trim(),army:byArmy.value,parts:byParts.map(function(p){var o={id:p.id,n:p.n};if(p.card)o.card=p.card;return o}),price:byPrice.value.trim(),level:byLevel.value.trim(),bots:byBots.checked};
  var lk=byLike.value.trim();if(lk){b.like=lk;if(byLikeIt&&byLikeIt.card)b.likeCard=byLikeIt.card}
  if(isGoh()){b.period=byPer.value;b.price='';b.level=''}return b},byBox,function(j){qIn.value=j.unit.id;doSearch()},
  {newUnit:true,shown:function(j){var y=j.buy;if(!y)return;
   byBox.appendChild(el('div',{text:tx('units.by.sum',{men:y.men,veh:y.vehicles,sum:y.sum})+(y.unknown&&y.unknown.length?' '+tx('units.by.sumUnknown',{n:y.unknown.length}):'')}));
   byBox.appendChild(el('div',{class:'hint',text:tx(y.seat?'units.by.seat':'units.by.placed',{n:(y.seat||y.placedLike).name||(y.seat||y.placedLike).id})}));
   byBox.appendChild(el('div',{class:'hint',text:tx('units.by.spawns',{c:y.content})}))}});
 var byPerRow=row('buy.period','units.ad.period',byPer),byPriceRow=row('buy.price','units.ad.price',byPrice),byLevelRow=row('buy.level','units.by.level',byLevel),byBotsBlk=blk('buy.bots',[el('label',{},[byBots,el('span',{text:' '+tx('units.ad.bots')})])]);
 var byGoh=el('div',{class:'hint',text:tx('units.by.goh')}),byGohBlk=blk('buy.goh',[byGoh]);
 function byGame(){var g=isGoh();byPerRow.hidden=!g;byPriceRow.hidden=g;byLevelRow.hidden=g;byGohBlk.hidden=!g}
 [byArmy,byPer].forEach(function(s){s.addEventListener('change',resetWrites)});
 var buyCard=el('div',{class:'card',blk:'buy',box:'col'},[blk('buy.title',[el('h3',{text:tx('units.by.h')})]),blk('buy.intro',[el('div',{class:'hint',text:tx('units.by.intro')})]),byGohBlk,
  row('buy.army','units.by.army',byArmy),byPerRow,
  el('div',{class:'row',blk:'buy.add','data-blkname':tx('units.by.add')},[byKit.el,el('button',{type:'button',text:tx('units.by.from'),onclick:byFrom})]),blk('buy.say',[bySay],{name:tx('units.blk.state')}),
  blk('buy.list',[byList],{name:tx('units.by.parts')}),
  row('buy.id','units.ad.id',byId),row('buy.name','units.ad.name',byName),byPriceRow,byLevelRow,
  el('div',{class:'row',blk:'buy.like','data-blkname':tx('units.by.like')},[el('span',{class:'n',text:tx('units.by.like')}),byLikeKit.el]),byBotsBlk,
  blk('buy.btns',[byBtns]),blk('buy.look',[el('button',{type:'button',text:tx('units.lk.go'),onclick:function(){lkBuilt();toolOf(lookCard);if(lookCard.scrollIntoView)lookCard.scrollIntoView({block:'start'})}})]),blk('buy.res',[byBox],RES())]);
 byDraw();
 // ---------- 3D view of a buy (owner 2026-11-22: the whole buy in one picture, like the Gates of Hell conquest line-up) ----------
 // POST /api/x/units/models -> every model the buy spawns, once each with its count: the list under the picture. The picture is ONE
 // wide 3D pane of the Models page's viewer (EXT_SCREENS.models.parts.viewer with opts.scene = POST /api/x/units/lineup, same body):
 // every soldier and vehicle of the buy, standing at rest with their gear. The viewer draws the scene and does not hand the answer
 // back, so the notes and which figure is which model are asked once here. A viewer without scene support (or none): the small
 // panes as before, one per model, at most LKMAX at once (a browser keeps a limited number of 3D canvases)
 var lkBox=el('div',{class:'row',style:'flex-wrap:wrap;gap:10px;align-items:flex-start'}),lkRest=el('div',{class:'row',style:'flex-wrap:wrap;gap:6px'}),lkNotes=el('div'),lkListBox=el('div'),lkSay=el('div',{class:'hint',text:tx('units.lk.none')}),lkSeq=0,lkN=0,LKMAX=6,lkPanes=[],lkV=null,lkFigs=[],lkRows={};
 function lkLabel(m){return (m.name||m.id)+(m.n>1?'  x'+m.n:'')}
 function lkViewer(){return typeof EXT_SCREENS!=='undefined'&&EXT_SCREENS.models&&EXT_SCREENS.models.parts&&EXT_SCREENS.models.parts.viewer}
 function lkPane(m){var P=lkViewer(),v=null;
  try{if(P)v=P({set:{target:m.target},mod:curMod()},{doc:false,compact:true,height:220,blk:'look.v'+(++lkN),show:{volumes:false,grid:false,bones:false,axes:false}})}catch(e){v=null}
  var kids=[v||el('div',{class:'hint',text:tx('units.lk.no3d')}),el('b',{text:lkLabel(m)})];
  return el('div',{style:'flex:1 1 220px;min-width:200px;max-width:360px'},kids)}
 function lkShow(m){if(lkPanes.length>=LKMAX){var old=lkPanes.shift();if(old.el.parentNode)old.el.parentNode.removeChild(old.el);lkRest.appendChild(lkBtn(old.m))}
  var p={m:m,el:lkPane(m)};lkPanes.push(p);lkBox.appendChild(p.el)}
 function lkBtn(m){var b=el('button',{type:'button',text:lkLabel(m),title:tx('units.lk.swap'),onclick:function(){if(b.parentNode)b.parentNode.removeChild(b);lkShow(m)}});return b}
 // the wide picture: one viewer for the card; another buy is another scene of the same viewer. null = no scene support here
 function lkWide(body){var P=lkViewer(),sc={url:'/api/x/units/lineup',body:JSON.parse(JSON.stringify(body))};
  if(lkV&&typeof lkV.setScene==='function'){try{lkV.setScene(sc);return lkV}catch(e){lkV=null}}
  var v=null;try{if(P)v=P({set:{},mod:curMod()},{doc:false,compact:true,height:420,blk:'look.view',show:{volumes:false,grid:false,bones:false,axes:false},scene:sc,onFigure:lkFig})}catch(e){v=null}
  if(v&&typeof v.setScene==='function'){lkV=v;return v}
  return null}
 function lkKey(id){return String(id||'').toLowerCase()}
 function lkMark(id){Object.keys(lkRows).forEach(function(k){lkRows[k].style.outline=k===lkKey(id)?'2px solid var(--acc)':''});var r=lkRows[lkKey(id)];if(r&&r.scrollIntoView)r.scrollIntoView({block:'nearest'})}
 // a click on a figure of the picture marks its row; a click on a row's name turns the picture to that figure
 function lkFig(i){lkFigs.forEach(function(f){if(f.index===i)lkMark(f.id)})}
 function lkFocus(m){lkMark(m.id);if(!lkV||typeof lkV.focusFigure!=='function')return;var f=null;lkFigs.forEach(function(x){if(!f&&lkKey(x.id)===lkKey(m.id))f=x});if(f){try{lkV.focusFigure(f.index)}catch(e){}}}
 function lkList(a){var tb=el('tbody');lkRows={};
  a.forEach(function(m){var btns=[],nm=m.name||m.id;
   if(S.screens.models&&S.screens.models.pick)btns.push(el('button',{type:'button',text:tx('units.openModel'),'aria-label':tx('units.openModel')+' '+nm,onclick:function(){show('models');S.screens.models.pick(m.target)}}));
   if(m.kind==='soldier'||m.kind==='vehicle')btns.push(el('button',{type:'button',text:tx('units.lk.equip'),'aria-label':tx('units.lk.equip')+' '+nm,onclick:function(){ktPick(m.kind==='vehicle'?{entity:m.target||m.id}:{id:m.id});kitUnderLook();if(kitCard.scrollIntoView)kitCard.scrollIntoView({block:'start'})}}));
   var tr=el('tr',{},[el('td',{},[nmText(el('button',{type:'button',title:tx('units.lk.find'),onclick:function(){lkFocus(m)}}),function(e){e.textContent=uNm(m.name,m.id)}),nmText(el('div',{class:'hint'}),function(e){var i2=uId2(m.name,m.id);e.textContent=(i2?i2+'  ':'')+kindWord(m.kind)})]),el('td',{text:String(m.n)}),el('td',{},[el('div',{class:'row'},btns)])]);
   lkRows[lkKey(m.id)]=tr;tb.appendChild(tr)});
  return el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:tx('units.col.name')}),el('th',{text:tx('units.by.count')}),el('th',{text:''})])]),tb])}
 function lkWipe(){clear(lkBox);clear(lkRest);clear(lkNotes);clear(lkListBox);lkPanes=[];lkFigs=[];lkRows={}}
 function lkReset(){lkSeq++;lkWipe();lkV=null;lkSay.className='hint';lkSay.textContent=tx('units.lk.none')}
 function lkDraw(j,body){lkWipe();var a=j.models||[],my=lkSeq;
  if(!a.length){lkSay.className='wzstat';lkSay.textContent=tx('units.lk.empty');return}
  var v=lkWide(body),sum=tx('units.lk.sum',{veh:j.vehicles,men:j.men,kinds:a.length});lkSay.className='hint';
  if(v){lkSay.textContent=sum+' '+tx('units.lk.how');lkBox.appendChild(el('div',{style:'flex:1 1 100%;min-width:0'},[v]));
   api('/api/x/units/lineup',Object.assign(JSON.parse(JSON.stringify(body)),{brief:true}),{what:tx('units.job.models')}).then(function(r){if(my!==lkSeq)return;lkFigs=r.figures||[];(r.notes||[]).forEach(function(n){lkNotes.appendChild(el('div',{class:'hint',text:String(n)}))})})
    .catch(function(e){if(my!==lkSeq)return;lkNotes.appendChild(el('div',{class:e.cancelled?'hint':'wzstat',text:e.message}))})}
  else{lkSay.textContent=sum+' '+tx('units.lk.small')+(a.length>LKMAX?' '+tx('units.lk.more',{n:LKMAX}):'')+' '+tx('units.lk.how');
   a.forEach(function(m,i){if(i<LKMAX)lkShow(m);else lkRest.appendChild(lkBtn(m))})}
  lkListBox.appendChild(lkList(a))}
 function lkAsk(body){var my=++lkSeq,b=modBody(body);lkSay.className='hint';lkSay.textContent=tx('units.lk.loading');
  api('/api/x/units/models',JSON.parse(JSON.stringify(b)),{what:tx('units.job.models')}).then(function(j){if(my!==lkSeq)return;lkDraw(j,b)}).catch(function(e){if(my!==lkSeq)return;lkWipe();lkSay.className=e.cancelled?'hint':'err';lkSay.textContent=e.message})}
 function lkBuilt(){if(!byParts.length){lkSay.className='wzstat';lkSay.textContent=tx('units.by.empty');return}
  lkAsk({army:byArmy.value,parts:byParts.map(function(p){var o={id:p.id,n:p.n};if(p.card)o.card=p.card;return o})})}
 function lkOpen(){if(!cur){lkSay.className='wzstat';lkSay.textContent=tx('units.pickone');return}lkAsk(cur.card?{id:cur.id,card:cur.card}:{id:cur.id})}
 var lookCard=el('div',{class:'card',blk:'look',box:'col'},[blk('look.title',[el('h3',{text:tx('units.lk.h')})]),blk('look.intro',[el('div',{class:'hint',text:tx('units.lk.intro')})]),
  el('div',{class:'row',blk:'look.btns','data-blkname':tx('units.lk.h')},[el('button',{type:'button',class:'primary',text:tx('units.lk.built'),onclick:lkBuilt}),el('button',{type:'button',text:tx('units.lk.open'),onclick:lkOpen})]),
  blk('look.say',[lkSay],{name:tx('units.blk.state')}),blk('look.panes',[lkBox],{name:tx('units.lk.h')}),blk('look.notes',[lkNotes],{name:tx('units.lk.notes')}),
  blk('look.list',[lkListBox],{name:tx('units.lk.list')}),blk('look.rest',[lkRest],{name:tx('units.lk.restName')})]);

 // ---------- equipment (owner 2026-11-22: a soldier's inventory as the grid of cells the game shows, edited by clicking) ----------
 // POST /api/x/units/kit {id, card | breed, pending?, lang} -> the grid, the items with their cells as the game lays them out, what
 // does not fit. Every edit here is kept as a pending list (ktP: add, del, inHands) and the same route is asked again with it, so
 // the "fits / does not fit" line is the server's own fill rule (ext/units/kit.js), not a second copy of it. Preview and Write send
 // the pending list to POST /api/x/units/kit/set (gen's kit op on a mod copy of the soldier file).
 // - every item line form the engine reads is shown and edited here: count, spread (the game rolls the count: shown as a range),
 //   loaded with its own ammunition or a named one, rounds, in the hands (any line, or none), remove
 // - names: the game's own item names (the server reads them, mod over game) or the file names: the "Show game names" switch,
 //   on at first, kept in localStorage
 // - pictures: the game has no icon files, it draws an item from its 3D model. A tile is drawn with its label at once; the 3D
 //   view of the Models page renders the model once (viewer.pictures, ext/models/sub/README.md) and the picture replaces the label.
 //   Kept for the page session per game + mod + model + size. No mod folder or no WebGL: the labels stay
 // A vehicle (owner 2026-11-22: "Equipment should also be shown for vehicles including weapons that can be masked into a slot"):
 // the same route answers kind 'vehicle' for a vehicle unit ({id, card}) or a vehicle file ({entity}, the 3D list's rows): its own
 // box as the grid, each item with slot (the weapon slot it is mounted in), own (false = a line of a file other vehicles share: shown,
 // not edited) and from; slots [{name, type, kind fixed | mask | closed, mask, weapon, accepts, canChange, why}] = its weapon places
 // (ext/units/kit.js has the engine rule: a slot's mask is a list of marks, an item goes in when it has every one of them).
 // POST /api/x/units/kit/slot {id, card | entity | breed, slot} -> the items that slot takes, as rows of the equipment browser.
 // The pending list has slots {name: item | false} too; a vehicle has no spread and nothing "in the hands". A soldier answers its
 // head and body slots the same way (shown with what fits; the soldier file fills them, this page does not change them)
 function ktLang(){try{return typeof LANG==='string'&&LANG?LANG:'en'}catch(e){return 'en'}}
 function ktP0(){return {add:[],del:[],inHands:null,slots:{}}}
 function kixRows(j){var a=(j.items||[]).map(function(x){
   return {label:x.item,value:x.item,name:x.name||'',kind:x.kind,loads:!!x.loads,w:x.w,h:x.h,group:x.group,heading:x.heading||'other',sub:x.sub||'',file:x.file||'',model:x.model||null,ammo:x.ammo||'',ammoName:x.ammoName||'',mag:x.mag||0,hint:'',lo:''}});
  a.groups=j.groups||[];a.nameLang=j.nameLang||'';return a}
 var KIX=once(function(ok,no){api('/api/x/units/kit/items',modBody({lang:ktLang()}),{what:tx('units.job.kitItems')}).then(function(j){ok(kixRows(j))}).catch(no)});
 // what a vehicle's box can hold: the same list with vehicle guns and shells
 var KIXV=once(function(ok,no){api('/api/x/units/kit/items',modBody({lang:ktLang(),vehicle:true}),{what:tx('units.job.kitItems')}).then(function(j){ok(kixRows(j))}).catch(no)});
 function ktVeh(){return !!(ktJ&&ktJ.kind==='vehicle')}
 function kix(){return ktVeh()?KIXV:KIX}
 function ktKind(k){return tk('units.kit.kind',k||'other')}
 var CELL=38;
 var ktIn=inp('units.kit.unit',{placeholder:tx('units.kit.unit.ph')}),ktAdd=inp('units.kit.add',{placeholder:tx('units.kit.add.ph')});
 var ktWho=null,ktJ=null,ktGrp=null,ktP=ktP0(),ktBase=[],ktSeq=0,ktSel=null,ktPics=null;
 var ktSay=el('div',{class:'hint',text:tx('units.kit.none')}),ktSquad=el('div',{class:'row',style:'flex-wrap:wrap;gap:6px'}),ktGrid=el('div',{style:'overflow-x:auto;max-width:100%'}),ktList=el('div'),ktPanel=el('div'),
  ktFit=el('div',{class:'hint',role:'status','aria-live':'polite'}),ktNotes=el('div'),ktBox=el('div'),ktFrom=el('div',{class:'hint'}),ktPend=el('span',{class:'hint'}),
  ktGridT=el('h4',{style:'margin:6px 0 4px'}),ktListT=el('div',{style:'font-weight:bold;margin:8px 0 2px'}),ktNmHint=el('span',{class:'hint'});
 var ktSlOpen=null,ktSlots=el('div'),ktSlT=el('h4',{style:'margin:10px 0 2px'}),ktSlListT=el('div',{style:'font-weight:bold;margin:8px 0 2px'}),ktSlStat=el('div',{class:'hint',role:'status','aria-live':'polite'}),ktSlRows=el('div');
 var ktSlIn=inp('units.kit.sl.find',{placeholder:tx('units.kit.sl.find.ph')});
 // searchKit: history 'units.kit.slot'; the list under the box is the index view (beside: typing narrows it live); index = what the
 // open slot takes; Browse = the item files of the game data (set/stuff): the picked file goes into the slot (the server refuses in
 // plain words what the slot does not take)
 var ktSlKit=searchKit(ktSlIn,{key:'units.kit.slot',beside:true,index:function(q,done){hits(ktSlA||[],q,done)},
  browse:{mode:'file',view:'data',start:'set/stuff',toValue:function(p){return String(p||'').replace(/\\/g,'/').split('/').pop().split('.').join(' ')}},
  onPick:function(v,it,from){var t=String((from!=='browse'&&it&&it.value)||v||'').trim().toLowerCase();if(!t||!ktSlOpen)return;
   // typed words only narrow the list; a row of the index, a file picked with Browse or a full item name goes into the slot
   if(from!=='browse'&&!(ktSlA||[]).some(function(x){return x.value===t}))return;
   ktSlIn.value='';ktSlSetQ('');ktSlPut(ktSlOpen,t)}});
 function ktSlSetQ(t){var q=String(t||'').trim().toLowerCase();if(q===ktSlQ)return;ktSlQ=q;var s=null;((ktJ&&ktJ.slots)||[]).forEach(function(x){if(x.name===ktSlOpen)s=x});if(s&&ktSlA)ktSlListDraw(s)}
 ktSlIn.addEventListener('input',function(){ktSlSetQ(ktSlIn.value)});
 var ktSlBlkT=blk('kit.slots-title',[ktSlT],{name:tx('units.kit.sl.h')}),ktSlBlk=blk('kit.slots',[ktSlots],{name:tx('units.kit.sl.h')}),
  ktSlListBlk=el('div',{blk:'kit.slot-list',box:'col','data-blkname':tx('units.kit.sl.listName')},[blk('kit.slot-title',[ktSlListT],{name:tx('units.kit.sl.listName')}),
   el('div',{class:'row',blk:'kit.slot-find',style:'flex-wrap:wrap','data-blkname':tx('units.kit.sl.find')},[ktSlKit.el]),blk('kit.slot-say',[ktSlStat],{name:tx('units.blk.state')}),blk('kit.slot-rows',[ktSlRows],{name:tx('units.kit.sl.listName')})]);
 ktSlBlkT.hidden=true;ktSlBlk.hidden=true;ktSlListBlk.hidden=true;
 // the names switch: on unless the user turned it off before (localStorage may be closed: then it is on for this visit)
 var ktNm=el('input',{type:'checkbox'});ktNm.checked=true;try{if(localStorage.getItem('as2gui.units.kit.names')==='0')ktNm.checked=false}catch(e){}
 function ktNamesOn(){return !!ktNm.checked}
 function ktNmChanged(){try{localStorage.setItem('as2gui.units.kit.names',ktNm.checked?'1':'0')}catch(e){}sNm.checked=ktNm.checked;nmSync();if(ktJ)ktDraw();kbNames();skNames()}
 sNm.checked=ktNm.checked;ktNm.addEventListener('change',ktNmChanged);
 // the name shown for an item: the game's when the switch is on and the game has one, else the file name
 function ktNm2(item,name){return ktNamesOn()&&name?name:item}
 function ktLabel(it){return ktNm2(it.item,it.name)}
 // the Add box's rows in the words of the names switch (the file name stays in the hint and can be typed too)
 function ktRelabel(a){var on=ktNamesOn();a.forEach(function(x){var nm=on&&x.name;x.label=nm?x.name:x.value;
  x.hint=(nm?x.value+'  ':'')+ktKind(x.kind)+'  '+tx('units.kit.cells',{w:x.w,h:x.h})+'  '+x.group;x.lo=(x.value+' '+x.name+' '+x.kind+' '+x.group+' '+(x.sub||'')).toLowerCase()});return a}
 // a count in words: one number, or the range the game rolls in
 function ktCount(it){return it.varies?tx('units.kit.varies',{a:it.min,b:it.max})+(it.chance!=null?' ('+it.chance+'%)':''):String(it.max)}
 function ktLoadSay(it){if(!it.loaded)return '';if(it.loaded==='ammo')return tx('units.kit.roundsOf',{n:it.rounds,a:ktNm2(it.ammo,it.ammoName)});return it.rounds!=null?tx('units.kit.rounds',{n:it.rounds}):tx('units.kit.loadedShort')}
 function ktCopy(o){return JSON.parse(JSON.stringify(o))}
 function ktSlotN(){return Object.keys(ktP.slots||{}).length}
 function ktDirty(){return !!(ktP.add.length||ktP.del.length||ktP.inHands!=null||ktSlotN())}
 function ktPendBody(){var p={add:ktCopy(ktP.add),del:ktP.del.slice()};if(ktP.inHands!=null)p.inHands=ktP.inHands;if(ktSlotN())p.slots=ktCopy(ktP.slots);return p}
 function ktClear(){clear(ktGrid);clear(ktList);clear(ktPanel);clear(ktNotes);clear(ktSquad);clear(ktSlots);ktSlT.textContent='';ktSlBlkT.hidden=true;ktSlBlk.hidden=true;ktSlListBlk.hidden=true;ktFit.textContent='';ktFit.className='hint';ktFrom.textContent='';ktGridT.textContent='';ktListT.textContent='';ktNmHint.textContent='';ktPendSay();kbSync()}
 function ktReset(){ktSeq++;ktWho=null;ktJ=null;ktGrp=null;ktP=ktP0();ktBase=[];ktSel=null;ktSlOpen=null;ktClear();clear(ktBox);skReset();resetWrites();ktSay.className='hint';ktSay.textContent=tx('units.kit.none')}
 // keep: the soldier is one of the group shown (a squad's soldier buttons stay; a vehicle's crew and its own "Vehicle" button stay)
 function ktPick(w,keep){var g=keep?ktGrp:null;ktReset();ktGrp=g;ktWho=w;ktIn.value=w.id||w.breed||w.entity||'';ktLoad(null)}
 // undo: the pending list to go back to when the server refuses this one (the refusal is shown, the drawing stays)
 function ktLoad(undo){if(!ktWho)return;var my=++ktSeq,b=modBody(ktCopy(ktWho));b.lang=ktLang();if(ktDirty())b.pending=ktPendBody();
  if(!ktJ){ktSay.className='hint';ktSay.textContent=tx('units.kit.loading')}
  api('/api/x/units/kit',b,{what:tx('units.job.kit')}).then(function(j){if(my!==ktSeq)return;ktSay.className='hint';ktSay.textContent='';
   if(j.soldiers&&j.kind!=='vehicle'){ktGrp=j;ktJ=null;ktClear();ktGroup();return}
   if(j.soldiers){j.who=ktCopy(ktWho);ktGrp=j}
   ktJ=j;if(!j.pending)ktBase=j.items.map(function(x){return x.item});ktDraw();skLoad()
  }).catch(function(e){if(my!==ktSeq)return;
   if(undo){ktP=undo;ktFit.className=e.cancelled?'hint':'err';ktFit.textContent=e.message;ktPendSay();ktPanelDraw();kbEcho();return}
   ktJ=null;ktClear();ktGroup();ktSay.className=e.cancelled?'hint':'err';ktSay.textContent=e.message})}
 // a squad or a vehicle: its soldiers as buttons
 function ktGroup(){clear(ktSquad);var j=ktGrp;if(!j)return;
  if(j.kind==='vehicle'){var von=ktVeh();if(!(j.soldiers||[]).length)return;
   ktSquad.appendChild(el('button',{type:'button','data-kitveh':'1','aria-pressed':von?'true':'false',class:von?'primary':null,text:tx('units.kit.veh.btn')+': '+(j.unit.name||j.unit.id),title:j.entity||'',onclick:function(){ktPick(j.who,true)}}))}
  else{if(!(j.soldiers||[]).length){ktSay.className='wzstat';ktSay.textContent=tx('units.kit.noSoldiers',{n:j.unit.name||j.unit.id});return}
   if(!ktJ&&!ktSay.textContent)ktSay.textContent=tx('units.kit.pickSoldier',{n:j.unit.name||j.unit.id})}
  j.soldiers.forEach(function(s){var on=!!(ktWho&&ktWho.id===s.id);
   ktSquad.appendChild(el('button',{type:'button','aria-pressed':on?'true':'false',class:on?'primary':null,text:(s.name||s.id)+(s.n>1?'  x'+s.n:''),title:s.id,onclick:function(){ktPick({id:s.id},true)}}))})}
 function ktItem(name){var f=null;((ktJ&&ktJ.items)||[]).forEach(function(x){if(!f&&x.item===name)f=x});return f}
 function ktState(it){var p=[it.left>0?tx('units.kit.st.left',{n:it.left}):tx('units.kit.st.ok')];if(it.inHands)p.push(tx('units.kit.st.held'));if(it.slot)p.push(tx('units.kit.st.slot',{s:it.slot}));if(it.own===false||it.macro)p.push(tx('units.kit.st.shared'));if(it.isNew)p.push(tx('units.kit.st.new'));if(!it.known)p.push(tx('units.kit.st.unknown'));return p.join(', ')}
 function ktFocus(item,list){var box=list?ktList:ktGrid,b=null;try{if(box.querySelector)b=box.querySelector('['+(list?'data-kitl':'data-kit')+'="'+String(item).replace(/["\\]/g,'')+'"]')}catch(e){b=null}if(b&&b.focus)b.focus()}
 function ktSelect(item,list){ktSel=item;ktDraw();ktFocus(item,list)}
 // the picture of a tile: asked from the one hidden 3D view, set when it is there (at once when it was made before)
 function ktPicsOf(){if(ktPics)return ktPics;var V=lkViewer();if(!V||typeof V.pictures!=='function')return null;ktPics=V.pictures({sig:dataSig,mod:curMod});return ktPics}
 function ktPicture(b,name,it,p){if(!it.model||!curMod())return;var P=null;try{P=ktPicsOf()}catch(e){P=null}if(!P)return;
  try{P.get(it.model,p.w*CELL*2,p.h*CELL*2,function(url){if(!url)return;
   var im=el('img',{src:url,alt:'','aria-hidden':'true',draggable:'false',style:'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;pointer-events:none'});
   try{name.style.display='none'}catch(e){}
   if(b.firstChild&&typeof b.insertBefore==='function')b.insertBefore(im,b.firstChild);else b.appendChild(im)})}catch(e){}}
 function ktDraw(){var j=ktJ;ktClear();ktGroup();if(!j)return;
  var veh=j.kind==='vehicle';
  ktFrom.textContent=(j.unit.name||j.unit.id)+' ('+(veh?j.entity:j.breed)+'). '+tx(j.from==='mod'?'units.kit.from.mod':'units.kit.from.game',{f:j.file});
  ktGridT.textContent=tx('units.kit.gridTitle',{n:j.unit.name||j.unit.id});ktListT.textContent=tx('units.kit.listTitle');
  ktNmHint.textContent=j.nameLang==='game'?tx('units.kit.names.game'):j.nameLang==='en'&&String(ktLang()||'en').toLowerCase().slice(0,2)!=='en'?tx('units.kit.names.en'):'';
  // the grid: one button per stack over the cells it covers, a dotted box per free cell
  var W=j.grid.w,H=j.grid.h,used={},seenV={},cells=0,MARK='position:absolute;font-size:10px;line-height:1.2;padding:0 2px;border-radius:2px;background:var(--card);';
  var g=el('div',{role:'group','aria-label':tx('units.kit.gridAria',{w:W,h:H}),style:'display:grid;grid-template-columns:repeat('+W+','+CELL+'px);grid-auto-rows:'+CELL+'px;width:'+(W*CELL)+'px;border:1px solid var(--line);background:var(--bg)'});
  j.pieces.forEach(function(p){var it=j.items[p.items[0]];cells+=p.w*p.h;for(var y=p.y;y<p.y+p.h;y++)for(var x=p.x;x<p.x+p.w;x++)used[x+','+y]=1;
   var held=p.items.some(function(i){return j.items[i].inHands}),on=p.items.some(function(i){return j.items[i].item===ktSel}),lab=ktLabel(it);
   // the count mark: a stack of several, or the range of a count the game rolls. The range is the whole item's, on its first
   // stack; the stacks after it are the room kept for the most (a plus sign)
   var vr=it.varies&&p.items.length===1,first=!seenV[it.item];if(vr)seenV[it.item]=1;
   var ct=vr?(first?it.min+'-'+it.max:'+'):p.count>1?String(p.count):'',cw=vr?ktCount(it):String(p.count),ls=ktLoadSay(it);
   var name=el('span',{style:'display:block;font-size:10px;line-height:1.1;overflow:hidden;word-break:break-word;padding-right:'+(ct?'14px':'0'),text:lab}),kids=[name];
   if(ct)kids.push(el('b',{style:MARK+'right:1px;top:1px;font-size:11px',text:ct}));
   if(it.rounds!=null)kids.push(el('span',{style:MARK+'left:1px;bottom:1px;color:var(--hint)',text:String(it.rounds)}));
   if(held)kids.push(el('span',{style:MARK+'right:1px;bottom:1px;font-weight:bold;color:var(--acc)',text:tx('units.kit.heldMark')}));
   // a weapon mounted in a slot: the slot's name on the tile, framed like the held item of a soldier
   if(it.slot){held=true;kids.push(el('span',{style:MARK+'right:1px;bottom:1px;font-weight:bold;color:var(--acc)',text:it.slot}))}
   var b=el('button',{type:'button','data-kit':it.item,'aria-pressed':on?'true':'false','aria-label':tx(vr?'units.kit.ariaVar':'units.kit.aria',{n:lab,c:cw,x:p.x+1,y:p.y+1,w:p.w,h:p.h})+(ls?', '+ls:'')+(it.slot?', '+tx('units.kit.st.slot',{s:it.slot}):held?', '+tx('units.kit.st.held'):''),
    title:lab+(lab!==it.item?'  ('+it.item+')':'')+'  '+ktKind(it.kind)+'  '+cw+(ls?'  '+ls:''),
    style:'grid-column:'+(p.x+1)+' / span '+p.w+';grid-row:'+(p.y+1)+' / span '+p.h+';position:relative;margin:0;padding:2px 3px;min-width:0;min-height:0;text-align:left;overflow:hidden;border-radius:3px;cursor:pointer;color:var(--fg);background:var('+(on?'--sel':'--card')+');border:'+(held?'2px solid var(--acc)':'1px solid var(--line)'),
    onclick:function(){ktSelect(it.item,false)}},kids);
   g.appendChild(b);ktPicture(b,name,it,p)});
  for(var y=0;y<H;y++)for(var x=0;x<W;x++)if(!used[x+','+y])g.appendChild(el('div',{'aria-hidden':'true',style:'grid-column:'+(x+1)+';grid-row:'+(y+1)+';border:1px dotted var(--line);box-sizing:border-box'}));
  if(W>0&&H>0)ktGrid.appendChild(g);else ktGrid.appendChild(el('div',{class:'wzstat',text:tx('units.kit.veh.nobox')}));
  // the same data as a list, for the keyboard and for screen readers: three columns, headers never break inside a word; the
  // kind, the cells and what is loaded sit as small lines under the name and the count
  var tb=el('tbody'),TD='padding:3px 10px 3px 0;vertical-align:top;text-align:left;word-break:normal;overflow-wrap:normal;hyphens:none;';
  j.items.forEach(function(it){var on=it.item===ktSel,lab=ktLabel(it),ls=ktLoadSay(it),c2=[el('div',{text:ktCount(it)})];
   if(ls)c2.push(el('div',{class:'hint',style:'font-size:11px',text:ls}));
   tb.appendChild(el('tr',{style:on?'background:var(--sel)':null},[
    el('td',{style:TD+'min-width:10em'},[el('button',{type:'button','data-kitl':it.item,'aria-pressed':on?'true':'false',text:lab,title:it.item,onclick:function(){ktSelect(it.item,true)}}),
     el('div',{class:'hint',style:'font-size:11px',text:(lab!==it.item?it.item+'  ':'')+ktKind(it.kind)+'  '+tx('units.kit.cells',{w:it.w,h:it.h})})]),
    el('td',{style:TD+'white-space:nowrap'},c2),el('td',{class:it.left>0?'err':null,style:TD+'min-width:7em',text:ktState(it)})]))});
  if(j.items.length)ktList.appendChild(el('div',{style:'overflow-x:auto;max-width:100%'},[el('table',{style:'border-collapse:collapse;width:auto;table-layout:auto'},[el('thead',{},[el('tr',{},['units.kit.col.item','units.by.count','units.kit.col.state'].map(function(k){return el('th',{style:TD+'white-space:nowrap',text:tx(k)})}))]),tb])]));
  else ktList.appendChild(el('div',{class:'hint',text:tx(veh?'units.kit.veh.empty':'units.kit.empty')}));
  if(!(W>0&&H>0)){ktFit.className='hint';ktFit.textContent=''}
  else if(j.notFit.length){ktFit.className='err';ktFit.textContent=tx('units.kit.nofit',{t:j.notFit.map(function(l){return ktNm2(l.item,l.name)+' x'+l.count}).join(', ')})}
  else{ktFit.className='ok';ktFit.textContent=tx('units.kit.fits',{used:cells,total:W*H})}
  function note(c,k,o){ktNotes.appendChild(el('div',{class:c,text:tx(k,o)}))}
  // the held item is removed: the hands go to the next weapon of the list, said before Preview
  if(j.handover)note('wzstat',j.handover.to?'units.kit.handover':'units.kit.handover.none',{a:ktNm2(j.handover.from,j.handover.fromName),b:ktNm2(j.handover.to||'',j.handover.toName)});
  if(j.otherLines)note('wzstat','units.kit.otherLines');if(j.macroItems)note('hint','units.kit.macroLines');
  if(j.items.some(function(x){return !x.known}))note('wzstat','units.kit.unknown');
  if(j.items.some(function(x){return x.varies}))note('hint','units.kit.spread');
  if(j.items.some(function(x){return x.known&&!x.sized}))note('hint','units.kit.guess');
  if(veh&&j.items.some(function(x){return x.own===false}))note('hint','units.kit.veh.sharedNote');
  note('hint',curMod()?'units.kit.nopic':'units.kit.nopic.nomod');
  ktSlotsDraw();ktPendSay();ktPanelDraw();kbEcho();kbStale()}
 // ---------- the slots: a vehicle's weapon places, a soldier's head and body ----------
 // one box per slot: the weapon in it (picture from its model, name, what it loads), what the slot takes in plain words, and
 // "Change weapon" = the list of what goes in (asked once per slot and data signature), searchable, with pictures
 function ktSlotPic(box,model,w,h){if(!model||!curMod())return;var P=null;try{P=ktPicsOf()}catch(e){P=null}if(!P)return;
  try{P.get(model,w*CELL*2,h*CELL*2,function(url){if(url&&box.isConnected!==false)box.appendChild(el('img',{src:url,alt:'',draggable:'false',style:'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain'}))})}catch(e){}}
 function ktSlotWhy(s,veh){var t=s.mask.join(' + ');
  if(!veh)return tx('units.kit.sl.man',{t:t,n:s.accepts});
  if(s.kind==='fixed')return tx('units.kit.sl.fixed',{n:s.accepts});
  if(s.kind==='mask')return tx('units.kit.sl.mask',{t:t,n:s.accepts});
  return tx(s.why==='noplace'?'units.kit.sl.noplace':s.why==='nomask'?'units.kit.sl.nomask':'units.kit.sl.noholder')}
 function ktSlotsDraw(){var j=ktJ,a=(j&&j.slots)||[],veh=ktVeh();clear(ktSlots);ktSlBlkT.hidden=!a.length;ktSlBlk.hidden=!a.length;
  if(!a.length){ktSlOpen=null;ktSlListBlk.hidden=true;return}
  ktSlT.textContent=tx(veh?'units.kit.sl.h':'units.kit.sl.hMan');
  ktSlots.appendChild(el('div',{class:'hint',text:tx(veh?'units.kit.sl.intro':'units.kit.sl.introMan')}));
  var wrap=el('div',{style:'display:grid;grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr));gap:8px;margin-top:4px'});
  a.forEach(function(s){var w=s.weapon,lab=w?ktNm2(w.item,w.name):tx('units.kit.sl.empty'),kids=[],txt=[],open=ktSlOpen===s.name,pend=(s.name in (ktP.slots||{}));
   var pic=el('div',{'aria-hidden':'true',style:'flex:0 0 64px;width:64px;height:48px;position:relative;border:1px solid var(--line);border-radius:3px;background:var(--bg)'});kids.push(pic);
   if(w&&w.model)ktSlotPic(pic,w.model,w.w,w.h);
   txt.push(el('div',{class:'hint',style:'font-size:11px',text:tx('units.kit.sl.slot',{s:s.name})+(s.type?'  ('+s.type+')':'')}));
   txt.push(el('b',{style:'display:block;overflow-wrap:anywhere',text:lab}));
   if(w&&lab!==w.item)txt.push(el('div',{class:'hint',style:'font-size:11px',text:w.item}));
   if(w&&!w.known)txt.push(el('div',{class:'wzstat',style:'font-size:11px',text:tx('units.kit.st.unknown')}));
   if(w&&w.ammo)txt.push(el('div',{class:'hint',style:'font-size:11px',text:w.rounds!=null?tx('units.kit.roundsOf',{n:w.rounds,a:ktNm2(w.ammo,w.ammoName)}):tx('units.kit.br.loads',{a:ktNm2(w.ammo,w.ammoName)})}));
   txt.push(el('div',{class:'hint',style:'font-size:11px',text:ktSlotWhy(s,veh)}));
   if(s.why==='shared')txt.push(el('div',{class:'hint',style:'font-size:11px',text:tx('units.kit.sl.shared',{f:s.shared||''})}));
   if(pend)txt.push(el('span',{class:'badge',text:tx('units.kit.st.new')}));
   var btns=[];
   if(s.kind!=='closed')btns.push(el('button',{type:'button','data-kslot':s.name,'aria-expanded':open?'true':'false',class:open?'primary':null,text:tx(open?'units.kit.sl.close':s.canChange?'units.kit.sl.change':'units.kit.sl.show'),'aria-label':tx(open?'units.kit.sl.close':s.canChange?'units.kit.sl.change':'units.kit.sl.show')+': '+s.name,
    onclick:function(){ktSlOpen=open?null:s.name;ktSlotsDraw();ktSlFocus(s.name)}}));
   if(s.kind==='mask'&&w&&s.canChange)btns.push(el('button',{type:'button','data-kslotout':s.name,text:tx('units.kit.veh.takeOut'),'aria-label':tx('units.kit.veh.takeOut')+': '+s.name,onclick:function(){ktEdit(function(){ktP.slots[s.name]=false})}}));
   if(w&&w.model&&S.screens.models&&S.screens.models.pick)btns.push(el('button',{type:'button',text:tx('units.kit.model'),'aria-label':tx('units.kit.model')+': '+lab,onclick:function(){show('models');S.screens.models.pick(w.model)}}));
   if(btns.length)txt.push(el('div',{class:'row',style:'flex-wrap:wrap;gap:4px;margin-top:4px'},btns));
   kids.push(el('div',{style:'flex:1 1 auto;min-width:0'},txt));
   wrap.appendChild(el('div',{role:'group','data-kslotbox':s.name,'aria-label':tx('units.kit.sl.slot',{s:s.name})+': '+lab,style:'display:flex;gap:8px;align-items:flex-start;border:'+(open?'2px solid var(--acc)':'1px solid var(--line)')+';border-radius:4px;padding:6px;min-width:0'},kids))});
  ktSlots.appendChild(wrap);
  var cur2=null;a.forEach(function(s){if(s.name===ktSlOpen)cur2=s});
  if(!cur2){ktSlOpen=null;ktSlListBlk.hidden=true;return}
  ktSlListBlk.hidden=false;ktSlListLoad(cur2)}
 function ktSlFocus(name){var b=null;try{if(ktSlots.querySelector)b=ktSlots.querySelector('[data-kslot="'+String(name).replace(/["\\]/g,'')+'"]')}catch(e){b=null}if(b&&b.focus)b.focus()}
 // the list of what the open slot takes: asked once per unit + slot + data signature, filtered by the typed words, a page at a time
 var KS_PAGE=12,ktSlA=null,ktSlKey='',ktSlQ='',ktSlSeq=0;
 function ktSlListLoad(s){var key=[dataSig(),JSON.stringify(ktWho),s.name].join('|');ktSlListT.textContent=tx('units.kit.sl.list',{s:s.name});
  if(key===ktSlKey&&ktSlA){ktSlListDraw(s);return}
  ktSlKey=key;ktSlA=null;clear(ktSlRows);ktSlStat.className='hint';ktSlStat.textContent=tx('units.kit.sl.loading');var my=++ktSlSeq,b=modBody(ktCopy(ktWho));b.slot=s.name;b.lang=ktLang();
  api('/api/x/units/kit/slot',b,{what:tx('units.job.kitSlot')}).then(function(r){if(my!==ktSlSeq)return;ktSlA=ktRelabel(kixRows(r));ktSlA.forEach(function(x){x._s=String(x.label).toLowerCase()});ktSlA.sort(kbCmp);ktSlListDraw(s)})
   .catch(function(e){if(my!==ktSlSeq)return;ktSlKey='';ktSlStat.className=e.cancelled?'hint':'err';ktSlStat.textContent=e.message})}
 function ktSlHits(){var ws=ktSlQ?ktSlQ.split(/\s+/):[];return (ktSlA||[]).filter(function(x){for(var i=0;i<ws.length;i++)if(x.lo.indexOf(ws[i])<0)return false;return true})}
 function ktSlListDraw(s){clear(ktSlRows);var all=ktSlA||[],rows=ktSlHits(),at=0,cur3=s.weapon?s.weapon.item:'';
  ktSlStat.className=rows.length?'hint':'wzstat';ktSlStat.textContent=!all.length?tx('units.kit.sl.nothing'):!rows.length?tx('units.kit.br.none'):tx('units.kit.sl.count',{n:rows.length,t:all.length});
  var ul=el('ul',{style:'list-style:none;margin:4px 0 6px;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr));gap:6px'}),more=el('button',{type:'button','data-kslmore':'1'});
  var fill=function(to){for(;at<to&&at<rows.length;at++)ul.appendChild(ktSlRow(s,rows[at],cur3));var left=rows.length-at;more.hidden=!left;more.textContent=left?tx('units.kit.br.more',{n:Math.min(left,KS_PAGE),left:left}):''};
  more.addEventListener('click',function(){fill(at+KS_PAGE)});fill(KS_PAGE);ktSlRows.appendChild(ul);ktSlRows.appendChild(more)}
 function ktSlRow(s,it,now){var lab=ktNm2(it.value,it.name),S11='font-size:11px;overflow-wrap:anywhere',kids=[],isNow=it.value===now;
  var pic=el('div',{'aria-hidden':'true',style:'flex:0 0 64px;width:64px;height:48px;position:relative;border:1px solid var(--line);border-radius:3px;background:var(--bg)'});kids.push(pic);ktSlotPic(pic,it.model,it.w,it.h);
  var txt=[el('b',{style:'display:block;overflow-wrap:anywhere',text:lab})];
  if(lab!==it.value)txt.push(el('div',{class:'hint',style:S11,text:it.value}));
  txt.push(el('div',{class:'hint',style:S11,text:ktKind(it.kind)+'  '+tx('units.kit.cells',{w:it.w,h:it.h})+'  '+it.group+(it.sub?'/'+it.sub:'')}));
  if(it.ammo)txt.push(el('div',{class:'hint',style:S11,text:tx(it.mag>1?'units.kit.br.loadsN':'units.kit.br.loads',{a:ktNm2(it.ammo,it.ammoName),n:it.mag})}));
  var btns=[];
  if(isNow)btns.push(el('span',{class:'badge',text:tx('units.kit.sl.now')}));
  else if(s.canChange)btns.push(el('button',{type:'button','data-kslput':it.value,text:tx('units.kit.sl.put'),'aria-label':tx('units.kit.sl.put')+': '+lab,onclick:function(){ktSlPut(s.name,it.value)}}));
  if(it.model&&S.screens.models&&S.screens.models.pick)btns.push(el('button',{type:'button',text:tx('units.kit.model'),'aria-label':tx('units.kit.model')+': '+lab,onclick:function(){show('models');S.screens.models.pick(it.model)}}));
  if(btns.length)txt.push(el('div',{class:'row',style:'flex-wrap:wrap;gap:4px;margin-top:4px'},btns));
  kids.push(el('div',{style:'flex:1 1 auto;min-width:0'},txt));
  return el('li',{'data-ksli':it.value,style:'display:flex;gap:8px;align-items:flex-start;border:1px solid var(--line);border-radius:4px;padding:6px;min-width:0'},kids)}
 // a weapon goes into a slot: one more pending change; the server says no in plain words when the slot does not take it
 function ktSlPut(slot,item){var s=null;((ktJ&&ktJ.slots)||[]).forEach(function(x){if(x.name===slot)s=x});
  if(!s||!s.canChange){ktFit.className='wzstat';ktFit.textContent=tx('units.kit.sl.cant');return}
  ktEdit(function(){ktP.slots[slot]=item})}
 function ktPendSay(){var n=ktP.add.length+ktP.del.length+(ktP.inHands!=null?1:0)+ktSlotN();ktPend.textContent=n?tx('units.kit.pend',{n:n}):'';if(ktUndo)ktUndo.hidden=!n}
 // one change of the pending list, then the server lays the inventory out again
 function ktEdit(fn){var undo=ktCopy(ktP);fn();resetWrites();clear(ktBox);ktLoad(undo)}
 // the parts of an item's line the user set (count, spread, filled, rounds, filling); drop: parts that no longer hold
 function ktPut(item,o,drop){var a=null;ktP.add.forEach(function(x){if(x.item===item)a=x});if(!a){a={item:item};ktP.add.push(a)}
  (drop||[]).forEach(function(k){delete a[k]});for(var k in o)a[k]=o[k]}
 function ktDrop(item){ktP.add=ktP.add.filter(function(x){return x.item!==item});if(ktBase.indexOf(item)>=0&&ktP.del.indexOf(item)<0)ktP.del.push(item);if(ktP.inHands===item)ktP.inHands=null;if(ktSel===item)ktSel=null}
 // the small panel of the picked item: count, spread, what is loaded and how many rounds, in or out of the hands, remove, its 3D model
 function ktPanelDraw(){clear(ktPanel);var it=ktSel?ktItem(ktSel):null,j=ktJ;
  if(!it){if(ktJ&&ktJ.items.length)ktPanel.appendChild(el('div',{class:'hint',text:tx('units.kit.sel')}));return}
  var lab=ktLabel(it),veh=ktVeh();
  // a line a shared file gives the vehicle: shown, not edited here
  if(veh&&it.own===false){var k0=[el('b',{text:lab}),el('div',{class:'hint',text:(lab!==it.item?it.item+'  ':'')+ktKind(it.kind)+'  '+tx('units.kit.cells',{w:it.w,h:it.h})}),el('div',{class:'wzstat',text:tx('units.kit.veh.shared',{f:it.from||''})})];
   if(it.model&&S.screens.models&&S.screens.models.pick)k0.push(el('div',{class:'row'},[el('button',{type:'button',text:tx('units.kit.model'),'aria-label':tx('units.kit.model')+' '+lab,onclick:function(){show('models');S.screens.models.pick(it.model)}})]));
   ktPanel.appendChild(el('div',{role:'group','aria-label':lab,style:'border:1px solid var(--line);border-radius:4px;padding:6px 8px'},k0));return}
  var cnt=el('input',{type:'number',min:'0',max:'9999',step:it.spread>0?'any':'1',value:String(it.n),style:'width:6em','aria-label':tx('units.by.count')+' '+lab});
  var spr=el('input',{type:'number',min:'0',max:'9999',step:'any',value:String(it.spread),style:'width:6em','aria-label':tx('units.kit.spreadBy')+' '+lab});
  cnt.addEventListener('change',function(){var v=parseFloat(cnt.value);if(!(v>=0&&v<=9999)){cnt.value=String(it.n);return}ktEdit(function(){ktPut(it.item,{count:v})})});
  spr.addEventListener('change',function(){var v=parseFloat(spr.value);if(!(v>=0&&v<=9999)){spr.value=String(it.spread);return}ktEdit(function(){ktPut(it.item,{spread:v})})});
  var info=(lab!==it.item?it.item+'  ':'')+ktKind(it.kind)+'  '+tx('units.kit.cells',{w:it.w,h:it.h})+(it.perStack>1?'  '+tx('units.kit.perStack',{n:it.perStack}):'')+(it.left>0?'  '+tx('units.kit.st.left',{n:it.left}):'');
  var rowKids=[el('label',{},[el('span',{class:'n',text:tx('units.by.count')+' '}),cnt])];if(!veh)rowKids.push(el('label',{},[el('span',{class:'n',text:tx('units.kit.spreadBy')+' '}),spr]));
  var kids=[el('b',{text:lab}),el('div',{class:'hint',text:info}),el('div',{class:'row',style:'flex-wrap:wrap'},rowKids)];
  // what the count means when the game rolls it
  if(it.varies)kids.push(el('div',{class:'hint',text:tx('units.kit.variesWhy',{a:it.min,b:it.max,n:it.n,s:it.spread})+(it.min===0?' '+tx('units.kit.variesNone'):'')+(it.chance!=null?' '+tx('units.kit.chance',{p:it.chance}):'')}));
  else if(it.spread>0)kids.push(el('div',{class:'hint',text:tx('units.kit.variesSame',{c:it.max,n:it.n,s:it.spread})}));
  // loaded: not, with the weapon's own ammunition (full, or a number of rounds), or with ammunition named on the line
  if(it.kind==='weapon'||it.own||it.loaded){var opts=[['',tx('units.kit.ld.none')]],seen={};
   if(it.own||it.loaded==='own')opts.push(['own',tx('units.kit.ld.own')+(it.own?' ('+ktNm2(it.own,it.ownName)+')':'')]);
   var ammo=function(i,n){if(!i||seen[i])return;seen[i]=1;opts.push(['ammo:'+i,tx('units.kit.ld.ammo',{a:ktNm2(i,n)})])};
   if(it.loaded==='ammo')ammo(it.ammo,it.ammoName);if(it.own)ammo(it.own,it.ownName);j.items.forEach(function(x){if(x.kind==='ammo')ammo(x.item,x.name)});
   var ld=sel('units.kit.ld',opts);ld.value=it.loaded==='ammo'?'ammo:'+it.ammo:it.loaded;
   ld.addEventListener('change',function(){var v=ld.value;ktEdit(function(){
    if(!v)ktPut(it.item,{filled:false},['filling','rounds']);else if(v==='own')ktPut(it.item,{filled:true,rounds:'full'},['filling']);
    else ktPut(it.item,{filling:v.slice(5),rounds:(it.loaded==='ammo'&&it.rounds)||it.ownRounds||it.rounds||1},['filled'])})});
   var lrow=[el('label',{},[el('span',{class:'n',text:tx('units.kit.ld')+' '}),ld])];
   // a vehicle's box line has no "filled N": a weapon loaded with its own ammunition starts with one full load
   if(it.loaded&&veh&&it.loaded==='own')lrow.push(el('span',{class:'hint',text:tx('units.kit.veh.oneLoad')}));
   else if(it.loaded){var own=it.loaded==='own',rd=el('input',{type:'number',min:'1',max:'99999',step:'1',value:own?(it.roundsSet!=null?String(it.roundsSet):''):String(it.rounds),placeholder:own?tx('units.kit.full'):null,style:'width:6em','aria-label':tx('units.kit.roundsIn')+' '+lab});
    rd.addEventListener('change',function(){var t=String(rd.value||'').trim(),v=parseInt(t,10);
     if(!t&&own){ktEdit(function(){ktPut(it.item,{filled:true,rounds:'full'},['filling'])});return}
     if(!(v>=1&&v<=99999)){rd.value=own?(it.roundsSet!=null?String(it.roundsSet):''):String(it.rounds);return}ktEdit(function(){ktPut(it.item,{rounds:v})})});
    lrow.push(el('label',{},[el('span',{class:'n',text:tx('units.kit.roundsIn')+' '}),rd]))}
   kids.push(el('div',{class:'row',style:'flex-wrap:wrap'},lrow));
   if(it.loaded==='own'&&it.roundsSet!=null&&it.rounds!=null&&it.rounds!==it.roundsSet)kids.push(el('div',{class:'hint',text:tx('units.kit.roundsCut',{n:it.rounds})}))}
  var btns=[];
  if(veh){if(it.slot){btns.push(el('span',{class:'badge',text:tx('units.kit.st.slot',{s:it.slot})}));
    btns.push(el('button',{type:'button',text:tx('units.kit.veh.takeOut'),'aria-label':tx('units.kit.veh.takeOut')+' '+lab,onclick:function(){ktEdit(function(){ktP.slots[it.slot]=false})}}))}}
  else if(it.inHands){btns.push(el('span',{class:'badge',text:tx('units.kit.st.held')}));
   btns.push(el('button',{type:'button',text:tx('units.kit.unhold'),'aria-label':tx('units.kit.unhold')+' '+lab,onclick:function(){ktEdit(function(){ktP.inHands=false})}}))}
  else btns.push(el('button',{type:'button',text:tx('units.kit.hold'),'aria-label':tx('units.kit.hold')+' '+lab,onclick:function(){ktEdit(function(){ktP.inHands=it.item})}}));
  btns.push(el('button',{type:'button',text:tx('units.by.remove'),'aria-label':tx('units.by.remove')+' '+lab,onclick:function(){ktEdit(function(){ktDrop(it.item)})}}));
  if(it.model&&S.screens.models&&S.screens.models.pick)btns.push(el('button',{type:'button',text:tx('units.kit.model'),'aria-label':tx('units.kit.model')+' '+lab,onclick:function(){show('models');S.screens.models.pick(it.model)}}));
  kids.push(el('div',{class:'row',style:'flex-wrap:wrap'},btns));
  ktPanel.appendChild(el('div',{role:'group','aria-label':lab,style:'border:1px solid var(--line);border-radius:4px;padding:6px 8px'},kids))}
 function ktAddIt(it){if(!ktJ){ktFit.className='wzstat';ktFit.textContent=tx('units.kit.none');kbEcho();return}
  if(ktItem(it.value)){var kl=kbLast;ktSelect(it.value,true);kbLast=kl;ktFit.className='wzstat';ktFit.textContent=tx(ktVeh()?'units.kit.veh.already':'units.kit.already',{n:ktNm2(it.value,it.name)});kbEcho();return}
  ktSel=it.value;ktEdit(function(){ktP.add.push(it.kind==='weapon'&&it.loads?{item:it.value,filled:true}:{item:it.value,count:1})})}
 // searchKit: history 'units.kit.unit', index = the soldiers of the unit index; Browse = the soldier files of the game data (set/breed)
 var ktKit=searchKit(ktIn,{key:'units.kit.unit',index:function(q,done){UIX(dataSig(),function(a){hits(a.filter(function(u){return u.kind==='soldier'||u.kind==='vehicle'}),q,done)})},
  browse:{mode:'file',view:'data',start:'set/breed',exts:['set'],toValue:function(p){var s=String(p||'').replace(/\\/g,'/'),i=s.toLowerCase().lastIndexOf('set/breed/');return (i>=0?s.slice(i+10):s).replace(/\.set$/i,'')}},
  onPick:function(v,it,from){if(from!=='browse'&&it&&it.value&&(it.kind==='soldier'||it.kind==='vehicle')){ktPick(it.card?{id:it.value,card:it.card}:{id:it.value});return}
   var lv=String(v||'').trim().toLowerCase();if(!lv)return;
   UIX(dataSig(),function(a){var f=null;a.forEach(function(u){if(!f&&(u.kind==='soldier'||u.kind==='vehicle')&&(u.value.toLowerCase()===lv||u.label.toLowerCase()===lv))f=u});if(f)ktPick({id:f.value,card:f.card});else ktPick({breed:lv})})}});
 // searchKit: history 'units.kit.add', index = the items a soldier can carry (POST /api/x/units/kit/items: weapons, ammunition, grenades,
 // other; the game's name or the file name as the names switch says, kind and cells in the hint; both names are searched);
 // Browse = the item files of the game data (set/stuff): the file name is the item's name
 var ktAddKit=searchKit(ktAdd,{key:'units.kit.add',index:function(q,done){kix()(dataSig(),function(a){hits(ktRelabel(a),q,done)})},
  browse:{mode:'file',view:'data',start:'set/stuff',toValue:function(p){return String(p||'').replace(/\\/g,'/').split('/').pop().split('.').join(' ')}},
  onPick:function(v,it,from){ktAdd.value='';if(from!=='browse'&&it&&it.value&&it.kind){ktAddIt(it);return}
   var lv=String(v||'').trim().toLowerCase();if(!lv)return;kix()(dataSig(),function(a){var f=null;a.forEach(function(x){if(!f&&(x.value===lv||x.name.toLowerCase()===lv))f=x});ktAddIt(f||{value:lv,name:'',kind:'other'})})}});
 function ktFromOpen(){if(!cur){ktSay.className='wzstat';ktSay.textContent=tx('units.pickone');return}ktPick(cur.card?{id:cur.id,card:cur.card}:{id:cur.id})}
 var ktUndo=el('button',{type:'button',hidden:true,text:tx('units.kit.undo'),onclick:function(){ktP=ktP0();resetWrites();clear(ktBox);ktLoad(null)}});
 var ktBtns=flow('/api/x/units/kit/set',function(){if(!ktWho||!ktJ)throw new Error(tx('units.kit.none'));if(!ktDirty())throw new Error(tx('units.kit.nochange'));
  var b=ktCopy(ktWho),p=ktPendBody();b.add=p.add;b.del=p.del;if(p.inHands!=null)b.inHands=p.inHands;if(p.slots)b.slots=p.slots;b.lang=ktLang();b.showNames=ktNamesOn();return b},ktBox,function(){ktP=ktP0();ktLoad(null)},{kind:'change'});
 // ---------- equipment browser (owner 2026-11-22: "search through equipment in an organized list with optional localization and 3d
 // images shown") ----------
 // Everything a soldier can carry, under headings (the server's groups: POST /api/x/units/kit/items -> items[].heading + groups, the
 // same answer the Add box reads, asked once per data signature: KIX). Works with no soldier picked (look an item up, copy its file
 // name, open its 3D model); with a soldier open "Add to this soldier" goes the Add box's way (ktAddIt) and the fits / does not
 // fit line of the grid is said again here.
 // - closed at first: nothing is asked and nothing is built until the list is opened or a word is typed (PERF K1)
 // - headings are closed until clicked; a search or a picked group opens them. An open heading builds KB_PAGE rows (KB_FIND while
 //   searching), "Show more" appends the next ones in place: never thousands of rows at once (Gates of Hell has 1,550 caps and helmets)
 // - one draw per frame (kbSoon); the filter runs over lower-case text made once (file name, game name, kind, folders)
 // - pictures: the picture cache of the grid (ktPicsOf, same size key). A row asks for its picture when it comes on screen
 //   (IntersectionObserver; without one only the first KB_NOIO rows of a draw ask), three asked at a time, rows that are gone are skipped
 // - names: the "Show game names" switch of the card; the other name is the small second line; both are searched whatever it shows
 var KB_PAGE=40,KB_FIND=12,KB_NOIO=12;
 var kbOn=false,kbA=null,kbSig=null,kbQ='',kbWords=[],kbG='',kbOpenG={},kbAdds=[],kbLast=null,kbPend=false,kbHeads={},kbJobs=[],kbBusy=0,kbRun=0,kbNoIO=0,kbIO,kbVeh=false;
 var kbFind=inp('units.kit.find',{placeholder:tx('units.kit.find.ph')});
 var kbSel=el('select',{'aria-label':tx('units.kit.br.group')},[el('option',{value:'',text:tx('units.kit.br.allNone')})]);
 var kbSay=el('div',{class:'hint',role:'status','aria-live':'polite'}),kbStat=el('div',{class:'hint'}),kbNote=el('div'),kbNoSol=el('div',{class:'hint',text:tx('units.kit.br.addNo')}),kbList=el('div');
 var kbBody=blk('kit.browse.list',[kbStat,kbNoSol,kbNote,kbList],{name:tx('units.kit.br.list')});kbBody.hidden=true;
 var kbTog=el('button',{type:'button','aria-expanded':'false',text:tx('units.kit.br.open'),onclick:function(){kbShow(!kbOn)}});
 function kbShow(on){kbOn=!!on;kbBody.hidden=!kbOn;kbTog.setAttribute('aria-expanded',kbOn?'true':'false');kbTog.textContent=tx(kbOn?'units.kit.br.close':'units.kit.br.open');if(kbOn)kbLoad()}
 // with a vehicle open the list is what a vehicle's box can hold (vehicle guns and shells too)
 function kbLoad(){var sig=dataSig(),veh=ktVeh();kbSig=sig;kbVeh=veh;if(!kbA){kbStat.className='hint';kbStat.textContent=tx('units.kit.br.loading')}
  (veh?KIXV:KIX)(sig,function(a){if(sig!==kbSig||sig!==dataSig()||veh!==kbVeh)return;kbA=a;kbPrep();kbGroups();kbDraw()})}
 // the data changed (another mod, another game, a write), or a vehicle is open in place of a soldier: the open list is read again
 function kbStale(){if(kbOn&&(kbSig!==dataSig()||kbVeh!==ktVeh()))kbLoad()}
 // labels in the words of the names switch, and the text the rows are sorted by
 function kbPrep(){var a=kbA||[],n=0;ktRelabel(a);a.forEach(function(x){x._s=String(x.label).toLowerCase();if(!x.name)n++});a.unnamed=n}
 function kbNames(){if(!kbA)return;kbPrep();if(kbOn)kbSoon()}
 function kbGroups(){var a=kbA||[],gs=a.groups||[],keep=false;clear(kbSel);kbSel.appendChild(el('option',{value:'',text:tx('units.kit.br.all',{n:a.length})}));
  gs.forEach(function(g){if(g.id===kbG)keep=true;kbSel.appendChild(el('option',{value:g.id,text:tk('units.kit.br.g',g.id)+' ('+g.n+')'}))});if(!keep)kbG='';kbSel.value=kbG}
 kbSel.addEventListener('change',function(){kbG=kbSel.value||'';kbOpenG={};if(!kbOn)kbShow(true);else kbSoon()});
 function kbSetQ(t){var q=String(t||'').trim().toLowerCase();if(q===kbQ)return;kbQ=q;kbWords=q?q.split(/\s+/):[];kbOpenG={};if(!kbOn){if(q)kbShow(true);return}kbSoon()}
 function kbSoon(){if(kbPend)return;kbPend=true;frame(function(){kbPend=false;kbDraw()})}
 function kbMatch(x){if(kbG&&x.heading!==kbG)return false;for(var i=0;i<kbWords.length;i++)if(x.lo.indexOf(kbWords[i])<0)return false;return true}
 function kbCmp(a,b){return a._s<b._s?-1:a._s>b._s?1:a.value<b.value?-1:a.value>b.value?1:0}
 function kbDraw(){kbRun++;kbJobs=[];kbNoIO=0;kbAdds=[];kbHeads={};clear(kbList);clear(kbNote);
  if(kbIO){try{kbIO.disconnect()}catch(e){}}
  var a=kbA;if(!a){kbStat.textContent='';return}
  var by={},n=0;for(var i=0;i<a.length;i++){var x=a[i];if(!kbMatch(x))continue;(by[x.heading]=by[x.heading]||[]).push(x);n++}
  var q=kbWords.length>0,ng=0;
  (a.groups||[]).forEach(function(g){var rows=by[g.id];if(!rows)return;ng++;kbList.appendChild(kbGroup(g,rows,q))});
  kbStat.className=n?'hint':'wzstat';
  kbStat.textContent=!a.length?tx('units.kit.br.empty'):!n?tx('units.kit.br.none'):(q||kbG)?tx('units.kit.br.found',{n:n,t:a.length}):tx('units.kit.br.count',{n:a.length,g:ng});
  function note(k,o){kbNote.appendChild(el('div',{class:'hint',text:tx(k,o)}))}
  if(a.length){
   if(!curMod())note('units.kit.br.picNoMod');
   if(a.nameLang==='game')note('units.kit.names.game');else if(a.nameLang==='en'&&String(ktLang()||'en').toLowerCase().slice(0,2)!=='en')note('units.kit.names.en');
   if(a.unnamed)note('units.kit.br.noName',{n:a.unnamed})}
  kbSync()}
 // one heading: a button that opens and closes it (its count beside the name), then its rows, a page at a time
 function kbGroup(g,rows,q){var open=kbOpenG[g.id]!=null?kbOpenG[g.id]:(q||kbG===g.id),lab=tk('units.kit.br.g',g.id);
  var hb=el('button',{type:'button','data-kbg':g.id,'aria-expanded':open?'true':'false','aria-label':tx('units.kit.br.groupAria',{g:lab,n:rows.length}),
   style:'display:block;width:100%;text-align:left;font-weight:bold;margin:4px 0 2px',text:(open?'- ':'+ ')+lab+' ('+rows.length+')',
   onclick:function(){kbOpenG[g.id]=!open;kbDraw();var b=kbHeads[g.id];if(b&&b.focus)b.focus()}});
  kbHeads[g.id]=hb;var sec=el('div',{role:'group','aria-label':lab},[hb]);if(!open)return sec;
  rows.sort(kbCmp);
  var at=0,ul=el('ul',{style:'list-style:none;margin:0 0 6px;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr));gap:6px'}),more=el('button',{type:'button','data-kbmore':g.id});
  var fill=function(to){for(;at<to&&at<rows.length;at++)ul.appendChild(kbRow(rows[at]));var left=rows.length-at;more.hidden=!left;more.textContent=left?tx('units.kit.br.more',{n:Math.min(left,KB_PAGE),left:left}):''};
  more.addEventListener('click',function(){fill(at+KB_PAGE);kbSync()});
  fill(q?KB_FIND:KB_PAGE);sec.appendChild(ul);sec.appendChild(more);return sec}
 // one item: picture (when it has a model and a mod folder is picked), name, the other name, kind, cells, folder, what it loads, actions
 function kbRow(it){var lab=ktNm2(it.value,it.name),other=lab!==it.value?it.value:'',S11='font-size:11px;overflow-wrap:anywhere',kids=[];
  if(it.model&&curMod()){var pic=el('div',{'aria-hidden':'true',style:'flex:0 0 64px;width:64px;height:48px;position:relative;border:1px solid var(--line);border-radius:3px;background:var(--bg)'});kids.push(pic);kbPic(pic,it)}
  var txt=[el('b',{style:'display:block;overflow-wrap:anywhere',text:lab})];
  if(other)txt.push(el('div',{class:'hint',style:S11,text:other}));
  txt.push(el('div',{class:'hint',style:S11,text:ktKind(it.kind)+'  '+tx('units.kit.cells',{w:it.w,h:it.h})+(it.sub?'  '+it.sub:'')}));
  if(it.ammo)txt.push(el('div',{class:'hint',style:S11,text:tx(it.mag>1?'units.kit.br.loadsN':'units.kit.br.loads',{a:ktNm2(it.ammo,it.ammoName),n:it.mag})}));
  var addK=kbVeh?'units.kit.br.addToVeh':'units.kit.br.addTo',add=el('button',{type:'button','data-kba':it.value,text:tx(addK),'aria-label':tx(addK)+': '+lab,onclick:function(){kbLast=it;ktAddIt(it)}}),btns=[add];
  kbAdds.push(add);
  if(it.model&&S.screens.models&&S.screens.models.pick)btns.push(el('button',{type:'button',text:tx('units.kit.model'),'aria-label':tx('units.kit.model')+': '+lab,onclick:function(){show('models');S.screens.models.pick(it.model)}}));
  btns.push(el('button',{type:'button','data-kbc':it.value,text:tx('units.kit.br.copy'),title:it.file,'aria-label':tx('units.kit.br.copy')+': '+it.value,onclick:function(){kbCopy(it.value)}}));
  txt.push(el('div',{class:'row',style:'flex-wrap:wrap;gap:4px;margin-top:4px'},btns));
  kids.push(el('div',{style:'flex:1 1 auto;min-width:0'},txt));
  return el('li',{'data-kbi':it.value,style:'display:flex;gap:8px;align-items:flex-start;border:1px solid var(--line);border-radius:4px;padding:6px;min-width:0'},kids)}
 // "Add to this soldier" works when a soldier is open; without one the line above the list says what to do
 function kbSync(){var on=!!ktJ,a=kbAdds||[];for(var i=0;i<a.length;i++){a[i].disabled=!on;a[i].title=on?'':tx('units.kit.br.addNo')}if(kbNoSol)kbNoSol.hidden=on}
 // after an add from a row: the grid's own fits / does not fit line (or its refusal), said here beside the list
 function kbEcho(){var it=kbLast;if(!it)return;kbLast=null;kbSay.className=ktFit.className||'hint';kbSay.textContent=ktNm2(it.value,it.name)+': '+ktFit.textContent}
 function kbCopy(t){var ok=function(){kbSay.className='ok';kbSay.textContent=tx('units.kit.br.copied',{t:t})},no=function(){kbSay.className='wzstat';kbSay.textContent=tx('units.kit.br.copyNo',{t:t})};
  try{if(typeof navigator!=='undefined'&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(ok,no);return}}catch(e){}no()}
 // pictures, lazily: a row on screen puts a job in the line, three are asked at a time, a job whose row is gone is dropped
 function kbObs(){if(kbIO!==undefined)return kbIO;kbIO=null;
  try{if(typeof IntersectionObserver==='function')kbIO=new IntersectionObserver(function(es){es.forEach(function(e){var j=e.target._kb;if(!e.isIntersecting||!j)return;e.target._kb=null;kbIO.unobserve(e.target);kbJobs.push(j)});kbPump()},{rootMargin:'150px'})}catch(e){kbIO=null}
  return kbIO}
 function kbPic(box,it){var j={box:box,it:it,run:kbRun},io=kbObs();if(io){box._kb=j;io.observe(box)}else if(kbNoIO++<KB_NOIO){kbJobs.push(j);kbPump()}}
 function kbPump(){while(kbBusy<3&&kbJobs.length){var j=kbJobs.shift();if(j.run!==kbRun||j.box.isConnected===false)continue;kbBusy++;kbAsk(j)}}
 function kbAsk(j){var done=false,t=null,fin=function(url){if(done)return;done=true;if(t)clearTimeout(t);kbBusy--;
   if(url&&j.box.isConnected!==false)j.box.appendChild(el('img',{src:url,alt:'',draggable:'false',style:'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain'}));kbPump()};
  var P=null;try{P=ktPicsOf()}catch(e){P=null}if(!P){fin(null);return}
  t=setTimeout(function(){fin(null)},30000);
  try{P.get(j.it.model,j.it.w*CELL*2,j.it.h*CELL*2,fin)}catch(e){fin(null)}}
 // searchKit: history 'units.kit.find'; the list under the box is the index view (beside: typing narrows it live, both names are
 // searched); the kit's own index is the same item list as the Add box; Browse = the item files of the game data (set/stuff, whose
 // folders are the game's own groups): the picked file's name becomes the search
 var kbKit=searchKit(kbFind,{key:'units.kit.find',beside:true,index:function(q,done){kix()(dataSig(),function(a){hits(ktRelabel(a),q,done)})},
  browse:{mode:'file',view:'data',start:'set/stuff',toValue:function(p){return String(p||'').replace(/\\/g,'/').split('/').pop().split('.').join(' ')}},
  onPick:function(v){var t=String(v||'').trim();kbFind.value=t;kbSetQ(t);if(!kbOn)kbShow(true)}});
 kbFind.addEventListener('input',function(){kbSetQ(kbFind.value)});
 kbFind.addEventListener('change',function(){kbSetQ(kbFind.value)});
 // ---------- the look of the open soldier or vehicle: skin and texture variant (owner 2026-11-22: "Allow changing of tex mods
 // and skins as well") ----------
 // POST /api/x/units/look {id, card | breed | entity} -> skin {name, known, sub, wornBy, canChange, why} (a soldier) and texmod
 // {supported, current, variants [{name, textures}], textures, aliases, canChange, why}. POST /api/x/units/look/skins -> every skin by
 // army (asked once per data signature, when the list is opened or a word is typed). POST /api/x/units/look/set {.., skin?, texmod?
 // (a name | false), write} -> the same preview / write answer as the equipment (rows skin, texmod). Engine rules: ext/units/look.js.
 // - a soldier's variant is a line of his skin's file, which other soldiers wear too: the server never edits that file, it points
 //   the soldier to a twin of it (one that exists, or a new one). So a variant is picked for the skin the soldier wears now; a
 //   newly picked skin is written first
 // - Gates of Hell: a soldier has no variant line (a plain line says so); skins and a vehicle's variant work the same way
 // - the list: headings (army; Gates of Hell: army / uniform folder) closed until clicked, SK_PAGE rows at a time, a picture per row
 //   from the picture cache of the grid (ktPicsOf) when the row comes on screen, two asked at a time
 // - "Show in 3D": the line-up picture of this unit with the picked skin and variant (lineup body look {skin, variant, of})
 // - the picture in the block (kit.skin.view): this one soldier or vehicle alone (look {of, only}) with the skin and variant picked
 //   here, drawn when the block is on screen. Its own select changes the picture only (skView; null = follow the pick above),
 //   also where the variant cannot be written (a Gates of Hell soldier). "Open in Models" takes the model and that variant along
 var SK_PAGE=40,SK_FIND=12;
 var skJ=null,skKey=null,skSeq=0,skSkin=null,skTex=null,skOn=false,skA=null,skSig=null,skQ='',skWords=[],skG='',skOpenG={},skPend=false,skRun=0,skJobs=[],skBusy=0,skIO,skNoIO=0,skIOSeen=false,skView=null,sk3V=null,sk3Key='',sk3Sig='';
 var skSay=el('div',{class:'hint',role:'status','aria-live':'polite'}),skNow=el('div'),skTexBox=el('div'),skPick=el('span',{class:'hint'}),skRes=el('div'),skNotes=el('div');
 var skIn=inp('units.sk.find',{placeholder:tx('units.sk.find.ph')}),skSel=el('select',{'aria-label':tx('units.sk.group')},[el('option',{value:'',text:tx('units.sk.allNone')})]);
 var skStat=el('div',{class:'hint'}),skList=el('div'),skBody=blk('kit.skin.list',[skStat,skList],{name:tx('units.sk.list')});skBody.hidden=true;
 var skTog=el('button',{type:'button','aria-expanded':'false',text:tx('units.sk.open'),onclick:function(){skShow(!skOn)}});
 var skTexSel=el('select',{'aria-label':tx('units.sk.tex')});
 var skVSel=el('select',{'aria-label':tx('units.sk.viewSel')}),skVHint=el('span',{class:'hint'}),skVLinks=el('span'),skVMod=el('div',{class:'wzstat',text:tx('units.sk.viewNeedMod')}),sk3Box=el('div');
 var SKX=once(function(ok,no){api('/api/x/units/look/skins',modBody({lang:ktLang()}),{what:tx('units.job.skins')}).then(function(j){var a=(j.skins||[]).map(function(x){
   return {label:x.skin,value:x.skin,group:x.group,sub:x.sub,file:x.file,texmod:x.texmod||'',worn:x.worn||0,by:x.by||[],hint:'',lo:''}});a.groups=j.groups||[];ok(skRelabel(a))}).catch(no)});
 // who wears a skin: the soldiers' game names when the names switch is on and the game has one, else their file names
 function skWorn(x){if(!x.worn)return tx('units.sk.wornNone');return tx('units.sk.worn',{n:x.worn,by:x.by.map(function(b){return ktNm2(b.id,b.name)}).join(', ')+(x.worn>x.by.length?' ...':'')})}
 function skRelabel(a){a.forEach(function(x){x.hint=x.sub+(x.texmod?'  '+tx('units.sk.rowTex',{v:x.texmod}):'')+'  '+skWorn(x);
  x.lo=(x.value+' '+x.group+' '+x.sub+' '+x.texmod+' '+x.by.map(function(b){return b.id+' '+(b.name||'')}).join(' ')).toLowerCase()});return a}
 function skNames(){if(skA){skRelabel(skA);if(skOn)skSoon()}}
 function skShow(on){skOn=!!on;skBody.hidden=!skOn;skTog.setAttribute('aria-expanded',skOn?'true':'false');skTog.textContent=tx(skOn?'units.sk.close':'units.sk.open');if(skOn)skLoadList()}
 function skLoadList(){var sig=dataSig();skSig=sig;if(!skA){skStat.className='hint';skStat.textContent=tx('units.sk.loading')}
  SKX(sig,function(a){if(sig!==skSig||sig!==dataSig())return;skA=a;skGroups();skDrawList()})}
 function skStale(){if(skOn&&skSig!==dataSig())skLoadList()}
 function skGroups(){var a=skA||[],keep=false;clear(skSel);skSel.appendChild(el('option',{value:'',text:tx('units.sk.all',{n:a.length})}));
  (a.groups||[]).forEach(function(g){if(g.group===skG)keep=true;skSel.appendChild(el('option',{value:g.group,text:g.group+' ('+g.n+')'}))});if(!keep)skG='';skSel.value=skG}
 skSel.addEventListener('change',function(){skG=skSel.value||'';skOpenG={};if(!skOn)skShow(true);else skSoon()});
 function skSetQ(t){var q=String(t||'').trim().toLowerCase();if(q===skQ)return;skQ=q;skWords=q?q.split(/\s+/):[];skOpenG={};if(!skOn){if(q)skShow(true);return}skSoon()}
 function skSoon(){if(skPend)return;skPend=true;frame(function(){skPend=false;skDrawList()})}
 function skMatch(x){if(skG&&x.group!==skG)return false;for(var i=0;i<skWords.length;i++)if(x.lo.indexOf(skWords[i])<0)return false;return true}
 function skHead(hk){var p=hk.split('/');return p.length>1?p[0].replace(/[\[\]]/g,'')+' / '+p.slice(1).join(' / '):hk}
 function skDrawList(){skRun++;skJobs=[];skNoIO=0;clear(skList);if(skIO){try{skIO.disconnect()}catch(e){}}
  var a=skA;if(!a){skStat.textContent='';return}
  var by={},order=[],n=0;for(var i=0;i<a.length;i++){var x=a[i];if(!skMatch(x))continue;var hk=x.sub.indexOf('/')>=0?x.sub:x.group;if(!by[hk]){by[hk]=[];order.push(hk)}by[hk].push(x);n++}
  var q=skWords.length>0;
  order.forEach(function(hk){skList.appendChild(skGroupEl(hk,by[hk],q,order.length===1))});
  skStat.className=n?'hint':'wzstat';
  skStat.textContent=!a.length?tx('units.sk.empty'):!n?tx('units.sk.none'):(q||skG)?tx('units.sk.found',{n:n,t:a.length}):tx('units.sk.count',{n:a.length,g:order.length});skIoCheck()}
 function skGroupEl(hk,rows,q,only){var open=skOpenG[hk]!=null?skOpenG[hk]:(q||only),lab=skHead(hk);
  var hb=el('button',{type:'button','data-skg':hk,'aria-expanded':open?'true':'false','aria-label':tx('units.kit.br.groupAria',{g:lab,n:rows.length}),
   style:'display:block;width:100%;text-align:left;font-weight:bold;margin:4px 0 2px',text:(open?'- ':'+ ')+lab+' ('+rows.length+')',onclick:function(){skOpenG[hk]=!open;skDrawList()}});
  var sec=el('div',{role:'group','aria-label':lab},[hb]);if(!open)return sec;
  var at=0,ul=el('ul',{style:'list-style:none;margin:0 0 6px;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr));gap:6px'}),more=el('button',{type:'button','data-skmore':hk});
  var fill=function(to){for(;at<to&&at<rows.length;at++)ul.appendChild(skRow(rows[at]));var left=rows.length-at;more.hidden=!left;more.textContent=left?tx('units.kit.br.more',{n:Math.min(left,SK_PAGE),left:left}):''};
  more.addEventListener('click',function(){fill(at+SK_PAGE);skIoCheck()});
  fill(q?SK_FIND:SK_PAGE);sec.appendChild(ul);sec.appendChild(more);return sec}
 // one skin: picture (when a mod folder is picked), file name, folder and the variant its file names, who wears it, actions
 function skCan(){return !!(skJ&&skJ.kind==='soldier'&&skJ.skin&&skJ.skin.canChange)}
 function skRow(x){var S11='font-size:11px;overflow-wrap:anywhere',kids=[],now=!!(skJ&&skJ.skin&&skJ.skin.name===x.value),on=skSkin===x.value;
  if(curMod()){var pic=el('div',{'aria-hidden':'true',style:'flex:0 0 56px;width:56px;height:84px;position:relative;border:1px solid var(--line);border-radius:3px;background:var(--bg)'});kids.push(pic);skPic(pic,x)}
  var txt=[el('b',{style:'display:block;overflow-wrap:anywhere',text:x.value+(now?'  ('+tx('units.sk.cur')+')':'')})];
  txt.push(el('div',{class:'hint',style:S11,text:x.sub+(x.texmod?'  '+tx('units.sk.rowTex',{v:x.texmod}):'')}));
  txt.push(el('div',{class:'hint',style:S11,text:skWorn(x)}));
  var can=skCan(),use=el('button',{type:'button','data-sku':x.value,class:on?'primary':null,'aria-pressed':on?'true':'false',text:tx(on?'units.sk.used':'units.sk.use'),'aria-label':tx('units.sk.use')+': '+x.value,onclick:function(){skUse(x.value)}}),btns=[use];
  use.disabled=!can||now;if(!can)use.title=tx('units.sk.useNo');
  if(S.screens.models&&S.screens.models.pick)btns.push(el('button',{type:'button',text:tx('units.kit.model'),'aria-label':tx('units.kit.model')+': '+x.value,onclick:function(){show('models');S.screens.models.pick(x.value)}}));
  txt.push(el('div',{class:'row',style:'flex-wrap:wrap;gap:4px;margin-top:4px'},btns));
  kids.push(el('div',{style:'flex:1 1 auto;min-width:0'},txt));
  return el('li',{'data-ski':x.value,style:'display:flex;gap:8px;align-items:flex-start;border:1px solid var(--line);border-radius:4px;padding:6px;min-width:0'},kids)}
 function skObs(){if(skIO!==undefined)return skIO;skIO=null;
  try{if(typeof IntersectionObserver==='function')skIO=new IntersectionObserver(function(es){skIOSeen=true;es.forEach(function(e){var j=e.target._sk;if(!e.isIntersecting||!j)return;e.target._sk=null;skIO.unobserve(e.target);skJobs.push(j)});skPump()},{rootMargin:'150px'})}catch(e){skIO=null}
  return skIO}
 function skPic(box,x){var j={box:box,x:x,run:skRun},io=skObs();if(io){box._sk=j;io.observe(box)}else if(skNoIO++<SK_FIND){skJobs.push(j);skPump()}}
 // a page that is not painted (a hidden pane) gets no call of the observer: the first SK_FIND rows are drawn anyway
 function skIoCheck(){if(!skIO||skIOSeen)return;var my=skRun;setTimeout(function(){if(skIOSeen||my!==skRun)return;var b=skList.querySelectorAll?skList.querySelectorAll('li > div[aria-hidden]'):[];
  for(var i=0;i<b.length&&i<SK_FIND;i++){var j=b[i]._sk;if(j){b[i]._sk=null;skJobs.push(j)}}skPump()},1500)}
 function skPump(){while(skBusy<2&&skJobs.length){var j=skJobs.shift();if(j.run!==skRun||j.box.isConnected===false)continue;skBusy++;skAsk(j)}}
 function skAsk(j){var done=false,t=null,fin=function(url){if(done)return;done=true;if(t)clearTimeout(t);skBusy--;
   if(url&&j.box.isConnected!==false)j.box.appendChild(el('img',{src:url,alt:'',draggable:'false',style:'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain'}));skPump()};
  var P=null;try{P=ktPicsOf()}catch(e){P=null}if(!P){fin(null);return}
  t=setTimeout(function(){fin(null)},30000);
  try{P.get(j.x.value,112,168,fin,undefined,j.x.texmod||'')}catch(e){fin(null)}}
 // a picked skin waits like an equipment edit: Preview, then Write. Picking the skin worn now takes the pick back
 function skUse(name){if(!skCan()){skPickSay();return}skSkin=name===skJ.skin.name?null:name;skTex=null;skView=null;resetWrites();clear(skRes);skDraw();if(skOn)skSoon()}
 // searchKit: history 'units.kit.skin'; the list under the box is the index view (beside: typing narrows it live); index = every
 // skin (name, army, folder, who wears it); Browse = the skin files of the game data (entity/humanskin): the picked file is the pick
 var skKit=searchKit(skIn,{key:'units.kit.skin',beside:true,index:function(q,done){SKX(dataSig(),function(a){hits(a,q,done)})},
  browse:{mode:'file',view:'data',start:'entity/humanskin',toValue:function(p){return String(p||'').replace(/\\/g,'/').split('/').pop().replace(/\.[a-z0-9]+$/i,'')}},
  onPick:function(v,it,from){var t=String((from!=='browse'&&it&&it.value)||v||'').trim().toLowerCase();if(!t)return;skIn.value=t;skSetQ(t);if(!skOn)skShow(true);
   if(from==='browse'||(it&&it.value))SKX(dataSig(),function(a){if(a.some(function(x){return x.value===t})&&skCan()&&skJ.skin.name!==t&&skSkin!==t)skUse(t)})}});
 skIn.addEventListener('input',function(){skSetQ(skIn.value)});
 skIn.addEventListener('change',function(){skSetQ(skIn.value)});
 function skWhy(w){return w?tk('units.sk.why',w):''}
 function skDirty(){return skSkin!==null||skTex!==null}
 var skUndo=el('button',{type:'button',hidden:true,text:tx('units.kit.undo'),onclick:function(){skSkin=null;skTex=null;skView=null;resetWrites();clear(skRes);skDraw();if(skOn)skSoon()}});
 function skPickSay(){var p=[];if(skSkin!==null)p.push(tx('units.sk.pickSkin',{s:skSkin}));if(skTex!==null)p.push(skTex?tx('units.sk.pickTex',{v:skTex}):tx('units.sk.pickTexNone'));
  skPick.textContent=p.length?p.join('  '):tx('units.sk.pickNone');skUndo.hidden=!p.length}
 function skDraw(){var j=skJ;clear(skNow);clear(skTexBox);clear(skNotes);if(!j)return;var veh=j.kind==='vehicle',t=j.texmod||{};
  function note(k,o,cls){skNotes.appendChild(el('div',{class:cls||'hint',text:tx(k,o)}))}
  skFind.hidden=veh;skFind.style.display=veh?'none':'';if(veh&&skOn)skShow(false);
  if(veh)skNow.appendChild(el('div',{class:'hint',text:tx('units.sk.vehNoSkin')}));
  else{var s=j.skin||{},kids=[el('b',{text:s.name?tx('units.sk.now',{s:s.name}):tx('units.sk.nowNone')})];
   if(s.name&&s.sub)kids.push(el('span',{class:'hint',text:s.sub}));
   if(s.name&&s.known&&S.screens.models&&S.screens.models.pick)kids.push(el('button',{type:'button',text:tx('units.kit.model'),'aria-label':tx('units.kit.model')+': '+s.name,onclick:function(){show('models');S.screens.models.pick(s.name)}}));
   skNow.appendChild(el('div',{class:'row',style:'flex-wrap:wrap;gap:8px'},kids));
   if(s.name&&!s.known)skNow.appendChild(el('div',{class:'wzstat',text:tx('units.sk.lost',{s:s.name})}));
   if(s.wornBy>1)skNow.appendChild(el('div',{class:'hint',text:tx('units.sk.shared',{n:s.wornBy-1})}));
   if(!s.canChange)skNow.appendChild(el('div',{class:'wzstat',text:skWhy(s.why)}))}
  if(t.supported===false)skTexBox.appendChild(el('div',{class:'hint',text:skWhy(t.why)}));
  else{var vs=t.variants||[];clear(skTexSel);
   skTexSel.appendChild(el('option',{value:'',text:tx('units.sk.texNone')}));
   vs.forEach(function(v){skTexSel.appendChild(el('option',{value:v.name,text:skVarLab(v,t)}))});
   if(t.current&&!vs.some(function(v){return v.name===t.current}))skTexSel.appendChild(el('option',{value:t.current,text:t.current}));
   skTexSel.value=skTex!==null?skTex:(t.current||'');skTexSel.disabled=!t.canChange||skSkin!==null;
   skTexBox.appendChild(el('div',{class:'row',style:'flex-wrap:wrap;gap:8px'},[el('span',{class:'n',text:tx('units.sk.tex')}),skTexSel,el('span',{class:'hint',text:t.current?tx('units.sk.texNow',{v:t.current}):tx('units.sk.texNowNone')})]));
   if(!vs.length)note('units.sk.texNoFiles');
   if(t.current&&t.known===false)note('units.sk.texLost',{v:t.current},'wzstat');
   if(!t.canChange&&t.why)skNotes.appendChild(el('div',{class:'wzstat',text:skWhy(t.why)}));
   else if(skSkin!==null)note('units.sk.texAfterSkin');
   var gs=!veh&&isGoh();
   if(!veh&&t.canChange)note(gs?'units.sk.gohAlways':'units.sk.texSoldier');
   if((t.aliases||[]).length)note('units.sk.texAliases',{a:t.aliases.map(function(p){return p[0]+' = '+p[1]}).join(', ')});
   if(gs){note('units.sk.why.goh');skSeasons(t.season,note)}else note(isGoh()?'units.sk.texMapGoh':'units.sk.texMap')}
  skPickSay();skViewFill()}
 // a variant in the selects: how many of the model's textures have it and, in GoH, how many meshes it swaps (<mesh>#name.ply)
 function skVarLab(x,t){return x.name+'  ('+tx('units.sk.texN',{n:x.textures,t:t.textures||0})+(x.meshes?', '+tx('units.sk.texMeshes',{n:x.meshes}):'')+')'}
 // GoH: the seasons the multiplayer maps give their units ({texMod x} of map/multi/<map>/<mode>.info, server look.js gohSeasons)
 function skSeasons(se,note){if(!se||!(se.seasons||[]).length)return;note('units.sk.gohMaps',{list:se.seasons.map(function(x){return tx('units.sk.gohMapsN',{s:x.name,n:x.modes,m:x.maps,ex:x.ex.join(', ')})}).join('; ')})}
 skTexSel.addEventListener('change',function(){if(!skJ||!skJ.texmod)return;var v=skTexSel.value||'';skTex=v===(skJ.texmod.current||'')?null:v;skView=null;resetWrites();clear(skRes);skPickSay();skViewFill()});
 // the picture of the block. skViewNow: the variant it shows = the one picked for the picture, else the one picked to write, else the
 // file's. A newly picked skin is shown with the variant its own file names (its variants are not known here)
 function skViewNow(){var t=(skJ&&skJ.texmod)||{};return skView!==null?skView:skTex!==null?skTex:(t.current||'')}
 function skViewModel(){var j=skJ;if(!j)return '';if(j.kind==='vehicle')return j.entity||j.target||'';return skSkin!==null?skSkin:((j.skin&&j.skin.known&&j.skin.name)||'')}
 function skViewFill(){var j=skJ;if(!j)return;var t=j.texmod||{},vs=t.variants||[],v=skViewNow();clear(skVSel);
  skVSel.appendChild(el('option',{value:'',text:tx('units.sk.texNone')}));
  vs.forEach(function(x){skVSel.appendChild(el('option',{value:x.name,text:skVarLab(x,t)}))});
  if(v&&!vs.some(function(x){return x.name===v}))skVSel.appendChild(el('option',{value:v,text:v}));
  skVSel.value=skSkin!==null?'':v;skVSel.disabled=skSkin!==null;skVHint.textContent=tx(skSkin!==null?'units.sk.viewSkin':'units.sk.viewHint');skVMod.hidden=!!curMod();
  clear(skVLinks);var m=skViewModel();
  if(m&&S.screens.models&&S.screens.models.pick)skVLinks.appendChild(el('button',{type:'button',text:tx('units.sk.inModels'),'aria-label':tx('units.sk.inModels')+': '+m,
   onclick:function(){show('models');S.screens.models.pick(m,skSkin!==null?undefined:{variant:skViewNow()})}}));
  sk3()}
 skVSel.addEventListener('change',function(){if(!skJ)return;skView=skVSel.value||'';sk3()});
 function sk3Body(){var lk={of:skJ.target,only:true,kind:skJ.kind},b={id:ktWho.id||skJ.entity||skJ.unit.id};if(ktWho.card)b.card=ktWho.card;
  if(skSkin!==null)lk.skin=skSkin;else{var v=skViewNow();lk.variant=v?v:false}b.look=lk;return modBody(b)}
 function sk3Drop(){sk3V=null;sk3Key='';clear(sk3Box)}
 // drawn when the block is on screen (the Equipment tool open); one viewer, another unit or pick is another scene of it
 function sk3(){if(!skJ||!ktWho||!skBlk||skBlk.hidden||skBlk.offsetParent===null)return;var b=sk3Body(),k=JSON.stringify(b)+'|'+dataSig();if(k===sk3Key)return;
  var sc={url:'/api/x/units/lineup',body:b},P=lkViewer(),v=null;
  if(sk3V&&sk3Sig===dataSig()){try{sk3V.setScene(sc);sk3Key=k;return}catch(e){}}
  sk3Drop();sk3Key=k;sk3Sig=dataSig();
  try{if(P)v=P({set:{},mod:curMod()},{doc:false,compact:true,height:340,blk:'kit.skin.view.v',show:{volumes:false,grid:false,bones:false,axes:false},scene:sc})}catch(e){v=null}
  if(v&&typeof v.setScene==='function'){sk3V=v;sk3Box.appendChild(v);if(curMod()&&typeof v.setMode==='function'){try{v.setMode('textured')}catch(e){}}}else sk3Box.appendChild(el('div',{class:'hint',text:tx('units.lk.no3d')}))}
 function skReset(){if(!skBlk)return;skSeq++;skJ=null;skKey=null;skSkin=null;skTex=null;skView=null;sk3Drop();clear(skNow);clear(skTexBox);clear(skNotes);clear(skRes);skPickSay();skSay.className='hint';skSay.textContent='';skBlk.hidden=true}
 // asked when a soldier or vehicle is shown on the card, once per unit and data signature (force: after a write)
 function skLoad(force){if(!ktWho||!ktJ)return;var key=JSON.stringify(ktWho)+'|'+dataSig();if(!force&&key===skKey)return;skKey=key;var my=++skSeq,b=modBody(ktCopy(ktWho));b.lang=ktLang();
  skBlk.hidden=false;skSkin=null;skTex=null;skView=null;clear(skRes);skPickSay();if(!skJ){skSay.className='hint';skSay.textContent=tx('units.sk.loading1')}
  api('/api/x/units/look',b,{what:tx('units.job.look')}).then(function(j){if(my!==skSeq)return;skSay.className='hint';skSay.textContent='';if(!j.kind){skJ=null;skBlk.hidden=true;return}skJ=j;skDraw();if(skOn)skSoon()})
   .catch(function(e){if(my!==skSeq)return;skJ=null;skKey=null;clear(skNow);clear(skTexBox);clear(skNotes);skSay.className=e.cancelled?'hint':'err';skSay.textContent=e.message})}
 // the picture of the whole unit with what is picked here (nothing picked: as the files have it)
 function skShow3d(){if(!skJ||!ktWho)return;var lk={of:skJ.target},b={id:ktWho.id||skJ.entity||skJ.unit.id};if(ktWho.card)b.card=ktWho.card;
  if(skSkin!==null)lk.skin=skSkin;if(skTex!==null)lk.variant=skTex?skTex:false;b.look=lk;lkAsk(b);kitUnderLook();if(lookCard.scrollIntoView)lookCard.scrollIntoView({block:'start'})}
 var skBtns=flow('/api/x/units/look/set',function(){if(!ktWho||!skJ)throw new Error(tx('units.kit.none'));if(!skDirty())throw new Error(tx('units.sk.nochange'));
  var b=ktCopy(ktWho);if(skSkin!==null)b.skin=skSkin;if(skTex!==null)b.texmod=skTex?skTex:false;b.lang=ktLang();return b},skRes,function(){skSkin=null;skTex=null;skLoad(true)},{kind:'change'});
 var skFind=el('div',{class:'row',blk:'kit.skin.find',style:'flex-wrap:wrap','data-blkname':tx('units.sk.find')},[skKit.el,skSel,skTog]);
 var skBlk=el('div',{blk:'kit.skin',box:'col','data-blkname':tx('units.sk.h')},[blk('kit.skin.title',[el('h4',{style:'margin:10px 0 2px',text:tx('units.sk.h')})]),blk('kit.skin.intro',[el('div',{class:'hint',text:tx('units.sk.intro')})]),
  blk('kit.skin.say',[skSay],{name:tx('units.blk.state')}),blk('kit.skin.now',[skNow],{name:tx('units.sk.nowName')}),skFind,skBody,
  blk('kit.skin.tex',[skTexBox],{name:tx('units.sk.tex')}),blk('kit.skin.notes',[skNotes],{name:tx('units.kit.notes')}),
  el('div',{blk:'kit.skin.view',box:'col','data-blkname':tx('units.sk.view')},[
   blk('kit.skin.view.pick',[el('div',{class:'row',style:'flex-wrap:wrap;gap:8px'},[el('span',{class:'n',text:tx('units.sk.viewSel')}),skVSel,skVLinks,skVHint]),skVMod],{name:tx('units.sk.viewSel')}),
   blk('kit.skin.view.pic',[sk3Box],{name:tx('units.sk.view')})]),
  blk('kit.skin.pick',[el('div',{class:'row'},[skPick,skUndo])],{name:tx('units.kit.pendName')}),
  blk('kit.skin.btns',[el('div',{class:'row',style:'flex-wrap:wrap;gap:8px'},[skBtns,el('button',{type:'button',text:tx('units.sk.show3d'),onclick:skShow3d})])]),blk('kit.skin.res',[skRes],RES())]);
 skBlk.hidden=true;
 var ktGohBlk=blk('kit.goh',[el('div',{class:'hint',text:tx('units.kit.goh')})]);
 function ktGame(){ktGohBlk.hidden=!isGoh()}
 var kitCard=el('div',{class:'card',blk:'kit',box:'col'},[blk('kit.title',[el('h3',{text:tx('units.kit.h')})]),blk('kit.intro',[el('div',{class:'hint',text:tx('units.kit.intro')}),el('div',{class:'hint',text:tx('units.kit.veh.intro')})]),ktGohBlk,
  el('div',{class:'row',blk:'kit.unit','data-blkname':tx('units.kit.unit')},[ktKit.el,el('button',{type:'button',text:tx('units.kit.fromOpen'),onclick:ktFromOpen})]),
  blk('kit.say',[ktSay],{name:tx('units.blk.state')}),blk('kit.squad',[ktSquad],{name:tx('units.kit.soldiers')}),blk('kit.from',[ktFrom],{name:tx('units.kit.fromName')}),
  el('div',{class:'row',blk:'kit.names','data-blkname':tx('units.kit.names')},[el('label',{},[ktNm,el('span',{text:' '+tx('units.kit.names')})]),ktNmHint]),
  el('div',{blk:'kit.cols',box:'row',style:'display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start','data-blkname':tx('units.kit.h')},[
   el('div',{blk:'kit.col-a',box:'col',style:'flex:0 1 auto;min-width:0;max-width:100%','data-blkname':tx('units.kit.grid')},[
    blk('kit.grid-title',[ktGridT],{name:tx('units.kit.gridTitleName')}),blk('kit.grid',[ktGrid],{name:tx('units.kit.grid')}),blk('kit.fit',[ktFit],{name:tx('units.kit.fitName')})]),
   el('div',{blk:'kit.col-b',box:'col',style:'flex:1 1 320px;min-width:0','data-blkname':tx('units.kit.list')},[
    blk('kit.panel',[ktPanel],{name:tx('units.kit.panel')}),
    el('div',{class:'row',blk:'kit.add','data-blkname':tx('units.kit.add')},[el('span',{class:'n',text:tx('units.kit.add')}),ktAddKit.el]),
    blk('kit.notes',[ktNotes],{name:tx('units.kit.notes')}),blk('kit.pend',[el('div',{class:'row'},[ktPend,ktUndo])],{name:tx('units.kit.pendName')}),blk('kit.btns',[ktBtns]),blk('kit.res',[ktBox],RES()),
    blk('kit.list-title',[ktListT],{name:tx('units.kit.listTitle')}),blk('kit.list',[ktList],{name:tx('units.kit.list')})])]),
  ktSlBlkT,ktSlBlk,ktSlListBlk,skBlk,
  blk('kit.browse.title',[el('h4',{style:'margin:10px 0 2px',text:tx('units.kit.br.h')})]),blk('kit.browse.intro',[el('div',{class:'hint',text:tx('units.kit.br.intro')})]),
  el('div',{class:'row',blk:'kit.browse.find',style:'flex-wrap:wrap','data-blkname':tx('units.kit.find')},[kbKit.el,kbSel,kbTog]),
  blk('kit.browse.say',[kbSay],{name:tx('units.blk.state')}),kbBody]);
 ktGame();
 var adBtns=flow('/api/x/units/add',function(){if(!cur)throw new Error(tx('units.pickone'));var b={like:cur.id,card:cur.card,id:adId.value.trim(),name:adName.value.trim(),price:adPrice.value.trim(),wreck:adWreck.checked,bots:adBots.checked};if(isGoh()&&adPer.value)b.period=adPer.value;return b},adBox,function(j){qIn.value=j.unit.id;doSearch()},{newUnit:true});
 function gameUi(){var g=isGoh();byGame();ktGame();rankLab.hidden=g;rkSync();adPerRow.hidden=!g;adSay()}
 function adSay(){
  if(isGoh()){adBotSay.className='hint';adBotSay.textContent=tx(adBots.checked?'units.ad.botsGoh':'units.ad.botsOff');if(cur&&cur.period)adPer.value=cur.period;return}
  if(!cur)return;var listed=(cur.bots||[]).some(function(b){return b.army===cur.army});
  adBotSay.className=listed||!adBots.checked?'hint':'wzstat';
  adBotSay.textContent=listed?(adBots.checked?tx('units.ad.botsYes'):tx('units.ad.botsOff')):tx('units.ad.botsNever',{id:cur.id})}
 adBots.addEventListener('change',adSay);
 var adIdSay=el('div',{class:'hint'});
 function idSay(){var v=adId.value.trim(),id=v.toLowerCase(),k='';if(!v){adIdSay.textContent='';return}
  if(!/^[a-z][a-z0-9_]{1,40}$/.test(id))k='units.id.bad';else if(/_x+$/.test(id))k='units.id.x';
  adIdSay.className=k?'err':'hint';adIdSay.textContent=k?tx(k):tx('units.id.final',{id:id})}
 adId.addEventListener('input',idSay);
 var addCard=el('div',{class:'card',blk:'add',box:'col'},[blk('add.title',[el('h3',{text:tx('units.ad.h')})]),blk('add.like',[adLike]),row('add.id','units.ad.id',adId),blk('add.idsay',[adIdSay],{name:tx('units.ad.id')}),
  row('add.name','units.ad.name',adName),row('add.price','units.ad.price',adPrice),adPerRow,
  blk('add.wreck',[el('label',{},[adWreck,el('span',{text:' '+tx('units.ad.wreck')})])]),blk('add.bots',[el('label',{},[adBots,el('span',{text:' '+tx('units.ad.bots')})])]),
  blk('add.botsay',[adBotSay],{name:tx('units.ad.bots')}),blk('add.btns',[adBtns]),blk('add.res',[adBox],RES())]);

 // ---------- describe a new unit in words ----------
 var dsText=el('textarea',{rows:'3',maxlength:'600','aria-label':tx('units.ds.text'),placeholder:tx('units.ds.ph'),style:'width:100%;box-sizing:border-box'});
 var dsId=inp('units.ds.id',{maxlength:'28'}),dsBots=el('input',{type:'checkbox',checked:true,'aria-label':tx('units.ad.bots')});
 var dsBox=el('div');
 // the write sends back the plan the preview showed, so what is written is what was shown (the AI is not asked a second time)
 var dsBtns=flow('/api/x/units/describe',function(){var t=dsText.value.trim();if(!t)throw new Error(tx('units.ds.empty'));
  return {text:t,id:dsId.value.trim().toLowerCase(),bots:dsBots.checked,ai:false}},dsBox,function(j){qIn.value=String(j.unit.id).replace(/\(.*$/,'');doSearch()},
  {newUnit:true,prep:function(b,pj){b.spec=pj&&pj.spec},shown:function(j,write,pj){var d=(write&&pj?pj.described:j.described)||{},top=dsBox.firstChild;
   function add(c,t){dsBox.insertBefore(el('div',{class:c,text:t}),top)}

   add('hint',d.by==='ai'?tx('units.ds.byAi',{m:d.model||''}):tx('units.ds.byOffline'));
   if((d.understood||[]).length)add('',tx('units.ds.und',{t:d.understood.join('; ')}));
   if((d.assumed||[]).length)add('hint',tx('units.ds.ass',{t:d.assumed.join('; ')}));
   var GW={gun:'units.ds.goh.gun',armor:'units.ds.goh.armor',speed:'units.ds.goh.speed',turret:'units.ds.goh.turret',price:'units.ds.goh.price'};
   (d.refused||[]).forEach(function(x){if(GW[x.piece])add('wzstat',tx(GW[x.piece]))});
   if(d.goh)add('hint',tx('units.ds.goh.card'));
   if(d.kitbash&&!write)add('wzstat',tx('units.ds.kit'));
   if(d.vehicle)add('hint',tx('units.ds.shared'))}});
 var descCard=el('div',{class:'card',blk:'describe',box:'col'},[blk('describe.title',[el('h3',{text:tx('units.ds.h')})]),blk('describe.what',[el('div',{class:'hint',text:tx('units.ds.what')})]),
  blk('describe.text',[dsText],{name:tx('units.ds.text')}),row('describe.id','units.ds.id',dsId),
  blk('describe.bots',[el('label',{},[dsBots,el('span',{text:' '+tx('units.ad.bots')})])]),
  blk('describe.btns',[dsBtns]),blk('describe.res',[dsBox],RES())]);

 // ---------- balance ----------
 var cmpBox=el('div');
 var cmpBtn=el('button',{type:'button',text:tx('units.bal.compare'),onclick:function(){
  clear(cmpBox);cmpBox.appendChild(el('div',{class:'hint',text:tx('units.loading')}));
  api('/api/x/units/compare',modBody({})).then(function(j){clear(cmpBox);
   cmpBox.appendChild(el('div',{class:'hint',text:tx('units.bal.counts',{m:j.modUnits,v:j.vanillaUnits,n:j.rows.length})}));
   if(!j.rows.length)return;var tb=el('tbody');
   j.rows.forEach(function(r){function p(a){return a[0]===a[1]?num(a[1]):num(a[0])+' > '+num(a[1])}
    tb.appendChild(el('tr',{tabindex:'0',onclick:function(){open(r.id,r.card)}},[el('td',{},[nmText(el('b'),function(e){e.textContent=uNm(r.name,r.id)}),nmText(el('div',{class:'hint'}),function(e){e.textContent=joinD([uId2(r.name,r.id),tk('units.bal',r.status),r.brings?bringsText(r.brings,true):''])})]),el('td',{text:r.army}),el('td',{text:p(r.cost)}),rk(el('td',{text:p(r.level)})),el('td',{text:p(r.charge)}),el('td',{text:noArm(r)?tx('units.na'):r.armor[0]&&JSON.stringify(r.armor[0])!==JSON.stringify(r.armor[1])?arm(r.armor[0])+' > '+arm(r.armor[1]):arm(r.armor[1])})]))});
   cmpBox.appendChild(el('div',{class:'scroll'},[el('table',{},[el('thead',{},[el('tr',{},['units.col.name','units.col.army','units.col.price','units.col.rank','units.f.charge','units.col.armor'].map(function(k){var h=el('th',{text:tx(k)});return k==='units.col.rank'?rk(h):h}))]),tb])]))
  }).catch(function(e){errBox(cmpBox,e)})}});
 var apArmy=sel('units.army',[]),apKind=sel('units.kind',[['all',tx('units.kind.any')],['vehicle',tx('units.kind.vehicle')],['squad',tx('units.kind.squad')]]),apPct=inp('units.bal.pct',{maxlength:'5',placeholder:'10'}),apBox=el('div');
 var apBtns=flow('/api/x/units/armyprice',function(){return {army:apArmy.value,kind:apKind.value,percent:apPct.value.trim()}},apBox);
 var hintBox=el('div');
 var hintBtn=el('button',{type:'button',text:tx('units.bal.hints'),onclick:function(){
  if(!cur){toast(tx('units.pickone'));return}clear(hintBox);
  api('/api/x/units/hints',modBody({id:cur.id,card:cur.card})).then(function(j){clear(hintBox);
   hintBox.appendChild(el('div',{text:j.low==null?tx('units.bal.noHint'):tx('units.bal.hintLine',{id:j.unit.name||j.unit.id,lo:j.low,hi:j.high,med:j.median,now:price(j.unit.cost,j.unit.res)})}));
   if(j.unit.brings)hintBox.appendChild(el('div',{class:'hint',text:tx('units.s.brings')+': '+bringsText(j.unit.brings)}));
   j.similar.forEach(function(s){hintBox.appendChild(el('div',{class:'hint',text:(s.name||s.id)+' ('+s.army+'): '+price(s.cost,s.res)+' - '+tx('units.col.armor')+' '+armOf(s)+(s.damage?' - '+tx('units.dmg',{d:s.damage}):'')+(s.crew&&s.kind==='squad'?' - '+tx('units.s.crew')+' '+s.crew:'')+(s.brings?' - '+bringsText(s.brings,true):'')}))})
  }).catch(function(e){errBox(hintBox,e)})}});
 var check=el('ul',{},['1','2','3','4','5','6'].map(function(n){return el('li',{text:tk('units.chk',n)})}));
 var balCard=el('div',{class:'card',blk:'bal',box:'col'},[blk('bal.title',[el('h3',{text:tx('units.bal.h')})]),
  el('div',{blk:'bal.cmp',box:'col','data-blkname':tx('units.bal.compare')},[blk('bal.cmp.btn',[cmpBtn]),blk('bal.cmp.res',[cmpBox],RES())]),
  el('div',{blk:'bal.army',box:'col'},[blk('bal.army.title',[el('h4',{text:tx('units.bal.army.h')})]),el('div',{class:'row',blk:'bal.army.opts','data-blkname':tx('units.bal.army.h')},[apArmy,apKind,apPct,el('span',{text:'%'})]),
   blk('bal.army.hint',[el('div',{class:'hint',text:tx('units.bal.army.hint')})]),blk('bal.army.btns',[apBtns]),blk('bal.army.res',[apBox],RES())]),
  el('div',{blk:'bal.hints',box:'col'},[blk('bal.hints.title',[el('h4',{text:tx('units.bal.hints.h')})]),blk('bal.hints.btn',[hintBtn]),blk('bal.hints.res',[hintBox],RES())])]);
 // the buy panel checklist belongs to making a unit: a card of its own on the make view
 var chkCard=el('div',{class:'card',blk:'chk',box:'col'},[blk('chk.title',[el('h3',{text:tx('units.chk.h')})]),blk('chk.list',[check])]);

 // ---------- recipes ----------
 var rsBreed=sel('units.rc.breed',[]),rsCount=inp('units.rc.count',{maxlength:'2'}),rsBox=el('div'),rsUnit=el('div',{class:'hint',text:tx('units.rc.pickSquad')});
 var rsBtns=flow('/api/x/units/recipe',function(){if(!cur||cur.kind!=='squad')throw new Error(tx('units.rc.pickSquad'));return {recipe:'squad',id:cur.id,card:cur.card,breed:rsBreed.value,count:Number(rsCount.value)}},rsBox,function(){open(cur.id,cur.card)});
 var rrWeapon=inp('units.rc.weapon',{placeholder:'mosin'}),rrRange=inp('units.rc.range',{placeholder:'80 90'}),rrBox=el('div');
 // searchKit: history 'units.rc.weapon', index = the weapon files of game + mod (asked once per game + mod + write); Browse = the file
 // picker on the game data at set/stuff: the weapon file's name (the stuff files have no extension)
 var rrKit=searchKit(rrWeapon,{key:'units.rc.weapon',index:function(q,done){WIX(dataSig(),function(a){hits(a,q,done)})},
  browse:{mode:'file',view:'data',start:'set/stuff',toValue:function(p){return String(p||'').replace(/\\/g,'/').split('/').pop()}}});
 var rrBtns=flow('/api/x/units/recipe',function(){return {recipe:'range',weapon:rrWeapon.value.trim(),range:rrRange.value.trim()}},rrBox);
 // make view: what a unit is. Its name, and how many soldiers of a type a squad brings
 var changeCard=el('div',{class:'card',blk:'change',box:'col'},[blk('change.title',[el('h3',{text:tx('units.ch.h')})]),blk('change.unit',[rnUnit]),
  el('div',{blk:'change.name',box:'col','data-blkname':tx('units.ch.name.h')},[blk('change.name.title',[el('h4',{text:tx('units.ch.name.h')})]),row('change.name.value','units.ch.name',rnVal),blk('change.name.hint',[el('div',{class:'hint',text:tx('units.ch.h.name')})],{name:tx('units.ch.name')}),blk('change.name.btns',[rnBtns]),blk('change.name.res',[rnBox],RES())]),
  el('div',{blk:'change.squad',box:'col','data-blkname':tx('units.rc.squad.h')},[blk('change.squad.title',[el('h4',{text:tx('units.rc.squad.h')})]),blk('change.squad.what',[el('div',{class:'hint',text:tx('units.rc.squad.what')})]),blk('change.squad.unit',[rsUnit]),
   row('change.squad.breed','units.rc.breed',rsBreed),row('change.squad.count','units.rc.count',rsCount),blk('change.squad.btns',[rsBtns]),blk('change.squad.res',[rsBox],RES())])]);
 var recCard=el('div',{class:'card',blk:'recipe',box:'col'},[blk('recipe.title',[el('h3',{text:tx('units.rc.range.h')})]),
  el('div',{blk:'recipe.range',box:'col'},[blk('recipe.range.what',[el('div',{class:'hint',text:tx('units.rc.range.what')})]),
   row('recipe.range.weapon','units.rc.weapon',rrKit.el),row('recipe.range.range','units.rc.range',rrRange),blk('recipe.range.btns',[rrBtns]),blk('recipe.range.res',[rrBox],RES())])]);

 function fillForms(){
  resetWrites();var u=cur;
  chUnit.textContent=tx('units.ch.for',{n:(u.name||u.id)+' ('+u.id+')'});rnUnit.textContent=chUnit.textContent;rnVal.value=u.name||'';chParts();chSay();
  adLike.textContent=u.buyable&&u.kind!=='soldier'?tx('units.ad.like',{n:(u.name||u.id)+' ('+u.id+', '+u.army+')'}):tx('units.ad.cannot');
  if(!adPrice.value&&u.cost!=null)adPrice.value=String(u.cost);adWreck.disabled=!u.wreck;adSay();
  clear(rsBreed);(u.members||[]).forEach(function(m){rsBreed.appendChild(el('option',{value:m.breed,text:m.breed+' x'+m.n}))});
  rsUnit.textContent=u.kind==='squad'?tx('units.ch.for',{n:(u.name||u.id)+' ('+u.id+')'}):tx('units.rc.pickSquad');
  if(u.gun&&!rrWeapon.value)rrWeapon.value=u.gun.weapon;
  if(u.army&&armies.indexOf(u.army)>=0)apArmy.value=u.army}
 // S.modWrites tells other pages (Balance) that the shared mod changed on disk, so they read it again when shown
 function refreshAfterWrite(){S.modWrites=(S.modWrites||0)+1;if(qIn.value.trim()||stb.firstChild)doSearch()}

 //@unitcard
 var tH=el('h2',{text:tx('units.title')});
 root.appendChild(blk('title',[tH]));
 root.appendChild(modCard);
 // W5: many changes at once from one recipe file is the Generator (Tools & Settings > Other Tools; page id make)
 root.appendChild(blk('gen',[el('div',{class:'row'},[el('span',{class:'hint',text:tx('units.gen.hint')}),goBtn('units.gen.go',function(){show('make')})])]));
 // Layout (owner 2026-11-22, the long right column was hard to use): the search and the picked unit's stats side by side on top;
 // under them ONE tool at a time at the whole width, picked with a row of tabs (remembered per browser). The Balance quick
 // changes view (tune) has its own layout: its two tool cards side by side on top, the search and stats under them
 var topCols=el('div',{blk:'cols',box:'cols','data-blkname':tx('units.blk.cols')},[el('div',{blk:'left',box:'col','data-blkname':tx('units.blk.left')},[searchCard]),
  el('div',{blk:'right',box:'col','data-blkname':tx('units.blk.stats')},[statBlk])]);
 var TOOLS=[buyCard,kitCard,lookCard,descCard,changeCard,addCard,cardCard,chkCard],TOOL=0,toolBtns=[];
 try{var tl0=parseInt(localStorage.getItem('as2gui.units.tool'),10);if(tl0>=0&&tl0<TOOLS.length)TOOL=tl0}catch(e){}
 var toolBar=el('div',{class:'row',blk:'tools',role:'tablist',style:'flex-wrap:wrap;gap:6px;margin:8px 0','aria-label':tx('units.blk.tools'),'data-blkname':tx('units.blk.tools')});
 // lkKit: the Equipment card also shows, right under the 3D view, after "Equipment" was pressed on a soldier of the line-up
 // (owner 2026-11-22: it pops up under the picture, the tab does not change); a tab click or a newly clicked unit closes it again
 var lkKit=false;
 function tool(i,keep){if(!(i>=0&&i<TOOLS.length))i=0;TOOL=i;var look=TOOLS[i]===lookCard;TOOLS.forEach(function(c,k){c.hidden=CUR!=='make'||(k!==i&&!(lkKit&&look&&c===kitCard))});
  toolBtns.forEach(function(b,k){b.className=k===i?'primary':'';b.setAttribute('aria-selected',k===i?'true':'false')});
  if(!keep)try{localStorage.setItem('as2gui.units.tool',String(i))}catch(e){}
  sk3();ucShown()}
 function toolOf(card){var i=TOOLS.indexOf(card);if(i>=0&&CUR==='make')tool(i)}
 function kitUnderLook(){if(CUR!=='make')return;lkKit=true;if(lookCard.nextSibling!==kitCard)toolBox.insertBefore(kitCard,lookCard.nextSibling);tool(TOOLS.indexOf(lookCard))}
 // a unit clicked in the search list: its 3D view opens and is drawn at once (owner 2026-11-22); not while the Unit card tool is
 // the one shown (it works on the unit picked, so it stays open)
 function autoLook(){if(CUR!=='make'||!cur||TOOLS[TOOL]===cardCard)return;lkKit=false;tool(TOOLS.indexOf(lookCard));lkOpen()}
 TOOLS.forEach(function(c,i){var h3=c.querySelector?c.querySelector('h3'):null,b=el('button',{type:'button',role:'tab',text:h3?h3.textContent:String(i+1),onclick:function(){lkKit=false;tool(i)}});toolBtns.push(b);toolBar.appendChild(b)});
 var toolBox=el('div',{blk:'tool',box:'col','data-blkname':tx('units.blk.right')},TOOLS);
 var tuneBox=el('div',{blk:'tune',box:'cols','data-blkname':tx('units.blk.tune')},[el('div',{blk:'tune.bal',box:'col','data-blkname':tx('units.bal.h')},[balCard]),el('div',{blk:'tune.num',box:'col','data-blkname':tx('units.num.h')},[numCard]),el('div',{blk:'tune.rec',box:'col','data-blkname':tx('units.rc.h')},[recCard])]);
 root.appendChild(topCols);root.appendChild(toolBar);root.appendChild(toolBox);root.appendChild(tuneBox);
 // Two pages (owner 2026-11-22): make = find a unit, describe, change, add, buy panel checklist (Units sub-tab, ref units/make);
 // tune = compare with the game, army prices, price hints, recipes (Balance sub-tab, ref units/tune). Both keep the search and
 // the stats of the picked unit: the price hint and the squad recipe work on that unit. page.js show(id,view) calls view()
 var VIEWS={make:[buyCard,kitCard,lookCard,descCard,changeCard,addCard,cardCard,chkCard],tune:[balCard,numCard,recCard]},CUR='make';
 function view(v){if(!VIEWS[v])v='make';CUR=v;tH.textContent=tx(v==='tune'?'units.title.tune':'units.title');modIntro.textContent=tx(v==='tune'?'units.intro.tune':'units.intro');var tn=v==='tune';
  toolBar.hidden=tn;toolBox.hidden=tn;tuneBox.hidden=!tn;balCard.hidden=!tn;numCard.hidden=!tn;recCard.hidden=!tn;tool(TOOL,true);
  if(tn){if(tuneBox.nextSibling!==topCols)root.insertBefore(tuneBox,topCols)}else if(topCols.nextSibling!==toolBar)root.insertBefore(topCols,toolBar)}
 view('make');
 function syncView(){var sv=(typeof S!=='undefined'&&S.view&&S.view.units)||'make';if(sv!==CUR)view(sv)}
 chSay();var loaded=false;
 return {refresh:function(){syncView();syncMod()},focus:function(){syncView();syncMod();if(!loaded){loaded=true;doSearch()}qIn.focus()},view:function(v){view(String(v))},
  // another page opens a unit here by its id (the Models page's "Open in Units"): the Units sub-tab, the search box and the stats
  pick:function(id){id=String(id||'');if(!id)return;syncMod();if(CUR!=='make')view('make');loaded=true;qIn.value=id;doSearch();open(id)}}
};
`;
