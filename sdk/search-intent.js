export const PLACE_CATEGORY_SEARCH = Object.freeze([
  { id: 'banks', title: 'Banks & ATMs', terms: ['bank', 'banks', 'atm', 'atms', 'cash machine', 'cash machines', 'cash withdrawal'], icon: '▤' },
  { id: 'food', title: 'Food & drink', terms: ['restaurant', 'restaurants', 'cafe', 'cafes', 'coffee shop', 'coffee shops', 'fast food', 'food', 'vegetarian restaurants', 'vegan restaurants', 'pizza restaurants', 'biryani restaurants', 'bakeries', 'dhabas', 'street food', 'breakfast restaurants', 'sweet shops'], icon: '♨' },
  { id: 'shopping', title: 'Shops & retail', terms: ['shop', 'shops', 'store', 'stores', 'shopping', 'supermarket', 'supermarkets', 'grocery', 'groceries', 'shopping malls', 'grocery stores'], icon: '◇' },
  { id: 'health', title: 'Healthcare', terms: ['hospital', 'hospitals', 'clinic', 'clinics', 'pharmacy', 'pharmacies', 'doctor', 'doctors', 'dentist', 'dentists', 'gynecologist', 'gynecologists', 'gynaecologist', 'gynaecologists', 'urologist', 'urologists'], icon: '+' },
  { id: 'education', title: 'Schools & universities', terms: ['school', 'schools', 'college', 'colleges', 'university', 'universities', 'library', 'libraries'], icon: '⌂' },
  { id: 'lodging', title: 'Hotels & accommodation', terms: ['hotel', 'hotels', 'hostel', 'hostels', 'motel', 'motels'], icon: '⌑' },
  { id: 'landmarks', title: 'Landmarks & attractions', terms: ['monument', 'monuments', 'museum', 'museums', 'landmark', 'landmarks', 'attraction', 'attractions', 'temple', 'temples', 'church', 'churches', 'mosque', 'mosques'], icon: '⌖' },
  { id: 'services', title: 'Public services & fuel', terms: ['gas station', 'gas stations', 'petrol pump', 'petrol pumps', 'post office', 'post offices', 'government office', 'government offices', 'public toilets'], icon: '↗' },
  { id: 'transport', title: 'Transport & charging', terms: ['airport', 'airports', 'railway stations', 'train stations', 'metro stations', 'bus stations', 'bus stops', 'ev charging stations'], icon: '↗' },
  { id: 'fitness', title: 'Fitness & recreation', terms: ['gym', 'gyms', 'gyms and fitness centres', 'fitness centre', 'fitness centres', 'yoga studios', 'swimming pools'], icon: '◉' },
  { id: 'outdoors', title: 'Parks & outdoors', terms: ['park', 'parks', 'garden', 'gardens', 'parks and gardens', 'playgrounds', 'playgrounds and parks', 'nature reserve', 'walking trail', 'hiking trail'], icon: '❋' },
  { id: 'personal', title: 'Personal services', terms: ['salon', 'salons', 'barbershops', 'laundromats', 'dry cleaners'], icon: '✂' }
]);

function normalizeQuery(query) {
  return String(query || '')
    .toLowerCase()
    .trim()
    .replace(/[.,!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:please\s+)?(?:where\s+can\s+i\s+find|can\s+you\s+find|find\s+me|find|show\s+me|show|search(?:\s+for)?|look\s+for|give\s+me|i\s+need|i\s+want)\s+/, '')
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
