// Browser side of the Balance page's price calculator card: Model, Breeds and Cards views (server: prices.js, tools/pricecalc).
// Cards: in-game names on request (prices/names), hero button cards hidden by default and shown with their cost in their own points
// plus its MP worth; Model: the point values (MP per SP / DP) as the model's {point_value} block.
// Page rules as client.js: no backtick, no dollar-brace, no innerHTML. Prices in the game files are never changed from here: the
// card writes only the model file (price_model.inc) and ;{price ...} comment lines, each write with an undo copy. Gates of Hell: the model
// is the fitted terms until the mod saves its own (units/price_model.inc, a price box per term); Preview / Write new prices change the
// price number of the mod's far-off breed rows, game files copied in only with the tick (restore points first, Undo last, server prices.js).
// The model text lives here while it is edited; every edit goes to the server as one op on that text (prices/try), which edits it in
// place (hand comments stay) and prices everything again in memory. Nothing is written until Save model.
// Author: Imperator_Aug (ARSENAL, ia-db028d23)
module.exports = String.raw`
function balPrices(o){
 var el=h,curMod=o.curMod,P=null,loadedFor=null,view='model',text=null,edits=0,busy=false,openB=null,openC=null,planned=null,seedPv=null,pick1=null;
 // Model first (owner 2026-11-19): it holds the point values (MP per SP / DP) the hero cards are shown with
 var VIEWS=['model','breeds','cards'],MAXROWS=400;
 // in-game names (prices/names, asked once per load when a "localized names" box is ticked): NM={cards:{name:text},breeds:{'side/breed':text}}
 var locOn=false,NM=null,nmFor=null,nmBusy=false;
 function locNames(){if(!locOn||!P||nmBusy||nmFor===loadedFor)return;nmBusy=true;var f=loadedFor;
  api('/api/x/balance/prices/names',req(),{what:tx('balance.job.names')}).then(function(j){nmBusy=false;if(f!==loadedFor)return;NM=j;nmFor=f;draw()}).catch(function(e){nmBusy=false;nmFor=f;NM={cards:{},breeds:{}};toast(e.message);draw()})}
 function cName(c){return locOn&&NM&&NM.cards[c.name]||null}
 function bName(k){return locOn&&NM&&NM.breeds[k]||null}
 function locBox(){var b=el('input',{type:'checkbox','aria-label':tx(K('f','loc'))});b.checked=locOn;b.addEventListener('change',function(){locOn=b.checked;locNames();draw()});return b}
 function unitOf(u){return u==='mp'||u==='sp'||u==='dp'?tx(K('unit',u)):String(u||'').toUpperCase()}
 function clear(n){while(n.firstChild)n.removeChild(n.firstChild)}
 function fmt(v){if(v==null||v==='')return '';if(typeof v==='number')return String(Math.round(v*100)/100);return String(v)}
 function sel(k,opts,val){var s=el('select',{'aria-label':tx(k)},opts.map(function(x){return el('option',{value:x[0],text:x[1]})}));if(val!=null)s.value=val;return s}
 function K(){return ['balance.pr'].concat([].slice.call(arguments)).join('.')}
 var say=el('div'),fitBox=el('div',{class:'hint'});
 var body=blk('prices.body',[],{box:'col',name:tx(K('b','body'))}),tabs=el('div',{class:'row',role:'tablist'}),tabBtn={},drawn=[];
 VIEWS.forEach(function(v){tabBtn[v]=el('button',{type:'button',role:'tab',text:tx(K('v',v)),onclick:function(){view=v;if(!P)load(true);else draw()}});tabs.appendChild(tabBtn[v])});
 function vid(p){return ['prices',view,p].join('.')}
 function vb(p,kids,x){x=x||{};var b=blk(vid(p),kids,{box:x.box,'class':x.cls,name:x.nm?tx(x.nm):null,attrs:x.style?{style:x.style}:null});drawn.push(b);return b}
 function vf(p,k,ctl,lab){var b=fld(vid(p),lab!=null?lab:tx(k),ctl);drawn.push(b);return b}
 function lf(p,kids,x){var b=vb(p,kids,x);body.appendChild(b);return b}
 function uniq(list,f){var m={};list.forEach(function(r){var v=f(r);m[v==null||v===''?'-':String(v)]=1});return Object.keys(m).sort()}

 // the optional inputs of a starting model: the mod's rules file and the owner's sheet (cell TSVs); kept per viewer
 function lsGet(k){try{return LS.get(k,'')||''}catch(e){return ''}}
 var rulesIn=el('input',{type:'text',autocomplete:'off',size:40,'aria-label':tx(K('seed','rules'))}),mpIn=el('input',{type:'text',autocomplete:'off',size:40,'aria-label':tx(K('seed','mp'))}),cpIn=el('input',{type:'text',autocomplete:'off',size:40,'aria-label':tx(K('seed','cp'))});
 rulesIn.value=lsGet('bal.pr.rules');mpIn.value=lsGet('bal.pr.mp');cpIn.value=lsGet('bal.pr.cp');
 [[rulesIn,'bal.pr.rules'],[mpIn,'bal.pr.mp'],[cpIn,'bal.pr.cp']].forEach(function(p){p[0].addEventListener('change',function(){try{LS.set(p[1],p[0].value.trim())}catch(e){}seedPv=null})});
 function req(extra){var b={mod:curMod()||null},r=rulesIn.value.trim(),m=mpIn.value.trim(),c=cpIn.value.trim();if(r)b.rules=r;if(m)b.sheetMp=m;if(c)b.sheetCp=c;for(var k in extra||{})b[k]=extra[k];return b}

 // ---------- load + state ----------
 function stamp(){return curMod()+'\n'+(S.gameId||'')+'\n'+(S.modWrites||0)}
 function load(force){var m=curMod(),st=stamp();if(!force&&loadedFor===st)return;loadedFor=st;
  clear(say);clear(actBox);say.appendChild(el('div',{class:'hint',text:tx(K('loading'))}));
  api('/api/x/balance/prices/calc',req(),{what:tx('balance.job.prices')}).then(function(j){if(m!==curMod())return;P=j;text=j.text;edits=0;planned=null;stateSay();draw();locNames()})
   .catch(function(e){loadedFor=null;P=null;clear(say);say.appendChild(el('div',{class:e.cancelled?'hint':'err',text:e.message}));draw()})}
 function line(cls,t){say.appendChild(el('div',{class:cls,text:t}))}
 function fitText(f){return tx(K('fit'),{n:f.breeds.exact+f.breeds.near+f.breeds.off+f.breeds['n/a'],e:f.breeds.exact,nr:f.breeds.near,off:f.breeds.off,na:f.breeds['n/a'],
  c:f.cards.exact+f.cards.near+f.cards.off+f.cards['n/a'],ce:f.cards.exact,cn:f.cards.near,co:f.cards.off,cna:f.cards['n/a'],h:f.hand})}
 function stateSay(){clear(say);if(!P)return;var st=P.state||[];
  if(st.indexOf('vanilla')>=0)line('wzstat',tx(K('st','vanilla')));
  if(st.indexOf('noRows')>=0)line('err',tx(K('st','noRows')));
  if(st.indexOf('layout')>=0)(P.findings||[]).filter(function(f){return f.code==='LAYOUT_UNKNOWN'}).forEach(function(f){line('err',tx(K('st','layout'),{f:f.file+':'+f.line,m:f.msg}))});
  if(st.indexOf('noModel')>=0)line('wzstat',tx(K('st','noModel')));
  if(st.indexOf('rowsFromGame')>=0)line('hint',tx(K('st','rowsFromGame')));
  if(P.model&&P.model.edited)line('wzstat',tx(K('st','edited'),{n:edits}));
  (P.rules&&P.rules.errs||[]).forEach(function(e){line('err',tx(K('st','rules'),{l:e.line,m:e.code+' '+e.msg}))});
  if(P.goh){gohSay();fitBox.textContent=fitText(P.fit);return}
  line('hint',tx(K('st','model'),{m:P.model.file?P.model.rel:tx(K('st','memory')),r:P.rows,c:(P.cards||[]).length}));
  fitBox.textContent=fitText(P.fit)}

 // Gates of Hell (P.goh, tools/pricecalc/goh.js): read only; the model is fitted on the game's own breed prices each time [I]
 function qText(q){return q&&q.n?tx(K('goh','qline'),{n:q.n,r:q.r2==null?'-':fmt(q.r2),w:q.within10==null?'-':q.within10,m:fmt(q.meanAbs)}):tx(K('goh','qnone'))}
 function gohSay(){var q=P.quality||{};line('hint',tx(K('goh','how')));line('hint',tx(K('st','model'),{m:P.model.file?tx(K('goh','fromSaved'),{f:P.model.rel}):tx(K('goh','fitted')),r:P.rows,c:(P.cards||[]).length}));
  line('wzstat',tx(K('goh','qb'))+' '+qText(q.breeds));line('hint',tx(K('goh','qs'))+' '+qText(q.specials));line('hint',tx(K('goh','qq'))+' '+qText(q.squads));line('hint',tx(K('goh','qv'))+' '+qText(q.vehicles));
  line('hint',tx(K('goh','left')))}
 function draw(){draw0();blkApply(o.root)}
 function draw0(){VIEWS.forEach(function(v){tabBtn[v].className=v===view?'primary':'';tabBtn[v].setAttribute('aria-selected',v===view?'true':'false')});
  drawn.forEach(function(b){if(b.parentNode)b.parentNode.removeChild(b)});drawn=[];
  if(!P){lf('go',[el('button',{type:'button',class:'primary',text:tx(K('go')),onclick:function(){load(true)}}),el('span',{class:'hint',text:' '+tx(K('goHint'))})],{cls:'row'});return}
  ({breeds:drawBreeds,model:drawModel,cards:drawCards})[view]();actSay()}

 // ---------- a sortable table of at most MAXROWS rows ----------
 function table(p,cols,list,sort,onSort,cell){
  var hd=el('tr',{},cols.map(function(c){return el('th',{},[el('button',{type:'button',class:'link',text:tx(K('c',c[0]))+(sort.k===c[0]?(sort.d?' ▼':' ▲'):''),onclick:function(){onSort(c[0])}})])}));
  var tb=el('tbody');list.slice(0,MAXROWS).forEach(function(r){tb.appendChild(el('tr',{},cols.map(function(c){return cell(r,c)})))});
  if(list.length>MAXROWS)lf(p+'-more',[el('div',{class:'hint',text:tx(K('more'),{n:MAXROWS,all:list.length})})]);
  lf(p,[el('table',{},[el('thead',{},[hd]),tb])],{nm:K('b','table'),style:'overflow:auto;max-height:70vh'})}
 function sortBy(list,s,val){return list.slice().sort(function(a,b){var x=val(a,s.k),y=val(b,s.k);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;var c=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y));return s.d?-c:c})}
 function num(td,v){td.style.textAlign='right';return td}
 function diffTd(v){var td=num(el('td',{text:v==null?'':(v>0?'+':'')+fmt(v)}));if(v!=null&&Math.abs(v)>1e-6)td.style.background='var(--warnbg)';return td}

 // ---------- Breeds ----------
 var bSide,bCls,bQ,bDiff,bSort={k:'dmp',d:true};
 var BCOLS0=[['side'],['breed'],['cls'],['tier'],['item'],['skill'],['vet'],['eff'],['parts'],['cmp'],['ccp'],['ccw'],['mmp'],['mcp'],['mcw'],['dmp'],['dcp'],['flags']];
 // GoH: fair price, game price, difference; CP and CW as read (fixed per class, not priced)
 var BCOLS_G=[['side'],['breed'],['cls'],['tier'],['item'],['vet'],['parts'],['gfair'],['ggame'],['gdiff'],['mcp'],['mcw'],['flags']];
 function bcols(){return P&&P.goh?BCOLS_G:BCOLS0}
 function bVal(b,k){var c=b.calc||{},m=b.mod||{};switch(k){case 'side':return b.side;case 'breed':return b.breed;case 'cls':return b.cls;case 'tier':return b.tier;case 'item':return b.item;case 'skill':return b.skill;case 'vet':return b.vetStart;case 'eff':return b.skillEff;
  case 'parts':return b.parts?b.parts.weapon+b.parts.addon+b.parts.kit+b.parts.extras:null;case 'cmp':return c.mp;case 'ccp':return c.cp;case 'ccw':return c.cw;case 'mmp':return m.mp;case 'mcp':return m.cp;case 'mcw':return m.cw;
  case 'dmp':case 'gdiff':return c.mp!=null&&m.mp!=null?Math.round((c.mp-m.mp)*100)/100:null;case 'gfair':return c.mp;case 'ggame':return m.mp;case 'dcp':return c.cp!=null&&m.cp!=null?Math.round((c.cp-m.cp)*100)/100:null;case 'flags':return flagsOf(b)}return null}
 function flagsOf(b){var f=[tx(K('fitv',b.fit.replace('/','')))];if(b.rule&&b.rule!=='weapon')f.push(b.rule);if(b.fixedCp)f.push('cp: '+b.fixedCp);if((b.unpriced||[]).length)f.push(tx(K('unpriced'),{n:b.unpriced.length}));if((b.undetermined||[]).length)f.push(tx(K('undet'),{n:b.undetermined.length}));return f.join(', ')}
 function filt(){if(!bSide){bSide=sel(K('f','side'),[],'');bCls=sel(K('f','cls'),[],'');bQ=el('input',{type:'text',autocomplete:'off','aria-label':tx(K('f','q')),placeholder:tx(K('f','qph'))});bDiff=el('input',{type:'checkbox','aria-label':tx(K('f','diff'))});
   [bSide,bCls,bDiff].forEach(function(s){s.addEventListener('change',draw)});bQ.addEventListener('input',function(){clearTimeout(filt.t);filt.t=setTimeout(draw,80)});
   bKit=searchKit(bQ,{key:'balance.breeds.q',index:function(q,done){kitHits(bItems(),q,done)},browse:BR_BREED})}}
 // the filter boxes' searchKit (page.js, owner 2026-11-19): index = the breeds / cards by in-game name and file name, history per box.
 // Browse = the file picker on the game data where the rows come from: a breed file set/breed/mp/<side>/<breed>.set gives side/breed
 // (what the breed filter matches); a card file under set/multiplayer/units gives its path there (the card filter matches the file).
 // Items are made again only when the data or the in-game names change
 function gpath(p){return String(p||'').replace(/\\/g,'/').replace(/^\/+/,'').replace(/^resource\//i,'')}
 var BR_BREED={mode:'file',view:'data',start:'set/breed/mp',exts:['set'],toValue:function(p){var g=gpath(p),m=/^set\/breed\/mp\/(.+)\.set$/i.exec(g);return m?m[1]:g.split('/').pop().replace(/\.set$/i,'')}};
 var BR_CARD={mode:'file',view:'data',start:'set/multiplayer/units',exts:['set','inc'],toValue:function(p){var g=gpath(p),m=/^set\/multiplayer\/units\/(.+)$/i.exec(g);return m?m[1]:g.split('/').pop()}};
 var bKit=null,cKit=null,BI=null,CI=null;
 function bItems(){if(BI&&BI.p===P&&BI.nm===NM&&BI.on===locOn)return BI.a;var a=(P?P.breeds:[]).map(function(b){var k=b.side+'/'+b.breed,ln=bName(k);
   return {label:ln||b.breed,value:k,hint:k+(b.cls?'  '+b.cls:''),lo:(k+' '+(ln||'')+' '+(b.item||'')).toLowerCase()}});
  BI={p:P,nm:NM,on:locOn,a:a};return a}
 function cItems(){if(CI&&CI.p===P&&CI.nm===NM&&CI.on===locOn)return CI.a;var seen={},a=[];(P?P.cards:[]).forEach(function(c){if(seen[c.name])return;seen[c.name]=1;var ln=cName(c);
   a.push({label:ln||c.name,value:c.name,hint:c.file+(ln?'  '+c.name:''),lo:(c.name+' '+(ln||'')+' '+c.file).toLowerCase()})});
  CI={p:P,nm:NM,on:locOn,a:a};return a}
 function kitHits(items,q,done){q=q.trim().toLowerCase();var out=[],more=0;items.forEach(function(it){if(q&&it.lo.indexOf(q)<0)return;if(out.length<40)out.push(it);else more++});done(out,more)}
 function fillSel(s,vals,allK){var v=s.value;clear(s);s.appendChild(el('option',{value:'',text:tx(allK)}));vals.forEach(function(x){s.appendChild(el('option',{value:x,text:x}))});s.value=vals.indexOf(v)>=0?v:''}
 function drawBreeds(){filt();fillSel(bSide,uniq(P.breeds,function(b){return b.side}),K('f','allSides'));fillSel(bCls,uniq(P.breeds,function(b){return b.cls}),K('f','allCls'));
  lf('opts',[vf('opts.side',K('f','side'),bSide),vf('opts.cls',K('f','cls'),bCls),vf('opts.q',K('f','q'),bKit.el),vf('opts.diff',K('f','diff'),bDiff),vf('opts.loc',K('f','loc'),locBox())],{box:'row',nm:K('b','opts')});
  var q=bQ.value.trim().toLowerCase(),list=P.breeds.filter(function(b){return (!bSide.value||b.side===bSide.value)&&(!bCls.value||String(b.cls==null?'-':b.cls)===bCls.value)&&
   (!q||(b.side+'/'+b.breed+' '+(b.item||'')+' '+(b.tier||'')+' '+(bName(b.side+'/'+b.breed)||'')).toLowerCase().indexOf(q)>=0)&&(!bDiff.checked||b.fit!=='exact')});
  if(locOn&&!NM)lf('nmwait',[el('div',{class:'hint',text:tx(K('loading'))})]);
  lf('n',[el('div',{class:'hint',text:tx(K('bn'),{n:list.length,all:P.breeds.length})})]);
  if(openB)breedDetail(openB);
  table('table',bcols(),sortBy(list,bSort,bVal),bSort,function(k){if(bSort.k===k)bSort.d=!bSort.d;else bSort={k:k,d:!!list.length&&typeof bVal(list[0],k)==='number'};draw()},function(b,c){
   var v=bVal(b,c[0]),ln=c[0]==='breed'?bName(b.side+'/'+b.breed):null;if(c[0]==='breed')return el('td',{},[el('button',{type:'button',class:'link',title:tx(K('open')),text:ln||b.breed,onclick:function(){openB=b.side+'/'+b.breed+':'+b.line;draw()}})].concat(ln?[el('span',{class:'hint',text:' '+b.breed})]:[]));
   if(c[0]==='parts'&&b.parts&&P.goh)return el('td',{text:[b.parts.weapon,b.parts.tier,b.parts.vet,b.parts.kit].map(fmt).join(' / '),title:tx(K('goh','partsT'))});
   if(c[0]==='parts'&&b.parts)return el('td',{text:[b.parts.weapon,b.parts.addon,b.parts.kit,b.parts.extras].map(fmt).join(' / '),title:tx(K('partsT'))});
   if(c[0]==='dmp'||c[0]==='dcp'||c[0]==='gdiff')return diffTd(v);var td=el('td',{text:fmt(v)});if(typeof v==='number')num(td);if(c[0]==='flags'&&b.fit!=='exact')td.style.background=b.fit==='near'?'var(--infobg)':'var(--warnbg)';return td})}
 function breedDetail(key){var b=P.breeds.filter(function(x){return x.side+'/'+x.breed+':'+x.line===key})[0];if(!b){openB=null;return}
  var kids=[el('h4',{text:(bName(b.side+'/'+b.breed)?bName(b.side+'/'+b.breed)+': ':'')+b.side+'/'+b.breed+' ('+b.file+':'+b.line+(b.level?', '+b.level:'')+')'})];
  kids.push(el('div',{text:tx(K('d','rule'),{r:b.rule||'-',c:b.cls||'-',t:b.tier||'-',i:b.item||'-',s:fmt(b.skill),p:b.skillPerk||'-',v:fmt(b.vetStart),e:fmt(b.skillEff)})}));
  if(b.parts)kids.push(el('div',{text:tx(K('d','parts'),{w:fmt(b.parts.weapon),a:fmt(b.parts.addon),k:fmt(b.parts.kit),x:fmt(b.parts.extras),t:fmt(b.parts.throwable||0),tc:fmt(b.parts.throwableCp||0)})}));
  kids.push(el('div',{text:tx(K('d','calc'),{mp:fmt(b.calc&&b.calc.mp),cp:fmt(b.calc&&b.calc.cp),cw:fmt(b.calc&&b.calc.cw),mmp:fmt(b.mod.mp),mcp:fmt(b.mod.cp),mcw:fmt(b.mod.cw)})+(b.fixedCp?' '+tx(K('d','fixed'),{f:b.fixedCp}):'')}));
  var tb=el('tbody');(b.items||[]).forEach(function(i){tb.appendChild(el('tr',{},[el('td',{text:i.item}),el('td',{text:i.group||''}),el('td',{text:i.tier||tx(K('flat'))}),num(el('td',{text:fmt(i.count)})),el('td',{text:i.role+(i.level!=null?' ('+tx(K('lvl'))+' '+i.level+')':'')+(i.throwTier?' ('+tx(K('throwT'))+' '+i.throwTier+')':'')}),num(el('td',{text:fmt(i.mp)}))]))});
  if((b.items||[]).length)kids.push(el('table',{},[el('thead',{},[el('tr',{},['item','group','tier','count','role','mp'].map(function(k){return el('th',{text:tx(K('d',k))})}))]),tb]));
  if((b.unpriced||[]).length)kids.push(el('div',{class:'wzstat',text:tx(K('d','unpriced'),{l:b.unpriced.join(', ')})}));
  if((b.undetermined||[]).length)kids.push(el('div',{class:'wzstat',text:tx(K('d','undet'),{l:b.undetermined.join(', ')})}));
  kids.push(el('button',{type:'button',text:tx(K('close')),onclick:function(){openB=null;draw()}}));
  lf('detail',kids,{nm:K('b','detail')})}

 // ---------- Cards ----------
 // hero cards (button hero, paid with another resource: c.unit sp/dp/..): hidden unless their box is ticked; their cost is shown in that
 // resource plus its MP worth (c.costMp, from the model's {point_value}); the difference compares the calc with that MP worth
 var cSide,cRule,cQ,cDiff,cHero,cSort={k:'diff',d:true};
 var CCOLS0=[['file'],['side'],['name'],['rule'],['list'],['members'],['add'],['calc'],['cost'],['diff'],['seq']];
 var CCOLS_G=[['file'],['period'],['side'],['name'],['rule'],['list'],['members'],['add'],['gfair'],['ggame'],['gdiff']];
 function ccols(){return P&&P.goh?CCOLS_G:CCOLS0}
 function isHero(c){return !!c.hero||(c.unit!=null&&c.unit!=='mp')}
 function costMp(c){return c.unit==null||c.unit==='mp'?c.cost:c.costMp}
 function costText(c){if(c.cost==null)return '';if(c.unit==null||c.unit==='mp')return fmt(c.cost);
  return fmt(c.cost)+' '+unitOf(c.unit)+' '+(c.costMp!=null?tx(K('costMp'),{m:fmt(c.costMp)}):tx(K('noPv')))}
 function cVal(c,k){switch(k){case 'file':return c.file+':'+c.line;case 'side':return c.side;case 'name':return c.name;case 'rule':return c.rule;case 'list':return (c.list||[]).map(function(m){return m.who+(m.count>1?' x'+m.count:'')}).join(', ');
  case 'members':return c.rule==='hand'?null:c.members;case 'add':return c.add?c.add+' +'+fmt(c.addPrice):'';case 'period':return c.period;case 'calc':case 'gfair':return c.calc;case 'cost':case 'ggame':return c.cost;case 'diff':case 'gdiff':var cm=costMp(c);return c.calc!=null&&cm!=null?Math.round((c.calc-cm)*100)/100:null;
  case 'seq':return c.seq?tx(K('seqv'),{s:c.seq.step,n:c.seq.size,p:fmt(c.seq.percent),a:fmt(c.seq.avgCalc),b:fmt(c.seq.avgCost),o:fmt(c.seq.obsPercent)}):''}return null}
 function drawCards(){if(!cSide){cSide=sel(K('f','side'),[],'');cRule=sel(K('f','rule'),[],'');cQ=el('input',{type:'text',autocomplete:'off','aria-label':tx(K('f','q')),placeholder:tx(K('f','qph'))});cDiff=el('input',{type:'checkbox','aria-label':tx(K('f','diff'))});
   cHero=el('input',{type:'checkbox','aria-label':tx(K('f','hero'))});
   [cSide,cRule,cDiff,cHero].forEach(function(s){s.addEventListener('change',draw)});cQ.addEventListener('input',function(){clearTimeout(drawCards.t);drawCards.t=setTimeout(draw,80)});
   cKit=searchKit(cQ,{key:'balance.cards.q',index:function(q,done){kitHits(cItems(),q,done)},browse:BR_CARD})}
  fillSel(cSide,uniq(P.cards,function(c){return c.side}),K('f','allSides'));fillSel(cRule,uniq(P.cards,function(c){return c.rule}),K('f','allRules'));
  lf('opts',[vf('opts.side',K('f','side'),cSide),vf('opts.rule',K('f','rule'),cRule),vf('opts.q',K('f','q'),cKit.el),vf('opts.diff',K('f','diff'),cDiff),vf('opts.loc',K('f','loc'),locBox()),vf('opts.hero',K('f','hero'),cHero)],{box:'row',nm:K('b','opts')});
  var q=cQ.value.trim().toLowerCase(),nHero=P.cards.filter(isHero).length,list=P.cards.filter(function(c){return (cHero.checked||!isHero(c))&&(!cSide.value||String(c.side==null?'-':c.side)===cSide.value)&&(!cRule.value||c.rule===cRule.value)&&
   (!q||(c.name+' '+c.file+' '+cVal(c,'list')+' '+(cName(c)||'')).toLowerCase().indexOf(q)>=0)&&(!cDiff.checked||(c.rule!=='hand'&&c.fit!=='exact'))});
  lf('n',[el('div',{class:'hint',text:tx(K('cn'),{n:list.length,all:P.cards.length})+(nHero?' '+tx(cHero.checked?K('heroOn'):K('heroOff'),{n:nHero}):'')})]);
  if(locOn&&!NM)lf('nmwait',[el('div',{class:'hint',text:tx(K('loading'))})]);
  if(openC)cardDetail(openC);
  table('table',ccols(),sortBy(list,cSort,cVal),cSort,function(k){if(cSort.k===k)cSort.d=!cSort.d;else cSort={k:k,d:!!list.length&&typeof cVal(list[0],k)==='number'};draw()},function(c,col){
   var v=cVal(c,col[0]),ln=col[0]==='name'?cName(c):null;if(col[0]==='name')return el('td',{},[el('button',{type:'button',class:'link',title:tx(K('open')),text:ln||c.name,onclick:function(){openC=c.file+':'+c.line;draw()}})].concat(ln?[el('span',{class:'hint',text:' '+c.name})]:[]));
   if(col[0]==='diff'||col[0]==='gdiff')return diffTd(v);if((col[0]==='cost'||col[0]==='ggame')&&isHero(c))return num(el('td',{text:costText(c),title:tx(K('heroT'))}));var td=el('td',{text:fmt(v)});if(typeof v==='number')num(td);if(col[0]==='list')td.style.maxWidth='28em';return td})}
 function cardDetail(key){var c=P.cards.filter(function(x){return x.file+':'+x.line===key})[0];if(!c){openC=null;return}
  var kids=[el('h4',{text:(cName(c)?cName(c)+': ':'')+c.name+' ('+c.file+':'+c.line+')'}),el('div',{text:tx(K('d','card'),{r:c.rule,m:fmt(c.members),a:c.add?c.add+' +'+fmt(c.addPrice):'-',x:fmt(c.mult),f:fmt(c.factor),c:fmt(c.calc),k:isHero(c)?costText(c):fmt(c.cost)})})];
  if(isHero(c))kids.push(el('div',{class:'hint',text:tx(K('d','hero'),{b:c.button||'-',u:unitOf(c.unit),f:fmt(c.fore)})}));
  var tb=el('tbody');(c.list||[]).forEach(function(m){var b=P.breeds.filter(function(x){return x.side+'/'+x.breed===m.who}).pop(),mn=bName(m.who);tb.appendChild(el('tr',{},[el('td',{text:mn?mn+' ('+m.who+')':m.who}),num(el('td',{text:String(m.count)})),num(el('td',{text:b&&b.calc?fmt(b.calc.mp):'-'})),num(el('td',{text:b&&b.calc?fmt(b.calc.mp*m.count):'-'}))]))});
  if((c.list||[]).length)kids.push(el('table',{},[el('thead',{},[el('tr',{},['who','count','mp','sum'].map(function(k){return el('th',{text:tx(K('d',k))})}))]),tb]));
  if(c.seq){var sq=P.cards.filter(function(x){return x.seq&&x.seq.key===c.seq.key}).sort(function(a,b){return a.seq.step-b.seq.step}),t2=el('tbody');
   sq.forEach(function(x){t2.appendChild(el('tr',{},[num(el('td',{text:String(x.seq.step)})),num(el('td',{text:fmt(x.seq.percent)})),num(el('td',{text:fmt(x.calc)})),num(el('td',{text:fmt(x.cost)})),num(el('td',{text:fmt(x.seq.obsPercent)})),el('td',{text:x.seq.pattern||''})]))});
   kids.push(el('div',{text:tx(K('d','seq'),{f:c.seq.family||'-',n:c.seq.size,a:fmt(c.seq.avgCalc),b:fmt(c.seq.avgCost)})}));
   kids.push(el('table',{},[el('thead',{},[el('tr',{},['step','pct','ccalc','cost','obs','pattern'].map(function(k){return el('th',{text:tx(K('d',k))})}))]),t2]))}
  if((c.missing||[]).length)kids.push(el('div',{class:'wzstat',text:tx(K('d','missing'),{l:c.missing.join(', ')})}));
  if(c.ambiguous)kids.push(el('div',{class:'wzstat',text:c.ambiguous}));
  kids.push(el('button',{type:'button',text:tx(K('close')),onclick:function(){openC=null;draw()}}));
  lf('detail',kids,{nm:K('b','detail')})}

 // ---------- Model ----------
 var mErr=el('div');
 function tryOp(op){if(busy)return;busy=true;clear(mErr);
  api('/api/x/balance/prices/try',req({text:text,ops:[op]}),{what:tx('balance.job.try')}).then(function(j){busy=false;text=j.text;edits+=j.edits||0;P=j;
   (j.errs||[]).forEach(function(e){mErr.appendChild(el('div',{class:'err',text:e}))});
   if(j.moved)mErr.appendChild(el('div',{class:'ok',text:tx(K('m','moved'),{b:j.moved.breeds,c:j.moved.cards})}));stateSay();draw()})
   .catch(function(e){busy=false;clear(mErr);mErr.appendChild(el('div',{class:e.cancelled?'hint':'err',text:e.message}));draw()})}
 function short(p){return p.filter(function(s){return s!=='price_model'}).join(' > ')}
 // GoH model view: the terms as tables, a price box per term (prices/try op term; empty = the term goes), Save / Discard, and while the
 // mod has no model of its own the fitted terms as a starting model (prices/seed)
 function drawGohModel(){var m=P.gohModel||{},van=P.state.indexOf('vanilla')>=0;
  lf('btns',[el('button',{type:'button',class:'primary',disabled:van||(!edits&&!!P.model.file),text:tx(K('m','save')),onclick:saveModel}),
   el('button',{type:'button',disabled:!edits,text:tx(K('m','discard')),onclick:function(){edits=0;load(true)}})],{cls:'row'});
  if(!P.model.file&&!edits)lf('seed',[vb('seed.btns',[el('button',{type:'button',text:tx(K('seed','preview')),onclick:function(){seedGo(false)}}),el('button',{type:'button',disabled:!seedPv||van,text:tx(K('seed','write')),onclick:function(){seedGo(true)}})],{cls:'row'}),
   vb('seed.hint',[el('div',{class:'hint',text:tx(K('goh','seedHint'))})]),vb('seed.res',[seedBox])],{box:'col',nm:K('b','seed')});
  lf('fit',[el('div',{text:tx(K('m','fitNow'))+' '+fitText(P.fit)}),el('div',{class:'hint',text:tx(K('goh','mhint'))})]);
  lf('errs',[mErr],{nm:K('b','errs')});
  ['weapons','tiers','vets','extras','specials'].forEach(function(g){var rows=m[g]||[],tb=el('tbody');
   rows.forEach(function(x){var inp=el('input',{type:'text',autocomplete:'off',size:7,'aria-label':tx(K('goh','t',g))+' '+x.key});inp.value=x.price==null?'':fmt(x.price);
    inp.addEventListener('change',function(){var s=inp.value.trim(),v=s===''?null:Number(s);if(v!==null&&(!isFinite(v)||v<0)){clear(mErr);mErr.appendChild(el('div',{class:'err',text:tx(K('goh','bad'))}));return}tryOp({op:'term',group:g,key:String(x.key),price:v})});
    tb.appendChild(el('tr',{},[el('td',{text:String(x.key)}),num(el('td',{},[inp])),num(el('td',{text:String(x.rows==null?'':x.rows)}))]))});
   lf('goh.'+g,[el('h4',{text:tx(K('goh','t',g))+' ('+rows.length+')'})].concat(rows.length?[el('table',{},[el('thead',{},[el('tr',{},['k','p','n'].map(function(k){return el('th',{text:tx(K('goh','col',k))})}))]),tb])]:[el('div',{class:'hint',text:tx(K('m','none'))})]),{nm:K('b','list'),style:'overflow:auto;max-height:50vh'})})}
 function drawModel(){if(P.goh){drawGohModel();return}var ol=P.outline||{numbers:[],lists:[],blocks:[]},st=P.state||[];
  if(st.indexOf('noModel')>=0)drawSeed();
  var btns=[el('button',{type:'button',class:'primary',disabled:P.state.indexOf('vanilla')>=0||(!edits&&!!P.model.file),text:tx(K('m','save')),onclick:saveModel}),
   el('button',{type:'button',disabled:!edits,text:tx(K('m','discard')),onclick:function(){edits=0;load(true)}})];
  lf('btns',btns,{cls:'row'});
  lf('fit',[el('div',{text:tx(K('m','fitNow'))+' '+fitText(P.fit)}),el('div',{class:'hint',text:tx(K('m','hint'))})]);
  lf('errs',[mErr],{nm:K('b','errs')});
  drawPoints();
  // one top block of the model at a time: its numbers (tables per level, prices, percents...) and its item lists ({point_value}: the box above)
  var tops=ol.blocks.filter(function(b){return b.path.length===2&&b.tag!=='point_value'&&(ol.numbers.some(function(n){return under(n.path,b.path)})||ol.lists.some(function(l){return under(l.path,b.path)}))});
  if(!tops.length){lf('empty',[el('div',{class:'hint',text:tx(K('m','empty'))})]);return}
  var keys=tops.map(function(b){return b.path.join('>')});if(!pick1||keys.indexOf(pick1)<0)pick1=keys[0];
  var bsel=sel(K('m','block'),tops.map(function(b){return [b.path.join('>'),short(b.path)+(b.label?' ('+b.label+')':'')]}),pick1);bsel.addEventListener('change',function(){pick1=bsel.value;draw()});
  lf('pick',[vf('pick.block',K('m','block'),bsel)],{box:'row',nm:K('b','opts')});
  var path=pick1.split('>'),ns=ol.numbers.filter(function(n){return under(n.path,path)}),ls=ol.lists.filter(function(l){return under(l.path,path)});
  if(ns.length)lf('nums',ns.map(function(n,i){var inp=el('input',{type:'text',autocomplete:'off',size:Math.min(60,Math.max(6,n.values.join(' ').length+2))});inp.value=n.values.join(' ');
   inp.addEventListener('change',function(){var v=inp.value.trim().split(/[\s,;]+/).filter(Boolean).map(Number);if(!v.length||v.some(function(x){return !isFinite(x)})){clear(mErr);mErr.appendChild(el('div',{class:'err',text:tx(K('m','nums'))}));return}tryOp({op:'set',path:n.path,values:v})});
   return vf('nums.'+i,null,inp,short(n.path.slice(path.length-1))+' ('+tx(K('m','line'))+' '+n.line+')')}),{box:'col',nm:K('b','nums')});
  var targets=ol.lists.map(function(l){return [JSON.stringify(l.path),short(l.path)]});
  ls.forEach(function(l,i){var tb=el('tbody');l.items.forEach(function(it){var mv=sel(K('m','move'),[['',tx(K('m','stay'))]].concat(targets.filter(function(t){return t[0]!==JSON.stringify(l.path)})),'');
    mv.addEventListener('change',function(){if(mv.value)tryOp({op:'move',item:it.name,to:JSON.parse(mv.value)})});tb.appendChild(el('tr',{},[el('td',{text:it.name}),el('td',{class:'hint',text:it.comment}),el('td',{},[mv])]))});
   lf('list.'+i,[el('h4',{text:short(l.path)+' ('+tx(K('m','items'),{n:l.items.length})+')'})].concat(l.items.length?[el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:tx(K('d','item'))}),el('th',{text:tx(K('m','note'))}),el('th',{text:tx(K('m','move'))})])]),tb])]:[el('div',{class:'hint',text:tx(K('m','none'))})]),{nm:K('b','list'),style:'overflow:auto;max-height:50vh'})})}
 // MP worth of one point of the other buy resources: the model's {point_value {sp N} {dp M}} (tools/pricecalc/model.js). sp = the game
 // modes' budget "hero" (the hero button), dp = a budget named "dp" [mod data decides; AS2 modes have no dp budget unless a mod adds one].
 // Empty = not set: the op removes that kind and hero cards then show no MP worth. Written only with Save model, like every model edit.
 function drawPoints(){var pv=P.pointValue||{},bud=(P.economy&&P.economy.budgets)||[];
  // SP = Assault Squad 2's hero budget; DP = what Gates of Hell calls its points (doctrine points). A mod with no "dp" budget in its game
  // modes does not use DP: the row says so and takes no input (a value already in the model is shown, kept and not changed from here)
  var rows=['sp','dp'].map(function(k){
   if(k==='dp'&&!bud.some(function(x){return x.res==='dp'}))return vb('points.dp',[el('div',{'data-pvoff':'dp',text:tx(K('pv','dp'))+': '+tx(K('pv','dpOff'))+(pv.dp!=null?' '+tx(K('pv','dpHeld'),{v:fmt(pv.dp)}):'')})]);
   var inp=el('input',{type:'text',autocomplete:'off',size:8,placeholder:tx(K('pv','unset')),'aria-label':tx(K('pv',k))});inp.value=pv[k]!=null?String(pv[k]):'';
   inp.addEventListener('change',function(){var s=inp.value.trim(),v=s===''?null:Number(s);if(v!==null&&(!isFinite(v)||v<0)){clear(mErr);mErr.appendChild(el('div',{class:'err',text:tx(K('pv','bad'))}));return}tryOp({op:'point',kind:k,value:v})});
   var b=bud.filter(function(x){return x.res===k}),n=P.cards.filter(function(c){return c.unit===k}).length;
   return vf('points.'+k,null,inp,tx(K('pv',k))+(pv[k]==null?' ('+tx(K('pv','unset'))+')':'')+': '+(b.length?tx(K('pv','used'),{b:b.map(function(x){return x.name+' ['+x.buttons.join(' ')+']'+(x.start!=null?' '+tx(K('pv','start'),{s:x.start}):'')}).join('; '),n:n}):tx(K('pv','none'))))});
  rows.push(vb('points.hint',[el('div',{class:'hint',text:tx(K('pv','hint'))})]));
  lf('points',rows,{box:'col',nm:K('b','points')})}
 function under(p,top){if(p.length<top.length)return false;for(var i=0;i<top.length;i++)if(p[i]!==top[i])return false;return true}
 function saveModel(){if(busy)return;busy=true;clear(mErr);mErr.appendChild(el('div',{class:'hint',text:tx(K('m','saving'))}));
  api('/api/x/balance/prices/save',req({text:text}),{what:tx('balance.job.save')}).then(function(j){busy=false;clear(mErr);mErr.appendChild(el('div',{class:'ok',text:tx(K('m','saved'),{f:j.rel,t:j.tag})}));S.modWrites=(S.modWrites||0)+1;edits=0;load(true)})
   .catch(function(e){busy=false;clear(mErr);mErr.appendChild(el('div',{class:e.cancelled?'hint':'err',text:e.message}))})}
 var seedBox=el('div');
 function drawSeed(){lf('seed',[vf('seed.rules',K('seed','rules'),rulesIn),vf('seed.mp',K('seed','mp'),mpIn),vf('seed.cp',K('seed','cp'),cpIn),
   vb('seed.btns',[el('button',{type:'button',text:tx(K('seed','preview')),onclick:function(){seedGo(false)}}),el('button',{type:'button',class:'primary',disabled:!seedPv||P.state.indexOf('vanilla')>=0,text:tx(K('seed','write')),onclick:function(){seedGo(true)}})],{cls:'row'}),
   vb('seed.hint',[el('div',{class:'hint',text:tx(K('seed','hint'))})]),vb('seed.res',[seedBox])],{box:'col',nm:K('b','seed')})}
 function seedGo(write){clear(seedBox);seedBox.appendChild(el('div',{class:'hint',text:tx(K('loading'))}));
  api('/api/x/balance/prices/seed',req({write:!!write}),{what:tx(write?'balance.job.seedw':'balance.job.seed')}).then(function(j){clear(seedBox);
   if(write){seedBox.appendChild(el('div',{class:'ok',text:tx(K('m','saved'),{f:j.rel,t:j.tag})}));seedPv=null;S.modWrites=(S.modWrites||0)+1;load(true);return}
   seedPv=j;seedBox.appendChild(el('div',{text:tx(K('seed','got'),{n:j.lines,i:j.items,s:j.source||'-'})+' '+fitText(j.fit)}));
   var pre=el('pre');pre.textContent=j.preview.split('\n').slice(0,200).join('\n');seedBox.appendChild(el('details',{},[el('summary',{text:tx(K('seed','text'))}),pre]));draw()})
   .catch(function(e){clear(seedBox);seedBox.appendChild(el('div',{class:e.cancelled?'hint':'err',text:e.message}))})}

 // ---------- write comment lines (plan -> preview -> apply with undo tag -> check), undo last ----------
 var actBox=el('div'),planBtn,applyBtn,undoBtn;
 planBtn=el('button',{type:'button',text:tx(K('a','plan')),onclick:function(){act('plan')}});
 applyBtn=el('button',{type:'button',class:'primary',disabled:true,text:tx(K('a','apply')),onclick:function(){act('apply')}});
 undoBtn=el('button',{type:'button',text:tx(K('a','undo')),onclick:function(){act('undo')}});
 // Gates of Hell: Preview / Write new prices (the mod's breed rows far from its saved model, else from the model fitted on the game;
 // only the price number changes, restore points first); the tick copies a game file into the mod first; Undo last takes a write back
 var cgBox=el('input',{type:'checkbox','aria-label':tx(K('goh','copy'))}),cgFld=fld('prices.act.copy',tx(K('goh','copy')),cgBox),fromGame=0;
 cgBox.addEventListener('change',function(){planned=null;clear(actBox);actSay()});
 function actSay(){var g=!!(P&&P.goh),off=!P||P.state.indexOf('vanilla')>=0;if(g&&!actBox.firstChild)actBox.appendChild(el('div',{class:'hint',text:tx(K('goh','ro'))}));
  planBtn.textContent=tx(g?K('goh','aplan'):K('a','plan'));applyBtn.textContent=tx(g?K('goh','aapply'):K('a','apply'));
  cgFld.style.display=g&&(fromGame>0||cgBox.checked)?'':'none';
  planBtn.disabled=off;undoBtn.disabled=off||!P.undo;applyBtn.disabled=off||!planned||planned!==stamp()||edits>0}
 function gohPlan(j){planned=j.files.length?stamp():null;fromGame=j.fromGame||0;
  actBox.appendChild(el('div',{text:tx(K('goh','planned'),{n:j.rows.length,f:j.files.length,t:Math.round(j.tol*100)})}));
  if(j.by)actBox.appendChild(el('div',{class:'hint',text:j.by}));
  if(fromGame&&!cgBox.checked)actBox.appendChild(el('div',{class:'wzstat',text:tx(K('goh','fromGame'),{n:fromGame})}));
  j.rows.slice(0,60).forEach(function(r){actBox.appendChild(el('div',{text:tx(K('goh','row'),{i:r.id,o:fmt(r.old),v:fmt(r.new),m:fmt(r.fair),g:r.game==null?'-':fmt(r.game)})+(r.via?' '+tx(K('goh','via'),{v:r.via}):'')+(r.copied?' '+tx(K('goh','copied')):'')}))});
  (j.refused||[]).slice(0,60).forEach(function(r){actBox.appendChild(el('div',{class:'wzstat',text:tx(K('goh','refused'),{i:r.id,f:r.file,l:r.line,w:r.why})}))});
  j.files.forEach(function(f){var pre=el('pre',{class:'diff'});pre.textContent=f.preview.map(function(x){return x.line+': '+x.text}).join('\n');actBox.appendChild(el('details',{},[el('summary',{text:tx(K('goh','file'),{f:f.rel,r:f.rewritten})}),pre]))})}
 function gohDone(j){planned=null;if(j.nothing){actBox.appendChild(el('div',{class:'hint',text:tx(K('a','nothing'))}));return}
  S.modWrites=(S.modWrites||0)+1;load(true);
  actBox.appendChild(el('div',{class:'ok',text:tx(K('goh','done'),{n:j.changed.length,u:j.undo})}));var ck=j.check||{findings:[],count:0};
  actBox.appendChild(el('div',{class:ck.count?'err':'ok',text:ck.count?tx(K('goh','checkBad'),{n:ck.count}):tx(K('goh','checkOk'))}));
  ck.findings.filter(function(f){return f.severity!=='info'}).slice(0,20).forEach(function(f){actBox.appendChild(el('div',{class:'err',text:f.file+': '+f.code+' '+f.msg}))});}
 function act(what){if(busy)return;if(what==='apply'&&(!planned||planned!==stamp())){toast(tx(K('a','planFirst')));return}
  if(edits>0&&what!=='undo'){clear(actBox);actBox.appendChild(el('div',{class:'wzstat',text:tx(K('a','saveFirst'))}));return}
  busy=true;clear(actBox);actBox.appendChild(el('div',{class:'hint',text:tx(K('loading'))}));
  api('/api/x/balance/prices/'+what,req(P&&P.goh&&what!=='undo'?{copyGame:cgBox.checked}:{}),{what:tx('balance.job.act.'+what)}).then(function(j){busy=false;clear(actBox);
   if(j.goh&&what==='plan')gohPlan(j);else if(P&&P.goh&&what==='apply')gohDone(j);
   else if(what==='plan'){planned=j.files.length||j.createModel?stamp():null;
    actBox.appendChild(el('div',{text:tx(K('a','planned'),{n:j.files.length,m:j.createModel?tx(K('a','plusModel')):''})}));
    if((j.outside||[]).length)actBox.appendChild(el('div',{class:'hint',text:tx(K('a','outside'),{l:j.outside.join(', ')})}));
    j.files.forEach(function(f){var pre=el('pre',{class:'diff'});pre.textContent=f.preview.map(function(x){return x.line+': '+x.text}).join('\n');actBox.appendChild(el('details',{},[el('summary',{text:tx(K('a','file'),{f:f.rel,a:f.added,r:f.rewritten})}),pre]))})}
   else if(what==='apply'){planned=null;if(j.nothing)actBox.appendChild(el('div',{class:'hint',text:tx(K('a','nothing'))}));
    else{actBox.appendChild(el('div',{class:'ok',text:tx(K('a','done'),{n:j.changed.length,t:j.tag})}));var ck=j.check||{findings:[],count:0};
     actBox.appendChild(el('div',{class:ck.count?'err':'ok',text:ck.count?tx(K('a','checkBad'),{n:ck.count}):tx(K('a','checkOk'))}));
     ck.findings.filter(function(f){return f.severity!=='info'}).slice(0,20).forEach(function(f){actBox.appendChild(el('div',{class:'err',text:f.file+': '+f.code+' '+f.msg}))});
     S.modWrites=(S.modWrites||0)+1;load(true)}}
   else{planned=null;actBox.appendChild(el('div',{class:'ok',text:tx(K('a','undone'),{n:j.changed.length,c:j.created.length,t:j.tag})}));S.modWrites=(S.modWrites||0)+1;load(true)}
   actSay()}).catch(function(e){busy=false;clear(actBox);actBox.appendChild(el('div',{class:e.cancelled?'hint':'err',text:e.message}));actSay()})}

 var c=card('prices',[blk('prices.intro',[el('div',{text:tx(K('intro'))})]),blk('prices.safe',[el('div',{class:'hint',text:tx(K('safe'))})]),blk('prices.say',[say],{name:tx(K('b','say'))}),blk('prices.fit',[fitBox],{name:tx(K('b','fit'))}),
  blk('prices.tabs',[tabs],{name:tx(K('b','tabs'))}),body,
  blk('prices.act',[blk('prices.act.btns',[planBtn,applyBtn,undoBtn],{'class':'row'}),cgFld,blk('prices.act.res',[actBox],{name:tx(K('b','act'))})],{box:'col',name:tx(K('a','title'))})],{name:tx(K('title'))});
 draw0();
 // read again on a mod change or a write elsewhere, but only once the user has asked for prices (a big mod takes seconds to read)
 return {card:c,refresh:function(){if(P||loadedFor)load(false)}}
}
`;
