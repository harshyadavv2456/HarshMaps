import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs';
import { HarshMaps } from './sdk/harshmaps.js';
const STYLES=HarshMaps.styles, START={center:[72.8777,19.076],zoom:10.2};
const map=HarshMaps.createMap(maplibregl,'map',{style:STYLES.liberty,center:START.center,zoom:START.zoom,maxZoom:20,minZoom:2,attributionControl:{compact:true}});
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
let searchMarkers=[],routeMarkers=[],latestRoute=null,is3D=false,activeStyle='liberty',toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200)}
function status(message,warning=false){$('#map-status').textContent=message;$('#map-health-dot').classList.toggle('warning',warning)}
function updateZoom(){$('#zoom-status').textContent='ZOOM '+map.getZoom().toFixed(1)}
function labelView(title,subtitle){$('#view-title').textContent=title;$('#view-subtitle').textContent=subtitle||'VECTOR MAP · LIVE TILES'}
function clearMarkers(list){list.forEach(marker=>marker.remove());list.length=0}
function marker(place,destination=false,routeMarker=false){const m=HarshMaps.addMarker(maplibregl,map,place.coordinates,{color:destination?'#202434':'#675bf4',label:place.name});(routeMarker||destination?routeMarkers:searchMarkers).push(m);return m}
function showResults(places){
 const box=$('#search-results');box.replaceChildren();$('#result-count').textContent=String(places.length).padStart(2,'0');
 if(!places.length){const empty=document.createElement('div');empty.className='empty';const icon=document.createElement('b');icon.textContent='⌕';const title=document.createElement('strong');title.textContent='No matching places';const help=document.createElement('span');help.textContent='Try a more specific name, nearby city, or address.';empty.append(icon,title,help);box.append(empty);return}
 places.forEach(place=>{const btn=document.createElement('button');btn.type='button';btn.className='result-card';const pin=document.createElement('span');pin.className='result-pin';pin.textContent='⌖';const text=document.createElement('span');text.className='result-text';const name=document.createElement('strong');name.textContent=place.name||place.label;const meta=document.createElement('small');meta.textContent=place.label||[place.city,place.state,place.country].filter(Boolean).join(', ');text.append(name,meta);const arrow=document.createElement('span');arrow.className='result-arrow';arrow.textContent='↗';btn.append(pin,text,arrow);btn.addEventListener('click',()=>{clearMarkers(searchMarkers);marker(place);map.flyTo({center:place.coordinates,zoom:14,speed:1.15,essential:true});labelView(place.name||'Selected place',(place.city||place.country||'SEARCH RESULT').toUpperCase());if(innerWidth<=760){$('#control-panel').classList.remove('open');$('#mobile-menu').setAttribute('aria-expanded','false')}});box.append(btn)})
}
async function search(query){
 const q=String(query||'').trim();if(q.length<2){toast('Enter at least two characters to search.');return}
 $('#place-query').value=q;$('#result-count').textContent='…';$('#search-results').innerHTML='<div class="empty"><strong>Searching places…</strong><span>Querying the configured geocoder.</span></div>';status('Searching places…');
 try{const c=map.getCenter(),places=await HarshMaps.searchPlaces(q,{baseUrl:HarshMaps.providers.photon,limit:6,lat:c.lat,lon:c.lng});showResults(places);if(!places.length){status('No matching places');toast('No matching places. Try another query.');return}clearMarkers(searchMarkers);places.forEach(p=>marker(p));const p=places[0];map.flyTo({center:p.coordinates,zoom:12.5,speed:1.08,essential:true});labelView(p.name||q,(p.city||p.country||'SEARCH RESULT').toUpperCase());status(places.length+' place'+(places.length===1?'':'s')+' found')}
 catch(e){showResults([]);status('Search provider unavailable',true);toast(e.message||'Place search failed. Try again.')}
}
$('#search-form').addEventListener('submit',e=>{e.preventDefault();search($('#place-query').value)});
$$('[data-query]').forEach(b=>b.addEventListener('click',()=>search(b.dataset.query)));
$$('.tab').forEach(tab=>tab.addEventListener('click',()=>{$$('.tab').forEach(t=>{const yes=t===tab;t.classList.toggle('active',yes);t.setAttribute('aria-selected',String(yes))});$$('.tool-panel').forEach(p=>{const yes=p.id===tab.dataset.panel;p.classList.toggle('active',yes);p.hidden=!yes})}));
$$('[data-style]').forEach(b=>b.addEventListener('click',()=>{const name=b.dataset.style;if(!STYLES[name]||name===activeStyle)return;activeStyle=name;$$('.style-choice').forEach(t=>t.classList.toggle('active',t===b));setStatusLabel('Loading '+name+' style…');map.setStyle(STYLES[name]);map.once('style.load',()=>{status(name[0].toUpperCase()+name.slice(1)+' style active');if(latestRoute)HarshMaps.drawRoute(map,latestRoute.feature,latestRoute.options);if(is3D)HarshMaps.set3D(map,true)})}));
function setStatusLabel(s){status(s)}
$('#toggle-3d').addEventListener('click',()=>{is3D=!is3D;$('#toggle-3d').setAttribute('aria-pressed',String(is3D));const supported=HarshMaps.set3D(map,is3D);status(is3D?'3D perspective enabled':'Flat map view');if(is3D&&!supported)toast('Perspective enabled; this style may not include 3D building geometry.')});
function distance(m){return m>=1000?(m/1000).toFixed(m>=10000?0:1)+' km':Math.round(m)+' m'}
function duration(s){const min=Math.max(1,Math.round(s/60));if(min<60)return min+' min';const h=Math.floor(min/60),r=min%60;return h+' hr'+(r?' '+r+' min':'')}
function instructionText(step){const m=step.maneuver||{},type=String(m.type||'continue').replace(/_/g,' '),modifier=String(m.modifier||'').replace(/_/g,' ');const phrases={depart:'Start driving',arrive:'Arrive at destination',turn:'Turn',merge:'Merge',fork:'At the fork',continue:'Continue','new name':'Continue','on ramp':'Take the ramp','off ramp':'Exit the ramp','end of road':'At the end of the road',roundabout:'Enter the roundabout',rotary:'Enter the rotary','roundabout turn':'Take the roundabout exit',notification:'Continue'};let phrase=phrases[type]||type.charAt(0).toUpperCase()+type.slice(1);if(modifier&&type!=='depart'&&type!=='arrive'&&type!=='notification')phrase+=' '+modifier;if(step.name)phrase+=' onto '+step.name;return phrase}
function routeSummary(route){const box=$('#route-result');box.replaceChildren();const w=document.createElement('div');w.className='route-summary';const h=document.createElement('div');h.className='route-summary-head';const d=document.createElement('strong');d.textContent=duration(route.duration);const sub=document.createElement('span');sub.textContent='Estimated driving time · demo router';h.append(d,sub);const meta=document.createElement('div');meta.className='route-summary-meta';[['Route distance',distance(route.distance)],['Travel mode','Driving']].forEach(([t,v])=>{const stat=document.createElement('div');stat.className='route-stat';const small=document.createElement('small');small.textContent=t;const strong=document.createElement('strong');strong.textContent=v;stat.append(small,strong);meta.append(stat)});w.append(h,meta);box.append(w);const steps=Array.isArray(route.steps)?route.steps:[];if(steps.length){const heading=document.createElement('div');heading.className='steps-heading';heading.textContent='ROUTE STEPS';box.append(heading);const list=document.createElement('ol');list.className='directions-steps';steps.slice(0,40).forEach((step,index)=>{const row=document.createElement('li');const number=document.createElement('span');number.className='step-number';number.textContent=String(index+1);const body=document.createElement('span');body.className='step-copy';const title=document.createElement('strong');title.textContent=instructionText(step);const detail=document.createElement('small');detail.textContent=distance(step.distance||0)+(step.duration?' · '+duration(step.duration):'');body.append(title,detail);row.append(number,body);list.append(row)});box.append(list)}}
function parsePinnedLocation(input){const m=String(input||'').trim().match(/^@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);if(!m)return null;const lat=Number(m[1]),lon=Number(m[2]);if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180)throw Error('Coordinates must use @latitude, longitude with latitude in ±90 and longitude in ±180.');return{id:'coordinate:'+lat+','+lon,name:'Pinned coordinates',label:lat.toFixed(5)+', '+lon.toFixed(5),coordinates:[lon,lat],city:'',country:''}}
async function findPlace(q,c){const pinned=parsePinnedLocation(q);if(pinned)return[pinned];return HarshMaps.searchPlaces(q,{baseUrl:HarshMaps.providers.photon,limit:1,lat:c.lat,lon:c.lng})}
$('#route-form').addEventListener('submit',async e=>{e.preventDefault();const from=$('#route-from').value.trim(),to=$('#route-to').value.trim();if(!from||!to){toast('Add both a start and a destination.');return}const btn=$('#route-submit');btn.disabled=true;btn.innerHTML='Finding route…';$('#route-result').innerHTML='<div class="route-note"><b>↗</b><div><strong>Planning your trip</strong><p>Resolving places and requesting the route.</p></div></div>';status('Planning route…');
 try{const c=map.getCenter(),o=(await findPlace(from,c))[0];if(!o)throw Error('Could not find the starting point: '+from);await new Promise(r=>setTimeout(r,1100));const d=(await findPlace(to,c))[0];if(!d)throw Error('Could not find the destination: '+to);const route=await HarshMaps.getRoute(o.coordinates,d.coordinates,{baseUrl:HarshMaps.providers.osrm,profile:'driving',alternatives:true});clearMarkers(searchMarkers);clearMarkers(routeMarkers);marker(o,false,true);marker(d,true,true);HarshMaps.drawRoute(map,route.feature,{color:'#675bf4',casingColor:'#ffffff'});latestRoute={feature:route.feature,options:{color:'#675bf4',casingColor:'#ffffff'}};const bounds=new maplibregl.LngLatBounds();route.geometry.coordinates.forEach(p=>bounds.extend(p));map.fitBounds(bounds,{padding:{top:100,right:90,bottom:90,left:90},maxZoom:15,duration:1000});labelView('Route preview',(o.name+' → '+d.name).toUpperCase());routeSummary(route);status('Route ready · demo routing data')}
 catch(err){$('#route-result').replaceChildren();const note=document.createElement('div');note.className='route-note';const icon=document.createElement('b');icon.textContent='!';const text=document.createElement('div');const strong=document.createElement('strong');strong.textContent='Route unavailable';const p=document.createElement('p');p.textContent=err.message||'The routing service could not calculate a route.';text.append(strong,p);note.append(icon,text);$('#route-result').append(note);status('Routing provider unavailable',true);toast('The public routing demo may be busy or unsupported for this area.')}
 finally{btn.disabled=false;btn.innerHTML='Find route <span>→</span>'}});
