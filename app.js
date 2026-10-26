import { HarshMaps } from './sdk/harshmaps.js';
import { formatDistance, rankNearbyPlaces } from './sdk/nearby.js';
import { detectPlaceCategory, extractCategoryLocation } from './sdk/search-intent.js';
import { addOverturePlaces, bindOverturePlacePopups, validOvertureRelease, setOverturePlaceCategory, setOverturePlacesVisible } from './sdk/places-layer.js';

function withImportTimeout(promise, milliseconds, label) {
 let timer;
 return Promise.race([
  promise,
  new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out.')), milliseconds); })
 ]).finally(() => clearTimeout(timer));
}
async function loadMapLibre() {
 const sources = [
  'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs',
  'https://cdn.jsdelivr.net/npm/maplibre-gl@6.16.0/dist/maplibre-gl.mjs',
  'https://cdn.jsdelivr.net/npm/maplibre-gl@6.14.0/dist/maplibre-gl.mjs'
 ];
 let lastError = null;
 for (const source of sources) {
  try { return await withImportTimeout(import(source), 6000, 'Map engine CDN'); }
  catch (error) { lastError = error; }
 }
 const loader = document.querySelector('#map-loader');
 if (loader) { loader.classList.remove('hidden'); loader.classList.add('failed'); loader.textContent = 'Map engine unavailable. Check your connection and reload this page.'; }
 const mapStatus = document.querySelector('#map-status');
 if (mapStatus) mapStatus.textContent = 'Map engine unavailable · CDN requests failed';
 document.querySelector('#map-health-dot')?.classList.add('warning');
 throw lastError || new Error('Could not load the MapLibre map engine.');
}
const maplibregl = await loadMapLibre();

let pmtilesProtocolPromise = null;
function ensurePmtilesProtocol() {
 if (pmtilesProtocolPromise) return pmtilesProtocolPromise;
 const setup = (async () => {
  let lastError = null;
  for (const source of ['https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/+esm', 'https://esm.sh/pmtiles@4.5.0']) {
   try {
    const pmtiles = await withImportTimeout(import(source), 6000, 'Places library CDN');
    if (typeof pmtiles.Protocol !== 'function') throw new Error('PMTiles did not expose its MapLibre protocol.');
    maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);
    return true;
   } catch (error) { lastError = error; }
  }
  throw lastError || new Error('PMTiles could not be loaded.');
 })();
 pmtilesProtocolPromise = setup.catch(error => { pmtilesProtocolPromise = null; throw error; });
 return pmtilesProtocolPromise;
}
const RASTER_FALLBACK_STYLE = {
 version: 8,
 sources: {
  'osm-raster': {
   type: 'raster',
   tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
   tileSize: 256,
   minzoom: 0,
   maxzoom: 19,
   attribution: '© OpenStreetMap contributors'
  }
 },
 layers: [{ id: 'osm-raster-layer', type: 'raster', source: 'osm-raster', minzoom: 0, maxzoom: 19 }]
};
const STYLES=HarshMaps.styles, START={center:[72.8777,19.076],zoom:10.2};
const ROUTING_MODES=Object.freeze({driving:{label:'Driving',baseUrl:'https://routing.openstreetmap.de/routed-car/route/v1',profile:'driving'},walking:{label:'Walking',baseUrl:'https://routing.openstreetmap.de/routed-foot/route/v1',profile:'driving'},cycling:{label:'Cycling',baseUrl:'https://routing.openstreetmap.de/routed-bike/route/v1',profile:'driving'}});
const map=HarshMaps.createMap(maplibregl,'map',{style:STYLES.liberty,center:START.center,zoom:START.zoom,maxZoom:20,minZoom:2,attributionControl:{compact:true}});
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
let searchMarkers=[],routeMarkers=[],latestRoute=null,is3D=false,activeStyle='liberty',toastTimer;
let placesEnabled=true,placesCategory='all',placesRelease=null,placesLayerBound=false;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200)}
function status(message,warning=false){$('#map-status').textContent=message;$('#map-health-dot').classList.toggle('warning',warning)}
function updateZoom(){$('#zoom-status').textContent='ZOOM '+map.getZoom().toFixed(1)}
function labelView(title,subtitle){$('#view-title').textContent=title;$('#view-subtitle').textContent=subtitle||'VECTOR MAP · LIVE TILES'}
function clearMarkers(list){list.forEach(marker=>marker.remove());list.length=0}
function marker(place,destination=false,routeMarker=false){const m=HarshMaps.addMarker(maplibregl,map,place.coordinates,{color:destination?'#202434':'#675bf4',label:place.name});(routeMarker||destination?routeMarkers:searchMarkers).push(m);return m}
let mapStartupReady=false,rasterFallbackActive=false,mapControlsAdded=false,mapStartupTimer=null,mapFallbackTimer=null;
function finishMapStartup(useFallback=false){
 if(mapStartupReady)return;
 mapStartupReady=true;clearTimeout(mapStartupTimer);clearTimeout(mapFallbackTimer);
 $('#map-loader').classList.add('hidden');status(useFallback?'Backup raster map active · OpenStreetMap tiles':'Connected · OpenFreeMap vector tiles',useFallback);updateZoom();
 if(!mapControlsAdded){map.addControl(new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:false,showUserHeading:true}),'top-right');mapControlsAdded=true}
 refreshPlacesLayer();
}
function failMapStartup(message){
 const loader=$('#map-loader');loader.classList.remove('hidden');loader.classList.add('failed');loader.textContent=message;status('Map services unavailable',true);
}
map.on('load',()=>{if(!rasterFallbackActive)finishMapStartup(false);else if(map.getStyle()?.sources?.['osm-raster'])finishMapStartup(true)});
map.on('style.load',()=>{if(rasterFallbackActive&&!mapStartupReady&&map.getStyle()?.sources?.['osm-raster'])finishMapStartup(true)});
map.on('zoom',updateZoom);
map.on('error',e=>{if(!mapStartupReady&&e&&e.error)status('Map service is slow or unavailable · trying recovery…',true)});
mapStartupTimer=setTimeout(()=>{
 if(mapStartupReady||rasterFallbackActive)return;
 rasterFallbackActive=true;status('Vector map is not responding · trying a backup basemap',true);
 const loader=$('#map-loader');loader.classList.remove('hidden');loader.classList.remove('failed');loader.textContent='Vector tiles unavailable · switching to backup map…';
 mapFallbackTimer=setTimeout(()=>{if(!mapStartupReady)failMapStartup('Map services did not respond. Check your internet connection and reload this page.')},12000);
 try{map.setStyle(RASTER_FALLBACK_STYLE)}catch(error){failMapStartup('Could not start the backup map. Check your connection and reload this page.')}
},14000);

