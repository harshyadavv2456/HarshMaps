import test from 'node:test';
import assert from 'node:assert/strict';
import { pinsToGeoJSON, addPinClusters } from '../sdk/pins.js';

test('pinsToGeoJSON keeps good pins, drops bad coordinates, keeps extra fields', () => {
  const g = pinsToGeoJSON([{ id: 'a', lng: 79.1, lat: 21.1, name: 'A' }, { id: 'b', lng: null, lat: 5 }, { id: 'c', lng: 'x', lat: 5 }, { id: 'd', lng: 200, lat: 5 }, null, { id: 'e', lng: '72.8', lat: '19.0' }]);
  assert.deepEqual(g.features.map(f => f.properties.id), ['a', 'e']);
  assert.deepEqual(g.features[1].geometry.coordinates, [72.8, 19]);
  assert.equal(g.features[0].properties.name, 'A');
  assert.equal(g.features[0].properties.lng, undefined);
  assert.deepEqual(pinsToGeoJSON(undefined).features, []);
});

test('handles ten thousand pins', () => {
  const pins = Array.from({ length: 10000 }, (_, i) => ({ id: 'p' + i, lng: 68 + (i % 100) * 0.3, lat: 8 + Math.floor(i / 100) * 0.3 }));
  assert.equal(pinsToGeoJSON(pins).features.length, 10000);
});

function fakeMap() {
  const m = { sources: {}, layers: {}, handlers: [], paint: {} };
  m.addSource = (id, s) => { m.sources[id] = { ...s, setData(d) { this.data = d; } }; };
  m.getSource = id => m.sources[id];
  m.removeSource = id => { delete m.sources[id]; };
  m.addLayer = l => { m.layers[l.id] = l; };
  m.getLayer = id => m.layers[id];
  m.removeLayer = id => { delete m.layers[id]; };
  m.on = (...a) => m.handlers.push(a);
  m.off = (type, layer, fn) => { m.handlers = m.handlers.filter(h => !(h[0] === type && h[1] === layer && h[2] === fn)); };
  m.setPaintProperty = (id, k, v) => { m.paint[id + k] = v; };
  m.getCanvas = () => ({ style: {} });
  return m;
}

test('addPinClusters builds a clustered source and cleans up fully', () => {
  const m = fakeMap();
  const picked = [];
  const pins = addPinClusters(m, { id: 't', pins: [{ id: 'a', lng: 1, lat: 1 }], onSelect: p => picked.push(p.id) });
  assert.equal(m.sources['t-src'].cluster, true);
  assert.equal(Object.keys(m.layers).length, 5);
  const dotClick = m.handlers.find(h => h[0] === 'click' && h[1] === 't-dot');
  dotClick[2]({ features: [{ properties: { id: 'a' } }] });
  assert.deepEqual(picked, ['a']);
  pins.setPins([{ id: 'b', lng: 2, lat: 2 }, { id: 'x', lng: null, lat: 0 }]);
  assert.equal(m.sources['t-src'].data.features.length, 1);
  pins.setSelected('b');
  assert.deepEqual(m.paint['t-dotcircle-color'][1][2], 'b');
  assert.deepEqual(m.paint['t-dotcircle-radius'], ['case', ['==', ['get', 'id'], 'b'], 11, 8]);
  assert.deepEqual(m.paint['t-halocircle-radius'][2], 20);
  pins.remove();
  assert.equal(Object.keys(m.layers).length, 0);
  assert.equal(m.sources['t-src'], undefined);
  assert.equal(m.handlers.length, 0);
});
