# Repository guidance

Use [docs/testing.md](docs/testing.md) for required checks. Never run destructive
backend integration tests against production, commit real child/route data, or
place Supabase service-role, Expo push, Google Maps, APNs, or FCM secrets in the
mobile source or Git history.
