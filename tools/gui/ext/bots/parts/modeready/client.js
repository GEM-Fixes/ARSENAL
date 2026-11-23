// browser side of the modeready part: "Can bots join this game mode?". One summary line up front (which modes bots can join, by their
// in-game names), then one row per game mode (no table: rows stay readable at any width): the mode's in-game name (the game's own
// #dlg_mp.lng words, sent by the server), a small mode id, yes/no, plain sentences why; the card words ({enableBots}), the IDs and where
// the card comes from sit in the row's Details fold (page standard S2, S11). More than 8 modes: 8 rows, then "Show all N" (S10). Allow
// bots: one main button per row (Preview; Write into my mod and Undo under More options); the preview opens right under that row (S3), Write asks first, then one green box with how to see it in the game, the
// next step (Try a bot match) and Undo (exact bytes back, S4). Refusals are codes (bots.modeready.e.*, maps.e.*, modes.e.*) worded here
// with the next step as a button where there is one (S12); the frame hands the code as the third callback value (e.key, e.params).
// Page rules (bots/script.js): no backtick, no dollar-brace, DOM only through h() and textContent. Shared frame helpers (kit.details,
// kit.done, kit.na, bots.btn.*) are used when the frame has them, else the same words here.
// Author: Imperator_Aug (ARSENAL, ia-2c337a33)
module.exports = String.raw`
BOTS_PARTS.push({id:'modeready',group:'C',order:10,title:function(){return tx('bots.modeready.title')},
 draw:function(env){var k=env.kit,P='bots.modeready.',ID='bots.modeready',MAX=8;
  function t(x,p){return tx(P+x,p)}
  function known(key){return tx(key)!==key}
  function sh(key,own,p){return known(key)?tx(key,p):t(own,p)}
  function say(it){return tx(it.k,it.p||{})}
  function go(id){try{if(env.go)env.go(id)}catch(e){}}
  function page(id){try{if(typeof show==='function')show(id)}catch(e){}}
  function changed(){try{if(typeof BOTS_UI!=='undefined'&&BOTS_UI&&typeof BOTS_UI.changed==='function')BOTS_UI.changed('modeready')}catch(e){}}
  function fold(label,kids){return h('details',{},[h('summary',{text:label})].concat(kids))}
  function details(id,kids){if(k.details)return k.details(id,kids);var l=sh('bots.details','details');return h('details',{blk:id,box:'col','data-blkname':l},[h('summary',{text:l})].concat(kids))}
  function folder(p){var s=String(p||'').replace(/[\\/]+$/,'').split(/[\\/]/);return s[s.length-1]||String(p||'')}
  // the next step of a refusal, as a button: [label key, what it does]
  var NEXT={'bots.modeready.e.nogame':['go.settings',function(){page('settings')}],'bots.modeready.e.nogoh':['go.settings',function(){page('settings')}],
   'bots.modeready.e.needmod':['go.mods',function(){page('mods')}],'maps.e.nomod':['go.mods',function(){page('mods')}],'maps.e.nofolder':['go.mods',function(){page('mods')}],
   'bots.modeready.e.noUndo':['reload',function(){load()}],'bots.modeready.e.changed':['reload',function(){load()}]};
  // a refusal: the code (third callback value, or the message itself) in the page language with its next step; anything else says what
  // to do, with the raw words under Details
  function errEl(m,x){var key=x&&x.key?String(x.key):'',p=x&&x.params||{},c=/^((?:bots|maps|modes)\.[A-Za-z0-9_.]+)(?: (\{.*\}))?$/.exec(String(m||''));
   if(!key&&c){key=c[1];try{p=c[2]?JSON.parse(c[2]):{}}catch(e){p={}}}
   if(key&&known(key)){var nx=NEXT[key],kids=[h('div',{text:tx(key,p)})];if(nx)kids.push(h('div',{class:'row'},[h('button',{type:'button',text:t(nx[0]),onclick:nx[1]})]));if(p.m)kids.push(fold(sh('bots.details','details'),[h('pre',{text:String(p.m)})]));return h('div',{class:'err'},kids)}
   if(!x&&m&&!c&&!/^(Error|[A-Z]{3,}\b|HTTP )/.test(String(m)))return h('div',{class:'err',text:String(m)});
   return h('div',{class:'err'},[h('div',{text:t('e.other')}),h('div',{class:'row'},[h('button',{type:'button',text:t('reload'),onclick:function(){load()}})]),fold(sh('bots.details','details'),[h('pre',{text:String((x&&x.message)||m||'')})])])}
  function ask(o){if(typeof askDo==='function')return askDo(o);var y=true;try{if(typeof window!=='undefined'&&window.confirm)y=!!window.confirm([o.title].concat(o.lines||[]).join(' '))}catch(e){}return {then:function(cb){cb(y)}}}
  var openBtn=function(){return h('button',{type:'button',text:t('open'),onclick:function(){page('modes')}})};
  // Gates of Hell: greyed up front (S7, S15): not available here, why, what to use instead (the Game Modes page reads GoH cards)
  if(env.gid==='goh'){var gl=t('na.goh'),naEl=k.na?k.na(ID+'.na',typeof k.naText==='function'?{why:t('na.goh.w'),use:t('na.goh.u'),game:typeof k.game==='function'?k.game('goh'):'Gates of Hell'}:gl):k.leaf(ID+'.na',[h('div',{class:'hint','data-na':'1',style:'opacity:.8',text:gl})]);
   return [k.section(ID,t('title'),[k.hint(ID+'.lead',t('lead')),naEl,h('div',{class:'row',blk:ID+'.btns','data-blkname':t('open')},[openBtn()]),details(ID+'.details',[k.hint(ID+'.details.goh',t('na.gohWhy'))])])]}
  var state=h('div',{class:'hint',text:t('loading')}),sum=h('div'),list=h('div',{blk:ID+'.modes',box:'col','data-blkname':t('modes.h')}),rows=[],gkind='',all=false;
  function fromText(f){return t(f==='mod'?'from.mod':f==='changed'?'from.changed':'from.game')}
  function armyText(a){return t(a==='team'?'army.team':a?'army.alliance':'army.none')}
  function nameOf(r){return (r&&r.name)||(r&&r.mode)||''}
  // the green box after a write (kit.done when the frame has it): lines and see are plain strings
  function doneBox(bid,o){var n=k.done?k.done(bid,o):null;if(n&&!(n.getAttribute&&n.getAttribute('data-blk')))return n;
   var row=h('div',{class:'row'},(o.next||[]).map(function(x){return h('button',{type:'button',class:'primary',text:x.text,onclick:function(){go(x.go)}})}));
   return h('div',{class:'ok','data-done':'1'},[h('b',{text:o.title||''})].concat((o.lines||[]).map(function(l){return h('div',{text:l})}),o.see?[h('div',{class:'hint',text:sh('bots.done.see','seeH')+' '+o.see})]:[],[row]))}
  // a mode bots cannot really play (combat: no flags; frontline, cooperative: see risk.*): the warning of its Preview and its confirm (S16, S19)
  function riskOf(r){if(gkind==='goh'||!r.risk)return '';return r.risk==='combat'?t('p.combatOff'):t('risk.'+r.risk,{best:bestName(),mode:nameOf(r)})}
  function bestName(){var b=null;rows.forEach(function(x){if(!b&&x.bots&&!x.risk&&x.mode==='battle_zones')b=x});rows.forEach(function(x){if(!b&&x.bots&&!x.risk)b=x});return b?nameOf(b):t('anyFlags')}
  // Preview, Write into my mod, Undo for one mode (S13): Preview opens under the row; Write asks first (after a Preview); one Undo state per row
  function allow(r,out,write,asked,btns){var name=nameOf(r);out.textContent='';
   if(!env.mod){out.appendChild(typeof k.needMod==='function'?k.needMod(null):h('div',{class:'err',text:t('needmod')}));return}
   var risk=riskOf(r);
   if(write&&!asked){ask({title:sh('bots.btn.write','write'),lines:[t('confirm',{mode:name,mod:folder(env.mod)}),t('every')].concat(risk?[risk]:[]),where:folder(env.mod),ok:sh('bots.btn.write','write'),danger:true}).then(function(y){if(y)allow(r,out,true,true,btns)});return}
   out.appendChild(h('div',{class:'hint',text:t('working')}));
   env.api('POST','modeready/allow',{mode:r.mode,write:!!write},function(e,j,x){out.textContent='';
    if(e){out.appendChild(errEl(e,x));return}
    var tech=[h('div',{class:'hint',text:t('tech.file',{file:j.file||''})}),h('div',{class:'hint',text:t(gkind==='goh'?'tech.lineGoh':'tech.line')})].concat((j.warn||[]).map(function(x){return h('div',{class:'hint',text:say(x)})}),(j.say||[]).map(function(x){return h('div',{class:'hint',text:say(x)})}));
    if(!j.ok){out.appendChild(h('div',{class:'err',text:t('failed',{mode:name})}));out.appendChild(fold(sh('bots.details','details'),tech));return}
    if(j.state==='present'){out.appendChild(h('div',{class:'ok',text:t('present',{mode:name})}));return}
    if(!write){out.appendChild(h('div',{class:'ok','data-preview':'1',text:t('planned',{mode:name})}));
     if(risk)out.appendChild(h('div',{class:'err','data-risk':r.risk,'data-combat':r.risk==='combat'?'1':null,text:risk}));
     if(j.copy)out.appendChild(h('div',{class:'hint',text:t('copy')}));
     out.appendChild(h('div',{class:'hint',text:t('onlyMod')}));
     out.appendChild(fold(sh('bots.showChange','exact'),tech));
     if(btns){btns.seen=true;btns.write.disabled=false;if(btns.more){btns.more.open=true;openMore[r.mode]=true}}return}
    out.appendChild(doneBox(ID+'.m.'+r.mode.replace(/_/g,'-')+'.done',{title:t('done',{mode:name}),lines:[],see:t('see',{mode:name}),next:[{text:t('next'),go:'bots.botmatch'}],rels:j.file?[j.file]:[]}));
    r.file=j.file||r.file;
    out.appendChild(fold(sh('bots.showChange','exact'),tech));
    changed();load(r.mode)})}
  // Undo: the done box goes, one plain line, every list read again
  function undoIt(r,out){out.textContent='';out.appendChild(h('div',{class:'hint',text:t('working')}));
   return new Promise(function(ok,no){env.api('POST','modeready/undo',{mode:r.mode},function(e,j,x){out.textContent='';if(e){out.appendChild(errEl(e,x));no(x||e);return}
    var ud=j.action==='deleted'?'deleted':'done',un=typeof k.undone==='function'?k.undone(t('undo.what.'+ud,{mode:nameOf(r)})):null;
    if(un&&typeof un==='object'){if(un.setAttribute)un.setAttribute('data-undone','1');out.appendChild(un)}else out.appendChild(h('div',{class:'ok','data-undone':'1',role:'status',text:typeof un==='string'&&un?un:t('undo.'+ud,{mode:nameOf(r)})}));
    // S18: one Undo state per file: stale green boxes and other Undo buttons of this card file go or ask again
    var uf=j.file||r.file;if(uf&&typeof k.undoSync==='function')try{k.undoSync([uf])}catch(e2){}
    changed();load(r.mode);ok(j)})})}
  // the summary up front: which modes bots can join, and which not, by their in-game names
  function drawSum(){sum.textContent='';if(!rows.length)return;
   var y=rows.filter(function(r){return r.bots}).map(nameOf),n=rows.filter(function(r){return !r.bots}).map(nameOf);
   sum.appendChild(h('div',{class:y.length?'ok':'err','data-sum':'yes',text:y.length?t('sum.yes',{list:y.join(', ')}):t('sum.noneYes')}));
   if(n.length)sum.appendChild(h('div',{class:'hint','data-sum':'no',text:t('sum.no',{list:n.join(', ')})}))}
  // one row per mode: the row line (name, id, yes/no, why), the answer box under it, the Details fold; 8 rows, then Show all N
  var keep={},openMore={};
  function noneEl(){var n=k.none(t('none.try'));return typeof n==='string'?h('div',{class:'hint',text:n}):n}
  function drawRows(again){list.textContent='';
   if(!rows.length){list.appendChild(typeof k.none==='function'?k.leaf(ID+'.modes.none',[noneEl()]):k.hint(ID+'.modes.none',t('none')));return}
   rows.forEach(function(r,i){if(!all&&i>=MAX)return;var bid=ID+'.m.'+r.mode.replace(/_/g,'-'),name=nameOf(r);
    var out=keep[r.mode]&&r.mode===again?keep[r.mode]:h('div');keep[r.mode]=out;
    var plain=(r.plain||[]).map(function(x){return t(x.replace(P,''),{mode:name})}).join(' ');
    // the row header: the in-game name and yes/no; the mode code only in Details (S20)
    var line=[h('b',{text:name}),h('span',{text:'  '}),h('span',{class:r.bots?'ok':'err',text:t(r.bots?'yes':'no')})];
    var act=null;
    if(!r.bots||r.canUndo){var B={};
     B.prev=h('button',{type:'button',class:'primary','data-act':'preview',text:sh('bots.btn.preview','preview'),title:t('allowT'),'data-mode':r.mode,onclick:function(){allow(r,out,false,false,B)}});
     B.write=h('button',{type:'button',class:'danger','data-act':'write',text:sh('bots.btn.write','write'),title:t('writeT'),onclick:function(){if(!B.seen)return;allow(r,out,true,false,B)}});   // only after this row's Preview was shown
     B.undo=h('button',{type:'button','data-undo':'1','data-act':'undo',text:sh('bots.btn.undo','undo'),onclick:function(){B.undo.disabled=true;undoIt(r,out).then(null,function(){})}});
     B.prev.disabled=!env.mod||!!r.bots;B.write.disabled=true;B.undo.disabled=!r.canUndo;B.undo.setAttribute('title',r.canUndo?t('undoT',{mode:name}):t('undoNone'));
     act=B.prev;act.B=B;
     // one main button per row (Preview); Write into my mod and Undo sit under More options, opened by a Preview or when there is something to undo
     var ml=sh('bots.more','more');B.more=h('details',{class:'bots-more','data-more':r.mode},[h('summary',{class:'hint',style:'cursor:pointer;margin:4px 0',text:ml}),h('div',{class:'row'},[B.write,B.undo])]);
     if(r.canUndo||(openMore[r.mode]&&r.mode===again))B.more.open=true;B.more.addEventListener('toggle',function(){openMore[r.mode]=!!B.more.open})}
    var tech=[k.hint(bid+'.d.code',t('code',{mode:r.mode})),k.hint(bid+'.d.why',(r.why||[]).map(say).join(' ')),k.hint(bid+'.d.from',fromText(r.from)+'. '+t('armies',{a:armyText(r.armyMode)}))];
    list.appendChild(h('div',{blk:bid,box:'col','data-blkname':name,'data-mode':r.mode,style:'border-top:1px solid var(--hint);padding:6px 0'},[
     k.leaf(bid+'.row',[h('div',{class:'row','data-btns':act?r.mode:null},line.concat(act?[h('span',{text:'  '}),act.B.prev]:[])),h('div',{text:plain}),act?act.B.more:null],name),
     k.leaf(bid+'.out',[out],t('out.h')),
     details(bid+'.details',tech)]))});
   if(!all&&rows.length>MAX)list.appendChild(k.leaf(ID+'.modes.all',[h('div',{class:'row'},[h('button',{type:'button','data-all':'1',text:t('showAll',{n:rows.length}),onclick:function(){all=true;drawRows()}})])],t('showAll',{n:rows.length})))}
  function load(again){state.className='hint';state.textContent=t('loading');
   env.api('GET','modeready/list',{},function(e,j,x){state.textContent='';
    if(e){state.className='';state.appendChild(errEl(e,x));rows=[];drawSum();drawRows();return}
    rows=j.rows||[];gkind=j.kind||'';var y=rows.filter(function(r){return r.bots}).length;state.className='hint';
    state.textContent=rows.length?(rows.length===1?(env.kit&&typeof env.kit.n==='function'?env.kit.n(1,P+'count',{y:y}):t('count.one',{y:y})):t('count',{n:rows.length,y:y})):'';
    if(j.modWhy){state.appendChild(h('div',{class:'err',text:t('modWhy')}));state.appendChild(errEl(j.modWhy))}
    drawSum();drawRows(again)})}
  load();
  return [k.section(ID,t('title'),[k.hint(ID+'.lead',t('lead')),
   env.mod?null:(typeof k.needMod==='function'?k.needMod(ID+'.needmod'):k.hint(ID+'.needmod',t('needmod'))),
   k.leaf(ID+'.state',[sum,state],t('state.h')),list,
   h('div',{class:'row',blk:ID+'.btns','data-blkname':t('reload')},[h('button',{type:'button',text:t('reload'),onclick:function(){load()}}),openBtn()]),
   details(ID+'.details',[k.hint(ID+'.details.every',t('every')),k.hint(ID+'.details.card',t('tech.card'))])])]}});
`;
