import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Trash2, Check, X, Plus, Link2, UserCheck, Camera, PauseCircle, PlayCircle, Edit3, Car, MapPinned } from 'lucide-react-native';
import { Api } from '@/src/api';
import { pickPhoto } from '@/src/photoPicker';
import { C, S, T, Fonts } from '@/src/theme';

type Tab = 'pending' | 'children' | 'parents' | 'drivers' | 'vehicles' | 'routes';

export default function AdminUsers() {
  const [tab, setTab] = useState<Tab>('pending');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddChild, setShowAddChild] = useState(false);
  const [editChild, setEditChild] = useState<any | null>(null);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [editVehicle, setEditVehicle] = useState<any | null>(null);
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [editRoute, setEditRoute] = useState<any | null>(null);
  const [assignFor, setAssignFor] = useState<any | null>(null);
  const [parents, setParents] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [allChildren, setAllChildren] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'children') setData(await Api.adminChildren());
      else if (tab === 'pending') setData(await Api.adminPending());
      else if (tab === 'vehicles') setData(await Api.adminVehicles());
      else if (tab === 'routes') setData(await Api.adminListRoutes());
      else setData(await Api.adminUsers(tab === 'parents' ? 'parent' : 'driver'));
    } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([Api.adminUsers('parent'), Api.adminUsers('driver'), Api.adminVehicles(), Api.adminChildren()])
      .then(([p, d, v, c]) => { setParents(p); setDrivers(d); setVehicles(v); setAllChildren(c); }).catch(() => {});
  }, []);

  const remove = (id: string, label: string) => {
    Alert.alert('Remove', `Remove ${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        if (tab === 'children') await Api.adminDeleteChild(id);
        else if (tab === 'vehicles') await Api.adminDeleteVehicle(id);
        else if (tab === 'routes') await Api.adminDeleteRoute(id);
        else await Api.adminDeleteUser(id);
        load();
      }},
    ]);
  };

  const approve = async (uid: string) => {
    try { await Api.adminApprove(uid); await load(); Alert.alert('Approved', 'User can now be assigned (parents) or log in (drivers).'); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };
  const reject = async (uid: string) => {
    Alert.alert('Reject', 'Reject and delete this account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => { await Api.adminReject(uid); await load(); }},
    ]);
  };

  const activateParent = async (uid: string) => {
    try { await Api.adminActivateParent(uid); Alert.alert('Activated', 'Parent can now log in.'); await load(); }
    catch (e: any) { Alert.alert('Cannot activate', e.message); }
  };

  const toggleSuspend = async (u: any) => {
    try {
      if (u.status === 'suspended') {
        await Api.adminReactivate(u.id);
      } else {
        Alert.alert('Suspend', `Suspend ${u.name}? They will be unable to log in.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Suspend', style: 'destructive', onPress: async () => { await Api.adminSuspend(u.id); await load(); } },
        ]);
        return;
      }
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const changeChildPhoto = async (cid: string) => {
    const photo = await pickPhoto();
    if (!photo) return;
    try { await Api.adminChildPhoto(cid, photo); await load(); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={{ padding: S.md }}>
        <View style={styles.headRow}>
          <Text style={[T.h2, { fontSize: 24 }]}>Manage</Text>
          {tab === 'children' && (
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddChild(true)} testID="add-child-btn">
              <Plus size={16} color={C.bg} />
              <Text style={styles.addBtnText}>ADD CHILD</Text>
            </TouchableOpacity>
          )}
          {tab === 'vehicles' && (
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddVehicle(true)} testID="add-vehicle-btn">
              <Plus size={16} color={C.bg} />
              <Text style={styles.addBtnText}>ADD VEHICLE</Text>
            </TouchableOpacity>
          )}
          {tab === 'routes' && (
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddRoute(true)} testID="add-route-btn">
              <Plus size={16} color={C.bg} />
              <Text style={styles.addBtnText}>ADD ROUTE</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: S.sm }}>
          {(['pending', 'children', 'parents', 'drivers', 'vehicles', 'routes'] as Tab[]).map((t) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]} testID={`admin-tab-${t}`}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? <ActivityIndicator color={C.gold} /> : (
        <ScrollView contentContainerStyle={{ padding: S.md, paddingBottom: S.xxxl }}>
          {tab === 'vehicles' && data.map((v: any) => (
            <View key={v.id} style={styles.row}>
              {v.photo_url ? <Image source={{ uri: v.photo_url }} style={styles.av} /> : <View style={[styles.av, { backgroundColor: C.bgTertiary, alignItems: 'center', justifyContent: 'center' }]}><Car size={20} color={C.gold} /></View>}
              <View style={{ flex: 1, marginLeft: S.sm }}>
                <Text style={styles.name}>{v.year ? `${v.year} ` : ''}{v.make} {v.model}</Text>
                <Text style={styles.sub}>{v.plate} · {v.color}</Text>
                {(v.registration_expiry || v.insurance_expiry || v.inspection_expiry) && (
                  <Text style={[styles.sub, { color: C.gold }]}>
                    {v.registration_expiry ? `REG ${v.registration_expiry}` : ''}
                    {v.insurance_expiry ? ` · INS ${v.insurance_expiry}` : ''}
                    {v.inspection_expiry ? ` · INSP ${v.inspection_expiry}` : ''}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setEditVehicle(v)} testID={`edit-vehicle-${v.id}`} style={{ padding: 8 }}>
                <Edit3 size={14} color={C.gold} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(v.id, `${v.make} ${v.model}`)} testID={`delete-vehicle-${v.id}`} style={{ padding: 8 }}>
                <Trash2 size={14} color={C.danger} />
              </TouchableOpacity>
            </View>
          ))}

          {tab === 'routes' && data.map((r: any) => (
            <View key={r.id} style={styles.row}>
              <View style={[styles.av, { backgroundColor: C.bgTertiary, alignItems: 'center', justifyContent: 'center' }]}><MapPinned size={20} color={C.gold} /></View>
              <View style={{ flex: 1, marginLeft: S.sm }}>
                <Text style={styles.name}>{r.name}</Text>
                <Text style={styles.sub}>
                  {r.school || 'No school'} · {r.driver?.name || 'No driver'} · {r.children?.length || 0} kids
                </Text>
                {r.notes ? <Text style={[styles.sub, { fontStyle: 'italic' }]}>{r.notes}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => setEditRoute(r)} testID={`edit-route-${r.id}`} style={{ padding: 8 }}>
                <Edit3 size={14} color={C.gold} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(r.id, r.name)} testID={`delete-route-${r.id}`} style={{ padding: 8 }}>
                <Trash2 size={14} color={C.danger} />
              </TouchableOpacity>
            </View>
          ))}

          {(tab !== 'vehicles' && tab !== 'routes') && data.map((u: any) => (
            <View key={u.id} style={styles.row}>
              {tab === 'children' ? (
                <TouchableOpacity onPress={() => changeChildPhoto(u.id)} testID={`change-photo-child-${u.id}`}>
                  {u.photo_url ? <Image source={{ uri: u.photo_url }} style={styles.av} /> : <View style={[styles.av, { backgroundColor: C.bgTertiary }]} />}
                  <View style={styles.camPip}><Camera size={10} color={C.bg} /></View>
                </TouchableOpacity>
              ) : (
                u.photo_url ? <Image source={{ uri: u.photo_url }} style={styles.av} /> : <View style={[styles.av, { backgroundColor: C.bgTertiary }]} />
              )}
              <View style={{ flex: 1, marginLeft: S.sm }}>
                <Text style={styles.name}>{u.name}</Text>
                {tab === 'children' && (
                  <Text style={styles.sub}>
                    {u.school} · {u.driver?.name || 'No driver'} · {u.vehicle?.make || 'No vehicle'}
                  </Text>
                )}
                {tab !== 'children' && (
                  <Text style={styles.sub}>
                    {u.email}{u.phone ? ` · ${u.phone}` : ''}
                    {u.role ? ` · ${u.role.toUpperCase()}` : ''}
                    {u.status ? ` · ${u.status.toUpperCase()}` : ''}
                  </Text>
                )}
              </View>

              {/* Actions */}
              {tab === 'pending' && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity onPress={() => approve(u.id)} style={styles.approveBtn} testID={`approve-${u.id}`}>
                    <Check size={14} color={C.success} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => reject(u.id)} style={styles.rejectBtn} testID={`reject-${u.id}`}>
                    <X size={14} color={C.danger} />
                  </TouchableOpacity>
                </View>
              )}

              {tab === 'children' && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity onPress={() => setEditChild(u)} style={styles.assignBtn} testID={`edit-child-${u.id}`}>
                    <Edit3 size={14} color={C.gold} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setAssignFor(u)} style={styles.assignBtn} testID={`assign-${u.id}`}>
                    <Link2 size={14} color={C.gold} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(u.id, u.name)} testID={`delete-${u.id}`} style={{ padding: 8 }}>
                    <Trash2 size={14} color={C.danger} />
                  </TouchableOpacity>
                </View>
              )}

              {tab === 'parents' && u.status === 'approved' && (
                <TouchableOpacity onPress={() => activateParent(u.id)} style={styles.activateBtn} testID={`activate-${u.id}`}>
                  <UserCheck size={12} color={C.gold} />
                  <Text style={styles.activateText}>ACTIVATE</Text>
                </TouchableOpacity>
              )}

              {(tab === 'parents' || tab === 'drivers') && (
                <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => toggleSuspend(u)} testID={`suspend-${u.id}`} style={{ padding: 8 }}>
                    {u.status === 'suspended'
                      ? <PlayCircle size={14} color={C.success} />
                      : <PauseCircle size={14} color={C.gold} />}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(u.id, u.name)} testID={`delete-${u.id}`} style={{ padding: 8 }}>
                    <Trash2 size={14} color={C.danger} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
          {data.length === 0 && <Text style={[T.bodySm, { textAlign: 'center', padding: S.lg }]}>No records.</Text>}
        </ScrollView>
      )}

      <AddChildModal visible={showAddChild || !!editChild} initial={editChild} onClose={() => { setShowAddChild(false); setEditChild(null); }} parents={parents} onCreated={load} />
      <AssignModal child={assignFor} onClose={() => setAssignFor(null)} drivers={drivers} vehicles={vehicles} onAssigned={load} />
      <VehicleModal visible={showAddVehicle || !!editVehicle} initial={editVehicle} onClose={() => { setShowAddVehicle(false); setEditVehicle(null); }} onSaved={load} />
      <RouteModal visible={showAddRoute || !!editRoute} initial={editRoute} onClose={() => { setShowAddRoute(false); setEditRoute(null); }} drivers={drivers} vehicles={vehicles} children={allChildren} onSaved={load} />
    </SafeAreaView>
  );
}

