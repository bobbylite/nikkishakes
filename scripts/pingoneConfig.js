const originPath = `${window.location.origin}${window.location.pathname}`;

export const pingOneConfig = {
  // Set true after filling in your client + tenant details below.
  enabled: true,

  // Preferred: provide issuerBaseUrl, then authorize/token are auto-derived.
  // Example (PingOne AIC): https://<tenant>/am/oauth2/realms/root/realms/<realm>
  issuerBaseUrl: "",

  // Optional endpoint overrides.
  authorizeEndpoint: "https://auth.pingone.com/c74a4945-1364-4966-9a68-abeaa3e7b767/as/authorize",
  tokenEndpoint: "https://auth.pingone.com/c74a4945-1364-4966-9a68-abeaa3e7b767/as/token",
  introspectionEndpoint: "https://auth.pingone.com/c74a4945-1364-4966-9a68-abeaa3e7b767/as/introspect",
  endSessionEndpoint: "https://auth.pingone.com/c74a4945-1364-4966-9a68-abeaa3e7b767/as/signoff",

  clientId: "f7383847-2e3f-4dc5-a98b-19841f5ff1a3",

  // For GitHub Pages SPA callback, keep this as your deployed index URL.
  redirectUri: originPath,

  // Optional logout return route.
  postLogoutRedirectUri: `${originPath}#/login?loggedOut=1`,

  scopes: "openid profile email shakes"
};
