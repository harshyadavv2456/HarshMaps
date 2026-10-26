const EARTH_RADIUS_METERS = 6_371_008.8;

function validLngLat(value) {
  return Array.isArray(value) && value.length >= 2 &&
    Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1])) &&
    Number(value[0]) >= -180 && Number(value[0]) <= 180 &&
    Number(value[1]) >= -90 && Number(value[1]) <= 90;
}

function textValue(value) {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    return text && text !== '[object Object]' ? text : '';
  }
  return '';
}

/** Great-circle distance between [longitude, latitude] coordinates. */
export function haversineDistanceMeters(from, to) {
  if (!validLngLat(from) || !validLngLat(to)) {
    throw new TypeError('Coordinates must be valid [longitude, latitude] pairs.');
  }
  const radians = (degrees) => Number(degrees) * Math.PI / 180;
  const lat1 = radians(from[1]);
  const lat2 = radians(to[1]);
  const deltaLat = lat2 - lat1;
  const deltaLng = radians(Number(to[0]) - Number(from[0]));
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function formatDistance(meters) {
  const distance = Number(meters);
  if (!Number.isFinite(distance) || distance < 0) return 'Distance unavailable';
  if (distance < 1000) return Math.max(0, Math.round(distance / 10) * 10) + ' m';
  return (distance < 10_000 ? distance / 1000 : Math.round(distance / 1000))
    .toFixed(distance < 10_000 ? 1 : 0) + ' km';
}

/** Convert one rendered Overture point into a safe, app-friendly place record. */
export function normalizeOvertureFeature(feature) {
  const coordinates = feature && feature.geometry && feature.geometry.coordinates;
  if (!validLngLat(coordinates)) return null;
  const properties = feature.properties && typeof feature.properties === 'object'
    ? feature.properties : {};
  const name = textValue(properties['@name']) ||
    textValue(properties.name) ||
    textValue(properties.primary_name);
  if (!name) return null;

  let category = textValue(properties.basic_category) ||
    textValue(properties['@category']) ||
    textValue(properties.primary_category) ||
    textValue(properties.category) ||
    textValue(properties.subtype) ||
    textValue(properties.class) || 'place';
  category = category.replace(/_/g, ' ');
  const street = textValue(properties.street) ||
    textValue(properties.address) ||
    textValue(properties.addresses);
  const city = textValue(properties.locality) ||
    textValue(properties.city) ||
    textValue(properties.neighborhood);
  const state = textValue(properties.region) ||
    textValue(properties.state) ||
    textValue(properties.admin1);
  const country = textValue(properties.country);
  const label = [name, street, city, state, country]
    .filter((value, index, all) => value && all.findIndex(other =>
      other.toLowerCase() === value.toLowerCase()) === index)
    .join(', ');

  return {
    id: textValue(feature.id) || [Number(coordinates[0]).toFixed(5), Number(coordinates[1]).toFixed(5)].join(','),
    name,
    label: label || name,
    coordinates: [Number(coordinates[0]), Number(coordinates[1])],
    city,
    state,
    country,
    street,
    category,
    properties
  };
}

/**
 * Deduplicate labeled rendered places and rank them by straight-line distance
 * from the current map center. Results are scoped to the visible map tiles.
 */
export function rankNearbyPlaces(features, center, options = {}) {
  if (!validLngLat(center)) {
    throw new TypeError('The nearby-results center must be [longitude, latitude].');
  }
  const requestedLimit = Number(options.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 20;
  const unique = new Map();

  for (const feature of Array.isArray(features) ? features : []) {
    const place = normalizeOvertureFeature(feature);
    if (!place) continue;
    const key = place.name.toLocaleLowerCase() + ':' +
      place.coordinates[0].toFixed(3) + ':' + place.coordinates[1].toFixed(3);
    const distanceMeters = haversineDistanceMeters(center, place.coordinates);
    const existing = unique.get(key);
    if (!existing || distanceMeters < existing.distanceMeters) {
      unique.set(key, { ...place, distanceMeters });
    }
  }

  return [...unique.values()]
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name))
    .slice(0, limit);
}
