import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Fuel,
  Navigation,
  Phone,
  Play,
  ShieldCheck,
  Siren,
  Smartphone,
  Square,
  WifiOff,
  X,
} from 'lucide-react-native';
import { Api } from '@/src/api';
import BrandLogo from '@/src/components/BrandLogo';
import { useAuth } from '@/src/auth';
import { buildGoogleMapsRouteUrl, RoutePhase } from '@/src/googleMaps';
import { flushQueuedCheckins, getQueuedCheckins, isLikelyOffline, queueCheckin } from '@/src/offlineCheckins';
import { buildPlannedRoadRoute, PlannedRoutePoint } from '@/src/plannedRoute';
import { requestRouteLocationPermissions, startRouteLocationUpdates, stopRouteLocationUpdates } from '@/src/backgroundLocation';
import { C, Fonts, S, T } from '@/src/theme';

const CHECKLIST = [
  { key: 'seatbelts', label: 'Seat belts checked', icon: ShieldCheck },
  { key: 'fuel', label: 'Fuel level checked', icon: Fuel },
  { key: 'phone', label: 'Phone charged and mounted', icon: Smartphone },
] as const;

const EVENT_OPTIONS = [
  { key: 'on_the_way', label: 'On the way' },
  { key: 'approaching', label: 'Approaching pickup' },
  { key: 'picked_up', label: 'Picked up' },
  { key: 'arrived_school', label: 'Arrived at school' },
  { key: 'leaving_school', label: 'Leaving school' },
  { key: 'arriving_home', label: 'Arriving home' },
  { key: 'arrived_home', label: 'Dropped off at home' },
  { key: 'delay', label: 'Traffic delay' },
  { key: 'no_show', label: 'No show' },
  { key: 'alt_dropoff', label: 'Alternate dropoff' },
] as const;

const PICKUP_COMPLETE_EVENTS = new Set(['picked_up', 'arrived_school', 'leaving_school', 'arriving_home', 'arrived_home']);
const ROUTE_FINAL_EVENTS = new Set(['arrived_school', 'arrived_home', 'alt_dropoff', 'no_show']);
type AttendanceDecision = 'picked_up' | 'no_show' | null;

