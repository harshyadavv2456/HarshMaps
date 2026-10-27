# HarshMaps

**Beautiful, configurable web maps without a required API key.**

HarshMaps is an open mapping toolkit built on [MapLibre GL JS](https://maplibre.org/) and [OpenFreeMap](https://openfreemap.org/). It combines an interactive demo, a dependency-light browser SDK, and copy/paste integration examples.

> **Reality check:** HarshMaps can deliver polished vector-map rendering and a strong set of mapping primitives. It cannot make free public data services equal to Google Maps or Mapbox in every dimension. Live traffic, globally consistent POI search, turn-by-turn navigation, uptime guarantees, and support need dedicated providers or self-hosted infrastructure.

## Try it

- Live site: https://harshyadavv2456.github.io/HarshMaps/
- [Worldwide Places layer and 15-minute release checker](docs/PROVIDERS.md#worldwide-places-layer--overture-maps)
- Repository: https://github.com/harshyadavv2456/HarshMaps
- [Free Integration Studio: iframe, website and mobile WebView](docs/FREE_INTEGRATION.md)
- [Integration guide](docs/INTEGRATION.md)
- [Provider and production guide](docs/PROVIDERS.md)

## Stack

| Capability | Default | API key | Notes |
|---|---|---:|---|
| Vector map rendering | MapLibre GL JS | No | Open-source WebGL renderer |
| Hosted vector tiles/styles | OpenFreeMap | No | Free public service; availability is not guaranteed |
| Global places overlay | Overture Maps Places PMTiles | No | Experimental public inspection tiles; source releases are monthly |
| Place/address search | Photon + OpenStreetMap nearby search + submit-only Nominatim fallback | No | Ranked, location-biased results; public services are best-effort |
| Driving, walking and cycling | OpenStreetMap FOSSGIS/OSRM demo profiles | No | Light-use public demos; best-effort, no SLA |
| Geolocation | Browser Geolocation API | No | User permission required |
| Custom styles | MapLibre style JSON | Depends on provider | Switch styles or host your own |

Provider endpoints can be replaced without rewriting the map UI.

## Natural-language search and local AI

HarshMaps always runs a small local intent interpreter that turns everyday phrases into map-searchable categories and keeps explicit brand and location names. It recognizes common requests such as “the nearest SBI branch around me”, “vegetarian dinner in Nagpur”, cash withdrawal, parks and playgrounds, pharmacies, gyms, stations and other categories, then searches live open map data and ranks available results by relevance and distance.

The optional **Enable on-device AI** control loads a quantized 135M-parameter SmolLM2 instruction model through Transformers.js. The model is downloaded to the browser on first use (roughly 180 MB, depending on the selected quantized files and runtime), then inference runs on the device. There is no hosted LLM inference endpoint, AI API key or per-query AI bill. It is opt-in because downloading model weights can be slow and device performance varies; the rule-based local interpreter works without it.

**Important distinction:** local AI interprets the query; it does not contain a live global directory. HarshMaps still requests map tiles, geocoding and nearby-place data from public open-data services, and directions from public routing demos. Real-time opening hours, reviews, traffic, and nuanced preferences such as “best” or “cheap” are only available when the data source exposes reliable fields; they are not invented by the model.

## Quick start: browser ESM

~~~html
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.css">
<div id="map" style="height: 480px"></div>
<script type="module">
  import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs';
  import { HarshMaps } from 'https://cdn.jsdelivr.net/gh/harshyadavv2456/HarshMaps@main/sdk/harshmaps.js';
  const map = HarshMaps.createMap(maplibregl, 'map', {
    style: HarshMaps.styles.liberty, center: [72.8777, 19.0760], zoom: 10
  });
</script>
~~~

For the no-build route, use the Free Integration Studio on the homepage to generate an iframe that works on most websites and in mobile WebViews. For React/Next.js/Vite, install MapLibre with npm and copy the SDK source into your project so your bundler can resolve dependencies normally. See the integration guides.

## Included

- Free Integration Studio that generates configurable iframe and browser SDK snippets
- Standalone embed page for websites and mobile WebViews, with search, location, marker and global places overlay
- Responsive map explorer UI
- Five switchable hosted vector-map styles
- Debounced search-as-you-type with explicit selection from geocoded results
- Optional city/area scope, branch disambiguation and one-click directions from a selected place
- Category browsing for banks/ATMs, food, shopping, healthcare, schools, hotels and landmarks, with visible-map nearby result lists ranked by straight-line distance, duplicate suppression, and click-to-route actions
- Browser geolocation
- Driving, walking and cycling previews with route alternatives, turn steps, distance and duration estimates
- Route and marker helpers
- Worldwide places overlay with category filters and point popups
- A GitHub Actions release checker that polls Overture STAC every 15 minutes and republishes only when the upstream release changes
- Configurable map, geocoder, and routing endpoints
- TypeScript declarations
- GitHub Pages deployment workflow and vanilla HTML example

## Install from GitHub

Install HarshMaps directly into an npm-based application from this repository:

~~~bash
npm install github:harshyadavv2456/HarshMaps maplibre-gl
~~~

Then import `HarshMaps` from `harshmaps`. This GitHub-installed package is not yet published to the public npm registry.

## Deploy on GitHub Pages

The workflow at .github/workflows/pages.yml publishes the site whenever the main branch changes. In repository **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions** once. Then check **Actions** for the deploy job. The published URL should be https://harshyadavv2456.github.io/HarshMaps/.

## Attribution and licenses

The demo uses OpenFreeMap styles, OpenStreetMap-derived map data, and an experimental Overture global places overlay. The 15-minute workflow checks only for a newly published Overture release; Overture's source dataset is updated on a monthly cadence, not every 15 minutes. Keep attribution visible. OpenStreetMap data is available under the ODbL; read the [OpenStreetMap copyright page](https://www.openstreetmap.org/copyright) and provider terms before production use.

The MIT license in this repository applies to HarshMaps source code only. Map data, tiles, and third-party services remain under their own licenses and terms. See [LICENSE](LICENSE).

## Pins and clusters

`addPinClusters(map, { pins, onSelect })` from `harshmaps/pins` draws thousands of points as clusters that open up as you zoom, on a plain MapLibre map with no key. Intima's Care tab uses it for 1000+ clinics. See `sdk/pins.d.ts`.
