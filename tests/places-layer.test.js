import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OVERTURE_PLACES_SOURCE_ID,
  OVERTURE_PLACES_DOTS_ID,
  OVERTURE_PLACES_LABELS_ID,
  validOvertureRelease,
  overturePlacesUrl,
  addOverturePlaces,
  setOverturePlaceCategory,
  setOverturePlacesVisible,
  bindOverturePlacePopups
} from '../sdk/places-layer.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { refreshRelease, releaseRecord } from '../scripts/refresh-overture-release.mjs';

class FakeMap {
  constructor() {
    this.sources = new Map();
    this.layers = new Map();
    this.filters = new Map();
    this.visibility = new Map();
    this.events = [];
    this.style = { layers: [{ id: 'road-labels', type: 'symbol' }] };
  }
  addSource(id, source) { this.sources.set(id, { ...source, setUrl(url) { this.url = url; } }); }
  getSource(id) { return this.sources.get(id); }
  addLayer(layer, beforeId) { this.layers.set(layer.id, { ...layer, beforeId }); }
  getLayer(id) { return this.layers.get(id); }
  getStyle() { return this.style; }
  setFilter(id, value) { this.filters.set(id, value); }
  setLayoutProperty(id, name, value) { this.visibility.set(id, { name, value }); }
  on(...args) { this.events.push(args); }
}

test('validates and constructs Overture release metadata safely', () => {
  assert.equal(validOvertureRelease('2026-10-21.0'), true);
  assert.equal(validOvertureRelease('2026-02-30.0'), false);
  assert.equal(validOvertureRelease('../../main'), false);
  assert.equal(
    overturePlacesUrl('2026-10-21.0'),
    'pmtiles://https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-10-21.0/places.pmtiles'
  );
  assert.throws(() => overturePlacesUrl('invalid'), /Invalid Overture release/);
  assert.equal(releaseRecord('2026-10-21.0').release_cadence, 'monthly');
});

test('adds Overture vector layers and supports category and visibility controls', () => {
  const map = new FakeMap();
  const layer = addOverturePlaces(map, '2026-10-21.0', { category: 'food', visible: true });
  assert.equal(layer.sourceId, OVERTURE_PLACES_SOURCE_ID);
  assert.equal(map.getSource(OVERTURE_PLACES_SOURCE_ID).url, layer.url);
  assert.equal(map.getLayer(OVERTURE_PLACES_DOTS_ID)['source-layer'], 'place');
  assert.equal(map.getLayer(OVERTURE_PLACES_LABELS_ID).minzoom, 13);
  assert.equal(map.getLayer(OVERTURE_PLACES_DOTS_ID).beforeId, 'road-labels');
  assert.equal(map.getLayer(OVERTURE_PLACES_DOTS_ID).layout, undefined);
  assert.ok(map.filters.get(OVERTURE_PLACES_DOTS_ID));
  assert.ok(JSON.stringify(map.filters.get(OVERTURE_PLACES_DOTS_ID)).includes('basic_category'), 'category filters must use current Overture basic_category fields');
  setOverturePlaceCategory(map, 'banks');
  assert.ok(JSON.stringify(map.filters.get(OVERTURE_PLACES_DOTS_ID)).includes('bank'));
  setOverturePlaceCategory(map, 'all');
  assert.equal(map.filters.get(OVERTURE_PLACES_DOTS_ID), null);
  setOverturePlacesVisible(map, false);
  assert.equal(map.visibility.get(OVERTURE_PLACES_DOTS_ID).value, 'none');
  assert.equal(map.visibility.get(OVERTURE_PLACES_LABELS_ID).value, 'none');
  assert.throws(() => addOverturePlaces(map, 'bad-release'), /valid Overture release/);
});

test('binds place click interactions without using untrusted HTML strings', () => {
  const map = new FakeMap();
  class FakePopup {
    setLngLat() { return this; }
    setDOMContent() { return this; }
    addTo() { return this; }
  }
  bindOverturePlacePopups(map, { Popup: FakePopup });
  assert.equal(map.events.length, 3);
  assert.equal(map.events[0][0], 'click');
  assert.equal(map.events[0][1], OVERTURE_PLACES_DOTS_ID);
});

test('release refresh writes only when Overture publishes a new release', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harshmaps-release-'));
  const path = join(dir, 'overture-release.json');
  const fetchImpl = async () => ({ ok: true, json: async () => ({ latest: '2026-10-21.0' }) });
  try {
    const first = await refreshRelease({ fetchImpl, metadataPath: path, log: () => {} });
    assert.equal(first.changed, true);
    const before = await readFile(path, 'utf8');
    assert.equal(JSON.parse(before).release, '2026-10-21.0');
    const second = await refreshRelease({ fetchImpl, metadataPath: path, log: () => {} });
    assert.equal(second.changed, false);
    assert.equal(await readFile(path, 'utf8'), before);
    await assert.rejects(
      () => refreshRelease({ fetchImpl: async () => ({ ok: true, json: async () => ({ latest: '../bad' }) }), metadataPath: path, log: () => {} }),
      /invalid Overture release/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
