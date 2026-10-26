# Providers, costs, and production readiness

HarshMaps separates the map renderer, map tiles/styles, search, and routing. They have different licenses, cost models, and failure modes. A no-key map does not make every mapping feature free or unlimited.

## Default components

### Map rendering — MapLibre GL JS

Open-source WebGL vector-map renderer for camera movement, styling, controls, markers, and custom layers. It is not a map-data provider, geocoder, traffic service, or routing engine.

### Map tiles and styles — OpenFreeMap

The demo loads hosted OpenFreeMap style JSON and OpenStreetMap-derived vector tiles. OpenFreeMap advertises its public service as free, with no published map-view/request limits or API keys. The public instance does not provide a production uptime SLA. Retain attribution and follow current terms.

Tile service availability, style coverage, label quality, POI density, and data freshness depend on OpenFreeMap and upstream data.

### Worldwide places layer — Overture Maps

The explorer and embed can add the Overture Places vector tile set from the current release. The official October 21, 2026 release reports 88.4 million place features worldwide. Tiles are streamed from a public PMTiles inspection endpoint; this avoids downloading the global dataset into the browser and does not require a map API key. HarshMaps can query the currently rendered place-point layer for labeled category results and rank those visible results by straight-line distance from the selected area or map center. These are viewport-scoped map-tile results, not a complete radius search, verified business directory, or road-distance ranking.

**Do not treat the public PMTiles endpoint as production infrastructure.** Overture's documentation says these tiles are generated for data inspection and may change their layers, properties, zoom levels, availability, or performance without notice. HarshMaps therefore labels this layer experimental. For a durable production service, query Overture's source GeoParquet by geographic area, generate tiles with a stable schema, host the tiles under infrastructure you control, and monitor releases and attribution requirements. See the [official cloud-source guidance](https://docs.overturemaps.org/getting-data/cloud-sources/) and [Overture release calendar](https://docs.overturemaps.org/release-calendar/).

The repository's GitHub Actions workflow polls the Overture STAC release pointer every 15 minutes and updates the static release metadata only when the release ID changes. Overture releases data monthly; this polling interval is not the listing-refresh cadence. The overlay is a separate open-data source, not a scrape or redistribution of Google Maps listings.

### Place search — Photon demo endpoint

Default: https://photon.komoot.io/api/. Photon is an open-source OSM-based geocoder. The public demo endpoint is for reasonable use; the operator may throttle or ban extensive use and gives no availability guarantee.

For a public product, use a provider plan with clear production terms or operate your own geocoder. This demo searches only when a user submits a query.

### Routing — OSRM public demo profiles

The web explorer offers driving, walking and cycling using FOSSGIS-hosted public OSRM profile endpoints:

- Driving: `https://routing.openstreetmap.de/routed-car/route/v1/driving`
- Walking: `https://routing.openstreetmap.de/routed-foot/route/v1/driving`
- Cycling: `https://routing.openstreetmap.de/routed-bike/route/v1/driving`

The SDK's default route helper still supports the generic `https://router.project-osrm.org/route/v1` endpoint, while the explorer selects the profile-specific public endpoints above. The public demos request reasonable/light use (the FOSSGIS service documents a maximum of one request per second), do not provide an uptime SLA, and may throttle or change. Do not use them as guaranteed live-navigation infrastructure.

For production, evaluate a managed routing provider or host OSRM, Valhalla, or GraphHopper with current road data, profiles, monitoring, capacity planning, caching, and documented usage rules. The interface displays OSRM source attribution and labels public route results as estimates.

## Can it match Mapbox or Google Maps?

**The visual experience can be polished and comparable. The breadth of data and services will not automatically be identical.**

- **Map appearance:** highly customizable with MapLibre style JSON and styles you control.
- **Street and place data:** quality varies by market, source, and update cadence.
- **Search:** ranking, POI coverage, autocomplete, place details, opening hours, and business data are separate capabilities.
- **Directions:** quality depends on the routing graph, profiles, and provider.
- **Traffic, live incidents, lane guidance, turn-by-turn navigation, route optimization, offline updates, and uptime guarantees:** not included in this starter stack.
- **Service guarantees:** public demo endpoints can change or throttle at any time.

## Production checklist

1. Choose service owners for base tiles, the global places layer, geocoding, routing, and (if required) traffic.
2. Check data licenses and commercial terms. Keep the experimental Overture PMTiles out of production; publish your own versioned places tiles or API before depending on it.
3. Follow data and caching terms; add request deduplication and sensible limits.
4. Add a backend proxy where needed to hide private keys, cache results, enforce quotas, observe latency, and switch providers.
5. Monitor provider errors, add timeouts/retries with backoff, and show graceful fallbacks.
6. Retain required attribution, including on mobile and embedded maps.
7. Test local roads, addresses, rural coverage, boundaries, labels, language, and routes in target markets.
8. Plan traffic load and service budget; public demo services make no production capacity commitment.
9. Request location only with permission. Queries and coordinates may disclose sensitive user location to third parties.
10. Pin versions and test upgrades before production releases.

## Attribution and licenses

MapLibre GL JS is open source. OpenStreetMap data is licensed under ODbL and requires attribution. OpenFreeMap, Photon, and OSRM have their own hosting and service policies; review live documentation before use. The repository's MIT license applies only to HarshMaps code.
