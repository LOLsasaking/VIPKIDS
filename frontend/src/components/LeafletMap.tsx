/** Interactive OpenStreetMap surface used by parent, child, and operations screens. */
import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useAssets } from 'expo-asset';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

const FLEET_MARKER_ASSETS = [
  require('../../assets/images/fleet-chevrolet-suburban-cutout.png'),
  require('../../assets/images/fleet-cadillac-escalade-cutout.png'),
  require('../../assets/images/fleet-gmc-yukon-cutout.png'),
  require('../../assets/images/fleet-lincoln-navigator-cutout.png'),
  require('../../assets/images/fleet-ford-expedition-cutout.png'),
  require('../../assets/images/fleet-jeep-wagoneer-cutout.png'),
  require('../../assets/images/fleet-toyota-sequoia-cutout.png'),
  require('../../assets/images/fleet-lexus-lx600-cutout.png'),
  require('../../assets/images/fleet-infiniti-qx80-cutout.png'),
  require('../../assets/images/fleet-mercedes-gls580-cutout.png'),
];

export type MapPoint = { lat: number; lng: number };

export type MapRoute = {
  points: MapPoint[];
  color?: string;
  label?: string;
};

export type MapMarker = MapPoint & {
  id?: string;
  label?: string;
  color?: string;
  type?: 'vehicle' | 'pickup' | 'dropoff' | 'child';
  vehicleNumber?: number | string;
  vehicleModel?: string;
  vehicleVariant?: number;
  previousLat?: number;
  previousLng?: number;
};

type Props = {
  markers: MapMarker[];
  center?: MapPoint;
  route?: MapPoint[];
  routes?: MapRoute[];
  fitRoute?: boolean;
  zoom?: number;
  height?: number;
  interactive?: boolean;
  onMapPress?: (point: MapPoint) => void;
  testID?: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character);
}

function safeColor(value: unknown, fallback = '#111111') {
  const color = String(value ?? '');
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : fallback;
}

function safeCoordinate(value: unknown, fallback: number) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : fallback;
}

function inlineJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function normalizeAssetUri(uri: string) {
  if (!uri || Platform.OS !== 'web') return uri;
  if (/^(https?:|data:|blob:|file:)/.test(uri)) return uri;
  if (uri.startsWith('/')) {
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    return `${origin}${uri}`;
  }
  const base = typeof window !== 'undefined' && window.location?.href ? window.location.href : '';
  try {
    return new URL(uri, base).toString();
  } catch {
    return uri;
  }
}

function markerCode(marker: MapMarker, index: number, suvMarkerUris: string[]) {
  const color = safeColor(marker.color);
  const label = inlineJson(marker.label || `Marker ${index + 1}`);
  const lat = safeCoordinate(marker.lat, 0);
  const lng = safeCoordinate(marker.lng, 0);

  if (marker.type === 'vehicle') {
    const vehicleVariant = Number.isInteger(marker.vehicleVariant) ? Number(marker.vehicleVariant) : 0;
    const suvMarkerUri = suvMarkerUris[vehicleVariant] || suvMarkerUris[0] || '';
    const vehicleNumber = marker.vehicleNumber ? `<span class="vehicle-number">${escapeHtml(marker.vehicleNumber)}</span>` : '';
    const vehicleModel = marker.vehicleModel ? `<span class="vehicle-model">${escapeHtml(marker.vehicleModel)}</span>` : '';
    const markerHtml = suvMarkerUri
      ? `<div class="vehicle-marker-wrap"><div class="suv-photo-marker" style="--accent:${color}"><img src="${escapeHtml(suvMarkerUri)}" alt="" />${vehicleNumber}</div>${vehicleModel}</div>`
      : `<div class="vehicle-loading" style="--accent:${color}"></div>`;
    const previousLat = safeCoordinate(marker.previousLat, lat);
    const previousLng = safeCoordinate(marker.previousLng, lng);
    return `window.mapMarker${index}=L.marker([${previousLat},${previousLng}],{icon:L.divIcon({className:'',html:${inlineJson(markerHtml)},iconSize:[86,82],iconAnchor:[43,42]})}).addTo(map).bindPopup(safeText(${label}));animateMarker(window.mapMarker${index},[${previousLat},${previousLng}],[${lat},${lng}],4600);`;
  }

  const className = marker.type === 'pickup' ? 'pickup-marker' : marker.type === 'dropoff' ? 'dropoff-marker' : 'person-marker';
  return `window.mapMarker${index}=L.marker([${lat},${lng}],{icon:L.divIcon({className:'',html:'<div class="${className}" style="--marker:${color}"></div>',iconSize:[30,38],iconAnchor:[15,32]})}).addTo(map).bindPopup(safeText(${label}));`;
}

