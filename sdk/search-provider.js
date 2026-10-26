import { detectPlaceCategory, extractCategoryLocation } from './search-intent.js';

export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
export const OVERPASS_ENDPOINTS = Object.freeze([
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
]);

const MAX_QUERY_LENGTH = 120;
const DEFAULT_RADIUS_METERS = 15_000;
const KNOWN_BRANDS = Object.freeze([
  { pattern: /\b(?:sbi|state bank of india)\b/i, expression: 'SBI|State Bank of India|State Bank India' },
  { pattern: /\bhdfc\b/i, expression: 'HDFC|HDFC Bank' },
  { pattern: /\bicici\b/i, expression: 'ICICI|ICICI Bank' },
  { pattern: /\baxis\b/i, expression: 'Axis Bank|Axis' },
  { pattern: /\bkotak\b/i, expression: 'Kotak|Kotak Mahindra Bank' },
  { pattern: /\b(?:bob|bank of baroda)\b/i, expression: 'Bank of Baroda|BoB' },
  { pattern: /\bpunjab national bank\b|\bpnb\b/i, expression: 'Punjab National Bank|PNB' },
  { pattern: /\bcanara bank\b|\bcanara\b/i, expression: 'Canara Bank|Canara' },
  { pattern: /\bindian bank\b/i, expression: 'Indian Bank' },
  { pattern: /\bunion bank\b/i, expression: 'Union Bank of India|Union Bank' },
  { pattern: /\bbank of india\b/i, expression: 'Bank of India' }
]);

const CATEGORY_TAGS = Object.freeze({
  banks: [
    ['amenity', 'atm'], ['amenity', 'bank']
  ],
  food: [
    ['amenity', 'restaurant'], ['amenity', 'fast_food'], ['amenity', 'food_court'],
    ['amenity', 'ice_cream'], ['amenity', 'cafe']
  ],
  shopping: [
    ['shop', 'supermarket'], ['shop', 'convenience'], ['shop', 'mall'],
    ['shop', 'department_store'], ['shop', 'clothes'], ['shop', 'bakery']
  ],
  health: [
    ['amenity', 'hospital'], ['amenity', 'clinic'], ['amenity', 'doctors'],
    ['amenity', 'dentist'], ['amenity', 'pharmacy'], ['healthcare', 'doctor'],
    ['healthcare', 'clinic'], ['healthcare', 'hospital'], ['healthcare', 'pharmacy']
  ],
  education: [
    ['amenity', 'school'], ['amenity', 'college'], ['amenity', 'university'],
    ['amenity', 'kindergarten']
  ],
  lodging: [
    ['tourism', 'hotel'], ['tourism', 'hostel'], ['tourism', 'guest_house'],
    ['tourism', 'motel']
  ],
  landmarks: [
    ['tourism', 'museum'], ['tourism', 'attraction'], ['historic', 'monument'],
    ['historic', 'memorial'], ['leisure', 'park'], ['tourism', 'viewpoint']
  ],
  services: [
    ['amenity', 'fuel'], ['amenity', 'post_office'], ['amenity', 'police'],
    ['amenity', 'fire_station'], ['amenity', 'government']
  ]
});

const CATEGORY_WORDS = Object.freeze({
  banks: /\b(?:bank|banks|atm|atms|cash machine|cash machines|branch|branches)\b/i,
  food: /\b(?:restaurant|restaurants|cafe|cafes|coffee shop|coffee shops|fast food|food)\b/i,
  shopping: /\b(?:shop|shops|store|stores|shopping|supermarket|supermarkets|grocery|groceries)\b/i,
  health: /\b(?:hospital|hospitals|clinic|clinics|pharmacy|pharmacies|doctor|doctors|dentist|dentists|gynecologist|gynecologists|gynaecologist|gynaecologists|urologist|urologists)\b/i,
  education: /\b(?:school|schools|college|colleges|university|universities)\b/i,
  lodging: /\b(?:hotel|hotels|hostel|hostels|motel|motels)\b/i,
  landmarks: /\b(?:monument|monuments|museum|museums|landmark|landmarks|attraction|attractions|temple|temples|church|churches|mosque|mosques|park|parks)\b/i,
  services: /\b(?:gas station|petrol pump|post office|government office|police station|fire station)\b/i
});

function validCenter(center) {
  return Array.isArray(center) && center.length >= 2 &&
    Number.isFinite(Number(center[0])) && Number.isFinite(Number(center[1])) &&
    Number(center[0]) >= -180 && Number(center[0]) <= 180 &&
    Number(center[1]) >= -90 && Number(center[1]) <= 90;
}

