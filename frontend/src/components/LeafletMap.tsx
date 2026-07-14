/**
 * LeafletMap — OpenStreetMap-based map via WebView (works on iOS, Android, web).
 * No API key required. Swap to Google Maps later by replacing this component.
 *
 * The map is built ONCE and updated imperatively (no reload/flicker). A 3D SUV
 * (Three.js, oriented to heading) follows the live GPS and a per-driver colored
 * polyline traces the road route — Uber-style.
 *
 * Props:
 *  - markers:  [{ lat, lng, label?, color?, car? }]  // car:true renders the 3D SUV + panTo
 *  - path?:    [{ lat, lng }]                         // road route (path[0] = car)
 *  - lineColor?: string                              // route + destination color (per driver)
 *  - center?, zoom?, height?
 */
import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export type MapMarker = {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
  car?: boolean;
};

type LatLng = { lat: number; lng: number };

type Props = {
  markers: MapMarker[];
  path?: LatLng[];
  lineColor?: string;
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: number;
  testID?: string;
};

// Base page: builds the map + a global setData() the RN side calls on every update.
function baseHtml(center: LatLng, zoom: number) {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="initial-scale=1.0,maximum-scale=1.0"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><style>html,body,#map{height:100%;margin:0;padding:0;background:#09090B}.leaflet-tile{filter:invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.85) saturate(0.3)}.leaflet-control-attribution{background:rgba(24,24,27,0.85)!important;color:#A19C93!important;font-size:9px}.leaflet-control-attribution a{color:#D4AF37!important}.leaflet-popup-content-wrapper{background:#18181B;color:#FAFAFA;border:1px solid #27272A;border-radius:8px}.leaflet-popup-tip{background:#18181B}.suvimg{filter:drop-shadow(0 3px 4px rgba(0,0,0,.6))}</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js"></script>
<script>
var map=L.map('map',{zoomControl:false,attributionControl:true}).setView([${center.lat},${center.lng}],${zoom});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(map);
var carMarker=null, trail=null, plain=[];

function bearing(a,b){var y=Math.sin((b.lng-a.lng)*Math.PI/180)*Math.cos(b.lat*Math.PI/180);var x=Math.cos(a.lat*Math.PI/180)*Math.sin(b.lat*Math.PI/180)-Math.sin(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.cos((b.lng-a.lng)*Math.PI/180);return (Math.atan2(y,x)*180/Math.PI+360)%360;}

// ---- 3D black SUV (Three.js) rendered to a marker icon, oriented to heading ----
var THREEJS=null, suv=null, beacon=null, lastBeaconHex=null;
function initSUV(){
  if(THREEJS||!window.THREE)return THREEJS;
  try{
    var T=window.THREE;
    var renderer=new T.WebGLRenderer({alpha:true,antialias:true});
    renderer.setPixelRatio(2);renderer.setSize(60,60);
    var scene=new T.Scene();
    var f=2.9,cam=new T.OrthographicCamera(-f,f,f,-f,0.1,100);
    cam.position.set(0,6,4.2);cam.lookAt(0,0.4,0);
    scene.add(new T.AmbientLight(0x8a8ea0,0.85));
    var key=new T.DirectionalLight(0xffffff,1.0);key.position.set(4,9,6);scene.add(key);
    var rim=new T.DirectionalLight(0x6688ff,0.35);rim.position.set(-5,4,-4);scene.add(rim);
    var g=new T.Group();
    var paint=new T.MeshStandardMaterial({color:0x0c0c0f,metalness:0.75,roughness:0.32});
    var glass=new T.MeshStandardMaterial({color:0x1a2535,metalness:0.4,roughness:0.12});
    var tire=new T.MeshStandardMaterial({color:0x090909,roughness:0.9,metalness:0.1});
    var chrome=new T.MeshStandardMaterial({color:0xd8d8dd,metalness:0.9,roughness:0.25});
    var head=new T.MeshStandardMaterial({color:0xfff6d0,emissive:0xfff2c0,emissiveIntensity:0.9});
    var tail=new T.MeshStandardMaterial({color:0xaa1414,emissive:0xff2222,emissiveIntensity:0.7});
    // front = -z. body + roof
    var body=new T.Mesh(new T.BoxGeometry(1.7,0.62,3.5),paint);body.position.y=0.55;g.add(body);
    var hood=new T.Mesh(new T.BoxGeometry(1.66,0.5,1.0),paint);hood.position.set(0,0.72,-1.15);g.add(hood);
    var roof=new T.Mesh(new T.BoxGeometry(1.52,0.6,1.85),paint);roof.position.set(0,1.05,0.05);g.add(roof);
    var win=new T.Mesh(new T.BoxGeometry(1.56,0.42,1.72),glass);win.position.set(0,1.06,0.05);g.add(win);
    function wheel(x,z){var w=new T.Mesh(new T.CylinderGeometry(0.4,0.4,0.32,18),tire);w.rotation.z=Math.PI/2;w.position.set(x,0.36,z);g.add(w);var hub=new T.Mesh(new T.CylinderGeometry(0.16,0.16,0.34,12),chrome);hub.rotation.z=Math.PI/2;hub.position.set(x,0.36,z);g.add(hub);}
    wheel(0.92,1.1);wheel(-0.92,1.1);wheel(0.92,-1.05);wheel(-0.92,-1.05);
    function lamp(mat,x,z){var l=new T.Mesh(new T.BoxGeometry(0.4,0.18,0.08),mat);l.position.set(x,0.6,z);g.add(l);}
    lamp(head,0.5,-1.77);lamp(head,-0.5,-1.77);lamp(tail,0.5,1.77);lamp(tail,-0.5,1.77);
    beacon=new T.Mesh(new T.BoxGeometry(0.5,0.16,0.42),new T.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:0.6}));
    beacon.position.set(0,1.42,0.05);g.add(beacon);
    scene.add(g);suv=g;
    THREEJS={T:T,renderer:renderer,scene:scene,cam:cam};
  }catch(e){THREEJS=null;}
  return THREEJS;
}
function suvIcon(angleDeg,beaconHex){
  var ctx=initSUV();if(!ctx)return null;
  if(beacon&&beaconHex&&beaconHex!==lastBeaconHex){var c=new ctx.T.Color(beaconHex);beacon.material.color=c;beacon.material.emissive=c;lastBeaconHex=beaconHex;}
  suv.rotation.y=-angleDeg*Math.PI/180;
  ctx.renderer.render(ctx.scene,ctx.cam);
  var url=ctx.renderer.domElement.toDataURL('image/png');
  return L.icon({iconUrl:url,iconSize:[56,56],iconAnchor:[28,28],className:'suvimg'});
}
// Flat SVG fallback (still a black SUV) if WebGL/Three is unavailable.
function svgIcon(angle,beaconHex){return L.divIcon({className:'',iconSize:[36,36],iconAnchor:[18,18],html:'<div style="transform:rotate('+(angle||0)+'deg)"><svg width="36" height="36" viewBox="0 0 40 40"><g stroke="#000" stroke-width="1.2" stroke-linejoin="round"><rect x="8" y="15" width="4" height="10" rx="1.5" fill="#050505"/><rect x="28" y="15" width="4" height="10" rx="1.5" fill="#050505"/><rect x="11" y="6" width="18" height="28" rx="6" fill="#0c0c0f"/><path d="M14 12h12l-1.5 5h-9z" fill="#1a2535"/><rect x="14" y="22" width="12" height="6" rx="2" fill="#1a2535"/><rect x="17" y="4" width="6" height="3" rx="1" fill="'+(beaconHex||'#D4AF37')+'"/></g></svg></div>'});}
function carIcon(angle,beaconHex){return suvIcon(angle,beaconHex)||svgIcon(angle,beaconHex);}

