# VIP KIDS — deploy backend + build the APK

Two parts: (1) put the backend on a public HTTPS URL, (2) build an installable
Android APK that points at it. Push notifications work once both are done.

## 1. MongoDB (free)
1. Create a free cluster at https://www.mongodb.com/atlas (M0 tier).
2. Database Access → add a user + password.
3. Network Access → allow `0.0.0.0/0` (any IP) so the host can connect.
4. Copy the connection string: `mongodb+srv://USER:PASSWORD@cluster.xxxx.mongodb.net/`

## 2. Backend → Render (free)
1. Push this repo to GitHub (already done: `codex/vipkids-demo-fleet-publish`).
2. Render → New + → **Blueprint** → connect the repo. It reads `render.yaml`.
3. Fill the secret env vars when prompted:
   - `MONGO_URL` = the Atlas string from step 1
   - `ADMIN_EMAIL` = your admin email
   - `ADMIN_PASSWORD` = 12+ characters
   (`JWT_SECRET` is generated for you; `ENVIRONMENT`, `DB_NAME`, `ALLOWED_ORIGINS` are preset.)
4. Deploy. When live, note the URL, e.g. `https://vipkids-backend.onrender.com`.
5. Verify: open `https://<your-url>/api/health/ready` → `{"status":"ready"}`.

> The native app does not use CORS, so `ALLOWED_ORIGINS` only needs to be a valid
> `https://` value (already set). Only a future **web** build would need the real origin.

## 3. APK build (EAS)
Run from `frontend/`:
```bash
npm i -g eas-cli          # if not installed
eas login                 # your Expo account
eas init                  # creates the projectId (needed for push notifications)
```
Set the backend URL the app ships with (either edit `frontend/.env` or export it):
```bash
echo "EXPO_PUBLIC_BACKEND_URL=https://<your-render-url>" > .env
```
Build the APK:
```bash
eas build -p android --profile preview
```
On the first Android build EAS will offer to set up push credentials (FCM) — accept
the managed setup. When it finishes, EAS prints a download link for the `.apk` you
can install on any phone.

## 4. Test push
- Install the APK on 2 phones. Sign in as **Parent** on one, **Driver** on the other.
- Driver: complete the checklist → **Start Route** → tap **Picked up / Arrived at school**.
- The parent phone gets a push: "Ari has been picked up", "Ari arrived at school", etc.
