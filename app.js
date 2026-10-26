import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs';
import { HarshMaps } from './sdk/harshmaps.js';
import { Protocol } from 'https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/+esm';
import { addOverturePlaces, bindOverturePlacePopups, validOvertureRelease, setOverturePlaceCategory, setOverturePlacesVisible } from './sdk/places-layer.js';
const pmtilesProtocol = new Protocol();
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
const STYLES=HarshMaps.styles, START={center:[72.8777,19.076],zoom:10.2};
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
     status('Showing '+(place.name||place.label));
     $$('.result-card').forEach(item=>item.removeAttribute('aria-current'));btn.setAttribute('aria-current','true');
     if(innerWidth<=760){$('#control-panel').classList.remove('open');$('#mobile-menu').setAttribute('aria-expanded','false')}
   });
   box.append(btn);
 });
 const note=document.createElement('div');note.className='search-results-note';
 note.textContent=selectedSearchArea
   ? 'Showing matches biased to '+(selectedSearchArea.name||selectedSearchArea.label)+'. Choose a specific branch or landmark above.'
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
   showResults(places,{message:places.length?'':'No matches'});
   if(!places.length){status('No matching places');return}
   status(places.length+' match'+(places.length===1?'':'es')+' · select a result');
 }catch(error){
   if(error&&error.name==='AbortError')return;
   if(requestId!==searchRequestId)return;
   showResults([],{message:'The public place-search service is unavailable right now. Please try again.'});
   status('Search provider unavailable',true);
 }
}
$('#search-form').addEventListener('submit',event=>{event.preventDefault();clearTimeout(searchTimer);search($('#place-query').value,{live:false})});
$('#place-query').addEventListener('input',()=>{
 const value=$('#place-query').value.trim();
 clearTimeout(searchTimer);
 if(searchController)searchController.abort();
 if(value.length<3){if(value.length===0)setEmptySearch('Search for a bank, shop, landmark or address. Add a city above to narrow results.','Your next destination');return}
 searchTimer=setTimeout(()=>search(value,{live:true}),SEARCH_DEBOUNCE_MS);
});
$('#search-location').addEventListener('input',()=>{
 const q=$('#search-location').value.trim();selectedSearchArea=null;$('#selected-search-area').hidden=true;$('#clear-search-location').hidden=!q;clearTimeout(areaTimer);
 if(areaController)areaController.abort();
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
$$('[data-query]').forEach(b=>b.addEventListener('click',()=>search(b.dataset.query)));
$$('.tab').forEach(tab=>tab.addEventListener('click',()=>{$$('.tab').forEach(t=>{const yes=t===tab;t.classList.toggle('active',yes);t.setAttribute('aria-selected',String(yes))});$$('.tool-panel').forEach(p=>{const yes=p.id===tab.dataset.panel;p.classList.toggle('active',yes);p.hidden=!yes})}));
$$('[data-style]').forEach(b=>b.addEventListener('click',()=>{const name=b.dataset.style;if(!STYLES[name]||name===activeStyle)return;activeStyle=name;$$('.style-choice').forEach(t=>t.classList.toggle('active',t===b));setStatusLabel('Loading '+name+' style…');map.setStyle(STYLES[name]);map.once('style.load',()=>{status(name[0].toUpperCase()+name.slice(1)+' style active');if(latestRoute)HarshMaps.drawRoute(map,latestRoute.feature,latestRoute.options);if(is3D)HarshMaps.set3D(map,true);if(placesEnabled)refreshPlacesLayer()})}));
function setStatusLabel(s){status(s)}
$('#toggle-3d').addEventListener('click',()=>{is3D=!is3D;$('#toggle-3d').setAttribute('aria-pressed',String(is3D));const supported=HarshMaps.set3D(map,is3D);status(is3D?'3D perspective enabled':'Flat map view');if(is3D&&!supported)toast('Perspective enabled; this style may not include 3D building geometry.')});
function distance(m){return m>=1000?(m/1000).toFixed(m>=10000?0:1)+' km':Math.round(m)+' m'}
function duration(s){const min=Math.max(1,Math.round(s/60));if(min<60)return min+' min';const h=Math.floor(min/60),r=min%60;return h+' hr'+(r?' '+r+' min':'')}
function instructionText(step){const m=step.maneuver||{},type=String(m.type||'continue').replace(/_/g,' '),modifier=String(m.modifier||'').replace(/_/g,' ');const phrases={depart:'Start driving',arrive:'Arrive at destination',turn:'Turn',merge:'Merge',fork:'At the fork',continue:'Continue','new name':'Continue','on ramp':'Take the ramp','off ramp':'Exit the ramp','end of road':'At the end of the road',roundabout:'Enter the roundabout',rotary:'Enter the rotary','roundabout turn':'Take the roundabout exit',notification:'Continue'};let phrase=phrases[type]||type.charAt(0).toUpperCase()+type.slice(1);if(modifier&&type!=='depart'&&type!=='arrive'&&type!=='notification')phrase+=' '+modifier;if(step.name)phrase+=' onto '+step.name;return phrase}
function routeSummary(route){const box=$('#route-result');box.replaceChildren();const w=document.createElement('div');w.className='route-summary';const h=document.createElement('div');h.className='route-summary-head';const d=document.createElement('strong');d.textContent=duration(route.duration);const sub=document.createElement('span');sub.textContent='Estimated driving time · demo router';h.append(d,sub);const meta=document.createElement('div');meta.className='route-summary-meta';[['Route distance',distance(route.distance)],['Travel mode','Driving']].forEach(([t,v])=>{const stat=document.createElement('div');stat.className='route-stat';const small=document.createElement('small');small.textContent=t;const strong=document.createElement('strong');strong.textContent=v;stat.append(small,strong);meta.append(stat)});w.append(h,meta);box.append(w);const steps=Array.isArray(route.steps)?route.steps:[];if(steps.length){const heading=document.createElement('div');heading.className='steps-heading';heading.textContent='ROUTE STEPS';box.append(heading);const list=document.createElement('ol');list.className='directions-steps';steps.slice(0,40).forEach((step,index)=>{const row=document.createElement('li');const number=document.createElement('span');number.className='step-number';number.textContent=String(index+1);const body=document.createElement('span');body.className='step-copy';const title=document.createElement('strong');title.textContent=instructionText(step);const detail=document.createElement('small');detail.textContent=distance(step.distance||0)+(step.duration?' · '+duration(step.duration):'');body.append(title,detail);row.append(number,body);list.append(row)});box.append(list)}}
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
   const route=await HarshMaps.getRoute(origin.coordinates,destination.coordinates,{baseUrl:HarshMaps.providers.osrm,profile:'driving',alternatives:true});
   clearMarkers(searchMarkers);clearMarkers(routeMarkers);
   marker(origin,false,true);marker(destination,true,true);
   HarshMaps.drawRoute(map,route.feature,{color:'#675bf4',casingColor:'#ffffff'});
   latestRoute={feature:route.feature,options:{color:'#675bf4',casingColor:'#ffffff'}};
   const bounds=new maplibregl.LngLatBounds();route.geometry.coordinates.forEach(point=>bounds.extend(point));
   map.fitBounds(bounds,{padding:{top:100,right:90,bottom:90,left:90},maxZoom:15,duration:1000});
   labelView('Route preview',(origin.name||origin.label)+' → '+(destination.name||destination.label));
   routeSummary(route);status('Route ready · driving directions');
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
map.on('load',()=>{$('#map-loader').classList.add('hidden');status('Connected · OpenFreeMap vector tiles');updateZoom();map.addControl(new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:false,showUserHeading:true}),'top-right');refreshPlacesLayer()});
map.on('zoom',updateZoom);map.on('error',e=>{if(e&&e.error&&!map.loaded())status('Waiting for map service…',true)});

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