let selectedSearchArea=null;
let searchTimer=null,searchController=null,searchRequestId=0;
let areaTimer=null,areaController=null,areaRequestId=0;
const SEARCH_DEBOUNCE_MS=430;
function setEmptySearch(message,title='No matching places'){
 const box=$('#search-results');box.replaceChildren();$('#result-count').textContent='00';
 const empty=document.createElement('div');empty.className='empty';
 const icon=document.createElement('b');icon.textContent='⌕';
 const heading=document.createElement('strong');heading.textContent=title;
 const help=document.createElement('span');help.textContent=message;
 empty.append(icon,heading,help);box.append(empty);
}
function placeContext(place){
 const parts=[place.street,place.district,place.city,place.state,place.country].filter(Boolean);
 return parts.filter((v,i,a)=>a.findIndex(x=>String(x).toLowerCase()===String(v).toLowerCase())===i).join(', ');
}
function waitForMapIdle(timeoutMs=7000){
 return new Promise(resolve=>{
   let timer=null;
   let settled=false;
   const finish=()=>{
     if(settled)return;
     settled=true;
     if(timer)clearTimeout(timer);
     map.off('idle',finish);
     resolve();
   };
   map.once('idle',finish);
   timer=setTimeout(finish,timeoutMs);
 });
}
function requestDeviceCoordinates(){
 return new Promise((resolve,reject)=>{
   if(!navigator.geolocation){reject(new Error('Geolocation is not supported'));return}
   navigator.geolocation.getCurrentPosition(
     position=>resolve([position.coords.longitude,position.coords.latitude]),
     error=>reject(error||new Error('Could not get device location')),
     {enableHighAccuracy:false,timeout:10000,maximumAge:60000}
   );
 });
}
async function showNearbyCategoryResults(category,options={}){
 const area=selectedSearchArea&&Array.isArray(selectedSearchArea.coordinates)?selectedSearchArea:null;
 const current=map.getCenter();
 let center=area?area.coordinates:[current.lng,current.lat];
 let locationMessage='';
 if(!area&&options.useDeviceLocation){
   try{center=await requestDeviceCoordinates()}
   catch{locationMessage='Device location was unavailable; results use the current map view instead.'}
 }
 const targetZoom=Math.max(14.5,Math.min(16,map.getZoom()));
 placesEnabled=true;
 placesCategory=category.id;
 $('#toggle-places-layer').setAttribute('aria-pressed','true');
 $('#places-category').value=category.id;
 setOverturePlaceCategory(map,category.id);
 setOverturePlacesVisible(map,true);
 labelView(category.title+(area?' · '+(area.name||area.label):options.useDeviceLocation&&!locationMessage?' near you':' nearby'),
   'NEARBY PLACES · STRAIGHT-LINE DISTANCE');
 status('Finding labeled '+category.title.toLowerCase()+'…');
 const box=$('#search-results');
 const old=box.querySelector('.nearby-results-container');
 if(old)old.remove();
 try{
   await refreshPlacesLayer();
   map.flyTo({center,zoom:targetZoom,speed:1.05,essential:true});
   await waitForMapIdle(8000);
   const features=map.getLayer('harshmaps-overture-place-dots')
     ?map.queryRenderedFeatures({layers:['harshmaps-overture-place-dots']}):[];
   const results=rankNearbyPlaces(features,center,{limit:20});
   const panel=document.createElement('section');
   panel.className='nearby-results-container';
   panel.setAttribute('aria-label','Nearby '+category.title.toLowerCase());
   const heading=document.createElement('div');
   heading.className='nearby-results-heading';
   const title=document.createElement('strong');
   title.textContent='Nearby '+category.title;
   const count=document.createElement('span');
   count.textContent=String(results.length).padStart(2,'0');
   heading.append(title,count);
   panel.append(heading);
   const explanation=document.createElement('p');
   explanation.className='nearby-results-note';
   explanation.textContent=area
     ?'Labeled places visible around '+(area.name||area.label)+', closest first.'
     :options.useDeviceLocation&&!locationMessage
       ?'Labeled places visible around your device location, closest first.'
       :'Labeled places visible around the current map view, closest first.';
   if(locationMessage){const locationNote=document.createElement('p');locationNote.className='nearby-results-note';locationNote.textContent=locationMessage;panel.append(locationNote)}
   panel.append(explanation);
   if(!results.length){
     const empty=document.createElement('div');
     empty.className='nearby-results-empty';
     empty.textContent='No labeled places were returned for this category in the visible map tiles. The global places layer is experimental, so coverage may be incomplete.';
     panel.append(empty);
     const retry=document.createElement('button');
     retry.type='button';
     retry.className='nearby-results-retry';
     retry.textContent='Retry nearby search';
     retry.addEventListener('click',()=>{void showNearbyCategoryResults(category,options)});
     panel.append(retry);
     box.append(panel);
     status('No labeled places found in the visible map tiles',true);
     return;
   }
   results.forEach(place=>{
     const item=document.createElement('button');
     item.type='button';
     item.className='result-card nearby-result-card';
     item.setAttribute('aria-label','Show '+place.name+' on map, '+formatDistance(place.distanceMeters)+' away');
     const pin=document.createElement('span');
     pin.className='result-pin';
     pin.textContent='⌖';
     const copy=document.createElement('span');
     copy.className='result-text';
     const name=document.createElement('strong');
     name.textContent=place.name;
     const meta=document.createElement('small');
     meta.className='result-address';
     meta.textContent=formatDistance(place.distanceMeters)+' straight-line · '+place.category;
     copy.append(name,meta);
     const arrow=document.createElement('span');
     arrow.className='result-arrow';
     arrow.textContent='↗';
     item.append(pin,copy,arrow);
     item.addEventListener('click',()=>{
       clearMarkers(searchMarkers);
       const selected={...place,label:place.label||place.name};
       marker(selected);
       map.flyTo({center:selected.coordinates,zoom:16,speed:1.1,essential:true});
       labelView(selected.name,[selected.category,selected.city,selected.state,selected.country].filter(Boolean).join(' · ').toUpperCase());
       status('Showing '+selected.name);
       offerDirectionsTo(selected);
       box.querySelectorAll('.result-card').forEach(resultCard=>resultCard.removeAttribute('aria-current'));
       item.setAttribute('aria-current','true');
     });
     panel.append(item);
   });
   const sourceNote=document.createElement('p');
   sourceNote.className='nearby-results-note';
   sourceNote.textContent='Results come from experimental Overture inspection tiles. Distances are straight-line estimates, not walking or driving distances.';
   panel.append(sourceNote);
   box.append(panel);
   status(results.length+' labeled places shown · closest first');
 }catch(error){
   const panel=document.createElement('section');
   panel.className='nearby-results-container';
   const message=document.createElement('p');
   message.className='nearby-results-empty';
   message.textContent='Nearby place results could not be loaded. The base map may still work; try again in a moment.';
   panel.append(message);
   const retry=document.createElement('button');
   retry.type='button';
   retry.className='nearby-results-retry';
   retry.textContent='Retry nearby search';
   retry.addEventListener('click',()=>{void showNearbyCategoryResults(category,options)});
   panel.append(retry);
   box.append(panel);
   status('Nearby place lookup unavailable',true);
 }
}
function selectedAreaMatchesLocation(locationQuery){
 if(!selectedSearchArea||!locationQuery)return false;
 const queryLead=String(locationQuery).split(',')[0].trim().toLowerCase();
 const selectedLead=String(selectedSearchArea.name||selectedSearchArea.label||'').split(',')[0].trim().toLowerCase();
 return Boolean(queryLead&&selectedLead&&(queryLead===selectedLead||queryLead.startsWith(selectedLead+' ')));
}
async function selectCategoryLocation(locationQuery){
 try{
   const current=map.getCenter();
   const places=await HarshMaps.searchPlaces(locationQuery,{
     baseUrl:HarshMaps.providers.photon,limit:8,
     lat:current.lat,lon:current.lng,zoom:5,locationBiasScale:0.1,
   });
   if(!places.length)return false;
   const wanted=String(locationQuery).split(',')[0].trim().toLowerCase();
   const place=places.find(item=>String(item.name||'').toLowerCase()===wanted)
     ||places.find(item=>String(item.label||'').toLowerCase().includes(wanted))
     ||places[0];
   setSearchArea(place);
   map.flyTo({center:place.coordinates,zoom:11.5,speed:1.1,essential:true});
   labelView(place.name||place.label,[place.state,place.country].filter(Boolean).join(' · ').toUpperCase()||'SELECTED CITY');
   status('Searching '+(place.name||place.label));
   return true;
 }catch(error){return false}
}
function showCategoryBrowseAction(category,query=''){
 if(!category)return;
 const box=$('#search-results');
 const card=document.createElement('div');card.className='browse-category-card';
 const icon=document.createElement('span');icon.className='browse-category-icon';icon.textContent=category.icon;
 const text=document.createElement('span');text.className='browse-category-copy';
 const title=document.createElement('strong');title.textContent='Browse '+category.title;
 const queryLocation=extractCategoryLocation(query);
 const conflictingLocation=Boolean(queryLocation&&selectedSearchArea&&!selectedAreaMatchesLocation(queryLocation));
 const details=document.createElement('small');details.textContent=selectedSearchArea&&!conflictingLocation
   ?'Show mapped '+category.title.toLowerCase()+' near '+(selectedSearchArea.name||selectedSearchArea.label)+'.'
   :queryLocation
     ?'Move to '+queryLocation+' and show labeled '+category.title.toLowerCase()+'.'
     :/\b(?:near me|around me)\b/i.test(query)
       ?'Use your device location to find labeled '+category.title.toLowerCase()+' nearby.'
       :'Show mapped '+category.title.toLowerCase()+' near the current map view. Add Search In to focus another city.';
 text.append(title,details);
 const action=document.createElement('button');action.type='button';action.className='browse-category-action';action.textContent='Show on map →';
 action.addEventListener('click',async()=>{
   const locationQuery=extractCategoryLocation(query);
   if(locationQuery&&!selectedAreaMatchesLocation(locationQuery)){
     const located=await selectCategoryLocation(locationQuery);
     if(!located){status('Could not resolve '+locationQuery,true);toast('Could not find that city or area. Try using Search In.');return}
   }
   const deviceLocationQuery=!locationQuery&&/\b(?:near me|around me)\b/i.test(query);
   if(deviceLocationQuery&&selectedSearchArea)setSearchArea(null);
   await showNearbyCategoryResults(category,{useDeviceLocation:deviceLocationQuery});
 });
 card.append(icon,text,action);box.prepend(card);
}
function offerDirectionsTo(place){
 const box=$('#search-results');
 box.querySelector('.selected-place-action')?.remove();
 const action=document.createElement('div');action.className='selected-place-action';
 const copy=document.createElement('div');copy.className='selected-place-copy';
 const title=document.createElement('strong');title.textContent='Going here?';
 const details=document.createElement('small');details.textContent=(place.name||place.label)+' · '+(placeContext(place)||place.label);
 copy.append(title,details);
 const button=document.createElement('button');button.type='button';button.className='selected-place-route';button.textContent='Plan route →';
 button.addEventListener('click',()=>{
   const tab=$$('.tab').find(item=>item.dataset.panel==='directions-panel');
   if(tab)tab.click();
   routeSelections.to=place;
   $('#route-to').value=place.label||place.name;
   hideRouteSuggestions('to');
   $('#route-from').focus();
   toast('Destination added. Choose a start point to get directions.');
 });
 action.append(copy,button);box.append(action);
}
function showResults(places,options={}){
 const box=$('#search-results');box.replaceChildren();
 $('#result-count').textContent=options.busy?'…':String(places.length).padStart(2,'0');
 if(options.busy){
   const empty=document.createElement('div');empty.className='empty';
   const heading=document.createElement('strong');heading.textContent='Finding matches…';
   const help=document.createElement('span');help.textContent=options.message||'Searching place names and nearby locations.';
   empty.append(heading,help);box.append(empty);return;
 }
 if(!places.length){setEmptySearch(options.message||'Try a more specific name, or add a city in Search In.');return}
 places.forEach((place,index)=>{
   const btn=document.createElement('button');btn.type='button';btn.className='result-card';
   const pin=document.createElement('span');pin.className='result-pin';pin.textContent='⌖';
   const text=document.createElement('span');text.className='result-text';
   const name=document.createElement('strong');name.textContent=place.name||place.label;
   const meta=document.createElement('small');meta.className='result-address';meta.textContent=placeContext(place)||place.label||'Place result';
   text.append(name,meta);
   if(place.category&&place.category!=='place'){
     const kind=document.createElement('span');kind.className='result-kind';kind.textContent=String(place.category).replace(/_/g,' ');text.append(kind);
   }
   const arrow=document.createElement('span');arrow.className='result-arrow';arrow.textContent='↗';
   btn.append(pin,text,arrow);
   btn.setAttribute('aria-label','Show '+(place.name||place.label)+' on map'+(placeContext(place)?', '+placeContext(place):''));
   btn.addEventListener('click',()=>{
     clearMarkers(searchMarkers);marker(place);
     map.flyTo({center:place.coordinates,zoom:15,speed:1.15,essential:true});
     labelView(place.name||'Selected place',[place.city,place.state,place.country].filter(Boolean).join(' · ').toUpperCase()||'SELECTED RESULT');
     status('Showing '+(place.name||place.label));offerDirectionsTo(place);
     $$('.result-card').forEach(item=>item.removeAttribute('aria-current'));btn.setAttribute('aria-current','true');
     // Keep the mobile panel open so the selected place and Plan route action remain available.
   });
   box.append(btn);
 });
 const note=document.createElement('div');note.className='search-results-note';
 note.textContent=selectedSearchArea
   ? 'Showing matches in or around '+(selectedSearchArea.name||selectedSearchArea.label)+'. Choose a specific branch or landmark above.'
   : 'Multiple cities can have the same business name. Choose a result above, or set Search In to narrow it to a city.';
 box.append(note);
}
function setSearchArea(place){
 selectedSearchArea=place;
 $('#search-location').value=place?place.label||place.name:'';
 $('#clear-search-location').hidden=!place;
 const chip=$('#selected-search-area');chip.replaceChildren();
 if(place){
   const text=document.createElement('span');text.textContent='Searching near '+(place.name||place.label);
   const clear=document.createElement('button');clear.type='button';clear.textContent='Change';clear.addEventListener('click',clearSearchArea);
   chip.append(text,clear);chip.hidden=false;
   $('#search-location').value=place.name||place.label;
 }else chip.hidden=true;
 $('#location-suggestions').hidden=true;
}
function clearSearchArea(){
 selectedSearchArea=null;$('#search-location').value='';$('#selected-search-area').hidden=true;$('#clear-search-location').hidden=true;
 if($('#place-query').value.trim().length>=3){clearTimeout(searchTimer);searchTimer=setTimeout(()=>search($('#place-query').value,{live:true}),100)}
}
async function searchAreas(query){
 const q=String(query||'').trim();
 if(q.length<2){$('#location-suggestions').hidden=true;return}
 if(areaController)areaController.abort();
 areaController=new AbortController();const requestId=++areaRequestId;
 const box=$('#location-suggestions');box.replaceChildren();
 const msg=document.createElement('div');msg.className='suggestions-message';msg.textContent='Finding cities and areas…';box.append(msg);box.hidden=false;
 try{
   const center=map.getCenter();
   const places=await HarshMaps.searchPlaces(q,{baseUrl:HarshMaps.providers.photon,limit:6,lat:center.lat,lon:center.lng,zoom:5,locationBiasScale:0.1,layers:['city','locality','district','county','state'],signal:areaController.signal});
   if(requestId!==areaRequestId)return;
   box.replaceChildren();
   if(!places.length){const empty=document.createElement('div');empty.className='suggestions-message';empty.textContent='No city or area found. Try including the state or country.';box.append(empty);return}
   places.forEach(place=>{
     const btn=document.createElement('button');btn.type='button';btn.className='location-suggestion';
     const icon=document.createElement('span');icon.className='location-suggestion-icon';icon.textContent='⌖';
     const copy=document.createElement('span');copy.className='location-suggestion-copy';
     const title=document.createElement('strong');title.textContent=place.name||place.label;
     const meta=document.createElement('small');meta.textContent=[place.state,place.country].filter(Boolean).join(', ')||place.label;
     copy.append(title,meta);btn.append(icon,copy);
     btn.addEventListener('click',()=>{
       setSearchArea(place);
       const term=$('#place-query').value.trim();
       if(term.length>=2)search(term,{live:true});
       else $('#search-hint').textContent='Search area selected. Now type the bank, shop or landmark you want to find.';
     });
     box.append(btn);
   });
 }catch(error){
   if(error&&error.name==='AbortError')return;
   if(requestId!==areaRequestId)return;
   box.replaceChildren();const msg2=document.createElement('div');msg2.className='suggestions-message';msg2.textContent='City suggestions are temporarily unavailable.';box.append(msg2);
 }
}
async function search(query,options={}){
 const q=String(query||'').trim();
 if(q.length<2){if(!options.live)toast('Enter at least two characters to search.');return}
 $('#place-query').value=q;
 if(searchController)searchController.abort();
 searchController=new AbortController();const requestId=++searchRequestId;
 const box=$('#search-results');
 const area=selectedSearchArea;
 const center=map.getCenter();
 const bias=area&&Array.isArray(area.coordinates)?area.coordinates:[center.lng,center.lat];
 const useAreaExtent=Boolean(area&&Array.isArray(area.extent)&&area.extent.length===4);
 const queryText=area&&!useAreaExtent?[q,area.name||area.label,area.state,area.country].filter(Boolean).join(', '):q;
 showResults([],{busy:true,message:area?'Searching around '+(area.name||area.label)+'…':'Searching across matching place names…'});
 status('Searching places…');
 try{
   const places=await HarshMaps.searchPlaces(queryText,{baseUrl:HarshMaps.providers.photon,limit:10,lat:bias[1],lon:bias[0],zoom:area?12:map.getZoom(),locationBiasScale:area?0.65:0.15,bbox:useAreaExtent?area.extent:undefined,signal:searchController.signal});
   if(requestId!==searchRequestId)return;
   showResults(places,{message:places.length?'':selectedSearchArea?'No matches in or around '+(selectedSearchArea.name||selectedSearchArea.label)+'. Try another spelling or clear Search In.':'No matching names found. Try another spelling or add a city in Search In.'});
   const category=detectPlaceCategory(q);if(category)showCategoryBrowseAction(category,q);
   if(!places.length){status(category?'No named matches · browse the category on the map':'No matching places');return}
   status(places.length+' match'+(places.length===1?'':'es')+' · select a result');
 }catch(error){
   if(error&&error.name==='AbortError')return;
   if(requestId!==searchRequestId)return;
   showResults([],{message:'The public place-search service is unavailable right now. Please try again.'});
   const category=detectPlaceCategory(q);if(category)showCategoryBrowseAction(category,q);
   status('Search provider unavailable',true);
 }
}
async function jumpToCity(query){
 const q=String(query||'').trim();if(!q)return;
 status('Finding '+q+'…');
 try{
   const center=map.getCenter();
   const places=await HarshMaps.searchPlaces(q,{baseUrl:HarshMaps.providers.photon,limit:5,lat:center.lat,lon:center.lng,zoom:5,locationBiasScale:0.1,layers:['city','locality']});
   if(!places.length)throw new Error('No city result returned.');
   const wanted=q.split(',')[0].trim().toLowerCase();
   const place=places.find(item=>String(item.name||'').toLowerCase()===wanted)||places[0];
   setSearchArea(place);
   map.flyTo({center:place.coordinates,zoom:11.5,speed:1.1,essential:true});
   $('#place-query').value='';
   setEmptySearch('Now type a bank, shop, landmark or address to search around '+(place.name||place.label)+'.','Ready to explore');
   labelView(place.name||q,[place.state,place.country].filter(Boolean).join(' · ').toUpperCase()||'SELECTED CITY');
   status('Showing '+(place.name||q));
 }catch(error){
   status('Could not jump to that city',true);
   toast('City lookup failed. Search it by name and choose the right result.');
   $('#place-query').value=q;search(q,{live:false});
 }
}
$('#search-form').addEventListener('submit',event=>{event.preventDefault();clearTimeout(searchTimer);search($('#place-query').value,{live:false})});
$('#place-query').addEventListener('input',()=>{
 const value=$('#place-query').value.trim();
 clearTimeout(searchTimer);
 if(searchController){searchController.abort();searchRequestId++}
 if(value.length<3){if(value.length===0)setEmptySearch('Search for a bank, shop, landmark or address. Add a city above to narrow results.','Your next destination');return}
 searchTimer=setTimeout(()=>search(value,{live:true}),SEARCH_DEBOUNCE_MS);
});
$('#search-location').addEventListener('input',()=>{
 const q=$('#search-location').value.trim();selectedSearchArea=null;$('#selected-search-area').hidden=true;$('#clear-search-location').hidden=!q;clearTimeout(areaTimer);
 if(areaController){areaController.abort();areaRequestId++}
 if(q.length<2){$('#location-suggestions').hidden=true;return}
 areaTimer=setTimeout(()=>searchAreas(q),400);
});
$('#search-location').addEventListener('keydown',event=>{
 if(event.key==='Escape'){$('#location-suggestions').hidden=true;$('#search-location').blur()}
 if(event.key==='Enter'&&!selectedSearchArea){event.preventDefault();searchAreas($('#search-location').value)}
});
$('#clear-search-location').addEventListener('click',clearSearchArea);
document.addEventListener('click',event=>{
 if(!event.target.closest('.search-area-wrap'))$('#location-suggestions').hidden=true;
 if(!event.target.closest('#search-results')&&!event.target.closest('#search-form')&&$('#place-query').value.trim().length<3) return;
});
$$('[data-query]').forEach(b=>b.addEventListener('click',()=>jumpToCity(b.dataset.query)));
$$('.tab').forEach(tab=>tab.addEventListener('click',()=>{$$('.tab').forEach(t=>{const yes=t===tab;t.classList.toggle('active',yes);t.setAttribute('aria-selected',String(yes))});$$('.tool-panel').forEach(p=>{const yes=p.id===tab.dataset.panel;p.classList.toggle('active',yes);p.hidden=!yes})}));
$$('[data-style]').forEach(b=>b.addEventListener('click',()=>{const name=b.dataset.style;if(!STYLES[name]||name===activeStyle)return;activeStyle=name;$$('.style-choice').forEach(t=>t.classList.toggle('active',t===b));setStatusLabel('Loading '+name+' style…');map.setStyle(STYLES[name]);map.once('style.load',()=>{status(name[0].toUpperCase()+name.slice(1)+' style active');if(latestRoute)HarshMaps.drawRoute(map,latestRoute.feature,latestRoute.options);if(is3D)HarshMaps.set3D(map,true);if(placesEnabled)refreshPlacesLayer()})}));
function setStatusLabel(s){status(s)}
$('#toggle-3d').addEventListener('click',()=>{is3D=!is3D;$('#toggle-3d').setAttribute('aria-pressed',String(is3D));const supported=HarshMaps.set3D(map,is3D);status(is3D?'3D perspective enabled':'Flat map view');if(is3D&&!supported)toast('Perspective enabled; this style may not include 3D building geometry.')});
function distance(m){return m>=1000?(m/1000).toFixed(m>=10000?0:1)+' km':Math.round(m)+' m'}
function duration(s){const min=Math.max(1,Math.round(s/60));if(min<60)return min+' min';const h=Math.floor(min/60),r=min%60;return h+' hr'+(r?' '+r+' min':'')}
function instructionText(step,modeLabel='Driving'){
 const maneuver=step.maneuver||{};
 const type=String(maneuver.type||'continue').replace(/_/g,' ');
 const modifier=String(maneuver.modifier||'').replace(/_/g,' ');
 const phrases={depart:'Start '+modeLabel.toLowerCase(),arrive:'Arrive at destination',turn:'Turn',merge:'Merge',fork:'At the fork',continue:'Continue','new name':'Continue','on ramp':'Take the ramp','off ramp':'Exit the ramp','end of road':'At the end of the road',roundabout:'Enter the roundabout',rotary:'Enter the rotary','roundabout turn':'Take the roundabout exit',notification:'Continue'};
 let phrase=phrases[type]||type.charAt(0).toUpperCase()+type.slice(1);
 if(modifier&&type!=='depart'&&type!=='arrive'&&type!=='notification')phrase+=' '+modifier;
 if(step.name)phrase+=' onto '+step.name;
 return phrase;
}
function routeSummary(route,modeLabel='Driving'){
 const box=$('#route-result');box.replaceChildren();
 const summary=document.createElement('div');summary.className='route-summary';
 const heading=document.createElement('div');heading.className='route-summary-head';
 const time=document.createElement('strong');time.textContent=duration(route.duration);
 const subtitle=document.createElement('span');subtitle.textContent='Estimated '+modeLabel.toLowerCase()+' time · public demo router';
 heading.append(time,subtitle);
 const meta=document.createElement('div');meta.className='route-summary-meta';
 [['Route distance',distance(route.distance)],['Travel mode',modeLabel]].forEach(([label,value])=>{
   const stat=document.createElement('div');stat.className='route-stat';
   const small=document.createElement('small');small.textContent=label;
   const strong=document.createElement('strong');strong.textContent=value;
   stat.append(small,strong);meta.append(stat);
 });
 summary.append(heading,meta);box.append(summary);
 const attribution=document.createElement('p');attribution.className='route-attribution';attribution.append(document.createTextNode('Route data: '));const sourceLink=document.createElement('a');sourceLink.href='https://project-osrm.org/';sourceLink.target='_blank';sourceLink.rel='noreferrer';sourceLink.textContent='OSRM';attribution.append(sourceLink,document.createTextNode(' · OpenStreetMap-based public demo. Best-effort only; not guaranteed live navigation.'));box.append(attribution);
 const alternatives=Array.isArray(route.alternatives)?route.alternatives:[];
 if(alternatives.length){
   const altHead=document.createElement('div');altHead.className='steps-heading';altHead.textContent='ALTERNATIVE ROUTES';box.append(altHead);
   const list=document.createElement('div');list.className='route-alternatives';
   [route,...alternatives].forEach((candidate,index)=>{
     const option=document.createElement('button');option.type='button';option.className='route-alternative';
     if(index===0)option.classList.add('active');
     const title=document.createElement('strong');title.textContent=index===0?'Recommended route':('Alternative '+index);
     const details=document.createElement('small');details.textContent=distance(candidate.distance)+' · '+duration(candidate.duration);
     option.append(title,details);
     option.addEventListener('click',()=>{
       $$('.route-alternative').forEach(item=>item.classList.toggle('active',item===option));
       const feature=candidate.feature||{type:'FeatureCollection',features:[{type:'Feature',properties:{distance:candidate.distance,duration:candidate.duration},geometry:candidate.geometry}]};
       HarshMaps.drawRoute(map,feature,{color:'#675bf4',casingColor:'#ffffff'});
       const selectedRoute={...route,distance:candidate.distance,duration:candidate.duration,geometry:candidate.geometry,feature,steps:candidate.steps||route.steps};
       latestRoute={feature,options:{color:'#675bf4',casingColor:'#ffffff'}};
       // Update summary metrics and itinerary to match the chosen path.
       $('#route-result').querySelector('.route-summary-head strong').textContent=duration(selectedRoute.duration);
       const routeStats=$('#route-result').querySelectorAll('.route-stat strong');
       if(routeStats[0])routeStats[0].textContent=distance(selectedRoute.distance);
       const existing=$('#route-result').querySelector('.directions-steps');
       if(existing)existing.remove();
       const existingHeading=Array.from($('#route-result').querySelectorAll('.steps-heading')).find(el=>el.textContent==='ROUTE STEPS');
       if(existingHeading)existingHeading.remove();
       renderRouteSteps(selectedRoute,box,modeLabel);
       const bounds=new maplibregl.LngLatBounds();candidate.geometry.coordinates.forEach(point=>bounds.extend(point));
       map.fitBounds(bounds,{padding:{top:100,right:90,bottom:90,left:90},maxZoom:15,duration:700});
     });
     list.append(option);
   });
   box.append(list);
 }
 renderRouteSteps(route,box,modeLabel);
}
function renderRouteSteps(route,box,modeLabel='Driving'){
 const steps=Array.isArray(route.steps)?route.steps:[];
 if(!steps.length)return;
 const heading=document.createElement('div');heading.className='steps-heading';heading.textContent='ROUTE STEPS';box.append(heading);
 const list=document.createElement('ol');list.className='directions-steps';
 steps.slice(0,40).forEach((step,index)=>{
   const row=document.createElement('li');const number=document.createElement('span');number.className='step-number';number.textContent=String(index+1);
   const body=document.createElement('span');body.className='step-copy';
   const title=document.createElement('strong');title.textContent=instructionText(step,modeLabel);
   const detail=document.createElement('small');detail.textContent=distance(step.distance||0)+(step.duration?' · '+duration(step.duration):'');
   body.append(title,detail);row.append(number,body);list.append(row);
 });
 box.append(list);
}

