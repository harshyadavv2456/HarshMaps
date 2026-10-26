import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOverpassQuery,
  inferPlaceCategory,
  rankSearchRecommendations,
  searchPlacesResilient
} from '../sdk/search-provider.js';

function response(json, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => json };
}

test('category search builds nearby ATM and bank selectors', () => {
  const query = buildOverpassQuery('ATMs', [79.0882, 21.1458]);
  assert.match(query, /\["amenity"="atm"\]/);
  assert.match(query, /\["amenity"="bank"\]/);
  assert.match(query, /around:15000,21\.145800,79\.088200/);
});

test('brand search queries name, brand and operator tags for SBI', () => {
  const query = buildOverpassQuery('SBI', [79.0882, 21.1458]);
  assert.match(query, /SBI\|State Bank of India/);
  assert.match(query, /\["name"~/);
  assert.match(query, /\["brand"~/);
  assert.match(query, /\["operator"~/);
});

test('category inference recognizes SBI ATM, branches and natural language', () => {
  assert.equal(inferPlaceCategory('SBI ATM in Nagpur')?.id, 'banks');
  assert.equal(inferPlaceCategory('show the nearest pharmacy')?.id, 'health');
  assert.equal(inferPlaceCategory('restaurants near me')?.id, 'food');
});

test('recommendations use query relevance, proximity and available notability signals', () => {
  const center = [79.0882, 21.1458];
  const ranked = rankSearchRecommendations([
    { id: 'far', name: 'SBI Branch', label: 'SBI Branch, Nagpur', coordinates: [79.25, 21.25], category: 'bank', properties: { operator: 'State Bank of India' } },
    { id: 'near', name: 'SBI ATM', label: 'SBI ATM, Nagpur', coordinates: [79.089, 21.146], category: 'atm', properties: { operator: 'State Bank of India' } },
    { id: 'notable', name: 'State Bank of India', label: 'State Bank of India, Nagpur', coordinates: [79.12, 21.17], category: 'bank', properties: { wikipedia: 'en:State Bank of India', operator: 'State Bank of India' } }
  ], 'SBI', center, { limit: 10 });
  assert.equal(ranked[0].name, 'SBI ATM');
  assert.equal(ranked[0].recommendationBadge, 'Recommended');
  assert.equal(ranked[0].distanceMeters < ranked[1].distanceMeters, true);
  assert.equal(ranked.some(place => place.notable), true);
});

test('nearby OpenStreetMap results rescue search when Photon fails', async () => {
  let photonCalls = 0;
  const fetchImpl = async url => {
    const parsed = new URL(url);
    assert.match(parsed.hostname, /overpass\.test/);
    return response({ elements: [
      { type: 'node', id: 1, lat: 21.146, lon: 79.089, tags: { name: 'SBI ATM', amenity: 'atm', operator: 'State Bank of India' } },
      { type: 'way', id: 2, center: { lat: 21.18, lon: 79.13 }, tags: { name: 'SBI Branch', amenity: 'bank', operator: 'State Bank of India' } }
    ] });
  };
  const result = await searchPlacesResilient('SBI', {
    center: [79.0882, 21.1458],
    live: true,
    allowNominatimFallback: false,
    overpassEndpoints: ['https://overpass.test/api/interpreter'],
    overpassTimeoutMs: 500,
    photonSearch: async () => { photonCalls++; throw new Error('Photon blocked'); },
    fetchImpl
  });
  assert.equal(photonCalls, 1);
  assert.equal(result.places.length, 2);
  assert.equal(result.places[0].name, 'SBI ATM');
  assert.equal(result.provider, 'OpenStreetMap nearby search');
  assert.equal(result.places.every(place => Number.isFinite(place.distanceMeters)), true);
});

test('autocomplete never falls through to public Nominatim', async () => {
  let nominatimCalls = 0;
  const fetchImpl = async url => {
    const parsed = new URL(url);
    if (parsed.hostname === 'nominatim.openstreetmap.org') nominatimCalls++;
    return response({ elements: [] }, 503);
  };
  const result = await searchPlacesResilient('SBI', {
    center: [79.0882, 21.1458], live: true, allowNominatimFallback: false,
    overpassEndpoints: ['https://overpass.test/api/interpreter'], overpassTimeoutMs: 100,
    photonSearch: async () => { throw new Error('Photon blocked'); }, fetchImpl
  });
  assert.equal(nominatimCalls, 0);
  assert.equal(result.places.length, 0);
  assert.equal(result.errors.length > 0, true);
});

test('submitted search uses Nominatim only as a fallback for place lookup', async () => {
  let nominatimCalls = 0;
  const fetchImpl = async url => {
    const parsed = new URL(url);
    if (parsed.hostname === 'nominatim.openstreetmap.org') {
      nominatimCalls++;
      return response([{
        place_id: 7, name: 'Nagpur', display_name: 'Nagpur, Maharashtra, India',
        lat: '21.1458', lon: '79.0882', type: 'city', importance: 0.7,
        address: { city: 'Nagpur', state: 'Maharashtra', country: 'India' }
      }]);
    }
    throw new Error('Unexpected provider request');
  };
  const result = await searchPlacesResilient('Nagpur', {
    center: [72.8777, 19.076],
    live: false, allowNominatimFallback: true, includeNearby: false,
    photonSearch: async () => { throw new Error('Photon blocked'); }, fetchImpl
  });
  assert.equal(nominatimCalls, 1);
  assert.equal(result.places[0].name, 'Nagpur');
  assert.equal(result.provider, 'Nominatim fallback');
});
