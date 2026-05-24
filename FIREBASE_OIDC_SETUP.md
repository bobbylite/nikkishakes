# Firebase OIDC Setup (PingOne)

This guide wires NikkiShakes to Firebase Authentication using your existing PingOne OIDC app.

## Goal

- Use Firebase Auth for sign-in state.
- Use PingOne OIDC as the identity provider.
- Keep `shakes` scope so PingOne access token includes a `groups` array.
- Enforce write authorization in Firestore rules.

## 1. Configure Firebase Authentication

1. Open Firebase Console for project `nikkishakes-cbe23`.
2. Go to **Authentication** -> **Sign-in method**.
3. Enable **OpenID Connect** provider.
4. Create provider with:
   - Provider ID: `pingone` (or your preferred id)
   - Issuer: your PingOne AS issuer (example: `https://auth.pingone.com/<env-id>/as`)
   - Client ID / Client Secret: from your existing PingOne OIDC app
5. Save.

Notes:
- Firebase provider id used in app code must be `oidc.<provider-id>`.
- If Provider ID is `pingone`, app config uses `oidc.pingone`.

## 2. Configure PingOne OIDC App

In PingOne app settings, ensure these are set:

1. Redirect URIs include Firebase handler URLs:
   - `https://<your-project-id>.firebaseapp.com/__/auth/handler`
   - `https://<your-project-id>.web.app/__/auth/handler`
2. Scope includes:
   - `openid profile email shakes`
3. Access token includes `groups` claim for users.

## 3. Configure App File

Edit `scripts/pingoneConfig.js`:

- `enabled: true`
- `firebaseProviderId: "oidc.pingone"` (replace if you used a different provider id)
- `scopes: "openid profile email shakes"`
- `requiredAdminGroup: "shakesAdmin"`

## 4. Firestore Rules

Use Firestore rules as the enforcement boundary.

### Minimum safe baseline

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /shakes/{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

### Admin-only writes (recommended)

Use this only after `groups` is present in Firebase auth token claims:

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /shakes/{document=**} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.token.groups is list
        && request.auth.token.groups.hasAny(['shakesAdmin']);
    }
  }
}
```

Important:
- Firestore rules evaluate Firebase token claims (`request.auth.token.*`).
- If PingOne `groups` only exists in the OAuth access token but not Firebase token claims, map it into Firebase claims before using the admin-only rule.

## 5. Validate End-to-End

1. Run local app:

```bash
python3 -m http.server 8080
```

2. Open `http://localhost:8080/#/login`.
3. Sign in via PingOne.
4. Confirm admin page loads.
5. Test add/update/delete:
   - Authorized users in `shakesAdmin` should succeed.
   - Non-members should be blocked by UI and by Firestore rules (once rules are claim-based).

## 6. Troubleshooting

- Error: `auth/operation-not-allowed`
  - OIDC provider not enabled in Firebase Authentication.

- Login redirects but app stays logged out
  - Provider ID mismatch (`oidc.<provider-id>` in app does not match Firebase provider id).

- Writes fail with `permission-denied`
  - Firestore rules are stricter than current auth token claims.
  - Verify `request.auth != null` baseline first.
  - Then confirm `groups` exists in `request.auth.token` before enabling group-based rules.

- No `groups` in Firebase token claims
  - Keep baseline rule temporarily.
  - Add claim mapping flow, then switch to admin-only rule.
