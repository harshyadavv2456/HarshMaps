# HarshMaps free integration kit

Use HarshMaps in a website or an app without buying a map API key. Pick one of these paths:

1. **Universal embed:** paste a generated HTML iframe into a page, or load the same HTTPS embed URL in a mobile WebView.
2. **Browser SDK:** use MapLibre and the HarshMaps helpers directly when you need a custom web interface.
3. **Native map view:** use MapLibre Native with an OpenFreeMap-compatible style URL for native iOS/Android map rendering.

## Fastest path: iframe

After GitHub Pages has been enabled and the site successfully deployed, the embed URL is:

~~~text
https://harshyadavv2456.github.io/HarshMaps/embed.html
~~~

Use the **Free Integration Studio** on the HarshMaps homepage to choose a center, zoom, style, search, location, marker and worldwide places settings. It generates copy-ready code and a live preview. A basic example:

~~~html
<iframe
  title="HarshMaps interactive map"
  src="https://harshyadavv2456.github.io/HarshMaps/embed.html?lat=19.076&lng=72.8777&zoom=10&style=liberty&search=true&locate=true&marker=true&places=true&label=Mumbai"
  width="100%"
  height="420"
  style="border:0;border-radius:12px;overflow:hidden"
  loading="lazy"
  allow="geolocation"
  referrerpolicy="strict-origin-when-cross-origin">
</iframe>
~~~

Paste this into a custom HTML block on a static site, landing page, blog, WordPress site that supports iframe embeds, or a hosted app. If you have a restrictive Content Security Policy, allow the HarshMaps embed host in the frame-src directive. Geolocation works only over HTTPS, with host permissions and user consent.

## Embed URL options

| Parameter | Options | Default | What it does |
|---|---|---|---|
| lat | -90 to 90 | 19.076 | Center latitude |
| lng | -180 to 180 | 72.8777 | Center longitude |
| zoom | 1 to 20 | 10 | Initial zoom |
| style | liberty, bright, positron, dark, fiord | liberty | Basemap appearance |
| search | true / false | true | Show place search |
| locate | true / false | true | Show the device-location button |
| controls | true / false | true | Show zoom and compass controls |
| marker | true / false | false | Place a pin at the initial center |
| places | true / false | true | Show the experimental global points-of-interest overlay |
| label | text | empty | Optional popup label for the marker |

## Worldwide places overlay

The standalone embed and main explorer can display an Overture Places vector-tile layer. It requests only the tiles intersecting the current map view, instead of downloading the global data file into the browser. The current Overture release is recorded at `data/overture-release.json`; `.github/workflows/refresh-places.yml` checks the official STAC catalog every 15 minutes and publishes a new pointer only after the upstream release changes.

**Important freshness distinction:** the workflow polls every 15 minutes, but Overture's Places dataset is released monthly. It does not crawl every listing every 15 minutes. The currently linked Overture PMTiles are published for data inspection; Overture explicitly says not to use those public tiles in production because layer schemas, fields, and availability can change. For production, build and host your own stable tiles from Overture's source GeoParquet data, or operate a controlled places API. See the [official Overture tile guidance](https://docs.overturemaps.org/getting-data/cloud-sources/).

## React, Next.js, Vite and custom web apps

Install the repository version with MapLibre:

~~~bash
npm install github:harshyadavv2456/HarshMaps maplibre-gl
~~~

For production builds in Next.js, React or Vite, install MapLibre through your normal package manager and copy sdk/harshmaps.js into your application source so the bundler resolves dependencies predictably. Create maps on the client only, not during server rendering. See the repository's [Integration Guide](./INTEGRATION.md).

## React Native WebView

Install and configure the React Native WebView package, then load the public embed URL:

~~~tsx
import { WebView } from 'react-native-webview';

export function MapScreen() {
  return (
    <WebView
      source={{ uri: 'https://harshyadavv2456.github.io/HarshMaps/embed.html?lat=21.1458&lng=79.0882&zoom=12&style=liberty&search=true&locate=true' }}
      style={{ flex: 1 }}
      originWhitelist={['https://*']}
      geolocationEnabled
      javaScriptEnabled
      domStorageEnabled
    />
  );
}
~~~

Follow the installed package's current platform-specific setup, especially for location permissions.

## Flutter WebView

Using the commonly used webview_flutter package:

~~~dart
WebViewWidget(
  controller: WebViewController()
    ..setJavaScriptMode(JavaScriptMode.unrestricted)
    ..loadRequest(Uri.parse(
      'https://harshyadavv2456.github.io/HarshMaps/embed.html?lat=21.1458&lng=79.0882&zoom=12&style=liberty&search=true&locate=true',
    )),
)
~~~

Configure platform location permission if the location button is enabled. Refer to the current plugin documentation for the version in your app.

## Free does not mean unlimited for every feature

- **Basemap:** OpenFreeMap says its public map instance has no map-view/request caps and requires no registration or API key. It is still provided as-is, can change, and has current terms at [openfreemap.org/tos](https://openfreemap.org/tos/).
- **Attribution:** keep MapLibre and map-data attribution visible. OpenStreetMap's data is available under the ODbL; see the [copyright and attribution page](https://www.openstreetmap.org/copyright).
- **Search:** the default Photon public demo asks for reasonable use; extensive use can be throttled or banned. Its [project documentation](https://github.com/komoot/photon#demo-server) explains self-hosting.
- **Routing:** the main explorer uses the public OSRM demo for driving-route previews. That server is best-effort, not guaranteed navigation infrastructure. Review the [OSRM demo usage policy](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy) before relying on it in a public product.
- **Credentials:** the included defaults need no provider key. If you use a different paid service, never place private server credentials in public JavaScript.
- **Cost boundary:** the HarshMaps source, embed code and default OpenFreeMap basemap are free to start. Third-party services have their own policies; this does not promise every hosting arrangement, app-store account, optional data provider or production operation will be free forever.

## Run the embed locally

Do not open the HTML file directly through a file URL. Run a local HTTP server from the repository root:

~~~bash
python3 -m http.server 8000
~~~

Open http://localhost:8000/ for the builder or http://localhost:8000/embed.html?lat=21.1458&lng=79.0882&zoom=12&style=dark for the standalone embed.

This repository supplies a static map embed. It does not provide a private API-key vault, a hosted proxy, a guaranteed routing backend or an unlimited geocoding service.