export default function DriverHome() {
  const { user, refresh } = useAuth();
  const [kids, setKids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [onDuty, setOnDuty] = useState<boolean>(!!(user as any)?.on_duty);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [expandedKid, setExpandedKid] = useState<string | null>(null);
  const [statusMenu, setStatusMenu] = useState<string | null>(null);
  const [routePhase, setRoutePhase] = useState<RoutePhase>(() => new Date().getHours() < 12 ? 'morning' : 'afternoon');
  const [starting, setStarting] = useState(false);
  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);
  const [showEndCheck, setShowEndCheck] = useState(false);
  const [vehicleChecked, setVehicleChecked] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [sosBusy, setSosBusy] = useState(false);
  const locInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const checklistComplete = CHECKLIST.every((item) => checks[item.key]);

  const load = useCallback(async () => {
    try {
      const sync = await flushQueuedCheckins(Api.driverCheckin);
      const remoteKids = await Api.driverToday();
      const queued = sync.remaining.length ? sync.remaining : await getQueuedCheckins();
      const withQueuedState = remoteKids.map((kid) => {
        const pending = [...queued].reverse().find((item) => item.data.child_id === kid.id);
        return pending ? {
          ...kid,
          latest_event: { event_type: pending.data.event_type, message: 'Saved offline · waiting to sync', created_at: pending.queued_at, pending_sync: true },
        } : kid;
      });
      setKids(withQueuedState);
      setPendingSync(queued.length);
    } catch {
      const queued = await getQueuedCheckins();
      setPendingSync(queued.length);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const syncTimer = setInterval(load, 12000);
    return () => clearInterval(syncTimer);
  }, [load]);

  const startRoute = () => {
    if (!kids.length) {
      Alert.alert('No children assigned', 'An administrator must assign at least one child before this route can start.');
      return;
    }
    if (!checklistComplete) {
      Alert.alert('Safety check incomplete', 'Complete every pre-route check before starting the route.');
      return;
    }
    setShowLocationDisclosure(true);
  };

  const beginRouteWithLocation = async () => {
    setShowLocationDisclosure(false);
    setStarting(true);
    let routeStarted = false;
    try {
      await requestRouteLocationPermissions();
      const initialLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const startPoint = { lat: initialLocation.coords.latitude, lng: initialLocation.coords.longitude };
      await Api.driverStart(routePhase);
      routeStarted = true;
      setOnDuty(true);
      await Api.driverLocation(startPoint.lat, startPoint.lng);

      const tick = async (): Promise<PlannedRoutePoint> => {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const point = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        await Api.driverLocation(point.lat, point.lng);
        return point;
      };

      try {
        const planned = await buildPlannedRoadRoute(kids, routePhase, startPoint);
        if (planned.points.length > 1) {
          await Api.driverPlan({ phase: routePhase, addresses: planned.addresses, points: planned.points });
        }
      } catch {
        // Navigation still opens even when planned-route generation is temporarily unavailable.
      }
      if (Platform.OS === 'web') locInterval.current = setInterval(() => { void tick().catch(() => {}); }, 5000);
      else await startRouteLocationUpdates();
      await refresh();
      await openGoogleMaps();
    } catch (e: any) {
      if (routeStarted) {
        try { await Api.driverEnd({ all_children_accounted_for: false, vehicle_checked_empty: false }); } catch {}
        try { await stopRouteLocationUpdates(); } catch {}
        setOnDuty(false);
      }
      Alert.alert('Error', e.message);
    } finally {
      setStarting(false);
    }
  };

  const openGoogleMaps = async () => {
    const url = buildGoogleMapsRouteUrl(kids, routePhase);
    if (!url) {
      Alert.alert('Route addresses needed', 'Add pickup and school addresses before opening Google Maps.');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Google Maps unavailable', 'The route has started, but Google Maps could not be opened on this device.');
    }
  };

  const endRoute = async () => {
    try {
      try { await stopRouteLocationUpdates(); } catch {}
      if (locInterval.current) {
        clearInterval(locInterval.current);
        locInterval.current = null;
      }
      await Api.driverEnd({ all_children_accounted_for: true, vehicle_checked_empty: true });
      setOnDuty(false);
      setChecks({});
      setShowEndCheck(false);
      setVehicleChecked(false);
      await refresh();
    } catch (e: any) {
      Alert.alert('Route close needs retry', `Location tracking has stopped on this device, but the service did not confirm the route ending. Keep this screen open and try again.\n\n${e.message}`);
    }
  };

  useEffect(() => () => { if (locInterval.current) clearInterval(locInterval.current); }, []);

  const checkin = async (childId: string, eventType: string, extra?: any) => {
    const payload = { child_id: childId, event_type: eventType, ...(extra || {}) };
    const optimisticEvent = { event_type: eventType, message: extra?.message, created_at: new Date().toISOString() };
    try {
      await Api.driverCheckin(payload);
      setKids((current) => current.map((kid) => kid.id === childId ? { ...kid, latest_event: optimisticEvent } : kid));
      await load();
      return true;
    } catch (e: any) {
      if (isLikelyOffline(e)) {
        const count = await queueCheckin(payload);
        setPendingSync(count);
        setKids((current) => current.map((kid) => kid.id === childId ? {
          ...kid,
          latest_event: { ...optimisticEvent, message: 'Saved offline · waiting to sync', pending_sync: true },
        } : kid));
        return true;
      }
      Alert.alert('Error', e.message);
      return false;
    }
  };

  const contactEmergencyAdmin = async () => {
    setSosBusy(true);
    try {
      let coords: { latitude: number; longitude: number } | undefined;
      try {
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = location.coords;
      } catch {}
      const result = await Api.driverEmergency({
        lat: coords?.latitude,
        lng: coords?.longitude,
        message: 'Driver requested immediate administrator assistance from the active route.',
      });
      const actions: any[] = [{ text: 'Close', style: 'cancel' }];
      if (result.admin_phone) {
        actions.push({ text: 'Call admin', onPress: () => Linking.openURL(`tel:${result.admin_phone}`) });
      }
      Alert.alert('Administrator alerted', 'Your SOS and current location were added to the live operations timeline.', actions);
    } catch (error: any) {
      Alert.alert('Unable to send SOS', `${error.message}\n\nIf anyone is in immediate danger, call emergency services.`);
    } finally {
      setSosBusy(false);
    }
  };

  const confirmSOS = () => Alert.alert(
    'Send emergency SOS?',
    'This immediately alerts the VIP administrator and shares your current location.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'SEND SOS', style: 'destructive', onPress: contactEmergencyAdmin },
    ],
  );

  const selectStatus = async (childId: string, eventType: string) => {
    setStatusMenu(null);
    if (eventType === 'alt_dropoff') {
      if (Platform.OS === 'ios') {
        Alert.prompt('Alternate Dropoff', 'Enter the approved alternate address:', (address) => {
          if (address) checkin(childId, eventType, { address, message: `Dropped at: ${address}` });
        });
      } else {
        Alert.alert('Alternate Dropoff', 'Confirm the approved alternate dropoff?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', onPress: () => checkin(childId, eventType, { message: 'Dropped at the approved alternate address.' }) },
        ]);
      }
      return;
    }
    if (eventType === 'delay') {
      Alert.alert('Traffic Delay', 'Send a delay notification to this parent?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: () => checkin(childId, eventType) },
      ]);
      return;
    }
    await checkin(childId, eventType);
  };

  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;
  const allChildrenFinal = kids.length === 0 || kids.every((kid) => ROUTE_FINAL_EVENTS.has(kid.latest_event?.event_type));

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl tintColor={C.gold} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={styles.header}>
          <View style={styles.headerIdentity}>
            <BrandLogo compact width={42} />
            <View>
              <Text style={styles.welcome}>Welcome,</Text>
              <Text style={styles.name}>{user?.name?.split(' ')[0]}</Text>
            </View>
          </View>
          <View style={[styles.dutyBadge, onDuty && styles.dutyOn]}>
            <View style={[styles.dot, { backgroundColor: onDuty ? C.success : C.textMuted }]} />
            <Text style={[styles.dutyText, onDuty && styles.dutyTextOn]}>{onDuty ? 'ON ROUTE' : 'OFF DUTY'}</Text>
          </View>
        </View>

        {pendingSync > 0 ? (
          <View style={styles.offlineBanner} testID="offline-sync-banner">
            <WifiOff size={15} color={C.gold} />
            <Text style={styles.offlineText}>{pendingSync} ATTENDANCE UPDATE{pendingSync === 1 ? '' : 'S'} SAVED OFFLINE · SYNCING AUTOMATICALLY</Text>
          </View>
        ) : null}

        {!onDuty ? (
          <View style={styles.checklistCard} testID="pre-route-checklist">
            <View style={styles.checklistHeading}>
              <ClipboardCheck size={21} color={C.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.checklistTitle}>Pre-route safety check</Text>
                <Text style={styles.checklistCopy}>Complete all {CHECKLIST.length} items before broadcasting GPS.</Text>
              </View>
              <Text style={styles.checkCount}>{Object.values(checks).filter(Boolean).length}/{CHECKLIST.length}</Text>
            </View>

            <View style={styles.checkList}>
              <View style={styles.phaseBlock}>
                <Text style={styles.phaseLabel}>ROUTE DIRECTION</Text>
                <View style={styles.phaseRow}>
                  <Pressable style={[styles.phaseButton, routePhase === 'morning' && styles.phaseButtonActive]} onPress={() => setRoutePhase('morning')} testID="route-phase-morning">
                    <Text style={[styles.phaseText, routePhase === 'morning' && styles.phaseTextActive]}>MORNING PICKUPS</Text>
                  </Pressable>
                  <Pressable style={[styles.phaseButton, routePhase === 'afternoon' && styles.phaseButtonActive]} onPress={() => setRoutePhase('afternoon')} testID="route-phase-afternoon">
                    <Text style={[styles.phaseText, routePhase === 'afternoon' && styles.phaseTextActive]}>AFTERNOON RETURN</Text>
                  </Pressable>
                </View>
              </View>
              {CHECKLIST.map(({ key, label, icon: Icon }) => {
                const checked = !!checks[key];
                return (
                  <Pressable
                    key={key}
                    testID={`checklist-${key}`}
                    style={[styles.checkRow, checked && styles.checkRowDone]}
                    onPress={() => setChecks((current) => ({ ...current, [key]: !current[key] }))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                  >
                    <View style={[styles.checkBox, checked && styles.checkBoxDone]}>{checked ? <Check size={15} color={C.bg} /> : <Icon size={15} color={C.textMuted} />}</View>
                    <Text style={[styles.checkText, checked && styles.checkTextDone]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[styles.startBtn, !checklistComplete && styles.startBtnDisabled]}
              onPress={startRoute}
              disabled={!checklistComplete || starting}
              testID="start-route-btn"
            >
              {starting ? <ActivityIndicator color={C.bg} /> : <><Play size={18} color={checklistComplete ? C.bg : C.textMuted} /><Text style={[styles.startBtnText, !checklistComplete && styles.startBtnTextDisabled]}>START ROUTE · OPEN GOOGLE MAPS</Text></>}
            </Pressable>
          </View>
        ) : (
          <View style={styles.activeRouteBlock}>
            <View style={styles.activeRouteActions}>
              <Pressable style={styles.mapsBtn} onPress={openGoogleMaps} testID="open-google-maps-btn">
                <Navigation size={17} color={C.bg} fill={C.bg} />
                <Text style={styles.mapsBtnText}>OPEN GOOGLE MAPS</Text>
              </Pressable>
              <Pressable style={styles.endBtn} onPress={() => setShowEndCheck(true)} testID="end-route-btn">
                <Square size={16} color={C.danger} />
                <Text style={styles.endBtnText}>END ROUTE</Text>
              </Pressable>
            </View>
            <Pressable style={styles.sosButton} onPress={confirmSOS} disabled={sosBusy} testID="driver-sos-btn">
              {sosBusy ? <ActivityIndicator color={C.text} /> : <Siren size={18} color={C.text} />}
              <Text style={styles.sosText}>EMERGENCY · ALERT VIP ADMIN</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionLabel}>TODAY’S ASSIGNED ROUTE · {kids.length} CHILDREN</Text>

        {kids.map((kid, index) => {
          const expanded = expandedKid === kid.id;
          const currentEvent = kid.latest_event?.event_type || 'scheduled';
          const pickupComplete = PICKUP_COMPLETE_EVENTS.has(currentEvent);
          const absent = currentEvent === 'no_show';
          const attendanceDecision: AttendanceDecision = absent ? 'no_show' : pickupComplete ? 'picked_up' : null;
          return (
            <View key={kid.id} style={[styles.kidCard, pickupComplete && styles.kidCardPicked, absent && styles.kidCardAbsent]} testID={`kid-card-${kid.id}`}>
              <Pressable
                style={styles.kidTop}
                onPress={() => {
                  setExpandedKid(expanded ? null : kid.id);
                  setStatusMenu(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
              >
                <View style={[styles.orderBadge, pickupComplete && styles.orderBadgePicked, absent && styles.orderBadgeAbsent]}><Text style={styles.orderText}>{pickupComplete ? '✓' : absent ? '×' : index + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kidName}>{kid.name}</Text>
                  <Text style={styles.kidSchool}>{kid.school}</Text>
                  <Text style={[styles.currentStatus, pickupComplete && styles.currentStatusPicked, absent && styles.currentStatusAbsent]}>{currentEvent.replace(/_/g, ' ').toUpperCase()}{kid.latest_event?.pending_sync ? ' · OFFLINE' : ''}</Text>
                </View>
                {expanded ? <ChevronUp size={21} color={C.gold} /> : <ChevronDown size={21} color={C.gold} />}
              </Pressable>

              {onDuty ? (
                <SwipeAttendance
                  childName={kid.name?.split(' ')[0] || 'Child'}
                  decision={attendanceDecision}
                  onDecision={(decision) => checkin(kid.id, decision)}
                />
              ) : (
                <View style={styles.lockedPickup}><Text style={styles.lockedPickupText}>START ROUTE TO ENABLE PICKUP</Text></View>
              )}

              {expanded ? (
                <View style={styles.kidDetails}>
                  <View style={styles.address}>
                    <Text style={styles.addressLabel}>PICKUP · {kid.pickup_time}</Text>
                    <Text style={styles.addressText}>{kid.home_address}</Text>
                    <Text style={styles.addressLabel}>SCHOOL · {kid.dropoff_time}</Text>
                    <Text style={styles.addressText}>{kid.school_address}</Text>
                  </View>

                  {kid.parent ? (
                    <View style={styles.parentRow}>
                      <View style={{ flex: 1 }}><Text style={styles.parentLabel}>PARENT</Text><Text style={styles.parentName}>{kid.parent.name}</Text></View>
                      <Text style={styles.parentPhone}>{kid.parent.phone}</Text>
                    </View>
                  ) : null}

                  <View style={styles.emergencyContact}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.parentLabel}>EMERGENCY CONTACT</Text>
                      <Text style={styles.parentName}>{kid.emergency_contact_name || 'Not entered'}</Text>
                    </View>
                    {kid.emergency_contact_phone ? (
                      <Pressable style={styles.callButton} onPress={() => Linking.openURL(`tel:${kid.emergency_contact_phone}`)} testID={`call-emergency-${kid.id}`}>
                        <Phone size={15} color={C.bg} />
                        <Text style={styles.callButtonText}>CALL</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <Pressable
                    style={styles.statusDropdown}
                    onPress={() => setStatusMenu(statusMenu === kid.id ? null : kid.id)}
                    disabled={!onDuty}
                    testID={`status-dropdown-${kid.id}`}
                  >
                    <Text style={styles.statusDropdownText}>UPDATE ROUTE STATUS</Text>
                    {statusMenu === kid.id ? <ChevronUp size={18} color={C.gold} /> : <ChevronDown size={18} color={C.gold} />}
                  </Pressable>

                  {statusMenu === kid.id ? (
                    <View style={styles.statusMenu}>
                      {EVENT_OPTIONS.map((option) => (
                        <Pressable
                          key={option.key}
                          style={styles.statusOption}
                          onPress={() => selectStatus(kid.id, option.key)}
                          testID={`checkin-${kid.id}-${option.key}`}
                        >
                          {option.key === 'delay' || option.key === 'no_show'
                            ? <AlertTriangle size={15} color={C.warning} />
                            : <Check size={15} color={C.gold} />}
                          <Text style={styles.statusOptionText}>{option.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}

        {kids.length === 0 ? <Text style={styles.empty}>No children assigned yet.</Text> : null}
      </ScrollView>

      <Modal visible={showLocationDisclosure} animationType="fade" transparent onRequestClose={() => setShowLocationDisclosure(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.endModal}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalEyebrow}>BACKGROUND LOCATION DISCLOSURE</Text>
                <Text style={styles.modalTitle}>Live route tracking</Text>
              </View>
              <Pressable style={styles.modalClose} onPress={() => setShowLocationDisclosure(false)} accessibilityLabel="Close location disclosure"><X size={20} color={C.text} /></Pressable>
            </View>
            <Text style={styles.locationDisclosureLead}>VIP Kids collects and sends this driver device’s precise location during an active route—even while the app is in the background or Google Maps is open.</Text>
            <View style={styles.disclosureList}>
              <Text style={styles.disclosureItem}>• Location updates are sent about every 5 seconds for live vehicle tracking and route safety.</Text>
              <Text style={styles.disclosureItem}>• Assigned families and authorized VIP Kids operations staff can see the route vehicle’s location.</Text>
              <Text style={styles.disclosureItem}>• Mapping and routing providers may process route coordinates to display and navigate the assigned trip.</Text>
              <Text style={styles.disclosureItem}>• Tracking stops when you confirm and end the route.</Text>
            </View>
            <Pressable style={styles.finishButton} onPress={beginRouteWithLocation} testID="accept-location-disclosure">
              <Navigation size={18} color={C.bg} fill={C.bg} />
              <Text style={styles.finishButtonText}>ALLOW ROUTE TRACKING</Text>
            </Pressable>
            <Pressable style={styles.disclosureCancel} onPress={() => setShowLocationDisclosure(false)}>
              <Text style={styles.disclosureCancelText}>NOT NOW</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showEndCheck} animationType="slide" transparent onRequestClose={() => setShowEndCheck(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.endModal}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}><Text style={styles.modalEyebrow}>END-OF-ROUTE SAFETY CHECK</Text><Text style={styles.modalTitle}>Clear every seat</Text></View>
              <Pressable style={styles.modalClose} onPress={() => setShowEndCheck(false)}><X size={20} color={C.text} /></Pressable>
            </View>
            <View style={[styles.endCheckRow, allChildrenFinal && styles.endCheckDone]}>
              <View style={[styles.endCheckBox, allChildrenFinal && styles.endCheckBoxDone]}>{allChildrenFinal ? <Check size={16} color={C.bg} /> : null}</View>
              <View style={{ flex: 1 }}><Text style={styles.endCheckTitle}>Every child has a final status</Text><Text style={styles.endCheckCopy}>{allChildrenFinal ? 'Arrived, dropped off, or marked absent.' : 'Update every child to arrived, dropped off, or absent first.'}</Text></View>
            </View>
            <Pressable style={[styles.endCheckRow, vehicleChecked && styles.endCheckDone]} onPress={() => setVehicleChecked((current) => !current)} accessibilityRole="checkbox" accessibilityState={{ checked: vehicleChecked }} testID="vehicle-empty-check">
              <View style={[styles.endCheckBox, vehicleChecked && styles.endCheckBoxDone]}>{vehicleChecked ? <Check size={16} color={C.bg} /> : null}</View>
              <View style={{ flex: 1 }}><Text style={styles.endCheckTitle}>Vehicle physically checked</Text><Text style={styles.endCheckCopy}>I checked every row, seat, and floor area. No child remains in the vehicle.</Text></View>
            </Pressable>
            <Pressable style={[styles.finishButton, (!allChildrenFinal || !vehicleChecked) && styles.finishButtonDisabled]} disabled={!allChildrenFinal || !vehicleChecked} onPress={endRoute} testID="confirm-end-route">
              <ShieldCheck size={18} color={allChildrenFinal && vehicleChecked ? C.bg : C.textMuted} />
              <Text style={[styles.finishButtonText, (!allChildrenFinal || !vehicleChecked) && styles.finishButtonTextDisabled]}>CONFIRM & END ROUTE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SwipeAttendance({ childName, decision, onDecision }: { childName: string; decision: AttendanceDecision; onDecision: (decision: Exclude<AttendanceDecision, null>) => Promise<boolean> }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const maxDistance = useRef(0);
  const decisionRef = useRef<AttendanceDecision>(decision);
  const busyRef = useRef(false);
  const onDecisionRef = useRef(onDecision);
  const [confirmed, setConfirmed] = useState<AttendanceDecision>(decision);
  const [busy, setBusy] = useState(false);

  useEffect(() => { onDecisionRef.current = onDecision; }, [onDecision]);
  useEffect(() => {
    decisionRef.current = decision;
    setConfirmed(decision);
    const destination = decision === 'picked_up' ? maxDistance.current : decision === 'no_show' ? -maxDistance.current : 0;
    Animated.spring(translateX, { toValue: destination, useNativeDriver: true }).start();
  }, [decision, translateX]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !decisionRef.current && !busyRef.current,
    onMoveShouldSetPanResponder: (_, gesture) => !decisionRef.current && !busyRef.current && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => translateX.setValue(Math.max(-maxDistance.current, Math.min(gesture.dx, maxDistance.current))),
    onPanResponderRelease: (_, gesture) => {
      const nextDecision: AttendanceDecision = gesture.dx >= maxDistance.current * 0.58
        ? 'picked_up'
        : gesture.dx <= -maxDistance.current * 0.58 ? 'no_show' : null;
      const destination = nextDecision === 'picked_up' ? maxDistance.current : nextDecision === 'no_show' ? -maxDistance.current : 0;
      Animated.spring(translateX, { toValue: destination, useNativeDriver: true }).start(async () => {
        if (!nextDecision) return;
        busyRef.current = true;
        setBusy(true);
        const saved = await onDecisionRef.current(nextDecision);
        busyRef.current = false;
        setBusy(false);
        if (saved) {
          decisionRef.current = nextDecision;
          setConfirmed(nextDecision);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      });
    },
    onPanResponderTerminate: () => Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(),
  })).current;

  return (
    <View
      style={[styles.swipeTrack, confirmed === 'picked_up' && styles.swipeTrackDone, confirmed === 'no_show' && styles.swipeTrackAbsent]}
      onLayout={(event) => {
        maxDistance.current = Math.max(0, (event.nativeEvent.layout.width - 58) / 2);
        translateX.setValue(decisionRef.current === 'picked_up' ? maxDistance.current : decisionRef.current === 'no_show' ? -maxDistance.current : 0);
      }}
      testID={`swipe-attendance-${childName.toLowerCase()}`}
    >
      {!confirmed ? <Text style={styles.swipeLeftLabel}>‹ ABSENT</Text> : null}
      <Text style={[styles.swipeText, confirmed === 'picked_up' && styles.swipeTextDone, confirmed === 'no_show' && styles.swipeTextAbsent]}>
        {confirmed === 'picked_up' ? `${childName.toUpperCase()} PICKED UP` : confirmed === 'no_show' ? `${childName.toUpperCase()} ABSENT` : 'SWIPE ATTENDANCE'}
      </Text>
      {!confirmed ? <Text style={styles.swipeRightLabel}>PICKED UP ›</Text> : null}
      <Animated.View testID={`swipe-handle-${childName.toLowerCase()}`} style={[styles.swipeHandle, confirmed === 'picked_up' && styles.swipeHandleDone, confirmed === 'no_show' && styles.swipeHandleAbsent, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        {busy ? <ActivityIndicator size="small" color={C.bg} /> : confirmed === 'picked_up' ? <Check size={22} color={C.bg} /> : confirmed === 'no_show' ? <X size={22} color={C.text} /> : <Text style={styles.swipeArrows}>‹ ›</Text>}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: S.md, paddingBottom: S.xxxl, gap: S.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  offlineBanner: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderRadius: 10, borderCurve: 'continuous', borderWidth: 1, borderColor: C.goldMuted, backgroundColor: 'rgba(212,175,55,.08)' },
  offlineText: { flex: 1, color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.65 },
  welcome: { ...T.bodySm },
  name: { ...T.h2, fontSize: 26 },
  dutyBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderCurve: 'continuous', borderWidth: 1, borderColor: C.borderLight },
  dutyOn: { borderColor: C.success },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dutyText: { color: C.textMuted, fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 1 },
  dutyTextOn: { color: C.success },
  checklistCard: { padding: S.md, gap: S.md, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.border, borderRadius: 16, borderCurve: 'continuous' },
  checklistHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checklistTitle: { ...T.h3, fontSize: 18 },
  checklistCopy: { ...T.bodySm, fontSize: 11 },
  checkCount: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 13 },
  checkList: { gap: 7 },
  phaseBlock: { gap: 7, paddingBottom: 5 },
  phaseLabel: { ...T.caption, color: C.textSecondary, fontSize: 9 },
  phaseRow: { flexDirection: 'row', gap: 7 },
  phaseButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: C.borderLight, borderRadius: 9, borderCurve: 'continuous' },
  phaseButtonActive: { borderColor: C.gold, backgroundColor: 'rgba(212,175,55,.12)' },
  phaseText: { color: C.textMuted, fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.7, textAlign: 'center' },
  phaseTextActive: { color: C.gold },
  checkRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, borderCurve: 'continuous' },
  checkRowDone: { borderColor: 'rgba(16,185,129,.48)', backgroundColor: 'rgba(16,185,129,.08)' },
  checkBox: { width: 27, height: 27, borderRadius: 8, borderCurve: 'continuous', borderWidth: 1, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center' },
  checkBoxDone: { borderColor: C.success, backgroundColor: C.success },
  checkText: { flex: 1, color: C.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 13 },
  checkTextDone: { color: C.text },
  startBtn: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.gold, borderRadius: 12, borderCurve: 'continuous' },
  startBtnDisabled: { backgroundColor: C.bgTertiary },
  startBtnText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: 1.4 },
  startBtnTextDisabled: { color: C.textMuted },
  activeRouteBlock: { gap: 8 },
  activeRouteActions: { flexDirection: 'row', gap: 8 },
  mapsBtn: { flex: 1.5, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderCurve: 'continuous', backgroundColor: C.gold },
  mapsBtnText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 1 },
  endBtn: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderCurve: 'continuous', borderColor: C.danger, borderWidth: 1 },
  endBtnText: { color: C.danger, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: 1.5 },
  sosButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderCurve: 'continuous', backgroundColor: C.danger },
  sosText: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.2 },
  sectionLabel: { ...T.caption, color: C.textSecondary },
  kidCard: { backgroundColor: C.bgSecondary, borderRadius: 16, borderCurve: 'continuous', padding: S.md, borderWidth: 1, borderColor: C.border, gap: 12 },
  kidCardPicked: { borderColor: 'rgba(16,185,129,.65)' },
  kidCardAbsent: { borderColor: 'rgba(239,68,68,.72)' },
  kidTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  orderBadgePicked: { backgroundColor: C.success },
  orderBadgeAbsent: { backgroundColor: C.danger },
  orderText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 13 },
  kidName: { ...T.h3, fontSize: 17 },
  kidSchool: { ...T.bodySm, fontSize: 12 },
  currentStatus: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.8, marginTop: 3 },
  currentStatusPicked: { color: C.success },
  currentStatusAbsent: { color: C.danger },
  swipeTrack: { height: 58, padding: 4, justifyContent: 'center', overflow: 'hidden', backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderLight, borderRadius: 14, borderCurve: 'continuous' },
  swipeTrackDone: { backgroundColor: 'rgba(16,185,129,.16)', borderColor: C.success },
  swipeTrackAbsent: { backgroundColor: 'rgba(239,68,68,.16)', borderColor: C.danger },
  swipeText: { position: 'absolute', alignSelf: 'center', color: C.textMuted, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 1 },
  swipeTextDone: { color: C.success },
  swipeTextAbsent: { color: C.danger },
  swipeLeftLabel: { position: 'absolute', left: 11, color: C.danger, fontFamily: Fonts.bodySemiBold, fontSize: 8, letterSpacing: 0.7 },
  swipeRightLabel: { position: 'absolute', right: 11, color: C.success, fontFamily: Fonts.bodySemiBold, fontSize: 8, letterSpacing: 0.7 },
  swipeHandle: { position: 'absolute', left: '50%', marginLeft: -25, width: 50, height: 50, borderRadius: 11, borderCurve: 'continuous', backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  swipeHandleDone: { backgroundColor: C.success },
  swipeHandleAbsent: { backgroundColor: C.danger },
  swipeArrows: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 19, letterSpacing: -2 },
  lockedPickup: { minHeight: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, borderRadius: 10, borderCurve: 'continuous', borderWidth: 1, borderColor: C.border },
  lockedPickupText: { color: C.textMuted, fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 1.1 },
  kidDetails: { gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
  address: { padding: 11, gap: 4, backgroundColor: C.bg, borderRadius: 10, borderCurve: 'continuous' },
  addressLabel: { ...T.caption, fontSize: 9, color: C.gold, marginTop: 3 },
  addressText: { ...T.bodySm, fontSize: 12, color: C.text },
  parentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  parentLabel: { ...T.caption, fontSize: 9 },
  parentName: { ...T.body, fontSize: 13, fontFamily: Fonts.bodyMedium },
  parentPhone: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 12 },
  emergencyContact: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: 'rgba(239,68,68,.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,.42)', borderRadius: 10, borderCurve: 'continuous' },
  callButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, backgroundColor: C.gold, borderRadius: 9, borderCurve: 'continuous' },
  callButtonText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.8 },
  statusDropdown: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderWidth: 1, borderColor: C.goldMuted, borderRadius: 10, borderCurve: 'continuous' },
  statusDropdownText: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.2 },
  statusMenu: { overflow: 'hidden', borderWidth: 1, borderColor: C.border, borderRadius: 10, borderCurve: 'continuous' },
  statusOption: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  statusOptionText: { color: C.text, fontFamily: Fonts.bodyMedium, fontSize: 13 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.76)' },
  endModal: { padding: S.md, paddingBottom: 32, gap: 12, backgroundColor: C.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderCurve: 'continuous', borderWidth: 1, borderColor: C.borderLight },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  modalEyebrow: { ...T.caption, color: C.gold, fontSize: 9 },
  modalTitle: { ...T.h2, fontSize: 23 },
  modalClose: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgTertiary },
  locationDisclosureLead: { ...T.body, color: C.text, lineHeight: 21 },
  disclosureList: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.bg },
  disclosureItem: { ...T.bodySm, color: C.textSecondary, lineHeight: 18 },
  disclosureCancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  disclosureCancelText: { color: C.textSecondary, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.2 },
  endCheckRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, borderCurve: 'continuous' },
  endCheckDone: { borderColor: 'rgba(16,185,129,.55)', backgroundColor: 'rgba(16,185,129,.08)' },
  endCheckBox: { width: 29, height: 29, borderRadius: 9, borderWidth: 1, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center' },
  endCheckBoxDone: { borderColor: C.success, backgroundColor: C.success },
  endCheckTitle: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 14 },
  endCheckCopy: { ...T.bodySm, fontSize: 11, marginTop: 2 },
  finishButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.gold, borderRadius: 12, borderCurve: 'continuous', marginTop: 3 },
  finishButtonDisabled: { backgroundColor: C.bgTertiary },
  finishButtonText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.2 },
  finishButtonTextDisabled: { color: C.textMuted },
  empty: { ...T.bodySm, textAlign: 'center', padding: S.xl },
});
