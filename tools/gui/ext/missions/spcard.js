// Browser side of the card "Make a single-player mission" on the Missions page (server: sp.js, the spmis tool as a library).
// Page rules: no backtick, no dollar-brace, no innerHTML. One top-level function MISSIONS_SP(K) that the Missions screen calls with its
// helpers (el, clear, known, game, isGoh, ask, go, errText, codeText, curMod, list, hits); it returns {el, focus, refresh, _t}.
// Six steps (kind, map, sides, goals, story, check). Every step starts filled from the kind picked in step 1, so five Nexts give a
// mission spmis accepts. Places are dropdowns of readable labels (flag B2, your base; path points under More options) and a sketch of
// the map whose dots fill the place field last used (north up: world y grows north, as in the Map Viewer and its place picker), and
// with the picker loaded (MAPVIZ_PICK) a "Pick on the map" button beside every place field (a place, or a spot [x, y] in world units);
// with the picker's inline form (MAPVIZ_PICK.embed) the sketch gives way to the Mission map: the Map Viewer's picture of the real map,
// open on the steps map, sides, goals and check, with the whole mission drawn on it from the spec values Preview and Write send;
// your start is never an enemy place (fixPlaces moves them; spmis SPMIS_START_ENEMY). The folder name follows the title, with _2 when
// another mission has it; after a Write it stays (lock), and a Preview over another mission's folder says so; units are searchKits over the army's soldiers, vehicles and guns by in-game name
// (a Cyrillic query is also tried in Latin letters and as the English role or class words: the game's names are English). Goals start at once or after an earlier goal (spmis
// "after": shown, and a hold timer started, only then). Texts (title, story, goal lines, start, won, lost) are made in the window's
// language from the fields and follow them; a text the user typed is kept (spec.card.own) and flagged when its basis changed since.
// The summary and the Preview's plain list are made from the same spec values Preview and Write send. Write keeps an Undo token
// (sp.js: the bytes from before, also after a rewrite). Each refusal code is one plain sentence (missions.sp.c.<CODE>); the field it
// names is marked and "Fix on step N" goes there. GoH: the same steps and Write (the GoH form, sp.js), one plain line on what is not written and "not tried in game"; MoW:AS2: same steps, said as not yet tried there.
// Author: Imperator_Aug (ARSENAL, ia-b4820e58)
module.exports = String.raw`
function MISSIONS_SP(K){
 var el=K.el,clear=K.clear,known=K.known;
 // the armies of the game tab: sp/start says them (GoH: ger rus usa eng fin), this list until it lands
 var ARMY0=['usa','ger','rus','eng','jap'],ARMY=ARMY0.slice(),TYPES=['capture','destroy','hold','reach','survive','escort'],LV=['','normal','hard','heroic'];
 var STEPS=['kind','map','sides','goals','story','check'],GROUPS=['pu','ed','ep','ew'];
 var TEXTS=['goals','title','briefing','campaignTitle','date','place','start','won','lost','timerText'];
 var D={start:null,maps:null,mapsBusy:false,places:null,placesFor:'',units:{},unitsMod:{},mods:null,modsFor:null,pic:{}};
 var spec=null,step=0,nameAuto=true,editing=null,lock=null,prev=null,bad=null,mapNote='',notes=[],seq=0,mine=[],mineFor=null,lastGid=K.game().id;
 var START={},STARTQ={},openG='pu',PT=null,FE={},skT=[],PKB=[],UW=null,paths=false,moreLose=false,moreStory=false,openRf=false,openLose=false,MT=false,mineBusy=false;
 // ERR: the reads that failed (start, maps, places, units.<army>, mine, mods), each asked again by "Try again" (and by itself, a few
 // times, while the tools do not answer); dirty: the user changed something since the kind was picked; kindAsk: the kind a click asks
 // to change to; OU: the open unit row per group; RL: texts re-made in this window's language (the old ones, for "Keep the old texts")
 var MBX=null,MBKEEP=false;
 var ERR={},RTN=0,RTT=null,UQ={},dirty=false,kindAsk=null,OU={},sumAll=false,skAll=false,RL=null,FULL=false;
 function key(){return ['missions','sp'].concat([].slice.call(arguments)).join('.')}
 function clone(o){return JSON.parse(JSON.stringify(o))}
 function enc(s){return encodeURIComponent(s)}
 function mod(){return K.curMod()}
 // the game folder: 'yes' set, 'no' not set (the card asks nothing that needs it), 'wait' the page has not heard yet (a page with no
 // S.game, as in the tests, counts as set). refresh() runs again when the page hears, and loads what is missing then
 function gameState(){try{if(K.isGoh()||typeof S==='undefined'||!S||!S.game)return 'yes';if(S.gameOv)return 'yes';var g=S.game;if(g.dir)return 'yes';
  return Object.keys(g).length?'no':'wait'}catch(e){return 'yes'}}
 function gameOk(){return gameState()==='yes'}
 function phone(){return typeof RMT!=='undefined'&&!!RMT}
 function hint(t){return el('div',{class:'hint',text:t})}
 function btn(t,f,o){var b=el('button',{type:'button',text:t,class:o&&o.cls||null,title:o&&o.title||null,onclick:f});if(o&&o.dis)b.disabled=true;return b}
 function row(id,kids,name){return h('div',{class:'row',blk:id,'data-blkname':name||null},kids)}
 function box(id,kids,name){return h('div',{blk:id,box:'col','data-blkname':name||null},kids)}
 function fold(id,label,kids,open,on){return h('details',{blk:id,box:'col','data-blkname':label,open:open?true:null,ontoggle:on||null},[el('summary',{text:label})].concat(kids))}
 function sp(t){return el('span',{text:' '+t+' '})}
 // an error in words; the tools not answering (the window was closed, the PC slept): what happened and what to do, never "fetch failed"
 function offline(e){var m=String(e&&e.message||e||'');return !(e&&e.key)&&!(e&&e.status)&&/fetch failed|failed to fetch|networkerror|network error|load failed|econnrefused|econnreset|network request failed|socket hang up/i.test(m)}
 // what to do next, by the cause: the game folder only when it is the cause; else the mod folder, the fields, or simply again
 function nextOf(e){if(offline(e))return '';var k=String(e&&e.key||''),m=String(e&&e.message||'');
  if(/\.e\.(nogame|nogoh)$/.test(k)||/game folder was not found/i.test(k+' '+m))return tx('missions.sp.err.next');
  if(/\.e\.(nomod|nofolder|notfolder|gameroot|ingame)$/.test(k))return tx('missions.sp.err.mod');
  if(/^missions\.e\.|\.e\.pickmap$/.test(k))return tx('missions.sp.err.spec',{pv:tx('missions.sp.preview')});return tx('missions.sp.err.again')}
 function errNext(e){return offline(e)?tx('missions.sp.err.offline'):K.errText(e)+' '+nextOf(e)}
 function errOnly(e){return offline(e)?tx('missions.sp.err.offline'):K.errText(e)}
 function codeSent(c,p){var k=key('c',c);return known(k)?(p?tx(k,p):tx(k)):tx('missions.sp.c.other',{code:c})}
 // a refusal: the sentence of its kind (sp.js why: no goals, no units, a goal with no place, no soldier for the lose rule ...), else of its code
 function refSent(r){var k=r&&r.why?key('c','spec',r.why):'';return k&&known(k)?tx(k):codeSent(r&&r.code)}
 var EXE={as64:'AS64',mowas2:'MoW:AS2'};
 function exeT(x){return EXE[x]||String(x||'')}
 function cap(s){s=String(s||'');return s.charAt(0).toUpperCase()+s.slice(1)}

 // ---------- language: plural forms, times (exact m:ss, whole minutes in words), Cyrillic to Latin ----------
 function WL(){var c=tx('missions.sp.langcode');return /^(en|ru|uk|zh)$/.test(c)?c:'en'}
 // the language the mission texts are made in: the window's, English for a Chinese window (the game's fonts may lack Chinese letters)
 function TL(){return WL()==='zh'?'en':WL()}
 // FL: a language the texts are made in for a moment (the language a reopened mission was made in), when the page has its strings
 var FL='';
 function hasL(l){return typeof LANGS!=='undefined'&&!!LANGS&&!!LANGS[l]}
 function TF(){return FL||(MT&&WL()==='zh'?'en':'')}
 function LC(){return FL||(MT?TL():WL())}
 // a word of the mission texts: English when they are made in English for a Chinese window (MT is set while goalAuto and autoText run)
 function T(k,p){var f=TF();if(!f||!hasL(f)||LANGS[f][k]==null)return tx(k,p);if(p&&p.n!=null&&String(p.n)==='1'&&LANGS[f][k+'.1']!=null)k=k+'.1';var s=LANGS[f][k];
  return p?s.replace(/\{(\w+)\}/g,function(m,n){return p[n]==null?m:String(p[n])}):s}
 function pf(n){var c=LC();n=Math.abs(Math.round(+n||0));if(c==='ru'||c==='uk'){var a=n%10,b=n%100;return a===1&&b!==11?'one':a>=2&&a<=4&&(b<12||b>14)?'few':'many'}return c==='zh'?'other':n===1?'one':'other'}
 function pl(w,n,p){p=p||{};p.n=n;return T(key('n',w,pf(n)),p)}
 function mmss(s){s=Math.max(0,Math.round(+s||0));var m=Math.floor(s/60),r=s%60;return m+':'+(r<10?'0':'')+r}
 function durT(s){s=Math.max(0,Math.round(+s||0));return s<60?pl('sec',s):s%60===0?pl('min',s/60):T('missions.sp.durms',{t:mmss(s)})}
 function atT(s){s=Math.max(0,Math.round(+s||0));return s===0?tx('missions.sp.at0'):s%60===0?tx('missions.sp.atmin',{n:s/60}):tx('missions.sp.atclock',{t:mmss(s)})}
 var TR={'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya','і':'i','ї':'yi','є':'ye','ґ':'g'};
 var TA={'х':'h','ц':'c','й':'i','ё':'e','щ':'sch','ї':'i','є':'e','г':'h','ю':'iu','я':'ia','ж':'j'};
 function translit(s,alt){s=String(s||'').toLowerCase();var o='';for(var i=0;i<s.length;i++){var c=s.charAt(i);o+=alt&&TA[c]!=null?TA[c]:TR[c]!=null?TR[c]:c}return o}
 function cyr(s){return /[а-яёіїєґ]/i.test(String(s||''))}
 function slug(s){return translit(s).replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40)}
 // a typed word a and a name word b: same first letter, a (trailing vowels dropped) is a subsequence of b, at least 3 letters
 // (also by sound: c as k or s, zh and soft g as j, so "bokazh" finds Bocage)
 function snd(s){return String(s||'').replace(/zh/g,'j').replace(/kh/g,'h').replace(/ph/g,'f').replace(/ck/g,'k').replace(/g(?=[eiy])/g,'j').replace(/c(?=[eiy])/g,'s').replace(/c/g,'k').replace(/w/g,'v').replace(/x/g,'ks')}
 function loose(a,b){return loose1(a,b)||loose1(snd(a),snd(b))}
 function loose1(a,b){a=String(a||'').replace(/[aeiouy]+$/,'');if(a.length<3||!b||a.charAt(0)!==b.charAt(0)||a.length>b.length)return false;var j=0;for(var i=0;i<b.length&&j<a.length;i++)if(b.charAt(i)===a.charAt(j))j++;return j===a.length}
 // common soldier roles and vehicle classes typed in Russian or Ukrainian (word starts, ё as е): the English words of the game's names
 var RW=[['пулемет','machine gun|mg|mgun'],['кулемет','machine gun|mg|mgun'],['снайпер','sniper'],['стрел','rifle'],['стріл','rifle'],['винтов','rifle'],['гвинтів','rifle'],['автоматч','smg|submachine'],
  ['офицер','officer'],['офіцер','officer'],['командир','officer|leader|commander'],['сержант','sergeant|leader'],['танкист','tankman|crew'],['танкіст','tankman|crew'],['танк','tank'],
  ['миномет','mortar'],['міномет','mortar'],['гранатомет','bazooka|panzerschreck|piat'],['гранатомет','bazooka'],['огнемет','flamethrower'],['вогнемет','flamethrower'],['медик','medic'],['санитар','medic'],
  ['сапер','engineer|sapper'],['развед','scout|recon'],['розвід','scout|recon'],['пехот','infantry|rifle'],['піхот','infantry|rifle'],['солдат','rifle|soldier'],['боец','rifle|soldier'],['боєць','rifle|soldier'],
  ['пушк','gun|cannon'],['оруди','gun|cannon'],['гармат','gun|cannon'],['гаубиц','howitzer'],['зенит','flak|anti-aircraft'],['зеніт','flak|anti-aircraft'],['броневик','armored car|armoured car'],
  ['бронеавто','armored car|armoured car'],['бтр','apc|halftrack|half-track'],['бронетранспорт','apc|halftrack|half-track'],['грузовик','truck'],['вантаж','truck'],['джип','jeep'],['мотоцикл','motorcycle'],
  ['самоход','tank destroyer|spg'],['истребител','tank destroyer'],['винищувач','tank destroyer']];
 function roleWords(q){var o=[];String(q||'').toLowerCase().replace(/ё/g,'е').split(/[^a-zа-яіїєґ0-9]+/).forEach(function(w){if(w.length<3)return;
  RW.forEach(function(r){if(w.indexOf(r[0])===0)r[1].split('|').forEach(function(x){if(o.indexOf(x)<0)o.push(x)})})});return o}
 // a search over items with .lo: the typed text, and for Cyrillic also two Latin spellings and the English words of a role or class;
 // "Nothing found" said next to the box (for units typed in Cyrillic: the names are English, with an example)
 function cjk(s){return /[\u3400-\u9fff]/.test(String(s||''))}
 // a unit name that finds nothing in this army but is a unit of another one: said with that army ("Tiger is a unit of Germany: change
 // the army"); the other armies are read quietly for it, and the line is set when they are in (if the box still holds that text)
 function otherArmy(q,army){var r=null;ARMY.forEach(function(a){if(r||a===army||!D.units[a])return;find(unitItems(a),q,function(o){if(o.length)r={name:o[0].label,army:armyT(a)}},null,'')});return r}
 function armyNote(q,army,noteEl){var r=otherArmy(q,army);if(r){noteEl.textContent=tx('missions.sp.nohit.army',r);return}
  ARMY.forEach(function(a){if(a===army||D.units[a])return;loadUnits(a,function(){var r2=otherArmy(q,army);if(r2&&noteEl.sq===q)noteEl.textContent=tx('missions.sp.nohit.army',r2)},true)})}
 function find(items,q,done,noteEl,kind,army){q=String(q||'').trim();var qs=[q.toLowerCase()];if(cyr(q)){qs.push(translit(q));qs.push(translit(q,true));qs=qs.concat(roleWords(q))}
  var seen={},out=[],more=0;if(noteEl)noteEl.sq=q;qs.forEach(function(x,i){if(qs.indexOf(x)<i)return;K.hits(items,x,function(o,m){if(!i)more=m;o.forEach(function(it){var k=it.group+'|'+it.value;if(!seen[k]&&out.length<40){seen[k]=1;out.push(it)}})})});
  // a Cyrillic name spelled the Russian way (тигр, пантера): each typed word, in Latin letters, is a loose spelling of a word of the name
  if(cyr(q))items.forEach(function(it){var k=it.group+'|'+it.value;if(seen[k]||out.length>=40)return;var nw=String(it.label||'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
   if(qs.slice(1).some(function(x){return x.split(/[^a-z0-9]+/).filter(Boolean).every(function(w){return nw.some(function(n){return loose(w,n)})})})){seen[k]=1;out.push(it)}});
  // nothing found for a Cyrillic or Chinese query while no name in the list has such letters: said, with an example
  if(noteEl){var nt='';if(q&&!out.length){var c1=cyr(q),nl=c1||cjk(q),has=nl&&items.some(function(it){return c1?cyr(it.label):cjk(it.label)});
   nt=nl&&!has&&items.length&&kind?(kind==='map'?tx('missions.sp.nohit.mapen',{q:q,ex:items[0].label}):tx('missions.sp.nohit.en',{q:q})):tx('missions.sp.nohit',{q:q})}noteEl.textContent=nt;if(nt&&kind==='unit'&&army)armyNote(q,army,noteEl)}
  done(out,out.length?more:0)}

 // ---------- dropdowns ----------
 function select(opts,val,on,label){var s=el('select',{'aria-label':label}),v=val==null?'':String(val),has=false;
  opts.forEach(function(o){if(String(o.v)===v)has=true;s.appendChild(el('option',{value:String(o.v),text:o.l,title:o.t||null}))});
  if(!has&&v)s.appendChild(el('option',{value:v,text:v}));s.value=v;s.addEventListener('change',function(){on(s.value)});return s}
 function nums(a,b,w){var o=[];for(var i=a;i<=b;i++)o.push({v:i,l:w?pl(w,i):String(i)});return o}
 var MINS=[1,2,3,4,5,6,8,10,12,15,20,30,45,60];
 function minOpts(cur){var a=MINS.slice();cur=Math.round(+cur||0);if(cur>0&&a.indexOf(cur)<0){a.push(cur);a.sort(function(x,y){return x-y})}return a.map(function(i){return {v:i,l:pl('min',i)}})}
 function armyT(a){return tx(key('a',ARMY.indexOf(a)>=0?a:'usa'))}
 function armySel(v,on,label){return select(ARMY.map(function(a){return {v:a,l:armyT(a)}}),v,on,label)}
 function timeSel(v,on,label,lo,hi){v=Math.max(0,Math.round(+v||0));var o=[],has=false;for(var s=lo;s<=hi;s+=30){if(s===v)has=true;o.push({v:s,l:mmss(s)})}
  if(!has){o.push({v:v,l:mmss(v)});o.sort(function(a,b){return a.v-b.v})}return select(o,v,function(x){on(+x)},label)}
 function delaySel(v,on,label){v=Math.max(1,Math.round(+v||5));var o=[5,30,60,120,300].map(function(s){return {v:s,l:durT(s)}});if(!o.some(function(x){return x.v===v})){o.push({v:v,l:durT(v)});o.sort(function(a,b){return a.v-b.v})}
  return select(o,v,function(x){on(+x)},label)}

 // ---------- places: readable labels, natural order; path points and the capture twins only on request ----------
 function PL(){return D.places&&D.places.key===spec.map?D.places.places:[]}
 // the side word of a play area or paradrop name (gamezone_player, paradrop_enemy) in the page's words
 function sideW(n){var s=String(n||'').toLowerCase();return /^players?$/.test(s)?T('missions.sp.pl.wplayer'):/^(enemy|ai)$/.test(s)?T('missions.sp.pl.wenemy'):n}
 function labOf(p){var l=p.lab||{};return l.k==='pbase'?T('missions.sp.pl.pbase'):l.k==='ebase'?T('missions.sp.pl.ebase'):l.k==='flag'?T('missions.sp.pl.flag',{n:l.n}):l.k==='path'?T('missions.sp.pl.path',{n:l.n})
  :l.k==='pstart'?(l.n?T('missions.sp.pl.pstartn',{n:l.n}):T('missions.sp.pl.pstart'))
  :l.k==='mpstart'?T('missions.sp.pl.mpstart',{t:l.t,n:l.n}):l.k==='cflag'?T('missions.sp.pl.cflag',{n:l.n||''}).trim():l.k==='gz'?(l.n?T('missions.sp.pl.gzn',{n:sideW(l.n)}):T('missions.sp.pl.gz'))
  :l.k==='drop'?(l.n?T('missions.sp.pl.dropn',{n:sideW(l.n)}):T('missions.sp.pl.drop')):l.k==='point'||l.k==='pointn'?T('missions.sp.pl.point',{n:l.n}):l.k==='arean'?T('missions.sp.pl.area',{n:l.n}):cap(l.n||p.name)}
 // a spot picked on the map ([x, y] in world units, y north): said by its place in metres
 // (from the middle of the map's playable area, east or west and north or south, never a negative number)
 function spotT(v){var b=D.places&&spec&&D.places.key===spec.map&&D.places.bounds,cx=0,cy=0;if(b&&b.length===4){cx=(b[0]+b[2])/2;cy=(b[1]+b[3])/2}
  var x=Math.round((v[0]-cx)/20),y=Math.round((v[1]-cy)/20);
  return T('missions.sp.pl.spot',{ew:T(x<0?'missions.sp.pl.w':'missions.sp.pl.e',{m:Math.abs(x)}),ns:T(y<0?'missions.sp.pl.s':'missions.sp.pl.n',{m:Math.abs(y)})})}
 // labels per place name (labs; labsT: in English for the mission texts of a Chinese window). Two places of one label are numbered
 // (your base, your base (2)); the file name of a place is only its hover text
 function labF(){var f=TF();return f?'labsT_'+f:'labs'}
 function labels(){var d=D.places;if(!d||!d.places)return;var f=labF();if(d[f])return;var c={},L={},seen={},m={};
  d.places.forEach(function(p){var l=labOf(p);L[p.name]=l;if(!p.dup&&p.kind!=='path')c[l]=(c[l]||0)+1});
  d.places.forEach(function(p){var l=L[p.name];if(c[l]>1&&!p.dup&&p.kind!=='path'){seen[l]=(seen[l]||0)+1;if(seen[l]>1)l=l+' ('+seen[l]+')'}if(f==='labs')p.l=l;m[p.name]=l});d[f]=m}
 // a place in words; while the map's places are read: "reading…", never its file name
 function plab(n){if(n==='start'||n==null)return T('missions.sp.atstart');if(Array.isArray(n))return spotT(n);labels();var on=!!(D.places&&D.places.key===spec.map),L=on&&D.places[labF()];
  if(L&&L[n])return L[n];return on||!n?String(n||''):gameState()==='no'?tx('missions.sp.noread'):T('missions.sp.wait.place')}
 function placeOpts(start,cur){labels();var o=start?[{v:'start',l:tx('missions.sp.atstart')}]:[],R={zone:0,point:1,path:2};
  var a=PL().filter(function(p){return p.name===cur||!p.dup&&(p.kind!=='path'||paths)});
  a.sort(function(x,y){return R[x.kind]-R[y.kind]||String(x.l).localeCompare(String(y.l),undefined,{numeric:true,sensitivity:'base'})});
  a.forEach(function(p){o.push({v:p.name,l:p.l,t:p.name})});return o}
 function plain(){return placeOpts(false).map(function(x){return x.v})}
 // a place field: its object and key; the field last used is where a click on the sketch goes (PT)
 // with the Map Viewer's place picker (MAPVIZ_PICK) a "Pick on the map" button beside it: a place, or any spot ([x, y] in world units)
 // (in a unit row the button shows on the row in use, else on the first row of its group: grp, first)
 function placeSel(o,k,start,label,grp,first){var v=o[k]==null?(start?'start':''):o[k],spot=Array.isArray(v),opts=placeOpts(start,spot?'':v);
  if(spot){opts.unshift({v:'@spot',l:spotT(v)});v='@spot'}
  var s=select(opts,v,function(x){if(x==='@spot')return;o[k]=x;PT={o:o,k:k,l:label,grp:grp};touch();draw()},label);
  s.addEventListener('focus',function(){PT={o:o,k:k,l:label,grp:grp};drawPT()});
  if(typeof MAPVIZ_PICK==='undefined'||!MAPVIZ_PICK||!MAPVIZ_PICK.open)return s;
  var pb=btn(tx('missions.sp.pickmap'),function(){pickOnMap(o,k,label,grp)},{title:tx('missions.sp.pickmap.t')});if(grp)PKB.push({o:o,k:k,grp:grp,first:!!first,b:pb});
  return el('span',{style:'white-space:nowrap','data-pickmap':'1'},[s,pb])}
 // a spot inside the map's playable area (its world clip; no clip known: any spot)
 function inArea(x,y){var b=D.places&&D.places.key===spec.map&&D.places.bounds;if(!b||b.length!==4)return true;
  return x>=Math.min(b[0],b[2])&&x<=Math.max(b[0],b[2])&&y>=Math.min(b[1],b[3])&&y<=Math.max(b[1],b[3])}
 function pickOnMap(o,k,label,grp){say('');labels();var pl0=PL().filter(function(p){return !p.dup}).map(function(p){return {id:p.name,label:p.l,x:p.x,y:p.y,kind:p.kind==='path'?'waypoint':p.kind}});
  var mn=null;(D.maps||[]).forEach(function(m){if(m.key===spec.map)mn=m.name});
  MAPVIZ_PICK.open({target:K.game().id,map:spec.map,mapName:mn||'',places:pl0,title:label,onPick:function(r){if(!r){say('');return}
   if(!(r.place&&r.place.id)&&!inArea(+r.x,+r.y)){say(tx('missions.sp.pick.out',{f:label}),'err');return}
   o[k]=r.place&&r.place.id?r.place.id:[Math.round(r.x),Math.round(r.y)];PT={o:o,k:k,l:label,grp:grp};touch();draw();say(tx('missions.sp.sk.set',{f:label,p:plab(o[k])}),'ok')}})}
 function usedPlaces(){var u={},p=spec.player||{},e=spec.enemy||{};function a(n){if(typeof n==='string')u[n]=1}a(p.start);
  (p.units||[]).concat(spec.reinforcements||[],e.defenders||[]).forEach(function(g){a(g.at)});(e.patrols||[]).forEach(function(g){(g.route||[]).forEach(a)});
  (e.waves||[]).forEach(function(g){a(g.from);a(g.to)});(spec.objectives||[]).forEach(function(o){a(o.zone);a(o.to)});return u}
 function drawPT(){skT.forEach(function(t){t.textContent=PT?tx('missions.sp.sk.target',{f:PT.l}):tx('missions.sp.sk.hint')});
  if(mmT)mmT.textContent=!mmEdit()?tx('missions.sp.map.live.look'):PT?tx('missions.sp.map.live.target',{f:PT.l}):tx('missions.sp.map.live.hint');
  PKB.forEach(function(x){x.b.hidden=!(PT&&PT.o===x.o&&PT.k===x.k||x.first&&!(PT&&PT.grp===x.grp))})}
 function pickDot(p){if(!PT){say(tx('missions.sp.sk.first',{p:p.l}),'hint');return}PT.o[PT.k]=p.name;var f=PT.l;touch();draw();say(tx('missions.sp.sk.set',{f:f,p:p.l}),'ok')}
 function loadPic(){var k=spec.map,g=lastGid;D.pic[k]={busy:true};draw();
  api('/api/x/maps/picture?map='+enc(k),undefined,{what:tx('missions.job.sp.read',{what:tx('missions.sp.read.w.pic')})}).then(function(j){if(g!==lastGid)return;D.pic[k]=j&&j.svg?{svg:j.svg}:{none:true};rdraw()}).catch(function(e){D.pic[k]=e&&e.cancelled?{stopped:true}:{err:errNext(e)};rdraw()})}
 // the sketch: one button per place at its spot (north up, the map's world clip as the frame), the game's map picture behind on request
 // quiet (step 2, where the line above already says the places are being read): nothing while they are read
 // at most 8 place buttons at first (the places the mission uses, then areas, then points), then "Show all N"
 function sketch(id,quiet){labels();var d=D.places,a=PL().filter(function(p){return !p.dup&&(p.kind!=='path'||paths)}),tgt=el('div',{class:'hint'});
  if(!d||d.key!==spec.map)return quiet?null:blk(id,[hint(tx('missions.sp.wait.places'))],{name:tx('missions.sp.sk.h')});
  if(d.err)return null;skT.push(tgt);
  if(!a.length)return blk(id,[hint(tx('missions.sp.sk.none'))],{name:tx('missions.sp.sk.h')});
  var total=a.length,used0=usedPlaces(),allB=null;
  if(total>8&&!FULL){if(!skAll){var RK={zone:0,point:1,path:2};a=a.map(function(p,i){return {p:p,i:i}}).sort(function(x,y){return (used0[x.p.name]?0:1)-(used0[y.p.name]?0:1)||RK[x.p.kind]-RK[y.p.kind]||x.i-y.i}).slice(0,8).map(function(x){return x.p})}
   allB=btn(skAll?tx('missions.sp.sum.less'):tx('missions.sp.sk.all',{n:total}),function(){skAll=!skAll;draw()});allB.setAttribute('data-skall',String(total))}
  var b=d.bounds,x0,x1,y0,y1;if(b&&b.length===4){x0=Math.min(b[0],b[2]);x1=Math.max(b[0],b[2]);y0=Math.min(b[1],b[3]);y1=Math.max(b[1],b[3])}
  else{x0=y0=1e9;x1=y1=-1e9;a.forEach(function(p){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y)})}
  if(x1-x0<1){x0-=500;x1+=500}if(y1-y0<1){y0-=500;y1+=500}
  var used=usedPlaces(),pic=D.pic[spec.map],area=el('div',{style:'position:relative;width:100%;height:260px;border:1px solid var(--line2);background:var(--card);overflow:hidden;margin:4px 0'});
  if(pic&&pic.svg)area.appendChild(el('img',{alt:'',src:'data:image/svg+xml;charset=utf-8,'+enc(pic.svg),style:'position:absolute;left:0;top:0;width:100%;height:100%;opacity:0.55'}));
  a.forEach(function(p){var X=Math.round((p.x-x0)/(x1-x0)*1000)/10,Y=Math.round((y1-p.y)/(y1-y0)*1000)/10;
   area.appendChild(el('button',{type:'button',class:used[p.name]?'primary':null,title:p.l,text:p.l,'data-place':p.name,style:'position:absolute;left:'+X+'%;top:'+Y+'%;transform:translate(-50%,-50%);font-size:11px;line-height:14px;padding:0 3px;white-space:nowrap',onclick:function(){pickDot(p)}}))});
  var pb=pic&&pic.busy?hint(tx('missions.sp.wait.pic')):pic&&pic.none?hint(tx('missions.sp.sk.nopic')):pic&&pic.stopped?el('div',{'data-picstop':'1'},[el('span',{class:'hint',text:tx('missions.sp.read.stopped',{what:tx('missions.sp.read.w.pic')})+' '}),btn(tx('missions.sp.read.again'),function(){loadPic()})]):pic&&pic.err?el('div',{'data-picfail':'1'},[el('span',{class:'err',text:tx('missions.sp.read.fail',{what:tx('missions.sp.read.w.pic')})+' '+pic.err+' '}),btn(tx('missions.sp.retry'),function(){loadPic()})])
   :pic?null:btn(tx('missions.sp.sk.pic'),function(){loadPic()});
  drawPT();
  return blk(id,[tgt,area,allB,pb,el('details',{},[el('summary',{text:tx('missions.details')}),hint(tx('missions.sp.sk.how'))])],{name:tx('missions.sp.sk.h')})}

 // ---------- the mission map: the Map Viewer's picture of the real map with the whole mission drawn on it ----------
 // Shown in place of the sketch when the picker has its inline form (MAPVIZ_PICK.embed); without it the sketch above is drawn as before.
 // ONE handle (MM) for the card: every draw puts its element into the new page and hands it the new marks (update); it is closed when
 // the map, the game or the mod changes (mmSync, at the start of every draw) and by the card's close(). Marks are made from the spec
 // values Preview and Write send; a place is a name of the places read, or a spot [x, y]; a mark whose place is not known is left out.
 var MM=null,MMK='',MMON=false,mmT=null;
 function mmCan(){return typeof MAPVIZ_PICK!=='undefined'&&!!MAPVIZ_PICK&&typeof MAPVIZ_PICK.embed==='function'}
 function mmKey(){return spec?lastGid+'|'+spec.map:''}
 function mmClose(){var m=MM;MM=null;MMK='';MMON=false;if(m&&m.close)try{m.close()}catch(e){}
  try{if(m&&m.el&&m.el.parentNode)m.el.parentNode.removeChild(m.el)}catch(e){}}
 function mmSync(){MMON=false;mmT=null;if(MM&&(MMK!==mmKey()||K.isGoh()))mmClose()}
 // the steps that show it; on the two with place fields (sides, goals) a click fills the field last used, on the others it only names
 function mmStep(){var s=STEPS[step];return s==='map'||s==='sides'||s==='goals'||s==='check'}
 function mmEdit(){var s=STEPS[step];return s==='sides'||s==='goals'}
 // where a place value lies, in world units: a name of the places read, a spot [x, y]; none, start, auto: your start
 function mmXY(v){if(v==null||v==='start'||v==='auto')v=spec.player&&spec.player.start;
  if(Array.isArray(v)){var x=+v[0],y=+v[1];return v.length>1&&isFinite(x)&&isFinite(y)?[x,y]:null}
  if(typeof v!=='string'||!v)return null;var p=placeInfo(v);return p&&isFinite(+p.x)&&isFinite(+p.y)?[+p.x,+p.y]:null}
 function mmPlaces(){labels();var u=usedPlaces();return PL().filter(function(p){return !p.dup&&(p.kind!=='path'||paths||u[p.name])}).map(function(p){var k=p.lab&&p.lab.k;
  return {id:p.name,label:p.l,x:p.x,y:p.y,kind:p.kind==='path'?'waypoint':k==='flag'||k==='cflag'?'flag':p.kind}})}
 // groups of one side that stand on one spot are one mark (their names in the label, their men added up in the badge)
 function mmMarks(){var p=spec.player||{},e=spec.enemy||{},M=[],U={};
  function unit(g,side,v){var q=mmXY(v);if(!q)return;var k=side+'|'+q[0]+'|'+q[1],u=U[k];
   if(u){u.g.push(g);u.m.n+=g.count||1;u.m.label=u.g.map(gNameD).join(' + ');return}
   u=U[k]={g:[g],m:{type:'unit',x:q[0],y:q[1],side:side,label:uNameD(g.def),n:g.count||1}};M.push(u.m)}
  var s=mmXY(p.start);if(s)M.push({type:'start',x:s[0],y:s[1],label:tx('missions.sp.map.live.start')});
  (p.units||[]).forEach(function(g){unit(g,'player',g.at)});
  (spec.reinforcements||[]).forEach(function(g){var q=mmXY(g.at);if(!q)return;
   M.push({type:'unit',x:q[0],y:q[1],side:'player',n:g.count||1,label:tx('missions.sp.map.live.rf',{unit:uNameD(g.def),when:g.after?tx('missions.sp.goal.afterN',{n:goalNo(g.after)}):atT(g.time)})})});
  (e.defenders||[]).forEach(function(g){unit(g,'enemy',g.at)});
  (e.patrols||[]).forEach(function(g){var pts=(g.route||[]).map(function(r){return r==null?null:mmXY(r)}).filter(Boolean);
   if(pts.length>1)M.push({type:'route',pts:pts,side:'enemy',label:gNameD(g)});else if(pts.length)unit(g,'enemy',pts[0])});
  (e.waves||[]).forEach(function(g){var a=g.from==null?null:mmXY(g.from),b=mmXY(g.to);
   if(a&&b)M.push({type:'route',pts:[a,b],side:'enemy',dashed:true,arrow:true,label:gNameD(g)+', '+atT(g.time)});else if(a)unit(g,'enemy',a)});
  (spec.objectives||[]).forEach(function(o,i){var lab=o.text||tx(key('t',TYPES.indexOf(o.type)>=0?o.type:'capture'));
   function goal(v){var q=v==null||v===''?null:mmXY(v);if(q)M.push({type:'goal',x:q[0],y:q[1],n:i+1,label:lab});return q}
   // a goal with no place of its own (destroy): where each group it names stands, walks from or arrives from
   if(o.type==='destroy'){[].concat(o.target||[]).forEach(function(nm){var g=gByName(nm);if(g)goal(g.route?g.route[0]:g.from!=null?g.from:g.at==null?'start':g.at)});return}
   var q=goal(oPlace(o));if(!q||o.type!=='reach'&&o.type!=='escort')return;
   // reach, escort: an arrow to the place, from where the escorted group stands (reach: from your start)
   var eg=o.type==='escort'?gByName(o.unit):null,a=mmXY(eg?eg.at:null);if(a&&(a[0]!==q[0]||a[1]!==q[1]))M.push({type:'route',pts:[a,q],side:'player',arrow:true,label:lab})});
  return M}
 function mmOpts(){var mn='';(D.maps||[]).forEach(function(m){if(m.key===spec.map)mn=m.name});
  return {target:K.game().id,map:spec.map,mapName:mn,places:mmPlaces(),height:STEPS[step]==='check'?460:380,marks:mmMarks(),
   legend:[{side:'player',type:'unit',text:tx('missions.sp.you')},{side:'enemy',type:'unit',text:tx('missions.sp.enemy')},{side:'neutral',type:'goal',text:tx('missions.sp.goals.h')},{side:'enemy',type:'route',text:tx('missions.sp.map.live.routes')}],onPick:mmPick,makePicture:true,base:'l3'}}   // the map picture is made when the user picks the map, as the Pick on the map dialog does
 // a click on the map: a place does what a dot of the sketch does (pickDot); a spot goes into the field last used as [x, y] when it
 // lies in the playable area (the messages of pickOnMap); with no field in use the click only says what lies there
 function mmPick(r){if(!r||!spec)return;labels();var id=r.place&&r.place.id,p=id==null?null:placeInfo(String(id)),x=+r.x,y=+r.y,ed=mmEdit()&&!!PT;
  if(!p&&!(isFinite(x)&&isFinite(y)))return;
  if(!ed){say(tx(mmEdit()?'missions.sp.map.live.first':'missions.sp.map.live.is',{p:p?p.l:spotT([x,y])}),'hint');return}
  if(p){pickDot(p);return}
  var f=PT.l;if(!inArea(x,y)){say(tx('missions.sp.pick.out',{f:f}),'err');return}
  PT.o[PT.k]=[Math.round(x),Math.round(y)];var v=PT.o[PT.k];touch();draw();say(tx('missions.sp.sk.set',{f:f,p:plab(v)}),'ok')}
 // the marks follow a change that draws nothing (a count, a time)
 function mmUpd(){if(MM&&MMON&&MMK===mmKey())try{MM.update(mmOpts())}catch(e){}}
 // the block, once the places of the map are read; null: no inline map (the sketch is drawn where it was)
 function mmBlock(){if(!mmCan()||!mmStep()||K.isGoh())return null;var d=D.places;if(!d||d.key!==spec.map||d.err)return null;
  var o=mmOpts();try{if(MM)MM.update(o);else{MM=MAPVIZ_PICK.embed(o);MMK=mmKey()}}catch(e){mmClose()}
  if(!MM||!MM.el){MM=null;MMK='';return null}
  MMON=true;mmT=el('div',{class:'hint','data-mmline':'1'});
  return blk('sp.mm',[blk('sp.mm.h',[el('b',{text:tx('missions.sp.map.live.h')})]),blk('sp.mm.line',[mmT]),blk('sp.mm.map',[MM.el]),
   blk('sp.mm.how',[el('details',{},[el('summary',{text:tx('missions.details')}),hint(tx('missions.sp.map.live.how'))])])],{name:tx('missions.sp.map.live.h'),'class':'spmm',attrs:{style:'flex:3 1 520px;min-width:260px;max-width:100%'}})}
 // beside the step's fields on a wide window (there it stays in view while the fields scroll), above them on a narrow one
 function mmWrap(mb,kids){var fc=h('div',{blk:'sp.mm.fields',box:'col',style:'flex:1 1 300px;min-width:0'},[]);kids.forEach(function(x){[].concat(x).forEach(function(y){if(y)fc.appendChild(y)})});
  return h('div',{blk:'sp.mm.wrap',style:'display:flex;flex-flow:row-reverse wrap;gap:12px;align-items:flex-start'},[el('style',{text:'@media (min-width:1200px){.spmm{position:sticky;top:8px}}'}),mb,fc])}

 // ---------- units: in-game names, the searchKit per unit box ----------
 function unitInfo(def){var d=String(def||'').toLowerCase(),r=null;Object.keys(D.units).forEach(function(a){var u=D.units[a];if(r||!u)return;
  u.soldiers.concat(u.vehicles).forEach(function(x){if(!r&&x.def===d)r=x})});return r}
 // units still being read: a wait text, never a raw file name
 function unitsBusy(){return Object.keys(D.unitsMod).some(function(a){return D.units[a]===undefined})}
 function unitName(def){var u=unitInfo(def);return u?u.name:gameState()==='no'?tx('missions.sp.noread'):unitsBusy()?tx('missions.sp.wait.unit'):String(def||'').split('/').pop()}
 // what tells apart units of one in-game name (three "U.S. Marine"): the words of their file names (weapon or role)
 function leafW(def){return String(def||'').split('/').pop().replace(/[_-]+/g,' ').trim()}
 function dupOf(def){var u=unitInfo(def),r='';if(!u)return '';Object.keys(D.units).forEach(function(a){var x=D.units[a];if(!x||r)return;
  if(x.soldiers.concat(x.vehicles).some(function(y){return y.def!==u.def&&y.name===u.name}))r=roleW(u.def)});return r}
 // that word in the window's language, never the file name: the role or weapon words the file name holds (mgun: machine gun; a number
 // stays: rifle 2), else "variant N" by its place among the units of that name; the file name is only the hover text
 var RWK={mgun:'mg',mg:'mg',hmg:'mg',lmg:'mg',smg:'smg',rifle:'rifle',rifleman:'rifle',sniper:'sniper',officer:'officer',squadleader:'leader',leader:'leader',sergeant:'leader',at:'at',bazooka:'at',pzf:'at',panzerfaust:'at',panzerschreck:'at',piat:'at',
  medic:'medic',engineer:'eng',sapper:'eng',flamethrower:'flame',flame:'flame',mortar:'mortar',heavy:'heavy',light:'light',elite:'elite',vet:'vet',veteran:'vet',pistol:'pistol',grenadier:'gren',tankman:'crew',crew:'crew',
  para:'para',airborne:'para',scout:'scout',carbine:'carbine',shotgun:'shotgun',assault:'assault',guard:'guard',guards:'guard',marine:'marine',ranger:'ranger',commando:'commando'};
 function roleW(def){var o=[],num='';leafW(def).toLowerCase().split(' ').forEach(function(w){var m=/^([a-z]*?)(\d*)$/.exec(w);if(!m)return;if(m[2])num=m[2];var k=RWK[m[1]];if(k){var t=tx(key('rw',k));if(o.indexOf(t)<0)o.push(t)}});
  if(o.length)return o.join(', ')+(num?' '+num:'');var u=unitInfo(def),n=1;if(u)Object.keys(D.units).forEach(function(a){var x=D.units[a];if(!x)return;
   var same=x.soldiers.concat(x.vehicles).filter(function(y){return y.name===u.name}).map(function(y){return y.def}).sort(),i=same.indexOf(u.def);if(i>=0)n=i+1});
  return tx('missions.sp.rw.var',{n:n})}
 function unitItems(army){var u=D.units[army];if(!u)return [];if(u.items)return u.items;var a=[],cnt={};
  u.soldiers.concat(u.vehicles).forEach(function(x){cnt[x.name]=(cnt[x.name]||0)+1});
  function hn(x){return cnt[x.name]>1?roleW(x.def)+' · '+x.def:x.def}
  // found by class too (tank, armored car, cannon: the folder the game keeps it in), so "tank" lists the tanks and not only their crews
  function vlo(x){return (x.name+' '+x.def+' '+String(x.cls||'').replace(/[_-]+/g,' ')+' '+(x.kind==='gun'?'gun cannon':'vehicle')).toLowerCase()}
  u.soldiers.forEach(function(x){a.push({group:tx('missions.sp.g.soldiers'),label:x.name,value:x.def,hint:hn(x),u:x,lo:(x.name+' '+x.def).toLowerCase()})});
  u.vehicles.forEach(function(x){a.push({group:tx(x.kind==='gun'?'missions.sp.g.guns':'missions.sp.g.vehicles'),label:x.name,value:x.def,hint:hn(x),u:x,lo:vlo(x)})});
  u.items=a;return a}
 function defOfPath(p){p=String(p||'').split(String.fromCharCode(92)).join('/').replace(/^resource\//i,'');var m=/set\/breed\/(.+)\.set$/i.exec(p);if(m)return m[1].toLowerCase();
  m=/([^\/]+)\.def$/i.exec(p);return m?m[1].toLowerCase():''}
 function findDef(army,text){var q=String(text||'').trim().toLowerCase(),r='';if(!q)return '';var t=translit(q);unitItems(army).forEach(function(it){if(!r&&(it.value===q||it.label.toLowerCase()===q||it.label.toLowerCase()===t))r=it.value});return r}
 function setDef(g,def){var was=unitInfo(g.def),u=unitInfo(def);g.def=def;if(u&&u.kind&&!(was&&was.kind))g.count=1;if(u&&u.crew)g.crew={def:u.crew.def,count:u.crew.count};else delete g.crew}
 function crewText(g){if(!g.crew)return '';return tx('missions.sp.crew',{n:g.crew.count||1,unit:unitName(g.crew.def||g.crew)})}
 function gName(g){return unitName(g.def)+((g.count||1)>1?' ×'+(g.count||1):'')}
 // the same for the page's own lists: two units of one in-game name get their telling word (weapon or role)
 function uNameD(def){var d=dupOf(def);return unitName(def)+(d?', '+d:'')}
 function gNameD(g){return uNameD(g.def)+((g.count||1)>1?' ×'+(g.count||1):'')}
 function unitBox(g,army,label,onSet){var inp=el('input',{type:'text',autocomplete:'off','aria-label':label,placeholder:tx('missions.sp.unit.ph')}),cr=el('span',{class:'hint'}),nh=el('span',{class:'hint'}),dw=el('span',{class:'hint','data-dup':'1'});
  function show(){if(!unitInfo(g.def)&&unitsBusy()){inp.value='';inp.placeholder=tx('missions.sp.wait.unit')}else{inp.value=unitName(g.def);inp.placeholder=tx('missions.sp.unit.ph')}
   var dp=dupOf(g.def);cr.textContent=crewText(g);dw.textContent=dp?' '+dp+' ':'';inp.setAttribute('title',String(g.def||''));if(onSet)onSet()}
  show();
  // a click on the box opens the whole list: the name already in the box is not a search
  var kit=searchKit(inp,{key:'missions.sp.unit',index:function(q,done){var cur=String(q||'').trim()===unitName(g.def);find(unitItems(army),cur?'':q,done,nh,'unit',army)},
   browse:{mode:'file',view:'data',start:'set/breed/mp/'+army,toValue:defOfPath},
   onPick:function(v,it){var d=it&&it.value||defOfPath(v)||findDef(army,v)||v;setDef(g,d);show();nh.textContent='';touch()}});
  inp.addEventListener('change',function(){var t=inp.value,d=findDef(army,t);if(d){setDef(g,d);nh.textContent=''}else if(String(t).trim()&&String(t).trim()!==unitName(g.def))nh.textContent=tx('missions.sp.unit.kept',{t:t,u:unitName(g.def)});
   show();touch()});
  return [kit.el,dw,cr,nh]}

 // ---------- the groups of both sides (goals and losing name them) ----------
 function groups(){var a=[],p=spec.player||{},e=spec.enemy||{};
  (p.units||[]).forEach(function(g){a.push({g:g,side:'player'})});(spec.reinforcements||[]).forEach(function(g){a.push({g:g,side:'player',later:true})});
  ['defenders','patrols','waves'].forEach(function(k){(e[k]||[]).forEach(function(g){a.push({g:g,side:'enemy'})})});return a}
 function gByName(n){var r=null;groups().forEach(function(x){if(!r&&x.g.name===n)r=x.g});return r}
 function newName(def){var b=String(def||'group').split('/').pop().replace(/[^A-Za-z0-9_-]/g,'_').slice(0,30)||'group',n=b,i=2,taken={};
  groups().forEach(function(x){taken[x.g.name]=1});while(taken[n])n=b+'_'+(i++);return n}
 function gWhere(g){return g.route?(g.route||[]).map(plab).join(' → '):g.from!=null?plab(g.from):plab(g.at)}
 function glabel(g){return tx('missions.sp.glabel',{unit:uNameD(g.def),n:g.count||1,at:gWhere(g)})}
 function gopts(side,humans){return groups().filter(function(x){return x.side===side&&!x.later&&(!humans||!(unitInfo(x.g.def)||{}).kind)}).map(function(x){return {v:x.g.name,l:glabel(x.g)}})}
 function lvlT(g){return g.difficulty&&g.difficulty!=='easy'?tx(key('lv',g.difficulty)):''}

 // ---------- texts: made from the fields in the window's language, unless typed (spec.card.own) ----------
 function tplOf(){var k=spec&&spec.card&&spec.card.kind,r=null;(D.start&&D.start.templates||[]).forEach(function(t){if(t.name===k)r=t});return r}
 function oPlace(o){return o.zone||o.at||o.to||''}
 function sameGoal(o){var t=tplOf();if(!t||spec.map!==t.spec.map)return null;var T=null;t.spec.objectives.forEach(function(x){if(x.id===o.id)T=x});
  if(!T||T.type!==o.type||oPlace(T)!==oPlace(o)||(T.unit||'')!==(o.unit||''))return null;
  return JSON.stringify([].concat(T.target||[]))===JSON.stringify([].concat(o.target||[]))?T:null}
 function tplSame(){var t=tplOf();if(!t||spec.map!==t.spec.map||(spec.objectives||[]).length!==t.spec.objectives.length)return false;return (spec.objectives||[]).every(function(o){return !!sameGoal(o)})}
 // ---- the words of a goal line: a sentence as a person would write it, with no place code and no file name in it ----
 // a place: its own name when the map gives it one (not a flag code, start point, path point or spot), your base, the enemy base,
 // else "the marked point" (the goal marker in the game shows it). cs: the case the sentence needs (acc | gen; Russian, Ukrainian)
 function placeInfo(n){var r=null;if(typeof n==='string')PL().forEach(function(p){if(!r&&p.name===n)r=p});return r}
 function nameOfPlace(n){var p=placeInfo(n),l=p&&p.lab||{};if(!p||p.kind==='path'||l.k&&l.k!=='area'&&l.k!=='point')return '';var s=String(l.n||p.name||'').replace(/[_-]+/g,' ').trim();return /\d/.test(s)||s.length<3?'':cap(s)}
 function placeT(n,cs){var p=placeInfo(n),k=p&&p.lab&&p.lab.k,nm=nameOfPlace(n);if(nm)return T(key('plt','name',cs),{name:nm});
  return T(key('plt',k==='pbase'?'pbase':k==='ebase'?'ebase':'mark',cs))}
 // a group: English "the squad leader", "the 4 riflemen" (plural of a plain name; a name with digits or dots stays: 2 × Pak 40);
 // Russian and Ukrainian keep the game's name as it is, in quotes after a word that carries the case (отряд «Rifleman» (4 бойца))
 function enPlural(s){var i=s.lastIndexOf(' '),h0=i<0?'':s.slice(0,i+1),w=i<0?s:s.slice(i+1);
  if(/man$/.test(w))w=w.slice(0,-3)+'men';else if(/(s|x|ch|sh)$/.test(w))w+='es';else if(/[^aeiou]y$/.test(w))w=w.slice(0,-1)+'ies';else w+='s';return h0+w}
 function whoT(g){var u=unitInfo(g.def),nm=unitName(g.def),n=g.count||1,kd=u&&u.kind?(u.kind==='gun'?'gun':'veh'):'man';
  if(LC()==='en'){var simple=/^[A-Z][a-z]+( [A-Za-z][a-z]+)*$/.test(nm),lo=simple?nm.toLowerCase():nm;
   return n===1?T('missions.sp.who.one',{unit:lo}):simple?T('missions.sp.who.n',{n:n,units:enPlural(lo)}):T('missions.sp.who.x',{n:n,unit:nm})}
  return n===1?T(key('who',kd,'one'),{unit:nm}):T(key('who',kd,'n'),{unit:nm,cnt:pl(kd==='man'?'man':'piece',n)})}
 function listT(a){if(a.length<2)return a.join('');return T('missions.sp.list2',{a:a.slice(0,-1).join(', '),b:a[a.length-1]})}
 function whoOf(o){return listT([].concat(o.type==='escort'?o.unit||[]:o.target||[]).map(function(n){var g=gByName(n);return g?whoT(g):n}))}
 // a time in the case "for how long" needs (Russian, Ukrainian: 1 минуту)
 function durA(s){s=Math.max(0,Math.round(+s||0));return s<60?pl('secacc',s):s%60===0?pl('minacc',s/60):T('missions.sp.durms',{t:mmss(s)})}
 function goalAuto(o){var w=MT;MT=true;try{var G=sameGoal(o),kk=G&&key('tg',spec.card.kind,o.id),s=(o.minutes||0)*60;
  if(G&&known(kk))return T(kk,{n:durT(s)});var tp=TYPES.indexOf(o.type)>=0?o.type:'capture',cs=tp==='reach'||tp==='escort'?'gen':'acc';
  return T(key('gt',tp),{place:placeT(oPlace(o),cs),n:durA(s),who:whoOf(o)})}finally{MT=w}}
 // the place a title names: the place's own name, else the map's in-game name, else none (the title is then the kind's word)
 function titlePlace(){var nm=nameOfPlace(mainPlace());if(nm)return nm;var r='';(D.maps||[]).forEach(function(m){if(m.key===spec.map)r=m.name});return r}
 function mainPlace(){var o=(spec.objectives||[])[0];if(!o)return spec.player&&spec.player.start;if(oPlace(o))return oPlace(o);
  if(o.type==='destroy'){var g=gByName([].concat(o.target||[])[0]);if(g)return g.at||g.from||(g.route||[])[0]}return spec.player&&spec.player.start}
 function briefN(k){if(k==='defence'){var h=(spec.objectives||[]).filter(function(o){return o.type==='hold'})[0];return h?durT(h.minutes*60):null}
  if(k==='breakthrough')return spec.lose&&spec.lose.minutes?durT(spec.lose.minutes*60):null;return ''}
 function genBrief(){return T('missions.sp.brief.gen',{goals:(spec.objectives||[]).filter(function(o){return o.primary!==false}).map(function(o,i){return (i+1)+') '+o.text}).join('; ')})}
 function autoText(f){var w=MT;MT=true;try{return autoText1(f)}finally{MT=w}}
 function autoText1(f){var t=tplOf(),k=t&&t.name,same=tplSame(),home=t&&spec.map===t.spec.map;
  if(f==='title'){var tp=same?'':titlePlace();return same?T(key('tpl',k,'title')):!tp?(k?T(key('kt',k)):T('missions.sp.title.plain')):k?T(key('tpl',k,'titlep'),{place:tp}):T('missions.sp.title.gen',{place:tp})}
  if(f==='briefing'){var n=same?briefN(k):null;return n!==null?T(key('tpl',k,'brief'),{n:n}):genBrief()}
  if(f==='campaignTitle')return T('missions.sp.tpl.camp');
  if(f==='date')return home?T(key('tpl',k,'date')):'';
  if(f==='place')return home?T('missions.sp.tpl.place'):'';
  return T(key('txt',f))}
 function autoOf(k){if(/^goal:/.test(k)){var id=k.slice(5),o=(spec.objectives||[]).filter(function(x){return x.id===id})[0];return o?goalAuto(o):''}return autoText(k)}
 // what a made text follows, in no language (the values, not their words): a text kept from another window language is flagged when these change
 function goalSig(o){return [o.type,oPlace(o),o.minutes||0,o.unit||'',[].concat(o.target||[]),o.primary===false?0:1]}
 function sigOf(k){if(/^goal:/.test(k)){var id=k.slice(5),o=(spec.objectives||[]).filter(function(x){return x.id===id})[0];return o?JSON.stringify(goalSig(o)):''}
  var t=tplOf(),kd=t&&t.name||'',same=tplSame(),home=!!(t&&spec.map===t.spec.map),L=spec.lose||{};
  if(k==='title')return JSON.stringify([kd,same,same?'':mainPlace(),same?'':spec.map]);
  if(k==='briefing')return JSON.stringify([kd,same,L.minutes||0,(spec.objectives||[]).map(goalSig)]);
  if(k==='date'||k==='place')return JSON.stringify([kd,home]);return ''}
 function curText(k){if(/^goal:/.test(k)){var id=k.slice(5),o=(spec.objectives||[]).filter(function(x){return x.id===id})[0];return o?o.text:''}return spec[k]}
 function autoIn(lang,k){var w=FL;FL=lang;try{return autoOf(k)}finally{FL=w}}
 function readAll(){return !!(D.places&&D.places.key===spec.map&&!D.places.err&&D.units[spec.player.army]&&D.units[spec.enemy.army])}
 // a mission reopened in another window language: a text that is still the made one of its language (not typed, its values unchanged) is
 // made again in this window's language; only typed or changed texts stay "kept in <language>". Waits until the places and units are read
 function settle(){var c=spec&&spec.card;if(!c||!c.langMade||!readAll())return;
  Object.keys(c.langMade).forEach(function(k){var lg=c.langOwn&&c.langOwn[k];
   if(lg&&hasL(lg)&&c.sig&&sigOf(k)===c.sig[k]&&autoIn(lg,k)===curText(k)){RL=RL||{from:lg,keep:{}};RL.keep[k]={t:curText(k),sig:c.sig[k]};delete c.own[k];delete c.base[k];delete c.langOwn[k];delete c.sig[k]}});delete c.langMade}
 // said once, with the way back: "Texts were re-made in <language>" + "Keep the old texts" (they then stay as made in the old language,
 // marked kept: a change of map makes them again, so no text names a place of the old map)
 function setText(k,v){if(/^goal:/.test(k)){var id=k.slice(5);(spec.objectives||[]).forEach(function(o){if(o.id===id)o.text=v})}else spec[k]=v}
 function relangB(){if(!RL||!spec||!Object.keys(RL.keep).length)return null;
  return blk('sp.relang',[el('div',{class:'wzstat','data-relang':RL.from},[el('span',{text:tx('missions.sp.relang',{lang:tx(key('ln',TL())),was:tx(key('ln',RL.from))})+' '}),
   btn(tx('missions.sp.relang.undo'),function(){var c=spec.card,r=RL;RL=null;c.langOwn=c.langOwn||{};c.sig=c.sig||{};c.kept=c.kept||{};
    Object.keys(r.keep).forEach(function(k){setText(k,r.keep[k].t);c.own[k]=true;c.langOwn[k]=r.from;c.sig[k]=r.keep[k].sig;c.kept[k]=1});touch(true);draw()}),
   el('span',{text:' '}),btn(tx('missions.sp.relang.ok'),function(){RL=null;draw()})])])}
 function dropKept(){var c=spec&&spec.card;if(!c||!c.kept)return;Object.keys(c.kept).forEach(function(k){delete c.own[k];delete c.base[k];if(c.langOwn)delete c.langOwn[k];if(c.sig)delete c.sig[k]});delete c.kept}
 // the texts that no longer match the values they were made from (typed, or kept from another language)
 function ownMoved(k){var c=spec.card;if(!c.own[k])return false;var lg=c.langOwn&&c.langOwn[k];return lg?!!(c.sig&&c.sig[k]!=null&&sigOf(k)!==c.sig[k]):autoOf(k)!==c.base[k]}
 function staleTexts(){var c=spec&&spec.card,n=0;if(!c)return 0;Object.keys(c.own||{}).forEach(function(k){if(/^goal:/.test(k)?(spec.objectives||[]).some(function(o){return 'goal:'+o.id===k}):spec[k]!=null)if(ownMoved(k))n++});return n}
 function fill(){if(!spec)return;var c=spec.card;settle();
  (spec.objectives||[]).forEach(function(o){if(!c.own['goal:'+o.id])o.text=goalAuto(o)});
  TEXTS.forEach(function(f){if(f!=='goals'&&!c.own[f])spec[f]=autoText(f)});
  if(!(spec.lose&&spec.lose.minutes)&&!c.own.timerText)delete spec.timerText;
  if(!lock&&c.own.campaignTitle)spec.campaign=slug(spec.campaignTitle)||'spmis_custom';
  if(nameAuto&&!lock)spec.name=uniq(slug(spec.title)||'spmis_'+(c.kind||'mission'))}
 // the folder name follows the title; a name another mission of this campaign has (My generated missions) gets _2, _3 ...
 function taken(n){var c=spec&&spec.campaign;return mine.some(function(x){return x.mission===n&&(!c||x.campaign===c)})}
 function uniq(b){b=String(b||'my_mission').slice(0,36);var n=b,i=2;while(taken(n))n=b+'_'+(i++);return n}
 // "Use a new folder name": the next free name after the one that is taken (the folder of another mission)
 function newFolder(){var b=String(spec.name||'my_mission').replace(/_\d+$/,'').slice(0,36),n=b,i=2;while(taken(n)||n===spec.name)n=b+'_'+(i++);spec.name=n;nameAuto=false;touch();preview()}
 function setOwn(k,v,set){var c=spec.card;if(c.langOwn)delete c.langOwn[k];if(c.sig)delete c.sig[k];if(c.langMade)delete c.langMade[k];if(String(v).trim()){if(!c.own[k]){c.own[k]=true;c.base[k]=autoOf(k)}set(v)}else{delete c.own[k];delete c.base[k]}}
 // a text kept from the language a reopened mission was made in says that; when a value it was made from changed since, it is flagged too
 function ownWarn(k){var c=spec.card;if(!c.own[k])return null;var lg=c.langOwn&&c.langOwn[k],moved=ownMoved(k),p={lang:lg?tx(key('ln',lg)):'',use:tx('missions.sp.own.use')};
  return el('div',{class:moved?'wzstat':'hint','data-own':moved?'moved':lg?'lang':'mine','data-ownlang':lg||null},[el('span',{text:(lg?tx(moved?'missions.sp.own.langwarn':'missions.sp.own.lang',p):tx(moved?'missions.sp.own.warn':'missions.sp.own.mine'))+' '}),
   btn(tx('missions.sp.own.use'),function(){delete c.own[k];delete c.base[k];if(c.langOwn)delete c.langOwn[k];if(c.sig)delete c.sig[k];touch();draw()})])}
 // a spec from a kind or a saved mission: the card's own record (kind, typed texts), goals by zone
 function prep(s,kind,own){if(!s.card||typeof s.card!=='object')s.card={kind:kind||'',own:own||{},base:{}};s.card.own=s.card.own||{};s.card.base=s.card.base||{};s.card.lang=TL();
  if(!s.player)s.player={army:'usa',units:[]};if(!s.enemy)s.enemy={army:'ger'};if(!s.lose)s.lose={allDead:true};
  (s.objectives||[]).forEach(function(o){if(o.at&&!o.zone&&o.type!=='escort'){o.zone=o.at;delete o.at}});return s}

 // ---------- loading (each wait says what is read and how long) ----------
 // asked once per game kind, whatever asks meanwhile waits for that one answer (focus and refresh both start the card)
 function loadStart(cb){var k=K.isGoh()?'goh':'as2';if(START[k]){D.start=START[k];armyOf(D.start);cb();return}var q=STARTQ[k]=STARTQ[k]||[];q.push(cb);if(q.length>1)return;
  api('/api/x/missions/sp/start',undefined,{what:tx('missions.job.sp.read',{what:tx('missions.sp.read.w.start')})}).then(function(j){START[k]=j;okRead('start');var w=STARTQ[k]||[];STARTQ[k]=[];if((K.isGoh()?'goh':'as2')!==k)return;D.start=j;armyOf(j);w.forEach(function(f){f()})})
   .catch(function(e){STARTQ[k]=[];failed('start',e);loadMine(false)})}
 // a read that failed is not kept as an answer: it is asked again by "Try again", by the next thing that needs it, and by itself (a few
 // times, further apart) while the tools do not answer; every failed read is one plain line with that button (readFailB)
 function failed(w,e){ERR[w]=e;if(offline(e)&&typeof setTimeout==='function'&&!RTT&&RTN<6){RTN++;RTT=setTimeout(function(){RTT=null;if(Object.keys(ERR).length)retry(true)},Math.min(30000,2000*RTN))}rdraw(w==='maps')}
 function okRead(w){if(ERR[w]){delete ERR[w];if(!Object.keys(ERR).length)RTN=0}}
 function armyOf(j){ARMY=j&&j.armies&&j.armies.length?j.armies.slice():ARMY0.slice()}
 function retry(auto){ERR={};if(!auto)RTN=0;say('');if(!spec)start();else{bgLoad();if(STEPS[step]==='check')loadMods();loadMine(false)}draw()}
 function readFailB(){var ks=Object.keys(ERR);if(!ks.length||gameState()==='no')return null;var w=[];ks.forEach(function(k){var t=tx(key('read','w',k.split('.')[0]));if(w.indexOf(t)<0)w.push(t)});
  var live=ks.filter(function(k){return !(ERR[k]&&ERR[k].cancelled)});
  if(!live.length)return blk('sp.readfail',[el('div',{class:'hint','data-readstop':ks.join(' '),text:tx('missions.sp.read.stopped',{what:w.join(', ')})}),btn(tx('missions.sp.read.again'),function(){retry(false)})]);
  ks=live.concat(ks.filter(function(k){return live.indexOf(k)<0}));
  return blk('sp.readfail',[el('div',{class:'err','data-readfail':ks.join(' '),text:tx('missions.sp.read.fail',{what:w.join(', ')})+' '+errNext(ERR[ks[0]])}),btn(tx('missions.sp.retry'),function(){retry(false)})])}
 function loadMaps(){if(D.maps||!gameOk())return;var g=lastGid;D.maps=[];D.mapsBusy=true;D.mapsErr=false;
  api('/api/x/missions/sp/maps?mod='+enc(mod()),undefined,{what:tx('missions.job.sp.read',{what:tx('missions.sp.read.w.maps')})}).then(function(j){if(g!==lastGid)return;D.maps=j.maps||[];D.mapsBusy=false;if(K.isGoh()){D.envs=j.envs||[];D.music=j.music||[];(j.armies||[]).forEach(function(a){if(ARMY.indexOf(a)<0)ARMY.push(a)})}MI=null;okRead('maps');rdraw(true)}).catch(function(e){D.maps=null;D.mapsBusy=false;D.mapsErr=true;failed('maps',e)})}
 function loadPlaces(key,cb){if(!gameOk())return;if(D.placesFor===key){if(cb&&D.places&&D.places.key===key)cb();return}D.placesFor=key;var g=lastGid;
  api('/api/x/missions/sp/places?map='+enc(key)+'&mod='+enc(mod()),undefined,{what:tx('missions.job.sp.read',{what:tx('missions.sp.read.w.places')})}).then(function(j){if(g!==lastGid||D.placesFor!==key)return;D.places=j;okRead('places');if(cb)cb();rdraw()})
   .catch(function(e){if(D.placesFor===key){D.placesFor='';D.places={key:key,places:[],err:true};failed('places',e)}})}
 // quiet: no redraw and no failure line (the other armies, read to say which army a searched unit belongs to)
 function loadUnits(army,cb,quiet){var m=mod();if(!gameOk())return;if(D.unitsMod[army]===m&&D.units[army]!==null){if(cb){if(D.units[army])cb();else(UQ[army]=UQ[army]||[]).push(cb)}return}D.unitsMod[army]=m;var g=lastGid;
  function fin(){var q=UQ[army]||[];UQ[army]=[];if(cb)cb();q.forEach(function(f){f()})}
  api('/api/x/missions/sp/units?army='+enc(army)+'&mod='+enc(m),undefined,{what:tx('missions.job.sp.read',{what:tx('missions.sp.read.w.units')})}).then(function(j){if(g!==lastGid)return;D.units[army]=j;okRead('units.'+army);fin();if(!quiet)rdraw()})
   .catch(function(e){D.units[army]=null;fin();if(!quiet)failed('units.'+army,e)})}
 // the missions of this card in the mod: asked after the kinds (sp/start answers from the game alone and never waits for this)
 function loadMine(force){var m=mod();if(!force&&mineFor===m)return;mineFor=m;if(!m){mine=[];mineBusy=false;drawMine();return}var g=lastGid;mineBusy=true;drawMine();
  api('/api/x/missions/sp/mine?mod='+enc(m),undefined,{what:tx('missions.job.sp.read',{what:tx('missions.sp.read.w.mine')})}).then(function(j){if(g!==lastGid||mineFor!==m)return;mine=j.missions||[];mineBusy=false;okRead('mine');drawMine()}).catch(function(e){mine=[];mineBusy=false;if(mineFor===m)mineFor=null;failed('mine',e)})}
 function loadMods(){var m=mod();if(D.modsFor===m||!gameOk())return;D.modsFor=m;var g=lastGid;
  api('/api/x/missions/sp/mods?mod='+enc(m),undefined,{what:tx('missions.job.sp.read',{what:tx('missions.sp.read.w.mods')})}).then(function(j){if(g!==lastGid||D.modsFor!==m)return;D.mods=j;okRead('mods');if(STEPS[step]==='check'||modGone())rdraw()}).catch(function(e){D.mods={mods:[],cur:null};if(D.modsFor===m)D.modsFor=null;failed('mods',e)})}
 // the picked mod folder is not there (moved, renamed, deleted): its own sentence and next step, on every step and before Preview
 function modGone(){var c=D.mods&&D.mods.cur,m=mod();return !!(m&&c&&c.path===m&&c.ok===false&&c.gone===true)}
 function goneKids(){var m=mod();return [el('div',{class:'err',text:tx('missions.sp.modgone',{name:String(m).split(/[\\\/]/).pop()})}),
  el('div',{},[el('span',{text:tx('missions.sp.modgone.next')+' '}),btn(tx('missions.sp.mod.other'),function(){if(typeof pick==='function')pick('dir','',function(p){if(p)useMod(p)})}),
   btn(tx('missions.sp.newmod'),function(){if(typeof newModAt==='function')newModAt('');else K.go('make')})])]}
 function goneB(){return modGone()&&STEPS[step]!=='check'?blk('sp.modgone',goneKids()):null}

 // ---------- the spec ----------
 // keep (the mission so far, when a kind is picked over another one): its map and its two armies stay where they still fit: the places
 // are set again on that map, the units become the kept army's own (reArmy, once the kind's own army is read)
 function useKind(t,keep){spec=prep(clone(t.spec),t.name,{});nameAuto=true;editing=null;lock=null;bad=null;mapNote='';notes=[];prev=null;PT=null;openG='pu';OU={};dirty=false;kindAsk=null;RL=null;D.placesFor='';
  var km=!!(keep&&keep.map&&keep.map!==spec.map),p0=spec.player.army,e0=spec.enemy.army,pa=keep&&keep.player&&keep.player.army,ea=keep&&keep.enemy&&keep.enemy.army;
  if(km)spec.map=keep.map;
  if(pa&&pa!==p0&&ARMY.indexOf(pa)>=0)loadUnits(p0,function(){reArmy('player',pa,true)});
  if(ea&&ea!==e0&&ARMY.indexOf(ea)>=0)loadUnits(e0,function(){reArmy('enemy',ea,true)});
  bgLoad(km)}
 // a click on a kind: the one already picked does nothing (on a mission written or opened again it asks, as that starts a new one);
 // another one, after anything was changed, asks first in the page (Change / Keep); else it is taken at once
 function pickKind(t){var on=t.name===(spec.card&&spec.card.kind);if(on&&!editing&&!lock){if(kindAsk){kindAsk=null;draw()}return}
  if(dirty||editing||lock){kindAsk=t.name;draw();return}useKind(t);draw()}
 // the reads behind step 1 (maps, the places of the map, the units of both armies): the server answers them one after another, after the
 // kinds; on a large mod the first one opens the whole mod (half a minute), the units are then kept per mod
 function bgLoad(force){if(!spec||!gameOk())return;loadMods();loadMaps();loadPlaces(spec.map,force?function(){fixPlaces(true);touch(true)}:fixPlaces);loadUnits(spec.player.army);loadUnits(spec.enemy.army)}
 // a map that lacks a place the mission names: that place becomes one of this map's (said once, under the map)
 // Your start is picked first (a player / base / start zone, else start point A1, else the first zone) and is never an enemy place: an enemy
 // group at the start, or a stop or wave source there, moves to another place too. Places are taken from the zones first, then points.
 // What goes where (also the places new goals and enemy groups start with): a goal on a flag (the middle one seen from your start, then the
 // farther ones), else the enemy base, another area or point, else a start point of the other side; defenders ON the place of a goal you
 // must take or reach; patrols and wave sources on the start points of the other side (multiplayer maps: A1 against B1, B2), else the enemy
 // base and the far flags. Two fields that named one place before name one place after (a hold place that was your start stays your start).
 function placeRoles(){var P=PL().filter(function(x){return !x.dup&&x.kind!=='path'}),p=spec.player||{},st=typeof p.start==='string'?p.start.toLowerCase():'',S=null;
  function kd(x){return x.lab&&x.lab.k||''}
  P.forEach(function(x){if(x.name.toLowerCase()===st)S=x});if(!S&&Array.isArray(p.start))S={x:p.start[0],y:p.start[1],lab:{}};
  function d(a){return S?Math.sqrt((a.x-S.x)*(a.x-S.x)+(a.y-S.y)*(a.y-S.y)):0}
  var rest=P.filter(function(x){return x.name.toLowerCase()!==st&&kd(x)!=='pbase'&&kd(x)!=='pstart'}),mp=P.filter(function(x){return kd(x)==='mpstart'}),team=S&&kd(S)==='mpstart'?S.lab.t:'';
  if(!team&&S&&mp.length){var near=mp.slice().sort(function(a,b){return d(a)-d(b)})[0];team=near.lab.t}
  var opp=mp.filter(function(x){return x.lab.t!==team&&x.name.toLowerCase()!==st}).sort(function(a,b){return String(a.name).localeCompare(String(b.name),undefined,{numeric:true})});
  var flags=rest.filter(function(x){return kd(x)==='flag'||kd(x)==='cflag'}).sort(function(a,b){return d(a)-d(b)}),m=Math.floor(flags.length/2),fl=flags.slice(m).concat(flags.slice(0,m).reverse());
  var eb=rest.filter(function(x){return kd(x)==='ebase'}),big=rest.filter(function(x){return kd(x)==='gz'||kd(x)==='drop'});
  var other=rest.filter(function(x){return flags.indexOf(x)<0&&kd(x)!=='mpstart'&&eb.indexOf(x)<0&&big.indexOf(x)<0});
  function nm(a){return a.map(function(x){return x.name})}
  var goal=nm(fl.concat(eb,other,opp)),foe=nm(opp.concat(eb,flags.slice().reverse(),other));
  if(!goal.length)goal=nm(big.concat(rest.filter(function(x){return big.indexOf(x)<0})));if(!foe.length)foe=goal.slice();
  return {goal:goal,foe:foe,opp:nm(opp)}}
 function attackPlaces(){var st=typeof spec.player.start==='string'?spec.player.start.toLowerCase():'',A=[];(spec.objectives||[]).forEach(function(o){if(!/^(capture|reach|escort)$/.test(o.type))return;var v=o.zone||o.to;
   if(typeof v==='string'&&v&&v.toLowerCase()!==st&&A.indexOf(v)<0)A.push(v)});return A}
 // the place a new goal starts with: the first flag (in that order) no goal uses yet; of a new defender group: the place of a goal to take
 function goalPlace(){var R=placeRoles(),u={};(spec.objectives||[]).forEach(function(o){[o.zone,o.to].forEach(function(v){if(typeof v==='string')u[v]=1})});
  return R.goal.filter(function(x){return !u[x]})[0]||R.goal[0]||plain()[0]||(PL()[0]||{}).name||''}
 function defPlace(){return attackPlaces()[0]||placeRoles().goal[0]||plain()[0]||''}
 function foePlace(i,not){var R=placeRoles(),a=(R.opp.length>i?R.opp:R.foe).filter(function(x){return !not||not.indexOf(x)<0});return a[i%Math.max(1,a.length)]||R.foe[0]||plain()[0]||''}
 // an escort: the enemy on the way (patrol stops, the place of a side goal and its defenders) sits between your start and the place to
 // reach, never beyond it: places near that line (from a fifth of the way to its end, no farther off it than half its length), nearest
 // to the line first; fewer than two such places: spots on the line itself
 function xyOf(v){if(Array.isArray(v))return {x:+v[0],y:+v[1]};var p=placeInfo(v);return p?{x:p.x,y:p.y}:null}
 function escortLine(){var o=(spec.objectives||[]).filter(function(x){return x.type==='escort'&&x.to!=null})[0];if(!o)return null;var S=xyOf(spec.player.start),E=xyOf(o.to);
  if(!S||!E)return null;var dx=E.x-S.x,dy=E.y-S.y,L=dx*dx+dy*dy;return L<1?null:{S:S,E:E,dx:dx,dy:dy,L:L,to:o.to}}
 function routeT(R,v){var q=xyOf(v);if(!q)return null;var t=((q.x-R.S.x)*R.dx+(q.y-R.S.y)*R.dy)/R.L,px=R.S.x+t*R.dx,py=R.S.y+t*R.dy;return {t:t,off:Math.sqrt(((q.x-px)*(q.x-px)+(q.y-py)*(q.y-py))/R.L)}}
 function onRoute(R,named){var st=String(spec.player.start).toLowerCase(),c=[];PL().forEach(function(p){if(p.dup||p.kind==='path'||p.name.toLowerCase()===st||p.name===R.to)return;var k=p.lab&&p.lab.k;if(k==='pbase'||k==='pstart'||k==='gz'||k==='drop')return;
   var r=routeT(R,p.name);if(r&&r.t>=0.2&&r.t<=1&&r.off<=0.5)c.push({n:p.name,t:r.t,off:r.off})});
  c.sort(function(a,b){return a.off-b.off});c=c.slice(0,4).sort(function(a,b){return a.t-b.t}).map(function(x){return x.n});
  if(!named)[0.45,0.8].forEach(function(t){if(c.length<2)c.push([Math.round(R.S.x+t*R.dx),Math.round(R.S.y+t*R.dy)])});return c}
 // force (the map was changed): every place is set again by these rules; else only a name this map lacks (and an enemy at your start)
 function fixPlaces(force){var P=PL();if(!P.length)return;var ok={},z=[],pts=[],n=0,M={},MF={};
  P.forEach(function(p){ok[p.name]=1;if(p.dup)return;if(p.kind==='zone')z.push(p.name);else if(p.kind==='point')pts.push(p.name)});
  var p=spec.player,e=spec.enemy,old=p.start;
  function bad(v){return Array.isArray(v)?!!force:typeof v==='string'&&(!!force||!ok[v])}
  function kk(v){return typeof v==='string'?v:JSON.stringify(v)}
  function set(o,k,v){if(JSON.stringify(o[k])!==JSON.stringify(v)){o[k]=v;n++}}
  if(bad(p.start)){var s=D.places.start||'';
   [/player|base|start/i,/^a0*1$/i].forEach(function(re){P.forEach(function(x){if(!s&&!x.dup&&x.kind!=='path'&&re.test(x.name)&&!/enemy|ai_?base/i.test(x.name))s=x.name})});
   set(p,'start',s||z[0]||pts[0]||P[0].name);M[kk(old)]=p.start}
  var st=String(p.start).toLowerCase(),R=placeRoles(),used={},gi=0,pi=0,wi=0,di=0;
  function isSt(v){return typeof v==='string'&&(v==='start'||v.toLowerCase()===st)}
  function nextGoal(){for(var j=0;j<R.goal.length;j++){var c=R.goal[(gi+j)%R.goal.length];if(!used[c]){gi+=j+1;used[c]=1;return c}}return R.goal.length?R.goal[(gi++)%R.goal.length]:p.start}
  // where an escort ends: the enemy base, else a start point of the other side, else the place farthest from your start
  function escGoal(){var S=xyOf(p.start),c=P.filter(function(x){return !x.dup&&x.kind!=='path'&&!isSt(x.name)&&!used[x.name]});function k(x){return x.lab&&x.lab.k||''}
   var a=c.filter(function(x){return k(x)==='ebase'});if(!a.length)a=c.filter(function(x){return R.opp.indexOf(x.name)>=0});
   if(!a.length)a=c.filter(function(x){return !/^(pbase|pstart|gz|drop|mpstart)$/.test(k(x))});if(!a.length||!S)return nextGoal();
   function d(x){return (x.x-S.x)*(x.x-S.x)+(x.y-S.y)*(x.y-S.y)}a.sort(function(x,y){return d(y)-d(x)});used[a[0].name]=1;return a[0].name}
  var goals=[];(spec.objectives||[]).forEach(function(o){['zone','to'].forEach(function(k){if(o[k]!=null)goals.push({o:o,k:k})})});
  goals.forEach(function(x){var v=x.o[x.k];if(!bad(v)&&typeof v==='string')used[v]=1});
  goals.sort(function(a,b){return (a.o.type==='escort'?0:1)-(b.o.type==='escort'?0:1)});
  goals.forEach(function(x){var v=x.o[x.k];if(!bad(v))return;var q=kk(v);if(M[q]==null){var E0=x.o.type==='escort'?null:escortLine(),c=E0?onRoute(E0,true).filter(function(n){return !used[n]})[0]:null;if(c){used[c]=1;M[q]=c}else M[q]=E0?E0.to:x.o.type==='escort'&&x.k==='to'?escGoal():nextGoal()}set(x.o,x.k,M[q])});
  var A=attackPlaces(),EL=escortLine(),RP=EL?onRoute(EL):null;
  function defNext(){return A.length?A[(di++)%A.length]:R.goal.length?R.goal[(di++)%R.goal.length]:p.start}
  (e.defenders||[]).forEach(function(g){var v=g.at;if(!bad(v)&&!isSt(v))return;var q=kk(v),m=M[q];if(m==null||isSt(m)||A.length&&A.indexOf(m)<0){m=defNext();if(M[q]==null)M[q]=m}set(g,'at',m)});
  (e.patrols||[]).forEach(function(g){(g.route||[]).forEach(function(v,j){if(!bad(v)&&!isSt(v))return;
    if(RP){var m0=RP[(pi++)%RP.length];if(j&&JSON.stringify(m0)===JSON.stringify(g.route[j-1]))m0=RP[(pi++)%RP.length];set(g.route,j,m0);return}
    var q='p:'+kk(v),m=MF[q];
    if(m==null||j&&m===g.route[j-1]){m=R.foe.length?R.foe[(pi++)%R.foe.length]:nextGoal();if(j&&m===g.route[j-1]&&R.foe.length>1)m=R.foe[(pi++)%R.foe.length];if(MF[q]==null)MF[q]=m}set(g.route,j,m)})});
  var src=R.opp.length?R.opp:R.foe;
  (e.waves||[]).forEach(function(g){var v=g.from;if(bad(v)||isSt(v)){var q='w:'+kk(v),m=MF[q];if(m==null){m=src.length?src[(wi++)%src.length]:nextGoal();MF[q]=m}set(g,'from',m)}
   var t=g.to;if(t==null||t==='start'||t==='auto'||!bad(t))return;var mt=M[kk(t)];set(g,'to',mt!=null?(isSt(mt)?'start':mt):A[0]||'start')});
  (p.units||[]).concat(spec.reinforcements||[]).forEach(function(g){var v=g.at;if(v==null||v==='start'||v==='auto'||!bad(v))return;var m=M[kk(v)];set(g,'at',m!=null&&!isSt(m)?m:'start')});
  mapNote=n?tx(force?'missions.sp.map.placed':'missions.sp.map.moved',{p:pl('place',n)}):''}
 // the enemy groups that stand, walk or arrive at your start (spmis SPMIS_START_ENEMY says the same on Preview)
 function startFoes(){var p=spec.player||{},e=spec.enemy||{},st=typeof p.start==='string'?p.start.toLowerCase():'',o=[];if(!st)return o;
  function at(r){return typeof r==='string'&&(r==='start'||r.toLowerCase()===st)}
  (e.defenders||[]).forEach(function(g){if(at(g.at))o.push(gName(g))});(e.patrols||[]).forEach(function(g){if((g.route||[]).some(at))o.push(gName(g))});(e.waves||[]).forEach(function(g){if(at(g.from))o.push(gName(g))});return o}
 function setMap(k){if(!k||k===spec.map)return;spec.map=k;PT=null;skAll=false;dropKept();loadPlaces(k,function(){fixPlaces(true);touch(true)});touch();draw()}
 // army changed: soldiers become the new army's soldier of the same file name; a vehicle or gun the new army's closest one: the same class
 // (the folder under entity/: tank_medium, armored_car, cannon ...) with a crew, else of that class, else of the same kind with a crew;
 // else its riflemen. One line per change, with its reason; the lines go once you leave the step
 function reArmy(side,army,auto){var s=side==='player'?spec.player:spec.enemy;if(s.army===army)return;s.army=army;
  loadUnits(army,function(){var U=D.units[army]||{soldiers:[],vehicles:[]},n=[],lists=side==='player'?[s.units||[],spec.reinforcements||[]]:[s.defenders||[],s.patrols||[],s.waves||[]];
   lists.forEach(function(l){l.forEach(function(g){var was=unitName(g.def),u=unitInfo(g.def),d=null,why='became';
    if(u&&u.kind){var cand=U.vehicles.filter(function(x){return x.kind===u.kind}),v=null;
     if(u.cls)v=cand.filter(function(x){return x.cls===u.cls&&x.crew})[0]||cand.filter(function(x){return x.cls===u.cls})[0];
     if(!v)v=cand.filter(function(x){return x.crew})[0];if(v)d=v.def}
    else{var leaf=String(g.def||'').split('/').pop(),m=U.soldiers.filter(function(x){return x.def.split('/').pop()===leaf})[0];if(m)d=m.def}
    if(!d){var r=U.soldiers.filter(function(x){return /\/rifle$/.test(x.def)})[0]||U.soldiers[0];if(r){d=r.def;why=u&&u.kind?'novehicle':'nosame'}}
    if(d&&d!==g.def){setDef(g,d);var now=unitName(d);if(now===was)return;var t=tx(key('arm',why),{a:was,b:now});if(n.indexOf(t)<0)n.push(t)}})});
   notes=n;touch(auto);draw()})}
 // auto: a change the card made itself (places set after a read, units of a kept army), not the user
 function touch(auto){if(!auto)dirty=true;fill();bad=null;mmUpd();drawSum();if(prev&&prev.j&&prev.sig!==curSig()){prev.stale=true;drawCheck()}}
 function curSig(){return JSON.stringify([mod(),spec,lastGid])}

 // ---------- the card ----------
 var stepBar=row('sp.steps',[],tx('missions.sp.b.steps')),body=box('sp.form',[],tx('missions.sp.b.form'));
 var sumL=el('div'),sum=h('div',{blk:'sp.sum',class:'wzstat','data-blkname':tx('missions.sp.b.sum')},[el('b',{text:tx('missions.sp.sum.h')}),sumL]);
 var navBack=btn(tx('missions.sp.back'),function(){go(step-1)}),navNext=btn(tx('missions.sp.next'),function(){go(step+1)},{cls:'primary'});
 var nav=row('sp.nav',[navBack,navNext],tx('missions.sp.b.nav'));
 var msg=el('div');var msgB=h('div',{blk:'sp.msg','data-blkname':tx('missions.sp.b.msg')},[msg]);
 var editT=el('div',{class:'wzstat'}),editB=h('div',{blk:'sp.editing','data-blkname':tx('missions.sp.b.editing'),hidden:true},[editT]);
 var naB=h('div',{blk:'sp.na',class:'wzstat',hidden:true},[]);
 var introT=hint(tx('missions.sp.intro')),as2T=hint(''),introB=blk('sp.intro',[introT,as2T]);
 var mineL=el('div'),mineS=el('summary',{text:tx('missions.sp.mine.h')});
 var mineB=h('details',{blk:'sp.mine',box:'col','data-blkname':tx('missions.sp.mine.h')},[mineS,blk('sp.mine.list',[mineL],{name:tx('missions.sp.mine.h')})]);
 var cols=h('div',{blk:'sp.body',box:'cols','data-blkname':tx('missions.sp.b.body')},[h('div',{blk:'sp.left',box:'col'},[stepBar,editB,body,nav,msgB]),h('div',{blk:'sp.right',box:'col'},[sum])]);
 var cardEl=card('sp',[blk('sp.title',[el('h3',{text:tx('missions.sp.h')})]),introB,naB,mineB,cols],{name:tx('missions.sp.h')});
 function say(t,cls){clear(msg);if(t)msg.appendChild(el('div',{class:cls||'err',text:t}))}
 function go(i){if(i<0||i>=STEPS.length||!spec)return;if(i!==step)notes=[];step=i;kindAsk=null;say('');if(STEPS[i]==='map')loadMaps();if(STEPS[i]==='check')loadMods();draw()}

 // ---------- step 1: kind ----------
 function drawKind(){var a=[],ask=null;(D.start&&D.start.templates||[]).forEach(function(t){var on=t.name===(spec.card&&spec.card.kind),kt=key('kt',t.name);if(kindAsk===t.name)ask=t;
  a.push(blk('sp.kind.'+t.name.replace(/[^a-z0-9-]/g,'-'),[el('button',{type:'button',class:on?'primary':null,'aria-pressed':on?'true':'false',onclick:function(){pickKind(t)}},
   [el('b',{text:known(kt)?tx(kt):t.title}),el('div',{class:'hint',text:known(key('k',t.name))?tx(key('k',t.name)):''})])]))});
  var q=ask?blk('sp.kind.ask',[el('div',{class:'wzstat','data-kindask':ask.name},[el('div',{text:tx('missions.sp.kind.ask',{k:known(key('kt',ask.name))?tx(key('kt',ask.name)):ask.title})}),
   el('div',{class:'row'},[btn(tx('missions.sp.kind.change'),function(){var old=spec;useKind(ask,old);draw()},{cls:'primary'}),btn(tx('missions.sp.kind.keep'),function(){kindAsk=null;draw()})])])]):null;
  return [blk('sp.kind.intro',[hint(tx('missions.sp.kind.intro'))]),q].concat(a)}

 // ---------- step 2: map ----------
 var MI=null;
 function mapItems(){if(MI)return MI;var a=[];(D.maps||[]).forEach(function(m){a.push({group:tx(m.mine?'missions.sp.mg.mine':m.kind==='single'?'missions.sp.mg.single':'missions.sp.mg.multi'),label:m.name,value:m.key,hint:m.folder,lo:(m.name+' '+m.folder+' '+m.key).toLowerCase()})});MI=a;return a}
 function mapName(k){var r=null;(D.maps||[]).forEach(function(m){if(m.key===k)r=m});return r?r.name:gameState()==='no'?tx('missions.sp.noread'):(!D.maps||D.mapsBusy)&&!D.mapsErr?tx('missions.sp.wait.mapname'):String(k||'').split('/').pop()}
 // the maps a typed text means: the one whose name, folder or key is exactly the text (one such map), else every hit of the search
 function mapTyped(q,noteEl){var lo=String(q||'').trim().toLowerCase(),out=[];find(mapItems(),q,function(o){out=o},noteEl,'map');
  var ex=mapItems().filter(function(it){return String(it.label).toLowerCase()===lo||String(it.hint).toLowerCase()===lo||String(it.value).toLowerCase()===lo});
  return ex.length===1?ex:out}
 // the Map Viewer on this map: its deep link page:mapviz/<target>~<map key without map/>~<mode> (mode empty: its first)
 function viewMap(){S.mapKey=spec.map;var mk=String(spec.map||'').replace(/^resource\//,'').replace(/^map\//,'');
  if(typeof show==='function')show('mapviz','page:mapviz/'+K.game().id+'~'+mk+'~');else K.go('mapviz')}
 function mapOfPath(p){p=String(p||'').split(String.fromCharCode(92)).join('/').replace(/^resource\//i,'').replace(/\/+$/,'');var lp=p.toLowerCase(),best='';
  (D.maps||[]).forEach(function(m){var k=m.key.toLowerCase();if((lp===k||lp.indexOf(k+'/')===0)&&k.length>best.length)best=m.key});return best}
 // the map box (input, its searchKit and the note beside it) is made new on every draw the user causes; a draw that only shows a read
 // that landed (rdraw) keeps the box that is on the screen, so the text being typed, its list and its note are not thrown away
 function drawMap(){var keep=MBKEEP&&MBX?MBX:null,inp=keep?keep.inp:el('input',{type:'text',autocomplete:'off','aria-label':tx('missions.sp.map.find'),placeholder:tx('missions.sp.map.find')}),nh=keep?keep.nh:el('span',{class:'hint'});
  var kit=keep?keep.kit:searchKit(inp,{key:'missions.sp.map',index:function(q,done){find(mapItems(),q,done,nh,'map')},browse:{mode:'dir',view:'data',start:'map/single',toValue:mapOfPath},
   onPick:function(v,it){var k=it&&it.value||mapOfPath(v)||v;inp.value='';if((D.maps||[]).some(function(m){return m.key===k}))setMap(k);else say(tx('missions.sp.map.notmap'))}});
  // a typed name with Enter, or on leaving the box: an exact name (map name, folder or key) or the only hit is taken; several hits
  // open the list (Enter) and say so; none: the no-hit line (find writes it)
  function typed(enter){var q=String(inp.value||'').trim();if(!q)return;var hits=mapTyped(q,nh);
   if(hits.length===1){inp.value='';nh.textContent='';if(kit.close)kit.close();if(hits[0].value===spec.map)draw();else setMap(hits[0].value);return}
   if(hits.length>1){if(enter){if(inp.fire)inp.fire('input');else inp.dispatchEvent(new Event('input',{bubbles:true}))}nh.textContent=tx('missions.sp.map.several',{q:q})}}
  if(!keep){inp.addEventListener('keydown',function(e){if(e._sk||e.isComposing||e.keyCode===229)return;if(e.key==='Enter'){if(e.preventDefault)e.preventDefault();typed(true)}});
   inp.addEventListener('blur',function(){typed(false)})}
  MBX={inp:inp,nh:nh,kit:kit};
  var P=PL(),cnt={zone:0,point:0,path:0};P.forEach(function(p){if(!p.dup)cnt[p.kind]=(cnt[p.kind]||0)+1});
  var st=D.places&&D.places.key===spec.map?(D.places.err?null:hint(tx('missions.sp.map.places',{a:pl('area',cnt.zone),p:pl('point',cnt.point),w:pl('path',cnt.path)}))):hint(tx('missions.sp.wait.places'));
  return [blk('sp.map.intro',[hint(tx('missions.sp.map.intro'))]),
   blk('sp.map.cur',[el('b',{text:tx('missions.sp.map.cur')+' '}),el('span',{text:mapName(spec.map)})],{name:tx('missions.sp.map.cur')}),
   row('sp.map.find',[kit.el,nh,D.mapsBusy?el('span',{class:'hint',text:' '+tx('missions.sp.wait.maps')}):null],tx('missions.sp.map.find')),
   reg('map',blk('sp.map.state',[st,mapNote?el('div',{class:'wzstat',text:mapNote}):null])),MMON?null:sketch('sp.map.names',true),
   row('sp.map.view',[btn(tx('missions.sp.map.viewer'),function(){viewMap()}),el('span',{class:'hint',text:' '+tx('missions.sp.map.viewhint')})],tx('missions.sp.map.viewer'))].concat(K.isGoh()?gohLook():[])}
 // GoH only: the light set, the campaign music and the mission list banner, each a searchKit box (the sets and tunes of game + mod as
 // its index, Browse in the game data or on disk for a .png); empty = the default the server says in its notes (base map light, the
 // side's stock theme, a plain banner). Enter takes the typed text; the server refuses a name or file it can not use
 function gohLook(){function strip(p,dir,ext){return String(p||'').replace(/\\/g,'/').replace(/^resource\//i,'').replace(new RegExp('^'+dir+'/','i'),'').replace(ext,'')}
  function items(a){return (a||[]).map(function(x){return {label:x,value:x,lo:String(x).toLowerCase()}})}
  var LK={environment:['missions.sp.goh.environment','missions.sp.goh.environment.def'],music:['missions.sp.goh.music','missions.sp.goh.music.def'],banner:['missions.sp.goh.banner','missions.sp.goh.banner.def']};
  function box(f,list,browse){var lab=tx(LK[f][0]),inp=el('input',{type:'text',autocomplete:'off','aria-label':lab,placeholder:lab});
   function take(v){v=String(v||'').trim();if(!v)return;spec[f]=v;inp.value='';touch();draw()}
   var kit=searchKit(inp,{key:LK[f][0],index:function(q,done){if(!list)done([]);else K.hits(items(D[list]),q,done)},browse:browse,onPick:function(v,it){take(it&&it.value||v)}});
   inp.addEventListener('keydown',function(e){if(e._sk||e.isComposing||e.keyCode===229)return;if(e.key==='Enter'){if(e.preventDefault)e.preventDefault();take(inp.value)}});
   var cur=spec[f]?[el('span',{text:' '}),el('b',{'data-gohlook':f,text:spec[f]}),el('span',{text:' '}),btn(tx('missions.sp.goh.clear'),function(){delete spec[f];touch();draw()})]:[el('span',{class:'hint','data-gohlook':f,text:' '+tx(LK[f][1])})];
   return row('sp.goh.'+f,[kit.el].concat(cur),lab)}
  return [blk('sp.goh.look',[hint(tx('missions.sp.goh.look'))]),
   box('environment','envs',{mode:'file',view:'data',start:'set/environment',exts:['set'],toValue:function(p){return strip(p,'set/environment',/\.set$/i)}}),
   box('music','music',{mode:'file',view:'data',start:'music',exts:['wav','ogg','mp3'],toValue:function(p){return strip(p,'music',/\.(wav|ogg|mp3)$/i)}}),
   box('banner','',{mode:'file',view:'disk',exts:['png'],start:function(){return mod()||''}})]}

 // ---------- step 3: your side and the enemy (one group open at a time) ----------
 function reg(f,e){FE[f]=e;return e}
 // up front: unit, count and its place(s); the difficulty, Remove (and a patrol's stop buttons) under the row's own More options
 function countBox(g,label){var i=el('input',{type:'number',min:'1',max:'60',step:'1','aria-label':label+' ('+tx('missions.sp.count.r')+')',title:tx('missions.sp.count.t'),style:'width:56px'});i.value=String(g.count||1);
  function take(fin){var v=Math.round(+i.value);if(!(v>=1))v=fin?1:0;if(v>60)v=60;if(v&&v!==g.count){g.count=v;touch()}if(fin)i.value=String(g.count||1)}
  i.addEventListener('input',function(){take(false)});i.addEventListener('change',function(){take(true)});return i}
 // a unit row is one line (name, count, place) with Change and Remove; only the row in use (OU: one per group, the first at the start)
 // shows its controls, with Remove at its end, where a goal row has it. extra and moreKids are made only for the open row
 function unitRow(id,f,g,army,extra,list,i,moreKids){var grp=f.split('.')[0];
  function rmB(){return btn(tx('missions.sp.remove'),function(){list.splice(i,1);if((OU[grp]||0)>=list.length)OU[grp]=Math.max(0,list.length-1);touch();draw()})}
  if(!FULL&&(OU[grp]||0)!==i)return reg(f,row(id,[el('span',{'data-fold':'1',title:String(g.def||''),text:gNameD(g)+', '+gWhere(g)+' '}),btn(tx('missions.sp.rowopen'),function(){OU[grp]=i;draw()}),el('span',{text:' '}),rmB()]));
  var cn=countBox(g,tx('missions.sp.count')),u=unitBox(g,army,tx('missions.sp.unit'),function(){cn.value=String(g.count||1)});
  var lv=select(LV.map(function(l){return {v:l,l:l?tx(key('lv',l)):tx('missions.sp.lv.all')}}),g.difficulty||'',function(v){if(v)g.difficulty=v;else delete g.difficulty;touch();draw()},tx('missions.sp.lv'));
  var more=el('details',{open:g.difficulty?true:null,style:'display:inline-block;vertical-align:top'},[el('summary',{text:tx('missions.sp.more')}),sp(tx('missions.sp.lv')),lv].concat(moreKids?moreKids():[]));
  return reg(f,row(id,[el('span',{text:tx('missions.sp.unit')+' '})].concat(u,[sp(tx('missions.sp.count')),cn,el('span',{class:'hint','data-range':'1',text:' '+tx('missions.sp.count.r')+' '})],extra(),[more,el('span',{text:' '}),rmB()])))}
 function addBtn(id,t,f){return row(id,[btn(t,function(){f();touch();draw()})])}
 function gfold(id,label,kids){return reg(id,fold('sp.'+id,label,kids,openG===id,function(){if(this.open){openG=id;GROUPS.forEach(function(g){var f=FE[g];if(g!==id&&f&&f.open)f.open=false})}}))}
 function drawSides(){var p=spec.player,e=spec.enemy,a=[];p.units=p.units||[];e.defenders=e.defenders||[];e.patrols=e.patrols||[];e.waves=e.waves||[];
  a.push(blk('sp.you.h',[el('h4',{text:tx('missions.sp.you')}),hint(tx('missions.sp.sides.hint')),hint(tx('missions.sp.unit.en'))]));
  if(notes.length)a.push(blk('sp.armynote',[el('div',{class:'wzstat'},notes.map(function(n){return el('div',{text:n})}))]));
  a.push(reg('parmy',fld('sp.parmy',tx('missions.sp.army'),armySel(p.army,function(v){reArmy('player',v)},tx('missions.sp.army')))));
  a.push(reg('start',fld('sp.start',tx('missions.sp.start'),placeSel(p,'start',false,tx('missions.sp.start')))));
  // the start choices a beginner cannot know (play area, path point), in plain words, when the list holds one
  if(PL().some(function(x){return !x.dup&&(x.lab&&x.lab.k==='gz'||x.kind==='path'&&paths)}))a.push(blk('sp.start.ex',[hint(tx('missions.sp.start.ex'))]));
  if(sameArmy())a.push(blk('sp.samearmy',[el('div',{class:'wzstat',text:tx('missions.sp.samearmy',{army:armyT(p.army)})})]));
  var foes=startFoes();if(foes.length)a.push(blk('sp.start.clash',[el('div',{class:'err',text:tx('missions.sp.start.clash',{g:foes.join(', ')})})]));
  var pu=[];p.units.forEach(function(g,i){pu.push(unitRow('sp.pu.'+i,'pu.'+i,g,p.army,function(){return [sp(tx('missions.sp.at')),placeSel(g,'at',true,tx('missions.sp.unitn',{n:i+1}),'pu',true)]},p.units,i))});
  pu.push(addBtn('sp.pu.add',tx('missions.sp.add.unit'),function(){var d='mp/'+p.army+'/rifle';p.units.push({name:newName(d),def:d,count:4,at:'start'});OU.pu=p.units.length-1}));
  if(!p.units.length)a.push(blk('sp.pu.none',[el('div',{class:'err',text:tx('missions.sp.pu.none')})]));
  a.push(gfold('pu',tx('missions.sp.b.pu')+' ('+p.units.length+')',pu));
  a.push(blk('sp.enemy.h',[el('h4',{text:tx('missions.sp.enemy')})]));
  a.push(reg('earmy',fld('sp.earmy',tx('missions.sp.army'),armySel(e.army,function(v){reArmy('enemy',v)},tx('missions.sp.army')))));
  var P=plain(),ed=[blk('sp.ed.h',[hint(tx('missions.sp.def.hint'))])];
  e.defenders.forEach(function(g,i){ed.push(unitRow('sp.ed.'+i,'ed.'+i,g,e.army,function(){return [sp(tx('missions.sp.at')),placeSel(g,'at',false,tx('missions.sp.def.n',{n:i+1}),'ed',true)]},e.defenders,i))});
  ed.push(addBtn('sp.ed.add',tx('missions.sp.add.def'),function(){var d='mp/'+e.army+'/rifle';e.defenders.push({name:newName(d),def:d,count:4,at:defPlace()});OU.ed=e.defenders.length-1}));
  a.push(gfold('ed',tx('missions.sp.def.h')+' ('+e.defenders.length+')',ed));
  var ep=[blk('sp.ep.h',[hint(tx('missions.sp.pat.hint'))])];
  e.patrols.forEach(function(g,i){g.route=g.route||[];function stops(){var s=[];g.route.forEach(function(r,j){s.push(placeSel(g.route,j,false,tx('missions.sp.pat.n',{n:i+1})+', '+tx('missions.sp.stop',{n:j+1}),'ep',j===0))});return [sp(tx('missions.sp.route'))].concat(s)}
   ep.push(unitRow('sp.ep.'+i,'ep.'+i,g,e.army,stops,e.patrols,i,function(){return [el('span',{text:' '}),btn(tx('missions.sp.stop.add'),function(){var u={},R=placeRoles(),E1=escortLine(),c=E1?onRoute(E1):R.foe.concat(R.goal,P);g.route.forEach(function(r){u[JSON.stringify(r)]=1});g.route.push(c.filter(function(x){return !u[JSON.stringify(x)]})[0]||c[0]||P[0]||'');touch();draw()}),
    g.route.length>2?btn(tx('missions.sp.stop.rm'),function(){g.route.pop();touch();draw()}):null]}))});
  ep.push(addBtn('sp.ep.add',tx('missions.sp.add.pat'),function(){var d='mp/'+e.army+'/smg';var E1=escortLine(),c=E1?onRoute(E1):null,r0=c?c[0]:foePlace(0);e.patrols.push({name:newName(d),def:d,count:3,route:[r0,c?c[1]:foePlace(0,[r0])||defPlace()]});OU.ep=e.patrols.length-1}));
  a.push(gfold('ep',tx('missions.sp.pat.h')+' ('+e.patrols.length+')',ep));
  var ew=[blk('sp.ew.h',[el('span',{class:'hint',title:tx('missions.sp.gl.wave'),text:tx('missions.sp.wave.hint')})])];
  e.waves.forEach(function(g,i){var lb=tx('missions.sp.wave.n',{n:i+1});
   ew.push(unitRow('sp.ew.'+i,'ew.'+i,g,e.army,function(){return [sp(tx('missions.sp.from')),placeSel(g,'from',false,lb+', '+tx('missions.sp.from'),'ew',true),sp(tx('missions.sp.to')),placeSel(g,'to',true,lb+', '+tx('missions.sp.to'),'ew',false),
    sp(tx('missions.sp.wave.time')),timeSel(g.time,function(v){g.time=v;touch()},tx('missions.sp.wave.time'),0,2400)]},e.waves,i))});
  ew.push(addBtn('sp.ew.add',tx('missions.sp.add.wave'),function(){var d='mp/'+e.army+'/rifle';e.waves.push({name:newName(d),def:d,count:4,from:foePlace(e.waves.length),to:'start',time:300});OU.ew=e.waves.length-1}));
  a.push(gfold('ew',tx('missions.sp.wave.h')+' ('+e.waves.length+')',ew));
  a.push(moreFold('sp.more3'));
  if(!MMON)a.push(fold('sp.sk3',tx('missions.sp.sk.h'),[sketch('sp.sk3.map')],false));
  return a}
 function moreFold(id){var pc=el('input',{type:'checkbox','aria-label':tx('missions.sp.paths')});pc.checked=paths;pc.addEventListener('change',function(){paths=!!pc.checked;draw()});
  return fold(id,tx('missions.sp.more'),[fld(id+'.paths',tx('missions.sp.paths'),pc,{chk:true,title:tx('missions.sp.gl.path')}),blk(id+'.gl',[hint(tx('missions.sp.gl.line'))])],paths)}

 // ---------- step 4: goals (in order), losing, help that arrives later ----------
 function newId(){var n=1,ids={};(spec.objectives||[]).forEach(function(o){ids[o.id]=1});while(ids['goal_'+n])n++;return 'goal_'+n}
 function firstZone(){return goalPlace()}
 function retype(o,t){var pl0=o.zone||o.at||o.to||firstZone();o.type=t;delete o.zone;delete o.at;delete o.to;
  if(t==='capture'||t==='hold'||t==='reach')o.zone=pl0;if(t==='escort'){o.to=pl0;if(!o.unit){var g=gopts('player',true)[0];o.unit=g?g.v:''}}else delete o.unit;
  if(t==='hold'||t==='survive'){if(!(o.minutes>0))o.minutes=5}else delete o.minutes;
  if(t==='destroy'){if(!o.target){var x=gopts('enemy')[0];if(x)o.target=[x.v]}}else delete o.target;
  delete spec.card.own['goal:'+o.id];delete spec.card.base['goal:'+o.id]}
 function rmGoal(i){var o=spec.objectives[i],id=o.id;spec.objectives.splice(i,1);delete spec.card.own['goal:'+id];
  spec.objectives.forEach(function(x){if(x.after===id){if(o.after)x.after=o.after;else delete x.after}});
  (spec.reinforcements||[]).forEach(function(g){if(g.after===id){delete g.after;g.time=300}});touch();draw()}
 function goalRows(o,i){var lb=tx('missions.sp.goal.n',{n:i+1}),c=[el('b',{text:(i+1)+'.'}),select(TYPES.map(function(t){return {v:t,l:tx(key('t',t))}}),o.type,function(v){retype(o,v);touch();draw()},lb+': '+tx('missions.sp.goal.type'))];
  function lab(k,t){c.push(el('span',{text:' '+tx(k)+' ',title:t||null}))}
  if(o.type==='capture'||o.type==='hold'||o.type==='reach'){lab('missions.sp.goal.place',tx('missions.sp.gl.zone'));c.push(placeSel(o,'zone',false,lb+': '+tx('missions.sp.goal.place')))}
  if(o.type==='escort'){lab('missions.sp.goal.who');c.push(select(gopts('player',true),o.unit,function(v){o.unit=v;touch();draw()},lb+': '+tx('missions.sp.goal.who')));lab('missions.sp.goal.to');c.push(placeSel(o,'to',false,lb+': '+tx('missions.sp.goal.to')))}
  if(o.type==='destroy'){var en=gopts('enemy');
   if(!en.length)c.push(el('span',{class:'err',text:' '+tx('missions.sp.goal.noenemy')+' '}),btn(tx('missions.sp.goal.toenemy'),function(){openG='ed';go(2)}));
   else{var tg=[].concat(o.target||[]);if(!tg.length){tg=[en[0].v];o.target=tg}lab('missions.sp.goal.target');
    tg.forEach(function(n,j){c.push(select(en,n,function(v){var a=[].concat(o.target);a[j]=v;o.target=a;touch();draw()},lb+': '+tx('missions.sp.goal.target')+' '+(j+1)));
     if(tg.length>1)c.push(btn(tx('missions.sp.goal.rmtarget'),function(){var a=[].concat(o.target);a.splice(j,1);o.target=a;touch();draw()}))});
    if(tg.length<en.length)c.push(btn(tx('missions.sp.goal.addtarget'),function(){var a=[].concat(o.target),f=en.filter(function(x){return a.indexOf(x.v)<0})[0];if(f)a.push(f.v);o.target=a;touch();draw()}))}}
  if(o.type==='hold'||o.type==='survive'){lab('missions.sp.goal.minutes');c.push(select(minOpts(o.minutes||5),o.minutes||5,function(v){o.minutes=+v;touch();draw()},lb+': '+tx('missions.sp.goal.minutes')))}
  var st=[{v:'',l:tx('missions.sp.goal.atonce')}];spec.objectives.slice(0,i).forEach(function(x,j){st.push({v:x.id,l:tx('missions.sp.goal.afterN',{n:j+1})})});
  lab('missions.sp.goal.starts');c.push(select(st,o.after||'',function(v){if(v)o.after=v;else delete o.after;touch();draw()},lb+': '+tx('missions.sp.goal.starts')));
  c.push(select([{v:'1',l:tx('missions.sp.goal.primary')},{v:'0',l:tx('missions.sp.goal.bonus')}],o.primary===false?'0':'1',function(v){o.primary=v==='1';touch();draw()},lb+': '+tx('missions.sp.goal.kind')));
  c.push(btn(tx('missions.sp.remove'),function(){rmGoal(i)}));
  var ti=el('input',{type:'text','aria-label':lb+': '+tx('missions.sp.goal.text'),maxlength:'200',style:'width:100%'});ti.value=o.text||'';
  ti.addEventListener('input',function(){setOwn('goal:'+o.id,ti.value,function(v){o.text=v});touch()});
  var timer=(o.type==='hold'||o.type==='survive')&&o.after?hint(tx('missions.sp.goal.timer',{n:spec.objectives.map(function(x){return x.id}).indexOf(o.after)+1})):null;
  return [reg('ob.'+i,row('sp.ob.'+i,c,lb)),blk('sp.ob.'+i+'.t',[el('span',{text:tx('missions.sp.goal.text')+' '}),ti,timer,ownWarn('goal:'+o.id)],{name:lb})]}
 function drawGoals(){var a=[],L=spec.lose=spec.lose||{};spec.objectives=spec.objectives||[];
  var ob=[blk('sp.ob.h',[el('h4',{text:tx('missions.sp.goals.h')}),hint(tx('missions.sp.goals.hint'))])];
  if(!spec.objectives.length)ob.push(blk('sp.ob.none',[el('div',{class:'err',text:tx('missions.sp.goals.none')})]));
  spec.objectives.forEach(function(o,i){ob=ob.concat(goalRows(o,i))});
  ob.push(addBtn('sp.ob.add',tx('missions.sp.add.goal'),function(){var li=-1,o={id:newId()};spec.objectives.forEach(function(x,j){if(x.primary!==false)li=j});
   // a new goal comes after the last must-win goal (and starts after it), before the bonus goals
   if(li>=0)o.after=spec.objectives[li].id;spec.objectives.splice(li+1,0,o);retype(o,'capture')}));
  a.push(reg('ob',box('sp.ob',ob,tx('missions.sp.goals.h'))));
  spec.reinforcements=spec.reinforcements||[];
  var rf=[blk('sp.rf.h',[hint(tx('missions.sp.rf.hint'))])];
  spec.reinforcements.forEach(function(g,i){var lb=tx('missions.sp.rf.n',{n:i+1}),opts=[{v:'time',l:tx('missions.sp.rf.attime')}].concat(spec.objectives.map(function(o,j){return {v:'after:'+o.id,l:tx('missions.sp.rf.after',{n:j+1,goal:o.text})}}));
   var ws=select(opts,g.after?'after:'+g.after:'time',function(v){if(v==='time'){delete g.after;g.time=300}else{g.after=v.slice(6);g.time=5}touch();draw()},lb+': '+tx('missions.sp.rf.when'));
   var ts=g.after?delaySel(g.time||5,function(x){g.time=x;touch()},lb+': '+tx('missions.sp.rf.delay')):timeSel(g.time,function(x){g.time=x;touch()},lb+': '+tx('missions.sp.rf.time'),0,2400);
   rf.push(unitRow('sp.rf.'+i,'rf.'+i,g,spec.player.army,function(){return [sp(tx('missions.sp.at')),placeSel(g,'at',true,lb,'rf',true),sp(tx('missions.sp.rf.when')),ws,sp(g.after?tx('missions.sp.rf.delay'):tx('missions.sp.rf.time')),ts]},spec.reinforcements,i))});
  rf.push(addBtn('sp.rf.add',tx('missions.sp.add.rf'),function(){var d='mp/'+spec.player.army+'/rifle';spec.reinforcements.push({name:newName(d),def:d,count:4,at:'start',time:300});OU.rf=spec.reinforcements.length-1}));
  a.push(reg('rf',fold('sp.rf',tx('missions.sp.rf.h')+': '+(spec.reinforcements.length?spec.reinforcements.map(gNameD).join(', '):tx('missions.sp.rf.none')),rf,openRf,function(){openRf=this.open})));
  var ad=el('input',{type:'checkbox','aria-label':tx('missions.sp.lose.all')});ad.checked=L.allDead!==false;ad.addEventListener('change',function(){L.allDead=!!ad.checked;touch()});
  var lu=select([{v:'',l:tx('missions.sp.lose.nounit')}].concat(gopts('player',true)),L.unit||'',function(v){if(v)L.unit=v;else delete L.unit;touch()},tx('missions.sp.lose.unit'));
  var lm=select([{v:'',l:tx('missions.sp.lose.notime')}].concat(minOpts(L.minutes)),L.minutes||'',function(v){if(v)L.minutes=+v;else delete L.minutes;touch();draw()},tx('missions.sp.lose.time'));
  // "all soldiers dead" with no soldier among the units you start with (vehicles and guns only): spmis refuses it, said here at once
  var noHum=L.allDead!==false&&!(spec.player.units||[]).some(function(g){var u=unitInfo(g.def);if(g.crew&&g.crew.count>0)return true;return u?!u.kind:!/^[^\/]+$/.test(String(g.def||''))});
  if(noHum)a.push(blk('sp.lose.nohuman',[el('div',{class:'err',text:tx('missions.sp.lose.nohuman')})]));
  a.push(reg('lose',fold('sp.lose',tx('missions.sp.lose.h')+': '+loseT(),[blk('sp.lose.h',[hint(tx('missions.sp.lose.hint'))]),fld('sp.lose.all',tx('missions.sp.lose.all'),ad,{chk:true}),
   fold('sp.lose.more',tx('missions.sp.more'),[fld('sp.lose.unit',tx('missions.sp.lose.unit'),lu),fld('sp.lose.time',tx('missions.sp.lose.time'),lm)],moreLose||!!(L.unit||L.minutes),function(){moreLose=this.open})],openLose||noHum,function(){openLose=this.open})));
  if(!MMON)a.push(fold('sp.sk4',tx('missions.sp.sk.h'),[sketch('sp.sk4.map')],false));
  return a}

 // ---------- step 5: name and story (texts in the window's language; typed ones are kept) ----------
 function txt(id,f,label,o){o=o||{};var i=el(o.area?'textarea':'input',{type:o.area?null:'text','aria-label':label,maxlength:o.max||'120',rows:o.area?'4':null,style:'width:100%'});i.value=o.val!=null?o.val:spec[f]||'';
  i.addEventListener('input',function(){if(o.raw)o.raw(i.value);else setOwn(f,i.value,function(v){spec[f]=v});touch()});
  var w=o.raw?null:ownWarn(f),r=reg(o.reg||f,fld(id,label,i,{after:o.hint?el('span',{class:'hint',text:' '+o.hint}):null}));return w?[r,blk(id+'.own',[w])]:[r]}
 function drawStory(){var zh=WL()==='zh',a=[blk('sp.story.intro',[hint(tx('missions.sp.story.intro')),zh?null:hint(tx('missions.sp.story.lang',{lang:tx('missions.sp.langname')})),
   zh?el('div',{class:'wzstat','data-zhwarn':'1',text:tx('missions.sp.story.zh')}):null,
   el('details',{},[el('summary',{text:tx('missions.details')}),hint(tx('missions.sp.story.langwhy')),zh?hint(tx('missions.sp.story.zhwhy')):null])])];
  a=a.concat(txt('sp.st.title','title',tx('missions.sp.title')),txt('sp.st.brief','briefing',tx('missions.sp.brief'),{area:true,max:'2000',reg:'brief'}));
  var more=[].concat(txt('sp.st.camp','campaignTitle',tx('missions.sp.camp'),{hint:tx('missions.sp.camp.hint'),reg:'campaign'}),
   txt('sp.st.date','date',tx('missions.sp.date')),txt('sp.st.place','place',tx('missions.sp.place')),
   txt('sp.st.start','start',tx('missions.sp.txt.start.l'),{max:'300'}),txt('sp.st.won','won',tx('missions.sp.txt.won.l'),{max:'300'}),txt('sp.st.lost','lost',tx('missions.sp.txt.lost.l'),{max:'300'}),
   spec.lose&&spec.lose.minutes?txt('sp.st.timer','timerText',tx('missions.sp.txt.timer.l')):[],
   txt('sp.st.name','name',tx('missions.sp.name'),{hint:tx(lock?'missions.sp.name.locked':'missions.sp.name.hint'),max:'60',raw:function(v){spec.name=v.trim();nameAuto=false}}));
  a.push(fold('sp.st.more',tx('missions.sp.more'),more,moreStory,function(){moreStory=this.open}));
  return a}

 // ---------- step 6: check, write, play ----------
 var outC=el('div'),wrBtn=null,pvBtn=null,udBtn=null;
 function menuTried(){return !!(D.start&&D.start.proven&&D.start.proven.menuTried)}
 function lineList(ls){var u=K.list();(ls||[]).forEach(function(x){u.appendChild(el('li',{text:x.t,style:x.sub?'margin-left:16px;list-style:circle':null}))});return u}
 function fileFold(files){var u=K.list(),n=0,vo=0,cp={},rec=null;(files||[]).forEach(function(f){if(f.state==='new'||f.state==='replace')n++;if(f.record){rec=f;return}if(f.voice){vo++;return}if(f.copied){cp[f.state]=(cp[f.state]||0)+1;return}
   u.appendChild(el('li',{text:f.rel+' : '+tx(key('fs',f.state))}))});
  Object.keys(cp).forEach(function(s){u.appendChild(el('li',{class:'hint',text:tx('missions.sp.copied',{f:pl('file',cp[s]),s:tx(key('fs',s))})}))});
  if(vo)u.appendChild(el('li',{class:'hint',text:tx('missions.sp.voices',{f:pl('file',vo)})}));
  if(rec)u.appendChild(el('li',{class:'hint',text:rec.rel+' : '+tx('missions.sp.fs.record')}));
  return el('details',{},[el('summary',{text:tx('missions.sp.files',{f:pl('file',n)})}),u])}
 function markBad(){Object.keys(FE).forEach(function(k){var e=FE[k];if(e&&e.classList){e.classList.remove('bad');(e.querySelectorAll?e.querySelectorAll('select'):[]).forEach(function(c){c.classList.remove('bad')})}});
  if(!bad||!bad.f)return;var e=FE[bad.f]||FE[bad.f.split('.')[0]];if(!e||!e.classList)return;e.classList.add('bad');
  var c=e.querySelector?e.querySelector('select')||e.querySelector('input'):null;if(c&&c.classList)c.classList.add('bad');
  for(var n=e;n;n=n.parentNode)if(n.tagName==='DETAILS')n.open=true;if(e.scrollIntoView)try{e.scrollIntoView({block:'center'})}catch(x){}}
 function stepOf(f){var k=String(f||'').split('.')[0];return k==='map'?1:/^(start|parmy|earmy|pu|ed|ep|ew)$/.test(k)?2:/^(ob|lose|rf)$/.test(k)?3:/^(name|campaign|title|brief)$/.test(k)?4:5}
 function fixAt(r){bad={f:r.field,code:r.code};var g=String(r.field).split('.')[0],ix=+String(r.field).split('.')[1];if(GROUPS.indexOf(g)>=0)openG=g;if(ix>=0)OU[g]=ix;if(g==='lose'){moreLose=true;openLose=true}if(g==='rf')openRf=true;if(g==='name'||g==='campaign')moreStory=true;step=stepOf(r.field);draw()}
 function refusalView(r){var s=stepOf(r.field),d=el('div',{class:'err','data-why':r.why||null},[el('div',{text:refSent(r)})]);
  if(r.field&&s<5)d.appendChild(el('div',{},[btn(tx('missions.sp.fix',{n:s+1,step:tx(key('s',STEPS[s]))}),function(){fixAt(r)})]));
  else if(r.field)d.appendChild(el('div',{text:tx('missions.sp.fixhere')}));else d.appendChild(el('div',{text:tx('missions.sp.nofield')}));
  d.appendChild(el('details',{},[el('summary',{text:tx('missions.details')}),el('pre',{style:'white-space:pre-wrap',text:r.code+': '+r.msg})]));return d}
 // a sentence with the word AS64 in it: the word carries its hover text (what AS64 is)
 function glossed(t){var a=String(t).split('AS64'),o=[];a.forEach(function(s,i){if(i)o.push(el('abbr',{title:tx('missions.sp.gl.as64'),text:'AS64'}));if(s)o.push(el('span',{text:s}))});return o}
 function noModView(){return el('div',{class:'wzstat','data-nomodinfo':'1'},[el('div',{text:tx('missions.sp.nomodinfo')}),el('div',{text:tx('missions.sp.nomodinfo.do',{b:tx('missions.sp.newmod'),page:tx('nav.make')})}),btn(tx('missions.sp.newmod'),function(){if(typeof newModAt==='function')newModAt('');else K.go('make')})])}
 // what the game has shown of this mission (tools/spmis/proven.json): its kind played to both ends, and the parts no run showed yet
 // tries name the game build each run used (as64 | mowas2): under MoW:AS2 a kind tried only on AS64 is said as not yet tried there
 function notTried(){var p=D.start&&D.start.proven||{},k=spec&&spec.card&&spec.card.kind,tried=!!(p.inGame&&k&&p.kinds&&p.kinds[k]===true),u=K.list(),n=0;
  var on=tried?(p.kindsOn&&p.kindsOn[k]||['as64']):[],gid=K.game().id,here=on.indexOf(gid)>=0||gid!=='mowas2',d=el('div',{'data-proof':tried?(here?'kind':'other'):'none'});
  function li(t){u.appendChild(el('li',{text:t}));n++}
  if(tried&&here)d.appendChild(el('div',{class:'ok'},glossed(tx('missions.sp.tried',{date:p.date||'-',exe:on.map(exeT).join(', ')}))));
  else if(tried)d.appendChild(el('div',{class:'wzstat'},glossed(tx('missions.sp.nt.as2',{date:p.date||'-',exe:on.map(exeT).join(', ')}))));
  else li(k&&known(key('kt',k))?tx('missions.sp.nt.kind',{k:tx(key('kt',k))}):tx('missions.sp.nt.custom'));
  var hasPat=!!(spec&&spec.enemy&&(spec.enemy.patrols||[]).length),hasHold=!!(spec&&(spec.objectives||[]).some(function(o){return o.type==='hold'}));
  var ut=(p.untried||[]).slice();if(!p.menuTried&&ut.indexOf('menu')<0)ut.push('menu');
  ut.forEach(function(x){if(x==='patrol'&&!hasPat||x==='holdfail'&&!hasHold||x==='menu'&&p.menuTried)return;if(known(key('nt',x)))li(tx(key('nt',x)))});
  if(n)d.appendChild(el('div',{class:'wzstat'},[el('b',{text:tx('missions.sp.nottried')}),u]));
  return d}
 function useMod(p){if(typeof setMod==='function')setMod(p);else S.mod=p;modSync();draw()}
 function modView(){var m=mod(),a=[];
  if(m&&modGone())return reg('mod',blk('sp.chk.mod',goneKids(),{name:tx('missions.sp.mod.h')}));
  if(m){var cur=D.mods&&D.mods.cur;a.push(el('div',{},[el('b',{text:tx('missions.sp.mod.cur')+' '}),el('span',{text:String(m).split(/[\\\/]/).pop()}),el('span',{class:'hint',text:' '+m})]));
   a.push(hint(tx('missions.sp.where')));
   if(cur&&cur.ok&&!cur.inMods)a.push(el('div',{class:'wzstat'},[el('div',{text:tx('missions.sp.mod.out')}),btn(tx('missions.sp.play.go'),function(){K.go('play')})]));
   return reg('mod',blk('sp.chk.mod',a,{name:tx('missions.sp.mod.h')}))}
  var L=D.mods&&D.mods.mods||[],s=el('select',{'aria-label':tx('missions.sp.mod.pick')});
  s.appendChild(el('option',{value:'',text:D.mods?(L.length?tx('missions.sp.mod.choose'):tx('missions.sp.mod.none')):tx('missions.sp.wait.mods')}));
  L.forEach(function(x){s.appendChild(el('option',{value:x.path,text:x.name+(x.modInfo?'':' '+tx('missions.sp.mod.noinfo'))}))});
  a.push(el('div',{class:'err',text:tx('missions.sp.nomod')}));
  a.push(el('div',{},[s,btn(tx('missions.sp.mod.use'),function(){if(s.value)useMod(s.value)}),btn(tx('missions.sp.newmod'),function(){if(typeof newModAt==='function')newModAt('');else K.go('make')}),
   btn(tx('missions.sp.mod.other'),function(){if(typeof pick==='function')pick('dir','',function(p){if(p)useMod(p)})})]));
  return reg('mod',blk('sp.chk.mod',a,{name:tx('missions.sp.mod.h')}))}
 // the shown lines are built again when the answer comes (spec unchanged): taken at the click they could still hold the wait text of a
 // map or place name not read yet (one reader thread: the Preview queues behind those reads) and the Preview kept that text for good
 function preview(){var m=mod();if(!m){drawCheck();return}fill();var my=++seq,s=curSig(),ls=lines(),body={mod:m,spec:clone(spec)};prev={busy:true,sig:s};drawCheck();
  api('/api/x/missions/sp/preview',body,{what:tx('missions.job.sp.preview',{title:spec.title||spec.name})}).then(function(j){if(my!==seq)return;prev={sig:s,j:j,lines:curSig()===s?lines():ls};var re=false;
   // the "not in the game's mods folder" box lives in the mod block only: redrawn when the Preview tells where the mod stands
   if(j.inMods!=null&&j.mod){if(!D.mods)D.mods={mods:[],cur:null};var c=D.mods.cur;if(!c||c.inMods!==j.inMods||!c.ok){D.mods.cur={path:j.mod,ok:true,inMods:j.inMods,modInfo:j.modInfo};re=true}}
   if(!j.ok&&j.refusal){bad={f:j.refusal.field,code:j.refusal.code};markBad()}if(re&&STEPS[step]==='check')draw();else drawCheck()})
   .catch(function(e){if(my!==seq)return;if(e&&e.cancelled){prev={sig:'',stopped:'pv'};drawCheck();return}var gone=/nofolder/.test(String(e&&(e.key||e.message)||''));if(gone){D.modsFor=null;loadMods()}
    prev={sig:s,err:gone?tx('missions.sp.modgone',{name:String(m).split(/[\\\/]/).pop()}):errOnly(e),next:nextOf(e),gone:gone,off:offline(e)};drawCheck()})}
 function write(asked){var p=prev,m=mod();if(!p||!p.j||!p.j.ok||p.sig!==curSig()){if(p)p.stale=true;drawCheck();return}
  if(!asked){K.ask({title:tx('missions.sp.write'),ok:tx('missions.sp.ok.write'),lines:[tx('missions.sp.confirm',{title:spec.title||spec.name,mod:m}),p.j.exists?replaceText(p.j):''],where:m}).then(function(y){if(y)write(true)});return}
  if(p.sig!==curSig())return;var my=++seq,body={mod:m,spec:clone(spec),replace:!!p.j.exists};prev={busy:true,sig:p.sig,writing:true};drawCheck();
  // after a Write the folder name stays (lock: a second Write replaces this mission, said in the Preview); no "open again" banner
  api('/api/x/missions/sp/write',body,{what:tx('missions.job.sp.write',{title:spec.title||spec.name})}).then(function(j){if(my!==seq)return;if(j.ok){lock={mission:j.mission,campaign:j.campaign,title:j.title};j.replaced=body.replace;j.spec=body.spec;prev={sig:'',done:j};UW=j.undo?j:null}else{prev={sig:p.sig,j:j};if(j.refusal){bad={f:j.refusal.field,code:j.refusal.code};markBad()}}mineFor=null;loadMine(true);drawEdit();drawCheck()})
   .catch(function(e){if(my!==seq)return;if(e&&e.cancelled){prev={sig:p.sig,j:p.j,lines:p.lines,stopped:'wr'};mineFor=null;loadMine(true);drawCheck();return}prev={sig:'',err:errOnly(e),next:nextOf(e),off:offline(e)};drawCheck()})}
 function undo(j){var m=mod();seq++;prev={busy:true,sig:'',undoing:true};drawCheck();
  api('/api/x/missions/sp/undo',{mod:m,token:j.undo},{what:tx('missions.job.sp.undo',{title:j.title||j.mission})}).then(function(r){if(r.ok){if(UW===j)UW=null;prev={sig:'',undone:{title:j.title||j.mission,files:r.files,removed:r.removed,restored:r.restored,dirs:r.dirs}};
    if(!j.replaced){editing=null;lock=null;mine=mine.filter(function(x){return !(x.mission===j.mission&&x.campaign===j.campaign)});drawMine()}}
   else{if(r.code!=='SP_UNDO_CHANGED')j.undoGone=true;prev={sig:'',done:j};say(tx(r.code==='SP_UNDO_CHANGED'?'missions.sp.undo.changed':'missions.sp.undo.gone',{files:(r.files||[]).join(', '),rm:tx('missions.sp.rm'),box:tx('missions.sp.mine.h')}),'err')}mineFor=null;loadMine(true);drawEdit();drawCheck()})
   .catch(function(e){prev={sig:'',done:j};say(errOnly(e));drawCheck()})}
 // is the Undo of a Write still held by the tools (a restart forgets it): asked when the Written box is drawn, at most every 10 s
 function undoAsk(j){if(!j.undo||j.undoGone||phone()||j.undoAt&&Date.now()-j.undoAt<10000)return;j.undoAt=Date.now();
  api('/api/x/missions/sp/undo-ok?token='+enc(j.undo)).then(function(r){if(r&&r.ok===false){j.undoGone=true;if(prev&&prev.done===j||UW===j)drawCheck()}}).catch(function(){})}
 function replaceText(j){var mine1=lock&&lock.mission===spec.name&&(!lock.campaign||lock.campaign===spec.campaign);if(mine1)return tx('missions.sp.replace');
  var o=null;mine.forEach(function(x){if(x.mission===spec.name&&x.campaign===spec.campaign)o=x});return tx('missions.sp.replace.other',{title:o&&o.title||spec.name})}
 function goLink(rel,t){var ref='ide:'+rel;return el('a',{href:'#go='+enc(ref),text:t,onclick:function(e){if(typeof window!=='undefined'&&window.as2Link&&window.as2Link(ref)&&e&&e.preventDefault)e.preventDefault()}})}
 function checkLines(j){var d=el('div'),n=j.check&&j.check.count||0,l=j.lint||{};
  var both=!n&&!l.na&&l.ran&&!l.count;if(!n)d.appendChild(el('div',{class:'ok','data-checks':both?'both':'one',text:tx(both?'missions.sp.check.allok':'missions.sp.check.ok')}));else{d.appendChild(el('div',{class:'err',text:tx('missions.sp.check.some',{p:pl('problem',n)})}));var u=K.list();j.check.findings.forEach(function(f){u.appendChild(el('li',{text:codeSent(f.code)}))});d.appendChild(u)}
  if(l.na)d.appendChild(hint(tx('missions.check.na',{why:l.na})));else if(!l.ran)d.appendChild(hint(tx('missions.sp.lint.no')));else if(!l.count){if(!both)d.appendChild(el('div',{class:'ok',text:tx('missions.sp.lint.ok')}))}
  else{d.appendChild(el('div',{text:tx('missions.sp.lint.some',{p:pl('problem',l.count)})}));var u2=K.list();(l.findings||[]).forEach(function(f){if(f.sev==='info')return;u2.appendChild(el('li',{text:K.codeText(f.code)}))});d.appendChild(u2)}
  return d}
 function playSteps(j){var o=el('ol',{style:'margin:4px 0 4px 20px;padding:0'}),out=j.inMods===false;
  [out?tx('missions.sp.play.1out'):tx('missions.sp.play.1',{mod:String(j.mod||'').split(/[\\\/]/).pop()}),tx('missions.sp.play.2'),tx('missions.sp.play.3',{camp:j.campaignTitle||j.campaign,title:j.title||j.mission}),tx('missions.sp.play.4')].forEach(function(t){o.appendChild(el('li',{text:t}))});
  return el('div',{},[el('b',{text:tx('missions.sp.play.h')}),o,el('div',{class:'row'},[btn(tx('missions.sp.play.go'),function(){K.go('play')},{cls:out?'primary':null}),btn(tx('missions.sp.play.logs'),function(){K.go('logs')})])])}
 function canWrite(){return !phone()&&!modGone()&&!!(prev&&prev.j&&prev.j.ok&&!prev.stale&&prev.sig===curSig())}
 function undoState(){var j=UW,on=!!(j&&j.undo&&!j.undoGone&&!phone()&&!(prev&&prev.busy));
  return {on:on,j:j,title:phone()?tx('missions.sp.phone'):on?tx('missions.sp.undo.t'):j&&j.undoGone?tx('missions.sp.undo.off'):tx('missions.sp.undo.none')}}
 function drawUndo(){if(!udBtn)return;var u=undoState();udBtn.disabled=!u.on;udBtn.setAttribute('title',u.title);if(u.j&&!u.j.undoGone)undoAsk(u.j)}
 // what stands against writing as it is (said above the Ready line, which is then not green): your start among enemies, both sides one
 // army, texts that no longer match their values
 function warns(j2){var w=[];if(j2.modInfo===false)w.push(noModView());(j2.notes||[]).forEach(function(n){if(n.code==='SPMIS_START_ENEMY')w.push(el('div',{class:'err','data-note':n.code,text:codeSent(n.code)}))});
  // the walkable part of the map could not be read (spmis SPMIS_AREA_UNKNOWN): said once, as a warning
  if((j2.notes||[]).some(function(n){return n.code==='SPMIS_AREA_UNKNOWN'}))w.push(el('div',{class:'wzstat','data-note':'SPMIS_AREA_UNKNOWN',text:codeSent('SPMIS_AREA_UNKNOWN')}));
  if(sameArmy())w.push(el('div',{class:'wzstat','data-samearmy':'1',text:tx('missions.sp.samearmy',{army:armyT(spec.player.army)})}));
  var n=staleTexts();if(n)w.push(el('div',{class:'wzstat','data-staletext':String(n)},[el('span',{text:tx('missions.sp.own.stale',{t:pl('text',n)})+' '}),btn(tx('missions.sp.own.go'),function(){go(staleStep())})]));return w}
 function sameArmy(){return !!(spec&&spec.player&&spec.enemy&&spec.player.army===spec.enemy.army)}
 function staleStep(){var c=spec.card;return Object.keys(c.own||{}).some(function(k){return /^goal:/.test(k)&&ownMoved(k)})?3:4}
 function drawCheck(){clear(outC);var m=mod(),p=prev;sum.hidden=false;if(wrBtn){wrBtn.disabled=!canWrite();if(K.isGoh())wrBtn.setAttribute('title',tx('missions.e.spgoh'));else wrBtn.removeAttribute('title')}if(pvBtn)pvBtn.disabled=!m||modGone()||!!(p&&p.busy);drawUndo();
  if(!m)return;
  if(!p){if(!modGone())outC.appendChild(hint(tx('missions.sp.prevfirst',{pv:tx('missions.sp.preview')})));return}
  if(p.busy){outC.appendChild(hint(tx(p.writing?'missions.sp.writing':p.undoing?'missions.sp.wait.undo':'missions.sp.checking')));return}
  if(p.stopped)outC.appendChild(el('div',{class:'hint','data-stopped':p.stopped,text:tx(p.stopped==='wr'?'missions.sp.stopped.wr':'missions.sp.stopped.pv',{pv:tx('missions.sp.preview')})}));
  if(p.err){outC.appendChild(el('div',{class:'err'},[el('div',{text:p.err}),p.off?null:el('div',{'data-next':'1',text:p.gone?tx('missions.sp.modgone.next'):p.next||tx('missions.sp.err.again')})]));return}
  if(p.removed){outC.appendChild(el('div',{class:'wzstat ok',text:tx('missions.sp.removed',{title:p.removed.title,f:pl('file',p.removed.files),d:pl('folder',p.removed.dirs)})}));return}
  if(p.undone){var ud=p.undone,rmN=ud.removed!=null?ud.removed:ud.files,bk=ud.restored||0,w=[];if(bk)w.push(tx('missions.sp.undone.back',{f:pl('file',bk)}));
   if(rmN||ud.dirs)w.push(ud.dirs?tx('missions.sp.undone.rmd',{f:pl('file',rmN),d:pl('folder',ud.dirs)}):tx('missions.sp.undone.rm',{f:pl('file',rmN)}));
   outC.appendChild(el('div',{class:'wzstat ok','data-undone':bk?(rmN?'both':'back'):'removed',text:tx('missions.sp.undone',{title:ud.title,what:w.join('; ')})}));return}
  if(p.done){var j=p.done;undoAsk(j);
   var us=undoState(),ub=phone()?null:btn(tx('missions.sp.undo'),function(){undo(j)},{title:UW===j?us.title:tx('missions.sp.undo.off'),dis:!(UW===j&&us.on)});
   var box1=el('div',{class:'wzstat ok'},[el('div',{text:tx('missions.sp.written',{title:j.title||j.mission,f:pl('file',j.written),d:pl('folder',j.dirs)})}),
    el('div',{text:tx('missions.sp.seeit',{camp:j.campaignTitle||j.campaign,title:j.title||j.mission})+(menuTried()?'':' '+tx('missions.sp.seeit.nt'))}),inGame(j),
    el('div',{class:'row'},[ub,el('span',{text:' '}),btn(tx('missions.sp.change'),function(){go(1)}),el('span',{text:' '}),goLink(j.link.slice(4),tx('missions.sp.open'))]),
    j.undoGone&&!phone()?el('div',{class:'hint','data-undo':'gone',text:tx('missions.sp.undo.gone',{rm:tx('missions.sp.rm'),box:tx('missions.sp.mine.h')})}):null]);
   outC.appendChild(box1);outC.appendChild(checkLines(j));if(j.goh)(j.notes||[]).forEach(function(n){outC.appendChild(el('div',{class:'hint','data-note':n.code,text:codeSent(n.code,n.p)}))});if(!j.modInfo)outC.appendChild(noModView());outC.appendChild(playSteps(j));return}
  var j2=p.j;if(!j2)return;
  if(p.stale||p.sig!==curSig())outC.appendChild(el('div',{class:'hint',text:tx('missions.sp.stale')}));
  if(!j2.ok){outC.appendChild(refusalView(j2.refusal||{code:'',msg:''}));if(j2.modInfo===false)outC.appendChild(noModView());return}
  var ws=warns(j2);ws.forEach(function(x){outC.appendChild(x)});
  // GoH: the plan as read and the plain text the server made ("not tried in game"), then the files the GoH writer puts down as for AS2
  if(j2.goh){var pn=j2.plan||{};outC.appendChild(el('div',{class:'wzstat','data-gohpv':'1',text:tx('missions.sp.goh.pv',{g:pn.groups||0,u:pn.units||0,o:pn.goals||0})}));
   outC.appendChild(el('details',{'data-gohtext':'1'},[el('summary',{text:tx('missions.sp.goh.text')}),el('pre',{style:'white-space:pre-wrap;margin:4px 0',text:String(j2.text||'')})]))}
  outC.appendChild(el('div',{class:ws.length?'wzstat':'ok','data-ready':String(ws.length),text:ws.length?tx('missions.sp.ready.warn',{w:pl('warning',ws.length),camp:j2.campaignTitle||j2.campaign,title:j2.title}):tx('missions.sp.ready',{camp:j2.campaignTitle||j2.campaign,title:j2.title})}));
  // a folder that holds a mission: this one (rewritten) or another one (said with its title, and a new folder name offered)
  var twin=mine.filter(function(x){return x.mission!==spec.name&&(!x.campaign||x.campaign===spec.campaign)&&String(x.title||'').trim().toLowerCase()===String(spec.title||'').trim().toLowerCase()})[0];
  if(twin&&!j2.exists)outC.appendChild(el('div',{class:'wzstat','data-duptitle':'1'},[el('div',{text:tx('missions.sp.duptitle',{title:spec.title})}),
   btn(tx('missions.sp.duptitle.go'),function(){go(4);var t=FE.title&&FE.title.querySelector?FE.title.querySelector('input'):null;if(t&&t.focus)try{t.focus()}catch(x){}})]));
  if(j2.exists){var other=!(lock&&lock.mission===spec.name);outC.appendChild(el('div',{class:'wzstat','data-replace':other?'other':'same'},[el('div',{text:replaceText(j2)}),other?btn(tx('missions.sp.newname'),function(){newFolder()}):null]))}
  outC.appendChild(el('b',{text:tx('missions.sp.pv.h')}));outC.appendChild(lineList(p.lines));sum.hidden=STEPS[step]==='check';
  var nseen={};(j2.notes||[]).forEach(function(n){if(n.code==='SPMIS_NO_MODINFO'||n.code==='SPMIS_START_ENEMY'||n.code==='SPMIS_AREA_UNKNOWN'||nseen[n.code])return;nseen[n.code]=1;outC.appendChild(el('div',{class:'hint','data-note':n.code,text:codeSent(n.code,n.p)}))});
  outC.appendChild(notTried());outC.appendChild(fileFold(j2.files))}
 // one line on what the player sees in the game: the menu entry, the first goal, the two ends (texts of the spec that was written)
 function inGame(j){var s=j.spec||spec||{},g=(s.objectives||[]).filter(function(o){return o.primary!==false})[0]||(s.objectives||[])[0];
  return el('div',{'data-ingame':'1',text:tx('missions.sp.ingame',{title:s.title||j.title||j.mission,goal:g&&g.text||'-',won:s.won||'-',lost:s.lost||'-'})})}
 function remove(x,asked){if(!asked){K.ask({title:tx('missions.sp.rm'),ok:tx('missions.sp.ok.rm'),lines:[tx('missions.sp.rm.q',{title:x.title||x.mission,mod:mod()})],where:mod(),danger:true}).then(function(y){if(y)remove(x,true)});return}
  api('/api/x/missions/sp/remove',{mod:mod(),mission:x.mission},{what:tx('missions.job.sp.remove',{title:x.title||x.mission})}).then(function(j){
   if(j.ok){var r={title:x.title||x.mission,files:j.files,dirs:j.dirs};say(tx('missions.sp.rm.done',{title:r.title,f:pl('file',j.files),d:pl('folder',j.dirs)}),'ok');
    if(UW&&UW.mission===x.mission)UW=null;if(prev&&(prev.done&&prev.done.mission===x.mission||prev.undone||prev.removed||prev.j&&prev.j.mission===x.mission))prev={sig:'',removed:r};if(editing&&editing.mission===x.mission)editing=null;if(lock&&lock.mission===x.mission)lock=null;mine=mine.filter(function(y){return y!==x});drawMine()}
   else{var gone=j.refusal&&j.refusal.code==='SP_GONE';say(codeSent(j.refusal&&j.refusal.code),gone?'hint':'err');if(gone){mine=mine.filter(function(y){return y!==x});drawMine()}}
   mineFor=null;loadMine(true);drawEdit();drawCheck()}).catch(function(e){say(errOnly(e))})}
 // a mission made in another window language (spec.card.lang): its texts are kept as typed (own), each says so, none is remade
 function reopen(x){if(!x.spec)return;var s=clone(x.spec),own={},was=s.card&&s.card.lang,other=!!(s.card&&/^(en|ru|uk|zh)$/.test(was||'')&&was!==TL());
  if(!s.card||other){TEXTS.forEach(function(f){if(f!=='goals'&&s[f])own[f]=true});(s.objectives||[]).forEach(function(o){if(o.text)own['goal:'+o.id]=true})}
  // typed there or made there: each is in that language now. A made one whose values did not change is made again in this window's
  // language once the map and units are read (settle); the others say "kept in English", and are flagged when a value changes (sig)
  var made={};
  if(s.card&&other){s.card.own=s.card.own||{};s.card.base=s.card.base||{};s.card.langOwn={};Object.keys(own).concat(Object.keys(s.card.own)).forEach(function(k){if(!s.card.own[k]&&!own[k])return;if(!s.card.own[k])made[k]=true;s.card.langOwn[k]=was;s.card.own[k]=true})}
  spec=prep(s,'',own);if(spec.card.langOwn&&other){var c0=spec.card;c0.sig={};Object.keys(c0.langOwn).forEach(function(k){c0.sig[k]=sigOf(k)});c0.langMade=made}nameAuto=false;editing={mission:x.mission,title:x.title||x.mission};lock={mission:x.mission,campaign:x.campaign||spec.campaign,title:x.title};prev=null;bad=null;mapNote='';notes=[];PT=null;OU={};dirty=false;kindAsk=null;RL=null;D.placesFor='';  bgLoad();say('');go(1)}
 function drawMine(){mineB.hidden=!mod();clear(mineL);mineS.textContent=tx('missions.sp.mine.h')+(mine.length?' ('+mine.length+')':'');if(!mod())return;
  if(!mine.length){mineL.appendChild(el('div',{class:'hint','data-minewait':mineBusy?'1':null,text:tx(mineBusy?'missions.sp.wait.mine':'missions.sp.mine.none')}));return}
  var u=K.list();mine.forEach(function(x){u.appendChild(el('li',{},[el('b',{text:x.title||x.mission}),el('span',{class:'hint',text:' '+x.campaign+'/'+x.mission+' '}),
   btn(tx('missions.sp.change'),function(){reopen(x)}),el('span',{text:' '}),goLink(x.link.slice(4),tx('missions.sp.open')),el('span',{text:' '}),btn(tx('missions.sp.rm'),function(){remove(x)},{dis:phone()})]))});
  mineL.appendChild(u);mineL.appendChild(hint(tx('missions.sp.mine.hint')))}
 function drawChk(){pvBtn=btn(tx('missions.sp.preview'),function(){preview()},{cls:'primary',dis:!mod()||modGone()});wrBtn=btn(tx('missions.sp.write'),function(){write(false)},{dis:true});
  udBtn=btn(tx('missions.sp.undo'),function(){var u=undoState();if(u.on)undo(u.j)},{dis:true});udBtn.setAttribute('data-undo','card');
  drawCheck();
  return [blk('sp.chk.intro',[hint(tx('missions.sp.chk.intro',{pv:tx('missions.sp.preview'),wr:tx('missions.sp.write')}))]),modView(),row('sp.chk.btns',[pvBtn,wrBtn,udBtn],tx('missions.b.btns')),blk('sp.chk.out',[outC],{name:tx('missions.b.out')}),
   phone()?blk('sp.chk.phone',[hint(tx('missions.sp.phone'))]):null].filter(Boolean)}

 // ---------- summary (side panel) and the Preview's plain list: the same spec values that are sent ----------
 function goalNo(id){var n=0;(spec.objectives||[]).forEach(function(o,i){if(o.id===id)n=i+1});return n}
 function gLine(g,k){var w=k==='pat'?tx('missions.sp.sum.walks',{route:(g.route||[]).map(plab).join(' → ')}):k==='wave'?tx('missions.sp.sum.wave',{from:plab(g.from),to:g.to==null||g.to==='start'?tx('missions.sp.pl.youstart'):plab(g.to),t:atT(g.time)})
   :k==='rf'?(g.after?tx('missions.sp.sum.rfafter',{at:plab(g.at),n:goalNo(g.after),t:durT(g.time||5)}):tx('missions.sp.sum.rftime',{at:plab(g.at),t:atT(g.time)})):plab(g.at);
  var s=gNameD(g)+', '+w+(g.crew?', '+crewText(g):''),lv=lvlT(g);return lv?s+' ('+lv+')':s}
 function loseT(){var L=spec.lose||{},w=[];if(L.allDead!==false)w.push(tx('missions.sp.sum.alldead'));if(L.unit){var g=gByName(L.unit);w.push(tx('missions.sp.sum.unitlost',{who:g?gName(g):L.unit}))}
  if(L.minutes)w.push(tx('missions.sp.sum.time',{t:durT(L.minutes*60)}));if((spec.objectives||[]).some(function(o){return o.primary!==false&&(o.type==='hold'||o.type==='escort')}))w.push(tx('missions.sp.sum.failgoal'));return w.join('; ')||'-'}
 function lines(){var p=spec.player||{},e=spec.enemy||{},o=[],t=tplOf();function L(x,sub){o.push({t:x,sub:!!sub})}
  if(t)L(tx('missions.sp.sum.kind',{k:tx(key('kt',t.name))}));
  L(tx('missions.sp.sum.map',{map:mapName(spec.map)}));
  L(tx('missions.sp.sum.you',{army:armyT(p.army),at:plab(p.start)}));(p.units||[]).forEach(function(g){L(gLine(g,'at'),1)});
  L(tx('missions.sp.sum.enemy',{army:armyT(e.army)}));(e.defenders||[]).forEach(function(g){L(gLine(g,'def'),1)});(e.patrols||[]).forEach(function(g){L(gLine(g,'pat'),1)});(e.waves||[]).forEach(function(g){L(gLine(g,'wave'),1)});
  L(tx('missions.sp.sum.goals'));(spec.objectives||[]).forEach(function(ob,i){var a=[ob.primary===false?tx('missions.sp.goal.bonus'):tx('missions.sp.goal.primary'),ob.after?tx('missions.sp.sum.after',{n:goalNo(ob.after)}):tx('missions.sp.sum.atonce')];
   if((ob.type==='hold'||ob.type==='survive')&&ob.after)a.push(tx('missions.sp.sum.timer'));L((i+1)+'. '+ob.text+' ('+a.join(', ')+')',1)});
  if((spec.reinforcements||[]).length){L(tx('missions.sp.sum.rf'));spec.reinforcements.forEach(function(g){L(gLine(g,'rf'),1)})}
  L(tx('missions.sp.sum.lose',{how:loseT()}));
  L(tx('missions.sp.sum.title',{title:spec.title||'-',camp:spec.campaignTitle||'-'}));
  return o}
 // the side panel: about eight lines (kind, map, the two sides with their group counts, the goals with the first one, losing, title);
 // "Show all" opens the full list, the one the Preview shows
 function shortLines(){var p=spec.player||{},e=spec.enemy||{},o=[],t=tplOf(),ob=spec.objectives||[],rf=spec.reinforcements||[];function L(x){o.push({t:x})}
  if(t)L(tx('missions.sp.sum.kind',{k:tx(key('kt',t.name))}));
  L(tx('missions.sp.sum.map',{map:mapName(spec.map)}));
  L(tx('missions.sp.sum.you',{army:armyT(p.army),at:plab(p.start)})+': '+pl('group',(p.units||[]).length));
  L(tx('missions.sp.sum.enemy',{army:armyT(e.army)})+' '+pl('group',(e.defenders||[]).length+(e.patrols||[]).length+(e.waves||[]).length));
  L(ob.length?tx('missions.sp.sum.goalsn',{n:ob.length,t:ob[0].text||'-'}):tx('missions.sp.sum.goals')+' 0');
  if(rf.length)L(tx('missions.sp.sum.rf')+' '+pl('group',rf.length));
  L(tx('missions.sp.sum.lose',{how:loseT()}));
  L(tx('missions.sp.sum.title',{title:spec.title||'-',camp:spec.campaignTitle||'-'}));
  return o}
 function drawSum(){clear(sumL);if(gameState()==='no')return;if(!spec){sumL.appendChild(hint(tx('missions.sp.loading')));return}
  sumL.appendChild(lineList(sumAll||FULL?lines():shortLines()));var b=btn(tx(sumAll?'missions.sp.sum.less':'missions.sp.sum.all'),function(){sumAll=!sumAll;drawSum()});b.setAttribute('data-sumall',sumAll?'1':'0');sumL.appendChild(b)}
 function drawEdit(){editB.hidden=!editing;editT.textContent=editing?tx('missions.sp.reopened',{title:editing.title||editing.mission,pv:tx('missions.sp.preview'),wr:tx('missions.sp.write')}):''}

 // ---------- drawing ----------
 var nogameShown=false;
 // no game folder: ONE line (not read: game folder not set) with the button to Settings; the steps and the summary are not drawn, so
 // nothing repeats it and nothing waits for a read that cannot start
 function noGameB(){nogameShown=gameState()==='no';if(!nogameShown)return null;return blk('sp.nogame',[el('div',{class:'err','data-noread':'1',title:tx('missions.sp.nogame'),text:cap(tx('missions.sp.noread'))+'. '}),btn(tx('missions.sp.nogame.go'),function(){K.go('settings')},{cls:'primary'})])}
 function readingB(){if(!gameOk()||!spec)return null;var busy=D.mapsBusy||unitsBusy()||D.placesFor===spec.map&&!(D.places&&D.places.key===spec.map);
  return busy?blk('sp.reading',[hint(tx('missions.sp.wait.read'))]):null}
 // rdraw(): the draw after a read landed. Same page as draw(), but the map box the user may be typing in stays (drawMap); the keyboard
 // focus it had is given back. noteOff: the read changed what the note was about (the maps), so the note is not kept
 function rdraw(noteOff){var a=null;try{a=document.activeElement}catch(e){}var had=!!(MBX&&a&&a===MBX.inp);if(noteOff&&MBX)MBX.nh.textContent='';
  MBKEEP=true;try{draw()}finally{MBKEEP=false}
  if(had&&MBX&&MBX.inp.focus){try{if(document.activeElement!==MBX.inp)MBX.inp.focus()}catch(e){}}}
 function draw(){if(!MBKEEP||!spec||STEPS[step]!=='map')MBX=null;FE={};skT=[];PKB=[];mmSync();var ng=noGameB();clear(stepBar);STEPS.forEach(function(s,i){var b=el('button',{type:'button',class:i===step?'primary':null,'aria-current':i===step?'step':null,text:(i+1)+'. '+tx(key('s',s)),onclick:function(){go(i)}});if(!spec||ng)b.disabled=true;stepBar.appendChild(b)});
  clear(body);sum.hidden=!!ng;drawMine();drawEdit();
  // no game folder, or the kinds not read yet (or their read failed: one line and Try again): no steps, Back and Next off
  if(ng||!spec){body.appendChild(ng||readFailB()||blk('sp.wait',[hint(tx('missions.sp.wait.start'))]));navBack.disabled=true;navNext.disabled=true;navNext.hidden=false;drawSum();return}
  // the mission map first (the step then leaves its sketch out): beside the step's own fields, the read and refusal lines above both
  navNext.disabled=false;fill();var mb=mmBlock(),own=[drawKind,drawMap,drawSides,drawGoals,drawStory,drawChk][step](),parts=[goneB(),readFailB(),relangB(),step>0?readingB():null].concat(mb?[mmWrap(mb,own)]:own);
  parts.forEach(function(x){[].concat(x).forEach(function(y){if(y)body.appendChild(y)})});navBack.disabled=step===0;navNext.hidden=step===STEPS.length-1;navNext.textContent=step===STEPS.length-2?tx('missions.sp.tocheck'):tx('missions.sp.next');
  drawPT();markBad();drawSum()}
 function drawGame(){var goh=K.isGoh(),g=K.game();cols.hidden=false;introB.hidden=goh;naB.hidden=!goh;mineB.hidden=!mod();clear(naB);as2T.textContent=g.id==='mowas2'?tx('missions.sp.as2'):'';as2T.hidden=g.id!=='mowas2';
  if(goh){naB.appendChild(el('div',{text:tx('missions.sp.goh')}));naB.appendChild(hint(tx('missions.sp.goh.why')));naB.appendChild(btn(tx('missions.sp.goh.go'),function(){K.go('goh')}))}}
 // the kinds first (sp/start reads the game alone), then the missions of the mod and the reads behind the steps, each with its own wait line
 function start(){drawGame();loadStart(function(){if(!spec&&D.start.templates&&D.start.templates.length)useKind(D.start.templates[0]);else bgLoad();loadMine(false);draw()})}
 function gameSync(){var id=K.game().id;if(id===lastGid)return;lastGid=id;ARMY=ARMY0.slice();UW=null;ERR={};RL=null;kindAsk=null;D={start:null,maps:null,mapsBusy:false,places:null,placesFor:'',units:{},unitsMod:{},mods:null,modsFor:null,pic:{}};MI=null;spec=null;step=0;prev=null;bad=null;editing=null;lock=null;notes=[];PT=null;mine=[];mineFor=null;seq++;say('');drawGame();draw()}
 var lastMod=mod();
 function modSync(){var m=mod();if(m===lastMod)return;lastMod=m;mmClose();UW=null;D.maps=null;MI=null;D.unitsMod={};D.mods=null;D.modsFor=null;if(prev&&prev.j)prev.stale=true;mineFor=null;if(D.start)loadMine(false);if(spec){bgLoad();if(STEPS[step]==='check')loadMods();draw()}}
 drawGame();draw();
 return {el:cardEl,close:function(){mmClose()},focus:function(){gameSync();modSync();start()},refresh:function(){gameSync();modSync();drawGame();if(!spec)start();else if(spec){var was=nogameShown;bgLoad();if(was!==(gameState()==='no')||STEPS[step]==='check'&&gameOk()&&!D.mods){loadMods();draw()}}},
  _t:{mm:function(){return MM},mmMarks:function(){return mmMarks()},mmPick:function(r){mmPick(r)},field:function(o,k,l){PT=o?{o:o,k:k,l:l}:null;drawPT()},draw:function(){draw()},full:function(v){FULL=!!v;if(spec)draw()},touch:function(){touch();draw()},err:function(){return ERR},retry:function(){retry(false)},failed:failed,pickKind:function(n){(D.start&&D.start.templates||[]).forEach(function(t){if(t.name===n)pickKind(t)})},kindAsk:function(){return kindAsk},placesKey:function(){return D.places&&!D.places.err?D.places.key:null},unitsIn:function(a){return !!D.units[a]},rdraw:function(n){rdraw(n)},dirty:function(){return dirty},
   openRow:function(g,i){OU[g]=i;draw()},sumAll:function(v){sumAll=!!v;drawSum()},skAll:function(v){skAll=!!v},roleW:roleW,relang:function(){return RL},escortLine:function(){return escortLine()},routeT:function(v){var R=escortLine();return R?routeT(R,v):null},nextOf:nextOf,
   spec:function(){return spec},step:function(){return step},go:go,lines:function(){return lines()},prev:function(){return prev},translit:translit,slug:slug,setOpen:function(g){openG=g},paths:function(v){paths=!!v},
   mapTyped:function(q){return mapTyped(q,{textContent:''}).map(function(x){return x.value})},
   mapHits:function(q){var r=[],n={textContent:''};find(mapItems(),q,function(o){r=o},n,'map');return {labels:r.map(function(x){return x.label}),note:n.textContent}},
   unitHits:function(army,q){var r=[],n={textContent:''};find(unitItems(army),q,function(o){r=o},n,'unit');return {labels:r.map(function(x){return x.label}),note:n.textContent}},
   reopen:function(x){reopen(x)},lock:function(){return lock},editing:function(){return editing},fixPlaces:function(f){fixPlaces(f);touch(true)},setMap:function(k){setMap(k)},goalPlace:function(){return goalPlace()},placeRoles:function(){return placeRoles()},setDef:function(g,d){setDef(g,d)},reArmy:function(s,a){reArmy(s,a)},undoState:function(){return undoState()},spotT:function(v){return spotT(v)},staleTexts:function(){return staleTexts()},startFoes:function(){return startFoes()},
   mine:function(v){if(v)mine=v;return mine},uniq:uniq,labOf:labOf,loose:loose,dupOf:dupOf,unitName:unitName,mapName:mapName,plab:function(n){return plab(n)},notes:function(){return notes},roleWords:roleWords}}
}
`;