window.setData=function(d){
  try{
    var path=d.path||[], markers=d.markers||[], lineColor=d.lineColor||'#D4AF37';
    // route line (path[0] = car, follows the road to the destination)
    if(path.length>1){var pts=path.map(function(p){return [p.lat,p.lng];});if(trail){trail.setLatLngs(pts);trail.setStyle({color:lineColor});}else{trail=L.polyline(pts,{color:lineColor,weight:5,opacity:0.9,lineJoin:'round',lineCap:'round'}).addTo(map);}}
    else if(trail){map.removeLayer(trail);trail=null;}
    // plain (non-car) markers — rebuild
    plain.forEach(function(m){map.removeLayer(m);});plain=[];
    var car=null;
    markers.forEach(function(m){
      if(m.car){car=m;return;}
      var mk=L.circleMarker([m.lat,m.lng],{radius:9,color:m.color||lineColor,weight:3,fillColor:m.color||lineColor,fillOpacity:0.9}).addTo(map);
      if(m.label)mk.bindPopup(m.label);plain.push(mk);
    });
    if(car){
      var angle=path.length>1?bearing(path[0],path[1]):0;
      var ll=[car.lat,car.lng];
      var icon=carIcon(angle,car.color||lineColor);
      if(carMarker){carMarker.setLatLng(ll);carMarker.setIcon(icon);}
      else{carMarker=L.marker(ll,{icon:icon}).addTo(map);if(car.label)carMarker.bindPopup(car.label);}
      map.panTo(ll,{animate:true,duration:0.8});
    }
  }catch(e){}
};
window.addEventListener('message',function(e){try{window.setData(JSON.parse(e.data));}catch(x){}});
window.__ready=true;
</script></body></html>`;
}

export default function LeafletMap({ markers, path = [], lineColor, center, zoom = 13, height = 320, testID }: Props) {
  const c = center ||
    (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : { lat: 26.0112, lng: -80.1495 }); // Hollywood, FL default

  // Build the page once (center/zoom only) so updates never reload the WebView.
  const html = useMemo(() => baseHtml(c, zoom), []); // eslint-disable-line react-hooks/exhaustive-deps

  const webRef = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const payload = useMemo(() => JSON.stringify({ markers, path, lineColor }), [markers, path, lineColor]);

  const push = useCallback(() => {
    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage(payload, '*');
    } else {
      webRef.current?.injectJavaScript(`window.setData(${payload});true;`);
    }
  }, [payload]);

  useEffect(() => { push(); }, [push]);

  if (Platform.OS === 'web') {
    return (
      <View testID={testID} style={[styles.container, { height }]}>
        {/* eslint-disable-next-line react-native/no-raw-text */}
        <iframe
          ref={iframeRef}
          srcDoc={html}
          onLoad={push}
          style={{ width: '100%', height: '100%', border: 0 }}
          title="map"
        />
      </View>
    );
  }

  return (
    <View testID={testID} style={[styles.container, { height }]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        onLoadEnd={push}
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
