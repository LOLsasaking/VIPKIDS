# App Review Notes

VIP Kids Transportation is a login-gated companion for a real-world private school transportation service. It does not sell digital goods. Children cannot create accounts; after recording parent or guardian authorization, an administrator may create a restricted login tied to one existing child transportation record.

## Reviewer credentials

Before submission, create permanent synthetic accounts in the production review environment:

- Parent: `<review-parent-email>` / `<review-password>`
- Child: `<review-child-email>` / `<review-password>`
- Driver: `<review-driver-email>` / `<review-password>`
- Administrator: `<review-admin-email>` / `<review-password>`

The parent and child reviewer accounts must point to one synthetic child assigned to the review driver and review vehicle. Do not use the owner’s real administrator credentials or real child information.

## Important workflows

1. Sign in as the driver.
2. On Route, select Morning Pickups or Afternoon Return.
3. Confirm Seat belts, Fuel level, and Phone charged and mounted.
4. Tap Start Route. The app presents a prominent background-location disclosure before requesting system permission.
5. Accept the disclosure and location permissions. Precise location is used only during an active route so the assigned parent and authorized operations staff can follow the vehicle while navigation is open.
6. Google Maps opens with the administrator-assigned stops. Return to VIP Kids to swipe right for Picked up or left for Absent.
7. Assign final statuses, perform the vehicle-empty check, and end the route. Background tracking stops locally before the server confirms route closure.
8. Sign in as the parent and open Map to view the assigned route, verified driver location, and vehicle.
9. Sign in as the child to see only that child’s assigned ride, status, driver/vehicle, emergency contact, and fresh location. Confirm that addresses, other route stops, chat, other children, and admin tools are absent.
10. Account deletion is available from Parent, Driver, and Child Profile. The public `/delete-account` page also supports pending and suspended accounts.

## Permission justification

- Foreground and background precise location: core driver-route tracking while an approved route is active, including when Google Maps is foregrounded.
- Foreground location service on Android: maintains visible route tracking during a vehicle trip.
- Photo library: optional parent or driver profile photo selection. Camera and microphone permissions are blocked.

## Reviewer media still required

- Google background-location declaration video showing steps 1–7 above.
- Google foreground-service declaration video showing the persistent route-tracking notification.
- App Store and Play screenshots captured from the signed production review build.
