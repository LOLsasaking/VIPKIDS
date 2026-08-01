# VIP Kids production operations setup

Do not put real child data in demo builds, CSV files committed to Git, support
email, screenshots, or issue trackers. Use the production Admin screens only
after Supabase is deployed and the access-control test matrix passes.

## One-time launch setup

1. Verify the business, insurance, driver-screening, child-transportation, and
   record-retention requirements with qualified Florida counsel and the insurer.
2. Create the Supabase production organization/project, enable backups and MFA,
   and limit dashboard access to named administrators.
3. Create the first administrator directly in Supabase Auth. Set its `profiles`
   role/status to `admin`/`active`; use a unique password and MFA. Never reuse a
   reviewer or demo password.
4. Add each driver, then verify identity, screening, license, permit, insurance,
   registration, inspection, phone, and vehicle before activation.
5. Approve each parent request after the service consultation and identity/
   contract checks. The parent may create a restricted child login only after
   explicitly confirming parent/guardian authorization.
6. In Admin, add/verify each child and emergency contact, then assign exactly one
   dedicated driver, vehicle, and ordered morning/afternoon route.
7. Run the route with synthetic records first. Confirm both assigned family
   accounts can see only their vehicle and the administrator can see the fleet.

## Daily dispatch workflow

- Before departure: verify the driver is active and compliant, device is charged,
  notifications work, and the route/addresses match the dispatch sheet.
- Driver: confirm seat belts, fuel level, and phone charged/mounted; then start
  the route. Background location begins only after the operating-system prompt.
- Pickup: swipe right only after custody transfer; swipe left for absent/no-show.
  Use the status dropdown for approach, school arrival/departure, delay, approved
  alternate drop-off, and home arrival.
- Operations: monitor stale GPS, no-show, delay, SOS, missing assignment, and
  expiring compliance records. Confirm sensitive changes by phone when needed.
- Route end: account for every child, inspect the empty vehicle, end the route,
  and verify the location indicator/foreground notification disappears.

## Incident and emergency workflow

1. Call 911 first for immediate danger or a medical emergency.
2. Driver sends the in-app SOS only when safe; operations calls the driver and
   follows the signed incident plan.
3. Preserve required incident records without copying GPS, child names, or
   messages into ordinary email or chat.
4. Resolve the event, notify authorized guardians under the operating policy,
   and document required follow-up in the protected system.

## Weekly/monthly controls

- Review pending/suspended accounts and remove access no longer needed.
- Review driver and vehicle expirations at 30, 14, and 7 days.
- Test one pickup and one absence push on real Android and iPhone devices.
- Review failed notification receipts, stale routes, SOS events, and audit logs.
- Confirm backups completed; perform a documented restore drill quarterly.
- Review Supabase, Expo/EAS, Google Cloud, Apple, and GitHub administrator access.

## Real-data entry worksheet

Prepare these fields offline and enter them through Admin—never commit completed
copies:

- Parent: full name, email, phone, service status.
- Driver: full name, email, phone, license number/expiry, permit expiry, photo.
- Vehicle: driver, make, model, year, color, plate, seats, registration date and
  expiry, insurance expiry, inspection expiry, approved cutout image.
- Child: parent, full name, school, home/school addresses, pickup/drop-off times,
  emergency contact, grade/birth date only when operationally required.
- Route: morning/afternoon, driver, vehicle, ordered child stops, line color.
