import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs';
import { HarshMaps } from './sdk/harshmaps.js';

const params = new URLSearchParams(window.location.search);
const styles = HarshMaps.styles;
const $ = (selector) => document.querySelector(selector);
const numberParam = (name, fallback, min, max) => {
  const value = Number(params.get(name));
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
const map = HarshMaps.createMap(maplibregl, 'map', {
  style: styles[style], center, zoom, minZoom: 1, maxZoom: 20,
  controls: showControls, attributionControl: { compact: true }
});
let searchMarkers = [];

if (!searchable) $('#embed-search').hidden = true;
if (!locatable) $('#locate-button').hidden = true;

function setStatus(message) { $('#embed-status').textContent = message; }
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
map.on('load', () => {
  $('#map-loader').classList.add('hidden');
  setStatus('Map ready · OpenFreeMap · © OpenStreetMap contributors');
});
map.on('error', (event) => {
  if (event && event.error && !map.loaded()) setStatus('Map service is still connecting. Please retry shortly.');
});

$('#embed-search').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = $('#place-query').value.trim();
  if (query.length < 2) {
    setStatus('Enter at least two characters to search.');
    return;
  }
  setStatus('Searching places…');
  try {
    const position = map.getCenter();
    const places = await HarshMaps.searchPlaces(query, {
      baseUrl: HarshMaps.providers.photon,
      limit: 5, lat: position.lat, lon: position.lng
    });
    if (!places.length) {
      setStatus('No results found. Try a different place name.');
      return;
    }
    clearSearchMarkers();
    places.forEach((place) => placeMarker(place));
    const best = places[0];
    map.flyTo({ center: best.coordinates, zoom: 14, speed: 1.1, essential: true });
    setStatus(best.label || best.name || 'Place found');
  } catch (error) {
    setStatus(error && error.message ? error.message : 'Search service unavailable. Try again later.');
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
