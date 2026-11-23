// bots part "buycheck", browser side. Page rules (bots/script.js): no backtick, no dollar-brace, DOM only through h() and textContent.
// One card: two lines of lead (file names folded), the Check button, the result. A row = what goes wrong in a match and what the fix does
// (bold), fix buttons, and a folded Details block (where, names, checker key, limit IDs). More than 8 rows of one kind: 3 shown, the rest
// folded. A fix previews plain sentences first (the exact file change folded, removed lines before added ones); Write asks with the same
// count, writes into the mod only, then a green box "Fixed: ..." with how to see it in the game, next links and Undo stays until the next
// Check; the list is checked again and the frame's views are told (BOTS_UI.changed). The unit picker is a searchKit attached once the box
// is in its row: in-game name first, the id small; a typed in-game name is accepted. Server refusals come as {ok:false, code, args}.
// Frame helpers (kit.details/more/done/wait, bots.* shared keys) are used when the frame has them, else the local ones say the same words.
// Author: Imperator_Aug (ARSENAL, ia-06896fdd)
module.exports = String.raw`
BOTS_PARTS.push({id:'buycheck',group:'A',order:10,title:function(){return tx('bots.buycheck.title')},draw:function(env){
 var K=env.kit,P='bots.buycheck.',ID='bots.buycheck',GROUP=8;
 function t(k,p){return tx(P+k,p)}
 function sh(k,own,p){var s=tx(k,p);return s===k?t(own,p):s}
 function hint(x,small){return h('div',{class:'hint',style:small?'font-size:11px':null,text:x})}
 function fold(label,kids){return h('details',{},[h('summary',{text:label})].concat(kids))}
 function det(id,kids){return K.details?K.details(id||null,kids):fold(sh('bots.details','details'),kids)}
 function more(id,kids,label){return (K.more&&!label)?K.more(id||null,kids):fold(label||sh('bots.more','more'),kids)}
 function wait(x){return K.wait?K.wait(null,x):hint(x)}
 function changed(){try{if(env.changed)env.changed('buys','buycheck');else if(typeof BOTS_UI!=='undefined'&&BOTS_UI.changed)BOTS_UI.changed('buys','buycheck')}catch(x){}}
 function errOf(r){if(typeof r==='string')return r;r=r||{};var a=r.args||{},k=P+'e.'+r.code,s=tx(k,a);if(s!==k)return s;
  var k2='bots.e.'+r.code,s2=tx(k2,a);if(s2!==k2)return s2;return t('e.other',{m:a.m||r.msg||r.code||'?'})}
 function call(m,path,data,cb){env.api(m,path,data,function(e,r){if(e){cb(errOf(e));return}if(!r||r.ok===false){cb(errOf(r));return}cb(null,r)})}
 // army names as the lobby shows them (the check sends the mod's own; the stock six worded here when it has none); codes only in Details
 var ARM={};
 function armyName(a){a=String(a==null?'':a);var lo=a.toLowerCase();if(!a)return a;if(ARM[lo])return ARM[lo];var fa=typeof K.army==='function'?K.army(a):'';if(fa&&fa!==a&&fa!==lo)return String(fa);var k=P+'army.'+lo,s=tx(k);if(s!==k)return s;
  var i=lo.indexOf('_');if(i>0){var b=armyName(lo.slice(0,i));if(b!==lo.slice(0,i))return b+' '+lo.slice(i+1).split('_').map(function(w){return w.length<3?w.toUpperCase():w.charAt(0).toUpperCase()+w.slice(1)}).join(' ')}return a}
 function loc(p){var o={};Object.keys(p||{}).forEach(function(k){o[k]=p[k]});
  if(o.army!=null){o.armyId=o.army;o.army=armyName(o.army)}if(o.home!=null){o.homeId=o.home;o.home=armyName(o.home)}if(o.to!=null){o.toId=o.to;o.to=armyName(o.to)}
  if(o.armies!=null)o.armies=String(o.armies).split(', ').map(armyName).join(', ');
  if(o.unit!=null){o.id=o.unit;if(o.name)o.unit=o.name}return o}
 function goTo(id){if(typeof id==='function'){id();return}if(/^[a-z]+:/.test(id)&&typeof as2Link==='function'){as2Link(id);return}if(env.go)env.go(id);else if(K.go)K.go(id)}
 // one name per game: the frame's (kit.game) when it has it
 function gameName(g){var s=typeof K.game==='function'?K.game(g):'';return s&&s!==g?String(s):({as64:'AS64',mowas2:'MoW:AS2',goh:'Gates of Hell'}[g]||String(g||''))}
 // loose search (S17): spaces, dots and case do not count ("Panzer IV Ausf. H" finds "PzKpfw IV Ausf.H"); a few common names stand
 // for each other (Panzer = PzKpfw = Pz, 4 = IV). Every word of the typed text must be in the name or the id, in the typed order
 var NOTW=/[^a-z0-9\u0400-\u04ff\u4e00-\u9fff]+/;
 function norm(x){return String(x==null?'':x).toLowerCase().split(NOTW).join('')}
 var ALIAS=[['panzer','pzkpfw','panzerkampfwagen','pz'],['1','i'],['2','ii'],['3','iii'],['4','iv'],['5','v'],['6','vi'],['7','vii'],['8','viii'],['stug','sturmgeschutz']];
 function words(x){var out=[];String(x==null?'':x).toLowerCase().split(NOTW).forEach(function(w){if(!w)return;(w.match(/[0-9]+|[^0-9]+/g)||[]).forEach(function(p){out.push(p)})});return out}
 function alts(w){for(var i=0;i<ALIAS.length;i++)if(ALIAS[i].indexOf(w)>=0)return ALIAS[i];return [w]}
 function inOrder(ws,hay){var pos=0;for(var i=0;i<ws.length;i++){var a=alts(ws[i]),best=-1,len=0;for(var j=0;j<a.length;j++){var k=hay.indexOf(a[j],pos);if(k>=0&&(best<0||k<best||(k===best&&a[j].length>len))){best=k;len=a[j].length}}if(best<0)return false;pos=best+len}return true}
 function loose(items,s){var ws=words(s);if(!ws.length)return [];return items.filter(function(c){return inOrder(ws,c.nk)||inOrder(ws,c.ik)})}
 function hits(items,s,done){K.hitsOf(items,s,function(a,more){if(a.length||!String(s||'').trim()){done(a,more);return}var l=loose(items,s);done(l.slice(0,30),Math.max(0,l.length-30))})}
 var res=h('div',{'aria-live':'polite'}),doneBox=h('div',{'aria-live':'polite'});
 var btn=h('button',{type:'button',class:'primary',text:t('run'),onclick:function(){run(false)}});
 // ---- the unit picker: every buy card that can be bought, in-game name first
 var CARDS=null,CW=null;
 function cards(cb){if(CARDS){cb(CARDS);return}if(CW){CW.push(cb);return}CW=[cb];
  env.api('GET','buycheck/cards',null,function(e,r){var l=[];((r&&r.ok!==false&&r.units)||[]).forEach(function(u){
    var an=u.army?armyName(u.army):'';l.push({label:u.name||u.unit,value:u.unit,name:u.name||'',hint:(u.name?u.unit:'')+(an?(u.name?', ':'')+an:''),lo:((u.name||'')+' '+u.unit+' '+(u.army||'')+' '+an).toLowerCase(),nk:norm(u.name||''),ik:norm(u.unit)})});
   CARDS=l;PH.forEach(function(f){f()});PH=[];var w=CW;CW=null;w.forEach(function(f){f(l)})})}
 // what the box holds -> a card id: the picked one, an id, an in-game name typed in full (spaces, dots and case do not count), or the
 // one card the typed text finds. Several or none: cb(null, 'pick') = "pick one from the list" (the text as typed when no list was read)
 function resolve(v,cb){v=String(v||'').trim();if(!v){cb('');return}cards(function(l){var lo=v.toLowerCase(),nv=norm(v),hit='';
  l.some(function(c){if(c.value.toLowerCase()===lo){hit=c.value;return true}return false});
  if(!hit)l.some(function(c){if(c.name&&c.name.toLowerCase()===lo){hit=c.value;return true}return false});
  if(!hit&&nv){var eq=l.filter(function(c){return c.nk===nv||c.ik===nv}),ids={};eq.forEach(function(c){ids[c.value]=1});if(Object.keys(ids).length===1)hit=eq[0].value}
  if(!hit){var ws=words(v),one=function(ls){var seen={};ls.forEach(function(c){seen[c.value]=1});var ks=Object.keys(seen);return ks.length===1?ks[0]:''};
   hit=(ws.length?one(l.filter(function(c){return c.nk&&inOrder(ws,c.nk)})):'')||one(loose(l,v).concat(l.filter(function(c){return c.lo.indexOf(lo)>=0})))}
  if(hit||!l.length)cb(hit||v);else cb(null,'pick')})}
 // the box's example is a name the box accepts (S17): the first buy card with an in-game name, once the list is read
 var PH=[];
 function example1(){var l=CARDS||[];for(var i=0;i<l.length;i++)if(l[i].name)return l[i].name;return l.length?l[0].value:''}
 function picker(fx,go){var picked=null,inp=h('input',{type:'text',autocomplete:'off',placeholder:t('cardPh0'),'aria-label':t('card')});
  function ph(){var e=example1();inp.setAttribute('placeholder',e?t('cardPh',{name:e}):t('cardPh0'))}
  if(CARDS)ph();else{PH.push(ph);cards(function(){})}
  fx.appendChild(inp);   // in its row first: searchKit wraps the box only when it has a parent
  if(typeof searchKit==='function')searchKit(inp,{key:'bots.buycheck.card',index:function(s,done){cards(function(a){hits(a,s,done)})},
   browse:{mode:'file',view:'data',start:'entity',exts:['def'],toValue:function(p){var b=String(p||'').replace(/\\/g,'/').split('/').pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}},
   onPick:function(v,item){picked=item?{label:item.label,value:item.value}:null;inp.value=item?item.label:v}});
  // Enter or leaving the box: an exact or single match becomes that card's name in the box
  function settle(){var v=inp.value.trim();if(!v||(picked&&v===picked.label))return;resolve(v,function(id,why){if(why||!id||inp.value.trim()!==v)return;
   var c=(CARDS||[]).filter(function(x){return x.value===id})[0];if(c){picked={label:c.label,value:c.value};inp.value=c.label}})}
  inp.addEventListener('blur',settle);inp.addEventListener('keydown',function(e){if(e&&e.key==='Enter')settle()});
  return function(cb){var v=inp.value.trim();if(picked&&v===picked.label){cb(picked.value);return}resolve(v,cb)}}
 function where(p){if(p.lines&&p.lines.length>1)return t('whereN',{file:p.file,lines:p.lines.slice(0,8).join(', ')+((p.nLines||p.lines.length)>8?', ...':'')});return t('where',{file:p.file,line:p.line})}
 function ask(n,then){var lines=[t('ask',{n:n})];
  (typeof askDo==='function'?askDo({title:sh('bots.btn.write','write'),lines:lines,where:env.mod,ok:sh('bots.btn.write','write'),danger:true}):{then:function(cb){cb(confirm(lines.join(' ')))}}).then(function(yes){if(yes)then()})}
 function sentence(x){return t('pv.'+x.k,loc(x.p))}
 // ---- after a write: the green box stays until the next Check
 function doneLocal(o){var kids=[h('b',{text:o.title})].concat(o.lines.map(function(l){return h('div',{text:l})}));
  if(o.see)kids.push(h('div',{class:'hint',text:t('done.seeH')+' '+o.see}));
  kids.push(h('div',{class:'row'},(o.next||[]).map(function(n){return h('button',{type:'button',text:n.text,onclick:function(){goTo(n.go)}})})));
  return h('div',{class:'ok',role:'status','data-done':'1'},kids)}
 // S13: one Undo button next to Check, greyed until a fix is written; the done box has none (one Undo on the card)
 var LAST=null,FUN=null,undoBtn;
 if(K.undoBtn){FUN=K.undoBtn(function(){return [LAST?LAST.rel:'script/multiplayer/bot.data.lua']},{onDone:function(){LAST=null;doneBox.textContent='';run(true)}});undoBtn=FUN}
 else undoBtn=h('button',{type:'button','data-undo':'1',disabled:true,title:t('undoHint'),text:sh('bots.btn.undo','undo'),onclick:function(){if(LAST)undo(LAST)}});
 function written(w){doneBox.textContent='';LAST=w;if(FUN&&FUN.refresh)FUN.refresh();else undoBtn.disabled=false;
  var n=w.plain.length,title=n===1?t('done.fixed',{what:sentence(w.plain[0])}):t('done.many',{n:n}),lines=n===1?[]:w.plain.slice(0,6).map(sentence);if(n>6)lines.push(t('prev.moreLines',{n:n-6}));
  var o={title:title,lines:lines,see:t('done.see'),next:[{text:t('next.match'),go:function(){goTo('bots.botmatch')}},{text:t('next.log'),go:function(){goTo('log:')}}],rels:w.rel?[w.rel]:[]};
  doneBox.appendChild(K.done?K.done(null,o):doneLocal(o));
  changed();run(true)}
 // Undo: the done box goes, one plain line says what came back, Undo greys again, the list is checked again and the other cards told
 function undo(w){undoBtn.disabled=true;return new Promise(function(ok){call('POST','buycheck/undo',{rel:w.rel},function(e,u){
  doneBox.textContent='';
  if(e){undoBtn.disabled=false;doneBox.appendChild(K.errBox(e));ok(null);return}
  LAST=null;var un=typeof K.undone==='function'?K.undone(t(u.removed?'undone.removed.what':'undone.what')):null;if(typeof un==='string')un=h('div',{class:'ok',role:'status','data-undone':'1',text:un});
  doneBox.appendChild(un||h('div',{class:'ok',role:'status','data-undone':'1',text:t(u.removed?'undone.removed':'undone')}));
  changed();run(true);ok(u)})})}
 // ---- preview: plain sentences, the exact change folded, Write
 function preview(p,how,value,pv){pv.textContent='';pv.appendChild(wait(t('prev.wait')));
  call('POST','buycheck/fix',{id:p.id,how:how,value:value,write:false},function(e,r){pv.textContent='';
   if(e){pv.appendChild(K.errBox(e));return}
   var n=r.plain.length;
   pv.appendChild(h('b',{text:t('prev.h')}));
   pv.appendChild(h('ul',{},r.plain.slice(0,20).map(function(x){return h('li',{text:sentence(x)})})));
   if(n>20)pv.appendChild(hint(t('prev.moreLines',{n:n-20})));
   if(r.copiesWholeFile)pv.appendChild(hint(t('prev.copy')));
   pv.appendChild(hint(t('prev.only')));
   var d=[hint(t('prev.where',{file:r.file}),true)];
   r.hunks.forEach(function(k){var l=[t('prev.line',{n:k.line})];k.was.forEach(function(x){l.push('- '+x)});k.now.forEach(function(x){l.push('+ '+x)});
    d.push(h('pre',{class:'diff',style:'overflow-x:auto;margin:4px 0',text:l.join('\n')}))});
   if(r.more)d.push(hint(t('prev.more',{n:r.more})));
   pv.appendChild(fold(sh('bots.showChange','prev.file'),d));
   pv.appendChild(h('div',{class:'row'},[h('button',{type:'button',class:'danger',text:sh('bots.btn.write','write'),onclick:function(){ask(n,function(){
    call('POST','buycheck/fix',{id:p.id,how:how,value:value,write:true},function(e2,w){pv.textContent='';
     if(e2){pv.appendChild(K.errBox(e2));return}
     written(w)})})}})]))})}
 // ---- one row
 function row(p){var pv=h('div'),fx=h('div',{class:'row'}),pp=loc(p.p);
  var kids=[h('b',{text:t('msg.'+p.msg,pp)})];
  if(p.from==='game'&&(p.fixes||[]).length)kids.push(hint(t('fromGame'),true));
  if(p.soft==='goh')kids.push(hint(t('softGoh'),true));
  (p.fixes||[]).forEach(function(f){
   if(f.how==='replace'){var get=picker(fx);
    fx.appendChild(h('button',{type:'button',text:t('fix.replace',f.p),onclick:function(){get(function(v,why){if(!v){pv.textContent='';pv.appendChild(K.errBox(t(why?'e.pickOne':'e.needCard')));return}preview(p,'replace',v,pv)})}}));return}
   fx.appendChild(h('button',{type:'button',text:t('fix.'+f.how,loc(f.p)),onclick:function(){preview(p,f.how,null,pv)}}))});
  if(p.refused)kids.push(hint(t('refused.'+p.refused.why,p.refused.p)));
  else if(!(p.fixes||[]).length)kids.push(hint(t('fix.none')));
  if((p.fixes||[]).length)kids.push(fx);
  var d=[];if(p.file)d.push(hint(where(p)));
  if(p.msg==='unit'||p.msg==='unitNfs')d.push(hint(t('det.'+p.msg,{unit:pp.id})));
  if(p.msg==='armyMix')d.push(hint(t('det.armyMix',pp)));
  if(p.msg==='noBuy')d.push(hint(t(pp.helper?'det.noBuyHelper':'det.noBuy',{id:pp.id,armyId:pp.armyId,card:pp.card})));
  if(p.names&&p.names.length)d.push(hint(t('det.names',{list:p.names.slice(0,80).join(', ')+(p.names.length>80?', ...':'')})));
  if(pp.list)d.push(hint(t('det.keys',{list:pp.list})));
  if(pp.cant)d.push(hint(t('msg.deadCant',pp)));
  ['sub','api','charge','budget','repeat','noStay','unitsArr','named','parse'].forEach(function(m){if(p.msg===m)d.push(hint(t('det.'+m,pp)))});
  d.push(hint(t('det.code',{code:p.code,lim:p.lim}),true));
  kids.push(det(null,d));
  kids.push(pv);
  return h('div',{class:'bc-row','data-id':p.id,style:'border-top:1px solid var(--btnl);padding:6px 0'},kids)}
 function show(r){
  if(r.base){if(r.base.how==='guess'){res.appendChild(h('div',{class:'err','data-warn':'require',role:'note',text:t('base.guess',r.base)}));
    res.appendChild(det(null,[hint(t('base.step1')),hint(t('base.step2')),h('pre',{style:'margin:4px 0','data-line':'1',text:'	{Require "'+r.base.folder+'"}'}),hint(t('base.step3',r.base))]))}
   else res.appendChild(hint(t('base.'+r.base.how,r.base)))}
  if(r.clean)res.appendChild(h('div',{class:'ok',text:t('clean')}));
  else res.appendChild(h('b',{text:t('count',{n:r.problems.length})}));
  var sk={},why=[];(r.skipped||[]).forEach(function(s){var k=t('c'+s.check);if(!sk[s.why]){sk[s.why]={l:[],p:s.p||{}};why.push(s.why)}if(sk[s.why].l.indexOf(k)<0)sk[s.why].l.push(k)});
  why.forEach(function(w){res.appendChild(hint(t('skipped',{list:sk[w].l.join(', ')+': '+t('skip.'+w,sk[w].p)})))});
  // S10: rows of one kind together; the first GROUP (8) shown, then "Show all N" draws the rest in place
  var by={},order=[],all=[];r.problems.forEach(function(p){if(!by[p.msg]){by[p.msg]=[];order.push(p.msg)}by[p.msg].push(p)});
  order.forEach(function(m){all=all.concat(by[m])});
  rows8(all,row,res)}
 function rows8(list,mk,box){list.slice(0,GROUP).forEach(function(x){box.appendChild(mk(x))});if(list.length<=GROUP)return;
  var b=h('button',{type:'button','data-showall':'1',text:sh('bots.showAll','showAll',{n:list.length}),onclick:function(){if(b.parentNode)b.parentNode.removeChild(b);list.slice(GROUP).forEach(function(x){box.appendChild(mk(x))})}});
  box.appendChild(b)}
 function run(keep){if(!keep)doneBox.textContent='';res.textContent='';res.appendChild(wait(t('running')));btn.disabled=true;
  call('GET','buycheck/run',null,function(e,r){btn.disabled=false;res.textContent='';
   if(e){res.appendChild(K.errBox(e));return}
   ARM={};Object.keys(r.armies||{}).forEach(function(k){ARM[k.toLowerCase()]=r.armies[k]});
   show(r)})}
 // S20/round 3: a made-up row so a beginner sees what a problem and its Fix look like when the check finds none (buttons do nothing)
 function example(){var b1=h('button',{type:'button',disabled:true,text:t('ex.btn1')}),b2=h('button',{type:'button',disabled:true,text:t('ex.btn2')});
  return fold(t('ex.h'),[hint(t('ex.lead')),h('div',{class:'bc-ex','data-example':'1',style:'border:1px dashed var(--btnl);padding:6px 8px;margin:4px 0;opacity:.85'},[h('b',{text:t('ex.row')}),h('div',{class:'row'},[b1,b2])]),hint(t('ex.how'))])}
 // the two game words of this card, explained once on hover (and on focus, for the keyboard)
 function term(w,tip){return h('span',{tabindex:'0',title:tip,'aria-label':w+': '+tip,style:'cursor:help;text-decoration:underline dotted',text:w})}
 // GoH (S15): the card runs there, so it is not greyed: one line says what it checks in that game and what it leaves out
 var GOH=env.gid==='goh';
 var kids=[K.leaf(ID+'.lead',[h('div',{class:'hint','data-goh':GOH?'1':null,text:GOH?t('gohRuns',{game:gameName('goh')}):t('lead')}),h('div',{class:'hint'},[h('span',{text:t('terms')+' '}),term(t('term.card'),t('term.cardTip')),h('span',{text:', '}),term(t('term.stage'),t('term.stageTip'))]),fold(sh('bots.details','details'),[hint(t('leadMore'))])])];
 if(GOH)kids.push(K.leaf(ID+'.goh',[fold(sh('bots.details','details'),[hint(t('gohMore'))])]));
 if(!env.mod){btn.disabled=true;kids.push(typeof K.needMod==='function'?K.needMod(ID+'.needmod'):K.leaf(ID+'.needmod',[K.errBox(t('needMod'))]))}
 kids.push(h('div',{class:'row',blk:ID+'.btns','data-blkname':t('run')},[btn,undoBtn]));
 if(!GOH)kids.push(K.leaf(ID+'.example',[example()],t('ex.h')));
 kids.push(K.leaf(ID+'.res',[doneBox,res],t('title')));
 return [K.section(ID,t('title'),kids)];
}});
`;
