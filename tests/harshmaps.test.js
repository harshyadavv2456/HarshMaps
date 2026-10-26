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
test('returns route geometry, metrics, route steps, and validates coordinates', async () => {
 let requestUrl='';
 const route=await HarshMaps.getRoute([79,21],[78,20],{baseUrl:'https://router.example/route/v1',fetchImpl:async url=>{requestUrl=String(url);return{ok:true,json:async()=>({code:'Ok',routes:[{distance:1200,duration:300,geometry:{type:'LineString',coordinates:[[79,21],[78,20]]},legs:[{steps:[{name:'Main Street',distance:1200,duration:300,mode:'driving',maneuver:{type:'depart',location:[79,21]}}]}]}],waypoints:[]})}}});
 assert.match(requestUrl,/\/driving\/79,21;78,20/);assert.equal(route.distance,1200);assert.equal(route.steps[0].name,'Main Street');assert.equal(route.feature.features[0].geometry.type,'LineString');
 await assert.rejects(()=>HarshMaps.getRoute([190,21],[78,20]),/invalid longitude/);
});
