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

- [ ] Provision the Supabase production project, apply both migrations in order,
  deploy the Edge Functions, and keep MongoDB only as a temporary compatibility
  service during the verified cutover.
- [ ] Configure server-side Google Routes and a package/SHA-1-restricted Android
  Maps SDK key. Route/home/school coordinates must not use public routing servers.
- [ ] Replace all preview `http://` build variables with production `https://`
  variables in EAS Secrets.
- [ ] Create a unique 12+ character production administrator password, enroll the
  in-app authenticator MFA, and verify all admin API calls require `aal2`.
- [ ] Confirm the live-location retention period with counsel/insurance, then
  configure scheduled cleanup to enforce it.
- [ ] Set up FCM/APNs and Expo enhanced push security in Expo/EAS, then send
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
- [ ] Add a child-policy-compatible production crash monitor that redacts names, addresses,
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
- [ ] Enable Supabase Auth rate limits/CAPTCHA, verify audit events and the strict
  authorization matrix, and complete a database backup/restoration drill.
- [ ] Verify every parent and child can only see their own assigned driver and
  live location, and every driver can only update their own active route.