function buildHtml(markers: MapMarker[], center: MapPoint, routes: MapRoute[], zoom: number, interactive: boolean, suvMarkerUris: string[], fitRoute: boolean) {
  const markersJs = markers.map((marker, index) => markerCode(marker, index, suvMarkerUris)).join('\n');
  const routeJs = routes
    .filter((item) => item.points.length > 1)
    .map((item, index) => {
      const coordinates = inlineJson(item.points.map((point) => [safeCoordinate(point.lat, 0), safeCoordinate(point.lng, 0)]));
      const color = safeColor(item.color, '#D4AF37');
      const tooltip = item.label ? `.bindTooltip(safeText(${inlineJson(item.label)}),{sticky:true,direction:'top'})` : '';
      return `const routeCoordinates${index}=${coordinates};window.routeShadow${index}=L.polyline(routeCoordinates${index},{color:'#09090B',weight:9,opacity:.48,lineCap:'round',lineJoin:'round',smoothFactor:.35}).addTo(map);window.routeLine${index}=L.polyline(routeCoordinates${index},{color:${inlineJson(color)},weight:4,opacity:1,lineCap:'round',lineJoin:'round',smoothFactor:.35}).addTo(map)${tooltip};routeLayers.push(window.routeLine${index});`;
    })
    .join('\n');
  const fitRoutesJs = fitRoute ? "if(routeLayers.length){map.fitBounds(L.featureGroup(routeLayers).getBounds(),{padding:[42,42],maxZoom:15});}" : '';

  return `<!DOCTYPE html>
  <html><head><meta name="viewport" content="initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src data: blob: file: http: https:; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous"/>
  <style>
    html,body,#map{height:100%;margin:0;background:#F2F1ED;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
    .leaflet-container{cursor:${interactive ? 'crosshair' : 'grab'}}
    .leaflet-control-attribution{background:rgba(255,255,255,.84)!important;color:#666!important;font-size:8px}
    .leaflet-control-attribution a{color:#111!important}
    .leaflet-popup-content-wrapper{background:#111;color:#fff;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.18)}
    .leaflet-popup-tip{background:#111}
    .vehicle-marker-wrap{width:86px;height:82px;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .suv-photo-marker{position:relative;width:68px;height:62px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 5px 6px rgba(0,0,0,.55))}
    .suv-photo-marker img{position:relative;width:72px;height:58px;object-fit:contain;filter:contrast(1.06) saturate(.9) drop-shadow(0 4px 4px rgba(0,0,0,.5))}
    .vehicle-number{position:absolute;right:-4px;top:2px;min-width:20px;height:20px;padding:0 4px;border-radius:10px;background:var(--accent);color:#09090b;border:2px solid #fff;font-size:10px;font-weight:800;line-height:20px;text-align:center;box-sizing:border-box}
    .vehicle-model{max-width:86px;margin-top:-4px;padding:2px 5px;border-radius:5px;background:#09090be8;color:#fff;border:1px solid #ffffff59;font-size:8px;font-weight:700;line-height:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
    .vehicle-loading{width:18px;height:18px;margin:30px;border-radius:50%;background:#09090b;border:3px solid var(--accent);box-shadow:0 3px 8px rgba(0,0,0,.42)}
    .pickup-marker,.dropoff-marker,.person-marker{width:24px;height:24px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);background:var(--marker);border:4px solid #fff;box-shadow:0 2px 9px rgba(0,0,0,.3)}
    .pickup-marker:after,.dropoff-marker:after,.person-marker:after{content:'';position:absolute;inset:6px;border-radius:50%;background:#fff}
    .dropoff-marker{border-radius:4px;transform:none;width:20px;height:20px}
  </style></head>
  <body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>
  <script>
    function safeText(value){const node=document.createElement('span');node.textContent=String(value||'');return node}
    const map=L.map('map',{zoomControl:false,attributionControl:true,doubleClickZoom:false}).setView([${center.lat},${center.lng}],${zoom});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
    function fixMapSize(){
      map.invalidateSize(false);
      // fitBounds/setView ran while the srcdoc iframe was still 0-height; re-fit once the real size is known.
      if(!window.__vipFit && typeof routeLayers!=='undefined' && routeLayers.length){
        try{ map.fitBounds(L.featureGroup(routeLayers).getBounds(),{padding:[42,42],maxZoom:15}); window.__vipFit=true; }catch(e){}
      }
    }
    if(window.ResizeObserver){new ResizeObserver(fixMapSize).observe(document.getElementById('map'));}
    else{window.addEventListener('load',fixMapSize);setTimeout(fixMapSize,300);}
    window.addEventListener('resize',fixMapSize);
    setTimeout(fixMapSize,150);
    function animateMarker(marker,from,to,duration){
      if(from[0]===to[0]&&from[1]===to[1])return;
      const started=performance.now();
      function frame(now){
        const raw=Math.min(1,(now-started)/duration);
        const eased=raw<.5?4*raw*raw*raw:1-Math.pow(-2*raw+2,3)/2;
        marker.setLatLng([from[0]+(to[0]-from[0])*eased,from[1]+(to[1]-from[1])*eased]);
        if(raw<1)requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
    function updateMapState(state){
      (state.markers||[]).forEach(function(next,index){
        const marker=window['mapMarker'+index];
        if(!marker||!Number.isFinite(next.lat)||!Number.isFinite(next.lng))return;
        const current=marker.getLatLng();
        animateMarker(marker,[current.lat,current.lng],[next.lat,next.lng],4600);
      });
      (state.routes||[]).forEach(function(next,index){
        if(!Array.isArray(next.points)||next.points.length<2)return;
        const route=window['routeLine'+index];
        const shadow=window['routeShadow'+index];
        if(route)route.setLatLngs(next.points);
        if(shadow)shadow.setLatLngs(next.points);
      });
    }
    window.updateMapState=updateMapState;
    window.addEventListener('message',function(event){
      let payload=event.data;
      if(typeof payload==='string'){try{payload=JSON.parse(payload)}catch{return}}
      if(payload&&payload.type==='mapState')updateMapState(payload);
    });
    const routeLayers=[];
    ${routeJs}${fitRoutesJs}${markersJs}
    ${interactive ? `map.on('click',function(e){const payload=JSON.stringify({type:'mapPress',lat:e.latlng.lat,lng:e.latlng.lng});if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(payload)}else{window.parent.postMessage(payload,'*')}});` : ''}
  </script></body></html>`;
}