function parsePinnedLocation(input){const m=String(input||'').trim().match(/^@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);if(!m)return null;const lat=Number(m[1]),lon=Number(m[2]);if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180)throw Error('Coordinates must use @latitude, longitude with latitude in ±90 and longitude in ±180.');return{id:'coordinate:'+lat+','+lon,name:'Pinned coordinates',label:lat.toFixed(5)+', '+lon.toFixed(5),coordinates:[lon,lat],city:'',country:''}}
const routeSelections={from:null,to:null};
const routeSearchState={
 from:{timer:null,controller:null,requestId:0},
 to:{timer:null,controller:null,requestId:0}
};
function hideRouteSuggestions(field){
 const box=$('#route-'+field+'-suggestions');box.hidden=true;box.replaceChildren();
}
function showRouteSuggestions(field,places,message=''){
 const box=$('#route-'+field+'-suggestions');box.replaceChildren();
 if(!places.length){
   if(message){const empty=document.createElement('div');empty.className='suggestions-message';empty.textContent=message;box.append(empty);box.hidden=false}
   else box.hidden=true;
   return;
 }
 places.forEach(place=>{
   const btn=document.createElement('button');btn.type='button';btn.className='route-suggestion';
   const icon=document.createElement('span');icon.className='route-suggestion-icon';icon.textContent='⌖';
   const copy=document.createElement('span');copy.className='route-suggestion-copy';
   const name=document.createElement('strong');name.textContent=place.name||place.label;
   const address=document.createElement('small');address.textContent=placeContext(place)||place.label||'Place result';
   copy.append(name,address);btn.append(icon,copy);
   btn.addEventListener('click',()=>{
     routeSelections[field]=place;
     $('#route-'+field).value=place.label||place.name;
     hideRouteSuggestions(field);
     status((field==='from'?'Start':'Destination')+' selected: '+(place.name||place.label));
   });
   box.append(btn);
 });
 box.hidden=false;
}
async function searchRouteSuggestions(field,query){
 const state=routeSearchState[field];
 if(state.controller)state.controller.abort();
 state.controller=new AbortController();const requestId=++state.requestId;
 const input=$('#route-'+field);
 const box=$('#route-'+field+'-suggestions');
 const current=map.getCenter();
 const selectedOrigin=routeSelections.from&&field==='to'?routeSelections.from.coordinates:null;
 const bias=selectedOrigin||[current.lng,current.lat];
 box.replaceChildren();const wait=document.createElement('div');wait.className='suggestions-message';wait.textContent='Finding matching places…';box.append(wait);box.hidden=false;
 try{
   const places=await HarshMaps.searchPlaces(query,{baseUrl:HarshMaps.providers.photon,limit:6,lat:bias[1],lon:bias[0],zoom:11,locationBiasScale:0.35,signal:state.controller.signal});
   if(requestId!==state.requestId||input.value.trim()!==query)return;
   showRouteSuggestions(field,places,places.length?'':'No matches. Try adding a city, state or street.');
 }catch(error){
   if(error&&error.name==='AbortError')return;
   if(requestId!==state.requestId)return;
   showRouteSuggestions(field,[],'Suggestions unavailable. Check the location text and try again.');
 }
}
['from','to'].forEach(field=>{
 $('#route-'+field).addEventListener('input',()=>{
   routeSelections[field]=null;
   const state=routeSearchState[field];clearTimeout(state.timer);
   if(state.controller)state.controller.abort();
   const query=$('#route-'+field).value.trim();
   if(query.length<3||query.startsWith('@')){hideRouteSuggestions(field);return}
   state.timer=setTimeout(()=>searchRouteSuggestions(field,query),420);
 });
 $('#route-'+field).addEventListener('focus',()=>{
   const query=$('#route-'+field).value.trim();
   if(query.length>=3&&!routeSelections[field])searchRouteSuggestions(field,query);
 });
 $('#route-'+field).addEventListener('keydown',event=>{
   if(event.key==='Escape')hideRouteSuggestions(field);
 });
});
document.addEventListener('click',event=>{
 if(!event.target.closest('#route-form')){hideRouteSuggestions('from');hideRouteSuggestions('to')}
});
async function resolveRouteEndpoint(field,text){
 const pinned=parsePinnedLocation(text);
 if(pinned)return pinned;
 const selected=routeSelections[field];
 if(selected&&(text===selected.label||text===selected.name))return selected;
 const c=map.getCenter();
 const places=await HarshMaps.searchPlaces(text,{baseUrl:HarshMaps.providers.photon,limit:6,lat:c.lat,lon:c.lng,zoom:11,locationBiasScale:0.35});
 if(!places.length)throw Error('Could not find '+(field==='from'?'the starting point':'the destination')+'. Try a full address or add a city.');
 if(places.length===1)return places[0];
 showRouteSuggestions(field,places);
 throw Error('Choose the exact '+(field==='from'?'starting point':'destination')+' from the suggestions. This prevents routing to the wrong city.');
}
$('#route-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const fromText=$('#route-from').value.trim(),toText=$('#route-to').value.trim();
 if(!fromText||!toText){toast('Add both a start and a destination.');return}
 const button=$('#route-submit');button.disabled=true;button.textContent='Finding route…';
 const result=$('#route-result');result.replaceChildren();
 const loading=document.createElement('div');loading.className='route-note';
 const loadingIcon=document.createElement('b');loadingIcon.textContent='↗';
 const loadingText=document.createElement('div');const loadingTitle=document.createElement('strong');loadingTitle.textContent='Planning your trip';
 const loadingCopy=document.createElement('p');loadingCopy.textContent='Resolving selected places and requesting driving directions.';
 loadingText.append(loadingTitle,loadingCopy);loading.append(loadingIcon,loadingText);result.append(loading);status('Planning route…');
 try{
   const origin=await resolveRouteEndpoint('from',fromText);
   const destination=await resolveRouteEndpoint('to',toText);
   const mode=ROUTING_MODES[$('#route-mode').value]||ROUTING_MODES.driving;
   const route=await HarshMaps.getRoute(origin.coordinates,destination.coordinates,{baseUrl:mode.baseUrl,profile:mode.profile,alternatives:true});
   clearMarkers(searchMarkers);clearMarkers(routeMarkers);
   marker(origin,false,true);marker(destination,true,true);
   HarshMaps.drawRoute(map,route.feature,{color:'#675bf4',casingColor:'#ffffff'});
   latestRoute={feature:route.feature,options:{color:'#675bf4',casingColor:'#ffffff'}};
   const bounds=new maplibregl.LngLatBounds();route.geometry.coordinates.forEach(point=>bounds.extend(point));
   map.fitBounds(bounds,{padding:{top:100,right:90,bottom:90,left:90},maxZoom:15,duration:1000});
   labelView('Route preview',(origin.name||origin.label)+' → '+(destination.name||destination.label));
   routeSummary(route,mode.label);status('Route ready · '+mode.label.toLowerCase()+' directions');
 }catch(error){
   result.replaceChildren();
   const note=document.createElement('div');note.className='route-note';
   const icon=document.createElement('b');icon.textContent='!';
   const copy=document.createElement('div');const title=document.createElement('strong');title.textContent='Route not ready';
   const message=document.createElement('p');message.textContent=error&&error.message?error.message:'The routing service could not calculate a route.';
   copy.append(title,message);note.append(icon,copy);result.append(note);status('Route needs attention',true);
 }finally{button.disabled=false;button.innerHTML='Find route <span>→</span>'}
});
$('#swap-route').addEventListener('click',()=>{const from=$('#route-from').value,to=$('#route-to').value;$('#route-from').value=to;$('#route-to').value=from;const selected=routeSelections.from;routeSelections.from=routeSelections.to;routeSelections.to=selected;hideRouteSuggestions('from');hideRouteSuggestions('to')});
function locate(asRouteStart){if(!navigator.geolocation){toast('Geolocation is not supported by this browser.');return}status('Requesting device location…');navigator.geolocation.getCurrentPosition(pos=>{const c=[pos.coords.longitude,pos.coords.latitude];map.flyTo({center:c,zoom:15,speed:1.2,essential:true});if(asRouteStart){$('#route-from').value='@'+c[1].toFixed(5)+', '+c[0].toFixed(5);if(typeof routeSelections!=='undefined')routeSelections.from=null;if(typeof hideRouteSuggestions==='function')hideRouteSuggestions('from');toast('Current coordinates added as route start.')}else{clearMarkers(searchMarkers);marker({coordinates:c,name:'Your location'});labelView('Your location','DEVICE LOCATION · PERMISSION GRANTED')}status('Location found')},()=>{status('Location permission unavailable',true);toast('Could not access location. Check browser permissions.')},{enableHighAccuracy:true,timeout:10000})}
$('#use-current-location').addEventListener('click',()=>locate(true));$('#locate-me').addEventListener('click',()=>locate(false));
$('#reset-view').addEventListener('click',()=>{map.flyTo({center:START.center,zoom:START.zoom,bearing:0,pitch:0,speed:1.15});clearMarkers(searchMarkers);clearMarkers(routeMarkers);latestRoute=null;HarshMaps.clearRoute(map);labelView('Mumbai, India');status('Map view reset')});
$('#mobile-menu').addEventListener('click',()=>{const open=$('#control-panel').classList.toggle('open');$('#mobile-menu').setAttribute('aria-expanded',String(open))});
$('#copy-snippet').addEventListener('click',async()=>{const snippet='<div id="map" style="height:420px"></div>\n<script type="module">\n  import * as ml from "https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs";\n  import { HarshMaps } from "https://cdn.jsdelivr.net/gh/harshyadavv2456/HarshMaps@main/sdk/harshmaps.js";\n  HarshMaps.createMap(ml, "map", { style: HarshMaps.styles.liberty });\n</script>';try{await navigator.clipboard.writeText(snippet);$('#copy-snippet').textContent='Copied ✓';setTimeout(()=>$('#copy-snippet').textContent='Copy snippet ⧉',1800)}catch{toast('Clipboard blocked. Copy the snippet from the code panel.')}});
// Universal integration builder: generate copy/paste iframe or a direct browser SDK example.
const embedOptionsForm = $('#embed-options');
if (embedOptionsForm) {
  let embedMode = 'iframe';
  let lastPreviewUrl = '';
  function buildEmbedConfig() {
    const coords = $('#embed-center').value.split(',').map(Number);
    return {
      lat: coords[0], lng: coords[1],
      style: $('#embed-style').value,
      zoom: Number($('#embed-zoom').value),
      height: Number($('#embed-height').value),
      search: $('#embed-search-enabled').checked,
      locate: $('#embed-locate-enabled').checked,
      marker: $('#embed-marker-enabled').checked,
      places: $('#embed-places-enabled').checked,
      label: $('#embed-label').value.trim().slice(0, 120)
    };
  }
  function makeEmbedUrl(c) {
    const url = new URL('./embed.html', window.location.href);
    const p = new URLSearchParams();
    p.set('lat', String(c.lat));
    p.set('lng', String(c.lng));
    p.set('zoom', String(c.zoom));
    p.set('style', c.style);
    p.set('search', String(c.search));
    p.set('locate', String(c.locate));
    p.set('marker', String(c.marker));
    p.set('places', String(c.places));
    p.set('controls', 'true');
    if (c.marker && c.label) p.set('label', c.label);
    url.search = p.toString();
    return url.href;
  }
  function iframeExample(c, url) {
    const safeUrl = url.replace(/&/g, '&amp;');
    return '<iframe title="HarshMaps interactive map" src="' + safeUrl +
      '" width="100%" height="' + c.height +
      '" style="border:0;border-radius:12px;overflow:hidden" loading="lazy" allow="geolocation" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
  }
  function sdkExample(c) {
    const label = JSON.stringify(c.label || 'Pinned location');
    const searchMarkup = c.search
      ? '<form id="harshmaps-search" style="display:flex;gap:8px;margin-bottom:8px"><input id="harshmaps-query" placeholder="Search a place" style="flex:1;min-width:0;padding:9px;border:1px solid #d7dbe4;border-radius:6px"><button style="padding:9px 12px">Search</button></form>\n'
      : '';
    const markerCode = c.marker
      ? "map.once('load', () => HarshMaps.addMarker(maplibregl, map, [" + c.lng + ', ' + c.lat + "], { label: " + label + " }));\n"
      : '';
    const locateCode = c.locate
      ? "map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right');\n"
      : '';
    const placesCode = c.places
      ? "import { Protocol } from 'https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/+esm';\n" +
        "import { addOverturePlaces, bindOverturePlacePopups } from 'https://cdn.jsdelivr.net/gh/harshyadavv2456/HarshMaps@main/sdk/places-layer.js';\n" +
        "const pmtilesProtocol = new Protocol();\nmaplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);\n" +
        "map.once('load', async () => { try { const response = await fetch('https://harshyadavv2456.github.io/HarshMaps/data/overture-release.json', { cache: 'no-store' }); if (!response.ok) throw new Error('Places release metadata unavailable'); const metadata = await response.json(); addOverturePlaces(map, metadata.release); bindOverturePlacePopups(map, maplibregl); } catch (error) { console.warn('HarshMaps places layer unavailable', error); } });\n"
      : '';
    const searchCode = c.search
      ? "document.getElementById('harshmaps-search').addEventListener('submit', async (event) => {\n  event.preventDefault();\n  try {\n    const places = await HarshMaps.searchPlaces(document.getElementById('harshmaps-query').value);\n    if (places[0]) { map.flyTo({ center: places[0].coordinates, zoom: 14 }); HarshMaps.addMarker(maplibregl, map, places[0].coordinates, { label: places[0].name }); }\n  } catch (error) { console.error('HarshMaps search failed', error); }\n});\n"
      : '';
    return '<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.css">\n' +
      searchMarkup + '<div id="harshmaps-map" style="width:100%;height:' + c.height + 'px"></div>\n' +
      '<script type="module">\n' +
      "import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs';\n" +
      "import { HarshMaps } from 'https://cdn.jsdelivr.net/gh/harshyadavv2456/HarshMaps@main/sdk/harshmaps.js';\n" +
      "const map = HarshMaps.createMap(maplibregl, 'harshmaps-map', { style: HarshMaps.styles." + c.style +
      ', center: [' + c.lng + ', ' + c.lat + '], zoom: ' + c.zoom + ' });\n' +
      markerCode + locateCode + placesCode + searchCode + '</script>';
  }
  function updateEmbedBuilder() {
    const c = buildEmbedConfig();
    const url = makeEmbedUrl(c);
    if (url !== lastPreviewUrl) {
      $('#embed-preview').src = url;
      lastPreviewUrl = url;
    }
    $('#embed-preview').style.height = c.height + 'px';
    $('#embed-preview-title').textContent = $('#embed-center').selectedOptions[0].textContent.split(',')[0] + ' · ' + c.style[0].toUpperCase() + c.style.slice(1);
    $('#integration-code').textContent = embedMode === 'iframe' ? iframeExample(c, url) : sdkExample(c);
    $('#integration-code-language').textContent = embedMode === 'iframe' ? 'HTML · iframe' : 'JavaScript · ESM';
    $('#integration-code-note').textContent = embedMode === 'iframe'
      ? 'Best for WordPress, static pages, landing pages, and any platform that accepts an iframe. In mobile apps, load this same HTTPS URL in a WebView.'
      : 'For a custom web app using ES modules. The Places option adds the global Overture preview layer. For Next.js/Vite/React, install MapLibre through npm and copy the SDK into your source for a production build.';
  }
  embedOptionsForm.addEventListener('change', updateEmbedBuilder);
  $$('[data-builder-mode]').forEach((button) => button.addEventListener('click', () => {
    embedMode = button.dataset.builderMode;
    $$('[data-builder-mode]').forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    updateEmbedBuilder();
  }));
  $('#copy-integration').addEventListener('click', async () => {
    const code = $('#integration-code').textContent;
    try {
      await navigator.clipboard.writeText(code);
      $('#copy-integration').textContent = 'Copied ✓';
      setTimeout(() => { $('#copy-integration').textContent = 'Copy code ⧉'; }, 1800);
    } catch (error) {
      toast('Clipboard access was blocked. Select the code above and copy it manually.');
    }
  });
  updateEmbedBuilder();
}


