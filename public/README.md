# Public web pages (store-required URLs)

Four static pages are prepared for the store listing and customer support:

| File | Purpose | Required by |
|---|---|---|
| `privacy.html` | Privacy policy (same wording as the in-app `app/privacy.tsx`) | Apple + Google |
| `delete-account.html` | Public account/data deletion request page | Google |
| `terms.html` | Draft terms for legal review | Apple + Google listing/support |
| `support.html` | Public support and emergency guidance | Apple + Google |

## Before publishing — verify the support mailbox
The current support and privacy contact is **`gonxander@gmail.com`**. Confirm it
is monitored, protected with MFA, and appropriate for public customer support;
replace it with a dedicated business mailbox if one is created.

Keep the wording in `privacy.html` in sync with `frontend/app/privacy.tsx` — the in-app screen is
the source of truth.

## Hosting (any static host works — no build step)
All four files are self-contained: no JS, no external requests, light/dark aware,
and mobile responsive. A reviewed workflow template is at
`docs/public-pages-workflow.yml`; copy it to
`.github/workflows/public-pages.yml` only after legal approval, then merge the
reviewed public pages to `main`.

**Vercel** (from the repo root):
```bash
npx vercel --prod public
```

**GitHub Pages:** push the repo, then Settings → Pages → deploy from branch, folder `/public`.

Resulting URLs to paste into App Store Connect / Play Console:
- `https://<your-domain>/privacy.html`
- `https://<your-domain>/delete-account.html`
- `https://<your-domain>/terms.html`
- `https://<your-domain>/support.html`

## Store reviewer accounts
Reviewers need permanent synthetic accounts in the **production review**
environment. Create separate parent, child, driver, and administrator users in
Supabase, give each a unique 12+ character password, and wire the synthetic child
to the synthetic parent/driver/vehicle/route. Keep in-app demo buttons disabled in
production and never give reviewers a real administrator account or real child
records. Record the final credentials in App Store Connect and Play Console—not
in this repository.