$('#swap-route').addEventListener('click',()=>{const x=$('#route-from').value;$('#route-from').value=$('#route-to').value;$('#route-to').value=x});
function locate(asRouteStart){if(!navigator.geolocation){toast('Geolocation is not supported by this browser.');return}status('Requesting device location…');navigator.geolocation.getCurrentPosition(pos=>{const c=[pos.coords.longitude,pos.coords.latitude];map.flyTo({center:c,zoom:15,speed:1.2,essential:true});if(asRouteStart){$('#route-from').value='@'+c[1].toFixed(5)+', '+c[0].toFixed(5);toast('Current coordinates added as route start.')}else{clearMarkers(searchMarkers);marker({coordinates:c,name:'Your location'});labelView('Your location','DEVICE LOCATION · PERMISSION GRANTED')}status('Location found')},()=>{status('Location permission unavailable',true);toast('Could not access location. Check browser permissions.')},{enableHighAccuracy:true,timeout:10000})}
$('#use-current-location').addEventListener('click',()=>locate(true));$('#locate-me').addEventListener('click',()=>locate(false));
$('#reset-view').addEventListener('click',()=>{map.flyTo({center:START.center,zoom:START.zoom,bearing:0,pitch:0,speed:1.15});clearMarkers(searchMarkers);clearMarkers(routeMarkers);latestRoute=null;HarshMaps.clearRoute(map);labelView('Mumbai, India');status('Map view reset')});
$('#mobile-menu').addEventListener('click',()=>{const open=$('#control-panel').classList.toggle('open');$('#mobile-menu').setAttribute('aria-expanded',String(open))});
$('#copy-snippet').addEventListener('click',async()=>{const snippet='<div id="map" style="height:420px"></div>\n<script type="module">\n  import * as ml from "https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs";\n  import { HarshMaps } from "https://cdn.jsdelivr.net/gh/harshyadavv2456/HarshMaps@main/sdk/harshmaps.js";\n  HarshMaps.createMap(ml, "map", { style: HarshMaps.styles.liberty });\n</script>';try{await navigator.clipboard.writeText(snippet);$('#copy-snippet').textContent='Copied ✓';setTimeout(()=>$('#copy-snippet').textContent='Copy snippet ⧉',1800)}catch{toast('Clipboard blocked. Copy the snippet from the code panel.')}});
map.on('load',()=>{$('#map-loader').classList.add('hidden');status('Connected · OpenFreeMap vector tiles');updateZoom();map.addControl(new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:false,showUserHeading:true}),'top-right')});
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
      markerCode + locateCode + searchCode + '</script>';
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
      : 'For a custom web app using ES modules. For Next.js/Vite/React, install MapLibre through npm and copy the SDK into your source for a production build.';
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