// Overture Places: a global vector-tile overlay. The public source is an
// experimental inspection tileset, not a production SLA-backed service.
function placesStatus(message, warning = false) {
  const row = $('#places-layer-status');
  if (!row) return;
  row.querySelector('span').textContent = message;
  row.classList.toggle('warning', warning);
}
async function fetchPlacesRelease() {
  const url = new URL('./data/overture-release.json', import.meta.url);
  url.searchParams.set('check', String(Date.now()));
  const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Release metadata returned HTTP ' + response.status);
  const metadata = await response.json();
  if (!validOvertureRelease(metadata.release)) throw new Error('The Overture release metadata is invalid.');
  return metadata;
}
async function refreshPlacesLayer() {
  if (!placesEnabled) return;
  placesStatus('Checking the current Overture places release…');
  try {
    const metadata = await fetchPlacesRelease();
    if (placesRelease === metadata.release && map.getLayer('harshmaps-overture-place-dots') && map.getLayer('harshmaps-overture-place-labels')) {
      setOverturePlaceCategory(map, placesCategory);
      setOverturePlacesVisible(map, true);
      placesStatus('Global places layer active · Overture ' + metadata.release);
      return;
    }
    await ensurePmtilesProtocol();
    addOverturePlaces(map, metadata.release, { category: placesCategory, visible: true });
    if (!placesLayerBound) {
      bindOverturePlacePopups(map, maplibregl);
      placesLayerBound = true;
    }
    placesRelease = metadata.release;
    placesStatus('Global places layer active · Overture ' + metadata.release);
  } catch (error) {
    placesStatus('Places data could not load: ' + (error && error.message ? error.message : 'unknown error') + '. The base map still works.', true);
  }
}
$('#toggle-places-layer').addEventListener('click', () => {
  placesEnabled = !placesEnabled;
  $('#toggle-places-layer').setAttribute('aria-pressed', String(placesEnabled));
  if (placesEnabled) {
    refreshPlacesLayer();
  } else {
    setOverturePlacesVisible(map, false);
    placesStatus('Places hidden. The basemap and search remain available.');
  }
});
$('#places-category').addEventListener('change', () => {
  placesCategory = $('#places-category').value;
  setOverturePlaceCategory(map, placesCategory);
  if (placesEnabled) refreshPlacesLayer();
});
setInterval(() => {
  if (placesEnabled) refreshPlacesLayer();
}, 15 * 60 * 1000);
