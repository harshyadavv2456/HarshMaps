/**
 * Experimental global POI overlay for HarshMaps.
 * The public Overture PMTiles are for data inspection; see docs/FREE_INTEGRATION.md
 * before using this endpoint in a production service.
 */
export const OVERTURE_TILES_BASE = 'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles';
export const OVERTURE_PLACES_SOURCE_ID = 'harshmaps-overture-places';
export const OVERTURE_PLACES_DOTS_ID = 'harshmaps-overture-place-dots';
export const OVERTURE_PLACES_LABELS_ID = 'harshmaps-overture-place-labels';
export const OVERTURE_PLACES_ATTRIBUTION = '© <a href="https://overturemaps.org/" target="_blank" rel="noreferrer">Overture Maps Foundation</a>';

export const PLACE_CATEGORY_GROUPS = Object.freeze({
  all: null,
  food: ['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'bakery', 'ice_cream_shop', 'food_and_drink'],
  shopping: ['shopping', 'supermarket', 'convenience_store', 'grocery_store', 'clothing_store', 'department_store', 'shopping_mall'],
  health: ['hospital', 'clinic', 'doctor', 'dentist', 'pharmacy', 'healthcare', 'medical_center'],
  education: ['school', 'university', 'college', 'kindergarten', 'education'],
  lodging: ['accommodation', 'hotel', 'motel', 'hostel', 'guest_house'],
  landmarks: ['landmark_and_historical_building', 'monument', 'museum', 'park', 'attraction', 'place_of_worship', 'religious_organization', 'tourist_attraction'],
  services: ['professional_services', 'bank', 'atm', 'government_office', 'post_office', 'gas_station', 'automotive', 'beauty_salon']
});

export function validOvertureRelease(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(value)) return false;
  const date = value.slice(0, 10);
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

export function overturePlacesUrl(release) {
  if (!validOvertureRelease(release)) throw new TypeError('Invalid Overture release identifier.');
  return 'pmtiles://' + OVERTURE_TILES_BASE + '/' + release + '/places.pmtiles';
}

export function addOverturePlaces(map, release, options = {}) {
  if (!map || typeof map.addSource !== 'function') throw new TypeError('A MapLibre map instance is required.');
  if (!validOvertureRelease(release)) throw new TypeError('A valid Overture release is required.');
  const sourceId = options.sourceId || OVERTURE_PLACES_SOURCE_ID;
  const dotsId = options.dotsLayerId || OVERTURE_PLACES_DOTS_ID;
  const labelsId = options.labelsLayerId || OVERTURE_PLACES_LABELS_ID;
  const url = overturePlacesUrl(release);
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'vector',
      url,
      attribution: OVERTURE_PLACES_ATTRIBUTION
    });
  } else if (typeof map.getSource(sourceId).setUrl === 'function') {
    map.getSource(sourceId).setUrl(url);
  }
  const styleLayers = (map.getStyle() && map.getStyle().layers) || [];
  const firstSymbol = styleLayers.find((layer) => layer.type === 'symbol');
  const beforeId = firstSymbol && firstSymbol.id;
  if (!map.getLayer(dotsId)) {
    map.addLayer({
      id: dotsId,
      type: 'circle',
      source: sourceId,
      'source-layer': 'place',
      minzoom: 4,
      paint: {
        'circle-color': [
          'match', ['get', '@category'],
          ['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'bakery'], '#f08a58',
          ['shopping', 'supermarket', 'convenience_store', 'grocery_store', 'clothing_store'], '#be73ee',
          ['hospital', 'clinic', 'doctor', 'dentist', 'pharmacy', 'medical_center'], '#e56d86',
          ['school', 'university', 'college', 'kindergarten'], '#4d91d3',
          ['accommodation', 'hotel', 'motel', 'hostel'], '#44a989',
          ['landmark_and_historical_building', 'monument', 'museum', 'attraction', 'tourist_attraction'], '#d7a63d',
          '#685cf0'
        ],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.6, 8, 2.6, 12, 4.2, 16, 6.5],
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 0.25, 10, 0.75, 15, 1.2],
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.88
      }
    }, beforeId);
  }
  if (!map.getLayer(labelsId)) {
    map.addLayer({
      id: labelsId,
      type: 'symbol',
      source: sourceId,
      'source-layer': 'place',
      minzoom: 13,
      layout: {
        'text-field': ['coalesce', ['get', '@name'], ['get', 'name'], ''],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 17, 13],
        'text-font': ['Noto Sans Regular'],
        'text-offset': [0, 1.05],
        'text-anchor': 'top',
        'text-max-width': 10,
        'text-optional': true
      },
      paint: {
        'text-color': '#303447',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.4,
        'text-halo-blur': 0.2
      }
    }, beforeId);
  }
  setOverturePlaceCategory(map, options.category || 'all', { dotsId, labelsId });
  setOverturePlacesVisible(map, options.visible !== false, { dotsId, labelsId });
  return { sourceId, dotsId, labelsId, release, url };
}

export function setOverturePlaceCategory(map, category = 'all', options = {}) {
  const ids = [options.dotsId || OVERTURE_PLACES_DOTS_ID, options.labelsId || OVERTURE_PLACES_LABELS_ID];
  const group = PLACE_CATEGORY_GROUPS[category] === undefined ? null : PLACE_CATEGORY_GROUPS[category];
  const filter = group ? ['in', ['get', '@category'], ['literal', group]] : null;
  ids.forEach((id) => {
    if (!map.getLayer(id)) return;
    if (filter) map.setFilter(id, filter);
    else map.setFilter(id, null);
  });
  return category;
}

export function setOverturePlacesVisible(map, visible, options = {}) {
  const visibility = visible ? 'visible' : 'none';
  [options.dotsId || OVERTURE_PLACES_DOTS_ID, options.labelsId || OVERTURE_PLACES_LABELS_ID].forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
  });
  return Boolean(visible);
}

export function bindOverturePlacePopups(map, maplibregl, options = {}) {
  const dotsId = options.dotsId || OVERTURE_PLACES_DOTS_ID;
  if (!map || !maplibregl || typeof maplibregl.Popup !== 'function') return;
  const handler = (event) => {
    const feature = event.features && event.features[0];
    if (!feature) return;
    const p = feature.properties || {};
    const name = p['@name'] || p.name || 'Unnamed place';
    const category = String(p['@category'] || 'place').replace(/_/g, ' ');
    const wrap = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = String(name);
    heading.style.display = 'block';
    heading.style.marginBottom = '4px';
    const detail = document.createElement('span');
    detail.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    detail.style.fontSize = '12px';
    wrap.append(heading, detail);
    if (p.confidence !== undefined && p.confidence !== null && p.confidence !== '') {
      const confidence = document.createElement('div');
      confidence.textContent = 'Source confidence: ' + String(p.confidence);
      confidence.style.marginTop = '6px';
      confidence.style.fontSize = '11px';
      confidence.style.color = '#707687';
      wrap.append(confidence);
    }
    new maplibregl.Popup({ closeButton: true, maxWidth: '280px', offset: 8 })
      .setLngLat(event.lngLat)
      .setDOMContent(wrap)
      .addTo(map);
  };
  map.on('click', dotsId, handler);
  map.on('mouseenter', dotsId, () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', dotsId, () => { map.getCanvas().style.cursor = ''; });
}
