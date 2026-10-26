# HarshMaps integration guide

The SDK is a small browser ES module with no build dependency. You supply a MapLibre GL JS module; HarshMaps supplies map defaults and helpers for search, routes, markers, and route drawing.

## Plain HTML — no build step

Use an HTTPS origin (GitHub Pages works), not a local file URL. The map container must have a non-zero height.

~~~html
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.css">
<div id="map" style="width:100%;height:480px"></div>
<script type="module">
  import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs';
  import { HarshMaps } from 'https://cdn.jsdelivr.net/gh/harshyadavv2456/HarshMaps@main/sdk/harshmaps.js';
  const map = HarshMaps.createMap(maplibregl, 'map', {
    style: HarshMaps.styles.liberty, center: [72.8777, 19.0760], zoom: 10
  });
</script>
~~~

For repeatable production builds, pin a release tag instead of the main branch in the CDN URL. Keep MapLibre JS and CSS on the same version.

## Install directly from this Git repository

~~~bash
npm install github:harshyadavv2456/HarshMaps maplibre-gl
~~~

Then use `import { HarshMaps } from 'harshmaps'`. This is a GitHub-sourced package install; it is not a published npm-registry release yet.

## Vite, React, or Next.js

Install MapLibre:

~~~bash
npm install maplibre-gl
~~~

Copy sdk/harshmaps.js into the application source, for example src/lib/harshmaps.js. Your bundler can then resolve packages normally.

~~~tsx
'use client';
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { HarshMaps } from '@/lib/harshmaps';

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const map = HarshMaps.createMap(maplibregl, container.current, {
      style: HarshMaps.styles.liberty, center: [72.8777, 19.0760], zoom: 10
    });
    return () => map.remove();
  }, []);
  return <div ref={container} style={{ height: 480, width: '100%' }} />;
}
~~~

Run map creation only in a client component. Do not instantiate WebGL maps during server rendering.

## Change style

~~~js
const map = HarshMaps.createMap(maplibregl, 'map', {
  style: HarshMaps.styles.dark, center: [78.9629, 20.5937], zoom: 4.5
});
map.setStyle(HarshMaps.styles.positron);
~~~

Available styles: liberty, bright, positron, dark, and fiord.

## Search a place

~~~js
const places = await HarshMaps.searchPlaces('Gateway of India, Mumbai', {
  baseUrl: HarshMaps.providers.photon, limit: 5, lat: 19.0760, lon: 72.8777
});
if (places[0]) {
  map.flyTo({ center: places[0].coordinates, zoom: 15 });
  HarshMaps.addMarker(maplibregl, map, places[0].coordinates, { label: places[0].label });
}
~~~

The public default uses the Photon demo endpoint. Its operator asks for reasonable use and provides no availability guarantee. Search is deliberately wired to explicit submission, not each keystroke. Do not treat the public endpoint as production search infrastructure.

## Get driving directions

~~~js
const route = await HarshMaps.getRoute(
  [72.8656, 19.0988], // origin [lng, lat]
  [72.8562, 19.0176], // destination [lng, lat]
  { baseUrl: HarshMaps.providers.osrm, profile: 'driving', alternatives: true }
);
console.log(route.distance, route.duration);
HarshMaps.drawRoute(map, route.feature, { color: '#675bf4', casingColor: '#ffffff' });
~~~

Coordinates are longitude first and latitude second. The default OSRM endpoint is a community demo; it may throttle requests, have limited profile support, or be unavailable. Use a managed router or your own OSRM/Valhalla/GraphHopper deployment for production.

## Swap service endpoints

~~~js
const appProviders = {
  geocoderUrl: 'https://your-domain.example/geocoder/api/',
  routerUrl: 'https://your-domain.example/route/v1'
};
const places = await HarshMaps.searchPlaces('a place', { baseUrl: appProviders.geocoderUrl });
const route = await HarshMaps.getRoute(origin, destination, {
  baseUrl: appProviders.routerUrl, profile: 'driving'
});
~~~

Keep private provider credentials on the server. Do not ship private API keys in browser JavaScript.

## API quick reference

| Method | Purpose |
|---|---|
| HarshMaps.createMap(maplibregl, container, options) | Create a MapLibre instance with defaults and controls |
| HarshMaps.styles | Map style URLs |
| HarshMaps.searchPlaces(query, options) | Query a Photon-compatible geocoder |
| HarshMaps.getRoute(start, end, options) | Query an OSRM-compatible route service |
| HarshMaps.drawRoute(map, geojson, options) | Draw or update a route line |
| HarshMaps.clearRoute(map) | Remove default route layers/source |
| HarshMaps.addMarker(maplibregl, map, coordinates, options) | Add marker and safe-text popup |
| HarshMaps.set3D(map, enabled, options) | Add building extrusions if the style supports them and pitch the camera |

## Versioning

The repository SDK is currently version 0.1.0 and is not published to npm. Browser ESM can use jsDelivr; bundled applications should copy the SDK into source and install MapLibre through npm. Pin a commit or tag for controlled production deployments.
