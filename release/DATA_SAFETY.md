# Google Play Data Safety Working Sheet

Complete the Play Console form against the final production network audit and contracts. The current code indicates the following declarations.

## Security and account controls

- Data encrypted in transit: **Yes only after Supabase, legal pages, native map SDK,
  routing, and Expo push are configured in the final signed production build.**
- Users can request deletion: **Yes** — in-app from Parent, Driver, and Child Profile and from the public `/delete-account` page. Child deletion removes only the restricted sign-in, not the parent-controlled transportation record.
- Independent security review: **No**, unless a qualifying external audit is completed.
- Ads: **No**.

## Data collected and linked to users

| Play category | Examples in this app | Primary purpose |
|---|---|---|
| Name | Parent, driver, and child names | App functionality; account management; safety |
| Email address | Parent, driver, and optional child sign-in | Account management; security |
| Phone number | Adult and emergency contact numbers | App functionality; safety |
| Address | Home pickup and school addresses | Route operation |
| User IDs | Internal account, child, driver, and route IDs | App functionality; security |
| Precise location | Active driver-device route coordinates (not the child device) | Live tracking; route safety; navigation |
| Photos | Optional adult profile and vehicle photos | Identification; app functionality |
| Other user content | Parent/driver messages and schedule notes | Communication; app functionality |
| Other personal information | Child schedule, grade if provided, attendance, emergency contact, driver/vehicle compliance | Transportation operation; safety |

## Sharing and service providers

The final form must reflect the production contracts. Hosting, database, notification, mapping, geocoding, and routing vendors may process information as service providers. If a vendor’s use does not qualify for Google’s service-provider exception, declare the relevant category as shared. Precise route coordinates and map viewport information require particular verification.

## Restricted permission declarations

- `ACCESS_BACKGROUND_LOCATION`: required for active driver routes while Google Maps or another app is foregrounded.
- `FOREGROUND_SERVICE_LOCATION`: required to keep active route tracking visible and interruptible on Android.
- Prominent disclosure: implemented immediately before driver system location permission requests; parent and child flows never request device location.
- Demonstration videos: still must be recorded from the production Android build.