function AddChildModal({ visible, onClose, parents, onCreated }: any) {
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [pickup, setPickup] = useState('07:30');
  const [dropoff, setDropoff] = useState('15:30');
  const [home, setHome] = useState('');
  const [schoolAddr, setSchoolAddr] = useState('');
  const [parentId, setParentId] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [grade, setGrade] = useState('');
  const [roundTrip, setRoundTrip] = useState(true);
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async () => { const p = await pickPhoto(); if (p) setPhoto(p); };

  const submit = async () => {
    if (!name || !school || !parentId) return Alert.alert('Missing', 'Name, school and parent are required.');
    setBusy(true);
    try {
      await Api.adminCreateChild({
        name, photo_url: photo || undefined, parent_id: parentId,
        school, pickup_time: pickup, dropoff_time: dropoff,
        home_address: home, school_address: schoolAddr,
        birth_date: birthDate || undefined, grade: grade || undefined,
        round_trip: roundTrip,
        emergency_contact_name: emergencyName || undefined,
        emergency_contact_phone: emergencyPhone || undefined,
      });
      setName(''); setSchool(''); setHome(''); setSchoolAddr(''); setPhoto(null); setParentId('');
      setBirthDate(''); setGrade(''); setEmergencyName(''); setEmergencyPhone(''); setRoundTrip(true);
      onClose(); onCreated();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={[T.h3, { fontSize: 20 }]}>{isEdit ? 'Edit Child' : 'Add Child'}</Text>
            <TouchableOpacity onPress={onClose} testID="add-child-close"><X size={20} color={C.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: S.lg }}>
            <TouchableOpacity onPress={pick} style={styles.photoSlot} testID="add-child-photo">
              {photo ? <Image source={{ uri: photo }} style={styles.photoSlotImg} /> : <Camera size={26} color={C.gold} />}
              <Text style={styles.photoSlotText}>{photo ? 'CHANGE PHOTO' : 'ADD PHOTO (OPTIONAL)'}</Text>
            </TouchableOpacity>

            <Text style={styles.lab}>NAME</Text>
            <TextInput style={styles.inp} value={name} onChangeText={setName} placeholderTextColor={C.textMuted} testID="child-name" />
            <Text style={styles.lab}>PARENT</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              {parents.map((p: any) => (
                <TouchableOpacity key={p.id} onPress={() => setParentId(p.id)} style={[styles.chip, parentId === p.id && styles.chipActive]} testID={`pick-parent-${p.id}`}>
                  <Text style={[styles.chipText, parentId === p.id && { color: C.gold }]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.lab}>SCHOOL</Text>
            <TextInput style={styles.inp} value={school} onChangeText={setSchool} placeholderTextColor={C.textMuted} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lab}>PICKUP</Text>
                <TextInput style={styles.inp} value={pickup} onChangeText={setPickup} placeholder="07:30" placeholderTextColor={C.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lab}>DROPOFF</Text>
                <TextInput style={styles.inp} value={dropoff} onChangeText={setDropoff} placeholder="15:30" placeholderTextColor={C.textMuted} />
              </View>
            </View>
            <Text style={styles.lab}>HOME ADDRESS</Text>
            <TextInput style={styles.inp} value={home} onChangeText={setHome} placeholderTextColor={C.textMuted} />
            <Text style={styles.lab}>SCHOOL ADDRESS</Text>
            <TextInput style={styles.inp} value={schoolAddr} onChangeText={setSchoolAddr} placeholderTextColor={C.textMuted} />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lab}>BIRTH DATE</Text>
                <TextInput style={styles.inp} value={birthDate} onChangeText={setBirthDate} placeholder="2018-06-15" placeholderTextColor={C.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lab}>GRADE</Text>
                <TextInput style={styles.inp} value={grade} onChangeText={setGrade} placeholder="1st" placeholderTextColor={C.textMuted} />
              </View>
            </View>

            <Text style={styles.lab}>TRIP TYPE</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity onPress={() => setRoundTrip(true)} style={[styles.chip, roundTrip && styles.chipActive]} testID="trip-round">
                <Text style={[styles.chipText, roundTrip && { color: C.gold }]}>ROUND TRIP (IDA Y VUELTA)</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setRoundTrip(false)} style={[styles.chip, !roundTrip && styles.chipActive]} testID="trip-oneway">
                <Text style={[styles.chipText, !roundTrip && { color: C.gold }]}>ONE-WAY</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.lab}>EMERGENCY CONTACT NAME</Text>
            <TextInput style={styles.inp} value={emergencyName} onChangeText={setEmergencyName} placeholderTextColor={C.textMuted} />
            <Text style={styles.lab}>EMERGENCY CONTACT PHONE</Text>
            <TextInput style={styles.inp} value={emergencyPhone} onChangeText={setEmergencyPhone} keyboardType="phone-pad" placeholderTextColor={C.textMuted} />

            <Text style={styles.lab}>CHILD CONTACT PHONE (OPTIONAL)</Text>
            <TextInput style={styles.inp} value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" placeholderTextColor={C.textMuted} />

            <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={busy} testID="add-child-submit">
              {busy ? <ActivityIndicator color={C.bg} /> : <Text style={styles.primaryBtnText}>{isEdit ? 'SAVE CHANGES' : 'CREATE CHILD'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AssignModal({ child, onClose, drivers, vehicles, onAssigned }: any) {
  const [driverId, setDriverId] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>('');
  useEffect(() => {
    if (child) { setDriverId(child.driver_id || ''); setVehicleId(child.vehicle_id || ''); }
  }, [child]);
  if (!child) return null;
  const save = async () => {
    try {
      await Api.adminAssignChild(child.id, { driver_id: driverId || undefined, vehicle_id: vehicleId || undefined });
      onClose(); onAssigned();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  return (
    <Modal visible={!!child} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={[T.h3, { fontSize: 20 }]}>Assign · {child.name}</Text>
            <TouchableOpacity onPress={onClose}><X size={20} color={C.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: S.lg }}>
            <Text style={styles.lab}>DRIVER</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              {drivers.map((d: any) => (
                <TouchableOpacity key={d.id} onPress={() => setDriverId(d.id)} style={[styles.chip, driverId === d.id && styles.chipActive]} testID={`pick-driver-${d.id}`}>
                  <Text style={[styles.chipText, driverId === d.id && { color: C.gold }]}>{d.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.lab}>VEHICLE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              {vehicles.map((v: any) => (
                <TouchableOpacity key={v.id} onPress={() => setVehicleId(v.id)} style={[styles.chip, vehicleId === v.id && styles.chipActive]} testID={`pick-vehicle-${v.id}`}>
                  <Text style={[styles.chipText, vehicleId === v.id && { color: C.gold }]}>{v.make} {v.model}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.primaryBtn} onPress={save} testID="assign-save">
              <Text style={styles.primaryBtnText}>SAVE ASSIGNMENT</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function VehicleModal({ visible, initial, onClose, onSaved }: any) {
  const isEdit = !!initial;
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [color, setColor] = useState('');
  const [year, setYear] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [reg, setReg] = useState('');
  const [ins, setIns] = useState('');
  const [insp, setInsp] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) {
      setMake(initial.make || ''); setModel(initial.model || ''); setPlate(initial.plate || '');
      setColor(initial.color || ''); setYear(initial.year ? String(initial.year) : '');
      setPhoto(initial.photo_url || null);
      setReg(initial.registration_expiry || ''); setIns(initial.insurance_expiry || '');
      setInsp(initial.inspection_expiry || '');
    } else if (visible) {
      setMake(''); setModel(''); setPlate(''); setColor(''); setYear(''); setPhoto(null);
      setReg(''); setIns(''); setInsp('');
    }
  }, [initial, visible]);

  const pick = async () => { const p = await pickPhoto(); if (p) setPhoto(p); };

  const submit = async () => {
    if (!make || !model || !plate) return Alert.alert('Missing', 'Make, model and plate are required.');
    setBusy(true);
    try {
      const payload = {
        make, model, plate, color: color || '—',
        year: year ? parseInt(year) : undefined,
        photo_url: photo || undefined,
        registration_expiry: reg || undefined,
        insurance_expiry: ins || undefined,
        inspection_expiry: insp || undefined,
      };
      if (isEdit) await Api.adminUpdateVehicle(initial.id, payload);
      else await Api.adminCreateVehicle(payload);
      onClose(); onSaved();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={[T.h3, { fontSize: 20 }]}>{isEdit ? 'Edit Vehicle' : 'Add Vehicle'}</Text>
            <TouchableOpacity onPress={onClose}><X size={20} color={C.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: S.lg }}>
            <TouchableOpacity onPress={pick} style={styles.photoSlot} testID="vehicle-photo">
              {photo ? <Image source={{ uri: photo }} style={styles.photoSlotImg} /> : <Car size={26} color={C.gold} />}
              <Text style={styles.photoSlotText}>{photo ? 'CHANGE PHOTO' : 'ADD VEHICLE PHOTO'}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lab}>YEAR</Text>
                <TextInput style={styles.inp} value={year} onChangeText={setYear} keyboardType="numeric" placeholder="2024" placeholderTextColor={C.textMuted} testID="vehicle-year" />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={styles.lab}>MAKE</Text>
                <TextInput style={styles.inp} value={make} onChangeText={setMake} placeholder="Mercedes-Benz" placeholderTextColor={C.textMuted} testID="vehicle-make" />
              </View>
            </View>
            <Text style={styles.lab}>MODEL</Text>
            <TextInput style={styles.inp} value={model} onChangeText={setModel} placeholder="S-Class" placeholderTextColor={C.textMuted} testID="vehicle-model" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lab}>PLATE</Text>
                <TextInput style={styles.inp} value={plate} onChangeText={setPlate} autoCapitalize="characters" placeholderTextColor={C.textMuted} testID="vehicle-plate" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lab}>COLOR</Text>
                <TextInput style={styles.inp} value={color} onChangeText={setColor} placeholderTextColor={C.textMuted} />
              </View>
            </View>
            <Text style={styles.lab}>REGISTRATION EXPIRY (YYYY-MM-DD)</Text>
            <TextInput style={styles.inp} value={reg} onChangeText={setReg} placeholder="2026-12-31" placeholderTextColor={C.textMuted} />
            <Text style={styles.lab}>INSURANCE EXPIRY</Text>
            <TextInput style={styles.inp} value={ins} onChangeText={setIns} placeholder="2026-12-31" placeholderTextColor={C.textMuted} />
            <Text style={styles.lab}>INSPECTION EXPIRY</Text>
            <TextInput style={styles.inp} value={insp} onChangeText={setInsp} placeholder="2026-12-31" placeholderTextColor={C.textMuted} />
            <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={busy} testID="vehicle-submit">
              {busy ? <ActivityIndicator color={C.bg} /> : <Text style={styles.primaryBtnText}>{isEdit ? 'SAVE VEHICLE' : 'CREATE VEHICLE'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RouteModal({ visible, initial, onClose, drivers, vehicles, children: kids, onSaved }: any) {
  const isEdit = !!initial;
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [childIds, setChildIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) {
      setName(initial.name || ''); setSchool(initial.school || '');
      setDriverId(initial.driver_id || ''); setVehicleId(initial.vehicle_id || '');
      setChildIds(initial.child_ids || []); setNotes(initial.notes || '');
    } else if (visible) {
      setName(''); setSchool(''); setDriverId(''); setVehicleId(''); setChildIds([]); setNotes('');
    }
  }, [initial, visible]);

  const toggleChild = (cid: string) => {
    setChildIds((prev) => prev.includes(cid) ? prev.filter((c) => c !== cid) : [...prev, cid]);
  };

  const submit = async () => {
    if (!name) return Alert.alert('Missing', 'Route name is required.');
    setBusy(true);
    try {
      const payload = {
        name, school, driver_id: driverId || undefined, vehicle_id: vehicleId || undefined,
        child_ids: childIds, notes,
      };
      if (isEdit) await Api.adminUpdateRoute(initial.id, payload);
      else await Api.adminCreateRoute(payload);
      onClose(); onSaved();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={[T.h3, { fontSize: 20 }]}>{isEdit ? 'Edit Route' : 'Add Route'}</Text>
            <TouchableOpacity onPress={onClose}><X size={20} color={C.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: S.lg }}>
            <Text style={styles.lab}>ROUTE NAME / NUMBER</Text>
            <TextInput style={styles.inp} value={name} onChangeText={setName} placeholder="Route #1 — Hollywood AM" placeholderTextColor={C.textMuted} testID="route-name" />
            <Text style={styles.lab}>SCHOOL</Text>
            <TextInput style={styles.inp} value={school} onChangeText={setSchool} placeholder="Pine Crest School" placeholderTextColor={C.textMuted} />
            <Text style={styles.lab}>DRIVER</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              {drivers.map((d: any) => (
                <TouchableOpacity key={d.id} onPress={() => setDriverId(d.id)} style={[styles.chip, driverId === d.id && styles.chipActive]}>
                  <Text style={[styles.chipText, driverId === d.id && { color: C.gold }]}>{d.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.lab}>VEHICLE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              {vehicles.map((v: any) => (
                <TouchableOpacity key={v.id} onPress={() => setVehicleId(v.id)} style={[styles.chip, vehicleId === v.id && styles.chipActive]}>
                  <Text style={[styles.chipText, vehicleId === v.id && { color: C.gold }]}>{v.make} {v.model}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.lab}>CHILDREN ON ROUTE (TAP TO TOGGLE)</Text>
            {kids.map((c: any) => (
              <TouchableOpacity key={c.id} onPress={() => toggleChild(c.id)} style={[styles.kidPick, childIds.includes(c.id) && styles.kidPickActive]} testID={`route-pick-${c.id}`}>
                <Text style={[styles.chipText, childIds.includes(c.id) && { color: C.gold }]}>
                  {childIds.includes(c.id) ? '✓ ' : ''}{c.name} · {c.school}
                </Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.lab}>NOTES</Text>
            <TextInput style={[styles.inp, { height: 60 }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={C.textMuted} />
            <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={busy} testID="route-submit">
              {busy ? <ActivityIndicator color={C.bg} /> : <Text style={styles.primaryBtnText}>{isEdit ? 'SAVE ROUTE' : 'CREATE ROUTE'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.gold, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.5 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.borderLight },
  tabActive: { borderColor: C.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  tabText: { color: C.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 1 },
  tabTextActive: { color: C.gold },
  row: { flexDirection: 'row', alignItems: 'center', padding: S.sm, backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  av: { width: 44, height: 44, borderRadius: 22 },
  camPip: { position: 'absolute', bottom: -2, right: -2, backgroundColor: C.gold, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.bgSecondary },
  name: { ...T.body, fontSize: 14, fontFamily: Fonts.bodyMedium },
  sub: { ...T.bodySm, fontSize: 11 },
  approveBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.success },
  rejectBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.danger },
  assignBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.gold },
  activateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.gold },
  activateText: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 0.8 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: S.md, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: S.sm, borderBottomColor: C.border, borderBottomWidth: 1, marginBottom: S.sm },
  lab: { ...T.caption, color: C.textSecondary, marginTop: S.sm, marginBottom: 6 },
  inp: { backgroundColor: C.bg, borderRadius: 10, padding: 12, color: C.text, fontFamily: Fonts.body, fontSize: 14, borderWidth: 1, borderColor: C.border },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.borderLight },
  chipActive: { borderColor: C.gold, backgroundColor: 'rgba(212,175,55,0.15)' },
  chipText: { color: C.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 12 },
  primaryBtn: { backgroundColor: C.gold, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: S.md },
  primaryBtnText: { color: C.bg, fontFamily: Fonts.bodySemiBold, letterSpacing: 2 },
  photoSlot: { alignItems: 'center', justifyContent: 'center', padding: S.md, borderRadius: 14, borderWidth: 1, borderColor: C.borderLight, borderStyle: 'dashed', marginBottom: S.sm, gap: 6 },
  photoSlotImg: { width: 80, height: 80, borderRadius: 40 },
  photoSlotText: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 1 },
});
