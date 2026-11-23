// Browser side of the Game Modes page. Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h() and textContent.
// Mode texts (maps.mode.*) and refusals (maps.e.*) come from the Maps strings. The multiplayer start settings card is the bots ext's
// BOTS_UI.mpCard (same block ids, same /api/x/bots/* routes); like the Bots page, it is drawn again when the mod changes and its
// blocks of the last draw leave wherever the profile put them first.
// Author: Imperator_Aug (ARSENAL, ia-2b2f84fd)
module.exports = String.raw`
EXT_SCREENS.modes=function(root){
 // GoH (kind goh): its own stock modes (gohweb mission/goh-game-mode-registry), no combat, no MIS-65 line; the routes read the page's game
 var GOH=typeof curGame==='function'&&!!curGame()&&curGame().kind==='goh';
 var STOCK=GOH?['battle_zones','frontlines','captureflag','cooperative','campaign_capture_the_flag','ammunition','evacuation']:['combat','battle_zones','captureflag','cooperative','frontline'];
 var rows=[],loaded=false,listMod=null,mpMod=null,drawnMp=[],last=null;
 function el(t,a,k){return h(t,a,k)}
 function clear(n){while(n.firstChild)n.removeChild(n.firstChild)}
 function enc(s){return encodeURIComponent(s)}
 function known(k){return tx(k)!==k}
 function sentence(it){return tx(it.k,it.p||{})}
 // server refusals come as a key (maps.e.*, modes.e.*) so they are shown in the page language
 function errText(e){var m=String(e&&e.message||e);return /^(maps|modes)\.e\.[a-z]+$/.test(m)&&known(m)?tx(m):m}
 function modeText(m){var k=['maps','mode',m].join('.');if(known(k))return tx(k);k=['modes','mode',m].join('.');return known(k)?tx(k):m}
 function list(){return el('ul',{style:'margin:4px 0 4px 18px;padding:0'})}
 function ask(o){if(typeof askDo==='function')return askDo(o);var y=true;try{if(typeof window!=='undefined'&&window.confirm)y=!!window.confirm([o.title].concat(o.lines||[]).filter(Boolean).join(' '))}catch(e){}return {then:function(cb){cb(y)}}}
 function go(id){if(typeof show==='function')show(id)}
 function leaf(id,kids,name){return blk(id,kids,name?{name:name}:{})}
 function hint(id,t){return leaf(id,[el('div',{class:'hint',text:t})])}

 // ---------- about ----------
 var stockList=list();STOCK.forEach(function(m){stockList.appendChild(el('li',{text:modeText(m)}))});
 var aboutCard=card('about',[blk('about.title',[el('h3',{text:tx('modes.about.h')})]),blk('about.what',[el('div',{text:tx('modes.intro')})]),
  blk('about.modes',[el('div',{class:'hint',text:tx('modes.stock')}),stockList],{name:tx('modes.b.stock')}),
  blk('about.bots',[el('div',{class:'hint',text:tx(GOH?'modes.botsflagsGoh':'modes.botsflags')})],{name:tx('modes.b.botsflags')}),hint('about.safe',tx('modes.safe'))],{name:tx('modes.about.h')});

 // ---------- 1. modes in the game and my mod ----------
 var lState=el('div',{class:'hint',text:tx('modes.list.wait')}),lTb=el('tbody'),lWarn=el('div');
 var lTbl=el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:tx('modes.col.mode')}),el('th',{text:tx('modes.col.cls')}),el('th',{class:'nw',text:tx('modes.col.players')}),el('th',{class:'nw',text:tx('modes.col.order')}),el('th',{text:tx('modes.col.bots')}),el('th',{text:tx('modes.col.from')})])]),lTb]);
 var reloadBtn=el('button',{type:'button',text:tx('modes.reload'),onclick:function(){loadList()}});
 function num(n){return n==null?'?':String(n)}
 function players(r){return r.min==null&&r.max==null?tx('modes.unset'):tx('modes.players',{min:num(r.min),max:num(r.max)})}
 function fromText(f){return tx(f==='mod'?'modes.from.mod':f==='changed'?'modes.from.changed':'modes.from.game')}
 function drawList(){clear(lTb);clear(lWarn);var w=[];
  rows.forEach(function(r){lTb.appendChild(el('tr',{},[el('td',{},[el('span',{class:'badge',text:r.mode,title:modeText(r.mode)})]),el('td',{text:r.cls+(r.known?'':' (?)'),title:modeText(r.cls)}),
   el('td',{class:'nw',text:players(r)}),el('td',{class:'nw',text:r.order==null?tx('modes.unset'):String(r.order)}),el('td',{text:tx(r.bots?'modes.bots.on':'modes.bots.off')}),el('td',{text:fromText(r.from)})]));
   (r.warn||[]).forEach(function(x){w.push(x)})});
  if(w.length){var u=list();w.forEach(function(x){u.appendChild(el('li',{},[el('span',{class:'badge info',text:tx('modes.warn')}),document.createTextNode(sentence(x))]))});lWarn.appendChild(u)}
  fillSel()}
 function loadList(){var md=S.mod||'';listMod=md;lState.className='hint';lState.textContent=tx('modes.list.loading');
  api('/api/x/modes/list?mod='+enc(md),undefined,{what:tx('modes.job.list')}).then(function(j){if(listMod!==md)return;rows=j.modes||[];
   lState.textContent=tx('modes.list.state',{n:rows.length})+(md&&!j.modWhy?' '+tx('modes.list.withmod'):'')+(j.modWhy?' '+tx('modes.list.nomod',{why:errText({message:j.modWhy})}):'');drawList()
  }).catch(function(e){if(listMod!==md)return;lState.className=e.cancelled?'hint':'err';lState.textContent=errText(e)})}
 var listCard=card('list',[blk('list.title',[el('h3',{text:tx('modes.list.h')})]),hint('list.intro',tx('modes.list.intro')),
  h('div',{class:'row',blk:'list.btns','data-blkname':tx('modes.b.btns')},[reloadBtn]),blk('list.state',[lState],{name:tx('modes.b.state')}),
  blk('list.table',[el('div',{class:'scroll'},[lTbl])],{name:tx('modes.b.table')}),blk('list.warn',[lWarn],{name:tx('modes.b.warn')})],{name:tx('modes.list.h')});

 // ---------- 2. allow bots in a mode ----------
 var modLine=el('div',{class:'hint'}),modeSel=el('select',{'aria-label':tx('modes.allow.mode')}),aout=el('div');
 var aPrev=el('button',{type:'button',class:'primary',text:tx('modes.allow.preview'),onclick:function(){runBots(false)}});
 var aWrite=el('button',{type:'button',class:'danger',text:tx('modes.allow.write'),disabled:true,onclick:function(){runBots(true)}});
 function key(){return (S.mod||'')+'|'+modeSel.value}
 function stale(){aWrite.disabled=!(last&&last===key())}
 modeSel.addEventListener('change',function(){last=null;stale()});
 function drawMod(){modLine.className=S.mod?'hint':'err';modLine.textContent=S.mod?tx('modes.mod',{p:S.mod}):tx('modes.needmod')}
 function fillSel(){var keep=modeSel.value;clear(modeSel);
  rows.forEach(function(r){modeSel.appendChild(el('option',{value:r.mode,text:r.mode+' ('+tx(r.bots?'modes.bots.on':'modes.bots.off')+')'}))});
  var f=rows.filter(function(r){return r.mode===keep})[0]||rows.filter(function(r){return !r.bots})[0]||rows[0];if(f)modeSel.value=f.mode;aPrev.disabled=!rows.length;last=null;stale()}
 function needsTest(target){target.appendChild(el('div',{class:'wzstat'},[el('b',{text:tx('modes.test.h')+' '}),document.createTextNode(tx('modes.test.body')+' '),el('button',{type:'button',text:tx('modes.test.go'),onclick:function(){go('play')}})]))}
 function runBots(write,asked){var mode=modeSel.value;
  if(!S.mod){aout.textContent='';aout.appendChild(el('div',{class:'err',text:tx('modes.needmod')}));return}
  if(!mode){aout.textContent='';aout.appendChild(el('div',{class:'err',text:tx('modes.allow.pick')}));return}
  if(write&&!asked){ask({title:tx('modes.allow.write'),lines:[tx('modes.allow.confirm',{mode:mode,mod:S.mod})],where:S.mod}).then(function(yes){if(yes)runBots(true,true)});return}
  aout.textContent='';aout.appendChild(el('div',{class:'hint',text:tx(write?'modes.allow.writing':'modes.allow.planning')}));aPrev.disabled=aWrite.disabled=true;var k=key();
  api('/api/x/modes/bots',{mod:S.mod,mode:mode,write:write},{what:tx(write?'modes.job.write':'modes.job.plan')}).then(function(j){aout.textContent='';
   aout.appendChild(el('div',{class:j.ok?'ok':'err',text:tx(!j.ok?'modes.allow.failed':j.state==='present'?'modes.allow.nothing':write?'modes.allow.done':'modes.allow.planOk')}));
   var u=list();(j.say||[]).forEach(function(s){u.appendChild(el('li',{text:sentence(s)}))});(j.warn||[]).forEach(function(s){u.appendChild(el('li',{class:'err',text:sentence(s)}))});if(u.firstChild)aout.appendChild(u);
   if(j.ok&&!write&&j.state==='added'){last=k;aout.appendChild(el('div',{class:'hint',text:tx('modes.allow.planNote',{mod:S.mod})}))}else last=null;
   if(write&&j.needsTest){needsTest(aout);loadList()}
  }).catch(function(e){last=null;aout.textContent='';aout.appendChild(el('div',{class:'err',text:errText(e)}))}).then(function(){aPrev.disabled=!rows.length;stale()})}
 var allowCard=card('allow',[blk('allow.title',[el('h3',{text:tx('modes.allow.h')})]),hint('allow.intro',tx('modes.allow.intro')),
  blk('allow.warn',[el('div',{class:'err',text:tx('modes.allow.every')})],{name:tx('modes.b.every')}),blk('allow.mod',[modLine],{name:tx('modes.b.mod')}),
  fld('allow.mode',tx('modes.allow.mode'),modeSel),hint('allow.flags',tx('modes.allow.flags')),
  h('div',{class:'row',blk:'allow.btns','data-blkname':tx('modes.b.btns')},[aPrev,aWrite]),blk('allow.out',[aout],{name:tx('modes.b.out')})],{name:tx('modes.allow.h')});

 // ---------- 3. make or change a game mode (guided) ----------
 function task(verb){if(typeof TASK==='undefined'||!TASK.open){toast(tx('modes.task.none'));return}TASK.open('mission',verb,{})}
 var taskCard=card('task',[blk('task.title',[el('h3',{text:tx('modes.task.h')})]),hint('task.intro',tx('modes.task.intro')),
  h('div',{class:'row',blk:'task.btns','data-blkname':tx('modes.b.btns')},[el('button',{type:'button',text:tx('modes.task.make'),onclick:function(){task('make')}}),el('button',{type:'button',text:tx('modes.task.change'),onclick:function(){task('change')}})]),
  hint('task.later',tx('modes.task.later')),
  h('div',{class:'row',blk:'task.open','data-blkname':tx('modes.b.open')},[el('button',{type:'button',text:tx('modes.open.missions'),onclick:function(){go('missions')}}),el('button',{type:'button',text:tx('modes.open.bots'),onclick:function(){go('bots')}})])],{name:tx('modes.task.h')});

 root.appendChild(blk('title',[el('h2',{text:tx('modes.title')})]));
 root.appendChild(aboutCard);
 root.appendChild(h('div',{blk:'main',box:'cols','data-blkname':tx('modes.b.main')},[h('div',{blk:'left',box:'col','data-blkname':tx('modes.b.left')},[listCard]),
  h('div',{blk:'right',box:'col','data-blkname':tx('modes.b.right')},[allowCard,taskCard])]));
 drawMod();

 // ---------- 4. multiplayer start settings (moved from Bots: BOTS_UI.mpCard) ----------
 // the blocks drawn once (every card above); a profile may have put one inside the start settings box, so it is taken out before a redraw
 var fixed=[];(function walk(e){Array.prototype.slice.call(e.children||[]).forEach(function(c){if(c.dataset&&c.dataset.blk!=null)fixed.push(c);walk(c)})})(root);
 function inside(n,a){for(;n;n=n.parentNode)if(n===a)return true;return false}
 function addMp(e){if(!e)return;root.appendChild(e);drawnMp.push(e)}
 function drawMp(){fixed.forEach(function(b){if(drawnMp.some(function(d){return inside(b.parentNode,d)}))root.appendChild(b)});
  drawnMp.forEach(function(e){if(e.parentNode)e.parentNode.removeChild(e)});drawnMp=[];mpMod=S.mod||'';
  if(!S.mod)addMp(leaf('needmod',[el('div',{class:'err',text:tx('modes.mp.needmod')})]));
  else{if(!gameDir())addMp(leaf('nogame',[el('div',{class:'err','data-nogame':'1',text:tx('modes.needGame')+' '+tx('game.notSet')})]));
   if(typeof BOTS_UI!=='undefined'&&BOTS_UI.mpCard)addMp(BOTS_UI.mpCard())}
  blkApply(root)}
 function sync(){drawMod();if(!loaded)return;if((S.mod||'')!==listMod)loadList();if((S.mod||'')!==mpMod)drawMp()}
 return {refresh:sync,focus:function(){if(!loaded){loaded=true;loadList();drawMp()}else sync()}}
};
`;
