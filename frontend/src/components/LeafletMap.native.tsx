import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import MapView, { AnimatedRegion, Marker, Polyline } from 'react-native-maps';

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
export type MapRoute = { points: MapPoint[]; color?: string; label?: string };
export type MapMarker = MapPoint & {
  id?: string;
  label?: string;
  color?: string;
  type?: 'vehicle' | 'pickup' | 'dropoff' | 'child';
  vehicleNumber?: number | string;
  vehicleModel?: string;
  vehicleVariant?: number;
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

const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f1f0ec' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4b4b49' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f1f0ec' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d8d6cf' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cddde1' }] },
];

function validPoint(point?: MapPoint): point is MapPoint {
  return !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

function validMarker(marker: MapMarker): marker is MapMarker {
  return validPoint(marker);
}

function NativeVehicleMarker({ marker, index }: { marker: MapMarker; index: number }) {
  const variant = Number.isInteger(marker.vehicleVariant) ? Number(marker.vehicleVariant) : index;
  // Android custom markers can snapshot before a bundled image has decoded.
  // Keep tracking enabled just long enough to guarantee that the SUV appears,
  // then disable it to avoid re-rasterizing every marker on every GPS update.
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const coordinate = useRef(new AnimatedRegion({
    latitude: marker.lat,
    longitude: marker.lng,
    latitudeDelta: 0,
    longitudeDelta: 0,
  })).current;

  useEffect(() => {
    coordinate.timing({ latitude: marker.lat, longitude: marker.lng, latitudeDelta: 0, longitudeDelta: 0, duration: 4600, useNativeDriver: false } as any).start();
  }, [coordinate, marker.lat, marker.lng]);

  return (
    <Marker.Animated coordinate={coordinate as any} anchor={{ x: 0.5, y: 0.56 }} title={marker.label} tracksViewChanges={tracksViewChanges}>
      <View style={styles.vehicleWrap}>
        <Image
          source={FLEET_MARKER_ASSETS[variant % FLEET_MARKER_ASSETS.length]}
          style={styles.vehicleImage}
          resizeMode="contain"
          onLoadEnd={() => setTracksViewChanges(false)}
        />
        {marker.vehicleNumber ? <Text style={[styles.vehicleNumber, { backgroundColor: marker.color || '#D4AF37' }]}>{marker.vehicleNumber}</Text> : null}
        {marker.vehicleModel ? <Text style={styles.vehicleModel} numberOfLines={1}>{marker.vehicleModel}</Text> : null}
      </View>
    </Marker.Animated>
  );
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
  const map = useRef<MapView>(null);
  const visibleRoutes = routes.length ? routes : route.length ? [{ points: route, color: '#D4AF37' }] : [];
  const fallback = validPoint(center) ? center : markers.find(validPoint) || { lat: 26.0112, lng: -80.1495 };
  const routeCoordinates = useMemo(
    () => visibleRoutes.flatMap((item) => item.points.filter(validPoint).map((point) => ({ latitude: point.lat, longitude: point.lng }))),
    [visibleRoutes],
  );

  useEffect(() => {
    if (fitRoute && routeCoordinates.length > 1) {
      map.current?.fitToCoordinates(routeCoordinates, { edgePadding: { top: 52, right: 42, bottom: 52, left: 42 }, animated: true });
    } else if (validPoint(center)) {
      map.current?.animateCamera({ center: { latitude: center.lat, longitude: center.lng }, zoom }, { duration: 4200 });
    }
  }, [center?.lat, center?.lng, fitRoute, routeCoordinates, zoom]);

  return (
    <View testID={testID} style={[styles.container, { height }]}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: fallback.lat, longitude: fallback.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
        customMapStyle={MAP_STYLE}
        mapType="standard"
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        showsCompass={false}
        showsPointsOfInterests={false}
        onMapReady={() => {
          if (fitRoute && routeCoordinates.length > 1) map.current?.fitToCoordinates(routeCoordinates, { edgePadding: { top: 52, right: 42, bottom: 52, left: 42 }, animated: false });
        }}
        onPress={interactive ? (event) => onMapPress?.({ lat: event.nativeEvent.coordinate.latitude, lng: event.nativeEvent.coordinate.longitude }) : undefined}
      >
        {visibleRoutes.map((item, index) => {
          const points = item.points.filter(validPoint).map((point) => ({ latitude: point.lat, longitude: point.lng }));
          if (points.length < 2) return null;
          return (
            <React.Fragment key={`${item.label || 'route'}-${index}`}>
              <Polyline coordinates={points} strokeColor="#09090B77" strokeWidth={9} lineCap="round" lineJoin="round" />
              <Polyline coordinates={points} strokeColor={item.color || '#D4AF37'} strokeWidth={4} lineCap="round" lineJoin="round" />
            </React.Fragment>
          );
        })}
        {markers.filter(validMarker).map((marker, index) => marker.type === 'vehicle' ? (
          <NativeVehicleMarker key={marker.id || `${marker.lat}-${marker.lng}-${index}`} marker={marker} index={index} />
        ) : (
          <Marker
            key={marker.id || `${marker.lat}-${marker.lng}-${index}`}
            coordinate={{ latitude: marker.lat, longitude: marker.lng }}
            title={marker.label}
            pinColor={marker.color || '#D4AF37'}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', overflow: 'hidden', backgroundColor: '#F2F1ED' },
  vehicleWrap: { width: 94, height: 82, alignItems: 'center', justifyContent: 'center' },
  vehicleImage: { width: 82, height: 58 },
  vehicleNumber: { position: 'absolute', right: 3, top: 3, minWidth: 21, height: 21, borderRadius: 11, overflow: 'hidden', color: '#09090B', borderWidth: 2, borderColor: '#FFFFFF', fontSize: 10, fontWeight: '800', lineHeight: 17, textAlign: 'center' },
  vehicleModel: { maxWidth: 92, marginTop: -7, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, overflow: 'hidden', backgroundColor: '#09090BE8', color: '#FFFFFF', borderWidth: 1, borderColor: '#FFFFFF55', fontSize: 8, fontWeight: '700', textAlign: 'center' },
});