function safeText(value) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().slice(0, 180) : '';
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function timeoutSignal(signal, timeoutMs = 9_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Search request timed out.', 'TimeoutError')), timeoutMs);
  const abort = () => controller.abort(signal.reason || new DOMException('Search cancelled.', 'AbortError'));
  if (signal) {
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', abort);
    }
  };
}

export function normalizeSearchQuery(query) {
  return String(query || '').trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH);
}

export function inferPlaceCategory(query) {
  const exact = detectPlaceCategory(query);
  if (exact) return exact;
  const text = normalizeSearchQuery(query)
    .replace(/\b(?:near me|around me|nearby)\b/ig, ' ')
    .replace(/\b(?:in|near|around|within)\s+.+$/i, ' ')
    .replace(/\b(?:find|show|search|please|me|the|best|nearest|closest)\b/ig, ' ')
    .replace(/\s+/g, ' ').trim();
  for (const [id, pattern] of Object.entries(CATEGORY_WORDS)) {
    if (pattern.test(text)) {
      return {
        id,
        title: ({
          banks: 'Banks & ATMs', food: 'Food & drink', shopping: 'Shops & retail',
          health: 'Healthcare', education: 'Schools & universities', lodging: 'Hotels & accommodation',
          landmarks: 'Landmarks & attractions', services: 'Public services & fuel'
        })[id],
        terms: []
      };
    }
  }
  return null;
}

export function brandExpression(query) {
  const q = normalizeSearchQuery(query)
    .replace(/\b(?:near me|around me|nearby)\b/ig, ' ')
    .replace(/\b(?:in|near|around|within)\s+.+$/i, ' ')
    .replace(/\b(?:atm|atms|bank|banks|branch|branches|office|offices)\b/ig, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!q) return '';
  const known = KNOWN_BRANDS.find(item => item.pattern.test(q));
  if (known) return known.expression;
  if (/^[A-Z0-9]{2,8}$/.test(q)) return escapeRegex(q);
  return escapeRegex(q);
}

function categorySelectors(categoryId, lat, lon, radius) {
  const tags = CATEGORY_TAGS[categoryId] || [];
  return tags.map(([key, value]) =>
    '  nwr(around:' + radius + ',' + lat + ',' + lon + ')[' + JSON.stringify(key) + '=' + JSON.stringify(value) + '];'
  );
}

export function buildOverpassQuery(query, center, options = {}) {
  if (!validCenter(center)) throw new TypeError('A valid nearby-search center is required.');
  const q = normalizeSearchQuery(query);
  if (q.length < 2) throw new TypeError('Search query must contain at least two characters.');
  const radiusValue = Number(options.radiusMeters);
  const radius = Math.min(50_000, Math.max(500, Number.isFinite(radiusValue) ? Math.round(radiusValue) : DEFAULT_RADIUS_METERS));
  const lat = Number(center[1]).toFixed(6);
  const lon = Number(center[0]).toFixed(6);
  const category = options.category || inferPlaceCategory(q);
  const brand = brandExpression(q);
  const hasBrandOrSpecificName = Boolean(brand) && !(
    category && !/\b(?:sbi|hdfc|icici|axis|kotak|canara|pnb|bob|union bank|indian bank)\b/i.test(q)
  );

  let selectors = [];
  if (category && !hasBrandOrSpecificName) {
    selectors = categorySelectors(category.id, lat, lon, radius);
  } else if (category && hasBrandOrSpecificName) {
    const regex = escapeRegex(brand).replace(/\\\|/g, '|');
    selectors = [
      '  nwr(around:' + radius + ',' + lat + ',' + lon + ')["name"~' + JSON.stringify(regex) + ',i]["amenity"~"^(atm|bank)$"];',
      '  nwr(around:' + radius + ',' + lat + ',' + lon + ')["brand"~' + JSON.stringify(regex) + ',i];',
      '  nwr(around:' + radius + ',' + lat + ',' + lon + ')["operator"~' + JSON.stringify(regex) + ',i];'
    ];
  } else {
    const regex = brand || escapeRegex(q);
    selectors = [
      '  nwr(around:' + radius + ',' + lat + ',' + lon + ')["name"~' + JSON.stringify(regex) + ',i];',
      '  nwr(around:' + radius + ',' + lat + ',' + lon + ')["brand"~' + JSON.stringify(regex) + ',i];',
      '  nwr(around:' + radius + ',' + lat + ',' + lon + ')["operator"~' + JSON.stringify(regex) + ',i];'
    ];
  }
  if (!selectors.length) throw new Error('No OpenStreetMap query could be formed for this search.');
  return '[out:json][timeout:10];\n(\n' + selectors.join('\n') + '\n);\nout center tags 100;';
}

