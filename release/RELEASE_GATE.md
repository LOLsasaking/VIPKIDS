# Release Gate

## Implemented locally

- [x] Stable iOS bundle identifier and Android application ID
- [x] Production EAS build profiles
- [x] 1024×1024 app icon and Android adaptive icon configuration
- [x] Unused camera, microphone, and legacy storage permissions blocked
- [x] iPad distribution disabled for the phone-first launch
- [x] Specific foreground/background location purpose strings
- [x] Prominent background-location disclosure before permission requests
- [x] Server-verified pre-route checklist values
- [x] Background tracking stops locally before route-end confirmation
- [x] Self-service account deletion for active, pending, and suspended parent/driver/child login accounts
- [x] Restricted child role tied to one administrator-created child record, with no self-registration
- [x] Administrator must record parent/guardian authorization before enabling a child login
- [x] Child view excludes guardian IDs, family addresses, other stops, other children, chat, and admin controls
- [x] Cascading deletion/unassignment of associated personal data
- [x] Public web routes for privacy information and account deletion
- [x] Apple privacy manifest declarations added to Expo configuration
- [x] API timeouts and production HTTPS enforcement
- [x] Stale/unverified vehicle locations are not displayed as live
- [x] Public OSRM routing fallback removed; approved routing endpoint is configurable
- [x] GPS route retention and TTL indexes configured
- [x] Production configuration validation and database-aware readiness endpoint
- [x] Accurate draft store listing, review notes, and Data Safety worksheet

## External blocking requirements

- [ ] Deploy the backend to a monitored HTTPS production service.
- [ ] Configure a TLS managed MongoDB deployment with backups and network restrictions.
- [ ] Set production EAS variables: backend URL, approved routing URL, and privacy contact.
- [ ] Host the Expo web export so `/privacy` and `/delete-account` have permanent public HTTPS URLs.
- [ ] Replace remote public OpenStreetMap/Leaflet delivery with a contracted or self-hosted production map stack.
- [ ] Implement and verify real APNs/FCM push delivery for pickup, absence, emergency, delay, and arrival events.
- [ ] Rotate the disclosed administrator password to a unique 12+ character secret and add administrative MFA before launch.
- [ ] Create restricted synthetic reviewer accounts for parent, child, driver, and administrator roles.
- [ ] Complete a physical-device route test with the app backgrounded and Google Maps foregrounded.
- [ ] Record Google background-location and foreground-service declaration videos.
- [ ] Capture real production screenshots and create the Google feature graphic.
- [ ] Review the privacy policy, retention schedule, parental authority, and child transportation obligations with qualified counsel.
- [ ] Set and document the intended age audience in both stores; complete any applicable COPPA, Google Families, and Apple child-safety/privacy requirements before enabling child accounts in production.
- [ ] Enroll and verify Apple Developer and Google Play organization accounts.
- [ ] Build with Xcode 26+/iOS 26 SDK, upload to TestFlight, and complete Apple review metadata.
- [ ] Build and sign the Android App Bundle, complete Play declarations, and satisfy any required closed test.

Do not submit to either store until every external blocker above is complete.
