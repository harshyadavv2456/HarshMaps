# HarshMaps

**Beautiful, configurable web maps without a required API key.**

HarshMaps is an open mapping toolkit built on [MapLibre GL JS](https://maplibre.org/) and [OpenFreeMap](https://openfreemap.org/). It combines an interactive demo, a dependency-light browser SDK, and copy/paste integration examples.

> **Reality check:** HarshMaps can deliver polished vector-map rendering and a strong set of mapping primitives. It cannot make free public data services equal to Google Maps or Mapbox in every dimension. Live traffic, globally consistent POI search, turn-by-turn navigation, uptime guarantees, and support need dedicated providers or self-hosted infrastructure.

## Try it

- Live site after Pages deployment: https://harshyadavv2456.github.io/HarshMaps/
- Repository: https://github.com/harshyadavv2456/HarshMaps
- [Integration guide](docs/INTEGRATION.md)
- [Provider and production guide](docs/PROVIDERS.md)

## Stack

| Capability | Default | API key | Notes |
|---|---|---:|---|
| Vector map rendering | MapLibre GL JS | No | Open-source WebGL renderer |
| Hosted vector tiles/styles | OpenFreeMap | No | Free public service, no published view cap, no SLA |
| Place/address search | Photon public demo | No | Best-effort, reasonable use only |
| Driving route preview | OSRM demo server | No | Best-effort, no SLA |
| Geolocation | Browser Geolocation API | No | User permission required |
| Custom styles | MapLibre style JSON | Depends on provider | Switch styles or host your own |

Provider endpoints can be replaced without rewriting the map UI.

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

For React/Next.js/Vite, install MapLibre with npm and copy the SDK source into your project so your bundler can resolve dependencies normally. See the integration guide.

## Included

- Responsive map explorer UI
- Five switchable hosted vector-map styles
- Manual place search (not a request per keystroke)
- Browser geolocation
- Driving route preview with distance and duration estimates
- Route and marker helpers
- Configurable map, geocoder, and routing endpoints
- TypeScript declarations
- GitHub Pages deployment workflow and vanilla HTML example

## Deploy on GitHub Pages

The workflow at .github/workflows/pages.yml publishes the site whenever the main branch changes. In repository **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions** once. Then check **Actions** for the deploy job. The published URL should be https://harshyadavv2456.github.io/HarshMaps/.

## Attribution and licenses

The demo uses OpenFreeMap styles and OpenStreetMap-derived data. Keep attribution visible. OpenStreetMap data is available under the ODbL; read the [OpenStreetMap copyright page](https://www.openstreetmap.org/copyright) and provider terms before production use.

The MIT license in this repository applies to HarshMaps source code only. Map data, tiles, and third-party services remain under their own licenses and terms. See [LICENSE](LICENSE).