export default function LeafletMap({
  markers,
  center,
  route = [],
  routes = [],
  fitRoute = false,
  zoom = 13,
  height = 320,
  interactive = false,
  onMapPress,
  testID,
}: Props) {
  const [markerAssets] = useAssets(FLEET_MARKER_ASSETS);
  const previousPositions = useRef<Record<string, MapPoint>>({});
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const htmlCache = useRef<{ key: string; value: string } | null>(null);
  const suvMarkerUris = (markerAssets || []).map((asset) => normalizeAssetUri(asset.localUri || asset.uri || ''));
  const mapCenter = center || markers[0] || { lat: 26.0112, lng: -80.1495 };
  const visibleRoutes = routes.length ? routes : route.length ? [{ points: route, color: '#D4AF37' }] : [];
  const animatedMarkers = markers.map((marker, index) => {
    const key = marker.id || marker.label || String(index);
    const previous = previousPositions.current[key];
    return { ...marker, previousLat: previous?.lat ?? marker.lat, previousLng: previous?.lng ?? marker.lng };
  });
  const structureKey = useMemo(() => inlineJson({
    markers: animatedMarkers.map(({ id, label, color, type, vehicleNumber, vehicleModel, vehicleVariant }) => ({ id, label, color, type, vehicleNumber, vehicleModel, vehicleVariant })),
    routes: visibleRoutes.map(({ color, label, points }) => ({ color, label, visible: points.length > 1 })),
    assets: suvMarkerUris,
    zoom,
    interactive,
    fitRoute,
  }), [animatedMarkers, visibleRoutes, suvMarkerUris, zoom, interactive, fitRoute]);
  if (!htmlCache.current || htmlCache.current.key !== structureKey) {
    htmlCache.current = {
      key: structureKey,
      value: buildHtml(animatedMarkers, mapCenter, visibleRoutes, zoom, interactive, suvMarkerUris, fitRoute),
    };
  }
  const html = htmlCache.current.value;
  const liveState = useMemo(() => ({
    type: 'mapState',
    markers: markers.map((marker) => ({
      lat: safeCoordinate(marker.lat, 0),
      lng: safeCoordinate(marker.lng, 0),
    })),
    routes: visibleRoutes.map((item) => ({
      points: item.points.map((point) => [safeCoordinate(point.lat, 0), safeCoordinate(point.lng, 0)]),
    })),
  }), [markers, visibleRoutes]);
  const liveStateJson = useMemo(() => inlineJson(liveState), [liveState]);

  useEffect(() => {
    markers.forEach((marker, index) => {
      const key = marker.id || marker.label || String(index);
      previousPositions.current[key] = { lat: marker.lat, lng: marker.lng };
    });
  }, [markers]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage(liveState, '*');
      return;
    }
    webViewRef.current?.injectJavaScript(`window.updateMapState&&window.updateMapState(${liveStateJson});true;`);
  }, [liveState, liveStateJson, html]);

  const deliver = (raw: string) => {
    try {
      const data = JSON.parse(raw);
      const lat = Number(data.lat);
      const lng = Number(data.lng);
      if (data.type === 'mapPress' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        onMapPress?.({ lat, lng });
      }
    } catch {
      // Ignore non-map messages from the host page.
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || !onMapPress) return;
    const handler = (event: MessageEvent) => deliver(String(event.data));
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  });

  if (Platform.OS === 'web') {
    return (
      <View testID={testID} style={[styles.container, { height }]}>
        {/* eslint-disable-next-line react-native/no-raw-text */}
        <iframe ref={iframeRef} srcDoc={html} sandbox="allow-scripts" style={{ width: '100%', height: '100%', border: 0 }} title="VIPKIDS live route map" />
      </View>
    );
  }

  return (
    <View testID={testID} style={[styles.container, { height }]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['about:blank']}
        onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'}
        source={{ html }}
        onMessage={(event: WebViewMessageEvent) => deliver(event.nativeEvent.data)}
        style={{ backgroundColor: '#F2F1ED' }}
        javaScriptEnabled
        domStorageEnabled
        applicationNameForUserAgent="VIPKidsTransportation/1.0"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#F2F1ED',
  },
});
