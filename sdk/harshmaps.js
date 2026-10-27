/** HarshMaps browser SDK. Pass MapLibre's module namespace to createMap(). */
export const styles=Object.freeze({liberty:'https://tiles.openfreemap.org/styles/liberty',bright:'https://tiles.openfreemap.org/styles/bright',positron:'https://tiles.openfreemap.org/styles/positron',dark:'https://tiles.openfreemap.org/styles/dark',fiord:'https://tiles.openfreemap.org/styles/fiord'});
export const providers=Object.freeze({photon:'https://photon.komoot.io/api/',osrm:'https://router.project-osrm.org/route/v1'});
export const version='0.2.0';
function mapClass(lib){const C=lib&&(lib.Map||(lib.default&&lib.default.Map));if(typeof C!=='function')throw TypeError('Pass the MapLibre module namespace to createMap().');return C}
function coordinates(value,label){if(!Array.isArray(value)||value.length<2)throw TypeError(label+' must be [longitude, latitude].');const p=[Number(value[0]),Number(value[1])];if(!Number.isFinite(p[0])||!Number.isFinite(p[1])||p[0]<-180||p[0]>180||p[1]<-90||p[1]>90)throw RangeError(label+' has invalid longitude/latitude.');return p}
function validUrl(value,label){let url;try{url=new URL(value)}catch{throw TypeError(label+' must be a valid URL.')}if(!['https:','http:'].includes(url.protocol))throw TypeError(label+' must use HTTP or HTTPS.');return url}
export const HarshMaps=Object.freeze({
 version,styles,providers,
 createMap(lib,container,options={}){const C=mapClass(lib),settings={...options},controls=settings.controls!==false;delete settings.controls;const map=new C({container,style:styles.liberty,center:[78.9629,20.5937],zoom:4.5,attributionControl:{compact:true},...settings});if(controls&&lib.NavigationControl)map.addControl(new lib.NavigationControl({visualizePitch:true}),'top-right');if(controls&&lib.ScaleControl)map.addControl(new lib.ScaleControl({unit:'metric'}),'bottom-left');return map},
 async searchPlaces(query,options={}) {
   const q=String(query||'').trim();
   if(q.length<2) throw TypeError('Search query must contain at least two characters.');
   const url=validUrl(options.baseUrl||providers.photon,'Geocoder endpoint');
   url.searchParams.set('q',q);
   const limit=Number(options.limit);
   url.searchParams.set('limit',String(Math.min(10,Math.max(1,Number.isFinite(limit)&&limit>0?Math.floor(limit):5))));
   if(options.lat!==undefined&&options.lon!==undefined&&Number.isFinite(Number(options.lat))&&Number.isFinite(Number(options.lon))){
     const lat=Number(options.lat),lon=Number(options.lon);
     if(lat>=-90&&lat<=90&&lon>=-180&&lon<=180){
       url.searchParams.set('lat',String(lat));
       url.searchParams.set('lon',String(lon));
       const zoom=Number(options.zoom);
       url.searchParams.set('zoom',String(Math.min(18,Math.max(1,Number.isFinite(zoom)&&zoom>0?zoom:11))));
       if(Number.isFinite(Number(options.locationBiasScale))){
         url.searchParams.set('location_bias_scale',String(Math.min(1,Math.max(0,Number(options.locationBiasScale)))));
       }
     }
   }
   if(Array.isArray(options.bbox)&&options.bbox.length===4){
     const b=options.bbox.map(Number);
     if(b.every(Number.isFinite)&&b[0]>=-180&&b[2]<=180&&b[1]>=-90&&b[3]<=90&&b[0]<=b[2]&&b[1]<=b[3]){
       url.searchParams.set('bbox',b.join(','));
     }
   }
   if(options.lang) url.searchParams.set('lang',String(options.lang).slice(0,16));
   if(Array.isArray(options.layers)) options.layers.filter(Boolean).slice(0,8).forEach(layer=>url.searchParams.append('layer',String(layer)));
   const init={headers:{Accept:'application/geo+json, application/json'}};
   if(options.signal) init.signal=options.signal;
   const res=await(options.fetchImpl||fetch)(url.toString(),init);
   if(!res.ok) throw Error('Geocoder returned HTTP '+res.status+'.');
   const data=await res.json();
   return(Array.isArray(data.features)?data.features:[])
     .filter(f=>Array.isArray(f&&f.geometry&&f.geometry.coordinates)&&Number.isFinite(Number(f.geometry.coordinates[0]))&&Number.isFinite(Number(f.geometry.coordinates[1]))&&Number(f.geometry.coordinates[0])>=-180&&Number(f.geometry.coordinates[0])<=180&&Number(f.geometry.coordinates[1])>=-90&&Number(f.geometry.coordinates[1])<=90)
     .map(f=>{
       const p=f.properties||{};
       const coords=[Number(f.geometry.coordinates[0]),Number(f.geometry.coordinates[1])];
       const street=[p.housenumber,p.street].filter(Boolean).join(' ');
       const name=p.name||p.street||p.city||p.locality||p.district||p.state||q;
       const details=[street&&street!==name?street:null,p.district,p.city||p.locality,p.state,p.postcode,p.country]
         .filter((value,index,array)=>Boolean(value)&&array.indexOf(value)===index&&value!==name);
       const label=[name,...details].join(', ');
       const category=p.osm_value||p.type||p.layer||p.osm_key||'place';
       const city=p.city||p.locality||p.district||'';
       return{
         id:p.osm_id?String(p.osm_type||'osm')+':'+p.osm_id:coords.join(','),
         name,label,coordinates:coords,city,state:p.state||'',country:p.country||'',
         postcode:p.postcode||'',district:p.district||'',street:p.street||'',
         category:String(category),layer:p.layer||'',extent:Array.isArray(p.extent)&&p.extent.length===4&&p.extent.every(Number.isFinite)?[Number(p.extent[0]),Math.min(Number(p.extent[1]),Number(p.extent[3])),Number(p.extent[2]),Math.max(Number(p.extent[1]),Number(p.extent[3]))]:null,
         properties:p
       };
     });
 },

 async getRoute(start,end,options={}){const origin=coordinates(start,'start'),destination=coordinates(end,'end'),base=String(options.baseUrl||providers.osrm).replace(/\/+$/,'');validUrl(base,'Routing endpoint');const profile=String(options.profile||'driving').replace(/[^a-z0-9_-]/gi,'');if(!profile)throw TypeError('Routing profile is required.');const url=base+'/'+encodeURIComponent(profile)+'/'+origin.join(',')+';'+destination.join(',')+'?overview=full&geometries=geojson&steps=true&alternatives='+(options.alternatives?'true':'false'),res=await(options.fetchImpl||fetch)(url,{headers:{Accept:'application/json'}});if(!res.ok)throw Error('Routing service returned HTTP '+res.status+'.');const data=await res.json();if(data.code!=='Ok'||!Array.isArray(data.routes)||!data.routes.length)throw Error('No route found. Try closer locations or check routing provider/profile.');const r=data.routes[0];if(!r.geometry||!Array.isArray(r.geometry.coordinates))throw Error('Routing service returned a route without geometry.');return{distance:Number(r.distance)||0,duration:Number(r.duration)||0,geometry:r.geometry,feature:{type:'FeatureCollection',features:[{type:'Feature',properties:{distance:Number(r.distance)||0,duration:Number(r.duration)||0},geometry:r.geometry}]},alternatives:data.routes.slice(1).map(x=>({distance:Number(x.distance)||0,duration:Number(x.duration)||0,geometry:x.geometry,feature:{type:'FeatureCollection',features:[{type:'Feature',properties:{distance:Number(x.distance)||0,duration:Number(x.duration)||0},geometry:x.geometry}]},steps:(x.legs||[]).flatMap(leg=>(leg.steps||[]).map(step=>({distance:Number(step.distance)||0,duration:Number(step.duration)||0,name:step.name||'',mode:step.mode||'driving',maneuver:step.maneuver||{}})))})),steps:(r.legs||[]).flatMap(leg=>(leg.steps||[]).map(step=>({distance:Number(step.distance)||0,duration:Number(step.duration)||0,name:step.name||'',mode:step.mode||'driving',maneuver:step.maneuver||{}}))),waypoints:data.waypoints||[]}},
 drawRoute(map,geojson,options={}){if(!map||typeof map.addSource!=='function')throw TypeError('A MapLibre map instance is required.');const data=geojson&&geojson.type==='Feature'?{type:'FeatureCollection',features:[geojson]}:geojson;if(!data||data.type!=='FeatureCollection')throw TypeError('Route data must be GeoJSON Feature or FeatureCollection.');const source=options.sourceId||'harshmaps-route',casing=options.casingLayerId||'harshmaps-route-casing',line=options.layerId||'harshmaps-route-line';if(map.getSource(source)){map.getSource(source).setData(data);return source}map.addSource(source,{type:'geojson',data});const before=options.beforeId,color=options.color||'#675bf4';map.addLayer({id:casing,type:'line',source,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':options.casingColor||'#fff','line-width':['interpolate',['linear'],['zoom'],5,4,12,8,17,11],'line-opacity':.9}},before);map.addLayer({id:line,type:'line',source,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':color,'line-width':['interpolate',['linear'],['zoom'],5,2,12,4,17,6],'line-opacity':.95}},before);return source},
 clearRoute(map,source='harshmaps-route'){if(!map)return;const layers=source==='harshmaps-route'?['harshmaps-route-line','harshmaps-route-casing']:[source+'-line',source+'-casing'];layers.forEach(id=>{if(map.getLayer(id))map.removeLayer(id)});if(map.getSource(source))map.removeSource(source)},
 addMarker(lib,map,position,options={}){const coords=coordinates(position,'marker position');if(!lib||typeof lib.Marker!=='function')throw TypeError('Pass the MapLibre module namespace to addMarker().');const markerOptions={};if(options.element)markerOptions.element=options.element;else if(typeof document!=='undefined'){const el=document.createElement('span');el.className='hm-marker';if(options.color)el.style.backgroundColor=options.color;el.setAttribute('aria-hidden','true');markerOptions.element=el}else if(options.color)markerOptions.color=options.color;const marker=new lib.Marker(markerOptions).setLngLat(coords);if(options.label){const popup=new lib.Popup({offset:20,closeButton:true,maxWidth:'260px'}),content=document.createElement('div');content.textContent=String(options.label);content.style.fontSize='12px';content.style.fontWeight='650';popup.setDOMContent(content);marker.setPopup(popup)}return marker.addTo(map)},
 set3D(map,enabled,options={}){if(!map||typeof map.getStyle!=='function')return false;const style=map.getStyle(),sources=style&&style.sources?style.sources:{},source=options.sourceId||Object.keys(sources).find(id=>{const s=sources[id];return s&&s.type==='vector'&&((s.url&&/openfreemap|openmaptiles/i.test(s.url))||(Array.isArray(s.tiles)&&s.tiles.some(t=>/openfreemap|openmaptiles/i.test(t))))}),layer=options.layerId||'harshmaps-3d-buildings';if(enabled&&source&&map.getSource(source)&&!map.getLayer(layer)){const before=(style.layers||[]).find(l=>l.type==='symbol');try{map.addLayer({id:layer,type:'fill-extrusion',source,'source-layer':options.sourceLayer||'building',minzoom:14,filter:['>', ['coalesce',['to-number',['get','render_height']],['to-number',['get','height']],0],0],paint:{'fill-extrusion-color':options.color||'#aab5d5','fill-extrusion-height':['interpolate',['linear'],['zoom'],14,0,16,['coalesce',['to-number',['get','render_height']],['to-number',['get','height']],0]],'fill-extrusion-base':['coalesce',['to-number',['get','render_min_height']],['to-number',['get','min_height']],0],'fill-extrusion-opacity':.82}},before&&before.id)}catch{}}if(!enabled&&map.getLayer(layer))map.removeLayer(layer);map.easeTo({pitch:enabled?52:0,bearing:enabled?-18:0,duration:650});return Boolean(source)}
});