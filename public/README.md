# Public web pages (store-required URLs)

Two static pages the app stores require to be publicly reachable:

| File | Purpose | Required by |
|---|---|---|
| `privacy.html` | Privacy policy (same wording as the in-app `app/privacy.tsx`) | Apple + Google |
| `delete-account.html` | Public account/data deletion request page | Google |

## Before publishing — replace the placeholder email
Both pages use **`privacy@vipkidstransportation.com`**. Swap it for the real address:

```bash
cd public && sed -i '' 's/privacy@vipkidstransportation.com/YOUR@EMAIL.com/g' *.html
```

Keep the wording in `privacy.html` in sync with `frontend/app/privacy.tsx` — the in-app screen is
the source of truth.

## Hosting (any static host works — no build step)
Both files are self-contained: no JS, no external requests, light/dark aware, mobile responsive.

**Vercel** (from the repo root):
```bash
npx vercel --prod public
```

**GitHub Pages:** push the repo, then Settings → Pages → deploy from branch, folder `/public`.

Resulting URLs to paste into App Store Connect / Play Console:
- `https://<your-domain>/privacy.html`
- `https://<your-domain>/delete-account.html`

## Store reviewer demo accounts
Reviewers need working logins against the **live** backend. Demo accounts are off in production by
default; enable them deliberately on the deployed backend:

```
ENABLE_DEMO_ACCOUNTS=true
DEMO_PASSWORD=<a strong password you give the reviewers>
```

Seeded logins (`backend/server.py` → `ensure_development_demo_accounts`):
`parent.demo@vipkidstest.com`, `driver.demo@vipkidstest.com`, `child.demo@vipkidstest.com`,
`admin.demo@vipkidstest.com` — all using `DEMO_PASSWORD`, no OTP, non-expiring, with fake
children/routes. Never give reviewers a real administrator account.
