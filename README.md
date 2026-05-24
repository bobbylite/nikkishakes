# NikkiShakes SPA (Static)

NikkiShakes is now a pure static single-page app designed to run on GitHub Pages.

## Highlights

- No Node server required for runtime hosting
- Hash-based SPA routes: `#/rankings`, `#/login`, `#/admin`
- Bootstrap 5 UI with animated pastel light/dark themes
- Rankings data stored in browser localStorage
- PingOne admin login via OAuth 2.0 Authorization Code + PKCE (browser-only)

## Project Layout

- `index.html` SPA shell with all views
- `styles/main.css` visual system and animations
- `scripts/app.js` orchestration layer and event wiring
- `scripts/constants.js` shared constants and route/storage keys
- `scripts/routing.js` hash route parsing and navigation helpers
- `scripts/themeMode.js` theme initialization and toggling
- `scripts/clientAuth.js` PingOne PKCE login/callback/session helpers
- `scripts/pingoneConfig.js` PingOne client configuration for static hosting
- `scripts/domUtils.js` DOM utility and safety helpers
- `scripts/data.js` localStorage data model and normalization
- `login.html` and `admin.html` legacy redirects to SPA routes
- `.github/workflows/pages.yml` automatic GitHub Pages deploy workflow

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

## PingOne Setup (Static SPA)

1. Open `scripts/pingoneConfig.js` and set:
	- `enabled: true`
	- `issuerBaseUrl` or explicit authorize/token endpoints
	- `clientId`
2. In PingOne app settings:
	- Configure redirect URI to your deployed GitHub Pages URL (same value as `redirectUri`)
	- Use a public client/SPA-style registration with PKCE
	- Ensure token endpoint CORS supports your Pages origin
3. Deploy and test login at `#/login`.

## Security Note

This uses browser-based OAuth for static hosting convenience.

- Tokens are held in browser session storage.
- For highest-security admin controls, a backend BFF remains the preferred architecture.
