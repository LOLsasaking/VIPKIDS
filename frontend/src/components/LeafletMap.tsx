/**
 * LeafletMap — OpenStreetMap-based map via WebView (works on iOS, Android, web).
 * No API key required. Swap to Google Maps later by replacing this component.
 *
 * Props:
 *  - markers: [{ lat, lng, label?, color? }]
 *  - center?: { lat, lng }
 *  - zoom?: number
 *  - height?: number
 */
import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export type MapMarker = {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
};

type Props = {
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: number;
  testID?: string;
};

function buildHtml(markers: MapMarker[], center: { lat: number; lng: number }, zoom: number) {
  const markersJs = markers
    .map(
      (m, i) =>
        `L.circleMarker([${m.lat}, ${m.lng}], { radius: 10, color: '${m.color || '#D4AF37'}', weight: 3, fillColor: '${m.color || '#D4AF37'}', fillOpacity: 0.9 }).addTo(map).bindPopup(${JSON.stringify(m.label || `Marker ${i + 1}`)});`,
    )
    .join('\n');

  return `<!DOCTYPE html><html><head><meta name="viewport" content="initial-scale=1.0,maximum-scale=1.0"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><style>html,body,#map{height:100%;margin:0;padding:0;background:#09090B}.leaflet-tile{filter:invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.85) saturate(0.3)}.leaflet-control-attribution{background:rgba(24,24,27,0.85)!important;color:#A19C93!important;font-size:9px}.leaflet-control-attribution a{color:#D4AF37!important}.leaflet-popup-content-wrapper{background:#18181B;color:#FAFAFA;border:1px solid #27272A;border-radius:8px}.leaflet-popup-tip{background:#18181B}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>var map=L.map('map',{zoomControl:false,attributionControl:true}).setView([${center.lat},${center.lng}],${zoom});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(map);${markersJs}</script></body></html>`;
}

export default function LeafletMap({ markers, center, zoom = 13, height = 320, testID }: Props) {
  const c = center ||
    (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : { lat: 26.0112, lng: -80.1495 }); // Hollywood, FL default

  const html = useMemo(() => buildHtml(markers, c, zoom), [markers, c.lat, c.lng, zoom]);

  if (Platform.OS === 'web') {
    return (
      <View testID={testID} style={[styles.container, { height }]}>
        {/* eslint-disable-next-line react-native/no-raw-text */}
        <iframe
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 0 }}
          title="map"
        />
      </View>
    );
  }

  return (
    <View testID={testID} style={[styles.container, { height }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={{ backgroundColor: '#09090B' }}
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
});
