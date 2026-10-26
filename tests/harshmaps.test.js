import test from 'node:test';
import assert from 'node:assert/strict';
import { HarshMaps, styles, providers } from '../sdk/harshmaps.js';
test('exposes OpenFreeMap styles and configurable public demo providers', () => {
 assert.match(styles.liberty, /^https:\/\/tiles\.openfreemap\.org\/styles\//);
 assert.equal(styles.dark, 'https://tiles.openfreemap.org/styles/dark');
 assert.match(providers.photon, /^https:\/\/photon\.komoot\.io/);
 assert.match(providers.osrm, /^https:\/\/router\.project-osrm\.org/);
});
test('creates a MapLibre-compatible map with defaults and optional controls', () => {
 class FakeMap { constructor(options){this.options=options;this.controls=[]} addControl(control,position){this.controls.push({control,position})} }
 class FakeControl {}
 const lib={Map:FakeMap,NavigationControl:FakeControl,ScaleControl:FakeControl};
 const map=HarshMaps.createMap(lib,'map-root',{center:[12,34],zoom:7});
 assert.equal(map.options.container,'map-root');assert.equal(map.options.center[0],12);assert.equal(map.options.style,styles.liberty);assert.equal(map.controls.length,2);
 assert.equal(HarshMaps.createMap(lib,'map-root',{controls:false}).controls.length,0);
});
test('normalizes Photon results and includes street names', async () => {
 let requestUrl='';
 const places=await HarshMaps.searchPlaces('Nagpur',{baseUrl:'https://geocoder.example/api/',lat:21.14,lon:79.08,fetchImpl:async url=>{requestUrl=String(url);return{ok:true,json:async()=>({features:[{geometry:{coordinates:[79.08,21.14]},properties:{name:'Nagpur',street:'Wardha Road',city:'Nagpur',country:'India',osm_id:42}}]})}}});
 assert.match(requestUrl,/q=Nagpur/);assert.deepEqual(places[0].coordinates,[79.08,21.14]);assert.equal(places[0].label,'Nagpur, Wardha Road, India');assert.equal(places[0].id,'osm:42');
 await assert.rejects(()=>HarshMaps.searchPlaces('x'),/at least two characters/);
});
test('returns route geometry, metrics, route steps, alternatives, and validates coordinates', async () => {
 let requestUrl='';
 const route=await HarshMaps.getRoute([79,21],[78,20],{
  baseUrl:'https://router.example/route/v1',
  alternatives:true,
  fetchImpl:async url=>{
   requestUrl=String(url);
   return{ok:true,json:async()=>({code:'Ok',routes:[
    {distance:1200,duration:300,geometry:{type:'LineString',coordinates:[[79,21],[78,20]]},legs:[{steps:[{name:'Main Street',distance:1200,duration:300,mode:'driving',maneuver:{type:'depart',location:[79,21]}}]}]},
    {distance:1500,duration:250,geometry:{type:'LineString',coordinates:[[79,21],[78.5,20.5],[78,20]]},legs:[{steps:[{name:'Alternate Avenue',distance:1500,duration:250,mode:'driving',maneuver:{type:'depart',location:[79,21]}}]}]}
   ],waypoints:[]})};
  }
 });
 assert.match(requestUrl,/\/driving\/79,21;78,20/);
 assert.match(requestUrl,/alternatives=true/);
 assert.equal(route.distance,1200);
 assert.equal(route.steps[0].name,'Main Street');
 assert.equal(route.feature.features[0].geometry.type,'LineString');
 assert.equal(route.alternatives[0].distance,1500);
 assert.equal(route.alternatives[0].steps[0].name,'Alternate Avenue');
 assert.equal(route.alternatives[0].feature.features[0].geometry.coordinates.length,3);
 await assert.rejects(()=>HarshMaps.getRoute([190,21],[78,20]),/invalid longitude/);
});

test('supports cancellable city-biased search, optional area bounds and normalized place context', async () => {
 let requestedUrl='';
 let requestInit=null;
 const controller=new AbortController();
 const places=await HarshMaps.searchPlaces('HDFC Bank',{
  baseUrl:'https://geocoder.example/api/',
  limit:10,lat:21.1458,lon:79.0882,zoom:12,locationBiasScale:0.65,
  bbox:[79.0,21.0,79.2,21.2],layers:['city','locality'],lang:'en',signal:controller.signal,
  fetchImpl:async(url,init)=>{
   requestedUrl=String(url);requestInit=init;
   return {ok:true,json:async()=>({features:[{
    geometry:{coordinates:[79.0882,21.1458]},
    properties:{name:'HDFC Bank',street:'Wardha Road',district:'Nagpur',city:'Nagpur',state:'Maharashtra',country:'India',postcode:'440015',osm_key:'amenity',osm_value:'bank',osm_type:'N',osm_id:100,extent:[79.0,21.2,79.2,21.0]}
   }]})};
  }
 });
 assert.match(requestedUrl,/location_bias_scale=0\.65/);
 assert.match(requestedUrl,/bbox=79%2C21%2C79\.2%2C21\.2/);
 assert.match(requestedUrl,/layer=city/);
 assert.match(requestedUrl,/layer=locality/);
 assert.equal(requestInit.signal,controller.signal);
 assert.deepEqual(places[0].extent,[79,21,79.2,21.2]);
 assert.equal(places[0].category,'bank');
 assert.equal(places[0].city,'Nagpur');
 assert.equal(places[0].postcode,'440015');
});