function elementToPlace(element) {
  const tags = element && element.tags && typeof element.tags === 'object' ? element.tags : {};
  const lat = Number(element.lat ?? element.center?.lat);
  const lon = Number(element.lon ?? element.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const name = safeText(tags.name || tags['name:en'] || tags.brand || tags.operator);
  if (!name) return null;
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const city = safeText(tags['addr:city'] || tags['addr:suburb'] || tags['addr:district']);
  const state = safeText(tags['addr:state']);
  const country = safeText(tags['addr:country']);
  const category = safeText(tags.amenity || tags.shop || tags.office || tags.healthcare || tags.tourism || tags.historic || tags.leisure || tags.craft || 'place').replace(/_/g, ' ');
  const id = String(element.type || 'osm') + ':' + String(element.id ?? lon + ',' + lat);
  const properties = {
    ...tags,
    osm_type: element.type,
    osm_id: element.id,
    brand: safeText(tags.brand),
    operator: safeText(tags.operator),
    wikipedia: safeText(tags.wikipedia),
    wikidata: safeText(tags.wikidata),
    website: safeText(tags.website || tags['contact:website']),
    population: safeText(tags.population),
    source: 'OpenStreetMap'
  };
  const label = [name, street, city, state, country]
    .filter((part, index, all) => part && all.findIndex(other => other.toLowerCase() === String(part).toLowerCase()) === index)
    .join(', ');
  return {
    id, name, label: label || name, coordinates: [lon, lat], city, state, country, street,
    postcode: safeText(tags['addr:postcode']), district: safeText(tags['addr:district'] || tags['addr:suburb']),
    category, layer: category, properties, source: 'OpenStreetMap'
  };
}

function normalizeNominatimResult(item) {
  const lat = Number(item && item.lat);
  const lon = Number(item && item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const address = item.address && typeof item.address === 'object' ? item.address : {};
  const name = safeText(item.name || address.amenity || address.shop || address.tourism || (item.display_name || '').split(',')[0]);
  const category = safeText(item.type || item.category || address.amenity || address.shop || 'place');
  const props = { ...item, ...address, importance: Number(item.importance) || 0, source: 'Nominatim' };
  return {
    id: 'nominatim:' + String(item.place_id || lon + ',' + lat),
    name: name || 'Unnamed place',
    label: safeText(item.display_name || name),
    coordinates: [lon, lat],
    city: safeText(address.city || address.town || address.village || address.suburb),
    state: safeText(address.state),
    country: safeText(address.country),
    street: safeText(address.road || address.pedestrian),
    postcode: safeText(address.postcode),
    district: safeText(address.city_district || address.county || address.suburb),
    category, layer: category, properties: props, source: 'Nominatim'
  };
}

export async function searchNominatim(query, options = {}) {
  const q = normalizeSearchQuery(query);
  if (q.length < 2) return [];
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', String(Math.min(10, Math.max(1, Math.floor(Number(options.limit) || 5)))));
  if (options.countryCode) url.searchParams.set('countrycodes', String(options.countryCode).toLowerCase());
  const timed = timeoutSignal(options.signal, options.timeoutMs || 8_000);
  try {
    const response = await (options.fetchImpl || fetch)(url.toString(), {
      headers: { Accept: 'application/json' }, signal: timed.signal
    });
    if (!response.ok) throw new Error('Nominatim returned HTTP ' + response.status + '.');
    const json = await response.json();
    return (Array.isArray(json) ? json : []).map(normalizeNominatimResult).filter(Boolean);
  } finally {
    timed.cleanup();
  }
}

export async function searchOverpassPlaces(query, options = {}) {
  if (!validCenter(options.center)) throw new TypeError('A valid center is required for nearby business search.');
  const q = normalizeSearchQuery(query);
  const category = options.category || inferPlaceCategory(q);
  const statement = buildOverpassQuery(q, options.center, { ...options, category });
  const endpoints = Array.isArray(options.endpoints) && options.endpoints.length ? options.endpoints : OVERPASS_ENDPOINTS;
  let lastError = null;
  for (const endpoint of endpoints) {
    if (options.signal?.aborted) throw options.signal.reason || new DOMException('Search cancelled.', 'AbortError');
    const url = new URL(endpoint);
    url.searchParams.set('data', statement);
    const timed = timeoutSignal(options.signal, options.timeoutMs || 9_000);
    try {
      const response = await (options.fetchImpl || fetch)(url.toString(), {
        headers: { Accept: 'application/json' }, signal: timed.signal
      });
      if (!response.ok) throw new Error('OpenStreetMap nearby search returned HTTP ' + response.status + '.');
      const json = await response.json();
      const elements = Array.isArray(json.elements) ? json.elements : [];
      const deduped = new Map();
      for (const item of elements) {
        const place = elementToPlace(item);
        if (place) deduped.set(place.id, place);
      }
      return [...deduped.values()];
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted) throw options.signal.reason || error;
    } finally {
      timed.cleanup();
    }
  }
  throw lastError || new Error('All OpenStreetMap nearby-search endpoints are unavailable.');
}

function normalizedQueryTerms(query) {
  const location = extractCategoryLocation(query);
  let text = normalizeSearchQuery(query);
  if (location) text = text.slice(0, Math.max(0, text.toLowerCase().lastIndexOf(location.toLowerCase())));
  text = text.replace(/\b(?:near me|around me|nearby)\b/ig, ' ');
  return text.replace(/[^\p{L}\p{N}]+/gu, ' ').toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function recommendationScore(place, query, center, category) {
  const terms = normalizedQueryTerms(query);
  const name = safeText(place.name).toLowerCase();
  const label = safeText(place.label).toLowerCase();
  const p = place.properties || {};
  const brand = safeText(p.brand || p.operator).toLowerCase();
  const haystack = [name, label, brand].join(' ');
  let relevance = 0;
  if (terms.length && name === terms.join(' ')) relevance += 100;
  else if (terms.length && name.startsWith(terms.join(' '))) relevance += 75;
  else if (terms.length && name.includes(terms.join(' '))) relevance += 55;
  if (terms.some(term => term.length > 1 && haystack.includes(term))) relevance += 20;
  if (category && category.id && category.id === inferPlaceCategory(place.category)?.id) relevance += 22;
  const brandInfo = KNOWN_BRANDS.find(item => item.pattern.test(query));
  if (brandInfo && brandInfo.pattern.test([name, brand].join(' '))) relevance += 65;
  if (brandInfo && brand && brandInfo.pattern.test(brand)) relevance += 35;

  let distanceMeters = Number.isFinite(Number(place.distanceMeters)) ? Number(place.distanceMeters) : null;
  if (validCenter(center) && validCenter(place.coordinates)) {
    const toRadians = degrees => degrees * Math.PI / 180;
    const lat1 = toRadians(center[1]), lat2 = toRadians(place.coordinates[1]);
    const dLat = lat2 - lat1, dLon = toRadians(place.coordinates[0] - center[0]);
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    distanceMeters = 12_742_017.6 * Math.asin(Math.sqrt(Math.min(1,a)));
  }
  const proximity = distanceMeters === null ? 0 : 42 * Math.exp(-distanceMeters / 7000);
  const importance = Math.max(0, Math.min(1, Number(p.importance) || 0));
  const notable = Boolean(p.wikipedia || p.wikidata || p.population || importance >= 0.65);
  const popularity = (p.wikipedia || p.wikidata ? 16 : 0) + (p.population ? 8 : 0) + Math.round(importance * 12);
  const reasons = [];
  if (relevance >= 75) reasons.push('Strong name match');
  else if (relevance >= 20) reasons.push('Relevant match');
  if (distanceMeters !== null && distanceMeters <= 1500) reasons.push('Nearby');
  if (notable) reasons.push('Notability signal in map data');
  const score = relevance * 0.62 + proximity + popularity;
  return {
    ...place,
    distanceMeters,
    recommendationScore: Math.round(score * 10) / 10,
    recommendationReasons: reasons,
    notable,
    source: place.source || safeText(p.source) || 'Photon'
  };
}

export function rankSearchRecommendations(places, query, center, options = {}) {
  const category = options.category || inferPlaceCategory(query);
  const deduped = new Map();
  for (const place of Array.isArray(places) ? places : []) {
    if (!place || !validCenter(place.coordinates)) continue;
    const ranked = recommendationScore(place, query, center, category);
    const key = String(place.id || (place.name + ':' + place.coordinates.join(','))).toLowerCase();
    const existing = deduped.get(key);
    if (!existing || ranked.recommendationScore > existing.recommendationScore) deduped.set(key, ranked);
  }
  const results = [...deduped.values()].sort((a, b) =>
    b.recommendationScore - a.recommendationScore ||
    (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity) ||
    String(a.name).localeCompare(String(b.name))
  );
  const nearest = results.reduce((best, item) =>
    item.distanceMeters !== null && (best === null || item.distanceMeters < best.distanceMeters) ? item : best, null);
  return results.slice(0, Math.min(20, Math.max(1, Number(options.limit) || 10))).map((place, index) => ({
    ...place,
    recommendationBadge: place.notable ? 'Notable' : index === 0 ? 'Recommended' : nearest && place.id === nearest.id ? 'Nearest' : ''
  }));
}

export async function searchPlacesResilient(query, options = {}) {
  const q = normalizeSearchQuery(query);
  if (q.length < 2) return { places: [], provider: 'none', errors: [] };
  const live = Boolean(options.live);
  const locationQuery = extractCategoryLocation(q);
  let center = validCenter(options.center) ? options.center : null;
  let effectiveQuery = q;
  let locationResolution = null;
  const errors = [];
  let photonPlaces = [];

  if (locationQuery && options.allowNominatimFallback && !options.areaCoordinates) {
    try {
      const locations = await searchNominatim(locationQuery, {
        limit: 5, signal: options.signal, fetchImpl: options.fetchImpl
      });
      if (locations.length) {
        const lead = locationQuery.split(',')[0].trim().toLowerCase();
        locationResolution = locations.find(place => place.name.toLowerCase() === lead) ||
          locations.find(place => place.label.toLowerCase().includes(lead)) || locations[0];
        center = locationResolution.coordinates;
      }
    } catch (error) {
      if (options.signal?.aborted) throw error;
      errors.push('Location fallback: ' + (error.message || 'unavailable'));
    }
  }
  if (locationQuery) {
    const idx = q.toLowerCase().lastIndexOf(locationQuery.toLowerCase());
    if (idx > 0) effectiveQuery = q.slice(0, Math.max(0, idx)).replace(/\b(?:in|near|around|within)\s*$/i, '').trim() || q;
  }

  if (typeof options.photonSearch === 'function') {
    try {
      const result = await options.photonSearch(effectiveQuery, {
        center, signal: options.signal, live,
        limit: options.limit || (live ? 7 : 10)
      });
      photonPlaces = Array.isArray(result) ? result : [];
    } catch (error) {
      if (options.signal?.aborted || error?.name === 'AbortError') throw error;
      errors.push('Photon: ' + (error.message || 'request failed'));
    }
  }

  const category = inferPlaceCategory(effectiveQuery);
  const brandQuery = brandExpression(effectiveQuery);
  const hasExplicitLocation = Boolean(locationQuery);
  const shouldSearchOpenStreetMap = validCenter(center) &&
    (!hasExplicitLocation || Boolean(locationResolution) || Boolean(options.areaCoordinates)) &&
    (Boolean(category) || Boolean(brandQuery) && (live ? (effectiveQuery.length >= 3 && !/[,\d]/.test(effectiveQuery)) : true)) &&
    (!live || !hasExplicitLocation || Boolean(options.areaCoordinates));

  let osmPlaces = [];
  if (shouldSearchOpenStreetMap && options.includeNearby !== false) {
    try {
      osmPlaces = await searchOverpassPlaces(effectiveQuery, {
        center, category, signal: options.signal, fetchImpl: options.fetchImpl,
        endpoints: options.overpassEndpoints, radiusMeters: options.radiusMeters,
        timeoutMs: options.overpassTimeoutMs
      });
    } catch (error) {
      if (options.signal?.aborted || error?.name === 'AbortError') throw error;
      errors.push('OpenStreetMap nearby search: ' + (error.message || 'request failed'));
    }
  }

  const combined = [...photonPlaces, ...osmPlaces];
  let nominatimPlaces = [];
  if (!combined.length && options.allowNominatimFallback) {
    try {
      nominatimPlaces = await searchNominatim(effectiveQuery, {
        limit: options.limit || 10, signal: options.signal,
        fetchImpl: options.fetchImpl, countryCode: options.countryCode
      });
    } catch (error) {
      if (options.signal?.aborted || error?.name === 'AbortError') throw error;
      errors.push('Nominatim fallback: ' + (error.message || 'request failed'));
    }
  }
  if (locationResolution && !combined.length && !nominatimPlaces.some(place => place.id === locationResolution.id)) {
    nominatimPlaces.push(locationResolution);
  }
  const results = rankSearchRecommendations(
    [...combined, ...nominatimPlaces], q, center,
    { category: inferPlaceCategory(q), limit: options.limit || (live ? 8 : 20) }
  );
  return {
    places: results,
    provider: osmPlaces.length && photonPlaces.length ? 'Photon + OpenStreetMap' :
      osmPlaces.length ? 'OpenStreetMap nearby search' :
      photonPlaces.length ? 'Photon' :
      nominatimPlaces.length ? 'Nominatim fallback' : 'none',
    center,
    locationResolution,
    errors
  };
}
