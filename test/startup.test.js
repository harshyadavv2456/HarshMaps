import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appPath = new URL('../app.js', import.meta.url);
const indexPath = new URL('../index.html', import.meta.url);

test('quick-city controls use the all-elements selector', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /\$\$\('\[data-query\]'\)\.forEach/);
  assert.doesNotMatch(source, /(?:^|\n)\$\('\[data-query\]'\)\.forEach/m);
});

test('map startup listeners register before optional UI handlers', async () => {
  const source = await readFile(appPath, 'utf8');
  const loadListener = source.indexOf("map.on('load'");
  const quickCityHandler = source.indexOf("$$('[data-query]').forEach");
  const tabHandler = source.indexOf("$$('.tab').forEach");
  assert.notEqual(loadListener, -1, 'Map load listener should exist');
  assert.notEqual(quickCityHandler, -1, 'Quick-city handler should exist');
  assert.notEqual(tabHandler, -1, 'Tab handler should exist');
  assert.ok(loadListener < quickCityHandler, 'Map startup listener must register before quick-city UI handlers');
  assert.ok(loadListener < tabHandler, 'Map startup listener must register before tab handlers');
});

test('map startup has a raster fallback and terminal error state', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /mapStartupTimer\s*=\s*setTimeout/);
  assert.match(source, /map\.setStyle\(RASTER_FALLBACK_STYLE\)/);
  assert.match(source, /Map services did not respond/);
});

test('the main search handler exists and the search input exposes its dropdown', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.ok(source.includes('async function search(query,options={})'));
  assert.ok(source.includes('function renderSearchSuggestions('));
  assert.ok(source.includes("search($('#place-query').value,{live:false})"));
});

test('the served homepage contains the autocomplete dropdown and correct cache version', async () => {
  const html = await readFile(indexPath, 'utf8');
  assert.match(html, /id="search-suggestions"/);
  assert.match(html, /aria-controls="search-suggestions"/);
  assert.ok(html.includes('app.js?v=20261026-12'));
});


test('homepage exposes local AI, natural language feedback, and category shortcuts', async () => {
  const html = await readFile(indexPath, 'utf8');
  const app = await readFile(appPath, 'utf8');
  assert.match(html, /id="enable-local-ai"/);
  assert.match(html, /id="query-understanding"/);
  assert.match(html, /data-map-query="ATMs near me"/);
  assert.match(app, /understandMapQuery\(q\)/);
  assert.match(app, /interpretWithLocalModel\(q\)/);
});
