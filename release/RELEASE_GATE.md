# Release gate

## Code-complete in this repository

- [x] Supabase Auth/Postgres schema, row-level read controls, Edge API, protected
  service-role writes, audit events, data expiry, and private compliance storage.
- [x] Parent/driver approval, parent-confirmed child login, admin assignment,
  suspension/reactivation, and full account deletion/unassignment workflows.
- [x] Native Google Maps/Apple Maps for mobile, server-side Google Routes road
  geometry, approximately five-second route updates, smooth SUV movement, distinct
  fleet cutouts/colors, stale-location hiding, and no public routing fallback.
- [x] Expo push outbox, enhanced-security access token, notification preferences,
  private lock-screen text, ticket/receipt processing, token rotation/removal, and
  role-safe tap navigation.
- [x] Driver three-item precheck, duplicate route prevention, attendance/no-show,
  offline queue, SOS, and mandatory end-of-route confirmations.
- [x] Production HTTPS/host/request-size hardening for the temporary FastAPI API.
- [x] Privacy, draft terms, support, and account-deletion pages plus a GitHub
  Pages workflow template; in-app terms/consent/deletion paths.
- [x] Expo SDK 54 / Android API 36 configuration, stable identifiers, privacy
  manifest, restricted permissions, EAS preview/production profiles, automated
  tests, Expo Doctor validation, and operating/testing documentation.

## Owner/account work required before production data

- [ ] Sign into Supabase CLI, link a new production project, apply both migrations,
  deploy four functions, configure Vault/Cron, MFA, backups, and restore testing.
- [ ] Add Supabase URL/anon key to EAS production; add restricted Google Routes,
  Android Maps SDK, Expo enhanced-push, cron, FCM, and APNs credentials.
- [ ] Create the first unique-password/MFA administrator and synthetic reviewer
  parent/child/driver/admin accounts—never use real children for review.
- [ ] Put the final legal pages on `main`, enable GitHub Pages, and verify the
  privacy/support/deletion URLs and monitored `gonxander@gmail.com` mailbox.
- [ ] Have qualified counsel/insurer approve terms, privacy, guardian consent,
  record retention, driver/vehicle compliance, emergency and transportation rules.
- [ ] Decide Apple/Google audience classification. A restricted child login exists,
  and Apple restricts “Kids” metadata outside the Kids Category; do not guess on
  this store/legal decision.
- [ ] Complete Apple App Privacy, Google Data Safety/Families, IARC/age rating,
  background-location and foreground-service declarations from the final build.
- [ ] Execute every physical-device case in `docs/testing.md`, including locked
  screen, Google Maps foreground, weak signal, battery saving, denial/revocation,
  token rotation, route end, and cross-account authorization.
- [ ] Resolve findings, record Google permission videos, capture synthetic final
  screenshots/feature graphic, then pass TestFlight and Play internal testing.
- [ ] Build/sign the production iOS archive and Android AAB and submit only after
  every item above has evidence and an accountable owner.

Do not call the app “ready to publish” or enter real child data until every
unchecked item is complete.
