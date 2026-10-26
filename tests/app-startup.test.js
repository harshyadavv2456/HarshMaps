import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appPath = new URL('../app.js', import.meta.url);

test('quick-city controls use the all-elements selector', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /\$\$\('\[data-query\]'\)\.forEach/);
  assert.doesNotMatch(source, /(?:^|\n)\$\('\[data-query\]'\)\.forEach/m);
});

test('map startup events are registered before optional UI initialization', async () => {
  const source = await readFile(appPath, 'utf8');
  const loadListener = source.indexOf("map.on('load'");
  const quickCityHandler = source.indexOf("\$\$('[data-query]').forEach");
  const tabHandler = source.indexOf("$$('.tab').forEach(tab=>tab.addEventListener");
  assert.notEqual(loadListener, -1, 'Map load listener should exist');
  assert.notEqual(quickCityHandler, -1, 'Quick-city handler should exist');
  assert.ok(loadListener < quickCityHandler, 'Map startup listener must register before UI handlers');
  assert.ok(loadListener < tabHandler, 'Map startup listener must register before tab handlers');
});
