// browser side of the "GoH unit" page. Page rules: no backtick, no dollar-brace, DOM only through h() and textContent.
// Layout = blocks: every part sits in a leaf block; the step cards are built once and shown when the status
// says GoH and the game are there; the result blocks are rebuilt per run (removed from wherever the profile moved them, then blkApply).
// Author: Imperator_Aug (ARSENAL, ia-2780f193)
module.exports = String.raw`
EXT_SCREENS.goh=function(root){
 // target: the AS2 game the unit is ported to (as64 or mowas2), sent with every call; kept per viewer in the window settings (LS)
 // with no stored pick the header game decides: MoW:AS2 gives mowas2, every other game as64
 var tdef=(typeof S!=='undefined'&&S&&S.gameId==='mowas2')?'mowas2':'as64';
 var lsg=function(){try{return typeof LS!=='undefined'?LS.get('gohTarget',tdef):tdef}catch(e){return tdef}};
 var st={unit:null,donor:'',out:'',outAuto:true,last:null,units:[],picks:[],target:lsg()==='mowas2'?'mowas2':'as64'};
 var q=function(o){o=Object.assign({game:gameDir(),target:st.target},o);var s=[];Object.keys(o).forEach(function(k){if(o[k]!=null&&o[k]!=='')s.push(encodeURIComponent(k)+'='+encodeURIComponent(o[k]))});return s.join('&')};
 var nm=function(k){return tx('goh.blk.'+k)};
 var banner=function(id){return h('div',{blk:id,'data-blkname':nm('banner')},[h('div',{class:'wzstat err',role:'note'},[h('b',{text:tx('goh.banner')})])])};
 var top=h('div'),stat=h('div',{class:'hint'});
 root.appendChild(h('div',{blk:'title'},[h('h2',{text:tx('goh.nav')})]));root.appendChild(banner('banner'));
 root.appendChild(h('div',{blk:'stat','data-blkname':nm('stat')},[top]));

 // ---- intro
 var cIntro=h('div',{class:'card',blk:'intro',box:'col','data-blkname':tx('goh.introT'),hidden:true},[h('div',{blk:'intro.title'},[h('h3',{text:tx('goh.introT')})]),h('div',{blk:'intro.lead'},[h('div',{text:tx('goh.intro1')})]),
  h('div',{blk:'intro.keep'},[h('ul',{},[h('li',{text:tx('goh.keepGoh')}),h('li',{text:tx('goh.keepDonor')})])]),h('div',{blk:'intro.note'},[h('div',{class:'hint',text:tx('goh.intro2')})])]);

 // ---- target game (as64 or mowas2): a new pick drops the donor suggestions and the last preview (both depend on it)
 var tsel=h('select',{'aria-label':tx('goh.target')},[h('option',{value:'as64',text:tx('goh.target.as64')}),h('option',{value:'mowas2',text:tx('goh.target.mowas2')})]);
 tsel.value=st.target;
 tsel.addEventListener('change',function(){var v=tsel.value==='mowas2'?'mowas2':'as64';if(v===st.target)return;st.target=v;try{if(typeof LS!=='undefined')LS.set('gohTarget',v)}catch(e){}
  donorBox.textContent='';st.sug=[];st.last=null;clearRes();refreshBtns()});
 var cTg=h('div',{class:'card',blk:'tgt',box:'col','data-blkname':nm('target'),hidden:true},[h('div',{blk:'tgt.title'},[h('h3',{text:tx('goh.target')})]),
  h('div',{class:'row',blk:'tgt.pick','data-blkname':nm('target')},[tsel]),h('div',{blk:'tgt.hint'},[h('div',{class:'hint',text:tx('goh.targetH')})])]);

 // ---- search boxes (owner 2026-11-19): every box has an indexed search, a manual Browse and a history list (searchKit in page.js,
 // tools/gui/README.md). The index is the flat name list of /api/x/goh/names, read once per page load (the donors once per target and
 // game) and filtered here while the user types, so typing never waits on the server. A stand-in page with no kit keeps the bare box.
 function kitOf(inp,o){return typeof searchKit==='function'?searchKit(inp,o):null}
 var NAMES={};
 function names(kind,cb){var k=kind+(kind==='donors'?'|'+st.target+'|'+gameDir():''),c=NAMES[k];
  if(c&&c.items){cb(c.items);return}if(c){c.wait.push(cb);return}c=NAMES[k]={items:null,wait:[cb]};
  var end=function(l){c.items=l;var w=c.wait;c.wait=[];w.forEach(function(f){f(l)})};
  api('/api/x/goh/names?'+q({kind:kind}),undefined,{what:tx('goh.job.names')}).then(function(r){end((r.items||[]).map(function(x){x.lo=(x.name+' '+(x.sub||'')+' '+(x.group||'')).toLowerCase();return x}))})
   .catch(function(){delete NAMES[k];var w=c.wait;c.wait=[];w.forEach(function(f){f([])})})}
 // every word in the name, nation/folder or kind; names that start with the first word come first; 40 shown, the rest counted
 function hits(items,s,hint){var t=String(s||'').toLowerCase().trim().split(/\s+/).filter(Boolean),a=[],b=[];
  items.forEach(function(x){if(t.every(function(w){return x.lo.indexOf(w)>=0}))(t.length&&x.name.toLowerCase().indexOf(t[0])===0?a:b).push(x)});
  var all=a.concat(b);return {l:all.slice(0,40).map(function(x){return {label:x.name,value:x.name,hint:hint(x),group:x.group,x:x}}),more:Math.max(0,all.length-40)}}
 var uHint=function(x){return (x.sub||'')+' '+lbl('goh.k.'+x.group,x.group)},dHint=function(x){return lbl('goh.dk.'+x.group,x.group)+' '+(x.sub||'')+(x.cal?' '+x.cal+' mm':'')};
 var uConv=function(x){return {name:x.name,nation:x.sub,cls:x.group}};
 function lbl(k,id){var s=(LANGS[LANG]&&LANGS[LANG][k])||(LANGS.en&&LANGS.en[k]);return s||id}

 // ---- step 1: unit picker
 var qin=h('input',{type:'text',placeholder:tx('goh.searchPh'),autocomplete:'off','aria-label':tx('goh.search')});
 var found=h('div'),chosen=h('div',{class:'ok'}),s1h=h('div',{class:'hint'});
 function chooseUnit(u){st.unit=u;st.donor='';st.picks=[];st.sug=[];donorBox.textContent='';din.value='';chosen.textContent=tx('goh.chosen',{n:u.name,c:u.cls||'?',nat:u.nation||'?'});
  if(st.outAuto){oin.value=defOut(u.name);}refreshBtns()}
 function defOut(n){var g=gameDir();return g?g.replace(/[\\/]+$/,'')+'/mods/goh_'+n:''}
 function search(){var v=qin.value.trim();found.textContent='';if(!v){found.appendChild(h('div',{class:'hint',text:tx('goh.typeName')}));return}
  found.appendChild(h('div',{class:'hint',text:tx('goh.searching')}));
  api('/api/x/goh/units?'+q({q:v}),undefined,{what:tx('goh.job.units')}).then(function(r){found.textContent='';
   if(r.units.length){found.appendChild(h('div',{class:'hint',text:tx('goh.found',{n:r.units.length,t:r.total})}));
    r.units.forEach(function(u){found.appendChild(h('div',{class:'row'},[h('button',{type:'button',text:u.name,onclick:function(){chooseUnit(u)}}),h('span',{class:'hint',text:(u.nation||'')+' '+(u.cls||'')})]))})}
   else{found.appendChild(h('div',{class:'err',text:tx('goh.none',{q:v})}));
    if(r.didYouMean&&r.didYouMean.length){found.appendChild(h('span',{text:tx('goh.dym')+' '}));
     r.didYouMean.forEach(function(u){found.appendChild(h('button',{type:'button',text:u.name,onclick:function(){qin.value=u.name;search()}}))})}}
  }).catch(function(e){found.textContent='';found.appendChild(h('div',{class:'err',text:e.message}))})}
 // a file name without its folder and extension (a picked unit or donor .def gives the unit name)
 function stem(p){p=String(p||'').replace(/\\/g,'/');p=p.slice(p.lastIndexOf('/')+1);return p.replace(/\.def$/i,'')}
 // the unit box: the names index while typing (a pick chooses the unit); Browse = the file picker on the game data (this page is on the
 // GoH game tab, so the data view is the GoH paks) at entity/-vehicle, .def files: the picked def's name is the unit (the names index
 // gives its nation and kind; a name it does not know is searched); history; Enter with no row marked searches
 var qk=kitOf(qin,{key:'goh.unit',
  index:function(s,done){names('units',function(it){var r=hits(it,s,uHint);done(r.l,r.more)})},
  browse:{mode:'file',view:'data',start:'entity/-vehicle',exts:['def'],toValue:function(p){return stem(p)}},
  onPick:function(v,it,from){qin.value=v;
   if(from==='browse'){names('units',function(l){var x=null;l.forEach(function(y){if(!x&&y.name.toLowerCase()===v.toLowerCase())x=y});if(x)chooseUnit(uConv(x));else search()});return}
   var u=it&&it.x&&uConv(it.x);if(u){chooseUnit(u);return}search()}});
 qin.addEventListener('keydown',function(e){if(e._sk)return;if(e.key==='Enter'){e.preventDefault();search()}});
 var cS1=h('div',{class:'card',blk:'s1',box:'col','data-blkname':tx('goh.s1'),hidden:true},[h('div',{blk:'s1.title'},[h('h3',{text:tx('goh.s1')})]),h('div',{blk:'s1.hint'},[s1h]),
  h('div',{class:'row',blk:'s1.search','data-blkname':nm('search')},[qk?qk.el:qin,h('button',{type:'button',text:tx('goh.search'),onclick:search})]),
  h('div',{blk:'s1.found','data-blkname':nm('found')},[found]),h('div',{blk:'s1.chosen','data-blkname':nm('chosen')},[chosen])]);

 // ---- step 2: donor
 var din=h('input',{type:'text',placeholder:tx('goh.donorPh'),autocomplete:'off','aria-label':tx('goh.donor')}),donorBox=h('div');
 din.addEventListener('input',function(){st.donor=din.value.trim();refreshBtns()});
 function suggest(){if(!st.unit){toast(tx('goh.needUnit'));return}donorBox.textContent='';donorBox.appendChild(h('div',{class:'hint',text:tx('goh.suggesting')}));
  api('/api/x/goh/donors?'+q({unit:st.unit.name})).then(function(r){donorBox.textContent='';st.sug=(r.donors||[]).map(function(d){return d.stem});
   if(!r.donors||!r.donors.length){donorBox.appendChild(h('div',{class:'err',text:tx('goh.noDonor')+(r.unplaced?' '+r.unplaced:'')}));return}
   donorBox.appendChild(h('div',{class:'hint',text:tx('goh.donorHow',{c:r.cls||'?'})}));
   r.donors.forEach(function(d,i){donorBox.appendChild(h('div',{class:'card'},[h('b',{text:(i+1)+'. '+d.stem}),' ',h('span',{class:'badge '+(i===0&&r.confidence==='high'?'good':'info'),text:i===0?tx('goh.conf.'+(r.confidence||'low')):tx('goh.alt')}),
     h('div',{class:'hint',text:d.why.join('; ')}),h('button',{type:'button',text:tx('goh.useDonor'),onclick:function(){useDonor(d.stem)}})]))})
  }).catch(function(e){donorBox.textContent='';donorBox.appendChild(h('div',{class:'err',text:e.message}))})}
 function useDonor(stem){din.value=stem;st.donor=stem;refreshBtns();toast(tx('goh.donorSet',{d:stem}))}
 // the donor box: the stems Suggest found first (marked), then the vanilla pool of the target game; history. Browse = the file picker on
 // the disk at the AS2 install's resource/entity (the donor is an AS2 unit; the picker's data view is the header game's, GoH here), .def
 // files: the picked def's name is the donor
 var dk=kitOf(din,{key:'goh.donor',
  index:function(s,done){names('donors',function(it){var lo=s.toLowerCase(),sg=(st.sug||[]).filter(function(x){return x.toLowerCase().indexOf(lo)>=0}),r=hits(it,s,dHint);
   done(sg.map(function(x){return {label:x,value:x,hint:tx('goh.sk.suggested')}}).concat(r.l.filter(function(i){return sg.indexOf(i.value)<0})),r.more)})},
  browse:{mode:'file',view:'data',game:'mowas2',start:'entity',exts:['def'],toValue:function(p){return stem(p)}},
  onPick:function(v){useDonor(v)}});
 var cS2=h('div',{class:'card',blk:'s2',box:'col','data-blkname':tx('goh.s2'),hidden:true},[h('div',{blk:'s2.title'},[h('h3',{text:tx('goh.s2')})]),h('div',{blk:'s2.hint'},[h('div',{class:'hint',text:tx('goh.s2h')})]),
  h('div',{class:'row',blk:'s2.donor','data-blkname':nm('donor')},[dk?dk.el:din,h('button',{type:'button',text:tx('goh.suggest'),onclick:suggest})]),h('div',{blk:'s2.donors','data-blkname':nm('donors')},[donorBox])]);

 // ---- step 3: out + run
 var oin=h('input',{type:'text',autocomplete:'off','aria-label':tx('goh.out')});
 oin.addEventListener('input',function(){st.outAuto=false;refreshBtns()});
 // the output folder box: the usual folder for the chosen unit and the mod folders of the game (read once per game folder), Browse = the
 // folder picker on the disk (a folder to write to) at the box's folder, else the AS2 mods folder; history
 var MODS={dir:null,l:null};
 function outIdx(cb){var g=gameDir(),dir=g?g.replace(/[\\/]+$/,'')+'/mods':'',base=st.unit?[{label:defOut(st.unit.name),value:defOut(st.unit.name),hint:tx('goh.sk.default')}]:[];
  if(!dir){cb(base);return}if(MODS.dir===dir&&MODS.l){cb(base.concat(MODS.l));return}
  api('/api/mods?dir='+encodeURIComponent(dir),undefined,{what:tx('goh.job.mods')}).then(function(r){MODS={dir:dir,l:(r.mods||[]).filter(function(m){return m.path&&m.folder}).map(function(m){return {label:m.path,value:m.path,hint:tx('goh.sk.modDir')}})};cb(base.concat(MODS.l))}).catch(function(){cb(base)})}
 var ok3=kitOf(oin,{key:'goh.out',
  index:function(s,done){outIdx(function(l){var lo=s.toLowerCase(),a=l.filter(function(x){return x.value.toLowerCase().indexOf(lo)>=0});done(a.slice(0,40),Math.max(0,a.length-40))})},
  browse:{mode:'dir',view:'disk',out:true,start:function(){var v=oin.value.trim(),g=gameDir();return v||(g?g.replace(/[\\/]+$/,'')+'/mods':'')}},
  onPick:function(v){if(!v)return;oin.value=v;st.outAuto=false;refreshBtns()}});
 var bPlan=h('button',{type:'button',class:'primary',text:tx('goh.plan'),onclick:function(){run(true)}});
 var bGo=h('button',{type:'button',class:'danger',text:tx('goh.convert'),onclick:function(){run(false)}});
 var runStat=h('div',{class:'hint'});
 function refreshBtns(){var ok=!!(st.unit&&din.value.trim()&&oin.value.trim());bPlan.disabled=!ok;bGo.disabled=!ok||!(st.last&&st.last.dry&&st.last.ok&&st.last.key===key());if(xc)xc.refresh()}
 function key(){return [st.unit&&st.unit.name,din.value.trim(),oin.value.trim(),st.target].join('|')}
 function ask(o){if(typeof askDo==='function')return askDo(o);var y=true;try{if(typeof window!=='undefined'&&window.confirm)y=!!window.confirm([o.title].concat(o.lines||[]).filter(Boolean).join(' '))}catch(e){}return {then:function(cb){cb(y)}}}
 function run(dry,asked){if(RUN){busyMsg();return}if(!st.unit)return;
  if(!dry&&!asked){ask({title:tx('goh.convert'),lines:[tx('goh.confirm',{o:oin.value.trim()})],where:oin.value.trim()}).then(function(yes){if(yes)run(dry,true)});return}
  clearRes();runStat.className='hint';runStat.textContent=tx(dry?'goh.planning':'goh.converting');bPlan.disabled=true;bGo.disabled=true;
  api('/api/x/goh/convert',{unit:st.unit.name,donor:din.value.trim(),out:oin.value.trim(),dry:dry,confirm:!dry,game:gameDir(),target:st.target},{what:tx(dry?'goh.job.plan':'goh.job.convert')}).then(function(r){
   r.key=key();st.last=r;runStat.className=r.ok?'ok':'err';runStat.textContent=r.ok?tx(dry?'goh.planned':'goh.done'):tx('goh.failed');renderResult(r);refreshBtns()
  }).catch(function(e){runStat.className=e.cancelled?'hint':'err';runStat.textContent=e.message;refreshBtns()})}
 // Translate numbers (W5: the old Translate page): goh2as2 --ask-json on the chosen unit, donor and output folder (xlateCard in page.js; a field the user typed is kept)
 var xc=xlateCard({auto:{entity:function(){return st.unit?st.unit.name:null},donor:function(){return din.value.trim()||null},out:function(){return oin.value.trim()||null},
  exe:function(){return st.target==='mowas2'?'mowas_2':''}}});   // exe: the target pick (empty = goh2as2's own pick, as64 first)
 var xf=h('details',{blk:'s3.xlate',box:'col','data-blkname':tx('goh.xlateT')},[h('summary',{text:tx('goh.xlateT')}),h('div',{blk:'s3.xlate.hint'},[h('div',{class:'hint',text:tx('goh.xlateH')})]),xc.el]);
 var cS3=h('div',{class:'card',blk:'s3',box:'col','data-blkname':tx('goh.s3'),hidden:true},[h('div',{blk:'s3.title'},[h('h3',{text:tx('goh.s3')})]),h('div',{blk:'s3.hint'},[h('div',{class:'hint',text:tx('goh.s3h')})]),
  h('div',{class:'row',blk:'s3.out','data-blkname':nm('out')},ok3?[ok3.el]:[oin,h('button',{type:'button',text:tx('btn.browse'),onclick:function(){pick('dir',oin.value.trim(),function(p){oin.value=p;st.outAuto=false;refreshBtns()})}})]),
  h('div',{class:'row',blk:'s3.btns','data-blkname':nm('btns')},[bPlan,bGo]),h('div',{blk:'s3.stat','data-blkname':nm('runStat')},[runStat]),h('div',{blk:'s3.safe'},[h('div',{class:'hint',text:tx('goh.safe')})]),xf]);

 // ---- result: a container of blocks rebuilt per run; drawn = the blocks of the last run, wherever the profile put them
 var res=h('div',{blk:'res',box:'col','data-blkname':nm('res')}),drawn=[];
 function put(el){res.appendChild(el);drawn.push(el);return el}
 function clearRes(){drawn.forEach(function(e){if(e.parentNode)e.parentNode.removeChild(e)});drawn=[]}
 function leaf(id,kids,name){return h('div',name?{blk:id,'data-blkname':name}:{blk:id},kids)}
 function rcard(id,title,kids){return h('div',{class:'card',blk:id,box:'col','data-blkname':title},[leaf(id+'.title',[h('b',{text:title})])].concat(kids))}
 function sec(t,kids,open){var d=h('details',open?{open:'open'}:{},[h('summary',{text:t})]);kids.forEach(function(k){if(k)d.appendChild(k)});return d}
 function codeText(c,msg){var k='goh.code.'+c;var s=LANGS[LANG][k]||LANGS.en[k];return s?s:(msg||c)}
 function renderResult(r){clearRes();
  if(!r.ok){put(leaf('res.err',[h('div',{class:'err',text:r.error||tx('goh.failed')})].concat((r.lines||[]).map(function(l){return h('div',{class:'hint',text:l})})),nm('err')));blkApply(root);return}
  put(banner('res.banner'));
  put(rcard('res.sum',tx(r.dry?'goh.planCard':'goh.doneCard'),[leaf('res.sum.counts',[h('div',{text:tx('goh.counts',{w:r.warnings.length,e:r.errors.length,i:r.infoCount})})]),
   (r.summary||[]).length?leaf('res.sum.lines',(r.summary||[]).map(function(l){return h('div',{class:'hint',text:l})}),nm('sum')):null]));
  put(rcard('res.outcome',tx('goh.outcomeT'),[leaf('res.outcome.list',[h('ul',{},['goh.out1','goh.out2','goh.out3','goh.out4'].map(function(k){return h('li',{text:tx(k)})}))]),leaf('res.outcome.rates',[h('div',{class:'hint',text:tx('goh.outRates')})])]));
  // findings: warnings first, info folded
  var fl=leaf('res.find.list',[],nm('findList'));
  if(!r.errors.length&&!r.warnings.length)fl.appendChild(h('div',{class:'ok',text:tx('goh.noWarn')}));
  r.errors.concat(r.warnings).forEach(function(f){fl.appendChild(h('div',{class:'hit'},[h('span',{class:'badge '+(f.severity==='error'?'badx':'review'),text:f.code+(f.n>1?' x'+f.n:'')}),' ',h('span',{text:codeText(f.code,f.msg)}),h('div',{class:'hint',text:f.msg})]))});
  put(rcard('res.find',tx('goh.findT'),[fl,r.infoGroups.length?leaf('res.find.info',[sec(tx('goh.infoFold',{n:r.infoCount}),r.infoGroups.map(function(g){return h('div',{class:'hint',text:g.code+' x'+g.n+' - '+codeText(g.code,g.sample)})}))]):null]));
  if(r.what)renderWhat(r.what);
  if(!r.dry){renderFit(r);renderShow(r);
   put(rcard('res.next',tx('goh.nextT'),[leaf('res.next.text',[h('div',{text:tx(r.target==='mowas2'?'goh.next1.mowas2':'goh.next1',{o:r.out})})]),
    h('div',{class:'row',blk:'res.next.btns','data-blkname':nm('nextBtns')},[h('button',{type:'button',class:'primary',text:tx('goh.openMods'),onclick:function(){setMod(r.out);show('mods')}}),
     h('button',{type:'button',text:tx('goh.toCheck'),onclick:function(){setMod(r.out);show('check')}}),h('button',{type:'button',text:tx('goh.toPlay'),onclick:function(){setMod(r.out);show('play')}})])]));
   put(banner('res.banner2'))}
  else put(leaf('res.plannext',[h('div',{class:'hint',text:tx('goh.planNext')})]));
  blkApply(root)}

 function renderWhat(w){var ul=h('ul'),kids=[];
  if(w.crew)ul.appendChild(h('li',{text:tx('goh.w.crew',{a:w.crew.goh,b:w.crew.port})}));
  if(w.weapon)ul.appendChild(h('li',{text:tx('goh.w.weapon',{a:w.weapon.rep,b:w.weapon.to,c:w.weapon.from})}));
  if(w.armour)ul.appendChild(h('li',{text:tx('goh.w.armour')+' '+w.armour}));
  if(w.donor)ul.appendChild(h('li',{text:tx('goh.w.donor',{d:w.donor})}));
  if(w.dropped&&w.dropped.length)ul.appendChild(h('li',{text:tx('goh.w.dropped',{n:w.dropped.reduce(function(a,x){return a+x.n},0),l:w.dropped.map(function(x){return codeText(x.code,x.code)+' x'+x.n}).join('; ')})}));
  if(!ul.children.length)ul.appendChild(h('li',{text:tx('goh.w.none')}));
  kids.push(leaf('res.what.list',[ul]));
  if(w.counts)kids.push(leaf('res.what.counts',[h('div',{class:'hint',text:tx('goh.w.counts',{d:w.counts.dropped,b:w.counts.baked,o:w.counts.donor,u:w.counts.unexplained})})]));
  if(w.values&&w.values.length){var tb=h('tbody');w.values.forEach(function(v){tb.appendChild(h('tr',{},[h('td',{class:'nw',text:v.key}),h('td',{class:'nw',text:String(v.goh)}),h('td',{class:'nw',text:String(v.written)}),h('td',{class:'nw',text:v.donor==null?'':String(v.donor)}),h('td',{class:'hint',text:tx(v.adv)})]))});
   kids.push(leaf('res.what.values',[sec(tx('goh.valuesT',{n:w.values.length}),[h('div',{class:'hint',text:tx('goh.valuesHow')}),h('table',{},[h('thead',{},[h('tr',{},[h('th',{text:tx('goh.col.key')}),h('th',{text:tx('goh.col.goh')}),h('th',{text:tx('goh.col.written')}),h('th',{text:tx('goh.col.donor')}),h('th',{text:tx('goh.col.advice')})])]),tb]),h('div',{class:'hint',text:tx('goh.tagT')})])]))}
  put(rcard('res.what',tx('goh.whatT'),kids))}

 function renderFit(r){var out=h('div');
  var b1=h('button',{type:'button',text:tx('goh.fitCheck'),onclick:function(){out.textContent=tx('goh.working');api('/api/x/goh/fit',{unit:r.unit,out:r.out,game:gameDir(),target:st.target}).then(function(f){showFit(out,f,r)}).catch(function(e){out.textContent='';out.appendChild(h('div',{class:e.cancelled?'hint':'err',text:e.message}))})}});
  put(rcard('res.fit',tx('goh.fitT'),[leaf('res.fit.how',[h('div',{class:'hint',text:tx('goh.fitHow')})]),h('div',{class:'row',blk:'res.fit.btns'},[b1]),leaf('res.fit.out',[out],nm('fitOut'))]))}
 function showFit(out,f,r){out.textContent='';
  out.appendChild(h('div',{class:f.misses.length||f.problems.length?'err':'ok',text:tx(f.misses.length||f.problems.length?'goh.fitBad':'goh.fitOk',{n:f.misses.length+f.problems.length})}));
  f.misses.concat(f.problems).forEach(function(m){out.appendChild(h('div',{class:'hint',text:m}))});
  out.appendChild(h('div',{class:'hint',text:tx('goh.fitSeats',{n:f.seats,b:f.bones})}));
  (f.notes||[]).slice(0,5).forEach(function(m){out.appendChild(h('div',{class:'hint',text:m}))});
  if(f.misses.length){out.appendChild(h('button',{type:'button',text:tx('goh.fitApply'),onclick:function(){ask({title:tx('goh.fitApply'),lines:[tx('goh.fitConfirm',{o:r.out})],where:r.out}).then(function(yes){if(!yes)return;out.textContent=tx('goh.working');api('/api/x/goh/fit',{unit:r.unit,out:r.out,apply:true,confirm:true,game:gameDir(),target:st.target},{what:tx('goh.job.fit')}).then(function(g){showFit(out,g,r)}).catch(function(e){out.textContent='';out.appendChild(h('div',{class:e.cancelled?'hint':'err',text:e.message}))})})}}))}}

 function renderShow(r){var out=h('div');
  var b=h('button',{type:'button',text:tx('goh.showBtn'),onclick:function(){out.textContent='';api('/api/x/goh/show?'+q({unit:r.unit,out:r.out})).then(function(s){
   s.steps.forEach(function(t,i){out.appendChild(h('div',{},[h('b',{text:(i+1)+'. '+tx('goh.show.'+t.id)}),h('pre',{text:t.cmd})]))});
   out.appendChild(h('div',{class:'hint',text:tx(s.target==='mowas2'?'goh.showNote.mowas2':'goh.showNote')}))}).catch(function(e){out.appendChild(h('div',{class:'err',text:e.message}))})}});
  put(rcard('res.show',tx('goh.showT'),[leaf('res.show.how',[h('div',{text:tx('goh.showHow')})]),h('div',{class:'row',blk:'res.show.btn'},[b]),leaf('res.show.out',[out],nm('showOut'))]))}

 // ---- layout: the cards are built once; build() shows them when GoH and the game are there
 var cards=[cIntro,cTg,cS1,cS2,cS3,res];
 cards.forEach(function(c){root.appendChild(c)});res.hidden=true;
 function build(sx){top.textContent='';var on=!!(sx.goh&&sx.game);
  cards.forEach(function(c){c.hidden=!on});
  if(!sx.goh){top.appendChild(h('div',{class:'err',text:tx('goh.noGoh')}));return}
  if(!sx.game){top.appendChild(h('div',{class:'err',text:tx('game.notSet')}));return}
  s1h.textContent=tx('goh.s1h',{p:sx.goh});refreshBtns()}
 // the status (the two game folders) is a function of the request alone (its query and the game headers). Coming back to this page with nothing
 // marked out of date (S.same, set by show0) and the same request: the last answer is drawn again, the server is not asked
 var SEEN=null;
 function refresh(){var qs=q({}),k=qs+'|'+(typeof gameHdr==='function'?JSON.stringify(gameHdr()):'');
  if(S.same===true&&SEEN&&SEEN.k===k)build(SEEN.sx);
  else{SEEN=null;api('/api/x/goh/status?'+qs,undefined,{what:tx('goh.job.status')}).then(function(sx){SEEN={k:k,sx:sx};build(sx)}).catch(function(e){top.textContent='';top.appendChild(h('div',{class:'err',text:e.message}))})}
  if(st.outAuto&&st.unit)oin.value=defOut(st.unit.name);xc.refresh()}
 // lazy: the status is asked for at the first show (show0 calls refresh), not with the page
 return {refresh:refresh,keys:function(e){return xc.keys(e)},translate:xc,focus:function(){try{qin.focus()}catch(e){}}}};
`;
