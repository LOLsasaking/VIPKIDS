# VIP Kids Transportation — Supabase production setup

This directory contains the production database design for VIP Kids Transportation.
It uses Supabase Auth for sign-in and Postgres Row Level Security (RLS) for data
access. Never place the Supabase `service_role` key in the mobile app.

## Apply the database migration

1. Create a new Supabase project in the organization that owns VIP Kids.
2. In the Supabase SQL Editor, paste and run `migrations/20260723_initial_production_schema.sql`.
3. In **Authentication > Providers**, enable email/password and disable public
   sign-ups if VIP Kids will only approve invited families. If public requests are
   desired, enable sign-ups but keep every new `profiles.status` as `pending`.
4. Set the site URL and mobile redirect URL to the real VIP Kids domains/scheme.
5. Store the project URL and anon key in the mobile build environment only. Store
   the service-role key only in a server-side Edge Function or trusted backend.

## Required Edge Functions / trusted server jobs

RLS keeps direct app access private. The following privileged actions must run in
an Edge Function or another trusted server using the service-role key:

- approve, suspend, or delete accounts;
- create a restricted child login after verified parent consent;
- assign a child to a driver, vehicle, and route;
- send Expo/FCM/APNs notifications after attendance, delay, emergency, or
  compliance events;
- generate compliance-expiration reminders;
- remove expired live locations and route geometry according to the retention
  policy;
- validate that live location writes occur only from an on-duty assigned driver.

## Mobile environment variables

Copy the values into EAS Secrets or your CI environment. Do not commit real
credentials to `.env` files.

```text
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
EXPO_PUBLIC_BACKEND_URL=https://api.your-vipkids-domain.com
EXPO_PUBLIC_ROUTING_BASE_URL=https://your-approved-routing-service.example
EXPO_PUBLIC_PRIVACY_CONTACT=privacy@your-vipkids-domain.com
```

The existing FastAPI API can remain in place during migration. Switch the app to
Supabase only after the Edge Functions have replaced each required API operation
and end-to-end testing confirms authorization and notification delivery.
