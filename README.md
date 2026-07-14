# VIPKIDS Transportation

A private school transportation app built with Expo Router and FastAPI. Each child has an assigned route, dedicated driver, and dedicated vehicle. Parents can follow the vehicle and its recorded GPS path live, verify the driver and vehicle, message the driver, review schedule details, and contact their VIP concierge.

Drivers choose Morning Pickups or Afternoon Return, complete a three-item pre-route safety checklist, and then Start Route launches their ordered stops in Google Maps driving navigation. Each assigned child has a two-way attendance control: swipe right for a green pickup confirmation or left for a red absence alert. Attendance updates can queue offline and synchronize automatically. Drivers also have an administrator SOS with location sharing, emergency-contact access, and a required end-of-route vehicle-empty check.

Parents receive a live in-app safety update feed for route starts, approaching vehicles, pickups, arrivals, delays, absences, and completed routes. Parent tracking shows the driver’s verified, recent GPS path without exposing other families’ planned addresses. Administrators review parent and driver access requests, create children, connect each child to an approved parent and driver, manage vehicles and routes, review the operations timeline, and track driver-license, registration, insurance, and inspection compliance. Child profile photos, driver star ratings, and payment management are intentionally not part of this app.

## Account flow

Parents and drivers select **Request access** on the sign-in screen and choose their own email and password. New accounts remain pending until an administrator approves them. Approved parents stay locked until the administrator adds their child and assigns a driver and vehicle; the administrator then activates parent access.

There is no fictional/demo account mode and the backend no longer seeds fictional families, drivers, children, vehicles, or routes. The administrator account is controlled only by the backend environment variables `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Run the app

```bash
cd frontend
corepack yarn install
corepack yarn start --host lan
```

The frontend requires `EXPO_PUBLIC_BACKEND_URL`. The backend requires MongoDB plus `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ALLOWED_ORIGINS`, then runs with:

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8000
```

Background route tracking requires a development or release build; Expo Go does not run background location tasks reliably. Road geometry now requires an approved `EXPO_PUBLIC_ROUTING_BASE_URL`; without it the app sends no family coordinates to a public routing fallback. Before public launch, replace the remaining public OpenStreetMap/Leaflet delivery with a contracted provider or self-hosted services, and configure real push-notification credentials.

## Release preparation

Production builds use [`frontend/eas.json`](frontend/eas.json). Configure the EAS production environment from `frontend/environment.example`; never commit production secrets or private service URLs. The backend rejects production startup when the JWT secret or administrator password is weak or when browser origins are not HTTPS. Its deployment variables are documented in `backend/environment.example`.

Public privacy and account-deletion pages are exported at `/privacy` and `/delete-account`. They must be hosted on a permanent HTTPS domain before store submission. See [`release/RELEASE_GATE.md`](release/RELEASE_GATE.md) for the remaining infrastructure, push-notification, legal, review-account, media, and physical-device requirements.

## Development checks

```bash
cd frontend
corepack yarn lint
corepack yarn typecheck
corepack yarn export:web
```

Also run `backend/.venv/bin/python -m py_compile backend/server.py` before deploying the backend.
