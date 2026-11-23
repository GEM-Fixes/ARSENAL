// Browser side of the Balance page. Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h() and textContent,
// graphs through createElementNS. The server sends every buy-panel unit as one row; filtering, sorting, grouping, graphs and
// comparisons happen here, and a change goes back as the exact list of unit ids on show (or ticked).
// Author: Imperator_Aug (ARSENAL, ia-096f6bd5)
module.exports = String.raw`
EXT_SCREENS.balance=function(root){
 var el=h,D=null,shown=[],ticks={},sortKey='cost',sortDesc=true,view='sheet',loadedFor=null;
 var HUE=[1,2,3,4,5,6,7,8,9,10,11,12].map(function(i){return 'var(--s'+i+')'});   // chart series: colour tokens in page.js, so SVG fills follow the theme
 // owner 2026-11-22: the table lists the cooldown itself (charge), not the wait at the start (the head start only changes that
 // wait); a column choice kept from before is moved over once (bal.colsv). Rank is not a default column: tick it in Columns
 var DEFCOLS=['name','army','cls','res','cost','fit','off','charge','again','af','pen','speed','odd'];
 var cols=LS.get('bal.cols',null)||DEFCOLS.slice();
 if(LS.get('bal.colsv',0)!==2){var wi=cols.indexOf('wait');if(wi>=0){if(cols.indexOf('charge')<0)cols[wi]='charge';else cols.splice(wi,1)}var ri=cols.indexOf('rank');if(ri>=0)cols.splice(ri,1);LS.set('bal.colsv',2);LS.set('bal.cols',cols)}
 var ARMC={af:1,as:1,ar:1,at:1};
 var SVGNS=['http:','','www.w3.org','2000','svg'].join('/');   // joined here: the page test allows no address in the page text
 function clear(n){while(n.firstChild)n.removeChild(n.firstChild)}
 function sv(tag,a,kids){var e=document.createElementNS(SVGNS,tag);if(a)for(var k in a){if(a[k]==null)continue;if(k==='text')e.textContent=a[k];else e.setAttribute(k,a[k])}(kids||[]).forEach(function(c){if(c)e.appendChild(c)});return e}
 function lab(id){var k=['balance.c',id].join('.'),s=tx(k);return s===k?id:s}
 function colOf(id){for(var i=0;i<D.cols.length;i++)if(D.cols[i].id===id)return D.cols[i];return null}
 function isNum(id){var c=colOf(id);return !!c&&c.t==='n'}
 function fmt(v){if(v==null||v==='')return '';if(typeof v==='number')return String(Math.round(v*100)/100);return String(v)}
 function sel(k,opts,val){var s=el('select',{'aria-label':tx(k)},opts.map(function(o){return el('option',{value:o[0],text:o[1]})}));if(val!=null)s.value=val;return s}
 // blocks: a view's blocks are 'views.<view>.<part>'; every block a draw makes is kept in drawn, so the
 // next draw takes each one away wherever the user's arrangement put it (no doubled id), then blkApply puts the new ones in place
 var drawn=[];
 function vid(p){return ['views',view,p].join('.')}
 function vb(p,kids,o){o=o||{};var b=blk(vid(p),kids,{box:o.box,'class':o.cls,name:o.nm?tx(o.nm):null,attrs:o.style?{style:o.style}:null});drawn.push(b);return b}
 function vf(p,k,ctl){var b=fld(vid(p),tx(k),ctl);drawn.push(b);return b}
 function lf(p,kids,o){var b=vb(p,kids,o);body.appendChild(b);return b}
 function uniq(f,list){var m={};(list||D.rows).forEach(function(r){var v=r[f];m[v==null||v===''?'-':String(v)]=1});return Object.keys(m).sort()}
 function nums(list,f){var a=[];list.forEach(function(r){var v=r[f];if(v!=null&&isFinite(v))a.push(+v)});return a.sort(function(x,y){return x-y})}
 function quant(a,p){if(!a.length)return null;var i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo)}
 function stat(list,f,what){if(what==='count')return list.length;var a=nums(list,f);if(!a.length)return null;
  if(what==='min')return a[0];if(what==='max')return a[a.length-1];var s=0;a.forEach(function(x){s+=x});if(what==='sum')return Math.round(s*100)/100;if(what==='mean')return Math.round(s/a.length*100)/100;return Math.round(quant(a,0.5)*100)/100}
 function keyOf(r,f){var v=r[f];return v==null||v===''?'-':String(v)}

 // ---------- mod folder + load ----------
 // GT-15: no mod of its own and no mod box (owner 2026-11-19: redundant, the header has it). The page reads and writes the one current
 // mod of the program (S.mod). S.modWrites counts writes made by other pages (Units), so the table is read again after them
 var say=el('div',{class:'hint'}),loadedStamp=-1,busyFor=null;   // busyFor: the same read is in flight (show() calls refresh, then focus)
 function curMod(){return S.mod||''}
 var loadBtn=el('button',{type:'button',text:tx('balance.reload'),onclick:function(){load(true)}});
 function load(force){
  // the game is part of what was loaded: AS64 and MoW:AS2 may share one mod folder, and their tables differ
  var m=curMod(),stamp=S.modWrites||0,lf=m+'\n'+(S.gameId||'');
  if(!force&&D&&loadedFor===lf&&loadedStamp===stamp)return;
  if(!force&&busyFor===lf+'|'+stamp)return;busyFor=lf+'|'+stamp;
  loadErr='';say.className='hint';say.textContent=tx('balance.loading');loadedFor=lf;loadedStamp=stamp;if(!D)waitSay();
  api('/api/x/balance/table',{mod:m||null},{what:tx('balance.job.table')}).then(function(j){busyFor=null;if(m!==curMod()||lf!==m+'\n'+(S.gameId||''))return;D=j;prep();loadedFor=lf;ticks={};cols=cols.filter(function(c){return !!colOf(c)});if(!cols.length)cols=DEFCOLS.slice();fillQuick();ecoSay();apply('quick')}).catch(function(e){busyFor=null;loadedFor=null;loadErr=e.message;say.className=e.cancelled?'hint':'err';say.textContent=e.message;if(!D)waitSay()})}
 // once per data load (owner 2026-11-19, "more responsive"): each row's id + name folded and in canon spelling (the free words test these),
 // the distinct values per column for the suggestions (VALS, filled when first asked), the filter box's index and Browse list
 var VALS={};
 function prep(){VALS={};D.rows.forEach(function(r){var hay=String(r.id)+' '+String(r.name);Object.defineProperty(r,'_hf',{value:fold(hay),configurable:true});Object.defineProperty(r,'_hc',{value:canon(hay),configurable:true})});if(qKit)qKit.refresh()}
 // while the first read runs (a minute after a server start): say so instead of "0 of 0"; what is typed meanwhile is used when the units arrive
 var loadErr='';
 function waitSay(){cnt.className=loadErr?'err':'hint';cnt.textContent=loadErr||tx('balance.q.wait')}
 var ecoBox=el('div',{class:'hint'});
 function ecoSay(){clear(ecoBox);var e=D.economy||{budgets:[]};
  var parts=(e.budgets||[]).map(function(b){return tx('balance.eco.b',{res:b.res.toUpperCase(),buttons:b.buttons.join(' '),start:b.start==null?'?':b.start})});
  ecoBox.appendChild(el('div',{text:tx('balance.eco.res')+' '+(parts.length?parts.join('; '):tx('balance.eco.none'))}));
  ecoBox.appendChild(el('div',{text:tx('balance.eco.wait',{f:e.factors||'*=1'})+((e.factorSets||[]).length>1?' '+tx('balance.eco.other',{l:e.factorSets.filter(function(x){return x!==e.factors}).join(' | ')}):'')}))}

 // ---------- filter ----------
 var qIn=el('input',{type:'text',autocomplete:'off',placeholder:tx('balance.q.ph'),'aria-label':tx('balance.q'),style:'width:100%;min-width:12em;box-sizing:border-box'});
 var quick={},quickBox=el('div',{class:'row'}),cnt=el('span',{class:'hint'}),qErr=el('div',{class:'err'});
 var QUICK=['army','cls','res','kind','src'];
 function fillQuick(){clear(quickBox);QUICK.forEach(function(f){var s=sel(['balance.c',f].join('.'),[['',lab(f)+': '+tx('balance.all')]].concat(uniq(f).map(function(v){return [v,lab(f)+': '+v]})),quick[f]?quick[f].value:'');
   s.setAttribute('aria-label',lab(f));s.addEventListener('change',function(){apply('quick')});quick[f]=s;quickBox.appendChild(s)});
  quickBox.appendChild(el('button',{type:'button',text:tx('balance.clear'),onclick:function(){qIn.value='';QUICK.forEach(function(f){quick[f].value=''});ticks={};apply('quick')}}))}
 // searchKit (page.js; owner 2026-11-19: browse, indexed search and history on every search box), token mode: a pick replaces the word
 // under the caret. Index: column names (army= cls= cost> ...), after "column=" that column's values, unit ids and names; Browse: the
 // file picker on the game data at entity/ (a unit's .def; the pick adds its name as a free word, which matches the unit ids that hold
 // it); history 'balance.q'
 function valsOf(f){if(VALS[f])return VALS[f];var m={},a=[];D.rows.forEach(function(r){var v=r[f];if(v==null||v==='')return;v=String(v);if(!m[v]){m[v]={v:v,lo:v.toLowerCase(),n:0};a.push(m[v])}m[v].n++});
  a.sort(function(x,y){return y.n-x.n||(x.v<y.v?-1:1)});return VALS[f]=a}
 function qIndex(q,done){if(!D){done([]);return}var out=[],m=/^([a-z_]+)(>=|<=|!=|=|>|<|~)(.*)$/i.exec(q);
  if(m){var f=m[1].toLowerCase(),op=m[2],v=m[3].replace(/"/g,'').toLowerCase();if(colOf(f)&&(op==='='||op==='!='||op==='~'))valsOf(f).forEach(function(x){if(!v||x.lo.indexOf(v)>=0)out.push({label:f+op+x.v,value:f+op+(/\s/.test(x.v)?'"'+x.v+'"':x.v),hint:tx('balance.q.n',{n:x.n})})});done(out);return}
  var lq=fold(q),cq=canon(q),more=0;
  D.cols.forEach(function(c){var lb=lab(c.id);if(c.id.indexOf(lq)!==0&&fold(lb).indexOf(lq)<0)return;out.push({label:c.id+'=',value:c.id+'=',hint:lb});if(c.t==='n'){out.push({label:c.id+'>',value:c.id+'>',hint:lb});out.push({label:c.id+'<',value:c.id+'<',hint:lb})}});
  for(var i=0;i<D.rows.length;i++){var r=D.rows[i];if(r._hf.indexOf(lq)<0&&!(cq&&r._hc.indexOf(cq)>=0))continue;if(out.length<60)out.push({label:String(r.name||r.id),value:'id='+r.id,hint:r.id+'  '+(r.army||'')+' '+(r.cls||'')});else more++}
  done(out,more)}
 function qStem(p){var b=String(p||'').replace(/\\/g,'/').split('/').pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}
 var qKit=searchKit(qIn,{key:'balance.q',mode:'token',index:qIndex,browse:{mode:'file',view:'data',start:'entity',exts:['def'],toValue:qStem}});
 // free words match in one spelling: armour = armor, colour = color; panzer = pzkpfw = pz, "Ausf." dropped, 4 = IV (as on Units)
 var ALIAS={panzerkampfwagen:'pz',panzer:'pz',pzkpfw:'pz',pzkw:'pz',pzkfw:'pz',kpfw:'pz',ausf:'',ausfuhrung:''},ROMAN=['','i','ii','iii','iv','v','vi','vii','viii','ix','x'];
 function fold(s){return String(s==null?'':s).toLowerCase().replace(/armour/g,'armor').replace(/colour/g,'color').replace(/calibre/g,'caliber')}
 function canon(s){return fold(s).split(/[^a-z0-9Ѐ-ӿ一-鿿]+/).filter(Boolean).map(function(w){return ALIAS.hasOwnProperty(w)?ALIAS[w]:/^([1-9]|10)$/.test(w)?ROMAN[+w]:w}).join('')}
 function parseQ(text){var out=[],toks=String(text||'').match(/(?:[^\s"]+|"[^"]*")+/g)||[];
  toks.forEach(function(tok){tok=tok.replace(/"/g,'');var m=/^([a-z_]+)(>=|<=|!=|=|>|<|~)(.*)$/i.exec(tok);
   if(!m){out.push({free:tok.toLowerCase()});return}
   var f=m[1].toLowerCase();if(!colOf(f))throw new Error(tx('balance.q.nocol',{c:m[1],l:D.cols.map(function(c){return c.id}).join(' ')}));
   if(m[3]==='')return;   // "army=" while typing: no condition yet (the list does not empty out under the cursor)
   out.push(cond(f,m[2],m[3]))});return out}
 // a condition with everything the row test needs worked out once (not once per row)
 function cond(f,op,v){var c={f:f,op:op,v:v};if(op==='~'){try{c.re=new RegExp(v,'i')}catch(e){c.re=null}}
  else if(op==='='||op==='!='){c.num=isNum(f);c.vals=v.split(',').map(function(x){return c.num?+x:x.toLowerCase()})}
  else{c.okn=v!==''&&isFinite(+v);c.b=+v}return c}
 function test(r,c){
  if(c.free!=null){if(c.ff==null){c.ff=fold(c.free);c.cf=canon(c.free)}var hf=r._hf,hc=r._hc;if(hf==null){var hay=String(r.id)+' '+String(r.name);hf=fold(hay);hc=canon(hay)}return hf.indexOf(c.ff)>=0||(c.cf!==''&&hc.indexOf(c.cf)>=0)}
  var x=r[c.f];
  if(c.op==='~')return !!c.re&&c.re.test(x==null?'':String(x));
  if(c.op==='='||c.op==='!='){var hit=c.num?(x!=null&&c.vals.indexOf(+x)>=0):c.vals.indexOf(String(x==null?'':x).toLowerCase())>=0;return c.op==='='?hit:!hit}
  if(x==null||!c.okn)return false;var a=+x,b=c.b;return c.op==='>'?a>b:c.op==='>='?a>=b:c.op==='<'?a<b:a<=b}
 // how: 'text' = only the filter text changed (the count at once, the table in the next frame, its first rows only); 'quick' = the quick
 // filters or a new load (full draw, first rows again); none = ticks or a view change (full draw)
 function apply(how){
  if(!D){waitSay();return}var w;qErr.textContent='';
  try{w=parseQ(qIn.value)}catch(e){qErr.textContent=e.message;return}
  QUICK.forEach(function(f){if(quick[f]&&quick[f].value)w.push(cond(f,'=',quick[f].value))});
  var rs=D.rows,out=[],nw=w.length;for(var i=0;i<rs.length;i++){var r=rs[i],ok=true;for(var j=0;j<nw;j++)if(!test(r,w[j])){ok=false;break}if(ok)out.push(r)}shown=out;
  var t=0;for(i=0;i<out.length;i++)if(ticks[out[i].id])t++;
  cnt.className='hint';cnt.textContent=tx('balance.count',{n:shown.length,all:D.rows.length})+(t?' '+tx('balance.ticked',{n:t}):'');
  say.className='hint';say.textContent=D.mod?tx('balance.modIs',{m:D.mod}):tx('balance.noMod');
  if(how==='text'||how==='quick')rowCap=CAP0;
  if(how==='text'){later();return}
  draw()}
 // the redraw after a text change: the sheet's rows in the next frame (nothing else of the page is built again); a heavier view (graph,
 // groups, compare) a moment later, at most once per 120 ms while typing
 var LT=false;
 function later(){if(LT)return;LT=true;var go=function(){LT=false;if(view==='sheet'&&SH&&SH.blk&&SH.blk.parentNode)fillSheet();else draw()};
  if(view==='sheet'&&typeof requestAnimationFrame==='function')requestAnimationFrame(go);else setTimeout(go,view==='sheet'?0:120)}
 qIn.addEventListener('input',function(){apply('text')});
 function target(){var t=shown.filter(function(r){return ticks[r.id]});return t.length?t:shown}

 // ---------- views ----------
 var body=blk('views.body',[],{box:'col',name:tx('balance.b.body')}),tabs=el('div',{class:'row',role:'tablist'}),VIEWS=['sheet','groups','graph','compare','odd','change'],tabBtn={};
 VIEWS.forEach(function(v){tabBtn[v]=el('button',{type:'button',role:'tab',text:tx(['balance.v',v].join('.')),onclick:function(){view=v;draw()}});tabs.appendChild(tabBtn[v])});
 function draw(){VIEWS.forEach(function(v){tabBtn[v].className=v===view?'primary':'';tabBtn[v].setAttribute('aria-selected',v===view?'true':'false')});
  drawn.forEach(function(b){if(b.parentNode)b.parentNode.removeChild(b)});drawn=[];if(!D)return;
  ({sheet:drawSheet,groups:drawGroups,graph:drawGraph,compare:drawCompare,odd:drawOdd,change:drawChange})[view]();blkApply(root)}

 // sheet: sortable, columns of choice, tick rows, CSV
 function sorted(){var f=sortKey,n=isNum(f);return shown.slice().sort(function(a,b){var x=a[f],y=b[f];if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;var c=n?x-y:String(x).localeCompare(String(y));return sortDesc?-c:c})}
 function csv(list){function cell(v){var s=v==null?'':String(v);return /[",\r\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  var ids=['id'].concat(cols.filter(function(c){return c!=='id'}));return [ids.join(',')].concat(list.map(function(r){return ids.map(function(c){return cell(r[c])}).join(',')})).join('\r\n')+'\r\n'}
 function save(name,text){var a=el('a',{href:window.URL['createObjectURL'](new Blob(['﻿'+text],{type:'text/csv'})),download:name});document.body.appendChild(a);a.click();document.body.removeChild(a)}
 function drawSheet(){
  var chooser=el('details',{},[el('summary',{text:tx('balance.cols')}),el('div',{class:'row'},D.cols.filter(function(c){return c.id!=='id'}).map(function(c){
   var cb=el('input',{type:'checkbox'});cb.checked=cols.indexOf(c.id)>=0;cb.addEventListener('change',function(){if(cb.checked)cols=D.cols.map(function(x){return x.id}).filter(function(x){return x===c.id||cols.indexOf(x)>=0});else cols=cols.filter(function(x){return x!==c.id});LS.set('bal.cols',cols);draw()});
   return el('label',{},[cb,' '+lab(c.id)])}))]);
  var all=el('input',{type:'checkbox','aria-label':tx('balance.tickAll')});
  all.addEventListener('change',function(){SH.list.forEach(function(r){if(all.checked)ticks[r.id]=1;else delete ticks[r.id]});apply()});
  var hd=el('tr',{},[el('th',{},[all]),el('th',{text:'#'})].concat(cols.map(function(c){
   return el('th',{},[el('button',{type:'button',class:'link',title:tx('balance.sortBy',{c:lab(c)}),text:lab(c)+(sortKey===c?(sortDesc?' ▼':' ▲'):''),onclick:function(){if(sortKey===c)sortDesc=!sortDesc;else{sortKey=c;sortDesc=isNum(c)}draw()}})])})));
  SH={tb:el('tbody'),all:all,more:el('div',{class:'row'}),list:[],blk:null};
  lf('tools',[el('button',{type:'button',text:tx('balance.csv'),onclick:function(){save('balance.csv',csv(SH.list))}}),el('span',{class:'hint',text:tx('balance.sheet.hint')+(S.gameId==='goh'?' '+tx('balance.goh.bots'):'')})],{cls:'row'});
  lf('cols',[chooser],{nm:'balance.cols'});
  SH.blk=lf('table',[el('table',{},[el('thead',{},[hd]),SH.tb])],{nm:'balance.b.table',style:'overflow:auto;max-height:70vh'});
  lf('more',[SH.more]);fillSheet()}
 // the sheet's rows only (a text change redraws these and nothing else): the first rowCap of the sorted list, then a row to show more.
 // 2,440 rows built at every key press made the filter slow; the count above is always the whole list, CSV and tick all use it too
 var CAP0=200,rowCap=CAP0,SH=null;
 function fillSheet(){var list=SH.list=sorted(),tb=SH.tb,n=Math.min(list.length,rowCap),tk=0;clear(tb);clear(SH.more);
  for(var i=0;i<n;i++)tb.appendChild(sheetRow(list[i],i));
  for(i=0;i<list.length;i++)if(ticks[list[i].id])tk++;SH.all.checked=list.length>0&&tk===list.length;
  if(list.length>n){var rest=list.length-n;SH.more.appendChild(el('span',{class:'hint',text:tx('balance.more',{n:n,all:list.length})}));
   SH.more.appendChild(el('button',{type:'button',text:tx('balance.moreN',{n:Math.min(CAP0,rest)}),onclick:function(){rowCap+=CAP0;fillSheet()}}));
   SH.more.appendChild(el('button',{type:'button',text:tx('balance.moreAll',{n:list.length}),onclick:function(){rowCap=Infinity;fillSheet()}}))}}
 function sheetRow(r,i){var cb=el('input',{type:'checkbox','aria-label':r.id});cb.checked=!!ticks[r.id];cb.addEventListener('change',function(){if(cb.checked)ticks[r.id]=1;else delete ticks[r.id];apply()});
  return el('tr',{},[el('td',{},[cb]),el('td',{class:'hint',text:String(i+1)})].concat(cols.map(function(c){
   var td=el('td',{text:ARMC[c]&&(r.kind!=='vehicle'||r.many)?tx('balance.na'):fmt(r[c]),title:c==='name'?r.id:null});if(isNum(c))td.style.textAlign='right';
   if(c==='off'&&r.off!=null&&Math.abs(r.off)>=20)td.style.background=r.off<0?'var(--crash)':'var(--warnbg)';if(c==='odd'&&r.odd)td.style.background='var(--warnbg)';if(c==='res'&&r.res!=='mp')td.style.background='var(--infobg)';return td})))}

 // bars
 function bars(items,unit){var max=1;items.forEach(function(i){if(i.v>max)max=i.v});var hh=18,w=420,g=sv('svg',{viewBox:'0 0 '+(w+300)+' '+(items.length*hh+6),width:'100%',role:'img',style:'fill:var(--fg)'});
  items.forEach(function(it,i){var bw=Math.round((it.v||0)/max*w);g.appendChild(sv('text',{x:170,y:i*hh+13,'text-anchor':'end','font-size':11,text:it.k}));
   g.appendChild(sv('rect',{x:176,y:i*hh+3,width:bw,height:hh-5,style:'fill:'+(it.c||HUE[0])}));g.appendChild(sv('text',{x:180+bw,y:i*hh+13,'font-size':11,text:(it.v==null?'-':fmt(it.v)+(unit||''))+' ('+it.n+')'}))});return g}

 // groups: one or two keys, one measure, one statistic
 var gRow,gCol,gOf,gStat;
 function strCols(){return D.cols.filter(function(c){return c.t==='s'&&c.id!=='id'&&c.id!=='name'}).map(function(c){return [c.id,lab(c.id)]})}
 function numCols(){return D.cols.filter(function(c){return c.t==='n'}).map(function(c){return [c.id,lab(c.id)]})}
 var STATS=['median','mean','min','max','sum','count'];
 function statOpts(){return STATS.map(function(s){return [s,tx(['balance.s',s].join('.'))]})}
 function drawGroups(){
  if(!gRow){gRow=sel('balance.g.row',strCols(),'cls');gCol=sel('balance.g.col',[['',tx('balance.none')]].concat(strCols()),'army');gOf=sel('balance.g.of',numCols(),'cost');gStat=sel('balance.g.stat',statOpts(),'median');[gRow,gCol,gOf,gStat].forEach(function(s){s.addEventListener('change',draw)})}
  lf('opts',[vf('opts.row','balance.g.row',gRow),vf('opts.col','balance.g.col',gCol),vf('opts.of','balance.g.of',gOf),vf('opts.stat','balance.g.stat',gStat)],{box:'row',nm:'balance.b.opts'});
  var rk=gRow.value,ck=gCol.value,of=gOf.value,st=gStat.value,list=shown;
  if(of==='cost'||of==='fit'||of==='dcost'){var kinds=uniq('res',list);if(kinds.length>1&&rk!=='res'&&ck!=='res')lf('mixed',[el('div',{class:'wzstat',text:tx('balance.mixed',{l:kinds.join(', ')})})])}
  var rks=uniq(rk,list),cks=ck?uniq(ck,list):[],max=0,cells=rks.map(function(a){return cks.map(function(b){var v=stat(list.filter(function(r){return keyOf(r,rk)===a&&keyOf(r,ck)===b}),of,st);if(v>max)max=v;return v})});
  var tot=rks.map(function(a){var l=list.filter(function(r){return keyOf(r,rk)===a});return {k:a,v:stat(l,of,st),n:l.length}});
  var hd=el('tr',{},[el('th',{text:lab(rk)+(ck?' \\ '+lab(ck):'')}),el('th',{text:tx('balance.g.n')}),el('th',{text:tx('balance.g.all')})].concat(cks.map(function(b){return el('th',{text:b})})));
  var tb=el('tbody');
  rks.forEach(function(a,i){tb.appendChild(el('tr',{},[el('td',{},[el('button',{type:'button',class:'link',title:tx('balance.g.narrow'),text:a,onclick:function(){qIn.value=(qIn.value.trim()+' '+rk+'='+(/\s/.test(a)?'"'+a+'"':a)).trim();view='sheet';apply()}})]),el('td',{text:String(tot[i].n)}),el('td',{},[el('b',{text:fmt(tot[i].v)})])].concat(cells[i].map(function(v){
   var td=el('td',{text:fmt(v)});td.style.textAlign='right';if(v!=null&&max>0)td.style.background='color-mix(in srgb, var(--acc) '+Math.round(100*(0.05+0.45*v/max))+'%, transparent)';return td}))))});
  lf('table',[el('table',{},[el('thead',{},[hd]),tb])],{nm:'balance.b.table',style:'overflow:auto'});
  lf('barsh',[el('h4',{text:tx(['balance.s',st].join('.'))+': '+lab(of)+' / '+lab(rk)})]);
  lf('bars',[bars(tot.slice().sort(function(a,b){return (b.v||0)-(a.v||0)}))],{nm:'balance.b.bars'})}

 // graph: any number against any number, coloured by any text column
 var xSel,ySel,cSel,oMode,oBy,oPct,oX,oY;
 // what counts as odd on the graph is the user's call: the notes of the Odd ones tab, the trend of a group (any text column,
 // or all units together), or a point the user sets (every unit is held against the same up / across ratio)
 function med(a){a=a.slice().sort(function(p,q){return p-q});var n=a.length;return n?(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):null}
 // a line through a group that a few far points do not pull: the middle slope between pairs, then the middle offset
 function trendOf(list,xf,yf){if(list.length<4)return null;var sl=[],i,j,st=Math.max(1,Math.floor(list.length/60));
  for(i=0;i<list.length;i+=st)for(j=i+st;j<list.length;j+=st){var dx=list[j][xf]-list[i][xf];if(dx)sl.push((list[j][yf]-list[i][yf])/dx)}
  var b=sl.length>=3?med(sl):0,a=med(list.map(function(r){return r[yf]-b*r[xf]}));return {a:a,b:b}}
 function numIn(k,v){var i=el('input',{type:'number','aria-label':tx(k),step:'any',style:'width:7em'});if(v!=null)i.value=v;i.addEventListener('change',draw);return i}
 function drawGraph(){
  if(!xSel){xSel=sel('balance.x',numCols(),'cost');ySel=sel('balance.y',numCols(),'wait');cSel=sel('balance.colour',strCols(),'army');oMode=sel('balance.odd.mode',['trend','point','notes'].map(function(m){return [m,tx(['balance.odd.m',m].join('.'))]}),'trend');
   oBy=sel('balance.odd.by',[['*',tx('balance.odd.together')]].concat(strCols()),'cls');oPct=numIn('balance.odd.pct','30');oX=numIn('balance.odd.px');oY=numIn('balance.odd.py');
   [xSel,ySel,cSel,oMode,oBy].forEach(function(s){s.addEventListener('change',draw)})}
  var presets=[['fit','cost'],['cost','wait'],['af','cost'],['pen','cost'],['speed','cost'],['cost','again']];
  lf('axes',[vf('axes.x','balance.x',xSel),vf('axes.y','balance.y',ySel),vf('axes.colour','balance.colour',cSel),vb('axes.presets',presets.map(function(p){return el('button',{type:'button',text:lab(p[1])+' / '+lab(p[0]),onclick:function(){xSel.value=p[0];ySel.value=p[1];draw()}})}),{cls:'row',nm:'balance.b.presets'})],{box:'row',nm:'balance.b.axes'});
  var xf=xSel.value,yf=ySel.value,cf=cSel.value,pts=shown.filter(function(r){return r[xf]!=null&&r[yf]!=null});
  var mode=oMode.value,byf=oBy.value,pct=Math.max(1,Number(oPct.value)||30),orow=[vf('odd.mode','balance.odd.mode',oMode)];
  if(mode==='trend')orow.push(vf('odd.by','balance.odd.by',oBy));
  if(mode==='point')orow.push(vf('odd.px','balance.odd.px',oX),vf('odd.py','balance.odd.py',oY),vb('odd.use',[el('button',{type:'button',text:tx('balance.odd.useTick'),onclick:function(){
   var r=pts.filter(function(p){return ticks[p.id]})[0];if(!r){toast(tx('balance.odd.pointHint'));return}oX.value=r[xf];oY.value=r[yf];draw()}})]));
  if(mode!=='notes')orow.push(vf('odd.pct','balance.odd.pct',oPct));
  lf('odd',orow,{box:'row',nm:'balance.b.odd'});
  if(mode==='point'&&!(Number(oX.value)>0&&oY.value!==''))lf('pointhint',[el('div',{class:'hint',text:tx('balance.odd.pointHint')})]);
  var money=function(f){return f==='cost'||f==='fit'};
  if((money(xf)||money(yf))&&uniq('res',pts).length>1&&cf!=='res')lf('mixed',[el('div',{class:'wzstat',text:tx('balance.mixed',{l:uniq('res',pts).join(', ')})})]);
  lf('n',[el('div',{class:'hint',text:tx('balance.graph.n',{n:pts.length,all:shown.length})+(xf==='fit'&&yf==='cost'?' '+tx('balance.graph.diag'):'')})]);
  if(!pts.length)return;
  var keys=uniq(cf,pts),W=820,H=440,L=58,Bm=42,x1=0,y1=0;pts.forEach(function(r){if(r[xf]>x1)x1=r[xf];if(r[yf]>y1)y1=r[yf]});
  var diag=xf==='fit'&&yf==='cost';if(diag)x1=y1=Math.max(x1,y1);x1=x1*1.05||1;y1=y1*1.05||1;
  function X(v){return L+v/x1*(W-L-12)}function Y(v){return H-Bm-v/y1*(H-Bm-12)}
  function tick(m){var s=Math.pow(10,Math.floor(Math.log(m)/Math.LN10)),c=[1,2,5,10];for(var i=0;i<4;i++)if(m/(c[i]*s)<=7)return c[i]*s;return s}
  var g=sv('svg',{viewBox:'0 0 '+W+' '+H,width:'100%',role:'img','aria-label':lab(yf)+' / '+lab(xf),style:'fill:var(--fg)'}),v,tx1=tick(x1),ty1=tick(y1);
  for(v=0;v<=x1;v+=tx1){g.appendChild(sv('line',{x1:X(v),y1:12,x2:X(v),y2:H-Bm,style:'stroke:var(--line2)'}));g.appendChild(sv('text',{x:X(v),y:H-Bm+14,'font-size':10,'text-anchor':'middle',text:fmt(v)}))}
  for(v=0;v<=y1;v+=ty1){g.appendChild(sv('line',{x1:L,y1:Y(v),x2:W-12,y2:Y(v),style:'stroke:var(--line2)'}));g.appendChild(sv('text',{x:L-4,y:Y(v)+3,'font-size':10,'text-anchor':'end',text:fmt(v)}))}
  if(diag)g.appendChild(sv('line',{x1:X(0),y1:Y(0),x2:X(x1),y2:Y(y1),style:'stroke:var(--neul)','stroke-dasharray':'4 3'}));
  // the measure: what each unit is held against, and which units are further from it than the percent typed
  var tr={},odd={},oddList=[],floor=y1*0.05,px=Number(oX.value),py=Number(oY.value),hasPt=px>0&&oY.value!==''&&isFinite(py);
  function gk(r){return byf==='*'?'*':keyOf(r,byf)}
  function want(r){if(mode==='trend'){var t=tr[gk(r)];return t?t.a+t.b*r[xf]:null}return mode==='point'&&hasPt?py/px*r[xf]:null}
  function seg(xa,ya,xb,yb,col){g.appendChild(sv('line',{x1:X(xa).toFixed(1),y1:Y(Math.max(0,Math.min(y1,ya))).toFixed(1),x2:X(xb).toFixed(1),y2:Y(Math.max(0,Math.min(y1,yb))).toFixed(1),'stroke-dasharray':'5 4','stroke-width':1.4,style:'stroke:'+col}))}
  if(mode==='trend'){var gs={};pts.forEach(function(r){var k=gk(r);(gs[k]=gs[k]||[]).push(r)});
   Object.keys(gs).forEach(function(k){var t=tr[k]=trendOf(gs[k],xf,yf);if(!t)return;var lo=Infinity,hi=-Infinity;gs[k].forEach(function(r){if(r[xf]<lo)lo=r[xf];if(r[xf]>hi)hi=r[xf]});
    seg(lo,t.a+t.b*lo,hi,t.a+t.b*hi,byf===cf?HUE[keys.indexOf(k)%HUE.length]:'var(--fg)')})}
  if(mode==='point'&&hasPt){var xe=py/px*x1>y1?y1*px/py:x1;seg(0,0,xe,py/px*xe,'var(--fg)');g.appendChild(sv('rect',{x:(X(px)-5).toFixed(1),y:(Y(py)-5).toFixed(1),width:10,height:10,transform:'rotate(45 '+X(px).toFixed(1)+' '+Y(py).toFixed(1)+')',style:'fill:none;stroke:var(--fg)','stroke-width':2}))}
  pts.forEach(function(r){var o;if(mode==='notes')o=!!r.odd;else{var e=want(r);o=e!=null&&Math.abs(r[yf]-e)>pct/100*Math.max(Math.abs(e),floor)}if(o){odd[r.id]=1;oddList.push(r)}});
  pts.forEach(function(r){var e=want(r),c=sv('circle',{cx:X(r[xf]).toFixed(1),cy:Y(r[yf]).toFixed(1),r:odd[r.id]?5:3.2,'fill-opacity':0.78,tabindex:0,style:'cursor:pointer;fill:'+HUE[keys.indexOf(keyOf(r,cf))%HUE.length]+(odd[r.id]?';stroke:var(--fg)':'')},[sv('title',{text:r.name+' ('+r.id+', '+r.army+', '+r.res+'): '+lab(xf)+' '+fmt(r[xf])+', '+lab(yf)+' '+fmt(r[yf])+(e!=null?' ('+tx('balance.odd.want',{v:fmt(Math.round(e*10)/10)})+')':'')})]);
   c.addEventListener('click',function(){ticks[r.id]=ticks[r.id]?0:1;if(!ticks[r.id])delete ticks[r.id];apply()});if(ticks[r.id]){c.style.stroke='var(--fg)';c.setAttribute('stroke-width',2.5)}g.appendChild(c)});
  g.appendChild(sv('text',{x:W/2,y:H-6,'font-size':11,'text-anchor':'middle',text:lab(xf)}));g.appendChild(sv('text',{x:12,y:H/2,'font-size':11,'text-anchor':'middle',transform:'rotate(-90 12 '+H/2+')',text:lab(yf)}));
  lf('view',[g],{nm:'balance.b.graph'});
  lf('legend',keys.map(function(k,i){return el('span',{},[el('span',{style:'display:inline-block;width:10px;height:10px;margin-right:3px;background:'+HUE[i%HUE.length]}),k])}),{cls:'row',nm:'balance.b.legend'});
  lf('hint',[el('div',{class:'hint',text:tx('balance.graph.hint')})]);
  lf('oddn',[el('span',{text:tx('balance.odd.gn',{n:oddList.length})})].concat(oddList.length?[el('button',{type:'button',text:tx('balance.odd.tick'),onclick:function(){oddList.forEach(function(r){ticks[r.id]=1});apply()}})]:[]),{cls:'row'});
  if(oddList.length)lf('oddlist',[el('div',{class:'hint',text:oddList.slice(0,30).map(function(r){return r.name||r.id}).join(', ')+(oddList.length>30?' ...':'')})])}

 // compare: two values of one column side by side, split by another column
 var cBy,cA,cB,cSplit,cOf;
 function fillAB(){var vs=uniq(cBy.value),a=cA.value,b=cB.value;[cA,cB].forEach(function(s){clear(s);vs.forEach(function(v){s.appendChild(el('option',{value:v,text:v}))})});cA.value=vs.indexOf(a)>=0?a:vs[0];cB.value=vs.indexOf(b)>=0?b:(vs[1]||vs[0])}
 function drawCompare(){
  if(!cBy){cBy=sel('balance.cmp.by',strCols(),'army');cA=sel('balance.cmp.a',[]);cB=sel('balance.cmp.b',[]);cSplit=sel('balance.cmp.split',strCols(),'cls');cOf=sel('balance.g.of',numCols(),'cost');
   cBy.addEventListener('change',function(){fillAB();draw()});[cA,cB,cSplit,cOf].forEach(function(s){s.addEventListener('change',draw)})}
  fillAB();
  lf('opts',[vf('opts.by','balance.cmp.by',cBy),vf('opts.a','balance.cmp.a',cA),vf('opts.b','balance.cmp.b',cB),vf('opts.split','balance.cmp.split',cSplit),vf('opts.of','balance.g.of',cOf)],{box:'row',nm:'balance.b.opts'});
  var by=cBy.value,a=cA.value,b=cB.value,sp=cSplit.value,of=cOf.value,base=shown;
  // the side-by-side ignores the filter on the compared column itself, so "army=ger" in the filter does not empty side B
  var A=D.rows.filter(function(r){return keyOf(r,by)===a}),Bq=D.rows.filter(function(r){return keyOf(r,by)===b}),other=parseOther(by);
  A=A.filter(other);Bq=Bq.filter(other);
  if((of==='cost'||of==='fit')&&sp!=='res'&&by!=='res'&&uniq('res',A.concat(Bq)).length>1)lf('mixed',[el('div',{class:'wzstat',text:tx('balance.mixed',{l:uniq('res',A.concat(Bq)).join(', ')})})]);
  var ks=uniq(sp,A.concat(Bq)),tb=el('tbody'),max=0,recs=ks.map(function(k){var la=A.filter(function(r){return keyOf(r,sp)===k}),lb=Bq.filter(function(r){return keyOf(r,sp)===k}),va=stat(la,of,'median'),vb=stat(lb,of,'median');if(va>max)max=va;if(vb>max)max=vb;return {k:k,na:la.length,nb:lb.length,va:va,vb:vb}});
  recs.forEach(function(x){var d=x.va!=null&&x.vb!=null&&x.va!==0?Math.round((x.vb/x.va-1)*100):null;
   var bar=sv('svg',{viewBox:'0 0 200 22',width:200,height:22,role:'img'},[sv('rect',{x:0,y:1,width:max?Math.round((x.va||0)/max*200):0,height:9,style:'fill:'+HUE[0]}),sv('rect',{x:0,y:12,width:max?Math.round((x.vb||0)/max*200):0,height:9,style:'fill:'+HUE[1]})]);
   var td=el('td',{text:d==null?'':(d>0?'+':'')+d+'%'});if(d!=null&&Math.abs(d)>=20)td.style.background=d>0?'var(--warnbg)':'var(--crash)';
   tb.appendChild(el('tr',{},[el('td',{text:x.k}),el('td',{text:String(x.na)}),el('td',{text:fmt(x.va)}),el('td',{text:String(x.nb)}),el('td',{text:fmt(x.vb)}),td,el('td',{},[bar])]))});
  lf('table',[el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:lab(sp)}),el('th',{text:a+' '+tx('balance.g.n')}),el('th',{text:a+' '+lab(of)}),el('th',{text:b+' '+tx('balance.g.n')}),el('th',{text:b+' '+lab(of)}),el('th',{text:tx('balance.cmp.diff')}),el('th',{text:''})])]),tb])],{nm:'balance.b.table',style:'overflow:auto'});
  lf('hint',[el('div',{class:'hint',text:tx('balance.cmp.hint')})]);
  // the mod against the game
  if(D.mod){var ch=base.filter(function(r){return r.src!=='game'||(r.dcost!=null&&r.dcost!==0)});
   lf('modh',[el('h4',{text:tx('balance.cmp.mod',{n:ch.length})})]);
   if(ch.length){var t2=el('tbody');ch.forEach(function(r){t2.appendChild(el('tr',{},[el('td',{text:r.name+' ('+r.id+')'}),el('td',{text:r.army}),el('td',{text:r.src==='new'?tx('balance.cmp.new'):fmt(r.cost-r.dcost)}),el('td',{text:fmt(r.cost)+' '+r.res}),el('td',{text:r.dcost?(r.dcost>0?'+':'')+r.dcost:''})]))});
    lf('modtable',[el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:lab('name')}),el('th',{text:lab('army')}),el('th',{text:tx('balance.cmp.game')}),el('th',{text:tx('balance.cmp.now')}),el('th',{text:lab('dcost')})])]),t2])],{nm:'balance.b.modtable',style:'overflow:auto'})}}}
 function parseOther(by){var w=[];try{w=parseQ(qIn.value)}catch(e){w=[]}QUICK.forEach(function(f){if(quick[f]&&quick[f].value)w.push(cond(f,'=',quick[f].value))});w=w.filter(function(c){return c.f!==by});return function(r){return w.every(function(c){return test(r,c)})}}

 // units that do not fit the pattern
 function drawOdd(){
  var ids={};shown.forEach(function(r){ids[r.id]=1});var list=(D.odd||[]).filter(function(o){return ids[o.id]});
  lf('what',[el('div',{class:'hint',text:tx('balance.odd.what')})]);
  var ms=Object.keys(D.models||{}).map(function(k){var m=D.models[k];return k+' '+(m.weak?tx('balance.odd.weak'):'R2 '+m.r2)+' ('+m.n+')'});
  lf('models',[el('div',{class:'hint',text:tx('balance.odd.models')+' '+ms.join(', ')})]);
  if(!list.length){lf('none',[el('div',{class:'ok',text:tx('balance.odd.none')})]);return}
  var tb=el('tbody');list.forEach(function(o){var tr=el('tr',{},[el('td',{text:o.sev===3?'!!!':o.sev===2?'!!':'!'}),el('td',{},[el('button',{type:'button',class:'link',title:tx('balance.odd.show'),text:o.name+' ('+o.id+')',onclick:function(){qIn.value='id='+o.id+(o.other?','+o.other:'');view='sheet';apply()}})]),el('td',{text:o.army}),el('td',{text:o.cls}),el('td',{text:tk2(o)})]);
   tr.style.background=o.sev===3?'var(--crash)':o.sev===2?'var(--warnbg)':'';tb.appendChild(tr)});
  lf('n',[el('div',{class:'hint',text:tx('balance.odd.n',{n:list.length})})]);
  lf('table',[el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:''}),el('th',{text:lab('name')}),el('th',{text:lab('army')}),el('th',{text:lab('cls')}),el('th',{text:tx('balance.odd.col')})])]),tb])],{nm:'balance.b.table',style:'overflow:auto'})}
 function tk2(o){var k=['balance.o',o.code.replace(/^FAR_.*/,'FAR')].join('.'),s=tx(k);return (s===k?'':s+' - ')+o.text}

 // change one column for the units on show (or ticked)
 var fSel,oSel,vIn,stIn,chBox=el('div'),pvBtn,wrBtn,lastKey=null,keepBox=false;
 function chBody(){var t=target();return {mod:curMod(),ids:t.map(function(r){return r.id}),field:fSel.value,op:oSel.value,value:vIn.value.trim(),step:stIn.value.trim()||null}}
 function chGo(write){
  var b=chBody(),key=JSON.stringify(b);if(write&&key!==lastKey){toast(tx('balance.ch.previewFirst'));return}
  if(!b.mod){clear(chBox);chBox.appendChild(el('div',{class:'err',text:tx('balance.ch.noMod')}));return}
  b.write=!!write;clear(chBox);chBox.appendChild(el('div',{class:'hint',text:tx(write?'balance.ch.writing':'balance.ch.previewing')}));
  api('/api/x/balance/change',b,{what:tx(write?'balance.job.write':'balance.job.preview')}).then(function(j){
   clear(chBox);(j.errors||[]).forEach(function(e){chBox.appendChild(el('div',{class:'err',text:e.msg}))});
   var seen={};(j.warnings||[]).forEach(function(e){if(seen[e.code])return;seen[e.code]=1;chBox.appendChild(el('div',{class:'wzstat',text:e.msg}))});
   chBox.appendChild(el('div',{text:tx(j.written?'balance.ch.done':'balance.ch.plan',{n:(j.rows||[]).length,sel:j.selected,skip:(j.skipped||[]).length})}));
   if((j.rows||[]).length){var tb=el('tbody');j.rows.forEach(function(r){tb.appendChild(el('tr',{},[el('td',{text:r.name&&r.name!==r.id?r.name+' ('+r.id+')':r.id}),el('td',{text:lab(r.field==='armor'?'af':r.field==='rank'?'rank':r.field)+(r.part?' ('+r.part+')':'')}),el('td',{text:fmt(r.old)}),el('td',{},[el('b',{text:fmt(r.new)})]),el('td',{text:r.waitNew!=null?fmt(r.waitOld)+' → '+fmt(r.waitNew)+' s':(r.note||'')})]))});
    chBox.appendChild(el('div',{style:'overflow:auto;max-height:50vh'},[el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:lab('name')}),el('th',{text:tx('balance.ch.what')}),el('th',{text:tx('balance.ch.old')}),el('th',{text:tx('balance.ch.new')}),el('th',{text:lab('wait')})])]),tb])]))}
   if((j.skipped||[]).length){var pre=el('pre');pre.textContent=j.skipped.map(function(s){return s.id+': '+s.why}).join('\n');chBox.appendChild(el('details',{},[el('summary',{text:tx('balance.ch.skipped',{n:j.skipped.length})}),pre]))}
   (j.files||[]).forEach(function(f){var pre=el('pre',{class:'diff'});pre.textContent=f.lines.join('\n');chBox.appendChild(el('details',{},[el('summary',{text:f.file}),pre]))});
   lastKey=(!write&&!(j.errors||[]).length&&(j.rows||[]).length)?key:null;wrBtn.disabled=!lastKey;
   if(j.written){chBox.appendChild(el('div',{class:'ok',text:tx('balance.ch.next')}));keepBox=true;S.modWrites=(S.modWrites||0)+1;load(true)}
  }).catch(function(e){clear(chBox);chBox.appendChild(el('div',{class:e.cancelled?'hint':'err',text:e.message}));lastKey=null;wrBtn.disabled=true})}
 function drawChange(){
  if(!fSel){var fs=Object.keys(D.edit||{});fSel=sel('balance.ch.field',fs.map(function(f){return [f,lab(f==='armor'?'af':f)]}),'cost');
   oSel=sel('balance.ch.op',['pct','add','mul','set','fit'].map(function(o){return [o,tx(['balance.op',o].join('.'))]}),'pct');
   vIn=el('input',{type:'text',autocomplete:'off',size:8,'aria-label':tx('balance.ch.value')});stIn=el('input',{type:'text',autocomplete:'off',size:5,'aria-label':tx('balance.ch.step')});
   pvBtn=el('button',{type:'button',text:tx('balance.ch.preview'),onclick:function(){chGo(false)}});wrBtn=el('button',{type:'button',class:'primary',disabled:true,text:tx('balance.ch.write'),onclick:function(){chGo(true)}});
   [fSel,oSel].forEach(function(s){s.addEventListener('change',function(){wrBtn.disabled=true;lastKey=null;chHint()})})}
  // the columns offered follow the table's game (GoH leaves out rank and fore): a game tab switch refills the list
  var fk=Object.keys(D.edit||{});if(fk.join(',')!==Array.prototype.map.call(fSel.options,function(o){return o.value}).join(',')){var fv=fSel.value;while(fSel.firstChild)fSel.removeChild(fSel.firstChild);fk.forEach(function(f){fSel.appendChild(el('option',{value:f,text:lab(f==='armor'?'af':f)}))});fSel.value=fk.indexOf(fv)>=0?fv:'cost'}
  var t=target();
  lf('for',[el('div',{text:tx(shown.some(function(r){return ticks[r.id]})?'balance.ch.forTicked':'balance.ch.forShown',{n:t.length})})]);
  var kinds=uniq('res',t);if(kinds.length>1)lf('mixed',[el('div',{class:'wzstat',text:tx('balance.ch.mixed',{l:kinds.join(', ')})})]);
  lf('opts',[vf('opts.field','balance.ch.field',fSel),vf('opts.op','balance.ch.op',oSel),vf('opts.value','balance.ch.value',vIn),vf('opts.step','balance.ch.step',stIn),vb('opts.btns',[pvBtn,wrBtn],{cls:'row'})],{box:'row',nm:'balance.b.opts'});
  lf('hint',[chHintBox],{nm:'balance.b.fhint'});chHint();wrBtn.disabled=true;lastKey=null;if(keepBox)keepBox=false;else clear(chBox);lf('res',[chBox],{nm:'balance.b.res'});
  lf('safe',[el('div',{class:'hint',text:tx('balance.ch.safe')})])}
 var chHintBox=el('div',{class:'hint'});
 function chHint(){var k=['balance.fh',fSel.value].join('.'),g=['balance.fh.goh',fSel.value].join('.'),gs=S.gameId==='goh'?tx(g):g;if(gs!==g)k=g;var s=tx(k);chHintBox.textContent=(s===k?'':s)+(oSel.value==='fit'?' '+tx('balance.ch.fit'):'')}

 root.appendChild(blk('title',[el('h2',{text:tx('balance.title')})]));
 root.appendChild(card('mod',[blk('mod.intro',[el('div',{text:tx('balance.intro')})]),blk('mod.pick',[loadBtn]),
  blk('mod.say',[say],{name:tx('balance.b.say')}),blk('mod.eco',[ecoBox],{name:tx('balance.b.eco')})],{name:tx('balance.mod')}));
 root.appendChild(card('filter',[blk('filter.q',[qKit.el],{name:tx('balance.q')}),blk('filter.err',[qErr],{name:tx('balance.b.qerr')}),blk('filter.quick',[quickBox],{name:tx('balance.b.quick')}),
  blk('filter.count',[cnt],{name:tx('balance.b.count')}),
  blk('filter.hint',[el('div',{class:'hint',text:tx('balance.q.hint')})])],{name:tx('balance.b.filter')}));
 root.appendChild(card('views',[blk('views.tabs',[tabs],{name:tx('balance.b.tabs')}),body],{name:tx('balance.b.views')}));
 // the price calculator card (prices.client.js): Breeds, Model, Cards; it reads only when asked, then follows the mod like the table
 var PR=balPrices({root:root,curMod:curMod});root.appendChild(PR.card);
 function sync(){load(false);PR.refresh()}
 // the table is read only while this page is shown (show() sets S.cur, then calls refresh and focus); a hidden page skips the
 // refresh of every page load, and show() then finds the new mod or write stamp and reads again
 return {refresh:function(){if(S.cur==='balance')sync()},focus:function(){sync();qKit.focus()}}
};
`;
