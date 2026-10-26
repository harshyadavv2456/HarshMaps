import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDistance,
  haversineDistanceMeters,
  normalizeOvertureFeature,
  rankNearbyPlaces
} from '../sdk/nearby.js';

test('great-circle distance uses longitude-first coordinates', () => {
  const meters = haversineDistanceMeters([0, 0], [0.01, 0]);
  assert.ok(meters > 1_100 && meters < 1_120);
});

test('distance formatting stays readable for metres and kilometres', () => {
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDistance(438), '440 m');
  assert.equal(formatDistance(1_250), '1.3 km');
  assert.equal(formatDistance(12_500), '13 km');
  assert.equal(formatDistance(Number.NaN), 'Distance unavailable');
});

test('Overture normalization rejects unlabelled or invalid features', () => {
  assert.equal(normalizeOvertureFeature({ geometry: { coordinates: [1, 2] } }), null);
  assert.equal(normalizeOvertureFeature({
    properties: { name: 'Not a point' }, geometry: { coordinates: [999, 2] }
  }), null);
  const place = normalizeOvertureFeature({
    id: 7,
    properties: { '@name': 'Central Pharmacy', basic_category: 'pharmacy', country: 'India' },
    geometry: { type: 'Point', coordinates: [79.08, 21.14] }
  });
  assert.equal(place.name, 'Central Pharmacy');
  assert.equal(place.category, 'pharmacy');
  assert.equal(place.country, 'India');
  assert.deepEqual(place.coordinates, [79.08, 21.14]);
});

test('nearby ranking sorts by distance and collapses duplicated tile features', () => {
  const features = [
    { id: 'far', properties: { name: 'Far Clinic', basic_category: 'clinic' }, geometry: { coordinates: [79.2, 21.14] } },
    { id: 'near', properties: { name: 'Near Clinic', basic_category: 'clinic' }, geometry: { coordinates: [79.081, 21.14] } },
    { id: 'duplicate', properties: { name: 'Near Clinic', basic_category: 'clinic' }, geometry: { coordinates: [79.0811, 21.1401] } },
    { id: 'unnamed', properties: { basic_category: 'clinic' }, geometry: { coordinates: [79.08, 21.14] } }
  ];
  const results = rankNearbyPlaces(features, [79.08, 21.14]);
  assert.equal(results.length, 2);
  assert.equal(results[0].name, 'Near Clinic');
  assert.ok(results[0].distanceMeters < results[1].distanceMeters);
});

test('nearby results enforce a bounded result limit', () => {
  const features = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    properties: { name: 'Place ' + i },
    geometry: { coordinates: [79.08 + i / 1000, 21.14] }
  }));
  assert.equal(rankNearbyPlaces(features, [79.08, 21.14], { limit: 3 }).length, 3);
});
