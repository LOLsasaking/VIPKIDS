# VIP Kids Transportation — Production launch checklist

This checklist separates completed app capabilities from the owner-controlled
steps required before public release. Do not collect real child or route data in
the demo environment.

## Codebase capabilities already present

- role-specific parent, driver, child, and administrator experiences;
- driver pre-check, active-route GPS updates, pickup/absence events, and route
  end controls;
- parent/child tracking, private driver and vehicle information, and route data;
- device push-token registration plus server-side notification fan-out;
- account approval, suspension, child-login consent, account deletion, and
  vehicle/driver compliance tracking;
- data-minimizing child views and a privacy notice.

## Required before production data

- [ ] Provision the production database. The shipping backend uses **MongoDB**
  (`MONGO_URL`) — MongoDB Atlas is the zero-code-change option. A Postgres/Supabase
  alternative is designed but NOT active; see
  `docs/future-supabase-migration/` (adopting it means rewriting `backend/server.py`).
- [ ] Configure a production HTTPS API and HTTPS routing provider. Route/home/
  school addresses must never be sent to an unapproved public routing service.
- [ ] Replace all preview `http://` build variables with production `https://`
  variables in EAS Secrets.
- [ ] Rotate the current administrator password and JWT secret. Use a password
  manager-generated password and a 32+ character random JWT secret.
- [ ] Confirm the live-location retention period with counsel/insurance, then
  configure scheduled cleanup to enforce it.
- [ ] Set up FCM for Android and APNs credentials for iOS in Expo/EAS, then send
  real-device tests for pickup, absence, arrival, emergency, and announcements.
- [ ] Run an active route on real devices with the app foregrounded, backgrounded,
  device locked, navigation open, weak signal, and location/notification
  permissions denied. Verify tracking stops immediately when the route ends.
- [ ] Give a qualified attorney the privacy notice, Terms of Service, child-data
  consent workflow, retention policy, insurance requirements, and emergency
  workflow for review. COPPA may apply because the service handles child data.
- [ ] Publish a public HTTPS Privacy Policy and support contact. Complete Apple
  App Privacy and Google Play Data Safety declarations from the final production
  data flows—not from demo assumptions.
- [ ] Add production crash/error monitoring that redacts names, addresses,
  messages, tokens, and GPS coordinates.
- [ ] Set up admin operating procedures: account verification, driver background
  screening, document expiry review, incident escalation, and emergency contact
  verification.

## Store submission package

- [ ] Apple Developer Program membership and App Store Connect record.
- [ ] Google Play Console developer account and app record.
- [ ] Final app icon, splash screen, screenshots, descriptions, support URL,
  privacy-policy URL, age rating/content questionnaire, and contact email.
- [ ] iOS production build and Android AAB production build signed by EAS.
- [ ] TestFlight and Play internal testing feedback resolved before public launch.

## Security baseline

- [ ] TLS-only API and routing URLs; no cleartext production traffic.
- [ ] Token storage restricted to Keychain/Android Keystore (already used by the
  native app); no credentials or service keys in source control.
- [ ] Server-side rate limiting, audit events, strict authorization tests, and
  database backups/restoration drill.
- [ ] Verify every parent and child can only see their own assigned driver and
  live location, and every driver can only update their own active route.
