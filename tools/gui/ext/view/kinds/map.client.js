// view kind map, page side (../README.md): where:'page'. A binary file of a map folder (map.grs, map.net, map.ply under
// resource/map/**) opened anywhere jumps to a page that shows that map. The same in AS64, MoW:AS2 and Gates of Hell:
// - map.net and map.ply: the Map Viewer (page mapviz) with that map open as the user's pick (toViewer below). Map key =
//   the folder under resource/map/ (tools/mapviz/README.md 2.3), any folder there (GoH resource/map/1 too), not only
//   multi/ and single/.
// - map.grs: the Maps page with its grass card (GET /api/x/view/map/info) where this game has that page (AS64 only),
//   else the Map Viewer as map.net (no game loses the jump).
// - No Map Viewer in this game: map.net and map.ply go to the Maps page where it is, else the page says so and the bytes
//   tab opens (go answers false).
// A page "is in this game" when S.sec holds it and INGAME (page.js: the pages of the current game) lists it; a page of
// another game would make show() switch the game.
// A file outside a map folder is not claimed (match), so it never jumps to a page with nothing to show. A file inside one
// of the mod's own paks (rel '<pak>::<entry>') counts from the pak's folder: a pak is mounted at the folder it sits in
// (lib/vfs mountDir), so resource.pak entries start at resource/ and resource/map/multi.pak entries at resource/map/
// (the Gates of Hell layout: map/multi.pak holds multi/<folder>/map.net) [V lib/vfs.js, GoH multi.pak entry names].
// Also: VIEW.mapOf(name) -> 'map/multi/<folder>' | 'map/single/...' | null (the Maps page form); VIEW.mapGo(ref, name) for the explorer's "Show in Maps" (the Maps
// page where it exists, else the Map Viewer; any file of a map folder, text ones too); VIEW.mapViewGo(ref, name): always
// the Map Viewer.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML; strings through tx().
// Author: Imperator_Aug (ARSENAL, ia-edb63d38)
'use strict';
const script = String.raw`
(function(){
 var BIN=['grs','net','ply'];
 function low(s){return String(s==null?'':s).replace(/\\/g,'/').toLowerCase()}
 function under(n){var i=n.lastIndexOf('/resource/');
  if(i>=0)n=n.slice(i+10);else if(n.indexOf('resource/')===0)n=n.slice(9);return n.replace(/^\/+/,'')}
 // a pak entry counts from the folder the pak sits in, when that folder is under resource/ (else from resource/)
 function flat(s){var n=low(s);if(n.indexOf('::')<0)return under(n);
  var p=n.split('::'),e=p.pop().replace(/^\/+/,''),pk=p[0],d=pk.slice(0,pk.lastIndexOf('/')+1),pre='';
  if(d&&(d.indexOf('resource/')===0||d.indexOf('/resource/')>=0))pre=under(d+'x').replace(/x$/,'');
  return under(pre+e)}
 // the map folder of a file. Every folder part after map/ must be a name: '', '.' and '..' are refused.
 // wide (the Map Viewer path): any folder under map/ but the bare containers multi and single, as the Map Viewer list
 // keys maps (tools/mapviz/lib/mapkit/source.js: any folder under resource/map/ with a map.net; GoH ships resource/map/1)
 // [V GoH install listing]. Not wide (the Maps page, VIEW.mapOf): map/multi/... and map/single/... only, as that page's
 // server takes (maps/index.js)
 function mapOf(s,wide){var n=flat(s),p=n.split('/');if(p.length<3||p[0]!=='map')return null;
  var d=p.slice(1,-1);if(!p[p.length-1]||d.some(function(x){return x===''||x==='.'||x==='..'}))return null;
  if(wide){if(d.length===1&&(d[0]==='multi'||d[0]==='single'))return null}
  else if(d.length<2||(d[0]!=='multi'&&d[0]!=='single'))return null;
  return 'map/'+d.join('/')}
 function extOf(s){var b=low(s).split('/').pop().split('::').pop(),i=b.lastIndexOf('.');return i>0?b.slice(i+1):''}
 function mapOfItem(it,wide){var r=it.ref||{},l=[it.key,it.rel,r.key,r.rel,r.path];for(var i=0;i<l.length;i++){var m=mapOf(l[i]||'',wide);if(m)return m}return null}
 function say(k,p){if(typeof toast==='function')toast(tx(k,p))}
 // the page is in this game: built (S.sec) and listed for the current game (INGAME), so show() stays in this game
 function hasPage(id){return typeof show==='function'&&typeof S!=='undefined'&&!!S&&!!S.sec&&!!S.sec[id]&&(typeof INGAME!=='object'||!INGAME||!!INGAME[id])}
 function mapsOk(){return hasPage('maps')&&!!S.screens&&!!S.screens.maps&&typeof S.screens.maps.pick==='function'}
 function viewerOk(){return hasPage('mapviz')}
 // what the Maps page says about the file under the map's picture
 function extra(it,j){var f=extOf(it.name),n=it.name;
  if(f==='grs'){var g=(j&&j.grass)||null;return {title:tx('view.map.grsT',{name:n}),lines:g?[tx('view.map.grass',{n:g.length}),g.join(', ')]:[tx('view.map.grsBad')]}}
  if(f==='ply')return {title:tx('view.map.plyT',{name:n}),lines:[tx('view.map.plyL')]};
  if(f==='net')return {title:tx('view.map.netT',{name:n}),lines:[tx('view.map.netL')]};
  return {title:tx('view.map.fileT',{name:n}),lines:[]}}
 function toMaps(it,mk){
  function go(j){show('maps');S.screens.maps.pick(mk,extra(it,j))}
  if(BIN.indexOf(extOf(it.name))<0){go(null);return true}
  api('/api/x/view/map/info?'+it.q).then(go,function(){go(null)});return true}
 // the Map Viewer with the map open, as the user's pick (the shell starts the read job for a map not read yet).
 // The shell opens S.mapKey on its refresh as no pick (user false), and a pick of the key its read already asks for is not
 // redone, so with the screen's pick(key): S.mapKey is blanked, the pick goes while the Map Viewer is still hidden (its
 // read waits for the show), show() refreshes it (the held read goes, with user true), and a second pick after the show
 // opens the map when that refresh closed it (first show, or a game, folder or mod change). Then S.mapKey = the map.
 // With no pick on the screen: S.mapKey, then show() (the shell opens it on its refresh)
 function toViewer(mk){if(!/^map\/[^\/]/.test(mk))return false;var key=mk.slice(4),sc=S.screens&&S.screens.mapviz;
  if(sc&&typeof sc.pick==='function'){S.mapKey='';try{sc.pick(key)}catch(e){}show('mapviz');
   try{if(!sc.V||typeof sc.V.q!=='function'||sc.V.q('map')!==key)sc.pick(key)}catch(e){}S.mapKey=mk}
  else{S.mapKey=mk;show('mapviz')}
  say('view.map.toViewer',{key:key});return true}
 // it: the file; grs: open the Maps page first where it is (the grass card)
 function goItem(it,mapsFirst){var mk=mapOfItem(it,true),strict=mapOfItem(it,false);if(!mk)return false;
  if(mapsFirst&&strict&&mapsOk())return toMaps(it,strict);
  if(viewerOk())return toViewer(mk);
  if(strict&&mapsOk())return toMaps(it,strict);
  say('view.map.noViewer');return false}
 VIEW.reg('map',{where:'page',label:'view.map.label',exts:[],
  match:function(name,key){return [key,name].some(function(s){return !!s&&!!mapOf(s,true)&&BIN.indexOf(extOf(s))>=0})},
  go:function(item){return goItem(item,extOf(item.name)==='grs')}});
 VIEW.mapOf=function(s){return mapOf(s,false)};
 function itemOf(ref,name){var it=VIEW.item(ref,name,'map');if(!it){say('view.noMod');return null}
  if(!mapOfItem(it,true)){say('view.map.none',{name:it.name});return null}return it}
 VIEW.mapGo=function(ref,name){var it=itemOf(ref,name);if(!it)return false;return goItem(it,true)};
 VIEW.mapViewGo=function(ref,name){var it=itemOf(ref,name);if(!it)return false;
  if(!viewerOk()){say('view.map.noViewer');return false}return toViewer(mapOfItem(it,true))};
})();
`;
module.exports = { script, css: '' };
