const originPath = `${window.location.origin}${window.location.pathname}`;

export const pingOneConfig = {
  // Set true after configuring Firebase Authentication OpenID Connect provider.
  enabled: true,

  // Login UX mode:
  // - "redirect": PKCE redirect directly to PingOne (works on any domain)
  // - "popup": Firebase popup (requires same-origin authDomain for reliable redirect)
  // - "auto": popup first, PKCE redirect fallback if popup is blocked
  loginMode: "redirect",

  // Client ID of the PingOne Single Page Application configured for PKCE.
  // The app's redirectUri below must be added as an allowed redirect URI in PingOne.
  clientId: "f3525182-4238-4a46-91b2-6f3ef402787d",

  // Must match provider id configured in Firebase Auth (Authentication > Sign-in method > OpenID Connect).
  firebaseProviderId: "oidc.pingone",

  // Include custom API scope so PingOne access token carries groups for this app.
  scopes: "openid profile email shakes",

  // Client-side UX gate; Firestore rules should also enforce this role.
  requiredAdminGroup: "shakesAdmin",

  // Retained for local reference in docs only.
  issuerBaseUrl: "https://auth.pingone.com/c74a4945-1364-4966-9a68-abeaa3e7b767/as",
  signoffEndpoint: "https://auth.pingone.com/c74a4945-1364-4966-9a68-abeaa3e7b767/as/signoff",
  postLogoutRedirectUri: originPath,
  redirectUri: originPath
};
