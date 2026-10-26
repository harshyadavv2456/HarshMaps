export const PLACE_CATEGORY_SEARCH = Object.freeze([
  { id: 'banks', title: 'Banks & ATMs', terms: ['bank', 'banks', 'atm', 'atms', 'cash machine', 'cash machines'], icon: '▤' },
  { id: 'food', title: 'Food & drink', terms: ['restaurant', 'restaurants', 'cafe', 'cafes', 'coffee shop', 'coffee shops', 'fast food', 'food'], icon: '♨' },
  { id: 'shopping', title: 'Shops & retail', terms: ['shop', 'shops', 'store', 'stores', 'shopping', 'supermarket', 'supermarkets', 'grocery', 'groceries'], icon: '◇' },
  { id: 'health', title: 'Healthcare', terms: ['hospital', 'hospitals', 'clinic', 'clinics', 'pharmacy', 'pharmacies', 'doctor', 'doctors', 'dentist', 'dentists', 'gynecologist', 'gynecologists', 'gynaecologist', 'gynaecologists', 'urologist', 'urologists'], icon: '+' },
  { id: 'education', title: 'Schools & universities', terms: ['school', 'schools', 'college', 'colleges', 'university', 'universities'], icon: '⌂' },
  { id: 'lodging', title: 'Hotels & accommodation', terms: ['hotel', 'hotels', 'hostel', 'hostels', 'motel', 'motels'], icon: '⌑' },
  { id: 'landmarks', title: 'Landmarks & attractions', terms: ['monument', 'monuments', 'museum', 'museums', 'landmark', 'landmarks', 'attraction', 'attractions', 'temple', 'temples', 'church', 'churches', 'mosque', 'mosques'], icon: '⌖' },
  { id: 'services', title: 'Public services & fuel', terms: ['gas station', 'gas stations', 'petrol pump', 'petrol pumps', 'post office', 'post offices', 'government office', 'government offices'], icon: '↗' }
]);

function normalizeQuery(query) {
  return String(query || '')
    .toLowerCase()
    .trim()
    .replace(/[.,!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:please\s+)?(?:find|show|search(?:\s+for)?|look\s+for|give\s+me)\s+/, '')
    .replace(/^(?:the\s+)?(?:best|top|good|closest|nearest)\s+/, '')
    .replace(/\s+(?:in|near|around|within)\s+.+$/, '')
    .replace(/^(?:near\s+me|around\s+me|nearby)\s+/, '')
    .replace(/\b(?:near\s+me|nearby|around\s+me)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectPlaceCategory(query) {
  const normalized = normalizeQuery(query);
  return PLACE_CATEGORY_SEARCH.find(item => item.terms.includes(normalized)) || null;
}

/** Extract an explicitly typed location suffix, excluding device-relative phrases. */
export function extractCategoryLocation(query) {
  const match = String(query || '').trim().match(/\b(?:in|near|around|within)\s+(.+)$/i);
  if (!match) return '';
  const location = match[1].trim().replace(/[.,!?]+$/, '');
  if (!location || /^(?:me|near\s+me|nearby|around\s+me|here)$/i.test(location)) return '';
  return location;
}
