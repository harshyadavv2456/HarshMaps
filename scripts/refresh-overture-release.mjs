import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const METADATA_PATH = resolve(ROOT, 'data/overture-release.json');
export const OVERTURE_STAC_URL = 'https://stac.overturemaps.org/catalog.json';
export const OVERTURE_TILES_BASE = 'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles';

export function validRelease(release) {
  if (typeof release !== 'string' || !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(release)) return false;
  const date = release.slice(0, 10);
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

export function releaseRecord(release) {
  if (!validRelease(release)) throw new TypeError('STAC returned an invalid Overture release identifier.');
  return {
    provider: 'Overture Maps Foundation',
    release,
    source_url: OVERTURE_TILES_BASE + '/' + release + '/places.pmtiles',
    release_cadence: 'monthly',
    purpose: 'experimental global places layer; public inspection tiles'
  };
}

export async function refreshRelease({ fetchImpl = fetch, metadataPath = METADATA_PATH, log = console.log } = {}) {
  const response = await fetchImpl(OVERTURE_STAC_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('Overture STAC catalog returned HTTP ' + response.status);
  const catalog = await response.json();
  const next = releaseRecord(catalog && catalog.latest);
  let current = null;
  try {
    current = JSON.parse(await readFile(metadataPath, 'utf8'));
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
  if (current && current.release === next.release && current.source_url === next.source_url) {
    log('Overture Places remains on release ' + next.release + '; no file update needed.');
    return { changed: false, release: next.release };
  }
  await writeFile(metadataPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  log('Updated Overture Places release to ' + next.release + '.');
  return { changed: true, release: next.release };
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  refreshRelease().catch((error) => {
    console.error('[overture-release-refresh] ' + (error && error.message ? error.message : String(error)));
    process.exitCode = 1;
  });
}
