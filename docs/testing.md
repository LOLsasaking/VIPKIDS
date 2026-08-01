# Testing strategy

## Automated local checks

```bash
cd frontend
npm run typecheck
npm run lint
npm test
npx expo-doctor@latest

cd ../backend
.venv/bin/pytest -q

cd ..
npx --yes deno check supabase/functions/api/index.ts \
  supabase/functions/process-notifications/index.ts \
  supabase/functions/purge-expired-data/index.ts \
  supabase/functions/routing/index.ts
```

The backend API integration suite is intentionally disabled by default because
it creates and deletes records. Run it only against an isolated test service:

```bash
RUN_BACKEND_INTEGRATION=1 EXPO_PUBLIC_BACKEND_URL=https://isolated-test.example \
  backend/.venv/bin/pytest -q backend/tests/test_vipkids_api.py \
  backend/tests/test_phase2_features.py
```

## Supabase authorization matrix

Run these tests after every migration in a staging project:

- unauthenticated requests cannot read any child, route, location, message,
  notification, driver, vehicle, or compliance record;
- parent A cannot read parent B, child B, messages B, or driver routes unrelated
  to parent A;
- a child sees only their own assigned driver/vehicle, fresh vehicle position,
  allowed status history, and emergency contact—never addresses or other stops;
- a driver can update only an active route assigned to that driver and cannot
  access another driver's children or location;
- only active administrators can approve/suspend accounts, assign records,
  manage compliance, or view the full fleet;
- public registration always creates a pending parent/driver profile;
- invalid/oversized payloads and arbitrary notification navigation values fail.

## Required real-device release run

Use synthetic people and addresses in staging. Test at least one current iPhone
and two Android models (one Google/Samsung and one aggressive battery-saver OEM).

1. Install a signed release candidate—not Expo Go.
2. Verify parent, child, driver, and admin sign-in/approval/assignment.
3. Driver starts after all three checks, denies permissions once, then grants
   foreground/background location and notification permission.
4. Run 20+ minutes with VIP Kids foregrounded, backgrounded, phone locked, and
   Google Maps foregrounded. Confirm approximately five-second updates without
   fabricated jumps and stop immediately at route end.
5. Verify right swipe/pickup, left swipe/no-show, dropdown statuses, weak/offline
   check-in queue, duplicate-tap protection, and end-of-route confirmations.
6. Verify private push banners while locked/using another app, tap navigation,
   preference opt-outs, sign-out token removal, reinstall/token rotation, and a
   disabled token after an Expo `DeviceNotRegistered` receipt.
7. Verify Google Maps/Apple Maps route line, all ten distinct SUV cutouts, smooth
   marker updates, multiple colored admin routes, stale-location hiding, and no
   cross-family route exposure.
8. Delete parent, child-login, and driver staging accounts and confirm the public
   deletion path, unassignment, cleanup, and any legally retained records.
9. Record Google background-location/foreground-service videos and capture final
   store screenshots only after every check passes.
