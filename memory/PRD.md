# VIP KIDS TRANSPORTATION — PRD

## Vision
Premium dark-luxury mobile app for VIP KIDS, a private school chauffeur service (Hollywood, FL, est. 2012). Goal: justify premium pricing, build trust through transparency, and scale 19 → 100+ families.

## Stack
- Backend: FastAPI + MongoDB + JWT auth (bcrypt) — three roles: parent/driver/admin
- Frontend: Expo Router (React Native) with role-based tabs
- Maps: Leaflet + OpenStreetMap via WebView (no API key needed; ready to swap to Google Maps)
- Fonts: Playfair Display (display) + Outfit (body)
- Theme: dark `#09090B` + champagne gold `#D4AF37`

## Phase 1 MVP — Delivered
- JWT auth (register/login/me) with role-aware redirects
- Parent: dashboard (child+driver+vehicle+today's events), live tracking map with 4s polling, chat, schedule requests (after-school/medical/temporary), notification preferences (mute-all + per-event toggles)
- Driver: today's route ordered by pickup time, GPS broadcast (start/stop) using `expo-location` (with web fallback), check-in/out triggers (on_the_way, picked_up, arrived_school, leaving_school, arriving_home), traffic delay alerts
- Admin: live fleet map, fleet stats, manage children/parents/drivers (delete), broadcast announcements (general/weather/school_closing/emergency) that auto-fan-out as notifications to all parents
- Chat: bidirectional parent ↔ driver with 3s polling
- Seed: 1 admin, 2 drivers, 2 parents, 3 children, 2 vehicles

## Future Roadmap
- Push notifications (Expo Push) — backend already records notification events
- Google Maps swap (one component change in `/app/frontend/src/components/LeafletMap.tsx`)
- Driver performance reports, parent reviews, attendance scoring, incident reporting (Phase 2)
- Route optimization with directions API

## Business Lever
Live tracking + premium dark UI + audit log of every event creates verifiable trust — the differentiator competitors lack — enabling VIP KIDS to raise prices and reach 40+ families.
