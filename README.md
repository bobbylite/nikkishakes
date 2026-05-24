# NikkiShakes SPA (Static)

**Live site: [nikkishakes.com](https://nikkishakes.com)**

NikkiShakes is a pure static single-page app designed to run on GitHub Pages.

## Highlights

- No server required for runtime hosting
- True Single-Page-Application security archiecture 
- Admin and delegated admin governance and access control flows
- Source hosted on GitHub, served via GitHub Pages, secured by Cloudflare (DNS + edge security), with PingOne as the identity provider (FIDO2 passkeys, real-time risk analysis, identity verification, orchestration, and authorization), and Firebase (Google GCP) for data persistence


## Project Layout

- `index.html` SPA shell with all views
- `styles/main.css` visual system and animations
- `scripts/app.js` orchestration layer and event wiring
- `scripts/constants.js` shared constants and route/storage keys
- `scripts/routing.js` hash route parsing and navigation helpers
- `scripts/themeMode.js` theme initialization and toggling
- `scripts/clientAuth.js` Firebase OIDC login/callback/session helpers
- `scripts/pingoneConfig.js` Firebase OIDC provider configuration
- `scripts/domUtils.js` DOM utility and safety helpers
- `scripts/data.js` Firestore data model and normalization
- `login.html` and `admin.html` legacy redirects to SPA routes
- `.github/workflows/pages.yml` automatic GitHub Pages deploy workflow
- `FIREBASE_OIDC_SETUP.md` step-by-step Firebase + PingOne wiring guide

## Local Preview (No Node Required)

You can preview with any static file server.

Option A: Python

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

Option B: VS Code Live Server extension

Serve the repository root and open the generated local URL.

## GitHub Pages Deployment

1. Push this repo to GitHub.
2. In repository settings, enable Pages and choose GitHub Actions as the source.
3. The workflow at `.github/workflows/pages.yml` deploys automatically on pushes to `main`.

## Firebase + PingOne Setup

Follow `FIREBASE_OIDC_SETUP.md` for the full checklist. At minimum:

1. Configure OpenID Connect provider in Firebase Authentication.
2. Ensure your PingOne OIDC app includes scope `shakes`.
3. Set `firebaseProviderId` in `scripts/pingoneConfig.js`.
4. Publish Firestore rules that enforce authenticated writes.
5. Deploy and test login at `#/login`.

## Security Note

The UI can hide controls, but Firestore rules are the real security boundary.

- Require Firebase Authentication for writes.
- Enforce role checks in Firestore rules and/or custom claims for `shakesAdmin`.
