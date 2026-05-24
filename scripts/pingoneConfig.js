const originPath = `${window.location.origin}${window.location.pathname}`;

export const pingOneConfig = {
  // Set true after configuring Firebase Authentication OpenID Connect provider.
  enabled: true,

  // Login UX mode:
  // - "auto": popup first, then redirect fallback
  // - "popup": popup only
  // - "redirect": redirect only
  loginMode: "auto",

  // Must match provider id configured in Firebase Auth (Authentication > Sign-in method > OpenID Connect).
  firebaseProviderId: "oidc.pingone",

  // Include custom API scope so PingOne access token carries groups for this app.
  scopes: "openid profile email shakes",

  // Client-side UX gate; Firestore rules should also enforce this role.
  requiredAdminGroup: "shakesAdmin",

  // Retained for local reference in docs only.
  issuerBaseUrl: "https://auth.pingone.com/c74a4945-1364-4966-9a68-abeaa3e7b767/as",
  redirectUri: originPath
};
