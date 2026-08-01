# VIP Kids Transportation

A private, prearranged child-transportation app built with Expo Router and
Supabase. Each child is connected by an administrator to one approved parent,
dedicated driver, vehicle, and ordered morning/afternoon route. This is not an
on-demand ride marketplace: families do not choose cars, drivers, or ride times.

Parents and restricted child accounts can follow only their assigned vehicle and
route status. Drivers complete seat-belt, fuel, and charged/mounted-phone checks,
open the assigned stops in Google Maps, share location only during an active
route, swipe right for pickup or left for no-show, and complete the end-of-route
child/vehicle check. Administrators approve accounts, assign records, monitor all
active drivers with distinct route colors/SUV cutouts, manage route/vehicle data,
and review compliance expirations. Payments, child profile photos, and driver
ratings are intentionally excluded.

## Architecture

- `frontend/`: Expo SDK 54 / React Native app. Native Android/iOS maps use Google
  Maps/Apple Maps; the browser preview retains a Leaflet fallback.
- `supabase/`: production Postgres/RLS migrations and Edge Functions for the app
  API, Google route geometry, Expo push delivery/receipts, and retention cleanup.
- `backend/`: temporary FastAPI/MongoDB compatibility service during migration;
  do not maintain production child data in both databases.
- `public/`: privacy, terms, support, and account-deletion pages prepared for
  GitHub Pages.
- `release/`: App Store/Play metadata and the release gate.

Supabase Auth accepts parent/driver access requests as `pending`. An administrator
must approve them. An approved parent may create a child transportation record
and restricted child login after explicitly confirming guardian authorization;
the administrator still assigns and activates the dedicated route resources.
Preview builds expose four synthetic one-tap demo roles and a 10-driver/10-parent/
12-child fleet. Production builds explicitly disable that demo bypass.

## Local preview

```bash
cd frontend
corepack yarn install
corepack yarn start --host lan
```

Background route location and native maps require a signed development/preview
build, not Expo Go. Copy `frontend/environment.example` to an untracked `.env`
for local values. Never commit the Supabase service-role key, Expo access token,
Google routing key, or Android Maps key.

## Production setup

1. Create/link Supabase and apply both migrations under `supabase/migrations/`.
2. Deploy the four Edge Functions and configure the secrets in
   [`supabase/README.md`](supabase/README.md).
3. Set the EAS production variables for Supabase plus the restricted Android Maps
   build key. Configure FCM/APNs credentials in EAS.
4. Complete [`docs/OPERATIONS_SETUP.md`](docs/OPERATIONS_SETUP.md),
   [`docs/testing.md`](docs/testing.md), and [`release/RELEASE_GATE.md`](release/RELEASE_GATE.md).

## Checks

```bash
cd frontend && corepack yarn typecheck && corepack yarn lint && corepack yarn test && npx expo-doctor@latest
cd ../backend && .venv/bin/pytest -q
cd .. && npx --yes deno check supabase/functions/*/index.ts
```

The destructive compatibility API tests require an explicitly isolated backend;
see [`docs/testing.md`](docs/testing.md). Do not use real children, addresses, or
routes in screenshots, demo accounts, issues, or test data.
