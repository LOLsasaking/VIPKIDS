# VIP Kids Transportation — Supabase production migration

Supabase is the intended production identity and data platform. The existing
FastAPI/MongoDB service remains available only as a temporary compatibility API
until the Supabase project, RLS policies, and Edge Functions pass end-to-end
testing. Do not enter real child data into both systems.

This directory contains the production database design for VIP Kids Transportation.
It uses Supabase Auth for sign-in and Postgres Row Level Security (RLS) for data
access. Never place the Supabase `service_role` key in the mobile app.

## Apply the database migration

1. Create a new Supabase project in the organization that owns VIP Kids.
2. Confirm the target has no legacy `public` tables with incompatible `text`/
   `jsonb` identifiers. Run this read-only preflight before migration:

   ```sql
   select table_name,
          string_agg(column_name || ':' || udt_name, ', ' order by ordinal_position) as columns
   from information_schema.columns
   where table_schema = 'public'
   group by table_name
   order by table_name;
   ```

   If old VIP Kids tables exist, archive/migrate them under a separate locked
   schema or use a clean project. Do not drop or rename them without an approved
   data-retention decision and a verified backup.
3. Apply both migrations in filename order (`supabase db push` after linking is
   preferred so migration history is recorded).
4. In **Authentication > Providers**, enable email/password and disable public
   sign-ups if VIP Kids will only approve invited families. If public requests are
   desired, enable sign-ups but keep every new `profiles.status` as `pending`.
5. Set the site URL and mobile redirect URL to the real VIP Kids domains/scheme.
6. Store the project URL and anon key in the mobile build environment only. Store
   the service-role key only in a server-side Edge Function or trusted backend.

Both migrations are transactional and safe to rerun. Duplicate enum, table,
index, policy, bucket, and Realtime-publication operations are handled
idempotently; an unexpected error rolls back the current migration.

## Deploy the production functions

Install and authenticate the Supabase CLI, link this repository to the project,
then configure the function secrets and deploy:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set ALLOWED_ORIGINS=https://YOUR_PUBLIC_WEB_DOMAIN
supabase secrets set GOOGLE_ROUTES_API_KEY=YOUR_SERVER_RESTRICTED_KEY
supabase secrets set EXPO_ACCESS_TOKEN=YOUR_EXPO_ENHANCED_PUSH_SECURITY_TOKEN
supabase secrets set NOTIFICATION_CRON_SECRET=GENERATE_A_RANDOM_SECRET
supabase secrets set RETENTION_CRON_SECRET=GENERATE_A_DIFFERENT_RANDOM_SECRET
supabase functions deploy api
supabase functions deploy routing
supabase functions deploy process-notifications
supabase functions deploy purge-expired-data
```

Schedule `process-notifications` every minute and `purge-expired-data` daily using
Supabase Cron with their corresponding `x-cron-secret` headers. Store the project
URL and cron secrets in Supabase Vault rather than writing them in migration SQL.
Restrict the Google routing key to the Routes API and the production project; do
not place it in EAS or the APK. Enable Expo enhanced push security so the worker's
access token is required, and monitor push receipts for delivery failures.

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
EXPO_PUBLIC_BACKEND_MODE=supabase
EXPO_PUBLIC_ROUTING_ENDPOINT=https://YOUR-PROJECT.supabase.co/functions/v1/routing
EXPO_PUBLIC_PRIVACY_CONTACT=gonxander@gmail.com
GOOGLE_MAPS_ANDROID_API_KEY=YOUR_RESTRICTED_ANDROID_MAPS_SDK_KEY
```

`GOOGLE_MAPS_ANDROID_API_KEY` is an EAS build-time secret, not an
`EXPO_PUBLIC_*` runtime value. Restrict it to Maps SDK for Android, package
`com.vipkidstransportation.app`, and the correct EAS/Play signing SHA-1 values.
The existing FastAPI API remains only a temporary compatibility layer. The app
switches auth/data to Supabase when these project values and functions are present.
