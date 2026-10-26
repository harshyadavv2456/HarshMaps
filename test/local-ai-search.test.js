import test from 'node:test';
import assert from 'node:assert/strict';
import { understandMapQuery, isLocalAIEnabled } from '../sdk/local-ai-search.js';

test('understands SBI branch phrased as an everyday request', () => {
  const result = understandMapQuery('where can I find the nearest SBI branch around me');
  assert.match(result.searchQuery, /SBI/i);
  assert.match(result.searchQuery, /near me/i);
  assert.equal(result.category.id, 'banks');
});

test('normalizes a natural vegetarian dinner request and keeps the city', () => {
  const result = understandMapQuery('show me some affordable vegetarian food for dinner in Nagpur');
  assert.equal(result.searchQuery, 'vegetarian restaurants in Nagpur');
  assert.equal(result.category.id, 'food');
  assert.ok(result.preferences.includes('vegetarian'));
  assert.ok(result.preferences.includes('budget'));
});

test('understands cash withdrawal as ATM discovery', () => {
  const result = understandMapQuery('I need to withdraw cash near me');
  assert.match(result.searchQuery, /ATMs near me/i);
  assert.equal(result.category.id, 'banks');
});

test('maps broad family activity requests to real map categories', () => {
  const result = understandMapQuery('somewhere nice to take kids around me');
  assert.match(result.searchQuery, /parks/i);
  assert.equal(result.category.id, 'outdoors');
  assert.ok(result.preferences.includes('family_friendly'));
});

test('keeps a specific brand and location while stripping filler', () => {
  const result = understandMapQuery('please find me an HDFC bank in Civil Lines, Nagpur');
  assert.match(result.searchQuery, /HDFC Bank/i);
  assert.match(result.searchQuery, /Civil Lines, Nagpur/i);
  assert.equal(result.category.id, 'banks');
});

test('leaves unfamiliar specific place names available to geocoding', () => {
  const result = understandMapQuery('Dolly ki Tapri Nagpur');
  assert.match(result.searchQuery, /Dolly ki Tapri Nagpur/i);
});

test('on-device AI starts opt-in and does not enable a model implicitly', () => {
  assert.equal(isLocalAIEnabled(), false);
});
