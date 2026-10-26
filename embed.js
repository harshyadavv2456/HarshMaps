import { HarshMaps } from './sdk/harshmaps.js';
import { searchPlacesResilient } from './sdk/search-provider.js?v=20261026-4';
import { addOverturePlaces, bindOverturePlacePopups, validOvertureRelease, setOverturePlacesVisible } from './sdk/places-layer.js';

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
  if (loader) { loader.classList.remove('hidden'); loader.classList.add('failed'); loader.querySelector('span').textContent = 'Map engine unavailable. Check your connection and reload this page.'; }
  const status = document.querySelector('#embed-status');
  if (status) status.textContent = 'Map engine unavailable · CDN requests failed';
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

const params = new URLSearchParams(window.location.search);
const styles = HarshMaps.styles;
const $ = (selector) => document.querySelector(selector);
const numberParam = (name, fallback, min, max) => {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};
const boolParam = (name, fallback) => {
  const value = params.get(name);
  if (value === null || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
};
const styleName = params.get('style');
const style = Object.prototype.hasOwnProperty.call(styles, styleName) ? styleName : 'liberty';
const center = [
  numberParam('lng', 72.8777, -180, 180),
  numberParam('lat', 19.076, -90, 90)
];
const zoom = numberParam('zoom', 10, 1, 20);
const pin = boolParam('marker', false);
const searchable = boolParam('search', true);
const locatable = boolParam('locate', true);
const showControls = boolParam('controls', true);
const markerLabel = (params.get('label') || '').slice(0, 120);
let placesEnabled = boolParam('places', true);
let placesRelease = null;
let placesLayerBound = false;
const map = HarshMaps.createMap(maplibregl, 'map', {
  style: styles[style], center, zoom, minZoom: 1, maxZoom: 20,
  controls: showControls, attributionControl: { compact: true }
});
let searchMarkers = [];

if (!searchable) $('#embed-search').hidden = true;
if (!locatable) $('#locate-button').hidden = true;
if (!placesEnabled) $('#toggle-places').setAttribute('aria-pressed', 'false');

function setStatus(message) { $('#embed-status').textContent = message; }
async function refreshPlacesLayer() {
  if (!placesEnabled) return;
  try {
    const url = new URL('./data/overture-release.json', import.meta.url);
    url.searchParams.set('check', String(Date.now()));
    const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Places release metadata returned HTTP ' + response.status);
    const metadata = await response.json();
    if (!validOvertureRelease(metadata.release)) throw new Error('Invalid Overture release identifier.');
    if (placesRelease === metadata.release && map.getLayer('harshmaps-overture-place-dots') && map.getLayer('harshmaps-overture-place-labels')) { setStatus('Map ready · global places active · Overture ' + metadata.release); return; }
    await ensurePmtilesProtocol();
    addOverturePlaces(map, metadata.release, { visible: true });
    if (!placesLayerBound) {
      bindOverturePlacePopups(map, maplibregl);
      placesLayerBound = true;
    }
    placesRelease = metadata.release;
    setStatus('Map ready · global places active · Overture ' + metadata.release);
  } catch (error) {
    setStatus('Places layer unavailable · ' + (error && error.message ? error.message : 'try again later'));
  }
}
function clearSearchMarkers() {
  searchMarkers.forEach((item) => item.remove());
  searchMarkers = [];
}
function placeMarker(place, label = place.name || place.label) {
  const marker = HarshMaps.addMarker(maplibregl, map, place.coordinates, { label });
  searchMarkers.push(marker);
  return marker;
}

if (pin) {
  placeMarker({ coordinates: center, name: markerLabel || 'Pinned location', label: markerLabel || 'Pinned location' }, markerLabel || undefined);
}
let mapStartupReady = false;
let rasterFallbackActive = false;
let mapStartupTimer = null;
let mapFallbackTimer = null;
function finishMapStartup(useFallback = false) {
  if (mapStartupReady) return;
  mapStartupReady = true;
  clearTimeout(mapStartupTimer);
  clearTimeout(mapFallbackTimer);
  $('#map-loader').classList.add('hidden');
  setStatus(useFallback ? 'Backup raster map active · OpenStreetMap tiles' : 'Map ready · OpenFreeMap · © OpenStreetMap contributors');
  refreshPlacesLayer();
}
function failMapStartup(message) {
  const loader = $('#map-loader');
  loader.classList.remove('hidden');
  loader.classList.add('failed');
  loader.querySelector('span').textContent = message;
  setStatus('Map services unavailable · check connection');
}
map.on('load', () => {
  if (!rasterFallbackActive) finishMapStartup(false);
  else if (map.getStyle()?.sources?.['osm-raster']) finishMapStartup(true);
});
map.on('style.load', () => {
  if (rasterFallbackActive && !mapStartupReady && map.getStyle()?.sources?.['osm-raster']) finishMapStartup(true);
});
map.on('error', (event) => {
  if (event && event.error && !mapStartupReady) setStatus('Map provider is slow or unavailable · trying recovery…');
});
mapStartupTimer = setTimeout(() => {
  if (mapStartupReady || rasterFallbackActive) return;
  rasterFallbackActive = true;
  setStatus('Vector map stalled · trying a backup basemap');
  const loader = $('#map-loader');
  loader.classList.remove('hidden');
  loader.classList.remove('failed');
  loader.querySelector('span').textContent = 'Switching to backup map…';
  mapFallbackTimer = setTimeout(() => {
    if (!mapStartupReady) failMapStartup('Map services did not respond. Check your internet connection and reload this page.');
  }, 12000);
  try { map.setStyle(RASTER_FALLBACK_STYLE); }
  catch (error) { failMapStartup('Could not start the backup map. Check your connection and reload this page.'); }
}, 14000);

$('#embed-search').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = $('#place-query').value.trim();
  if (query.length < 2) {
    setStatus('Enter at least two characters to search.');
    return;
  }
  setStatus('Searching places and nearby businesses…');
  const center = map.getCenter();
  try {
    const result = await searchPlacesResilient(query, {
      center: [center.lng, center.lat],
      live: false,
      allowNominatimFallback: true,
      includeNearby: true,
      limit: 10,
      countryCode: 'in',
      photonSearch: (text, requestOptions) => HarshMaps.searchPlaces(text, {
        baseUrl: HarshMaps.providers.photon,
        limit: requestOptions.limit,
        lat: requestOptions.center?.[1],
        lon: requestOptions.center?.[0],
        zoom: map.getZoom(),
        locationBiasScale: 0.4,
        signal: requestOptions.signal
      })
    });
    const places = result.places || [];
    if (!places.length) {
      setStatus(result.errors?.length
        ? 'Search providers did not respond. Try a fuller place name or retry in a moment.'
        : 'No results found. Try a business name with a city.');
      return;
    }
    clearSearchMarkers();
    places.slice(0, 8).forEach((place) => placeMarker(place));
    const best = places[0];
    map.flyTo({ center: best.coordinates, zoom: 15, speed: 1.1, essential: true });
    setStatus((best.recommendationBadge || 'Recommended') + ': ' + (best.label || best.name) +
      (Number.isFinite(best.distanceMeters) ? ' · ' + Math.round(best.distanceMeters) + ' m away' : '') +
      (result.provider ? ' · ' + result.provider : ''));
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    setStatus('Search failed across available providers. Check the connection and retry.');
  }
});

$('#toggle-places').addEventListener('click', () => {
  placesEnabled = !placesEnabled;
  $('#toggle-places').setAttribute('aria-pressed', String(placesEnabled));
  if (placesEnabled) {
    setStatus('Loading points of interest…');
    refreshPlacesLayer();
  } else {
    setOverturePlacesVisible(map, false);
    setStatus('Points of interest hidden');
  }
});

$('#locate-button').addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus('Location is not supported by this browser.');
    return;
  }
  setStatus('Waiting for location permission…');
  navigator.geolocation.getCurrentPosition((position) => {
    const coordinates = [position.coords.longitude, position.coords.latitude];
    clearSearchMarkers();
    placeMarker({ coordinates, name: 'Your location', label: 'Your location' });
    map.flyTo({ center: coordinates, zoom: 15, speed: 1.15, essential: true });
    setStatus('Showing your device location');
  }, (error) => {
    const message = error && error.code === 1
      ? 'Location permission was denied.'
      : 'Could not get your location. Check device permissions and try again.';
    setStatus(message);
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
});

setInterval(() => {
  if (placesEnabled) refreshPlacesLayer();
}, 15 * 60 * 1000);
