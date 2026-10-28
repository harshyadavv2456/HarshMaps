/** HarshMaps pins: draws thousands of points on a MapLibre map as clusters that open up as you zoom in. */
const bad = n => !Number.isFinite(n);

/** Pins ({id, lng, lat, ...extra}) to a GeoJSON FeatureCollection. Pins with missing or out-of-range coordinates are skipped. */
export function pinsToGeoJSON(pins) {
  const features = [];
  for (const p of Array.isArray(pins) ? pins : []) {
    if (!p || p.lng == null || p.lat == null) continue;
    const lng = Number(p.lng), lat = Number(p.lat);
    if (bad(lng) || bad(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) continue;
    const { lng: _lng, lat: _lat, ...properties } = p;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Adds a clustered pin layer. Returns { setPins, setSelected, fitToPins, remove }.
 * Call after the map's style has loaded. Options: id, pins, onSelect(pinProperties), colors { pin, selected, cluster, text }.
 */
export function addPinClusters(map, options = {}) {
  const id = options.id || 'harshmaps-pins';
  const c = { pin: '#7c3aed', selected: '#ec4899', cluster: '#7c3aed', text: '#ffffff', ...options.colors };
  const src = id + '-src', glow = id + '-glow', ring = id + '-clusters', count = id + '-count', halo = id + '-halo', dot = id + '-dot';
  const isSel = selectedId => ['==', ['get', 'id'], String(selectedId ?? '')];
  map.addSource(src, { type: 'geojson', data: pinsToGeoJSON(options.pins), cluster: true, clusterRadius: options.clusterRadius || 48, clusterMaxZoom: options.clusterMaxZoom || 14 });
  const size = ['step', ['get', 'point_count'], 16, 10, 20, 50, 25, 200, 31];
  map.addLayer({ id: glow, type: 'circle', source: src, filter: ['has', 'point_count'], paint: { 'circle-color': c.cluster, 'circle-opacity': 0.22, 'circle-blur': 0.6, 'circle-radius': ['+', size, 9] } });
  map.addLayer({ id: ring, type: 'circle', source: src, filter: ['has', 'point_count'], paint: { 'circle-color': c.cluster, 'circle-opacity': 0.88, 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff', 'circle-radius': size } });
  map.addLayer({ id: count, type: 'symbol', source: src, filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true }, paint: { 'text-color': c.text } });
  map.addLayer({ id: halo, type: 'circle', source: src, filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['case', isSel(''), c.selected, c.pin], 'circle-opacity': 0.24, 'circle-blur': 0.5, 'circle-radius': ['case', isSel(''), 20, 15] } });
  map.addLayer({ id: dot, type: 'circle', source: src, filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['case', isSel(''), c.selected, c.pin], 'circle-radius': ['case', isSel(''), 11, 8], 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } });

  const onCluster = async e => {
    const f = map.queryRenderedFeatures(e.point, { layers: [ring] })[0];
    if (!f) return;
    try { map.easeTo({ center: f.geometry.coordinates, zoom: await map.getSource(src).getClusterExpansionZoom(f.properties.cluster_id) + 0.5 }); } catch { /* source removed while zooming */ }
  };
  const onDot = e => { const f = e.features && e.features[0]; if (f && options.onSelect) options.onSelect(f.properties); };
  const pointer = on => () => { map.getCanvas().style.cursor = on ? 'pointer' : ''; };
  const over = pointer(true), out = pointer(false);
  map.on('click', ring, onCluster);
  map.on('click', dot, onDot);
  for (const l of [ring, dot]) { map.on('mouseenter', l, over); map.on('mouseleave', l, out); }

  return {
    setPins(pins) { const s = map.getSource(src); if (s) s.setData(pinsToGeoJSON(pins)); },
    setSelected(selectedId) {
      if (!map.getLayer(dot)) return;
      const sel = isSel(selectedId);
      map.setPaintProperty(dot, 'circle-color', ['case', sel, c.selected, c.pin]);
      map.setPaintProperty(dot, 'circle-radius', ['case', sel, 11, 8]);
      if (map.getLayer(halo)) { map.setPaintProperty(halo, 'circle-color', ['case', sel, c.selected, c.pin]); map.setPaintProperty(halo, 'circle-radius', ['case', sel, 20, 15]); }
    },
    fitToPins(pins, padding = 48) {
      const g = pinsToGeoJSON(pins).features.map(f => f.geometry.coordinates);
      if (!g.length) return;
      const b = g.reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)], [180, 90, -180, -90]);
      map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding, maxZoom: 14, duration: 0 });
    },
    remove() {
      map.off('click', ring, onCluster); map.off('click', dot, onDot);
      for (const l of [ring, dot]) { map.off('mouseenter', l, over); map.off('mouseleave', l, out); }
      for (const l of [dot, halo, count, ring, glow]) if (map.getLayer(l)) map.removeLayer(l);
      if (map.getSource(src)) map.removeSource(src);
    },
  };
}
